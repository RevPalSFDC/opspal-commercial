const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Queryability Checker - Verify deployed fields are actually queryable
 *
 * PURPOSE: Prevent "No such column" errors by testing SOQL access post-deployment
 *
 * TESTS:
 * 1. SOQL SELECT - Can we query the field?
 * 2. FieldDefinition - Does the field exist in metadata?
 * 3. Permission Check - Is there FLS coverage?
 *
 * USAGE:
 *   node scripts/lib/queryability-checker.js --org <alias> --manifest deployment-manifest.json
 *   node scripts/lib/queryability-checker.js --org <alias> --object Account --field Custom_Field__c
 *
 * EXIT CODES:
 *   0: All fields queryable
 *   1: One or more fields not queryable
 *   2: Invalid arguments or manifest not found
 *
 * @author Advanced Approvals Framework Post-Mortem
 * @date 2025-10-03
 */

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        org: null,
        manifest: null,
        object: null,
        field: null,
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--org':
                config.org = args[++i];
                break;
            case '--manifest':
                config.manifest = args[++i];
                break;
            case '--object':
                config.object = args[++i];
                break;
            case '--field':
                config.field = args[++i];
                break;
            case '--verbose':
                config.verbose = true;
                break;
            case '--help':
                printHelp();
                process.exit(0);
        }
    }

    return config;
}

function printHelp() {
    console.log(`
Queryability Checker - Verify deployed fields are actually queryable

USAGE:
  node scripts/lib/queryability-checker.js --org <alias> --manifest <file>
  node scripts/lib/queryability-checker.js --org <alias> --object <object> --field <field>

OPTIONS:
  --org <alias>          Target Salesforce org alias (required)
  --manifest <file>      Deployment manifest JSON file
  --object <object>      Single object to test (use with --field)
  --field <field>        Single field to test (use with --object)
  --verbose              Show detailed test output
  --help                 Show this help message

EXAMPLES:
  # Test all fields from manifest
  node scripts/lib/queryability-checker.js --org rentable-sandbox --manifest deployment-manifest.json

  # Test single field
  node scripts/lib/queryability-checker.js --org rentable-sandbox --object Account --field Custom_Field__c

EXIT CODES:
  0: All fields queryable
  1: One or more fields not queryable
  2: Invalid arguments or manifest not found
`);
}

// Load fields from manifest or single field
function loadFieldsToTest(config) {
    const fields = [];

    if (config.manifest) {
        if (!fs.existsSync(config.manifest)) {
            console.error(`❌ Manifest file not found: ${config.manifest}`);
            process.exit(2);
        }

        const manifest = JSON.parse(fs.readFileSync(config.manifest, 'utf8'));

        if (manifest.fields && Array.isArray(manifest.fields)) {
            manifest.fields.forEach(f => {
                fields.push({
                    object: f.object,
                    field: f.field || f.name,
                    type: f.type,
                    required: f.required || false
                });
            });
        }
    } else if (config.object && config.field) {
        fields.push({
            object: config.object,
            field: config.field,
            type: null,
            required: false
        });
    } else {
        console.error('❌ Must provide either --manifest or both --object and --field');
        printHelp();
        process.exit(2);
    }

    return fields;
}

// Test 1: SOQL SELECT
function testSOQLSelect(org, objectName, fieldName, verbose) {
    if (verbose) {
        console.log(`  Testing SOQL SELECT...`);
    }

    try {
        const query = `SELECT Id, ${fieldName} FROM ${objectName} LIMIT 1`;
        const cmd = `sf data query --query "${query}" --target-org ${org} --json`;

        const result = execSync(cmd, { encoding: 'utf8', stdio: verbose ? 'inherit' : 'pipe' });
        const parsed = JSON.parse(result);

        if (parsed.status === 0) {
            return { pass: true, message: 'Field queryable via SOQL' };
        } else {
            return { pass: false, message: parsed.message || 'SOQL query failed' };
        }
    } catch (error) {
        const errorMessage = error.stderr ? error.stderr.toString() : error.message;

        // Check for "No such column" error
        if (errorMessage.includes('No such column')) {
            return {
                pass: false,
                message: `No such column '${fieldName}' - Missing Field-Level Security?`,
                hint: 'Deploy Permission Set with fieldPermissions for this field'
            };
        }

        // Check for "List has no rows" (expected - field exists but no data)
        if (errorMessage.includes('List has no rows') || errorMessage.includes('no rows')) {
            return { pass: true, message: 'Field queryable (no data yet)' };
        }

        return { pass: false, message: errorMessage };
    }
}

// Test 2: FieldDefinition verification
function testFieldDefinition(org, objectName, fieldName, verbose) {
    if (verbose) {
        console.log(`  Testing FieldDefinition...`);
    }

    try {
        const query = `SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND QualifiedApiName = '${fieldName}'`;
        const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${org} --json`;

        const result = execSync(cmd, { encoding: 'utf8', stdio: verbose ? 'inherit' : 'pipe' });
        const parsed = JSON.parse(result);

        if (parsed.status === 0 && parsed.result.totalSize === 1) {
            return {
                pass: true,
                message: `Field exists in metadata (Type: ${parsed.result.records[0].DataType})`
            };
        } else if (parsed.result.totalSize === 0) {
            return {
                pass: false,
                message: 'Field not found in FieldDefinition',
                hint: 'Field may not have been deployed yet'
            };
        } else {
            return { pass: false, message: 'Unexpected FieldDefinition query result' };
        }
    } catch (error) {
        return { pass: false, message: error.message };
    }
}

// Test 3: Permission check
function testPermissions(org, objectName, fieldName, isRequired, verbose) {
    if (verbose) {
        console.log(`  Testing Permission Sets...`);
    }

    // Required fields don't need FLS
    if (isRequired) {
        return {
            pass: true,
            message: 'Required field (automatic access)',
            skipped: true
        };
    }

    try {
        const query = `SELECT Id, Label FROM PermissionSet WHERE Id IN (SELECT ParentId FROM FieldPermissions WHERE Field = '${objectName}.${fieldName}')`;
        const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${org} --json`;

        const result = execSync(cmd, { encoding: 'utf8', stdio: verbose ? 'inherit' : 'pipe' });
        const parsed = JSON.parse(result);

        if (parsed.status === 0 && parsed.result.totalSize > 0) {
            const permSets = parsed.result.records.map(r => r.Label).join(', ');
            return {
                pass: true,
                message: `FLS granted by Permission Set(s): ${permSets}`
            };
        } else {
            return {
                pass: false,
                message: 'No Permission Sets grant FLS for this field',
                hint: 'Generate and deploy Permission Set with fieldPermissions entry'
            };
        }
    } catch (error) {
        return { pass: false, message: error.message };
    }
}

// Run all tests for a single field
function testField(org, objectName, fieldName, fieldType, isRequired, verbose) {
    if (verbose) {
        console.log(`\n🔍 Testing ${objectName}.${fieldName}...`);
    }

    const results = {
        object: objectName,
        field: fieldName,
        type: fieldType,
        required: isRequired,
        tests: {}
    };

    // Test 1: SOQL SELECT
    results.tests.soql = testSOQLSelect(org, objectName, fieldName, verbose);

    // Test 2: FieldDefinition
    results.tests.fieldDefinition = testFieldDefinition(org, objectName, fieldName, verbose);

    // Test 3: Permissions
    results.tests.permissions = testPermissions(org, objectName, fieldName, isRequired, verbose);

    // Overall pass/fail
    results.queryable = results.tests.soql.pass && results.tests.fieldDefinition.pass;
    results.hasPermissions = results.tests.permissions.pass || results.tests.permissions.skipped;

    return results;
}

// Main execution
function main() {
    const config = parseArgs();

    if (!config.org) {
        console.error('❌ --org argument is required');
        printHelp();
        process.exit(2);
    }

    console.log('🚀 Queryability Checker\n');
    console.log(`📋 Org: ${config.org}`);

    const fields = loadFieldsToTest(config);
    console.log(`📊 Fields to test: ${fields.length}\n`);

    const testResults = [];
    let passCount = 0;
    let failCount = 0;

    fields.forEach((field, index) => {
        const result = testField(
            config.org,
            field.object,
            field.field,
            field.type,
            field.required,
            config.verbose
        );

        testResults.push(result);

        // Print summary
        const status = result.queryable ? '✅' : '❌';
        console.log(`${status} ${field.object}.${field.field}`);

        if (!result.queryable) {
            failCount++;
            console.log(`   ⚠️  SOQL: ${result.tests.soql.message}`);
            if (result.tests.soql.hint) {
                console.log(`   💡 Hint: ${result.tests.soql.hint}`);
            }
            if (!result.hasPermissions && !field.required) {
                console.log(`   ⚠️  FLS: ${result.tests.permissions.message}`);
                if (result.tests.permissions.hint) {
                    console.log(`   💡 Hint: ${result.tests.permissions.hint}`);
                }
            }
        } else {
            passCount++;
            if (config.verbose) {
                console.log(`   ✓ ${result.tests.soql.message}`);
                console.log(`   ✓ ${result.tests.fieldDefinition.message}`);
                if (!result.tests.permissions.skipped) {
                    console.log(`   ✓ ${result.tests.permissions.message}`);
                }
            }
        }
    });

    // Final summary
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Queryable: ${passCount}`);
    console.log(`   ❌ Not queryable: ${failCount}`);
    console.log(`   📈 Success rate: ${((passCount / fields.length) * 100).toFixed(1)}%`);

    // Save detailed report
    const reportPath = `queryability-report-${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
    console.log(`\n📄 Detailed report saved: ${reportPath}`);

    // Exit with appropriate code
    if (failCount > 0) {
        console.log('\n❌ QUERYABILITY VALIDATION FAILED');
        console.log('   Fix FLS issues and re-run this checker before proceeding.\n');
        process.exit(1);
    } else {
        console.log('\n✅ ALL FIELDS QUERYABLE - Ready to proceed!\n');
        process.exit(0);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { testField, testSOQLSelect, testFieldDefinition, testPermissions };
