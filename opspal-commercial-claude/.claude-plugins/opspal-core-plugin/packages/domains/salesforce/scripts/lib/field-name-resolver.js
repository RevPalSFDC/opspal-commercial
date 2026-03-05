/**
 * Field Name Resolver
 *
 * Advanced field name resolution with multiple strategies:
 * 1. Exact matching (label, token)
 * 2. Pattern matching (OWNER_FULL_NAME → OWNER_NAME)
 * 3. Fuzzy matching (Levenshtein distance)
 * 4. Semantic matching (Owner → OWNER_NAME)
 * 5. Context-aware matching (considers data type, section)
 *
 * Designed for 95%+ resolution rate across different Salesforce orgs.
 */

class FieldNameResolver {
    constructor(options = {}) {
        this.options = {
            fuzzyThreshold: options.fuzzyThreshold || 0.75, // Minimum similarity score
            maxSuggestions: options.maxSuggestions || 5,
            enableSemanticMatching: options.enableSemanticMatching !== false,
            enableFuzzyMatching: options.enableFuzzyMatching !== false,
            ...options
        };

        // Semantic mappings for common field names
        this.semanticMappings = {
            // Owner variations
            'owner': ['OWNER_NAME', 'OWNER.FULL_NAME', 'FULL_NAME', 'CREATED_BY', 'CUST_OWNER_NAME'],
            'owner name': ['OWNER_NAME', 'OWNER.FULL_NAME'],
            'owner full name': ['OWNER.FULL_NAME', 'OWNER_NAME', 'FULL_NAME'],

            // Account variations
            'account': ['ACCOUNT_NAME', 'ACCOUNT.NAME', 'CUST_ACCOUNT_NAME'],
            'account name': ['ACCOUNT_NAME', 'ACCOUNT.NAME'],

            // Amount variations
            'amount': ['AMOUNT', 'OPP_AMOUNT', 'TOTAL_AMOUNT'],
            'total amount': ['AMOUNT', 'TOTAL_AMOUNT'],

            // Date variations
            'close date': ['CLOSE_DATE', 'CLOSEDATE', 'CLOSED_DATE'],
            'created date': ['CREATED_DATE', 'CREATEDDATE', 'CUST_CREATED_DATE'],
            'modified date': ['LAST_MODIFIED_DATE', 'LASTMODIFIEDDATE', 'CUST_LAST_UPDATE'],

            // Stage variations
            'stage': ['STAGE_NAME', 'OPP_STAGE_NAME', 'STATUS'],
            'stage name': ['STAGE_NAME', 'OPP_STAGE_NAME'],

            // Name variations
            'name': ['NAME', 'FULL_NAME', 'OPPORTUNITY_NAME', 'ACCOUNT_NAME', 'CUST_NAME'],
            'opportunity name': ['OPPORTUNITY_NAME', 'OPP_NAME', 'NAME'],

            // Probability
            'probability': ['PROBABILITY', 'OPP_PROBABILITY'],

            // Type
            'type': ['TYPE', 'OPP_TYPE', 'ACCOUNT_TYPE'],

            // Status
            'status': ['STATUS', 'TASK_STATUS', 'CASE_STATUS']
        };

        // Field type patterns
        this.typePatterns = {
            date: ['date', 'created', 'modified', 'closed', 'due', 'last', 'first'],
            number: ['amount', 'count', 'total', 'revenue', 'quantity', 'probability'],
            boolean: ['is', 'has', 'can', 'active', 'deleted', 'closed'],
            lookup: ['account', 'contact', 'owner', 'user', 'who', 'what']
        };
    }

    /**
     * Main resolution method - tries all strategies
     */
    async resolveField(templateField, availableFields, options = {}) {
        const context = options.context || {};

        // Strategy 1: Exact matches
        let result = this.exactMatch(templateField, availableFields);
        if (result) {
            return { ...result, method: 'exact-match' };
        }

        // Strategy 2: Case-insensitive matches
        result = this.caseInsensitiveMatch(templateField, availableFields);
        if (result) {
            return { ...result, method: 'case-insensitive-match' };
        }

        // Strategy 3: Pattern matching
        result = this.patternMatch(templateField, availableFields);
        if (result) {
            return { ...result, method: 'pattern-match' };
        }

        // Strategy 4: Semantic matching
        if (this.options.enableSemanticMatching) {
            result = this.semanticMatch(templateField, availableFields, context);
            if (result) {
                return { ...result, method: 'semantic-match' };
            }
        }

        // Strategy 5: Fuzzy matching
        if (this.options.enableFuzzyMatching) {
            result = this.fuzzyMatch(templateField, availableFields);
            if (result) {
                return { ...result, method: 'fuzzy-match' };
            }
        }

        // Failed to resolve - return suggestions
        const suggestions = this.getSuggestions(templateField, availableFields);
        return {
            resolved: false,
            field: null,
            suggestions,
            method: 'no-match'
        };
    }

    /**
     * Strategy 1: Exact match on token or label
     */
    exactMatch(templateField, availableFields) {
        const field = availableFields.find(f =>
            f.token === templateField || f.label === templateField
        );

        if (field) {
            return {
                resolved: true,
                field,
                confidence: 1.0
            };
        }

        return null;
    }

    /**
     * Strategy 2: Case-insensitive match
     */
    caseInsensitiveMatch(templateField, availableFields) {
        const templateLower = templateField.toLowerCase();
        const field = availableFields.find(f =>
            f.token?.toLowerCase() === templateLower ||
            f.label?.toLowerCase() === templateLower
        );

        if (field) {
            return {
                resolved: true,
                field,
                confidence: 0.95
            };
        }

        return null;
    }

    /**
     * Strategy 3: Pattern matching (handle common variations)
     */
    patternMatch(templateField, availableFields) {
        const patterns = this.generatePatterns(templateField);

        for (const pattern of patterns) {
            const field = availableFields.find(f =>
                f.token === pattern ||
                f.token?.includes(pattern) ||
                pattern.includes(f.token)
            );

            if (field) {
                return {
                    resolved: true,
                    field,
                    confidence: 0.9,
                    matchedPattern: pattern
                };
            }
        }

        return null;
    }

    /**
     * Strategy 4: Semantic matching (understand intent)
     */
    semanticMatch(templateField, availableFields, context) {
        const templateLower = templateField.toLowerCase();

        // Check semantic mappings
        const semanticPatterns = this.semanticMappings[templateLower] || [];

        for (const semanticPattern of semanticPatterns) {
            const field = availableFields.find(f =>
                f.token === semanticPattern ||
                f.token?.includes(semanticPattern)
            );

            if (field) {
                return {
                    resolved: true,
                    field,
                    confidence: 0.85,
                    semanticPattern
                };
            }
        }

        // Contextual semantic matching (based on data type)
        if (context.expectedType) {
            const typeFields = availableFields.filter(f =>
                this.matchesDataType(f, context.expectedType)
            );

            // Try fuzzy match within type-filtered fields
            for (const field of typeFields) {
                if (this.calculateSimilarity(templateField, field.token) > 0.7 ||
                    this.calculateSimilarity(templateField, field.label) > 0.7) {
                    return {
                        resolved: true,
                        field,
                        confidence: 0.8,
                        contextMatch: true
                    };
                }
            }
        }

        return null;
    }

    /**
     * Strategy 5: Fuzzy matching with Levenshtein distance
     */
    fuzzyMatch(templateField, availableFields) {
        const scored = availableFields.map(field => {
            const tokenSimilarity = this.calculateSimilarity(templateField, field.token);
            const labelSimilarity = this.calculateSimilarity(templateField, field.label);
            const maxSimilarity = Math.max(tokenSimilarity, labelSimilarity);

            return {
                field,
                similarity: maxSimilarity,
                tokenSimilarity,
                labelSimilarity
            };
        });

        // Find best match above threshold
        const best = scored
            .filter(s => s.similarity >= this.options.fuzzyThreshold)
            .sort((a, b) => b.similarity - a.similarity)[0];

        if (best) {
            return {
                resolved: true,
                field: best.field,
                confidence: best.similarity,
                similarity: {
                    token: best.tokenSimilarity,
                    label: best.labelSimilarity
                }
            };
        }

        return null;
    }

    /**
     * Generate field pattern variations
     */
    generatePatterns(fieldName) {
        const patterns = new Set([fieldName]);

        // Handle underscore variations
        if (fieldName.includes('_')) {
            const parts = fieldName.split('_');

            // Remove last part: OWNER_FULL_NAME → OWNER_NAME
            if (parts.length > 1) {
                patterns.add(parts.slice(0, -1).join('_'));
            }

            // Take last two parts: OWNER_FULL_NAME → FULL_NAME
            if (parts.length > 2) {
                patterns.add(parts.slice(-2).join('_'));
            }

            // First part only: OWNER_FULL_NAME → OWNER
            patterns.add(parts[0]);

            // All parts without underscores: OWNER_FULL_NAME → OWNERFULLNAME
            patterns.add(parts.join(''));
        }

        // Handle dot notation
        if (fieldName.includes('.')) {
            const parts = fieldName.split('.');
            patterns.add(parts[0]); // Before dot
            patterns.add(parts.slice(-1)[0]); // After dot
            patterns.add(parts.join('_')); // Replace dot with underscore
        }

        // Common suffix removals
        const suffixes = ['_FULL_NAME', '_NAME', '_ID', '_DATE', '_TIME', '_DATETIME'];
        suffixes.forEach(suffix => {
            if (fieldName.endsWith(suffix)) {
                patterns.add(fieldName.replace(suffix, ''));
            }
        });

        // Common prefix removals
        const prefixes = ['CUST_', 'OPP_', 'ACC_'];
        prefixes.forEach(prefix => {
            if (fieldName.startsWith(prefix)) {
                patterns.add(fieldName.replace(prefix, ''));
            }
        });

        return Array.from(patterns);
    }

    /**
     * Calculate similarity between two strings (Levenshtein distance)
     */
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;

        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();

        if (s1 === s2) return 1.0;

        const len1 = s1.length;
        const len2 = s2.length;

        // Create matrix
        const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

        // Initialize first column and row
        for (let i = 0; i <= len1; i++) matrix[0][i] = i;
        for (let j = 0; j <= len2; j++) matrix[j][0] = j;

        // Fill matrix
        for (let j = 1; j <= len2; j++) {
            for (let i = 1; i <= len1; i++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1, // Deletion
                    matrix[j - 1][i] + 1, // Insertion
                    matrix[j - 1][i - 1] + cost // Substitution
                );
            }
        }

        const distance = matrix[len2][len1];
        const maxLength = Math.max(len1, len2);

        // Convert distance to similarity (0-1)
        return 1 - (distance / maxLength);
    }

    /**
     * Check if field matches expected data type
     */
    matchesDataType(field, expectedType) {
        if (!expectedType || !field.dataType) return false;

        // Direct type match
        if (field.dataType === expectedType) return true;

        // Pattern-based type inference
        const fieldLower = (field.token + ' ' + field.label).toLowerCase();
        const patterns = this.typePatterns[expectedType] || [];

        return patterns.some(pattern => fieldLower.includes(pattern));
    }

    /**
     * Get suggestions when no match found
     */
    getSuggestions(templateField, availableFields) {
        const scored = availableFields.map(field => {
            let score = 0;

            const templateLower = templateField.toLowerCase();
            const tokenLower = field.token?.toLowerCase() || '';
            const labelLower = field.label?.toLowerCase() || '';

            // Substring matches
            if (tokenLower.includes(templateLower)) score += 10;
            if (labelLower.includes(templateLower)) score += 8;
            if (templateLower.includes(tokenLower)) score += 6;
            if (templateLower.includes(labelLower)) score += 5;

            // Word overlap
            const templateWords = templateLower.split(/[_\s.]+/);
            const tokenWords = tokenLower.split(/[_\s.]+/);
            const labelWords = labelLower.split(/[_\s.]+/);

            templateWords.forEach(word => {
                if (word.length < 3) return; // Skip short words
                if (tokenWords.includes(word)) score += 5;
                if (labelWords.includes(word)) score += 3;
            });

            // Levenshtein similarity
            const tokenSimilarity = this.calculateSimilarity(templateField, field.token);
            const labelSimilarity = this.calculateSimilarity(templateField, field.label);
            score += Math.max(tokenSimilarity, labelSimilarity) * 20;

            return { field, score };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, this.options.maxSuggestions)
            .map(s => ({
                token: s.field.token,
                label: s.field.label,
                dataType: s.field.dataType,
                score: Math.round(s.score),
                confidence: Math.min(s.score / 20, 1.0).toFixed(2)
            }));
    }

    /**
     * Batch resolve multiple fields
     */
    async resolveFields(templateFields, availableFields, options = {}) {
        const results = [];

        for (const templateField of templateFields) {
            const result = await this.resolveField(templateField, availableFields, options);
            results.push({
                templateField,
                ...result
            });
        }

        return results;
    }

    /**
     * Get resolution statistics
     */
    getStats(results) {
        const total = results.length;
        const resolved = results.filter(r => r.resolved).length;
        const byMethod = {};

        results.forEach(r => {
            if (r.method) {
                byMethod[r.method] = (byMethod[r.method] || 0) + 1;
            }
        });

        return {
            total,
            resolved,
            failed: total - resolved,
            rate: `${((resolved / total) * 100).toFixed(1)}%`,
            byMethod,
            averageConfidence: results
                .filter(r => r.resolved)
                .reduce((sum, r) => sum + (r.confidence || 0), 0) / resolved || 0
        };
    }
}

module.exports = FieldNameResolver;

// CLI usage
if (require.main === module) {
    // Example usage
    const resolver = new FieldNameResolver();

    const availableFields = [
        { token: 'OWNER_NAME', label: 'Owner Name', dataType: 'string' },
        { token: 'ACCOUNT_NAME', label: 'Account Name', dataType: 'string' },
        { token: 'AMOUNT', label: 'Amount', dataType: 'currency' },
        { token: 'CLOSE_DATE', label: 'Close Date', dataType: 'date' },
        { token: 'STAGE_NAME', label: 'Stage', dataType: 'picklist' }
    ];

    const templateFields = [
        'Owner',
        'OWNER_FULL_NAME',
        'Account',
        'Amount',
        'CloseDate',
        'Stage'
    ];

    console.log('Field Name Resolution Examples:\n');

    (async () => {
        const results = await resolver.resolveFields(templateFields, availableFields);

        results.forEach(result => {
            console.log(`Template: ${result.templateField}`);
            if (result.resolved) {
                console.log(`  ✅ Resolved: ${result.field.token} (${result.field.label})`);
                console.log(`     Method: ${result.method}, Confidence: ${(result.confidence * 100).toFixed(0)}%`);
            } else {
                console.log(`  ❌ Not resolved`);
                if (result.suggestions.length > 0) {
                    console.log(`     Suggestions:`);
                    result.suggestions.forEach(s => {
                        console.log(`       - ${s.token} (${s.label}) - ${(s.confidence * 100).toFixed(0)}%`);
                    });
                }
            }
            console.log('');
        });

        const stats = resolver.getStats(results);
        console.log('Resolution Statistics:');
        console.log(`  Total: ${stats.total}`);
        console.log(`  Resolved: ${stats.resolved} (${stats.rate})`);
        console.log(`  Failed: ${stats.failed}`);
        console.log(`  Methods used:`, stats.byMethod);
        console.log(`  Average confidence: ${(stats.averageConfidence * 100).toFixed(0)}%`);
    })();
}
