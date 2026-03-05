/**
 * Tool Contract Validator Tests
 */

const { ToolContractValidator, ContractTemplates } = require('../tool-contract-validator.js');

describe('ToolContractValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new ToolContractValidator({ verbose: false, strictMode: true });
    });

    describe('Contract Registration', () => {
        test('should register a valid contract', () => {
            validator.registerContract('test-tool', {
                input: { type: 'object' },
                output: { type: 'object' }
            });

            expect(validator.getContract('test-tool')).not.toBeNull();
        });

        test('should list registered contracts', () => {
            validator.registerContract('tool-a', { input: {} });
            validator.registerContract('tool-b', { output: {} });

            const contracts = validator.listContracts();
            expect(contracts).toContain('tool-a');
            expect(contracts).toContain('tool-b');
        });

        test('should support method chaining', () => {
            const result = validator
                .registerContract('tool-a', {})
                .registerContract('tool-b', {});

            expect(result).toBe(validator);
        });
    });

    describe('Type Validation', () => {
        beforeEach(() => {
            validator.registerContract('typed-tool', {
                output: {
                    type: 'object',
                    properties: {
                        stringField: { type: 'string' },
                        numberField: { type: 'number' },
                        boolField: { type: 'boolean' },
                        arrayField: { type: 'array' },
                        objectField: { type: 'object' }
                    }
                }
            });
        });

        test('should validate correct types', () => {
            const result = validator.validateOutput('typed-tool', {
                stringField: 'hello',
                numberField: 42,
                boolField: true,
                arrayField: [1, 2, 3],
                objectField: { key: 'value' }
            });

            expect(result.valid).toBe(true);
        });

        test('should reject incorrect string type', () => {
            const result = validator.validateOutput('typed-tool', {
                stringField: 123 // Should be string
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('stringField'))).toBe(true);
        });

        test('should reject incorrect number type', () => {
            const result = validator.validateOutput('typed-tool', {
                numberField: 'not a number'
            });

            expect(result.valid).toBe(false);
        });

        test('should reject incorrect array type', () => {
            const result = validator.validateOutput('typed-tool', {
                arrayField: 'not an array'
            });

            expect(result.valid).toBe(false);
        });
    });

    describe('Required Fields', () => {
        beforeEach(() => {
            validator.registerContract('required-tool', {
                output: {
                    type: 'object',
                    required: ['id', 'name'],
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        optional: { type: 'string' }
                    }
                }
            });
        });

        test('should pass when all required fields present', () => {
            const result = validator.validateOutput('required-tool', {
                id: '123',
                name: 'Test'
            });

            expect(result.valid).toBe(true);
        });

        test('should fail when required field missing', () => {
            const result = validator.validateOutput('required-tool', {
                id: '123'
                // missing name
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('name'))).toBe(true);
        });

        test('should pass with optional fields missing', () => {
            const result = validator.validateOutput('required-tool', {
                id: '123',
                name: 'Test'
                // optional is not required
            });

            expect(result.valid).toBe(true);
        });
    });

    describe('String Validation', () => {
        beforeEach(() => {
            validator.registerContract('string-tool', {
                output: {
                    type: 'object',
                    properties: {
                        short: { type: 'string', maxLength: 10 },
                        long: { type: 'string', minLength: 5 },
                        pattern: { type: 'string', pattern: '^[A-Z]+$' },
                        enumVal: { type: 'string', enum: ['a', 'b', 'c'] }
                    }
                }
            });
        });

        test('should validate maxLength', () => {
            const valid = validator.validateOutput('string-tool', { short: 'hello' });
            const invalid = validator.validateOutput('string-tool', { short: 'this is too long' });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });

        test('should validate minLength', () => {
            const valid = validator.validateOutput('string-tool', { long: 'hello world' });
            const invalid = validator.validateOutput('string-tool', { long: 'hi' });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });

        test('should validate pattern', () => {
            const valid = validator.validateOutput('string-tool', { pattern: 'ABC' });
            const invalid = validator.validateOutput('string-tool', { pattern: 'abc123' });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });

        test('should validate enum', () => {
            const valid = validator.validateOutput('string-tool', { enumVal: 'a' });
            const invalid = validator.validateOutput('string-tool', { enumVal: 'd' });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });
    });

    describe('Number Validation', () => {
        beforeEach(() => {
            validator.registerContract('number-tool', {
                output: {
                    type: 'object',
                    properties: {
                        bounded: { type: 'number', minimum: 0, maximum: 100 },
                        exclusive: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 }
                    }
                }
            });
        });

        test('should validate minimum/maximum', () => {
            const valid = validator.validateOutput('number-tool', { bounded: 50 });
            const tooLow = validator.validateOutput('number-tool', { bounded: -1 });
            const tooHigh = validator.validateOutput('number-tool', { bounded: 101 });

            expect(valid.valid).toBe(true);
            expect(tooLow.valid).toBe(false);
            expect(tooHigh.valid).toBe(false);
        });

        test('should validate exclusive bounds', () => {
            const valid = validator.validateOutput('number-tool', { exclusive: 5 });
            const atMin = validator.validateOutput('number-tool', { exclusive: 0 });
            const atMax = validator.validateOutput('number-tool', { exclusive: 10 });

            expect(valid.valid).toBe(true);
            expect(atMin.valid).toBe(false);
            expect(atMax.valid).toBe(false);
        });
    });

    describe('Array Validation', () => {
        beforeEach(() => {
            validator.registerContract('array-tool', {
                output: {
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 1,
                            maxItems: 5
                        }
                    }
                }
            });
        });

        test('should validate array items', () => {
            const valid = validator.validateOutput('array-tool', { items: ['a', 'b'] });
            const invalid = validator.validateOutput('array-tool', { items: ['a', 123] });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });

        test('should validate minItems', () => {
            const valid = validator.validateOutput('array-tool', { items: ['a'] });
            const invalid = validator.validateOutput('array-tool', { items: [] });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });

        test('should validate maxItems', () => {
            const valid = validator.validateOutput('array-tool', { items: ['a', 'b', 'c'] });
            const invalid = validator.validateOutput('array-tool', { items: ['a', 'b', 'c', 'd', 'e', 'f'] });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });
    });

    describe('Nested Object Validation', () => {
        beforeEach(() => {
            validator.registerContract('nested-tool', {
                output: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            required: ['id'],
                            properties: {
                                id: { type: 'string' },
                                profile: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        });

        test('should validate nested objects', () => {
            const valid = validator.validateOutput('nested-tool', {
                user: {
                    id: '123',
                    profile: { name: 'Test' }
                }
            });

            expect(valid.valid).toBe(true);
        });

        test('should fail on nested required fields', () => {
            const invalid = validator.validateOutput('nested-tool', {
                user: {
                    profile: { name: 'Test' }
                    // missing id
                }
            });

            expect(invalid.valid).toBe(false);
            expect(invalid.errors.some(e => e.includes('id'))).toBe(true);
        });
    });

    describe('Input Validation', () => {
        beforeEach(() => {
            validator.registerContract('input-tool', {
                input: {
                    type: 'object',
                    required: ['query'],
                    properties: {
                        query: { type: 'string', minLength: 1 },
                        limit: { type: 'number', minimum: 1, maximum: 100 }
                    }
                }
            });
        });

        test('should validate input', () => {
            const valid = validator.validateInput('input-tool', { query: 'test' });
            const invalid = validator.validateInput('input-tool', {});

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });
    });

    describe('Strict Mode', () => {
        test('should fail for unregistered tools in strict mode', () => {
            const strict = new ToolContractValidator({ strictMode: true, verbose: false });
            const result = strict.validateOutput('unknown-tool', {});

            expect(result.valid).toBe(false);
        });

        test('should pass for unregistered tools when not strict', () => {
            const nonStrict = new ToolContractValidator({ strictMode: false, verbose: false });
            const result = nonStrict.validateOutput('unknown-tool', {});

            expect(result.valid).toBe(true);
        });
    });

    describe('Function Wrapping', () => {
        test('should wrap function with validation', async () => {
            validator.registerContract('wrapped-tool', {
                input: { type: 'string' },
                output: { type: 'object', properties: { result: { type: 'string' } } }
            });

            const original = async (input) => ({ result: input.toUpperCase() });
            const wrapped = validator.wrap('wrapped-tool', original);

            const result = await wrapped('hello');
            expect(result.result).toBe('HELLO');
        });

        test('should throw on invalid input', async () => {
            validator.registerContract('wrapped-tool', {
                input: { type: 'string' }
            });

            const original = async (input) => input;
            const wrapped = validator.wrap('wrapped-tool', original);

            await expect(wrapped(123)).rejects.toThrow('Contract violation (input)');
        });

        test('should throw on invalid output', async () => {
            validator.registerContract('wrapped-tool', {
                output: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }
            });

            const original = async () => ({}); // Missing required id
            const wrapped = validator.wrap('wrapped-tool', original);

            await expect(wrapped()).rejects.toThrow('Contract violation (output)');
        });
    });

    describe('Statistics', () => {
        test('should track validation statistics', () => {
            validator.registerContract('stats-tool', {
                output: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }
            });

            validator.validateOutput('stats-tool', { id: '1' }); // pass
            validator.validateOutput('stats-tool', { id: '2' }); // pass
            validator.validateOutput('stats-tool', {}); // fail

            const stats = validator.getStatistics();

            expect(stats.totalValidations).toBe(3);
            expect(stats.passed).toBe(2);
            expect(stats.failed).toBe(1);
            expect(stats.passRate).toBeCloseTo(2/3, 2);
        });

        test('should get recent failures', () => {
            validator.registerContract('fail-tool', {
                output: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }
            });

            validator.validateOutput('fail-tool', {}); // fail
            validator.validateOutput('fail-tool', { wrong: true }); // fail

            const failures = validator.getRecentFailures(10);

            expect(failures.length).toBe(2);
            expect(failures.every(f => !f.valid)).toBe(true);
        });
    });

    describe('Documentation', () => {
        test('should generate documentation', () => {
            validator.registerContract('doc-tool', {
                description: 'A test tool',
                input: { type: 'string' },
                output: { type: 'object' }
            });

            const docs = validator.generateDocumentation();

            expect(docs).toContain('# Tool Contract Documentation');
            expect(docs).toContain('doc-tool');
            expect(docs).toContain('A test tool');
        });
    });

    describe('Contract Templates', () => {
        test('should have API response template', () => {
            expect(ContractTemplates.apiResponse).toBeDefined();
            expect(ContractTemplates.apiResponse.required).toContain('success');
        });

        test('should have Salesforce query template', () => {
            expect(ContractTemplates.salesforceQuery).toBeDefined();
            expect(ContractTemplates.salesforceQuery.required).toContain('records');
        });

        test('should validate against templates', () => {
            validator.registerContract('api-tool', {
                output: ContractTemplates.apiResponse
            });

            const valid = validator.validateOutput('api-tool', {
                success: true,
                data: { result: 'test' }
            });

            const invalid = validator.validateOutput('api-tool', {
                data: { result: 'test' }
                // missing success
            });

            expect(valid.valid).toBe(true);
            expect(invalid.valid).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null values', () => {
            validator.registerContract('null-tool', {
                output: { type: 'object', properties: { value: { type: 'string' } } }
            });

            const result = validator.validateOutput('null-tool', null);
            expect(result.valid).toBe(true); // null is allowed unless required
        });

        test('should handle undefined values', () => {
            validator.registerContract('undef-tool', {
                output: { type: 'object', properties: { value: { type: 'string' } } }
            });

            const result = validator.validateOutput('undef-tool', undefined);
            expect(result.valid).toBe(true);
        });

        test('should clear history', () => {
            validator.registerContract('clear-tool', { output: {} });
            validator.validateOutput('clear-tool', {});
            validator.validateOutput('clear-tool', {});

            expect(validator.validationHistory.length).toBe(2);

            validator.clearHistory();

            expect(validator.validationHistory.length).toBe(0);
        });

        test('should export contracts', () => {
            validator.registerContract('export-tool', { output: { type: 'string' } });

            const exported = validator.exportContracts();
            const parsed = JSON.parse(exported);

            expect(parsed.contracts['export-tool']).toBeDefined();
            expect(parsed.exportedAt).toBeDefined();
        });
    });
});
