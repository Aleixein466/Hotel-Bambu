import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { mediaUrl } from '../lib/media.js';
import { formatDateTime, POST_KIND, POST_STATUS, slugify } from '../lib/format.js';
import { EmptyState, ErrorState, Loading, useConfirm, useToast } from '../ui/Feedback.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { CoverField, DraftBadge, Field, fromLocalInput, toLocalInput, useMediaMap, useRunner, validate } from './contentApi.jsx';

const postSchema = z.object({
  title: z.string().trim().min(1, 'Escribe el título.').max(160, 'Máximo 160 caracteres.'),
  slug: z.string().trim().min(1, 'Indica el enlace.').max(100, 'Máximo 100 caracteres.')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Usa solo minúsculas, números y guiones (sin espacios ni acentos).'),
  kind: z.enum(['news', 'promotion', 'offer'], { message: 'Elige un tipo.' }),
  excerpt: z.string().max(400, 'Máximo 400 caracteres.'),
  body: z.string().max(20000, 'Máximo 20000 caracteres.'),
  cover_media_id: z.string().uuid().nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
}).refine(d => !d.starts_at || !d.ends_at || new Date(d.ends_at) > new Date(d.starts_at), {
  path: ['ends_at'], message: 'La fecha de fin debe ser posterior a la de inicio.',
});

function initialForm(post) {
  const d = post?.draft || {};
  const pick = (key, live) => (key in d ? d[key] : live);
  return {
    title: pick('title', post?.title ?? ''),
    slug: pick('slug', post?.slug ?? ''),
    kind: pick('kind', post?.kind ?? 'news'),
    excerpt: pick('excerpt', post?.excerpt ?? ''),
    body: pick('body', post?.body ?? ''),
    cover_media_id: pick('cover_media_id', post?.cover_media_id ?? null),
    starts_at: toLocalInput(pick('starts_at', post?.starts_at ?? null)),
    ends_at: toLocalInput(pick('ends_at', post?.ends_at ?? null)),
  };
}

export default function PostEditor() {
  const { id } = useParams();
  const isNew = id === 'nueva';
  const [resetToken, setResetToken] = useState(0);
  const { map, isLoading: mediaLoading } = useMediaMap();
  const postQ = useQuery({
    queryKey: ['admin', 'post', id], enabled: !isNew,
    queryFn: () => unwrap(supabase.from('posts').select('*').eq('id', id).maybeSingle()),
  });

  let body;
  if (postQ.error) body = <ErrorState error={postQ.error} onRetry={postQ.refetch} />;
  else if (!isNew && (postQ.isLoading || mediaLoading)) body = <Loading />;
  else if (!isNew && !postQ.data) body = <EmptyState title="No se encontró la publicación." />;
  else body = <PostForm key={`${isNew ? 'new' : id}:${resetToken}`} post={isNew ? null : postQ.data} map={map} onDiscarded={() => setResetToken(n => n + 1)} />;

  return (
    <AdminPage title={isNew ? 'Nueva publicación' : 'Editar publicación'}
      description="Los cambios se guardan como borrador hasta que pulses Publicar cambios."
      actions={<Link className="button button-ghost" to="/admin/publicaciones">← Publicaciones</Link>}>
      {body}
    </AdminPage>
  );
}

function PostForm({ post, map, onDiscarded }) {
  const isNew = !post;
  const trashed = Boolean(post?.deleted_at);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [run, busy] = useRunner();
  const [form, setForm] = useState(() => initialForm(post));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState({});

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const onTitle = e => setForm(f => ({ ...f, title: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }));

  function check() {
    const result = validate(postSchema, { ...form, starts_at: fromLocalInput(form.starts_at), ends_at: fromLocalInput(form.ends_at) });
    setErrors(result.errors || {});
    if (!result.data) toast.error('Revisa los campos marcados en el formulario.');
    return result.data;
  }
  async function assertSlugFree(slug) {
    let query = supabase.from('posts').select('id').eq('slug', slug).limit(1);
    if (post) query = query.neq('id', post.id);
    if ((await unwrap(query)).length) {
      setErrors(e => ({ ...e, slug: 'Ese enlace ya está en uso. Elige otro.' }));
      throw new Error('Ese enlace ya está en uso por otra publicación. Elige otro.');
    }
  }
  const writeDraft = async data => {
    await assertSlugFree(data.slug);
    await unwrapRows(supabase.from('posts').update({ draft: data, draft_updated_at: new Date().toISOString() }).eq('id', post.id).select('id'));
  };
  const slugConflict = error => { if (error?.code === '23505') setErrors(e => ({ ...e, slug: 'Ese enlace ya está en uso. Elige otro.' })); };

  async function create(publishNow) {
    const data = check();
    if (!data) return;
    const result = await run(async () => {
      await assertSlugFree(data.slug);
      const created = await unwrap(supabase.from('posts').insert({
        title: data.title, slug: data.slug, kind: data.kind, status: 'draft', draft: data, draft_updated_at: new Date().toISOString(),
      }).select('id').single());
      if (publishNow) await unwrap(supabase.rpc('publish_post', { p_post_id: created.id }));
      return created.id;
    }, publishNow ? 'Publicación creada y publicada.' : 'Publicación creada como borrador.');
    if (result.ok) navigate(`/admin/publicaciones/${result.data}`, { replace: true });
    else slugConflict(result.error);
  }
  async function saveDraft() {
    const data = check();
    if (!data) return;
    const result = await run(() => writeDraft(data), 'Borrador guardado. Aún no es visible en el sitio.');
    if (!result.ok) slugConflict(result.error);
  }
  async function publish() {
    const data = check();
    if (!data) return;
    const result = await run(async () => {
      await writeDraft(data);
      await unwrap(supabase.rpc('publish_post', { p_post_id: post.id }));
    }, 'Publicación publicada. El sitio ya muestra los cambios.');
    if (!result.ok) slugConflict(result.error);
  }
  async function unpublish() {
    await run(() => unwrapRows(supabase.from('posts').update({ status: 'unpublished' }).eq('id', post.id).select('id')), 'Publicación despublicada.');
  }
  async function discard() {
    const ok = await confirm({ title: 'Descartar borrador', message: 'Se perderán los cambios sin publicar y el formulario volverá a la versión publicada.', confirmLabel: 'Descartar', danger: true });
    if (!ok) return;
    const result = await run(() => unwrapRows(supabase.from('posts').update({ draft: null, draft_updated_at: null }).eq('id', post.id).select('id')), 'Borrador descartado.');
    if (result.ok) onDiscarded();
  }

  const paragraphs = form.body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const cover = map.get(form.cover_media_id);
  const showDates = form.kind !== 'news';

  return (
    <div className="ca-split">
      <form className="admin-form" noValidate onSubmit={e => e.preventDefault()} aria-busy={busy}>
        {post && (
          <div className="ca-row">
            <StatusPill tone={post.status === 'published' ? 'green' : post.status === 'draft' ? 'gold' : 'gray'}>{POST_STATUS[post.status]}</StatusPill>
            <DraftBadge draft={post.draft} />
            {post.draft_updated_at && <small className="ca-meta">Borrador guardado el {formatDateTime(post.draft_updated_at)}</small>}
          </div>
        )}
        {trashed && <p className="ca-note" role="status">Esta publicación está en la papelera. Restáurala desde la lista para poder editarla.</p>}

        <fieldset disabled={trashed}>
          <legend>Contenido</legend>
          <Field label="Título" error={errors.title}>
            <input name="title" value={form.title} maxLength={160} onChange={onTitle} required aria-invalid={Boolean(errors.title)} />
          </Field>
          <div className="form-grid">
            <Field label="Enlace (slug)" error={errors.slug} hint={`Dirección: /novedades/${form.slug || '…'}`}>
              <input name="slug" value={form.slug} maxLength={100} required aria-invalid={Boolean(errors.slug)}
                onChange={e => { setSlugTouched(true); set('slug', e.target.value); }} />
            </Field>
            <Field label="Tipo" error={errors.kind}>
              <select name="kind" value={form.kind} onChange={e => set('kind', e.target.value)}>
                {Object.entries(POST_KIND).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Resumen" error={errors.excerpt} hint={`${form.excerpt.length}/400 caracteres`}>
            <textarea name="excerpt" rows={3} maxLength={400} value={form.excerpt} onChange={e => set('excerpt', e.target.value)} aria-invalid={Boolean(errors.excerpt)} />
          </Field>
          <Field label="Texto (separa los párrafos con una línea en blanco; sin HTML)" error={errors.body} hint={`${form.body.length}/20000 caracteres`}>
            <textarea name="body" rows={12} maxLength={20000} value={form.body} onChange={e => set('body', e.target.value)} aria-invalid={Boolean(errors.body)} />
          </Field>
          <CoverField mediaId={form.cover_media_id} map={map} onChange={id => set('cover_media_id', id)} disabled={busy} />
        </fieldset>

        <fieldset disabled={trashed}>
          <legend>Vigencia {showDates ? '' : '(opcional)'}</legend>
          <p className="ca-meta">Para promociones y ofertas: la publicación deja de mostrarse al llegar la fecha de fin.</p>
          <div className="form-grid">
            <Field label="Inicio" error={errors.starts_at}>
              <input type="datetime-local" name="starts_at" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} />
            </Field>
            <Field label="Fin" error={errors.ends_at}>
              <input type="datetime-local" name="ends_at" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} aria-invalid={Boolean(errors.ends_at)} />
            </Field>
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="button" className="button button-ghost" disabled={busy || trashed} onClick={isNew ? () => create(false) : saveDraft}>{busy ? 'Guardando…' : 'Guardar borrador'}</button>
          <button type="button" className="button button-primary" disabled={busy || trashed} onClick={isNew ? () => create(true) : publish}>{busy ? 'Guardando…' : 'Publicar cambios'}</button>
          {post?.draft && !trashed && <button type="button" className="button button-ghost" disabled={busy} onClick={discard}>Descartar borrador</button>}
          {post?.status === 'published' && !trashed && <button type="button" className="button button-ghost" disabled={busy} onClick={unpublish}>Despublicar</button>}
        </div>
      </form>

      <aside className="ca-preview" aria-label="Vista previa">
        <h2>Vista previa</h2>
        <article className="panel ca-preview-post">
          {cover && <img src={mediaUrl(cover)} alt={cover.alt_text || ''} />}
          <small className="ca-meta">{POST_KIND[form.kind]}</small>
          <h3>{form.title || 'Título de la publicación'}</h3>
          {form.excerpt && <p><em>{form.excerpt}</em></p>}
          {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="ca-meta">El texto aparecerá aquí.</p>}
        </article>
      </aside>
    </div>
  );
}
