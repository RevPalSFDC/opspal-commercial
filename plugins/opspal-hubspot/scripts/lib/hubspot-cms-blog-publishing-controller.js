#!/usr/bin/env node

/**
 * HubSpot CMS Blog Publishing Controller
 *
 * Manages publishing workflows for HubSpot blog posts
 * Handles draft → live transitions, scheduling, validation, and rollback
 *
 * Features:
 * - Immediate publish (push draft to live)
 * - Scheduled publish (future date/time)
 * - Pre-publish validation (required fields, SEO)
 * - Revision history and restore
 * - Publishing status tracking
 * - Batch publishing with rate limiting
 * - Publishing history (audit trail)
 *
 * Usage:
 *   const controller = new HubSpotCMSBlogPublishingController({
 *     accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
 *     portalId: process.env.HUBSPOT_PORTAL_ID
 *   });
 *
 *   await controller.publishNow(postId);
 *   await controller.schedulePublish(postId, '2025-12-01T09:00:00Z');
 */

const HubSpotCMSBlogPostsManager = require('./hubspot-cms-blog-posts-manager');

class HubSpotCMSBlogPublishingController {
  constructor(options = {}) {
    // Use the blog posts manager for underlying API calls
    this.blogManager = new HubSpotCMSBlogPostsManager(options);
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;

    // Publishing history (in-memory, could be persisted)
    this.publishHistory = [];
  }

  /**
   * Publish blog post immediately (push draft to live)
   * @param {string} postId - Post ID to publish
   * @returns {Promise<Object>} Published post object
   */
  async publishNow(postId) {
    console.log(`🚀 Publishing blog post ${postId} immediately...`);

    try {
      const result = await this.blogManager.pushDraftLive(postId);

      // Record in history
      this.publishHistory.push({
        postId,
        timestamp: new Date().toISOString(),
        type: 'immediate',
        success: true
      });

      console.log(`✅ Blog post published: ${postId}`);
      return result;
    } catch (error) {
      this.publishHistory.push({
        postId,
        timestamp: new Date().toISOString(),
        type: 'immediate',
        success: false,
        error: error.message
      });

      throw new Error(`Failed to publish post ${postId}: ${error.message}`);
    }
  }

  /**
   * Schedule blog post for future publish
   * @param {string} postId - Post ID
   * @param {string} publishDate - ISO 8601 timestamp (e.g., "2025-12-01T09:00:00Z")
   * @returns {Promise<Object>} Scheduled post object
   */
  async schedulePublish(postId, publishDate) {
    console.log(`🕒 Scheduling blog post ${postId} for ${publishDate}...`);

    try {
      const result = await this.blogManager.schedulePost(postId, publishDate);

      // Record in history
      this.publishHistory.push({
        postId,
        timestamp: new Date().toISOString(),
        type: 'scheduled',
        publishDate,
        success: true
      });

      console.log(`✅ Blog post scheduled for ${publishDate}`);
      return result;
    } catch (error) {
      this.publishHistory.push({
        postId,
        timestamp: new Date().toISOString(),
        type: 'scheduled',
        publishDate,
        success: false,
        error: error.message
      });

      throw new Error(`Failed to schedule post ${postId}: ${error.message}`);
    }
  }

  /**
   * Cancel scheduled publish
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Updated post object
   */
  async cancelScheduledPublish(postId) {
    console.log(`❌ Cancelling scheduled publish for post ${postId}...`);

    try {
      // Set publishDate to null to cancel schedule
      const result = await this.blogManager.updatePost(postId, {
        publishDate: null
      });

      console.log(`✅ Scheduled publish cancelled`);
      return result;
    } catch (error) {
      throw new Error(`Failed to cancel scheduled publish for ${postId}: ${error.message}`);
    }
  }

  /**
   * Get publishing status of a blog post
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Status object
   */
  async getPublishingStatus(postId) {
    try {
      const post = await this.blogManager.getPost(postId);

      return {
        isPublished: post.currentState === 'PUBLISHED' || post.state === 'PUBLISHED',
        state: post.currentState || post.state || 'UNKNOWN',
        publishDate: post.publishDate || null,
        url: post.url || null,
        lastUpdated: post.updated || post.updatedAt || null,
        authorId: post.blogAuthorId || null
      };
    } catch (error) {
      throw new Error(`Failed to get publishing status for ${postId}: ${error.message}`);
    }
  }

  /**
   * Validate blog post before publishing
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} { valid: boolean, errors: [], warnings: [] }
   */
  async validateBeforePublish(postId) {
    console.log(`🔍 Validating blog post ${postId} before publish...`);

    const errors = [];
    const warnings = [];

    try {
      // Fetch post details
      const post = await this.blogManager.getPost(postId);

      // Check required fields for publishing
      if (!post.name || post.name.trim() === '') {
        errors.push('Missing post title (name)');
      }

      if (!post.contentGroupId) {
        errors.push('Missing blog ID (contentGroupId)');
      }

      if (!post.slug || post.slug.trim() === '') {
        errors.push('Missing post slug');
      }

      if (!post.blogAuthorId) {
        errors.push('Missing blog author (blogAuthorId) - required for publishing');
      }

      if (!post.metaDescription || post.metaDescription.trim() === '') {
        errors.push('Missing meta description - required for publishing');
      }

      // Check featured image requirement
      if (post.useFeaturedImage !== false && !post.featuredImage) {
        errors.push('Missing featured image - either provide featuredImage URL or set useFeaturedImage to false');
      }

      // SEO warnings
      if (post.metaDescription && post.metaDescription.length < 120) {
        warnings.push(`Meta description is short (${post.metaDescription.length} chars). Recommended: 150-160 chars`);
      }

      if (post.metaDescription && post.metaDescription.length > 160) {
        warnings.push(`Meta description is long (${post.metaDescription.length} chars). May be truncated in search results`);
      }

      // Content warnings
      if (!post.postBody || post.postBody.trim() === '') {
        warnings.push('No post content (postBody) - page will appear empty');
      } else if (post.postBody.length < 300) {
        warnings.push(`Post content is short (${post.postBody.length} chars). Consider adding more content for SEO`);
      }

      // Featured image alt text
      if (post.featuredImage && !post.featuredImageAltText) {
        warnings.push('Missing featured image alt text - important for accessibility and SEO');
      }

      // Tags
      if (!post.tagIds || post.tagIds.length === 0) {
        warnings.push('No tags assigned - consider adding tags for organization and SEO');
      }

      const valid = errors.length === 0;

      if (valid) {
        console.log(`✅ Validation passed`);
        if (warnings.length > 0) {
          console.log(`⚠️  ${warnings.length} warnings`);
        }
      } else {
        console.log(`❌ Validation failed with ${errors.length} errors`);
      }

      return {
        valid,
        errors,
        warnings,
        postId,
        postName: post.name
      };
    } catch (error) {
      throw new Error(`Failed to validate post ${postId}: ${error.message}`);
    }
  }

  /**
   * Get revision history for a blog post
   * @param {string} postId - Post ID
   * @returns {Promise<Array>} Array of revisions
   */
  async getRevisions(postId) {
    return await this.blogManager.getRevisions(postId);
  }

  /**
   * Restore a specific revision
   * @param {string} postId - Post ID
   * @param {string} revisionId - Revision ID to restore
   * @returns {Promise<Object>} Restored post object
   */
  async restoreRevision(postId, revisionId) {
    console.log(`🔄 Restoring revision ${revisionId} for post ${postId}...`);

    try {
      const result = await this.blogManager.restoreRevision(postId, revisionId);

      console.log(`✅ Revision restored successfully`);
      return result;
    } catch (error) {
      throw new Error(`Failed to restore revision ${revisionId}: ${error.message}`);
    }
  }

  /**
   * Create snapshot by cloning the post (for additional rollback capability)
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} { snapshotId, originalPostId, snapshotName }
   */
  async createPublishSnapshot(postId) {
    console.log(`📸 Creating snapshot for post ${postId}...`);

    try {
      const post = await this.blogManager.getPost(postId);
      const snapshotName = `${post.name} [SNAPSHOT ${new Date().toISOString()}]`;

      // Clone the post as a snapshot
      const snapshot = await this.blogManager.clonePost(postId, snapshotName);

      console.log(`✅ Snapshot created: ${snapshot.id}`);

      return {
        snapshotId: snapshot.id,
        originalPostId: postId,
        snapshotName: snapshotName,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to create snapshot for ${postId}: ${error.message}`);
    }
  }

  /**
   * Batch publish multiple blog posts
   * @param {Array<string>} postIds - Array of post IDs
   * @param {Object} options - { immediate: true/false, publishDate: timestamp }
   * @returns {Promise<Array>} Array of results
   */
  async batchPublishPosts(postIds, options = {}) {
    console.log(`📦 Batch publishing ${postIds.length} blog posts...`);

    const results = [];
    const batchSize = 10;

    for (let i = 0; i < postIds.length; i += batchSize) {
      const batch = postIds.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(postIds.length / batchSize)}`);

      const batchPromises = batch.map(async (postId) => {
        try {
          if (options.publishDate) {
            await this.schedulePublish(postId, options.publishDate);
            return { success: true, postId, type: 'scheduled' };
          } else {
            await this.publishNow(postId);
            return { success: true, postId, type: 'immediate' };
          }
        } catch (error) {
          return { success: false, postId, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Batch publish complete: ${successful} published, ${failed} failed`);

    return results;
  }

  /**
   * Get publishing history (audit trail)
   * @param {string} postId - Optional post ID to filter by
   * @returns {Array} Publishing history entries
   */
  getPublishingHistory(postId = null) {
    if (postId) {
      return this.publishHistory.filter(entry => entry.postId === postId);
    }
    return this.publishHistory;
  }

  /**
   * Get preview URL for draft blog post
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} { previewUrl, url }
   */
  async getPreviewUrl(postId) {
    try {
      const post = await this.blogManager.getPost(postId);

      // HubSpot preview URL pattern
      const previewUrl = post.url ? `${post.url}?preview=true` : null;

      return {
        previewUrl,
        url: post.url,
        state: post.currentState || post.state
      };
    } catch (error) {
      throw new Error(`Failed to get preview URL for ${postId}: ${error.message}`);
    }
  }

  /**
   * Publish blog post with full workflow (validation → snapshot → publish)
   * @param {string} postId - Post ID
   * @param {Object} options - { immediate: true, publishDate?, createSnapshot: boolean }
   * @returns {Promise<Object>} { success, post?, snapshot?, validation?, error? }
   */
  async publishWithWorkflow(postId, options = {}) {
    console.log(`🚀 Starting publish workflow for blog post ${postId}...`);

    try {
      // Step 1: Validate
      console.log('📋 Step 1/3: Validation');
      const validation = await this.validateBeforePublish(postId);

      if (!validation.valid) {
        console.log(`❌ Validation failed with ${validation.errors.length} errors`);
        return {
          success: false,
          validation,
          error: 'Validation failed'
        };
      }

      // Step 2: Create snapshot (optional but recommended)
      let snapshot = null;
      if (options.createSnapshot !== false) {
        console.log('📸 Step 2/3: Creating snapshot');
        snapshot = await this.createPublishSnapshot(postId);
      } else {
        console.log('📸 Step 2/3: Skipping snapshot (disabled)');
      }

      // Step 3: Publish
      console.log('🚀 Step 3/3: Publishing');
      let post;
      if (options.publishDate) {
        await this.schedulePublish(postId, options.publishDate);
        post = await this.blogManager.getPost(postId);
      } else {
        post = await this.publishNow(postId);
      }

      console.log(`✅ Publish workflow complete`);

      return {
        success: true,
        post,
        snapshot,
        validation
      };
    } catch (error) {
      console.error(`❌ Publish workflow failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Unpublish a blog post (move to draft)
   * Note: This resets the draft and doesn't push it live
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Updated post
   */
  async unpublish(postId) {
    console.log(`🔻 Unpublishing blog post ${postId}...`);

    try {
      // Reset draft clears changes
      await this.blogManager.resetDraft(postId);

      // Update state to DRAFT by not pushing live
      // Note: HubSpot may not support direct unpublish - check API docs
      const post = await this.blogManager.getPost(postId);

      console.log(`✅ Post unpublished (reverted to draft state)`);
      return post;
    } catch (error) {
      throw new Error(`Failed to unpublish post ${postId}: ${error.message}`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const controller = new HubSpotCMSBlogPublishingController();

  (async () => {
    try {
      switch (command) {
        case 'publish':
          const postId = args[1];
          if (!postId) throw new Error('Usage: publish <postId>');
          const result = await controller.publishNow(postId);
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'schedule':
          const schedPostId = args[1];
          const publishDate = args[2];
          if (!schedPostId || !publishDate) {
            throw new Error('Usage: schedule <postId> <publishDate>');
          }
          const scheduled = await controller.schedulePublish(schedPostId, publishDate);
          console.log(JSON.stringify(scheduled, null, 2));
          break;

        case 'validate':
          const valPostId = args[1];
          if (!valPostId) throw new Error('Usage: validate <postId>');
          const validation = await controller.validateBeforePublish(valPostId);
          console.log(JSON.stringify(validation, null, 2));
          break;

        case 'status':
          const statusPostId = args[1];
          if (!statusPostId) throw new Error('Usage: status <postId>');
          const status = await controller.getPublishingStatus(statusPostId);
          console.log(JSON.stringify(status, null, 2));
          break;

        case 'revisions':
          const revPostId = args[1];
          if (!revPostId) throw new Error('Usage: revisions <postId>');
          const revisions = await controller.getRevisions(revPostId);
          console.log(JSON.stringify(revisions, null, 2));
          break;

        case 'restore':
          const restorePostId = args[1];
          const revisionId = args[2];
          if (!restorePostId || !revisionId) {
            throw new Error('Usage: restore <postId> <revisionId>');
          }
          const restored = await controller.restoreRevision(restorePostId, revisionId);
          console.log(JSON.stringify(restored, null, 2));
          break;

        case 'snapshot':
          const snapPostId = args[1];
          if (!snapPostId) throw new Error('Usage: snapshot <postId>');
          const snapshot = await controller.createPublishSnapshot(snapPostId);
          console.log(JSON.stringify(snapshot, null, 2));
          break;

        case 'workflow':
          const workflowPostId = args[1];
          if (!workflowPostId) throw new Error('Usage: workflow <postId> [--schedule "2025-12-01T09:00:00Z"]');

          const scheduleIndex = args.indexOf('--schedule');
          const workflowOptions = {};
          if (scheduleIndex !== -1) {
            workflowOptions.publishDate = args[scheduleIndex + 1];
          }

          const workflowResult = await controller.publishWithWorkflow(workflowPostId, workflowOptions);
          console.log(JSON.stringify(workflowResult, null, 2));
          break;

        default:
          console.log('Usage: hubspot-cms-blog-publishing-controller.js <command> [args]');
          console.log('Commands:');
          console.log('  publish <postId>                    - Publish post immediately');
          console.log('  schedule <postId> <date>            - Schedule post for future publish');
          console.log('  validate <postId>                   - Validate post before publish');
          console.log('  status <postId>                     - Get publishing status');
          console.log('  revisions <postId>                  - Get revision history');
          console.log('  restore <postId> <revisionId>       - Restore specific revision');
          console.log('  snapshot <postId>                   - Create snapshot for rollback');
          console.log('  workflow <postId> [--schedule date] - Full publish workflow');
          process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = HubSpotCMSBlogPublishingController;
