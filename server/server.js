import express from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHOP, SERVICES, BARBERS, THEME, FONTS, ANY_BARBER,
  barberDisplayName, availableBarbers, priceFor, toMin, toHHMM, openingHours,
} from "../src/shared/catalog.js";
import { THEMES, resolveTheme, themeCss } from "../src/shared/themes.js";

process.env.TZ ||= "America/Sao_Paulo";
const { ADMIN_PASSWORD, SESSION_SECRET, DATA_KEY, PORT = 3000, DB_PATH = "./data/studio.db", NODE_ENV, PUBLIC_URL } = process.env;
const RETENTION_DAYS = SHOP.retentionDays; // definido em shop.config.js (o site mostra o mesmo prazo ao cliente)
const isProd = NODE_ENV === "production";
const KEY = Buffer.from(DATA_KEY || "", "hex");
if (!ADMIN_PASSWORD || !SESSION_SECRET || KEY.length !== 32) throw new Error("Configure ADMIN_PASSWORD, SESSION_SECRET e DATA_KEY (64 caracteres hex) no .env — veja o README.");
if (isProd && (ADMIN_PASSWORD.length < 12 || SESSION_SECRET.length < 32)) throw new Error("Em produção, use ADMIN_PASSWORD com 12+ caracteres e SESSION_SECRET com 32+ caracteres.");

// ---------- banco (SQLite embutido no Node: sem módulos nativos para instalar) ----------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
  barber_id TEXT NOT NULL, barber_name TEXT, service_id TEXT NOT NULL, service_name TEXT, price REAL NOT NULL,
  name_enc TEXT, phone_enc TEXT, status TEXT NOT NULL DEFAULT 'confirmed',
  token_hash TEXT, client_hash TEXT, phone_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_token ON bookings(token_hash);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_hash);
CREATE TABLE IF NOT EXISTS client_accounts (
  phone_hash TEXT PRIMARY KEY, code_salt TEXT NOT NULL, code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('client_session_epoch', '0');
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, barber_id TEXT NOT NULL,
  start_min INTEGER, end_min INTEGER, reason TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_date ON schedule_blocks(date);`);

// O módulo embutido não traz "transaction" pronto; este helper faz o mesmo (tudo ou nada).
const transaction = (fn) => (...args) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(...args);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  }
};

// Nome e telefone ficam criptografados (AES-256-GCM): quem copiar o arquivo .db não lê nada sem a DATA_KEY.
const enc = (t) => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const body = Buffer.concat([c.update(t, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
};
const dec = (s) => {
  if (!s) return null;
  const b = Buffer.from(s, "base64"), d = crypto.createDecipheriv("aes-256-gcm", KEY, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
};

// LGPD: apaga nome/telefone dos atendimentos antigos (mantém só o histórico financeiro)
const deleteOrphanedClientAccounts = () => db.prepare(`DELETE FROM client_accounts
  WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.phone_hash=client_accounts.phone_hash OR b.client_hash=client_accounts.phone_hash)`).run();
const purge = () => {
  db.prepare(`UPDATE bookings SET name_enc=NULL, phone_enc=NULL, phone_hash=NULL, client_hash=NULL
    WHERE date < date('now', 'localtime', ?) AND (name_enc IS NOT NULL OR phone_enc IS NOT NULL OR phone_hash IS NOT NULL OR client_hash IS NOT NULL)`).run(`-${RETENTION_DAYS} days`);
  // o link secreto do cliente expira 1 dia após o atendimento (minimização de dados)
  db.prepare("UPDATE bookings SET token_hash=NULL WHERE date < date('now', 'localtime', '-1 day') AND token_hash IS NOT NULL").run();
  deleteOrphanedClientAccounts();
};
purge();
setInterval(purge, 864e5).unref();

// Intervalos ocupados do dia: agendamentos + bloqueios (barber_id '*' = todas as profissionais)
const busyOf = (date) => {
  const bookings = db.prepare("SELECT barber_id AS barberId, start_min AS start, end_min AS end FROM bookings WHERE date=? AND status!='cancelled'").all(date);
  const blocks = db.prepare("SELECT barber_id AS barberId, COALESCE(start_min, 0) AS start, COALESCE(end_min, 1440) AS end FROM schedule_blocks WHERE date=?").all(date);
  const expanded = blocks.flatMap((b) => (b.barberId === "*" ? BARBERS.map((x) => ({ ...b, barberId: x.id })) : [b]));
  return [...bookings, ...expanded].map((r) => ({ barberId: r.barberId, start: r.start, end: r.end }));
};
const validDate = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return null;
  const [y, m, dd] = d.split("-").map(Number), dt = new Date(y, m - 1, dd);
  return dt.getMonth() === m - 1 && dt.getDate() === dd ? dt : null;
};
const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

// ---------- sessões e códigos ----------
const sign = (v) => crypto.createHmac("sha256", SESSION_SECRET).update(String(v)).digest("hex");
const h = (x) => crypto.createHash("sha256").update(String(x)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(h(a), h(b));
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");
const phoneHash = (digits) => {
  const raw = String(digits || "").replace(/\D/g, "");
  const canonical = raw.startsWith("55") && raw.length > 11 ? raw.slice(2) : raw;
  return crypto.createHmac("sha256", KEY).update(`phone:${canonical}`).digest("hex");
};
const normalizeAccessCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const accessCodeHash = (code, salt) => crypto.scryptSync(normalizeAccessCode(code), salt, 32).toString("hex");
const makeAccessCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = Array.from({ length: 12 }, () => alphabet[crypto.randomInt(alphabet.length)]);
  return `${chars.slice(0, 6).join("")}-${chars.slice(6).join("")}`;
};
function verifyAccessCode(code, account) {
  if (!/^[A-Z0-9]{12}$/.test(normalizeAccessCode(code))) return false;
  return safeEq(accessCodeHash(code, account.code_salt), account.code_hash);
}
const cookieFlags = `HttpOnly; SameSite=Strict; Path=/${isProd ? "; Secure" : ""}`;
function auth(req, res, next) {
  res.set("Cache-Control", "no-store");
  const m = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || "");
  if (m) {
    const [exp, sig] = m[1].split(".");
    if (Number(exp) > Date.now() && sig && safeEq(sig, sign(exp))) return next();
  }
  res.status(401).json({ error: "não autorizado" });
}
const getClientSessionEpoch = () => db.prepare("SELECT value FROM app_settings WHERE key='client_session_epoch'").get()?.value || "0";
function clientAuth(req, res, next) {
  res.set("Cache-Control", "no-store");
  const match = /(?:^|; )client_sid=([^;]+)/.exec(req.headers.cookie || "");
  if (match) {
    const [exp, accountHash, epoch, signature] = match[1].split(".");
    if (Number(exp) > Date.now() && /^[a-f0-9]{64}$/.test(accountHash || "") &&
      epoch === getClientSessionEpoch() && signature && safeEq(signature, sign(`client:${exp}:${accountHash}:${epoch}`)) &&
      db.prepare("SELECT 1 FROM client_accounts WHERE phone_hash=?").get(accountHash)) {
      req.clientHash = accountHash;
      return next();
    }
  }
  res.status(401).json({ error: "não autorizado" });
}
function setClientCookie(res, accountHash) {
  const exp = Date.now() + 7 * 24 * 3600e3;
  const epoch = getClientSessionEpoch();
  res.setHeader("Set-Cookie", `client_sid=${exp}.${accountHash}.${epoch}.${sign(`client:${exp}:${accountHash}:${epoch}`)}; ${cookieFlags}; Max-Age=604800`);
}

// ---------- página inicial: título, SEO e tema gerados a partir de shop.config.js ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const baseUrl = PUBLIC_URL ? PUBLIC_URL.replace(/\/+$/, "") : "";
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function structuredData() {
  const a = SHOP.address;
  return {
    "@context": "https://schema.org",
    "@type": "NailSalon",
    name: SHOP.name,
    description: SHOP.description,
    telephone: `+${SHOP.whatsapp}`,
    ...(baseUrl && { url: baseUrl }),
    ...(a && { address: { "@type": "PostalAddress", streetAddress: a.street, addressLocality: a.city, addressRegion: a.state, postalCode: a.zip, addressCountry: "BR" } }),
    openingHoursSpecification: openingHours().map((d) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS_EN[d.dow], opens: d.opens, closes: d.closes })),
    ...(SHOP.instagram && { sameAs: [SHOP.instagram] }),
  };
}
function headFor(theme) {
  const title = `${SHOP.name} · Agende seu horário`;
  return [
    `<meta name="description" content="${esc(SHOP.description)}" />`,
    `<meta name="theme-color" content="${theme.brandBg}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(SHOP.description)}" />`,
    baseUrl && `<meta property="og:url" content="${esc(baseUrl)}" />`,
    baseUrl && `<link rel="canonical" href="${esc(baseUrl)}/" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<style id="theme">${themeCss(theme, FONTS)}</style>`,
    `<script type="application/ld+json">${JSON.stringify(structuredData()).replace(/</g, "\\u003c")}</script>`,
  ].filter(Boolean).join("\n    ");
}
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist");
function renderIndex(req) {
  const file = path.join(dist, "index.html");
  if (!fs.existsSync(file)) return null;
  const theme = SHOP.demoThemes && THEMES[String(req.query.tema || "")] ? resolveTheme(String(req.query.tema)) : THEME;
  const head = headFor(theme);
  let html = fs.readFileSync(file, "utf8").replace(/<title>[^<]*<\/title>/i, `<title>${esc(SHOP.name)} · Agende seu horário</title>`);
  // se o build mudar a marca de lugar, injeta antes de </head> (o site continua com título, SEO e tema)
  html = html.includes("<!--SHOP_HEAD-->") ? html.replace("<!--SHOP_HEAD-->", () => head) : html.replace("</head>", () => `${head}\n</head>`);
  return html;
}

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "10kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", rateLimit({ windowMs: 60e3, limit: 120 }));
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.get("/manifest.webmanifest", (_req, res) => {
  res.type("application/manifest+json").json({
    name: SHOP.name, short_name: SHOP.shortName || SHOP.name.slice(0, 12), description: SHOP.description,
    start_url: "/", display: "standalone", lang: "pt-BR", background_color: THEME.bg, theme_color: THEME.brandBg,
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  });
});
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *\nDisallow: /admin\nDisallow: /meu-agendamento\nDisallow: /api/\n${baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml\n` : ""}`);
});
app.get("/sitemap.xml", (_req, res) => {
  if (!baseUrl) return res.status(404).end();
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(baseUrl)}/</loc></url></urlset>`);
});

// Público: só devolve intervalos ocupados — nunca nomes ou telefones
app.get("/api/availability", (req, res) => {
  if (!validDate(req.query.date)) return res.status(400).json({ error: "data inválida" });
  res.json({ busy: busyOf(req.query.date) });
});

app.post("/api/bookings", rateLimit({ windowMs: 3600e3, limit: 10, skipFailedRequests: true }), (req, res) => {
  const { serviceId, barberId, date, time, name, phone, consent, accessCode } = req.body || {};
  const service = SERVICES.find((s) => s.id === serviceId);
  const day = validDate(date);
  const digits = String(phone || "").replace(/\D/g, "");
  const cleanName = String(name || "").trim().slice(0, 80);
  const now = new Date(), today = startOfToday();
  const lastAllowedDay = new Date(today);
  lastAllowedDay.setDate(lastAllowedDay.getDate() + SHOP.bookAheadDays);
  const choice = barberId === ANY_BARBER.id ? ANY_BARBER : BARBERS.find((b) => b.id === barberId);
  if (
    !service || !choice || !day || !/^\d{2}:\d{2}$/.test(String(time)) || cleanName.length < 2 ||
    digits.length < 10 || digits.length > 13 || consent !== true ||
    (service.barbers && choice.id !== ANY_BARBER.id && !service.barbers.includes(choice.id)) ||
    day < today || day > lastAllowedDay ||
    (day.getTime() === today.getTime() && toMin(time) <= now.getHours() * 60 + now.getMinutes())
  ) return res.status(400).json({ error: "dados inválidos" });

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url"); // 256 bits, impossível de adivinhar
  const phoneKey = phoneHash(digits);
  // transação: checa conflito e grava de forma atômica (sem overbooking)
  const result = transaction(() => {
    const busy = busyOf(date);
    const candidates = availableBarbers(service, choice, day.getDay(), time, busy);
    if (!candidates.length) return { unavailable: true };
    // "sem preferência": escolhe quem tem menos atendimentos no dia (distribui o movimento)
    const load = (b) => busy.filter((x) => x.barberId === b.id).length;
    const barber = candidates.reduce((best, b) => (load(b) < load(best) ? b : best), candidates[0]);
    let account = db.prepare("SELECT phone_hash, code_salt, code_hash FROM client_accounts WHERE phone_hash=?").get(phoneKey);
    let newAccessCode = null;
    if (account && !verifyAccessCode(accessCode, account)) return { needsCode: true };
    if (!account) {
      newAccessCode = makeAccessCode();
      const salt = crypto.randomBytes(16).toString("hex");
      db.prepare("INSERT INTO client_accounts (phone_hash, code_salt, code_hash) VALUES (?,?,?)").run(phoneKey, salt, accessCodeHash(newAccessCode, salt));
      account = { phone_hash: phoneKey };
    }
    const s = toMin(time);
    db.prepare(`INSERT INTO bookings (id,date,start_min,end_min,barber_id,barber_name,service_id,service_name,price,name_enc,phone_enc,token_hash,client_hash,phone_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, date, s, s + service.duration, barber.id, barber.name, service.id, service.name, priceFor(service, barber.id), enc(cleanName), enc(digits), hashToken(token), phoneKey, phoneKey);
    return { barber, accessCode: newAccessCode };
  })();
  if (result.unavailable) return res.status(409).json({ error: "horário indisponível" });
  if (result.needsCode) return res.status(403).json({ error: "código de acesso necessário" });
  res.status(201).json({
    id, accessToken: token, accessCode: result.accessCode, time, service: service.name,
    barberName: result.barber.name, price: priceFor(service, result.barber.id),
  });
});

// Cliente: vê e gerencia SOMENTE o próprio agendamento, usando o token secreto recebido na reserva.
// O token viaja no corpo do POST (nunca em URL/log); no banco só existe o hash.
const mineLimit = rateLimit({ windowMs: 15 * 60e3, limit: 40 });
function mine(req, res, next) {
  res.set("Cache-Control", "no-store");
  const t = String(req.body?.token || "");
  const row = /^[A-Za-z0-9_-]{43}$/.test(t)
    ? db.prepare("SELECT * FROM bookings WHERE token_hash=? AND date >= date('now', 'localtime', '-1 day')").get(hashToken(t))
    : null;
  if (!row) return res.status(404).json({ error: "agendamento não encontrado" }); // resposta única: não revela nada
  req.booking = row;
  next();
}
const canCancel = (r) => {
  const [y, m, d] = r.date.split("-").map(Number);
  return r.status === "confirmed" && new Date(y, m - 1, d, 0, r.start_min) > new Date();
};
const publicBooking = (r) => ({
  key: r.id, id: r.id.slice(-8), date: r.date, time: toHHMM(r.start_min), end: toHHMM(r.end_min), price: r.price, status: r.status,
  barberName: r.barber_name || barberDisplayName(r.barber_id), service: r.service_name || SERVICES.find((s) => s.id === r.service_id)?.name,
  name: dec(r.name_enc), canCancel: canCancel(r),
});
app.post("/api/my-booking", mineLimit, mine, (req, res) => res.json(publicBooking(req.booking)));
app.post("/api/my-booking/cancel", mineLimit, mine, (req, res) => {
  if (!canCancel(req.booking)) return res.status(409).json({ error: "não é possível cancelar" });
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(req.booking.id);
  res.json({ ok: true });
});
// Direito de exclusão (LGPD art. 18): apaga os dados pessoais, revoga o link e libera o horário se ainda for futuro
app.post("/api/my-booking/erase", mineLimit, mine, (req, res) => {
  const status = canCancel(req.booking) ? "cancelled" : req.booking.status;
  db.prepare("UPDATE bookings SET name_enc=NULL, phone_enc=NULL, token_hash=NULL, client_hash=NULL, phone_hash=NULL, status=? WHERE id=?").run(status, req.booking.id);
  deleteOrphanedClientAccounts();
  res.json({ ok: true });
});

// Criação do primeiro código exige o link secreto da própria reserva; nenhum acesso é dado só pelo telefone.
app.post("/api/my-booking/create-access-code", mineLimit, mine, (req, res) => {
  const digits = dec(req.booking.phone_enc);
  if (!digits) return res.status(409).json({ error: "dados indisponíveis" });
  const key = phoneHash(digits);
  if (db.prepare("SELECT 1 FROM client_accounts WHERE phone_hash=?").get(key)) return res.status(409).json({ error: "já existe código para este celular" });
  const accessCode = makeAccessCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const create = transaction(() => {
    db.prepare("INSERT INTO client_accounts (phone_hash, code_salt, code_hash) VALUES (?,?,?)").run(key, salt, accessCodeHash(accessCode, salt));
    db.prepare("UPDATE bookings SET client_hash=?, phone_hash=? WHERE id=?").run(key, key, req.booking.id);
  });
  try {
    create();
    setClientCookie(res, key);
    res.status(201).json({ accessCode });
  } catch {
    res.status(409).json({ error: "não foi possível criar o código" });
  }
});

const clientLoginLimit = rateLimit({ windowMs: 15 * 60e3, limit: 8 });
app.post("/api/client/login", clientLoginLimit, (req, res) => {
  res.set("Cache-Control", "no-store");
  const digits = String(req.body?.phone || "").replace(/\D/g, "");
  const code = normalizeAccessCode(req.body?.accessCode);
  const key = digits.length >= 10 && digits.length <= 13 ? phoneHash(digits) : "";
  const account = key ? db.prepare("SELECT phone_hash, code_salt, code_hash FROM client_accounts WHERE phone_hash=?").get(key) : null;
  const valid = account ? verifyAccessCode(code, account) : false;
  if (!valid) return res.status(401).json({ error: "telefone ou código incorretos" });
  setClientCookie(res, key);
  res.json({ ok: true });
});
app.post("/api/client/logout", (req, res) => {
  res.setHeader("Set-Cookie", `client_sid=; ${cookieFlags}; Max-Age=0`);
  res.json({ ok: true });
});
app.get("/api/client/bookings", clientAuth, (req, res) => {
  const bookings = db.prepare("SELECT * FROM bookings WHERE client_hash=? ORDER BY date DESC, start_min DESC").all(req.clientHash).map(publicBooking);
  res.json({ bookings });
});
app.post("/api/client/link-booking", clientAuth, (req, res) => {
  const token = String(req.body?.token || "");
  const row = /^[A-Za-z0-9_-]{43}$/.test(token)
    ? db.prepare("SELECT * FROM bookings WHERE token_hash=? AND date >= date('now', 'localtime', '-1 day')").get(hashToken(token))
    : null;
  if (!row || !row.phone_enc || !safeEq(phoneHash(dec(row.phone_enc)), req.clientHash)) return res.status(404).json({ error: "agendamento não encontrado" });
  db.prepare("UPDATE bookings SET client_hash=? WHERE id=?").run(req.clientHash, row.id);
  res.json({ ok: true });
});
app.post("/api/client/bookings/:id/cancel", clientAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM bookings WHERE id=? AND client_hash=?").get(req.params.id, req.clientHash);
  if (!row || !canCancel(row)) return res.status(409).json({ error: "não é possível cancelar" });
  db.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND client_hash=?").run(row.id, req.clientHash);
  res.json({ ok: true });
});
app.delete("/api/client/bookings/:id", clientAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM bookings WHERE id=? AND client_hash=?").get(req.params.id, req.clientHash);
  if (!row) return res.status(404).json({ error: "agendamento não encontrado" });
  const status = canCancel(row) ? "cancelled" : row.status;
  db.prepare("UPDATE bookings SET name_enc=NULL, phone_enc=NULL, token_hash=NULL, client_hash=NULL, phone_hash=NULL, status=? WHERE id=?").run(status, row.id);
  deleteOrphanedClientAccounts();
  res.json({ ok: true });
});

// ---------- Admin ----------
app.post("/api/admin/login", rateLimit({ windowMs: 15 * 60e3, limit: 5 }), (req, res) => {
  if (!safeEq(req.body?.password ?? "", ADMIN_PASSWORD)) return res.status(401).json({ error: "senha incorreta" });
  const exp = Date.now() + 8 * 3600e3;
  res.setHeader("Set-Cookie", `sid=${exp}.${sign(exp)}; ${cookieFlags}; Max-Age=28800`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", `sid=; ${cookieFlags}; Max-Age=0`);
  res.json({ ok: true });
});
app.post("/api/admin/reset-agenda", auth, rateLimit({ windowMs: 3600e3, limit: 2 }), (req, res) => {
  if (req.body?.confirmation !== "ZERAR A AGENDA") return res.status(400).json({ error: "confirmação inválida" });
  const result = transaction(() => {
    const bookings = db.prepare("DELETE FROM bookings").run().changes;
    const blocks = db.prepare("DELETE FROM schedule_blocks").run().changes;
    const accounts = db.prepare("DELETE FROM client_accounts").run().changes;
    db.prepare("UPDATE app_settings SET value=CAST(value AS INTEGER)+1 WHERE key='client_session_epoch'").run();
    return { bookings, blocks, accounts };
  })();
  res.json({ ok: true, ...result });
});
app.get("/api/admin/bookings", auth, (req, res) => {
  const all = req.query.all === "1";
  if (!all && !validDate(req.query.date)) return res.status(400).json({ error: "data inválida" });
  // A agenda completa continua atrás do login; dados pessoais nunca vão para o site público.
  const rows = all
    ? db.prepare("SELECT * FROM bookings ORDER BY date DESC, start_min").all()
    : db.prepare("SELECT * FROM bookings WHERE date=? ORDER BY start_min").all(req.query.date);
  res.json({ bookings: rows.map((r) => ({ ...publicBooking(r), id: r.id, phone: dec(r.phone_enc) })) });
});
app.get("/api/admin/blocks", auth, (req, res) => {
  if (!validDate(req.query.date)) return res.status(400).json({ error: "data inválida" });
  const blocks = db.prepare("SELECT id, date, barber_id AS barberId, start_min AS start, end_min AS end, reason FROM schedule_blocks WHERE date=? ORDER BY start_min").all(req.query.date);
  res.json({ blocks: blocks.map((b) => ({ ...b, barberName: b.barberId === "*" ? "Todas as profissionais" : barberDisplayName(b.barberId), allDay: b.start == null })) });
});
app.post("/api/admin/blocks", auth, (req, res) => {
  const { date, start, end, reason = "" } = req.body || {};
  const barberId = req.body?.barberId ?? (BARBERS.length === 1 ? BARBERS[0].id : null);
  const day = validDate(date);
  const allDay = start == null && end == null;
  const step = SHOP.slotMinutes;
  const validRange = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 1440 && end > start && start % step === 0 && end % step === 0;
  const validBarber = barberId === "*" || BARBERS.some((b) => b.id === barberId);
  const today = startOfToday();
  if (!day || !validBarber || day < today || (!allDay && !validRange) ||
    (day.getTime() === today.getTime() && !allDay && start <= new Date().getHours() * 60 + new Date().getMinutes()))
    return res.status(400).json({ error: "bloqueio inválido" });
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO schedule_blocks (id, date, barber_id, start_min, end_min, reason) VALUES (?,?,?,?,?,?)")
    .run(id, date, barberId, allDay ? null : start, allDay ? null : end, String(reason).trim().slice(0, 120));
  res.status(201).json({ ok: true, id });
});
app.delete("/api/admin/blocks/:id", auth, (req, res) => {
  const result = db.prepare("DELETE FROM schedule_blocks WHERE id=?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "bloqueio não encontrado" });
  res.json({ ok: true });
});
app.get("/api/admin/report", auth, (req, res) => {
  const month = String(req.query.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: "mês inválido" });
  const range = [`${month}-01`, `${month}-01`];
  const where = "status='done' AND date >= ? AND date < date(?, '+1 month')";
  const services = db.prepare(`SELECT COALESCE(service_name, service_id) AS name, COUNT(*) AS count, SUM(price) AS revenue FROM bookings WHERE ${where} GROUP BY 1 ORDER BY revenue DESC`).all(...range)
    .map((r) => ({ service: r.name, count: r.count, revenue: r.revenue || 0 }));
  const barbers = db.prepare(`SELECT COALESCE(barber_name, barber_id) AS name, COUNT(*) AS count, SUM(price) AS revenue FROM bookings WHERE ${where} GROUP BY 1 ORDER BY revenue DESC`).all(...range)
    .map((r) => ({ barber: r.name, count: r.count, revenue: r.revenue || 0 }));
  res.json({
    month, completed: services.reduce((s, i) => s + i.count, 0), revenue: services.reduce((s, i) => s + i.revenue, 0), services, barbers,
  });
});
app.patch("/api/admin/bookings/:id", auth, (req, res) => {
  if (!["confirmed", "done", "no_show", "cancelled"].includes(req.body?.status)) return res.status(400).json({ error: "status inválido" });
  db.prepare("UPDATE bookings SET status=? WHERE id=?").run(req.body.status, req.params.id);
  res.json({ ok: true });
});
// Direito de exclusão (LGPD): apaga só os dados pessoais do cliente
app.delete("/api/admin/bookings/:id", auth, (req, res) => {
  db.prepare("UPDATE bookings SET name_enc=NULL, phone_enc=NULL, token_hash=NULL, client_hash=NULL, phone_hash=NULL WHERE id=?").run(req.params.id);
  deleteOrphanedClientAccounts();
  res.json({ ok: true });
});
app.use("/api", (_req, res) => res.status(404).json({ error: "não encontrado" }));

// ---------- site (arquivos do build) ----------
app.use(["/admin", "/meu-agendamento"], (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
app.use(express.static(dist, {
  index: false,
  setHeaders(res, filePath) {
    const normalized = filePath.split(path.sep).join("/");
    // Os arquivos de /assets/ têm o conteúdo no nome (Vite): um novo build gera nomes novos.
    if (normalized.includes("/assets/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    else res.setHeader("Cache-Control", "public, max-age=86400");
  },
}));
app.get("*", (req, res) => {
  const html = renderIndex(req);
  if (!html) return res.status(503).type("text/plain").send("Site ainda não foi compilado. Rode: npm run build");
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(html);
});

const server = app.listen(PORT, () => console.log(`${SHOP.name}: rodando em http://localhost:${PORT}`));
const shutdown = () => {
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
