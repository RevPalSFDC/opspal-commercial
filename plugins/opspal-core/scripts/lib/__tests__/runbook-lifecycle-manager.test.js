'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  transitionEntry, refreshValidationState, markStale, deprecateStale,
  archiveDeprecated, ALLOWED_TRANSITIONS
} = require('../runbook-lifecycle-manager');
const { loadEntries, saveEntries, addEntry } = require('../runbook-entry-store');
const { registerRunbook } = require('../runbook-registry');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');
let tmpDir;

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-test-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function setupOrgWithEntries() {
  registerRunbook('acme-prod', { scopeType: 'org', scopeKey: 'acme-prod', title: 'Org', status: 'active' }, tmpDir);
  const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
  saveEntries('acme-prod', 'org-acme-prod', { ...fixture, runbookId: 'org-acme-prod' }, tmpDir);
}

describe('transitionEntry', () => {
  test('allows proposed → active', () => {
    const store = loadEntries('test', 'test', tmpDir);
    addEntry(store, { entryId: 'e1', section: 'Known Exceptions', title: 'T', summary: 'S', validationStatus: 'proposed', lifecycleStatus: 'new', confidence: 0.7, recurrenceCount: 1, firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', evidence: [], sourceAgents: [], relatedObjects: [], supersedes: [], supersededBy: [], conflictsWith: [], category: 'known-exception' });
    expect(transitionEntry(store, 'e1', 'active')).toBe(true);
    expect(store.entries[0].validationStatus).toBe('active');
  });

  test('allows active → stale', () => {
    const store = loadEntries('test', 'test', tmpDir);
    addEntry(store, { entryId: 'e1', section: 'S', title: 'T', summary: 'S', validationStatus: 'active', lifecycleStatus: 'confirmed', confidence: 0.7, recurrenceCount: 1, firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', evidence: [], sourceAgents: [], relatedObjects: [], supersedes: [], supersededBy: [], conflictsWith: [], category: 'known-exception' });
    expect(transitionEntry(store, 'e1', 'stale')).toBe(true);
  });

  test('blocks deprecated → active', () => {
    const store = loadEntries('test', 'test', tmpDir);
    addEntry(store, { entryId: 'e1', section: 'S', title: 'T', summary: 'S', validationStatus: 'deprecated', lifecycleStatus: 'stale', confidence: 0.7, recurrenceCount: 1, firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', evidence: [], sourceAgents: [], relatedObjects: [], supersedes: [], supersededBy: [], conflictsWith: [], category: 'known-exception' });
    expect(transitionEntry(store, 'e1', 'active')).toBe(false);
    expect(store.entries[0].validationStatus).toBe('deprecated');
  });

  test('blocks superseded → any', () => {
    const store = loadEntries('test', 'test', tmpDir);
    addEntry(store, { entryId: 'e1', section: 'S', title: 'T', summary: 'S', validationStatus: 'superseded', lifecycleStatus: 'confirmed', confidence: 0.7, recurrenceCount: 1, firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', evidence: [], sourceAgents: [], relatedObjects: [], supersedes: [], supersededBy: [], conflictsWith: [], category: 'known-exception' });
    expect(transitionEntry(store, 'e1', 'active')).toBe(false);
    expect(transitionEntry(store, 'e1', 'deprecated')).toBe(false);
  });

  test('returns false for nonexistent entry', () => {
    const store = loadEntries('test', 'test', tmpDir);
    expect(transitionEntry(store, 'nonexistent', 'active')).toBe(false);
  });
});

describe('refreshValidationState', () => {
  test('returns repeated for high recurrence + evidence', () => {
    expect(refreshValidationState({ recurrenceCount: 3, evidence: [{}, {}] })).toBe('repeated');
  });

  test('returns observed for single observation', () => {
    expect(refreshValidationState({ recurrenceCount: 1, evidence: [{}] })).toBe('observed');
  });

  test('returns inferred for no evidence', () => {
    expect(refreshValidationState({ recurrenceCount: 0, evidence: [] })).toBe('inferred');
  });

  test('preserves user-confirmed', () => {
    expect(refreshValidationState({ validationState: 'user-confirmed', recurrenceCount: 1, evidence: [] })).toBe('user-confirmed');
  });
});

describe('markStale', () => {
  test('marks old active entries as stale', () => {
    setupOrgWithEntries();
    // The fixture has entries with lastSeenAt in March 2026
    // With maxAgeDays: 0, everything should be marked stale
    const result = markStale('acme-prod', tmpDir, { maxAgeDays: 0 });
    expect(result.markedStale).toBeGreaterThan(0);
  });

  test('does not mark recent entries', () => {
    registerRunbook('fresh-org', { scopeType: 'org', scopeKey: 'fresh-org', title: 'Fresh', status: 'active' }, tmpDir);
    const store = { runbookId: 'org-fresh-org', version: '1.0.0', entries: [{
      entryId: 'e1', section: 'S', title: 'T', summary: 'S',
      validationStatus: 'active', lifecycleStatus: 'confirmed',
      confidence: 0.7, recurrenceCount: 1,
      firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(),
      evidence: [], sourceAgents: [], relatedObjects: [],
      supersedes: [], supersededBy: [], conflictsWith: [], category: 'known-exception'
    }], updatedAt: '' };
    saveEntries('fresh-org', 'org-fresh-org', store, tmpDir);

    const result = markStale('fresh-org', tmpDir, { maxAgeDays: 90 });
    expect(result.markedStale).toBe(0);
  });
});

describe('deprecateStale', () => {
  test('deprecates stale entries past threshold', () => {
    registerRunbook('stale-org', { scopeType: 'org', scopeKey: 'stale-org', title: 'Stale', status: 'active' }, tmpDir);
    const store = { runbookId: 'org-stale-org', version: '1.0.0', entries: [{
      entryId: 'e1', section: 'S', title: 'T', summary: 'S',
      validationStatus: 'stale', lifecycleStatus: 'stale',
      confidence: 0.5, recurrenceCount: 1,
      firstSeenAt: '2025-01-01T00:00:00.000Z', lastSeenAt: '2025-01-01T00:00:00.000Z',
      evidence: [], sourceAgents: [], relatedObjects: [],
      supersedes: [], supersededBy: [], conflictsWith: [], category: 'known-exception'
    }], updatedAt: '' };
    saveEntries('stale-org', 'org-stale-org', store, tmpDir);

    const result = deprecateStale('stale-org', tmpDir, { maxStaleDays: 0 });
    expect(result.deprecated).toBe(1);
  });
});

describe('archiveDeprecated', () => {
  test('moves deprecated entries to archive', () => {
    registerRunbook('arch-org', { scopeType: 'org', scopeKey: 'arch-org', title: 'Arch', status: 'active' }, tmpDir);
    const store = { runbookId: 'org-arch-org', version: '1.0.0', entries: [{
      entryId: 'e1', section: 'S', title: 'T', summary: 'S',
      validationStatus: 'deprecated', lifecycleStatus: 'stale',
      confidence: 0.3, recurrenceCount: 1,
      firstSeenAt: '2025-01-01T00:00:00.000Z', lastSeenAt: '2025-01-01T00:00:00.000Z',
      evidence: [], sourceAgents: [], relatedObjects: [],
      supersedes: [], supersededBy: [], conflictsWith: [], category: 'known-exception'
    }], updatedAt: '' };
    saveEntries('arch-org', 'org-arch-org', store, tmpDir);

    const result = archiveDeprecated('arch-org', tmpDir);
    expect(result.archived).toBe(1);

    // Verify removed from live store
    const live = loadEntries('arch-org', 'org-arch-org', tmpDir);
    expect(live.entries).toHaveLength(0);

    // Verify present in archive
    const archivePath = path.join(tmpDir, 'instances', 'arch-org', 'runbooks', 'entries', 'archive', 'org-arch-org.json');
    expect(fs.existsSync(archivePath)).toBe(true);
    const archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
    expect(archive.entries).toHaveLength(1);
    expect(archive.entries[0].archivedAt).toBeDefined();
  });
});
