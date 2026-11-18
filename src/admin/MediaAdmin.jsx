import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { deleteMedia, MEDIA_BUCKET } from '../lib/media.js';
import { EmptyState, ErrorState, Loading, useConfirm } from '../ui/Feedback.jsx';
import { MediaThumb, UploadDropzone, useMediaLibrary } from '../ui/MediaPicker.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { Field, useRunner, validate } from './contentApi.jsx';
import { formatDateTime } from '../lib/format.js';

const mediaSchema = z.object({
  title: z.string().trim().max(120, 'Máximo 120 caracteres.'),
  alt_text: z.string().trim().max(300, 'Máximo 300 caracteres.'),
  is_concept: z.boolean(),
});

export default function MediaAdmin() {
  const [search, setSearch] = useState('');
  const library = useMediaLibrary();
  const usageQ = useQuery({
    queryKey: ['admin', 'media-usage'],
    queryFn: async () => new Map((await unwrap(supabase.from('media_usage').select('media_id, usage_count'))).map(r => [r.media_id, Number(r.usage_count)])),
  });

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (library.data || []).filter(m => !term || `${m.title} ${m.alt_text}`.toLowerCase().includes(term));
  }, [library.data, search]);

  return (
    <AdminPage title="Fotografías" description="Biblioteca de imágenes del hotel. Cada imagen necesita un texto alternativo que la describa para personas con lector de pantalla.">
      <section className="ca-section" aria-labelledby="upload-title">
        <h2 id="upload-title">Subir fotografías</h2>
        <UploadDropzone />
      </section>

      <section className="ca-section" aria-labelledby="library-title">
        <h2 id="library-title">Biblioteca</h2>
        <div className="admin-toolbar">
          <label className="search-field">Buscar
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Título o texto alternativo" />
          </label>
        </div>
        {library.isLoading ? <Loading /> : library.error ? <ErrorState error={library.error} onRetry={library.refetch} /> : items.length === 0 ? (
          <EmptyState title={search ? 'Ninguna imagen coincide con la búsqueda.' : 'Aún no hay imágenes.'} />
        ) : (
          <ul className="ca-media-cards" aria-label="Imágenes">
            {items.map(media => <MediaCard key={media.id} media={media} usage={usageQ.data?.get(media.id)} />)}
          </ul>
        )}
      </section>

      <OrphanFiles />
    </AdminPage>
  );
}

function MediaCard({ media, usage }) {
  const confirm = useConfirm();
  const [run, busy] = useRunner();
  const [form, setForm] = useState({ title: media.title, alt_text: media.alt_text, is_concept: media.is_concept });
  const [errors, setErrors] = useState({});
  const [deleteError, setDeleteError] = useState('');
  const dirty = form.title !== media.title || form.alt_text !== media.alt_text || form.is_concept !== media.is_concept;
  const missingAlt = !form.alt_text.trim();

  async function save() {
    const { data, errors: found } = validate(mediaSchema, form);
    setErrors(found || {});
    if (!data) return;
    const result = await run(() => unwrapRows(supabase.from('media_assets').update(data).eq('id', media.id).select('id')), 'Datos de la imagen guardados.');
    if (result.ok) setForm(data);
  }

  async function remove() {
    const ok = await confirm({
      title: 'Eliminar imagen', message: `"${media.title || 'Sin título'}" se eliminará de la biblioteca y del almacenamiento. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    setDeleteError('');
    const result = await run(() => deleteMedia(media.id), 'Imagen eliminada.');
    if (!result.ok) setDeleteError(result.error.message);
  }

  return (
    <li className="ca-media-card">
      <MediaThumb media={{ ...media, alt_text: form.alt_text }} />
      <div className="ca-row">
        {media.source === 'bundled' && <StatusPill tone="gray">Incluida en el sitio</StatusPill>}
        {form.is_concept && <StatusPill tone="gold">Ilustrativa</StatusPill>}
        <StatusPill tone={usage ? 'green' : 'gray'}>{usage == null ? 'Uso…' : usage === 0 ? 'Sin uso' : `En uso: ${usage}`}</StatusPill>
      </div>
      <Field label="Título" error={errors.title}>
        <input value={form.title} maxLength={120} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Texto alternativo" error={errors.alt_text} hint={missingAlt ? 'Falta el texto alternativo.' : `${form.alt_text.length}/300`}>
        <textarea rows={3} maxLength={300} value={form.alt_text} onChange={e => setForm(f => ({ ...f, alt_text: e.target.value }))} />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={form.is_concept} onChange={e => setForm(f => ({ ...f, is_concept: e.target.checked }))} />
        Imagen ilustrativa (no es foto real)
      </label>
      {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
      <div className="ca-row">
        <button type="button" className="button button-primary btn-sm" disabled={busy || !dirty} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={remove}>Eliminar</button>
      </div>
    </li>
  );
}

function OrphanFiles() {
  const confirm = useConfirm();
  const [run, busy] = useRunner();
  const orphansQ = useQuery({
    queryKey: ['admin', 'orphans'],
    queryFn: () => unwrap(supabase.rpc('orphan_storage_objects')),
  });
  const orphans = orphansQ.data || [];

  async function clean() {
    const names = orphans.map(o => o.name);
    const ok = await confirm({
      title: 'Eliminar archivos huérfanos',
      message: `Se borrarán ${names.length} archivo(s) del almacenamiento que no pertenecen a ninguna imagen de la biblioteca. Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar archivos', danger: true,
    });
    if (!ok) return;
    await run(async () => {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).remove(names);
      if (error) throw new Error('No se pudieron eliminar los archivos. Inténtalo de nuevo.');
      if ((data?.length ?? 0) < names.length) throw new Error(`Solo se eliminaron ${data?.length ?? 0} de ${names.length} archivos.`);
    }, `${names.length} archivo(s) huérfano(s) eliminado(s).`);
  }

  return (
    <section className="ca-section panel" aria-labelledby="orphans-title">
      <h2 id="orphans-title">Archivos huérfanos</h2>
      <p className="ca-meta">Archivos del almacenamiento sin registro en la biblioteca (por ejemplo, de una subida interrumpida). Solo se listan los de más de una hora.</p>
      {orphansQ.isLoading ? <Loading /> : orphansQ.error ? <ErrorState error={orphansQ.error} onRetry={orphansQ.refetch} /> : orphans.length === 0 ? (
        <p>No hay archivos huérfanos.</p>
      ) : (
        <>
          <ul className="ca-orphans">{orphans.map(o => <li key={o.name}>{o.name} · {formatDateTime(o.created_at)}</li>)}</ul>
          <button type="button" className="button button-danger" disabled={busy} onClick={clean}>{busy ? 'Eliminando…' : `Eliminar ${orphans.length} archivo(s) huérfano(s)`}</button>
        </>
      )}
    </section>
  );
}
