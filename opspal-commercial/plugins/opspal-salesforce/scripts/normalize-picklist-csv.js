#!/usr/bin/env node

/**
 * Normalize Picklist CSV
 *
 * CLI tool for normalizing picklist values in CSV files before Salesforce import.
 * Prevents "bad value for restricted picklist field" errors in bulk operations.
 *
 * Usage:
 *   node scripts/normalize-picklist-csv.js --input data.csv --object Account \
 *     --field County__c --org acme-corp [--preview] [--output normalized.csv]
 *
 * Problem Solved:
 * - County__c picklist has values like "San Luis Obispo"
 * - Incoming data has "San Luis Obispo County"
 * - Bulk import fails with restricted picklist error
 *
 * Solution:
 * - Pre-validates CSV against actual picklist values from org
 * - Normalizes values that match with high confidence
 * - Reports values that need manual review
 *
 * @version 1.0.0
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Resolve the normalizer path relative to this script
const { PicklistValueNormalizer } = require('./lib/picklist-value-normalizer');

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
    const options = {
        input: null,
        output: null,
        object: null,
        field: null,
        org: process.env.SF_TARGET_ORG,
        preview: false,
        threshold: 80,
        verbose: false,
        help: false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const nextArg = argv[i + 1];

        switch (arg) {
            case '--input':
            case '-i':
                options.input = nextArg;
                i++;
                break;
            case '--output':
            case '-o':
                options.output = nextArg;
                i++;
                break;
            case '--object':
                options.object = nextArg;
                i++;
                break;
            case '--field':
            case '-f':
                options.field = nextArg;
                i++;
                break;
            case '--org':
                options.org = nextArg;
                i++;
                break;
            case '--preview':
            case '-p':
                options.preview = true;
                break;
            case '--threshold':
            case '-t':
                options.threshold = parseInt(nextArg, 10);
                i++;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
        }
    }

    return options;
}

/**
 * Display usage information
 */
function showUsage() {
    console.log(`
Normalize Picklist CSV
━━━━━━━━━━━━━━━━━━━━━━

Pre-validates and normalizes picklist values in CSV files before Salesforce import.

USAGE:
  node scripts/normalize-picklist-csv.js --input <file> --object <name> --field <name> [options]

REQUIRED:
  --input, -i <file>      Input CSV file path
  --object <name>         Salesforce object API name (e.g., Account)
  --field, -f <name>      Field API name (e.g., County__c)

OPTIONS:
  --output, -o <file>     Output file path (default: overwrites input)
  --org <alias>           Salesforce org alias (default: SF_TARGET_ORG env var)
  --preview, -p           Preview changes without writing
  --threshold, -t <n>     Similarity threshold 0-100 (default: 80)
  --verbose, -v           Verbose output
  --help, -h              Show this help

EXAMPLES:

  1. Preview normalization (dry run):
     node scripts/normalize-picklist-csv.js \\
       --input territories.csv \\
       --object Account \\
       --field County__c \\
       --org acme-corp \\
       --preview

  2. Normalize and save to new file:
     node scripts/normalize-picklist-csv.js \\
       --input territories.csv \\
       --object Account \\
       --field County__c \\
       --org acme-corp \\
       --output territories-normalized.csv

  3. Normalize with higher threshold (stricter matching):
     node scripts/normalize-picklist-csv.js \\
       --input data.csv \\
       --object Account \\
       --field State__c \\
       --org production \\
       --threshold 90

OUTPUT:

  The script produces a summary showing:
  • Total rows processed
  • Values that were unchanged (exact matches)
  • Values that were normalized (suffix variants, typos)
  • Values that failed (no match found)

  For failed values, suggestions are provided with confidence scores.

COMMON FIXES:

  County__c:
    "San Luis Obispo County" → "San Luis Obispo"
    "Los Angeles County"     → "Los Angeles"

  State__c:
    "california"  → "California"
    "CA"          → "California" (or "CA" depending on picklist)

ENVIRONMENT:

  SF_TARGET_ORG   Default Salesforce org alias when --org not specified

ROI: Prevents bulk import failures, saves 4+ hours per incident.
    `);
}

/**
 * Main entry point
 */
async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
        showUsage();
        process.exit(0);
    }

    // Validate required arguments
    if (!options.input) {
        console.error('Error: --input is required');
        console.error('Use --help to see usage information');
        process.exit(1);
    }

    if (!options.object) {
        console.error('Error: --object is required');
        console.error('Use --help to see usage information');
        process.exit(1);
    }

    if (!options.field) {
        console.error('Error: --field is required');
        console.error('Use --help to see usage information');
        process.exit(1);
    }

    if (!options.org) {
        console.error('Error: --org is required (or set SF_TARGET_ORG environment variable)');
        console.error('Use --help to see usage information');
        process.exit(1);
    }

    // Validate input file exists
    if (!fs.existsSync(options.input)) {
        console.error(`Error: Input file not found: ${options.input}`);
        process.exit(1);
    }

    // Display configuration
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║          Picklist Value Normalizer                           ║
╚══════════════════════════════════════════════════════════════╝

Configuration:
  Input file:    ${options.input}
  Object:        ${options.object}
  Field:         ${options.field}
  Org:           ${options.org}
  Threshold:     ${options.threshold}%
  Mode:          ${options.preview ? 'PREVIEW (no changes)' : 'WRITE'}
  Output:        ${options.output || options.input}
`);

    try {
        // Create normalizer
        const normalizer = new PicklistValueNormalizer({
            orgAlias: options.org,
            similarityThreshold: options.threshold,
            verbose: options.verbose
        });

        // Process CSV
        const results = await normalizer.normalizeCSV(
            options.input,
            options.object,
            options.field,
            options.org,
            {
                preview: options.preview,
                output: options.output || options.input
            }
        );

        // Exit with appropriate code
        if (results.failed > 0) {
            console.log(`\n⚠️  ${results.failed} values need manual review before import.`);
            process.exit(1);
        } else if (results.normalized > 0 && options.preview) {
            console.log(`\n✅ ${results.normalized} values can be normalized. Run without --preview to apply changes.`);
            process.exit(0);
        } else {
            console.log('\n✅ All values are valid or have been normalized.');
            process.exit(0);
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (options.verbose && error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { parseArgs, main };
