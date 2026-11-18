import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase, toAppError } from '../lib/supabase.js';
import { addDays, formatDateTime } from '../lib/format.js';
import { Loading, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { AdminPage } from './AdminLayout.jsx';
import { ACTION_LABEL, ENTITY_LABEL, summarizeChanges } from './opsApi.js';
import './ops-admin.css';

const PAGE_SIZE = 50;

export default function ActivityAdmin() {
  const [filters, setFilters] = useState({ entity: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const set = key => e => { setFilters(f => ({ ...f, [key]: e.target.value })); setPage(0); };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'activity', filters, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('audit_logs').select('id,actor_email,action,entity,entity_id,changes,created_at', { count: 'exact' })
        .order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (filters.entity) query = query.eq('entity', filters.entity);
      if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00-05:00`);
      if (filters.to) query = query.lt('created_at', `${addDays(filters.to, 1)}T00:00:00-05:00`);
      const { data: rows, error: err, count } = await query;
      if (err) throw toAppError(err);
      return { rows, count: count ?? rows.length };
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <AdminPage title="Actividad" description="Registro de cambios hechos en el panel. Los datos personales de huéspedes se ocultan.">
      <form className="ops-toolbar" role="search" onSubmit={e => e.preventDefault()}>
        <label>Sección
          <select value={filters.entity} onChange={set('entity')}>
            <option value="">Todas</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Desde<input type="date" value={filters.from} onChange={set('from')} /></label>
        <label>Hasta<input type="date" value={filters.to} min={filters.from || undefined} onChange={set('to')} /></label>
      </form>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.rows.length === 0 ? <EmptyState title="No hay actividad con estos filtros" /> : (
        <>
          <div className="panel table-scroll" aria-busy={isFetching}>
            <table className="data-table ops-table">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Sección</th><th>Registro</th><th>Cambios</th></tr></thead>
              <tbody>
                {data.rows.map(a => (
                  <tr key={a.id}>
                    <td>{formatDateTime(a.created_at)}</td>
                    <td>{a.actor_email || 'Sistema'}</td>
                    <td>{ACTION_LABEL[a.action] || a.action}</td>
                    <td>{ENTITY_LABEL[a.entity] || a.entity}</td>
                    <td className="cell-wrap"><small title={a.entity_id || ''}>{a.entity_id ? (a.entity_id.length > 14 ? `${a.entity_id.slice(0, 8)}…` : a.entity_id) : '—'}</small></td>
                    <td className="cell-wrap"><small>{summarizeChanges(a.changes) || '—'}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="ops-pager" aria-label="Paginación">
            <span>Página {page + 1} de {totalPages} · {data.count} registros</span>
            <span className="ops-inline">
              <button type="button" className="button button-ghost" disabled={page === 0 || isFetching} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</button>
              <button type="button" className="button button-ghost" disabled={page + 1 >= totalPages || isFetching} onClick={() => setPage(p => p + 1)}>Siguiente</button>
            </span>
          </nav>
        </>
      )}
    </AdminPage>
  );
}
