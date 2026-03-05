#!/usr/bin/env node

/**
 * Instance-Agnostic Fuzzy Account Matcher
 *
 * Multi-pass fuzzy matching strategy for matching external entity names to Salesforce records.
 * Learned from Peregrine renewals enrichment project (2025-10-02).
 *
 * Features:
 * - Multi-pass matching (exact → LIKE → keyword)
 * - Configurable abbreviations per org
 * - Confidence scoring
 * - Authoritative source validation
 * - Audit trail preservation
 * - Works with any Salesforce entity (Account, Contact, Lead, etc.)
 *
 * Usage:
 *   const matcher = new FuzzyAccountMatcher('myorg', { entityType: 'Account' });
 *   const results = await matcher.match(names);
 *   const validated = await matcher.validateAgainstSource(results, authoritativeData);
 */

const { execSync } = require('child_process');

class FuzzyAccountMatcher {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.entityType = options.entityType || 'Account';
        this.matchFields = options.matchFields || ['Name'];
        this.returnFields = options.returnFields || ['Id', 'Name', 'OwnerId'];
        this.abbreviations = options.abbreviations || this.getDefaultAbbreviations();
        this.statePatterns = options.statePatterns || /^([A-Z]{2,3}):\s*/;
        this.confidenceThreshold = options.confidenceThreshold || 0.7;
    }

    /**
     * Default abbreviation expansions
     * Override with org-specific abbreviations in options
     */
    getDefaultAbbreviations() {
        return {
            'PD': 'Police Department',
            'SO': 'Sheriff', // Partial match for Sheriff/Sheriffs/Sheriff's
            'FD': 'Fire Department',
            'DA': 'District Attorney',
            'AG': 'Attorney General',
            'DOT': 'Department of Transportation',
            'DOC': 'Department of Corrections',
            'DOE': 'Department of Education',
            'DHS': 'Department of Human Services'
        };
    }

    /**
     * Main matching function - executes multi-pass strategy
     */
    async match(entityNames) {
        console.log(`\n=== Starting Fuzzy Matching for ${entityNames.length} entities ===\n`);

        const results = {};
        const unmatched = new Set(entityNames);

        // Pass 1: Exact Match
        console.log('Pass 1: Exact Match...');
        const exactMatches = await this.exactMatch(Array.from(unmatched));
        this.mergeResults(results, exactMatches, unmatched, 'EXACT', 1.0);
        console.log(`  Found ${exactMatches.length} exact matches\n`);

        // Pass 2: LIKE Match with normalization
        if (unmatched.size > 0) {
            console.log('Pass 2: LIKE Match with normalization...');
            const likeMatches = await this.likeMatch(Array.from(unmatched));
            this.mergeResults(results, likeMatches, unmatched, 'LIKE', 0.85);
            console.log(`  Found ${likeMatches.length} LIKE matches\n`);
        }

        // Pass 3: Keyword Match with abbreviation expansion
        if (unmatched.size > 0) {
            console.log('Pass 3: Keyword Match with abbreviation expansion...');
            const keywordMatches = await this.keywordMatch(Array.from(unmatched));
            this.mergeResults(results, keywordMatches, unmatched, 'KEYWORD', 0.7);
            console.log(`  Found ${keywordMatches.length} keyword matches\n`);
        }

        // Summary
        const matchedCount = Object.keys(results).length;
        const matchRate = ((matchedCount / entityNames.length) * 100).toFixed(1);
        console.log(`\n=== Matching Summary ===`);
        console.log(`Total entities: ${entityNames.length}`);
        console.log(`Matched: ${matchedCount} (${matchRate}%)`);
        console.log(`Unmatched: ${unmatched.size}`);

        return {
            matched: results,
            unmatched: Array.from(unmatched),
            stats: {
                total: entityNames.length,
                matched: matchedCount,
                unmatched: unmatched.size,
                matchRate: parseFloat(matchRate)
            }
        };
    }

    /**
     * Pass 1: Exact Match
     */
    async exactMatch(names) {
        const matches = [];

        for (const name of names) {
            const escapedName = this.escapeSoql(name);
            const query = `SELECT ${this.returnFields.join(', ')} FROM ${this.entityType} WHERE Name = '${escapedName}'`;

            try {
                const result = this.executeSoql(query);
                if (result && result.length > 0) {
                    matches.push({
                        inputName: name,
                        salesforceName: result[0].Name,
                        recordId: result[0].Id,
                        ownerId: result[0].OwnerId,
                        additionalFields: this.extractAdditionalFields(result[0])
                    });
                }
            } catch (error) {
                // Skip errors, continue with other names
            }

            // Rate limiting
            if (matches.length % 10 === 0) {
                await this.sleep(2000);
            }
        }

        return matches;
    }

    /**
     * Pass 2: LIKE Match with normalization
     */
    async likeMatch(names) {
        const matches = [];

        for (const name of names) {
            const normalized = this.normalizeForLike(name);
            const escapedName = this.escapeSoql(normalized);

            // Extract state prefix for filtering if present
            const stateMatch = name.match(this.statePatterns);
            const stateFilter = stateMatch ? ` AND Name LIKE '${stateMatch[1]}%'` : '';

            const query = `SELECT ${this.returnFields.join(', ')} FROM ${this.entityType} WHERE Name LIKE '%${escapedName}%'${stateFilter} LIMIT 1`;

            try {
                const result = this.executeSoql(query);
                if (result && result.length > 0) {
                    matches.push({
                        inputName: name,
                        salesforceName: result[0].Name,
                        recordId: result[0].Id,
                        ownerId: result[0].OwnerId,
                        additionalFields: this.extractAdditionalFields(result[0])
                    });
                }
            } catch (error) {
                // Skip errors
            }

            // Rate limiting
            if (matches.length % 10 === 0) {
                await this.sleep(2000);
            }
        }

        return matches;
    }

    /**
     * Pass 3: Keyword Match with abbreviation expansion
     */
    async keywordMatch(names) {
        const matches = [];

        for (const name of names) {
            const normalized = this.normalizeForKeyword(name);
            const keywords = this.extractKeywords(normalized);

            if (keywords.length === 0) continue;

            // Extract state prefix for filtering
            const stateMatch = name.match(this.statePatterns);
            const stateFilter = stateMatch ? ` AND Name LIKE '${stateMatch[1]}%'` : '';

            // Build WHERE clause with keyword conditions
            const keywordConditions = keywords.map(kw =>
                `Name LIKE '%${this.escapeSoql(kw)}%'`
            ).join(' AND ');

            const query = `SELECT ${this.returnFields.join(', ')} FROM ${this.entityType} WHERE ${keywordConditions}${stateFilter} LIMIT 1`;

            try {
                const result = this.executeSoql(query);
                if (result && result.length > 0) {
                    matches.push({
                        inputName: name,
                        salesforceName: result[0].Name,
                        recordId: result[0].Id,
                        ownerId: result[0].OwnerId,
                        additionalFields: this.extractAdditionalFields(result[0]),
                        keywords: keywords
                    });
                }
            } catch (error) {
                // Skip errors
            }

            // Rate limiting
            if (matches.length % 10 === 0) {
                await this.sleep(2000);
            }
        }

        return matches;
    }

    /**
     * Calculate data richness score for records
     * Returns % of fields populated across key identifying fields
     */
    calculateDataRichness(records, fields = ['Name', 'Website', 'Phone', 'BillingStreet', 'BillingCity', 'BillingState']) {
        if (!records || records.length === 0) {
            return {
                score: 0,
                fieldStats: {},
                totalRecords: 0
            };
        }

        const fieldStats = {};
        fields.forEach(field => {
            fieldStats[field] = {
                populated: 0,
                empty: 0,
                percentage: 0
            };
        });

        // Count populated fields
        records.forEach(record => {
            fields.forEach(field => {
                const value = record[field];
                if (value && value !== '' && value !== null) {
                    fieldStats[field].populated++;
                } else {
                    fieldStats[field].empty++;
                }
            });
        });

        // Calculate percentages
        fields.forEach(field => {
            const populated = fieldStats[field].populated;
            fieldStats[field].percentage = ((populated / records.length) * 100).toFixed(1);
        });

        // Overall score: average of all field percentages
        const totalPercentage = fields.reduce((sum, field) => sum + parseFloat(fieldStats[field].percentage), 0);
        const overallScore = (totalPercentage / fields.length).toFixed(1);

        return {
            score: parseFloat(overallScore),
            fieldStats,
            totalRecords: records.length,
            summary: this.generateRichnessSummary(fieldStats, overallScore)
        };
    }

    /**
     * Generate human-readable richness summary
     */
    generateRichnessSummary(fieldStats, overallScore) {
        const populated = Object.entries(fieldStats)
            .filter(([_, stats]) => parseFloat(stats.percentage) > 50)
            .map(([field, _]) => field);

        const empty = Object.entries(fieldStats)
            .filter(([_, stats]) => parseFloat(stats.percentage) === 0)
            .map(([field, _]) => field);

        let summary = `Overall data richness: ${overallScore}%\n`;

        if (populated.length > 0) {
            summary += `Well-populated fields: ${populated.join(', ')}\n`;
        }

        if (empty.length > 0) {
            summary += `Empty fields: ${empty.join(', ')}\n`;
        }

        // Quality assessment
        const score = parseFloat(overallScore);
        if (score >= 80) {
            summary += 'Assessment: HIGH quality - suitable for automated processing';
        } else if (score >= 50) {
            summary += 'Assessment: MEDIUM quality - manual review recommended';
        } else if (score >= 20) {
            summary += 'Assessment: LOW quality - requires data enrichment';
        } else {
            summary += 'Assessment: VERY LOW quality - likely placeholder/junk records';
        }

        return summary;
    }

    /**
     * Validate matches against authoritative source
     * Returns list of mismatches that need correction
     */
    async validateAgainstSource(matchResults, authoritativeData) {
        console.log('\n=== Validating Against Authoritative Source ===\n');

        const mismatches = [];
        const { matched } = matchResults;

        for (const [inputName, matchData] of Object.entries(matched)) {
            const authRecord = authoritativeData[inputName];

            if (!authRecord) continue;

            // Compare Record IDs
            if (authRecord.recordId && authRecord.recordId !== matchData.recordId) {
                mismatches.push({
                    inputName,
                    ourRecordId: matchData.recordId,
                    ourSalesforceName: matchData.salesforceName,
                    authRecordId: authRecord.recordId,
                    authSalesforceName: authRecord.salesforceName || 'Unknown',
                    matchType: matchData.matchType,
                    confidence: matchData.confidence
                });
            }
        }

        console.log(`Validated ${Object.keys(matched).length} matches`);
        console.log(`Found ${mismatches.length} mismatches (${((mismatches.length / Object.keys(matched).length) * 100).toFixed(1)}%)\n`);

        return mismatches;
    }

    /**
     * Apply corrections from authoritative source
     */
    async applyCorrections(matchResults, mismatches) {
        console.log('\n=== Applying Corrections ===\n');

        const { matched } = matchResults;
        let corrected = 0;

        for (const mismatch of mismatches) {
            // Query to get Owner ID from correct record
            const query = `SELECT ${this.returnFields.join(', ')} FROM ${this.entityType} WHERE Id = '${mismatch.authRecordId}'`;

            try {
                const result = this.executeSoql(query);
                if (result && result.length > 0) {
                    // Preserve original data
                    const original = matched[mismatch.inputName];

                    // Update with corrected data
                    matched[mismatch.inputName] = {
                        inputName: mismatch.inputName,
                        salesforceName: result[0].Name,
                        recordId: result[0].Id,
                        ownerId: result[0].OwnerId,
                        additionalFields: this.extractAdditionalFields(result[0]),
                        matchType: 'AUTHORITATIVE_CORRECTED',
                        confidence: 1.0,
                        previousRecordId: original.recordId,
                        previousMatchType: original.matchType,
                        previousConfidence: original.confidence
                    };

                    corrected++;
                    console.log(`${corrected}. Corrected: ${mismatch.inputName}`);
                    console.log(`   Old ID: ${mismatch.ourRecordId}`);
                    console.log(`   New ID: ${mismatch.authRecordId}\n`);
                }
            } catch (error) {
                console.log(`   ⚠ Failed to correct: ${error.message}\n`);
            }
        }

        console.log(`Successfully corrected ${corrected}/${mismatches.length} mismatches\n`);

        return matchResults;
    }

    /**
     * Apply mappings from authoritative source for unmatched records
     */
    async applyMappings(matchResults, mappings) {
        console.log('\n=== Applying Authoritative Mappings ===\n');

        const { matched, unmatched } = matchResults;
        const newMatches = [];

        for (const unmatchedName of unmatched) {
            const mapping = mappings[unmatchedName];

            if (!mapping) continue;

            // Query using the mapped Salesforce name
            const escapedName = this.escapeSoql(mapping.salesforceName);
            const query = `SELECT ${this.returnFields.join(', ')} FROM ${this.entityType} WHERE Name = '${escapedName}'`;

            try {
                const result = this.executeSoql(query);
                if (result && result.length > 0) {
                    matched[unmatchedName] = {
                        inputName: unmatchedName,
                        salesforceName: result[0].Name,
                        recordId: result[0].Id,
                        ownerId: result[0].OwnerId,
                        additionalFields: this.extractAdditionalFields(result[0]),
                        matchType: 'AUTHORITATIVE_MAPPING',
                        confidence: 1.0
                    };
                    newMatches.push(unmatchedName);
                }
            } catch (error) {
                console.log(`   ⚠ Mapping failed for ${unmatchedName}: ${error.message}\n`);
            }
        }

        // Remove newly matched from unmatched
        matchResults.unmatched = unmatched.filter(name => !newMatches.includes(name));
        matchResults.stats.matched += newMatches.length;
        matchResults.stats.unmatched -= newMatches.length;

        console.log(`Applied ${newMatches.length} authoritative mappings\n`);

        return matchResults;
    }

    // ========== Helper Methods ==========

    /**
     * Normalize for LIKE query
     */
    normalizeForLike(name) {
        return name
            .replace(this.statePatterns, '') // Remove state prefix
            .replace(/\s*-AWT.*$/i, '') // Remove notes
            .replace(/\s*\(.*?\).*$/,'') // Remove parentheticals
            .trim();
    }

    /**
     * Normalize for keyword matching
     */
    normalizeForKeyword(name) {
        let normalized = this.normalizeForLike(name);

        // Expand abbreviations
        for (const [abbr, expansion] of Object.entries(this.abbreviations)) {
            const regex = new RegExp(`\\b${abbr}\\b`, 'g');
            normalized = normalized.replace(regex, expansion);
        }

        // Remove apostrophes
        normalized = normalized.replace(/[']/g, '');

        return normalized;
    }

    /**
     * Extract significant keywords
     */
    extractKeywords(text) {
        const stopWords = ['the', 'of', 'and', 'for', 'department', 'office', 'county', 'city'];
        const words = text.split(/\s+/);

        const significant = words.filter(word =>
            word.length > 2 && !stopWords.includes(word.toLowerCase())
        );

        // Return top 3 keywords
        return significant.slice(0, 3);
    }

    /**
     * Merge results from a matching pass
     */
    mergeResults(results, matches, unmatched, matchType, confidence) {
        for (const match of matches) {
            results[match.inputName] = {
                ...match,
                matchType,
                confidence
            };
            unmatched.delete(match.inputName);
        }
    }

    /**
     * Extract additional fields from record
     */
    extractAdditionalFields(record) {
        const additional = {};
        for (const field of this.returnFields) {
            if (field !== 'Id' && field !== 'Name' && field !== 'OwnerId') {
                additional[field] = record[field];
            }
        }
        return additional;
    }

    /**
     * Execute SOQL query
     */
    executeSoql(query) {
        const result = execSync(`sf data query --query "${query}" --json --target-org ${this.orgAlias}`, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        });

        const parsed = JSON.parse(result);
        return parsed.result?.records || [];
    }

    /**
     * Escape SOQL special characters
     */
    escapeSoql(str) {
        return str.replace(/'/g, "\\'");
    }

    /**
     * Sleep for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use in other scripts
module.exports = { FuzzyAccountMatcher };

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node fuzzy-account-matcher.js <org-alias> <entity-type> [names...]

Examples:
  node fuzzy-account-matcher.js myorg Account "CA: Bakersfield PD" "FL: Miami PD"
  node fuzzy-account-matcher.js myorg Contact "John Doe" "Jane Smith"
`);
        process.exit(1);
    }

    const [orgAlias, entityType, ...names] = args;

    (async () => {
        const matcher = new FuzzyAccountMatcher(orgAlias, { entityType });
        const results = await matcher.match(names);

        console.log('\n=== Results ===\n');
        console.log(JSON.stringify(results, null, 2));
    })();
}
