import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { formatDate, nightsBetween, RESERVATION_STATUS } from '../lib/format.js';
import { Loading, ErrorState, EmptyState, useConfirm, useToast } from '../ui/Feedback.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { RESERVATION_TONE, roomLabel, useInvalidateAdmin, useOpsRooms } from './opsApi.js';
import './ops-admin.css';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Selecciona una fecha válida.');

const reservationSchema = z.object({
  room_id: z.string().min(1, 'Elige una habitación.'),
  guest_name: z.string().trim().min(2, 'Escribe el nombre del huésped (mínimo 2 letras).').max(120, 'El nombre es demasiado largo.'),
  phone: z.string().transform(v => v.replace(/\D/g, '')).refine(v => v === '' || /^\d{7,15}$/.test(v), 'El teléfono debe tener entre 7 y 15 dígitos.'),
  check_in: date,
  check_out: date,
  guests: z.coerce.number().int('Indica un número entero.').min(1, 'Mínimo 1 huésped.').max(20, 'Máximo 20 huéspedes.'),
  notes: z.string().max(2000, 'Las notas son demasiado largas.'),
}).refine(v => v.check_out > v.check_in, { path: ['check_out'], message: 'La salida debe ser posterior a la entrada.' });

const blockSchema = z.object({
  room_id: z.string().min(1, 'Elige una habitación.'),
  start_date: date,
  end_date: date,
  reason: z.string().trim().min(1, 'Indica el motivo.').max(200, 'El motivo es demasiado largo.'),
}).refine(v => v.end_date >= v.start_date, { path: ['end_date'], message: 'La fecha final no puede ser anterior a la inicial.' });

const EMPTY_RES = { room_id: '', guest_name: '', phone: '', check_in: '', check_out: '', guests: '1', notes: '' };
const EMPTY_BLOCK = { room_id: '', start_date: '', end_date: '', reason: 'Mantenimiento' };

function FieldError({ message }) { return message ? <span className="form-error" role="alert">{message}</span> : null; }

function ReservationForm({ rooms, onDone }) {
  const { user } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateAdmin();
  const [form, setForm] = useState(EMPTY_RES);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const room = rooms.find(r => r.id === form.room_id);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const create = useMutation({
    mutationFn: payload => unwrap(supabase.from('reservations').insert({ ...payload, phone: payload.phone || null, source: 'manual', status: 'confirmed', created_by: user?.id })),
    onSuccess: async () => {
      await invalidate();
      toast.success('Reserva creada.');
      setForm(EMPTY_RES); setErrors({}); setServerError('');
      onDone();
    },
    onError: err => { setServerError(err.message); toast.error(err.message); },
  });

  function submit(e) {
    e.preventDefault();
    setServerError('');
    const parsed = reservationSchema.safeParse(form);
    const next = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[issue.path[0]] ??= issue.message;
    if (room && Number(form.guests) > room.capacity) next.guests = `Esta habitación admite hasta ${room.capacity} huéspedes.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    create.mutate(parsed.data);
  }

  return (
    <section className="panel ops-form-card" aria-labelledby="new-res-title">
      <div className="panel-head"><h3 id="new-res-title">Nueva reserva manual</h3></div>
      <form className="admin-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <label>Habitación
            <select name="room_id" value={form.room_id} onChange={set('room_id')} required aria-invalid={Boolean(errors.room_id)}>
              <option value="">Elige una habitación</option>
              {rooms.filter(r => r.operational_status !== 'inactive').map(r => <option key={r.id} value={r.id}>{roomLabel(r)} (hasta {r.capacity})</option>)}
            </select>
            <FieldError message={errors.room_id} />
          </label>
          <label>Nombre del huésped
            <input name="guest_name" value={form.guest_name} onChange={set('guest_name')} maxLength={120} required aria-invalid={Boolean(errors.guest_name)} />
            <FieldError message={errors.guest_name} />
          </label>
          <label>Teléfono (opcional)
            <input name="phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} aria-invalid={Boolean(errors.phone)} />
            <FieldError message={errors.phone} />
          </label>
          <label>Entrada
            <input name="check_in" type="date" value={form.check_in} onChange={set('check_in')} required aria-invalid={Boolean(errors.check_in)} />
            <FieldError message={errors.check_in} />
          </label>
          <label>Salida
            <input name="check_out" type="date" value={form.check_out} min={form.check_in || undefined} onChange={set('check_out')} required aria-invalid={Boolean(errors.check_out)} />
            <FieldError message={errors.check_out} />
          </label>
          <label>Huéspedes{room ? ` (máx. ${room.capacity})` : ''}
            <input name="guests" type="number" min="1" max={room?.capacity || 20} value={form.guests} onChange={set('guests')} required aria-invalid={Boolean(errors.guests)} />
            <FieldError message={errors.guests} />
          </label>
        </div>
        <label>Notas
          <textarea name="notes" value={form.notes} maxLength={2000} onChange={set('notes')} />
          <FieldError message={errors.notes} />
        </label>
        {serverError && <p className="form-error" role="alert">{serverError}</p>}
        <div className="ops-inline">
          <button type="submit" className="button button-primary" disabled={create.isPending}>{create.isPending ? 'Guardando…' : 'Crear reserva'}</button>
          <button type="button" className="button button-ghost" disabled={create.isPending} onClick={onDone}>Cerrar</button>
        </div>
      </form>
    </section>
  );
}

function ReservationsTab({ rooms }) {
  const toast = useToast();
  const confirm = useConfirm();
  const invalidate = useInvalidateAdmin();
  const [filters, setFilters] = useState({ status: 'all', room: '', from: '', to: '' });
  const [creating, setCreating] = useState(false);
  const [rowError, setRowError] = useState('');
  const set = key => e => setFilters(f => ({ ...f, [key]: e.target.value }));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'reservations', filters],
    queryFn: () => {
      let query = supabase.from('reservations').select('id,room_id,guest_name,phone,check_in,check_out,guests,status,source,notes,rooms(number,name)').order('check_in', { ascending: false }).limit(500);
      if (filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.room) query = query.eq('room_id', filters.room);
      if (filters.from) query = query.gte('check_out', filters.from);
      if (filters.to) query = query.lte('check_in', filters.to);
      return unwrap(query);
    },
  });

  const change = useMutation({
    mutationFn: ({ id, status }) => unwrapRows(supabase.from('reservations').update({ status }).eq('id', id).select('id')),
    onSuccess: async (_, { status }) => {
      setRowError('');
      await invalidate();
      toast.success({ checked_in: 'Entrada registrada.', checked_out: 'Salida registrada.', cancelled: 'Reserva cancelada.' }[status]);
    },
    onError: err => { setRowError(err.message); toast.error(err.message); },
  });

  async function setStatus(reservation, status) {
    if (status === 'cancelled') {
      const ok = await confirm({ title: '¿Cancelar la reserva?', message: `${reservation.guest_name} · ${formatDate(reservation.check_in)}. Las fechas quedarán libres.`, confirmLabel: 'Sí, cancelar reserva', cancelLabel: 'Volver', danger: true });
      if (!ok) return;
    }
    change.mutate({ id: reservation.id, status });
  }

  return (
    <>
      <div className="ops-inline" style={{ marginBottom: 16 }}>
        <button type="button" className="button button-primary" onClick={() => setCreating(v => !v)} aria-expanded={creating}>Nueva reserva manual</button>
      </div>
      {creating && <ReservationForm rooms={rooms} onDone={() => setCreating(false)} />}
      <form className="ops-toolbar" role="search" onSubmit={e => e.preventDefault()}>
        <label>Estado
          <select value={filters.status} onChange={set('status')}>
            <option value="all">Todos</option>
            {Object.entries(RESERVATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Habitación
          <select value={filters.room} onChange={set('room')}>
            <option value="">Todas</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{roomLabel(r)}</option>)}
          </select>
        </label>
        <label>Estadías desde<input type="date" value={filters.from} onChange={set('from')} /></label>
        <label>Estadías hasta<input type="date" value={filters.to} onChange={set('to')} /></label>
      </form>
      {rowError && <p className="form-error" role="alert">{rowError}</p>}
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.length === 0 ? <EmptyState title="No hay reservas con estos filtros" /> : (
        <div className="panel table-scroll">
          <table className="data-table ops-table">
            <thead><tr><th>Huésped</th><th>Habitación</th><th>Entrada</th><th>Salida</th><th>Noches</th><th>Huésp.</th><th>Origen</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} data-reservation-id={r.id}>
                  <td>{r.guest_name}{r.phone && <><br /><small className="ops-muted">{r.phone}</small></>}</td>
                  <td>{roomLabel(r.rooms)}</td>
                  <td>{formatDate(r.check_in)}</td>
                  <td>{formatDate(r.check_out)}</td>
                  <td>{nightsBetween(r.check_in, r.check_out)}</td>
                  <td>{r.guests}</td>
                  <td>{r.source === 'request' ? 'Solicitud' : 'Manual'}</td>
                  <td><StatusPill tone={RESERVATION_TONE[r.status]}>{RESERVATION_STATUS[r.status]}</StatusPill></td>
                  <td>
                    <div className="row-actions">
                      {r.status === 'confirmed' && <button type="button" className="button button-ghost" disabled={change.isPending} onClick={() => setStatus(r, 'checked_in')}>Registrar entrada</button>}
                      {r.status === 'checked_in' && <button type="button" className="button button-ghost" disabled={change.isPending} onClick={() => setStatus(r, 'checked_out')}>Registrar salida</button>}
                      {(r.status === 'confirmed' || r.status === 'checked_in') && <button type="button" className="button button-danger" disabled={change.isPending} onClick={() => setStatus(r, 'cancelled')}>Cancelar reserva</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BlocksTab({ rooms }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const invalidate = useInvalidateAdmin();
  const [form, setForm] = useState(EMPTY_BLOCK);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'blocks', showInactive],
    queryFn: () => {
      let query = supabase.from('room_blocks').select('id,room_id,start_date,end_date,reason,active,rooms(number,name)').order('start_date', { ascending: false }).limit(300);
      if (!showInactive) query = query.eq('active', true);
      return unwrap(query);
    },
  });

  const create = useMutation({
    mutationFn: payload => unwrap(supabase.from('room_blocks').insert({ ...payload, created_by: user?.id })),
    onSuccess: async () => {
      await invalidate();
      toast.success('Bloqueo creado.');
      setForm(EMPTY_BLOCK); setErrors({}); setServerError('');
    },
    onError: err => { setServerError(err.message); toast.error(err.message); },
  });
  const deactivate = useMutation({
    mutationFn: id => unwrapRows(supabase.from('room_blocks').update({ active: false }).eq('id', id).select('id')),
    onSuccess: async () => { setServerError(''); await invalidate(); toast.success('Bloqueo desactivado.'); },
    onError: err => { setServerError(err.message); toast.error(err.message); },
  });

  function submit(e) {
    e.preventDefault();
    setServerError('');
    const parsed = blockSchema.safeParse(form);
    const next = {};
    if (!parsed.success) for (const issue of parsed.error.issues) next[issue.path[0]] ??= issue.message;
    setErrors(next);
    if (!parsed.success) return;
    create.mutate(parsed.data);
  }

  async function remove(block) {
    const ok = await confirm({ title: '¿Desactivar el bloqueo?', message: `${roomLabel(block.rooms)} · ${formatDate(block.start_date)} al ${formatDate(block.end_date)}. Las fechas volverán a estar disponibles.`, confirmLabel: 'Sí, desactivar', cancelLabel: 'Volver', danger: true });
    if (ok) deactivate.mutate(block.id);
  }

  return (
    <>
      <section className="panel ops-form-card" aria-labelledby="new-block-title">
        <div className="panel-head"><h3 id="new-block-title">Nuevo bloqueo de habitación</h3></div>
        <form className="admin-form" onSubmit={submit} noValidate>
          <div className="form-grid">
            <label>Habitación
              <select name="room_id" value={form.room_id} onChange={set('room_id')} required aria-invalid={Boolean(errors.room_id)}>
                <option value="">Elige una habitación</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{roomLabel(r)}</option>)}
              </select>
              <FieldError message={errors.room_id} />
            </label>
            <label>Primer día bloqueado
              <input name="start_date" type="date" value={form.start_date} onChange={set('start_date')} required aria-invalid={Boolean(errors.start_date)} />
              <FieldError message={errors.start_date} />
            </label>
            <label>Último día bloqueado (incluido)
              <input name="end_date" type="date" value={form.end_date} min={form.start_date || undefined} onChange={set('end_date')} required aria-invalid={Boolean(errors.end_date)} />
              <FieldError message={errors.end_date} />
            </label>
            <label>Motivo
              <input name="reason" value={form.reason} maxLength={200} onChange={set('reason')} required aria-invalid={Boolean(errors.reason)} />
              <FieldError message={errors.reason} />
            </label>
          </div>
          {serverError && <p className="form-error" role="alert">{serverError}</p>}
          <div className="ops-inline"><button type="submit" className="button button-primary" disabled={create.isPending}>{create.isPending ? 'Guardando…' : 'Crear bloqueo'}</button></div>
        </form>
      </section>
      <label className="checkbox ops-inline" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ width: 20, minHeight: 20 }} /> Mostrar bloqueos desactivados
      </label>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.length === 0 ? <EmptyState title="No hay bloqueos" /> : (
        <div className="panel table-scroll">
          <table className="data-table ops-table">
            <thead><tr><th>Habitación</th><th>Desde</th><th>Hasta (incl.)</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {data.map(b => (
                <tr key={b.id} data-block-id={b.id}>
                  <td>{roomLabel(b.rooms)}</td>
                  <td>{formatDate(b.start_date)}</td>
                  <td>{formatDate(b.end_date)}</td>
                  <td className="cell-wrap">{b.reason}</td>
                  <td><StatusPill tone={b.active ? 'gold' : 'gray'}>{b.active ? 'Activo' : 'Desactivado'}</StatusPill></td>
                  <td>{b.active && <button type="button" className="button button-danger" disabled={deactivate.isPending} onClick={() => remove(b)}>Desactivar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function ReservationsAdmin() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'bloqueos' ? 'bloqueos' : 'reservas');
  const rooms = useOpsRooms();
  return (
    <AdminPage title="Reservas y bloqueos" description="Reservas confirmadas y fechas bloqueadas por habitación. La base de datos impide superposiciones.">
      <div className="ops-tabs" role="tablist" aria-label="Secciones">
        {[['reservas', 'Reservas'], ['bloqueos', 'Bloqueos']].map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {rooms.isLoading ? <Loading /> : rooms.error ? <ErrorState error={rooms.error} onRetry={rooms.refetch} /> :
          tab === 'reservas' ? <ReservationsTab rooms={rooms.data} /> : <BlocksTab rooms={rooms.data} />}
      </div>
    </AdminPage>
  );
}
