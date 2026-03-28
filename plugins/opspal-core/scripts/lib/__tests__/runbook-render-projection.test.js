'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  renderProjection, renderAllProjections, renderOrgProjection
} = require('../runbook-render-projection');
const { registerRunbook } = require('../runbook-registry');
const { saveEntries } = require('../runbook-entry-store');
const { SECTION_ORDER } = require('../runbook-entry-store');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-test-'));
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
    linkedObjects: ['Lead', 'User']
  }, tmpDir);

  const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
  saveEntries('acme-prod', 'workflow-lead-routing', fixture, tmpDir);
}

// ── renderProjection ───────────────────────────────────────────────────────

describe('renderProjection', () => {
  test('renders valid markdown for a scoped runbook', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Lead Routing Workflow');
    expect(content).toContain('**Scope**: workflow / lead-routing');
  });

  test('output path follows convention', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);
    expect(filePath).toContain(path.join('runbooks', 'projections', 'workflow', 'workflow-lead-routing.md'));
  });

  test('sections appear in SECTION_ORDER', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract all ## headers
    const headers = [];
    for (const line of content.split('\n')) {
      const match = line.match(/^## (.+)$/);
      if (match) headers.push(match[1]);
    }

    // Check that the order of present sections matches SECTION_ORDER
    const orderIndices = headers.map(h => SECTION_ORDER.indexOf(h)).filter(i => i >= 0);
    for (let i = 1; i < orderIndices.length; i++) {
      expect(orderIndices[i]).toBeGreaterThan(orderIndices[i - 1]);
    }
  });

  test('proposed entries get [PROPOSED] prefix', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('[PROPOSED]');
  });

  test('stale entries get [STALE] prefix', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('[STALE]');
  });

  test('empty sections are omitted', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    // Agent-Specific Notes has no entries in the fixture
    expect(content).not.toContain('## Agent-Specific Notes');
  });

  test('includes confidence badge', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/★\d+%/);
  });

  test('includes evidence citation', () => {
    setupRunbookWithEntries();
    const filePath = renderProjection('acme-prod', 'workflow-lead-routing', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('> Evidence:');
  });

  test('throws for nonexistent runbook', () => {
    expect(() => renderProjection('acme-prod', 'nonexistent-rb', tmpDir)).toThrow();
  });

  test('renders minimal projection for empty entry store', () => {
    registerRunbook('acme-prod', {
      title: 'Empty Runbook',
      scopeType: 'platform',
      scopeKey: 'salesforce',
      status: 'active'
    }, tmpDir);

    const filePath = renderProjection('acme-prod', 'platform-salesforce', tmpDir);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Empty Runbook');
    expect(content).toContain('0 active, 0 proposed');
  });
});

// ── renderAllProjections ───────────────────────────────────────────────────

describe('renderAllProjections', () => {
  test('renders all non-archived runbooks', () => {
    setupRunbookWithEntries();

    // Add an archived runbook
    registerRunbook('acme-prod', {
      title: 'Archived Runbook',
      scopeType: 'project',
      scopeKey: 'old-project',
      status: 'archived'
    }, tmpDir);

    const results = renderAllProjections('acme-prod', tmpDir);
    const successful = results.filter(r => r.success);
    const archivedResult = results.find(r => r.runbookId === 'project-old-project');
    expect(archivedResult).toBeUndefined();
    expect(successful.length).toBeGreaterThan(0);
  });

  test('returns empty for org with no runbooks', () => {
    const results = renderAllProjections('empty-org', tmpDir);
    expect(results).toEqual([]);
  });
});

// ── renderOrgProjection ────────────────────────────────────────────────────

describe('renderOrgProjection', () => {
  test('renders aggregated org projection', () => {
    setupRunbookWithEntries();

    const filePath = renderOrgProjection('acme-prod', tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('Aggregated Org Runbook');
    expect(content).toContain('Scoped Runbooks');
    expect(content).toContain('Total Entries');
  });

  test('org projection output path is correct', () => {
    setupRunbookWithEntries();
    const filePath = renderOrgProjection('acme-prod', tmpDir);
    expect(filePath).toContain(path.join('projections', 'org', 'org-acme-prod.md'));
  });
});
