'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  applyCandidate, applyBatch, processObservation,
  _applyToStore
} = require('../runbook-incremental-updater');
const { loadEntries, saveEntries } = require('../runbook-entry-store');
const { registerRunbook } = require('../runbook-registry');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Set up a registry with a workflow runbook and pre-populate its entry store.
 */
function setupWorkflowRunbook() {
  registerRunbook('acme-prod', {
    title: 'Lead Routing Workflow',
    scopeType: 'workflow',
    scopeKey: 'lead-routing',
    status: 'active',
    linkedWorkflows: ['Lead Assignment', 'Lead Routing'],
    linkedObjects: ['Lead']
  }, tmpDir);

  // Copy the fixture entry store
  const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
  const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks', 'entries');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-lead-routing.json'), JSON.stringify(fixture));
}

function makeResolution(candidateId, runbookId = 'workflow-lead-routing') {
  return {
    candidateId,
    resolvedRunbookId: runbookId,
    resolvedScope: { scopeType: 'workflow', scopeKey: 'lead-routing' },
    matchType: 'exact',
    confidence: 0.7,
    registryUpdated: false,
    createdRunbook: null
  };
}

// ── applyCandidate / _applyToStore ─────────────────────────────────────────

describe('applyCandidate — new entry', () => {
  test('creates a new entry for unmatched candidate', () => {
    setupWorkflowRunbook();
    const candidate = require(path.join(FIXTURES, 'new-candidate.json'));
    const resolution = makeResolution(candidate.candidateId);

    const result = applyCandidate('acme-prod', candidate, resolution, tmpDir);
    expect(result.action).toBe('created');
    expect(result.entryId).toBeDefined();

    // Verify entry exists in store
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    expect(store.entries).toHaveLength(7); // 6 existing + 1 new
    const newEntry = store.entries.find(e => e.entryId === result.entryId);
    expect(newEntry).not.toBeNull();
    expect(newEntry.section).toBe('Workflow Nuances');
    expect(newEntry.category).toBe('workflow-nuance');
  });

  test('new entry with low confidence gets proposed status', () => {
    setupWorkflowRunbook();
    const candidate = require(path.join(FIXTURES, 'new-candidate.json'));
    candidate.confidence = 0.4;
    const resolution = makeResolution(candidate.candidateId);

    const result = applyCandidate('acme-prod', candidate, resolution, tmpDir);
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const entry = store.entries.find(e => e.entryId === result.entryId);
    expect(entry.validationStatus).toBe('proposed');
  });

  test('new entry with high confidence gets active status', () => {
    setupWorkflowRunbook();
    const candidate = require(path.join(FIXTURES, 'new-candidate.json'));
    candidate.confidence = 0.75;
    const resolution = makeResolution(candidate.candidateId);

    const result = applyCandidate('acme-prod', candidate, resolution, tmpDir);
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const entry = store.entries.find(e => e.entryId === result.entryId);
    expect(entry.validationStatus).toBe('active');
  });
});

describe('applyCandidate — merge', () => {
  test('merges into existing entry for similar candidate', () => {
    setupWorkflowRunbook();
    const candidate = require(path.join(FIXTURES, 'merge-candidate.json'));
    const resolution = makeResolution(candidate.candidateId);

    const result = applyCandidate('acme-prod', candidate, resolution, tmpDir);
    expect(result.action).toBe('merged');

    // Verify recurrence incremented
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    expect(store.entries).toHaveLength(6); // no new entry, just merged
    const merged = store.entries.find(e => e.entryId === result.entryId);
    expect(merged.recurrenceCount).toBeGreaterThan(4); // was 4, now 4+1=5
  });

  test('merge appends evidence', () => {
    setupWorkflowRunbook();
    const candidate = require(path.join(FIXTURES, 'merge-candidate.json'));
    const resolution = makeResolution(candidate.candidateId);

    applyCandidate('acme-prod', candidate, resolution, tmpDir);
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const merged = store.entries.find(e => e.entryId === 'known-exceptions-a1b2c3d4e5');
    // Should have original 2 evidence records + 1 new
    expect(merged.evidence.length).toBeGreaterThanOrEqual(3);
  });

  test('merge unions sourceAgents', () => {
    setupWorkflowRunbook();
    const candidate = require(path.join(FIXTURES, 'merge-candidate.json'));
    candidate.sourceAgent = 'sfdc-territory-orchestrator';
    const resolution = makeResolution(candidate.candidateId);

    applyCandidate('acme-prod', candidate, resolution, tmpDir);
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const merged = store.entries.find(e => e.entryId === 'known-exceptions-a1b2c3d4e5');
    expect(merged.sourceAgents).toContain('sfdc-data-operations');
    expect(merged.sourceAgents).toContain('sfdc-territory-orchestrator');
  });

  test('stale entry promoted to confirmed on re-observation', () => {
    setupWorkflowRunbook();
    // The business-rule entry is 'stale'. Create a candidate that matches it.
    const candidate = {
      candidateId: 'obs-stale-reobs',
      orgAlias: 'acme-prod',
      sourceType: 'observation',
      sourceRef: 'obs-stale.json',
      sourceAgent: 'sfdc-deployment-manager',
      category: 'business-rule',
      summary: 'All Account records must have Region__c populated before any bulk data operation. Validation rule Account_Region_Required enforces this.',
      evidence: 'Validation rule blocked the import',
      confidence: 0.6,
      durabilityScore: 0.5,
      recurrenceCount: 1,
      relatedObjects: ['Account'],
      relatedWorkflow: null,
      extractedAt: '2026-03-27T10:00:00.000Z',
      validationStatus: 'pending',
      proposedScopes: [{ scopeType: 'org', scopeKey: 'acme-prod' }]
    };
    const resolution = makeResolution(candidate.candidateId);

    applyCandidate('acme-prod', candidate, resolution, tmpDir);
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const entry = store.entries.find(e => e.entryId === 'business-rules-u1v2w3x4y5');
    expect(entry.lifecycleStatus).toBe('confirmed');
  });

  test('proposed entry promoted to active when confidence rises above 0.6', () => {
    setupWorkflowRunbook();
    // The DML limit entry is 'proposed' with confidence 0.55
    const candidate = {
      candidateId: 'obs-promote-active',
      orgAlias: 'acme-prod',
      sourceType: 'observation',
      sourceRef: 'obs-dml.json',
      sourceAgent: 'sfdc-automation-auditor',
      category: 'known-exception',
      summary: 'Account trigger flow hits DML limit processing more than 200 records',
      evidence: 'DML limit error in transaction log',
      confidence: 0.85,
      durabilityScore: 0.7,
      recurrenceCount: 1,
      relatedObjects: ['Account'],
      relatedWorkflow: null,
      extractedAt: '2026-03-27T11:00:00.000Z',
      validationStatus: 'pending',
      proposedScopes: [{ scopeType: 'org', scopeKey: 'acme-prod' }]
    };
    const resolution = makeResolution(candidate.candidateId);

    applyCandidate('acme-prod', candidate, resolution, tmpDir);
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const entry = store.entries.find(e => e.entryId === 'known-exceptions-f6g7h8i9j0');
    expect(entry.validationStatus).toBe('active');
  });
});

// ── applyBatch ─────────────────────────────────────────────────────────────

describe('applyBatch', () => {
  test('applies multiple candidates grouped by runbook', () => {
    setupWorkflowRunbook();
    const mergeCandidate = require(path.join(FIXTURES, 'merge-candidate.json'));
    const newCandidate = require(path.join(FIXTURES, 'new-candidate.json'));

    const resolutions = [
      makeResolution(mergeCandidate.candidateId),
      makeResolution(newCandidate.candidateId)
    ];

    const result = applyBatch('acme-prod', [mergeCandidate, newCandidate], resolutions, tmpDir);
    expect(result.applied).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
    expect(result.applied[0].action).toBe('merged');
    expect(result.applied[1].action).toBe('created');
  });

  test('skips candidates with no resolution', () => {
    setupWorkflowRunbook();
    const candidate = require(path.join(FIXTURES, 'new-candidate.json'));
    // No resolution for this candidate
    const result = applyBatch('acme-prod', [candidate], [], tmpDir);
    expect(result.applied).toHaveLength(0);
  });
});

// ── processObservation ─────────────────────────────────────────────────────

describe('processObservation', () => {
  test('full pipeline with rich observation', () => {
    // Set up org-level runbook for fallback
    registerRunbook('acme-prod', {
      title: 'Acme Prod Org Runbook',
      scopeType: 'org',
      scopeKey: 'acme-prod',
      status: 'active'
    }, tmpDir);

    const observation = require(path.join(FIXTURES, 'rich-observation.json'));
    const result = processObservation('acme-prod', observation, tmpDir);

    expect(result.candidates).toBeGreaterThanOrEqual(0);
    expect(typeof result.applied).toBe('number');
    expect(Array.isArray(result.runbooksUpdated)).toBe(true);
  });

  test('returns zero for minimal observation', () => {
    const observation = require(path.join(FIXTURES, 'minimal-observation.json'));
    const result = processObservation('test-org', observation, tmpDir);
    expect(result.candidates).toBe(0);
    expect(result.applied).toBe(0);
  });
});
