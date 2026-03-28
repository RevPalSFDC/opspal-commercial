'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

// Mock extractRunbookContext since it hardcodes pluginRoot from __dirname
jest.mock('../runbook-context-extractor', () => ({
  extractRunbookContext: jest.fn().mockReturnValue({
    exists: false,
    metadata: {},
    knownExceptions: [],
    workflows: [],
    recommendations: [],
    platformOverview: null,
    fieldPolicies: { fieldGuidance: [], requiredFields: {}, excludedFields: {}, taskVariantHints: {} },
    condensedSummary: {
      hasRunbook: false,
      message: 'No runbook available for this org'
    }
  })
}));

const {
  extractMultiRunbookContext, createMergedSummary, _deduplicateEntries
} = require('../runbook-multi-context-extractor');
const { registerRunbook } = require('../runbook-registry');
const { saveEntries } = require('../runbook-entry-store');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-context-test-'));
  jest.clearAllMocks();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function setupRunbookWithEntries() {
  registerRunbook('acme-prod', {
    title: 'Lead Routing Workflow',
    scopeType: 'workflow',
    scopeKey: 'lead-routing',
    status: 'active',
    linkedWorkflows: ['Lead Assignment', 'Lead Routing'],
    linkedObjects: ['Lead', 'User'],
    candidateCount: 5
  }, tmpDir);

  const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
  saveEntries('acme-prod', 'workflow-lead-routing', fixture, tmpDir);
}

// ── Backward compatibility ─────────────────────────────────────────────────

describe('backward compatibility', () => {
  test('returns base context shape when no runbooks in registry', () => {
    const result = extractMultiRunbookContext('empty-org', { pluginRoot: tmpDir });

    expect(result.exists).toBe(false);
    expect(result.condensedSummary).toBeDefined();
    expect(result.condensedSummary.hasRunbook).toBe(false);
    expect(result.scopedContext).toBeDefined();
    expect(result.scopedContext.scopedRunbooks).toEqual([]);
    expect(result.scopedContext.entryCount).toBe(0);
  });

  test('preserves base context fields', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', {
      workflowName: 'Lead Routing',
      pluginRoot: tmpDir
    });

    // Base fields from mocked extractRunbookContext
    expect(result.exists).toBe(false); // from mock
    expect(result.knownExceptions).toEqual([]);
    expect(result.workflows).toEqual([]);
  });
});

// ── Scoped context ─────────────────────────────────────────────────────────

describe('scoped context', () => {
  test('scopedContext field is present', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', {
      workflowName: 'Lead Routing',
      pluginRoot: tmpDir
    });

    expect(result.scopedContext).toBeDefined();
    expect(result.scopedContext.scopedRunbooks).toBeDefined();
    expect(Array.isArray(result.scopedContext.scopedRunbooks)).toBe(true);
  });

  test('returns entries from matching scoped runbook', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', {
      workflowName: 'Lead Routing',
      pluginRoot: tmpDir
    });

    expect(result.scopedContext.scopedRunbooks.length).toBeGreaterThan(0);
    const rb = result.scopedContext.scopedRunbooks[0];
    expect(rb.runbookId).toBe('workflow-lead-routing');
    expect(rb.entries.length).toBeGreaterThan(0);
  });

  test('filters entries by confidence >= 0.4', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', {
      workflowName: 'Lead Routing',
      pluginRoot: tmpDir
    });

    for (const rb of result.scopedContext.scopedRunbooks) {
      for (const entry of rb.entries) {
        expect(entry.confidence).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  test('excludes deprecated and superseded entries', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', {
      workflowName: 'Lead Routing',
      pluginRoot: tmpDir
    });

    for (const rb of result.scopedContext.scopedRunbooks) {
      for (const entry of rb.entries) {
        expect(['active', 'proposed']).toContain(entry.validationStatus);
      }
    }
  });
});

// ── Condensed summary ──────────────────────────────────────────────────────

describe('condensedSummary', () => {
  test('includes scoped fields', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', {
      workflowName: 'Lead Routing',
      pluginRoot: tmpDir
    });

    expect(result.condensedSummary.scopedRunbookCount).toBeDefined();
    expect(result.condensedSummary.scopedEntryCount).toBeDefined();
    expect(result.condensedSummary.topScopedGuidance).toBeDefined();
    expect(Array.isArray(result.condensedSummary.topScopedGuidance)).toBe(true);
  });

  test('topScopedGuidance has at most 5 entries', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', {
      pluginRoot: tmpDir
    });

    expect(result.condensedSummary.topScopedGuidance.length).toBeLessThanOrEqual(5);
  });
});

// ── createMergedSummary ────────────────────────────────────────────────────

describe('createMergedSummary', () => {
  test('returns empty string for empty input', () => {
    expect(createMergedSummary([])).toBe('');
    expect(createMergedSummary(null)).toBe('');
  });

  test('formats entries as confidence-sorted bullets', () => {
    const runbooks = [{
      entries: [
        { section: 'Known Exceptions', title: 'Low conf', summary: 'Low confidence entry', confidence: 0.3 },
        { section: 'Business Rules', title: 'High conf', summary: 'High confidence entry', confidence: 0.9 }
      ]
    }];
    const summary = createMergedSummary(runbooks);
    const lines = summary.split('\n');
    expect(lines[0]).toContain('High conf');
    expect(lines[1]).toContain('Low conf');
  });

  test('respects maxLength', () => {
    const runbooks = [{
      entries: Array.from({ length: 50 }, (_, i) => ({
        section: 'Known Exceptions',
        title: `Entry ${i}`,
        summary: `This is a fairly long summary for entry number ${i} that should add up`,
        confidence: 0.5
      }))
    }];
    const summary = createMergedSummary(runbooks, 200);
    expect(summary.length).toBeLessThanOrEqual(200);
  });
});

// ── _deduplicateEntries ────────────────────────────────────────────────────

describe('_deduplicateEntries', () => {
  test('deduplicates near-identical entries', () => {
    const entries = [
      { entryId: 'a', summary: 'Territory queue missing in sandbox environments causing lead failures', confidence: 0.8 },
      { entryId: 'b', summary: 'Territory queue missing in sandbox environments causing lead import failures', confidence: 0.7 }
    ];
    const result = _deduplicateEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.8); // keeps higher confidence
  });

  test('keeps distinct entries', () => {
    const entries = [
      { entryId: 'a', summary: 'Territory queue missing in sandbox', confidence: 0.8 },
      { entryId: 'b', summary: 'Case escalation flow skips priority check', confidence: 0.7 }
    ];
    const result = _deduplicateEntries(entries);
    expect(result).toHaveLength(2);
  });

  test('handles single entry', () => {
    const result = _deduplicateEntries([{ entryId: 'a', summary: 'test', confidence: 0.5 }]);
    expect(result).toHaveLength(1);
  });

  test('handles empty array', () => {
    expect(_deduplicateEntries([])).toEqual([]);
  });
});

// ── No-criteria fallback ───────────────────────────────────────────────────

describe('no-criteria fallback', () => {
  test('returns entries when no filtering criteria provided', () => {
    setupRunbookWithEntries();
    const result = extractMultiRunbookContext('acme-prod', { pluginRoot: tmpDir });

    // Should still load runbooks even without criteria
    expect(result.scopedContext.entryCount).toBeGreaterThan(0);
  });
});
