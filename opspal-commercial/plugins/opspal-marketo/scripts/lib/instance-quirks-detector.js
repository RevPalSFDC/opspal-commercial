/**
 * Instance Quirks Detector for Marketo
 *
 * Auto-detects instance-specific customizations:
 * - Custom fields and their types
 * - Custom channels and tags
 * - Custom activity types
 * - Label customizations
 * - Workspace configurations
 * - Integration settings
 *
 * Based on the Salesforce org-quirks-detector.js pattern.
 *
 * @module instance-quirks-detector
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Default output directory
const DEFAULT_OUTPUT_DIR = 'portals';

/**
 * Quirks detection categories
 */
const QUIRK_CATEGORIES = {
  CUSTOM_FIELDS: 'customFields',
  CUSTOM_CHANNELS: 'customChannels',
  CUSTOM_TAGS: 'customTags',
  CUSTOM_ACTIVITIES: 'customActivities',
  WORKSPACES: 'workspaces',
  INTEGRATIONS: 'integrations',
  NAMING_CONVENTIONS: 'namingConventions',
};

/**
 * Analyze lead fields for customizations
 * @param {Array} fields - Lead field definitions from schema
 * @returns {Object} Field analysis
 */
function analyzeLeadFields(fields) {
  const customFields = [];
  const standardFields = [];
  const fieldsByType = {};

  for (const field of fields) {
    const fieldInfo = {
      name: field.name || field.rest?.name,
      displayName: field.displayName || field.name,
      dataType: field.dataType,
      length: field.length,
      isReadOnly: field.readOnly || false,
      isUpdateBlocked: field.updateBlocked || false,
    };

    // Categorize by type
    const type = field.dataType || 'unknown';
    if (!fieldsByType[type]) {
      fieldsByType[type] = [];
    }
    fieldsByType[type].push(fieldInfo);

    // Detect custom fields (those not in standard set)
    if (isCustomField(field)) {
      customFields.push(fieldInfo);
    } else {
      standardFields.push(fieldInfo);
    }
  }

  return {
    total: fields.length,
    custom: customFields.length,
    standard: standardFields.length,
    customFields,
    standardFields,
    byType: fieldsByType,
  };
}

/**
 * Check if a field is custom (non-standard)
 * @param {Object} field - Field definition
 * @returns {boolean} Whether field is custom
 */
function isCustomField(field) {
  // Standard Marketo lead fields
  const standardFields = new Set([
    'id', 'email', 'firstName', 'lastName', 'company', 'phone', 'mobilePhone',
    'fax', 'title', 'department', 'industry', 'website', 'address', 'city',
    'state', 'postalCode', 'country', 'dateOfBirth', 'annualRevenue',
    'numberOfEmployees', 'leadSource', 'leadScore', 'urgency', 'priority',
    'relativeScore', 'relativeUrgency', 'rating', 'personType', 'doNotCall',
    'doNotCallReason', 'emailInvalid', 'emailInvalidCause', 'unsubscribed',
    'unsubscribedReason', 'createdAt', 'updatedAt', 'cookies', 'externalCompanyId',
    'externalSalesPersonId', 'acquisitionDate', 'acquisitionProgramId',
    'originalSourceType', 'originalSourceInfo', 'registrationSourceType',
    'registrationSourceInfo', 'inferredCompany', 'inferredCountry', 'inferredCity',
    'inferredStateRegion', 'inferredPostalCode', 'inferredMetropolitanArea',
    'inferredPhoneAreaCode', 'sfdcType', 'sfdcLeadId', 'sfdcContactId',
    'sfdcAccountId', 'sfdcOpptyId', 'microsoftDynamicsLeadId',
    'microsoftDynamicsContactId', 'microsoftDynamicsAccountId',
  ]);

  const fieldName = (field.name || field.rest?.name || '').toLowerCase();
  return !standardFields.has(fieldName);
}

/**
 * Analyze program channels
 * @param {Array} channels - Channel definitions
 * @returns {Object} Channel analysis
 */
function analyzeChannels(channels) {
  const customChannels = [];
  const standardChannels = [];

  // Standard Marketo channels
  const standardChannelNames = new Set([
    'webinar', 'tradeshow', 'roadshow', 'nurture', 'operational',
    'email', 'email blast', 'content', 'web content', 'paid media',
    'organic social', 'direct mail', 'web',
  ]);

  for (const channel of channels) {
    const channelInfo = {
      name: channel.name,
      progressionStatuses: channel.progressionStatuses || [],
      applicableProgramTypes: channel.applicableProgramTypes || [],
    };

    const normalizedName = (channel.name || '').toLowerCase();
    if (standardChannelNames.has(normalizedName)) {
      standardChannels.push(channelInfo);
    } else {
      customChannels.push(channelInfo);
    }
  }

  return {
    total: channels.length,
    custom: customChannels.length,
    standard: standardChannels.length,
    customChannels,
    standardChannels,
  };
}

/**
 * Analyze custom activity types
 * @param {Array} activityTypes - Activity type definitions
 * @returns {Object} Activity analysis
 */
function analyzeActivityTypes(activityTypes) {
  const customActivities = [];
  const standardActivities = [];

  // Standard Marketo activity type IDs (1-100+ are standard)
  // Custom activities typically start at higher IDs
  const CUSTOM_ACTIVITY_THRESHOLD = 100000;

  for (const activity of activityTypes) {
    const activityInfo = {
      id: activity.id,
      name: activity.name,
      description: activity.description,
      primaryAttribute: activity.primaryAttribute,
      attributes: activity.attributes || [],
    };

    if (activity.id >= CUSTOM_ACTIVITY_THRESHOLD || activity.name?.startsWith('Custom')) {
      customActivities.push(activityInfo);
    } else {
      standardActivities.push(activityInfo);
    }
  }

  return {
    total: activityTypes.length,
    custom: customActivities.length,
    standard: standardActivities.length,
    customActivities,
    standardActivities,
  };
}

/**
 * Analyze workspace configuration
 * @param {Array} workspaces - Workspace definitions
 * @returns {Object} Workspace analysis
 */
function analyzeWorkspaces(workspaces) {
  return {
    count: workspaces.length,
    isMultiWorkspace: workspaces.length > 1,
    workspaces: workspaces.map(ws => ({
      id: ws.id,
      name: ws.name,
      description: ws.description,
      isDefault: ws.isDefault || false,
    })),
  };
}

/**
 * Detect naming conventions used in instance
 * @param {Object} data - Various instance data
 * @returns {Object} Naming convention analysis
 */
function detectNamingConventions(data) {
  const patterns = {
    programNaming: null,
    campaignNaming: null,
    fieldNaming: null,
    folderStructure: null,
  };

  const examples = {
    programs: [],
    campaigns: [],
    fields: [],
    folders: [],
  };

  // Analyze program names if available
  if (data.programs && data.programs.length > 0) {
    const programNames = data.programs.slice(0, 20).map(p => p.name);
    examples.programs = programNames;

    // Detect common patterns
    const hasDatePrefix = programNames.some(n => /^\d{4}[-_]?\d{2}/.test(n));
    const hasTypePrefix = programNames.some(n => /^(WBN|EM|TS|EVT|NUR)[-_]/.test(n));
    const hasCamelCase = programNames.some(n => /[a-z][A-Z]/.test(n));
    const hasUnderscores = programNames.some(n => n.includes('_'));

    if (hasDatePrefix) patterns.programNaming = 'date_prefix';
    else if (hasTypePrefix) patterns.programNaming = 'type_prefix';
    else if (hasCamelCase) patterns.programNaming = 'camelCase';
    else if (hasUnderscores) patterns.programNaming = 'snake_case';
  }

  // Analyze field names
  if (data.fields && data.fields.length > 0) {
    const fieldNames = data.fields.slice(0, 50).map(f => f.name);
    examples.fields = fieldNames.slice(0, 10);

    const hasUnderscore = fieldNames.filter(n => n.includes('_')).length;
    const hasCamelCase = fieldNames.filter(n => /[a-z][A-Z]/.test(n)).length;

    if (hasUnderscore > hasCamelCase) {
      patterns.fieldNaming = 'snake_case';
    } else if (hasCamelCase > hasUnderscore) {
      patterns.fieldNaming = 'camelCase';
    }
  }

  return {
    patterns,
    examples,
  };
}

/**
 * Detect integration configurations
 * @param {Object} syncStatus - Sync status information
 * @returns {Object} Integration analysis
 */
function detectIntegrations(syncStatus = {}) {
  const integrations = {
    salesforce: {
      enabled: false,
      details: null,
    },
    microsoftDynamics: {
      enabled: false,
      details: null,
    },
    customWebhooks: [],
    launchpointServices: [],
  };

  // Salesforce detection
  if (syncStatus.salesforce || syncStatus.sfdc) {
    integrations.salesforce = {
      enabled: true,
      details: {
        connectionStatus: syncStatus.salesforce?.connectionStatus || syncStatus.sfdc?.status,
        lastSync: syncStatus.salesforce?.lastSyncTime || syncStatus.sfdc?.lastSync,
        syncEnabled: syncStatus.salesforce?.enabled !== false,
      },
    };
  }

  // Microsoft Dynamics detection
  if (syncStatus.dynamics || syncStatus.msDynamics) {
    integrations.microsoftDynamics = {
      enabled: true,
      details: syncStatus.dynamics || syncStatus.msDynamics,
    };
  }

  return integrations;
}

/**
 * Generate quirks report for an instance
 * @param {Object} instanceData - All collected instance data
 * @returns {Object} Comprehensive quirks report
 */
function generateQuirksReport(instanceData) {
  const {
    instanceId,
    instanceName,
    fields = [],
    channels = [],
    activityTypes = [],
    workspaces = [],
    programs = [],
    syncStatus = {},
  } = instanceData;

  const report = {
    instanceId,
    instanceName,
    generatedAt: new Date().toISOString(),
    version: '1.0.0',

    // Field analysis
    fields: analyzeLeadFields(fields),

    // Channel analysis
    channels: analyzeChannels(channels),

    // Activity analysis
    activities: analyzeActivityTypes(activityTypes),

    // Workspace analysis
    workspaces: analyzeWorkspaces(workspaces),

    // Naming conventions
    namingConventions: detectNamingConventions({
      programs,
      fields,
    }),

    // Integrations
    integrations: detectIntegrations(syncStatus),

    // Summary statistics
    summary: {
      customFieldCount: 0,
      customChannelCount: 0,
      customActivityCount: 0,
      workspaceCount: 0,
      integrationCount: 0,
    },
  };

  // Update summary
  report.summary.customFieldCount = report.fields.custom;
  report.summary.customChannelCount = report.channels.custom;
  report.summary.customActivityCount = report.activities.custom;
  report.summary.workspaceCount = report.workspaces.count;
  report.summary.integrationCount = Object.values(report.integrations)
    .filter(i => i.enabled === true).length;

  return report;
}

/**
 * Generate quick reference markdown
 * @param {Object} quirksReport - Full quirks report
 * @returns {string} Markdown content
 */
function generateQuickReference(quirksReport) {
  const lines = [
    `# Marketo Instance Quick Reference`,
    ``,
    `**Instance**: ${quirksReport.instanceName || quirksReport.instanceId}`,
    `**Generated**: ${quirksReport.generatedAt}`,
    ``,
    `## Summary`,
    ``,
    `| Category | Count |`,
    `|----------|-------|`,
    `| Custom Fields | ${quirksReport.summary.customFieldCount} |`,
    `| Custom Channels | ${quirksReport.summary.customChannelCount} |`,
    `| Custom Activities | ${quirksReport.summary.customActivityCount} |`,
    `| Workspaces | ${quirksReport.summary.workspaceCount} |`,
    `| Active Integrations | ${quirksReport.summary.integrationCount} |`,
    ``,
  ];

  // Custom fields section
  if (quirksReport.fields.customFields.length > 0) {
    lines.push(`## Custom Fields (Top 20)`);
    lines.push(``);
    lines.push(`| Field Name | Display Name | Type |`);
    lines.push(`|------------|--------------|------|`);
    for (const field of quirksReport.fields.customFields.slice(0, 20)) {
      lines.push(`| ${field.name} | ${field.displayName} | ${field.dataType} |`);
    }
    lines.push(``);
  }

  // Custom channels section
  if (quirksReport.channels.customChannels.length > 0) {
    lines.push(`## Custom Channels`);
    lines.push(``);
    lines.push(`| Channel | Program Types | Statuses |`);
    lines.push(`|---------|---------------|----------|`);
    for (const channel of quirksReport.channels.customChannels) {
      const types = (channel.applicableProgramTypes || []).join(', ') || 'All';
      const statuses = (channel.progressionStatuses || []).map(s => s.name).join(', ');
      lines.push(`| ${channel.name} | ${types} | ${statuses.substring(0, 50)} |`);
    }
    lines.push(``);
  }

  // Workspaces section
  if (quirksReport.workspaces.isMultiWorkspace) {
    lines.push(`## Workspaces`);
    lines.push(``);
    for (const ws of quirksReport.workspaces.workspaces) {
      const defaultTag = ws.isDefault ? ' (Default)' : '';
      lines.push(`- **${ws.name}**${defaultTag}`);
    }
    lines.push(``);
  }

  // Integrations section
  lines.push(`## Integrations`);
  lines.push(``);
  if (quirksReport.integrations.salesforce.enabled) {
    const sf = quirksReport.integrations.salesforce.details || {};
    lines.push(`- **Salesforce**: Enabled (${sf.connectionStatus || 'status unknown'})`);
  } else {
    lines.push(`- **Salesforce**: Not configured`);
  }
  if (quirksReport.integrations.microsoftDynamics.enabled) {
    lines.push(`- **Microsoft Dynamics**: Enabled`);
  }
  lines.push(``);

  // Naming conventions section
  if (quirksReport.namingConventions.patterns.programNaming) {
    lines.push(`## Naming Conventions`);
    lines.push(``);
    lines.push(`- **Programs**: ${quirksReport.namingConventions.patterns.programNaming}`);
    if (quirksReport.namingConventions.patterns.fieldNaming) {
      lines.push(`- **Fields**: ${quirksReport.namingConventions.patterns.fieldNaming}`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Save quirks report to file system
 * @param {Object} quirksReport - Full quirks report
 * @param {string} instanceId - Instance identifier
 * @param {string} outputDir - Output directory
 * @returns {Object} File paths
 */
function saveQuirksReport(quirksReport, instanceId, outputDir = DEFAULT_OUTPUT_DIR) {
  const instanceDir = path.join(outputDir, instanceId);

  // Create directory if needed
  if (!fs.existsSync(instanceDir)) {
    fs.mkdirSync(instanceDir, { recursive: true });
  }

  const files = {
    json: path.join(instanceDir, 'INSTANCE_QUIRKS.json'),
    markdown: path.join(instanceDir, 'QUICK_REFERENCE.md'),
  };

  // Save JSON report
  fs.writeFileSync(files.json, JSON.stringify(quirksReport, null, 2));

  // Save markdown reference
  const markdown = generateQuickReference(quirksReport);
  fs.writeFileSync(files.markdown, markdown);

  return files;
}

module.exports = {
  QUIRK_CATEGORIES,
  analyzeLeadFields,
  isCustomField,
  analyzeChannels,
  analyzeActivityTypes,
  analyzeWorkspaces,
  detectNamingConventions,
  detectIntegrations,
  generateQuirksReport,
  generateQuickReference,
  saveQuirksReport,
};
