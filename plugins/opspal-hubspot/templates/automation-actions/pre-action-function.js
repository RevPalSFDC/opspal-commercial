/**
 * PRE_ACTION_EXECUTION Function Template
 *
 * This function runs BEFORE the request is sent to your actionUrl.
 * Use it to:
 * - Modify or enrich the request payload
 * - Add timestamps, metadata, or computed values
 * - Transform data formats
 * - Add authentication tokens
 * - Validate inputs before external call
 *
 * INPUT (event object):
 * {
 *   fields: {
 *     // Input field values from the workflow action
 *     email_address: "user@example.com",
 *     priority: "high"
 *   },
 *   object: {
 *     // The CRM record being processed
 *     objectType: "CONTACT",
 *     objectId: "12345",
 *     properties: {
 *       email: "user@example.com",
 *       firstname: "John"
 *     }
 *   },
 *   origin: {
 *     portalId: 12345,
 *     actionDefinitionId: "abc123"
 *   }
 * }
 *
 * OUTPUT:
 * Return the modified payload to send to your actionUrl.
 * Whatever you return will be the request body.
 *
 * EXAMPLES:
 * - See templates below for common patterns
 */

// ============================================================
// TEMPLATE 1: Basic Data Enrichment
// ============================================================
exports.main = async (event) => {
  const { fields, object, origin } = event;

  // Return enriched payload for your webhook
  return {
    // Original input fields
    ...fields,

    // Add metadata
    timestamp: new Date().toISOString(),
    source: 'hubspot-workflow',

    // Add CRM object info
    recordId: object.objectId,
    recordType: object.objectType,

    // Add portal context
    portalId: origin.portalId,

    // Normalize data
    email: fields.email_address?.toLowerCase(),
  };
};

// ============================================================
// TEMPLATE 2: Conditional Logic
// ============================================================
/*
exports.main = async (event) => {
  const { fields, object } = event;

  // Apply business logic
  let urgency = 'normal';
  if (fields.priority === 'high' || object.properties.lifecyclestage === 'customer') {
    urgency = 'elevated';
  }

  return {
    ...fields,
    urgency,
    is_customer: object.properties.lifecyclestage === 'customer',
    company_domain: fields.email_address?.split('@')[1],
  };
};
*/

// ============================================================
// TEMPLATE 3: Data Transformation
// ============================================================
/*
exports.main = async (event) => {
  const { fields, object } = event;

  // Transform to external API format
  return {
    contact: {
      id: object.objectId,
      email: fields.email_address,
      name: `${object.properties.firstname || ''} ${object.properties.lastname || ''}`.trim(),
    },
    action: {
      type: fields.action_type,
      parameters: {
        priority: fields.priority || 'medium',
        message: fields.message,
      },
    },
    metadata: {
      triggered_at: new Date().toISOString(),
      workflow_source: 'hubspot',
    },
  };
};
*/

// ============================================================
// TEMPLATE 4: Validation and Error Prevention
// ============================================================
/*
exports.main = async (event) => {
  const { fields, object } = event;

  // Validate required data
  if (!fields.email_address || !fields.email_address.includes('@')) {
    // Return error indicator for your webhook to handle
    return {
      error: true,
      error_code: 'INVALID_EMAIL',
      error_message: 'Invalid email address format',
    };
  }

  // Check for blocklisted domains
  const domain = fields.email_address.split('@')[1];
  const blocklist = ['test.com', 'example.com', 'invalid.com'];

  if (blocklist.includes(domain)) {
    return {
      skip: true,
      reason: 'Blocklisted domain',
    };
  }

  return {
    ...fields,
    validated: true,
    domain,
  };
};
*/

// ============================================================
// TEMPLATE 5: Secret/Token Injection
// ============================================================
/*
// Note: Use HubSpot secrets for sensitive data
exports.main = async (event, context) => {
  const { fields } = event;

  // Access secrets (configure in HubSpot app settings)
  const apiKey = context.secrets?.EXTERNAL_API_KEY || '';

  return {
    ...fields,
    auth: {
      api_key: apiKey,
      timestamp: Date.now(),
    },
  };
};
*/

// ============================================================
// TEMPLATE 6: Async Data Fetching (with caution)
// ============================================================
/*
const https = require('https');

exports.main = async (event) => {
  const { fields, object } = event;

  // Fetch additional data (be mindful of timeouts)
  const enrichmentData = await fetchEnrichment(fields.email_address);

  return {
    ...fields,
    enrichment: enrichmentData,
    recordId: object.objectId,
  };
};

function fetchEnrichment(email) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.example.com/enrich?email=${encodeURIComponent(email)}`,
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ error: 'Parse error' });
          }
        });
      }
    );
    req.on('error', () => resolve({ error: 'Fetch failed' }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ error: 'Timeout' });
    });
  });
}
*/
