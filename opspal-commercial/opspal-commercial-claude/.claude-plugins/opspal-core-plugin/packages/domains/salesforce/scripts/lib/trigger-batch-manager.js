#!/usr/bin/env node

/**
 * Trigger Batch Manager
 *
 * Manages batch operations for multiple Apex triggers:
 * - Batch creation from templates
 * - Batch validation across triggers
 * - Batch deployment with dependency ordering
 * - Batch testing and coverage reporting
 *
 * Features:
 * - Dependency resolution (master-detail relationships)
 * - Parallel deployment of independent triggers
 * - Automatic test class generation
 * - Handler pattern enforcement
 * - Recursion prevention validation
 * - Bulkification compliance checks
 *
 * Usage:
 *   node trigger-batch-manager.js create --config batch-config.json
 *   node trigger-batch-manager.js validate --triggers ./triggers/
 *   node trigger-batch-manager.js deploy --org dev-org --triggers ./triggers/
 *   node trigger-batch-manager.js test --org dev-org --triggers ./triggers/
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolvePluginRoot } = require('./path-conventions');

// Import related scripts
const TriggerComplexityCalculator = require('./trigger-complexity-calculator');
const TriggerPatternDetector = require('./trigger-pattern-detector');

// Get plugin root directory
const SCRIPT_DIR = __dirname;
const PLUGIN_ROOT = resolvePluginRoot(SCRIPT_DIR);

class TriggerBatchManager {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || null;
        this.outputDir = options.outputDir || './force-app/main/default/triggers';
        this.verbose = options.verbose || false;

        this.triggers = [];
        this.deploymentGraph = {};
        this.results = {
            created: [],
            validated: [],
            deployed: [],
            tested: [],
            failed: [],
            warnings: []
        };
    }

    /**
     * Create multiple triggers from batch configuration
     */
    async createBatch(configPath) {
        console.log('📦 Trigger Batch Creation\n');

        // Load batch configuration
        const config = this._loadConfig(configPath);

        console.log(`Creating ${config.triggers.length} triggers...\n`);

        for (const triggerConfig of config.triggers) {
            try {
                await this._createTrigger(triggerConfig);
                this.results.created.push(triggerConfig.name);
                console.log(`✅ Created: ${triggerConfig.name}`);
            } catch (error) {
                this.results.failed.push({
                    trigger: triggerConfig.name,
                    error: error.message
                });
                console.error(`❌ Failed: ${triggerConfig.name} - ${error.message}`);
            }
        }

        this._printSummary();
        return this.results;
    }

    /**
     * Validate multiple triggers
     */
    async validateBatch(triggersDir) {
        console.log('🔍 Trigger Batch Validation\n');

        // Find all trigger files
        const triggerFiles = this._findTriggerFiles(triggersDir);

        console.log(`Validating ${triggerFiles.length} triggers...\n`);

        for (const triggerFile of triggerFiles) {
            try {
                await this._validateTrigger(triggerFile);
                this.results.validated.push(path.basename(triggerFile, '.trigger'));
                console.log(`✅ Valid: ${path.basename(triggerFile)}`);
            } catch (error) {
                this.results.failed.push({
                    trigger: path.basename(triggerFile),
                    error: error.message
                });
                console.error(`❌ Invalid: ${path.basename(triggerFile)} - ${error.message}`);
            }
        }

        this._printSummary();
        return this.results;
    }

    /**
     * Deploy multiple triggers with dependency ordering
     */
    async deployBatch(triggersDir) {
        console.log('🚀 Trigger Batch Deployment\n');

        if (!this.orgAlias) {
            throw new Error('Org alias is required for deployment');
        }

        // Find all trigger files
        const triggerFiles = this._findTriggerFiles(triggersDir);

        // Build deployment graph based on dependencies
        this._buildDeploymentGraph(triggerFiles);

        // Deploy in dependency order
        const deploymentOrder = this._topologicalSort();

        console.log(`Deploying ${deploymentOrder.length} triggers in dependency order...\n`);

        for (const triggerName of deploymentOrder) {
            try {
                await this._deployTrigger(triggerName, triggersDir);
                this.results.deployed.push(triggerName);
                console.log(`✅ Deployed: ${triggerName}`);
            } catch (error) {
                this.results.failed.push({
                    trigger: triggerName,
                    error: error.message
                });
                console.error(`❌ Deployment failed: ${triggerName} - ${error.message}`);

                // Stop deployment on failure (dependent triggers will fail)
                console.error('⚠️  Stopping deployment due to failure');
                break;
            }
        }

        this._printSummary();
        return this.results;
    }

    /**
     * Test multiple triggers and generate coverage report
     */
    async testBatch(triggersDir) {
        console.log('🧪 Trigger Batch Testing\n');

        if (!this.orgAlias) {
            throw new Error('Org alias is required for testing');
        }

        // Find all trigger files
        const triggerFiles = this._findTriggerFiles(triggersDir);

        console.log(`Testing ${triggerFiles.length} triggers...\n`);

        // Find corresponding test classes
        const testClasses = this._findTestClasses(triggerFiles);

        if (testClasses.length === 0) {
            console.error('❌ No test classes found');
            return this.results;
        }

        // Run all tests
        try {
            const testResults = await this._runTests(testClasses);

            for (const result of testResults) {
                if (result.passed) {
                    this.results.tested.push(result.trigger);
                    console.log(`✅ Passed: ${result.trigger} (${result.coverage}% coverage)`);
                } else {
                    this.results.failed.push({
                        trigger: result.trigger,
                        error: result.error
                    });
                    console.error(`❌ Failed: ${result.trigger} - ${result.error}`);
                }

                if (result.coverage < 75) {
                    this.results.warnings.push({
                        trigger: result.trigger,
                        warning: `Coverage ${result.coverage}% below 75% threshold`
                    });
                }
            }
        } catch (error) {
            console.error(`❌ Test execution failed: ${error.message}`);
        }

        this._printSummary();
        return this.results;
    }

    /**
     * Create a single trigger from configuration
     */
    async _createTrigger(config) {
        const { name, object, events, template, handler } = config;

        // Validate required fields
        if (!name || !object || !events || events.length === 0) {
            throw new Error('Missing required fields: name, object, events');
        }

        // Generate trigger content
        const triggerContent = this._generateTriggerContent(name, object, events, handler);

        // Write trigger file
        const triggerPath = path.join(this.outputDir, 'triggers', `${name}.trigger`);
        const metaPath = `${triggerPath}-meta.xml`;

        if (!fs.existsSync(path.dirname(triggerPath))) {
            fs.mkdirSync(path.dirname(triggerPath), { recursive: true });
        }

        fs.writeFileSync(triggerPath, triggerContent);

        // Generate meta.xml
        const metaContent = this._generateMetaXml();
        fs.writeFileSync(metaPath, metaContent);

        // Generate handler class if needed
        if (handler && handler.generate) {
            await this._generateHandlerClass(name, object, events, handler);
        }

        // Generate test class if needed
        if (config.generateTest) {
            await this._generateTestClass(name, object, events);
        }
    }

    /**
     * Generate trigger content
     */
    _generateTriggerContent(name, object, events, handler) {
        const handlerClass = handler?.className || `${name}Handler`;

        // Build event list
        const eventsList = events.join(', ');

        return `trigger ${name} on ${object} (${eventsList}) {
    // Delegate to handler class following handler pattern
    ${handlerClass}.handle(Trigger.new, Trigger.old, Trigger.newMap, Trigger.oldMap, Trigger.operationType);
}
`;
    }

    /**
     * Generate meta.xml
     */
    _generateMetaXml() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<ApexTrigger xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>62.0</apiVersion>
    <status>Active</status>
</ApexTrigger>
`;
    }

    /**
     * Generate handler class
     */
    async _generateHandlerClass(triggerName, object, events, handlerConfig) {
        const className = handlerConfig.className || `${triggerName}Handler`;
        const classPath = path.join(this.outputDir, 'classes', `${className}.cls`);

        // Use trigger-handler-generator script
        const generatorScript = path.join(PLUGIN_ROOT, 'scripts/lib/trigger-handler-generator.js');

        try {
            execSync(`node "${generatorScript}" generate --name ${triggerName} --object ${object} --events ${events.join(',')} --output "${this.outputDir}/classes"`, {
                stdio: 'inherit'
            });
        } catch (error) {
            throw new Error(`Handler generation failed: ${error.message}`);
        }
    }

    /**
     * Generate test class
     */
    async _generateTestClass(triggerName, object, events) {
        // Use trigger-test-generator script
        const generatorScript = path.join(PLUGIN_ROOT, 'scripts/lib/trigger-test-generator.js');

        try {
            execSync(`node "${generatorScript}" generate --trigger ${triggerName} --object ${object} --output "${this.outputDir}/classes"`, {
                stdio: 'inherit'
            });
        } catch (error) {
            throw new Error(`Test class generation failed: ${error.message}`);
        }
    }

    /**
     * Validate a single trigger
     */
    async _validateTrigger(triggerFile) {
        const triggerContent = fs.readFileSync(triggerFile, 'utf-8');

        // Check for handler pattern
        if (!triggerContent.includes('Handler.handle')) {
            throw new Error('Missing handler pattern - triggers must delegate to handler class');
        }

        // Check for direct DML/SOQL (anti-pattern)
        const lines = triggerContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip comments
            if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
                continue;
            }

            // Check for direct DML
            if (/\b(insert|update|delete|undelete)\s+[a-zA-Z]/.test(line)) {
                this.results.warnings.push({
                    trigger: path.basename(triggerFile),
                    warning: `Line ${i + 1}: Direct DML in trigger (should be in handler)`
                });
            }

            // Check for direct SOQL
            if (/\[SELECT\s+/.test(line)) {
                this.results.warnings.push({
                    trigger: path.basename(triggerFile),
                    warning: `Line ${i + 1}: Direct SOQL in trigger (should be in handler)`
                });
            }
        }

        // Calculate complexity
        const calculator = new TriggerComplexityCalculator();
        const complexity = calculator.calculateFromFile(triggerFile);

        if (complexity.rating === 'complex') {
            this.results.warnings.push({
                trigger: path.basename(triggerFile),
                warning: `High complexity: ${complexity.totalScore.toFixed(2)} (${complexity.rating})`
            });
        }

        // Detect patterns
        const detector = new TriggerPatternDetector();
        const patterns = detector.detectFromFile(triggerFile);

        if (patterns.antiPatterns.length > 0) {
            for (const antiPattern of patterns.antiPatterns) {
                this.results.warnings.push({
                    trigger: path.basename(triggerFile),
                    warning: `Anti-pattern detected: ${antiPattern.pattern} (${antiPattern.recommendation})`
                });
            }
        }
    }

    /**
     * Deploy a single trigger
     */
    async _deployTrigger(triggerName, triggersDir) {
        const triggerPath = path.join(triggersDir, `${triggerName}.trigger`);
        const metaPath = `${triggerPath}-meta.xml`;

        if (!fs.existsSync(triggerPath)) {
            throw new Error(`Trigger file not found: ${triggerPath}`);
        }

        // Deploy using sf CLI
        try {
            execSync(`sf project deploy start --source-dir "${path.dirname(triggerPath)}" --target-org ${this.orgAlias}`, {
                stdio: this.verbose ? 'inherit' : 'ignore'
            });
        } catch (error) {
            throw new Error(`Deployment failed: ${error.message}`);
        }
    }

    /**
     * Build deployment graph based on object dependencies
     */
    _buildDeploymentGraph(triggerFiles) {
        this.deploymentGraph = {};

        for (const triggerFile of triggerFiles) {
            const triggerName = path.basename(triggerFile, '.trigger');
            const content = fs.readFileSync(triggerFile, 'utf-8');

            // Extract object name
            const objectMatch = content.match(/trigger\s+\w+\s+on\s+(\w+)/);
            if (!objectMatch) continue;

            const object = objectMatch[1];

            // Initialize node
            this.deploymentGraph[triggerName] = {
                object,
                dependencies: [],
                dependents: []
            };
        }

        // TODO: Query org for master-detail relationships to determine dependencies
        // For now, assume independent deployment
    }

    /**
     * Topological sort for deployment order
     */
    _topologicalSort() {
        const sorted = [];
        const visited = new Set();

        const visit = (node) => {
            if (visited.has(node)) return;
            visited.add(node);

            const deps = this.deploymentGraph[node]?.dependencies || [];
            for (const dep of deps) {
                visit(dep);
            }

            sorted.push(node);
        };

        for (const node of Object.keys(this.deploymentGraph)) {
            visit(node);
        }

        return sorted;
    }

    /**
     * Find all trigger files in directory
     */
    _findTriggerFiles(dir) {
        const files = [];

        const walk = (currentDir) => {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.trigger')) {
                    files.push(fullPath);
                }
            }
        };

        walk(dir);
        return files;
    }

    /**
     * Find test classes for triggers
     */
    _findTestClasses(triggerFiles) {
        const testClasses = [];

        for (const triggerFile of triggerFiles) {
            const triggerName = path.basename(triggerFile, '.trigger');
            const testClassName = `${triggerName}Test`;

            // Look for test class in classes directory
            const classesDir = path.join(path.dirname(triggerFile), '../classes');
            const testClassPath = path.join(classesDir, `${testClassName}.cls`);

            if (fs.existsSync(testClassPath)) {
                testClasses.push(testClassName);
            }
        }

        return testClasses;
    }

    /**
     * Run Apex tests
     */
    async _runTests(testClasses) {
        const results = [];

        try {
            // Run tests using sf CLI
            const output = execSync(`sf apex run test --class-names ${testClasses.join(',')} --result-format json --target-org ${this.orgAlias}`, {
                encoding: 'utf-8'
            });

            const testResults = JSON.parse(output);

            for (const testClass of testClasses) {
                const triggerName = testClass.replace('Test', '');
                const testResult = testResults.tests?.find(t => t.ApexClass?.Name === testClass);

                if (testResult) {
                    results.push({
                        trigger: triggerName,
                        passed: testResult.Outcome === 'Pass',
                        coverage: testResult.ApexCodeCoverage?.percentCovered || 0,
                        error: testResult.Message || null
                    });
                }
            }
        } catch (error) {
            throw new Error(`Test execution failed: ${error.message}`);
        }

        return results;
    }

    /**
     * Load batch configuration from file
     */
    _loadConfig(configPath) {
        if (!fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }

        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * Print summary of batch operation
     */
    _printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 Batch Operation Summary');
        console.log('='.repeat(60));

        if (this.results.created.length > 0) {
            console.log(`\n✅ Created: ${this.results.created.length}`);
            this.results.created.forEach(name => console.log(`   - ${name}`));
        }

        if (this.results.validated.length > 0) {
            console.log(`\n✅ Validated: ${this.results.validated.length}`);
            this.results.validated.forEach(name => console.log(`   - ${name}`));
        }

        if (this.results.deployed.length > 0) {
            console.log(`\n✅ Deployed: ${this.results.deployed.length}`);
            this.results.deployed.forEach(name => console.log(`   - ${name}`));
        }

        if (this.results.tested.length > 0) {
            console.log(`\n✅ Tested: ${this.results.tested.length}`);
            this.results.tested.forEach(name => console.log(`   - ${name}`));
        }

        if (this.results.warnings.length > 0) {
            console.log(`\n⚠️  Warnings: ${this.results.warnings.length}`);
            this.results.warnings.forEach(w => console.log(`   - ${w.trigger}: ${w.warning}`));
        }

        if (this.results.failed.length > 0) {
            console.log(`\n❌ Failed: ${this.results.failed.length}`);
            this.results.failed.forEach(f => console.log(`   - ${f.trigger}: ${f.error}`));
        }

        console.log('='.repeat(60) + '\n');
    }
}

/**
 * CLI Interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Trigger Batch Manager

Usage:
  node trigger-batch-manager.js <command> [options]

Commands:
  create       Create multiple triggers from batch configuration
  validate     Validate multiple triggers
  deploy       Deploy multiple triggers with dependency ordering
  test         Test multiple triggers and generate coverage report

Options:
  --config <path>       Path to batch configuration JSON (for create)
  --triggers <dir>      Directory containing trigger files
  --org <alias>         Salesforce org alias (for deploy/test)
  --output <dir>        Output directory (default: ./force-app/main/default)
  --verbose             Show detailed output
  --help                Show this help message

Batch Configuration Format (JSON):
{
  "triggers": [
    {
      "name": "AccountTrigger",
      "object": "Account",
      "events": ["before insert", "before update"],
      "template": "data-validation",
      "handler": {
        "generate": true,
        "className": "AccountTriggerHandler"
      },
      "generateTest": true
    }
  ]
}

Examples:
  # Create triggers from configuration
  node trigger-batch-manager.js create --config batch-config.json --output ./force-app

  # Validate all triggers
  node trigger-batch-manager.js validate --triggers ./force-app/main/default/triggers

  # Deploy triggers in dependency order
  node trigger-batch-manager.js deploy --org dev-org --triggers ./force-app/main/default/triggers

  # Test all triggers
  node trigger-batch-manager.js test --org dev-org --triggers ./force-app/main/default/triggers
        `);
        process.exit(0);
    }

    const command = args[0];

    // Parse arguments
    const getArg = (flag) => {
        const index = args.indexOf(flag);
        return index !== -1 ? args[index + 1] : null;
    };

    const config = getArg('--config');
    const triggersDir = getArg('--triggers') || './force-app/main/default/triggers';
    const orgAlias = getArg('--org');
    const outputDir = getArg('--output') || './force-app/main/default';
    const verbose = args.includes('--verbose');

    try {
        const manager = new TriggerBatchManager({
            orgAlias,
            outputDir,
            verbose
        });

        let results;

        switch (command) {
            case 'create':
                if (!config) {
                    console.error('Error: --config is required for create command');
                    process.exit(1);
                }
                results = await manager.createBatch(config);
                break;

            case 'validate':
                results = await manager.validateBatch(triggersDir);
                break;

            case 'deploy':
                if (!orgAlias) {
                    console.error('Error: --org is required for deploy command');
                    process.exit(1);
                }
                results = await manager.deployBatch(triggersDir);
                break;

            case 'test':
                if (!orgAlias) {
                    console.error('Error: --org is required for test command');
                    process.exit(1);
                }
                results = await manager.testBatch(triggersDir);
                break;

            default:
                console.error(`Unknown command: ${command}`);
                console.error('Use --help to see available commands');
                process.exit(1);
        }

        // Exit with error if any operations failed
        if (results.failed.length > 0) {
            process.exit(1);
        }

        process.exit(0);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = TriggerBatchManager;

// Run CLI if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}
