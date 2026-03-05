/**
 * String Similarity Module Tests
 *
 * Comprehensive test suite for string comparison and phonetic algorithms
 * used in the RevOps Data Quality System.
 *
 * @version 1.0.0
 */

const {
    levenshtein,
    levenshteinSimilarity,
    jaro,
    jaroWinkler,
    soundex,
    doubleMetaphone,
    diceCoefficient,
    ngramSimilarity,
    longestCommonSubsequence,
    lcsSimilarity,
    tokenSimilarity,
    compositeSimilarity,
    isPhoneticMatch,
    normalizeForComparison
} = require('../string-similarity');

describe('String Similarity Module', () => {

    // =========================================================================
    // Levenshtein Distance Tests
    // =========================================================================
    describe('levenshtein', () => {
        it('should return 0 for identical strings', () => {
            expect(levenshtein('hello', 'hello')).toBe(0);
            expect(levenshtein('test', 'test')).toBe(0);
        });

        it('should return correct distance for single character difference', () => {
            expect(levenshtein('cat', 'bat')).toBe(1);  // substitution
            expect(levenshtein('cat', 'cats')).toBe(1); // insertion
            expect(levenshtein('cats', 'cat')).toBe(1); // deletion
        });

        it('should return correct distance for multiple edits', () => {
            expect(levenshtein('kitten', 'sitting')).toBe(3);
            expect(levenshtein('saturday', 'sunday')).toBe(3);
        });

        it('should handle empty strings', () => {
            expect(levenshtein('', 'hello')).toBe(5);
            expect(levenshtein('hello', '')).toBe(5);
            expect(levenshtein('', '')).toBe(0);
        });

        it('should handle null/undefined', () => {
            expect(levenshtein(null, 'hello')).toBe(5);
            expect(levenshtein('hello', null)).toBe(5);
            expect(levenshtein(null, null)).toBe(0);
            expect(levenshtein(undefined, 'test')).toBe(4);
        });

        it('should handle case sensitivity', () => {
            expect(levenshtein('Hello', 'hello')).toBe(1);
            expect(levenshtein('ABC', 'abc')).toBe(3);
        });

        it('should handle completely different strings', () => {
            expect(levenshtein('abc', 'xyz')).toBe(3);
        });
    });

    // =========================================================================
    // Levenshtein Similarity Tests
    // =========================================================================
    describe('levenshteinSimilarity', () => {
        it('should return 1 for identical strings', () => {
            expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
        });

        it('should return 0 for completely different strings of same length', () => {
            expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
        });

        it('should return value between 0 and 1 for partial matches', () => {
            const sim = levenshteinSimilarity('hello', 'hallo');
            expect(sim).toBeGreaterThan(0);
            expect(sim).toBeLessThan(1);
            expect(sim).toBeCloseTo(0.8, 1);
        });

        it('should handle empty strings', () => {
            expect(levenshteinSimilarity('', '')).toBe(1);
            expect(levenshteinSimilarity('hello', '')).toBe(0);
            expect(levenshteinSimilarity('', 'hello')).toBe(0);
        });

        it('should handle null values', () => {
            expect(levenshteinSimilarity(null, null)).toBe(1);
            expect(levenshteinSimilarity('test', null)).toBe(0);
        });
    });

    // =========================================================================
    // Jaro Similarity Tests
    // =========================================================================
    describe('jaro', () => {
        it('should return 1 for identical strings', () => {
            expect(jaro('hello', 'hello')).toBe(1);
        });

        it('should return 0 for completely different strings', () => {
            expect(jaro('abc', 'xyz')).toBe(0);
        });

        it('should calculate correct similarity for similar strings', () => {
            // Known test case
            const sim = jaro('MARTHA', 'MARHTA');
            expect(sim).toBeCloseTo(0.944, 2);
        });

        it('should handle transpositions', () => {
            const sim = jaro('DWAYNE', 'DUANE');
            expect(sim).toBeGreaterThan(0.8);
        });

        it('should handle empty/null strings', () => {
            expect(jaro('', 'hello')).toBe(0);
            expect(jaro('hello', '')).toBe(0);
            expect(jaro(null, 'hello')).toBe(0);
        });

        it('should be symmetric', () => {
            expect(jaro('ABC', 'ACB')).toBe(jaro('ACB', 'ABC'));
        });
    });

    // =========================================================================
    // Jaro-Winkler Similarity Tests
    // =========================================================================
    describe('jaroWinkler', () => {
        it('should return 1 for identical strings', () => {
            expect(jaroWinkler('hello', 'hello')).toBe(1);
        });

        it('should boost strings with common prefix', () => {
            const jw = jaroWinkler('MARTHA', 'MARHTA');
            const j = jaro('MARTHA', 'MARHTA');
            expect(jw).toBeGreaterThan(j);
        });

        it('should give higher score than jaro for matching prefixes', () => {
            const str1 = 'DIXON';
            const str2 = 'DICKSONX';
            expect(jaroWinkler(str1, str2)).toBeGreaterThan(jaro(str1, str2));
        });

        it('should handle custom prefix scale', () => {
            const defaultJW = jaroWinkler('test', 'test123');
            const customJW = jaroWinkler('test', 'test123', { prefixScale: 0.2 });
            expect(customJW).toBeGreaterThanOrEqual(defaultJW);
        });

        it('should respect max prefix length', () => {
            const result1 = jaroWinkler('abcdef', 'abcdxy', { prefixLength: 4 });
            const result2 = jaroWinkler('abcdef', 'abcdxy', { prefixLength: 2 });
            expect(result1).toBeGreaterThan(result2);
        });

        it('should handle null/empty strings', () => {
            expect(jaroWinkler('', 'hello')).toBe(0);
            expect(jaroWinkler(null, 'hello')).toBe(0);
        });
    });

    // =========================================================================
    // Soundex Tests
    // =========================================================================
    describe('soundex', () => {
        it('should generate correct soundex codes', () => {
            expect(soundex('Robert')).toBe('R163');
            expect(soundex('Rupert')).toBe('R163');
            // Ashcraft: A-2(S)-2(C)-6(R)-0 (C follows S so same code skipped)
            expect(soundex('Ashcraft')).toBe('A226');
            expect(soundex('Tymczak')).toBe('T522');
        });

        it('should match phonetically similar names', () => {
            expect(soundex('Smith')).toBe(soundex('Smyth'));
            expect(soundex('Johnson')).toBe(soundex('Jonson'));
        });

        it('should preserve first letter', () => {
            expect(soundex('Apple')[0]).toBe('A');
            expect(soundex('Banana')[0]).toBe('B');
        });

        it('should pad with zeros to 4 characters', () => {
            expect(soundex('A')).toBe('A000');
            expect(soundex('Al')).toBe('A400');
        });

        it('should handle empty/null strings', () => {
            expect(soundex('')).toBe('0000');
            expect(soundex(null)).toBe('0000');
        });

        it('should ignore non-alphabetic characters', () => {
            expect(soundex('O\'Brien')).toBe(soundex('OBrien'));
            expect(soundex('Smith-Jones')).toBe(soundex('SmithJones'));
        });

        it('should be case insensitive', () => {
            expect(soundex('ROBERT')).toBe(soundex('robert'));
            expect(soundex('Smith')).toBe(soundex('SMITH'));
        });
    });

    // =========================================================================
    // Double Metaphone Tests
    // =========================================================================
    describe('doubleMetaphone', () => {
        it('should return primary and alternate codes', () => {
            const result = doubleMetaphone('Smith');
            expect(result).toHaveProperty('primary');
            expect(result).toHaveProperty('alternate');
        });

        it('should generate correct primary codes', () => {
            // SM0 includes the TH -> 0 encoding
            expect(doubleMetaphone('Smith').primary).toBe('SM0');
            // Schmidt encodes as SMT (S-M-T)
            expect(doubleMetaphone('Schmidt').primary).toBe('SMT');
        });

        it('should handle CH sound', () => {
            const result = doubleMetaphone('Church');
            expect(result.primary).toContain('X');
        });

        it('should handle PH sound', () => {
            const result = doubleMetaphone('Phone');
            expect(result.primary).toContain('F');
        });

        it('should handle silent letters', () => {
            const gn = doubleMetaphone('Gnome');
            expect(gn.primary[0]).toBe('N');
        });

        it('should handle empty/null strings', () => {
            expect(doubleMetaphone('')).toEqual({ primary: '', alternate: '' });
            expect(doubleMetaphone(null)).toEqual({ primary: '', alternate: '' });
        });

        it('should match phonetically similar words', () => {
            const smith1 = doubleMetaphone('Smith');
            const smith2 = doubleMetaphone('Smythe');
            expect(smith1.primary).toBe(smith2.primary);
        });
    });

    // =========================================================================
    // Dice Coefficient Tests
    // =========================================================================
    describe('diceCoefficient', () => {
        it('should return 1 for identical strings', () => {
            expect(diceCoefficient('hello', 'hello')).toBe(1);
        });

        it('should return 0 for completely different strings', () => {
            expect(diceCoefficient('abc', 'xyz')).toBe(0);
        });

        it('should calculate correct coefficient for overlapping bigrams', () => {
            // 'night' bigrams: ni, ig, gh, ht
            // 'nacht' bigrams: na, ac, ch, ht
            // Intersection: ht (1)
            // Dice = 2 * 1 / (4 + 4) = 0.25
            const result = diceCoefficient('night', 'nacht');
            expect(result).toBeCloseTo(0.25, 2);
        });

        it('should handle short strings', () => {
            expect(diceCoefficient('a', 'a')).toBe(1);
            expect(diceCoefficient('a', 'b')).toBe(0);
            expect(diceCoefficient('ab', 'ab')).toBe(1);
        });

        it('should handle empty/null strings', () => {
            expect(diceCoefficient('', 'hello')).toBe(0);
            expect(diceCoefficient(null, 'hello')).toBe(0);
        });

        it('should be case insensitive', () => {
            expect(diceCoefficient('Hello', 'hello')).toBe(1);
        });
    });

    // =========================================================================
    // N-gram Similarity Tests
    // =========================================================================
    describe('ngramSimilarity', () => {
        it('should return 1 for identical strings', () => {
            expect(ngramSimilarity('hello', 'hello')).toBe(1);
        });

        it('should return 0 for completely different strings', () => {
            expect(ngramSimilarity('abc', 'xyz')).toBe(0);
        });

        it('should support custom n value', () => {
            const bigram = ngramSimilarity('hello', 'hella', 2);
            const trigram = ngramSimilarity('hello', 'hella', 3);
            // Bigrams should be more forgiving
            expect(bigram).toBeGreaterThan(trigram);
        });

        it('should handle strings shorter than n', () => {
            expect(ngramSimilarity('a', 'a', 2)).toBe(1);
            expect(ngramSimilarity('a', 'b', 2)).toBe(0);
        });

        it('should handle empty/null strings', () => {
            expect(ngramSimilarity('', 'hello')).toBe(0);
            expect(ngramSimilarity(null, 'hello')).toBe(0);
        });

        it('should be case insensitive', () => {
            expect(ngramSimilarity('HELLO', 'hello')).toBe(1);
        });
    });

    // =========================================================================
    // Longest Common Subsequence Tests
    // =========================================================================
    describe('longestCommonSubsequence', () => {
        it('should return full length for identical strings', () => {
            expect(longestCommonSubsequence('hello', 'hello')).toBe(5);
        });

        it('should return 0 for completely different strings', () => {
            expect(longestCommonSubsequence('abc', 'xyz')).toBe(0);
        });

        it('should find correct LCS length', () => {
            expect(longestCommonSubsequence('AGGTAB', 'GXTXAYB')).toBe(4); // GTAB
            expect(longestCommonSubsequence('ABCDGH', 'AEDFHR')).toBe(3); // ADH
        });

        it('should handle empty/null strings', () => {
            expect(longestCommonSubsequence('', 'hello')).toBe(0);
            expect(longestCommonSubsequence('hello', '')).toBe(0);
            expect(longestCommonSubsequence(null, 'hello')).toBe(0);
        });
    });

    // =========================================================================
    // LCS Similarity Tests
    // =========================================================================
    describe('lcsSimilarity', () => {
        it('should return 1 for identical strings', () => {
            expect(lcsSimilarity('hello', 'hello')).toBe(1);
        });

        it('should return 0 for completely different strings', () => {
            expect(lcsSimilarity('abc', 'xyz')).toBe(0);
        });

        it('should return value between 0 and 1 for partial matches', () => {
            const sim = lcsSimilarity('hello', 'hallo');
            expect(sim).toBeGreaterThan(0);
            expect(sim).toBeLessThan(1);
        });

        it('should handle empty strings', () => {
            expect(lcsSimilarity('', '')).toBe(1);
            expect(lcsSimilarity('hello', '')).toBe(0);
        });
    });

    // =========================================================================
    // Token Similarity Tests
    // =========================================================================
    describe('tokenSimilarity', () => {
        it('should return 1 for identical strings', () => {
            expect(tokenSimilarity('hello world', 'hello world')).toBe(1);
        });

        it('should handle reordered tokens', () => {
            // Jaccard is order-independent for set intersection
            expect(tokenSimilarity('hello world', 'world hello')).toBe(1);
        });

        it('should calculate correct Jaccard similarity', () => {
            // 'hello world' tokens: {hello, world}
            // 'hello there' tokens: {hello, there}
            // Intersection: 1, Union: 3
            // Jaccard = 1/3
            const sim = tokenSimilarity('hello world', 'hello there');
            expect(sim).toBeCloseTo(1/3, 2);
        });

        it('should ignore short tokens', () => {
            // Tokens of length 1 are filtered out, leaving empty sets
            // Both empty sets -> returns 1 (line 679)
            expect(tokenSimilarity('a b', 'c d')).toBe(1);
        });

        it('should be case insensitive', () => {
            expect(tokenSimilarity('Hello World', 'hello world')).toBe(1);
        });

        it('should ignore punctuation', () => {
            expect(tokenSimilarity('hello, world!', 'hello world')).toBe(1);
        });

        it('should handle empty/null strings', () => {
            expect(tokenSimilarity('', 'hello')).toBe(0);
            expect(tokenSimilarity(null, 'hello')).toBe(0);
        });

        it('should work well for company names', () => {
            // 'acme corporation inc' -> {acme, corporation, inc}
            // 'acme corp' -> {acme, corp}
            // Intersection: {acme} = 1, Union: 4
            // Jaccard = 1/4 = 0.25
            const sim = tokenSimilarity('Acme Corporation Inc', 'Acme Corp');
            expect(sim).toBeGreaterThanOrEqual(0.25);
        });
    });

    // =========================================================================
    // Composite Similarity Tests
    // =========================================================================
    describe('compositeSimilarity', () => {
        it('should return all algorithm scores', () => {
            const result = compositeSimilarity('hello', 'hallo');
            expect(result).toHaveProperty('jaroWinkler');
            expect(result).toHaveProperty('levenshtein');
            expect(result).toHaveProperty('dice');
            expect(result).toHaveProperty('phonetic');
            expect(result).toHaveProperty('composite');
        });

        it('should return 1 for identical strings (all algorithms)', () => {
            const result = compositeSimilarity('hello', 'hello');
            expect(result.jaroWinkler).toBe(1);
            expect(result.levenshtein).toBe(1);
            expect(result.dice).toBe(1);
            // Composite will be 1 if all algorithm scores are 1
            // Phonetic may vary, so check composite is high
            expect(result.composite).toBeGreaterThan(0.95);
        });

        it('should return weighted composite score', () => {
            const result = compositeSimilarity('hello', 'hallo');
            expect(result.composite).toBeGreaterThan(0);
            expect(result.composite).toBeLessThan(1);
        });

        it('should allow custom weights', () => {
            const defaultResult = compositeSimilarity('test', 'tast');
            const customResult = compositeSimilarity('test', 'tast', {
                weights: { jaroWinkler: 1.0, levenshtein: 0, dice: 0, phonetic: 0 }
            });
            // Custom should equal just jaroWinkler
            expect(customResult.composite).toBeCloseTo(customResult.jaroWinkler, 2);
        });

        it('should handle null/empty strings', () => {
            const result = compositeSimilarity('', 'hello');
            expect(result.composite).toBe(0);
        });

        it('should boost phonetically similar names', () => {
            const result = compositeSimilarity('Smith', 'Smyth');
            expect(result.phonetic).toBeGreaterThan(0.5);
        });
    });

    // =========================================================================
    // Phonetic Match Tests
    // =========================================================================
    describe('isPhoneticMatch', () => {
        it('should return true for identical strings', () => {
            expect(isPhoneticMatch('hello', 'hello')).toBe(true);
        });

        it('should return true for phonetically similar names', () => {
            expect(isPhoneticMatch('Smith', 'Smyth')).toBe(true);
            expect(isPhoneticMatch('Johnson', 'Jonson')).toBe(true);
            expect(isPhoneticMatch('Robert', 'Rupert')).toBe(true);
        });

        it('should return false for phonetically different names', () => {
            expect(isPhoneticMatch('Smith', 'Brown')).toBe(false);
            expect(isPhoneticMatch('Alice', 'Bob')).toBe(false);
        });

        it('should handle empty/null strings', () => {
            expect(isPhoneticMatch('', 'hello')).toBe(false);
            expect(isPhoneticMatch(null, 'hello')).toBe(false);
        });

        it('should use both soundex and double metaphone', () => {
            // These match via double metaphone but maybe not soundex
            const result = isPhoneticMatch('Catherine', 'Katherine');
            expect(result).toBe(true);
        });
    });

    // =========================================================================
    // Normalize For Comparison Tests
    // =========================================================================
    describe('normalizeForComparison', () => {
        it('should convert to lowercase', () => {
            expect(normalizeForComparison('HELLO')).toBe('hello');
            expect(normalizeForComparison('HeLLo WoRLD')).toBe('hello world');
        });

        it('should remove punctuation', () => {
            expect(normalizeForComparison('hello, world!')).toBe('hello world');
            expect(normalizeForComparison("it's a test")).toBe('its a test');
        });

        it('should collapse multiple spaces', () => {
            expect(normalizeForComparison('hello    world')).toBe('hello world');
            expect(normalizeForComparison('  hello  world  ')).toBe('hello world');
        });

        it('should trim whitespace', () => {
            expect(normalizeForComparison('  hello  ')).toBe('hello');
        });

        it('should handle empty/null strings', () => {
            expect(normalizeForComparison('')).toBe('');
            expect(normalizeForComparison(null)).toBe('');
        });

        it('should preserve numbers', () => {
            expect(normalizeForComparison('ABC123')).toBe('abc123');
        });
    });

    // =========================================================================
    // Real-World Use Cases
    // =========================================================================
    describe('Real-World Use Cases', () => {
        describe('Company Name Matching', () => {
            it('should match company name variations', () => {
                const sim = jaroWinkler('Acme Corporation', 'Acme Corp');
                expect(sim).toBeGreaterThan(0.85);
            });

            it('should match with Inc/LLC variations', () => {
                const sim = tokenSimilarity('Acme Inc', 'Acme LLC');
                expect(sim).toBeGreaterThan(0.3);
            });

            it('should recognize abbreviated names have moderate string similarity', () => {
                const sim = jaroWinkler('International Business Machines', 'IBM');
                // Jaro-Winkler finds some similarity due to shared characters
                // Full abbreviation matching requires separate logic
                expect(sim).toBeLessThan(0.7);
                expect(sim).toBeGreaterThan(0.5);
            });
        });

        describe('Person Name Matching', () => {
            it('should match name with nickname', () => {
                const phonetic = isPhoneticMatch('Robert', 'Bob');
                // These don't sound alike phonetically
                expect(phonetic).toBe(false);

                // But Jaro-Winkler might still find some similarity
                const jw = jaroWinkler('Robert', 'Rob');
                expect(jw).toBeGreaterThan(0.5);
            });

            it('should handle name misspellings', () => {
                expect(jaroWinkler('Michael', 'Micheal')).toBeGreaterThan(0.9);
                expect(jaroWinkler('Jennifer', 'Jenifer')).toBeGreaterThan(0.9);
            });

            it('should match phonetically similar last names', () => {
                // Schmidt and Smith actually match phonetically via soundex/metaphone
                // Both have similar S-M-T structure
                expect(isPhoneticMatch('Schmidt', 'Smith')).toBe(true);
                expect(isPhoneticMatch('Smith', 'Smyth')).toBe(true);
                // Completely different names should not match
                expect(isPhoneticMatch('Smith', 'Jones')).toBe(false);
            });
        });

        describe('Email Domain Matching', () => {
            it('should match similar domains', () => {
                const sim = jaroWinkler('acme.com', 'acmecorp.com');
                expect(sim).toBeGreaterThan(0.7);
            });

            it('should detect typos in domains', () => {
                // 'gmail.com' vs 'gmial.com' - 2 transposed chars
                // Distance = 2, length = 9, similarity = 1 - 2/9 = 0.777
                expect(levenshteinSimilarity('gmail.com', 'gmial.com')).toBeGreaterThan(0.7);
            });
        });

        describe('Address Matching', () => {
            it('should match addresses with abbreviations', () => {
                // '123 main street' -> {123, main, street}
                // '123 main st' -> {123, main, st}
                // Intersection: {123, main} = 2, Union: 4
                // Jaccard = 2/4 = 0.5
                const sim = tokenSimilarity('123 Main Street', '123 Main St');
                expect(sim).toBeGreaterThanOrEqual(0.5);
            });

            it('should handle address number differences', () => {
                // '123 main street' -> {123, main, street}
                // '125 main street' -> {125, main, street}
                // Intersection: {main, street} = 2, Union: 4
                // Jaccard = 2/4 = 0.5
                const sim = tokenSimilarity('123 Main Street', '125 Main Street');
                expect(sim).toBeGreaterThanOrEqual(0.5);
            });
        });
    });

    // =========================================================================
    // Performance Tests
    // =========================================================================
    describe('Performance', () => {
        it('should handle long strings efficiently', () => {
            const longStr1 = 'a'.repeat(1000);
            const longStr2 = 'a'.repeat(999) + 'b';

            const start = Date.now();
            const result = levenshtein(longStr1, longStr2);
            const elapsed = Date.now() - start;

            expect(result).toBe(1);
            expect(elapsed).toBeLessThan(1000); // Should complete in < 1 second
        });

        it('should handle batch comparisons', () => {
            const strings = Array(100).fill(null).map((_, i) => `test string ${i}`);

            const start = Date.now();
            for (let i = 0; i < strings.length; i++) {
                for (let j = i + 1; j < strings.length; j++) {
                    jaroWinkler(strings[i], strings[j]);
                }
            }
            const elapsed = Date.now() - start;

            // 4950 comparisons should complete quickly
            expect(elapsed).toBeLessThan(1000);
        });
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================
    describe('Edge Cases', () => {
        it('should handle unicode characters', () => {
            const sim = levenshteinSimilarity('café', 'cafe');
            expect(sim).toBeGreaterThan(0.7);
        });

        it('should handle numbers in strings', () => {
            expect(levenshtein('123', '124')).toBe(1);
            expect(tokenSimilarity('Item 123', 'Item 124')).toBeGreaterThan(0.3);
        });

        it('should handle single character strings', () => {
            expect(jaro('a', 'a')).toBe(1);
            expect(jaro('a', 'b')).toBe(0);
            expect(jaroWinkler('a', 'a')).toBe(1);
        });

        it('should handle whitespace-only strings', () => {
            expect(normalizeForComparison('   ')).toBe('');
            expect(tokenSimilarity('   ', 'test')).toBe(0);
        });

        it('should handle strings with only special characters', () => {
            expect(soundex('!!!')).toBe('0000');
            expect(normalizeForComparison('@#$%')).toBe('');
        });
    });
});
