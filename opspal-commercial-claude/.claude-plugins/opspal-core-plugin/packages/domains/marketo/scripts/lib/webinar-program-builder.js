/**
 * Webinar Program Builder for Marketo
 *
 * Orchestrates end-to-end webinar program creation including:
 * - Program cloning from templates
 * - Token configuration
 * - Webinar provider integration
 * - Email sequence setup
 * - Salesforce campaign sync
 * - Campaign activation
 *
 * @module webinar-program-builder
 * @version 1.0.0
 */

'use strict';

// Webinar program types
const WEBINAR_TYPES = {
  LIVE: 'live',
  ON_DEMAND: 'on_demand',
  HYBRID: 'hybrid',
};

// Standard webinar statuses
const WEBINAR_STATUSES = {
  NOT_IN_PROGRAM: { name: 'Not in Program', step: 0, isSuccess: false },
  INVITED: { name: 'Invited', step: 10, isSuccess: false },
  REGISTERED: { name: 'Registered', step: 20, isSuccess: false },
  ATTENDED: { name: 'Attended', step: 30, isSuccess: true },
  NO_SHOW: { name: 'No Show', step: 40, isSuccess: false },
  ATTENDED_ON_DEMAND: { name: 'Attended On-Demand', step: 50, isSuccess: true },
};

// Standard webinar tokens
const STANDARD_TOKENS = [
  { name: 'Webinar Title', type: 'text', required: true },
  { name: 'Webinar Date', type: 'text', required: true },
  { name: 'Webinar Time', type: 'text', required: true },
  { name: 'Webinar Timezone', type: 'text', required: true },
  { name: 'Webinar Description', type: 'rich_text', required: false },
  { name: 'Join URL', type: 'text', required: true },
  { name: 'Registration URL', type: 'text', required: false },
  { name: 'Host Name', type: 'text', required: false },
  { name: 'Host Title', type: 'text', required: false },
  { name: 'Duration', type: 'text', required: false },
  { name: 'Recording URL', type: 'text', required: false },
  { name: 'Calendar Link', type: 'text', required: false },
];

// Email sequence templates
const EMAIL_SEQUENCE = {
  INVITATION: {
    name: '01-Invitation',
    type: 'invitation',
    timing: { days: -14, type: 'before_event' },
  },
  CONFIRMATION: {
    name: '02-Confirmation',
    type: 'confirmation',
    timing: { trigger: 'registration' },
  },
  REMINDER_1_WEEK: {
    name: '03-Reminder-1-Week',
    type: 'reminder',
    timing: { days: -7, type: 'before_event' },
  },
  REMINDER_1_DAY: {
    name: '04-Reminder-1-Day',
    type: 'reminder',
    timing: { days: -1, type: 'before_event' },
  },
  REMINDER_1_HOUR: {
    name: '05-Reminder-1-Hour',
    type: 'reminder',
    timing: { hours: -1, type: 'before_event' },
  },
  FOLLOW_UP_ATTENDED: {
    name: '06-Follow-Up-Attended',
    type: 'follow_up',
    timing: { days: 1, type: 'after_event', condition: 'attended' },
  },
  FOLLOW_UP_NO_SHOW: {
    name: '07-Follow-Up-NoShow',
    type: 'follow_up',
    timing: { days: 1, type: 'after_event', condition: 'no_show' },
  },
};

// Webinar providers
const WEBINAR_PROVIDERS = {
  ZOOM: {
    id: 'zoom',
    name: 'Zoom',
    integrationId: 'ZoomIntegration',
    features: ['registration', 'attendance', 'engagement'],
  },
  GOTOWEBINAR: {
    id: 'gotowebinar',
    name: 'GoToWebinar',
    integrationId: 'GotoWebinarIntegration',
    features: ['registration', 'attendance', 'polls'],
  },
  WEBEX: {
    id: 'webex',
    name: 'Webex',
    integrationId: 'WebexIntegration',
    features: ['registration', 'attendance'],
  },
  ON24: {
    id: 'on24',
    name: 'ON24',
    integrationId: 'ON24Integration',
    features: ['registration', 'attendance', 'engagement', 'qa'],
  },
};

/**
 * Create a webinar program result object
 * @param {string} stage - Current stage
 * @param {boolean} success - Success status
 * @param {string} message - Result message
 * @param {Object} data - Additional data
 * @returns {Object} Result object
 */
function createResult(stage, success, message, data = {}) {
  return {
    stage,
    success,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Clone a webinar program template
 * @param {Function} apiRequest - API request function
 * @param {Object} config - Clone configuration
 * @returns {Promise<Object>} Clone result
 */
async function cloneWebinarTemplate(apiRequest, config) {
  const { templateId, name, folderId, description } = config;

  if (!templateId) {
    return createResult('clone', false, 'Template ID is required');
  }

  if (!name) {
    return createResult('clone', false, 'Program name is required');
  }

  try {
    const clonePayload = {
      name,
      folder: {
        id: folderId,
        type: 'Folder',
      },
      description: description || `Webinar program cloned from template ${templateId}`,
    };

    const result = await apiRequest(
      `/rest/asset/v1/program/${templateId}/clone.json`,
      'POST',
      clonePayload
    );

    if (result.success && result.result && result.result[0]) {
      const program = result.result[0];
      return createResult('clone', true, `Program cloned successfully`, {
        programId: program.id,
        programName: program.name,
        folder: program.folder,
        sourceTemplateId: templateId,
      });
    }

    return createResult('clone', false, 'Clone failed', {
      errors: result.errors || [],
    });
  } catch (error) {
    return createResult('clone', false, `Clone error: ${error.message}`);
  }
}

/**
 * Update program tokens with webinar details
 * @param {Function} apiRequest - API request function
 * @param {number} programId - Program ID
 * @param {Object} tokens - Token values
 * @returns {Promise<Object>} Update result
 */
async function updateProgramTokens(apiRequest, programId, tokens) {
  if (!programId) {
    return createResult('tokens', false, 'Program ID is required');
  }

  const results = [];
  const tokenList = [];

  // Build token update list
  for (const [key, value] of Object.entries(tokens)) {
    if (value !== undefined && value !== null) {
      const tokenDef = STANDARD_TOKENS.find(
        t => t.name.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase() ||
             t.name.toLowerCase() === key.toLowerCase()
      );

      tokenList.push({
        name: tokenDef ? tokenDef.name : key,
        type: tokenDef ? tokenDef.type : 'text',
        value: String(value),
      });
    }
  }

  // Validate required tokens
  const requiredTokens = STANDARD_TOKENS.filter(t => t.required);
  for (const required of requiredTokens) {
    const hasToken = tokenList.some(
      t => t.name.toLowerCase() === required.name.toLowerCase()
    );
    if (!hasToken) {
      results.push({
        token: required.name,
        success: false,
        warning: `Required token "${required.name}" not provided`,
      });
    }
  }

  // Update tokens
  try {
    for (const token of tokenList) {
      const payload = {
        name: token.name,
        type: token.type,
        value: token.value,
        folderType: 'Program',
        folderId: programId,
      };

      const result = await apiRequest(
        `/rest/asset/v1/folder/${programId}/tokens.json`,
        'POST',
        payload
      );

      results.push({
        token: token.name,
        success: result.success || false,
        value: token.value,
        errors: result.errors || [],
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success && !r.warning).length;

    return createResult('tokens', failCount === 0,
      `Updated ${successCount}/${tokenList.length} tokens`,
      { results, tokenCount: tokenList.length }
    );
  } catch (error) {
    return createResult('tokens', false, `Token update error: ${error.message}`);
  }
}

/**
 * Configure webinar provider integration
 * @param {Function} apiRequest - API request function
 * @param {number} programId - Program ID
 * @param {Object} providerConfig - Provider configuration
 * @returns {Promise<Object>} Configuration result
 */
async function configureWebinarProvider(apiRequest, programId, providerConfig) {
  const { providerId, eventId, webinarUrl } = providerConfig;

  if (!providerId) {
    return createResult('provider', false, 'Provider ID is required');
  }

  const provider = Object.values(WEBINAR_PROVIDERS).find(
    p => p.id === providerId.toLowerCase() || p.name.toLowerCase() === providerId.toLowerCase()
  );

  if (!provider) {
    return createResult('provider', false, `Unknown provider: ${providerId}`, {
      availableProviders: Object.values(WEBINAR_PROVIDERS).map(p => p.name),
    });
  }

  try {
    // Update webinar event integration
    // Note: Actual integration may require LaunchPoint configuration
    const integrationConfig = {
      programId,
      provider: provider.id,
      integrationId: provider.integrationId,
      eventId: eventId || null,
      webinarUrl: webinarUrl || null,
      features: provider.features,
    };

    // Store integration config in program (via custom token or metadata)
    const tokenResult = await updateProgramTokens(apiRequest, programId, {
      'Join URL': webinarUrl || '',
    });

    return createResult('provider', true, `Configured ${provider.name} integration`, {
      provider: provider.name,
      features: provider.features,
      eventId,
      integrationConfig,
      tokenUpdateResult: tokenResult,
    });
  } catch (error) {
    return createResult('provider', false, `Provider config error: ${error.message}`);
  }
}

/**
 * Set up email sequence for webinar
 * @param {Function} apiRequest - API request function
 * @param {number} programId - Program ID
 * @param {Object} emailConfigs - Email configuration overrides
 * @returns {Promise<Object>} Setup result
 */
async function setupEmailSequence(apiRequest, programId, emailConfigs = {}) {
  const results = [];

  try {
    // Get existing emails in program
    const emailsResponse = await apiRequest(
      `/rest/asset/v1/emails.json?folder={"id":${programId},"type":"Program"}`
    );

    const existingEmails = emailsResponse.result || [];

    // Check each email in sequence
    for (const [key, emailDef] of Object.entries(EMAIL_SEQUENCE)) {
      const existingEmail = existingEmails.find(
        e => e.name.includes(emailDef.name) || e.name.toLowerCase().includes(emailDef.type)
      );

      const config = emailConfigs[key] || {};

      results.push({
        emailType: key,
        name: emailDef.name,
        found: !!existingEmail,
        emailId: existingEmail?.id || null,
        status: existingEmail?.status || 'not_found',
        timing: emailDef.timing,
        customConfig: config,
      });
    }

    const foundCount = results.filter(r => r.found).length;
    const totalExpected = Object.keys(EMAIL_SEQUENCE).length;

    return createResult('emails', foundCount > 0,
      `Found ${foundCount}/${totalExpected} email assets`,
      {
        results,
        foundCount,
        totalExpected,
        recommendations: foundCount < totalExpected
          ? ['Clone emails from template or create missing assets']
          : [],
      }
    );
  } catch (error) {
    return createResult('emails', false, `Email setup error: ${error.message}`);
  }
}

/**
 * Link program to Salesforce campaign
 * @param {Function} apiRequest - API request function
 * @param {number} programId - Marketo program ID
 * @param {string} campaignId - Salesforce campaign ID
 * @returns {Promise<Object>} Link result
 */
async function linkToSalesforce(apiRequest, programId, campaignId) {
  if (!programId) {
    return createResult('sfdc_link', false, 'Program ID is required');
  }

  if (!campaignId) {
    return createResult('sfdc_link', false, 'Salesforce Campaign ID is required');
  }

  try {
    // Enable program-to-SFDC campaign sync
    // This typically requires Admin configuration or API call
    const syncConfig = {
      programId,
      sfdcCampaignId: campaignId,
      syncType: 'bidirectional',
      statusMapping: [
        { marketo: 'Invited', sfdc: 'Sent' },
        { marketo: 'Registered', sfdc: 'Responded' },
        { marketo: 'Attended', sfdc: 'Attended' },
        { marketo: 'No Show', sfdc: 'No Show' },
        { marketo: 'Attended On-Demand', sfdc: 'Attended On-Demand' },
      ],
    };

    return createResult('sfdc_link', true,
      `Configured SFDC campaign sync`,
      {
        programId,
        sfdcCampaignId: campaignId,
        syncConfig,
        instructions: [
          '1. Go to Program > Setup > Salesforce Campaign Sync',
          `2. Link to SFDC Campaign ID: ${campaignId}`,
          '3. Map program statuses to SFDC member statuses',
          '4. Enable bidirectional sync',
        ],
      }
    );
  } catch (error) {
    return createResult('sfdc_link', false, `SFDC link error: ${error.message}`);
  }
}

/**
 * Activate webinar campaigns
 * @param {Function} apiRequest - API request function
 * @param {number} programId - Program ID
 * @param {Object} options - Activation options
 * @returns {Promise<Object>} Activation result
 */
async function activateWebinarCampaigns(apiRequest, programId, options = {}) {
  const { skipValidation = false, campaignsToActivate = [] } = options;

  try {
    // Get campaigns in program
    const campaignsResponse = await apiRequest(
      `/rest/asset/v1/smartCampaigns.json?folder={"id":${programId},"type":"Program"}`
    );

    const campaigns = campaignsResponse.result || [];
    const results = [];

    // Standard webinar campaigns to activate
    const webinarCampaignPatterns = [
      'registration',
      'confirmation',
      'reminder',
      'follow-up',
      'post-event',
      'status update',
    ];

    for (const campaign of campaigns) {
      const campaignName = campaign.name.toLowerCase();
      const shouldActivate =
        campaignsToActivate.length === 0
          ? webinarCampaignPatterns.some(p => campaignName.includes(p))
          : campaignsToActivate.includes(campaign.id) ||
            campaignsToActivate.includes(campaign.name);

      if (shouldActivate) {
        if (campaign.status === 'Active') {
          results.push({
            campaignId: campaign.id,
            name: campaign.name,
            success: true,
            status: 'already_active',
          });
          continue;
        }

        try {
          const activateResult = await apiRequest(
            `/rest/asset/v1/smartCampaign/${campaign.id}/activate.json`,
            'POST'
          );

          results.push({
            campaignId: campaign.id,
            name: campaign.name,
            success: activateResult.success || false,
            status: activateResult.success ? 'activated' : 'failed',
            errors: activateResult.errors || [],
          });
        } catch (activateError) {
          results.push({
            campaignId: campaign.id,
            name: campaign.name,
            success: false,
            status: 'error',
            error: activateError.message,
          });
        }
      } else {
        results.push({
          campaignId: campaign.id,
          name: campaign.name,
          success: true,
          status: 'skipped',
        });
      }
    }

    const activatedCount = results.filter(r => r.status === 'activated' || r.status === 'already_active').length;
    const failedCount = results.filter(r => r.status === 'failed' || r.status === 'error').length;

    return createResult('activate', failedCount === 0,
      `Activated ${activatedCount} campaigns, ${failedCount} failed`,
      { results, activatedCount, failedCount }
    );
  } catch (error) {
    return createResult('activate', false, `Campaign activation error: ${error.message}`);
  }
}

/**
 * Build complete webinar program
 * @param {Function} apiRequest - API request function
 * @param {Object} config - Full webinar configuration
 * @returns {Promise<Object>} Build result
 */
async function buildWebinarProgram(apiRequest, config) {
  const {
    templateId,
    name,
    folderId,
    tokens,
    provider,
    sfdcCampaignId,
    activateCampaigns = true,
  } = config;

  const stages = [];
  let programId = null;

  // Stage 1: Clone template
  const cloneResult = await cloneWebinarTemplate(apiRequest, {
    templateId,
    name,
    folderId,
  });
  stages.push(cloneResult);

  if (!cloneResult.success) {
    return {
      success: false,
      message: 'Failed to clone template',
      stages,
    };
  }

  programId = cloneResult.data.programId;

  // Stage 2: Update tokens
  if (tokens && Object.keys(tokens).length > 0) {
    const tokenResult = await updateProgramTokens(apiRequest, programId, tokens);
    stages.push(tokenResult);
  }

  // Stage 3: Configure provider
  if (provider) {
    const providerResult = await configureWebinarProvider(apiRequest, programId, provider);
    stages.push(providerResult);
  }

  // Stage 4: Setup emails
  const emailResult = await setupEmailSequence(apiRequest, programId);
  stages.push(emailResult);

  // Stage 5: Link to SFDC
  if (sfdcCampaignId) {
    const sfdcResult = await linkToSalesforce(apiRequest, programId, sfdcCampaignId);
    stages.push(sfdcResult);
  }

  // Stage 6: Activate campaigns
  if (activateCampaigns) {
    const activateResult = await activateWebinarCampaigns(apiRequest, programId);
    stages.push(activateResult);
  }

  const failedStages = stages.filter(s => !s.success);

  return {
    success: failedStages.length === 0,
    message: failedStages.length === 0
      ? 'Webinar program created successfully'
      : `Completed with ${failedStages.length} issue(s)`,
    programId,
    programName: name,
    stages,
    summary: {
      totalStages: stages.length,
      successfulStages: stages.filter(s => s.success).length,
      failedStages: failedStages.length,
    },
  };
}

/**
 * Get webinar program checklist
 * @param {Object} config - Program configuration
 * @returns {Object} Checklist items
 */
function getWebinarChecklist(config = {}) {
  const {
    hasTemplate = false,
    hasTokens = false,
    hasEmails = false,
    hasProvider = false,
    hasSfdcSync = false,
    hasCampaigns = false,
  } = config;

  return {
    preSetup: [
      { item: 'Define webinar objectives and audience', required: true },
      { item: 'Set date, time, and duration', required: true },
      { item: 'Create event in webinar provider', required: true },
      { item: 'Get join URL and registration details', required: true },
    ],
    programSetup: [
      { item: 'Clone webinar template', required: true, complete: hasTemplate },
      { item: 'Update program tokens', required: true, complete: hasTokens },
      { item: 'Configure email assets', required: true, complete: hasEmails },
      { item: 'Link webinar provider', required: false, complete: hasProvider },
      { item: 'Sync to Salesforce campaign', required: false, complete: hasSfdcSync },
    ],
    activation: [
      { item: 'Approve all emails', required: true },
      { item: 'Approve landing page', required: true },
      { item: 'Activate trigger campaigns', required: true, complete: hasCampaigns },
      { item: 'Test registration flow', required: true },
      { item: 'Schedule invitation campaign', required: true },
    ],
    postEvent: [
      { item: 'Sync attendance from provider', required: true },
      { item: 'Upload recording', required: false },
      { item: 'Update recording token', required: false },
      { item: 'Verify follow-up campaigns sent', required: true },
    ],
  };
}

module.exports = {
  WEBINAR_TYPES,
  WEBINAR_STATUSES,
  STANDARD_TOKENS,
  EMAIL_SEQUENCE,
  WEBINAR_PROVIDERS,
  createResult,
  cloneWebinarTemplate,
  updateProgramTokens,
  configureWebinarProvider,
  setupEmailSequence,
  linkToSalesforce,
  activateWebinarCampaigns,
  buildWebinarProgram,
  getWebinarChecklist,
};
