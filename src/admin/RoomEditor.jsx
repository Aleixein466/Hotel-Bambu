import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { mediaUrl } from '../lib/media.js';
import { formatDateTime, formatPrice, PUBLISH_STATUS, ROOM_OPERATIONAL } from '../lib/format.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { EmptyState, ErrorState, Loading, useConfirm, useToast } from '../ui/Feedback.jsx';
import { MediaPicker, MediaThumb } from '../ui/MediaPicker.jsx';
import { AdminPage } from './AdminLayout.jsx';
import { CoverField, DraftBadge, Field, MoveButtons, reorderRows, useMediaMap, useRunner, validate } from './contentApi.jsx';

const roomSchema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre de la habitación.').max(80, 'Máximo 80 caracteres.'),
  room_type: z.string().trim().min(1, 'Indica el tipo de habitación.').max(40, 'Máximo 40 caracteres.'),
  description: z.string().max(2000, 'Máximo 2000 caracteres.'),
  capacity: z.string().trim().regex(/^\d+$/, 'Indica un número entero.').transform(Number)
    .pipe(z.number().min(1, 'La capacidad mínima es 1.').max(20, 'La capacidad máxima es 20.')),
  price_cop: z.string().trim()
    .refine(v => v === '' || (/^\d+$/.test(v) && Number(v) <= 100000000), 'Indica un valor entero en COP entre 0 y 100.000.000, o déjalo vacío.')
    .transform(v => (v === '' ? null : Number(v))),
  details_confirmed: z.boolean(),
  cover_media_id: z.string().uuid().nullable(),
  amenity_ids: z.array(z.string().uuid()),
});
const numberSchema = z.string().trim().regex(/^[A-Za-z0-9-]{1,10}$/, 'Usa letras, números o guiones (máximo 10 caracteres).');

const TYPES = ['Individual', 'Doble', 'Familiar', 'Suite'];

function initialForm(room, liveAmenityIds) {
  const d = room?.draft || {};
  const pick = (key, live) => (key in d ? d[key] : live);
  const price = pick('price_cop', room?.price_cop ?? null);
  return {
    number: room?.number ?? '',
    name: pick('name', room?.name ?? ''),
    room_type: pick('room_type', room?.room_type ?? 'Individual'),
    description: pick('description', room?.description ?? ''),
    capacity: String(pick('capacity', room?.capacity ?? 1)),
    price_cop: price == null ? '' : String(price),
    details_confirmed: pick('details_confirmed', room?.details_confirmed ?? false),
    cover_media_id: pick('cover_media_id', room?.cover_media_id ?? null),
    amenity_ids: pick('amenity_ids', liveAmenityIds),
  };
}

export default function RoomEditor() {
  const { id } = useParams();
  const isNew = id === 'nueva';
  const { isAdmin } = useAuth();
  const [resetToken, setResetToken] = useState(0);
  const { map, isLoading: mediaLoading } = useMediaMap();

  const roomQ = useQuery({
    queryKey: ['admin', 'room', id], enabled: !isNew,
    queryFn: () => unwrap(supabase.from('rooms').select('*').eq('id', id).maybeSingle()),
  });
  const amenitiesQ = useQuery({
    queryKey: ['admin', 'amenities'],
    queryFn: () => unwrap(supabase.from('amenities').select('*').order('sort_order').order('name')),
  });
  const liveQ = useQuery({
    queryKey: ['admin', 'room', id, 'amenity-ids'], enabled: !isNew,
    queryFn: async () => (await unwrap(supabase.from('room_amenities').select('amenity_id').eq('room_id', id))).map(r => r.amenity_id),
  });
  const imagesQ = useQuery({
    queryKey: ['admin', 'room', id, 'images'], enabled: !isNew,
    queryFn: () => unwrap(supabase.from('room_images').select('*').eq('room_id', id).order('sort_order').order('created_at')),
  });

  const title = isNew ? 'Nueva habitación' : roomQ.data ? `Habitación ${roomQ.data.number}` : 'Habitación';
  const queries = isNew ? [amenitiesQ] : [roomQ, amenitiesQ, liveQ, imagesQ];
  const failed = queries.find(q => q.error);
  const loading = queries.some(q => q.isLoading) || mediaLoading;

  let body;
  if (isNew && !isAdmin) {
    body = <EmptyState title="Solo un administrador puede crear habitaciones." />;
  } else if (failed) {
    body = <ErrorState error={failed.error} onRetry={() => queries.forEach(q => q.refetch())} />;
  } else if (loading) {
    body = <Loading />;
  } else if (!isNew && !roomQ.data) {
    body = <EmptyState title="No se encontró la habitación.">Puede que el enlace sea incorrecto.</EmptyState>;
  } else {
    body = (
      <RoomForm
        key={`${isNew ? 'new' : roomQ.data.id}:${resetToken}`}
        room={isNew ? null : roomQ.data}
        amenities={amenitiesQ.data}
        liveAmenityIds={isNew ? [] : liveQ.data}
        images={isNew ? [] : imagesQ.data}
        map={map}
        onDiscarded={() => setResetToken(n => n + 1)}
      />
    );
  }

  return (
    <AdminPage title={title} description="Los textos, el precio, los servicios y la imagen principal se guardan como borrador hasta que pulses Publicar cambios."
      actions={<Link className="button button-ghost" to="/admin/habitaciones">← Habitaciones</Link>}>
      {body}
    </AdminPage>
  );
}

function RoomForm({ room, amenities, liveAmenityIds, images, map, onDiscarded }) {
  const isNew = !room;
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [run, busy] = useRunner();
  const [form, setForm] = useState(() => initialForm(room, liveAmenityIds));
  const [errors, setErrors] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newAmenity, setNewAmenity] = useState('');

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const onField = key => e => set(key, e.target.value);

  function check(values = form) {
    const result = validate(roomSchema, values);
    const numberError = isNew ? validate(numberSchema, values.number).errors?.[''] : null;
    const all = { ...(result.errors || {}), ...(numberError ? { number: numberError } : {}) };
    setErrors(all);
    if (Object.keys(all).length) {
      toast.error('Revisa los campos marcados en el formulario.');
      return null;
    }
    return result.data;
  }

  const draftPayload = data => ({ ...data });
  const writeDraft = async data => {
    await unwrapRows(supabase.from('rooms').update({ draft: draftPayload(data), draft_updated_at: new Date().toISOString() }).eq('id', room.id).select('id'));
  };

  async function createRoom(publishNow) {
    const data = check();
    if (!data) return;
    const result = await run(async () => {
      const last = await unwrap(supabase.from('rooms').select('sort_order').order('sort_order', { ascending: false }).limit(1));
      const created = await unwrap(supabase.from('rooms').insert({
        number: form.number.trim(), name: data.name, room_type: data.room_type, description: data.description,
        capacity: data.capacity, price_cop: data.price_cop, details_confirmed: data.details_confirmed,
        cover_media_id: data.cover_media_id, publish_status: 'draft', sort_order: (last?.[0]?.sort_order ?? -1) + 1,
      }).select('id').single());
      if (data.amenity_ids.length) {
        await unwrap(supabase.from('room_amenities').insert(data.amenity_ids.map(amenity_id => ({ room_id: created.id, amenity_id }))));
      }
      if (publishNow) await unwrap(supabase.rpc('publish_room', { p_room_id: created.id }));
      return created.id;
    }, publishNow ? 'Habitación creada y publicada.' : 'Habitación creada como borrador. Ahora puedes agregar fotografías.');
    if (result.ok) navigate(`/admin/habitaciones/${result.data}`, { replace: true });
    else if (result.error.code === '23505') setErrors(e => ({ ...e, number: 'Ya existe una habitación con ese número.' }));
  }

  async function saveDraft() {
    const data = check();
    if (!data) return;
    await run(() => writeDraft(data), 'Borrador guardado. Aún no es visible en el sitio.');
  }

  async function publish() {
    const data = check();
    if (!data) return;
    await run(async () => {
      await writeDraft(data);
      await unwrap(supabase.rpc('publish_room', { p_room_id: room.id }));
    }, 'Cambios publicados. El sitio ya muestra la información actualizada.');
  }

  async function discard() {
    const ok = await confirm({
      title: 'Descartar borrador', message: 'Se perderán los cambios sin publicar y el formulario volverá a la versión publicada.',
      confirmLabel: 'Descartar', danger: true,
    });
    if (!ok) return;
    const result = await run(() => unwrapRows(supabase.from('rooms').update({ draft: null, draft_updated_at: null }).eq('id', room.id).select('id')), 'Borrador descartado.');
    if (result.ok) onDiscarded();
  }

  async function makeCover(mediaId) {
    const next = { ...form, cover_media_id: mediaId };
    const data = check(next);
    if (!data) return;
    setForm(next);
    await run(() => writeDraft(data), 'Imagen principal guardada en el borrador. Publica los cambios para verla en el sitio.');
  }

  async function addAmenity() {
    const name = newAmenity.trim();
    if (!name) return;
    const result = await run(async () => unwrap(supabase.from('amenities').insert({ name, sort_order: (amenities.at(-1)?.sort_order ?? 0) + 1 }).select().single()), `Servicio "${name}" agregado.`);
    if (result.ok) {
      setNewAmenity('');
      set('amenity_ids', [...form.amenity_ids, result.data.id]);
    }
  }

  const toggleAmenity = amenityId => set('amenity_ids',
    form.amenity_ids.includes(amenityId) ? form.amenity_ids.filter(x => x !== amenityId) : [...form.amenity_ids, amenityId]);

  const addPhotos = rows => {
    const present = new Set(images.map(i => i.media_id));
    const fresh = rows.filter(m => !present.has(m.id));
    if (!fresh.length) { toast.info('Esas fotografías ya están en la habitación.'); return; }
    run(() => unwrap(supabase.from('room_images').insert(fresh.map((m, i) => ({ room_id: room.id, media_id: m.id, sort_order: images.length + i })))),
      fresh.length === 1 ? 'Fotografía agregada.' : `${fresh.length} fotografías agregadas.`);
  };
  const movePhoto = (index, direction) => run(() => reorderRows('room_images', images, index, direction), 'Orden de fotografías actualizado.');
  async function removePhoto(image) {
    const ok = await confirm({ title: 'Quitar fotografía', message: 'Se quitará de esta habitación. La imagen seguirá en la biblioteca.', confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    run(async () => {
      const gone = await unwrapRows(supabase.from('room_images').delete().eq('id', image.id).select('id'));
      if (!gone.length) throw new Error('No se pudo quitar la fotografía.');
    }, 'Fotografía quitada.');
  }

  async function setStatus(patch, label) {
    if (patch.operational_status === 'inactive') {
      const ok = await confirm({ title: 'Desactivar habitación', message: 'Dejará de mostrarse en el sitio y no podrá recibir reservas.', confirmLabel: 'Desactivar', danger: true });
      if (!ok) return;
    }
    run(() => unwrapRows(supabase.from('rooms').update(patch).eq('id', room.id).select('id')), label);
  }

  const submitting = busy;
  const selectedAmenities = amenities.filter(a => form.amenity_ids.includes(a.id));
  const previewCover = map.get(form.cover_media_id) || map.get(images[0]?.media_id);
  const previewPrice = /^\d+$/.test(form.price_cop.trim()) ? Number(form.price_cop) : null;

  return (
    <div className={showPreview ? 'ca-split' : ''}>
      <form className="admin-form" noValidate onSubmit={e => e.preventDefault()} aria-busy={submitting}>
        {room && (
          <div className="ca-row">
            <DraftBadge draft={room.draft} />
            {room.draft_updated_at && <small className="ca-meta">Borrador guardado el {formatDateTime(room.draft_updated_at)}</small>}
            {room.published_at && <small className="ca-meta">Última publicación: {formatDateTime(room.published_at)}</small>}
          </div>
        )}

        <fieldset>
          <legend>Datos de la habitación</legend>
          <div className="form-grid">
            {isNew && (
              <Field label="Número (no se podrá cambiar)" error={errors.number} hint="Ejemplo: 01, 12 o A-3">
                <input name="number" value={form.number} onChange={onField('number')} maxLength={10} required aria-invalid={Boolean(errors.number)} />
              </Field>
            )}
            <Field label="Nombre" error={errors.name}>
              <input name="name" value={form.name} onChange={onField('name')} maxLength={80} required aria-invalid={Boolean(errors.name)} />
            </Field>
            <Field label="Tipo de habitación" error={errors.room_type}>
              <input name="room_type" list="room-types" value={form.room_type} onChange={onField('room_type')} maxLength={40} required aria-invalid={Boolean(errors.room_type)} />
              <datalist id="room-types">{TYPES.map(t => <option key={t} value={t} />)}</datalist>
            </Field>
            <Field label="Capacidad (huéspedes)" error={errors.capacity}>
              <input name="capacity" type="number" inputMode="numeric" min={1} max={20} value={form.capacity} onChange={onField('capacity')} required aria-invalid={Boolean(errors.capacity)} />
            </Field>
            <Field label="Precio por noche (COP)" error={errors.price_cop} hint="Déjalo vacío si la tarifa está por confirmar.">
              <input name="price_cop" type="number" inputMode="numeric" min={0} step={1} value={form.price_cop} onChange={onField('price_cop')} aria-invalid={Boolean(errors.price_cop)} />
            </Field>
          </div>
          <Field label="Descripción" error={errors.description} hint={`${form.description.length}/2000 caracteres`}>
            <textarea name="description" rows={5} maxLength={2000} value={form.description} onChange={onField('description')} aria-invalid={Boolean(errors.description)} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" name="details_confirmed" checked={form.details_confirmed} onChange={e => set('details_confirmed', e.target.checked)} />
            Datos verificados por el hotel
          </label>
          <CoverField label="Imagen principal" mediaId={form.cover_media_id} map={map} onChange={id => set('cover_media_id', id)} disabled={submitting} />
        </fieldset>

        <fieldset>
          <legend>Servicios</legend>
          {amenities.length === 0 ? <p className="ca-meta">Aún no hay servicios registrados.</p> : (
            <div className="ca-checks">
              {amenities.map(a => (
                <label className="checkbox" key={a.id}>
                  <input type="checkbox" checked={form.amenity_ids.includes(a.id)} onChange={() => toggleAmenity(a.id)} />
                  {a.name}{a.active ? '' : ' (inactivo)'}
                </label>
              ))}
            </div>
          )}
          <div className="ca-row">
            <Field label="Agregar servicio" className="ca-grow">
              <input value={newAmenity} maxLength={60} placeholder="Ej.: Agua caliente"
                onChange={e => setNewAmenity(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAmenity(); } }} />
            </Field>
            <button type="button" className="button button-ghost" disabled={busy || !newAmenity.trim()} onClick={addAmenity}>Agregar servicio</button>
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="button" className="button button-ghost" disabled={submitting} onClick={isNew ? () => createRoom(false) : saveDraft}>
            {submitting ? 'Guardando…' : 'Guardar borrador'}
          </button>
          <button type="button" className="button button-primary" disabled={submitting} onClick={isNew ? () => createRoom(true) : publish}>
            {submitting ? 'Guardando…' : 'Publicar cambios'}
          </button>
          {room?.draft && <button type="button" className="button button-ghost" disabled={submitting} onClick={discard}>Descartar borrador</button>}
          <button type="button" className="button button-light" aria-expanded={showPreview} onClick={() => setShowPreview(v => !v)}>
            {showPreview ? 'Ocultar vista previa' : 'Vista previa'}
          </button>
        </div>

        {room && (
          <>
            <fieldset>
              <legend>Estado</legend>
              <p className="ca-meta">Estos cambios se aplican de inmediato.</p>
              <div className="form-grid">
                <label className="ca-field">Estado operativo
                  <select value={room.operational_status} disabled={busy || (room.operational_status === 'inactive' && !isAdmin)}
                    onChange={e => setStatus({ operational_status: e.target.value }, `Estado: ${ROOM_OPERATIONAL[e.target.value]}.`)}>
                    {Object.entries(ROOM_OPERATIONAL).map(([value, label]) => (
                      <option key={value} value={value} disabled={value === 'inactive' && !isAdmin}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="ca-field">Publicación
                  <select value={room.publish_status} disabled={busy}
                    onChange={e => setStatus({ publish_status: e.target.value }, `Publicación: ${PUBLISH_STATUS[e.target.value]}.`)}>
                    {Object.entries(PUBLISH_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Fotografías de la habitación</legend>
              <p className="ca-meta">Las fotografías se guardan de inmediato, sin pasar por el borrador. La primera aparece si no eliges una imagen principal.</p>
              <div className="ca-row">
                <button type="button" className="button button-ghost" disabled={busy} onClick={() => setPickerOpen(true)}>Agregar fotografías</button>
              </div>
              {images.length === 0 ? <EmptyState title="Esta habitación aún no tiene fotografías." /> : (
                <ol className="ca-list">
                  {images.map((image, index) => {
                    const media = map.get(image.media_id);
                    const isCover = form.cover_media_id === image.media_id;
                    return (
                      <li className="ca-list-item" key={image.id}>
                        <div className="ca-cover-body">
                          <div className="ca-cover-thumb"><MediaThumb media={media} /></div>
                          <div className="ca-cover-actions">
                            <strong>{media?.title || 'Sin título'}</strong>
                            {isCover && <small>Imagen principal (borrador)</small>}
                            <div className="ca-row">
                              <MoveButtons index={index} count={images.length} label={`fotografía ${index + 1}`} disabled={busy} onMove={movePhoto} />
                              <button type="button" className="button button-ghost btn-sm" disabled={busy || isCover} onClick={() => makeCover(image.media_id)}>Usar como principal</button>
                              <button type="button" className="button button-ghost btn-sm" disabled={busy} onClick={() => removePhoto(image)}>Quitar</button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <MediaPicker open={pickerOpen} multiple title="Agregar fotografías a la habitación" onClose={() => setPickerOpen(false)} onSelect={addPhotos} />
            </fieldset>
          </>
        )}
        {isNew && <p className="ca-note">Primero crea la habitación; después podrás agregar sus fotografías y cambiar su estado.</p>}
      </form>

      {showPreview && (
        <aside className="ca-preview" aria-label="Vista previa de la tarjeta pública">
          <h2>Así se verá en el sitio</h2>
          <article className="room-card">
            <div className="room-card-image">
              {previewCover ? <img src={mediaUrl(previewCover)} alt={previewCover.alt_text || ''} /> : <span className="media-thumb empty" />}
              <span className="status-pill">{form.details_confirmed ? 'Ficha verificada' : 'Datos por verificar'}</span>
            </div>
            <div className="room-card-copy">
              <small className="room-number">{room ? `Habitación ${room.number}` : `Habitación ${form.number || '—'}`}</small>
              <h3>{form.name || 'Nombre de la habitación'}</h3>
              <p>{form.description || 'Sin descripción.'}</p>
              <div className="room-card-meta">
                <span>Tipo: {form.room_type || '—'}</span>
                <span>Hasta {form.capacity || '—'} huéspedes</span>
                {selectedAmenities.map(a => <span key={a.id}>{a.name}</span>)}
              </div>
              <p className="room-price">{previewPrice != null ? `Desde ${formatPrice(previewPrice)} por noche` : 'Tarifa por confirmar'}</p>
            </div>
          </article>
        </aside>
      )}
    </div>
  );
}
