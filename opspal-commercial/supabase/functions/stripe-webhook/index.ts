/**
 * OpsPal Stripe Webhook Edge Function
 *
 * Copyright (c) 2024-2026 RevPal Corp.. All Rights Reserved.
 *
 * Handles Stripe webhook events and syncs data to Supabase.
 *
 * Events handled:
 * - customer.subscription.created - Create license
 * - customer.subscription.updated - Update license tier
 * - customer.subscription.deleted - Revoke license
 * - invoice.paid - Extend license
 * - invoice.payment_failed - Flag account
 * - checkout.session.completed - Process new signup
 *
 * Setup:
 *   1. Set STRIPE_WEBHOOK_SECRET in Supabase secrets
 *   2. Configure webhook in Stripe Dashboard pointing to this function
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Stripe product to tier mapping (live price IDs)
const PRICE_TO_TIER: Record<string, string> = {
  // Starter tier - $2,500/mo, $27,000/yr
  'price_1SrR7BS4DKBBHhM344gKeAQJ': 'starter',  // monthly
  'price_1SrRAiS4DKBBHhM3dteHGYCY': 'starter',  // annual
  // Professional tier - $3,000/mo, $32,400/yr
  'price_1SrRAjS4DKBBHhM3SjBDS6sj': 'professional',  // monthly
  'price_1SrRAkS4DKBBHhM32AJDnaWd': 'professional',  // annual
  // Enterprise tier - $3,500/mo, $37,800/yr
  'price_1SrRAlS4DKBBHhM3L7jgTGww': 'enterprise',  // monthly
  'price_1SrRAmS4DKBBHhM3YldN5utt': 'enterprise',  // annual
};

// Tier configuration
const TIER_CONFIG: Record<string, { maxUsers: number; maxActivations: number }> = {
  starter: { maxUsers: 3, maxActivations: 2 },
  professional: { maxUsers: 10, maxActivations: 5 },
  enterprise: { maxUsers: -1, maxActivations: 20 },
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    const signature = req.headers.get('stripe-signature');
    const body = await req.text();

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      const isValid = await verifyStripeSignature(body, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid Stripe signature');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (webhookSecret) {
      console.warn('Stripe signature missing - rejecting request');
      return new Response(
        JSON.stringify({ error: 'Missing signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const event = JSON.parse(body);
    console.log(`Processing Stripe event: ${event.type} (${event.id})`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle event
    const result = await handleStripeEvent(supabase, event);

    // Log audit event
    await supabase.from('audit_log').insert({
      event_type: `stripe_${event.type}`,
      entity_type: 'stripe_event',
      entity_id: event.id,
      details: {
        handled: result.handled,
        action: result.action,
        error: result.error,
      },
    });

    return new Response(
      JSON.stringify({ received: true, ...result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed', message: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Verify Stripe webhook signature
 */
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const elements = signature.split(',');
    const signatureMap: Record<string, string> = {};

    elements.forEach(element => {
      const [key, value] = element.split('=');
      signatureMap[key] = value;
    });

    const timestamp = signatureMap.t;
    const signatures = elements.filter(e => e.startsWith('v1=')).map(e => e.split('=')[1]);

    // Check timestamp tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.error('Webhook timestamp too old');
      return false;
    }

    // Verify signature using Web Crypto API
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return signatures.includes(expectedSignature);
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

/**
 * Handle Stripe webhook event
 */
async function handleStripeEvent(
  supabase: any,
  event: any
): Promise<{ handled: boolean; action?: string; error?: string }> {
  const eventHandlers: Record<string, (supabase: any, data: any) => Promise<any>> = {
    'customer.subscription.created': handleSubscriptionCreated,
    'customer.subscription.updated': handleSubscriptionUpdated,
    'customer.subscription.deleted': handleSubscriptionDeleted,
    'invoice.paid': handleInvoicePaid,
    'invoice.payment_failed': handlePaymentFailed,
    'checkout.session.completed': handleCheckoutCompleted,
  };

  const handler = eventHandlers[event.type];
  if (handler) {
    return handler(supabase, event.data.object);
  }

  console.log(`Unhandled event type: ${event.type}`);
  return { handled: false };
}

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(
  supabase: any,
  subscription: any
): Promise<{ handled: boolean; action: string; license_key?: string; error?: string }> {
  try {
    const stripeCustomerId = subscription.customer;
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const tier = PRICE_TO_TIER[priceId] || 'starter';

    // Find or create customer
    let { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('stripe_customer_id', stripeCustomerId);

    let customerId: string;

    if (!customers || customers.length === 0) {
      // Create customer from Stripe data
      const { data: newCustomer, error } = await supabase
        .from('customers')
        .insert({
          email: subscription.customer_email || `stripe-${stripeCustomerId}@temp.opspal.com`,
          stripe_customer_id: stripeCustomerId,
          metadata: { source: 'stripe_webhook' },
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create customer: ${error.message}`);
      customerId = newCustomer.id;
    } else {
      customerId = customers[0].id;
    }

    // Create subscription record
    const periodEnd = new Date(subscription.current_period_end * 1000);

    await supabase.from('subscriptions').upsert({
      customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId,
      tier: tier,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end || false,
    }, { onConflict: 'stripe_subscription_id' });

    // Generate license key
    const { data: licenseKey } = await supabase.rpc('generate_license_key', {
      p_tier: tier,
      p_customer_id: customerId,
    });

    // Create license
    const config = TIER_CONFIG[tier] || TIER_CONFIG.starter;

    await supabase.from('licenses').upsert({
      customer_id: customerId,
      license_key: licenseKey,
      tier: tier,
      status: 'active',
      max_users: config.maxUsers,
      max_activations: config.maxActivations,
      expires_at: periodEnd.toISOString(),
      features: { source: 'stripe_subscription', subscription_id: subscription.id },
    }, { onConflict: 'license_key' });

    console.log(`License created for subscription ${subscription.id}: ${licenseKey}`);

    return { handled: true, action: 'license_created', license_key: licenseKey };
  } catch (err) {
    console.error('Error handling subscription created:', err);
    return { handled: false, action: 'license_created', error: err.message };
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(
  supabase: any,
  subscription: any
): Promise<{ handled: boolean; action: string; error?: string }> {
  try {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const tier = PRICE_TO_TIER[priceId] || 'starter';
    const periodEnd = new Date(subscription.current_period_end * 1000);

    // Update subscription
    await supabase
      .from('subscriptions')
      .update({
        tier: tier,
        status: subscription.status,
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end || false,
      })
      .eq('stripe_subscription_id', subscription.id);

    // Update license tier
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('customer_id')
      .eq('stripe_subscription_id', subscription.id)
      .single();

    if (subs) {
      const config = TIER_CONFIG[tier] || TIER_CONFIG.starter;

      await supabase
        .from('licenses')
        .update({
          tier: tier,
          max_users: config.maxUsers,
          max_activations: config.maxActivations,
          expires_at: periodEnd.toISOString(),
          status: subscription.status === 'active' ? 'active' : 'suspended',
        })
        .eq('customer_id', subs.customer_id)
        .eq('status', 'active');
    }

    return { handled: true, action: 'license_updated' };
  } catch (err) {
    console.error('Error handling subscription updated:', err);
    return { handled: false, action: 'license_updated', error: err.message };
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(
  supabase: any,
  subscription: any
): Promise<{ handled: boolean; action: string; error?: string }> {
  try {
    // Get customer ID
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('customer_id')
      .eq('stripe_subscription_id', subscription.id)
      .single();

    // Update subscription status
    await supabase
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('stripe_subscription_id', subscription.id);

    // Expire license
    if (subs) {
      await supabase
        .from('licenses')
        .update({ status: 'expired' })
        .eq('customer_id', subs.customer_id)
        .eq('status', 'active');
    }

    return { handled: true, action: 'license_revoked' };
  } catch (err) {
    console.error('Error handling subscription deleted:', err);
    return { handled: false, action: 'license_revoked', error: err.message };
  }
}

/**
 * Handle invoice paid event
 */
async function handleInvoicePaid(
  supabase: any,
  invoice: any
): Promise<{ handled: boolean; action: string; error?: string }> {
  try {
    // Get customer
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('stripe_customer_id', invoice.customer);

    if (customers && customers.length > 0) {
      // Record invoice
      await supabase.from('invoices').upsert({
        customer_id: customers[0].id,
        stripe_invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        status: invoice.status,
        invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
      }, { onConflict: 'stripe_invoice_id' });
    }

    return { handled: true, action: 'invoice_recorded' };
  } catch (err) {
    console.error('Error handling invoice paid:', err);
    return { handled: false, action: 'invoice_recorded', error: err.message };
  }
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(
  supabase: any,
  invoice: any
): Promise<{ handled: boolean; action: string; error?: string }> {
  try {
    // Get customer
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('stripe_customer_id', invoice.customer);

    if (customers && customers.length > 0) {
      // Update invoice status
      await supabase
        .from('invoices')
        .update({ status: 'failed' })
        .eq('stripe_invoice_id', invoice.id);

      // After 3 failed attempts, suspend license
      if (invoice.attempt_count >= 3) {
        await supabase
          .from('licenses')
          .update({ status: 'suspended' })
          .eq('customer_id', customers[0].id)
          .eq('status', 'active');
      }
    }

    return { handled: true, action: 'payment_failed_recorded' };
  } catch (err) {
    console.error('Error handling payment failed:', err);
    return { handled: false, action: 'payment_failed_recorded', error: err.message };
  }
}

/**
 * Handle checkout session completed event
 */
async function handleCheckoutCompleted(
  supabase: any,
  session: any
): Promise<{ handled: boolean; action: string; error?: string }> {
  try {
    // If this was a subscription checkout, the subscription.created event will handle it
    if (session.mode === 'subscription') {
      console.log('Subscription checkout completed, waiting for subscription.created event');
      return { handled: true, action: 'checkout_recorded' };
    }

    // For one-time payments, handle differently if needed
    return { handled: true, action: 'checkout_recorded' };
  } catch (err) {
    console.error('Error handling checkout completed:', err);
    return { handled: false, action: 'checkout_recorded', error: err.message };
  }
}
