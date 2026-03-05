#!/usr/bin/env node

/**
 * Object Field Resolver
 *
 * Provides instance-agnostic dynamic field path resolution for Salesforce objects.
 * Automatically determines correct field access paths (direct vs relationship traversal)
 * based on object schema metadata.
 *
 * Solves the "Quote → Opportunity.OwnerId" pattern and similar relationship-based
 * field access scenarios.
 *
 * Usage (as module):
 *   const { FieldResolver } = require('./object-field-resolver');
 *   const resolver = new FieldResolver(orgAlias);
 *   const path = await resolver.getFieldPath('Quote', 'OwnerId');
 *   // Returns: 'Opportunity.OwnerId'
 *
 * Usage (CLI):
 *   node scripts/lib/object-field-resolver.js <org> <object> <field>
 *
 * @author Field Access Pattern Tools
 * @date 2025-10-04
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class FieldResolver {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.cache = {};
        this.cacheFile = `/tmp/field-resolver-cache-${orgAlias}.json`;
        this.loadCache();
    }

    /**
     * Get field access path for an object/field combination
     */
    async getFieldPath(objectName, fieldName) {
        const cacheKey = `${objectName}.${fieldName}`;

        // Check cache first
        if (this.cache[cacheKey]) {
            return this.cache[cacheKey];
        }

        // Describe object to find field path
        const objectMeta = await this.describeObject(objectName);

        if (!objectMeta) {
            throw new Error(`Object ${objectName} not found in org`);
        }

        // Check if field exists directly
        const directField = objectMeta.fields.find(f => f.name === fieldName);

        if (directField) {
            // Field exists directly on object
            this.cache[cacheKey] = fieldName;
            this.saveCache();
            return fieldName;
        }

        // Field doesn't exist directly, check relationships
        const path = await this.findFieldThroughRelationships(objectName, fieldName, objectMeta);

        if (path) {
            this.cache[cacheKey] = path;
            this.saveCache();
            return path;
        }

        throw new Error(`Field ${fieldName} not found on ${objectName} or related objects`);
    }

    /**
     * Find field through relationship traversal
     */
    async findFieldThroughRelationships(objectName, fieldName, objectMeta) {
        // Get all relationship fields
        const relationships = objectMeta.fields.filter(f => f.type === 'reference');

        // Try each relationship
        for (const rel of relationships) {
            const relatedObjects = rel.referenceTo || [];

            for (const relatedObject of relatedObjects) {
                const relatedMeta = await this.describeObject(relatedObject);

                if (!relatedMeta) continue;

                // Check if related object has the field
                const hasField = relatedMeta.fields.some(f => f.name === fieldName);

                if (hasField) {
                    // Found it! Build path
                    const relationshipName = rel.relationshipName;
                    return `${relationshipName}.${fieldName}`;
                }
            }
        }

        return null;
    }

    /**
     * Build SOQL query with correct field paths
     */
    async buildQuery(objectName, fields, whereClause) {
        const resolvedFields = ['Id']; // Always include Id

        for (const field of fields) {
            const path = await this.getFieldPath(objectName, field);
            if (path !== 'Id') { // Don't duplicate Id
                resolvedFields.push(path);
            }
        }

        let query = `SELECT ${resolvedFields.join(', ')} FROM ${objectName}`;

        if (whereClause) {
            query += ` WHERE ${whereClause}`;
        }

        return query;
    }

    /**
     * Get field value using correct access path
     */
    getFieldValue(record, fieldName, fieldPath) {
        if (!fieldPath) {
            fieldPath = fieldName;
        }

        // Handle relationship traversal
        if (fieldPath.includes('.')) {
            return this.traversePath(record, fieldPath);
        }

        // Direct field access
        return record[fieldName];
    }

    /**
     * Traverse relationship path to get value
     */
    traversePath(record, path) {
        const parts = path.split('.');
        let current = record;

        for (let i = 0; i < parts.length; i++) {
            if (!current) return null;

            const part = parts[i];

            if (i < parts.length - 1) {
                // Traverse relationship
                current = current[part];
            } else {
                // Get final field value
                return current[part];
            }
        }

        return null;
    }

    /**
     * Describe object via Salesforce CLI
     */
    async describeObject(objectName) {
        // Check cache first
        const cacheKey = `describe_${objectName}`;
        if (this.cache[cacheKey]) {
            return this.cache[cacheKey];
        }

        try {
            const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (result.result) {
                this.cache[cacheKey] = result.result;
                this.saveCache();
                return result.result;
            }

            return null;

        } catch (error) {
            return null;
        }
    }

    /**
     * Get common field patterns for known objects
     */
    getKnownPatterns() {
        return {
            'Quote.OwnerId': 'Opportunity.OwnerId',
            'Quote.AccountId': 'Opportunity.AccountId',
            'QuoteLineItem.OwnerId': 'Quote.Opportunity.OwnerId',
            'OpportunityLineItem.AccountId': 'Opportunity.AccountId',
            'OpportunityLineItem.OwnerId': 'Opportunity.OwnerId',
            'Contact.OwnerId': 'OwnerId', // Direct field
            'Case.OwnerId': 'OwnerId'     // Direct field
        };
    }

    /**
     * Load cache from disk
     */
    loadCache() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
            }
        } catch (error) {
            this.cache = {};
        }
    }

    /**
     * Save cache to disk
     */
    saveCache() {
        try {
            fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            // Ignore cache save errors
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache = {};
        if (fs.existsSync(this.cacheFile)) {
            fs.unlinkSync(this.cacheFile);
        }
    }
}

/**
 * Generate Apex class for field resolution
 */
function generateApexClass(patterns) {
    return `
/**
 * Dynamic field path resolver for instance-agnostic code
 * Auto-generated by object-field-resolver.js
 */
public class FieldPathResolver {

    private static Map<String, String> FIELD_PATHS = new Map<String, String>{
        ${Object.entries(patterns).map(([key, value]) => {
            const [obj, field] = key.split('.');
            return `'${obj}.${field}' => '${value}'`;
        }).join(',\n        ')}
    };

    /**
     * Get field access path for object type
     */
    public static String getFieldPath(String objectType, String fieldName) {
        String key = objectType + '.' + fieldName;

        // Check if special path exists
        if (FIELD_PATHS.containsKey(key)) {
            return FIELD_PATHS.get(key);
        }

        // Default: direct field access
        return fieldName;
    }

    /**
     * Get field value using correct access path
     */
    public static Object getFieldValue(SObject record, String fieldName) {
        String objectType = record.getSObjectType().getDescribe().getName();
        String path = getFieldPath(objectType, fieldName);

        // Handle relationship traversal
        if (path.contains('.')) {
            return traverseRelationship(record, path);
        }

        // Direct field access
        return record.get(fieldName);
    }

    /**
     * Traverse relationship path to get field value
     */
    private static Object traverseRelationship(SObject record, String path) {
        String[] parts = path.split('\\\\.');
        SObject current = record;

        // Traverse relationships
        for (Integer i = 0; i < parts.size() - 1; i++) {
            current = current.getSObject(parts[i]);
            if (current == null) return null;
        }

        // Get final field value
        return current.get(parts[parts.size() - 1]);
    }
}
`.trim();
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.error('Usage: node object-field-resolver.js <org-alias> <object-name> <field-name>');
        console.error('\nExample:');
        console.error('  node object-field-resolver.js rentable-sandbox Quote OwnerId');
        console.error('\nOptions:');
        console.error('  --generate-apex    Generate Apex class with field patterns');
        console.error('  --clear-cache      Clear resolver cache');
        process.exit(1);
    }

    const orgAlias = args[0];

    if (args.includes('--clear-cache')) {
        const resolver = new FieldResolver(orgAlias);
        resolver.clearCache();
        console.log('✅ Cache cleared\n');
        process.exit(0);
    }

    if (args.includes('--generate-apex')) {
        const resolver = new FieldResolver(orgAlias);
        const patterns = resolver.getKnownPatterns();
        const apexClass = generateApexClass(patterns);

        console.log(apexClass);
        process.exit(0);
    }

    const objectName = args[1];
    const fieldName = args[2];

    const resolver = new FieldResolver(orgAlias);

    resolver.getFieldPath(objectName, fieldName)
        .then(path => {
            console.log(`\n${'='.repeat(70)}`);
            console.log('FIELD PATH RESOLUTION');
            console.log(`${'='.repeat(70)}\n`);
            console.log(`Object: ${objectName}`);
            console.log(`Field: ${fieldName}`);
            console.log(`Path: ${path}\n`);

            if (path !== fieldName) {
                console.log(`✅ Relationship traversal required`);
                console.log(`Use: ${path} in SOQL queries\n`);
            } else {
                console.log(`✅ Direct field access`);
                console.log(`Use: ${fieldName} directly\n`);
            }

            console.log(`${'='.repeat(70)}\n`);
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Resolution failed:', error.message);
            process.exit(1);
        });
}

module.exports = { FieldResolver, generateApexClass };
