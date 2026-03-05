#!/usr/bin/env node

/**
 * Enhanced CLI for Salesforce Reports & Dashboards
 * Interactive report builder with pipeline mode support
 */

const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const ReportsAPIClass = require('../lib/reports-rest-api');
const { tokenMap, normalizeOperators, buildBooleanFilter, withRetries } = require('../lib/reports_api_guardrails');
const { buildMetadataFromArgs } = require('./lib/build-report-metadata');

// Import services
const ReportFieldValidator = require('../lib/report-field-validator');
const ReportPerformanceOptimizer = require('../analytics/report-performance-optimizer');
const FieldSuggestionEngine = require('../lib/field-suggestion-engine');
const AutoRemediationSystem = require('../lib/auto-remediation-system');

// ASCII Art Banner
const banner = `
╔═══════════════════════════════════════════════════════════╗
║   ____   _____   ____                       _            ║
║  / ___| |  ___| |  _ \\ ___ _ __   ___  _ __| |_ ___      ║
║  \\___ \\ | |_    | |_) / _ \\ '_ \\ / _ \\| '__| __/ __|     ║
║   ___) ||  _|   |  _ <  __/ |_) | (_) | |  | |_\\__ \\     ║
║  |____/ |_|     |_| \\_\\___| .__/ \\___/|_|   \\__|___/     ║
║                            |_|                            ║
║                                                           ║
║        Salesforce Reports & Dashboards CLI v2.0          ║
╚═══════════════════════════════════════════════════════════╝
`;

class SalesforceReportsCLI {
    constructor() {
        this.orgAlias = process.env.SF_TARGET_ORG || 'production';
        this.validator = null;
        this.optimizer = null;
        this.suggestionEngine = null;
        this.remediationSystem = null;
    }

    async initialize() {
        this.validator = new ReportFieldValidator(this.orgAlias);
        this.optimizer = new ReportPerformanceOptimizer();
        this.suggestionEngine = new FieldSuggestionEngine(this.orgAlias);
        this.remediationSystem = new AutoRemediationSystem(this.orgAlias);

        await this.suggestionEngine.initialize();
    }

    /**
     * Interactive report builder
     */
    async interactiveReportBuilder() {
        console.log(chalk.cyan(banner));
        console.log(chalk.yellow('Welcome to the Interactive Report Builder!\n'));

        const reportConfig = {};

        // Step 1: Basic Information
        const basicInfo = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Report name:',
                validate: (input) => input.length > 0 || 'Report name is required'
            },
            {
                type: 'input',
                name: 'description',
                message: 'Report description (optional):'
            },
            {
                type: 'list',
                name: 'reportType',
                message: 'Select report type:',
                choices: [
                    'Opportunity',
                    'Account',
                    'Contact',
                    'Lead',
                    'Case',
                    'Custom'
                ]
            }
        ]);

        Object.assign(reportConfig, basicInfo);

        // Step 2: Field Selection with Suggestions
        console.log(chalk.cyan('\n📊 Field Selection'));

        const fields = [];
        let addingFields = true;

        while (addingFields) {
            // Get field suggestions
            const suggestions = await this.suggestionEngine.getSuggestions({
                reportType: reportConfig.reportType,
                existingFields: fields,
                reportName: reportConfig.name
            });

            const suggestedChoices = suggestions.map(s => ({
                name: `${s.field} ${chalk.gray(`(${Math.round(s.confidence * 100)}% - ${s.reason})`)}`,
                value: s.field
            }));

            const fieldAnswer = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: `Selected fields: ${fields.length > 0 ? fields.join(', ') : 'None'}`,
                    choices: [
                        ...suggestedChoices,
                        new inquirer.Separator(),
                        { name: 'Enter custom field', value: 'custom' },
                        { name: 'Continue to next step', value: 'continue' }
                    ]
                }
            ]);

            if (fieldAnswer.action === 'continue') {
                addingFields = false;
            } else if (fieldAnswer.action === 'custom') {
                const customField = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'field',
                        message: 'Enter field name (e.g., Account.Name):'
                    }
                ]);
                fields.push(customField.field);
            } else {
                fields.push(fieldAnswer.action);
            }
        }

        reportConfig.detailColumns = fields;

        // Step 3: Filters
        console.log(chalk.cyan('\n🔍 Filters'));

        const filters = [];
        const addFilter = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'add',
                message: 'Add filters to the report?',
                default: true
            }
        ]);

        if (addFilter.add) {
            let addingFilters = true;

            while (addingFilters) {
                const filter = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'column',
                        message: 'Filter field:'
                    },
                    {
                        type: 'list',
                        name: 'operator',
                        message: 'Operator:',
                        choices: ['equals', 'not equal to', 'greater than', 'less than', 'contains', 'starts with']
                    },
                    {
                        type: 'input',
                        name: 'value',
                        message: 'Value:'
                    }
                ]);

                filters.push(filter);

                const continueAdding = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'continue',
                        message: 'Add another filter?',
                        default: false
                    }
                ]);

                addingFilters = continueAdding.continue;
            }
        }

        reportConfig.reportFilters = filters;

        // Step 4: Date Range
        console.log(chalk.cyan('\n📅 Date Range'));

        const dateRange = await inquirer.prompt([
            {
                type: 'list',
                name: 'dateFilter',
                message: 'Select date range:',
                choices: [
                    { name: 'Today', value: 'TODAY' },
                    { name: 'Yesterday', value: 'YESTERDAY' },
                    { name: 'This Week', value: 'THIS_WEEK' },
                    { name: 'Last Week', value: 'LAST_WEEK' },
                    { name: 'This Month', value: 'THIS_MONTH' },
                    { name: 'Last Month', value: 'LAST_MONTH' },
                    { name: 'This Quarter', value: 'THIS_QUARTER' },
                    { name: 'Last Quarter', value: 'LAST_QUARTER' },
                    { name: 'This Year', value: 'THIS_YEAR' },
                    { name: 'Last 30 Days', value: 'LAST_N_DAYS:30' },
                    { name: 'Last 90 Days', value: 'LAST_N_DAYS:90' },
                    { name: 'No date filter', value: null }
                ]
            }
        ]);

        if (dateRange.dateFilter) {
            const dateField = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'column',
                    message: 'Date field:',
                    choices: ['CreatedDate', 'LastModifiedDate', 'CloseDate', 'Custom'],
                    default: 'CreatedDate'
                }
            ]);

            if (dateField.column === 'Custom') {
                const customDate = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'column',
                        message: 'Enter date field name:'
                    }
                ]);
                dateField.column = customDate.column;
            }

            reportConfig.standardDateFilter = {
                column: dateField.column,
                durationValue: dateRange.dateFilter
            };
        }

        // Step 5: Grouping
        console.log(chalk.cyan('\n📊 Grouping'));

        const grouping = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'addGrouping',
                message: 'Add grouping to the report?',
                default: false
            }
        ]);

        if (grouping.addGrouping) {
            const groupField = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'field',
                    message: 'Group by field:'
                }
            ]);

            reportConfig.groupingsDown = [{ field: groupField.field }];
        }

        // Step 5.5: Metric Semantics
        console.log(chalk.cyan('\n📐 Metric Semantics'));

        const metricPrompt = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useMetric',
                message: 'Is this report based on a standard revenue metric (pipeline, bookings, ARR, etc.)?',
                default: false
            }
        ]);

        if (metricPrompt.useMetric) {
            const definitionsPath = path.join(__dirname, '../../config/metric-definitions.json');
            const definitionsRaw = await fs.readFile(definitionsPath, 'utf8');
            const definitions = JSON.parse(definitionsRaw);

            const metricChoices = Object.entries(definitions.metrics).map(([metricId, metric]) => ({
                name: `${metric.metricName} (${metricId})`,
                value: metricId
            }));

            const metricChoice = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'metricId',
                    message: 'Select metric definition:',
                    choices: metricChoices
                }
            ]);

            reportConfig.metricDefinitionId = metricChoice.metricId;

            const resolverScript = path.join(__dirname, '..', 'lib', 'metric-field-resolver.js');
            try {
                execSync(
                    `node "${resolverScript}" --org ${this.orgAlias} --metric ${metricChoice.metricId} --interactive`,
                    { stdio: 'inherit' }
                );
            } catch (error) {
                console.log(chalk.yellow('⚠️ Metric field resolver failed. Please confirm mappings manually.'));
            }
        }

        // Step 6: Optimization Options
        console.log(chalk.cyan('\n⚡ Optimization'));

        const optimization = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'validate',
                message: 'Validate report configuration?',
                default: true
            },
            {
                type: 'confirm',
                name: 'optimize',
                message: 'Optimize for performance?',
                default: true
            },
            {
                type: 'confirm',
                name: 'cache',
                message: 'Enable caching?',
                default: true
            }
        ]);

        // Process the report
        const spinner = ora('Processing report...').start();

        try {
            // Validate
            if (optimization.validate) {
                spinner.text = 'Validating configuration...';
                const validation = await this.validator.validate(reportConfig);

                if (!validation.valid) {
                    spinner.warn('Validation found issues');

                    // Auto-remediate
                    const remediate = await inquirer.prompt([
                        {
                            type: 'confirm',
                            name: 'fix',
                            message: `Found ${validation.errors.length} errors. Attempt auto-fix?`,
                            default: true
                        }
                    ]);

                    if (remediate.fix) {
                        spinner.text = 'Applying auto-remediation...';
                        const fixed = await this.remediationSystem.remediate(
                            reportConfig,
                            validation.errors
                        );

                        if (fixed.hasChanges) {
                            reportConfig = fixed.remediated;
                            spinner.succeed('Configuration fixed');
                        }
                    }
                } else {
                    spinner.succeed('Validation passed');
                }
            }

            // Optimize
            if (optimization.optimize) {
                spinner.text = 'Optimizing performance...';
                const optimized = await this.optimizer.optimizeReport(reportConfig);
                reportConfig = optimized.optimized;

                spinner.succeed(`Applied ${optimized.applied.length} optimizations`);
            }

            // Display final configuration
            spinner.stop();
            this.displayReportSummary(reportConfig);

            // Save options
            const save = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'action',
                    message: 'What would you like to do?',
                    choices: [
                        { name: 'Save to file', value: 'save' },
                        { name: 'Deploy to Salesforce', value: 'deploy' },
                        { name: 'Copy to clipboard', value: 'copy' },
                        { name: 'Exit', value: 'exit' }
                    ]
                }
            ]);

            if (save.action === 'save') {
                const filename = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'path',
                        message: 'Save as:',
                        default: `${reportConfig.name.replace(/\s+/g, '_')}.json`
                    }
                ]);

                await fs.writeFile(filename.path, JSON.stringify(reportConfig, null, 2));
                console.log(chalk.green(`✅ Report saved to ${filename.path}`));
            } else if (save.action === 'deploy') {
                console.log(chalk.cyan('🚀 Deploying report to Salesforce...'));
                const deployment = await this.deployReport(reportConfig);
                const deployedId = deployment.result?.reportId || deployment.result?.id;
                console.log(chalk.green(`✅ Report deployed${deployedId ? `: ${deployedId}` : ''}`));
                if (deployment.result?.url) {
                    console.log(chalk.cyan(`🔗 ${deployment.result.url}`));
                }
            } else if (save.action === 'copy') {
                const clipboardy = require('clipboardy');
                clipboardy.writeSync(JSON.stringify(reportConfig, null, 2));
                console.log(chalk.green('✅ Configuration copied to clipboard'));
            }

        } catch (error) {
            spinner.fail('Processing failed');
            console.error(chalk.red(error.message));
        }
    }

    /**
     * Display report summary
     */
    displayReportSummary(config) {
        console.log(chalk.cyan('\n📋 Report Summary\n'));

        const table = new Table({
            head: [chalk.white('Property'), chalk.white('Value')],
            style: { head: [], border: [] }
        });

        table.push(
            ['Name', config.name || 'N/A'],
            ['Type', config.reportType || 'N/A'],
            ['Metric', config.metricDefinitionId || 'N/A'],
            ['Fields', (config.detailColumns || []).length],
            ['Filters', (config.reportFilters || []).length],
            ['Date Range', config.standardDateFilter?.durationValue || 'None'],
            ['Grouping', config.groupingsDown ? 'Yes' : 'No'],
            ['Optimized', config.optimized ? 'Yes' : 'No'],
            ['Cached', config.cacheStrategy || 'No']
        );

        console.log(table.toString());
    }

    /**
     * Normalize interactive config to Reports REST metadata contract
     */
    async buildDeploymentMetadata(reportConfig, api) {
        const reportTypeToken = await api.resolveReportType(reportConfig.reportType || 'Opportunity');
        const writableFolders = await api.getWritableFolders();

        if (!writableFolders.length) {
            throw new Error('No writable report folders found for current user');
        }

        const normalizeFilters = (filters = []) => filters
            .map((filter) => ({
                column: tokenMap(filter.column) || filter.column,
                operator: normalizeOperators(filter.operator || 'equals'),
                value: filter.value
            }))
            .filter((filter) => filter.column && filter.operator && filter.value !== undefined);

        const normalizeGroupings = (groupings = []) => groupings
            .map((grouping) => ({
                name: tokenMap(grouping.field || grouping.name) || grouping.field || grouping.name,
                sortOrder: grouping.sortOrder || 'ASC'
            }))
            .filter((grouping) => grouping.name);

        const detailColumns = (reportConfig.detailColumns || [])
            .map((column) => tokenMap(column) || column)
            .filter(Boolean);

        const groupingsDown = normalizeGroupings(reportConfig.groupingsDown || []);
        const reportFilters = normalizeFilters(reportConfig.reportFilters || []);
        const metadata = {
            name: reportConfig.name || `Interactive Report ${Date.now()}`,
            reportType: { type: reportTypeToken },
            reportFormat: groupingsDown.length > 0 ? 'SUMMARY' : 'TABULAR',
            folderId: reportConfig.folderId || writableFolders[0].id,
            detailColumns,
            reportFilters,
            groupingsDown
        };

        if (reportConfig.standardDateFilter?.column && reportConfig.standardDateFilter?.durationValue) {
            metadata.standardDateFilter = {
                column: tokenMap(reportConfig.standardDateFilter.column) || reportConfig.standardDateFilter.column,
                durationValue: reportConfig.standardDateFilter.durationValue
            };
        }

        if (reportFilters.length > 1) {
            metadata.reportBooleanFilter = buildBooleanFilter(reportFilters);
        }

        return metadata;
    }

    /**
     * Deploy report configuration to Salesforce
     */
    async deployReport(reportConfig) {
        const previousEnableWrite = process.env.ENABLE_WRITE;
        process.env.ENABLE_WRITE = '1';

        try {
            const api = await getApi();
            const metadata = await this.buildDeploymentMetadata(reportConfig, api);
            const result = await withRetries(() => api.createReport(metadata));
            return { metadata, result };
        } finally {
            if (previousEnableWrite === undefined) {
                delete process.env.ENABLE_WRITE;
            } else {
                process.env.ENABLE_WRITE = previousEnableWrite;
            }
        }
    }

    /**
     * Batch operations
     */
    async batchOperations() {
        const action = await inquirer.prompt([
            {
                type: 'list',
                name: 'operation',
                message: 'Select batch operation:',
                choices: [
                    { name: 'Validate multiple reports', value: 'validate' },
                    { name: 'Optimize all reports in folder', value: 'optimize' },
                    { name: 'Analyze performance', value: 'analyze' },
                    { name: 'Clear cache', value: 'cache' },
                    { name: 'Back to main menu', value: 'back' }
                ]
            }
        ]);

        if (action.operation === 'validate') {
            await this.batchValidate();
        } else if (action.operation === 'optimize') {
            await this.batchOptimize();
        } else if (action.operation === 'analyze') {
            await this.batchAnalyze();
        } else if (action.operation === 'cache') {
            this.optimizer.cache.clear();
            console.log(chalk.green('✅ Cache cleared'));
        }
    }

    async batchValidate() {
        const folder = await inquirer.prompt([
            {
                type: 'input',
                name: 'path',
                message: 'Folder containing report JSON files:',
                default: './reports'
            }
        ]);

        const spinner = ora('Validating reports...').start();

        try {
            const files = await fs.readdir(folder.path);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            let valid = 0;
            let invalid = 0;
            const issues = [];

            for (const file of jsonFiles) {
                const content = await fs.readFile(path.join(folder.path, file), 'utf-8');
                const config = JSON.parse(content);

                const validation = await this.validator.validate(config);

                if (validation.valid) {
                    valid++;
                } else {
                    invalid++;
                    issues.push({
                        file,
                        errors: validation.errors.length
                    });
                }
            }

            spinner.stop();

            // Display results
            const table = new Table({
                head: ['File', 'Status', 'Errors']
            });

            for (const file of jsonFiles) {
                const issue = issues.find(i => i.file === file);
                table.push([
                    file,
                    issue ? chalk.red('Invalid') : chalk.green('Valid'),
                    issue ? issue.errors : 0
                ]);
            }

            console.log(table.toString());
            console.log(`\nTotal: ${jsonFiles.length} | Valid: ${valid} | Invalid: ${invalid}`);

        } catch (error) {
            spinner.fail('Batch validation failed');
            console.error(chalk.red(error.message));
        }
    }

    async batchOptimize() {
        const folder = await inquirer.prompt([
            {
                type: 'input',
                name: 'path',
                message: 'Folder containing report JSON files:',
                default: './reports'
            }
        ]);

        const spinner = ora('Optimizing reports...').start();

        try {
            const files = await fs.readdir(folder.path);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            let optimized = 0;
            let totalImprovement = 0;

            for (const file of jsonFiles) {
                const filePath = path.join(folder.path, file);
                const content = await fs.readFile(filePath, 'utf-8');
                const config = JSON.parse(content);

                const result = await this.optimizer.optimizeReport(config);

                if (result.applied.length > 0) {
                    optimized++;
                    totalImprovement += result.estimatedImprovement.percentage;

                    // Save optimized version
                    const optimizedPath = filePath.replace('.json', '.optimized.json');
                    await fs.writeFile(
                        optimizedPath,
                        JSON.stringify(result.optimized, null, 2)
                    );
                }
            }

            spinner.succeed('Optimization complete');

            console.log(chalk.green(`\n✅ Optimized ${optimized}/${jsonFiles.length} reports`));
            console.log(chalk.green(`📈 Average improvement: ${(totalImprovement / optimized).toFixed(1)}%`));

        } catch (error) {
            spinner.fail('Batch optimization failed');
            console.error(chalk.red(error.message));
        }
    }

    async batchAnalyze() {
        const folder = await inquirer.prompt([
            {
                type: 'input',
                name: 'path',
                message: 'Folder containing report JSON files:',
                default: './reports'
            }
        ]);

        const spinner = ora('Analyzing reports...').start();

        try {
            const files = await fs.readdir(folder.path);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            const analyses = [];

            for (const file of jsonFiles) {
                const content = await fs.readFile(path.join(folder.path, file), 'utf-8');
                const config = JSON.parse(content);

                const analysis = await this.optimizer.analyzeReport(config);
                analyses.push({
                    file,
                    complexity: analysis.complexity.level,
                    estimatedTime: analysis.estimatedTime.estimated,
                    cacheability: analysis.cacheability.score,
                    optimizations: analysis.optimizations.length
                });
            }

            spinner.stop();

            // Display results
            const table = new Table({
                head: ['File', 'Complexity', 'Est. Time (ms)', 'Cacheability', 'Optimizations']
            });

            for (const analysis of analyses) {
                table.push([
                    analysis.file,
                    this.getComplexityColor(analysis.complexity),
                    analysis.estimatedTime,
                    `${analysis.cacheability}/100`,
                    analysis.optimizations
                ]);
            }

            console.log(table.toString());

        } catch (error) {
            spinner.fail('Batch analysis failed');
            console.error(chalk.red(error.message));
        }
    }

    getComplexityColor(level) {
        switch (level) {
            case 'LOW': return chalk.green(level);
            case 'MEDIUM': return chalk.yellow(level);
            case 'HIGH': return chalk.red(level);
            case 'VERY_HIGH': return chalk.bgRed.white(level);
            default: return level;
        }
    }

    /**
     * Main menu
     */
    async mainMenu() {
        console.clear();
        console.log(chalk.cyan(banner));

        const answer = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '🎨 Interactive Report Builder', value: 'interactive' },
                    { name: '📦 Batch Operations', value: 'batch' },
                    { name: '✅ Validate Report', value: 'validate' },
                    { name: '⚡ Optimize Report', value: 'optimize' },
                    { name: '🔍 Analyze Performance', value: 'analyze' },
                    { name: '💡 Get Field Suggestions', value: 'suggest' },
                    { name: '🔧 Settings', value: 'settings' },
                    { name: '❌ Exit', value: 'exit' }
                ]
            }
        ]);

        switch (answer.action) {
            case 'interactive':
                await this.interactiveReportBuilder();
                break;
            case 'batch':
                await this.batchOperations();
                break;
            case 'validate':
                await this.validateReport();
                break;
            case 'optimize':
                await this.optimizeReport();
                break;
            case 'analyze':
                await this.analyzeReport();
                break;
            case 'suggest':
                await this.suggestFields();
                break;
            case 'settings':
                await this.settings();
                break;
            case 'exit':
                console.log(chalk.yellow('\nGoodbye! 👋\n'));
                process.exit(0);
        }

        // Return to main menu
        if (answer.action !== 'exit') {
            const returnToMenu = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'return',
                    message: 'Return to main menu?',
                    default: true
                }
            ]);

            if (returnToMenu.return) {
                await this.mainMenu();
            }
        }
    }

    async validateReport() {
        const file = await inquirer.prompt([
            {
                type: 'input',
                name: 'path',
                message: 'Report configuration file:',
                validate: async (input) => {
                    try {
                        await fs.access(input);
                        return true;
                    } catch {
                        return 'File not found';
                    }
                }
            }
        ]);

        const spinner = ora('Validating report...').start();

        try {
            const content = await fs.readFile(file.path, 'utf-8');
            const config = JSON.parse(content);

            const validation = await this.validator.validate(config);

            spinner.stop();

            if (validation.valid) {
                console.log(chalk.green('✅ Report configuration is valid!'));
            } else {
                console.log(chalk.red(`❌ Found ${validation.errors.length} errors:`));
                validation.errors.forEach((error, i) => {
                    console.log(chalk.red(`  ${i + 1}. ${error.message}`));
                });
            }

            if (validation.warnings && validation.warnings.length > 0) {
                console.log(chalk.yellow(`\n⚠️  ${validation.warnings.length} warnings:`));
                validation.warnings.forEach((warning, i) => {
                    console.log(chalk.yellow(`  ${i + 1}. ${warning.message}`));
                });
            }

        } catch (error) {
            spinner.fail('Validation failed');
            console.error(chalk.red(error.message));
        }
    }

    async optimizeReport() {
        const file = await inquirer.prompt([
            {
                type: 'input',
                name: 'path',
                message: 'Report configuration file:'
            }
        ]);

        const spinner = ora('Optimizing report...').start();

        try {
            const content = await fs.readFile(file.path, 'utf-8');
            const config = JSON.parse(content);

            const result = await this.optimizer.optimizeReport(config);

            spinner.succeed('Optimization complete');

            console.log(chalk.green(`\n✅ Applied ${result.applied.length} optimizations:`));
            result.applied.forEach((opt, i) => {
                console.log(`  ${i + 1}. [${opt.impact}] ${opt.description}`);
            });

            console.log(chalk.green(`\n📈 Estimated improvement: ${result.estimatedImprovement.percentage.toFixed(1)}%`));

            const save = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'save',
                    message: 'Save optimized configuration?',
                    default: true
                }
            ]);

            if (save.save) {
                const outputPath = file.path.replace('.json', '.optimized.json');
                await fs.writeFile(outputPath, JSON.stringify(result.optimized, null, 2));
                console.log(chalk.green(`✅ Saved to ${outputPath}`));
            }

        } catch (error) {
            spinner.fail('Optimization failed');
            console.error(chalk.red(error.message));
        }
    }

    async analyzeReport() {
        const file = await inquirer.prompt([
            {
                type: 'input',
                name: 'path',
                message: 'Report configuration file:'
            }
        ]);

        const spinner = ora('Analyzing report...').start();

        try {
            const content = await fs.readFile(file.path, 'utf-8');
            const config = JSON.parse(content);

            const analysis = await this.optimizer.analyzeReport(config);

            spinner.stop();

            console.log(chalk.cyan('\n📊 Performance Analysis\n'));

            const table = new Table({
                head: ['Metric', 'Value']
            });

            table.push(
                ['Complexity', this.getComplexityColor(analysis.complexity.level) + ` (${analysis.complexity.score})`],
                ['Estimated Time', `${analysis.estimatedTime.estimated}ms`],
                ['Cacheability', `${analysis.cacheability.score}/100`],
                ['Cache TTL', `${analysis.cacheability.ttl / 1000}s`]
            );

            console.log(table.toString());

            if (analysis.recommendations.length > 0) {
                console.log(chalk.cyan('\n💡 Recommendations:\n'));
                analysis.recommendations.forEach((rec, i) => {
                    console.log(`  ${i + 1}. [${rec.priority}] ${rec.message}`);
                });
            }

        } catch (error) {
            spinner.fail('Analysis failed');
            console.error(chalk.red(error.message));
        }
    }

    async suggestFields() {
        const input = await inquirer.prompt([
            {
                type: 'list',
                name: 'reportType',
                message: 'Report type:',
                choices: ['Opportunity', 'Account', 'Contact', 'Lead', 'Case']
            },
            {
                type: 'input',
                name: 'purpose',
                message: 'Report purpose (optional):'
            }
        ]);

        const spinner = ora('Generating suggestions...').start();

        try {
            const suggestions = await this.suggestionEngine.getSuggestions({
                reportType: input.reportType,
                existingFields: [],
                purpose: input.purpose
            });

            spinner.stop();

            console.log(chalk.cyan('\n💡 Suggested Fields:\n'));

            const table = new Table({
                head: ['Field', 'Reason', 'Confidence']
            });

            suggestions.forEach(s => {
                table.push([
                    s.field,
                    s.reason,
                    chalk.green(`${Math.round(s.confidence * 100)}%`)
                ]);
            });

            console.log(table.toString());

        } catch (error) {
            spinner.fail('Failed to generate suggestions');
            console.error(chalk.red(error.message));
        }
    }

    async settings() {
        const settings = await inquirer.prompt([
            {
                type: 'list',
                name: 'setting',
                message: 'Settings:',
                choices: [
                    { name: 'Change Salesforce Org', value: 'org' },
                    { name: 'Configure Cache', value: 'cache' },
                    { name: 'Set API Endpoint', value: 'api' },
                    { name: 'Back', value: 'back' }
                ]
            }
        ]);

        if (settings.setting === 'org') {
            const org = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'alias',
                    message: 'Salesforce org alias:',
                    default: this.orgAlias
                }
            ]);

            this.orgAlias = org.alias;
            process.env.SF_TARGET_ORG = org.alias;
            console.log(chalk.green(`✅ Org set to: ${org.alias}`));
        }
    }
}

// Commander setup for non-interactive mode
program
    .name('sf-reports')
    .description('Salesforce Reports & Dashboards CLI')
    .version('2.0.0');

program
    .command('validate <file>')
    .description('Validate a report configuration')
    .option('--fix', 'Attempt to auto-fix errors')
    .action(async (file, options) => {
        const cli = new SalesforceReportsCLI();
        await cli.initialize();

        try {
            const content = await fs.readFile(file, 'utf-8');
            const config = JSON.parse(content);

            const validation = await cli.validator.validate(config);

            if (validation.valid) {
                console.log(chalk.green('✅ Valid'));
                process.exit(0);
            } else {
                console.log(chalk.red(`❌ ${validation.errors.length} errors`));

                if (options.fix) {
                    const fixed = await cli.remediationSystem.remediate(config, validation.errors);
                    if (fixed.hasChanges) {
                        await fs.writeFile(file.replace('.json', '.fixed.json'), JSON.stringify(fixed.remediated, null, 2));
                        console.log(chalk.green('✅ Fixed and saved'));
                    }
                }

                process.exit(1);
            }
        } catch (error) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

program
    .command('optimize <file>')
    .description('Optimize a report configuration')
    .option('-o, --output <file>', 'Output file')
    .action(async (file, options) => {
        const cli = new SalesforceReportsCLI();
        await cli.initialize();

        try {
            const content = await fs.readFile(file, 'utf-8');
            const config = JSON.parse(content);

            const result = await cli.optimizer.optimizeReport(config);

            const output = options.output || file.replace('.json', '.optimized.json');
            await fs.writeFile(output, JSON.stringify(result.optimized, null, 2));

            console.log(chalk.green(`✅ Optimized (${result.estimatedImprovement.percentage.toFixed(1)}% improvement)`));
            console.log(chalk.green(`📁 Saved to: ${output}`));

        } catch (error) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

program
    .command('analyze <file>')
    .description('Analyze report performance')
    .action(async (file) => {
        const cli = new SalesforceReportsCLI();
        await cli.initialize();

        try {
            const content = await fs.readFile(file, 'utf-8');
            const config = JSON.parse(content);

            const analysis = await cli.optimizer.analyzeReport(config);

            console.log(JSON.stringify(analysis, null, 2));

        } catch (error) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

program
    .command('suggest <type>')
    .description('Get field suggestions for a report type')
    .option('-p, --purpose <purpose>', 'Report purpose')
    .action(async (type, options) => {
        const cli = new SalesforceReportsCLI();
        await cli.initialize();

        try {
            const suggestions = await cli.suggestionEngine.getSuggestions({
                reportType: type,
                existingFields: [],
                purpose: options.purpose || ''
            });

            suggestions.forEach(s => {
                console.log(`${s.field} - ${s.reason} (${Math.round(s.confidence * 100)}%)`);
            });

        } catch (error) {
            console.error(chalk.red(error.message));
            process.exit(1);
        }
    });

program
    .command('interactive')
    .alias('i')
    .description('Launch interactive mode')
    .action(async () => {
        const cli = new SalesforceReportsCLI();
        await cli.initialize();
        await cli.mainMenu();
    });

// Helper to auth Reports REST
async function getApi() {
    const org = process.env.ORG || process.env.SF_TARGET_ORG || process.env.SF_USERNAME;
    if (!process.env.ORG && org) process.env.ORG = org;
    return await ReportsAPIClass.fromSFAuth(org);
}

function parseFilterExpr(expr) {
    // FIELD=operator:value
    const [lhs, rhs] = expr.split('=');
    const [op, val] = (rhs || '').split(':');
    return { column: lhs, operator: op, value: val };
}

program
    .command('create')
    .description('Create a report via Reports REST')
    .requiredOption('--type <type>', 'Report type API token (e.g., Opportunity)')
    .option('--group-by <fields>', 'Comma-separated groupings (tokens or labels)')
    .option('--filter <expr...>', 'Filter(s) as FIELD=operator:value (repeatable)')
    .option('--date <spec>', 'Date as COLUMN:DURATION (e.g., CLOSE_DATE:LAST_N_DAYS:30)')
    .option('--name <name>', 'Report name')
    .action(async (opts) => {
        try {
            const api = await getApi();
            const describe = await api.describeReportType(opts.type);
            const filters = (opts.filter || []).map(parseFilterExpr);
            const groupBy = (opts.groupBy || '').split(',').map(s => s.trim()).filter(Boolean);
            const metadata = await buildMetadataFromArgs({
                type: opts.type,
                groupBy,
                filters,
                date: opts.date || null,
                name: opts.name || `CLI Report ${Date.now()}`
            }, describe);
            const res = await withRetries(() => api.createReport(metadata));
            console.log(JSON.stringify({ id: res.reportId || res.id, url: res.url }, null, 2));
        } catch (e) {
            console.error(e.message);
            process.exit(1);
        }
    });

program
    .command('run')
    .description('Run a report with ad-hoc overrides (no persistence)')
    .requiredOption('--id <reportId>', 'Existing report Id')
    .option('--filter <expr...>', 'Filter(s) as FIELD=operator:value (repeatable)')
    .option('--date <spec>', 'Date as COLUMN:DURATION (e.g., CLOSE_DATE:LAST_N_DAYS:30)')
    .action(async (opts) => {
        try {
            const api = await getApi();
            const filters = (opts.filter || []).map(parseFilterExpr).map(f => ({
                column: tokenMap(f.column) || f.column,
                operator: normalizeOperators(f.operator),
                value: f.value
            }));
            const body = { reportFilters: filters };
            if (filters.length > 1) body.reportBooleanFilter = buildBooleanFilter(filters);
            if (opts.date) {
                const [col, literal] = opts.date.split(':', 2);
                body.standardDateFilter = { column: tokenMap(col) || col, durationValue: literal };
            }
            const resp = await withRetries(() => api.runReportWithOverrides(opts.id, body));
            console.log(JSON.stringify({ factMapKeys: Object.keys(resp.factMap || {}), aggregates: (resp.factMap && resp.factMap['T!T'] && resp.factMap['T!T'].aggregates || []).length }, null, 2));
        } catch (e) {
            console.error(e.message);
            process.exit(1);
        }
    });

// Parse arguments
if (process.argv.length === 2) {
    // No arguments - launch interactive mode
    const cli = new SalesforceReportsCLI();
    cli.initialize().then(() => cli.mainMenu());
} else {
    program.parse(process.argv);
}
