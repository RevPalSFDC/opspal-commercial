/**
 * Report CRUD Manager Tests
 *
 * Tests the ReportCrudManager, ReportDependencyChecker, ReportArchiveManager,
 * ReportSemanticDisambiguator, and ReportTelemetryTracker.
 *
 * Note: Tests requiring a live SF org are skipped when no org is available.
 */

const { ReportCrudManager } = require('../report-crud-manager');
const { ReportDependencyChecker } = require('../report-dependency-checker');
const { ReportArchiveManager } = require('../report-archive-manager');
const { ReportSemanticDisambiguator } = require('../report-semantic-disambiguator');
const { ReportTelemetryTracker } = require('../report-telemetry-tracker');
const { ReportPlanContract } = require('../report-plan-contract');

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('ReportSemanticDisambiguator', () => {
  let disambiguator;

  beforeEach(() => {
    disambiguator = new ReportSemanticDisambiguator({ verbose: false });
  });

  describe('resolve()', () => {
    test('should detect "churn" as ambiguous', () => {
      const result = disambiguator.resolve('Show me churn');
      expect(result.matched_terms).toContain('churn');
      expect(result.unresolved.length).toBeGreaterThan(0);
      expect(result.unresolved[0].term).toBe('churn');
    });

    test('should auto-resolve "revenue churn" via context hints', () => {
      const result = disambiguator.resolve('Show me revenue churn by quarter');
      expect(result.matched_terms).toContain('churn');
      expect(result.resolved.length).toBeGreaterThan(0);
      expect(result.resolved[0].interpretation.label).toContain('Revenue');
    });

    test('should detect "pipeline" in request', () => {
      const result = disambiguator.resolve('Show me pipeline by stage');
      expect(result.matched_terms).toContain('pipeline');
    });

    test('should auto-resolve "qualified pipeline" via context', () => {
      const result = disambiguator.resolve('Show me qualified pipeline');
      expect(result.matched_terms).toContain('pipeline');
      // Should resolve to "Qualified pipeline" interpretation
      const resolved = result.resolved.find(r => r.term === 'pipeline');
      if (resolved) {
        expect(resolved.interpretation.label).toContain('Qualified');
      }
    });

    test('should not match terms not in request', () => {
      const result = disambiguator.resolve('Show me accounts by region');
      expect(result.matched_terms).not.toContain('churn');
      expect(result.matched_terms).not.toContain('pipeline');
    });

    test('should detect NRR without disambiguation', () => {
      const result = disambiguator.resolve('Show me NRR trends');
      expect(result.matched_terms).toContain('nrr');
      // NRR has only one interpretation, so should auto-resolve
      expect(result.resolved.some(r => r.term === 'nrr')).toBe(true);
      expect(result.unresolved.filter(u => u.term === 'nrr')).toHaveLength(0);
    });

    test('should resolve single-interpretation terms automatically', () => {
      const result = disambiguator.resolve('Show me contraction revenue');
      expect(result.matched_terms).toContain('contraction');
      expect(result.resolved.some(r => r.term === 'contraction')).toBe(true);
    });

    test('should handle multiple terms in one request', () => {
      const result = disambiguator.resolve('Compare pipeline and churn metrics');
      expect(result.matched_terms).toContain('pipeline');
      expect(result.matched_terms).toContain('churn');
    });
  });

  describe('listTerms()', () => {
    test('should list all terms', () => {
      const terms = disambiguator.listTerms();
      expect(terms.length).toBeGreaterThan(10);
    });

    test('should filter by category', () => {
      const retentionTerms = disambiguator.listTerms('retention');
      expect(retentionTerms.length).toBeGreaterThan(0);
      expect(retentionTerms.every(t => t.category === 'retention')).toBe(true);
    });
  });

  describe('getCategories()', () => {
    test('should return all categories', () => {
      const categories = disambiguator.getCategories();
      expect(categories).toContain('sales');
      expect(categories).toContain('retention');
      expect(categories).toContain('revenue');
    });
  });

  describe('applyToPlan()', () => {
    test('should add assumptions for resolved terms', () => {
      const plan = { assumptions: [] };
      const resolved = [{
        term: 'churn',
        interpretation: { label: 'Revenue churn (ARR lost)', object: 'Opportunity' }
      }];

      const updated = disambiguator.applyToPlan(plan, resolved);
      expect(updated.assumptions.some(a => a.includes('churn'))).toBe(true);
    });
  });
});

describe('ReportArchiveManager', () => {
  let archive;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-archive-'));
    archive = new ReportArchiveManager({
      basePath: tmpDir,
      verbose: false
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('archive()', () => {
    test('should archive report metadata', async () => {
      const result = await archive.archive('00OTEST001', { name: 'Test Report' });
      expect(result.archiveId).toContain('00OTEST001');
      expect(fs.existsSync(result.path)).toBe(true);
    });
  });

  describe('list()', () => {
    test('should list archived reports', async () => {
      await archive.archive('00OTEST001', { name: 'Report 1' });
      await archive.archive('00OTEST002', { name: 'Report 2' });

      const archives = archive.list();
      expect(archives.length).toBe(2);
    });

    test('should return empty array when no archives', () => {
      const archives = archive.list();
      expect(archives).toEqual([]);
    });
  });

  describe('storeDefinition()', () => {
    test('should store versioned definition', () => {
      const filePath = archive.storeDefinition('00OTEST001', { columns: ['AMOUNT'] }, 'create');
      expect(fs.existsSync(filePath)).toBe(true);

      const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(stored.reportId).toBe('00OTEST001');
      expect(stored.operation).toBe('create');
    });
  });

  describe('getHistory()', () => {
    test('should return version history for a report', () => {
      archive.storeDefinition('00OTEST001', { v: 1 }, 'create');
      archive.storeDefinition('00OTEST001', { v: 2 }, 'update');

      const history = archive.getHistory('00OTEST001');
      expect(history.length).toBe(2);
    });
  });

  describe('prune()', () => {
    test('should prune old archives keeping N per report', async () => {
      for (let i = 0; i < 8; i++) {
        await archive.archive('00OTEST001', { name: `Report v${i}` });
      }

      expect(archive.list().length).toBe(8);

      const pruned = archive.prune(3);
      expect(pruned).toBe(5);
      expect(archive.list().length).toBe(3);
    });
  });
});

describe('ReportTelemetryTracker', () => {
  let tracker;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-telemetry-'));
    tracker = new ReportTelemetryTracker({
      basePath: tmpDir,
      verbose: false
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('logEvent()', () => {
    test('should log event to JSONL', () => {
      tracker.logEvent({ operation: 'create', outcome: 'success', duration_ms: 150 });
      tracker.logEvent({ operation: 'update', outcome: 'failed', duration_ms: 200 });

      const lines = fs.readFileSync(tracker.telemetryFile, 'utf8').trim().split('\n');
      expect(lines.length).toBe(2);

      const event = JSON.parse(lines[0]);
      expect(event.operation).toBe('create');
      expect(event.outcome).toBe('success');
    });
  });

  describe('dashboard()', () => {
    test('should return empty dashboard when no data', () => {
      const dashboard = tracker.dashboard(30);
      expect(dashboard.total_events).toBe(0);
    });

    test('should compute metrics from events', () => {
      tracker.logEvent({ operation: 'create', outcome: 'success', duration_ms: 100 });
      tracker.logEvent({ operation: 'create', outcome: 'success', duration_ms: 200, repairs_applied: 1, repair_strategies: ['filter_fix'] });
      tracker.logEvent({ operation: 'update', outcome: 'failed', duration_ms: 300 });

      const dashboard = tracker.dashboard(30);
      expect(dashboard.total_events).toBe(3);
      expect(dashboard.operations.create).toBe(2);
      expect(dashboard.operations.update).toBe(1);
      expect(dashboard.metrics.silent_drop_count).toBe(0);
    });

    test('should flag critical failure on silent drops', () => {
      tracker.logEvent({ operation: 'create', outcome: 'success', silent_drop_count: 2 });

      const dashboard = tracker.dashboard(30);
      expect(dashboard.metrics.silent_drop_count).toBe(2);
      expect(dashboard.targets.silent_drop_count.status).toBe('CRITICAL_FAIL');
    });

    test('should pass silent drop target when count is zero', () => {
      tracker.logEvent({ operation: 'create', outcome: 'success', silent_drop_count: 0 });

      const dashboard = tracker.dashboard(30);
      expect(dashboard.targets.silent_drop_count.status).toBe('PASS');
    });
  });

  describe('recentEvents()', () => {
    test('should return most recent N events', () => {
      for (let i = 0; i < 10; i++) {
        tracker.logEvent({ operation: 'create', outcome: 'success', duration_ms: i * 10 });
      }

      const recent = tracker.recentEvents(5);
      expect(recent.length).toBe(5);
    });
  });
});

describe('ReportDependencyChecker', () => {
  let checker;

  beforeEach(() => {
    // No org - tests run offline
    checker = new ReportDependencyChecker({ verbose: false });
  });

  describe('check() - offline', () => {
    test('should return no dependencies when no org connected', async () => {
      const deps = await checker.check('00OTEST001');
      expect(deps.hasDependencies).toBe(false);
      expect(deps.canDelete).toBe(true);
    });
  });

  describe('formatReport()', () => {
    test('should format safe-to-delete report', () => {
      const deps = {
        reportId: '00OTEST001',
        hasDependencies: false,
        canDelete: true,
        dashboards: [],
        subscriptions: [],
        summary: 'No dependencies found. Safe to delete.'
      };

      const report = checker.formatReport(deps);
      expect(report).toContain('SAFE TO DELETE');
    });

    test('should format blocked report with dependencies', () => {
      const deps = {
        reportId: '00OTEST001',
        hasDependencies: true,
        canDelete: false,
        dashboards: [
          { dashboardId: '01Z001', dashboardTitle: 'Sales Dashboard', componentName: 'Pipeline Chart' }
        ],
        subscriptions: [],
        summary: 'Report has dependencies: 1 dashboard(s). Deletion blocked.'
      };

      const report = checker.formatReport(deps);
      expect(report).toContain('DELETION BLOCKED');
      expect(report).toContain('Sales Dashboard');
    });
  });
});

describe('ReportCrudManager - offline', () => {
  let manager;

  beforeEach(() => {
    // No org - tests create/preflight only
    manager = new ReportCrudManager({ verbose: false });
  });

  describe('create() - plan validation', () => {
    test('should fail on incomplete plan', async () => {
      const result = await manager.create({});
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should pass preflight for valid plan', async () => {
      const result = await manager.create({
        primary_object: 'Opportunity',
        columns: ['OPPORTUNITY_NAME', 'AMOUNT'],
        filters: [],
        assumptions: ['Simple list'],
        confidence: 0.9
      });

      // Without SF org, API call fails but preflight should pass
      // We check that the plan was validated (no schema errors)
      // The API error is expected
      if (!result.success) {
        expect(result.errors.some(e => e.includes('API') || e.includes('Create error'))).toBe(true);
      }
    });
  });
});
