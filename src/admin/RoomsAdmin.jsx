import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { formatPrice, PUBLISH_STATUS, ROOM_OPERATIONAL } from '../lib/format.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EmptyState, ErrorState, Loading, useConfirm } from '../ui/Feedback.jsx';
import { MediaThumb } from '../ui/MediaPicker.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { DraftBadge, MoveButtons, reorderRows, useMediaMap, useRunner } from './contentApi.jsx';

const PUBLISH_TONE = { published: 'green', hidden: 'gray', draft: 'gold' };
const OPERATIONAL_TONE = { available: 'green', maintenance: 'blue', inactive: 'red' };

export default function RoomsAdmin() {
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [run, busy] = useRunner();
  const { map } = useMediaMap();
  const [search, setSearch] = useState('');
  const [publish, setPublish] = useState('');
  const [operational, setOperational] = useState('');

  const { data: rooms, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'rooms'],
    queryFn: () => unwrap(supabase.from('rooms').select('*').order('sort_order').order('number')),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rooms || []).filter(r =>
      (!term || `${r.number} ${r.name} ${r.room_type}`.toLowerCase().includes(term))
      && (!publish || r.publish_status === publish)
      && (!operational || r.operational_status === operational));
  }, [rooms, search, publish, operational]);
  const filtering = Boolean(search.trim() || publish || operational);

  const update = (room, patch, message) => run(() => unwrapRows(supabase.from('rooms').update(patch).eq('id', room.id).select('id')), message);
  const move = (index, direction) => run(() => reorderRows('rooms', rooms, index, direction), 'Orden actualizado.');

  async function deactivate(room) {
    const ok = await confirm({
      title: `Desactivar habitación ${room.number}`,
      message: 'Dejará de mostrarse en el sitio y no podrá recibir reservas. Las reservas existentes se conservan. Puedes reactivarla cuando quieras.',
      confirmLabel: 'Desactivar', danger: true,
    });
    if (ok) update(room, { operational_status: 'inactive' }, `Habitación ${room.number} desactivada.`);
  }

  return (
    <AdminPage
      title="Habitaciones"
      description="Edita la información que ven los visitantes. Los cambios del editor se publican cuando tú lo decides."
      actions={isAdmin && <Link className="button button-primary" to="/admin/habitaciones/nueva">Nueva habitación</Link>}
    >
      <div className="admin-toolbar">
        <label className="search-field">Buscar
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Número, nombre o tipo" />
        </label>
        <label>Publicación
          <select value={publish} onChange={e => setPublish(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(PUBLISH_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Estado operativo
          <select value={operational} onChange={e => setOperational(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ROOM_OPERATIONAL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {filtering && <p className="ca-meta">El orden solo se puede cambiar sin filtros activos.</p>}

      <section className="panel" aria-label="Lista de habitaciones">
        {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState title="No hay habitaciones que coincidan." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Habitaciones del hotel</caption>
              <thead>
                <tr>
                  <th scope="col">Foto</th><th scope="col">N.º</th><th scope="col">Nombre</th><th scope="col">Tipo</th>
                  <th scope="col">Capacidad</th><th scope="col">Precio</th><th scope="col">Estado</th><th scope="col">Publicación</th>
                  <th scope="col">Orden</th><th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(room => {
                  const index = rooms.findIndex(r => r.id === room.id);
                  return (
                    <tr key={room.id}>
                      <td className="ca-thumb-cell"><MediaThumb media={map.get(room.cover_media_id)} /></td>
                      <th scope="row">{room.number}</th>
                      <td>{room.name}</td>
                      <td>{room.room_type}</td>
                      <td>{room.capacity}</td>
                      <td>{room.price_cop == null ? 'Por confirmar' : formatPrice(room.price_cop)}</td>
                      <td><StatusPill tone={OPERATIONAL_TONE[room.operational_status]}>{ROOM_OPERATIONAL[room.operational_status]}</StatusPill></td>
                      <td>
                        <div className="ca-row">
                          <StatusPill tone={PUBLISH_TONE[room.publish_status]}>{PUBLISH_STATUS[room.publish_status]}</StatusPill>
                          <DraftBadge draft={room.draft} />
                        </div>
                      </td>
                      <td><MoveButtons index={index} count={rooms.length} label={`habitación ${room.number}`} disabled={busy || filtering} onMove={move} /></td>
                      <td className="ca-actions-cell">
                        <div className="ca-row">
                          <Link className="button button-ghost btn-sm" to={`/admin/habitaciones/${room.id}`}>Editar</Link>
                          {room.publish_status === 'published' && (
                            <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => update(room, { publish_status: 'hidden' }, `Habitación ${room.number} oculta.`)}>Ocultar</button>
                          )}
                          {room.publish_status === 'hidden' && (
                            <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => update(room, { publish_status: 'published' }, `Habitación ${room.number} visible en el sitio.`)}>Mostrar</button>
                          )}
                          {room.operational_status !== 'inactive' && (
                            <button type="button" className="button button-ghost btn-sm" disabled={busy}
                              onClick={() => update(room, { operational_status: room.operational_status === 'maintenance' ? 'available' : 'maintenance' },
                                room.operational_status === 'maintenance' ? `Habitación ${room.number} disponible.` : `Habitación ${room.number} en mantenimiento.`)}>
                              {room.operational_status === 'maintenance' ? 'Quitar mantenimiento' : 'Mantenimiento'}
                            </button>
                          )}
                          {isAdmin && room.operational_status !== 'inactive' && (
                            <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => deactivate(room)}>Desactivar</button>
                          )}
                          {isAdmin && room.operational_status === 'inactive' && (
                            <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => update(room, { operational_status: 'available' }, `Habitación ${room.number} reactivada.`)}>Reactivar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPage>
  );
}
