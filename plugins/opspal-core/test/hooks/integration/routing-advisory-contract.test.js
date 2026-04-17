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
 *
 * Spec-review follow-up on 55c9300 (2026-04-17):
 *  - Each hook now declares probeAgents so name-guards (e.g., HubSpot's
 *    early-exit when agent_name doesn't contain "hubspot") don't cause
 *    silent short-circuits that mask the advisory-only contract violation.
 *  - High-risk prompts added to PROBE_PROMPTS that reach keyword branches
 *    inside pre-task-mandatory.sh hooks, ensuring negative-control is valid.
 *  - opspal-salesforce/hooks/pre-task-mandatory.sh added to the contract.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Routing hooks under contract.
//
// Each entry:
//   plugin      — plugin directory name under plugins/
//   file        — hook path relative to the plugin root
//   event       — Claude Code hook event name
//   probeAgents — array of subagent_type strings to send in the payload.
//                 Use [null] when the hook does not filter by agent name
//                 (UserPromptSubmit hooks have no subagent_type; Bash hooks
//                 use tool_name rather than subagent_type).
//                 For hooks that do filter by agent name, provide at least
//                 one name that passes the name-guard so the routing logic
//                 is actually reached.
//
// Paths are relative to the plugins/ directory.
// ---------------------------------------------------------------------------
const ROUTING_HOOKS = [
  // Core: primary UserPromptSubmit routing engine (called by dispatcher)
  {
    plugin: 'opspal-core',
    file: 'hooks/unified-router.sh',
    event: 'UserPromptSubmit',
    probeAgents: [null],  // UserPromptSubmit — no subagent_type field
  },
  // Core: dispatcher that orchestrates UPS child hooks (registers at UPS)
  {
    plugin: 'opspal-core',
    file: 'hooks/user-prompt-dispatcher.sh',
    event: 'UserPromptSubmit',
    probeAgents: [null],  // UserPromptSubmit — no subagent_type field
  },
  // Salesforce: PreToolUse dispatcher (wraps deploy/soql/jq sub-hooks)
  // No agent-name guard — fires on Bash tool_name regardless of agent.
  {
    plugin: 'opspal-salesforce',
    file: 'hooks/pre-bash-dispatcher.sh',
    event: 'PreToolUse',
    probeAgents: [null],  // Bash event — tool_name: 'Bash'; no subagent_type
  },
  // HubSpot: PreToolUse advisory routing for high-risk Agent calls.
  // Early-exit guard at line ~101: only runs routing logic when agent name
  // contains "hubspot". Must probe with matching agent names to reach the
  // keyword-matching and permissionDecision paths.
  {
    plugin: 'opspal-hubspot',
    file: 'hooks/pre-task-mandatory.sh',
    event: 'PreToolUse',
    probeAgents: [
      'opspal-hubspot:hubspot-workflow-builder',
      'opspal-hubspot:hubspot-data-operations-manager',
    ],
  },
  // Salesforce: PreToolUse advisory routing for high-risk Agent calls.
  // Name-guard: only runs routing logic when agent name contains "sfdc"
  // or "salesforce". Currently NOT registered in hooks.json but is a
  // latent re-registration risk — contract-locking it prevents regression.
  {
    plugin: 'opspal-salesforce',
    file: 'hooks/pre-task-mandatory.sh',
    event: 'PreToolUse',
    probeAgents: [
      'opspal-salesforce:sfdc-deployment-manager',
      'opspal-salesforce:sfdc-data-operations',
    ],
  },
];

// ---------------------------------------------------------------------------
// Probe prompts: cover routing scenarios that historically caused hard blocks.
//
// Includes high-risk prompts that pass the keyword-matching branches inside
// pre-task-mandatory.sh hooks (HubSpot & Salesforce) so the negative-control
// check actually reaches the deny path in the pre-fix version.
// ---------------------------------------------------------------------------
const PROBE_PROMPTS = [
  // Generic / cross-hook prompts
  'diagnose a flow for me',
  'deploy this permission set to staging',
  'run sf data query against prod',
  'audit revops pipeline',
  'upsert contacts from csv',
  'create a cpq assessment',
  'write a script to parse logs',
  'what is this file?',
  // High-risk prompts that reach HubSpot pre-task-mandatory keyword branches
  'delete workflow 123',
  'bulk update contacts in production',
  'delete property email_opt_out',
  // High-risk prompts that reach Salesforce pre-task-mandatory keyword branches
  'deploy to production org',
  'bulk delete records in production',
  'bypass routing and force this',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the JSON payload that Claude Code sends to a hook via stdin.
 *
 * @param {string}      prompt    — the user prompt / task description
 * @param {string}      event     — hook event name
 * @param {string|null} agentName — subagent_type to include in tool_input,
 *                                  or null for UserPromptSubmit hooks
 */
function buildInputPayload(prompt, event, agentName) {
  const isPreToolUse = event === 'PreToolUse';

  // tool_name for HubSpot & SF pre-task-mandatory is 'Agent'
  // (hooks.json matcher: "Agent").
  // pre-bash-dispatcher uses 'Bash'.
  let toolName;
  if (isPreToolUse) {
    toolName = 'Agent';
  }

  return JSON.stringify({
    session_id: 'test-session-routing-advisory',
    transcript_path: '/tmp/transcript.json',
    cwd: process.cwd(),
    hook_event_name: event,
    prompt,
    user_message: prompt,
    tool_name: toolName,
    tool_input: isPreToolUse
      ? { subagent_type: agentName || 'test-agent', prompt }
      : undefined,
  });
}

function runHook(hookPath, event, prompt, agentName) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execFileSync('bash', [hookPath], {
      input: buildInputPayload(prompt, event, agentName),
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

function assertAdvisory(result, hookFile, prompt, agentName) {
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

  // Rule 5: Must not exit 1 with a hard-block message in output
  // (the pre-fix version of pre-task-mandatory.sh emitted "BLOCKED:" and exit 1)
  if (exitCode !== 0) {
    expect(combined).not.toMatch(/BLOCKED:/);
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Routing hooks contract: advisory-only, never block', () => {
  // __dirname = .../opspal-commercial/plugins/opspal-core/test/hooks/integration
  // Go up to opspal-commercial/, then into plugins/
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const pluginsRoot = path.join(repoRoot, 'plugins');

  // Build test matrix: all hooks × all prompts × all probeAgents for each hook
  const testCases = ROUTING_HOOKS.flatMap(({ plugin, file, event, probeAgents }) =>
    probeAgents.flatMap(agentName =>
      PROBE_PROMPTS.map(prompt => ({
        plugin,
        file,
        event,
        prompt,
        agentName,
        hookPath: path.join(pluginsRoot, plugin, file),
        label: `${plugin}/${file} [agent=${agentName || 'none'}] "${prompt}"`,
      }))
    )
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
    '$label stays advisory',
    ({ hookPath, event, prompt, agentName, plugin, file }) => {
      const result = runHook(hookPath, event, prompt, agentName);
      assertAdvisory(result, `${plugin}/${file}`, prompt, agentName);
    }
  );
});
