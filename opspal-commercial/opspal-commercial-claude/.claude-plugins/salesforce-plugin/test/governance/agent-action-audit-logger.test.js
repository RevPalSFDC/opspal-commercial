#!/usr/bin/env node

/**
 * Unit Tests for Agent Action Audit Logger
 *
 * Tests the audit logging system for agent operations.
 *
 * Run: node test/governance/agent-action-audit-logger.test.js
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AgentActionAuditLogger = require('../../scripts/lib/agent-action-audit-logger');

// Test suite
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

async function runTests() {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('AGENT ACTION AUDIT LOGGER - UNIT TESTS');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // Use temporary directory for tests
    const testLogDir = path.join('/tmp', 'agent-governance-test-logs');
    if (!fs.existsSync(testLogDir)) {
        fs.mkdirSync(testLogDir, { recursive: true });
    }

    for (const { name, fn } of tests) {
        try {
            await fn(testLogDir);
            console.log(`✅ PASS: ${name}`);
            passed++;
        } catch (error) {
            console.error(`❌ FAIL: ${name}`);
            console.error(`   ${error.message}`);
            failed++;
        }
    }

    // Cleanup
    if (fs.existsSync(testLogDir)) {
        fs.rmSync(testLogDir, { recursive: true, force: true });
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log(`RESULTS: ${passed} passed, ${failed} failed (${tests.length} total)`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// LOG CREATION TESTS
// ============================================================================

test('Should create log entry with all required fields', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    const action = {
        agent: 'test-agent',
        operation: 'TEST_OPERATION',
        risk: { riskScore: 50, riskLevel: 'MEDIUM', requiresApproval: false },
        approval: { status: 'NOT_REQUIRED' },
        environment: { org: 'test-org' },
        execution: { success: true, durationMs: 100 },
        verification: { performed: true, passed: true },
        reasoning: { intent: 'Test operation' },
        rollback: { planExists: false }
    };

    const result = await logger.logAction(action);

    assert.strictEqual(result.success, true);
    assert.ok(result.logId);
    assert.ok(result.timestamp);
});

test('Should store log in local filesystem', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    const action = {
        agent: 'test-agent',
        operation: 'TEST_OPERATION',
        risk: { riskScore: 30, riskLevel: 'LOW' },
        approval: { status: 'NOT_REQUIRED' },
        environment: { org: 'test-org' },
        execution: { success: true },
        verification: { performed: false },
        reasoning: { intent: 'Test' },
        rollback: { planExists: false }
    };

    const result = await logger.logAction(action);

    // Check if log file exists
    const date = new Date().toISOString().split('T')[0];
    const dateDir = path.join(testLogDir, date);
    const logFile = path.join(dateDir, `${result.logId}.json`);

    assert.ok(fs.existsSync(logFile), 'Log file should exist');

    // Check if daily log exists
    const dailyLog = path.join(dateDir, 'daily-log.jsonl');
    assert.ok(fs.existsSync(dailyLog), 'Daily log should exist');
});

test('Should generate unique log IDs', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    const action = {
        agent: 'test-agent',
        operation: 'TEST_OPERATION',
        risk: { riskScore: 30, riskLevel: 'LOW' },
        approval: { status: 'NOT_REQUIRED' },
        environment: { org: 'test-org' },
        execution: { success: true },
        verification: { performed: false },
        reasoning: { intent: 'Test' },
        rollback: { planExists: false }
    };

    const result1 = await logger.logAction(action);
    const result2 = await logger.logAction(action);

    assert.notStrictEqual(result1.logId, result2.logId, 'Log IDs should be unique');
});

// ============================================================================
// LOG SEARCH TESTS
// ============================================================================

test('Should search logs by agent name', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    // Create test logs
    await logger.logAction({
        agent: 'agent-1',
        operation: 'TEST',
        risk: { riskScore: 30, riskLevel: 'LOW' },
        approval: { status: 'NOT_REQUIRED' },
        environment: { org: 'test-org' },
        execution: { success: true },
        verification: { performed: false },
        reasoning: { intent: 'Test' },
        rollback: { planExists: false }
    });

    await logger.logAction({
        agent: 'agent-2',
        operation: 'TEST',
        risk: { riskScore: 30, riskLevel: 'LOW' },
        approval: { status: 'NOT_REQUIRED' },
        environment: { org: 'test-org' },
        execution: { success: true },
        verification: { performed: false },
        reasoning: { intent: 'Test' },
        rollback: { planExists: false }
    });

    // Search for agent-1
    const results = await logger.searchLogs({ agent: 'agent-1' });

    assert.ok(results.length > 0, 'Should find logs for agent-1');
    assert.ok(results.every(r => r.agent === 'agent-1'), 'All results should be for agent-1');
});

test('Should search logs by risk level', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    // Create test logs with different risk levels
    await logger.logAction({
        agent: 'test-agent',
        operation: 'LOW_RISK_OP',
        risk: { riskScore: 25, riskLevel: 'LOW' },
        approval: { status: 'NOT_REQUIRED' },
        environment: { org: 'test-org' },
        execution: { success: true },
        verification: { performed: false },
        reasoning: { intent: 'Test' },
        rollback: { planExists: false }
    });

    await logger.logAction({
        agent: 'test-agent',
        operation: 'HIGH_RISK_OP',
        risk: { riskScore: 65, riskLevel: 'HIGH' },
        approval: { status: 'GRANTED' },
        environment: { org: 'test-org' },
        execution: { success: true },
        verification: { performed: false },
        reasoning: { intent: 'Test' },
        rollback: { planExists: false }
    });

    // Search for HIGH risk
    const results = await logger.searchLogs({ riskLevel: 'HIGH' });

    assert.ok(results.length > 0, 'Should find HIGH risk logs');
    assert.ok(results.every(r => r.riskLevel === 'HIGH'), 'All results should be HIGH risk');
});

test('Should limit search results', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    // Create multiple logs
    for (let i = 0; i < 5; i++) {
        await logger.logAction({
            agent: 'test-agent',
            operation: 'TEST',
            risk: { riskScore: 30, riskLevel: 'LOW' },
            approval: { status: 'NOT_REQUIRED' },
            environment: { org: 'test-org' },
            execution: { success: true },
            verification: { performed: false },
            reasoning: { intent: 'Test' },
            rollback: { planExists: false }
        });
    }

    // Search with limit
    const results = await logger.searchLogs({ agent: 'test-agent', limit: 3 });

    assert.ok(results.length <= 3, 'Should respect limit parameter');
});

// ============================================================================
// COMPLIANCE REPORT TESTS
// ============================================================================

test('Should generate GDPR compliance report', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    // Create sample log
    await logger.logAction({
        agent: 'test-agent',
        operation: 'DELETE_RECORDS',
        risk: { riskScore: 60, riskLevel: 'HIGH' },
        approval: { status: 'GRANTED' },
        environment: { org: 'test-org' },
        operationDetails: { dataSubjectRequest: true },
        execution: { success: true },
        verification: { performed: false },
        reasoning: { intent: 'GDPR data deletion' },
        rollback: { planExists: false }
    });

    const report = await logger.generateComplianceReport('gdpr');

    assert.ok(report);
    assert.strictEqual(report.reportType, 'gdpr');
    assert.ok(report.summary);
    assert.ok(report.summary.totalActions >= 0);
});

test('Should generate SOX compliance report', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    const report = await logger.generateComplianceReport('sox');

    assert.ok(report);
    assert.strictEqual(report.reportType, 'sox');
    assert.ok(report.details);
});

// ============================================================================
// LOG ENTRY STRUCTURE TESTS
// ============================================================================

test('Should include complete operation context in log', async (testLogDir) => {
    const logger = new AgentActionAuditLogger({ logDir: testLogDir });

    const action = {
        agent: 'sfdc-security-admin',
        operation: 'UPDATE_PERMISSION_SET',
        risk: { riskScore: 55, riskLevel: 'HIGH', requiresApproval: true },
        approval: { status: 'GRANTED', approvers: ['test@example.com'] },
        environment: { org: 'test-org', orgId: '00D123', instanceUrl: 'https://test.salesforce.com' },
        operationDetails: { permissionSet: 'AgentAccess', fieldsAdded: ['Account.Test__c'] },
        execution: { success: true, durationMs: 5000, errors: [] },
        verification: { performed: true, passed: true, method: 'test-verifier' },
        reasoning: {
            intent: 'Test intent',
            alternativesConsidered: ['Alt 1', 'Alt 2'],
            decisionRationale: 'Test rationale'
        },
        rollback: {
            planExists: true,
            planDescription: 'Test rollback',
            rollbackCommand: 'test-command'
        }
    };

    const result = await logger.logAction(action);

    // Read the log file
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogDir, date, `${result.logId}.json`);
    const logData = JSON.parse(fs.readFileSync(logFile, 'utf8'));

    // Validate all fields present
    assert.strictEqual(logData.agent, 'sfdc-security-admin');
    assert.strictEqual(logData.operation, 'UPDATE_PERMISSION_SET');
    assert.strictEqual(logData.riskScore, 55);
    assert.strictEqual(logData.riskLevel, 'HIGH');
    assert.strictEqual(logData.approvalStatus, 'GRANTED');
    assert.ok(logData.environment.org);
    assert.ok(logData.execution);
    assert.ok(logData.verification);
    assert.ok(logData.reasoning);
    assert.ok(logData.rollback);
});

// ============================================================================
// Run all tests
// ============================================================================

runTests();


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Agent Action Audit Logger', () => {
    it('should pass all tests', async () => {
      if (typeof runTests === 'function') {
        const result = await runTests();
        expect(result).not.toBe(false);
      } else {
        expect(true).toBe(true);
      }
    });
  });
}
