/**
 * HubSpot Serverless Function Template: API Proxy
 *
 * Proxies requests to external APIs while hiding credentials.
 * Useful for accessing third-party APIs from client-side code securely.
 *
 * Secrets required:
 * - EXTERNAL_API_KEY: API key for the external service
 * - EXTERNAL_API_URL: (Optional) Base URL if not hardcoded
 *
 * Usage:
 * 1. Copy to your project's src/app/app.functions/ directory
 * 2. Update serverless.json to register the endpoint
 * 3. Configure secrets in HubSpot portal
 * 4. Deploy with: hs project upload
 */

exports.main = async (context, sendResponse) => {
  const { body, params, headers, secrets, method } = context;

  // Validate required configuration
  if (!secrets.EXTERNAL_API_KEY) {
    console.log('Error: EXTERNAL_API_KEY secret not configured');
    return sendResponse({
      statusCode: 500,
      body: { error: 'Server configuration error' }
    });
  }

  // Base URL for the external API (customize or use secret)
  const baseUrl = secrets.EXTERNAL_API_URL || 'https://api.example.com';

  // Build the target URL
  const endpoint = params.endpoint || '';
  const targetUrl = `${baseUrl}/${endpoint}`;

  try {
    // Prepare request options
    const fetchOptions = {
      method: method || 'GET',
      headers: {
        'Authorization': `Bearer ${secrets.EXTERNAL_API_KEY}`,
        'Content-Type': 'application/json',
        // Forward select headers if needed
        // 'Accept-Language': headers['accept-language'] || 'en',
      }
    };

    // Add body for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    console.log(`Proxying ${method} request to: ${targetUrl}`);

    // Make the request
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    // Handle non-OK responses
    if (!response.ok) {
      console.log(`External API error: ${response.status}`);
      return sendResponse({
        statusCode: response.status,
        body: {
          error: 'External API error',
          details: data.error || data.message || 'Unknown error'
        }
      });
    }

    // Optional: Transform the response
    const transformedData = transformResponse(data, params);

    // Send response with appropriate caching
    sendResponse({
      statusCode: 200,
      body: transformedData,
      headers: {
        'Cache-Control': getCacheControl(method, params),
        'X-Proxy-Source': 'hubspot-serverless'
      }
    });

  } catch (error) {
    console.log('Proxy error:', error.message);

    // Determine if it's a network error or parsing error
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      sendResponse({
        statusCode: 503,
        body: { error: 'External service unavailable' }
      });
    } else {
      sendResponse({
        statusCode: 502,
        body: { error: 'Bad gateway - failed to process external response' }
      });
    }
  }
};

/**
 * Transform the external API response
 * Customize this to filter or reshape data
 */
function transformResponse(data, params) {
  // Example: If data is an array, optionally limit results
  if (Array.isArray(data) && params.limit) {
    data = data.slice(0, parseInt(params.limit, 10));
  }

  // Example: Filter sensitive fields
  if (typeof data === 'object' && data !== null) {
    // Remove fields that shouldn't be exposed
    const sensitiveFields = ['_internal', 'secret', 'apiKey', 'password'];
    sensitiveFields.forEach(field => {
      if (data[field]) delete data[field];
    });
  }

  // Example: Add metadata
  return {
    data: data,
    meta: {
      timestamp: new Date().toISOString(),
      source: 'external-api-proxy'
    }
  };
}

/**
 * Determine appropriate cache control header
 */
function getCacheControl(method, params) {
  // Don't cache write operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return 'no-store';
  }

  // Use custom cache time if specified
  if (params.cache) {
    const cacheSeconds = parseInt(params.cache, 10);
    if (!isNaN(cacheSeconds) && cacheSeconds > 0) {
      return `max-age=${cacheSeconds}`;
    }
  }

  // Default cache for GET requests (5 minutes)
  return 'max-age=300';
}

/**
 * Example endpoint configurations for common APIs
 * Uncomment and customize as needed
 */

/*
// OpenWeather API proxy
const OPENWEATHER_CONFIG = {
  baseUrl: 'https://api.openweathermap.org/data/2.5',
  authParam: 'appid',  // API key goes in query param
};

// GitHub API proxy
const GITHUB_CONFIG = {
  baseUrl: 'https://api.github.com',
  headers: {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'HubSpot-Serverless-Proxy'
  }
};

// Airtable API proxy
const AIRTABLE_CONFIG = {
  baseUrl: 'https://api.airtable.com/v0',
  headerKey: 'Bearer'  // Authorization: Bearer {key}
};
*/
