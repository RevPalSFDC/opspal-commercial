/**
 * Smart Campaign CRUD Wrapper
 *
 * Wraps Smart Campaign CRUD operations with validation, error handling,
 * and rate limiting. Provides safe operations with pre-validation checks.
 *
 * @module smart-campaign-crud-wrapper
 * @version 1.0.0
 */

const rateLimitManager = require('./rate-limit-manager');

/**
 * Error codes and their meanings
 */
const ERROR_CODES = {
  601: { message: 'Access token invalid', recoverable: true, action: 'refresh_token' },
  602: { message: 'Access token expired', recoverable: true, action: 'refresh_token' },
  606: { message: 'Rate limit exceeded', recoverable: true, action: 'wait_retry' },
  607: { message: 'Daily quota exceeded', recoverable: false, action: 'stop' },
  610: { message: 'Resource not found', recoverable: false, action: 'verify_id' },
  611: { message: 'System error', recoverable: true, action: 'retry' },
  615: { message: 'Concurrent request limit', recoverable: true, action: 'serialize' },
  709: { message: 'Asset modification blocked', recoverable: false, action: 'check_state' },
  711: { message: 'Name already exists', recoverable: false, action: 'unique_name' },
};

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
};

/**
 * Wrap an API operation with error handling and retries
 * @param {Function} operation - Async operation to execute
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Operation result
 */
async function wrapOperation(operation, options = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options };
  let lastError;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      // Wait for rate limit
      await rateLimitManager.waitIfNeeded();

      // Execute operation
      const result = await operation();

      // Record successful call
      rateLimitManager.recordCall();

      // Check for API-level errors in success response
      if (result && result.errors && result.errors.length > 0) {
        const errorCode = result.errors[0].code;
        const errorInfo = ERROR_CODES[errorCode];

        if (errorInfo && errorInfo.recoverable && attempt < config.maxAttempts) {
          lastError = new CrudError(errorInfo.message, errorCode, errorInfo.action);
          await handleRecoverableError(errorCode, attempt, config);
          continue;
        }

        throw new CrudError(
          result.errors[0].message || errorInfo?.message || 'Unknown error',
          errorCode,
          errorInfo?.action || 'unknown'
        );
      }

      return {
        success: true,
        data: result,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;

      // Check if error is recoverable
      const errorCode = error.code || error.errorCode;
      const errorInfo = ERROR_CODES[errorCode];

      if (errorInfo && errorInfo.recoverable && attempt < config.maxAttempts) {
        await handleRecoverableError(errorCode, attempt, config);
        continue;
      }

      // Non-recoverable or max attempts reached
      break;
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: config.maxAttempts,
  };
}

/**
 * Handle recoverable errors with appropriate delays
 */
async function handleRecoverableError(errorCode, attempt, config) {
  let delay;

  switch (errorCode) {
    case 606: // Rate limit
      delay = 20000; // Marketo rate limit window
      break;
    case 615: // Concurrent limit
      delay = 1000 * attempt;
      break;
    default:
      delay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
  }

  await sleep(delay);
}

/**
 * Create a Smart Campaign with validation
 * @param {Object} mcpClient - MCP client for API calls
 * @param {Object} params - Campaign parameters
 * @returns {Promise<Object>} Created campaign
 */
async function createCampaign(mcpClient, params) {
  const { name, folder, description } = params;

  // Validate required fields
  if (!name || !folder) {
    throw new CrudError('Name and folder are required', 'VALIDATION', 'fix_params');
  }

  // Validate folder structure
  if (!folder.id || !folder.type) {
    throw new CrudError('Folder must have id and type', 'VALIDATION', 'fix_params');
  }

  if (!['Folder', 'Program'].includes(folder.type)) {
    throw new CrudError('Folder type must be "Folder" or "Program"', 'VALIDATION', 'fix_params');
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_create({ name, folder, description });
  });
}

/**
 * Get a Smart Campaign with validation
 * @param {Object} mcpClient - MCP client for API calls
 * @param {number} campaignId - Campaign ID
 * @returns {Promise<Object>} Campaign details
 */
async function getCampaign(mcpClient, campaignId) {
  if (!campaignId || typeof campaignId !== 'number') {
    throw new CrudError('Valid campaign ID is required', 'VALIDATION', 'fix_params');
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_get({ campaignId });
  });
}

/**
 * Update a Smart Campaign with validation
 * @param {Object} mcpClient - MCP client for API calls
 * @param {Object} params - Update parameters
 * @returns {Promise<Object>} Updated campaign
 */
async function updateCampaign(mcpClient, params) {
  const { campaignId, name, description } = params;

  if (!campaignId) {
    throw new CrudError('Campaign ID is required', 'VALIDATION', 'fix_params');
  }

  if (!name && !description) {
    throw new CrudError('At least name or description must be provided', 'VALIDATION', 'fix_params');
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_update({ campaignId, name, description });
  });
}

/**
 * Clone a Smart Campaign with validation
 * @param {Object} mcpClient - MCP client for API calls
 * @param {Object} params - Clone parameters
 * @returns {Promise<Object>} Cloned campaign
 */
async function cloneCampaign(mcpClient, params) {
  const { campaignId, name, folder, description } = params;

  // Validate required fields
  if (!campaignId || !name || !folder) {
    throw new CrudError('Campaign ID, name, and folder are required', 'VALIDATION', 'fix_params');
  }

  // Pre-validation: verify source exists
  const sourceResult = await getCampaign(mcpClient, campaignId);
  if (!sourceResult.success) {
    throw new CrudError(`Source campaign ${campaignId} not found`, '610', 'verify_id');
  }

  // Pre-validation: check for name collision
  const existingResult = await wrapOperation(async () => {
    return await mcpClient.campaign_list({
      folder: JSON.stringify(folder),
      name: name
    });
  });

  if (existingResult.success && existingResult.data?.campaigns) {
    const collision = existingResult.data.campaigns.find(c => c.name === name);
    if (collision) {
      throw new CrudError(
        `Campaign "${name}" already exists in target folder`,
        '711',
        'unique_name'
      );
    }
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_clone({ campaignId, name, folder, description });
  });
}

/**
 * Delete a Smart Campaign with validation
 * @param {Object} mcpClient - MCP client for API calls
 * @param {number} campaignId - Campaign ID
 * @param {Object} options - Delete options
 * @returns {Promise<Object>} Deletion result
 */
async function deleteCampaign(mcpClient, campaignId, options = {}) {
  const { force = false, deactivateFirst = true } = options;

  if (!campaignId) {
    throw new CrudError('Campaign ID is required', 'VALIDATION', 'fix_params');
  }

  // Pre-validation: verify campaign exists
  const campaignResult = await getCampaign(mcpClient, campaignId);
  if (!campaignResult.success) {
    throw new CrudError(`Campaign ${campaignId} not found`, '610', 'verify_id');
  }

  const campaign = campaignResult.data?.campaign;

  // Check if campaign is system campaign
  if (campaign?.isSystem) {
    throw new CrudError('Cannot delete system campaign', '709', 'check_state');
  }

  // Check if campaign is active
  if (campaign?.isActive) {
    if (!force && !deactivateFirst) {
      throw new CrudError(
        'Campaign is active. Set force=true or deactivateFirst=true to proceed',
        '709',
        'check_state'
      );
    }

    if (deactivateFirst) {
      // Deactivate first
      const deactivateResult = await wrapOperation(async () => {
        return await mcpClient.campaign_deactivate({ campaignId });
      });

      if (!deactivateResult.success) {
        throw new CrudError(
          `Failed to deactivate campaign: ${deactivateResult.error?.message}`,
          deactivateResult.error?.code || 'DEACTIVATE_FAILED',
          'deactivate'
        );
      }
    }
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_delete({ campaignId });
  });
}

/**
 * Get Smart List for a campaign
 * @param {Object} mcpClient - MCP client for API calls
 * @param {number} campaignId - Campaign ID
 * @param {boolean} includeRules - Include rule definitions
 * @returns {Promise<Object>} Smart List details
 */
async function getSmartList(mcpClient, campaignId, includeRules = true) {
  if (!campaignId) {
    throw new CrudError('Campaign ID is required', 'VALIDATION', 'fix_params');
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_get_smart_list({ campaignId, includeRules });
  });
}

/**
 * Activate a campaign with pre-validation
 * @param {Object} mcpClient - MCP client for API calls
 * @param {number} campaignId - Campaign ID
 * @param {Object} options - Activation options
 * @returns {Promise<Object>} Activation result
 */
async function activateCampaign(mcpClient, campaignId, options = {}) {
  const { validateSmartList = true, skipIfActive = true } = options;

  if (!campaignId) {
    throw new CrudError('Campaign ID is required', 'VALIDATION', 'fix_params');
  }

  // Get campaign details
  const campaignResult = await getCampaign(mcpClient, campaignId);
  if (!campaignResult.success) {
    throw new CrudError(`Campaign ${campaignId} not found`, '610', 'verify_id');
  }

  const campaign = campaignResult.data?.campaign;

  // Skip if already active
  if (campaign?.isActive && skipIfActive) {
    return {
      success: true,
      data: { message: 'Campaign already active', campaign },
      attempts: 0,
      skipped: true,
    };
  }

  // Verify it's a trigger campaign
  if (campaign?.type !== 'trigger') {
    throw new CrudError(
      'Only trigger campaigns can be activated. Use schedule for batch campaigns.',
      'VALIDATION',
      'check_type'
    );
  }

  // Validate Smart List has triggers
  if (validateSmartList) {
    const smartListResult = await getSmartList(mcpClient, campaignId, true);
    if (smartListResult.success && smartListResult.data) {
      const triggers = smartListResult.data.triggers || [];
      if (triggers.length === 0) {
        throw new CrudError(
          'Campaign has no triggers. Add at least one trigger before activating.',
          'VALIDATION',
          'add_trigger'
        );
      }
    }
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_activate({ campaignId });
  });
}

/**
 * Deactivate a campaign safely
 * @param {Object} mcpClient - MCP client for API calls
 * @param {number} campaignId - Campaign ID
 * @returns {Promise<Object>} Deactivation result
 */
async function deactivateCampaign(mcpClient, campaignId) {
  if (!campaignId) {
    throw new CrudError('Campaign ID is required', 'VALIDATION', 'fix_params');
  }

  // Get campaign to check current state
  const campaignResult = await getCampaign(mcpClient, campaignId);
  if (!campaignResult.success) {
    throw new CrudError(`Campaign ${campaignId} not found`, '610', 'verify_id');
  }

  const campaign = campaignResult.data?.campaign;

  // Skip if already inactive
  if (!campaign?.isActive) {
    return {
      success: true,
      data: { message: 'Campaign already inactive', campaign },
      attempts: 0,
      skipped: true,
    };
  }

  return wrapOperation(async () => {
    return await mcpClient.campaign_deactivate({ campaignId });
  });
}

/**
 * Custom error class for CRUD operations
 */
class CrudError extends Error {
  constructor(message, code, action) {
    super(message);
    this.name = 'CrudError';
    this.code = code;
    this.action = action;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      action: this.action,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  // Core operations
  createCampaign,
  getCampaign,
  updateCampaign,
  cloneCampaign,
  deleteCampaign,
  getSmartList,
  activateCampaign,
  deactivateCampaign,

  // Utilities
  wrapOperation,
  CrudError,
  ERROR_CODES,
  DEFAULT_RETRY_CONFIG,
};
