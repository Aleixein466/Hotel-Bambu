import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { formatDateTime } from '../lib/format.js';
import { EmptyState, ErrorState, Loading, useConfirm, useToast } from '../ui/Feedback.jsx';
import { MediaPicker, MediaThumb } from '../ui/MediaPicker.jsx';
import { AdminPage } from './AdminLayout.jsx';
import { CoverField, DraftBadge, Field, MoveButtons, moveItem, useMediaMap, useRunner, validate } from './contentApi.jsx';

/**
 * Definición de cada sección. Tipos de campo: text, textarea, checkbox, media (una imagen),
 * media-list (varias, con orden) y list (elementos repetibles con subcampos).
 */
const SECTIONS = [
  { key: 'home.hero', label: 'Portada', fields: [
    { name: 'eyebrow', label: 'Texto superior', type: 'text', max: 120 },
    { name: 'headline', label: 'Titular', type: 'text', max: 160, required: true },
    { name: 'intro', label: 'Introducción', type: 'textarea', max: 500 },
    { name: 'autoplay', label: 'Cambiar las imágenes automáticamente', type: 'checkbox' },
    { name: 'slides', label: 'Imágenes de la portada', type: 'media-list', min: 1, max: 5 },
  ] },
  { key: 'home.welcome', label: 'Bienvenida', fields: [
    { name: 'eyebrow', label: 'Texto superior', type: 'text', max: 120 },
    { name: 'title', label: 'Título', type: 'text', max: 160, required: true },
    { name: 'body', label: 'Texto (separa los párrafos con una línea en blanco)', type: 'textarea', max: 2000, rows: 8 },
    { name: 'media_id', label: 'Imagen', type: 'media' },
  ] },
  { key: 'home.services', label: 'Servicios', fields: [
    { name: 'eyebrow', label: 'Texto superior', type: 'text', max: 120 },
    { name: 'title', label: 'Título', type: 'text', max: 160, required: true },
    { name: 'intro', label: 'Introducción', type: 'textarea', max: 500 },
    { name: 'items', label: 'Servicios', type: 'list', itemLabel: 'servicio', max: 12, fields: [
      { name: 'name', label: 'Nombre', type: 'text', max: 80, required: true },
      { name: 'detail', label: 'Detalle', type: 'text', max: 200 },
    ] },
  ] },
  { key: 'about', label: 'Nosotros', fields: [
    { name: 'mission', label: 'Misión', type: 'textarea', max: 2000, rows: 6 },
    { name: 'vision', label: 'Visión', type: 'textarea', max: 2000, rows: 6 },
    { name: 'institutional', label: 'Información institucional', type: 'textarea', max: 4000, rows: 8 },
  ] },
  { key: 'faq', label: 'Preguntas frecuentes', fields: [
    { name: 'items', label: 'Preguntas', type: 'list', itemLabel: 'pregunta', max: 30, fields: [
      { name: 'q', label: 'Pregunta', type: 'text', max: 200, required: true },
      { name: 'a', label: 'Respuesta', type: 'textarea', max: 2000, required: true },
    ] },
  ] },
  { key: 'policies', label: 'Políticas', fields: [
    { name: 'items', label: 'Políticas', type: 'list', itemLabel: 'política', max: 20, fields: [
      { name: 'title', label: 'Título', type: 'text', max: 120, required: true },
      { name: 'body', label: 'Texto', type: 'textarea', max: 2000, required: true },
    ] },
  ] },
  { key: 'footer', label: 'Pie de página', fields: [
    { name: 'tagline', label: 'Frase del pie', type: 'textarea', max: 300, rows: 3 },
    { name: 'note', label: 'Nota', type: 'textarea', max: 300, rows: 3 },
  ] },
];

const textRule = f => {
  let rule = z.string();
  if (f.required) rule = rule.trim().min(1, 'Este campo es obligatorio.');
  return rule.max(f.max, `Máximo ${f.max} caracteres.`);
};
function fieldRule(f) {
  if (f.type === 'checkbox') return z.boolean();
  if (f.type === 'media') return z.string().uuid().nullable();
  if (f.type === 'media-list') return z.array(z.string().uuid()).min(f.min, `Elige al menos ${f.min} imagen.`).max(f.max, `Máximo ${f.max} imágenes.`);
  if (f.type === 'list') return z.array(buildSchema(f.fields)).max(f.max, `Máximo ${f.max} elementos.`);
  return textRule(f);
}
function buildSchema(fields) {
  return z.object(Object.fromEntries(fields.map(f => [f.name, fieldRule(f)])));
}
function emptyValue(f) {
  if (f.type === 'checkbox') return false;
  if (f.type === 'media') return null;
  if (f.type === 'media-list' || f.type === 'list') return [];
  return '';
}
/** Valor del formulario: lo guardado, completado con valores vacíos y sin claves desconocidas. */
function normalize(fields, source = {}) {
  return Object.fromEntries(fields.map(f => {
    const raw = source?.[f.name];
    if (f.type === 'list') return [f.name, (Array.isArray(raw) ? raw : []).map(item => normalize(f.fields, item))];
    if (f.type === 'media-list') return [f.name, Array.isArray(raw) ? raw.filter(x => typeof x === 'string') : []];
    if (f.type === 'checkbox') return [f.name, typeof raw === 'boolean' ? raw : false];
    if (f.type === 'media') return [f.name, typeof raw === 'string' ? raw : null];
    return [f.name, typeof raw === 'string' ? raw : ''];
  }));
}

export default function ContentAdmin() {
  const [active, setActive] = useState(SECTIONS[0].key);
  const { map } = useMediaMap();
  const { data: rows, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => unwrap(supabase.from('site_content').select('*')),
  });

  const onTabKey = (e, index) => {
    const offset = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!offset) return;
    e.preventDefault();
    const next = SECTIONS[(index + offset + SECTIONS.length) % SECTIONS.length].key;
    setActive(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <AdminPage title="Contenido del sitio" description="Textos editables del sitio público. Guarda un borrador para revisarlo y publícalo cuando esté listo.">
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : (
        <>
          <div className="ca-tabs" role="tablist" aria-label="Secciones del sitio">
            {SECTIONS.map((section, index) => {
              const row = rows.find(r => r.key === section.key);
              return (
                <button key={section.key} type="button" role="tab" id={`tab-${section.key}`} className="ca-tab"
                  aria-selected={active === section.key} aria-controls={`panel-${section.key}`} tabIndex={active === section.key ? 0 : -1}
                  onClick={() => setActive(section.key)} onKeyDown={e => onTabKey(e, index)}>
                  {section.label}{row?.draft ? ' •' : ''}
                </button>
              );
            })}
          </div>
          {SECTIONS.map(section => (
            <div key={section.key} role="tabpanel" id={`panel-${section.key}`} aria-labelledby={`tab-${section.key}`} hidden={active !== section.key}>
              <SectionEditor section={section} row={rows.find(r => r.key === section.key)} map={map} />
            </div>
          ))}
        </>
      )}
    </AdminPage>
  );
}

function SectionEditor({ section, row, map }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [run, busy] = useRunner();
  const [resetToken, setResetToken] = useState(0);
  const initial = () => normalize(section.fields, row?.draft ?? row?.value ?? {});
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState({});
  const schema = buildSchema(section.fields);

  const setField = (name, v) => setValue(current => ({ ...current, [name]: v }));

  function check() {
    const result = validate(schema, value);
    setErrors(result.errors || {});
    if (!result.data) toast.error('Revisa los campos marcados en esta sección.');
    return result.data;
  }
  const writeDraft = async data => {
    await unwrap(supabase.from('site_content').upsert({ key: section.key, draft: data, draft_updated_at: new Date().toISOString() }, { onConflict: 'key' }));
  };
  async function saveDraft() {
    const data = check();
    if (data) await run(() => writeDraft(data), 'Borrador guardado. Aún no es visible en el sitio.');
  }
  async function publish() {
    const data = check();
    if (!data) return;
    await run(async () => {
      await writeDraft(data);
      await unwrap(supabase.rpc('publish_content', { p_key: section.key }));
    }, 'Contenido publicado. El sitio ya muestra los cambios.');
  }
  async function discard() {
    const ok = await confirm({ title: 'Descartar borrador', message: 'Se perderán los cambios sin publicar y volverá la versión publicada.', confirmLabel: 'Descartar', danger: true });
    if (!ok) return;
    const result = await run(() => unwrapRows(supabase.from('site_content').update({ draft: null, draft_updated_at: null }).eq('key', section.key).select('key')), 'Borrador descartado.');
    if (result.ok) {
      setValue(normalize(section.fields, row?.value ?? {}));
      setErrors({});
      setResetToken(n => n + 1);
    }
  }

  return (
    <form className="admin-form" noValidate onSubmit={e => e.preventDefault()} aria-busy={busy} key={resetToken}>
      <fieldset>
        <legend>{section.label}</legend>
        <div className="ca-row">
          <DraftBadge draft={row?.draft} />
          {row?.draft_updated_at && <small className="ca-meta">Borrador guardado el {formatDateTime(row.draft_updated_at)}</small>}
          {row?.published_at && <small className="ca-meta">Última publicación: {formatDateTime(row.published_at)}</small>}
        </div>
        {section.fields.map(f => (
          <FieldEditor key={f.name} field={f} path={f.name} value={value[f.name]} errors={errors} map={map} disabled={busy} onChange={v => setField(f.name, v)} />
        ))}
      </fieldset>
      <div className="form-actions">
        <button type="button" className="button button-ghost" disabled={busy} onClick={saveDraft}>{busy ? 'Guardando…' : 'Guardar borrador'}</button>
        <button type="button" className="button button-primary" disabled={busy} onClick={publish}>{busy ? 'Guardando…' : 'Publicar cambios'}</button>
        {row?.draft && <button type="button" className="button button-ghost" disabled={busy} onClick={discard}>Descartar borrador</button>}
      </div>
    </form>
  );
}

function FieldEditor({ field, path, value, errors, map, disabled, onChange }) {
  const error = errors[path];
  if (field.type === 'text') {
    return (
      <Field label={field.label} error={error} hint={`${value.length}/${field.max}`}>
        <input value={value} maxLength={field.max} onChange={e => onChange(e.target.value)} aria-invalid={Boolean(error)} />
      </Field>
    );
  }
  if (field.type === 'textarea') {
    return (
      <Field label={field.label} error={error} hint={`${value.length}/${field.max}`}>
        <textarea rows={field.rows || 4} maxLength={field.max} value={value} onChange={e => onChange(e.target.value)} aria-invalid={Boolean(error)} />
      </Field>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label className="checkbox"><input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />{field.label}</label>
    );
  }
  if (field.type === 'media') {
    return <CoverField label={field.label} mediaId={value} map={map} onChange={onChange} disabled={disabled} />;
  }
  if (field.type === 'media-list') return <SlidesEditor field={field} value={value} error={error} map={map} disabled={disabled} onChange={onChange} />;
  return <ListEditor field={field} path={path} value={value} errors={errors} map={map} disabled={disabled} onChange={onChange} />;
}

function SlidesEditor({ field, value, error, map, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const add = rows => onChange([...value, ...rows.map(m => m.id).filter(id => !value.includes(id))].slice(0, field.max));
  return (
    <div className="ca-cover">
      <span className="ca-label">{field.label} ({value.length}/{field.max})</span>
      {value.length === 0 ? <p className="ca-meta">Aún no hay imágenes.</p> : (
        <ol className="ca-list">
          {value.map((id, index) => (
            <li className="ca-list-item" key={id}>
              <div className="ca-cover-body">
                <div className="ca-cover-thumb"><MediaThumb media={map.get(id)} /></div>
                <div className="ca-cover-actions">
                  <strong>{map.get(id)?.title || (map.has(id) ? 'Sin título' : 'Imagen no disponible')}</strong>
                  <div className="ca-row">
                    <MoveButtons index={index} count={value.length} label={`imagen ${index + 1}`} disabled={disabled} onMove={(i, d) => onChange(moveItem(value, i, d))} />
                    <button type="button" className="button button-ghost btn-sm" disabled={disabled} onClick={() => onChange(value.filter((_, i) => i !== index))}>Quitar</button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="ca-row">
        <button type="button" className="button button-ghost btn-sm" disabled={disabled || value.length >= field.max} onClick={() => setOpen(true)}>Agregar imágenes</button>
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
      <MediaPicker open={open} multiple title={field.label} onClose={() => setOpen(false)} onSelect={add} />
    </div>
  );
}

function ListEditor({ field, path, value, errors, map, disabled, onChange }) {
  const error = errors[path];
  const update = (index, name, v) => onChange(value.map((item, i) => (i === index ? { ...item, [name]: v } : item)));
  return (
    <div className="ca-cover">
      <span className="ca-label">{field.label} ({value.length}/{field.max})</span>
      {value.length === 0 ? <EmptyState title={`Aún no hay ${field.label.toLowerCase()}.`} /> : (
        <ol className="ca-list">
          {value.map((item, index) => (
            <li className="ca-list-item" key={index}>
              <div className="ca-list-item-head">
                <strong>{`${field.itemLabel[0].toUpperCase()}${field.itemLabel.slice(1)} ${index + 1}`}</strong>
                <span className="ca-row">
                  <MoveButtons index={index} count={value.length} label={`${field.itemLabel} ${index + 1}`} disabled={disabled} onMove={(i, d) => onChange(moveItem(value, i, d))} />
                  <button type="button" className="button button-ghost btn-sm" disabled={disabled} onClick={() => onChange(value.filter((_, i) => i !== index))}>Quitar</button>
                </span>
              </div>
              {field.fields.map(sub => (
                <FieldEditor key={sub.name} field={sub} path={`${path}.${index}.${sub.name}`} value={item[sub.name]} errors={errors} map={map} disabled={disabled}
                  onChange={v => update(index, sub.name, v)} />
              ))}
            </li>
          ))}
        </ol>
      )}
      <div className="ca-row">
        <button type="button" className="button button-ghost btn-sm" disabled={disabled || value.length >= field.max}
          onClick={() => onChange([...value, Object.fromEntries(field.fields.map(f => [f.name, emptyValue(f)]))])}>
          Agregar {field.itemLabel}
        </button>
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}
