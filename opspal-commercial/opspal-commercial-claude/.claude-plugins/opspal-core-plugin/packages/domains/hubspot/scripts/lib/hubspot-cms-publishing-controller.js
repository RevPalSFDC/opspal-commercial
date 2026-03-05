#!/usr/bin/env node

/**
 * HubSpot CMS Publishing Controller
 *
 * Manages publishing workflows for HubSpot CMS pages
 * Handles draft → live transitions, scheduling, validation, and rollback
 *
 * Features:
 * - Immediate publish (push-live)
 * - Scheduled publish (future date/time)
 * - Pre-publish validation (required fields, templates, SEO)
 * - Publishing status tracking
 * - Snapshot creation for rollback
 * - Batch publishing with rate limiting
 * - Publishing history (audit trail)
 *
 * Usage:
 *   const controller = new HubSpotCMSPublishingController({
 *     accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
 *     portalId: process.env.HUBSPOT_PORTAL_ID,
 *     pageType: 'landing-pages'
 *   });
 *
 *   await controller.publishPageNow(pageId);
 *   await controller.schedulePublish(pageId, '2025-12-01T15:00:00Z');
 */

const HubSpotCMSPagesManager = require('./hubspot-cms-pages-manager');

class HubSpotCMSPublishingController {
  constructor(options = {}) {
    // Use the pages manager for underlying API calls
    this.pagesManager = new HubSpotCMSPagesManager(options);
    this.accessToken = options.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
    this.portalId = options.portalId || process.env.HUBSPOT_PORTAL_ID;
    this.pageType = options.pageType || 'landing-pages';

    // Publishing history (in-memory, could be persisted)
    this.publishHistory = [];
  }

  /**
   * Publish page immediately (push draft to live)
   * @param {string} pageId - Page ID to publish
   * @returns {Promise<Object>} Published page object
   */
  async publishPageNow(pageId) {
    console.log(`🚀 Publishing page ${pageId} immediately...`);

    const path = `/cms/v3/pages/${this.pageType}/${pageId}/draft/push-live`;

    try {
      const result = await this.pagesManager.request('POST', path);

      // Record in history
      this.publishHistory.push({
        pageId,
        timestamp: new Date().toISOString(),
        type: 'immediate',
        success: true
      });

      console.log(`✅ Page published: ${pageId}`);
      return result;
    } catch (error) {
      this.publishHistory.push({
        pageId,
        timestamp: new Date().toISOString(),
        type: 'immediate',
        success: false,
        error: error.message
      });

      throw new this.pagesManager.constructor.DataAccessError(
        'publishPageNow',
        `Failed to publish page ${pageId}: ${error.message}`,
        { pageId }
      );
    }
  }

  /**
   * Schedule page for future publish
   * @param {string} pageId - Page ID
   * @param {string} publishDate - ISO 8601 timestamp (e.g., "2025-12-01T15:00:00Z")
   * @returns {Promise<void>}
   */
  async schedulePublish(pageId, publishDate) {
    console.log(`🕒 Scheduling page ${pageId} for ${publishDate}...`);

    // Validate date format
    const date = new Date(publishDate);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${publishDate}. Use ISO 8601 format (e.g., "2025-12-01T15:00:00Z")`);
    }

    // Ensure date is in the future
    if (date <= new Date()) {
      throw new Error(`Publish date must be in the future: ${publishDate}`);
    }

    const path = `/cms/v3/pages/${this.pageType}/schedule`;
    const payload = {
      id: pageId,
      publishDate: publishDate
    };

    try {
      await this.pagesManager.request('POST', path, payload);

      // Record in history
      this.publishHistory.push({
        pageId,
        timestamp: new Date().toISOString(),
        type: 'scheduled',
        publishDate,
        success: true
      });

      console.log(`✅ Page scheduled for ${publishDate}`);
    } catch (error) {
      this.publishHistory.push({
        pageId,
        timestamp: new Date().toISOString(),
        type: 'scheduled',
        publishDate,
        success: false,
        error: error.message
      });

      throw new Error(`Failed to schedule page ${pageId}: ${error.message}`);
    }
  }

  /**
   * Cancel scheduled publish
   * Note: HubSpot API doesn't have a direct cancel endpoint, so we update publishDate to null
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} Updated page object
   */
  async cancelScheduledPublish(pageId) {
    console.log(`❌ Cancelling scheduled publish for page ${pageId}...`);

    try {
      // Set publishDate to null to cancel schedule
      const result = await this.pagesManager.updatePage(pageId, {
        publishDate: null,
        publishImmediately: false
      });

      console.log(`✅ Scheduled publish cancelled`);
      return result;
    } catch (error) {
      throw new Error(`Failed to cancel scheduled publish for ${pageId}: ${error.message}`);
    }
  }

  /**
   * Get publishing status of a page
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} Status object { isPublished, state, publishDate, url }
   */
  async getPublishingStatus(pageId) {
    try {
      const page = await this.pagesManager.getPage(pageId);

      return {
        isPublished: page.currentlyPublished || false,
        state: page.state || page.currentState || 'UNKNOWN',
        publishDate: page.publishDate || null,
        url: page.url || null,
        lastUpdated: page.updated || null
      };
    } catch (error) {
      throw new Error(`Failed to get publishing status for ${pageId}: ${error.message}`);
    }
  }

  /**
   * Validate page before publishing
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} { valid: boolean, errors: [], warnings: [] }
   */
  async validateBeforePublish(pageId) {
    console.log(`🔍 Validating page ${pageId} before publish...`);

    const errors = [];
    const warnings = [];

    try {
      // Fetch page details
      const page = await this.pagesManager.getPage(pageId);

      // Check required fields
      if (!page.name || page.name.trim() === '') {
        errors.push('Missing page name');
      }

      if (!page.slug || page.slug.trim() === '') {
        errors.push('Missing page slug');
      }

      if (!page.metaDescription || page.metaDescription.trim() === '') {
        warnings.push('Missing meta description (recommended for SEO)');
      }

      if (!page.htmlTitle || page.htmlTitle.trim() === '') {
        warnings.push('Missing HTML title (recommended for SEO)');
      }

      // Validate template path
      if (page.templatePath) {
        const templateValidation = await this.pagesManager.validateTemplate(page.templatePath);
        if (!templateValidation.exists) {
          errors.push(`Template not found: ${page.templatePath}`);
        }
      } else {
        errors.push('Missing template path');
      }

      // Check content (widgets should have some data)
      if (!page.widgets || Object.keys(page.widgets).length === 0) {
        warnings.push('No content modules (widgets) configured - page may appear empty');
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
        pageId,
        pageName: page.name
      };
    } catch (error) {
      throw new Error(`Failed to validate page ${pageId}: ${error.message}`);
    }
  }

  /**
   * Create snapshot of page for rollback
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} { snapshotId, originalPageId, snapshotName }
   */
  async createPublishSnapshot(pageId) {
    console.log(`📸 Creating snapshot for page ${pageId}...`);

    try {
      const page = await this.pagesManager.getPage(pageId);
      const snapshotName = `${page.name} [SNAPSHOT ${new Date().toISOString()}]`;

      // Clone the page as a snapshot
      const snapshot = await this.pagesManager.clonePage(pageId, snapshotName);

      // Archive the snapshot (keep it but hide from dashboard)
      await this.pagesManager.archivePage(snapshot.id);

      console.log(`✅ Snapshot created: ${snapshot.id}`);

      return {
        snapshotId: snapshot.id,
        originalPageId: pageId,
        snapshotName: snapshotName,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to create snapshot for ${pageId}: ${error.message}`);
    }
  }

  /**
   * Rollback to a previous snapshot
   * @param {string} pageId - Current page ID
   * @param {string} snapshotId - Snapshot page ID to restore from
   * @returns {Promise<Object>} Restored page object
   */
  async rollbackToVersion(pageId, snapshotId) {
    console.log(`🔄 Rolling back page ${pageId} to snapshot ${snapshotId}...`);

    try {
      // Get snapshot content
      const snapshot = await this.pagesManager.getPage(snapshotId);

      // Copy relevant fields from snapshot to current page
      const updates = {
        name: snapshot.name.replace(/\[SNAPSHOT.*\]/, '').trim(),
        slug: snapshot.slug,
        metaDescription: snapshot.metaDescription,
        htmlTitle: snapshot.htmlTitle,
        widgets: snapshot.widgets,
        templatePath: snapshot.templatePath
        // Don't copy state, publishDate, etc.
      };

      const restored = await this.pagesManager.updatePage(pageId, updates);

      console.log(`✅ Page rolled back to snapshot ${snapshotId}`);

      // Optionally delete the snapshot after successful rollback
      // await this.pagesManager.deletePage(snapshotId);

      return restored;
    } catch (error) {
      throw new Error(`Failed to rollback page ${pageId} to snapshot ${snapshotId}: ${error.message}`);
    }
  }

  /**
   * Batch publish multiple pages
   * @param {Array<string>} pageIds - Array of page IDs
   * @param {Object} options - { immediate: true/false, publishDate: timestamp }
   * @returns {Promise<Array>} Array of results { success, pageId, error? }
   */
  async batchPublishPages(pageIds, options = {}) {
    console.log(`📦 Batch publishing ${pageIds.length} pages...`);

    const results = [];
    const batchSize = 10; // Rate limiting

    for (let i = 0; i < pageIds.length; i += batchSize) {
      const batch = pageIds.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pageIds.length / batchSize)}`);

      const batchPromises = batch.map(async (pageId) => {
        try {
          if (options.publishDate) {
            // Scheduled publish
            await this.schedulePublish(pageId, options.publishDate);
            return { success: true, pageId, type: 'scheduled' };
          } else {
            // Immediate publish
            await this.publishPageNow(pageId);
            return { success: true, pageId, type: 'immediate' };
          }
        } catch (error) {
          return { success: false, pageId, error: error.message };
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
   * @param {string} pageId - Optional page ID to filter by
   * @returns {Array} Publishing history entries
   */
  getPublishingHistory(pageId = null) {
    if (pageId) {
      return this.publishHistory.filter(entry => entry.pageId === pageId);
    }
    return this.publishHistory;
  }

  /**
   * Generate preview URL for draft content
   * Note: HubSpot automatically provides preview URLs, this method retrieves them
   * @param {string} pageId - Page ID
   * @returns {Promise<Object>} { previewUrl, url }
   */
  async getPreviewUrl(pageId) {
    try {
      const page = await this.pagesManager.getPage(pageId);

      // HubSpot preview URL pattern
      const previewUrl = page.url ? `${page.url}?preview=true` : null;

      return {
        previewUrl,
        url: page.url,
        state: page.state
      };
    } catch (error) {
      throw new Error(`Failed to get preview URL for ${pageId}: ${error.message}`);
    }
  }

  /**
   * Publish page with full workflow (validation → snapshot → publish)
   * @param {string} pageId - Page ID
   * @param {Object} options - { immediate: true/false, publishDate?, validateSEO: boolean }
   * @returns {Promise<Object>} { success, page?, snapshot?, validation?, error? }
   */
  async publishWithWorkflow(pageId, options = {}) {
    console.log(`🚀 Starting publish workflow for page ${pageId}...`);

    try {
      // Step 1: Validate
      console.log('📋 Step 1/3: Validation');
      const validation = await this.validateBeforePublish(pageId);

      if (!validation.valid) {
        console.log(`❌ Validation failed with ${validation.errors.length} errors`);
        return {
          success: false,
          validation,
          error: 'Validation failed'
        };
      }

      // Step 2: Create snapshot
      console.log('📸 Step 2/3: Creating snapshot');
      const snapshot = await this.createPublishSnapshot(pageId);

      // Step 3: Publish
      console.log('🚀 Step 3/3: Publishing');
      let page;
      if (options.publishDate) {
        await this.schedulePublish(pageId, options.publishDate);
        page = await this.pagesManager.getPage(pageId);
      } else {
        page = await this.publishPageNow(pageId);
      }

      console.log(`✅ Publish workflow complete`);

      return {
        success: true,
        page,
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
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const controller = new HubSpotCMSPublishingController({
    pageType: args.includes('--site-pages') ? 'site-pages' : 'landing-pages'
  });

  (async () => {
    try {
      switch (command) {
        case 'publish':
          const pageId = args[1];
          if (!pageId) throw new Error('Usage: publish <pageId>');
          const result = await controller.publishPageNow(pageId);
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'schedule':
          const schedPageId = args[1];
          const publishDate = args[2];
          if (!schedPageId || !publishDate) {
            throw new Error('Usage: schedule <pageId> <publishDate>');
          }
          await controller.schedulePublish(schedPageId, publishDate);
          break;

        case 'validate':
          const valPageId = args[1];
          if (!valPageId) throw new Error('Usage: validate <pageId>');
          const validation = await controller.validateBeforePublish(valPageId);
          console.log(JSON.stringify(validation, null, 2));
          break;

        case 'status':
          const statusPageId = args[1];
          if (!statusPageId) throw new Error('Usage: status <pageId>');
          const status = await controller.getPublishingStatus(statusPageId);
          console.log(JSON.stringify(status, null, 2));
          break;

        case 'snapshot':
          const snapPageId = args[1];
          if (!snapPageId) throw new Error('Usage: snapshot <pageId>');
          const snapshot = await controller.createPublishSnapshot(snapPageId);
          console.log(JSON.stringify(snapshot, null, 2));
          break;

        case 'rollback':
          const rollbackPageId = args[1];
          const snapshotId = args[2];
          if (!rollbackPageId || !snapshotId) {
            throw new Error('Usage: rollback <pageId> <snapshotId>');
          }
          const restored = await controller.rollbackToVersion(rollbackPageId, snapshotId);
          console.log(JSON.stringify(restored, null, 2));
          break;

        case 'workflow':
          const workflowPageId = args[1];
          if (!workflowPageId) throw new Error('Usage: workflow <pageId> [--schedule "2025-12-01T15:00:00Z"]');

          const scheduleIndex = args.indexOf('--schedule');
          const workflowOptions = {};
          if (scheduleIndex !== -1) {
            workflowOptions.publishDate = args[scheduleIndex + 1];
          }

          const workflowResult = await controller.publishWithWorkflow(workflowPageId, workflowOptions);
          console.log(JSON.stringify(workflowResult, null, 2));
          break;

        default:
          console.log('Usage: hubspot-cms-publishing-controller.js <command> [args]');
          console.log('Commands:');
          console.log('  publish <pageId>                    - Publish page immediately');
          console.log('  schedule <pageId> <date>            - Schedule page for future publish');
          console.log('  validate <pageId>                   - Validate page before publish');
          console.log('  status <pageId>                     - Get publishing status');
          console.log('  snapshot <pageId>                   - Create snapshot for rollback');
          console.log('  rollback <pageId> <snapshotId>      - Rollback to snapshot');
          console.log('  workflow <pageId> [--schedule date] - Full publish workflow');
          console.log('Options:');
          console.log('  --site-pages                        - Use site-pages instead of landing-pages');
          process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = HubSpotCMSPublishingController;
