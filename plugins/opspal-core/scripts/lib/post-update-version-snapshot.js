#!/usr/bin/env node

'use strict';

/**
 * post-update-version-snapshot.js - Version change detection for auto post-update
 *
 * Detects plugin version changes between sessions by comparing current plugin.json
 * versions against a persisted snapshot. Used by session-start-post-update.sh to
 * trigger lightweight deferred post-update tasks.
 *
 * Modes:
 *   detect   - Compare current versions against snapshot; write deferred tasks if changed
 *   snapshot - Record current versions as baseline (called after all tasks complete)
 *   clear    - Delete deferred tasks and re-snapshot (called by /finishopspalupdate)
 *
 * Usage:
 *   node post-update-version-snapshot.js --mode detect [--verbose]
 *   node post-update-version-snapshot.js --mode snapshot
 *   node post-update-version-snapshot.js --mode clear
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Hard timeout — never block session start
const TIMEOUT_MS = 3000;
const timeoutHandle = setTimeout(() => {
  if (mode === 'detect') {
    process.stdout.write(JSON.stringify({ changed: false, timeout: true }) + '\n');
  }
  process.exit(0);
}, TIMEOUT_MS);

// Parse args
const args = process.argv.slice(2);
let mode = 'detect';
let verbose = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode' && args[i + 1]) { mode = args[++i]; }
  else if (args[i] === '--verbose') { verbose = true; }
}

// Paths
const homeDir = os.homedir();
const sessionContextDir = path.join(homeDir, '.claude', 'session-context');
const snapshotFile = path.join(sessionContextDir, 'last-known-versions.json');
const deferredTasksFile = path.join(sessionContextDir, 'post-update-deferred-tasks.json');
const updateSessionFile = path.join(sessionContextDir, 'opspal-update-session.json');

// Auto-safe tasks that can run at session start
const AUTO_SAFE_TASKS = ['step7', 'step2', 'step4', 'step8', 'step9', 'step10', 'step11'];

function log(msg) {
  if (verbose) process.stderr.write(`[version-snapshot] ${msg}\n`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Discover all marketplace roots to find plugin.json files.
 * Checks multiple possible locations (WSL-aware).
 */
function discoverMarketplaceRoots() {
  const roots = [];
  const claudeRoots = [path.join(homeDir, '.claude')];

  if (process.env.CLAUDE_HOME) claudeRoots.push(process.env.CLAUDE_HOME);
  if (process.env.CLAUDE_CONFIG_DIR) claudeRoots.push(process.env.CLAUDE_CONFIG_DIR);

  for (const root of claudeRoots) {
    const mpDir = path.join(root, 'plugins', 'marketplaces');
    if (fs.existsSync(mpDir)) {
      try {
        for (const mp of fs.readdirSync(mpDir)) {
          const pluginsDir = path.join(mpDir, mp, 'plugins');
          if (fs.existsSync(pluginsDir)) {
            roots.push({ marketplace: mp, pluginsDir });
          }
        }
      } catch { /* skip unreadable dirs */ }
    }
  }
  return roots;
}

/**
 * Read current plugin versions from marketplace checkouts.
 */
function getCurrentVersions() {
  const versions = {};
  const mpRoots = discoverMarketplaceRoots();

  for (const { marketplace, pluginsDir } of mpRoots) {
    try {
      for (const pluginName of fs.readdirSync(pluginsDir)) {
        const manifestPath = path.join(pluginsDir, pluginName, '.claude-plugin', 'plugin.json');
        const data = readJson(manifestPath);
        if (data && data.version) {
          const key = `${pluginName}@${marketplace}`;
          versions[key] = data.version;
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  // Fallback: check installed_plugins.json if no marketplace versions found
  if (Object.keys(versions).length === 0) {
    const installedFile = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
    const installed = readJson(installedFile);
    if (installed && typeof installed === 'object') {
      for (const [key, info] of Object.entries(installed)) {
        if (info && info.version) {
          versions[key] = info.version;
        }
      }
    }
  }

  return versions;
}

/**
 * Check if finishPending is true in the update session file.
 */
function isFinishPending() {
  const data = readJson(updateSessionFile);
  return data && data.finishPending === true;
}

// =========================================================================
// Mode: detect
// =========================================================================
function runDetect() {
  // If deferred tasks already exist from a prior run, just report them
  const existingDeferred = readJson(deferredTasksFile);
  if (existingDeferred && Array.isArray(existingDeferred.pendingTasks) && existingDeferred.pendingTasks.length > 0) {
    log(`Existing deferred tasks found: ${existingDeferred.pendingTasks.join(', ')}`);
    process.stdout.write(JSON.stringify({
      changed: true,
      count: existingDeferred.changedPlugins ? existingDeferred.changedPlugins.length : 0,
      plugins: existingDeferred.changedPlugins || [],
      resumed: true
    }) + '\n');
    return;
  }

  const current = getCurrentVersions();
  const snapshot = readJson(snapshotFile);

  // First run — no snapshot exists. Create baseline, don't alert.
  if (!snapshot || !snapshot.versions) {
    log('No snapshot found — creating initial baseline');
    writeJson(snapshotFile, {
      snapshotAt: new Date().toISOString(),
      versions: current
    });
    process.stdout.write(JSON.stringify({ changed: false, firstRun: true }) + '\n');
    return;
  }

  // Compare versions
  const changedPlugins = [];
  const previousVersions = {};
  const currentVersions = {};

  for (const [key, version] of Object.entries(current)) {
    const prev = snapshot.versions[key];
    if (prev && prev !== version) {
      changedPlugins.push(key.split('@')[0]);
      previousVersions[key] = prev;
      currentVersions[key] = version;
      log(`Changed: ${key} ${prev} → ${version}`);
    } else if (!prev) {
      // New plugin installed
      changedPlugins.push(key.split('@')[0]);
      currentVersions[key] = version;
      log(`New: ${key} ${version}`);
    }
  }

  // Also check finishPending flag
  const finishPending = isFinishPending();
  if (finishPending && changedPlugins.length === 0) {
    log('finishPending flag set but no version changes — treating as update pending');
    changedPlugins.push('(finish-pending)');
  }

  if (changedPlugins.length === 0) {
    log('No version changes detected');
    process.stdout.write(JSON.stringify({ changed: false }) + '\n');
    return;
  }

  // Write deferred tasks
  const deferred = {
    detectedAt: new Date().toISOString(),
    detectedBy: 'session-start',
    changedPlugins: changedPlugins.filter(p => p !== '(finish-pending)'),
    previousVersions,
    currentVersions,
    pendingTasks: [...AUTO_SAFE_TASKS],
    completedTasks: []
  };

  writeJson(deferredTasksFile, deferred);
  log(`Deferred tasks written: ${AUTO_SAFE_TASKS.join(', ')}`);

  process.stdout.write(JSON.stringify({
    changed: true,
    count: changedPlugins.length,
    plugins: changedPlugins.filter(p => p !== '(finish-pending)')
  }) + '\n');
}

// =========================================================================
// Mode: snapshot
// =========================================================================
function runSnapshot() {
  const current = getCurrentVersions();
  writeJson(snapshotFile, {
    snapshotAt: new Date().toISOString(),
    versions: current
  });
  log(`Snapshot written with ${Object.keys(current).length} plugin versions`);
  process.stdout.write(JSON.stringify({ snapshotted: true, count: Object.keys(current).length }) + '\n');
}

// =========================================================================
// Mode: clear
// =========================================================================
function runClear() {
  try { fs.unlinkSync(deferredTasksFile); } catch { /* doesn't exist */ }
  log('Deferred tasks cleared');
  runSnapshot();
}

// =========================================================================
// Main
// =========================================================================
try {
  switch (mode) {
    case 'detect': runDetect(); break;
    case 'snapshot': runSnapshot(); break;
    case 'clear': runClear(); break;
    default:
      process.stderr.write(`Unknown mode: ${mode}\nUsage: --mode detect|snapshot|clear\n`);
      process.exit(1);
  }
} catch (err) {
  log(`Error: ${err.message}`);
  if (mode === 'detect') {
    process.stdout.write(JSON.stringify({ changed: false, error: err.message }) + '\n');
  }
}

clearTimeout(timeoutHandle);
