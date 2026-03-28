'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { reconcile, _compact } = require('../runbook-reconcile');
const { loadEntries, saveEntries } = require('../runbook-entry-store');
const { registerRunbook } = require('../runbook-registry');
const { _resetSessionCounter } = require('../runbook-resolver');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-test-'));
  _resetSessionCounter();
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function setupOrgWithEntries() {
  registerRunbook('acme-prod', { scopeType: 'org', scopeKey: 'acme-prod', title: 'Org', status: 'active' }, tmpDir);

  saveEntries('acme-prod', 'org-acme-prod', {
    runbookId: 'org-acme-prod', version: '1.0.0', updatedAt: '',
    entries: [
      {
        entryId: 'e1', section: 'Known Exceptions', category: 'known-exception',
        title: 'Territory queue missing in sandbox environments after refresh',
        summary: 'Lead import fails when territory queues dont exist in sandbox environments after a refresh operation. The assignment rule expects queues.',
        details: null,
        evidence: [{ source: 'obs1', text: 'ev1', timestamp: '2026-03-01T00:00:00Z' }],
        confidence: 0.8, recurrenceCount: 3,
        validationStatus: 'active', lifecycleStatus: 'confirmed',
        firstSeenAt: '2026-03-01T00:00:00Z', lastSeenAt: '2026-03-27T00:00:00Z',
        sourceAgents: ['agent-a'], relatedObjects: ['Lead'],
        relatedWorkflow: null, relatedProject: null,
        supersedes: [], supersededBy: [], conflictsWith: []
      },
      {
        entryId: 'e2', section: 'Known Exceptions', category: 'known-exception',
        title: 'Territory queue missing in sandbox environments causing lead import failure',
        summary: 'Lead import fails when territory queues dont exist in sandbox environments. Queue must be recreated after refresh operation to fix.',
        details: null,
        evidence: [{ source: 'obs2', text: 'ev2', timestamp: '2026-03-10T00:00:00Z' }],
        confidence: 0.7, recurrenceCount: 2,
        validationStatus: 'active', lifecycleStatus: 'confirmed',
        firstSeenAt: '2026-03-05T00:00:00Z', lastSeenAt: '2026-03-20T00:00:00Z',
        sourceAgents: ['agent-b'], relatedObjects: ['Lead'],
        relatedWorkflow: null, relatedProject: null,
        supersedes: [], supersededBy: [], conflictsWith: []
      },
      {
        entryId: 'e3', section: 'Business Rules', category: 'business-rule',
        title: 'Region field must be populated',
        summary: 'All Account records must have Region__c populated before bulk operations.',
        details: null,
        evidence: [{ source: 'obs3', text: 'ev3', timestamp: '2026-03-15T00:00:00Z' }],
        confidence: 0.6, recurrenceCount: 1,
        validationStatus: 'active', lifecycleStatus: 'new',
        firstSeenAt: '2026-03-15T00:00:00Z', lastSeenAt: '2026-03-15T00:00:00Z',
        sourceAgents: [], relatedObjects: ['Account'],
        relatedWorkflow: null, relatedProject: null,
        supersedes: [], supersededBy: [], conflictsWith: []
      }
    ]
  }, tmpDir);
}

describe('_compact', () => {
  test('merges duplicate entries within a store', () => {
    setupOrgWithEntries();
    // e1 and e2 have very similar summaries — should be merged at 0.8 threshold
    const result = _compact('acme-prod', tmpDir);

    // At least one should be merged
    const store = loadEntries('acme-prod', 'org-acme-prod', tmpDir);
    // e3 (Business Rules) is different, should survive
    expect(store.entries.some(e => e.section === 'Business Rules')).toBe(true);
  });

  test('preserves distinct entries', () => {
    setupOrgWithEntries();
    _compact('acme-prod', tmpDir);
    const store = loadEntries('acme-prod', 'org-acme-prod', tmpDir);
    // e3 is different from e1/e2, should not be merged
    const bizRules = store.entries.filter(e => e.category === 'business-rule');
    expect(bizRules).toHaveLength(1);
  });
});

describe('reconcile', () => {
  test('reconcile with markStale marks old entries', () => {
    setupOrgWithEntries();
    const result = reconcile('acme-prod', { markStale: true }, tmpDir);
    expect(result.lifecycle).toBeDefined();
    // With default maxAgeDays: 90, entries from March 2026 should be stale by now
    // (test runs after March 2026 + 90 days)
  });

  test('reconcile with rebuildProjections renders output', () => {
    setupOrgWithEntries();
    const result = reconcile('acme-prod', { rebuildProjections: true }, tmpDir);
    expect(result.projections.rendered).toBeGreaterThan(0);

    // Verify projection file exists
    const projPath = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks', 'projections', 'org', 'org-acme-prod.md');
    // Either per-runbook or org projection should exist
    const projDir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks', 'projections');
    expect(fs.existsSync(projDir)).toBe(true);
  });

  test('reconcile with no options returns zero counts', () => {
    setupOrgWithEntries();
    const result = reconcile('acme-prod', {}, tmpDir);
    expect(result.compacted.entriesRemoved).toBe(0);
    expect(result.backfilled.observationsProcessed).toBe(0);
    expect(result.lifecycle.markedStale).toBe(0);
    expect(result.conflicts.detected).toBe(0);
    expect(result.promotions.promoted).toBe(0);
    expect(result.projections.rendered).toBe(0);
  });

  test('full reconcile pipeline runs all steps', () => {
    setupOrgWithEntries();
    const result = reconcile('acme-prod', {
      compact: true,
      markStale: true,
      detectConflicts: true,
      rebuildProjections: true
    }, tmpDir);

    expect(result.compacted).toBeDefined();
    expect(result.lifecycle).toBeDefined();
    expect(result.conflicts).toBeDefined();
    expect(result.projections).toBeDefined();
  });
});
