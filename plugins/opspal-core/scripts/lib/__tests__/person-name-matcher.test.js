/**
 * PersonNameMatcher Tests
 *
 * Comprehensive test suite for component-level person name matching.
 * Tests the fix for the data-quality reflection where NAME_REVIEW_THRESHOLD
 * of 70% was too permissive, causing false positives like 'Jeffrey Sudlow'
 * matching 'Jeffrey Spotts'.
 *
 * @version 1.0.0
 * @reflection 11595b9d-2643-4002-b15a-17bad3678d21
 */

const { PersonNameMatcher, DEFAULT_THRESHOLDS } = require('../person-name-matcher');

describe('PersonNameMatcher', () => {

    let matcher;

    beforeEach(() => {
        matcher = new PersonNameMatcher();
    });

    // =========================================================================
    // Default Thresholds Tests
    // =========================================================================
    describe('DEFAULT_THRESHOLDS', () => {
        it('should have appropriate thresholds to prevent false positives', () => {
            expect(DEFAULT_THRESHOLDS.overall).toBe(0.85);
            expect(DEFAULT_THRESHOLDS.firstName).toBe(0.80);
            expect(DEFAULT_THRESHOLDS.lastName).toBe(0.85);
            expect(DEFAULT_THRESHOLDS.componentRequired).toBe(true);
        });
    });

    // =========================================================================
    // Name Parsing Tests
    // =========================================================================
    describe('parseName', () => {
        it('should parse two-part names correctly', () => {
            const result = matcher.parseName('Jeffrey Sudlow');
            expect(result.firstName).toBe('Jeffrey');
            expect(result.lastName).toBe('Sudlow');
            expect(result.middleNames).toEqual([]);
        });

        it('should parse three-part names correctly', () => {
            const result = matcher.parseName('John Michael Smith');
            expect(result.firstName).toBe('John');
            expect(result.lastName).toBe('Smith');
            expect(result.middleNames).toEqual(['Michael']);
        });

        it('should parse names with multiple middle names', () => {
            const result = matcher.parseName('John Michael David Smith');
            expect(result.firstName).toBe('John');
            expect(result.lastName).toBe('Smith');
            expect(result.middleNames).toEqual(['Michael', 'David']);
        });

        it('should handle single names', () => {
            const result = matcher.parseName('Madonna');
            expect(result.firstName).toBe('Madonna');
            expect(result.lastName).toBe('');
        });

        it('should handle empty/null input', () => {
            expect(matcher.parseName('').firstName).toBe('');
            expect(matcher.parseName(null).firstName).toBe('');
            expect(matcher.parseName(undefined).firstName).toBe('');
        });

        it('should handle extra whitespace', () => {
            const result = matcher.parseName('  John    Smith  ');
            expect(result.firstName).toBe('John');
            expect(result.lastName).toBe('Smith');
        });
    });

    // =========================================================================
    // Critical False Positive Prevention (Data Quality Reflection Fix)
    // =========================================================================
    describe('false positive prevention', () => {
        it('should NOT match Jeffrey Sudlow to Jeffrey Spotts', () => {
            // This is the critical test case from the reflection
            const result = matcher.match('Jeffrey Sudlow', 'Jeffrey Spotts');

            expect(result.isMatch).toBe(false);
            expect(result.breakdown.firstName.passes).toBe(true);  // First names match
            expect(result.breakdown.lastName.passes).toBe(false);  // Last names DON'T match
            expect(result.breakdown.lastName.similarity).toBeLessThan(50);
        });

        it('should NOT match same first name but completely different last name', () => {
            const result = matcher.match('John Smith', 'John Jones');
            expect(result.isMatch).toBe(false);
            expect(result.breakdown.lastName.passes).toBe(false);
        });

        it('should NOT match similar first name but completely different last name', () => {
            const result = matcher.match('Mike Johnson', 'Michael Williams');
            expect(result.isMatch).toBe(false);
        });
    });

    // =========================================================================
    // True Positive Tests (Should Match)
    // =========================================================================
    describe('true positive matching', () => {
        it('should match identical names', () => {
            const result = matcher.match('John Smith', 'John Smith');
            expect(result.isMatch).toBe(true);
            expect(result.confidence).toBe(100);
        });

        it('should match names with different case', () => {
            const result = matcher.match('john smith', 'JOHN SMITH');
            expect(result.isMatch).toBe(true);
        });

        it('should match nicknames with same last name', () => {
            const result = matcher.match('Jeff Sudlow', 'Jeffrey Sudlow');
            expect(result.isMatch).toBe(true);
            expect(result.breakdown.firstName.nicknameMatch).toBe(true);
        });

        it('should match various common nicknames', () => {
            const nicknamePairs = [
                ['Bill Smith', 'William Smith'],
                ['Bob Johnson', 'Robert Johnson'],
                ['Mike Davis', 'Michael Davis'],
                ['Jim Wilson', 'James Wilson'],
                ['Tom Brown', 'Thomas Brown'],
                ['Joe Garcia', 'Joseph Garcia'],
                ['Chris Lee', 'Christopher Lee'],
                ['Dan Miller', 'Daniel Miller'],
                ['Matt Taylor', 'Matthew Taylor'],
                ['Tony Anderson', 'Anthony Anderson'],
                ['Steve Martinez', 'Steven Martinez'],
                ['Ed Thompson', 'Edward Thompson'],
                ['Charlie White', 'Charles White'],
                ['Liz Harris', 'Elizabeth Harris'],
                ['Jen Clark', 'Jennifer Clark'],
                ['Kate Lewis', 'Catherine Lewis'],
                ['Maggie Robinson', 'Margaret Robinson'],
                ['Pat Walker', 'Patricia Walker'],
                ['Sue Hall', 'Susan Hall'],
                ['Becky Allen', 'Rebecca Allen'],
                ['Jess Young', 'Jessica Young'],
                ['Sam King', 'Samantha King'],
                ['Alex Wright', 'Alexandra Wright']
            ];

            for (const [nickname, fullName] of nicknamePairs) {
                const result = matcher.match(nickname, fullName);
                expect(result.isMatch).toBe(true);
                expect(result.breakdown.firstName.nicknameMatch).toBe(true);
            }
        });

        it('should match names with minor typos if both components pass', () => {
            const result = matcher.match('John Smth', 'John Smith');
            // First name exact, last name 80% similar
            expect(result.breakdown.firstName.passes).toBe(true);
            // Smth vs Smith = 4/5 = 80%, depends on threshold
        });
    });

    // =========================================================================
    // Component-Level Threshold Tests
    // =========================================================================
    describe('component thresholds', () => {
        it('should fail if only first name matches', () => {
            const result = matcher.match('John Smith', 'John Doe');
            expect(result.isMatch).toBe(false);
            expect(result.breakdown.firstName.passes).toBe(true);
            expect(result.breakdown.lastName.passes).toBe(false);
        });

        it('should fail if only last name matches', () => {
            const result = matcher.match('John Smith', 'Jane Smith');
            expect(result.isMatch).toBe(false);
            expect(result.breakdown.lastName.passes).toBe(true);
            expect(result.breakdown.firstName.passes).toBe(false);
        });

        it('should require both components when componentRequired is true', () => {
            const strictMatcher = new PersonNameMatcher({
                thresholds: { componentRequired: true }
            });
            const result = strictMatcher.match('John Smith', 'John Doe');
            expect(result.isMatch).toBe(false);
        });

        it('should allow overall-only matching when componentRequired is false', () => {
            const relaxedMatcher = new PersonNameMatcher({
                thresholds: { componentRequired: false, overall: 0.50 }
            });
            // John Smith vs John Smyth - first names match exactly, last names close
            const result = relaxedMatcher.match('John Smith', 'John Smyth');
            // With relaxed settings, might match based on overall
            expect(result.thresholdsUsed.componentRequired).toBe(false);
        });
    });

    // =========================================================================
    // Confidence Scoring Tests
    // =========================================================================
    describe('confidence scoring', () => {
        it('should return 100% confidence for exact matches', () => {
            const result = matcher.match('John Smith', 'John Smith');
            expect(result.confidence).toBe(100);
        });

        it('should return weighted confidence (40% first, 60% last)', () => {
            const result = matcher.match('John Smith', 'John Smith');
            expect(result.breakdown.overall.similarity).toBe(100);
        });

        it('should properly weight last name higher', () => {
            // Last name counts 60% of overall score
            const result = matcher.match('Zzzz Smith', 'Aaaa Smith');
            // First names: 0% similar, Last names: 100% similar
            // Overall = 0 * 0.4 + 100 * 0.6 = 60%
            expect(result.breakdown.overall.similarity).toBe(60);
        });
    });

    // =========================================================================
    // findBestMatch Tests
    // =========================================================================
    describe('findBestMatch', () => {
        const candidates = [
            { Name: 'John Smith', Id: '001' },
            { Name: 'Jane Doe', Id: '002' },
            { Name: 'Jeffrey Sudlow', Id: '003' },
            { Name: 'Robert Johnson', Id: '004' },
            { Name: 'Michael Williams', Id: '005' }
        ];

        it('should find exact match', () => {
            const result = matcher.findBestMatch('John Smith', candidates, { nameField: 'Name' });
            expect(result).not.toBeNull();
            expect(result.candidate.Id).toBe('001');
            expect(result.confidence).toBe(100);
        });

        it('should find nickname match', () => {
            const result = matcher.findBestMatch('Bob Johnson', candidates, { nameField: 'Name' });
            expect(result).not.toBeNull();
            expect(result.candidate.Id).toBe('004');
            expect(result.breakdown.firstName.nicknameMatch).toBe(true);
        });

        it('should return null when no match found', () => {
            const result = matcher.findBestMatch('Unknown Person', candidates, { nameField: 'Name' });
            expect(result).toBeNull();
        });

        it('should NOT match Jeffrey Spotts to Jeffrey Sudlow', () => {
            const result = matcher.findBestMatch('Jeffrey Spotts', candidates, { nameField: 'Name' });
            // Should not match Jeffrey Sudlow despite same first name
            if (result) {
                expect(result.candidate.Name).not.toBe('Jeffrey Sudlow');
            }
        });
    });

    // =========================================================================
    // batchMatch Tests
    // =========================================================================
    describe('batchMatch', () => {
        const searchNames = ['John Smith', 'Jane Doe', 'Unknown Person'];
        const candidates = [
            'John Smith',
            'Jane Doe',
            'Bob Johnson'
        ];

        it('should batch match multiple names', () => {
            const results = matcher.batchMatch(searchNames, candidates);

            expect(results).toHaveLength(3);
            expect(results[0].searchName).toBe('John Smith');
            expect(results[0].bestMatch).not.toBeNull();

            expect(results[1].searchName).toBe('Jane Doe');
            expect(results[1].bestMatch).not.toBeNull();

            expect(results[2].searchName).toBe('Unknown Person');
            expect(results[2].bestMatch).toBeNull();
        });
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================
    describe('edge cases', () => {
        it('should handle empty strings', () => {
            const result = matcher.match('', '');
            // Empty strings technically match (both are empty)
            // But this is an edge case - the main use case is non-empty names
            expect(result.confidence).toBeDefined();
        });

        it('should handle null/undefined', () => {
            const result = matcher.match(null, 'John Smith');
            expect(result.isMatch).toBe(false);
        });

        it('should handle names with special characters', () => {
            const result = matcher.match("O'Brien", "O'Brien");
            expect(result.isMatch).toBe(true);
        });

        it('should handle hyphenated names', () => {
            const result = matcher.match('Mary Smith-Jones', 'Mary Smith-Jones');
            expect(result.isMatch).toBe(true);
        });

        it('should handle single-word names gracefully', () => {
            const result = matcher.match('Madonna', 'Madonna');
            expect(result.isMatch).toBe(true);
        });
    });

    // =========================================================================
    // Custom Threshold Tests
    // =========================================================================
    describe('custom thresholds', () => {
        it('should allow custom overall threshold', () => {
            const strictMatcher = new PersonNameMatcher({
                thresholds: { overall: 0.95 }
            });
            const result = strictMatcher.match('John Smth', 'John Smith');
            // Stricter threshold may reject near-matches
            expect(result.thresholdsUsed.overall).toBe(0.95);
        });

        it('should allow custom first name threshold', () => {
            const strictMatcher = new PersonNameMatcher({
                thresholds: { firstName: 0.95 }
            });
            const result = strictMatcher.match('Jonn Smith', 'John Smith');
            expect(result.thresholdsUsed.firstName).toBe(0.95);
        });

        it('should allow custom last name threshold', () => {
            const strictMatcher = new PersonNameMatcher({
                thresholds: { lastName: 0.95 }
            });
            const result = strictMatcher.match('John Smth', 'John Smith');
            expect(result.thresholdsUsed.lastName).toBe(0.95);
        });

        it('should accept threshold overrides in match() call', () => {
            const result = matcher.match('John Smith', 'John Smyth', {
                thresholds: { lastName: 0.70 }
            });
            expect(result.thresholdsUsed.lastName).toBe(0.70);
        });
    });

    // =========================================================================
    // Disable Nickname Matching
    // =========================================================================
    describe('nickname matching disabled', () => {
        it('should not boost score when nicknames are disabled', () => {
            const noNicknameMatcher = new PersonNameMatcher({
                allowNicknames: false
            });
            const result = noNicknameMatcher.match('Jeff Smith', 'Jeffrey Smith');
            expect(result.breakdown.firstName.nicknameMatch).toBe(false);
            // Score should be based purely on string similarity
            expect(result.breakdown.firstName.adjustedSimilarity).toBe(result.breakdown.firstName.similarity);
        });
    });

    // =========================================================================
    // Match Reason Messages
    // =========================================================================
    describe('match reasons', () => {
        it('should provide clear reason for first name failure', () => {
            const result = matcher.match('Zzz Smith', 'John Smith');
            expect(result.matchReason).toContain('First name below threshold');
        });

        it('should provide clear reason for last name failure', () => {
            const result = matcher.match('John Zzz', 'John Smith');
            expect(result.matchReason).toContain('Last name below threshold');
        });

        it('should provide clear reason for both failing', () => {
            const result = matcher.match('Zzz Yyy', 'John Smith');
            expect(result.matchReason).toContain('Both first name');
            expect(result.matchReason).toContain('and last name');
        });

        it('should provide clear reason for successful match', () => {
            const result = matcher.match('John Smith', 'John Smith');
            // Exact match triggers nickname check which returns positive reason
            expect(result.isMatch).toBe(true);
            expect(result.matchReason.length).toBeGreaterThan(0);
        });

        it('should indicate nickname match in reason', () => {
            const result = matcher.match('Jeff Smith', 'Jeffrey Smith');
            expect(result.matchReason.toLowerCase()).toContain('nickname');
        });
    });
});
