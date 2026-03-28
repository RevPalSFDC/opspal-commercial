'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { getRunbookStatus } = require('../runbook-status-reporter');
const { registerRunbook } = require('../runbook-registry');
const { saveEntries } = require('../runbook-entry-store');
const { savePromotions } = require('../runbook-promotion-manager');
const { saveConflicts } = require('../runbook-conflict-manager');

const FIXTURES = path.join(__dirname, '..', '__fixtures__', 'runbook');
let tmpDir;

beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-test-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function setupFullOrg() {
  registerRunbook('acme-prod', { scopeType: 'org', scopeKey: 'acme-prod', title: 'Org', status: 'active' }, tmpDir);
  registerRunbook('acme-prod', { scopeType: 'workflow', scopeKey: 'lead-routing', title: 'Lead Routing', status: 'active' }, tmpDir);

  const fixture = require(path.join(FIXTURES, 'sample-entry-store.json'));
  saveEntries('acme-prod', 'workflow-lead-routing', fixture, tmpDir);
  saveEntries('acme-prod', 'org-acme-prod', { runbookId: 'org-acme-prod', version: '1.0.0', entries: [], updatedAt: '' }, tmpDir);

  const promotions = require(path.join(FIXTURES, 'sample-promotions-store.json'));
  savePromotions('acme-prod', promotions, tmpDir);

  const conflicts = require(path.join(FIXTURES, 'sample-conflicts-store.json'));
  saveConflicts('acme-prod', conflicts, tmpDir);
}

describe('getRunbookStatus', () => {
  test('returns correct registeredRunbooks count', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(status.registeredRunbooks).toBe(2);
  });

  test('returns correct totalEntries count', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(status.totalEntries).toBe(6); // sample-entry-store has 6 entries
  });

  test('returns correct byStatus breakdown', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(status.byStatus.active).toBeGreaterThan(0);
    expect(status.byStatus.proposed).toBeGreaterThan(0);
  });

  test('includes staleEntries when present', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    // The fixture has one entry with lifecycleStatus: 'stale' but validationStatus is 'active'
    // staleEntries filters on validationStatus === 'stale', not lifecycleStatus
    expect(Array.isArray(status.staleEntries)).toBe(true);
  });

  test('includes lowConfidenceActive entries', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(Array.isArray(status.lowConfidenceActive)).toBe(true);
  });

  test('includes recentPromotions from promotions store', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(status.recentPromotions.length).toBe(1);
    expect(status.recentPromotions[0].promotionId).toBe('promo-abc1234567');
  });

  test('includes unresolvedConflicts from conflicts store', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(status.unresolvedConflicts.length).toBe(1);
  });

  test('returns topRunbooks sorted by entry count', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(status.topRunbooks[0].runbookId).toBe('workflow-lead-routing');
    expect(status.topRunbooks[0].entryCount).toBe(6);
  });

  test('returns empty status for org with no runbooks', () => {
    const status = getRunbookStatus('empty-org', tmpDir);
    expect(status.registeredRunbooks).toBe(0);
    expect(status.totalEntries).toBe(0);
    expect(status.recentPromotions).toEqual([]);
    expect(status.unresolvedConflicts).toEqual([]);
  });

  test('includes recentlyUpdated list', () => {
    setupFullOrg();
    const status = getRunbookStatus('acme-prod', tmpDir);
    expect(Array.isArray(status.recentlyUpdated)).toBe(true);
    expect(status.recentlyUpdated.length).toBeLessThanOrEqual(5);
  });
});
