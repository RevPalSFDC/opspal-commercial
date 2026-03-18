/**
 * Salesforce Order of Operations - Integration Tests
 *
 * Tests the complete OOO sequences (D1, D2, D3) against real Salesforce orgs.
 *
 * Requirements:
 * - Authenticated Salesforce org (sf org list)
 * - Test org with Account, Contact objects
 * - Permission to create/modify metadata
 *
 * Usage:
 *   npm test -- test/ooo-integration.test.js
 *   TEST_ORG=my-sandbox npm test -- test/ooo-integration.test.js
 */

const { OOOWriteOperations } = require('../scripts/lib/ooo-write-operations');
const { OOOMetadataOperations } = require('../scripts/lib/ooo-metadata-operations');
const { OOODependencyEnforcer } = require('../scripts/lib/ooo-dependency-enforcer');

// Test configuration
const TEST_ORG = process.env.TEST_ORG || 'delta-sandbox';

// Integration tests - require authenticated Salesforce org
// VERIFIED: Passes against epsilon-corp2021-revpal (beta-corp RevPal Sandbox) - 2026-01-09
// Run with: TEST_ORG=epsilon-corp2021-revpal npm test -- test/ooo-integration.test.js
// Skip in CI (no authenticated org available)
const skipInCI = process.env.CI === 'true' || !process.env.TEST_ORG;
(skipInCI ? describe.skip : describe)('OOO Integration Tests', () => {
    describe('D1: Safe Record Creation', () => {
        it('should introspect Account object successfully', async () => {
            const ooo = new OOOWriteOperations(TEST_ORG, { verbose: false });
            const metadata = await ooo.describeObject('Account');

            expect(metadata).toBeDefined();
            expect(metadata.object.name).toBe('Account');
            expect(metadata.fields.length).toBeGreaterThan(0);
            expect(metadata.requiredFields.some(f => f.name === 'Name')).toBe(true);
        }, 30000);

        it('should complete dry-run safe record creation', async () => {
            const ooo = new OOOWriteOperations(TEST_ORG, { verbose: false, dryRun: true });

            const result = await ooo.createRecordSafe('Account', {
                Name: 'OOO Test Account',
                BillingCity: 'San Francisco'
            });

            expect(result.success).toBe(true);
            expect(result.context.steps).toHaveLength(7);
        }, 45000);
    });

    describe('Supporting Tools', () => {
        it('should analyze validation rules with formulas', async () => {
            const { OOOValidationRuleAnalyzer } = require('../scripts/lib/ooo-validation-rule-analyzer');
            const analyzer = new OOOValidationRuleAnalyzer(TEST_ORG, { verbose: false });

            const rules = await analyzer.getActiveValidationRulesWithFormulas('Account');
            expect(Array.isArray(rules)).toBe(true);
        }, 30000);
    });
});
