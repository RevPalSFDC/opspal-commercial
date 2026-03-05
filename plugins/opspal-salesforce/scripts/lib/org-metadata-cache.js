#!/usr/bin/env node

/**
 * Org Metadata Cache System
 *
 * Purpose: Fast, local metadata access to prevent query failures and speed up investigations
 *
 * Features:
 * - Full org metadata snapshot (objects, fields, validation rules, record types, etc.)
 * - Local JSON cache storage per org
 * - Instant field lookups
 * - SOQL validation before execution
 * - Fuzzy matching for field suggestions
 *
 * Usage:
 *   node org-metadata-cache.js init <org-alias>           # Initialize cache
 *   node org-metadata-cache.js refresh <org-alias>        # Refresh cache
 *   node org-metadata-cache.js query <org-alias> <object> [field]  # Query cache
 *   node org-metadata-cache.js validate-query <org-alias> <soql>   # Validate SOQL
 *   node org-metadata-cache.js find-field <org-alias> <object> <pattern>  # Fuzzy search
 *   node org-metadata-cache.js info <org-alias>           # Cache statistics
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import PathResolver from opspal-core for unified path resolution
let PathResolver;
try {
    PathResolver = require('../../../opspal-core/scripts/lib/path-resolver').PathResolver;
} catch (e) {
    // Fallback if opspal-core not available
    PathResolver = null;
}

const CACHE_VERSION = '1.0.0';

// Live-first mode - validate cache against live org, use cache only as fallback
// Set METADATA_LIVE_FIRST=false to use cache-first behavior (not recommended)
const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.METADATA_LIVE_FIRST !== 'false';

class OrgMetadataCache {
    constructor(orgAlias, instancePath = null, options = {}) {
        this.orgAlias = orgAlias;
        this.liveFirst = options.liveFirst !== undefined ? options.liveFirst : LIVE_FIRST;

        // Find instance directory using unified path resolution
        if (instancePath) {
            this.instanceDir = instancePath;
        } else {
            this.instanceDir = this._resolveInstancePath(orgAlias);
        }

        this.cacheDir = path.join(this.instanceDir, '.metadata-cache');
        this.cacheFile = path.join(this.cacheDir, 'metadata.json');
        this.cache = null;
        this.cacheLoadedAt = null;
    }

    /**
     * Resolve instance path using PathResolver (org-centric first, then legacy)
     * @private
     */
    _resolveInstancePath(orgAlias) {
        const verbose = process.env.PATH_RESOLVER_VERBOSE === '1';

        // Priority 1: Environment variable override
        if (process.env.INSTANCE_PATH && fs.existsSync(process.env.INSTANCE_PATH)) {
            if (verbose) console.log(`[OrgMetadataCache] Using INSTANCE_PATH: ${process.env.INSTANCE_PATH}`);
            return process.env.INSTANCE_PATH;
        }

        // Priority 2: Try PathResolver from opspal-core (prefers org-centric)
        if (PathResolver) {
            try {
                const resolver = new PathResolver({ verbose });
                const orgSlug = process.env.ORG_SLUG || this._deriveOrgSlug(orgAlias);

                // Try org-centric path
                const orgCentricPath = resolver.getOrgCentricPath(orgSlug, 'salesforce', orgAlias);
                if (fs.existsSync(orgCentricPath)) {
                    if (verbose) console.log(`[OrgMetadataCache] Found org-centric: ${orgCentricPath}`);
                    return orgCentricPath;
                }

                // Try alternative org-centric with different instance name patterns
                const altPath = resolver.getOrgCentricPath(orgSlug, 'salesforce', 'production');
                if (fs.existsSync(altPath)) {
                    if (verbose) console.log(`[OrgMetadataCache] Found org-centric (production): ${altPath}`);
                    return altPath;
                }

                // Check if orgs/{slug}/platforms/salesforce exists at all
                const platformPath = path.join(process.cwd(), 'orgs', orgSlug, 'platforms', 'salesforce');
                if (fs.existsSync(platformPath)) {
                    // Use the first instance found, or create new one named after alias
                    const instances = fs.readdirSync(platformPath).filter(f =>
                        fs.statSync(path.join(platformPath, f)).isDirectory() && !f.startsWith('.')
                    );
                    if (instances.length > 0) {
                        const foundPath = path.join(platformPath, instances[0]);
                        if (verbose) console.log(`[OrgMetadataCache] Found org-centric instance: ${foundPath}`);
                        return foundPath;
                    }
                    // Create new instance directory
                    const newPath = path.join(platformPath, orgAlias);
                    if (verbose) console.log(`[OrgMetadataCache] Creating org-centric: ${newPath}`);
                    return newPath;
                }
            } catch (e) {
                if (verbose) console.log(`[OrgMetadataCache] PathResolver error: ${e.message}`);
            }
        }

        // Priority 3: Legacy - check instances/{org} in project root
        const legacyPaths = [
            path.join(process.cwd(), 'instances', orgAlias),
            path.join(process.cwd(), 'instances', 'salesforce', orgAlias),
            path.join(__dirname, '../../instances', orgAlias)
        ];

        for (const legacyPath of legacyPaths) {
            if (fs.existsSync(legacyPath)) {
                if (verbose) console.log(`[OrgMetadataCache] Found legacy: ${legacyPath}`);
                return legacyPath;
            }
        }

        // Priority 4: Legacy - search instances/ for matching org alias config
        const baseDir = path.join(__dirname, '../../instances');
        if (fs.existsSync(baseDir)) {
            try {
                const instanceDirs = fs.readdirSync(baseDir);
                for (const dir of instanceDirs) {
                    const configPath = path.join(baseDir, dir, '.instance-config.json');
                    if (fs.existsSync(configPath)) {
                        try {
                            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                            if (config.orgAlias === orgAlias) {
                                if (verbose) console.log(`[OrgMetadataCache] Found via config: ${path.join(baseDir, dir)}`);
                                return path.join(baseDir, dir);
                            }
                        } catch (e) { /* ignore parse errors */ }
                    }
                }
            } catch (e) { /* ignore read errors */ }
        }

        // Priority 5: Current working directory if it's an instance
        if (process.cwd().includes('/instances/')) {
            const instancePath = process.cwd().split('/instances/')[0] + '/instances/' +
                                process.cwd().split('/instances/')[1].split('/')[0];
            if (fs.existsSync(instancePath)) {
                if (verbose) console.log(`[OrgMetadataCache] Using cwd instance: ${instancePath}`);
                return instancePath;
            }
        }

        // Fallback: Use org-centric structure if ORG_SLUG is set, else legacy
        const orgSlug = process.env.ORG_SLUG;
        if (orgSlug) {
            const newPath = path.join(process.cwd(), 'orgs', orgSlug, 'platforms', 'salesforce', orgAlias);
            console.warn(`[OrgMetadataCache] Creating new org-centric path: ${newPath}`);
            return newPath;
        }

        // Ultimate fallback: legacy path
        const fallbackPath = path.join(__dirname, '../../instances', orgAlias);
        console.warn(`[OrgMetadataCache] Warning: Using fallback path for ${orgAlias}: ${fallbackPath}`);
        return fallbackPath;
    }

    /**
     * Derive org slug from org alias
     * @private
     */
    _deriveOrgSlug(orgAlias) {
        // Common patterns: acme-production -> acme, my-org-sandbox -> my-org
        const envSuffixes = ['production', 'prod', 'sandbox', 'sb', 'dev', 'test', 'staging', 'uat', 'main'];
        const parts = orgAlias.toLowerCase().split('-');

        if (parts.length > 1 && envSuffixes.includes(parts[parts.length - 1])) {
            return parts.slice(0, -1).join('-');
        }

        // Return as-is if no environment suffix found
        return orgAlias.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    /**
     * Initialize cache directory
     */
    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Execute SF CLI command and return JSON result
     */
    execSfCommand(command) {
        try {
            const result = execSync(command, {
                encoding: 'utf8',
                maxBuffer: 50 * 1024 * 1024, // 50MB buffer
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return JSON.parse(result);
        } catch (error) {
            console.error(`Error executing: ${command}`);
            console.error(error.message);
            if (error.stdout) {
                console.error('STDOUT:', error.stdout);
            }
            return null;
        }
    }

    /**
     * Build complete metadata cache
     */
    async buildCache() {
        console.log(`\n🔍 Building metadata cache for ${this.orgAlias}...`);
        console.log(`Cache location: ${this.cacheDir}\n`);

        this.ensureCacheDir();

        const cache = {
            version: CACHE_VERSION,
            orgAlias: this.orgAlias,
            timestamp: new Date().toISOString(),
            objects: {}
        };

        // Step 1: Get all objects
        console.log('📦 Fetching object list...');
        const objectsResult = this.execSfCommand(
            `sf sobject list --sobject ALL --json --target-org ${this.orgAlias}`
        );

        if (!objectsResult || !objectsResult.result) {
            throw new Error('Failed to fetch object list');
        }

        const objects = objectsResult.result;
        console.log(`   Found ${objects.length} objects\n`);

        // Step 2: Describe each object (with progress)
        console.log('📋 Describing objects and fields...');
        let processed = 0;
        const total = objects.length;

        for (const obj of objects) {
            processed++;
            if (processed % 10 === 0 || processed === total) {
                process.stdout.write(`\r   Progress: ${processed}/${total} (${Math.round(processed/total*100)}%)`);
            }

            const describe = this.execSfCommand(
                `sf sobject describe --sobject ${obj} --json --target-org ${this.orgAlias}`
            );

            if (!describe || !describe.result) {
                console.warn(`\n   ⚠️  Skipping ${obj} - describe failed`);
                continue;
            }

            const objectData = describe.result;

            cache.objects[obj] = {
                label: objectData.label,
                labelPlural: objectData.labelPlural,
                custom: objectData.custom,
                createable: objectData.createable,
                updateable: objectData.updateable,
                deletable: objectData.deletable,
                queryable: objectData.queryable,
                fields: {},
                recordTypes: [],
                validationRules: []
            };

            // Store field metadata
            for (const field of objectData.fields) {
                cache.objects[obj].fields[field.name] = {
                    label: field.label,
                    type: field.type,
                    length: field.length,
                    precision: field.precision,
                    scale: field.scale,
                    nillable: field.nillable,
                    defaultValue: field.defaultValue,
                    custom: field.custom,
                    createable: field.createable,
                    updateable: field.updateable,
                    picklistValues: field.picklistValues || [],
                    referenceTo: field.referenceTo || [],
                    relationshipName: field.relationshipName,
                    calculated: field.calculated,
                    formulaTreatBlanksAs: field.formulaTreatBlanksAs
                };
            }

            // Store record types
            if (objectData.recordTypeInfos && objectData.recordTypeInfos.length > 0) {
                cache.objects[obj].recordTypes = objectData.recordTypeInfos.map(rt => ({
                    recordTypeId: rt.recordTypeId,
                    name: rt.name,
                    developerName: rt.developerName,
                    available: rt.available,
                    defaultRecordTypeMapping: rt.defaultRecordTypeMapping,
                    master: rt.master
                }));
            }
        }

        console.log('\n');

        // Step 3: Get validation rules via Tooling API
        console.log('✅ Fetching validation rules...');
        const validationResult = this.execSfCommand(
            `sf data query --query "SELECT Id, ValidationName, EntityDefinitionId, Active, Description FROM ValidationRule WHERE Active = true" --use-tooling-api --json --target-org ${this.orgAlias}`
        );

        if (validationResult && validationResult.result && validationResult.result.records) {
            for (const rule of validationResult.result.records) {
                const objName = rule.EntityDefinitionId;
                if (cache.objects[objName]) {
                    cache.objects[objName].validationRules.push({
                        id: rule.Id,
                        name: rule.ValidationName,
                        active: rule.Active,
                        description: rule.Description
                    });
                }
            }
            console.log(`   Found ${validationResult.result.records.length} validation rules\n`);
        }

        // Step 4: Get Lead conversion settings if available
        console.log('🔄 Checking Lead conversion settings...');
        try {
            const leadConvertPath = path.join(this.cacheDir, 'LeadConvertSettings.xml');
            execSync(
                `sf project retrieve start --metadata LeadConvertSettings --target-org ${this.orgAlias} --output-dir ${this.cacheDir}`,
                { stdio: 'ignore' }
            );

            // Find the retrieved file
            const findResult = execSync(
                `find ${this.cacheDir} -name "*.LeadConvertSetting-meta.xml"`,
                { encoding: 'utf8' }
            ).trim();

            if (findResult) {
                const content = fs.readFileSync(findResult, 'utf8');
                cache.leadConvertSettings = content;
                console.log('   ✓ Lead conversion settings cached\n');
            }
        } catch (error) {
            console.log('   ℹ️  No Lead conversion settings found\n');
        }

        // Save cache
        console.log('💾 Saving cache...');
        fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));

        // Generate summary
        const summary = this.generateSummary(cache);
        fs.writeFileSync(
            path.join(this.cacheDir, 'summary.txt'),
            summary
        );

        console.log('✅ Cache build complete!\n');
        console.log(summary);

        return cache;
    }

    /**
     * Load cache from disk
     * @param {Object} options - Load options
     * @param {boolean} options.useCacheFirst - Force cache-first for this call (for fallback)
     */
    loadCache(options = {}) {
        // In live-first mode with existing cache, warn about staleness
        if (this.liveFirst && !options.useCacheFirst && this.cache) {
            const cacheAge = this.cacheLoadedAt ? Date.now() - this.cacheLoadedAt : null;
            if (cacheAge && cacheAge > 3600000) { // 1 hour
                console.warn(`[OrgMetadataCache] Cache is ${Math.round(cacheAge / 60000)} minutes old. Consider running 'refresh' for current data.`);
            }
        }

        if (this.cache) {
            return this.cache;
        }

        if (!fs.existsSync(this.cacheFile)) {
            throw new Error(`Cache not found for ${this.orgAlias}. Run: node org-metadata-cache.js init ${this.orgAlias}`);
        }

        this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        this.cacheLoadedAt = Date.now();
        return this.cache;
    }

    /**
     * Load cache as fallback (bypasses live-first warnings)
     * Use this when live query fails and you need cached data
     */
    loadCacheFallback() {
        return this.loadCache({ useCacheFirst: true });
    }

    /**
     * Check if cache should be refreshed (in live-first mode)
     * @returns {boolean} True if refresh is recommended
     */
    shouldRefresh() {
        if (!this.liveFirst) return false;
        if (!this.cache) return true;

        const cacheTimestamp = this.cache.timestamp ? new Date(this.cache.timestamp).getTime() : 0;
        const cacheAge = Date.now() - cacheTimestamp;

        // Recommend refresh if cache is older than 1 hour
        return cacheAge > 3600000;
    }

    /**
     * Query cache for object/field information
     */
    query(objectName, fieldName = null) {
        const cache = this.loadCache();

        if (!objectName) {
            // List all objects
            return Object.keys(cache.objects).sort();
        }

        if (!cache.objects[objectName]) {
            throw new Error(`Object '${objectName}' not found in cache. Did you mean: ${this.suggestObject(objectName)}?`);
        }

        if (!fieldName) {
            // Return object metadata
            return cache.objects[objectName];
        }

        if (!cache.objects[objectName].fields[fieldName]) {
            throw new Error(`Field '${fieldName}' not found on ${objectName}. Did you mean: ${this.suggestField(objectName, fieldName)}?`);
        }

        return cache.objects[objectName].fields[fieldName];
    }

    /**
     * Find field by pattern (fuzzy search)
     */
    findField(objectName, pattern) {
        const cache = this.loadCache();

        if (!cache.objects[objectName]) {
            throw new Error(`Object '${objectName}' not found`);
        }

        const fields = Object.keys(cache.objects[objectName].fields);
        const regex = new RegExp(pattern, 'i');

        return fields.filter(f => regex.test(f)).map(f => ({
            name: f,
            ...cache.objects[objectName].fields[f]
        }));
    }

    /**
     * Validate SOQL query against cache
     */
    validateQuery(soql) {
        const cache = this.loadCache();
        const errors = [];
        const warnings = [];

        // Extract object name from query
        const fromMatch = soql.match(/FROM\s+(\w+)/i);
        if (!fromMatch) {
            errors.push('Could not parse object name from query');
            return { valid: false, errors, warnings };
        }

        const objectName = fromMatch[1];

        if (!cache.objects[objectName]) {
            errors.push(`Object '${objectName}' does not exist. Did you mean: ${this.suggestObject(objectName)}?`);
            return { valid: false, errors, warnings };
        }

        // Extract field names from SELECT
        const selectMatch = soql.match(/SELECT\s+(.*?)\s+FROM/i);
        if (!selectMatch) {
            errors.push('Could not parse fields from query');
            return { valid: false, errors, warnings };
        }

        const fieldsPart = selectMatch[1];
        const fields = fieldsPart.split(',').map(f => {
            // Handle relationship fields like Account.Name
            const parts = f.trim().split('.');
            return parts[parts.length - 1].trim();
        });

        // Validate each field
        for (const field of fields) {
            // Skip COUNT(), functions, etc.
            if (field.includes('(') || field === '*') {
                continue;
            }

            if (!cache.objects[objectName].fields[field]) {
                errors.push(`Field '${field}' does not exist on ${objectName}. Did you mean: ${this.suggestField(objectName, field)}?`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Suggest similar object name
     */
    suggestObject(name) {
        const cache = this.loadCache();
        const objects = Object.keys(cache.objects);
        return this.findSimilar(name, objects);
    }

    /**
     * Suggest similar field name
     */
    suggestField(objectName, fieldName) {
        const cache = this.loadCache();
        if (!cache.objects[objectName]) {
            return 'N/A';
        }
        const fields = Object.keys(cache.objects[objectName].fields);
        return this.findSimilar(fieldName, fields);
    }

    /**
     * Simple fuzzy match using Levenshtein distance
     */
    findSimilar(target, candidates) {
        const scores = candidates.map(c => ({
            name: c,
            score: this.levenshtein(target.toLowerCase(), c.toLowerCase())
        }));

        scores.sort((a, b) => a.score - b.score);
        return scores.slice(0, 3).map(s => s.name).join(', ');
    }

    /**
     * Levenshtein distance for fuzzy matching
     */
    levenshtein(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
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

        return matrix[b.length][a.length];
    }

    /**
     * Generate cache summary
     */
    generateSummary(cache) {
        const objects = Object.keys(cache.objects);
        let totalFields = 0;
        let customObjects = 0;
        let standardObjects = 0;
        let totalValidationRules = 0;

        for (const obj of objects) {
            const objData = cache.objects[obj];
            totalFields += Object.keys(objData.fields).length;
            if (objData.custom) {
                customObjects++;
            } else {
                standardObjects++;
            }
            totalValidationRules += objData.validationRules.length;
        }

        return `
Metadata Cache Summary
=====================
Org: ${cache.orgAlias}
Cached: ${cache.timestamp}
Version: ${cache.version}

Statistics:
- Total Objects: ${objects.length}
  - Standard: ${standardObjects}
  - Custom: ${customObjects}
- Total Fields: ${totalFields}
- Validation Rules: ${totalValidationRules}
- Lead Conversion Settings: ${cache.leadConvertSettings ? 'Yes' : 'No'}

Cache Location: ${this.cacheFile}
        `.trim();
    }

    /**
     * Get cache info/statistics
     */
    getInfo() {
        const cache = this.loadCache();
        return this.generateSummary(cache);
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const orgAlias = args[1];

    if (!command || (command !== 'help' && !orgAlias)) {
        console.log(`
Org Metadata Cache System
========================

Usage:
  node org-metadata-cache.js init <org-alias>                    Initialize cache
  node org-metadata-cache.js refresh <org-alias>                 Refresh cache
  node org-metadata-cache.js query <org-alias> <object> [field]  Query cache
  node org-metadata-cache.js validate-query <org-alias> "<soql>" Validate SOQL
  node org-metadata-cache.js find-field <org-alias> <obj> <pat>  Find fields
  node org-metadata-cache.js info <org-alias>                    Cache info
  node org-metadata-cache.js help                                Show this help

Examples:
  node org-metadata-cache.js init beta-production
  node org-metadata-cache.js query beta-production Lead
  node org-metadata-cache.js query beta-production Contact Type__c
  node org-metadata-cache.js validate-query beta-production "SELECT Id, Name FROM Account"
  node org-metadata-cache.js find-field beta-production Contact Practice
        `);
        process.exit(1);
    }

    try {
        const cache = new OrgMetadataCache(orgAlias);

        switch (command) {
            case 'init':
            case 'refresh':
                await cache.buildCache();
                break;

            case 'query':
                const objectName = args[2];
                const fieldName = args[3];
                const result = cache.query(objectName, fieldName);
                console.log(JSON.stringify(result, null, 2));
                break;

            case 'validate-query':
                const soql = args[2];
                const validation = cache.validateQuery(soql);
                if (validation.valid) {
                    console.log('✅ Query is valid');
                } else {
                    console.log('❌ Query has errors:\n');
                    validation.errors.forEach(e => console.log(`  - ${e}`));
                }
                if (validation.warnings.length > 0) {
                    console.log('\n⚠️  Warnings:');
                    validation.warnings.forEach(w => console.log(`  - ${w}`));
                }
                process.exit(validation.valid ? 0 : 1);
                break;

            case 'find-field':
                const obj = args[2];
                const pattern = args[3];
                const matches = cache.findField(obj, pattern);
                console.log(`Found ${matches.length} matching fields:\n`);
                matches.forEach(m => {
                    console.log(`  ${m.name} (${m.type}) - ${m.label}`);
                });
                break;

            case 'info':
                console.log(cache.getInfo());
                break;

            case 'help':
                // Already handled above
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = OrgMetadataCache;