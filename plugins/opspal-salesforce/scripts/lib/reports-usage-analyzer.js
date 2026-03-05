#!/usr/bin/env node

/**
 * Salesforce Reports & Dashboards Usage Analyzer
 *
 * Analyzes report and dashboard usage patterns over a rolling 6-month window.
 * Collects metadata, usage metrics, and field information for downstream analysis.
 *
 * Usage:
 *   node reports-usage-analyzer.js --org <org-alias> [--window-months 6] [--output <path>]
 *
 * Outputs:
 *   - usage-metrics.json: Comprehensive usage data for all reports/dashboards
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const AnalyticsDiscoveryV2 = require('./analytics-discovery-v2.js');

// Configuration
const CONFIG = {
    DEFAULT_WINDOW_MONTHS: 6,
    DASHBOARD_RECENT_DAYS: 30, // Track dashboards accessed in last 30 days
    MAX_FIELD_METADATA_FETCHES: 200, // Limit to prevent excessive API calls (200 reports ≈ 30-60 seconds)
    BATCH_SIZE: 100,
    OUTPUT_DIR_PREFIX: 'reports-usage-audit',
    INCLUDE_OWNER_METADATA: false  // Set to true for better classification (adds 30-60 seconds, +10-30 confidence points)
};

/**
 * Classify dashboard execution mode.
 *
 * Important contract:
 * - Dynamic dashboards are identified by Dashboard.Type = 'LoggedInUser'
 * - Static dashboards are identified by Dashboard.Type = 'SpecifiedUser'
 * - RunningUserId can be populated for both and is not a reliable classifier
 */
function classifyDashboardExecutionType(dashboard = {}) {
    const rawType = String(dashboard.Type || '').trim();
    const normalized = rawType.toLowerCase();
    const isDynamic = normalized === 'loggedinuser';
    const isStatic = normalized === 'specifieduser';

    return {
        dashboardType: rawType || 'Unknown',
        isDynamic,
        isStatic
    };
}

class ReportsUsageAnalyzer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.windowMonths = options.windowMonths || CONFIG.DEFAULT_WINDOW_MONTHS;
        this.outputDir = options.output || null;

        // Calculate cutoff dates
        const now = new Date();
        this.cutoffDate = new Date(now.getFullYear(), now.getMonth() - this.windowMonths, now.getDate());
        this.cutoffDateISO = this.cutoffDate.toISOString().split('T')[0];

        // 30-day cutoff for recent dashboard utilization
        this.dashboardRecentCutoff = new Date(now);
        this.dashboardRecentCutoff.setDate(now.getDate() - CONFIG.DASHBOARD_RECENT_DAYS);
        this.dashboardRecentCutoffISO = this.dashboardRecentCutoff.toISOString().split('T')[0];

        // Data storage
        this.reports = [];
        this.dashboards = [];
        this.dashboardComponents = [];
        this.reportFieldsMap = {};

        // Metrics
        this.metrics = {
            totalReports: 0,
            activeReports: 0,
            staleReports: 0,
            totalDashboards: 0,
            activeDashboards: 0,
            staleDashboards: 0,
            recentDashboards: 0, // Dashboards run in last 30 days
            topReports: [],
            leastUsedReports: [],
            topDashboards: [], // Most recently run dashboards
            fieldMetadataFetched: 0
        };
    }

    /**
     * Initialize output directory
     */
    async initializeOutputDir() {
        if (!this.outputDir) {
            const timestamp = new Date().toISOString().split('T')[0];
            this.outputDir = path.join(
                process.cwd(),
                'instances',
                this.orgAlias,
                `${CONFIG.OUTPUT_DIR_PREFIX}-${timestamp}`
            );
        }

        await fs.mkdir(this.outputDir, { recursive: true });
        console.log(`Output directory: ${this.outputDir}`);
    }

    /**
     * Execute SOQL query via SF CLI
     */
    async executeQuery(soql) {
        try {
            const cmd = `sf data query --query "${soql.replace(/"/g, '\\"')}" --target-org ${this.orgAlias} --json`;
            // Increase buffer size for large result sets (50MB)
            const { stdout } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                throw new Error(`SOQL query failed: ${result.message}`);
            }

            return result.result.records || [];
        } catch (error) {
            throw new Error(`Failed to execute query: ${error.message}`);
        }
    }

    /**
     * Step 1: Collect Report metadata via SOQL
     * Note: LastRunDate and TimesRun are not available via SOQL - these fields don't exist on Report object
     * We'll mark all reports as "usage unknown" and focus on metadata analysis instead
     */
    async collectReportMetadata() {
        console.log('\n📊 Collecting Report metadata...');
        console.log('ℹ️  Note: LastRunDate and TimesRun not available via SOQL - using CreatedDate/LastModifiedDate as proxies');

        // Build query with optional Owner metadata (improves classification but adds 30-60s)
        let reportQuery = `
            SELECT Id, Name, DeveloperName, FolderName, Format,
                   OwnerId, CreatedDate, LastModifiedDate`;

        if (CONFIG.INCLUDE_OWNER_METADATA) {
            console.log('ℹ️  Including Owner metadata for better classification (adds 30-60 seconds)');
            reportQuery += `,
                   Owner.Name, Owner.Profile.Name,
                   Owner.UserRole.Name, Owner.Department`;
        }

        reportQuery += `
            FROM Report
            WHERE IsDeleted = FALSE
            ORDER BY LastModifiedDate DESC
        `;

        this.reports = await this.executeQuery(reportQuery);
        this.metrics.totalReports = this.reports.length;

        // Calculate active vs stale based on LastModifiedDate (proxy for usage)
        // Reports modified in last 6 months are considered "active"
        this.reports.forEach(report => {
            const lastModified = report.LastModifiedDate ? new Date(report.LastModifiedDate) : null;
            report.isActive = lastModified && lastModified >= this.cutoffDate;

            // Set proxy values for compatibility
            report.LastRunDate = null;  // Not available via SOQL
            report.TimesRun = 0;  // Not available via SOQL
            report.lastModified = lastModified;

            if (report.isActive) {
                this.metrics.activeReports++;
            } else {
                this.metrics.staleReports++;
            }
        });

        console.log(`✓ Collected ${this.reports.length} reports (${this.metrics.activeReports} active, ${this.metrics.staleReports} stale based on LastModifiedDate)`);
    }

    /**
     * Step 2: Collect Dashboard metadata via SOQL
     */
    async collectDashboardMetadata() {
        console.log('\n📈 Collecting Dashboard metadata...');
        console.log(`ℹ️  Tracking dashboards run within last ${CONFIG.DASHBOARD_RECENT_DAYS} days (since ${this.dashboardRecentCutoffISO})`);

        const dashboardQuery = `
            SELECT Id, DeveloperName, Title, FolderName,
                   LastViewedDate, DashboardResultRefreshedDate, RunningUserId, Type,
                   CreatedDate, LastModifiedDate
            FROM Dashboard
            ORDER BY DashboardResultRefreshedDate DESC NULLS LAST, LastViewedDate DESC NULLS LAST
        `;

        this.dashboards = await this.executeQuery(dashboardQuery);
        this.metrics.totalDashboards = this.dashboards.length;

        // Calculate active vs stale (6-month window)
        // AND recent utilization (30-day window based on LastRunDate)
        this.dashboards.forEach(dashboard => {
            const lastViewed = dashboard.LastViewedDate ? new Date(dashboard.LastViewedDate) : null;
            const lastRun = dashboard.DashboardResultRefreshedDate ? new Date(dashboard.DashboardResultRefreshedDate) : null;
            const executionType = classifyDashboardExecutionType(dashboard);

            // Active = viewed in last 6 months (existing behavior)
            dashboard.isActive = lastViewed && lastViewed >= this.cutoffDate;

            // Recent = run in last 30 days (new metric)
            dashboard.isRecent = lastRun && lastRun >= this.dashboardRecentCutoff;
            dashboard.dashboardType = executionType.dashboardType;
            dashboard.isDynamic = executionType.isDynamic;
            dashboard.isStatic = executionType.isStatic;

            // Store both dates for reporting
            dashboard.lastRunDate = lastRun;
            dashboard.lastViewedDate = lastViewed;

            if (dashboard.isActive) {
                this.metrics.activeDashboards++;
            } else {
                this.metrics.staleDashboards++;
            }

            if (dashboard.isRecent) {
                this.metrics.recentDashboards++;
            }
        });

        console.log(`✓ Collected ${this.dashboards.length} dashboards`);
        console.log(`  - Active (6 months): ${this.metrics.activeDashboards}`);
        console.log(`  - Recent (30 days): ${this.metrics.recentDashboards}`);
        console.log(`  - Stale (>6 months): ${this.metrics.staleDashboards}`);
    }

    /**
     * Step 3: Map Dashboards to Reports via DashboardComponent
     */
    async mapDashboardsToReports() {
        console.log('\n🔗 Mapping dashboards to reports...');

        const componentQuery = `
            SELECT Id, DashboardId, CustomReportId, Name
            FROM DashboardComponent
            WHERE CustomReportId != null
        `;

        this.dashboardComponents = await this.executeQuery(componentQuery);

        // Build mapping: dashboardId -> [reportIds]
        const dashboardReportMap = {};
        this.dashboardComponents.forEach(comp => {
            if (!dashboardReportMap[comp.DashboardId]) {
                dashboardReportMap[comp.DashboardId] = [];
            }
            dashboardReportMap[comp.DashboardId].push(comp.CustomReportId);
        });

        // Build reverse mapping: reportId -> [dashboardIds]
        const reportDashboardMap = {};
        this.dashboardComponents.forEach(comp => {
            if (!reportDashboardMap[comp.CustomReportId]) {
                reportDashboardMap[comp.CustomReportId] = [];
            }
            reportDashboardMap[comp.CustomReportId].push(comp.DashboardId);
        });

        // Attach to reports and dashboards
        this.reports.forEach(report => {
            report.onDashboards = reportDashboardMap[report.Id] || [];
            report.isDashboardComponent = report.onDashboards.length > 0;
        });

        this.dashboards.forEach(dashboard => {
            dashboard.componentReports = dashboardReportMap[dashboard.Id] || [];
            dashboard.componentCount = dashboard.componentReports.length;
        });

        console.log(`✓ Mapped ${this.dashboardComponents.length} dashboard components`);
    }

    /**
     * Step 4: Fetch Report Field Metadata (for active reports only)
     */
    async fetchReportFieldMetadata() {
        console.log('\n🔍 Fetching report field metadata (active reports only)...');

        const activeReports = this.reports.filter(r => r.isActive);
        const reportsToFetch = activeReports.slice(0, CONFIG.MAX_FIELD_METADATA_FETCHES);

        if (activeReports.length > CONFIG.MAX_FIELD_METADATA_FETCHES) {
            console.warn(`⚠️  Limiting field metadata fetches to ${CONFIG.MAX_FIELD_METADATA_FETCHES} reports (${activeReports.length} active)`);
        }

        // Initialize Analytics API
        const discovery = await AnalyticsDiscoveryV2.fromSFAuth(this.orgAlias);

        for (const report of reportsToFetch) {
            try {
                const metadata = await discovery.makeRequest(
                    `/services/data/${discovery.apiVersion}/analytics/reports/${report.Id}`,
                    'GET'
                );

                // Extract fields, filters, and report type
                const detailColumns = metadata.reportMetadata?.detailColumns || [];
                const aggregates = metadata.reportMetadata?.aggregates || [];
                const filters = metadata.reportMetadata?.reportFilters || [];
                const reportType = metadata.reportMetadata?.reportType || '';

                // Store field metadata
                this.reportFieldsMap[report.Id] = {
                    reportId: report.Id,
                    reportName: report.Name,
                    reportType: reportType,
                    detailColumns: detailColumns,
                    aggregates: aggregates,
                    filters: filters,
                    totalFields: detailColumns.length + aggregates.length,
                    totalFilters: filters.length
                };

                this.metrics.fieldMetadataFetched++;

                // Progress indicator
                if (this.metrics.fieldMetadataFetched % 10 === 0) {
                    console.log(`  Fetched ${this.metrics.fieldMetadataFetched}/${reportsToFetch.length} report metadata...`);
                }
            } catch (error) {
                const classifiedError = await this.classifyReportMetadataError(report, error);
                console.warn(`  Failed to fetch metadata for ${report.Name}: ${classifiedError}`);
                this.reportFieldsMap[report.Id] = {
                    reportId: report.Id,
                    reportName: report.Name,
                    error: classifiedError
                };
            }
        }

        console.log(`✓ Fetched field metadata for ${this.metrics.fieldMetadataFetched} reports`);
    }

    /**
     * Distinguish real deletion from private-folder visibility cases.
     */
    async classifyReportMetadataError(report, error) {
        const baseMessage = error?.message || 'Unknown metadata fetch error';
        const normalized = baseMessage.toLowerCase();
        const isNotFound = normalized.includes('not_found') ||
            normalized.includes('not found') ||
            normalized.includes('404');

        if (!isNotFound || !report?.Id) {
            return baseMessage;
        }

        try {
            const records = await this.executeQuery(
                `SELECT Id, FolderName FROM Report WHERE Id = '${report.Id}' LIMIT 1`
            );

            if (records.length > 0) {
                const folderName = records[0].FolderName || 'unknown';
                return `${baseMessage}. Report exists in folder "${folderName}" but Analytics REST returned NOT_FOUND ` +
                    '(likely private/personal folder visibility constraints).';
            }

            return `${baseMessage}. Report was not found in SOQL either (likely deleted or invalid ID).`;
        } catch {
            return `${baseMessage}. Could be deleted OR inaccessible due to private/personal folder visibility.`;
        }
    }

    /**
     * Step 5: Calculate Top and Least Used Reports + Recent Dashboards
     * Since TimesRun is not available, we use LastModifiedDate as a proxy
     */
    calculateTopLeastUsed() {
        console.log('\n📊 Calculating most/least recently modified reports...');

        // Top 10 most recently modified (proxy for "most used")
        const activeReports = this.reports.filter(r => r.isActive);
        this.metrics.topReports = activeReports
            .sort((a, b) => new Date(b.LastModifiedDate) - new Date(a.LastModifiedDate))
            .slice(0, 10)
            .map(r => ({
                id: r.Id,
                name: r.Name,
                timesRun: 0,  // Not available
                lastRunDate: r.LastModifiedDate,
                folderName: r.FolderName,
                note: 'Usage based on LastModifiedDate (TimesRun not available)'
            }));

        // Least used: Reports not modified in 6+ months
        const leastUsed = this.reports
            .filter(r => !r.isActive)
            .sort((a, b) => new Date(a.LastModifiedDate) - new Date(b.LastModifiedDate))
            .slice(0, 10)
            .map(r => ({
                id: r.Id,
                name: r.Name,
                timesRun: 0,  // Not available
                lastRunDate: r.LastModifiedDate,
                folderName: r.FolderName,
                note: 'Stale (not modified in 6+ months)'
            }));

        this.metrics.leastUsedReports = leastUsed;

        // Top 10 most recently run dashboards (based on DashboardResultRefreshedDate)
        const recentDashboards = this.dashboards.filter(d => d.isRecent);
        this.metrics.topDashboards = recentDashboards
            .sort((a, b) => {
                const dateA = a.lastRunDate || a.lastViewedDate || new Date(0);
                const dateB = b.lastRunDate || b.lastViewedDate || new Date(0);
                return dateB - dateA;
            })
            .slice(0, 10)
            .map(d => ({
                id: d.Id,
                title: d.Title,
                developerName: d.DeveloperName,
                lastRunDate: d.DashboardResultRefreshedDate,
                lastViewedDate: d.LastViewedDate,
                folderName: d.FolderName,
                dashboardType: d.dashboardType || 'Unknown',
                isDynamic: !!d.isDynamic,
                componentCount: d.componentCount || 0,
                note: 'Run within last 30 days'
            }));

        console.log(`✓ Top 10 most recently modified: ${this.metrics.topReports.length} reports`);
        console.log(`✓ Least recently modified: ${this.metrics.leastUsedReports.length} reports`);
        console.log(`✓ Top 10 most recently run dashboards: ${this.metrics.topDashboards.length} dashboards`);
    }

    /**
     * Step 6: Generate Usage Metrics JSON
     */
    async generateUsageMetricsJSON() {
        console.log('\n💾 Generating usage-metrics.json...');

        const output = {
            metadata: {
                orgAlias: this.orgAlias,
                auditDate: new Date().toISOString(),
                windowMonths: this.windowMonths,
                cutoffDate: this.cutoffDateISO,
                dashboardRecentDays: CONFIG.DASHBOARD_RECENT_DAYS,
                dashboardRecentCutoff: this.dashboardRecentCutoffISO,
                generatedBy: 'reports-usage-analyzer.js v1.1.0'
            },
            summary: {
                totalReports: this.metrics.totalReports,
                activeReports: this.metrics.activeReports,
                staleReports: this.metrics.staleReports,
                totalDashboards: this.metrics.totalDashboards,
                activeDashboards: this.metrics.activeDashboards,
                staleDashboards: this.metrics.staleDashboards,
                recentDashboards: this.metrics.recentDashboards,
                fieldMetadataFetched: this.metrics.fieldMetadataFetched
            },
            topReports: this.metrics.topReports,
            leastUsedReports: this.metrics.leastUsedReports,
            topDashboards: this.metrics.topDashboards,
            reports: this.reports.map(r => ({
                id: r.Id,
                name: r.Name,
                developerName: r.DeveloperName,
                folderName: r.FolderName,
                format: r.Format || 'Unknown',
                timesRun: 0,  // Not available via SOQL
                lastRunDate: r.LastModifiedDate,  // Using LastModifiedDate as proxy
                isActive: r.isActive,
                ownerId: r.OwnerId,
                ownerName: r.Owner?.Name || '',  // Populated if INCLUDE_OWNER_METADATA = true
                ownerProfile: r.Owner?.Profile?.Name || '',
                ownerRole: r.Owner?.UserRole?.Name || '',
                ownerDepartment: r.Owner?.Department || '',
                createdDate: r.CreatedDate,
                lastModifiedDate: r.LastModifiedDate,
                onDashboards: r.onDashboards || [],
                isDashboardComponent: r.isDashboardComponent || false
            })),
            dashboards: this.dashboards.map(d => ({
                id: d.Id,
                developerName: d.DeveloperName,
                title: d.Title,
                folderName: d.FolderName,
                dashboardType: d.dashboardType || 'Unknown',
                isDynamic: !!d.isDynamic,
                isStatic: !!d.isStatic,
                lastViewedDate: d.LastViewedDate || null,
                lastRunDate: d.DashboardResultRefreshedDate || null,
                isActive: d.isActive,
                isRecent: d.isRecent,
                runningUserId: d.RunningUserId,
                createdDate: d.CreatedDate,
                lastModifiedDate: d.LastModifiedDate,
                componentReports: d.componentReports,
                componentCount: d.componentCount
            })),
            reportFieldMetadata: this.reportFieldsMap
        };

        const outputPath = path.join(this.outputDir, 'usage-metrics.json');
        await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

        console.log(`✓ Saved to ${outputPath}`);
        return outputPath;
    }

    /**
     * Execute full analysis workflow
     */
    async analyze() {
        console.log(`\n🔍 Salesforce Reports & Dashboards Usage Analyzer`);
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Window: Last ${this.windowMonths} months (since ${this.cutoffDateISO})`);

        try {
            await this.initializeOutputDir();
            await this.collectReportMetadata();
            await this.collectDashboardMetadata();
            await this.mapDashboardsToReports();
            await this.fetchReportFieldMetadata();
            this.calculateTopLeastUsed();
            const outputPath = await this.generateUsageMetricsJSON();

            // Quality Gate: Validate report was generated successfully
            if (!outputPath || !fs.existsSync(outputPath)) {
                throw new Error('Analysis failed: Report file was not created');
            }

            console.log(`\n✅ Analysis complete!`);
            console.log(`📁 Output directory: ${this.outputDir}`);
            console.log(`\nSummary:`);
            console.log(`  Reports: ${this.metrics.totalReports} total (${this.metrics.activeReports} active, ${this.metrics.staleReports} stale)`);
            console.log(`  Dashboards: ${this.metrics.totalDashboards} total`);
            console.log(`    - Active (6 months): ${this.metrics.activeDashboards}`);
            console.log(`    - Recent (30 days): ${this.metrics.recentDashboards}`);
            console.log(`    - Stale (>6 months): ${this.metrics.staleDashboards}`);
            console.log(`  Field metadata fetched: ${this.metrics.fieldMetadataFetched} reports`);

            return outputPath;
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
        if (args[i] === '--org' && args[i + 1]) {
            options.org = args[i + 1];
            i++;
        } else if (args[i] === '--window-months' && args[i + 1]) {
            options.windowMonths = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            options.output = args[i + 1];
            i++;
        }
    }

    if (!options.org) {
        console.error('Usage: node reports-usage-analyzer.js --org <org-alias> [--window-months 6] [--output <path>]');
        process.exit(1);
    }

    (async () => {
        try {
            const analyzer = new ReportsUsageAnalyzer(options.org, {
                windowMonths: options.windowMonths,
                output: options.output
            });

            await analyzer.analyze();
            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = ReportsUsageAnalyzer;
module.exports.classifyDashboardExecutionType = classifyDashboardExecutionType;
