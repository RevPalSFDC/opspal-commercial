/**
 * Survivorship Engine Tests
 *
 * Tests for golden record selection and field-level survivorship.
 */

const { SurvivorshipEngine, FieldValue, FieldLineage } = require('../survivorship-engine');

describe('SurvivorshipEngine', () => {

    // ============================================
    // FieldValue Class Tests
    // ============================================
    describe('FieldValue', () => {
        test('constructor initializes all properties', () => {
            const fieldValue = new FieldValue('test@example.com', 'crm_user_entered');

            expect(fieldValue.value).toBe('test@example.com');
            expect(fieldValue.source).toBe('crm_user_entered');
            expect(fieldValue.metadata.recordId).toBeNull();
            expect(fieldValue.metadata.lastModified).toBeNull();
            expect(fieldValue.metadata.isVerified).toBe(false);
            expect(fieldValue.metadata.qualityScore).toBeNull();
        });

        test('constructor accepts custom metadata', () => {
            const fieldValue = new FieldValue('value', 'source', {
                recordId: 'rec-123',
                lastModified: '2024-01-15',
                isVerified: true,
                qualityScore: 85,
                customField: 'custom'
            });

            expect(fieldValue.metadata.recordId).toBe('rec-123');
            expect(fieldValue.metadata.lastModified).toBe('2024-01-15');
            expect(fieldValue.metadata.isVerified).toBe(true);
            expect(fieldValue.metadata.qualityScore).toBe(85);
            expect(fieldValue.metadata.customField).toBe('custom');
        });

        describe('isEmpty', () => {
            test('returns true for null value', () => {
                expect(new FieldValue(null, 'source').isEmpty()).toBe(true);
            });

            test('returns true for undefined value', () => {
                expect(new FieldValue(undefined, 'source').isEmpty()).toBe(true);
            });

            test('returns true for empty string', () => {
                expect(new FieldValue('', 'source').isEmpty()).toBe(true);
            });

            test('returns true for empty array', () => {
                expect(new FieldValue([], 'source').isEmpty()).toBe(true);
            });

            test('returns false for non-empty value', () => {
                expect(new FieldValue('test', 'source').isEmpty()).toBe(false);
                expect(new FieldValue(0, 'source').isEmpty()).toBe(false);
                expect(new FieldValue(false, 'source').isEmpty()).toBe(false);
                expect(new FieldValue(['item'], 'source').isEmpty()).toBe(false);
            });
        });

        test('toJSON returns proper format', () => {
            const fieldValue = new FieldValue('value', 'source', { recordId: '123' });
            const json = fieldValue.toJSON();

            expect(json.value).toBe('value');
            expect(json.source).toBe('source');
            expect(json.metadata.recordId).toBe('123');
        });
    });

    // ============================================
    // FieldLineage Class Tests
    // ============================================
    describe('FieldLineage', () => {
        test('constructor initializes all properties', () => {
            const lineage = new FieldLineage('email');

            expect(lineage.field).toBe('email');
            expect(lineage.selectedValue).toBeNull();
            expect(lineage.selectedSource).toBeNull();
            expect(lineage.strategy).toBeNull();
            expect(lineage.confidence).toBe(0);
            expect(lineage.candidates).toEqual([]);
            expect(lineage.rationale).toBe('');
        });

        test('addCandidate adds candidate to list', () => {
            const lineage = new FieldLineage('email');
            const candidate = new FieldValue('test@example.com', 'crm');

            lineage.addCandidate(candidate);

            expect(lineage.candidates).toHaveLength(1);
            expect(lineage.candidates[0].value).toBe('test@example.com');
        });

        test('setSelection sets all selection properties', () => {
            const lineage = new FieldLineage('email');

            lineage.setSelection(
                'test@example.com',
                'crm_user_entered',
                'source_priority',
                0.95,
                'Selected from highest trust source'
            );

            expect(lineage.selectedValue).toBe('test@example.com');
            expect(lineage.selectedSource).toBe('crm_user_entered');
            expect(lineage.strategy).toBe('source_priority');
            expect(lineage.confidence).toBe(0.95);
            expect(lineage.rationale).toBe('Selected from highest trust source');
        });

        test('toJSON returns proper format', () => {
            const lineage = new FieldLineage('email');
            lineage.addCandidate(new FieldValue('val1', 'src1'));
            lineage.addCandidate(new FieldValue('val2', 'src2'));
            lineage.setSelection('val1', 'src1', 'source_priority', 0.9, 'Best source');

            const json = lineage.toJSON();

            expect(json.field).toBe('email');
            expect(json.selectedValue).toBe('val1');
            expect(json.selectedSource).toBe('src1');
            expect(json.strategy).toBe('source_priority');
            expect(json.confidence).toBe(0.9);
            expect(json.rationale).toBe('Best source');
            expect(json.candidateCount).toBe(2);
            expect(json.candidates).toHaveLength(2);
        });
    });

    // ============================================
    // SurvivorshipEngine Constructor Tests
    // ============================================
    describe('Constructor', () => {
        test('creates instance with default options', () => {
            const engine = new SurvivorshipEngine();

            expect(engine.entityType).toBe('account');
            expect(engine.options.preferMasterRecord).toBe(true);
            expect(engine.options.trackLineage).toBe(true);
            expect(engine.options.preserveHistory).toBe(false);
            expect(engine.rules).toBeDefined();
            expect(engine.sourceHierarchy).toBeDefined();
        });

        test('accepts custom entity type', () => {
            const engine = new SurvivorshipEngine({ entityType: 'contact' });
            expect(engine.entityType).toBe('contact');
        });

        test('accepts custom options', () => {
            const engine = new SurvivorshipEngine({
                preferMasterRecord: false,
                trackLineage: false,
                preserveHistory: true
            });

            expect(engine.options.preferMasterRecord).toBe(false);
            expect(engine.options.trackLineage).toBe(false);
            expect(engine.options.preserveHistory).toBe(true);
        });

        test('loads default rules', () => {
            const engine = new SurvivorshipEngine();

            expect(engine.rules.strategies).toBeDefined();
            expect(engine.rules.protected_fields).toBeDefined();
        });

        test('loads default source hierarchy', () => {
            const engine = new SurvivorshipEngine();

            expect(engine.sourceHierarchy.crm_user_entered).toBeDefined();
            expect(engine.sourceHierarchy.csv_import).toBeDefined();
            expect(engine.sourceHierarchy.unknown).toBeDefined();
        });
    });

    // ============================================
    // Source Trust Score Tests
    // ============================================
    describe('getSourceTrustScore', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('returns correct score for customer_provided', () => {
            expect(engine.getSourceTrustScore('customer_provided')).toBe(98);
        });

        test('returns correct score for crm_user_entered', () => {
            expect(engine.getSourceTrustScore('crm_user_entered')).toBe(95);
        });

        test('returns correct score for company_website', () => {
            expect(engine.getSourceTrustScore('company_website')).toBe(80);
        });

        test('returns correct score for csv_import', () => {
            expect(engine.getSourceTrustScore('csv_import')).toBe(30);
        });

        test('returns correct score for ai_inference', () => {
            expect(engine.getSourceTrustScore('ai_inference')).toBe(25);
        });

        test('returns default score for unknown source', () => {
            expect(engine.getSourceTrustScore('some_unknown_source')).toBe(20);
        });
    });

    // ============================================
    // Protected Fields Tests
    // ============================================
    describe('isProtectedField', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('identifies do_not_call as protected', () => {
            expect(engine.isProtectedField('do_not_call')).toBe(true);
        });

        test('identifies do_not_email as protected', () => {
            expect(engine.isProtectedField('do_not_email')).toBe(true);
        });

        test('identifies gdpr_consent as protected', () => {
            expect(engine.isProtectedField('gdpr_consent')).toBe(true);
        });

        test('identifies lead_source as protected', () => {
            expect(engine.isProtectedField('lead_source')).toBe(true);
        });

        test('identifies created_date as protected', () => {
            expect(engine.isProtectedField('created_date')).toBe(true);
        });

        test('returns false for non-protected fields', () => {
            expect(engine.isProtectedField('name')).toBe(false);
            expect(engine.isProtectedField('email')).toBe(false);
            expect(engine.isProtectedField('phone')).toBe(false);
        });

        test('is case-insensitive', () => {
            expect(engine.isProtectedField('DO_NOT_CALL')).toBe(true);
            expect(engine.isProtectedField('Do_Not_Email')).toBe(true);
        });
    });

    describe('requiresApproval', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('identifies owner_id as requiring approval', () => {
            expect(engine.requiresApproval('owner_id')).toBe(true);
        });

        test('identifies account_id as requiring approval', () => {
            expect(engine.requiresApproval('account_id')).toBe(true);
        });

        test('identifies annual_revenue as requiring approval', () => {
            expect(engine.requiresApproval('annual_revenue')).toBe(true);
        });

        test('returns false for fields not requiring approval', () => {
            expect(engine.requiresApproval('name')).toBe(false);
            expect(engine.requiresApproval('email')).toBe(false);
        });
    });

    // ============================================
    // Strategy Selection Tests
    // ============================================
    describe('getStrategyForField', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('returns source_priority for account_name', () => {
            expect(engine.getStrategyForField('account_name')).toBe('source_priority');
        });

        test('returns source_priority for email', () => {
            expect(engine.getStrategyForField('email')).toBe('source_priority');
        });

        test('returns most_recent for title', () => {
            expect(engine.getStrategyForField('title')).toBe('most_recent');
        });

        test('returns most_recent for employee_count', () => {
            expect(engine.getStrategyForField('employee_count')).toBe('most_recent');
        });

        test('returns most_complete for address', () => {
            expect(engine.getStrategyForField('address')).toBe('most_complete');
        });

        test('returns most_complete for description', () => {
            expect(engine.getStrategyForField('description')).toBe('most_complete');
        });

        test('defaults to source_priority for unknown fields', () => {
            expect(engine.getStrategyForField('custom_field')).toBe('source_priority');
        });
    });

    // ============================================
    // Quality Score Calculation Tests
    // ============================================
    describe('calculateQualityScore', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('returns 0 for null value', () => {
            expect(engine.calculateQualityScore(null, 'email')).toBe(0);
        });

        test('returns 0 for empty string', () => {
            expect(engine.calculateQualityScore('', 'email')).toBe(0);
        });

        describe('email quality', () => {
            test('scores valid email format higher', () => {
                const validEmail = engine.calculateQualityScore('test@example.com', 'email');
                const invalidEmail = engine.calculateQualityScore('invalid-email', 'email');

                expect(validEmail).toBeGreaterThan(invalidEmail);
            });

            test('scores business email higher than free email', () => {
                const businessEmail = engine.calculateQualityScore('john@company.com', 'email');
                const freeEmail = engine.calculateQualityScore('john@gmail.com', 'email');

                expect(businessEmail).toBeGreaterThan(freeEmail);
            });
        });

        describe('phone quality', () => {
            test('scores phone with sufficient digits higher', () => {
                const fullPhone = engine.calculateQualityScore('5551234567', 'phone');
                const shortPhone = engine.calculateQualityScore('555', 'phone');

                expect(fullPhone).toBeGreaterThan(shortPhone);
            });

            test('penalizes all-same-digit numbers', () => {
                const validPhone = engine.calculateQualityScore('5551234567', 'phone');
                const fakePhone = engine.calculateQualityScore('1111111111', 'phone');

                expect(validPhone).toBeGreaterThan(fakePhone);
            });
        });

        describe('website quality', () => {
            test('scores domains with common TLDs higher', () => {
                const comDomain = engine.calculateQualityScore('example.com', 'website');
                const noDomain = engine.calculateQualityScore('example', 'website');

                expect(comDomain).toBeGreaterThan(noDomain);
            });
        });

        describe('address quality', () => {
            test('scores addresses with more components higher', () => {
                const fullAddress = engine.calculateQualityScore(
                    '123 Main St, Austin, TX 78701',
                    'address'
                );
                const partialAddress = engine.calculateQualityScore('Austin', 'address');

                expect(fullAddress).toBeGreaterThan(partialAddress);
            });

            test('scores addresses with numbers higher', () => {
                const withNumber = engine.calculateQualityScore('123 Main St', 'address');
                const withoutNumber = engine.calculateQualityScore('Main St', 'address');

                expect(withNumber).toBeGreaterThan(withoutNumber);
            });
        });

        test('caps score at 100', () => {
            const score = engine.calculateQualityScore(
                'extremely-long-and-valid-business-email@enterprise-corporation.com',
                'email'
            );
            expect(score).toBeLessThanOrEqual(100);
        });
    });

    // ============================================
    // Completeness Calculation Tests
    // ============================================
    describe('calculateCompleteness', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('returns 0 for null', () => {
            expect(engine.calculateCompleteness(null)).toBe(0);
        });

        test('returns 0 for empty string', () => {
            expect(engine.calculateCompleteness('')).toBe(0);
            expect(engine.calculateCompleteness('   ')).toBe(0);
        });

        test('returns higher score for longer strings', () => {
            const short = engine.calculateCompleteness('Hi');
            const long = engine.calculateCompleteness('Hello World This Is A Long String');

            expect(long).toBeGreaterThan(short);
        });

        test('caps string completeness at 100', () => {
            const veryLong = 'x'.repeat(200);
            expect(engine.calculateCompleteness(veryLong)).toBeLessThanOrEqual(100);
        });

        test('returns 100 for non-string non-null values', () => {
            expect(engine.calculateCompleteness(123)).toBe(100);
            expect(engine.calculateCompleteness(true)).toBe(100);
        });

        test('calculates object completeness by filled fields', () => {
            const fullObject = { a: 'val', b: 'val', c: 'val' };
            const partialObject = { a: 'val', b: null, c: '' };

            const fullScore = engine.calculateCompleteness(fullObject);
            const partialScore = engine.calculateCompleteness(partialObject);

            expect(fullScore).toBeGreaterThan(partialScore);
        });
    });

    // ============================================
    // Source Detection Tests
    // ============================================
    describe('detectSource', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('uses field-specific source if available', () => {
            const record = {
                email: 'test@example.com',
                email_source: 'company_website'
            };

            expect(engine.detectSource(record, 'email')).toBe('company_website');
        });

        test('uses record-level data_source', () => {
            const record = {
                email: 'test@example.com',
                data_source: 'csv_import'
            };

            expect(engine.detectSource(record, 'email')).toBe('csv_import');
        });

        test('uses record-level source', () => {
            const record = {
                email: 'test@example.com',
                source: 'enrichment_tier1'
            };

            expect(engine.detectSource(record, 'email')).toBe('enrichment_tier1');
        });

        test('infers crm_user_entered from Salesforce ID', () => {
            const record = {
                email: 'test@example.com',
                salesforce_id: '001ABC123'
            };

            expect(engine.detectSource(record, 'email')).toBe('crm_user_entered');
        });

        test('infers crm_user_entered from HubSpot ID', () => {
            const record = {
                email: 'test@example.com',
                hubspot_id: '12345'
            };

            expect(engine.detectSource(record, 'email')).toBe('crm_user_entered');
        });

        test('infers csv_import from import_source', () => {
            const record = {
                email: 'test@example.com',
                import_source: 'file.csv'
            };

            expect(engine.detectSource(record, 'email')).toBe('csv_import');
        });

        test('returns unknown for unidentifiable source', () => {
            const record = { email: 'test@example.com' };

            expect(engine.detectSource(record, 'email')).toBe('unknown');
        });
    });

    // ============================================
    // Value Verification Tests
    // ============================================
    describe('isValueVerified', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('detects field-specific verification', () => {
            const record = { email: 'test@example.com', email_verified: true };
            expect(engine.isValueVerified(record, 'email')).toBe(true);
        });

        test('detects HubSpot email verification', () => {
            const record = { email: 'test@example.com', hs_email_verified: true };
            expect(engine.isValueVerified(record, 'email')).toBe(true);
        });

        test('detects phone verification', () => {
            const record = { phone: '5551234567', phone_verified: true };
            expect(engine.isValueVerified(record, 'phone')).toBe(true);
        });

        test('returns false for unverified values', () => {
            const record = { email: 'test@example.com' };
            expect(engine.isValueVerified(record, 'email')).toBe(false);
        });
    });

    // ============================================
    // Record Scoring Tests
    // ============================================
    describe('scoreRecord', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('scores Salesforce ID higher', () => {
            const sfRecord = { salesforce_id: '001ABC' };
            const noIdRecord = { name: 'Test' };

            expect(engine.scoreRecord(sfRecord)).toBeGreaterThan(engine.scoreRecord(noIdRecord));
        });

        test('scores HubSpot ID', () => {
            const hsRecord = { hubspot_id: '12345' };
            const noIdRecord = { name: 'Test' };

            expect(engine.scoreRecord(hsRecord)).toBeGreaterThan(engine.scoreRecord(noIdRecord));
        });

        test('scores owner presence', () => {
            const ownedRecord = { owner_id: 'user123' };
            const unownedRecord = { name: 'Test' };

            expect(engine.scoreRecord(ownedRecord)).toBeGreaterThan(engine.scoreRecord(unownedRecord));
        });

        test('scores non-empty fields', () => {
            const richRecord = { name: 'Test', email: 'a@b.com', phone: '123', city: 'Austin' };
            const poorRecord = { name: 'Test' };

            expect(engine.scoreRecord(richRecord)).toBeGreaterThan(engine.scoreRecord(poorRecord));
        });

        test('scores recently modified records higher', () => {
            const recentRecord = {
                name: 'Test',
                last_modified_date: new Date().toISOString()
            };
            const oldRecord = {
                name: 'Test',
                last_modified_date: '2020-01-01'
            };

            expect(engine.scoreRecord(recentRecord)).toBeGreaterThan(engine.scoreRecord(oldRecord));
        });

        test('scores records with associations', () => {
            const associatedRecord = {
                name: 'Test',
                num_associated_contacts: 5,
                num_associated_deals: 3
            };
            const isolatedRecord = { name: 'Test' };

            expect(engine.scoreRecord(associatedRecord)).toBeGreaterThan(engine.scoreRecord(isolatedRecord));
        });
    });

    // ============================================
    // Master Record Selection Tests
    // ============================================
    describe('selectMasterRecord', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('selects preferred ID if provided', () => {
            const records = [
                { id: 'rec-1', name: 'Record 1' },
                { id: 'rec-2', name: 'Record 2' }
            ];

            const master = engine.selectMasterRecord(records, 'rec-2');
            expect(master.id).toBe('rec-2');
        });

        test('selects by Id field', () => {
            const records = [
                { Id: 'sf-1', name: 'Record 1' },
                { Id: 'sf-2', name: 'Record 2' }
            ];

            const master = engine.selectMasterRecord(records, 'sf-2');
            expect(master.Id).toBe('sf-2');
        });

        test('selects highest-scored record when no preference', () => {
            const records = [
                { id: 'rec-1', name: 'Poor Record' },
                { id: 'rec-2', name: 'Rich Record', salesforce_id: 'SF123', email: 'a@b.com', phone: '123' }
            ];

            const master = engine.selectMasterRecord(records);
            expect(master.id).toBe('rec-2');
        });

        test('falls back to scoring if preferred ID not found', () => {
            const records = [
                { id: 'rec-1', name: 'Record 1', salesforce_id: 'SF1' },
                { id: 'rec-2', name: 'Record 2' }
            ];

            const master = engine.selectMasterRecord(records, 'non-existent');
            expect(master.id).toBe('rec-1'); // Higher scored
        });
    });

    // ============================================
    // Strategy Application Tests
    // ============================================
    describe('applySourcePriority', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('selects value from highest-trust source', () => {
            const candidates = [
                new FieldValue('csv-value', 'csv_import'),
                new FieldValue('crm-value', 'crm_user_entered'),
                new FieldValue('search-value', 'web_search')
            ];

            const result = engine.applySourcePriority(candidates, 'email');

            expect(result.winner.value).toBe('crm-value');
            expect(result.confidence).toBeCloseTo(0.95, 2);
        });

        test('includes rationale in result', () => {
            const candidates = [new FieldValue('value', 'crm_user_entered')];
            const result = engine.applySourcePriority(candidates, 'email');

            expect(result.rationale).toContain('crm_user_entered');
            expect(result.rationale).toContain('trust score');
        });
    });

    describe('applyMostRecent', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('selects most recently modified value', () => {
            const candidates = [
                new FieldValue('old-value', 'source', { lastModified: '2024-01-01' }),
                new FieldValue('new-value', 'source', { lastModified: '2024-06-15' }),
                new FieldValue('middle-value', 'source', { lastModified: '2024-03-01' })
            ];

            const result = engine.applyMostRecent(candidates, 'title');

            expect(result.winner.value).toBe('new-value');
        });

        test('falls back to source priority if no dates', () => {
            const candidates = [
                new FieldValue('value1', 'crm_user_entered'),
                new FieldValue('value2', 'csv_import')
            ];

            const result = engine.applyMostRecent(candidates, 'title');

            expect(result.winner.value).toBe('value1'); // Higher trust source
        });

        test('includes date in rationale', () => {
            const candidates = [
                new FieldValue('value', 'source', { lastModified: '2024-06-15' })
            ];

            const result = engine.applyMostRecent(candidates, 'title');

            expect(result.rationale).toContain('2024-06-15');
        });
    });

    describe('applyMostComplete', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('selects most complete value', () => {
            const candidates = [
                new FieldValue('Short', 'source'),
                new FieldValue('This is a much longer and more complete description', 'source'),
                new FieldValue('Medium length', 'source')
            ];

            const result = engine.applyMostComplete(candidates, 'description');

            expect(result.winner.value).toContain('much longer');
        });

        test('includes completeness score in rationale', () => {
            const candidates = [new FieldValue('Some text', 'source')];
            const result = engine.applyMostComplete(candidates, 'description');

            expect(result.rationale).toContain('completeness');
        });
    });

    describe('applyQualityScore', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('selects highest quality value', () => {
            const candidates = [
                new FieldValue('invalid-email', 'source'),
                new FieldValue('valid@company.com', 'source'),
                new FieldValue('test@gmail.com', 'source')
            ];

            const result = engine.applyQualityScore(candidates, 'email');

            expect(result.winner.value).toBe('valid@company.com');
        });

        test('uses pre-calculated quality score if available', () => {
            const candidates = [
                new FieldValue('low', 'source', { qualityScore: 30 }),
                new FieldValue('high', 'source', { qualityScore: 90 })
            ];

            const result = engine.applyQualityScore(candidates, 'custom_field');

            expect(result.winner.value).toBe('high');
        });
    });

    describe('applyVerifiedPreference', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('prefers verified values', () => {
            const candidates = [
                new FieldValue('unverified@example.com', 'crm_user_entered', { isVerified: false }),
                new FieldValue('verified@example.com', 'csv_import', { isVerified: true })
            ];

            const result = engine.applyVerifiedPreference(candidates, 'email');

            expect(result.winner.value).toBe('verified@example.com');
        });

        test('falls back to quality score if none verified', () => {
            const candidates = [
                new FieldValue('low-quality', 'source'),
                new FieldValue('valid@company.com', 'source')
            ];

            const result = engine.applyVerifiedPreference(candidates, 'email');

            expect(result.winner.value).toBe('valid@company.com');
        });

        test('boosts confidence for verified values', () => {
            const candidates = [
                new FieldValue('verified@example.com', 'crm_user_entered', { isVerified: true })
            ];

            const result = engine.applyVerifiedPreference(candidates, 'email');

            expect(result.confidence).toBeGreaterThan(0.95); // Boosted above source trust
        });
    });

    // ============================================
    // Survivor Selection Tests
    // ============================================
    describe('selectSurvivor', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('returns no_value for empty candidates', () => {
            const lineage = engine.selectSurvivor('email', []);
            expect(lineage.strategy).toBe('no_value');
            expect(lineage.selectedValue).toBeNull();
        });

        test('returns single_value strategy for one candidate', () => {
            const candidates = [new FieldValue('only@value.com', 'source')];
            const lineage = engine.selectSurvivor('email', candidates);

            expect(lineage.strategy).toBe('single_value');
            expect(lineage.selectedValue).toBe('only@value.com');
            expect(lineage.confidence).toBe(0.9);
        });

        test('filters out empty values before selection', () => {
            const candidates = [
                new FieldValue(null, 'source'),
                new FieldValue('', 'source'),
                new FieldValue('valid@email.com', 'source')
            ];

            const lineage = engine.selectSurvivor('email', candidates);

            expect(lineage.strategy).toBe('single_value');
            expect(lineage.selectedValue).toBe('valid@email.com');
        });

        test('tracks all candidates in lineage', () => {
            const candidates = [
                new FieldValue('val1', 'src1'),
                new FieldValue('val2', 'src2')
            ];

            const lineage = engine.selectSurvivor('name', candidates);

            expect(lineage.candidates).toHaveLength(2);
        });
    });

    // ============================================
    // Build Golden Record Tests
    // ============================================
    describe('buildGoldenRecord', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('throws error for empty records', () => {
            expect(() => engine.buildGoldenRecord([])).toThrow('No records provided');
            expect(() => engine.buildGoldenRecord(null)).toThrow();
        });

        test('returns single record as-is', () => {
            const record = { id: 'single', name: 'Test', email: 'test@example.com' };
            const result = engine.buildGoldenRecord([record]);

            expect(result.goldenRecord).toBe(record);
            expect(result.masterRecordId).toBe('single');
            expect(result.mergeStats.fieldsProcessed).toBe(0);
        });

        test('selects best values from multiple records', () => {
            const records = [
                {
                    id: 'rec-1',
                    name: 'Short Name',
                    email: 'old@gmail.com'
                    // No salesforce_id - lower source trust
                },
                {
                    id: 'rec-2',
                    name: 'A Much Longer and More Complete Company Name',
                    email: 'business@company.com',
                    salesforce_id: 'SF456'  // Higher source trust (crm_user_entered)
                }
            ];

            const result = engine.buildGoldenRecord(records);

            // Record 2 has higher source trust (salesforce_id = crm_user_entered)
            // so its values should win for source_priority fields
            expect(result.goldenRecord.email).toBe('business@company.com');
            // name uses source_priority, so rec-2's value wins
            expect(result.goldenRecord.name).toBe('A Much Longer and More Complete Company Name');
        });

        test('uses specified master record ID', () => {
            const records = [
                { id: 'rec-1', name: 'Record 1', salesforce_id: 'SF1' },
                { id: 'rec-2', name: 'Record 2' }
            ];

            const result = engine.buildGoldenRecord(records, { masterRecordId: 'rec-2' });

            expect(result.masterRecordId).toBe('rec-2');
        });

        test('preserves protected fields from master', () => {
            const records = [
                { id: 'master', lead_source: 'Original Source', do_not_call: true },
                { id: 'other', lead_source: 'New Source', do_not_call: false }
            ];

            const result = engine.buildGoldenRecord(records, { masterRecordId: 'master' });

            // Protected fields preserved from master
            expect(result.goldenRecord.lead_source).toBe('Original Source');
            expect(result.goldenRecord.do_not_call).toBe(true);
        });

        test('includes field lineage', () => {
            const records = [
                { id: 'rec-1', name: 'Name 1', email: 'a@b.com' },
                { id: 'rec-2', name: 'Name 2', email: 'c@d.com' }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(result.fieldLineage).toBeDefined();
            expect(result.fieldLineage.name).toBeDefined();
            expect(result.fieldLineage.email).toBeDefined();
        });

        test('tracks merge statistics', () => {
            const records = [
                { id: 'rec-1', name: 'Name 1', email: 'a@b.com' },
                { id: 'rec-2', name: 'Name 2', phone: '123' }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(result.mergeStats.fieldsProcessed).toBeGreaterThan(0);
            expect(result.mergeStats.recordsMerged).toBe(2);
        });

        test('handles records with different field sets', () => {
            const records = [
                { id: 'rec-1', name: 'Name', fieldA: 'A' },
                { id: 'rec-2', name: 'Name', fieldB: 'B' }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(result.goldenRecord.fieldA).toBe('A');
            expect(result.goldenRecord.fieldB).toBe('B');
        });
    });

    // ============================================
    // Preview Merge Tests
    // ============================================
    describe('previewMerge', () => {
        let engine;

        beforeEach(() => {
            engine = new SurvivorshipEngine();
        });

        test('returns preview flag', () => {
            const records = [
                { id: 'rec-1', name: 'Name 1' },
                { id: 'rec-2', name: 'Name 2' }
            ];

            const result = engine.previewMerge(records);

            expect(result.preview).toBe(true);
        });

        test('includes changes array', () => {
            const records = [
                { id: 'rec-1', name: 'Name 1', email: 'a@b.com' },
                { id: 'rec-2', name: 'Name 2', email: 'c@d.com' }
            ];

            const result = engine.previewMerge(records);

            expect(result.changes).toBeDefined();
            expect(Array.isArray(result.changes)).toBe(true);
        });

        test('excludes protected fields from changes', () => {
            const records = [
                { id: 'rec-1', name: 'Name 1', lead_source: 'Source 1' },
                { id: 'rec-2', name: 'Name 2', lead_source: 'Source 2' }
            ];

            const result = engine.previewMerge(records);

            const leadSourceChange = result.changes.find(c => c.field === 'lead_source');
            expect(leadSourceChange).toBeUndefined();
        });

        test('includes from/to values in changes', () => {
            const records = [
                { id: 'rec-1', name: 'Name 1' },
                { id: 'rec-2', name: 'Name 2' }
            ];

            const result = engine.previewMerge(records);
            const nameChange = result.changes.find(c => c.field === 'name');

            if (nameChange) {
                expect(nameChange.from).toBeDefined();
                expect(nameChange.to).toBeDefined();
                expect(nameChange.strategy).toBeDefined();
                expect(nameChange.confidence).toBeDefined();
            }
        });
    });

    // ============================================
    // Integration Tests
    // ============================================
    describe('Integration Tests', () => {
        test('full workflow: multi-source duplicate resolution', () => {
            const engine = new SurvivorshipEngine();

            const records = [
                {
                    id: 'sf-001',
                    salesforce_id: '001ABC123',
                    name: 'Acme Corp',
                    email: 'old@acme.com',
                    phone: '555-000-0000',
                    source: 'crm_user_entered',
                    last_modified_date: '2024-01-01'
                },
                {
                    id: 'hs-001',
                    hubspot_id: '12345',
                    name: 'ACME Corporation',
                    email: 'new@acme.com',
                    phone: '555-123-4567',
                    website: 'acme.com',
                    source: 'crm_user_entered',
                    last_modified_date: '2024-06-15'
                },
                {
                    id: 'import-001',
                    name: 'Acme Corp Inc',
                    email: 'info@gmail.com',
                    phone: '555-111-1111',
                    address: '123 Main St, Austin, TX 78701',
                    source: 'csv_import'
                }
            ];

            const result = engine.buildGoldenRecord(records);

            // Salesforce record should be master (higher score)
            expect(result.masterRecordId).toBe('sf-001');

            // Golden record should have best values
            expect(result.goldenRecord).toBeDefined();

            // Field lineage should track all selections
            expect(result.fieldLineage).toBeDefined();
            expect(Object.keys(result.fieldLineage).length).toBeGreaterThan(0);

            // Merge stats should be accurate
            expect(result.mergeStats.recordsMerged).toBe(3);
        });

        test('handles cross-platform deduplication', () => {
            const engine = new SurvivorshipEngine({ entityType: 'contact' });

            const records = [
                {
                    id: 'sf-contact',
                    salesforce_id: '003XYZ',
                    name: 'John Smith',
                    email: 'john@company.com',
                    title: 'VP Sales',
                    phone: '555-123-4567',
                    email_verified: true
                },
                {
                    id: 'hs-contact',
                    hubspot_id: '67890',
                    name: 'John D. Smith',
                    email: 'john.smith@company.com',
                    title: 'Vice President of Sales',
                    phone: '(555) 123-4567'
                }
            ];

            const result = engine.buildGoldenRecord(records);

            // Should have merged values
            expect(result.goldenRecord).toBeDefined();

            // Verified email should be preferred
            const emailLineage = result.fieldLineage.email;
            expect(emailLineage.selectedValue).toBe('john@company.com');
        });

        test('respects all protected fields', () => {
            const engine = new SurvivorshipEngine();

            const records = [
                {
                    id: 'master',
                    do_not_call: true,
                    do_not_email: false,
                    gdpr_consent: true,
                    ccpa_opt_out: false,
                    lead_source: 'Webinar',
                    created_date: '2020-01-01',
                    name: 'Test'
                },
                {
                    id: 'other',
                    do_not_call: false,
                    do_not_email: true,
                    gdpr_consent: false,
                    ccpa_opt_out: true,
                    lead_source: 'Trade Show',
                    created_date: '2024-01-01',
                    name: 'Test Company'
                }
            ];

            const result = engine.buildGoldenRecord(records, { masterRecordId: 'master' });

            // All protected fields preserved from master
            expect(result.goldenRecord.do_not_call).toBe(true);
            expect(result.goldenRecord.gdpr_consent).toBe(true);
            expect(result.goldenRecord.lead_source).toBe('Webinar');
            expect(result.goldenRecord.created_date).toBe('2020-01-01');
        });
    });

    // ============================================
    // Edge Cases
    // ============================================
    describe('Edge Cases', () => {
        test('handles records with only null values', () => {
            const engine = new SurvivorshipEngine();
            const records = [
                { id: 'rec-1', name: null, email: null },
                { id: 'rec-2', name: null, email: null }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(result.goldenRecord).toBeDefined();
        });

        test('handles deeply nested record properties', () => {
            const engine = new SurvivorshipEngine();
            const records = [
                { id: 'rec-1', name: 'Test', properties: { nested: 'value' } },
                { id: 'rec-2', name: 'Test 2' }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(result.goldenRecord).toBeDefined();
        });

        test('handles special characters in field values', () => {
            const engine = new SurvivorshipEngine();
            const records = [
                { id: 'rec-1', name: 'Café & Co. "Best" <Company>' },
                { id: 'rec-2', name: 'Normal Name' }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(result.goldenRecord).toBeDefined();
        });

        test('handles very long field values', () => {
            const engine = new SurvivorshipEngine();
            const longValue = 'x'.repeat(10000);
            const records = [
                { id: 'rec-1', description: longValue },
                { id: 'rec-2', description: 'short' }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(result.goldenRecord.description).toBe(longValue);
        });

        test('handles numeric field values', () => {
            const engine = new SurvivorshipEngine();
            const records = [
                { id: 'rec-1', employee_count: 100 },
                { id: 'rec-2', employee_count: 200 }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(typeof result.goldenRecord.employee_count).toBe('number');
        });

        test('handles boolean field values', () => {
            const engine = new SurvivorshipEngine();
            const records = [
                { id: 'rec-1', is_active: true },
                { id: 'rec-2', is_active: false }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(typeof result.goldenRecord.is_active).toBe('boolean');
        });

        test('handles array field values', () => {
            const engine = new SurvivorshipEngine();
            const records = [
                { id: 'rec-1', tags: ['tag1', 'tag2'] },
                { id: 'rec-2', tags: ['tag3'] }
            ];

            const result = engine.buildGoldenRecord(records);

            expect(Array.isArray(result.goldenRecord.tags)).toBe(true);
        });
    });
});
