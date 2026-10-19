import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  User,
  Users,
  Check,
  ChevronLeft,
  Phone,
  ArrowRight,
  MessageCircle,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import {
  SHOP,
  SERVICES,
  BARBERS,
  ANY_BARBER,
  WEEKDAYS,
  MONTHS,
  nextDays,
  dateKey,
  formatDay,
  slotsFor,
  toMin,
  worksOn,
  servicePool,
  priceFor,
  priceLabel,
  money,
  availableBarbers,
  retentionLabel,
} from "../shared/catalog.js";
import { getAvailability, createBooking } from "../lib/api.js";
import SummaryRow from "../components/SummaryRow.jsx";
import SiteHeader from "../components/SiteHeader.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { saveToken } from "../lib/token.js";
import "../styles/booking.css";

// Com um único profissional não há o que escolher: o passo "Profissional" some do indicador.
const MULTI_BARBER = BARBERS.length > 1;
const STEPS = [
  { n: 1, label: "Serviço" },
  ...(MULTI_BARBER ? [{ n: 2, label: "Profissional" }] : []),
  { n: 3, label: "Horário" },
  { n: 4, label: "Confirmar" },
];

// "12:00" -> "12h" · "12:30" -> "12h30"
const hourLabel = (hhmm) => hhmm.replace(/^0/, "").replace(":00", "h").replace(":", "h");
const sharedLunch = SHOP.lunch && BARBERS.every((b) => b.lunch === undefined) ? SHOP.lunch : null;
const slotHint = `${sharedLunch ? `Intervalo de almoço: ${hourLabel(sharedLunch.start)}–${hourLabel(sharedLunch.end)} · ` : ""}horários a cada ${SHOP.slotMinutes} min`;

export default function BookingPage() {
  const [step, setStep] = useState(1);
  const [service, setService] = useState(null);
  const [barberChoice, setBarberChoice] = useState(null);
  const [date, setDate] = useState(null);
  const [time, setTime] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [needsAccessCode, setNeedsAccessCode] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [touched, setTouched] = useState({}); // dicas de erro só aparecem depois que a pessoa sai do campo
  const [consent, setConsent] = useState(false);

  const [busy, setBusy] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);

  const days = useMemo(() => nextDays(SHOP.bookAheadDays + 1), []);
  // Quem pode fazer o serviço escolhido; se só um puder, o passo "Profissional" é pulado.
  const pool = service ? servicePool(service) : [];
  const forcedBarber = pool.length === 1 ? pool[0] : null;
  const skipBarberStep = Boolean(forcedBarber);
  const barberOptions = pool.length > 1 ? [ANY_BARBER, ...pool] : [];
  const bc = forcedBarber || barberChoice;
  const eligibleBarbers = bc ? (bc.id === ANY_BARBER.id ? pool : pool.filter((b) => b.id === bc.id)) : [];
  const dow = date ? date.getDay() : null;
  // Hoje: horários que já passaram não podem ser reservados (o servidor também recusa)
  const isToday = Boolean(date && dateKey(date) === dateKey(new Date()));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isPast = (slot) => isToday && toMin(slot) <= nowMin;
  const worksAny = (d) => eligibleBarbers.some((barber) => worksOn(barber, d));

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoadingSlots(true);
    setAvailabilityError(false);
    getAvailability(dateKey(date))
      .then((b) => !cancelled && setBusy(b))
      .catch(() => {
        if (!cancelled) {
          setBusy([]);
          setAvailabilityError(true);
        }
      })
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const slotUniverse = useMemo(() => {
    if (!date || !bc) return [];
    const set = new Set();
    eligibleBarbers.filter((b) => worksOn(b, dow)).forEach((b) => slotsFor(b).forEach((s) => set.add(s)));
    return [...set].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, bc?.id, service?.id, dow]);

  const noSlotsToday = isToday && slotUniverse.length > 0 && slotUniverse.every(isPast);
  const noOneWorks = Boolean(date && !worksAny(dow));
  const canNext =
    (step === 2 && barberChoice) || (step === 3 && date && time && !noOneWorks && !availabilityError);
  // Mesmas regras do servidor (nome 2+ letras, telefone com DDD: 10 a 13 dígitos)
  const phoneDigits = phone.replace(/\D/g, "");
  const nameOk = name.trim().length >= 2;
  const phoneOk = phoneDigits.length >= 10 && phoneDigits.length <= 13;
  const codeOk = !needsAccessCode || accessCode.replace(/[^A-Za-z0-9]/g, "").length === 12;
  const canConfirm = nameOk && phoneOk && codeOk && consent && !confirming;

  async function confirmBooking() {
    setConfirming(true);
    setFailed(false);
    setConflict(false);
    setBookingError("");
    try {
      const res = await createBooking({
        serviceId: service.id,
        barberId: bc.id,
        date: dateKey(date),
        time,
        name,
        phone,
        accessCode,
        consent,
      });
      if (res.requiresAccessCode) {
        setNeedsAccessCode(true);
        setBookingError("Este celular já tem um código de acesso. Informe-o para continuar.");
        return;
      }
      if (res.rateLimited) {
        setBookingError("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.");
        return;
      }
      if (res.invalid) {
        setBookingError("Confira o nome, o telefone com DDD e se o dia e o horário escolhidos ainda estão disponíveis.");
        return;
      }
      if (res.conflict) {
        setConflict(true);
        setTime(null);
        setStep(3);
        setBusy(await getAvailability(dateKey(date)));
      } else {
        saveToken(res.booking.accessToken);
        setConfirmed(res.booking);
      }
    } catch (e) {
      setFailed(true);
    } finally {
      setConfirming(false);
    }
  }

  function reset() {
    setStep(1);
    setService(null);
    setBarberChoice(null);
    setDate(null);
    setTime(null);
    setName("");
    setPhone("");
    setAccessCode("");
    setNeedsAccessCode(false);
    setBookingError("");
    setTouched({});
    setConsent(false);
    setConfirmed(null);
    setBusy([]);
    setConflict(false);
  }

  function pickService(s) {
    const options = servicePool(s);
    setService(s);
    setTime(null);
    setDate(null);
    if (options.length === 1) {
      setBarberChoice(options[0]);
      setStep(3);
    } else {
      setBarberChoice(null);
      setStep(2);
    }
  }

  const back = () => setStep(skipBarberStep && step === 3 ? 1 : step - 1);
  const waText =
    confirmed && date
      ? `Olá! Sou ${name} e agendei ${confirmed.service} com ${confirmed.barberName} — ${formatDay(date)} às ${confirmed.time}. Nº ${confirmed.id.slice(-8)}. Pode confirmar?`
      : "";
  // Valor mostrado antes de saber quem vai atender (sem preferência)
  const summaryPrice = !service ? "" : bc?.id === ANY_BARBER.id ? priceLabel(service) : money(priceFor(service, bc?.id));

  return (
    <>
      <SiteHeader />
      <main className="container">
        {!confirmed && (
          <nav className="home-access home-access--single" aria-label="Área do cliente">
            <a className="home-access__card" href="/meu-agendamento">
              <span className="home-access__icon"><CalendarDays size={19} /></span>
              <span><strong>Já agendou?</strong><small>Ver, acompanhar ou cancelar seus horários</small></span>
              <ArrowUpRight size={17} />
            </a>
          </nav>
        )}

        {!confirmed && (
          <>
            <ol className="stepper">
              {STEPS.map(({ n, label }, i) => (
                <li key={label} className={`stepper__item ${step >= n ? "is-on" : ""}`}>
                  <span className="stepper__bar" />
                  <span className="stepper__n">{String(i + 1).padStart(2, "0")} · </span>
                  {label}
                </li>
              ))}
            </ol>

            {step === 1 && (
              <div className="list fade">
                {SERVICES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pickService(s)}
                    className={`card option ${service?.id === s.id ? "is-selected" : ""}`}
                  >
                    <div>
                      <div className="option__title">{s.name}</div>
                      {!!s.desc && <div className="option__desc">{s.desc}</div>}
                      <div className="option__meta">
                        <Clock size={12} /> {s.duration} min
                      </div>
                    </div>
                    <div className="option__price">{priceLabel(s)}</div>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="list fade">
                {barberOptions.map((b) => {
                  const isAny = b.id === ANY_BARBER.id;
                  const differs = typeof service.price !== "number";
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setBarberChoice(b);
                        setTime(null);
                        setDate(null);
                      }}
                      className={`card option ${barberChoice?.id === b.id ? "is-selected" : ""}`}
                    >
                      <div className="option__lead">
                        <div className="avatar">{isAny ? <Users size={18} /> : <User size={18} />}</div>
                        <div>
                          <div className="option__title">{b.name}</div>
                          <div className="option__desc">
                            {isAny ? "Quem estiver livre no horário" : b.specialty || ""}
                          </div>
                        </div>
                      </div>
                      {differs && (
                        <div className="option__price">
                          {isAny ? priceLabel(service) : money(priceFor(service, b.id))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="fade">
                <div className="days">
                  {days.map((d) => {
                    const works = worksAny(d.getDay());
                    return (
                      <button
                        key={dateKey(d)}
                        disabled={!works}
                        aria-label={`${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${!works ? ", sem atendimento" : ""}`}
                        onClick={() => {
                          setDate(d);
                          setTime(null);
                        }}
                        className={`card day ${date && dateKey(date) === dateKey(d) ? "is-selected" : ""}`}
                      >
                        <div className="day__dow">{WEEKDAYS[d.getDay()]}</div>
                        <div className="day__num">{d.getDate()}</div>
                        <div className="day__mon">{MONTHS[d.getMonth()]}</div>
                      </button>
                    );
                  })}
                </div>

                {!date && <div className="empty">Escolha uma data para ver os horários disponíveis.</div>}
                {date && loadingSlots && <div className="empty">carregando horários…</div>}
                {date && !loadingSlots && availabilityError && (
                  <div className="empty empty--error" role="alert">
                    Não foi possível carregar os horários. Confira sua conexão e tente novamente.
                    <button
                      className="btn btn--small"
                      onClick={() => setDate((current) => (current ? new Date(current.getTime()) : current))}
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}
                {date && !loadingSlots && !availabilityError && noOneWorks && (
                  <div className="empty empty--error">Não há atendimento neste dia. Escolha outra data.</div>
                )}
                {date && !loadingSlots && !availabilityError && !noOneWorks && noSlotsToday && (
                  <div className="empty empty--error">Não há mais horários disponíveis hoje. Escolha outro dia.</div>
                )}
                {date && !loadingSlots && !availabilityError && !noOneWorks && !noSlotsToday && (
                  <>
                    <div className="hint">{slotHint}</div>
                    <div className="slots">
                      {slotUniverse.map((slot) => (
                        <button
                          key={slot}
                          className={`card slot ${time === slot ? "is-selected" : ""}`}
                          disabled={isPast(slot) || availableBarbers(service, bc, dow, slot, busy).length === 0}
                          onClick={() => setTime(slot)}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {conflict && (
                  <div className="msg">Esse horário acabou de ser reservado por outra pessoa. Escolha outro.</div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="fade">
                <div className="summary">
                  <div className="summary__title">Resumo</div>
                  <SummaryRow label="Serviço" value={service?.name} />
                  <SummaryRow label="Valor" value={summaryPrice} />
                  <SummaryRow
                    label="Profissional"
                    value={bc?.id === ANY_BARBER.id ? "Quem estiver livre" : bc?.name}
                  />
                  <SummaryRow label="Data" value={date && formatDay(date)} />
                  <SummaryRow label="Horário" value={time} />
                </div>

                <label className="field-label" htmlFor="name">
                  Seu nome
                </label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  maxLength={80}
                  autoComplete="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como podemos te chamar"
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  aria-invalid={touched.name && !nameOk}
                />
                {touched.name && !nameOk && <div className="msg">Informe pelo menos 2 letras.</div>}

                <label className="field-label" htmlFor="phone">
                  Telefone (WhatsApp)
                </label>
                <div className="phone">
                  <Phone size={15} />
                  <input
                    id="phone"
                    className="input"
                    type="tel"
                    value={phone}
                    maxLength={20}
                    autoComplete="tel"
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 90000-0000"
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    aria-invalid={touched.phone && !phoneOk}
                  />
                </div>
                {touched.phone && !phoneOk && <div className="msg">Informe o telefone com DDD (ex.: 11 90000-0000).</div>}

                <label className="field-label" htmlFor="access-code">
                  Código de acesso da sua agenda{" "}
                  <span className="optional">{needsAccessCode ? "(obrigatório)" : "(se já tiver)"}</span>
                </label>
                <input
                  id="access-code"
                  className="input"
                  value={accessCode}
                  maxLength={14}
                  autoComplete="off"
                  onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                  placeholder="Ex.: ABC123-XYZ789"
                  aria-invalid={needsAccessCode && !codeOk}
                />
                <div className="privacy-note">
                  Na primeira reserva para este celular, criaremos um código para você guardar. Use-o nas próximas
                  reservas e para acessar sua agenda.
                </div>

                <label className="consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    Concordo em informar meu nome e telefone à studio apenas para gerenciar meu agendamento
                    (LGPD). Os dados ficam criptografados e são apagados após {retentionLabel}.
                  </span>
                </label>
                {bookingError && <div className="msg">{bookingError}</div>}
                {failed && (
                  <div className="msg">
                    Não foi possível concluir o agendamento agora. Confira os dados (telefone com DDD) e tente novamente.
                  </div>
                )}
              </div>
            )}

            <div className="actions">
              {step > 1 && (
                <button className="btn" onClick={back}>
                  <ChevronLeft size={16} /> Voltar
                </button>
              )}
              {step > 1 && step < 4 && (
                <button className="btn btn--primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                  Continuar <ArrowRight size={16} />
                </button>
              )}
              {step === 4 && (
                <button className="btn btn--primary" disabled={!canConfirm} onClick={confirmBooking}>
                  {confirming ? "Confirmando…" : "Confirmar agendamento"} <Check size={16} />
                </button>
              )}
            </div>
          </>
        )}

        {confirmed && (
          <div className="fade">
            <div className="ticket">
              <div className="ticket__head">
                <div className="ticket__label">TICKET DE AGENDAMENTO</div>
                <div className="ticket__stamp">CONFIRMADO</div>
              </div>
              <div>
                <SummaryRow label="Cliente" value={name} />
                <SummaryRow label="Serviço" value={confirmed.service} />
                <SummaryRow label="Valor" value={money(confirmed.price)} />
                <SummaryRow label="Profissional" value={confirmed.barberName} />
                <SummaryRow label="Data" value={date && formatDay(date)} />
                <SummaryRow label="Horário" value={confirmed.time} />
              </div>
              <div className="ticket__no">Nº {confirmed.id.slice(-8)}</div>
            </div>
            {confirmed.accessCode && (
              <div className="access-code-card" role="status">
                <strong>Seu código de acesso à agenda</strong>
                <code>{confirmed.accessCode}</code>
                <p>
                  Guarde este código agora. Ele será pedido junto com seu celular para ver todos os agendamentos e
                  cancelar horários.
                </p>
              </div>
            )}
            <a
              className="btn btn--whatsapp btn--block"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(waText)}`}
            >
              <MessageCircle size={18} /> Confirmar pelo WhatsApp
            </a>
            <a className="btn btn--block" href={`/meu-agendamento#${confirmed.accessToken}`}>
              Ver meus agendamentos
            </a>
            <button className="btn btn--block" onClick={reset}>
              Fazer novo agendamento
            </button>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
