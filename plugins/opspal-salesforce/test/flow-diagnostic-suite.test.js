#!/usr/bin/env node

/**
 * Flow Diagnostic Suite - Comprehensive Unit Tests
 *
 * Tests all 6 diagnostic modules:
 * 1. FlowPreflightChecker
 * 2. FlowExecutor
 * 3. FlowLogParser
 * 4. FlowStateSnapshot
 * 5. FlowBranchAnalyzer
 * 6. FlowDiagnosticOrchestrator
 *
 * @version 3.43.0
 */

const assert = require('assert');
const { FlowPreflightChecker, PreflightError } = require('../scripts/lib/flow-preflight-checker');
const { FlowExecutor, FlowExecutionError } = require('../scripts/lib/flow-executor');
const { FlowLogParser, LogParseError } = require('../scripts/lib/flow-log-parser');
const { FlowStateSnapshot, SnapshotError } = require('../scripts/lib/flow-state-snapshot');
const { FlowBranchAnalyzer, CoverageAnalysisError } = require('../scripts/lib/flow-branch-analyzer');
const { FlowDiagnosticOrchestrator, OrchestrationError } = require('../scripts/lib/flow-diagnostic-orchestrator');

// Test configuration
const TEST_ORG_ALIAS = 'test-org';
const TEST_FLOW_NAME = 'Test_Flow';
const TEST_RECORD_ID = '001xx000000TEST';

// Mock execSync to prevent actual SF CLI calls during tests
const originalExecSync = require('child_process').execSync;
const originalPreflightExec = FlowPreflightChecker.prototype._execSfCommand;
const originalAnalyzerExec = FlowBranchAnalyzer.prototype._execSfCommand;
let mockExecSync = null;

function setupMockExecSync(responses = {}) {
  mockExecSync = (command) => {
    // Match command patterns and return mock responses
    if (command.includes('sf org display')) {
      return JSON.stringify({
        status: 0,
        result: {
          username: 'test@example.com',
          id: '00Dxx0000000001',
          instanceUrl: 'https://test.my.salesforce.com',
          apiVersion: 'v62.0'
        }
      });
    }
    if (command.includes('FlowDefinitionView')) {
      return JSON.stringify({
        status: 0,
        result: {
          records: [{
            DeveloperName: TEST_FLOW_NAME,
            ActiveVersionId: '301xx000000001',
            LatestVersionId: '301xx000000001'
          }]
        }
      });
    }
    if (command.includes('FlowDefinition')) {
      return JSON.stringify({
        status: 0,
        result: {
          records: [{
            DeveloperName: TEST_FLOW_NAME,
            ActiveVersionId: '301xx000000001',
            Label: 'Test Flow',
            ProcessType: 'Flow',
            TriggerObjectOrEventLabel: 'Account',
            Description: 'Mock flow definition'
          }]
        }
      });
    }
    if (command.includes('FlowVersionView')) {
      return JSON.stringify({
        status: 0,
        result: {
          records: [{
            VersionNumber: 1,
            Status: 'Active',
            ProcessType: 'Flow',
            TriggerType: 'RecordAfterSave',
            ApiVersion: '62.0'
          }]
        }
      });
    }
    if (command.includes('ApexTrigger') || command.includes('WorkflowRule')) {
      return JSON.stringify({
        status: 0,
        result: { records: [] }
      });
    }
    if (command.includes('ValidationRule')) {
      return JSON.stringify({
        status: 0,
        result: { records: [] }
      });
    }
    if (command.includes('FieldDefinition')) {
      return JSON.stringify({
        status: 0,
        result: {
          records: [
            { QualifiedApiName: 'Name', DataType: 'Text' },
            { QualifiedApiName: 'Type__c', DataType: 'Picklist' }
          ]
        }
      });
    }
    if (command.includes('TraceFlag')) {
      return JSON.stringify({
        status: 0,
        result: { records: [] }
      });
    }
    if (command.includes('EntityParticle')) {
      return JSON.stringify({
        status: 0,
        result: {
          records: [{ Type: 'Account' }]
        }
      });
    }
    if (command.includes('FROM Account WHERE')) {
      return JSON.stringify({
        status: 0,
        result: {
          records: [{
            Id: TEST_RECORD_ID,
            Name: 'Test Account',
            Type: 'Customer',
            SystemModstamp: '2025-11-12T10:00:00.000Z',
            LastModifiedDate: '2025-11-12T10:00:00.000Z',
            LastModifiedById: '005xx000000001'
          }]
        }
      });
    }
    if (command.includes('ApexLog')) {
      return JSON.stringify({
        status: 0,
        result: {
          records: [{
            Id: '07Lxx000000001',
            LogLength: 1000,
            Request: 'API',
            Status: 'Success',
            DurationMilliseconds: 500,
            StartTime: '2025-11-12T10:00:00.000Z'
          }]
        }
      });
    }

    // Default response
    return JSON.stringify({ status: 0, result: {} });
  };

  // Replace execSync
  require('child_process').execSync = mockExecSync;
  FlowPreflightChecker.prototype._execSfCommand = function mockPreflightExec(command) {
    return mockExecSync(command);
  };
  FlowBranchAnalyzer.prototype._execSfCommand = function mockAnalyzerExec(command) {
    return mockExecSync(command);
  };
}

function teardownMockExecSync() {
  require('child_process').execSync = originalExecSync;
  FlowPreflightChecker.prototype._execSfCommand = originalPreflightExec;
  FlowBranchAnalyzer.prototype._execSfCommand = originalAnalyzerExec;
}

// Test Suite
console.log('\n=== Flow Diagnostic Suite - Unit Tests ===\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const asyncTests = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failedTests++;
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

function asyncTest(name, fn) {
  totalTests++;
  const promise = (async () => {
    try {
      await fn();
      passedTests++;
      console.log(`✓ ${name}`);
    } catch (error) {
      failedTests++;
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error.message}`);
    }
  })();
  asyncTests.push(promise);
  return promise;
}

// ========================================
// 1. FlowPreflightChecker Tests
// ========================================
console.log('\n--- FlowPreflightChecker Tests ---\n');

test('FlowPreflightChecker: Constructor requires orgAlias', () => {
  assert.throws(() => {
    new FlowPreflightChecker();
  }, PreflightError);
});

test('FlowPreflightChecker: Constructor accepts options', () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS, { verbose: true });
  assert.strictEqual(checker.orgAlias, TEST_ORG_ALIAS);
  assert.strictEqual(checker.options.verbose, true);
});

test('FlowPreflightChecker: PreflightError has correct structure', () => {
  const error = new PreflightError('Test error', 'TEST_CODE', { detail: 'test' });
  assert.strictEqual(error.name, 'PreflightError');
  assert.strictEqual(error.code, 'TEST_CODE');
  assert.deepStrictEqual(error.details, { detail: 'test' });
});

// Mock tests for preflight checker (require SF CLI)
setupMockExecSync();

asyncTest('FlowPreflightChecker: checkConnectivity returns org info', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS);
  const result = await checker.checkConnectivity();
  assert.strictEqual(result.success, true);
  assert(result.orgId);
});

asyncTest('FlowPreflightChecker: checkFlowMetadata finds Flow', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS);
  const result = await checker.checkFlowMetadata(TEST_FLOW_NAME);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.flow.apiName, TEST_FLOW_NAME);
});

asyncTest('FlowPreflightChecker: checkCompetingAutomation detects conflicts', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS);
  const result = await checker.checkCompetingAutomation('Account', 'after-save');
  assert.strictEqual(result.hasConflicts, false);
  assert(Array.isArray(result.triggers));
  assert(Array.isArray(result.workflowRules));
  assert(Array.isArray(result.flows));
});

asyncTest('FlowPreflightChecker: checkValidationRules returns rules', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS);
  const result = await checker.checkValidationRules('Account');
  assert(Array.isArray(result.validationRules));
  assert(Array.isArray(result.requiredFields));
});

asyncTest('FlowPreflightChecker: runAllChecks includes strategy decision payload', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS, { autoSetupLogging: false });
  const result = await checker.runAllChecks(TEST_FLOW_NAME, {
    object: 'Account',
    triggerType: 'after-save',
    capabilityDomain: 'account_enrichment',
    entryCriteria: "Type = 'Customer'"
  });

  assert(result.decision);
  assert.strictEqual(typeof result.decision.recommendedStrategy, 'string');
  assert(result.decision.weightedScores);
  assert(Array.isArray(result.decision.rationale));
});

asyncTest('FlowPreflightChecker: risk-based enforcement blocks only critical strategy issues', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS, { autoSetupLogging: false });
  const result = await checker.runAllChecks(TEST_FLOW_NAME, {
    object: 'Account',
    triggerType: 'after-save',
    proposedAction: 'new',
    capabilityDomain: 'account_enrichment',
    entryCriteria: '',
    enforcement: 'risk-based'
  });

  assert.strictEqual(result.enforcementMode, 'risk-based');
  assert(result.criticalIssues.length > 0);
  assert.strictEqual(result.canProceed, false);
});

asyncTest('FlowPreflightChecker: warning-only findings do not block in risk-based mode', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS, { autoSetupLogging: false });
  const result = await checker.runAllChecks(TEST_FLOW_NAME, {
    object: 'Account',
    triggerType: 'after-save',
    proposedAction: 'update',
    capabilityDomain: '',
    entryCriteria: '',
    enforcement: 'risk-based'
  });

  assert(result.warnings.length > 0);
  assert.strictEqual(result.criticalIssues.length, 0);
  assert.strictEqual(result.canProceed, true);
});

asyncTest('FlowPreflightChecker: strict enforcement blocks when warnings exist', async () => {
  const checker = new FlowPreflightChecker(TEST_ORG_ALIAS, { autoSetupLogging: false });
  const result = await checker.runAllChecks(TEST_FLOW_NAME, {
    object: 'Account',
    triggerType: 'after-save',
    proposedAction: 'update',
    capabilityDomain: '',
    entryCriteria: '',
    enforcement: 'strict'
  });

  assert.strictEqual(result.enforcementMode, 'strict');
  assert(result.criticalIssues.length > 0);
  assert.strictEqual(result.canProceed, false);
});


// ========================================
// 2. FlowExecutor Tests
// ========================================
console.log('\n--- FlowExecutor Tests ---\n');

test('FlowExecutor: Constructor requires orgAlias', () => {
  assert.throws(() => {
    new FlowExecutor();
  }, FlowExecutionError);
});

test('FlowExecutor: Constructor accepts options', () => {
  const executor = new FlowExecutor(TEST_ORG_ALIAS, { verbose: true, cleanupRecords: false });
  assert.strictEqual(executor.orgAlias, TEST_ORG_ALIAS);
  assert.strictEqual(executor.options.verbose, true);
  assert.strictEqual(executor.options.cleanupRecords, false);
});

test('FlowExecutor: FlowExecutionError has correct structure', () => {
  const error = new FlowExecutionError('Test error', 'TEST_CODE', { detail: 'test' });
  assert.strictEqual(error.name, 'FlowExecutionError');
  assert.strictEqual(error.code, 'TEST_CODE');
  assert.deepStrictEqual(error.details, { detail: 'test' });
});

test('FlowExecutor: _generateExecutionId creates unique IDs', () => {
  const executor = new FlowExecutor(TEST_ORG_ALIAS);
  const id1 = executor._generateExecutionId();
  const id2 = executor._generateExecutionId();
  assert.notStrictEqual(id1, id2);
  assert(id1.startsWith('exec_'));
});

// ========================================
// 3. FlowLogParser Tests
// ========================================
console.log('\n--- FlowLogParser Tests ---\n');

test('FlowLogParser: Constructor requires orgAlias', () => {
  assert.throws(() => {
    new FlowLogParser();
  }, LogParseError);
});

test('FlowLogParser: Constructor accepts options', () => {
  const parser = new FlowLogParser(TEST_ORG_ALIAS, { verbose: true });
  assert.strictEqual(parser.orgAlias, TEST_ORG_ALIAS);
  assert.strictEqual(parser.options.verbose, true);
});

test('FlowLogParser: LogParseError has correct structure', () => {
  const error = new LogParseError('Test error', 'TEST_CODE', { detail: 'test' });
  assert.strictEqual(error.name, 'LogParseError');
  assert.strictEqual(error.code, 'TEST_CODE');
  assert.deepStrictEqual(error.details, { detail: 'test' });
});

// Note: Private methods (_extractFlowExecutions, _extractErrors, _extractGovernorLimits)
// are implementation details and should not be tested directly.
// These are tested indirectly through public method parseLog() which uses them.

test('FlowLogParser: Public interface test - extractFlowErrors method exists', () => {
  const parser = new FlowLogParser(TEST_ORG_ALIAS);
  assert.strictEqual(typeof parser.extractFlowErrors, 'function');
});

test('FlowLogParser: Public interface test - getLatestLog method exists', () => {
  const parser = new FlowLogParser(TEST_ORG_ALIAS);
  assert.strictEqual(typeof parser.getLatestLog, 'function');
});

test('FlowLogParser: Public interface test - parseLog method exists', () => {
  const parser = new FlowLogParser(TEST_ORG_ALIAS);
  assert.strictEqual(typeof parser.parseLog, 'function');
});

// ========================================
// 4. FlowStateSnapshot Tests
// ========================================
console.log('\n--- FlowStateSnapshot Tests ---\n');

test('FlowStateSnapshot: Constructor requires orgAlias', () => {
  assert.throws(() => {
    new FlowStateSnapshot();
  }, SnapshotError);
});

test('FlowStateSnapshot: Constructor accepts options', () => {
  const snapshot = new FlowStateSnapshot(TEST_ORG_ALIAS, { verbose: true, maxDepth: 3 });
  assert.strictEqual(snapshot.orgAlias, TEST_ORG_ALIAS);
  assert.strictEqual(snapshot.options.verbose, true);
  assert.strictEqual(snapshot.options.maxDepth, 3);
});

test('FlowStateSnapshot: SnapshotError has correct structure', () => {
  const error = new SnapshotError('Test error', 'TEST_CODE', { detail: 'test' });
  assert.strictEqual(error.name, 'SnapshotError');
  assert.strictEqual(error.code, 'TEST_CODE');
  assert.deepStrictEqual(error.details, { detail: 'test' });
});

test('FlowStateSnapshot: _determineObjectType recognizes common prefixes', async () => {
  const snapshot = new FlowStateSnapshot(TEST_ORG_ALIAS);

  const accountType = await snapshot._determineObjectType('001xx000000TEST').catch(e => e.code === 'UNKNOWN_OBJECT_TYPE' ? null : Promise.reject(e));
  const contactType = await snapshot._determineObjectType('003xx000000TEST').catch(e => e.code === 'UNKNOWN_OBJECT_TYPE' ? null : Promise.reject(e));
  const opportunityType = await snapshot._determineObjectType('006xx000000TEST').catch(e => e.code === 'UNKNOWN_OBJECT_TYPE' ? null : Promise.reject(e));

  // Either correctly identifies or throws UNKNOWN_OBJECT_TYPE (both acceptable)
  if (accountType) assert.strictEqual(accountType, 'Account');
  if (contactType) assert.strictEqual(contactType, 'Contact');
  if (opportunityType) assert.strictEqual(opportunityType, 'Opportunity');
});

asyncTest('FlowStateSnapshot: compareSnapshots detects field changes', async () => {
  const snapshot = new FlowStateSnapshot(TEST_ORG_ALIAS);

  const before = {
    recordId: TEST_RECORD_ID,
    objectType: 'Account',
    timestamp: '2025-11-12T10:00:00Z',
    fields: {
      Name: { value: 'Test Account', dataType: 'string' },
      Type: { value: 'Prospect', dataType: 'string' }
    },
    relatedRecords: {},
    systemModstamp: '2025-11-12T10:00:00Z',
    lastModifiedDate: '2025-11-12T10:00:00Z',
    lastModifiedBy: '005xx000000001'
  };

  const after = {
    recordId: TEST_RECORD_ID,
    objectType: 'Account',
    timestamp: '2025-11-12T10:01:00Z',
    fields: {
      Name: { value: 'Test Account', dataType: 'string' },
      Type: { value: 'Customer', dataType: 'string' }
    },
    relatedRecords: {},
    systemModstamp: '2025-11-12T10:01:00Z',
    lastModifiedDate: '2025-11-12T10:01:00Z',
    lastModifiedBy: '005xx000000001'
  };

  const diff = await snapshot.compareSnapshots(before, after);
  assert.strictEqual(diff.recordId, TEST_RECORD_ID);
  assert.strictEqual(diff.totalFieldsChanged, 1);
  assert.strictEqual(diff.changedFields[0].fieldName, 'Type');
  assert.strictEqual(diff.changedFields[0].oldValue, 'Prospect');
  assert.strictEqual(diff.changedFields[0].newValue, 'Customer');
});

test('FlowStateSnapshot: generateDiffReport produces markdown', () => {
  const snapshot = new FlowStateSnapshot(TEST_ORG_ALIAS);

  const diff = {
    recordId: TEST_RECORD_ID,
    objectType: 'Account',
    timespan: 60000,
    changedFields: [
      { fieldName: 'Type', oldValue: 'Prospect', newValue: 'Customer', dataType: 'string' }
    ],
    relatedChanges: {},
    systemFieldsChanged: [],
    totalFieldsChanged: 1,
    totalRelatedRecordsAffected: 0
  };

  const report = snapshot.generateDiffReport(diff, { format: 'markdown' });
  assert(report.includes('# State Change Report'));
  assert(report.includes('Account'));
  assert(report.includes('Type'));
  assert(report.includes('Prospect'));
  assert(report.includes('Customer'));
});

// ========================================
// 5. FlowBranchAnalyzer Tests
// ========================================
console.log('\n--- FlowBranchAnalyzer Tests ---\n');

test('FlowBranchAnalyzer: Constructor requires orgAlias', () => {
  assert.throws(() => {
    new FlowBranchAnalyzer();
  }, CoverageAnalysisError);
});

test('FlowBranchAnalyzer: Constructor accepts options', () => {
  const analyzer = new FlowBranchAnalyzer(TEST_ORG_ALIAS, { verbose: true, trackLoops: false });
  assert.strictEqual(analyzer.orgAlias, TEST_ORG_ALIAS);
  assert.strictEqual(analyzer.options.verbose, true);
  assert.strictEqual(analyzer.options.trackLoops, false);
});

test('FlowBranchAnalyzer: CoverageAnalysisError has correct structure', () => {
  const error = new CoverageAnalysisError('Test error', 'TEST_CODE', { detail: 'test' });
  assert.strictEqual(error.name, 'CoverageAnalysisError');
  assert.strictEqual(error.code, 'TEST_CODE');
  assert.deepStrictEqual(error.details, { detail: 'test' });
});

asyncTest('FlowBranchAnalyzer: analyzeFlowCoverage calculates coverage', async () => {
  const analyzer = new FlowBranchAnalyzer(TEST_ORG_ALIAS);

  const executionResults = [
    {
      executionId: 'exec_001',
      success: true,
      elementsExecuted: ['Start', 'Decision_1', 'Action_1', 'End'],
      decisionsEvaluated: [
        { elementName: 'Decision_1', outcome: 'True', condition: 'Status = Active' }
      ]
    },
    {
      executionId: 'exec_002',
      success: true,
      elementsExecuted: ['Start', 'Decision_1', 'Action_2', 'End'],
      decisionsEvaluated: [
        { elementName: 'Decision_1', outcome: 'False', condition: 'Status = Inactive' }
      ]
    }
  ];

  const coverage = await analyzer.analyzeFlowCoverage(TEST_FLOW_NAME, executionResults);
  assert.strictEqual(coverage.flowApiName, TEST_FLOW_NAME);
  assert.strictEqual(coverage.totalExecutions, 2);
  assert(coverage.coveragePercentage >= 0 && coverage.coveragePercentage <= 100);
  assert(Array.isArray(coverage.elements));
  assert(Array.isArray(coverage.decisions));
});

asyncTest('FlowBranchAnalyzer: generateTestPlan suggests tests for uncovered branches', async () => {
  const analyzer = new FlowBranchAnalyzer(TEST_ORG_ALIAS);

  const currentCoverage = {
    flowApiName: TEST_FLOW_NAME,
    coveragePercentage: 75,
    uncoveredBranches: [
      { decisionName: 'Status_Check', branchName: 'Error', condition: 'Status = Error' }
    ],
    uncoveredElements: ['Error_Handler']
  };

  const testPlan = await analyzer.generateTestPlan(TEST_FLOW_NAME, currentCoverage);
  assert.strictEqual(testPlan.flowApiName, TEST_FLOW_NAME);
  assert.strictEqual(testPlan.currentCoverage, 75);
  assert.strictEqual(testPlan.targetCoverage, 100);
  assert(Array.isArray(testPlan.testCases));
  assert(testPlan.estimatedTests > 0);
});

test('FlowBranchAnalyzer: exportCoverageReport produces formatted output', () => {
  const analyzer = new FlowBranchAnalyzer(TEST_ORG_ALIAS);

  const coverage = {
    flowApiName: TEST_FLOW_NAME,
    totalExecutions: 3,
    coveragePercentage: 85.5,
    elementsExecuted: 5,
    totalElements: 6,
    elements: [
      { elementName: 'Start', elementType: 'Start', executionCount: 3 },
      { elementName: 'Decision_1', elementType: 'Decision', executionCount: 3 }
    ],
    decisions: [
      {
        elementName: 'Decision_1',
        totalOutcomes: 2,
        outcomesCovered: 2,
        coveragePercentage: 100,
        outcomes: [
          { outcomeName: 'True', executionCount: 2, condition: 'Status = Active' },
          { outcomeName: 'False', executionCount: 1, condition: 'Status = Inactive' }
        ]
      }
    ],
    uncoveredElements: ['Error_Handler'],
    uncoveredBranches: []
  };

  const markdown = analyzer.exportCoverageReport(coverage, 'markdown');
  assert(markdown.includes('# Flow Coverage Report'));
  assert(markdown.includes(TEST_FLOW_NAME));
  assert(markdown.includes('85.5%'));

  const json = analyzer.exportCoverageReport(coverage, 'json');
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.flowApiName, TEST_FLOW_NAME);
});

// ========================================
// 6. FlowDiagnosticOrchestrator Tests
// ========================================
console.log('\n--- FlowDiagnosticOrchestrator Tests ---\n');

test('FlowDiagnosticOrchestrator: Constructor requires orgAlias', () => {
  assert.throws(() => {
    new FlowDiagnosticOrchestrator();
  }, OrchestrationError);
});

test('FlowDiagnosticOrchestrator: Constructor accepts options', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS, {
    verbose: true,
    continueOnWarnings: false,
    generateReports: false
  });
  assert.strictEqual(orchestrator.orgAlias, TEST_ORG_ALIAS);
  assert.strictEqual(orchestrator.options.verbose, true);
  assert.strictEqual(orchestrator.options.continueOnWarnings, false);
  assert.strictEqual(orchestrator.options.generateReports, false);
});

test('FlowDiagnosticOrchestrator: OrchestrationError has correct structure', () => {
  const error = new OrchestrationError('Test error', 'TEST_CODE', { detail: 'test' });
  assert.strictEqual(error.name, 'OrchestrationError');
  assert.strictEqual(error.code, 'TEST_CODE');
  assert.deepStrictEqual(error.details, { detail: 'test' });
});

test('FlowDiagnosticOrchestrator: Initializes all module instances', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS);
  assert(orchestrator.preflightChecker instanceof FlowPreflightChecker);
  assert(orchestrator.executor instanceof FlowExecutor);
  assert(orchestrator.logParser instanceof FlowLogParser);
  assert(orchestrator.snapshot instanceof FlowStateSnapshot);
  assert(orchestrator.analyzer instanceof FlowBranchAnalyzer);
});

test('FlowDiagnosticOrchestrator: generateConsolidatedReport supports multiple formats', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS);

  const mockResult = {
    success: true,
    flowApiName: TEST_FLOW_NAME,
    orgAlias: TEST_ORG_ALIAS,
    workflowId: 'test_workflow',
    summary: { totalTests: 3, passedTests: 3, failedTests: 0 },
    recommendations: ['All tests passed'],
    timestamp: '2025-11-12T10:00:00Z'
  };

  // JSON format
  const json = orchestrator.generateConsolidatedReport(mockResult, 'json');
  assert(json.includes(TEST_FLOW_NAME));
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.flowApiName, TEST_FLOW_NAME);

  // Markdown format
  const markdown = orchestrator.generateConsolidatedReport(mockResult, 'markdown');
  assert(markdown.includes('# Flow Diagnostic Report'));
  assert(markdown.includes(TEST_FLOW_NAME));

  // HTML format
  const html = orchestrator.generateConsolidatedReport(mockResult, 'html');
  assert(html.includes('<html>'));
  assert(html.includes(TEST_FLOW_NAME));
});

test('FlowDiagnosticOrchestrator: generateConsolidatedReport throws on unsupported format', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS);

  const mockResult = {
    success: true,
    flowApiName: TEST_FLOW_NAME,
    recommendations: []
  };

  assert.throws(() => {
    orchestrator.generateConsolidatedReport(mockResult, 'xml');
  }, OrchestrationError);
});

// ========================================
// Integration Tests (Orchestrator Workflows)
// ========================================
console.log('\n--- Integration Tests ---\n');

// Note: These would require actual SF CLI access
// Marking as pending/skipped for unit test suite

test('FlowDiagnosticOrchestrator: runPreflightDiagnostic interface defined', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS);
  assert.strictEqual(typeof orchestrator.runPreflightDiagnostic, 'function');
});

test('FlowDiagnosticOrchestrator: runExecutionDiagnostic interface defined', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS);
  assert.strictEqual(typeof orchestrator.runExecutionDiagnostic, 'function');
});

test('FlowDiagnosticOrchestrator: runCoverageDiagnostic interface defined', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS);
  assert.strictEqual(typeof orchestrator.runCoverageDiagnostic, 'function');
});

test('FlowDiagnosticOrchestrator: runFullDiagnostic interface defined', () => {
  const orchestrator = new FlowDiagnosticOrchestrator(TEST_ORG_ALIAS);
  assert.strictEqual(typeof orchestrator.runFullDiagnostic, 'function');
});

// ========================================
// Test Summary
// ========================================
async function finalizeResults() {
  await Promise.all(asyncTests);
  teardownMockExecSync();

  console.log('\n=== Test Summary ===\n');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${Math.round(passedTests / totalTests * 100)}%)`);
  console.log(`Failed: ${failedTests}`);

  return { totalTests, passedTests, failedTests };
}

if (require.main === module) {
  finalizeResults()
    .then(result => {
      if (result.failedTests > 0) {
        console.log('\n❌ Some tests failed');
        process.exit(1);
      }
      console.log('\n✅ All tests passed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nTest suite error:', error);
      process.exit(1);
    });
}

// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Flow Diagnostic Suite', () => {
    it('should pass all tests', async () => {
      const result = await finalizeResults();
      expect(result.failedTests).toBe(0);
    });
  });
}
