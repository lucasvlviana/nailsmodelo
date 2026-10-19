// Os links secretos ficam neste aparelho e dão acesso apenas às reservas correspondentes.
const KEY = "bb_access_tokens";
const LEGACY_KEY = "bb_access_token";
const validToken = (token) => /^[A-Za-z0-9_-]{43}$/.test(String(token || ""));

export function getTokens() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    const tokens = Array.isArray(parsed) ? parsed.filter(validToken) : [];
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (validToken(legacy) && !tokens.includes(legacy)) tokens.push(legacy);
    localStorage.setItem(KEY, JSON.stringify(tokens));
    localStorage.removeItem(LEGACY_KEY);
    return tokens;
  } catch {
    return [];
  }
}

export function getToken() {
  return getTokens().at(-1) || null;
}

export function saveToken(token) {
  if (!validToken(token)) return;
  const tokens = getTokens();
  if (!tokens.includes(token)) tokens.push(token);
  try { localStorage.setItem(KEY, JSON.stringify(tokens)); } catch { /* navegação privada: ignora */ }
}

export function removeToken(token) {
  try { localStorage.setItem(KEY, JSON.stringify(getTokens().filter((item) => item !== token))); } catch { /* ignora */ }
}

export function clearTokens() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignora */ }
}

export const clearToken = clearTokens;
