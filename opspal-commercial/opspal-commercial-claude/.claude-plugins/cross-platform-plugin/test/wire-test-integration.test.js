#!/usr/bin/env node
/**
 * Live Wire Sync Test - Integration Test Suite
 *
 * Purpose: Validate core functionality of Wire Test system without requiring
 * actual Salesforce or HubSpot connections.
 *
 * Test Coverage:
 * - Configuration loading and validation
 * - Ledger operation tracking and idempotency
 * - Guidance rule engine
 * - Collision detection logic
 * - Report generation
 *
 * Usage:
 *   node test/wire-test-integration.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import modules to test
const WireTestConfigLoader = require('../scripts/lib/wire-test-config-loader');
const WireTestLedger = require('../scripts/lib/wire-test-ledger');
const WireTestGuidance = require('../scripts/lib/wire-test-guidance');
const WireTestReporter = require('../scripts/lib/wire-test-reporter');

// Test utilities
class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
        this.errors = [];
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('\n🧪 Live Wire Sync Test - Integration Test Suite');
        console.log('═'.repeat(80));
        console.log('');

        for (const { name, fn } of this.tests) {
            try {
                await fn();
                this.passed++;
                console.log(`✅ ${name}`);
            } catch (error) {
                this.failed++;
                this.errors.push({ name, error });
                console.log(`❌ ${name}`);
                console.log(`   Error: ${error.message}`);
            }
        }

        console.log('');
        console.log('═'.repeat(80));
        console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed (${this.tests.length} total)`);

        if (this.failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.errors.forEach(({ name, error }) => {
                console.log(`\n  ${name}:`);
                console.log(`    ${error.message}`);
                if (error.stack) {
                    console.log(`    ${error.stack.split('\n').slice(1, 3).join('\n    ')}`);
                }
            });
            process.exit(1);
        } else {
            console.log('\n✅ All tests passed!');
            process.exit(0);
        }
    }
}

const runner = new TestRunner();

// ============================================================================
// Configuration Loader Tests
// ============================================================================

runner.test('ConfigLoader: Normalize selectors with defaults', () => {
    const config = WireTestConfigLoader._mergeDefaults({
        object_types: ['account'],
        account_selectors: [
            { type: 'sfdc_account_id', value: '001XXXXXXXXXXXXXXX' }
        ],
        salesforce: { orgAlias: 'test-org' }
    });

    assert.ok(config.sla_seconds, 'Should have default SLA');
    assert.ok(config.polling_interval_seconds, 'Should have default polling interval');
});

runner.test('ConfigLoader: Normalize Salesforce Account ID selector', () => {
    const selectors = ['001XXXXXXXXXXXXXXX'];
    const normalized = WireTestConfigLoader.normalizeSelectors(selectors);

    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].type, 'sfdc_account_id');
    assert.strictEqual(normalized[0].value, '001XXXXXXXXXXXXXXX');
});

runner.test('ConfigLoader: Normalize domain selector', () => {
    const selectors = ['domain:acme.com'];
    const normalized = WireTestConfigLoader.normalizeSelectors(selectors);

    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].type, 'domain');
    assert.strictEqual(normalized[0].value, 'acme.com');
});

runner.test('ConfigLoader: Normalize HubSpot company ID selector', () => {
    const selectors = ['12345678'];
    const normalized = WireTestConfigLoader.normalizeSelectors(selectors);

    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].type, 'hubspot_company_id');
    assert.strictEqual(normalized[0].value, '12345678');
});

runner.test('ConfigLoader: Normalize sync anchor UUID selector', () => {
    const selectors = ['f47ac10b-58cc-4372-a567-0e02b2c3d479'];
    const normalized = WireTestConfigLoader.normalizeSelectors(selectors);

    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].type, 'sync_anchor');
    assert.strictEqual(normalized[0].value, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
});

runner.test('ConfigLoader: Timestamp generation', () => {
    const ts1 = WireTestConfigLoader._generateTimestamp();
    const ts2 = WireTestConfigLoader._generateTimestamp();

    assert.ok(ts1);
    assert.ok(ts2);
    // Format is YYYY-MM-DD-HH-MM-SS
    assert.match(ts1, /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/);
});

// ============================================================================
// Ledger Tests
// ============================================================================

runner.test('Ledger: Initialize ledger with run ID', () => {
    const runId = 'test-run-123';
    const ledger = new WireTestLedger(runId);

    assert.strictEqual(ledger.runId, runId);
    assert.ok(ledger.entries);
});

runner.test('Ledger: Record pass result', () => {
    const ledger = new WireTestLedger('test-run');
    const syncAnchor = 'test-anchor-uuid';

    ledger.recordPass('probe_sf_to_hs', syncAnchor, { lag_seconds: 45, attempts: 5 });

    const result = ledger.getProbeResult('probe_sf_to_hs', syncAnchor);
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.result.lag_seconds, 45);
});

runner.test('Ledger: Get summary statistics', () => {
    const ledger = new WireTestLedger('test-run');

    ledger.recordPass('probe_sf_to_hs', 'anchor-1', { lag_seconds: 30 });
    ledger.recordPass('probe_hs_to_sf', 'anchor-1', { lag_seconds: 45 });
    ledger.recordTimeout('probe_sf_to_hs', 'anchor-2', { sla_seconds: 240 });

    const summary = ledger.getSummary();

    assert.ok(summary.total >= 3, `Expected total >= 3, got ${summary.total}`);
    assert.ok(summary.pass >= 2, `Expected pass >= 2, got ${summary.pass}`);
    assert.ok(summary.timeout >= 1, `Expected timeout >= 1, got ${summary.timeout}`);
});

runner.test('Ledger: Get probe results by sync anchor', () => {
    const ledger = new WireTestLedger('test-run');
    const syncAnchor = 'anchor-1';

    ledger.recordPass('probe_sf_to_hs', syncAnchor, { lag_seconds: 30 });
    ledger.recordPass('probe_hs_to_sf', syncAnchor, { lag_seconds: 45 });

    const allResults = ledger.getAllProbeResults();
    assert.ok(allResults[syncAnchor]);
});

// ============================================================================
// Guidance Engine Tests
// ============================================================================

runner.test('Guidance: Both directions passing', () => {
    const sfResult = { status: 'success', lag_seconds: 30 };
    const hsResult = { status: 'success', lag_seconds: 45 };

    const guidance = WireTestGuidance.getProbeGuidance(sfResult, hsResult);

    assert.ok(guidance.length > 0);
    assert.strictEqual(guidance[0].severity, 'success');
    assert.match(guidance[0].title, /working/i);
});

runner.test('Guidance: SF→HS pass, HS→SF fail', () => {
    const sfResult = { status: 'success', lag_seconds: 30 };
    const hsResult = { status: 'fail', lag_seconds: null };

    const guidance = WireTestGuidance.getProbeGuidance(sfResult, hsResult);

    const errorGuidance = guidance.find(g => g.severity === 'error');
    assert.ok(errorGuidance, 'Should have error-level guidance');
    assert.match(errorGuidance.title, /HS→SF.*broken/i);
    assert.ok(errorGuidance.actions.length >= 5, 'Should have 5+ recommended actions');
});

runner.test('Guidance: SF→HS fail, HS→SF pass', () => {
    const sfResult = { status: 'fail', lag_seconds: null };
    const hsResult = { status: 'success', lag_seconds: 45 };

    const guidance = WireTestGuidance.getProbeGuidance(sfResult, hsResult);

    const errorGuidance = guidance.find(g => g.severity === 'error');
    assert.ok(errorGuidance);
    assert.match(errorGuidance.title, /SF→HS.*broken/i);
    assert.ok(errorGuidance.root_causes.length >= 3, 'Should have root causes');
});

runner.test('Guidance: Both directions fail (critical)', () => {
    const sfResult = { status: 'fail', lag_seconds: null };
    const hsResult = { status: 'fail', lag_seconds: null };

    const guidance = WireTestGuidance.getProbeGuidance(sfResult, hsResult);

    const criticalGuidance = guidance.find(g => g.severity === 'critical');
    assert.ok(criticalGuidance, 'Should have critical-level guidance');
    assert.match(criticalGuidance.title, /completely broken/i);
});

runner.test('Guidance: Timeout warning', () => {
    const sfResult = { status: 'timeout', lag_seconds: null, timeout_seconds: 240 };
    const hsResult = { status: 'success', lag_seconds: 45 };

    const guidance = WireTestGuidance.getProbeGuidance(sfResult, hsResult);

    const warningGuidance = guidance.find(g => g.severity === 'warning');
    assert.ok(warningGuidance, 'Should have warning-level guidance');
    assert.match(warningGuidance.title, /timeout/i);
});

runner.test('Guidance: Collision guidance - one-to-many', () => {
    const collisions = {
        one_to_many: [
            {
                objectType: 'Account',
                hubspot_id: '12345',
                salesforce_ids: ['001AAA', '001BBB'],
                count: 2,
                sync_anchors: ['anchor-1', 'anchor-2']
            }
        ],
        many_to_one: [],
        total: 1
    };

    const guidance = WireTestGuidance.getCollisionGuidance(collisions);

    assert.ok(guidance.length > 0);
    const collisionGuidance = guidance.find(g => g.title.includes('One-to-many'));
    assert.ok(collisionGuidance);
    assert.strictEqual(collisionGuidance.severity, 'warning');
    assert.ok(collisionGuidance.actions.length >= 4, 'Should have deduplication actions');
});

runner.test('Guidance: Comprehensive guidance with multiple issues', () => {
    const testResults = {
        probes: {
            'anchor-1': {
                sf_to_hs: { status: 'success', lag_seconds: 30 },
                hs_to_sf: { status: 'fail', lag_seconds: null }
            },
            'anchor-2': {
                sf_to_hs: { status: 'timeout', lag_seconds: null },
                hs_to_sf: { status: 'success', lag_seconds: 60 }
            }
        },
        collisions: {
            one_to_many: [],
            many_to_one: [],
            total: 0
        }
    };

    const guidance = WireTestGuidance.getComprehensiveGuidance(testResults);

    assert.ok(guidance.summary);
    assert.ok(guidance.recommendations);
    assert.ok(guidance.next_steps);
    assert.ok(guidance.summary.critical_issues >= 0);
    assert.ok(guidance.summary.warnings >= 0);
});

// ============================================================================
// Reporter Tests
// ============================================================================

runner.test('Reporter: Generate JSON report structure', () => {
    const config = {
        run_id: 'test-run',
        timestamp: new Date().toISOString(),
        sla_seconds: 240,
        polling_interval_seconds: 10,
        object_types: ['account'],
        account_selectors: [{ type: 'sfdc_account_id', value: '001XXX' }],
        sample_size_per_account: 20,
        salesforce: { orgAlias: 'test' },
        output: { generatePDF: false }
    };

    const ledger = new WireTestLedger('test-run');
    ledger.recordPass('probe_sf_to_hs', 'anchor-1', { lag_seconds: 30 });

    const testResults = {
        probes: ledger.getAllProbeResults(),
        collisions: { one_to_many: [], many_to_one: [], total: 0 }
    };
    const reporter = new WireTestReporter(config, ledger, testResults);
    const jsonReport = reporter.generateJSONReport();

    assert.ok(jsonReport.run_metadata);
    assert.ok(jsonReport.summary);
    assert.ok(jsonReport.records);
    assert.ok(jsonReport.guidance);
    assert.strictEqual(jsonReport.run_metadata.run_id, 'test-run');
});

runner.test('Reporter: Generate Markdown report', () => {
    const config = {
        run_id: 'test-run',
        timestamp: new Date().toISOString(),
        sla_seconds: 240,
        polling_interval_seconds: 10,
        object_types: ['account'],
        account_selectors: [{ type: 'sfdc_account_id', value: '001XXX' }],
        sample_size_per_account: 20,
        salesforce: { orgAlias: 'test' },
        output: { generatePDF: false }
    };

    const ledger = new WireTestLedger('test-run');
    ledger.recordPass('probe_sf_to_hs', 'anchor-1', { lag_seconds: 30 });
    ledger.recordPass('probe_hs_to_sf', 'anchor-1', { lag_seconds: 45 });

    const testResults = {
        probes: ledger.getAllProbeResults(),
        collisions: { one_to_many: [], many_to_one: [], total: 0 }
    };
    const reporter = new WireTestReporter(config, ledger, testResults);
    const jsonReport = reporter.generateJSONReport();
    const markdown = reporter.generateMarkdownReport(jsonReport);

    assert.ok(markdown.includes('Live Wire Sync Test Results'));
    assert.ok(markdown.includes('Executive Summary'));
    assert.ok(markdown.includes('Overall Health'));
    assert.ok(markdown.includes('test-run'));
});

runner.test('Reporter: Calculate percentage helper', () => {
    const config = {
        run_id: 'test',
        timestamp: new Date().toISOString(),
        salesforce: { orgAlias: 'test' },
        output: { generatePDF: false }
    };
    const ledger = new WireTestLedger('test');
    const reporter = new WireTestReporter(config, ledger, {});

    assert.strictEqual(reporter._percentage(25, 100), '25%');
    assert.strictEqual(reporter._percentage(1, 3), '33%');
    assert.strictEqual(reporter._percentage(0, 100), '0%');
    assert.strictEqual(reporter._percentage(0, 0), '0%');
});

// ============================================================================
// Integration Scenario Tests
// ============================================================================

runner.test('Integration: Complete test workflow simulation', () => {
    // 1. Normalize selectors (use valid 18-character Salesforce ID)
    const selectors = WireTestConfigLoader.normalizeSelectors(['001000000000000AAA', 'domain:acme.com']);
    assert.strictEqual(selectors.length, 2);

    // 2. Initialize ledger
    const ledger = new WireTestLedger('integration-test');

    // 3. Simulate probe results
    ledger.recordPass('probe_sf_to_hs', 'anchor-1', { lag_seconds: 35 });
    ledger.recordPass('probe_hs_to_sf', 'anchor-1', { lag_seconds: 50 });
    ledger.recordPass('probe_sf_to_hs', 'anchor-2', { lag_seconds: 42 });
    ledger.recordTimeout('probe_hs_to_sf', 'anchor-2', { sla_seconds: 240 });

    // 4. Get summary
    const summary = ledger.getSummary();
    assert.ok(summary.total >= 4, `Expected total >= 4, got ${summary.total}`);
    assert.ok(summary.pass >= 3, `Expected pass >= 3, got ${summary.pass}`);
    assert.ok(summary.timeout >= 1, `Expected timeout >= 1, got ${summary.timeout}`);

    // 5. Generate guidance
    const testResults = {
        probes: ledger.getAllProbeResults(),
        collisions: { one_to_many: [], many_to_one: [], total: 0 }
    };

    const guidance = WireTestGuidance.getComprehensiveGuidance(testResults);
    assert.ok(guidance.summary.overall_health);
});

runner.test('Integration: Error detection and guidance flow', () => {
    const ledger = new WireTestLedger('error-test');

    // Simulate SF→HS working but HS→SF broken
    ledger.recordPass('probe_sf_to_hs', 'anchor-1', { lag_seconds: 30 });
    ledger.recordFail('probe_hs_to_sf', 'anchor-1', { error: 'Connection failed' });

    const probeResults = ledger.getAllProbeResults();
    const testResults = {
        probes: probeResults,
        collisions: { one_to_many: [], many_to_one: [], total: 0 }
    };

    const guidance = WireTestGuidance.getComprehensiveGuidance(testResults);

    // Should detect error
    assert.ok(guidance.summary.critical_issues > 0 || guidance.summary.warnings > 0);

    // Should provide actionable next steps
    assert.ok(guidance.next_steps.length > 0);
    assert.ok(guidance.next_steps[0].action);
    assert.ok(guidance.next_steps[0].command);
});

runner.test('Integration: Collision detection and resolution guidance', () => {
    const collisions = {
        one_to_many: [
            {
                objectType: 'Account',
                hubspot_id: '12345',
                salesforce_ids: ['001AAA', '001BBB', '001CCC'],
                count: 3,
                sync_anchors: ['anchor-1', 'anchor-2', 'anchor-3']
            }
        ],
        many_to_one: [
            {
                objectType: 'Contact',
                salesforce_id: '003XXX',
                hubspot_ids: ['54321', '54322'],
                count: 2,
                sync_anchors: ['anchor-4', 'anchor-5']
            }
        ],
        total: 2
    };

    const guidance = WireTestGuidance.getCollisionGuidance(collisions);

    // Should have guidance for both collision types
    const oneToManyGuidance = guidance.find(g => g.title.includes('One-to-many'));
    const manyToOneGuidance = guidance.find(g => g.title.includes('Many-to-one'));

    assert.ok(oneToManyGuidance, 'Should have one-to-many guidance');
    assert.ok(manyToOneGuidance, 'Should have many-to-one guidance');

    // Should include deduplication actions
    assert.ok(oneToManyGuidance.actions.some(a => a.action.includes('Deduplicate')));
    assert.ok(manyToOneGuidance.actions.some(a => a.action.includes('Deduplicate')));
});

// ============================================================================
// Run all tests
// ============================================================================

(async () => {
    await runner.run();
})();
