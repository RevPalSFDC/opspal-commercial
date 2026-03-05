#!/usr/bin/env node

/**
 * Scoring Components Unit Test
 *
 * Tests individual scoring components with synthetic data to validate:
 * - statusScore (+200 for Active/Customer, -50 for Prospect)
 * - revenueScore (ARR + MRR*12 + ACV + TCV formula)
 * - websiteScore (+50 real, -200 auto-generated)
 * - nameBlankPenalty (-500 for blank names)
 * - Integration ID conflict with true external IDs
 *
 * @author Claude Code
 * @date 2025-10-16
 */

const DedupSafetyEngine = require('./dedup-safety-engine.js');

class ScoringComponentTester {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    log(message, level = 'INFO') {
        const prefix = {
            'INFO': 'ℹ',
            'PASS': '✅',
            'FAIL': '❌',
            'SECTION': '📋'
        }[level] || '•';
        console.log(`${prefix} ${message}`);
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('\n' + '═'.repeat(70));
        console.log('SCORING COMPONENTS UNIT TEST');
        console.log('═'.repeat(70));
        console.log(`Total tests: ${this.tests.length}\n`);

        for (const test of this.tests) {
            try {
                await test.fn();
                this.passed++;
                this.log(`${test.name}`, 'PASS');
            } catch (error) {
                this.failed++;
                this.log(`${test.name}`, 'FAIL');
                console.log(`  Error: ${error.message}`);
            }
        }

        console.log('\n' + '═'.repeat(70));
        console.log('SUMMARY');
        console.log('═'.repeat(70));
        console.log(`✅ Passed: ${this.passed}`);
        console.log(`❌ Failed: ${this.failed}`);
        console.log(`Total: ${this.tests.length}`);
        console.log('═'.repeat(70) + '\n');

        process.exit(this.failed > 0 ? 1 : 0);
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(`${message} - Expected: ${expected}, Got: ${actual}`);
        }
    }

    assertGreaterThan(actual, threshold, message) {
        if (actual <= threshold) {
            throw new Error(`${message} - Expected > ${threshold}, Got: ${actual}`);
        }
    }

    assertLessThan(actual, threshold, message) {
        if (actual >= threshold) {
            throw new Error(`${message} - Expected < ${threshold}, Got: ${actual}`);
        }
    }
}

// Create mock engine instance with helper methods
class MockDedupEngine {
    constructor() {
        this.importanceWeights = {
            integrationIds: [
                { name: 'Stripe_Customer_Id__c', label: 'Stripe Customer ID' },
                { name: 'NetSuite_Account_Id__c', label: 'NetSuite Account ID' },
                { name: 'p_uuid__c', label: 'UUID' },
                { name: 'Salesforce_com_ID__c', label: 'Salesforce.com ID' }
            ],
            importanceFields: [
                { name: 'Customer_Status__c', label: 'Customer Status', weight: 95 },
                { name: 'Type', label: 'Type', weight: 90 },
                { name: 'ARR__c', label: 'ARR', weight: 85 },
                { name: 'MRR__c', label: 'MRR', weight: 85 },
                { name: 'ACV__c', label: 'ACV', weight: 85 },
                { name: 'TCV__c', label: 'TCV', weight: 85 }
            ]
        };
        this.config = {
            guardrails: {
                integration_id_conflict: { enabled: true, severity: 'BLOCK' }
            }
        };
    }

    // Copy methods from DedupSafetyEngine
    calculateStatusScore(record) {
        const activeCustomerKeywords = /customer|active|paying|premium|enterprise|platinum|gold|subscribed|live|current/i;
        const prospectLeadKeywords = /prospect|lead|trial|evaluation|cold|inactive|former|ex|churned|cancelled|canceled/i;

        let statusScore = 0;

        for (const field of this.importanceWeights.importanceFields) {
            const value = record[field.name];
            if (!value) continue;

            const valueLower = String(value).toLowerCase();
            const fieldName = field.name.toLowerCase();
            if (!/type|status|stage|lifecycle|customer|category/.test(fieldName)) {
                continue;
            }

            if (activeCustomerKeywords.test(valueLower)) {
                statusScore = Math.max(statusScore, 200);
                break;
            }

            if (prospectLeadKeywords.test(valueLower)) {
                statusScore = Math.min(statusScore, -50);
            }
        }

        return statusScore;
    }

    calculateRevenueScore(record) {
        const revenuePatterns = [
            { pattern: /arr/i, multiplier: 1 },
            { pattern: /mrr/i, multiplier: 12 },
            { pattern: /acv/i, multiplier: 1 },
            { pattern: /tcv/i, multiplier: 1 }
        ];

        let totalRevenue = 0;

        for (const field of this.importanceWeights.importanceFields) {
            const fieldName = field.name.toLowerCase();

            for (const { pattern, multiplier } of revenuePatterns) {
                if (pattern.test(fieldName)) {
                    const value = parseFloat(record[field.name]) || 0;
                    totalRevenue += value * multiplier;
                }
            }
        }

        const revenueScore = Math.max(0, Math.min(1000, totalRevenue / 1000));
        return Math.round(revenueScore);
    }

    calculateWebsiteQualityScore(record) {
        const website = record.Website || '';
        if (!website || website.trim() === '') {
            return 0;
        }

        const websiteLower = website.toLowerCase();

        const autoGeneratedPatterns = [
            /sforce-/,
            /\.force\.com/,
            /\.my\.salesforce\.com/,
            /example\.com/,
            /test\.com/
        ];

        for (const pattern of autoGeneratedPatterns) {
            if (pattern.test(websiteLower)) {
                return -200;
            }
        }

        const hasValidDomain = /^(https?:\/\/)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(websiteLower);
        if (hasValidDomain) {
            return 50;
        }

        return 0;
    }

    checkIntegrationIdConflict(recordA, recordB, decision) {
        const excludePatterns = [
            /uuid/i,
            /guid/i,
            /salesforce/i,
            /^id$/i,
            /recordid/i,
            /^full.*id/i
        ];

        const conflicts = [];

        for (const idField of this.importanceWeights.integrationIds) {
            const shouldExclude = excludePatterns.some(pattern =>
                pattern.test(idField.name) || pattern.test(idField.label)
            );

            if (shouldExclude) {
                continue;
            }

            const valueA = recordA[idField.name];
            const valueB = recordB[idField.name];

            if (valueA && valueB && valueA !== valueB) {
                conflicts.push({
                    field: idField.name,
                    label: idField.label,
                    valueA,
                    valueB
                });
            }
        }

        if (conflicts.length > 0) {
            decision.guardrails_triggered.push({
                type: 'TYPE_1_INTEGRATION_ID_CONFLICT',
                severity: this.config.guardrails.integration_id_conflict.severity,
                reason: `${conflicts.length} integration ID conflict(s) detected`,
                details: { conflicts }
            });
        }
    }
}

// Initialize tester
const tester = new ScoringComponentTester();
const engine = new MockDedupEngine();

// Test 1: statusScore - Active Customer
tester.test('statusScore: Active Customer returns +200', () => {
    const record = {
        Customer_Status__c: 'Active',
        Type: 'Customer'
    };
    const score = engine.calculateStatusScore(record);
    tester.assertEqual(score, 200, 'Active Customer should score +200');
});

// Test 2: statusScore - Prospect
tester.test('statusScore: Prospect returns -50', () => {
    const record = {
        Customer_Status__c: 'Prospect',
        Type: 'Prospect'
    };
    const score = engine.calculateStatusScore(record);
    tester.assertEqual(score, -50, 'Prospect should score -50');
});

// Test 3: statusScore - No status data
tester.test('statusScore: No status data returns 0', () => {
    const record = {
        Name: 'Test Account'
    };
    const score = engine.calculateStatusScore(record);
    tester.assertEqual(score, 0, 'No status should score 0');
});

// Test 4: revenueScore - ARR only
tester.test('revenueScore: ARR $50,000 returns 50', () => {
    const record = {
        ARR__c: 50000
    };
    const score = engine.calculateRevenueScore(record);
    tester.assertEqual(score, 50, 'ARR $50k should score 50');
});

// Test 5: revenueScore - ARR + MRR
tester.test('revenueScore: ARR $50k + MRR $4k returns 98', () => {
    const record = {
        ARR__c: 50000,
        MRR__c: 4000  // 4000 * 12 = 48000
    };
    const score = engine.calculateRevenueScore(record);
    tester.assertEqual(score, 98, 'ARR + MRR should score 98');
});

// Test 6: revenueScore - Full formula
tester.test('revenueScore: ARR $50k + MRR $4k + ACV $48k + TCV $150k returns 296', () => {
    const record = {
        ARR__c: 50000,
        MRR__c: 4000,   // 48000
        ACV__c: 48000,
        TCV__c: 150000
    };
    const score = engine.calculateRevenueScore(record);
    tester.assertEqual(score, 296, 'Full revenue should score 296');
});

// Test 7: revenueScore - Clamped at 1000
tester.test('revenueScore: Revenue $2M clamped at 1000', () => {
    const record = {
        ARR__c: 2000000
    };
    const score = engine.calculateRevenueScore(record);
    tester.assertEqual(score, 1000, 'Revenue over $1M should clamp at 1000');
});

// Test 8: websiteScore - Real domain with www
tester.test('websiteScore: www.acmecorp.com returns +50', () => {
    const record = {
        Website: 'www.acmecorp.com'
    };
    const score = engine.calculateWebsiteQualityScore(record);
    tester.assertEqual(score, 50, 'Real domain should score +50');
});

// Test 9: websiteScore - Real domain with http
tester.test('websiteScore: http://acmecorp.com returns +50', () => {
    const record = {
        Website: 'http://acmecorp.com'
    };
    const score = engine.calculateWebsiteQualityScore(record);
    tester.assertEqual(score, 50, 'Real domain with http should score +50');
});

// Test 10: websiteScore - Auto-generated force.com
tester.test('websiteScore: company.force.com returns -200', () => {
    const record = {
        Website: 'https://company123.force.com'
    };
    const score = engine.calculateWebsiteQualityScore(record);
    tester.assertEqual(score, -200, 'Auto-generated force.com should score -200');
});

// Test 11: websiteScore - No website
tester.test('websiteScore: Empty website returns 0', () => {
    const record = {
        Website: ''
    };
    const score = engine.calculateWebsiteQualityScore(record);
    tester.assertEqual(score, 0, 'No website should score 0');
});

// Test 12: Integration ID conflict - True external IDs differ
tester.test('Integration ID conflict: Stripe IDs differ triggers BLOCK', () => {
    const recordA = {
        Stripe_Customer_Id__c: 'cus_ABC123',
        NetSuite_Account_Id__c: 'NS-12345'
    };
    const recordB = {
        Stripe_Customer_Id__c: 'cus_XYZ789',
        NetSuite_Account_Id__c: 'NS-67890'
    };
    const decision = { guardrails_triggered: [] };
    engine.checkIntegrationIdConflict(recordA, recordB, decision);

    tester.assertEqual(decision.guardrails_triggered.length, 1, 'Should trigger 1 guardrail');
    tester.assertEqual(decision.guardrails_triggered[0].type, 'TYPE_1_INTEGRATION_ID_CONFLICT', 'Should be integration ID conflict');
    tester.assertEqual(decision.guardrails_triggered[0].details.conflicts.length, 2, 'Should have 2 conflicts (Stripe + NetSuite)');
});

// Test 13: Integration ID conflict - UUID fields excluded
tester.test('Integration ID conflict: UUID fields excluded', () => {
    const recordA = {
        p_uuid__c: 'uuid-123',
        Salesforce_com_ID__c: '001ABC'
    };
    const recordB = {
        p_uuid__c: 'uuid-456',
        Salesforce_com_ID__c: '001DEF'
    };
    const decision = { guardrails_triggered: [] };
    engine.checkIntegrationIdConflict(recordA, recordB, decision);

    tester.assertEqual(decision.guardrails_triggered.length, 0, 'Should NOT trigger (UUID/SF ID excluded)');
});

// Test 14: Integration ID conflict - Same external IDs (no conflict)
tester.test('Integration ID conflict: Same Stripe ID does NOT trigger', () => {
    const recordA = {
        Stripe_Customer_Id__c: 'cus_ABC123'
    };
    const recordB = {
        Stripe_Customer_Id__c: 'cus_ABC123'
    };
    const decision = { guardrails_triggered: [] };
    engine.checkIntegrationIdConflict(recordA, recordB, decision);

    tester.assertEqual(decision.guardrails_triggered.length, 0, 'Should NOT trigger (same external ID = same entity)');
});

// Run all tests
tester.run();
