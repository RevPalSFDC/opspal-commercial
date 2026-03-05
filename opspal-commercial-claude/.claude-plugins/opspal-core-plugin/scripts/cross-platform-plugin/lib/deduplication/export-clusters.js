#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { detectClusters, selectRecords } = require('./run-dedup');

function parseArgs(argv) {
  const options = {
    object: 'Account',
    input: process.env.DEDUP_INPUT_PATH || null,
    output: null,
    threshold: Number(process.env.DEDUP_AUTO_THRESHOLD || 95),
    reviewThreshold: Number(process.env.DEDUP_REVIEW_THRESHOLD || 80),
    limit: null
  };

  const args = [...argv];
  const takeValue = (inline) => (inline !== undefined
    ? inline
    : (args[0] && !args[0].startsWith('--') ? args.shift() : undefined));
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith('--')) continue;

    const [flag, inlineValue] = token.split('=');
    const key = flag.replace(/^--/, '');
    const value = takeValue(inlineValue);

    switch (key) {
      case 'object':
        options.object = value || options.object;
        break;
      case 'input':
        options.input = value || options.input;
        break;
      case 'output':
        options.output = value || options.output;
        break;
      case 'threshold':
        options.threshold = value ? Number(value) : options.threshold;
        break;
      case 'review-threshold':
        options.reviewThreshold = value ? Number(value) : options.reviewThreshold;
        break;
      case 'limit':
        options.limit = value ? Number(value) : options.limit;
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
  console.log(`\nExport Deduplication Clusters\n\nUsage:\n  node scripts/lib/deduplication/export-clusters.js --input <path> --output <path> [options]\n\nOptions:\n  --object Account|Contact|Lead       Target object (default: Account)\n  --threshold 95                      Auto-merge threshold\n  --review-threshold 80               Review queue threshold\n  --limit 500                         Limit records processed\n  --input path                        JSON input data file\n  --output path                       Output file for clusters\n`);
}

function loadJson(inputPath) {
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to load JSON from ${inputPath}: ${error.message}`);
    process.exit(1);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.input) {
    console.error('❌ Missing input data. Provide --input or set DEDUP_INPUT_PATH.');
    process.exit(1);
  }

  if (!options.output) {
    console.error('❌ Missing output path. Provide --output.');
    process.exit(1);
  }

  const raw = loadJson(options.input);
  const records = selectRecords(raw, options.object, options.limit);

  if (!records || records.length === 0) {
    console.error('❌ No records found to export clusters.');
    process.exit(1);
  }

  const detection = detectClusters(records, options);
  const payload = {
    object: options.object,
    clusters: detection.clusters,
    stats: detection.stats,
    generatedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(payload, null, 2));

  console.log(`✅ Exported ${detection.clusters.length} clusters to ${options.output}`);
}

main();
