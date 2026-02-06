const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT || 5000);
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, "../data/barbersaas-db.json");

const AUTOMATION_INTERVAL_MS = Number(process.env.AUTOMATION_INTERVAL_MS || 60000);
const WHATSAPP_PROVIDER = String(process.env.WHATSAPP_PROVIDER || "log").toLowerCase();
const WHATSAPP_DEFAULT_COUNTRY = String(process.env.WHATSAPP_DEFAULT_COUNTRY || "55");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "";

const DEFAULT_DB = {
  services: [],
  barbers: [],
  clients: [],
  appointments: [],
  monthlyGoal: 20000
};

let dbCache = null;
let writeLock = Promise.resolve();
let automationTimer = null;
let automationRunning = false;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function toDbSnapshot(candidate) {
  const data = candidate || {};
  return {
    services: Array.isArray(data.services) ? data.services : [],
    barbers: Array.isArray(data.barbers) ? data.barbers : [],
    clients: Array.isArray(data.clients) ? data.clients : [],
    appointments: Array.isArray(data.appointments) ? data.appointments : [],
    monthlyGoal: Number.isFinite(Number(data.monthlyGoal)) ? Number(data.monthlyGoal) : 20000
  };
}

function resolveWhatsappProvider() {
  if (
    WHATSAPP_PROVIDER === "twilio" &&
    TWILIO_ACCOUNT_SID &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_WHATSAPP_FROM
  ) {
    return "twilio";
  }
  return "log";
}

function toWhatsappE164(rawPhone) {
  const digits = normalizePhone(rawPhone);
  if (!digits) return "";

  const withCountry = digits.startsWith(WHATSAPP_DEFAULT_COUNTRY)
    ? digits
    : `${WHATSAPP_DEFAULT_COUNTRY}${digits}`;

  if (withCountry.length < 12) return "";
  return `+${withCountry}`;
}

function appointmentStartAt(appointment) {
  if (!appointment?.date || !appointment?.time) return null;
  const dt = new Date(`${appointment.date}T${appointment.time}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function ensureAutomationMeta(appointment) {
  if (!appointment.automationMeta || typeof appointment.automationMeta !== "object") {
    appointment.automationMeta = {};
  }
  if (!Array.isArray(appointment.automationMeta.events)) {
    appointment.automationMeta.events = [];
  }
  return appointment.automationMeta;
}

function pushAutomationEvent(meta, event) {
  meta.events.unshift({
    at: new Date().toISOString(),
    ...event
  });
  if (meta.events.length > 25) {
    meta.events.length = 25;
  }
}

function buildMessage(kind, appointment) {
  const client = appointment.clientName || "Cliente";
  const service = appointment.serviceName || "servico";
  const barber = appointment.barberName || "seu barbeiro";
  const date = appointment.date || "data";
  const time = appointment.time || "horario";

  if (kind === "confirmation") {
    return [
      `Ola, ${client}!`,
      "Seu agendamento BARBERSAAS foi confirmado.",
      `Servico: ${service}`,
      `Barbeiro: ${barber}`,
      `Data: ${date} as ${time}`
    ].join("\n");
  }

  if (kind === "reminder") {
    return [
      `Lembrete, ${client}!`,
      "Seu atendimento acontece em aproximadamente 2 horas.",
      `Servico: ${service}`,
      `Barbeiro: ${barber}`,
      `Horario: ${date} ${time}`
    ].join("\n");
  }

  return [
    `Obrigado por vir, ${client}!`,
    "Esperamos que tenha gostado da experiencia.",
    "Quando puder, avalie seu atendimento com 1 a 5 estrelas no app.",
    `Barbeiro: ${barber}`
  ].join("\n");
}

async function sendViaTwilio(toE164, message) {
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const body = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: `whatsapp:${toE164}`,
    Body: message
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();
  return {
    provider: "twilio",
    messageId: json.sid || null
  };
}

async function sendViaLog(toE164, message) {
  console.log("[WHATSAPP-LOG]", { to: toE164, message });
  return {
    provider: "log",
    messageId: `log-${Date.now()}`
  };
}

async function sendWhatsappMessage({ to, message }) {
  const toE164 = toWhatsappE164(to);
  if (!toE164) {
    return { ok: false, error: "invalid_phone" };
  }

  try {
    const provider = resolveWhatsappProvider();
    const result = provider === "twilio"
      ? await sendViaTwilio(toE164, message)
      : await sendViaLog(toE164, message);

    return {
      ok: true,
      to: toE164,
      provider: result.provider,
      messageId: result.messageId
    };
  } catch (error) {
    console.error("Falha no envio WhatsApp:", error.message);
    return { ok: false, error: error.message };
  }
}

function shouldSendConfirmation(appointment) {
  const meta = ensureAutomationMeta(appointment);
  return !meta.confirmationSentAt && ["pending", "confirmed"].includes(appointment.status);
}

function shouldSendReminder(appointment, now) {
  const meta = ensureAutomationMeta(appointment);
  if (meta.reminderSentAt) return false;
  if (!["pending", "confirmed"].includes(appointment.status)) return false;

  const startAt = appointmentStartAt(appointment);
  if (!startAt) return false;

  const twoHoursBefore = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);
  return now >= twoHoursBefore && now < startAt;
}

function shouldSendPostService(appointment) {
  const meta = ensureAutomationMeta(appointment);
  return !meta.postServiceSentAt && appointment.status === "completed";
}

async function executeAutomationForAppointment(appointment, kind) {
  const meta = ensureAutomationMeta(appointment);
  const message = buildMessage(kind, appointment);
  const result = await sendWhatsappMessage({
    to: appointment.clientPhone,
    message
  });

  if (result.ok) {
    const sentAt = new Date().toISOString();

    if (kind === "confirmation") {
      meta.confirmationSentAt = sentAt;
      meta.confirmationMessageId = result.messageId || null;
    }
    if (kind === "reminder") {
      meta.reminderSentAt = sentAt;
      meta.reminderMessageId = result.messageId || null;
    }
    if (kind === "post_service") {
      meta.postServiceSentAt = sentAt;
      meta.postServiceMessageId = result.messageId || null;
    }

    pushAutomationEvent(meta, {
      kind,
      success: true,
      provider: result.provider,
      messageId: result.messageId
    });
    return true;
  }

  pushAutomationEvent(meta, {
    kind,
    success: false,
    error: result.error || "send_failed"
  });
  return true;
}

async function runAutomationCycle(trigger = "worker") {
  if (automationRunning) return;
  automationRunning = true;

  try {
    const db = await loadDb();
    const now = new Date();
    let changed = false;

    for (const appointment of db.appointments) {
      if (shouldSendConfirmation(appointment)) {
        changed = (await executeAutomationForAppointment(appointment, "confirmation")) || changed;
      }
      if (shouldSendReminder(appointment, now)) {
        changed = (await executeAutomationForAppointment(appointment, "reminder")) || changed;
      }
      if (shouldSendPostService(appointment)) {
        changed = (await executeAutomationForAppointment(appointment, "post_service")) || changed;
      }
    }

    if (changed) {
      await saveDb(db);
      console.log(`[AUTOMATION] atualizado via ${trigger}`);
    }
  } catch (error) {
    console.error("Falha no ciclo de automacao", error);
  } finally {
    automationRunning = false;
  }
}

function startAutomationWorker() {
  if (automationTimer) return;
  automationTimer = setInterval(() => {
    void runAutomationCycle("interval");
  }, AUTOMATION_INTERVAL_MS);
  void runAutomationCycle("startup");
}

async function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
  }
}

async function loadDb() {
  if (dbCache) return dbCache;
  await ensureDbFile();
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    dbCache = toDbSnapshot(JSON.parse(raw));
  } catch {
    dbCache = { ...DEFAULT_DB };
  }
  return dbCache;
}

async function saveDb(nextDb) {
  const snapshot = toDbSnapshot(nextDb);
  dbCache = snapshot;

  writeLock = writeLock.then(async () => {
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
    await fs.rename(tmpPath, DB_PATH);
  });

  await writeLock;
  return snapshot;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

app.get("/health", async (_req, res) => {
  const db = await loadDb();
  const provider = resolveWhatsappProvider();

  res.json({
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    whatsapp: {
      provider,
      intervalMs: AUTOMATION_INTERVAL_MS
    },
    counts: {
      services: db.services.length,
      barbers: db.barbers.length,
      clients: db.clients.length,
      appointments: db.appointments.length
    }
  });
});

app.get("/automation/status", async (_req, res) => {
  const db = await loadDb();
  const sent = db.appointments.reduce(
    (acc, appointment) => {
      const meta = appointment.automationMeta || {};
      if (meta.confirmationSentAt) acc.confirmation += 1;
      if (meta.reminderSentAt) acc.reminder += 1;
      if (meta.postServiceSentAt) acc.postService += 1;
      return acc;
    },
    { confirmation: 0, reminder: 0, postService: 0 }
  );

  res.json({
    ok: true,
    provider: resolveWhatsappProvider(),
    sent
  });
});

app.get("/automation/logs", async (req, res) => {
  const limit = Math.max(1, Math.min(300, Number(req.query.limit || 80)));
  const db = await loadDb();
  const logs = [];

  db.appointments.forEach((appointment) => {
    const events = appointment?.automationMeta?.events;
    if (!Array.isArray(events)) return;

    events.forEach((event) => {
      logs.push({
        appointmentId: appointment.id,
        clientName: appointment.clientName,
        clientPhone: appointment.clientPhone,
        barberName: appointment.barberName,
        date: appointment.date,
        time: appointment.time,
        status: appointment.status,
        at: event.at,
        kind: event.kind,
        success: Boolean(event.success),
        provider: event.provider || resolveWhatsappProvider(),
        messageId: event.messageId || null,
        error: event.error || null
      });
    });
  });

  logs.sort((a, b) => new Date(b.at) - new Date(a.at));

  res.json({
    ok: true,
    logs: logs.slice(0, limit)
  });
});

app.get("/bootstrap", async (_req, res) => {
  const db = await loadDb();
  res.json(db);
});

app.post("/sync/bulk", async (req, res) => {
  const incoming = req.body?.data;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ ok: false, error: "Payload invalido. Esperado { data: {...} }" });
  }

  const current = await loadDb();
  const merged = {
    ...current,
    ...toDbSnapshot(incoming)
  };

  await saveDb(merged);
  void runAutomationCycle("sync_bulk");
  res.json({ ok: true, syncedAt: new Date().toISOString() });
});

app.post("/appointments", async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ ok: false, error: "Payload invalido" });
  }

  const db = await loadDb();
  const created = {
    ...payload,
    id: payload.id || uid("apt"),
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  ensureAutomationMeta(created);

  db.appointments.push(created);
  await saveDb(db);
  void runAutomationCycle("appointment_created");
  res.status(201).json(created);
});

app.patch("/appointments/:id", async (req, res) => {
  const { id } = req.params;
  const patch = req.body || {};
  const db = await loadDb();
  const index = db.appointments.findIndex((item) => String(item.id) === String(id));

  if (index < 0) {
    return res.status(404).json({ ok: false, error: "Agendamento nao encontrado" });
  }

  db.appointments[index] = {
    ...db.appointments[index],
    ...patch,
    id: db.appointments[index].id,
    updatedAt: new Date().toISOString()
  };

  ensureAutomationMeta(db.appointments[index]);

  await saveDb(db);
  void runAutomationCycle("appointment_patch");
  res.json(db.appointments[index]);
});

app.post("/clients/upsert", async (req, res) => {
  const payload = req.body || {};
  const phone = normalizePhone(payload.phone);
  const name = String(payload.name || "").trim();

  if (!name || phone.length < 8) {
    return res.status(400).json({ ok: false, error: "Nome/telefone invalidos" });
  }

  const db = await loadDb();
  const index = db.clients.findIndex((client) => normalizePhone(client.phone) === phone);

  if (index >= 0) {
    db.clients[index] = {
      ...db.clients[index],
      ...payload,
      name,
      phone,
      updatedAt: new Date().toISOString()
    };
  } else {
    db.clients.push({
      ...payload,
      id: payload.id || uid("cli"),
      name,
      phone,
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  await saveDb(db);
  const saved = index >= 0 ? db.clients[index] : db.clients[db.clients.length - 1];
  res.json(saved);
});

app.patch("/barbers/:id", async (req, res) => {
  const { id } = req.params;
  const patch = req.body || {};
  const db = await loadDb();
  const index = db.barbers.findIndex((item) => String(item.id) === String(id));

  if (index < 0) {
    return res.status(404).json({ ok: false, error: "Barbeiro nao encontrado" });
  }

  db.barbers[index] = {
    ...db.barbers[index],
    ...patch,
    id: db.barbers[index].id
  };

  await saveDb(db);
  res.json(db.barbers[index]);
});

app.put("/services", async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ ok: false, error: "Esperado array de servicos" });
  }

  const db = await loadDb();
  db.services = req.body;
  await saveDb(db);
  res.json({ ok: true, count: db.services.length });
});

app.put("/barbers", async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ ok: false, error: "Esperado array de barbeiros" });
  }

  const db = await loadDb();
  db.barbers = req.body;
  await saveDb(db);
  res.json({ ok: true, count: db.barbers.length });
});

app.put("/settings/monthly-goal", async (req, res) => {
  const value = Number(req.body?.monthlyGoal);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ ok: false, error: "monthlyGoal invalido" });
  }

  const db = await loadDb();
  db.monthlyGoal = value;
  await saveDb(db);
  res.json({ ok: true, monthlyGoal: db.monthlyGoal });
});

app.use((error, _req, res, _next) => {
  console.error("Erro interno:", error);
  res.status(500).json({ ok: false, error: "Erro interno no servidor" });
});

async function start() {
  await ensureDbFile();
  startAutomationWorker();

  app.listen(PORT, () => {
    console.log(`[BARBERSAAS API] running on http://127.0.0.1:${PORT}`);
    console.log(`[BARBERSAAS API] db: ${DB_PATH}`);
    console.log(`[BARBERSAAS API] whatsapp provider: ${resolveWhatsappProvider()}`);
  });
}

start().catch((error) => {
  console.error("Falha ao iniciar API", error);
  process.exit(1);
});
