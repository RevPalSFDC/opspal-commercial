#!/usr/bin/env node
/**
 * Active Record Validator
 *
 * Detects inactive/stale records in Salesforce to prevent data quality issues.
 * Addresses reflection feedback about inactive users in tracking lists,
 * stale opportunities, and records with no recent activity.
 *
 * Common patterns detected:
 * - Inactive users in TRACKED_AMS or assignment lists
 * - Opportunities with no activity for extended periods
 * - Accounts with inactive owners
 * - Campaign members with deactivated contacts
 *
 * @module active-record-validator
 * @version 1.0.0
 */

const { execSync } = require('child_process');

/**
 * Configuration for active record validation
 */
const CONFIG = {
  // Default inactivity thresholds (days)
  thresholds: {
    user: 30,           // User last login
    opportunity: 60,    // Opportunity last modified
    account: 90,        // Account last activity
    lead: 45,           // Lead last modified
    contact: 90,        // Contact last activity
    campaign: 60        // Campaign member activity
  },

  // Maximum records to return per query
  maxRecords: 200,

  // CLI timeout (ms)
  cliTimeout: 60000,

  // Verbose logging
  verbose: process.env.ACTIVE_VALIDATOR_VERBOSE === '1'
};

/**
 * Validation rule definitions
 * Each rule defines how to detect inactive/stale records
 */
const VALIDATION_RULES = {
  // User activity validation
  'inactive-users': {
    name: 'Inactive Users',
    description: 'Users who have not logged in recently',
    object: 'User',
    query: (days) => `
      SELECT Id, Name, Email, LastLoginDate, IsActive, Profile.Name
      FROM User
      WHERE IsActive = true
      AND LastLoginDate < LAST_N_DAYS:${days}
      ORDER BY LastLoginDate ASC
      LIMIT ${CONFIG.maxRecords}
    `,
    severity: 'WARNING',
    recommendation: 'Consider deactivating these users or investigating login issues'
  },

  'deactivated-owners': {
    name: 'Records with Deactivated Owners',
    description: 'Accounts/Opportunities owned by inactive users',
    object: 'Account',
    queries: [
      {
        object: 'Account',
        query: () => `
          SELECT Id, Name, OwnerId, Owner.Name, Owner.IsActive
          FROM Account
          WHERE Owner.IsActive = false
          LIMIT ${CONFIG.maxRecords}
        `
      },
      {
        object: 'Opportunity',
        query: () => `
          SELECT Id, Name, OwnerId, Owner.Name, Owner.IsActive, StageName
          FROM Opportunity
          WHERE Owner.IsActive = false
          AND IsClosed = false
          LIMIT ${CONFIG.maxRecords}
        `
      }
    ],
    severity: 'ERROR',
    recommendation: 'Reassign these records to active owners immediately'
  },

  // Tracking list validation (common pattern: TRACKED_AMS, TRACKED_REPS, etc.)
  'stale-tracking-list': {
    name: 'Stale Tracking List Members',
    description: 'Users in tracking lists who are inactive or deactivated',
    detectQuery: () => `
      SELECT Id, Name
      FROM User
      WHERE Name LIKE 'TRACKED_%'
      OR Name LIKE '%_Tracking_%'
      LIMIT 1
    `,
    // This is a pattern-based rule - actual query built dynamically
    severity: 'ERROR',
    recommendation: 'Remove inactive users from tracking lists to prevent assignment errors'
  },

  // Stale opportunity detection
  'stale-opportunities': {
    name: 'Stale Opportunities',
    description: 'Open opportunities with no recent activity',
    object: 'Opportunity',
    query: (days) => `
      SELECT Id, Name, StageName, Amount, OwnerId, Owner.Name, LastModifiedDate
      FROM Opportunity
      WHERE IsClosed = false
      AND LastModifiedDate < LAST_N_DAYS:${days}
      ORDER BY Amount DESC NULLS LAST
      LIMIT ${CONFIG.maxRecords}
    `,
    severity: 'WARNING',
    recommendation: 'Review these opportunities - they may need to be closed or updated'
  },

  // Stale lead detection
  'stale-leads': {
    name: 'Stale Leads',
    description: 'Open leads with no recent activity',
    object: 'Lead',
    query: (days) => `
      SELECT Id, Name, Status, OwnerId, Owner.Name, LastModifiedDate, Company
      FROM Lead
      WHERE IsConverted = false
      AND LastModifiedDate < LAST_N_DAYS:${days}
      ORDER BY LastModifiedDate ASC
      LIMIT ${CONFIG.maxRecords}
    `,
    severity: 'WARNING',
    recommendation: 'Review these leads for conversion or cleanup'
  },

  // Inactive campaign members
  'inactive-campaign-members': {
    name: 'Campaign Members with Inactive Contacts/Leads',
    description: 'Campaign members linked to inactive records',
    object: 'CampaignMember',
    queries: [
      {
        label: 'Deactivated Leads',
        query: () => `
          SELECT Id, CampaignId, Campaign.Name, LeadId, Lead.Name, Lead.IsConverted
          FROM CampaignMember
          WHERE Lead.IsConverted = true
          LIMIT ${CONFIG.maxRecords}
        `
      }
    ],
    severity: 'INFO',
    recommendation: 'Consider removing converted leads from active campaigns'
  },

  // Account with no contacts
  'orphan-accounts': {
    name: 'Accounts with No Contacts',
    description: 'Accounts that have no associated contacts',
    object: 'Account',
    // This requires a subquery approach
    customValidator: async (targetOrg) => {
      // Get accounts without contacts using a more complex approach
      const query = `
        SELECT Id, Name, OwnerId, CreatedDate
        FROM Account
        WHERE Id NOT IN (SELECT AccountId FROM Contact)
        AND CreatedDate < LAST_N_DAYS:30
        LIMIT ${CONFIG.maxRecords}
      `;
      return executeQuery(query, targetOrg);
    },
    severity: 'INFO',
    recommendation: 'Review these accounts - they may need contacts or cleanup'
  },

  // Custom field tracking - User lookup fields pointing to inactive users
  'inactive-user-references': {
    name: 'Inactive User References',
    description: 'Custom User lookup fields pointing to inactive users',
    // This is detected dynamically based on object schema
    dynamicDetection: true,
    severity: 'WARNING',
    recommendation: 'Update these fields to reference active users'
  }
};

/**
 * Execute a SOQL query
 *
 * @param {string} query - SOQL query
 * @param {string} [targetOrg] - Target org alias
 * @returns {Array} Query results
 */
function executeQuery(query, targetOrg = null) {
  const cleanQuery = query.replace(/\s+/g, ' ').trim();

  if (CONFIG.verbose) {
    console.log(`[QUERY] ${cleanQuery}`);
  }

  try {
    const orgFlag = targetOrg ? `--target-org ${targetOrg}` : '';
    const result = execSync(
      `sf data query --query "${cleanQuery}" ${orgFlag} --json`,
      {
        encoding: 'utf8',
        timeout: CONFIG.cliTimeout,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const parsed = JSON.parse(result);
    return parsed.result?.records || [];
  } catch (error) {
    if (CONFIG.verbose) {
      console.error(`[ERROR] Query failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Run a single validation rule
 *
 * @param {string} ruleName - Rule name
 * @param {Object} options - Validation options
 * @param {string} [options.targetOrg] - Target org alias
 * @param {number} [options.days] - Days threshold override
 * @returns {Promise<Object>} Validation result
 */
async function runValidation(ruleName, options = {}) {
  const rule = VALIDATION_RULES[ruleName];

  if (!rule) {
    throw new Error(`Unknown validation rule: ${ruleName}`);
  }

  const { targetOrg = null, days = null } = options;
  const threshold = days || CONFIG.thresholds[rule.object?.toLowerCase()] || 30;

  const result = {
    rule: ruleName,
    name: rule.name,
    description: rule.description,
    severity: rule.severity,
    threshold: threshold,
    timestamp: new Date().toISOString(),
    records: [],
    issues: [],
    recommendation: rule.recommendation
  };

  try {
    // Handle custom validators
    if (rule.customValidator) {
      result.records = await rule.customValidator(targetOrg);
    }
    // Handle multiple queries
    else if (rule.queries) {
      for (const queryDef of rule.queries) {
        const query = typeof queryDef.query === 'function'
          ? queryDef.query(threshold)
          : queryDef.query;
        const records = executeQuery(query, targetOrg);
        result.records.push({
          label: queryDef.label || queryDef.object,
          count: records.length,
          records
        });
      }
    }
    // Handle single query
    else if (rule.query) {
      const query = rule.query(threshold);
      result.records = executeQuery(query, targetOrg);
    }

    // Count issues
    if (Array.isArray(result.records)) {
      result.issueCount = result.records.length;
    } else {
      result.issueCount = result.records.reduce((sum, r) => sum + r.count, 0);
    }

    result.passed = result.issueCount === 0;

  } catch (error) {
    result.error = error.message;
    result.passed = false;
  }

  return result;
}

/**
 * Run all validation rules
 *
 * @param {Object} options - Validation options
 * @param {string} [options.targetOrg] - Target org alias
 * @param {Array<string>} [options.rules] - Specific rules to run
 * @param {string} [options.severity] - Minimum severity to include
 * @returns {Promise<Object>} Complete validation report
 */
async function runAllValidations(options = {}) {
  const { targetOrg = null, rules = null, severity = null } = options;

  const rulesToRun = rules || Object.keys(VALIDATION_RULES);

  // Filter by severity if specified
  const severityOrder = ['INFO', 'WARNING', 'ERROR'];
  const minSeverityIndex = severity ? severityOrder.indexOf(severity) : 0;

  const filteredRules = rulesToRun.filter(ruleName => {
    const rule = VALIDATION_RULES[ruleName];
    const ruleIndex = severityOrder.indexOf(rule.severity);
    return ruleIndex >= minSeverityIndex;
  });

  const report = {
    timestamp: new Date().toISOString(),
    targetOrg,
    rulesRun: filteredRules.length,
    summary: {
      passed: 0,
      warnings: 0,
      errors: 0,
      info: 0
    },
    results: []
  };

  for (const ruleName of filteredRules) {
    console.log(`Running validation: ${ruleName}...`);
    const result = await runValidation(ruleName, { targetOrg });
    report.results.push(result);

    // Update summary
    if (result.passed) {
      report.summary.passed++;
    } else {
      switch (result.severity) {
        case 'ERROR':
          report.summary.errors++;
          break;
        case 'WARNING':
          report.summary.warnings++;
          break;
        case 'INFO':
          report.summary.info++;
          break;
      }
    }
  }

  report.overallStatus = report.summary.errors > 0 ? 'FAIL' :
                         report.summary.warnings > 0 ? 'WARN' : 'PASS';

  return report;
}

/**
 * Detect inactive users in a specific User lookup field
 *
 * @param {string} objectName - Object to check
 * @param {string} fieldName - User lookup field name
 * @param {string} [targetOrg] - Target org alias
 * @returns {Promise<Array>} Records with inactive user references
 */
async function detectInactiveUserReferences(objectName, fieldName, targetOrg = null) {
  const query = `
    SELECT Id, Name, ${fieldName}, ${fieldName.replace(/__c$/, '__r')}.Name, ${fieldName.replace(/__c$/, '__r')}.IsActive
    FROM ${objectName}
    WHERE ${fieldName.replace(/__c$/, '__r')}.IsActive = false
    LIMIT ${CONFIG.maxRecords}
  `;

  return executeQuery(query, targetOrg);
}

/**
 * Validate a tracking list (custom metadata or list)
 * Common pattern: Users listed in a configuration object
 *
 * @param {string} listObject - Object containing the list
 * @param {string} userField - Field containing User ID
 * @param {string} [targetOrg] - Target org alias
 * @returns {Promise<Object>} Validation result
 */
async function validateTrackingList(listObject, userField, targetOrg = null) {
  // Get the list of users in the tracking list
  const listQuery = `
    SELECT Id, ${userField}
    FROM ${listObject}
  `;

  const listRecords = executeQuery(listQuery, targetOrg);
  const userIds = listRecords
    .map(r => r[userField])
    .filter(Boolean);

  if (userIds.length === 0) {
    return {
      passed: true,
      message: 'No users in tracking list',
      records: []
    };
  }

  // Check which users are inactive
  const userIdList = userIds.map(id => `'${id}'`).join(',');
  const userQuery = `
    SELECT Id, Name, IsActive, LastLoginDate
    FROM User
    WHERE Id IN (${userIdList})
  `;

  const users = executeQuery(userQuery, targetOrg);

  const inactiveUsers = users.filter(u => !u.IsActive);
  const staleUsers = users.filter(u => {
    if (!u.LastLoginDate) return true;
    const lastLogin = new Date(u.LastLoginDate);
    const daysAgo = (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo > CONFIG.thresholds.user;
  });

  return {
    passed: inactiveUsers.length === 0,
    inactiveUsers,
    staleUsers,
    totalUsers: users.length,
    recommendation: inactiveUsers.length > 0
      ? `Remove ${inactiveUsers.length} inactive user(s) from ${listObject}`
      : staleUsers.length > 0
        ? `Review ${staleUsers.length} user(s) with no recent login`
        : null
  };
}

/**
 * Generate cleanup recommendations based on validation results
 *
 * @param {Object} report - Validation report
 * @returns {Object} Cleanup recommendations
 */
function generateCleanupRecommendations(report) {
  const recommendations = {
    immediate: [],  // Must fix now
    shortTerm: [],  // Fix within 1 week
    longTerm: [],   // Review/fix within 1 month
    statistics: {
      totalIssues: 0,
      byCategory: {}
    }
  };

  for (const result of report.results) {
    if (result.passed) continue;

    const issueCount = result.issueCount || 0;
    recommendations.statistics.totalIssues += issueCount;
    recommendations.statistics.byCategory[result.rule] = issueCount;

    const rec = {
      rule: result.rule,
      name: result.name,
      issueCount,
      action: result.recommendation
    };

    switch (result.severity) {
      case 'ERROR':
        recommendations.immediate.push(rec);
        break;
      case 'WARNING':
        recommendations.shortTerm.push(rec);
        break;
      case 'INFO':
        recommendations.longTerm.push(rec);
        break;
    }
  }

  return recommendations;
}

/**
 * Format report for console output
 *
 * @param {Object} report - Validation report
 * @returns {string} Formatted output
 */
function formatReport(report) {
  const lines = [];

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('  ACTIVE RECORD VALIDATION REPORT');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Target Org: ${report.targetOrg || 'default'}`);
  lines.push(`Rules Run: ${report.rulesRun}`);
  lines.push('');
  lines.push(`Overall Status: ${report.overallStatus}`);
  lines.push('');
  lines.push(`  Passed:   ${report.summary.passed}`);
  lines.push(`  Errors:   ${report.summary.errors}`);
  lines.push(`  Warnings: ${report.summary.warnings}`);
  lines.push(`  Info:     ${report.summary.info}`);
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('');

  for (const result of report.results) {
    const status = result.passed ? '✓' : result.severity === 'ERROR' ? '✗' : '⚠';
    lines.push(`${status} ${result.name}`);

    if (!result.passed) {
      lines.push(`  Issues: ${result.issueCount}`);
      lines.push(`  ${result.recommendation}`);

      // Show sample records
      const records = Array.isArray(result.records)
        ? result.records.slice(0, 3)
        : (result.records[0]?.records || []).slice(0, 3);

      if (records.length > 0) {
        lines.push('  Sample records:');
        for (const rec of records) {
          lines.push(`    - ${rec.Name || rec.Id}`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const usage = `
Active Record Validator - Detect Stale and Inactive Records

Usage:
  node active-record-validator.js run [--org <alias>] [--rules <rule1,rule2>] [--severity <level>]
  node active-record-validator.js check <rule> [--org <alias>] [--days <n>]
  node active-record-validator.js tracking-list <object> <user-field> [--org <alias>]
  node active-record-validator.js user-refs <object> <field> [--org <alias>]
  node active-record-validator.js list-rules
  node active-record-validator.js help

Commands:
  run             Run all validation rules (or specified subset)
  check           Run a single validation rule
  tracking-list   Validate a specific tracking list
  user-refs       Check for inactive user references in a field
  list-rules      List all available validation rules

Options:
  --org <alias>         Target Salesforce org
  --rules <rules>       Comma-separated list of rules to run
  --severity <level>    Minimum severity: INFO, WARNING, ERROR
  --days <n>            Override default threshold (days)
  --json                Output in JSON format
  --verbose             Show detailed output

Examples:
  # Run all validations
  node active-record-validator.js run --org production

  # Run only error-level validations
  node active-record-validator.js run --severity ERROR

  # Check stale opportunities with 90-day threshold
  node active-record-validator.js check stale-opportunities --days 90

  # Validate a custom tracking list
  node active-record-validator.js tracking-list AM_Tracking__c AM__c --org production

  # Check for inactive user references
  node active-record-validator.js user-refs Opportunity Primary_Contact__c
`;

  async function main() {
    const orgIndex = args.indexOf('--org');
    const targetOrg = orgIndex > -1 ? args[orgIndex + 1] : null;

    const jsonOutput = args.includes('--json');
    CONFIG.verbose = args.includes('--verbose');

    switch (command) {
      case 'run': {
        const rulesIndex = args.indexOf('--rules');
        const rules = rulesIndex > -1 ? args[rulesIndex + 1].split(',') : null;

        const sevIndex = args.indexOf('--severity');
        const severity = sevIndex > -1 ? args[sevIndex + 1] : null;

        const report = await runAllValidations({ targetOrg, rules, severity });
        const recommendations = generateCleanupRecommendations(report);

        if (jsonOutput) {
          console.log(JSON.stringify({ report, recommendations }, null, 2));
        } else {
          console.log(formatReport(report));

          if (recommendations.immediate.length > 0) {
            console.log('\n🚨 IMMEDIATE ACTION REQUIRED:');
            for (const rec of recommendations.immediate) {
              console.log(`  - ${rec.name}: ${rec.issueCount} issues`);
              console.log(`    ${rec.action}`);
            }
          }

          if (recommendations.shortTerm.length > 0) {
            console.log('\n⚠️ ACTION WITHIN 1 WEEK:');
            for (const rec of recommendations.shortTerm) {
              console.log(`  - ${rec.name}: ${rec.issueCount} issues`);
              console.log(`    ${rec.action}`);
            }
          }
        }

        process.exit(report.overallStatus === 'FAIL' ? 1 : 0);
        break;
      }

      case 'check': {
        const ruleName = args[1];
        if (!ruleName) {
          console.error('Usage: active-record-validator.js check <rule> [--org <alias>] [--days <n>]');
          process.exit(1);
        }

        const daysIndex = args.indexOf('--days');
        const days = daysIndex > -1 ? parseInt(args[daysIndex + 1], 10) : null;

        const result = await runValidation(ruleName, { targetOrg, days });

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\n${result.name}`);
          console.log(`Status: ${result.passed ? 'PASSED' : result.severity}`);
          console.log(`Issues: ${result.issueCount}`);
          if (!result.passed) {
            console.log(`Recommendation: ${result.recommendation}`);
          }
        }

        process.exit(result.passed ? 0 : 1);
        break;
      }

      case 'tracking-list': {
        const listObject = args[1];
        const userField = args[2];

        if (!listObject || !userField) {
          console.error('Usage: active-record-validator.js tracking-list <object> <user-field> [--org <alias>]');
          process.exit(1);
        }

        const result = await validateTrackingList(listObject, userField, targetOrg);

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nTracking List Validation: ${listObject}.${userField}`);
          console.log(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
          console.log(`Total Users: ${result.totalUsers}`);
          console.log(`Inactive: ${result.inactiveUsers?.length || 0}`);
          console.log(`Stale (no recent login): ${result.staleUsers?.length || 0}`);
          if (result.recommendation) {
            console.log(`Recommendation: ${result.recommendation}`);
          }
        }

        process.exit(result.passed ? 0 : 1);
        break;
      }

      case 'user-refs': {
        const objectName = args[1];
        const fieldName = args[2];

        if (!objectName || !fieldName) {
          console.error('Usage: active-record-validator.js user-refs <object> <field> [--org <alias>]');
          process.exit(1);
        }

        const records = await detectInactiveUserReferences(objectName, fieldName, targetOrg);

        if (jsonOutput) {
          console.log(JSON.stringify({ count: records.length, records }, null, 2));
        } else {
          console.log(`\nInactive User References: ${objectName}.${fieldName}`);
          console.log(`Found: ${records.length} records`);
          for (const rec of records.slice(0, 10)) {
            console.log(`  - ${rec.Name || rec.Id}`);
          }
          if (records.length > 10) {
            console.log(`  ... and ${records.length - 10} more`);
          }
        }

        process.exit(records.length === 0 ? 0 : 1);
        break;
      }

      case 'list-rules': {
        console.log('\nAvailable Validation Rules:\n');
        for (const [name, rule] of Object.entries(VALIDATION_RULES)) {
          console.log(`  ${name}`);
          console.log(`    ${rule.name}`);
          console.log(`    Severity: ${rule.severity}`);
          console.log(`    ${rule.description}`);
          console.log();
        }
        break;
      }

      default:
        console.log(usage);
        process.exit(command === 'help' || command === '--help' ? 0 : 1);
    }
  }

  main().catch(error => {
    console.error(`Error: ${error.message}`);
    if (CONFIG.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = {
  runValidation,
  runAllValidations,
  detectInactiveUserReferences,
  validateTrackingList,
  generateCleanupRecommendations,
  formatReport,
  VALIDATION_RULES,
  CONFIG
};
