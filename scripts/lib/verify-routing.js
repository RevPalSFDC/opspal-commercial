#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, collectInventory } = require('./plugin-doc-inventory');

const CLAUDE_PATH = path.join(REPO_ROOT, 'CLAUDE.md');
const REQUIRE_CLAUDE_ROUTING = process.env.OPSPAL_REQUIRE_CLAUDE_ROUTING === '1';

function extractSection(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`### ${escaped}[\\s\\S]*?(?=\\n### |\\n## |$)`);
  const match = content.match(regex);
  return match ? match[0] : '';
}

function extractRouteTargets(sectionContent) {
  const targets = [];
  const lines = sectionContent.split('\n');

  for (const line of lines) {
    const match = line.match(/\|\s*[^|]+\s*\|\s*`([^`]+:[^`]+)`\s*\|/);
    if (!match) continue;
    targets.push(match[1].trim());
  }

  return targets;
}

function main() {
  if (!fs.existsSync(CLAUDE_PATH)) {
    const message = `CLAUDE.md not found: ${CLAUDE_PATH}`;

    if (REQUIRE_CLAUDE_ROUTING) {
      console.error(message);
      process.exit(1);
    }

    console.log('Routing Integrity Check');
    console.log('=======================');
    console.log(`${message}; skipping route validation.`);
    process.exit(0);
  }

  const inventory = collectInventory();
  const validAgents = new Set();

  for (const plugin of inventory.plugins) {
    for (const agent of plugin.agents) {
      validAgents.add(`${plugin.name}:${agent.name}`);
    }
  }

  const content = fs.readFileSync(CLAUDE_PATH, 'utf8');
  const mandatory = extractRouteTargets(extractSection(content, 'Mandatory Routing (MUST Use Task Tool)'));
  const recommended = extractRouteTargets(extractSection(content, 'Recommended Routing'));
  const routes = [...mandatory, ...recommended];

  const errors = [];

  for (const route of routes) {
    if (route.includes('-plugin:')) {
      errors.push(`Legacy plugin alias found in route target: ${route}`);
      continue;
    }

    if (!validAgents.has(route)) {
      errors.push(`Route target not found in runtime agent registry: ${route}`);
    }
  }

  console.log('Routing Integrity Check');
  console.log('=======================');
  console.log(`Routes checked: ${routes.length}`);

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length})`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('\nRouting integrity passed.');
}

main();
