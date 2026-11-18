import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { buildWhatsAppLink, normalizeWhatsApp } from '../lib/whatsapp.js';
import { mediaUrl } from '../lib/media.js';
import { MediaPicker } from '../ui/MediaPicker.jsx';
import { Loading, ErrorState, useToast } from '../ui/Feedback.jsx';
import { AdminPage } from './AdminLayout.jsx';
import { useInvalidateAdmin } from './opsApi.js';
import './ops-admin.css';

const httpsUrl = label => z.string().trim().max(300, `${label} es demasiado larga.`)
  .refine(v => v === '' || /^https:\/\/[^\s]+$/i.test(v), `${label} debe empezar con https://`);
const time = z.string().refine(v => v === '' || /^\d{2}:\d{2}/.test(v), 'Hora no válida.');

const schema = z.object({
  hotel_name: z.string().trim().min(1, 'Escribe el nombre del hotel.').max(80, 'Máximo 80 caracteres.'),
  whatsapp: z.string().refine(v => v.trim() === '' || normalizeWhatsApp(v) !== '', 'Usa solo dígitos con indicativo del país (10 a 15 dígitos), por ejemplo 573001234567.'),
  phone: z.string().trim().max(30, 'Máximo 30 caracteres.'),
  email: z.string().trim().max(120).refine(v => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Escribe un correo válido.'),
  address: z.string().trim().max(200, 'Máximo 200 caracteres.'),
  city: z.string().trim().max(120, 'Máximo 120 caracteres.'),
  map_url: httpsUrl('La dirección del mapa'),
  business_hours: z.string().trim().max(300, 'Máximo 300 caracteres.'),
  facebook: httpsUrl('La dirección de Facebook'),
  instagram: httpsUrl('La dirección de Instagram'),
  tiktok: httpsUrl('La dirección de TikTok'),
  booking_policy: z.string().trim().max(4000, 'Máximo 4000 caracteres.'),
  check_in_time: time,
  check_out_time: time,
  allow_same_day_turnover: z.boolean(),
});

const toForm = row => ({
  hotel_name: row.hotel_name || '', whatsapp: row.whatsapp || '', phone: row.phone || '', email: row.email || '', address: row.address || '',
  city: row.city || '', map_url: row.map_url || '', business_hours: row.business_hours || '',
  facebook: row.social?.facebook || '', instagram: row.social?.instagram || '', tiktok: row.social?.tiktok || '',
  booking_policy: row.booking_policy || '', check_in_time: (row.check_in_time || '').slice(0, 5), check_out_time: (row.check_out_time || '').slice(0, 5),
  allow_same_day_turnover: row.allow_same_day_turnover ?? true,
});

const empty = v => (v === '' ? null : v);

function Field({ label, error, hint, children }) {
  return <label>{label}{children}{hint && <span className="field-hint">{hint}</span>}{error && <span className="form-error" role="alert">{error}</span>}</label>;
}

export default function SettingsAdmin() {
  const toast = useToast();
  const invalidate = useInvalidateAdmin();
  const [form, setForm] = useState(null);
  const [logoId, setLogoId] = useState(null);
  const [logoRow, setLogoRow] = useState(null);
  const [picker, setPicker] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => unwrap(supabase.from('hotel_settings').select('*, logo:logo_media_id(id,path,thumb_path,source,alt_text,title)').eq('id', 1).single()),
  });

  useEffect(() => {
    if (data && !form) { setForm(toForm(data)); setLogoId(data.logo_media_id); setLogoRow(data.logo || null); }
  }, [data, form]);

  const save = useMutation({
    mutationFn: async values => {
      const payload = {
        hotel_name: values.hotel_name, logo_media_id: logoId, whatsapp: empty(normalizeWhatsApp(values.whatsapp)),
        phone: empty(values.phone), email: empty(values.email), address: empty(values.address), city: values.city,
        map_url: empty(values.map_url), business_hours: empty(values.business_hours),
        social: Object.fromEntries(['facebook', 'instagram', 'tiktok'].filter(k => values[k]).map(k => [k, values[k]])),
        booking_policy: empty(values.booking_policy), check_in_time: empty(values.check_in_time), check_out_time: empty(values.check_out_time),
        allow_same_day_turnover: values.allow_same_day_turnover,
      };
      const rows = await unwrapRows(supabase.from('hotel_settings').update(payload).eq('id', 1).select('id'));
      if (!rows?.length) throw Object.assign(new Error('No se guardaron los cambios. Verifica que tengas permisos de administrador.'), { isAppError: true });
    },
    onSuccess: async () => {
      setServerError('');
      await invalidate();
      toast.success('Configuración guardada.');
    },
    onError: err => { setServerError(err.message); toast.error(err.message); },
  });

  if (isLoading || (data && !form)) return <AdminPage title="Configuración"><Loading /></AdminPage>;
  if (error) return <AdminPage title="Configuración"><ErrorState error={error} onRetry={refetch} /></AdminPage>;

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));
  const waLink = buildWhatsAppLink(form.whatsapp, { hotelName: form.hotel_name });

  function submit(e) {
    e.preventDefault();
    setServerError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next = {};
      for (const issue of parsed.error.issues) next[issue.path[0]] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const err = key => errors[key];
  return (
    <AdminPage title="Configuración" description="Datos generales del hotel que se muestran en el sitio público.">
      <form className="admin-form" onSubmit={submit} noValidate>
        <fieldset>
          <legend>Identidad</legend>
          <div className="form-grid">
            <Field label="Nombre del hotel" error={err('hotel_name')}><input name="hotel_name" value={form.hotel_name} maxLength={80} onChange={set('hotel_name')} required /></Field>
            <Field label="Ciudad" error={err('city')}><input name="city" value={form.city} maxLength={120} onChange={set('city')} /></Field>
          </div>
          <div className="ops-inline">
            {logoRow ? <img className="ops-logo" src={mediaUrl(logoRow, { thumb: true })} alt={logoRow.alt_text || 'Logotipo actual'} /> : <span className="ops-muted">Sin logotipo seleccionado.</span>}
            <button type="button" className="button button-ghost" onClick={() => setPicker(true)}>Elegir logotipo</button>
            {logoId && <button type="button" className="button button-ghost" onClick={() => { setLogoId(null); setLogoRow(null); }}>Quitar logotipo</button>}
          </div>
        </fieldset>

        <fieldset>
          <legend>Contacto</legend>
          <div className="form-grid">
            <Field label="WhatsApp (con indicativo)" error={err('whatsapp')} hint="Solo dígitos, por ejemplo 573001234567.">
              <input name="whatsapp" inputMode="numeric" value={form.whatsapp} onChange={set('whatsapp')} placeholder="573001234567" />
            </Field>
            <Field label="Teléfono" error={err('phone')}><input name="phone" type="tel" value={form.phone} maxLength={30} onChange={set('phone')} /></Field>
            <Field label="Correo de contacto" error={err('email')}><input name="email" type="email" value={form.email} onChange={set('email')} /></Field>
            <Field label="Dirección" error={err('address')}><input name="address" value={form.address} maxLength={200} onChange={set('address')} /></Field>
            <Field label="Enlace del mapa (https)" error={err('map_url')}><input name="map_url" type="url" value={form.map_url} onChange={set('map_url')} placeholder="https://maps.google.com/..." /></Field>
            <Field label="Horario de atención" error={err('business_hours')}><input name="business_hours" value={form.business_hours} maxLength={300} onChange={set('business_hours')} /></Field>
          </div>
          {normalizeWhatsApp(form.whatsapp) && waLink && (
            <p className="field-hint"><a className="ops-text-link" href={waLink} target="_blank" rel="noopener noreferrer">Probar enlace de WhatsApp</a> (abre WhatsApp en una pestaña nueva; no envía nada).</p>
          )}
        </fieldset>

        <fieldset>
          <legend>Redes sociales</legend>
          <div className="form-grid">
            <Field label="Facebook (https)" error={err('facebook')}><input name="facebook" type="url" value={form.facebook} onChange={set('facebook')} /></Field>
            <Field label="Instagram (https)" error={err('instagram')}><input name="instagram" type="url" value={form.instagram} onChange={set('instagram')} /></Field>
            <Field label="TikTok (https)" error={err('tiktok')}><input name="tiktok" type="url" value={form.tiktok} onChange={set('tiktok')} /></Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Reservas</legend>
          <div className="form-grid">
            <Field label="Hora de entrada (check-in)" error={err('check_in_time')}><input name="check_in_time" type="time" value={form.check_in_time} onChange={set('check_in_time')} /></Field>
            <Field label="Hora de salida (check-out)" error={err('check_out_time')}><input name="check_out_time" type="time" value={form.check_out_time} onChange={set('check_out_time')} /></Field>
          </div>
          <label className="checkbox">
            <input type="checkbox" name="allow_same_day_turnover" checked={form.allow_same_day_turnover} onChange={e => setForm(f => ({ ...f, allow_same_day_turnover: e.target.checked }))} />
            Permitir entrada el mismo día de otra salida
          </label>
          <Field label="Política de reservas" error={err('booking_policy')}><textarea name="booking_policy" value={form.booking_policy} maxLength={4000} onChange={set('booking_policy')} /></Field>
        </fieldset>

        {serverError && <p className="form-error" role="alert">{serverError}</p>}
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar configuración'}</button>
        </div>
      </form>
      <MediaPicker open={picker} onClose={() => setPicker(false)} title="Elegir logotipo" onSelect={([m]) => { if (m) { setLogoId(m.id); setLogoRow(m); } }} />
    </AdminPage>
  );
}
