'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  evaluateForPromotion, promoteEntry, evaluateAndPromoteBatch,
  loadPromotions, getPromotionHistory, PROMOTION_THRESHOLDS
} = require('../runbook-promotion-manager');
const { loadEntries, saveEntries, getEntry } = require('../runbook-entry-store');
const { registerRunbook, loadRegistry } = require('../runbook-registry');
const { _resetSessionCounter } = require('../runbook-resolver');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-test-'));
  _resetSessionCounter();
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function setupOrgWithWorkflow() {
  registerRunbook('acme-prod', { scopeType: 'org', scopeKey: 'acme-prod', title: 'Org', status: 'active' }, tmpDir);
  registerRunbook('acme-prod', { scopeType: 'workflow', scopeKey: 'lead-routing', title: 'Lead Routing', status: 'active', parentRunbook: 'org-acme-prod' }, tmpDir);

  const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
  saveEntries('acme-prod', 'workflow-lead-routing', fixture, tmpDir);
}

describe('evaluateForPromotion', () => {
  test('returns qualifies for high-recurrence active entry', () => {
    setupOrgWithWorkflow();
    const registry = loadRegistry('acme-prod', tmpDir);
    const runbookMeta = registry.runbooks.find(r => r.id === 'workflow-lead-routing');
    // The first entry has recurrenceCount: 4, confidence: 0.82 — needs recurrence >= 5
    // Let's create a qualifying entry
    const entry = {
      entryId: 'test-high-recurrence',
      recurrenceCount: 6,
      confidence: 0.85,
      validationStatus: 'active',
      category: 'known-exception',
      supersededBy: []
    };
    const result = evaluateForPromotion(entry, runbookMeta, registry);
    expect(result).not.toBeNull();
    expect(result.qualifies).toBe(true);
    expect(result.promotionType).toBe('cross-scope');
    expect(result.targetRunbookId).toBe('org-acme-prod');
  });

  test('returns null for low-recurrence entry', () => {
    setupOrgWithWorkflow();
    const registry = loadRegistry('acme-prod', tmpDir);
    const runbookMeta = registry.runbooks.find(r => r.id === 'workflow-lead-routing');
    const entry = {
      entryId: 'test-low',
      recurrenceCount: 2,
      confidence: 0.9,
      validationStatus: 'active',
      category: 'known-exception',
      supersededBy: []
    };
    expect(evaluateForPromotion(entry, runbookMeta, registry)).toBeNull();
  });

  test('returns null for non-active entry', () => {
    setupOrgWithWorkflow();
    const registry = loadRegistry('acme-prod', tmpDir);
    const runbookMeta = registry.runbooks.find(r => r.id === 'workflow-lead-routing');
    const entry = { recurrenceCount: 10, confidence: 0.9, validationStatus: 'proposed', supersededBy: [] };
    expect(evaluateForPromotion(entry, runbookMeta, registry)).toBeNull();
  });

  test('identifies preflight-guard for remediation-recipe', () => {
    setupOrgWithWorkflow();
    const registry = loadRegistry('acme-prod', tmpDir);
    const runbookMeta = registry.runbooks.find(r => r.id === 'workflow-lead-routing');
    const entry = {
      entryId: 'test-preflight',
      recurrenceCount: 3,
      confidence: 0.6,
      validationStatus: 'active',
      category: 'remediation-recipe',
      supersededBy: []
    };
    const result = evaluateForPromotion(entry, runbookMeta, registry);
    expect(result).not.toBeNull();
    expect(result.promotionType).toBe('preflight-guard');
  });
});

describe('promoteEntry', () => {
  test('copies entry to target, marks source as superseded', () => {
    setupOrgWithWorkflow();

    // Add a high-recurrence entry to promote
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    store.entries.push({
      entryId: 'promote-me',
      section: 'Known Exceptions',
      category: 'known-exception',
      title: 'Promotable exception',
      summary: 'This entry should be promoted to org level',
      details: null,
      evidence: [{ source: 'test', text: 'evidence', timestamp: '2026-03-27T00:00:00Z' }],
      confidence: 0.85,
      recurrenceCount: 6,
      validationStatus: 'active',
      lifecycleStatus: 'confirmed',
      firstSeenAt: '2026-03-01T00:00:00Z',
      lastSeenAt: '2026-03-27T00:00:00Z',
      sourceAgents: ['sfdc-data-operations'],
      relatedObjects: ['Lead'],
      relatedWorkflow: 'Lead Routing',
      relatedProject: null,
      supersedes: [],
      supersededBy: [],
      conflictsWith: []
    });
    saveEntries('acme-prod', 'workflow-lead-routing', store, tmpDir);

    // Ensure target store exists (empty)
    saveEntries('acme-prod', 'org-acme-prod', { runbookId: 'org-acme-prod', version: '1.0.0', entries: [], updatedAt: '' }, tmpDir);

    const result = promoteEntry('acme-prod', 'workflow-lead-routing', 'promote-me', 'org-acme-prod', tmpDir);
    expect(result.promotionRecord).not.toBeNull();
    expect(result.promotionRecord.sourceEntryId).toBe('promote-me');
    expect(result.promotionRecord.targetRunbookId).toBe('org-acme-prod');

    // Verify source is superseded
    const srcStore = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    const srcEntry = getEntry(srcStore, 'promote-me');
    expect(srcEntry.validationStatus).toBe('superseded');
    expect(srcEntry.supersededBy.length).toBeGreaterThan(0);

    // Verify target has new entry
    const tgtStore = loadEntries('acme-prod', 'org-acme-prod', tmpDir);
    expect(tgtStore.entries.length).toBe(1);
    expect(tgtStore.entries[0].supersedes).toContain('promote-me');
    expect(tgtStore.entries[0].title).toContain('(promoted)');

    // Verify promotion record exists
    const history = getPromotionHistory('acme-prod', tmpDir);
    expect(history.length).toBe(1);
  });

  test('is idempotent — second call does not duplicate', () => {
    setupOrgWithWorkflow();
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    store.entries.push({
      entryId: 'promote-idem',
      section: 'Known Exceptions', category: 'known-exception',
      title: 'Idempotent test', summary: 'Testing idempotency of promotion',
      details: null, evidence: [], confidence: 0.8, recurrenceCount: 5,
      validationStatus: 'active', lifecycleStatus: 'confirmed',
      firstSeenAt: '2026-03-01T00:00:00Z', lastSeenAt: '2026-03-27T00:00:00Z',
      sourceAgents: [], relatedObjects: [], relatedWorkflow: null, relatedProject: null,
      supersedes: [], supersededBy: [], conflictsWith: []
    });
    saveEntries('acme-prod', 'workflow-lead-routing', store, tmpDir);
    saveEntries('acme-prod', 'org-acme-prod', { runbookId: 'org-acme-prod', version: '1.0.0', entries: [], updatedAt: '' }, tmpDir);

    promoteEntry('acme-prod', 'workflow-lead-routing', 'promote-idem', 'org-acme-prod', tmpDir);
    // Second call — source is already superseded, but target entry already exists
    const result2 = promoteEntry('acme-prod', 'workflow-lead-routing', 'promote-idem', 'org-acme-prod', tmpDir);
    expect(result2.alreadyExists).toBe(true);
  });
});

describe('evaluateAndPromoteBatch', () => {
  test('promotes qualifying entries', () => {
    setupOrgWithWorkflow();
    // Add a high-recurrence entry
    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    store.entries.push({
      entryId: 'batch-promote',
      section: 'Known Exceptions', category: 'known-exception',
      title: 'Batch promotable', summary: 'Entry that qualifies for batch promotion',
      details: null, evidence: [{ source: 'test', text: 'ev', timestamp: '2026-03-27T00:00:00Z' }],
      confidence: 0.85, recurrenceCount: 6,
      validationStatus: 'active', lifecycleStatus: 'confirmed',
      firstSeenAt: '2026-03-01T00:00:00Z', lastSeenAt: '2026-03-27T00:00:00Z',
      sourceAgents: [], relatedObjects: [], relatedWorkflow: null, relatedProject: null,
      supersedes: [], supersededBy: [], conflictsWith: []
    });
    saveEntries('acme-prod', 'workflow-lead-routing', store, tmpDir);
    saveEntries('acme-prod', 'org-acme-prod', { runbookId: 'org-acme-prod', version: '1.0.0', entries: [], updatedAt: '' }, tmpDir);

    const result = evaluateAndPromoteBatch('acme-prod', tmpDir);
    expect(result.evaluated).toBeGreaterThan(0);
    expect(result.promoted).toBeGreaterThan(0);
  });

  test('does not double-promote already-superseded entries', () => {
    setupOrgWithWorkflow();
    saveEntries('acme-prod', 'org-acme-prod', { runbookId: 'org-acme-prod', version: '1.0.0', entries: [], updatedAt: '' }, tmpDir);

    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    store.entries.push({
      entryId: 'already-super',
      section: 'Known Exceptions', category: 'known-exception',
      title: 'Already superseded', summary: 'This was already promoted',
      details: null, evidence: [], confidence: 0.9, recurrenceCount: 10,
      validationStatus: 'superseded', lifecycleStatus: 'confirmed',
      firstSeenAt: '2026-03-01T00:00:00Z', lastSeenAt: '2026-03-27T00:00:00Z',
      sourceAgents: [], relatedObjects: [], relatedWorkflow: null, relatedProject: null,
      supersedes: [], supersededBy: ['promoted-elsewhere'], conflictsWith: []
    });
    saveEntries('acme-prod', 'workflow-lead-routing', store, tmpDir);

    const result = evaluateAndPromoteBatch('acme-prod', tmpDir);
    // Should not have promoted the already-superseded entry
    const history = getPromotionHistory('acme-prod', tmpDir);
    const promotedIds = history.map(p => p.sourceEntryId);
    expect(promotedIds).not.toContain('already-super');
  });
});
