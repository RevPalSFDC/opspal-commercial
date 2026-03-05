#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = {
    snapshotId: null,
    snapshotFile: null,
    output: null,
    list: false,
    limit: 20
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
      case 'snapshot-id':
        options.snapshotId = value || options.snapshotId;
        break;
      case 'snapshot-file':
        options.snapshotFile = value || options.snapshotFile;
        break;
      case 'output':
        options.output = value || options.output;
        break;
      case 'list':
        options.list = true;
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
  console.log(`\nRollback Utility\n\nUsage:\n  node scripts/lib/governance/rollback.js --snapshot-id <id> [options]\n\nOptions:\n  --snapshot-id id        Snapshot ID to rollback\n  --snapshot-file path    Snapshot JSON file path\n  --output path           Write rollback payload to file\n  --list                  List available snapshots\n  --limit 20              Limit list output\n`);
}

function resolveSnapshotDir() {
  const pluginRoot = path.resolve(__dirname, '../../..');
  const repoRoot = path.resolve(pluginRoot, '../..');
  const stateDir = process.env.DQ_STATE_DIR || path.join(repoRoot, 'reports', 'data-quality');
  return process.env.DQ_SNAPSHOT_DIR || path.join(stateDir, 'snapshots');
}

function listSnapshots(snapshotDir, limit) {
  if (!fs.existsSync(snapshotDir)) {
    console.log('No snapshots found.');
    return;
  }

  const files = fs.readdirSync(snapshotDir)
    .filter(file => file.endsWith('.json'))
    .map(file => ({
      file,
      fullPath: path.join(snapshotDir, file),
      mtime: fs.statSync(path.join(snapshotDir, file)).mtime
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit || 20);

  if (files.length === 0) {
    console.log('No snapshots found.');
    return;
  }

  console.log('Available snapshots:');
  files.forEach(entry => {
    console.log(`- ${entry.file} (${entry.mtime.toISOString()})`);
  });
}

function loadSnapshotById(snapshotDir, snapshotId) {
  if (!snapshotId) return null;

  const directPath = path.join(snapshotDir, `${snapshotId}.json`);
  if (fs.existsSync(directPath)) {
    return { path: directPath, data: JSON.parse(fs.readFileSync(directPath, 'utf-8')) };
  }

  const files = fs.existsSync(snapshotDir) ? fs.readdirSync(snapshotDir) : [];
  const match = files.find(file => file.includes(snapshotId));
  if (!match) return null;

  const filePath = path.join(snapshotDir, match);
  return { path: filePath, data: JSON.parse(fs.readFileSync(filePath, 'utf-8')) };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const snapshotDir = resolveSnapshotDir();

  if (options.list) {
    listSnapshots(snapshotDir, options.limit);
    return;
  }

  let snapshot = null;
  if (options.snapshotFile) {
    try {
      snapshot = {
        path: options.snapshotFile,
        data: JSON.parse(fs.readFileSync(options.snapshotFile, 'utf-8'))
      };
    } catch (error) {
      console.error(`❌ Failed to load snapshot file: ${error.message}`);
      process.exit(1);
    }
  } else {
    snapshot = loadSnapshotById(snapshotDir, options.snapshotId);
  }

  if (!snapshot) {
    console.error('❌ Snapshot not found. Use --list to see available snapshots.');
    process.exit(1);
  }

  if (options.output) {
    fs.writeFileSync(options.output, JSON.stringify(snapshot.data, null, 2));
    console.log(`✅ Rollback payload saved to ${options.output}`);
    return;
  }

  console.log(`Rollback snapshot: ${path.basename(snapshot.path)}`);
  console.log(`Created: ${snapshot.data.createdAt || 'unknown'}`);
  console.log(`Records: ${(snapshot.data.records || snapshot.data.data || []).length}`);
  console.log('Use --output to export rollback payload.');
}

main();
