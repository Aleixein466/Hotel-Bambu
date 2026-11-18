import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { EmptyState, ErrorState, Loading, useConfirm } from '../ui/Feedback.jsx';
import { MediaPicker, MediaThumb } from '../ui/MediaPicker.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { Field, MoveButtons, reorderRows, useMediaMap, useRunner, validate } from './contentApi.jsx';

const CATEGORIES = ['Habitaciones', 'Espacios comunes', 'Fachada'];
const itemSchema = z.object({
  caption: z.string().trim().max(160, 'Máximo 160 caracteres.'),
  category: z.string().trim().min(1, 'Indica la categoría.').max(40, 'Máximo 40 caracteres.'),
});

export default function GalleryAdmin() {
  const [run, busy] = useRunner();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { map, isLoading: mediaLoading } = useMediaMap();
  const { data: items, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'gallery'],
    queryFn: () => unwrap(supabase.from('gallery_items').select('*').order('sort_order').order('created_at')),
  });

  const addItems = rows => run(() => unwrap(supabase.from('gallery_items').insert(rows.map((m, i) => ({
    media_id: m.id, caption: (m.title || '').slice(0, 160), category: 'Espacios comunes', sort_order: items.length + i, published: true,
  })))), rows.length === 1 ? 'Imagen agregada a la galería.' : `${rows.length} imágenes agregadas a la galería.`);
  const move = (index, direction) => run(() => reorderRows('gallery_items', items, index, direction), 'Orden de la galería actualizado.');

  return (
    <AdminPage title="Galería" description="Imágenes que se muestran en la galería pública. Quitar una imagen de la galería no la borra de la biblioteca."
      actions={<button type="button" className="button button-primary" disabled={!items || busy} onClick={() => setPickerOpen(true)}>Agregar a la galería</button>}>
      <datalist id="gallery-categories">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
      {isLoading || mediaLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : items.length === 0 ? (
        <EmptyState title="La galería está vacía.">Usa "Agregar a la galería" para elegir imágenes de la biblioteca.</EmptyState>
      ) : (
        <ol className="ca-list" aria-label="Imágenes de la galería">
          {items.map((item, index) => (
            <GalleryRow key={item.id} item={item} media={map.get(item.media_id)} index={index} count={items.length} onMove={move} />
          ))}
        </ol>
      )}
      <MediaPicker open={pickerOpen} multiple title="Agregar imágenes a la galería" onClose={() => setPickerOpen(false)} onSelect={addItems} />
    </AdminPage>
  );
}

function GalleryRow({ item, media, index, count, onMove }) {
  const confirm = useConfirm();
  const [run, busy] = useRunner();
  const [form, setForm] = useState({ caption: item.caption, category: item.category });
  const [errors, setErrors] = useState({});
  const dirty = form.caption !== item.caption || form.category !== item.category;

  async function save() {
    const { data, errors: found } = validate(itemSchema, form);
    setErrors(found || {});
    if (!data) return;
    const result = await run(() => unwrapRows(supabase.from('gallery_items').update(data).eq('id', item.id).select('id')), 'Datos de la imagen guardados.');
    if (result.ok) setForm(data);
  }
  const togglePublished = () => run(() => unwrapRows(supabase.from('gallery_items').update({ published: !item.published }).eq('id', item.id).select('id')),
    item.published ? 'Imagen oculta de la galería.' : 'Imagen visible en la galería.');
  async function remove() {
    const ok = await confirm({ title: 'Quitar de la galería', message: 'La imagen dejará de mostrarse en la galería pública. Seguirá disponible en la biblioteca.', confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    run(async () => {
      const gone = await unwrapRows(supabase.from('gallery_items').delete().eq('id', item.id).select('id'));
      if (!gone.length) throw new Error('No se pudo quitar la imagen de la galería.');
    }, 'Imagen quitada de la galería.');
  }

  return (
    <li className="ca-list-item">
      <div className="ca-cover-body">
        <div className="ca-cover-thumb"><MediaThumb media={media} /></div>
        <div className="ca-grow ca-row">
          <Field label="Descripción breve" error={errors.caption} className="ca-grow">
            <input value={form.caption} maxLength={160} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} />
          </Field>
          <Field label="Categoría" error={errors.category} className="ca-grow">
            <input list="gallery-categories" value={form.category} maxLength={40} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </Field>
        </div>
      </div>
      <div className="ca-row">
        <StatusPill tone={item.published ? 'green' : 'gray'}>{item.published ? 'Visible' : 'Oculta'}</StatusPill>
        <MoveButtons index={index} count={count} label={`imagen ${index + 1}`} disabled={busy} onMove={onMove} />
        <button type="button" className="button button-primary btn-sm" disabled={busy || !dirty} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={togglePublished}>{item.published ? 'Ocultar' : 'Publicar'}</button>
        <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={remove}>Quitar</button>
      </div>
    </li>
  );
}
