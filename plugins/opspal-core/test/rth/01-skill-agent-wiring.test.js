#!/usr/bin/env node
'use strict';

/**
 * RTH Test 01: Skill-Agent Wiring
 *
 * Verifies that every skill's `agent:` frontmatter field resolves
 * to an existing agent definition file.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');

function parseAgentField(content) {
  // Match agent: field in YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;
  const agentMatch = frontmatterMatch[1].match(/^agent:\s*(.+)$/m);
  return agentMatch ? agentMatch[1].trim() : null;
}

function discoverSkills() {
  const skills = [];
  const pluginDirs = fs.readdirSync(PLUGINS_DIR).filter(d => {
    return fs.statSync(path.join(PLUGINS_DIR, d)).isDirectory();
  });

  for (const plugin of pluginDirs) {
    const skillsDir = path.join(PLUGINS_DIR, plugin, 'skills');
    if (!fs.existsSync(skillsDir)) continue;

    const skillSubdirs = fs.readdirSync(skillsDir).filter(d => {
      return fs.statSync(path.join(skillsDir, d)).isDirectory();
    });

    for (const skillDir of skillSubdirs) {
      const skillFile = path.join(skillsDir, skillDir, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        skills.push({ plugin, skillDir, skillFile });
      }
    }
  }

  return skills;
}

function resolveAgentPath(agentRef) {
  // agent: opspal-core:unified-reporting-aggregator
  // agent: unified-reporting-aggregator (assumes same plugin)
  if (agentRef.includes(':')) {
    const [pluginShort, agentName] = agentRef.split(':', 2);
    const pluginDir = pluginShort.startsWith('opspal-') ? pluginShort : `opspal-${pluginShort}`;
    return path.join(PLUGINS_DIR, pluginDir, 'agents', `${agentName}.md`);
  }
  return null; // Can't resolve without plugin context
}

// Run tests
const skills = discoverSkills();
let passed = 0;
let failed = 0;
let skipped = 0;

for (const { plugin, skillDir, skillFile } of skills) {
  const content = fs.readFileSync(skillFile, 'utf8');
  const agentRef = parseAgentField(content);

  if (!agentRef) {
    skipped++;
    continue;
  }

  const agentPath = resolveAgentPath(agentRef);
  if (!agentPath) {
    skipped++;
    continue;
  }

  try {
    assert(fs.existsSync(agentPath),
      `Skill ${plugin}/skills/${skillDir} references agent "${agentRef}" but ${agentPath} does not exist`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    failed++;
  }
}

console.log(`Skill-Agent Wiring: ${passed} passed, ${failed} failed, ${skipped} skipped (${skills.length} total skills)`);
assert.strictEqual(failed, 0, `${failed} skill-agent wiring failures detected`);
