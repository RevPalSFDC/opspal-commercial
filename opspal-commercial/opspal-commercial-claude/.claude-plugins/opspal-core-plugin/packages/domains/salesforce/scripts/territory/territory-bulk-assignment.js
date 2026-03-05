#!/usr/bin/env node

/**
 * Territory Bulk Assignment Executor
 *
 * Execute bulk territory assignments safely with validation,
 * duplicate detection, chunked processing, and rollback support.
 *
 * @module territory-bulk-assignment
 * @version 1.0.0
 * @see docs/runbooks/territory-management/05-user-assignment-strategies.md
 * @see docs/runbooks/territory-management/06-account-assignment-patterns.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHUNK_SIZE = 200;
const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Execute SF CLI query
 * @param {string} query - SOQL query
 * @param {string} orgAlias - Target org alias
 * @returns {Array} Query results
 */
function sfQuery(query, orgAlias) {
  const cmd = `sf data query --query "${query}" --target-org ${orgAlias} --json`;

  try {
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }));
    return result.result?.records || [];
  } catch (error) {
    console.error(`Query failed: ${error.message}`);
    return [];
  }
}

/**
 * Create a single record
 * @param {string} sobject - SObject type
 * @param {Object} values - Field values
 * @param {string} orgAlias - Target org alias
 * @returns {Object} Result with id or error
 */
function sfCreate(sobject, values, orgAlias) {
  const valuesStr = Object.entries(values)
    .map(([k, v]) => `${k}='${v}'`)
    .join(' ');

  const cmd = `sf data create record --sobject ${sobject} --values "${valuesStr}" --target-org ${orgAlias} --json`;

  try {
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
    return { success: true, id: result.result?.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete a single record
 * @param {string} sobject - SObject type
 * @param {string} recordId - Record ID
 * @param {string} orgAlias - Target org alias
 * @returns {Object} Result
 */
function sfDelete(sobject, recordId, orgAlias) {
  const cmd = `sf data delete record --sobject ${sobject} --record-id ${recordId} --target-org ${orgAlias} --json`;

  try {
    execSync(cmd, { encoding: 'utf-8' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Parse CSV file
 * @param {string} filePath - Path to CSV file
 * @returns {Array} Array of objects
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = values[i];
    });
    return obj;
  });
}

/**
 * Validate user assignments before execution
 * @param {string} orgAlias - Target org alias
 * @param {Array} assignments - Assignments to validate
 * @param {string} modelId - Territory2Model ID (optional, for model-specific validation)
 * @returns {Object} Validation results
 */
async function validateUserAssignments(orgAlias, assignments, modelId = null) {
  const results = {
    valid: [],
    invalid: [],
    duplicates: [],
    summary: { total: assignments.length, valid: 0, invalid: 0, duplicate: 0 }
  };

  // Get unique IDs
  const userIds = [...new Set(assignments.map(a => a.UserId))];
  const territoryIds = [...new Set(assignments.map(a => a.Territory2Id))];

  // Validate users exist and are active
  const users = sfQuery(`
    SELECT Id, IsActive FROM User WHERE Id IN ('${userIds.join("','")}')
  `, orgAlias);
  const activeUsers = new Set(users.filter(u => u.IsActive).map(u => u.Id));

  // Validate territories exist
  let territoryQuery = `SELECT Id FROM Territory2 WHERE Id IN ('${territoryIds.join("','")}')`;
  if (modelId) {
    territoryQuery += ` AND Territory2ModelId = '${modelId}'`;
  }
  const territories = sfQuery(territoryQuery, orgAlias);
  const validTerritories = new Set(territories.map(t => t.Id));

  // Check existing assignments
  const existing = sfQuery(`
    SELECT UserId, Territory2Id FROM UserTerritory2Association
    WHERE UserId IN ('${userIds.join("','")}')
    AND Territory2Id IN ('${territoryIds.join("','")}')
  `, orgAlias);
  const existingSet = new Set(existing.map(e => `${e.UserId}_${e.Territory2Id}`));

  // Validate each assignment
  for (const assignment of assignments) {
    const key = `${assignment.UserId}_${assignment.Territory2Id}`;
    const errors = [];

    if (!activeUsers.has(assignment.UserId)) {
      errors.push('User not found or inactive');
    }
    if (!validTerritories.has(assignment.Territory2Id)) {
      errors.push('Territory not found' + (modelId ? ' in specified model' : ''));
    }

    if (existingSet.has(key)) {
      results.duplicates.push(assignment);
      results.summary.duplicate++;
    } else if (errors.length > 0) {
      results.invalid.push({ ...assignment, errors });
      results.summary.invalid++;
    } else {
      results.valid.push(assignment);
      results.summary.valid++;
    }
  }

  return results;
}

/**
 * Validate account assignments before execution
 * @param {string} orgAlias - Target org alias
 * @param {Array} assignments - Assignments to validate
 * @param {string} modelId - Territory2Model ID (optional)
 * @returns {Object} Validation results
 */
async function validateAccountAssignments(orgAlias, assignments, modelId = null) {
  const results = {
    valid: [],
    invalid: [],
    duplicates: [],
    excluded: [],
    summary: { total: assignments.length, valid: 0, invalid: 0, duplicate: 0, excluded: 0 }
  };

  // Get unique IDs
  const accountIds = [...new Set(assignments.map(a => a.ObjectId))];
  const territoryIds = [...new Set(assignments.map(a => a.Territory2Id))];

  // Validate accounts exist
  const accounts = sfQuery(`
    SELECT Id FROM Account WHERE Id IN ('${accountIds.join("','")}')
  `, orgAlias);
  const validAccounts = new Set(accounts.map(a => a.Id));

  // Validate territories exist
  let territoryQuery = `SELECT Id FROM Territory2 WHERE Id IN ('${territoryIds.join("','")}')`;
  if (modelId) {
    territoryQuery += ` AND Territory2ModelId = '${modelId}'`;
  }
  const territories = sfQuery(territoryQuery, orgAlias);
  const validTerritories = new Set(territories.map(t => t.Id));

  // Check existing assignments
  const existing = sfQuery(`
    SELECT ObjectId, Territory2Id FROM ObjectTerritory2Association
    WHERE ObjectId IN ('${accountIds.join("','")}')
    AND Territory2Id IN ('${territoryIds.join("','")}')
  `, orgAlias);
  const existingSet = new Set(existing.map(e => `${e.ObjectId}_${e.Territory2Id}`));

  // Check exclusions
  const exclusions = sfQuery(`
    SELECT ObjectId, Territory2Id FROM Territory2ObjectExclusion
    WHERE ObjectId IN ('${accountIds.join("','")}')
    AND Territory2Id IN ('${territoryIds.join("','")}')
  `, orgAlias);
  const exclusionSet = new Set(exclusions.map(e => `${e.ObjectId}_${e.Territory2Id}`));

  // Validate each assignment
  for (const assignment of assignments) {
    const key = `${assignment.ObjectId}_${assignment.Territory2Id}`;
    const errors = [];

    if (!validAccounts.has(assignment.ObjectId)) {
      errors.push('Account not found');
    }
    if (!validTerritories.has(assignment.Territory2Id)) {
      errors.push('Territory not found' + (modelId ? ' in specified model' : ''));
    }

    if (exclusionSet.has(key)) {
      results.excluded.push(assignment);
      results.summary.excluded++;
    } else if (existingSet.has(key)) {
      results.duplicates.push(assignment);
      results.summary.duplicate++;
    } else if (errors.length > 0) {
      results.invalid.push({ ...assignment, errors });
      results.summary.invalid++;
    } else {
      results.valid.push(assignment);
      results.summary.valid++;
    }
  }

  return results;
}

/**
 * Execute bulk user assignments
 * @param {string} orgAlias - Target org alias
 * @param {Array} assignments - Valid assignments to create
 * @param {Object} options - Execution options
 * @returns {Object} Execution results
 */
async function executeUserAssignments(orgAlias, assignments, options = {}) {
  const { chunkSize = CHUNK_SIZE, dryRun = false } = options;

  const results = {
    created: [],
    failed: [],
    summary: { total: assignments.length, created: 0, failed: 0 }
  };

  if (dryRun) {
    console.log(`\n🔍 DRY RUN - Would create ${assignments.length} user assignments\n`);
    return { ...results, dryRun: true };
  }

  console.log(`\n📤 Creating ${assignments.length} user assignments in chunks of ${chunkSize}\n`);

  for (let i = 0; i < assignments.length; i += chunkSize) {
    const chunk = assignments.slice(i, i + chunkSize);
    const chunkNum = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(assignments.length / chunkSize);

    console.log(`Processing chunk ${chunkNum}/${totalChunks} (${chunk.length} records)...`);

    for (const assignment of chunk) {
      const values = {
        UserId: assignment.UserId,
        Territory2Id: assignment.Territory2Id
      };

      if (assignment.RoleInTerritory2) {
        values.RoleInTerritory2 = assignment.RoleInTerritory2;
      }

      let retries = 0;
      let success = false;
      let lastError = null;

      while (retries < MAX_RETRIES && !success) {
        const result = sfCreate('UserTerritory2Association', values, orgAlias);

        if (result.success) {
          results.created.push({ ...assignment, id: result.id });
          results.summary.created++;
          success = true;
        } else {
          lastError = result.error;
          retries++;
          if (retries < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
          }
        }
      }

      if (!success) {
        results.failed.push({ ...assignment, error: lastError });
        results.summary.failed++;
      }
    }

    // Brief pause between chunks
    if (i + chunkSize < assignments.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Execute bulk account assignments
 * @param {string} orgAlias - Target org alias
 * @param {Array} assignments - Valid assignments to create
 * @param {Object} options - Execution options
 * @returns {Object} Execution results
 */
async function executeAccountAssignments(orgAlias, assignments, options = {}) {
  const { chunkSize = CHUNK_SIZE, dryRun = false, associationCause = 'Territory2Manual' } = options;

  const results = {
    created: [],
    failed: [],
    summary: { total: assignments.length, created: 0, failed: 0 }
  };

  if (dryRun) {
    console.log(`\n🔍 DRY RUN - Would create ${assignments.length} account assignments\n`);
    return { ...results, dryRun: true };
  }

  console.log(`\n📤 Creating ${assignments.length} account assignments in chunks of ${chunkSize}\n`);

  for (let i = 0; i < assignments.length; i += chunkSize) {
    const chunk = assignments.slice(i, i + chunkSize);
    const chunkNum = Math.floor(i / chunkSize) + 1;
    const totalChunks = Math.ceil(assignments.length / chunkSize);

    console.log(`Processing chunk ${chunkNum}/${totalChunks} (${chunk.length} records)...`);

    for (const assignment of chunk) {
      const values = {
        ObjectId: assignment.ObjectId,
        Territory2Id: assignment.Territory2Id,
        AssociationCause: assignment.AssociationCause || associationCause
      };

      let retries = 0;
      let success = false;
      let lastError = null;

      while (retries < MAX_RETRIES && !success) {
        const result = sfCreate('ObjectTerritory2Association', values, orgAlias);

        if (result.success) {
          results.created.push({ ...assignment, id: result.id });
          results.summary.created++;
          success = true;
        } else {
          lastError = result.error;
          retries++;
          if (retries < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
          }
        }
      }

      if (!success) {
        results.failed.push({ ...assignment, error: lastError });
        results.summary.failed++;
      }
    }

    // Brief pause between chunks
    if (i + chunkSize < assignments.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Rollback created assignments
 * @param {string} orgAlias - Target org alias
 * @param {Array} createdRecords - Records to rollback
 * @param {string} type - Assignment type (user or account)
 * @returns {Object} Rollback results
 */
async function rollbackAssignments(orgAlias, createdRecords, type) {
  const sobject = type === 'user' ? 'UserTerritory2Association' : 'ObjectTerritory2Association';

  const results = {
    deleted: [],
    failed: [],
    summary: { total: createdRecords.length, deleted: 0, failed: 0 }
  };

  console.log(`\n🔄 Rolling back ${createdRecords.length} ${type} assignments...\n`);

  for (const record of createdRecords) {
    if (!record.id) continue;

    const result = sfDelete(sobject, record.id, orgAlias);

    if (result.success) {
      results.deleted.push(record);
      results.summary.deleted++;
    } else {
      results.failed.push({ ...record, rollbackError: result.error });
      results.summary.failed++;
    }
  }

  return results;
}

/**
 * Create checkpoint file for potential rollback
 * @param {Object} executionResults - Execution results
 * @param {string} type - Assignment type
 * @returns {string} Checkpoint file path
 */
function createCheckpoint(executionResults, type) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const checkpointPath = `territory-assignment-checkpoint-${type}-${timestamp}.json`;

  const checkpoint = {
    timestamp: new Date().toISOString(),
    type,
    created: executionResults.created
  };

  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
  console.log(`\n📄 Checkpoint created: ${checkpointPath}`);

  return checkpointPath;
}

/**
 * Process bulk assignments from CSV
 * @param {string} orgAlias - Target org alias
 * @param {string} csvPath - Path to CSV file
 * @param {string} type - Assignment type (user or account)
 * @param {Object} options - Processing options
 * @returns {Object} Processing results
 */
async function processBulkAssignments(orgAlias, csvPath, type, options = {}) {
  console.log(`\n🚀 Processing ${type} assignments from: ${csvPath}\n`);

  // Parse CSV
  const assignments = parseCSV(csvPath);
  console.log(`Parsed ${assignments.length} assignments from CSV`);

  // Validate
  console.log('\n📋 Validating assignments...');
  const validation = type === 'user'
    ? await validateUserAssignments(orgAlias, assignments, options.modelId)
    : await validateAccountAssignments(orgAlias, assignments, options.modelId);

  console.log('\nValidation Summary:');
  console.log(`  ✅ Valid: ${validation.summary.valid}`);
  console.log(`  ❌ Invalid: ${validation.summary.invalid}`);
  console.log(`  ⚠️  Duplicates: ${validation.summary.duplicate}`);
  if (type === 'account') {
    console.log(`  🚫 Excluded: ${validation.summary.excluded || 0}`);
  }

  if (validation.invalid.length > 0) {
    console.log('\nInvalid assignments:');
    for (const inv of validation.invalid.slice(0, 5)) {
      console.log(`  - ${JSON.stringify(inv)}`);
    }
    if (validation.invalid.length > 5) {
      console.log(`  ... and ${validation.invalid.length - 5} more`);
    }
  }

  if (validation.valid.length === 0) {
    console.log('\n⚠️  No valid assignments to process');
    return { validation, execution: null };
  }

  // Execute
  const execution = type === 'user'
    ? await executeUserAssignments(orgAlias, validation.valid, options)
    : await executeAccountAssignments(orgAlias, validation.valid, options);

  console.log('\nExecution Summary:');
  console.log(`  ✅ Created: ${execution.summary.created}`);
  console.log(`  ❌ Failed: ${execution.summary.failed}`);

  // Create checkpoint if records were created
  let checkpointPath = null;
  if (execution.created.length > 0 && !options.dryRun) {
    checkpointPath = createCheckpoint(execution, type);
  }

  return { validation, execution, checkpointPath };
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Territory Bulk Assignment Executor

Usage: node territory-bulk-assignment.js <org-alias> <type> <csv-file> [options]

Types:
  user      - Create UserTerritory2Association records
  account   - Create ObjectTerritory2Association records

CSV Format (user):
  UserId,Territory2Id,RoleInTerritory2
  005xxx,0MIxxx,Sales Rep

CSV Format (account):
  ObjectId,Territory2Id,AssociationCause
  001xxx,0MIxxx,Territory2Manual

Options:
  --model-id=<id>     Validate territories are in specific model
  --dry-run           Validate only, don't create records
  --chunk-size=<n>    Records per chunk (default: 200)
  --rollback=<file>   Rollback from checkpoint file

Examples:
  node territory-bulk-assignment.js myorg user user_assignments.csv
  node territory-bulk-assignment.js myorg account account_assignments.csv --model-id=0MC...
  node territory-bulk-assignment.js myorg user assignments.csv --dry-run
  node territory-bulk-assignment.js myorg user --rollback=checkpoint.json
`);
    process.exit(1);
  }

  const orgAlias = args[0];
  const type = args[1];

  // Check for rollback mode
  const rollbackArg = args.find(a => a.startsWith('--rollback='));
  if (rollbackArg) {
    const checkpointPath = rollbackArg.split('=')[1];
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));

    rollbackAssignments(orgAlias, checkpoint.created, checkpoint.type)
      .then(results => {
        console.log('\nRollback Complete:');
        console.log(`  ✅ Deleted: ${results.summary.deleted}`);
        console.log(`  ❌ Failed: ${results.summary.failed}`);
        process.exit(results.summary.failed > 0 ? 1 : 0);
      });
  } else {
    const csvPath = args[2];

    // Parse options
    const options = {
      chunkSize: CHUNK_SIZE,
      dryRun: false
    };

    for (const arg of args.slice(3)) {
      if (arg.startsWith('--model-id=')) {
        options.modelId = arg.split('=')[1];
      } else if (arg === '--dry-run') {
        options.dryRun = true;
      } else if (arg.startsWith('--chunk-size=')) {
        options.chunkSize = parseInt(arg.split('=')[1]);
      }
    }

    processBulkAssignments(orgAlias, csvPath, type, options)
      .then(results => {
        const hasFailures = results.execution?.summary.failed > 0;
        process.exit(hasFailures ? 1 : 0);
      })
      .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  }
}

module.exports = {
  validateUserAssignments,
  validateAccountAssignments,
  executeUserAssignments,
  executeAccountAssignments,
  rollbackAssignments,
  processBulkAssignments
};
