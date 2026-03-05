#!/usr/bin/env node

/**
 * Org Context Detector
 *
 * Purpose: Automatically infers the target Salesforce org from context to prevent
 * wrong-org routing errors. This addresses the reflection feedback where agents
 * defaulted to hivemq instead of inferring peregrine-main from session context.
 *
 * Detection Sources (in priority order):
 * 1. Explicit --target-org parameter (highest priority)
 * 2. Working directory path pattern (e.g., /instances/hivemq/ → hivemq)
 * 3. .sf/config.json target-org
 * 4. Environment variables (SF_TARGET_ORG / SALESFORCE_ORG_ALIAS)
 * 5. Recent sf command history
 *
 * Usage:
 *   node org-context-detector.js [options]
 *
 * Options:
 *   --cwd <path>     Override working directory for detection
 *   --verbose        Show detection details
 *   --json           Output as JSON
 *   --validate       Validate detected org exists
 *
 * Exit Codes:
 *   0 - Org detected successfully
 *   1 - No org could be detected
 *   2 - Detected org validation failed
 *
 * @module org-context-detector
 * @version 1.0.0
 * @since 2025-12-05
 * @reflection-cohort config/env
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Known instance directory patterns
  instancePatterns: [
    /\/instances\/([^\/]+)\//,           // /instances/org-name/
    /\/projects\/([^\/]+)\//,            // /projects/org-name/
    /\/clients\/([^\/]+)\//,             // /clients/org-name/
    /\/orgs\/([^\/]+)\//,                // /orgs/org-name/
    /\/salesforce\/([^\/]+)\//,          // /salesforce/org-name/
    /\/([^\/]+)-(?:sandbox|production|dev)\//,  // org-sandbox/, org-production/
  ],

  // Environment variables to check
  envVars: [
    'SF_TARGET_ORG',
    'SF_ORG_ALIAS',
    'SALESFORCE_ORG_ALIAS',
  ],

  // History file patterns
  historyPatterns: [
    /sf\s+.*--target-org[=\s]+([^\s]+)/,
    /sf\s+org\s+login.*--alias[=\s]+([^\s]+)/,
  ],
};

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect org from working directory path
 */
function detectFromPath(cwd) {
  for (const pattern of CONFIG.instancePatterns) {
    const match = cwd.match(pattern);
    if (match && match[1]) {
      return {
        org: match[1],
        source: 'path',
        confidence: 0.9,
        details: `Matched pattern: ${pattern.toString()}`,
      };
    }
  }
  return null;
}

/**
 * Detect org from .sf/config.json
 */
function detectFromSfConfig(cwd) {
  const configPaths = [
    path.join(cwd, '.sf', 'config.json'),
    path.join(process.env.HOME || '', '.sf', 'config.json'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const targetOrg = content['target-org'];
        if (targetOrg) {
          return {
            org: targetOrg,
            source: '.sf/config.json',
            confidence: configPath.includes(cwd) ? 0.9 : 0.7,
            details: `Found at: ${configPath}`,
          };
        }
      } catch (e) {
        // Invalid JSON
      }
    }
  }

  return null;
}

/**
 * Detect org from environment variables
 */
function detectFromEnv() {
  for (const envVar of CONFIG.envVars) {
    const value = process.env[envVar];
    if (value) {
      return {
        org: value,
        source: `env:${envVar}`,
        confidence: 0.85,
        details: `Environment variable ${envVar}`,
      };
    }
  }
  return null;
}

/**
 * Detect org from bash history (recent sf commands)
 */
function detectFromHistory() {
  const historyFile = path.join(process.env.HOME || '', '.bash_history');

  if (!fs.existsSync(historyFile)) {
    return null;
  }

  try {
    const history = fs.readFileSync(historyFile, 'utf8');
    const lines = history.split('\n').reverse().slice(0, 100); // Last 100 commands

    for (const line of lines) {
      for (const pattern of CONFIG.historyPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          return {
            org: match[1],
            source: 'history',
            confidence: 0.6,
            details: `Recent command: ${line.substring(0, 80)}...`,
          };
        }
      }
    }
  } catch (e) {
    // Can't read history
  }

  return null;
}

/**
 * Validate that the org exists using sf cli
 */
async function validateOrg(orgAlias, verbose) {
  try {
    const result = execSync(`sf org display --target-org "${orgAlias}" --json 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 30000,
    });

    const data = JSON.parse(result);
    if (data.status === 0) {
      return {
        valid: true,
        username: data.result?.username,
        instanceUrl: data.result?.instanceUrl,
        orgId: data.result?.id,
      };
    }
  } catch (e) {
    if (verbose) {
      console.error(`Validation failed: ${e.message}`);
    }
  }

  return { valid: false };
}

/**
 * Get list of authenticated orgs
 */
function getAuthenticatedOrgs() {
  try {
    const result = execSync('sf org list --json 2>/dev/null', {
      encoding: 'utf8',
      timeout: 30000,
    });

    const data = JSON.parse(result);
    const orgs = [];

    if (data.result?.nonScratchOrgs) {
      orgs.push(...data.result.nonScratchOrgs.map(o => ({
        alias: o.alias,
        username: o.username,
        isDefault: o.isDefaultUsername,
      })));
    }

    if (data.result?.scratchOrgs) {
      orgs.push(...data.result.scratchOrgs.map(o => ({
        alias: o.alias,
        username: o.username,
        isDefault: o.isDefaultUsername,
      })));
    }

    return orgs;
  } catch (e) {
    return [];
  }
}

// =============================================================================
// Main Detection Logic
// =============================================================================

/**
 * Detect org context using all available sources
 *
 * @param {Object} options - Detection options
 * @param {string} options.cwd - Working directory (default: process.cwd())
 * @param {boolean} options.verbose - Enable verbose output
 * @param {boolean} options.validate - Validate detected org
 * @returns {Object} Detection result
 */
async function detectOrgContext(options = {}) {
  const cwd = options.cwd || process.cwd();
  const verbose = options.verbose || false;
  const shouldValidate = options.validate || false;

  const detections = [];

  // 1. Check path patterns
  const pathResult = detectFromPath(cwd);
  if (pathResult) {
    detections.push(pathResult);
    if (verbose) console.log(`[PATH] Detected: ${pathResult.org} (confidence: ${pathResult.confidence})`);
  }

  // 2. Check .sf/config.json
  const sfResult = detectFromSfConfig(cwd);
  if (sfResult) {
    detections.push(sfResult);
    if (verbose) console.log(`[SF] Detected: ${sfResult.org} (confidence: ${sfResult.confidence})`);
  }

  // 3. Check environment variables
  const envResult = detectFromEnv();
  if (envResult) {
    detections.push(envResult);
    if (verbose) console.log(`[ENV] Detected: ${envResult.org} (confidence: ${envResult.confidence})`);
  }

  // 4. Check history (lowest priority)
  const historyResult = detectFromHistory();
  if (historyResult) {
    detections.push(historyResult);
    if (verbose) console.log(`[HISTORY] Detected: ${historyResult.org} (confidence: ${historyResult.confidence})`);
  }

  // Sort by confidence and pick the best
  detections.sort((a, b) => b.confidence - a.confidence);

  if (detections.length === 0) {
    return {
      detected: false,
      org: null,
      source: null,
      confidence: 0,
      message: 'No org context could be detected',
      suggestions: [
        'Set SF_TARGET_ORG environment variable',
        'Run: sf config set target-org <alias>',
        'Use --target-org flag explicitly',
      ],
    };
  }

  const best = detections[0];

  // Check for conflicts
  const uniqueOrgs = [...new Set(detections.map(d => d.org))];
  const hasConflict = uniqueOrgs.length > 1;

  const result = {
    detected: true,
    org: best.org,
    source: best.source,
    confidence: best.confidence,
    details: best.details,
    allDetections: detections,
    hasConflict,
    conflictingOrgs: hasConflict ? uniqueOrgs : null,
  };

  // Validate if requested
  if (shouldValidate) {
    if (verbose) console.log(`\nValidating org: ${best.org}...`);
    const validation = await validateOrg(best.org, verbose);
    result.validation = validation;

    if (!validation.valid) {
      result.message = `Detected org '${best.org}' but validation failed`;
      result.suggestions = [
        `Run: sf org login web --alias ${best.org}`,
        'Check if the org alias is correct',
        'Verify network connectivity',
      ];
    }
  }

  return result;
}

// =============================================================================
// CLI Interface
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  const options = {
    cwd: process.cwd(),
    verbose: args.includes('--verbose') || args.includes('-v'),
    validate: args.includes('--validate'),
    json: args.includes('--json'),
  };

  // Parse --cwd option
  const cwdIndex = args.findIndex(a => a === '--cwd');
  if (cwdIndex !== -1 && args[cwdIndex + 1]) {
    options.cwd = args[cwdIndex + 1];
  }

  const result = await detectOrgContext(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.detected) {
      console.log(`\n=== Org Context Detection ===`);
      console.log(`Detected Org: ${result.org}`);
      console.log(`Source: ${result.source}`);
      console.log(`Confidence: ${Math.round(result.confidence * 100)}%`);

      if (result.hasConflict) {
        console.log(`\n[WARNING] Multiple orgs detected: ${result.conflictingOrgs.join(', ')}`);
        console.log(`Using '${result.org}' based on highest confidence.`);
      }

      if (result.validation) {
        if (result.validation.valid) {
          console.log(`\nValidation: PASSED`);
          console.log(`  Username: ${result.validation.username}`);
          console.log(`  Instance: ${result.validation.instanceUrl}`);
        } else {
          console.log(`\nValidation: FAILED`);
          console.log(`  ${result.message}`);
        }
      }
    } else {
      console.log(`\n[ERROR] ${result.message}`);
      console.log(`\nSuggestions:`);
      result.suggestions.forEach(s => console.log(`  - ${s}`));
    }
  }

  // Exit code
  if (!result.detected) {
    process.exit(1);
  } else if (options.validate && result.validation && !result.validation.valid) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  detectOrgContext,
  detectFromPath,
  detectFromSfConfig,
  detectFromEnv,
  detectFromHistory,
  validateOrg,
  getAuthenticatedOrgs,
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
