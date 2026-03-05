/**
 * OpsPal Stripe Customer Portal Session Edge Function
 *
 * Copyright (c) 2024-2026 RevPal Corp.. All Rights Reserved.
 *
 * Creates a Stripe Customer Portal session for authenticated customers
 * to manage their subscription, payment methods, and invoices.
 *
 * POST /create-portal-session
 * Headers:
 *   Authorization: Bearer <supabase_access_token>
 *
 * Response:
 *   {
 *     "url": "https://billing.stripe.com/session/..."
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Portal return URL
const PORTAL_RETURN_URL = Deno.env.get('PORTAL_URL') || 'https://portal.gorevpal.com';

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
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Missing authorization header.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the customer record with their Stripe customer ID
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, email, stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (customerError || !customer) {
      return new Response(
        JSON.stringify({ error: 'customer_not_found', message: 'Customer record not found.' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let stripeCustomerId = customer.stripe_customer_id;

    // If no Stripe customer ID exists, create one
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        metadata: {
          supabase_id: customer.id,
        },
      });

      stripeCustomerId = stripeCustomer.id;

      // Update the customer record with the Stripe customer ID
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      await adminClient
        .from('customers')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', customer.id);
    }

    // Create the Stripe Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${PORTAL_RETURN_URL}/billing`,
    });

    // Log audit event
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    await adminClient.from('audit_log').insert({
      customer_id: customer.id,
      action: 'portal_session_created',
      details: {
        stripe_session_id: session.id,
        return_url: `${PORTAL_RETURN_URL}/billing`,
      },
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip'),
    });

    // Return the portal URL
    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    console.error('Unexpected error:', err);

    // Handle Stripe errors specifically
    if (err instanceof Stripe.errors.StripeError) {
      return new Response(
        JSON.stringify({
          error: 'stripe_error',
          message: err.message,
        }),
        {
          status: err.statusCode || 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'An unexpected error occurred while creating the portal session.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
