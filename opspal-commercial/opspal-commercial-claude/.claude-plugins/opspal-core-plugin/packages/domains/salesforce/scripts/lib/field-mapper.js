#!/usr/bin/env node

/**
 * Field Mapping Registry
 *
 * Caches field API names by org to eliminate repeated field discoveries.
 * Stores org-specific field mappings for common patterns.
 *
 * Storage: ~/.sf-field-mappings/{org-alias}.json
 *
 * Usage:
 *   const { FieldMapper } = require('./lib/field-mapper');
 *   const mapper = new FieldMapper('wedgewood-production');
 *
 *   // Get field (with auto-discovery if not cached)
 *   const field = await mapper.getField('Contact', 'First Touch Campaign');
 *   // Returns: "First_Touch_Campaign__c"
 *
 *   // Register known field mappings
 *   mapper.registerField('Contact', 'firstTouchCampaign', 'First_Touch_Campaign__c');
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

class FieldMapper {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            cacheDir: options.cacheDir || path.join(os.homedir(), '.sf-field-mappings'),
            autoSave: options.autoSave !== false,
            useMetadataCache: options.useMetadataCache !== false,
            verbose: options.verbose || false,
            ...options
        };

        this.cacheFile = path.join(this.options.cacheDir, `${orgAlias}.json`);
        this.mappings = {
            objects: {},
            lastUpdated: null,
            version: '1.0.0'
        };

        // Ensure cache directory exists
        if (!fsSync.existsSync(this.options.cacheDir)) {
            fsSync.mkdirSync(this.options.cacheDir, { recursive: true });
        }

        // Load existing mappings
        this.loadMappings();
    }

    /**
     * Load mappings from cache file
     */
    loadMappings() {
        try {
            if (fsSync.existsSync(this.cacheFile)) {
                const content = fsSync.readFileSync(this.cacheFile, 'utf8');
                this.mappings = JSON.parse(content);
                if (this.options.verbose) {
                    console.log(`✓ Loaded field mappings for ${this.orgAlias}`);
                }
            }
        } catch (error) {
            if (this.options.verbose) {
                console.warn(`⚠️  Could not load field mappings: ${error.message}`);
            }
            // Start with empty mappings
        }
    }

    /**
     * Save mappings to cache file
     */
    async saveMappings() {
        try {
            this.mappings.lastUpdated = new Date().toISOString();
            await fs.writeFile(this.cacheFile, JSON.stringify(this.mappings, null, 2), 'utf8');
            if (this.options.verbose) {
                console.log(`✓ Saved field mappings for ${this.orgAlias}`);
            }
        } catch (error) {
            console.error(`❌ Error saving field mappings: ${error.message}`);
        }
    }

    /**
     * Register a known field mapping
     */
    async registerField(objectName, fieldKey, fieldApiName, metadata = {}) {
        if (!this.mappings.objects[objectName]) {
            this.mappings.objects[objectName] = { fields: {} };
        }

        this.mappings.objects[objectName].fields[fieldKey] = {
            apiName: fieldApiName,
            registered: new Date().toISOString(),
            ...metadata
        };

        if (this.options.autoSave) {
            await this.saveMappings();
        }

        return fieldApiName;
    }

    /**
     * Get field API name with auto-discovery
     */
    async getField(objectName, fieldPattern, options = {}) {
        const normalizedPattern = this.normalizeFieldKey(fieldPattern);

        // Check cache first
        if (this.mappings.objects[objectName]?.fields[normalizedPattern]) {
            const cached = this.mappings.objects[objectName].fields[normalizedPattern];
            if (this.options.verbose) {
                console.log(`✓ Found cached field: ${objectName}.${cached.apiName}`);
            }
            return cached.apiName;
        }

        // Not cached, discover field
        if (this.options.verbose) {
            console.log(`🔍 Discovering field: ${objectName}.${fieldPattern}`);
        }

        const discovered = await this.discoverField(objectName, fieldPattern, options);

        if (discovered) {
            // Cache the discovery
            await this.registerField(objectName, normalizedPattern, discovered.apiName, {
                type: discovered.type,
                label: discovered.label,
                discovered: new Date().toISOString()
            });
            return discovered.apiName;
        }

        return null;
    }

    /**
     * Discover field using metadata cache or SF CLI
     */
    async discoverField(objectName, fieldPattern, options = {}) {
        // Try using metadata cache first if available
        if (this.options.useMetadataCache) {
            const metadataCachePath = path.join(__dirname, 'org-metadata-cache.js');
            if (fsSync.existsSync(metadataCachePath)) {
                try {
                    const discovered = await this.discoverViaMetadataCache(objectName, fieldPattern);
                    if (discovered) {
                        return discovered;
                    }
                } catch (error) {
                    if (this.options.verbose) {
                        console.warn(`⚠️  Metadata cache failed: ${error.message}`);
                    }
                }
            }
        }

        // Fallback to SF CLI describe
        return await this.discoverViaCli(objectName, fieldPattern);
    }

    /**
     * Discover field via metadata cache
     */
    async discoverViaMetadataCache(objectName, fieldPattern) {
        try {
            const { execSync } = require('child_process');
            const result = execSync(
                `node ${path.join(__dirname, 'org-metadata-cache.js')} find-field ${this.orgAlias} ${objectName} "${fieldPattern}"`,
                { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            );

            const lines = result.trim().split('\n');
            if (lines.length > 0 && !lines[0].includes('No fields found')) {
                // Parse first match: "FieldName (type) - Label"
                const match = lines[0].match(/^(\S+)\s+\(([^)]+)\)\s+-\s+(.+)$/);
                if (match) {
                    return {
                        apiName: match[1],
                        type: match[2],
                        label: match[3]
                    };
                }
            }
        } catch (error) {
            // Metadata cache not available or failed
        }

        return null;
    }

    /**
     * Discover field via SF CLI
     */
    async discoverViaCli(objectName, fieldPattern) {
        try {
            const result = execSync(
                `sf sobject describe --sobject ${objectName} --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            );

            const describe = JSON.parse(result);
            const fields = describe.result?.fields || [];

            // Try exact match first
            let field = fields.find(f => f.name === fieldPattern);

            // Try case-insensitive match
            if (!field) {
                field = fields.find(f =>
                    f.name.toLowerCase() === fieldPattern.toLowerCase()
                );
            }

            // Try label match
            if (!field) {
                field = fields.find(f =>
                    f.label.toLowerCase() === fieldPattern.toLowerCase()
                );
            }

            // Try partial match
            if (!field) {
                const normalized = fieldPattern.toLowerCase().replace(/[^a-z0-9]/g, '');
                field = fields.find(f =>
                    f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalized) ||
                    f.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalized)
                );
            }

            if (field) {
                return {
                    apiName: field.name,
                    type: field.type,
                    label: field.label
                };
            }
        } catch (error) {
            if (this.options.verbose) {
                console.error(`❌ CLI describe failed: ${error.message}`);
            }
        }

        return null;
    }

    /**
     * Normalize field key for consistent lookups
     */
    normalizeFieldKey(fieldPattern) {
        return fieldPattern
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    /**
     * Get all fields for an object
     */
    async getObjectFields(objectName, refresh = false) {
        if (!refresh && this.mappings.objects[objectName]) {
            return this.mappings.objects[objectName].fields;
        }

        // Refresh from org
        try {
            const result = execSync(
                `sf sobject describe --sobject ${objectName} --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8' }
            );

            const describe = JSON.parse(result);
            const fields = describe.result?.fields || [];

            if (!this.mappings.objects[objectName]) {
                this.mappings.objects[objectName] = { fields: {} };
            }

            for (const field of fields) {
                const key = this.normalizeFieldKey(field.name);
                this.mappings.objects[objectName].fields[key] = {
                    apiName: field.name,
                    type: field.type,
                    label: field.label,
                    discovered: new Date().toISOString()
                };
            }

            if (this.options.autoSave) {
                await this.saveMappings();
            }

            return this.mappings.objects[objectName].fields;
        } catch (error) {
            console.error(`❌ Error getting object fields: ${error.message}`);
            return {};
        }
    }

    /**
     * Batch get multiple fields
     */
    async getFields(fieldRequests) {
        const results = {};

        for (const request of fieldRequests) {
            const { object, field, key } = request;
            const apiName = await this.getField(object, field);
            results[key || field] = apiName;
        }

        return results;
    }

    /**
     * Clear cache for specific object or entire org
     */
    async clearCache(objectName = null) {
        if (objectName) {
            delete this.mappings.objects[objectName];
            console.log(`✓ Cleared cache for ${objectName}`);
        } else {
            this.mappings.objects = {};
            console.log(`✓ Cleared all field mappings for ${this.orgAlias}`);
        }

        if (this.options.autoSave) {
            await this.saveMappings();
        }
    }

    /**
     * Export mappings for sharing/backup
     */
    exportMappings() {
        return JSON.stringify(this.mappings, null, 2);
    }

    /**
     * Import mappings from JSON
     */
    async importMappings(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.mappings = imported;

            if (this.options.autoSave) {
                await this.saveMappings();
            }

            console.log(`✓ Imported field mappings for ${this.orgAlias}`);
        } catch (error) {
            console.error(`❌ Error importing mappings: ${error.message}`);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const objects = Object.keys(this.mappings.objects);
        let totalFields = 0;

        for (const obj of objects) {
            totalFields += Object.keys(this.mappings.objects[obj].fields).length;
        }

        return {
            orgAlias: this.orgAlias,
            objects: objects.length,
            totalFields,
            lastUpdated: this.mappings.lastUpdated,
            cacheFile: this.cacheFile
        };
    }
}

/**
 * Convenience function for quick field lookup
 */
async function getField(orgAlias, objectName, fieldPattern, options = {}) {
    const mapper = new FieldMapper(orgAlias, options);
    return await mapper.getField(objectName, fieldPattern);
}

module.exports = {
    FieldMapper,
    getField
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 3) {
            console.log('Usage:');
            console.log('  field-mapper.js <org-alias> <object> <field-pattern>');
            console.log('  field-mapper.js <org-alias> --stats');
            console.log('  field-mapper.js <org-alias> --clear [object]');
            console.log('');
            console.log('Examples:');
            console.log('  field-mapper.js wedgewood-production Contact "First Touch Campaign"');
            console.log('  field-mapper.js wedgewood-production --stats');
            console.log('  field-mapper.js wedgewood-production --clear Contact');
            process.exit(1);
        }

        const orgAlias = args[0];
        const mapper = new FieldMapper(orgAlias, { verbose: true });

        if (args[1] === '--stats') {
            const stats = mapper.getStats();
            console.log(JSON.stringify(stats, null, 2));
            process.exit(0);
        }

        if (args[1] === '--clear') {
            await mapper.clearCache(args[2] || null);
            process.exit(0);
        }

        const objectName = args[1];
        const fieldPattern = args[2];

        try {
            const apiName = await mapper.getField(objectName, fieldPattern);
            if (apiName) {
                console.log(apiName);
                process.exit(0);
            } else {
                console.error(`Field not found: ${objectName}.${fieldPattern}`);
                process.exit(1);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
