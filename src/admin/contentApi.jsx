import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, unwrapRows } from '../lib/supabase.js';
import { MediaPicker, MediaThumb, useMediaLibrary } from '../ui/MediaPicker.jsx';
import { useToast } from '../ui/Feedback.jsx';
import { StatusPill } from './AdminLayout.jsx';
import './content-admin.css';

/** Ejecuta una mutación real: toast solo tras resolver, invalida ['admin'] y nunca pierde el formulario. */
export function useRunner() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMessage) => {
    setBusy(true);
    try {
      const data = await fn();
      await qc.invalidateQueries({ queryKey: ['admin'] });
      if (okMessage) toast.success(okMessage);
      return { ok: true, data };
    } catch (error) {
      toast.error(error.message);
      return { ok: false, error };
    } finally {
      setBusy(false);
    }
  }, [qc, toast]);
  return [run, busy];
}

/** Biblioteca como mapa id → fila. */
export function useMediaMap() {
  const query = useMediaLibrary();
  const map = useMemo(() => new Map((query.data || []).map(m => [m.id, m])), [query.data]);
  return { map, ...query };
}

export function moveItem(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/** Mueve una fila y reasigna sort_order (0..n-1) solo donde cambió. */
export async function reorderRows(table, ordered, index, direction) {
  const next = moveItem(ordered, index, direction);
  const changes = next.map((row, i) => ({ row, i })).filter(({ row, i }) => row.sort_order !== i);
  await Promise.all(changes.map(({ row, i }) => unwrapRows(supabase.from(table).update({ sort_order: i }).eq('id', row.id).select('id'))));
}

const pad = n => String(n).padStart(2, '0');
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Valida con zod y devuelve { data } o { errors: { 'ruta.punteada': mensaje } }. */
export function validate(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data, errors: null };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { data: null, errors };
}

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`ca-field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

export function DraftBadge({ draft }) {
  return draft ? <StatusPill tone="gold">Borrador sin publicar</StatusPill> : null;
}

export function MoveButtons({ index, count, label, onMove, disabled }) {
  return (
    <span className="ca-move" role="group" aria-label={`Orden de ${label}`}>
      <button type="button" className="icon-button ca-icon" aria-label={`Subir ${label}`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)}>↑</button>
      <button type="button" className="icon-button ca-icon" aria-label={`Bajar ${label}`} disabled={disabled || index === count - 1} onClick={() => onMove(index, 1)}>↓</button>
    </span>
  );
}

/** Imagen única: miniatura, elegir/cambiar y quitar. */
export function CoverField({ label = 'Imagen de portada', mediaId, map, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const media = mediaId ? map.get(mediaId) : null;
  return (
    <div className="ca-cover">
      <span className="ca-label">{label}</span>
      <div className="ca-cover-body">
        <div className="ca-cover-thumb">{media ? <MediaThumb media={media} /> : <span className="media-thumb empty" aria-hidden="true" />}</div>
        <div className="ca-cover-actions">
          <small>{media ? (media.title || 'Sin título') : mediaId ? 'La imagen ya no existe en la biblioteca.' : 'Sin imagen'}</small>
          <div className="ca-row">
            <button type="button" className="button button-ghost btn-sm" disabled={disabled} onClick={() => setOpen(true)}>{mediaId ? 'Cambiar imagen' : 'Elegir imagen'}</button>
            {mediaId && <button type="button" className="button button-ghost btn-sm" disabled={disabled} onClick={() => onChange(null)}>Quitar</button>}
          </div>
        </div>
      </div>
      <MediaPicker open={open} onClose={() => setOpen(false)} title={label} onSelect={rows => onChange(rows[0]?.id ?? null)} />
    </div>
  );
}
