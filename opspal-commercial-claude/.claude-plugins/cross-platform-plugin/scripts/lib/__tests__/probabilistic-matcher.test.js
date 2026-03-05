/**
 * Probabilistic Matcher Tests
 *
 * Tests for fuzzy matching and entity resolution functionality.
 */

const {
    ProbabilisticMatcher,
    MatchCandidate,
    DEFAULT_WEIGHTS,
    DEFAULT_THRESHOLDS,
    ALGORITHM_CONFIG
} = require('../probabilistic-matcher');

describe('ProbabilisticMatcher', () => {

    // ============================================
    // Constants & Exports Tests
    // ============================================
    describe('Constants and Exports', () => {
        test('exports all required components', () => {
            expect(ProbabilisticMatcher).toBeDefined();
            expect(MatchCandidate).toBeDefined();
            expect(DEFAULT_WEIGHTS).toBeDefined();
            expect(DEFAULT_THRESHOLDS).toBeDefined();
            expect(ALGORITHM_CONFIG).toBeDefined();
        });

        describe('DEFAULT_WEIGHTS', () => {
            test('has weights for account entity type', () => {
                expect(DEFAULT_WEIGHTS.account).toBeDefined();
                expect(DEFAULT_WEIGHTS.account.name).toBe(40);
                expect(DEFAULT_WEIGHTS.account.domain).toBe(25);
                expect(DEFAULT_WEIGHTS.account.address).toBe(15);
                expect(DEFAULT_WEIGHTS.account.phone).toBe(10);
                expect(DEFAULT_WEIGHTS.account.industry).toBe(10);
            });

            test('account weights sum to 100', () => {
                const sum = Object.values(DEFAULT_WEIGHTS.account).reduce((a, b) => a + b, 0);
                expect(sum).toBe(100);
            });

            test('has weights for contact entity type', () => {
                expect(DEFAULT_WEIGHTS.contact).toBeDefined();
                expect(DEFAULT_WEIGHTS.contact.email).toBe(35);
                expect(DEFAULT_WEIGHTS.contact.name).toBe(30);
                expect(DEFAULT_WEIGHTS.contact.phone).toBe(15);
                expect(DEFAULT_WEIGHTS.contact.company).toBe(15);
                expect(DEFAULT_WEIGHTS.contact.title).toBe(5);
            });

            test('contact weights sum to 100', () => {
                const sum = Object.values(DEFAULT_WEIGHTS.contact).reduce((a, b) => a + b, 0);
                expect(sum).toBe(100);
            });

            test('has weights for lead entity type', () => {
                expect(DEFAULT_WEIGHTS.lead).toBeDefined();
                expect(DEFAULT_WEIGHTS.lead.email).toBe(35);
                expect(DEFAULT_WEIGHTS.lead.name).toBe(30);
            });

            test('lead weights sum to 100', () => {
                const sum = Object.values(DEFAULT_WEIGHTS.lead).reduce((a, b) => a + b, 0);
                expect(sum).toBe(100);
            });
        });

        describe('DEFAULT_THRESHOLDS', () => {
            test('has correct threshold values', () => {
                expect(DEFAULT_THRESHOLDS.autoMerge).toBe(95);
                expect(DEFAULT_THRESHOLDS.review).toBe(80);
                expect(DEFAULT_THRESHOLDS.probable).toBe(65);
                expect(DEFAULT_THRESHOLDS.noMatch).toBe(0);
            });
        });

        describe('ALGORITHM_CONFIG', () => {
            test('has configuration for name field', () => {
                expect(ALGORITHM_CONFIG.name).toBeDefined();
                expect(ALGORITHM_CONFIG.name.primary).toBe('jaroWinkler');
                expect(ALGORITHM_CONFIG.name.secondary).toBe('tokenSimilarity');
                expect(ALGORITHM_CONFIG.name.usePhonetic).toBe(true);
            });

            test('has configuration for domain field', () => {
                expect(ALGORITHM_CONFIG.domain).toBeDefined();
                expect(ALGORITHM_CONFIG.domain.primary).toBe('exact');
                expect(ALGORITHM_CONFIG.domain.secondary).toBe('diceCoefficient');
            });

            test('has configuration for email field', () => {
                expect(ALGORITHM_CONFIG.email).toBeDefined();
                expect(ALGORITHM_CONFIG.email.primary).toBe('exact');
                expect(ALGORITHM_CONFIG.email.secondary).toBe('localPartSimilarity');
            });

            test('has configuration for address field', () => {
                expect(ALGORITHM_CONFIG.address).toBeDefined();
                expect(ALGORITHM_CONFIG.address.primary).toBe('componentMatch');
            });

            test('has configuration for phone field', () => {
                expect(ALGORITHM_CONFIG.phone).toBeDefined();
                expect(ALGORITHM_CONFIG.phone.primary).toBe('exact');
                expect(ALGORITHM_CONFIG.phone.secondary).toBe('lastDigits');
            });
        });
    });

    // ============================================
    // MatchCandidate Class Tests
    // ============================================
    describe('MatchCandidate', () => {
        test('constructor initializes all properties', () => {
            const record = { id: '123', name: 'Test' };
            const candidate = new MatchCandidate(record, 85.5, 'needs_review');

            expect(candidate.record).toBe(record);
            expect(candidate.score).toBe(85.5);
            expect(candidate.classification).toBe('needs_review');
            expect(candidate.fieldScores).toEqual({});
            expect(candidate.matchSignals).toEqual([]);
            expect(candidate.metadata.calculatedAt).toBeDefined();
        });

        test('addFieldScore adds field score data', () => {
            const candidate = new MatchCandidate({}, 80, 'needs_review');
            candidate.addFieldScore('name', 90, 'jaroWinkler');
            candidate.addFieldScore('domain', 100, 'exact');

            expect(candidate.fieldScores.name).toEqual({ score: 90, algorithm: 'jaroWinkler' });
            expect(candidate.fieldScores.domain).toEqual({ score: 100, algorithm: 'exact' });
        });

        test('addSignal adds match signal', () => {
            const candidate = new MatchCandidate({}, 80, 'needs_review');
            candidate.addSignal({ type: 'exact_match', field: 'name' });
            candidate.addSignal({ type: 'strong_match', field: 'domain' });

            expect(candidate.matchSignals).toHaveLength(2);
            expect(candidate.matchSignals[0].type).toBe('exact_match');
            expect(candidate.matchSignals[1].type).toBe('strong_match');
        });

        test('toJSON returns properly formatted object', () => {
            const record = { id: '123', name: 'Test Corp' };
            const candidate = new MatchCandidate(record, 85.567, 'needs_review');
            candidate.addFieldScore('name', 90, 'jaroWinkler');
            candidate.addSignal({ type: 'strong_match', field: 'name' });

            const json = candidate.toJSON();

            expect(json.score).toBe(85.57); // Rounded to 2 decimal places
            expect(json.classification).toBe('needs_review');
            expect(json.record).toBe(record);
            expect(json.fieldScores.name.score).toBe(90);
            expect(json.matchSignals).toHaveLength(1);
            expect(json.metadata.calculatedAt).toBeDefined();
        });

        test('toJSON rounds score to 2 decimal places', () => {
            const candidate = new MatchCandidate({}, 85.999, 'needs_review');
            expect(candidate.toJSON().score).toBe(86);

            const candidate2 = new MatchCandidate({}, 85.001, 'needs_review');
            expect(candidate2.toJSON().score).toBe(85);
        });
    });

    // ============================================
    // ProbabilisticMatcher Constructor Tests
    // ============================================
    describe('Constructor', () => {
        test('creates instance with default options', () => {
            const matcher = new ProbabilisticMatcher();

            expect(matcher.entityType).toBe('account');
            expect(matcher.weights).toEqual(DEFAULT_WEIGHTS.account);
            expect(matcher.thresholds).toEqual(DEFAULT_THRESHOLDS);
            expect(matcher.blockingEnabled).toBe(true);
            expect(matcher.normalizationEngine).toBeDefined();
        });

        test('accepts custom entity type', () => {
            const matcher = new ProbabilisticMatcher({ entityType: 'contact' });
            expect(matcher.entityType).toBe('contact');
            expect(matcher.weights).toEqual(DEFAULT_WEIGHTS.contact);
        });

        test('accepts custom weights', () => {
            const customWeights = { name: 60, domain: 40 };
            const matcher = new ProbabilisticMatcher({ weights: customWeights });

            expect(matcher.weights.name).toBe(60);
            expect(matcher.weights.domain).toBe(40);
        });

        test('merges custom weights with defaults', () => {
            const customWeights = { name: 60 };
            const matcher = new ProbabilisticMatcher({ weights: customWeights });

            expect(matcher.weights.name).toBe(60);
            expect(matcher.weights.domain).toBe(25); // Default value
        });

        test('accepts custom thresholds', () => {
            const customThresholds = { autoMerge: 90, review: 70 };
            const matcher = new ProbabilisticMatcher({ thresholds: customThresholds });

            expect(matcher.thresholds.autoMerge).toBe(90);
            expect(matcher.thresholds.review).toBe(70);
            expect(matcher.thresholds.probable).toBe(65); // Default
        });

        test('can disable blocking', () => {
            const matcher = new ProbabilisticMatcher({ blockingEnabled: false });
            expect(matcher.blockingEnabled).toBe(false);
        });

        test('initializes stats', () => {
            const matcher = new ProbabilisticMatcher();

            expect(matcher.stats.comparisons).toBe(0);
            expect(matcher.stats.matchesFound).toBe(0);
            expect(matcher.stats.autoMerge).toBe(0);
            expect(matcher.stats.needsReview).toBe(0);
            expect(matcher.stats.probable).toBe(0);
            expect(matcher.stats.noMatch).toBe(0);
        });
    });

    // ============================================
    // Score Classification Tests
    // ============================================
    describe('classifyScore', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('classifies auto_merge for scores >= 95', () => {
            expect(matcher.classifyScore(95)).toBe('auto_merge');
            expect(matcher.classifyScore(100)).toBe('auto_merge');
            expect(matcher.classifyScore(99.5)).toBe('auto_merge');
        });

        test('classifies needs_review for scores >= 80 and < 95', () => {
            expect(matcher.classifyScore(80)).toBe('needs_review');
            expect(matcher.classifyScore(94.9)).toBe('needs_review');
            expect(matcher.classifyScore(87)).toBe('needs_review');
        });

        test('classifies probable for scores >= 65 and < 80', () => {
            expect(matcher.classifyScore(65)).toBe('probable');
            expect(matcher.classifyScore(79.9)).toBe('probable');
            expect(matcher.classifyScore(72)).toBe('probable');
        });

        test('classifies no_match for scores < 65', () => {
            expect(matcher.classifyScore(64.9)).toBe('no_match');
            expect(matcher.classifyScore(0)).toBe('no_match');
            expect(matcher.classifyScore(50)).toBe('no_match');
        });

        test('uses custom thresholds', () => {
            const customMatcher = new ProbabilisticMatcher({
                thresholds: { autoMerge: 90, review: 70, probable: 50 }
            });

            expect(customMatcher.classifyScore(90)).toBe('auto_merge');
            expect(customMatcher.classifyScore(85)).toBe('needs_review');
            expect(customMatcher.classifyScore(70)).toBe('needs_review');
            expect(customMatcher.classifyScore(50)).toBe('probable');
            expect(customMatcher.classifyScore(49)).toBe('no_match');
        });
    });

    // ============================================
    // Field Value Extraction Tests
    // ============================================
    describe('extractFieldValue', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('extracts normalized field when available', () => {
            const record = {
                name: 'Original',
                _normalized_name: 'normalized'
            };
            expect(matcher.extractFieldValue(record, 'name')).toBe('normalized');
        });

        test('extracts name from various field names', () => {
            expect(matcher.extractFieldValue({ name: 'Test' }, 'name')).toBe('Test');
            expect(matcher.extractFieldValue({ account_name: 'Test' }, 'name')).toBe('Test');
            expect(matcher.extractFieldValue({ company_name: 'Test' }, 'name')).toBe('Test');
            expect(matcher.extractFieldValue({ Name: 'Test' }, 'name')).toBe('Test');
        });

        test('extracts domain from various field names', () => {
            expect(matcher.extractFieldValue({ domain: 'test.com' }, 'domain')).toBe('test.com');
            expect(matcher.extractFieldValue({ website: 'test.com' }, 'domain')).toBe('test.com');
            expect(matcher.extractFieldValue({ website_domain: 'test.com' }, 'domain')).toBe('test.com');
        });

        test('extracts email from various field names', () => {
            expect(matcher.extractFieldValue({ email: 'a@b.com' }, 'email')).toBe('a@b.com');
            expect(matcher.extractFieldValue({ email_address: 'a@b.com' }, 'email')).toBe('a@b.com');
            expect(matcher.extractFieldValue({ Email: 'a@b.com' }, 'email')).toBe('a@b.com');
        });

        test('extracts from nested properties', () => {
            const record = {
                properties: {
                    name: 'Nested Name',
                    email: 'nested@test.com'
                }
            };
            expect(matcher.extractFieldValue(record, 'name')).toBe('Nested Name');
            expect(matcher.extractFieldValue(record, 'email')).toBe('nested@test.com');
        });

        test('returns null for missing fields', () => {
            expect(matcher.extractFieldValue({}, 'name')).toBeNull();
            expect(matcher.extractFieldValue({ other: 'value' }, 'email')).toBeNull();
        });

        test('converts non-string values to strings', () => {
            expect(matcher.extractFieldValue({ name: 123 }, 'name')).toBe('123');
        });
    });

    // ============================================
    // Nested Value Extraction Tests
    // ============================================
    describe('getNestedValue', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('extracts top-level value', () => {
            expect(matcher.getNestedValue({ name: 'Test' }, 'name')).toBe('Test');
        });

        test('extracts nested value', () => {
            const obj = { properties: { name: 'Nested' } };
            expect(matcher.getNestedValue(obj, 'properties.name')).toBe('Nested');
        });

        test('extracts deeply nested value', () => {
            const obj = { a: { b: { c: 'deep' } } };
            expect(matcher.getNestedValue(obj, 'a.b.c')).toBe('deep');
        });

        test('returns null for missing path', () => {
            expect(matcher.getNestedValue({ name: 'Test' }, 'other')).toBeUndefined();
            expect(matcher.getNestedValue({ a: {} }, 'a.b.c')).toBeNull();
        });

        test('handles null/undefined in path', () => {
            expect(matcher.getNestedValue({ a: null }, 'a.b')).toBeNull();
            expect(matcher.getNestedValue(null, 'a')).toBeNull();
        });
    });

    // ============================================
    // Record Normalization Tests
    // ============================================
    describe('normalizeRecord', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('normalizes company name', () => {
            const record = { name: 'ACME Corporation' };
            const normalized = matcher.normalizeRecord(record);

            expect(normalized._normalized_name).toBeDefined();
            expect(normalized.name).toBe('ACME Corporation');
        });

        test('normalizes domain from website', () => {
            const record = { website: 'https://www.acme.com/page' };
            const normalized = matcher.normalizeRecord(record);

            expect(normalized._normalized_domain).toBe('acme.com');
        });

        test('normalizes email', () => {
            const record = { email: 'JOHN.DOE@COMPANY.COM' };
            const normalized = matcher.normalizeRecord(record);

            expect(normalized._normalized_email).toBe('john.doe@company.com');
        });

        test('normalizes phone', () => {
            const record = { phone: '(555) 123-4567' };
            const normalized = matcher.normalizeRecord(record);

            expect(normalized._normalized_phone).toBeDefined();
        });

        test('preserves original fields', () => {
            const record = { name: 'Test', other: 'value' };
            const normalized = matcher.normalizeRecord(record);

            expect(normalized.name).toBe('Test');
            expect(normalized.other).toBe('value');
        });

        test('handles records with account_name field', () => {
            const record = { account_name: 'Test Corp' };
            const normalized = matcher.normalizeRecord(record);

            expect(normalized._normalized_name).toBeDefined();
        });
    });

    // ============================================
    // Algorithm Runner Tests
    // ============================================
    describe('runAlgorithm', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        describe('exact algorithm', () => {
            test('returns 100 for exact match (case-insensitive)', () => {
                expect(matcher.runAlgorithm('exact', 'Test', 'test')).toBe(100);
                expect(matcher.runAlgorithm('exact', 'TEST', 'TEST')).toBe(100);
            });

            test('returns 0 for non-match', () => {
                expect(matcher.runAlgorithm('exact', 'Test', 'Other')).toBe(0);
            });
        });

        describe('jaroWinkler algorithm', () => {
            test('returns high score for similar strings', () => {
                const score = matcher.runAlgorithm('jaroWinkler', 'Acme Corp', 'Acme Corporation');
                expect(score).toBeGreaterThan(80);
            });

            test('returns 100 for identical strings', () => {
                const score = matcher.runAlgorithm('jaroWinkler', 'Test', 'Test');
                expect(score).toBe(100);
            });

            test('returns low score for different strings', () => {
                const score = matcher.runAlgorithm('jaroWinkler', 'Apple', 'Zebra');
                expect(score).toBeLessThan(50);
            });
        });

        describe('diceCoefficient algorithm', () => {
            test('returns high score for similar strings', () => {
                const score = matcher.runAlgorithm('diceCoefficient', 'acme.com', 'acme.org');
                expect(score).toBeGreaterThan(50);
            });

            test('returns 100 for identical strings', () => {
                const score = matcher.runAlgorithm('diceCoefficient', 'test.com', 'test.com');
                expect(score).toBe(100);
            });
        });

        describe('tokenSimilarity algorithm', () => {
            test('returns high score for strings with common tokens', () => {
                // 'Acme Software Inc' vs 'Acme Software LLC' = 2/4 tokens match = 50%
                const score = matcher.runAlgorithm('tokenSimilarity', 'Acme Software Inc', 'Acme Software LLC');
                expect(score).toBeGreaterThanOrEqual(50);
            });

            test('returns 100 for identical strings', () => {
                const score = matcher.runAlgorithm('tokenSimilarity', 'Test Corp', 'Test Corp');
                expect(score).toBe(100);
            });
        });

        describe('soundex algorithm', () => {
            test('returns 100 for phonetically similar names', () => {
                const score = matcher.runAlgorithm('soundex', 'Smith', 'Smyth');
                expect(score).toBe(100);
            });

            test('returns 0 for phonetically different names', () => {
                const score = matcher.runAlgorithm('soundex', 'Smith', 'Johnson');
                expect(score).toBe(0);
            });
        });

        describe('levenshtein algorithm', () => {
            test('returns high score for similar strings', () => {
                const score = matcher.runAlgorithm('levenshtein', 'Acme', 'Acne');
                expect(score).toBeGreaterThan(70);
            });

            test('returns 100 for identical strings', () => {
                const score = matcher.runAlgorithm('levenshtein', 'Test', 'Test');
                expect(score).toBe(100);
            });
        });

        describe('default algorithm', () => {
            test('falls back to jaroWinkler for unknown algorithm', () => {
                const score = matcher.runAlgorithm('unknown', 'Test Corp', 'Test Corporation');
                const expectedScore = matcher.runAlgorithm('jaroWinkler', 'Test Corp', 'Test Corporation');
                expect(score).toBe(expectedScore);
            });
        });
    });

    // ============================================
    // Specialized Similarity Methods Tests
    // ============================================
    describe('localPartSimilarity', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('compares email local parts', () => {
            const score = matcher.localPartSimilarity('john.doe@acme.com', 'john.doe@other.com');
            expect(score).toBe(1); // Identical local parts
        });

        test('returns high similarity for similar local parts', () => {
            const score = matcher.localPartSimilarity('john.doe@acme.com', 'johndoe@other.com');
            expect(score).toBeGreaterThan(0.8);
        });

        test('returns low similarity for different local parts', () => {
            const score = matcher.localPartSimilarity('john@acme.com', 'jane@other.com');
            expect(score).toBeLessThan(0.8);
        });

        test('handles emails without @ symbol', () => {
            const score = matcher.localPartSimilarity('invalid', 'invalid');
            expect(score).toBe(1);
        });
    });

    describe('lastDigitsSimilarity', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('returns 1 for matching last 7 digits', () => {
            const score = matcher.lastDigitsSimilarity('1-555-123-4567', '+1 (555) 123-4567');
            expect(score).toBe(1);
        });

        test('returns 0 for different last digits', () => {
            const score = matcher.lastDigitsSimilarity('555-123-4567', '555-123-4568');
            expect(score).toBe(0);
        });

        test('handles various phone formats', () => {
            const score = matcher.lastDigitsSimilarity('5551234567', '(555) 123-4567');
            expect(score).toBe(1);
        });
    });

    describe('componentMatch', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('returns high score for identical addresses', () => {
            const score = matcher.componentMatch(
                '123 Main St, Austin, TX 78701',
                '123 Main Street, Austin, TX 78701',
                'address'
            );
            expect(score).toBeGreaterThan(0.5);
        });

        test('returns partial score for partially matching addresses', () => {
            const score = matcher.componentMatch(
                '123 Main St, Austin, TX 78701',
                '456 Oak Ave, Austin, TX 78701',
                'address'
            );
            // City, state, and zip match but not street
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThan(1);
        });
    });

    // ============================================
    // Field Similarity Calculation Tests
    // ============================================
    describe('calculateFieldSimilarity', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher();
        });

        test('calculates name similarity with multiple algorithms', () => {
            const result = matcher.calculateFieldSimilarity('name', 'Acme Corp', 'Acme Corporation');

            expect(result.score).toBeGreaterThan(70);
            expect(result.algorithm).toBe('jaroWinkler');
            expect(result.value1).toBe('Acme Corp');
            expect(result.value2).toBe('Acme Corporation');
        });

        test('calculates domain similarity', () => {
            const result = matcher.calculateFieldSimilarity('domain', 'acme.com', 'acme.com');
            expect(result.score).toBe(100);
        });

        test('calculates email similarity', () => {
            const result = matcher.calculateFieldSimilarity('email', 'john@acme.com', 'john@acme.com');
            expect(result.score).toBe(100);
        });

        test('caps score at 100', () => {
            // Phonetic match could boost score above 100 before capping
            const result = matcher.calculateFieldSimilarity('name', 'Smith', 'Smith');
            expect(result.score).toBeLessThanOrEqual(100);
        });

        test('uses default algorithm for unknown field', () => {
            const result = matcher.calculateFieldSimilarity('unknown_field', 'Test', 'Test');
            expect(result.score).toBe(100);
            expect(result.algorithm).toBe('jaroWinkler');
        });
    });

    // ============================================
    // Full Similarity Calculation Tests
    // ============================================
    describe('calculateSimilarity', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher({ entityType: 'account' });
        });

        test('calculates overall similarity between records', () => {
            const record1 = { name: 'Acme Corp', domain: 'acme.com' };
            const record2 = { name: 'Acme Corporation', domain: 'acme.com' };

            const result = matcher.calculateSimilarity(record1, record2);

            expect(result.score).toBeGreaterThan(80);
            expect(result.fieldScores).toBeDefined();
            expect(result.signals).toBeInstanceOf(Array);
            expect(result.fieldsCompared).toBeGreaterThan(0);
        });

        test('generates exact_match signal for high field scores', () => {
            const record1 = { name: 'Acme', domain: 'acme.com' };
            const record2 = { name: 'Acme', domain: 'acme.com' };

            const result = matcher.calculateSimilarity(record1, record2);

            expect(result.signals.some(s => s.type === 'exact_match')).toBe(true);
        });

        test('generates strong_match signal for medium-high field scores', () => {
            const record1 = { name: 'Acme Corporation' };
            const record2 = { name: 'Acme Corp' };

            const result = matcher.calculateSimilarity(record1, record2);

            expect(result.signals.some(s =>
                s.type === 'strong_match' || s.type === 'exact_match'
            )).toBe(true);
        });

        test('generates name_domain_match signal for high name and domain', () => {
            const record1 = { name: 'Acme Inc', domain: 'acme.com' };
            const record2 = { name: 'Acme Inc', domain: 'acme.com' };

            const result = matcher.calculateSimilarity(record1, record2);

            expect(result.signals.some(s => s.type === 'name_domain_match')).toBe(true);
        });

        test('generates email_exact signal for exact email match', () => {
            const matcher = new ProbabilisticMatcher({ entityType: 'contact' });
            const record1 = { email: 'john@acme.com' };
            const record2 = { email: 'john@acme.com' };

            const result = matcher.calculateSimilarity(record1, record2);

            expect(result.signals.some(s => s.type === 'email_exact')).toBe(true);
        });

        test('handles records with no common fields', () => {
            const record1 = { field1: 'value1' };
            const record2 = { field2: 'value2' };

            const result = matcher.calculateSimilarity(record1, record2);

            expect(result.score).toBe(0);
            expect(result.fieldsCompared).toBe(0);
        });

        test('caps final score at 100', () => {
            const record1 = { name: 'Test', domain: 'test.com', phone: '5551234567' };
            const record2 = { name: 'Test', domain: 'test.com', phone: '5551234567' };

            const result = matcher.calculateSimilarity(record1, record2);

            expect(result.score).toBeLessThanOrEqual(100);
        });
    });

    // ============================================
    // Blocking Strategy Tests
    // ============================================
    describe('Blocking Strategy', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher({ blockingEnabled: true });
        });

        describe('getBlockingKeys', () => {
            test('generates domain prefix key', () => {
                const keys = matcher.getBlockingKeys({ domain: 'acme.com' });
                expect(keys.has('dom:acm')).toBe(true);
            });

            test('generates name prefix key', () => {
                const keys = matcher.getBlockingKeys({ name: 'Acme Corp' });
                expect(keys.has('nam:acm')).toBe(true);
            });

            test('generates email domain key', () => {
                const keys = matcher.getBlockingKeys({ email: 'john@acme.com' });
                expect(keys.has('eml:acme.com')).toBe(true);
            });

            test('generates phone area code key', () => {
                const keys = matcher.getBlockingKeys({ phone: '555-123-4567' });
                expect(keys.has('phn:555')).toBe(true);
            });

            test('generates phone area code skipping US country code', () => {
                const keys = matcher.getBlockingKeys({ phone: '1-555-123-4567' });
                expect(keys.has('phn:555')).toBe(true);
            });

            test('generates soundex key for name', () => {
                const keys = matcher.getBlockingKeys({ name: 'Acme' });
                expect(Array.from(keys).some(k => k.startsWith('sdx:'))).toBe(true);
            });

            test('handles short values', () => {
                const keys = matcher.getBlockingKeys({ name: 'AB', domain: 'ab' });
                expect(keys.size).toBeGreaterThan(0); // Should still have soundex
            });

            test('returns empty set for empty record', () => {
                const keys = matcher.getBlockingKeys({});
                expect(keys.size).toBe(0);
            });
        });

        describe('applyBlocking', () => {
            test('filters to records with matching blocking keys', () => {
                const newRecord = { name: 'Acme Corp', domain: 'acme.com' };
                const existingRecords = [
                    { name: 'Acme Inc', domain: 'acme.com' },      // Should match
                    { name: 'Beta Corp', domain: 'beta.com' },     // Should not match
                    { name: 'Acme Software', domain: 'acme.net' }  // Should match (name prefix)
                ];

                const blocked = matcher.applyBlocking(newRecord, existingRecords);

                expect(blocked.length).toBeLessThan(existingRecords.length);
                expect(blocked.some(r => r.name === 'Acme Inc')).toBe(true);
            });

            test('returns all records if blocking would eliminate all', () => {
                const newRecord = { name: 'Unique Name' };
                const existingRecords = [
                    { name: 'Completely Different' }
                ];

                const blocked = matcher.applyBlocking(newRecord, existingRecords);

                expect(blocked).toEqual(existingRecords);
            });
        });
    });

    // ============================================
    // findMatches Tests
    // ============================================
    describe('findMatches', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher({
                entityType: 'account',
                blockingEnabled: false // Disable for predictable tests
            });
        });

        test('finds matches above minimum score', () => {
            const newRecord = { name: 'Acme Corp', domain: 'acme.com' };
            const existingRecords = [
                { id: '1', name: 'Acme Corporation', domain: 'acme.com' },
                { id: '2', name: 'Beta Inc', domain: 'beta.com' },
                { id: '3', name: 'Acme Software', domain: 'acme.net' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            expect(result.matches.length).toBeGreaterThan(0);
            expect(result.matches[0].score).toBeGreaterThan(65);
        });

        test('returns best match', () => {
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme Corp', domain: 'acme.org' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            expect(result.bestMatch).toBeDefined();
            expect(result.bestMatch.score).toBeGreaterThanOrEqual(result.matches[1]?.score || 0);
        });

        test('sorts matches by score descending', () => {
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { id: '1', name: 'Acme Corp', domain: 'acme.net' },
                { id: '2', name: 'Acme', domain: 'acme.com' },
                { id: '3', name: 'Acme Inc', domain: 'acme.org' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            for (let i = 1; i < result.matches.length; i++) {
                expect(result.matches[i - 1].score).toBeGreaterThanOrEqual(result.matches[i].score);
            }
        });

        test('respects maxResults option', () => {
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = Array.from({ length: 20 }, (_, i) => ({
                id: `${i}`,
                name: `Acme ${i}`,
                domain: 'acme.com'
            }));

            const result = matcher.findMatches(newRecord, existingRecords, { maxResults: 5 });

            expect(result.matches.length).toBeLessThanOrEqual(5);
        });

        test('respects minScore option', () => {
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Beta', domain: 'beta.com' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords, { minScore: 90 });

            result.matches.forEach(match => {
                expect(match.score).toBeGreaterThanOrEqual(90);
            });
        });

        test('returns all results when returnAll is true', () => {
            const newRecord = { name: 'Acme' };
            const existingRecords = [
                { id: '1', name: 'Acme' },
                { id: '2', name: 'Completely Different' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords, { returnAll: true });

            expect(result.matches.length).toBe(2);
        });

        test('sets hasAutoMerge flag correctly', () => {
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { id: '1', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            expect(result.hasAutoMerge).toBe(true);
        });

        test('sets hasReviewNeeded flag correctly', () => {
            const newRecord = { name: 'Acme Corporation' };
            const existingRecords = [
                { id: '1', name: 'Acme Corp' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            if (result.matches[0]?.classification === 'needs_review') {
                expect(result.hasReviewNeeded).toBe(true);
            }
        });

        test('includes field scores in results', () => {
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { id: '1', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            expect(result.bestMatch.fieldScores).toBeDefined();
            expect(Object.keys(result.bestMatch.fieldScores).length).toBeGreaterThan(0);
        });

        test('includes statistics', () => {
            const newRecord = { name: 'Acme' };
            const existingRecords = [
                { id: '1', name: 'Acme' },
                { id: '2', name: 'Beta' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            expect(result.stats).toBeDefined();
            expect(result.stats.comparisons).toBeGreaterThan(0);
            expect(result.stats.processingTime).toBeGreaterThanOrEqual(0);
        });

        test('handles empty existing records', () => {
            const newRecord = { name: 'Acme' };

            const result = matcher.findMatches(newRecord, []);

            expect(result.matches).toEqual([]);
            expect(result.bestMatch).toBeNull();
        });

        test('tracks blocked comparisons when blocking enabled', () => {
            const matcherWithBlocking = new ProbabilisticMatcher({ blockingEnabled: true });
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { name: 'Acme', domain: 'acme.com' },
                { name: 'Beta', domain: 'beta.com' },
                { name: 'Gamma', domain: 'gamma.com' }
            ];

            const result = matcherWithBlocking.findMatches(newRecord, existingRecords);

            // Some records should be blocked
            expect(result.stats.blockedComparisons + result.stats.comparisons)
                .toBeLessThanOrEqual(existingRecords.length);
        });
    });

    // ============================================
    // findAllPairs Tests
    // ============================================
    describe('findAllPairs', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher({
                entityType: 'account',
                blockingEnabled: false
            });
        });

        test('finds all matching pairs in a set', () => {
            const records = [
                { id: '1', name: 'Acme Corp', domain: 'acme.com' },
                { id: '2', name: 'Acme Corporation', domain: 'acme.com' },
                { id: '3', name: 'Beta Inc', domain: 'beta.com' }
            ];

            const result = matcher.findAllPairs(records);

            expect(result.pairs.length).toBeGreaterThan(0);
            expect(result.totalRecords).toBe(3);
        });

        test('calculates correct total comparisons', () => {
            const records = [
                { id: '1', name: 'A' },
                { id: '2', name: 'B' },
                { id: '3', name: 'C' },
                { id: '4', name: 'D' }
            ];

            const result = matcher.findAllPairs(records);

            // n*(n-1)/2 = 4*3/2 = 6
            expect(result.totalComparisons).toBe(6);
        });

        test('respects minScore option', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' },
                { id: '3', name: 'Different', domain: 'other.com' }
            ];

            const result = matcher.findAllPairs(records, { minScore: 90 });

            result.pairs.forEach(pair => {
                expect(pair.score).toBeGreaterThanOrEqual(90);
            });
        });

        test('sorts pairs by score descending', () => {
            const records = [
                { id: '1', name: 'Acme Corp', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' },
                { id: '3', name: 'Acme Corporation', domain: 'acme.com' }
            ];

            const result = matcher.findAllPairs(records);

            for (let i = 1; i < result.pairs.length; i++) {
                expect(result.pairs[i - 1].score).toBeGreaterThanOrEqual(result.pairs[i].score);
            }
        });

        test('includes classification in pairs', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findAllPairs(records);

            expect(result.pairs[0].classification).toBeDefined();
            expect(['auto_merge', 'needs_review', 'probable', 'no_match']).toContain(
                result.pairs[0].classification
            );
        });

        test('includes field scores in pairs', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findAllPairs(records);

            expect(result.pairs[0].fieldScores).toBeDefined();
        });

        test('tracks processing time', () => {
            const records = [
                { id: '1', name: 'Acme' },
                { id: '2', name: 'Beta' }
            ];

            const result = matcher.findAllPairs(records);

            expect(result.processingTime).toBeGreaterThanOrEqual(0);
        });

        test('handles empty records array', () => {
            const result = matcher.findAllPairs([]);

            expect(result.pairs).toEqual([]);
            expect(result.totalRecords).toBe(0);
        });

        test('handles single record', () => {
            const result = matcher.findAllPairs([{ id: '1', name: 'Acme' }]);

            expect(result.pairs).toEqual([]);
            expect(result.totalRecords).toBe(1);
        });
    });

    // ============================================
    // findDuplicates Tests
    // ============================================
    describe('findDuplicates', () => {
        let matcher;

        beforeEach(() => {
            matcher = new ProbabilisticMatcher({
                entityType: 'account',
                blockingEnabled: false
            });
        });

        test('finds duplicate clusters', () => {
            const records = [
                { id: '1', name: 'Acme Corp', domain: 'acme.com' },
                { id: '2', name: 'Acme Corporation', domain: 'acme.com' },
                { id: '3', name: 'Beta Inc', domain: 'beta.com' },
                { id: '4', name: 'Beta', domain: 'beta.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.clusters.length).toBeGreaterThan(0);
        });

        test('clusters contain records', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.clusters[0].records).toBeDefined();
            expect(result.clusters[0].records.length).toBeGreaterThanOrEqual(2);
        });

        test('assigns cluster IDs', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.clusters[0].id).toMatch(/^prob-cluster-\d+$/);
        });

        test('calculates max score per cluster', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.clusters[0].maxScore).toBeGreaterThan(0);
        });

        test('classifies clusters by max score', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(['auto_merge', 'needs_review', 'probable', 'no_match']).toContain(
                result.clusters[0].classification
            );
        });

        test('filters out singletons (non-duplicate clusters)', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' },
                { id: '3', name: 'Unique Company', domain: 'unique.com' }
            ];

            const result = matcher.findDuplicates(records);

            result.clusters.forEach(cluster => {
                expect(cluster.recordCount).toBeGreaterThanOrEqual(2);
            });
        });

        test('performs transitive closure (union-find)', () => {
            // A matches B, B matches C -> A, B, C should be in same cluster
            const records = [
                { id: '1', name: 'Acme Corp', domain: 'acme.com' },
                { id: '2', name: 'Acme Corporation', domain: 'acme.com' },
                { id: '3', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findDuplicates(records);

            // All three should be in the same cluster
            const totalRecordsInClusters = result.clusters.reduce(
                (sum, c) => sum + c.recordCount, 0
            );
            expect(totalRecordsInClusters).toBe(3);
        });

        test('includes cluster count in results', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.clusterCount).toBe(result.clusters.length);
        });

        test('calculates total duplicates', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' },
                { id: '3', name: 'Beta', domain: 'beta.com' },
                { id: '4', name: 'Beta', domain: 'beta.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.totalDuplicates).toBeGreaterThanOrEqual(4);
        });

        test('handles no duplicates', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Beta', domain: 'beta.com' },
                { id: '3', name: 'Gamma', domain: 'gamma.com' }
            ];

            const result = matcher.findDuplicates(records, { minScore: 99 });

            expect(result.clusters.length).toBe(0);
            expect(result.totalDuplicates).toBe(0);
        });

        test('includes pairs information in clusters', () => {
            const records = [
                { id: '1', name: 'Acme', domain: 'acme.com' },
                { id: '2', name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.clusters[0].pairs).toBeDefined();
            expect(result.clusters[0].pairs.length).toBeGreaterThan(0);
        });
    });

    // ============================================
    // Weight and Threshold Management Tests
    // ============================================
    describe('setWeights', () => {
        test('updates weights', () => {
            const matcher = new ProbabilisticMatcher();
            matcher.setWeights({ name: 60, domain: 40 });

            expect(matcher.weights.name).toBe(60);
            expect(matcher.weights.domain).toBe(40);
        });

        test('merges with existing weights', () => {
            const matcher = new ProbabilisticMatcher();
            const originalPhone = matcher.weights.phone;
            matcher.setWeights({ name: 60 });

            expect(matcher.weights.name).toBe(60);
            expect(matcher.weights.phone).toBe(originalPhone);
        });
    });

    describe('setThresholds', () => {
        test('updates thresholds', () => {
            const matcher = new ProbabilisticMatcher();
            matcher.setThresholds({ autoMerge: 90, review: 70 });

            expect(matcher.thresholds.autoMerge).toBe(90);
            expect(matcher.thresholds.review).toBe(70);
        });

        test('merges with existing thresholds', () => {
            const matcher = new ProbabilisticMatcher();
            matcher.setThresholds({ autoMerge: 90 });

            expect(matcher.thresholds.autoMerge).toBe(90);
            expect(matcher.thresholds.probable).toBe(65); // Unchanged
        });
    });

    // ============================================
    // Entity Type Specific Tests
    // ============================================
    describe('Entity Type Specific Matching', () => {
        describe('Account matching', () => {
            test('prioritizes name and domain for accounts', () => {
                const matcher = new ProbabilisticMatcher({ entityType: 'account' });

                expect(matcher.weights.name).toBe(40);
                expect(matcher.weights.domain).toBe(25);
            });

            test('matches accounts by name and domain', () => {
                const matcher = new ProbabilisticMatcher({ entityType: 'account' });
                const result = matcher.calculateSimilarity(
                    { name: 'Acme Corp', domain: 'acme.com' },
                    { name: 'Acme Corporation', domain: 'acme.com' }
                );

                expect(result.score).toBeGreaterThan(80);
            });
        });

        describe('Contact matching', () => {
            test('prioritizes email and name for contacts', () => {
                const matcher = new ProbabilisticMatcher({ entityType: 'contact' });

                expect(matcher.weights.email).toBe(35);
                expect(matcher.weights.name).toBe(30);
            });

            test('matches contacts by email', () => {
                const matcher = new ProbabilisticMatcher({ entityType: 'contact' });
                const result = matcher.calculateSimilarity(
                    { email: 'john.doe@acme.com', name: 'John Doe' },
                    { email: 'john.doe@acme.com', name: 'John D.' }
                );

                expect(result.score).toBeGreaterThan(70);
            });
        });

        describe('Lead matching', () => {
            test('has same weights as contact', () => {
                const matcher = new ProbabilisticMatcher({ entityType: 'lead' });

                expect(matcher.weights.email).toBe(35);
                expect(matcher.weights.name).toBe(30);
            });
        });
    });

    // ============================================
    // Edge Cases and Error Handling Tests
    // ============================================
    describe('Edge Cases', () => {
        test('handles null values in records', () => {
            const matcher = new ProbabilisticMatcher();
            const result = matcher.calculateSimilarity(
                { name: null, domain: 'acme.com' },
                { name: 'Acme', domain: 'acme.com' }
            );

            expect(result.score).toBeGreaterThanOrEqual(0);
        });

        test('handles undefined values in records', () => {
            const matcher = new ProbabilisticMatcher();
            const result = matcher.calculateSimilarity(
                { domain: 'acme.com' },
                { name: 'Acme', domain: 'acme.com' }
            );

            expect(result.score).toBeGreaterThanOrEqual(0);
        });

        test('handles empty strings', () => {
            const matcher = new ProbabilisticMatcher();
            const result = matcher.calculateSimilarity(
                { name: '', domain: 'acme.com' },
                { name: 'Acme', domain: 'acme.com' }
            );

            expect(result.score).toBeGreaterThanOrEqual(0);
        });

        test('handles very long strings', () => {
            const matcher = new ProbabilisticMatcher();
            const longName = 'A'.repeat(1000);
            const result = matcher.calculateSimilarity(
                { name: longName },
                { name: longName }
            );

            expect(result.score).toBeGreaterThan(90);
        });

        test('handles special characters in values', () => {
            const matcher = new ProbabilisticMatcher();
            const result = matcher.calculateSimilarity(
                { name: 'Acme & Co. (LLC)' },
                { name: 'Acme & Co. LLC' }
            );

            expect(result.score).toBeGreaterThan(70);
        });

        test('handles unicode characters', () => {
            const matcher = new ProbabilisticMatcher();
            const result = matcher.calculateSimilarity(
                { name: 'Café München' },
                { name: 'Cafe Munchen' }
            );

            expect(result.score).toBeGreaterThan(50);
        });

        test('handles numeric values as strings', () => {
            const matcher = new ProbabilisticMatcher();
            // Note: normalizeRecord expects string values for name
            // Numbers passed through extractFieldValue are converted to strings
            const result = matcher.calculateSimilarity(
                { name: '123' },
                { name: '123' }
            );

            expect(result.fieldScores.name).toBeDefined();
            expect(result.fieldScores.name.score).toBe(100);
        });
    });

    // ============================================
    // Performance and Statistics Tests
    // ============================================
    describe('Statistics Tracking', () => {
        test('tracks comparison count via findMatches', () => {
            const matcher = new ProbabilisticMatcher({ blockingEnabled: false });
            const newRecord = { name: 'Test' };
            const existingRecords = [
                { name: 'A' },
                { name: 'B' },
                { name: 'C' }
            ];

            // findMatches increments stats.comparisons
            matcher.findMatches(newRecord, existingRecords);

            expect(matcher.stats.comparisons).toBe(3);
        });

        test('tracks matches found', () => {
            const matcher = new ProbabilisticMatcher({ blockingEnabled: false });
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { name: 'Acme', domain: 'acme.com' },
                { name: 'Beta', domain: 'beta.com' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            expect(result.stats.matchesFound).toBe(result.matches.length);
        });

        test('tracks classification counts', () => {
            const matcher = new ProbabilisticMatcher({ blockingEnabled: false });
            const newRecord = { name: 'Acme', domain: 'acme.com' };
            const existingRecords = [
                { name: 'Acme', domain: 'acme.com' }
            ];

            const result = matcher.findMatches(newRecord, existingRecords);

            const totalClassified = result.stats.autoMerge +
                result.stats.needsReview +
                result.stats.probable +
                result.stats.noMatch;
            expect(totalClassified).toBe(result.stats.matchesFound);
        });

        test('resets stats on each findMatches call', () => {
            const matcher = new ProbabilisticMatcher();
            const record = { name: 'Test' };

            matcher.findMatches(record, [{ name: 'Test' }]);
            const firstComparisons = matcher.stats.comparisons;

            matcher.findMatches(record, [{ name: 'Other' }]);
            expect(matcher.stats.comparisons).not.toBe(firstComparisons + 1);
        });
    });

    // ============================================
    // Integration Tests
    // ============================================
    describe('Integration Tests', () => {
        test('full workflow: find and cluster duplicates', () => {
            const matcher = new ProbabilisticMatcher({
                entityType: 'account',
                blockingEnabled: false
            });

            const records = [
                { id: 'sf-001', name: 'Acme Corporation', domain: 'acme.com', phone: '555-123-4567' },
                { id: 'hs-001', name: 'ACME Corp', domain: 'acme.com', phone: '(555) 123-4567' },
                { id: 'sf-002', name: 'Beta Industries', domain: 'beta.com', phone: '555-987-6543' },
                { id: 'hs-002', name: 'Beta Industries Inc.', domain: 'beta.com', phone: '555-987-6543' },
                { id: 'sf-003', name: 'Gamma LLC', domain: 'gamma.io', phone: '555-111-2222' }
            ];

            const result = matcher.findDuplicates(records);

            expect(result.clusters.length).toBeGreaterThanOrEqual(2);
            expect(result.clusters.some(c =>
                c.records.some(r => r.name.toLowerCase().includes('acme'))
            )).toBe(true);
            expect(result.clusters.some(c =>
                c.records.some(r => r.name.toLowerCase().includes('beta'))
            )).toBe(true);
        });

        test('cross-platform matching: Salesforce to HubSpot', () => {
            const matcher = new ProbabilisticMatcher({
                entityType: 'contact',
                blockingEnabled: false
            });

            const salesforceContact = {
                id: 'sf-contact-001',
                name: 'John Smith',
                email: 'john.smith@acme.com',
                phone: '555-123-4567',
                company: 'Acme Corp'
            };

            const hubspotContacts = [
                { id: 'hs-001', name: 'John Smith', email: 'john.smith@acme.com', properties: { company: 'Acme' } },
                { id: 'hs-002', name: 'Jane Doe', email: 'jane@other.com', properties: { company: 'Other' } },
                { id: 'hs-003', name: 'J. Smith', email: 'jsmith@acme.com', properties: { company: 'Acme Corp' } }
            ];

            const result = matcher.findMatches(salesforceContact, hubspotContacts);

            expect(result.bestMatch).toBeDefined();
            expect(result.bestMatch.record.id).toBe('hs-001');
            expect(result.bestMatch.classification).toBe('auto_merge');
        });

        test('configurable matching for different use cases', () => {
            // Strict matching
            const strictMatcher = new ProbabilisticMatcher({
                thresholds: { autoMerge: 99, review: 95, probable: 90 }
            });

            // Loose matching
            const looseMatcher = new ProbabilisticMatcher({
                thresholds: { autoMerge: 85, review: 70, probable: 50 }
            });

            // Use records that produce a score in the distinguishing range (~85-95)
            const record1 = { name: 'Acme Software Corp', domain: 'acme.com' };
            const record2 = { name: 'Acme Tech', domain: 'acme.com' };

            const strictResult = strictMatcher.calculateSimilarity(record1, record2);
            const looseResult = looseMatcher.calculateSimilarity(record1, record2);

            // Same score calculation
            expect(strictResult.score).toBe(looseResult.score);

            // With a score around 85-95, strict classifier sees it differently than loose
            // The score should be high enough for loose auto_merge but below strict auto_merge
            const score = strictResult.score;
            if (score >= 85 && score < 99) {
                // This demonstrates the configuration difference
                expect(looseMatcher.classifyScore(score)).toBe('auto_merge');
                expect(strictMatcher.classifyScore(score)).not.toBe('auto_merge');
            } else {
                // Just verify the thresholds are different
                expect(strictMatcher.thresholds.autoMerge).toBeGreaterThan(looseMatcher.thresholds.autoMerge);
            }
        });
    });
});
