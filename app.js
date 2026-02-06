const API_BASE_URL = "http://127.0.0.1:5000";

const STORAGE_KEYS = {
  services: "barbersaas_services",
  barbers: "barbersaas_barbers",
  clients: "barbersaas_clients",
  appointments: "barbersaas_appointments",
  monthlyGoal: "barbersaas_monthly_goal",
  clientSession: "barbersaas_client_session",
  barberSession: "barbersaas_barber_session"
};

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

const PERIODS = {
  morning: SLOT_TIMES.filter((slot) => Number(slot.split(":")[0]) < 12),
  afternoon: SLOT_TIMES.filter((slot) => {
    const hour = Number(slot.split(":")[0]);
    return hour >= 12 && hour < 18;
  }),
  night: SLOT_TIMES.filter((slot) => Number(slot.split(":")[0]) >= 18)
};

const LEVELS = [
  { name: "Bronze", minCuts: 0, benefit: "Base de beneficios ativa" },
  { name: "Silver", minCuts: 6, benefit: "Prioridade moderada em horarios" },
  { name: "Gold", minCuts: 12, benefit: "Desconto progressivo e mimos" },
  { name: "VIP", minCuts: 20, benefit: "Atendimento exclusivo e prioridade maxima" }
];

const defaultServices = [
  {
    id: "srv-corte-moderno",
    name: "Corte Moderno",
    description: "Degrade premium com finalizacao personalizada.",
    duration: 40,
    price: 85
  },
  {
    id: "srv-barba-imperial",
    name: "Barba Imperial",
    description: "Desenho de barba com toalha quente.",
    duration: 30,
    price: 65
  },
  {
    id: "srv-combo-master",
    name: "Combo Master",
    description: "Corte, barba e sobrancelha em sessao completa.",
    duration: 70,
    price: 125
  }
];

const defaultBarbers = [
  {
    id: "barber-ricardo",
    name: "Ricardo Silva",
    specialty: "Fade e barba desenhada",
    baseRating: 4.9,
    commissionRate: 40,
    pin: "1234",
    photo: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=480&q=80",
    offDays: [],
    manualBlocks: []
  },
  {
    id: "barber-marco",
    name: "Marco Polo",
    specialty: "Corte executivo e visagismo",
    baseRating: 4.8,
    commissionRate: 38,
    pin: "2345",
    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=480&q=80",
    offDays: [],
    manualBlocks: []
  },
  {
    id: "barber-lucas",
    name: "Lucas Mendes",
    specialty: "Navalhado e acabamento premium",
    baseRating: 4.7,
    commissionRate: 35,
    pin: "3456",
    photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=480&q=80",
    offDays: [],
    manualBlocks: []
  }
];

const state = {
  role: "cliente",
  clientSession: null,
  barberSession: null,
  selectedServiceId: null,
  selectedBarberId: null,
  selectedDate: null,
  selectedTime: null,
  selectedPayment: "Presencial",
  lastAppointmentId: null
};

const DataStore = {
  get(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("Falha ao ler dados", key, error);
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

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

function animateMetric(target, value, formatter, duration = 650) {
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

function applyModuleLoading(moduleId, duration = 220) {
  const module = document.getElementById(moduleId);
  if (!module) return;
  module.classList.add("panel-loading");
  window.setTimeout(() => module.classList.remove("panel-loading"), duration);
}

function applyFloatBrand() {
  document.querySelectorAll(".brand").forEach((brand) => brand.classList.add("float-soft"));
}

function showBootstrapSkeletons() {
  renderSkeleton("service-list", 3);
  renderSkeleton("barber-list", 3);
  renderSkeleton("history-list", 3);
  renderSkeleton("barber-day-list", 4);
  renderSkeleton("barber-reviews", 3);
}

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
    console.warn("API indisponivel, mantendo localStorage.", error);
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
    services: DataStore.get(STORAGE_KEYS.services, []),
    barbers: DataStore.get(STORAGE_KEYS.barbers, []),
    clients: DataStore.get(STORAGE_KEYS.clients, []),
    appointments: DataStore.get(STORAGE_KEYS.appointments, []),
    monthlyGoal: DataStore.get(STORAGE_KEYS.monthlyGoal, 20000)
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

  if (Array.isArray(payload.services)) DataStore.set(STORAGE_KEYS.services, payload.services);
  if (Array.isArray(payload.barbers)) DataStore.set(STORAGE_KEYS.barbers, payload.barbers);
  if (Array.isArray(payload.clients)) DataStore.set(STORAGE_KEYS.clients, payload.clients);
  if (Array.isArray(payload.appointments)) DataStore.set(STORAGE_KEYS.appointments, payload.appointments);
  if (Number.isFinite(Number(payload.monthlyGoal))) DataStore.set(STORAGE_KEYS.monthlyGoal, Number(payload.monthlyGoal));

  return true;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function toMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function toDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  });
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

function isoToday() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function slotToMinutes(slot) {
  const [hour, minute] = slot.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToSlot(minutes) {
  const hour = `${Math.floor(minutes / 60)}`.padStart(2, "0");
  const minute = `${minutes % 60}`.padStart(2, "0");
  return `${hour}:${minute}`;
}

function getSlotsNeeded(duration) {
  return Math.ceil(Number(duration) / 30);
}

function buildCoverage(startTime, duration) {
  const slotsNeeded = getSlotsNeeded(duration);
  const startMinutes = slotToMinutes(startTime);
  const coverage = [];
  for (let index = 0; index < slotsNeeded; index += 1) {
    coverage.push(minutesToSlot(startMinutes + index * 30));
  }
  return coverage;
}

function ensureSeedData() {
  if (!localStorage.getItem(STORAGE_KEYS.services)) DataStore.set(STORAGE_KEYS.services, defaultServices);
  if (!localStorage.getItem(STORAGE_KEYS.barbers)) DataStore.set(STORAGE_KEYS.barbers, defaultBarbers);
  if (!localStorage.getItem(STORAGE_KEYS.clients)) DataStore.set(STORAGE_KEYS.clients, []);
  if (!localStorage.getItem(STORAGE_KEYS.appointments)) DataStore.set(STORAGE_KEYS.appointments, []);
  if (!localStorage.getItem(STORAGE_KEYS.monthlyGoal)) DataStore.set(STORAGE_KEYS.monthlyGoal, 20000);
}

const getServices = () => DataStore.get(STORAGE_KEYS.services, []);
const getBarbers = () => DataStore.get(STORAGE_KEYS.barbers, []);
const getClients = () => DataStore.get(STORAGE_KEYS.clients, []);
const getAppointments = () => DataStore.get(STORAGE_KEYS.appointments, []);

function saveServices(services) {
  DataStore.set(STORAGE_KEYS.services, services);
  queueApiSync("services_update");
}

function saveBarbers(barbers) {
  DataStore.set(STORAGE_KEYS.barbers, barbers);
  queueApiSync("barbers_update");
}

function saveClients(clients) {
  DataStore.set(STORAGE_KEYS.clients, clients);
  queueApiSync("clients_update");
}

function saveAppointments(appointments) {
  DataStore.set(STORAGE_KEYS.appointments, appointments);
  queueApiSync("appointments_update");
}

function getClientLevel(totalCompletedCuts) {
  const sorted = LEVELS.slice().sort((a, b) => b.minCuts - a.minCuts);
  return sorted.find((level) => totalCompletedCuts >= level.minCuts) || LEVELS[0];
}

function findClientByPhone(phone) {
  const normalized = normalizePhone(phone);
  return getClients().find((client) => normalizePhone(client.phone) === normalized) || null;
}

function upsertClient(name, phone) {
  const clients = getClients();
  const normalized = normalizePhone(phone);
  const existing = clients.find((client) => normalizePhone(client.phone) === normalized);

  if (existing) {
    existing.name = name;
    existing.updatedAt = new Date().toISOString();
    saveClients(clients);
    apiFireAndForget("/clients/upsert", existing);
    return existing;
  }

  const created = {
    id: uid("cli"),
    name,
    phone: normalized,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  clients.push(created);
  saveClients(clients);
  apiFireAndForget("/clients/upsert", created);
  return created;
}

function getBarberAverageRating(barberId) {
  const barber = getBarbers().find((item) => item.id === barberId);
  const ratings = getAppointments()
    .filter((appointment) => appointment.barberId === barberId && Number.isFinite(appointment.rating))
    .map((appointment) => appointment.rating);

  if (ratings.length === 0) return Number(barber?.baseRating || 0);

  const average = ratings.reduce((acc, value) => acc + value, 0) / ratings.length;
  return Number(average.toFixed(1));
}

function getClientCompletedCuts(phone) {
  const normalized = normalizePhone(phone);
  return getAppointments().filter(
    (appointment) =>
      normalizePhone(appointment.clientPhone) === normalized &&
      appointment.status === "completed"
  ).length;
}

function isSlotFree({ date, time, barberId, duration }) {
  const barber = getBarbers().find((item) => item.id === barberId);
  if (!barber) return false;
  if (barber.offDays.includes(date)) return false;

  const requestedCoverage = buildCoverage(time, duration);
  if (requestedCoverage.some((slot) => !SLOT_TIMES.includes(slot))) return false;

  const hasManualBlock = requestedCoverage.some((slot) =>
    barber.manualBlocks.some((block) => block.date === date && block.time === slot)
  );
  if (hasManualBlock) return false;

  const busyAppointments = getAppointments().filter(
    (appointment) =>
      appointment.barberId === barberId &&
      appointment.date === date &&
      ["pending", "confirmed", "completed"].includes(appointment.status)
  );

  for (const appointment of busyAppointments) {
    const busyCoverage = buildCoverage(appointment.time, appointment.serviceDuration);
    if (requestedCoverage.some((slot) => busyCoverage.includes(slot))) return false;
  }
  return true;
}

function buildClientSummary() {
  const service = getServices().find((item) => item.id === state.selectedServiceId);
  const barber = getBarbers().find((item) => item.id === state.selectedBarberId);
  return {
    serviceName: service?.name || "-",
    serviceDuration: service?.duration || 0,
    servicePrice: service?.price || 0,
    barberName: barber?.name || "-",
    date: state.selectedDate || "-",
    time: state.selectedTime || "-",
    payment: state.selectedPayment || "Presencial"
  };
}

function renderSummary() {
  const summary = buildClientSummary();
  const container = document.getElementById("booking-summary");
  container.innerHTML = `
    <div class="summary-line"><span>Servico</span><strong>${summary.serviceName}</strong></div>
    <div class="summary-line"><span>Duracao</span><strong>${summary.serviceDuration} min</strong></div>
    <div class="summary-line"><span>Barbeiro</span><strong>${summary.barberName}</strong></div>
    <div class="summary-line"><span>Data</span><strong>${summary.date === "-" ? "-" : toDateLabel(summary.date)}</strong></div>
    <div class="summary-line"><span>Horario</span><strong>${summary.time}</strong></div>
    <div class="summary-line"><span>Pagamento</span><strong>${summary.payment}</strong></div>
    <div class="summary-line total"><span>Total</span><strong>${toMoney(summary.servicePrice)}</strong></div>
  `;
}

function renderServices() {
  const services = getServices();
  const container = document.getElementById("service-list");
  if (services.length === 0) {
    container.innerHTML = "<p class='empty'>Sem servicos cadastrados no momento.</p>";
    return;
  }

  container.innerHTML = services.map((service) => {
    const selectedClass = service.id === state.selectedServiceId ? "is-selected" : "";
    return `
      <button class="select-card ${selectedClass}" data-service-id="${service.id}">
        <div>
          <h4>${service.name}</h4>
          <p>${service.description}</p>
          <span>${service.duration} min</span>
        </div>
        <strong>${toMoney(service.price)}</strong>
      </button>
    `;
  }).join("");

  applyStagger(container, ".select-card");

  container.querySelectorAll("[data-service-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedServiceId = button.getAttribute("data-service-id");
      state.selectedTime = null;
      renderServices();
      renderTimeSlots();
      renderSummary();
    });
  });
}

function renderBarbers() {
  const barbers = getBarbers();
  const container = document.getElementById("barber-list");
  if (barbers.length === 0) {
    container.innerHTML = "<p class='empty'>Sem barbeiros disponiveis.</p>";
    return;
  }

  container.innerHTML = barbers.map((barber) => {
    const selectedClass = barber.id === state.selectedBarberId ? "is-selected" : "";
    const rating = getBarberAverageRating(barber.id);
    return `
      <button class="barber-card ${selectedClass}" data-barber-id="${barber.id}">
        <img src="${barber.photo}" alt="Foto de ${barber.name}" loading="lazy">
        <div>
          <h4>${barber.name}</h4>
          <p>${barber.specialty}</p>
          <span>Nota ${rating.toFixed(1)}</span>
        </div>
      </button>
    `;
  }).join("");

  applyStagger(container, ".barber-card");

  container.querySelectorAll("[data-barber-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedBarberId = button.getAttribute("data-barber-id");
      state.selectedTime = null;
      renderBarbers();
      renderTimeSlots();
      renderSummary();
    });
  });
}

function renderCalendar() {
  const container = document.getElementById("date-calendar");
  container.innerHTML = "";

  for (let index = 0; index < 14; index += 1) {
    const date = new Date();
    date.setDate(date.getDate() + index);

    const iso = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
    const selectedClass = iso === state.selectedDate ? "is-selected" : "";

    const card = document.createElement("button");
    card.className = `date-pill ${selectedClass}`;
    card.setAttribute("data-date", iso);
    card.innerHTML = `
      <span>${date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
      <strong>${`${date.getDate()}`.padStart(2, "0")}</strong>
    `;

    card.addEventListener("click", () => {
      state.selectedDate = iso;
      state.selectedTime = null;
      renderCalendar();
      renderTimeSlots();
      renderSummary();
    });
    container.appendChild(card);
  }

  applyStagger(container, ".date-pill");
}

function renderSlotGroup(containerId, slots) {
  const container = document.getElementById(containerId);
  const selectedService = getServices().find((item) => item.id === state.selectedServiceId);

  if (!state.selectedServiceId || !state.selectedBarberId || !state.selectedDate) {
    container.innerHTML = "<p class='empty'>Selecione servico, barbeiro e data para liberar horarios.</p>";
    return;
  }

  container.innerHTML = slots.map((time) => {
    const available = isSlotFree({
      date: state.selectedDate,
      time,
      barberId: state.selectedBarberId,
      duration: selectedService.duration
    });
    const selectedClass = time === state.selectedTime ? "is-selected" : "";
    return `
      <button class="slot-btn ${selectedClass}" data-time="${time}" ${available ? "" : "disabled"}>
        <span class="slot-label">${time}</span>
        <span class="slot-check" aria-hidden="true">&#10003;</span>
      </button>
    `;
  }).join("");

  applyStagger(container, ".slot-btn");

  container.querySelectorAll("[data-time]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTime = button.getAttribute("data-time");
      renderTimeSlots();
      renderSummary();
    });
  });
}

function renderTimeSlots() {
  renderSlotGroup("slots-morning", PERIODS.morning);
  renderSlotGroup("slots-afternoon", PERIODS.afternoon);
  renderSlotGroup("slots-night", PERIODS.night);
}

function renderPaymentState() {
  document.querySelectorAll(".pay-option").forEach((option) => {
    const input = option.querySelector("input");
    option.classList.toggle("is-active", input?.value === state.selectedPayment);
  });
}

function updateClientHeader() {
  if (!state.clientSession) return;
  const cuts = getClientCompletedCuts(state.clientSession.phone);
  const level = getClientLevel(cuts);
  document.getElementById("client-greeting").textContent = `Ola, ${state.clientSession.name}`;
  document.getElementById("client-level").textContent = `Nivel ${level.name}`;
  document.getElementById("client-benefit").textContent = `${cuts} cortes concluidos. Beneficio: ${level.benefit}`;
}

function renderClientHistory() {
  const historyList = document.getElementById("history-list");
  if (!state.clientSession) {
    historyList.innerHTML = "<p class='empty'>Faca login para ver o historico.</p>";
    return;
  }

  const appointments = getAppointments()
    .filter((appointment) => normalizePhone(appointment.clientPhone) === normalizePhone(state.clientSession.phone))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (appointments.length === 0) {
    historyList.innerHTML = "<p class='empty'>Voce ainda nao possui historico.</p>";
    return;
  }

  historyList.innerHTML = appointments.map((appointment) => {
    const canReview = appointment.status === "completed" && !Number.isFinite(appointment.rating);
    const stars = Number.isFinite(appointment.rating)
      ? `<p class='muted'>Avaliacao: ${"&#9733;".repeat(appointment.rating)}${"&#9734;".repeat(5 - appointment.rating)}</p>`
      : "";
    return `
      <article class="list-card">
        <div class="split-title">
          <strong>${appointment.serviceName}</strong>
          <span class="status ${appointment.status}">${appointment.status}</span>
        </div>
        <p class="muted">${toDateLabel(appointment.date)} ${appointment.time} - ${appointment.barberName}</p>
        <p class="muted">${toMoney(appointment.servicePrice)} via ${appointment.paymentMethod}</p>
        ${stars}
        ${canReview ? `
          <div class="review-area">
            <div class="star-row" data-review-stars="${appointment.id}">
              ${[1, 2, 3, 4, 5].map((star) => `<button type="button" class="star-btn" data-rate="${star}" data-appointment="${appointment.id}">&#9733;</button>`).join("")}
            </div>
            <textarea id="review-text-${appointment.id}" rows="2" placeholder="Comentario opcional"></textarea>
            <button class="btn-outline" data-save-review="${appointment.id}">Enviar avaliacao</button>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");

  applyStagger(historyList, ".list-card");

  historyList.querySelectorAll("[data-save-review]").forEach((button) => {
    button.addEventListener("click", () => {
      const appointmentId = button.getAttribute("data-save-review");
      const activeStar = historyList.querySelector(`.star-btn.is-selected[data-appointment='${appointmentId}']`);
      const rating = Number(activeStar?.getAttribute("data-rate") || 0);
      const review = document.getElementById(`review-text-${appointmentId}`)?.value?.trim() || "";
      if (!rating) {
        showToast("Selecione de 1 a 5 estrelas.", "warning");
        return;
      }
      saveReview(appointmentId, rating, review);
    });
  });

  historyList.querySelectorAll(".star-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const appointmentId = button.getAttribute("data-appointment");
      const rate = Number(button.getAttribute("data-rate"));
      historyList.querySelectorAll(`.star-btn[data-appointment='${appointmentId}']`).forEach((star) => {
        const starRate = Number(star.getAttribute("data-rate"));
        star.classList.toggle("is-selected", starRate <= rate);
      });
    });
  });
}

function saveReview(appointmentId, rating, review) {
  const appointments = getAppointments();
  const target = appointments.find((item) => item.id === appointmentId);
  if (!target) return;

  target.rating = rating;
  target.review = review;
  target.reviewedAt = new Date().toISOString();
  saveAppointments(appointments);
  apiFireAndForget(`/appointments/${target.id}`, {
    rating: target.rating,
    review: target.review,
    reviewedAt: target.reviewedAt
  }, "PATCH");

  renderClientHistory();
  renderBarbers();
  renderBarberDashboard();
  showToast("Avaliacao registrada com sucesso.", "success");
}

function setClientSession(client) {
  state.clientSession = client;
  DataStore.set(STORAGE_KEYS.clientSession, client);
  document.getElementById("client-login").classList.add("hidden");
  document.getElementById("client-app").classList.remove("hidden");

  updateClientHeader();
  renderServices();
  renderBarbers();
  renderCalendar();
  renderTimeSlots();
  renderSummary();
}

function clearClientSession() {
  state.clientSession = null;
  localStorage.removeItem(STORAGE_KEYS.clientSession);

  state.selectedServiceId = null;
  state.selectedBarberId = null;
  state.selectedDate = null;
  state.selectedTime = null;
  state.selectedPayment = "Presencial";

  document.getElementById("client-app").classList.add("hidden");
  document.getElementById("client-login").classList.remove("hidden");
  document.getElementById("client-confirmation").classList.add("hidden");
  document.getElementById("client-history").classList.add("hidden");
  showToast("Sessao do cliente encerrada.", "info");
}

function buildReceipt(appointment) {
  return {
    number: `REC-${appointment.id.split("-")[1]}`,
    issuedAt: new Date().toISOString(),
    clientName: appointment.clientName,
    serviceName: appointment.serviceName,
    value: appointment.servicePrice,
    paymentMethod: appointment.paymentMethod,
    dateTime: `${appointment.date} ${appointment.time}`
  };
}

function confirmBooking() {
  if (!state.clientSession) {
    showToast("Faca login para continuar.", "warning");
    return;
  }

  const service = getServices().find((item) => item.id === state.selectedServiceId);
  const barber = getBarbers().find((item) => item.id === state.selectedBarberId);

  if (!service || !barber || !state.selectedDate || !state.selectedTime) {
    showToast("Preencha todas as etapas para confirmar.", "warning");
    return;
  }

  if (!isSlotFree({
    date: state.selectedDate,
    time: state.selectedTime,
    barberId: barber.id,
    duration: service.duration
  })) {
    showToast("Horario indisponivel. Selecione outro slot.", "warning");
    renderTimeSlots();
    return;
  }

  const appointment = {
    id: uid("apt"),
    clientId: state.clientSession.id,
    clientName: state.clientSession.name,
    clientPhone: state.clientSession.phone,
    serviceId: service.id,
    serviceName: service.name,
    serviceDuration: service.duration,
    servicePrice: Number(service.price),
    barberId: barber.id,
    barberName: barber.name,
    date: state.selectedDate,
    time: state.selectedTime,
    paymentMethod: state.selectedPayment,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rating: null,
    review: "",
    receipt: null,
    automation: {
      confirmationMessage: true,
      reminderMessage: true,
      postServiceMessage: true
    }
  };
  appointment.receipt = buildReceipt(appointment);

  const appointments = getAppointments();
  appointments.push(appointment);
  saveAppointments(appointments);
  apiFireAndForget("/appointments", appointment);

  state.lastAppointmentId = appointment.id;
  state.selectedTime = null;
  document.getElementById("client-app").classList.add("hidden");
  const confirmationCard = document.getElementById("client-confirmation");
  confirmationCard.classList.remove("hidden");
  confirmationCard.classList.remove("success-pop");
  void confirmationCard.offsetWidth;
  confirmationCard.classList.add("success-pop");
  renderConfirmation(appointment);
  renderBarberDashboard();
  showToast("Agendamento salvo com sucesso.", "success");
}

function renderConfirmation(appointment) {
  const details = document.getElementById("confirmation-details");
  details.innerHTML = `
    <div class="summary-line"><span>Cliente</span><strong>${appointment.clientName}</strong></div>
    <div class="summary-line"><span>Servico</span><strong>${appointment.serviceName} (${appointment.serviceDuration} min)</strong></div>
    <div class="summary-line"><span>Barbeiro</span><strong>${appointment.barberName}</strong></div>
    <div class="summary-line"><span>Data e hora</span><strong>${toDateLabel(appointment.date)} ${appointment.time}</strong></div>
    <div class="summary-line"><span>Pagamento</span><strong>${appointment.paymentMethod}</strong></div>
    <div class="summary-line total"><span>Total</span><strong>${toMoney(appointment.servicePrice)}</strong></div>
    <div class="summary-line"><span>Recibo</span><strong>${appointment.receipt.number}</strong></div>
  `;
}

function openWhatsApp(message) {
  const phone = "5511999999999";
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
}

function sendWhatsAppConfirmation() {
  const appointment = getAppointments().find((item) => item.id === state.lastAppointmentId);
  if (!appointment) return;
  const message = `Confirmacao BARBERSAAS\\nCliente: ${appointment.clientName}\\nServico: ${appointment.serviceName}\\nData: ${toDateLabel(appointment.date)} ${appointment.time}`;
  openWhatsApp(message);
}

function sendWhatsAppReminder() {
  const appointment = getAppointments().find((item) => item.id === state.lastAppointmentId);
  if (!appointment) return;
  const message = `Lembrete BARBERSAAS\\nSeu atendimento com ${appointment.barberName} acontece em aproximadamente 2 horas.\\nServico: ${appointment.serviceName}`;
  openWhatsApp(message);
}

function sendWhatsAppPostService() {
  const appointment = getAppointments().find((item) => item.id === state.lastAppointmentId);
  if (!appointment) return;
  openWhatsApp("Obrigado por escolher a BARBERSAAS!\\nGostou do atendimento? Avalie de 1 a 5 estrelas no app.");
}

function resetClientFlowAfterConfirmation() {
  document.getElementById("client-confirmation").classList.add("hidden");
  document.getElementById("client-app").classList.remove("hidden");
  state.selectedServiceId = null;
  state.selectedBarberId = null;
  state.selectedDate = null;
  state.selectedTime = null;
  state.selectedPayment = "Presencial";
  renderServices();
  renderBarbers();
  renderCalendar();
  renderTimeSlots();
  renderSummary();
  renderPaymentState();
  updateClientHeader();
}

function getBarberSessionData() {
  if (!state.barberSession) return null;
  return getBarbers().find((barber) => barber.id === state.barberSession.id) || null;
}

function setBarberSession(barber) {
  state.barberSession = { id: barber.id, name: barber.name };
  DataStore.set(STORAGE_KEYS.barberSession, state.barberSession);
  document.getElementById("barber-login").classList.add("hidden");
  document.getElementById("barber-app").classList.remove("hidden");
  renderBarberDashboard();
}

function clearBarberSession() {
  state.barberSession = null;
  localStorage.removeItem(STORAGE_KEYS.barberSession);
  document.getElementById("barber-app").classList.add("hidden");
  document.getElementById("barber-login").classList.remove("hidden");
  showToast("Sessao do barbeiro encerrada.", "info");
}

function updateBarberKpis(date) {
  const barber = getBarberSessionData();
  if (!barber) return;

  const appointments = getAppointments().filter(
    (item) =>
      item.barberId === barber.id &&
      item.date === date &&
      ["pending", "confirmed", "completed"].includes(item.status)
  );
  const completed = appointments.filter((item) => item.status === "completed");
  const commission = completed.reduce(
    (acc, item) => acc + (item.servicePrice * (Number(barber.commissionRate) / 100)),
    0
  );

  animateMetric("kpi-today-bookings", appointments.length, (value) => `${Math.round(value)}`);
  animateMetric("kpi-today-completed", completed.length, (value) => `${Math.round(value)}`);
  animateMetric("kpi-daily-commission", commission, (value) => toMoney(value));
}

function renderBarberAgenda(date) {
  const barber = getBarberSessionData();
  if (!barber) return;

  const list = document.getElementById("barber-day-list");
  const todayAppointments = getAppointments()
    .filter((appointment) => appointment.barberId === barber.id && appointment.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));

  if (todayAppointments.length === 0) {
    list.innerHTML = "<p class='empty'>Nenhum agendamento para esta data.</p>";
    return;
  }

  list.innerHTML = todayAppointments.map((appointment) => {
    const actions = [];
    if (appointment.status === "pending") {
      actions.push(`<button class='btn-outline' data-barber-action='confirm' data-appointment='${appointment.id}'>Confirmar</button>`);
      actions.push(`<button class='btn-ghost danger' data-barber-action='refuse' data-appointment='${appointment.id}'>Recusar</button>`);
    }
    if (appointment.status === "confirmed") {
      actions.push(`<button class='btn-primary' data-barber-action='complete' data-appointment='${appointment.id}'>Concluir</button>`);
    }

    return `
      <article class="list-card">
        <div class="split-title">
          <strong>${appointment.time} - ${appointment.clientName}</strong>
          <span class="status ${appointment.status}">${appointment.status}</span>
        </div>
        <p class="muted">${appointment.serviceName} (${appointment.serviceDuration} min) - ${toMoney(appointment.servicePrice)}</p>
        <p class="muted">Pagamento: ${appointment.paymentMethod}</p>
        <div class="inline-actions">${actions.join("") || "<span class='muted'>Sem acao disponivel</span>"}</div>
      </article>
    `;
  }).join("");

  applyStagger(list, ".list-card");

  list.querySelectorAll("[data-barber-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-barber-action");
      const appointmentId = button.getAttribute("data-appointment");
      handleBarberAction(action, appointmentId);
    });
  });
}

function handleBarberAction(action, appointmentId) {
  const appointments = getAppointments();
  const target = appointments.find((appointment) => appointment.id === appointmentId);
  if (!target) return;

  if (action === "confirm") {
    target.status = "confirmed";
    target.updatedAt = new Date().toISOString();
    showToast("Agendamento confirmado.", "success");
  }
  if (action === "refuse") {
    const reason = window.prompt("Informe o motivo da recusa:", "Horario indisponivel");
    if (reason === null) return;
    target.status = "refused";
    target.refusalReason = reason || "Sem motivo informado";
    target.updatedAt = new Date().toISOString();
    showToast("Agendamento recusado.", "warning");
  }
  if (action === "complete") {
    target.status = "completed";
    target.completedAt = new Date().toISOString();
    target.updatedAt = new Date().toISOString();
    target.receipt = buildReceipt(target);
    showToast("Atendimento concluido e recibo emitido.", "success");
  }

  saveAppointments(appointments);
  apiFireAndForget(`/appointments/${target.id}`, target, "PATCH");
  updateClientHeader();
  renderBarberDashboard();
}

function renderBarberReviews() {
  const barber = getBarberSessionData();
  if (!barber) return;
  const container = document.getElementById("barber-reviews");
  const reviews = getAppointments()
    .filter((appointment) => appointment.barberId === barber.id && Number.isFinite(appointment.rating))
    .sort((a, b) => new Date(b.reviewedAt || b.updatedAt) - new Date(a.reviewedAt || a.updatedAt));

  if (reviews.length === 0) {
    container.innerHTML = "<p class='empty'>Ainda nao ha avaliacoes publicadas.</p>";
    return;
  }

  container.innerHTML = reviews.map((review) => `
    <article class="list-card">
      <div class="split-title">
        <strong>${review.clientName}</strong>
        <span>${"&#9733;".repeat(review.rating)}${"&#9734;".repeat(5 - review.rating)}</span>
      </div>
      <p class="muted">${review.serviceName} - ${toDateLabel(review.date)}</p>
      <p>${review.review || "Sem comentario"}</p>
    </article>
  `).join("");

  applyStagger(container, ".list-card");
}

function renderBarberBlocks() {
  const barber = getBarberSessionData();
  if (!barber) return;
  const blockList = document.getElementById("barber-blocks-list");

  if (!barber.manualBlocks.length) {
    blockList.innerHTML = "<p class='empty'>Nenhum horario bloqueado.</p>";
    return;
  }

  blockList.innerHTML = barber.manualBlocks
    .slice()
    .sort((a, b) => `${a.date}-${a.time}`.localeCompare(`${b.date}-${b.time}`))
    .map((block) => `
      <article class="list-card compact-row">
        <div>
          <strong>${toDateLabel(block.date)} ${block.time}</strong>
          <p class="muted">${block.reason || "Bloqueio manual"}</p>
        </div>
        <button class="btn-ghost danger" data-remove-block="${block.id}">Remover</button>
      </article>
    `)
    .join("");

  applyStagger(blockList, ".list-card");

  blockList.querySelectorAll("[data-remove-block]").forEach((button) => {
    button.addEventListener("click", () => removeBarberBlock(button.getAttribute("data-remove-block")));
  });
}

function renderBarberOffDays() {
  const barber = getBarberSessionData();
  if (!barber) return;
  const offdayList = document.getElementById("barber-offdays-list");

  if (!barber.offDays.length) {
    offdayList.innerHTML = "<p class='empty'>Nenhum dia de folga registrado.</p>";
    return;
  }

  offdayList.innerHTML = barber.offDays
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((date) => `
      <article class="list-card compact-row">
        <strong>${toDateLabel(date)}</strong>
        <button class="btn-ghost danger" data-remove-offday="${date}">Remover</button>
      </article>
    `)
    .join("");

  applyStagger(offdayList, ".list-card");

  offdayList.querySelectorAll("[data-remove-offday]").forEach((button) => {
    button.addEventListener("click", () => removeBarberOffDay(button.getAttribute("data-remove-offday")));
  });
}

function addBarberBlock() {
  const barber = getBarberSessionData();
  if (!barber) return;
  const date = document.getElementById("block-date").value;
  const time = document.getElementById("block-time").value;
  const reason = document.getElementById("block-reason").value.trim();
  if (!date || !time) {
    showToast("Preencha data e horario do bloqueio.", "warning");
    return;
  }

  const barbers = getBarbers();
  const target = barbers.find((item) => item.id === barber.id);
  const exists = target.manualBlocks.some((block) => block.date === date && block.time === time);
  if (exists) {
    showToast("Esse horario ja esta bloqueado.", "warning");
    return;
  }

  target.manualBlocks.push({ id: uid("block"), date, time, reason });
  saveBarbers(barbers);
  apiFireAndForget(`/barbers/${target.id}`, {
    manualBlocks: target.manualBlocks,
    offDays: target.offDays
  }, "PATCH");
  renderBarberDashboard();
  showToast("Horario bloqueado com sucesso.", "success");
}

function removeBarberBlock(blockId) {
  const barber = getBarberSessionData();
  if (!barber) return;
  const barbers = getBarbers();
  const target = barbers.find((item) => item.id === barber.id);
  target.manualBlocks = target.manualBlocks.filter((block) => block.id !== blockId);
  saveBarbers(barbers);
  apiFireAndForget(`/barbers/${target.id}`, {
    manualBlocks: target.manualBlocks,
    offDays: target.offDays
  }, "PATCH");
  renderBarberDashboard();
}

function addBarberOffDay() {
  const barber = getBarberSessionData();
  if (!barber) return;
  const date = document.getElementById("offday-date").value;
  if (!date) {
    showToast("Selecione uma data de folga.", "warning");
    return;
  }

  const barbers = getBarbers();
  const target = barbers.find((item) => item.id === barber.id);
  if (target.offDays.includes(date)) {
    showToast("Dia de folga ja registrado.", "warning");
    return;
  }

  target.offDays.push(date);
  saveBarbers(barbers);
  apiFireAndForget(`/barbers/${target.id}`, {
    manualBlocks: target.manualBlocks,
    offDays: target.offDays
  }, "PATCH");
  renderBarberDashboard();
  showToast("Folga adicionada.", "success");
}

function removeBarberOffDay(date) {
  const barber = getBarberSessionData();
  if (!barber) return;
  const barbers = getBarbers();
  const target = barbers.find((item) => item.id === barber.id);
  target.offDays = target.offDays.filter((offday) => offday !== date);
  saveBarbers(barbers);
  apiFireAndForget(`/barbers/${target.id}`, {
    manualBlocks: target.manualBlocks,
    offDays: target.offDays
  }, "PATCH");
  renderBarberDashboard();
}

function renderBarberDashboard() {
  const barber = getBarberSessionData();
  if (!barber) return;
  const filterInput = document.getElementById("barber-date-filter");
  if (!filterInput.value) filterInput.value = isoToday();
  document.getElementById("barber-greeting").textContent = barber.name;
  document.getElementById("barber-rating").textContent = `Nota media ${getBarberAverageRating(barber.id).toFixed(1)} | Comissao ${barber.commissionRate}%`;
  updateBarberKpis(filterInput.value);
  renderBarberAgenda(filterInput.value);
  renderBarberReviews();
  renderBarberBlocks();
  renderBarberOffDays();
}

function switchRole(role) {
  state.role = role;
  const clientModule = document.getElementById("module-cliente");
  const barberModule = document.getElementById("module-barbeiro");
  const targetModule = role === "cliente" ? clientModule : barberModule;

  document.querySelectorAll(".role-btn").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-role") === role);
  });

  clientModule.classList.toggle("hidden", role !== "cliente");
  barberModule.classList.toggle("hidden", role !== "barbeiro");

  targetModule.classList.remove("fade-in");
  void targetModule.offsetWidth;
  targetModule.classList.add("fade-in");
  applyModuleLoading(targetModule.id, 180);
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

function bindClientEvents() {
  document.getElementById("btn-client-login").addEventListener("click", () => {
    const name = document.getElementById("client-name").value.trim();
    const phone = normalizePhone(document.getElementById("client-phone").value.trim());
    if (!name || phone.length < 10) {
      showToast("Informe nome e WhatsApp valido.", "warning");
      return;
    }
    const client = upsertClient(name, phone);
    setClientSession(client);
    showToast("Login realizado com sucesso.", "success");
  });

  document.getElementById("btn-client-logout").addEventListener("click", clearClientSession);
  document.getElementById("btn-open-history").addEventListener("click", () => {
    document.getElementById("client-history").classList.remove("hidden");
    renderClientHistory();
  });
  document.getElementById("btn-close-history").addEventListener("click", () => {
    document.getElementById("client-history").classList.add("hidden");
  });

  document.querySelectorAll("input[name='payment']").forEach((input) => {
    input.addEventListener("change", () => {
      state.selectedPayment = input.value;
      renderPaymentState();
      renderSummary();
    });
  });

  document.getElementById("btn-confirm-booking").addEventListener("click", confirmBooking);
  document.getElementById("btn-wa-confirm").addEventListener("click", sendWhatsAppConfirmation);
  document.getElementById("btn-wa-reminder").addEventListener("click", sendWhatsAppReminder);
  document.getElementById("btn-wa-post").addEventListener("click", sendWhatsAppPostService);
  document.getElementById("btn-new-booking").addEventListener("click", resetClientFlowAfterConfirmation);
}

function bindBarberEvents() {
  document.getElementById("btn-barber-login").addEventListener("click", () => {
    const barberId = document.getElementById("barber-login-select").value;
    const pin = document.getElementById("barber-login-pin").value.trim();
    const barber = getBarbers().find((item) => item.id === barberId);
    if (!barber || barber.pin !== pin) {
      showToast("Credenciais do barbeiro invalidas.", "warning");
      return;
    }
    setBarberSession(barber);
    showToast("Login do barbeiro realizado.", "success");
  });

  document.getElementById("btn-barber-logout").addEventListener("click", clearBarberSession);
  document.getElementById("barber-date-filter").addEventListener("change", (event) => {
    updateBarberKpis(event.target.value);
    renderBarberAgenda(event.target.value);
  });

  document.getElementById("btn-block-slot").addEventListener("click", addBarberBlock);
  document.getElementById("btn-add-offday").addEventListener("click", addBarberOffDay);
}

function hydrateBarberLoginOptions() {
  const select = document.getElementById("barber-login-select");
  const barbers = getBarbers();
  select.innerHTML = barbers.map((barber) => `<option value="${barber.id}">${barber.name}</option>`).join("");
  const blockTimeSelect = document.getElementById("block-time");
  blockTimeSelect.innerHTML = SLOT_TIMES.map((slot) => `<option value="${slot}">${slot}</option>`).join("");
}

function restoreSessions() {
  const savedClient = DataStore.get(STORAGE_KEYS.clientSession, null);
  const savedBarber = DataStore.get(STORAGE_KEYS.barberSession, null);
  if (savedClient) {
    const persisted = findClientByPhone(savedClient.phone);
    if (persisted) setClientSession(persisted);
  }
  if (savedBarber) {
    const barber = getBarbers().find((item) => item.id === savedBarber.id);
    if (barber) setBarberSession(barber);
  }
}

function bindRoleSwitch() {
  document.querySelectorAll(".role-btn").forEach((button) => {
    button.addEventListener("click", () => switchRole(button.getAttribute("data-role")));
  });
}

async function init() {
  parseApiMode();
  ensureSeedData();

  if (API_SETTINGS.enabled) {
    showBootstrapSkeletons();
  }

  const hydrated = await hydrateFromApi();
  bindRoleSwitch();
  bindClientEvents();
  bindBarberEvents();
  hydrateBarberLoginOptions();
  renderPaymentState();
  restoreSessions();
  switchRole("cliente");
  document.getElementById("block-date").value = isoToday();
  document.getElementById("offday-date").value = isoToday();
  document.getElementById("barber-date-filter").value = isoToday();
  applyFloatBrand();

  // Hook pronto para integracao com API futuramente.
  window.BARBERSAAS_CONFIG = {
    apiBaseUrl: API_BASE_URL,
    apiEnabled: API_SETTINGS.enabled,
    storageKeys: STORAGE_KEYS,
    saveServices,
    enableApiMode() {
      localStorage.setItem(API_MODE_KEY, "on");
    },
    disableApiMode() {
      localStorage.setItem(API_MODE_KEY, "off");
    }
  };

  if (API_SETTINGS.enabled) {
    showToast(hydrated ? "Sincronizado com API." : "API ativa, usando cache local.", hydrated ? "success" : "warning");
  }
}

document.addEventListener("DOMContentLoaded", init);









