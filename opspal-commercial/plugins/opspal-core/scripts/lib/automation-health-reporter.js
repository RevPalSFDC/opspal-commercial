#!/usr/bin/env node
'use strict';

/**
 * Automation Health Reporter
 *
 * Aggregates AutomationEventV1 logs and produces a concise health summary.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_EVENT_DIRS = [
  path.join(process.cwd(), 'logs', 'automation-events'),
  path.join(process.cwd(), 'plugins', 'opspal-core', 'logs', 'automation-events'),
  path.join(process.cwd(), 'plugins', 'opspal-marketo', 'logs', 'automation-events'),
  path.join(process.cwd(), 'plugins', 'opspal-hubspot', 'logs', 'automation-events'),
  path.join(process.cwd(), 'plugins', 'opspal-salesforce', 'logs', 'automation-events')
];

function parseWindowMs(windowLabel = '1h') {
  const value = String(windowLabel || '1h').trim().toLowerCase();
  const match = value.match(/^(\d+)(m|h|d)$/);
  if (!match) return 60 * 60 * 1000;

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function safeParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function listFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath)
    .filter(file => file.startsWith('automation-events-') && file.endsWith('.jsonl'))
    .map(file => path.join(dirPath, file));
}

function loadEvents({ windowMs, platform }) {
  const now = Date.now();
  const platformFilter = platform && platform !== 'all' ? String(platform).toLowerCase() : null;

  const allFiles = DEFAULT_EVENT_DIRS.flatMap(listFiles);
  const seen = new Set();
  const files = allFiles.filter(file => {
    if (seen.has(file)) return false;
    seen.add(file);
    return true;
  });

  const events = [];

  for (const filePath of files) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const event = safeParse(line);
      if (!event || !event.timestamp) continue;

      const ts = Date.parse(event.timestamp);
      if (Number.isNaN(ts)) continue;
      if (now - ts > windowMs) continue;

      if (platformFilter && String(event.platform || '').toLowerCase() !== platformFilter) {
        continue;
      }

      events.push(event);
    }
  }

  return events;
}

function summarize(events = []) {
  const grouped = {};

  for (const event of events) {
    const platform = event.platform || 'unknown';
    if (!grouped[platform]) {
      grouped[platform] = {
        total: 0,
        success: 0,
        failure: 0,
        blocked: 0,
        retrying: 0,
        manualRequired: 0,
        warningOrHigher: 0,
        categories: {}
      };
    }

    const row = grouped[platform];
    row.total += 1;

    if (event.status === 'success') row.success += 1;
    if (event.status === 'failure') row.failure += 1;
    if (event.status === 'blocked') row.blocked += 1;
    if (event.status === 'retrying') row.retrying += 1;
    if (event.status === 'manual_required') row.manualRequired += 1;
    if (event.severity === 'warning' || event.severity === 'error' || event.severity === 'critical') {
      row.warningOrHigher += 1;
    }

    const category = event.category || 'unknown';
    row.categories[category] = (row.categories[category] || 0) + 1;
  }

  return Object.entries(grouped).map(([platform, stats]) => {
    const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100) : 0;

    return {
      platform,
      ...stats,
      successRate: Number(successRate.toFixed(2)),
      health: stats.blocked > 0 || stats.failure > 0
        ? 'degraded'
        : (stats.warningOrHigher > 0 ? 'warning' : 'healthy')
    };
  }).sort((a, b) => a.platform.localeCompare(b.platform));
}

function toMarkdown(summaryRows, windowLabel) {
  const lines = [];
  lines.push(`# Automation Health (${windowLabel})`);
  lines.push('');

  if (summaryRows.length === 0) {
    lines.push('No automation events found in selected window.');
    return lines.join('\n');
  }

  lines.push('| Platform | Health | Success Rate | Total | Failure | Blocked | Retrying | Manual Required |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|');

  for (const row of summaryRows) {
    lines.push(
      `| ${row.platform} | ${row.health} | ${row.successRate}% | ${row.total} | ${row.failure} | ${row.blocked} | ${row.retrying} | ${row.manualRequired} |`
    );
  }

  return lines.join('\n');
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    platform: 'all',
    window: '1h',
    format: 'markdown'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--platform') {
      args.platform = argv[i + 1] || args.platform;
      i += 1;
    } else if (token === '--window') {
      args.window = argv[i + 1] || args.window;
      i += 1;
    } else if (token === '--format') {
      args.format = argv[i + 1] || args.format;
      i += 1;
    }
  }

  return args;
}

function getAutomationHealth(options = {}) {
  const window = options.window || '1h';
  const windowMs = parseWindowMs(window);
  const events = loadEvents({
    windowMs,
    platform: options.platform || 'all'
  });

  const summary = summarize(events);

  return {
    window,
    platform: options.platform || 'all',
    eventCount: events.length,
    summary
  };
}

if (require.main === module) {
  const args = parseArgs();
  const report = getAutomationHealth(args);

  if (args.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(toMarkdown(report.summary, report.window));
  }
}

module.exports = {
  DEFAULT_EVENT_DIRS,
  getAutomationHealth,
  parseWindowMs,
  summarize,
  toMarkdown
};
