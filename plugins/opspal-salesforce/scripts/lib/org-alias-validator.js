/**
 * Org Alias Validator
 *
 * Pre-validates Salesforce org aliases before operations to catch
 * authentication issues early and provide clear guidance.
 *
 * Related reflections: c44fe70e
 * ROI: $2,250/yr
 *
 * @module org-alias-validator
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Common alias patterns
const ALIAS_PATTERNS = {
  production: /^(prod|production|prd|live|main)$/i,
  sandbox: /^(sandbox|sbx|dev|test|qa|uat|staging|stg|sit)[\w-]*$/i,
  scratch: /^(scratch|so|scratchorg)[\w-]*$/i
};

/**
 * List all authenticated orgs
 * @returns {Object} Org list result
 */
function listOrgs() {
  const result = {
    success: false,
    orgs: [],
    defaultUsername: null,
    defaultDevHub: null,
    error: null
  };

  try {
    const output = execSync(
      'sf org list --json',
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const response = JSON.parse(output);
    if (response.result) {
      result.success = true;

      // Process non-scratch orgs
      if (response.result.nonScratchOrgs) {
        for (const org of response.result.nonScratchOrgs) {
          result.orgs.push({
            alias: org.alias,
            username: org.username,
            orgId: org.orgId,
            instanceUrl: org.instanceUrl,
            isDefaultUsername: org.isDefaultUsername || false,
            isDevHub: org.isDevHub || false,
            connectedStatus: org.connectedStatus
          });

          if (org.isDefaultUsername) {
            result.defaultUsername = org.alias || org.username;
          }
        }
      }

      // Process scratch orgs
      if (response.result.scratchOrgs) {
        for (const org of response.result.scratchOrgs) {
          result.orgs.push({
            alias: org.alias,
            username: org.username,
            orgId: org.orgId,
            instanceUrl: org.instanceUrl,
            isScratch: true,
            expirationDate: org.expirationDate,
            devHubUsername: org.devHubUsername
          });
        }
      }

      // Find default DevHub
      const devHub = result.orgs.find(o => o.isDevHub);
      if (devHub) {
        result.defaultDevHub = devHub.alias || devHub.username;
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Validate a specific org alias
 * @param {string} alias - Org alias to validate
 * @returns {Object} Validation result
 */
function validateAlias(alias) {
  const result = {
    valid: false,
    alias,
    exists: false,
    canConnect: false,
    orgDetails: null,
    suggestions: [],
    error: null
  };

  if (!alias || typeof alias !== 'string') {
    result.error = 'Alias must be a non-empty string';
    return result;
  }

  // Clean alias
  const cleanAlias = alias.trim();

  // Get org list
  const orgList = listOrgs();

  if (!orgList.success) {
    result.error = `Failed to list orgs: ${orgList.error}`;
    return result;
  }

  // Find matching org
  const matchedOrg = orgList.orgs.find(o =>
    o.alias?.toLowerCase() === cleanAlias.toLowerCase() ||
    o.username?.toLowerCase() === cleanAlias.toLowerCase()
  );

  if (matchedOrg) {
    result.exists = true;
    result.orgDetails = matchedOrg;

    // Test connection
    const connectionTest = testOrgConnection(matchedOrg.alias || matchedOrg.username);
    result.canConnect = connectionTest.success;

    if (!connectionTest.success) {
      result.error = connectionTest.error;
      result.suggestions.push(
        `Re-authenticate with: sf org login web --alias ${cleanAlias}`,
        'Check if the org is still accessible',
        'Verify your network connection'
      );
    } else {
      result.valid = true;
    }
  } else {
    result.error = `Org alias '${cleanAlias}' not found`;

    // Find similar aliases
    const similarAliases = findSimilarAliases(cleanAlias, orgList.orgs);
    if (similarAliases.length > 0) {
      result.suggestions.push(`Did you mean: ${similarAliases.join(', ')}?`);
    }

    result.suggestions.push(
      `Authenticate with: sf org login web --alias ${cleanAlias}`,
      'View authenticated orgs with: sf org list'
    );

    // Suggest default if available
    if (orgList.defaultUsername) {
      result.suggestions.push(`Default org available: ${orgList.defaultUsername}`);
    }
  }

  return result;
}

/**
 * Test connection to an org
 * @param {string} alias - Org alias to test
 * @returns {Object} Connection test result
 */
function testOrgConnection(alias) {
  const result = {
    success: false,
    responseTime: null,
    error: null
  };

  try {
    const start = Date.now();

    // Simple query to test connection
    const output = execSync(
      `sf data query --query "SELECT Id FROM Organization LIMIT 1" --target-org ${alias} --json`,
      {
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024
      }
    );

    result.responseTime = Date.now() - start;

    const response = JSON.parse(output);
    if (response.result?.records?.length > 0) {
      result.success = true;
    } else {
      result.error = 'Query returned no results';
    }
  } catch (err) {
    if (err.message?.includes('timeout')) {
      result.error = 'Connection timeout - org may be slow or unreachable';
    } else if (err.message?.includes('INVALID_SESSION_ID') || err.message?.includes('Session expired')) {
      result.error = 'Session expired - re-authentication required';
    } else if (err.message?.includes('INVALID_LOGIN')) {
      result.error = 'Invalid credentials - re-authentication required';
    } else {
      result.error = err.message;
    }
  }

  return result;
}

/**
 * Find similar aliases using Levenshtein distance
 * @param {string} input - Input alias
 * @param {Object[]} orgs - List of orgs
 * @returns {string[]} Similar aliases
 */
function findSimilarAliases(input, orgs) {
  const threshold = 3; // Max edit distance
  const similar = [];

  for (const org of orgs) {
    const alias = org.alias || org.username;
    if (alias) {
      const distance = levenshteinDistance(input.toLowerCase(), alias.toLowerCase());
      if (distance <= threshold && distance > 0) {
        similar.push({ alias, distance });
      }
    }
  }

  return similar
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(s => s.alias);
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Detect org type from alias
 * @param {string} alias - Org alias
 * @returns {Object} Detected type
 */
function detectOrgType(alias) {
  const result = {
    alias,
    type: 'unknown',
    confidence: 'low',
    warnings: []
  };

  if (ALIAS_PATTERNS.production.test(alias)) {
    result.type = 'production';
    result.confidence = 'high';
    result.warnings.push('This appears to be a production org - exercise caution');
  } else if (ALIAS_PATTERNS.sandbox.test(alias)) {
    result.type = 'sandbox';
    result.confidence = 'high';
  } else if (ALIAS_PATTERNS.scratch.test(alias)) {
    result.type = 'scratch';
    result.confidence = 'high';
    result.warnings.push('Scratch orgs are temporary and may expire');
  }

  return result;
}

/**
 * Get org info for display
 * @param {string} alias - Org alias
 * @returns {Object} Org info
 */
function getOrgInfo(alias) {
  const validation = validateAlias(alias);

  if (!validation.valid) {
    return validation;
  }

  const orgType = detectOrgType(alias);

  return {
    ...validation,
    orgType: orgType.type,
    warnings: orgType.warnings,
    displayInfo: {
      alias: validation.orgDetails?.alias,
      username: validation.orgDetails?.username,
      orgId: validation.orgDetails?.orgId,
      instanceUrl: validation.orgDetails?.instanceUrl,
      isScratch: validation.orgDetails?.isScratch || false,
      expirationDate: validation.orgDetails?.expirationDate
    }
  };
}

/**
 * Pre-flight check for operations
 * @param {string} alias - Org alias
 * @param {Object} options - Check options
 * @returns {Object} Pre-flight result
 */
function preflightCheck(alias, options = {}) {
  const result = {
    passed: false,
    alias,
    checks: {},
    blockers: [],
    warnings: []
  };

  // Validate alias
  const validation = validateAlias(alias);
  result.checks.aliasValid = validation.exists;
  result.checks.connectionValid = validation.canConnect;

  if (!validation.valid) {
    result.blockers.push(validation.error);
    result.suggestions = validation.suggestions;
    return result;
  }

  // Check org type
  const orgType = detectOrgType(alias);
  result.checks.orgType = orgType.type;

  if (orgType.type === 'production' && !options.allowProduction) {
    result.warnings.push('Operating on production org - ensure you have approval');
  }

  if (orgType.type === 'scratch' && validation.orgDetails?.expirationDate) {
    const expDate = new Date(validation.orgDetails.expirationDate);
    const daysUntilExpiry = Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry <= 0) {
      result.blockers.push('Scratch org has expired');
    } else if (daysUntilExpiry <= 3) {
      result.warnings.push(`Scratch org expires in ${daysUntilExpiry} day(s)`);
    }
  }

  result.passed = result.blockers.length === 0;
  result.orgDetails = validation.orgDetails;

  return result;
}

/**
 * Resolve the current active org dynamically
 *
 * Checks environment variables and sf CLI to determine the current
 * active org without requiring a hardcoded alias string.
 *
 * Resolution order:
 *   1. SF_TARGET_ORG environment variable
 *   2. ORG_ALIAS environment variable
 *   3. sf org display --json (default org from sf CLI)
 *
 * @param {Object} options - Resolution options
 * @param {boolean} options.validate - Validate the resolved alias (default: false)
 * @returns {Object} { alias, username, orgId, source, error }
 */
function resolveCurrentOrg(options = {}) {
  const result = {
    alias: null,
    username: null,
    orgId: null,
    source: null,
    error: null
  };

  // 1. Check SF_TARGET_ORG env var
  if (process.env.SF_TARGET_ORG) {
    result.alias = process.env.SF_TARGET_ORG;
    result.source = 'SF_TARGET_ORG';
  }

  // 2. Check ORG_ALIAS env var
  if (!result.alias && process.env.ORG_ALIAS) {
    result.alias = process.env.ORG_ALIAS;
    result.source = 'ORG_ALIAS';
  }

  // 3. Fall back to sf org display (default org)
  if (!result.alias) {
    try {
      const output = execSync(
        'sf org display --json',
        { encoding: 'utf8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
      );
      const response = JSON.parse(output);
      if (response.result) {
        result.alias = response.result.alias || response.result.username;
        result.username = response.result.username;
        result.orgId = response.result.id;
        result.source = 'sf_default_org';
      }
    } catch (err) {
      // sf org display failed — no default org set
    }
  }

  // 4. If still no alias, try listing orgs for the default
  if (!result.alias) {
    const orgList = listOrgs();
    if (orgList.success && orgList.defaultUsername) {
      result.alias = orgList.defaultUsername;
      result.source = 'sf_org_list_default';
    }
  }

  // No org found
  if (!result.alias) {
    result.error =
      'No org could be resolved. Set SF_TARGET_ORG or ORG_ALIAS, ' +
      'or authenticate with: sf org login web --alias <name>';
    return result;
  }

  // Optionally validate the resolved alias
  if (options.validate) {
    const validation = validateAlias(result.alias);
    if (validation.valid) {
      result.username = result.username || validation.orgDetails?.username;
      result.orgId = result.orgId || validation.orgDetails?.orgId;
    } else {
      result.error = `Resolved alias '${result.alias}' (from ${result.source}) failed validation: ${validation.error}`;
      if (validation.suggestions && validation.suggestions.length > 0) {
        result.suggestions = validation.suggestions;
      }
    }
  }

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'validate':
      if (!args[1]) {
        console.error('Usage: org-alias-validator.js validate <alias>');
        process.exit(1);
      }
      const validation = validateAlias(args[1]);
      console.log(JSON.stringify(validation, null, 2));
      process.exit(validation.valid ? 0 : 1);
      break;

    case 'list':
      const orgs = listOrgs();
      console.log(JSON.stringify(orgs, null, 2));
      process.exit(orgs.success ? 0 : 1);
      break;

    case 'test':
      if (!args[1]) {
        console.error('Usage: org-alias-validator.js test <alias>');
        process.exit(1);
      }
      const testResult = testOrgConnection(args[1]);
      console.log(JSON.stringify(testResult, null, 2));
      process.exit(testResult.success ? 0 : 1);
      break;

    case 'info':
      if (!args[1]) {
        console.error('Usage: org-alias-validator.js info <alias>');
        process.exit(1);
      }
      const info = getOrgInfo(args[1]);
      console.log(JSON.stringify(info, null, 2));
      break;

    case 'preflight':
      if (!args[1]) {
        console.error('Usage: org-alias-validator.js preflight <alias> [--allow-production]');
        process.exit(1);
      }
      const allowProd = args.includes('--allow-production');
      const preflight = preflightCheck(args[1], { allowProduction: allowProd });
      console.log(JSON.stringify(preflight, null, 2));
      process.exit(preflight.passed ? 0 : 1);
      break;

    case 'resolve':
      const resolveValidate = args.includes('--validate');
      const resolved = resolveCurrentOrg({ validate: resolveValidate });
      console.log(JSON.stringify(resolved, null, 2));
      process.exit(resolved.error ? 1 : 0);
      break;

    default:
      console.log(`Org Alias Validator

Usage:
  org-alias-validator.js validate <alias>              Validate org alias exists and can connect
  org-alias-validator.js list                          List all authenticated orgs
  org-alias-validator.js test <alias>                  Test connection to org
  org-alias-validator.js info <alias>                  Get detailed org info
  org-alias-validator.js preflight <alias> [options]   Pre-flight check before operations
  org-alias-validator.js resolve [--validate]          Resolve current active org dynamically

Options for preflight:
  --allow-production    Allow operations on production orgs without warning

Options for resolve:
  --validate            Also validate the resolved alias can connect

Features:
  - Validates alias exists in sf CLI
  - Tests connection with simple query
  - Suggests similar aliases on typos
  - Detects org type (production, sandbox, scratch)
  - Warns about scratch org expiration
  - Pre-flight checks before operations
  - Dynamic org resolution from env vars and sf CLI

Examples:
  # Validate an alias
  node org-alias-validator.js validate my-sandbox

  # List all authenticated orgs
  node org-alias-validator.js list

  # Test connection
  node org-alias-validator.js test my-sandbox

  # Pre-flight check
  node org-alias-validator.js preflight my-sandbox

  # Pre-flight with production allowed
  node org-alias-validator.js preflight my-prod --allow-production

  # Resolve current active org
  node org-alias-validator.js resolve

  # Resolve and validate connection
  node org-alias-validator.js resolve --validate
`);
  }
}

module.exports = {
  ALIAS_PATTERNS,
  listOrgs,
  validateAlias,
  testOrgConnection,
  findSimilarAliases,
  detectOrgType,
  getOrgInfo,
  preflightCheck,
  resolveCurrentOrg
};
