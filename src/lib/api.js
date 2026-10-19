// Toda a comunicação com o servidor fica aqui.
const send = (url, method, body) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });

export async function getAvailability(date) {
  const r = await fetch(`/api/availability?date=${date}`);
  if (!r.ok) throw new Error("availability");
  return (await r.json()).busy;
}

export async function createBooking(payload) {
  const r = await send("/api/bookings", "POST", payload);
  if (r.status === 409) return { conflict: true };
  if (r.status === 403) return { requiresAccessCode: true };
  if (r.status === 429) return { rateLimited: true };
  if (r.status === 400) return { invalid: true };
  if (!r.ok) throw new Error("booking");
  return { booking: await r.json() };
}

export const adminApi = {
  login: (password) => send("/api/admin/login", "POST", { password }),
  logout: () => send("/api/admin/logout", "POST", {}),
  list: (date, all = false) => fetch(all ? "/api/admin/bookings?all=1" : `/api/admin/bookings?date=${date}`),
  setStatus: (id, status) => send(`/api/admin/bookings/${id}`, "PATCH", { status }),
  erase: (id) => send(`/api/admin/bookings/${id}`, "DELETE"),
  resetAgenda: (confirmation) => send("/api/admin/reset-agenda", "POST", { confirmation }),
  blocks: (date) => fetch(`/api/admin/blocks?date=${date}`),
  addBlock: (payload) => send("/api/admin/blocks", "POST", payload),
  removeBlock: (id) => fetch(`/api/admin/blocks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  report: (month) => fetch(`/api/admin/report?month=${month}`),
};

// Área do cliente: sempre autenticada pelo token secreto (nunca por telefone/nome)
export const myBookingApi = {
  get: (token) => send("/api/my-booking", "POST", { token }),
  cancel: (token) => send("/api/my-booking/cancel", "POST", { token }),
  erase: (token) => send("/api/my-booking/erase", "POST", { token }),
  createAccessCode: (token) => send("/api/my-booking/create-access-code", "POST", { token }),
};

export const clientApi = {
  login: (phone, accessCode) => send("/api/client/login", "POST", { phone, accessCode }),
  logout: () => send("/api/client/logout", "POST", {}),
  list: () => fetch("/api/client/bookings"),
  link: (token) => send("/api/client/link-booking", "POST", { token }),
  cancel: (id) => send(`/api/client/bookings/${encodeURIComponent(id)}/cancel`, "POST", {}),
  erase: (id) => fetch(`/api/client/bookings/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
