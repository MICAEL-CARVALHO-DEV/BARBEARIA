const STORAGE_KEYS = {
  services: "barbersaas_services",
  barbers: "barbersaas_barbers",
  clients: "barbersaas_clients",
  appointments: "barbersaas_appointments",
  monthlyGoal: "barbersaas_monthly_goal"
};

const API_BASE_URL = "http://127.0.0.1:5000";
const API_MODE_KEY = "barbersaas_api_mode";
const API_TIMEOUT_MS = 7000;
const API_SETTINGS = {
  baseUrl: API_BASE_URL,
  enabled: false
};

const SLOT_TIMES = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"
];

const LEVELS = [
  { name: "Bronze", minCuts: 0, benefit: "Base de beneficios ativa" },
  { name: "Silver", minCuts: 6, benefit: "Prioridade moderada em horarios" },
  { name: "Gold", minCuts: 12, benefit: "Desconto progressivo e mimos" },
  { name: "VIP", minCuts: 20, benefit: "Atendimento exclusivo e prioridade maxima" }
];

const Store = {
  get(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("Falha na leitura", key, error);
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

function parseApiMode() {
  const params = new URLSearchParams(window.location.search);
  const queryMode = params.get("api");
  if (queryMode === "on" || queryMode === "off") {
    localStorage.setItem(API_MODE_KEY, queryMode);
  }
  API_SETTINGS.enabled = localStorage.getItem(API_MODE_KEY) === "on";
}

async function apiRequest(path, { method = "GET", body } = {}) {
  if (!API_SETTINGS.enabled) return null;
  const controller = new AbortController();
  const timeoutRef = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_SETTINGS.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    console.warn("API indisponivel no admin, usando localStorage.", error);
    return null;
  } finally {
    window.clearTimeout(timeoutRef);
  }
}

function apiFireAndForget(path, payload, method = "POST") {
  if (!API_SETTINGS.enabled) return;
  void apiRequest(path, { method, body: payload });
}

function snapshotData() {
  return {
    services: Store.get(STORAGE_KEYS.services, []),
    barbers: Store.get(STORAGE_KEYS.barbers, []),
    clients: Store.get(STORAGE_KEYS.clients, []),
    appointments: Store.get(STORAGE_KEYS.appointments, []),
    monthlyGoal: Store.get(STORAGE_KEYS.monthlyGoal, 20000)
  };
}

function queueApiSync(reason) {
  apiFireAndForget("/sync/bulk", {
    reason,
    emittedAt: new Date().toISOString(),
    data: snapshotData()
  });
}

async function hydrateFromApi() {
  const payload = await apiRequest("/bootstrap");
  if (!payload || typeof payload !== "object") return false;

  if (Array.isArray(payload.services)) Store.set(STORAGE_KEYS.services, payload.services);
  if (Array.isArray(payload.barbers)) Store.set(STORAGE_KEYS.barbers, payload.barbers);
  if (Array.isArray(payload.clients)) Store.set(STORAGE_KEYS.clients, payload.clients);
  if (Array.isArray(payload.appointments)) Store.set(STORAGE_KEYS.appointments, payload.appointments);
  if (Number.isFinite(Number(payload.monthlyGoal))) Store.set(STORAGE_KEYS.monthlyGoal, Number(payload.monthlyGoal));

  return true;
}

const getServices = () => Store.get(STORAGE_KEYS.services, []);
const getBarbers = () => Store.get(STORAGE_KEYS.barbers, []);
const getClients = () => Store.get(STORAGE_KEYS.clients, []);
const getAppointments = () => Store.get(STORAGE_KEYS.appointments, []);
const getMonthlyGoal = () => Number(Store.get(STORAGE_KEYS.monthlyGoal, 20000));

function setServices(value) {
  Store.set(STORAGE_KEYS.services, value);
  queueApiSync("services_update");
}

function setBarbers(value) {
  Store.set(STORAGE_KEYS.barbers, value);
  queueApiSync("barbers_update");
}

function setAppointments(value) {
  Store.set(STORAGE_KEYS.appointments, value);
  queueApiSync("appointments_update");
}

function setMonthlyGoal(value) {
  Store.set(STORAGE_KEYS.monthlyGoal, Number(value));
  queueApiSync("goal_update");
}

function toMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function toDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function todayIso() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfWeek(reference = new Date()) {
  const date = new Date(reference);
  const diff = date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function endOfWeek(reference = new Date()) {
  const start = startOfWeek(reference);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getClientLevel(totalCompletedCuts) {
  const sorted = LEVELS.slice().sort((a, b) => b.minCuts - a.minCuts);
  return sorted.find((level) => totalCompletedCuts >= level.minCuts) || LEVELS[0];
}


function renderSkeleton(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="skeleton-stack">${Array.from({ length: count }).map(() => "<div class='skeleton-card'></div>").join("")}</div>`;
}

function applyStagger(container, itemSelector) {
  if (!container) return;
  container.querySelectorAll(itemSelector).forEach((item, index) => {
    item.classList.add("stagger-item");
    item.style.setProperty("--stagger-index", `${index}`);
  });
}

function animateMetric(target, value, formatter, duration = 720) {
  const element = typeof target === "string" ? document.getElementById(target) : target;
  if (!element) return;

  const safeValue = Number(value || 0);
  const startValue = Number(element.dataset.metricValue || 0);
  const startAt = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - startAt) / duration, 1);
    const eased = 1 - ((1 - progress) ** 3);
    const current = startValue + ((safeValue - startValue) * eased);
    element.textContent = formatter(current);
    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }
    element.dataset.metricValue = `${safeValue}`;
  };

  requestAnimationFrame(tick);
}

function showAdminSkeletons() {
  [
    "admin-upcoming",
    "smart-reports",
    "hourly-bars",
    "business-insights",
    "automation-log-list",
    "admin-service-list",
    "admin-barber-list",
    "finance-list",
    "admin-history-list",
    "client-level-list"
  ].forEach((id) => renderSkeleton(id, 3));
}

function applyFloatBrand() {
  document.querySelectorAll(".brand").forEach((brand) => brand.classList.add("float-soft"));
}

function showToast(message, tone = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${tone}`;
  window.clearTimeout(showToast.timeoutRef);
  showToast.timeoutRef = window.setTimeout(() => {
    toast.className = "toast hidden";
  }, 2500);
}

function switchTab(tabName) {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-tab") === tabName);
  });

  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.classList.add("hidden");
    tab.classList.remove("tab-loading");
  });

  const target = document.getElementById(`tab-${tabName}`);
  target.classList.remove("hidden");
  target.classList.remove("fade-in");
  void target.offsetWidth;
  target.classList.add("fade-in");
  target.classList.add("tab-loading");

  window.clearTimeout(switchTab.timeoutRef);
  switchTab.timeoutRef = window.setTimeout(() => {
    target.classList.remove("tab-loading");
  }, 180);
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function eventKindLabel(kind) {
  if (kind === "confirmation") return "confirmacao";
  if (kind === "reminder") return "lembrete";
  if (kind === "post_service") return "pos-servico";
  return kind || "evento";
}

function eventKindClass(kind) {
  if (kind === "confirmation") return "kind-confirmation";
  if (kind === "reminder") return "kind-reminder";
  if (kind === "post_service") return "kind-post";
  return "";
}

function toDateTimeLabel(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function collectAutomationLogsFromLocal(limit = 80) {
  const events = [];
  getAppointments().forEach((appointment) => {
    const meta = appointment.automationMeta;
    if (!meta || !Array.isArray(meta.events)) return;

    meta.events.forEach((event) => {
      events.push({
        appointmentId: appointment.id,
        clientName: appointment.clientName,
        barberName: appointment.barberName,
        date: appointment.date,
        time: appointment.time,
        status: appointment.status,
        at: event.at,
        kind: event.kind,
        success: Boolean(event.success),
        provider: event.provider || "local-cache",
        messageId: event.messageId || null,
        error: event.error || null
      });
    });
  });

  return events
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

function getCompletedAppointments() {
  return getAppointments().filter((appointment) => appointment.status === "completed");
}

function getRevenue(appointments) {
  return appointments.reduce((total, appointment) => total + Number(appointment.servicePrice || 0), 0);
}

function getAppointmentsInRange(appointments, startDate, endDate, referenceKey = "completedAt") {
  return appointments.filter((appointment) => {
    const targetDate = appointment[referenceKey] ? new Date(appointment[referenceKey]) : new Date(`${appointment.date}T00:00:00`);
    return targetDate >= startDate && targetDate <= endDate;
  });
}

function getOccupiedSlotsForToday() {
  const today = todayIso();
  const barbers = getBarbers();
  const appointments = getAppointments().filter((appointment) => appointment.date === today && ["pending", "confirmed", "completed"].includes(appointment.status));

  let occupied = 0;
  appointments.forEach((appointment) => {
    occupied += Math.ceil(Number(appointment.serviceDuration || 30) / 30);
  });

  let available = 0;
  barbers.forEach((barber) => {
    if (barber.offDays.includes(today)) return;
    const blocked = barber.manualBlocks.filter((block) => block.date === today).length;
    available += Math.max(SLOT_TIMES.length - blocked, 0);
  });

  return {
    occupied,
    available
  };
}

function renderKpis() {
  const completed = getCompletedAppointments();
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const weekStartDate = startOfWeek(now);
  weekStartDate.setHours(0, 0, 0, 0);
  const weekEndDate = endOfWeek(now);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const dailyRevenue = getRevenue(getAppointmentsInRange(completed, todayStart, todayEnd));
  const weeklyRevenue = getRevenue(getAppointmentsInRange(completed, weekStartDate, weekEndDate));
  const monthlyCompleted = getAppointmentsInRange(completed, monthStart, monthEnd);
  const monthlyRevenue = getRevenue(monthlyCompleted);

  const occupancyData = getOccupiedSlotsForToday();
  const occupancyRate = occupancyData.available ? (occupancyData.occupied / occupancyData.available) * 100 : 0;

  const clients = getClients();
  const newClients = clients.filter((client) => {
    const date = new Date(client.createdAt || 0);
    return date >= monthStart && date <= monthEnd;
  }).length;

  animateMetric("kpi-revenue-day", dailyRevenue, (value) => toMoney(value));
  animateMetric("kpi-revenue-week", weeklyRevenue, (value) => toMoney(value));
  animateMetric("kpi-revenue-month", monthlyRevenue, (value) => toMoney(value));
  animateMetric("kpi-services-count", monthlyCompleted.length, (value) => `${Math.round(value)}`);
  animateMetric("kpi-occupancy", Math.round(occupancyRate), (value) => `${Math.round(value)}%`);
  animateMetric("kpi-new-clients", newClients, (value) => `${Math.round(value)}`);
}

function renderUpcomingAppointments() {
  const container = document.getElementById("admin-upcoming");
  const now = new Date();

  const upcoming = getAppointments()
    .filter((appointment) => ["pending", "confirmed"].includes(appointment.status))
    .sort((a, b) => new Date(`${a.date}T${a.time}:00`) - new Date(`${b.date}T${b.time}:00`))
    .filter((appointment) => new Date(`${appointment.date}T${appointment.time}:00`) >= now)
    .slice(0, 8);

  if (!upcoming.length) {
    container.innerHTML = "<p class='empty'>Nenhum agendamento futuro encontrado.</p>";
    return;
  }

  container.innerHTML = upcoming.map((appointment) => `
    <article class="list-card">
      <div class="split-title">
        <strong>${appointment.clientName}</strong>
        <span class="status ${appointment.status}">${appointment.status}</span>
      </div>
      <p class="muted">${appointment.serviceName} - ${appointment.barberName}</p>
      <p class="muted">${toDateLabel(appointment.date)} ${appointment.time}</p>
    </article>
  `).join("");

  applyStagger(container, ".list-card");
}

function renderGoalCard() {
  const monthlyGoal = getMonthlyGoal();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthlyRevenue = getRevenue(getAppointmentsInRange(getCompletedAppointments(), monthStart, monthEnd));
  const percent = monthlyGoal ? Math.min((monthlyRevenue / monthlyGoal) * 100, 100) : 0;

  const ring = document.getElementById("goal-ring");
  ring.style.setProperty("--goal-percent", `${percent}%`);
  document.getElementById("goal-percent").textContent = `${Math.round(percent)}%`;
  document.getElementById("goal-input").value = `${monthlyGoal}`;
  document.getElementById("goal-progress-text").textContent = `${toMoney(monthlyRevenue)} de ${toMoney(monthlyGoal)} | Faltam ${toMoney(Math.max(monthlyGoal - monthlyRevenue, 0))}`;
}

function renderSmartReports() {
  const completed = getCompletedAppointments();
  const reports = document.getElementById("smart-reports");

  if (!completed.length) {
    reports.innerHTML = "<p class='empty'>Sem dados suficientes para relatorios.</p>";
    return;
  }

  const hourMap = {};
  const serviceMap = {};
  const barberMap = {};
  const clientMap = {};

  completed.forEach((appointment) => {
    const hour = appointment.time?.split(":")[0] || "00";
    hourMap[hour] = (hourMap[hour] || 0) + Number(appointment.servicePrice || 0);
    serviceMap[appointment.serviceName] = (serviceMap[appointment.serviceName] || 0) + 1;
    barberMap[appointment.barberName] = (barberMap[appointment.barberName] || 0) + Number(appointment.servicePrice || 0);
    const key = `${appointment.clientName}-${normalizePhone(appointment.clientPhone)}`;
    clientMap[key] = (clientMap[key] || 0) + 1;
  });

  const topHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];
  const topService = Object.entries(serviceMap).sort((a, b) => b[1] - a[1])[0];
  const topBarber = Object.entries(barberMap).sort((a, b) => b[1] - a[1])[0];
  const topClient = Object.entries(clientMap).sort((a, b) => b[1] - a[1])[0];

  reports.innerHTML = `
    <article class="report-card"><p>Horario mais lucrativo</p><strong>${topHour ? `${topHour[0]}h` : "-"}</strong></article>
    <article class="report-card"><p>Servico mais vendido</p><strong>${topService ? topService[0] : "-"}</strong></article>
    <article class="report-card"><p>Barbeiro mais produtivo</p><strong>${topBarber ? topBarber[0] : "-"}</strong></article>
    <article class="report-card"><p>Cliente recorrente</p><strong>${topClient ? topClient[0].split("-")[0] : "-"}</strong></article>
  `;

  applyStagger(reports, ".report-card");
}

function renderHourlyBars() {
  const bars = document.getElementById("hourly-bars");
  const completed = getCompletedAppointments();

  if (!completed.length) {
    bars.innerHTML = "<p class='empty'>Sem dados para grafico.</p>";
    return;
  }

  const grouped = {};
  completed.forEach((appointment) => {
    const hour = `${appointment.time.split(":")[0]}h`;
    grouped[hour] = (grouped[hour] || 0) + Number(appointment.servicePrice || 0);
  });

  const items = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  const maxValue = Math.max(...items.map((item) => item[1]), 1);

  bars.innerHTML = items.map(([label, value]) => `
    <div class="bar-line">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max((value / maxValue) * 100, 8)}%"></div></div>
      <strong>${toMoney(value)}</strong>
    </div>
  `).join("");

  applyStagger(bars, ".bar-line");
}

function renderBusinessInsights() {
  const container = document.getElementById("business-insights");
  const appointments = getAppointments();
  const completed = getCompletedAppointments();
  const insights = [];

  const byWeekday = {};
  appointments.forEach((appointment) => {
    const day = new Date(`${appointment.date}T00:00:00`).getDay();
    byWeekday[day] = (byWeekday[day] || 0) + 1;
  });
  const avgByDay = Object.values(byWeekday).reduce((acc, value) => acc + value, 0) / Math.max(Object.values(byWeekday).length, 1);
  if ((byWeekday[5] || 0) < avgByDay * 0.8) {
    insights.push("Sexta-feira esta abaixo da ocupacao media. Considere promocao para barba e combo.");
  }

  const payments = { Pix: 0, Presencial: 0, Cartao: 0 };
  completed.forEach((appointment) => {
    const method = appointment.paymentMethod || "Presencial";
    if (!payments[method]) payments[method] = 0;
    payments[method] += 1;
  });
  const completedCount = Math.max(completed.length, 1);
  if ((payments.Pix || 0) / completedCount < 0.35) {
    insights.push("Baixa adesao ao Pix. Ofereca cashback ou desconto para aumentar margem.");
  }

  const lowRatings = completed.filter((appointment) => Number.isFinite(appointment.rating) && appointment.rating <= 3);
  if (lowRatings.length >= 2) {
    insights.push("Avaliacoes abaixo de 4 estao crescendo. Reforce padrao de atendimento e feedback interno.");
  }

  if (!insights.length) {
    insights.push("Operacao saudavel. Continue monitorando metas semanais e taxa de retorno.");
  }

  container.innerHTML = insights.map((text) => `<article class="list-card"><p>${text}</p></article>`).join("");
  applyStagger(container, ".list-card");
}

function renderServiceManagement() {
  const container = document.getElementById("admin-service-list");
  const services = getServices();

  if (!services.length) {
    container.innerHTML = "<p class='empty'>Nenhum servico cadastrado.</p>";
    return;
  }

  container.innerHTML = services.map((service) => `
    <article class="list-card compact-row">
      <div>
        <strong>${service.name}</strong>
        <p class="muted">${service.description}</p>
        <p class="muted">${service.duration} min - ${toMoney(service.price)}</p>
      </div>
      <button class="btn-ghost danger" data-remove-service="${service.id}">Remover</button>
    </article>
  `).join("");

  applyStagger(container, ".list-card");

  container.querySelectorAll("[data-remove-service]").forEach((button) => {
    button.addEventListener("click", () => {
      const serviceId = button.getAttribute("data-remove-service");
      const next = getServices().filter((service) => service.id !== serviceId);
      setServices(next);
      apiFireAndForget("/services", next, "PUT");
      renderAll();
      showToast("Servico removido.", "warning");
    });
  });
}

function renderBarberManagement() {
  const container = document.getElementById("admin-barber-list");
  const barbers = getBarbers();
  const completed = getCompletedAppointments();

  if (!barbers.length) {
    container.innerHTML = "<p class='empty'>Nenhum barbeiro cadastrado.</p>";
    return;
  }

  container.innerHTML = barbers.map((barber) => {
    const barberCompleted = completed.filter((appointment) => appointment.barberId === barber.id);
    const revenue = getRevenue(barberCompleted);
    const ratings = barberCompleted.filter((appointment) => Number.isFinite(appointment.rating)).map((appointment) => appointment.rating);
    const avgRating = ratings.length ? (ratings.reduce((acc, value) => acc + value, 0) / ratings.length).toFixed(1) : Number(barber.baseRating || 0).toFixed(1);

    return `
      <article class="list-card compact-row">
        <div class="row">
          <img src="${barber.photo}" alt="${barber.name}" class="avatar-mini">
          <div>
            <strong>${barber.name}</strong>
            <p class="muted">${barber.specialty}</p>
            <p class="muted">Comissao ${barber.commissionRate}% | Nota ${avgRating} | Receita ${toMoney(revenue)}</p>
          </div>
        </div>
        <button class="btn-ghost danger" data-remove-barber="${barber.id}">Remover</button>
      </article>
    `;
  }).join("");

  applyStagger(container, ".list-card");

  container.querySelectorAll("[data-remove-barber]").forEach((button) => {
    button.addEventListener("click", () => {
      const barberId = button.getAttribute("data-remove-barber");
      const next = getBarbers().filter((barber) => barber.id !== barberId);
      setBarbers(next);
      apiFireAndForget("/barbers", next, "PUT");
      renderAll();
      showToast("Barbeiro removido.", "warning");
    });
  });
}

function renderFinance() {
  const completed = getCompletedAppointments();
  const totals = { Pix: 0, Presencial: 0, Cartao: 0, Total: 0 };
  const list = document.getElementById("finance-list");

  completed.forEach((appointment) => {
    const method = appointment.paymentMethod || "Presencial";
    if (!totals[method]) totals[method] = 0;
    totals[method] += Number(appointment.servicePrice || 0);
    totals.Total += Number(appointment.servicePrice || 0);
  });

  animateMetric("fin-pix", totals.Pix, (value) => toMoney(value));
  animateMetric("fin-cash", totals.Presencial, (value) => toMoney(value));
  animateMetric("fin-card", totals.Cartao, (value) => toMoney(value));
  animateMetric("fin-total", totals.Total, (value) => toMoney(value));

  if (!completed.length) {
    list.innerHTML = "<p class='empty'>Sem movimentacoes concluidas.</p>";
    return;
  }

  list.innerHTML = completed
    .slice()
    .sort((a, b) => new Date(b.completedAt || b.updatedAt) - new Date(a.completedAt || a.updatedAt))
    .map((appointment) => `
      <article class="list-card">
        <div class="split-title">
          <strong>${appointment.clientName}</strong>
          <strong>${toMoney(appointment.servicePrice)}</strong>
        </div>
        <p class="muted">${appointment.serviceName} - ${appointment.barberName}</p>
        <p class="muted">${appointment.paymentMethod} | ${toDateLabel(appointment.date)} ${appointment.time}</p>
      </article>
    `)
    .join("");

  applyStagger(list, ".list-card");
}

function renderHistory() {
  const historyContainer = document.getElementById("admin-history-list");
  const levelContainer = document.getElementById("client-level-list");
  const appointments = getAppointments();

  if (!appointments.length) {
    historyContainer.innerHTML = "<p class='empty'>Ainda nao existem atendimentos registrados.</p>";
  } else {
    historyContainer.innerHTML = appointments
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((appointment) => `
        <article class="list-card">
          <div class="split-title">
            <strong>${appointment.clientName}</strong>
            <span class="status ${appointment.status}">${appointment.status}</span>
          </div>
          <p class="muted">${appointment.serviceName} - ${appointment.barberName}</p>
          <p class="muted">${toDateLabel(appointment.date)} ${appointment.time} | ${toMoney(appointment.servicePrice)} | ${appointment.paymentMethod}</p>
          ${appointment.receipt?.number ? `<p class="muted">Recibo: ${appointment.receipt.number}</p>` : ""}
        </article>
      `)
      .join("");

    applyStagger(historyContainer, ".list-card");
  }

  const clients = getClients();
  if (!clients.length) {
    levelContainer.innerHTML = "<p class='empty'>Nenhum cliente cadastrado.</p>";
    return;
  }

  levelContainer.innerHTML = clients.map((client) => {
    const cuts = appointments.filter(
      (appointment) =>
        normalizePhone(appointment.clientPhone) === normalizePhone(client.phone) &&
        appointment.status === "completed"
    ).length;
    const level = getClientLevel(cuts);
    return `
      <article class="list-card">
        <div class="split-title">
          <strong>${client.name}</strong>
          <span class="level-pill">${level.name}</span>
        </div>
        <p class="muted">${cuts} cortes concluidos</p>
        <p class="muted">${level.benefit}</p>
      </article>
    `;
  }).join("");

  applyStagger(levelContainer, ".list-card");
}

async function renderAutomationPanel() {
  const providerEl = document.getElementById("automation-provider");
  const confirmationEl = document.getElementById("automation-confirmation-count");
  const reminderEl = document.getElementById("automation-reminder-count");
  const postEl = document.getElementById("automation-post-count");
  const logsEl = document.getElementById("automation-log-list");

  let provider = "local-cache";
  let counts = { confirmation: 0, reminder: 0, postService: 0 };
  let logs = [];

  let statusLoaded = false;

  if (API_SETTINGS.enabled) {
    const [statusResponse, logsResponse] = await Promise.all([
      apiRequest("/automation/status"),
      apiRequest("/automation/logs?limit=60")
    ]);

    if (statusResponse?.ok) {
      statusLoaded = true;
      provider = statusResponse.provider || provider;
      counts = {
        confirmation: Number(statusResponse.sent?.confirmation || 0),
        reminder: Number(statusResponse.sent?.reminder || 0),
        postService: Number(statusResponse.sent?.postService || 0)
      };
    }

    if (logsResponse?.ok && Array.isArray(logsResponse.logs)) {
      logs = logsResponse.logs;
    }
  }

  if (!logs.length) {
    logs = collectAutomationLogsFromLocal(60);
  }

  if (!statusLoaded) {
    counts = logs.reduce(
      (acc, event) => {
        if (event.kind === "confirmation") acc.confirmation += 1;
        if (event.kind === "reminder") acc.reminder += 1;
        if (event.kind === "post_service") acc.postService += 1;
        return acc;
      },
      { confirmation: 0, reminder: 0, postService: 0 }
    );
  }

  providerEl.textContent = provider;
  animateMetric(confirmationEl, counts.confirmation, (value) => `${Math.round(value)}`);
  animateMetric(reminderEl, counts.reminder, (value) => `${Math.round(value)}`);
  animateMetric(postEl, counts.postService, (value) => `${Math.round(value)}`);

  if (!logs.length) {
    logsEl.innerHTML = "<p class='empty'>Sem eventos de automacao ate o momento.</p>";
    return;
  }

  logsEl.innerHTML = logs.map((event) => `
    <article class="list-card automation-card">
      <div class="split-title">
        <strong>${event.clientName || "Cliente"}</strong>
        <span class="event-kind ${eventKindClass(event.kind)}">${eventKindLabel(event.kind)}</span>
      </div>
      <p class="muted">${event.date || "-"} ${event.time || ""} - ${event.barberName || "-"}</p>
      <p class="muted">Status atual: ${event.status || "-"}</p>
      <p class="muted">Enviado em: ${toDateTimeLabel(event.at)}</p>
      <p class="muted">Provider: ${event.provider || "-"}</p>
      ${event.messageId ? `<p class="muted">Mensagem ID: ${event.messageId}</p>` : ""}
      ${event.error ? `<p class="event-error">Erro: ${event.error}</p>` : `<p class="event-success">Entrega: ${event.success ? "ok" : "falha"}</p>`}
    </article>
  `).join("");

  applyStagger(logsEl, ".list-card");
}

function renderAll() {
  renderKpis();
  renderUpcomingAppointments();
  renderGoalCard();
  renderSmartReports();
  renderHourlyBars();
  renderBusinessInsights();
  renderServiceManagement();
  renderBarberManagement();
  renderFinance();
  renderHistory();
  void renderAutomationPanel();
}

function bindDashboardActions() {
  document.getElementById("btn-save-goal").addEventListener("click", () => {
    const value = Number(document.getElementById("goal-input").value);
    if (!value || value < 1000) {
      showToast("Informe uma meta valida acima de R$ 1.000.", "warning");
      return;
    }
    setMonthlyGoal(value);
    apiFireAndForget("/settings/monthly-goal", { monthlyGoal: value }, "PUT");
    renderGoalCard();
    showToast("Meta mensal atualizada.", "success");
  });
}

function bindServiceActions() {
  document.getElementById("btn-add-service").addEventListener("click", () => {
    const name = document.getElementById("service-name").value.trim();
    const description = document.getElementById("service-description").value.trim();
    const duration = Number(document.getElementById("service-duration").value);
    const price = Number(document.getElementById("service-price").value);

    if (!name || !description || !duration || !price) {
      showToast("Preencha todos os campos de servico.", "warning");
      return;
    }

    const services = getServices();
    services.push({
      id: uid("srv"),
      name,
      description,
      duration,
      price
    });
    setServices(services);
    apiFireAndForget("/services", services, "PUT");

    document.getElementById("service-name").value = "";
    document.getElementById("service-description").value = "";
    document.getElementById("service-duration").value = "";
    document.getElementById("service-price").value = "";
    renderAll();
    showToast("Servico adicionado.", "success");
  });
}

function bindBarberActions() {
  document.getElementById("btn-add-barber").addEventListener("click", () => {
    const name = document.getElementById("barber-name").value.trim();
    const specialty = document.getElementById("barber-specialty").value.trim();
    const commissionRate = Number(document.getElementById("barber-commission").value);
    const pin = document.getElementById("barber-pin").value.trim();
    const photo = document.getElementById("barber-photo").value.trim();

    if (!name || !specialty || !commissionRate || !pin || !photo) {
      showToast("Preencha todos os campos de barbeiro.", "warning");
      return;
    }

    const barbers = getBarbers();
    barbers.push({
      id: uid("barber"),
      name,
      specialty,
      baseRating: 4.7,
      commissionRate,
      pin,
      photo,
      offDays: [],
      manualBlocks: []
    });
    setBarbers(barbers);
    apiFireAndForget("/barbers", barbers, "PUT");

    document.getElementById("barber-name").value = "";
    document.getElementById("barber-specialty").value = "";
    document.getElementById("barber-commission").value = "";
    document.getElementById("barber-pin").value = "";
    document.getElementById("barber-photo").value = "";
    renderAll();
    showToast("Barbeiro adicionado.", "success");
  });
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.getAttribute("data-tab"));
    });
  });
}

function bindSearch() {
  const input = document.getElementById("admin-search");
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    document.querySelectorAll(".list-card").forEach((card) => {
      card.classList.toggle("hidden", !card.textContent.toLowerCase().includes(query));
    });
  });
}

function bindAutomationActions() {
  const refreshButton = document.getElementById("btn-refresh-automation");
  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = "Atualizando...";
    await renderAutomationPanel();
    refreshButton.textContent = "Atualizar";
    refreshButton.disabled = false;
    showToast("Painel de automacao atualizado.", "success");
  });
}

function normalizeStatuses() {
  const appointments = getAppointments();
  let changed = false;
  appointments.forEach((appointment) => {
    if (!appointment.paymentMethod) {
      appointment.paymentMethod = "Presencial";
      changed = true;
    }
    if (!appointment.serviceDuration) {
      appointment.serviceDuration = 30;
      changed = true;
    }
    if (!appointment.receipt && appointment.status === "completed") {
      appointment.receipt = {
        number: `REC-${appointment.id?.split("-")[1] || uid("x")}`,
        issuedAt: appointment.completedAt || new Date().toISOString(),
        clientName: appointment.clientName,
        serviceName: appointment.serviceName,
        value: appointment.servicePrice,
        paymentMethod: appointment.paymentMethod,
        dateTime: `${appointment.date} ${appointment.time}`
      };
      changed = true;
    }
  });
  if (changed) setAppointments(appointments);
}

async function init() {
  parseApiMode();
  if (API_SETTINGS.enabled) {
    showAdminSkeletons();
  }

  const hydrated = await hydrateFromApi();
  document.getElementById("admin-today").textContent = new Date().toLocaleDateString("pt-BR");
  normalizeStatuses();
  bindNavigation();
  bindDashboardActions();
  bindServiceActions();
  bindBarberActions();
  bindAutomationActions();
  bindSearch();
  switchTab("dashboard");
  renderAll();
  applyFloatBrand();

  window.setInterval(() => {
    void renderAutomationPanel();
  }, 60000);

  window.BARBERSAAS_ADMIN = {
    apiBaseUrl: API_BASE_URL,
    apiEnabled: API_SETTINGS.enabled,
    enableApiMode() {
      localStorage.setItem(API_MODE_KEY, "on");
    },
    disableApiMode() {
      localStorage.setItem(API_MODE_KEY, "off");
    }
  };

  if (API_SETTINGS.enabled) {
    showToast(hydrated ? "Admin sincronizado com API." : "API ativa, usando cache local.", hydrated ? "success" : "warning");
  }
}

document.addEventListener("DOMContentLoaded", init);


