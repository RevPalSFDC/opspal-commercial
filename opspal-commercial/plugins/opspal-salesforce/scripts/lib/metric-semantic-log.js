#!/usr/bin/env node

/**
 * Metric Semantics Log
 *
 * Stores metric mapping decisions and validation warnings for runbook synthesis.
 *
 * Storage:
 *   instances/salesforce/{org}/reports/metric-semantics-log.json
 */

const fs = require('fs');
const path = require('path');
const { getReportsDir } = require('./path-conventions');

const DEFAULT_SCHEMA_VERSION = '1.0';
const DEFAULT_LOG_FILENAME = 'metric-semantics-log.json';

function resolveWorkspaceRoot() {
  return process.env.WORKSPACE_DIR || process.cwd();
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getLogPath(org, options = {}) {
  const workspaceRoot = options.workspaceRoot || resolveWorkspaceRoot();
  const reportsDir = getReportsDir('salesforce', org, workspaceRoot);
  ensureDir(reportsDir);
  return options.logPath || path.join(reportsDir, DEFAULT_LOG_FILENAME);
}

function loadLog(org, options = {}) {
  const logPath = getLogPath(org, options);
  if (!fs.existsSync(logPath)) {
    return {
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      org,
      lastUpdated: new Date().toISOString(),
      entries: []
    };
  }
  const content = fs.readFileSync(logPath, 'utf8');
  const parsed = JSON.parse(content);
  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    parsed.entries = [];
  }
  if (!parsed.schemaVersion) {
    parsed.schemaVersion = DEFAULT_SCHEMA_VERSION;
  }
  if (!parsed.org) {
    parsed.org = org;
  }
  return parsed;
}

function appendLogEntry(org, entry, options = {}) {
  const log = loadLog(org, options);
  const timestamp = new Date().toISOString();

  const safeEntry = {
    timestamp,
    type: entry.type || 'info',
    metricId: entry.metricId || null,
    reportName: entry.reportName || null,
    reportId: entry.reportId || null,
    baseObject: entry.baseObject || null,
    fields: entry.fields || {},
    candidates: entry.candidates || null,
    confidence: typeof entry.confidence === 'number' ? entry.confidence : null,
    warnings: entry.warnings || [],
    source: entry.source || 'unknown',
    notes: entry.notes || null,
    context: entry.context || null
  };

  log.entries.push(safeEntry);
  log.lastUpdated = timestamp;

  const maxEntries = options.maxEntries || 500;
  if (log.entries.length > maxEntries) {
    log.entries = log.entries.slice(-maxEntries);
  }

  const logPath = getLogPath(org, options);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
  return logPath;
}

function summarizeLog(log, options = {}) {
  const summary = {
    totalEntries: log.entries.length,
    lastUpdated: log.lastUpdated || null,
    mappingDecisions: 0,
    semanticWarnings: 0,
    failureModeWarnings: 0,
    recent: []
  };

  log.entries.forEach(entry => {
    if (entry.type === 'mapping-decision') summary.mappingDecisions += 1;
    if (entry.type === 'semantic-warning') summary.semanticWarnings += 1;
    if (entry.type === 'failure-mode-warning') summary.failureModeWarnings += 1;
  });

  const recentCount = options.recentCount || 10;
  summary.recent = log.entries.slice(-recentCount).map(entry => ({
    timestamp: entry.timestamp,
    type: entry.type,
    metricId: entry.metricId,
    reportName: entry.reportName,
    warnings: (entry.warnings || []).map(w => w.message || w)
  }));

  return summary;
}

module.exports = {
  getLogPath,
  loadLog,
  appendLogEntry,
  summarizeLog
};

