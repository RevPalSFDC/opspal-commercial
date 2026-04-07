#!/usr/bin/env node
'use strict';

/**
 * RTH Test 10: No Agent Frontmatter Hooks
 *
 * Verifies that no plugin agent .md files define a `hooks:` key in
 * their YAML frontmatter. Claude Code ignores hooks in plugin agents
 * (only ~/.claude/agents/ supports hooks), so defining them creates
 * silent failures and startup warnings.
 *
 * Hook behavior for plugin agents must be registered in the plugin's
 * .claude-plugin/hooks.json using SubagentStop/SubagentStart matchers.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');

function discoverAgentFiles() {
  const files = [];
  const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
    const p = path.join(PLUGINS_DIR, d);
    return fs.statSync(p).isDirectory() && d.startsWith('opspal-');
  });

  for (const plugin of pluginDirs) {
    const agentsDir = path.join(PLUGINS_DIR, plugin, 'agents');
    if (!fs.existsSync(agentsDir)) continue;

    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const file of agentFiles) {
      files.push({ plugin, file, fullPath: path.join(agentsDir, file) });
    }
  }
  return files;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

let passed = 0;
let failed = 0;
const agentFiles = discoverAgentFiles();

for (const { plugin, file, fullPath } of agentFiles) {
  const content = fs.readFileSync(fullPath, 'utf8');
  const frontmatter = extractFrontmatter(content);

  // Check for hooks: key at start of line in frontmatter
  const hasHooks = /^hooks:/m.test(frontmatter);

  try {
    assert(!hasHooks,
      `[${plugin}] ${file} defines hooks: in frontmatter (ignored by Claude Code for plugin agents — use .claude-plugin/hooks.json SubagentStop instead)`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    failed++;
  }
}

console.log(`No Agent Frontmatter Hooks: ${passed} passed, ${failed} failed (${agentFiles.length} agent files checked)`);
assert.strictEqual(failed, 0, `${failed} agent files still define hooks: in frontmatter`);
