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

// Token cache
let tokenCache = {
  accessToken: null,
  expiresAt: null,
  instanceInfo: null
};

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
  const token = await getAccessToken();

  const url = `${config.baseUrl}${endpoint}`;

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

  const response = await fetch(url, fetchOptions);
  const data = await response.json();

  // Check for Marketo API errors
  if (!data.success && data.errors) {
    const error = data.errors[0];

    // Token expired - refresh and retry once
    if (error.code === '601' || error.code === '602') {
      tokenCache.accessToken = null;
      tokenCache.expiresAt = null;

      const newToken = await refreshToken();
      fetchOptions.headers['Authorization'] = `Bearer ${newToken}`;

      const retryResponse = await fetch(url, fetchOptions);
      return await retryResponse.json();
    }

    throw new Error(`Marketo API error [${error.code}]: ${error.message}`);
  }

  return data;
}

/**
 * Get current token info (for debugging/status)
 * @returns {Object} Token info
 */
export function getTokenInfo() {
  return {
    hasToken: !!tokenCache.accessToken,
    expiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null,
    expiresIn: tokenCache.expiresAt ? Math.max(0, Math.floor((tokenCache.expiresAt - Date.now()) / 1000)) : 0,
    instanceInfo: tokenCache.instanceInfo
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
  getAccessToken,
  refreshToken,
  apiRequest,
  getTokenInfo,
  clearTokenCache,
  isTokenExpired
};
