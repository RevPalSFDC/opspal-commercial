#!/usr/bin/env node

/**
 * Work Index Schema
 *
 * JSON schema definitions and validation for WORK_INDEX.yaml files.
 * Provides classification taxonomy, status transitions, and validation utilities.
 *
 * @module work-index-schema
 */

const fs = require('fs');
const path = require('path');

// Schema version
const SCHEMA_VERSION = '1.0.0';

// Work index filename
const WORK_INDEX_FILE = 'WORK_INDEX.yaml';

/**
 * Classification Taxonomy
 * Hierarchical categories for work requests
 */
const CLASSIFICATION_TAXONOMY = {
  audit: {
    label: 'Audit',
    description: 'Assessment and analysis work',
    subTypes: [
      'cpq-assessment',
      'revops-audit',
      'automation-audit',
      'security-audit',
      'data-quality-audit',
      'permission-audit',
      'architecture-audit'
    ]
  },
  report: {
    label: 'Report',
    description: 'Report and dashboard creation',
    subTypes: [
      'executive-report',
      'pipeline-report',
      'forecast-report',
      'compliance-report',
      'custom-dashboard',
      'data-export'
    ]
  },
  build: {
    label: 'Build',
    description: 'Development and configuration',
    subTypes: [
      'flow-development',
      'trigger-development',
      'validation-rule',
      'permission-set',
      'report-dashboard',
      'layout-design',
      'lwc-development',
      'apex-development'
    ]
  },
  migration: {
    label: 'Migration',
    description: 'Data and schema migrations',
    subTypes: [
      'data-import',
      'data-export',
      'schema-migration',
      'platform-migration',
      'field-migration'
    ]
  },
  configuration: {
    label: 'Configuration',
    description: 'System configuration work',
    subTypes: [
      'field-config',
      'object-setup',
      'automation-config',
      'territory-setup',
      'process-config',
      'integration-config'
    ]
  },
  consultation: {
    label: 'Consultation',
    description: 'Advisory and planning work',
    subTypes: [
      'architecture-review',
      'process-design',
      'best-practices',
      'roadmap-planning',
      'strategy-session'
    ]
  },
  support: {
    label: 'Support',
    description: 'Support and maintenance',
    subTypes: [
      'bug-fix',
      'troubleshooting',
      'training',
      'documentation',
      'maintenance'
    ]
  }
};

/**
 * Valid status values and their descriptions
 */
const STATUS_VALUES = {
  requested: {
    label: 'Requested',
    description: 'Work has been requested but not started'
  },
  'in-progress': {
    label: 'In Progress',
    description: 'Work is actively being performed'
  },
  completed: {
    label: 'Completed',
    description: 'Work has been finished'
  },
  'follow-up-needed': {
    label: 'Follow-up Needed',
    description: 'Work completed but requires additional action'
  },
  'on-hold': {
    label: 'On Hold',
    description: 'Work paused pending external input'
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Work cancelled before completion'
  }
};

/**
 * Valid status transitions
 */
const STATUS_TRANSITIONS = {
  requested: ['in-progress', 'on-hold', 'cancelled'],
  'in-progress': ['completed', 'follow-up-needed', 'on-hold', 'cancelled'],
  completed: ['follow-up-needed'],
  'follow-up-needed': ['in-progress', 'completed'],
  'on-hold': ['in-progress', 'cancelled'],
  cancelled: [] // Terminal state
};

/**
 * Deliverable types
 */
const DELIVERABLE_TYPES = [
  'assessment-folder',
  'report-pdf',
  'report-html',
  'dashboard',
  'code-artifact',
  'configuration',
  'documentation',
  'data-file',
  'diagram',
  'other'
];

/**
 * Session types
 */
const SESSION_TYPES = ['initial', 'continuation', 'follow-up'];

/**
 * JSON Schema for a single work request entry
 */
const WORK_REQUEST_SCHEMA = {
  type: 'object',
  required: ['id', 'request_date', 'title', 'classification', 'status'],
  properties: {
    id: {
      type: 'string',
      pattern: '^WRK-\\d{8}-\\d{3}$',
      description: 'Unique request ID (format: WRK-YYYYMMDD-NNN)'
    },
    request_date: {
      type: 'string',
      format: 'date',
      description: 'Date the request was made (YYYY-MM-DD)'
    },
    title: {
      type: 'string',
      minLength: 5,
      maxLength: 200,
      description: 'Short title for the work request'
    },
    classification: {
      type: 'string',
      enum: Object.keys(CLASSIFICATION_TAXONOMY),
      description: 'Primary classification category'
    },
    sub_type: {
      type: 'string',
      description: 'Sub-type within classification'
    },
    abstract: {
      type: 'string',
      maxLength: 500,
      description: 'Brief summary of work performed (100-200 chars recommended)'
    },
    status: {
      type: 'string',
      enum: Object.keys(STATUS_VALUES),
      description: 'Current status of the work request'
    },
    started_at: {
      type: 'string',
      format: 'date-time',
      description: 'When work began (ISO 8601)'
    },
    completed_at: {
      type: 'string',
      format: 'date-time',
      description: 'When work completed (ISO 8601)'
    },
    estimated_hours: {
      type: 'number',
      minimum: 0,
      description: 'Estimated hours for the work'
    },
    actual_hours: {
      type: 'number',
      minimum: 0,
      description: 'Actual hours spent'
    },
    deliverables: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'type'],
        properties: {
          path: { type: 'string', description: 'Relative path to deliverable' },
          type: { type: 'string', enum: DELIVERABLE_TYPES },
          description: { type: 'string' }
        }
      },
      description: 'List of deliverable files/folders'
    },
    platforms: {
      type: 'array',
      items: { type: 'string' },
      description: 'Platforms involved (e.g., "salesforce:production")'
    },
    agents_used: {
      type: 'array',
      items: { type: 'string' },
      description: 'Agent names used in this work'
    },
    asana_task_id: {
      type: 'string',
      description: 'Linked Asana task ID'
    },
    reflection_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'Related reflection IDs'
    },
    follow_up_actions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Actions needed for follow-up'
    },
    key_findings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Key findings or outcomes'
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Freeform tags for categorization'
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['session_id', 'date'],
        properties: {
          session_id: { type: 'string', description: 'Claude Code session ID' },
          date: { type: 'string', format: 'date' },
          type: { type: 'string', enum: SESSION_TYPES },
          summary: { type: 'string', maxLength: 200 }
        }
      },
      description: 'Auto-captured session references (never manually entered)'
    },
    related_requests: {
      type: 'array',
      items: { type: 'string' },
      description: 'IDs of related work requests'
    },
    notes: {
      type: 'string',
      description: 'Additional notes'
    }
  }
};

/**
 * JSON Schema for the full WORK_INDEX.yaml file
 */
const WORK_INDEX_SCHEMA = {
  type: 'object',
  required: ['schema_version', 'org_slug', 'requests'],
  properties: {
    schema_version: {
      type: 'string',
      const: SCHEMA_VERSION,
      description: 'Schema version for compatibility'
    },
    org_slug: {
      type: 'string',
      pattern: '^[a-z0-9-]+$',
      description: 'Organization identifier'
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      description: 'When the index was created'
    },
    last_updated: {
      type: 'string',
      format: 'date-time',
      description: 'Last modification timestamp'
    },
    requests: {
      type: 'array',
      items: WORK_REQUEST_SCHEMA,
      description: 'List of work request entries'
    }
  }
};

/**
 * Generate a new request ID
 * @param {string} dateStr - Date string (YYYY-MM-DD) or Date object
 * @param {number} sequence - Sequence number for the day (1-999)
 * @returns {string} Request ID in format WRK-YYYYMMDD-NNN
 */
function generateRequestId(dateStr, sequence = 1) {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const dateFormatted = date.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(sequence).padStart(3, '0');
  return `WRK-${dateFormatted}-${seq}`;
}

/**
 * Validate a status transition
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Desired new status
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateStatusTransition(fromStatus, toStatus) {
  if (!STATUS_VALUES[fromStatus]) {
    return { valid: false, reason: `Invalid current status: ${fromStatus}` };
  }
  if (!STATUS_VALUES[toStatus]) {
    return { valid: false, reason: `Invalid target status: ${toStatus}` };
  }

  const allowedTransitions = STATUS_TRANSITIONS[fromStatus];
  if (!allowedTransitions.includes(toStatus)) {
    return {
      valid: false,
      reason: `Cannot transition from '${fromStatus}' to '${toStatus}'. Allowed: ${allowedTransitions.join(', ') || 'none (terminal state)'}`
    };
  }

  return { valid: true };
}

/**
 * Validate a classification and sub-type combination
 * @param {string} classification - Classification category
 * @param {string} subType - Sub-type within classification
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateClassification(classification, subType) {
  if (!CLASSIFICATION_TAXONOMY[classification]) {
    return {
      valid: false,
      reason: `Invalid classification: ${classification}. Valid: ${Object.keys(CLASSIFICATION_TAXONOMY).join(', ')}`
    };
  }

  if (subType) {
    const validSubTypes = CLASSIFICATION_TAXONOMY[classification].subTypes;
    if (!validSubTypes.includes(subType)) {
      return {
        valid: false,
        reason: `Invalid sub_type '${subType}' for classification '${classification}'. Valid: ${validSubTypes.join(', ')}`
      };
    }
  }

  return { valid: true };
}

/**
 * Basic validation of a work request object
 * @param {Object} request - Work request object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateWorkRequest(request) {
  const errors = [];

  // Required fields
  const required = ['id', 'request_date', 'title', 'classification', 'status'];
  for (const field of required) {
    if (!request[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // ID format
  if (request.id && !/^WRK-\d{8}-\d{3}$/.test(request.id)) {
    errors.push(`Invalid ID format: ${request.id}. Expected WRK-YYYYMMDD-NNN`);
  }

  // Classification validation
  if (request.classification) {
    const classResult = validateClassification(request.classification, request.sub_type);
    if (!classResult.valid) {
      errors.push(classResult.reason);
    }
  }

  // Status validation
  if (request.status && !STATUS_VALUES[request.status]) {
    errors.push(`Invalid status: ${request.status}. Valid: ${Object.keys(STATUS_VALUES).join(', ')}`);
  }

  // Title length
  if (request.title && (request.title.length < 5 || request.title.length > 200)) {
    errors.push(`Title must be 5-200 characters (got ${request.title.length})`);
  }

  // Abstract length
  if (request.abstract && request.abstract.length > 500) {
    errors.push(`Abstract exceeds 500 character limit (got ${request.abstract.length})`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create an empty work index structure
 * @param {string} orgSlug - Organization identifier
 * @returns {Object} Empty work index
 */
function createEmptyWorkIndex(orgSlug) {
  return {
    schema_version: SCHEMA_VERSION,
    org_slug: orgSlug,
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    requests: []
  };
}

/**
 * Get all valid classifications as a flat list
 * @returns {string[]} Array of classification names
 */
function getClassifications() {
  return Object.keys(CLASSIFICATION_TAXONOMY);
}

/**
 * Get sub-types for a classification
 * @param {string} classification - Classification category
 * @returns {string[]} Array of sub-type names
 */
function getSubTypes(classification) {
  const category = CLASSIFICATION_TAXONOMY[classification];
  return category ? category.subTypes : [];
}

/**
 * Get all valid statuses
 * @returns {string[]} Array of status values
 */
function getStatuses() {
  return Object.keys(STATUS_VALUES);
}

/**
 * Infer classification from agent name
 * @param {string} agentName - Agent name
 * @returns {{ classification: string, subType: string } | null}
 */
function inferClassificationFromAgent(agentName) {
  const agentMapping = {
    'sfdc-cpq-assessor': { classification: 'audit', subType: 'cpq-assessment' },
    'sfdc-revops-auditor': { classification: 'audit', subType: 'revops-audit' },
    'sfdc-automation-auditor': { classification: 'audit', subType: 'automation-audit' },
    'sfdc-security-admin': { classification: 'audit', subType: 'security-audit' },
    'sfdc-architecture-auditor': { classification: 'audit', subType: 'architecture-audit' },
    'sfdc-reports-dashboards': { classification: 'report', subType: 'custom-dashboard' },
    'sfdc-report-designer': { classification: 'report', subType: 'custom-dashboard' },
    'pipeline-intelligence-agent': { classification: 'report', subType: 'pipeline-report' },
    'diagram-generator': { classification: 'report', subType: 'executive-report' },
    'sfdc-automation-builder': { classification: 'build', subType: 'flow-development' },
    'trigger-orchestrator': { classification: 'build', subType: 'trigger-development' },
    'validation-rule-orchestrator': { classification: 'build', subType: 'validation-rule' },
    'sfdc-permission-orchestrator': { classification: 'build', subType: 'permission-set' },
    'sfdc-layout-generator': { classification: 'build', subType: 'layout-design' },
    'sfdc-data-operations': { classification: 'migration', subType: 'data-import' },
    'sfdc-data-import-manager': { classification: 'migration', subType: 'data-import' },
    'sfdc-data-export-manager': { classification: 'migration', subType: 'data-export' },
    'sfdc-territory-orchestrator': { classification: 'configuration', subType: 'territory-setup' },
    'sfdc-field-analyzer': { classification: 'configuration', subType: 'field-config' }
  };

  return agentMapping[agentName] || null;
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'classifications':
      console.log('Classifications:');
      for (const [key, value] of Object.entries(CLASSIFICATION_TAXONOMY)) {
        console.log(`  ${key}: ${value.label}`);
        console.log(`    Sub-types: ${value.subTypes.join(', ')}`);
      }
      break;

    case 'statuses':
      console.log('Statuses:');
      for (const [key, value] of Object.entries(STATUS_VALUES)) {
        console.log(`  ${key}: ${value.description}`);
      }
      break;

    case 'transitions':
      console.log('Status Transitions:');
      for (const [from, to] of Object.entries(STATUS_TRANSITIONS)) {
        console.log(`  ${from} -> ${to.length > 0 ? to.join(', ') : '(terminal)'}`);
      }
      break;

    case 'generate-id':
      const date = args[1] || new Date().toISOString().slice(0, 10);
      const seq = parseInt(args[2]) || 1;
      console.log(generateRequestId(date, seq));
      break;

    case 'validate':
      // Read JSON from stdin
      let input = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('readable', () => {
        let chunk;
        while ((chunk = process.stdin.read()) !== null) {
          input += chunk;
        }
      });
      process.stdin.on('end', () => {
        try {
          const data = JSON.parse(input);
          const result = validateWorkRequest(data);
          if (result.valid) {
            console.log('Valid work request');
            process.exit(0);
          } else {
            console.error('Validation errors:');
            result.errors.forEach(e => console.error(`  - ${e}`));
            process.exit(1);
          }
        } catch (e) {
          console.error('Failed to parse JSON:', e.message);
          process.exit(1);
        }
      });
      break;

    default:
      console.log(`Work Index Schema v${SCHEMA_VERSION}`);
      console.log('\nUsage:');
      console.log('  node work-index-schema.js classifications  # List classifications');
      console.log('  node work-index-schema.js statuses         # List statuses');
      console.log('  node work-index-schema.js transitions      # Show status transitions');
      console.log('  node work-index-schema.js generate-id [date] [seq]  # Generate request ID');
      console.log('  echo \'{"id":"WRK-20260129-001",...}\' | node work-index-schema.js validate');
  }
}

module.exports = {
  SCHEMA_VERSION,
  WORK_INDEX_FILE,
  CLASSIFICATION_TAXONOMY,
  STATUS_VALUES,
  STATUS_TRANSITIONS,
  DELIVERABLE_TYPES,
  SESSION_TYPES,
  WORK_REQUEST_SCHEMA,
  WORK_INDEX_SCHEMA,
  generateRequestId,
  validateStatusTransition,
  validateClassification,
  validateWorkRequest,
  createEmptyWorkIndex,
  getClassifications,
  getSubTypes,
  getStatuses,
  inferClassificationFromAgent
};
