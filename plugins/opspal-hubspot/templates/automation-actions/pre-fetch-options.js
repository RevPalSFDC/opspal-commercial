/**
 * PRE_FETCH_OPTIONS Function Template
 *
 * This function runs BEFORE fetching options from your optionsUrl.
 * Use it to:
 * - Customize the request to your options endpoint
 * - Add authentication headers
 * - Filter or scope options based on context
 * - Add query parameters dynamically
 *
 * INPUT (event object):
 * {
 *   fieldDefinition: {
 *     // The field requesting options
 *     name: "data_source",
 *     type: "enumeration"
 *   },
 *   optionsUrl: "https://your-api.com/options",
 *   object: {
 *     // The CRM record (if available)
 *     objectType: "CONTACT",
 *     objectId: "12345"
 *   },
 *   origin: {
 *     portalId: 12345
 *   }
 * }
 *
 * OUTPUT:
 * Return the modified request configuration:
 * {
 *   url: "modified-url",        // Optional: modify the URL
 *   headers: {},                // Optional: add headers
 *   queryParams: {},            // Optional: add query params
 *   body: {}                    // Optional: request body (for POST)
 * }
 *
 * EXAMPLES:
 * - See templates below for common patterns
 */

// ============================================================
// TEMPLATE 1: Add Query Parameters
// ============================================================
exports.main = async (event) => {
  const { object, origin } = event;

  return {
    queryParams: {
      portal_id: origin.portalId,
      record_type: object?.objectType,
      record_id: object?.objectId,
      timestamp: Date.now(),
    },
  };
};

// ============================================================
// TEMPLATE 2: Add Authentication Headers
// ============================================================
/*
exports.main = async (event, context) => {
  // Access secrets configured in HubSpot app settings
  const apiKey = context.secrets?.EXTERNAL_API_KEY || '';

  return {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Source': 'hubspot-workflow',
      'X-Portal-ID': String(event.origin.portalId),
    },
  };
};
*/

// ============================================================
// TEMPLATE 3: Contextual URL Modification
// ============================================================
/*
exports.main = async (event) => {
  const { object, fieldDefinition } = event;

  // Modify URL based on object type
  let endpoint = 'general';
  if (object?.objectType === 'DEAL') {
    endpoint = 'deals';
  } else if (object?.objectType === 'CONTACT') {
    endpoint = 'contacts';
  }

  return {
    url: `https://api.example.com/options/${endpoint}`,
    queryParams: {
      field: fieldDefinition.name,
    },
  };
};
*/

// ============================================================
// TEMPLATE 4: Filter Options by Context
// ============================================================
/*
exports.main = async (event) => {
  const { object, origin } = event;

  // Pass context so server can filter options
  return {
    queryParams: {
      portal_id: origin.portalId,
      object_type: object?.objectType,
      // Only show options relevant to this record type
      filter_by_context: true,
    },
    headers: {
      'Accept-Language': 'en-US',
    },
  };
};
*/

// ============================================================
// TEMPLATE 5: POST Request with Body
// ============================================================
/*
exports.main = async (event) => {
  const { object, origin, fieldDefinition } = event;

  // For endpoints that expect POST requests
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      request_type: 'get_options',
      field_name: fieldDefinition.name,
      context: {
        portal_id: origin.portalId,
        object_type: object?.objectType,
        object_id: object?.objectId,
      },
    },
  };
};
*/

// ============================================================
// TEMPLATE 6: Conditional Options Source
// ============================================================
/*
exports.main = async (event) => {
  const { object, fieldDefinition } = event;

  // Use different endpoints based on field
  const endpoints = {
    'product_type': 'https://api.example.com/products',
    'region': 'https://api.example.com/regions',
    'team': 'https://api.example.com/teams',
  };

  const url = endpoints[fieldDefinition.name] || event.optionsUrl;

  return {
    url,
    queryParams: {
      active_only: true,
    },
  };
};
*/
