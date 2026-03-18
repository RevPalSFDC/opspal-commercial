#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { HookMerger } = require('./hook-merger');
const { PostPluginUpdateFixes } = require('./post-plugin-update-fixes');

const ROUTING_GATE_SCRIPT = 'pre-tool-use-contract-validation.sh';

function parseArgs(argv) {
  const options = {
    dryRun: false,
    verbose: false,
    projectRoot: path.resolve(__dirname, '../../../../'),
    corePluginRoot: path.resolve(__dirname, '../..')
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run' || arg === '--check') {
      options.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--project-root' && argv[index + 1]) {
      options.projectRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--project-root=')) {
      options.projectRoot = path.resolve(arg.split('=')[1]);
    } else if (arg === '--core-plugin-root' && argv[index + 1]) {
      options.corePluginRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--core-plugin-root=')) {
      options.corePluginRoot = path.resolve(arg.split('=')[1]);
    }
  }

  return options;
}

function countHooks(settings) {
  if (!settings || typeof settings !== 'object' || !settings.hooks || typeof settings.hooks !== 'object') {
    return 0;
  }

  let count = 0;
  for (const groups of Object.values(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) continue;
      count += group.hooks.length;
    }
  }
  return count;
}

function groupContainsScript(group, scriptBasename) {
  if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) {
    return false;
  }

  return group.hooks.some((hook) => (
    hook &&
    typeof hook.command === 'string' &&
    hook.command.includes(scriptBasename)
  ));
}

function hasWildcardRoutingGate(settings) {
  const groups = Array.isArray(settings?.hooks?.PreToolUse) ? settings.hooks.PreToolUse : [];
  return groups.some((group) => group.matcher === '*' && groupContainsScript(group, ROUTING_GATE_SCRIPT));
}

function reconcileProjectHooks({ projectRoot, corePluginRoot, dryRun, verbose }) {
  const projectSettingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const pluginsDir = path.dirname(corePluginRoot);
  const merger = new HookMerger({
    dryRun,
    verbose,
    write: !dryRun,
    projectSettingsPath,
    pluginsDir
  });

  const pluginHooks = merger.discoverPluginHooks();
  const currentSettings = merger.loadProjectSettings();
  if (!currentSettings) {
    return {
      ok: false,
      settingsPath: projectSettingsPath,
      error: 'Could not load project settings'
    };
  }

  const mergedSettings = merger.mergeHooks(currentSettings, pluginHooks);
  const wildcardGatePresent = hasWildcardRoutingGate(mergedSettings);

  if (!wildcardGatePresent) {
    return {
      ok: false,
      settingsPath: projectSettingsPath,
      pluginHooks: pluginHooks.length,
      error: `Merged settings missing PreToolUse(*) routing gate for ${ROUTING_GATE_SCRIPT}`
    };
  }

  if (!dryRun) {
    merger.writeSettings(mergedSettings);
  }

  return {
    ok: true,
    settingsPath: projectSettingsPath,
    hooksBefore: countHooks(currentSettings),
    hooksAfter: countHooks(mergedSettings),
    pluginHooks: pluginHooks.length,
    wildcardGatePresent
  };
}

function reconcileUserHooks({ projectRoot, corePluginRoot, dryRun, verbose }) {
  const fixer = new PostPluginUpdateFixes({
    projectRoot,
    corePluginRoot,
    dryRun,
    verbose
  });

  const check = fixer.checkUserLevelHooks();
  if (dryRun) {
    return {
      ok: !check.needsFix,
      needsFix: !!check.needsFix,
      reason: check.reason || null
    };
  }

  const result = fixer.fixUserLevelHooks();
  const ok = result.fixed || result.reason === 'already-configured';

  return {
    ok,
    fixed: !!result.fixed,
    reason: result.reason || null
  };
}

function reconcileHookRegistration(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.resolve(__dirname, '../../../../'));
  const corePluginRoot = path.resolve(options.corePluginRoot || path.resolve(__dirname, '../..'));
  const dryRun = options.dryRun === true;
  const verbose = options.verbose === true;

  const projectHooks = reconcileProjectHooks({ projectRoot, corePluginRoot, dryRun, verbose });
  const userHooks = reconcileUserHooks({ projectRoot, corePluginRoot, dryRun, verbose });

  return {
    ok: projectHooks.ok && userHooks.ok,
    dryRun,
    projectRoot,
    corePluginRoot,
    projectHooks,
    userHooks
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = reconcileHookRegistration(options);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  ROUTING_GATE_SCRIPT,
  countHooks,
  hasWildcardRoutingGate,
  reconcileHookRegistration,
  reconcileProjectHooks,
  reconcileUserHooks
};
