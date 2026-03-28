'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  loadRegistry, saveRegistry, registerRunbook,
  lookupByScope, lookupByAgent, lookupByWorkflow,
  lookupByObject, lookupByTags, lookupByAlias,
  findBestMatch, generateSlug, parseRunbookId, normalizeAlias,
  VALID_SCOPE_TYPES, REGISTRY_VERSION
} = require('../runbook-registry');

// Each test gets an isolated tmpdir as pluginRoot
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runbook-registry-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Slug utilities ─────────────────────────────────────────────────────────

describe('generateSlug', () => {
  test('generates slug from scope type and key', () => {
    expect(generateSlug('workflow', 'Lead Routing')).toBe('workflow-lead-routing');
  });

  test('handles hyphens and underscores in scope key', () => {
    expect(generateSlug('sub-agent', 'sfdc-orchestrator')).toBe('sub-agent-sfdc-orchestrator');
  });

  test('handles special characters', () => {
    expect(generateSlug('project', 'Q2 2026/CPQ Migration')).toBe('project-q2-2026-cpq-migration');
  });

  test('throws on empty inputs', () => {
    expect(() => generateSlug('', 'key')).toThrow();
    expect(() => generateSlug('workflow', '')).toThrow();
  });
});

describe('parseRunbookId', () => {
  test('parses standard workflow ID', () => {
    expect(parseRunbookId('workflow-lead-routing')).toEqual({
      scopeType: 'workflow',
      scopeKey: 'lead-routing'
    });
  });

  test('parses sub-agent ID (hyphenated scope type)', () => {
    expect(parseRunbookId('sub-agent-sfdc-orchestrator')).toEqual({
      scopeType: 'sub-agent',
      scopeKey: 'sfdc-orchestrator'
    });
  });

  test('parses org ID', () => {
    expect(parseRunbookId('org-acme-prod')).toEqual({
      scopeType: 'org',
      scopeKey: 'acme-prod'
    });
  });

  test('throws on empty input', () => {
    expect(() => parseRunbookId('')).toThrow();
    expect(() => parseRunbookId(null)).toThrow();
  });
});

describe('normalizeAlias', () => {
  test('normalizes alias with spaces', () => {
    expect(normalizeAlias('Lead Routing Workflow')).toBe('lead-routing-workflow');
  });

  test('normalizes alias with underscores', () => {
    expect(normalizeAlias('lead_routing')).toBe('lead-routing');
  });

  test('handles empty string', () => {
    expect(normalizeAlias('')).toBe('');
  });
});

// ── Registry I/O ───────────────────────────────────────────────────────────

describe('loadRegistry', () => {
  test('returns empty registry when file does not exist', () => {
    const registry = loadRegistry('nonexistent-org', tmpDir);
    expect(registry.version).toBe(REGISTRY_VERSION);
    expect(registry.org).toBe('nonexistent-org');
    expect(registry.runbooks).toEqual([]);
    expect(registry.updatedAt).toBeDefined();
  });

  test('loads existing registry from file', () => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const registryDir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(path.join(registryDir, 'registry.json'), JSON.stringify(fixture));

    const registry = loadRegistry('acme-prod', tmpDir);
    expect(registry.runbooks).toHaveLength(3);
    expect(registry.org).toBe('acme-prod');
  });
});

describe('saveRegistry + loadRegistry round-trip', () => {
  test('saved registry can be loaded back identically', () => {
    const registry = {
      version: '1.0.0',
      org: 'test-org',
      runbooks: [{
        id: 'workflow-test',
        title: 'Test Workflow',
        scopeType: 'workflow',
        scopeKey: 'test',
        parentRunbook: null,
        tags: ['test'],
        aliases: [],
        linkedAgents: [],
        linkedWorkflows: [],
        linkedObjects: [],
        createdAt: '2026-03-27T00:00:00.000Z',
        updatedAt: '2026-03-27T00:00:00.000Z',
        status: 'draft',
        candidateCount: 0
      }],
      updatedAt: '2026-03-27T00:00:00.000Z'
    };

    saveRegistry('test-org', registry, tmpDir);
    const loaded = loadRegistry('test-org', tmpDir);

    expect(loaded.runbooks).toHaveLength(1);
    expect(loaded.runbooks[0].id).toBe('workflow-test');
    expect(loaded.runbooks[0].title).toBe('Test Workflow');
  });

  test('saves to correct path', () => {
    saveRegistry('my-org', { version: '1.0.0', org: 'my-org', runbooks: [], updatedAt: '' }, tmpDir);
    const expectedPath = path.join(tmpDir, 'instances', 'my-org', 'runbooks', 'registry.json');
    expect(fs.existsSync(expectedPath)).toBe(true);
  });
});

// ── registerRunbook ────────────────────────────────────────────────────────

describe('registerRunbook', () => {
  test('inserts new runbook and returns ID', () => {
    const id = registerRunbook('test-org', {
      title: 'Lead Routing',
      scopeType: 'workflow',
      scopeKey: 'lead-routing',
      tags: ['routing']
    }, tmpDir);

    expect(id).toBe('workflow-lead-routing');

    const registry = loadRegistry('test-org', tmpDir);
    expect(registry.runbooks).toHaveLength(1);
    expect(registry.runbooks[0].title).toBe('Lead Routing');
    expect(registry.runbooks[0].status).toBe('draft');
    expect(registry.runbooks[0].createdAt).toBeDefined();
  });

  test('updates existing runbook preserving createdAt', () => {
    registerRunbook('test-org', {
      title: 'Original Title',
      scopeType: 'workflow',
      scopeKey: 'test-flow'
    }, tmpDir);

    const before = loadRegistry('test-org', tmpDir);
    const originalCreatedAt = before.runbooks[0].createdAt;

    registerRunbook('test-org', {
      id: 'workflow-test-flow',
      title: 'Updated Title',
      scopeType: 'workflow',
      scopeKey: 'test-flow',
      tags: ['updated']
    }, tmpDir);

    const after = loadRegistry('test-org', tmpDir);
    expect(after.runbooks).toHaveLength(1);
    expect(after.runbooks[0].title).toBe('Updated Title');
    expect(after.runbooks[0].createdAt).toBe(originalCreatedAt);
    expect(after.runbooks[0].tags).toEqual(['updated']);
  });

  test('handles multiple registrations', () => {
    registerRunbook('test-org', { scopeType: 'org', scopeKey: 'test-org', title: 'Org' }, tmpDir);
    registerRunbook('test-org', { scopeType: 'workflow', scopeKey: 'flow-a', title: 'Flow A' }, tmpDir);
    registerRunbook('test-org', { scopeType: 'platform', scopeKey: 'salesforce', title: 'SF' }, tmpDir);

    const registry = loadRegistry('test-org', tmpDir);
    expect(registry.runbooks).toHaveLength(3);
  });
});

// ── Lookups ────────────────────────────────────────────────────────────────

describe('lookupByScope', () => {
  beforeEach(() => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  });

  test('finds exact scope match', () => {
    const result = lookupByScope('acme-prod', 'workflow', 'lead-routing', tmpDir);
    expect(result).not.toBeNull();
    expect(result.id).toBe('workflow-lead-routing');
  });

  test('returns null for no match', () => {
    const result = lookupByScope('acme-prod', 'workflow', 'nonexistent', tmpDir);
    expect(result).toBeNull();
  });

  test('normalizes scope key for comparison', () => {
    const result = lookupByScope('acme-prod', 'workflow', 'Lead Routing', tmpDir);
    expect(result).not.toBeNull();
    expect(result.id).toBe('workflow-lead-routing');
  });
});

describe('lookupByAgent', () => {
  beforeEach(() => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  });

  test('finds runbooks linked to agent', () => {
    const results = lookupByAgent('acme-prod', 'sfdc-data-operations', tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('workflow-lead-routing');
  });

  test('returns empty array for unknown agent', () => {
    const results = lookupByAgent('acme-prod', 'nonexistent-agent', tmpDir);
    expect(results).toEqual([]);
  });

  test('case-insensitive agent match', () => {
    const results = lookupByAgent('acme-prod', 'SFDC-Data-Operations', tmpDir);
    expect(results).toHaveLength(1);
  });
});

describe('lookupByWorkflow', () => {
  beforeEach(() => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  });

  test('finds runbook by workflow name', () => {
    const results = lookupByWorkflow('acme-prod', 'Lead Assignment', tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('workflow-lead-routing');
  });

  test('normalized workflow matching', () => {
    const results = lookupByWorkflow('acme-prod', 'lead_assignment', tmpDir);
    expect(results).toHaveLength(1);
  });
});

describe('lookupByObject', () => {
  beforeEach(() => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  });

  test('finds runbooks linked to object', () => {
    const results = lookupByObject('acme-prod', 'Lead', tmpDir);
    expect(results).toHaveLength(2); // workflow-lead-routing and platform-salesforce
  });

  test('case-insensitive object match', () => {
    const results = lookupByObject('acme-prod', 'lead', tmpDir);
    expect(results).toHaveLength(2);
  });
});

describe('lookupByTags', () => {
  beforeEach(() => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  });

  test('finds runbooks with matching tags', () => {
    const results = lookupByTags('acme-prod', ['routing'], tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('workflow-lead-routing');
  });

  test('finds runbooks with any tag overlap', () => {
    const results = lookupByTags('acme-prod', ['salesforce', 'routing'], tmpDir);
    expect(results).toHaveLength(3); // all three have either salesforce or routing
  });
});

describe('lookupByAlias', () => {
  beforeEach(() => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  });

  test('finds runbook by alias', () => {
    const result = lookupByAlias('acme-prod', 'lr', tmpDir);
    expect(result).not.toBeNull();
    expect(result.id).toBe('workflow-lead-routing');
  });

  test('normalizes alias for lookup', () => {
    const result = lookupByAlias('acme-prod', 'Lead Assignment', tmpDir);
    expect(result).not.toBeNull();
    expect(result.id).toBe('workflow-lead-routing');
  });

  test('returns null for unknown alias', () => {
    const result = lookupByAlias('acme-prod', 'nonexistent', tmpDir);
    expect(result).toBeNull();
  });
});

// ── findBestMatch ──────────────────────────────────────────────────────────

describe('findBestMatch', () => {
  beforeEach(() => {
    const fixture = require('../__fixtures__/runbook/sample-registry.json');
    const dir = path.join(tmpDir, 'instances', 'acme-prod', 'runbooks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'registry.json'), JSON.stringify(fixture));
  });

  test('returns sorted results by score', () => {
    const results = findBestMatch('acme-prod', {
      scopeType: 'workflow',
      scopeKey: 'lead-routing'
    }, tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].runbook.id).toBe('workflow-lead-routing');
    expect(results[0].score).toBeGreaterThan(0.5);
  });

  test('returns empty for no criteria', () => {
    expect(findBestMatch('acme-prod', {}, tmpDir)).toEqual([]);
  });

  test('returns empty for empty registry', () => {
    const results = findBestMatch('nonexistent-org', {
      scopeType: 'workflow',
      scopeKey: 'test'
    }, tmpDir);
    expect(results).toEqual([]);
  });

  test('multi-criteria scoring', () => {
    const results = findBestMatch('acme-prod', {
      scopeType: 'workflow',
      agentName: 'sfdc-data-operations',
      objectName: 'Lead'
    }, tmpDir);
    expect(results.length).toBeGreaterThan(0);
    // workflow-lead-routing should score highest (matches scope type, agent, and object)
    expect(results[0].runbook.id).toBe('workflow-lead-routing');
  });
});
