import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase, unwrap } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { addDays, formatDateTime, formatShortDate, hotelToday } from '../lib/format.js';
import { Loading, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { AdminPage } from './AdminLayout.jsx';
import { ACTION_LABEL, ENTITY_LABEL, roomLabel, summarizeChanges } from './opsApi.js';
import './ops-admin.css';

function Stat({ label, value, to, hint }) {
  const body = <><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</>;
  return to ? <Link className="stat-card" to={to}>{body}</Link> : <div className="stat-card">{body}</div>;
}

function StayList({ title, rows, dateKey, to, empty }) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head"><h3>{title}</h3><Link className="ops-text-link" to={to}>Ver reservas</Link></div>
      {rows.length === 0 ? <p className="ops-muted">{empty}</p> : (
        <ul className="ops-list">
          {rows.map(r => (
            <li key={r.id}>
              <span><strong>{r.guest_name}</strong><br /><small>Habitación {roomLabel(r.rooms)} · {r.guests} huésp.</small></span>
              <span>{formatShortDate(r[dateKey])}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminLists() {
  const today = hotelToday();
  const end = addDays(today, 7);
  const select = 'id,guest_name,guests,check_in,check_out,status,rooms(number,name)';
  const arrivals = useQuery({
    queryKey: ['admin', 'dashboard', 'arrivals', today],
    queryFn: () => unwrap(supabase.from('reservations').select(select).eq('status', 'confirmed').gte('check_in', today).lte('check_in', end).order('check_in').limit(20)),
  });
  const departures = useQuery({
    queryKey: ['admin', 'dashboard', 'departures', today],
    queryFn: () => unwrap(supabase.from('reservations').select(select).in('status', ['confirmed', 'checked_in']).gte('check_out', today).lte('check_out', end).order('check_out').limit(20)),
  });
  const activity = useQuery({
    queryKey: ['admin', 'dashboard', 'activity'],
    queryFn: () => unwrap(supabase.from('audit_logs').select('id,actor_email,action,entity,entity_id,changes,created_at').order('created_at', { ascending: false }).limit(8)),
  });
  return (
    <>
      <div className="ops-columns">
        {arrivals.isLoading ? <Loading /> : arrivals.error ? <ErrorState error={arrivals.error} onRetry={arrivals.refetch} /> :
          <StayList title="Próximas llegadas (7 días)" rows={arrivals.data} dateKey="check_in" to="/admin/reservas" empty="No hay llegadas confirmadas en los próximos 7 días." />}
        {departures.isLoading ? <Loading /> : departures.error ? <ErrorState error={departures.error} onRetry={departures.refetch} /> :
          <StayList title="Próximas salidas (7 días)" rows={departures.data} dateKey="check_out" to="/admin/reservas" empty="No hay salidas en los próximos 7 días." />}
      </div>
      <section className="panel" aria-label="Actividad reciente">
        <div className="panel-head"><h3>Actividad reciente</h3><Link className="ops-text-link" to="/admin/actividad">Ver todo</Link></div>
        {activity.isLoading ? <Loading /> : activity.error ? <ErrorState error={activity.error} onRetry={activity.refetch} /> :
          activity.data.length === 0 ? <EmptyState title="Aún no hay actividad registrada" /> : (
            <ul className="ops-list">
              {activity.data.map(a => (
                <li key={a.id}>
                  <span><strong>{ACTION_LABEL[a.action] || a.action} · {ENTITY_LABEL[a.entity] || a.entity}</strong><br /><small>{a.actor_email || 'Sistema'}{summarizeChanges(a.changes, 2) ? ` · ${summarizeChanges(a.changes, 2)}` : ''}</small></span>
                  <small>{formatDateTime(a.created_at)}</small>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}

export default function Dashboard() {
  const { isAdmin, profile } = useAuth();
  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: () => unwrap(supabase.rpc('dashboard_stats')),
  });

  let body;
  if (isLoading) body = <Loading />;
  else if (error) body = <ErrorState error={error} onRetry={refetch} />;
  else {
    const admin = Boolean(stats.is_admin) && isAdmin;
    const available = admin ? Math.max(0, stats.rooms_total - stats.rooms_occupied - stats.rooms_maintenance - stats.rooms_blocked_today) : null;
    body = (
      <div className="ops-stack">
        <div className="stats-grid ops-stats">
          <Stat label="Habitaciones activas" value={stats.rooms_total} to="/admin/habitaciones" />
          <Stat label="Habitaciones publicadas" value={stats.rooms_published} to="/admin/habitaciones" />
          {admin && <Stat label="Disponibles hoy" value={available} to="/admin/calendario" hint="Activas − ocupadas − mantenimiento − bloqueadas" />}
          {admin && <Stat label="Ocupadas hoy" value={stats.rooms_occupied} to="/admin/calendario" />}
          <Stat label="En mantenimiento" value={stats.rooms_maintenance} to="/admin/habitaciones" />
          {admin && <Stat label="Solicitudes pendientes" value={stats.requests_pending} to="/admin/solicitudes" />}
          {admin && <Stat label="Reservas próximas" value={stats.reservations_upcoming} to="/admin/reservas" />}
          <Stat label="Publicaciones activas" value={stats.posts_active} to="/admin/publicaciones" />
          <Stat label="Borradores" value={stats.posts_draft} to="/admin/publicaciones" />
        </div>
        {admin ? <AdminLists /> : <p className="ops-muted">Tu rol de editor incluye habitaciones, contenido, galería y publicaciones. Las solicitudes y reservas las gestiona un administrador.</p>}
      </div>
    );
  }

  return (
    <AdminPage title="Resumen" description={`Hola${profile?.full_name ? `, ${profile.full_name}` : ''}. Datos reales del hotel al día de hoy${stats?.today ? ` (${formatShortDate(stats.today)})` : ''}.`}>
      {body}
    </AdminPage>
  );
}
