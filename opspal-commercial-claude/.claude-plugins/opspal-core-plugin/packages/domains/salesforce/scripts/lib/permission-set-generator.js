const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Permission Set Generator - Auto-generate FLS permissions from field manifest
 *
 * PURPOSE: Prevent "No such column" errors by ensuring Field-Level Security
 *
 * FEATURES:
 * - Auto-detects required fields (cannot be in Permission Sets)
 * - Generates Permission Set XML with object + field permissions
 * - Validates against Salesforce API limitations
 *
 * USAGE:
 *   node scripts/lib/permission-set-generator.js --manifest deployment-manifest.json --exclude-required
 *   node scripts/lib/permission-set-generator.js --object Account --output force-app/main/default/permissionsets
 *
 * @author Advanced Approvals Framework Post-Mortem
 * @date 2025-10-03
 */

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        manifest: null,
        object: null,
        output: 'force-app/main/default/permissionsets',
        excludeRequired: false,
        org: null,
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--manifest':
                config.manifest = args[++i];
                break;
            case '--object':
                config.object = args[++i];
                break;
            case '--output':
                config.output = args[++i];
                break;
            case '--exclude-required':
                config.excludeRequired = true;
                break;
            case '--org':
                config.org = args[++i];
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
Permission Set Generator - Auto-generate FLS permissions

USAGE:
  node scripts/lib/permission-set-generator.js --manifest <file> --exclude-required
  node scripts/lib/permission-set-generator.js --object <object> --org <alias>

OPTIONS:
  --manifest <file>        Deployment manifest JSON file
  --object <object>        Single object to generate Permission Set for
  --output <dir>           Output directory (default: force-app/main/default/permissionsets)
  --exclude-required       Auto-exclude required fields (RECOMMENDED)
  --org <alias>            Org alias to query required fields from
  --verbose                Show detailed output
  --help                   Show this help message

EXAMPLES:
  # Generate from manifest with required field exclusion
  node scripts/lib/permission-set-generator.js --manifest deployment-manifest.json --exclude-required --org rentable-sandbox

  # Generate for single object
  node scripts/lib/permission-set-generator.js --object Approval_Rule_Config__c --org rentable-sandbox --exclude-required

SALESFORCE LIMITATION:
  Required fields CANNOT be in Permission Sets. They get automatic access.
  Always use --exclude-required flag to prevent deployment failures.
`);
}

// Detect required fields by querying org
function detectRequiredFields(org, objectName, verbose) {
    if (!org) {
        if (verbose) {
            console.log(`⚠️  No org specified, cannot detect required fields for ${objectName}`);
        }
        return new Set();
    }

    try {
        const query = `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsRequired = true`;
        const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${org} --json`;

        const result = execSync(cmd, { encoding: 'utf8', stdio: verbose ? 'inherit' : 'pipe' });
        const parsed = JSON.parse(result);

        if (parsed.status === 0) {
            const requiredFields = new Set();
            parsed.result.records.forEach(r => {
                requiredFields.add(r.QualifiedApiName);
            });

            if (verbose) {
                console.log(`✓ Detected ${requiredFields.size} required fields for ${objectName}`);
                requiredFields.forEach(f => console.log(`  - ${f}`));
            }

            return requiredFields;
        }
    } catch (error) {
        console.warn(`⚠️  Could not detect required fields for ${objectName}: ${error.message}`);
    }

    return new Set();
}

// Load fields from manifest
function loadFieldsFromManifest(manifestPath) {
    if (!fs.existsSync(manifestPath)) {
        console.error(`❌ Manifest file not found: ${manifestPath}`);
        process.exit(2);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Group fields by object
    const fieldsByObject = {};

    if (manifest.fields && Array.isArray(manifest.fields)) {
        manifest.fields.forEach(f => {
            const objectName = f.object;
            if (!fieldsByObject[objectName]) {
                fieldsByObject[objectName] = [];
            }
            fieldsByObject[objectName].push({
                field: f.field || f.name,
                type: f.type,
                required: f.required || false
            });
        });
    }

    return fieldsByObject;
}

// Generate Permission Set XML
function generatePermissionSetXML(objectName, fields, requiredFields, verbose) {
    const permissionSetName = `${objectName.replace(/__c$/, '')}_Access`;
    const label = `${objectName.replace(/__c$/, '').replace(/_/g, ' ')} Access`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
    <label>${label}</label>
    <description>Auto-generated FLS permissions for ${objectName}</description>
    <objectPermissions>
        <allowCreate>true</allowCreate>
        <allowDelete>true</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>true</modifyAllRecords>
        <object>${objectName}</object>
        <viewAllRecords>true</viewAllRecords>
    </objectPermissions>
`;

    let includedCount = 0;
    let excludedCount = 0;

    fields.forEach(field => {
        const fieldApiName = field.field;
        const isRequired = field.required || requiredFields.has(fieldApiName);

        if (isRequired) {
            excludedCount++;
            if (verbose) {
                console.log(`  ⊘ Excluding ${fieldApiName} (required field)`);
            }
            xml += `    <!-- Field ${objectName}.${fieldApiName} excluded (required field - automatic access) -->\n`;
        } else {
            includedCount++;
            if (verbose) {
                console.log(`  ✓ Including ${fieldApiName}`);
            }
            xml += `    <fieldPermissions>
        <editable>true</editable>
        <field>${objectName}.${fieldApiName}</field>
        <readable>true</readable>
    </fieldPermissions>
`;
        }
    });

    xml += `</PermissionSet>
`;

    if (verbose) {
        console.log(`\n📊 Summary for ${objectName}:`);
        console.log(`   ✓ Included: ${includedCount} fields`);
        console.log(`   ⊘ Excluded: ${excludedCount} required fields`);
    }

    return { xml, permissionSetName, includedCount, excludedCount };
}

// Write Permission Set file
function writePermissionSet(outputDir, permissionSetName, xml, verbose) {
    const filename = `${permissionSetName}.permissionset-meta.xml`;
    const filepath = path.join(outputDir, filename);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        if (verbose) {
            console.log(`✓ Created directory: ${outputDir}`);
        }
    }

    fs.writeFileSync(filepath, xml);
    console.log(`✅ Generated: ${filepath}`);

    return filepath;
}

// Main execution
function main() {
    const config = parseArgs();

    console.log('🚀 Permission Set Generator\n');

    let fieldsByObject = {};

    // Load fields from manifest or single object
    if (config.manifest) {
        console.log(`📋 Loading manifest: ${config.manifest}`);
        fieldsByObject = loadFieldsFromManifest(config.manifest);
        console.log(`📊 Objects found: ${Object.keys(fieldsByObject).length}\n`);
    } else if (config.object) {
        console.log(`📋 Generating for single object: ${config.object}`);

        if (!config.org) {
            console.error('❌ --org is required when using --object (to detect fields)');
            process.exit(2);
        }

        // Query fields from org
        try {
            const query = `SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${config.object}' AND IsCustom = true`;
            const cmd = `sf data query --query "${query}" --use-tooling-api --target-org ${config.org} --json`;
            const result = execSync(cmd, { encoding: 'utf8' });
            const parsed = JSON.parse(result);

            if (parsed.status === 0) {
                fieldsByObject[config.object] = parsed.result.records.map(r => ({
                    field: r.QualifiedApiName,
                    type: r.DataType,
                    required: false  // Will be detected separately
                }));
                console.log(`✓ Found ${fieldsByObject[config.object].length} custom fields\n`);
            }
        } catch (error) {
            console.error(`❌ Failed to query fields: ${error.message}`);
            process.exit(1);
        }
    } else {
        console.error('❌ Must provide either --manifest or --object');
        printHelp();
        process.exit(2);
    }

    // Generate Permission Sets for each object
    const generatedFiles = [];
    let totalIncluded = 0;
    let totalExcluded = 0;

    Object.keys(fieldsByObject).forEach(objectName => {
        console.log(`\n🔧 Processing ${objectName}...`);

        const fields = fieldsByObject[objectName];

        // Detect required fields if flag is set
        const requiredFields = config.excludeRequired && config.org
            ? detectRequiredFields(config.org, objectName, config.verbose)
            : new Set();

        // Generate XML
        const { xml, permissionSetName, includedCount, excludedCount } = generatePermissionSetXML(
            objectName,
            fields,
            requiredFields,
            config.verbose
        );

        totalIncluded += includedCount;
        totalExcluded += excludedCount;

        // Write file
        const filepath = writePermissionSet(config.output, permissionSetName, xml, config.verbose);
        generatedFiles.push(filepath);
    });

    // Final summary
    console.log(`\n📊 Generation Complete:`);
    console.log(`   ✅ Permission Sets generated: ${generatedFiles.length}`);
    console.log(`   ✓ Total fields included: ${totalIncluded}`);
    console.log(`   ⊘ Total required fields excluded: ${totalExcluded}`);

    console.log(`\n📁 Files created:`);
    generatedFiles.forEach(f => console.log(`   - ${f}`));

    console.log(`\n📋 Next steps:`);
    console.log(`   1. Review generated Permission Sets`);
    console.log(`   2. Deploy: sf project deploy start --source-dir ${config.output} --target-org <alias>`);
    console.log(`   3. Assign to users: sf data create record --sobject PermissionSetAssignment --values ...`);
    console.log(`   4. Verify: node scripts/lib/queryability-checker.js --org <alias> --manifest <manifest>\n`);

    process.exit(0);
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { generatePermissionSetXML, detectRequiredFields };
