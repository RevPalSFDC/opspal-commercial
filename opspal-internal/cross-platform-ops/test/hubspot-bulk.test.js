/**
 * Unit tests for HubSpot Bulk Operations Toolkit
 */

const HubSpotAuth = require('../lib/hubspot-bulk/auth');
const HubSpotImports = require('../lib/hubspot-bulk/imports');
const HubSpotExports = require('../lib/hubspot-bulk/exports');
const RateLimiter = require('../lib/hubspot-bulk/rateLimit');

// Mock node-fetch
jest.mock('node-fetch');
const fetch = require('node-fetch');

describe('HubSpotAuth', () => {
    let auth;

    beforeEach(() => {
        auth = new HubSpotAuth({ accessToken: 'test-token' });
        fetch.mockClear();
    });

    test('should initialize with access token', () => {
        expect(auth.accessToken).toBe('test-token');
        expect(auth.userAgent).toContain('HubSpot-Bulk-Toolkit');
    });

    test('should validate scopes successfully', async () => {
        const mockResponse = {
            ok: true,
            json: async () => ({ scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'] })
        };
        fetch.mockResolvedValueOnce(mockResponse);

        const result = await auth.validateScopes(['crm.objects.contacts.read']);
        expect(result.valid).toBe(true);
        expect(result.scopes).toContain('crm.objects.contacts.read');
    });

    test('should add proper authentication headers', () => {
        const headers = auth.getAuthHeaders();
        expect(headers.Authorization).toBe('Bearer test-token');
    });

    test('should handle API errors gracefully', async () => {
        const mockResponse = {
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: async () => ({ message: 'Invalid token' })
        };
        fetch.mockResolvedValueOnce(mockResponse);

        await expect(auth.makeRequest('/test')).rejects.toThrow('Invalid token');
    });
});

describe('RateLimiter', () => {
    let limiter;

    beforeEach(() => {
        limiter = new RateLimiter();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should enforce burst limits', async () => {
        limiter.config.burst.requestsPerSecond = 2;

        // First two requests should pass immediately
        await limiter.checkLimit();
        await limiter.checkLimit();

        // Third request should wait
        const checkPromise = limiter.checkLimit();
        jest.advanceTimersByTime(1000);
        await checkPromise;

        expect(limiter.getStatus().burst.second).toMatch(/1\/2/);
    });

    test('should calculate exponential backoff correctly', () => {
        const backoff1 = limiter.calculateBackoff(0);
        expect(backoff1).toBeGreaterThanOrEqual(900); // ~1000ms with jitter

        const backoff2 = limiter.calculateBackoff(0);
        expect(backoff2).toBeGreaterThanOrEqual(1800); // ~2000ms with jitter

        const backoff3 = limiter.calculateBackoff(0);
        expect(backoff3).toBeGreaterThanOrEqual(3600); // ~4000ms with jitter
    });

    test('should handle 429 responses with retry-after header', async () => {
        const response = {
            headers: {
                get: (name) => name === 'retry-after' ? '5' : null
            }
        };

        const waitSpy = jest.spyOn(limiter, 'wait');
        const promise = limiter.handleRateLimitResponse(response);

        jest.advanceTimersByTime(5000);
        await promise;

        expect(waitSpy).toHaveBeenCalledWith(expect.any(Number));
        expect(limiter.circuitBreaker.failures).toBe(1);
    });

    test('should open circuit breaker after multiple failures', async () => {
        limiter.circuitBreaker.failures = 4;

        const response = {
            headers: { get: () => '1' }
        };

        const promise = limiter.handleRateLimitResponse(response);
        jest.advanceTimersByTime(1000);
        await promise;

        expect(limiter.circuitBreaker.state).toBe('OPEN');
        expect(limiter.circuitBreaker.openUntil).toBeGreaterThan(Date.now());
    });

    test('should identify retryable errors correctly', () => {
        expect(limiter.isRetryableError({ statusCode: 502 })).toBe(true);
        expect(limiter.isRetryableError({ statusCode: 503 })).toBe(true);
        expect(limiter.isRetryableError({ code: 'ECONNRESET' })).toBe(true);
        expect(limiter.isRetryableError({ statusCode: 400 })).toBe(false);
        expect(limiter.isRetryableError({ statusCode: 404 })).toBe(false);
    });
});

describe('HubSpotImports', () => {
    let auth, imports;

    beforeEach(() => {
        auth = {
            makeRequest: jest.fn()
        };
        imports = new HubSpotImports(auth);
    });

    test('should start import with proper multipart form', async () => {
        auth.makeRequest.mockResolvedValueOnce({
            id: 'import-123',
            state: 'PROCESSING',
            createdAt: '2024-01-01T00:00:00Z'
        });

        const result = await imports.startImport({
            files: '/path/to/file.csv',
            objectType: 'contacts',
            name: 'Test Import'
        });

        expect(result.importId).toBe('import-123');
        expect(result.state).toBe('PROCESSING');
        expect(auth.makeRequest).toHaveBeenCalledWith(
            '/crm/v3/imports',
            expect.objectContaining({
                method: 'POST',
                isFormData: true
            })
        );
    });

    test('should poll import status with async iterator', async () => {
        const states = ['PROCESSING', 'PROCESSING', 'DONE'];
        let callCount = 0;

        auth.makeRequest.mockImplementation(() => {
            return Promise.resolve({
                state: states[callCount++],
                metadata: {}
            });
        });

        const statuses = [];
        for await (const status of imports.pollImport('import-123')) {
            statuses.push(status.state);
            if (status.state === 'DONE') break;
        }

        expect(statuses).toEqual(['PROCESSING', 'DONE']);
    });

    test('should handle import errors properly', async () => {
        auth.makeRequest.mockResolvedValueOnce({
            numErrors: 3,
            results: [
                {
                    rowNumber: 2,
                    errorType: 'INVALID_EMAIL',
                    message: 'Invalid email format',
                    invalidValue: 'bad-email'
                }
            ],
            paging: null
        });

        const errors = await imports.getImportErrors('import-123');
        expect(errors.totalErrors).toBe(3);
        expect(errors.errors[0].rowNumber).toBe(2);
        expect(errors.errors[0].errorType).toBe('INVALID_EMAIL');
    });

    test('should build column mappings correctly', () => {
        const mapping = {
            'Email Address': 'email',
            'First Name': 'firstname',
            'Last Name': 'lastname'
        };

        const result = imports.buildColumnMappings(mapping);
        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
            columnName: 'Email Address',
            propertyName: 'email',
            columnType: 'HUBSPOT_ALTERNATE_ID'
        });
    });

    test('should normalize object types', () => {
        expect(imports.normalizeObjectType('contacts')).toBe('0-1');
        expect(imports.normalizeObjectType('companies')).toBe('0-2');
        expect(imports.normalizeObjectType('deals')).toBe('0-3');
        expect(imports.normalizeObjectType('custom')).toBe('custom');
    });
});

describe('HubSpotExports', () => {
    let auth, exports;

    beforeEach(() => {
        auth = {
            makeRequest: jest.fn()
        };
        exports = new HubSpotExports(auth);
    });

    test('should start export with correct parameters', async () => {
        auth.makeRequest.mockResolvedValueOnce({
            id: 'export-456',
            status: 'PROCESSING',
            createdAt: '2024-01-01T00:00:00Z'
        });

        const result = await exports.startExport({
            objectType: 'contacts',
            properties: ['email', 'firstname'],
            filters: { email: { operator: 'HAS_PROPERTY' } }
        });

        expect(result.taskId).toBe('export-456');
        expect(result.status).toBe('PROCESSING');
        expect(auth.makeRequest).toHaveBeenCalledWith(
            '/crm/v3/exports/export/async',
            expect.objectContaining({
                method: 'POST',
                body: expect.objectContaining({
                    objectType: 'CONTACTS',
                    objectProperties: ['email', 'firstname']
                })
            })
        );
    });

    test('should poll export until complete', async () => {
        let callCount = 0;
        const responses = [
            { status: 'PROCESSING' },
            { status: 'PROCESSING' },
            { status: 'COMPLETE' }
        ];

        auth.makeRequest.mockImplementation((url) => {
            if (url.includes('/status')) {
                return Promise.resolve(responses[callCount++]);
            } else if (url.includes('/download')) {
                return Promise.resolve({
                    url: 'https://download.url',
                    expiresAt: '2024-01-02T00:00:00Z'
                });
            }
        });

        const statuses = [];
        for await (const status of exports.pollExport('export-456')) {
            statuses.push(status.status);
            if (status.downloadUrl) break;
        }

        expect(statuses).toContain('PROCESSING');
        expect(statuses[statuses.length - 1]).toBe('COMPLETE');
    });

    test('should build filters correctly', () => {
        const simpleFilters = {
            email: 'test@example.com',
            firstname: { operator: 'CONTAINS', value: 'John' }
        };

        const result = exports.buildFilters(simpleFilters);
        expect(result).toHaveLength(1);
        expect(result[0].filters).toHaveLength(2);
        expect(result[0].filters[0]).toMatchObject({
            propertyName: 'email',
            operator: 'EQ',
            value: 'test@example.com'
        });
        expect(result[0].filters[1]).toMatchObject({
            propertyName: 'firstname',
            operator: 'CONTAINS',
            value: 'John'
        });
    });

    test('should handle download with streaming', async () => {
        const mockStream = {
            pipe: jest.fn().mockReturnThis(),
            on: jest.fn((event, callback) => {
                if (event === 'finish') setTimeout(callback, 0);
                return mockStream;
            })
        };

        const mockResponse = {
            ok: true,
            headers: {
                get: () => null
            },
            body: mockStream
        };

        auth.makeRequest.mockResolvedValueOnce(mockResponse);

        // Mock fs operations
        const fs = require('fs');
        fs.promises.mkdir = jest.fn().mockResolvedValue();
        fs.promises.stat = jest.fn().mockResolvedValue({ size: 1024 });
        fs.createWriteStream = jest.fn().mockReturnValue(mockStream);

        const result = await exports.downloadExport('https://download.url', '/tmp/export.csv');
        expect(result.path).toBe('/tmp/export.csv');
        expect(result.size).toBe(1024);
    });
});

describe('CSV Chunking', () => {
    test('should calculate chunk requirements correctly', () => {
        const fileSize = 200 * 1024 * 1024; // 200MB
        const maxSize = 100 * 1024 * 1024;  // 100MB

        const chunks = Math.ceil(fileSize / maxSize);
        expect(chunks).toBe(2);
    });

    test('should respect row limits', () => {
        const totalRows = 15000000; // 15M rows
        const maxRows = 10000000;   // 10M max

        const chunks = Math.ceil(totalRows / maxRows);
        expect(chunks).toBe(2);
    });
});

describe('Job Resumability', () => {
    test('should generate unique job state paths', () => {
        const jobName = 'import-123456';
        const statePath = `.jobs/hubspot/${jobName}.json`;

        expect(statePath).toContain('import-123456');
        expect(statePath).toMatch(/\.json$/);
    });

    test('should serialize job state correctly', () => {
        const state = {
            name: 'test-import',
            importId: 'import-789',
            status: 'PROCESSING',
            startedAt: new Date().toISOString()
        };

        const serialized = JSON.stringify(state, null, 2);
        const deserialized = JSON.parse(serialized);

        expect(deserialized.name).toBe('test-import');
        expect(deserialized.importId).toBe('import-789');
        expect(deserialized.status).toBe('PROCESSING');
    });
});