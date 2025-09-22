#!/usr/bin/env node
const { SOQLQueryHandler } = require('./soql-query-handler');

/**
 * Instance-agnostic SOQL executor that handles common field naming issues
 */
class SafeSOQLExecutor {
    constructor(options = {}) {
        this.handler = new SOQLQueryHandler(options);
        this.fieldMappings = new Map();
        this.setupFieldMappings();
    }

    /**
     * Setup common field name mappings across different instances
     */
    setupFieldMappings() {
        // HubSpot field variations
        this.fieldMappings.set('hubspot_contact_id__c', [
            'HubSpot_Contact_ID__c',
            'Hubspot_ID__c',
            'HubSpot_ID__c',
            'HS_Contact_ID__c',
            'HS_Object_ID__c',
            'HubspotContactId__c'
        ]);

        this.fieldMappings.set('hs_object_id__c', [
            'HS_Object_ID__c',
            'Hubspot_ID__c',
            'HubSpot_Object_ID__c',
            'HubSpotObjectId__c',
            'HubSpot_ID__c'
        ]);

        // Add more mappings as needed
    }

    /**
     * Execute query with automatic field name correction
     */
    async executeWithFallback(query, targetOrg) {
        try {
            // First attempt with original query
            return await this.handler.executeQuery(query, { targetOrg });

        } catch (error) {
            // If field not found, try to correct it
            if (error.missingField) {
                const correctedQuery = await this.correctFieldNames(query, error.missingField, targetOrg);

                if (correctedQuery && correctedQuery !== query) {
                    console.warn(`Auto-corrected query field: ${error.missingField}`);
                    return await this.handler.executeQuery(correctedQuery, { targetOrg });
                }
            }

            // Check if error message contains field not found
            if (error.message && error.message.includes('No such column')) {
                const fieldMatch = error.message.match(/No such column '([^']+)'/);
                if (fieldMatch) {
                    const missingField = fieldMatch[1];
                    const correctedQuery = await this.correctFieldNames(query, missingField, targetOrg);

                    if (correctedQuery && correctedQuery !== query) {
                        console.warn(`Auto-corrected query field: ${missingField}`);
                        return await this.handler.executeQuery(correctedQuery, { targetOrg });
                    }
                }
            }

            // If unexpected token error, try different syntax
            if (error.unexpectedToken) {
                const fixedQuery = this.fixQuerySyntax(query, error);
                if (fixedQuery && fixedQuery !== query) {
                    console.warn('Auto-corrected query syntax');
                    return await this.handler.executeQuery(fixedQuery, { targetOrg });
                }
            }

            throw error;
        }
    }

    /**
     * Correct field names based on actual object schema
     */
    async correctFieldNames(query, missingField, targetOrg) {
        // Extract object name from query
        const objectMatch = query.match(/FROM\s+(\w+)/i);
        if (!objectMatch) {
            return null;
        }

        const objectName = objectMatch[1];
        const fields = await this.handler.getObjectFields(objectName, targetOrg);

        // Look for exact match with different case
        const exactMatch = fields.find(f =>
            f.toLowerCase() === missingField.toLowerCase()
        );

        if (exactMatch) {
            return query.replace(new RegExp(`\\b${missingField}\\b`, 'gi'), exactMatch);
        }

        // Check field mappings
        const mappingKey = missingField.toLowerCase();
        if (this.fieldMappings.has(mappingKey)) {
            const alternatives = this.fieldMappings.get(mappingKey);

            for (const alt of alternatives) {
                const match = fields.find(f => f.toLowerCase() === alt.toLowerCase());
                if (match) {
                    return query.replace(new RegExp(`\\b${missingField}\\b`, 'gi'), match);
                }
            }
        }

        // Try to find similar field
        const similar = this.findSimilarField(missingField, fields);
        if (similar) {
            console.log(`Suggesting field: ${similar} instead of ${missingField}`);
            return query.replace(new RegExp(`\\b${missingField}\\b`, 'gi'), similar);
        }

        return null;
    }

    /**
     * Fix common SOQL syntax issues
     */
    fixQuerySyntax(query, error) {
        let fixed = query;

        // Fix COUNT() spacing issues
        fixed = fixed.replace(/COUNT\s*\(\s*\)/gi, 'COUNT()');

        // Fix IS NOT NULL vs != null
        fixed = fixed.replace(/\s+IS\s+NOT\s+NULL/gi, ' != null');
        fixed = fixed.replace(/\s+IS\s+NULL/gi, ' = null');

        // Fix escaped characters
        fixed = fixed.replace(/\\!/g, '!');
        fixed = fixed.replace(/\\=/g, '=');

        // Fix quote issues around field names
        fixed = fixed.replace(/'(\w+__c)'/gi, '$1');

        // Fix parentheses in WHERE clause
        fixed = fixed.replace(/WHERE\s+\(/g, 'WHERE (');

        return fixed !== query ? fixed : null;
    }

    /**
     * Find similar field name using fuzzy matching
     */
    findSimilarField(requestedField, availableFields) {
        const requested = requestedField.toLowerCase().replace('__c', '');

        for (const field of availableFields) {
            const available = field.toLowerCase().replace('__c', '');

            // Check if core name matches
            if (available.includes(requested) || requested.includes(available)) {
                return field;
            }

            // Check for common abbreviations
            if (this.areAbbreviationsRelated(requested, available)) {
                return field;
            }
        }

        return null;
    }

    /**
     * Check if two strings might be abbreviations of each other
     */
    areAbbreviationsRelated(str1, str2) {
        const abbreviations = {
            'hs': ['hubspot'],
            'sf': ['salesforce'],
            'id': ['identifier', 'identity'],
            'obj': ['object'],
            'cont': ['contact'],
            'acct': ['account'],
            'opp': ['opportunity']
        };

        for (const [abbr, expansions] of Object.entries(abbreviations)) {
            if (str1.includes(abbr)) {
                for (const expansion of expansions) {
                    if (str2.includes(expansion)) return true;
                }
            }
            if (str2.includes(abbr)) {
                for (const expansion of expansions) {
                    if (str1.includes(expansion)) return true;
                }
            }
        }

        return false;
    }

    /**
     * Build a safe COUNT query
     */
    buildCountQuery(objectName, whereClause, targetOrg) {
        // Ensure proper COUNT() syntax
        let query = `SELECT COUNT() FROM ${objectName}`;

        if (whereClause) {
            // Clean up WHERE clause
            whereClause = whereClause.trim();
            if (!whereClause.toLowerCase().startsWith('where')) {
                whereClause = 'WHERE ' + whereClause;
            }
            query += ' ' + whereClause;
        }

        return query;
    }

    /**
     * Get count with automatic field correction
     */
    async getCount(objectName, conditions, targetOrg) {
        const whereClause = conditions ? `WHERE ${conditions}` : '';
        const query = this.buildCountQuery(objectName, whereClause, targetOrg);

        try {
            const result = await this.executeWithFallback(query, targetOrg);

            // Extract count from result
            if (result.records && result.records.length > 0) {
                return result.records[0].expr0 || result.totalSize || 0;
            }

            return result.totalSize || 0;

        } catch (error) {
            console.error(`Failed to get count for ${objectName}:`, error.message);

            // If field error, list available fields
            if (error.missingField) {
                const fields = await this.handler.getObjectFields(objectName, targetOrg);
                console.log(`Available fields for ${objectName}:`, fields.filter(f => f.includes('__c')).join(', '));
            }

            throw error;
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: safe-soql-executor.js <target-org> <query>');
        console.log('       safe-soql-executor.js <target-org> --count <object> [conditions]');
        console.log('\nExample:');
        console.log('  safe-soql-executor.js my-org "SELECT Id FROM Contact WHERE HubSpot_Contact_ID__c != null"');
        console.log('  safe-soql-executor.js my-org --count Contact "HubSpot_Contact_ID__c != null"');
        process.exit(1);
    }

    const targetOrg = args[0];
    const executor = new SafeSOQLExecutor({ targetOrg, debug: process.env.DEBUG === 'true' });

    (async () => {
        try {
            if (args[1] === '--count') {
                const objectName = args[2];
                const conditions = args.slice(3).join(' ');

                const count = await executor.getCount(objectName, conditions, targetOrg);
                console.log(`Count: ${count}`);

            } else {
                const query = args.slice(1).join(' ');
                const result = await executor.executeWithFallback(query, targetOrg);

                if (result.records) {
                    console.log(JSON.stringify(result.records, null, 2));
                    console.log(`\nTotal records: ${result.totalSize}`);
                } else {
                    console.log(JSON.stringify(result, null, 2));
                }
            }

        } catch (error) {
            console.error('Execution failed:', error.message);

            if (error.suggestion) {
                console.log('\nSuggestion:', error.suggestion.message);
            }

            process.exit(1);
        }
    })();
}

module.exports = { SafeSOQLExecutor };