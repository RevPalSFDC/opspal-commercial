'use strict';

const fs = require('fs');
const path = require('path');

const { reviewShadowSession } = require('./ambient-reflection-submitter');
const { resolveSessionId, sanitizeString } = require('./utils');

function loadManualReflection(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractIssueKeys(reflection) {
  const issues = Array.isArray(reflection?.issues_identified)
    ? reflection.issues_identified
    : Array.isArray(reflection?.issues)
      ? reflection.issues
      : [];

  return issues
    .map(issue => [issue.taxonomy, issue.title, issue.description].filter(Boolean).join('|').toLowerCase())
    .filter(Boolean);
}

function compareShadowToManual({ shadowEntries, manualReflection }) {
  const ambientKeys = shadowEntries.flatMap(entry => extractIssueKeys(entry.payload || {}));
  const manualKeys = extractIssueKeys(manualReflection);

  const overlap = manualKeys.filter(key => ambientKeys.some(ambientKey => ambientKey.includes(key) || key.includes(ambientKey)));
  const overlapRate = manualKeys.length === 0 ? 0 : Number(((overlap.length / manualKeys.length) * 100).toFixed(1));

  return {
    ambient_issue_count: ambientKeys.length,
    manual_issue_count: manualKeys.length,
    overlap_count: overlap.length,
    overlap_rate_percent: overlapRate,
    recommendation: overlapRate >= 60
      ? 'Ambient overlap meets the rollout target.'
      : 'Ambient overlap is below the rollout target; review missed issue clusters.'
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key.startsWith('--')) {
      args[key.slice(2)] = value;
      index += 1;
    }
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  const sessionId = resolveSessionId(args.session);
  const manualFile = args.manual;

  if (!manualFile || !fs.existsSync(manualFile)) {
    console.error('Usage: node shadow-validator.js --session <id> --manual <manual-reflection.json>');
    process.exit(1);
  }

  const shadowEntries = reviewShadowSession(sessionId);
  const manualReflection = loadManualReflection(path.resolve(manualFile));
  const result = compareShadowToManual({
    shadowEntries,
    manualReflection
  });

  process.stdout.write(`${JSON.stringify({
    session_id: sessionId,
    manual_file: sanitizeString(path.resolve(manualFile), 180),
    ...result
  }, null, 2)}\n`);
}

module.exports = {
  compareShadowToManual,
  extractIssueKeys
};
