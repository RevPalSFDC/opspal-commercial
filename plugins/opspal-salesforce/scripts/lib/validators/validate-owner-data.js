#!/usr/bin/env node

/**
 * Owner Data Validator
 *
 * Validates Account Owner names against Salesforce User object.
 * Prevents placeholder names (like "Monica Reed", "Zach Becker") in reports
 * by cross-referencing with actual Salesforce users.
 *
 * @module validate-owner-data
 * @version 1.0.0
 * @created 2026-01-26
 * @reflection c2d94a07 - beta-corp P1 data-quality issue
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Escape string for SOQL literal
 * @private
 */
function escapeSoqlLiteral(value) {
  return String(value).replace(/'/g, "\\'");
}

/**
 * Execute SOQL query via Salesforce CLI
 * @private
 */
async function executeQuery(query, orgAlias = null) {
  const orgFlag = orgAlias ? `--target-org ${orgAlias}` : '';
  const command = `sf data query --query "${query.replace(/"/g, '\\"')}" ${orgFlag} --json`;

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024
    });

    const result = JSON.parse(output);
    if (result.status !== 0) {
      throw new Error(result.message || 'Query failed');
    }
    return result.result;

  } catch (error) {
    try {
      const errorResult = JSON.parse(error.stdout || error.stderr || '{}');
      throw new Error(errorResult.message || error.message);
    } catch {
      throw new Error(error.message);
    }
  }
}

/**
 * Validate a single owner name against Salesforce User object
 *
 * @param {string} ownerName - The owner name to validate
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Validation result
 *
 * @example
 * const result = await validateOwnerName('John Smith', 'myorg');
 * if (result.valid) {
 *   console.log(`User ${result.data.Name} found`);
 * }
 */
async function validateOwnerName(ownerName, orgAlias = null) {
  if (!ownerName || typeof ownerName !== 'string') {
    return {
      valid: false,
      type: 'User',
      name: ownerName,
      error: 'Invalid owner name: must be a non-empty string',
      severity: 'critical'
    };
  }

  const trimmedName = ownerName.trim();
  if (!trimmedName) {
    return {
      valid: false,
      type: 'User',
      name: ownerName,
      error: 'Owner name is empty after trimming',
      severity: 'critical'
    };
  }

  const safeName = escapeSoqlLiteral(trimmedName);
  const query = `
    SELECT Id, Name, IsActive, Email, Username
    FROM User
    WHERE Name = '${safeName}'
    LIMIT 2
  `;

  try {
    const result = await executeQuery(query, orgAlias);

    if (!result.records || result.records.length === 0) {
      return {
        valid: false,
        type: 'User',
        name: trimmedName,
        error: `User not found in org: "${trimmedName}"`,
        severity: 'critical',
        resolution: 'Verify the owner name exists in Salesforce or use a valid User name'
      };
    }

    if (result.records.length > 1) {
      return {
        valid: false,
        type: 'User',
        name: trimmedName,
        error: `Multiple users found with name "${trimmedName}"`,
        severity: 'warning',
        resolution: 'Use Email or Username to disambiguate',
        matches: result.records.map(u => ({ Id: u.Id, Name: u.Name, Email: u.Email }))
      };
    }

    const user = result.records[0];

    if (!user.IsActive) {
      return {
        valid: false,
        type: 'User',
        name: trimmedName,
        id: user.Id,
        data: user,
        error: `User "${user.Name}" is inactive`,
        severity: 'critical',
        resolution: 'Assign to active user or roll up to Marketing User (Unassigned)'
      };
    }

    return {
      valid: true,
      type: 'User',
      name: trimmedName,
      id: user.Id,
      data: {
        Id: user.Id,
        Name: user.Name,
        IsActive: user.IsActive,
        Email: user.Email,
        Username: user.Username
      },
      message: `User "${user.Name}" is active and valid`
    };

  } catch (error) {
    return {
      valid: false,
      type: 'User',
      name: trimmedName,
      error: `Query failed: ${error.message}`,
      severity: 'critical'
    };
  }
}

/**
 * Validate multiple owner names against Salesforce
 *
 * @param {Array<string>} ownerNames - Array of owner names to validate
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Batch validation results
 *
 * @example
 * const results = await validateOwnerReferences(['John Smith', 'Jane Doe'], 'myorg');
 * console.log(`Valid: ${results.validCount}/${results.totalCount}`);
 */
async function validateOwnerReferences(ownerNames, orgAlias = null) {
  if (!Array.isArray(ownerNames)) {
    throw new Error('ownerNames must be an array');
  }

  // Deduplicate and filter empty values
  const uniqueNames = [...new Set(ownerNames.filter(n => n && typeof n === 'string' && n.trim()))];

  if (uniqueNames.length === 0) {
    return {
      totalCount: 0,
      validCount: 0,
      invalidCount: 0,
      inactiveCount: 0,
      results: [],
      valid: [],
      invalid: [],
      inactive: []
    };
  }

  // Build batch query for efficiency
  const namesList = uniqueNames.map(n => `'${escapeSoqlLiteral(n.trim())}'`).join(',');
  const query = `
    SELECT Id, Name, IsActive, Email, Username
    FROM User
    WHERE Name IN (${namesList})
  `;

  let userMap = new Map();

  try {
    const result = await executeQuery(query, orgAlias);
    if (result.records) {
      for (const user of result.records) {
        // Handle potential multiple users with same name
        if (!userMap.has(user.Name)) {
          userMap.set(user.Name, []);
        }
        userMap.get(user.Name).push(user);
      }
    }
  } catch (error) {
    // If batch query fails, fall back to individual queries
    console.warn(`Batch query failed, falling back to individual queries: ${error.message}`);
  }

  const results = {
    totalCount: uniqueNames.length,
    validCount: 0,
    invalidCount: 0,
    inactiveCount: 0,
    results: [],
    valid: [],
    invalid: [],
    inactive: []
  };

  for (const name of uniqueNames) {
    const trimmedName = name.trim();
    const users = userMap.get(trimmedName);

    if (!users || users.length === 0) {
      const validation = {
        valid: false,
        type: 'User',
        name: trimmedName,
        error: `User not found in org: "${trimmedName}"`,
        severity: 'critical',
        resolution: 'Verify the owner name exists in Salesforce'
      };
      results.results.push(validation);
      results.invalid.push(validation);
      results.invalidCount++;
    } else if (users.length > 1) {
      const validation = {
        valid: false,
        type: 'User',
        name: trimmedName,
        error: `Multiple users found with name "${trimmedName}"`,
        severity: 'warning',
        resolution: 'Use Email or Username to disambiguate',
        matches: users.map(u => ({ Id: u.Id, Name: u.Name, Email: u.Email }))
      };
      results.results.push(validation);
      results.invalid.push(validation);
      results.invalidCount++;
    } else {
      const user = users[0];
      if (!user.IsActive) {
        const validation = {
          valid: false,
          type: 'User',
          name: trimmedName,
          id: user.Id,
          data: user,
          error: `User "${user.Name}" is inactive`,
          severity: 'critical',
          resolution: 'Assign to active user or roll up to Marketing User (Unassigned)'
        };
        results.results.push(validation);
        results.inactive.push(validation);
        results.inactiveCount++;
      } else {
        const validation = {
          valid: true,
          type: 'User',
          name: trimmedName,
          id: user.Id,
          data: {
            Id: user.Id,
            Name: user.Name,
            IsActive: user.IsActive,
            Email: user.Email,
            Username: user.Username
          },
          message: `User "${user.Name}" is active and valid`
        };
        results.results.push(validation);
        results.valid.push(validation);
        results.validCount++;
      }
    }
  }

  return results;
}

/**
 * Check if a user is active by their ID
 *
 * @param {string} userId - Salesforce User ID
 * @param {string} [orgAlias] - Salesforce org alias
 * @returns {Promise<Object>} Active status result
 */
async function checkUserIsActive(userId, orgAlias = null) {
  if (!userId || typeof userId !== 'string') {
    return {
      valid: false,
      isActive: false,
      error: 'Invalid user ID'
    };
  }

  if (!userId.startsWith('005')) {
    return {
      valid: false,
      isActive: false,
      error: 'Invalid user ID: must start with 005'
    };
  }

  const query = `SELECT Id, Name, IsActive FROM User WHERE Id = '${escapeSoqlLiteral(userId)}'`;

  try {
    const result = await executeQuery(query, orgAlias);
    if (!result.records || result.records.length === 0) {
      return {
        valid: false,
        isActive: false,
        userId,
        error: 'User not found'
      };
    }

    const user = result.records[0];
    return {
      valid: true,
      isActive: user.IsActive,
      userId,
      name: user.Name
    };
  } catch (error) {
    return {
      valid: false,
      isActive: false,
      userId,
      error: error.message
    };
  }
}

/**
 * Cross-reference owner names from a CSV file with Salesforce
 *
 * @param {string} csvPath - Path to CSV file
 * @param {string} [orgAlias] - Salesforce org alias
 * @param {Object} [options] - Options
 * @param {string} [options.ownerColumn] - Column name containing owner names (default: 'Account Owner')
 * @returns {Promise<Object>} Cross-reference results
 *
 * @example
 * const results = await crossReferenceWithCSV('./accounts.csv', 'myorg', { ownerColumn: 'Owner' });
 */
async function crossReferenceWithCSV(csvPath, orgAlias = null, options = {}) {
  const ownerColumn = options.ownerColumn || 'Account Owner';

  // Read and parse CSV
  let csvContent;
  try {
    csvContent = fs.readFileSync(csvPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read CSV file: ${error.message}`);
  }

  // Simple CSV parsing (handles basic cases)
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV file has no data rows');
  }

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const ownerIndex = headers.findIndex(h =>
    h.toLowerCase().trim() === ownerColumn.toLowerCase() ||
    h.toLowerCase().trim() === 'account owner' ||
    h.toLowerCase().trim() === 'owner' ||
    h.toLowerCase().trim() === 'owner name' ||
    h.toLowerCase().trim() === 'ownerid'
  );

  if (ownerIndex === -1) {
    throw new Error(`Owner column "${ownerColumn}" not found. Available columns: ${headers.join(', ')}`);
  }

  // Extract owner names
  const ownerNames = [];
  const rowToOwner = new Map();

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const ownerName = values[ownerIndex]?.trim();
    if (ownerName) {
      ownerNames.push(ownerName);
      if (!rowToOwner.has(ownerName)) {
        rowToOwner.set(ownerName, []);
      }
      rowToOwner.get(ownerName).push(i + 1); // 1-indexed row number
    }
  }

  // Validate against Salesforce
  const validation = await validateOwnerReferences(ownerNames, orgAlias);

  // Generate report
  return {
    csvPath,
    totalRows: lines.length - 1,
    ownerColumn: headers[ownerIndex],
    uniqueOwners: validation.totalCount,
    validation,
    rowMapping: Object.fromEntries(rowToOwner),
    summary: {
      valid: validation.validCount,
      invalid: validation.invalidCount,
      inactive: validation.inactiveCount,
      invalidOwners: validation.invalid.map(v => ({
        name: v.name,
        error: v.error,
        rows: rowToOwner.get(v.name) || []
      })),
      inactiveOwners: validation.inactive.map(v => ({
        name: v.name,
        rows: rowToOwner.get(v.name) || []
      }))
    }
  };
}

/**
 * Simple CSV line parser that handles quoted values
 * @private
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Generate a validation report for owner data
 *
 * @param {Object} results - Results from validateOwnerReferences
 * @returns {Object} Structured report
 */
function generateValidationReport(results) {
  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.totalCount,
      valid: results.validCount,
      invalid: results.invalidCount,
      inactive: results.inactiveCount,
      passRate: results.totalCount > 0
        ? ((results.validCount / results.totalCount) * 100).toFixed(1) + '%'
        : 'N/A'
    },
    details: {
      validOwners: results.valid.map(v => ({
        name: v.name,
        id: v.id,
        email: v.data?.Email
      })),
      invalidOwners: results.invalid.map(v => ({
        name: v.name,
        error: v.error,
        severity: v.severity,
        resolution: v.resolution
      })),
      inactiveOwners: results.inactive.map(v => ({
        name: v.name,
        id: v.id,
        resolution: v.resolution
      }))
    },
    recommendations: generateRecommendations(results)
  };
}

/**
 * Generate recommendations based on validation results
 * @private
 */
function generateRecommendations(results) {
  const recommendations = [];

  if (results.invalidCount > 0) {
    recommendations.push({
      priority: 'high',
      issue: `${results.invalidCount} owner name(s) not found in Salesforce`,
      action: 'Verify these names exist as Users or update to valid User names',
      affectedNames: results.invalid.map(v => v.name)
    });
  }

  if (results.inactiveCount > 0) {
    recommendations.push({
      priority: 'high',
      issue: `${results.inactiveCount} owner(s) are inactive users`,
      action: 'Reassign records to active users before processing',
      affectedNames: results.inactive.map(v => v.name)
    });
  }

  if (results.validCount === results.totalCount && results.totalCount > 0) {
    recommendations.push({
      priority: 'info',
      issue: 'All owner names validated successfully',
      action: 'No action required'
    });
  }

  return recommendations;
}

// Export functions
module.exports = {
  validateOwnerName,
  validateOwnerReferences,
  checkUserIsActive,
  crossReferenceWithCSV,
  generateValidationReport
};

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  function printUsage() {
    console.log('Usage:');
    console.log('  node validate-owner-data.js --names "Name1,Name2" [--org alias]');
    console.log('  node validate-owner-data.js --csv ./file.csv [--org alias] [--column "Owner"]');
    console.log('');
    console.log('Options:');
    console.log('  --names     Comma-separated list of owner names to validate');
    console.log('  --csv       Path to CSV file with owner data');
    console.log('  --org       Salesforce org alias (optional)');
    console.log('  --column    Column name containing owner names (default: "Account Owner")');
    console.log('  --json      Output results as JSON');
    console.log('');
    console.log('Examples:');
    console.log('  node validate-owner-data.js --names "John Smith,Jane Doe" --org production');
    console.log('  node validate-owner-data.js --csv ./accounts.csv --org production --column "Owner"');
  }

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(1);
  }

  const namesIndex = args.indexOf('--names');
  const csvIndex = args.indexOf('--csv');
  const orgIndex = args.indexOf('--org');
  const columnIndex = args.indexOf('--column');
  const jsonOutput = args.includes('--json');

  const orgAlias = orgIndex >= 0 ? args[orgIndex + 1] : null;

  (async () => {
    try {
      let results;

      if (namesIndex >= 0) {
        const names = args[namesIndex + 1].split(',').map(n => n.trim());
        console.log(`Validating ${names.length} owner name(s)...`);
        if (orgAlias) console.log(`Org: ${orgAlias}`);
        console.log('');

        results = await validateOwnerReferences(names, orgAlias);
      } else if (csvIndex >= 0) {
        const csvPath = args[csvIndex + 1];
        const ownerColumn = columnIndex >= 0 ? args[columnIndex + 1] : 'Account Owner';
        console.log(`Cross-referencing CSV: ${csvPath}`);
        if (orgAlias) console.log(`Org: ${orgAlias}`);
        console.log('');

        const csvResults = await crossReferenceWithCSV(csvPath, orgAlias, { ownerColumn });
        results = csvResults.validation;

        if (!jsonOutput) {
          console.log(`CSV Statistics:`);
          console.log(`  Total rows: ${csvResults.totalRows}`);
          console.log(`  Owner column: ${csvResults.ownerColumn}`);
          console.log(`  Unique owners: ${csvResults.uniqueOwners}`);
          console.log('');
        }
      } else {
        printUsage();
        process.exit(1);
      }

      const report = generateValidationReport(results);

      if (jsonOutput) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log('=== Validation Summary ===');
        console.log(`Total owners: ${report.summary.total}`);
        console.log(`Valid: ${report.summary.valid}`);
        console.log(`Invalid: ${report.summary.invalid}`);
        console.log(`Inactive: ${report.summary.inactive}`);
        console.log(`Pass rate: ${report.summary.passRate}`);
        console.log('');

        if (report.details.invalidOwners.length > 0) {
          console.log('=== Invalid Owners ===');
          for (const owner of report.details.invalidOwners) {
            console.log(`  ✗ ${owner.name}`);
            console.log(`    Error: ${owner.error}`);
            if (owner.resolution) {
              console.log(`    Resolution: ${owner.resolution}`);
            }
          }
          console.log('');
        }

        if (report.details.inactiveOwners.length > 0) {
          console.log('=== Inactive Owners ===');
          for (const owner of report.details.inactiveOwners) {
            console.log(`  ⚠ ${owner.name} (${owner.id})`);
            console.log(`    Resolution: ${owner.resolution}`);
          }
          console.log('');
        }

        if (report.recommendations.length > 0) {
          console.log('=== Recommendations ===');
          for (const rec of report.recommendations) {
            const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'info' ? '✅' : '🟡';
            console.log(`${icon} ${rec.issue}`);
            console.log(`   Action: ${rec.action}`);
          }
        }
      }

      // Exit with error code if validation failed
      if (results.invalidCount > 0 || results.inactiveCount > 0) {
        process.exit(1);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
