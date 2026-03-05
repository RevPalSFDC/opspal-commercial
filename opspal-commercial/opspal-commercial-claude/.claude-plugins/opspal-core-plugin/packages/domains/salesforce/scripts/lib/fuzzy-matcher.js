#!/usr/bin/env node

/**
 * Fuzzy Matcher Library
 * Instance-agnostic intelligent string matching with geographic validation
 *
 * Features:
 * - Levenshtein distance calculation
 * - State/region validation
 * - Abbreviation expansion
 * - Confidence scoring with reasons
 * - Canadian province support
 *
 * Usage:
 *   const { FuzzyMatcher } = require('./scripts/lib/fuzzy-matcher');
 *   const matcher = new FuzzyMatcher();
 *   const matches = matcher.match('San Diego SD', targets, { region: 'Southwest' });
 */

class FuzzyMatcher {
    constructor(options = {}) {
        this.options = options;

        // US State Code Mapping
        this.STATE_CODES = {
            'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
            'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
            'Florida': 'FL', 'Georgia': 'GA', 'Idaho': 'ID', 'Illinois': 'IL',
            'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY',
            'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA',
            'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
            'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
            'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
            'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
            'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
            'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX',
            'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
            'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
            'District of Columbia': 'DC'
        };

        // Canadian Province Mapping
        this.CANADA_PROVINCES = {
            'Ontario': 'ON', 'Quebec': 'QC', 'British Columbia': 'BC',
            'Alberta': 'AB', 'Saskatchewan': 'SK', 'Manitoba': 'MB',
            'Nova Scotia': 'NS', 'New Brunswick': 'NB',
            'Prince Edward Island': 'PE', 'Newfoundland and Labrador': 'NL'
        };

        // Region to State Mapping
        this.REGION_STATES = {
            'Northwest': ['WA', 'OR', 'CA', 'ID', 'MT', 'WY', 'AK'],
            'Southwest': ['CA', 'AZ', 'NV', 'UT', 'CO', 'NM'],
            'South Central': ['TX', 'NM', 'OK', 'LA', 'AR', 'KS', 'MS', 'AL'],
            'Southeast': ['FL', 'GA', 'AL', 'MS', 'TN', 'SC', 'NC', 'KY', 'WV', 'VA'],
            'NE; MW; NCR': [
                'NY', 'NJ', 'PA', 'CT', 'MA', 'RI', 'VT', 'NH', 'ME', // Northeast
                'IL', 'IN', 'OH', 'MI', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', // Midwest
                'DC', 'VA', 'MD', 'DE' // National Capital Region
            ]
        };

        // Common Abbreviation Expansions
        this.ABBREVIATIONS = {
            // Law Enforcement
            'PD': 'Police Department',
            'Police Dept': 'Police Department',
            'Police Dept.': 'Police Department',

            // Sheriff Variations
            'SO': 'Sheriff Office',
            'SD': 'Sheriff Department',
            'Sheriff\'s Office': 'Sheriff Office',
            'Sheriff\'s Dept': 'Sheriff Office',
            'Sheriff\'s Department': 'Sheriff Department',
            'Sheriffs Office': 'Sheriff Office',
            'Sheriffs Dept': 'Sheriff Office',
            'Sheriffs Department': 'Sheriff Department',
            'County SO': 'Sheriff Office',

            // District Attorney
            'DA': 'District Attorney',
            'District Attorney\'s Office': 'District Attorney',
            'DA\'s Office': 'District Attorney',

            // State Agencies
            'AGO': 'Attorney General Office',
            'Attorney General\'s Office': 'Attorney General Office',

            // Department Variations
            'Department': 'Dept',
            'Dept.': 'Dept',

            // Misc
            'County': 'County'
        };
    }

    /**
     * Extract state code from account name (e.g., "NY: Agency Name" → "NY")
     */
    extractStateFromName(name) {
        const match = name.match(/^([A-Z]{2}):/);
        return match ? match[1] : null;
    }

    /**
     * Get state code from full state name or existing code
     */
    getStateCode(stateName) {
        if (!stateName) return null;

        // Check if it's already a 2-letter code
        if (stateName.length === 2 && stateName === stateName.toUpperCase()) {
            return stateName;
        }

        // Look up in US states
        if (this.STATE_CODES[stateName]) {
            return this.STATE_CODES[stateName];
        }

        // Look up in Canadian provinces
        if (this.CANADA_PROVINCES[stateName]) {
            return this.CANADA_PROVINCES[stateName];
        }

        return null;
    }

    /**
     * Normalize agency name for matching
     */
    normalizeAgencyName(name) {
        let normalized = name;

        // Remove state prefix if exists
        normalized = normalized.replace(/^[A-Z]{2}:\s*/, '');

        // Apply abbreviation expansions
        Object.entries(this.ABBREVIATIONS).forEach(([abbrev, expansion]) => {
            const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            normalized = normalized.replace(regex, expansion);
        });

        // Normalize whitespace
        normalized = normalized.replace(/\s+/g, ' ');

        // Remove apostrophes
        normalized = normalized.replace(/'/g, '');

        return normalized.trim().toLowerCase();
    }

    /**
     * Calculate Levenshtein distance similarity (0-100%)
     */
    calculateSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }

        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return maxLen === 0 ? 100 : ((1 - distance / maxLen) * 100);
    }

    /**
     * Validate state matches region
     */
    validateStateRegion(state, region, expectedStates = []) {
        if (!state) return 'UNKNOWN';

        const regionStates = this.REGION_STATES[region] || expectedStates;

        if (regionStates.includes(state)) {
            return 'REGION_MATCH';
        }

        return 'MISMATCH';
    }

    /**
     * Match source string against multiple targets
     *
     * @param {string} source - Source string to match
     * @param {Array} targets - Array of target objects with name/state properties
     * @param {Object} options - Matching options
     * @returns {Array} - Sorted array of matches with confidence scores
     */
    match(source, targets, options = {}) {
        const sourceState = this.extractStateFromName(source);
        const normalizedSource = this.normalizeAgencyName(source);
        const expectedStates = this.REGION_STATES[options.region] || options.expectedStates || [];

        const matches = [];

        targets.forEach(target => {
            const targetState = this.extractStateFromName(target.name) ||
                               this.getStateCode(target.state || target.billingState || target.shippingState);
            const normalizedTarget = this.normalizeAgencyName(target.name);

            // Calculate name similarity
            const similarity = this.calculateSimilarity(normalizedSource, normalizedTarget);

            // State validation
            let stateMatch = 'UNKNOWN';
            if (sourceState && targetState) {
                if (sourceState === targetState) {
                    stateMatch = 'EXACT';
                } else if (expectedStates.includes(targetState)) {
                    stateMatch = 'REGION_MATCH';
                } else {
                    stateMatch = 'MISMATCH';
                }
            } else if (!sourceState && targetState && expectedStates.includes(targetState)) {
                stateMatch = 'REGION_MATCH';
            }

            // Calculate confidence score
            const { confidence, matchType, reason } = this.calculateConfidence(similarity, stateMatch);

            if (confidence >= (options.minConfidence || 50)) {
                matches.push({
                    target: target.name,
                    targetId: target.id || target.Id,
                    targetState,
                    similarity: Math.round(similarity),
                    stateMatch,
                    confidence,
                    matchType,
                    reason
                });
            }
        });

        // Sort by confidence descending
        matches.sort((a, b) => b.confidence - a.confidence);

        return matches;
    }

    /**
     * Calculate confidence score based on similarity and state match
     */
    calculateConfidence(similarity, stateMatch) {
        let confidence = 0;
        let matchType = '';
        let reason = '';

        if (similarity === 100 && stateMatch === 'EXACT') {
            confidence = 100;
            matchType = 'EXACT';
            reason = 'Perfect name match with exact state match';
        } else if (similarity === 100 && stateMatch === 'REGION_MATCH') {
            confidence = 98;
            matchType = 'EXACT';
            reason = 'Perfect name match with region validation';
        } else if (similarity >= 95 && stateMatch === 'EXACT') {
            confidence = 95;
            matchType = 'HIGH';
            reason = 'Near-perfect match with exact state';
        } else if (similarity >= 95 && stateMatch === 'REGION_MATCH') {
            confidence = 93;
            matchType = 'HIGH';
            reason = 'Near-perfect match with region validation';
        } else if (similarity >= 85 && stateMatch === 'EXACT') {
            confidence = 90;
            matchType = 'HIGH';
            reason = 'Strong match with exact state';
        } else if (similarity >= 85 && stateMatch === 'REGION_MATCH') {
            confidence = 88;
            matchType = 'HIGH';
            reason = 'Strong match with region validation';
        } else if (similarity >= 75 && stateMatch === 'EXACT') {
            confidence = 80;
            matchType = 'MEDIUM';
            reason = 'Good match with exact state';
        } else if (similarity >= 75 && stateMatch === 'REGION_MATCH') {
            confidence = 78;
            matchType = 'MEDIUM';
            reason = 'Good match with region validation';
        } else if (similarity >= 70 && stateMatch === 'EXACT') {
            confidence = 70;
            matchType = 'LOW';
            reason = 'Acceptable match with exact state';
        } else if (similarity >= 70 && stateMatch === 'REGION_MATCH') {
            confidence = 68;
            matchType = 'LOW';
            reason = 'Acceptable match with region validation';
        } else if (similarity >= 60) {
            confidence = Math.floor(similarity * 0.6);
            matchType = 'LOW';
            reason = 'Weak match - manual review required';
        } else {
            confidence = 0;
            matchType = 'NONE';
            reason = 'No acceptable match found';
        }

        return { confidence, matchType, reason };
    }

    /**
     * Find best match from multiple targets
     */
    findBestMatch(source, targets, options = {}) {
        const matches = this.match(source, targets, options);
        return matches.length > 0 ? matches[0] : null;
    }

    /**
     * Batch match multiple sources against targets
     */
    batchMatch(sources, targets, options = {}) {
        return sources.map(source => ({
            source,
            matches: this.match(source, targets, options)
        }));
    }
}

// Export for CommonJS
module.exports = { FuzzyMatcher };

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: fuzzy-matcher.js <source> <target1> [target2] ...');
        console.log('\nExample:');
        console.log('  fuzzy-matcher.js "San Diego SD" "CA: San Diego County Sheriff\'s Department"');
        process.exit(1);
    }

    const matcher = new FuzzyMatcher();
    const source = args[0];
    const targets = args.slice(1).map((name, i) => ({ id: i, name }));

    const matches = matcher.match(source, targets);

    console.log(`\nMatching: "${source}"\n`);
    console.log('Results:');
    matches.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.target}`);
        console.log(`     Confidence: ${m.confidence}% (${m.matchType})`);
        console.log(`     Similarity: ${m.similarity}%`);
        console.log(`     State Match: ${m.stateMatch}`);
        console.log(`     Reason: ${m.reason}\n`);
    });
}
