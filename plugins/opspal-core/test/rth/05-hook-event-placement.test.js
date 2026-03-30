#!/usr/bin/env node
'use strict';

/**
 * RTH Test 05: Hook Event Placement
 *
 * Verifies that agent-specific SF hooks are registered under SubagentStop
 * (not Stop), preventing them from firing on every session end.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SF_HOOKS_JSON = path.resolve(__dirname,
  '../../../../plugins/opspal-salesforce/.claude-plugin/hooks.json');

const AGENT_SPECIFIC_MATCHERS = [
  'sfdc-discovery',
  'sfdc-state-discovery',
  'sfdc-revops-auditor',
  'sfdc-cpq-assessor',
  'sfdc-automation-auditor'
];

assert(fs.existsSync(SF_HOOKS_JSON), `Salesforce hooks.json not found at ${SF_HOOKS_JSON}`);

const content = JSON.parse(fs.readFileSync(SF_HOOKS_JSON, 'utf8'));
const hooks = content.hooks || content;

// These matchers should NOT be in Stop
const stopEntries = hooks.Stop || [];
for (const matcher of AGENT_SPECIFIC_MATCHERS) {
  const inStop = stopEntries.some(entry => entry.matcher === matcher);
  assert(!inStop,
    `Agent-specific matcher "${matcher}" is incorrectly placed in Stop event (should be SubagentStop)`);
}

// These matchers SHOULD be in SubagentStop
const subagentStopEntries = hooks.SubagentStop || [];
let passed = 0;
let failed = 0;

for (const matcher of AGENT_SPECIFIC_MATCHERS) {
  const inSubagentStop = subagentStopEntries.some(entry => entry.matcher === matcher);
  try {
    assert(inSubagentStop,
      `Agent-specific matcher "${matcher}" missing from SubagentStop event`);
    passed++;
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    failed++;
  }
}

console.log(`Hook Event Placement: ${passed} passed, ${failed} failed (${AGENT_SPECIFIC_MATCHERS.length} matchers checked)`);
assert.strictEqual(failed, 0, `${failed} hook event placement failures detected`);
