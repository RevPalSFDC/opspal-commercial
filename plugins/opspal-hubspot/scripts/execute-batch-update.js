#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const BatchUpdateWrapper = require('./lib/batch-update-wrapper');
const BatchUpsertHelper = require('./lib/batch-upsert-helper');

function parseArgs(argv) {
  const options = {
    objectType: null,
    input: null,
    batchSize: 100,
    maxConcurrent: 10,
    verbose: false,
    dryRun: false,
    output: null,
    operation: 'update',
    uniqueProperty: null
  };

  const args = [...argv];
  const takeValue = (inline) => (inline !== undefined
    ? inline
    : (args[0] && !args[0].startsWith('--') ? args.shift() : undefined));
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith('--')) {
      if (!options.input) {
        options.input = token;
      }
      continue;
    }

    const [flag, inlineValue] = token.split('=');
    const key = flag.replace(/^--/, '');
    const value = takeValue(inlineValue);

    switch (key) {
      case 'object':
        options.objectType = value || options.objectType;
        break;
      case 'input':
        options.input = value || options.input;
        break;
      case 'batch-size':
        options.batchSize = value ? Number(value) : options.batchSize;
        break;
      case 'max-concurrent':
        options.maxConcurrent = value ? Number(value) : options.maxConcurrent;
        break;
      case 'verbose':
        options.verbose = true;
        break;
      case 'dry-run':
        options.dryRun = true;
        break;
      case 'output':
        options.output = value || options.output;
        break;
      case 'operation':
        options.operation = value ? value.toLowerCase() : options.operation;
        break;
      case 'unique-property':
        options.uniqueProperty = value || options.uniqueProperty;
        break;
      case 'help':
        options.help = true;
        break;
      default:
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`\nHubSpot Batch Update\n\nUsage:\n  node scripts/execute-batch-update.js <payload.json> [options]\n\nOptions:\n  --object companies|contacts|deals   HubSpot object type\n  --operation update|create|archive|upsert  Operation (default: update)\n  --unique-property email|domain      Unique property for upsert\n  --batch-size 100                    Batch size (default: 100)\n  --max-concurrent 10                 Parallel batches (default: 10)\n  --dry-run                            Preview without API calls\n  --verbose                            Verbose logging\n  --output path                        Write summary to file\n`);
}

function loadJson(inputPath) {
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to load JSON from ${inputPath}: ${error.message}`);
    process.exit(1);
  }
}

function normalizePayload(payload, objectTypeOverride, operation) {
  const objectType = (payload.objectType || payload.object || payload.type || objectTypeOverride || '').toLowerCase();
  let records = payload.records || payload.inputs || payload.data || payload;

  if (!Array.isArray(records)) {
    console.error('❌ Payload must be an array or contain records/inputs array.');
    process.exit(1);
  }

  if (!objectType) {
    console.error('❌ Missing object type. Use --object or include objectType in payload.');
    process.exit(1);
  }

  if (operation === 'archive') {
    const ids = records.map(record => {
      if (typeof record === 'string' || typeof record === 'number') return String(record);
      return record.id || record.Id || record.recordId || null;
    }).filter(Boolean);

    return { objectType, records: ids };
  }

  const normalized = records.map(record => {
    const id = record.id || record.Id || record.recordId || record._id;
    const properties = record.properties
      ? record.properties
      : Object.keys(record || {}).reduce((acc, key) => {
          if (['id', 'Id', 'recordId', '_id'].includes(key)) return acc;
          acc[key] = record[key];
          return acc;
        }, {});

    return { id, properties };
  }).filter(entry => entry.id && entry.properties && Object.keys(entry.properties).length > 0);

  return { objectType, records: normalized };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.input) {
    console.error('❌ Missing payload file.');
    process.exit(1);
  }

  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_API_KEY;
  if (!accessToken) {
    console.error('❌ Missing HubSpot credentials. Set HUBSPOT_ACCESS_TOKEN or HUBSPOT_API_KEY.');
    process.exit(1);
  }

  const payload = loadJson(options.input);
  const normalized = normalizePayload(payload, options.objectType, options.operation);

  if (normalized.records.length === 0) {
    console.error('❌ No valid records found in payload.');
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(`🧪 Dry run: ${normalized.records.length} records ready for ${options.operation}.`);
    return;
  }

  let result = null;
  if (options.operation === 'upsert') {
    if (!options.uniqueProperty) {
      console.error('❌ Missing --unique-property for upsert.');
      process.exit(1);
    }
    const helper = new BatchUpsertHelper(accessToken, {
      batchSize: options.batchSize,
      maxConcurrent: options.maxConcurrent,
      verbose: options.verbose
    });
    result = await helper.upsertRecords(normalized.objectType, normalized.records, options.uniqueProperty);
  } else {
    const updater = new BatchUpdateWrapper(accessToken, {
      batchSize: options.batchSize,
      maxConcurrent: options.maxConcurrent,
      verbose: options.verbose
    });

    if (options.operation === 'create') {
      result = await updater.batchCreate(normalized.objectType, normalized.records);
    } else if (options.operation === 'archive') {
      result = await updater.batchArchive(normalized.objectType, normalized.records);
    } else {
      result = await updater.batchUpdate(normalized.objectType, normalized.records);
    }
  }

  if (options.output) {
    fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
    console.log(`✅ Batch ${options.operation} complete. Output saved to ${options.output}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(error => {
  console.error(`❌ Batch update failed: ${error.message}`);
  process.exit(1);
});
