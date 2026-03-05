/**
 * ReportPlan Contract Tests
 */

const { ReportPlanContract } = require('../report-plan-contract');

describe('ReportPlanContract', () => {
  let contract;

  beforeEach(() => {
    contract = new ReportPlanContract({ verbose: false });
  });

  describe('build()', () => {
    test('should build a complete plan from minimal input', () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT', 'STAGE_NAME'],
        assumptions: ['Pipeline report'],
        confidence: 0.9
      });

      expect(plan.intent).toBe('create');
      expect(plan.primary_object).toBe('Opportunity');
      expect(plan.grain).toBe('opportunity');
      expect(plan.report_type).toBe('Opportunity');
      expect(plan.columns).toEqual(['AMOUNT', 'STAGE_NAME']);
      expect(plan.confidence).toBe(0.9);
      expect(plan.unresolved_semantics).toEqual([]);
      expect(plan.correction_notes).toEqual([]);
    });

    test('should auto-infer SUMMARY format from down groupings', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        groupings: { down: [{ field: 'STAGE_NAME' }] },
        assumptions: ['Test'],
        confidence: 0.8
      });

      expect(plan.report_format).toBe('SUMMARY');
    });

    test('should auto-infer MATRIX format from across groupings', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        groupings: {
          down: [{ field: 'STAGE_NAME' }],
          across: [{ field: 'CLOSE_DATE' }]
        },
        assumptions: ['Test'],
        confidence: 0.8
      });

      expect(plan.report_format).toBe('MATRIX');
    });

    test('should default to TABULAR with no groupings and no explicit format', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        assumptions: ['Test'],
        confidence: 0.8
      });

      expect(plan.report_format).toBe('TABULAR');
    });

    test('should preserve explicit format even with groupings', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        report_format: 'TABULAR',
        columns: ['AMOUNT'],
        groupings: { down: [{ field: 'STAGE_NAME' }] },
        assumptions: ['Test'],
        confidence: 0.8
      });

      // Explicit format should be preserved (constraint engine handles mismatch)
      expect(plan.report_format).toBe('TABULAR');
    });
  });

  describe('validate()', () => {
    test('should pass valid plan', () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [{ column: 'STAGE_NAME', operator: 'notEqual', value: 'Closed Lost' }],
        assumptions: ['Pipeline'],
        confidence: 0.9
      });

      const result = contract.validate(plan);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail on missing required fields', () => {
      const result = contract.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('primary_object'))).toBe(true);
    });

    test('should fail on invalid intent', () => {
      const plan = contract.build({
        intent: 'destroy',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        assumptions: ['Test'],
        confidence: 0.8
      });
      plan.intent = 'destroy';

      const result = contract.validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('intent'))).toBe(true);
    });

    test('should fail on empty columns', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: [],
        assumptions: ['Test'],
        confidence: 0.8
      });

      const result = contract.validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('columns'))).toBe(true);
    });

    test('should fail on invalid format', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        report_format: 'PIVOT',
        columns: ['AMOUNT'],
        assumptions: ['Test'],
        confidence: 0.8
      });
      plan.report_format = 'PIVOT';

      const result = contract.validate(plan);
      expect(result.valid).toBe(false);
    });

    test('should warn on excessive groupings', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        groupings: {
          down: [
            { field: 'STAGE_NAME' },
            { field: 'OWNER' },
            { field: 'TYPE' },
            { field: 'REGION' }
          ]
        },
        assumptions: ['Test'],
        confidence: 0.8
      });

      const result = contract.validate(plan);
      expect(result.warnings.some(w => w.includes('groupings'))).toBe(true);
    });

    test('should require source_report_id for update intent', () => {
      const plan = contract.build({
        intent: 'update',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        assumptions: ['Test'],
        confidence: 0.9
      });

      const result = contract.validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('source_report_id'))).toBe(true);
    });

    test('should require source_report_id for clone intent', () => {
      const plan = contract.build({
        intent: 'clone',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        assumptions: ['Test'],
        confidence: 0.9
      });

      const result = contract.validate(plan);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('source_report_id'))).toBe(true);
    });
  });

  describe('checkExecutionGate()', () => {
    test('should allow execution when all gates pass', () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        assumptions: ['Pipeline'],
        confidence: 0.9
      });

      const gate = contract.checkExecutionGate(plan);
      expect(gate.canExecute).toBe(true);
      expect(gate.blockers).toHaveLength(0);
    });

    test('should block on low confidence', () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        assumptions: ['Pipeline'],
        confidence: 0.5
      });

      const gate = contract.checkExecutionGate(plan);
      expect(gate.canExecute).toBe(false);
      expect(gate.blockers.some(b => b.includes('Confidence'))).toBe(true);
    });

    test('should block on unresolved semantics', () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        assumptions: ['Pipeline'],
        confidence: 0.9
      });
      plan.unresolved_semantics = [
        { term: 'churn', interpretations: [{ label: 'Logo churn' }, { label: 'Revenue churn' }] }
      ];

      const gate = contract.checkExecutionGate(plan);
      expect(gate.canExecute).toBe(false);
      expect(gate.blockers.some(b => b.includes('churn'))).toBe(true);
    });
  });

  describe('applyPatch()', () => {
    test('should add columns', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT', 'STAGE_NAME'],
        assumptions: ['Test'],
        confidence: 0.9,
        source_report_id: '00O001'
      });

      const patched = contract.applyPatch(plan, { add_columns: ['CLOSE_DATE'] });
      expect(patched.columns).toContain('CLOSE_DATE');
      expect(patched.columns).toContain('AMOUNT');
      expect(patched.columns).toContain('STAGE_NAME');
    });

    test('should remove columns', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT', 'STAGE_NAME', 'CLOSE_DATE'],
        assumptions: ['Test'],
        confidence: 0.9,
        source_report_id: '00O001'
      });

      const patched = contract.applyPatch(plan, { remove_columns: ['CLOSE_DATE'] });
      expect(patched.columns).not.toContain('CLOSE_DATE');
      expect(patched.columns).toContain('AMOUNT');
    });

    test('should add filters', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        filters: [],
        assumptions: ['Test'],
        confidence: 0.9,
        source_report_id: '00O001'
      });

      const patched = contract.applyPatch(plan, {
        add_filters: [{ column: 'STAGE_NAME', operator: 'notEqual', value: 'Closed Lost' }]
      });
      expect(patched.filters).toHaveLength(1);
      expect(patched.filters[0].column).toBe('STAGE_NAME');
    });

    test('should set intent to update', () => {
      const plan = contract.build({
        intent: 'create',
        primary_object: 'Opportunity',
        columns: ['AMOUNT'],
        assumptions: ['Test'],
        confidence: 0.9,
        source_report_id: '00O001'
      });

      const patched = contract.applyPatch(plan, { add_columns: ['STAGE_NAME'] });
      expect(patched.intent).toBe('update');
    });

    test('should not duplicate columns on add', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT', 'STAGE_NAME'],
        assumptions: ['Test'],
        confidence: 0.9,
        source_report_id: '00O001'
      });

      const patched = contract.applyPatch(plan, { add_columns: ['AMOUNT'] });
      const amountCount = patched.columns.filter(c => c === 'AMOUNT').length;
      expect(amountCount).toBe(1);
    });
  });

  describe('detectSilentDrops()', () => {
    test('should detect missing columns', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT', 'STAGE_NAME', 'CLOSE_DATE'],
        assumptions: ['Test'],
        confidence: 0.9
      });

      const finalReport = { columns: ['AMOUNT', 'STAGE_NAME'] };
      const drops = contract.detectSilentDrops(plan, finalReport);

      expect(drops.count).toBe(1);
      expect(drops.silent_drops[0].element).toBe('CLOSE_DATE');
    });

    test('should report zero drops when all present', () => {
      const plan = contract.build({
        primary_object: 'Opportunity',
        columns: ['AMOUNT', 'STAGE_NAME'],
        assumptions: ['Test'],
        confidence: 0.9
      });

      const finalReport = { columns: ['AMOUNT', 'STAGE_NAME'] };
      const drops = contract.detectSilentDrops(plan, finalReport);

      expect(drops.count).toBe(0);
    });
  });
});
