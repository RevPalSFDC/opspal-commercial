'use strict';

/**
 * Contract test: routing hooks must be advisory-only.
 *
 * A routing hook may suggest specialist agents, log routing decisions,
 * or emit additionalContext — but it must NEVER:
 *  - exit with code 2 (which Claude Code treats as a hard block),
 *  - emit `"decision": "block"` or `"decision": "deny"` on PreToolUse,
 *  - emit `"permissionDecision": "deny"`,
 *  - emit `"continue": false` with a stopReason.
 *
 * Regression lock for reflection 9e6373b8 (2026-04-13).
 * Memory: feedback_routing_advisory.md (2026-04-01 P1-9 remediation).
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Routing hooks under contract.
// Each entry: { plugin, file, event }
// Paths are relative to the plugins/ directory.
// ---------------------------------------------------------------------------
const ROUTING_HOOKS = [
  // Core: primary UserPromptSubmit routing engine (called by dispatcher)
  { plugin: 'opspal-core', file: 'hooks/unified-router.sh', event: 'UserPromptSubmit' },
  // Core: dispatcher that orchestrates UPS child hooks (registers at UPS)
  { plugin: 'opspal-core', file: 'hooks/user-prompt-dispatcher.sh', event: 'UserPromptSubmit' },
  // Salesforce: PreToolUse dispatcher (wraps deploy/soql/jq sub-hooks)
  { plugin: 'opspal-salesforce', file: 'hooks/pre-bash-dispatcher.sh', event: 'PreToolUse' },
  // HubSpot: PreToolUse advisory routing for high-risk Agent calls
  { plugin: 'opspal-hubspot', file: 'hooks/pre-task-mandatory.sh', event: 'PreToolUse' },
];

// ---------------------------------------------------------------------------
// Probe prompts: cover routing scenarios that historically caused hard blocks
// ---------------------------------------------------------------------------
const PROBE_PROMPTS = [
  'diagnose a flow for me',
  'deploy this permission set to staging',
  'run sf data query against prod',
  'audit revops pipeline',
  'upsert contacts from csv',
  'create a cpq assessment',
  'write a script to parse logs',
  'what is this file?',
  'delete workflow in hubspot',
  'bulk update contacts in production',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildInputPayload(prompt, event) {
  return JSON.stringify({
    session_id: 'test-session-routing-advisory',
    transcript_path: '/tmp/transcript.json',
    cwd: process.cwd(),
    hook_event_name: event,
    prompt,
    user_message: prompt,
    tool_name: event === 'PreToolUse' ? 'Agent' : undefined,
    tool_input: event === 'PreToolUse'
      ? { subagent_type: 'test-agent', prompt }
      : undefined,
  });
}

function runHook(hookPath, event, prompt) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execFileSync('bash', [hookPath], {
      input: buildInputPayload(prompt, event),
      env: {
        ...process.env,
        // Advisory-only defaults — match documented production default values
        CLAUDE_HOOK_EVENT: event,
        DISPATCHER_CONTEXT: '1',         // allow child hooks to run in dispatcher mode
        ENABLE_COMPLEXITY_HARD_BLOCKING: '0',
        ENABLE_AGENT_BLOCKING: '0',
        USER_PROMPT_MANDATORY_HARD_BLOCKING: '0',
        ENABLE_INTAKE_HARD_BLOCKING: '0',
        ENABLE_HARD_BLOCKING: '0',
        SKIP_AGENT_BLOCKING: '1',         // bypass any remaining blocking path
        ROUTING_VERBOSE: '0',
        HOME: process.env.HOME || '/tmp',
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 20000,
    });
  } catch (e) {
    exitCode = e.status === null || e.status === undefined ? 1 : e.status;
    stdout = (e.stdout || '').toString();
    stderr = (e.stderr || '').toString();
  }

  return { stdout, stderr, exitCode };
}

// ---------------------------------------------------------------------------
// Contract assertion
// ---------------------------------------------------------------------------

function assertAdvisory(result, hookFile, prompt) {
  const { stdout, stderr, exitCode } = result;
  const combined = stdout + stderr;

  // Rule 1: Must not exit 2 (Claude Code hard-blocks on exit 2)
  expect(exitCode).not.toBe(2);

  // Rule 2: Must not contain a "deny" or "block" decision in output
  expect(combined).not.toMatch(/"decision"\s*:\s*"(block|deny)"/);

  // Rule 3: Must not deny tool execution via permissionDecision
  expect(combined).not.toMatch(/"permissionDecision"\s*:\s*"deny"/);

  // Rule 4: Must not set continue:false with a stopReason
  expect(combined).not.toMatch(/"continue"\s*:\s*false/);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Routing hooks contract: advisory-only, never block', () => {
  // __dirname = .../opspal-commercial/plugins/opspal-core/test/hooks/integration
  // Go up to opspal-commercial/, then into plugins/
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const pluginsRoot = path.join(repoRoot, 'plugins');

  // Build test matrix: all hooks × all prompts
  const testCases = ROUTING_HOOKS.flatMap(({ plugin, file, event }) =>
    PROBE_PROMPTS.map(prompt => ({
      plugin,
      file,
      event,
      prompt,
      hookPath: path.join(pluginsRoot, plugin, file),
    }))
  );

  // Verify all hook files exist before running (fail fast with a clear message)
  beforeAll(() => {
    const missing = ROUTING_HOOKS.filter(({ plugin, file }) =>
      !fs.existsSync(path.join(pluginsRoot, plugin, file))
    );
    if (missing.length > 0) {
      throw new Error(
        `Routing hooks registered in ROUTING_HOOKS not found on disk:\n` +
        missing.map(h => `  plugins/${h.plugin}/${h.file}`).join('\n')
      );
    }
  });

  test.each(testCases)(
    '$plugin/$file ($event) with "$prompt" stays advisory',
    ({ hookPath, event, prompt, plugin, file }) => {
      const result = runHook(hookPath, event, prompt);
      assertAdvisory(result, `${plugin}/${file}`, prompt);
    }
  );
});
