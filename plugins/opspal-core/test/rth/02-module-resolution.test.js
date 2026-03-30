#!/usr/bin/env node
'use strict';

/**
 * RTH Test 02: Module Resolution
 *
 * Verifies that critical require() paths resolve to existing modules.
 */

const assert = require('assert');
const path = require('path');

const CORE_LIB = path.resolve(__dirname, '../../scripts/lib');

const REQUIRED_MODULES = [
  'bluf-generator',
  'bluf-summary-generator',
  'bluf-data-extractor',
  'hook-event-normalizer',
  'routing-state-manager',
  'canonical-routing-registry',
  'agent-tool-registry'
];

let passed = 0;
let failed = 0;

for (const mod of REQUIRED_MODULES) {
  const modulePath = path.join(CORE_LIB, mod);
  try {
    require.resolve(modulePath);
    passed++;
  } catch (e) {
    console.error(`FAIL: Module "${mod}" not resolvable at ${modulePath}`);
    failed++;
  }
}

console.log(`Module Resolution: ${passed} passed, ${failed} failed (${REQUIRED_MODULES.length} modules checked)`);
assert.strictEqual(failed, 0, `${failed} module resolution failures detected`);
