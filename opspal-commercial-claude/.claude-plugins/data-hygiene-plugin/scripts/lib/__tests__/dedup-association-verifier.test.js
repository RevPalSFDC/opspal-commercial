/**
 * Tests for AssociationVerifier - Verify and repair HubSpot association types
 *
 * Critical component that ensures contacts have PRIMARY (Type 1) associations
 * after deduplication operations. Discovered 96.8% of contacts needed repair
 * in production.
 */

const fs = require('fs');
const https = require('https');

// Mock dependencies
jest.mock('fs');
jest.mock('https');

const AssociationVerifier = require('../dedup-association-verifier');

describe('AssociationVerifier', () => {
    let verifier;

    const mockConfig = {
        hubspot: {
            accessToken: 'test-token',
            portalId: '12345678'
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs
        fs.writeFileSync.mockImplementation(() => {});

        // Silence console
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();

        verifier = new AssociationVerifier(mockConfig);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with config', () => {
            expect(verifier.hubspot).toEqual(mockConfig.hubspot);
        });

        it('should initialize statistics', () => {
            expect(verifier.stats.contactsVerified).toBe(0);
            expect(verifier.stats.hadPrimary).toBe(0);
            expect(verifier.stats.missingPrimary).toBe(0);
            expect(verifier.stats.repaired).toBe(0);
            expect(verifier.stats.failed).toBe(0);
            expect(verifier.stats.errors).toEqual([]);
        });
    });

    describe('getAllAssociationTypes', () => {
        it('should fetch all association types for contact-company relationship', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [
                                    {
                                        toObjectId: '100',
                                        associationTypes: [
                                            { typeId: 1, label: 'Primary' },
                                            { typeId: 279, label: 'Unlabeled' }
                                        ]
                                    }
                                ]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const types = await verifier.getAllAssociationTypes('contact1', '100');

            expect(types.length).toBe(2);
            expect(types[0].typeId).toBe(1);
        });

        it('should return empty array if no associations found', async () => {
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
                return { on: jest.fn(), end: jest.fn() };
            });

            const types = await verifier.getAllAssociationTypes('contact1', '100');

            expect(types).toEqual([]);
        });

        it('should filter by company ID', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [
                                    { toObjectId: '100', associationTypes: [{ typeId: 1 }] },
                                    { toObjectId: '200', associationTypes: [{ typeId: 279 }] }
                                ]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const types = await verifier.getAllAssociationTypes('contact1', '100');

            expect(types.length).toBe(1);
            expect(types[0].typeId).toBe(1);
        });

        it('should handle API errors', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 500,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Internal Server Error');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            await expect(verifier.getAllAssociationTypes('c1', '100')).rejects.toThrow('HTTP 500');
        });
    });

    describe('hasPrimaryAssociation', () => {
        it('should return true if PRIMARY (Type 1) exists', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{
                                    toObjectId: '100',
                                    associationTypes: [{ typeId: 1 }]
                                }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const hasPrimary = await verifier.hasPrimaryAssociation('contact1', '100');

            expect(hasPrimary).toBe(true);
        });

        it('should return false if PRIMARY not present', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{
                                    toObjectId: '100',
                                    associationTypes: [{ typeId: 279 }] // Only Unlabeled
                                }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const hasPrimary = await verifier.hasPrimaryAssociation('contact1', '100');

            expect(hasPrimary).toBe(false);
        });

        it('should return false on error (assumes missing for repair)', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 500,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Error');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const hasPrimary = await verifier.hasPrimaryAssociation('contact1', '100');

            expect(hasPrimary).toBe(false);
        });
    });

    describe('addPrimaryAssociation', () => {
        it('should add PRIMARY association successfully', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler(JSON.stringify({ success: true }));
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const result = await verifier.addPrimaryAssociation('contact1', '100');

            expect(result.success).toBe(true);
            expect(result.statusCode).toBe(200);
        });

        it('should handle failure response', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 400,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('Bad Request');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const result = await verifier.addPrimaryAssociation('contact1', '100');

            expect(result.success).toBe(false);
            expect(result.statusCode).toBe(400);
        });

        it('should send correct request body', async () => {
            let requestBody = '';
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') handler('{}');
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return {
                    on: jest.fn(),
                    write: (data) => { requestBody = data; },
                    end: jest.fn()
                };
            });

            await verifier.addPrimaryAssociation('contact1', '100');

            const parsed = JSON.parse(requestBody);
            expect(parsed[0].associationCategory).toBe('HUBSPOT_DEFINED');
            expect(parsed[0].associationTypeId).toBe(1); // PRIMARY
        });
    });

    describe('verifyAndRepair', () => {
        it('should return result with hadPrimary=true if already has PRIMARY', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{
                                    toObjectId: '100',
                                    associationTypes: [{ typeId: 1 }]
                                }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const result = await verifier.verifyAndRepair('contact1', '100');

            expect(result.hadPrimary).toBe(true);
            expect(result.repaired).toBe(false);
            expect(verifier.stats.hadPrimary).toBe(1);
        });

        it('should repair and return repaired=true if missing PRIMARY', async () => {
            let callCount = 0;
            https.request.mockImplementation((options, callback) => {
                callCount++;
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            if (callCount === 1) {
                                // First call: check associations (no PRIMARY)
                                handler(JSON.stringify({
                                    results: [{
                                        toObjectId: '100',
                                        associationTypes: [{ typeId: 279 }]
                                    }]
                                }));
                            } else {
                                // Second call: add PRIMARY
                                handler(JSON.stringify({ success: true }));
                            }
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const result = await verifier.verifyAndRepair('contact1', '100');

            expect(result.hadPrimary).toBe(false);
            expect(result.repaired).toBe(true);
            expect(verifier.stats.repaired).toBe(1);
        });

        it('should track failures', async () => {
            let callCount = 0;
            https.request.mockImplementation((options, callback) => {
                callCount++;
                const mockRes = {
                    statusCode: callCount === 1 ? 200 : 500,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            if (callCount === 1) {
                                handler(JSON.stringify({
                                    results: [{
                                        toObjectId: '100',
                                        associationTypes: [{ typeId: 279 }]
                                    }]
                                }));
                            } else {
                                handler('Server Error');
                            }
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
            });

            const result = await verifier.verifyAndRepair('contact1', '100');

            expect(result.repaired).toBe(false);
            expect(result.error).toBeDefined();
            expect(verifier.stats.failed).toBe(1);
        });

        it('should include context in result', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{ toObjectId: '100', associationTypes: [{ typeId: 1 }] }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const result = await verifier.verifyAndRepair('contact1', '100', { bundle: 'test-bundle' });

            expect(result.bundle).toBe('test-bundle');
        });
    });

    describe('verifyAndRepairBatch', () => {
        it('should process all associations in batch', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{ toObjectId: '100', associationTypes: [{ typeId: 1 }] }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            // Mock sleep to speed up tests
            jest.spyOn(verifier, 'sleep').mockResolvedValue();

            const associations = [
                { contactId: 'c1', companyId: '100' },
                { contactId: 'c2', companyId: '100' },
                { contactId: 'c3', companyId: '100' }
            ];

            const results = await verifier.verifyAndRepairBatch(associations, 0);

            expect(results.length).toBe(3);
            expect(verifier.stats.contactsVerified).toBe(3);
        });

        it('should apply rate limiting between calls', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{ toObjectId: '100', associationTypes: [{ typeId: 1 }] }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            const sleepSpy = jest.spyOn(verifier, 'sleep').mockResolvedValue();

            const associations = [
                { contactId: 'c1', companyId: '100' },
                { contactId: 'c2', companyId: '100' }
            ];

            await verifier.verifyAndRepairBatch(associations, 100);

            expect(sleepSpy).toHaveBeenCalledWith(100);
        });
    });

    describe('verifyCompanyContacts', () => {
        it('should verify all contacts for a company', async () => {
            https.request.mockImplementation((options, callback) => {
                const mockRes = {
                    statusCode: 200,
                    on: jest.fn((event, handler) => {
                        if (event === 'data') {
                            handler(JSON.stringify({
                                results: [{ toObjectId: '100', associationTypes: [{ typeId: 1 }] }]
                            }));
                        }
                        if (event === 'end') handler();
                        return mockRes;
                    })
                };
                callback(mockRes);
                return { on: jest.fn(), end: jest.fn() };
            });

            jest.spyOn(verifier, 'sleep').mockResolvedValue();

            const summary = await verifier.verifyCompanyContacts('100', ['c1', 'c2']);

            expect(summary.companyId).toBe('100');
            expect(summary.totalContacts).toBe(2);
            expect(summary.verified).toBe(2);
        });
    });

    describe('getStats', () => {
        it('should return statistics with success rate', () => {
            verifier.stats = {
                contactsVerified: 100,
                hadPrimary: 10,
                missingPrimary: 90,
                repaired: 85,
                failed: 5,
                errors: []
            };

            const stats = verifier.getStats();

            expect(stats.successRate).toBe('94.4'); // 85/90 * 100
            expect(stats.primaryMissingRate).toBe('90.0'); // 90/100 * 100
        });

        it('should handle zero verification edge case', () => {
            verifier.stats.contactsVerified = 0;

            const stats = verifier.getStats();

            expect(stats.successRate).toBe(0);
            expect(stats.primaryMissingRate).toBe(0);
        });
    });

    describe('printSummary', () => {
        it('should print statistics summary', () => {
            verifier.stats = {
                contactsVerified: 100,
                hadPrimary: 10,
                missingPrimary: 90,
                repaired: 85,
                failed: 5,
                errors: []
            };

            verifier.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Contacts Verified: 100'));
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Missing PRIMARY: 90'));
        });

        it('should display errors if present', () => {
            verifier.stats = {
                contactsVerified: 10,
                hadPrimary: 5,
                missingPrimary: 5,
                repaired: 3,
                failed: 2,
                errors: [
                    { contactId: 'c1', companyId: '100', error: 'API Error 1' },
                    { contactId: 'c2', companyId: '100', error: 'API Error 2' }
                ]
            };

            verifier.printSummary();

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Errors: 2'));
        });
    });

    describe('saveResults', () => {
        it('should save results to file', () => {
            verifier.stats = {
                contactsVerified: 50,
                hadPrimary: 45,
                missingPrimary: 5,
                repaired: 5,
                failed: 0,
                errors: []
            };

            verifier.saveResults('/tmp/results.json');

            expect(fs.writeFileSync).toHaveBeenCalled();
            const [filePath, content] = fs.writeFileSync.mock.calls[0];
            expect(filePath).toBe('/tmp/results.json');

            const saved = JSON.parse(content);
            expect(saved.statistics.contactsVerified).toBe(50);
            expect(saved.timestamp).toBeDefined();
        });
    });

    describe('sleep', () => {
        it('should wait for specified milliseconds', async () => {
            const start = Date.now();
            await verifier.sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });
    });
});
