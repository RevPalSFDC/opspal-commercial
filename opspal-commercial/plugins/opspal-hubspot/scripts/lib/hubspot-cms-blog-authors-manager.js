#!/usr/bin/env node

/**
 * HubSpot CMS Blog Authors Manager
 *
 * Comprehensive HubSpot CMS Blog Authors API operations (CRUD)
 * Supports author profile management and multi-language variants
 *
 * Features:
 * - Create, read, update, delete blog authors
 * - Profile configuration (bio, avatar, social links)
 * - Multi-language support
 * - Search and filtering
 * - Batch operations with rate limiting
 * - No fake data generation (fails fast on errors)
 *
 * Usage:
 *   const manager = new HubSpotCMSBlogAuthorsManager({
 *     accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
 *     portalId: process.env.HUBSPOT_PORTAL_ID
 *   });
 *
 *   const author = await manager.createAuthor({ fullName, slug, bio, ... });
 */

const https = require('https');
const { URL } = require('url');

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 150;
const RATE_LIMIT_WINDOW = 10000;
const BATCH_SIZE = 10;

class DataAccessError extends Error {
  constructor(source, message, context = {}) {
    super(`[${source}] ${message}`);
    this.name = 'DataAccessError';
    this.source = source;
    this.context = context;
  }
}

class HubSpotCMSBlogAuthorsManager {
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;

    if (!this.accessToken) {
      throw new DataAccessError('HubSpotCMSBlogAuthorsManager', 'Missing HUBSPOT_ACCESS_TOKEN');
    }

    if (!this.portalId) {
      throw new DataAccessError('HubSpotCMSBlogAuthorsManager', 'Missing HUBSPOT_PORTAL_ID');
    }

    // Rate limiting state
    this.requestTimestamps = [];
  }

  /**
   * Make authenticated HTTPS request to HubSpot API
   */
  async request(method, path, body = null, queryParams = {}) {
    await this.waitForRateLimit();

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
          this.requestTimestamps.push(Date.now());

          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = data ? JSON.parse(data) : null;
              resolve(parsed);
            } catch (err) {
              reject(new DataAccessError('HubSpot API', `Failed to parse response: ${err.message}`, { statusCode: res.statusCode }));
            }
          } else if (res.statusCode === 204) {
            resolve(null);
          } else if (res.statusCode === 429) {
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

    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < RATE_LIMIT_WINDOW
    );

    if (this.requestTimestamps.length >= RATE_LIMIT_REQUESTS) {
      const oldestRequest = Math.min(...this.requestTimestamps);
      const waitTime = RATE_LIMIT_WINDOW - (now - oldestRequest);

      if (waitTime > 0) {
        console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // ==========================================
  // AUTHOR CRUD
  // ==========================================

  /**
   * Validate required fields for author creation
   */
  validateAuthorData(authorData) {
    if (!authorData.fullName || authorData.fullName.trim() === '') {
      throw new DataAccessError('Validation', 'fullName is required for author creation', { authorData });
    }

    // Validate slug format if provided
    if (authorData.slug) {
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(authorData.slug)) {
        throw new DataAccessError('Validation', 'Slug must be lowercase alphanumeric with hyphens only', { slug: authorData.slug });
      }
    }
  }

  /**
   * Create new blog author
   * @param {Object} authorData - Author configuration
   * @returns {Promise<Object>} Created author object
   */
  async createAuthor(authorData) {
    this.validateAuthorData(authorData);

    const path = '/cms/v3/blogs/authors';

    const payload = {
      fullName: authorData.fullName,
      slug: authorData.slug || this.generateSlug(authorData.fullName),
      email: authorData.email || null,
      bio: authorData.bio || '',
      avatar: authorData.avatar || null,
      website: authorData.website || null,
      twitter: authorData.twitter || null,
      linkedin: authorData.linkedin || null,
      facebook: authorData.facebook || null,
      language: authorData.language || 'en',
      ...authorData
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Author created: ${result.fullName} (ID: ${result.id})`);
      return result;
    } catch (error) {
      throw new DataAccessError('createAuthor', `Failed to create author: ${error.message}`, { authorData, originalError: error });
    }
  }

  /**
   * Generate URL-friendly slug from name
   */
  generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * Retrieve single author by ID
   * @param {string} authorId - Author ID
   * @returns {Promise<Object>} Author object
   */
  async getAuthor(authorId) {
    const path = `/cms/v3/blogs/authors/${authorId}`;

    try {
      return await this.request('GET', path);
    } catch (error) {
      throw new DataAccessError('getAuthor', `Failed to retrieve author ${authorId}: ${error.message}`, { authorId });
    }
  }

  /**
   * List authors with filtering
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Paginated results { results, paging }
   */
  async listAuthors(filters = {}) {
    const path = '/cms/v3/blogs/authors';

    const queryParams = {
      limit: filters.limit || 100,
      sort: filters.sort || '-createdAt',
      after: filters.after,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
      updatedAfter: filters.updatedAfter,
      updatedBefore: filters.updatedBefore
    };

    try {
      return await this.request('GET', path, null, queryParams);
    } catch (error) {
      throw new DataAccessError('listAuthors', `Failed to list authors: ${error.message}`, { filters });
    }
  }

  /**
   * Get all authors (handles pagination automatically)
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of all authors
   */
  async getAllAuthors(filters = {}) {
    let allAuthors = [];
    let after = null;

    console.log(`📦 Fetching all blog authors...`);

    do {
      const result = await this.listAuthors({ ...filters, after });
      allAuthors = allAuthors.concat(result.results || []);

      after = result.paging?.next?.after || null;

      if (after) {
        console.log(`   Fetched ${allAuthors.length} authors, continuing...`);
      }
    } while (after);

    console.log(`✅ Retrieved ${allAuthors.length} total authors`);
    return allAuthors;
  }

  /**
   * Search authors with filter criteria
   * @param {Object} searchCriteria - Filter criteria (e.g., fullName__contains, email__eq)
   * @returns {Promise<Array>} Matching authors
   */
  async searchAuthors(searchCriteria = {}) {
    const allAuthors = await this.getAllAuthors();

    // Apply client-side filters
    return allAuthors.filter(author => {
      for (const [key, value] of Object.entries(searchCriteria)) {
        const [field, operator] = key.split('__');
        const authorValue = author[field];

        if (!authorValue) return false;

        switch (operator) {
          case 'eq':
            if (authorValue !== value) return false;
            break;
          case 'contains':
            if (!authorValue.includes(value)) return false;
            break;
          case 'icontains':
            if (!authorValue.toLowerCase().includes(value.toLowerCase())) return false;
            break;
          case 'startswith':
            if (!authorValue.startsWith(value)) return false;
            break;
          default:
            if (authorValue !== value) return false;
        }
      }
      return true;
    });
  }

  /**
   * Update existing author
   * @param {string} authorId - Author ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated author object
   */
  async updateAuthor(authorId, updates) {
    const path = `/cms/v3/blogs/authors/${authorId}`;

    try {
      const result = await this.request('PATCH', path, updates);
      console.log(`✅ Author updated: ${authorId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('updateAuthor', `Failed to update author ${authorId}: ${error.message}`, { authorId, updates });
    }
  }

  /**
   * Delete author
   * @param {string} authorId - Author ID to delete
   * @returns {Promise<Object>} Delete status
   */
  async deleteAuthor(authorId) {
    const path = `/cms/v3/blogs/authors/${authorId}`;

    try {
      const result = await this.request('DELETE', path);
      console.log(`✅ Author deleted: ${authorId}`);
      return result || { status: 'DELETED' };
    } catch (error) {
      throw new DataAccessError('deleteAuthor', `Failed to delete author ${authorId}: ${error.message}`, { authorId });
    }
  }

  /**
   * Get author by slug
   * @param {string} slug - Author slug
   * @returns {Promise<Object|null>} Author object or null
   */
  async getAuthorBySlug(slug) {
    const authors = await this.searchAuthors({ slug__eq: slug });
    return authors.length > 0 ? authors[0] : null;
  }

  /**
   * Get author by email
   * @param {string} email - Author email
   * @returns {Promise<Object|null>} Author object or null
   */
  async getAuthorByEmail(email) {
    const authors = await this.searchAuthors({ email__eq: email });
    return authors.length > 0 ? authors[0] : null;
  }

  /**
   * Get or create author (idempotent)
   * @param {Object} authorData - Author data
   * @returns {Promise<Object>} Author object (existing or newly created)
   */
  async getOrCreateAuthor(authorData) {
    // Try to find by email first
    if (authorData.email) {
      const byEmail = await this.getAuthorByEmail(authorData.email);
      if (byEmail) {
        byEmail._wasExisting = true;
        return byEmail;
      }
    }

    // Try to find by full name
    const byName = await this.searchAuthors({ fullName__eq: authorData.fullName });
    if (byName.length > 0) {
      byName[0]._wasExisting = true;
      return byName[0];
    }

    // Create new
    const created = await this.createAuthor(authorData);
    created._wasExisting = false;
    return created;
  }

  // ==========================================
  // MULTI-LANGUAGE
  // ==========================================

  /**
   * Create a language variant of an author
   * @param {string} primaryAuthorId - Primary author ID
   * @param {Object} variantData - Variant data { language, fullName?, bio?, ... }
   * @returns {Promise<Object>} Created variant
   */
  async createLanguageVariant(primaryAuthorId, variantData) {
    const path = '/cms/v3/blogs/authors/multi-language/create-language-variant';

    if (!variantData.language) {
      throw new DataAccessError('createLanguageVariant', 'Language is required for variant', { primaryAuthorId, variantData });
    }

    const payload = {
      id: primaryAuthorId,
      language: variantData.language,
      ...variantData
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Language variant created: ${variantData.language} (ID: ${result.id})`);
      return result;
    } catch (error) {
      throw new DataAccessError('createLanguageVariant', `Failed to create language variant: ${error.message}`, { primaryAuthorId, variantData });
    }
  }

  /**
   * Attach author to an existing language group
   * @param {string} authorId - Author to attach
   * @param {string} languageGroupId - Language group ID
   * @param {string} language - Language code
   * @returns {Promise<Object>} Result
   */
  async attachToLanguageGroup(authorId, languageGroupId, language) {
    const path = '/cms/v3/blogs/authors/multi-language/attach-to-lang-group';

    const payload = {
      id: authorId,
      languageGroupId,
      language
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Author ${authorId} attached to language group ${languageGroupId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('attachToLanguageGroup', `Failed to attach author: ${error.message}`, { authorId, languageGroupId, language });
    }
  }

  /**
   * Detach author from its language group
   * @param {string} authorId - Author to detach
   * @returns {Promise<Object>} Result
   */
  async detachFromLanguageGroup(authorId) {
    const path = '/cms/v3/blogs/authors/multi-language/detach-from-lang-group';

    const payload = { id: authorId };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Author ${authorId} detached from language group`);
      return result;
    } catch (error) {
      throw new DataAccessError('detachFromLanguageGroup', `Failed to detach author: ${error.message}`, { authorId });
    }
  }

  // ==========================================
  // BATCH OPERATIONS
  // ==========================================

  /**
   * Batch create authors with rate limiting
   * @param {Array<Object>} authorsData - Array of author data objects
   * @returns {Promise<Array>} Array of results
   */
  async batchCreateAuthors(authorsData) {
    console.log(`📦 Batch creating ${authorsData.length} authors...`);

    const results = [];

    for (let i = 0; i < authorsData.length; i += BATCH_SIZE) {
      const batch = authorsData.slice(i, i + BATCH_SIZE);
      console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(authorsData.length / BATCH_SIZE)}`);

      const batchPromises = batch.map(async (authorData) => {
        try {
          const author = await this.createAuthor(authorData);
          return { success: true, author, name: authorData.fullName };
        } catch (error) {
          return { success: false, error: error.message, name: authorData.fullName };
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
   * Batch import authors (get or create)
   * @param {Array<Object>} authorsData - Array of author data
   * @returns {Promise<Object>} { created: [], existing: [], failed: [] }
   */
  async batchImportAuthors(authorsData) {
    console.log(`📦 Importing ${authorsData.length} authors...`);

    const results = {
      created: [],
      existing: [],
      failed: []
    };

    for (const authorData of authorsData) {
      try {
        const author = await this.getOrCreateAuthor(authorData);

        if (author._wasExisting) {
          results.existing.push(author);
        } else {
          results.created.push(author);
        }
      } catch (error) {
        results.failed.push({
          data: authorData,
          error: error.message
        });
      }

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Import complete: ${results.created.length} created, ${results.existing.length} existing, ${results.failed.length} failed`);

    return results;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new HubSpotCMSBlogAuthorsManager();

  (async () => {
    try {
      switch (command) {
        case 'list':
          const authors = await manager.getAllAuthors();
          console.log(JSON.stringify(authors, null, 2));
          break;

        case 'get':
          const authorId = args[1];
          if (!authorId) throw new Error('Usage: get <authorId>');
          const author = await manager.getAuthor(authorId);
          console.log(JSON.stringify(author, null, 2));
          break;

        case 'search':
          const searchQuery = args[1];
          if (!searchQuery) throw new Error('Usage: search <name>');
          const found = await manager.searchAuthors({ fullName__icontains: searchQuery });
          console.log(JSON.stringify(found, null, 2));
          break;

        case 'create':
          const authorData = JSON.parse(args[1]);
          const created = await manager.createAuthor(authorData);
          console.log(JSON.stringify(created, null, 2));
          break;

        case 'update':
          const updateId = args[1];
          const updates = JSON.parse(args[2]);
          if (!updateId || !updates) throw new Error('Usage: update <authorId> <json>');
          const updated = await manager.updateAuthor(updateId, updates);
          console.log(JSON.stringify(updated, null, 2));
          break;

        case 'delete':
          const deleteId = args[1];
          if (!deleteId) throw new Error('Usage: delete <authorId>');
          const deleted = await manager.deleteAuthor(deleteId);
          console.log(JSON.stringify(deleted, null, 2));
          break;

        case 'get-or-create':
          const getOrCreateData = JSON.parse(args[1]);
          const getOrCreated = await manager.getOrCreateAuthor(getOrCreateData);
          console.log(JSON.stringify(getOrCreated, null, 2));
          break;

        default:
          console.log('Usage: hubspot-cms-blog-authors-manager.js <command> [args]');
          console.log('Commands:');
          console.log('  list                           - List all authors');
          console.log('  get <authorId>                 - Get author by ID');
          console.log('  search <name>                  - Search authors by name');
          console.log('  create <json>                  - Create author from JSON');
          console.log('  update <authorId> <json>       - Update author');
          console.log('  delete <authorId>              - Delete author');
          console.log('  get-or-create <json>           - Get existing or create new');
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

module.exports = HubSpotCMSBlogAuthorsManager;
