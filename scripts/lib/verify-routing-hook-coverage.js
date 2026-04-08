#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PLUGIN_ROOT = path.join(REPO_ROOT, 'plugins', 'opspal-core');
const HOOKS_MANIFEST_PATH = path.join(PLUGIN_ROOT, '.claude-plugin', 'hooks.json');
const PROJECT_SETTINGS_PATH = path.join(REPO_ROOT, '.claude', 'settings.json');
const POST_INSTALL_HOOK_PATH = path.join(PLUGIN_ROOT, '.claude-plugin', 'hooks', 'post-install.sh');
const POST_PLUGIN_UPDATE_HOOK_PATH = path.join(PLUGIN_ROOT, 'hooks', 'post-plugin-update.sh');
const ROUTING_GATE_SCRIPT = 'pre-tool-use-contract-validation.sh';
const RECONCILER_SCRIPT = 'reconcile-hook-registration.js';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function hasWildcardRoutingGate(config) {
  const groups = Array.isArray(config?.hooks?.PreToolUse) ? config.hooks.PreToolUse : [];
  return groups.some((group) => group.matcher === '*' && groupContainsScript(group, ROUTING_GATE_SCRIPT));
}

function hookInvokesReconciler(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return content.includes(RECONCILER_SCRIPT);
}

function main() {
  console.log('Routing Hook Coverage Check');
  console.log('===========================');

  const errors = [];

  if (!fs.existsSync(HOOKS_MANIFEST_PATH)) {
    errors.push(`Missing hooks manifest: ${HOOKS_MANIFEST_PATH}`);
  }

  if (!fs.existsSync(PROJECT_SETTINGS_PATH)) {
    errors.push(`Missing project settings: ${PROJECT_SETTINGS_PATH}`);
  }

  if (errors.length === 0) {
    const manifest = readJson(HOOKS_MANIFEST_PATH);
    const settings = readJson(PROJECT_SETTINGS_PATH);

    if (!hasWildcardRoutingGate(manifest)) {
      errors.push('opspal-core/.claude-plugin/hooks.json is missing PreToolUse(*) coverage for pre-tool-use-contract-validation.sh');
    }

    if (!hasWildcardRoutingGate(settings)) {
      errors.push('.claude/settings.json is missing PreToolUse(*) coverage for pre-tool-use-contract-validation.sh');
    }
  }

  if (!hookInvokesReconciler(POST_INSTALL_HOOK_PATH)) {
    errors.push('post-install hook does not invoke reconcile-hook-registration.js');
  }

  if (!hookInvokesReconciler(POST_PLUGIN_UPDATE_HOOK_PATH)) {
    errors.push('post-plugin-update hook does not invoke reconcile-hook-registration.js');
  }

  console.log(`Manifest checked: ${path.relative(REPO_ROOT, HOOKS_MANIFEST_PATH)}`);
  console.log(`Project settings checked: ${path.relative(REPO_ROOT, PROJECT_SETTINGS_PATH)}`);

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length})`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('\nRouting hook coverage passed.');
}

main();
