#!/usr/bin/env node

/**
 * Unit Tests for Agent Risk Scorer
 *
 * Tests the risk calculation engine for autonomous agent operations.
 *
 * Run: node test/governance/agent-risk-scorer.test.js
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const assert = require('assert');
const path = require('path');
const { requireProtectedModule } = require('../../../opspal-core/scripts/lib/protected-asset-runtime');
const AgentRiskScorer = requireProtectedModule({
    pluginRoot: path.resolve(__dirname, '../..'),
    pluginName: 'opspal-salesforce',
    relativePath: 'scripts/lib/agent-risk-scorer.js',
    allowPlaintextFallback: true
});

// Test suite
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

async function runTests() {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('AGENT RISK SCORER - UNIT TESTS');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`✅ PASS: ${name}`);
            passed++;
        } catch (error) {
            console.error(`❌ FAIL: ${name}`);
            console.error(`   ${error.message}`);
            failed++;
        }
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
// RISK CALCULATION TESTS
// ============================================================================

test('Should calculate LOW risk for query in sandbox', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'QUERY_RECORDS',
        agent: 'sfdc-data-operations',
        environment: 'sandbox',
        recordCount: 500
    });

    assert.strictEqual(risk.riskLevel, 'LOW');
    assert.ok(risk.riskScore <= 30, `Expected <=30, got ${risk.riskScore}`);
    assert.strictEqual(risk.requiresApproval, false);
    assert.strictEqual(risk.blocked, false);
});

test('Should require approval for data updates in production even at MEDIUM risk', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'sfdc-data-operations',
        environment: 'production',
        recordCount: 2500
    });

    assert.strictEqual(risk.riskLevel, 'MEDIUM');
    assert.ok(risk.riskScore >= 31 && risk.riskScore <= 50, `Expected 31-50, got ${risk.riskScore}`);
    assert.strictEqual(risk.requiresApproval, true);
    assert.strictEqual(risk.blocked, false);
});

test('Should allow data updates in sandbox without approval', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'sfdc-data-operations',
        environment: 'sandbox',
        recordCount: 2500
    });

    assert.strictEqual(risk.riskLevel, 'LOW');
    assert.strictEqual(risk.requiresApproval, false);
    assert.strictEqual(risk.blocked, false);
});

test('Should calculate HIGH risk for permission set update in production', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_PERMISSION_SET',
        agent: 'sfdc-security-admin',
        environment: 'production',
        componentCount: 1
    });

    assert.strictEqual(risk.riskLevel, 'HIGH');
    assert.ok(risk.riskScore >= 51 && risk.riskScore <= 70, `Expected 51-70, got ${risk.riskScore}`);
    assert.strictEqual(risk.requiresApproval, true);
    assert.strictEqual(risk.blocked, false);
});

test('Should calculate CRITICAL risk for mass delete in production', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'DELETE_RECORDS',
        agent: 'sfdc-data-operations',
        environment: 'production',
        recordCount: 50000,
        hasCircularDeps: true,
        isRecursive: true,
        dependencies: ['dep1', 'dep2', 'dep3']
    });

    assert.ok(risk.riskScore >= 71, `Expected >=71, got ${risk.riskScore}`);
    assert.strictEqual(risk.riskLevel, 'CRITICAL');
    assert.strictEqual(risk.requiresApproval, true);
    assert.strictEqual(risk.blocked, true);
});

// ============================================================================
// IMPACT SCORE TESTS
// ============================================================================

test('Should assign 0 impact for read operations', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'QUERY_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox'
    });

    assert.strictEqual(risk.breakdown.impactScore.score, 0);
});

test('Should assign 30 impact for security operations', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_PERMISSION_SET',
        agent: 'test-agent',
        environment: 'sandbox'
    });

    assert.strictEqual(risk.breakdown.impactScore.score, 30);
});

test('Should assign 20 impact for destructive operations', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'DELETE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox'
    });

    assert.strictEqual(risk.breakdown.impactScore.score, 20);
});

// ============================================================================
// ENVIRONMENT RISK TESTS
// ============================================================================

test('Should assign 0 risk for sandbox environment', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox'
    });

    assert.strictEqual(risk.breakdown.environmentRisk.score, 0);
});

test('Should assign 25 risk for production environment', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'production'
    });

    assert.strictEqual(risk.breakdown.environmentRisk.score, 25);
});

test('Should assign 15 risk for full sandbox environment', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'full-sandbox'
    });

    assert.strictEqual(risk.breakdown.environmentRisk.score, 15);
});

// ============================================================================
// VOLUME RISK TESTS
// ============================================================================

test('Should assign 0 volume risk for 0 records', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox',
        recordCount: 0
    });

    assert.strictEqual(risk.breakdown.volumeRisk.score, 0);
});

test('Should assign 10 volume risk for 1,000-10,000 records', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox',
        recordCount: 1000
    });

    assert.strictEqual(risk.breakdown.volumeRisk.score, 10); // 1k-10k range = 10 points
});

test('Should assign 20 volume risk for 50,000+ records', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox',
        recordCount: 50000
    });

    assert.strictEqual(risk.breakdown.volumeRisk.score, 20);
});

// ============================================================================
// COMPLEXITY RISK TESTS
// ============================================================================

test('Should assign 0 complexity risk for simple operation', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox',
        dependencies: []
    });

    assert.strictEqual(risk.breakdown.complexityRisk.score, 0);
});

test('Should increase complexity risk for circular dependencies', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox',
        hasCircularDeps: true
    });

    assert.ok(risk.breakdown.complexityRisk.score >= 5, 'Circular deps should add risk');
});

test('Should increase complexity risk for recursive operations', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'sandbox',
        isRecursive: true
    });

    assert.ok(risk.breakdown.complexityRisk.score >= 3, 'Recursive ops should add risk');
});

// ============================================================================
// RISK THRESHOLD TESTS
// ============================================================================

test('Should require approval for HIGH risk operations', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_PERMISSION_SET',
        agent: 'sfdc-security-admin',
        environment: 'production'
    });

    assert.strictEqual(risk.requiresApproval, true);
    assert.strictEqual(risk.riskLevel, 'HIGH');
    assert.ok(risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL');
});

test('Should block CRITICAL risk operations', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'DELETE_RECORDS',
        agent: 'sfdc-data-operations',
        environment: 'production',
        recordCount: 50000,
        hasCircularDeps: true,
        isRecursive: true
    });

    assert.ok(risk.riskScore >= 71, `Expected >=71, got ${risk.riskScore}`);
    assert.strictEqual(risk.blocked, true);
});

// ============================================================================
// RECOMMENDATION TESTS
// ============================================================================

test('Should provide recommendations based on risk level', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_PERMISSION_SET',
        agent: 'sfdc-security-admin',
        environment: 'production'
    });

    assert.ok(Array.isArray(risk.recommendations));
    assert.ok(risk.recommendations.length > 0);
    assert.ok(risk.recommendations.some(r => r.type === 'HIGH'));
});

test('Should provide recommendations for high-risk operations', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'DEPLOY_FIELD',
        agent: 'sfdc-metadata-manager',
        environment: 'production'
    });

    // Should have recommendations (may not specifically mention rollback in message, but in action)
    assert.ok(risk.recommendations.length > 0, 'Should provide recommendations');
    assert.ok(risk.recommendations.some(r => r.type === 'MEDIUM' || r.type === 'INFO'));
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

test('Should throw error if operation type missing', () => {
    const scorer = new AgentRiskScorer();

    assert.throws(() => {
        scorer.calculateRisk({
            agent: 'test-agent',
            environment: 'sandbox'
        });
    }, /Operation type is required/);
});

test('Should throw error if agent name missing', () => {
    const scorer = new AgentRiskScorer();

    assert.throws(() => {
        scorer.calculateRisk({
            type: 'UPDATE_RECORDS',
            environment: 'sandbox'
        });
    }, /Agent name is required/);
});

test('Should handle missing environment gracefully', () => {
    const scorer = new AgentRiskScorer();

    // Should not throw, but warn
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent'
        // environment missing
    });

    assert.ok(risk);
    assert.ok(risk.riskScore >= 0);
});

// ============================================================================
// BREAKDOWN STRUCTURE TESTS
// ============================================================================

test('Should include all risk factor breakdowns', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'production',
        recordCount: 1000
    });

    assert.ok(risk.breakdown);
    assert.ok(risk.breakdown.impactScore);
    assert.ok(risk.breakdown.environmentRisk);
    assert.ok(risk.breakdown.volumeRisk);
    assert.ok(risk.breakdown.historicalRisk);
    assert.ok(risk.breakdown.complexityRisk);
});

test('Should include max scores for each factor', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UPDATE_RECORDS',
        agent: 'test-agent',
        environment: 'production'
    });

    assert.strictEqual(risk.breakdown.impactScore.maxScore, 30);
    assert.strictEqual(risk.breakdown.environmentRisk.maxScore, 25);
    assert.strictEqual(risk.breakdown.volumeRisk.maxScore, 20);
    assert.strictEqual(risk.breakdown.historicalRisk.maxScore, 15);
    assert.strictEqual(risk.breakdown.complexityRisk.maxScore, 10);
});

// ============================================================================
// EDGE CASES
// ============================================================================

test('Should handle maximum risk score of 100', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'DELETE_RECORDS',
        agent: 'test-agent',
        environment: 'production',
        recordCount: 100000,
        dependencies: ['dep1', 'dep2', 'dep3', 'dep4', 'dep5'],
        hasCircularDeps: true,
        isRecursive: true,
        crossObject: true
    });

    assert.ok(risk.riskScore <= 100, 'Risk score should not exceed 100');
});

test('Should handle unknown operation type with default impact', () => {
    const scorer = new AgentRiskScorer();
    const risk = scorer.calculateRisk({
        type: 'UNKNOWN_OPERATION_XYZ',
        agent: 'test-agent',
        environment: 'sandbox'
    });

    assert.ok(risk.riskScore >= 0, 'Should calculate risk for unknown operations');
    assert.strictEqual(risk.breakdown.impactScore.score, 10); // Default medium impact
});

// ============================================================================
// Run all tests
// ============================================================================

// Only run if called directly
if (require.main === module) {
    runTests();
}

// Jest wrapper for standalone test runner
describe('Agent Risk Scorer', () => {
    it('should pass all risk calculation tests', async () => {
        const result = await runTests();
        expect(result.failed).toBe(0);
    }, 30000);
});
