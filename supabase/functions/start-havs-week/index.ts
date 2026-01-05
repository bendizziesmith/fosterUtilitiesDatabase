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

interface PreviousMember {
  id: string;
  person_type: 'ganger' | 'operative';
  employee_id: string | null;
  manual_name: string | null;
  role: string | null;
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

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

    const { data: existingWeek } = await supabase
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

    const { data: newWeek, error: weekError } = await supabase
      .from('havs_weeks')
      .insert({
        ganger_id,
        week_ending,
        status: 'draft',
      })
      .select()
      .single();

    if (weekError || !newWeek) {
      return new Response(
        JSON.stringify({ error: `Failed to create HAVS week: ${weekError?.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: gangerEmployee } = await supabase
      .from('employees')
      .select('role')
      .eq('id', ganger_id)
      .single();

    const { error: gangerMemberError } = await supabase
      .from('havs_week_members')
      .insert({
        havs_week_id: newWeek.id,
        person_type: 'ganger',
        employee_id: ganger_id,
        manual_name: null,
        role: gangerEmployee?.role || 'Ganger',
      });

    if (gangerMemberError) {
      await supabase.from('havs_weeks').delete().eq('id', newWeek.id);
      return new Response(
        JSON.stringify({ error: `Failed to create ganger member: ${gangerMemberError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (carry_over_member_ids.length > 0) {
      const { data: previousMembers, error: prevMembersError } = await supabase
        .from('havs_week_members')
        .select('id, person_type, employee_id, manual_name, role')
        .in('id', carry_over_member_ids);

      if (prevMembersError) {
        console.error('Error fetching previous members:', prevMembersError);
      } else if (previousMembers && previousMembers.length > 0) {
        const membersToInsert = previousMembers
          .filter((m: PreviousMember) => m.person_type !== 'ganger')
          .map((m: PreviousMember) => ({
            havs_week_id: newWeek.id,
            person_type: m.person_type,
            employee_id: m.employee_id,
            manual_name: m.manual_name,
            role: m.role,
          }));

        if (membersToInsert.length > 0) {
          const { error: insertMembersError } = await supabase
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