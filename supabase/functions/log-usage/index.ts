/**
 * OpsPal Usage Logging Edge Function
 *
 * Copyright (c) 2024-2026 RevPal Corp.. All Rights Reserved.
 *
 * Logs plugin/agent/command usage for analytics and billing.
 *
 * POST /log-usage
 * Headers:
 *   - x-license-key: The license key for the customer
 *
 * Body:
 *   {
 *     "agent_name": "sfdc-cpq-assessor",
 *     "command_name": "q2c-audit",
 *     "plugin_name": "salesforce-plugin",
 *     "execution_time_ms": 15234,
 *     "success": true,
 *     "error_message": null,
 *     "metadata": {
 *       "org_alias": "production",
 *       "objects_analyzed": 45
 *     }
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "usage_id": "uuid",
 *     "usage_summary": {
 *       "total_executions": 150,
 *       "this_month": 42
 *     }
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'method_not_allowed', message: 'Only POST requests are accepted.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Get license key from header
    const licenseKey = req.headers.get('x-license-key');

    if (!licenseKey) {
      return new Response(
        JSON.stringify({
          error: 'missing_license_key',
          message: 'License key is required in x-license-key header.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body = await req.json();
    const {
      agent_name,
      command_name,
      plugin_name,
      execution_time_ms,
      success,
      error_message,
      metadata,
    } = body;

    // At least one of agent_name or command_name should be provided
    if (!agent_name && !command_name) {
      return new Response(
        JSON.stringify({
          error: 'missing_context',
          message: 'At least one of agent_name or command_name is required.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call the log_usage database function
    const { data: usageId, error: usageError } = await supabase.rpc('log_usage', {
      p_license_key: licenseKey,
      p_agent_name: agent_name || null,
      p_command_name: command_name || null,
      p_plugin_name: plugin_name || null,
      p_execution_time_ms: execution_time_ms || null,
      p_success: success !== undefined ? success : true,
      p_error_message: error_message || null,
      p_metadata: metadata || null,
    });

    if (usageError) {
      console.error('Usage logging error:', usageError);

      // Check if it's a license validation error
      if (usageError.message.includes('Invalid') || usageError.message.includes('not found')) {
        return new Response(
          JSON.stringify({
            error: 'invalid_license',
            message: usageError.message,
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'logging_failed',
          message: usageError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the license ID for usage summary
    const { data: license } = await supabase
      .from('licenses')
      .select('id')
      .eq('license_key', licenseKey)
      .single();

    // Get usage summary
    let usageSummary = null;
    if (license) {
      const { data: stats } = await supabase.rpc('get_usage_stats', {
        p_license_id: license.id,
      });
      usageSummary = stats;
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        usage_id: usageId,
        usage_summary: usageSummary,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'An unexpected error occurred during usage logging.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
