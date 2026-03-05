#!/usr/bin/env node

/**
 * Quick Wins Integration Examples
 *
 * Demonstrates how to use the 4 Quick Win validation systems in your scripts.
 * Copy these patterns into your own scripts for robust error prevention.
 *
 * Systems included:
 * 1. CSV Schema Validator - Robust CSV parsing
 * 2. Flow Loop Variable Validator - Flow validation before deployment
 * 3. Multi-Path Resolver - Instance directory discovery
 * 4. Expectation Clarification Protocol - Agent-based (not shown here)
 *
 * @version 1.0.0
 * @date 2025-10-31
 */

const fs = require('fs');
const path = require('path');

// Import the Quick Win validators
const { RobustCSVParser, CSVSchemaError } = require('./csv-schema-validator');
const { FlowLoopValidator } = require('./flow-loop-variable-validator');
const { PathResolver } = require('./multi-path-resolver');

/**
 * Example 1: CSV Parsing with Schema Validation
 *
 * OLD WAY (FRAGILE - DO NOT USE):
 * const lines = csvContent.split('\n');
 * const row = lines[1].split(','); // Breaks on quoted fields!
 * const name = row[0]; // Breaks when column order changes!
 *
 * NEW WAY (ROBUST - USE THIS):
 */
function example1_ParseCSVRobustly(csvFilePath, requiredColumns = []) {
    console.log('\n=== Example 1: Robust CSV Parsing ===\n');

    try {
        // Step 1: Read CSV file
        const csvContent = fs.readFileSync(csvFilePath, 'utf8');

        // Step 2: Create parser with schema validation
        const parser = new RobustCSVParser();

        // Step 3: Parse with required columns check
        const rows = parser.parse(csvContent, requiredColumns, {
            skipEmptyLines: true,  // Skip blank lines
            normalizeHeaders: true  // Trim whitespace from headers
        });

        console.log(`✅ Successfully parsed ${rows.length} rows`);
        console.log(`   Columns: ${Object.keys(rows[0]).filter(k => !k.startsWith('_')).join(', ')}`);

        // Step 4: Access by header name (resilient to column reordering!)
        rows.forEach((row, index) => {
            if (index < 3) {  // Show first 3 rows as example
                console.log(`   Row ${index + 1}:`, Object.keys(row)
                    .filter(k => !k.startsWith('_'))
                    .map(k => `${k}=${row[k]}`)
                    .join(', ')
                );
            }
        });

        return rows;

    } catch (error) {
        if (error instanceof CSVSchemaError) {
            console.error(`\n❌ CSV Schema Error: ${error.message}`);
            if (error.details) {
                console.error(`   Missing columns: ${error.details.missing?.join(', ') || 'none'}`);
                console.error(`   Found columns: ${error.details.found?.join(', ') || 'none'}`);
            }
        } else {
            console.error(`\n❌ Unexpected error: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Example 2: Generate CSV from Objects
 *
 * Use this to export data reliably (handles quoting automatically)
 */
function example2_GenerateCSV(objects, outputPath, columns = null) {
    console.log('\n=== Example 2: Generate CSV from Objects ===\n');

    try {
        const parser = new RobustCSVParser();

        // Generate CSV with automatic quoting and escaping
        const csvContent = parser.generate(objects, columns);

        fs.writeFileSync(outputPath, csvContent);

        console.log(`✅ Generated CSV: ${outputPath}`);
        console.log(`   Rows: ${objects.length}`);
        console.log(`   Columns: ${columns ? columns.length : 'all'}`);

        return csvContent;

    } catch (error) {
        console.error(`\n❌ CSV generation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Example 3: Validate Flow Before Deployment
 *
 * OLD WAY (RISKY):
 * sf project deploy start --source-dir flows/
 * // Deployment fails at runtime with .null__NotFound errors!
 *
 * NEW WAY (SAFE):
 */
function example3_ValidateFlowBeforeDeployment(flowXmlPath) {
    console.log('\n=== Example 3: Flow Loop Variable Validation ===\n');

    try {
        // Step 1: Read flow XML
        const flowXML = fs.readFileSync(flowXmlPath, 'utf8');

        // Step 2: Create validator
        const validator = new FlowLoopValidator();

        // Step 3: Validate
        const result = validator.validate(flowXML);

        if (result.valid) {
            console.log('✅ Flow validation: PASSED');
            console.log(`   Loops: ${result.stats.totalLoops}`);
            console.log(`   References: ${result.stats.totalReferences}`);
            console.log(`   Invalid: ${result.stats.invalidReferences}`);
            return true;
        } else {
            console.error('❌ Flow validation: FAILED');
            console.error(validator.generateReport(result));

            // Step 4: Show auto-fixable issues
            if (result.autoFixable.length > 0) {
                console.log(`\n🔧 ${result.autoFixable.length} issues can be auto-fixed`);
                console.log('   Run with --auto-fix flag to fix automatically');
            }

            return false;
        }

    } catch (error) {
        console.error(`\n❌ Flow validation error: ${error.message}`);
        throw error;
    }
}

/**
 * Example 4: Auto-Fix Flow Issues
 */
function example4_AutoFixFlowIssues(flowXmlPath) {
    console.log('\n=== Example 4: Auto-Fix Flow Loop Variables ===\n');

    try {
        const flowXML = fs.readFileSync(flowXmlPath, 'utf8');

        // Enable auto-fix mode
        const validator = new FlowLoopValidator({ autoFix: true });

        // Validate first
        const validation = validator.validate(flowXML);

        if (validation.valid) {
            console.log('✅ No fixes needed');
            return flowXML;
        }

        // Apply fixes
        const fixResult = validator.fix(flowXML);

        if (fixResult.fixed) {
            // Save fixed version
            const fixedPath = flowXmlPath.replace('.xml', '-fixed.xml');
            fs.writeFileSync(fixedPath, fixResult.xml);

            console.log('✅ Auto-fix complete:');
            console.log(`   Fixed: ${fixResult.fixCount} occurrences`);
            console.log(`   Output: ${fixedPath}`);
            console.log('\n   Review the fixed file, then replace the original if correct.');

            return fixResult.xml;
        } else {
            console.log('⚠️  No auto-fixes applied');
            return flowXML;
        }

    } catch (error) {
        console.error(`\n❌ Auto-fix error: ${error.message}`);
        throw error;
    }
}

/**
 * Example 5: Find Instance Directory (Any Project Structure)
 *
 * OLD WAY (FRAGILE):
 * const instancePath = `instances/${orgAlias}`; // Breaks if structure changes!
 *
 * NEW WAY (ROBUST):
 */
function example5_FindInstancePath(orgAlias, platform = 'salesforce') {
    console.log('\n=== Example 5: Multi-Path Instance Resolution ===\n');

    try {
        const resolver = new PathResolver({ verbose: true });

        // Try to find instance across multiple conventions
        const instancePath = resolver.findInstancePath(orgAlias, {
            platform,  // 'salesforce' or 'hubspot'
            fromDirectory: process.cwd()
        });

        console.log(`✅ Found instance: ${instancePath}`);
        return instancePath;

    } catch (error) {
        console.error(`\n❌ Instance not found: ${error.message}`);
        // Error includes helpful suggestions for user
        throw error;
    }
}

/**
 * Example 6: Discover All Instances
 */
function example6_DiscoverAllInstances(platform = null) {
    console.log('\n=== Example 6: Discover All Instances ===\n');

    try {
        const resolver = new PathResolver();

        const instances = resolver.discoverInstances({ platform });

        console.log(`✅ Found ${instances.length} instance(s):\n`);

        instances.forEach((inst, index) => {
            console.log(`${index + 1}. ${inst.orgAlias}`);
            console.log(`   Platform: ${inst.platform}`);
            console.log(`   Path: ${inst.path}`);
            console.log('');
        });

        return instances;

    } catch (error) {
        console.error(`\n❌ Discovery error: ${error.message}`);
        throw error;
    }
}

/**
 * Example 7: Complete Workflow - CSV Import with Validation
 *
 * Combines multiple validators for robust data operations
 */
async function example7_CompleteWorkflow(orgAlias, csvFilePath, requiredColumns) {
    console.log('\n=== Example 7: Complete Validated Workflow ===\n');

    try {
        // Step 1: Find instance directory
        console.log('Step 1: Finding instance directory...');
        const instancePath = example5_FindInstancePath(orgAlias);

        // Step 2: Parse CSV with schema validation
        console.log('\nStep 2: Parsing CSV with validation...');
        const rows = example1_ParseCSVRobustly(csvFilePath, requiredColumns);

        // Step 3: Process data (example: just logging)
        console.log('\nStep 3: Processing data...');
        console.log(`   Will process ${rows.length} rows for org: ${orgAlias}`);
        console.log(`   Instance location: ${instancePath}`);

        // Step 4: Success
        console.log('\n✅ Workflow complete!');
        return {
            instancePath,
            rowsProcessed: rows.length,
            success: true
        };

    } catch (error) {
        console.error(`\n❌ Workflow failed: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * CLI Interface - Run examples from command line
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help') {
        console.log('Quick Wins Integration Examples\n');
        console.log('Usage: node quick-wins-integration-examples.js <command> [args]\n');
        console.log('Commands:');
        console.log('  csv <file> [columns...]        Parse CSV with validation');
        console.log('  flow <file>                    Validate flow XML');
        console.log('  flow-fix <file>                Auto-fix flow issues');
        console.log('  find <org-alias>               Find instance path');
        console.log('  discover                       Discover all instances');
        console.log('  workflow <org> <csv> <cols>    Complete workflow example');
        console.log('');
        console.log('Examples:');
        console.log('  node quick-wins-integration-examples.js csv data.csv Name Email');
        console.log('  node quick-wins-integration-examples.js flow my-flow.xml');
        console.log('  node quick-wins-integration-examples.js find production');
        console.log('  node quick-wins-integration-examples.js discover');
        process.exit(0);
    }

    try {
        switch (command) {
            case 'csv':
                const csvFile = args[1];
                const columns = args.slice(2);
                if (!csvFile) {
                    console.error('Error: CSV file required');
                    process.exit(1);
                }
                example1_ParseCSVRobustly(csvFile, columns);
                break;

            case 'flow':
                const flowFile = args[1];
                if (!flowFile) {
                    console.error('Error: Flow XML file required');
                    process.exit(1);
                }
                const isValid = example3_ValidateFlowBeforeDeployment(flowFile);
                process.exit(isValid ? 0 : 1);

            case 'flow-fix':
                const flowFixFile = args[1];
                if (!flowFixFile) {
                    console.error('Error: Flow XML file required');
                    process.exit(1);
                }
                example4_AutoFixFlowIssues(flowFixFile);
                break;

            case 'find':
                const orgAlias = args[1];
                if (!orgAlias) {
                    console.error('Error: Org alias required');
                    process.exit(1);
                }
                example5_FindInstancePath(orgAlias);
                break;

            case 'discover':
                example6_DiscoverAllInstances();
                break;

            case 'workflow':
                const org = args[1];
                const csv = args[2];
                const cols = args.slice(3);
                if (!org || !csv) {
                    console.error('Error: Org alias and CSV file required');
                    process.exit(1);
                }
                example7_CompleteWorkflow(org, csv, cols).then(result => {
                    process.exit(result.success ? 0 : 1);
                });
                break;

            default:
                console.error(`Unknown command: ${command}`);
                console.error('Run with --help for usage');
                process.exit(1);
        }

    } catch (error) {
        console.error(`\nFatal error: ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    example1_ParseCSVRobustly,
    example2_GenerateCSV,
    example3_ValidateFlowBeforeDeployment,
    example4_AutoFixFlowIssues,
    example5_FindInstancePath,
    example6_DiscoverAllInstances,
    example7_CompleteWorkflow
};
