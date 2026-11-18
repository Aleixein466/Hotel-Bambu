import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { formatDateTime, POST_KIND, POST_STATUS } from '../lib/format.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EmptyState, ErrorState, Loading, useConfirm } from '../ui/Feedback.jsx';
import { MediaThumb } from '../ui/MediaPicker.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { DraftBadge, MoveButtons, reorderRows, useMediaMap, useRunner } from './contentApi.jsx';

const STATUS_TONE = { published: 'green', draft: 'gold', unpublished: 'gray' };

export default function PostsAdmin() {
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const [run, busy] = useRunner();
  const { map } = useMediaMap();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [trash, setTrash] = useState(false);

  const { data: posts, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'posts'],
    queryFn: () => unwrap(supabase.from('posts').select('*').order('sort_order').order('created_at', { ascending: false })),
  });

  const active = useMemo(() => (posts || []).filter(p => !p.deleted_at), [posts]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (posts || []).filter(p =>
      Boolean(p.deleted_at) === trash
      && (!term || `${p.title} ${p.slug}`.toLowerCase().includes(term))
      && (!kind || p.kind === kind)
      && (!status || p.status === status));
  }, [posts, search, kind, status, trash]);
  const filtering = Boolean(search.trim() || kind || status);

  const publish = post => run(() => unwrap(supabase.rpc('publish_post', { p_post_id: post.id })), `"${post.title}" publicada.`);
  const unpublish = post => run(() => unwrapRows(supabase.from('posts').update({ status: 'unpublished' }).eq('id', post.id).select('id')), `"${post.title}" despublicada.`);
  const restore = post => run(() => unwrapRows(supabase.from('posts').update({ deleted_at: null, status: 'unpublished' }).eq('id', post.id).select('id')),
    `"${post.title}" restaurada. Quedó sin publicar.`);
  const move = (index, direction) => run(() => reorderRows('posts', active, index, direction), 'Orden actualizado.');

  async function softDelete(post) {
    const ok = await confirm({ title: 'Enviar a la papelera', message: `"${post.title}" dejará de mostrarse en el sitio. Podrás restaurarla desde la papelera.`, confirmLabel: 'Eliminar', danger: true });
    if (ok) run(() => unwrapRows(supabase.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', post.id).select('id')), `"${post.title}" enviada a la papelera.`);
  }
  async function purge(post) {
    const ok = await confirm({ title: 'Eliminar definitivamente', message: `"${post.title}" se borrará para siempre. Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar definitivamente', danger: true });
    if (!ok) return;
    run(async () => {
      const gone = await unwrapRows(supabase.from('posts').delete().eq('id', post.id).select('id'));
      if (!gone.length) throw new Error('No se pudo eliminar la publicación.');
    }, `"${post.title}" eliminada definitivamente.`);
  }

  return (
    <AdminPage title="Publicaciones" description="Noticias, promociones y ofertas del hotel."
      actions={<Link className="button button-primary" to="/admin/publicaciones/nueva">Nueva publicación</Link>}>
      <div className="admin-toolbar">
        <label className="search-field">Buscar
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Título o enlace" />
        </label>
        <label>Tipo
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(POST_KIND).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Estado
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(POST_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={trash} onChange={e => setTrash(e.target.checked)} />
          Papelera
        </label>
      </div>
      {filtering && !trash && <p className="ca-meta">El orden solo se puede cambiar sin filtros activos.</p>}

      <section className="panel" aria-label={trash ? 'Papelera' : 'Lista de publicaciones'}>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState title={trash ? 'La papelera está vacía.' : 'No hay publicaciones que coincidan.'} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">{trash ? 'Publicaciones en la papelera' : 'Publicaciones'}</caption>
              <thead>
                <tr>
                  <th scope="col">Imagen</th><th scope="col">Título</th><th scope="col">Tipo</th><th scope="col">Estado</th>
                  <th scope="col">Publicada</th>{!trash && <th scope="col">Orden</th>}<th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(post => (
                  <tr key={post.id}>
                    <td className="ca-thumb-cell"><MediaThumb media={map.get(post.draft?.cover_media_id ?? post.cover_media_id)} /></td>
                    <th scope="row" className="ca-clamp"><span title={post.title}>{post.title}</span><br /><small className="ca-meta">/{post.slug}</small></th>
                    <td>{POST_KIND[post.kind]}</td>
                    <td>
                      <div className="ca-row">
                        <StatusPill tone={STATUS_TONE[post.status]}>{POST_STATUS[post.status]}</StatusPill>
                        <DraftBadge draft={post.draft} />
                      </div>
                    </td>
                    <td>{post.published_at ? formatDateTime(post.published_at) : '—'}</td>
                    {!trash && (
                      <td><MoveButtons index={active.findIndex(p => p.id === post.id)} count={active.length} label={`publicación ${post.title}`} disabled={busy || filtering} onMove={move} /></td>
                    )}
                    <td className="ca-actions-cell">
                      <div className="ca-row">
                        {!trash && <Link className="button button-ghost btn-sm" to={`/admin/publicaciones/${post.id}`}>Editar</Link>}
                        {!trash && post.status !== 'published' && <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => publish(post)}>Publicar</button>}
                        {!trash && post.status === 'published' && <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => unpublish(post)}>Despublicar</button>}
                        {!trash && <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => softDelete(post)}>Eliminar</button>}
                        {trash && <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => restore(post)}>Restaurar</button>}
                        {trash && isAdmin && <button type="button" className="button button-danger btn-sm" disabled={busy} onClick={() => purge(post)}>Eliminar definitivamente</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPage>
  );
}
