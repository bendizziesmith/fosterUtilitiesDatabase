import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface StartHavsWeekRequest {
  ganger_id: string;
  week_ending: string;
  carry_over_member_ids?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { ganger_id, week_ending, carry_over_member_ids = [] }: StartHavsWeekRequest = await req.json();

    if (!ganger_id || !week_ending) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ganger_id and week_ending' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let { data: userProfile } = await adminClient
      .from('user_profiles')
      .select('employee_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!userProfile) {
      const { data: matchingEmployee } = await adminClient
        .from('employees')
        .select('id')
        .eq('email', user.email)
        .maybeSingle();

      const { error: insertError } = await adminClient
        .from('user_profiles')
        .insert({
          id: user.id,
          employee_id: matchingEmployee?.id || null,
          role: 'employee',
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Failed to create user profile:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to initialize user profile. Please try again.' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const { data: newProfile } = await adminClient
        .from('user_profiles')
        .select('employee_id, role')
        .eq('id', user.id)
        .single();

      userProfile = newProfile;
    }

    if (!userProfile || !userProfile.employee_id) {
      return new Response(
        JSON.stringify({ error: 'User profile not linked to an employee. Contact administrator.' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (userProfile.employee_id !== ganger_id) {
      return new Response(
        JSON.stringify({ error: 'You can only create HAVS weeks for yourself' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: existingWeek } = await adminClient
      .from('havs_weeks')
      .select('id')
      .eq('ganger_id', ganger_id)
      .eq('week_ending', week_ending)
      .maybeSingle();

    if (existingWeek) {
      return new Response(
        JSON.stringify({
          error: 'HAVS week already exists for this ganger and week ending',
          existing_week_id: existingWeek.id
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: newWeek, error: weekError } = await adminClient
      .from('havs_weeks')
      .insert({
        ganger_id,
        week_ending,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (weekError || !newWeek) {
      console.error('Failed to create HAVS week:', weekError);
      return new Response(
        JSON.stringify({ error: `Failed to create HAVS week: ${weekError?.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: gangerEmployee } = await adminClient
      .from('employees')
      .select('role')
      .eq('id', ganger_id)
      .single();

    const { error: gangerMemberError } = await adminClient
      .from('havs_week_members')
      .insert({
        havs_week_id: newWeek.id,
        person_type: 'ganger',
        employee_id: ganger_id,
        manual_name: null,
        role: gangerEmployee?.role || 'Ganger',
      });

    if (gangerMemberError) {
      await adminClient.from('havs_weeks').delete().eq('id', newWeek.id);
      return new Response(
        JSON.stringify({ error: `Failed to create ganger member: ${gangerMemberError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (carry_over_member_ids.length > 0) {
      const { data: previousMembers, error: prevMembersError } = await adminClient
        .from('havs_week_members')
        .select('id, person_type, employee_id, manual_name, role')
        .in('id', carry_over_member_ids);

      if (prevMembersError) {
        console.error('Error fetching previous members:', prevMembersError);
      } else if (previousMembers && previousMembers.length > 0) {
        const membersToInsert = previousMembers
          .filter((m) => m.person_type !== 'ganger')
          .map((m) => ({
            havs_week_id: newWeek.id,
            person_type: m.person_type,
            employee_id: m.employee_id,
            manual_name: m.manual_name,
            role: m.role,
          }));

        if (membersToInsert.length > 0) {
          const { error: insertMembersError } = await adminClient
            .from('havs_week_members')
            .insert(membersToInsert);

          if (insertMembersError) {
            console.error('Error inserting carry-over members:', insertMembersError);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'New HAVS week created successfully',
        week: newWeek,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});