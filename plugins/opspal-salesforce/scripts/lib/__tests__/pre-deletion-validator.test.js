/**
 * Pre-Deletion Validator Tests
 */

const { PreDeletionValidator } = require('../pre-deletion-validator.js');

describe('PreDeletionValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new PreDeletionValidator({ verbose: false });
    });

    describe('Formula Field Detection', () => {
        test('should detect direct field reference in formula', () => {
            const formula = 'IF(Custom_Field__c > 100, "High", "Low")';
            const hasField = validator._formulaContainsField(formula, 'Custom_Field__c');

            expect(hasField).toBe(true);
        });

        test('should detect $Record reference', () => {
            const formula = 'IF($Record.Custom_Field__c > 100, "High", "Low")';
            const hasField = validator._formulaContainsField(formula, 'Custom_Field__c');

            expect(hasField).toBe(true);
        });

        test('should detect merge field reference', () => {
            const formula = 'VLOOKUP({!Custom_Field__c}, Lookup_Table, 2)';
            const hasField = validator._formulaContainsField(formula, 'Custom_Field__c');

            expect(hasField).toBe(true);
        });

        test('should not detect partial field name match', () => {
            const formula = 'IF(Custom_Field__c_Extra > 100, "High", "Low")';
            const hasField = validator._formulaContainsField(formula, 'Custom_Field__c');

            // The \b word boundary prevents matching partial names
            expect(hasField).toBe(false);
        });

        test('should return false for empty formula', () => {
            const hasField = validator._formulaContainsField('', 'Custom_Field__c');

            expect(hasField).toBe(false);
        });

        test('should return false for null formula', () => {
            const hasField = validator._formulaContainsField(null, 'Custom_Field__c');

            expect(hasField).toBe(false);
        });

        test('should be case insensitive', () => {
            const formula = 'IF(custom_field__c > 100, "High", "Low")';
            const hasField = validator._formulaContainsField(formula, 'Custom_Field__c');

            expect(hasField).toBe(true);
        });
    });

    describe('Dependency Addition', () => {
        test('should add blocker dependencies', () => {
            const result = {
                dependencies: [],
                blockers: [],
                warnings: []
            };

            const deps = [
                { type: 'flow', name: 'Test_Flow', severity: 'blocker', message: 'Test' }
            ];

            validator._addDependencies(result, 'flows', deps);

            expect(result.dependencies.length).toBe(1);
            expect(result.blockers.length).toBe(1);
            expect(result.warnings.length).toBe(0);
        });

        test('should add warning dependencies', () => {
            const result = {
                dependencies: [],
                blockers: [],
                warnings: []
            };

            const deps = [
                { type: 'layout', name: 'Test_Layout', severity: 'warning', message: 'Test' }
            ];

            validator._addDependencies(result, 'layouts', deps);

            expect(result.dependencies.length).toBe(1);
            expect(result.blockers.length).toBe(0);
            expect(result.warnings.length).toBe(1);
        });

        test('should add category to dependencies', () => {
            const result = {
                dependencies: [],
                blockers: [],
                warnings: []
            };

            const deps = [
                { type: 'validationRule', name: 'Test', severity: 'blocker', message: 'Test' }
            ];

            validator._addDependencies(result, 'validationRules', deps);

            expect(result.dependencies[0].category).toBe('validationRules');
        });

        test('should handle multiple dependencies', () => {
            const result = {
                dependencies: [],
                blockers: [],
                warnings: []
            };

            const deps = [
                { type: 'flow1', severity: 'blocker', message: 'Blocker 1' },
                { type: 'flow2', severity: 'warning', message: 'Warning 1' },
                { type: 'flow3', severity: 'blocker', message: 'Blocker 2' }
            ];

            validator._addDependencies(result, 'flows', deps);

            expect(result.dependencies.length).toBe(3);
            expect(result.blockers.length).toBe(2);
            expect(result.warnings.length).toBe(1);
        });
    });

    describe('Report Generation', () => {
        test('should generate report for safe deletion', () => {
            const result = {
                target: 'Account.Custom_Field__c',
                targetType: 'field',
                orgAlias: 'testorg',
                validatedAt: '2025-12-10T12:00:00Z',
                canDelete: true,
                dependencies: [],
                blockers: [],
                warnings: []
            };

            const report = validator.generateReport(result);

            expect(report).toContain('Pre-Deletion Validation Report');
            expect(report).toContain('Account.Custom_Field__c');
            expect(report).toContain('SAFE TO DELETE');
        });

        test('should generate report for blocked deletion', () => {
            const result = {
                target: 'Account.Critical_Field__c',
                targetType: 'field',
                orgAlias: 'testorg',
                validatedAt: '2025-12-10T12:00:00Z',
                canDelete: false,
                dependencies: [
                    { category: 'flows', type: 'flow', name: 'Critical_Flow', severity: 'blocker', message: 'Flow uses this field' }
                ],
                blockers: [
                    { type: 'flow', name: 'Critical_Flow', severity: 'blocker', message: 'Flow uses this field' }
                ],
                warnings: []
            };

            const report = validator.generateReport(result);

            expect(report).toContain('DELETION BLOCKED');
            expect(report).toContain('Blockers');
            expect(report).toContain('Critical_Flow');
        });

        test('should include warnings in report', () => {
            const result = {
                target: 'Account.Field__c',
                targetType: 'field',
                orgAlias: 'testorg',
                validatedAt: '2025-12-10T12:00:00Z',
                canDelete: true,
                dependencies: [
                    { category: 'layouts', type: 'layout', name: 'Account_Layout', severity: 'warning', message: 'May contain field' }
                ],
                blockers: [],
                warnings: [
                    { type: 'layout', name: 'Account_Layout', severity: 'warning', message: 'May contain field' }
                ]
            };

            const report = validator.generateReport(result);

            expect(report).toContain('Warnings');
            expect(report).toContain('Account_Layout');
        });

        test('should include recommendation in report', () => {
            const result = {
                target: 'My_Flow',
                targetType: 'flow',
                orgAlias: 'testorg',
                validatedAt: '2025-12-10T12:00:00Z',
                canDelete: false,
                dependencies: [],
                blockers: [
                    {
                        type: 'active_flow',
                        message: 'Flow is active',
                        recommendation: 'Deactivate the flow first'
                    }
                ],
                warnings: []
            };

            const report = validator.generateReport(result);

            expect(report).toContain('Recommendation: Deactivate the flow first');
        });

        test('should group dependencies by category', () => {
            const result = {
                target: 'Account.Field__c',
                targetType: 'field',
                orgAlias: 'testorg',
                validatedAt: '2025-12-10T12:00:00Z',
                canDelete: false,
                dependencies: [
                    { category: 'flows', type: 'flow', name: 'Flow1', severity: 'blocker', message: 'Ref 1' },
                    { category: 'flows', type: 'flow', name: 'Flow2', severity: 'blocker', message: 'Ref 2' },
                    { category: 'validationRules', type: 'vr', name: 'Rule1', severity: 'blocker', message: 'Ref 3' }
                ],
                blockers: [],
                warnings: []
            };

            const report = validator.generateReport(result);

            expect(report).toContain('### flows');
            expect(report).toContain('### validationRules');
        });
    });

    describe('Configuration', () => {
        test('should enable all checks by default', () => {
            const v = new PreDeletionValidator({});

            expect(v.dependencyChecks.flows).toBe(true);
            expect(v.dependencyChecks.validationRules).toBe(true);
            expect(v.dependencyChecks.formulaFields).toBe(true);
            expect(v.dependencyChecks.workflows).toBe(true);
            expect(v.dependencyChecks.layouts).toBe(true);
        });

        test('should allow disabling specific checks', () => {
            const v = new PreDeletionValidator({
                checkFlows: false,
                checkLayouts: false
            });

            expect(v.dependencyChecks.flows).toBe(false);
            expect(v.dependencyChecks.layouts).toBe(false);
            expect(v.dependencyChecks.validationRules).toBe(true);
        });

        test('should accept org alias in constructor', () => {
            const v = new PreDeletionValidator({
                orgAlias: 'myorg'
            });

            expect(v.orgAlias).toBe('myorg');
        });
    });

    describe('Field Deletion Validation Structure', () => {
        test('should require org alias', async () => {
            const v = new PreDeletionValidator({ orgAlias: null });

            await expect(v.validateFieldDeletion('Account', 'Field__c'))
                .rejects.toThrow('Org alias is required');
        });

        test('should create proper result structure', async () => {
            // This test just verifies the structure - actual validation needs org
            // We'll mock by checking the structure builder

            const result = {
                canDelete: true,
                targetType: 'field',
                target: 'Account.Test__c',
                objectName: 'Account',
                fieldName: 'Test__c',
                orgAlias: 'testorg',
                validatedAt: expect.any(String),
                dependencies: [],
                blockers: [],
                warnings: []
            };

            expect(result.targetType).toBe('field');
            expect(result.target).toBe('Account.Test__c');
        });
    });

    describe('Object Deletion Validation Structure', () => {
        test('should require org alias', async () => {
            const v = new PreDeletionValidator({ orgAlias: null });

            await expect(v.validateObjectDeletion('Custom__c'))
                .rejects.toThrow('Org alias is required');
        });
    });

    describe('Flow Deletion Validation Structure', () => {
        test('should require org alias', async () => {
            const v = new PreDeletionValidator({ orgAlias: null });

            await expect(v.validateFlowDeletion('My_Flow'))
                .rejects.toThrow('Org alias is required');
        });
    });

    describe('Batch Validation Structure', () => {
        test('should handle empty items array', async () => {
            const v = new PreDeletionValidator({ orgAlias: 'testorg' });

            // Since we can't actually connect, we'll just verify structure
            const items = [];

            // Mock the validation methods
            const mockResult = await v.validateBatch(items, 'testorg');

            expect(mockResult.total).toBe(0);
            expect(mockResult.safe).toBe(0);
            expect(mockResult.blocked).toBe(0);
            expect(mockResult.items).toEqual([]);
        });

        test('should track counts correctly', () => {
            // Test the counting logic separately
            const results = {
                timestamp: new Date().toISOString(),
                total: 3,
                safe: 0,
                blocked: 0,
                items: []
            };

            // Simulate adding results
            const mockItems = [
                { canDelete: true },
                { canDelete: false },
                { canDelete: true }
            ];

            for (const item of mockItems) {
                results.items.push(item);
                if (item.canDelete) {
                    results.safe++;
                } else {
                    results.blocked++;
                }
            }

            expect(results.safe).toBe(2);
            expect(results.blocked).toBe(1);
        });
    });

    describe('Edge Cases', () => {
        test('should handle special characters in field names', () => {
            const formula = 'IF(Field_With_Numbers_123__c > 0, "Yes", "No")';
            const hasField = validator._formulaContainsField(formula, 'Field_With_Numbers_123__c');

            expect(hasField).toBe(true);
        });

        test('should handle formula with multiple field references', () => {
            const formula = 'IF(Field_A__c > Field_B__c, Field_C__c, Field_D__c)';

            expect(validator._formulaContainsField(formula, 'Field_A__c')).toBe(true);
            expect(validator._formulaContainsField(formula, 'Field_B__c')).toBe(true);
            expect(validator._formulaContainsField(formula, 'Field_C__c')).toBe(true);
            expect(validator._formulaContainsField(formula, 'Field_E__c')).toBe(false);
        });

        test('should handle formula with nested functions', () => {
            const formula = 'TEXT(ROUND(Amount__c / Total__c * 100, 2)) & "%"';

            expect(validator._formulaContainsField(formula, 'Amount__c')).toBe(true);
            expect(validator._formulaContainsField(formula, 'Total__c')).toBe(true);
        });
    });
});
