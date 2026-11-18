import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, unwrap } from '../lib/supabase.js';
import { usePublicSettings } from '../api/public.js';

const tsDateFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });

/** Fecha legible (zona del hotel) de una marca de tiempo ISO. */
export const formatTsDate = ts => (ts ? tsDateFormatter.format(new Date(ts)) : '');

/** Solo enlaces http(s); evita esquemas como javascript:. */
export const safeUrl = value => (/^https?:\/\//i.test(String(value || '').trim()) ? String(value).trim() : '');

/** Título del documento por página. */
export function usePageTitle(title) {
  const { data: settings } = usePublicSettings();
  const name = settings?.hotel_name || 'Hotel Bambú Plaza';
  useEffect(() => {
    document.title = title ? `${title} · ${name}` : `${name} · Mocoa`;
  }, [title, name]);
}

/** Recursos multimedia públicos por id. Devuelve un objeto { [id]: media }. */
export function usePublicMedia(ids) {
  const key = [...new Set((ids || []).filter(Boolean))].sort();
  const query = useQuery({
    queryKey: ['public', 'media', key],
    queryFn: () => unwrap(supabase.from('public_media').select('*').in('id', key)),
    enabled: key.length > 0,
  });
  return { ...query, byId: Object.fromEntries((query.data || []).map(m => [m.id, m])) };
}

/** Diálogo modal: Esc, trampa de foco, bloqueo de scroll y devolución del foco. */
export function useDialog(ref, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = e => {
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll('button, input, select, textarea, a[href]')]
        .filter(el => !el.disabled && el.tabIndex !== -1 && el.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!ref.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previous && previous.focus) previous.focus();
    };
  }, [ref]);
}
