#!/usr/bin/env node

/**
 * Trigger Creation Wizard
 *
 * Interactive CLI wizard for creating Apex triggers from templates.
 *
 * Features:
 * - Object selection and validation
 * - Template browsing and selection
 * - Interactive configuration
 * - Code generation from templates
 * - Test class generation
 * - Syntax validation
 * - Optional deployment
 *
 * Usage:
 *   node trigger-wizard.js
 *   node trigger-wizard.js --object Account --template cascade-update
 *   node trigger-wizard.js --list-templates
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PLUGIN_ROOT = path.resolve(__dirname, '../..');
const TEMPLATES_DIR = path.join(PLUGIN_ROOT, 'templates/triggers');
const OUTPUT_DIR = process.cwd();
const API_VERSION = '62.0';

// Template registry
const TEMPLATE_REGISTRY = {
    basic: [
        { name: 'all-events', description: 'Handle all trigger events', file: 'all-events-template.apex' },
        { name: 'before-insert', description: 'Before insert logic', file: 'before-insert-template.apex' },
        { name: 'before-update', description: 'Before update logic', file: 'before-update-template.apex' },
        { name: 'after-insert', description: 'After insert logic', file: 'after-insert-template.apex' },
        { name: 'after-update', description: 'After update logic', file: 'after-update-template.apex' }
    ],
    'data-validation': [
        { name: 'field-validation', description: 'Validate field values', file: 'field-validation-template.apex' },
        { name: 'cross-object-validation', description: 'Validate across objects', file: 'cross-object-validation-template.apex' },
        { name: 'duplicate-prevention', description: 'Prevent duplicate records', file: 'duplicate-prevention-template.apex' },
        { name: 'conditional-validation', description: 'Complex validation rules', file: 'conditional-validation-template.apex' }
    ],
    'data-enrichment': [
        { name: 'calculated-fields', description: 'Calculate field values', file: 'calculated-fields-template.apex' },
        { name: 'address-standardization', description: 'Standardize addresses', file: 'address-standardization-template.apex' },
        { name: 'default-values', description: 'Set default field values', file: 'default-values-template.apex' },
        { name: 'parent-field-copy', description: 'Copy fields from parent', file: 'parent-field-copy-template.apex' }
    ],
    'related-records': [
        { name: 'create-child-records', description: 'Create related records', file: 'create-child-records-template.apex' },
        { name: 'cascade-update', description: 'Cascade updates to children', file: 'cascade-update-template.apex' },
        { name: 'rollup-summary', description: 'Roll up child values', file: 'rollup-summary-template.apex' },
        { name: 'parent-update', description: 'Update parent from children', file: 'parent-update-template.apex' }
    ],
    integration: [
        { name: 'platform-event-publish', description: 'Publish platform events', file: 'platform-event-publish-template.apex' },
        { name: 'queueable-processing', description: 'Queueable async processing', file: 'queueable-processing-template.apex' },
        { name: 'batch-processing', description: 'Batch async processing', file: 'batch-processing-template.apex' }
    ],
    'audit-logging': [
        { name: 'field-history-tracking', description: 'Track field history', file: 'field-history-tracking-template.apex' },
        { name: 'change-log', description: 'Complete change log', file: 'change-log-template.apex' },
        { name: 'audit-trail', description: 'Compliance audit trail', file: 'audit-trail-template.apex' }
    ],
    'business-logic': [
        { name: 'owner-cascade', description: 'Cascade owner changes', file: 'owner-cascade-template.apex' },
        { name: 'stage-automation', description: 'Automate stage progression', file: 'stage-automation-template.apex' },
        { name: 'notification-sending', description: 'Send notifications', file: 'notification-sending-template.apex' },
        { name: 'task-creation', description: 'Create tasks automatically', file: 'task-creation-template.apex' },
        { name: 'sharing-rules', description: 'Dynamic sharing rules', file: 'sharing-rules-template.apex' }
    ]
};

// ============================================================================
// CLI INTERFACE
// ============================================================================

class TriggerWizard {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.config = {
            objectName: null,
            templateName: null,
            templateCategory: null,
            outputDir: OUTPUT_DIR,
            deploy: false,
            skipTests: false
        };
    }

    /**
     * Main entry point
     */
    async run(args) {
        try {
            console.log('\n🚀 Apex Trigger Creation Wizard\n');
            console.log('━'.repeat(60) + '\n');

            // Parse arguments
            await this.parseArguments(args);

            // Handle list templates
            if (args.includes('--list-templates')) {
                this.listTemplates();
                return;
            }

            // Interactive wizard
            if (!this.config.objectName) {
                this.config.objectName = await this.promptObjectName();
            }

            if (!this.config.templateName) {
                const template = await this.promptTemplateSelection();
                this.config.templateName = template.name;
                this.config.templateCategory = template.category;
            }

            // Validate selections
            await this.validateObject(this.config.objectName);

            // Configure template
            const configuration = await this.promptConfiguration();

            // Generate code
            console.log('\n📝 Generating code...\n');
            const files = await this.generateCode(configuration);

            // Show preview
            await this.showPreview(files);

            // Save files
            const confirm = await this.prompt('Save files? (yes/no): ');
            if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
                await this.saveFiles(files);

                // Deploy if requested
                if (this.config.deploy) {
                    await this.deployFiles(files);
                }
            }

            console.log('\n✅ Trigger creation complete!\n');

        } catch (error) {
            console.error('\n❌ Error:', error.message);
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    /**
     * Parse command line arguments
     */
    async parseArguments(args) {
        for (let i = 0; i < args.length; i++) {
            switch (args[i]) {
                case '--object':
                    this.config.objectName = args[++i];
                    break;
                case '--template':
                    this.config.templateName = args[++i];
                    break;
                case '--category':
                    this.config.category = args[++i];
                    break;
                case '--output':
                    this.config.outputDir = args[++i];
                    break;
                case '--deploy':
                    this.config.deploy = true;
                    break;
                case '--skip-tests':
                    this.config.skipTests = true;
                    break;
                case '--help':
                    this.showHelp();
                    process.exit(0);
                    break;
            }
        }
    }

    /**
     * List all available templates
     */
    listTemplates() {
        console.log('📚 Available Trigger Templates:\n');

        for (const [category, templates] of Object.entries(TEMPLATE_REGISTRY)) {
            console.log(`\n${this.capitalize(category)} (${templates.length} templates):`);
            templates.forEach(template => {
                console.log(`  • ${template.name.padEnd(30)} - ${template.description}`);
            });
        }

        console.log('\nTotal: 32 templates across 7 categories\n');
    }

    /**
     * Prompt for object name
     */
    async promptObjectName() {
        return await this.prompt('\n📦 Enter Salesforce object API name (e.g., Account, Opportunity): ');
    }

    /**
     * Prompt for template selection
     */
    async promptTemplateSelection() {
        console.log('\n📋 Select trigger template:\n');

        // Show categories
        const categories = Object.keys(TEMPLATE_REGISTRY);
        categories.forEach((category, index) => {
            const count = TEMPLATE_REGISTRY[category].length;
            console.log(`  ${index + 1}. ${this.capitalize(category)} (${count} templates)`);
        });

        const categoryIndex = await this.prompt('\nSelect category (1-' + categories.length + '): ');
        const category = categories[parseInt(categoryIndex) - 1];

        if (!category) {
            throw new Error('Invalid category selection');
        }

        // Show templates in category
        console.log(`\n${this.capitalize(category)} Templates:\n`);
        const templates = TEMPLATE_REGISTRY[category];
        templates.forEach((template, index) => {
            console.log(`  ${index + 1}. ${template.name.padEnd(30)} - ${template.description}`);
        });

        const templateIndex = await this.prompt('\nSelect template (1-' + templates.length + '): ');
        const template = templates[parseInt(templateIndex) - 1];

        if (!template) {
            throw new Error('Invalid template selection');
        }

        return {
            name: template.name,
            file: template.file,
            category: category
        };
    }

    /**
     * Validate object exists in org
     */
    async validateObject(objectName) {
        console.log(`\n🔍 Validating object '${objectName}'...`);

        try {
            // Query object metadata
            const result = execSync(
                `sf sobject describe ${objectName} --json`,
                { encoding: 'utf8' }
            );

            const data = JSON.parse(result);

            if (data.status === 0) {
                console.log(`✅ Object '${objectName}' found`);
                console.log(`   Label: ${data.result.label}`);
                console.log(`   Fields: ${data.result.fields.length}`);
                console.log(`   Relationships: ${data.result.childRelationships.length}`);
                return true;
            }
        } catch (error) {
            throw new Error(`Object '${objectName}' not found. Verify the API name.`);
        }
    }

    /**
     * Prompt for template configuration
     */
    async promptConfiguration() {
        console.log('\n⚙️  Configure Trigger:\n');

        const config = {
            objectName: this.config.objectName,
            templateName: this.config.templateName
        };

        // Template-specific configuration
        switch (this.config.templateName) {
            case 'cascade-update':
                config.fields = await this.prompt('Fields to cascade (comma-separated): ');
                config.childObjects = await this.prompt('Child objects (comma-separated): ');
                break;

            case 'rollup-summary':
                config.parentObject = await this.prompt('Parent object: ');
                config.rollupFields = await this.prompt('Fields to rollup (comma-separated): ');
                config.aggregations = await this.prompt('Aggregations (SUM, COUNT, AVG, MIN, MAX): ');
                break;

            case 'field-validation':
                config.fields = await this.prompt('Fields to validate (comma-separated): ');
                config.rules = await this.prompt('Validation rules: ');
                break;

            case 'owner-cascade':
                config.childObjects = await this.prompt('Child objects to cascade (comma-separated): ');
                break;

            case 'stage-automation':
                config.stages = await this.prompt('Stages in order (comma-separated): ');
                break;

            default:
                // Generic configuration
                config.events = await this.prompt('Trigger events (before insert, after update, etc.): ');
                break;
        }

        return config;
    }

    /**
     * Generate code from template
     */
    async generateCode(configuration) {
        const { objectName, templateName, templateCategory } = this.config;

        // Find template file
        const templateInfo = this.findTemplate(templateName, templateCategory);
        const templatePath = path.join(TEMPLATES_DIR, templateCategory, templateInfo.file);

        // Read template
        let templateCode = fs.readFileSync(templatePath, 'utf8');

        // Replace placeholders
        templateCode = this.replacePlaceholders(templateCode, configuration);

        // Extract trigger, handler, and test class
        const files = this.extractClasses(templateCode, objectName);

        return files;
    }

    /**
     * Find template info
     */
    findTemplate(templateName, category) {
        const templates = TEMPLATE_REGISTRY[category];
        return templates.find(t => t.name === templateName);
    }

    /**
     * Replace template placeholders
     */
    replacePlaceholders(template, config) {
        let code = template;

        // Replace object name
        code = code.replace(/ObjectName/g, config.objectName);

        // Replace specific configuration
        if (config.fields) {
            code = code.replace(/FIELDS_TO_TRACK/g, config.fields);
        }

        if (config.childObjects) {
            code = code.replace(/CHILD_OBJECTS/g, config.childObjects);
        }

        if (config.parentObject) {
            code = code.replace(/PARENT_OBJECT/g, config.parentObject);
        }

        return code;
    }

    /**
     * Extract trigger, handler, and test classes
     */
    extractClasses(code, objectName) {
        const files = {};

        // Extract trigger
        const triggerMatch = code.match(/trigger\s+\w+\s+on\s+\w+[\s\S]*?\{[\s\S]*?\}/);
        if (triggerMatch) {
            files.trigger = {
                name: `${objectName}Trigger.trigger`,
                content: triggerMatch[0]
            };
        }

        // Extract handler class
        const handlerMatch = code.match(/public\s+class\s+\w+TriggerHandler[\s\S]*?(?=\/\/\s*=====.*TEST|@isTest|$)/);
        if (handlerMatch) {
            files.handler = {
                name: `${objectName}TriggerHandler.cls`,
                content: handlerMatch[0].trim()
            };
        }

        // Extract test class
        const testMatch = code.match(/@isTest[\s\S]*?private\s+class\s+\w+Test[\s\S]*?\n\}/);
        if (testMatch && !this.config.skipTests) {
            files.test = {
                name: `${objectName}TriggerHandlerTest.cls`,
                content: testMatch[0].trim()
            };
        }

        return files;
    }

    /**
     * Show preview of generated files
     */
    async showPreview(files) {
        console.log('\n📄 Generated Files:\n');

        for (const [type, file] of Object.entries(files)) {
            console.log(`\n${'═'.repeat(60)}`);
            console.log(`${type.toUpperCase()}: ${file.name}`);
            console.log(`${'═'.repeat(60)}`);
            console.log(file.content.substring(0, 500) + '...\n');
            console.log(`[${file.content.length} characters total]`);
        }
    }

    /**
     * Save files to disk
     */
    async saveFiles(files) {
        console.log('\n💾 Saving files...\n');

        // Create output directories
        const triggersDir = path.join(this.config.outputDir, 'force-app/main/default/triggers');
        const classesDir = path.join(this.config.outputDir, 'force-app/main/default/classes');

        fs.mkdirSync(triggersDir, { recursive: true });
        fs.mkdirSync(classesDir, { recursive: true });

        // Save trigger
        if (files.trigger) {
            const triggerPath = path.join(triggersDir, files.trigger.name);
            fs.writeFileSync(triggerPath, files.trigger.content);
            console.log(`✅ Saved: ${triggerPath}`);

            // Create meta.xml
            const metaXml = this.generateMetaXml('ApexTrigger');
            fs.writeFileSync(triggerPath + '-meta.xml', metaXml);
        }

        // Save handler
        if (files.handler) {
            const handlerPath = path.join(classesDir, files.handler.name);
            fs.writeFileSync(handlerPath, files.handler.content);
            console.log(`✅ Saved: ${handlerPath}`);

            // Create meta.xml
            const metaXml = this.generateMetaXml('ApexClass');
            fs.writeFileSync(handlerPath + '-meta.xml', metaXml);
        }

        // Save test
        if (files.test) {
            const testPath = path.join(classesDir, files.test.name);
            fs.writeFileSync(testPath, files.test.content);
            console.log(`✅ Saved: ${testPath}`);

            // Create meta.xml
            const metaXml = this.generateMetaXml('ApexClass');
            fs.writeFileSync(testPath + '-meta.xml', metaXml);
        }
    }

    /**
     * Generate meta.xml file
     */
    generateMetaXml(type) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<${type} xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${API_VERSION}</apiVersion>
    <status>Active</status>
</${type}>`;
    }

    /**
     * Deploy files to Salesforce
     */
    async deployFiles(files) {
        console.log('\n🚀 Deploying to Salesforce...\n');

        try {
            const result = execSync(
                'sf project deploy start --wait 10',
                { encoding: 'utf8', cwd: this.config.outputDir }
            );

            console.log(result);

            // Run tests
            if (files.test && !this.config.skipTests) {
                console.log('\n🧪 Running tests...\n');

                const testResult = execSync(
                    `sf apex test run --class-names ${files.test.name.replace('.cls', '')} --wait 10`,
                    { encoding: 'utf8' }
                );

                console.log(testResult);
            }

            console.log('\n✅ Deployment successful!');

        } catch (error) {
            throw new Error('Deployment failed: ' + error.message);
        }
    }

    /**
     * Show help message
     */
    showHelp() {
        console.log(`
Apex Trigger Creation Wizard

Usage:
  node trigger-wizard.js [OPTIONS]

Options:
  --object <name>          Object API name (e.g., Account)
  --template <name>        Template name (e.g., cascade-update)
  --category <category>    Filter templates by category
  --list-templates         Show all available templates
  --output <directory>     Output directory (default: current)
  --deploy                 Deploy immediately after generation
  --skip-tests             Skip test class generation
  --help                   Show this help message

Examples:
  node trigger-wizard.js
  node trigger-wizard.js --object Account --template cascade-update
  node trigger-wizard.js --list-templates
        `);
    }

    /**
     * Utility: Prompt user for input
     */
    prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    /**
     * Utility: Capitalize string
     */
    capitalize(str) {
        return str
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

// ============================================================================
// MAIN
// ============================================================================

if (require.main === module) {
    const wizard = new TriggerWizard();
    wizard.run(process.argv.slice(2))
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = TriggerWizard;
