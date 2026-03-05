#!/usr/bin/env node

/**
 * SOQL Contract Validator
 *
 * Specialized validator for Salesforce SOQL queries to prevent common errors:
 * - Aggregate queries without proper GROUP BY
 * - Relationship traversal issues in aggregate queries
 * - DeveloperName vs ApiName confusion
 * - Query depth and governor limit violations
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: tool-contract mismatch cohort (13 reflections)
 */

const fs = require('fs');
const path = require('path');

class SOQLContractValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.strictMode = options.strictMode !== false;

        // SOQL reserved words and patterns
        this.aggregateFunctions = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COUNT_DISTINCT'];
        this.relationshipDepthLimit = 5;
        this.maxFieldsPerQuery = 100;
        this.maxRecordsDefault = 50000;

        // Field naming conventions by object type
        this.fieldNamingRules = {
            CustomMetadata: {
                preferred: 'DeveloperName',
                forbidden: ['ApiName'],
                message: 'Use DeveloperName for Custom Metadata queries, not ApiName'
            },
            CustomSetting: {
                preferred: 'Name',
                forbidden: ['ApiName'],
                message: 'Use Name for Custom Setting queries'
            }
        };
    }

    /**
     * Validate a SOQL query
     * @param {string} query - SOQL query string
     * @param {Object} context - Additional context (objectType, expectedResults, etc.)
     * @returns {Object} Validation result
     */
    validate(query, context = {}) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            suggestions: [],
            queryAnalysis: {}
        };

        if (!query || typeof query !== 'string') {
            result.valid = false;
            result.errors.push('Query must be a non-empty string');
            return result;
        }

        const normalizedQuery = this._normalizeQuery(query);
        result.queryAnalysis = this._analyzeQuery(normalizedQuery);

        // Run all validations
        this._validateAggregateGroupBy(normalizedQuery, result);
        this._validateRelationshipDepth(normalizedQuery, result);
        this._validateFieldNaming(normalizedQuery, result, context);
        this._validateAggregateRelationship(normalizedQuery, result);
        this._validateQueryLimits(normalizedQuery, result);
        this._validateNullHandling(normalizedQuery, result);
        this._validateOrderByInAggregate(normalizedQuery, result);

        // Set overall validity
        result.valid = result.errors.length === 0;

        return result;
    }

    /**
     * Normalize query for analysis
     */
    _normalizeQuery(query) {
        return query
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    /**
     * Analyze query structure
     */
    _analyzeQuery(query) {
        const analysis = {
            hasAggregate: false,
            aggregateFunctions: [],
            hasGroupBy: false,
            groupByFields: [],
            selectFields: [],
            fromObject: null,
            relationships: [],
            hasWhere: false,
            hasOrderBy: false,
            hasLimit: false,
            limitValue: null,
            isSubquery: false
        };

        // Check for aggregate functions
        for (const func of this.aggregateFunctions) {
            const pattern = new RegExp(`${func}\\s*\\(`, 'i');
            if (pattern.test(query)) {
                analysis.hasAggregate = true;
                analysis.aggregateFunctions.push(func);
            }
        }

        // Extract GROUP BY fields
        const groupByMatch = query.match(/GROUP\s+BY\s+([^HAVING|ORDER|LIMIT]+)/i);
        if (groupByMatch) {
            analysis.hasGroupBy = true;
            analysis.groupByFields = groupByMatch[1]
                .split(',')
                .map(f => f.trim());
        }

        // Extract FROM object
        const fromMatch = query.match(/FROM\s+(\w+)/i);
        if (fromMatch) {
            analysis.fromObject = fromMatch[1];
        }

        // Extract SELECT fields
        const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
        if (selectMatch) {
            analysis.selectFields = selectMatch[1]
                .split(',')
                .map(f => f.trim())
                .filter(f => !this.aggregateFunctions.some(agg =>
                    f.toUpperCase().startsWith(agg + '(')
                ));
        }

        // Count relationship depth
        const relationshipPattern = /(\w+)\.(\w+)/g;
        let match;
        while ((match = relationshipPattern.exec(query)) !== null) {
            const parts = match[0].split('.');
            analysis.relationships.push({
                path: match[0],
                depth: parts.length
            });
        }

        // Check for WHERE, ORDER BY, LIMIT
        analysis.hasWhere = /\sWHERE\s/i.test(query);
        analysis.hasOrderBy = /\sORDER\s+BY\s/i.test(query);

        const limitMatch = query.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
            analysis.hasLimit = true;
            analysis.limitValue = parseInt(limitMatch[1], 10);
        }

        // Check for subquery
        analysis.isSubquery = /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*\s+IN\s+\(\s*SELECT/i.test(query);

        return analysis;
    }

    /**
     * Validate aggregate queries have proper GROUP BY
     */
    _validateAggregateGroupBy(query, result) {
        const analysis = result.queryAnalysis;

        if (!analysis.hasAggregate) return;

        // If we have non-aggregated fields in SELECT with aggregate functions
        const nonAggregateFields = analysis.selectFields.filter(f =>
            !this.aggregateFunctions.some(agg =>
                f.toUpperCase().includes(agg + '(')
            )
        );

        if (nonAggregateFields.length > 0 && !analysis.hasGroupBy) {
            result.errors.push(
                `Aggregate query with non-aggregated fields requires GROUP BY. ` +
                `Non-aggregated fields: ${nonAggregateFields.join(', ')}`
            );
            result.suggestions.push(
                `Add GROUP BY ${nonAggregateFields.join(', ')} to the query`
            );
        }

        // Check if GROUP BY fields match SELECT non-aggregate fields
        if (analysis.hasGroupBy && nonAggregateFields.length > 0) {
            const missingInGroupBy = nonAggregateFields.filter(f =>
                !analysis.groupByFields.some(g =>
                    g.toUpperCase() === f.toUpperCase()
                )
            );

            if (missingInGroupBy.length > 0) {
                result.errors.push(
                    `Fields in SELECT must be in GROUP BY or in aggregate function: ` +
                    `${missingInGroupBy.join(', ')}`
                );
            }
        }
    }

    /**
     * Validate relationship query depth
     */
    _validateRelationshipDepth(query, result) {
        const analysis = result.queryAnalysis;

        for (const rel of analysis.relationships) {
            if (rel.depth > this.relationshipDepthLimit) {
                result.errors.push(
                    `Relationship depth ${rel.depth} exceeds limit of ${this.relationshipDepthLimit}: ${rel.path}`
                );
            }
        }
    }

    /**
     * Validate field naming conventions
     */
    _validateFieldNaming(query, result, context) {
        const objectType = context.objectType || result.queryAnalysis.fromObject;

        if (!objectType) return;

        // Check for Custom Metadata Type
        if (objectType.endsWith('__mdt')) {
            const rules = this.fieldNamingRules.CustomMetadata;
            for (const forbidden of rules.forbidden) {
                if (query.includes(forbidden.toUpperCase())) {
                    result.errors.push(rules.message);
                    result.suggestions.push(`Replace ${forbidden} with ${rules.preferred}`);
                }
            }
        }

        // Check for Custom Settings
        if (objectType.endsWith('__c') && context.isCustomSetting) {
            const rules = this.fieldNamingRules.CustomSetting;
            for (const forbidden of rules.forbidden) {
                if (query.includes(forbidden.toUpperCase())) {
                    result.warnings.push(rules.message);
                }
            }
        }
    }

    /**
     * Validate aggregate + relationship combination issues
     * This is a CRITICAL validation - GROUP BY with relationship traversal
     * returns NULL for the relationship field
     */
    _validateAggregateRelationship(query, result) {
        const analysis = result.queryAnalysis;

        if (!analysis.hasAggregate || !analysis.hasGroupBy) return;

        // Check if GROUP BY includes relationship fields
        const relationshipGroupByFields = analysis.groupByFields.filter(f =>
            f.includes('.')
        );

        if (relationshipGroupByFields.length > 0) {
            result.warnings.push(
                `GROUP BY with relationship traversal (${relationshipGroupByFields.join(', ')}) ` +
                `may return NULL for the relationship field in aggregate results. ` +
                `Consider using a subquery or separate queries instead.`
            );
            result.suggestions.push(
                `Alternative 1: Use subquery to get IDs first, then aggregate`,
                `Alternative 2: Run separate queries for detail and aggregate data`,
                `Alternative 3: Use SOQL for Loops if processing in Apex`
            );
        }
    }

    /**
     * Validate query limits
     */
    _validateQueryLimits(query, result) {
        const analysis = result.queryAnalysis;

        // Check for missing LIMIT on large queries
        if (!analysis.hasLimit && !analysis.hasAggregate) {
            result.warnings.push(
                'Query has no LIMIT clause - consider adding LIMIT to prevent governor limits'
            );
        }

        // Check for excessive LIMIT
        if (analysis.hasLimit && analysis.limitValue > this.maxRecordsDefault) {
            result.warnings.push(
                `LIMIT ${analysis.limitValue} exceeds recommended maximum of ${this.maxRecordsDefault}`
            );
        }

        // Check field count
        if (analysis.selectFields.length > this.maxFieldsPerQuery) {
            result.warnings.push(
                `Query selects ${analysis.selectFields.length} fields, ` +
                `exceeding recommended maximum of ${this.maxFieldsPerQuery}`
            );
        }
    }

    /**
     * Validate NULL handling in query
     */
    _validateNullHandling(query, result) {
        const analysis = result.queryAnalysis;

        // Check for != null comparisons that might exclude unexpected records
        if (/!=\s*NULL/i.test(query) || /<>\s*NULL/i.test(query)) {
            result.warnings.push(
                'Using != null or <> null will exclude NULL values. ' +
                'Use = null to find NULL values, or consider if NULLs should be included.'
            );
        }

        // Check for relationship fields without null handling
        for (const rel of analysis.relationships) {
            if (!query.includes(`${rel.path.split('.')[0]} != NULL`) &&
                !query.includes(`${rel.path.split('.')[0]} = NULL`)) {
                // Only warn for WHERE clause relationships
                if (analysis.hasWhere && query.includes(rel.path)) {
                    result.suggestions.push(
                        `Consider adding null check for relationship ${rel.path.split('.')[0]} ` +
                        `to handle records where the relationship is null`
                    );
                }
            }
        }
    }

    /**
     * Validate ORDER BY in aggregate queries
     */
    _validateOrderByInAggregate(query, result) {
        const analysis = result.queryAnalysis;

        if (analysis.hasAggregate && analysis.hasOrderBy) {
            // Extract ORDER BY fields
            const orderByMatch = query.match(/ORDER\s+BY\s+([^LIMIT]+)/i);
            if (orderByMatch) {
                const orderByFields = orderByMatch[1]
                    .split(',')
                    .map(f => f.replace(/\s+(ASC|DESC|NULLS\s+(FIRST|LAST))/gi, '').trim());

                // Check if ORDER BY fields are in GROUP BY or are aggregate functions
                for (const field of orderByFields) {
                    const isInGroupBy = analysis.groupByFields.some(g =>
                        g.toUpperCase() === field.toUpperCase()
                    );
                    const isAggregate = this.aggregateFunctions.some(agg =>
                        field.toUpperCase().startsWith(agg + '(')
                    );

                    if (!isInGroupBy && !isAggregate) {
                        result.errors.push(
                            `ORDER BY field '${field}' must be in GROUP BY clause or be an aggregate function`
                        );
                    }
                }
            }
        }
    }

    /**
     * Generate corrected query suggestion
     * @param {string} query - Original query
     * @param {Object} validationResult - Result from validate()
     * @returns {string|null} Suggested corrected query or null
     */
    suggestCorrection(query, validationResult) {
        if (validationResult.valid) return null;

        let correctedQuery = query;
        const analysis = validationResult.queryAnalysis;

        // Add missing GROUP BY for aggregate queries
        if (validationResult.errors.some(e => e.includes('GROUP BY'))) {
            const nonAggregateFields = analysis.selectFields.filter(f =>
                !this.aggregateFunctions.some(agg =>
                    f.toUpperCase().includes(agg + '(')
                )
            );

            if (nonAggregateFields.length > 0) {
                // Find position to insert GROUP BY (before ORDER BY, LIMIT, or end)
                let insertPos = correctedQuery.length;
                const orderByIndex = correctedQuery.toUpperCase().indexOf(' ORDER BY');
                const limitIndex = correctedQuery.toUpperCase().indexOf(' LIMIT');

                if (orderByIndex > -1) insertPos = Math.min(insertPos, orderByIndex);
                if (limitIndex > -1) insertPos = Math.min(insertPos, limitIndex);

                const groupByClause = ` GROUP BY ${nonAggregateFields.join(', ')}`;
                correctedQuery =
                    correctedQuery.slice(0, insertPos) +
                    groupByClause +
                    correctedQuery.slice(insertPos);
            }
        }

        // Add LIMIT if missing
        if (validationResult.warnings.some(w => w.includes('no LIMIT'))) {
            if (!correctedQuery.toUpperCase().includes(' LIMIT ')) {
                correctedQuery += ' LIMIT 1000';
            }
        }

        return correctedQuery !== query ? correctedQuery : null;
    }

    /**
     * Validate query against expected result schema
     * @param {Object} result - Query result
     * @param {Object} expectations - Expected result characteristics
     */
    validateResult(result, expectations = {}) {
        const validation = {
            valid: true,
            issues: [],
            warnings: []
        };

        if (!result || typeof result !== 'object') {
            validation.valid = false;
            validation.issues.push('Result is null or not an object');
            return validation;
        }

        // Check totalSize
        if (result.totalSize !== undefined) {
            if (expectations.minRecords !== undefined && result.totalSize < expectations.minRecords) {
                validation.warnings.push(
                    `Expected at least ${expectations.minRecords} records, got ${result.totalSize}`
                );
            }

            if (expectations.maxRecords !== undefined && result.totalSize > expectations.maxRecords) {
                validation.warnings.push(
                    `Expected at most ${expectations.maxRecords} records, got ${result.totalSize}`
                );
            }

            // Improbability check - 0 results when expecting data
            if (result.totalSize === 0 && expectations.expectData === true) {
                validation.warnings.push(
                    'Query returned 0 records when data was expected - verify filters'
                );
            }
        }

        // Check for done flag
        if (result.done === false) {
            validation.warnings.push(
                'Query result is not complete (done=false) - use queryMore to get remaining records'
            );
        }

        // Check records array
        if (result.records) {
            if (!Array.isArray(result.records)) {
                validation.valid = false;
                validation.issues.push('records field is not an array');
            } else {
                // Check for NULL values in critical fields
                for (const record of result.records) {
                    if (expectations.requiredFields) {
                        for (const field of expectations.requiredFields) {
                            if (record[field] === null || record[field] === undefined) {
                                validation.warnings.push(
                                    `NULL value found in required field: ${field}`
                                );
                                break; // Only warn once per field
                            }
                        }
                    }
                }
            }
        }

        return validation;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const validator = new SOQLContractValidator({ verbose: true });

    switch (command) {
        case 'validate':
            const query = args.slice(1).join(' ');
            if (!query) {
                console.error('Usage: soql-contract-validator validate "SELECT ... FROM ..."');
                process.exit(1);
            }

            const result = validator.validate(query);
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.valid ? 0 : 1);
            break;

        case 'suggest':
            const queryToFix = args.slice(1).join(' ');
            if (!queryToFix) {
                console.error('Usage: soql-contract-validator suggest "SELECT ... FROM ..."');
                process.exit(1);
            }

            const validationResult = validator.validate(queryToFix);
            const suggestion = validator.suggestCorrection(queryToFix, validationResult);

            if (suggestion) {
                console.log('Original:', queryToFix);
                console.log('Suggested:', suggestion);
            } else {
                console.log('Query is valid or no automatic correction available');
            }
            break;

        default:
            console.log(`
SOQL Contract Validator - Validate Salesforce SOQL queries

Usage:
  soql-contract-validator validate "SELECT ... FROM ..."   Validate a query
  soql-contract-validator suggest "SELECT ... FROM ..."    Suggest corrections

Examples:
  soql-contract-validator validate "SELECT COUNT(Id), AccountId FROM Contact"
  soql-contract-validator suggest "SELECT Name, COUNT(Id) FROM Account"

Checks performed:
  - Aggregate queries require proper GROUP BY
  - Relationship traversal depth limits (max 5)
  - DeveloperName vs ApiName for Custom Metadata
  - Aggregate + relationship combination issues
  - Governor limit considerations
  - NULL handling recommendations
            `);
    }
}

module.exports = { SOQLContractValidator };
