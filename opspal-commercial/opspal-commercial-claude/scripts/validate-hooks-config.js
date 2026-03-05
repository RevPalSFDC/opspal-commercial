#!/usr/bin/env node
/**
 * Validate plugin hook configuration files.
 * - Ensures hooks.json parses and hook commands exist.
 * - Flags legacy hooks fields in plugin.json.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const pluginsRoot = path.join(repoRoot, '.claude-plugins');

if (!fs.existsSync(pluginsRoot)) {
  console.error(`❌ Missing plugins directory: ${pluginsRoot}`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const pluginDirs = fs.readdirSync(pluginsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

for (const pluginName of pluginDirs) {
  const pluginRoot = path.join(pluginsRoot, pluginName);
  const pluginConfigDir = path.join(pluginRoot, '.claude-plugin');
  const pluginJsonPath = path.join(pluginConfigDir, 'plugin.json');
  const hooksPath = path.join(pluginConfigDir, 'hooks.json');

  if (fs.existsSync(pluginJsonPath)) {
    try {
      const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      if (Object.prototype.hasOwnProperty.call(pluginJson, 'hooks')) {
        errors.push(`${pluginName}: plugin.json includes legacy "hooks" field`);
      }
    } catch (error) {
      errors.push(`${pluginName}: plugin.json parse failed (${error.message})`);
    }
  }

  if (!fs.existsSync(hooksPath)) {
    continue;
  }

  let hooksJson;
  try {
    hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch (error) {
    errors.push(`${pluginName}: hooks.json parse failed (${error.message})`);
    continue;
  }

  if (!hooksJson.hooks || typeof hooksJson.hooks !== 'object') {
    errors.push(`${pluginName}: hooks.json missing top-level "hooks" object`);
    continue;
  }

  for (const [hookName, hookEntries] of Object.entries(hooksJson.hooks)) {
    if (!Array.isArray(hookEntries)) {
      errors.push(`${pluginName}: ${hookName} must be an array`);
      continue;
    }

    for (const entry of hookEntries) {
      const hookList = Array.isArray(entry.hooks) ? entry.hooks : [];
      if (!Array.isArray(entry.hooks)) {
        errors.push(`${pluginName}: ${hookName} entry missing hooks array`);
        continue;
      }

      for (const hook of hookList) {
        if (!hook.command) {
          errors.push(`${pluginName}: ${hookName} hook missing command`);
          continue;
        }

        if (!hook.command.includes('${CLAUDE_PLUGIN_ROOT}')) {
          warnings.push(`${pluginName}: ${hookName} command missing \${CLAUDE_PLUGIN_ROOT}`);
        }

        const commandToken = hook.command.split(/\s+/)[0];
        const resolved = commandToken.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
        if (!fs.existsSync(resolved)) {
          errors.push(`${pluginName}: ${hookName} command missing file ${resolved}`);
          continue;
        }

        if (resolved.endsWith('.sh')) {
          try {
            fs.accessSync(resolved, fs.constants.X_OK);
          } catch (error) {
            warnings.push(`${pluginName}: ${hookName} script not executable (${resolved})`);
          }
        }
      }
    }
  }
}

if (errors.length) {
  console.error('❌ Hook configuration errors:');
  errors.forEach(item => console.error(`  - ${item}`));
}

if (warnings.length) {
  console.warn('⚠️ Hook configuration warnings:');
  warnings.forEach(item => console.warn(`  - ${item}`));
}

if (!errors.length && !warnings.length) {
  console.log('✅ Hook configuration checks passed');
}

process.exit(errors.length ? 1 : 0);
