#!/usr/bin/env node

/**
 * HubSpot CMS Pages Manager
 *
 * Comprehensive HubSpot CMS Pages API operations (CRUD)
 * Supports both website pages (site-pages) and landing pages (landing-pages)
 *
 * Features:
 * - Create, read, update, clone, delete pages
 * - Automatic pagination for list operations
 * - Template validation
 * - Slug conflict detection
 * - Batch operations with rate limiting
 * - No fake data generation (fails fast on errors)
 *
 * Usage:
 *   const manager = new HubSpotCMSPagesManager({
 *     accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
 *     portalId: process.env.HUBSPOT_PORTAL_ID,
 *     pageType: 'landing-pages' // or 'site-pages'
 *   });
 *
 *   const page = await manager.createPage({ name, slug, ... });
 */

const https = require('https');
const { URL } = require('url');

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 150; // HubSpot Professional tier: 150 requests/10 seconds
const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const BATCH_SIZE = 10; // Process in batches to avoid overwhelming API

class DataAccessError extends Error {
  constructor(source, message, context = {}) {
    super(`[${source}] ${message}`);
    this.name = 'DataAccessError';
    this.source = source;
    this.context = context;
  }
}

class HubSpotCMSPagesManager {
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;
    this.pageType = options.pageType || 'landing-pages'; // 'landing-pages' or 'site-pages'

    if (!this.accessToken) {
      throw new DataAccessError('HubSpotCMSPagesManager', 'Missing HUBSPOT_ACCESS_TOKEN');
    }

    if (!this.portalId) {
      throw new DataAccessError('HubSpotCMSPagesManager', 'Missing HUBSPOT_PORTAL_ID');
    }

    // Rate limiting state
    this.requestQueue = [];
    this.requestTimestamps = [];

    // Cache for template validation (1 hour TTL)
    this.templateCache = new Map();
    this.templateCacheTTL = 3600000; // 1 hour
  }

  /**
   * Make authenticated HTTPS request to HubSpot API
   */
  async request(method, path, body = null, queryParams = {}) {
    // Rate limiting
    await this.waitForRateLimit();

    // Build URL with query params
    const url = new URL(`https://api.hubapi.com${path}`);
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] !== undefined && queryParams[key] !== null) {
        url.searchParams.append(key, queryParams[key]);
      }
    });

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          // Track request for rate limiting
          this.requestTimestamps.push(Date.now());

          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = data ? JSON.parse(data) : null;
              resolve(parsed);
            } catch (err) {
              reject(new DataAccessError('HubSpot API', `Failed to parse response: ${err.message}`, { statusCode: res.statusCode }));
            }
          } else if (res.statusCode === 204) {
            // No content (successful delete)
            resolve(null);
          } else if (res.statusCode === 429) {
            // Rate limit exceeded
            reject(new DataAccessError('HubSpot API', 'Rate limit exceeded', { statusCode: 429 }));
          } else {
            try {
              const errorData = data ? JSON.parse(data) : {};
              reject(new DataAccessError('HubSpot API', errorData.message || `HTTP ${res.statusCode}`, {
                statusCode: res.statusCode,
                error: errorData
              }));
            } catch (err) {
              reject(new DataAccessError('HubSpot API', `HTTP ${res.statusCode}: ${data}`, { statusCode: res.statusCode }));
            }
          }
        });
      });

      req.on('error', (err) => {
        reject(new DataAccessError('HubSpot API', `Request failed: ${err.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Rate limiting: Wait if we've exceeded limits
   */
  async waitForRateLimit() {
    const now = Date.now();

    // Clean up old timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < RATE_LIMIT_WINDOW
    );

    // If we've hit the limit, wait
    if (this.requestTimestamps.length >= RATE_LIMIT_REQUESTS) {
      const oldestRequest = Math.min(...this.requestTimestamps);
      const waitTime = RATE_LIMIT_WINDOW - (now - oldestRequest);

      if (waitTime > 0) {
        console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Validate required fields for page creation
   */
  validatePageData(pageData) {
    const required = ['name', 'slug'];
    const missing = required.filter(field => !pageData[field]);

    if (missing.length > 0) {
      throw new DataAccessError('Validation', `Missing required fields: ${missing.join(', ')}`, { pageData });
    }

    // Validate slug format (URL-friendly)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(pageData.slug)) {
      throw new DataAccessError('Validation', 'Slug must be lowercase alphanumeric with hyphens only', { slug: pageData.slug });
    }
  }

  /**
   * Create new page
   * @param {Object} pageData - Page configuration
   * @returns {Promise<Object>} Created page object
   */
  async createPage(pageData) {
    this.validatePageData(pageData);

    const path = `/cms/v3/pages/${this.pageType}`;

    // Set defaults
    const payload = {
      name: pageData.name,
      slug: pageData.slug,
      language: pageData.language || 'en',
      domain: pageData.domain || null, // null uses primary domain
      templatePath: pageData.templatePath,
      publishImmediately: pageData.publishImmediately || false,
      publishDate: pageData.publishDate || null,
      widgets: pageData.widgets || {},
      metaDescription: pageData.metaDescription || '',
      htmlTitle: pageData.htmlTitle || pageData.name,
      ...pageData // Include any additional fields
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Page created: ${result.name} (ID: ${result.id})`);
      return result;
    } catch (error) {
      throw new DataAccessError('createPage', `Failed to create page: ${error.message}`, { pageData, originalError: error });
    }
  }

  /**
   * Retrieve single page by ID
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} Page object
   */
  async getPage(pageId) {
    const path = `/cms/v3/pages/${this.pageType}/${pageId}`;

    try {
      return await this.request('GET', path);
    } catch (error) {
      throw new DataAccessError('getPage', `Failed to retrieve page ${pageId}: ${error.message}`, { pageId });
    }
  }

  /**
   * List pages with filtering
   * @param {Object} filters - Filter options (limit, createdAfter, createdBefore, updatedAfter, sort, archived)
   * @returns {Promise<Object>} Paginated results { results, paging }
   */
  async listPages(filters = {}) {
    const path = `/cms/v3/pages/${this.pageType}`;

    const queryParams = {
      limit: filters.limit || 100,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
      updatedAfter: filters.updatedAfter,
      sort: filters.sort || 'createdAt',
      archived: filters.archived || false,
      after: filters.after // Pagination cursor
    };

    try {
      return await this.request('GET', path, null, queryParams);
    } catch (error) {
      throw new DataAccessError('listPages', `Failed to list pages: ${error.message}`, { filters });
    }
  }

  /**
   * Get all pages (handles pagination automatically)
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of all pages
   */
  async getAllPages(filters = {}) {
    let allPages = [];
    let after = null;

    console.log(`📦 Fetching all ${this.pageType}...`);

    do {
      const result = await this.listPages({ ...filters, after });
      allPages = allPages.concat(result.results || []);

      after = result.paging?.next?.after || null;

      if (after) {
        console.log(`   Fetched ${allPages.length} pages, continuing...`);
      }
    } while (after);

    console.log(`✅ Retrieved ${allPages.length} total pages`);
    return allPages;
  }

  /**
   * Update existing page (PATCH - sparse updates)
   * @param {string} pageId - Page ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated page object
   */
  async updatePage(pageId, updates) {
    const path = `/cms/v3/pages/${this.pageType}/${pageId}`;

    try {
      const result = await this.request('PATCH', path, updates);
      console.log(`✅ Page updated: ${pageId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('updatePage', `Failed to update page ${pageId}: ${error.message}`, { pageId, updates });
    }
  }

  /**
   * Clone existing page
   * @param {string} pageId - Source page ID
   * @param {string} cloneName - Name for the cloned page
   * @returns {Promise<Object>} Cloned page object (draft state)
   */
  async clonePage(pageId, cloneName) {
    const path = `/cms/v3/pages/${this.pageType}/clone`;

    const payload = {
      id: pageId,
      cloneName: cloneName
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Page cloned: ${cloneName} (ID: ${result.id})`);
      return result;
    } catch (error) {
      throw new DataAccessError('clonePage', `Failed to clone page ${pageId}: ${error.message}`, { pageId, cloneName });
    }
  }

  /**
   * Delete page (hard delete/archive)
   * @param {string} pageId - Page ID to delete
   * @returns {Promise<Object>} Delete status result
   */
  async deletePage(pageId) {
    const path = `/cms/v3/pages/${this.pageType}/${pageId}`;

    try {
      const result = await this.request('DELETE', path);
      console.log(`✅ Page deleted: ${pageId}`);
      return result || { status: 'DELETED' };
    } catch (error) {
      throw new DataAccessError('deletePage', `Failed to delete page ${pageId}: ${error.message}`, { pageId });
    }
  }

  /**
   * Soft archive page (dashboard archive, doesn't unpublish)
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} Updated page object
   */
  async archivePage(pageId) {
    return await this.updatePage(pageId, { archivedInDashboard: true });
  }

  /**
   * Restore page from archive
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} Updated page object
   */
  async restorePage(pageId) {
    return await this.updatePage(pageId, { archivedInDashboard: false });
  }

  /**
   * Get page by slug
   * @param {string} slug - Page slug
   * @returns {Promise<Object|null>} Page object or null if not found
   */
  async getPageBySlug(slug) {
    try {
      const pages = await this.getAllPages();
      return pages.find(page => page.slug === slug) || null;
    } catch (error) {
      throw new DataAccessError('getPageBySlug', `Failed to find page by slug ${slug}: ${error.message}`, { slug });
    }
  }

  /**
   * Validate template exists in Design Manager
   * @param {string} templatePath - Template path (e.g., "templates/landing-page.html")
   * @returns {Promise<Object>} { exists: boolean, template: {...} }
   */
  async validateTemplate(templatePath) {
    // Check cache first
    const cached = this.templateCache.get(templatePath);
    if (cached && Date.now() - cached.timestamp < this.templateCacheTTL) {
      return cached.result;
    }

    const path = '/content/api/v2/templates';
    const queryParams = { path: templatePath };

    try {
      const result = await this.request('GET', path, null, queryParams);
      const exists = result.objects && result.objects.length > 0;

      const validationResult = {
        exists,
        template: exists ? result.objects[0] : null
      };

      // Cache result
      this.templateCache.set(templatePath, {
        result: validationResult,
        timestamp: Date.now()
      });

      return validationResult;
    } catch (error) {
      throw new DataAccessError('validateTemplate', `Failed to validate template ${templatePath}: ${error.message}`, { templatePath });
    }
  }

  /**
   * Batch create pages with rate limiting
   * @param {Array<Object>} pagesData - Array of page data objects
   * @returns {Promise<Array>} Array of results { success, page?, error? }
   */
  async batchCreatePages(pagesData) {
    console.log(`📦 Batch creating ${pagesData.length} pages...`);

    const results = [];

    // Process in batches
    for (let i = 0; i < pagesData.length; i += BATCH_SIZE) {
      const batch = pagesData.slice(i, i + BATCH_SIZE);
      console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pagesData.length / BATCH_SIZE)}`);

      const batchPromises = batch.map(async (pageData) => {
        try {
          const page = await this.createPage(pageData);
          return { success: true, page, name: pageData.name };
        } catch (error) {
          return { success: false, error: error.message, name: pageData.name };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Batch complete: ${successful} created, ${failed} failed`);

    return results;
  }

  /**
   * Batch update pages with rate limiting
   * @param {Array<Object>} updates - Array of { pageId, updates } objects
   * @returns {Promise<Array>} Array of results { success, page?, error? }
   */
  async batchUpdatePages(updates) {
    console.log(`📦 Batch updating ${updates.length} pages...`);

    const results = [];

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updates.length / BATCH_SIZE)}`);

      const batchPromises = batch.map(async ({ pageId, updates: pageUpdates }) => {
        try {
          const page = await this.updatePage(pageId, pageUpdates);
          return { success: true, page, pageId };
        } catch (error) {
          return { success: false, error: error.message, pageId };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Batch complete: ${successful} updated, ${failed} failed`);

    return results;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new HubSpotCMSPagesManager({
    pageType: args.includes('--site-pages') ? 'site-pages' : 'landing-pages'
  });

  (async () => {
    try {
      switch (command) {
        case 'list':
          const pages = await manager.getAllPages();
          console.log(JSON.stringify(pages, null, 2));
          break;

        case 'get':
          const pageId = args[1];
          if (!pageId) throw new Error('Usage: get <pageId>');
          const page = await manager.getPage(pageId);
          console.log(JSON.stringify(page, null, 2));
          break;

        case 'validate-template':
          const templatePath = args[1];
          if (!templatePath) throw new Error('Usage: validate-template <templatePath>');
          const validation = await manager.validateTemplate(templatePath);
          console.log(JSON.stringify(validation, null, 2));
          break;

        case 'create':
          const pageData = JSON.parse(args[1]);
          const created = await manager.createPage(pageData);
          console.log(JSON.stringify(created, null, 2));
          break;

        default:
          console.log('Usage: hubspot-cms-pages-manager.js <command> [args]');
          console.log('Commands:');
          console.log('  list                           - List all pages');
          console.log('  get <pageId>                   - Get page by ID');
          console.log('  validate-template <path>       - Validate template exists');
          console.log('  create <json>                  - Create page from JSON');
          console.log('Options:');
          console.log('  --site-pages                   - Use site-pages instead of landing-pages');
          process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      if (error.context) {
        console.error('Context:', JSON.stringify(error.context, null, 2));
      }
      process.exit(1);
    }
  })();
}

module.exports = HubSpotCMSPagesManager;
