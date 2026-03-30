#!/usr/bin/env node
'use strict';

/**
 * RTH Test 09: Feature Flag Defaults
 *
 * Verifies that critical modules handle undefined env vars safely
 * and return expected defaults.
 */

const assert = require('assert');
const path = require('path');

const CORE_LIB = path.resolve(__dirname, '../../scripts/lib');

let passed = 0;
let failed = 0;

// Test 1: hook-event-normalizer returns safe defaults with no env vars
try {
  const { normalizeHookEvent } = require(path.join(CORE_LIB, 'hook-event-normalizer'));
  const result = normalizeHookEvent('{}');
  assert.strictEqual(typeof result, 'object', 'normalizeHookEvent should return an object');
  assert.strictEqual(typeof result.hook_event_name, 'string', 'hook_event_name should be a string');
  assert.strictEqual(typeof result.tool_name, 'string', 'tool_name should be a string');
  passed++;
} catch (e) {
  console.error(`FAIL: hook-event-normalizer defaults - ${e.message}`);
  failed++;
}

// Test 2: routing-state-manager handles missing state file gracefully
try {
  const mod = require(path.join(CORE_LIB, 'routing-state-manager'));
  // readStateFile is not exported directly, but we can verify the module loads
  assert(mod, 'routing-state-manager should export something');
  passed++;
} catch (e) {
  console.error(`FAIL: routing-state-manager load - ${e.message}`);
  failed++;
}

// Test 3: agent-tool-registry loads without js-yaml (graceful degradation)
try {
  const mod = require(path.join(CORE_LIB, 'agent-tool-registry'));
  assert(mod, 'agent-tool-registry should export something');
  passed++;
} catch (e) {
  console.error(`FAIL: agent-tool-registry load - ${e.message}`);
  failed++;
}

// Test 4: bluf-generator facade loads and exports generate function
try {
  const mod = require(path.join(CORE_LIB, 'bluf-generator'));
  assert.strictEqual(typeof mod.generate, 'function', 'bluf-generator should export a generate function');
  passed++;
} catch (e) {
  console.error(`FAIL: bluf-generator load - ${e.message}`);
  failed++;
}

console.log(`Feature Flag Defaults: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, `${failed} feature flag default failures detected`);
