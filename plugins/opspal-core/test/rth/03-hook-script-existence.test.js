#!/usr/bin/env node
'use strict';

/**
 * RTH Test 03: Hook Script Existence
 *
 * Verifies that all scripts referenced in hooks.json files exist
 * and have execute permission.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');

function discoverHooksJsonFiles() {
  const files = [];
  const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
    const p = path.join(PLUGINS_DIR, d);
    return fs.statSync(p).isDirectory();
  });

  for (const plugin of pluginDirs) {
    const hooksJson = path.join(PLUGINS_DIR, plugin, '.claude-plugin', 'hooks.json');
    if (fs.existsSync(hooksJson)) {
      files.push({ plugin, hooksJson });
    }
  }
  return files;
}

function extractHookCommands(hooksObj, pluginRoot) {
  const commands = [];
  for (const [eventType, entries] of Object.entries(hooksObj)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const hooks = entry.hooks || [];
      for (const hook of hooks) {
        if (hook.command) {
          const resolved = hook.command.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
          commands.push({ eventType, command: resolved, original: hook.command });
        }
      }
    }
  }
  return commands;
}

let passed = 0;
let failed = 0;

const hooksFiles = discoverHooksJsonFiles();
for (const { plugin, hooksJson } of hooksFiles) {
  const pluginRoot = path.join(PLUGINS_DIR, plugin);
  const content = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
  const hooks = content.hooks || content;
  const commands = extractHookCommands(hooks, pluginRoot);

  for (const { eventType, command, original } of commands) {
    // Skip inline bash commands, env-prefixed commands, and non-file references
    if (command.startsWith('bash -c') || command.startsWith('env ') || !command.endsWith('.sh')) continue;

    try {
      assert(fs.existsSync(command),
        `[${plugin}] ${eventType}: script not found: ${original}`);

      // Check execute permission
      fs.accessSync(command, fs.constants.X_OK);
      passed++;
    } catch (e) {
      console.error(`FAIL: ${e.message}`);
      failed++;
    }
  }
}

console.log(`Hook Script Existence: ${passed} passed, ${failed} failed (across ${hooksFiles.length} plugins)`);
assert.strictEqual(failed, 0, `${failed} hook script existence failures detected`);
