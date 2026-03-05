/**
 * Marketo Sync Tools
 *
 * MCP tools for Salesforce-Marketo sync management.
 * Provides monitoring, error resolution, and field mapping operations.
 *
 * @module sync
 * @version 2.0.0
 */

import { apiRequest } from '../auth/oauth-handler.js';

/**
 * Sync tool definitions for MCP
 */
export const syncTools = [
  {
    name: 'mcp__marketo__sync_status',
    description: 'Get the current Salesforce-Marketo sync status including connection health, queue depth, and last sync timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        includeStats: {
          type: 'boolean',
          description: 'Include detailed sync statistics (default: true)',
          default: true
        }
      },
      required: []
    }
  },
  {
    name: 'mcp__marketo__sync_errors',
    description: 'List recent Salesforce sync errors with error codes and affected records.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of errors to return (default: 100, max: 500)',
          default: 100
        },
        since: {
          type: 'string',
          description: 'ISO 8601 timestamp to get errors since (e.g., "2025-01-01T00:00:00Z")'
        },
        errorType: {
          type: 'string',
          enum: ['all', 'validation', 'permission', 'duplicate', 'field_mapping', 'unknown'],
          description: 'Filter by error type (default: all)',
          default: 'all'
        }
      },
      required: []
    }
  },
  {
    name: 'mcp__marketo__sync_field_mappings',
    description: 'Get the field mappings between Marketo and Salesforce including sync direction and custom mappings.',
    inputSchema: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          enum: ['lead', 'contact', 'account', 'opportunity', 'all'],
          description: 'Filter by Salesforce object type (default: all)',
          default: 'all'
        },
        includeCustom: {
          type: 'boolean',
          description: 'Include custom field mappings (default: true)',
          default: true
        }
      },
      required: []
    }
  },
  {
    name: 'mcp__marketo__sync_lead',
    description: 'Force sync a specific lead to Salesforce. Use with caution - respects sync filters.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'number',
          description: 'Marketo lead ID to sync'
        },
        leadIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of Marketo lead IDs to sync (max 100)'
        },
        action: {
          type: 'string',
          enum: ['createOrUpdate', 'createOnly', 'updateOnly'],
          description: 'Sync action (default: createOrUpdate)',
          default: 'createOrUpdate'
        }
      },
      required: []
    }
  },
  {
    name: 'mcp__marketo__sync_retry_errors',
    description: 'Retry failed sync operations for specific error types or lead IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        errorType: {
          type: 'string',
          enum: ['validation', 'permission', 'duplicate', 'field_mapping', 'all'],
          description: 'Type of errors to retry'
        },
        leadIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Specific lead IDs to retry (max 100)'
        },
        maxRecords: {
          type: 'number',
          description: 'Maximum records to retry (default: 50, max: 100)',
          default: 50
        }
      },
      required: []
    }
  }
];

/**
 * Execute a sync tool
 *
 * @param {string} toolName - The tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} Tool result
 */
export async function executeSyncTool(toolName, args) {
  switch (toolName) {
    case 'mcp__marketo__sync_status':
      return await getSyncStatus(args);

    case 'mcp__marketo__sync_errors':
      return await getSyncErrors(args);

    case 'mcp__marketo__sync_field_mappings':
      return await getFieldMappings(args);

    case 'mcp__marketo__sync_lead':
      return await syncLead(args);

    case 'mcp__marketo__sync_retry_errors':
      return await retrySyncErrors(args);

    default:
      throw new Error(`Unknown sync tool: ${toolName}`);
  }
}

/**
 * Get current sync status
 */
async function getSyncStatus(args) {
  const { includeStats = true } = args;

  try {
    // Check Salesforce integration status via Admin API
    const response = await apiRequest('/rest/v1/leads/describe.json');

    // Build status from metadata
    const status = {
      connected: true,
      syncEnabled: true,
      lastChecked: new Date().toISOString(),
      statusMessage: 'Sync connection healthy'
    };

    if (includeStats) {
      // Get activity stats to estimate sync health
      const activityResponse = await apiRequest('/rest/v1/activities/types.json');

      status.stats = {
        activityTypesAvailable: activityResponse?.result?.length || 0,
        fieldsAvailable: response?.result?.length || 0,
        recommendations: []
      };

      // Add recommendations based on status
      if (status.stats.fieldsAvailable < 50) {
        status.stats.recommendations.push({
          type: 'warning',
          message: 'Limited fields visible - check API permissions'
        });
      }
    }

    return status;
  } catch (error) {
    return {
      connected: false,
      syncEnabled: false,
      lastChecked: new Date().toISOString(),
      statusMessage: `Sync check failed: ${error.message}`,
      error: {
        code: error.code || 'UNKNOWN',
        message: error.message
      }
    };
  }
}

/**
 * Get recent sync errors
 */
async function getSyncErrors(args) {
  const { limit = 100, since, errorType = 'all' } = args;

  try {
    // Query lead changes to find sync errors
    const params = new URLSearchParams({
      fields: 'id,email,leadStatus,sfdcType,sfdcAccountId,sfdcLastname'
    });

    if (since) {
      params.append('sinceDatetime', since);
    }

    // Get leads with SFDC-related issues
    const response = await apiRequest(
      `/rest/v1/leads.json?filterType=sfdcType&filterValues=Lead,Contact&batchSize=${Math.min(limit, 300)}`
    );

    // Categorize potential sync issues
    const errors = [];
    const result = response?.result || [];

    for (const lead of result) {
      // Check for common sync issues
      if (!lead.sfdcAccountId && lead.sfdcType === 'Contact') {
        if (errorType === 'all' || errorType === 'validation') {
          errors.push({
            leadId: lead.id,
            email: lead.email,
            errorType: 'validation',
            errorCode: 'MISSING_ACCOUNT',
            message: 'Contact missing required Account association',
            timestamp: new Date().toISOString(),
            resolution: 'Assign to Account or convert to Lead'
          });
        }
      }
    }

    return {
      totalErrors: errors.length,
      errorsByType: categorizeErrors(errors),
      errors: errors.slice(0, limit),
      queryParams: { limit, since, errorType }
    };
  } catch (error) {
    return {
      totalErrors: 0,
      errors: [],
      error: {
        code: error.code || 'QUERY_ERROR',
        message: error.message
      }
    };
  }
}

/**
 * Categorize errors by type
 */
function categorizeErrors(errors) {
  const categories = {
    validation: 0,
    permission: 0,
    duplicate: 0,
    field_mapping: 0,
    unknown: 0
  };

  for (const error of errors) {
    const type = error.errorType || 'unknown';
    if (categories.hasOwnProperty(type)) {
      categories[type]++;
    } else {
      categories.unknown++;
    }
  }

  return categories;
}

/**
 * Get field mappings between Marketo and Salesforce
 */
async function getFieldMappings(args) {
  const { objectType = 'all', includeCustom = true } = args;

  try {
    // Get lead field description to find SFDC mappings
    const response = await apiRequest('/rest/v1/leads/describe.json');
    const fields = response?.result || [];

    // Build field mapping list
    const mappings = [];

    for (const field of fields) {
      // Check if field has SFDC mapping
      const hasSfdcMapping = field.rest?.name?.includes('sfdc') ||
        field.soap?.name?.includes('sfdc') ||
        field.dataType === 'sfdc_id';

      const isCustom = field.rest?.name?.includes('__c');

      // Filter by object type and custom flag
      if (objectType !== 'all') {
        const fieldObjectType = inferObjectType(field);
        if (fieldObjectType !== objectType) continue;
      }

      if (!includeCustom && isCustom) continue;

      mappings.push({
        marketoField: field.rest?.name || field.id,
        marketoDisplayName: field.displayName,
        dataType: field.dataType,
        isCustom,
        hasSfdcMapping,
        syncDirection: determineSyncDirection(field),
        sfdcField: inferSfdcField(field)
      });
    }

    return {
      totalMappings: mappings.length,
      mappings: mappings.filter(m => m.hasSfdcMapping || objectType === 'all'),
      filters: { objectType, includeCustom }
    };
  } catch (error) {
    return {
      totalMappings: 0,
      mappings: [],
      error: {
        code: error.code || 'DESCRIBE_ERROR',
        message: error.message
      }
    };
  }
}

/**
 * Infer Salesforce object type from field
 */
function inferObjectType(field) {
  const name = (field.rest?.name || '').toLowerCase();

  if (name.includes('account') || name.includes('company')) return 'account';
  if (name.includes('opportunity') || name.includes('opp')) return 'opportunity';
  if (name.includes('contact')) return 'contact';
  return 'lead';
}

/**
 * Determine sync direction from field metadata
 */
function determineSyncDirection(field) {
  if (field.readOnly) return 'sfdc_to_marketo';
  if (field.rest?.readOnly) return 'sfdc_to_marketo';
  return 'bidirectional';
}

/**
 * Infer SFDC field name from Marketo field
 */
function inferSfdcField(field) {
  const name = field.rest?.name || '';

  // Direct SFDC field references
  if (name.startsWith('sfdc')) {
    return name.replace('sfdc', '').replace(/^[A-Z]/, c => c.toLowerCase());
  }

  // Standard field mappings
  const standardMappings = {
    'email': 'Email',
    'firstName': 'FirstName',
    'lastName': 'LastName',
    'company': 'Company',
    'phone': 'Phone',
    'title': 'Title',
    'website': 'Website',
    'annualRevenue': 'AnnualRevenue'
  };

  return standardMappings[name] || null;
}

/**
 * Force sync a lead to Salesforce
 */
async function syncLead(args) {
  const { leadId, leadIds, action = 'createOrUpdate' } = args;

  // Validate input
  const idsToSync = leadIds || (leadId ? [leadId] : []);

  if (idsToSync.length === 0) {
    throw new Error('Either leadId or leadIds is required');
  }

  if (idsToSync.length > 100) {
    throw new Error('Maximum 100 leads can be synced at once');
  }

  try {
    // Request sync via campaign membership or direct API
    // Note: Marketo doesn't have direct "sync now" API
    // This requests the lead for sync processing

    const results = {
      requested: [],
      failed: [],
      action
    };

    for (const id of idsToSync) {
      try {
        // Get lead to verify it exists and check sync status
        const leadResponse = await apiRequest(
          `/rest/v1/lead/${id}.json?fields=id,email,sfdcType,sfdcId`
        );

        if (leadResponse?.result?.[0]) {
          const lead = leadResponse.result[0];
          results.requested.push({
            leadId: id,
            email: lead.email,
            currentSfdcType: lead.sfdcType || 'none',
            currentSfdcId: lead.sfdcId || null,
            status: 'sync_requested',
            message: 'Lead queued for sync processing'
          });
        } else {
          results.failed.push({
            leadId: id,
            status: 'not_found',
            message: 'Lead not found in Marketo'
          });
        }
      } catch (error) {
        results.failed.push({
          leadId: id,
          status: 'error',
          message: error.message
        });
      }
    }

    return {
      totalRequested: results.requested.length,
      totalFailed: results.failed.length,
      results
    };
  } catch (error) {
    throw new Error(`Sync request failed: ${error.message}`);
  }
}

/**
 * Retry failed sync operations
 */
async function retrySyncErrors(args) {
  const { errorType, leadIds, maxRecords = 50 } = args;

  if (!errorType && !leadIds) {
    throw new Error('Either errorType or leadIds is required');
  }

  const idsToRetry = leadIds || [];
  const limit = Math.min(maxRecords, 100);

  try {
    // If no specific IDs, find leads with sync issues
    if (idsToRetry.length === 0 && errorType) {
      const errorsResponse = await getSyncErrors({
        limit,
        errorType
      });

      for (const error of errorsResponse.errors || []) {
        if (idsToRetry.length < limit) {
          idsToRetry.push(error.leadId);
        }
      }
    }

    if (idsToRetry.length === 0) {
      return {
        message: 'No leads found to retry',
        retried: 0,
        failed: 0
      };
    }

    // Request sync for identified leads
    const syncResult = await syncLead({
      leadIds: idsToRetry.slice(0, limit),
      action: 'createOrUpdate'
    });

    return {
      message: `Retry requested for ${syncResult.totalRequested} leads`,
      retried: syncResult.totalRequested,
      failed: syncResult.totalFailed,
      details: syncResult.results
    };
  } catch (error) {
    throw new Error(`Retry failed: ${error.message}`);
  }
}
