import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useBusyRanges, usePublicRooms, usePublicSettings, useSubmitBookingRequest } from '../api/public.js';
import { addDays, formatDate, formatPrice, formatShortDate, hotelToday, overlapsBusy, validateStay } from '../lib/format.js';
import { buildWhatsAppLink } from '../lib/whatsapp.js';
import { ErrorState } from '../ui/Feedback.jsx';
import { useDialog } from './shared.js';

const BookingContext = createContext({ open: () => {} });

/** useBooking().open({ roomId, checkIn, checkOut, guests }) abre la solicitud de estadía. */
export const useBooking = () => useContext(BookingContext);

export function BookingProvider({ children }) {
  const [state, setState] = useState(null);
  const open = useCallback((prefill = {}) => setState(s => ({ prefill, n: (s?.n ?? 0) + 1 })), []);
  const close = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <BookingContext.Provider value={value}>
      {children}
      {state && <BookingDrawer key={state.n} prefill={state.prefill} onClose={close} />}
    </BookingContext.Provider>
  );
}

const MSG_BUSY = 'La habitación no está disponible en esas fechas. Prueba otras fechas u otra habitación.';
const roomLabel = room => `${room.name} · ${room.room_type}`;

function BookingDrawer({ prefill, onClose }) {
  const today = hotelToday();
  const rooms = usePublicRooms();
  const { data: settings } = usePublicSettings();
  const submit = useSubmitBookingRequest();
  const ref = useRef(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [form, setForm] = useState({
    roomId: prefill.roomId || '', checkin: prefill.checkIn || '', checkout: prefill.checkOut || '',
    guests: String(prefill.guests || 1), guestName: '', phone: '', consent: false, website: '',
  });
  useDialog(ref, onClose);
  useEffect(() => { ref.current?.querySelector('select, input')?.focus(); }, []);

  const bookable = (rooms.data || []).filter(r => r.operational_status === 'available');
  const room = bookable.find(r => r.id === form.roomId);
  const busy = useBusyRanges(room?.id, today, addDays(today, 540));
  const stay = validateStay(form.checkin, form.checkout, today);
  const conflict = Boolean(room && !stay.error && overlapsBusy(form.checkin, form.checkout, busy.data || []));
  const maxGuests = Math.min(room?.capacity ?? 4, 8);

  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError(''); };
  const setRoom = roomId => {
    const chosen = bookable.find(r => r.id === roomId);
    setForm(f => ({ ...f, roomId, guests: chosen && Number(f.guests) > chosen.capacity ? String(chosen.capacity) : f.guests }));
    setError('');
  };
  const setCheckin = value => {
    setForm(f => ({ ...f, checkin: value, checkout: f.checkout && f.checkout <= value ? '' : f.checkout }));
    setError('');
  };

  const validate = target => {
    if (target === 1) {
      if (!room) return 'Selecciona una habitación.';
      if (Number(form.guests) > room.capacity) return `${room.name} admite máximo ${room.capacity} ${room.capacity === 1 ? 'huésped' : 'huéspedes'}.`;
      if (stay.error) return stay.error;
      if (conflict) return MSG_BUSY;
    }
    if (target === 2) {
      if (!form.guestName.trim()) return 'Ingresa tu nombre.';
      if (!form.phone.trim()) return 'Ingresa un teléfono de contacto.';
      if (!form.consent) return 'Debes autorizar el tratamiento de datos para enviar la solicitud.';
    }
    return '';
  };

  const next = () => {
    const message = validate(step);
    if (message) setError(message);
    else { setError(''); setStep(step + 1); }
  };

  const onSubmit = e => {
    e.preventDefault();
    if (step < 3) { next(); return; }
    for (const target of [1, 2]) {
      const message = validate(target);
      if (message) { setStep(target); setError(message); return; }
    }
    const data = {
      roomId: room.id, checkIn: form.checkin, checkOut: form.checkout, guests: Number(form.guests),
      guestName: form.guestName.trim(), phone: form.phone.trim(), consent: form.consent, website: form.website,
    };
    submit.mutate(data, {
      onSuccess: row => setDone({ code: row?.code, data, label: roomLabel(room) }),
      onError: err => setError(err.message),
    });
  };

  const whatsapp = done && buildWhatsAppLink(settings?.whatsapp, {
    guestName: done.data.guestName, roomLabel: done.label, checkIn: done.data.checkIn,
    checkOut: done.data.checkOut, guests: done.data.guests, code: done.code,
  });
  const shownError = error || (conflict ? MSG_BUSY : '');

  return (
    <div className="booking-shell">
      <button className="booking-backdrop" type="button" tabIndex={-1} aria-label="Cerrar solicitud" onClick={onClose} />
      <aside className="booking-drawer" role="dialog" aria-modal="true" aria-labelledby="booking-title" ref={ref}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">Solicitud de estadía</span>
            <h2 id="booking-title">{done ? 'Solicitud recibida' : 'Cuéntanos tu plan'}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>

        {done ? (
          <div className="booking-done">
            <p>Tu código de solicitud es <strong className="booking-code" data-testid="booking-code">{done.code}</strong></p>
            <div className="notice warning">
              <p>Esto es una solicitud, no una reserva confirmada. El hotel confirmará disponibilidad.</p>
            </div>
            {whatsapp
              ? <a className="button button-primary" href={whatsapp} target="_blank" rel="noopener noreferrer">Continuar por WhatsApp</a>
              : <p className="fine-print">El hotel aún no ha configurado WhatsApp; te contactará al teléfono indicado.</p>}
            <button className="button button-ghost" type="button" onClick={onClose}>Cerrar</button>
          </div>
        ) : (
          <>
            <div className="stepper" aria-label="Progreso de la solicitud">
              {['1. Estadía', '2. Datos', '3. Resumen'].map((label, i) => <span key={label} className={i < step ? 'active' : ''}>{label}</span>)}
            </div>
            <form id="booking-form" noValidate onSubmit={onSubmit}>
              <section className={`booking-step${step === 1 ? ' active' : ''}`}>
                {rooms.error ? <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} /> : (
                  <label>Habitación
                    <select name="room" value={form.roomId} onChange={e => setRoom(e.target.value)} required>
                      <option value="">{rooms.isLoading ? 'Cargando habitaciones…' : 'Selecciona una habitación'}</option>
                      {bookable.map(r => <option key={r.id} value={r.id}>{roomLabel(r)} · hasta {r.capacity}</option>)}
                    </select>
                  </label>
                )}
                <div className="field-row">
                  <label>Entrada<input name="checkin" type="date" min={today} value={form.checkin} onChange={e => setCheckin(e.target.value)} required /></label>
                  <label>Salida<input name="checkout" type="date" min={form.checkin ? addDays(form.checkin, 1) : addDays(today, 1)} value={form.checkout} onChange={e => set('checkout', e.target.value)} required /></label>
                </div>
                <label>Huéspedes
                  <select name="guests" value={form.guests} onChange={e => set('guests', e.target.value)} required>
                    {Array.from({ length: maxGuests }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'huésped' : 'huéspedes'}</option>)}
                  </select>
                </label>
                {room && (
                  <div className="notice">
                    <strong>Disponibilidad de {room.name}</strong>
                    {busy.isLoading && <p>Consultando fechas ocupadas…</p>}
                    {busy.isError && <p>No se pudo consultar la disponibilidad; el hotel la verificará al recibir tu solicitud.</p>}
                    {busy.data && (busy.data.length === 0
                      ? <p>No hay fechas ocupadas registradas en los próximos 18 meses.</p>
                      : (
                        <>
                          <p>Fechas ocupadas (la fecha final es el día de salida):</p>
                          <ul className="busy-list">
                            {busy.data.map(r => <li key={`${r.start_date}-${r.end_date}`}>{formatShortDate(r.start_date)} al {formatShortDate(r.end_date)}</li>)}
                          </ul>
                        </>
                      ))}
                  </div>
                )}
              </section>

              <section className={`booking-step${step === 2 ? ' active' : ''}`}>
                <label>Nombre completo<input name="guestName" autoComplete="name" placeholder="Ej. María López" value={form.guestName} onChange={e => set('guestName', e.target.value)} maxLength={120} required /></label>
                <label>Teléfono de contacto<input name="phone" autoComplete="tel" inputMode="tel" placeholder="Ej. 300 000 0000" value={form.phone} onChange={e => set('phone', e.target.value)} maxLength={30} required /></label>
                <label className="checkbox"><input name="consent" type="checkbox" checked={form.consent} onChange={e => set('consent', e.target.checked)} required /><span>Autorizo el tratamiento de mis datos para gestionar esta solicitud</span></label>
                <p className="fine-print">No solicitamos documento, correo ni datos de pago en este paso.</p>
              </section>

              <section className={`booking-step${step === 3 ? ' active' : ''}`}>
                <div className="summary-card">
                  {room && (
                    <dl>
                      <dt>Habitación</dt><dd>{roomLabel(room)}</dd>
                      <dt>Entrada</dt><dd>{formatDate(form.checkin)}</dd>
                      <dt>Salida</dt><dd>{formatDate(form.checkout)}</dd>
                      <dt>Noches</dt><dd>{stay.nights}</dd>
                      <dt>Huéspedes</dt><dd>{form.guests}</dd>
                      <dt>Valor estimado</dt><dd>{room.price_cop != null && stay.nights ? formatPrice(room.price_cop * stay.nights) : 'Tarifa por confirmar'}</dd>
                      <dt>Nombre</dt><dd>{form.guestName}</dd>
                      <dt>Teléfono</dt><dd>{form.phone}</dd>
                    </dl>
                  )}
                </div>
                <div className="notice warning"><strong>Esta es una solicitud, no una reserva confirmada</strong><p>El hotel debe revisar la disponibilidad y confirmar su respuesta.</p></div>
              </section>

              <div className="booking-hp" aria-hidden="true">
                <label>Sitio web<input name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} /></label>
              </div>

              <p className="form-error" role="alert">{shownError}</p>
              <div className="drawer-actions">
                {step > 1 && <button className="button button-ghost" type="button" onClick={() => { setError(''); setStep(step - 1); }}>Volver</button>}
                {step < 3 && <button className="button button-primary" type="button" onClick={next} disabled={step === 1 && conflict}>Continuar</button>}
                {step === 3 && <button className="button button-primary" type="submit" disabled={submit.isPending || conflict}>{submit.isPending ? 'Enviando…' : 'Enviar solicitud'}</button>}
              </div>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
