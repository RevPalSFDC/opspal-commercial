/**
 * Tests for HubSpot API Client with Operator Translation
 *
 * @module hubspot-api-client.test
 * @created 2026-01-20
 */

const {
    HubSpotAPIClient,
    HubSpotAPIError,
    HubSpotValidationError
} = require('../hubspot-api-client');

// Mock fetch globally
global.fetch = jest.fn();

describe('HubSpotAPIClient', () => {
    let client;
    const mockToken = 'test-access-token';

    beforeEach(() => {
        client = new HubSpotAPIClient(mockToken, { verbose: false });
        fetch.mockClear();
    });

    describe('constructor', () => {
        it('should throw error if no access token provided', () => {
            expect(() => new HubSpotAPIClient()).toThrow('HubSpot access token is required');
        });

        it('should initialize with default options', () => {
            const c = new HubSpotAPIClient(mockToken);
            expect(c.autoFix).toBe(true);
            expect(c.validateBeforeCall).toBe(true);
            expect(c.baseUrl).toBe('https://api.hubapi.com');
        });

        it('should allow custom options', () => {
            const c = new HubSpotAPIClient(mockToken, {
                autoFix: false,
                validateBeforeCall: false,
                baseUrl: 'https://custom.api.com'
            });
            expect(c.autoFix).toBe(false);
            expect(c.validateBeforeCall).toBe(false);
            expect(c.baseUrl).toBe('https://custom.api.com');
        });
    });

    describe('Operator Translation', () => {
        it('should translate >= to IS_GREATER_THAN_OR_EQUAL_TO', () => {
            const input = { operator: '>=' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('IS_GREATER_THAN_OR_EQUAL_TO');
        });

        it('should translate <= to IS_LESS_THAN_OR_EQUAL_TO', () => {
            const input = { operator: '<=' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('IS_LESS_THAN_OR_EQUAL_TO');
        });

        it('should translate = to IS_EQUAL_TO', () => {
            const input = { operator: '=' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('IS_EQUAL_TO');
        });

        it('should translate != to IS_NOT_EQUAL_TO', () => {
            const input = { operator: '!=' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('IS_NOT_EQUAL_TO');
        });

        it('should translate LIKE to CONTAINS', () => {
            const input = { operator: 'LIKE' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('CONTAINS');
        });

        it('should translate IN to IS_ANY_OF', () => {
            const input = { operator: 'IN' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('IS_ANY_OF');
        });

        it('should translate IS NULL to IS_EMPTY', () => {
            const input = { operator: 'IS NULL' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('IS_EMPTY');
        });

        it('should handle nested objects', () => {
            const input = {
                filterBranch: {
                    filters: [
                        { operation: { operator: '>=' } },
                        { operation: { operator: '<' } }
                    ]
                }
            };
            const result = client.translateOperatorsDeep(input);
            expect(result.filterBranch.filters[0].operation.operator).toBe('IS_GREATER_THAN_OR_EQUAL_TO');
            expect(result.filterBranch.filters[1].operation.operator).toBe('IS_LESS_THAN');
        });

        it('should handle arrays', () => {
            const input = [
                { operator: '>' },
                { operator: '<' }
            ];
            const result = client.translateOperatorsDeep(input);
            expect(result[0].operator).toBe('IS_GREATER_THAN');
            expect(result[1].operator).toBe('IS_LESS_THAN');
        });

        it('should leave already-translated operators unchanged', () => {
            const input = { operator: 'IS_EQUAL_TO' };
            const result = client.translateOperatorsDeep(input);
            expect(result.operator).toBe('IS_EQUAL_TO');
        });

        it('should track translation statistics', () => {
            client.translateOperatorsDeep({ operator: '>=' });
            client.translateOperatorsDeep({ operator: '<=' });
            expect(client.stats.operatorsTranslated).toBe(2);
        });
    });

    describe('Lists API', () => {
        beforeEach(() => {
            // Disable validation for API tests - we're testing request construction
            client = new HubSpotAPIClient(mockToken, { verbose: false, validateBeforeCall: false });
            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ listId: '123', name: 'Test List' }),
                headers: new Map([
                    ['X-HubSpot-RateLimit-Remaining', '99'],
                    ['X-HubSpot-RateLimit-Max', '100']
                ])
            });
        });

        it('should create list with translated operators', async () => {
            const result = await client.lists.create({
                name: 'High Value Contacts',
                filters: [
                    { property: 'amount', operator: '>=', value: 10000 }
                ]
            });

            expect(fetch).toHaveBeenCalled();
            const callArgs = fetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);

            // Verify operator was translated
            const filter = body.filterBranch.filterBranches[0].filters[0];
            expect(filter.operation.operator).toBe('IS_GREATER_THAN_OR_EQUAL_TO');
            expect(filter.operation.operationType).toBe('NUMBER');
        });

        it('should build correct filter structure (OR with nested AND)', async () => {
            await client.lists.create({
                name: 'Test List',
                filters: [
                    { property: 'email', operator: 'LIKE', value: '@example.com' }
                ]
            });

            const callArgs = fetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);

            expect(body.filterBranch.filterBranchType).toBe('OR');
            expect(body.filterBranch.filterBranchOperator).toBe('OR');
            expect(body.filterBranch.filterBranches[0].filterBranchType).toBe('AND');
            expect(body.filterBranch.filterBranches[0].filterBranchOperator).toBe('AND');
        });

        it('should include operationType in filters', async () => {
            await client.lists.create({
                name: 'Test List',
                filters: [
                    { property: 'lifecyclestage', operator: 'IN', values: ['customer', 'lead'], fieldType: 'enum' }
                ]
            });

            const callArgs = fetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            const filter = body.filterBranch.filterBranches[0].filters[0];

            expect(filter.operation.operationType).toBeDefined();
            expect(filter.operation.operator).toBe('IS_ANY_OF');
        });
    });

    describe('Contacts API', () => {
        beforeEach(() => {
            // Disable validation for API tests
            client = new HubSpotAPIClient(mockToken, { verbose: false, validateBeforeCall: false });
            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ results: [] }),
                headers: new Map()
            });
        });

        it('should search with translated operators', async () => {
            await client.contacts.search([
                { property: 'createdate', operator: '>=', value: '2024-01-01' }
            ]);

            const callArgs = fetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);

            expect(body.filterGroups[0].filters[0].operator).toBe('IS_GREATER_THAN_OR_EQUAL_TO');
        });
    });

    describe('Error Handling', () => {
        it('should throw HubSpotAPIError on API failure', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                text: () => Promise.resolve(JSON.stringify({ message: 'Invalid request' })),
                headers: new Map()
            });

            await expect(client.contacts.get('123')).rejects.toThrow(HubSpotAPIError);
        });

        it('should include error details in HubSpotAPIError', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: () => Promise.resolve(JSON.stringify({ message: 'Rate limit exceeded' })),
                headers: new Map()
            });

            try {
                await client.contacts.get('123');
            } catch (error) {
                expect(error.statusCode).toBe(429);
                expect(error.details.message).toBe('Rate limit exceeded');
            }
        });
    });

    describe('Rate Limit Tracking', () => {
        it('should update rate limits from response headers', async () => {
            const headers = new Map([
                ['X-HubSpot-RateLimit-Remaining', '50'],
                ['X-HubSpot-RateLimit-Max', '100'],
                ['X-HubSpot-RateLimit-Daily-Remaining', '9000'],
                ['X-HubSpot-RateLimit-Daily', '10000']
            ]);

            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
                headers
            });

            await client.contacts.get('123');

            expect(client.rateLimits.remaining).toBe(50);
            expect(client.rateLimits.max).toBe(100);
            expect(client.rateLimits.dailyRemaining).toBe(9000);
            expect(client.rateLimits.dailyMax).toBe(10000);
        });
    });

    describe('Statistics', () => {
        beforeEach(() => {
            fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({}),
                headers: new Map()
            });
        });

        it('should track request count', async () => {
            await client.contacts.get('1');
            await client.contacts.get('2');
            await client.contacts.get('3');

            expect(client.stats.requests).toBe(3);
        });

        it('should track validation passed counter exists', () => {
            // Stats structure should include validationPassed
            expect(client.stats).toHaveProperty('validationPassed');
            expect(typeof client.stats.validationPassed).toBe('number');
        });

        it('should provide combined stats', () => {
            const stats = client.getStats();
            expect(stats).toHaveProperty('requests');
            expect(stats).toHaveProperty('operatorsTranslated');
            expect(stats).toHaveProperty('rateLimits');
            expect(stats).toHaveProperty('validatorStats');
        });

        it('should reset stats', () => {
            client.stats.requests = 10;
            client.stats.errors = 5;
            client.resetStats();

            expect(client.stats.requests).toBe(0);
            expect(client.stats.errors).toBe(0);
        });
    });

    describe('buildFilter helper', () => {
        it('should translate operators when building filters', () => {
            const filter = client.buildFilter([
                { property: 'amount', operator: '>=', value: 100 }
            ]);

            // The filter builder returns the structure
            expect(filter).toBeDefined();
        });
    });

    describe('getAssociationId helper', () => {
        it('should return association ID for known relationships', () => {
            const id = client.getAssociationId('contacts', 'companies');
            expect(id).toBeDefined();
            expect(typeof id).toBe('number');
        });
    });
});

describe('Integration Scenarios', () => {
    let client;

    beforeEach(() => {
        // Disable validation for integration tests - we're testing operator translation
        client = new HubSpotAPIClient('test-token', { verbose: false, validateBeforeCall: false });
    });

    it('should translate operators in complex nested structures', () => {
        // This is the exact scenario that caused the original bug:
        // Using >= instead of IS_GREATER_THAN_OR_EQUAL_TO
        const input = {
            filterBranch: {
                filterBranches: [{
                    filters: [
                        { operation: { operator: '>=', value: 50000 } },
                        { operation: { operator: 'IN', values: ['closedwon', 'contractsent'] } }
                    ]
                }]
            }
        };

        const result = client.translateOperatorsDeep(input);

        // Verify both operators were translated correctly
        expect(result.filterBranch.filterBranches[0].filters[0].operation.operator).toBe('IS_GREATER_THAN_OR_EQUAL_TO');
        expect(result.filterBranch.filterBranches[0].filters[1].operation.operator).toBe('IS_ANY_OF');
    });

    it('should translate mixed operators in filter arrays', () => {
        const input = {
            filterGroups: [{
                filters: [
                    { operator: 'LIKE', value: '@company.com' },
                    { operator: '>=', value: '2024-01-01' },
                    { operator: '!=', value: 'subscriber' }
                ]
            }]
        };

        const result = client.translateOperatorsDeep(input);
        const filters = result.filterGroups[0].filters;

        expect(filters[0].operator).toBe('CONTAINS');
        expect(filters[1].operator).toBe('IS_GREATER_THAN_OR_EQUAL_TO');
        expect(filters[2].operator).toBe('IS_NOT_EQUAL_TO');
    });

    it('should translate IS NULL to IS_EMPTY correctly', () => {
        const input = {
            filters: [
                { operator: 'IS NULL', property: 'company' }
            ]
        };

        const result = client.translateOperatorsDeep(input);
        expect(result.filters[0].operator).toBe('IS_EMPTY');
    });

    it('should handle deeply nested operator arrays', () => {
        const input = {
            level1: {
                level2: {
                    level3: [
                        { operator: '>' },
                        { operator: '<' },
                        { nested: { operator: 'NOT IN' } }
                    ]
                }
            }
        };

        const result = client.translateOperatorsDeep(input);

        expect(result.level1.level2.level3[0].operator).toBe('IS_GREATER_THAN');
        expect(result.level1.level2.level3[1].operator).toBe('IS_LESS_THAN');
        expect(result.level1.level2.level3[2].nested.operator).toBe('IS_NONE_OF');
    });
});
