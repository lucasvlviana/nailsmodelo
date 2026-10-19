import { useState, useEffect, useCallback } from "react";
import { MessageCircle, LogOut, ChevronLeft, ChevronRight, Check, ArrowLeft } from "lucide-react";
import { SHOP, BARBERS, dateKey, formatDay, toHHMM, toMin, blockTimes, money } from "../shared/catalog.js";
import SiteHeader from "../components/SiteHeader.jsx";
import { adminApi } from "../lib/api.js";
import "../styles/admin.css";

const STATUS = {
  confirmed: "Confirmado",
  done: "Concluído",
  no_show: "Faltou",
  cancelled: "Cancelado",
};
const waNumber = (p) => (p.length <= 11 ? "55" + p : p);

export default function AdminPage() {
  const [authed, setAuthed] = useState(null);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [date, setDate] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [showAll, setShowAll] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [blockMode, setBlockMode] = useState("slot");
  const [blockStart, setBlockStart] = useState(() => blockTimes()[0]);
  const [blockEnd, setBlockEnd] = useState(() => blockTimes()[1]);
  const [blockBarber, setBlockBarber] = useState(BARBERS.length > 1 ? "*" : BARBERS[0].id);
  const [blockReason, setBlockReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockMessage, setBlockMessage] = useState("");
  const [month, setMonth] = useState(() => dateKey(new Date()).slice(0, 7));
  const [report, setReport] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const load = useCallback(async () => {
    const r = await adminApi.list(dateKey(date), showAll);
    if (r.status === 401) return setAuthed(false);
    setRows((await r.json()).bookings);
    setAuthed(true);
  }, [date, showAll]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const loadBlocks = useCallback(async () => {
    const r = await adminApi.blocks(dateKey(date));
    if (r.status === 401) return setAuthed(false);
    if (r.ok) setBlocks((await r.json()).blocks);
  }, [date]);
  useEffect(() => {
    if (authed && !showAll && !showReport) loadBlocks();
  }, [authed, showAll, showReport, loadBlocks]);
  useEffect(() => {
    if (!authed || !showReport) return;
    let active = true;
    adminApi.report(month).then(async (r) => {
      if (r.status === 401) return setAuthed(false);
      if (r.ok && active) setReport(await r.json());
    }).catch(() => { if (active) setReport(null); });
    return () => { active = false; };
  }, [authed, showReport, month]);

  async function login(e) {
    e.preventDefault();
    const r = await adminApi.login(pw);
    if (r.ok) {
      setPw("");
      setErr("");
      load();
    } else
      setErr(
        r.status === 429
          ? "Muitas tentativas. Aguarde 15 minutos."
          : "Senha incorreta.",
      );
  }
  async function logout() {
    await adminApi.logout();
    setAuthed(false);
    setRows([]);
  }
  async function changeStatus(id, status) {
    await adminApi.setStatus(id, status);
    load();
  }
  async function erase(id) {
    if (!confirm("Apagar nome e telefone deste cliente? Não dá para desfazer."))
      return;
    await adminApi.erase(id);
    load();
  }
  async function resetAgenda() {
    const phrase = prompt('Isso apaga todos os agendamentos, bloqueios e códigos de clientes. Digite "ZERAR A AGENDA" para confirmar:');
    if (phrase !== "ZERAR A AGENDA") return;
    setResetting(true);
    setResetMessage("");
    try {
      const response = await adminApi.resetAgenda(phrase);
      if (response.status === 401) {
        setAuthed(false);
        return;
      }
      if (!response.ok) throw new Error("reset");
      const result = await response.json();
      setRows([]);
      setBlocks([]);
      setResetMessage(`Agenda limpa: ${result.bookings} atendimento(s), ${result.blocks} bloqueio(s) e ${result.accounts} código(s) de cliente removidos.`);
    } catch {
      setResetMessage("Não foi possível limpar a agenda. Tente novamente.");
    } finally {
      setResetting(false);
    }
  }
  async function createBlock(e) {
    e.preventDefault();
    setBlockBusy(true);
    setBlockMessage("");
    const payload = blockMode === "day"
      ? { date: dateKey(date), barberId: blockBarber, start: null, end: null, reason: blockReason }
      : { date: dateKey(date), barberId: blockBarber, start: toMin(blockStart), end: toMin(blockEnd), reason: blockReason };
    try {
      const response = await adminApi.addBlock(payload);
      if (response.status === 401) return setAuthed(false);
      if (!response.ok) throw new Error("block");
      setBlockReason("");
      setBlockMessage("Indisponibilidade adicionada. Os agendamentos existentes permanecem na agenda.");
      await loadBlocks();
    } catch {
      setBlockMessage("Não foi possível bloquear. Confira o intervalo e tente novamente.");
    } finally {
      setBlockBusy(false);
    }
  }
  async function removeBlock(id) {
    const response = await adminApi.removeBlock(id);
    if (response.status === 401) return setAuthed(false);
    if (response.ok) {
      setBlockMessage("Indisponibilidade removida.");
      loadBlocks();
    }
  }
  const shift = (n) =>
    setDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + n));
  const active = rows.filter((r) => r.status !== "cancelled");
  const total = rows
    .filter((r) => ["confirmed", "done"].includes(r.status))
    .reduce((s, r) => s + r.price, 0);
  const waLink = (r) =>
    `https://wa.me/${waNumber(r.phone)}?text=${encodeURIComponent(
      `Olá, ${r.name}! Aqui é da ${SHOP.name}. Confirmando seu ${r.service} com ${r.barberName} no dia ${new Date(`${r.date}T12:00:00`).toLocaleDateString("pt-BR")} às ${r.time}. Tudo certo?`,
    )}`;

  return (
    <>
    <SiteHeader />
    <main className="container">
      <a className="btn admin__home" href="/"><ArrowLeft size={16} /> Voltar ao início</a>
      <h2 className="admin__title">Painel da profissional</h2>
      <p className="admin__secure">Área privada. Toque em sair ao terminar, se o aparelho for compartilhado.</p>

      {authed === false && (
        <form className="admin__login" onSubmit={login}>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Senha do painel"
          />
          {err && <div className="msg">{err}</div>}
          <button className="btn btn--primary" type="submit">
            Entrar
          </button>
        </form>
      )}

      {authed && (
        <>
          <div className="admin__nav admin__nav--wrap">
            <button className={`btn btn--small ${showAll && !showReport ? "is-active" : ""}`} onClick={() => { setShowAll(true); setShowReport(false); }}>Agenda completa</button>
            <button className={`btn btn--small ${!showAll && !showReport ? "is-active" : ""}`} onClick={() => { setShowAll(false); setShowReport(false); }}>Por dia</button>
            <button className={`btn btn--small ${showReport ? "is-active" : ""}`} onClick={() => setShowReport(true)}>Relatório mensal</button>
            <button className="btn btn--small" onClick={logout} aria-label="Sair"><LogOut size={16} /></button>
          </div>
          {!showAll && !showReport && <div className="admin__nav">
            <button
              className="btn btn--small"
              onClick={() => shift(-1)}
              aria-label="Dia anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="admin__date">{formatDay(date)}</div>
            <button
              className="btn btn--small"
              onClick={() => shift(1)}
              aria-label="Próximo dia"
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="btn btn--small"
              onClick={() => setDate(new Date())}
            >
              Hoje
            </button>
          </div>}
          {showReport ? <section className="admin__report">
            <label className="field-label" htmlFor="report-month">Mês do relatório</label>
            <input id="report-month" className="input admin__month" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setReport(null); }} />
            {report && <>
              <div className="admin__report-summary">
                <div><span>Atendimentos concluídos</span><strong>{report.completed}</strong></div>
                <div><span>Valor arrecadado</span><strong>R$ {Number(report.revenue).toFixed(2).replace(".", ",")}</strong></div>
              </div>
              <h2 className="admin__report-heading">Atendimentos por serviço</h2>
              {report.services.length ? <div className="admin__service-report">{report.services.map((item) => <div className="admin__service-row" key={item.service}><span>{item.service} · {item.count}</span><strong>R$ {Number(item.revenue).toFixed(2).replace(".", ",")}</strong></div>)}</div> : <div className="empty">Nenhum atendimento concluído neste mês.</div>}
              {BARBERS.length > 1 && report.barbers.length > 0 && <>
                <h2 className="admin__report-heading">Atendimentos por profissional</h2>
                <div className="admin__service-report">{report.barbers.map((item) => <div className="admin__service-row" key={item.barber}><span>{item.barber} · {item.count}</span><strong>R$ {Number(item.revenue).toFixed(2).replace(".", ",")}</strong></div>)}</div>
              </>}
              <p className="admin__report-note">O total considera apenas atendimentos marcados como “Concluído”. Cancelamentos, faltas e horários ainda confirmados ficam fora do valor arrecadado.</p>
            </>}
            {!report && <div className="empty">Carregando relatório…</div>}
          </section> : <>
          <div className="admin__totals">
            {active.length} atendimentos · R$ {total.toFixed(2).replace(".", ",")}
          </div>

          {!showAll && <section className="admin__blocks">
            <h2>Indisponibilizar horário</h2>
            <p>Bloqueios impedem novas reservas. Agendamentos que já existem continuam visíveis e precisam ser cancelados na agenda individualmente.</p>
            <form onSubmit={createBlock} className="admin__block-form">
              <label className="field-label" htmlFor="block-mode">O que bloquear?</label>
              <select id="block-mode" className="input" value={blockMode} onChange={(e) => setBlockMode(e.target.value)}>
                <option value="slot">Intervalo de horário</option>
                <option value="day">Dia inteiro</option>
              </select>
              {BARBERS.length > 1 && <>
                <label className="field-label" htmlFor="block-barber">Para quem?</label>
                <select id="block-barber" className="input" value={blockBarber} onChange={(e) => setBlockBarber(e.target.value)}>
                  <option value="*">Todas as profissionais</option>
                  {BARBERS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </>}
              {blockMode === "slot" && <div className="admin__block-range">
                <label className="field-label">De <select className="input" value={blockStart} onChange={(e) => { setBlockStart(e.target.value); if (e.target.value >= blockEnd) setBlockEnd(toHHMM(toMin(e.target.value) + SHOP.slotMinutes)); }}>
                  {blockTimes().slice(0, -1).map((time) => <option key={time}>{time}</option>)}
                </select></label>
                <label className="field-label">Até <select className="input" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)}>
                  {blockTimes().filter((time) => time > blockStart).map((time) => <option key={time}>{time}</option>)}
                </select></label>
              </div>}
              <label className="field-label" htmlFor="block-reason">Observação (opcional)</label>
              <input id="block-reason" className="input" maxLength={120} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Ex.: compromisso familiar" />
              <button className="btn btn--primary" type="submit" disabled={blockBusy}>{blockBusy ? "Salvando…" : blockMode === "day" ? "Fechar o dia" : "Bloquear horário"}</button>
            </form>
            {blockMessage && <div className="admin__reset-message" role="status">{blockMessage}</div>}
            <div className="admin__block-list">
              <h3>Bloqueios de {formatDay(date)}</h3>
              {!blocks.length && <p>Nenhum horário bloqueado neste dia.</p>}
              {blocks.map((block) => <div className="admin__block-item" key={block.id}>
                <span><strong>{block.allDay ? "Dia inteiro" : `${String(Math.floor(block.start / 60)).padStart(2, "0")}:${String(block.start % 60).padStart(2, "0")}–${String(Math.floor(block.end / 60)).padStart(2, "0")}:${String(block.end % 60).padStart(2, "0")}`}</strong>{BARBERS.length > 1 && <small>{block.barberName}</small>}{block.reason && <small>{block.reason}</small>}</span>
                <button className="btn btn--small" type="button" onClick={() => removeBlock(block.id)}>Liberar</button>
              </div>)}
            </div>
          </section>}

          {rows.length === 0 && (
            <div className="empty">{showAll ? "Nenhum agendamento encontrado." : "Nenhum agendamento neste dia."}</div>
          )}
          <div className="admin__list">
            {rows.map((r) => (
              <div
                key={r.id}
                className={`item ${r.status === "cancelled" ? "is-cancelled" : ""}`}
              >
                <div className="item__top">
                  <span className="item__time">
                    {r.time}
                    <small> –{r.end}</small>
                  </span>
                  <span>{money(r.price)}</span>
                </div>
                <div className="item__service">
                  {r.service} · {r.barberName}
                </div>
                {showAll && <div className="item__date">{new Date(`${r.date}T12:00:00`).toLocaleDateString("pt-BR")}</div>}
                <div className="item__client">
                  {r.name
                    ? `${r.name} · ${r.phone}`
                    : "Dados pessoais removidos"}
                </div>
                <div className="item__actions">
                  <select
                    className="btn btn--small btn--select"
                    value={r.status}
                    onChange={(e) => changeStatus(r.id, e.target.value)}
                  >
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {r.status === "confirmed" && <button className="btn btn--small btn--done" onClick={() => changeStatus(r.id, "done")}><Check size={15} /> Já foi</button>}
                  {r.status === "confirmed" && <button className="btn btn--small btn--danger" onClick={() => { if (confirm("Cancelar este atendimento? O cliente não será avisado automaticamente e o horário ficará disponível para nova reserva.")) changeStatus(r.id, "cancelled"); }}>Cancelar atendimento</button>}
                  {r.phone && (
                    <a
                      className="btn btn--small btn--whatsapp"
                      href={waLink(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={15} /> WhatsApp
                    </a>
                  )}
                  {r.name && (
                    <button
                      className="btn btn--small"
                      onClick={() => erase(r.id)}
                    >
                      Apagar dados
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <section className="admin__danger-zone">
            <div>
              <h2>Zerar a agenda</h2>
              <p>Apaga todos os atendimentos, históricos e códigos de acesso dos clientes. Esta ação não pode ser desfeita.</p>
            </div>
            <button className="btn btn--danger" onClick={resetAgenda} disabled={resetting}>
              {resetting ? "Limpando…" : "Apagar todos os agendamentos"}
            </button>
            {resetMessage && <div className="admin__reset-message" role="status">{resetMessage}</div>}
          </section>
          </>}
        </>
      )}
    </main>
    </>
  );
}
