import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from '../lib/supabase.js';

/** Habitaciones para selectores y etiquetas (no incluye datos editoriales). */
export function useOpsRooms() {
  return useQuery({
    queryKey: ['admin', 'ops', 'rooms'],
    queryFn: () => unwrap(supabase.from('rooms').select('id,number,name,capacity,operational_status').order('sort_order').order('number')),
  });
}

export const roomLabel = room => (room ? `${room.number} · ${room.name}` : '—');

export function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['admin'] });
}

export const REQUEST_TONE = { pending: 'gold', confirmed: '', rejected: 'red', cancelled: 'gray' };
export const RESERVATION_TONE = { confirmed: '', checked_in: 'blue', checked_out: 'gray', cancelled: 'gray' };

/** Resumen corto de las claves modificadas en un registro de auditoría. */
export function summarizeChanges(changes, max = 4) {
  if (!changes || typeof changes !== 'object') return '';
  const keys = Object.keys(changes);
  const shown = keys.slice(0, max).map(key => {
    const value = changes[key];
    let text = value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (text.length > 40) text = `${text.slice(0, 40)}…`;
    return `${key}: ${text}`;
  });
  return shown.join(' · ') + (keys.length > max ? ` · +${keys.length - max} más` : '');
}

export const ENTITY_LABEL = {
  rooms: 'Habitaciones', posts: 'Publicaciones', gallery_items: 'Galería', media_assets: 'Fotografías', hotel_settings: 'Configuración',
  profiles: 'Usuarios', booking_requests: 'Solicitudes', reservations: 'Reservas', room_blocks: 'Bloqueos', site_content: 'Contenido',
  amenities: 'Comodidades', room_images: 'Fotos de habitación', room_amenities: 'Comodidades de habitación',
};
export const ACTION_LABEL = { insert: 'Creó', update: 'Modificó', delete: 'Eliminó' };
