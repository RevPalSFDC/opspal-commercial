#!/usr/bin/env node
'use strict';

/**
 * RTH Test 08: Routing Index Availability
 *
 * Verifies that critical routing configuration files exist and
 * parse as valid JSON.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CORE_PLUGIN = path.resolve(__dirname, '../..');
const CONFIG_DIR = path.join(CORE_PLUGIN, 'config');

const REQUIRED_CONFIGS = [
  'routing-patterns.json',
  'routable-agent-metadata.json'
];

let passed = 0;
let failed = 0;

for (const configFile of REQUIRED_CONFIGS) {
  const filePath = path.join(CONFIG_DIR, configFile);

  try {
    assert(fs.existsSync(filePath), `${configFile} does not exist at ${filePath}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    assert(parsed && typeof parsed === 'object', `${configFile} did not parse to an object`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    failed++;
  }
}

console.log(`Routing Index Availability: ${passed} passed, ${failed} failed (${REQUIRED_CONFIGS.length} configs checked)`);
assert.strictEqual(failed, 0, `${failed} routing index availability failures detected`);
