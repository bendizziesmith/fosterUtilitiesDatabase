// supabase/functions/add-employee/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Role = 'Ganger' | 'Labourer' | 'Backup Driver';

interface AddEmployeeRequest {
  // match your Admin form / DB schema
  full_name: string;
  role: Role;
  rate: number;                         // number, not string
  email: string;
  password: string;                     // your employees table currently requires NOT NULL
  assigned_vehicle_id?: string | null;  // FK to vehicles.id (optional)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Partial<AddEmployeeRequest>;

    // ---- Validation ----
    const { full_name, role, rate, email, password, assigned_vehicle_id } = body;

    if (!full_name || !role || rate === undefined || rate === null || !email || !password) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing required fields: full_name, role, rate, email, password',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const validRoles: Role[] = ['Ganger', 'Labourer', 'Backup Driver'];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid email format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (String(password).length < 6) {
      return new Response(JSON.stringify({ ok: false, error: 'Password must be at least 6 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ---- 1) Create Auth user (service role) ----
    const { data: authCreated, error: authErr } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authErr) {
      const msg = authErr.message || 'Failed to create auth user';
      const status = /already/i.test(msg) ? 409 : 400;
      return new Response(JSON.stringify({ ok: false, code: 'auth_create_failed', error: msg }), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authUser = authCreated.user;
    if (!authUser) {
      return new Response(JSON.stringify({ ok: false, error: 'Auth user missing from response' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- 2) Insert employees row (matches your table columns) ----
    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .insert({
        full_name: full_name.trim(),
        role,
        rate: Number(rate),
        email: email.trim().toLowerCase(),
        password: String(password),                 // NOTE: your table has NOT NULL on password
        assigned_vehicle_id: assigned_vehicle_id || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (empErr) {
      // rollback auth user so we don't leave an orphaned login
      await supabase.auth.admin.deleteUser(authUser.id);
      return new Response(JSON.stringify({
        ok: false, code: 'employee_insert_failed', error: empErr.message,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- 3) Link user_profiles (non-fatal if it fails) ----
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .insert({
        id: authUser.id,       // auth user id
        employee_id: employee.id,
        role: 'employee',
      });
    if (profileErr) console.log('user_profiles insert failed:', profileErr.message);

    return new Response(JSON.stringify({
      ok: true,
      user_id: authUser.id,
      employee_id: employee.id,
      employee,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('Unexpected error:', e);
    return new Response(JSON.stringify({
      ok: false, code: 'unexpected', error: e?.message || 'Internal server error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
