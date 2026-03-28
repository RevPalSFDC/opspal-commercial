'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  detectConflicts, resolveConflict, loadConflicts, getUnresolvedConflicts
} = require('../runbook-conflict-manager');
const { loadEntries, saveEntries, getEntry } = require('../runbook-entry-store');
const { registerRunbook } = require('../runbook-registry');

let tmpDir;

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-test-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function setupTwoRunbooksWithSimilarEntries() {
  registerRunbook('acme-prod', { scopeType: 'org', scopeKey: 'acme-prod', title: 'Org', status: 'active' }, tmpDir);
  registerRunbook('acme-prod', { scopeType: 'workflow', scopeKey: 'lead-routing', title: 'LR', status: 'active' }, tmpDir);

  const makeEntry = (id, summary, confidence, workflow) => ({
    entryId: id,
    section: 'Known Exceptions',
    category: 'known-exception',
    title: summary.slice(0, 40),
    summary,
    details: null,
    evidence: [{ source: 'test', text: 'evidence text', timestamp: '2026-03-27T00:00:00Z' }],
    confidence,
    recurrenceCount: 2,
    validationStatus: 'active',
    lifecycleStatus: 'confirmed',
    firstSeenAt: '2026-03-01T00:00:00Z',
    lastSeenAt: '2026-03-27T00:00:00Z',
    sourceAgents: ['agent-a'],
    relatedObjects: ['Lead'],
    relatedWorkflow: workflow,
    relatedProject: null,
    supersedes: [],
    supersededBy: [],
    conflictsWith: []
  });

  saveEntries('acme-prod', 'org-acme-prod', {
    runbookId: 'org-acme-prod', version: '1.0.0', updatedAt: '',
    entries: [
      makeEntry('org-entry-1', 'Lead import fails when territory queues are missing in sandbox environments after refresh', 0.85, 'Lead Assignment')
    ]
  }, tmpDir);

  saveEntries('acme-prod', 'workflow-lead-routing', {
    runbookId: 'workflow-lead-routing', version: '1.0.0', updatedAt: '',
    entries: [
      makeEntry('wf-entry-1', 'Lead import fails when territory queues dont exist in sandbox environments after a refresh', 0.55, 'Lead Routing')
    ]
  }, tmpDir);
}

describe('detectConflicts', () => {
  test('finds similar entries across runbooks', () => {
    setupTwoRunbooksWithSimilarEntries();
    const result = detectConflicts('acme-prod', tmpDir);
    expect(result.detected).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  test('marks conflictsWith on both entries', () => {
    setupTwoRunbooksWithSimilarEntries();
    detectConflicts('acme-prod', tmpDir);

    const orgStore = loadEntries('acme-prod', 'org-acme-prod', tmpDir);
    const wfStore = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);

    const orgEntry = getEntry(orgStore, 'org-entry-1');
    const wfEntry = getEntry(wfStore, 'wf-entry-1');

    expect(orgEntry.conflictsWith).toContain('wf-entry-1');
    expect(wfEntry.conflictsWith).toContain('org-entry-1');
  });

  test('skips already-detected conflicts on second run', () => {
    setupTwoRunbooksWithSimilarEntries();
    const first = detectConflicts('acme-prod', tmpDir);
    const second = detectConflicts('acme-prod', tmpDir);
    expect(second.detected).toBe(0);
    expect(second.total).toBe(first.total);
  });

  test('ignores entries in different sections', () => {
    registerRunbook('test-org', { scopeType: 'org', scopeKey: 'test-org', title: 'Org', status: 'active' }, tmpDir);
    registerRunbook('test-org', { scopeType: 'workflow', scopeKey: 'wf1', title: 'WF', status: 'active' }, tmpDir);

    saveEntries('test-org', 'org-test-org', {
      runbookId: 'org-test-org', version: '1.0.0', updatedAt: '',
      entries: [{
        entryId: 'e1', section: 'Known Exceptions', category: 'known-exception',
        title: 'Queue missing', summary: 'Queue missing in sandbox',
        details: null, evidence: [], confidence: 0.8, recurrenceCount: 1,
        validationStatus: 'active', lifecycleStatus: 'confirmed',
        firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z',
        sourceAgents: [], relatedObjects: [], relatedWorkflow: null, relatedProject: null,
        supersedes: [], supersededBy: [], conflictsWith: []
      }]
    }, tmpDir);

    saveEntries('test-org', 'workflow-wf1', {
      runbookId: 'workflow-wf1', version: '1.0.0', updatedAt: '',
      entries: [{
        entryId: 'e2', section: 'Business Rules', category: 'business-rule',
        title: 'Region required', summary: 'Region field must be set',
        details: null, evidence: [], confidence: 0.7, recurrenceCount: 1,
        validationStatus: 'active', lifecycleStatus: 'confirmed',
        firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z',
        sourceAgents: [], relatedObjects: [], relatedWorkflow: null, relatedProject: null,
        supersedes: [], supersededBy: [], conflictsWith: []
      }]
    }, tmpDir);

    const result = detectConflicts('test-org', tmpDir);
    expect(result.detected).toBe(0);
  });
});

describe('resolveConflict', () => {
  test('keep-a deprecates entry B', () => {
    setupTwoRunbooksWithSimilarEntries();
    detectConflicts('acme-prod', tmpDir);

    const conflicts = loadConflicts('acme-prod', tmpDir);
    const conflictId = conflicts.conflicts[0].conflictId;

    const resolved = resolveConflict('acme-prod', conflictId, 'keep-a', tmpDir);
    expect(resolved).toBe(true);

    // Entry B should be deprecated
    const wfStore = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const entryB = getEntry(wfStore, 'wf-entry-1');
    expect(entryB.validationStatus).toBe('deprecated');

    // Conflict should be resolved
    const updated = loadConflicts('acme-prod', tmpDir);
    expect(updated.conflicts[0].status).toBe('resolved');
    expect(updated.conflicts[0].resolution).toBe('keep-a');
  });

  test('dismiss marks resolved without touching entries', () => {
    setupTwoRunbooksWithSimilarEntries();
    detectConflicts('acme-prod', tmpDir);

    const conflicts = loadConflicts('acme-prod', tmpDir);
    const conflictId = conflicts.conflicts[0].conflictId;

    resolveConflict('acme-prod', conflictId, 'dismiss', tmpDir);

    // Both entries should still be active
    const orgStore = loadEntries('acme-prod', 'org-acme-prod', tmpDir);
    const wfStore = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    expect(getEntry(orgStore, 'org-entry-1').validationStatus).toBe('active');
    expect(getEntry(wfStore, 'wf-entry-1').validationStatus).toBe('active');
  });

  test('returns false for nonexistent conflict', () => {
    expect(resolveConflict('acme-prod', 'nonexistent', 'dismiss', tmpDir)).toBe(false);
  });
});

describe('getUnresolvedConflicts', () => {
  test('returns only detected/reviewing conflicts', () => {
    setupTwoRunbooksWithSimilarEntries();
    detectConflicts('acme-prod', tmpDir);

    const unresolved = getUnresolvedConflicts('acme-prod', tmpDir);
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every(c => ['detected', 'reviewing'].includes(c.status))).toBe(true);
  });

  test('returns empty after resolution', () => {
    setupTwoRunbooksWithSimilarEntries();
    detectConflicts('acme-prod', tmpDir);

    const conflicts = loadConflicts('acme-prod', tmpDir);
    resolveConflict('acme-prod', conflicts.conflicts[0].conflictId, 'dismiss', tmpDir);

    expect(getUnresolvedConflicts('acme-prod', tmpDir)).toHaveLength(0);
  });
});
