#!/usr/bin/env node

/**
 * HubSpot Metadata Cache
 *
 * Caches portal metadata for instant lookups to dramatically speed up
 * property and workflow discovery operations.
 *
 * Adapted from SFDC org-metadata-cache.js
 *
 * Usage:
 *   node scripts/lib/hubspot-metadata-cache.js init <portal-name>
 *   node scripts/lib/hubspot-metadata-cache.js info <portal-name>
 *   node scripts/lib/hubspot-metadata-cache.js query <portal-name> <object-type>
 *   node scripts/lib/hubspot-metadata-cache.js find-property <portal-name> <object-type> <pattern>
 *   node scripts/lib/hubspot-metadata-cache.js refresh <portal-name>
 */

const fs = require('fs');
const path = require('path');
const { DataAccessError } = require('../../../../opspal-core/cross-platform-plugin/scripts/lib/data-access-error');

class HubSpotMetadataCache {
    constructor(portalName) {
        this.portalName = portalName;
        this.cacheDir = path.join(__dirname, '../../.cache/metadata');
        this.cachePath = path.join(this.cacheDir, `${portalName}.json`);
        this.cache = this.loadCache();
    }

    loadCache() {
        if (fs.existsSync(this.cachePath)) {
            return JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        }

        return {
            portalName: this.portalName,
            properties: {
                contacts: [],
                companies: [],
                deals: [],
                tickets: []
            },
            workflows: [],
            lists: [],
            pipelines: {},
            lastUpdated: null,
            version: '1.0.0'
        };
    }

    saveCache() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        this.cache.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    }

    async initCache() {
        console.log(`🚀 Initializing metadata cache for: ${this.portalName}`);
        console.log('This may take 5-10 minutes for large portals...\n');

        try {
            await this.cacheProperties('contacts');
            await this.cacheProperties('companies');
            await this.cacheProperties('deals');
            await this.cacheProperties('tickets');
            await this.cacheWorkflows();
            await this.cacheLists();
            await this.cachePipelines();

            this.saveCache();
            console.log('\n✅ Metadata cache initialized successfully');
            this.printCacheInfo();
        } catch (error) {
            console.error('❌ Error initializing cache:', error.message);
            throw error;
        }
    }

    async cacheProperties(objectType) {
        console.log(`  📋 Caching ${objectType} properties...`);

        // Fail-fast: Throw error instead of silently caching empty data
        throw new DataAccessError(
            'HubSpot_Properties_API',
            `cacheProperties not yet implemented for ${objectType}`,
            {
                objectType,
                operation: 'cache_properties',
                status: 'not_implemented',
                recommendation: 'Implement using @hubspot/api-client to fetch properties',
                tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
        );
    }

    async cacheWorkflows() {
        console.log('  ⚙️  Caching workflows...');

        // Fail-fast: Throw error instead of silently caching empty data
        throw new DataAccessError(
            'HubSpot_Workflows_API',
            'cacheWorkflows not yet implemented',
            {
                operation: 'cache_workflows',
                status: 'not_implemented',
                recommendation: 'Implement using @hubspot/api-client to fetch workflows',
                tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
        );
    }

    async cacheLists() {
        console.log('  📝 Caching lists...');

        // Fail-fast: Throw error instead of silently caching empty data
        throw new DataAccessError(
            'HubSpot_Lists_API',
            'cacheLists not yet implemented',
            {
                operation: 'cache_lists',
                status: 'not_implemented',
                recommendation: 'Implement using @hubspot/api-client to fetch lists',
                tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
        );
    }

    async cachePipelines() {
        console.log('  🔄 Caching pipelines...');

        // Fail-fast: Throw error instead of silently caching empty data
        throw new DataAccessError(
            'HubSpot_Pipelines_API',
            'cachePipelines not yet implemented',
            {
                operation: 'cache_pipelines',
                status: 'not_implemented',
                recommendation: 'Implement using @hubspot/api-client to fetch pipelines',
                tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
        );
    }

    findProperty(objectType, pattern) {
        const properties = this.cache.properties[objectType] || [];
        const regex = new RegExp(pattern, 'i');

        const matches = properties.filter(prop =>
            regex.test(prop.name) || regex.test(prop.label)
        );

        return matches;
    }

    getProperty(objectType, propertyName) {
        const properties = this.cache.properties[objectType] || [];
        return properties.find(prop => prop.name === propertyName);
    }

    getObjectMetadata(objectType) {
        return {
            objectType,
            properties: this.cache.properties[objectType] || [],
            count: (this.cache.properties[objectType] || []).length
        };
    }

    printCacheInfo() {
        console.log('\n📊 Cache Information');
        console.log('====================\n');
        console.log(`Portal: ${this.cache.portalName}`);
        console.log(`Last Updated: ${this.cache.lastUpdated || 'Never'}`);
        console.log(`Version: ${this.cache.version}\n`);

        console.log('Properties Cached:');
        Object.entries(this.cache.properties).forEach(([objectType, props]) => {
            console.log(`  - ${objectType}: ${props.length} properties`);
        });

        console.log(`\nWorkflows: ${this.cache.workflows.length}`);
        console.log(`Lists: ${this.cache.lists.length}`);

        const pipelineCount = Object.values(this.cache.pipelines).reduce((sum, pipelines) =>
            sum + (Array.isArray(pipelines) ? pipelines.length : 0), 0
        );
        console.log(`Pipelines: ${pipelineCount}`);
    }

    queryCache(objectType, propertyName = null) {
        if (propertyName) {
            const property = this.getProperty(objectType, propertyName);
            if (property) {
                console.log(JSON.stringify(property, null, 2));
            } else {
                console.log(`Property not found: ${propertyName}`);
                process.exit(1);
            }
        } else {
            const metadata = this.getObjectMetadata(objectType);
            console.log(JSON.stringify(metadata, null, 2));
        }
    }

    async refreshCache() {
        console.log(`🔄 Refreshing metadata cache for: ${this.portalName}`);
        await this.initCache();
    }

    getCacheAge() {
        if (!this.cache.lastUpdated) {
            return null;
        }

        const lastUpdate = new Date(this.cache.lastUpdated);
        const now = new Date();
        const ageMs = now - lastUpdate;
        const ageHours = ageMs / (1000 * 60 * 60);
        const ageDays = ageHours / 24;

        if (ageDays > 1) {
            return `${ageDays.toFixed(1)} days`;
        } else if (ageHours > 1) {
            return `${ageHours.toFixed(1)} hours`;
        } else {
            return `${(ageMs / (1000 * 60)).toFixed(0)} minutes`;
        }
    }

    isCacheStale(maxAgeDays = 7) {
        if (!this.cache.lastUpdated) {
            return true;
        }

        const lastUpdate = new Date(this.cache.lastUpdated);
        const now = new Date();
        const ageDays = (now - lastUpdate) / (1000 * 60 * 60 * 24);

        return ageDays > maxAgeDays;
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const portalName = args[1];

    if (!command || !portalName) {
        console.log('Usage:');
        console.log('  node hubspot-metadata-cache.js init <portal-name>');
        console.log('  node hubspot-metadata-cache.js info <portal-name>');
        console.log('  node hubspot-metadata-cache.js query <portal-name> <object-type> [property-name]');
        console.log('  node hubspot-metadata-cache.js find-property <portal-name> <object-type> <pattern>');
        console.log('  node hubspot-metadata-cache.js refresh <portal-name>');
        console.log('\nExamples:');
        console.log('  node hubspot-metadata-cache.js init production');
        console.log('  node hubspot-metadata-cache.js query production contacts email');
        console.log('  node hubspot-metadata-cache.js find-property production contacts "lead.*score"');
        process.exit(1);
    }

    const cache = new HubSpotMetadataCache(portalName);

    try {
        switch (command) {
            case 'init':
                await cache.initCache();
                break;

            case 'info':
                cache.printCacheInfo();
                const age = cache.getCacheAge();
                if (age) {
                    console.log(`\nCache age: ${age}`);
                    if (cache.isCacheStale()) {
                        console.log('⚠️  Cache is stale (>7 days). Consider refreshing.');
                    }
                } else {
                    console.log('\n⚠️  Cache not initialized. Run: init <portal-name>');
                }
                break;

            case 'query': {
                const objectType = args[2];
                const propertyName = args[3];
                if (!objectType) {
                    console.error('❌ Object type required');
                    process.exit(1);
                }
                cache.queryCache(objectType, propertyName);
                break;
            }

            case 'find-property': {
                const objectType = args[2];
                const pattern = args[3];
                if (!objectType || !pattern) {
                    console.error('❌ Object type and pattern required');
                    process.exit(1);
                }
                const matches = cache.findProperty(objectType, pattern);
                if (matches.length > 0) {
                    console.log(`Found ${matches.length} matching properties:\n`);
                    matches.forEach(prop => {
                        console.log(`  - ${prop.name} (${prop.type})`);
                        console.log(`    Label: ${prop.label}`);
                    });
                } else {
                    console.log(`No properties found matching pattern: ${pattern}`);
                }
                break;
            }

            case 'refresh':
                await cache.refreshCache();
                break;

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { HubSpotMetadataCache };
