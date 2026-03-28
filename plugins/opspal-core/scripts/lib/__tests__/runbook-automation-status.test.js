'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  recordObservationProcessed,
  recordReflectionProcessed,
  recordReconciliation,
  recordError,
  getAutomationStatus
} = require('../runbook-automation-status');

let tmpDir;

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-status-test-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('getAutomationStatus', () => {
  test('returns empty defaults for missing file', () => {
    const status = getAutomationStatus('new-org', tmpDir);
    expect(status.lastObservationProcessed).toBeNull();
    expect(status.lastReflectionProcessed).toBeNull();
    expect(status.lastReconciliation).toBeNull();
    expect(status.totalObservationsProcessed).toBe(0);
    expect(status.totalReflectionsProcessed).toBe(0);
    expect(status.totalReconciliations).toBe(0);
    expect(status.errors).toEqual([]);
  });
});

describe('recordObservationProcessed', () => {
  test('records and loads back correctly', () => {
    recordObservationProcessed('test-org', 'obs-file.json', { applied: 1 }, tmpDir);
    const status = getAutomationStatus('test-org', tmpDir);
    expect(status.lastObservationProcessed).not.toBeNull();
    expect(status.lastObservationProcessed.obsFile).toBe('obs-file.json');
    expect(status.lastObservationProcessed.result.applied).toBe(1);
    expect(status.totalObservationsProcessed).toBe(1);
  });

  test('increments count on subsequent calls', () => {
    recordObservationProcessed('test-org', 'obs1.json', {}, tmpDir);
    recordObservationProcessed('test-org', 'obs2.json', {}, tmpDir);
    const status = getAutomationStatus('test-org', tmpDir);
    expect(status.totalObservationsProcessed).toBe(2);
    expect(status.lastObservationProcessed.obsFile).toBe('obs2.json');
  });
});

describe('recordReflectionProcessed', () => {
  test('records and loads back correctly', () => {
    recordReflectionProcessed('test-org', 'refl-file.json', { applied: 2 }, tmpDir);
    const status = getAutomationStatus('test-org', tmpDir);
    expect(status.lastReflectionProcessed).not.toBeNull();
    expect(status.lastReflectionProcessed.reflFile).toBe('refl-file.json');
    expect(status.totalReflectionsProcessed).toBe(1);
  });
});

describe('recordReconciliation', () => {
  test('records and loads back correctly', () => {
    const result = { compacted: { entriesRemoved: 2 } };
    recordReconciliation('test-org', result, tmpDir);
    const status = getAutomationStatus('test-org', tmpDir);
    expect(status.lastReconciliation).not.toBeNull();
    expect(status.lastReconciliation.result.compacted.entriesRemoved).toBe(2);
    expect(status.totalReconciliations).toBe(1);
  });
});

describe('recordError', () => {
  test('records error in errors array', () => {
    recordError('test-org', 'observation', 'Something failed', tmpDir);
    const status = getAutomationStatus('test-org', tmpDir);
    expect(status.errors).toHaveLength(1);
    expect(status.errors[0].source).toBe('observation');
    expect(status.errors[0].error).toBe('Something failed');
    expect(status.errors[0].timestamp).toBeDefined();
  });

  test('bounds errors to max 50', () => {
    for (let i = 0; i < 60; i++) {
      recordError('test-org', 'test', `Error ${i}`, tmpDir);
    }
    const status = getAutomationStatus('test-org', tmpDir);
    expect(status.errors.length).toBeLessThanOrEqual(50);
    // Most recent should be last
    expect(status.errors[status.errors.length - 1].error).toBe('Error 59');
  });

  test('handles Error objects', () => {
    recordError('test-org', 'reconcile', new Error('test error'), tmpDir);
    const status = getAutomationStatus('test-org', tmpDir);
    expect(status.errors[0].error).toBe('test error');
  });
});

describe('status file path', () => {
  test('creates file at correct location', () => {
    recordObservationProcessed('my-org', 'obs.json', {}, tmpDir);
    const expected = path.join(tmpDir, 'instances', 'my-org', 'runbooks', '.automation-status.json');
    expect(fs.existsSync(expected)).toBe(true);
  });
});
