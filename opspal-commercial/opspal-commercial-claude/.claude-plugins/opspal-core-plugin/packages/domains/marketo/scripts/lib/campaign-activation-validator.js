/**
 * Campaign Activation Validator for Marketo
 *
 * Pre-activation validation for Marketo smart campaigns:
 * - Asset approval status (emails, landing pages)
 * - Smart list configuration
 * - Flow step validation
 * - Trigger conflict detection
 * - Rate limit assessment
 *
 * @module campaign-activation-validator
 * @version 1.0.0
 */

'use strict';

// Validation severity levels
const SEVERITY = {
  BLOCKER: 'blocker',    // Cannot activate
  WARNING: 'warning',    // Can activate but risky
  INFO: 'info',          // Informational
};

// Default validation rules
const DEFAULT_RULES = {
  // Asset approval validation
  assetApproval: {
    enabled: true,
    checkEmails: true,
    checkLandingPages: true,
    checkForms: true,
    blockOnUnapproved: true,
  },
  // Smart list validation
  smartList: {
    enabled: true,
    requireFilters: true,
    maxTriggers: 5,
    warnOnBroadTriggers: true,
  },
  // Flow step validation
  flowSteps: {
    enabled: true,
    maxSteps: 25,
    maxWaitDays: 30,
    checkChoiceSteps: true,
  },
  // Trigger conflict detection
  conflictDetection: {
    enabled: true,
    checkSameTrigger: true,
    checkFieldLoops: true,
  },
  // Rate limit assessment
  rateLimit: {
    enabled: true,
    maxDailyVolume: 10000,
    warnThreshold: 5000,
  },
};

/**
 * Create a validation result
 * @param {string} rule - Rule name
 * @param {string} severity - Severity level
 * @param {string} message - Human-readable message
 * @param {Object} details - Additional details
 * @returns {Object} Validation result
 */
function createResult(rule, severity, message, details = {}) {
  return {
    rule,
    severity,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate email assets referenced by campaign
 * @param {Object} campaign - Campaign configuration
 * @param {Array} emails - Email assets
 * @param {Object} rules - Validation rules
 * @returns {Array} Validation results
 */
function validateEmailAssets(campaign, emails, rules = DEFAULT_RULES.assetApproval) {
  const results = [];

  if (!rules.enabled || !rules.checkEmails) {
    return results;
  }

  // Extract email IDs from flow steps
  const referencedEmails = new Set();
  for (const step of (campaign.flowSteps || [])) {
    if (step.type === 'send_email' || step.type === 'sendEmail') {
      const emailId = step.emailId || step.assetId;
      if (emailId) referencedEmails.add(emailId);
    }
  }

  // Check each referenced email
  for (const emailId of referencedEmails) {
    const email = emails.find(e => e.id === emailId || e.id === Number(emailId));

    if (!email) {
      results.push(createResult(
        'email_asset',
        SEVERITY.BLOCKER,
        `Email asset ${emailId} not found`,
        { emailId }
      ));
      continue;
    }

    if (email.status !== 'approved') {
      results.push(createResult(
        'email_approval',
        rules.blockOnUnapproved ? SEVERITY.BLOCKER : SEVERITY.WARNING,
        `Email "${email.name}" (${emailId}) is not approved (status: ${email.status})`,
        { emailId, emailName: email.name, status: email.status }
      ));
    }

    // Check for draft changes
    if (email.status === 'approved' && email.hasDraft) {
      results.push(createResult(
        'email_draft',
        SEVERITY.WARNING,
        `Email "${email.name}" has unapproved draft changes`,
        { emailId, emailName: email.name }
      ));
    }
  }

  return results;
}

/**
 * Validate landing page assets referenced by campaign
 * @param {Object} campaign - Campaign configuration
 * @param {Array} landingPages - Landing page assets
 * @param {Object} rules - Validation rules
 * @returns {Array} Validation results
 */
function validateLandingPageAssets(campaign, landingPages, rules = DEFAULT_RULES.assetApproval) {
  const results = [];

  if (!rules.enabled || !rules.checkLandingPages) {
    return results;
  }

  // Extract LP IDs from various sources
  const referencedLPs = new Set();

  // Check flow steps
  for (const step of (campaign.flowSteps || [])) {
    if (step.type === 'redirect_to_page' || step.landingPageId) {
      const lpId = step.landingPageId || step.assetId;
      if (lpId) referencedLPs.add(lpId);
    }
  }

  // Check emails for LP links (if emails provided)
  // This would need email content analysis

  // Check each referenced LP
  for (const lpId of referencedLPs) {
    const lp = landingPages.find(l => l.id === lpId || l.id === Number(lpId));

    if (!lp) {
      results.push(createResult(
        'landing_page_asset',
        SEVERITY.WARNING,
        `Landing page ${lpId} not found`,
        { landingPageId: lpId }
      ));
      continue;
    }

    if (lp.status !== 'approved') {
      results.push(createResult(
        'landing_page_approval',
        rules.blockOnUnapproved ? SEVERITY.BLOCKER : SEVERITY.WARNING,
        `Landing page "${lp.name}" (${lpId}) is not approved (status: ${lp.status})`,
        { landingPageId: lpId, landingPageName: lp.name, status: lp.status }
      ));
    }
  }

  return results;
}

/**
 * Validate smart list configuration
 * @param {Object} campaign - Campaign configuration
 * @param {Object} rules - Validation rules
 * @returns {Array} Validation results
 */
function validateSmartList(campaign, rules = DEFAULT_RULES.smartList) {
  const results = [];

  if (!rules.enabled) {
    return results;
  }

  const smartList = campaign.smartList || {};
  const triggers = smartList.triggers || [];
  const filters = smartList.filters || [];

  // Check for triggers (required for trigger campaigns)
  if (campaign.type === 'trigger' && triggers.length === 0) {
    results.push(createResult(
      'smart_list_triggers',
      SEVERITY.BLOCKER,
      'Trigger campaign has no triggers defined',
      { campaignType: campaign.type }
    ));
  }

  // Check for filters
  if (rules.requireFilters && filters.length === 0 && triggers.length > 0) {
    results.push(createResult(
      'smart_list_filters',
      SEVERITY.WARNING,
      'Campaign has triggers but no filters - may process more leads than expected',
      { triggerCount: triggers.length, filterCount: 0 }
    ));
  }

  // Check trigger count
  if (triggers.length > rules.maxTriggers) {
    results.push(createResult(
      'smart_list_trigger_count',
      SEVERITY.WARNING,
      `Campaign has ${triggers.length} triggers (max recommended: ${rules.maxTriggers})`,
      { triggerCount: triggers.length, maxTriggers: rules.maxTriggers }
    ));
  }

  // Check for broad triggers
  if (rules.warnOnBroadTriggers) {
    const broadTriggers = ['Data Value Changes', 'Fills Out Form', 'Visits Web Page'];
    for (const trigger of triggers) {
      const triggerName = trigger.name || trigger.type;
      if (broadTriggers.some(bt => triggerName.includes(bt))) {
        // Check if it has constraints
        const hasConstraints = trigger.constraints && Object.keys(trigger.constraints).length > 0;
        if (!hasConstraints) {
          results.push(createResult(
            'broad_trigger',
            SEVERITY.WARNING,
            `Trigger "${triggerName}" has no constraints - may fire frequently`,
            { trigger: triggerName }
          ));
        }
      }
    }
  }

  return results;
}

/**
 * Validate flow steps
 * @param {Object} campaign - Campaign configuration
 * @param {Object} rules - Validation rules
 * @returns {Array} Validation results
 */
function validateFlowSteps(campaign, rules = DEFAULT_RULES.flowSteps) {
  const results = [];

  if (!rules.enabled) {
    return results;
  }

  const flowSteps = campaign.flowSteps || [];

  // Check flow step count
  if (flowSteps.length === 0) {
    results.push(createResult(
      'flow_steps_empty',
      SEVERITY.WARNING,
      'Campaign has no flow steps defined',
      {}
    ));
    return results;
  }

  if (flowSteps.length > rules.maxSteps) {
    results.push(createResult(
      'flow_steps_count',
      SEVERITY.WARNING,
      `Campaign has ${flowSteps.length} flow steps (max recommended: ${rules.maxSteps})`,
      { stepCount: flowSteps.length, maxSteps: rules.maxSteps }
    ));
  }

  // Check wait steps
  let totalWaitDays = 0;
  for (const step of flowSteps) {
    if (step.type === 'wait' || step.type === 'Wait') {
      const waitDuration = parseWaitDuration(step);
      totalWaitDays += waitDuration;
    }
  }

  if (totalWaitDays > rules.maxWaitDays) {
    results.push(createResult(
      'wait_duration',
      SEVERITY.WARNING,
      `Total wait time is ${totalWaitDays} days (max recommended: ${rules.maxWaitDays})`,
      { totalWaitDays, maxWaitDays: rules.maxWaitDays }
    ));
  }

  // Check choice steps
  if (rules.checkChoiceSteps) {
    for (let i = 0; i < flowSteps.length; i++) {
      const step = flowSteps[i];
      if (step.choices && step.choices.length > 0) {
        // Check for default choice
        const hasDefault = step.choices.some(c => c.isDefault || c.type === 'default');
        if (!hasDefault && !step.defaultAction) {
          results.push(createResult(
            'choice_default',
            SEVERITY.WARNING,
            `Flow step ${i + 1} has choices but no default action`,
            { stepIndex: i, stepType: step.type }
          ));
        }
      }
    }
  }

  // Check for dangerous flow steps
  const dangerousSteps = ['Delete Lead', 'Change Owner', 'Add to SFDC Campaign'];
  for (let i = 0; i < flowSteps.length; i++) {
    const step = flowSteps[i];
    const stepType = step.type || step.name;
    if (dangerousSteps.some(ds => stepType.includes(ds))) {
      results.push(createResult(
        'dangerous_step',
        SEVERITY.WARNING,
        `Flow step ${i + 1} contains "${stepType}" - verify this is intentional`,
        { stepIndex: i, stepType }
      ));
    }
  }

  return results;
}

/**
 * Parse wait step duration to days
 * @param {Object} step - Wait step
 * @returns {number} Duration in days
 */
function parseWaitDuration(step) {
  const duration = step.duration || step.waitDuration || 0;
  const unit = (step.unit || step.waitUnit || 'days').toLowerCase();

  switch (unit) {
    case 'minutes':
      return duration / (60 * 24);
    case 'hours':
      return duration / 24;
    case 'days':
      return duration;
    case 'weeks':
      return duration * 7;
    default:
      return duration;
  }
}

/**
 * Detect trigger conflicts with other campaigns
 * @param {Object} campaign - Campaign to validate
 * @param {Array} otherCampaigns - Other active campaigns
 * @param {Object} rules - Validation rules
 * @returns {Array} Validation results
 */
function detectTriggerConflicts(campaign, otherCampaigns, rules = DEFAULT_RULES.conflictDetection) {
  const results = [];

  if (!rules.enabled || !rules.checkSameTrigger) {
    return results;
  }

  const campaignTriggers = campaign.smartList?.triggers || [];

  for (const otherCampaign of otherCampaigns) {
    if (otherCampaign.id === campaign.id) continue;
    if (otherCampaign.status !== 'active') continue;

    const otherTriggers = otherCampaign.smartList?.triggers || [];

    for (const trigger of campaignTriggers) {
      for (const otherTrigger of otherTriggers) {
        if (triggersMatch(trigger, otherTrigger)) {
          results.push(createResult(
            'trigger_conflict',
            SEVERITY.WARNING,
            `Trigger "${trigger.name || trigger.type}" also used in active campaign "${otherCampaign.name}"`,
            {
              trigger: trigger.name || trigger.type,
              conflictingCampaign: otherCampaign.name,
              conflictingCampaignId: otherCampaign.id,
            }
          ));
        }
      }
    }
  }

  return results;
}

/**
 * Check if two triggers match (potential conflict)
 * @param {Object} trigger1 - First trigger
 * @param {Object} trigger2 - Second trigger
 * @returns {boolean} Whether triggers match
 */
function triggersMatch(trigger1, trigger2) {
  const type1 = (trigger1.type || trigger1.name || '').toLowerCase();
  const type2 = (trigger2.type || trigger2.name || '').toLowerCase();

  if (type1 !== type2) return false;

  // Check if constraints overlap (simplified)
  const field1 = trigger1.field || trigger1.attribute;
  const field2 = trigger2.field || trigger2.attribute;

  if (field1 && field2 && field1 !== field2) return false;

  return true;
}

/**
 * Estimate campaign volume and check rate limits
 * @param {Object} campaign - Campaign configuration
 * @param {Object} estimatedVolume - Volume estimates
 * @param {Object} rules - Validation rules
 * @returns {Array} Validation results
 */
function validateRateLimits(campaign, estimatedVolume = {}, rules = DEFAULT_RULES.rateLimit) {
  const results = [];

  if (!rules.enabled) {
    return results;
  }

  const dailyVolume = estimatedVolume.daily || estimatedVolume.estimated || 0;

  if (dailyVolume > rules.maxDailyVolume) {
    results.push(createResult(
      'rate_limit_exceeded',
      SEVERITY.WARNING,
      `Estimated daily volume (${dailyVolume}) exceeds recommended limit (${rules.maxDailyVolume})`,
      { estimatedVolume: dailyVolume, maxVolume: rules.maxDailyVolume }
    ));
  } else if (dailyVolume > rules.warnThreshold) {
    results.push(createResult(
      'rate_limit_warning',
      SEVERITY.INFO,
      `Estimated daily volume (${dailyVolume}) is above warning threshold (${rules.warnThreshold})`,
      { estimatedVolume: dailyVolume, warnThreshold: rules.warnThreshold }
    ));
  }

  return results;
}

/**
 * Run full campaign validation
 * @param {Object} campaign - Campaign to validate
 * @param {Object} assets - Associated assets (emails, LPs, etc.)
 * @param {Array} otherCampaigns - Other campaigns for conflict detection
 * @param {Object} options - Validation options
 * @returns {Object} Validation report
 */
function validateCampaign(campaign, assets = {}, otherCampaigns = [], options = {}) {
  const rules = { ...DEFAULT_RULES, ...options.rules };
  const results = [];

  // Run all validations
  results.push(...validateEmailAssets(campaign, assets.emails || [], rules.assetApproval));
  results.push(...validateLandingPageAssets(campaign, assets.landingPages || [], rules.assetApproval));
  results.push(...validateSmartList(campaign, rules.smartList));
  results.push(...validateFlowSteps(campaign, rules.flowSteps));
  results.push(...detectTriggerConflicts(campaign, otherCampaigns, rules.conflictDetection));
  results.push(...validateRateLimits(campaign, options.estimatedVolume || {}, rules.rateLimit));

  // Categorize results
  const blockers = results.filter(r => r.severity === SEVERITY.BLOCKER);
  const warnings = results.filter(r => r.severity === SEVERITY.WARNING);
  const infos = results.filter(r => r.severity === SEVERITY.INFO);

  // Determine if campaign can be activated
  const canActivate = blockers.length === 0;

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
    },
    canActivate,
    summary: {
      blockers: blockers.length,
      warnings: warnings.length,
      infos: infos.length,
    },
    blockers,
    warnings,
    infos,
    allResults: results,
    validatedAt: new Date().toISOString(),
  };
}

module.exports = {
  SEVERITY,
  DEFAULT_RULES,
  createResult,
  validateEmailAssets,
  validateLandingPageAssets,
  validateSmartList,
  validateFlowSteps,
  detectTriggerConflicts,
  validateRateLimits,
  validateCampaign,
};
