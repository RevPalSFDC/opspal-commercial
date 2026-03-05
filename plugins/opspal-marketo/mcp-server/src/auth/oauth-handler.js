/**
 * Marketo OAuth Handler
 *
 * Manages OAuth 2.0 client credentials flow for Marketo API.
 * Marketo uses client_id + client_secret to obtain access tokens.
 * Tokens typically expire after 1 hour (3600 seconds).
 *
 * @module oauth-handler
 * @version 1.0.0
 */

import { getPolicyGateway } from '../lib/policy-gateway.js';

// Token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null,
  instanceInfo: null
};

function toMarketoError({ code, message, endpoint, status, errors, requestId }) {
  const error = new Error(`Marketo API error [${code}]: ${message}`);
  error.code = String(code);
  error.endpoint = endpoint;
  error.status = status;
  error.errors = errors;
  error.requestId = requestId;
  return error;
}

function parseErrorBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === 'object') return rawBody;

  try {
    return JSON.parse(rawBody);
  } catch {
    return { raw: rawBody };
  }
}

function isJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json');
}

/**
 * Get Marketo configuration from environment
 * @returns {Object} Marketo config
 */
export function getConfig() {
  const clientId = process.env.MARKETO_CLIENT_ID;
  const clientSecret = process.env.MARKETO_CLIENT_SECRET;
  const baseUrl = process.env.MARKETO_BASE_URL;
  const munchkinId = process.env.MARKETO_MUNCHKIN_ID;

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error(
      'Missing required Marketo configuration. ' +
      'Required: MARKETO_CLIENT_ID, MARKETO_CLIENT_SECRET, MARKETO_BASE_URL'
    );
  }

  // Normalize base URL (remove trailing slash)
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  // Identity endpoint is at the same base URL
  const identityUrl = `${normalizedBaseUrl}/identity`;

  return {
    clientId,
    clientSecret,
    baseUrl: normalizedBaseUrl,
    identityUrl,
    munchkinId: munchkinId || extractMunchkinId(normalizedBaseUrl)
  };
}

/**
 * Get Marketo base URL from normalized configuration.
 * Exported for compatibility with older tool modules.
 * @returns {string} Base URL
 */
export function getBaseUrl() {
  return getConfig().baseUrl;
}

/**
 * Get Marketo identity URL from normalized configuration.
 * @returns {string} Identity URL
 */
export function getIdentityUrl() {
  return getConfig().identityUrl;
}

/**
 * Extract Munchkin ID from base URL
 * @param {string} baseUrl - Marketo base URL
 * @returns {string|null} Munchkin ID
 */
function extractMunchkinId(baseUrl) {
  // URL format: https://123-ABC-456.mktorest.com
  const match = baseUrl.match(/https?:\/\/(\d{3}-\w{3}-\d{3})/);
  return match ? match[1] : null;
}

/**
 * Check if token is expired or will expire soon
 * @param {number} bufferSeconds - Buffer before expiration (default: 300 = 5 minutes)
 * @returns {boolean} True if token needs refresh
 */
export function isTokenExpired(bufferSeconds = 300) {
  if (!tokenCache.accessToken || !tokenCache.expiresAt) {
    return true;
  }

  const now = Date.now();
  const expiresAt = tokenCache.expiresAt;
  const bufferMs = bufferSeconds * 1000;

  return now >= (expiresAt - bufferMs);
}

/**
 * Get access token, refreshing if necessary
 * @returns {Promise<string>} Access token
 */
export async function getAccessToken() {
  if (!isTokenExpired()) {
    return tokenCache.accessToken;
  }

  return await refreshToken();
}

/**
 * Refresh the access token
 * @returns {Promise<string>} New access token
 */
export async function refreshToken() {
  const config = getConfig();

  const tokenUrl = `${config.identityUrl}/oauth/token?grant_type=client_credentials&client_id=${config.clientId}&client_secret=${config.clientSecret}`;

  try {
    const response = await fetch(tokenUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Marketo OAuth error: ${data.error} - ${data.error_description}`);
    }

    // Cache the token
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = Date.now() + (data.expires_in * 1000);
    tokenCache.instanceInfo = {
      scope: data.scope,
      tokenType: data.token_type
    };

    return data.access_token;

  } catch (error) {
    // Clear cache on error
    tokenCache.accessToken = null;
    tokenCache.expiresAt = null;
    throw error;
  }
}

/**
 * Make an authenticated API request to Marketo
 * @param {string} endpoint - API endpoint (e.g., '/rest/v1/leads.json')
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API response
 */
export async function apiRequest(endpoint, options = {}) {
  const config = getConfig();
  const policy = getPolicyGateway();
  const url = `${config.baseUrl}${endpoint}`;

  return policy.execute(async () => {
    let token = await getAccessToken();
    let shouldRetryWithRefresh = true;

    while (true) {
      const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      const fetchOptions = {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers
        }
      };

      let response;
      try {
        response = await fetch(url, fetchOptions);
        policy.recordHeaders(response.headers);
      } catch (error) {
        error.endpoint = endpoint;
        throw error;
      }

      const body = isJsonResponse(response)
        ? await response.json()
        : parseErrorBody(await response.text());

      if (!response.ok) {
        const bodyErrors = body?.errors || [];
        const bodyError = bodyErrors[0] || {};
        const code = bodyError.code || `HTTP_${response.status}`;
        const message = bodyError.message || body.error || response.statusText || 'HTTP request failed';

        if ((code === '601' || code === '602') && shouldRetryWithRefresh) {
          tokenCache.accessToken = null;
          tokenCache.expiresAt = null;
          token = await refreshToken();
          shouldRetryWithRefresh = false;
          continue;
        }

        throw toMarketoError({
          code,
          message,
          endpoint,
          status: response.status,
          errors: bodyErrors,
          requestId: body.requestId
        });
      }

      // Marketo frequently returns HTTP 200 with success=false.
      if (body && body.success === false) {
        const bodyError = body.errors?.[0] || {};
        const code = String(bodyError.code || 'UNKNOWN');
        const message = bodyError.message || 'Unknown Marketo business error';

        if ((code === '601' || code === '602') && shouldRetryWithRefresh) {
          tokenCache.accessToken = null;
          tokenCache.expiresAt = null;
          token = await refreshToken();
          shouldRetryWithRefresh = false;
          continue;
        }

        throw toMarketoError({
          code,
          message,
          endpoint,
          status: response.status,
          errors: body.errors,
          requestId: body.requestId
        });
      }

      return body;
    }
  }, { endpoint, apiType: 'rest' });
}

/**
 * Make an authenticated API request to Marketo Bulk API
 * Bulk API uses /bulk/v1/ endpoint and may return text (CSV) responses
 * @param {string} endpoint - Bulk API endpoint (e.g., '/bulk/v1/leads/export/create.json')
 * @param {Object} options - Fetch options
 * @returns {Promise<Object|string>} API response (JSON or text based on responseType)
 */
export async function bulkApiRequest(endpoint, options = {}) {
  const config = getConfig();
  const policy = getPolicyGateway();
  const url = `${config.baseUrl}${endpoint}`;
  const responseType = options.responseType || 'json';

  return policy.execute(async () => {
    let token = await getAccessToken();
    let shouldRetryWithRefresh = true;

    while (true) {
      const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': options.headers?.['Content-Type'] || 'application/json',
        'Accept': responseType === 'text' ? 'text/csv' : 'application/json'
      };

      const fetchOptions = {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers
        }
      };
      delete fetchOptions.responseType;

      let response;
      try {
        response = await fetch(url, fetchOptions);
        policy.recordHeaders(response.headers);
      } catch (error) {
        error.endpoint = endpoint;
        throw error;
      }

      // File downloads do not return Marketo JSON envelopes.
      if (responseType === 'text') {
        if (!response.ok) {
          const raw = await response.text();
          const parsed = parseErrorBody(raw);
          const error = parsed?.errors?.[0] || {};
          throw toMarketoError({
            code: error.code || `HTTP_${response.status}`,
            message: error.message || raw || response.statusText,
            endpoint,
            status: response.status,
            errors: parsed?.errors,
            requestId: parsed?.requestId
          });
        }
        return await response.text();
      }

      const body = isJsonResponse(response)
        ? await response.json()
        : parseErrorBody(await response.text());

      if (!response.ok) {
        const bodyError = body?.errors?.[0] || {};
        const code = String(bodyError.code || `HTTP_${response.status}`);
        const message = bodyError.message || body?.error || response.statusText || 'Bulk request failed';

        if ((code === '601' || code === '602') && shouldRetryWithRefresh) {
          tokenCache.accessToken = null;
          tokenCache.expiresAt = null;
          token = await refreshToken();
          shouldRetryWithRefresh = false;
          continue;
        }

        throw toMarketoError({
          code,
          message,
          endpoint,
          status: response.status,
          errors: body?.errors,
          requestId: body?.requestId
        });
      }

      if (body && body.success === false) {
        const bodyError = body.errors?.[0] || {};
        const code = String(bodyError.code || 'UNKNOWN');
        const message = bodyError.message || 'Unknown Marketo bulk error';

        if ((code === '601' || code === '602') && shouldRetryWithRefresh) {
          tokenCache.accessToken = null;
          tokenCache.expiresAt = null;
          token = await refreshToken();
          shouldRetryWithRefresh = false;
          continue;
        }

        throw toMarketoError({
          code,
          message,
          endpoint,
          status: response.status,
          errors: body.errors,
          requestId: body.requestId
        });
      }

      return body;
    }
  }, { endpoint, apiType: 'bulk', responseType });
}

/**
 * Get current token info (for debugging/status)
 * @returns {Object} Token info
 */
export function getTokenInfo() {
  const policyStats = getPolicyGateway().getStats();
  return {
    hasToken: !!tokenCache.accessToken,
    expiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null,
    expiresIn: tokenCache.expiresAt ? Math.max(0, Math.floor((tokenCache.expiresAt - Date.now()) / 1000)) : 0,
    instanceInfo: tokenCache.instanceInfo,
    authenticationMode: 'Authorization header (Bearer)',
    queryParameterTokenAuth: {
      supported: false,
      deprecatedAfter: '2026-03-31'
    },
    policy: policyStats
  };
}

/**
 * Clear the token cache (force re-authentication)
 */
export function clearTokenCache() {
  tokenCache.accessToken = null;
  tokenCache.expiresAt = null;
  tokenCache.instanceInfo = null;
}

export default {
  getConfig,
  getBaseUrl,
  getIdentityUrl,
  getAccessToken,
  refreshToken,
  apiRequest,
  bulkApiRequest,
  getTokenInfo,
  clearTokenCache,
  isTokenExpired
};
