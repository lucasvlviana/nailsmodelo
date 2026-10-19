// Regras da agenda, compartilhadas entre o site e o servidor (uma única fonte de verdade).
// Tudo vem de shop.config.js — não há nada específico de studio neste arquivo.
import { SHOP } from "./shop.config.js";
import { resolveTheme, DEFAULT_FONTS } from "./themes.js";

export { SHOP };
export const SERVICES = SHOP.services;
export const BARBERS = SHOP.barbers;
export const THEME = resolveTheme(SHOP.theme);
export const FONTS = { ...DEFAULT_FONTS, ...(SHOP.fonts || {}) };
export const ANY_BARBER = { id: "qualquer", name: "Sem preferência" };
export const retentionLabel = SHOP.retentionDays >= 60 ? `${Math.round(SHOP.retentionDays / 30)} meses` : `${SHOP.retentionDays} dias`;

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WEEKDAYS_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ---------- utilidades de tempo ----------
export const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const formatDay = (d) => `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
export function nextDays(n) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(d);
  }
  return out;
}

// ---------- validação da configuração (falha cedo, com mensagem clara) ----------
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function validateConfig() {
  const fail = (msg) => {
    throw new Error(`shop.config.js: ${msg}`);
  };
  if (!SHOP.name?.trim()) fail("preencha o nome do studio (name).");
  if (!/^\d{12,13}$/.test(String(SHOP.whatsapp || ""))) fail('whatsapp deve ter só dígitos, com 55 + DDD + número (ex.: "5511987654321").');
  if (!Number.isInteger(SHOP.slotMinutes) || SHOP.slotMinutes < 5 || 1440 % SHOP.slotMinutes !== 0) fail("slotMinutes deve ser um número como 15, 20, 30 ou 60.");
  if (!Array.isArray(SHOP.closedWeekdays) || SHOP.closedWeekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) fail("closedWeekdays deve ser uma lista de números de 0 (domingo) a 6 (sábado).");
  if (!Number.isInteger(SHOP.bookAheadDays) || SHOP.bookAheadDays < 1 || SHOP.bookAheadDays > 90) fail("bookAheadDays deve ser um número de 1 a 90.");
  const checkLunch = (lunch, where) => {
    if (lunch == null) return;
    if (!HHMM.test(lunch.start) || !HHMM.test(lunch.end) || toMin(lunch.start) >= toMin(lunch.end)) fail(`${where}: horário de almoço inválido (use "12:00" e "13:00").`);
  };
  checkLunch(SHOP.lunch, "lunch");
  if (!Number.isInteger(SHOP.retentionDays) || SHOP.retentionDays < 1) fail("retentionDays deve ser um número de dias (ex.: 180).");
  if (SHOP.credit && (!SHOP.credit.name || !/^https?:\/\//.test(SHOP.credit.url || ""))) fail("credit deve ter name e url (começando com https://), ou ser null.");

  if (!Array.isArray(BARBERS) || !BARBERS.length) fail("cadastre pelo menos uma profissional em barbers.");
  const barberIds = new Set();
  for (const b of BARBERS) {
    if (!/^[a-z0-9_-]+$/.test(b.id || "")) fail(`profissional "${b.name}": id deve ter só letras minúsculas sem acento, números, - ou _ (ex.: "rafa").`);
    if (b.id === ANY_BARBER.id || b.id === "*") fail(`profissional "${b.name}": o id "${b.id}" é reservado.`);
    if (barberIds.has(b.id)) fail(`profissional com id repetido: "${b.id}".`);
    barberIds.add(b.id);
    if (!b.name?.trim()) fail(`profissional "${b.id}": falta o nome.`);
    if (!HHMM.test(b.start) || !HHMM.test(b.end) || toMin(b.start) >= toMin(b.end)) fail(`profissional "${b.name}": start/end inválidos (use "09:00" e "19:00").`);
    if (b.daysOff && (!Array.isArray(b.daysOff) || b.daysOff.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) fail(`profissional "${b.name}": daysOff deve ser uma lista como [1] ou [1, 2].`);
    checkLunch(b.lunch, `profissional "${b.name}"`);
  }

  if (!Array.isArray(SERVICES) || !SERVICES.length) fail("cadastre pelo menos um serviço em services.");
  const serviceIds = new Set();
  for (const s of SERVICES) {
    if (!/^[a-z0-9_-]+$/.test(s.id || "")) fail(`serviço "${s.name}": id deve ter só letras minúsculas sem acento, números, - ou _ (ex.: "corte").`);
    if (serviceIds.has(s.id)) fail(`serviço com id repetido: "${s.id}".`);
    serviceIds.add(s.id);
    if (!s.name?.trim()) fail(`serviço "${s.id}": falta o nome.`);
    if (!Number.isInteger(s.duration) || s.duration < 5 || s.duration > 480) fail(`serviço "${s.name}": duration deve ser em minutos (ex.: 30).`);
    for (const id of s.barbers || []) if (!barberIds.has(id)) fail(`serviço "${s.name}": profissional "${id}" (em barbers) não existe.`);
    const pool = servicePool(s);
    if (!pool.length) fail(`serviço "${s.name}": nenhuma profissional faz este serviço.`);
    if (typeof s.price === "number") {
      if (!(s.price >= 0)) fail(`serviço "${s.name}": preço inválido.`);
    } else if (s.price && typeof s.price === "object") {
      for (const b of pool) if (!(s.price[b.id] >= 0)) fail(`serviço "${s.name}": falta o preço para a profissional "${b.id}".`);
      for (const id of Object.keys(s.price)) if (!barberIds.has(id)) fail(`serviço "${s.name}": preço para "${id}", que não é uma profissional cadastrado.`);
    } else fail(`serviço "${s.name}": preencha o preço (price).`);
  }
}

// ---------- profissionais e agenda ----------
export function barberDisplayName(id) {
  return BARBERS.find((b) => b.id === id)?.name || "Profissional anterior";
}
export const lunchOf = (barber) => (barber.lunch !== undefined ? barber.lunch : SHOP.lunch);
export const worksOn = (barber, dow) => !SHOP.closedWeekdays.includes(dow) && !(barber.daysOff || []).includes(dow);
export const servicePool = (service) => (service.barbers?.length ? BARBERS.filter((b) => service.barbers.includes(b.id)) : BARBERS);

// horários de início do dia de uma profissional (respeitando o almoço)
export function slotsFor(barber) {
  const out = [];
  const lunch = lunchOf(barber);
  for (let m = toMin(barber.start); m < toMin(barber.end); m += SHOP.slotMinutes) {
    if (lunch && m >= toMin(lunch.start) && m < toMin(lunch.end)) continue;
    out.push(toHHMM(m));
  }
  return out;
}

// Horários de funcionamento do dia (junta todas as profissionais) — usado no SEO e no painel
export function dayRange() {
  const start = Math.min(...BARBERS.map((b) => toMin(b.start)));
  const end = Math.max(...BARBERS.map((b) => toMin(b.end)));
  return { start, end };
}
export function blockTimes() {
  const { start, end } = dayRange();
  const out = [];
  for (let m = start; m <= end; m += SHOP.slotMinutes) out.push(toHHMM(m));
  return out;
}
export function openingHours() {
  const out = [];
  for (let dow = 0; dow < 7; dow++) {
    const working = BARBERS.filter((b) => worksOn(b, dow));
    if (!working.length) continue;
    out.push({ dow, opens: toHHMM(Math.min(...working.map((b) => toMin(b.start)))), closes: toHHMM(Math.max(...working.map((b) => toMin(b.end)))) });
  }
  return out;
}

// ---------- preços ----------
export function priceFor(service, barberId) {
  if (typeof service.price === "number") return service.price;
  if (barberId && service.price[barberId] != null) return service.price[barberId];
  return Math.min(...Object.values(service.price));
}
export const money = (value) => {
  const n = Number(value) || 0;
  return `R$ ${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")}`;
};
export function priceLabel(service) {
  const prefix = service.priceFrom ? "a partir de " : "";
  const values = servicePool(service).map((b) => priceFor(service, b.id));
  const min = Math.min(...values), max = Math.max(...values);
  return `${prefix}${min === max ? money(min) : `${money(min)}–${String(max).replace(".", ",")}`}`;
}

// ---------- disponibilidade ----------
// Profissionais que podem atender esse serviço nesse dia/horário (livres), na ordem do cadastro.
// barberChoice: { id } da profissional escolhido, ou { id: "qualquer" }.
// busy: [{ barberId, start, end }] em minutos (agendamentos + bloqueios).
export function availableBarbers(service, barberChoice, dow, slot, busy) {
  const pool = servicePool(service).filter((b) => barberChoice.id === ANY_BARBER.id || b.id === barberChoice.id);
  const s = toMin(slot), e = s + service.duration;
  return pool.filter((b) => {
    if (!worksOn(b, dow) || !slotsFor(b).includes(slot)) return false;
    if (e > toMin(b.end)) return false;
    const lunch = lunchOf(b);
    if (lunch && s < toMin(lunch.end) && e > toMin(lunch.start)) return false;
    return !busy.some((x) => x.barberId === b.id && s < x.end && e > x.start);
  });
}
export const findAvailableBarber = (service, barberChoice, dow, slot, busy) => availableBarbers(service, barberChoice, dow, slot, busy)[0] || null;

validateConfig();
