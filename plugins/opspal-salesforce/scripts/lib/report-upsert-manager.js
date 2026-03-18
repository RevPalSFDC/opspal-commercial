#!/usr/bin/env node

/**
 * Report Upsert Manager
 * 
 * Provides idempotent report creation/update operations
 * using deterministic developer names to prevent duplicates.
 */

const crypto = require('crypto');

class ReportUpsertManager {
    constructor(api) {
        this.api = api; // ReportsRestAPI instance
        this.org = api.org;
        this.apiVersion = api.apiVersion || 'v64.0';
    }

    /**
     * Generate deterministic developer name from template and folder
     */
    generateDeveloperName(templateKey, options = {}) {
        // Components for deterministic name
        const components = [
            templateKey,
            options.folderId || 'default',
            options.format || 'TABULAR',
            options.variant || ''
        ].filter(Boolean);
        
        // Create hash for uniqueness
        const hash = crypto
            .createHash('md5')
            .update(components.join('_'))
            .digest('hex')
            .substring(0, 8);
        
        // Build developer name (max 40 chars for Salesforce)
        let devName = `${templateKey}_${hash}`.substring(0, 40);
        
        // Ensure valid characters (alphanumeric and underscore only)
        devName = devName.replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Ensure it starts with a letter
        if (!/^[a-zA-Z]/.test(devName)) {
            devName = 'R_' + devName.substring(0, 38);
        }
        
        return devName;
    }

    /**
     * Check if report exists by developer name
     */
    async findReportByDeveloperName(developerName) {
        try {
            // Use SOQL to find report
            const query = `SELECT Id, Name, DeveloperName, FolderId, LastModifiedDate 
                          FROM Report 
                          WHERE DeveloperName = '${developerName}' 
                          LIMIT 1`;
            
            const endpoint = `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(query)}`;
            const result = await this.api.apiRequest(endpoint);
            
            if (result.records && result.records.length > 0) {
                return result.records[0];
            }
            
            return null;
        } catch (error) {
            console.warn(`Unable to check for existing report: ${error.message}`);
            return null;
        }
    }

    /**
     * Upsert a report (create or update)
     */
    async upsertReport(metadata, options = {}) {
        // Generate developer name if not provided
        const templateKey = options.templateKey || 'custom';
        const developerName = metadata.developerName || 
                            this.generateDeveloperName(templateKey, {
                                folderId: metadata.folderId,
                                format: metadata.reportFormat,
                                variant: options.variant
                            });
        
        // Add developer name to metadata
        metadata.developerName = developerName;
        
        console.log(`\n🔄 Upserting report with developerName: ${developerName}`);
        
        // Check if report already exists
        const existing = await this.findReportByDeveloperName(developerName);
        
        if (existing) {
            console.log(`  📝 Found existing report: ${existing.Name} (${existing.Id})`);
            return await this.updateReport(existing.Id, metadata, options);
        } else {
            console.log(`  ✨ Creating new report...`);
            return await this.createReport(metadata, options);
        }
    }

    /**
     * Create new report
     */
    async createReport(metadata, options = {}) {
        try {
            // Ensure we have write permission
            if (!this.api.enableWrite && !options.forceWrite) {
                return {
                    success: false,
                    operation: 'create',
                    message: 'Write operations disabled. Set ENABLE_WRITE=1',
                    wouldCreate: true,
                    metadata
                };
            }
            
            // Auto-fix common issues
            const fixed = await this.api.autoFixMetadata(metadata);
            
            // Validate before creation
            const validation = await this.api.validateReportMetadata(fixed);
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.message}`);
            }
            
            // Create the report
            const result = await this.api.createReport(fixed);
            
            return {
                success: true,
                operation: 'create',
                id: result.reportId,
                name: result.reportName,
                url: result.url,
                developerName: metadata.developerName,
                folderId: metadata.folderId,
                message: `Created new report: ${result.reportName}`
            };
            
        } catch (error) {
            return {
                success: false,
                operation: 'create',
                error: error.message,
                developerName: metadata.developerName,
                suggestion: this.api.getSuggestionForError(error)
            };
        }
    }

    /**
     * Update existing report
     */
    async updateReport(reportId, metadata, options = {}) {
        try {
            // Check if update is needed
            if (options.skipIfUnchanged) {
                const current = await this.getReportMetadata(reportId);
                if (this.isMetadataEqual(current, metadata)) {
                    return {
                        success: true,
                        operation: 'skip',
                        id: reportId,
                        message: 'Report unchanged, skipping update',
                        developerName: metadata.developerName
                    };
                }
            }
            
            // Ensure we have write permission
            if (!this.api.enableWrite && !options.forceWrite) {
                return {
                    success: false,
                    operation: 'update',
                    message: 'Write operations disabled. Set ENABLE_WRITE=1',
                    wouldUpdate: true,
                    id: reportId,
                    metadata
                };
            }
            
            // Auto-fix common issues
            const fixed = await this.api.autoFixMetadata(metadata);
            
            // Remove fields that can't be updated
            delete fixed.developerName; // Can't update developer name
            delete fixed.folderId; // Folder moves require different API
            
            // Update the report
            const endpoint = `/services/data/${this.apiVersion}/analytics/reports/${reportId}`;
            const result = await this.api.apiRequest(endpoint, 'PATCH', { 
                reportMetadata: fixed 
            });
            
            return {
                success: true,
                operation: 'update',
                id: reportId,
                name: fixed.name,
                url: `${this.api.instanceUrl}/lightning/r/Report/${reportId}/view`,
                developerName: metadata.developerName,
                message: `Updated existing report: ${fixed.name}`,
                previousVersion: options.skipIfUnchanged ? 'unchanged' : 'modified'
            };
            
        } catch (error) {
            return {
                success: false,
                operation: 'update',
                id: reportId,
                error: error.message,
                developerName: metadata.developerName,
                suggestion: 'Check if report is locked or if you have edit permissions'
            };
        }
    }

    /**
     * Get report metadata
     */
    async getReportMetadata(reportId) {
        const endpoint = `/services/data/${this.apiVersion}/analytics/reports/${reportId}/describe`;
        const result = await this.api.apiRequest(endpoint);
        return result.reportMetadata;
    }

    /**
     * Check if metadata is essentially equal (ignoring timestamps)
     */
    isMetadataEqual(meta1, meta2) {
        // Compare key fields
        const fields = [
            'reportType.type',
            'reportFormat',
            'detailColumns',
            'groupingsDown',
            'groupingsAcross',
            'reportFilters',
            'aggregates'
        ];
        
        for (const field of fields) {
            const val1 = this.getNestedValue(meta1, field);
            const val2 = this.getNestedValue(meta2, field);
            
            if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Get nested object value by path
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Batch upsert multiple reports
     */
    async batchUpsert(reports, options = {}) {
        const results = {
            successful: [],
            failed: [],
            skipped: [],
            total: reports.length
        };
        
        console.log(`\n📦 Batch upserting ${reports.length} reports...`);
        
        for (const report of reports) {
            const { metadata, templateKey, ...reportOptions } = report;
            
            try {
                const result = await this.upsertReport(metadata, {
                    templateKey,
                    ...options,
                    ...reportOptions
                });
                
                if (result.success) {
                    if (result.operation === 'skip') {
                        results.skipped.push(result);
                    } else {
                        results.successful.push(result);
                    }
                } else {
                    results.failed.push(result);
                }
                
            } catch (error) {
                results.failed.push({
                    metadata,
                    error: error.message,
                    templateKey
                });
            }
            
            // Progress indicator
            const progress = results.successful.length + results.failed.length + results.skipped.length;
            console.log(`  Progress: ${progress}/${results.total}`);
        }
        
        // Summary
        console.log('\n📊 Batch Upsert Results:');
        console.log(`  ✅ Successful: ${results.successful.length}`);
        console.log(`  ⏭️  Skipped: ${results.skipped.length}`);
        console.log(`  ❌ Failed: ${results.failed.length}`);
        
        return results;
    }

    /**
     * Find duplicate reports (same name in same folder)
     */
    async findDuplicates(folderIds = []) {
        const query = folderIds.length > 0
            ? `SELECT Id, Name, DeveloperName, FolderId, CreatedDate 
               FROM Report 
               WHERE FolderId IN ('${folderIds.join("','")}')
               ORDER BY Name, CreatedDate`
            : `SELECT Id, Name, DeveloperName, FolderId, CreatedDate 
               FROM Report 
               ORDER BY Name, CreatedDate`;
        
        const endpoint = `/services/data/${this.apiVersion}/query?q=${encodeURIComponent(query)}`;
        const result = await this.api.apiRequest(endpoint);
        
        // Group by name and folder
        const groups = {};
        for (const report of result.records) {
            const key = `${report.FolderId}_${report.Name}`;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(report);
        }
        
        // Find duplicates
        const duplicates = [];
        for (const [key, reports] of Object.entries(groups)) {
            if (reports.length > 1) {
                duplicates.push({
                    name: reports[0].Name,
                    folderId: reports[0].FolderId,
                    count: reports.length,
                    reports: reports.map(r => ({
                        id: r.Id,
                        developerName: r.DeveloperName,
                        created: r.CreatedDate
                    }))
                });
            }
        }
        
        return duplicates;
    }

    /**
     * Clean up duplicate reports (keep newest)
     */
    async cleanDuplicates(duplicates, options = {}) {
        const results = {
            deleted: [],
            kept: [],
            errors: []
        };

        // Step 1: Collect all reports to keep and delete (no I/O yet)
        const allToDelete = [];

        for (const dup of duplicates) {
            // Sort by creation date, keep the newest
            const sorted = dup.reports.sort((a, b) =>
                new Date(b.created) - new Date(a.created)
            );

            const toKeep = sorted[0];
            const toDelete = sorted.slice(1);

            results.kept.push(toKeep);
            allToDelete.push(...toDelete);
        }

        console.log(`📊 Deleting ${allToDelete.length} duplicate reports in parallel...`);

        // Step 2: Delete all reports in parallel (optimized)
        if (!options.dryRun) {
            const deleteResults = await Promise.all(
                allToDelete.map(async (report) => {
                    try {
                        await this.api.deleteReport(report.id);
                        return { success: true, report };
                    } catch (error) {
                        return {
                            success: false,
                            report,
                            error: error.message
                        };
                    }
                })
            );

            // Categorize results
            deleteResults.forEach(result => {
                if (result.success) {
                    results.deleted.push(result.report);
                } else {
                    results.errors.push({
                        report: result.report,
                        error: result.error
                    });
                }
            });

            console.log(`✅ Deleted ${results.deleted.length}/${allToDelete.length} reports`);
            if (results.errors.length > 0) {
                console.warn(`⚠️  ${results.errors.length} deletions failed`);
            }
        } else {
            results.deleted.push(...allToDelete.map(r => ({ ...r, dryRun: true })));
        }

        return results;
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
Report Upsert Manager

Usage:
  node report-upsert-manager.js generate <key>     Generate developer name
  node report-upsert-manager.js find <devName>      Find report by developer name
  node report-upsert-manager.js duplicates          Find duplicate reports
  node report-upsert-manager.js clean               Clean duplicate reports (dry run)
  node report-upsert-manager.js clean --force       Clean duplicate reports (execute)
  
Environment:
  ORG=${org}
  ENABLE_WRITE=${process.env.ENABLE_WRITE || '0'}
`);
        return;
    }
    
    const ReportsRestAPI = require('./reports-rest-api');
    const api = await ReportsRestAPI.fromSFAuth(org);
    const manager = new ReportUpsertManager(api);
    
    switch (command) {
        case 'generate':
            const key = process.argv[3] || 'test';
            const devName = manager.generateDeveloperName(key, {
                folderId: process.argv[4],
                format: process.argv[5]
            });
            console.log(`Developer Name: ${devName}`);
            break;
            
        case 'find':
            const searchName = process.argv[3];
            if (!searchName) {
                console.error('Usage: find <developerName>');
                process.exit(1);
            }
            const report = await manager.findReportByDeveloperName(searchName);
            if (report) {
                console.log(JSON.stringify(report, null, 2));
            } else {
                console.log(`No report found with developer name: ${searchName}`);
            }
            break;
            
        case 'duplicates':
            const dups = await manager.findDuplicates();
            console.log(`\nFound ${dups.length} duplicate report groups:\n`);
            dups.forEach(d => {
                console.log(`📄 ${d.name} (${d.count} copies)`);
                d.reports.forEach(r => {
                    console.log(`   - ${r.id} (${r.developerName || 'no dev name'})`);
                });
            });
            break;
            
        case 'clean':
            const forceClean = process.argv[3] === '--force';
            const duplicates = await manager.findDuplicates();
            
            if (duplicates.length === 0) {
                console.log('✅ No duplicates found');
                return;
            }
            
            const cleanResults = await manager.cleanDuplicates(duplicates, {
                dryRun: !forceClean
            });
            
            console.log('\n🧹 Clean Results:');
            console.log(`  Kept: ${cleanResults.kept.length}`);
            console.log(`  ${forceClean ? 'Deleted' : 'Would delete'}: ${cleanResults.deleted.length}`);
            if (cleanResults.errors.length > 0) {
                console.log(`  Errors: ${cleanResults.errors.length}`);
            }
            
            if (!forceClean) {
                console.log('\n💡 Run with --force to actually delete duplicates');
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

module.exports = ReportUpsertManager;