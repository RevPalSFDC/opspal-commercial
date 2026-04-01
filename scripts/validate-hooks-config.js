#!/usr/bin/env node
/**
 * Validate plugin hook configuration files.
 * - Ensures hooks.json parses and hook commands exist.
 * - Flags legacy hooks fields in plugin.json.
 * - Validates active plugins (plugins/), bundled plugins (.claude-plugins/), and dev tools (dev-tools/).
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const activePluginsRoot = path.join(repoRoot, 'plugins');
const bundledPluginsRoot = path.join(repoRoot, '.claude-plugins');
const devToolsRoot = path.join(repoRoot, 'dev-tools');

// Collect all plugin directories to validate
const pluginPaths = [];
const seenPluginRoots = new Set();

function addPluginRoot(name, root) {
  if (seenPluginRoots.has(root)) {
    return;
  }
  seenPluginRoots.add(root);
  pluginPaths.push({ name, root });
}

// Add active plugin sources from plugins/
if (fs.existsSync(activePluginsRoot)) {
  const activePlugins = fs.readdirSync(activePluginsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      name: `plugins/${entry.name}`,
      root: path.join(activePluginsRoot, entry.name)
    }));
  activePlugins.forEach(({ name, root }) => addPluginRoot(name, root));
} else {
  console.warn(`⚠️ Missing active plugins directory: ${activePluginsRoot}`);
}

// Add distributable plugins from .claude-plugins/
if (fs.existsSync(bundledPluginsRoot)) {
  const bundledPlugins = fs.readdirSync(bundledPluginsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      name: `.claude-plugins/${entry.name}`,
      root: path.join(bundledPluginsRoot, entry.name)
    }));
  bundledPlugins.forEach(({ name, root }) => addPluginRoot(name, root));
} else {
  console.warn(`⚠️ Missing bundled plugins directory: ${bundledPluginsRoot}`);
}

// Add dev-tools plugins
if (fs.existsSync(devToolsRoot)) {
  const devToolsPlugins = fs.readdirSync(devToolsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => fs.existsSync(path.join(devToolsRoot, entry.name, '.claude-plugin')))
    .map(entry => ({
      name: `dev-tools/${entry.name}`,
      root: path.join(devToolsRoot, entry.name)
    }));
  devToolsPlugins.forEach(({ name, root }) => addPluginRoot(name, root));
}

if (pluginPaths.length === 0) {
  console.error('❌ No plugins found to validate');
  process.exit(1);
}

const errors = [];
const warnings = [];

function extractCommandPath(command) {
  if (typeof command !== 'string' || command.trim() === '') {
    return null;
  }

  const envMatch = command.match(
    /(?:^|\s)env(?:\s+[A-Z_][A-Z0-9_]*=[^\s]+)+\s+(?:"([^"]+\.(?:sh|js))"|'([^']+\.(?:sh|js))'|([^"'`\s;]+\.(?:sh|js)))/
  );
  if (envMatch) {
    return envMatch[1] || envMatch[2] || envMatch[3];
  }

  const bashMatch = command.match(/bash\s+(?:-c\s+)?["']?([^"'\s;]+\.sh)/);
  if (bashMatch) {
    return bashMatch[1];
  }

  const nodeMatch = command.match(/node\s+["']?([^"'\s;]+\.js)/);
  if (nodeMatch) {
    return nodeMatch[1];
  }

  if (command.endsWith('.sh') || command.endsWith('.js')) {
    return command.split(/\s+/)[0];
  }

  const quotedMatch = command.match(/["']([^"']+\.(?:sh|js))["']/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  return null;
}

for (const { name: pluginName, root: pluginRoot } of pluginPaths) {
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

        // Guard: reject ms-like timeout values. Claude hook timeout is in SECONDS.
        // Values > 120 are almost certainly milliseconds (e.g. 5000 = 83 minutes).
        if (typeof hook.timeout === 'number' && hook.timeout > 120) {
          errors.push(
            `${pluginName}: ${hookName} timeout=${hook.timeout} looks like milliseconds — Claude expects seconds. ` +
            `Did you mean ${Math.round(hook.timeout / 1000)}?`
          );
        }

        if (!hook.command.includes('${CLAUDE_PLUGIN_ROOT}')) {
          warnings.push(`${pluginName}: ${hookName} command missing \${CLAUDE_PLUGIN_ROOT}`);
        }

        // Handle inline bash commands (bash -c '...')
        const isInlineBash = hook.command.startsWith('bash -c');

        if (isInlineBash) {
          // Extract script paths from inline bash command
          const scriptPathMatch = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}[^\s'"]+\.sh/g);
          if (scriptPathMatch) {
            for (const scriptRef of scriptPathMatch) {
              const resolved = scriptRef.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
              if (!fs.existsSync(resolved)) {
                errors.push(`${pluginName}: ${hookName} inline command references missing file ${resolved}`);
              } else {
                try {
                  fs.accessSync(resolved, fs.constants.X_OK);
                } catch (error) {
                  warnings.push(`${pluginName}: ${hookName} script not executable (${resolved})`);
                }
              }
            }
          }
          continue;
        }

        const commandPath = extractCommandPath(hook.command) || hook.command.split(/\s+/)[0];
        const resolved = commandPath.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
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

// Phase 3: Check for advisory-vs-governance contradictions across plugins.
// For each PreToolUse hook that redirects to a named agent, verify that no
// UserPromptSubmit hook could suppress that agent's plugin.
for (const { name: pluginName, root: pluginRoot } of pluginPaths) {
  const hooksPath = path.join(pluginRoot, '.claude-plugin', 'hooks.json');
  if (!fs.existsSync(hooksPath)) continue;

  let hooksJson;
  try {
    hooksJson = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch (_e) {
    continue;
  }
  if (!hooksJson.hooks) continue;

  // Collect agent names referenced in PreToolUse hook scripts (deny+redirect)
  const protectedPlugins = new Set();
  for (const entry of (hooksJson.hooks.PreToolUse || [])) {
    for (const hook of (entry.hooks || [])) {
      if (!hook.command) continue;
      const cmdPath = (extractCommandPath(hook.command) || hook.command.split(/\s+/)[0])
        .replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot);
      try {
        if (!fs.existsSync(cmdPath)) continue;
        const src = fs.readFileSync(cmdPath, 'utf8');
        // Match agent references like opspal-salesforce:sfdc-deployment-manager
        const agentRefs = src.match(/opspal-[a-z-]+:[a-z-]+/g) || [];
        for (const ref of agentRefs) {
          const colonIdx = ref.indexOf(':');
          if (colonIdx > 0) protectedPlugins.add(ref.slice(0, colonIdx));
        }
      } catch (_e) { /* skip unreadable */ }
    }
  }

  // Check if any UPS hook description uses suppression language for protected plugins
  for (const entry of (hooksJson.hooks.UserPromptSubmit || [])) {
    for (const hook of (entry.hooks || [])) {
      const desc = (hook.description || '').toLowerCase();
      if (/suppress|block|restrict|reject/i.test(desc)) {
        for (const protectedPlugin of protectedPlugins) {
          warnings.push(
            `${pluginName}: UPS hook "${hook.description?.slice(0, 60)}..." uses suppression language ` +
            `while PreToolUse hooks protect agents from ${protectedPlugin}. ` +
            `Verify scope selection cannot contradict governance redirects.`
          );
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
