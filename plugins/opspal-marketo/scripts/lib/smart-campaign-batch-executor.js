/**
 * Smart Campaign Batch Executor
 *
 * Executes batch operations across multiple campaigns with rate limiting,
 * error handling, and progress tracking.
 *
 * @module smart-campaign-batch-executor
 * @version 1.0.0
 */

const rateLimitManager = require('./rate-limit-manager');
const crudWrapper = require('./smart-campaign-crud-wrapper');

/**
 * Default batch configuration
 */
const DEFAULT_CONFIG = {
  concurrency: 3,           // Max concurrent operations
  delayBetween: 200,        // Delay between operations (ms)
  stopOnError: false,       // Stop all on first error
  validateFirst: true,      // Pre-validate before execution
  dryRun: false,            // Report what would happen without executing
  onProgress: null,         // Progress callback
  onError: null,            // Error callback
  onComplete: null,         // Completion callback
};

/**
 * Batch execution result structure
 */
class BatchResult {
  constructor() {
    this.succeeded = [];
    this.failed = [];
    this.skipped = [];
    this.startTime = Date.now();
    this.endTime = null;
  }

  complete() {
    this.endTime = Date.now();
  }

  get duration() {
    return (this.endTime || Date.now()) - this.startTime;
  }

  get total() {
    return this.succeeded.length + this.failed.length + this.skipped.length;
  }

  get success() {
    return this.failed.length === 0;
  }

  toJSON() {
    return {
      success: this.success,
      summary: {
        total: this.total,
        succeeded: this.succeeded.length,
        failed: this.failed.length,
        skipped: this.skipped.length,
        durationMs: this.duration,
      },
      succeeded: this.succeeded,
      failed: this.failed,
      skipped: this.skipped,
    };
  }
}

/**
 * Batch Executor class
 */
class BatchExecutor {
  /**
   * Create a new BatchExecutor
   * @param {Object} mcpClient - MCP client for API calls
   * @param {Object} config - Executor configuration
   */
  constructor(mcpClient, config = {}) {
    this.mcpClient = mcpClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Clone multiple campaigns
   * @param {Array} sources - Array of source campaign definitions
   * @param {Object} targetFolder - Target folder for clones
   * @param {Object} options - Clone options
   * @returns {Promise<BatchResult>} Batch results
   */
  async cloneCampaigns(sources, targetFolder, options = {}) {
    const config = { ...this.config, ...options };
    const result = new BatchResult();

    // Validate inputs
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('Sources must be a non-empty array');
    }

    if (!targetFolder || !targetFolder.id) {
      throw new Error('Valid target folder is required');
    }

    // Process each source
    await this.processInBatches(sources, async (source, index) => {
      const campaignId = typeof source === 'number' ? source : source.id;
      const name = source.name || `Clone ${campaignId} - ${index + 1}`;

      // Dry run check
      if (config.dryRun) {
        result.skipped.push({
          source: campaignId,
          name,
          reason: 'Dry run mode',
        });
        return;
      }

      try {
        const cloneResult = await crudWrapper.cloneCampaign(this.mcpClient, {
          campaignId,
          name,
          folder: targetFolder,
          description: source.description,
        });

        if (cloneResult.success) {
          result.succeeded.push({
            source: campaignId,
            name,
            newId: cloneResult.data?.campaign?.id,
          });
        } else {
          throw new Error(cloneResult.error?.message || 'Clone failed');
        }
      } catch (error) {
        result.failed.push({
          source: campaignId,
          name,
          error: error.message,
        });

        if (config.onError) {
          config.onError(error, { source: campaignId, name });
        }

        if (config.stopOnError) {
          throw error;
        }
      }

      this.reportProgress(config, index + 1, sources.length);
    }, config);

    result.complete();

    if (config.onComplete) {
      config.onComplete(result);
    }

    return result;
  }

  /**
   * Delete multiple campaigns
   * @param {Array} campaignIds - Array of campaign IDs to delete
   * @param {Object} options - Delete options
   * @returns {Promise<BatchResult>} Batch results
   */
  async deleteCampaigns(campaignIds, options = {}) {
    const config = { ...this.config, ...options };
    const result = new BatchResult();

    // Validate inputs
    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      throw new Error('Campaign IDs must be a non-empty array');
    }

    // Pre-validation phase if enabled
    if (config.validateFirst) {
      const validationResults = await this.validateForDeletion(campaignIds);

      for (const validation of validationResults) {
        if (!validation.canDelete) {
          result.skipped.push({
            campaignId: validation.campaignId,
            reason: validation.reason,
          });
        }
      }

      // Filter to only deletable campaigns
      const deletable = validationResults
        .filter(v => v.canDelete)
        .map(v => v.campaignId);

      campaignIds = deletable;
    }

    // Process deletions
    await this.processInBatches(campaignIds, async (campaignId, index) => {
      // Dry run check
      if (config.dryRun) {
        result.skipped.push({
          campaignId,
          reason: 'Dry run mode',
        });
        return;
      }

      try {
        const deleteResult = await crudWrapper.deleteCampaign(
          this.mcpClient,
          campaignId,
          { force: options.force, deactivateFirst: options.deactivateFirst }
        );

        if (deleteResult.success) {
          result.succeeded.push({ campaignId });
        } else {
          throw new Error(deleteResult.error?.message || 'Delete failed');
        }
      } catch (error) {
        result.failed.push({
          campaignId,
          error: error.message,
        });

        if (config.onError) {
          config.onError(error, { campaignId });
        }

        if (config.stopOnError) {
          throw error;
        }
      }

      this.reportProgress(config, index + 1, campaignIds.length);
    }, config);

    result.complete();

    if (config.onComplete) {
      config.onComplete(result);
    }

    return result;
  }

  /**
   * Activate multiple campaigns
   * @param {Array} campaignIds - Array of campaign IDs to activate
   * @param {Object} options - Activation options
   * @returns {Promise<BatchResult>} Batch results
   */
  async activateCampaigns(campaignIds, options = {}) {
    const config = { ...this.config, ...options };
    const result = new BatchResult();

    // Pre-validation phase if enabled
    if (config.validateFirst) {
      const validationResults = await this.validateForActivation(campaignIds);

      for (const validation of validationResults) {
        if (!validation.canActivate) {
          result.skipped.push({
            campaignId: validation.campaignId,
            reason: validation.reason,
          });
        }
      }

      // Filter to only activatable campaigns
      campaignIds = validationResults
        .filter(v => v.canActivate)
        .map(v => v.campaignId);
    }

    // Process activations
    await this.processInBatches(campaignIds, async (campaignId, index) => {
      if (config.dryRun) {
        result.skipped.push({
          campaignId,
          reason: 'Dry run mode',
        });
        return;
      }

      try {
        const activateResult = await crudWrapper.activateCampaign(
          this.mcpClient,
          campaignId,
          { validateSmartList: false, skipIfActive: true }
        );

        if (activateResult.success) {
          result.succeeded.push({
            campaignId,
            skipped: activateResult.skipped,
          });
        } else {
          throw new Error(activateResult.error?.message || 'Activation failed');
        }
      } catch (error) {
        result.failed.push({
          campaignId,
          error: error.message,
        });

        if (config.onError) {
          config.onError(error, { campaignId });
        }

        if (config.stopOnError) {
          throw error;
        }
      }

      this.reportProgress(config, index + 1, campaignIds.length);
    }, config);

    result.complete();

    if (config.onComplete) {
      config.onComplete(result);
    }

    return result;
  }

  /**
   * Deactivate multiple campaigns
   * @param {Array} campaignIds - Array of campaign IDs to deactivate
   * @param {Object} options - Deactivation options
   * @returns {Promise<BatchResult>} Batch results
   */
  async deactivateCampaigns(campaignIds, options = {}) {
    const config = { ...this.config, ...options };
    const result = new BatchResult();

    await this.processInBatches(campaignIds, async (campaignId, index) => {
      if (config.dryRun) {
        result.skipped.push({
          campaignId,
          reason: 'Dry run mode',
        });
        return;
      }

      try {
        const deactivateResult = await crudWrapper.deactivateCampaign(
          this.mcpClient,
          campaignId
        );

        if (deactivateResult.success) {
          result.succeeded.push({
            campaignId,
            skipped: deactivateResult.skipped,
          });
        } else {
          throw new Error(deactivateResult.error?.message || 'Deactivation failed');
        }
      } catch (error) {
        result.failed.push({
          campaignId,
          error: error.message,
        });

        if (config.onError) {
          config.onError(error, { campaignId });
        }

        if (config.stopOnError) {
          throw error;
        }
      }

      this.reportProgress(config, index + 1, campaignIds.length);
    }, config);

    result.complete();

    if (config.onComplete) {
      config.onComplete(result);
    }

    return result;
  }

  /**
   * Update multiple campaigns
   * @param {Array} updates - Array of update objects {campaignId, name?, description?}
   * @param {Object} options - Update options
   * @returns {Promise<BatchResult>} Batch results
   */
  async updateCampaigns(updates, options = {}) {
    const config = { ...this.config, ...options };
    const result = new BatchResult();

    await this.processInBatches(updates, async (update, index) => {
      if (config.dryRun) {
        result.skipped.push({
          campaignId: update.campaignId,
          reason: 'Dry run mode',
        });
        return;
      }

      try {
        const updateResult = await crudWrapper.updateCampaign(
          this.mcpClient,
          update
        );

        if (updateResult.success) {
          result.succeeded.push({
            campaignId: update.campaignId,
            updated: { name: update.name, description: update.description },
          });
        } else {
          throw new Error(updateResult.error?.message || 'Update failed');
        }
      } catch (error) {
        result.failed.push({
          campaignId: update.campaignId,
          error: error.message,
        });

        if (config.onError) {
          config.onError(error, { campaignId: update.campaignId });
        }

        if (config.stopOnError) {
          throw error;
        }
      }

      this.reportProgress(config, index + 1, updates.length);
    }, config);

    result.complete();

    if (config.onComplete) {
      config.onComplete(result);
    }

    return result;
  }

  /**
   * Process items in controlled batches
   */
  async processInBatches(items, processor, config) {
    const queue = [...items];
    const inProgress = new Set();
    let index = 0;

    return new Promise((resolve, reject) => {
      const processNext = async () => {
        // Check if done
        if (queue.length === 0 && inProgress.size === 0) {
          resolve();
          return;
        }

        // Process up to concurrency limit
        while (inProgress.size < config.concurrency && queue.length > 0) {
          const item = queue.shift();
          const currentIndex = index++;

          // Wait for rate limit
          await rateLimitManager.waitIfNeeded();

          const promise = processor(item, currentIndex)
            .then(() => {
              rateLimitManager.recordCall();
              inProgress.delete(promise);
              // Delay between operations
              return sleep(config.delayBetween);
            })
            .then(() => processNext())
            .catch((error) => {
              inProgress.delete(promise);
              if (config.stopOnError) {
                reject(error);
              } else {
                processNext();
              }
            });

          inProgress.add(promise);
        }
      };

      processNext();
    });
  }

  /**
   * Validate campaigns for deletion
   */
  async validateForDeletion(campaignIds) {
    const results = [];

    for (const campaignId of campaignIds) {
      try {
        const campaignResult = await crudWrapper.getCampaign(this.mcpClient, campaignId);

        if (!campaignResult.success) {
          results.push({
            campaignId,
            canDelete: false,
            reason: 'Campaign not found',
          });
          continue;
        }

        const campaign = campaignResult.data.campaign;

        if (campaign.isSystem) {
          results.push({
            campaignId,
            canDelete: false,
            reason: 'System campaign cannot be deleted',
          });
          continue;
        }

        results.push({
          campaignId,
          canDelete: true,
          isActive: campaign.isActive,
          name: campaign.name,
        });
      } catch (error) {
        results.push({
          campaignId,
          canDelete: false,
          reason: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Validate campaigns for activation
   */
  async validateForActivation(campaignIds) {
    const results = [];

    for (const campaignId of campaignIds) {
      try {
        const campaignResult = await crudWrapper.getCampaign(this.mcpClient, campaignId);

        if (!campaignResult.success) {
          results.push({
            campaignId,
            canActivate: false,
            reason: 'Campaign not found',
          });
          continue;
        }

        const campaign = campaignResult.data.campaign;

        if (campaign.isActive) {
          results.push({
            campaignId,
            canActivate: true,
            reason: 'Already active',
            willSkip: true,
          });
          continue;
        }

        if (campaign.type !== 'trigger') {
          results.push({
            campaignId,
            canActivate: false,
            reason: 'Only trigger campaigns can be activated',
          });
          continue;
        }

        // Check for triggers
        const smartListResult = await crudWrapper.getSmartList(this.mcpClient, campaignId, true);

        if (smartListResult.success) {
          const triggers = smartListResult.data?.triggers || [];
          if (triggers.length === 0) {
            results.push({
              campaignId,
              canActivate: false,
              reason: 'No triggers defined',
            });
            continue;
          }
        }

        results.push({
          campaignId,
          canActivate: true,
          name: campaign.name,
        });
      } catch (error) {
        results.push({
          campaignId,
          canActivate: false,
          reason: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Report progress
   */
  reportProgress(config, completed, total) {
    if (config.onProgress) {
      config.onProgress({
        completed,
        total,
        percentage: Math.round((completed / total) * 100),
      });
    }
  }
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a new BatchExecutor instance
 */
function createBatchExecutor(mcpClient, config = {}) {
  return new BatchExecutor(mcpClient, config);
}

module.exports = {
  BatchExecutor,
  createBatchExecutor,
  BatchResult,
  DEFAULT_CONFIG,
};
