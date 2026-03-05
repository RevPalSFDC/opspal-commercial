#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');
const CROSS_PLUGIN_PATTERN = /\$\{CLAUDE_PLUGIN_ROOT\}[\\/]\.\.[\\/]/;

function listPluginDirs() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];

  return fs
    .readdirSync(PLUGINS_DIR)
    .map((entry) => path.join(PLUGINS_DIR, entry))
    .filter((fullPath) => fs.existsSync(path.join(fullPath, '.claude-plugin', 'plugin.json')));
}

function collectViolations() {
  const violations = [];

  for (const pluginDir of listPluginDirs()) {
    const pluginName = path.basename(pluginDir);
    const hooksPath = path.join(pluginDir, '.claude-plugin', 'hooks.json');
    if (!fs.existsSync(hooksPath)) continue;

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    } catch (error) {
      violations.push({
        plugin: pluginName,
        hooksPath,
        event: 'N/A',
        matcher: 'N/A',
        command: `Invalid JSON: ${error.message}`
      });
      continue;
    }

    const hooksConfig = parsed && typeof parsed === 'object' ? parsed.hooks : null;
    if (!hooksConfig || typeof hooksConfig !== 'object') continue;

    for (const [event, groups] of Object.entries(hooksConfig)) {
      if (!Array.isArray(groups)) continue;

      for (const group of groups) {
        if (!group || typeof group !== 'object') continue;
        const matcher = typeof group.matcher === 'string' ? group.matcher : '*';
        const hooks = Array.isArray(group.hooks) ? group.hooks : [];

        for (const hook of hooks) {
          if (!hook || typeof hook !== 'object' || typeof hook.command !== 'string') continue;
          if (!CROSS_PLUGIN_PATTERN.test(hook.command)) continue;

          violations.push({
            plugin: pluginName,
            hooksPath,
            event,
            matcher,
            command: hook.command
          });
        }
      }
    }
  }

  return violations;
}

function main() {
  const violations = collectViolations();

  console.log('Hook Path Isolation Check');
  console.log('=========================');
  console.log(`Plugins scanned: ${listPluginDirs().length}`);
  console.log(`Violations: ${violations.length}`);

  if (violations.length > 0) {
    console.error('\nCross-plugin hook path references are not allowed.');
    for (const violation of violations) {
      console.error(
        `- ${violation.plugin} ${violation.event}/${violation.matcher}\n` +
        `  File: ${violation.hooksPath}\n` +
        `  Command: ${violation.command}`
      );
    }
    process.exit(1);
  }

  console.log('\nHook path isolation passed.');
}

main();
