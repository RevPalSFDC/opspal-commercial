'use strict';

const fs = require('fs');
const path = require('path');

const { HookTester } = require('../runner');
const { sanitizeSessionKey } = require('../../../scripts/lib/routing-state-manager');
const { createRuntime } = require(path.resolve(
  __dirname,
  '../../../../../../dev-tools/recursive-test-harness/src/adapters/claude-runtime'
));

const PLUGINS_SOURCE_DIR = path.resolve(__dirname, '../../../../../../opspal-commercial/plugins');
const INSTALLED_PLUGINS = ['opspal-core', 'opspal-marketo', 'opspal-hubspot', 'opspal-okrs'];

jest.setTimeout(120000);

function createSessionId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRoutingStatePath(runtime, sessionId) {
  return path.join(
    runtime.homeDir,
    '.claude',
    'routing-state',
    `${sanitizeSessionKey(sessionId)}.json`
  );
}

function readRoutingState(runtime, sessionId) {
  const statePath = getRoutingStatePath(runtime, sessionId);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

async function runRouter(runtime, prompt, sessionId) {
  const hookPath = path.join(runtime.pluginsDir, 'opspal-core', 'hooks', 'unified-router.sh');
  const tester = new HookTester(hookPath, { timeout: 20000 });

  return tester.run({
    input: { userPrompt: prompt },
    env: {
      HOME: runtime.homeDir,
      CLAUDE_SESSION_ID: sessionId,
      ACTIVE_INTAKE_MODE: 'recommend',
      ENABLE_AGENT_BLOCKING: '1',
      USER_PROMPT_MANDATORY_HARD_BLOCKING: '0'
    }
  });
}

describe('Cross-plugin routing chain', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await createRuntime({
      pluginsSourceDir: PLUGINS_SOURCE_DIR,
      pluginNames: INSTALLED_PLUGINS
    });
  });

  afterAll(() => {
    if (runtime) {
      runtime.destroy();
    }
  });

  test('routes Marketo campaign prompts to the Marketo specialist without pending-clearance state', async () => {
    const sessionId = createSessionId('marketo-route');
    const result = await runRouter(
      runtime,
      'Audit Marketo lead scoring, lifecycle, and routing across smart campaigns',
      sessionId
    );

    expect(result.exitCode).toBe(0);
    expect(result.output?.metadata?.suggestedAgent).toBe('opspal-marketo:marketo-campaign-builder');
    expect(result.output?.metadata?.requiredAgent).toBeNull();
    expect(result.output?.metadata?.routeKind).toBe('advisory_specialist');
    expect(result.output?.metadata?.routePendingClearance).toBe(false);
    expect(readRoutingState(runtime, sessionId)).toBeNull();
  });

  test('routes HubSpot CMS prompts to HubSpot and persists pending-clearance state', async () => {
    const sessionId = createSessionId('hubspot-route');
    const result = await runRouter(
      runtime,
      'Publish HubSpot CMS landing page updates and audit template modules',
      sessionId
    );
    const state = readRoutingState(runtime, sessionId);

    expect(result.exitCode).toBe(0);
    expect(result.output?.metadata?.suggestedAgent).toBe('opspal-hubspot:hubspot-assessment-analyzer');
    expect(result.output?.metadata?.requiredAgent).toBe('opspal-hubspot:hubspot-assessment-analyzer');
    expect(result.output?.metadata?.routeKind).toBe('complexity_specialist');
    expect(result.output?.metadata?.routePendingClearance).toBe(true);
    expect(state).not.toBeNull();
    expect(state.required_agent).toBe('opspal-hubspot:hubspot-assessment-analyzer');
    expect(state.route_pending_clearance).toBe(true);
    expect(state.clearance_status).toBe('pending_clearance');
  });

  test('routes OKR strategy prompts to the OKR plugin and persists pending-clearance state', async () => {
    const sessionId = createSessionId('okr-route');
    const result = await runRouter(
      runtime,
      'Create company OKRs with objectives and key results for Q2',
      sessionId
    );
    const state = readRoutingState(runtime, sessionId);

    expect(result.exitCode).toBe(0);
    expect(result.output?.metadata?.suggestedAgent).toBe('opspal-okrs:okr-strategy-orchestrator');
    expect(result.output?.metadata?.requiredAgent).toBe('opspal-okrs:okr-strategy-orchestrator');
    expect(result.output?.metadata?.routeKind).toBe('complexity_specialist');
    expect(result.output?.metadata?.routePendingClearance).toBe(true);
    expect(state).not.toBeNull();
    expect(state.required_agent).toBe('opspal-okrs:okr-strategy-orchestrator');
    expect(state.route_pending_clearance).toBe(true);
    expect(state.clearance_status).toBe('pending_clearance');
  });
});
