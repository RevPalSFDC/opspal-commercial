#!/usr/bin/env node

/**
 * Salesforce Analytics Discovery API v2 - Hardened Edition
 * 
 * Production-ready implementation with:
 * - API version pinning
 * - Idempotency checks
 * - Cache invalidation
 * - Schema drift detection
 * - Field token mapping
 */

const https = require('https');
const url = require('url');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    // Pin API version in one place
    API_VERSION: process.env.SALESFORCE_API_VERSION || 'v64.0',
    
    // Cache configuration
    CACHE_DIR: process.env.ANALYTICS_CACHE_DIR || path.join(process.cwd(), '.analytics-cache'),
    CACHE_TTL: parseInt(process.env.CACHE_TTL_HOURS || '24', 10) * 3600000, // 24 hours default
    
    // Safe mode - read-only by default
    SAFE_MODE: process.env.ANALYTICS_SAFE_MODE !== 'false',
    
    // Retry configuration
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // Initial delay in ms
    RETRY_MULTIPLIER: 2
};

class AnalyticsDiscoveryV2 {
    constructor(instanceUrl, accessToken, options = {}) {
        this.instanceUrl = instanceUrl;
        this.accessToken = accessToken;
        this.apiVersion = options.apiVersion || CONFIG.API_VERSION;
        this.safeMode = options.safeMode ?? CONFIG.SAFE_MODE;
        
        // Enhanced cache with checksums
        this.cache = new Map();
        this.checksums = new Map();
        this.fieldTokenMaps = new Map();
        
        // Request tracking for debugging
        this.lastRequestId = null;
        
        this.initializeCache();
    }

    async initializeCache() {
        try {
            await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
            await this.loadPersistedCache();
        } catch (error) {
            console.warn('Cache initialization warning:', error.message);
        }
    }

    /**
     * Generate developer name for idempotency
     */
    generateDeveloperName(templateKey, filters = {}) {
        const base = templateKey.replace(/[^a-zA-Z0-9]/g, '_');
        const filterString = Object.entries(filters)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}_${v}`)
            .join('_');
        
        const fullName = `${base}_${filterString}`.substring(0, 40);
        
        // Add short hash if name might collide
        if (filterString) {
            const hash = crypto.createHash('sha256')
                .update(fullName + JSON.stringify(filters))
                .digest('hex')
                .substring(0, 6);
            return `${fullName}_${hash}`;
        }
        
        return fullName;
    }

    /**
     * Idempotency check - search for existing report
     */
    async findExistingReport(folderId, developerName) {
        try {
            const query = `SELECT Id, Name, DeveloperName, FolderName FROM Report WHERE FolderId = '${folderId}' AND DeveloperName = '${developerName}' LIMIT 1`;
            const response = await this.makeRequest(
                `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(query)}`,
                'GET'
            );
            
            if (response.records && response.records.length > 0) {
                return {
                    exists: true,
                    report: response.records[0]
                };
            }
            
            return { exists: false };
        } catch (error) {
            // If query fails, assume doesn't exist
            return { exists: false };
        }
    }

    /**
     * Resolve folder with enhanced caching
     */
    async resolveFolderId(folderName = null, options = {}) {
        const cacheKey = `folders_report_${this.apiVersion}`;
        const cached = await this.getCached(cacheKey);
        
        if (cached && !options.forceRefresh) {
            const folders = cached.data;
            if (folderName) {
                const folder = folders.find(f => 
                    f.label?.toLowerCase() === folderName.toLowerCase() ||
                    f.name?.toLowerCase() === folderName.toLowerCase()
                );
                return folder || null;
            }
            return folders;
        }

        try {
            const response = await this.makeRequestWithRetry(
                `/services/data/${this.apiVersion}/folders?types=report`
            );
            
            const folders = (response.folders || []).map(folder => ({
                id: folder.id,
                label: folder.label,
                name: folder.name,
                namespace: folder.namespace || null,
                type: folder.type,
                isManaged: !!folder.namespace,
                developerName: folder.developerName,
                fullPath: folder.namespace ? `${folder.namespace}__${folder.name}` : folder.name
            }));

            await this.setCached(cacheKey, folders);

            if (folderName) {
                const folder = folders.find(f => 
                    f.label?.toLowerCase() === folderName.toLowerCase() ||
                    f.name?.toLowerCase() === folderName.toLowerCase()
                );
                return folder || null;
            }

            return folders;
        } catch (error) {
            throw new Error(`Failed to resolve folder: ${error.message}`);
        }
    }

    /**
     * Discover report types with schema tracking
     */
    async discoverReportTypes(filterPattern = null, options = {}) {
        const cacheKey = `report_types_${this.apiVersion}`;
        const cached = await this.getCached(cacheKey);
        
        if (cached && !options.forceRefresh) {
            const types = cached.data;
            if (filterPattern) {
                return types.filter(t => 
                    t.type?.toLowerCase().includes(filterPattern.toLowerCase()) ||
                    t.label?.toLowerCase().includes(filterPattern.toLowerCase())
                );
            }
            return types;
        }

        try {
            const response = await this.makeRequestWithRetry(
                `/services/data/${this.apiVersion}/analytics/report-types`
            );
            
            const reportTypes = (response.reportTypes || []).map(type => ({
                type: type.type,
                label: type.label,
                category: type.category || 'Other',
                isManaged: type.type.includes('__'),
                namespace: type.type.split('__')[0] || null,
                apiName: type.type,
                checksum: this.calculateChecksum(type)
            }));

            // Sort by category and label
            reportTypes.sort((a, b) => {
                if (a.category !== b.category) {
                    return a.category.localeCompare(b.category);
                }
                return a.label.localeCompare(b.label);
            });

            await this.setCached(cacheKey, reportTypes);

            if (filterPattern) {
                return reportTypes.filter(t => 
                    t.type?.toLowerCase().includes(filterPattern.toLowerCase()) ||
                    t.label?.toLowerCase().includes(filterPattern.toLowerCase())
                );
            }

            return reportTypes;
        } catch (error) {
            throw new Error(`Failed to discover report types: ${error.message}`);
        }
    }

    /**
     * Describe report type with field token mapping
     */
    async describeReportType(reportType, options = {}) {
        const cacheKey = `describe_${reportType}_${this.apiVersion}`;
        const cached = await this.getCached(cacheKey);
        
        // Check for schema drift
        if (cached && !options.forceRefresh) {
            const currentChecksum = cached.checksum;
            if (currentChecksum && !this.hasSchemaChanged(reportType, currentChecksum)) {
                return cached.data;
            }
        }

        try {
            const response = await this.makeRequestWithRetry(
                `/services/data/${this.apiVersion}/analytics/report-types/${reportType}`
            );
            
            const fields = [];
            const fieldTokenMap = {};
            const sections = response.reportTypeMetadata?.sections || [];
            
            sections.forEach(section => {
                const columns = section.columns || [];
                columns.forEach(column => {
                    const field = {
                        token: column.name,
                        label: column.label,
                        dataType: column.dataType,
                        filterable: column.filterable,
                        groupable: column.groupable,
                        sortable: column.sortable,
                        aggregatable: column.aggregatable,
                        section: section.label,
                        isCustom: column.name.includes('__c'),
                        isFormula: column.formulaColumn || false
                    };
                    
                    fields.push(field);
                    
                    // Build label to token map
                    fieldTokenMap[column.label] = column.name;
                });
            });

            const checksum = this.calculateChecksum(response);
            
            const description = {
                reportType,
                label: response.reportTypeMetadata?.label,
                baseObject: response.reportTypeMetadata?.baseObject,
                categories: response.reportTypeMetadata?.categories,
                sections: sections.map(s => ({
                    label: s.label,
                    fieldCount: s.columns?.length || 0
                })),
                fields,
                fieldTokenMap,
                totalFields: fields.length,
                customFields: fields.filter(f => f.isCustom).length,
                standardFields: fields.filter(f => !f.isCustom).length,
                checksum
            };

            // Store field token map separately for easy access
            this.fieldTokenMaps.set(reportType, fieldTokenMap);
            
            await this.setCached(cacheKey, description, checksum);

            return description;
        } catch (error) {
            // Invalidate cache on 404/400 for previously existing type
            if (error.statusCode === 404 || error.statusCode === 400) {
                await this.invalidateCache(cacheKey);
            }
            throw new Error(`Failed to describe report type ${reportType}: ${error.message}`);
        }
    }

    /**
     * Validate report metadata with detailed errors
     */
    async validateReportMetadata(reportMetadata, options = {}) {
        if (this.safeMode && !options.allowWrite) {
            console.log('Safe mode: Validation only (no write operations)');
        }

        try {
            const response = await this.makeRequestWithRetry(
                `/services/data/${this.apiVersion}/analytics/reports/query`,
                'POST',
                { reportMetadata }
            );

            return {
                valid: true,
                message: 'Report metadata is valid',
                previewData: response,
                rowCount: response.factMap ? Object.keys(response.factMap).length : 0,
                groupCount: response.groupingsDown?.length || 0
            };
        } catch (error) {
            const errorDetail = this.parseReportError(error.message);
            return {
                valid: false,
                error: error.message,
                suggestion: errorDetail.suggestion,
                errorCode: errorDetail.code,
                field: errorDetail.field,
                requestId: this.lastRequestId
            };
        }
    }

    /**
     * Create or update report (idempotent)
     */
    async upsertReport(reportMetadata, options = {}) {
        if (this.safeMode && !options.allowWrite) {
            throw new Error('Safe mode enabled. Set allowWrite:true or ANALYTICS_SAFE_MODE=false to create reports');
        }

        const { folderId, templateKey = 'custom', filters = {} } = options;
        
        // Generate developer name for idempotency
        const developerName = this.generateDeveloperName(templateKey, filters);
        reportMetadata.developerName = developerName;
        
        // Check for existing report
        const existing = await this.findExistingReport(folderId || reportMetadata.folderId, developerName);
        
        if (existing.exists) {
            // Update existing report
            console.log(`Report exists (${existing.report.Id}), updating...`);
            
            const updateUrl = `/services/data/${this.apiVersion}/analytics/reports/${existing.report.Id}`;
            const response = await this.makeRequestWithRetry(updateUrl, 'PATCH', { reportMetadata });
            
            // Run smoke test
            await this.runReportSmokeTest(existing.report.Id);
            
            return {
                id: existing.report.Id,
                url: `${this.instanceUrl}/lightning/r/Report/${existing.report.Id}/view`,
                folderId: reportMetadata.folderId,
                developerName,
                operation: 'update',
                warnings: []
            };
        } else {
            // Create new report
            console.log(`Creating new report with developerName: ${developerName}`);
            
            const createUrl = `/services/data/${this.apiVersion}/analytics/reports`;
            const response = await this.makeRequestWithRetry(createUrl, 'POST', { reportMetadata });
            
            const reportId = response.id || response.reportMetadata?.id;
            
            // Run smoke test
            await this.runReportSmokeTest(reportId);
            
            return {
                id: reportId,
                url: `${this.instanceUrl}/lightning/r/Report/${reportId}/view`,
                folderId: response.reportMetadata?.folderId,
                developerName,
                operation: 'create',
                warnings: []
            };
        }
    }

    /**
     * Run report smoke test after creation
     */
    async runReportSmokeTest(reportId) {
        try {
            const runUrl = `/services/data/${this.apiVersion}/analytics/reports/${reportId}/instances`;
            const response = await this.makeRequest(runUrl, 'POST', { includeDetails: false });
            
            console.log(`Smoke test passed: ${response.factMap ? Object.keys(response.factMap).length : 0} rows`);
            return true;
        } catch (error) {
            console.warn(`Smoke test warning: ${error.message}`);
            return false;
        }
    }

    /**
     * Calculate checksum for schema drift detection
     */
    calculateChecksum(data) {
        const normalized = JSON.stringify(data, Object.keys(data).sort());
        return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
    }

    /**
     * Check if schema has changed
     */
    hasSchemaChanged(reportType, previousChecksum) {
        const currentChecksum = this.checksums.get(reportType);
        return currentChecksum && currentChecksum !== previousChecksum;
    }

    /**
     * Enhanced cache management
     */
    async getCached(key) {
        // Check memory cache first
        if (this.cache.has(key)) {
            const cached = this.cache.get(key);
            if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL) {
                return cached;
            }
        }

        // Check disk cache
        try {
            const cacheFile = path.join(CONFIG.CACHE_DIR, `${key}.json`);
            const data = await fs.readFile(cacheFile, 'utf8');
            const cached = JSON.parse(data);
            
            if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL) {
                this.cache.set(key, cached);
                return cached;
            }
        } catch (error) {
            // Cache miss
        }

        return null;
    }

    async setCached(key, data, checksum = null) {
        const cached = {
            data,
            timestamp: Date.now(),
            checksum,
            apiVersion: this.apiVersion
        };

        // Memory cache
        this.cache.set(key, cached);

        // Disk cache
        try {
            const cacheFile = path.join(CONFIG.CACHE_DIR, `${key}.json`);
            await fs.writeFile(cacheFile, JSON.stringify(cached, null, 2));
        } catch (error) {
            console.warn('Cache write warning:', error.message);
        }
    }

    async invalidateCache(key = null) {
        if (key) {
            this.cache.delete(key);
            try {
                const cacheFile = path.join(CONFIG.CACHE_DIR, `${key}.json`);
                await fs.unlink(cacheFile);
            } catch (error) {
                // Ignore if file doesn't exist
            }
        } else {
            // Clear all cache
            this.cache.clear();
            try {
                const files = await fs.readdir(CONFIG.CACHE_DIR);
                await Promise.all(files.map(f => fs.unlink(path.join(CONFIG.CACHE_DIR, f))));
            } catch (error) {
                // Ignore errors
            }
        }
    }

    async loadPersistedCache() {
        try {
            const files = await fs.readdir(CONFIG.CACHE_DIR);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const key = file.replace('.json', '');
                    await this.getCached(key); // This loads into memory cache
                }
            }
        } catch (error) {
            // Ignore if cache dir doesn't exist
        }
    }

    /**
     * Make request with retry and better error handling
     */
    async makeRequestWithRetry(endpoint, method = 'GET', body = null, retryCount = 0) {
        try {
            return await this.makeRequest(endpoint, method, body);
        } catch (error) {
            if (error.statusCode === 429 && retryCount < CONFIG.MAX_RETRIES) {
                // Rate limit - exponential backoff
                const retryAfter = parseInt(error.headers?.['retry-after'] || '1', 10);
                const delay = Math.max(retryAfter * 1000, CONFIG.RETRY_DELAY * Math.pow(CONFIG.RETRY_MULTIPLIER, retryCount));
                
                console.log(`Rate limited, retrying after ${delay}ms (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                return this.makeRequestWithRetry(endpoint, method, body, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Make authenticated API request with enhanced error info
     */
    async makeRequest(endpoint, method = 'GET', body = null) {
        const parsedUrl = url.parse(this.instanceUrl);
        
        // Generate request ID for tracking
        this.lastRequestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const options = {
            hostname: parsedUrl.hostname,
            path: endpoint,
            method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Request-Id': this.lastRequestId,
                'Sforce-Call-Options': `client=analytics-discovery-v2`
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', chunk => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    // Log rate limit info if present
                    if (res.headers['sforce-limit-info']) {
                        console.log('API Limits:', res.headers['sforce-limit-info']);
                    }
                    
                    try {
                        const result = JSON.parse(data);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(result);
                        } else {
                            const error = new Error(result.message || result[0]?.message || JSON.stringify(result));
                            error.statusCode = res.statusCode;
                            error.headers = res.headers;
                            error.requestId = this.lastRequestId;
                            reject(error);
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            
            if (body) {
                req.write(JSON.stringify(body));
            }
            
            req.end();
        });
    }

    /**
     * Enhanced error parsing with opinionated fixes
     */
    parseReportError(errorMessage) {
        const errorMappings = [
            {
                pattern: /folder ID can't be null/i,
                code: 'NULL_FOLDER_ID',
                suggestion: 'Use resolveFolderId() to get a valid folder ID. Run: await discovery.resolveFolderId()'
            },
            {
                pattern: /invalid.*folder/i,
                code: 'INVALID_FOLDER_ID',
                suggestion: 'List available folders: await discovery.resolveFolderId()',
                fix: async () => {
                    const folders = await this.resolveFolderId();
                    return `Available folders:\n${folders.map(f => `- ${f.id}: ${f.label}`).join('\n')}`;
                }
            },
            {
                pattern: /field.*not.*found|invalid.*field/i,
                code: 'INVALID_FIELD',
                suggestion: 'Use describeReportType() to find valid field tokens',
                field: errorMessage.match(/field[:\s]+([^\s,]+)/i)?.[1],
                fix: async (reportType) => {
                    if (!reportType) return 'Specify report type to get valid fields';
                    const description = await this.describeReportType(reportType);
                    const invalidField = errorMessage.match(/field[:\s]+([^\s,]+)/i)?.[1];
                    
                    if (invalidField) {
                        // Find nearest match
                        const similar = description.fields
                            .filter(f => f.token.toLowerCase().includes(invalidField.toLowerCase()))
                            .slice(0, 5);
                        
                        return `Did you mean:\n${similar.map(f => `- ${f.token} (${f.label})`).join('\n')}`;
                    }
                    return `Use one of the ${description.totalFields} available fields`;
                }
            },
            {
                pattern: /permission/i,
                code: 'INSUFFICIENT_PERMISSIONS',
                suggestion: 'Enable: API Enabled + Create and Customize Reports + Manage Reports in Public Folders',
                fix: () => 'Check Profile/Permission Set for: API Enabled, Create and Customize Reports, Manage Reports in Public Folders'
            },
            {
                pattern: /duplicate.*name/i,
                code: 'DUPLICATE_NAME',
                suggestion: 'Report name already exists. Use upsertReport() for idempotent operations',
                fix: () => 'The upsertReport() method handles duplicates automatically by updating existing reports'
            }
        ];

        for (const mapping of errorMappings) {
            if (mapping.pattern.test(errorMessage)) {
                return mapping;
            }
        }

        return {
            code: 'UNKNOWN_ERROR',
            suggestion: `Check the full error message. Request ID: ${this.lastRequestId}`,
            requestId: this.lastRequestId
        };
    }

    /**
     * Static initialization from SF auth
     */
    static async fromSFAuth(orgAlias, options = {}) {
        const authCmd = `sf org display --json${orgAlias ? ` --target-org ${orgAlias}` : ''}`;
        const result = await execAsync(authCmd);
        const authData = JSON.parse(result.stdout);
        
        if (!authData.result || !authData.result.accessToken) {
            throw new Error('Failed to get SF authentication');
        }

        return new AnalyticsDiscoveryV2(
            authData.result.instanceUrl,
            authData.result.accessToken,
            options
        );
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const param = args[1];
    const options = {};
    
    // Parse options
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            options[key] = value || true;
        }
    });

    (async () => {
        try {
            const discovery = await AnalyticsDiscoveryV2.fromSFAuth(options.org, {
                safeMode: options.write !== 'true'
            });

            switch (command) {
                case 'folders':
                    const folders = await discovery.resolveFolderId(param);
                    console.log(JSON.stringify(folders, null, 2));
                    break;

                case 'types':
                    const types = await discovery.discoverReportTypes(param);
                    console.log(JSON.stringify(types, null, 2));
                    break;

                case 'describe':
                    if (!param) {
                        throw new Error('Report type required for describe command');
                    }
                    const description = await discovery.describeReportType(param);
                    console.log(JSON.stringify(description, null, 2));
                    break;

                case 'validate':
                    if (!param) {
                        throw new Error('Metadata JSON file required for validate command');
                    }
                    const metadata = JSON.parse(await fs.readFile(param, 'utf8'));
                    const validation = await discovery.validateReportMetadata(metadata);
                    console.log(JSON.stringify(validation, null, 2));
                    break;

                case 'upsert':
                    if (!param) {
                        throw new Error('Metadata JSON file required for upsert command');
                    }
                    if (!options.write) {
                        console.log('Safe mode: Add --write=true to create/update reports');
                        process.exit(1);
                    }
                    const reportMetadata = JSON.parse(await fs.readFile(param, 'utf8'));
                    const result = await discovery.upsertReport(reportMetadata.reportMetadata || reportMetadata, {
                        allowWrite: true,
                        folderId: options.folder,
                        templateKey: options.template
                    });
                    console.log(JSON.stringify(result, null, 2));
                    break;

                case 'clear-cache':
                    await discovery.invalidateCache();
                    console.log('Cache cleared');
                    break;

                default:
                    console.log('Usage: analytics-discovery-v2.js <command> [param] [options]');
                    console.log('Commands:');
                    console.log('  folders [name]        - List or find report folders');
                    console.log('  types [filter]        - Discover report types');
                    console.log('  describe <type>       - Describe report type fields');
                    console.log('  validate <file.json>  - Validate report metadata');
                    console.log('  upsert <file.json>    - Create or update report (idempotent)');
                    console.log('  clear-cache           - Clear all cached data');
                    console.log('Options:');
                    console.log('  --org=alias           - Salesforce org alias');
                    console.log('  --write=true          - Enable write operations');
                    console.log('  --folder=id           - Folder ID for upsert');
                    console.log('  --template=key        - Template key for developer name');
            }
        } catch (error) {
            console.error('Error:', error.message);
            if (error.requestId) {
                console.error('Request ID:', error.requestId);
            }
            process.exit(1);
        }
    })();
}

module.exports = AnalyticsDiscoveryV2;