#!/usr/bin/env node

/**
 * Report Diagnostics Log
 *
 * Stores report intent and health diagnostics for runbook synthesis.
 *
 * Storage:
 *   instances/salesforce/{org}/reports/report-diagnostics-log.json
 */

const fs = require('fs');
const path = require('path');
const { getReportsDir } = require('./path-conventions');

const DEFAULT_SCHEMA_VERSION = '1.0';
const DEFAULT_LOG_FILENAME = 'report-diagnostics-log.json';

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
    type: entry.type || 'report-diagnostics',
    reportName: entry.reportName || null,
    reportId: entry.reportId || null,
    reportType: entry.reportType || null,
    reportFormat: entry.reportFormat || null,
    intent: entry.intent || null,
    health: entry.health || null,
    issues: entry.issues || [],
    source: entry.source || 'report-intelligence-diagnostics'
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
    failCount: 0,
    intentCounts: {},
    recent: []
  };

  log.entries.forEach(entry => {
    const status = entry.health?.overallStatus || 'unknown';
    if (status === 'pass') summary.passCount += 1;
    if (status === 'warn') summary.warnCount += 1;
    if (status === 'fail') summary.failCount += 1;

    const intentLabel = entry.intent?.primary?.label;
    if (intentLabel) {
      summary.intentCounts[intentLabel] = (summary.intentCounts[intentLabel] || 0) + 1;
    }
  });

  const recentCount = options.recentCount || 10;
  summary.recent = log.entries.slice(-recentCount).map(entry => ({
    timestamp: entry.timestamp,
    reportName: entry.reportName,
    overallStatus: entry.health?.overallStatus || 'unknown',
    primaryIntent: entry.intent?.primary?.label || 'Unclear',
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
