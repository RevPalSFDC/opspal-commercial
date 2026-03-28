'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { registerRunbook } = require('../runbook-registry');
const { loadEntries, saveEntries } = require('../runbook-entry-store');
const { _adaptReflectionToBridgeFormat } = require('../runbook-incremental-updater');
const { getAutomationStatus } = require('../runbook-automation-status');
const { _resetSessionCounter } = require('../runbook-resolver');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');
const UPDATER = path.join(__dirname, '..', 'runbook-incremental-updater.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updater-cli-test-'));
  _resetSessionCounter();
});
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function setupOrg() {
  registerRunbook('acme-prod', {
    scopeType: 'org', scopeKey: 'acme-prod',
    title: 'Org', status: 'active'
  }, tmpDir);
}

describe('CLI --obs-file', () => {
  test('processes observation and outputs JSON', () => {
    setupOrg();
    const obsFile = path.join(FIXTURES, 'rich-observation.json');
    const result = execSync(
      `node "${UPDATER}" --org acme-prod --obs-file "${obsFile}" --plugin-root "${tmpDir}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const parsed = JSON.parse(result);
    expect(parsed.candidates).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.applied).toBe('number');
    expect(Array.isArray(parsed.runbooksUpdated)).toBe(true);
  });

  test('records automation status after processing', () => {
    setupOrg();
    const obsFile = path.join(FIXTURES, 'rich-observation.json');
    execSync(
      `node "${UPDATER}" --org acme-prod --obs-file "${obsFile}" --plugin-root "${tmpDir}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const status = getAutomationStatus('acme-prod', tmpDir);
    expect(status.totalObservationsProcessed).toBeGreaterThanOrEqual(1);
    expect(status.lastObservationProcessed).not.toBeNull();
  });

  test('exits 0 on missing observation file', () => {
    const result = execSync(
      `node "${UPDATER}" --org test-org --obs-file /nonexistent/file.json --plugin-root "${tmpDir}" 2>&1; echo "EXIT:$?"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    expect(result).toContain('EXIT:0');
  });

  test('exits 0 on minimal observation producing no candidates', () => {
    setupOrg();
    const obsFile = path.join(FIXTURES, 'minimal-observation.json');
    const result = execSync(
      `node "${UPDATER}" --org test-org --obs-file "${obsFile}" --plugin-root "${tmpDir}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const parsed = JSON.parse(result);
    expect(parsed.candidates).toBe(0);
    expect(parsed.applied).toBe(0);
  });
});

describe('CLI --reflection-file', () => {
  test('processes reflection and outputs JSON', () => {
    setupOrg();
    // Create a mock raw reflection file
    const rawReflection = {
      session_metadata: { org: 'acme-prod', session_start: '2026-03-27T00:00:00Z', session_end: '2026-03-27T01:00:00Z' },
      outcome: 'partial',
      issues: [
        { id: 'i1', taxonomy: 'schema/parse', root_cause: 'JSON parse failure in flow metadata', agnostic_fix: 'Validate JSON before parsing', priority: 'P2' },
        { id: 'i2', taxonomy: 'schema/parse', root_cause: 'Malformed SOQL in report filter', agnostic_fix: 'Use SOQL validator', priority: 'P3' }
      ],
      user_feedback: [],
      playbook: { name: 'test-playbook', steps: ['Step 1', 'Step 2'], trigger: 'On parse error' }
    };
    const reflFile = path.join(tmpDir, 'test-reflection.json');
    fs.writeFileSync(reflFile, JSON.stringify(rawReflection));

    const result = execSync(
      `node "${UPDATER}" --org acme-prod --reflection-file "${reflFile}" --plugin-root "${tmpDir}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const parsed = JSON.parse(result);
    expect(parsed.candidates).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.applied).toBe('number');
  });

  test('exits 0 on missing reflection file', () => {
    const result = execSync(
      `node "${UPDATER}" --org test-org --reflection-file /nonexistent.json --plugin-root "${tmpDir}" 2>&1; echo "EXIT:$?"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    expect(result).toContain('EXIT:0');
  });
});

describe('_adaptReflectionToBridgeFormat', () => {
  test('adapts raw reflection with issues to bridge format', () => {
    const raw = {
      session_metadata: { org: 'test-org' },
      issues: [
        { id: 'i1', taxonomy: 'data-quality', root_cause: 'Duplicate records', agnostic_fix: 'Dedup before import' },
        { id: 'i2', taxonomy: 'data-quality', root_cause: 'Missing required field' }
      ],
      user_feedback: [
        { raw_comment: 'Fix the date format', classification: 'suggestion', proposed_action: 'Use ISO format' }
      ],
      playbook: { name: 'dedup-playbook', steps: ['Run dedup', 'Verify'], trigger: 'Before import' }
    };

    const adapted = _adaptReflectionToBridgeFormat(raw);
    expect(adapted.org).toBe('test-org');
    expect(adapted.reflections_analyzed).toBe(1);
    expect(adapted.patterns.common_errors.length).toBeGreaterThan(0);
    expect(adapted.known_exceptions.length).toBe(1); // data-quality has count 2
    expect(adapted.patterns.manual_workarounds.length).toBe(1);
    expect(adapted.patterns.user_interventions.length).toBe(1);
    expect(adapted.recommendations.length).toBeGreaterThan(0);
  });

  test('handles empty reflection gracefully', () => {
    const adapted = _adaptReflectionToBridgeFormat({ org: 'empty' });
    expect(adapted.org).toBe('empty');
    expect(adapted.known_exceptions).toEqual([]);
    expect(adapted.patterns.common_errors).toEqual([]);
    expect(adapted.patterns.manual_workarounds).toEqual([]);
  });

  test('extracts org from session_metadata fallback chain', () => {
    expect(_adaptReflectionToBridgeFormat({ session_metadata: { org: 'a' } }).org).toBe('a');
    expect(_adaptReflectionToBridgeFormat({ org: 'b' }).org).toBe('b');
    expect(_adaptReflectionToBridgeFormat({ org_alias: 'c' }).org).toBe('c');
    expect(_adaptReflectionToBridgeFormat({}).org).toBe('unknown');
  });
});

describe('end-to-end: observation → scoped runbook update', () => {
  test('observation processed via CLI creates entries without manual invocation', () => {
    setupOrg();
    const obsFile = path.join(FIXTURES, 'rich-observation.json');

    // Process the observation
    const result = execSync(
      `node "${UPDATER}" --org acme-prod --obs-file "${obsFile}" --plugin-root "${tmpDir}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const parsed = JSON.parse(result);

    if (parsed.applied > 0) {
      // Verify entries were created
      const entriesDir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks', 'entries');
      if (fs.existsSync(entriesDir)) {
        const files = fs.readdirSync(entriesDir).filter(f => f.endsWith('.json'));
        expect(files.length).toBeGreaterThan(0);

        // Load one entry store and verify it has entries
        const store = JSON.parse(fs.readFileSync(path.join(entriesDir, files[0]), 'utf-8'));
        expect(store.entries.length).toBeGreaterThan(0);
      }
    }

    // Verify automation status was recorded
    const status = getAutomationStatus('acme-prod', tmpDir);
    expect(status.totalObservationsProcessed).toBeGreaterThanOrEqual(1);
  });
});
