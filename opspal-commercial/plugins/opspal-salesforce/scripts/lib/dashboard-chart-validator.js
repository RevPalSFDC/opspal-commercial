#!/usr/bin/env node

/**
 * Dashboard Chart Validator
 *
 * Pre-deployment validation script that checks dashboard chart components
 * to prevent "You must define a chart for the source report" errors.
 *
 * Problem: When useReportChart=true is set in dashboard metadata, Salesforce
 * expects the source report to have a <chart> element defined. If missing,
 * the component displays an error.
 *
 * Solution: This validator checks all chart components and ensures either:
 * 1. useReportChart=false with inline chart configuration, OR
 * 2. useReportChart=true with verified report chart existence
 *
 * Usage:
 *   node dashboard-chart-validator.js <dashboard-path> [--org <alias>] [--fix]
 *   node dashboard-chart-validator.js --dir <dashboards-directory> [--org <alias>]
 *
 * Options:
 *   --org <alias>    Salesforce org alias for report verification
 *   --fix            Auto-fix issues by switching to inline configuration
 *   --dir <path>     Validate all dashboards in directory
 *   --verbose        Show detailed output
 *
 * @module dashboard-chart-validator
 * @created 2026-01-21
 * @reflection 13c9b2ca-2b30-4703-bc49-b13a57b5fab1
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Chart component types that require validation
const CHART_COMPONENT_TYPES = [
    'Bar', 'BarGrouped', 'BarStacked', 'BarStacked100',
    'Column', 'ColumnGrouped', 'ColumnStacked', 'ColumnStacked100',
    'Line', 'LineGrouped', 'LineCumulative',
    'Pie', 'Donut', 'Funnel', 'Scatter'
];

class DashboardChartValidator {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || null;
        this.verbose = options.verbose || false;
        this.autoFix = options.autoFix || false;
        this.reportChartCache = new Map();
        this.stats = {
            dashboardsScanned: 0,
            componentsChecked: 0,
            issuesFound: 0,
            issuesFixed: 0,
            passed: 0
        };
    }

    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }

    /**
     * Parse dashboard XML file
     */
    parseDashboard(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Dashboard file not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const dashboard = {
            filePath,
            content,
            components: []
        };

        // Extract dashboard components with chart types
        const componentRegex = /<dashboardGridComponents>([\s\S]*?)<\/dashboardGridComponents>/g;
        let match;

        while ((match = componentRegex.exec(content)) !== null) {
            const componentXml = match[1];
            const component = this.parseComponent(componentXml, match.index);
            if (component) {
                dashboard.components.push(component);
            }
        }

        // Also check legacy dashboardSections/components
        const legacyRegex = /<dashboardComponent>([\s\S]*?)<\/dashboardComponent>/g;
        while ((match = legacyRegex.exec(content)) !== null) {
            const componentXml = match[1];
            const component = this.parseComponent(componentXml, match.index);
            if (component) {
                dashboard.components.push(component);
            }
        }

        return dashboard;
    }

    /**
     * Parse individual component XML
     */
    parseComponent(xml, offset) {
        // Extract component type
        const typeMatch = xml.match(/<componentType>([^<]+)<\/componentType>/);
        const componentType = typeMatch ? typeMatch[1] : null;

        // Only process chart components
        if (!componentType || !CHART_COMPONENT_TYPES.includes(componentType)) {
            return null;
        }

        // Extract useReportChart setting
        const useReportChartMatch = xml.match(/<useReportChart>([^<]+)<\/useReportChart>/);
        const useReportChart = useReportChartMatch ?
            useReportChartMatch[1].toLowerCase() === 'true' : false;

        // Extract report name
        const reportMatch = xml.match(/<report>([^<]+)<\/report>/);
        const reportName = reportMatch ? reportMatch[1] : null;

        // Check for inline chart configuration
        const hasChartSummary = xml.includes('<chartSummary>') || xml.includes('<chartAxisRange>');
        const hasGroupingColumn = xml.includes('<groupingColumn>');

        // Check for autoselectColumnsFromReport
        const autoSelectMatch = xml.match(/<autoselectColumnsFromReport>([^<]+)<\/autoselectColumnsFromReport>/);
        const autoSelect = autoSelectMatch ?
            autoSelectMatch[1].toLowerCase() === 'true' : false;

        return {
            type: componentType,
            reportName,
            useReportChart,
            hasChartSummary,
            hasGroupingColumn,
            autoSelect,
            xml,
            offset
        };
    }

    /**
     * Check if a report has a chart defined (requires org connection)
     */
    async checkReportHasChart(reportName) {
        if (!this.orgAlias) {
            this.log(`  ⚠️  Cannot verify report chart - no org alias provided`);
            return null; // Unknown
        }

        // Check cache first
        if (this.reportChartCache.has(reportName)) {
            return this.reportChartCache.get(reportName);
        }

        try {
            // Use Analytics API to check if report has a chart defined
            this.log(`  Checking report: ${reportName}`);
            const cmd = `sf api request rest "/analytics/reports?q=${reportName}" --method GET --target-org ${this.orgAlias} 2>/dev/null`;
            const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
            const parsed = JSON.parse(result);

            // If we found the report, describe it to check for chart
            if (parsed && Array.isArray(parsed) && parsed.length > 0) {
                const reportId = parsed[0].id;
                const descCmd = `sf api request rest "/analytics/reports/${reportId}/describe" --method GET --target-org ${this.orgAlias} 2>/dev/null`;
                const descResult = execSync(descCmd, { encoding: 'utf-8', stdio: 'pipe' });
                const descParsed = JSON.parse(descResult);
                const hasChart = !!(descParsed && descParsed.reportMetadata && descParsed.reportMetadata.chart);
                this.reportChartCache.set(reportName, hasChart);
                return hasChart;
            }

            this.reportChartCache.set(reportName, false);
            return false;
        } catch (error) {
            this.log(`  ⚠️  Could not retrieve report: ${error.message}`);
            this.reportChartCache.set(reportName, null);
            return null;
        }
    }

    /**
     * Validate a single dashboard
     */
    async validateDashboard(filePath) {
        this.stats.dashboardsScanned++;
        const issues = [];

        const dashboardName = path.basename(filePath, '.dashboard-meta.xml');
        console.log(`\nValidating: ${dashboardName}`);

        const dashboard = this.parseDashboard(filePath);
        this.log(`  Found ${dashboard.components.length} chart components`);

        for (const component of dashboard.components) {
            this.stats.componentsChecked++;
            const issue = await this.validateComponent(component, dashboardName);

            if (issue) {
                issues.push(issue);
                this.stats.issuesFound++;
            } else {
                this.stats.passed++;
            }
        }

        // Apply fixes if requested
        if (this.autoFix && issues.length > 0) {
            await this.fixIssues(dashboard, issues);
        }

        return {
            dashboard: dashboardName,
            filePath,
            componentsChecked: dashboard.components.length,
            issues
        };
    }

    /**
     * Validate a single component
     */
    async validateComponent(component, dashboardName) {
        // Case 1: useReportChart=true - need to verify report has chart
        if (component.useReportChart) {
            const reportHasChart = await this.checkReportHasChart(component.reportName);

            if (reportHasChart === false) {
                return {
                    type: 'MISSING_REPORT_CHART',
                    severity: 'ERROR',
                    component: component.type,
                    report: component.reportName,
                    message: `useReportChart=true but report "${component.reportName}" has no chart defined`,
                    recommendation: 'Set useReportChart=false and add inline <chartSummary> and <groupingColumn> elements',
                    fix: {
                        action: 'SWITCH_TO_INLINE',
                        useReportChart: false,
                        autoselectColumnsFromReport: false
                    }
                };
            } else if (reportHasChart === null) {
                return {
                    type: 'UNVERIFIED_REPORT_CHART',
                    severity: 'WARNING',
                    component: component.type,
                    report: component.reportName,
                    message: `Cannot verify if report "${component.reportName}" has chart defined (no org connection)`,
                    recommendation: 'Verify manually or connect to org with --org flag'
                };
            }
            // reportHasChart === true - OK
            this.log(`  ✅ ${component.type}: Report "${component.reportName}" has chart defined`);
            return null;
        }

        // Case 2: useReportChart=false - need inline configuration
        if (!component.useReportChart) {
            if (!component.hasChartSummary) {
                return {
                    type: 'MISSING_INLINE_CONFIG',
                    severity: 'WARNING',
                    component: component.type,
                    report: component.reportName,
                    message: `useReportChart=false but no <chartSummary> defined`,
                    recommendation: 'Add <chartSummary> with aggregate, axisBinding, and column elements'
                };
            }

            if (!component.hasGroupingColumn && !component.autoSelect) {
                return {
                    type: 'MISSING_GROUPING',
                    severity: 'WARNING',
                    component: component.type,
                    report: component.reportName,
                    message: `No <groupingColumn> defined and autoselectColumnsFromReport=false`,
                    recommendation: 'Add <groupingColumn> elements or set autoselectColumnsFromReport=true'
                };
            }

            this.log(`  ✅ ${component.type}: Inline configuration present`);
            return null;
        }

        return null;
    }

    /**
     * Apply fixes to dashboard file
     */
    async fixIssues(dashboard, issues) {
        let content = dashboard.content;
        let modified = false;

        for (const issue of issues) {
            if (issue.fix && issue.fix.action === 'SWITCH_TO_INLINE') {
                // Replace useReportChart=true with useReportChart=false
                const oldPattern = /<useReportChart>true<\/useReportChart>/gi;
                if (content.match(oldPattern)) {
                    content = content.replace(oldPattern, '<useReportChart>false</useReportChart>');
                    modified = true;
                    this.stats.issuesFixed++;
                    console.log(`  🔧 Fixed: Set useReportChart=false for ${issue.component}`);
                }
            }
        }

        if (modified) {
            // Backup original
            const backupPath = dashboard.filePath + '.backup';
            fs.copyFileSync(dashboard.filePath, backupPath);
            this.log(`  📦 Backup created: ${backupPath}`);

            // Write fixed content
            fs.writeFileSync(dashboard.filePath, content);
            console.log(`  ✅ Dashboard updated: ${dashboard.filePath}`);
        }
    }

    /**
     * Validate all dashboards in a directory
     */
    async validateDirectory(dirPath) {
        const results = [];
        const dashboards = this.findDashboards(dirPath);

        console.log(`Found ${dashboards.length} dashboard(s) to validate`);

        for (const dashboardPath of dashboards) {
            const result = await this.validateDashboard(dashboardPath);
            results.push(result);
        }

        return results;
    }

    /**
     * Find all dashboard files in directory
     */
    findDashboards(dirPath) {
        const dashboards = [];

        const scan = (dir) => {
            if (!fs.existsSync(dir)) return;

            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scan(fullPath);
                } else if (entry.name.endsWith('.dashboard-meta.xml')) {
                    dashboards.push(fullPath);
                }
            }
        };

        scan(dirPath);
        return dashboards;
    }

    /**
     * Generate summary report
     */
    generateReport(results) {
        console.log('\n' + '═'.repeat(60));
        console.log('  DASHBOARD CHART VALIDATION REPORT');
        console.log('═'.repeat(60));
        console.log(`Dashboards scanned:    ${this.stats.dashboardsScanned}`);
        console.log(`Components checked:    ${this.stats.componentsChecked}`);
        console.log(`Issues found:          ${this.stats.issuesFound}`);
        console.log(`Issues fixed:          ${this.stats.issuesFixed}`);
        console.log(`Passed:                ${this.stats.passed}`);
        console.log('─'.repeat(60));

        const errors = results.flatMap(r => r.issues.filter(i => i.severity === 'ERROR'));
        const warnings = results.flatMap(r => r.issues.filter(i => i.severity === 'WARNING'));

        if (errors.length > 0) {
            console.log('\n❌ ERRORS (will cause deployment failures):');
            for (const error of errors) {
                console.log(`\n  Dashboard: ${error.report}`);
                console.log(`  Component: ${error.component}`);
                console.log(`  Issue: ${error.message}`);
                console.log(`  Fix: ${error.recommendation}`);
            }
        }

        if (warnings.length > 0) {
            console.log('\n⚠️  WARNINGS (may cause issues):');
            for (const warning of warnings) {
                console.log(`\n  Dashboard: ${warning.report || 'Unknown'}`);
                console.log(`  Component: ${warning.component}`);
                console.log(`  Issue: ${warning.message}`);
            }
        }

        if (errors.length === 0 && warnings.length === 0) {
            console.log('\n✅ All chart components validated successfully!');
        }

        console.log('\n' + '═'.repeat(60));

        return {
            success: errors.length === 0,
            stats: this.stats,
            errors,
            warnings
        };
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let targetPath = null;
    let isDirectory = false;
    let orgAlias = null;
    let autoFix = false;
    let verbose = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--org':
                orgAlias = args[++i];
                break;
            case '--dir':
                targetPath = args[++i];
                isDirectory = true;
                break;
            case '--fix':
                autoFix = true;
                break;
            case '--verbose':
            case '-v':
                verbose = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Dashboard Chart Validator

Validates dashboard chart components to prevent "You must define a chart" errors.

Usage:
  node dashboard-chart-validator.js <dashboard.dashboard-meta.xml> [options]
  node dashboard-chart-validator.js --dir <dashboards-directory> [options]

Options:
  --org <alias>    Salesforce org alias for report verification
  --fix            Auto-fix issues (sets useReportChart=false)
  --dir <path>     Validate all dashboards in directory
  --verbose, -v    Show detailed output
  --help, -h       Show this help

Examples:
  # Validate single dashboard
  node dashboard-chart-validator.js force-app/main/dashboards/MyDashboard.dashboard-meta.xml

  # Validate all dashboards with org connection
  node dashboard-chart-validator.js --dir force-app/main/dashboards --org myOrg

  # Auto-fix issues
  node dashboard-chart-validator.js MyDashboard.dashboard-meta.xml --fix

Best Practice:
  Use useReportChart=false with inline <chartSummary> and <groupingColumn>
  to avoid dependencies on report chart definitions.
`);
                process.exit(0);
            default:
                if (!targetPath && !arg.startsWith('-')) {
                    targetPath = arg;
                }
        }
    }

    if (!targetPath) {
        console.error('Error: No dashboard path specified');
        console.error('Usage: node dashboard-chart-validator.js <path> [--org <alias>] [--fix]');
        process.exit(1);
    }

    const validator = new DashboardChartValidator({
        orgAlias,
        autoFix,
        verbose
    });

    let results;
    if (isDirectory || fs.statSync(targetPath).isDirectory()) {
        results = await validator.validateDirectory(targetPath);
    } else {
        results = [await validator.validateDashboard(targetPath)];
    }

    const report = validator.generateReport(results);
    process.exit(report.success ? 0 : 1);
}

// Export for programmatic use
module.exports = { DashboardChartValidator };

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    });
}
