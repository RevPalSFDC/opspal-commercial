#!/usr/bin/env node

/**
 * Report Type Cache Manager
 * 
 * Caches discovered report types and field mappings to avoid repeated API calls.
 * Implements TTL-based expiration and automatic refresh.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ReportTypeCache {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || path.join(process.env.HOME, '.salesforce-cache');
        this.ttl = options.ttl || 24 * 60 * 60 * 1000; // Default 24 hours
        this.org = options.org || process.env.ORG;
        this.cacheFile = null;
    }

    /**
     * Initialize cache directory and files
     */
    async init() {
        // Create cache directory if it doesn't exist
        await fs.mkdir(this.cacheDir, { recursive: true });
        
        // Generate org-specific cache file name
        if (this.org) {
            const orgHash = crypto.createHash('md5').update(this.org).digest('hex').substring(0, 8);
            this.cacheFile = path.join(this.cacheDir, `report-types-${this.org}-${orgHash}.json`);
        } else {
            this.cacheFile = path.join(this.cacheDir, 'report-types-default.json');
        }
        
        return this;
    }

    /**
     * Get cached data if valid
     */
    async get(key) {
        try {
            const cache = await this.loadCache();
            
            if (!cache[key]) {
                return null;
            }
            
            const entry = cache[key];
            const now = Date.now();
            
            // Check if expired
            if (entry.expires && entry.expires < now) {
                delete cache[key];
                await this.saveCache(cache);
                return null;
            }
            
            // Update access time
            entry.lastAccessed = now;
            entry.accessCount = (entry.accessCount || 0) + 1;
            await this.saveCache(cache);
            
            return entry.data;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    /**
     * Set cache entry with TTL
     */
    async set(key, data, ttl = null) {
        const cache = await this.loadCache();
        const now = Date.now();
        
        cache[key] = {
            data: data,
            created: now,
            lastAccessed: now,
            expires: ttl ? now + ttl : now + this.ttl,
            accessCount: 0,
            org: this.org
        };
        
        await this.saveCache(cache);
        return data;
    }

    /**
     * Cache report types discovery
     */
    async cacheReportTypes(reportTypes) {
        const key = 'report_types';
        
        // Build mapping tables for quick lookup
        const uiToApi = {};
        const apiToUi = {};
        const categories = {};
        
        reportTypes.forEach(type => {
            if (type.label) {
                uiToApi[type.label] = type.type;
                apiToUi[type.type] = type.label;
            }
            
            // Categorize
            const category = type.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(type);
        });
        
        const cacheData = {
            timestamp: new Date().toISOString(),
            count: reportTypes.length,
            reportTypes: reportTypes,
            mappings: {
                uiToApi: uiToApi,
                apiToUi: apiToUi
            },
            categories: categories
        };
        
        await this.set(key, cacheData);
        return cacheData;
    }

    /**
     * Cache field description for a report type
     */
    async cacheFieldDescription(reportType, fields) {
        const key = `fields_${reportType}`;
        
        // Build field lookup tables
        const fieldsByToken = {};
        const fieldsByLabel = {};
        const ownerField = this.findOwnerField(fields);
        const dateFields = [];
        
        fields.forEach(field => {
            fieldsByToken[field.token] = field;
            if (field.label) {
                fieldsByLabel[field.label] = field;
            }
            
            if (field.dataType === 'date' || field.dataType === 'datetime') {
                dateFields.push(field.token);
            }
        });
        
        const cacheData = {
            timestamp: new Date().toISOString(),
            reportType: reportType,
            totalFields: fields.length,
            fields: fields,
            lookups: {
                byToken: fieldsByToken,
                byLabel: fieldsByLabel
            },
            ownerField: ownerField,
            dateFields: dateFields
        };
        
        await this.set(key, cacheData);
        return cacheData;
    }

    /**
     * Find the owner field for a report type
     */
    findOwnerField(fields) {
        const ownerPatterns = [
            'FULL_NAME', 'OWNER', 'ASSIGNED', 'CREATED_BY',
            'LEAD_OWNER', 'CONTACT_OWNER', 'ACCOUNT_OWNER', 'CASE_OWNER'
        ];
        
        for (const pattern of ownerPatterns) {
            const field = fields.find(f => f.token === pattern);
            if (field) {
                return field.token;
            }
        }
        
        // Fallback: look for any field with 'owner' in the name
        const ownerField = fields.find(f => 
            f.token.toLowerCase().includes('owner') ||
            f.token.toLowerCase().includes('assigned')
        );
        
        return ownerField ? ownerField.token : null;
    }

    /**
     * Get cached report types
     */
    async getReportTypes() {
        return await this.get('report_types');
    }

    /**
     * Get cached field description
     */
    async getFieldDescription(reportType) {
        return await this.get(`fields_${reportType}`);
    }

    /**
     * Clear cache for specific key or all
     */
    async clear(key = null) {
        if (key) {
            const cache = await this.loadCache();
            delete cache[key];
            await this.saveCache(cache);
        } else {
            // Clear entire cache file
            try {
                await fs.unlink(this.cacheFile);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
        }
    }

    /**
     * Clean expired entries
     */
    async clean() {
        const cache = await this.loadCache();
        const now = Date.now();
        let cleaned = 0;
        
        Object.keys(cache).forEach(key => {
            if (cache[key].expires && cache[key].expires < now) {
                delete cache[key];
                cleaned++;
            }
        });
        
        if (cleaned > 0) {
            await this.saveCache(cache);
        }
        
        return cleaned;
    }

    /**
     * Get cache statistics
     */
    async getStats() {
        const cache = await this.loadCache();
        const now = Date.now();
        
        const stats = {
            totalEntries: Object.keys(cache).length,
            expired: 0,
            active: 0,
            totalSize: 0,
            mostAccessed: null,
            oldestEntry: null,
            newestEntry: null
        };
        
        let maxAccess = 0;
        let oldestTime = now;
        let newestTime = 0;
        
        Object.entries(cache).forEach(([key, entry]) => {
            if (entry.expires && entry.expires < now) {
                stats.expired++;
            } else {
                stats.active++;
            }
            
            // Calculate size (rough estimate)
            stats.totalSize += JSON.stringify(entry).length;
            
            // Find most accessed
            if (entry.accessCount > maxAccess) {
                maxAccess = entry.accessCount;
                stats.mostAccessed = { key, count: entry.accessCount };
            }
            
            // Find oldest/newest
            if (entry.created < oldestTime) {
                oldestTime = entry.created;
                stats.oldestEntry = { key, created: new Date(entry.created).toISOString() };
            }
            if (entry.created > newestTime) {
                newestTime = entry.created;
                stats.newestEntry = { key, created: new Date(entry.created).toISOString() };
            }
        });
        
        stats.sizeKB = Math.round(stats.totalSize / 1024);
        
        return stats;
    }

    /**
     * Load cache from file
     */
    async loadCache() {
        if (!this.cacheFile) {
            await this.init();
        }
        
        try {
            const data = await fs.readFile(this.cacheFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }

    /**
     * Save cache to file
     */
    async saveCache(cache) {
        if (!this.cacheFile) {
            await this.init();
        }
        
        await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
    }

    /**
     * Export cache for debugging
     */
    async export() {
        const cache = await this.loadCache();
        const exportData = {
            org: this.org,
            cacheFile: this.cacheFile,
            ttl: this.ttl,
            exported: new Date().toISOString(),
            entries: cache
        };
        
        const exportFile = path.join(this.cacheDir, `export-${Date.now()}.json`);
        await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
        
        return exportFile;
    }
}

// CLI interface
async function main() {
    const command = process.argv[2];
    const org = process.env.ORG;
    
    if (!command) {
        console.log(`
Report Type Cache Manager

Usage:
  node report-type-cache.js stats              Show cache statistics
  node report-type-cache.js clean              Clean expired entries
  node report-type-cache.js clear [key]        Clear specific key or all
  node report-type-cache.js export             Export cache for debugging
  node report-type-cache.js get <key>          Get cached value
  
Environment:
  ORG=${org || 'not set'}
  Cache Dir: ${path.join(process.env.HOME, '.salesforce-cache')}
`);
        return;
    }
    
    const cache = await new ReportTypeCache({ org }).init();
    
    switch (command) {
        case 'stats':
            const stats = await cache.getStats();
            console.log('Cache Statistics:');
            console.log(JSON.stringify(stats, null, 2));
            break;
            
        case 'clean':
            const cleaned = await cache.clean();
            console.log(`Cleaned ${cleaned} expired entries`);
            break;
            
        case 'clear':
            const key = process.argv[3];
            await cache.clear(key);
            console.log(key ? `Cleared key: ${key}` : 'Cleared all cache');
            break;
            
        case 'export':
            const file = await cache.export();
            console.log(`Cache exported to: ${file}`);
            break;
            
        case 'get':
            const getKey = process.argv[3];
            if (!getKey) {
                console.error('Key required for get command');
                process.exit(1);
            }
            const value = await cache.get(getKey);
            if (value) {
                console.log(JSON.stringify(value, null, 2));
            } else {
                console.log(`No cached value for key: ${getKey}`);
            }
            break;
            
        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ReportTypeCache;