#!/usr/bin/env node

/**
 * Lightning Page Related List Management Utility
 * Automatically adds related lists to Lightning Pages when new relationships are created
 * Ensures comprehensive visibility of related data across Lightning Experience
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const builder = new xml2js.Builder();

class LightningPageEnhancer {
    constructor(orgAlias) {
        this.orgAlias = orgAlias || process.env.SF_TARGET_ORG || 'DEFAULT_TARGET_ORG';
        this.parser = new xml2js.Parser();
        this.updatedPages = [];
        this.failedPages = [];
        this.backups = [];
        this.transactionId = Date.now();
        this.modifiedFiles = [];
    }

    /**
     * Query Lightning Pages for a specific object
     */
    async queryLightningPages(objectName) {
        console.log(`🔍 Querying Lightning Pages for ${objectName}...\n`);
        
        try {
            const query = `SELECT Id, DeveloperName, MasterLabel FROM FlexiPage WHERE EntityDefinitionId = '${objectName}'`;
            const result = execSync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --use-tooling-api --json`,
                { encoding: 'utf8' }
            );
            
            const data = JSON.parse(result);
            if (data.status === 0 && data.result.records) {
                console.log(`Found ${data.result.records.length} Lightning Pages for ${objectName}\n`);
                return data.result.records;
            }
            return [];
        } catch (error) {
            console.error('❌ Failed to query Lightning Pages:', error.message);
            return [];
        }
    }

    /**
     * Backup Lightning Page before modification
     */
    async backupLightningPage(pagePath) {
        const backupDir = path.join(process.cwd(), '.backups', 'lightning-pages', this.transactionId.toString());
        
        if (fs.existsSync(pagePath)) {
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const fileName = path.basename(pagePath);
            const backupPath = path.join(backupDir, fileName);
            fs.copyFileSync(pagePath, backupPath);
            
            this.backups.push({
                original: pagePath,
                backup: backupPath,
                pageName: fileName.replace('.flexipage-meta.xml', '')
            });
            
            console.log(`  📦 Backed up ${fileName}`);
            return backupPath;
        }
        return null;
    }

    /**
     * Rollback all changes
     */
    async rollbackChanges() {
        console.log('\n⚠️  Rolling back Lightning Page changes...');
        
        // Restore backups
        for (const backup of this.backups) {
            try {
                if (fs.existsSync(backup.backup)) {
                    fs.copyFileSync(backup.backup, backup.original);
                    console.log(`  ↩️  Restored ${backup.pageName}`);
                }
            } catch (error) {
                console.error(`  ❌ Failed to restore ${backup.pageName}: ${error.message}`);
            }
        }
        
        // Re-deploy original versions if needed
        if (this.updatedPages.length > 0) {
            console.log('  🔄 Re-deploying original versions...');
            for (const pageName of this.updatedPages) {
                try {
                    await this.deployLightningPage(pageName);
                } catch (error) {
                    console.error(`  ⚠️  Failed to re-deploy ${pageName}: ${error.message}`);
                }
            }
        }
        
        console.log('✅ Rollback completed\n');
    }

    /**
     * Clean up backup files after successful operation
     */
    cleanupBackups() {
        const backupDir = path.join(process.cwd(), '.backups', 'lightning-pages', this.transactionId.toString());
        if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true, force: true });
            console.log('  🧹 Cleaned up backup files');
        }
    }

    /**
     * Validate Lightning Page XML before saving
     */
    validatePageXML(pageData) {
        // Check for required elements
        if (!pageData.FlexiPage) {
            throw new Error('Invalid FlexiPage structure: missing root element');
        }
        
        if (!pageData.FlexiPage.masterLabel) {
            throw new Error('Invalid FlexiPage: missing masterLabel');
        }
        
        if (!pageData.FlexiPage.type) {
            throw new Error('Invalid FlexiPage: missing type');
        }
        
        return true;
    }

    /**
     * Retrieve Lightning Page metadata
     */
    async retrieveLightningPage(pageName) {
        console.log(`  Retrieving ${pageName}...`);
        
        try {
            execSync(
                `sf project retrieve start --metadata "FlexiPage:${pageName}" --target-org ${this.orgAlias}`,
                { encoding: 'utf8', stdio: 'pipe' }
            );
            
            // Find the retrieved file
            const flexipageDir = path.join(process.cwd(), 'force-app', 'main', 'default', 'flexipages');
            const fileName = `${pageName}.flexipage-meta.xml`;
            const filePath = path.join(flexipageDir, fileName);
            
            if (fs.existsSync(filePath)) {
                console.log(`  ✅ Retrieved successfully\n`);
                return filePath;
            } else {
                throw new Error('Retrieved file not found');
            }
        } catch (error) {
            console.error(`  ❌ Failed to retrieve: ${error.message}\n`);
            return null;
        }
    }

    /**
     * Add related list to Lightning Page
     */
    async addRelatedListToPage(pagePath, relatedListConfig) {
        console.log(`  Adding related list: ${relatedListConfig.relatedListApiName}`);
        
        try {
            // Backup before modification
            await this.backupLightningPage(pagePath);
            // Read and parse the XML file
            const xmlContent = fs.readFileSync(pagePath, 'utf8');
            const pageData = await this.parser.parseStringPromise(xmlContent);
            
            // Find or create the appropriate region for related lists
            let relatedListRegion = this.findRelatedListRegion(pageData);
            
            if (!relatedListRegion) {
                relatedListRegion = this.createRelatedListRegion(pageData);
            }
            
            // Check if related list already exists
            const exists = this.relatedListExists(relatedListRegion, relatedListConfig.relatedListApiName);
            
            if (exists) {
                console.log(`  ⚠️  Related list already exists on page\n`);
                return false;
            }
            
            // Create the related list component
            const relatedListComponent = this.createRelatedListComponent(relatedListConfig);
            
            // Add to the region
            if (!relatedListRegion.itemInstances) {
                relatedListRegion.itemInstances = [];
            }
            
            if (!Array.isArray(relatedListRegion.itemInstances)) {
                relatedListRegion.itemInstances = [relatedListRegion.itemInstances];
            }
            
            relatedListRegion.itemInstances.push(relatedListComponent);
            
            // Validate before saving
            this.validatePageXML(pageData);
            
            // Convert back to XML and save
            const newXml = builder.buildObject(pageData);
            fs.writeFileSync(pagePath, newXml);
            this.modifiedFiles.push(pagePath);
            
            console.log(`  ✅ Related list added successfully\n`);
            return true;
        } catch (error) {
            console.error(`  ❌ Failed to add related list: ${error.message}\n`);
            return false;
        }
    }

    /**
     * Find the region containing related lists
     */
    findRelatedListRegion(pageData) {
        if (!pageData.FlexiPage || !pageData.FlexiPage.flexiPageRegions) {
            return null;
        }
        
        const regions = Array.isArray(pageData.FlexiPage.flexiPageRegions) 
            ? pageData.FlexiPage.flexiPageRegions 
            : [pageData.FlexiPage.flexiPageRegions];
        
        // Look for a region with related lists
        for (const region of regions) {
            if (region.itemInstances) {
                const items = Array.isArray(region.itemInstances) 
                    ? region.itemInstances 
                    : [region.itemInstances];
                
                const hasRelatedList = items.some(item => 
                    item.componentInstance && 
                    item.componentInstance[0] &&
                    item.componentInstance[0].componentName &&
                    item.componentInstance[0].componentName[0] === 'force:relatedListContainer'
                );
                
                if (hasRelatedList) {
                    return region;
                }
            }
        }
        
        // Return the main region if no specific related list region found
        return regions.find(r => r.name && r.name[0] === 'main') || regions[0];
    }

    /**
     * Create a new related list region
     */
    createRelatedListRegion(pageData) {
        const newRegion = {
            itemInstances: [],
            name: ['relatedListRegion'],
            type: ['Facet']
        };
        
        if (!pageData.FlexiPage.flexiPageRegions) {
            pageData.FlexiPage.flexiPageRegions = [];
        }
        
        if (!Array.isArray(pageData.FlexiPage.flexiPageRegions)) {
            pageData.FlexiPage.flexiPageRegions = [pageData.FlexiPage.flexiPageRegions];
        }
        
        pageData.FlexiPage.flexiPageRegions.push(newRegion);
        return newRegion;
    }

    /**
     * Check if related list already exists
     */
    relatedListExists(region, relatedListApiName) {
        if (!region.itemInstances) {
            return false;
        }
        
        const items = Array.isArray(region.itemInstances) 
            ? region.itemInstances 
            : [region.itemInstances];
        
        return items.some(item => {
            if (item.componentInstance && item.componentInstance[0]) {
                const props = item.componentInstance[0].componentInstanceProperties;
                if (props) {
                    const propArray = Array.isArray(props) ? props : [props];
                    return propArray.some(prop => 
                        prop.name && prop.name[0] === 'relatedListApiName' &&
                        prop.value && prop.value[0] === relatedListApiName
                    );
                }
            }
            return false;
        });
    }

    /**
     * Create a related list component
     */
    createRelatedListComponent(config) {
        return {
            componentInstance: [{
                componentInstanceProperties: [
                    {
                        name: ['relatedListApiName'],
                        value: [config.relatedListApiName]
                    },
                    {
                        name: ['relatedListComponentOverride'],
                        value: ['NONE']
                    },
                    {
                        name: ['rowsToDisplay'],
                        value: [config.rowsToDisplay || '10']
                    },
                    {
                        name: ['showActionBar'],
                        value: ['true']
                    }
                ],
                componentName: ['force:relatedListSingleContainer'],
                identifier: [`force_relatedListSingleContainer_${Date.now()}`]
            }]
        };
    }

    /**
     * Deploy updated Lightning Page
     */
    async deployLightningPage(pageName) {
        console.log(`  Deploying ${pageName}...`);
        
        try {
            const result = execSync(
                `sf project deploy start --metadata "FlexiPage:${pageName}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8' }
            );
            
            const data = JSON.parse(result);
            if (data.status === 0) {
                console.log(`  ✅ Deployed successfully\n`);
                return true;
            } else {
                throw new Error(data.message || 'Deployment failed');
            }
        } catch (error) {
            console.error(`  ❌ Deployment failed: ${error.message}\n`);
            return false;
        }
    }

    /**
     * Add related list to all Lightning Pages for an object
     */
    async addRelatedListToAllPages(objectName, relatedListConfig) {
        console.log(`\n🚀 Adding ${relatedListConfig.relatedListApiName} to all ${objectName} Lightning Pages\n`);
        
        // Query Lightning Pages
        const pages = await this.queryLightningPages(objectName);
        
        if (pages.length === 0) {
            console.log(`No Lightning Pages found for ${objectName}\n`);
            return;
        }
        
        for (const page of pages) {
            console.log(`\n📄 Processing: ${page.MasterLabel} (${page.DeveloperName})`);
            console.log('─'.repeat(50));
            
            // Retrieve the page
            const pagePath = await this.retrieveLightningPage(page.DeveloperName);
            
            if (!pagePath) {
                this.failedPages.push({
                    page: page.DeveloperName,
                    error: 'Failed to retrieve'
                });
                continue;
            }
            
            // Add related list
            const added = await this.addRelatedListToPage(pagePath, relatedListConfig);
            
            if (added) {
                // Deploy the page
                const deployed = await this.deployLightningPage(page.DeveloperName);
                
                if (deployed) {
                    this.updatedPages.push(page.DeveloperName);
                } else {
                    this.failedPages.push({
                        page: page.DeveloperName,
                        error: 'Deployment failed'
                    });
                    
                    // Rollback on deployment failure if enabled
                    if (relatedListConfig.autoRollback !== false) {
                        console.log('\n🔄 Auto-rollback triggered due to deployment failure');
                        await this.rollbackChanges();
                        throw new Error(`Lightning Page deployment failed for ${page.DeveloperName}`);
                    }
                }
            }
        }
        
        this.generateSummary();
        
        // Clean up backups if everything succeeded
        if (this.failedPages.length === 0) {
            this.cleanupBackups();
        }
    }

    /**
     * Discover and add all missing related lists
     */
    async autoDiscoverAndAdd(objectName) {
        console.log(`\n🔍 Auto-discovering relationships for ${objectName}...\n`);
        
        try {
            // Get object describe to find child relationships
            const describeResult = execSync(
                `sf sobject describe ${objectName} --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8' }
            );
            
            const data = JSON.parse(describeResult);
            if (data.status !== 0) {
                throw new Error('Failed to describe object');
            }
            
            // Find child relationships
            const childRelationships = data.result.childRelationships || [];
            
            console.log(`Found ${childRelationships.length} child relationships\n`);
            
            for (const relationship of childRelationships) {
                if (relationship.relationshipName) {
                    const config = {
                        relatedListApiName: relationship.relationshipName,
                        childObject: relationship.childSObject,
                        field: relationship.field,
                        rowsToDisplay: 10
                    };
                    
                    console.log(`\n🔗 Relationship: ${relationship.relationshipName}`);
                    console.log(`   Child Object: ${relationship.childSObject}`);
                    console.log(`   Field: ${relationship.field}\n`);
                    
                    await this.addRelatedListToAllPages(objectName, config);
                }
            }
        } catch (error) {
            console.error(`❌ Auto-discovery failed: ${error.message}\n`);
        }
    }

    /**
     * Generate summary report
     */
    generateSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 Lightning Page Enhancement Summary\n');
        
        if (this.updatedPages.length > 0) {
            console.log(`✅ Successfully updated ${this.updatedPages.length} pages:`);
            this.updatedPages.forEach(page => {
                console.log(`   - ${page}`);
            });
        }
        
        if (this.failedPages.length > 0) {
            console.log(`\n❌ Failed to update ${this.failedPages.length} pages:`);
            this.failedPages.forEach(fail => {
                console.log(`   - ${fail.page}: ${fail.error}`);
            });
        }
        
        console.log('\n' + '='.repeat(50) + '\n');
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    // Parse options
    const options = {};
    let objectName = null;
    let relatedList = null;
    
    args.forEach((arg, index) => {
        if (arg.startsWith('--')) {
            const key = arg.substring(2);
            const nextArg = args[index + 1];
            
            if (nextArg && !nextArg.startsWith('--')) {
                options[key] = nextArg;
            } else {
                options[key] = true;
            }
        } else if (index === 0) {
            objectName = arg;
        } else if (index === 1) {
            relatedList = arg;
        }
    });
    
    const orgAlias = options.org || process.env.SF_TARGET_ORG;
    const enhancer = new LightningPageEnhancer(orgAlias);
    
    async function run() {
        if (options.help || !objectName) {
            console.log('Lightning Page Enhancer - Automatically add related lists to Lightning Pages\n');
            console.log('Usage: node lightning-page-enhancer.js <object> [relatedList] [options]\n');
            console.log('Arguments:');
            console.log('  <object>        Object API name (e.g., Contract)');
            console.log('  [relatedList]   Related list API name (e.g., ContractSubscriptions)\n');
            console.log('Options:');
            console.log('  --org <alias>   Target org alias');
            console.log('  --auto          Auto-discover and add all relationships');
            console.log('  --rows <num>    Number of rows to display (default: 10)');
            console.log('  --no-rollback   Disable automatic rollback on failure');
            console.log('  --help          Show this help message\n');
            console.log('Examples:');
            console.log('  node lightning-page-enhancer.js Contract ContractSubscriptions');
            console.log('  node lightning-page-enhancer.js Account --auto');
            console.log('  node lightning-page-enhancer.js Opportunity Cases --rows 5');
            return;
        }
        
        if (options.auto) {
            await enhancer.autoDiscoverAndAdd(objectName);
        } else if (relatedList) {
            const config = {
                relatedListApiName: relatedList,
                rowsToDisplay: options.rows || 10
            };
            await enhancer.addRelatedListToAllPages(objectName, config);
        } else {
            console.error('Please specify a related list name or use --auto');
            process.exit(1);
        }
    }
    
    run().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = LightningPageEnhancer;
