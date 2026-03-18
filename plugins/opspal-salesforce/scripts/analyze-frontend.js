#!/usr/bin/env node

/**
 * Frontend Analysis CLI
 * User-friendly command-line interface for frontend architecture analysis
 * 
 * Usage:
 *   npm run analyze:frontend -- --org myorg
 *   npm run analyze:frontend -- --org myorg --quick
 *   npm run analyze:frontend -- --org myorg --focus dashboard
 *   npm run analyze:frontend -- --org myorg --output ./reports
 */

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs').promises;
const FrontendArchitectureOrchestrator = require('./lib/frontend-architecture-orchestrator');
const DashboardProcessExtractor = require('./lib/dashboard-process-extractor');
const { GovernanceManager } = require('./lib/governance-manager');
const { DataAccessError } = require('./lib/data-access-error');

// ASCII Art Banner
const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     Salesforce Frontend Architecture Analyzer v1.0       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

program
    .name('analyze-frontend')
    .description('Analyze Salesforce frontend architecture and dependencies')
    .version('1.0.0')
    .option('-o, --org <alias>', 'Salesforce org alias', process.env.SF_TARGET_ORG || 'production')
    .option('-q, --quick', 'Quick scan (skip runtime correlation)', false)
    .option('-f, --focus <area>', 'Focus on specific area: dashboard, components, flows, commerce, experience')
    .option('--objects <list>', 'Comma-separated list of objects to analyze')
    .option('--output <dir>', 'Output directory', './frontend-analysis')
    .option('--dashboard <name>', 'Analyze specific dashboard')
    .option('--no-cache', 'Disable caching')
    .option('--format <type>', 'Output format: json, markdown, html', 'json')
    .option('--verbose', 'Verbose output')
    .option('--dry-run', 'Simulate without making API calls');

// Analyze command
program
    .command('full')
    .description('Run complete frontend analysis')
    .action(async () => {
        const options = program.opts();
        await runFullAnalysis(options);
    });

// Dashboard-specific analysis
program
    .command('dashboard <name>')
    .description('Analyze specific dashboard and its dependencies')
    .action(async (name) => {
        const options = program.opts();
        await analyzeDashboard(name, options);
    });

// Quick health check
program
    .command('health')
    .description('Quick health check of frontend components')
    .action(async () => {
        const options = program.opts();
        await runHealthCheck(options);
    });

// Impact analysis
program
    .command('impact <component>')
    .description('Analyze impact of changing a component')
    .action(async (component) => {
        const options = program.opts();
        await analyzeImpact(component, options);
    });

// Compare two analyses
program
    .command('compare <file1> <file2>')
    .description('Compare two analysis results')
    .action(async (file1, file2) => {
        await compareAnalyses(file1, file2);
    });

/**
 * Run full frontend analysis
 */
async function runFullAnalysis(options) {
    console.log(chalk.cyan(banner));
    console.log(chalk.bold(`🎯 Target Org: ${options.org}`));
    console.log(chalk.bold(`📁 Output Directory: ${options.output}`));
    console.log();
    
    const spinner = ora('Initializing analysis...').start();
    
    try {
        // Configure orchestrator
        const orchestratorOptions = {
            orgAlias: options.org,
            outputDir: options.output,
            runtime: !options.quick,
            dryRun: options.dryRun,
            objects: options.objects ? options.objects.split(',') : []
        };
        
        if (options.noCache) {
            orchestratorOptions.cacheExpiry = 0;
        }
        
        // Focus area handling
        if (options.focus) {
            spinner.text = `Focusing on ${options.focus} analysis...`;
            orchestratorOptions.focus = options.focus;
        }
        
        const orchestrator = new FrontendArchitectureOrchestrator(orchestratorOptions);
        
        // Progress updates
        const progressInterval = setInterval(() => {
            const messages = [
                'Discovering components...',
                'Mapping relationships...',
                'Analyzing dependencies...',
                'Correlating runtime data...',
                'Building architecture graph...'
            ];
            spinner.text = messages[Math.floor(Math.random() * messages.length)];
        }, 3000);
        
        // Run analysis
        const result = await orchestrator.orchestrate();

        clearInterval(progressInterval);

        // Quality Gate: Validate analysis produced results
        if (!result || typeof result !== 'object') {
            throw new Error('Analysis failed: No valid results returned');
        }

        spinner.succeed('Analysis complete!');

        // Display results
        displayResults(result, options);
        
        // Generate additional formats if requested
        if (options.format === 'html') {
            await generateHTMLReport(result, options.output);
        }
        
    } catch (error) {
        spinner.fail(`Analysis failed: ${error.message}`);
        if (options.verbose) {
            console.error(chalk.red(error.stack));
        }
        process.exit(1);
    }
}

/**
 * Analyze specific dashboard
 */
async function analyzeDashboard(name, options) {
    console.log(chalk.cyan(banner));
    console.log(chalk.bold(`📊 Analyzing Dashboard: ${name}`));
    console.log(chalk.bold(`🎯 Target Org: ${options.org}`));
    console.log();
    
    const spinner = ora('Extracting dashboard structure...').start();
    
    try {
        const extractor = new DashboardProcessExtractor({
            orgAlias: options.org,
            dryRun: options.dryRun
        });
        
        // Extract dashboard
        spinner.text = 'Analyzing dashboard components...';
        const result = await extractor.extractBusinessProcess(name);
        
        spinner.text = 'Mapping field dependencies...';
        
        // Save results
        const outputFile = path.join(
            options.output,
            `dashboard-${name.replace(/\s+/g, '_')}.json`
        );
        
        await fs.mkdir(options.output, { recursive: true });
        await fs.writeFile(outputFile, JSON.stringify(result, null, 2));
        
        spinner.succeed('Dashboard analysis complete!');
        
        // Display summary
        console.log();
        console.log(chalk.bold('📈 Dashboard Summary:'));
        console.log(`   • Reports: ${result.reports?.length || 0}`);
        console.log(`   • Fields: ${result.fields?.length || 0}`);
        console.log(`   • Objects: ${result.objects?.length || 0}`);
        console.log(`   • Formulas: ${result.formulas?.length || 0}`);
        console.log();
        console.log(chalk.green(`✅ Results saved to: ${outputFile}`));
        
        // Show migration readiness
        if (result.migrationReadiness) {
            console.log();
            console.log(chalk.bold('🚀 Migration Readiness:'));
            console.log(`   • Status: ${result.migrationReadiness.status}`);
            console.log(`   • Complexity: ${result.migrationReadiness.complexity}`);
            if (result.migrationReadiness.warnings?.length > 0) {
                console.log(chalk.yellow('   ⚠️ Warnings:'));
                result.migrationReadiness.warnings.forEach(w => {
                    console.log(`      - ${w}`);
                });
            }
        }
        
    } catch (error) {
        spinner.fail(`Dashboard analysis failed: ${error.message}`);
        if (options.verbose) {
            console.error(chalk.red(error.stack));
        }
        process.exit(1);
    }
}

/**
 * Run health check
 *
 * Queries Salesforce org for component counts and permission status.
 *
 * @param {Object} options - Command line options
 * @param {string} options.org - Org alias
 * @param {boolean} [options.verbose] - Verbose output
 * @param {boolean} [options.dryRun] - Dry run mode
 *
 * @throws {DataAccessError} When queries fail (org connection, invalid query, permissions)
 *
 * @example
 * await runHealthCheck({ org: 'production', verbose: true });
 */
async function runHealthCheck(options) {
    console.log(chalk.cyan('🏥 Frontend Health Check'));
    console.log(chalk.bold(`🎯 Target Org: ${options.org}`));
    console.log();
    
    const spinner = ora('Checking frontend components...').start();
    
    try {
        const governance = new GovernanceManager({
            orgAlias: options.org,
            dryRun: options.dryRun
        });
        
        // Check permissions
        spinner.text = 'Checking permissions...';
        const perms = await governance.checkPermissions();
        
        // Quick component counts
        spinner.text = 'Counting components...';
        const { execSync } = require('child_process');
        
        const counts = {
            flows: 0,
            lwc: 0,
            aura: 0,
            vf: 0,
            apex: 0,
            dashboards: 0,
            reports: 0
        };
        
        // Count flows
        try {
            const flowResult = execSync(
                `sf data query --query "SELECT COUNT() FROM FlowDefinition" --target-org ${options.org} --json`,
                { encoding: 'utf8' }
            );
            counts.flows = JSON.parse(flowResult).result?.totalSize || 0;
        } catch (e) {
            throw new DataAccessError(
                'FlowDefinition',
                `Failed to query flows: ${e.message}`,
                {
                    org: options.org,
                    query: 'SELECT COUNT() FROM FlowDefinition',
                    command: 'sf data query',
                    originalError: e.message
                }
            );
        }
        
        // Count LWC
        try {
            const lwcResult = execSync(
                `sf data query --query "SELECT COUNT() FROM LightningComponentBundle" --use-tooling-api --target-org ${options.org} --json`,
                { encoding: 'utf8' }
            );
            counts.lwc = JSON.parse(lwcResult).result?.totalSize || 0;
        } catch (e) {
            throw new DataAccessError(
                'LightningComponentBundle',
                `Failed to query Lightning Web Components: ${e.message}`,
                {
                    org: options.org,
                    query: 'SELECT COUNT() FROM LightningComponentBundle',
                    command: 'sf data query --use-tooling-api',
                    originalError: e.message
                }
            );
        }
        
        // Count Apex
        try {
            const apexResult = execSync(
                `sf data query --query "SELECT COUNT() FROM ApexClass WHERE Status = 'Active'" --use-tooling-api --target-org ${options.org} --json`,
                { encoding: 'utf8' }
            );
            counts.apex = JSON.parse(apexResult).result?.totalSize || 0;
        } catch (e) {
            throw new DataAccessError(
                'ApexClass',
                `Failed to query Apex classes: ${e.message}`,
                {
                    org: options.org,
                    query: "SELECT COUNT() FROM ApexClass WHERE Status = 'Active'",
                    command: 'sf data query --use-tooling-api',
                    originalError: e.message
                }
            );
        }
        
        spinner.succeed('Health check complete!');
        
        // Display results
        console.log();
        console.log(chalk.bold('📊 Component Summary:'));
        console.log(`   • Flows: ${counts.flows}`);
        console.log(`   • Lightning Web Components: ${counts.lwc}`);
        console.log(`   • Aura Components: ${counts.aura}`);
        console.log(`   • Visualforce Pages: ${counts.vf}`);
        console.log(`   • Apex Classes: ${counts.apex}`);
        
        console.log();
        console.log(chalk.bold('🔐 Permissions:'));
        for (const [perm, hasAccess] of Object.entries(perms)) {
            const icon = hasAccess ? '✅' : '❌';
            const color = hasAccess ? chalk.green : chalk.red;
            console.log(color(`   ${icon} ${perm}`));
        }
        
        // Health score
        const healthScore = calculateHealthScore(counts, perms);
        console.log();
        console.log(chalk.bold('🏆 Health Score: ') + getHealthScoreColor(healthScore));
        
        // Recommendations
        if (healthScore < 80) {
            console.log();
            console.log(chalk.yellow('💡 Recommendations:'));
            if (!perms.eventMonitoring) {
                console.log('   • Enable Event Monitoring for better runtime analysis');
            }
            if (!perms.analytics) {
                console.log('   • Grant Analytics API access for dashboard analysis');
            }
            if (counts.flows > 100) {
                console.log('   • Consider consolidating flows (>100 detected)');
            }
        }
        
    } catch (error) {
        spinner.fail(`Health check failed: ${error.message}`);
        if (options.verbose) {
            console.error(chalk.red(error.stack));
        }
        process.exit(1);
    }
}

/**
 * Analyze component impact
 */
async function analyzeImpact(component, options) {
    console.log(chalk.cyan('🎯 Impact Analysis'));
    console.log(chalk.bold(`📦 Component: ${component}`));
    console.log(chalk.bold(`🎯 Target Org: ${options.org}`));
    console.log();
    
    const spinner = ora('Analyzing component dependencies...').start();
    
    try {
        // Load existing analysis or run new one
        const analysisFile = path.join(options.output, 'graph.json');
        let graphData;
        
        if (await fileExists(analysisFile)) {
            spinner.text = 'Loading existing analysis...';
            const content = await fs.readFile(analysisFile, 'utf8');
            graphData = JSON.parse(content);
        } else {
            spinner.text = 'Running new analysis...';
            const orchestrator = new FrontendArchitectureOrchestrator({
                orgAlias: options.org,
                outputDir: options.output,
                runtime: false
            });
            const result = await orchestrator.orchestrate();
            graphData = result.graph;
        }
        
        spinner.text = 'Calculating impact...';
        
        // Find component in graph
        const targetNode = graphData.nodes.find(n => 
            n.id === component || 
            n.name === component ||
            n.id.endsWith(`:${component}`)
        );
        
        if (!targetNode) {
            spinner.fail(`Component not found: ${component}`);
            console.log(chalk.yellow('Available components:'));
            graphData.nodes.slice(0, 10).forEach(n => {
                console.log(`   • ${n.id}`);
            });
            return;
        }
        
        // Find all connected components
        const impactedNodes = new Set();
        const impactedEdges = [];
        
        // Direct connections
        graphData.edges.forEach(edge => {
            if (edge.source === targetNode.id) {
                impactedNodes.add(edge.target);
                impactedEdges.push({ ...edge, impact: 'direct' });
            }
            if (edge.target === targetNode.id) {
                impactedNodes.add(edge.source);
                impactedEdges.push({ ...edge, impact: 'direct' });
            }
        });
        
        // Indirect connections (2 levels deep)
        const directNodes = new Set(impactedNodes);
        directNodes.forEach(nodeId => {
            graphData.edges.forEach(edge => {
                if (edge.source === nodeId && !impactedNodes.has(edge.target)) {
                    impactedNodes.add(edge.target);
                    impactedEdges.push({ ...edge, impact: 'indirect' });
                }
                if (edge.target === nodeId && !impactedNodes.has(edge.source)) {
                    impactedNodes.add(edge.source);
                    impactedEdges.push({ ...edge, impact: 'indirect' });
                }
            });
        });
        
        spinner.succeed('Impact analysis complete!');
        
        // Display results
        console.log();
        console.log(chalk.bold('📊 Impact Summary:'));
        console.log(`   • Component Type: ${targetNode.type}`);
        console.log(`   • Direct Impact: ${directNodes.size} components`);
        console.log(`   • Total Impact: ${impactedNodes.size} components`);
        
        // Group by type
        const impactByType = {};
        impactedNodes.forEach(nodeId => {
            const node = graphData.nodes.find(n => n.id === nodeId);
            if (node) {
                impactByType[node.type] = (impactByType[node.type] || 0) + 1;
            }
        });
        
        console.log();
        console.log(chalk.bold('🔍 Impact by Type:'));
        Object.entries(impactByType).forEach(([type, count]) => {
            console.log(`   • ${type}: ${count}`);
        });
        
        // High-risk impacts
        const highRisk = impactedNodes.size > 10 ? chalk.red('HIGH') :
                        impactedNodes.size > 5 ? chalk.yellow('MEDIUM') :
                        chalk.green('LOW');
        
        console.log();
        console.log(chalk.bold('⚠️ Risk Level: ') + highRisk);
        
        // Save impact report
        const impactReport = {
            component: targetNode,
            directImpact: Array.from(directNodes),
            totalImpact: Array.from(impactedNodes),
            edges: impactedEdges,
            impactByType,
            riskLevel: highRisk,
            timestamp: new Date().toISOString()
        };
        
        const reportFile = path.join(
            options.output,
            `impact-${component.replace(/[^a-zA-Z0-9]/g, '_')}.json`
        );
        
        await fs.mkdir(options.output, { recursive: true });
        await fs.writeFile(reportFile, JSON.stringify(impactReport, null, 2));
        
        console.log();
        console.log(chalk.green(`✅ Impact report saved to: ${reportFile}`));
        
    } catch (error) {
        spinner.fail(`Impact analysis failed: ${error.message}`);
        if (options.verbose) {
            console.error(chalk.red(error.stack));
        }
        process.exit(1);
    }
}

/**
 * Compare two analyses
 */
async function compareAnalyses(file1, file2) {
    console.log(chalk.cyan('🔄 Comparing Analyses'));
    console.log();
    
    try {
        const data1 = JSON.parse(await fs.readFile(file1, 'utf8'));
        const data2 = JSON.parse(await fs.readFile(file2, 'utf8'));
        
        const nodes1 = new Set(data1.nodes.map(n => n.id));
        const nodes2 = new Set(data2.nodes.map(n => n.id));
        
        const added = Array.from(nodes2).filter(id => !nodes1.has(id));
        const removed = Array.from(nodes1).filter(id => !nodes2.has(id));
        
        console.log(chalk.bold('📊 Comparison Results:'));
        console.log(`   • Analysis 1: ${nodes1.size} components`);
        console.log(`   • Analysis 2: ${nodes2.size} components`);
        console.log(`   • Added: ${added.length}`);
        console.log(`   • Removed: ${removed.length}`);
        
        if (added.length > 0) {
            console.log();
            console.log(chalk.green('➕ Added Components:'));
            added.slice(0, 10).forEach(id => {
                console.log(`   • ${id}`);
            });
            if (added.length > 10) {
                console.log(`   ... and ${added.length - 10} more`);
            }
        }
        
        if (removed.length > 0) {
            console.log();
            console.log(chalk.red('➖ Removed Components:'));
            removed.slice(0, 10).forEach(id => {
                console.log(`   • ${id}`);
            });
            if (removed.length > 10) {
                console.log(`   ... and ${removed.length - 10} more`);
            }
        }
        
    } catch (error) {
        console.error(chalk.red(`Comparison failed: ${error.message}`));
        process.exit(1);
    }
}

/**
 * Display analysis results
 */
function displayResults(result, options) {
    console.log();
    console.log(chalk.bold('📊 Analysis Results:'));
    console.log(result.summary);
    
    if (result.warnings?.length > 0 && options.verbose) {
        console.log();
        console.log(chalk.yellow('⚠️ Warnings:'));
        result.warnings.forEach(w => {
            console.log(`   • ${w.message}`);
        });
    }
    
    console.log();
    console.log(chalk.green('✅ Output Files:'));
    result.outputFiles?.forEach(file => {
        console.log(`   • ${file}`);
    });
}

/**
 * Generate HTML report
 */
async function generateHTMLReport(result, outputDir) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Frontend Architecture Analysis</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        .metric { 
            display: inline-block; 
            margin: 10px; 
            padding: 15px; 
            background: #f5f5f5; 
            border-radius: 5px; 
        }
        .metric-value { font-size: 24px; font-weight: bold; color: #0070f3; }
        .metric-label { color: #666; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
    </style>
</head>
<body>
    <h1>Frontend Architecture Analysis Report</h1>
    <p>Generated: ${new Date().toISOString()}</p>
    
    <div class="metrics">
        <div class="metric">
            <div class="metric-value">${result.metrics?.totalNodes || 0}</div>
            <div class="metric-label">Components</div>
        </div>
        <div class="metric">
            <div class="metric-value">${result.metrics?.totalEdges || 0}</div>
            <div class="metric-label">Relationships</div>
        </div>
        <div class="metric">
            <div class="metric-value">${result.metrics?.avgDegree?.toFixed(2) || 0}</div>
            <div class="metric-label">Avg Connectivity</div>
        </div>
    </div>
    
    <h2>Component Breakdown</h2>
    <table>
        <tr><th>Type</th><th>Count</th></tr>
        ${Object.entries(result.metrics?.nodesByType || {})
            .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
            .join('')}
    </table>
</body>
</html>
    `;
    
    const htmlFile = path.join(outputDir, 'report.html');
    await fs.writeFile(htmlFile, html);
    console.log(chalk.green(`   • HTML report: ${htmlFile}`));
}

/**
 * Calculate health score
 */
function calculateHealthScore(counts, perms) {
    let score = 100;
    
    // Deduct for missing permissions
    if (!perms.api) score -= 20;
    if (!perms.tooling) score -= 20;
    if (!perms.eventMonitoring) score -= 10;
    if (!perms.analytics) score -= 10;
    
    // Deduct for excessive components
    if (counts.flows > 100) score -= 10;
    if (counts.apex > 500) score -= 5;
    
    return Math.max(0, score);
}

/**
 * Get health score color
 */
function getHealthScoreColor(score) {
    if (score >= 80) return chalk.green(`${score}/100`);
    if (score >= 60) return chalk.yellow(`${score}/100`);
    return chalk.red(`${score}/100`);
}

/**
 * Check if file exists
 */
async function fileExists(path) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no arguments
if (process.argv.length === 2) {
    program.help();
}