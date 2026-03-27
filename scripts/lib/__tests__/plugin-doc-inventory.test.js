'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectPluginInventory } = require('../plugin-doc-inventory');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

test('collectPluginInventory ignores non-plugin support directories under plugins', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-doc-inventory-'));
  const pluginsRoot = path.join(repoRoot, 'plugins');

  writeJson(path.join(pluginsRoot, 'opspal-core', '.claude-plugin', 'plugin.json'), {
    name: 'opspal-core',
    version: '1.2.3',
    description: 'Core plugin.'
  });
  writeJson(path.join(pluginsRoot, 'opspal-core', '.claude-plugin', 'lifecycle.json'), {
    status: 'active',
    owner: 'engineering',
    stability: 'stable',
    last_reviewed_at: '2026-03-27'
  });

  fs.mkdirSync(path.join(pluginsRoot, 'shared-docs'), { recursive: true });
  fs.writeFileSync(path.join(pluginsRoot, 'shared-docs', 'context7-usage-guide.md'), '# Shared docs\n');

  const inventory = collectPluginInventory(repoRoot);

  assert.equal(inventory.plugins.length, 1);
  assert.deepEqual(
    inventory.plugins.map((plugin) => plugin.dirName),
    ['opspal-core']
  );
});
