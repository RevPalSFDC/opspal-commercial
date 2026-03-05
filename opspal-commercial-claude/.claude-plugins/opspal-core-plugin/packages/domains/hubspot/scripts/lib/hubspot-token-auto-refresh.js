#!/usr/bin/env node

/**
 * HubSpot Token Auto-Refresh Wrapper
 *
 * Automatically detects expired OAuth tokens (401 errors) and refreshes them
 * before retrying the failed API call. Use this wrapper for all HubSpot API operations.
 *
 * Usage:
 *   const { withAutoRefresh } = require('./hubspot-token-auto-refresh');
 *
 *   const hubspot = require('@hubspot/api-client');
 *   const client = new hubspot.Client({ accessToken: token });
 *
 *   // Wrap API calls
 *   const contacts = await withAutoRefresh(
 *     () => client.crm.contacts.getAll(),
 *     'rentable'
 *   );
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Check if error is an expired token (401)
 * @param {Error} error - API error
 * @returns {boolean} True if token expired
 */
function isTokenExpiredError(error) {
  if (!error) return false;

  // Check HTTP status code
  if (error.statusCode === 401 || error.code === 401) {
    return true;
  }

  // Check error message patterns
  const message = error.message || error.toString();
  const expiredPatterns = [
    /token.*expired/i,
    /401.*unauthorized/i,
    /expired.*authentication/i,
    /oauth.*expired/i
  ];

  return expiredPatterns.some(pattern => pattern.test(message));
}

/**
 * Refresh OAuth token for a portal
 * @param {string} portalName - Portal name from config
 * @returns {Promise<string>} New access token
 */
async function refreshToken(portalName) {
  const tokenManagerPath = path.join(__dirname, '../hubspot-token-manager.js');

  if (!fs.existsSync(tokenManagerPath)) {
    throw new Error(`Token manager not found: ${tokenManagerPath}`);
  }

  console.log(`🔄 Refreshing token for portal: ${portalName}`);

  try {
    // Run token refresh
    const output = execSync(`node "${tokenManagerPath}" refresh ${portalName}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Extract new token from output
    const tokenMatch = output.match(/Access Token: (.+)/);
    if (!tokenMatch) {
      throw new Error('Failed to extract new token from refresh output');
    }

    const newToken = tokenMatch[1].trim();
    console.log('✅ Token refreshed successfully');

    return newToken;

  } catch (error) {
    console.error('❌ Token refresh failed:', error.message);
    throw new Error(`Token refresh failed for portal ${portalName}: ${error.message}`);
  }
}

/**
 * Get current access token for portal
 * @param {string} portalName - Portal name from config
 * @returns {string} Access token
 */
function getPortalToken(portalName) {
  const configPath = path.join(__dirname, '../../portals/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!config.portals[portalName]) {
    throw new Error(`Portal not found in config: ${portalName}`);
  }

  return config.portals[portalName].accessToken || config.portals[portalName].apiKey;
}

/**
 * Update portal token in config
 * @param {string} portalName - Portal name
 * @param {string} newToken - New access token
 */
function updatePortalToken(portalName, newToken) {
  const configPath = path.join(__dirname, '../../portals/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!config.portals[portalName]) {
    throw new Error(`Portal not found in config: ${portalName}`);
  }

  config.portals[portalName].accessToken = newToken;
  config.portals[portalName].apiKey = newToken;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`💾 Updated token in config for: ${portalName}`);
}

/**
 * Wrap API call with automatic token refresh on 401 errors
 *
 * @param {Function} apiCall - Async function that makes HubSpot API call
 * @param {string} portalName - Portal name from config
 * @param {Object} options - Options
 * @param {number} options.maxRetries - Max retry attempts (default: 1)
 * @param {Function} options.onRefresh - Callback after token refresh (receives new token)
 * @returns {Promise<any>} API call result
 *
 * @example
 * const contacts = await withAutoRefresh(
 *   async () => {
 *     return await client.crm.contacts.getAll();
 *   },
 *   'rentable',
 *   {
 *     onRefresh: (newToken) => {
 *       client.setAccessToken(newToken);
 *     }
 *   }
 * );
 */
async function withAutoRefresh(apiCall, portalName, options = {}) {
  const { maxRetries = 1, onRefresh } = options;
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      // Execute API call
      return await apiCall();

    } catch (error) {
      // Check if token expired
      if (isTokenExpiredError(error) && retries < maxRetries) {
        console.warn(`⚠️  Token expired error detected (attempt ${retries + 1}/${maxRetries + 1})`);

        // Refresh token
        const newToken = await refreshToken(portalName);

        // Update config
        updatePortalToken(portalName, newToken);

        // Call refresh callback if provided
        if (onRefresh) {
          onRefresh(newToken);
        }

        retries++;
        console.log(`🔄 Retrying API call with new token...`);

      } else {
        // Not a token error or max retries exceeded
        throw error;
      }
    }
  }

  throw new Error(`API call failed after ${maxRetries + 1} attempts`);
}

/**
 * Create a HubSpot client with auto-refresh capability
 * @param {string} portalName - Portal name from config
 * @returns {Object} HubSpot client with wrapped methods
 *
 * @example
 * const client = createAutoRefreshClient('rentable');
 * const contacts = await client.crm.contacts.getAll();
 */
function createAutoRefreshClient(portalName) {
  const hubspot = require('@hubspot/api-client');
  const token = getPortalToken(portalName);

  const client = new hubspot.Client({ accessToken: token });

  // Create proxy to wrap all API calls
  return new Proxy(client, {
    get(target, prop) {
      const value = target[prop];

      // If it's a function, wrap it with auto-refresh
      if (typeof value === 'function') {
        return function(...args) {
          return withAutoRefresh(
            () => value.apply(target, args),
            portalName,
            {
              onRefresh: (newToken) => {
                target.setAccessToken(newToken);
              }
            }
          );
        };
      }

      // If it's an object (like crm, contacts, etc.), recursively proxy
      if (typeof value === 'object' && value !== null) {
        return new Proxy(value, {
          get(subTarget, subProp) {
            const subValue = subTarget[subProp];

            if (typeof subValue === 'function') {
              return function(...args) {
                return withAutoRefresh(
                  () => subValue.apply(subTarget, args),
                  portalName,
                  {
                    onRefresh: (newToken) => {
                      target.setAccessToken(newToken);
                    }
                  }
                );
              };
            }

            return subValue;
          }
        });
      }

      return value;
    }
  });
}

/**
 * Check if token is close to expiring (< 12 hours)
 * @param {string} portalName - Portal name
 * @returns {boolean} True if token should be refreshed proactively
 */
function shouldRefreshProactively(portalName) {
  const configPath = path.join(__dirname, '../../portals/config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const portal = config.portals[portalName];
  if (!portal || !portal.refreshToken) {
    return false; // Can't refresh without refresh token
  }

  // Check token cache file
  const cacheDir = path.join(__dirname, '../../.token-cache');
  const cacheFile = path.join(cacheDir, `${portalName}.json`);

  if (!fs.existsSync(cacheFile)) {
    return false; // No cache info
  }

  try {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const expiresAt = new Date(cache.expiresAt);
    const now = new Date();
    const hoursUntilExpiry = (expiresAt - now) / (1000 * 60 * 60);

    // Refresh if < 12 hours until expiry
    return hoursUntilExpiry < 12;

  } catch (error) {
    console.warn('Could not read token cache:', error.message);
    return false;
  }
}

// Export functions
module.exports = {
  withAutoRefresh,
  createAutoRefreshClient,
  refreshToken,
  isTokenExpiredError,
  getPortalToken,
  updatePortalToken,
  shouldRefreshProactively
};

// CLI usage
if (require.main === module) {
  const portalName = process.argv[2];

  if (!portalName) {
    console.error('Usage: node hubspot-token-auto-refresh.js <portal-name>');
    process.exit(1);
  }

  // Test token refresh
  refreshToken(portalName)
    .then(() => {
      console.log('✅ Token refresh test successful');
    })
    .catch(error => {
      console.error('❌ Token refresh test failed:', error.message);
      process.exit(1);
    });
}
