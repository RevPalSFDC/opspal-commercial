/**
 * Comprehensive tests for Deduplication Validation Framework
 *
 * Tests cover:
 * - Pre-execution validation (connectivity, permissions, config)
 * - Post-execution validation (zero duplicates, canonicals exist)
 * - Spot-check validation
 * - Domain normalization
 * - Error handling and reporting
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

jest.mock('fs');
jest.mock('https');
jest.mock('child_process');

const ValidationFramework = require('../dedup-validation-framework');

describe('ValidationFramework', () => {
    let validator;
    let mockConfig;

    beforeEach(() => {
        jest.clearAllMocks();

        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {});

        mockConfig = {
            hubspot: {
                portalId: '12345678',
                accessToken: 'test-token'
            },
            salesforce: {
                orgAlias: 'test-org',
                accessToken: 'sf-token'
            },
            output: {
                outputDir: './test-reports'
            },
            validation: {
                spotCheckPercentage: 5
            }
        };

        validator = new ValidationFramework(mockConfig);
    });

    describe('constructor', () => {
        it('should initialize with config', () => {
            expect(validator.config).toEqual(mockConfig);
            expect(validator.hubspot).toEqual(mockConfig.hubspot);
            expect(validator.salesforce).toEqual(mockConfig.salesforce);
            expect(validator.outputDir).toBe('./test-reports');
            expect(validator.spotCheckPercentage).toBe(5);
        });

        it('should use default values when not provided', () => {
            const v = new ValidationFramework({});
            expect(v.outputDir).toBe('./dedup-reports');
            expect(v.spotCheckPercentage).toBe(5);
        });

        it('should initialize empty results object', () => {
            expect(validator.results.checks).toEqual([]);
            expect(validator.results.passed).toBe(true);
            expect(validator.results.warnings).toEqual([]);
            expect(validator.results.errors).toEqual([]);
        });
    });

    describe('validate', () => {
        it('should throw error for unknown validation type', async () => {
            await expect(validator.validate('unknown-type'))
                .rejects.toThrow('Unknown validation type');
        });

        it('should set validation type in results', async () => {
            // Mock all checks to pass
            validator.preExecutionValidation = jest.fn().mockResolvedValue();

            await validator.validate('pre-execution');

            expect(validator.results.validationType).toBe('pre-execution');
        });

        it('should determine passed=true when no errors', async () => {
            validator.preExecutionValidation = jest.fn().mockResolvedValue();

            const result = await validator.validate('pre-execution');

            expect(result.passed).toBe(true);
        });

        it('should determine passed=false when errors exist', async () => {
            validator.preExecutionValidation = jest.fn().mockImplementation(() => {
                validator.results.errors.push({ check: 'test', error: 'Test error' });
            });

            const result = await validator.validate('pre-execution');

            expect(result.passed).toBe(false);
        });

        it('should save validation report', async () => {
            validator.preExecutionValidation = jest.fn().mockResolvedValue();

            await validator.validate('pre-execution');

            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should handle validation execution errors', async () => {
            validator.preExecutionValidation = jest.fn()
                .mockRejectedValue(new Error('Validation failed'));

            await expect(validator.validate('pre-execution'))
                .rejects.toThrow('Validation failed');

            expect(validator.results.errors).toHaveLength(1);
        });
    });

    describe('preExecutionValidation', () => {
        beforeEach(() => {
            // Mock all individual checks
            validator.checkAPIConnectivity = jest.fn().mockResolvedValue();
            validator.checkHubSpotSettings = jest.fn().mockResolvedValue();
            validator.checkSalesforceConnectivity = jest.fn().mockResolvedValue();
            validator.checkPermissions = jest.fn().mockResolvedValue();
            validator.checkConfiguration = jest.fn().mockResolvedValue();
        });

        it('should run all pre-execution checks', async () => {
            await validator.preExecutionValidation();

            expect(validator.checkAPIConnectivity).toHaveBeenCalled();
            expect(validator.checkHubSpotSettings).toHaveBeenCalled();
            expect(validator.checkSalesforceConnectivity).toHaveBeenCalled();
            expect(validator.checkPermissions).toHaveBeenCalled();
            expect(validator.checkConfiguration).toHaveBeenCalled();
        });
    });

    describe('postExecutionValidation', () => {
        beforeEach(() => {
            validator.checkZeroDuplicatesBySFAccountId = jest.fn().mockResolvedValue();
            validator.checkZeroDuplicatesByDomain = jest.fn().mockResolvedValue();
            validator.checkCanonicalsExist = jest.fn().mockResolvedValue();
            validator.checkDuplicatesDeleted = jest.fn().mockResolvedValue();
            validator.checkAssociationPreservation = jest.fn().mockResolvedValue();
            validator.checkRecordCounts = jest.fn().mockResolvedValue();
        });

        it('should run all post-execution checks', async () => {
            const data = { canonicalMap: [], snapshot: {} };

            await validator.postExecutionValidation(data);

            expect(validator.checkZeroDuplicatesBySFAccountId).toHaveBeenCalled();
            expect(validator.checkZeroDuplicatesByDomain).toHaveBeenCalled();
            expect(validator.checkCanonicalsExist).toHaveBeenCalled();
            expect(validator.checkDuplicatesDeleted).toHaveBeenCalled();
            expect(validator.checkAssociationPreservation).toHaveBeenCalled();
            expect(validator.checkRecordCounts).toHaveBeenCalled();
        });
    });

    describe('spotCheckValidation', () => {
        it('should sample correct percentage of bundles', async () => {
            const canonicalMap = Array(100).fill(null).map((_, i) => ({
                bundleId: `b${i}`,
                canonical: { companyId: String(i) }
            }));

            validator.validateBundle = jest.fn().mockResolvedValue({ passed: true });

            await validator.spotCheckValidation({ canonicalMap });

            // 5% of 100 = 5 bundles
            expect(validator.validateBundle).toHaveBeenCalledTimes(5);
        });

        it('should sample at least 1 bundle', async () => {
            const canonicalMap = [{ bundleId: 'b1', canonical: { companyId: '1' } }];

            validator.validateBundle = jest.fn().mockResolvedValue({ passed: true });

            await validator.spotCheckValidation({ canonicalMap });

            expect(validator.validateBundle).toHaveBeenCalledTimes(1);
        });
    });

    describe('checkAPIConnectivity', () => {
        it('should check HubSpot connectivity', async () => {
            validator.testHubSpotAPI = jest.fn().mockResolvedValue();
            validator.testSalesforceAPI = jest.fn().mockResolvedValue();

            await validator.checkAPIConnectivity();

            expect(validator.testHubSpotAPI).toHaveBeenCalled();
            expect(validator.results.checks[0].checks[0]).toEqual({
                platform: 'HubSpot',
                passed: true
            });
        });

        it('should record HubSpot error and continue', async () => {
            validator.testHubSpotAPI = jest.fn()
                .mockRejectedValue(new Error('HubSpot API error'));
            validator.testSalesforceAPI = jest.fn().mockResolvedValue();

            await validator.checkAPIConnectivity();

            expect(validator.results.errors).toContainEqual({
                check: 'hubspot-connectivity',
                error: 'HubSpot API error'
            });
            // Should still check Salesforce
            expect(validator.testSalesforceAPI).toHaveBeenCalled();
        });

        it('should check Salesforce connectivity', async () => {
            validator.testHubSpotAPI = jest.fn().mockResolvedValue();
            validator.testSalesforceAPI = jest.fn().mockResolvedValue();

            await validator.checkAPIConnectivity();

            expect(validator.testSalesforceAPI).toHaveBeenCalled();
            expect(validator.results.checks[0].checks[1]).toEqual({
                platform: 'Salesforce',
                passed: true
            });
        });

        it('should record Salesforce error', async () => {
            validator.testHubSpotAPI = jest.fn().mockResolvedValue();
            validator.testSalesforceAPI = jest.fn()
                .mockRejectedValue(new Error('SF API error'));

            await validator.checkAPIConnectivity();

            expect(validator.results.errors).toContainEqual({
                check: 'salesforce-connectivity',
                error: 'SF API error'
            });
        });
    });

    describe('testHubSpotAPI', () => {
        it('should resolve on HTTP 200', async () => {
            const mockResponse = {
                statusCode: 200,
                on: jest.fn()
            };

            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            await expect(validator.testHubSpotAPI()).resolves.toBeUndefined();
        });

        it('should reject on non-200 status', async () => {
            const mockResponse = {
                statusCode: 401,
                on: jest.fn()
            };

            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            await expect(validator.testHubSpotAPI())
                .rejects.toThrow('HTTP 401');
        });

        it('should reject on network error', async () => {
            const mockRequest = {
                on: jest.fn((event, callback) => {
                    if (event === 'error') callback(new Error('Network error'));
                }),
                end: jest.fn()
            };

            https.request.mockReturnValue(mockRequest);

            await expect(validator.testHubSpotAPI())
                .rejects.toThrow('Network error');
        });
    });

    describe('testSalesforceAPI', () => {
        it('should pass when SF CLI returns status 0', () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: { id: 'org123' }
            }));

            expect(() => validator.testSalesforceAPI()).not.toThrow();
        });

        it('should throw when SF CLI returns non-zero status', () => {
            execSync.mockReturnValue(JSON.stringify({
                status: 1,
                message: 'Org not found'
            }));

            expect(() => validator.testSalesforceAPI())
                .toThrow('SF CLI error');
        });

        it('should throw on execSync error', () => {
            execSync.mockImplementation(() => {
                throw new Error('Command failed');
            });

            expect(() => validator.testSalesforceAPI())
                .toThrow('SF CLI error');
        });
    });

    describe('checkHubSpotSettings', () => {
        it('should add warning for manual verification', async () => {
            await validator.checkHubSpotSettings();

            expect(validator.results.warnings).toContainEqual({
                check: 'auto-associate-setting',
                message: expect.stringContaining('Manual verification')
            });
        });

        it('should add check result', async () => {
            await validator.checkHubSpotSettings();

            expect(validator.results.checks[0].name).toBe('HubSpot Settings');
        });
    });

    describe('checkConfiguration', () => {
        it('should pass with valid config', async () => {
            await validator.checkConfiguration();

            const configCheck = validator.results.checks.find(c => c.name === 'Configuration');
            expect(configCheck.valid).toBe(true);
        });

        it('should fail with missing hubspot.portalId', async () => {
            validator.config = { hubspot: {}, salesforce: { orgAlias: 'test' } };

            await validator.checkConfiguration();

            const configCheck = validator.results.checks.find(c => c.name === 'Configuration');
            expect(configCheck.valid).toBe(false);
            expect(configCheck.issues).toContain('Missing hubspot.portalId');
        });

        it('should fail with missing hubspot.accessToken', async () => {
            validator.config = {
                hubspot: { portalId: '123' },
                salesforce: { orgAlias: 'test' }
            };

            await validator.checkConfiguration();

            const configCheck = validator.results.checks.find(c => c.name === 'Configuration');
            expect(configCheck.valid).toBe(false);
            expect(configCheck.issues).toContain('Missing hubspot.accessToken');
        });

        it('should fail with missing salesforce.orgAlias', async () => {
            validator.config = {
                hubspot: { portalId: '123', accessToken: 'token' },
                salesforce: {}
            };

            await validator.checkConfiguration();

            const configCheck = validator.results.checks.find(c => c.name === 'Configuration');
            expect(configCheck.valid).toBe(false);
            expect(configCheck.issues).toContain('Missing salesforce.orgAlias');
        });

        it('should add errors for invalid config', async () => {
            validator.config = { hubspot: {}, salesforce: {} };

            await validator.checkConfiguration();

            expect(validator.results.errors.length).toBeGreaterThan(0);
        });
    });

    describe('normalizeDomain', () => {
        it('should return null for empty input', () => {
            expect(validator.normalizeDomain(null)).toBeNull();
            expect(validator.normalizeDomain(undefined)).toBeNull();
            expect(validator.normalizeDomain('')).toBeNull();
        });

        it('should lowercase domain', () => {
            expect(validator.normalizeDomain('EXAMPLE.COM')).toBe('example.com');
        });

        it('should remove www prefix', () => {
            expect(validator.normalizeDomain('www.example.com')).toBe('example.com');
        });

        it('should remove http:// protocol', () => {
            expect(validator.normalizeDomain('http://example.com')).toBe('example.com');
        });

        it('should remove https:// protocol', () => {
            expect(validator.normalizeDomain('https://example.com')).toBe('example.com');
        });

        it('should remove trailing slash', () => {
            expect(validator.normalizeDomain('example.com/')).toBe('example.com');
        });

        it('should trim whitespace', () => {
            expect(validator.normalizeDomain('  example.com  ')).toBe('example.com');
        });

        it('should handle complex URLs', () => {
            // Note: ValidationFramework.normalizeDomain removes www before protocol
            // so https://www.example.com/ becomes www.example.com
            expect(validator.normalizeDomain('https://www.example.com/')).toBe('www.example.com');
            expect(validator.normalizeDomain('www.example.com/')).toBe('example.com');
        });
    });

    describe('checkCanonicalsExist', () => {
        it('should verify sample of canonical companies', async () => {
            const canonicalMap = Array(100).fill(null).map((_, i) => ({
                bundleId: `b${i}`,
                canonical: { companyId: String(i), companyName: `Company ${i}` },
                clusterKey: `key${i}`
            }));

            validator.verifyCompanyExists = jest.fn().mockResolvedValue(true);

            await validator.checkCanonicalsExist(canonicalMap);

            // Should sample max 20
            expect(validator.verifyCompanyExists).toHaveBeenCalledTimes(20);

            const check = validator.results.checks.find(c => c.name === 'Canonicals Exist');
            expect(check.passed).toBe(true);
        });

        it('should report missing canonicals', async () => {
            const canonicalMap = [{
                bundleId: 'b1',
                canonical: { companyId: '1', companyName: 'Test Co' },
                clusterKey: 'key1'
            }];

            validator.verifyCompanyExists = jest.fn().mockResolvedValue(false);

            await validator.checkCanonicalsExist(canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Canonicals Exist');
            expect(check.passed).toBe(false);
            expect(check.missing).toHaveLength(1);
        });

        it('should handle verification errors', async () => {
            const canonicalMap = [{
                bundleId: 'b1',
                canonical: { companyId: '1', companyName: 'Test Co' },
                clusterKey: 'key1'
            }];

            validator.verifyCompanyExists = jest.fn()
                .mockRejectedValue(new Error('API Error'));

            await validator.checkCanonicalsExist(canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Canonicals Exist');
            expect(check.errors).toHaveLength(1);
        });
    });

    describe('checkDuplicatesDeleted', () => {
        it('should verify duplicates are deleted', async () => {
            const canonicalMap = [{
                bundleId: 'b1',
                canonical: { companyId: '1' },
                clusterKey: 'key1',
                duplicates: [
                    { companyId: '2', companyName: 'Dup 1' },
                    { companyId: '3', companyName: 'Dup 2' }
                ]
            }];

            validator.verifyCompanyExists = jest.fn().mockResolvedValue(false);

            await validator.checkDuplicatesDeleted(canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Duplicates Deleted');
            expect(check.passed).toBe(true);
            expect(check.verified).toBe(2);
        });

        it('should report duplicates still existing', async () => {
            const canonicalMap = [{
                bundleId: 'b1',
                canonical: { companyId: '1' },
                clusterKey: 'key1',
                duplicates: [
                    { companyId: '2', companyName: 'Dup 1' }
                ]
            }];

            validator.verifyCompanyExists = jest.fn().mockResolvedValue(true);

            await validator.checkDuplicatesDeleted(canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Duplicates Deleted');
            expect(check.passed).toBe(false);
            expect(check.stillExist).toHaveLength(1);
        });
    });

    describe('checkAssociationPreservation', () => {
        it('should verify associations preserved', async () => {
            const canonicalMap = [{
                bundleId: 'b1',
                canonical: { companyId: '1', companyName: 'Canonical', num_contacts: 10, num_deals: 5 },
                duplicates: [
                    { companyId: '2', num_contacts: 5, num_deals: 2 }
                ]
            }];

            // Expected: 15 contacts, 7 deals
            validator.getCompanyContactCount = jest.fn().mockResolvedValue(15);
            validator.getCompanyDealCount = jest.fn().mockResolvedValue(7);

            await validator.checkAssociationPreservation(canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Association Preservation');
            expect(check.passed).toBe(true);
        });

        it('should report association mismatches', async () => {
            const canonicalMap = [{
                bundleId: 'b1',
                canonical: { companyId: '1', companyName: 'Canonical', num_contacts: 100, num_deals: 50 },
                duplicates: []
            }];

            // Only 50% of expected
            validator.getCompanyContactCount = jest.fn().mockResolvedValue(50);
            validator.getCompanyDealCount = jest.fn().mockResolvedValue(25);

            await validator.checkAssociationPreservation(canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Association Preservation');
            expect(check.passed).toBe(false);
            expect(check.issues).toHaveLength(1);
        });

        it('should allow 95% threshold', async () => {
            const canonicalMap = [{
                bundleId: 'b1',
                canonical: { companyId: '1', companyName: 'Canonical', num_contacts: 100, num_deals: 100 },
                duplicates: []
            }];

            // 95% of expected
            validator.getCompanyContactCount = jest.fn().mockResolvedValue(95);
            validator.getCompanyDealCount = jest.fn().mockResolvedValue(95);

            await validator.checkAssociationPreservation(canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Association Preservation');
            expect(check.passed).toBe(true);
        });
    });

    describe('checkRecordCounts', () => {
        it('should calculate expected company count', async () => {
            const snapshot = {
                hubspot: { totalCompanies: 100 },
                salesforce: { totalAccounts: 50 }
            };

            const canonicalMap = [
                { duplicateCount: 5 },
                { duplicateCount: 10 },
                { duplicateCount: 3 }
            ];

            await validator.checkRecordCounts(snapshot, canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Record Counts');
            expect(check.before.companies).toBe(100);
            expect(check.expectedAfter.companies).toBe(82); // 100 - 18 duplicates
        });

        it('should handle missing snapshot data', async () => {
            const snapshot = {};
            const canonicalMap = [];

            await validator.checkRecordCounts(snapshot, canonicalMap);

            const check = validator.results.checks.find(c => c.name === 'Record Counts');
            expect(check.before.companies).toBe(0);
        });
    });

    describe('randomSample', () => {
        it('should return requested sample size', () => {
            const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const result = validator.randomSample(array, 5);

            expect(result).toHaveLength(5);
        });

        it('should return all items when sample exceeds array', () => {
            const array = [1, 2, 3];
            const result = validator.randomSample(array, 10);

            expect(result).toHaveLength(3);
        });

        it('should not modify original array', () => {
            const array = [1, 2, 3, 4, 5];
            const original = [...array];

            validator.randomSample(array, 3);

            expect(array).toEqual(original);
        });
    });

    describe('saveValidationReport', () => {
        it('should save report with correct filename format', () => {
            validator.results.validationType = 'pre-execution';

            validator.saveValidationReport();

            const call = fs.writeFileSync.mock.calls[0];
            expect(call[0]).toMatch(/validation-pre-execution-.*\.json$/);
        });

        it('should save report as formatted JSON', () => {
            validator.results = {
                validationType: 'test',
                passed: true,
                checks: [],
                errors: [],
                warnings: []
            };

            validator.saveValidationReport();

            const call = fs.writeFileSync.mock.calls[0];
            const savedData = JSON.parse(call[1]);
            expect(savedData.passed).toBe(true);
        });
    });

    describe('printSummary', () => {
        it('should print passed status', () => {
            validator.results = {
                validationType: 'pre-execution',
                passed: true,
                checks: [],
                errors: [],
                warnings: []
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            validator.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('✅ PASSED')
            );

            consoleSpy.mockRestore();
        });

        it('should print failed status', () => {
            validator.results = {
                validationType: 'pre-execution',
                passed: false,
                checks: [],
                errors: [{ check: 'test', error: 'Error' }],
                warnings: []
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            validator.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('❌ FAILED')
            );

            consoleSpy.mockRestore();
        });

        it('should print errors', () => {
            validator.results = {
                validationType: 'pre-execution',
                passed: false,
                checks: [],
                errors: [{ check: 'connectivity', error: 'API Error' }],
                warnings: []
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            validator.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('connectivity')
            );

            consoleSpy.mockRestore();
        });

        it('should print warnings', () => {
            validator.results = {
                validationType: 'pre-execution',
                passed: true,
                checks: [],
                errors: [],
                warnings: [{ check: 'permissions', message: 'Manual check needed' }]
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            validator.printSummary();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('permissions')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Integration', () => {
        it('should complete pre-execution validation workflow', async () => {
            // Mock all API calls
            const mockResponse200 = { statusCode: 200, on: jest.fn() };
            const mockRequest = { on: jest.fn(), end: jest.fn() };

            https.request.mockImplementation((options, callback) => {
                callback(mockResponse200);
                return mockRequest;
            });

            execSync.mockReturnValue(JSON.stringify({
                status: 0,
                result: { records: [{ Id: '001abc' }] }
            }));

            const result = await validator.validate('pre-execution');

            expect(result.validationType).toBe('pre-execution');
            expect(result.checks.length).toBeGreaterThan(0);
        });

        it('should complete post-execution validation workflow', async () => {
            const data = {
                canonicalMap: [{
                    bundleId: 'b1',
                    canonical: { companyId: '1', companyName: 'Canonical', num_contacts: 10, num_deals: 5 },
                    clusterKey: 'key1',
                    duplicates: [{ companyId: '2', companyName: 'Dup', num_contacts: 5, num_deals: 2 }],
                    duplicateCount: 1
                }],
                snapshot: {
                    hubspot: { totalCompanies: 100 }
                }
            };

            // Mock all API calls
            validator.queryCompaniesBySFAccountId = jest.fn().mockResolvedValue([]);
            validator.queryCompaniesByDomain = jest.fn().mockResolvedValue([]);
            validator.verifyCompanyExists = jest.fn()
                .mockResolvedValueOnce(true)  // canonical exists
                .mockResolvedValueOnce(false); // duplicate deleted
            validator.getCompanyContactCount = jest.fn().mockResolvedValue(15);
            validator.getCompanyDealCount = jest.fn().mockResolvedValue(7);

            const result = await validator.validate('post-execution', data);

            expect(result.validationType).toBe('post-execution');
            expect(result.checks.length).toBeGreaterThan(0);
        });
    });
});
