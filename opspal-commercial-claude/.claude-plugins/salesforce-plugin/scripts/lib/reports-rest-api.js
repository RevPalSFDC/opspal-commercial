/**
 * Salesforce Reports REST API Helper
 * 
 * Provides correct implementation of Salesforce Reports & Dashboards REST API
 * Addresses the three main issues:
 * 1. Uses correct REST API endpoints (not CLI analytics)
 * 2. Handles API tokens properly (not UI names)
 * 3. Manages folder permissions and validation
 */

const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const ReportTypeCache = require('./report-type-cache');
const SeedReportRegistry = require('./seed-report-registry');

class ReportsRestAPI {
    constructor(instanceUrl, accessToken, options = {}) {
        this.instanceUrl = instanceUrl;
        this.accessToken = accessToken;
        this.apiVersion = options.apiVersion || process.env.API_VERSION || 'v64.0';
        this.enableWrite = process.env.ENABLE_WRITE === '1';
        this.org = process.env.ORG;
        this.cache = {
            reportTypes: null,
            folders: null,
            fields: new Map(),
            uiToApiMap: {}
        };
        this.typeCache = null; // Will be initialized on first use
        this.seedRegistry = null; // Seed registry for clone operations
        
        // Safety check
        if (!this.org) {
            throw new Error('ORG environment variable not set. Use: export ORG=your-org-alias');
        }
    }

    /**
     * Initialize from Salesforce CLI authentication
     */
    static async fromSFAuth(orgAlias) {
        let authCommand = 'sf org display --json';
        if (orgAlias) {
            authCommand += ` --target-org ${orgAlias}`;
        }

        const { stdout } = await execAsync(authCommand);
        const authData = JSON.parse(stdout);
        
        if (authData.status !== 0) {
            throw new Error('Authentication failed. Run: sf auth:web:login');
        }

        return new ReportsRestAPI(
            authData.result.instanceUrl,
            authData.result.accessToken
        );
    }

    /**
     * Make authenticated API request
     */
    async apiRequest(endpoint, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.instanceUrl}${endpoint}`);
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = data ? JSON.parse(data) : {};
                        if (res.statusCode >= 400) {
                            const error = new Error(result.message || `API Error ${res.statusCode}`);
                            error.statusCode = res.statusCode;
                            error.body = result;
                            reject(error);
                        } else {
                            resolve(result);
                        }
                    } catch (e) {
                        if (res.statusCode === 204) {
                            resolve({}); // No content expected
                        } else {
                            reject(new Error(`Invalid JSON response: ${data}`));
                        }
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
     * Initialize type cache if needed
     */
    async initTypeCache() {
        if (!this.typeCache) {
            this.typeCache = await new ReportTypeCache({ org: this.org }).init();
        }
        return this.typeCache;
    }
    
    /**
     * Get all report types with proper API tokens
     * IMPORTANT: Returns API tokens (e.g., 'LeadList'), not UI labels
     */
    async getReportTypes(filterPattern = null) {
        // Check persistent cache first
        if (!this.cache.reportTypes) {
            await this.initTypeCache();
            const cached = await this.typeCache.getReportTypes();
            if (cached) {
                this.cache.reportTypes = cached.reportTypes;
                this.cache.uiToApiMap = cached.mappings.uiToApi;
            }
        }
        
        // Fetch from API if not cached
        if (!this.cache.reportTypes) {
            const endpoint = `/services/data/${this.apiVersion}/analytics/reportTypes`;
            const response = await this.apiRequest(endpoint);

            // Response is an array of categories, each with a reportTypes array
            // Flatten the nested structure
            const allTypes = [];
            if (Array.isArray(response)) {
                response.forEach(category => {
                    if (category.reportTypes && Array.isArray(category.reportTypes)) {
                        allTypes.push(...category.reportTypes);
                    }
                });
            } else if (response.reportTypes) {
                // Legacy format (just in case)
                allTypes.push(...response.reportTypes);
            }

            this.cache.reportTypes = allTypes;

            // Build UI to API mapping
            this.cache.uiToApiMap = {};
            for (const rt of this.cache.reportTypes) {
                this.cache.uiToApiMap[rt.label] = rt.type;
            }

            // Save to persistent cache
            await this.typeCache.cacheReportTypes(this.cache.reportTypes);
        }

        let types = this.cache.reportTypes;
        
        if (filterPattern) {
            const pattern = filterPattern.toLowerCase();
            types = types.filter(rt => 
                rt.label?.toLowerCase().includes(pattern) ||
                rt.type?.toLowerCase().includes(pattern)
            );
        }

        return types;
    }
    
    /**
     * Resolve UI label to API token
     */
    async resolveReportType(labelOrToken) {
        await this.getReportTypes(); // Ensure cache is loaded
        
        // Check if it's already an API token
        const directMatch = this.cache.reportTypes.find(rt => rt.type === labelOrToken);
        if (directMatch) return directMatch.type;
        
        // Try to resolve from UI label
        const fromLabel = this.cache.uiToApiMap[labelOrToken];
        if (fromLabel) return fromLabel;
        
        // Fuzzy match
        const fuzzy = this.cache.reportTypes.find(rt => 
            rt.label?.toLowerCase().includes(labelOrToken.toLowerCase())
        );
        if (fuzzy) return fuzzy.type;
        
        throw new Error(`Cannot resolve report type: ${labelOrToken}. Use API token from GET /analytics/reportTypes`);
    }

    /**
     * Get detailed fields for a report type
     */
    async describeReportType(reportType) {
        const endpoint = `/services/data/${this.apiVersion}/analytics/reportTypes/${reportType}`;
        const response = await this.apiRequest(endpoint);

        if (!response.reportExtendedMetadata) {
            throw new Error(`Report type "${reportType}" not found`);
        }

        // Extract field information from reportExtendedMetadata (not reportMetadata)
        const fields = [];
        const detailColumnInfo = response.reportExtendedMetadata.detailColumnInfo || {};

        Object.entries(detailColumnInfo).forEach(([fieldKey, fieldInfo]) => {
            fields.push({
                token: fieldKey,
                label: fieldInfo.label,
                dataType: fieldInfo.dataType,
                filterable: fieldInfo.filterable,
                groupable: fieldInfo.groupable || false,
                isLookup: fieldInfo.isLookup || false,
                entityColumnName: fieldInfo.entityColumnName
            });
        });

        return {
            type: reportType,
            label: response.reportMetadata?.developerName || reportType,
            baseObject: response.reportTypeMetadata?.objects?.[0] || 'Unknown',
            fields: fields,
            totalFields: fields.length
        };
    }

    /**
     * Get report folders with access information
     */
    async getFolders() {
        if (!this.cache.folders) {
            const endpoint = `/services/data/${this.apiVersion}/folders?types=report`;
            const response = await this.apiRequest(endpoint);
            // Extract folders array from response object
            this.cache.folders = response.folders || [];
        }
        return this.cache.folders;
    }

    /**
     * Find writable folders
     */
    async getWritableFolders() {
        const folders = await this.getFolders();
        const writableFolders = [];
        
        for (const folder of folders) {
            try {
                const details = await this.apiRequest(
                    `/services/data/${this.apiVersion}/folders/${folder.id}`
                );
                
                if (details.accessType === 'Manager' || details.accessType === 'Editor') {
                    writableFolders.push({
                        id: folder.id,
                        name: folder.name,
                        label: folder.label,
                        accessType: details.accessType,
                        namespace: folder.namespacePrefix
                    });
                }
            } catch (error) {
                // Skip folders we can't access
                continue;
            }
        }
        
        return writableFolders;
    }

    /**
     * Validate report metadata using query endpoint
     * ALWAYS call this before creation
     */
    async validateReportMetadata(reportMetadata) {
        const endpoint = `/services/data/${this.apiVersion}/analytics/reports/query`;
        
        // Auto-fix common issues before validation
        const fixed = await this.autoFixMetadata(reportMetadata);
        
        try {
            const response = await this.apiRequest(endpoint, 'POST', { reportMetadata: fixed });
            return {
                valid: true,
                message: 'Report metadata is valid',
                metadata: fixed,
                previewData: response
            };
        } catch (error) {
            return {
                valid: false,
                message: error.message,
                errorCode: error.statusCode,
                suggestion: this.getSuggestionForError(error),
                metadata: fixed
            };
        }
    }
    
    /**
     * Auto-fix common metadata issues
     */
    async autoFixMetadata(metadata) {
        const fixed = { ...metadata };
        
        // Fix report type if using UI label
        if (fixed.reportType?.type) {
            try {
                fixed.reportType.type = await this.resolveReportType(fixed.reportType.type);
            } catch (e) {
                // Keep original if can't resolve
            }
        }
        
        // Fix date formats
        if (fixed.reportFilters) {
            fixed.reportFilters = fixed.reportFilters.map(f => {
                if (f.value === 'LAST_90_DAYS') return { ...f, value: 'LAST_N_DAYS:90' };
                if (f.value === 'LAST_30_DAYS') return { ...f, value: 'LAST_N_DAYS:30' };
                if (f.value === 'LAST_7_DAYS') return { ...f, value: 'LAST_N_DAYS:7' };
                return f;
            });
        }
        
        // Fix standard date filter to use absolute dates (more reliable)
        if (fixed.standardDateFilter && !fixed.standardDateFilter.startDate) {
            const dates = this.convertRelativeToAbsolute(fixed.standardDateFilter.durationValue);
            if (dates) {
                fixed.standardDateFilter = {
                    column: fixed.standardDateFilter.column,
                    startDate: dates.startDate,
                    endDate: dates.endDate
                };
            }
        }
        
        // Ensure matrix date granularity
        if (fixed.reportFormat === 'MATRIX') {
            if (fixed.groupingsAcross) {
                fixed.groupingsAcross = fixed.groupingsAcross.map(g => {
                    if (this.isDateField(g.name) && !g.dateGranularity) {
                        return { ...g, dateGranularity: 'DAY' };
                    }
                    return g;
                });
            }
        }
        
        return fixed;
    }
    
    /**
     * Convert relative dates to absolute for reliability
     */
    convertRelativeToAbsolute(durationValue) {
        const today = new Date();
        const formatDate = (date) => date.toISOString().split('T')[0];
        
        switch(durationValue) {
            case 'LAST_N_DAYS:90':
            case 'LAST_90_DAYS':
                return {
                    startDate: formatDate(new Date(today.setDate(today.getDate() - 90))),
                    endDate: formatDate(new Date())
                };
            case 'LAST_N_DAYS:30':
            case 'LAST_30_DAYS':
            case 'LAST_MONTH':
                return {
                    startDate: formatDate(new Date(today.setDate(today.getDate() - 30))),
                    endDate: formatDate(new Date())
                };
            case 'THIS_MONTH':
                return {
                    startDate: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
                    endDate: formatDate(new Date())
                };
            default:
                return null;
        }
    }

    /**
     * Create a report with proper validation and safety checks
     */
    async createReport(reportMetadata, options = {}) {
        // Safety gate: Check write permission
        if (!this.enableWrite && !options.dryRun) {
            throw new Error('Write operations disabled. Set ENABLE_WRITE=1 to enable.');
        }
        
        // Step 1: Validate metadata (always runs, even in dry-run)
        const validation = await this.validateReportMetadata(reportMetadata);
        if (!validation.valid) {
            throw new Error(`Validation failed: ${validation.message}`);
        }

        // Step 2: Ensure folder is writable
        if (reportMetadata.folderId) {
            const writableFolders = await this.getWritableFolders();
            const hasAccess = writableFolders.some(f => f.id === reportMetadata.folderId);
            
            if (!hasAccess) {
                throw new Error(`No write access to folder ${reportMetadata.folderId}`);
            }
        }

        // Step 3: Add date granularity for matrix reports if needed
        if (reportMetadata.reportFormat === 'MATRIX') {
            this.ensureMatrixGranularity(reportMetadata);
        }
        
        // Step 4: Dry-run mode - return validation result only
        if (options.dryRun) {
            return {
                success: true,
                dryRun: true,
                message: 'Dry-run successful. Report metadata is valid.',
                metadata: reportMetadata,
                wouldCreate: true
            };
        }
        
        // Step 5: Two-step confirmation if required
        if (options.requireConfirmation && !options.confirmed) {
            return {
                success: false,
                requiresConfirmation: true,
                message: 'Confirmation required. Call again with confirmed: true',
                metadata: reportMetadata
            };
        }

        // Step 6: Create the report (actual write)
        const endpoint = `/services/data/${this.apiVersion}/analytics/reports`;
        const response = await this.apiRequest(endpoint, 'POST', { reportMetadata });

        // Extract report ID with comprehensive fallback chain
        // Different report formats return IDs in different locations:
        // - TABULAR: response.attributes.reportId or response.reportMetadata.id
        // - SUMMARY: response.attributes.reportId (when using direct creation)
        const reportId = response.attributes?.reportId ||  // Most common for all formats
                         response.reportMetadata?.id ||     // TABULAR fallback
                         response.id ||                      // Legacy/other formats
                         response.reportId;                  // Final fallback

        if (!reportId) {
            console.warn('⚠️  Could not extract report ID from response');
            console.warn('   Response keys:', Object.keys(response));
            console.warn('   Check API response structure');
        }

        return {
            success: true,
            reportId: reportId,
            reportName: response.reportMetadata?.name || response.attributes?.reportName,
            url: `${this.instanceUrl}/lightning/r/Report/${reportId}/view`,
            org: this.org,
            apiVersion: this.apiVersion
        };
    }

    /**
     * Ensure matrix reports have proper date granularity
     */
    ensureMatrixGranularity(reportMetadata) {
        // Check groupingsAcross for date fields
        if (reportMetadata.groupingsAcross) {
            reportMetadata.groupingsAcross.forEach(grouping => {
                if (this.isDateField(grouping.name) && !grouping.dateGranularity) {
                    grouping.dateGranularity = 'DAY';
                }
            });
        }
        
        // Check groupingsDown for date fields
        if (reportMetadata.groupingsDown) {
            reportMetadata.groupingsDown.forEach(grouping => {
                if (this.isDateField(grouping.name) && !grouping.dateGranularity) {
                    grouping.dateGranularity = 'DAY';
                }
            });
        }
    }

    /**
     * Check if a field is a date field
     */
    isDateField(fieldName) {
        const dateFieldPatterns = [
            'date', 'created', 'modified', 'closed', 'last',
            'DATE', 'CREATED', 'MODIFIED', 'CLOSED', 'LAST'
        ];
        return dateFieldPatterns.some(pattern => fieldName.includes(pattern));
    }

    /**
     * Get suggestion for common errors
     */
    getSuggestionForError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        
        if (errorMessage.includes('folder')) {
            return 'Check folder permissions - use getWritableFolders() to find accessible folders';
        }
        if (errorMessage.includes('reporttype')) {
            return 'Invalid report type - use getReportTypes() to find valid types';
        }
        if (errorMessage.includes('field') || errorMessage.includes('column')) {
            return 'Invalid field token - use describeReportType() to get valid field tokens';
        }
        if (errorMessage.includes('granularity')) {
            return 'Add dateGranularity (DAY, WEEK, MONTH, etc.) for date groupings in matrix reports';
        }
        if (error.statusCode === 403) {
            return 'Permission denied - check user permissions and folder access';
        }
        
        return 'Check report metadata structure and required fields';
    }

    /**
     * Build report metadata with Activities report type
     */
    buildActivitiesReportMetadata(options = {}) {
        // Find the correct Activities report type
        const reportType = options.reportType || 'Activities';
        
        return {
            name: options.name || 'Activities Report',
            reportType: { type: reportType },
            reportFormat: options.format || 'TABULAR',
            folderId: options.folderId,
            detailColumns: options.columns || [
                'SUBJECT',
                'WHO_NAME',
                'WHAT_NAME',
                'TASK_TYPE',
                'DUE_DATE',
                'STATUS'
            ],
            reportFilters: options.filters || [],
            groupingsDown: options.groupings || [],
            aggregates: options.aggregates || []
        };
    }

    /**
     * Build report metadata for Gong reports
     */
    buildGongReportMetadata(options = {}) {
        return {
            name: options.name || 'Gong Activity Report',
            reportType: { type: options.reportType || 'Opportunity' },
            reportFormat: options.format || 'SUMMARY',
            folderId: options.folderId,
            detailColumns: options.columns || [],
            groupingsDown: options.groupings || [
                {
                    name: 'ACCOUNT_NAME',
                    sortOrder: 'ASC'
                }
            ],
            aggregates: options.aggregates || [
                { name: 'AMOUNT' },
                { name: 'RowCount' }
            ],
            reportFilters: options.filters || [
                {
                    column: 'STAGE_NAME',
                    operator: 'notEqual',
                    value: 'Closed Lost'
                }
            ]
        };
    }

    /**
     * Quick report creation helper
     */
    async quickCreateReport(name, reportType, columns, options = {}) {
        // Get first writable folder
        const folders = await this.getWritableFolders();
        if (folders.length === 0) {
            throw new Error('No writable folders found');
        }
        
        const reportMetadata = {
            name: name,
            reportType: { type: reportType },
            reportFormat: options.format || 'TABULAR',
            folderId: options.folderId || folders[0].id,
            detailColumns: columns
        };
        
        // Add optional configurations
        if (options.filters) reportMetadata.reportFilters = options.filters;
        if (options.groupings) reportMetadata.groupingsDown = options.groupings;
        if (options.aggregates) reportMetadata.aggregates = options.aggregates;
        
        return await this.createReport(reportMetadata);
    }

    /**
     * Initialize seed registry if needed
     */
    async initSeedRegistry() {
        if (!this.seedRegistry) {
            this.seedRegistry = new SeedReportRegistry({ 
                org: this.org, 
                api: this 
            });
            await this.seedRegistry.init();
        }
        return this.seedRegistry;
    }
    
    /**
     * Clone an existing report (recommended for Activities)
     * Enhanced with seed registry and multiple fallback strategies
     */
    async cloneReport(sourceReportId, newName, modifications = {}) {
        // Method 1: Use clone endpoint if available
        try {
            const cloneEndpoint = `/services/data/${this.apiVersion}/analytics/reports?cloneId=${sourceReportId}`;
            const cloneResponse = await this.apiRequest(cloneEndpoint, 'POST', {});
            
            if (cloneResponse.id) {
                // Now patch with modifications
                const patchData = {
                    reportMetadata: {
                        name: newName,
                        ...modifications
                    }
                };
                
                const patchEndpoint = `/services/data/${this.apiVersion}/analytics/reports/${cloneResponse.id}`;
                const result = await this.apiRequest(patchEndpoint, 'PATCH', patchData);
                
                return {
                    success: true,
                    reportId: cloneResponse.id,
                    reportName: newName,
                    url: `${this.instanceUrl}/lightning/r/Report/${cloneResponse.id}/view`,
                    method: 'clone-and-patch'
                };
            }
        } catch (error) {
            console.log('Clone endpoint failed, trying describe method...');
        }
        
        // Method 2: Fallback to describe and create
        const endpoint = `/services/data/${this.apiVersion}/analytics/reports/${sourceReportId}/describe`;
        const sourceReport = await this.apiRequest(endpoint);
        
        // Modify metadata
        const reportMetadata = { ...sourceReport.reportMetadata };
        reportMetadata.name = newName;
        
        // Apply modifications
        Object.assign(reportMetadata, modifications);
        
        // Create new report
        const result = await this.createReport(reportMetadata);
        return { ...result, method: 'describe-and-create' };
    }
    
    /**
     * Create Activities report using clone-and-patch (most reliable)
     */
    async createActivitiesReport(options = {}) {
        // First, try to find an existing Activities report to clone
        const reportsEndpoint = `/services/data/${this.apiVersion}/analytics/reports`;
        const reports = await this.apiRequest(reportsEndpoint);
        
        // Look for an Activities report
        const activitiesReport = reports.find(r => 
            r.name?.toLowerCase().includes('task') ||
            r.name?.toLowerCase().includes('activity') ||
            r.name?.toLowerCase().includes('event')
        );
        
        if (activitiesReport) {
            // Clone it
            return await this.cloneReport(
                activitiesReport.id,
                options.name || 'Activities Report',
                options.modifications || {}
            );
        }
        
        // Fallback: try standard Activity types
        const types = await this.getReportTypes('activity');
        if (types.length > 0) {
            const metadata = {
                name: options.name || 'Activities Report',
                reportType: { type: types[0].type },
                reportFormat: options.format || 'TABULAR',
                folderId: options.folderId,
                detailColumns: options.columns || []
            };
            
            return await this.createReport(metadata);
        }
        
        throw new Error('No Activities report type or existing report found to clone');
    }

    /**
     * Delete a report
     */
    async deleteReport(reportId) {
        const endpoint = `/services/data/${this.apiVersion}/analytics/reports/${reportId}`;
        await this.apiRequest(endpoint, 'DELETE');
        return { success: true, message: `Report ${reportId} deleted` };
    }

    /**
     * Run a report
     */
    async runReport(reportId, includeDetails = true) {
        const endpoint = `/services/data/${this.apiVersion}/analytics/reports/${reportId}`;
        const params = includeDetails ? '?includeDetails=true' : '';
        return await this.apiRequest(endpoint + params);
    }

    /**
     * Update report metadata
     */
    async updateReport(reportId, reportMetadata) {
        const endpoint = `/services/data/${this.apiVersion}/analytics/reports/${reportId}`;
        return await this.apiRequest(endpoint, 'PATCH', { reportMetadata });
    }
}

module.exports = ReportsRestAPI;