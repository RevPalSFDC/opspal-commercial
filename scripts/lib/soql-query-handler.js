#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class SOQLQueryHandler {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.targetOrg = options.targetOrg || null;
        this.fieldCache = new Map();
        this.tempDir = options.tempDir || os.tmpdir();
    }

    /**
     * Execute SOQL query with proper escaping and error handling
     */
    async executeQuery(query, options = {}) {
        const targetOrg = options.targetOrg || this.targetOrg;

        if (!targetOrg) {
            throw new Error('Target org is required');
        }

        // Create temporary file for query (avoids shell escaping issues)
        const queryFile = this.createTempQueryFile(query);

        try {
            const cmd = `sf data query --file "${queryFile}" --target-org ${targetOrg} --json 2>&1`;

            if (this.debug) {
                console.error(`[DEBUG] Executing: ${cmd}`);
                console.error(`[DEBUG] Query: ${query}`);
            }

            const result = execSync(cmd, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            let parsed;
            try {
                parsed = JSON.parse(result);
            } catch (parseError) {
                // If not JSON, check for common error patterns
                const errorMatch = result.match(/ERROR at Row:(\d+):Column:(\d+)/);
                if (errorMatch) {
                    const error = new Error(result);
                    error.row = parseInt(errorMatch[1]);
                    error.column = parseInt(errorMatch[2]);
                    error.query = query;

                    // Extract missing field
                    const fieldMatch = result.match(/No such column '([^']+)'/);
                    if (fieldMatch) {
                        error.missingField = fieldMatch[1];
                    }
                    throw error;
                }
                throw new Error(result);
            }

            if (parsed.status !== 0) {
                const error = this.parseQueryError(parsed, query);
                throw error;
            }

            return parsed.result;

        } catch (error) {
            // Enhanced error handling
            if (error.message.includes('No such column')) {
                const suggestion = await this.suggestFieldCorrection(error, targetOrg);
                error.suggestion = suggestion;
            }
            throw error;
        } finally {
            // Clean up temp file
            if (fs.existsSync(queryFile)) {
                fs.unlinkSync(queryFile);
            }
        }
    }

    /**
     * Create temporary file for query to avoid shell escaping issues
     */
    createTempQueryFile(query) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const filename = `soql_${timestamp}_${random}.txt`;
        const filepath = path.join(this.tempDir, filename);

        fs.writeFileSync(filepath, query, 'utf8');
        return filepath;
    }

    /**
     * Parse SOQL query errors and provide better context
     */
    parseQueryError(result, query) {
        // Handle both JSON response and plain text error
        const message = result.message || result.data || result.toString() || 'Query failed';
        const error = new Error(message);
        error.code = result.exitCode || result.status;
        error.query = query;

        // Extract specific error details
        const errorText = typeof result === 'object' ? JSON.stringify(result) : result.toString();

        const match = errorText.match(/ERROR at Row:(\d+):Column:(\d+)/);
        if (match) {
            error.row = parseInt(match[1]);
            error.column = parseInt(match[2]);

            // Extract the problematic token
            const tokenMatch = errorText.match(/unexpected token: '([^']+)'/);
            if (tokenMatch) {
                error.unexpectedToken = tokenMatch[1];
            }

            // Extract missing field
            const fieldMatch = errorText.match(/No such column '([^']+)'/);
            if (fieldMatch) {
                error.missingField = fieldMatch[1];
            }
        }

        return error;
    }

    /**
     * Get available fields for an object
     */
    async getObjectFields(objectName, targetOrg) {
        const cacheKey = `${targetOrg}:${objectName}`;

        if (this.fieldCache.has(cacheKey)) {
            return this.fieldCache.get(cacheKey);
        }

        try {
            // Use FIELDS(ALL) to get all available fields
            const query = `SELECT FIELDS(ALL) FROM ${objectName} LIMIT 1`;
            const result = await this.executeQuery(query, { targetOrg });

            if (result.records && result.records.length > 0) {
                const fields = Object.keys(result.records[0]);
                this.fieldCache.set(cacheKey, fields);
                return fields;
            }

            return [];

        } catch (error) {
            console.error(`Failed to get fields for ${objectName}:`, error.message);
            return [];
        }
    }

    /**
     * Suggest field name correction based on available fields
     */
    async suggestFieldCorrection(error, targetOrg) {
        if (!error.missingField) {
            return null;
        }

        // Extract object name from error or query
        const objectMatch = error.query.match(/FROM\s+(\w+)/i);
        if (!objectMatch) {
            return null;
        }

        const objectName = objectMatch[1];
        const missingField = error.missingField;

        const fields = await this.getObjectFields(objectName, targetOrg);

        // Find similar field names
        const similar = fields.filter(field => {
            const fieldLower = field.toLowerCase();
            const missingLower = missingField.toLowerCase();

            // Check for partial matches
            return fieldLower.includes(missingLower.replace('__c', '')) ||
                   missingLower.includes(fieldLower.replace('__c', '')) ||
                   this.levenshteinDistance(fieldLower, missingLower) <= 3;
        });

        if (similar.length > 0) {
            return {
                object: objectName,
                requestedField: missingField,
                suggestions: similar,
                message: `Field '${missingField}' not found. Did you mean: ${similar.join(', ')}?`
            };
        }

        // Check for HubSpot-related fields specifically
        const hubspotFields = fields.filter(f => /hub|hs_/i.test(f));
        if (hubspotFields.length > 0 && /hub|hs_/i.test(missingField)) {
            return {
                object: objectName,
                requestedField: missingField,
                suggestions: hubspotFields,
                message: `HubSpot fields found: ${hubspotFields.join(', ')}`
            };
        }

        return {
            object: objectName,
            requestedField: missingField,
            suggestions: [],
            message: `Field '${missingField}' not found. Use getObjectFields() to list available fields.`
        };
    }

    /**
     * Calculate Levenshtein distance for fuzzy matching
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Build dynamic query based on available fields
     */
    async buildDynamicQuery(objectName, conditions, targetOrg) {
        const fields = await this.getObjectFields(objectName, targetOrg);

        // Validate and correct field names in conditions
        const correctedConditions = [];

        for (const condition of conditions) {
            const fieldMatch = condition.match(/(\w+__c|\w+)\s*(=|!=|<|>|<=|>=|LIKE)\s*/i);
            if (fieldMatch) {
                const requestedField = fieldMatch[1];
                const operator = fieldMatch[2];

                // Find exact match or similar field
                let actualField = fields.find(f => f.toLowerCase() === requestedField.toLowerCase());

                if (!actualField) {
                    // Try fuzzy match
                    const similar = fields.filter(f =>
                        this.levenshteinDistance(f.toLowerCase(), requestedField.toLowerCase()) <= 2
                    );

                    if (similar.length === 1) {
                        actualField = similar[0];
                        console.warn(`Auto-corrected field '${requestedField}' to '${actualField}'`);
                    } else if (similar.length > 1) {
                        console.error(`Ambiguous field '${requestedField}'. Matches: ${similar.join(', ')}`);
                        continue;
                    } else {
                        console.error(`Field '${requestedField}' not found in ${objectName}`);
                        continue;
                    }
                }

                correctedConditions.push(condition.replace(requestedField, actualField));
            } else {
                correctedConditions.push(condition);
            }
        }

        if (correctedConditions.length === 0) {
            throw new Error('No valid conditions after field validation');
        }

        return `SELECT Id, ${correctedConditions.map(c => c.split(/\s+/)[0]).join(', ')} FROM ${objectName} WHERE ${correctedConditions.join(' AND ')}`;
    }

    /**
     * Test connection to Salesforce org
     */
    async testConnection(targetOrg) {
        try {
            const result = await this.executeQuery('SELECT Id FROM Organization LIMIT 1', { targetOrg });
            return {
                success: true,
                orgId: result.records[0]?.Id,
                message: 'Connection successful'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Connection failed'
            };
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: soql-query-handler.js <target-org> <query>');
        console.log('       soql-query-handler.js <target-org> --fields <object>');
        console.log('       soql-query-handler.js <target-org> --test');
        console.log('\nExample:');
        console.log('  soql-query-handler.js my-org "SELECT Id FROM Contact LIMIT 1"');
        console.log('  soql-query-handler.js my-org --fields Contact');
        console.log('  soql-query-handler.js my-org --test');
        process.exit(1);
    }

    const targetOrg = args[0];
    const handler = new SOQLQueryHandler({ targetOrg, debug: process.env.DEBUG === 'true' });

    (async () => {
        try {
            if (args[1] === '--test') {
                const result = await handler.testConnection(targetOrg);
                console.log(JSON.stringify(result, null, 2));

            } else if (args[1] === '--fields') {
                const objectName = args[2];
                if (!objectName) {
                    console.error('Object name required for --fields option');
                    process.exit(1);
                }

                const fields = await handler.getObjectFields(objectName, targetOrg);
                console.log(`Fields for ${objectName}:`);
                fields.forEach(field => console.log(`  - ${field}`));

            } else {
                const query = args.slice(1).join(' ');
                const result = await handler.executeQuery(query);

                if (result.records) {
                    console.log(JSON.stringify(result.records, null, 2));
                    console.log(`\nTotal records: ${result.totalSize}`);
                } else {
                    console.log(JSON.stringify(result, null, 2));
                }
            }

        } catch (error) {
            console.error('Query failed:', error.message);

            if (error.suggestion) {
                console.log('\nSuggestion:', error.suggestion.message);
                if (error.suggestion.suggestions.length > 0) {
                    console.log('Available fields:', error.suggestion.suggestions.join(', '));
                }
            }

            if (process.env.DEBUG === 'true') {
                console.error('Full error:', error);
            }

            process.exit(1);
        }
    })();
}

module.exports = { SOQLQueryHandler };