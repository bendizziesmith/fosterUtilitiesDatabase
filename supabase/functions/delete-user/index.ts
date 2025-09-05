// supabase/functions/delete-user/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { employee_id, user_id } = await req.json();
    if (!employee_id && !user_id) {
      return new Response(JSON.stringify({ ok: false, error: 'employee_id or user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1) Work out the auth user id via user_profiles if not provided
    let authUserId: string | null = user_id ?? null;

    if (!authUserId && employee_id) {
      const { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('id')           // id == auth user id
        .eq('employee_id', employee_id)
        .maybeSingle();
      if (profileErr) {
        return new Response(JSON.stringify({ ok: false, error: profileErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authUserId = profile?.id ?? null;
    }

    // 2) If there is an auth user, delete it first
    if (authUserId) {
      const { error: delAuthErr } = await supabase.auth.admin.deleteUser(authUserId);
      if (delAuthErr) {
        return new Response(JSON.stringify({ ok: false, error: delAuthErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // remove any matching profile rows
      await supabase.from('user_profiles').delete()
        .or(`id.eq.${authUserId}${employee_id ? `,employee_id.eq.${employee_id}` : ''}`);
    } else if (employee_id) {
      // no auth user, but ensure any stray profile is removed
      await supabase.from('user_profiles').delete().eq('employee_id', employee_id);
    }

    // 3) Finally, delete the employee row (hard delete)
    if (employee_id) {
      const { error: delEmpErr } = await supabase.from('employees').delete().eq('id', employee_id);
      if (delEmpErr) {
        // If you hit FK violations here, make the referencing FKs ON DELETE CASCADE or
        // extend this function to delete dependent rows first.
        return new Response(JSON.stringify({ ok: false, error: delEmpErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Unexpected error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
