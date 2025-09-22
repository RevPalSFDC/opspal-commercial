/**
 * Contact Hygiene Library Test Suite
 */

const assert = require('assert');
const {
    scoreContact,
    buildDuplicateGraph,
    selectMaster,
    classifyContact,
    normalizePhone,
    normalizeEmail,
    validatePicklistValues,
    UnionFind
} = require('../lib/contactHygiene');

/**
 * Test data factory
 */
function createContact(overrides = {}) {
    return {
        Id: '003' + Math.random().toString(36).substring(2, 17).toUpperCase(),
        FirstName: 'John',
        LastName: 'Doe',
        Email: 'john.doe@example.com',
        Phone: '555-123-4567',
        MobilePhone: '555-987-6543',
        AccountId: '001' + Math.random().toString(36).substring(2, 17).toUpperCase(),
        Title: 'Manager',
        Department: 'Sales',
        MailingCity: 'San Francisco',
        MailingState: 'CA',
        LastActivityDate: '2024-01-15',
        CreatedDate: '2020-01-01',
        LastModifiedDate: '2024-01-15',
        ...overrides
    };
}

describe('Contact Hygiene Library', () => {

    describe('normalizePhone', () => {
        it('should normalize various phone formats', () => {
            assert.strictEqual(normalizePhone('(555) 123-4567'), '5551234567');
            assert.strictEqual(normalizePhone('555.123.4567'), '5551234567');
            assert.strictEqual(normalizePhone('555-123-4567'), '5551234567');
            assert.strictEqual(normalizePhone('5551234567'), '5551234567');
        });

        it('should handle US country code', () => {
            assert.strictEqual(normalizePhone('1-555-123-4567'), '5551234567');
            assert.strictEqual(normalizePhone('15551234567'), '5551234567');
        });

        it('should return null for invalid phones', () => {
            assert.strictEqual(normalizePhone(''), null);
            assert.strictEqual(normalizePhone('123'), null);
            assert.strictEqual(normalizePhone('invalid'), null);
            assert.strictEqual(normalizePhone(null), null);
        });
    });

    describe('normalizeEmail', () => {
        it('should normalize emails to lowercase', () => {
            assert.strictEqual(normalizeEmail('John.Doe@Example.COM'), 'john.doe@example.com');
            assert.strictEqual(normalizeEmail('  test@test.com  '), 'test@test.com');
        });

        it('should return null for invalid emails', () => {
            assert.strictEqual(normalizeEmail(''), null);
            assert.strictEqual(normalizeEmail('notanemail'), null);
            assert.strictEqual(normalizeEmail('missing@domain'), null);
            assert.strictEqual(normalizeEmail(null), null);
        });
    });

    describe('scoreContact', () => {
        it('should calculate correct score for complete contact', () => {
            const contact = createContact();
            const score = scoreContact(contact);
            assert.strictEqual(score, 50); // All fields present
        });

        it('should handle missing fields', () => {
            const contact = createContact({
                Email: null,
                Phone: null,
                LastActivityDate: null
            });
            const score = scoreContact(contact);
            assert.strictEqual(score, 22); // Missing email, phone, activity
        });

        it('should add HubSpot bonus', () => {
            const contact = createContact({ HubSpot_Contact_ID__c: 'HS123' });
            const score = scoreContact(contact);
            assert.strictEqual(score, 55); // Standard 50 + 5 for HubSpot
        });
    });

    describe('UnionFind', () => {
        it('should correctly union sets', () => {
            const uf = new UnionFind();
            uf.union('A', 'B', 'email');
            uf.union('B', 'C', 'phone');

            assert.strictEqual(uf.find('A'), uf.find('C'));
        });

        it('should track edge types', () => {
            const uf = new UnionFind();
            uf.union('A', 'B', 'email');
            uf.union('B', 'C', 'phone');
            uf.union('A', 'C', 'name_company');

            const components = uf.getComponents();
            assert.strictEqual(components.length, 1);
            assert.strictEqual(components[0].nodes.length, 3);
            assert.strictEqual(components[0].edgeTypes.size, 3);
            assert(components[0].edgeTypes.has('email'));
            assert(components[0].edgeTypes.has('phone'));
            assert(components[0].edgeTypes.has('name_company'));
        });
    });

    describe('buildDuplicateGraph', () => {
        it('should find duplicates by email', () => {
            const contacts = [
                createContact({ Id: 'C1', Email: 'test@example.com' }),
                createContact({ Id: 'C2', Email: 'test@example.com' }),
                createContact({ Id: 'C3', Email: 'other@example.com' })
            ];

            const components = buildDuplicateGraph(contacts);
            assert.strictEqual(components.length, 1);
            assert.strictEqual(components[0].nodes.length, 2);
            assert(components[0].edgeTypes.has('email'));
        });

        it('should find duplicates by phone', () => {
            const contacts = [
                createContact({ Id: 'C1', Phone: '555-123-4567', Email: 'a@test.com' }),
                createContact({ Id: 'C2', Phone: '(555) 123-4567', Email: 'b@test.com' }),
                createContact({ Id: 'C3', Phone: '555-999-8888', Email: 'c@test.com' })
            ];

            const components = buildDuplicateGraph(contacts);
            assert.strictEqual(components.length, 1);
            assert.strictEqual(components[0].nodes.length, 2);
            assert(components[0].edgeTypes.has('phone'));
        });

        it('should handle transitive duplicates', () => {
            const contacts = [
                createContact({ Id: 'C1', Email: 'test@example.com', Phone: '555-111-1111' }),
                createContact({ Id: 'C2', Email: 'test@example.com', Phone: '555-222-2222' }),
                createContact({ Id: 'C3', Email: 'other@example.com', Phone: '555-222-2222' })
            ];

            const components = buildDuplicateGraph(contacts);
            assert.strictEqual(components.length, 1);
            assert.strictEqual(components[0].nodes.length, 3);
        });

        it('should identify name+company duplicates as low confidence', () => {
            const contacts = [
                createContact({
                    Id: 'C1',
                    FirstName: 'John',
                    LastName: 'Smith',
                    AccountId: 'ACC1',
                    Email: 'john1@test.com'
                }),
                createContact({
                    Id: 'C2',
                    FirstName: 'John',
                    LastName: 'Smith',
                    AccountId: 'ACC1',
                    Email: 'john2@test.com'
                })
            ];

            const components = buildDuplicateGraph(contacts);
            assert.strictEqual(components.length, 1);
            assert(components[0].edgeTypes.has('name_company'));
            assert(!components[0].edgeTypes.has('email'));
        });
    });

    describe('selectMaster', () => {
        it('should select higher scored contact as master', () => {
            const contacts = [
                createContact({ Id: 'C1', Email: null }), // Lower score
                createContact({ Id: 'C2' }) // Higher score
            ];

            const contactMap = new Map();
            contacts.forEach(c => contactMap.set(c.Id, c));

            const master = selectMaster(['C1', 'C2'], contactMap);
            assert.strictEqual(master, 'C2');
        });

        it('should use LastModifiedDate as tie-breaker', () => {
            const contacts = [
                createContact({ Id: 'C1', LastModifiedDate: '2023-01-01' }),
                createContact({ Id: 'C2', LastModifiedDate: '2024-01-01' })
            ];

            const contactMap = new Map();
            contacts.forEach(c => contactMap.set(c.Id, c));

            const master = selectMaster(['C1', 'C2'], contactMap);
            assert.strictEqual(master, 'C2'); // Newer modification wins
        });

        it('should use CreatedDate as secondary tie-breaker', () => {
            const contacts = [
                createContact({ Id: 'C1', CreatedDate: '2022-01-01', LastModifiedDate: '2024-01-01' }),
                createContact({ Id: 'C2', CreatedDate: '2020-01-01', LastModifiedDate: '2024-01-01' })
            ];

            const contactMap = new Map();
            contacts.forEach(c => contactMap.set(c.Id, c));

            const master = selectMaster(['C1', 'C2'], contactMap);
            assert.strictEqual(master, 'C2'); // Older creation wins as tie-breaker
        });
    });

    describe('classifyContact', () => {
        it('should classify contact with no email/phone as Delete', () => {
            const contact = createContact({
                Email: null,
                Phone: null,
                MobilePhone: null
            });

            const result = classifyContact(contact);
            assert.strictEqual(result.Clean_Status__c, 'Delete');
            assert.strictEqual(result.Delete_Reason__c, 'No Email or Phone');
            assert.strictEqual(result.Sync_Status__c, 'Not Synced');
        });

        it('should identify test records', () => {
            const contact = createContact({
                FirstName: 'Test',
                LastName: 'User'
            });

            const result = classifyContact(contact);
            assert.strictEqual(result.Clean_Status__c, 'Delete');
            assert.strictEqual(result.Delete_Reason__c, 'Test/Placeholder Record');
        });

        it('should identify no-reply domains', () => {
            const contact = createContact({
                Email: 'system@noreply.example.com'
            });

            const result = classifyContact(contact);
            assert.strictEqual(result.Clean_Status__c, 'Delete');
            assert.strictEqual(result.Delete_Reason__c, 'No-Reply/Spam Domain');
        });

        it('should identify inactive contacts (3+ years)', () => {
            const contact = createContact({
                CreatedDate: '2019-01-01',
                LastActivityDate: null
            });

            const result = classifyContact(contact);
            assert.strictEqual(result.Clean_Status__c, 'Delete');
            assert.strictEqual(result.Delete_Reason__c, 'No Activity 3+ Years');
        });

        it('should archive old inactive contacts', () => {
            const contact = createContact({
                CreatedDate: '2018-01-01',
                LastActivityDate: '2022-01-01'
            });

            const result = classifyContact(contact);
            assert.strictEqual(result.Clean_Status__c, 'Archive');
            assert.strictEqual(result.Delete_Reason__c, 'Old Inactive Contact');
        });

        it('should mark duplicates correctly', () => {
            const contact = createContact({ Id: 'C1' });
            const context = {
                duplicateMap: new Map([
                    ['C1', { masterId: 'C2', edgeTypes: new Set(['email', 'phone']) }]
                ])
            };

            const result = classifyContact(contact, context);
            assert.strictEqual(result.Clean_Status__c, 'Duplicate');
            assert.strictEqual(result.Delete_Reason__c, 'Master: C2');
            assert.strictEqual(result.Is_Duplicate__c, true);
            assert.strictEqual(result.Master_Contact_Id__c, 'C2');
            assert.strictEqual(result.Duplicate_Type__c, 'email, phone');
        });

        it('should mark low-confidence duplicates as Review', () => {
            const contact = createContact({ Id: 'C1' });
            const context = {
                duplicateMap: new Map([
                    ['C1', { masterId: 'C2', edgeTypes: new Set(['name_company']) }]
                ])
            };

            const result = classifyContact(contact, context);
            assert.strictEqual(result.Clean_Status__c, 'Review');
            assert(result.Delete_Reason__c.includes('Potential Duplicate'));
        });

        it('should skip already classified contacts', () => {
            const contact = createContact({
                Clean_Status__c: 'OK'
            });

            const result = classifyContact(contact);
            assert.strictEqual(result, null);
        });

        it('should identify email opt-outs', () => {
            const contact = createContact({
                HasOptedOutOfEmail: true
            });

            const result = classifyContact(contact);
            assert.strictEqual(result.Clean_Status__c, 'Review');
            assert.strictEqual(result.Delete_Reason__c, 'Email Opt-Out');
        });

        it('should classify good contacts as OK', () => {
            const contact = createContact();
            const result = classifyContact(contact);
            assert.strictEqual(result.Clean_Status__c, 'OK');
            assert.strictEqual(result.Delete_Reason__c, undefined);
        });
    });

    describe('validatePicklistValues', () => {
        const picklistValues = {
            Clean_Status__c: ['OK', 'Delete', 'Archive', 'Review', 'Merge'],
            Sync_Status__c: ['Synced', 'Not Synced', 'Pending']
        };

        it('should validate correct picklist values', () => {
            const record = {
                Clean_Status__c: 'OK',
                Sync_Status__c: 'Synced'
            };

            const result = validatePicklistValues(record, picklistValues);
            assert.strictEqual(result.Clean_Status__c, 'OK');
            assert.strictEqual(result.Sync_Status__c, 'Synced');
        });

        it('should fix invalid Clean_Status__c', () => {
            const record = {
                Clean_Status__c: 'Duplicate', // Not in allowed list
                Sync_Status__c: 'Not Synced'
            };

            const result = validatePicklistValues(record, picklistValues);
            assert.strictEqual(result.Clean_Status__c, 'Review');
            assert.strictEqual(result.Sync_Status__c, 'Not Synced');
        });

        it('should fix invalid Sync_Status__c', () => {
            const record = {
                Clean_Status__c: 'OK',
                Sync_Status__c: 'Invalid'
            };

            const result = validatePicklistValues(record, picklistValues);
            assert.strictEqual(result.Sync_Status__c, 'Not Synced');
        });
    });
});

// Run tests if executed directly
if (require.main === module) {
    const runTests = require('child_process').spawn('npx', ['mocha', __filename], {
        stdio: 'inherit'
    });

    runTests.on('exit', (code) => {
        process.exit(code);
    });
}