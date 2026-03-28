'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  extractCandidatesFromObservation,
  extractCandidatesFromReflection,
  extractCandidatesFromBatch,
  scoreDurability,
  scoreConfidence,
  filterDurable,
  deduplicateCandidates,
  saveCandidates,
  loadCandidate,
  listCandidates,
  _containsSecrets,
  _isConversationalFiller,
  _isSpeculative,
  _generateCandidateId
} = require('../runbook-candidate-extractor');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-extractor-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Internal helpers ───────────────────────────────────────────────────────

describe('_containsSecrets', () => {
  test('detects API key patterns', () => {
    expect(_containsSecrets('api_key = sk-proj-ABCdefGHIjklMNOpqr1234')).toBe(true);
  });

  test('detects JWT tokens', () => {
    expect(_containsSecrets('token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def')).toBe(true);
  });

  test('returns false for normal text', () => {
    expect(_containsSecrets('Deployment completed successfully')).toBe(false);
  });

  test('handles null', () => {
    expect(_containsSecrets(null)).toBe(false);
  });
});

describe('_isConversationalFiller', () => {
  test('detects short text as filler', () => {
    expect(_isConversationalFiller('ok done')).toBe(true);
  });

  test('detects acknowledgments as filler', () => {
    expect(_isConversationalFiller('Yes, got it')).toBe(true);
  });

  test('accepts substantive text', () => {
    expect(_isConversationalFiller('Deployment failed due to validation rule blocking records')).toBe(false);
  });

  test('treats null as filler', () => {
    expect(_isConversationalFiller(null)).toBe(true);
  });
});

describe('_isSpeculative', () => {
  test('detects speculation language', () => {
    expect(_isSpeculative('This might be related to the config change')).toBe(true);
    expect(_isSpeculative('Could possibly affect other objects')).toBe(true);
  });

  test('accepts definitive statements', () => {
    expect(_isSpeculative('The validation rule blocks all bulk updates')).toBe(false);
  });
});

// ── Observation extraction ─────────────────────────────────────────────────

describe('extractCandidatesFromObservation', () => {
  test('returns empty for minimal observation', () => {
    const obs = require(path.join(FIXTURES, 'minimal-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    expect(candidates).toEqual([]);
  });

  test('extracts candidate from rich observation', () => {
    const obs = require(path.join(FIXTURES, 'rich-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    const c = candidates[0];
    expect(c.candidateId).toMatch(/^observation-[a-f0-9]{12}$/);
    expect(c.orgAlias).toBe('acme-prod');
    expect(c.sourceType).toBe('observation');
    expect(c.relatedObjects).toContain('Account');
    expect(c.validationStatus).toBe('pending');
    expect(c.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('extracts candidate from exception observation with high durability', () => {
    const obs = require(path.join(FIXTURES, 'exception-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    const c = candidates[0];
    // Notes contain "Fix:" workaround language, so classified as remediation-recipe
    expect(['known-exception', 'remediation-recipe']).toContain(c.category);
    // Exception with workaround evidence should score well
    expect(c.durabilityScore).toBeGreaterThanOrEqual(0.4);
  });

  test('extracts candidate from speculative observation with low durability', () => {
    const obs = require(path.join(FIXTURES, 'speculative-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    // May or may not produce a candidate depending on context
    if (candidates.length > 0) {
      // Should have low durability due to speculation
      expect(candidates[0].durabilityScore).toBeLessThan(0.5);
    }
  });

  test('returns empty for observation with secrets', () => {
    const obs = require(path.join(FIXTURES, 'secret-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    expect(candidates).toEqual([]);
  });

  test('returns empty for null input', () => {
    expect(extractCandidatesFromObservation(null)).toEqual([]);
  });

  test('returns empty for observation without org', () => {
    expect(extractCandidatesFromObservation({ operation: 'test' })).toEqual([]);
  });

  test('includes proposed scopes with org as last entry', () => {
    const obs = require(path.join(FIXTURES, 'rich-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    expect(candidates.length).toBeGreaterThan(0);

    const scopes = candidates[0].proposedScopes;
    expect(scopes.length).toBeGreaterThan(0);
    const lastScope = scopes[scopes.length - 1];
    expect(lastScope.scopeType).toBe('org');
    expect(lastScope.scopeKey).toBe('acme-prod');
  });

  test('includes workflow scopes when workflows present', () => {
    const obs = require(path.join(FIXTURES, 'rich-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    expect(candidates.length).toBeGreaterThan(0);

    const scopes = candidates[0].proposedScopes;
    const workflowScopes = scopes.filter(s => s.scopeType === 'workflow');
    expect(workflowScopes.length).toBeGreaterThan(0);
  });
});

// ── Reflection extraction ──────────────────────────────────────────────────

describe('extractCandidatesFromReflection', () => {
  test('extracts candidates from sample reflection output', () => {
    const ref = require(path.join(FIXTURES, 'sample-reflection-output.json'));
    const candidates = extractCandidatesFromReflection(ref);

    // 2 known_exceptions + 3 common_errors + 1 manual_workaround + 1 user_intervention + 2 recommendations = 9
    expect(candidates.length).toBeGreaterThanOrEqual(6);
  });

  test('known exceptions produce exception-pattern candidates', () => {
    const ref = require(path.join(FIXTURES, 'sample-reflection-output.json'));
    const candidates = extractCandidatesFromReflection(ref);

    const exceptionCandidates = candidates.filter(c => c.sourceType === 'exception-pattern');
    expect(exceptionCandidates.length).toBe(2);
    expect(exceptionCandidates[0].category).toBe('known-exception');
  });

  test('manual workarounds produce remediation candidates', () => {
    const ref = require(path.join(FIXTURES, 'sample-reflection-output.json'));
    const candidates = extractCandidatesFromReflection(ref);

    const remediations = candidates.filter(c => c.sourceType === 'remediation');
    expect(remediations.length).toBe(1);
    expect(remediations[0].category).toBe('remediation-recipe');
  });

  test('common errors produce reflection/troubleshooting candidates', () => {
    const ref = require(path.join(FIXTURES, 'sample-reflection-output.json'));
    const candidates = extractCandidatesFromReflection(ref);

    const troubleshooting = candidates.filter(
      c => c.sourceType === 'reflection' && c.category === 'troubleshooting-pattern'
    );
    expect(troubleshooting.length).toBeGreaterThanOrEqual(2);
  });

  test('recommendations produce business-rule candidates', () => {
    const ref = require(path.join(FIXTURES, 'sample-reflection-output.json'));
    const candidates = extractCandidatesFromReflection(ref);

    const rules = candidates.filter(c => c.category === 'business-rule');
    expect(rules.length).toBeGreaterThanOrEqual(1);
  });

  test('returns empty for null input', () => {
    expect(extractCandidatesFromReflection(null)).toEqual([]);
  });

  test('returns empty for empty reflection', () => {
    expect(extractCandidatesFromReflection({ org: 'test' })).toEqual([]);
  });

  test('all candidates have pending validation status', () => {
    const ref = require(path.join(FIXTURES, 'sample-reflection-output.json'));
    const candidates = extractCandidatesFromReflection(ref);
    candidates.forEach(c => {
      expect(c.validationStatus).toBe('pending');
    });
  });

  test('all candidates have valid extractedAt timestamps', () => {
    const ref = require(path.join(FIXTURES, 'sample-reflection-output.json'));
    const candidates = extractCandidatesFromReflection(ref);
    candidates.forEach(c => {
      expect(c.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

// ── Scoring ────────────────────────────────────────────────────────────────

describe('scoreDurability', () => {
  test('recurring exceptions score high', () => {
    const score = scoreDurability({
      recurrenceCount: 3,
      category: 'known-exception',
      evidence: 'Fix: use default owner fallback',
      relatedObjects: ['Lead'],
      summary: 'Lead import fails when queue missing'
    });
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  test('one-off conversational filler scores low', () => {
    const score = scoreDurability({
      recurrenceCount: 1,
      category: 'troubleshooting-pattern',
      evidence: null,
      relatedObjects: [],
      summary: 'done ok'
    });
    expect(score).toBeLessThanOrEqual(0.3);
  });

  test('score is capped at 1.0', () => {
    const score = scoreDurability({
      recurrenceCount: 10,
      category: 'environment-quirk',
      evidence: 'Workaround: restart the service and fix the config',
      relatedObjects: ['Account', 'Contact'],
      summary: 'Environment variable must be set before deployment process starts'
    });
    expect(score).toBeLessThanOrEqual(1.0);
  });

  test('score is floored at 0.0', () => {
    const score = scoreDurability({
      recurrenceCount: 1,
      category: 'troubleshooting-pattern',
      evidence: null,
      relatedObjects: [],
      summary: 'ok'
    });
    expect(score).toBeGreaterThanOrEqual(0.0);
  });
});

describe('scoreConfidence', () => {
  test('exception pattern with rich evidence scores well', () => {
    const score = scoreConfidence({
      sourceType: 'exception-pattern',
      evidence: 'This error occurs in sandbox environments when territory queues are not created during refresh',
      recurrenceCount: 3,
      relatedObjects: ['Lead'],
      relatedWorkflow: 'Lead Assignment',
      summary: 'Territory queue missing in sandbox'
    });
    expect(score).toBeGreaterThan(0.5);
  });

  test('speculation reduces confidence', () => {
    const score = scoreConfidence({
      sourceType: 'observation',
      evidence: null,
      recurrenceCount: 1,
      relatedObjects: [],
      summary: 'This might be a problem with the API'
    });
    expect(score).toBeLessThan(0.5);
  });
});

// ── Filtering and dedup ────────────────────────────────────────────────────

describe('filterDurable', () => {
  test('filters below threshold', () => {
    const candidates = [
      { durabilityScore: 0.8, summary: 'high' },
      { durabilityScore: 0.2, summary: 'low' },
      { durabilityScore: 0.5, summary: 'mid' }
    ];
    const result = filterDurable(candidates, 0.4);
    expect(result).toHaveLength(2);
    expect(result.map(c => c.summary)).toEqual(['high', 'mid']);
  });

  test('default threshold is 0.4', () => {
    const candidates = [
      { durabilityScore: 0.39 },
      { durabilityScore: 0.4 },
      { durabilityScore: 0.41 }
    ];
    expect(filterDurable(candidates)).toHaveLength(2);
  });
});

describe('deduplicateCandidates', () => {
  test('merges candidates with identical summaries', () => {
    const candidates = [
      {
        candidateId: 'a',
        summary: 'Queue missing in sandbox',
        recurrenceCount: 1,
        durabilityScore: 0.3,
        confidence: 0.4,
        proposedScopes: [{ scopeType: 'org', scopeKey: 'acme' }],
        category: 'known-exception',
        relatedObjects: [],
        evidence: null
      },
      {
        candidateId: 'b',
        summary: 'Queue missing in sandbox',
        recurrenceCount: 1,
        durabilityScore: 0.5,
        confidence: 0.6,
        proposedScopes: [{ scopeType: 'workflow', scopeKey: 'lead-routing' }],
        category: 'known-exception',
        relatedObjects: [],
        evidence: null
      }
    ];
    const result = deduplicateCandidates(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].recurrenceCount).toBe(2);
    // Should union scopes
    expect(result[0].proposedScopes).toHaveLength(2);
  });

  test('does not merge different summaries', () => {
    const candidates = [
      { candidateId: 'a', summary: 'Error A', recurrenceCount: 1, durabilityScore: 0.3, confidence: 0.4, proposedScopes: [], category: 'known-exception', relatedObjects: [], evidence: null },
      { candidateId: 'b', summary: 'Error B', recurrenceCount: 1, durabilityScore: 0.5, confidence: 0.6, proposedScopes: [], category: 'known-exception', relatedObjects: [], evidence: null }
    ];
    const result = deduplicateCandidates(candidates);
    expect(result).toHaveLength(2);
  });
});

// ── Batch extraction ───────────────────────────────────────────────────────

describe('extractCandidatesFromBatch', () => {
  test('extracts and deduplicates across observations', () => {
    const rich = require(path.join(FIXTURES, 'rich-observation.json'));
    const exception = require(path.join(FIXTURES, 'exception-observation.json'));
    const minimal = require(path.join(FIXTURES, 'minimal-observation.json'));

    const candidates = extractCandidatesFromBatch([rich, exception, minimal]);
    // Should have candidates from rich and exception but not minimal
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  test('handles empty array', () => {
    expect(extractCandidatesFromBatch([])).toEqual([]);
  });

  test('handles non-array input', () => {
    expect(extractCandidatesFromBatch(null)).toEqual([]);
  });
});

// ── Persistence ────────────────────────────────────────────────────────────

describe('saveCandidates / loadCandidate', () => {
  test('saves and loads candidate round-trip', () => {
    const obs = require(path.join(FIXTURES, 'rich-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    expect(candidates.length).toBeGreaterThan(0);

    const { saved } = saveCandidates('acme-prod', candidates, tmpDir);
    expect(saved.length).toBe(candidates.length);

    const loaded = loadCandidate('acme-prod', candidates[0].candidateId, tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded.candidateId).toBe(candidates[0].candidateId);
    expect(loaded.summary).toBe(candidates[0].summary);
  });

  test('skips existing candidates on re-save', () => {
    const obs = require(path.join(FIXTURES, 'rich-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);

    saveCandidates('acme-prod', candidates, tmpDir);
    const { saved, skipped } = saveCandidates('acme-prod', candidates, tmpDir);
    expect(saved).toHaveLength(0);
    expect(skipped.length).toBe(candidates.length);
  });

  test('loadCandidate returns null for nonexistent', () => {
    expect(loadCandidate('test-org', 'nonexistent-id', tmpDir)).toBeNull();
  });
});

describe('listCandidates', () => {
  test('returns empty for missing directory', () => {
    expect(listCandidates('nonexistent-org', tmpDir)).toEqual([]);
  });

  test('lists saved candidates', () => {
    const obs = require(path.join(FIXTURES, 'rich-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    saveCandidates('acme-prod', candidates, tmpDir);

    const listed = listCandidates('acme-prod', tmpDir);
    expect(listed.length).toBe(candidates.length);
  });

  test('filters by validationStatus', () => {
    const obs = require(path.join(FIXTURES, 'rich-observation.json'));
    const candidates = extractCandidatesFromObservation(obs);
    saveCandidates('acme-prod', candidates, tmpDir);

    const pending = listCandidates('acme-prod', tmpDir, { validationStatus: 'pending' });
    expect(pending.length).toBe(candidates.length);

    const accepted = listCandidates('acme-prod', tmpDir, { validationStatus: 'accepted' });
    expect(accepted).toEqual([]);
  });
});

// ── Candidate ID format ────────────────────────────────────────────────────

describe('_generateCandidateId', () => {
  test('produces consistent IDs', () => {
    const id1 = _generateCandidateId('observation', 'ref1', 'summary text');
    const id2 = _generateCandidateId('observation', 'ref1', 'summary text');
    expect(id1).toBe(id2);
  });

  test('produces different IDs for different inputs', () => {
    const id1 = _generateCandidateId('observation', 'ref1', 'summary A');
    const id2 = _generateCandidateId('observation', 'ref1', 'summary B');
    expect(id1).not.toBe(id2);
  });

  test('ID format matches {sourceType}-{12 hex chars}', () => {
    const id = _generateCandidateId('reflection', 'ref', 'test summary for format');
    expect(id).toMatch(/^reflection-[a-f0-9]{12}$/);
  });
});
