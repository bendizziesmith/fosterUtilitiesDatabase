// supabase/functions/delete-employee/index.ts
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
        status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { employee_id } = await req.json();
    if (!employee_id) {
      return new Response(JSON.stringify({ ok: false, error: 'employee_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1) If there is a linked auth user (via user_profiles), delete it first
    const { data: profile, error: profErr } = await supabase
      .from('user_profiles')
      .select('id')              // id == auth user id
      .eq('employee_id', employee_id)
      .maybeSingle();
    if (profErr) {
      return new Response(JSON.stringify({ ok: false, error: profErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (profile?.id) {
      const { error: delAuthErr } = await supabase.auth.admin.deleteUser(profile.id);
      if (delAuthErr) {
        return new Response(JSON.stringify({ ok: false, error: delAuthErr.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // remove the profile row
      await supabase.from('user_profiles').delete().eq('employee_id', employee_id);
    }

    // 2) Finally delete the employee row
    const { error: delEmpErr } = await supabase.from('employees').delete().eq('id', employee_id);
    if (delEmpErr) {
      return new Response(JSON.stringify({ ok: false, error: delEmpErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
