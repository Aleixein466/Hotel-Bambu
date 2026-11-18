const priceFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDateFormatter = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });

export const formatPrice = amount => (amount == null ? '' : priceFormatter.format(amount));

/** Fechas de calendario 'YYYY-MM-DD' (sin zona horaria). */
export const formatDate = iso => (iso ? dateFormatter.format(new Date(`${iso}T00:00:00Z`)) : '');
export const formatShortDate = iso => (iso ? shortDateFormatter.format(new Date(`${iso}T00:00:00Z`)) : '');
export const formatDateTime = ts => (ts ? dateTimeFormatter.format(new Date(ts)) : '');

/** Fecha de hoy en Mocoa (America/Bogota) como 'YYYY-MM-DD'. */
export function hotelToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000);
}

/** Valida un rango de estadía. Devuelve { nights } o { error }. */
export function validateStay(checkIn, checkOut, today = hotelToday()) {
  if (!checkIn || !checkOut) return { error: 'Selecciona las fechas de entrada y salida.' };
  if (checkIn < today) return { error: 'La fecha de entrada no puede estar en el pasado.' };
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) return { error: 'La salida debe ser posterior a la entrada.' };
  if (nights > 30) return { error: 'Para estadías de más de 30 noches, contáctanos directamente.' };
  return { nights };
}

/** ¿Se superpone [checkIn, checkOut) con algún rango ocupado [start, end)? */
export function overlapsBusy(checkIn, checkOut, ranges = []) {
  return ranges.some(r => checkIn < r.end_date && r.start_date < checkOut);
}

export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

export const ROOM_OPERATIONAL = { available: 'Disponible', maintenance: 'En mantenimiento', inactive: 'Inactiva' };
export const PUBLISH_STATUS = { draft: 'Borrador', published: 'Publicada', hidden: 'Oculta' };
export const POST_STATUS = { draft: 'Borrador', published: 'Publicada', unpublished: 'Despublicada' };
export const POST_KIND = { news: 'Noticia', promotion: 'Promoción', offer: 'Oferta especial' };
export const REQUEST_STATUS = { pending: 'Pendiente', confirmed: 'Confirmada', rejected: 'Rechazada', cancelled: 'Cancelada' };
export const RESERVATION_STATUS = { confirmed: 'Confirmada', checked_in: 'Hospedado', checked_out: 'Finalizada', cancelled: 'Cancelada' };
