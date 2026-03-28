'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-compat-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('backward compatibility', () => {
  test('loadRegistry returns empty when runbooks/ directory is absent', () => {
    const { loadRegistry } = require('../runbook-registry');
    const registry = loadRegistry('nonexistent-org', tmpDir);
    expect(registry.runbooks).toEqual([]);
    expect(registry.org).toBe('nonexistent-org');
  });

  test('listCandidates returns empty when candidates/ directory is absent', () => {
    const { listCandidates } = require('../runbook-candidate-extractor');
    const candidates = listCandidates('nonexistent-org', tmpDir);
    expect(candidates).toEqual([]);
  });

  test('findBestMatch returns empty on empty registry', () => {
    const { findBestMatch } = require('../runbook-registry');
    const results = findBestMatch('nonexistent-org', { scopeType: 'workflow', scopeKey: 'test' }, tmpDir);
    expect(results).toEqual([]);
  });

  test('existing RUNBOOK.md is untouched by registry operations', () => {
    // Create a mock RUNBOOK.md
    const orgDir = path.join(tmpDir, 'instances', 'test-org');
    fs.mkdirSync(orgDir, { recursive: true });
    const runbookContent = '# Test Org Runbook\n\nThis is a test runbook.\n';
    fs.writeFileSync(path.join(orgDir, 'RUNBOOK.md'), runbookContent);

    // Perform registry operations
    const { registerRunbook, loadRegistry } = require('../runbook-registry');
    registerRunbook('test-org', {
      title: 'Test Workflow',
      scopeType: 'workflow',
      scopeKey: 'test-flow'
    }, tmpDir);

    // Verify RUNBOOK.md is unchanged
    const afterContent = fs.readFileSync(path.join(orgDir, 'RUNBOOK.md'), 'utf-8');
    expect(afterContent).toBe(runbookContent);
  });

  test('registry operations create files in runbooks/ not alongside RUNBOOK.md', () => {
    const { registerRunbook } = require('../runbook-registry');
    registerRunbook('test-org', {
      title: 'Test',
      scopeType: 'workflow',
      scopeKey: 'test'
    }, tmpDir);

    // Registry should be in runbooks/
    const registryPath = path.join(tmpDir, 'instances', 'test-org', 'runbooks', 'registry.json');
    expect(fs.existsSync(registryPath)).toBe(true);

    // Nothing should be created at the instance root level by the registry
    const instanceDir = path.join(tmpDir, 'instances', 'test-org');
    const rootFiles = fs.readdirSync(instanceDir);
    // Only 'runbooks' directory should be there
    expect(rootFiles).toContain('runbooks');
    expect(rootFiles).not.toContain('registry.json');
  });

  test('extractRunbookContext function signature is unchanged', () => {
    // This test verifies the contract that the existing context extractor
    // is not broken by the presence of the new runbooks/ directory.
    // extractRunbookContext(org, options) reads RUNBOOK.md from its own plugin root,
    // not from registry.json. We verify the function exists and accepts the
    // expected parameters without error.
    const contextExtractor = require('../runbook-context-extractor');
    expect(typeof contextExtractor.extractRunbookContext).toBe('function');

    // The function takes (org, options) — 2 params
    expect(contextExtractor.extractRunbookContext.length).toBeLessThanOrEqual(2);

    // When called with a non-existent org, it returns { exists: false, ... }
    // This calls into the real plugin's instances/ dir, which won't have
    // this test org. The important thing is it doesn't throw.
    const result = contextExtractor.extractRunbookContext('nonexistent-backward-compat-test-org');
    expect(result.exists).toBe(false);
    expect(result.condensedSummary).toBeDefined();
    expect(result.condensedSummary.hasRunbook).toBe(false);
  });

  test('candidate extractor module loads independently without registry', () => {
    // Verify the extractor has no hard dependency on the registry
    const extractor = require('../runbook-candidate-extractor');
    expect(typeof extractor.extractCandidatesFromObservation).toBe('function');
    expect(typeof extractor.extractCandidatesFromReflection).toBe('function');
    expect(typeof extractor.scoreDurability).toBe('function');
  });

  test('resolver module loads after registry', () => {
    const resolver = require('../runbook-resolver');
    expect(typeof resolver.resolveCandidate).toBe('function');
    expect(typeof resolver.resolveBatch).toBe('function');
    expect(typeof resolver.buildScopeHierarchy).toBe('function');
  });
});
