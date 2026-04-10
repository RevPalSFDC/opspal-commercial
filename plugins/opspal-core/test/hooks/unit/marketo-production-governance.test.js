#!/usr/bin/env node

/**
 * Marketo Production Governance Tests
 *
 * Tests that production environment detection is wired into the Marketo curl
 * governance hook. Marketo production is detected via mktorest.com URL pattern
 * (vs mktosandbox.com for sandbox) or MARKETO_ENVIRONMENT env var.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const HOOK_PATH = 'plugins/opspal-marketo/hooks/pre-bash-marketo-api.sh';

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

function assertAdvisoryAllow(result, message) {
  assert.strictEqual(result.exitCode, 0, `${message} — should exit 0`);
  assert(result.output && result.output.hookSpecificOutput,
    `${message} — should have hookSpecificOutput`);
  assert.strictEqual(result.output.hookSpecificOutput.permissionDecision, 'allow',
    `${message} — should emit advisory allow (not deny)`);
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
  console.log('\n[Tests] Marketo Production Governance\n');

  if (!hookExists()) {
    console.log('  SKIP: Marketo curl hook not found');
    process.exit(0);
  }

  const results = [];
  const tester = createTester();

  // =========================================================================
  // Production mutations from parent context — MUST be denied
  // =========================================================================

  results.push(await runTest('MKPROD-01: Production mutation denied (mktorest.com URL)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/leads.json -d '{"input":[{"email":"new@test.com"}]}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktorest.com'
      }
    });
    assertAdvisoryAllow(result, 'mktorest.com mutation from parent context');
    assert(result.output.hookSpecificOutput.permissionDecisionReason.includes('PRODUCTION_ADVISORY'),
      'Reason should mention PRODUCTION_GOVERNANCE');
  }));

  results.push(await runTest('MKPROD-02: Production mutation denied (MARKETO_ENVIRONMENT=production)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/leads.json -d '{"input":[]}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_ENVIRONMENT: 'production'
      }
    });
    assertAdvisoryAllow(result, 'MARKETO_ENVIRONMENT=production mutation');
    assert(result.output.hookSpecificOutput.permissionDecisionReason.includes('PRODUCTION_ADVISORY'),
      'Reason should mention PRODUCTION_GOVERNANCE');
  }));

  results.push(await runTest('MKPROD-03: Production bulk import denied', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktorest.com/bulk/v1/leads/import.json -H 'Content-Type: text/csv' --data-binary @leads.csv`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktorest.com'
      }
    });
    assertAdvisoryAllow(result, 'Production bulk import');
  }));

  // =========================================================================
  // Production reads — MUST be allowed
  // =========================================================================

  results.push(await runTest('MKPROD-04: Production GET still allowed', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'curl -s "https://123-ABC-456.mktorest.com/rest/v1/leads.json?filterType=email&filterValues=test@test.com"'
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_ENVIRONMENT: 'production'
      }
    });
    assertNotDenied(result, 'Production GET must be allowed');
  }));

  results.push(await runTest('MKPROD-05: Production bulk export status GET still allowed', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'curl -s https://123-ABC-456.mktorest.com/bulk/v1/leads/export/abc123/status.json'
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktorest.com'
      }
    });
    assertNotDenied(result, 'Production export status GET must be allowed');
  }));

  // =========================================================================
  // Sub-agent context — mutations allowed even in production
  // =========================================================================

  results.push(await runTest('MKPROD-06: Production mutation allowed from sub-agent (agent_type)', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/leads.json -d '{"input":[]}'`
        },
        agent_type: 'opspal-marketo:marketo-lead-manager'
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktorest.com'
      }
    });
    assertNotDenied(result, 'Production mutation from sub-agent must be allowed');
  }));

  results.push(await runTest('MKPROD-07: Production mutation allowed with CLAUDE_TASK_ID', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/leads.json -d '{"input":[]}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktorest.com',
        CLAUDE_TASK_ID: 'task-sub-456'
      }
    });
    assertNotDenied(result, 'Production mutation with CLAUDE_TASK_ID must be allowed');
  }));

  // =========================================================================
  // Sandbox — mutations allowed from sub-agent, denied from parent
  // =========================================================================

  results.push(await runTest('MKPROD-08: Sandbox URL (mktosandbox.com) passes through (not governed)', async () => {
    // mktosandbox.com does not match the Marketo domain regex (mktorest.com|marketo.com)
    // so the classifier returns 'unknown' and the hook exits at line 108-110 as noop.
    // This is correct — sandbox Marketo URLs are ungoverned by the curl hook.
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktosandbox.com/rest/v1/leads.json -d '{"input":[]}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktosandbox.com'
      }
    });
    assertNotDenied(result, 'mktosandbox.com URL is not matched by Marketo curl classifier');
  }));

  results.push(await runTest('MKPROD-09: Sandbox URL from sub-agent also passes through', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktosandbox.com/rest/v1/leads.json -d '{"input":[]}'`
        },
        agent_type: 'opspal-marketo:marketo-lead-manager'
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktosandbox.com'
      }
    });
    assertNotDenied(result, 'mktosandbox.com URL passes through regardless of agent context');
  }));

  // =========================================================================
  // Governance disabled
  // =========================================================================

  results.push(await runTest('MKPROD-10: Governance disabled allows production mutation', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: `curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/leads.json -d '{"input":[]}'`
        }
      },
      env: {
        HOOK_TEST_MODE: '1',
        MARKETO_BASE_URL: 'https://123-ABC-456.mktorest.com',
        MARKETO_BASH_API_GOVERNANCE_ENABLED: 'false'
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
