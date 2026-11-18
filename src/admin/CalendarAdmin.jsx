import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase, unwrap } from '../lib/supabase.js';
import { addDays, formatDate, hotelToday } from '../lib/format.js';
import { Loading, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { AdminPage } from './AdminLayout.jsx';
import { roomLabel, useOpsRooms } from './opsApi.js';
import './ops-admin.css';

const monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekdayFormatter = new Intl.DateTimeFormat('es-CO', { weekday: 'narrow', timeZone: 'UTC' });

function monthStart(year, month) { return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10); }

export default function CalendarAdmin() {
  const today = hotelToday();
  const [cursor, setCursor] = useState({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 });
  const first = monthStart(cursor.year, cursor.month);
  const next = monthStart(cursor.year, cursor.month + 1);
  const days = useMemo(() => {
    const list = [];
    for (let d = first; d < next; d = addDays(d, 1)) list.push(d);
    return list;
  }, [first, next]);
  const last = days[days.length - 1];

  const rooms = useOpsRooms();
  const data = useQuery({
    queryKey: ['admin', 'calendar', first],
    queryFn: async () => {
      const [reservations, blocks, requests] = await Promise.all([
        unwrap(supabase.from('reservations').select('id,room_id,guest_name,check_in,check_out,status').in('status', ['confirmed', 'checked_in']).lt('check_in', next).gt('check_out', first)),
        unwrap(supabase.from('room_blocks').select('id,room_id,start_date,end_date,reason').eq('active', true).lte('start_date', last).gte('end_date', first)),
        unwrap(supabase.from('booking_requests').select('id,code,room_id,guest_name,check_in,check_out').eq('status', 'pending').lt('check_in', next).gt('check_out', first)),
      ]);
      return { reservations, blocks, requests };
    },
  });

  const shift = delta => setCursor(c => { const d = new Date(Date.UTC(c.year, c.month + delta, 1)); return { year: d.getUTCFullYear(), month: d.getUTCMonth() }; });
  const visibleRooms = (rooms.data || []).filter(r => r.operational_status !== 'inactive');

  function itemsFor(roomId, day) {
    const d = data.data;
    const items = [];
    for (const r of d.reservations) {
      if (r.room_id === roomId && r.check_in <= day && day < r.check_out) {
        items.push({ key: `r${r.id}`, kind: r.status, to: '/admin/reservas', first: day === r.check_in || day === first,
          text: r.guest_name, label: `${r.status === 'checked_in' ? 'Hospedado' : 'Reserva confirmada'}: ${r.guest_name}, ${formatDate(r.check_in)} a ${formatDate(r.check_out)}` });
      }
    }
    for (const b of d.blocks) {
      if (b.room_id === roomId && b.start_date <= day && day <= b.end_date) {
        items.push({ key: `b${b.id}`, kind: 'block', to: '/admin/reservas?tab=bloqueos', first: day === b.start_date || day === first,
          text: b.reason, label: `Bloqueo: ${b.reason}, ${formatDate(b.start_date)} al ${formatDate(b.end_date)}` });
      }
    }
    for (const q of d.requests) {
      if (q.room_id === roomId && q.check_in <= day && day < q.check_out) {
        items.push({ key: `q${q.id}`, kind: 'pending', to: `/admin/solicitudes?q=${encodeURIComponent(q.code)}`, first: day === q.check_in || day === first,
          text: q.guest_name, label: `Solicitud pendiente (no ocupa la habitación): ${q.guest_name}, ${formatDate(q.check_in)} a ${formatDate(q.check_out)}` });
      }
    }
    return items;
  }

  return (
    <AdminPage title="Calendario" description="Ocupación real por habitación. Las solicitudes pendientes se muestran aparte: todavía no ocupan la habitación.">
      <div className="cal-bar">
        <button type="button" className="button button-ghost" onClick={() => shift(-1)}>‹ Mes anterior</button>
        <h2 aria-live="polite">{monthFormatter.format(new Date(`${first}T00:00:00Z`))}</h2>
        <button type="button" className="button button-ghost" onClick={() => shift(1)}>Mes siguiente ›</button>
        <button type="button" className="button button-ghost" onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })}>Hoy</button>
      </div>
      <ul className="cal-legend" aria-label="Leyenda">
        <li><span className="cal-swatch cal-confirmed" aria-hidden="true" />Reserva confirmada</li>
        <li><span className="cal-swatch cal-checked_in" aria-hidden="true" />Hospedado</li>
        <li><span className="cal-swatch cal-block" aria-hidden="true" />Bloqueo</li>
        <li><span className="cal-swatch cal-pending" aria-hidden="true" />Solicitud pendiente (no ocupada)</li>
        <li><span className="cal-swatch" style={{ background: 'var(--color-mint-boarding-pass)' }} aria-hidden="true" />Hoy</li>
      </ul>
      {rooms.isLoading || data.isLoading ? <Loading /> : rooms.error ? <ErrorState error={rooms.error} onRetry={rooms.refetch} /> :
        data.error ? <ErrorState error={data.error} onRetry={data.refetch} /> : visibleRooms.length === 0 ? <EmptyState title="No hay habitaciones activas" /> : (
          <div className="cal-scroll" tabIndex={0} role="region" aria-label="Calendario de ocupación, desplazable horizontalmente">
            <table className="cal-grid">
              <thead>
                <tr>
                  <th className="cal-room" scope="col">Habitación</th>
                  {days.map(day => (
                    <th key={day} scope="col" className={day === today ? 'cal-today' : ''} aria-current={day === today ? 'date' : undefined}>
                      {Number(day.slice(8))}<small>{weekdayFormatter.format(new Date(`${day}T00:00:00Z`))}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRooms.map(room => (
                  <tr key={room.id}>
                    <th scope="row" className="cal-room" title={roomLabel(room)}>{roomLabel(room)}</th>
                    {days.map(day => {
                      const items = itemsFor(room.id, day);
                      return (
                        <td key={day} className={day === today ? 'cal-today' : [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ? 'cal-weekend' : ''}>
                          {items.map(item => (
                            <Link key={item.key} to={item.to} className={`cal-cell cal-${item.kind}`} aria-label={`Habitación ${room.number}, ${formatDate(day)}. ${item.label}`} title={item.label}>
                              {item.first ? item.text.slice(0, 6) : ' '}
                            </Link>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p className="ops-muted cal-hint">La salida de una reserva no ocupa esa noche: el día de salida la habitación vuelve a estar libre. Selecciona un elemento para ir a su página.</p>
    </AdminPage>
  );
}
