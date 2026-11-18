// Invita a un nuevo usuario del panel. Solo la puede usar un administrador activo.
// La service_role key vive en el entorno de la función (Supabase la inyecta), nunca en el navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';

// ALLOWED_ORIGIN: lista separada por comas (p. ej. "https://hotelbambu.com,https://www.hotelbambu.com").
// Obligatoria en producción. Sin ella se admite cualquier origen (solo para desarrollo local).
const allowed = (Deno.env.get('ALLOWED_ORIGIN') ?? '').split(',').map(s => s.trim()).filter(Boolean);

function corsFor(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowed.length ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async req => {
  const origin = req.headers.get('origin') ?? '';
  if (allowed.length && !allowed.includes(origin)) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // 1. Verificar al solicitante con SU token (respeta MFA y perfil activo)
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: role, error: roleError } = await asCaller.rpc('current_staff_role');
  if (roleError || role !== 'admin') return json({ error: 'Solo un administrador puede invitar usuarios.' }, 403);

  // 2. Validar entrada
  let body: { email?: string; full_name?: string; role?: string };
  try { body = await req.json(); } catch { return json({ error: 'Solicitud inválida' }, 400); }
  const email = String(body.email ?? '').trim().toLowerCase();
  const fullName = String(body.full_name ?? '').trim().slice(0, 120);
  const newRole = body.role === 'admin' ? 'admin' : 'editor';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Correo no válido' }, 400);

  // 3. Invitar con privilegios de servicio. El enlace vuelve a /admin/restablecer para crear la contraseña
  //    (Supabase solo acepta URLs de la lista de redirección configurada).
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: origin ? `${origin}/admin/restablecer` : undefined,
  });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return json({ error: exists ? 'Ese correo ya tiene una cuenta. Cambia su rol desde la lista de usuarios.' : 'No se pudo enviar la invitación.' }, 400);
  }

  const { error: profileError } = await admin.from('profiles')
    .upsert({ id: data.user.id, email, full_name: fullName, role: newRole, active: true }, { onConflict: 'id' });
  if (profileError) return json({ error: 'La invitación se envió, pero no se pudo asignar el rol. Revisa la lista de usuarios.' }, 500);

  return json({ ok: true, user_id: data.user.id });
});
