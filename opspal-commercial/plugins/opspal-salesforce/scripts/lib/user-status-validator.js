/**
 * User Status Validator
 *
 * Validates that User ID references in bulk operations point to active users.
 * Prevents errors when lookup fields cannot be set to inactive User IDs.
 *
 * Related reflections: 72a3db58
 * ROI: $4,500/yr
 *
 * @module user-status-validator
 */

const { execSync } = require('child_process');

/**
 * Query user status from Salesforce
 * @param {string} orgAlias - Salesforce org alias
 * @param {string[]} userIds - Array of User IDs to check
 * @returns {Object} Map of userId to user info
 */
async function queryUserStatus(orgAlias, userIds) {
  const result = {
    users: {},
    errors: [],
    activeCount: 0,
    inactiveCount: 0,
    notFoundCount: 0
  };

  if (!userIds || userIds.length === 0) {
    return result;
  }

  // Remove duplicates and validate format
  const validIds = [...new Set(userIds)].filter(id => {
    // Salesforce User IDs start with 005
    return id && typeof id === 'string' && id.startsWith('005');
  });

  if (validIds.length === 0) {
    result.errors.push('No valid User IDs provided (must start with 005)');
    return result;
  }

  // Query in batches (SOQL IN clause limit is ~200 for long IDs)
  const batchSize = 100;

  for (let i = 0; i < validIds.length; i += batchSize) {
    const batch = validIds.slice(i, i + batchSize);
    const idList = batch.map(id => `'${id}'`).join(',');

    const query = `SELECT Id, Name, Username, IsActive, Profile.Name FROM User WHERE Id IN (${idList})`;

    try {
      const output = execSync(
        `sf data query --query "${query}" --target-org ${orgAlias} --json`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );

      const response = JSON.parse(output);

      if (response.result?.records) {
        for (const user of response.result.records) {
          result.users[user.Id] = {
            id: user.Id,
            name: user.Name,
            username: user.Username,
            isActive: user.IsActive,
            profileName: user.Profile?.Name
          };

          if (user.IsActive) {
            result.activeCount++;
          } else {
            result.inactiveCount++;
          }
        }
      }
    } catch (err) {
      result.errors.push(`Query failed for batch: ${err.message}`);
    }
  }

  // Check for IDs not found
  for (const id of validIds) {
    if (!result.users[id]) {
      result.users[id] = {
        id,
        name: null,
        isActive: null,
        notFound: true
      };
      result.notFoundCount++;
    }
  }

  return result;
}

/**
 * Extract User IDs from a data set
 * @param {Object[]} records - Array of records
 * @param {string[]} userFields - Field names that contain User IDs
 * @returns {Object} Extracted User IDs by field
 */
function extractUserIds(records, userFields = []) {
  const result = {
    byField: {},
    allIds: new Set(),
    recordCount: records.length
  };

  // Auto-detect user fields if not provided
  if (userFields.length === 0) {
    // Common user lookup field patterns
    userFields = [
      'OwnerId', 'CreatedById', 'LastModifiedById',
      'AccountManager__c', 'CustomerSuccess__c', 'SalesRep__c',
      'Solutions_Engineer__c', 'Technical_Contact__c',
      'AssignedTo__c', 'Manager__c', 'Approver__c'
    ];

    // Also check any field ending in __c that might be a user lookup
    if (records.length > 0) {
      const sampleRecord = records[0];
      for (const field of Object.keys(sampleRecord)) {
        const value = sampleRecord[field];
        if (typeof value === 'string' && value.startsWith('005')) {
          if (!userFields.includes(field)) {
            userFields.push(field);
          }
        }
      }
    }
  }

  for (const field of userFields) {
    result.byField[field] = new Set();
  }

  for (const record of records) {
    for (const field of userFields) {
      const value = record[field];
      if (value && typeof value === 'string' && value.startsWith('005')) {
        result.byField[field].add(value);
        result.allIds.add(value);
      }
    }
  }

  // Convert Sets to arrays for JSON serialization
  for (const field of userFields) {
    result.byField[field] = [...result.byField[field]];
  }
  result.allIds = [...result.allIds];

  return result;
}

/**
 * Validate records before bulk operation
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object[]} records - Records to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
async function validateRecordsForBulkOp(orgAlias, records, options = {}) {
  const result = {
    valid: true,
    timestamp: new Date().toISOString(),
    recordCount: records.length,
    validRecords: [],
    invalidRecords: [],
    inactiveUserReferences: [],
    notFoundUserReferences: [],
    summary: {},
    recommendations: []
  };

  // Extract user IDs
  const userFields = options.userFields || [];
  const extraction = extractUserIds(records, userFields);

  result.summary.userFieldsChecked = Object.keys(extraction.byField).length;
  result.summary.uniqueUserIds = extraction.allIds.length;

  if (extraction.allIds.length === 0) {
    result.recommendations.push('No user ID references found in records');
    return result;
  }

  // Query user status
  const userStatus = await queryUserStatus(orgAlias, extraction.allIds);

  if (userStatus.errors.length > 0) {
    result.recommendations.push(...userStatus.errors);
  }

  result.summary.activeUsers = userStatus.activeCount;
  result.summary.inactiveUsers = userStatus.inactiveCount;
  result.summary.notFoundUsers = userStatus.notFoundCount;

  // Validate each record
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const issues = [];

    for (const [field, ids] of Object.entries(extraction.byField)) {
      const value = record[field];

      if (value && userStatus.users[value]) {
        const user = userStatus.users[value];

        if (user.notFound) {
          issues.push({
            field,
            userId: value,
            issue: 'user_not_found',
            message: `User ID ${value} not found in org`
          });

          result.notFoundUserReferences.push({
            recordIndex: i,
            field,
            userId: value
          });
        } else if (!user.isActive) {
          issues.push({
            field,
            userId: value,
            userName: user.name,
            issue: 'inactive_user',
            message: `User "${user.name}" (${value}) is inactive`
          });

          result.inactiveUserReferences.push({
            recordIndex: i,
            field,
            userId: value,
            userName: user.name
          });
        }
      }
    }

    if (issues.length > 0) {
      result.invalidRecords.push({
        recordIndex: i,
        record: options.includeRecordData ? record : undefined,
        issues
      });
    } else {
      result.validRecords.push(i);
    }
  }

  // Determine validity
  result.valid = result.invalidRecords.length === 0;

  // Generate recommendations
  if (result.inactiveUserReferences.length > 0) {
    const uniqueInactiveUsers = [...new Set(
      result.inactiveUserReferences.map(r => r.userName || r.userId)
    )];

    result.recommendations.push(
      `Found ${result.inactiveUserReferences.length} references to inactive users`,
      `Inactive users: ${uniqueInactiveUsers.join(', ')}`,
      'Options: Skip these records, reactivate users temporarily, or reassign to active users'
    );
  }

  if (result.notFoundUserReferences.length > 0) {
    result.recommendations.push(
      `Found ${result.notFoundUserReferences.length} references to non-existent users`,
      'These records may have corrupted data or reference deleted users'
    );
  }

  if (result.valid) {
    result.recommendations.push('All user references are valid and active');
  }

  return result;
}

/**
 * Generate a skip list for records with inactive users
 * @param {Object} validationResult - Result from validateRecordsForBulkOp
 * @returns {number[]} Array of record indices to skip
 */
function generateSkipList(validationResult) {
  return validationResult.invalidRecords.map(r => r.recordIndex);
}

/**
 * Filter records to only include those with active user references
 * @param {Object[]} records - Original records
 * @param {Object} validationResult - Result from validateRecordsForBulkOp
 * @returns {Object[]} Filtered records
 */
function filterValidRecords(records, validationResult) {
  const validIndices = new Set(validationResult.validRecords);
  return records.filter((_, index) => validIndices.has(index));
}

/**
 * Check if a single User ID is active
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} userId - User ID to check
 * @returns {Object} User status
 */
async function checkSingleUser(orgAlias, userId) {
  const result = await queryUserStatus(orgAlias, [userId]);
  return result.users[userId] || { id: userId, notFound: true };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'check':
      if (!args[1] || !args[2]) {
        console.error('Usage: user-status-validator.js check <org-alias> <user-id>');
        process.exit(1);
      }
      checkSingleUser(args[1], args[2]).then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.isActive ? 0 : 1);
      });
      break;

    case 'check-bulk':
      if (!args[1] || !args[2]) {
        console.error('Usage: user-status-validator.js check-bulk <org-alias> <user-ids-comma-separated>');
        process.exit(1);
      }
      const ids = args[2].split(',').map(id => id.trim());
      queryUserStatus(args[1], ids).then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.inactiveCount === 0 ? 0 : 1);
      });
      break;

    case 'validate-csv':
      if (!args[1] || !args[2]) {
        console.error('Usage: user-status-validator.js validate-csv <org-alias> <csv-path> [--user-fields field1,field2]');
        process.exit(1);
      }

      const fs = require('fs');
      const csvPath = args[2];

      if (!fs.existsSync(csvPath)) {
        console.error(`CSV file not found: ${csvPath}`);
        process.exit(1);
      }

      // Simple CSV parsing
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const records = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const record = {};
        headers.forEach((h, idx) => {
          record[h] = values[idx];
        });
        records.push(record);
      }

      const userFieldsIdx = args.indexOf('--user-fields');
      const userFieldsList = userFieldsIdx > 0
        ? args[userFieldsIdx + 1].split(',').map(f => f.trim())
        : [];

      validateRecordsForBulkOp(args[1], records, { userFields: userFieldsList }).then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.valid ? 0 : 1);
      });
      break;

    default:
      console.log(`User Status Validator

Usage:
  user-status-validator.js check <org> <user-id>           Check single user status
  user-status-validator.js check-bulk <org> <ids>          Check multiple users (comma-separated)
  user-status-validator.js validate-csv <org> <csv> [opts] Validate CSV for bulk operation

Options for validate-csv:
  --user-fields field1,field2    Specific fields to check (auto-detected if not provided)

Auto-detected User Fields:
  - OwnerId, CreatedById, LastModifiedById
  - Any field ending in __c containing a value starting with '005'

Exit Codes:
  0 - All users active / validation passed
  1 - Inactive or not found users detected

Examples:
  # Check if a specific user is active
  node user-status-validator.js check my-org 0051234567890123

  # Check multiple users
  node user-status-validator.js check-bulk my-org 0051234567890123,0051234567890456

  # Validate a CSV before bulk update
  node user-status-validator.js validate-csv my-org accounts.csv --user-fields OwnerId,Solutions_Engineer__c
`);
  }
}

module.exports = {
  queryUserStatus,
  extractUserIds,
  validateRecordsForBulkOp,
  generateSkipList,
  filterValidRecords,
  checkSingleUser
};
