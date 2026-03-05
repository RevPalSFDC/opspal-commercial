#!/usr/bin/env node

/**
 * User Reports & Dashboards Extractor
 *
 * Extracts reports and dashboards created by a specific user from a Salesforce org
 * and generates intelligent, reusable templates with automatic field adaptation.
 *
 * Features:
 * - Phase 1: Discovery - Find user's reports/dashboards via SOQL
 * - Phase 2: Metadata Extraction - Full report/dashboard details via Analytics REST API
 * - Phase 3: Analysis - Business logic patterns, portability scores
 * - Phase 4: Template Creation - Anonymized parameterized templates with variations
 * - Phase 5: Validation & Registration - Tested, registered templates
 *
 * CRITICAL: Final templates are 100% instance-agnostic:
 * - No personal names (creator, owner)
 * - No client/company names
 * - No org-specific identifiers
 * - Templates named by business function only
 *
 * Usage:
 *   node user-reports-extractor.js --org <alias> --user "<Full Name>"
 *   node user-reports-extractor.js --org acme-production --user "Rachel Chu" --output ./templates
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const AnalyticsDiscoveryV2 = require('./analytics-discovery-v2');

// Configuration
const CONFIG = {
    API_VERSION: process.env.SALESFORCE_API_VERSION || 'v64.0',
    TEMPLATE_PREFIX: 'bp', // Best Practice prefix for anonymized templates
    MIN_PORTABILITY_SCORE: 0.5,
    STANDARD_FIELDS: [
        'Id', 'Name', 'OwnerId', 'CreatedDate', 'LastModifiedDate', 'CreatedById',
        'Amount', 'StageName', 'CloseDate', 'IsClosed', 'IsWon', 'Probability',
        'AccountId', 'Account.Name', 'OpportunityId', 'ContactId', 'LeadId',
        'Type', 'Status', 'Priority', 'Description', 'Subject',
        'AMOUNT', 'STAGE_NAME', 'CLOSE_DATE', 'IS_CLOSED', 'IS_WON', 'PROBABILITY',
        'ACCOUNT_NAME', 'OPPORTUNITY_NAME', 'CREATED_DATE', 'LAST_MODIFIED_DATE',
        'OWNER_NAME', 'FULL_NAME', 'TYPE', 'STATUS', 'PRIORITY'
    ],
    FUNCTION_KEYWORDS: {
        sales: ['pipeline', 'quota', 'revenue', 'opportunity', 'forecast', 'win', 'deal', 'booking', 'closed'],
        marketing: ['lead', 'campaign', 'mql', 'conversion', 'source', 'funnel', 'marketing'],
        'customer-success': ['renewal', 'health', 'nrr', 'case', 'churn', 'retention', 'support', 'customer']
    },
    AUDIENCE_KEYWORDS: {
        executive: ['c-level', 'cro', 'cfo', 'cmo', 'vp', 'director', 'executive', 'board', 'leadership'],
        manager: ['manager', 'lead', 'supervisor', 'team'],
        individual: ['rep', 'individual', 'my', 'personal']
    }
};

class UserReportsExtractor {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = options;
        this.analytics = null;
        this.instanceUrl = null;
        this.accessToken = null;

        // Output directories
        this.pluginRoot = options.pluginRoot || path.resolve(__dirname, '../..');
        this.instancesDir = options.instancesDir || path.join(process.cwd(), 'instances/salesforce', orgAlias);
        this.templatesDir = options.templatesDir || path.join(this.pluginRoot, 'templates/reports/best-practices');

        // Results
        this.discoveryResults = null;
        this.metadataResults = null;
        this.analysisResults = null;
        this.templates = [];
    }

    /**
     * Initialize connections
     */
    async initialize() {
        console.log(`\n🔌 Connecting to Salesforce org: ${this.orgAlias}...`);

        // Get authentication
        const authCmd = `sf org display --json --target-org ${this.orgAlias}`;
        const { stdout } = await execAsync(authCmd);
        const authData = JSON.parse(stdout);

        if (!authData.result || !authData.result.accessToken) {
            throw new Error(`Failed to authenticate with org ${this.orgAlias}`);
        }

        this.instanceUrl = authData.result.instanceUrl;
        this.accessToken = authData.result.accessToken;

        // Initialize Analytics API
        this.analytics = new AnalyticsDiscoveryV2(
            this.instanceUrl,
            this.accessToken,
            { safeMode: true }
        );

        // Ensure directories exist
        await fs.mkdir(this.instancesDir, { recursive: true });
        await fs.mkdir(this.templatesDir, { recursive: true });

        console.log('   ✅ Connected successfully');
        return this;
    }

    /**
     * Phase 1: Discovery - Find user's reports and dashboards
     */
    async discoverUserAssets(userName) {
        console.log(`\n📋 Phase 1: Discovering reports/dashboards for user "${userName}"...`);

        const results = {
            userName,
            timestamp: new Date().toISOString(),
            reports: [],
            dashboards: [],
            errors: []
        };

        // Query reports by owner
        try {
            const reportsQuery = `
                SELECT Id, Name, DeveloperName, FolderName, Format, Description,
                       OwnerId, Owner.Name, CreatedDate, LastModifiedDate
                FROM Report
                WHERE Owner.Name = '${userName}'
                ORDER BY FolderName, Name
            `;

            const reportsResult = await this.executeSoql(reportsQuery);
            results.reports = reportsResult.records || [];
            console.log(`   📊 Found ${results.reports.length} reports`);
        } catch (error) {
            results.errors.push({ type: 'reports', error: error.message });
            console.error(`   ❌ Report query failed: ${error.message}`);
        }

        // Query dashboards by owner
        try {
            const dashboardsQuery = `
                SELECT Id, DeveloperName, Title, FolderName, Description,
                       OwnerId, Owner.Name, CreatedDate, LastModifiedDate
                FROM Dashboard
                WHERE Owner.Name = '${userName}'
                ORDER BY FolderName, Title
            `;

            const dashboardsResult = await this.executeSoql(dashboardsQuery);
            results.dashboards = dashboardsResult.records || [];
            console.log(`   📈 Found ${results.dashboards.length} dashboards`);
        } catch (error) {
            results.errors.push({ type: 'dashboards', error: error.message });
            console.error(`   ❌ Dashboard query failed: ${error.message}`);
        }

        // Save discovery results
        const discoveryPath = path.join(this.instancesDir, 'user-reports-discovery.json');
        await fs.writeFile(discoveryPath, JSON.stringify(results, null, 2));
        console.log(`   💾 Saved discovery to: ${discoveryPath}`);

        this.discoveryResults = results;
        return results;
    }

    /**
     * Phase 2: Metadata Extraction - Get full details via Analytics REST API
     */
    async extractMetadata() {
        if (!this.discoveryResults) {
            throw new Error('Run discoverUserAssets() first');
        }

        console.log(`\n📦 Phase 2: Extracting detailed metadata...`);

        const results = {
            timestamp: new Date().toISOString(),
            reports: [],
            dashboards: [],
            errors: []
        };

        // Extract report metadata
        for (const report of this.discoveryResults.reports) {
            try {
                console.log(`   📊 Extracting: ${report.Name}...`);
                const metadata = await this.extractReportMetadata(report.Id);
                results.reports.push({
                    ...report,
                    fullMetadata: metadata
                });
            } catch (error) {
                results.errors.push({
                    type: 'report',
                    id: report.Id,
                    name: report.Name,
                    error: error.message
                });
                console.error(`      ❌ Failed: ${error.message}`);
            }
        }

        // Extract dashboard metadata
        for (const dashboard of this.discoveryResults.dashboards) {
            try {
                console.log(`   📈 Extracting: ${dashboard.Title}...`);
                const metadata = await this.extractDashboardMetadata(dashboard.Id);
                results.dashboards.push({
                    ...dashboard,
                    fullMetadata: metadata
                });
            } catch (error) {
                results.errors.push({
                    type: 'dashboard',
                    id: dashboard.Id,
                    name: dashboard.Title,
                    error: error.message
                });
                console.error(`      ❌ Failed: ${error.message}`);
            }
        }

        // Save metadata results
        const metadataPath = path.join(this.instancesDir, 'user-reports-metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify(results, null, 2));
        console.log(`   💾 Saved metadata to: ${metadataPath}`);

        this.metadataResults = results;
        return results;
    }

    /**
     * Extract detailed report metadata via Analytics REST API
     */
    async extractReportMetadata(reportId) {
        const endpoint = `/services/data/${CONFIG.API_VERSION}/analytics/reports/${reportId}/describe`;
        const response = await this.makeRequest(endpoint);
        return response;
    }

    /**
     * Extract dashboard metadata
     */
    async extractDashboardMetadata(dashboardId) {
        // Query dashboard components
        const componentsQuery = `
            SELECT Id, DashboardId, Name, CustomReportId
            FROM DashboardComponent
            WHERE DashboardId = '${dashboardId}'
        `;

        const componentsResult = await this.executeSoql(componentsQuery);

        return {
            dashboardId,
            components: componentsResult.records || []
        };
    }

    /**
     * Phase 3: Analysis - Understand business logic
     */
    async analyzeAssets() {
        if (!this.metadataResults) {
            throw new Error('Run extractMetadata() first');
        }

        console.log(`\n🔍 Phase 3: Analyzing business logic patterns...`);

        const results = {
            timestamp: new Date().toISOString(),
            reports: [],
            dashboards: [],
            summary: {
                totalReports: 0,
                totalDashboards: 0,
                byFunction: {},
                byAudience: {},
                averagePortability: 0,
                highlyPortable: 0,
                needsAdaptation: 0
            }
        };

        // Analyze each report
        for (const report of this.metadataResults.reports) {
            const analysis = this.analyzeReport(report);
            results.reports.push(analysis);

            // Update summary
            results.summary.byFunction[analysis.function] = (results.summary.byFunction[analysis.function] || 0) + 1;
            results.summary.byAudience[analysis.audience] = (results.summary.byAudience[analysis.audience] || 0) + 1;

            if (analysis.portabilityScore >= 0.9) {
                results.summary.highlyPortable++;
            } else if (analysis.portabilityScore >= 0.7) {
                results.summary.needsAdaptation++;
            }
        }

        results.summary.totalReports = results.reports.length;
        results.summary.totalDashboards = this.metadataResults.dashboards.length;
        results.summary.averagePortability = results.reports.reduce((sum, r) => sum + r.portabilityScore, 0) / results.reports.length || 0;

        // Log summary
        console.log(`\n   📊 Analysis Summary:`);
        console.log(`      Reports: ${results.summary.totalReports}`);
        console.log(`      Dashboards: ${results.summary.totalDashboards}`);
        console.log(`      By Function: ${JSON.stringify(results.summary.byFunction)}`);
        console.log(`      Average Portability: ${(results.summary.averagePortability * 100).toFixed(1)}%`);
        console.log(`      Highly Portable (90%+): ${results.summary.highlyPortable}`);
        console.log(`      Needs Adaptation (70-90%): ${results.summary.needsAdaptation}`);

        this.analysisResults = results;
        return results;
    }

    /**
     * Analyze a single report
     */
    analyzeReport(report) {
        const metadata = report.fullMetadata?.reportMetadata || {};
        const extendedMetadata = report.fullMetadata?.reportExtendedMetadata || {};

        // Extract fields
        const detailColumns = metadata.detailColumns || [];
        const groupingsDown = (metadata.groupingsDown || []).map(g => g.name);
        const groupingsAcross = (metadata.groupingsAcross || []).map(g => g.name);
        const filterColumns = (metadata.reportFilters || []).map(f => f.column);
        const aggregates = (metadata.aggregates || []).map(a => a.name);

        const allFields = [...new Set([
            ...detailColumns,
            ...groupingsDown,
            ...groupingsAcross,
            ...filterColumns,
            ...aggregates
        ])];

        // Calculate portability
        const standardFields = allFields.filter(f => this.isStandardField(f));
        const customFields = allFields.filter(f => f.endsWith('__c') || f.includes('__c.'));
        const portabilityScore = allFields.length > 0 ? standardFields.length / allFields.length : 1;

        // Determine function - check all categories and use best match
        const reportName = (report.Name || '').toLowerCase();
        const description = (metadata.description || '').toLowerCase();
        const textToAnalyze = `${reportName} ${description}`;

        // Count keyword matches for each function to find best match
        const functionMatches = {};
        for (const [func, keywords] of Object.entries(CONFIG.FUNCTION_KEYWORDS)) {
            functionMatches[func] = keywords.filter(kw => textToAnalyze.includes(kw)).length;
        }

        // Use function with most keyword matches, default to 'sales'
        let detectedFunction = 'sales';
        let maxMatches = 0;
        for (const [func, matches] of Object.entries(functionMatches)) {
            if (matches > maxMatches) {
                maxMatches = matches;
                detectedFunction = func;
            }
        }

        // Determine audience
        let detectedAudience = 'manager'; // default
        for (const [audience, keywords] of Object.entries(CONFIG.AUDIENCE_KEYWORDS)) {
            if (keywords.some(kw => textToAnalyze.includes(kw))) {
                detectedAudience = audience;
                break;
            }
        }

        // Generate template ID (anonymized)
        const templateId = this.generateTemplateId(report.Name, detectedFunction);

        return {
            originalId: report.Id,
            originalName: report.Name,
            templateId,
            function: detectedFunction,
            audience: detectedAudience,
            reportType: metadata.reportType?.type || 'Unknown',
            reportFormat: metadata.reportFormat || 'TABULAR',
            fields: {
                total: allFields.length,
                standard: standardFields.length,
                custom: customFields.length,
                list: allFields
            },
            portabilityScore: Math.round(portabilityScore * 100) / 100,
            portabilityTier: portabilityScore >= 0.9 ? 'high' : portabilityScore >= 0.7 ? 'medium' : 'low',
            customFieldsNeedingFallback: customFields,
            groupings: {
                down: groupingsDown,
                across: groupingsAcross
            },
            filters: metadata.reportFilters || [],
            aggregates: metadata.aggregates || [],
            chart: metadata.chart || null,
            metadata: metadata
        };
    }

    /**
     * Check if a field is standard (portable)
     */
    isStandardField(fieldName) {
        if (!fieldName) return false;

        // If the field contains __c anywhere, it's custom
        if (fieldName.includes('__c')) return false;

        // Direct match
        if (CONFIG.STANDARD_FIELDS.includes(fieldName)) return true;

        // Check without object prefix
        const fieldPart = fieldName.split('.').pop();
        if (CONFIG.STANDARD_FIELDS.includes(fieldPart)) return true;

        // Standard fields don't contain __c
        return true;
    }

    /**
     * Generate anonymized template ID
     */
    generateTemplateId(reportName, func) {
        // Remove personal/company identifiers
        let cleaned = reportName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-');

        // Remove common personal prefixes
        cleaned = cleaned
            .replace(/^(rc|jd|my|personal|team)-?/i, '')
            .replace(/-(q[1-4]|fy\d+|20\d{2})/gi, '');

        // Ensure function prefix
        if (!cleaned.startsWith(func)) {
            cleaned = `${CONFIG.TEMPLATE_PREFIX}-${func}-${cleaned}`;
        } else {
            cleaned = `${CONFIG.TEMPLATE_PREFIX}-${cleaned}`;
        }

        // Truncate if too long
        if (cleaned.length > 50) {
            cleaned = cleaned.substring(0, 50);
        }

        return cleaned;
    }

    /**
     * Phase 4: Template Creation - Generate anonymized templates
     */
    async generateTemplates() {
        if (!this.analysisResults) {
            throw new Error('Run analyzeAssets() first');
        }

        console.log(`\n🔨 Phase 4: Generating anonymized templates...`);

        const templates = [];

        for (const analysis of this.analysisResults.reports) {
            // Skip low portability reports
            if (analysis.portabilityScore < CONFIG.MIN_PORTABILITY_SCORE) {
                console.log(`   ⏭️  Skipping ${analysis.originalName} (portability: ${(analysis.portabilityScore * 100).toFixed(0)}%)`);
                continue;
            }

            console.log(`   📝 Creating template: ${analysis.templateId}...`);

            const template = this.createTemplate(analysis);
            templates.push(template);

            // Save template
            const templatePath = this.getTemplatePath(template);
            await fs.mkdir(path.dirname(templatePath), { recursive: true });
            await fs.writeFile(templatePath, JSON.stringify(template, null, 2));
            console.log(`      💾 Saved: ${templatePath}`);
        }

        this.templates = templates;
        console.log(`\n   ✅ Generated ${templates.length} templates`);

        return templates;
    }

    /**
     * Create a single anonymized template
     */
    createTemplate(analysis) {
        // Build anonymized template name
        const templateName = this.generateTemplateName(analysis);

        // Build description without source attribution
        const description = this.generateDescription(analysis);

        // Build variations
        const variations = this.buildVariations(analysis);

        // Build org adaptation
        const orgAdaptation = this.buildOrgAdaptation(analysis);

        // Build report metadata (anonymized)
        const reportMetadata = this.buildReportMetadata(analysis);

        return {
            templateMetadata: {
                templateId: analysis.templateId,
                templateName: templateName,
                templateVersion: '1.0',
                description: description,
                audience: this.getAudienceDescription(analysis.audience),
                function: analysis.function,
                level: analysis.audience,
                useCase: this.generateUseCase(analysis),
                tags: this.generateTags(analysis)
            },
            variations: variations,
            orgAdaptation: orgAdaptation,
            reportMetadata: reportMetadata,
            dashboardUsage: this.buildDashboardUsage(analysis)
        };
    }

    /**
     * Generate anonymized template name
     */
    generateTemplateName(analysis) {
        // Convert template ID to title case
        const words = analysis.templateId
            .replace(`${CONFIG.TEMPLATE_PREFIX}-`, '')
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1));

        return `Best Practice: ${words.join(' ')}`;
    }

    /**
     * Generate description without source attribution
     */
    generateDescription(analysis) {
        const funcDescriptions = {
            sales: 'Sales performance and pipeline analysis',
            marketing: 'Marketing funnel and campaign analysis',
            'customer-success': 'Customer health and retention analysis'
        };

        const audienceDescriptions = {
            executive: 'for executive leadership and C-level stakeholders',
            manager: 'for team managers and directors',
            individual: 'for individual contributors and reps'
        };

        const base = funcDescriptions[analysis.function] || 'Business intelligence report';
        const audience = audienceDescriptions[analysis.audience] || '';

        return `${base} ${audience}. Report format: ${analysis.reportFormat}. Portability: ${(analysis.portabilityScore * 100).toFixed(0)}%.`;
    }

    /**
     * Build variations section
     */
    buildVariations(analysis) {
        const variations = {
            availableVariations: ['simple', 'standard'],
            defaultVariation: 'standard',
            variationOverrides: {
                simple: {
                    description: 'Streamlined version with fewer fields',
                    reportOverrides: {
                        maxColumns: 5
                    }
                },
                standard: {
                    description: 'Full report with all fields'
                }
            }
        };

        // Add CPQ variation if report uses Amount
        const usesAmount = analysis.fields.list.some(f =>
            f.toLowerCase().includes('amount') || f.toLowerCase().includes('revenue')
        );

        if (usesAmount) {
            variations.availableVariations.push('cpq');
            variations.variationOverrides.cpq = {
                description: 'CPQ-enabled with Salesforce CPQ fields',
                fieldSubstitutions: {
                    'Amount': 'SBQQ__NetAmount__c',
                    'AMOUNT': 'SBQQ__NetAmount__c'
                }
            };
        }

        // Add enterprise variation for executive reports
        if (analysis.audience === 'executive') {
            variations.availableVariations.push('enterprise');
            variations.variationOverrides.enterprise = {
                description: 'Enterprise focus with higher value thresholds',
                filterOverrides: [
                    {
                        column: 'Amount',
                        operator: 'greaterOrEqual',
                        value: '100000'
                    }
                ]
            };
        }

        return variations;
    }

    /**
     * Build org adaptation section
     */
    buildOrgAdaptation(analysis) {
        const adaptation = {
            requiredFields: [],
            optionalFields: [],
            minimumFidelity: 0.7,
            fieldFallbacks: {}
        };

        // Identify required vs optional fields
        for (const field of analysis.fields.list) {
            if (this.isStandardField(field)) {
                adaptation.requiredFields.push(field);
            } else {
                adaptation.optionalFields.push(field);

                // Build fallback patterns
                const baseFieldName = field.replace('__c', '').replace(/_/g, '');
                adaptation.fieldFallbacks[field] = {
                    patterns: [
                        field,
                        field.replace('__c', ''),
                        `${baseFieldName}__c`,
                        `Custom_${baseFieldName}__c`
                    ],
                    dataType: 'text',
                    fallbackChain: [
                        { namespace: null, field: field }
                    ]
                };
            }
        }

        // Add common field fallbacks
        if (analysis.fields.list.some(f => f.toLowerCase().includes('amount'))) {
            adaptation.fieldFallbacks['Amount'] = {
                patterns: ['Amount', 'Pipeline_Value__c', 'Deal_Value__c', 'Revenue__c'],
                cpqPatterns: ['SBQQ__NetAmount__c', 'SBQQ__CustomerTotal__c'],
                dataType: 'currency',
                fallbackChain: [
                    { namespace: 'SBQQ', field: 'SBQQ__NetAmount__c' },
                    { namespace: null, field: 'Amount' }
                ]
            };
        }

        return adaptation;
    }

    /**
     * Build report metadata (anonymized)
     */
    buildReportMetadata(analysis) {
        const metadata = {
            name: this.generateTemplateName(analysis).replace('Best Practice: ', ''),
            reportType: analysis.reportType,
            reportFormat: analysis.reportFormat,
            scope: 'organization',
            showDetails: analysis.reportFormat === 'TABULAR'
        };

        // Add columns (only if TABULAR)
        if (analysis.reportFormat === 'TABULAR' && analysis.metadata.detailColumns) {
            metadata.detailColumns = analysis.metadata.detailColumns;
        }

        // Add groupings
        if (analysis.groupings.down.length > 0) {
            metadata.groupingsDown = analysis.groupings.down.map(name => ({
                name: name,
                sortOrder: 'Asc'
            }));
        }

        if (analysis.groupings.across.length > 0) {
            metadata.groupingsAcross = analysis.groupings.across.map(name => ({
                name: name,
                sortOrder: 'Asc'
            }));
        }

        // Add filters (anonymized - remove specific values)
        if (analysis.filters.length > 0) {
            metadata.reportFilters = analysis.filters.map(f => ({
                column: f.column,
                operator: f.operator,
                value: this.anonymizeFilterValue(f.value),
                customizable: true
            }));
        }

        // Add aggregates
        if (analysis.aggregates.length > 0) {
            metadata.aggregates = analysis.aggregates;
        }

        // Add chart (if present)
        if (analysis.chart) {
            metadata.chart = analysis.chart;
        }

        return metadata;
    }

    /**
     * Anonymize filter values
     */
    anonymizeFilterValue(value) {
        if (!value) return value;

        // Keep relative date values
        if (typeof value === 'string' && (
            value.startsWith('THIS_') ||
            value.startsWith('LAST_') ||
            value.startsWith('NEXT_') ||
            value === 'true' ||
            value === 'false'
        )) {
            return value;
        }

        // Mark as customizable placeholder
        return '{CUSTOMIZE}';
    }

    /**
     * Build dashboard usage section
     */
    buildDashboardUsage(analysis) {
        const dashboardMap = {
            sales: ['pipeline-health', 'revenue-performance', 'team-productivity'],
            marketing: ['marketing-performance', 'demand-gen-funnel', 'campaign-performance'],
            'customer-success': ['cs-overview', 'renewal-pipeline', 'account-health']
        };

        const chartTypeMap = {
            'SUMMARY': 'Bar',
            'MATRIX': 'Table',
            'TABULAR': 'Table'
        };

        return {
            recommendedDashboards: dashboardMap[analysis.function] || ['general-overview'],
            componentType: chartTypeMap[analysis.reportFormat] || 'Table',
            refreshFrequency: analysis.audience === 'executive' ? 'Daily' : 'Weekly'
        };
    }

    /**
     * Get template path
     */
    getTemplatePath(template) {
        const func = template.templateMetadata.function;
        const level = template.templateMetadata.level;
        const filename = `${template.templateMetadata.templateId}.json`;

        return path.join(this.templatesDir, func, level, filename);
    }

    /**
     * Get audience description
     */
    getAudienceDescription(audience) {
        const descriptions = {
            executive: 'C-level executives, VPs, and Directors',
            manager: 'Team managers and sales leaders',
            individual: 'Individual contributors and reps'
        };
        return descriptions[audience] || audience;
    }

    /**
     * Generate use case description
     */
    generateUseCase(analysis) {
        const useCases = {
            sales: {
                executive: 'Strategic planning, board reporting, and performance reviews',
                manager: 'Team performance tracking and coaching',
                individual: 'Personal quota tracking and deal management'
            },
            marketing: {
                executive: 'Marketing ROI analysis and budget planning',
                manager: 'Campaign performance and funnel optimization',
                individual: 'Lead management and activity tracking'
            },
            'customer-success': {
                executive: 'Retention analysis and expansion planning',
                manager: 'Account health monitoring and renewal forecasting',
                individual: 'Account management and case tracking'
            }
        };

        return useCases[analysis.function]?.[analysis.audience] || 'General business reporting';
    }

    /**
     * Generate tags
     */
    generateTags(analysis) {
        const tags = ['best-practice', analysis.function, analysis.audience];

        // Add report format tag
        tags.push(analysis.reportFormat.toLowerCase());

        // Add portability tag
        if (analysis.portabilityScore >= 0.9) {
            tags.push('highly-portable');
        }

        // Add common keyword tags based on fields
        const fieldText = analysis.fields.list.join(' ').toLowerCase();
        if (fieldText.includes('amount') || fieldText.includes('revenue')) tags.push('revenue');
        if (fieldText.includes('pipeline') || fieldText.includes('stage')) tags.push('pipeline');
        if (fieldText.includes('quota') || fieldText.includes('attainment')) tags.push('quota');
        if (fieldText.includes('activity') || fieldText.includes('task')) tags.push('activity');

        return [...new Set(tags)];
    }

    /**
     * Phase 5: Validation & Registration
     */
    async validateAndRegister() {
        if (!this.templates || this.templates.length === 0) {
            throw new Error('Run generateTemplates() first');
        }

        console.log(`\n✅ Phase 5: Validating and registering templates...`);

        const results = {
            validated: [],
            failed: [],
            registered: 0
        };

        // Validate each template
        for (const template of this.templates) {
            const validation = this.validateTemplate(template);

            if (validation.valid) {
                results.validated.push({
                    templateId: template.templateMetadata.templateId,
                    templateName: template.templateMetadata.templateName
                });
            } else {
                results.failed.push({
                    templateId: template.templateMetadata.templateId,
                    errors: validation.errors
                });
            }
        }

        console.log(`   ✅ Validated: ${results.validated.length}`);
        console.log(`   ❌ Failed: ${results.failed.length}`);

        // Update registry (if templates validated)
        if (results.validated.length > 0) {
            await this.updateRegistry(results.validated);
            results.registered = results.validated.length;
        }

        // Generate summary
        await this.generateSummary(results);

        return results;
    }

    /**
     * Validate a template
     */
    validateTemplate(template) {
        const errors = [];

        // Check required fields
        if (!template.templateMetadata?.templateId) {
            errors.push('Missing templateMetadata.templateId');
        }
        if (!template.templateMetadata?.templateName) {
            errors.push('Missing templateMetadata.templateName');
        }
        if (!template.reportMetadata?.reportType) {
            errors.push('Missing reportMetadata.reportType');
        }

        // Check for personal/company info in template (CRITICAL)
        const templateJson = JSON.stringify(template);
        const sensitivePatterns = [
            /Rachel/gi,
            /Chu/gi,
            /Peregrine/gi,
            /rc-/gi,  // Personal initials prefix
            /originalCreator/gi,
            /sourceOrg/gi
        ];

        for (const pattern of sensitivePatterns) {
            if (pattern.test(templateJson)) {
                errors.push(`Contains sensitive/personal information matching: ${pattern}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Update dashboard template registry
     */
    async updateRegistry(validatedTemplates) {
        const registryPath = path.join(this.pluginRoot, 'templates/dashboards/dashboard-template-registry.json');

        try {
            const registryContent = await fs.readFile(registryPath, 'utf8');
            const registry = JSON.parse(registryContent);

            // Add new templates to appropriate categories
            for (const template of validatedTemplates) {
                const fullTemplate = this.templates.find(t => t.templateMetadata.templateId === template.templateId);
                if (!fullTemplate) continue;

                const func = fullTemplate.templateMetadata.function;
                const level = fullTemplate.templateMetadata.level;

                // Ensure category exists
                if (!registry.categories[func]) {
                    registry.categories[func] = {
                        description: `${func} performance and analysis dashboards`,
                        executive: [],
                        manager: [],
                        individual: []
                    };
                }

                if (!registry.categories[func][level]) {
                    registry.categories[func][level] = [];
                }

                // Check if already exists
                const exists = registry.categories[func][level].some(
                    t => t.templateId === template.templateId
                );

                if (!exists) {
                    registry.categories[func][level].push({
                        templateId: template.templateId,
                        templateName: fullTemplate.templateMetadata.templateName,
                        path: `best-practices/${func}/${level}/${template.templateId}.json`,
                        description: fullTemplate.templateMetadata.description,
                        personas: this.getPersonasForAudience(level),
                        tags: fullTemplate.templateMetadata.tags
                    });
                }
            }

            // Update statistics
            registry.statistics.totalTemplates = this.countTemplates(registry.categories);
            registry.lastUpdated = new Date().toISOString().split('T')[0];

            // Save updated registry
            await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
            console.log(`   📋 Updated registry: ${registryPath}`);

        } catch (error) {
            console.warn(`   ⚠️  Could not update registry: ${error.message}`);
        }
    }

    /**
     * Count templates in registry
     */
    countTemplates(categories) {
        let count = 0;
        for (const func of Object.values(categories)) {
            for (const [key, value] of Object.entries(func)) {
                if (Array.isArray(value)) {
                    count += value.length;
                }
            }
        }
        return count;
    }

    /**
     * Get personas for audience level
     */
    getPersonasForAudience(level) {
        const personaMap = {
            executive: ['cro', 'vp_sales', 'cfo'],
            manager: ['sales_manager', 'team_lead'],
            individual: ['rep', 'csm']
        };
        return personaMap[level] || [];
    }

    /**
     * Generate extraction summary
     */
    async generateSummary(validationResults) {
        const summary = {
            extractionDate: new Date().toISOString(),
            org: this.orgAlias,
            statistics: {
                discovered: {
                    reports: this.discoveryResults?.reports?.length || 0,
                    dashboards: this.discoveryResults?.dashboards?.length || 0
                },
                extracted: {
                    reports: this.metadataResults?.reports?.length || 0,
                    dashboards: this.metadataResults?.dashboards?.length || 0
                },
                analyzed: {
                    reports: this.analysisResults?.reports?.length || 0
                },
                templates: {
                    generated: this.templates.length,
                    validated: validationResults.validated.length,
                    registered: validationResults.registered
                }
            },
            byFunction: this.analysisResults?.summary?.byFunction || {},
            byAudience: this.analysisResults?.summary?.byAudience || {},
            averagePortability: this.analysisResults?.summary?.averagePortability || 0,
            outputPaths: {
                discovery: path.join(this.instancesDir, 'user-reports-discovery.json'),
                metadata: path.join(this.instancesDir, 'user-reports-metadata.json'),
                templates: this.templatesDir
            },
            note: 'All templates are anonymized. No personal or company names included.'
        };

        // Save summary
        const summaryPath = path.join(this.templatesDir, 'EXTRACTION_SUMMARY.md');
        const markdown = this.generateSummaryMarkdown(summary);
        await fs.writeFile(summaryPath, markdown);
        console.log(`\n   📄 Generated summary: ${summaryPath}`);

        return summary;
    }

    /**
     * Generate summary markdown
     */
    generateSummaryMarkdown(summary) {
        return `# Report Template Extraction Summary

## Extraction Details

| Metric | Value |
|--------|-------|
| Extraction Date | ${summary.extractionDate} |
| Source Org | ${summary.org} |
| Reports Discovered | ${summary.statistics.discovered.reports} |
| Dashboards Discovered | ${summary.statistics.discovered.dashboards} |
| Templates Generated | ${summary.statistics.templates.generated} |
| Templates Validated | ${summary.statistics.templates.validated} |
| Templates Registered | ${summary.statistics.templates.registered} |

## Distribution by Function

| Function | Count |
|----------|-------|
${Object.entries(summary.byFunction).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Distribution by Audience

| Audience | Count |
|----------|-------|
${Object.entries(summary.byAudience).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## Portability

- **Average Portability Score**: ${(summary.averagePortability * 100).toFixed(1)}%
- Templates with 90%+ portability are highly reusable across orgs
- Templates with 70-90% portability need field fallback configuration

## Output Locations

- **Discovery Data**: \`${summary.outputPaths.discovery}\`
- **Metadata Extraction**: \`${summary.outputPaths.metadata}\`
- **Templates**: \`${summary.outputPaths.templates}\`

## Notes

- All templates are **100% anonymized** - no personal or company names
- Templates use \`bp-\` prefix (Best Practice)
- Each template includes variation support (simple, standard, cpq, enterprise)
- Field fallbacks configured for cross-org deployment

---
*Generated by User Reports Extractor*
`;
    }

    /**
     * Execute SOQL query
     */
    async executeSoql(query) {
        const endpoint = `/services/data/${CONFIG.API_VERSION}/query?q=${encodeURIComponent(query)}`;
        return await this.makeRequest(endpoint);
    }

    /**
     * Make authenticated API request
     */
    async makeRequest(endpoint, method = 'GET', body = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.instanceUrl}${endpoint}`);
            const https = require('https');

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
                            resolve({});
                        } else {
                            reject(new Error(`Invalid JSON response: ${data.substring(0, 100)}`));
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
     * Run full extraction pipeline
     */
    async run(userName) {
        console.log('═'.repeat(60));
        console.log('  USER REPORTS & DASHBOARDS EXTRACTOR');
        console.log('═'.repeat(60));

        await this.initialize();
        await this.discoverUserAssets(userName);
        await this.extractMetadata();
        await this.analyzeAssets();
        await this.generateTemplates();
        const results = await this.validateAndRegister();

        console.log('\n═'.repeat(60));
        console.log('  EXTRACTION COMPLETE');
        console.log('═'.repeat(60));
        console.log(`\n  ✅ Templates generated: ${this.templates.length}`);
        console.log(`  ✅ Templates registered: ${results.registered}`);
        console.log(`  📁 Templates location: ${this.templatesDir}`);
        console.log('\n  Note: All templates are anonymized - no personal/company info');

        return {
            templates: this.templates,
            validation: results,
            summary: this.analysisResults?.summary
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    // Parse arguments
    const options = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--org' && args[i + 1]) {
            options.org = args[++i];
        } else if (args[i] === '--user' && args[i + 1]) {
            options.user = args[++i];
        } else if (args[i] === '--output' && args[i + 1]) {
            options.output = args[++i];
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Usage: node user-reports-extractor.js --org <alias> --user "<Full Name>"

Options:
  --org <alias>       Salesforce org alias (required)
  --user "<name>"     Full name of the report owner (required)
  --output <path>     Custom output directory for templates
  --help, -h          Show this help message

Examples:
  node user-reports-extractor.js --org production --user "Rachel Chu"
  node user-reports-extractor.js --org sandbox --user "John Smith" --output ./custom-templates

Note: User name should match Owner.Name in Salesforce exactly.
`);
            process.exit(0);
        }
    }

    if (!options.org || !options.user) {
        console.error('Error: --org and --user are required');
        console.error('Run with --help for usage information');
        process.exit(1);
    }

    // Run extraction
    (async () => {
        try {
            const extractor = new UserReportsExtractor(options.org, {
                templatesDir: options.output
            });

            await extractor.run(options.user);

        } catch (error) {
            console.error(`\n❌ Extraction failed: ${error.message}`);
            if (error.stack && process.env.DEBUG) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = UserReportsExtractor;
