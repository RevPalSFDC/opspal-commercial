/**
 * Flow Field Reference Validator Tests
 *
 * Tests for field validation, population checking, snapshot/diff, and duplicate detection
 *
 * @module flow-field-reference-validator.test
 * @created 2026-01-21
 */

const FlowFieldReferenceValidator = require('../flow-field-reference-validator');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Mock dependencies
jest.mock('fs');
jest.mock('child_process');
jest.mock('../field-usage-analyzer', () => {
    return jest.fn().mockImplementation(() => ({
        analyze: jest.fn().mockResolvedValue({
            exists: true,
            populationRate: 0.85,
            populationLevel: 'GOOD',
            alternatives: []
        })
    }));
});

describe('FlowFieldReferenceValidator', () => {
    let validator;
    const mockOrgAlias = 'test-org';

    beforeEach(() => {
        validator = new FlowFieldReferenceValidator(mockOrgAlias, { verbose: false });
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            const v = new FlowFieldReferenceValidator('my-org');
            expect(v.orgAlias).toBe('my-org');
            expect(v.checkPopulation).toBe(true);
            expect(v.checkPermissions).toBe(false);
            expect(v.checkPicklistValues).toBe(false);
            expect(v.checkRelationships).toBe(true);
        });

        test('should accept custom options', () => {
            const v = new FlowFieldReferenceValidator('my-org', {
                verbose: true,
                checkPermissions: true,
                checkPicklistValues: true,
                checkPopulation: false
            });
            expect(v.verbose).toBe(true);
            expect(v.checkPermissions).toBe(true);
            expect(v.checkPicklistValues).toBe(true);
            expect(v.checkPopulation).toBe(false);
        });

        test('should initialize empty stats', () => {
            const v = new FlowFieldReferenceValidator('my-org');
            expect(v.stats.totalValidations).toBe(0);
            expect(v.stats.passed).toBe(0);
            expect(v.stats.failed).toBe(0);
        });

        test('should accept custom population thresholds', () => {
            const v = new FlowFieldReferenceValidator('my-org', {
                populationErrorThreshold: 0.05,
                populationWarningThreshold: 0.20
            });
            expect(v.populationThresholds.ERROR).toBe(0.05);
            expect(v.populationThresholds.WARNING).toBe(0.20);
        });
    });

    describe('validate', () => {
        const validFlowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <recordLookups>
        <name>Get_Account</name>
        <object>Account</object>
        <filters>
            <field>Name</field>
            <operator>EqualTo</operator>
        </filters>
    </recordLookups>
</Flow>`;

        test('should return error for parse failure', async () => {
            fs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            const result = await validator.validate('/path/to/missing.flow-meta.xml');

            expect(result.valid).toBe(false);
            expect(result.errors[0].type).toBe('PARSE_ERROR');
        });

        test('should validate flow and extract field references', async () => {
            fs.readFileSync.mockReturnValue(validFlowXML);

            const result = await validator.validate('/path/to/Valid_Flow.flow-meta.xml');

            expect(result.flowName).toBe('Valid_Flow');
            expect(result.fieldReferences).toBeDefined();
            expect(validator.stats.totalValidations).toBe(1);
        });

        test('should track statistics', async () => {
            fs.readFileSync.mockReturnValue(validFlowXML);

            await validator.validate('/path/to/flow1.flow-meta.xml');
            await validator.validate('/path/to/flow2.flow-meta.xml');

            expect(validator.stats.totalValidations).toBe(2);
        });

        test('should reduce results to existence-only blockers', () => {
            const fullResult = {
                valid: false,
                errors: [
                    {
                        type: 'FIELD_NOT_FOUND',
                        object: 'Opportunity',
                        field: 'Missing__c',
                        message: 'Missing field'
                    },
                    {
                        type: 'UNPOPULATED_FIELD',
                        object: 'Opportunity',
                        field: 'Sparse__c',
                        message: 'Sparse field'
                    },
                    {
                        type: 'WRONG_OBJECT',
                        object: 'Opportunity',
                        field: 'ContractTerm',
                        message: 'Wrong object'
                    }
                ],
                warnings: [],
                suggestions: []
            };

            const filtered = validator.toExistenceOnlyResult(fullResult);

            expect(filtered.valid).toBe(false);
            expect(filtered.errors).toHaveLength(2);
            expect(filtered.errors.map(error => error.type)).toEqual(['FIELD_NOT_FOUND', 'WRONG_OBJECT']);
            expect(filtered.summary.fields).toEqual(expect.arrayContaining([
                'Opportunity.Missing__c',
                'Opportunity.ContractTerm'
            ]));
        });
    });

    describe('Field Confusion Detection', () => {
        test('should detect ContractTerm on Opportunity error', () => {
            const fieldRefs = [
                { field: 'ContractTerm', object: 'Opportunity', element: 'test', elementType: 'assignment' }
            ];

            const result = validator.checkFieldConfusions(fieldRefs);

            expect(result.errors.length).toBe(1);
            expect(result.errors[0].type).toBe('WRONG_OBJECT');
            expect(result.errors[0].message).toContain('Contract');
        });

        test('should suggest OwnerId for CreatedById assignments', () => {
            const fieldRefs = [
                { field: 'CreatedById', object: 'Account', element: 'test', elementType: 'assignment' }
            ];

            const result = validator.checkFieldConfusions(fieldRefs);

            expect(result.suggestions.length).toBe(1);
            expect(result.suggestions[0].type).toBe('BETTER_ALTERNATIVE');
            expect(result.suggestions[0].suggestion).toContain('OwnerId');
        });

        test('should suggest TotalPrice for Net_Price__c', () => {
            const fieldRefs = [
                { field: 'Net_Price__c', object: 'OpportunityLineItem', element: 'test', elementType: 'reference' }
            ];

            const result = validator.checkFieldConfusions(fieldRefs);

            expect(result.suggestions.length).toBe(1);
            expect(result.suggestions[0].type).toBe('STANDARD_ALTERNATIVE');
            expect(result.suggestions[0].suggestion).toContain('TotalPrice');
        });

        test('should not flag valid field references', () => {
            const fieldRefs = [
                { field: 'Name', object: 'Account', element: 'test', elementType: 'reference' },
                { field: 'Amount', object: 'Opportunity', element: 'test', elementType: 'reference' }
            ];

            const result = validator.checkFieldConfusions(fieldRefs);

            expect(result.errors.length).toBe(0);
            expect(result.suggestions.length).toBe(0);
        });
    });

    describe('extractFieldReferences', () => {
        test('should extract field references from recordLookups', async () => {
            const flowXml = {
                Flow: {
                    recordLookups: [{
                        name: ['Get_Records'],
                        object: ['Account'],
                        filters: [{
                            field: ['Name']
                        }]
                    }]
                }
            };

            const refs = validator.extractFieldReferences(flowXml);

            expect(refs.length).toBeGreaterThan(0);
        });
    });

    describe('Levenshtein Distance', () => {
        test('should calculate correct distance for identical strings', () => {
            expect(validator.levenshteinDistance('test', 'test')).toBe(0);
        });

        test('should calculate correct distance for single character difference', () => {
            expect(validator.levenshteinDistance('test', 'tast')).toBe(1);
        });

        test('should calculate correct distance for different lengths', () => {
            expect(validator.levenshteinDistance('test', 'testing')).toBe(3);
        });

        test('should calculate correct distance for completely different strings', () => {
            expect(validator.levenshteinDistance('abc', 'xyz')).toBe(3);
        });
    });

    describe('findSimilarPicklistValues', () => {
        test('should find case-insensitive matches', () => {
            const validValues = ['Active', 'Inactive', 'Pending'];
            const similar = validator.findSimilarPicklistValues('active', validValues);

            // 'active' matches both 'Active' (case mismatch) and 'Inactive' (partial match)
            expect(similar.length).toBeGreaterThanOrEqual(1);
            // First match should be case mismatch
            expect(similar.some(s => s.value === 'Active' && s.reason === 'case mismatch')).toBe(true);
        });

        test('should find partial matches', () => {
            const validValues = ['New Customer', 'Returning Customer', 'VIP Customer'];
            const similar = validator.findSimilarPicklistValues('customer', validValues);

            expect(similar.length).toBe(3);
            expect(similar.every(s => s.reason === 'partial match')).toBe(true);
        });

        test('should find similar spellings', () => {
            const validValues = ['Prospect', 'Customer', 'Partner'];
            const similar = validator.findSimilarPicklistValues('Prosepct', validValues);

            expect(similar.length).toBeGreaterThan(0);
        });

        test('should limit to 5 suggestions', () => {
            const validValues = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];
            const similar = validator.findSimilarPicklistValues('a', validValues);

            expect(similar.length).toBeLessThanOrEqual(5);
        });
    });

    describe('Snapshot and Diff (Phase 2.2)', () => {
        const sampleFlowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <recordUpdates>
        <name>Update_Account</name>
        <object>Account</object>
        <inputAssignments>
            <field>Description</field>
            <value><stringValue>Test</stringValue></value>
        </inputAssignments>
    </recordUpdates>
</Flow>`;

        test('should create snapshot with checksum', async () => {
            fs.readFileSync.mockReturnValue(sampleFlowXML);

            const snapshot = await validator.createSnapshot('/path/to/flow.flow-meta.xml');

            expect(snapshot.timestamp).toBeDefined();
            expect(snapshot.flowName).toBe('flow');
            expect(snapshot.checksum).toBeDefined();
            expect(snapshot.fieldReferences).toBeDefined();
            expect(snapshot.fieldAssignments).toBeDefined();
        });

        test('should detect no changes when identical', async () => {
            fs.readFileSync.mockReturnValue(sampleFlowXML);

            const snapshot = await validator.createSnapshot('/path/to/flow.flow-meta.xml');

            // Reset mock for comparison
            fs.readFileSync.mockReturnValue(sampleFlowXML);

            const diff = await validator.compareWithSnapshot('/path/to/flow.flow-meta.xml', snapshot);

            expect(diff.hasChanges).toBe(false);
            expect(diff.checksumChanged).toBe(false);
        });

        test('should detect changes when content differs', async () => {
            fs.readFileSync.mockReturnValue(sampleFlowXML);
            const snapshot = await validator.createSnapshot('/path/to/flow.flow-meta.xml');

            // Modified flow
            const modifiedFlowXML = sampleFlowXML.replace('Test', 'Modified');
            fs.readFileSync.mockReturnValue(modifiedFlowXML);

            const diff = await validator.compareWithSnapshot('/path/to/flow.flow-meta.xml', snapshot);

            expect(diff.checksumChanged).toBe(true);
        });
    });

    describe('Duplicate Assignment Detection (Phase 2.2)', () => {
        test('should detect duplicate field assignments', async () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <recordUpdates>
        <name>Update_1</name>
        <inputAssignments>
            <field>Status</field>
            <value><stringValue>Active</stringValue></value>
        </inputAssignments>
    </recordUpdates>
    <recordUpdates>
        <name>Update_2</name>
        <inputAssignments>
            <field>Status</field>
            <value><stringValue>Inactive</stringValue></value>
        </inputAssignments>
    </recordUpdates>
</Flow>`;

            fs.readFileSync.mockReturnValue(flowXML);

            const result = await validator.analyzeFieldAssignments('/path/to/flow.flow-meta.xml');

            expect(result.duplicates.length).toBeGreaterThan(0);
            expect(result.duplicates[0].field).toBe('Status');
        });

        test('should detect sequential duplicates within same element', async () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <recordUpdates>
        <name>Update_Account</name>
        <inputAssignments>
            <field>Name</field>
            <value><stringValue>First</stringValue></value>
        </inputAssignments>
        <inputAssignments>
            <field>Name</field>
            <value><stringValue>Second</stringValue></value>
        </inputAssignments>
    </recordUpdates>
</Flow>`;

            fs.readFileSync.mockReturnValue(flowXML);

            const result = await validator.analyzeFieldAssignments('/path/to/flow.flow-meta.xml');

            expect(result.sequentialDuplicates.length).toBeGreaterThan(0);
        });

        test('should detect conflicting values', async () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <recordUpdates>
        <name>Update_1</name>
        <inputAssignments>
            <field>Priority</field>
            <value><stringValue>High</stringValue></value>
        </inputAssignments>
    </recordUpdates>
    <recordUpdates>
        <name>Update_2</name>
        <inputAssignments>
            <field>Priority</field>
            <value><stringValue>Low</stringValue></value>
        </inputAssignments>
    </recordUpdates>
</Flow>`;

            fs.readFileSync.mockReturnValue(flowXML);

            const result = await validator.analyzeFieldAssignments('/path/to/flow.flow-meta.xml');

            expect(result.conflictingValues.length).toBeGreaterThan(0);
        });

        test('should generate recommendations for duplicates', async () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <recordUpdates>
        <name>Update_1</name>
        <inputAssignments>
            <field>Status</field>
            <value><stringValue>Active</stringValue></value>
        </inputAssignments>
    </recordUpdates>
    <recordUpdates>
        <name>Update_2</name>
        <inputAssignments>
            <field>Status</field>
            <value><stringValue>Active</stringValue></value>
        </inputAssignments>
    </recordUpdates>
</Flow>`;

            fs.readFileSync.mockReturnValue(flowXML);

            const result = await validator.analyzeFieldAssignments('/path/to/flow.flow-meta.xml');

            expect(result.recommendations.length).toBeGreaterThan(0);
            expect(result.severity).not.toBe('NONE');
        });

        test('should return NONE severity when no duplicates', async () => {
            const flowXML = `<?xml version="1.0" encoding="UTF-8"?>
<Flow>
    <recordUpdates>
        <name>Update_Account</name>
        <inputAssignments>
            <field>Name</field>
            <value><stringValue>Test</stringValue></value>
        </inputAssignments>
        <inputAssignments>
            <field>Description</field>
            <value><stringValue>Description</stringValue></value>
        </inputAssignments>
    </recordUpdates>
</Flow>`;

            fs.readFileSync.mockReturnValue(flowXML);

            const result = await validator.analyzeFieldAssignments('/path/to/flow.flow-meta.xml');

            expect(result.severity).toBe('NONE');
        });
    });

    describe('Population Report (Phase 3.3)', () => {
        beforeEach(() => {
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('COUNT()') && cmd.includes('!= null')) {
                    return JSON.stringify({ status: 0, result: { totalSize: 850 } });
                } else if (cmd.includes('COUNT()')) {
                    return JSON.stringify({ status: 0, result: { totalSize: 1000 } });
                } else if (cmd.includes('sobject describe')) {
                    return JSON.stringify({
                        status: 0,
                        result: {
                            fields: [
                                { name: 'Name', type: 'string', label: 'Name' },
                                { name: 'Industry', type: 'picklist', label: 'Industry' }
                            ]
                        }
                    });
                }
                return JSON.stringify({ status: 0, result: {} });
            });
        });

        test('should generate population report for fields', async () => {
            const fields = ['Account.Name', 'Account.Industry'];

            const report = await validator.generatePopulationReport('test-org', fields);

            expect(report.fieldsAnalyzed).toBe(2);
            expect(report.timestamp).toBeDefined();
            expect(report.summary).toBeDefined();
        });

        test('should classify fields by population rate', async () => {
            // Mock low population
            execSync.mockImplementation((cmd) => {
                if (cmd.includes('COUNT()') && cmd.includes('!= null')) {
                    return JSON.stringify({ status: 0, result: { totalSize: 5 } }); // 0.5%
                } else if (cmd.includes('COUNT()')) {
                    return JSON.stringify({ status: 0, result: { totalSize: 1000 } });
                }
                return JSON.stringify({ status: 0, result: {} });
            });

            const fields = ['Account.LowField'];
            const report = await validator.generatePopulationReport('test-org', fields);

            expect(report.summary.errors.length).toBeGreaterThan(0);
        });

        test('should return empty report for no fields', async () => {
            const report = await validator.generatePopulationReport('test-org', []);

            expect(report.fieldsAnalyzed).toBe(0);
            expect(report.summary.info.length).toBeGreaterThan(0);
        });

        test('should generate recommendations', async () => {
            const fields = ['Account.Name'];
            const report = await validator.generatePopulationReport('test-org', fields);

            expect(report.recommendations).toBeDefined();
            expect(report.recommendations.length).toBeGreaterThan(0);
        });

        test('should track execution time', async () => {
            const fields = ['Account.Name'];
            const report = await validator.generatePopulationReport('test-org', fields);

            expect(report.metadata.executionTime).toBeDefined();
            expect(report.metadata.executionTime).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Batch Field Describe', () => {
        test('should batch describe fields by object', async () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: {
                    fields: [
                        { name: 'Name', type: 'string', updateable: true, createable: true },
                        { name: 'Industry', type: 'picklist', updateable: true, createable: true, picklistValues: [{ value: 'Tech' }] }
                    ]
                }
            }));

            const fieldRefs = [
                { object: 'Account', field: 'Name' },
                { object: 'Account', field: 'Industry' }
            ];

            validator.checkPermissions = true;
            await validator.batchDescribeFields(fieldRefs);

            // Should have cached the fields
            expect(validator.fieldCache.has('Account.Name')).toBe(true);
            expect(validator.fieldCache.has('Account.Industry')).toBe(true);
        });

        test('should cache picklist values', async () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: {
                    fields: [
                        {
                            name: 'Status',
                            type: 'picklist',
                            picklistValues: [
                                { value: 'Open' },
                                { value: 'Closed' }
                            ]
                        }
                    ]
                }
            }));

            const fieldRefs = [{ object: 'Case', field: 'Status' }];
            await validator.batchDescribeFields(fieldRefs);

            expect(validator.picklistCache.has('Case.Status')).toBe(true);
            expect(validator.picklistCache.get('Case.Status')).toContain('Open');
        });
    });

    describe('Permission Validation', () => {
        test('should validate field permissions from cache', async () => {
            validator.fieldCache.set('Account.Name', {
                updateable: true,
                createable: true,
                calculated: false
            });

            const result = await validator.validateFieldPermissions('Account', 'Name');

            expect(result.valid).toBe(true);
            expect(result.writable).toBe(true);
        });

        test('should report non-writable fields', async () => {
            validator.fieldCache.set('Account.CreatedDate', {
                updateable: false,
                createable: false,
                calculated: true
            });

            const result = await validator.validateFieldPermissions('Account', 'CreatedDate');

            expect(result.valid).toBe(false);
            expect(result.writable).toBe(false);
        });

        test('should fetch field describe if not cached', async () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: {
                    fields: [
                        { name: 'Name', updateable: true, createable: true }
                    ]
                }
            }));

            const result = await validator.validateFieldPermissions('Account', 'Name');

            expect(result.valid).toBe(true);
            expect(execSync).toHaveBeenCalled();
        });
    });

    describe('Picklist Value Validation', () => {
        test('should validate picklist value from cache', async () => {
            validator.picklistCache.set('Account.Type', ['Customer', 'Prospect', 'Partner']);

            const result = await validator.validatePicklistValue('Account', 'Type', 'Customer');

            expect(result.valid).toBe(true);
        });

        test('should reject invalid picklist value', async () => {
            validator.picklistCache.set('Account.Type', ['Customer', 'Prospect', 'Partner']);

            const result = await validator.validatePicklistValue('Account', 'Type', 'InvalidValue');

            expect(result.valid).toBe(false);
            expect(result.suggestions).toBeDefined();
        });

        test('should suggest similar values for typos', async () => {
            validator.picklistCache.set('Account.Type', ['Customer', 'Prospect', 'Partner']);

            const result = await validator.validatePicklistValue('Account', 'Type', 'custmer');

            expect(result.valid).toBe(false);
            expect(result.suggestions.length).toBeGreaterThan(0);
        });
    });

    describe('Relationship Path Validation', () => {
        test('should validate simple relationship path', async () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: {
                    fields: [
                        { name: 'AccountId', relationshipName: 'Account', referenceTo: ['Account'] }
                    ]
                }
            }));

            // Mock the field usage analyzer for the final field
            validator.usageAnalyzer.analyze.mockResolvedValue({
                exists: true,
                populationRate: 0.9
            });

            const result = await validator.validateRelationshipPath('Account.Name', 'Contact');

            expect(result.valid).toBe(true);
        });

        test('should detect broken relationship', async () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: {
                    fields: [] // No relationship found
                }
            }));

            const result = await validator.validateRelationshipPath('NonExistent.Field', 'Contact');

            expect(result.valid).toBe(false);
            expect(result.brokenAt).toBeDefined();
        });

        test('should skip validation for non-relationship paths', async () => {
            const result = await validator.validateRelationshipPath('Name', 'Account');

            expect(result.valid).toBe(true);
            expect(result.message).toContain('Not a relationship path');
        });
    });

    describe('Statistics', () => {
        test('should provide combined stats', async () => {
            validator.stats.totalValidations = 10;
            validator.stats.passed = 8;
            validator.stats.failed = 2;

            const stats = validator.getStats();

            expect(stats.totalValidations).toBe(10);
            expect(stats.passed).toBe(8);
            expect(stats.successRate).toBe('80.0%');
        });

        test('should handle N/A success rate', () => {
            const stats = validator.getStats();
            expect(stats.successRate).toBe('N/A');
        });
    });

    describe('Value Type Detection', () => {
        test('should detect string value type', () => {
            const value = { stringValue: ['test'] };
            expect(validator._getValueType(value)).toBe('string');
        });

        test('should detect reference value type', () => {
            const value = { elementReference: ['varName'] };
            expect(validator._getValueType(value)).toBe('reference');
        });

        test('should detect number value type', () => {
            const value = { numberValue: ['123'] };
            expect(validator._getValueType(value)).toBe('number');
        });

        test('should detect boolean value type', () => {
            const value = { booleanValue: ['true'] };
            expect(validator._getValueType(value)).toBe('boolean');
        });

        test('should return unknown for null', () => {
            expect(validator._getValueType(null)).toBe('unknown');
        });
    });

    describe('Integration Scenarios', () => {
        test('should handle real-world flow with multiple field types', async () => {
            const complexFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <recordLookups>
        <name>Get_Account</name>
        <object>Account</object>
        <filters>
            <field>Name</field>
            <operator>EqualTo</operator>
        </filters>
        <queriedFields>Industry</queriedFields>
        <queriedFields>Type</queriedFields>
    </recordLookups>
    <recordUpdates>
        <name>Update_Account</name>
        <object>Account</object>
        <inputAssignments>
            <field>Description</field>
            <value><stringValue>Updated by Flow</stringValue></value>
        </inputAssignments>
    </recordUpdates>
    <assignments>
        <name>Set_Variables</name>
        <assignmentItems>
            <assignToReference>varAccountName</assignToReference>
            <operator>Assign</operator>
            <value><elementReference>Get_Account.Name</elementReference></value>
        </assignmentItems>
    </assignments>
</Flow>`;

            fs.readFileSync.mockReturnValue(complexFlow);

            const result = await validator.validate('/path/to/Complex_Flow.flow-meta.xml');

            expect(result.flowName).toBe('Complex_Flow');
            expect(result.fieldReferences.length).toBeGreaterThan(0);
        });

        test('should detect ContractTerm misuse in Opportunity flow', async () => {
            const problematicFlow = `<?xml version="1.0" encoding="UTF-8"?>
<Flow xmlns="http://soap.sforce.com/2006/04/metadata">
    <recordUpdates>
        <name>Update_Opp</name>
        <object>Opportunity</object>
        <inputAssignments>
            <field>ContractTerm</field>
            <value><numberValue>12</numberValue></value>
        </inputAssignments>
    </recordUpdates>
</Flow>`;

            fs.readFileSync.mockReturnValue(problematicFlow);

            // Mock field analyzer to say field doesn't exist
            validator.usageAnalyzer.analyze.mockResolvedValue({
                exists: false,
                alternatives: ['Contract_Term_Months__c']
            });

            const result = await validator.validate('/path/to/Bad_Flow.flow-meta.xml');

            // Should have errors for non-existent field
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });
});

describe('CLI Entry Point', () => {
    const runCliTests = process.env.RUN_FLOW_CLI_TESTS === 'true';
    const cliTest = runCliTests ? test : test.skip;

    cliTest('should show help with --help flag', () => {
        // Would test CLI behavior
    });

    cliTest('should validate flow with validate command', () => {
        // Would test CLI behavior
    });
});
