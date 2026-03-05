#!/usr/bin/env node

/**
 * Usage Audit Report Generator
 *
 * Generates comprehensive markdown report and CSV exports from usage audit data.
 * Combines all analysis outputs into a single executive summary with actionable insights.
 *
 * Usage:
 *   node usage-audit-report-generator.js --input <audit-dir> --org <org-alias>
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const fs = require('fs').promises;
const path = require('path');
const { RobustCSVParser } = require('./csv-schema-validator');

class UsageAuditReportGenerator {
    constructor(inputDir, orgAlias) {
        this.inputDir = inputDir;
        this.orgAlias = orgAlias;
        this.data = {};
        this.csvParser = new RobustCSVParser();
    }

    /**
     * Load all analysis files
     */
    async loadAnalysisFiles() {
        console.log(`\n📖 Loading analysis files from ${this.inputDir}...`);

        // Load usage metrics
        this.data.usageMetrics = JSON.parse(
            await fs.readFile(path.join(this.inputDir, 'usage-metrics.json'), 'utf8')
        );

        // Load department classification
        this.data.departmentClassification = JSON.parse(
            await fs.readFile(path.join(this.inputDir, 'department-classification.json'), 'utf8')
        );

        // Load field usage
        this.data.fieldUsage = JSON.parse(
            await fs.readFile(path.join(this.inputDir, 'field-usage.json'), 'utf8')
        );

        // Load filter patterns
        this.data.filterPatterns = JSON.parse(
            await fs.readFile(path.join(this.inputDir, 'filter-patterns.json'), 'utf8')
        );

        // Load gaps
        this.data.gaps = JSON.parse(
            await fs.readFile(path.join(this.inputDir, 'gaps.json'), 'utf8')
        );

        console.log(`✓ Loaded all analysis files`);
    }

    /**
     * Generate markdown report
     */
    async generateMarkdownReport() {
        console.log(`\n📝 Generating markdown report...`);

        const report = [];

        // Header
        report.push(`# Reports & Dashboards Usage Audit`);
        report.push(`**Org**: ${this.orgAlias}`);
        report.push(`**Period**: ${this.data.usageMetrics.metadata.cutoffDate} to ${new Date().toISOString().split('T')[0]} (${this.data.usageMetrics.metadata.windowMonths} months)`);
        report.push(`**Generated**: ${new Date().toISOString().split('T')[0]}`);
        report.push(``);

        // Executive Summary
        report.push(`## Executive Summary`);
        report.push(``);
        report.push(`- **Total Reports**: ${this.data.usageMetrics.summary.totalReports} (${this.data.usageMetrics.summary.activeReports} active, ${this.data.usageMetrics.summary.staleReports} stale)`);
        report.push(`- **Total Dashboards**: ${this.data.usageMetrics.summary.totalDashboards} (${this.data.usageMetrics.summary.activeDashboards} active, ${this.data.usageMetrics.summary.staleDashboards} stale)`);
        report.push(`- **Active Rate**: Reports ${((this.data.usageMetrics.summary.activeReports / this.data.usageMetrics.summary.totalReports) * 100).toFixed(1)}%, Dashboards ${((this.data.usageMetrics.summary.activeDashboards / this.data.usageMetrics.summary.totalDashboards) * 100).toFixed(1)}%`);
        report.push(`- **Departments Covered**: ${Object.keys(this.data.departmentClassification.classifications.summary).length}`);
        report.push(`- **Total Gaps Identified**: ${this.data.gaps.summary.totalGaps} (${this.data.gaps.summary.highPriority} high, ${this.data.gaps.summary.mediumPriority} medium, ${this.data.gaps.summary.lowPriority} low priority)`);
        report.push(``);

        // Key Findings
        report.push(`### Key Findings`);
        report.push(``);

        // Top used reports
        if (this.data.usageMetrics.topReports.length > 0) {
            const top = this.data.usageMetrics.topReports[0];
            report.push(`🎯 **Most Used Report**: ${top.name} (${top.timesRun} runs)`);
        }

        // Stale reports
        if (this.data.usageMetrics.summary.staleReports > 0) {
            report.push(`❌ **Stale Reports**: ${this.data.usageMetrics.summary.staleReports} reports not run in 6+ months`);
        }

        // Filter violations
        if (this.data.filterPatterns.summary.withoutDateFilter > 0) {
            report.push(`⚠️ **Filter Gaps**: ${this.data.filterPatterns.summary.withoutDateFilter} reports missing date filters`);
        }

        // Department gaps
        const deptGaps = this.data.gaps.gaps.filter(g => g.gapType.includes('No reports') || g.gapType.includes('No dashboards'));
        if (deptGaps.length > 0) {
            report.push(`📊 **Department Gaps**: ${deptGaps.length} departments with missing reporting`);
        }

        report.push(``);

        // Usage Metrics Section
        report.push(`## Usage Metrics`);
        report.push(``);

        // Top 10 Most Used Reports
        report.push(`### Top 10 Most Used Reports`);
        report.push(``);
        report.push(`| Report | Runs | Last Run | Folder |`);
        report.push(`|--------|------|----------|--------|`);
        this.data.usageMetrics.topReports.forEach(r => {
            report.push(`| ${r.name} | ${r.timesRun} | ${r.lastRunDate} | ${r.folderName} |`);
        });
        report.push(``);

        // Least Used Reports
        report.push(`### Top 10 Least Used Reports (Deletion Candidates)`);
        report.push(``);
        report.push(`| Report | Runs | Last Run | Folder |`);
        report.push(`|--------|------|----------|--------|`);
        this.data.usageMetrics.leastUsedReports.forEach(r => {
            report.push(`| ${r.name} | ${r.timesRun} | ${r.lastRunDate} | ${r.folderName} |`);
        });
        report.push(``);

        // Field Usage Analysis
        report.push(`## Field Usage Analysis`);
        report.push(``);

        // Top 10 Most Used Fields
        report.push(`### Most Used Fields (Top 10)`);
        report.push(``);
        report.push(`| Field | Reports | Object |`);
        report.push(`|-------|---------|--------|`);
        this.data.fieldUsage.summary.topFields.slice(0, 10).forEach(f => {
            report.push(`| ${f.field} | ${f.usageCount} | ${f.object} |`);
        });
        report.push(``);

        // Unused Critical Fields
        if (this.data.fieldUsage.rarelyUsedFields.length > 0) {
            report.push(`### Rarely Used Fields (≤1 report)`);
            report.push(``);
            report.push(`| Field | Object | Usage Count |`);
            report.push(`|-------|--------|-------------|`);
            this.data.fieldUsage.rarelyUsedFields.slice(0, 10).forEach(f => {
                report.push(`| ${f.field} | ${f.object} | ${f.usageCount} |`);
            });
            report.push(``);
        }

        // Filter Patterns
        report.push(`## Filter Patterns`);
        report.push(``);

        // Best Practice Compliance
        report.push(`### Best Practice Compliance`);
        report.push(``);
        report.push(`- **With Date Filter**: ${this.data.filterPatterns.summary.withDateFilter} reports (${((this.data.filterPatterns.summary.withDateFilter / this.data.filterPatterns.summary.totalReportsAnalyzed) * 100).toFixed(1)}%)`);
        report.push(`- **Without Date Filter**: ${this.data.filterPatterns.summary.withoutDateFilter} reports (${((this.data.filterPatterns.summary.withoutDateFilter / this.data.filterPatterns.summary.totalReportsAnalyzed) * 100).toFixed(1)}%)`);
        report.push(`- **With Owner Filter**: ${this.data.filterPatterns.summary.withOwnerFilter} reports (${((this.data.filterPatterns.summary.withOwnerFilter / this.data.filterPatterns.summary.totalReportsAnalyzed) * 100).toFixed(1)}%)`);
        report.push(`- **Violations**: ${this.data.filterPatterns.summary.totalViolations}`);
        report.push(``);

        // Common Filters
        report.push(`### Common Filter Fields (Top 5)`);
        report.push(``);
        report.push(`| Filter Field | Reports | Percentage |`);
        report.push(`|--------------|---------|------------|`);
        this.data.filterPatterns.summary.topFilters.slice(0, 5).forEach(f => {
            report.push(`| ${f.field} | ${f.count} | ${f.percentage}% |`);
        });
        report.push(``);

        // Department Breakdown
        report.push(`## Department Breakdown`);
        report.push(``);
        report.push(`| Department | Active Reports | Active Dashboards | Avg Confidence |`);
        report.push(`|------------|----------------|-------------------|----------------|`);
        const sortedDepts = Object.values(this.data.departmentClassification.classifications.summary)
            .sort((a, b) => b.totalReports - a.totalReports);
        sortedDepts.forEach(dept => {
            report.push(`| ${dept.department} | ${dept.activeReports} | ${dept.activeDashboards} | ${dept.avgConfidence} |`);
        });
        report.push(``);

        // Gap Analysis
        report.push(`## Gap Analysis`);
        report.push(``);

        // High Priority Gaps
        const highPriorityGaps = this.data.gaps.gaps.filter(g => g.priority === 'high');
        if (highPriorityGaps.length > 0) {
            report.push(`### High Priority Gaps (${highPriorityGaps.length})`);
            report.push(``);
            highPriorityGaps.forEach((gap, i) => {
                report.push(`${i + 1}. **${gap.description}**`);
                report.push(`   - *Department*: ${gap.department}`);
                report.push(`   - *Recommendation*: ${gap.recommendation}`);
                report.push(``);
            });
        }

        // Medium Priority Gaps
        const mediumPriorityGaps = this.data.gaps.gaps.filter(g => g.priority === 'medium');
        if (mediumPriorityGaps.length > 0) {
            report.push(`### Medium Priority Gaps (${mediumPriorityGaps.length})`);
            report.push(``);
            mediumPriorityGaps.slice(0, 5).forEach((gap, i) => {
                report.push(`${i + 1}. **${gap.description}**`);
                report.push(`   - *Department*: ${gap.department}`);
                report.push(`   - *Recommendation*: ${gap.recommendation}`);
                report.push(``);
            });
            if (mediumPriorityGaps.length > 5) {
                report.push(`*... and ${mediumPriorityGaps.length - 5} more medium priority gaps (see gaps.json)*`);
                report.push(``);
            }
        }

        // Recommendations
        report.push(`## Recommendations`);
        report.push(``);
        report.push(`1. **Cleanup Stale Reports**: Review and delete ${this.data.usageMetrics.summary.staleReports} reports not run in 6+ months`);
        report.push(`2. **Add Date Filters**: ${this.data.filterPatterns.summary.withoutDateFilter} reports missing date filters (performance risk)`);
        report.push(`3. **Fill Department Gaps**: ${deptGaps.length} departments need reporting coverage`);
        report.push(`4. **Promote High-Quality Reports**: Identify well-designed but underutilized reports for promotion`);
        report.push(``);

        // Footer
        report.push(`---`);
        report.push(`**Generated by**: Reports Usage Auditor v1.0.0`);
        report.push(`**Data files**: See CSV exports in this directory for detailed analysis`);

        // Save markdown report
        const reportPath = path.join(this.inputDir, 'AUDIT_REPORT.md');
        await fs.writeFile(reportPath, report.join('\n'));

        console.log(`✓ Saved markdown report to ${reportPath}`);
        return reportPath;
    }

    /**
     * Generate CSV exports
     */
    async generateCSVExports() {
        console.log(`\n📊 Generating CSV exports...`);

        // 1. Usage Stats CSV
        const usageStatsRows = this.data.usageMetrics.reports.map(r => {
            const classification = this.data.departmentClassification.classifications.reports.find(c => c.id === r.id);
            return {
                'Report ID': r.id,
                'Report Name': r.name,
                'Folder': r.folderName,
                'Times Run': r.timesRun || 0,
                'Last Run Date': r.lastRunDate || 'Never',
                'Is Active': r.isActive ? 'Yes' : 'No',
                'Owner': r.ownerName,
                'Department': classification ? classification.department : 'Unknown',
                'On Dashboards': r.onDashboards.length
            };
        });
        const usageStatsCSV = this.csvParser.generate(usageStatsRows);
        await fs.writeFile(path.join(this.inputDir, 'usage-stats.csv'), usageStatsCSV);

        // 2. Field Usage CSV
        const fieldUsageRows = this.data.fieldUsage.fieldUsage.map(f => {
            const activeReports = f.reports.filter(r => r.isActive).length;
            return {
                'Field': f.field,
                'Object': f.object,
                'Usage Count': f.usageCount,
                'Active Reports': activeReports,
                'Total Reports': f.reports.length
            };
        });
        const fieldUsageCSV = this.csvParser.generate(fieldUsageRows);
        await fs.writeFile(path.join(this.inputDir, 'field-usage.csv'), fieldUsageCSV);

        // 3. Department Breakdown CSV
        const departmentRows = Object.values(this.data.departmentClassification.classifications.summary).map(dept => ({
            'Department': dept.department,
            'Total Reports': dept.totalReports,
            'Active Reports': dept.activeReports,
            'Total Dashboards': dept.totalDashboards,
            'Active Dashboards': dept.activeDashboards,
            'Avg Confidence': dept.avgConfidence
        }));
        const departmentCSV = this.csvParser.generate(departmentRows);
        await fs.writeFile(path.join(this.inputDir, 'department-breakdown.csv'), departmentCSV);

        // 4. Gaps CSV
        const gapsRows = this.data.gaps.gaps.map(gap => ({
            'Gap Type': gap.gapType,
            'Department': gap.department,
            'Priority': gap.priority,
            'Description': gap.description,
            'Recommendation': gap.recommendation
        }));
        const gapsCSV = this.csvParser.generate(gapsRows);
        await fs.writeFile(path.join(this.inputDir, 'gaps.csv'), gapsCSV);

        console.log(`✓ Generated 4 CSV exports`);
    }

    /**
     * Execute full report generation workflow
     */
    async execute() {
        console.log(`\n📄 Usage Audit Report Generator`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Input directory: ${this.inputDir}`);

        try {
            await this.loadAnalysisFiles();
            await this.generateMarkdownReport();
            await this.generateCSVExports();

            console.log(`\n✅ Report generation complete!`);
            console.log(`📁 Output directory: ${this.inputDir}`);
            console.log(`\nGenerated files:`);
            console.log(`  - AUDIT_REPORT.md (markdown executive summary)`);
            console.log(`  - usage-stats.csv (all reports with metrics)`);
            console.log(`  - field-usage.csv (field usage frequency)`);
            console.log(`  - department-breakdown.csv (department summary)`);
            console.log(`  - gaps.csv (identified gaps with recommendations)`);

            return this.inputDir;
        } catch (error) {
            console.error(`\n❌ Report generation failed: ${error.message}`);
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
        } else if (args[i] === '--org' && args[i + 1]) {
            options.org = args[i + 1];
            i++;
        }
    }

    if (!options.input || !options.org) {
        console.error('Usage: node usage-audit-report-generator.js --input <audit-dir> --org <org-alias>');
        process.exit(1);
    }

    (async () => {
        try {
            const generator = new UsageAuditReportGenerator(options.input, options.org);
            await generator.execute();
            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = UsageAuditReportGenerator;
