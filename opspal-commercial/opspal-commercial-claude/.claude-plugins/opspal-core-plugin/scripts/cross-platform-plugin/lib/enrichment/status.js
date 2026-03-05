#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = {
    json: false,
    outputDir: process.env.ENRICHMENT_OUTPUT_DIR || null
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
      case 'json':
        options.json = true;
        break;
      case 'output-dir':
        options.outputDir = value || options.outputDir;
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
  console.log(`\nEnrichment Status\n\nUsage:\n  node scripts/lib/enrichment/status.js [options]\n\nOptions:\n  --json                Output raw JSON\n  --output-dir path     Override enrichment output directory\n`);
}

function resolveOutputDir(explicitPath) {
  if (explicitPath) return explicitPath;
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  return path.join(repoRoot, 'reports', 'data-quality', 'enrichment');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const outputDir = resolveOutputDir(options.outputDir);
  const statusPath = path.join(outputDir, 'status.json');

  if (!fs.existsSync(statusPath)) {
    console.error('❌ No enrichment status found. Run the enrichment pipeline first.');
    process.exit(1);
  }

  let status = null;
  try {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to read status file: ${error.message}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (!status.lastRun) {
    console.log('No enrichment runs recorded yet.');
    return;
  }

  console.log('Enrichment Status');
  console.log(`Last Run: ${status.lastRun.timestamp}`);
  console.log(`Object: ${status.lastRun.object}`);
  console.log(`Processed: ${status.lastRun.recordsProcessed}`);
  console.log(`Enriched: ${status.lastRun.enriched}`);
  console.log(`Review Queue: ${status.lastRun.reviewQueued}`);
  console.log(`Dry Run: ${status.lastRun.dryRun ? 'yes' : 'no'}`);
  console.log(`Results: ${status.lastRun.resultsPath}`);
}

main();
