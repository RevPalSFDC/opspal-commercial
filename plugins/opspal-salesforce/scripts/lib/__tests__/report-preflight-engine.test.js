/**
 * Report Preflight Engine Tests
 */

const { ReportPreflightEngine, MAX_REPAIR_ATTEMPTS } = require('../report-preflight-engine');
const { ReportPlanContract } = require('../report-plan-contract');
const { ReportConstraintEngine } = require('../report-constraint-engine');

describe('ReportPreflightEngine', () => {
  let engine;
  let contract;

  beforeEach(() => {
    // No org alias - tests run without SF connection
    engine = new ReportPreflightEngine({ verbose: false });
    contract = new ReportPlanContract({ verbose: false });
  });

  describe('run() - validation pass', () => {
    test('should pass a valid simple plan', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['OPPORTUNITY_NAME', 'AMOUNT'],
        filters: [],
        assumptions: ['Simple list report'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);
      expect(result.payload).not.toBeNull();
      expect(result.errors).toHaveLength(0);
    });

    test('should pass a SUMMARY plan with groupings', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        report_format: 'SUMMARY',
        columns: ['OPPORTUNITY_NAME', 'AMOUNT', 'STAGE_NAME'],
        filters: [{ column: 'STAGE_NAME', operator: 'notEqual', value: 'Closed Lost' }],
        groupings: { down: [{ field: 'STAGE_NAME' }] },
        summaries: [{ field: 'AMOUNT', aggregate: 'SUM' }],
        assumptions: ['Pipeline by stage'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);
      expect(result.plan.report_format).toBe('SUMMARY');
    });

    test('should block on low confidence', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        assumptions: ['Low confidence'],
        confidence: 0.3
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Confidence'))).toBe(true);
    });

    test('should block on unresolved semantics', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        assumptions: [],
        confidence: 0.9
      });
      plan.unresolved_semantics = [
        { term: 'pipeline', interpretations: [{ label: 'Open' }, { label: 'Qualified' }] }
      ];

      const result = await engine.run(plan);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Unresolved'))).toBe(true);
    });
  });

  describe('run() - constraint auto-corrections', () => {
    test('should auto-convert TABULAR to SUMMARY when groupings present', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        report_format: 'TABULAR',
        columns: ['OPPORTUNITY_NAME', 'AMOUNT'],
        filters: [],
        groupings: { down: [{ field: 'STAGE_NAME' }] },
        assumptions: ['Format auto-correction'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);
      expect(result.plan.report_format).toBe('SUMMARY');
    });

    test('should auto-convert SUMMARY to MATRIX with across groupings', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        report_format: 'SUMMARY',
        columns: ['AMOUNT'],
        filters: [],
        groupings: {
          down: [{ field: 'STAGE_NAME' }],
          across: [{ field: 'CLOSE_DATE', dateGranularity: 'QUARTER' }]
        },
        assumptions: ['Matrix auto-correction'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);
      expect(result.plan.report_format).toBe('MATRIX');
    });

    test('should auto-convert SUMMARY to TABULAR with no groupings', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        report_format: 'SUMMARY',
        columns: ['OPPORTUNITY_NAME', 'AMOUNT'],
        filters: [],
        groupings: { down: [], across: [] },
        assumptions: ['No groupings = TABULAR'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);
      expect(result.plan.report_format).toBe('TABULAR');
    });

    test('should downgrade format when row estimate exceeds limit', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        report_format: 'SUMMARY',
        columns: ['OPPORTUNITY_NAME', 'AMOUNT'],
        filters: [],
        groupings: { down: [{ field: 'STAGE_NAME' }] },
        assumptions: ['High row count'],
        confidence: 0.9
      });

      const result = await engine.run(plan, { rowEstimate: 5000 });
      expect(result.success).toBe(true);
      expect(result.plan.report_format).toBe('TABULAR');
      expect(result.warnings.some(w => w.includes('downgrade') || w.includes('TABULAR'))).toBe(true);
    });
  });

  describe('run() - payload compilation', () => {
    test('should compile valid payload with all elements', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        report_format: 'SUMMARY',
        columns: ['OPPORTUNITY_NAME', 'AMOUNT', 'STAGE_NAME'],
        filters: [{ column: 'STAGE_NAME', operator: 'notEqual', value: 'Closed Lost' }],
        groupings: { down: [{ field: 'STAGE_NAME' }] },
        summaries: [{ field: 'AMOUNT', aggregate: 'SUM' }],
        report_name: 'Pipeline by Stage',
        assumptions: ['Standard pipeline report'],
        confidence: 0.95
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);

      const payload = result.payload;
      expect(payload.reportMetadata).toBeDefined();
      expect(payload.reportMetadata.name).toBe('Pipeline by Stage');
      expect(payload.reportMetadata.reportFormat).toBe('SUMMARY');
      expect(payload.reportMetadata.detailColumns).toContain('OPPORTUNITY_NAME');
      expect(payload.reportMetadata.reportFilters).toHaveLength(1);
      expect(payload.reportMetadata.groupingsDown).toHaveLength(1);
      expect(payload.reportMetadata.aggregates).toHaveLength(1);
    });

    test('should include standard date filter in payload', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        standard_date_filter: { column: 'CLOSE_DATE', durationValue: 'THIS_QUARTER' },
        assumptions: ['Current quarter'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);
      expect(result.payload.reportMetadata.standardDateFilter).toBeDefined();
      expect(result.payload.reportMetadata.standardDateFilter.durationValue).toBe('THIS_QUARTER');
    });

    test('should include chart in payload', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        report_format: 'SUMMARY',
        columns: ['AMOUNT', 'STAGE_NAME'],
        filters: [],
        groupings: { down: [{ field: 'STAGE_NAME' }] },
        summaries: [{ field: 'AMOUNT', aggregate: 'SUM' }],
        chart: { type: 'HorizontalBar', grouping: 'STAGE_NAME', summary: 'AMOUNT:SUM' },
        assumptions: ['With chart'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      expect(result.success).toBe(true);
      expect(result.payload.reportMetadata.chart).toBeDefined();
      expect(result.payload.reportMetadata.chart.chartType).toBe('HorizontalBar');
    });
  });

  describe('MAX_REPAIR_ATTEMPTS', () => {
    test('should be set to 3', () => {
      expect(MAX_REPAIR_ATTEMPTS).toBe(3);
    });
  });

  describe('getSummary()', () => {
    test('should produce correct summary', async () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        assumptions: ['Test'],
        confidence: 0.9
      });

      const result = await engine.run(plan);
      const summary = engine.getSummary(result);

      expect(summary.success).toBe(true);
      expect(summary.attempts).toBeGreaterThan(0);
      expect(typeof summary.repairs_applied).toBe('number');
      expect(Array.isArray(summary.repair_strategies)).toBe(true);
    });
  });
});

describe('ReportConstraintEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ReportConstraintEngine({ verbose: false });
  });

  test('should auto-convert TABULAR to SUMMARY with groupings', () => {
    const plan = {
      report_format: 'TABULAR',
      groupings: { down: [{ field: 'STAGE_NAME' }], across: [] },
      columns: ['AMOUNT'],
      filters: [],
      summaries: [],
      custom_formulas: []
    };

    const result = engine.enforce(plan);
    expect(result.plan.report_format).toBe('SUMMARY');
    expect(result.transformations.length).toBeGreaterThan(0);
  });

  test('should auto-convert SUMMARY to MATRIX with across groupings', () => {
    const plan = {
      report_format: 'SUMMARY',
      groupings: {
        down: [{ field: 'STAGE_NAME' }],
        across: [{ field: 'CLOSE_DATE' }]
      },
      columns: ['AMOUNT'],
      filters: [],
      summaries: [],
      custom_formulas: []
    };

    const result = engine.enforce(plan);
    expect(result.plan.report_format).toBe('MATRIX');
  });

  test('should error on too many across groupings', () => {
    const plan = {
      report_format: 'MATRIX',
      groupings: {
        down: [{ field: 'STAGE_NAME' }],
        across: [{ field: 'A' }, { field: 'B' }, { field: 'C' }]
      },
      columns: ['AMOUNT'],
      filters: [],
      summaries: [],
      custom_formulas: []
    };

    const result = engine.enforce(plan);
    expect(result.errors.some(e => e.includes('across-groupings'))).toBe(true);
  });

  test('should add CurrencyIsoCode in multi-currency org', () => {
    const plan = {
      report_format: 'TABULAR',
      groupings: { down: [], across: [] },
      columns: ['AMOUNT'],
      filters: [],
      summaries: [],
      custom_formulas: []
    };

    const result = engine.enforce(plan, { isMultiCurrency: true });
    expect(result.plan.columns).toContain('CurrencyIsoCode');
  });

  test('should not add CurrencyIsoCode if already present', () => {
    const plan = {
      report_format: 'TABULAR',
      groupings: { down: [], across: [] },
      columns: ['AMOUNT', 'CurrencyIsoCode'],
      filters: [],
      summaries: [],
      custom_formulas: []
    };

    const result = engine.enforce(plan, { isMultiCurrency: true });
    const count = result.plan.columns.filter(c => c === 'CurrencyIsoCode').length;
    expect(count).toBe(1);
  });
});
