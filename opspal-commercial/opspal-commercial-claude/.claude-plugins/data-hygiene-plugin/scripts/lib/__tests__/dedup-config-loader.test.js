/**
 * Tests for DedupConfigLoader - Configuration loading with env var substitution
 *
 * The config loader handles environment variable substitution, validation,
 * and default merging for deduplication configuration.
 */

const fs = require('fs');

// Mock fs module
jest.mock('fs');

const DedupConfigLoader = require('../dedup-config-loader');

describe('DedupConfigLoader', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset environment
        process.env = {
            ...originalEnv,
            HUBSPOT_PORTAL_ID: '12345678',
            HUBSPOT_PRIVATE_APP_TOKEN: 'test-hubspot-token',
            SALESFORCE_INSTANCE_URL: 'https://test.salesforce.com',
            SALESFORCE_ACCESS_TOKEN: 'test-sf-token',
            SALESFORCE_ORG_ALIAS: 'test-org'
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('load', () => {
        it('should throw error if config file not found', () => {
            fs.existsSync.mockReturnValue(false);

            expect(() => {
                DedupConfigLoader.load('/nonexistent/config.json');
            }).toThrow('Configuration file not found');
        });

        it('should load and parse valid config file', () => {
            const validConfig = {
                hubspot: {
                    portalId: '12345678',
                    accessToken: '${HUBSPOT_PRIVATE_APP_TOKEN}'
                },
                salesforce: {
                    instanceUrl: '${SALESFORCE_INSTANCE_URL}',
                    accessToken: '${SALESFORCE_ACCESS_TOKEN}',
                    orgAlias: '${SALESFORCE_ORG_ALIAS}'
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

            const config = DedupConfigLoader.load('/path/to/config.json');

            expect(config.hubspot.accessToken).toBe('test-hubspot-token');
            expect(config.salesforce.instanceUrl).toBe('https://test.salesforce.com');
        });

        it('should replace {{TIMESTAMP}} in idempotencyPrefix', () => {
            const configWithTimestamp = {
                hubspot: {
                    portalId: '12345678',
                    accessToken: 'token'
                },
                salesforce: {
                    instanceUrl: 'https://test.salesforce.com',
                    accessToken: 'token',
                    orgAlias: 'test'
                },
                execution: {
                    idempotencyPrefix: 'dedupe-{{TIMESTAMP}}'
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(configWithTimestamp));

            const config = DedupConfigLoader.load('/path/to/config.json');

            expect(config.execution.idempotencyPrefix).not.toContain('{{TIMESTAMP}}');
            expect(config.execution.idempotencyPrefix).toMatch(/dedupe-\d{4}-\d{2}-\d{2}/);
        });
    });

    describe('loadOrDefault', () => {
        it('should load config if path provided and file exists', () => {
            const validConfig = {
                hubspot: {
                    portalId: '12345678',
                    accessToken: 'token'
                },
                salesforce: {
                    instanceUrl: 'https://test.salesforce.com',
                    accessToken: 'token',
                    orgAlias: 'test'
                }
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

            const config = DedupConfigLoader.loadOrDefault('/path/to/config.json');

            expect(config.hubspot.portalId).toBe('12345678');
        });

        it('should use defaults if no path provided', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const config = DedupConfigLoader.loadOrDefault(null);

            expect(config.hubspot.portalId).toBe('12345678'); // From env
            expect(config.execution.dryRun).toBe(true); // Default
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('using defaults'));

            consoleSpy.mockRestore();
        });

        it('should use defaults if file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const config = DedupConfigLoader.loadOrDefault('/nonexistent/config.json');

            expect(config.hubspot.accessToken).toBe('test-hubspot-token'); // From env

            consoleSpy.mockRestore();
        });
    });

    describe('_resolveEnvVars', () => {
        it('should resolve ${VAR_NAME} patterns', () => {
            const config = {
                token: '${HUBSPOT_PRIVATE_APP_TOKEN}'
            };

            const resolved = DedupConfigLoader._resolveEnvVars(config);

            expect(resolved.token).toBe('test-hubspot-token');
        });

        it('should warn for unset environment variables', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const config = {
                token: '${NONEXISTENT_VAR}'
            };

            const resolved = DedupConfigLoader._resolveEnvVars(config);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('NONEXISTENT_VAR'));
            expect(resolved.token).toBe('${NONEXISTENT_VAR}'); // Keep original if not found

            consoleSpy.mockRestore();
        });

        it('should handle nested objects', () => {
            const config = {
                level1: {
                    level2: {
                        token: '${HUBSPOT_PRIVATE_APP_TOKEN}'
                    }
                }
            };

            const resolved = DedupConfigLoader._resolveEnvVars(config);

            expect(resolved.level1.level2.token).toBe('test-hubspot-token');
        });

        it('should handle arrays', () => {
            const config = {
                tokens: ['${HUBSPOT_PRIVATE_APP_TOKEN}', '${SALESFORCE_ACCESS_TOKEN}']
            };

            const resolved = DedupConfigLoader._resolveEnvVars(config);

            expect(resolved.tokens[0]).toBe('test-hubspot-token');
            expect(resolved.tokens[1]).toBe('test-sf-token');
        });

        it('should skip note fields', () => {
            const config = {
                noteAboutToken: 'This should be skipped',
                token: '${HUBSPOT_PRIVATE_APP_TOKEN}'
            };

            const resolved = DedupConfigLoader._resolveEnvVars(config);

            expect(resolved.noteAboutToken).toBeUndefined();
            expect(resolved.token).toBe('test-hubspot-token');
        });

        it('should preserve non-string values', () => {
            const config = {
                count: 100,
                enabled: true,
                items: null
            };

            const resolved = DedupConfigLoader._resolveEnvVars(config);

            expect(resolved.count).toBe(100);
            expect(resolved.enabled).toBe(true);
            expect(resolved.items).toBeNull();
        });
    });

    describe('_validate', () => {
        it('should throw error for missing required hubspot fields', () => {
            const config = {
                hubspot: {},
                salesforce: {
                    instanceUrl: 'https://test.salesforce.com',
                    accessToken: 'token',
                    orgAlias: 'test'
                }
            };

            expect(() => {
                DedupConfigLoader._validate(config);
            }).toThrow('Missing required field: hubspot.portalId');
        });

        it('should throw error for missing required salesforce fields', () => {
            const config = {
                hubspot: {
                    portalId: '123',
                    accessToken: 'token'
                },
                salesforce: {}
            };

            expect(() => {
                DedupConfigLoader._validate(config);
            }).toThrow('Missing required field');
        });

        it('should validate canonicalWeights are numbers', () => {
            const config = {
                hubspot: { portalId: '123', accessToken: 'token' },
                salesforce: {
                    instanceUrl: 'https://test.salesforce.com',
                    accessToken: 'token',
                    orgAlias: 'test'
                },
                canonicalWeights: {
                    hasSalesforceAccountId: 'not-a-number'
                }
            };

            expect(() => {
                DedupConfigLoader._validate(config);
            }).toThrow('canonicalWeights.hasSalesforceAccountId must be a number');
        });

        it('should validate batch size range', () => {
            const config = {
                hubspot: { portalId: '123', accessToken: 'token' },
                salesforce: {
                    instanceUrl: 'https://test.salesforce.com',
                    accessToken: 'token',
                    orgAlias: 'test'
                },
                execution: {
                    batchSize: 500 // Too high
                }
            };

            expect(() => {
                DedupConfigLoader._validate(config);
            }).toThrow('execution.batchSize must be between 1 and 200');
        });

        it('should pass validation for valid config', () => {
            const config = {
                hubspot: { portalId: '123', accessToken: 'token' },
                salesforce: {
                    instanceUrl: 'https://test.salesforce.com',
                    accessToken: 'token',
                    orgAlias: 'test'
                },
                execution: { batchSize: 100 },
                canonicalWeights: { hasSalesforceAccountId: 100 }
            };

            expect(() => {
                DedupConfigLoader._validate(config);
            }).not.toThrow();
        });
    });

    describe('_mergeDefaults', () => {
        it('should merge with default execution settings', () => {
            const config = {
                hubspot: { portalId: '123' }
            };

            const merged = DedupConfigLoader._mergeDefaults(config);

            expect(merged.execution.dryRun).toBe(true);
            expect(merged.execution.batchSize).toBe(100);
            expect(merged.execution.maxWritePerMin).toBe(60);
        });

        it('should merge with default canonical weights', () => {
            const config = {};

            const merged = DedupConfigLoader._mergeDefaults(config);

            expect(merged.canonicalWeights.hasSalesforceAccountId).toBe(100);
            expect(merged.canonicalWeights.numContacts).toBe(40);
            expect(merged.canonicalWeights.numDeals).toBe(25);
        });

        it('should merge with default output settings', () => {
            const config = {};

            const merged = DedupConfigLoader._mergeDefaults(config);

            expect(merged.output.outputDir).toBe('./dedup-reports');
            expect(merged.output.generateCSV).toBe(true);
            expect(merged.output.generateJSON).toBe(true);
        });

        it('should merge with default guardrails', () => {
            const config = {};

            const merged = DedupConfigLoader._mergeDefaults(config);

            expect(merged.guardrails.createExternalSFDCAccountIdProperty).toBe(true);
            expect(merged.guardrails.enforceUniqueConstraint).toBe(true);
        });

        it('should merge with default validation settings', () => {
            const config = {};

            const merged = DedupConfigLoader._mergeDefaults(config);

            expect(merged.validation.spotCheckPercentage).toBe(5);
            expect(merged.validation.failOnDataLoss).toBe(true);
        });

        it('should preserve user-provided values', () => {
            const config = {
                execution: {
                    batchSize: 50 // User-provided
                }
            };

            const merged = DedupConfigLoader._mergeDefaults(config);

            expect(merged.execution.batchSize).toBe(50); // Preserved
            expect(merged.execution.dryRun).toBe(true); // Default
        });

        it('should deep merge nested objects', () => {
            const config = {
                canonicalWeights: {
                    hasSalesforceAccountId: 200 // Override
                    // Other weights should come from defaults
                }
            };

            const merged = DedupConfigLoader._mergeDefaults(config);

            expect(merged.canonicalWeights.hasSalesforceAccountId).toBe(200);
            expect(merged.canonicalWeights.numContacts).toBe(40); // Default
        });
    });

    describe('_deepMerge', () => {
        it('should merge two objects deeply', () => {
            const target = {
                a: { b: 1, c: 2 },
                d: 3
            };
            const source = {
                a: { b: 10 },
                e: 5
            };

            const result = DedupConfigLoader._deepMerge(target, source);

            expect(result.a.b).toBe(10);
            expect(result.a.c).toBe(2);
            expect(result.d).toBe(3);
            expect(result.e).toBe(5);
        });

        it('should not merge arrays deeply', () => {
            const target = { items: [1, 2, 3] };
            const source = { items: [4, 5] };

            const result = DedupConfigLoader._deepMerge(target, source);

            expect(result.items).toEqual([4, 5]); // Replaced, not merged
        });
    });

    describe('_generateTimestamp', () => {
        it('should generate timestamp in expected format', () => {
            const timestamp = DedupConfigLoader._generateTimestamp();

            // Format: YYYY-MM-DD-HH-MM-SS
            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
        });
    });

    describe('printSummary', () => {
        it('should print configuration summary with redacted tokens', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const config = {
                hubspot: {
                    portalId: '12345678',
                    accessToken: 'very-long-secret-token-12345'
                },
                salesforce: {
                    orgAlias: 'test-org',
                    instanceUrl: 'https://test.salesforce.com',
                    accessToken: 'another-secret-token-67890'
                },
                execution: {
                    dryRun: true,
                    batchSize: 100,
                    idempotencyPrefix: 'dedupe-test'
                },
                output: {
                    outputDir: './reports',
                    alertSlackWebhook: ''
                }
            };

            DedupConfigLoader.printSummary(config);

            // Check that token is redacted
            const calls = consoleSpy.mock.calls.flat().join(' ');
            expect(calls).toContain('very-l***2345'); // Redacted HubSpot token
            expect(calls).toContain('anothe***7890'); // Redacted SF token (first 6 + *** + last 4)
            expect(calls).toContain('DRY RUN'); // Mode indicator

            consoleSpy.mockRestore();
        });

        it('should handle short tokens in redaction', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const config = {
                hubspot: {
                    portalId: '123',
                    accessToken: 'short'
                },
                salesforce: {
                    orgAlias: 'test',
                    instanceUrl: 'https://test.sf.com',
                    accessToken: 'tiny'
                },
                execution: {
                    dryRun: false,
                    batchSize: 50,
                    idempotencyPrefix: 'test'
                },
                output: {
                    outputDir: './',
                    alertSlackWebhook: 'https://hooks.slack.com/xxx'
                }
            };

            DedupConfigLoader.printSummary(config);

            const calls = consoleSpy.mock.calls.flat().join(' ');
            expect(calls).toContain('***'); // Short tokens fully redacted
            expect(calls).toContain('LIVE EXECUTION'); // Mode indicator

            consoleSpy.mockRestore();
        });
    });
});
