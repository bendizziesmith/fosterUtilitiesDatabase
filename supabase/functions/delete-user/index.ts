import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface DeleteUserRequest {
  employee_id?: string;
  user_id?: string;
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

    let body: DeleteUserRequest;
    try {
      body = await req.json();
    } catch {
      return fail('invalid_json', 'Request body must be valid JSON', 400);
    }

    const employee_id = body.employee_id || undefined;
    const user_id = body.user_id || undefined;

    if (!employee_id && !user_id) {
      return fail('missing_identifier', 'employee_id or user_id is required', 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let authUserId: string | null = user_id ?? null;
    let resolvedEmployeeId: string | null = employee_id ?? null;

    if (employee_id && !authUserId) {
      const { data: profile, error: profileErr } = await admin
        .from('user_profiles')
        .select('id')
        .eq('employee_id', employee_id)
        .maybeSingle();
      if (profileErr) return fail('profile_lookup_failed', profileErr.message, 400);
      authUserId = profile?.id ?? null;
    }

    if (!resolvedEmployeeId && authUserId) {
      const { data: profile, error: profileErr } = await admin
        .from('user_profiles')
        .select('employee_id')
        .eq('id', authUserId)
        .maybeSingle();
      if (profileErr) return fail('profile_lookup_failed', profileErr.message, 400);
      resolvedEmployeeId = profile?.employee_id ?? null;
    }

    if (authUserId) {
      const { error: delProfileErr } = await admin
        .from('user_profiles')
        .delete()
        .eq('id', authUserId);
      if (delProfileErr) {
        return fail('profile_delete_failed', delProfileErr.message, 400);
      }
    } else if (resolvedEmployeeId) {
      await admin.from('user_profiles').delete().eq('employee_id', resolvedEmployeeId);
    }

    if (authUserId) {
      const { error: delAuthErr } = await admin.auth.admin.deleteUser(authUserId);
      if (delAuthErr && !/not.?found|no rows/i.test(delAuthErr.message)) {
        return fail('auth_delete_failed', delAuthErr.message, 400);
      }
    }

    if (resolvedEmployeeId) {
      const { error: delEmpErr } = await admin
        .from('employees')
        .delete()
        .eq('id', resolvedEmployeeId);
      if (delEmpErr) {
        return fail('employee_delete_failed', delEmpErr.message, 400);
      }
    }

    return json({
      ok: true,
      employee_id: resolvedEmployeeId,
      user_id: authUserId,
    }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected server error';
    return fail('unexpected', message, 500);
  }
});
