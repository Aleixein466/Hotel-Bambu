import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink, buildWhatsAppMessage, normalizeWhatsApp } from '../../src/lib/whatsapp.js';
import { addDays, nightsBetween, overlapsBusy, slugify, validateStay } from '../../src/lib/format.js';

describe('WhatsApp', () => {
  it('sin número válido no genera enlace', () => {
    expect(buildWhatsAppLink('', {})).toBeNull();
    expect(buildWhatsAppLink('12345', {})).toBeNull();
    expect(normalizeWhatsApp('+57 300 123 4567')).toBe('573001234567');
  });

  it('usa wa.me y codifica el mensaje con los datos de la solicitud', () => {
    const link = buildWhatsAppLink('+57 300 123 4567', {
      guestName: 'María & José', roomLabel: 'Habitación 05', checkIn: '2027-01-10', checkOut: '2027-01-12', guests: 2, code: 'BP-1A2B3C4D',
    });
    expect(link.startsWith('https://wa.me/573001234567?text=')).toBe(true);
    const text = decodeURIComponent(link.split('text=')[1]);
    expect(text).toContain('Nombre: María & José');
    expect(text).toContain('Habitación: Habitación 05');
    expect(text).toContain('Noches: 2');
    expect(text).toContain('Solicitud: BP-1A2B3C4D');
    expect(link).not.toMatch(/[ &]text|María/); // espacios, & y acentos codificados
  });

  it('omite datos no proporcionados', () => {
    expect(buildWhatsAppMessage({})).toBe('Hola, Hotel Bambú Plaza.\nQuisiera hacer una consulta.');
  });
});

describe('Fechas de estadía', () => {
  it('valida rangos', () => {
    expect(validateStay('2027-01-10', '2027-01-12', '2027-01-01')).toEqual({ nights: 2 });
    expect(validateStay('2026-12-31', '2027-01-02', '2027-01-01').error).toMatch(/pasado/);
    expect(validateStay('2027-01-10', '2027-01-10', '2027-01-01').error).toMatch(/posterior/);
    expect(validateStay('2027-01-10', '2027-03-10', '2027-01-01').error).toMatch(/30 noches/);
  });

  it('salida y entrada el mismo día no se superponen', () => {
    const busy = [{ start_date: '2027-01-10', end_date: '2027-01-12' }];
    expect(overlapsBusy('2027-01-12', '2027-01-13', busy)).toBe(false);
    expect(overlapsBusy('2027-01-08', '2027-01-10', busy)).toBe(false);
    expect(overlapsBusy('2027-01-11', '2027-01-14', busy)).toBe(true);
  });

  it('aritmética de días sin errores de zona horaria', () => {
    expect(addDays('2027-03-31', 1)).toBe('2027-04-01');
    expect(nightsBetween('2027-12-30', '2028-01-02')).toBe(3);
  });

  it('slugify', () => {
    expect(slugify('¡Promoción de Temporada Baja 2027!')).toBe('promocion-de-temporada-baja-2027');
  });
});
