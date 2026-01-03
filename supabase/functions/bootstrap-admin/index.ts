import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BootstrapRequest {
  email: string;
  password: string;
  full_name: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { createClient } = await import("npm:@supabase/supabase-js@2");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { count, error: countError } = await supabaseAdmin
      .from("user_profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");

    if (countError) {
      return new Response(
        JSON.stringify({ error: "Database error checking admins" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (count && count > 0) {
      return new Response(
        JSON.stringify({ error: "An admin already exists. Use the regular create-user function." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name }: BootstrapRequest = await req.json();

    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, password, full_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: authUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() }
    });

    if (createUserError || !authUser.user) {
      return new Response(
        JSON.stringify({ error: createUserError?.message || "Failed to create auth user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: authUser.user.id,
        role: "admin",
        employee_id: null
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return new Response(
        JSON.stringify({ error: "Failed to create admin profile: " + profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Admin user created successfully. You can now login.",
        email: email.trim()
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});