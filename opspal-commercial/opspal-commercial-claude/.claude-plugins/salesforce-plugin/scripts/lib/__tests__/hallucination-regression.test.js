/**
 * Hallucination Prevention Regression Tests
 *
 * P0 tests for validating fabrication detection in RevOps/CPQ assessments.
 * These tests ensure agents refuse to guess when data is unavailable
 * and detect fabricated IDs, values, and names.
 *
 * @module hallucination-regression
 * @version 1.0.0
 * @created 2025-12-26
 */

const ResponseSanityChecker = require('../response-sanity-checker.js');

describe('Hallucination Prevention', () => {
  let checker;

  beforeEach(() => {
    checker = new ResponseSanityChecker({ fabricationDetection: true });
  });

  // ============================================================================
  // FABRICATED SALESFORCE ID DETECTION
  // ============================================================================

  describe('Fabricated Salesforce ID Detection', () => {
    test('should detect fabricated Account IDs not in query results', () => {
      const response = `
        The top opportunities are:
        - Account: Acme Corp (001000000FAKE001)
        - Account: Widget Inc (001000000FAKE002)
        Total pipeline: $1.2M
      `;

      const queryResults = {
        records: [
          { Id: '001000000REAL001', Name: 'Real Company A', Amount: 500000 },
          { Id: '001000000REAL002', Name: 'Real Company B', Amount: 700000 }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
      expect(result.fabricationDetected).toBe(true);
      expect(result.concerns.some(c => c.type === 'FABRICATED_ID')).toBe(true);
    });

    test('should pass when all IDs exist in query results', () => {
      const response = `
        The top accounts are:
        - Account ID: 001000000REAL001 (Acme Corp)
        - Account ID: 001000000REAL002 (Widget Inc)
      `;

      const queryResults = {
        records: [
          { Id: '001000000REAL001', Name: 'Acme Corp' },
          { Id: '001000000REAL002', Name: 'Widget Inc' }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(true);
      expect(result.fabricationDetected).toBe(false);
    });

    test('should detect fabricated Lead IDs (00Q prefix)', () => {
      const response = `
        High priority leads to follow up:
        - Lead 00Q000000000FAKE (John Smith)
        - Lead 00Q000000000FAKE2 (Jane Doe)
      `;

      const queryResults = {
        records: [
          { Id: '00Q000000000REAL', Name: 'Real Lead' }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c =>
        c.type === 'FABRICATED_ID' && c.fabricatedIds.length >= 1
      )).toBe(true);
    });

    test('should detect fabricated Opportunity IDs (006 prefix)', () => {
      const response = `
        Pipeline summary:
        - Opportunity 006000000000FAKE (Q4 Deal) - $500K
      `;

      const queryResults = {
        records: [] // No opportunities in results
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
    });

    test('should handle nested lookup IDs in query results', () => {
      const response = `
        Contact: 003000000000REAL (linked to Account 001000000000ACCT)
      `;

      const queryResults = {
        records: [
          {
            Id: '003000000000REAL',
            Name: 'Contact Name',
            AccountId: '001000000000ACCT',
            Account: { Id: '001000000000ACCT', Name: 'Parent Account' }
          }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // MISSING DATA SCENARIOS
  // ============================================================================

  describe('Missing Data Scenarios', () => {
    test('should not flag response when query returns no records and response acknowledges it', () => {
      const response = `
        No records found matching the criteria.
        The query returned 0 opportunities.
      `;

      const queryResults = {
        records: [],
        totalSize: 0
      };

      const result = checker.validateFabrication(response, queryResults);

      // Should pass - response correctly states no records found
      expect(result.valid).toBe(true);
    });

    test('should detect fabricated counts when query returns empty', () => {
      const response = `
        Analysis complete:
        - Found 147 opportunities in the pipeline
        - Win rate: 34%
        - Average deal size: $45,000
      `;

      const queryResults = {
        records: [],
        totalSize: 0
      };

      const result = checker.validateFabrication(response, queryResults);

      // Should flag - claiming specific counts with no data
      expect(result.valid).toBe(false);
      expect(result.concerns.some(c => c.type === 'UNSUPPORTED_NUMERIC')).toBe(true);
    });
  });

  // ============================================================================
  // FABRICATED NAME PATTERNS
  // ============================================================================

  describe('Fabricated Name Detection', () => {
    test('should detect placeholder company names', () => {
      const response = `
        Top customers:
        1. Acme Corp - $1.2M
        2. Example Inc - $800K
        3. Sample Company - $500K
      `;

      const queryResults = {
        records: [
          { Id: '001xxx', Name: 'Real Customer Inc', Amount: 1200000 }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c => c.type === 'FABRICATED_NAME')).toBe(true);
    });

    test('should detect generic numbered records (Lead 1, Opportunity 23)', () => {
      const response = `
        Leads requiring follow-up:
        - Lead 1: High priority
        - Lead 2: Medium priority
        - Lead 3: Low priority
      `;

      const queryResults = {
        records: [
          { Id: '00Qxxx', Name: 'John Smith', Status: 'Working' }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c =>
        c.type === 'FABRICATED_NAME' && c.claim.includes('Lead')
      )).toBe(true);
    });

    test('should detect placeholder personal names', () => {
      const response = `
        Key contacts:
        - John Doe (VP Sales)
        - Jane Doe (CFO)
      `;

      const queryResults = {
        records: [
          { Id: '003xxx', FirstName: 'Sarah', LastName: 'Johnson' }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c =>
        c.type === 'FABRICATED_NAME' && c.claim.includes('Doe')
      )).toBe(true);
    });

    test('should pass with real company names from query results', () => {
      const response = `
        Top customers:
        1. Salesforce Inc - $1.2M
        2. HubSpot - $800K
      `;

      const queryResults = {
        records: [
          { Id: '001a', Name: 'Salesforce Inc', Amount: 1200000 },
          { Id: '001b', Name: 'HubSpot', Amount: 800000 }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      // Names match query results - should pass
      expect(result.concerns.filter(c => c.type === 'FABRICATED_NAME')).toHaveLength(0);
    });
  });

  // ============================================================================
  // NUMERIC VALUE VALIDATION
  // ============================================================================

  describe('Numeric Value Validation', () => {
    test('should detect currency values not in query results', () => {
      const response = `
        Pipeline summary:
        - Total pipeline: $5.2M
        - Average deal: $125K
      `;

      const queryResults = {
        records: [
          { Id: '006a', Amount: 50000 },
          { Id: '006b', Amount: 75000 }
        ]
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c =>
        c.type === 'UNSUPPORTED_NUMERIC' && c.claim.includes('$5.2M')
      )).toBe(true);
    });

    test('should detect record counts not matching query results', () => {
      const response = `
        Analysis found 500 opportunities in the pipeline.
      `;

      const queryResults = {
        records: [{ Id: '006a' }, { Id: '006b' }, { Id: '006c' }],
        totalSize: 3
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(false);
      expect(result.concerns.some(c => c.type === 'UNSUPPORTED_NUMERIC')).toBe(true);
    });

    test('should pass when values match query results within tolerance', () => {
      const response = `
        Pipeline summary:
        - Total pipeline: $125K
        - Found 3 opportunities
      `;

      const queryResults = {
        records: [
          { Id: '006a', Amount: 50000 },
          { Id: '006b', Amount: 75000 }
        ],
        totalSize: 3
      };

      const result = checker.validateFabrication(response, queryResults);

      // 125K = 50K + 75K = 125K (matches within tolerance)
      // 3 opportunities matches totalSize
      expect(result.concerns.filter(c => c.type === 'UNSUPPORTED_NUMERIC')).toHaveLength(0);
    });
  });

  // ============================================================================
  // CONFLICTING DATA SCENARIOS
  // ============================================================================

  describe('Conflicting Data Scenarios', () => {
    test('should use standard validation for contradictory percentages', () => {
      const response = `
        Win analysis:
        - 75% of deals won
        - 60% of deals lost
      `;

      // 75% + 60% = 135% - impossible
      const result = checker.validate(response, {});

      expect(result.valid).toBe(false);
      expect(result.concerns.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CITATION COVERAGE
  // ============================================================================

  describe('Citation Coverage', () => {
    test('should calculate citation coverage for structured claims', () => {
      const response = {
        supported_claims: [
          { statement: 'Pipeline is $1.2M', source_id: 'query_001' },
          { statement: 'Win rate is 34%', source_id: 'query_002' },
          { statement: 'Average deal is $45K' } // Missing source_id
        ]
      };

      const sources = new Set(['query_001', 'query_002', 'query_003']);

      const coverage = checker.calculateCitationCoverage(response, sources);

      expect(coverage.total_claims).toBe(3);
      expect(coverage.cited_claims).toBe(2);
      expect(coverage.coverage_percent).toBeCloseTo(66.67, 1);
      expect(coverage.uncited_claims).toContain('Average deal is $45K');
    });

    test('should return 100% coverage when all claims are cited', () => {
      const response = {
        supported_claims: [
          { statement: 'Metric A', source_id: 'q1' },
          { statement: 'Metric B', source_id: 'q2' }
        ]
      };

      const sources = new Set(['q1', 'q2']);

      const coverage = checker.calculateCitationCoverage(response, sources);

      expect(coverage.coverage_percent).toBe(100);
      expect(coverage.uncited_claims).toHaveLength(0);
    });

    test('should handle response without supported_claims structure', () => {
      const response = 'Plain text response without structured claims';

      const coverage = checker.calculateCitationCoverage(response, new Set());

      expect(coverage.coverage_percent).toBeNull();
      expect(coverage.note).toContain('does not use supported_claims structure');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle null query results gracefully', () => {
      const response = 'Some response text with ID 001000000000TEST';

      const result = checker.validateFabrication(response, null);

      // Should not throw, but may flag IDs as unverified
      expect(result).toBeDefined();
    });

    test('should handle empty response', () => {
      const response = '';

      const result = checker.validateFabrication(response, { records: [] });

      expect(result.valid).toBe(true);
      expect(result.concerns).toHaveLength(0);
    });

    test('should handle query results with different structures', () => {
      const response = 'Account 001000000000TEST found';

      // Nested data structure
      const queryResults = {
        data: {
          records: [{ Id: '001000000000TEST', Name: 'Test' }]
        }
      };

      const result = checker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(true);
    });

    test('should correctly normalize 15 vs 18 character IDs', () => {
      const response = 'Found Account 001000000000TEST';

      // Query returns 18-char ID
      const queryResults = {
        records: [{ Id: '001000000000TESTAAA' }]
      };

      const result = checker.validateFabrication(response, queryResults);

      // Should recognize as same ID (15-char prefix matches)
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  describe('Configuration', () => {
    test('should respect fabricationDetection config flag', () => {
      const disabledChecker = new ResponseSanityChecker({ fabricationDetection: false });

      const response = 'Fabricated ID 001000000000FAKE';
      const queryResults = { records: [] };

      const result = disabledChecker.validateFabrication(response, queryResults);

      expect(result.valid).toBe(true);
      expect(result.concerns).toHaveLength(0);
    });

    test('should use configurable confidence threshold', () => {
      const customChecker = new ResponseSanityChecker({
        fabricationDetection: true,
        fabricationConfidence: 0.99
      });

      const response = 'ID 001000000000FAKE mentioned';
      const queryResults = { records: [] };

      const result = customChecker.validateFabrication(response, queryResults);

      expect(result.confidence).toBe(0.99);
    });
  });

  // ============================================================================
  // INTEGRATION WITH STANDARD VALIDATION
  // ============================================================================

  describe('Integration with Standard Validation', () => {
    test('should combine fabrication and statistical validation', () => {
      const response = `
        Analysis results:
        - 99.5% of all leads converted (suspicious percentage)
        - Account 001000000000FAKE (fabricated ID)
      `;

      const queryResults = { records: [] };

      // Run both validations
      const statisticalResult = checker.validate(response, {});
      const fabricationResult = checker.validateFabrication(response, queryResults);

      // Both should detect issues
      expect(statisticalResult.valid).toBe(false);
      expect(fabricationResult.valid).toBe(false);
    });
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('Helper Functions', () => {
  let checker;

  beforeEach(() => {
    checker = new ResponseSanityChecker();
  });

  describe('extractSalesforceIds', () => {
    test('should extract 15-character Account IDs', () => {
      const text = 'Account ID: 001A000001abcde';
      const ids = checker.extractSalesforceIds(text);

      expect(ids.size).toBeGreaterThan(0);
    });

    test('should extract 18-character IDs', () => {
      const text = 'Full ID: 001A000001abcdeXYZ';
      const ids = checker.extractSalesforceIds(text);

      expect(ids.size).toBeGreaterThan(0);
    });

    test('should extract multiple IDs from text', () => {
      const text = `
        Account: 001A000001abcde
        Contact: 003A000001fghij
        Opportunity: 006A000001klmno
      `;
      const ids = checker.extractSalesforceIds(text);

      expect(ids.size).toBe(3);
    });

    test('should not extract non-Salesforce patterns', () => {
      const text = 'UUID: 123e4567-e89b-12d3-a456-426614174000';
      const ids = checker.extractSalesforceIds(text);

      expect(ids.size).toBe(0);
    });
  });

  describe('parseCurrencyValue', () => {
    test('should parse K suffix', () => {
      expect(checker.parseCurrencyValue('$125K')).toBe(125000);
    });

    test('should parse M suffix', () => {
      expect(checker.parseCurrencyValue('$1.5M')).toBe(1500000);
    });

    test('should parse B suffix', () => {
      expect(checker.parseCurrencyValue('$2.3B')).toBe(2300000000);
    });

    test('should parse plain numbers', () => {
      expect(checker.parseCurrencyValue('$1,234,567')).toBe(1234567);
    });
  });
});

// ============================================================================
// PHASE 2 - CITATION VERIFICATION TESTS
// ============================================================================

describe('Citation Verification (Phase 2)', () => {
  let checker;

  beforeEach(() => {
    checker = new ResponseSanityChecker({ fabricationDetection: true });
  });

  describe('verifyClaimsAgainstSources', () => {
    test('should verify claims that match source data', () => {
      const response = `
        The pipeline stands at $1.2M across 47 opportunities.
        Win rate is 34% based on closed deals.
      `;

      const sources = {
        query_001: [
          { TotalPipeline: 1200000, OpportunityCount: 47 }
        ],
        query_002: [
          { WonCount: 34, TotalClosed: 100, WinRate: 34 }
        ]
      };

      const result = checker.verifyClaimsAgainstSources(response, sources);

      expect(result.verified.length).toBeGreaterThan(0);
      expect(result.coverage_percent).toBeGreaterThan(50);
    });

    test('should flag unverified claims', () => {
      const response = `
        The pipeline is $5M with 200 opportunities.
      `;

      const sources = {
        query_001: [
          { TotalPipeline: 1200000, OpportunityCount: 47 }
        ]
      };

      const result = checker.verifyClaimsAgainstSources(response, sources);

      expect(result.retracted.length).toBeGreaterThan(0);
      expect(result.valid).toBe(false);
    });

    test('should handle empty sources gracefully', () => {
      const response = 'Win rate is 34%';
      const sources = {};

      const result = checker.verifyClaimsAgainstSources(response, sources);

      expect(result.retracted.length).toBeGreaterThan(0);
      expect(result.coverage_percent).toBe(0);
    });
  });

  describe('extractClaimsFromText', () => {
    test('should extract currency claims', () => {
      const text = 'Pipeline value is $1.5M and average deal is $25K';
      const claims = checker.extractClaimsFromText(text);

      const currencyClaims = claims.filter(c => c.type === 'currency');
      expect(currencyClaims.length).toBe(2);
    });

    test('should extract percentage claims', () => {
      const text = 'Win rate is 34.5% and conversion is 28%';
      const claims = checker.extractClaimsFromText(text);

      const percentClaims = claims.filter(c => c.type === 'percentage');
      expect(percentClaims.length).toBe(2);
    });

    test('should extract count claims', () => {
      const text = 'There are 47 opportunities and 125 leads in the funnel';
      const claims = checker.extractClaimsFromText(text);

      const countClaims = claims.filter(c => c.type === 'count');
      expect(countClaims.length).toBe(2);
    });

    test('should extract comparative claims', () => {
      const text = 'This is 15% higher than last quarter';
      const claims = checker.extractClaimsFromText(text);

      const comparativeClaims = claims.filter(c => c.type === 'comparative');
      expect(comparativeClaims.length).toBeGreaterThan(0);
    });

    test('should extract temporal claims', () => {
      const text = 'Over the last 6 months, revenue grew by 20%';
      const claims = checker.extractClaimsFromText(text);

      const temporalClaims = claims.filter(c => c.type === 'temporal');
      expect(temporalClaims.length).toBeGreaterThan(0);
    });
  });

  describe('findSupportingQuote', () => {
    test('should find exact numeric match', () => {
      const claim = { type: 'currency', value: 1200000, text: '$1.2M' };
      const sources = {
        query_001: [{ Amount: 1200000 }]
      };

      const quote = checker.findSupportingQuote(claim, sources);

      expect(quote).not.toBeNull();
      expect(quote.source_id).toBe('query_001');
    });

    test('should find match within tolerance', () => {
      const claim = { type: 'percentage', value: 34, text: '34%' };
      const sources = {
        query_001: [{ WinRate: 34.2 }]
      };

      const quote = checker.findSupportingQuote(claim, sources);

      expect(quote).not.toBeNull();
      expect(quote.confidence).toBeGreaterThan(0.8);
    });

    test('should return null for unmatched claims', () => {
      const claim = { type: 'currency', value: 5000000, text: '$5M' };
      const sources = {
        query_001: [{ Amount: 1200000 }]
      };

      const quote = checker.findSupportingQuote(claim, sources);

      expect(quote).toBeNull();
    });
  });
});

// ============================================================================
// PHASE 3 - BEST-OF-N VERIFIER TESTS
// ============================================================================

describe('Best-of-N Verifier (Phase 3)', () => {
  const { BestOfNVerifier } = require('../best-of-n-verifier.js');
  let verifier;

  beforeEach(() => {
    verifier = new BestOfNVerifier({ consistencyThreshold: 0.8 });
  });

  describe('analyzeConsistency', () => {
    test('should identify consistent claims across runs', () => {
      const claimsPerRun = [
        { run: 1, claims: [{ type: 'percentage', value: '34%', text: 'win rate 34%' }] },
        { run: 2, claims: [{ type: 'percentage', value: '34%', text: 'win rate 34%' }] },
        { run: 3, claims: [{ type: 'percentage', value: '34%', text: 'win rate 34%' }] }
      ];

      const result = verifier.analyzeConsistency(claimsPerRun, {});

      expect(result.overallConsistency).toBe(1);
      expect(result.consistentClaims.length).toBe(1);
    });

    test('should identify inconsistent claims', () => {
      const claimsPerRun = [
        { run: 1, claims: [{ type: 'percentage', value: '34%', text: 'win rate 34%' }] },
        { run: 2, claims: [{ type: 'percentage', value: '28%', text: 'win rate 28%' }] },
        { run: 3, claims: [{ type: 'percentage', value: '41%', text: 'win rate 41%' }] }
      ];

      const result = verifier.analyzeConsistency(claimsPerRun, {});

      expect(result.inconsistentClaims.length).toBeGreaterThan(0);
    });

    test('should identify claims unique to single run', () => {
      const claimsPerRun = [
        { run: 1, claims: [
          { type: 'percentage', value: '34%', text: 'win rate 34%' },
          { type: 'currency', value: '$5M', text: 'pipeline $5M' }
        ] },
        { run: 2, claims: [{ type: 'percentage', value: '34%', text: 'win rate 34%' }] },
        { run: 3, claims: [{ type: 'percentage', value: '34%', text: 'win rate 34%' }] }
      ];

      const result = verifier.analyzeConsistency(claimsPerRun, {});

      expect(result.uniqueClaims.length).toBe(1);
      expect(result.uniqueClaims[0].appeared_in_run).toBe(1);
    });
  });

  describe('checkClaimConsistency', () => {
    test('should report consistent claim across responses', () => {
      const responses = [
        'Win rate is 34% this quarter',
        'The win rate stands at 34%',
        'We see a 34% win rate'
      ];

      const result = verifier.checkClaimConsistency('34%', responses);

      expect(result.verdict).toBe('consistent');
      expect(result.found_in).toBe(3);
    });
  });
});

// ============================================================================
// PHASE 3 - ITERATIVE REFINER TESTS
// ============================================================================

describe('Iterative Refiner (Phase 3)', () => {
  const { IterativeRefiner } = require('../iterative-refiner.js');
  let refiner;

  beforeEach(() => {
    refiner = new IterativeRefiner({ maxIterations: 3 });
  });

  describe('verifyClaims', () => {
    test('should verify claims found in sources', () => {
      const claims = [
        { type: 'currency', value: 1200000, text: '$1.2M pipeline' }
      ];

      const sources = {
        query_001: [{ TotalPipeline: 1200000 }]
      };

      const results = refiner.verifyClaims(claims, sources);

      expect(results[0].verified).toBe(true);
      expect(results[0].source_id).toBe('query_001');
    });

    test('should not verify claims missing from sources', () => {
      const claims = [
        { type: 'currency', value: 5000000, text: '$5M pipeline' }
      ];

      const sources = {
        query_001: [{ TotalPipeline: 1200000 }]
      };

      const results = refiner.verifyClaims(claims, sources);

      expect(results[0].verified).toBe(false);
    });
  });

  describe('createRefinementPlan', () => {
    test('should keep high-confidence verified claims', () => {
      const verificationResults = [
        { claim: 'Pipeline is $1.2M', verified: true, confidence: 0.95 }
      ];

      const plan = refiner.createRefinementPlan(verificationResults);

      expect(plan.keep.length).toBe(1);
      expect(plan.remove.length).toBe(0);
    });

    test('should remove unverified claims', () => {
      const verificationResults = [
        { claim: 'Pipeline is $5M', verified: false, confidence: 0 }
      ];

      const plan = refiner.createRefinementPlan(verificationResults);

      expect(plan.remove.length).toBe(1);
      expect(plan.keep.length).toBe(0);
    });
  });

  describe('generateVerificationPrompt', () => {
    test('should generate structured verification prompt', () => {
      const response = 'Win rate is 34% with $1.2M pipeline';
      const sources = { query_001: [{ WinRate: 34 }] };

      const prompt = refiner.generateVerificationPrompt(response, sources);

      expect(prompt).toContain('Claim Verification Task');
      expect(prompt).toContain('VERIFIED or UNVERIFIED');
      expect(prompt).toContain('34');
    });
  });
});
