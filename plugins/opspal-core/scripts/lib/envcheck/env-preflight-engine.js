#!/usr/bin/env node

/**
 * Environment Preflight Engine
 *
 * Coordinator for all environment health checks. Runs checkers in parallel,
 * formats output, logs to JSONL, and supports auto-remediation.
 *
 * Usage:
 *   node env-preflight-engine.js [--fix] [--platform <sf|hs|mk|asana|gh>] [--quick] [--json]
 *
 * Reuses:
 *   - unified-auth-manager.js (getSalesforceAuth, validateHubSpotToken, refreshMarketoToken)
 *   - check-all-plugin-dependencies.js (npm dep scanning)
 *   - plugin-version-checker.js (version comparison)
 *
 * @module env-preflight-engine
 * @version 1.0.0
 * @since 2026-02-08
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// ANSI Colors
// =============================================================================

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

const STATUS_ICONS = {
  pass: `${C.green}✓${C.reset}`,
  warn: `${C.yellow}⚠${C.reset}`,
  fail: `${C.red}✗${C.reset}`,
  skip: `${C.gray}○${C.reset}`,
  fix: `${C.blue}🔧${C.reset}`,
};

// =============================================================================
// Configuration
// =============================================================================

const CHECKERS_DIR = path.join(__dirname, 'checkers');
const LOG_DIR = path.join(process.env.HOME || '/tmp', '.claude', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'envcheck.jsonl');

// Checker loading order (determines display order)
const CHECKER_MODULES = [
  { file: 'system-checker.js', platforms: ['all'], quick: true },
  { file: 'salesforce-auth-checker.js', platforms: ['sf', 'salesforce'], quick: true },
  { file: 'hubspot-auth-checker.js', platforms: ['hs', 'hubspot'], quick: true },
  { file: 'marketo-auth-checker.js', platforms: ['mk', 'marketo'], quick: true },
  { file: 'asana-auth-checker.js', platforms: ['asana'], quick: true },
  { file: 'github-auth-checker.js', platforms: ['gh', 'github'], quick: true },
  { file: 'npm-deps-checker.js', platforms: ['all'], quick: true },
  { file: 'plugin-versions-checker.js', platforms: ['all'], quick: true },
  { file: 'mcp-server-checker.js', platforms: ['all'], quick: false },
  { file: 'script-path-checker.js', platforms: ['all'], quick: false },
];

// =============================================================================
// Checker Loader
// =============================================================================

function loadCheckers(options = {}) {
  const { platform, quick } = options;
  const checkers = [];

  for (const spec of CHECKER_MODULES) {
    // Skip slow checkers in quick mode
    if (quick && !spec.quick) continue;

    // Skip platform-specific checkers when filtering
    if (platform && !spec.platforms.includes('all') && !spec.platforms.includes(platform)) {
      continue;
    }

    const checkerPath = path.join(CHECKERS_DIR, spec.file);
    if (fs.existsSync(checkerPath)) {
      try {
        const checker = require(checkerPath);
        checkers.push({ ...checker, _file: spec.file, _spec: spec });
      } catch (err) {
        checkers.push({
          name: spec.file.replace('.js', ''),
          _file: spec.file,
          _spec: spec,
          run: async () => ({
            status: 'fail',
            message: `Failed to load checker: ${err.message}`,
            remediation: `Check ${checkerPath} for syntax errors`,
            autoFixable: false,
            durationMs: 0,
          }),
        });
      }
    }
  }

  return checkers;
}

// =============================================================================
// Runner
// =============================================================================

async function runCheckers(checkers, options = {}) {
  const results = [];
  const startTime = Date.now();

  // Run all checkers in parallel
  const promises = checkers.map(async (checker) => {
    const checkerStart = Date.now();
    try {
      const result = await Promise.race([
        checker.run(options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Checker timeout (10s)')), 10000)
        ),
      ]);
      result.durationMs = result.durationMs || (Date.now() - checkerStart);
      return { name: checker.name, ...result };
    } catch (err) {
      return {
        name: checker.name,
        status: 'fail',
        message: err.message,
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - checkerStart,
      };
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        name: 'unknown',
        status: 'fail',
        message: result.reason?.message || 'Unknown error',
        remediation: null,
        autoFixable: false,
        durationMs: 0,
      });
    }
  }

  return { results, totalDurationMs: Date.now() - startTime };
}

// =============================================================================
// Auto-Remediation
// =============================================================================

async function runRemediation(results, options = {}) {
  const fixed = [];
  const skipped = [];

  for (const result of results) {
    if (result.status !== 'fail' && result.status !== 'warn') continue;
    if (!result.autoFixable || !result.remediation) {
      if (result.remediation) skipped.push(result);
      continue;
    }

    // Safe tier: auto-fix without confirmation
    if (result.fixTier === 'safe' || !result.fixTier) {
      try {
        const { execSync } = require('child_process');
        execSync(result.remediation, { stdio: 'pipe', timeout: 60000 });
        result.status = 'fix';
        result.message += ' (auto-fixed)';
        fixed.push(result);
      } catch (err) {
        result.message += ` (fix failed: ${err.message})`;
        skipped.push(result);
      }
    } else {
      skipped.push(result);
    }
  }

  return { fixed, skipped };
}

// =============================================================================
// Output Formatters
// =============================================================================

function formatTable(results, totalDurationMs) {
  const lines = [];
  lines.push('');
  lines.push(`${C.bold}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  lines.push(`${C.bold}║  Environment Preflight Check                             ║${C.reset}`);
  lines.push(`${C.bold}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  lines.push('');

  const counts = { pass: 0, warn: 0, fail: 0, skip: 0, fix: 0 };

  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    const icon = STATUS_ICONS[r.status] || STATUS_ICONS.skip;
    const duration = `${C.dim}(${r.durationMs}ms)${C.reset}`;
    lines.push(`  ${icon} ${C.bold}${r.name}${C.reset} ${duration}`);
    lines.push(`    ${r.message}`);
    if (r.status === 'fail' && r.remediation) {
      lines.push(`    ${C.yellow}Fix: ${r.remediation}${C.reset}`);
    }
  }

  lines.push('');
  lines.push(`${C.dim}${'─'.repeat(58)}${C.reset}`);

  const summary = [];
  if (counts.pass) summary.push(`${C.green}${counts.pass} passed${C.reset}`);
  if (counts.fix) summary.push(`${C.blue}${counts.fix} fixed${C.reset}`);
  if (counts.warn) summary.push(`${C.yellow}${counts.warn} warnings${C.reset}`);
  if (counts.fail) summary.push(`${C.red}${counts.fail} failed${C.reset}`);
  if (counts.skip) summary.push(`${C.gray}${counts.skip} skipped${C.reset}`);

  lines.push(`  ${summary.join(' | ')}  ${C.dim}(${totalDurationMs}ms total)${C.reset}`);
  lines.push('');

  return lines.join('\n');
}

function formatJson(results, totalDurationMs) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    totalDurationMs,
    summary: {
      pass: results.filter(r => r.status === 'pass').length,
      warn: results.filter(r => r.status === 'warn').length,
      fail: results.filter(r => r.status === 'fail').length,
      skip: results.filter(r => r.status === 'skip').length,
      fix: results.filter(r => r.status === 'fix').length,
    },
    results,
  }, null, 2);
}

// =============================================================================
// Logging
// =============================================================================

function logResults(results, totalDurationMs) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      totalDurationMs,
      counts: {
        pass: results.filter(r => r.status === 'pass').length,
        warn: results.filter(r => r.status === 'warn').length,
        fail: results.filter(r => r.status === 'fail').length,
      },
      failures: results.filter(r => r.status === 'fail').map(r => r.name),
    });
    fs.appendFileSync(LOG_FILE, entry + '\n');
  } catch {
    // Logging is best-effort
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = {
    fix: args.includes('--fix'),
    quick: args.includes('--quick'),
    json: args.includes('--json'),
    platform: null,
  };

  const platformIdx = args.indexOf('--platform');
  if (platformIdx !== -1 && args[platformIdx + 1]) {
    options.platform = args[platformIdx + 1];
  }

  // Load and run checkers
  const checkers = loadCheckers(options);
  const { results, totalDurationMs } = await runCheckers(checkers, options);

  // Auto-remediate if --fix
  if (options.fix) {
    await runRemediation(results, options);
  }

  // Log results
  logResults(results, totalDurationMs);

  // Output
  if (options.json) {
    console.log(formatJson(results, totalDurationMs));
  } else {
    console.log(formatTable(results, totalDurationMs));
  }

  // Exit code: 1 if any failures (after fixes)
  const failures = results.filter(r => r.status === 'fail').length;
  process.exit(failures > 0 ? 1 : 0);
}

// Export for programmatic use
module.exports = {
  loadCheckers,
  runCheckers,
  runRemediation,
  formatTable,
  formatJson,
};

// CLI execution
if (require.main === module) {
  main().catch(err => {
    console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
    process.exit(2);
  });
}
