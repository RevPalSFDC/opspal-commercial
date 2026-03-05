#!/usr/bin/env node

/**
 * RecordType Resolver
 * 
 * Resolves RecordType labels to IDs for report filters
 * and caches mappings for performance.
 */

const ReportTypeCache = require('./report-type-cache');

class RecordTypeResolver {
    constructor(api) {
        this.api = api; // ReportsRestAPI instance
        this.apiVersion = api.apiVersion || 'v64.0';
        this.cache = new Map(); // In-memory cache
        this.persistentCache = null;
    }

    /**
     * Initialize with persistent cache
     */
    async init() {
        this.persistentCache = await new ReportTypeCache({ 
            org: this.api.org 
        }).init();
        
        // Load cached RecordTypes
        const cached = await this.persistentCache.get('recordtypes');
        if (cached) {
            // Populate in-memory cache
            for (const [key, value] of Object.entries(cached)) {
                this.cache.set(key, value);
            }
        }
        
        return this;
    }

    /**
     * Get RecordTypes for an object
     */
    async getRecordTypes(objectName) {
        const cacheKey = `recordtypes_${objectName}`;
        
        // Check in-memory cache
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        // Check persistent cache
        if (this.persistentCache) {
            const cached = await this.persistentCache.get(cacheKey);
            if (cached) {
                this.cache.set(cacheKey, cached);
                return cached;
            }
        }
        
        // Fetch from API
        try {
            const query = `SELECT Id, Name, DeveloperName, SObjectType, IsActive 
                          FROM RecordType 
                          WHERE SObjectType = '${objectName}' 
                          AND IsActive = true`;
            
            const endpoint = `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(query)}`;
            const result = await this.api.apiRequest(endpoint);
            
            const recordTypes = {};
            const labelToId = {};
            const devNameToId = {};
            
            for (const rt of result.records) {
                recordTypes[rt.Id] = {
                    id: rt.Id,
                    name: rt.Name,
                    developerName: rt.DeveloperName,
                    object: rt.SObjectType,
                    active: rt.IsActive
                };
                
                // Create lookup maps
                labelToId[rt.Name] = rt.Id;
                devNameToId[rt.DeveloperName] = rt.Id;
            }
            
            const data = {
                recordTypes,
                labelToId,
                devNameToId,
                count: result.records.length,
                object: objectName
            };
            
            // Cache the results
            this.cache.set(cacheKey, data);
            if (this.persistentCache) {
                await this.persistentCache.set(cacheKey, data);
            }
            
            return data;
            
        } catch (error) {
            console.warn(`Failed to fetch RecordTypes for ${objectName}: ${error.message}`);
            return {
                recordTypes: {},
                labelToId: {},
                devNameToId: {},
                count: 0,
                object: objectName,
                error: error.message
            };
        }
    }

    /**
     * Resolve RecordType label to ID
     */
    async resolveRecordTypeId(objectName, labelOrDevName) {
        const data = await this.getRecordTypes(objectName);
        
        // Try label first
        if (data.labelToId[labelOrDevName]) {
            return data.labelToId[labelOrDevName];
        }
        
        // Try developer name
        if (data.devNameToId[labelOrDevName]) {
            return data.devNameToId[labelOrDevName];
        }
        
        // Try case-insensitive match
        for (const [label, id] of Object.entries(data.labelToId)) {
            if (label.toLowerCase() === labelOrDevName.toLowerCase()) {
                return id;
            }
        }
        
        return null;
    }

    /**
     * Fix RecordType filters in report metadata
     */
    async fixRecordTypeFilters(reportMetadata) {
        if (!reportMetadata.reportFilters) {
            return reportMetadata;
        }
        
        const fixed = { ...reportMetadata };
        fixed.reportFilters = await Promise.all(
            reportMetadata.reportFilters.map(async (filter) => {
                // Check if this is a RecordType filter
                if (filter.column?.toLowerCase().includes('recordtype')) {
                    // Extract object name from report type or filter context
                    const objectName = await this.inferObjectFromFilter(filter, reportMetadata);
                    
                    if (objectName && filter.value) {
                        // Try to resolve the value as a RecordType label
                        const recordTypeId = await this.resolveRecordTypeId(objectName, filter.value);
                        
                        if (recordTypeId) {
                            console.log(`  📝 Resolved RecordType "${filter.value}" to ID: ${recordTypeId}`);
                            return {
                                ...filter,
                                value: recordTypeId,
                                operator: 'equals' // RecordType filters must use equals
                            };
                        }
                    }
                    
                    // Ensure operator is correct even if we couldn't resolve ID
                    if (filter.operator === 'contains') {
                        return {
                            ...filter,
                            operator: 'equals'
                        };
                    }
                }
                
                return filter;
            })
        );
        
        return fixed;
    }

    /**
     * Infer object name from filter context
     */
    async inferObjectFromFilter(filter, reportMetadata) {
        // Try to get from report type
        const reportType = reportMetadata.reportType?.type;
        
        if (reportType) {
            // Map common report types to objects
            const typeToObject = {
                'Opportunity': 'Opportunity',
                'LeadList': 'Lead',
                'ContactList': 'Contact',
                'AccountList': 'Account',
                'CaseList': 'Case',
                'Activity': 'Task',
                'CaseActivity': 'Task'
            };
            
            if (typeToObject[reportType]) {
                return typeToObject[reportType];
            }
            
            // Try to extract from custom report types
            if (reportType.includes('__c')) {
                // Extract custom object name
                const match = reportType.match(/([A-Za-z0-9_]+__c)/);
                if (match) {
                    return match[1];
                }
            }
        }
        
        // Try to infer from column name
        if (filter.column) {
            // Common patterns: ACCOUNT.RECORDTYPE, Lead.RecordType
            const match = filter.column.match(/^([A-Za-z0-9_]+)\./);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }

    /**
     * Get all RecordTypes across all objects
     */
    async getAllRecordTypes(objects = []) {
        // Default to common objects if none specified
        if (objects.length === 0) {
            objects = [
                'Account', 'Contact', 'Lead', 'Opportunity', 
                'Case', 'Task', 'Event', 'Campaign'
            ];
        }
        
        const allRecordTypes = {};
        
        for (const obj of objects) {
            const data = await this.getRecordTypes(obj);
            if (data.count > 0) {
                allRecordTypes[obj] = data;
            }
        }
        
        return allRecordTypes;
    }

    /**
     * Validate RecordType values in filters
     */
    async validateRecordTypeFilters(reportMetadata) {
        const issues = [];
        
        if (!reportMetadata.reportFilters) {
            return { valid: true, issues: [] };
        }
        
        for (const filter of reportMetadata.reportFilters) {
            if (filter.column?.toLowerCase().includes('recordtype')) {
                const objectName = await this.inferObjectFromFilter(filter, reportMetadata);
                
                if (!objectName) {
                    issues.push({
                        filter,
                        issue: 'Cannot determine object for RecordType filter',
                        suggestion: 'Specify object context or use different filter'
                    });
                    continue;
                }
                
                const data = await this.getRecordTypes(objectName);
                
                // Check if value is a valid ID
                if (!data.recordTypes[filter.value]) {
                    // Try to resolve as label
                    const resolvedId = await this.resolveRecordTypeId(objectName, filter.value);
                    
                    if (!resolvedId) {
                        issues.push({
                            filter,
                            issue: `Invalid RecordType value: ${filter.value}`,
                            suggestion: `Valid RecordTypes for ${objectName}: ${Object.keys(data.labelToId).join(', ')}`,
                            validIds: Object.keys(data.recordTypes)
                        });
                    } else {
                        issues.push({
                            filter,
                            issue: `RecordType should use ID, not label`,
                            suggestion: `Use ID: ${resolvedId} instead of label: ${filter.value}`,
                            resolvedId
                        });
                    }
                }
                
                // Check operator
                if (filter.operator !== 'equals' && filter.operator !== 'notEqual') {
                    issues.push({
                        filter,
                        issue: `Invalid operator for RecordType: ${filter.operator}`,
                        suggestion: 'Use "equals" or "notEqual" for RecordType filters'
                    });
                }
            }
        }
        
        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * Clear cache
     */
    async clearCache() {
        this.cache.clear();
        if (this.persistentCache) {
            // Clear RecordType entries
            const keys = ['recordtypes'];
            for (const obj of ['Account', 'Contact', 'Lead', 'Opportunity', 'Case']) {
                keys.push(`recordtypes_${obj}`);
            }
            
            for (const key of keys) {
                await this.persistentCache.clear(key);
            }
        }
        
        console.log('✅ RecordType cache cleared');
    }
}

// CLI interface
async function main() {
    const command = process.argv[2];
    const org = process.env.ORG;
    
    if (!org) {
        console.error('❌ ORG environment variable not set');
        process.exit(1);
    }
    
    if (!command) {
        console.log(`
RecordType Resolver

Usage:
  node recordtype-resolver.js list <object>        List RecordTypes for object
  node recordtype-resolver.js resolve <obj> <label> Resolve label to ID
  node recordtype-resolver.js all                  Get all RecordTypes
  node recordtype-resolver.js clear                Clear cache
  
Environment:
  ORG=${org}
`);
        return;
    }
    
    const ReportsRestAPI = require('./reports-rest-api');
    const api = await ReportsRestAPI.fromSFAuth(org);
    const resolver = new RecordTypeResolver(api);
    await resolver.init();
    
    switch (command) {
        case 'list':
            const objectName = process.argv[3];
            if (!objectName) {
                console.error('Usage: list <objectName>');
                process.exit(1);
            }
            
            const data = await resolver.getRecordTypes(objectName);
            console.log(`\n📋 RecordTypes for ${objectName}:`);
            console.log(`Found: ${data.count}`);
            
            if (data.count > 0) {
                console.log('\nLabel → ID Mappings:');
                for (const [label, id] of Object.entries(data.labelToId)) {
                    const rt = data.recordTypes[id];
                    console.log(`  "${label}" → ${id} (${rt.developerName})`);
                }
            }
            break;
            
        case 'resolve':
            const obj = process.argv[3];
            const label = process.argv[4];
            if (!obj || !label) {
                console.error('Usage: resolve <object> <label>');
                process.exit(1);
            }
            
            const id = await resolver.resolveRecordTypeId(obj, label);
            if (id) {
                console.log(`✅ Resolved: "${label}" → ${id}`);
            } else {
                console.log(`❌ Could not resolve "${label}" for ${obj}`);
                
                // Show available options
                const available = await resolver.getRecordTypes(obj);
                if (available.count > 0) {
                    console.log('\nAvailable RecordTypes:');
                    for (const rt of Object.keys(available.labelToId)) {
                        console.log(`  - ${rt}`);
                    }
                }
            }
            break;
            
        case 'all':
            const all = await resolver.getAllRecordTypes();
            console.log('\n📚 All RecordTypes:');
            for (const [obj, data] of Object.entries(all)) {
                console.log(`\n${obj} (${data.count}):`);
                for (const [label, id] of Object.entries(data.labelToId)) {
                    console.log(`  ${label}: ${id}`);
                }
            }
            break;
            
        case 'clear':
            await resolver.clearCache();
            break;
            
        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RecordTypeResolver;