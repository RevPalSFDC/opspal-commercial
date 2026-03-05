/**
 * Universal Report Creator
 * 
 * Instance-agnostic solution that adapts to any Salesforce org
 * Automatically detects and handles org-specific configurations
 */

const ReportsRestAPI = require('./reports-rest-api');
const ReportTypeDiscovery = require('./report-type-discovery');

class UniversalReportCreator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.api = null;
        this.discovery = null;
        this.orgCapabilities = null;
        this.cache = {
            reportTypes: null,
            folders: null,
            standardFields: new Map()
        };
        
        // Safety checks
        this.enableWrite = process.env.ENABLE_WRITE === '1';
        this.apiVersion = process.env.API_VERSION || 'v64.0';
        this.org = process.env.ORG || orgAlias;
        
        // Validate org is set
        if (!this.org) {
            throw new Error('ORG not set. Use: export ORG=your-org-alias');
        }
        
        // Check allowlist
        const allowlist = (process.env.ORG_ALLOWLIST || '').split(' ').filter(Boolean);
        if (allowlist.length > 0 && !allowlist.includes(this.org)) {
            console.warn(`⚠️  Org '${this.org}' not in allowlist. Write operations disabled.`);
            this.enableWrite = false;
        }
    }

    /**
     * Initialize and detect org capabilities
     */
    async initialize() {
        // Initialize API connections
        this.api = await ReportsRestAPI.fromSFAuth(this.orgAlias);
        this.discovery = new ReportTypeDiscovery(this.api);
        
        // Detect org capabilities
        this.orgCapabilities = await this.detectOrgCapabilities();
        
        return this;
    }

    /**
     * Detect what's available in this specific org
     */
    async detectOrgCapabilities() {
        const capabilities = {
            hasActivities: false,
            hasGong: false,
            hasCustomObjects: false,
            availableStandardObjects: [],
            availableCustomObjects: [],
            writableFolders: [],
            dateFieldFormats: [],
            supportedReportFormats: ['TABULAR', 'SUMMARY', 'MATRIX'],
            maxColumnsPerFormat: {
                TABULAR: 10,
                SUMMARY: 12,
                MATRIX: 8
            }
        };

        try {
            // Check available report types
            const reportTypes = await this.api.getReportTypes();
            
            // Detect standard objects
            const standardObjects = ['Opportunity', 'Account', 'Contact', 'Lead', 'Case'];
            standardObjects.forEach(obj => {
                if (reportTypes.some(rt => rt.type === obj || rt.type.includes(obj))) {
                    capabilities.availableStandardObjects.push(obj);
                }
            });

            // Detect Activities support
            capabilities.hasActivities = reportTypes.some(rt => 
                rt.type === 'Activities' || 
                rt.label?.toLowerCase().includes('activities') ||
                rt.label?.toLowerCase().includes('task')
            );

            // Detect Gong integration
            capabilities.hasGong = reportTypes.some(rt => 
                rt.type?.toLowerCase().includes('gong') ||
                rt.label?.toLowerCase().includes('gong')
            );

            // Detect custom objects
            const customTypes = reportTypes.filter(rt => rt.type.includes('__c'));
            capabilities.hasCustomObjects = customTypes.length > 0;
            capabilities.availableCustomObjects = customTypes.map(rt => rt.type);

            // Check folder access
            const folders = await this.api.getWritableFolders();
            capabilities.writableFolders = folders;

        } catch (error) {
            console.warn('Could not fully detect org capabilities:', error.message);
        }

        return capabilities;
    }

    /**
     * Get universal field tokens that work across most orgs
     */
    getUniversalFields(objectType) {
        const universalFields = {
            'Opportunity': [
                'OPPORTUNITY_NAME',     // Works in most orgs
                'ACCOUNT_NAME',         // Standard relationship
                'AMOUNT',               // Standard field
                'CLOSE_DATE',           // Standard field
                'STAGE_NAME',           // Standard field
                'PROBABILITY',          // Standard field
                'TYPE',                 // Standard field
                'LEAD_SOURCE',          // Standard field
                'CREATED_DATE',         // System field
                'OWNER_NAME'            // Standard field
            ],
            'Account': [
                'ACCOUNT_NAME',         // Standard field
                'TYPE',                 // Standard field
                'INDUSTRY',             // Standard field
                'ANNUAL_REVENUE',       // Standard field
                'PHONE',                // Standard field
                'WEBSITE',              // Standard field
                'CREATED_DATE',         // System field
                'OWNER_NAME',           // Standard field
                'BILLING_STATE_CODE',   // Standard address field
                'NUMBER_OF_EMPLOYEES'   // Standard field
            ],
            'Contact': [
                'NAME',                 // Full name
                'FIRST_NAME',           // Standard field
                'LAST_NAME',            // Standard field
                'EMAIL',                // Standard field
                'PHONE',                // Standard field
                'TITLE',                // Standard field
                'ACCOUNT_NAME',         // Standard relationship
                'MAILING_STATE_CODE',   // Standard address
                'CREATED_DATE',         // System field
                'OWNER_NAME'            // Standard field
            ],
            'Lead': [
                'NAME',                 // Full name
                'COMPANY',              // Standard field
                'STATUS',               // Standard field
                'RATING',               // Standard field
                'EMAIL',                // Standard field
                'PHONE',                // Standard field
                'INDUSTRY',             // Standard field
                'LEAD_SOURCE',          // Standard field
                'CREATED_DATE',         // System field
                'OWNER_NAME'            // Standard field
            ],
            'Case': [
                'CASE_NUMBER',          // Standard field
                'SUBJECT',              // Standard field
                'STATUS',               // Standard field
                'PRIORITY',             // Standard field
                'ORIGIN',               // Standard field
                'TYPE',                 // Standard field
                'ACCOUNT_NAME',         // Standard relationship
                'CONTACT_NAME',         // Standard relationship
                'CREATED_DATE',         // System field
                'OWNER_NAME'            // Standard field
            ],
            'Activities': [
                'SUBJECT',              // Standard field
                'WHO_NAME',             // Standard relationship
                'WHAT_NAME',            // Standard relationship
                'TASK_TYPE',            // Standard field
                'STATUS',               // Standard field
                'PRIORITY',             // Standard field
                'DUE_DATE',             // Standard field
                'CREATED_DATE',         // System field
                'ASSIGNED',             // Standard field
                'IS_CLOSED'             // Standard field
            ]
        };

        return universalFields[objectType] || [];
    }

    /**
     * Intelligently select fields based on what's available
     */
    async selectAvailableFields(reportType, requestedFields = []) {
        try {
            // Get report type description
            const typeDetails = await this.api.describeReportType(reportType);
            const availableTokens = typeDetails.fields.map(f => f.token);
            
            // If specific fields requested, validate them
            if (requestedFields.length > 0) {
                return requestedFields.filter(field => 
                    availableTokens.includes(field)
                );
            }
            
            // Otherwise, use universal fields
            const baseObject = this.getBaseObjectFromType(reportType);
            const universalFields = this.getUniversalFields(baseObject);
            
            // Filter to only available fields
            const validFields = universalFields.filter(field => 
                availableTokens.includes(field)
            );
            
            // If too few fields found, add some common ones
            if (validFields.length < 3) {
                const commonPatterns = ['NAME', 'DATE', 'OWNER', 'STATUS', 'TYPE'];
                for (const pattern of commonPatterns) {
                    const matchingField = availableTokens.find(token => 
                        token.includes(pattern)
                    );
                    if (matchingField && !validFields.includes(matchingField)) {
                        validFields.push(matchingField);
                    }
                    if (validFields.length >= 5) break;
                }
            }
            
            return validFields.slice(0, 10); // Limit to 10 fields
            
        } catch (error) {
            // Fallback to basic fields
            console.warn('Could not validate fields:', error.message);
            return this.getUniversalFields(this.getBaseObjectFromType(reportType)).slice(0, 5);
        }
    }

    /**
     * Get base object from report type
     */
    getBaseObjectFromType(reportType) {
        if (reportType === 'Activities') return 'Activities';
        if (reportType.includes('Opportunity')) return 'Opportunity';
        if (reportType.includes('Account')) return 'Account';
        if (reportType.includes('Contact')) return 'Contact';
        if (reportType.includes('Lead')) return 'Lead';
        if (reportType.includes('Case')) return 'Case';
        return 'Opportunity'; // Default
    }

    /**
     * Find or create appropriate folder
     */
    async getTargetFolder(preferredName = null) {
        const folders = await this.api.getWritableFolders();
        
        if (folders.length === 0) {
            throw new Error('No writable folders found. Please request Editor/Manager access to at least one report folder.');
        }
        
        // If preferred name provided, try to find it
        if (preferredName) {
            const preferred = folders.find(f => 
                f.name.toLowerCase().includes(preferredName.toLowerCase()) ||
                f.label?.toLowerCase().includes(preferredName.toLowerCase())
            );
            if (preferred) return preferred;
        }
        
        // Look for common folder patterns
        const patterns = ['custom', 'private', 'personal', 'my reports', 'unfiled'];
        for (const pattern of patterns) {
            const folder = folders.find(f => 
                f.name.toLowerCase().includes(pattern) ||
                f.label?.toLowerCase().includes(pattern)
            );
            if (folder) return folder;
        }
        
        // Return first available folder
        return folders[0];
    }

    /**
     * Upsert report with idempotency
     */
    async upsertReport(options = {}) {
        if (!this.api) await this.initialize();
        
        // Generate deterministic developer name
        const developerName = this.generateDeveloperName(options);
        const folder = await this.getTargetFolder(options.folderName);
        
        // Check if report exists
        const existing = await this.findReportByDeveloperName(folder.id, developerName);
        
        if (existing) {
            // PATCH existing report
            return await this.updateReport(existing.Id, options);
        } else {
            // POST new report
            return await this.createAdaptiveReport({ ...options, developerName });
        }
    }
    
    /**
     * Generate deterministic developer name
     */
    generateDeveloperName(options) {
        const template = options.template || 'Report';
        const key = options.key || new Date().toISOString().split('T')[0];
        const base = `${template}_${key}`.replace(/[^a-zA-Z0-9_]/g, '_');
        
        // If too long, add short hash
        if (base.length > 40) {
            const hash = require('crypto').createHash('md5').update(base).digest('hex').substring(0, 8);
            return base.substring(0, 32) + '_' + hash;
        }
        
        return base;
    }
    
    /**
     * Find report by developer name
     */
    async findReportByDeveloperName(folderId, developerName) {
        try {
            const query = `SELECT Id, Name, DeveloperName FROM Report WHERE FolderId = '${folderId}' AND DeveloperName = '${developerName}' LIMIT 1`;
            const result = await this.api.apiRequest(
                `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(query)}`
            );
            return result.records?.[0] || null;
        } catch (error) {
            console.warn('Could not find existing report:', error.message);
            return null;
        }
    }
    
    /**
     * Universal report creation that adapts to any org
     */
    async createAdaptiveReport(options = {}) {
        // Ensure initialized
        if (!this.api) await this.initialize();
        
        // Safety gate for writes
        if (!this.enableWrite && !options.dryRun) {
            throw new Error('Write operations disabled. Set ENABLE_WRITE=1 to enable.');
        }
        
        // Determine report type
        let reportType = options.reportType;
        if (!reportType) {
            // Auto-select based on what's available
            if (this.orgCapabilities.availableStandardObjects.includes('Opportunity')) {
                reportType = 'Opportunity';
            } else if (this.orgCapabilities.availableStandardObjects.length > 0) {
                reportType = this.orgCapabilities.availableStandardObjects[0];
            } else {
                throw new Error('No suitable report type found in org');
            }
        }
        
        // Get appropriate folder
        const folder = await this.getTargetFolder(options.folderName);
        
        // Select available fields
        const fields = await this.selectAvailableFields(
            reportType, 
            options.fields || []
        );
        
        if (fields.length === 0) {
            throw new Error('No valid fields found for report type');
        }
        
        // Build adaptive metadata
        const reportMetadata = {
            name: options.name || `Report_${new Date().toISOString().split('T')[0]}`,
            reportType: { type: reportType },
            reportFormat: options.format || 'TABULAR',
            folderId: folder.id,
            detailColumns: fields
        };
        
        // Add filters if provided
        if (options.filters) {
            reportMetadata.reportFilters = await this.validateFilters(
                reportType, 
                options.filters
            );
        }
        
        // Add groupings for summary/matrix reports
        if (reportMetadata.reportFormat !== 'TABULAR' && options.groupBy) {
            reportMetadata.groupingsDown = await this.buildGroupings(
                reportType,
                options.groupBy
            );
        }
        
        // Handle matrix-specific requirements
        if (reportMetadata.reportFormat === 'MATRIX') {
            this.ensureMatrixCompliance(reportMetadata);
        }
        
        // Validate before creation
        const validation = await this.api.validateReportMetadata(reportMetadata);
        if (!validation.valid) {
            // Try to auto-fix common issues
            const fixed = await this.autoFixMetadata(reportMetadata, validation);
            if (fixed) {
                const revalidation = await this.api.validateReportMetadata(fixed);
                if (revalidation.valid) {
                    reportMetadata = fixed;
                } else {
                    throw new Error(`Validation failed: ${validation.message}`);
                }
            } else {
                throw new Error(`Validation failed: ${validation.message}`);
            }
        }
        
        // Create the report
        const result = await this.api.createReport(reportMetadata);
        
        return {
            ...result,
            metadata: reportMetadata,
            folder: folder.name,
            fieldCount: fields.length
        };
    }

    /**
     * Validate and adapt filters to org
     */
    async validateFilters(reportType, filters) {
        const validatedFilters = [];
        
        for (const filter of filters) {
            try {
                // Check if field exists
                const typeDetails = await this.api.describeReportType(reportType);
                const field = typeDetails.fields.find(f => 
                    f.token === filter.field || 
                    f.label?.toLowerCase() === filter.field.toLowerCase()
                );
                
                if (field) {
                    validatedFilters.push({
                        column: field.token,
                        operator: this.normalizeOperator(filter.operator),
                        value: filter.value
                    });
                }
            } catch (error) {
                console.warn(`Could not validate filter: ${filter.field}`);
            }
        }
        
        return validatedFilters;
    }

    /**
     * Normalize filter operators
     */
    normalizeOperator(operator) {
        const operatorMap = {
            '=': 'equals',
            '==': 'equals',
            '!=': 'notEqual',
            '<>': 'notEqual',
            '<': 'lessThan',
            '>': 'greaterThan',
            '<=': 'lessOrEqual',
            '>=': 'greaterOrEqual',
            'contains': 'contains',
            'includes': 'includes',
            'excludes': 'excludes',
            'starts': 'startsWith'
        };
        
        return operatorMap[operator.toLowerCase()] || operator;
    }

    /**
     * Build groupings with proper configuration
     */
    async buildGroupings(reportType, groupByFields) {
        const groupings = [];
        const typeDetails = await this.api.describeReportType(reportType);
        
        for (const groupField of groupByFields) {
            const field = typeDetails.fields.find(f => 
                f.token === groupField || 
                f.label?.toLowerCase() === groupField.toLowerCase()
            );
            
            if (field && field.groupable) {
                const grouping = {
                    name: field.token,
                    sortOrder: 'ASC'
                };
                
                // Add date granularity if it's a date field
                if (field.dataType === 'date' || field.dataType === 'datetime') {
                    grouping.dateGranularity = 'DAY';
                }
                
                groupings.push(grouping);
            }
        }
        
        return groupings;
    }

    /**
     * Ensure matrix reports meet requirements
     */
    ensureMatrixCompliance(metadata) {
        // Matrix reports need both across and down groupings
        if (!metadata.groupingsAcross && metadata.groupingsDown?.length > 0) {
            // Move first grouping to across
            metadata.groupingsAcross = [metadata.groupingsDown.shift()];
        }
        
        // Ensure date granularity
        ['groupingsAcross', 'groupingsDown'].forEach(groupType => {
            if (metadata[groupType]) {
                metadata[groupType].forEach(grouping => {
                    if (this.isDateField(grouping.name) && !grouping.dateGranularity) {
                        grouping.dateGranularity = 'DAY';
                    }
                });
            }
        });
        
        // Ensure aggregates for matrix
        if (!metadata.aggregates || metadata.aggregates.length === 0) {
            metadata.aggregates = [{ name: 'RowCount' }];
        }
    }

    /**
     * Check if field is a date
     */
    isDateField(fieldName) {
        const patterns = ['DATE', 'CREATED', 'MODIFIED', 'CLOSED', 'DUE', 'LAST'];
        const upper = fieldName.toUpperCase();
        return patterns.some(p => upper.includes(p));
    }

    /**
     * Auto-fix common metadata issues
     */
    async autoFixMetadata(metadata, validation) {
        const fixed = { ...metadata };
        const errorMessage = validation.message?.toLowerCase() || '';
        
        // Fix missing folder
        if (errorMessage.includes('folder')) {
            const folder = await this.getTargetFolder();
            fixed.folderId = folder.id;
        }
        
        // Fix invalid fields
        if (errorMessage.includes('field') || errorMessage.includes('column')) {
            const validFields = await this.selectAvailableFields(metadata.reportType.type);
            fixed.detailColumns = validFields;
        }
        
        // Fix date granularity
        if (errorMessage.includes('granularity')) {
            this.ensureMatrixCompliance(fixed);
        }
        
        // Fix report type
        if (errorMessage.includes('report type')) {
            if (this.orgCapabilities.availableStandardObjects.length > 0) {
                fixed.reportType = { type: this.orgCapabilities.availableStandardObjects[0] };
            }
        }
        
        return fixed;
    }

    /**
     * Create report with maximum compatibility
     */
    async createSimpleReport(name = null) {
        return this.createAdaptiveReport({
            name: name || 'Simple Report',
            format: 'TABULAR',
            fields: [] // Will auto-select
        });
    }

    /**
     * Create Activities report if available
     */
    async createActivitiesReport(options = {}) {
        if (!this.orgCapabilities.hasActivities) {
            throw new Error('Activities report type not available in this org');
        }
        
        return this.createAdaptiveReport({
            name: options.name || 'Activities Report',
            reportType: 'Activities',
            format: options.format || 'TABULAR',
            fields: options.fields || this.getUniversalFields('Activities'),
            filters: options.filters || [
                {
                    field: 'DUE_DATE',
                    operator: 'equals',
                    value: 'THIS_MONTH'
                }
            ]
        });
    }

    /**
     * Create summary report with grouping
     */
    async createSummaryReport(options = {}) {
        const reportType = options.reportType || 'Opportunity';
        
        return this.createAdaptiveReport({
            name: options.name || 'Summary Report',
            reportType: reportType,
            format: 'SUMMARY',
            fields: options.fields,
            groupBy: options.groupBy || ['STAGE_NAME'],
            filters: options.filters
        });
    }

    /**
     * Get org capabilities summary
     */
    getCapabilitiesSummary() {
        if (!this.orgCapabilities) {
            return 'Not initialized. Call initialize() first.';
        }
        
        return {
            standardObjects: this.orgCapabilities.availableStandardObjects,
            customObjects: this.orgCapabilities.availableCustomObjects.length,
            hasActivities: this.orgCapabilities.hasActivities,
            hasGong: this.orgCapabilities.hasGong,
            writableFolders: this.orgCapabilities.writableFolders.length,
            recommendation: this.getRecommendation()
        };
    }

    /**
     * Get recommendation based on org
     */
    getRecommendation() {
        if (this.orgCapabilities.writableFolders.length === 0) {
            return 'Request folder access before creating reports';
        }
        if (this.orgCapabilities.availableStandardObjects.length === 0) {
            return 'No standard objects found - check permissions';
        }
        if (this.orgCapabilities.hasGong) {
            return 'Gong integration detected - Gong reports available';
        }
        return 'Org is ready for report creation';
    }
}

// Export singleton factory
UniversalReportCreator.create = async function(orgAlias) {
    const creator = new UniversalReportCreator(orgAlias);
    await creator.initialize();
    return creator;
};

module.exports = UniversalReportCreator;