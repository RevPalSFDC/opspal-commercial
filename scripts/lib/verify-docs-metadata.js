#!/usr/bin/env node

'use strict';

/**
 * verify-docs-metadata.js
 *
 * Validates that version numbers in CLAUDE.md files match the actual
 * plugin.json manifests. Prevents documentation drift (e.g., CLAUDE.md
 * claiming v2.5.1 when plugin.json is v2.6.16).
 *
 * Checks:
 *   1. Version strings in each plugin's CLAUDE.md match plugin.json version
 *   2. Root CLAUDE.md "Installed Plugins" section versions match plugin.json
 *
 * Usage:
 *   node scripts/lib/verify-docs-metadata.js [--verbose]
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');

const PLUGIN_NAMES = [
  'opspal-core',
  'opspal-salesforce',
  'opspal-hubspot',
  'opspal-marketo',
  'opspal-gtm-planning',
  'opspal-okrs',
  'opspal-monday',
  'opspal-ai-consult',
  'opspal-mcp-client'
];

const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'docs-metadata-baseline.json');

function parseArgs(argv) {
  return {
    verbose: argv.includes('--verbose'),
    updateBaseline: argv.includes('--update-baseline')
  };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveBaseline(errors) {
  const keys = errors.map(e => `${e.plugin}:${e.type}:${e.found}`);
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(keys, null, 2), 'utf8');
}

function getPluginVersion(pluginName) {
  const manifestPath = path.join(PLUGINS_DIR, pluginName, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.version || null;
  } catch {
    return null;
  }
}

function checkPluginClaudeMd(pluginName, actualVersion, verbose) {
  const claudeMdPath = path.join(PLUGINS_DIR, pluginName, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    if (verbose) console.log(`  [skip] ${pluginName}: no CLAUDE.md`);
    return [];
  }

  const content = fs.readFileSync(claudeMdPath, 'utf8');
  const errors = [];

  // Check version patterns: "Version: X.Y.Z", "**Version**: X.Y.Z", "(vX.Y.Z)"
  const versionPatterns = [
    /\*\*Version\*\*:\s*(\d+\.\d+\.\d+)/g,
    /Version:\s*(\d+\.\d+\.\d+)/g,
    /\(v(\d+\.\d+\.\d+)\)/g
  ];

  const foundVersions = new Set();
  for (const pattern of versionPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      foundVersions.add(match[1]);
    }
  }

  for (const docVersion of foundVersions) {
    if (docVersion !== actualVersion) {
      errors.push({
        plugin: pluginName,
        file: 'CLAUDE.md',
        type: 'version-mismatch',
        message: `CLAUDE.md says v${docVersion} but plugin.json is v${actualVersion}`,
        expected: actualVersion,
        found: docVersion
      });
    }
  }

  return errors;
}

function checkRootClaudeMd(verbose) {
  const rootClaudeMd = path.join(REPO_ROOT, 'CLAUDE.md');
  if (!fs.existsSync(rootClaudeMd)) return [];

  const content = fs.readFileSync(rootClaudeMd, 'utf8');
  const errors = [];

  // Check "Installed Plugins" section for version matches
  // Pattern: **plugin-name** (vX.Y.Z)
  const pluginVersionPattern = /\*\*(\S+)\*\*\s*\(v(\d+\.\d+\.\d+)\)/g;
  let match;
  while ((match = pluginVersionPattern.exec(content)) !== null) {
    const pluginName = match[1];
    const docVersion = match[2];
    const actualVersion = getPluginVersion(pluginName);

    if (actualVersion && docVersion !== actualVersion) {
      errors.push({
        plugin: pluginName,
        file: 'CLAUDE.md (root)',
        type: 'root-version-mismatch',
        message: `Root CLAUDE.md says ${pluginName} v${docVersion} but plugin.json is v${actualVersion}`,
        expected: actualVersion,
        found: docVersion
      });
    }
  }

  return errors;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const allErrors = [];

  console.log('Verifying documentation metadata...\n');

  for (const pluginName of PLUGIN_NAMES) {
    const actualVersion = getPluginVersion(pluginName);
    if (!actualVersion) {
      if (args.verbose) console.log(`  [skip] ${pluginName}: no plugin.json`);
      continue;
    }

    if (args.verbose) console.log(`  [check] ${pluginName} v${actualVersion}`);

    const errors = checkPluginClaudeMd(pluginName, actualVersion, args.verbose);
    allErrors.push(...errors);
  }

  // Check root CLAUDE.md
  const rootErrors = checkRootClaudeMd(args.verbose);
  allErrors.push(...rootErrors);

  // Handle baseline
  if (args.updateBaseline) {
    saveBaseline(allErrors);
    console.log(`Baseline updated: ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    console.log(`Violations recorded: ${allErrors.length}`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const baselineSet = new Set(baseline);
  const newErrors = allErrors.filter(e => !baselineSet.has(`${e.plugin}:${e.type}:${e.found}`));

  // Report
  console.log(`Current violations: ${allErrors.length}`);
  console.log(`Baseline violations: ${baseline.length}`);
  console.log(`New violations: ${newErrors.length}`);

  if (newErrors.length === 0) {
    console.log('\nDocs metadata gate passed.');
    process.exit(0);
  }

  console.log(`\nNew violations (${newErrors.length})`);
  for (const error of newErrors) {
    console.log(`- [${error.type}] ${error.plugin}`);
    console.log(`  ${error.message}`);
  }

  console.log(`\nDocs metadata gate failed due to net-new violations.`);
  console.log(`If intentional, update baseline with:`);
  console.log(`  node scripts/lib/verify-docs-metadata.js --update-baseline`);
  process.exit(1);
}

main();
