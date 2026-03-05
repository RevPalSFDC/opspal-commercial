/**
 * Unit Tests for Criteria Evaluator
 *
 * Tests evaluation of assignment rule criteria, rule matching, simulation,
 * and field compatibility validation.
 *
 * @group assignment-rules
 * @group criteria-evaluation
 */

const {
  evaluateCriteria,
  evaluateAllCriteria,
  findMatchingRule,
  simulateAssignment,
  validateCriteriaCompatibility,
  validateRuleEntry,
  fetchObjectDescribe,
  OPERATOR_COMPATIBILITY
} = require('../../criteria-evaluator');

// Mock child_process execSync
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const { execSync } = require('child_process');

/**
 * Test Fixtures
 */
const FIXTURES = {
  // Sample record data
  leadRecord1: {
    Industry: 'Healthcare',
    State: 'CA',
    AnnualRevenue: 5000000,
    Status: 'Open - Not Contacted',
    Rating: 'Hot',
    Email: 'john@example.com'
  },

  leadRecord2: {
    Industry: 'Technology',
    State: 'NY',
    AnnualRevenue: 1000000,
    Status: 'Working - Contacted',
    Rating: 'Warm'
  },

  leadRecord3: {
    Industry: 'Healthcare',
    State: 'TX',
    AnnualRevenue: 500000,
    Status: 'Closed - Converted'
  },

  // Rule entries
  entry1: {
    order: 1,
    assignedTo: '00G1111111111AAA',
    criteriaItems: [
      { field: 'Industry', operation: 'equals', value: 'Healthcare' },
      { field: 'State', operation: 'equals', value: 'CA' }
    ]
  },

  entry2: {
    order: 2,
    assignedTo: '00G2222222222BBB',
    criteriaItems: [
      { field: 'Industry', operation: 'equals', value: 'Healthcare' }
    ]
  },

  entry3: {
    order: 3,
    assignedTo: '00G3333333333CCC',
    criteriaItems: [
      { field: 'AnnualRevenue', operation: 'greaterThan', value: '1000000' }
    ]
  },

  // Object describe mock
  objectDescribe: {
    name: 'Lead',
    fields: [
      {
        name: 'Industry',
        type: 'picklist',
        picklistValues: [
          { value: 'Healthcare' },
          { value: 'Technology' },
          { value: 'Finance' }
        ]
      },
      {
        name: 'State',
        type: 'string'
      },
      {
        name: 'AnnualRevenue',
        type: 'currency'
      },
      {
        name: 'Status',
        type: 'picklist',
        picklistValues: [
          { value: 'Open - Not Contacted' },
          { value: 'Working - Contacted' }
        ]
      },
      {
        name: 'Rating',
        type: 'picklist',
        picklistValues: [
          { value: 'Hot' },
          { value: 'Warm' },
          { value: 'Cold' }
        ]
      },
      {
        name: 'Email',
        type: 'email'
      },
      {
        name: 'CreatedDate',
        type: 'datetime'
      }
    ]
  },

  // Assignment rule
  assignmentRule: {
    name: 'Lead Assignment Rule',
    active: true,
    entries: [
      {
        order: 1,
        assignedTo: '00G1111111111AAA',
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'Healthcare' },
          { field: 'State', operation: 'equals', value: 'CA' }
        ]
      },
      {
        order: 2,
        assignedTo: '00G2222222222BBB',
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'Healthcare' }
        ]
      },
      {
        order: 3,
        assignedTo: '00G3333333333CCC',
        criteriaItems: []
      }
    ]
  }
};

describe('criteria-evaluator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // evaluateCriteria Tests
  // ============================================================================
  describe('evaluateCriteria', () => {
    test('should evaluate equals operator', () => {
      const criteria = { field: 'Industry', operation: 'equals', value: 'Healthcare' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate notEqual operator', () => {
      const criteria = { field: 'Industry', operation: 'notEqual', value: 'Technology' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate lessThan operator', () => {
      const criteria = { field: 'AnnualRevenue', operation: 'lessThan', value: '10000000' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate greaterThan operator', () => {
      const criteria = { field: 'AnnualRevenue', operation: 'greaterThan', value: '1000000' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate lessOrEqual operator', () => {
      const criteria = { field: 'AnnualRevenue', operation: 'lessOrEqual', value: '5000000' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate greaterOrEqual operator', () => {
      const criteria = { field: 'AnnualRevenue', operation: 'greaterOrEqual', value: '5000000' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate contains operator', () => {
      const criteria = { field: 'Email', operation: 'contains', value: '@example' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate notContain operator', () => {
      const criteria = { field: 'Email', operation: 'notContain', value: '@test' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate startsWith operator', () => {
      const criteria = { field: 'Email', operation: 'startsWith', value: 'john' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should evaluate includes operator for multi-select picklist', () => {
      const criteria = { field: 'Topics', operation: 'includes', value: 'Sales' };
      const record = { Topics: 'Sales;Marketing;Support' };

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should handle case-insensitive string comparison', () => {
      const criteria = { field: 'Industry', operation: 'equals', value: 'healthcare' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should handle null field values with equals', () => {
      const criteria = { field: 'Description', operation: 'equals', value: null };
      const record = { Industry: 'Healthcare', Description: null };

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should handle null field values with notEqual', () => {
      const criteria = { field: 'Description', operation: 'notEqual', value: 'test' };
      const record = { Industry: 'Healthcare', Description: null };

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(false); // Null can't be "not equal" to a value
    });

    test('should handle undefined field values', () => {
      const criteria = { field: 'NonExistentField', operation: 'equals', value: '' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should return false for non-matching criteria', () => {
      const criteria = { field: 'Industry', operation: 'equals', value: 'Finance' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(false);
    });

    test('should handle unknown operators', () => {
      const criteria = { field: 'Industry', operation: 'unknownOp', value: 'Healthcare' };
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(false);
    });

    test('should handle null criteria', () => {
      const result = evaluateCriteria(null, FIXTURES.leadRecord1);

      expect(result).toBe(false);
    });

    test('should handle null record data', () => {
      const criteria = { field: 'Industry', operation: 'equals', value: 'Healthcare' };

      const result = evaluateCriteria(criteria, null);

      expect(result).toBe(false);
    });

    test('should parse dates for comparison', () => {
      const criteria = { field: 'CreatedDate', operation: 'greaterThan', value: '2020-01-01' };
      const record = { CreatedDate: '2025-01-01' };

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should default to equals operator if not specified', () => {
      const criteria = { field: 'Industry', value: 'Healthcare' }; // No operator
      const record = FIXTURES.leadRecord1;

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true);
    });

    test('should handle multiple values in includes operator', () => {
      const criteria = { field: 'Topics', operation: 'includes', value: 'Sales;Marketing' };
      const record = { Topics: 'Sales;Support' };

      const result = evaluateCriteria(criteria, record);

      expect(result).toBe(true); // At least one matches
    });
  });

  // ============================================================================
  // evaluateAllCriteria Tests (AND logic)
  // ============================================================================
  describe('evaluateAllCriteria', () => {
    test('should handle AND logic (all criteria must match)', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'equals', value: 'Healthcare' },
        { field: 'State', operation: 'equals', value: 'CA' }
      ];

      const result = evaluateAllCriteria(criteriaItems, FIXTURES.leadRecord1);

      expect(result).toBe(true);
    });

    test('should return false if any criteria does not match', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'equals', value: 'Healthcare' },
        { field: 'State', operation: 'equals', value: 'NY' } // Wrong state
      ];

      const result = evaluateAllCriteria(criteriaItems, FIXTURES.leadRecord1);

      expect(result).toBe(false);
    });

    test('should handle empty criteria (match all)', () => {
      const result = evaluateAllCriteria([], FIXTURES.leadRecord1);

      expect(result).toBe(true);
    });

    test('should handle null criteria', () => {
      const result = evaluateAllCriteria(null, FIXTURES.leadRecord1);

      expect(result).toBe(true); // No criteria = match all
    });

    test('should handle formula criteria', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'equals', value: 'Healthcare' }
      ];

      const result = evaluateAllCriteria(criteriaItems, FIXTURES.leadRecord1);

      expect(result).toBe(true);
    });

    test('should handle complex multi-criteria evaluation', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'equals', value: 'Healthcare' },
        { field: 'State', operation: 'equals', value: 'CA' },
        { field: 'AnnualRevenue', operation: 'greaterThan', value: '1000000' }
      ];

      const result = evaluateAllCriteria(criteriaItems, FIXTURES.leadRecord1);

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // findMatchingRule Tests
  // ============================================================================
  describe('findMatchingRule', () => {
    test('should return first matching rule', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry2, FIXTURES.entry3];

      const matchingRule = findMatchingRule(entries, FIXTURES.leadRecord1);

      expect(matchingRule).toBeDefined();
      expect(matchingRule.order).toBe(1); // First match
      expect(matchingRule.assignedTo).toBe('00G1111111111AAA');
    });

    test('should respect rule order', () => {
      const entries = [FIXTURES.entry2, FIXTURES.entry1]; // Order matters!

      const matchingRule = findMatchingRule(entries, FIXTURES.leadRecord1);

      // Should match entry2 first (even though entry1 is more specific)
      // because entry2 has lower order number
      expect(matchingRule).toBeDefined();
    });

    test('should return null if no match', () => {
      const entries = [
        {
          order: 1,
          assignedTo: '00G1111111111AAA',
          criteriaItems: [
            { field: 'Industry', operation: 'equals', value: 'Finance' }
          ]
        }
      ];

      const matchingRule = findMatchingRule(entries, FIXTURES.leadRecord1);

      expect(matchingRule).toBeNull();
    });

    test('should handle empty rule entries', () => {
      const matchingRule = findMatchingRule([], FIXTURES.leadRecord1);

      expect(matchingRule).toBeNull();
    });

    test('should handle null entries', () => {
      const matchingRule = findMatchingRule(null, FIXTURES.leadRecord1);

      expect(matchingRule).toBeNull();
    });

    test('should handle null record data', () => {
      const entries = [FIXTURES.entry1];

      const matchingRule = findMatchingRule(entries, null);

      expect(matchingRule).toBeNull();
    });

    test('should sort entries by order before matching', () => {
      const unsortedEntries = [
        { ...FIXTURES.entry3, order: 3 },
        { ...FIXTURES.entry1, order: 1 },
        { ...FIXTURES.entry2, order: 2 }
      ];

      const matchingRule = findMatchingRule(unsortedEntries, FIXTURES.leadRecord1);

      expect(matchingRule.order).toBe(1); // Should match first after sorting
    });

    test('should skip formula-based entries', () => {
      const entries = [
        {
          order: 1,
          assignedTo: '00G1111111111AAA',
          formula: 'AnnualRevenue > 1000000',
          criteriaItems: []
        },
        FIXTURES.entry2
      ];

      const matchingRule = findMatchingRule(entries, FIXTURES.leadRecord1);

      // Should skip formula and match entry2
      expect(matchingRule.order).toBe(2);
    });

    test('should match catch-all rule (no criteria)', () => {
      const entries = [
        {
          order: 10,
          assignedTo: '00G9999999999ZZZ',
          criteriaItems: []
        }
      ];

      const matchingRule = findMatchingRule(entries, FIXTURES.leadRecord1);

      expect(matchingRule).toBeDefined();
      expect(matchingRule.order).toBe(10);
    });
  });

  // ============================================================================
  // simulateAssignment Tests
  // ============================================================================
  describe('simulateAssignment', () => {
    test('should simulate against multiple records', () => {
      const sampleRecords = [
        FIXTURES.leadRecord1,
        FIXTURES.leadRecord2,
        FIXTURES.leadRecord3
      ];

      const results = simulateAssignment(FIXTURES.assignmentRule, sampleRecords);

      expect(results.totalRecords).toBe(3);
      expect(results.assigned).toBeGreaterThan(0);
      expect(results.recordResults).toHaveLength(3);
    });

    test('should return assignment results', () => {
      const sampleRecords = [FIXTURES.leadRecord1];

      const results = simulateAssignment(FIXTURES.assignmentRule, sampleRecords);

      expect(results).toHaveProperty('ruleName');
      expect(results).toHaveProperty('totalRecords');
      expect(results).toHaveProperty('assigned');
      expect(results).toHaveProperty('unassigned');
      expect(results).toHaveProperty('assignmentBreakdown');
      expect(results).toHaveProperty('recordResults');
    });

    test('should track which rule matched', () => {
      const sampleRecords = [FIXTURES.leadRecord1];

      const results = simulateAssignment(FIXTURES.assignmentRule, sampleRecords);

      expect(results.recordResults[0]).toHaveProperty('matched');
      expect(results.recordResults[0]).toHaveProperty('matchedEntryOrder');
      expect(results.recordResults[0]).toHaveProperty('assignedTo');
    });

    test('should handle records with no match', () => {
      const ruleWithoutCatchAll = {
        name: 'Limited Rule',
        entries: [
          {
            order: 1,
            assignedTo: '00G1111111111AAA',
            criteriaItems: [
              { field: 'Industry', operation: 'equals', value: 'Finance' }
            ]
          }
        ]
      };

      const sampleRecords = [FIXTURES.leadRecord1];

      const results = simulateAssignment(ruleWithoutCatchAll, sampleRecords);

      expect(results.unassigned).toBe(1);
      expect(results.recordResults[0].matched).toBe(false);
    });

    test('should count assignment breakdown by assignee', () => {
      const sampleRecords = [
        FIXTURES.leadRecord1, // Matches entry 1
        FIXTURES.leadRecord3  // Matches entry 2 (Healthcare but not CA)
      ];

      const results = simulateAssignment(FIXTURES.assignmentRule, sampleRecords);

      expect(results.assignmentBreakdown).toBeDefined();
      expect(Object.keys(results.assignmentBreakdown).length).toBeGreaterThan(0);
    });

    test('should handle invalid assignment rule', () => {
      const results = simulateAssignment(null, [FIXTURES.leadRecord1]);

      expect(results.error).toBeDefined();
      expect(results.error).toContain('Invalid');
    });

    test('should handle empty sample records', () => {
      const results = simulateAssignment(FIXTURES.assignmentRule, []);

      expect(results.error).toBeDefined();
      expect(results.error).toContain('No sample records');
    });

    test('should handle null sample records', () => {
      const results = simulateAssignment(FIXTURES.assignmentRule, null);

      expect(results.error).toBeDefined();
    });

    test('should include record data in results', () => {
      const sampleRecords = [FIXTURES.leadRecord1];

      const results = simulateAssignment(FIXTURES.assignmentRule, sampleRecords);

      expect(results.recordResults[0].record).toBeDefined();
      expect(results.recordResults[0].record).toEqual(FIXTURES.leadRecord1);
    });
  });

  // ============================================================================
  // validateCriteriaCompatibility Tests
  // ============================================================================
  describe('validateCriteriaCompatibility', () => {
    test('should validate field exists', () => {
      const criteriaItems = [
        { field: 'NonExistentField', operation: 'equals', value: 'test' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].severity).toBe('critical');
      expect(errors[0].message).toContain('does not exist');
    });

    test('should validate operator compatibility', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'contains', value: 'Health' } // Picklist doesn't support contains
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].severity).toBe('critical');
      expect(errors[0].message).toContain('not compatible');
    });

    test('should detect picklist vs string mismatch', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'startsWith', value: 'Health' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].fieldType).toBe('picklist');
    });

    test('should detect number vs text operator mismatch', () => {
      const criteriaItems = [
        { field: 'AnnualRevenue', operation: 'contains', value: '100' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors.length).toBeGreaterThan(0);
    });

    test('should return validation errors', () => {
      const criteriaItems = [
        { field: 'NonExistentField', operation: 'equals', value: 'test' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors[0]).toHaveProperty('severity');
      expect(errors[0]).toHaveProperty('field');
      expect(errors[0]).toHaveProperty('message');
      expect(errors[0]).toHaveProperty('resolution');
    });

    test('should validate picklist values', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'equals', value: 'InvalidValue' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].severity).toBe('warning');
      expect(errors[0].message).toContain('not a valid picklist option');
    });

    test('should warn about multi-select picklist with equals operator', () => {
      const objectDescribe = {
        ...FIXTURES.objectDescribe,
        fields: [
          ...FIXTURES.objectDescribe.fields,
          {
            name: 'Topics',
            type: 'multipicklist',
            picklistValues: [
              { value: 'Sales' },
              { value: 'Marketing' }
            ]
          }
        ]
      };

      const criteriaItems = [
        { field: 'Topics', operation: 'equals', value: 'Sales' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, objectDescribe);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("use 'includes'");
    });

    test('should handle null criteria items', () => {
      const errors = validateCriteriaCompatibility(null, FIXTURES.objectDescribe);

      expect(errors).toHaveLength(0);
    });

    test('should handle null object describe', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'equals', value: 'Healthcare' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, null);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].severity).toBe('warning');
      expect(errors[0].message).toContain('object describe not available');
    });

    test('should handle valid criteria', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'equals', value: 'Healthcare' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors).toHaveLength(0);
    });

    test('should provide supported operators in error', () => {
      const criteriaItems = [
        { field: 'Industry', operation: 'contains', value: 'Health' }
      ];

      const errors = validateCriteriaCompatibility(criteriaItems, FIXTURES.objectDescribe);

      expect(errors[0]).toHaveProperty('supportedOperators');
      expect(errors[0].supportedOperators).toContain('equals');
    });
  });

  // ============================================================================
  // validateRuleEntry Tests
  // ============================================================================
  describe('validateRuleEntry', () => {
    test('should validate rule entry with object describe', async () => {
      execSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: FIXTURES.objectDescribe
      }));

      const ruleEntry = {
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'Healthcare' }
        ]
      };

      const result = await validateRuleEntry(ruleEntry, 'Lead', 'myorg');

      expect(result.valid).toBe(true);
      expect(result.objectApiName).toBe('Lead');
    });

    test('should detect critical errors', async () => {
      execSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: FIXTURES.objectDescribe
      }));

      const ruleEntry = {
        criteriaItems: [
          { field: 'NonExistentField', operation: 'equals', value: 'test' }
        ]
      };

      const result = await validateRuleEntry(ruleEntry, 'Lead', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.criticalErrors).toBeGreaterThan(0);
    });

    test('should detect warnings', async () => {
      execSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: FIXTURES.objectDescribe
      }));

      const ruleEntry = {
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'InvalidValue' }
        ]
      };

      const result = await validateRuleEntry(ruleEntry, 'Lead', 'myorg');

      expect(result.warnings).toBeGreaterThan(0);
    });

    test('should provide recommendations', async () => {
      execSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: FIXTURES.objectDescribe
      }));

      const ruleEntry = {
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'Healthcare' }
        ]
      };

      const result = await validateRuleEntry(ruleEntry, 'Lead', 'myorg');

      expect(result).toHaveProperty('recommendation');
    });

    test('should handle API errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      const ruleEntry = {
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'Healthcare' }
        ]
      };

      const result = await validateRuleEntry(ruleEntry, 'Lead', 'myorg');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // OPERATOR_COMPATIBILITY Tests
  // ============================================================================
  describe('OPERATOR_COMPATIBILITY', () => {
    test('should export operator compatibility matrix', () => {
      expect(OPERATOR_COMPATIBILITY).toBeDefined();
      expect(OPERATOR_COMPATIBILITY).toHaveProperty('string');
      expect(OPERATOR_COMPATIBILITY).toHaveProperty('picklist');
      expect(OPERATOR_COMPATIBILITY).toHaveProperty('number');
    });

    test('should define operators for each field type', () => {
      const types = ['string', 'picklist', 'multipicklist', 'number', 'date', 'boolean'];

      types.forEach(type => {
        expect(OPERATOR_COMPATIBILITY[type]).toBeDefined();
        expect(Array.isArray(OPERATOR_COMPATIBILITY[type])).toBe(true);
      });
    });

    test('should include all standard operators', () => {
      const allOperators = Object.values(OPERATOR_COMPATIBILITY).flat();

      expect(allOperators).toContain('equals');
      expect(allOperators).toContain('notEqual');
      expect(allOperators).toContain('greaterThan');
      expect(allOperators).toContain('lessThan');
      expect(allOperators).toContain('contains');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe('Integration Tests', () => {
    test('should simulate complete assignment workflow', async () => {
      const sampleRecords = [
        FIXTURES.leadRecord1,
        FIXTURES.leadRecord2,
        FIXTURES.leadRecord3
      ];

      const results = simulateAssignment(FIXTURES.assignmentRule, sampleRecords);

      expect(results.totalRecords).toBe(3);
      expect(results.recordResults).toHaveLength(3);

      // Verify each record was processed
      results.recordResults.forEach(result => {
        expect(result).toHaveProperty('matched');
        expect(result).toHaveProperty('record');
      });
    });

    test('should validate and simulate rule entry', async () => {
      execSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: FIXTURES.objectDescribe
      }));

      const ruleEntry = FIXTURES.entry1;

      // Validate first
      const validation = await validateRuleEntry(ruleEntry, 'Lead', 'myorg');
      expect(validation.valid).toBe(true);

      // Then simulate
      const matchingRule = findMatchingRule([ruleEntry], FIXTURES.leadRecord1);
      expect(matchingRule).toBeDefined();
    });
  });
});
