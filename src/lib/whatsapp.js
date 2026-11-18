import { formatDate, nightsBetween } from './format.js';

/** Normaliza a solo dígitos con indicativo (10 a 15). Devuelve '' si no es válido. */
export function normalizeWhatsApp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^\d{10,15}$/.test(digits) ? digits : '';
}

/** Construye el mensaje prellenado. Solo incluye los datos proporcionados. */
export function buildWhatsAppMessage({ hotelName = 'Hotel Bambú Plaza', guestName, roomLabel, checkIn, checkOut, guests, code } = {}) {
  const lines = [`Hola, ${hotelName}.`];
  lines.push(roomLabel || checkIn ? 'Quisiera consultar una estadía.' : 'Quisiera hacer una consulta.');
  const details = [];
  if (guestName) details.push(`Nombre: ${guestName}`);
  if (roomLabel) details.push(`Habitación: ${roomLabel}`);
  if (checkIn) details.push(`Entrada: ${formatDate(checkIn)}`);
  if (checkOut) details.push(`Salida: ${formatDate(checkOut)}`);
  if (checkIn && checkOut) details.push(`Noches: ${nightsBetween(checkIn, checkOut)}`);
  if (guests) details.push(`Huéspedes: ${guests}`);
  if (code) details.push(`Solicitud: ${code}`);
  if (details.length) lines.push('', ...details);
  return lines.join('\n');
}

/** Enlace wa.me correctamente codificado, o null si no hay número configurado. */
export function buildWhatsAppLink(number, data) {
  const phone = normalizeWhatsApp(number);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(data))}`;
}
