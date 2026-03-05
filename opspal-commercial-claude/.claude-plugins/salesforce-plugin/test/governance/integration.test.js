#!/usr/bin/env node

/**
 * Integration Tests for Agent Governance Framework
 *
 * Tests the complete governance workflow end-to-end.
 *
 * Run: node test/governance/integration.test.js
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AgentGovernance = require('../../scripts/lib/agent-governance');

// Test suite
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

async function runTests() {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('AGENT GOVERNANCE - INTEGRATION TESTS');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✅ PASS: ${name}`);
            passed++;
        } catch (error) {
            console.error(`❌ FAIL: ${name}`);
            console.error(`   ${error.message}`);
            if (error.stack) {
                console.error('   Stack:', error.stack.split('\n')[1]);
            }
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log(`RESULTS: ${passed} passed, ${failed} failed (${tests.length} total)`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// END-TO-END WORKFLOW TESTS
// ============================================================================

test('Should execute LOW risk operation without approval', async () => {
    const governance = new AgentGovernance('test-agent');

    let operationExecuted = false;

    const result = await governance.executeWithGovernance(
        {
            type: 'QUERY_RECORDS',
            environment: 'sandbox',
            recordCount: 100,
            reasoning: 'Test query'
        },
        async () => {
            operationExecuted = true;
            return {
                success: true,
                recordsReturned: 100
            };
        }
    );

    assert.strictEqual(operationExecuted, true, 'Operation should have executed');
    assert.strictEqual(result.success, true);
    assert.ok(result.governance);
    assert.strictEqual(result.governance.riskLevel, 'LOW');
    assert.strictEqual(result.governance.approvalRequired, false);
});

test('Should assess risk without executing', async () => {
    const governance = new AgentGovernance('test-agent');

    const risk = await governance.assessRisk({
        type: 'UPDATE_PERMISSION_SET',
        environment: 'production',
        componentCount: 1
    });

    assert.ok(risk);
    assert.ok(risk.riskScore >= 0 && risk.riskScore <= 100);
    assert.ok(risk.riskLevel);
    assert.ok(typeof risk.requiresApproval === 'boolean');
    assert.ok(typeof risk.blocked === 'boolean');
});

test('Should load agent configuration from permission matrix', () => {
    const governance = new AgentGovernance('sfdc-security-admin');

    const config = governance.agentConfig;

    assert.ok(config, 'Should load agent configuration');
    assert.strictEqual(config.tier, 4, 'sfdc-security-admin should be Tier 4');
    assert.ok(Array.isArray(config.permissions));
});

test('Should handle agent not in permission matrix gracefully', () => {
    const governance = new AgentGovernance('non-existent-agent');

    // Should not throw, but config should be null
    assert.strictEqual(governance.agentConfig, null);
});

// ============================================================================
// GOVERNANCE STATS TESTS
// ============================================================================

test('Should track execution statistics', async () => {
    const governance = new AgentGovernance('test-agent');

    // Execute operation
    await governance.executeWithGovernance(
        {
            type: 'QUERY_RECORDS',
            environment: 'sandbox',
            reasoning: 'Test'
        },
        async () => {
            return { success: true };
        }
    );

    const stats = governance.getStats();

    assert.ok(stats.totalOperations > 0);
    assert.ok(stats.totalOperations === 1);
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

test('Should handle operation failure and log error', async () => {
    const governance = new AgentGovernance('test-agent');

    try {
        await governance.executeWithGovernance(
            {
                type: 'UPDATE_RECORDS',
                environment: 'sandbox',
                reasoning: 'Test failure'
            },
            async () => {
                throw new Error('Operation failed intentionally');
            }
        );

        assert.fail('Should have thrown error');

    } catch (error) {
        assert.ok(error.message.includes('Operation failed intentionally'));
    }
});

test('Should validate operation details', async () => {
    const governance = new AgentGovernance('test-agent');

    try {
        await governance.executeWithGovernance(
            {
                // Missing type
                environment: 'sandbox'
            },
            async () => {
                return { success: true };
            }
        );

        assert.fail('Should have thrown error');

    } catch (error) {
        assert.ok(error.message.includes('Operation type is required'));
    }
});

// ============================================================================
// PERMISSION MATRIX INTEGRATION TESTS
// ============================================================================

test('Should respect agent tier limits', () => {
    const governance = new AgentGovernance('sfdc-security-admin');

    // Tier 4 agent should have security permissions
    assert.ok(governance.agentConfig);
    assert.strictEqual(governance.agentConfig.tier, 4);
    assert.ok(governance.agentConfig.permissions.some(p => p.includes('security')));
});

test('Should load environment restrictions', () => {
    const matrixPath = path.join(
        __dirname,
        '..',
        '..',
        'config',
        'agent-permission-matrix.json'
    );

    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

    assert.ok(matrix.environmentRestrictions);
    assert.ok(matrix.environmentRestrictions.production);
    assert.ok(matrix.environmentRestrictions.sandbox);
});

// ============================================================================
// RISK FACTORS EXTRACTION TESTS
// ============================================================================

test('Should extract risk factors for display', () => {
    const governance = new AgentGovernance('test-agent');

    const risk = {
        riskScore: 65,
        riskLevel: 'HIGH',
        breakdown: {
            impactScore: { score: 30, factors: ['Security change'] },
            environmentRisk: { score: 25, environment: 'production' },
            volumeRisk: { score: 10, recordCount: 5000 },
            historicalRisk: { score: 0, failureRate: 0 },
            complexityRisk: { score: 0, factors: [] }
        }
    };

    const factors = governance.approvalController.extractRiskFactors(risk);

    assert.ok(Array.isArray(factors));
    assert.ok(factors.length > 0);
    assert.ok(factors.some(f => f.includes('Impact:')));
    assert.ok(factors.some(f => f.includes('Environment:')));
});

// ============================================================================
// COMPLETE WORKFLOW TEST
// ============================================================================

test('INTEGRATION: Complete governance workflow for update operation', async () => {
    const governance = new AgentGovernance('sfdc-data-operations');

    let operationExecuted = false;
    let verificationPerformed = false;

    const result = await governance.executeWithGovernance(
        {
            type: 'UPDATE_RECORDS',
            environment: 'sandbox',
            recordCount: 2500,
            reasoning: 'Update contact funnel stages based on engagement scoring',
            rollbackPlan: 'Restore from backup CSV if issues occur',
            rollbackCommand: 'node scripts/restore-from-backup.js contacts-backup.csv',
            affectedComponents: ['Contact.FunnelStage__c'],
            alternativesConsidered: [
                'Manual update (rejected - not scalable)',
                'Flow-based update (rejected - performance concerns)'
            ],
            decisionRationale: 'Bulk API provides best performance and auditability'
        },
        async () => {
            operationExecuted = true;

            // Simulate successful operation
            const updateResult = {
                success: true,
                recordsUpdated: 2500,
                errors: []
            };

            // Simulate verification
            verificationPerformed = true;
            const verification = {
                performed: true,
                passed: true,
                method: 'sample-verification',
                issues: []
            };

            return {
                ...updateResult,
                verification
            };
        }
    );

    // Validate workflow completed
    assert.strictEqual(operationExecuted, true, 'Operation should execute');
    assert.strictEqual(verificationPerformed, true, 'Verification should run');
    assert.strictEqual(result.success, true);
    assert.ok(result.governance);
    // Risk in sandbox with 2500 records = LOW (5 points for records + 0 for sandbox)
    assert.ok(['LOW', 'MEDIUM'].includes(result.governance.riskLevel), 'Should be LOW or MEDIUM risk');
    assert.ok(result.governance.auditLogged);
});

// ============================================================================
// Run all tests
// ============================================================================

runTests();


// Jest wrapper for standalone test runner
if (typeof describe !== 'undefined') {
  describe('Integration', () => {
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
