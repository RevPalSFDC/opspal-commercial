#!/usr/bin/env node

/**
 * Filter Pattern Analyzer for Reports
 *
 * Analyzes filter usage patterns across all reports to identify:
 * - Reports missing date filters (best practice violation)
 * - Reports missing owner/team filters (context-dependent)
 * - Common filter fields and values
 * - Filter compliance with best practices
 *
 * Usage:
 *   node filter-pattern-analyzer.js --input <usage-metrics.json> --output <filter-patterns.json>
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const fs = require('fs').promises;

// Best practice rules
const BEST_PRACTICES = {
    // Date filter fields (common date fields that should be filtered)
    dateFields: ['CloseDate', 'CreatedDate', 'LastModifiedDate', 'ActivityDate', 'LastViewedDate', 'LastActivityDate'],

    // Owner/team filter fields
    ownerFields: ['OwnerId', 'Owner.Name', 'Owner.Role', 'AccountOwnerId'],

    // Common filter operators
    operators: ['equals', 'notEqual', 'lessThan', 'greaterThan', 'lessOrEqual', 'greaterOrEqual', 'contains', 'notContain', 'startsWith', 'includes', 'excludes']
};

class FilterPatternAnalyzer {
    constructor(inputPath, outputPath) {
        this.inputPath = inputPath;
        this.outputPath = outputPath;
        this.usageMetrics = null;
        this.filterPatterns = {
            withDateFilter: [],
            withoutDateFilter: [],
            withOwnerFilter: [],
            withoutOwnerFilter: [],
            commonFilters: {},
            violations: []
        };
    }

    /**
     * Load usage metrics JSON
     */
    async loadUsageMetrics() {
        console.log(`\n📖 Loading usage metrics from ${this.inputPath}...`);
        const data = await fs.readFile(this.inputPath, 'utf8');
        this.usageMetrics = JSON.parse(data);
        console.log(`✓ Loaded metadata for ${Object.keys(this.usageMetrics.reportFieldMetadata).length} reports`);
    }

    /**
     * Check if filter contains date field
     */
    hasDateFilter(filters) {
        if (!filters || !Array.isArray(filters)) return false;

        return filters.some(filter => {
            const column = filter.column || filter.field || '';
            return BEST_PRACTICES.dateFields.some(df => column.toLowerCase().includes(df.toLowerCase()));
        });
    }

    /**
     * Check if filter contains owner field
     */
    hasOwnerFilter(filters) {
        if (!filters || !Array.isArray(filters)) return false;

        return filters.some(filter => {
            const column = filter.column || filter.field || '';
            return BEST_PRACTICES.ownerFields.some(of => column.toLowerCase().includes(of.toLowerCase()));
        });
    }

    /**
     * Extract filter field names
     */
    extractFilterFields(filters) {
        if (!filters || !Array.isArray(filters)) return [];

        return filters.map(filter => filter.column || filter.field || 'Unknown').filter(f => f !== 'Unknown');
    }

    /**
     * Analyze filter patterns across all reports
     */
    analyzeFilterPatterns() {
        console.log('\n🔍 Analyzing filter patterns across all reports...');

        let totalReports = 0;
        let reportsWithDateFilter = 0;
        let reportsWithoutDateFilter = 0;
        let reportsWithOwnerFilter = 0;
        let reportsWithoutOwnerFilter = 0;

        for (const [reportId, metadata] of Object.entries(this.usageMetrics.reportFieldMetadata)) {
            // Skip reports with errors
            if (metadata.error) continue;

            const report = this.usageMetrics.reports.find(r => r.id === reportId);
            if (!report) continue;

            totalReports++;

            const filters = metadata.filters || [];
            const reportInfo = {
                id: reportId,
                name: report.name,
                folderName: report.folderName,
                isActive: report.isActive,
                filterCount: filters.length
            };

            // Check for date filter
            if (this.hasDateFilter(filters)) {
                this.filterPatterns.withDateFilter.push(reportInfo);
                reportsWithDateFilter++;
            } else {
                this.filterPatterns.withoutDateFilter.push(reportInfo);
                reportsWithoutDateFilter++;

                // Add to violations (missing date filter)
                this.filterPatterns.violations.push({
                    reportId: reportId,
                    reportName: report.name,
                    violation: 'No date filter',
                    severity: 'medium',
                    recommendation: 'Add a date filter (e.g., CloseDate, CreatedDate) to improve performance and relevance'
                });
            }

            // Check for owner filter (only for active reports - optional best practice)
            if (this.hasOwnerFilter(filters)) {
                this.filterPatterns.withOwnerFilter.push(reportInfo);
                reportsWithOwnerFilter++;
            } else {
                this.filterPatterns.withoutOwnerFilter.push(reportInfo);
                reportsWithoutOwnerFilter++;
            }

            // Track common filter fields
            const filterFields = this.extractFilterFields(filters);
            filterFields.forEach(field => {
                if (!this.filterPatterns.commonFilters[field]) {
                    this.filterPatterns.commonFilters[field] = {
                        field: field,
                        count: 0,
                        reports: []
                    };
                }

                this.filterPatterns.commonFilters[field].count++;
                this.filterPatterns.commonFilters[field].reports.push({
                    id: reportId,
                    name: report.name
                });
            });

            // Check for reports with NO filters (high severity violation)
            if (filters.length === 0) {
                this.filterPatterns.violations.push({
                    reportId: reportId,
                    reportName: report.name,
                    violation: 'No filters',
                    severity: 'high',
                    recommendation: 'Add filters to scope data (date range, owner, status, etc.) to improve performance and usability'
                });
            }
        }

        console.log(`✓ Analyzed ${totalReports} reports`);
        console.log(`  With date filter: ${reportsWithDateFilter} (${((reportsWithDateFilter / totalReports) * 100).toFixed(1)}%)`);
        console.log(`  Without date filter: ${reportsWithoutDateFilter} (${((reportsWithoutDateFilter / totalReports) * 100).toFixed(1)}%)`);
        console.log(`  With owner filter: ${reportsWithOwnerFilter} (${((reportsWithOwnerFilter / totalReports) * 100).toFixed(1)}%)`);
        console.log(`  Without owner filter: ${reportsWithoutOwnerFilter} (${((reportsWithoutOwnerFilter / totalReports) * 100).toFixed(1)}%)`);
        console.log(`  Violations: ${this.filterPatterns.violations.length}`);
    }

    /**
     * Generate filter pattern analysis
     */
    async generateFilterPatternsJSON() {
        console.log(`\n💾 Saving filter pattern analysis to ${this.outputPath}...`);

        // Sort common filters by count (descending)
        const sortedCommonFilters = Object.values(this.filterPatterns.commonFilters)
            .sort((a, b) => b.count - a.count);

        // Top 10 most common filters
        const topFilters = sortedCommonFilters.slice(0, 10).map(filter => ({
            field: filter.field,
            count: filter.count,
            percentage: ((filter.count / this.usageMetrics.reports.length) * 100).toFixed(1)
        }));

        const totalReports = Object.keys(this.usageMetrics.reportFieldMetadata).filter(id => !this.usageMetrics.reportFieldMetadata[id].error).length;

        const output = {
            metadata: {
                inputFile: this.inputPath,
                generatedDate: new Date().toISOString(),
                generatedBy: 'filter-pattern-analyzer.js v1.0.0',
                orgAlias: this.usageMetrics.metadata.orgAlias
            },
            summary: {
                totalReportsAnalyzed: totalReports,
                withDateFilter: this.filterPatterns.withDateFilter.length,
                withoutDateFilter: this.filterPatterns.withoutDateFilter.length,
                withOwnerFilter: this.filterPatterns.withOwnerFilter.length,
                withoutOwnerFilter: this.filterPatterns.withoutOwnerFilter.length,
                totalViolations: this.filterPatterns.violations.length,
                topFilters: topFilters
            },
            filterPatterns: {
                withDateFilter: this.filterPatterns.withDateFilter,
                withoutDateFilter: this.filterPatterns.withoutDateFilter,
                withOwnerFilter: this.filterPatterns.withOwnerFilter,
                withoutOwnerFilter: this.filterPatterns.withoutOwnerFilter
            },
            commonFilters: sortedCommonFilters,
            violations: this.filterPatterns.violations
        };

        await fs.writeFile(this.outputPath, JSON.stringify(output, null, 2));
        console.log(`✓ Saved filter pattern analysis`);

        // Print summary
        console.log(`\n📊 Filter Pattern Summary:`);
        console.log(`  Total reports analyzed: ${totalReports}`);
        console.log(`  With date filter: ${this.filterPatterns.withDateFilter.length} (${((this.filterPatterns.withDateFilter.length / totalReports) * 100).toFixed(1)}%)`);
        console.log(`  Without date filter: ${this.filterPatterns.withoutDateFilter.length} (${((this.filterPatterns.withoutDateFilter.length / totalReports) * 100).toFixed(1)}%)`);
        console.log(`  Top 5 most common filters:`);
        topFilters.slice(0, 5).forEach((filter, i) => {
            console.log(`    ${i + 1}. ${filter.field} (${filter.count} reports, ${filter.percentage}%)`);
        });
        console.log(`  Violations: ${this.filterPatterns.violations.length}`);
    }

    /**
     * Execute full analysis workflow
     */
    async execute() {
        console.log(`\n🔍 Filter Pattern Analyzer for Reports`);

        try {
            await this.loadUsageMetrics();
            this.analyzeFilterPatterns();
            await this.generateFilterPatternsJSON();

            console.log(`\n✅ Filter pattern analysis complete!`);
            return this.outputPath;
        } catch (error) {
            console.error(`\n❌ Analysis failed: ${error.message}`);
            throw error;
        }
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            options.input = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            options.output = args[i + 1];
            i++;
        }
    }

    if (!options.input || !options.output) {
        console.error('Usage: node filter-pattern-analyzer.js --input <usage-metrics.json> --output <filter-patterns.json>');
        process.exit(1);
    }

    (async () => {
        try {
            const analyzer = new FilterPatternAnalyzer(options.input, options.output);
            await analyzer.execute();
            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = FilterPatternAnalyzer;
