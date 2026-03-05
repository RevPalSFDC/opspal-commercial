#!/usr/bin/env node

/**
 * Salesforce Standards CLI - Master command for all standards operations
 * Interactive menu system for managing Salesforce development standards
 */

const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import all utilities
const DocumentationOrganizer = require('./documentation-organizer');
const ReportTypeCreator = require('./report-type-creator');
const LightningPageEnhancer = require('./lightning-page-enhancer');
const SalesforceStandardsValidator = require('./salesforce-standards-validator');

class SalesforceStandardsCLI {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        this.orgAlias = process.env.SF_TARGET_ORG || null;
        this.projectRoot = process.cwd();
    }

    /**
     * Display main menu
     */
    async showMainMenu() {
        console.clear();
        console.log('═'.repeat(60));
        console.log('     SALESFORCE STANDARDS MANAGEMENT SYSTEM');
        console.log('═'.repeat(60));
        
        if (this.orgAlias) {
            console.log(`📌 Connected Org: ${this.orgAlias}`);
        } else {
            console.log('⚠️  No default org set (some features unavailable)');
        }
        
        console.log('\n📋 MAIN MENU\n');
        console.log('  1. 📚 Documentation Management');
        console.log('  2. 📊 Report Type Management');
        console.log('  3. ⚡ Lightning Page Management');
        console.log('  4. ✅ Validation & Compliance');
        console.log('  5. 🔧 Quick Fixes');
        console.log('  6. 📈 Generate Reports');
        console.log('  7. ⚙️  Settings');
        console.log('  8. 🚪 Exit\n');
        
        const choice = await this.prompt('Select an option (1-8): ');
        
        switch (choice) {
            case '1':
                await this.documentationMenu();
                break;
            case '2':
                await this.reportTypeMenu();
                break;
            case '3':
                await this.lightningPageMenu();
                break;
            case '4':
                await this.validationMenu();
                break;
            case '5':
                await this.quickFixesMenu();
                break;
            case '6':
                await this.reportsMenu();
                break;
            case '7':
                await this.settingsMenu();
                break;
            case '8':
                console.log('\n👋 Goodbye!\n');
                this.rl.close();
                process.exit(0);
            default:
                console.log('\n❌ Invalid option. Please try again.');
                await this.pause();
                await this.showMainMenu();
        }
    }

    /**
     * Documentation management menu
     */
    async documentationMenu() {
        console.clear();
        console.log('📚 DOCUMENTATION MANAGEMENT\n');
        console.log('  1. Check documentation organization');
        console.log('  2. Fix misplaced documentation');
        console.log('  3. Preview changes (dry run)');
        console.log('  4. Generate organization report');
        console.log('  5. Back to main menu\n');
        
        const choice = await this.prompt('Select an option (1-5): ');
        const organizer = new DocumentationOrganizer(this.projectRoot);
        
        switch (choice) {
            case '1':
                console.log('\n');
                organizer.validate();
                await this.pause();
                break;
            case '2':
                console.log('\n');
                organizer.findMisplacedDocs();
                organizer.moveDocs(false);
                organizer.generateReport();
                await this.pause();
                break;
            case '3':
                console.log('\n');
                organizer.findMisplacedDocs();
                organizer.moveDocs(true);
                await this.pause();
                break;
            case '4':
                console.log('\n');
                organizer.findMisplacedDocs();
                organizer.generateReport();
                console.log('📊 Report generated in docs/DOCUMENTATION_ORGANIZATION_REPORT.md');
                await this.pause();
                break;
            case '5':
                break;
            default:
                console.log('\n❌ Invalid option.');
                await this.pause();
        }
        
        await this.showMainMenu();
    }

    /**
     * Report type management menu
     */
    async reportTypeMenu() {
        if (!this.orgAlias) {
            console.log('\n⚠️  This feature requires an org connection.');
            console.log('Please set SF_TARGET_ORG or use Settings menu.');
            await this.pause();
            await this.showMainMenu();
            return;
        }
        
        console.clear();
        console.log('📊 REPORT TYPE MANAGEMENT\n');
        console.log('  1. Create report types for all objects');
        console.log('  2. Create report type for specific object');
        console.log('  3. List existing report types');
        console.log('  4. Check report type coverage');
        console.log('  5. Back to main menu\n');
        
        const choice = await this.prompt('Select an option (1-5): ');
        const creator = new ReportTypeCreator(this.orgAlias);
        
        switch (choice) {
            case '1':
                console.log('\n');
                await creator.createAllReportTypes({ org: this.orgAlias });
                await this.pause();
                break;
            case '2':
                const objectName = await this.prompt('Enter object name (e.g., Subscription__c): ');
                console.log('\n');
                await creator.createReportType(objectName, { org: this.orgAlias });
                await this.pause();
                break;
            case '3':
                console.log('\n');
                const reportTypes = await creator.queryExistingReportTypes();
                console.log(`Found ${reportTypes.length} report types:\n`);
                reportTypes.forEach(rt => {
                    console.log(`  - ${rt.DeveloperName} (${rt.BaseObject})`);
                });
                await this.pause();
                break;
            case '4':
                console.log('\n');
                const validator = new SalesforceStandardsValidator(this.projectRoot);
                await validator.validateReportTypeCoverage(this.orgAlias);
                await this.pause();
                break;
            case '5':
                break;
            default:
                console.log('\n❌ Invalid option.');
                await this.pause();
        }
        
        await this.showMainMenu();
    }

    /**
     * Lightning Page management menu
     */
    async lightningPageMenu() {
        if (!this.orgAlias) {
            console.log('\n⚠️  This feature requires an org connection.');
            console.log('Please set SF_TARGET_ORG or use Settings menu.');
            await this.pause();
            await this.showMainMenu();
            return;
        }
        
        console.clear();
        console.log('⚡ LIGHTNING PAGE MANAGEMENT\n');
        console.log('  1. Auto-add all related lists for an object');
        console.log('  2. Add specific related list to pages');
        console.log('  3. List Lightning Pages for an object');
        console.log('  4. Check related list coverage');
        console.log('  5. Back to main menu\n');
        
        const choice = await this.prompt('Select an option (1-5): ');
        const enhancer = new LightningPageEnhancer(this.orgAlias);
        
        switch (choice) {
            case '1':
                const object1 = await this.prompt('Enter object name (e.g., Contract): ');
                console.log('\n');
                await enhancer.autoDiscoverAndAdd(object1);
                await this.pause();
                break;
            case '2':
                const object2 = await this.prompt('Enter object name: ');
                const relatedList = await this.prompt('Enter related list name: ');
                console.log('\n');
                await enhancer.addRelatedListToAllPages(object2, {
                    relatedListApiName: relatedList,
                    rowsToDisplay: 10
                });
                await this.pause();
                break;
            case '3':
                const object3 = await this.prompt('Enter object name: ');
                console.log('\n');
                const pages = await enhancer.queryLightningPages(object3);
                console.log(`Found ${pages.length} Lightning Pages:\n`);
                pages.forEach(p => {
                    console.log(`  - ${p.MasterLabel} (${p.DeveloperName})`);
                });
                await this.pause();
                break;
            case '4':
                console.log('\n');
                const validator = new SalesforceStandardsValidator(this.projectRoot);
                await validator.validateLightningPageCompleteness(this.orgAlias);
                await this.pause();
                break;
            case '5':
                break;
            default:
                console.log('\n❌ Invalid option.');
                await this.pause();
        }
        
        await this.showMainMenu();
    }

    /**
     * Validation and compliance menu
     */
    async validationMenu() {
        console.clear();
        console.log('✅ VALIDATION & COMPLIANCE\n');
        console.log('  1. Run full compliance check');
        console.log('  2. Check documentation standards');
        console.log('  3. Check report type coverage');
        console.log('  4. Check Lightning Page completeness');
        console.log('  5. Check metadata standards');
        console.log('  6. Back to main menu\n');
        
        const choice = await this.prompt('Select an option (1-6): ');
        const validator = new SalesforceStandardsValidator(this.projectRoot);
        
        switch (choice) {
            case '1':
                console.log('\n');
                await validator.runFullValidation({ org: this.orgAlias });
                await this.pause();
                break;
            case '2':
                console.log('\n');
                await validator.validateDocumentationStandards();
                await this.pause();
                break;
            case '3':
                if (this.orgAlias) {
                    console.log('\n');
                    await validator.validateReportTypeCoverage(this.orgAlias);
                } else {
                    console.log('\n⚠️  Org connection required for this check.');
                }
                await this.pause();
                break;
            case '4':
                if (this.orgAlias) {
                    console.log('\n');
                    await validator.validateLightningPageCompleteness(this.orgAlias);
                } else {
                    console.log('\n⚠️  Org connection required for this check.');
                }
                await this.pause();
                break;
            case '5':
                console.log('\n');
                await validator.validateMetadataStandards();
                await this.pause();
                break;
            case '6':
                break;
            default:
                console.log('\n❌ Invalid option.');
                await this.pause();
        }
        
        await this.showMainMenu();
    }

    /**
     * Quick fixes menu
     */
    async quickFixesMenu() {
        console.clear();
        console.log('🔧 QUICK FIXES\n');
        console.log('  1. 🚀 Fix ALL issues (documentation, report types, related lists)');
        console.log('  2. 📚 Fix documentation organization only');
        console.log('  3. 📊 Create all missing report types');
        console.log('  4. ⚡ Add all missing related lists');
        console.log('  5. 🔄 Back to main menu\n');
        
        const choice = await this.prompt('Select an option (1-5): ');
        
        switch (choice) {
            case '1':
                console.log('\n🚀 Running comprehensive fix...\n');
                
                // Fix documentation
                console.log('📚 Fixing documentation...');
                const organizer = new DocumentationOrganizer(this.projectRoot);
                organizer.findMisplacedDocs();
                organizer.moveDocs(false);
                
                if (this.orgAlias) {
                    // Create report types
                    console.log('\n📊 Creating missing report types...');
                    const creator = new ReportTypeCreator(this.orgAlias);
                    await creator.createAllReportTypes({ org: this.orgAlias });
                    
                    // Note: Lightning Page fixes would need specific object input
                    console.log('\n⚡ For Lightning Pages, use menu option 3.1 for each object');
                }
                
                console.log('\n✅ Quick fixes completed!');
                await this.pause();
                break;
                
            case '2':
                console.log('\n');
                const org = new DocumentationOrganizer(this.projectRoot);
                org.findMisplacedDocs();
                org.moveDocs(false);
                org.generateReport();
                await this.pause();
                break;
                
            case '3':
                if (this.orgAlias) {
                    console.log('\n');
                    const rtCreator = new ReportTypeCreator(this.orgAlias);
                    await rtCreator.createAllReportTypes({ org: this.orgAlias });
                } else {
                    console.log('\n⚠️  Org connection required.');
                }
                await this.pause();
                break;
                
            case '4':
                if (this.orgAlias) {
                    const objectName = await this.prompt('Enter object name: ');
                    console.log('\n');
                    const lpEnhancer = new LightningPageEnhancer(this.orgAlias);
                    await lpEnhancer.autoDiscoverAndAdd(objectName);
                } else {
                    console.log('\n⚠️  Org connection required.');
                }
                await this.pause();
                break;
                
            case '5':
                break;
                
            default:
                console.log('\n❌ Invalid option.');
                await this.pause();
        }
        
        await this.showMainMenu();
    }

    /**
     * Reports menu
     */
    async reportsMenu() {
        console.clear();
        console.log('📈 GENERATE REPORTS\n');
        console.log('  1. Generate compliance report');
        console.log('  2. Generate documentation organization report');
        console.log('  3. List all recent reports');
        console.log('  4. Back to main menu\n');
        
        const choice = await this.prompt('Select an option (1-4): ');
        
        switch (choice) {
            case '1':
                console.log('\n');
                const validator = new SalesforceStandardsValidator(this.projectRoot);
                await validator.runFullValidation({ org: this.orgAlias });
                console.log('\n📊 Report saved to docs/COMPLIANCE_REPORT_*.md');
                await this.pause();
                break;
                
            case '2':
                console.log('\n');
                const organizer = new DocumentationOrganizer(this.projectRoot);
                organizer.findMisplacedDocs();
                organizer.generateReport();
                console.log('📊 Report saved to docs/DOCUMENTATION_ORGANIZATION_REPORT.md');
                await this.pause();
                break;
                
            case '3':
                console.log('\n');
                const docsDir = path.join(this.projectRoot, 'docs');
                if (fs.existsSync(docsDir)) {
                    const files = fs.readdirSync(docsDir)
                        .filter(f => f.includes('REPORT'))
                        .sort()
                        .reverse()
                        .slice(0, 10);
                    
                    console.log('Recent reports:\n');
                    files.forEach(f => console.log(`  - ${f}`));
                } else {
                    console.log('No reports found.');
                }
                await this.pause();
                break;
                
            case '4':
                break;
                
            default:
                console.log('\n❌ Invalid option.');
                await this.pause();
        }
        
        await this.showMainMenu();
    }

    /**
     * Settings menu
     */
    async settingsMenu() {
        console.clear();
        console.log('⚙️  SETTINGS\n');
        console.log(`  Current Org: ${this.orgAlias || 'Not set'}\n`);
        console.log('  1. Set default org');
        console.log('  2. List available orgs');
        console.log('  3. Test org connection');
        console.log('  4. View environment variables');
        console.log('  5. Back to main menu\n');
        
        const choice = await this.prompt('Select an option (1-5): ');
        
        switch (choice) {
            case '1':
                const newOrg = await this.prompt('Enter org alias: ');
                this.orgAlias = newOrg;
                process.env.SF_TARGET_ORG = newOrg;
                console.log(`\n✅ Default org set to: ${newOrg}`);
                await this.pause();
                break;
                
            case '2':
                console.log('\n');
                try {
                    const result = execSync('sf org list --json', { encoding: 'utf8' });
                    const data = JSON.parse(result);
                    if (data.result && data.result.nonScratchOrgs) {
                        console.log('Available orgs:\n');
                        data.result.nonScratchOrgs.forEach(org => {
                            console.log(`  - ${org.alias || org.username} ${org.isDefaultUsername ? '(default)' : ''}`);
                        });
                    }
                } catch (error) {
                    console.log('Failed to list orgs:', error.message);
                }
                await this.pause();
                break;
                
            case '3':
                if (this.orgAlias) {
                    console.log('\n');
                    try {
                        execSync(`sf org display --target-org ${this.orgAlias}`, { stdio: 'inherit' });
                        console.log('\n✅ Connection successful!');
                    } catch (error) {
                        console.log('❌ Connection failed:', error.message);
                    }
                } else {
                    console.log('\n⚠️  No org set.');
                }
                await this.pause();
                break;
                
            case '4':
                console.log('\n');
                console.log('Environment Variables:');
                console.log(`  SF_TARGET_ORG: ${process.env.SF_TARGET_ORG || 'Not set'}`);
                console.log(`  SF_TARGET_ORG: ${process.env.SF_TARGET_ORG || 'Not set'}`);
                console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);
                await this.pause();
                break;
                
            case '5':
                break;
                
            default:
                console.log('\n❌ Invalid option.');
                await this.pause();
        }
        
        await this.showMainMenu();
    }

    /**
     * Prompt for user input
     */
    prompt(question) {
        return new Promise(resolve => {
            this.rl.question(question, answer => {
                resolve(answer.trim());
            });
        });
    }

    /**
     * Pause for user to read output
     */
    async pause() {
        await this.prompt('\nPress Enter to continue...');
    }

    /**
     * Start the CLI
     */
    async start() {
        // Handle command line arguments for non-interactive mode
        const args = process.argv.slice(2);
        
        if (args.length > 0) {
            await this.handleCommand(args);
        } else {
            // Interactive mode
            await this.showMainMenu();
        }
    }

    /**
     * Handle command line arguments
     */
    async handleCommand(args) {
        const command = args[0];
        const subcommand = args[1];
        
        switch (command) {
            case 'validate':
            case 'check':
                const validator = new SalesforceStandardsValidator(this.projectRoot);
                await validator.runFullValidation({ org: this.orgAlias });
                break;
                
            case 'fix':
                if (subcommand === 'docs') {
                    const organizer = new DocumentationOrganizer(this.projectRoot);
                    organizer.findMisplacedDocs();
                    organizer.moveDocs(false);
                } else if (subcommand === 'reports' && this.orgAlias) {
                    const creator = new ReportTypeCreator(this.orgAlias);
                    await creator.createAllReportTypes({ org: this.orgAlias });
                } else if (subcommand === 'all') {
                    // Fix everything
                    const org = new DocumentationOrganizer(this.projectRoot);
                    org.findMisplacedDocs();
                    org.moveDocs(false);
                    
                    if (this.orgAlias) {
                        const rtc = new ReportTypeCreator(this.orgAlias);
                        await rtc.createAllReportTypes({ org: this.orgAlias });
                    }
                } else {
                    console.log('Usage: salesforce-standards-cli fix [docs|reports|all]');
                }
                break;
                
            case 'report':
                const val = new SalesforceStandardsValidator(this.projectRoot);
                await val.runFullValidation({ org: this.orgAlias });
                break;
                
            case 'help':
            case '--help':
            case '-h':
                this.showHelp();
                break;
                
            default:
                console.log(`Unknown command: ${command}`);
                this.showHelp();
        }
        
        this.rl.close();
    }

    /**
     * Show command line help
     */
    showHelp() {
        console.log('\nSalesforce Standards CLI - Comprehensive standards management\n');
        console.log('Interactive mode:');
        console.log('  salesforce-standards-cli\n');
        console.log('Command mode:');
        console.log('  salesforce-standards-cli <command> [options]\n');
        console.log('Commands:');
        console.log('  validate, check     Run full compliance validation');
        console.log('  fix docs           Fix documentation organization');
        console.log('  fix reports        Create missing report types');
        console.log('  fix all            Fix all issues');
        console.log('  report             Generate compliance report');
        console.log('  help               Show this help message\n');
        console.log('Examples:');
        console.log('  salesforce-standards-cli                    # Interactive mode');
        console.log('  salesforce-standards-cli validate           # Run validation');
        console.log('  salesforce-standards-cli fix all            # Fix all issues');
    }
}

// Start the CLI
if (require.main === module) {
    const cli = new SalesforceStandardsCLI();
    cli.start().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = SalesforceStandardsCLI;