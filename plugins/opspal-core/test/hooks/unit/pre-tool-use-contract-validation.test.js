#!/usr/bin/env node

/**
 * Unit Tests for pre-tool-use-contract-validation.sh
 *
 * Validates tool input contract checks and safe defaults.
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const path = require('path');
const assert = require('assert');
const fs = require('fs');
const os = require('os');

const { HookTester } = require('../runner');

// =============================================================================
// Test Configuration
// =============================================================================

const HOOK_PATH = 'plugins/opspal-core/hooks/pre-tool-use-contract-validation.sh';
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');
const PLUGIN_ROOT = path.join(PROJECT_ROOT, 'plugins/opspal-core');
const { sanitizeSessionKey } = require(path.join(PLUGIN_ROOT, 'scripts/lib/routing-state-manager.js'));
const HARDENED_CHANNEL_ID = 'C0AGVQFDB18';

// =============================================================================
// Test Helpers
// =============================================================================

function createTester() {
  return new HookTester(HOOK_PATH, {
    timeout: 15000,
    verbose: process.env.VERBOSE === '1'
  });
}

function createTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-home-'));
}

function getRoutingStatePath(home, sessionId) {
  return path.join(home, '.claude', 'routing-state', `${sanitizeSessionKey(sessionId)}.json`);
}

function writeRoutingState(home, sessionId, state) {
  const filePath = getRoutingStatePath(home, sessionId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function assertNoStructuredDeny(result, message) {
  assert(
    result.output == null || (typeof result.output === 'object' && Object.keys(result.output).length === 0),
    message
  );
}

function assertStructuredRoutingDeny(result, reasonFragment, message) {
  assert.strictEqual(result.exitCode, 0, `${message} should use structured deny semantics`);
  assert.strictEqual(
    result.output?.hookSpecificOutput?.permissionDecision,
    'deny',
    `${message} should deny tool execution`
  );
  assert(
    (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes(reasonFragment),
    `${message} should mention ${reasonFragment}`
  );
}

function withHardenedChannel(input) {
  return {
    ...input,
    context: {
      ...(input.context || {}),
      channelId: HARDENED_CHANNEL_ID
    }
  };
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

// =============================================================================
// Tests
// =============================================================================

async function runAllTests() {
  console.log('\n[Tests] pre-tool-use-contract-validation.sh Tests\n');

  const tester = createTester();
  const results = [];
  const tempHome = createTempHome();
  const tempLogRoot = path.join(tempHome, '.claude/logs');

  // Test 1: Hook validation
  results.push(await runTest('Hook exists and is valid', async () => {
    const validation = tester.validate();
    assert(validation.exists, 'Hook file should exist');
    assert(validation.executable, 'Hook should be executable');
    assert(validation.syntaxValid, 'Hook should have valid bash syntax');
  }));

  // Test 2: Handles missing tool name gracefully
  results.push(await runTest('Handles missing tool name gracefully', async () => {
    const result = await tester.run({
      input: {},
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op envelope');
    assert(
      result.stderr.includes('Could not determine tool name'),
      'Should warn about missing tool name'
    );
  }));

  // Test 3: Basic tool input does not block
  results.push(await runTest('Allows basic tool input without blocking', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'echo "hello"' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        TOOL_CONTRACT_BLOCK_ON_VIOLATION: 'false'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with 0');
    assert.strictEqual(result.parseError, null, 'Should emit valid JSON');
    assert.deepStrictEqual(result.output, {}, 'Should emit a JSON no-op envelope');
  }));

  results.push(await runTest('Denies operational tools while routing requirement is pending', async () => {
    const sessionId = 'pending-route-session';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'reports-dashboards',
      action: 'BLOCKED',
      recommended_agent: 'opspal-salesforce:sfdc-reports-dashboards',
      clearance_agents: ['opspal-salesforce:sfdc-reports-dashboards'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        sessionKey: sessionId,
        tool_input: { command: 'echo "try direct execution"' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Structured deny should keep exit code 0');
    assert.strictEqual(
      result.output?.hookSpecificOutput?.permissionDecision,
      'deny',
      'Pending routing state should deny operational direct execution'
    );
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('ROUTING_REQUIRED_BEFORE_OPERATION'),
      'Should explain the pending routing requirement'
    );
  }));

  results.push(await runTest('Allows read-only tools while routing requirement is pending', async () => {
    const sessionId = 'pending-readonly-session';
    const tempReadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-read-allow-'));
    fs.writeFileSync(path.join(tempReadRoot, 'README.md'), '# fixture\n', 'utf8');
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'reports-dashboards',
      action: 'BLOCKED',
      recommended_agent: 'opspal-salesforce:sfdc-reports-dashboards',
      clearance_agents: ['opspal-salesforce:sfdc-reports-dashboards'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Read',
          sessionKey: sessionId,
          cwd: tempReadRoot,
          tool_input: { file_path: 'README.md' }
        },
        env: {
          CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
          HOME: tempHome,
          CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
          CLAUDE_SESSION_ID: sessionId
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Read-only tools should still pass');
      assertNoStructuredDeny(result, 'Read-only tool should not be denied');
    } finally {
      fs.rmSync(tempReadRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Denies missing Read targets with structured JSON', async () => {
    const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-read-missing-'));
    try {
      const result = await tester.run({
        input: {
          tool_name: 'Read',
          cwd: missingRoot,
          tool_input: { file_path: 'missing.txt' }
        },
        env: {
          CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
          HOME: tempHome,
          CLAUDE_HOOK_LOG_ROOT: tempLogRoot
        }
      });

      assertStructuredRoutingDeny(result, 'READ_TARGET_NOT_FOUND', 'Missing read target');
    } finally {
      fs.rmSync(missingRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Denies directory Read targets with structured JSON', async () => {
    const directoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-read-directory-'));
    const flowsDir = path.join(directoryRoot, 'flows');
    fs.mkdirSync(flowsDir, { recursive: true });

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Read',
          cwd: directoryRoot,
          tool_input: { file_path: 'flows' }
        },
        env: {
          CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
          HOME: tempHome,
          CLAUDE_HOOK_LOG_ROOT: tempLogRoot
        }
      });

      assertStructuredRoutingDeny(result, 'READ_TARGET_IS_DIRECTORY', 'Directory read target');
    } finally {
      fs.rmSync(directoryRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows absolute Read targets that exist', async () => {
    const absoluteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-read-absolute-'));
    const absoluteFile = path.join(absoluteRoot, 'existing.txt');
    fs.writeFileSync(absoluteFile, 'fixture\n', 'utf8');

    try {
      const result = await tester.run({
        input: {
          tool_name: 'Read',
          tool_input: { file_path: absoluteFile }
        },
        env: {
          CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
          HOME: tempHome,
          CLAUDE_HOOK_LOG_ROOT: tempLogRoot
        }
      });

      assert.strictEqual(result.exitCode, 0, 'Absolute read target should pass');
      assertNoStructuredDeny(result, 'Absolute read target should not be denied');
    } finally {
      fs.rmSync(absoluteRoot, { recursive: true, force: true });
    }
  }));

  results.push(await runTest('Allows read-only Slack MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-slack-session';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'intake-required',
      action: 'BLOCKED',
      recommended_agent: 'opspal-core:intelligent-intake-orchestrator',
      clearance_agents: ['opspal-core:intelligent-intake-orchestrator'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool_name: 'mcp__slack__conversations_replies',
        sessionKey: sessionId,
        tool_input: { channel_id: 'C123', thread_ts: '1773673563.161709' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Read-only Slack MCP tools should still pass');
    assertNoStructuredDeny(result, 'Read-only Slack MCP tool should not be denied');
  }));

  results.push(await runTest('Does not enforce stale recommended routing state as a pending block', async () => {
    const sessionId = 'pending-recommended-session';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'permission-maintenance',
      action: 'RECOMMENDED',
      recommended_agent: 'opspal-salesforce:sfdc-permission-orchestrator',
      clearance_agents: ['opspal-salesforce:sfdc-permission-orchestrator'],
      blocked: false,
      enforced_block: false,
      mandatory: false,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool: 'Bash',
        sessionKey: sessionId,
        input: { command: 'echo "recommended route stays advisory"' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId,
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Recommended routing state should not deny execution');
    assertNoStructuredDeny(result, 'Recommended routing state should stay advisory');
  }));

  results.push(await runTest('Skips pending-route denial when routing state is bypassed', async () => {
    const sessionId = 'bypassed-route-session';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'reports-dashboards',
      action: 'BLOCKED',
      recommended_agent: 'opspal-salesforce:sfdc-reports-dashboards',
      clearance_agents: ['opspal-salesforce:sfdc-reports-dashboards'],
      blocked: true,
      status: 'bypassed',
      override_applied: true,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool: 'Bash',
        sessionKey: sessionId,
        input: { command: 'echo "direct execution allowed after bypass"' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId,
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Bypassed state should not deny execution');
    assertNoStructuredDeny(result, 'Bypassed routing state should not emit deny JSON');
  }));

  results.push(await runTest('Continues when preferred log root is not writable', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: { command: 'echo "fallback-log-test"' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: '/proc/1/forbidden-log-root'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should continue when falling back to /tmp logs');
  }));

  // Test 4: Blocks direct permission/security write workflows
  results.push(await runTest('Blocks direct Salesforce permission writes', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data create record --sobject PermissionSetAssignment --values "AssigneeId=005xx PermissionSetId=0PSxx"'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Direct permission writes');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-security-admin'),
      'Should recommend the mandatory permission/security agent'
    );
  }));

  // Test 5: Allows permission writes when already inside approved agent
  results.push(await runTest('Allows permission writes for approved permission agents', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data update record --sobject PermissionSetAssignment --values "Id=0PaXX PermissionSetId=0PSxx"'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-security-admin'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should allow execution for approved agents');
  }));

  // Test 6: Blocks direct Lead/Contact/Account upsert-import workflows
  results.push(await runTest('Blocks direct core object upsert workflows', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data upsert bulk --sobject Account --file ./accounts.csv'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Direct core object upsert workflows');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-upsert-orchestrator'),
      'Should recommend the upsert orchestrator'
    );
  }));

  // Test 7: Blocks direct core object query workflows
  results.push(await runTest('Blocks direct core object data queries', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data query --query "SELECT Id FROM Account WHERE OwnerId != null LIMIT 10" --target-org prod'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Direct core object data queries');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-data-operations'),
      'Should recommend data-operations/query specialist agents'
    );
  }));

  // Test 8: Allows core object queries for approved data/query agents
  results.push(await runTest('Allows core object data queries for approved agents', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data query --query "SELECT Id FROM Account WHERE OwnerId != null LIMIT 10" --target-org prod'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-data-operations'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should allow query execution for approved agents');
  }));

  // Test 9: Blocks direct territory write workflows
  results.push(await runTest('Blocks oversized SOQL query commands that risk HTTP 431', async () => {
    const idList = Array.from({ length: 260 }, (_, i) => `'001000000000${String(i).padStart(3, '0')}'`).join(',');
    const command = `sf data query --query "SELECT Id FROM Opportunity WHERE AccountId IN (${idList})" --target-org prod`;
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: { command }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Oversized SOQL query risk');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-bulkops-orchestrator'),
      'Should route oversized query workflows to bulkops/query specialist'
    );
  }));

  results.push(await runTest('Allows oversized SOQL query for approved bulk/query agents', async () => {
    const idList = Array.from({ length: 260 }, (_, i) => `'001000000000${String(i).padStart(3, '0')}'`).join(',');
    const command = `sf data query --query "SELECT Id FROM Opportunity WHERE AccountId IN (${idList})" --target-org prod`;
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: { command }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-bulkops-orchestrator'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Approved bulk/query agents should bypass oversized query block');
  }));

  // Test 11: Blocks direct territory write workflows
  results.push(await runTest('Blocks direct territory model write workflows', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data update record --sobject Territory2Model --values "Id=0M0xx State=Active"'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Direct territory model writes');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-territory-orchestrator'),
      'Should recommend the territory orchestrator'
    );
  }));

  // Test 12: Blocks direct validation rule write workflows
  results.push(await runTest('Blocks direct validation rule write workflows', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data update record --sobject ValidationRule --values "Id=01Qxx Active=true"'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Direct validation rule writes');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('validation-rule-orchestrator'),
      'Should recommend the validation-rule orchestrator'
    );
  }));

  // Test 13: Writes reflection candidate log for blocked routing attempts
  results.push(await runTest('Captures routing reflection candidates on block', async () => {
    const reflectionLog = path.join(tempHome, '.claude/logs/routing-reflection-candidates.jsonl');

    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data create record --sobject PermissionSetAssignment --values "AssigneeId=005xx PermissionSetId=0PSxx"'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        ROUTING_REFLECTION_ON_BLOCK: '1'
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Reflection candidate block');
    assert(fs.existsSync(reflectionLog), 'Routing reflection candidate log should exist');

    const lines = fs.readFileSync(reflectionLog, 'utf8')
      .split('\n')
      .filter(Boolean);
    assert(lines.length > 0, 'Routing reflection candidate log should contain events');

    const lastEvent = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(lastEvent.decision, 'block', 'Last routing event should be a block');
    assert.strictEqual(lastEvent.rule_id, 'sf_permission_security_write', 'Should classify block under permission/security rule');
  }));

  // Test 14: Blocks inline secret literals in Bash commands
  results.push(await runTest('Blocks inline secret literals', async () => {
    const result = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        input: {
          command: 'ASANA_TOKEN=2/1234567890123456:supersecret curl -s https://app.asana.com/api/1.0/users/me'
        }
      }),
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assert.strictEqual(result.exitCode, 2, 'Should block inline secret literals');
    assert(
      result.stderr.includes('Inline secret literal detected'),
      'Should emit inline secret guardrail message'
    );
  }));

  // Test 15: Blocks broad filesystem credential discovery patterns
  results.push(await runTest('Blocks broad credential discovery scans', async () => {
    const result = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        input: {
          command: 'find /home/chris -name "*.env" 2>/dev/null | xargs grep -l "ASANA"'
        }
      }),
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assert.strictEqual(result.exitCode, 2, 'Should block broad credential discovery');
    assert(
      result.stderr.includes('Broad credential discovery pattern detected'),
      'Should emit broad scan guardrail message'
    );
  }));

  results.push(await runTest('Skips Bash budget when hardened channel metadata is absent', async () => {
    const env = {
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      HOME: tempHome,
      CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
      OPSPAL_BASH_BUDGET_MAX_REPEATS: '1',
      OPSPAL_BASH_BUDGET_MAX_COMMANDS: '1',
      OPSPAL_BASH_BUDGET_WINDOW_SECONDS: '600'
    };

    const first = await tester.run({
      input: {
        tool: 'Bash',
        sessionKey: 'session-no-channel-budget',
        input: { command: 'echo "one"' }
      },
      env
    });
    assert.strictEqual(first.exitCode, 0, 'First command should pass without hardening channel metadata');

    const second = await tester.run({
      input: {
        tool: 'Bash',
        sessionKey: 'session-no-channel-budget',
        input: { command: 'echo "two"' }
      },
      env
    });
    assert.strictEqual(second.exitCode, 0, 'Budget should not apply when hardening channel metadata is absent');
  }));

  // Test 16: Enforces loop budget across repeated commands in same hardened session
  results.push(await runTest('Blocks repeated command loops by budget', async () => {
    const env = {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        OPSPAL_BASH_BUDGET_MAX_REPEATS: '1',
        OPSPAL_BASH_BUDGET_MAX_COMMANDS: '10',
        OPSPAL_BASH_BUDGET_WINDOW_SECONDS: '600'
      };

    const first = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-loop-test',
        input: { command: 'echo "loop-check"' }
      }),
      env
    });
    assert.strictEqual(first.exitCode, 0, 'First command should pass');

    const second = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-loop-test',
        input: { command: 'echo "loop-check"' }
      }),
      env
    });
    assert.strictEqual(second.exitCode, 2, 'Second repeated command should be blocked');
    assert(
      second.stderr.includes('Repeated command pattern detected'),
      'Should emit repeated command guardrail message'
    );
  }));

  results.push(await runTest('Blocks aggregate Bash volume in hardened sessions', async () => {
    const env = {
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      HOME: tempHome,
      CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
      OPSPAL_BASH_BUDGET_MAX_REPEATS: '10',
      OPSPAL_BASH_BUDGET_MAX_COMMANDS: '2',
      OPSPAL_BASH_BUDGET_WINDOW_SECONDS: '600'
    };

    const first = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-count-budget',
        input: { command: 'echo "first"' }
      }),
      env
    });
    assert.strictEqual(first.exitCode, 0, 'First command should pass');

    const second = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-count-budget',
        input: { command: 'echo "second"' }
      }),
      env
    });
    assert.strictEqual(second.exitCode, 0, 'Second command should pass');

    const third = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-count-budget',
        input: { command: 'echo "third"' }
      }),
      env
    });
    assert.strictEqual(third.exitCode, 2, 'Third command should exceed the aggregate Bash budget');
    assert(
      third.stderr.includes('Bash command budget exceeded'),
      'Should emit the aggregate Bash budget message'
    );
  }));

  results.push(await runTest('Partitions Bash budget by agent within the same session', async () => {
    const baseEnv = {
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      HOME: tempHome,
      CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
      OPSPAL_BASH_BUDGET_MAX_REPEATS: '10',
      OPSPAL_BASH_BUDGET_MAX_COMMANDS: '1',
      OPSPAL_BASH_BUDGET_WINDOW_SECONDS: '600'
    };

    const agentOneFirst = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-parallel-agents',
        input: { command: 'echo "agent-one"' }
      }),
      env: {
        ...baseEnv,
        CLAUDE_AGENT_NAME: 'opspal-core:pdf-generator'
      }
    });
    assert.strictEqual(agentOneFirst.exitCode, 0, 'First command for agent one should pass');

    const agentTwoFirst = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-parallel-agents',
        input: { command: 'echo "agent-two"' }
      }),
      env: {
        ...baseEnv,
        CLAUDE_AGENT_NAME: 'opspal-core:google-slides-generator'
      }
    });
    assert.strictEqual(agentTwoFirst.exitCode, 0, 'First command for agent two should use an independent budget bucket');

    const agentOneSecond = await tester.run({
      input: withHardenedChannel({
        tool: 'Bash',
        sessionKey: 'session-parallel-agents',
        input: { command: 'echo "agent-one-second"' }
      }),
      env: {
        ...baseEnv,
        CLAUDE_AGENT_NAME: 'opspal-core:pdf-generator'
      }
    });
    assert.strictEqual(agentOneSecond.exitCode, 2, 'Second command for agent one should exceed only its own budget bucket');
    assert(
      agentOneSecond.stderr.includes('Bash command budget exceeded'),
      'Should emit the aggregate Bash budget message for the over-budget agent'
    );
  }));

  results.push(await runTest('Allows read-only Salesforce MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-salesforce-read-mcp';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'data-operations',
      action: 'BLOCKED',
      recommended_agent: 'opspal-salesforce:sfdc-data-operations',
      clearance_agents: ['opspal-salesforce:sfdc-data-operations'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool: 'mcp_salesforce_data_query',
        sessionKey: sessionId,
        input: { query: 'SELECT Id FROM Account LIMIT 5' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Read-only Salesforce MCP tool should pass');
    assertNoStructuredDeny(result, 'Read-only Salesforce MCP tool should not be denied');
  }));

  results.push(await runTest('Denies mutating Salesforce MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-salesforce-write-mcp';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'data-operations',
      action: 'BLOCKED',
      recommended_agent: 'opspal-salesforce:sfdc-data-operations',
      clearance_agents: ['opspal-salesforce:sfdc-data-operations'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool: 'mcp_salesforce_data_update',
        sessionKey: sessionId,
        input: { sobject: 'Account', values: { Id: '001xx', Name: 'Updated' } }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_REQUIRED_BEFORE_OPERATION', 'Mutating Salesforce MCP tool');
  }));

  results.push(await runTest('Allows read-only Marketo MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-marketo-read-mcp';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'lead-quality',
      action: 'BLOCKED',
      recommended_agent: 'opspal-marketo:marketo-lead-quality-assessor',
      clearance_agents: ['opspal-marketo:marketo-lead-quality-assessor'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool: 'mcp__marketo__campaign_get',
        sessionKey: sessionId,
        input: { campaignId: 123 }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Read-only Marketo MCP tool should pass');
    assertNoStructuredDeny(result, 'Read-only Marketo MCP tool should not be denied');
  }));

  results.push(await runTest('Denies mutating Marketo MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-marketo-write-mcp';
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'lead-quality',
      action: 'BLOCKED',
      recommended_agent: 'opspal-marketo:marketo-lead-quality-assessor',
      clearance_agents: ['opspal-marketo:marketo-lead-quality-assessor'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool: 'mcp__marketo__lead_update',
        sessionKey: sessionId,
        input: { leads: [{ id: 1, leadStatus: 'MQL' }] }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_REQUIRED_BEFORE_OPERATION', 'Mutating Marketo MCP tool');
  }));

  results.push(await runTest('Unknown MCP tools default to deny while routing requirement is pending and log fallback telemetry', async () => {
    const sessionId = 'pending-unknown-mcp';
    const policyLog = path.join(tempHome, '.claude/logs/mcp-tool-policy.jsonl');
    writeRoutingState(tempHome, sessionId, {
      session_key: sessionId,
      route_id: 'reports-dashboards',
      action: 'BLOCKED',
      recommended_agent: 'opspal-salesforce:sfdc-reports-dashboards',
      clearance_agents: ['opspal-salesforce:sfdc-reports-dashboards'],
      blocked: true,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 600
    });

    const result = await tester.run({
      input: {
        tool: 'mcp__playwright__browser_click',
        sessionKey: sessionId,
        input: { selector: '#save' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_REQUIRED_BEFORE_OPERATION', 'Unknown MCP tool fallback');
    assert(
      (result.output?.hookSpecificOutput?.additionalContext || '').includes('not yet explicitly classified'),
      'Unknown MCP fallback should explain registry default deny behavior'
    );
    assert(fs.existsSync(policyLog), 'Unknown MCP fallback should write policy telemetry');

    const lines = fs.readFileSync(policyLog, 'utf8').split('\n').filter(Boolean);
    const lastEvent = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(lastEvent.eventType, 'unknown_mcp_policy_fallback', 'Should log unknown MCP fallback event');
    assert.strictEqual(lastEvent.tool, 'mcp__playwright__browser_click', 'Should log the unknown tool name');
  }));

  // Test 17: Redacts secrets from routing logs
  results.push(await runTest('Redacts secret literals in routing logs', async () => {
    const routingLog = path.join(tempHome, '.claude/logs/routing-enforcement.jsonl');
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data create record --sobject PermissionSetAssignment --values "AssigneeId=005xx PermissionSetId=0PSxx" && curl -H "Authorization: Bearer $ASANA_TOKEN" https://example.com'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Routing-event redaction block');
    assert(fs.existsSync(routingLog), 'Routing enforcement log should exist');

    const lines = fs.readFileSync(routingLog, 'utf8').split('\n').filter(Boolean);
    const lastEvent = JSON.parse(lines[lines.length - 1]);
    assert(
      typeof lastEvent.command === 'string' && lastEvent.command.includes('[REDACTED]'),
      'Routing log command should be redacted'
    );
    assert(
      !lastEvent.command.includes('Bearer $ASANA_TOKEN'),
      'Routing log should not contain raw bearer value reference'
    );
  }));

  // Cleanup
  fs.rmSync(tempHome, { recursive: true, force: true });

  // Summary
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
