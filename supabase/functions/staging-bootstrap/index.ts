import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { createClient } = await import("npm:@supabase/supabase-js@2");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const ADMIN_EMAIL = "staging-admin@foster-utilities.test";
    const ADMIN_PASSWORD = "staging-admin-2026";
    const GANGER_EMAIL = "staging-ganger@foster-utilities.test";
    const GANGER_PASSWORD = "staging-ganger-2026";

    const results: Record<string, unknown> = {};

    // 1. Create or find the test vehicle
    const { data: existingVehicle } = await supabaseAdmin
      .from("vehicles")
      .select("id")
      .eq("registration_number", "STG-001")
      .maybeSingle();

    let vehicleId: string;
    if (existingVehicle) {
      vehicleId = existingVehicle.id;
      results.vehicle = "Already exists";
    } else {
      const { data: newVehicle, error: vehicleErr } = await supabaseAdmin
        .from("vehicles")
        .insert({
          registration_number: "STG-001",
          make_model: "Ford Transit (Staging)",
          next_service_date: "2026-07-01",
          next_mot_date: "2026-09-15",
        })
        .select("id")
        .single();

      if (vehicleErr) throw new Error("Vehicle creation failed: " + vehicleErr.message);
      vehicleId = newVehicle.id;
      results.vehicle = "Created";
    }

    // 2. Create admin auth user (or find existing)
    const { data: existingAdminUsers } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("id", (await supabaseAdmin.auth.admin.listUsers()).data?.users?.find(
        (u: { email?: string }) => u.email === ADMIN_EMAIL
      )?.id ?? "00000000-0000-0000-0000-000000000000");

    let adminUserId: string;
    const existingAdminAuth = (
      await supabaseAdmin.auth.admin.listUsers()
    ).data?.users?.find((u: { email?: string }) => u.email === ADMIN_EMAIL);

    if (existingAdminAuth) {
      adminUserId = existingAdminAuth.id;
      results.adminAuth = "Already exists";
    } else {
      const { data: adminAuth, error: adminAuthErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          email_confirm: true,
          app_metadata: { role: "admin" },
          user_metadata: { full_name: "Staging Admin", role: "admin", is_admin: true },
        });

      if (adminAuthErr || !adminAuth.user) {
        throw new Error("Admin auth creation failed: " + (adminAuthErr?.message ?? "unknown"));
      }
      adminUserId = adminAuth.user.id;
      results.adminAuth = "Created";
    }

    // 3. Create admin user_profile
    const { data: existingAdminProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("id", adminUserId)
      .maybeSingle();

    if (!existingAdminProfile) {
      const { error: adminProfileErr } = await supabaseAdmin
        .from("user_profiles")
        .insert({ id: adminUserId, role: "admin", employee_id: null });

      if (adminProfileErr) throw new Error("Admin profile failed: " + adminProfileErr.message);
      results.adminProfile = "Created";
    } else {
      results.adminProfile = "Already exists";
    }

    // 4. Create ganger auth user (or find existing)
    const existingGangerAuth = (
      await supabaseAdmin.auth.admin.listUsers()
    ).data?.users?.find((u: { email?: string }) => u.email === GANGER_EMAIL);

    let gangerUserId: string;
    if (existingGangerAuth) {
      gangerUserId = existingGangerAuth.id;
      results.gangerAuth = "Already exists";
    } else {
      const { data: gangerAuth, error: gangerAuthErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: GANGER_EMAIL,
          password: GANGER_PASSWORD,
          email_confirm: true,
          app_metadata: { role: "employee" },
          user_metadata: { full_name: "Staging Ganger" },
        });

      if (gangerAuthErr || !gangerAuth.user) {
        throw new Error("Ganger auth creation failed: " + (gangerAuthErr?.message ?? "unknown"));
      }
      gangerUserId = gangerAuth.user.id;
      results.gangerAuth = "Created";
    }

    // 5. Create ganger employee record (or find existing)
    const { data: existingGangerEmp } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("email", GANGER_EMAIL)
      .maybeSingle();

    let gangerEmployeeId: string;
    if (existingGangerEmp) {
      gangerEmployeeId = existingGangerEmp.id;

      await supabaseAdmin
        .from("employees")
        .update({ assigned_vehicle_id: vehicleId })
        .eq("id", gangerEmployeeId);

      results.gangerEmployee = "Already exists (vehicle updated)";
    } else {
      const { data: newGangerEmp, error: gangerEmpErr } = await supabaseAdmin
        .from("employees")
        .insert({
          full_name: "Staging Ganger",
          role: "Ganger",
          rate: 38.0,
          email: GANGER_EMAIL,
          password: "(auth-managed)",
          assigned_vehicle_id: vehicleId,
        })
        .select("id")
        .single();

      if (gangerEmpErr) throw new Error("Ganger employee failed: " + gangerEmpErr.message);
      gangerEmployeeId = newGangerEmp.id;
      results.gangerEmployee = "Created";
    }

    // 6. Create ganger user_profile
    const { data: existingGangerProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("id")
      .eq("id", gangerUserId)
      .maybeSingle();

    if (!existingGangerProfile) {
      const { error: gangerProfileErr } = await supabaseAdmin
        .from("user_profiles")
        .insert({ id: gangerUserId, role: "employee", employee_id: gangerEmployeeId });

      if (gangerProfileErr) throw new Error("Ganger profile failed: " + gangerProfileErr.message);
      results.gangerProfile = "Created";
    } else {
      results.gangerProfile = "Already exists";
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Staging bootstrap complete",
        credentials: {
          admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
          ganger: { email: GANGER_EMAIL, password: GANGER_PASSWORD },
        },
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Bootstrap failed",
        details: (error as Error).message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
