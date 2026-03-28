#!/usr/bin/env node

/**
 * Runbook Automation Status Tracker
 *
 * Tracks timestamps and counts for automatic runbook processing events.
 * Provides observability into whether the automatic pipeline is functioning.
 *
 * Storage: instances/{org}/runbooks/.automation-status.json
 *
 * @module runbook-automation-status
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_ERRORS = 50;

// ── Path resolution ────────────────────────────────────────────────────────

function _detectPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..');
}

function _getStatusPath(org, pluginRoot) {
  const base = pluginRoot || _detectPluginRoot();
  return path.join(base, 'instances', org, 'runbooks', '.automation-status.json');
}

// ── I/O ────────────────────────────────────────────────────────────────────

function _loadStatus(org, pluginRoot) {
  const filePath = _getStatusPath(org, pluginRoot);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    // Graceful — return defaults
  }
  return {
    lastObservationProcessed: null,
    lastReflectionProcessed: null,
    lastReconciliation: null,
    totalObservationsProcessed: 0,
    totalReflectionsProcessed: 0,
    totalReconciliations: 0,
    errors: []
  };
}

function _saveStatus(org, status, pluginRoot) {
  const filePath = _getStatusPath(org, pluginRoot);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(status, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// ── Recording functions ────────────────────────────────────────────────────

function recordObservationProcessed(org, obsFile, result, pluginRoot) {
  const status = _loadStatus(org, pluginRoot);
  status.lastObservationProcessed = {
    timestamp: new Date().toISOString(),
    obsFile: obsFile || null,
    result: result || null
  };
  status.totalObservationsProcessed = (status.totalObservationsProcessed || 0) + 1;
  _saveStatus(org, status, pluginRoot);
}

function recordReflectionProcessed(org, reflFile, result, pluginRoot) {
  const status = _loadStatus(org, pluginRoot);
  status.lastReflectionProcessed = {
    timestamp: new Date().toISOString(),
    reflFile: reflFile || null,
    result: result || null
  };
  status.totalReflectionsProcessed = (status.totalReflectionsProcessed || 0) + 1;
  _saveStatus(org, status, pluginRoot);
}

function recordReconciliation(org, result, pluginRoot) {
  const status = _loadStatus(org, pluginRoot);
  status.lastReconciliation = {
    timestamp: new Date().toISOString(),
    result: result || null
  };
  status.totalReconciliations = (status.totalReconciliations || 0) + 1;
  _saveStatus(org, status, pluginRoot);
}

function recordError(org, source, error, pluginRoot) {
  const status = _loadStatus(org, pluginRoot);
  if (!Array.isArray(status.errors)) status.errors = [];
  status.errors.push({
    timestamp: new Date().toISOString(),
    source,
    error: typeof error === 'string' ? error : (error && error.message) || String(error)
  });
  // Keep only last MAX_ERRORS
  if (status.errors.length > MAX_ERRORS) {
    status.errors = status.errors.slice(-MAX_ERRORS);
  }
  _saveStatus(org, status, pluginRoot);
}

function getAutomationStatus(org, pluginRoot) {
  return _loadStatus(org, pluginRoot);
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  let org = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--org') org = args[++i];
    if (args[i] === '--help') {
      console.log('Usage: runbook-automation-status.js --org <alias>');
      process.exit(0);
    }
  }
  if (!org) { console.error('❌ --org is required'); process.exit(1); }
  console.log(JSON.stringify(getAutomationStatus(org), null, 2));
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  recordObservationProcessed,
  recordReflectionProcessed,
  recordReconciliation,
  recordError,
  getAutomationStatus
};
