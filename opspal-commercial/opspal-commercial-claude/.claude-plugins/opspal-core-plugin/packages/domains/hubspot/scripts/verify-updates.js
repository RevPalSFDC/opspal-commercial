#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

function parseArgs(argv) {
  const options = {
    objectType: null,
    input: null,
    sample: null,
    output: null
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
      case 'sample':
        options.sample = value ? Number(value) : options.sample;
        break;
      case 'output':
        options.output = value || options.output;
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
  console.log(`\nHubSpot Update Verification\n\nUsage:\n  node scripts/verify-updates.js <payload.json> [options]\n\nOptions:\n  --object companies|contacts|deals   HubSpot object type\n  --sample 20                         Sample size for verification\n  --output path                       Write verification report to file\n`);
}

function loadJson(inputPath) {
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to load JSON from ${inputPath}: ${error.message}`);
    process.exit(1);
  }
}

function normalizePayload(payload, objectTypeOverride) {
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

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function batchRead(objectType, ids, properties, accessToken) {
  const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/batch/read`;
  const payload = {
    properties,
    inputs: ids.map(id => ({ id }))
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Batch read failed: ${response.status} ${body}`);
  }

  return response.json();
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
  const normalized = normalizePayload(payload, options.objectType);

  if (normalized.records.length === 0) {
    console.error('❌ No records found to verify.');
    process.exit(1);
  }

  const properties = Array.from(
    new Set(
      normalized.records.flatMap(record => Object.keys(record.properties || {}))
    )
  );

  if (properties.length === 0) {
    console.error('❌ No properties found to verify.');
    process.exit(1);
  }

  let records = normalized.records;
  if (options.sample && options.sample < records.length) {
    records = records.sort(() => Math.random() - 0.5).slice(0, options.sample);
  }

  const batches = chunkArray(records, 100);
  const mismatches = [];
  let matched = 0;

  for (const batch of batches) {
    const ids = batch.map(record => record.id);
    const response = await batchRead(normalized.objectType, ids, properties, accessToken);

    (response.results || []).forEach(result => {
      const expected = batch.find(record => record.id === result.id);
      if (!expected) return;

      const actualProps = result.properties || {};
      const differences = [];

      Object.entries(expected.properties).forEach(([key, expectedValue]) => {
        const actualValue = actualProps[key];
        if (actualValue === undefined) {
          differences.push({ field: key, expected: expectedValue, actual: null });
          return;
        }
        if (String(actualValue) !== String(expectedValue)) {
          differences.push({ field: key, expected: expectedValue, actual: actualValue });
        }
      });

      if (differences.length > 0) {
        mismatches.push({ id: result.id, differences });
      } else {
        matched += 1;
      }
    });
  }

  const summary = {
    objectType: normalized.objectType,
    checked: records.length,
    matched,
    mismatched: mismatches.length,
    timestamp: new Date().toISOString(),
    mismatches
  };

  if (options.output) {
    fs.writeFileSync(options.output, JSON.stringify(summary, null, 2));
    console.log(`✅ Verification report saved to ${options.output}`);
  } else {
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch(error => {
  console.error(`❌ Verification failed: ${error.message}`);
  process.exit(1);
});
