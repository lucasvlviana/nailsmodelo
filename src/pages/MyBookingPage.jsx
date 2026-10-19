import { useState, useEffect, useMemo } from "react";
import { MessageCircle, Home, CalendarDays } from "lucide-react";
import { SHOP, formatDay } from "../shared/catalog.js";
import { myBookingApi, clientApi } from "../lib/api.js";
import { getTokens, saveToken, removeToken, clearTokens } from "../lib/token.js";
import SummaryRow from "../components/SummaryRow.jsx";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import "../styles/booking.css";

const STATUS = { confirmed: "Confirmado", done: "Concluído", no_show: "Não compareceu", cancelled: "Cancelado" };
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

function readTokens() {
  const token = location.hash.slice(1);
  if (token) {
    saveToken(token);
    history.replaceState(null, "", location.pathname);
  }
  return getTokens();
}

function itemFor(token, booking) {
  return { key: booking.key || booking.bookingKey || token || booking.id, token, booking };
}

export default function MyBookingPage() {
  const [tokens, setTokens] = useState(readTokens);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [phone, setPhone] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [newCode, setNewCode] = useState("");
  const [reportMonth, setReportMonth] = useState(currentMonth);

  const monthlySummary = useMemo(() => {
    const inMonth = records.map((item) => item.booking).filter((booking) => booking.date.startsWith(reportMonth));
    const completed = inMonth.filter((booking) => booking.status === "done");
    const upcoming = inMonth.filter((booking) => booking.status === "confirmed" && booking.canCancel);
    const byService = new Map();
    for (const booking of completed) {
      const service = booking.service || "Serviço";
      const row = byService.get(service) || { count: 0, total: 0 };
      row.count += 1;
      row.total += Number(booking.price) || 0;
      byService.set(service, row);
    }
    return {
      completed: completed.length,
      spent: completed.reduce((sum, booking) => sum + (Number(booking.price) || 0), 0),
      upcoming: upcoming.reduce((sum, booking) => sum + (Number(booking.price) || 0), 0),
      services: [...byService.entries()].map(([service, values]) => ({ service, ...values })),
    };
  }, [records, reportMonth]);

  async function refresh() {
    setLoading(true);
    setError("");
    const currentTokens = getTokens();
    setTokens(currentTokens);

    let accountRecords = [];
    let linkedTokens = new Set();
    let account = await clientApi.list().catch(() => null);
    if (account?.ok) {
      setLoggedIn(true);
      // Reservas antigas deste aparelho podem ser adicionadas à conta somente com seu link secreto.
      const linkedResults = await Promise.all(currentTokens.map((token) => clientApi.link(token).catch(() => null)));
      account = await clientApi.list().catch(() => null);
      if (account?.ok) accountRecords = (await account.json()).bookings.map((booking) => ({ ...itemFor(null, booking), linked: true }));
      linkedTokens = new Set(currentTokens.filter((_, index) => linkedResults[index]?.ok));
    } else {
      setLoggedIn(false);
      if (account && account.status !== 401) setError("Não foi possível carregar sua agenda. Tente novamente.");
    }

    const tokenResults = await Promise.all(currentTokens.map(async (token) => {
      try {
        const response = await myBookingApi.get(token);
        if (response.status === 404) return { token, expired: true };
        if (!response.ok) return { token, failed: true };
        return { token, booking: await response.json() };
      } catch {
        return { token, failed: true };
      }
    }));
    tokenResults.filter((result) => result.expired).forEach((result) => removeToken(result.token));
    const validTokenBookings = tokenResults.filter((result) => result.booking).map(({ token, booking }) => ({ ...itemFor(token, booking), linked: linkedTokens.has(token) }));
    const unique = new Map();
    [...validTokenBookings, ...accountRecords].forEach((item) => unique.set(item.key, item));
    const list = [...unique.values()].sort((a, b) => a.booking.date.localeCompare(b.booking.date) || a.booking.time.localeCompare(b.booking.time));
    setRecords(list);
    setTokens(getTokens());
    if (tokenResults.some((result) => result.failed)) setError("Não foi possível carregar alguns agendamentos. Confira a conexão e tente novamente.");
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function login(e) {
    e.preventDefault();
    setBusy("login");
    setError("");
    const response = await clientApi.login(phone, accessCode);
    if (!response.ok) {
      setError(response.status === 429 ? "Muitas tentativas. Aguarde 15 minutos." : "Celular ou código incorretos.");
      setBusy(null);
      return;
    }
    setAccessCode("");
    await refresh();
    setBusy(null);
  }

  async function createCode(token) {
    setBusy(token);
    setError("");
    const response = await myBookingApi.createAccessCode(token);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(response.status === 409
        ? "Este celular já tem um código. Entre com seu celular e código; se não o tiver, fale com o studio para recuperar o acesso."
        : "Não foi possível criar o código. Abra o link original desta reserva e tente novamente.");
      setBusy(null);
      return;
    }
    setNewCode(result.accessCode);
    await refresh();
    setBusy(null);
  }

  async function cancel(item) {
    if (!confirm("Cancelar este agendamento? O horário será liberado.")) return;
    setBusy(item.key);
    const response = loggedIn && item.linked && item.booking.key
      ? await clientApi.cancel(item.booking.key)
      : item.token ? await myBookingApi.cancel(item.token) : null;
    if (!response?.ok) setError("Não foi possível cancelar. Atualize a agenda e tente novamente.");
    await refresh();
    setBusy(null);
  }

  async function erase(item) {
    if (!confirm("Apagar seu nome e telefone deste agendamento? Se ainda for futuro, ele será cancelado. Não dá para desfazer.")) return;
    setBusy(item.key);
    const response = loggedIn && item.linked && item.booking.key
      ? await clientApi.erase(item.booking.key)
      : item.token ? await myBookingApi.erase(item.token) : null;
    if (response?.ok && item.token) removeToken(item.token);
    if (!response?.ok) setError("Não foi possível apagar os dados. Tente novamente.");
    await refresh();
    setBusy(null);
  }

  async function logout() {
    await clientApi.logout();
    setLoggedIn(false);
    setNewCode("");
    await refresh();
  }

  async function forget() {
    clearTokens();
    await clientApi.logout();
    location.href = "/";
  }

  return (
    <>
      <SiteHeader />
      <main className="container">
      <h2 className="page-title">Meus agendamentos</h2>

      <a className="btn client-home-link" href="/"><Home size={16} /> Voltar ao início</a>
      {error && <div className="msg" role="alert">{error}</div>}
      {newCode && <div className="access-code-card" role="status"><strong>Seu código de acesso</strong><code>{newCode}</code><p>Guarde-o agora. Ele será mostrado apenas desta vez.</p></div>}

      {!loggedIn && (
        <form className="client-login" onSubmit={login}>
          <div className="summary__title"><CalendarDays size={16} /> Acesse sua agenda completa</div>
          <label className="field-label" htmlFor="client-phone">Celular usado nos agendamentos</label>
          <input id="client-phone" className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" required />
          <label className="field-label" htmlFor="client-code">Código de acesso</label>
          <input id="client-code" className="input" value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase())} maxLength={14} autoComplete="one-time-code" placeholder="XXXXXX-XXXXXX" required />
          <button className="btn btn--primary btn--block" type="submit" disabled={busy !== null}>{busy === "login" ? "Entrando…" : "Entrar na minha agenda"}</button>
          <p className="privacy-note">O código é criado na primeira reserva deste celular e aparece uma única vez. Se você já tem o link secreto de um agendamento antigo, abra-o neste aparelho para criar seu código.</p>
        </form>
      )}

      {loading && <div className="empty">Carregando seus agendamentos…</div>}

      {!loading && records.length === 0 && (
        <div className="fade">
          <div className="empty">
            {tokens.length
              ? "Não encontramos agendamentos ativos neste aparelho. Links de outras reservas podem ser abertos aqui para reuni-los."
              : "Seus horários aparecerão aqui depois de entrar com seu celular e código de acesso."}
          </div>
          {tokens.length > 0 && <div className="stack"><button className="btn btn--block" onClick={refresh}>Tentar novamente</button>{!loggedIn && <button className="btn btn--block" onClick={() => createCode(tokens[0])} disabled={busy !== null}>Criar código usando meu link secreto</button>}</div>}
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="fade">
          <div className="client-agenda-heading"><span>{records.length} agendamento{records.length === 1 ? "" : "s"}</span>{loggedIn && <button className="btn btn--small" onClick={logout}>Sair da agenda</button>}</div>
          <section className="client-report">
            <div className="summary__title">Meu investimento no visual</div>
            <label className="field-label" htmlFor="client-report-month">Mês</label>
            <input id="client-report-month" className="input" type="month" value={reportMonth} onChange={(e) => { if (e.target.value) setReportMonth(e.target.value); }} />
            <div className="client-report__totals">
              <div><span>Investido em atendimentos concluídos</span><strong>{money(monthlySummary.spent)}</strong><small>{monthlySummary.completed} atendimento{monthlySummary.completed === 1 ? "" : "s"}</small></div>
              <div><span>Agendamentos futuros neste mês</span><strong>{money(monthlySummary.upcoming)}</strong><small>Valor previsto</small></div>
            </div>
            {monthlySummary.services.length > 0 && <div className="client-report__services">
              {monthlySummary.services.map((item) => <div className="client-report__row" key={item.service}><span>{item.service} · {item.count}</span><strong>{money(item.total)}</strong></div>)}
            </div>}
            <p className="privacy-note">O valor investido soma apenas serviços marcados como concluídos. Agendamentos futuros aparecem à parte; cancelamentos e faltas não são contabilizados.</p>
          </section>
          <div className="client-bookings">
            {records.map((item) => {
              const { booking, token, key } = item;
              const [year, month, date] = booking.date.split("-").map(Number);
              const day = new Date(year, month - 1, date);
              return (
                <section className="ticket client-booking" key={key}>
                  <div className="ticket__head">
                    <div className="ticket__label">AGENDAMENTO Nº {booking.id}</div>
                    <div className="ticket__stamp">{STATUS[booking.status]?.toUpperCase()}</div>
                  </div>
                  <div>
                    <SummaryRow label="Cliente" value={booking.name} />
                    <SummaryRow label="Serviço" value={booking.service} />
                    <SummaryRow label="Profissional" value={booking.barberName} />
                    <SummaryRow label="Data" value={formatDay(day)} />
                    <SummaryRow label="Horário" value={`${booking.time} – ${booking.end}`} />
                    <SummaryRow label="Valor" value={money(booking.price)} />
                  </div>
                  <div className="stack">
                    <a className="btn btn--whatsapp btn--block" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(`Olá! Sobre meu agendamento Nº ${booking.id} (${booking.service}, ${formatDay(day)} às ${booking.time}).`)}`}>
                      <MessageCircle size={18} /> Falar com o studio
                    </a>
                    {booking.canCancel && <button className="btn btn--danger btn--block" disabled={busy !== null} onClick={() => cancel(item)}>{busy === key ? "Cancelando…" : "Cancelar agendamento"}</button>}
                    <button className="btn btn--block" disabled={busy !== null} onClick={() => erase(item)}>Apagar dados deste agendamento</button>
                    {!loggedIn && token && <button className="btn btn--block" disabled={busy !== null} onClick={() => createCode(token)}>Criar código de acesso à agenda</button>}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="stack">
            <a className="btn btn--primary btn--block" href="/">Fazer novo agendamento</a>
            <button className="btn btn--block" onClick={forget}>Sair deste aparelho</button>
          </div>
          <p className="privacy-note">Não compartilhe seu código de acesso nem os links secretos. Em aparelho compartilhado, saia da agenda e deste aparelho ao terminar.</p>
        </div>
      )}
      </main>
      <SiteFooter />
    </>
  );
}
