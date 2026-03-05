/**
 * OpsPal License Validation Edge Function
 *
 * Copyright (c) 2024-2026 RevPal Corp.. All Rights Reserved.
 *
 * Validates license keys and optionally records machine activations.
 *
 * POST /validate-license
 * Headers:
 *   - x-license-key: The license key to validate
 *   - x-machine-id: (optional) Machine identifier for activation tracking
 *
 * Body (alternative):
 *   {
 *     "license_key": "OPSPAL-PRO-...",
 *     "machine_id": "optional-machine-id"
 *   }
 *
 * Response:
 *   {
 *     "valid": true,
 *     "tier": "professional",
 *     "organization": "Company Name",
 *     "features": {...},
 *     "expires_at": "2027-01-19T...",
 *     "max_users": 25,
 *     "usage": { "total_executions": 100, ... }
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get license key from header or body
    let licenseKey = req.headers.get('x-license-key');
    let machineId = req.headers.get('x-machine-id');

    // Also check body for POST requests
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        licenseKey = licenseKey || body.license_key;
        machineId = machineId || body.machine_id;
      } catch {
        // Body parsing failed, continue with headers
      }
    }

    if (!licenseKey) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'missing_license_key',
          message: 'License key is required. Provide via x-license-key header or license_key in body.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase client with service role for DB access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Call the validate_license database function
    const { data, error } = await supabase.rpc('validate_license', {
      p_license_key: licenseKey,
      p_machine_id: machineId || null,
    });

    if (error) {
      console.error('Validation error:', error);
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'validation_failed',
          message: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // If validation returned an error state
    if (data && !data.valid) {
      return new Response(JSON.stringify(data), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Success - return license details
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({
        valid: false,
        error: 'internal_error',
        message: 'An unexpected error occurred during license validation.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
