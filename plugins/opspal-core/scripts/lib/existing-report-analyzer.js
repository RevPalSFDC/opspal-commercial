/**
 * Existing Report Analyzer
 *
 * Analyzes existing CRM reports (Salesforce/HubSpot) to:
 * - Identify which RevOps KPIs are currently being tracked
 * - Find coverage gaps in reporting
 * - Recommend improvements and additional metrics
 * - Suggest template matches from the KPI knowledge base
 *
 * Leverages:
 * - opspal-salesforce: reports-usage-analyzer.js, report-type-discovery.js
 * - opspal-core: revops-kpi-knowledge-base.js
 *
 * @module existing-report-analyzer
 * @version 1.0.0
 */

'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');

// Try to load the RevOps KPI knowledge base
let RevOpsKPIKnowledgeBase;
try {
    RevOpsKPIKnowledgeBase = require('./revops-kpi-knowledge-base');
} catch (e) {
    console.warn('RevOps KPI Knowledge Base not found, using inline definitions');
    RevOpsKPIKnowledgeBase = null;
}

/**
 * KPI Detection Patterns
 * Maps field/formula patterns to RevOps KPIs
 */
const KPI_DETECTION_PATTERNS = {
    // Revenue Metrics
    arr: {
        fields: ['amount', 'annual_revenue', 'arr', 'annual_contract_value', 'acv'],
        formulas: ['*12', 'mrr.*12', 'annual'],
        reportTypes: ['opportunity', 'subscription'],
        category: 'revenue'
    },
    mrr: {
        fields: ['amount', 'monthly_revenue', 'mrr', 'monthly_value'],
        formulas: ['monthly', '/12'],
        reportTypes: ['opportunity', 'subscription'],
        category: 'revenue'
    },
    revenue_growth: {
        fields: ['amount', 'revenue', 'growth'],
        formulas: ['prevval', 'previous', 'yoy', 'mom'],
        reportTypes: ['opportunity', 'account'],
        category: 'revenue'
    },

    // Retention Metrics
    nrr: {
        fields: ['nrr', 'net_revenue_retention', 'expansion', 'contraction', 'churn'],
        formulas: ['retention', 'expansion.*churn'],
        reportTypes: ['opportunity', 'subscription', 'renewal'],
        category: 'retention'
    },
    grr: {
        fields: ['grr', 'gross_revenue_retention', 'contraction', 'churn'],
        formulas: ['gross.*retention'],
        reportTypes: ['subscription', 'renewal'],
        category: 'retention'
    },
    churn: {
        fields: ['churn', 'churned', 'lost', 'cancelled'],
        formulas: ['lost.*starting', 'churn.*rate'],
        reportTypes: ['account', 'subscription', 'renewal'],
        category: 'retention'
    },

    // Unit Economics
    cac: {
        fields: ['cac', 'acquisition_cost', 'cost_per_acquisition', 'marketing_spend', 'sales_spend'],
        formulas: ['spend.*customers', 'cost.*acquisition'],
        reportTypes: ['lead', 'opportunity', 'campaign'],
        category: 'unit_economics'
    },
    ltv: {
        fields: ['ltv', 'lifetime_value', 'customer_value', 'clv'],
        formulas: ['arpu.*churn', 'lifetime', 'customer.*value'],
        reportTypes: ['account', 'subscription'],
        category: 'unit_economics'
    },
    ltv_cac_ratio: {
        fields: ['ltv_cac', 'ltv:cac', 'cac_ratio'],
        formulas: ['ltv.*cac', 'lifetime.*acquisition'],
        reportTypes: ['opportunity', 'account'],
        category: 'unit_economics'
    },
    cac_payback: {
        fields: ['payback', 'cac_payback', 'months_to_recover'],
        formulas: ['cac.*mrr', 'payback.*months'],
        reportTypes: ['opportunity', 'subscription'],
        category: 'unit_economics'
    },

    // Pipeline Metrics
    pipeline_coverage: {
        fields: ['coverage', 'pipeline', 'quota'],
        formulas: ['pipeline.*quota', 'coverage.*ratio'],
        reportTypes: ['opportunity', 'forecast'],
        category: 'pipeline'
    },
    sales_velocity: {
        fields: ['velocity', 'sales_velocity', 'cycle_length', 'days_to_close'],
        formulas: ['opps.*win.*deal.*cycle', 'velocity'],
        reportTypes: ['opportunity'],
        category: 'pipeline'
    },
    win_rate: {
        fields: ['win_rate', 'won', 'closed_won', 'conversion'],
        formulas: ['won.*total', 'win.*rate'],
        reportTypes: ['opportunity'],
        category: 'pipeline'
    },
    avg_deal_size: {
        fields: ['amount', 'deal_size', 'average_deal', 'avg_amount'],
        formulas: ['avg.*amount', 'average.*deal'],
        reportTypes: ['opportunity'],
        category: 'pipeline'
    },

    // Funnel Metrics
    lead_conversion: {
        fields: ['conversion', 'converted', 'lead_conversion'],
        formulas: ['converted.*total', 'conversion.*rate'],
        reportTypes: ['lead'],
        category: 'funnel'
    },
    mql_to_sql: {
        fields: ['mql', 'sql', 'qualified'],
        formulas: ['sql.*mql', 'qualified.*marketing'],
        reportTypes: ['lead', 'opportunity'],
        category: 'funnel'
    },
    sql_to_opp: {
        fields: ['sql', 'opportunity', 'opp_created'],
        formulas: ['opp.*sql'],
        reportTypes: ['lead', 'opportunity'],
        category: 'funnel'
    }
};

/**
 * RevOps Report Categories
 */
const REPORT_CATEGORIES = {
    revenue: {
        label: 'Revenue Metrics',
        kpis: ['arr', 'mrr', 'revenue_growth'],
        importance: 'critical',
        description: 'Track recurring and growth revenue'
    },
    retention: {
        label: 'Retention Metrics',
        kpis: ['nrr', 'grr', 'churn'],
        importance: 'critical',
        description: 'Monitor customer retention and expansion'
    },
    unit_economics: {
        label: 'Unit Economics',
        kpis: ['cac', 'ltv', 'ltv_cac_ratio', 'cac_payback'],
        importance: 'high',
        description: 'Measure customer acquisition efficiency'
    },
    pipeline: {
        label: 'Pipeline Metrics',
        kpis: ['pipeline_coverage', 'sales_velocity', 'win_rate', 'avg_deal_size'],
        importance: 'high',
        description: 'Track sales pipeline health'
    },
    funnel: {
        label: 'Funnel Metrics',
        kpis: ['lead_conversion', 'mql_to_sql', 'sql_to_opp'],
        importance: 'medium',
        description: 'Analyze lead conversion funnel'
    }
};

/**
 * Report Format Recommendations
 */
const FORMAT_RECOMMENDATIONS = {
    tabular: {
        bestFor: ['Detail lists', 'Export to CSV', 'Record-level analysis'],
        limitedFor: ['Trend analysis', 'Executive summaries', 'KPI dashboards']
    },
    summary: {
        bestFor: ['Grouped analysis', 'Category breakdowns', 'Team/region comparisons'],
        limitedFor: ['Time-series trends', 'Multi-dimensional analysis']
    },
    matrix: {
        bestFor: ['Cross-tabulation', 'Pivot analysis', 'Stage × Owner analysis'],
        limitedFor: ['Simple metrics', 'Detail-level data']
    },
    joined: {
        bestFor: ['Cross-object analysis', 'Complex relationships', 'Multi-entity reporting'],
        limitedFor: ['Simple single-object reports', 'High-volume data']
    }
};

/**
 * Existing Report Analyzer Class
 */
class ExistingReportAnalyzer {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || null;
        this.platform = options.platform || 'salesforce'; // 'salesforce', 'hubspot', 'both'
        this.kpiKnowledgeBase = RevOpsKPIKnowledgeBase ? new RevOpsKPIKnowledgeBase() : null;

        // Analysis results
        this.reports = [];
        this.dashboards = [];
        this.detectedKPIs = new Map();
        this.coverageGaps = [];
        this.recommendations = [];
        this.templateMatches = [];
    }

    /**
     * Execute SOQL query via SF CLI
     */
    async executeSalesforceQuery(soql) {
        if (!this.orgAlias) {
            throw new Error('Salesforce org alias required');
        }

        try {
            const cmd = `sf data query --query "${soql.replace(/"/g, '\\"')}" --target-org ${this.orgAlias} --json`;
            const { stdout } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
            const result = JSON.parse(stdout);

            if (result.status !== 0) {
                throw new Error(`SOQL query failed: ${result.message}`);
            }

            return result.result.records || [];
        } catch (error) {
            console.error(`Query error: ${error.message}`);
            return [];
        }
    }

    /**
     * Fetch existing Salesforce reports
     */
    async fetchSalesforceReports() {
        console.log('📊 Fetching Salesforce reports...');

        const query = `
            SELECT Id, Name, DeveloperName, FolderName, Format,
                   OwnerId, CreatedDate, LastModifiedDate
            FROM Report
            WHERE IsDeleted = FALSE
            ORDER BY LastModifiedDate DESC
            LIMIT 500
        `;

        this.reports = await this.executeSalesforceQuery(query);
        console.log(`   Found ${this.reports.length} reports`);

        return this.reports;
    }

    /**
     * Fetch report metadata using Analytics API
     */
    async fetchReportMetadata(reportId) {
        try {
            // Get org info for API calls
            const orgInfoCmd = `sf org display --target-org ${this.orgAlias} --json`;
            const { stdout: orgInfo } = await execAsync(orgInfoCmd);
            const org = JSON.parse(orgInfo).result;

            const apiVersion = 'v62.0';
            const url = `${org.instanceUrl}/services/data/${apiVersion}/analytics/reports/${reportId}/describe`;

            const cmd = `curl -s -H "Authorization: Bearer ${org.accessToken}" "${url}"`;
            const { stdout } = await execAsync(cmd);
            return JSON.parse(stdout);
        } catch (error) {
            console.warn(`Failed to fetch metadata for report ${reportId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Analyze report for KPI detection
     */
    analyzeReportForKPIs(report, metadata = null) {
        const detected = [];
        const reportNameLower = (report.Name || '').toLowerCase();
        const reportTypeLower = (metadata?.reportMetadata?.reportType || '').toLowerCase();

        // Get fields from metadata if available
        const detailColumns = metadata?.reportMetadata?.detailColumns || [];
        const aggregates = metadata?.reportMetadata?.aggregates || [];
        const allFields = [...detailColumns, ...aggregates].map(f => f.toLowerCase());

        for (const [kpiId, patterns] of Object.entries(KPI_DETECTION_PATTERNS)) {
            let score = 0;
            const matchReasons = [];

            // Check field patterns
            for (const field of patterns.fields) {
                if (allFields.some(f => f.includes(field))) {
                    score += 0.3;
                    matchReasons.push(`Field match: ${field}`);
                }
                if (reportNameLower.includes(field)) {
                    score += 0.2;
                    matchReasons.push(`Name contains: ${field}`);
                }
            }

            // Check report type patterns
            for (const type of patterns.reportTypes) {
                if (reportTypeLower.includes(type)) {
                    score += 0.2;
                    matchReasons.push(`Report type: ${type}`);
                }
            }

            // Check formula patterns (in report name as proxy)
            for (const formula of patterns.formulas) {
                const pattern = new RegExp(formula.replace(/\*/g, '.*'), 'i');
                if (pattern.test(reportNameLower)) {
                    score += 0.3;
                    matchReasons.push(`Formula pattern: ${formula}`);
                }
            }

            if (score >= 0.3) {
                detected.push({
                    kpiId,
                    category: patterns.category,
                    confidence: Math.min(score, 1.0),
                    matchReasons
                });
            }
        }

        return detected;
    }

    /**
     * Analyze all reports for KPI coverage
     */
    async analyzeKPICoverage(options = {}) {
        console.log('\n🔍 Analyzing KPI coverage...');

        const fetchMetadata = options.fetchMetadata !== false;
        const maxMetadataFetches = options.maxMetadataFetches || 50;

        let metadataFetchCount = 0;

        for (const report of this.reports) {
            let metadata = null;

            // Fetch metadata for active reports (limited to prevent API overuse)
            if (fetchMetadata && metadataFetchCount < maxMetadataFetches) {
                const isRecent = new Date(report.LastModifiedDate) >
                    new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // Last 6 months

                if (isRecent) {
                    metadata = await this.fetchReportMetadata(report.Id);
                    metadataFetchCount++;

                    if (metadataFetchCount % 10 === 0) {
                        console.log(`   Fetched metadata for ${metadataFetchCount} reports...`);
                    }
                }
            }

            // Analyze for KPIs
            const detected = this.analyzeReportForKPIs(report, metadata);

            for (const kpi of detected) {
                if (!this.detectedKPIs.has(kpi.kpiId)) {
                    this.detectedKPIs.set(kpi.kpiId, {
                        kpiId: kpi.kpiId,
                        category: kpi.category,
                        reports: [],
                        maxConfidence: 0
                    });
                }

                const entry = this.detectedKPIs.get(kpi.kpiId);
                entry.reports.push({
                    reportId: report.Id,
                    reportName: report.Name,
                    confidence: kpi.confidence,
                    matchReasons: kpi.matchReasons
                });
                entry.maxConfidence = Math.max(entry.maxConfidence, kpi.confidence);
            }

            // Store metadata with report
            report.detectedKPIs = detected;
            report.metadata = metadata;
        }

        console.log(`   Detected ${this.detectedKPIs.size} KPIs across reports`);
        return this.detectedKPIs;
    }

    /**
     * Identify coverage gaps
     */
    identifyCoverageGaps() {
        console.log('\n📉 Identifying coverage gaps...');

        const allKPIs = Object.keys(KPI_DETECTION_PATTERNS);
        const detectedKPIIds = new Set(this.detectedKPIs.keys());

        for (const kpiId of allKPIs) {
            const pattern = KPI_DETECTION_PATTERNS[kpiId];
            const category = REPORT_CATEGORIES[pattern.category];

            if (!detectedKPIIds.has(kpiId)) {
                this.coverageGaps.push({
                    kpiId,
                    kpiLabel: this.formatKPILabel(kpiId),
                    category: pattern.category,
                    categoryLabel: category?.label || pattern.category,
                    importance: category?.importance || 'medium',
                    description: `No reports tracking ${this.formatKPILabel(kpiId)}`,
                    suggestedReportType: pattern.reportTypes[0],
                    suggestedFields: pattern.fields.slice(0, 3)
                });
            } else {
                // Check for low confidence coverage
                const entry = this.detectedKPIs.get(kpiId);
                if (entry.maxConfidence < 0.5) {
                    this.coverageGaps.push({
                        kpiId,
                        kpiLabel: this.formatKPILabel(kpiId),
                        category: pattern.category,
                        categoryLabel: category?.label || pattern.category,
                        importance: 'low',
                        description: `Low confidence tracking for ${this.formatKPILabel(kpiId)}`,
                        suggestedReportType: pattern.reportTypes[0],
                        existingReports: entry.reports.map(r => r.reportName)
                    });
                }
            }
        }

        // Sort by importance
        const importanceOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        this.coverageGaps.sort((a, b) =>
            importanceOrder[a.importance] - importanceOrder[b.importance]
        );

        console.log(`   Found ${this.coverageGaps.length} coverage gaps`);
        return this.coverageGaps;
    }

    /**
     * Generate recommendations
     */
    generateRecommendations() {
        console.log('\n💡 Generating recommendations...');

        // 1. Coverage gap recommendations
        for (const gap of this.coverageGaps.filter(g => g.importance !== 'low')) {
            this.recommendations.push({
                type: 'coverage_gap',
                priority: gap.importance === 'critical' ? 'high' : 'medium',
                title: `Add ${gap.kpiLabel} Tracking`,
                description: gap.description,
                action: `Create a ${gap.suggestedReportType} report to track ${gap.kpiLabel}`,
                kpi: gap.kpiId,
                category: gap.category
            });
        }

        // 2. Report format recommendations
        for (const report of this.reports.slice(0, 50)) {
            const format = (report.Format || '').toLowerCase();
            const detectedKPIs = report.detectedKPIs || [];

            // Check if format matches detected KPIs
            if (detectedKPIs.some(k => k.category === 'pipeline') && format === 'tabular') {
                this.recommendations.push({
                    type: 'format_improvement',
                    priority: 'low',
                    title: `Consider Summary Format for ${report.Name}`,
                    description: 'Pipeline metrics benefit from grouped analysis',
                    action: 'Convert to SUMMARY format with Stage grouping',
                    reportId: report.Id,
                    reportName: report.Name
                });
            }
        }

        // 3. Template recommendations based on detected patterns
        const categoryCount = {};
        for (const [kpiId, entry] of this.detectedKPIs) {
            categoryCount[entry.category] = (categoryCount[entry.category] || 0) + 1;
        }

        // Suggest consolidated dashboards for categories with multiple reports
        for (const [category, count] of Object.entries(categoryCount)) {
            if (count >= 3) {
                const categoryInfo = REPORT_CATEGORIES[category];
                this.recommendations.push({
                    type: 'consolidation',
                    priority: 'medium',
                    title: `Create ${categoryInfo?.label || category} Dashboard`,
                    description: `${count} reports track ${category} metrics - consider consolidating`,
                    action: `Create a unified dashboard for ${categoryInfo?.label || category}`,
                    category
                });
            }
        }

        // 4. Stale report recommendations
        const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        const staleReports = this.reports.filter(r =>
            new Date(r.LastModifiedDate) < sixMonthsAgo
        );

        if (staleReports.length > 20) {
            this.recommendations.push({
                type: 'cleanup',
                priority: 'low',
                title: 'Review Stale Reports',
                description: `${staleReports.length} reports haven't been modified in 6+ months`,
                action: 'Review and archive or delete unused reports',
                count: staleReports.length
            });
        }

        console.log(`   Generated ${this.recommendations.length} recommendations`);
        return this.recommendations;
    }

    /**
     * Match to RevOps templates
     */
    matchToTemplates() {
        console.log('\n📋 Matching to RevOps templates...');

        const templates = [
            {
                id: 'arr-mrr-tracking',
                name: 'ARR/MRR Tracking',
                requiredKPIs: ['arr', 'mrr', 'revenue_growth'],
                category: 'revenue'
            },
            {
                id: 'nrr-retention',
                name: 'Net Revenue Retention',
                requiredKPIs: ['nrr', 'grr', 'churn'],
                category: 'retention'
            },
            {
                id: 'cac-ltv-analysis',
                name: 'CAC/LTV Analysis',
                requiredKPIs: ['cac', 'ltv', 'ltv_cac_ratio', 'cac_payback'],
                category: 'unit_economics'
            },
            {
                id: 'pipeline-coverage',
                name: 'Pipeline Coverage',
                requiredKPIs: ['pipeline_coverage', 'win_rate', 'avg_deal_size'],
                category: 'pipeline'
            },
            {
                id: 'sales-velocity',
                name: 'Sales Velocity',
                requiredKPIs: ['sales_velocity', 'win_rate', 'avg_deal_size'],
                category: 'pipeline'
            },
            {
                id: 'funnel-conversion',
                name: 'Funnel Conversion',
                requiredKPIs: ['lead_conversion', 'mql_to_sql', 'sql_to_opp'],
                category: 'funnel'
            }
        ];

        for (const template of templates) {
            const coveredKPIs = template.requiredKPIs.filter(kpi =>
                this.detectedKPIs.has(kpi) && this.detectedKPIs.get(kpi).maxConfidence >= 0.5
            );

            const coverage = coveredKPIs.length / template.requiredKPIs.length;
            const missingKPIs = template.requiredKPIs.filter(kpi => !coveredKPIs.includes(kpi));

            this.templateMatches.push({
                templateId: template.id,
                templateName: template.name,
                category: template.category,
                coverage: Math.round(coverage * 100),
                coveredKPIs,
                missingKPIs,
                status: coverage >= 0.8 ? 'ready' : coverage >= 0.5 ? 'partial' : 'gaps',
                recommendation: coverage >= 0.8
                    ? 'Ready to generate - data sources available'
                    : coverage >= 0.5
                        ? `Add tracking for: ${missingKPIs.map(k => this.formatKPILabel(k)).join(', ')}`
                        : `Missing key metrics: ${missingKPIs.map(k => this.formatKPILabel(k)).join(', ')}`
            });
        }

        // Sort by coverage
        this.templateMatches.sort((a, b) => b.coverage - a.coverage);

        console.log(`   Matched ${this.templateMatches.filter(t => t.status === 'ready').length} templates ready to use`);
        return this.templateMatches;
    }

    /**
     * Format KPI ID as label
     */
    formatKPILabel(kpiId) {
        return kpiId
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .replace('Arr', 'ARR')
            .replace('Mrr', 'MRR')
            .replace('Nrr', 'NRR')
            .replace('Grr', 'GRR')
            .replace('Cac', 'CAC')
            .replace('Ltv', 'LTV')
            .replace('Mql', 'MQL')
            .replace('Sql', 'SQL')
            .replace('Kpi', 'KPI');
    }

    /**
     * Run full analysis
     */
    async analyze(options = {}) {
        console.log('\n🔍 Existing Report Analyzer');
        console.log(`Platform: ${this.platform}`);
        if (this.orgAlias) {
            console.log(`Org: ${this.orgAlias}`);
        }

        try {
            // Step 1: Fetch reports
            if (this.platform === 'salesforce' || this.platform === 'both') {
                await this.fetchSalesforceReports();
            }

            // Step 2: Analyze KPI coverage
            await this.analyzeKPICoverage(options);

            // Step 3: Identify gaps
            this.identifyCoverageGaps();

            // Step 4: Generate recommendations
            this.generateRecommendations();

            // Step 5: Match to templates
            this.matchToTemplates();

            return this.getAnalysisSummary();
        } catch (error) {
            console.error(`Analysis failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get analysis summary
     */
    getAnalysisSummary() {
        // Category coverage summary
        const categoryCoverage = {};
        for (const [category, info] of Object.entries(REPORT_CATEGORIES)) {
            const covered = info.kpis.filter(kpi =>
                this.detectedKPIs.has(kpi) && this.detectedKPIs.get(kpi).maxConfidence >= 0.5
            );
            categoryCoverage[category] = {
                label: info.label,
                total: info.kpis.length,
                covered: covered.length,
                percentage: Math.round((covered.length / info.kpis.length) * 100),
                importance: info.importance
            };
        }

        return {
            metadata: {
                orgAlias: this.orgAlias,
                platform: this.platform,
                analyzedAt: new Date().toISOString(),
                totalReports: this.reports.length
            },
            summary: {
                totalReports: this.reports.length,
                detectedKPIs: this.detectedKPIs.size,
                totalKPIs: Object.keys(KPI_DETECTION_PATTERNS).length,
                coveragePercentage: Math.round((this.detectedKPIs.size / Object.keys(KPI_DETECTION_PATTERNS).length) * 100),
                criticalGaps: this.coverageGaps.filter(g => g.importance === 'critical').length,
                recommendations: this.recommendations.length,
                templatesReady: this.templateMatches.filter(t => t.status === 'ready').length
            },
            categoryCoverage,
            detectedKPIs: Array.from(this.detectedKPIs.entries()).map(([kpiId, data]) => ({
                kpiId,
                label: this.formatKPILabel(kpiId),
                category: data.category,
                reportCount: data.reports.length,
                maxConfidence: Math.round(data.maxConfidence * 100),
                topReports: data.reports
                    .sort((a, b) => b.confidence - a.confidence)
                    .slice(0, 3)
                    .map(r => ({ name: r.reportName, confidence: Math.round(r.confidence * 100) }))
            })),
            coverageGaps: this.coverageGaps,
            recommendations: this.recommendations,
            templateMatches: this.templateMatches
        };
    }

    /**
     * Generate markdown report
     */
    generateMarkdownReport() {
        const summary = this.getAnalysisSummary();
        const lines = [];

        lines.push('# Existing Report Analysis');
        lines.push('');
        lines.push(`**Org**: ${summary.metadata.orgAlias || 'N/A'}`);
        lines.push(`**Platform**: ${summary.metadata.platform}`);
        lines.push(`**Analyzed**: ${new Date(summary.metadata.analyzedAt).toLocaleString()}`);
        lines.push('');

        // Executive Summary
        lines.push('## Executive Summary');
        lines.push('');
        lines.push(`- **Total Reports Analyzed**: ${summary.summary.totalReports}`);
        lines.push(`- **RevOps KPIs Detected**: ${summary.summary.detectedKPIs}/${summary.summary.totalKPIs} (${summary.summary.coveragePercentage}%)`);
        lines.push(`- **Critical Gaps**: ${summary.summary.criticalGaps}`);
        lines.push(`- **Templates Ready**: ${summary.summary.templatesReady}`);
        lines.push('');

        // Category Coverage
        lines.push('## KPI Category Coverage');
        lines.push('');
        lines.push('| Category | Coverage | Status |');
        lines.push('|----------|----------|--------|');
        for (const [category, data] of Object.entries(summary.categoryCoverage)) {
            const status = data.percentage >= 80 ? '✅ Good' :
                data.percentage >= 50 ? '⚠️ Partial' : '❌ Gaps';
            lines.push(`| ${data.label} | ${data.covered}/${data.total} (${data.percentage}%) | ${status} |`);
        }
        lines.push('');

        // Template Readiness
        lines.push('## Template Readiness');
        lines.push('');
        lines.push('| Template | Coverage | Status | Action |');
        lines.push('|----------|----------|--------|--------|');
        for (const template of summary.templateMatches) {
            const statusIcon = template.status === 'ready' ? '✅' :
                template.status === 'partial' ? '⚠️' : '❌';
            lines.push(`| ${template.templateName} | ${template.coverage}% | ${statusIcon} ${template.status} | ${template.recommendation} |`);
        }
        lines.push('');

        // Coverage Gaps
        if (summary.coverageGaps.length > 0) {
            lines.push('## Coverage Gaps');
            lines.push('');
            const criticalGaps = summary.coverageGaps.filter(g => g.importance === 'critical');
            const otherGaps = summary.coverageGaps.filter(g => g.importance !== 'critical');

            if (criticalGaps.length > 0) {
                lines.push('### Critical Gaps');
                lines.push('');
                for (const gap of criticalGaps) {
                    lines.push(`- **${gap.kpiLabel}** (${gap.categoryLabel}): ${gap.description}`);
                }
                lines.push('');
            }

            if (otherGaps.length > 0) {
                lines.push('### Other Gaps');
                lines.push('');
                for (const gap of otherGaps.slice(0, 10)) {
                    lines.push(`- ${gap.kpiLabel} (${gap.categoryLabel}): ${gap.description}`);
                }
                lines.push('');
            }
        }

        // Top Recommendations
        lines.push('## Recommendations');
        lines.push('');
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const sortedRecs = [...summary.recommendations].sort((a, b) =>
            priorityOrder[a.priority] - priorityOrder[b.priority]
        );

        for (const rec of sortedRecs.slice(0, 10)) {
            const priorityIcon = rec.priority === 'high' ? '🔴' :
                rec.priority === 'medium' ? '🟡' : '🟢';
            lines.push(`### ${priorityIcon} ${rec.title}`);
            lines.push('');
            lines.push(rec.description);
            lines.push('');
            lines.push(`**Action**: ${rec.action}`);
            lines.push('');
        }

        return lines.join('\n');
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--org' && args[i + 1]) {
            options.orgAlias = args[i + 1];
            i++;
        } else if (args[i] === '--platform' && args[i + 1]) {
            options.platform = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            options.output = args[i + 1];
            i++;
        } else if (args[i] === '--format' && args[i + 1]) {
            options.format = args[i + 1];
            i++;
        } else if (args[i] === '--no-metadata') {
            options.fetchMetadata = false;
        }
    }

    if (!options.orgAlias) {
        console.error('Usage: node existing-report-analyzer.js --org <org-alias> [options]');
        console.error('');
        console.error('Options:');
        console.error('  --platform <sf|hs|both>  Platform to analyze (default: salesforce)');
        console.error('  --output <path>          Output file path');
        console.error('  --format <json|md>       Output format (default: json)');
        console.error('  --no-metadata            Skip fetching report metadata (faster)');
        process.exit(1);
    }

    (async () => {
        try {
            const analyzer = new ExistingReportAnalyzer(options);
            const results = await analyzer.analyze({
                fetchMetadata: options.fetchMetadata !== false
            });

            let output;
            if (options.format === 'md' || options.format === 'markdown') {
                output = analyzer.generateMarkdownReport();
            } else {
                output = JSON.stringify(results, null, 2);
            }

            if (options.output) {
                await fs.writeFile(options.output, output);
                console.log(`\n✅ Results saved to ${options.output}`);
            } else {
                console.log('\n' + output);
            }

            process.exit(0);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    })();
}

module.exports = {
    ExistingReportAnalyzer,
    KPI_DETECTION_PATTERNS,
    REPORT_CATEGORIES,
    FORMAT_RECOMMENDATIONS
};
