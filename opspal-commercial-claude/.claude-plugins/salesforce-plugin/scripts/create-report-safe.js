#!/usr/bin/env node

/**
 * Safe Report Creation Script
 * 
 * Production-safe report creation with all guardrails:
 * - Never sets prod as default
 * - Requires ENABLE_WRITE=1 for creation
 * - Two-step deployment (dry-run then confirm)
 * - Uses API v64.0
 * - Instance-agnostic
 */

const UniversalReportCreator = require('./lib/universal-report-creator');
const readline = require('readline');

// Parse command line arguments
const args = process.argv.slice(2);
const reportName = args[0];
const isDryRun = args.includes('--dry-run');
const skipConfirm = args.includes('--yes');

async function main() {
    // Check environment
    const org = process.env.ORG;
    const apiVersion = process.env.API_VERSION || 'v64.0';
    const enableWrite = process.env.ENABLE_WRITE === '1';
    
    if (!org) {
        console.error(`
❌ ORG environment variable not set

Set your target org:
  export ORG=my-sandbox
  
Never use production as default!
`);
        process.exit(1);
    }
    
    console.log(`
═══════════════════════════════════════════════════════════════
SAFE REPORT CREATION
═══════════════════════════════════════════════════════════════
• Target Org: ${org}
• API Version: ${apiVersion}
• Write Mode: ${enableWrite ? 'ENABLED ⚠️' : 'DISABLED (safe)'}
• Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}
`);

    if (!reportName) {
        console.log(`
Usage: node create-report-safe.js "Report Name" [options]

Options:
  --dry-run     Validate without creating
  --yes         Skip confirmation prompt

Environment variables required:
  ORG           Target org alias
  ENABLE_WRITE  Set to 1 to allow creation
  API_VERSION   Salesforce API version (default: v64.0)
`);
        process.exit(1);
    }

    try {
        // Initialize creator with safety checks
        console.log('Initializing...');
        const creator = await UniversalReportCreator.create(org);
        
        // Display org capabilities
        const capabilities = creator.getCapabilitiesSummary();
        console.log(`
Org Capabilities:
• Standard Objects: ${capabilities.standardObjects.join(', ') || 'None'}
• Write Access: ${capabilities.writableFolders > 0 ? `✓ (${capabilities.writableFolders} folders)` : '✗'}
• Status: ${capabilities.recommendation}
`);

        // Check for write access
        if (!isDryRun && !enableWrite) {
            console.error(`
🔒 Write operations disabled

To create reports, set:
  export ENABLE_WRITE=1
  
Or use --dry-run to validate only.
`);
            process.exit(1);
        }

        // Step 1: Dry-run validation
        console.log('Step 1: Validating report metadata...');
        
        const reportOptions = {
            name: reportName,
            format: 'TABULAR',
            dryRun: true  // Always dry-run first
        };
        
        const validation = await creator.createAdaptiveReport(reportOptions);
        
        if (!validation.metadata) {
            throw new Error('Validation failed - no valid metadata generated');
        }
        
        console.log(`
✅ Validation successful!

Report Details:
• Name: ${reportOptions.name}
• Type: ${validation.metadata.reportType.type}
• Format: ${validation.metadata.reportFormat}
• Folder: ${validation.folder || 'auto-selected'}
• Fields: ${validation.metadata.detailColumns.length} columns
`);

        // If dry-run only, stop here
        if (isDryRun) {
            console.log(`
Dry-run complete. Report is valid and ready to create.
To actually create, remove --dry-run and set ENABLE_WRITE=1
`);
            return;
        }

        // Step 2: Confirmation
        if (!skipConfirm) {
            console.log(`
⚠️  Ready to create report in ${org}

This will create:
• Report: ${reportName}
• Type: ${validation.metadata.reportType.type}
• Folder: ${validation.folder}
`);

            const confirmed = await promptConfirmation('Type CONFIRM to create report: ');
            
            if (!confirmed) {
                console.log('Report creation cancelled.');
                return;
            }
        }

        // Step 3: Create the report (with write check)
        console.log('\nCreating report...');
        
        reportOptions.dryRun = false;  // Now do the actual creation
        const result = await creator.createAdaptiveReport(reportOptions);
        
        console.log(`
✅ Report created successfully!

Report Details:
• ID: ${result.reportId}
• Name: ${result.reportName}
• URL: ${result.url}
• Org: ${result.org || org}
• API Version: ${result.apiVersion || apiVersion}

═══════════════════════════════════════════════════════════════
`);

    } catch (error) {
        console.error(`
❌ Error: ${error.message}

Troubleshooting:
1. Check ORG is set correctly
2. Verify authentication: sf org display -o $ORG
3. Ensure ENABLE_WRITE=1 for creation
4. Verify user has report creation permissions
5. Check at least one folder has write access
`);
        process.exit(1);
    }
}

function promptConfirmation(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer === 'CONFIRM');
        });
    });
}

// Run the script
main().catch(console.error);