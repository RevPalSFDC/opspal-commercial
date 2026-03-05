#!/usr/bin/env node
/**
 * Junction Record Guard
 *
 * Prevents duplicate junction records by implementing the Get-Check-Create pattern.
 * Addresses reflection feedback about OpportunityContactRole and other junction objects
 * being created without proper duplicate checks.
 *
 * Pattern: Get Records → IsNull check → Create only if not exists
 *
 * @module junction-record-guard
 * @version 1.0.0
 */

const { execSync } = require('child_process');

/**
 * Known junction objects and their unique key fields
 * These combinations should be unique - creating duplicates causes data issues
 */
const JUNCTION_OBJECTS = {
  // Standard Salesforce junction objects
  OpportunityContactRole: {
    parentField: 'OpportunityId',
    childField: 'ContactId',
    additionalKeys: ['Role'],
    description: 'Links Contacts to Opportunities with roles'
  },
  AccountContactRole: {
    parentField: 'AccountId',
    childField: 'ContactId',
    additionalKeys: ['Role'],
    description: 'Links Contacts to Accounts with roles'
  },
  CaseContactRole: {
    parentField: 'CasesId',
    childField: 'ContactId',
    additionalKeys: ['Role'],
    description: 'Links Contacts to Cases with roles'
  },
  ContractContactRole: {
    parentField: 'ContractId',
    childField: 'ContactId',
    additionalKeys: ['Role'],
    description: 'Links Contacts to Contracts with roles'
  },
  OpportunityTeamMember: {
    parentField: 'OpportunityId',
    childField: 'UserId',
    additionalKeys: ['TeamMemberRole'],
    description: 'Links Users to Opportunities as team members'
  },
  AccountTeamMember: {
    parentField: 'AccountId',
    childField: 'UserId',
    additionalKeys: ['TeamMemberRole'],
    description: 'Links Users to Accounts as team members'
  },
  CampaignMember: {
    parentField: 'CampaignId',
    childField: 'LeadId,ContactId', // Either Lead OR Contact
    additionalKeys: ['Status'],
    description: 'Links Leads/Contacts to Campaigns'
  },

  // CPQ junction objects
  'SBQQ__QuoteLineGroup__c': {
    parentField: 'SBQQ__Quote__c',
    childField: 'SBQQ__Number__c',
    additionalKeys: [],
    description: 'Groups Quote Lines within a Quote'
  },
  'SBQQ__ProductOption__c': {
    parentField: 'SBQQ__ConfiguredSKU__c',
    childField: 'SBQQ__OptionalSKU__c',
    additionalKeys: ['SBQQ__Type__c'],
    description: 'Links Products as options of other Products'
  },
  'SBQQ__PriceRule__c': {
    parentField: 'SBQQ__TargetObject__c',
    childField: 'SBQQ__Product__c',
    additionalKeys: ['SBQQ__Active__c'],
    description: 'Price rules for products'
  },

  // Custom junction patterns (common patterns)
  // Add org-specific junction objects here or via config
};

/**
 * Configuration for junction record guard
 */
const CONFIG = {
  // Maximum records to check in a single query
  maxQueryRecords: 200,

  // Timeout for SF CLI commands (ms)
  cliTimeout: 30000,

  // Cache TTL for existence checks (ms)
  cacheTTL: 60000,

  // Verbose logging
  verbose: process.env.JUNCTION_GUARD_VERBOSE === '1'
};

// Simple in-memory cache for existence checks
const existenceCache = new Map();

/**
 * Check if a junction record already exists
 *
 * @param {string} objectName - Junction object API name
 * @param {Object} keyValues - Key field values to check
 * @param {string} [targetOrg] - Target org alias
 * @returns {Promise<{exists: boolean, recordId?: string, record?: Object}>}
 */
async function checkExists(objectName, keyValues, targetOrg = null) {
  const cacheKey = `${objectName}:${JSON.stringify(keyValues)}:${targetOrg || 'default'}`;

  // Check cache first
  const cached = existenceCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CONFIG.cacheTTL) {
    if (CONFIG.verbose) {
      console.log(`[CACHE HIT] ${objectName} exists: ${cached.exists}`);
    }
    return cached;
  }

  // Build SOQL query
  const whereConditions = Object.entries(keyValues)
    .filter(([_, value]) => value !== null && value !== undefined)
    .map(([field, value]) => {
      if (typeof value === 'string') {
        return `${field} = '${value.replace(/'/g, "\\'")}'`;
      }
      return `${field} = ${value}`;
    });

  if (whereConditions.length === 0) {
    throw new Error('No key values provided for existence check');
  }

  const query = `SELECT Id FROM ${objectName} WHERE ${whereConditions.join(' AND ')} LIMIT 1`;

  if (CONFIG.verbose) {
    console.log(`[QUERY] ${query}`);
  }

  try {
    const orgFlag = targetOrg ? `--target-org ${targetOrg}` : '';
    const result = execSync(
      `sf data query --query "${query}" ${orgFlag} --json`,
      {
        encoding: 'utf8',
        timeout: CONFIG.cliTimeout,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const parsed = JSON.parse(result);
    const records = parsed.result?.records || [];

    const response = {
      exists: records.length > 0,
      recordId: records[0]?.Id,
      record: records[0],
      timestamp: Date.now()
    };

    // Cache the result
    existenceCache.set(cacheKey, response);

    return response;
  } catch (error) {
    // Handle query errors gracefully
    if (error.message?.includes('INVALID_FIELD') ||
        error.message?.includes('INVALID_TYPE')) {
      console.error(`[ERROR] Invalid object or field: ${error.message}`);
      throw error;
    }

    // Connection errors - don't cache, let caller retry
    console.error(`[ERROR] Query failed: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a junction record can be safely created (doesn't already exist)
 *
 * @param {string} objectName - Junction object API name
 * @param {Object} recordData - Full record data to be created
 * @param {string} [targetOrg] - Target org alias
 * @returns {Promise<{canCreate: boolean, reason?: string, existingId?: string}>}
 */
async function canCreate(objectName, recordData, targetOrg = null) {
  const junctionConfig = JUNCTION_OBJECTS[objectName];

  if (!junctionConfig) {
    // Unknown junction object - allow creation but warn
    console.warn(`[WARN] Unknown junction object: ${objectName}. No duplicate check performed.`);
    return { canCreate: true, reason: 'unknown_object' };
  }

  // Build key values from record data
  const keyValues = {};

  // Add parent field
  if (recordData[junctionConfig.parentField]) {
    keyValues[junctionConfig.parentField] = recordData[junctionConfig.parentField];
  } else {
    return {
      canCreate: false,
      reason: `Missing required parent field: ${junctionConfig.parentField}`
    };
  }

  // Add child field(s) - some junction objects have OR conditions (e.g., CampaignMember)
  const childFields = junctionConfig.childField.split(',');
  let hasChildField = false;

  for (const childField of childFields) {
    if (recordData[childField]) {
      keyValues[childField] = recordData[childField];
      hasChildField = true;
      break; // Only need one child field value
    }
  }

  if (!hasChildField) {
    return {
      canCreate: false,
      reason: `Missing required child field: ${junctionConfig.childField}`
    };
  }

  // Add additional key fields if present in record data
  for (const additionalKey of junctionConfig.additionalKeys || []) {
    if (recordData[additionalKey]) {
      keyValues[additionalKey] = recordData[additionalKey];
    }
  }

  // Check existence
  const existsResult = await checkExists(objectName, keyValues, targetOrg);

  if (existsResult.exists) {
    return {
      canCreate: false,
      reason: 'duplicate_exists',
      existingId: existsResult.recordId,
      existingRecord: existsResult.record
    };
  }

  return { canCreate: true };
}

/**
 * Create or get existing junction record (upsert-like behavior)
 *
 * @param {string} objectName - Junction object API name
 * @param {Object} recordData - Record data to create
 * @param {string} [targetOrg] - Target org alias
 * @returns {Promise<{created: boolean, recordId: string, record?: Object}>}
 */
async function createOrGet(objectName, recordData, targetOrg = null) {
  const canCreateResult = await canCreate(objectName, recordData, targetOrg);

  if (!canCreateResult.canCreate) {
    if (canCreateResult.reason === 'duplicate_exists') {
      return {
        created: false,
        recordId: canCreateResult.existingId,
        record: canCreateResult.existingRecord,
        message: 'Existing record found, skipping creation'
      };
    }
    throw new Error(`Cannot create junction record: ${canCreateResult.reason}`);
  }

  // Create the record
  const orgFlag = targetOrg ? `--target-org ${targetOrg}` : '';
  const valuesJson = JSON.stringify(recordData);

  try {
    const result = execSync(
      `sf data create record --sobject ${objectName} --values '${valuesJson}' ${orgFlag} --json`,
      {
        encoding: 'utf8',
        timeout: CONFIG.cliTimeout,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const parsed = JSON.parse(result);

    // Clear cache for this object
    for (const key of existenceCache.keys()) {
      if (key.startsWith(`${objectName}:`)) {
        existenceCache.delete(key);
      }
    }

    return {
      created: true,
      recordId: parsed.result?.id,
      message: 'New record created'
    };
  } catch (error) {
    console.error(`[ERROR] Failed to create record: ${error.message}`);
    throw error;
  }
}

/**
 * Bulk check for existing junction records
 *
 * @param {string} objectName - Junction object API name
 * @param {Array<Object>} records - Array of record data to check
 * @param {string} [targetOrg] - Target org alias
 * @returns {Promise<{toCreate: Array, existing: Array}>}
 */
async function bulkCheck(objectName, records, targetOrg = null) {
  const junctionConfig = JUNCTION_OBJECTS[objectName];
  const toCreate = [];
  const existing = [];

  if (!junctionConfig) {
    console.warn(`[WARN] Unknown junction object: ${objectName}. All records marked for creation.`);
    return { toCreate: records, existing: [] };
  }

  // Build a bulk query to check all at once (more efficient)
  const parentField = junctionConfig.parentField;
  const childFields = junctionConfig.childField.split(',');

  // Group by parent ID for efficient querying
  const byParent = new Map();
  for (const record of records) {
    const parentId = record[parentField];
    if (!byParent.has(parentId)) {
      byParent.set(parentId, []);
    }
    byParent.get(parentId).push(record);
  }

  // Query each parent group
  for (const [parentId, parentRecords] of byParent) {
    // Build child IDs list
    const childIds = new Set();
    const childField = childFields.find(f => parentRecords[0][f]);

    if (!childField) {
      console.warn(`[WARN] No child field found in records for parent ${parentId}`);
      toCreate.push(...parentRecords);
      continue;
    }

    for (const record of parentRecords) {
      if (record[childField]) {
        childIds.add(record[childField]);
      }
    }

    if (childIds.size === 0) {
      toCreate.push(...parentRecords);
      continue;
    }

    // Query for existing
    const childIdList = Array.from(childIds).map(id => `'${id}'`).join(',');
    const query = `SELECT Id, ${parentField}, ${childField} FROM ${objectName} ` +
                  `WHERE ${parentField} = '${parentId}' AND ${childField} IN (${childIdList})`;

    try {
      const orgFlag = targetOrg ? `--target-org ${targetOrg}` : '';
      const result = execSync(
        `sf data query --query "${query}" ${orgFlag} --json`,
        {
          encoding: 'utf8',
          timeout: CONFIG.cliTimeout,
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );

      const parsed = JSON.parse(result);
      const existingRecords = parsed.result?.records || [];

      // Build a set of existing child IDs
      const existingChildIds = new Set(
        existingRecords.map(r => r[childField])
      );

      // Categorize records
      for (const record of parentRecords) {
        const childId = record[childField];
        if (existingChildIds.has(childId)) {
          const existingRecord = existingRecords.find(r => r[childField] === childId);
          existing.push({
            input: record,
            existing: existingRecord
          });
        } else {
          toCreate.push(record);
        }
      }
    } catch (error) {
      console.error(`[ERROR] Bulk check failed for parent ${parentId}: ${error.message}`);
      // On error, mark all as needing creation (fail-open for bulk operations)
      toCreate.push(...parentRecords);
    }
  }

  return { toCreate, existing };
}

/**
 * Generate Flow XML pattern for Get-Check-Create
 * Returns the recommended Flow pattern for a junction object
 *
 * @param {string} objectName - Junction object API name
 * @returns {Object} Flow pattern specification
 */
function generateFlowPattern(objectName) {
  const junctionConfig = JUNCTION_OBJECTS[objectName] || {
    parentField: 'ParentId',
    childField: 'ChildId',
    additionalKeys: [],
    description: 'Unknown junction object'
  };

  const childField = junctionConfig.childField.split(',')[0];

  return {
    objectName,
    pattern: 'Get-Check-Create',
    description: junctionConfig.description,
    elements: [
      {
        name: `Get_Existing_${objectName.replace(/__c$/, '')}`,
        type: 'recordLookups',
        object: objectName,
        filterConditions: [
          { field: junctionConfig.parentField, operator: 'EqualTo', value: `{!${junctionConfig.parentField}}` },
          { field: childField, operator: 'EqualTo', value: `{!${childField}}` }
        ],
        storeOutputAutomatically: true,
        getFirstRecordOnly: true
      },
      {
        name: `Check_${objectName.replace(/__c$/, '')}_Exists`,
        type: 'decisions',
        defaultConnector: `Create_${objectName.replace(/__c$/, '')}`,
        rules: [
          {
            name: 'Already_Exists',
            conditionLogic: 'and',
            conditions: [
              {
                leftValueReference: `Get_Existing_${objectName.replace(/__c$/, '')}`,
                operator: 'IsNull',
                rightValue: { booleanValue: false }
              }
            ],
            connector: 'Skip_Creation' // Or update existing
          }
        ]
      },
      {
        name: `Create_${objectName.replace(/__c$/, '')}`,
        type: 'recordCreates',
        object: objectName,
        inputAssignments: [
          { field: junctionConfig.parentField, value: `{!${junctionConfig.parentField}}` },
          { field: childField, value: `{!${childField}}` },
          ...junctionConfig.additionalKeys.map(key => ({
            field: key,
            value: `{!${key}}`
          }))
        ]
      }
    ],
    notes: [
      'ALWAYS check for existing record before creating',
      'Use Get Records with First Record Only = true',
      'Decision element checks if record is null',
      'Only create if no existing record found',
      `Key fields: ${junctionConfig.parentField}, ${childField}`,
      junctionConfig.additionalKeys.length > 0
        ? `Additional keys to consider: ${junctionConfig.additionalKeys.join(', ')}`
        : null
    ].filter(Boolean)
  };
}

/**
 * Validate a Flow for proper junction record handling
 *
 * @param {string} flowXml - Flow XML content
 * @param {string} objectName - Junction object to check for
 * @returns {Object} Validation result with issues and recommendations
 */
function validateFlowPattern(flowXml, objectName) {
  const issues = [];
  const recommendations = [];

  const junctionConfig = JUNCTION_OBJECTS[objectName];
  if (!junctionConfig) {
    return {
      valid: true,
      issues: [],
      recommendations: [`Unknown junction object: ${objectName}. Manual review recommended.`]
    };
  }

  // Check for recordCreates without preceding recordLookups
  const hasCreate = flowXml.includes(`<object>${objectName}</object>`) &&
                    flowXml.includes('<recordCreates>');
  const hasLookup = flowXml.includes(`<object>${objectName}</object>`) &&
                    flowXml.includes('<recordLookups>');
  const hasDecision = flowXml.includes('<decisions>');

  if (hasCreate && !hasLookup) {
    issues.push({
      severity: 'ERROR',
      code: 'MISSING_EXISTENCE_CHECK',
      message: `Flow creates ${objectName} without checking if record already exists`,
      recommendation: 'Add Get Records element before Create Records to check for duplicates'
    });
  }

  if (hasCreate && hasLookup && !hasDecision) {
    issues.push({
      severity: 'WARNING',
      code: 'MISSING_NULL_CHECK',
      message: `Flow has Get Records for ${objectName} but may not check if null before creating`,
      recommendation: 'Add Decision element to check if Get Records result is null'
    });
  }

  // Check for proper filter conditions in lookup
  const parentFieldCheck = flowXml.includes(junctionConfig.parentField);
  const childField = junctionConfig.childField.split(',')[0];
  const childFieldCheck = flowXml.includes(childField);

  if (hasLookup && (!parentFieldCheck || !childFieldCheck)) {
    issues.push({
      severity: 'WARNING',
      code: 'INCOMPLETE_FILTER',
      message: `Get Records for ${objectName} may not filter on all key fields`,
      recommendation: `Ensure filter includes both ${junctionConfig.parentField} and ${childField}`
    });
  }

  // Generate pattern if issues found
  if (issues.length > 0) {
    recommendations.push({
      type: 'PATTERN',
      description: 'Recommended Flow pattern',
      pattern: generateFlowPattern(objectName)
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    recommendations
  };
}

/**
 * Register a custom junction object
 *
 * @param {string} objectName - Object API name
 * @param {Object} config - Junction configuration
 */
function registerJunctionObject(objectName, config) {
  JUNCTION_OBJECTS[objectName] = {
    parentField: config.parentField,
    childField: config.childField,
    additionalKeys: config.additionalKeys || [],
    description: config.description || `Custom junction: ${objectName}`
  };
}

/**
 * Get list of known junction objects
 *
 * @returns {Array<{name: string, config: Object}>}
 */
function getKnownJunctionObjects() {
  return Object.entries(JUNCTION_OBJECTS).map(([name, config]) => ({
    name,
    ...config
  }));
}

/**
 * Clear the existence check cache
 */
function clearCache() {
  existenceCache.clear();
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const usage = `
Junction Record Guard - Prevent Duplicate Junction Records

Usage:
  node junction-record-guard.js check <object> <json-data> [--org <alias>]
  node junction-record-guard.js create-or-get <object> <json-data> [--org <alias>]
  node junction-record-guard.js bulk-check <object> <json-file> [--org <alias>]
  node junction-record-guard.js pattern <object>
  node junction-record-guard.js validate-flow <flow-file> <object>
  node junction-record-guard.js list-objects
  node junction-record-guard.js register <object> <parent-field> <child-field> [additional-keys...]

Examples:
  # Check if OpportunityContactRole exists
  node junction-record-guard.js check OpportunityContactRole '{"OpportunityId":"006xxx","ContactId":"003xxx"}'

  # Create or get existing record
  node junction-record-guard.js create-or-get OpportunityContactRole '{"OpportunityId":"006xxx","ContactId":"003xxx","Role":"Decision Maker"}'

  # Generate Flow pattern
  node junction-record-guard.js pattern OpportunityContactRole

  # Validate Flow for junction handling
  node junction-record-guard.js validate-flow ./flows/MyFlow.flow-meta.xml OpportunityContactRole

  # List known junction objects
  node junction-record-guard.js list-objects
`;

  async function main() {
    switch (command) {
      case 'check': {
        const objectName = args[1];
        const jsonData = args[2];
        const orgIndex = args.indexOf('--org');
        const targetOrg = orgIndex > -1 ? args[orgIndex + 1] : null;

        if (!objectName || !jsonData) {
          console.error('Usage: junction-record-guard.js check <object> <json-data> [--org <alias>]');
          process.exit(1);
        }

        const recordData = JSON.parse(jsonData);
        const result = await canCreate(objectName, recordData, targetOrg);

        console.log(JSON.stringify(result, null, 2));
        process.exit(result.canCreate ? 0 : 1);
        break;
      }

      case 'create-or-get': {
        const objectName = args[1];
        const jsonData = args[2];
        const orgIndex = args.indexOf('--org');
        const targetOrg = orgIndex > -1 ? args[orgIndex + 1] : null;

        if (!objectName || !jsonData) {
          console.error('Usage: junction-record-guard.js create-or-get <object> <json-data> [--org <alias>]');
          process.exit(1);
        }

        const recordData = JSON.parse(jsonData);
        const result = await createOrGet(objectName, recordData, targetOrg);

        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'bulk-check': {
        const objectName = args[1];
        const jsonFile = args[2];
        const orgIndex = args.indexOf('--org');
        const targetOrg = orgIndex > -1 ? args[orgIndex + 1] : null;

        if (!objectName || !jsonFile) {
          console.error('Usage: junction-record-guard.js bulk-check <object> <json-file> [--org <alias>]');
          process.exit(1);
        }

        const fs = require('fs');
        const records = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        const result = await bulkCheck(objectName, records, targetOrg);

        console.log(JSON.stringify({
          summary: {
            total: records.length,
            toCreate: result.toCreate.length,
            existing: result.existing.length
          },
          ...result
        }, null, 2));
        break;
      }

      case 'pattern': {
        const objectName = args[1];

        if (!objectName) {
          console.error('Usage: junction-record-guard.js pattern <object>');
          process.exit(1);
        }

        const pattern = generateFlowPattern(objectName);
        console.log(JSON.stringify(pattern, null, 2));
        break;
      }

      case 'validate-flow': {
        const flowFile = args[1];
        const objectName = args[2];

        if (!flowFile || !objectName) {
          console.error('Usage: junction-record-guard.js validate-flow <flow-file> <object>');
          process.exit(1);
        }

        const fs = require('fs');
        const flowXml = fs.readFileSync(flowFile, 'utf8');
        const result = validateFlowPattern(flowXml, objectName);

        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
        break;
      }

      case 'list-objects': {
        const objects = getKnownJunctionObjects();
        console.log('\nKnown Junction Objects:\n');
        for (const obj of objects) {
          console.log(`  ${obj.name}`);
          console.log(`    Parent: ${obj.parentField}`);
          console.log(`    Child:  ${obj.childField}`);
          if (obj.additionalKeys.length > 0) {
            console.log(`    Keys:   ${obj.additionalKeys.join(', ')}`);
          }
          console.log(`    Desc:   ${obj.description}`);
          console.log();
        }
        break;
      }

      case 'register': {
        const objectName = args[1];
        const parentField = args[2];
        const childField = args[3];
        const additionalKeys = args.slice(4);

        if (!objectName || !parentField || !childField) {
          console.error('Usage: junction-record-guard.js register <object> <parent-field> <child-field> [additional-keys...]');
          process.exit(1);
        }

        registerJunctionObject(objectName, {
          parentField,
          childField,
          additionalKeys
        });

        console.log(`Registered junction object: ${objectName}`);
        console.log(JSON.stringify(JUNCTION_OBJECTS[objectName], null, 2));
        break;
      }

      default:
        console.log(usage);
        process.exit(command === 'help' || command === '--help' ? 0 : 1);
    }
  }

  main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  checkExists,
  canCreate,
  createOrGet,
  bulkCheck,
  generateFlowPattern,
  validateFlowPattern,
  registerJunctionObject,
  getKnownJunctionObjects,
  clearCache,
  JUNCTION_OBJECTS
};
