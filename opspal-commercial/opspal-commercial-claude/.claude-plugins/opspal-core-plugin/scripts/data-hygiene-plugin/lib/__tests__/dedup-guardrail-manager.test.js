/**
 * Tests for GuardrailManager - Prevention mechanisms to stop duplicates recurring
 *
 * The guardrail manager:
 * - Creates unique constraint property (external_sfdc_account_id)
 * - Populates property values from existing data
 * - Creates exception queries for monitoring
 * - Generates documentation
 */

const fs = require('fs');
const https = require('https');

// Mock dependencies
jest.mock('fs');
jest.mock('https');

const GuardrailManager = require('../dedup-guardrail-manager');

describe('GuardrailManager', () => {
    let manager;

    const mockConfig = {
        hubspot: {
            accessToken: 'test-token',
            portalId: '12345678'
        },
        execution: {
            dryRun: true
        },
        output: {
            outputDir: './test-reports'
        },
        guardrails: {
            createExternalSFDCAccountIdProperty: true,
            enforceUniqueConstraint: true,
            keepAutoAssociateOff: true
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {});

        // Silence console
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();

        manager = new GuardrailManager(mockConfig);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with config', () => {
            expect(manager.hubspot).toEqual(mockConfig.hubspot);
            expect(manager.dryRun).toBe(true);
        });

        it('should default to dry run mode', () => {
            const configNoDryRun = { ...mockConfig, execution: {} };
            const mgr = new GuardrailManager(configNoDryRun);
            expect(mgr.dryRun).toBe(true);
        });

        it('should initialize results tracking', () => {
            expect(manager.results.propertyCreated).toBe(false);
            expect(manager.results.valuesPopulated).toBe(0);
            expect(manager.results.exceptionsCreated).toEqual([]);
            expect(manager.results.documentation).toEqual([]);
        });
    });

    describe('implement', () => {
        beforeEach(() => {
            // Mock successful API responses
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            if (options.path.includes('search')) {
                                handler(JSON.stringify({ results: [] }));
                            } else {
                                handler(JSON.stringify({ name: 'external_sfdc_account_id' }));
                            }
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });
        });

        it('should implement all guardrails in dry run mode', async () => {
            const result = await manager.implement();

            expect(result.propertyCreated).toBe(true); // Marked true even in dry run
            expect(result.exceptionsCreated.length).toBe(3); // 3 exception queries
        });

        it('should save guardrail report', async () => {
            await manager.implement();

            const reportCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('guardrails-report')
            );
            expect(reportCall).toBeDefined();
        });

        it('should generate documentation', async () => {
            await manager.implement();

            const docsCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('guardrails-documentation')
            );
            expect(docsCall).toBeDefined();
        });

        it('should skip property creation if disabled in config', async () => {
            manager.guardrails.createExternalSFDCAccountIdProperty = false;

            await manager.implement();

            // Property creation step skipped
            expect(manager.results.propertyCreated).toBe(false);
        });
    });

    describe('createExternalAccountIdProperty', () => {
        it('should log in dry run mode without making API call', async () => {
            await manager.createExternalAccountIdProperty();

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('DRY RUN')
            );
            expect(manager.results.propertyCreated).toBe(true);
        });

        it('should create property with unique constraint in live mode', async () => {
            manager.dryRun = false;

            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 201,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify({ name: 'external_sfdc_account_id' }));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            await manager.createExternalAccountIdProperty();

            expect(manager.results.propertyCreated).toBe(true);
        });

        it('should handle property already exists error', async () => {
            manager.dryRun = false;

            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 409,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify({ message: 'Property already exists' }));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            await manager.createExternalAccountIdProperty();

            expect(manager.results.propertyCreated).toBe(true); // Still true if already exists
        });
    });

    describe('populateExternalAccountIds', () => {
        it('should log in dry run mode', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [
                                    { id: '1', properties: { name: 'Co 1', salesforceaccountid: 'sf001' } }
                                ]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            await manager.populateExternalAccountIds();

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('DRY RUN')
            );
        });

        it('should skip if no companies need population', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify({ results: [] }));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            await manager.populateExternalAccountIds();

            expect(console.log).toHaveBeenCalledWith(
                expect.stringContaining('already have external_sfdc_account_id')
            );
        });

        it('should batch update companies in live mode', async () => {
            manager.dryRun = false;

            let requestCount = 0;
            https.request.mockImplementation((options, callback) => {
                requestCount++;
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            if (options.path.includes('search')) {
                                handler(JSON.stringify({
                                    results: [
                                        { id: '1', properties: { name: 'Co 1', salesforceaccountid: 'sf001' } },
                                        { id: '2', properties: { name: 'Co 2', salesforceaccountid: 'sf002' } }
                                    ]
                                }));
                            } else {
                                handler(JSON.stringify({ results: [{ id: '1' }, { id: '2' }] }));
                            }
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            await manager.populateExternalAccountIds();

            expect(manager.results.valuesPopulated).toBe(2);
        });
    });

    describe('createExceptionQueries', () => {
        it('should define 3 exception queries', async () => {
            await manager.createExceptionQueries();

            expect(manager.results.exceptionsCreated.length).toBe(3);
            expect(manager.results.exceptionsCreated[0].name).toBe('Duplicate SF Account IDs');
            expect(manager.results.exceptionsCreated[1].name).toBe('Missing External Account ID');
            expect(manager.results.exceptionsCreated[2].name).toBe('Mismatched Account IDs');
        });

        it('should save query definitions in live mode', async () => {
            manager.dryRun = false;

            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            await manager.createExceptionQueries();

            const queriesCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('exception-queries.json')
            );
            expect(queriesCall).toBeDefined();
        });

        it('should generate setup guide in live mode', async () => {
            manager.dryRun = false;

            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            await manager.createExceptionQueries();

            const guideCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('EXCEPTION_QUERIES_SETUP.md')
            );
            expect(guideCall).toBeDefined();
        });
    });

    describe('generateDocumentation', () => {
        it('should save documentation JSON', async () => {
            await manager.generateDocumentation();

            const docsCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('guardrails-documentation.json')
            );
            expect(docsCall).toBeDefined();
        });

        it('should generate markdown guide', async () => {
            await manager.generateDocumentation();

            const guideCall = fs.writeFileSync.mock.calls.find(call =>
                call[0].includes('GUARDRAILS_GUIDE.md')
            );
            expect(guideCall).toBeDefined();
        });

        it('should include auto-associate settings', async () => {
            await manager.generateDocumentation();

            expect(manager.results.documentation.length).toBeGreaterThan(0);
            const autoAssociate = manager.results.documentation.find(doc =>
                doc.title === 'Auto-Associate Companies Setting'
            );
            expect(autoAssociate).toBeDefined();
        });
    });

    describe('generateMarkdownGuide', () => {
        it('should generate markdown with all sections', () => {
            const docs = {
                section1: {
                    title: 'Test Section',
                    description: 'Test description',
                    recommendation: 'Test recommendation'
                }
            };

            manager.generateMarkdownGuide(docs, '/tmp/guide.md');

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                '/tmp/guide.md',
                expect.stringContaining('# Deduplication Guardrails Guide')
            );
        });
    });

    describe('generateExceptionQueryGuide', () => {
        it('should generate guide with instructions for each query', () => {
            const queries = [
                {
                    name: 'Test Query',
                    description: 'Test description',
                    severity: 'critical',
                    expectedCount: 0,
                    hubspotInstructions: ['Step 1', 'Step 2']
                }
            ];

            manager.generateExceptionQueryGuide(queries, '/tmp/query-guide.md');

            const [filePath, content] = fs.writeFileSync.mock.calls[0];
            expect(content).toContain('Test Query');
            expect(content).toContain('Step 1');
            expect(content).toContain('Check daily'); // Critical severity
        });
    });

    describe('saveGuardrailReport', () => {
        it('should save report with results and recommendations', () => {
            manager.results = {
                propertyCreated: true,
                valuesPopulated: 50,
                exceptionsCreated: [{ name: 'Test' }],
                documentation: [{ title: 'Doc' }]
            };

            manager.saveGuardrailReport();

            const [filePath, content] = fs.writeFileSync.mock.calls[0];
            expect(filePath).toContain('guardrails-report');

            const saved = JSON.parse(content);
            expect(saved.results.propertyCreated).toBe(true);
            expect(saved.recommendations).toContain('Keep auto-associate companies OFF');
        });
    });

    describe('printSummary', () => {
        it('should print summary statistics', () => {
            manager.results = {
                propertyCreated: true,
                valuesPopulated: 100,
                exceptionsCreated: [{ name: 'Q1' }, { name: 'Q2' }, { name: 'Q3' }],
                documentation: [{ title: 'D1' }, { title: 'D2' }]
            };

            manager.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Property Created: ✅'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Values Populated: 100'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Exception Queries: 3'));
        });
    });

    describe('verifyPropertyExists', () => {
        it('should resolve true if property exists', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const result = await manager.verifyPropertyExists('external_sfdc_account_id');
            expect(result).toBe(true);
        });

        it('should reject if property not found', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 404,
                    on: jest.fn((event, handler) => {
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            await expect(manager.verifyPropertyExists('nonexistent')).rejects.toThrow('not found');
        });
    });

    describe('sleep', () => {
        it('should wait for specified milliseconds', async () => {
            const start = Date.now();
            await manager.sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some variance
        });
    });
});
