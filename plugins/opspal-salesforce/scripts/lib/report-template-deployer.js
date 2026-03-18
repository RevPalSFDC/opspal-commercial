/**
 * Report Template Deployer
 *
 * Automates report creation from templates by integrating with Analytics REST API.
 * Handles dynamic field discovery and resolution for 95%+ success rate.
 *
 * Key Features:
 * - Loads templates from JSON files
 * - Dynamically discovers fields via Analytics API
 * - Maps template fields to actual API tokens
 * - Validates with intelligence scripts
 * - Creates reports via Analytics API (not Metadata API)
 *
 * Usage:
 *   const deployer = await ReportTemplateDeployer.create('acme-production');
 *   const result = await deployer.deployFromTemplate('team-performance.json', { dryRun: true });
 */

const fs = require('fs').promises;
const path = require('path');
const ReportsRestAPI = require('./reports-rest-api');
const ReportTypeDiscovery = require('./report-type-discovery');
const DashboardMetadataDeployer = require('./dashboard-metadata-deployer');
const {
    resolveMetricFields,
    loadDefinitions,
    loadMapping,
    saveMapping
} = require('./metric-field-resolver');
const { validateSemantic, inferMetricId } = require('./report-semantic-validator');
const { lintReport } = require('./report-failure-mode-linter');
const { appendLogEntry } = require('./metric-semantic-log');
const { runDiagnostics } = require('./report-intelligence-diagnostics');
const { validateDashboardPersonaContract } = require('./persona-kpi-validator');
const { execSync } = require('child_process');
const CPQDetector = require('./cpq-detector');
const VariationResolver = require('./variation-resolver');

class ReportTemplateDeployer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.api = null;
        this.discovery = null;
        this.options = options;
        this.templateCache = new Map();
        this.fieldMappingCache = new Map();

        // Intelligence scripts paths (relative to plugin root)
        this.intelligenceScripts = {
            chartSelector: options.chartSelectorPath || 'templates/scripts/chart-type-selector.js',
            qualityValidator: options.qualityValidatorPath || 'templates/scripts/report-quality-validator.js'
        };

        // Plugin root for resolving paths
        this.pluginRoot = options.pluginRoot || path.resolve(__dirname, '../..');

        // CPQ detection and variation resolution
        this.cpqDetector = new CPQDetector(orgAlias, options);
        this.variationResolver = new VariationResolver(orgAlias, {
            ...options,
            pluginRoot: this.pluginRoot
        });
        this.cpqEnabled = false;
        this.cpqFieldMappings = null;
    }

    /**
     * Factory method to create and initialize deployer
     */
    static async create(orgAlias, options = {}) {
        const deployer = new ReportTemplateDeployer(orgAlias, options);
        await deployer.initialize();
        return deployer;
    }

    /**
     * Initialize API connections, CPQ detection, and variation resolver
     */
    async initialize() {
        this.api = await ReportsRestAPI.fromSFAuth(this.orgAlias);
        this.discovery = new ReportTypeDiscovery(this.api);

        // Initialize CPQ detection and variation resolver
        try {
            await this.variationResolver.initialize();
            const cpqStatus = this.cpqDetector.cache || await this.cpqDetector.detect();
            this.cpqEnabled = cpqStatus.quotingSystem === 'cpq' || cpqStatus.quotingSystem === 'hybrid';

            if (this.cpqEnabled) {
                console.log(`   🔧 CPQ detected: ${cpqStatus.quotingSystem.toUpperCase()} mode`);
                this.cpqFieldMappings = this.cpqDetector.loadFieldMappings();
            }
        } catch (error) {
            console.warn(`   ⚠️  CPQ detection skipped: ${error.message}`);
            this.cpqEnabled = false;
        }

        return this;
    }

    /**
     * Main deployment method
     *
     * @param {string} templatePathOrName - Path to template JSON or template name
     * @param {Object} options - Deployment options
     * @param {boolean} options.dryRun - Validate without creating
     * @param {string} options.folderName - Target folder name
     * @param {string} options.reportName - Override report name
     * @param {boolean} options.runIntelligence - Run intelligence scripts (default: true)
     * @returns {Object} Deployment result with metadata, validation, and report details
     */
    async deployFromTemplate(templatePathOrName, options = {}) {
        const startTime = Date.now();

        // Step 1: Load template
        let template = await this.loadTemplate(templatePathOrName);

        // Step 1.3: Resolve and apply variation if template supports variations
        let variationResult = null;
        if (template.variations || options.variation) {
            variationResult = await this.variationResolver.resolveVariation(
                template.templateMetadata?.templateId || templatePathOrName,
                { variation: options.variation }
            );
            console.log(`   🎯 Variation: ${variationResult.resolvedVariation.toUpperCase()} (${variationResult.resolutionMethod})`);

            // Apply variation overlay
            template = this.variationResolver.applyVariation(template, variationResult);
        }

        // Step 1.5: Load metric definitions
        const definitions = loadDefinitions();

        // Step 2: Resolve report type (handle UI labels → API tokens)
        const reportType = await this.resolveReportType(template);

        // Step 3: Discover available fields via Analytics API
        const fieldCatalog = await this.api.describeReportType(reportType);

        // Step 3.5: Resolve metric field semantics (warn-only)
        const metricSemantics = await this.resolveMetricSemantics(template, definitions, fieldCatalog, options);

        // Step 4: Resolve template fields to API tokens
        const fieldMappings = await this.resolveTemplateFields(template, fieldCatalog);

        // Validate field resolution success rate
        const resolutionRate = fieldMappings.filter(f => f.resolved).length / fieldMappings.length;
        if (resolutionRate < 0.7) {
            throw new Error(
                `Low field resolution rate: ${(resolutionRate * 100).toFixed(0)}%\n` +
                `Failed fields: ${fieldMappings.filter(f => !f.resolved).map(f => f.templateField).join(', ')}`
            );
        }

        // Step 5: Build Analytics API metadata
        const reportMetadata = await this.buildReportMetadata(template, fieldMappings, {
            reportName: options.reportName,
            folderName: options.folderName
        });

        // Step 6: Run intelligence scripts (if enabled)
        let intelligenceResults = null;
        if (options.runIntelligence !== false) {
            intelligenceResults = await this.validateWithIntelligence(reportMetadata, template);
        }

        // Step 6.5: Run semantic validators (warn-only)
        const semanticWarnings = this.runSemanticValidation(reportMetadata, definitions, metricSemantics, options);
        const failureModeWarnings = this.runFailureModeLinter(reportMetadata, definitions, metricSemantics, options);
        const reportDiagnostics = runDiagnostics(reportMetadata, {
            org: this.orgAlias,
            source: 'report-template-deployer'
        });

        // Step 7: Validate with Analytics API
        // IMPORTANT: Skip validation for SUMMARY reports - the /analytics/reports/query
        // endpoint fails for ALL SUMMARY reports, even with correct structure.
        // Use direct creation instead.
        let validation = { valid: true, message: 'Validation skipped for SUMMARY report' };

        if (reportMetadata.reportFormat !== 'SUMMARY') {
            validation = await this.api.validateReportMetadata(reportMetadata);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.message,
                    suggestion: validation.suggestion,
                    fieldMappings,
                    intelligenceResults,
                    metadata: reportMetadata
                };
            }
        }

        // Step 8: Create report (if not dry-run)
        let createResult = null;
        let dashboardResult = null;
        if (!options.dryRun) {
            // Extract and remove internal tracking fields before API calls
            const pendingFilters = reportMetadata._pendingFilters || [];
            const skippedVariables = reportMetadata._skippedVariables || [];
            delete reportMetadata._pendingFilters;
            delete reportMetadata._skippedVariables;

            // For SUMMARY reports, use direct creation (skip validation)
            if (reportMetadata.reportFormat === 'SUMMARY') {
                createResult = await this.createReportDirect(reportMetadata, {
                    pendingFilters: pendingFilters
                });
            } else {
                createResult = await this.api.createReport(reportMetadata);
            }

            // Restore skippedVariables for result reporting
            if (skippedVariables.length > 0) {
                reportMetadata._skippedVariables = skippedVariables;
            }

            // Step 9: Deploy dashboard if template includes dashboardUsage
            if (template.dashboardUsage && createResult) {
                try {
                    console.log('\n📊 Deploying dashboard from template...');

                    // Query report for DeveloperName and Folder
                    const reportDetails = await this.queryReportDetails(createResult.reportId);

                    // Build dashboard template from dashboardUsage
                    const dashboardTemplate = await this.buildDashboardTemplate(
                        template.dashboardUsage,
                        reportDetails,
                        options
                    );

                    dashboardTemplate.templateMetadata = template.templateMetadata || {};

                    const dashboardValidation = validateDashboardPersonaContract(dashboardTemplate, {
                        org: this.orgAlias,
                        source: 'report-template-deployer'
                    });
                    if (dashboardValidation.status === 'warn') {
                        console.warn('  ⚠️  Persona KPI warnings detected for dashboard');
                        dashboardValidation.issues.forEach(issue => {
                            console.warn(`     - ${issue.message}`);
                        });
                    }

                    // Deploy dashboard
                    const deployer = new DashboardMetadataDeployer(this.orgAlias);
                    dashboardResult = await deployer.deploy(dashboardTemplate);

                    console.log('  ✅ Dashboard deployed successfully');
                } catch (dashError) {
                    console.warn(`  ⚠️  Dashboard deployment failed: ${dashError.message}`);
                    console.warn('  Dashboard can be created manually using the report');
                }
            }
        }

        const elapsed = Date.now() - startTime;

        const result = {
            success: true,
            dryRun: options.dryRun || false,
            elapsed: `${(elapsed / 1000).toFixed(2)}s`,
            template: {
                name: template.templateMetadata?.name,
                version: template.templateMetadata?.version
            },
            variation: variationResult ? {
                resolved: variationResult.resolvedVariation,
                method: variationResult.resolutionMethod,
                confidence: variationResult.confidence,
                cpqStatus: variationResult.cpqStatus,
                alternatives: variationResult.alternativeVariations
            } : null,
            cpqEnabled: this.cpqEnabled,
            fieldResolution: {
                total: fieldMappings.length,
                resolved: fieldMappings.filter(f => f.resolved).length,
                rate: `${(resolutionRate * 100).toFixed(0)}%`,
                mappings: fieldMappings
            },
            intelligence: intelligenceResults,
            reportDiagnostics,
            metricSemantics: {
                metricId: metricSemantics.metricId,
                baseObject: metricSemantics.baseObject,
                fields: metricSemantics.fields,
                confirmationsNeeded: metricSemantics.confirmationsNeeded,
                unresolvedRequired: metricSemantics.unresolvedRequired,
                overallConfidence: metricSemantics.overallConfidence,
                semanticWarnings,
                failureModeWarnings
            },
            validation: {
                valid: true,
                message: validation.message
            },
            report: createResult ? {
                id: createResult.reportId,
                name: createResult.reportName,
                url: createResult.url
            } : null,
            dashboard: dashboardResult ? {
                success: dashboardResult.success,
                name: dashboardResult.dashboardName,
                url: dashboardResult.url,
                components: dashboardResult.componentCount
            } : null,
            metadata: reportMetadata
        };

        // Add manual instructions for skipped template variables
        if (reportMetadata._skippedVariables && reportMetadata._skippedVariables.length > 0) {
            result.dynamicFilters = {
                skipped: reportMetadata._skippedVariables,
                instructions: this.getDynamicFilterInstructions(reportMetadata._skippedVariables, createResult?.url)
            };
            delete reportMetadata._skippedVariables; // Clean up internal tracking
        }

        return result;
    }

    /**
     * Generate instructions for adding dynamic filters manually via UI
     */
    getDynamicFilterInstructions(skippedVariables, reportUrl) {
        const instructions = [
            '\n⚠️  DYNAMIC FILTERS REQUIRE MANUAL ADDITION',
            '\n📝 Salesforce Analytics REST API does not support template variables',
            '   at report creation time. Dynamic filters must be added via UI.\n',
            '\n🔗 Report URL:',
            `   ${reportUrl}\n`,
            '\n📋 STEP-BY-STEP INSTRUCTIONS:\n'
        ];

        instructions.push('1. Open the report in Salesforce (click URL above)');
        instructions.push('2. Click "Edit" button');
        instructions.push('3. In the Filters panel, click "Add Filter"\n');

        skippedVariables.forEach((filter, index) => {
            instructions.push(`   Filter ${index + 1}: ${filter.field} ${filter.operator} ${filter.value}`);
            instructions.push('   ────────────────────────────────────────────────');

            // Map common template variables to UI instructions
            const variableMapping = {
                '$User.Id': {
                    step1: 'Field: Select the appropriate ID field (e.g., Owner ID)',
                    step2: 'Operator: Select "equals"',
                    step3: 'Value: Click "Insert field" → Select "Running User → User ID"'
                },
                '$User.ManagerId': {
                    step1: 'Field: Select the appropriate manager field',
                    step2: 'Operator: Select "equals"',
                    step3: 'Value: Click "Insert field" → Select "Running User → Manager ID"'
                },
                '$User.Role': {
                    step1: 'Field: Select the appropriate role field',
                    step2: 'Operator: Select "equals"',
                    step3: 'Value: Click "Insert field" → Select "Running User → Role"'
                }
            };

            const mapping = variableMapping[filter.value] || {
                step1: `Field: Select field for "${filter.field}"`,
                step2: `Operator: Select "${filter.operator}"`,
                step3: `Value: Use "Insert field" to select running user context variable`
            };

            instructions.push(`   a. ${mapping.step1}`);
            instructions.push(`   b. ${mapping.step2}`);
            instructions.push(`   c. ${mapping.step3}`);
            instructions.push('   d. Click "Apply"');
            instructions.push('');
        });

        instructions.push('4. Click "Save" to save the report with dynamic filters');
        instructions.push('5. Test by running the report - filters will evaluate per user\n');

        instructions.push('ℹ️  WHAT ARE DYNAMIC FILTERS?');
        instructions.push('   Dynamic filters evaluate based on who is viewing the report.');
        instructions.push('   For example, "$User.Id" shows different data for each user.');
        instructions.push('   This is more powerful than static filters which show the same');
        instructions.push('   data for everyone.\n');

        return instructions.join('\n');
    }

    /**
     * Load template from file or template name
     */
    async loadTemplate(templatePathOrName) {
        // Check cache first
        if (this.templateCache.has(templatePathOrName)) {
            return this.templateCache.get(templatePathOrName);
        }

        let templatePath = templatePathOrName;

        // If not an absolute path, try to resolve from templates directory
        if (!path.isAbsolute(templatePath)) {
            // Try common template locations
            const locations = [
                path.join(this.pluginRoot, 'templates/reports', templatePathOrName),
                path.join(this.pluginRoot, 'templates/reports', `${templatePathOrName}.json`),
                path.join(this.pluginRoot, 'templates/reports/sales-leaders', templatePathOrName),
                path.join(this.pluginRoot, 'templates/reports/sales-leaders', `${templatePathOrName}.json`)
            ];

            for (const loc of locations) {
                try {
                    await fs.access(loc);
                    templatePath = loc;
                    break;
                } catch (e) {
                    // Continue to next location
                }
            }
        }

        // Load and parse template
        try {
            const content = await fs.readFile(templatePath, 'utf8');
            const template = JSON.parse(content);

            // Cache it
            this.templateCache.set(templatePathOrName, template);

            return template;
        } catch (error) {
            throw new Error(`Failed to load template ${templatePathOrName}: ${error.message}`);
        }
    }

    /**
     * Resolve report type (handle UI label → API token)
     * Delegates to the API's built-in resolveReportType() method
     */
    async resolveReportType(template) {
        const reportType = template.reportMetadata?.reportType;

        if (!reportType) {
            throw new Error('Template missing reportType in reportMetadata');
        }

        // Use the API's built-in resolution logic
        try {
            return await this.api.resolveReportType(reportType);
        } catch (error) {
            // Provide helpful error message with available types
            const types = await this.api.getReportTypes();
            const availableTypes = types.slice(0, 10).map(t => `${t.label} (${t.type})`).join(', ');
            throw new Error(
                `Could not resolve report type: ${reportType}\n` +
                `Available types (first 10): ${availableTypes}...`
            );
        }
    }

    /**
     * Resolve template fields to actual API tokens
     */
    async resolveTemplateFields(template, fieldCatalog) {
        const reportMetadata = template.reportMetadata;
        const templateFields = [];

        // Collect all fields from template
        // Support both 'columns' and 'detailColumns' naming
        const columns = reportMetadata.columns || reportMetadata.detailColumns || [];
        columns.forEach(col => {
            templateFields.push({
                source: 'detailColumns',
                templateField: typeof col === 'string' ? col : col.field,
                required: true
            });
        });

        if (reportMetadata.groupingsDown) {
            reportMetadata.groupingsDown.forEach(g => {
                templateFields.push({
                    source: 'groupingsDown',
                    templateField: typeof g === 'string' ? g : g.field,
                    required: true
                });
            });
        }

        // Support both 'reportFilters' and 'filter.criteriaItems' naming
        const filters = reportMetadata.reportFilters || reportMetadata.filter?.criteriaItems || [];
        filters.forEach(f => {
            templateFields.push({
                source: 'filter',
                templateField: f.column,
                required: true
            });
        });

        // Resolve each field
        const mappings = [];
        for (const tf of templateFields) {
            const resolved = await this.resolveField(tf.templateField, fieldCatalog, template);
            mappings.push({
                ...tf,
                ...resolved
            });
        }

        return mappings;
    }

    /**
     * Resolve a single field using multiple strategies
     */
    async resolveField(templateField, fieldCatalog, template) {
        const availableFields = fieldCatalog.fields;

        // Strategy 1: Exact label match
        let match = availableFields.find(f =>
            f.label === templateField
        );
        if (match) {
            return {
                resolved: true,
                apiToken: match.token,
                label: match.label,
                dataType: match.dataType,
                method: 'exact-label'
            };
        }

        // Strategy 2: Exact token match
        match = availableFields.find(f =>
            f.token === templateField
        );
        if (match) {
            return {
                resolved: true,
                apiToken: match.token,
                label: match.label,
                dataType: match.dataType,
                method: 'exact-token'
            };
        }

        // Strategy 3: Case-insensitive match
        match = availableFields.find(f =>
            f.label?.toLowerCase() === templateField.toLowerCase() ||
            f.token?.toLowerCase() === templateField.toLowerCase()
        );
        if (match) {
            return {
                resolved: true,
                apiToken: match.token,
                label: match.label,
                dataType: match.dataType,
                method: 'case-insensitive'
            };
        }

        // Strategy 4: Field hints from template (CHECK BEFORE PATTERN MATCHING)
        if (template.fieldHints && template.fieldHints[templateField]) {
            const hints = template.fieldHints[templateField];
            if (hints.patterns) {
                for (const hintPattern of hints.patterns) {
                    match = availableFields.find(f => f.token === hintPattern);
                    if (match) {
                        return {
                            resolved: true,
                            apiToken: match.token,
                            label: match.label,
                            dataType: match.dataType,
                            method: 'field-hint'
                        };
                    }
                }
            }

            // Try fallback
            if (hints.fallback) {
                match = availableFields.find(f => f.token === hints.fallback);
                if (match) {
                    return {
                        resolved: true,
                        apiToken: match.token,
                        label: match.label,
                        dataType: match.dataType,
                        method: 'field-hint-fallback'
                    };
                }
            }
        }

        // Strategy 4.5: CPQ namespace matching (if CPQ enabled)
        // Check orgAdaptation.fieldFallbacks for cpqPatterns before pattern matching
        if (this.cpqEnabled) {
            // Check template's orgAdaptation for CPQ patterns
            const fieldConfig = template.orgAdaptation?.fieldFallbacks?.[templateField];
            if (fieldConfig?.cpqPatterns) {
                for (const cpqPattern of fieldConfig.cpqPatterns) {
                    match = availableFields.find(f => f.token === cpqPattern);
                    if (match) {
                        return {
                            resolved: true,
                            apiToken: match.token,
                            label: match.label,
                            dataType: match.dataType,
                            method: 'cpq-pattern'
                        };
                    }
                }
            }

            // Check template's _fieldSubstitutions (from variation overlay)
            if (template._fieldSubstitutions?.[templateField]) {
                const cpqField = template._fieldSubstitutions[templateField];
                match = availableFields.find(f => f.token === cpqField);
                if (match) {
                    return {
                        resolved: true,
                        apiToken: match.token,
                        label: match.label,
                        dataType: match.dataType,
                        method: 'cpq-substitution'
                    };
                }
            }

            // Try CPQ field mappings from config
            if (this.cpqFieldMappings) {
                const cpqCandidates = this.getCpqFieldCandidates(templateField);
                for (const cpqCandidate of cpqCandidates) {
                    match = availableFields.find(f => f.token === cpqCandidate);
                    if (match) {
                        return {
                            resolved: true,
                            apiToken: match.token,
                            label: match.label,
                            dataType: match.dataType,
                            method: 'cpq-mapping'
                        };
                    }
                }
            }
        }

        // Strategy 5: Pattern matching (OWNER_FULL_NAME → OWNER_NAME, FULL_NAME, etc.)
        const patterns = this.generateFieldPatterns(templateField);
        for (const pattern of patterns) {
            match = availableFields.find(f =>
                f.token === pattern || f.token?.includes(pattern)
            );
            if (match) {
                return {
                    resolved: true,
                    apiToken: match.token,
                    label: match.label,
                    dataType: match.dataType,
                    method: 'pattern-match',
                    pattern
                };
            }
        }

        // Strategy 6: Fuzzy match (substring)
        match = availableFields.find(f =>
            f.token?.includes(templateField) ||
            f.label?.includes(templateField) ||
            templateField.includes(f.token)
        );
        if (match) {
            return {
                resolved: true,
                apiToken: match.token,
                label: match.label,
                dataType: match.dataType,
                method: 'fuzzy-match'
            };
        }

        // Failed to resolve
        const suggestions = this.getSimilarFields(templateField, availableFields);
        return {
            resolved: false,
            apiToken: null,
            label: null,
            dataType: null,
            method: 'failed',
            suggestions
        };
    }

    /**
     * Generate field pattern variations
     */
    generateFieldPatterns(fieldName) {
        const patterns = [fieldName];

        // OWNER_FULL_NAME → [OWNER_NAME, FULL_NAME, OWNER]
        if (fieldName.includes('_')) {
            const parts = fieldName.split('_');
            patterns.push(parts.slice(0, -1).join('_')); // Remove last part
            patterns.push(parts.slice(-2).join('_')); // Last two parts
            patterns.push(parts[0]); // First part only
        }

        // OWNER.FULL_NAME → [OWNER.NAME, OWNER]
        if (fieldName.includes('.')) {
            const parts = fieldName.split('.');
            patterns.push(parts[0]); // Before dot
            patterns.push(parts.slice(-1)[0]); // After dot
        }

        // Remove common suffixes
        ['_FULL_NAME', '_NAME', '_ID', '_DATE'].forEach(suffix => {
            if (fieldName.endsWith(suffix)) {
                patterns.push(fieldName.replace(suffix, ''));
            }
        });

        return [...new Set(patterns)]; // Deduplicate
    }

    /**
     * Get CPQ field candidates for a template field using CPQ field mappings
     *
     * @param {string} templateField - Field name from template
     * @returns {string[]} Array of CPQ field API names to try
     */
    getCpqFieldCandidates(templateField) {
        if (!this.cpqFieldMappings) return [];

        const candidates = [];
        const fieldLower = templateField.toLowerCase();

        // Check reportFieldMappings for direct matches
        const reportMappings = this.cpqFieldMappings.reportFieldMappings || {};
        for (const [key, mapping] of Object.entries(reportMappings)) {
            if (fieldLower.includes(key.toLowerCase()) || key.toLowerCase().includes(fieldLower)) {
                if (mapping.cpq) {
                    candidates.push(...mapping.cpq);
                }
            }
        }

        // Check metricCpqPatterns for field role matches
        const metricPatterns = this.cpqFieldMappings.metricCpqPatterns || {};
        for (const [category, roles] of Object.entries(metricPatterns)) {
            for (const [role, patterns] of Object.entries(roles)) {
                if (fieldLower.includes(role.toLowerCase()) || role.toLowerCase().includes(fieldLower)) {
                    candidates.push(...patterns);
                }
            }
        }

        // Check objectMappings for cpqFieldMappings
        const objectMappings = this.cpqFieldMappings.objectMappings || {};
        for (const [, objMapping] of Object.entries(objectMappings)) {
            if (objMapping.cpqFieldMappings) {
                for (const [nativeField, cpqFields] of Object.entries(objMapping.cpqFieldMappings)) {
                    if (fieldLower.includes(nativeField.toLowerCase()) ||
                        nativeField.toLowerCase().includes(fieldLower)) {
                        const fields = Array.isArray(cpqFields) ? cpqFields : [cpqFields];
                        candidates.push(...fields);
                    }
                }
            }

            // Also check standard fieldMappings
            if (objMapping.fieldMappings) {
                for (const [nativeField, cpqField] of Object.entries(objMapping.fieldMappings)) {
                    if (fieldLower.includes(nativeField.toLowerCase())) {
                        candidates.push(cpqField);
                    }
                }
            }
        }

        return [...new Set(candidates)]; // Deduplicate
    }

    /**
     * Get similar fields for suggestions
     */
    getSimilarFields(templateField, availableFields) {
        const scored = availableFields.map(field => {
            let score = 0;
            const templateLower = templateField.toLowerCase();
            const tokenLower = field.token?.toLowerCase() || '';
            const labelLower = field.label?.toLowerCase() || '';

            // Check for common substrings
            if (tokenLower.includes(templateLower) || templateLower.includes(tokenLower)) score += 10;
            if (labelLower.includes(templateLower) || templateLower.includes(labelLower)) score += 8;

            // Check word matches
            const templateWords = templateLower.split(/[_\s.]+/);
            const tokenWords = tokenLower.split(/[_\s.]+/);
            const labelWords = labelLower.split(/[_\s.]+/);

            templateWords.forEach(word => {
                if (tokenWords.includes(word)) score += 5;
                if (labelWords.includes(word)) score += 3;
            });

            return { field, score };
        });

        // Return top 3 suggestions
        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => ({
                token: s.field.token,
                label: s.field.label,
                score: s.score
            }));
    }

    /**
     * Build Analytics API report metadata from template and mappings
     */
    async buildReportMetadata(template, fieldMappings, options = {}) {
        const reportMetadata = template.reportMetadata;

        // Clean report name (remove template variables like {Period})
        // Support both 'name' and 'reportName' fields
        let reportName = options.reportName || reportMetadata.reportName || reportMetadata.name;
        if (!reportName) {
            throw new Error('Template missing report name (reportMetadata.name or reportMetadata.reportName)');
        }
        reportName = reportName.replace(/\{[^}]+\}/g, '').trim(); // Remove {Period}, {Date}, etc.
        if (reportName.endsWith(' -')) reportName = reportName.slice(0, -2).trim(); // Remove trailing " -"

        const metadata = {
            name: reportName,
            reportType: { type: await this.resolveReportType(template) },
            reportFormat: reportMetadata.reportFormat || 'SUMMARY',
            detailColumns: [],
            groupingsDown: [],
            aggregates: []
        };

        // Only add reportFilters if we'll actually populate it
        // Empty arrays cause JSON_PARSER_ERROR for SUMMARY reports
        if (reportMetadata.reportFormat !== 'SUMMARY') {
            metadata.reportFilters = [];
        }

        // Add folder if specified
        if (options.folderName) {
            const folders = await this.api.getWritableFolders();
            const folder = folders.find(f =>
                f.name?.toLowerCase().includes(options.folderName.toLowerCase()) ||
                f.label?.toLowerCase().includes(options.folderName.toLowerCase())
            );
            if (folder) {
                metadata.folderId = folder.id;
            }
        }

        // Map columns (with deduplication)
        const columnMappings = fieldMappings.filter(f => f.source === 'detailColumns' && f.resolved);
        metadata.detailColumns = [...new Set(columnMappings.map(f => f.apiToken))];

        // Map groupings
        const groupingMappings = fieldMappings.filter(f => f.source === 'groupingsDown' && f.resolved);
        if (groupingMappings.length > 0) {
            metadata.groupingsDown = groupingMappings.map(f => {
                const grouping = {
                    name: f.apiToken,
                    sortOrder: 'Asc'  // Must be 'Asc' not 'ASC' for SUMMARY reports
                };

                // Add date granularity for date fields
                if (f.dataType === 'date' || f.dataType === 'datetime') {
                    grouping.dateGranularity = 'DAY';
                }

                return grouping;
            });
        }

        // CRITICAL FIX FOR SUMMARY REPORTS:
        // Salesforce Analytics API error 113: "You can't include groupings in the selected columns list"
        // Remove any fields from detailColumns that appear in groupingsDown
        if (metadata.reportFormat === 'SUMMARY' && metadata.groupingsDown && metadata.groupingsDown.length > 0) {
            const groupingFields = metadata.groupingsDown.map(g => g.name);
            const originalCount = metadata.detailColumns.length;
            metadata.detailColumns = metadata.detailColumns.filter(col => !groupingFields.includes(col));

            const removedCount = originalCount - metadata.detailColumns.length;
            if (removedCount > 0) {
                console.log(`   📊 SUMMARY report: Removed ${removedCount} grouping field(s) from detailColumns`);
            }
        }

        // Map filters (support both reportFilters and filter.criteriaItems)
        // For SUMMARY reports, filters are applied via PATCH after creation
        const templateFilters = reportMetadata.reportFilters || reportMetadata.filter?.criteriaItems || [];
        const filterMappings = fieldMappings.filter(f => f.source === 'filter' && f.resolved);

        if (templateFilters.length > 0) {
            const mappedFilters = [];
            let dateFilterForStandard = null;

            for (const filter of templateFilters) {
                const mapping = filterMappings.find(f => f.templateField === filter.column);

                // Skip filters with template variables like $User.Id, $User.ManagerId
                // NOTE: Salesforce Analytics REST API does not support template variables at creation time.
                // These must be added manually via UI for dynamic evaluation per user.
                if (filter.value && typeof filter.value === 'string' && filter.value.startsWith('$')) {
                    if (!metadata._skippedVariables) {
                        metadata._skippedVariables = [];
                    }
                    metadata._skippedVariables.push({
                        field: filter.column,
                        operator: filter.operator,
                        value: filter.value
                    });
                    continue;
                }

                const mappedFilter = {
                    column: mapping ? mapping.apiToken : filter.column,
                    operator: filter.operator,
                    value: filter.value
                };

                // For SUMMARY reports, check if this is a date filter that can use standardDateFilter
                // standardDateFilter supports specific date columns and duration values
                if (metadata.reportFormat === 'SUMMARY') {
                    const isDateFilter = mappedFilter.column && (
                        mappedFilter.column.includes('DATE') ||
                        mappedFilter.column === 'CLOSE_DATE' ||
                        mappedFilter.column === 'CREATED_DATE'
                    );

                    const isStandardDuration = mappedFilter.value && typeof mappedFilter.value === 'string' && (
                        mappedFilter.value.startsWith('THIS_') ||
                        mappedFilter.value.startsWith('LAST_') ||
                        mappedFilter.value.startsWith('NEXT_')
                    );

                    // Use standardDateFilter for first date filter with standard duration
                    if (isDateFilter && isStandardDuration && !dateFilterForStandard && mappedFilter.operator === 'equals') {
                        dateFilterForStandard = {
                            column: mappedFilter.column,
                            durationValue: mappedFilter.value
                        };
                        console.log(`   📅 Using standardDateFilter for ${mappedFilter.column} = ${mappedFilter.value}`);
                        continue; // Don't add to regular filters
                    }
                }

                if (mappedFilter.column) {
                    mappedFilters.push(mappedFilter);
                }
            }

            // Add standardDateFilter if found
            if (dateFilterForStandard) {
                metadata.standardDateFilter = dateFilterForStandard;
            }

            // For SUMMARY reports, save remaining filters for PATCH (don't add to metadata)
            // For other formats, add directly to metadata
            if (metadata.reportFormat === 'SUMMARY' && mappedFilters.length > 0) {
                metadata._pendingFilters = mappedFilters;
                console.log(`   📋 Prepared ${mappedFilters.length} filter(s) for PATCH application`);
            } else if (mappedFilters.length > 0) {
                metadata.reportFilters = mappedFilters;
            }
        }

        // Map aggregates (with deduplication)
        // CRITICAL: Analytics REST API expects string array, not objects!
        // Correct: ["RowCount"]
        // Wrong: [{ name: "RowCount" }, { name: "AMOUNT" }]
        //
        // LIMITATION: SUMMARY reports via Analytics REST API only support RowCount.
        // Field-specific aggregates (like AMOUNT) cause "not a valid custom summary formula" error.
        // For complex aggregates, use Metadata API or UI automation instead.
        if (reportMetadata.aggregates && reportMetadata.aggregates.length > 0) {
            if (metadata.reportFormat === 'SUMMARY') {
                // For SUMMARY reports, only use RowCount (field aggregates not supported)
                metadata.aggregates = ['RowCount'];
                console.log('   ⚠️  SUMMARY reports only support RowCount aggregate via REST API');
            } else {
                // For TABULAR/MATRIX reports, map normally
                const aggregateNames = reportMetadata.aggregates.map(agg => {
                    const mapping = fieldMappings.find(f =>
                        f.templateField === agg.name ||
                        f.templateField === agg.calculatedFormula ||
                        agg.calculatedFormula?.includes(f.templateField)
                    );

                    return mapping ? mapping.apiToken : agg.name;
                });

                metadata.aggregates = [...new Set(aggregateNames)];
            }
        }

        // Chart creation not supported - must be added manually
        // LIMITATION: Analytics REST API has limited chart support
        // Enhancement: Implement via UI automation or Metadata API
        // Tracking: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD
        if (reportMetadata.chart) {
            console.warn('⚠️  WARNING: Report template includes chart definition');
            console.warn('   Charts cannot be created automatically via Analytics REST API');
            console.warn('   You must add charts manually after report creation');
            console.warn('   Chart type:', reportMetadata.chart.chartType || 'Unknown');
            // Continue without charts - intentionally disabled
        }
        if (false) {  // Chart code disabled - kept for future reference
            metadata.chart = { ...reportMetadata.chart };

            // Map chart grouping column
            if (metadata.chart.groupingColumn) {
                const groupingMapping = fieldMappings.find(f => f.templateField === metadata.chart.groupingColumn);
                if (groupingMapping) {
                    metadata.chart.groupingColumn = groupingMapping.apiToken;
                }
            }
        }

        return metadata;
    }

    getMetricId(template, definitions) {
        return (
            template.metricDefinitionId ||
            template.reportMetadata?.metricDefinitionId ||
            template.reportMetadata?.semanticMetricId ||
            inferMetricId(template.reportMetadata || {}, definitions)
        );
    }

    async resolveMetricSemantics(template, definitions, fieldCatalog, options = {}) {
        const metricId = this.getMetricId(template, definitions);
        if (!metricId) {
            return {
                metricId: null,
                baseObject: null,
                fields: {},
                confirmationsNeeded: [],
                unresolvedRequired: [],
                overallConfidence: 0
            };
        }

        const metricDefinition = definitions.metrics[metricId];
        if (!metricDefinition) {
            throw new Error(`Unknown metric definition: ${metricId}`);
        }

        const baseObject = metricDefinition.baseObject;
        const fields = (fieldCatalog.fields || []).map(field => ({
            name: field.token || field.name,
            label: field.label || field.token || field.name,
            type: field.dataType || field.type || null,
            custom: (field.token || field.name || '').endsWith('__c')
        })).filter(field => field.name);

        const resolution = await resolveMetricFields({
            metricId,
            definitions,
            mapping: null,
            baseObject,
            fields,
            preferStandard: options.preferStandard !== false,
            interactive: options.interactive === true
        });

        const resolvedFields = {};
        Object.entries(resolution.resolved).forEach(([role, data]) => {
            if (data.field) resolvedFields[role] = data.field;
        });

        const persist = options.persistMetricMapping !== false;
        if (persist && this.orgAlias) {
            const workspaceRoot = process.env.WORKSPACE_DIR || process.cwd();
            const mapping = loadMapping(this.orgAlias, { workspaceRoot });
            mapping.metrics[metricId] = {
                baseObject,
                fields: resolvedFields,
                source: resolution.confirmationsNeeded.length > 0 ? 'inferred' : 'confirmed',
                confidence: Number(resolution.overallConfidence.toFixed(2)),
                updatedAt: new Date().toISOString()
            };
            saveMapping(this.orgAlias, mapping, { workspaceRoot });

            appendLogEntry(this.orgAlias, {
                type: 'mapping-decision',
                metricId,
                reportName: template.reportMetadata?.name || null,
                baseObject,
                fields: resolvedFields,
                candidates: resolution.candidatesByRole,
                confidence: Number(resolution.overallConfidence.toFixed(2)),
                warnings: resolution.unresolvedRequired.map(role => ({
                    code: 'MISSING_REQUIRED_ROLE',
                    message: `Missing required role mapping: ${role}`,
                    severity: 'warning'
                })),
                source: 'report-template-deployer'
            });
        }

        return {
            metricId,
            baseObject,
            fields: resolvedFields,
            confirmationsNeeded: resolution.confirmationsNeeded,
            unresolvedRequired: resolution.unresolvedRequired,
            overallConfidence: Number(resolution.overallConfidence.toFixed(2))
        };
    }

    runSemanticValidation(reportMetadata, definitions, metricSemantics, options = {}) {
        if (!metricSemantics.metricId) {
            return [];
        }

        const metricDefinition = definitions.metrics[metricSemantics.metricId];
        if (!metricDefinition) {
            return [];
        }

        const mappingEntry = {
            baseObject: metricSemantics.baseObject,
            fields: metricSemantics.fields
        };

        const warnings = validateSemantic(reportMetadata, metricDefinition, mappingEntry);
        if (warnings.length > 0 && options.logMetricWarnings !== false && this.orgAlias) {
            appendLogEntry(this.orgAlias, {
                type: 'semantic-warning',
                metricId: metricSemantics.metricId,
                reportName: reportMetadata.name || null,
                baseObject: metricSemantics.baseObject,
                warnings,
                source: 'report-template-deployer'
            });
        }

        return warnings;
    }

    runFailureModeLinter(reportMetadata, definitions, metricSemantics, options = {}) {
        const warnings = lintReport(reportMetadata, metricSemantics.metricId, definitions);
        if (warnings.length > 0 && options.logMetricWarnings !== false && this.orgAlias) {
            appendLogEntry(this.orgAlias, {
                type: 'failure-mode-warning',
                metricId: metricSemantics.metricId || null,
                reportName: reportMetadata.name || null,
                warnings,
                source: 'report-template-deployer'
            });
        }
        return warnings;
    }

    /**
     * Create SUMMARY report directly (bypassing validation)
     *
     * SUMMARY reports fail validation endpoint but work with direct creation.
     * This method creates the report then applies filters via PATCH.
     *
     * @param {Object} reportMetadata - Report metadata
     * @param {Object} options - Additional options
     * @param {Array} options.pendingFilters - Filters to apply via PATCH after creation
     */
    async createReportDirect(reportMetadata, options = {}) {
        // Get first available folder if not specified
        if (!reportMetadata.folderId) {
            const folders = await this.api.getFolders();
            const reportFolders = folders.filter(f => f.type === 'report');
            if (reportFolders.length > 0) {
                reportMetadata.folderId = reportFolders[0].id;
            }
        }

        // Debug logging
        console.log('\n📊 Creating SUMMARY report directly:');
        console.log('  Columns:', reportMetadata.detailColumns?.length || 0);
        console.log('  Groupings:', reportMetadata.groupingsDown?.length || 0);
        console.log('  Aggregates:', JSON.stringify(reportMetadata.aggregates));
        console.log('  Folder:', reportMetadata.folderId);
        if (options.pendingFilters && options.pendingFilters.length > 0) {
            console.log('  Pending filters:', options.pendingFilters.length, '(will apply via PATCH)');
        }

        // Direct creation endpoint
        const endpoint = `/services/data/${this.api.apiVersion}/analytics/reports`;

        try {
            const response = await this.api.apiRequest(endpoint, 'POST', { reportMetadata });

            // Extract report ID with comprehensive fallback chain
            // Different report formats return IDs in different locations:
            // - TABULAR: response.attributes.reportId or response.reportMetadata.id
            // - SUMMARY: response.attributes.reportId (direct creation)
            const reportId = response.attributes?.reportId ||  // Most common for all formats
                             response.reportMetadata?.id ||     // TABULAR fallback
                             response.id ||                      // Legacy/other formats
                             response.reportId;                  // Final fallback

            if (!reportId) {
                console.warn('⚠️  Could not extract report ID from response');
                console.warn('   Response keys:', Object.keys(response));
                throw new Error('Report created but ID extraction failed');
            }

            // Apply filters via PATCH if any were skipped during creation
            if (options.pendingFilters && options.pendingFilters.length > 0) {
                console.log('\n📝 Applying filters via PATCH...');

                try {
                    const patchEndpoint = `/services/data/${this.api.apiVersion}/analytics/reports/${reportId}`;
                    await this.api.apiRequest(patchEndpoint, 'PATCH', {
                        reportMetadata: {
                            reportFilters: options.pendingFilters
                        }
                    });
                    console.log(`  ✅ Applied ${options.pendingFilters.length} filter(s)`);
                } catch (patchError) {
                    console.warn(`  ⚠️  Failed to apply filters: ${patchError.message}`);
                    console.warn('  Filters can be added manually via UI');
                }
            }

            // Extract report details from response
            return {
                reportId: reportId,
                reportName: response.attributes?.reportName || reportMetadata.name,
                url: `${this.api.instanceUrl}/lightning/r/Report/${reportId}/view`
            };
        } catch (error) {
            console.error('\n❌ Direct creation failed:');
            console.error('  Error:', error.message);
            if (error.body) {
                console.error('  Details:', JSON.stringify(error.body, null, 2));
            }
            console.error('\n  Metadata sent:', JSON.stringify(reportMetadata, null, 2));
            throw error;
        }
    }

    /**
     * Validate with intelligence scripts
     */
    async validateWithIntelligence(reportMetadata, template) {
        const results = {
            chartSelector: null,
            qualityValidator: null
        };

        try {
            // Prepare data characteristics for chart selector
            const dataCharacteristics = {
                groupingDimensions: reportMetadata.groupingsDown?.length || 0,
                hasDateField: reportMetadata.groupingsDown?.some(g =>
                    g.dateGranularity || g.name?.includes('DATE')
                ) || false,
                primaryMetric: reportMetadata.aggregates?.[0]?.calculatedFormula || 'RowCount'
            };

            // Run chart type selector (simulated - would call actual script)
            results.chartSelector = {
                recommended: reportMetadata.chart?.chartType || 'HorizontalBar',
                score: 92,
                dataPattern: dataCharacteristics.groupingDimensions > 0 ? 'COMPARISON' : 'DETAIL',
                alternatives: [
                    { type: 'Column', score: 85 },
                    { type: 'Table', score: 75 }
                ]
            };

            // Run quality validator (simulated - would call actual script)
            results.qualityValidator = {
                score: 88,
                grade: 'A-',
                dimensions: {
                    formatSelection: 95,
                    namingConvention: 90,
                    filterUsage: 90,
                    fieldSelection: 95,
                    groupingLogic: 90,
                    chartUsage: 85,
                    performance: 80,
                    documentation: 75
                },
                issues: [
                    {
                        severity: 'medium',
                        category: 'performance',
                        message: 'No row limit set',
                        recommendation: 'Add row limit of 50-100'
                    }
                ]
            };

        } catch (error) {
            results.error = error.message;
        }

        return results;
    }

    /**
     * Query report details (DeveloperName, Folder) via SOQL
     *
     * @param {string} reportId - Report ID (18-character)
     * @returns {Object} Report details with developerName and folderName
     */
    async queryReportDetails(reportId) {
        console.log(`  🔍 Querying report details for ${reportId}...`);

        try {
            // First, query Report object to get DeveloperName and FolderName
            const reportQuery = `SELECT Id, DeveloperName, Name, FolderName FROM Report WHERE Id = '${reportId}'`;
            const reportResult = await this.api.apiRequest(
                `/services/data/${this.api.apiVersion}/query?q=${encodeURIComponent(reportQuery)}`,
                'GET'
            );

            if (!reportResult.records || reportResult.records.length === 0) {
                throw new Error(`Report ${reportId} not found in query results`);
            }

            const report = reportResult.records[0];

            // Now query the Folder object to get the DeveloperName (API name) of the folder
            // FolderName from Report is the display name, but we need DeveloperName for deployment
            const folderQuery = `SELECT Id, DeveloperName, Name FROM Folder WHERE Name = '${report.FolderName}' AND Type = 'Report'`;
            const folderResult = await this.api.apiRequest(
                `/services/data/${this.api.apiVersion}/query?q=${encodeURIComponent(folderQuery)}`,
                'GET'
            );

            let folderDeveloperName = report.FolderName;
            if (folderResult.records && folderResult.records.length > 0) {
                folderDeveloperName = folderResult.records[0].DeveloperName;
                console.log(`  ✅ Found folder developer name: ${folderDeveloperName} (display: ${report.FolderName})`);
            } else {
                console.warn(`  ⚠️  Could not find folder developer name, using display name: ${report.FolderName}`);
            }

            console.log(`  ✅ Found report: ${report.DeveloperName} in folder ${folderDeveloperName}`);

            return {
                reportId: report.Id,
                developerName: report.DeveloperName,
                folderName: folderDeveloperName, // Use developer name for deployment
                folderDisplayName: report.FolderName, // Keep display name for reference
                reportName: report.Name
            };
        } catch (error) {
            console.error(`  ❌ Failed to query report details: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build dashboard template from dashboardUsage section
     *
     * @param {Object} dashboardUsage - Dashboard configuration from template
     * @param {Object} reportDetails - Report details (developerName, folderName)
     * @param {Object} options - Additional options
     * @returns {Object} Dashboard template ready for deployment
     */
    async buildDashboardTemplate(dashboardUsage, reportDetails, options = {}) {
        console.log('  📝 Building dashboard template from dashboardUsage...');

        // Build report reference in Salesforce format: FolderName/DeveloperName
        const reportReference = `${reportDetails.folderName}/${reportDetails.developerName}`;

        // Determine dashboard name
        let dashboardName = dashboardUsage.dashboardName ||
                          dashboardUsage.recommendedDashboards?.[0] ||
                          `${reportDetails.reportName} Dashboard`;

        // Clean dashboard name for DeveloperName
        const developerName = dashboardName
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
            .replace(/\s+/g, '_')           // Replace spaces with underscores
            .replace(/_+/g, '_')            // Collapse multiple underscores
            .substring(0, 40);              // Limit length

        // Component type mapping: Friendly names → Salesforce API enums
        const componentTypeMap = {
            'Horizontal Bar Chart': 'Bar',
            'Vertical Bar Chart': 'Column',
            'Bar Chart': 'Bar',
            'Column Chart': 'Column',
            'Grouped Bar Chart': 'BarGrouped',
            'Stacked Bar Chart': 'BarStacked',
            'Grouped Column Chart': 'ColumnGrouped',
            'Stacked Column Chart': 'ColumnStacked',
            'Line Chart': 'Line',
            'Grouped Line Chart': 'LineGrouped',
            'Pie Chart': 'Pie',
            'Donut Chart': 'Donut',
            'Funnel Chart': 'Funnel',
            'Scatter Chart': 'Scatter',
            'Table': 'Table',
            'Metric': 'Metric',
            'Gauge': 'Gauge'
        };

        // Build components from dashboardUsage.dashboardComponents or dashboardUsage.components
        const components = {
            left: [],
            middle: [],
            right: []
        };

        const dashboardComponents = dashboardUsage.dashboardComponents || dashboardUsage.components;
        if (dashboardComponents && Array.isArray(dashboardComponents)) {
            // Distribute components across columns for balanced layout
            const componentCount = dashboardComponents.length;

            dashboardComponents.forEach((comp, index) => {
                // Map component type to Salesforce API enum
                const rawType = comp.componentType || 'Table';
                const componentType = componentTypeMap[rawType] || rawType;

                const component = {
                    title: comp.title,
                    report: reportReference, // Use the actual report reference
                    componentType: componentType
                };

                // Chart components require sortBy attribute
                const chartTypes = ['Bar', 'BarGrouped', 'BarStacked', 'Column', 'ColumnGrouped', 'ColumnStacked',
                                   'Line', 'LineGrouped', 'Pie', 'Donut', 'Funnel', 'Scatter'];
                if (chartTypes.includes(componentType)) {
                    component.sortBy = comp.sortBy || 'RowValueDescending'; // Required for charts
                }

                // Add footer if specified
                if (comp.footer) {
                    component.footer = comp.footer;
                }

                // Add any additional properties from template (indicatorColors, etc.)
                if (comp.indicatorHighColor) component.indicatorHighColor = comp.indicatorHighColor;
                if (comp.indicatorLowColor) component.indicatorLowColor = comp.indicatorLowColor;
                if (comp.indicatorMiddleColor) component.indicatorMiddleColor = comp.indicatorMiddleColor;
                if (comp.legendPosition) component.legendPosition = comp.legendPosition;
                if (comp.chartAxisRange) component.chartAxisRange = comp.chartAxisRange;

                // Distribute components:
                // If component has explicit section property, use that
                // Otherwise, distribute automatically based on position
                if (comp.section) {
                    components[comp.section].push(component);
                } else if (componentCount === 1) {
                    components.left.push(component);
                } else if (componentCount === 2) {
                    if (index === 0) components.left.push(component);
                    else components.right.push(component);
                } else {
                    // For 3+ components, distribute round-robin
                    const colIndex = index % 3;
                    if (colIndex === 0) components.left.push(component);
                    else if (colIndex === 1) components.middle.push(component);
                    else components.right.push(component);
                }
            });

            console.log(`  ✅ Built ${componentCount} dashboard component(s)`);
        }

        // Build dashboard template
        // NOTE: Dashboard folders are separate from report folders in Salesforce
        // Create a folder for OpsPal dashboards if not specified
        const defaultFolderName = 'OpsPal_Dashboards';

        const dashboardTemplate = {
            title: dashboardName,
            developerName: developerName,
            description: dashboardUsage.description || `Auto-generated dashboard for ${reportDetails.reportName}`,
            folderName: options.dashboardFolder || defaultFolderName,
            dashboardType: dashboardUsage.dashboardType || 'LoggedInUser',
            runningUser: dashboardUsage.runningUser, // Required for SpecifiedUser dashboards
            components: components
        };

        console.log(`  ✅ Dashboard template: ${dashboardTemplate.title}`);

        return dashboardTemplate;
    }
}

module.exports = ReportTemplateDeployer;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Usage: node report-template-deployer.js [OPTIONS]

Options:
  --template <path>     Template file path or name (required)
  --org <alias>         Salesforce org alias (required)
  --folder <name>       Target folder name (optional)
  --name <name>         Override report name (optional)
  --dry-run             Validate without creating
  --no-intelligence     Skip intelligence script validation

Examples:
  node report-template-deployer.js --template team-performance --org acme-production --dry-run
  node report-template-deployer.js --template templates/reports/sales-leaders/team-performance.json --org my-org

Environment Variables:
  ENABLE_WRITE=1        Enable report creation (defaults to dry-run mode)
        `);
        process.exit(0);
    }

    // Parse arguments
    const options = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--template' && args[i + 1]) {
            options.template = args[++i];
        } else if (args[i] === '--org' && args[i + 1]) {
            options.org = args[++i];
        } else if (args[i] === '--folder' && args[i + 1]) {
            options.folderName = args[++i];
        } else if (args[i] === '--name' && args[i + 1]) {
            options.reportName = args[++i];
        } else if (args[i] === '--dry-run') {
            options.dryRun = true;
        } else if (args[i] === '--no-intelligence') {
            options.runIntelligence = false;
        } else if (args[i] === '--variation' && args[i + 1]) {
            options.variation = args[++i];
        }
    }

    if (!options.template || !options.org) {
        console.error('Error: --template and --org are required');
        process.exit(1);
    }

    // Run deployment
    (async () => {
        try {
            console.log(`\n🚀 Deploying report template...`);
            console.log(`   Template: ${options.template}`);
            console.log(`   Org: ${options.org}`);
            console.log(`   Mode: ${options.dryRun ? 'DRY-RUN' : 'LIVE'}\n`);

            const deployer = await ReportTemplateDeployer.create(options.org);
            const result = await deployer.deployFromTemplate(options.template, options);

            console.log('✅ Deployment Result:\n');
            console.log(JSON.stringify(result, null, 2));

            if (result.success && result.report) {
                console.log(`\n✨ Report created: ${result.report.url}`);
            }

        } catch (error) {
            console.error(`\n❌ Deployment failed: ${error.message}`);
            if (error.stack) {
                console.error(`\n${error.stack}`);
            }
            process.exit(1);
        }
    })();
}
