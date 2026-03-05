/**
 * HubSpot Serverless Function Template: Webhook Handler
 *
 * Receives and processes webhooks from external services (Stripe, Slack, etc.)
 * with signature verification for security.
 *
 * Secrets required:
 * - WEBHOOK_SECRET: Secret key for signature verification
 * - HUBSPOT_ACCESS_TOKEN: (Optional) For updating HubSpot data
 *
 * Usage:
 * 1. Copy to your project's src/app/app.functions/ directory
 * 2. Update serverless.json to register the endpoint
 * 3. Configure secrets in HubSpot portal
 * 4. Deploy with: hs project upload
 * 5. Use the endpoint URL as your webhook destination
 */

const crypto = require('crypto');

exports.main = async (context, sendResponse) => {
  const { body, headers, secrets, method } = context;

  // Handle GET requests (webhook verification)
  if (method === 'GET') {
    // Some services (like Slack) require challenge verification
    if (body.challenge) {
      return sendResponse({
        statusCode: 200,
        body: { challenge: body.challenge }
      });
    }
    return sendResponse({
      statusCode: 200,
      body: { status: 'Webhook endpoint active' }
    });
  }

  // Validate webhook secret is configured
  if (!secrets.WEBHOOK_SECRET) {
    console.log('Warning: WEBHOOK_SECRET not configured, skipping signature verification');
  }

  try {
    // Verify webhook signature (customize based on your provider)
    if (secrets.WEBHOOK_SECRET) {
      const isValid = verifySignature(body, headers, secrets.WEBHOOK_SECRET);
      if (!isValid) {
        console.log('Invalid webhook signature');
        return sendResponse({
          statusCode: 401,
          body: { error: 'Invalid signature' }
        });
      }
    }

    // Extract event type (customize based on provider)
    const eventType = body.type || body.event || body.action || 'unknown';
    console.log(`Received webhook event: ${eventType}`);

    // Route to appropriate handler
    let result;
    switch (eventType) {
      // Stripe events
      case 'payment_intent.succeeded':
        result = await handlePaymentSucceeded(body, secrets);
        break;

      case 'customer.subscription.created':
        result = await handleSubscriptionCreated(body, secrets);
        break;

      case 'customer.subscription.deleted':
        result = await handleSubscriptionCanceled(body, secrets);
        break;

      case 'invoice.paid':
        result = await handleInvoicePaid(body, secrets);
        break;

      // Slack events
      case 'message':
        result = await handleSlackMessage(body, secrets);
        break;

      // Add more handlers as needed
      default:
        console.log(`Unhandled event type: ${eventType}`);
        result = { handled: false, eventType };
    }

    sendResponse({
      statusCode: 200,
      body: {
        received: true,
        eventType,
        ...result
      }
    });

  } catch (error) {
    console.log('Webhook processing error:', error.message);
    sendResponse({
      statusCode: 500,
      body: { error: 'Failed to process webhook' }
    });
  }
};

/**
 * Verify webhook signature
 * Customize this based on your webhook provider's signature method
 */
function verifySignature(body, headers, secret) {
  // Stripe signature verification
  const stripeSignature = headers['stripe-signature'];
  if (stripeSignature) {
    return verifyStripeSignature(body, stripeSignature, secret);
  }

  // Slack signature verification
  const slackSignature = headers['x-slack-signature'];
  if (slackSignature) {
    const timestamp = headers['x-slack-request-timestamp'];
    return verifySlackSignature(body, slackSignature, timestamp, secret);
  }

  // Generic HMAC verification
  const genericSignature = headers['x-signature'] || headers['x-hub-signature-256'];
  if (genericSignature) {
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');
    return genericSignature === `sha256=${expectedSig}` || genericSignature === expectedSig;
  }

  // No signature header found - allow if secret verification disabled
  return false;
}

function verifyStripeSignature(body, signature, secret) {
  try {
    const parts = signature.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {});

    const timestamp = parts.t;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify(body)}`)
      .digest('hex');

    return parts.v1 === expectedSig;
  } catch (e) {
    return false;
  }
}

function verifySlackSignature(body, signature, timestamp, secret) {
  const sigBasestring = `v0:${timestamp}:${JSON.stringify(body)}`;
  const expectedSig = 'v0=' + crypto
    .createHmac('sha256', secret)
    .update(sigBasestring)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
}

// Event Handlers - Customize these for your use case

async function handlePaymentSucceeded(event, secrets) {
  const paymentIntent = event.data?.object;
  console.log(`Payment succeeded: ${paymentIntent?.id}, amount: ${paymentIntent?.amount}`);

  // TODO: Update HubSpot deal, create activity, etc.

  return { processed: true, paymentId: paymentIntent?.id };
}

async function handleSubscriptionCreated(event, secrets) {
  const subscription = event.data?.object;
  console.log(`Subscription created: ${subscription?.id}`);

  // TODO: Update HubSpot contact/deal properties

  return { processed: true, subscriptionId: subscription?.id };
}

async function handleSubscriptionCanceled(event, secrets) {
  const subscription = event.data?.object;
  console.log(`Subscription canceled: ${subscription?.id}`);

  // TODO: Update HubSpot contact lifecycle stage, create task, etc.

  return { processed: true, subscriptionId: subscription?.id };
}

async function handleInvoicePaid(event, secrets) {
  const invoice = event.data?.object;
  console.log(`Invoice paid: ${invoice?.id}`);

  // TODO: Record payment in HubSpot

  return { processed: true, invoiceId: invoice?.id };
}

async function handleSlackMessage(event, secrets) {
  console.log(`Slack message from ${event.user}: ${event.text}`);

  // TODO: Process Slack message, create HubSpot activity, etc.

  return { processed: true };
}
