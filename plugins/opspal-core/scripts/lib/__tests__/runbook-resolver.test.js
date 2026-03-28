'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  resolveCandidate, resolveBatch,
  inferScopes, buildScopeHierarchy, shouldCreateRunbook,
  _resetSessionCounter, _deriveTitle, _sortBySpecificity,
  SCOPE_HIERARCHY, SPECIFICITY_ORDER
} = require('../runbook-resolver');

const {
  loadRegistry, saveRegistry, registerRunbook
} = require('../runbook-registry');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-resolver-test-'));
  _resetSessionCounter();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Helper to set up a registry from the sample fixture.
 */
function setupSampleRegistry() {
  const fixture = require(path.join(FIXTURES, 'sample-registry.json'));
  const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  return loadRegistry('acme-prod', tmpDir);
}

/**
 * Helper to create a candidate with minimal required fields.
 */
function makeCandidate(overrides = {}) {
  return {
    candidateId: 'test-candidate-001',
    orgAlias: 'acme-prod',
    platform: 'salesforce',
    sourceType: 'observation',
    sourceRef: 'test-ref',
    sourceAgent: 'sfdc-deployment-manager',
    operationType: 'deployment',
    relatedObjects: ['Account'],
    relatedWorkflow: 'Lead Routing',
    relatedProject: null,
    category: 'known-exception',
    summary: 'Test candidate for resolver testing',
    evidence: 'Workaround: use default owner',
    confidence: 0.7,
    durabilityScore: 0.6,
    recurrenceCount: 2,
    proposedScopes: [
      { scopeType: 'workflow', scopeKey: 'lead-routing' }
    ],
    extractedAt: new Date().toISOString(),
    validationStatus: 'pending',
    ...overrides
  };
}

// ── buildScopeHierarchy ────────────────────────────────────────────────────

describe('buildScopeHierarchy', () => {
  test('workflow hierarchy', () => {
    expect(buildScopeHierarchy('workflow')).toEqual(['workflow', 'platform', 'org']);
  });

  test('sub-agent hierarchy', () => {
    expect(buildScopeHierarchy('sub-agent')).toEqual(['sub-agent', 'platform', 'org']);
  });

  test('solution hierarchy', () => {
    expect(buildScopeHierarchy('solution')).toEqual(['solution', 'project', 'org']);
  });

  test('org hierarchy (terminal)', () => {
    expect(buildScopeHierarchy('org')).toEqual(['org']);
  });

  test('unknown scope type falls back to org', () => {
    expect(buildScopeHierarchy('unknown')).toEqual(['org']);
  });
});

// ── inferScopes ────────────────────────────────────────────────────────────

describe('inferScopes', () => {
  test('includes workflow scope when relatedWorkflow present', () => {
    const candidate = makeCandidate({ relatedWorkflow: 'Lead Routing' });
    const scopes = inferScopes(candidate);
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeType: 'workflow', scopeKey: 'Lead Routing' })
      ])
    );
  });

  test('includes sub-agent scope when sourceAgent present', () => {
    const candidate = makeCandidate({ sourceAgent: 'sfdc-orchestrator' });
    const scopes = inferScopes(candidate);
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeType: 'sub-agent', scopeKey: 'sfdc-orchestrator' })
      ])
    );
  });

  test('includes org scope', () => {
    const candidate = makeCandidate();
    const scopes = inferScopes(candidate);
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeType: 'org', scopeKey: 'acme-prod' })
      ])
    );
  });

  test('includes platform scope when platform present', () => {
    const candidate = makeCandidate({ platform: 'salesforce' });
    const scopes = inferScopes(candidate);
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeType: 'platform', scopeKey: 'salesforce' })
      ])
    );
  });

  test('includes project scope when relatedProject present', () => {
    const candidate = makeCandidate({ relatedProject: 'q2-migration' });
    const scopes = inferScopes(candidate);
    expect(scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeType: 'project', scopeKey: 'q2-migration' })
      ])
    );
  });
});

// ── shouldCreateRunbook ────────────────────────────────────────────────────

describe('shouldCreateRunbook', () => {
  test('returns true for high-confidence, high-durability candidate', () => {
    const candidate = makeCandidate({ confidence: 0.7, durabilityScore: 0.6 });
    expect(shouldCreateRunbook(candidate, 'acme-prod')).toBe(true);
  });

  test('returns false for low confidence', () => {
    const candidate = makeCandidate({ confidence: 0.4, durabilityScore: 0.6 });
    expect(shouldCreateRunbook(candidate, 'acme-prod')).toBe(false);
  });

  test('returns false for low durability', () => {
    const candidate = makeCandidate({ confidence: 0.7, durabilityScore: 0.3 });
    expect(shouldCreateRunbook(candidate, 'acme-prod')).toBe(false);
  });

  test('returns false for org-scoped candidate', () => {
    const candidate = makeCandidate({
      confidence: 0.9,
      durabilityScore: 0.9,
      proposedScopes: [{ scopeType: 'org', scopeKey: 'acme-prod' }]
    });
    expect(shouldCreateRunbook(candidate, 'acme-prod')).toBe(false);
  });
});

// ── resolveCandidate ───────────────────────────────────────────────────────

describe('resolveCandidate', () => {
  test('exact scope match', () => {
    const registry = setupSampleRegistry();
    const candidate = makeCandidate({
      proposedScopes: [{ scopeType: 'workflow', scopeKey: 'lead-routing' }]
    });

    const resolution = resolveCandidate('acme-prod', candidate, registry, tmpDir);
    expect(resolution.matchType).toBe('exact');
    expect(resolution.resolvedRunbookId).toBe('workflow-lead-routing');
    expect(resolution.registryUpdated).toBe(false);
    expect(resolution.createdRunbook).toBeNull();
  });

  test('parent scope fallback', () => {
    const registry = setupSampleRegistry();
    // Candidate proposes a workflow that doesn't exist, but platform-salesforce does
    const candidate = makeCandidate({
      proposedScopes: [{ scopeType: 'workflow', scopeKey: 'opportunity-pipeline' }],
      relatedWorkflow: 'Opportunity Pipeline',
      platform: 'salesforce'
    });

    const resolution = resolveCandidate('acme-prod', candidate, registry, tmpDir);
    expect(resolution.matchType).toBe('parent-scope');
    expect(resolution.resolvedRunbookId).toBe('platform-salesforce');
  });

  test('auto-creates draft runbook for high-confidence unmatched candidate', () => {
    // Empty registry, no matches possible
    const registry = loadRegistry('new-org', tmpDir);
    const candidate = makeCandidate({
      orgAlias: 'new-org',
      confidence: 0.8,
      durabilityScore: 0.7,
      sourceAgent: null, // no agent to avoid sub-agent scope taking priority
      proposedScopes: [{ scopeType: 'workflow', scopeKey: 'cpq-quoting' }],
      relatedWorkflow: 'CPQ Quoting'
    });

    const resolution = resolveCandidate('new-org', candidate, registry, tmpDir);
    expect(resolution.matchType).toBe('created');
    expect(resolution.registryUpdated).toBe(true);
    expect(resolution.createdRunbook).not.toBeNull();
    expect(resolution.createdRunbook.status).toBe('draft');
    expect(resolution.createdRunbook.scopeType).toBe('workflow');
  });

  test('falls back to org when confidence too low to create', () => {
    const registry = loadRegistry('low-conf-org', tmpDir);
    const candidate = makeCandidate({
      orgAlias: 'low-conf-org',
      confidence: 0.3,
      durabilityScore: 0.2,
      proposedScopes: [{ scopeType: 'workflow', scopeKey: 'some-flow' }]
    });

    const resolution = resolveCandidate('low-conf-org', candidate, registry, tmpDir);
    expect(resolution.matchType).toBe('org-fallback');
    expect(resolution.resolvedScope.scopeType).toBe('org');
  });

  test('falls back to org when durability too low', () => {
    const registry = loadRegistry('low-dur-org', tmpDir);
    const candidate = makeCandidate({
      orgAlias: 'low-dur-org',
      confidence: 0.8,
      durabilityScore: 0.3,
      proposedScopes: [{ scopeType: 'workflow', scopeKey: 'another-flow' }]
    });

    const resolution = resolveCandidate('low-dur-org', candidate, registry, tmpDir);
    expect(resolution.matchType).toBe('org-fallback');
  });

  test('auto-creates org runbook on fallback when absent', () => {
    const registry = loadRegistry('brand-new-org', tmpDir);
    expect(registry.runbooks).toHaveLength(0);

    const candidate = makeCandidate({
      orgAlias: 'brand-new-org',
      confidence: 0.3,
      durabilityScore: 0.2,
      proposedScopes: [{ scopeType: 'org', scopeKey: 'brand-new-org' }]
    });

    const resolution = resolveCandidate('brand-new-org', candidate, registry, tmpDir);
    expect(resolution.matchType).toBe('org-fallback');
    // Registry should now contain the org runbook
    expect(registry.runbooks.some(r => r.scopeType === 'org' && r.scopeKey === 'brand-new-org')).toBe(true);
  });

  test('rate limits creation to 5 per session per org', () => {
    const registry = loadRegistry('rate-limit-org', tmpDir);

    // Create 5 runbooks
    for (let i = 0; i < 5; i++) {
      const candidate = makeCandidate({
        candidateId: `test-candidate-${i}`,
        orgAlias: 'rate-limit-org',
        confidence: 0.8,
        durabilityScore: 0.7,
        proposedScopes: [{ scopeType: 'workflow', scopeKey: `flow-${i}` }],
        relatedWorkflow: `Flow ${i}`
      });
      const resolution = resolveCandidate('rate-limit-org', candidate, registry, tmpDir);
      expect(resolution.matchType).toBe('created');
    }

    // 6th should fall back to org
    const candidate6 = makeCandidate({
      candidateId: 'test-candidate-6',
      orgAlias: 'rate-limit-org',
      confidence: 0.9,
      durabilityScore: 0.9,
      proposedScopes: [{ scopeType: 'workflow', scopeKey: 'flow-6' }],
      relatedWorkflow: 'Flow 6'
    });
    const resolution6 = resolveCandidate('rate-limit-org', candidate6, registry, tmpDir);
    expect(resolution6.matchType).toBe('org-fallback');
  });
});

// ── resolveBatch ───────────────────────────────────────────────────────────

describe('resolveBatch', () => {
  test('resolves multiple candidates', () => {
    const registry = setupSampleRegistry();
    const candidates = [
      makeCandidate({
        candidateId: 'c1',
        proposedScopes: [{ scopeType: 'workflow', scopeKey: 'lead-routing' }]
      }),
      makeCandidate({
        candidateId: 'c2',
        proposedScopes: [{ scopeType: 'platform', scopeKey: 'salesforce' }]
      })
    ];

    const resolutions = resolveBatch('acme-prod', candidates, registry, tmpDir);
    expect(resolutions).toHaveLength(2);
    expect(resolutions[0].resolvedRunbookId).toBe('workflow-lead-routing');
    expect(resolutions[1].resolvedRunbookId).toBe('platform-salesforce');
  });

  test('saves registry once when modifications occur', () => {
    const candidates = [
      makeCandidate({
        candidateId: 'c1',
        orgAlias: 'batch-org',
        confidence: 0.8,
        durabilityScore: 0.7,
        proposedScopes: [{ scopeType: 'workflow', scopeKey: 'batch-flow-1' }]
      }),
      makeCandidate({
        candidateId: 'c2',
        orgAlias: 'batch-org',
        confidence: 0.8,
        durabilityScore: 0.7,
        proposedScopes: [{ scopeType: 'workflow', scopeKey: 'batch-flow-2' }]
      })
    ];

    const resolutions = resolveBatch('batch-org', candidates, null, tmpDir);
    expect(resolutions).toHaveLength(2);

    // Verify registry was persisted
    const saved = loadRegistry('batch-org', tmpDir);
    // Should have 2 created workflows + 1 auto-created org (from fallback or not)
    expect(saved.runbooks.length).toBeGreaterThanOrEqual(2);
  });

  test('returns one resolution per candidate', () => {
    const registry = setupSampleRegistry();
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({
        candidateId: `batch-c-${i}`,
        proposedScopes: [{ scopeType: 'org', scopeKey: 'acme-prod' }]
      })
    );

    const resolutions = resolveBatch('acme-prod', candidates, registry, tmpDir);
    expect(resolutions).toHaveLength(5);
  });
});

// ── _deriveTitle ───────────────────────────────────────────────────────────

describe('_deriveTitle', () => {
  test('derives workflow title', () => {
    const title = _deriveTitle({}, { scopeType: 'workflow', scopeKey: 'lead-routing' });
    expect(title).toBe('Lead Routing Workflow');
  });

  test('derives sub-agent title', () => {
    const title = _deriveTitle({}, { scopeType: 'sub-agent', scopeKey: 'sfdc-orchestrator' });
    expect(title).toBe('Sfdc Orchestrator Agent');
  });

  test('derives platform title', () => {
    const title = _deriveTitle({}, { scopeType: 'platform', scopeKey: 'salesforce' });
    expect(title).toBe('Salesforce Platform');
  });
});

// ── _sortBySpecificity ─────────────────────────────────────────────────────

describe('_sortBySpecificity', () => {
  test('sorts most specific first', () => {
    const scopes = [
      { scopeType: 'org', scopeKey: 'test' },
      { scopeType: 'workflow', scopeKey: 'test' },
      { scopeType: 'sub-agent', scopeKey: 'test' },
      { scopeType: 'platform', scopeKey: 'test' }
    ];
    const sorted = _sortBySpecificity(scopes);
    expect(sorted[0].scopeType).toBe('sub-agent');
    expect(sorted[1].scopeType).toBe('workflow');
    expect(sorted[2].scopeType).toBe('platform');
    expect(sorted[3].scopeType).toBe('org');
  });
});
