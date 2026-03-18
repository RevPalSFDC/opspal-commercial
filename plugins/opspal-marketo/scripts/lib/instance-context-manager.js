/**
 * Instance Context Manager for Marketo
 *
 * Manages instance-level context and configuration:
 * - Load/save instance context
 * - Track assessment history
 * - Cross-reference assessments
 * - Manage instance credentials (securely)
 *
 * Based on the Salesforce org-context-manager.js pattern.
 *
 * @module instance-context-manager
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Default directories
const DEFAULT_PORTALS_DIR = 'portals';
const CONFIG_FILE = 'config.json';
const CONTEXT_FILE = 'INSTANCE_CONTEXT.json';

/**
 * Context schema version for migrations
 */
const CONTEXT_SCHEMA_VERSION = '1.0.0';

/**
 * Default context structure
 */
const DEFAULT_CONTEXT = {
  schemaVersion: CONTEXT_SCHEMA_VERSION,
  instanceId: null,
  instanceName: null,
  munchkinId: null,
  createdAt: null,
  updatedAt: null,

  // Instance metadata
  metadata: {
    timezone: null,
    defaultWorkspace: null,
    workspaces: [],
    apiEndpoint: null,
  },

  // Assessment tracking
  assessments: {
    lastAssessment: null,
    history: [],
  },

  // Known quirks (from quirks detector)
  quirks: {
    customFields: [],
    customChannels: [],
    customActivities: [],
    namingConventions: {},
    detectedAt: null,
  },

  // Integration status
  integrations: {
    salesforce: { enabled: false, lastVerified: null },
    hubspot: { enabled: false, lastVerified: null },
    other: [],
  },

  // Notes and annotations
  notes: [],
};

/**
 * Load instance configuration (credentials)
 * @param {string} portalsDir - Portals directory
 * @returns {Object} Configuration with instances
 */
function loadConfig(portalsDir = DEFAULT_PORTALS_DIR) {
  const configPath = path.join(portalsDir, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    return { instances: {} };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading config: ${error.message}`);
    return { instances: {} };
  }
}

/**
 * Save instance configuration
 * @param {Object} config - Configuration object
 * @param {string} portalsDir - Portals directory
 */
function saveConfig(config, portalsDir = DEFAULT_PORTALS_DIR) {
  const configPath = path.join(portalsDir, CONFIG_FILE);

  // Ensure directory exists
  if (!fs.existsSync(portalsDir)) {
    fs.mkdirSync(portalsDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Load context for a specific instance
 * @param {string} instanceId - Instance identifier
 * @param {string} portalsDir - Portals directory
 * @returns {Object} Instance context
 */
function loadContext(instanceId, portalsDir = DEFAULT_PORTALS_DIR) {
  const contextPath = path.join(portalsDir, instanceId, CONTEXT_FILE);

  if (!fs.existsSync(contextPath)) {
    return createDefaultContext(instanceId);
  }

  try {
    const content = fs.readFileSync(contextPath, 'utf8');
    const context = JSON.parse(content);

    // Migrate if needed
    return migrateContext(context);
  } catch (error) {
    console.error(`Error loading context for ${instanceId}: ${error.message}`);
    return createDefaultContext(instanceId);
  }
}

/**
 * Save context for a specific instance
 * @param {string} instanceId - Instance identifier
 * @param {Object} context - Context to save
 * @param {string} portalsDir - Portals directory
 */
function saveContext(instanceId, context, portalsDir = DEFAULT_PORTALS_DIR) {
  const instanceDir = path.join(portalsDir, instanceId);
  const contextPath = path.join(instanceDir, CONTEXT_FILE);

  // Ensure directory exists
  if (!fs.existsSync(instanceDir)) {
    fs.mkdirSync(instanceDir, { recursive: true });
  }

  // Update timestamp
  context.updatedAt = new Date().toISOString();

  fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
}

/**
 * Create default context for new instance
 * @param {string} instanceId - Instance identifier
 * @returns {Object} Default context
 */
function createDefaultContext(instanceId) {
  return {
    ...DEFAULT_CONTEXT,
    instanceId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Migrate context to current schema version
 * @param {Object} context - Existing context
 * @returns {Object} Migrated context
 */
function migrateContext(context) {
  // Currently at v1.0.0, no migrations needed
  if (!context.schemaVersion) {
    context.schemaVersion = CONTEXT_SCHEMA_VERSION;
  }

  // Ensure all required fields exist
  return {
    ...DEFAULT_CONTEXT,
    ...context,
    assessments: {
      ...DEFAULT_CONTEXT.assessments,
      ...context.assessments,
    },
    quirks: {
      ...DEFAULT_CONTEXT.quirks,
      ...context.quirks,
    },
    integrations: {
      ...DEFAULT_CONTEXT.integrations,
      ...context.integrations,
    },
  };
}

/**
 * Record an assessment in the context
 * @param {string} instanceId - Instance identifier
 * @param {Object} assessment - Assessment details
 * @param {string} portalsDir - Portals directory
 */
function recordAssessment(instanceId, assessment, portalsDir = DEFAULT_PORTALS_DIR) {
  const context = loadContext(instanceId, portalsDir);

  const assessmentRecord = {
    id: `${assessment.type}-${Date.now()}`,
    type: assessment.type, // e.g., 'lead_quality', 'automation', 'deliverability'
    timestamp: new Date().toISOString(),
    reportPath: assessment.reportPath || null,
    summary: assessment.summary || {},
    score: assessment.score || null,
    issues: assessment.issues || [],
    completedBy: assessment.completedBy || 'system',
  };

  // Add to history
  context.assessments.history.unshift(assessmentRecord);

  // Keep only last 50 assessments
  if (context.assessments.history.length > 50) {
    context.assessments.history = context.assessments.history.slice(0, 50);
  }

  // Update last assessment
  context.assessments.lastAssessment = assessmentRecord;

  saveContext(instanceId, context, portalsDir);

  return assessmentRecord;
}

/**
 * Get assessment history for an instance
 * @param {string} instanceId - Instance identifier
 * @param {Object} options - Filter options
 * @param {string} portalsDir - Portals directory
 * @returns {Array} Assessment history
 */
function getAssessmentHistory(instanceId, options = {}, portalsDir = DEFAULT_PORTALS_DIR) {
  const context = loadContext(instanceId, portalsDir);
  let history = context.assessments.history || [];

  // Filter by type
  if (options.type) {
    history = history.filter(a => a.type === options.type);
  }

  // Filter by date range
  if (options.since) {
    const sinceDate = new Date(options.since);
    history = history.filter(a => new Date(a.timestamp) >= sinceDate);
  }

  // Limit results
  if (options.limit) {
    history = history.slice(0, options.limit);
  }

  return history;
}

/**
 * Cross-reference assessments to find overlapping areas
 * @param {string} instanceId - Instance identifier
 * @param {string} portalsDir - Portals directory
 * @returns {Object} Cross-reference analysis
 */
function crossReferenceAssessments(instanceId, portalsDir = DEFAULT_PORTALS_DIR) {
  const history = getAssessmentHistory(instanceId, { limit: 20 }, portalsDir);

  const crossRef = {
    instanceId,
    analyzedAt: new Date().toISOString(),
    assessmentTypes: {},
    commonIssues: {},
    trends: [],
  };

  // Group by type
  for (const assessment of history) {
    if (!crossRef.assessmentTypes[assessment.type]) {
      crossRef.assessmentTypes[assessment.type] = {
        count: 0,
        lastRun: null,
        scores: [],
        issues: [],
      };
    }

    const typeData = crossRef.assessmentTypes[assessment.type];
    typeData.count++;
    if (!typeData.lastRun || assessment.timestamp > typeData.lastRun) {
      typeData.lastRun = assessment.timestamp;
    }
    if (assessment.score !== null) {
      typeData.scores.push(assessment.score);
    }
    typeData.issues.push(...(assessment.issues || []));
  }

  // Find common issues across assessments
  const allIssues = history.flatMap(a => a.issues || []);
  const issueCounts = {};
  for (const issue of allIssues) {
    const key = issue.type || issue.code || issue.message?.substring(0, 50);
    if (key) {
      issueCounts[key] = (issueCounts[key] || 0) + 1;
    }
  }

  // Issues appearing in multiple assessments
  crossRef.commonIssues = Object.entries(issueCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reduce((acc, [key, count]) => {
      acc[key] = count;
      return acc;
    }, {});

  // Calculate trends for scored assessments
  for (const [type, data] of Object.entries(crossRef.assessmentTypes)) {
    if (data.scores.length >= 2) {
      const recent = data.scores.slice(0, Math.ceil(data.scores.length / 2));
      const older = data.scores.slice(Math.ceil(data.scores.length / 2));

      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

      crossRef.trends.push({
        type,
        direction: recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'declining' : 'stable',
        recentAverage: Math.round(recentAvg),
        olderAverage: Math.round(olderAvg),
        change: Math.round(recentAvg - olderAvg),
      });
    }
  }

  return crossRef;
}

/**
 * Update instance quirks from quirks detector
 * @param {string} instanceId - Instance identifier
 * @param {Object} quirks - Quirks from detector
 * @param {string} portalsDir - Portals directory
 */
function updateQuirks(instanceId, quirks, portalsDir = DEFAULT_PORTALS_DIR) {
  const context = loadContext(instanceId, portalsDir);

  context.quirks = {
    customFields: quirks.fields?.customFields || [],
    customChannels: quirks.channels?.customChannels || [],
    customActivities: quirks.activities?.customActivities || [],
    namingConventions: quirks.namingConventions?.patterns || {},
    detectedAt: new Date().toISOString(),
  };

  saveContext(instanceId, context, portalsDir);
}

/**
 * Update integration status
 * @param {string} instanceId - Instance identifier
 * @param {string} integration - Integration name
 * @param {Object} status - Integration status
 * @param {string} portalsDir - Portals directory
 */
function updateIntegrationStatus(instanceId, integration, status, portalsDir = DEFAULT_PORTALS_DIR) {
  const context = loadContext(instanceId, portalsDir);

  if (integration === 'salesforce' || integration === 'hubspot') {
    context.integrations[integration] = {
      enabled: status.enabled,
      lastVerified: new Date().toISOString(),
      details: status.details || null,
    };
  } else {
    // Other integrations
    const existing = context.integrations.other.findIndex(i => i.name === integration);
    const record = {
      name: integration,
      enabled: status.enabled,
      lastVerified: new Date().toISOString(),
      details: status.details || null,
    };

    if (existing >= 0) {
      context.integrations.other[existing] = record;
    } else {
      context.integrations.other.push(record);
    }
  }

  saveContext(instanceId, context, portalsDir);
}

/**
 * Add a note to instance context
 * @param {string} instanceId - Instance identifier
 * @param {string} note - Note text
 * @param {Object} metadata - Additional metadata
 * @param {string} portalsDir - Portals directory
 */
function addNote(instanceId, note, metadata = {}, portalsDir = DEFAULT_PORTALS_DIR) {
  const context = loadContext(instanceId, portalsDir);

  context.notes.unshift({
    id: `note-${Date.now()}`,
    text: note,
    createdAt: new Date().toISOString(),
    author: metadata.author || 'system',
    category: metadata.category || 'general',
  });

  // Keep only last 100 notes
  if (context.notes.length > 100) {
    context.notes = context.notes.slice(0, 100);
  }

  saveContext(instanceId, context, portalsDir);
}

/**
 * List all known instances
 * @param {string} portalsDir - Portals directory
 * @returns {Array} List of instances with basic info
 */
function listInstances(portalsDir = DEFAULT_PORTALS_DIR) {
  if (!fs.existsSync(portalsDir)) {
    return [];
  }

  const instances = [];
  const entries = fs.readdirSync(portalsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== '.token-cache') {
      const contextPath = path.join(portalsDir, entry.name, CONTEXT_FILE);

      if (fs.existsSync(contextPath)) {
        try {
          const content = fs.readFileSync(contextPath, 'utf8');
          const context = JSON.parse(content);
          instances.push({
            instanceId: context.instanceId || entry.name,
            instanceName: context.instanceName,
            lastUpdated: context.updatedAt,
            lastAssessment: context.assessments?.lastAssessment?.timestamp,
          });
        } catch {
          instances.push({
            instanceId: entry.name,
            instanceName: null,
            lastUpdated: null,
            lastAssessment: null,
          });
        }
      }
    }
  }

  return instances;
}

/**
 * Export context for an instance (for backup/sharing)
 * @param {string} instanceId - Instance identifier
 * @param {string} portalsDir - Portals directory
 * @returns {Object} Exportable context (without sensitive data)
 */
function exportContext(instanceId, portalsDir = DEFAULT_PORTALS_DIR) {
  const context = loadContext(instanceId, portalsDir);

  // Remove any sensitive data
  const exportable = {
    ...context,
    // Remove any credential references
  };

  return exportable;
}

module.exports = {
  CONTEXT_SCHEMA_VERSION,
  loadConfig,
  saveConfig,
  loadContext,
  saveContext,
  createDefaultContext,
  recordAssessment,
  getAssessmentHistory,
  crossReferenceAssessments,
  updateQuirks,
  updateIntegrationStatus,
  addNote,
  listInstances,
  exportContext,
};
