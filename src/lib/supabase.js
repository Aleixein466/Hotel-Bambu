import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      // Flujo implícito: los enlaces de invitación y recuperación (generados por el servidor) funcionan aunque
      // se abran en otro dispositivo. Los tokens viajan en el fragmento (#), que no llega a ningún servidor.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null;

/** Ejecuta una consulta de Supabase y lanza un Error legible si falla. */
export async function unwrap(promise) {
  const { data, error } = await promise;
  if (error) throw toAppError(error);
  return data;
}

/** Como unwrap, pero falla si update/delete no afectó ninguna fila (RLS filtra en silencio). */
export async function unwrapRows(promise) {
  const { data, error } = await promise;
  if (error) throw toAppError(error);
  if (!Array.isArray(data) || data.length === 0) {
    const result = new Error('No se guardó ningún cambio: es posible que tu sesión ya no tenga permisos o que el registro no exista. Recarga la página.');
    result.isAppError = true;
    result.code = 'NO_ROWS';
    throw result;
  }
  return data;
}

const MESSAGES = {
  '23P01': 'Ya existe una reserva o bloqueo que se superpone en esas fechas para esta habitación.',
  '23505': 'Ya existe un registro con ese valor (por ejemplo, número de habitación o dirección web).',
  '23503': 'El registro está relacionado con otros datos y no puede eliminarse.',
  '23514': 'Algún dato no cumple las reglas permitidas. Revisa el formulario.',
  '42501': 'No tienes permisos para realizar esta acción.',
  PGRST301: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  PGRST303: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  PGRST116: 'No se encontró el registro solicitado.',
};

export function toAppError(error) {
  if (error instanceof Error && error.isAppError) return error;
  const code = error?.code || '';
  let message = MESSAGES[code];
  if (!message && code === 'P0001' && error?.message) message = error.message;
  if (!message && /fetch|network|Failed to fetch/i.test(error?.message || '')) {
    message = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }
  if (!message && /JWT|token/i.test(error?.message || '')) message = MESSAGES.PGRST301;
  const result = new Error(message || 'No se pudo completar la operación. Inténtalo de nuevo.');
  result.isAppError = true;
  result.code = code;
  result.hint = error?.hint;
  result.cause = error;
  return result;
}
