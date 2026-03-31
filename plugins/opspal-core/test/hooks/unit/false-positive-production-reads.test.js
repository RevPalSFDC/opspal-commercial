#!/usr/bin/env node

/**
 * False Positive Production Read Tests
 *
 * Guards against governance hooks being overly broad by testing that legitimate
 * read-only operations across Salesforce, HubSpot, and Marketo are NEVER blocked.
 *
 * Every test must result in exit 0 with NO deny output from the relevant hook.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

const HOOKS = {
  sfDispatcher: 'plugins/opspal-salesforce/hooks/pre-bash-dispatcher.sh',
  hubspotCurl: 'plugins/opspal-hubspot/hooks/pre-bash-hubspot-api.sh',
  marketoCurl: 'plugins/opspal-marketo/hooks/pre-bash-marketo-api.sh'
};

function createTester(hookKey) {
  return new HookTester(HOOKS[hookKey], { timeout: 15000 });
}

function hookExists(hookKey) {
  const hookPath = HOOKS[hookKey];
  const fullPath = path.isAbsolute(hookPath)
    ? hookPath
    : path.join(PROJECT_ROOT, hookPath);
  return fs.existsSync(fullPath);
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

function assertNotDenied(result, message) {
  assert.strictEqual(result.exitCode, 0, `${message} — should exit 0`);

  // Check for structured deny
  if (result.output && typeof result.output === 'object' && result.output.hookSpecificOutput) {
    const decision = result.output.hookSpecificOutput.permissionDecision;
    assert.notStrictEqual(decision, 'deny',
      `${message} — must NOT receive permissionDecision:deny, got reason: ${result.output.hookSpecificOutput.permissionDecisionReason || 'none'}`);
  }
}

// Env that simulates parent context (no agent context), which is the most restrictive
const PARENT_CONTEXT_ENV = {
  HOOK_TEST_MODE: '1'
};

async function runAllTests() {
  console.log('\n[Tests] False Positive Production Read Tests\n');

  const results = [];

  // =========================================================================
  // Salesforce — Production reads that must NEVER be blocked
  // =========================================================================

  if (hookExists('sfDispatcher')) {
    const sfTester = createTester('sfDispatcher');

    results.push(await runTest('FP-SF-01: SOQL query on production', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sf data query --query "SELECT Id, Name, AnnualRevenue FROM Opportunity WHERE IsClosed=false" --target-org acme-prod --json'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Production SOQL query');
    }));

    results.push(await runTest('FP-SF-02: Metadata describe on production', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sf sobject describe Account --target-org acme-prod --json'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Metadata describe');
    }));

    results.push(await runTest('FP-SF-03: Tooling API query on production', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sf data query --query "SELECT Id FROM FlowDefinitionView WHERE DeveloperName=\'Lead_Router\'" --use-tooling-api --target-org acme-prod'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Tooling API query');
    }));

    results.push(await runTest('FP-SF-04: Org display on production', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sf org display --target-org acme-prod --json'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Org display');
    }));

    results.push(await runTest('FP-SF-05: sfdx legacy read on production', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sfdx force:data:soql:query -q "SELECT Id FROM Account LIMIT 10" -u acme-prod --json'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'sfdx legacy query');
    }));

    results.push(await runTest('FP-SF-06: Apex tail log (debug)', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sf apex tail log --target-org acme-prod'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Apex tail log');
    }));

    results.push(await runTest('FP-SF-07: Sobject list on production', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'sf sobject list --target-org acme-prod --json'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Sobject list');
    }));

    results.push(await runTest('FP-SF-08: Non-SF command passes through', async () => {
      const result = await sfTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'echo "hello world"'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Non-SF echo command');
    }));
  }

  // =========================================================================
  // HubSpot — Production reads that must NEVER be blocked
  // =========================================================================

  if (hookExists('hubspotCurl')) {
    const hsTester = createTester('hubspotCurl');

    results.push(await runTest('FP-HS-01: GET single contact', async () => {
      const result = await hsTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s https://api.hubapi.com/crm/v3/objects/contacts/123 -H "Authorization: Bearer $TOKEN"'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'HubSpot GET contact');
    }));

    results.push(await runTest('FP-HS-02: POST to /search (read-only)', async () => {
      const result = await hsTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/search -d '{"filterGroups":[]}'`
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'HubSpot search POST');
    }));

    results.push(await runTest('FP-HS-03: POST to /batch/read (read-only)', async () => {
      const result = await hsTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X POST https://api.hubapi.com/crm/v3/objects/contacts/batch/read -d '{"inputs":[{"id":"123"}]}'`
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'HubSpot batch/read POST');
    }));

    results.push(await runTest('FP-HS-04: Non-HubSpot curl passes through', async () => {
      const result = await hsTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s https://api.github.com/repos/test/test'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Non-HubSpot curl');
    }));

    results.push(await runTest('FP-HS-05: Non-curl command passes through', async () => {
      const result = await hsTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'echo "testing"'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Non-curl echo command');
    }));
  }

  // =========================================================================
  // Marketo — Production reads that must NEVER be blocked
  // =========================================================================

  if (hookExists('marketoCurl')) {
    const mkTester = createTester('marketoCurl');

    results.push(await runTest('FP-MK-01: GET lead query', async () => {
      const result = await mkTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s "https://123-ABC-456.mktorest.com/rest/v1/leads.json?filterType=email&filterValues=test@test.com"'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Marketo GET lead query');
    }));

    results.push(await runTest('FP-MK-02: GET bulk export status', async () => {
      const result = await mkTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s https://123-ABC-456.mktorest.com/bulk/v1/leads/export/abc123/status.json'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Marketo GET bulk export status');
    }));

    results.push(await runTest('FP-MK-03: GET campaign list', async () => {
      const result = await mkTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s "https://123-ABC-456.mktorest.com/rest/v1/campaigns.json"'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Marketo GET campaign list');
    }));

    results.push(await runTest('FP-MK-04: Non-Marketo curl passes through', async () => {
      const result = await mkTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'curl -s https://api.stripe.com/v1/charges'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Non-Marketo curl');
    }));

    results.push(await runTest('FP-MK-05: Non-curl command passes through', async () => {
      const result = await mkTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: 'ls -la'
          }
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Non-curl ls command');
    }));
  }

  // =========================================================================
  // Cross-platform: Mutation in sub-agent context must NOT be blocked
  // =========================================================================

  if (hookExists('hubspotCurl')) {
    const hsTester = createTester('hubspotCurl');

    results.push(await runTest('FP-XP-01: HubSpot mutation in sub-agent context allowed', async () => {
      const result = await hsTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X PATCH https://api.hubapi.com/crm/v3/objects/contacts/123 -d '{"properties":{"lifecyclestage":"customer"}}'`
          },
          agent_type: 'opspal-hubspot:hubspot-contact-manager'
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'HubSpot mutation in sub-agent context');
    }));
  }

  if (hookExists('marketoCurl')) {
    const mkTester = createTester('marketoCurl');

    results.push(await runTest('FP-XP-02: Marketo mutation in sub-agent context allowed', async () => {
      const result = await mkTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X POST https://123-ABC-456.mktorest.com/rest/v1/leads.json -d '{"input":[{"email":"new@test.com"}]}'`
          },
          agent_type: 'opspal-marketo:marketo-lead-manager'
        },
        env: PARENT_CONTEXT_ENV
      });
      assertNotDenied(result, 'Marketo mutation in sub-agent context');
    }));
  }

  if (hookExists('hubspotCurl')) {
    const hsTester = createTester('hubspotCurl');

    results.push(await runTest('FP-XP-03: HubSpot mutation with CLAUDE_TASK_ID allowed', async () => {
      const result = await hsTester.run({
        input: {
          tool_name: 'Bash',
          tool_input: {
            command: `curl -s -X DELETE https://api.hubapi.com/crm/v3/objects/contacts/123`
          }
        },
        env: {
          ...PARENT_CONTEXT_ENV,
          CLAUDE_TASK_ID: 'task-abc-123'
        }
      });
      assertNotDenied(result, 'HubSpot mutation with CLAUDE_TASK_ID');
    }));
  }

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
