#!/usr/bin/env node

/**
 * Check Field History Limit
 *
 * Pre-deployment gate that checks field history tracking limits before
 * deploying fields with trackHistory=true.
 *
 * Salesforce hard limit: 20 tracked fields per object.
 *
 * Exit codes:
 *   0 = safe (headroom >= 3 after additions)
 *   1 = would exceed limit
 *   2 = warning (headroom < 3 after additions)
 *   3 = error (query failed, sf CLI not available, etc.)
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FIELD_HISTORY_LIMIT = 20;
const HEADROOM_WARNING_THRESHOLD = 3;

function sfToolingQuery(soql, org) {
  const cmd = `sf data query --query "${soql.replace(/"/g, '\\"')}" --target-org ${org} --json --use-tooling-api`;
  const raw = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  return JSON.parse(raw);
}

function scanSourceForTrackedFields(sourceDir, objectName) {
  const absSource = path.resolve(sourceDir);
  if (!fs.existsSync(absSource)) {
    throw new Error(`Source directory not found: ${absSource}`);
  }

  const results = [];

  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch (_) { continue; }
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.field-meta.xml')) {
        const parts = full.split(path.sep);
        const objectsIdx = parts.lastIndexOf('objects');
        if (objectsIdx !== -1 && parts[objectsIdx + 1] === objectName) {
          results.push(full);
        }
      }
    }
  };

  walk(absSource);

  const tracked = [];
  for (const filePath of results) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (/<trackHistory\s*>\s*true\s*<\/trackHistory\s*>/i.test(content)) {
      tracked.push(path.basename(filePath, '.field-meta.xml'));
    }
  }

  return { count: tracked.length, fields: tracked };
}

function queryTrackedFields(objectName, org) {
  const soql = `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsFieldHistoryTracked = true`;
  const result = sfToolingQuery(soql, org);

  if (!result || !result.result) {
    throw new Error('Unexpected response from sf data query');
  }

  const records = result.result.records || [];
  const fields = records.map((r) => r.QualifiedApiName);
  return { count: fields.length, fields };
}

function checkFieldHistoryLimit(objectName, orgAlias, options) {
  options = options || {};
  if (!objectName) throw new Error('objectName is required');
  if (!orgAlias) throw new Error('orgAlias is required');

  const { count: currentCount, fields: trackedFields } = queryTrackedFields(objectName, orgAlias);

  let adding = 0;
  let newFields = [];

  if (typeof options.adding === 'number') {
    adding = options.adding;
  } else if (options.sourceDir) {
    const scan = scanSourceForTrackedFields(options.sourceDir, objectName);
    adding = scan.count;
    newFields = scan.fields;
  }

  const totalAfter = currentCount + adding;
  const wouldExceed = totalAfter > FIELD_HISTORY_LIMIT;
  const headroom = FIELD_HISTORY_LIMIT - totalAfter;

  return {
    currentCount,
    limit: FIELD_HISTORY_LIMIT,
    adding,
    wouldExceed,
    headroom,
    trackedFields,
    newFields
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let objectName = null;
  let orgAlias = null;
  let addingArg = null;
  let sourceDir = null;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--object':  objectName = args[++i]; break;
      case '--org':     orgAlias = args[++i]; break;
      case '--adding':  addingArg = parseInt(args[++i], 10); break;
      case '--source':  sourceDir = args[++i]; break;
      case '--json':    jsonOutput = true; break;
    }
  }

  if (!objectName || !orgAlias) {
    console.error([
      'Usage: node check-field-history-limit.js --object <ObjectName> --org <orgAlias> [options]',
      '',
      'Options:',
      '  --object <name>   Salesforce object API name (required)',
      '  --org <alias>     Salesforce org alias (required)',
      '  --adding <n>      Number of new tracked fields being added',
      '  --source <dir>    Source directory to auto-detect new tracked fields',
      '  --json            Output results as JSON',
      '',
      'Examples:',
      '  node check-field-history-limit.js --object Account --org myorg',
      '  node check-field-history-limit.js --object Account --org myorg --adding 3',
      '  node check-field-history-limit.js --source ./force-app --org myorg --object Account',
    ].join('\n'));
    process.exit(3);
  }

  const opts = {};
  if (addingArg !== null && !isNaN(addingArg)) opts.adding = addingArg;
  if (sourceDir) opts.sourceDir = sourceDir;

  let result;
  try {
    result = checkFieldHistoryLimit(objectName, orgAlias, opts);
  } catch (err) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error('ERROR: ' + err.message);
    }
    process.exit(3);
  }

  const { currentCount, limit, adding, wouldExceed, headroom, trackedFields, newFields } = result;

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\nField History Tracking: ' + objectName);
    console.log('='.repeat(50));
    console.log('  Current tracked fields : ' + currentCount + ' / ' + limit);
    if (adding > 0) {
      console.log('  New tracked fields     : +' + adding);
      console.log('  Total after deployment : ' + (currentCount + adding));
    }
    console.log('  Headroom remaining     : ' + headroom);
    if (trackedFields.length > 0) {
      console.log('\n  Currently tracked (' + trackedFields.length + '):');
      trackedFields.forEach((f) => console.log('    - ' + f));
    }
    if (newFields.length > 0) {
      console.log('\n  New tracked fields detected (' + newFields.length + '):');
      newFields.forEach((f) => console.log('    + ' + f));
    }
    console.log('');
    if (wouldExceed) {
      console.log('FAIL: Deployment would exceed the ' + limit + '-field history tracking limit.');
      console.log('      Remove trackHistory=true from ' + Math.abs(headroom) + ' field(s) before deploying.');
    } else if (headroom < HEADROOM_WARNING_THRESHOLD) {
      console.log('WARNING: Only ' + headroom + ' tracked field slot(s) remaining after deployment.');
      console.log('         Consider reviewing which fields truly need history tracking.');
    } else {
      console.log('PASS: Field history tracking limit check passed (' + headroom + ' slot(s) remaining).');
    }
  }

  if (wouldExceed) process.exit(1);
  else if (headroom < HEADROOM_WARNING_THRESHOLD) process.exit(2);
  else process.exit(0);
}

module.exports = { checkFieldHistoryLimit };
