// supabase/functions/delete-user-by-employee/index.ts
// Deno (Supabase Edge Function)
// Deletes the auth user + user_profiles row linked to an employees.id

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

type Payload = {
  employee_id: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ error: "Server misconfigured: missing env" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = (await req.json()) as Partial<Payload> | null;
    if (!body?.employee_id) return json({ error: "employee_id is required" }, 400);
    const employee_id = body.employee_id;

    // 1) Find user_profile linked to this employee
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("employee_id", employee_id)
      .maybeSingle();

    if (profileErr) return json({ error: profileErr.message }, 400);

    if (!profile) {
      // No profile linked → nothing to remove in auth.users
      return json({ ok: true, info: "No linked user profile; nothing to delete." }, 200);
    }

    const authUserId = profile.id;

    // 2) Delete user_profile row first (to avoid dangling FK to employee if you cascade employee later)
    const { error: delProfErr } = await supabaseAdmin
      .from("user_profiles")
      .delete()
      .eq("id", authUserId);

    if (delProfErr) return json({ error: delProfErr.message }, 400);

    // 3) Delete Auth user (requires service role)
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (delAuthErr) return json({ error: delAuthErr.message }, 400);

    return json({ ok: true, deleted_auth_user_id: authUserId });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders() },
  });
}

function corsHeaders(req?: Request): HeadersInit {
  const origin = req?.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
