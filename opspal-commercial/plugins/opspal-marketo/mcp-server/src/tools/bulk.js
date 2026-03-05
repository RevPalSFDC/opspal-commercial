/**
 * Marketo Bulk API Tools
 *
 * MCP tools for bulk export/import operations in Marketo.
 * Supports lead and activity exports, lead imports, and activity type discovery.
 *
 * @module bulk
 * @version 1.0.0
 *
 * API Constraints:
 * - Concurrent exports: 2 running, 10 queued
 * - Concurrent imports: 10 running
 * - Daily export limit: 500MB
 * - Max date range: 31 days
 * - File retention: 7 days
 * - Auth: Uses /bulk/v1/ endpoint (different from /rest/v1/)
 */

import { apiRequest, bulkApiRequest } from '../auth/oauth-handler.js';

/**
 * Bulk tool definitions for MCP
 */
export const bulkTools = [
  // ==================== LEAD EXPORT ====================
  {
    name: 'mcp__marketo__bulk_lead_export_create',
    description: 'Create a bulk lead export job. Returns exportId to track job status. Max 31-day date range, 500MB daily limit.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to export (e.g., ["email", "firstName", "lastName", "company", "createdAt"])'
        },
        filter: {
          type: 'object',
          description: 'Filter criteria for leads',
          properties: {
            createdAt: {
              type: 'object',
              properties: {
                startAt: { type: 'string', description: 'ISO datetime start' },
                endAt: { type: 'string', description: 'ISO datetime end' }
              }
            },
            updatedAt: {
              type: 'object',
              properties: {
                startAt: { type: 'string', description: 'ISO datetime start' },
                endAt: { type: 'string', description: 'ISO datetime end' }
              }
            },
            staticListId: { type: 'number', description: 'Filter by static list ID' },
            smartListId: { type: 'number', description: 'Filter by smart list ID' }
          }
        },
        format: {
          type: 'string',
          enum: ['CSV', 'TSV'],
          description: 'Export file format',
          default: 'CSV'
        },
        columnHeaderNames: {
          type: 'object',
          description: 'Custom column header names (field: headerName)'
        }
      },
      required: ['fields', 'filter']
    }
  },
  {
    name: 'mcp__marketo__bulk_lead_export_enqueue',
    description: 'Enqueue a created lead export job for processing. Job must be created first.',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: {
          type: 'string',
          description: 'Export job ID from create call'
        }
      },
      required: ['exportId']
    }
  },
  {
    name: 'mcp__marketo__bulk_lead_export_status',
    description: 'Check status of a bulk lead export job. Returns: Created, Queued, Processing, Completed, Failed, Cancelled.',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: {
          type: 'string',
          description: 'Export job ID'
        }
      },
      required: ['exportId']
    }
  },
  {
    name: 'mcp__marketo__bulk_lead_export_file',
    description: 'Get the download URL or content for a completed lead export. Job must have status "Completed".',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: {
          type: 'string',
          description: 'Export job ID'
        },
        range: {
          type: 'string',
          description: 'Byte range for partial download (e.g., "bytes=0-10000")'
        }
      },
      required: ['exportId']
    }
  },

  // ==================== ACTIVITY EXPORT ====================
  {
    name: 'mcp__marketo__bulk_activity_export_create',
    description: 'Create a bulk activity export job. Exports activity logs for analysis. Max 31-day date range required.',
    inputSchema: {
      type: 'object',
      properties: {
        activityTypeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Activity type IDs to export (use activity_types_list to discover IDs)'
        },
        filter: {
          type: 'object',
          description: 'Filter criteria - createdAt is REQUIRED',
          properties: {
            createdAt: {
              type: 'object',
              properties: {
                startAt: { type: 'string', description: 'ISO datetime start (required)' },
                endAt: { type: 'string', description: 'ISO datetime end (required, max 31 days from start)' }
              },
              required: ['startAt', 'endAt']
            },
            primaryAttributeValueIds: {
              type: 'array',
              items: { type: 'number' },
              description: 'Filter by primary attribute values (e.g., email IDs for Email Sent)'
            },
            primaryAttributeValues: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by primary attribute names'
            }
          },
          required: ['createdAt']
        },
        format: {
          type: 'string',
          enum: ['CSV', 'TSV'],
          description: 'Export file format',
          default: 'CSV'
        }
      },
      required: ['filter']
    }
  },
  {
    name: 'mcp__marketo__bulk_activity_export_enqueue',
    description: 'Enqueue a created activity export job for processing.',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: {
          type: 'string',
          description: 'Export job ID from create call'
        }
      },
      required: ['exportId']
    }
  },
  {
    name: 'mcp__marketo__bulk_activity_export_status',
    description: 'Check status of a bulk activity export job.',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: {
          type: 'string',
          description: 'Export job ID'
        }
      },
      required: ['exportId']
    }
  },
  {
    name: 'mcp__marketo__bulk_activity_export_file',
    description: 'Get the download URL or content for a completed activity export.',
    inputSchema: {
      type: 'object',
      properties: {
        exportId: {
          type: 'string',
          description: 'Export job ID'
        },
        range: {
          type: 'string',
          description: 'Byte range for partial download'
        }
      },
      required: ['exportId']
    }
  },

  // ==================== LEAD IMPORT ====================
  {
    name: 'mcp__marketo__bulk_lead_import_create',
    description: 'Create a bulk lead import job from CSV/TSV file. Max 10MB file size, 10 concurrent jobs.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'CSV/TSV file content or base64 encoded data'
        },
        format: {
          type: 'string',
          enum: ['csv', 'tsv'],
          description: 'File format',
          default: 'csv'
        },
        lookupField: {
          type: 'string',
          description: 'Field for deduplication (default: email)',
          default: 'email'
        },
        listId: {
          type: 'number',
          description: 'Static list ID to add imported leads to'
        },
        partitionName: {
          type: 'string',
          description: 'Lead partition name (if using partitions)'
        }
      },
      required: ['file', 'format']
    }
  },
  {
    name: 'mcp__marketo__bulk_import_status',
    description: 'Check status of a bulk import job. Returns: Queued, Importing, Complete, Failed, Cancelled.',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: {
          type: 'number',
          description: 'Batch ID from import create call'
        }
      },
      required: ['batchId']
    }
  },
  {
    name: 'mcp__marketo__bulk_import_failures',
    description: 'Get failures from a completed import job. Returns CSV of failed rows with reasons.',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: {
          type: 'number',
          description: 'Batch ID from import'
        }
      },
      required: ['batchId']
    }
  },
  {
    name: 'mcp__marketo__bulk_import_warnings',
    description: 'Get warnings from a completed import job. Returns CSV of rows with warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        batchId: {
          type: 'number',
          description: 'Batch ID from import'
        }
      },
      required: ['batchId']
    }
  },

  // ==================== ACTIVITY TYPES ====================
  {
    name: 'mcp__marketo__activity_types_list',
    description: 'List all activity types in Marketo with their IDs. Use these IDs for activity queries and exports.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // ==================== PROGRAM MEMBER EXPORT ====================
  {
    name: 'mcp__marketo__bulk_program_member_export_create',
    description: 'Create a bulk export of program members. Returns member status, progression, and success metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        programId: {
          type: 'number',
          description: 'Program ID to export members from'
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to export (e.g., ["leadId", "firstName", "lastName", "email", "progressionStatus", "reachedSuccess"])'
        },
        filter: {
          type: 'object',
          properties: {
            updatedAt: {
              type: 'object',
              properties: {
                startAt: { type: 'string' },
                endAt: { type: 'string' }
              }
            }
          }
        },
        format: {
          type: 'string',
          enum: ['CSV', 'TSV'],
          default: 'CSV'
        }
      },
      required: ['programId', 'fields']
    }
  }
];

/**
 * Execute bulk tool
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool result
 */
export async function executeBulkTool(toolName, args) {
  switch (toolName) {
    // Lead Export
    case 'mcp__marketo__bulk_lead_export_create':
      return await createLeadExport(args);
    case 'mcp__marketo__bulk_lead_export_enqueue':
      return await enqueueLeadExport(args);
    case 'mcp__marketo__bulk_lead_export_status':
      return await getLeadExportStatus(args);
    case 'mcp__marketo__bulk_lead_export_file':
      return await getLeadExportFile(args);

    // Activity Export
    case 'mcp__marketo__bulk_activity_export_create':
      return await createActivityExport(args);
    case 'mcp__marketo__bulk_activity_export_enqueue':
      return await enqueueActivityExport(args);
    case 'mcp__marketo__bulk_activity_export_status':
      return await getActivityExportStatus(args);
    case 'mcp__marketo__bulk_activity_export_file':
      return await getActivityExportFile(args);

    // Lead Import
    case 'mcp__marketo__bulk_lead_import_create':
      return await createLeadImport(args);
    case 'mcp__marketo__bulk_import_status':
      return await getImportStatus(args);
    case 'mcp__marketo__bulk_import_failures':
      return await getImportFailures(args);
    case 'mcp__marketo__bulk_import_warnings':
      return await getImportWarnings(args);

    // Activity Types
    case 'mcp__marketo__activity_types_list':
      return await listActivityTypes();

    // Program Member Export
    case 'mcp__marketo__bulk_program_member_export_create':
      return await createProgramMemberExport(args);

    default:
      throw new Error(`Unknown bulk tool: ${toolName}`);
  }
}

// ==================== LEAD EXPORT IMPLEMENTATIONS ====================

/**
 * Create bulk lead export job
 */
async function createLeadExport(args) {
  const { fields, filter, format = 'CSV', columnHeaderNames } = args;

  // Validate date range (max 31 days)
  if (filter.createdAt) {
    validateDateRange(filter.createdAt.startAt, filter.createdAt.endAt);
  }
  if (filter.updatedAt) {
    validateDateRange(filter.updatedAt.startAt, filter.updatedAt.endAt);
  }

  const payload = {
    fields,
    filter,
    format
  };

  if (columnHeaderNames) {
    payload.columnHeaderNames = columnHeaderNames;
  }

  const result = await bulkApiRequest('/bulk/v1/leads/export/create.json', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    exportId: result.result?.[0]?.exportId,
    status: result.result?.[0]?.status,
    createdAt: result.result?.[0]?.createdAt,
    format: result.result?.[0]?.format,
    requestId: result.requestId
  };
}

/**
 * Enqueue lead export job
 */
async function enqueueLeadExport(args) {
  const { exportId } = args;

  const result = await bulkApiRequest(`/bulk/v1/leads/export/${exportId}/enqueue.json`, {
    method: 'POST'
  });

  return {
    success: result.success,
    exportId: result.result?.[0]?.exportId,
    status: result.result?.[0]?.status,
    queuedAt: result.result?.[0]?.queuedAt,
    requestId: result.requestId
  };
}

/**
 * Get lead export status
 */
async function getLeadExportStatus(args) {
  const { exportId } = args;

  const result = await bulkApiRequest(`/bulk/v1/leads/export/${exportId}/status.json`);

  const jobStatus = result.result?.[0];

  return {
    success: result.success,
    exportId: jobStatus?.exportId,
    status: jobStatus?.status,
    createdAt: jobStatus?.createdAt,
    queuedAt: jobStatus?.queuedAt,
    startedAt: jobStatus?.startedAt,
    finishedAt: jobStatus?.finishedAt,
    numberOfRecords: jobStatus?.numberOfRecords,
    fileSize: jobStatus?.fileSize,
    fileChecksum: jobStatus?.fileChecksum,
    format: jobStatus?.format,
    requestId: result.requestId
  };
}

/**
 * Get lead export file
 */
async function getLeadExportFile(args) {
  const { exportId, range } = args;

  const headers = {};
  if (range) {
    headers['Range'] = range;
  }

  const result = await bulkApiRequest(`/bulk/v1/leads/export/${exportId}/file.json`, {
    headers,
    responseType: 'text'
  });

  return {
    success: true,
    exportId,
    content: result,
    contentType: 'text/csv'
  };
}

// ==================== ACTIVITY EXPORT IMPLEMENTATIONS ====================

/**
 * Create bulk activity export job
 */
async function createActivityExport(args) {
  const { activityTypeIds, filter, format = 'CSV' } = args;

  // createdAt is required for activity exports
  if (!filter?.createdAt?.startAt || !filter?.createdAt?.endAt) {
    throw new Error('Activity export requires filter.createdAt.startAt and endAt');
  }

  validateDateRange(filter.createdAt.startAt, filter.createdAt.endAt);

  const payload = {
    filter,
    format
  };

  if (activityTypeIds && activityTypeIds.length > 0) {
    payload.activityTypeIds = activityTypeIds;
  }

  const result = await bulkApiRequest('/bulk/v1/activities/export/create.json', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    exportId: result.result?.[0]?.exportId,
    status: result.result?.[0]?.status,
    createdAt: result.result?.[0]?.createdAt,
    format: result.result?.[0]?.format,
    requestId: result.requestId
  };
}

/**
 * Enqueue activity export job
 */
async function enqueueActivityExport(args) {
  const { exportId } = args;

  const result = await bulkApiRequest(`/bulk/v1/activities/export/${exportId}/enqueue.json`, {
    method: 'POST'
  });

  return {
    success: result.success,
    exportId: result.result?.[0]?.exportId,
    status: result.result?.[0]?.status,
    queuedAt: result.result?.[0]?.queuedAt,
    requestId: result.requestId
  };
}

/**
 * Get activity export status
 */
async function getActivityExportStatus(args) {
  const { exportId } = args;

  const result = await bulkApiRequest(`/bulk/v1/activities/export/${exportId}/status.json`);

  const jobStatus = result.result?.[0];

  return {
    success: result.success,
    exportId: jobStatus?.exportId,
    status: jobStatus?.status,
    createdAt: jobStatus?.createdAt,
    queuedAt: jobStatus?.queuedAt,
    startedAt: jobStatus?.startedAt,
    finishedAt: jobStatus?.finishedAt,
    numberOfRecords: jobStatus?.numberOfRecords,
    fileSize: jobStatus?.fileSize,
    fileChecksum: jobStatus?.fileChecksum,
    format: jobStatus?.format,
    requestId: result.requestId
  };
}

/**
 * Get activity export file
 */
async function getActivityExportFile(args) {
  const { exportId, range } = args;

  const headers = {};
  if (range) {
    headers['Range'] = range;
  }

  const result = await bulkApiRequest(`/bulk/v1/activities/export/${exportId}/file.json`, {
    headers,
    responseType: 'text'
  });

  return {
    success: true,
    exportId,
    content: result,
    contentType: 'text/csv'
  };
}

// ==================== LEAD IMPORT IMPLEMENTATIONS ====================

/**
 * Create bulk lead import job
 */
async function createLeadImport(args) {
  const { file, format = 'csv', lookupField = 'email', listId, partitionName } = args;

  // Build multipart form data
  const boundary = '----MarketoBulkImport' + Date.now();

  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="leads.${format}"\r\n`;
  body += `Content-Type: text/${format}\r\n\r\n`;
  body += file;
  body += `\r\n--${boundary}--`;

  let endpoint = `/bulk/v1/leads.json?format=${format}&lookupField=${lookupField}`;

  if (listId) {
    endpoint += `&listId=${listId}`;
  }

  if (partitionName) {
    endpoint += `&partitionName=${encodeURIComponent(partitionName)}`;
  }

  const result = await bulkApiRequest(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });

  return {
    success: result.success,
    batchId: result.result?.[0]?.batchId,
    importId: result.result?.[0]?.importId,
    status: result.result?.[0]?.status,
    numOfLeadsProcessed: result.result?.[0]?.numOfLeadsProcessed,
    numOfRowsFailed: result.result?.[0]?.numOfRowsFailed,
    numOfRowsWithWarning: result.result?.[0]?.numOfRowsWithWarning,
    message: result.result?.[0]?.message,
    requestId: result.requestId
  };
}

/**
 * Get import job status
 */
async function getImportStatus(args) {
  const { batchId } = args;

  const result = await bulkApiRequest(`/bulk/v1/leads/batch/${batchId}.json`);

  const jobStatus = result.result?.[0];

  return {
    success: result.success,
    batchId: jobStatus?.batchId,
    status: jobStatus?.status,
    numOfLeadsProcessed: jobStatus?.numOfLeadsProcessed,
    numOfRowsFailed: jobStatus?.numOfRowsFailed,
    numOfRowsWithWarning: jobStatus?.numOfRowsWithWarning,
    message: jobStatus?.message,
    requestId: result.requestId
  };
}

/**
 * Get import failures
 */
async function getImportFailures(args) {
  const { batchId } = args;

  const result = await bulkApiRequest(`/bulk/v1/leads/batch/${batchId}/failures.json`, {
    responseType: 'text'
  });

  return {
    success: true,
    batchId,
    failures: result,
    contentType: 'text/csv'
  };
}

/**
 * Get import warnings
 */
async function getImportWarnings(args) {
  const { batchId } = args;

  const result = await bulkApiRequest(`/bulk/v1/leads/batch/${batchId}/warnings.json`, {
    responseType: 'text'
  });

  return {
    success: true,
    batchId,
    warnings: result,
    contentType: 'text/csv'
  };
}

// ==================== ACTIVITY TYPES IMPLEMENTATION ====================

/**
 * List all activity types
 */
async function listActivityTypes() {
  const result = await apiRequest('/rest/v1/activities/types.json');

  return {
    success: result.success,
    activityTypes: result.result || [],
    totalTypes: result.result?.length || 0,
    requestId: result.requestId
  };
}

// ==================== PROGRAM MEMBER EXPORT IMPLEMENTATION ====================

/**
 * Create bulk program member export
 */
async function createProgramMemberExport(args) {
  const { programId, fields, filter, format = 'CSV' } = args;

  const payload = {
    fields,
    format
  };

  if (filter) {
    payload.filter = filter;
  }

  const result = await bulkApiRequest(`/bulk/v1/program/${programId}/members/export/create.json`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    success: result.success,
    exportId: result.result?.[0]?.exportId,
    status: result.result?.[0]?.status,
    programId,
    createdAt: result.result?.[0]?.createdAt,
    format: result.result?.[0]?.format,
    requestId: result.requestId
  };
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Validate date range is within 31 days
 */
function validateDateRange(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffDays = (end - start) / (1000 * 60 * 60 * 24);

  if (diffDays > 31) {
    throw new Error(`Date range exceeds 31-day maximum. Range: ${diffDays.toFixed(1)} days`);
  }

  if (diffDays < 0) {
    throw new Error('End date must be after start date');
  }
}
