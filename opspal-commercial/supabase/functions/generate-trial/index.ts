/**
 * OpsPal Trial License Generation Edge Function
 *
 * Copyright (c) 2024-2026 RevPal Corp.. All Rights Reserved.
 *
 * Generates a 14-day trial license for new customers.
 *
 * POST /generate-trial
 * Body:
 *   {
 *     "email": "user@company.com",
 *     "name": "John Doe",
 *     "company": "Acme Corp"
 *   }
 *
 * Response:
 *   {
 *     "success": true,
 *     "license_key": "OPSPAL-TRI-...",
 *     "tier": "trial",
 *     "expires_at": "2026-02-02T...",
 *     "features": {...}
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Trial configuration
const TRIAL_DURATION_DAYS = 14;
const TRIAL_TIER = 'professional'; // Trial gets professional features
const TRIAL_MAX_USERS = 5;
const TRIAL_MAX_ACTIVATIONS = 2;

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
    const body = await req.json();
    const { email, name, company } = body;

    // Validate required fields
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'missing_email', message: 'Email is required.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'invalid_email', message: 'Invalid email format.' }),
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

    // Check if customer already exists
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    if (existingCustomer) {
      // Check if they already have an active license
      const { data: existingLicense } = await supabase
        .from('licenses')
        .select('id, license_key, status, tier, expires_at')
        .eq('customer_id', existingCustomer.id)
        .in('status', ['active', 'trial'])
        .single();

      if (existingLicense) {
        return new Response(
          JSON.stringify({
            error: 'existing_license',
            message: 'This email already has an active license.',
            license_key: existingLicense.license_key,
            tier: existingLicense.tier,
            expires_at: existingLicense.expires_at,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Create or get customer
    let customerId: string;

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          email: email.toLowerCase(),
          name: name || null,
          company: company || null,
          metadata: {
            source: 'trial_signup',
            signup_date: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (customerError) {
        console.error('Customer creation error:', customerError);
        return new Response(
          JSON.stringify({ error: 'customer_creation_failed', message: customerError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      customerId = newCustomer.id;
    }

    // Generate license key
    const { data: licenseKey, error: keyError } = await supabase.rpc('generate_license_key', {
      p_tier: 'trial',
      p_customer_id: customerId,
    });

    if (keyError) {
      console.error('License key generation error:', keyError);
      return new Response(
        JSON.stringify({ error: 'key_generation_failed', message: keyError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + TRIAL_DURATION_DAYS);

    // Trial features (same as professional tier for trial period)
    const trialFeatures = {
      // Core features
      custom_runbooks: true,
      priority_support: false, // Trial doesn't get priority support
      api_access: true,
      advanced_analytics: true,

      // Agent access
      agent_access: {
        salesforce: true,
        hubspot: true,
        marketo: false, // Limited in trial
        gtm_planning: true,
        data_hygiene: true,
      },

      // Limits
      max_assessments_per_month: 10,
      max_reports_per_month: 20,
      max_automations: 5,

      // Trial indicator
      is_trial: true,
      trial_days_remaining: TRIAL_DURATION_DAYS,
    };

    // Create license record
    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .insert({
        customer_id: customerId,
        license_key: licenseKey,
        tier: 'trial',
        status: 'trial',
        max_users: TRIAL_MAX_USERS,
        max_activations: TRIAL_MAX_ACTIVATIONS,
        expires_at: expiresAt.toISOString(),
        features: trialFeatures,
      })
      .select()
      .single();

    if (licenseError) {
      console.error('License creation error:', licenseError);
      return new Response(
        JSON.stringify({ error: 'license_creation_failed', message: licenseError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Log audit event
    await supabase.from('audit_log').insert({
      event_type: 'trial_created',
      entity_type: 'license',
      entity_id: license.id,
      details: {
        customer_id: customerId,
        email: email.toLowerCase(),
        company: company || null,
        trial_duration_days: TRIAL_DURATION_DAYS,
      },
    });

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        license_key: licenseKey,
        tier: 'trial',
        expires_at: expiresAt.toISOString(),
        trial_days: TRIAL_DURATION_DAYS,
        max_users: TRIAL_MAX_USERS,
        max_activations: TRIAL_MAX_ACTIVATIONS,
        features: trialFeatures,
        message: `Your ${TRIAL_DURATION_DAYS}-day trial has been activated. Enjoy full access to OpsPal Professional features!`,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'An unexpected error occurred during trial generation.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
