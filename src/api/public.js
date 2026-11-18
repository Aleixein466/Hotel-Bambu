// Datos públicos: solo vistas public_* (contenido publicado). Fuente única: PostgreSQL.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from '../lib/supabase.js';

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

export function usePublicRooms() {
  return useQuery({
    queryKey: ['public', 'rooms'],
    queryFn: async () => (await unwrap(supabase.from('public_rooms').select('*'))).sort((a, b) => byOrder(a, b) || a.number.localeCompare(b.number)),
  });
}

export function usePublicRoom(number) {
  return useQuery({
    queryKey: ['public', 'rooms', number],
    queryFn: () => unwrap(supabase.from('public_rooms').select('*').eq('number', number).maybeSingle()),
    enabled: Boolean(number),
  });
}

export function usePublicGallery() {
  return useQuery({
    queryKey: ['public', 'gallery'],
    queryFn: async () => (await unwrap(supabase.from('public_gallery').select('*'))).sort(byOrder),
  });
}

export function usePublicPosts(kind) {
  return useQuery({
    queryKey: ['public', 'posts', 'list', kind || 'all'],
    queryFn: async () => {
      let q = supabase.from('public_posts').select('id,slug,kind,title,excerpt,starts_at,ends_at,published_at,sort_order,cover');
      if (kind) q = q.eq('kind', kind);
      const rows = await unwrap(q);
      return rows.sort((a, b) => byOrder(a, b) || String(b.published_at).localeCompare(String(a.published_at)));
    },
  });
}

export function usePublicPost(slug) {
  return useQuery({
    queryKey: ['public', 'posts', 'detail', slug],
    queryFn: () => unwrap(supabase.from('public_posts').select('*').eq('slug', slug).maybeSingle()),
    enabled: Boolean(slug),
  });
}

/** Todos los bloques de contenido publicados como objeto { 'home.hero': {...}, ... }. */
export function useSiteContent() {
  return useQuery({
    queryKey: ['public', 'content'],
    queryFn: async () => Object.fromEntries((await unwrap(supabase.from('public_site_content').select('key,value'))).map(r => [r.key, r.value])),
  });
}

export function usePublicSettings() {
  return useQuery({
    queryKey: ['public', 'settings'],
    queryFn: () => unwrap(supabase.from('public_settings').select('*').maybeSingle()),
  });
}

/** Rangos ocupados [start_date, end_date) sin datos personales. */
export function useBusyRanges(roomId, from, to) {
  return useQuery({
    queryKey: ['public', 'availability', roomId, from, to],
    queryFn: () => unwrap(supabase.rpc('room_busy_ranges', { p_room_id: roomId, p_from: from, p_to: to })),
    enabled: Boolean(roomId && from && to),
  });
}

/** Registra una solicitud (no es una reserva). Devuelve { id, code }. */
export function useSubmitBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, checkIn, checkOut, guests, guestName, phone, consent, website = '' }) => {
      const rows = await unwrap(supabase.rpc('submit_booking_request', {
        p_room_id: roomId, p_check_in: checkIn, p_check_out: checkOut, p_guests: Number(guests),
        p_guest_name: guestName, p_phone: phone, p_consent: consent, p_website: website,
      }));
      return rows[0];
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['public', 'availability'] }),
  });
}

/**
 * Sincronización en vivo: cada cambio publicado incrementa public_revisions (trigger en BD);
 * los visitantes con la página abierta invalidan solo el ámbito afectado, sin recargar.
 */
const SCOPE_KEYS = {
  rooms: [['public', 'rooms']],
  media: [['public']],
  gallery: [['public', 'gallery']],
  posts: [['public', 'posts']],
  content: [['public', 'content']],
  settings: [['public', 'settings']],
  availability: [['public', 'availability']],
};

export function useLiveRevisions() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase
      .channel('public-revisions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'public_revisions' }, payload => {
        const keys = SCOPE_KEYS[payload.new?.scope] || [['public']];
        keys.forEach(queryKey => qc.invalidateQueries({ queryKey }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}
