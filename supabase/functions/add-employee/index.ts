import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type Role = 'Ganger' | 'Labourer' | 'Backup Driver';

interface AddEmployeeRequest {
  full_name: string;
  role: Role;
  rate: number;
  email: string;
  password: string;
  assigned_vehicle_id?: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fail(code: string, error: string, status = 400) {
  return json({ ok: false, code, error }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return fail('method_not_allowed', 'Method not allowed', 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return fail('server_misconfigured', 'Server is missing Supabase credentials', 500);
    }

    let body: Partial<AddEmployeeRequest>;
    try {
      body = await req.json();
    } catch {
      return fail('invalid_json', 'Request body must be valid JSON', 400);
    }

    const full_name = (body.full_name ?? '').toString().trim();
    const role = body.role as Role | undefined;
    const rate = body.rate === undefined || body.rate === null ? NaN : Number(body.rate);
    const email = (body.email ?? '').toString().trim().toLowerCase();
    const password = (body.password ?? '').toString();
    const assigned_vehicle_id = body.assigned_vehicle_id || null;

    if (!full_name) return fail('missing_full_name', 'Full name is required', 400);
    if (!role) return fail('missing_role', 'Role is required', 400);
    const validRoles: Role[] = ['Ganger', 'Labourer', 'Backup Driver'];
    if (!validRoles.includes(role)) {
      return fail('invalid_role', `Role must be one of: ${validRoles.join(', ')}`, 400);
    }
    if (Number.isNaN(rate)) return fail('invalid_rate', 'Hourly rate must be a number', 400);
    if (!email) return fail('missing_email', 'Email is required', 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('invalid_email', 'Invalid email format', 400);
    }
    if (!password) return fail('missing_password', 'Password is required', 400);
    if (password.length < 6) {
      return fail('weak_password', 'Password must be at least 6 characters', 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (assigned_vehicle_id) {
      const { data: vehicle, error: vehicleErr } = await admin
        .from('vehicles')
        .select('id')
        .eq('id', assigned_vehicle_id)
        .maybeSingle();
      if (vehicleErr) return fail('vehicle_lookup_failed', vehicleErr.message, 400);
      if (!vehicle) return fail('vehicle_not_found', 'Assigned vehicle does not exist', 400);
    }

    const { data: existing, error: existingErr } = await admin
      .from('employees')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existingErr) return fail('email_check_failed', existingErr.message, 400);
    if (existing) return fail('email_in_use', 'An employee with this email already exists', 409);

    const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authErr || !authCreated?.user) {
      const msg = authErr?.message || 'Failed to create auth user';
      const status = /already|registered|exists/i.test(msg) ? 409 : 400;
      return fail('auth_create_failed', msg, status);
    }

    const authUserId = authCreated.user.id;

    const { data: employee, error: empErr } = await admin
      .from('employees')
      .insert({
        full_name,
        role,
        rate,
        email,
        password,
        assigned_vehicle_id,
      })
      .select('id, full_name, role, rate, email, assigned_vehicle_id, created_at')
      .single();

    if (empErr || !employee) {
      try { await admin.auth.admin.deleteUser(authUserId); } catch (_) { /* ignore */ }
      return fail('employee_insert_failed', empErr?.message || 'Failed to create employee record', 400);
    }

    const { error: profileErr } = await admin
      .from('user_profiles')
      .insert({
        id: authUserId,
        employee_id: employee.id,
        role: 'employee',
      });

    if (profileErr) {
      try { await admin.from('employees').delete().eq('id', employee.id); } catch (_) { /* ignore */ }
      try { await admin.auth.admin.deleteUser(authUserId); } catch (_) { /* ignore */ }
      return fail('profile_insert_failed', profileErr.message, 400);
    }

    return json({
      ok: true,
      user_id: authUserId,
      employee_id: employee.id,
      employee,
    }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected server error';
    return fail('unexpected', message, 500);
  }
});
