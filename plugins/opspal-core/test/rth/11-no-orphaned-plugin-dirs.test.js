#!/usr/bin/env node
'use strict';

/**
 * RTH Test 11: No Orphaned Plugin Directories
 *
 * Verifies that every directory under plugins/ either has a valid
 * plugin.json (or .claude-plugin/plugin.json) or is a known non-plugin
 * directory (shared-docs, etc.).
 *
 * Catches cases like opspal-data-hygiene where the plugin was removed
 * from the marketplace but the directory shell was left behind.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');
const KNOWN_NON_PLUGINS = ['shared-docs', 'node_modules', '.git'];

const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
  const p = path.join(PLUGINS_DIR, d);
  return fs.statSync(p).isDirectory() && !KNOWN_NON_PLUGINS.includes(d);
});

let passed = 0;
let failed = 0;

for (const dir of pluginDirs) {
  const pluginJsonPaths = [
    path.join(PLUGINS_DIR, dir, '.claude-plugin', 'plugin.json'),
    path.join(PLUGINS_DIR, dir, 'plugin.json')
  ];

  const hasPluginJson = pluginJsonPaths.some(p => fs.existsSync(p));

  try {
    assert(hasPluginJson,
      `Orphaned directory: plugins/${dir}/ has no plugin.json — remove it or add it to KNOWN_NON_PLUGINS`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    failed++;
  }
}

console.log(`No Orphaned Plugin Dirs: ${passed} passed, ${failed} failed (${pluginDirs.length} directories checked)`);
assert.strictEqual(failed, 0, `${failed} orphaned plugin directories detected`);
