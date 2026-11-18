import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { formatDate, formatDateTime, nightsBetween, REQUEST_STATUS } from '../lib/format.js';
import { buildWhatsAppLink } from '../lib/whatsapp.js';
import { Loading, ErrorState, EmptyState, useConfirm, useToast } from '../ui/Feedback.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { REQUEST_TONE, roomLabel, useInvalidateAdmin, useOpsRooms } from './opsApi.js';
import './ops-admin.css';

const SELECT = 'id,code,room_id,check_in,check_out,guests,guest_name,phone,status,admin_notes,reservation_id,handled_at,created_at,rooms(number,name)';

/** El teléfono se guarda sin indicativo si son 10 dígitos de celular colombiano. */
function guestWhatsApp(request) {
  const digits = String(request.phone || '');
  const number = digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits;
  return buildWhatsAppLink(number, {
    guestName: request.guest_name, roomLabel: roomLabel(request.rooms), checkIn: request.check_in,
    checkOut: request.check_out, guests: request.guests, code: request.code,
  });
}

function RequestDetail({ request, notes, onNotes, onSaveNote, busy, onClose }) {
  const link = guestWhatsApp(request);
  return (
    <aside className="panel ops-detail" aria-label={`Detalle de la solicitud ${request.code}`}>
      <div className="ops-detail-head">
        <h3>{request.code}</h3>
        <button type="button" className="button button-ghost" onClick={onClose}>Cerrar</button>
      </div>
      <StatusPill tone={REQUEST_TONE[request.status]}>{REQUEST_STATUS[request.status]}</StatusPill>
      <dl>
        <dt>Huésped</dt><dd>{request.guest_name}</dd>
        <dt>Teléfono</dt><dd>{request.phone}</dd>
        <dt>Habitación</dt><dd>{roomLabel(request.rooms)}</dd>
        <dt>Entrada</dt><dd>{formatDate(request.check_in)}</dd>
        <dt>Salida</dt><dd>{formatDate(request.check_out)}</dd>
        <dt>Noches</dt><dd>{nightsBetween(request.check_in, request.check_out)}</dd>
        <dt>Huéspedes</dt><dd>{request.guests}</dd>
        <dt>Recibida</dt><dd>{formatDateTime(request.created_at)}</dd>
        {request.handled_at && <><dt>Gestionada</dt><dd>{formatDateTime(request.handled_at)}</dd></>}
      </dl>
      <label>Notas internas
        <textarea value={notes} maxLength={2000} onChange={e => onNotes(e.target.value)} />
      </label>
      <p className="field-hint">Las notas se guardan también al confirmar, rechazar o cancelar.</p>
      <div className="row-actions">
        <button type="button" className="button button-ghost" disabled={busy || notes === (request.admin_notes || '')} onClick={onSaveNote}>Guardar nota</button>
        {link ? <a className="button button-light" href={link} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
          : <span className="field-hint">El teléfono no tiene el formato necesario para abrir WhatsApp.</span>}
      </div>
    </aside>
  );
}

export default function RequestsAdmin() {
  const rooms = useOpsRooms();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ status: 'all', room: '', from: '', to: '', q: params.get('q') || '' });
  const [selectedId, setSelectedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [actionError, setActionError] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const invalidate = useInvalidateAdmin();
  const notesOf = r => drafts[r.id] ?? r.admin_notes ?? '';
  const set = key => e => setFilters(f => ({ ...f, [key]: e.target.value }));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'requests', filters],
    queryFn: async () => {
      let query = supabase.from('booking_requests').select(SELECT).order('created_at', { ascending: false }).limit(500);
      if (filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.room) query = query.eq('room_id', filters.room);
      if (filters.from) query = query.gte('check_in', filters.from);
      if (filters.to) query = query.lte('check_in', filters.to);
      const q = filters.q.trim().replace(/[,()*%\\"]/g, ' ').trim();
      if (q) query = query.or(`guest_name.ilike.%${q}%,phone.ilike.%${q}%,code.ilike.%${q}%`);
      const rows = await unwrap(query);
      return [...rows].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));
    },
  });

  const selected = data?.find(r => r.id === selectedId) || null;

  const run = useMutation({
    mutationFn: ({ request, kind }) => {
      const notes = notesOf(request);
      if (kind === 'confirm') return unwrap(supabase.rpc('confirm_booking_request', { p_request_id: request.id, p_notes: notes }));
      if (kind === 'note') return unwrapRows(supabase.from('booking_requests').update({ admin_notes: notes }).eq('id', request.id).select('id'));
      return unwrap(supabase.rpc('set_booking_request_status', { p_request_id: request.id, p_status: kind, p_notes: notes }));
    },
    onSuccess: async (_, { request, kind }) => {
      setActionError('');
      setDrafts(d => { const next = { ...d }; delete next[request.id]; return next; });
      await invalidate();
      toast.success({ confirm: 'Reserva confirmada.', rejected: 'Solicitud rechazada.', cancelled: 'Solicitud cancelada.', note: 'Nota guardada.' }[kind]);
    },
    onError: err => { setActionError(err.message); toast.error(err.message); },
  });

  async function act(request, kind) {
    if (kind === 'rejected' || kind === 'cancelled') {
      const ok = await confirm({
        title: kind === 'rejected' ? '¿Rechazar la solicitud?' : '¿Cancelar la solicitud?',
        message: kind === 'cancelled' && request.status === 'confirmed'
          ? 'Se cancelará también la reserva asociada y se liberarán las fechas.' : 'Esta acción queda registrada en la actividad.',
        confirmLabel: 'Sí, continuar', cancelLabel: 'Volver', danger: true,
      });
      if (!ok) return;
    }
    run.mutate({ request, kind });
  }

  return (
    <AdminPage title="Solicitudes de reserva" description="Las solicitudes llegan desde el sitio público. Ninguna se convierte en reserva hasta que pulses Confirmar.">
      <form className="ops-toolbar" role="search" onSubmit={e => e.preventDefault()}>
        <label>Estado
          <select value={filters.status} onChange={set('status')}>
            <option value="all">Todos</option>
            {Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Habitación
          <select value={filters.room} onChange={set('room')}>
            <option value="">Todas</option>
            {(rooms.data || []).map(r => <option key={r.id} value={r.id}>{roomLabel(r)}</option>)}
          </select>
        </label>
        <label>Entrada desde<input type="date" value={filters.from} onChange={set('from')} /></label>
        <label>Entrada hasta<input type="date" value={filters.to} onChange={set('to')} /></label>
        <label>Buscar<input type="search" value={filters.q} onChange={set('q')} placeholder="Nombre, teléfono o código" /></label>
      </form>

      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.length === 0 ? (
        <EmptyState title="No hay solicitudes con estos filtros" />
      ) : (
        <div className="ops-split">
          <div className="panel table-scroll">
            <table className="data-table ops-table">
              <thead><tr><th>Código</th><th>Huésped</th><th>Habitación</th><th>Entrada</th><th>Salida</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.id} data-request-code={r.code} data-selected={r.id === selectedId} onClick={e => { if (!e.target.closest('button,a')) setSelectedId(r.id); }}>
                    <td>{r.code}</td>
                    <td>{r.guest_name}<br /><small className="ops-muted">{r.phone}</small></td>
                    <td>{roomLabel(r.rooms)}</td>
                    <td>{formatDate(r.check_in)}</td>
                    <td>{formatDate(r.check_out)}</td>
                    <td><StatusPill tone={REQUEST_TONE[r.status]}>{REQUEST_STATUS[r.status]}</StatusPill></td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="button button-ghost" aria-label={`Ver detalle de ${r.code}`} onClick={() => setSelectedId(r.id)}>Detalle</button>
                        {r.status === 'pending' && <button type="button" className="button button-primary" disabled={run.isPending} onClick={() => act(r, 'confirm')}>Confirmar</button>}
                        {r.status === 'pending' && <button type="button" className="button button-ghost" disabled={run.isPending} onClick={() => act(r, 'rejected')}>Rechazar</button>}
                        {(r.status === 'pending' || r.status === 'confirmed') && <button type="button" className="button button-danger" disabled={run.isPending} onClick={() => act(r, 'cancelled')}>Cancelar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected ? <RequestDetail request={selected} notes={notesOf(selected)} busy={run.isPending}
            onNotes={value => setDrafts(d => ({ ...d, [selected.id]: value }))}
            onSaveNote={() => run.mutate({ request: selected, kind: 'note' })} onClose={() => setSelectedId(null)} />
            : <div className="empty-state"><strong>Selecciona una solicitud</strong><div>Pulsa «Detalle» para ver sus datos y notas.</div></div>}
        </div>
      )}
    </AdminPage>
  );
}
