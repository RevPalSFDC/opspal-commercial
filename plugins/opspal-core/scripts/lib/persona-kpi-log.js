#!/usr/bin/env node

/**
 * Persona KPI Log
 *
 * Stores persona-to-KPI contract validations for dashboards.
 *
 * Storage:
 *   instances/salesforce/{org}/reports/persona-kpi-log.json
 */

const fs = require('fs');
const path = require('path');
const { getReportsDir } = require('./path-conventions');

const DEFAULT_SCHEMA_VERSION = '1.0';
const DEFAULT_LOG_FILENAME = 'persona-kpi-log.json';

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
    type: entry.type || 'persona-kpi',
    dashboardName: entry.dashboardName || null,
    dashboardId: entry.dashboardId || null,
    persona: entry.persona || null,
    status: entry.status || 'warn',
    metrics: entry.metrics || null,
    issues: entry.issues || [],
    needsConfirmation: entry.needsConfirmation || [],
    source: entry.source || 'persona-kpi-validator'
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
    passCount: 0,
    warnCount: 0,
    personaCounts: {},
    issueCounts: {},
    recent: []
  };

  log.entries.forEach(entry => {
    if (entry.status === 'pass') summary.passCount += 1;
    if (entry.status === 'warn') summary.warnCount += 1;

    const persona = entry.persona || 'unspecified';
    summary.personaCounts[persona] = (summary.personaCounts[persona] || 0) + 1;

    (entry.issues || []).forEach(issue => {
      const code = issue.code || issue.type || issue.message || 'unknown';
      summary.issueCounts[code] = (summary.issueCounts[code] || 0) + 1;
    });
  });

  const recentCount = options.recentCount || 10;
  summary.recent = log.entries.slice(-recentCount).map(entry => ({
    timestamp: entry.timestamp,
    dashboardName: entry.dashboardName,
    persona: entry.persona,
    status: entry.status,
    issues: (entry.issues || []).map(issue => issue.message || issue)
  }));

  return summary;
}

module.exports = {
  getLogPath,
  loadLog,
  appendLogEntry,
  summarizeLog
};
