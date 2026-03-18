#!/usr/bin/env node

/**
 * Unit Tests for Human-in-the-Loop Controller
 *
 * Tests the approval workflow system for high-risk operations.
 *
 * Run: node test/governance/human-in-the-loop-controller.test.js
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const HumanInTheLoopController = require('../../scripts/lib/human-in-the-loop-controller');

// Test suite
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

async function runTests() {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('HUMAN-IN-THE-LOOP CONTROLLER - UNIT TESTS');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // Use temporary directory for tests
    const testApprovalDir = path.join('/tmp', 'agent-governance-test-approvals');
    if (!fs.existsSync(testApprovalDir)) {
        fs.mkdirSync(testApprovalDir, { recursive: true });
    }

    for (const { name, fn } of tests) {
        try {
            await fn(testApprovalDir);
            console.log(`✅ PASS: ${name}`);
            passed++;
        } catch (error) {
            console.error(`❌ FAIL: ${name}`);
            console.error(`   ${error.message}`);
            failed++;
        }
    }

    // Cleanup
    if (fs.existsSync(testApprovalDir)) {
        fs.rmSync(testApprovalDir, { recursive: true, force: true });
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log(`RESULTS: ${passed} passed, ${failed} failed (${tests.length} total)`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    // Only exit if running standalone
    if (require.main === module) {
        process.exit(failed > 0 ? 1 : 0);
    }
    return { passed, failed, total: tests.length };
}

// ============================================================================
// APPROVAL REQUEST TESTS
// ============================================================================

test('Should create approval request with unique ID', async (testApprovalDir) => {
    const controller = new HumanInTheLoopController({ approvalDir: testApprovalDir });

    const request = {
        operation: 'UPDATE_PERMISSION_SET',
        agent: 'sfdc-security-admin',
        target: 'production',
        risk: { riskScore: 65, riskLevel: 'HIGH', requiresApproval: true },
        reasoning: 'Test reasoning',
        rollbackPlan: 'Test rollback'
    };

    // Use async approval (non-interactive)
    const result = await controller.requestAsyncApproval({
        ...request,
        requestId: controller.generateRequestId(),
        timestamp: new Date().toISOString(),
        requiredApprovers: ['test-approver'],
        approvalDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        approvals: [],
        rejections: []
    });

    assert.ok(result.requestId);
    assert.strictEqual(result.status, 'PENDING');
});

test('Should validate required fields in approval request', () => {
    const controller = new HumanInTheLoopController({ approvalDir: '/tmp/test' });

    assert.throws(() => {
        controller.validateRequest({});
    }, /operation is required/);

    assert.throws(() => {
        controller.validateRequest({ operation: 'TEST' });
    }, /agent is required/);

    assert.throws(() => {
        controller.validateRequest({
            operation: 'TEST',
            agent: 'test-agent',
            target: 'test'
        });
    }, /risk is required/);
});

test('Should determine correct approvers based on operation type', () => {
    const controller = new HumanInTheLoopController({ approvalDir: '/tmp/test' });

    // Security operation
    const approvers1 = controller.determineApprovers({
        operation: 'UPDATE_PERMISSION_SET',
        risk: { riskLevel: 'HIGH' }
    });
    assert.ok(Array.isArray(approvers1));

    // Metadata deployment
    const approvers2 = controller.determineApprovers({
        operation: 'DEPLOY_FIELD',
        risk: { riskLevel: 'HIGH' }
    });
    assert.ok(Array.isArray(approvers2));

    // Data operation
    const approvers3 = controller.determineApprovers({
        operation: 'UPDATE_RECORDS',
        risk: { riskLevel: 'HIGH' }
    });
    assert.ok(Array.isArray(approvers3));
});

// ============================================================================
// APPROVAL STATUS TESTS
// ============================================================================

test('Should check approval status', async (testApprovalDir) => {
    const controller = new HumanInTheLoopController({ approvalDir: testApprovalDir });

    const requestId = controller.generateRequestId();
    const approvalRequest = {
        requestId,
        timestamp: new Date().toISOString(),
        agent: 'test-agent',
        operation: { type: 'TEST', target: 'sandbox' },
        riskScore: 50,
        riskLevel: 'MEDIUM',
        reasoning: 'Test',
        rollbackPlan: 'Test',
        requiredApprovers: ['test-approver'],
        approvalDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        approvals: [],
        rejections: []
    };

    controller.saveApprovalRequest(approvalRequest);

    const status = controller.checkApprovalStatus(requestId);

    assert.strictEqual(status.status, 'PENDING');
    assert.strictEqual(status.granted, false);
});

test('Should detect timeout for expired approvals', async (testApprovalDir) => {
    const controller = new HumanInTheLoopController({ approvalDir: testApprovalDir });

    const requestId = controller.generateRequestId();
    const approvalRequest = {
        requestId,
        timestamp: new Date().toISOString(),
        agent: 'test-agent',
        operation: { type: 'TEST', target: 'sandbox' },
        riskScore: 50,
        riskLevel: 'MEDIUM',
        reasoning: 'Test',
        rollbackPlan: 'Test',
        requiredApprovers: ['test-approver'],
        approvalDeadline: new Date(Date.now() - 1000).toISOString(), // Expired
        status: 'PENDING',
        approvals: [],
        rejections: []
    };

    controller.saveApprovalRequest(approvalRequest);

    const status = controller.checkApprovalStatus(requestId);

    assert.strictEqual(status.status, 'TIMEOUT');
    assert.strictEqual(status.granted, false);
});

// ============================================================================
// EMERGENCY OVERRIDE TESTS
// ============================================================================

test('Should detect emergency override when environment variable set', () => {
    process.env.AGENT_GOVERNANCE_OVERRIDE = 'true';
    process.env.OVERRIDE_REASON = 'Test override';
    process.env.OVERRIDE_APPROVER = 'test@example.com';
    process.env.OVERRIDE_APPROVAL_CODE = 'test-code-123';
    process.env.AGENT_GOVERNANCE_OVERRIDE_CODE = 'test-code-123';

    const controller = new HumanInTheLoopController({ approvalDir: '/tmp/test' });
    const override = controller.checkEmergencyOverride();

    assert.ok(override);
    assert.strictEqual(override.enabled, true);
    assert.strictEqual(override.reason, 'Test override');
    assert.strictEqual(override.approver, 'test@example.com');

    // Cleanup
    delete process.env.AGENT_GOVERNANCE_OVERRIDE;
    delete process.env.OVERRIDE_REASON;
    delete process.env.OVERRIDE_APPROVER;
    delete process.env.OVERRIDE_APPROVAL_CODE;
    delete process.env.AGENT_GOVERNANCE_OVERRIDE_CODE;
});

test('Should return null when no override set', () => {
    // Ensure override not set
    delete process.env.AGENT_GOVERNANCE_OVERRIDE;

    const controller = new HumanInTheLoopController({ approvalDir: '/tmp/test' });
    const override = controller.checkEmergencyOverride();

    assert.strictEqual(override, null);
});

// ============================================================================
// PENDING APPROVALS TESTS
// ============================================================================

test('Should list pending approvals', async (testApprovalDir) => {
    const controller = new HumanInTheLoopController({ approvalDir: testApprovalDir });

    // Create a pending approval
    const requestId = controller.generateRequestId();
    const approvalRequest = {
        requestId,
        timestamp: new Date().toISOString(),
        agent: 'test-agent',
        operation: { type: 'TEST', target: 'production' },
        riskScore: 60,
        riskLevel: 'HIGH',
        reasoning: 'Test',
        rollbackPlan: 'Test',
        requiredApprovers: ['test-approver'],
        approvalDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        approvals: [],
        rejections: []
    };

    controller.saveApprovalRequest(approvalRequest);

    const pending = controller.listPendingApprovals();

    assert.ok(Array.isArray(pending));
    assert.ok(pending.length > 0);
    assert.ok(pending.some(p => p.requestId === requestId));
});

// ============================================================================
// Run all tests
// ============================================================================

// Only run if called directly
if (require.main === module) {
    runTests();
}

// Jest wrapper for standalone test runner
describe('Human In The Loop Controller', () => {
    it('should pass all approval workflow tests', async () => {
        const result = await runTests();
        expect(result.failed).toBe(0);
    }, 30000);
});
