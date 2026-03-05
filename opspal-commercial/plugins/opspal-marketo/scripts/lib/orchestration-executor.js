/**
 * Orchestration Executor for Marketo Workflows
 *
 * Executes multi-step automation workflows with:
 * - Checkpoint-based state management
 * - Error recovery and retry logic
 * - Rate limit awareness
 * - Progress tracking
 *
 * @module orchestration-executor
 * @version 1.0.0
 */

const rateLimitManager = require('./rate-limit-manager');
const bulkExportManager = require('./bulk-export-manager');
const bulkImportManager = require('./bulk-import-manager');

/**
 * Orchestration state manager
 */
class OrchestrationState {
  constructor(orchestrationId) {
    this.id = orchestrationId;
    this.checkpoints = [];
    this.currentStep = null;
    this.data = {};
    this.errors = [];
    this.startTime = new Date().toISOString();
    this.endTime = null;
  }

  checkpoint(stepName, data = {}) {
    this.checkpoints.push({
      step: stepName,
      timestamp: new Date().toISOString(),
      data,
    });
    this.currentStep = stepName;
  }

  getLastCheckpoint() {
    return this.checkpoints[this.checkpoints.length - 1];
  }

  canResume(stepName) {
    return this.checkpoints.some(cp => cp.step === stepName);
  }

  addError(step, error) {
    this.errors.push({
      step,
      error: error.message || error,
      timestamp: new Date().toISOString(),
    });
  }

  complete() {
    this.endTime = new Date().toISOString();
    this.currentStep = 'completed';
  }

  serialize() {
    return JSON.stringify({
      id: this.id,
      checkpoints: this.checkpoints,
      currentStep: this.currentStep,
      data: this.data,
      errors: this.errors,
      startTime: this.startTime,
      endTime: this.endTime,
    }, null, 2);
  }

  static deserialize(json) {
    const obj = JSON.parse(json);
    const state = new OrchestrationState(obj.id);
    state.checkpoints = obj.checkpoints;
    state.currentStep = obj.currentStep;
    state.data = obj.data;
    state.errors = obj.errors;
    state.startTime = obj.startTime;
    state.endTime = obj.endTime;
    return state;
  }
}

/**
 * Retry configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [604, 606, 608, 611, 615, 1029],
};

/**
 * Execute operation with retry logic
 *
 * @param {Function} operation - Async operation to execute
 * @param {Object} [options] - Retry options
 * @returns {Promise<any>} Operation result
 */
async function withRetry(operation, options = {}) {
  const config = { ...RETRY_CONFIG, ...options };
  let lastError;
  let delay = config.initialDelay;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      await rateLimitManager.waitIfNeeded();
      return await operation();
    } catch (error) {
      lastError = error;
      const errorCode = extractErrorCode(error);

      // Non-retryable error
      if (!config.retryableErrors.includes(errorCode)) {
        throw error;
      }

      // Daily quota exceeded - no retry
      if (errorCode === 607) {
        throw new Error('Daily API quota exceeded. Cannot retry until midnight UTC.');
      }

      // Last attempt
      if (attempt === config.maxRetries) {
        throw error;
      }

      console.log(`Attempt ${attempt}/${config.maxRetries} failed (${errorCode}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Extract error code from Marketo error
 *
 * @param {Error} error - Error object
 * @returns {number} Error code or 0
 */
function extractErrorCode(error) {
  const match = error.message?.match(/\[(\d+)\]/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Execute program launch workflow
 *
 * @param {Object} config - Launch configuration
 * @param {number} config.templateProgramId - Template program ID
 * @param {string} config.campaignName - New campaign name
 * @param {number} config.targetFolderId - Target folder ID
 * @param {Array} config.tokens - Token values
 * @param {string} [config.scheduleDate] - Batch campaign schedule
 * @param {OrchestrationState} [existingState] - Resume from state
 * @returns {Promise<OrchestrationState>} Final state
 */
async function executeProgramLaunch(config, existingState = null) {
  const state = existingState || new OrchestrationState(`launch-${Date.now()}`);
  const pause = (ms = 200) => new Promise(r => setTimeout(r, ms));

  try {
    // Step 1: Clone program
    if (!state.canResume('clone')) {
      const cloneResult = await withRetry(() =>
        globalThis.mcp__marketo__program_clone({
          programId: config.templateProgramId,
          name: config.campaignName,
          folder: { id: config.targetFolderId, type: 'Folder' },
        })
      );

      state.data.programId = cloneResult.result[0].id;
      state.checkpoint('clone', { programId: state.data.programId });
      console.log(`✓ Program cloned: ${state.data.programId}`);
    }

    // Step 2: Update tokens
    if (!state.canResume('tokens')) {
      await withRetry(() =>
        globalThis.mcp__marketo__program_tokens_update({
          folderId: state.data.programId,
          folderType: 'Program',
          tokens: config.tokens,
        })
      );

      state.checkpoint('tokens');
      console.log(`✓ Tokens updated: ${config.tokens.length} tokens`);
    }

    // Step 3: Get program assets
    if (!state.canResume('discover')) {
      const programDetails = await withRetry(() =>
        globalThis.mcp__marketo__program_get({
          programId: state.data.programId,
        })
      );

      state.data.assets = {
        emails: programDetails.result[0].emails || [],
        forms: programDetails.result[0].forms || [],
        landingPages: programDetails.result[0].landingPages || [],
        campaigns: programDetails.result[0].smartCampaigns || [],
      };

      state.checkpoint('discover', { assetCounts: {
        emails: state.data.assets.emails.length,
        forms: state.data.assets.forms.length,
        landingPages: state.data.assets.landingPages.length,
        campaigns: state.data.assets.campaigns.length,
      }});
      console.log(`✓ Assets discovered`);
    }

    // Step 4: Approve forms
    if (!state.canResume('approve-forms')) {
      for (const form of state.data.assets.forms) {
        try {
          await withRetry(() =>
            globalThis.mcp__marketo__form_approve({ formId: form.id })
          );
          console.log(`  ✓ Form approved: ${form.name || form.id}`);
        } catch (error) {
          state.addError('approve-form', error);
        }
        await pause();
      }
      state.checkpoint('approve-forms');
    }

    // Step 5: Approve emails
    if (!state.canResume('approve-emails')) {
      for (const email of state.data.assets.emails) {
        try {
          await withRetry(() =>
            globalThis.mcp__marketo__email_approve({ emailId: email.id })
          );
          console.log(`  ✓ Email approved: ${email.name || email.id}`);
        } catch (error) {
          state.addError('approve-email', error);
        }
        await pause();
      }
      state.checkpoint('approve-emails');
    }

    // Step 6: Approve landing pages
    if (!state.canResume('approve-lps')) {
      for (const lp of state.data.assets.landingPages) {
        try {
          await withRetry(() =>
            globalThis.mcp__marketo__landing_page_approve({ landingPageId: lp.id })
          );
          console.log(`  ✓ Landing page approved: ${lp.name || lp.id}`);
        } catch (error) {
          state.addError('approve-lp', error);
        }
        await pause();
      }
      state.checkpoint('approve-lps');
    }

    // Step 7: Activate campaigns
    if (!state.canResume('activate')) {
      for (const campaign of state.data.assets.campaigns) {
        try {
          if (campaign.type === 'trigger') {
            await withRetry(() =>
              globalThis.mcp__marketo__campaign_activate({ campaignId: campaign.id })
            );
            console.log(`  ✓ Trigger activated: ${campaign.name || campaign.id}`);
          } else if (campaign.type === 'batch' && config.scheduleDate) {
            await withRetry(() =>
              globalThis.mcp__marketo__campaign_schedule({
                campaignId: campaign.id,
                runAt: config.scheduleDate,
              })
            );
            console.log(`  ✓ Batch scheduled: ${campaign.name || campaign.id}`);
          }
        } catch (error) {
          state.addError('activate-campaign', error);
        }
        await pause();
      }
      state.checkpoint('activate');
    }

    state.complete();
    console.log(`\n✅ Program launch complete: ${state.data.programId}`);
    return state;

  } catch (error) {
    state.addError(state.currentStep || 'unknown', error);
    throw error;
  }
}

/**
 * Execute lead deduplication workflow
 *
 * @param {Object} config - Dedup configuration
 * @param {string} [config.lookupField='email'] - Dedupe field
 * @param {string} [config.winnerCriteria='score'] - Winner selection
 * @param {boolean} [config.dryRun=true] - Don't actually merge
 * @param {Object} [config.dateFilter] - Date filter for export
 * @returns {Promise<Object>} Dedup results
 */
async function executeDeduplication(config) {
  const {
    lookupField = 'email',
    winnerCriteria = 'score',
    dryRun = true,
    dateFilter,
  } = config;

  const results = {
    exportedLeads: 0,
    duplicateGroups: 0,
    totalDuplicates: 0,
    mergedLeads: 0,
    errors: [],
    startTime: new Date().toISOString(),
  };

  const pause = (ms = 300) => new Promise(r => setTimeout(r, ms));

  try {
    // Step 1: Export leads
    console.log('Step 1: Exporting leads...');

    const filter = dateFilter || {
      createdAt: {
        startAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        endAt: new Date().toISOString(),
      },
    };

    const exportResult = await bulkExportManager.exportLeads({
      fields: ['id', lookupField, 'firstName', 'lastName', 'score', 'createdAt'],
      filter,
    });

    const leads = bulkExportManager.parseCSV(exportResult.file);
    results.exportedLeads = leads.length;
    console.log(`  ✓ Exported ${leads.length} leads`);

    // Step 2: Group duplicates
    console.log('Step 2: Finding duplicates...');

    const groups = {};
    for (const lead of leads) {
      const key = (lead[lookupField] || '').toLowerCase().trim();
      if (!key) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }

    const duplicateGroups = Object.entries(groups).filter(([_, g]) => g.length > 1);
    results.duplicateGroups = duplicateGroups.length;
    results.totalDuplicates = duplicateGroups.reduce((sum, [_, g]) => sum + g.length - 1, 0);
    console.log(`  ✓ Found ${results.duplicateGroups} duplicate groups (${results.totalDuplicates} duplicates)`);

    // Step 3: Merge duplicates
    if (!dryRun && duplicateGroups.length > 0) {
      console.log('Step 3: Merging duplicates...');

      for (const [key, group] of duplicateGroups) {
        // Sort by winner criteria
        const sorted = sortByWinnerCriteria(group, winnerCriteria);
        const winnerId = parseInt(sorted[0].id);
        const loserIds = sorted.slice(1).map(l => parseInt(l.id));

        // Merge in batches of 3
        while (loserIds.length > 0) {
          const batch = loserIds.splice(0, 3);

          try {
            await withRetry(() =>
              globalThis.mcp__marketo__lead_merge({
                winnerId,
                loserIds: batch,
                mergeInCRM: true,
              })
            );
            results.mergedLeads += batch.length;
          } catch (error) {
            results.errors.push({
              winnerId,
              loserIds: batch,
              error: error.message,
            });
          }

          await pause();
        }
      }

      console.log(`  ✓ Merged ${results.mergedLeads} leads`);
    } else if (dryRun) {
      console.log('Step 3: Dry run - no merges performed');
    }

    results.endTime = new Date().toISOString();
    return results;

  } catch (error) {
    results.error = error.message;
    results.endTime = new Date().toISOString();
    throw error;
  }
}

/**
 * Sort leads by winner criteria
 *
 * @param {Array} leads - Leads to sort
 * @param {string} criteria - Sorting criteria
 * @returns {Array} Sorted leads
 */
function sortByWinnerCriteria(leads, criteria) {
  switch (criteria) {
    case 'score':
      return leads.sort((a, b) => (parseInt(b.score) || 0) - (parseInt(a.score) || 0));
    case 'createdAt':
      return leads.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'completeness':
      return leads.sort((a, b) =>
        Object.values(b).filter(v => v).length -
        Object.values(a).filter(v => v).length
      );
    default:
      return leads;
  }
}

/**
 * Execute daily sync workflow
 *
 * @param {Object} config - Sync configuration
 * @param {number} [config.lookbackHours=24] - Hours to look back
 * @param {Array} [config.activityTypes] - Activity types to export
 * @returns {Promise<Object>} Sync results
 */
async function executeDailySync(config = {}) {
  const {
    lookbackHours = 24,
    activityTypes = [1, 2, 6, 7, 10, 11, 12, 13, 22, 23, 24],
  } = config;

  const results = {
    leadExport: null,
    activityExport: null,
    startTime: new Date().toISOString(),
  };

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - (lookbackHours * 60 * 60 * 1000));

  const dateFilter = {
    startAt: startTime.toISOString(),
    endAt: endTime.toISOString(),
  };

  try {
    // Export leads updated in timeframe
    console.log('Exporting updated leads...');
    results.leadExport = await bulkExportManager.exportLeads({
      fields: ['id', 'email', 'firstName', 'lastName', 'score', 'leadStatus', 'updatedAt'],
      filter: { updatedAt: dateFilter },
    });
    console.log(`  ✓ Leads exported: ${results.leadExport.recordCount}`);

    // Export activities
    console.log('Exporting activities...');
    results.activityExport = await bulkExportManager.exportActivities({
      activityTypeIds: activityTypes,
      filter: { createdAt: dateFilter },
    });
    console.log(`  ✓ Activities exported: ${results.activityExport.recordCount}`);

    results.endTime = new Date().toISOString();
    return results;

  } catch (error) {
    results.error = error.message;
    results.endTime = new Date().toISOString();
    throw error;
  }
}

// Export module functions
module.exports = {
  OrchestrationState,
  withRetry,
  extractErrorCode,
  executeProgramLaunch,
  executeDeduplication,
  executeDailySync,
  sortByWinnerCriteria,
  RETRY_CONFIG,
};
