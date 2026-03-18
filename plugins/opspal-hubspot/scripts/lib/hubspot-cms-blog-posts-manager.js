#!/usr/bin/env node

/**
 * HubSpot CMS Blog Posts Manager
 *
 * Comprehensive HubSpot CMS Blog Posts API operations (CRUD)
 * Supports blog post creation, publishing, scheduling, and multi-language variants
 *
 * Features:
 * - Create, read, update, clone, delete blog posts
 * - Draft workflow management
 * - Scheduled publishing
 * - Revision history and restore
 * - Multi-language support
 * - Automatic pagination for list operations
 * - Batch operations with rate limiting
 * - No fake data generation (fails fast on errors)
 *
 * Usage:
 *   const manager = new HubSpotCMSBlogPostsManager({
 *     accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
 *     portalId: process.env.HUBSPOT_PORTAL_ID
 *   });
 *
 *   const post = await manager.createPost({ name, slug, contentGroupId, ... });
 */

const https = require('https');
const { URL } = require('url');

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 190; // HubSpot Professional tier: 190 requests/10 seconds (see config/hubspot-rate-limits.json)
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

class HubSpotCMSBlogPostsManager {
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;

    if (!this.accessToken) {
      throw new DataAccessError('HubSpotCMSBlogPostsManager', 'Missing HUBSPOT_ACCESS_TOKEN');
    }

    if (!this.portalId) {
      throw new DataAccessError('HubSpotCMSBlogPostsManager', 'Missing HUBSPOT_PORTAL_ID');
    }

    // Rate limiting state
    this.requestTimestamps = [];

    // Cache for blog settings (1 hour TTL)
    this.blogCache = new Map();
    this.blogCacheTTL = 3600000; // 1 hour
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

  // ==========================================
  // BLOG SETTINGS / DISCOVERY
  // ==========================================

  /**
   * List all blogs in the portal (to get contentGroupIds)
   * @returns {Promise<Array>} Array of blog objects { id, name, ... }
   */
  async listBlogs() {
    // Check cache first
    const cached = this.blogCache.get('blogs');
    if (cached && Date.now() - cached.timestamp < this.blogCacheTTL) {
      return cached.result;
    }

    const path = '/cms/v3/blogs/posts';

    try {
      // We need to get unique contentGroupIds from posts
      // HubSpot doesn't have a direct blogs list endpoint, so we infer from posts
      const result = await this.request('GET', path, null, { limit: 1 });

      // Actually, we need to use the blogs settings endpoint
      const blogsPath = '/content/api/v2/blogs';
      const blogsResult = await this.request('GET', blogsPath);

      const blogs = blogsResult.objects || [];

      // Cache result
      this.blogCache.set('blogs', {
        result: blogs,
        timestamp: Date.now()
      });

      return blogs;
    } catch (error) {
      // Fallback: try v3 blogs endpoint if available
      try {
        const blogsPath = '/cms/v3/blogs';
        const blogsResult = await this.request('GET', blogsPath);
        const blogs = blogsResult.results || [];

        this.blogCache.set('blogs', {
          result: blogs,
          timestamp: Date.now()
        });

        return blogs;
      } catch (e) {
        throw new DataAccessError('listBlogs', `Failed to list blogs: ${error.message}`, { originalError: error });
      }
    }
  }

  /**
   * Get blog by ID
   * @param {string} blogId - Blog (contentGroup) ID
   * @returns {Promise<Object>} Blog object
   */
  async getBlog(blogId) {
    const blogs = await this.listBlogs();
    const blog = blogs.find(b => b.id === blogId || b.id === String(blogId));

    if (!blog) {
      throw new DataAccessError('getBlog', `Blog not found: ${blogId}`, { blogId });
    }

    return blog;
  }

  // ==========================================
  // BLOG POST CRUD
  // ==========================================

  /**
   * Validate required fields for post creation
   */
  validatePostData(postData, requireAllFields = false) {
    const required = ['name', 'contentGroupId', 'slug'];
    const missing = required.filter(field => !postData[field]);

    if (missing.length > 0) {
      throw new DataAccessError('Validation', `Missing required fields: ${missing.join(', ')}`, { postData });
    }

    // For publishing, additional fields required
    if (requireAllFields) {
      const publishRequired = ['blogAuthorId', 'metaDescription'];
      const publishMissing = publishRequired.filter(field => !postData[field]);

      if (publishMissing.length > 0) {
        throw new DataAccessError('Validation', `Missing required fields for publishing: ${publishMissing.join(', ')}`, { postData });
      }

      // Check featured image requirement
      if (postData.useFeaturedImage !== false && !postData.featuredImage) {
        throw new DataAccessError('Validation', 'Either set useFeaturedImage to false or provide featuredImage URL', { postData });
      }
    }

    // Validate slug format (URL-friendly)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(postData.slug)) {
      throw new DataAccessError('Validation', 'Slug must be lowercase alphanumeric with hyphens only', { slug: postData.slug });
    }
  }

  /**
   * Create new blog post (as draft)
   * @param {Object} postData - Post configuration
   * @returns {Promise<Object>} Created post object
   */
  async createPost(postData) {
    this.validatePostData(postData);

    const path = '/cms/v3/blogs/posts';

    // Set defaults
    const payload = {
      name: postData.name,
      contentGroupId: postData.contentGroupId,
      slug: postData.slug,
      language: postData.language || 'en',
      blogAuthorId: postData.blogAuthorId,
      postBody: postData.postBody || '',
      metaDescription: postData.metaDescription || '',
      htmlTitle: postData.htmlTitle || postData.name,
      featuredImage: postData.featuredImage,
      featuredImageAltText: postData.featuredImageAltText || '',
      useFeaturedImage: postData.useFeaturedImage !== undefined ? postData.useFeaturedImage : true,
      tagIds: postData.tagIds || [],
      metaKeywords: postData.metaKeywords || [],
      ...postData // Include any additional fields
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Blog post created: ${result.name} (ID: ${result.id})`);
      return result;
    } catch (error) {
      throw new DataAccessError('createPost', `Failed to create blog post: ${error.message}`, { postData, originalError: error });
    }
  }

  /**
   * Retrieve single blog post by ID
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Post object
   */
  async getPost(postId) {
    const path = `/cms/v3/blogs/posts/${postId}`;

    try {
      return await this.request('GET', path);
    } catch (error) {
      throw new DataAccessError('getPost', `Failed to retrieve post ${postId}: ${error.message}`, { postId });
    }
  }

  /**
   * List blog posts with filtering
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Paginated results { results, paging }
   */
  async listPosts(filters = {}) {
    const path = '/cms/v3/blogs/posts';

    const queryParams = {
      limit: filters.limit || 100,
      createdAfter: filters.createdAfter,
      createdBefore: filters.createdBefore,
      updatedAfter: filters.updatedAfter,
      updatedBefore: filters.updatedBefore,
      sort: filters.sort || '-createdAt',
      archived: filters.archived || false,
      after: filters.after, // Pagination cursor
      state: filters.state, // DRAFT, SCHEDULED, PUBLISHED
      contentGroupId: filters.contentGroupId,
      blogAuthorId: filters.blogAuthorId
    };

    try {
      return await this.request('GET', path, null, queryParams);
    } catch (error) {
      throw new DataAccessError('listPosts', `Failed to list posts: ${error.message}`, { filters });
    }
  }

  /**
   * Get all blog posts (handles pagination automatically)
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Array of all posts
   */
  async getAllPosts(filters = {}) {
    let allPosts = [];
    let after = null;

    console.log(`📦 Fetching all blog posts...`);

    do {
      const result = await this.listPosts({ ...filters, after });
      allPosts = allPosts.concat(result.results || []);

      after = result.paging?.next?.after || null;

      if (after) {
        console.log(`   Fetched ${allPosts.length} posts, continuing...`);
      }
    } while (after);

    console.log(`✅ Retrieved ${allPosts.length} total posts`);
    return allPosts;
  }

  /**
   * Update existing blog post (updates draft version)
   * @param {string} postId - Post ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated post object
   */
  async updatePost(postId, updates) {
    const path = `/cms/v3/blogs/posts/${postId}`;

    try {
      const result = await this.request('PATCH', path, updates);
      console.log(`✅ Blog post updated: ${postId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('updatePost', `Failed to update post ${postId}: ${error.message}`, { postId, updates });
    }
  }

  /**
   * Clone existing blog post
   * @param {string} postId - Source post ID
   * @param {Object} cloneOptions - Clone options { name, slug? }
   * @returns {Promise<Object>} Cloned post object (draft state)
   */
  async clonePost(postId, cloneOptions) {
    const path = '/cms/v3/blogs/posts/clone';

    const payload = {
      id: postId
    };

    // Add clone options if provided
    if (typeof cloneOptions === 'string') {
      payload.cloneName = cloneOptions;
    } else if (cloneOptions) {
      if (cloneOptions.name) payload.cloneName = cloneOptions.name;
    }

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Blog post cloned: ${result.name} (ID: ${result.id})`);
      return result;
    } catch (error) {
      throw new DataAccessError('clonePost', `Failed to clone post ${postId}: ${error.message}`, { postId, cloneOptions });
    }
  }

  /**
   * Delete blog post
   * @param {string} postId - Post ID to delete
   * @returns {Promise<Object>} Delete status
   */
  async deletePost(postId) {
    const path = `/cms/v3/blogs/posts/${postId}`;

    try {
      const result = await this.request('DELETE', path);
      console.log(`✅ Blog post deleted: ${postId}`);
      return result || { status: 'DELETED' };
    } catch (error) {
      throw new DataAccessError('deletePost', `Failed to delete post ${postId}: ${error.message}`, { postId });
    }
  }

  /**
   * Get blog post by slug within a specific blog
   * @param {string} slug - Post slug
   * @param {string} contentGroupId - Blog ID
   * @returns {Promise<Object|null>} Post object or null
   */
  async getPostBySlug(slug, contentGroupId) {
    try {
      const posts = await this.listPosts({ contentGroupId, limit: 100 });
      return posts.results.find(post => post.slug === slug) || null;
    } catch (error) {
      throw new DataAccessError('getPostBySlug', `Failed to find post by slug ${slug}: ${error.message}`, { slug, contentGroupId });
    }
  }

  // ==========================================
  // DRAFT WORKFLOW
  // ==========================================

  /**
   * Get draft version of a post
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Draft object
   */
  async getDraft(postId) {
    const path = `/cms/v3/blogs/posts/${postId}/draft`;

    try {
      return await this.request('GET', path);
    } catch (error) {
      throw new DataAccessError('getDraft', `Failed to get draft for post ${postId}: ${error.message}`, { postId });
    }
  }

  /**
   * Update draft version of a post
   * @param {string} postId - Post ID
   * @param {Object} updates - Draft updates
   * @returns {Promise<Object>} Updated draft object
   */
  async updateDraft(postId, updates) {
    const path = `/cms/v3/blogs/posts/${postId}/draft`;

    try {
      const result = await this.request('PATCH', path, updates);
      console.log(`✅ Draft updated for post: ${postId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('updateDraft', `Failed to update draft for post ${postId}: ${error.message}`, { postId, updates });
    }
  }

  /**
   * Reset draft to match live version
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Reset result
   */
  async resetDraft(postId) {
    const path = `/cms/v3/blogs/posts/${postId}/draft/reset`;

    try {
      const result = await this.request('POST', path);
      console.log(`✅ Draft reset for post: ${postId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('resetDraft', `Failed to reset draft for post ${postId}: ${error.message}`, { postId });
    }
  }

  /**
   * Push draft to live (publish immediately)
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Published post object
   */
  async pushDraftLive(postId) {
    const path = `/cms/v3/blogs/posts/${postId}/draft/push-live`;

    try {
      const result = await this.request('POST', path);
      console.log(`✅ Draft pushed live for post: ${postId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('pushDraftLive', `Failed to push draft live for post ${postId}: ${error.message}`, { postId });
    }
  }

  // ==========================================
  // SCHEDULING
  // ==========================================

  /**
   * Schedule post for future publication
   * @param {string} postId - Post ID
   * @param {string} publishDate - ISO 8601 date string
   * @returns {Promise<Object>} Scheduled post object
   */
  async schedulePost(postId, publishDate) {
    const path = '/cms/v3/blogs/posts/schedule';

    // Validate date is in the future
    const scheduleTime = new Date(publishDate);
    if (scheduleTime <= new Date()) {
      throw new DataAccessError('schedulePost', 'Publish date must be in the future', { postId, publishDate });
    }

    const payload = {
      id: postId,
      publishDate: scheduleTime.toISOString()
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Post scheduled for: ${scheduleTime.toISOString()}`);
      return result;
    } catch (error) {
      throw new DataAccessError('schedulePost', `Failed to schedule post ${postId}: ${error.message}`, { postId, publishDate });
    }
  }

  // ==========================================
  // REVISION HISTORY
  // ==========================================

  /**
   * Get revision history for a post
   * @param {string} postId - Post ID
   * @returns {Promise<Array>} Array of revisions
   */
  async getRevisions(postId) {
    const path = `/cms/v3/blogs/posts/${postId}/revisions`;

    try {
      const result = await this.request('GET', path);
      return result.results || [];
    } catch (error) {
      throw new DataAccessError('getRevisions', `Failed to get revisions for post ${postId}: ${error.message}`, { postId });
    }
  }

  /**
   * Restore a specific revision
   * @param {string} postId - Post ID
   * @param {string} revisionId - Revision ID to restore
   * @returns {Promise<Object>} Restored post object
   */
  async restoreRevision(postId, revisionId) {
    const path = `/cms/v3/blogs/posts/${postId}/revisions/${revisionId}/restore`;

    try {
      const result = await this.request('POST', path);
      console.log(`✅ Revision ${revisionId} restored for post: ${postId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('restoreRevision', `Failed to restore revision ${revisionId} for post ${postId}: ${error.message}`, { postId, revisionId });
    }
  }

  // ==========================================
  // MULTI-LANGUAGE
  // ==========================================

  /**
   * Create a language variant of a post
   * @param {string} primaryPostId - Primary (source) post ID
   * @param {Object} variantData - Variant data { language, name, postBody, ... }
   * @returns {Promise<Object>} Created variant post
   */
  async createLanguageVariant(primaryPostId, variantData) {
    const path = '/cms/v3/blogs/posts/multi-language/create-language-variant';

    if (!variantData.language) {
      throw new DataAccessError('createLanguageVariant', 'Language is required for variant', { primaryPostId, variantData });
    }

    const payload = {
      id: primaryPostId,
      language: variantData.language,
      ...variantData
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Language variant created: ${variantData.language} (ID: ${result.id})`);
      return result;
    } catch (error) {
      throw new DataAccessError('createLanguageVariant', `Failed to create language variant for post ${primaryPostId}: ${error.message}`, { primaryPostId, variantData });
    }
  }

  /**
   * Attach a post to an existing language group
   * @param {string} postId - Post to attach
   * @param {string} languageGroupId - Language group ID
   * @param {string} language - Language code
   * @returns {Promise<Object>} Result
   */
  async attachToLanguageGroup(postId, languageGroupId, language) {
    const path = '/cms/v3/blogs/posts/multi-language/attach-to-lang-group';

    const payload = {
      id: postId,
      languageGroupId,
      language
    };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Post ${postId} attached to language group ${languageGroupId}`);
      return result;
    } catch (error) {
      throw new DataAccessError('attachToLanguageGroup', `Failed to attach post ${postId} to language group: ${error.message}`, { postId, languageGroupId, language });
    }
  }

  /**
   * Detach a post from its language group
   * @param {string} postId - Post to detach
   * @returns {Promise<Object>} Result
   */
  async detachFromLanguageGroup(postId) {
    const path = '/cms/v3/blogs/posts/multi-language/detach-from-lang-group';

    const payload = { id: postId };

    try {
      const result = await this.request('POST', path, payload);
      console.log(`✅ Post ${postId} detached from language group`);
      return result;
    } catch (error) {
      throw new DataAccessError('detachFromLanguageGroup', `Failed to detach post ${postId} from language group: ${error.message}`, { postId });
    }
  }

  // ==========================================
  // BATCH OPERATIONS
  // ==========================================

  /**
   * Batch create posts with rate limiting
   * @param {Array<Object>} postsData - Array of post data objects
   * @returns {Promise<Array>} Array of results { success, post?, error? }
   */
  async batchCreatePosts(postsData) {
    console.log(`📦 Batch creating ${postsData.length} blog posts...`);

    const results = [];

    // Process in batches
    for (let i = 0; i < postsData.length; i += BATCH_SIZE) {
      const batch = postsData.slice(i, i + BATCH_SIZE);
      console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(postsData.length / BATCH_SIZE)}`);

      const batchPromises = batch.map(async (postData) => {
        try {
          const post = await this.createPost(postData);
          return { success: true, post, name: postData.name };
        } catch (error) {
          return { success: false, error: error.message, name: postData.name };
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
   * Batch update posts with rate limiting
   * @param {Array<Object>} updates - Array of { postId, updates } objects
   * @returns {Promise<Array>} Array of results
   */
  async batchUpdatePosts(updates) {
    console.log(`📦 Batch updating ${updates.length} blog posts...`);

    const results = [];

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updates.length / BATCH_SIZE)}`);

      const batchPromises = batch.map(async ({ postId, updates: postUpdates }) => {
        try {
          const post = await this.updatePost(postId, postUpdates);
          return { success: true, post, postId };
        } catch (error) {
          return { success: false, error: error.message, postId };
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

  /**
   * Batch publish posts
   * @param {Array<string>} postIds - Array of post IDs
   * @returns {Promise<Array>} Array of results
   */
  async batchPublishPosts(postIds) {
    console.log(`📦 Batch publishing ${postIds.length} blog posts...`);

    const results = [];

    for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
      const batch = postIds.slice(i, i + BATCH_SIZE);
      console.log(`   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(postIds.length / BATCH_SIZE)}`);

      const batchPromises = batch.map(async (postId) => {
        try {
          const post = await this.pushDraftLive(postId);
          return { success: true, post, postId };
        } catch (error) {
          return { success: false, error: error.message, postId };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Batch complete: ${successful} published, ${failed} failed`);

    return results;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new HubSpotCMSBlogPostsManager();

  (async () => {
    try {
      switch (command) {
        case 'list-blogs':
          const blogs = await manager.listBlogs();
          console.log(JSON.stringify(blogs, null, 2));
          break;

        case 'list':
          const posts = await manager.getAllPosts();
          console.log(JSON.stringify(posts, null, 2));
          break;

        case 'get':
          const postId = args[1];
          if (!postId) throw new Error('Usage: get <postId>');
          const post = await manager.getPost(postId);
          console.log(JSON.stringify(post, null, 2));
          break;

        case 'get-draft':
          const draftPostId = args[1];
          if (!draftPostId) throw new Error('Usage: get-draft <postId>');
          const draft = await manager.getDraft(draftPostId);
          console.log(JSON.stringify(draft, null, 2));
          break;

        case 'get-revisions':
          const revPostId = args[1];
          if (!revPostId) throw new Error('Usage: get-revisions <postId>');
          const revisions = await manager.getRevisions(revPostId);
          console.log(JSON.stringify(revisions, null, 2));
          break;

        case 'create':
          const postData = JSON.parse(args[1]);
          const created = await manager.createPost(postData);
          console.log(JSON.stringify(created, null, 2));
          break;

        case 'publish':
          const publishPostId = args[1];
          if (!publishPostId) throw new Error('Usage: publish <postId>');
          const published = await manager.pushDraftLive(publishPostId);
          console.log(JSON.stringify(published, null, 2));
          break;

        case 'schedule':
          const schedulePostId = args[1];
          const publishDate = args[2];
          if (!schedulePostId || !publishDate) throw new Error('Usage: schedule <postId> <publishDate>');
          const scheduled = await manager.schedulePost(schedulePostId, publishDate);
          console.log(JSON.stringify(scheduled, null, 2));
          break;

        case 'clone':
          const clonePostId = args[1];
          const cloneName = args[2];
          if (!clonePostId || !cloneName) throw new Error('Usage: clone <postId> <cloneName>');
          const cloned = await manager.clonePost(clonePostId, cloneName);
          console.log(JSON.stringify(cloned, null, 2));
          break;

        case 'delete':
          const deletePostId = args[1];
          if (!deletePostId) throw new Error('Usage: delete <postId>');
          const deleted = await manager.deletePost(deletePostId);
          console.log(JSON.stringify(deleted, null, 2));
          break;

        default:
          console.log('Usage: hubspot-cms-blog-posts-manager.js <command> [args]');
          console.log('Commands:');
          console.log('  list-blogs                     - List all blogs (get contentGroupIds)');
          console.log('  list                           - List all blog posts');
          console.log('  get <postId>                   - Get post by ID');
          console.log('  get-draft <postId>             - Get draft version');
          console.log('  get-revisions <postId>         - Get revision history');
          console.log('  create <json>                  - Create post from JSON');
          console.log('  publish <postId>               - Publish post (push draft live)');
          console.log('  schedule <postId> <date>       - Schedule post publication');
          console.log('  clone <postId> <name>          - Clone existing post');
          console.log('  delete <postId>                - Delete post');
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

module.exports = HubSpotCMSBlogPostsManager;
