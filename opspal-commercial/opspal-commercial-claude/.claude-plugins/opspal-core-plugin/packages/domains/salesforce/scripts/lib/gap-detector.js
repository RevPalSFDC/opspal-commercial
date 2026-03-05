#!/usr/bin/env node

/**
 * Gap Detector for Reports & Dashboards Usage Audit
 *
 * Identifies gaps in reporting coverage:
 * - Departments with no/low reporting activity
 * - Missing dashboards for departments
 * - Critical fields never used in reports
 * - Stale reports/dashboards (>6 months unused)
 * - Filter compliance violations
 *
 * Usage:
 *   node gap-detector.js --input <audit-dir> --output <gaps.json>
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const fs = require('fs').promises;
const path = require('path');

// Critical fields that should be reported on (example - can be customized)
const CRITICAL_FIELDS = {
    Sales: ['Opportunity.Amount', 'Opportunity.CloseDate', 'Opportunity.StageName', 'Opportunity.ForecastCategory'],
    Marketing: ['Campaign.Name', 'Lead.Source', 'Lead.Status', 'Lead.ConversionRate'],
    Support: ['Case.Status', 'Case.Priority', 'Case.CSAT_Score__c'],
    'Customer Success': ['Account.Health_Score__c', 'Account.Renewal_Date__c', 'Account.Churn_Risk__c']
};

const PRIORITY_LEVELS = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
};

class GapDetector {
    constructor(inputDir, outputPath) {
        this.inputDir = inputDir;
        this.outputPath = outputPath;
        this.usageMetrics = null;
        this.departmentClassification = null;
        this.fieldUsage = null;
        this.filterPatterns = null;
        this.gaps = [];
    }

    /**
     * Load all analysis JSON files
     */
    async loadAnalysisFiles() {
        console.log(`\n📖 Loading analysis files from ${this.inputDir}...`);

        // Load usage metrics
        const usageMetricsPath = path.join(this.inputDir, 'usage-metrics.json');
        const usageMetricsData = await fs.readFile(usageMetricsPath, 'utf8');
        this.usageMetrics = JSON.parse(usageMetricsData);

        // Load department classification
        const departmentClassificationPath = path.join(this.inputDir, 'department-classification.json');
        const departmentClassificationData = await fs.readFile(departmentClassificationPath, 'utf8');
        this.departmentClassification = JSON.parse(departmentClassificationData);

        // Load field usage
        const fieldUsagePath = path.join(this.inputDir, 'field-usage.json');
        const fieldUsageData = await fs.readFile(fieldUsagePath, 'utf8');
        this.fieldUsage = JSON.parse(fieldUsageData);

        // Load filter patterns
        const filterPatternsPath = path.join(this.inputDir, 'filter-patterns.json');
        const filterPatternsData = await fs.readFile(filterPatternsPath, 'utf8');
        this.filterPatterns = JSON.parse(filterPatternsData);

        console.log(`✓ Loaded all analysis files`);
    }

    /**
     * Detect departments with no/low reporting activity
     */
    detectDepartmentGaps() {
        console.log('\n🔍 Detecting department gaps...');

        const summary = this.departmentClassification.classifications.summary;

        for (const [dept, data] of Object.entries(summary)) {
            // Gap 1: No reports
            if (data.totalReports === 0) {
                this.gaps.push({
                    gapType: 'No reports',
                    department: dept,
                    priority: PRIORITY_LEVELS.HIGH,
                    description: `${dept} has 0 reports`,
                    recommendation: `Create basic reports for ${dept} (e.g., ${this.suggestReportType(dept)})`
                });
            }

            // Gap 2: No active reports (all stale)
            if (data.totalReports > 0 && data.activeReports === 0) {
                this.gaps.push({
                    gapType: 'No active reports',
                    department: dept,
                    priority: PRIORITY_LEVELS.HIGH,
                    description: `${dept} has ${data.totalReports} reports but none used in last 6 months`,
                    recommendation: `Review and retire unused reports or promote existing reports to ${dept} team`
                });
            }

            // Gap 3: Low report activity (<3 active reports)
            if (data.activeReports > 0 && data.activeReports < 3) {
                this.gaps.push({
                    gapType: 'Low report activity',
                    department: dept,
                    priority: PRIORITY_LEVELS.MEDIUM,
                    description: `${dept} has only ${data.activeReports} active reports (low engagement)`,
                    recommendation: `Create additional reports or train team on existing reports`
                });
            }

            // Gap 4: No dashboards
            if (data.totalDashboards === 0) {
                this.gaps.push({
                    gapType: 'No dashboards',
                    department: dept,
                    priority: PRIORITY_LEVELS.MEDIUM,
                    description: `${dept} has 0 dashboards (no at-a-glance visibility)`,
                    recommendation: `Create executive dashboard for ${dept} team (use templates from reports-dashboards framework)`
                });
            }
        }

        console.log(`✓ Detected ${this.gaps.length} department-level gaps`);
    }

    /**
     * Detect critical fields not used in reports
     */
    detectFieldGaps() {
        console.log('\n🔍 Detecting field gaps (critical fields unused)...');

        const fieldUsageMap = {};
        this.fieldUsage.fieldUsage.forEach(field => {
            fieldUsageMap[field.field] = field.usageCount;
        });

        for (const [dept, criticalFields] of Object.entries(CRITICAL_FIELDS)) {
            criticalFields.forEach(field => {
                const usageCount = fieldUsageMap[field] || 0;

                if (usageCount === 0) {
                    this.gaps.push({
                        gapType: 'Critical field unused',
                        department: dept,
                        priority: PRIORITY_LEVELS.HIGH,
                        description: `Critical field "${field}" never used in reports`,
                        recommendation: `Create report using ${field} for ${dept} team visibility`
                    });
                } else if (usageCount === 1) {
                    this.gaps.push({
                        gapType: 'Critical field rarely used',
                        department: dept,
                        priority: PRIORITY_LEVELS.LOW,
                        description: `Critical field "${field}" used in only 1 report`,
                        recommendation: `Increase visibility of ${field} in additional reports or dashboards`
                    });
                }
            });
        }

        console.log(`✓ Detected ${this.gaps.filter(g => g.gapType.includes('field')).length} field-level gaps`);
    }

    /**
     * Detect stale reports/dashboards
     */
    detectStaleInventory() {
        console.log('\n🔍 Detecting stale reports and dashboards...');

        const staleReports = this.usageMetrics.reports.filter(r => !r.isActive);
        const staleDashboards = this.usageMetrics.dashboards.filter(d => !d.isActive);

        if (staleReports.length > 0) {
            this.gaps.push({
                gapType: 'Stale reports',
                department: 'All',
                priority: PRIORITY_LEVELS.MEDIUM,
                description: `${staleReports.length} reports not run in >6 months`,
                recommendation: `Review stale reports for deletion (see stale-reports list in usage-stats.csv)`,
                count: staleReports.length
            });
        }

        if (staleDashboards.length > 0) {
            this.gaps.push({
                gapType: 'Stale dashboards',
                department: 'All',
                priority: PRIORITY_LEVELS.MEDIUM,
                description: `${staleDashboards.length} dashboards not viewed in >6 months`,
                recommendation: `Review stale dashboards for deletion or promotion`,
                count: staleDashboards.length
            });
        }

        console.log(`✓ Detected stale inventory gaps (${staleReports.length} reports, ${staleDashboards.length} dashboards)`);
    }

    /**
     * Detect filter compliance gaps
     */
    detectFilterGaps() {
        console.log('\n🔍 Detecting filter compliance gaps...');

        const violationsCount = this.filterPatterns.violations.length;

        if (violationsCount > 0) {
            // Group violations by severity
            const highSeverity = this.filterPatterns.violations.filter(v => v.severity === 'high');
            const mediumSeverity = this.filterPatterns.violations.filter(v => v.severity === 'medium');

            if (highSeverity.length > 0) {
                this.gaps.push({
                    gapType: 'Filter compliance (high severity)',
                    department: 'All',
                    priority: PRIORITY_LEVELS.HIGH,
                    description: `${highSeverity.length} reports have NO filters (performance and usability risk)`,
                    recommendation: `Add filters to reports (see violations list in filter-patterns.json)`,
                    count: highSeverity.length
                });
            }

            if (mediumSeverity.length > 0) {
                this.gaps.push({
                    gapType: 'Filter compliance (medium severity)',
                    department: 'All',
                    priority: PRIORITY_LEVELS.MEDIUM,
                    description: `${mediumSeverity.length} reports missing date filters`,
                    recommendation: `Add date filters to improve performance and relevance`,
                    count: mediumSeverity.length
                });
            }
        }

        console.log(`✓ Detected ${violationsCount} filter compliance gaps`);
    }

    /**
     * Suggest report type based on department
     */
    suggestReportType(department) {
        const suggestions = {
            Sales: 'Pipeline by Stage, Win-Loss Analysis, Quota Attainment',
            Marketing: 'Lead Funnel, Campaign ROI, MQL to SQL Conversion',
            Support: 'Case Trends, Support Backlog, CSAT by Agent',
            'Customer Success': 'Account Health, Renewal Pipeline, NPS Trends',
            Finance: 'Revenue by Product, AR Aging, Billing Forecast',
            Executive: 'Revenue Performance, Pipeline Health, Team Productivity'
        };

        return suggestions[department] || 'standard reports for business operations';
    }

    /**
     * Generate gaps JSON
     */
    async generateGapsJSON() {
        console.log(`\n💾 Saving gaps analysis to ${this.outputPath}...`);

        // Sort gaps by priority (high -> medium -> low)
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        const sortedGaps = this.gaps.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        // Summary by gap type
        const gapTypeSummary = {};
        sortedGaps.forEach(gap => {
            if (!gapTypeSummary[gap.gapType]) {
                gapTypeSummary[gap.gapType] = 0;
            }
            gapTypeSummary[gap.gapType]++;
        });

        const output = {
            metadata: {
                inputDir: this.inputDir,
                generatedDate: new Date().toISOString(),
                generatedBy: 'gap-detector.js v1.0.0',
                orgAlias: this.usageMetrics.metadata.orgAlias
            },
            summary: {
                totalGaps: sortedGaps.length,
                highPriority: sortedGaps.filter(g => g.priority === PRIORITY_LEVELS.HIGH).length,
                mediumPriority: sortedGaps.filter(g => g.priority === PRIORITY_LEVELS.MEDIUM).length,
                lowPriority: sortedGaps.filter(g => g.priority === PRIORITY_LEVELS.LOW).length,
                gapTypeBreakdown: gapTypeSummary
            },
            gaps: sortedGaps
        };

        await fs.writeFile(this.outputPath, JSON.stringify(output, null, 2));
        console.log(`✓ Saved gaps analysis`);

        // Print summary
        console.log(`\n📊 Gaps Summary:`);
        console.log(`  Total gaps: ${sortedGaps.length}`);
        console.log(`  High priority: ${output.summary.highPriority}`);
        console.log(`  Medium priority: ${output.summary.mediumPriority}`);
        console.log(`  Low priority: ${output.summary.lowPriority}`);
        console.log(`\n  Top 5 gaps:`);
        sortedGaps.slice(0, 5).forEach((gap, i) => {
            console.log(`    ${i + 1}. [${gap.priority.toUpperCase()}] ${gap.description}`);
        });
    }

    /**
     * Execute full gap detection workflow
     */
    async execute() {
        console.log(`\n🔍 Gap Detector for Reports & Dashboards`);

        try {
            await this.loadAnalysisFiles();
            this.detectDepartmentGaps();
            this.detectFieldGaps();
            this.detectStaleInventory();
            this.detectFilterGaps();
            await this.generateGapsJSON();

            console.log(`\n✅ Gap detection complete!`);
            return this.outputPath;
        } catch (error) {
            console.error(`\n❌ Gap detection failed: ${error.message}`);
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
        console.error('Usage: node gap-detector.js --input <audit-dir> --output <gaps.json>');
        process.exit(1);
    }

    (async () => {
        try {
            const detector = new GapDetector(options.input, options.output);
            await detector.execute();
            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = GapDetector;
