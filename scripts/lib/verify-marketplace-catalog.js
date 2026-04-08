#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, collectInventory } = require('./plugin-doc-inventory');

const MARKETPLACE_PATH = path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json');

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath) || '.';
}

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function indexByName(items) {
  return new Map(items.map((item) => [item.name, item]));
}

function main() {
  console.log('Marketplace Catalog Check');
  console.log('=========================');

  if (!fs.existsSync(MARKETPLACE_PATH)) {
    console.error(`Marketplace catalog not found: ${repoRelative(MARKETPLACE_PATH)}`);
    process.exit(1);
  }

  const inventory = collectInventory();
  const expectedPlugins = inventory.plugins.map((plugin) => ({
    name: plugin.name,
    version: plugin.version,
    source: `./${normalizeRelativePath(plugin.path)}`
  }));

  let marketplace;
  try {
    marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, 'utf8'));
  } catch (error) {
    console.error(`Failed to parse ${repoRelative(MARKETPLACE_PATH)}: ${error.message}`);
    process.exit(1);
  }

  const actualPlugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const expectedByName = indexByName(expectedPlugins);
  const actualByName = indexByName(actualPlugins);
  const errors = [];

  for (const expected of expectedPlugins) {
    const actual = actualByName.get(expected.name);
    if (!actual) {
      errors.push(`Missing marketplace entry for runtime plugin: ${expected.name}`);
      continue;
    }

    if (actual.source !== expected.source) {
      errors.push(
        `Source mismatch for ${expected.name}: expected "${expected.source}", found "${actual.source}"`
      );
    }

    if (actual.version !== expected.version) {
      errors.push(
        `Version mismatch for ${expected.name}: expected "${expected.version}", found "${actual.version}"`
      );
    }
  }

  for (const actual of actualPlugins) {
    if (!expectedByName.has(actual.name)) {
      errors.push(`Unexpected marketplace entry with no runtime plugin manifest: ${actual.name}`);
    }
  }

  if (marketplace._stats && typeof marketplace._stats === 'object') {
    const expectedStats = {
      total_plugins: inventory.totals.plugins,
      total_agents: inventory.totals.agents,
      total_commands: inventory.totals.commands,
      total_hooks: inventory.totals.hooks
    };

    for (const [key, value] of Object.entries(expectedStats)) {
      if (marketplace._stats[key] !== value) {
        errors.push(
          `Marketplace stats mismatch for ${key}: expected "${value}", found "${marketplace._stats[key]}"`
        );
      }
    }
  }

  console.log(`Runtime plugins scanned: ${expectedPlugins.length}`);
  console.log(`Marketplace entries: ${actualPlugins.length}`);

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length})`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('\nMarketplace catalog passed.');
}

main();
