/**
 * Unit Tests for Assignment Rule Overlap Detector
 *
 * Tests detection of overlapping rules, duplicate orders, circular routing,
 * reordering suggestions, and risk scoring.
 *
 * @group assignment-rules
 * @group conflict-detection
 */

const {
  detectOverlappingRules,
  findDuplicateOrders,
  detectCircularRouting,
  suggestReordering,
  calculateRiskScore,
  generateConflictReport
} = require('../../assignment-rule-overlap-detector');

/**
 * Test Fixtures
 */
const FIXTURES = {
  // Entry 1: Healthcare + California (very specific)
  entry1: {
    order: 1,
    assignedTo: '00G1111111111AAA',
    criteriaItems: [
      { field: 'Industry', operation: 'equals', value: 'Healthcare' },
      { field: 'State', operation: 'equals', value: 'CA' }
    ]
  },

  // Entry 2: Healthcare only (less specific)
  entry2: {
    order: 2,
    assignedTo: '00G2222222222BBB',
    criteriaItems: [
      { field: 'Industry', operation: 'equals', value: 'Healthcare' }
    ]
  },

  // Entry 3: California only (less specific)
  entry3: {
    order: 3,
    assignedTo: '00G3333333333CCC',
    criteriaItems: [
      { field: 'State', operation: 'equals', value: 'CA' }
    ]
  },

  // Entry 4: Exact duplicate of entry1
  entry4Duplicate: {
    order: 4,
    assignedTo: '00G4444444444DDD', // Different assignee
    criteriaItems: [
      { field: 'Industry', operation: 'equals', value: 'Healthcare' },
      { field: 'State', operation: 'equals', value: 'CA' }
    ]
  },

  // Entry 5: No criteria (matches all)
  entry5MatchAll: {
    order: 5,
    assignedTo: '00G5555555555EEE',
    criteriaItems: []
  },

  // Entry 6: Different industry
  entry6Different: {
    order: 6,
    assignedTo: '00G6666666666FFF',
    criteriaItems: [
      { field: 'Industry', operation: 'equals', value: 'Technology' }
    ]
  },

  // Entry 7: Same order as entry1 (duplicate order)
  entry7DuplicateOrder: {
    order: 1, // Same as entry1
    assignedTo: '00G7777777777GGG',
    criteriaItems: [
      { field: 'Status', operation: 'equals', value: 'New' }
    ]
  },

  // Entry 8: With formula
  entry8Formula: {
    order: 8,
    assignedTo: '00G8888888888HHH',
    formula: 'AnnualRevenue > 1000000',
    criteriaItems: []
  },

  // Assignment chain fixtures
  assignmentChainLinear: [
    { assignedTo: '0051111111111AAA', name: 'User A', type: 'User' },
    { assignedTo: '00G2222222222BBB', name: 'Queue B', type: 'Queue' },
    { assignedTo: '00E3333333333CCC', name: 'Role C', type: 'Role' }
  ],

  assignmentChainCircular: [
    { assignedTo: '0051111111111AAA', name: 'User A', type: 'User' },
    { assignedTo: '00G2222222222BBB', name: 'Queue B', type: 'Queue' },
    { assignedTo: '0051111111111AAA', name: 'User A', type: 'User' } // Back to User A!
  ],

  assignmentChainComplexCircular: [
    { assignedTo: '0051111111111AAA', name: 'User A', type: 'User' },
    { assignedTo: '00G2222222222BBB', name: 'Queue B', type: 'Queue' },
    { assignedTo: '00E3333333333CCC', name: 'Role C', type: 'Role' },
    { assignedTo: '00G2222222222BBB', name: 'Queue B', type: 'Queue' } // Cycle!
  ]
};

describe('assignment-rule-overlap-detector', () => {
  // ============================================================================
  // detectOverlappingRules Tests
  // ============================================================================
  describe('detectOverlappingRules', () => {
    test('should detect exact criteria overlap', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry4Duplicate];

      const conflicts = detectOverlappingRules(entries);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('overlapping_criteria');
      expect(conflicts[0].overlapType).toBe('exact_match');
      expect(conflicts[0].severity).toBe('critical');
      expect(conflicts[0].message).toContain('identical criteria');
      expect(conflicts[0].suggestedAction).toBe('remove_duplicate');
    });

    test('should detect subset criteria overlap', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry2];

      const conflicts = detectOverlappingRules(entries);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].overlapType).toBe('entry1_subset_of_entry2');
      expect(conflicts[0].isSubset).toBe(true);
      expect(conflicts[0].message).toContain('more specific');
    });

    test('should not flag non-overlapping rules', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry6Different];

      const conflicts = detectOverlappingRules(entries);

      expect(conflicts).toHaveLength(0);
    });

    test('should handle multiple overlaps', () => {
      const entries = [
        FIXTURES.entry1,
        FIXTURES.entry2,
        FIXTURES.entry3,
        FIXTURES.entry4Duplicate
      ];

      const conflicts = detectOverlappingRules(entries);

      expect(conflicts.length).toBeGreaterThan(1);
      expect(conflicts.some(c => c.overlapType === 'exact_match')).toBe(true);
      expect(conflicts.some(c => c.overlapType === 'entry1_subset_of_entry2')).toBe(true);
    });

    test('should return conflict objects with severity', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry4Duplicate];

      const conflicts = detectOverlappingRules(entries);

      expect(conflicts[0]).toHaveProperty('type');
      expect(conflicts[0]).toHaveProperty('severity');
      expect(conflicts[0]).toHaveProperty('entry1');
      expect(conflicts[0]).toHaveProperty('entry2');
      expect(conflicts[0]).toHaveProperty('message');
      expect(conflicts[0]).toHaveProperty('resolution');
      expect(conflicts[0]).toHaveProperty('autoResolvable');
      expect(conflicts[0]).toHaveProperty('suggestedAction');
    });

    test('should detect when entry matches all records', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry5MatchAll];

      const conflicts = detectOverlappingRules(entries);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].overlapType).toContain('matches_all');
      expect(conflicts[0].severity).toBe('critical');
    });

    test('should detect when both entries match all', () => {
      const entry1MatchAll = { ...FIXTURES.entry5MatchAll, order: 1 };
      const entry2MatchAll = { ...FIXTURES.entry5MatchAll, order: 2 };

      const conflicts = detectOverlappingRules([entry1MatchAll, entry2MatchAll]);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].overlapType).toBe('both_match_all');
      expect(conflicts[0].message).toContain('no criteria');
    });

    test('should handle correct ordering for subset rules', () => {
      const entries = [
        { ...FIXTURES.entry1, order: 1 }, // More specific first (correct)
        { ...FIXTURES.entry2, order: 2 }  // Less specific second
      ];

      const conflicts = detectOverlappingRules(entries);

      const subsetConflict = conflicts.find(c => c.isSubset);
      expect(subsetConflict.resolution).toContain('Correct');
      expect(subsetConflict.suggestedAction).toBe('ok');
    });

    test('should detect incorrect ordering for subset rules', () => {
      const entries = [
        { ...FIXTURES.entry2, order: 1 }, // Less specific first (incorrect)
        { ...FIXTURES.entry1, order: 2 }  // More specific second
      ];

      const conflicts = detectOverlappingRules(entries);

      const subsetConflict = conflicts.find(c => c.isSubset);
      expect(subsetConflict.resolution).toContain('Reorder');
      expect(subsetConflict.autoResolvable).toBe(true);
      expect(subsetConflict.suggestedAction).toBe('reorder');
    });

    test('should detect partial overlap', () => {
      const entry1 = {
        order: 1,
        assignedTo: '00G1111111111AAA',
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'Healthcare' },
          { field: 'State', operation: 'equals', value: 'CA' }
        ]
      };

      const entry2 = {
        order: 2,
        assignedTo: '00G2222222222BBB',
        criteriaItems: [
          { field: 'Industry', operation: 'equals', value: 'Healthcare' },
          { field: 'Status', operation: 'equals', value: 'New' }
        ]
      };

      const conflicts = detectOverlappingRules([entry1, entry2]);

      const partialConflict = conflicts.find(c => c.overlapType === 'partial_overlap');
      expect(partialConflict).toBeDefined();
      expect(partialConflict.message).toContain('common criteria');
    });

    test('should handle empty array', () => {
      const conflicts = detectOverlappingRules([]);

      expect(conflicts).toHaveLength(0);
    });

    test('should handle single entry', () => {
      const conflicts = detectOverlappingRules([FIXTURES.entry1]);

      expect(conflicts).toHaveLength(0);
    });

    test('should handle null input', () => {
      const conflicts = detectOverlappingRules(null);

      expect(conflicts).toHaveLength(0);
    });

    test('should handle entries with no criteriaItems property', () => {
      const entry1 = { order: 1, assignedTo: '00G1111111111AAA' };
      const entry2 = { order: 2, assignedTo: '00G2222222222BBB' };

      const conflicts = detectOverlappingRules([entry1, entry2]);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].overlapType).toBe('both_match_all');
    });
  });

  // ============================================================================
  // findDuplicateOrders Tests
  // ============================================================================
  describe('findDuplicateOrders', () => {
    test('should find entries with same orderNumber', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry7DuplicateOrder];

      const conflicts = findDuplicateOrders(entries);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('duplicate_order');
      expect(conflicts[0].orderNumber).toBe(1);
      expect(conflicts[0].entries).toHaveLength(2);
      expect(conflicts[0].severity).toBe('critical');
    });

    test('should return empty for unique orders', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry2, FIXTURES.entry3];

      const conflicts = findDuplicateOrders(entries);

      expect(conflicts).toHaveLength(0);
    });

    test('should handle null entries', () => {
      const conflicts = findDuplicateOrders(null);

      expect(conflicts).toHaveLength(0);
    });

    test('should handle multiple duplicate groups', () => {
      const entries = [
        { order: 1, assignedTo: 'A' },
        { order: 1, assignedTo: 'B' },
        { order: 2, assignedTo: 'C' },
        { order: 2, assignedTo: 'D' },
        { order: 3, assignedTo: 'E' }
      ];

      const conflicts = findDuplicateOrders(entries);

      expect(conflicts).toHaveLength(2); // Two duplicate groups
      expect(conflicts[0].orderNumber).toBe(1);
      expect(conflicts[1].orderNumber).toBe(2);
    });

    test('should mark duplicate orders as auto-resolvable', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry7DuplicateOrder];

      const conflicts = findDuplicateOrders(entries);

      expect(conflicts[0].autoResolvable).toBe(true);
      expect(conflicts[0].suggestedAction).toBe('renumber');
    });

    test('should include resolution in conflict', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry7DuplicateOrder];

      const conflicts = findDuplicateOrders(entries);

      expect(conflicts[0].resolution).toContain('unique order values');
    });

    test('should handle three or more entries with same order', () => {
      const entries = [
        { order: 5, assignedTo: 'A' },
        { order: 5, assignedTo: 'B' },
        { order: 5, assignedTo: 'C' }
      ];

      const conflicts = findDuplicateOrders(entries);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].entries).toHaveLength(3);
      expect(conflicts[0].message).toContain('3 entries');
    });
  });

  // ============================================================================
  // detectCircularRouting Tests
  // ============================================================================
  describe('detectCircularRouting', () => {
    test('should detect User → Queue → User cycle', () => {
      const result = detectCircularRouting(FIXTURES.assignmentChainCircular);

      expect(result.hasCircularRouting).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.path).toContain('User A');
      expect(result.message).toContain('Circular routing detected');
    });

    test('should detect multi-hop cycles', () => {
      const result = detectCircularRouting(FIXTURES.assignmentChainComplexCircular);

      expect(result.hasCircularRouting).toBe(true);
      expect(result.cycleLength).toBeGreaterThan(0);
      expect(result.path).toBeDefined();
    });

    test('should return empty for acyclic assignments', () => {
      const result = detectCircularRouting(FIXTURES.assignmentChainLinear);

      expect(result.hasCircularRouting).toBe(false);
      expect(result.message).toContain('No circular routing');
      expect(result.pathLength).toBe(3);
    });

    test('should include cycle path in result', () => {
      const result = detectCircularRouting(FIXTURES.assignmentChainCircular);

      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.cycleStart).toBeDefined();
    });

    test('should handle empty chain', () => {
      const result = detectCircularRouting([]);

      expect(result.hasCircularRouting).toBe(false);
    });

    test('should handle null input', () => {
      const result = detectCircularRouting(null);

      expect(result.hasCircularRouting).toBe(false);
      expect(result.message).toContain('Invalid');
    });

    test('should handle single assignment', () => {
      const result = detectCircularRouting([FIXTURES.assignmentChainLinear[0]]);

      expect(result.hasCircularRouting).toBe(false);
    });

    test('should handle assignments with missing IDs', () => {
      const chain = [
        { assignedTo: '0051111111111AAA', name: 'User A' },
        { name: 'Unknown' }, // No ID
        { assignedTo: '00G2222222222BBB', name: 'Queue B' }
      ];

      const result = detectCircularRouting(chain);

      expect(result.hasCircularRouting).toBe(false);
    });

    test('should detect self-loop', () => {
      const chain = [
        { assignedTo: '0051111111111AAA', name: 'User A', type: 'User' },
        { assignedTo: '0051111111111AAA', name: 'User A', type: 'User' }
      ];

      const result = detectCircularRouting(chain);

      expect(result.hasCircularRouting).toBe(true);
      expect(result.cycleLength).toBe(1);
    });
  });

  // ============================================================================
  // suggestReordering Tests
  // ============================================================================
  describe('suggestReordering', () => {
    test('should place specific criteria before general', () => {
      const entries = [
        FIXTURES.entry2,  // Less specific (1 criterion)
        FIXTURES.entry1,  // More specific (2 criteria)
        FIXTURES.entry3   // Less specific (1 criterion)
      ];

      const reordered = suggestReordering(entries);

      expect(reordered[0].specificityScore).toBeGreaterThan(reordered[1].specificityScore);
      expect(reordered[0].suggestedOrder).toBeLessThan(reordered[1].suggestedOrder);
    });

    test('should preserve non-overlapping order', () => {
      const entries = [
        FIXTURES.entry1,
        FIXTURES.entry6Different
      ];

      const reordered = suggestReordering(entries);

      expect(reordered).toHaveLength(2);
    });

    test('should return optimized order array', () => {
      const entries = [FIXTURES.entry2, FIXTURES.entry1];

      const reordered = suggestReordering(entries);

      expect(reordered[0]).toHaveProperty('originalOrder');
      expect(reordered[0]).toHaveProperty('suggestedOrder');
      expect(reordered[0]).toHaveProperty('specificityScore');
      expect(reordered[0]).toHaveProperty('orderChanged');
    });

    test('should prioritize formulas over criteria', () => {
      const entries = [
        FIXTURES.entry1,      // 2 criteria
        FIXTURES.entry8Formula // Formula (score +5)
      ];

      const reordered = suggestReordering(entries);

      // Formula should have higher specificity
      const formulaEntry = reordered.find(e => e.formula);
      expect(formulaEntry.specificityScore).toBe(5); // 0 criteria + 5 formula
    });

    test('should use gaps of 10 for future insertions', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry2, FIXTURES.entry3];

      const reordered = suggestReordering(entries);

      expect(reordered[0].suggestedOrder).toBe(10);
      expect(reordered[1].suggestedOrder).toBe(20);
      expect(reordered[2].suggestedOrder).toBe(30);
    });

    test('should mark orderChanged flag', () => {
      const entries = [
        { ...FIXTURES.entry1, order: 50 },
        { ...FIXTURES.entry2, order: 10 }
      ];

      const reordered = suggestReordering(entries);

      expect(reordered.some(e => e.orderChanged)).toBe(true);
    });

    test('should handle empty array', () => {
      const reordered = suggestReordering([]);

      expect(reordered).toHaveLength(0);
    });

    test('should handle null input', () => {
      const reordered = suggestReordering(null);

      expect(reordered).toHaveLength(0);
    });

    test('should handle entries with no criteria', () => {
      const entries = [
        FIXTURES.entry5MatchAll,
        FIXTURES.entry1
      ];

      const reordered = suggestReordering(entries);

      // Entry with criteria should come first
      expect(reordered[0].criteriaItems.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // calculateRiskScore Tests
  // ============================================================================
  describe('calculateRiskScore', () => {
    test('should calculate 0-100 risk score', () => {
      const conflicts = [
        { severity: 'critical', type: 'exact_match' },
        { severity: 'warning', type: 'partial_overlap' }
      ];

      const score = calculateRiskScore(conflicts);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('should weight by conflict severity', () => {
      const criticalConflicts = [{ severity: 'critical' }];
      const warningConflicts = [{ severity: 'warning' }];

      const criticalScore = calculateRiskScore(criticalConflicts);
      const warningScore = calculateRiskScore(warningConflicts);

      expect(criticalScore).toBeGreaterThan(warningScore);
    });

    test('should return 0 for no conflicts', () => {
      const score = calculateRiskScore([]);

      expect(score).toBe(0);
    });

    test('should return 100 for critical conflicts', () => {
      const conflicts = [
        { severity: 'critical', type: 'exact_match' },
        { severity: 'critical', type: 'circular_routing' },
        { severity: 'critical', type: 'duplicate_order' }
      ];

      const score = calculateRiskScore(conflicts);

      expect(score).toBe(100); // Capped at 100
    });

    test('should add extra weight for exact_match', () => {
      const exactMatch = [{ severity: 'warning', type: 'exact_match' }];
      const regular = [{ severity: 'warning', type: 'partial_overlap' }];

      const exactScore = calculateRiskScore(exactMatch);
      const regularScore = calculateRiskScore(regular);

      expect(exactScore).toBeGreaterThan(regularScore);
    });

    test('should add extra weight for circular_routing', () => {
      const circular = [{ severity: 'warning', type: 'circular_routing' }];
      const regular = [{ severity: 'warning', type: 'partial_overlap' }];

      const circularScore = calculateRiskScore(circular);
      const regularScore = calculateRiskScore(regular);

      expect(circularScore).toBeGreaterThan(regularScore);
    });

    test('should handle null input', () => {
      const score = calculateRiskScore(null);

      expect(score).toBe(0);
    });

    test('should handle info severity', () => {
      const conflicts = [{ severity: 'info' }];

      const score = calculateRiskScore(conflicts);

      expect(score).toBe(3); // Info adds 3 points
    });
  });

  // ============================================================================
  // generateConflictReport Tests
  // ============================================================================
  describe('generateConflictReport', () => {
    test('should generate comprehensive report', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry4Duplicate];

      const report = generateConflictReport(entries);

      expect(report).toHaveProperty('totalEntries');
      expect(report).toHaveProperty('totalConflicts');
      expect(report).toHaveProperty('criticalConflicts');
      expect(report).toHaveProperty('warningConflicts');
      expect(report).toHaveProperty('riskScore');
      expect(report).toHaveProperty('riskLevel');
      expect(report).toHaveProperty('conflicts');
      expect(report).toHaveProperty('recommendations');
    });

    test('should categorize risk level', () => {
      const lowRisk = [FIXTURES.entry1, FIXTURES.entry6Different];
      const highRisk = [FIXTURES.entry1, FIXTURES.entry4Duplicate, FIXTURES.entry7DuplicateOrder];

      const lowReport = generateConflictReport(lowRisk);
      const highReport = generateConflictReport(highRisk);

      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(lowReport.riskLevel);
      expect(['LOW', 'MEDIUM', 'HIGH']).toContain(highReport.riskLevel);
      expect(highReport.riskScore).toBeGreaterThan(lowReport.riskScore);
    });

    test('should include both overlapping and order conflicts', () => {
      const entries = [
        FIXTURES.entry1,
        FIXTURES.entry4Duplicate,
        FIXTURES.entry7DuplicateOrder
      ];

      const report = generateConflictReport(entries);

      expect(report.conflicts.overlapping.length).toBeGreaterThan(0);
      expect(report.conflicts.orderDuplicates.length).toBeGreaterThan(0);
    });

    test('should count auto-resolvable conflicts', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry7DuplicateOrder];

      const report = generateConflictReport(entries);

      expect(report.autoResolvable).toBeGreaterThan(0);
    });

    test('should provide recommendations', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry4Duplicate];

      const report = generateConflictReport(entries);

      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations[0]).toHaveProperty('priority');
      expect(report.recommendations[0]).toHaveProperty('message');
      expect(report.recommendations[0]).toHaveProperty('action');
    });

    test('should suggest reordering for medium+ risk', () => {
      const entries = [
        FIXTURES.entry2, // Order 2
        FIXTURES.entry1  // Order 1 (but should be first due to specificity)
      ];

      const report = generateConflictReport(entries);

      if (report.riskScore >= 30) {
        expect(report.suggestedReordering).toBeDefined();
      }
    });

    test('should handle no conflicts', () => {
      const entries = [FIXTURES.entry1];

      const report = generateConflictReport(entries);

      expect(report.totalConflicts).toBe(0);
      expect(report.riskScore).toBe(0);
      expect(report.riskLevel).toBe('LOW');
      expect(report.recommendations[0].priority).toBe('info');
    });

    test('should provide critical recommendations for high risk', () => {
      const entries = [
        FIXTURES.entry1,
        FIXTURES.entry4Duplicate,
        FIXTURES.entry7DuplicateOrder
      ];

      const report = generateConflictReport(entries);

      if (report.riskScore >= 60) {
        expect(report.recommendations.some(r => r.priority === 'critical')).toBe(true);
      }
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe('Integration Tests', () => {
    test('should detect all conflict types in complex rule set', () => {
      const entries = [
        FIXTURES.entry1,               // Order 1
        FIXTURES.entry7DuplicateOrder, // Order 1 (duplicate)
        FIXTURES.entry2,               // Order 2 (subset of entry1)
        FIXTURES.entry4Duplicate,      // Order 4 (exact match of entry1)
        FIXTURES.entry5MatchAll        // Order 5 (matches all)
      ];

      const report = generateConflictReport(entries);

      expect(report.totalConflicts).toBeGreaterThan(0);
      expect(report.conflicts.overlapping.length).toBeGreaterThan(0);
      expect(report.conflicts.orderDuplicates.length).toBeGreaterThan(0);
      expect(report.riskScore).toBeGreaterThan(0);
    });

    test('should provide actionable recommendations', () => {
      const entries = [FIXTURES.entry1, FIXTURES.entry4Duplicate];

      const report = generateConflictReport(entries);

      expect(report.recommendations.every(r => r.action)).toBe(true);
      expect(report.recommendations.every(r => r.message)).toBe(true);
    });

    test('should optimize rule ordering', () => {
      const entries = [
        FIXTURES.entry5MatchAll, // Should be last
        FIXTURES.entry2,         // Should be middle
        FIXTURES.entry1          // Should be first (most specific)
      ];

      const reordered = suggestReordering(entries);

      // Most specific first
      expect(reordered[0].specificityScore).toBeGreaterThanOrEqual(reordered[1].specificityScore);
      expect(reordered[1].specificityScore).toBeGreaterThanOrEqual(reordered[2].specificityScore);
    });
  });
});
