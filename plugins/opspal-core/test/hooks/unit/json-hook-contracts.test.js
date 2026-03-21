#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { HookTester } = require('../runner');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const CORE_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const HUBSPOT_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-hubspot');
const GTM_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-gtm-planning');
const OKR_PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-okrs');
const PRE_TASK_GRAPH_TRIGGER = path.join(PROJECT_ROOT, 'plugins/opspal-core/hooks/pre-task-graph-trigger.sh');

function createTester(hookPath) {
  return new HookTester(hookPath, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function assertJsonStdout(result, message) {
  assert.strictEqual(result.exitCode, 0, `${message} should exit with 0`);
  assert.strictEqual(result.parseError, null, `${message} should emit parseable JSON`);
  assert(result.stdout.trim().startsWith('{'), `${message} should emit JSON on stdout`);
}

async function runTest(name, testFn) {
  process.stdout.write(`  ${name}... `);
  try {
    await testFn();
    console.log('OK');
    return { passed: true, name };
  } catch (error) {
    console.log('FAIL');
    console.log(`    Error: ${error.message}`);
    return { passed: false, name, error: error.message };
  }
}

async function runAllTests() {
  console.log('\n[Tests] json hook contracts\n');

  const results = [];

  results.push(await runTest('pre-task-graph-trigger emits JSON on disabled no-op', async () => {
    const result = spawnSync('bash', [PRE_TASK_GRAPH_TRIGGER, 'Complex migration planning task'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TASK_GRAPH_ENABLED: '0'
      }
    });

    assert.strictEqual(result.status, 0, 'Hook should exit with 0');
    assert(result.stdout.trim().startsWith('{'), 'Hook should emit JSON on stdout');
    assert.doesNotThrow(() => JSON.parse(result.stdout), 'Hook stdout should parse as JSON');
  }));

  const hookCases = [
    {
      name: 'subagent-start-context emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/subagent-start-context.sh',
      input: { hook_event_name: 'SubagentStart' }
    },
    {
      name: 'pre-stop-org-verification emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/pre-stop-org-verification.sh',
      input: { stop_response: 'Short response for skip.' }
    },
    {
      name: 'task-scope-selector emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/task-scope-selector.sh',
      input: {}
    },
    {
      name: 'routing-context-refresher emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/routing-context-refresher.sh',
      input: {
        hook_event_name: 'UserPromptSubmit',
        message: 'Audit Salesforce flow deployment blockers in staging.'
      },
      env: {
        ROUTING_REFRESH_INTERVAL: '0'
      }
    },
    {
      name: 'session-end emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/session-end.sh',
      input: {},
      env: {
        SKIP_SCRATCHPAD: '1',
        SKIP_CLEANUP: '1'
      }
    },
    {
      name: 'session-end-reliability emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/session-end-reliability.sh',
      input: {},
      env: {
        ENABLE_AUTO_RELIABILITY: '0'
      }
    },
    {
      name: 'stop-session-silent-failure-summary emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/stop-session-silent-failure-summary.sh',
      input: { hook_event_name: 'Stop' }
    },
    {
      name: 'pre-tool-use-contract-validation emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh',
      input: {}
    },
    {
      name: 'pre-operation-data-validator emits JSON no-op',
      hookPath: 'plugins/opspal-core/hooks/pre-operation-data-validator.sh',
      input: {
        tool_name: 'Read',
        tool_input: {
          file_path: 'README.md'
        }
      }
    },
    {
      name: 'permission-request-handler emits JSON pass-through no-op',
      hookPath: 'plugins/opspal-core/hooks/permission-request-handler.sh',
      input: {
        tool_name: 'Write',
        tool_input: {
          file_path: 'notes.txt'
        }
      }
    },
    {
      name: 'permission-request-handler emits JSON allow for safe reads',
      hookPath: 'plugins/opspal-core/hooks/permission-request-handler.sh',
      input: {
        tool_name: 'Read',
        tool_input: {
          file_path: 'README.md'
        }
      },
      assertResult(result) {
        assertJsonStdout(result, 'permission-request-handler emits JSON allow for safe reads');
        assert.strictEqual(
          result.output?.hookSpecificOutput?.decision?.behavior,
          'allow',
          'safe read permission requests should auto-allow'
        );
      }
    },
    {
      name: 'hubspot universal-agent-governance emits JSON no-op',
      hookPath: 'plugins/opspal-hubspot/hooks/universal-agent-governance.sh',
      input: {
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'opspal-hubspot:hubspot-contact-manager',
          prompt: 'Review contact associations and summarize findings'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: HUBSPOT_PLUGIN_ROOT
      }
    },
    {
      name: 'hubspot pre-task-agent-validator emits JSON no-op',
      hookPath: 'plugins/opspal-hubspot/hooks/pre-task-agent-validator.sh',
      input: {
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'opspal-hubspot:hubspot-contact-manager'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: HUBSPOT_PLUGIN_ROOT
      }
    },
    {
      name: 'hubspot pre-task-mandatory emits JSON no-op',
      hookPath: 'plugins/opspal-hubspot/hooks/pre-task-mandatory.sh',
      input: {
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'opspal-hubspot:hubspot-contact-manager',
          prompt: 'Review contact associations and summarize findings'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: HUBSPOT_PLUGIN_ROOT
      }
    },
    {
      name: 'hubspot pre-write-path-validator emits JSON no-op',
      hookPath: 'plugins/opspal-hubspot/hooks/pre-write-path-validator.sh',
      input: {},
      env: {
        CLAUDE_PLUGIN_ROOT: HUBSPOT_PLUGIN_ROOT,
        WRITE_FILE_PATH: 'plugins/opspal-hubspot/scripts/example.js'
      }
    },
    {
      name: 'hubspot pre-property-write-validation emits JSON no-op',
      hookPath: 'plugins/opspal-hubspot/hooks/pre-property-write-validation.sh',
      input: {},
      env: {
        TOOL_NAME: 'hubspot_create'
      }
    },
    {
      name: 'gtm approval gate emits JSON no-op',
      hookPath: 'plugins/opspal-gtm-planning/hooks/pre-task-gtm-approval-gate.sh',
      input: {
        tool_name: 'Agent',
        tool_input: {
          subagent_type: 'opspal-gtm-planning:gtm-strategy-planner'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: GTM_PLUGIN_ROOT
      }
    },
    {
      name: 'gtm write path validator emits JSON no-op',
      hookPath: 'plugins/opspal-gtm-planning/hooks/pre-write-gtm-path-validator.sh',
      input: {}
    },
    {
      name: 'okr write path validator emits JSON no-op',
      hookPath: 'plugins/opspal-okrs/hooks/pre-write-okr-path-validator.sh',
      input: {},
      env: {
        CLAUDE_PLUGIN_ROOT: OKR_PLUGIN_ROOT
      }
    }
  ];

  for (const hookCase of hookCases) {
    results.push(await runTest(hookCase.name, async () => {
      const tester = createTester(hookCase.hookPath);
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'json-hook-contract-'));

      try {
        const result = await tester.run({
          input: hookCase.input,
          env: {
            HOME: home,
            CLAUDE_PLUGIN_ROOT: CORE_PLUGIN_ROOT,
            ...(hookCase.env || {})
          }
        });

        if (typeof hookCase.assertResult === 'function') {
          hookCase.assertResult(result);
        } else {
          assertJsonStdout(result, hookCase.name);
        }
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    }));
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
