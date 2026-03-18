/**
 * Golden Test Fixtures - Pre-generated test data for consistent testing
 *
 * Purpose: Provide stable, realistic test data that doesn't change between runs
 * Usage: Used by golden-test-suite.js for regression testing
 *
 * @version 1.0.0
 */

const path = require('path');

// File paths for test resources
const paths = {
  backupDir: path.join(__dirname, '../mock-data/backups'),
  importanceReport: path.join(__dirname, '../mock-data/field-importance.json'),
  testDataDir: path.join(__dirname, '../mock-data'),
  outputDir: path.join(__dirname, '../test-output')
};

// Safe duplicate pairs (high similarity, no conflicts)
const safeMerges = [
  {
    masterId: '0010000000AAAA1AAA',
    duplicateId: '0010000000AAAA2AAA',
    similarity: 0.95,
    metadata: {
      masterName: 'Acme Corporation',
      duplicateName: 'Acme Corp',
      matchedFields: 8,
      conflictingFields: 0
    }
  },
  {
    masterId: '0010000000BBBB1AAA',
    duplicateId: '0010000000BBBB2AAA',
    similarity: 0.92,
    metadata: {
      masterName: 'Globex Corporation',
      duplicateName: 'Globex Corp.',
      matchedFields: 7,
      conflictingFields: 0
    }
  },
  {
    masterId: '0010000000CCCC1AAA',
    duplicateId: '0010000000CCCC2AAA',
    similarity: 0.88,
    metadata: {
      masterName: 'Initech LLC',
      duplicateName: 'Initech',
      matchedFields: 6,
      conflictingFields: 1
    }
  },
  {
    masterId: '0010000000DDDD1AAA',
    duplicateId: '0010000000DDDD2AAA',
    similarity: 0.91,
    metadata: {
      masterName: 'Hooli Inc',
      duplicateName: 'Hooli Incorporated',
      matchedFields: 7,
      conflictingFields: 0
    }
  },
  {
    masterId: '0010000000EEEE1AAA',
    duplicateId: '0010000000EEEE2AAA',
    similarity: 0.94,
    metadata: {
      masterName: 'Pied Piper',
      duplicateName: 'Pied Piper Inc',
      matchedFields: 8,
      conflictingFields: 0
    }
  }
];

// Moderate risk merges (medium similarity, some conflicts)
const moderateRisk = [
  {
    masterId: '0010000000FFFF1AAA',
    duplicateId: '0010000000FFFF2AAA',
    similarity: 0.72,
    metadata: {
      masterName: 'Wayne Enterprises',
      duplicateName: 'Wayne Corp',
      matchedFields: 5,
      conflictingFields: 2,
      conflicts: ['BillingState mismatch', 'Phone format differs']
    }
  },
  {
    masterId: '0010000000GGGG1AAA',
    duplicateId: '0010000000GGGG2AAA',
    similarity: 0.68,
    metadata: {
      masterName: 'Stark Industries',
      duplicateName: 'Stark International',
      matchedFields: 4,
      conflictingFields: 3,
      conflicts: ['AnnualRevenue differs', 'Industry mismatch', 'Website different']
    }
  },
  {
    masterId: '0010000000HHHH1AAA',
    duplicateId: '0010000000HHHH2AAA',
    similarity: 0.65,
    metadata: {
      masterName: 'Oscorp',
      duplicateName: 'Oscorp Industries',
      matchedFields: 4,
      conflictingFields: 2,
      conflicts: ['NumberOfEmployees differs', 'Description mismatch']
    }
  }
];

// Dangerous merges (should be BLOCKED by safety engine)
const dangerousMerges = [
  {
    masterId: '0010000000IIII1AAA',
    duplicateId: '0010000000IIII2AAA',
    similarity: 0.45,
    metadata: {
      masterName: 'Company A LLC',
      duplicateName: 'Company B Inc',
      masterDomain: 'company-a.com',
      duplicateDomain: 'company-b.com',
      matchedFields: 2,
      conflictingFields: 6,
      conflicts: ['Domain mismatch', 'Address completely different', 'No email overlap']
    }
  },
  {
    masterId: '0010000000JJJJ1AAA',
    duplicateId: '0010000000JJJJ2AAA',
    similarity: 0.38,
    metadata: {
      masterName: 'North Division',
      duplicateName: 'South Division',
      masterAddress: '123 Main St, San Francisco, CA 94102',
      duplicateAddress: '456 Oak Ave, New York, NY 10001',
      matchedFields: 1,
      conflictingFields: 7,
      conflicts: ['Address mismatch', 'State mismatch', 'Time zone different']
    }
  },
  {
    masterId: '0010000000KKKK1AAA',
    duplicateId: '0010000000KKKK2AAA',
    similarity: 0.42,
    metadata: {
      masterName: 'Integration Test Account 1',
      duplicateName: 'Integration Test Account 2',
      masterIntegrationId: 'ERP-12345',
      duplicateIntegrationId: 'ERP-67890',
      matchedFields: 2,
      conflictingFields: 5,
      conflicts: ['Integration ID conflict', 'External system mismatch']
    }
  }
];

// Pre-analyzed decisions (APPROVE)
const approvedDecisions = [
  {
    pair_id: 'pair_approved_1',
    master_id: '0010000000AAAA1AAA',
    duplicate_id: '0010000000AAAA2AAA',
    decision: 'APPROVE',
    confidence: 0.95,
    reason: 'High similarity score, no conflicts detected'
  },
  {
    pair_id: 'pair_approved_2',
    master_id: '0010000000BBBB1AAA',
    duplicate_id: '0010000000BBBB2AAA',
    decision: 'APPROVE',
    confidence: 0.92,
    reason: 'All critical fields match, minor formatting differences only'
  },
  {
    pair_id: 'pair_approved_3',
    master_id: '0010000000CCCC1AAA',
    duplicate_id: '0010000000CCCC2AAA',
    decision: 'APPROVE',
    confidence: 0.88,
    reason: 'Duplicate confirmed, safe to merge'
  }
];

// Pre-analyzed decisions (REVIEW)
const reviewDecisions = [
  {
    pair_id: 'pair_review_1',
    master_id: '0010000000FFFF1AAA',
    duplicate_id: '0010000000FFFF2AAA',
    decision: 'REVIEW',
    confidence: 0.72,
    reason: 'Medium similarity, some field conflicts - manual review recommended'
  },
  {
    pair_id: 'pair_review_2',
    master_id: '0010000000GGGG1AAA',
    duplicate_id: '0010000000GGGG2AAA',
    decision: 'REVIEW',
    confidence: 0.68,
    reason: 'Multiple field conflicts detected, verify before merging'
  }
];

// Pre-analyzed decisions (BLOCK)
const blockedDecisions = [
  {
    pair_id: 'pair_blocked_1',
    master_id: '0010000000IIII1AAA',
    duplicate_id: '0010000000IIII2AAA',
    decision: 'BLOCK',
    confidence: 0.95,
    reason: 'CRITICAL: Domain mismatch detected - different companies'
  },
  {
    pair_id: 'pair_blocked_2',
    master_id: '0010000000JJJJ1AAA',
    duplicate_id: '0010000000JJJJ2AAA',
    decision: 'BLOCK',
    confidence: 0.92,
    reason: 'CRITICAL: Address mismatch - different physical locations'
  },
  {
    pair_id: 'pair_blocked_3',
    master_id: '0010000000KKKK1AAA',
    duplicate_id: '0010000000KKKK2AAA',
    decision: 'BLOCK',
    confidence: 0.90,
    reason: 'CRITICAL: Integration ID conflict - external system collision'
  }
];

// Routing test scenarios
const routingScenarios = [
  {
    description: 'deploy metadata to production',
    context: { env: 'production', operation: 'deploy' },
    expectedAgent: 'release-coordinator',
    expectedMandatory: true,
    expectedComplexity: 0.9
  },
  {
    description: 'merge 100 duplicate accounts',
    context: { count: 100, operation: 'merge' },
    expectedAgent: 'sfdc-merge-orchestrator',
    expectedMandatory: false,
    expectedComplexity: 0.6
  },
  {
    description: 'create a new custom field',
    context: { operation: 'create' },
    expectedAgent: null,  // No specific agent required
    expectedMandatory: false,
    expectedComplexity: 0.2
  },
  {
    description: 'bulk update 5000 records in production',
    context: { count: 5000, env: 'production', operation: 'update' },
    expectedAgent: 'sfdc-data-operations',
    expectedMandatory: true,
    expectedComplexity: 0.85
  },
  {
    description: 'analyze org metadata',
    context: { operation: 'analyze' },
    expectedAgent: 'sfdc-state-discovery',
    expectedMandatory: false,
    expectedComplexity: 0.4
  }
];

// Mock field importance report
const mockFieldImportance = {
  Account: {
    Name: { importance: 1.0, category: 'critical' },
    BillingStreet: { importance: 0.8, category: 'important' },
    BillingCity: { importance: 0.8, category: 'important' },
    BillingState: { importance: 0.8, category: 'important' },
    BillingPostalCode: { importance: 0.7, category: 'important' },
    Phone: { importance: 0.6, category: 'useful' },
    Website: { importance: 0.7, category: 'important' },
    Industry: { importance: 0.5, category: 'useful' },
    AnnualRevenue: { importance: 0.9, category: 'critical' },
    NumberOfEmployees: { importance: 0.4, category: 'useful' }
  },
  Contact: {
    FirstName: { importance: 1.0, category: 'critical' },
    LastName: { importance: 1.0, category: 'critical' },
    Email: { importance: 0.9, category: 'critical' },
    Phone: { importance: 0.7, category: 'important' },
    Title: { importance: 0.5, category: 'useful' }
  },
  Lead: {
    FirstName: { importance: 1.0, category: 'critical' },
    LastName: { importance: 1.0, category: 'critical' },
    Email: { importance: 0.9, category: 'critical' },
    Company: { importance: 0.8, category: 'important' },
    Status: { importance: 0.7, category: 'important' }
  }
};

// Expected test results (for regression testing)
const expectedResults = {
  safeMergesStrictSafety: {
    approved: 5,
    review: 0,
    blocked: 0,
    successRate: 1.0
  },
  moderateRiskBalancedSafety: {
    approved: 0,
    review: 3,
    blocked: 0,
    successRate: 0.0
  },
  dangerousMergesStrictSafety: {
    approved: 0,
    review: 0,
    blocked: 3,
    successRate: 0.0
  },
  parallelVsSerial: {
    minSpeedup: 1.0,  // Parallel should be at least as fast
    maxSpeedup: 6.0   // Parallel with 5 workers theoretically 5x faster
  }
};

// Export all fixtures
module.exports = {
  paths,
  duplicatePairs: {
    safeMerges,
    moderateRisk,
    dangerousMerges,
    all: [...safeMerges, ...moderateRisk, ...dangerousMerges]
  },
  decisions: {
    approved: approvedDecisions,
    review: reviewDecisions,
    blocked: blockedDecisions,
    all: [...approvedDecisions, ...reviewDecisions, ...blockedDecisions]
  },
  routing: {
    scenarios: routingScenarios
  },
  mockData: {
    fieldImportance: mockFieldImportance
  },
  expected: expectedResults
};
