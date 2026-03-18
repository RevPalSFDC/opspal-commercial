#!/usr/bin/env node

/**
 * Person Name Matcher
 *
 * Component-level name matching for person names (first name + last name).
 * Prevents false positives like "Jeffrey Sudlow" matching "Jeffrey Spotts"
 * by matching first and last names separately.
 *
 * This addresses the data-quality reflection:
 * "Initial NAME_REVIEW_THRESHOLD of 70% was too permissive, causing false positives
 * like 'Jeffrey Sudlow' matching 'Jeffrey Spotts'. Component-level matching
 * (first name AND last name) wasn't enforced."
 *
 * Usage:
 *   const { PersonNameMatcher } = require('./person-name-matcher');
 *   const matcher = new PersonNameMatcher();
 *   const result = matcher.match('Jeffrey Sudlow', 'Jeffrey Spotts');
 *   // result.isMatch: false (different last names)
 *
 *   const result2 = matcher.match('Jeff Sudlow', 'Jeffrey Sudlow');
 *   // result2.isMatch: true (first name is close, last name exact)
 */

// Default thresholds - tightened from previous 70% to prevent false positives
const DEFAULT_THRESHOLDS = {
    overall: 0.85,        // Overall name similarity threshold
    firstName: 0.80,      // First name must match at least 80%
    lastName: 0.85,       // Last name must match at least 85% (stricter)
    componentRequired: true // Both components must pass their thresholds
};

class PersonNameMatcher {
    constructor(options = {}) {
        this.thresholds = {
            ...DEFAULT_THRESHOLDS,
            ...options.thresholds
        };
        this.options = {
            normalizeCase: options.normalizeCase !== false,
            handleMiddleNames: options.handleMiddleNames !== false,
            allowNicknames: options.allowNicknames !== false,
            ...options
        };

        // Common nickname mappings
        this.NICKNAMES = {
            'jeffrey': ['jeff', 'geoff', 'geoffrey'],
            'william': ['will', 'bill', 'billy', 'willy', 'liam'],
            'robert': ['rob', 'bob', 'bobby', 'robbie'],
            'richard': ['rich', 'rick', 'dick', 'ricky'],
            'michael': ['mike', 'mikey', 'mick'],
            'james': ['jim', 'jimmy', 'jamie'],
            'thomas': ['tom', 'tommy'],
            'joseph': ['joe', 'joey'],
            'christopher': ['chris', 'topher'],
            'daniel': ['dan', 'danny'],
            'matthew': ['matt', 'matty'],
            'anthony': ['tony'],
            'steven': ['steve', 'stevie'],
            'edward': ['ed', 'eddie', 'ted', 'teddy'],
            'charles': ['charlie', 'chuck'],
            'elizabeth': ['liz', 'lizzy', 'beth', 'betty', 'eliza'],
            'jennifer': ['jen', 'jenny'],
            'catherine': ['cathy', 'kate', 'katie', 'cat'],
            'margaret': ['maggie', 'peggy', 'meg'],
            'patricia': ['pat', 'patty', 'tricia'],
            'susan': ['sue', 'susie'],
            'rebecca': ['becky', 'becca'],
            'jessica': ['jess', 'jessie'],
            'samantha': ['sam', 'sammy'],
            'alexandra': ['alex', 'lexi', 'alexa']
        };
    }

    /**
     * Calculate Levenshtein distance between two strings
     * @private
     */
    _levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return matrix[len1][len2];
    }

    /**
     * Calculate similarity score between two strings (0-1)
     * @private
     */
    _calculateSimilarity(str1, str2) {
        if (!str1 && !str2) return 1;
        if (!str1 || !str2) return 0;

        const s1 = this.options.normalizeCase ? str1.toLowerCase() : str1;
        const s2 = this.options.normalizeCase ? str2.toLowerCase() : str2;

        if (s1 === s2) return 1;

        const distance = this._levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);

        return maxLength === 0 ? 1 : (1 - distance / maxLength);
    }

    /**
     * Check if two first names are equivalent (including nicknames)
     * @private
     */
    _checkNicknameMatch(name1, name2) {
        const n1 = name1.toLowerCase();
        const n2 = name2.toLowerCase();

        if (n1 === n2) return true;

        // Check if one is a nickname of the other
        for (const [fullName, nicknames] of Object.entries(this.NICKNAMES)) {
            const allVariants = [fullName, ...nicknames];
            if (allVariants.includes(n1) && allVariants.includes(n2)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Parse a full name into components
     * @param {string} fullName - Full name to parse
     * @returns {Object} Parsed name components
     */
    parseName(fullName) {
        if (!fullName || typeof fullName !== 'string') {
            return { firstName: '', lastName: '', middleNames: [], original: fullName || '' };
        }

        const normalized = fullName.trim().replace(/\s+/g, ' ');
        const parts = normalized.split(' ').filter(Boolean);

        if (parts.length === 0) {
            return { firstName: '', lastName: '', middleNames: [], original: fullName };
        }

        if (parts.length === 1) {
            // Just one name - assume it's the first name
            return { firstName: parts[0], lastName: '', middleNames: [], original: fullName };
        }

        if (parts.length === 2) {
            // First and last name
            return { firstName: parts[0], lastName: parts[1], middleNames: [], original: fullName };
        }

        // Multiple parts - first is first name, last is last name, middle is everything else
        return {
            firstName: parts[0],
            lastName: parts[parts.length - 1],
            middleNames: parts.slice(1, -1),
            original: fullName
        };
    }

    /**
     * Match two person names using component-level matching
     *
     * @param {string} name1 - First full name
     * @param {string} name2 - Second full name
     * @param {Object} options - Override default thresholds
     * @returns {Object} Match result with detailed breakdown
     */
    match(name1, name2, options = {}) {
        const thresholds = { ...this.thresholds, ...options.thresholds };

        // Parse both names
        const parsed1 = this.parseName(name1);
        const parsed2 = this.parseName(name2);

        // Calculate component-level similarities
        const firstNameSimilarity = this._calculateSimilarity(parsed1.firstName, parsed2.firstName);
        const lastNameSimilarity = this._calculateSimilarity(parsed1.lastName, parsed2.lastName);

        // Check for nickname matches (boosts first name score)
        const nicknameMatch = this.options.allowNicknames &&
            this._checkNicknameMatch(parsed1.firstName, parsed2.firstName);

        // Adjust first name similarity if nickname match
        const adjustedFirstNameSimilarity = nicknameMatch ?
            Math.max(firstNameSimilarity, 0.95) : firstNameSimilarity;

        // Calculate overall similarity (weighted average)
        const overallSimilarity = (adjustedFirstNameSimilarity * 0.4) + (lastNameSimilarity * 0.6);

        // Determine if this is a match
        const firstNamePasses = adjustedFirstNameSimilarity >= thresholds.firstName;
        const lastNamePasses = lastNameSimilarity >= thresholds.lastName;
        const overallPasses = overallSimilarity >= thresholds.overall;

        let isMatch = false;
        let matchReason = '';

        if (thresholds.componentRequired) {
            // Both components must pass their thresholds
            isMatch = firstNamePasses && lastNamePasses && overallPasses;
            if (!isMatch) {
                if (!firstNamePasses && !lastNamePasses) {
                    matchReason = `Both first name (${(adjustedFirstNameSimilarity * 100).toFixed(0)}% < ${thresholds.firstName * 100}%) and last name (${(lastNameSimilarity * 100).toFixed(0)}% < ${thresholds.lastName * 100}%) below threshold`;
                } else if (!firstNamePasses) {
                    matchReason = `First name below threshold: ${(adjustedFirstNameSimilarity * 100).toFixed(0)}% < ${thresholds.firstName * 100}%`;
                } else if (!lastNamePasses) {
                    matchReason = `Last name below threshold: ${(lastNameSimilarity * 100).toFixed(0)}% < ${thresholds.lastName * 100}%`;
                } else {
                    matchReason = `Overall below threshold: ${(overallSimilarity * 100).toFixed(0)}% < ${thresholds.overall * 100}%`;
                }
            } else {
                matchReason = nicknameMatch ?
                    `Nickname match with high last name similarity` :
                    `Both components pass threshold`;
            }
        } else {
            // Only overall threshold required
            isMatch = overallPasses;
            matchReason = isMatch ?
                `Overall similarity passes threshold` :
                `Overall below threshold: ${(overallSimilarity * 100).toFixed(0)}% < ${thresholds.overall * 100}%`;
        }

        return {
            isMatch,
            confidence: Math.round(overallSimilarity * 100),
            matchReason,
            breakdown: {
                firstName: {
                    name1: parsed1.firstName,
                    name2: parsed2.firstName,
                    similarity: Math.round(firstNameSimilarity * 100),
                    adjustedSimilarity: Math.round(adjustedFirstNameSimilarity * 100),
                    nicknameMatch,
                    passes: firstNamePasses
                },
                lastName: {
                    name1: parsed1.lastName,
                    name2: parsed2.lastName,
                    similarity: Math.round(lastNameSimilarity * 100),
                    passes: lastNamePasses
                },
                overall: {
                    similarity: Math.round(overallSimilarity * 100),
                    passes: overallPasses
                }
            },
            thresholdsUsed: thresholds
        };
    }

    /**
     * Find the best match from a list of candidates
     *
     * @param {string} searchName - Name to search for
     * @param {Array} candidates - Array of candidate names or objects with name property
     * @param {Object} options - Match options
     * @returns {Object|null} Best match or null if no match found
     */
    findBestMatch(searchName, candidates, options = {}) {
        const nameField = options.nameField || 'name';
        const minConfidence = options.minConfidence || (this.thresholds.overall * 100);

        const matches = candidates.map((candidate, index) => {
            const candidateName = typeof candidate === 'string' ? candidate : candidate[nameField];
            const result = this.match(searchName, candidateName, options);
            return {
                ...result,
                candidate,
                candidateName,
                index
            };
        });

        // Filter by match criteria and minimum confidence
        const validMatches = matches.filter(m => m.isMatch && m.confidence >= minConfidence);

        // Sort by confidence descending
        validMatches.sort((a, b) => b.confidence - a.confidence);

        return validMatches.length > 0 ? validMatches[0] : null;
    }

    /**
     * Batch match multiple names against candidates
     *
     * @param {Array} searchNames - Names to search for
     * @param {Array} candidates - Candidate names
     * @param {Object} options - Match options
     * @returns {Array} Array of match results
     */
    batchMatch(searchNames, candidates, options = {}) {
        return searchNames.map(name => ({
            searchName: name,
            bestMatch: this.findBestMatch(name, candidates, options)
        }));
    }
}

// Export
module.exports = { PersonNameMatcher, DEFAULT_THRESHOLDS };

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Person Name Matcher - Component-Level Matching

Usage:
  node person-name-matcher.js <name1> <name2>
  node person-name-matcher.js "Jeffrey Sudlow" "Jeffrey Spotts"

Options:
  --threshold <value>    Overall threshold (default: 0.85)
  --no-nicknames         Disable nickname matching
  --verbose              Show detailed breakdown

Examples:
  # Test the false positive case (should NOT match)
  node person-name-matcher.js "Jeffrey Sudlow" "Jeffrey Spotts"

  # Test a valid match (should match)
  node person-name-matcher.js "Jeff Sudlow" "Jeffrey Sudlow"

  # Test with custom threshold
  node person-name-matcher.js "John Smith" "John Smyth" --threshold 0.90
`);
        process.exit(1);
    }

    const name1 = args[0];
    const name2 = args[1];

    // Parse options
    const options = {};
    let verbose = false;

    for (let i = 2; i < args.length; i++) {
        if (args[i] === '--threshold' && args[i + 1]) {
            options.thresholds = { overall: parseFloat(args[i + 1]) };
            i++;
        } else if (args[i] === '--no-nicknames') {
            options.allowNicknames = false;
        } else if (args[i] === '--verbose') {
            verbose = true;
        }
    }

    const matcher = new PersonNameMatcher(options);
    const result = matcher.match(name1, name2);

    console.log(`\nMatching: "${name1}" vs "${name2}"\n`);
    console.log(`Result: ${result.isMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
    console.log(`Confidence: ${result.confidence}%`);
    console.log(`Reason: ${result.matchReason}\n`);

    if (verbose || !result.isMatch) {
        console.log('Breakdown:');
        console.log(`  First Name: "${result.breakdown.firstName.name1}" vs "${result.breakdown.firstName.name2}"`);
        console.log(`    Similarity: ${result.breakdown.firstName.similarity}%${result.breakdown.firstName.nicknameMatch ? ' (nickname match)' : ''}`);
        console.log(`    Passes threshold: ${result.breakdown.firstName.passes ? '✅' : '❌'}`);
        console.log(`  Last Name: "${result.breakdown.lastName.name1}" vs "${result.breakdown.lastName.name2}"`);
        console.log(`    Similarity: ${result.breakdown.lastName.similarity}%`);
        console.log(`    Passes threshold: ${result.breakdown.lastName.passes ? '✅' : '❌'}`);
        console.log(`  Overall: ${result.breakdown.overall.similarity}%`);
        console.log(`    Passes threshold: ${result.breakdown.overall.passes ? '✅' : '❌'}\n`);
    }
}
