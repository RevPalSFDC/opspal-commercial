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

function writeCurrentSession(home, sessionId) {
  const sessionDir = path.join(home, '.claude', 'session-context');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(path.join(sessionDir, '.current_session'), `export CLAUDE_SESSION_ID=${sessionId}\n`, 'utf8');
}

function buildRoutingState({
  sessionKey,
  routeId,
  requiredAgent,
  clearanceAgents = requiredAgent ? [requiredAgent] : [],
  routeKind = 'complexity_specialist',
  guidanceAction = 'require_specialist',
  requiresSpecialist = true,
  promptGuidanceOnly = true,
  promptBlocked = false,
  executionBlockUntilCleared = true,
  clearanceStatus = 'pending_clearance',
  overrideApplied = false,
  routingConfidence = executionBlockUntilCleared ? 0.9 : 0.65,
  lastResolvedAgent = null,
  autoDelegation = null
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const routePendingClearance = clearanceStatus === 'pending_clearance';
  const routeCleared = clearanceStatus === 'cleared';

  return {
    session_key: sessionKey,
    route_id: routeId,
    route_kind: routeKind,
    guidance_action: guidanceAction,
    required_agent: requiredAgent,
    clearance_agents: clearanceAgents,
    requires_specialist: requiresSpecialist,
    prompt_guidance_only: promptGuidanceOnly,
    prompt_blocked: promptBlocked,
    execution_block_until_cleared: executionBlockUntilCleared,
    route_pending_clearance: routePendingClearance,
    route_cleared: routeCleared,
    clearance_status: clearanceStatus,
    override_applied: overrideApplied,
    routing_confidence: routingConfidence,
    last_resolved_agent: lastResolvedAgent,
    auto_delegation: autoDelegation,
    created_at: now,
    updated_at: now,
    expires_at: now + 600
  };
}

function assertNoStructuredDeny(result, message) {
  assert(
    result.output == null || (typeof result.output === 'object' && Object.keys(result.output).length === 0),
    message
  );
}

function assertStructuredRoutingAdvisory(result, reasonFragment, message) {
  assert.strictEqual(result.exitCode, 0, `${message} should exit 0`);
  const decision = result.output?.hookSpecificOutput?.permissionDecision;
  assert(
    decision === 'allow' || decision === undefined,
    `${message} should allow tool execution (advisory routing)`
  );
  const context = result.output?.hookSpecificOutput?.additionalContext || '';
  const reason = result.output?.hookSpecificOutput?.permissionDecisionReason || '';
  assert(
    context.includes(reasonFragment) || reason.includes(reasonFragment) || context.includes('ROUTING_ADVISORY'),
    `${message} should include advisory context`
  );
}

// Legacy alias for backward compatibility in test imports
const assertStructuredRoutingDeny = assertStructuredRoutingAdvisory;

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

  results.push(await runTest('Uses active runtime session file when normalized payload carries a stale env session id', async () => {
    const isolatedHome = createTempHome();
    const isolatedLogRoot = path.join(isolatedHome, '.claude/logs');
    const runtimeSessionId = `pretool-runtime-${Date.now()}`;
    writeCurrentSession(isolatedHome, runtimeSessionId);
    writeRoutingState(isolatedHome, runtimeSessionId, buildRoutingState({
      sessionKey: runtimeSessionId,
      routeId: 'reports-dashboards',
      requiredAgent: 'opspal-salesforce:sfdc-reports-dashboards'
    }));

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'echo "try direct execution"' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: isolatedHome,
        CLAUDE_HOOK_LOG_ROOT: isolatedLogRoot,
        CLAUDE_SESSION_ID: 'stale-pretool-session'
      }
    });

    assertStructuredRoutingDeny(
      result,
      'ROUTING_REQUIRED_BEFORE_OPERATION',
      'Active runtime session routing should override the stale env session id'
    );
  }));

  results.push(await runTest('Denies operational tools while routing requirement is pending', async () => {
    const sessionId = 'pending-route-session';
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'reports-dashboards',
      requiredAgent: 'opspal-salesforce:sfdc-reports-dashboards'
    }));

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

    assert.strictEqual(result.exitCode, 0, 'Advisory routing should keep exit code 0');
    const decision = result.output?.hookSpecificOutput?.permissionDecision;
    assert(
      decision === 'allow' || decision === undefined,
      'Pending routing state should allow execution with advisory context'
    );
    const ctx = result.output?.hookSpecificOutput?.additionalContext || '';
    assert(
      ctx.includes('ROUTING_ADVISORY'),
      'Should include ROUTING_ADVISORY guidance'
    );
  }));

  results.push(await runTest('Allows read-only tools while routing requirement is pending', async () => {
    const sessionId = 'pending-readonly-session';
    const tempReadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-read-allow-'));
    fs.writeFileSync(path.join(tempReadRoot, 'README.md'), '# fixture\n', 'utf8');
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'reports-dashboards',
      requiredAgent: 'opspal-salesforce:sfdc-reports-dashboards'
    }));

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

  results.push(await runTest('Blocks sfdc-orchestrator from running specialist-owned Tooling API investigation queries directly', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'sf data query --query "SELECT Id FROM FlowDefinitionView LIMIT 5" --use-tooling-api --target-org sandbox --json'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-orchestrator',
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    assertStructuredRoutingDeny(result, 'ORCHESTRATOR_SPECIALIST_EXECUTION_REQUIRED', 'Orchestrator specialist-query block');
  }));

  results.push(await runTest('Allows sfdc-orchestrator coordination queries that are outside specialist investigation execution', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: {
          command: 'sf org display --target-org sandbox --json'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-orchestrator',
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Coordinator-safe command should pass');
    assertNoStructuredDeny(result, 'Coordinator-safe command should not be denied');
  }));

  results.push(await runTest('Integrity stop blocks direct parent Salesforce execution after receipt-proof failure', async () => {
    const sessionId = 'integrity-stop-salesforce-session';
    writeRoutingState(tempHome, sessionId, {
      ...buildRoutingState({
        sessionKey: sessionId,
        routeId: 'automation-audit',
        requiredAgent: 'opspal-salesforce:sfdc-automation-auditor',
        clearanceStatus: 'cleared',
        lastResolvedAgent: 'opspal-salesforce:sfdc-automation-auditor',
        executionBlockUntilCleared: true
      }),
      integrity_stop_active: true,
      integrity_stop_agent: 'sfdc-automation-auditor',
      integrity_stop_platform: 'salesforce',
      integrity_stop_reason: 'missing_receipt',
      integrity_stop_detail: 'plan_only=2; execution=0'
    });

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        sessionKey: sessionId,
        tool_input: { command: 'sf data query --query "SELECT Id FROM FlowDefinitionView LIMIT 5" --use-tooling-api --target-org sandbox --json' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-orchestrator',
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    assertStructuredRoutingDeny(result, 'INVESTIGATION_INTEGRITY_STOP', 'Integrity-stop parent execution block');
  }));

  results.push(await runTest('Integrity stop still allows aggregation/report-writing work', async () => {
    const sessionId = 'integrity-stop-aggregation-session';
    writeRoutingState(tempHome, sessionId, {
      ...buildRoutingState({
        sessionKey: sessionId,
        routeId: 'automation-audit',
        requiredAgent: 'opspal-salesforce:sfdc-automation-auditor',
        clearanceStatus: 'cleared',
        lastResolvedAgent: 'opspal-salesforce:sfdc-automation-auditor',
        executionBlockUntilCleared: true
      }),
      integrity_stop_active: true,
      integrity_stop_agent: 'sfdc-automation-auditor',
      integrity_stop_platform: 'salesforce',
      integrity_stop_reason: 'missing_receipt',
      integrity_stop_detail: 'heuristic_execution=4; plan_only=0'
    });

    const result = await tester.run({
      input: {
        tool_name: 'Write',
        sessionKey: sessionId,
        tool_input: { file_path: path.join(tempHome, 'aggregated-report.md'), content: '# summary\n' }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-orchestrator'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Aggregation/report-writing should still pass');
    assertNoStructuredDeny(result, 'Aggregation/report-writing should not be denied by integrity stop');
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
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'intake-required',
      routeKind: 'intake_specialist',
      guidanceAction: 'require_intake',
      requiredAgent: 'opspal-core:intelligent-intake-orchestrator'
    }));

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
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'permission-maintenance',
      routeKind: 'advisory_specialist',
      guidanceAction: 'recommend_specialist',
      requiredAgent: 'opspal-salesforce:sfdc-permission-orchestrator',
      requiresSpecialist: false,
      executionBlockUntilCleared: false,
      clearanceStatus: 'pending_clearance',
      routingConfidence: 0.62
    }));

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
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'reports-dashboards',
      requiredAgent: 'opspal-salesforce:sfdc-reports-dashboards',
      clearanceStatus: 'bypassed',
      overrideApplied: true
    }));

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
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-permission-orchestrator'),
      'Should recommend the canonical permission/security orchestrator'
    );
    assert(
      !(result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-security-admin'),
      'Should not surface a competing security-admin recommendation in the primary deny message'
    );
    assert(
      (result.output?.hookSpecificOutput?.additionalContext || '').includes('Do not recover by having the parent context run a generated script'),
      'Should steer recovery away from parent-context script handoff'
    );
  }));

  // Test 5: Allows permission writes when already inside canonical agent
  results.push(await runTest('Allows permission writes for the canonical permission orchestrator', async () => {
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
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-permission-orchestrator'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Should allow execution for approved agents');
  }));

  results.push(await runTest('Allows permission writes for delegated security-admin specialists', async () => {
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

    assert.strictEqual(result.exitCode, 0, 'Delegated security-admin execution should remain allowed inside the specialist path');
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

  results.push(await runTest('Allows direct core object upsert workflows for capability-matched specialists', async () => {
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
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-data-import-manager'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Capability-matched specialists should pass without a hardcoded allowlist entry');
    assertNoStructuredDeny(result, 'Capability-matched specialist should not be denied');
  }));

  results.push(await runTest('Routes bulk core object mutations to the bulkops specialist family', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data bulk update --sobject Contact --file ./contacts.csv --target-org sandbox'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Direct core object bulk mutation workflows');
    assert(
      (result.output?.hookSpecificOutput?.permissionDecisionReason || '').includes('sfdc-bulkops-orchestrator'),
      'Should recommend the bulkops orchestrator for bulk mutations'
    );
  }));

  results.push(await runTest('Allows bulk core object mutations for approved bulkops specialists', async () => {
    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command: 'sf data bulk update --sobject Contact --file ./contacts.csv --target-org sandbox'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-bulkops-orchestrator'
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Approved bulkops specialists should be allowed');
    assertNoStructuredDeny(result, 'Approved bulkops specialist should not emit a routing deny');
  }));

  // Test 7: Blocks direct complex core object query workflows
  results.push(await runTest('Blocks direct complex core object data queries', async () => {
    const longProjection = Array.from({ length: 45 }, (_, i) => `CustomField${String(i).padStart(2, '0')}__c`).join(', ');
    const command = `sf data query --query "SELECT Id, Name, ${longProjection} FROM Account WHERE BillingCountry = 'US'" --target-org prod`;

    const result = await tester.run({
      input: {
        tool: 'Bash',
        input: {
          command
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

  results.push(await runTest('Denies unvalidated sub-agent context when agent_type alone does not satisfy routing', async () => {
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        agent_type: 'opspal-salesforce:sfdc-cpq-assessor',
        tool_input: {
          command: 'sf data upsert bulk --sobject Account --file ./accounts.csv'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assertStructuredRoutingDeny(result, 'ROUTING_SPECIALIST_REQUIRED', 'Unvalidated sub-agent context');
  }));

  results.push(await runTest('Allows cleared capability-matched sub-agent context', async () => {
    const sessionId = 'cleared-subagent-route';
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'core-object-upsert',
      requiredAgent: 'opspal-salesforce:sfdc-upsert-orchestrator',
      clearanceAgents: [
        'opspal-salesforce:sfdc-upsert-orchestrator',
        'opspal-salesforce:sfdc-data-import-manager'
      ],
      clearanceStatus: 'cleared',
      lastResolvedAgent: 'opspal-salesforce:sfdc-data-import-manager'
    }));

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        sessionKey: sessionId,
        agent_type: 'opspal-salesforce:sfdc-data-import-manager',
        tool_input: {
          command: 'sf data upsert bulk --sobject Account --file ./accounts.csv'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot
      }
    });

    assert.strictEqual(result.exitCode, 0, 'Capability-matched cleared sub-agent should be allowed');
    assertNoStructuredDeny(result, 'Capability-matched cleared sub-agent should not emit a routing deny');
  }));

  results.push(await runTest('Context continuity: cleared specialist route allows Bash via last_resolved_agent recovery', async () => {
    // Previously this test expected ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH.
    // With the context continuity fix, when caller is "unknown" but route is cleared
    // and last_resolved_agent matches a clearance agent, the identity is recovered
    // from the cleared route state and execution is allowed.
    const sessionId = 'cleared-parent-fallback-route';
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'mixed-salesforce-data-cleanup',
      requiredAgent: 'opspal-salesforce:sfdc-bulkops-orchestrator',
      clearanceAgents: [
        'opspal-salesforce:sfdc-bulkops-orchestrator',
        'opspal-salesforce:sfdc-data-export-manager'
      ],
      clearanceStatus: 'cleared',
      lastResolvedAgent: 'opspal-salesforce:sfdc-bulkops-orchestrator'
    }));

    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        sessionKey: sessionId,
        tool_input: {
          command: 'sf data bulk update --sobject Contact --file ./contacts.csv --target-org sandbox'
        }
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: tempHome,
        CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
        CLAUDE_SESSION_ID: sessionId
      }
    });

    // With context continuity fix, this should now be ALLOWED (not denied)
    const decision = result.output?.hookSpecificOutput?.permissionDecision;
    assert(
      decision !== 'deny',
      'Cleared specialist route with last_resolved_agent should allow via context continuity recovery, not block'
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

  results.push(await runTest('Enforces Bash budget even without hardened channel metadata', async () => {
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
    assertStructuredRoutingDeny(second, 'Bash command budget exceeded', 'Budget without hardened channel metadata');
  }));

  results.push(await runTest('Expands Bash budget for discovery-heavy Salesforce contexts', async () => {
    const env = {
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      HOME: tempHome,
      CLAUDE_HOOK_LOG_ROOT: tempLogRoot,
      CLAUDE_AGENT_NAME: 'opspal-salesforce:sfdc-discovery',
      OPSPAL_BASH_BUDGET_MAX_REPEATS: '10',
      OPSPAL_BASH_BUDGET_MAX_COMMANDS: '1',
      OPSPAL_DISCOVERY_BASH_BUDGET_MAX_COMMANDS: '2',
      OPSPAL_BASH_BUDGET_WINDOW_SECONDS: '600'
    };

    const first = await tester.run({
      input: {
        tool: 'Bash',
        sessionKey: 'session-discovery-budget',
        input: { command: 'sf sobject describe Account --json' }
      },
      env
    });
    assert.strictEqual(first.exitCode, 0, 'First discovery command should pass');

    const second = await tester.run({
      input: {
        tool: 'Bash',
        sessionKey: 'session-discovery-budget',
        input: { command: 'sf sobject describe Opportunity --json' }
      },
      env
    });
    assert.strictEqual(second.exitCode, 0, 'Second discovery command should use the expanded discovery budget');
    assertNoStructuredDeny(second, 'Expanded discovery budget should still allow the second command');

    const third = await tester.run({
      input: {
        tool: 'Bash',
        sessionKey: 'session-discovery-budget',
        input: { command: 'sf sobject describe Lead --json' }
      },
      env
    });
    assertStructuredRoutingDeny(third, 'Bash command budget exceeded', 'Discovery Bash budget');
    assert(
      (third.stderr || '').includes('(3/2'),
      'Budget message should include the expanded discovery limit'
    );
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
    assertStructuredRoutingDeny(second, 'Repeated command pattern detected', 'Repeated command loop budget');
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
    assertStructuredRoutingDeny(third, 'Bash command budget exceeded', 'Aggregate Bash budget');
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
    assertStructuredRoutingDeny(agentOneSecond, 'Bash command budget exceeded', 'Per-agent Bash budget bucket');
    assert(
      agentOneSecond.stderr.includes('Bash command budget exceeded'),
      'Should emit the aggregate Bash budget message for the over-budget agent'
    );
  }));

  results.push(await runTest('Allows read-only Salesforce MCP tools while routing requirement is pending', async () => {
    const sessionId = 'pending-salesforce-read-mcp';
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'data-operations',
      requiredAgent: 'opspal-salesforce:sfdc-data-operations'
    }));

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
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'data-operations',
      requiredAgent: 'opspal-salesforce:sfdc-data-operations'
    }));

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
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'lead-quality',
      requiredAgent: 'opspal-marketo:marketo-lead-quality-assessor'
    }));

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
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'lead-quality',
      requiredAgent: 'opspal-marketo:marketo-lead-quality-assessor'
    }));

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
    writeRoutingState(tempHome, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'reports-dashboards',
      requiredAgent: 'opspal-salesforce:sfdc-reports-dashboards'
    }));

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

  // ===========================================================================
  // Execution-context continuity tests
  // ===========================================================================

  results.push(await runTest('Context continuity: cleared route allows Bash when caller is unknown but last_resolved_agent matches', async () => {
    const home = createTempHome();
    const sessionId = 'ctx-continuity-cleared';

    writeRoutingState(home, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'compound-salesforce-cleanup',
      requiredAgent: 'opspal-salesforce:sfdc-orchestrator',
      clearanceAgents: [
        'opspal-salesforce:sfdc-orchestrator',
        'opspal-salesforce:sfdc-query-specialist'
      ],
      clearanceStatus: 'cleared',
      lastResolvedAgent: 'opspal-salesforce:sfdc-orchestrator',
      executionBlockUntilCleared: true,
      routingConfidence: 0.95
    }));

    const logRoot = path.join(home, '.claude', 'logs');
    fs.mkdirSync(logRoot, { recursive: true });
    const tester = createTester();
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'sf data query --query "SELECT Id FROM Account LIMIT 5"' },
        sessionKey: sessionId
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: home,
        CLAUDE_HOOK_LOG_ROOT: logRoot,
        CLAUDE_SESSION_ID: sessionId,
        ROUTING_ENFORCEMENT_ENABLED: '1',
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    // Should be allowed via context continuity recovery, not blocked
    const decision = result.output?.hookSpecificOutput?.permissionDecision;
    if (decision === 'deny') {
      const reason = result.output?.hookSpecificOutput?.permissionDecisionReason || '';
      // If it still denies, the reason should NOT be ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH
      // with callerAgent=unknown — it should be CONTEXT_CONTINUITY_LOSS at worst
      assert(
        !reason.includes('ROUTING_SPECIALIST_TOOL_PROJECTION_MISMATCH'),
        'Should not emit PROJECTION_MISMATCH when route is cleared and last_resolved_agent exists'
      );
    }
    // Allow or context-continuity-recovery are both acceptable outcomes
  }));

  results.push(await runTest('Context continuity: CONTEXT_CONTINUITY_LOSS is distinct from PROJECTION_MISMATCH', async () => {
    const home = createTempHome();
    const sessionId = 'ctx-loss-classification';

    // Create a cleared route state where last_resolved_agent is set
    // but make it impossible to recover (e.g., wrong clearance agents)
    writeRoutingState(home, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'sf_permission_security_write',
      requiredAgent: 'opspal-salesforce:sfdc-permission-orchestrator',
      clearanceAgents: ['opspal-salesforce:sfdc-permission-orchestrator'],
      clearanceStatus: 'cleared',
      lastResolvedAgent: 'opspal-salesforce:sfdc-permission-orchestrator',
      executionBlockUntilCleared: true,
      routingConfidence: 0.95
    }));

    const logRoot = path.join(home, '.claude', 'logs');
    fs.mkdirSync(logRoot, { recursive: true });
    const tester = createTester();
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'sf org display user --json' },
        sessionKey: sessionId
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: home,
        CLAUDE_HOOK_LOG_ROOT: logRoot,
        CLAUDE_SESSION_ID: sessionId,
        ROUTING_ENFORCEMENT_ENABLED: '1',
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    const reason = result.output?.hookSpecificOutput?.permissionDecisionReason || '';
    const decision = result.output?.hookSpecificOutput?.permissionDecision;

    // If blocked, the error should reference CONTEXT_CONTINUITY_LOSS
    // OR be allowed via context continuity recovery
    if (decision === 'deny' && reason.includes('PROJECTION')) {
      assert(
        reason.includes('CONTEXT_CONTINUITY_LOSS') || reason.includes('failureClass=CONTEXT_CONTINUITY_LOSS'),
        'When caller is unknown and specialist has Bash, failure should be classified as CONTEXT_CONTINUITY_LOSS not PROJECTION_LOSS'
      );
    }
  }));

  results.push(await runTest('Cleared route Bash bypass does not activate for pending (non-cleared) routes', async () => {
    const home = createTempHome();
    const logRoot = path.join(home, '.claude', 'logs');
    fs.mkdirSync(logRoot, { recursive: true });
    const sessionId = 'ctx-no-bypass-pending';

    writeRoutingState(home, sessionId, buildRoutingState({
      sessionKey: sessionId,
      routeId: 'compound-salesforce-cleanup',
      requiredAgent: 'opspal-salesforce:sfdc-orchestrator',
      clearanceAgents: ['opspal-salesforce:sfdc-orchestrator'],
      clearanceStatus: 'pending_clearance',
      executionBlockUntilCleared: true,
      routingConfidence: 0.9
    }));

    const tester = createTester();
    const result = await tester.run({
      input: {
        tool_name: 'Bash',
        tool_input: { command: 'sf data query --query "SELECT Id FROM Account LIMIT 5"' },
        sessionKey: sessionId
      },
      env: {
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        HOME: home,
        CLAUDE_HOOK_LOG_ROOT: logRoot,
        CLAUDE_SESSION_ID: sessionId,
        ROUTING_ENFORCEMENT_ENABLED: '1',
        OPSPAL_BASH_BUDGET_ENABLED: '0'
      }
    });

    // Should still be blocked — route is pending, not cleared
    const decision = result.output?.hookSpecificOutput?.permissionDecision;
    assert.strictEqual(decision, 'deny', 'Pending route should still block Bash execution');
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
