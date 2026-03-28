'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  loadEntries, saveEntries,
  getEntry, addEntry, updateEntry, removeEntry,
  listBySection, listByCategory, findSimilar,
  generateEntryId,
  SECTION_MAP, SECTION_ORDER, ENTRY_STORE_VERSION
} = require('../runbook-entry-store');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-store-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeEntry(overrides = {}) {
  return {
    entryId: 'test-entry-001',
    section: 'Known Exceptions',
    category: 'known-exception',
    title: 'Test exception entry',
    summary: 'This is a test entry for the entry store',
    details: null,
    evidence: [{ source: 'test', text: 'test evidence', timestamp: '2026-03-27T00:00:00.000Z' }],
    confidence: 0.7,
    recurrenceCount: 1,
    validationStatus: 'active',
    lifecycleStatus: 'new',
    firstSeenAt: '2026-03-27T00:00:00.000Z',
    lastSeenAt: '2026-03-27T00:00:00.000Z',
    sourceAgents: ['test-agent'],
    relatedObjects: ['Account'],
    relatedWorkflow: null,
    relatedProject: null,
    supersedes: [],
    supersededBy: [],
    conflictsWith: [],
    ...overrides
  };
}

// ── generateEntryId ────────────────────────────────────────────────────────

describe('generateEntryId', () => {
  test('is deterministic', () => {
    const id1 = generateEntryId('Known Exceptions', 'Test Title', 'Test summary');
    const id2 = generateEntryId('Known Exceptions', 'Test Title', 'Test summary');
    expect(id1).toBe(id2);
  });

  test('different inputs produce different IDs', () => {
    const id1 = generateEntryId('Known Exceptions', 'Title A', 'Summary A');
    const id2 = generateEntryId('Known Exceptions', 'Title B', 'Summary B');
    expect(id1).not.toBe(id2);
  });

  test('normalizes section name in prefix', () => {
    const id = generateEntryId('Known Exceptions', 'Test', 'Summary');
    expect(id).toMatch(/^known-exceptions-/);
  });
});

// ── Load / Save ────────────────────────────────────────────────────────────

describe('loadEntries', () => {
  test('returns empty store when file missing', () => {
    const store = loadEntries('test-org', 'workflow-test', tmpDir);
    expect(store.runbookId).toBe('workflow-test');
    expect(store.entries).toEqual([]);
    expect(store.version).toBe(ENTRY_STORE_VERSION);
  });

  test('loads existing fixture', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks', 'entries');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-lead-routing.json'), JSON.stringify(fixture));

    const store = loadEntries('acme-prod', 'workflow-lead-routing', tmpDir);
    expect(store.entries).toHaveLength(6);
  });
});

describe('saveEntries + loadEntries round-trip', () => {
  test('round-trips correctly', () => {
    const store = {
      runbookId: 'test-rb',
      version: '1.0.0',
      entries: [makeEntry()],
      updatedAt: ''
    };
    saveEntries('test-org', 'test-rb', store, tmpDir);
    const loaded = loadEntries('test-org', 'test-rb', tmpDir);
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0].entryId).toBe('test-entry-001');
  });

  test('writes to correct path', () => {
    saveEntries('my-org', 'my-rb', { runbookId: 'my-rb', version: '1.0.0', entries: [], updatedAt: '' }, tmpDir);
    const expected = path.join(tmpDir, 'instances', 'my-org', 'runbooks', 'entries', 'my-rb.json');
    expect(fs.existsSync(expected)).toBe(true);
  });
});

// ── CRUD ───────────────────────────────────────────────────────────────────

describe('addEntry / getEntry', () => {
  test('add and retrieve', () => {
    const store = loadEntries('test-org', 'test-rb', tmpDir);
    const entry = makeEntry();
    addEntry(store, entry);
    const found = getEntry(store, 'test-entry-001');
    expect(found).not.toBeNull();
    expect(found.title).toBe('Test exception entry');
  });

  test('getEntry returns null for missing', () => {
    const store = loadEntries('test-org', 'test-rb', tmpDir);
    expect(getEntry(store, 'nonexistent')).toBeNull();
  });

  test('addEntry throws without required fields', () => {
    const store = loadEntries('test-org', 'test-rb', tmpDir);
    expect(() => addEntry(store, { entryId: 'x' })).toThrow();
  });
});

describe('updateEntry', () => {
  test('updates existing entry', () => {
    const store = loadEntries('test-org', 'test-rb', tmpDir);
    addEntry(store, makeEntry());
    const result = updateEntry(store, 'test-entry-001', { confidence: 0.9, recurrenceCount: 5 });
    expect(result).toBe(true);
    expect(getEntry(store, 'test-entry-001').confidence).toBe(0.9);
    expect(getEntry(store, 'test-entry-001').recurrenceCount).toBe(5);
  });

  test('returns false for missing entry', () => {
    const store = loadEntries('test-org', 'test-rb', tmpDir);
    expect(updateEntry(store, 'nonexistent', { confidence: 0.9 })).toBe(false);
  });
});

describe('removeEntry', () => {
  test('removes existing entry', () => {
    const store = loadEntries('test-org', 'test-rb', tmpDir);
    addEntry(store, makeEntry());
    expect(removeEntry(store, 'test-entry-001')).toBe(true);
    expect(store.entries).toHaveLength(0);
  });

  test('returns false for missing entry', () => {
    const store = loadEntries('test-org', 'test-rb', tmpDir);
    expect(removeEntry(store, 'nonexistent')).toBe(false);
  });
});

// ── Query ──────────────────────────────────────────────────────────────────

describe('listBySection', () => {
  test('filters by section', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    const exceptions = listBySection(fixture, 'Known Exceptions');
    expect(exceptions).toHaveLength(2);
    const nuances = listBySection(fixture, 'Workflow Nuances');
    expect(nuances).toHaveLength(2);
  });

  test('returns empty for nonexistent section', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    expect(listBySection(fixture, 'Nonexistent')).toEqual([]);
  });
});

describe('listByCategory', () => {
  test('filters by category', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    expect(listByCategory(fixture, 'known-exception')).toHaveLength(2);
    expect(listByCategory(fixture, 'business-rule')).toHaveLength(1);
  });
});

// ── findSimilar ────────────────────────────────────────────────────────────

describe('findSimilar', () => {
  test('finds exact match', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    // Use the entry's own summary to get a near-perfect match
    const results = findSimilar(fixture, 'Lead import fails when territory queues don\'t exist in sandbox environments after refresh');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].similarity).toBeGreaterThanOrEqual(0.55);
  });

  test('finds close match above threshold', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    // Similar phrasing — close to first entry's summary but rephrased
    const results = findSimilar(fixture, 'Lead import fails when territory queues are missing in sandbox environments after a refresh');
    expect(results.length).toBeGreaterThan(0);
  });

  test('does not match distant text', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    const results = findSimilar(fixture, 'Completely unrelated topic about weather forecasting');
    expect(results).toHaveLength(0);
  });

  test('returns empty for empty store', () => {
    const store = { entries: [] };
    expect(findSimilar(store, 'anything')).toEqual([]);
  });

  test('returns empty for null summary', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    expect(findSimilar(fixture, null)).toEqual([]);
  });

  test('results are sorted by similarity descending', () => {
    const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
    const results = findSimilar(fixture, 'queue missing sandbox territory lead', 0.3);
    if (results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    }
  });
});

// ── Constants ──────────────────────────────────────────────────────────────

describe('constants', () => {
  test('SECTION_MAP has entries for all candidate categories', () => {
    const categories = [
      'known-exception', 'environment-quirk', 'workflow-nuance',
      'business-rule', 'troubleshooting-pattern', 'remediation-recipe',
      'checklist-lesson', 'integration-note'
    ];
    for (const cat of categories) {
      expect(SECTION_MAP[cat]).toBeDefined();
    }
  });

  test('SECTION_ORDER has at least 8 entries', () => {
    expect(SECTION_ORDER.length).toBeGreaterThanOrEqual(8);
  });
});
