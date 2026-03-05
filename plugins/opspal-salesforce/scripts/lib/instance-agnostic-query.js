#!/usr/bin/env node

/**
 * Instance-Agnostic Query Builder
 *
 * Discovers available fields before building queries to prevent failures
 * across different Salesforce instances with varying schemas
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class InstanceAgnosticQuery {
    constructor(orgAlias = '') {
        this.orgAlias = orgAlias;
        this.fieldCache = new Map();
        this.cacheTimeout = 3600000; // 1 hour
        this.cacheFile = path.join(process.env.HOME || '/tmp', '.sf-field-cache.json');
    }

    /**
     * Get org parameter for SF CLI commands
     */
    getOrgParam() {
        return this.orgAlias ? `--target-org ${this.orgAlias}` : '';
    }

    /**
     * Load field cache from file
     */
    async loadCache() {
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            const cache = JSON.parse(data);

            // Check if cache is still valid
            if (cache.timestamp && Date.now() - cache.timestamp < this.cacheTimeout) {
                this.fieldCache = new Map(cache.data);
                return true;
            }
        } catch (error) {
            // Cache doesn't exist or is invalid
        }
        return false;
    }

    /**
     * Save field cache to file
     */
    async saveCache() {
        try {
            const cache = {
                timestamp: Date.now(),
                data: Array.from(this.fieldCache.entries())
            };
            await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
        } catch (error) {
            console.error('Warning: Could not save field cache:', error.message);
        }
    }

    /**
     * Discover all fields for an object
     */
    async discoverFields(objectName) {
        const cacheKey = `${this.orgAlias}:${objectName}`;

        // Check cache first
        if (this.fieldCache.has(cacheKey)) {
            return this.fieldCache.get(cacheKey);
        }

        try {
            // Use sf sobject describe to get all fields
            const cmd = `sf sobject describe --sobject ${objectName} ${this.getOrgParam()} --json`;
            const { stdout } = await execAsync(cmd);
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                console.error(`Failed to describe ${objectName}:`, result.message);
                return [];
            }

            const fields = result.result.fields.map(field => ({
                name: field.name,
                type: field.type,
                label: field.label,
                custom: field.custom,
                queryable: field.queryByDefault !== false
            }));

            // Cache the results
            this.fieldCache.set(cacheKey, fields);
            await this.saveCache();

            return fields;
        } catch (error) {
            console.error(`Error discovering fields for ${objectName}:`, error.message);
            return [];
        }
    }

    /**
     * Check if specific fields exist on an object
     */
    async checkFieldsExist(objectName, fieldNames) {
        const fields = await this.discoverFields(objectName);
        const fieldMap = new Map(fields.map(f => [f.name.toLowerCase(), f]));

        const results = {};
        for (const fieldName of fieldNames) {
            results[fieldName] = fieldMap.has(fieldName.toLowerCase());
        }

        return results;
    }

    /**
     * Build a safe SOQL query with only existing fields
     */
    async buildSafeQuery(objectName, requestedFields, whereClause = '', limit = null) {
        const fields = await this.discoverFields(objectName);
        const fieldMap = new Map(fields.map(f => [f.name.toLowerCase(), f]));

        // Always include Id
        const safeFields = ['Id'];
        const missingFields = [];

        for (const field of requestedFields) {
            if (field.toLowerCase() !== 'id') {
                if (fieldMap.has(field.toLowerCase())) {
                    safeFields.push(field);
                } else {
                    missingFields.push(field);
                }
            }
        }

        if (missingFields.length > 0) {
            console.warn(`⚠️  Missing fields on ${objectName}: ${missingFields.join(', ')}`);
        }

        // Build the query
        let query = `SELECT ${safeFields.join(', ')} FROM ${objectName}`;

        if (whereClause) {
            query += ` WHERE ${whereClause}`;
        }

        if (limit) {
            query += ` LIMIT ${limit}`;
        }

        return {
            query,
            safeFields,
            missingFields,
            allFieldsPresent: missingFields.length === 0
        };
    }

    /**
     * Execute a safe SOQL query
     */
    async executeSafeQuery(objectName, requestedFields, whereClause = '', limit = null) {
        const queryInfo = await this.buildSafeQuery(objectName, requestedFields, whereClause, limit);

        if (queryInfo.safeFields.length === 1) { // Only Id field
            console.warn(`⚠️  No queryable fields found for ${objectName}`);
            return {
                success: false,
                records: [],
                missingFields: queryInfo.missingFields,
                error: 'No queryable fields available'
            };
        }

        try {
            const cmd = `sf data query --query "${queryInfo.query}" ${this.getOrgParam()} --json`;
            const { stdout } = await execAsync(cmd);
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                return {
                    success: false,
                    records: [],
                    missingFields: queryInfo.missingFields,
                    error: result.message
                };
            }

            return {
                success: true,
                records: result.result.records,
                totalSize: result.result.totalSize,
                missingFields: queryInfo.missingFields,
                query: queryInfo.query
            };
        } catch (error) {
            return {
                success: false,
                records: [],
                missingFields: queryInfo.missingFields,
                error: error.message
            };
        }
    }

    /**
     * Clear the field cache
     */
    async clearCache() {
        this.fieldCache.clear();
        try {
            await fs.unlink(this.cacheFile);
        } catch (error) {
            // File might not exist
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Instance-Agnostic Query Builder
================================

Usage:
  ${process.argv[1]} <command> [options]

Commands:
  discover <object> [--org alias]
    Discover all fields for an object

  check <object> <field1,field2,...> [--org alias]
    Check if specific fields exist

  query <object> <field1,field2,...> [--where "clause"] [--limit N] [--org alias]
    Build and execute a safe query with only existing fields

  clear-cache
    Clear the field discovery cache

Examples:
  # Discover all Contact fields
  ${process.argv[1]} discover Contact --org myorg

  # Check if fields exist
  ${process.argv[1]} check Contact "LastName,Email,CustomField__c" --org myorg

  # Execute safe query (skips missing fields)
  ${process.argv[1]} query Contact "Id,Name,Email,MissingField__c" --where "Email != null" --limit 10
`);
        process.exit(1);
    }

    const command = args[0];
    const orgIndex = args.indexOf('--org');
    const orgAlias = orgIndex > -1 ? args[orgIndex + 1] : '';

    const queryBuilder = new InstanceAgnosticQuery(orgAlias);
    await queryBuilder.loadCache();

    try {
        switch (command) {
            case 'discover': {
                const object = args[1];
                const fields = await queryBuilder.discoverFields(object);
                console.log(`\nFields for ${object}:`);
                fields.forEach(f => {
                    console.log(`  ${f.name} (${f.type})${f.custom ? ' [Custom]' : ''}`);
                });
                console.log(`\nTotal: ${fields.length} fields`);
                break;
            }

            case 'check': {
                const object = args[1];
                const fieldList = args[2].split(',').map(f => f.trim());
                const results = await queryBuilder.checkFieldsExist(object, fieldList);
                console.log(`\nField existence for ${object}:`);
                for (const [field, exists] of Object.entries(results)) {
                    console.log(`  ${field}: ${exists ? '✓ Exists' : '✗ Missing'}`);
                }
                break;
            }

            case 'query': {
                const object = args[1];
                const fieldList = args[2].split(',').map(f => f.trim());
                const whereIndex = args.indexOf('--where');
                const whereClause = whereIndex > -1 ? args[whereIndex + 1] : '';
                const limitIndex = args.indexOf('--limit');
                const limit = limitIndex > -1 ? parseInt(args[limitIndex + 1]) : null;

                const result = await queryBuilder.executeSafeQuery(object, fieldList, whereClause, limit);

                if (result.missingFields.length > 0) {
                    console.log(`\n⚠️  Skipped missing fields: ${result.missingFields.join(', ')}`);
                }

                if (result.success) {
                    console.log(`\n✓ Query executed successfully`);
                    console.log(`Query: ${result.query}`);
                    console.log(`\nRecords (${result.totalSize} total):`);
                    console.log(JSON.stringify(result.records, null, 2));
                } else {
                    console.error(`\n✗ Query failed: ${result.error}`);
                }
                break;
            }

            case 'clear-cache': {
                await queryBuilder.clearCache();
                console.log('✓ Field cache cleared');
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = InstanceAgnosticQuery;

// Run CLI if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}