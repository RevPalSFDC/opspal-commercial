#!/usr/bin/env node

/**
 * HubSpot Production Governance Tests
 *
 * Tests that production environment detection is wired into the HubSpot curl
 * governance hook and correctly blocks production mutations from parent context.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = 'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh';

function hookExists() {
  return fs.existsSync(path.join(PROJECT_ROOT, HOOK_PATH));
}

function createTester() {
  return new HookTester(HOOK_PATH, { timeout: 15000 });
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (e) {
    console.log('FAIL');
    console.log(`    Error: ${e.message}`);
    return { passed: false, name, error: e.message };
  }
}

function assertDenied(result, message) {
  assert.strictEqual(result.exitCode, 0, `${message} — should exit 0`);
  assert(result.output && result.output.hookSpecificOutput,
    `${message} — should have hookSpecificOutput`);
  assert.strictEqual(result.output.hookSpecificOutput.permissionDecision, 'deny',
    `${message} — should deny`);
}

function assertNotDenied(result, message) {
  assert.strictEqual(result.exitCode, 0, `${message} — should exit 0`);
  if (result.output && typeof result.output === 'object' && result.output.hookSpecificOutput) {
    const decision = result.output.hookSpecificOutput.permissionDecision;
    assert.notStrictEqual(decision, 'deny',
      `${message} — must NOT deny`);
  }
}

async function runAllTests() {
  console.log('\n[Tests] HubSpot Production Governance\n');

  if (!hookExists()) {
    console.log('  SKIP: HubSpot curl hook not found');
    process.exit(0);
  }

  const results = [];
  const tester = createTester();

  // =========================================================================
  // Production mutations from parent context — MUST be denied
  // =========================================================================

  results.push(await runTest('HSPROD-01: Production mutation denied (portal ID in production list)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts -d '{"properties":{"email":"new@test.com"}}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_PORTAL_ID: '99999',
        HUBSPOT_PRODUCTION_PORTAL_IDS: '99999,88888',
        HUBSPOT_SANDBOX_PORTAL_IDS: '11111'
      }
    });
    assertDenied(result, 'Production portal mutation from parent context');
    assert(result.output.hookSpecificOutput.permissionDecisionReason.includes('PRODUCTION_GOVERNANCE'),
      'Reason should mention PRODUCTION_GOVERNANCE');
  }));

  results.push(await runTest('HSPROD-02: Production mutation denied (HUBSPOT_ENVIRONMENT=production)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{"properties":{"lifecyclestage":"customer"}}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'production'
      }
    });
    assertDenied(result, 'HUBSPOT_ENVIRONMENT=production mutation');
    assert(result.output.hookSpecificOutput.permissionDecisionReason.includes('PRODUCTION_GOVERNANCE'),
      'Reason should mention PRODUCTION_GOVERNANCE');
  }));

  results.push(await runTest('HSPROD-03: Production DELETE denied', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'curl -s -X DELETE https://api.hubapi.com/crm/v3/objects/contacts/123'
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'production'
      }
    });
    assertDenied(result, 'Production DELETE');
  }));

  // =========================================================================
  // Production reads — MUST be allowed
  // =========================================================================

  results.push(await runTest('HSPROD-04: Production GET still allowed', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'curl -s https://api.hubapi.com/crm/v3/objects/contacts/123'
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'production'
      }
    });
    assertNotDenied(result, 'Production GET must be allowed');
  }));

  results.push(await runTest('HSPROD-05: Production search POST still allowed', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/search -d '{"filterGroups":[]}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'production'
      }
    });
    assertNotDenied(result, 'Production search must be allowed');
  }));

  // =========================================================================
  // Sub-agent context — mutations allowed even in production
  // =========================================================================

  results.push(await runTest('HSPROD-06: Production mutation allowed from sub-agent (agent_type)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts -d '{"properties":{}}'`
        },
        agent_type: 'opspal-hubspot:hubspot-contact-manager'
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'production'
      }
    });
    assertNotDenied(result, 'Production mutation from sub-agent must be allowed');
  }));

  results.push(await runTest('HSPROD-07: Production mutation allowed with CLAUDE_TASK_ID', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{"properties":{}}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'production',
        CLAUDE_TASK_ID: 'task-sub-123'
      }
    });
    assertNotDenied(result, 'Production mutation with CLAUDE_TASK_ID must be allowed');
  }));

  // =========================================================================
  // Sandbox / unknown environment — existing behavior preserved
  // =========================================================================

  results.push(await runTest('HSPROD-08: Sandbox mutation still denied from parent (existing behavior)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts -d '{"properties":{}}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'sandbox'
      }
    });
    assertDenied(result, 'Sandbox mutation from parent still denied (existing behavior)');
    assert(result.output.hookSpecificOutput.permissionDecisionReason.includes('ROUTING_SPECIALIST_REQUIRED'),
      'Sandbox deny should use ROUTING_SPECIALIST_REQUIRED, not PRODUCTION_GOVERNANCE');
  }));

  results.push(await runTest('HSPROD-09: Unknown environment mutation denied from parent (existing behavior)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts -d '{"properties":{}}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1'
        // No HUBSPOT_ENVIRONMENT set — unknown
      }
    });
    assertDenied(result, 'Unknown env mutation from parent still denied (existing behavior)');
    assert(result.output.hookSpecificOutput.permissionDecisionReason.includes('ROUTING_SPECIALIST_REQUIRED'),
      'Unknown env deny should use ROUTING_SPECIALIST_REQUIRED');
  }));

  results.push(await runTest('HSPROD-10: Sandbox mutation allowed from sub-agent (no regression)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts -d '{"properties":{}}'`
        },
        agent_type: 'opspal-hubspot:hubspot-contact-manager'
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'sandbox'
      }
    });
    assertNotDenied(result, 'Sandbox sub-agent mutation must be allowed');
  }));

  // =========================================================================
  // Governance disabled — all mutations pass
  // =========================================================================

  results.push(await runTest('HSPROD-11: Governance disabled allows production mutation', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X DELETE https://api.hubapi.com/crm/v3/objects/contacts/123`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        HUBSPOT_ENVIRONMENT: 'production',
        HUBSPOT_BASH_API_GOVERNANCE_ENABLED: 'false'
      }
    });
    assertNotDenied(result, 'Governance disabled should allow everything');
  }));

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
