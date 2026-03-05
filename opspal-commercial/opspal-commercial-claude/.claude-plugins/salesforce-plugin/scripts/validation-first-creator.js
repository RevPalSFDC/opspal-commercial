#!/usr/bin/env node

/**
 * Validation-First Report Creator
 * 
 * Always validates via /analytics/reports/query before creation
 * Uses discovered API tokens and correct field names
 */

const ReportsRestAPI = require('./lib/reports-rest-api');
const fs = require('fs').promises;

class ValidationFirstCreator {
    constructor(api) {
        this.api = api;
        this.validatedReports = [];
        this.failedReports = [];
    }

    /**
     * Load token mappings from discovery
     */
    async loadMappings() {
        try {
            const data = await fs.readFile('report-examples.json', 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log('⚠️  No mappings found. Run report-type-resolver.js first.');
            return null;
        }
    }

    /**
     * Validate report metadata using query endpoint
     */
    async validateReport(metadata) {
        console.log(`\n🔍 Validating: ${metadata.name}`);
        
        try {
            // Call the query endpoint (no save)
            const response = await this.api.apiRequest(
                `/services/data/${this.api.apiVersion}/analytics/reports/query`,
                'POST',
                { reportMetadata: metadata }
            );
            
            console.log('  ✅ Validation passed!');
            return { valid: true, response };
            
        } catch (error) {
            console.log(`  ❌ Validation failed: ${error.message}`);
            
            // Parse error for common issues
            const errorDetail = this.parseError(error);
            return { 
                valid: false, 
                error: error.message,
                detail: errorDetail,
                suggestion: this.getSuggestion(errorDetail)
            };
        }
    }

    /**
     * Parse error messages for common issues
     */
    parseError(error) {
        const message = error.message || '';
        
        if (message.includes('not a valid report type')) {
            return {
                type: 'INVALID_REPORT_TYPE',
                field: message.match(/\[([^\]]+)\]/)?.[1]
            };
        }
        
        if (message.includes('not a valid column')) {
            return {
                type: 'INVALID_COLUMN',
                field: message.match(/([A-Z_]+) is not/)?.[1]
            };
        }
        
        if (message.includes('date filter is invalid')) {
            return {
                type: 'INVALID_DATE_FORMAT',
                value: message.match(/([A-Z_0-9]+) specified/)?.[1]
            };
        }
        
        if (message.includes('Operators') && message.includes('do not work')) {
            return {
                type: 'INVALID_OPERATOR',
                operator: message.match(/Operators '([^']+)'/)?.[1]
            };
        }
        
        return { type: 'UNKNOWN', message };
    }

    /**
     * Get suggestion for error
     */
    getSuggestion(errorDetail) {
        switch (errorDetail.type) {
            case 'INVALID_REPORT_TYPE':
                return 'Use API token from GET /analytics/report-types, not UI label';
            case 'INVALID_COLUMN':
                return 'Use GET /analytics/report-types/{type} to find valid field tokens';
            case 'INVALID_DATE_FORMAT':
                return 'Use LAST_N_DAYS:90 format, not LAST_90_DAYS';
            case 'INVALID_OPERATOR':
                return 'Use "equals" for RecordType, not "contains"';
            default:
                return 'Check report metadata structure and field tokens';
        }
    }

    /**
     * Create report only after validation
     */
    async createIfValid(metadata) {
        // Step 1: Validate
        const validation = await this.validateReport(metadata);
        
        if (!validation.valid) {
            this.failedReports.push({
                name: metadata.name,
                error: validation.error,
                suggestion: validation.suggestion
            });
            return null;
        }
        
        // Step 2: Check write permission
        if (process.env.ENABLE_WRITE !== '1') {
            console.log('  ℹ️  Validation passed but ENABLE_WRITE not set');
            this.validatedReports.push({
                name: metadata.name,
                status: 'validated_only'
            });
            return null;
        }
        
        // Step 3: Create
        console.log('  📝 Creating report...');
        
        try {
            const result = await this.api.createReport(metadata);
            console.log(`  ✅ Created: ${result.reportId}`);
            console.log(`  🔗 URL: ${result.url}`);
            
            this.validatedReports.push({
                name: metadata.name,
                reportId: result.reportId,
                url: result.url,
                status: 'created'
            });
            
            return result;
            
        } catch (error) {
            console.log(`  ❌ Creation failed: ${error.message}`);
            this.failedReports.push({
                name: metadata.name,
                error: error.message,
                phase: 'creation'
            });
            return null;
        }
    }
    
    /**
     * Configure strategies for specific scenarios
     */
    configureStrategies(reportType) {
        // Activities always prefer clone
        if (reportType && reportType.toLowerCase().includes('activity')) {
            this.strategies = [
                'clone-seed',
                'clone-similar',
                'upsert',
                'manual-instructions'
            ];
        }
        // Reset to default for others
        else {
            this.strategies = [
                'upsert',
                'direct-create',
                'clone-seed',
                'manual-instructions'
            ];
        }
    }

    /**
     * Create standard reports with correct tokens
     */
    async createStandardReports() {
        console.log('\n📊 Creating Standard Reports with Validation\n');
        
        // Get folders
        const folders = await this.api.getWritableFolders();
        if (folders.length === 0) {
            throw new Error('No writable folders found');
        }
        const folderId = folders[0].id;
        console.log(`Using folder: ${folders[0].name}\n`);
        
        // Load mappings if available
        const mappings = await this.loadMappings();
        
        // Define reports with correct API tokens
        const reports = [
            {
                name: 'Lead Analysis',
                reportType: { type: 'LeadList' }, // Correct API token
                reportFormat: 'SUMMARY',
                folderId: folderId,
                detailColumns: [
                    'LEAD_NAME',
                    'COMPANY',
                    'STATUS',
                    'LEAD_SOURCE'
                ],
                groupingsDown: [{
                    name: 'STATUS',
                    sortOrder: 'ASC'
                }],
                reportFilters: [{
                    column: 'CREATED_DATE',
                    operator: 'equals',
                    value: 'LAST_N_DAYS:30' // Correct format
                }],
                aggregates: [{ name: 'RowCount' }]
            },
            {
                name: 'Contact Summary',
                reportType: { type: 'ContactList' }, // Correct API token
                reportFormat: 'TABULAR',
                folderId: folderId,
                detailColumns: [
                    'CONTACT_NAME',
                    'ACCOUNT_NAME',
                    'EMAIL',
                    'PHONE'
                ]
            },
            {
                name: 'Opportunity Pipeline',
                reportType: { type: 'Opportunity' }, // This one works
                reportFormat: 'MATRIX',
                folderId: folderId,
                groupingsAcross: [{
                    name: 'CLOSE_MONTH',
                    sortOrder: 'ASC',
                    dateGranularity: 'MONTH' // Required for matrix
                }],
                groupingsDown: [{
                    name: 'STAGE_NAME',
                    sortOrder: 'ASC'
                }],
                aggregates: [
                    { name: 'AMOUNT' },
                    { name: 'RowCount' }
                ]
            }
        ];
        
        // Try to create each report
        for (const reportDef of reports) {
            await this.createIfValid(reportDef);
        }
    }

    /**
     * Fix common metadata issues
     */
    fixMetadata(metadata) {
        const fixed = { ...metadata };
        
        // Fix date format
        if (fixed.reportFilters) {
            fixed.reportFilters = fixed.reportFilters.map(filter => {
                if (filter.value === 'LAST_90_DAYS') {
                    return { ...filter, value: 'LAST_N_DAYS:90' };
                }
                if (filter.value === 'LAST_30_DAYS') {
                    return { ...filter, value: 'LAST_N_DAYS:30' };
                }
                return filter;
            });
        }
        
        // Fix matrix date granularity
        if (metadata.reportFormat === 'MATRIX') {
            if (fixed.groupingsAcross) {
                fixed.groupingsAcross = fixed.groupingsAcross.map(g => {
                    if (g.name.includes('DATE') && !g.dateGranularity) {
                        return { ...g, dateGranularity: 'DAY' };
                    }
                    return g;
                });
            }
        }
        
        // Fix operator for RecordType
        if (fixed.reportFilters) {
            fixed.reportFilters = fixed.reportFilters.map(filter => {
                if (filter.column === 'RECORDTYPE' && filter.operator === 'contains') {
                    return { ...filter, operator: 'equals' };
                }
                return filter;
            });
        }
        
        return fixed;
    }

    /**
     * Generate summary
     */
    generateSummary() {
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('VALIDATION SUMMARY');
        console.log('═══════════════════════════════════════════════════════════');
        
        console.log(`\n✅ Validated/Created: ${this.validatedReports.length}`);
        this.validatedReports.forEach(r => {
            if (r.status === 'created') {
                console.log(`  • ${r.name} (${r.reportId})`);
            } else {
                console.log(`  • ${r.name} (validated only)`);
            }
        });
        
        if (this.failedReports.length > 0) {
            console.log(`\n❌ Failed: ${this.failedReports.length}`);
            this.failedReports.forEach(r => {
                console.log(`  • ${r.name}`);
                console.log(`    Error: ${r.error}`);
                if (r.suggestion) {
                    console.log(`    Fix: ${r.suggestion}`);
                }
            });
        }
        
        console.log('\n═══════════════════════════════════════════════════════════\n');
    }
}

async function main() {
    const org = process.env.ORG;
    if (!org) {
        console.error('Set ORG environment variable first');
        process.exit(1);
    }
    
    console.log(`
═══════════════════════════════════════════════════════════════
VALIDATION-FIRST REPORT CREATOR
ORG: ${org}
Mode: ${process.env.ENABLE_WRITE === '1' ? 'CREATE' : 'VALIDATE ONLY'}
═══════════════════════════════════════════════════════════════
`);
    
    try {
        const api = await ReportsRestAPI.fromSFAuth(org);
        const creator = new ValidationFirstCreator(api);
        
        // Create standard reports
        await creator.createStandardReports();
        
        // Show summary
        creator.generateSummary();
        
        // Save results
        const resultsFile = 'validation-results.json';
        await fs.writeFile(
            resultsFile,
            JSON.stringify({
                timestamp: new Date().toISOString(),
                org: org,
                validated: creator.validatedReports,
                failed: creator.failedReports
            }, null, 2)
        );
        console.log(`Results saved to ${resultsFile}`);
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = ValidationFirstCreator;