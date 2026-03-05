#!/usr/bin/env node
/**
 * Monday.com GraphQL API Client
 *
 * Fallback layer for operations not covered by the MCP server.
 * Provides direct GraphQL access with robust error handling.
 *
 * Key features:
 * - Rate limit handling (429 + Retry-After)
 * - Complexity budget awareness
 * - Exponential backoff retry
 * - Request/response logging
 *
 * Usage:
 *   const { MondayAPIClient } = require('./monday-api-client');
 *   const client = new MondayAPIClient();
 *   const assets = await client.getItemAssets('1234567890');
 *
 * CLI:
 *   node monday-api-client.js test              # Test API connection
 *   node monday-api-client.js item-assets <id> # Get item file assets
 *   node monday-api-client.js update-assets <id> # Get update file assets
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load config if available
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'monday-config.json');
let config = {
  maxRetries: 3,
  retryDelayMs: 1000,
  urlExpirationMinutes: 60,
  rateLimits: {
    requestsPerMinute: 60,
    complexityBudget: 5000000
  },
  logging: {
    level: 'info',
    includeRequestId: true
  }
};

try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  }
} catch (e) {
  // Use defaults if config not found
}

class MondayAPIClient {
  /**
   * @param {Object} options
   * @param {string} options.apiToken - Monday.com API token (default: env var)
   * @param {number} options.maxRetries - Max retry attempts (default: 3)
   * @param {Object} options.logger - Logger instance (default: console)
   */
  constructor(options = {}) {
    this.apiToken = options.apiToken || process.env.MONDAY_API_TOKEN;
    this.baseUrl = 'api.monday.com';
    this.maxRetries = options.maxRetries || config.maxRetries;
    this.retryDelayMs = options.retryDelayMs || config.retryDelayMs;
    this.logger = options.logger || console;

    if (!this.apiToken) {
      throw new Error('MONDAY_API_TOKEN environment variable is required');
    }
  }

  /**
   * Execute a GraphQL query against Monday.com API
   * @param {string} query - GraphQL query string
   * @param {Object} variables - Query variables
   * @returns {Promise<Object>} - API response data
   */
  async query(query, variables = {}) {
    return this.retryWithBackoff(async () => {
      const response = await this._makeRequest(query, variables);
      return this.validateResponse(response);
    });
  }

  /**
   * Get file assets attached to an item
   * @param {string|number} itemId - Monday.com item ID
   * @returns {Promise<Array>} - Array of asset objects with public_url
   */
  async getItemAssets(itemId) {
    const query = `
      query GetItemAssets($itemId: [ID!]!) {
        items(ids: $itemId) {
          id
          name
          assets {
            id
            name
            file_extension
            file_size
            public_url
            created_at
          }
        }
      }
    `;

    const result = await this.query(query, { itemId: [String(itemId)] });

    if (!result.items || result.items.length === 0) {
      this.logger.warn(`No item found with ID: ${itemId}`);
      return [];
    }

    return result.items[0].assets || [];
  }

  /**
   * Get file assets attached to an update (comment)
   * @param {string|number} updateId - Monday.com update ID
   * @returns {Promise<Array>} - Array of asset objects with public_url
   */
  async getUpdateAssets(updateId) {
    const query = `
      query GetUpdateAssets($updateId: [ID!]!) {
        updates(ids: $updateId) {
          id
          item_id
          body
          assets {
            id
            name
            file_extension
            file_size
            public_url
            created_at
          }
        }
      }
    `;

    const result = await this.query(query, { updateId: [String(updateId)] });

    if (!result.updates || result.updates.length === 0) {
      this.logger.warn(`No update found with ID: ${updateId}`);
      return [];
    }

    return result.updates[0].assets || [];
  }

  /**
   * Get all items from a board with their assets
   * @param {string|number} boardId - Monday.com board ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Max items per page (default: 50)
   * @param {boolean} options.includeUpdates - Include update assets (default: false)
   * @returns {Promise<Array>} - Array of items with assets
   */
  async getBoardItems(boardId, options = {}) {
    const { limit = 50, includeUpdates = false } = options;

    const query = `
      query GetBoardItems($boardId: [ID!]!, $limit: Int!) {
        boards(ids: $boardId) {
          id
          name
          items_page(limit: $limit) {
            cursor
            items {
              id
              name
              assets {
                id
                name
                file_extension
                file_size
                public_url
                created_at
              }
              ${includeUpdates ? `
              updates {
                id
                assets {
                  id
                  name
                  file_extension
                  file_size
                  public_url
                  created_at
                }
              }
              ` : ''}
            }
          }
        }
      }
    `;

    const result = await this.query(query, {
      boardId: [String(boardId)],
      limit
    });

    if (!result.boards || result.boards.length === 0) {
      this.logger.warn(`No board found with ID: ${boardId}`);
      return [];
    }

    return result.boards[0].items_page?.items || [];
  }

  /**
   * Test API connection and permissions
   * @returns {Promise<Object>} - Current user info
   */
  async testConnection() {
    const query = `query { me { id name email } }`;
    const result = await this.query(query);
    return result.me;
  }

  /**
   * Make HTTP request to Monday.com API
   * @private
   */
  _makeRequest(query, variables) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ query, variables });

      const options = {
        hostname: this.baseUrl,
        path: '/v2',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiToken,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          // Handle rate limiting
          if (res.statusCode === 429) {
            const retryAfter = res.headers['retry-after'] || 60;
            reject(new RateLimitError(`Rate limited. Retry after ${retryAfter}s`, retryAfter));
            return;
          }

          // Handle other HTTP errors
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }

          try {
            const parsed = JSON.parse(data);
            // Include request_id for debugging
            if (config.logging.includeRequestId && parsed.extensions?.request_id) {
              this.logger.info(`Request ID: ${parsed.extensions.request_id}`);
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Network error: ${e.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Validate API response and extract data
   * @param {Object} response - Raw API response
   * @returns {Object} - Data portion of response
   * @throws {Error} - If response contains errors
   */
  validateResponse(response) {
    // Monday API returns 200 even for errors - check errors array
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors.map(e => e.message).join('; ');
      const errorCodes = response.errors.map(e => e.extensions?.code).filter(Boolean);

      // Check for complexity budget exhaustion
      if (errorCodes.includes('COMPLEXITY_BUDGET_EXHAUSTED')) {
        throw new ComplexityError('Complexity budget exhausted. Simplify query or wait.');
      }

      throw new Error(`API Error: ${errorMessages}`);
    }

    if (!response.data) {
      throw new Error('No data in API response');
    }

    return response.data;
  }

  /**
   * Execute function with exponential backoff retry
   * @param {Function} fn - Async function to execute
   * @param {number} attempt - Current attempt number
   * @returns {Promise<*>} - Function result
   */
  async retryWithBackoff(fn, attempt = 0) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        this.logger.error(`Max retries (${this.maxRetries}) exceeded`);
        throw error;
      }

      // Handle rate limiting with Retry-After
      if (error instanceof RateLimitError) {
        const waitTime = error.retryAfter * 1000;
        this.logger.warn(`Rate limited. Waiting ${error.retryAfter}s before retry...`);
        await this._sleep(waitTime);
        return this.retryWithBackoff(fn, attempt + 1);
      }

      // Handle complexity errors (wait longer)
      if (error instanceof ComplexityError) {
        const waitTime = 60000; // 1 minute
        this.logger.warn(`Complexity limit hit. Waiting 60s before retry...`);
        await this._sleep(waitTime);
        return this.retryWithBackoff(fn, attempt + 1);
      }

      // Exponential backoff for other errors
      const delay = this.retryDelayMs * Math.pow(2, attempt);
      this.logger.warn(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
      await this._sleep(delay);
      return this.retryWithBackoff(fn, attempt + 1);
    }
  }

  /**
   * Sleep helper
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Custom error for rate limiting
 */
class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = parseInt(retryAfter, 10);
  }
}

/**
 * Custom error for complexity budget exhaustion
 */
class ComplexityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ComplexityError';
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Monday.com API Client CLI

Usage:
  node monday-api-client.js <command> [args]

Commands:
  test                    Test API connection
  item-assets <id>        Get file assets for an item
  update-assets <id>      Get file assets for an update
  board-items <id>        Get all items from a board

Environment:
  MONDAY_API_TOKEN        Required. Your Monday.com API token.
    `);
    process.exit(0);
  }

  try {
    const client = new MondayAPIClient();

    switch (command) {
      case 'test': {
        const user = await client.testConnection();
        console.log('Connection successful!');
        console.log(`Authenticated as: ${user.name} (${user.email})`);
        break;
      }

      case 'item-assets': {
        const itemId = args[1];
        if (!itemId) {
          console.error('Error: Item ID required');
          process.exit(1);
        }
        const assets = await client.getItemAssets(itemId);
        console.log(JSON.stringify(assets, null, 2));
        break;
      }

      case 'update-assets': {
        const updateId = args[1];
        if (!updateId) {
          console.error('Error: Update ID required');
          process.exit(1);
        }
        const assets = await client.getUpdateAssets(updateId);
        console.log(JSON.stringify(assets, null, 2));
        break;
      }

      case 'board-items': {
        const boardId = args[1];
        if (!boardId) {
          console.error('Error: Board ID required');
          process.exit(1);
        }
        const items = await client.getBoardItems(boardId);
        console.log(JSON.stringify(items, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MondayAPIClient,
  RateLimitError,
  ComplexityError
};
