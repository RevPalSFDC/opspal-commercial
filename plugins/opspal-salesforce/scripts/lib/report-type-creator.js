#!/usr/bin/env node

/**
 * Automatic Report Type Creation Utility
 * Creates report types for custom objects with appropriate relationships
 * Ensures comprehensive reporting capabilities for all custom objects
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ReportTypeCreator {
    constructor(orgAlias) {
        this.orgAlias = orgAlias || process.env.SF_TARGET_ORG || 'DEFAULT_TARGET_ORG';
        this.reportTypes = [];
        this.createdTypes = [];
        this.failedTypes = [];
        this.backups = [];
        this.transactionId = Date.now();
    }

    /**
     * Query existing report types in the org
     */
    async queryExistingReportTypes() {
        console.log('🔍 Querying existing report types...\n');
        
        try {
            const query = "SELECT DeveloperName, Description, BaseObject FROM ReportType";
            const result = execSync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8' }
            );
            
            const data = JSON.parse(result);
            if (data.status === 0 && data.result.records) {
                return data.result.records;
            }
            return [];
        } catch (error) {
            console.error('❌ Failed to query report types:', error.message);
            return [];
        }
    }

    /**
     * Create report type metadata XML
     */
    generateReportTypeXML(config) {
        const {
            developerName,
            masterLabel,
            description,
            baseObject,
            category,
            deployed = true,
            sections = []
        } = config;

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <baseObject>${baseObject}</baseObject>
    <category>${category || 'other'}</category>
    <deployed>${deployed}</deployed>
    <description>${description || `Report type for ${masterLabel}`}</description>
    <label>${masterLabel}</label>`;

        // Add sections for related objects
        sections.forEach(section => {
            xml += `
    <join>
        <outerJoin>${section.outerJoin || false}</outerJoin>
        <relationship>${section.relationship}</relationship>
    </join>`;
        });

        xml += `
    <sections>
        <columns>`;

        // Add standard fields for base object
        const standardFields = this.getStandardFieldsForObject(baseObject);
        standardFields.forEach(field => {
            xml += `
            <checkedByDefault>true</checkedByDefault>
            <field>${field}</field>
            <table>${baseObject}</table>`;
        });

        xml += `
        </columns>
        <masterLabel>${baseObject} Details</masterLabel>
    </sections>`;

        // Add sections for related objects
        sections.forEach(section => {
            xml += `
    <sections>
        <columns>`;
            
            const relatedFields = this.getStandardFieldsForObject(section.relatedObject);
            relatedFields.forEach(field => {
                xml += `
            <checkedByDefault>false</checkedByDefault>
            <field>${section.relatedObject}.${field}</field>
            <table>${section.relatedObject}</table>`;
            });

            xml += `
        </columns>
        <masterLabel>${section.label || section.relatedObject} Details</masterLabel>
    </sections>`;
        });

        xml += `
</ReportType>`;

        return xml;
    }

    /**
     * Get standard fields for an object
     */
    getStandardFieldsForObject(objectName) {
        // Common fields that should be included by default
        const commonFields = ['Id', 'Name', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById', 'OwnerId'];
        
        // Object-specific standard fields
        const objectSpecificFields = {
            'Account': ['Type', 'Industry', 'AnnualRevenue', 'NumberOfEmployees'],
            'Contact': ['Email', 'Phone', 'Title', 'AccountId'],
            'Opportunity': ['StageName', 'Amount', 'CloseDate', 'Probability'],
            'Lead': ['Status', 'Company', 'Email', 'LeadSource'],
            'Case': ['Status', 'Priority', 'Origin', 'Subject'],
            'Contract': ['Status', 'StartDate', 'EndDate', 'ContractTerm']
        };

        if (objectSpecificFields[objectName]) {
            return [...commonFields, ...objectSpecificFields[objectName]];
        }
        
        return commonFields;
    }

    /**
     * Backup existing report type metadata
     */
    async backupExistingMetadata(reportTypeName) {
        const backupDir = path.join(process.cwd(), '.backups', 'report-types', this.transactionId.toString());
        const metadataPath = path.join(process.cwd(), 'force-app', 'main', 'default', 'reportTypes', `${reportTypeName}.reportType-meta.xml`);
        
        if (fs.existsSync(metadataPath)) {
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const backupPath = path.join(backupDir, `${reportTypeName}.reportType-meta.xml`);
            fs.copyFileSync(metadataPath, backupPath);
            
            this.backups.push({
                original: metadataPath,
                backup: backupPath,
                reportType: reportTypeName
            });
            
            console.log(`  📦 Backed up existing metadata for ${reportTypeName}`);
            return backupPath;
        }
        return null;
    }

    /**
     * Rollback changes on failure
     */
    async rollbackChanges() {
        console.log('\n⚠️  Rolling back changes...');
        
        for (const backup of this.backups) {
            try {
                if (fs.existsSync(backup.backup)) {
                    fs.copyFileSync(backup.backup, backup.original);
                    console.log(`  ↩️  Restored ${backup.reportType}`);
                }
            } catch (error) {
                console.error(`  ❌ Failed to restore ${backup.reportType}: ${error.message}`);
            }
        }
        
        // Clean up created files that don't have backups
        for (const created of this.createdTypes) {
            const hasBackup = this.backups.some(b => b.reportType === created.developerName);
            if (!hasBackup) {
                const filePath = path.join(process.cwd(), 'force-app', 'main', 'default', 'reportTypes', `${created.developerName}.reportType-meta.xml`);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`  🗑️  Removed newly created ${created.developerName}`);
                }
            }
        }
        
        console.log('✅ Rollback completed\n');
    }

    /**
     * Clean up backup files after successful operation
     */
    cleanupBackups() {
        const backupDir = path.join(process.cwd(), '.backups', 'report-types', this.transactionId.toString());
        if (fs.existsSync(backupDir)) {
            fs.rmSync(backupDir, { recursive: true, force: true });
        }
    }

    /**
     * Create report type for a custom object
     */
    async createReportType(objectName, options = {}) {
        console.log(`📊 Creating report type for ${objectName}...`);

        // Check if report type already exists
        const existingTypes = await this.queryExistingReportTypes();
        const exists = existingTypes.some(rt => 
            rt.BaseObject === objectName || 
            rt.DeveloperName === options.developerName
        );

        if (exists && !options.force) {
            console.log(`⚠️  Report type for ${objectName} already exists. Use --force to recreate.\n`);
            return false;
        }

        // Determine relationships
        const relationships = await this.discoverRelationships(objectName);
        
        // Generate report type configurations
        const configs = this.generateReportTypeConfigs(objectName, relationships, options);

        for (const config of configs) {
            try {
                // Backup existing metadata if it exists
                await this.backupExistingMetadata(config.developerName);
                
                // Create metadata file
                const metadataDir = path.join(process.cwd(), 'force-app', 'main', 'default', 'reportTypes');
                if (!fs.existsSync(metadataDir)) {
                    fs.mkdirSync(metadataDir, { recursive: true });
                }

                const fileName = `${config.developerName}.reportType-meta.xml`;
                const filePath = path.join(metadataDir, fileName);
                
                const xml = this.generateReportTypeXML(config);
                fs.writeFileSync(filePath, xml);

                // Deploy to org
                if (!options.skipDeploy) {
                    console.log(`  Deploying ${config.developerName}...`);
                    const deployResult = execSync(
                        `sf project deploy start --metadata ReportType:${config.developerName} --target-org ${this.orgAlias} --json`,
                        { encoding: 'utf8' }
                    );
                    
                    const result = JSON.parse(deployResult);
                    if (result.status === 0) {
                        console.log(`  ✅ Successfully created: ${config.masterLabel}\n`);
                        this.createdTypes.push(config);
                    } else {
                        throw new Error(result.message || 'Deployment failed');
                    }
                } else {
                    console.log(`  ✅ Metadata created: ${fileName}\n`);
                    this.createdTypes.push(config);
                }
            } catch (error) {
                console.error(`  ❌ Failed to create ${config.developerName}: ${error.message}\n`);
                this.failedTypes.push({ config, error: error.message });
                
                // If we have failures and auto-rollback is enabled
                if (options.autoRollback !== false) {
                    console.log('\n🔄 Auto-rollback triggered due to failure');
                    await this.rollbackChanges();
                    throw new Error(`Report type creation failed: ${error.message}`);
                }
            }
        }

        return this.createdTypes.length > 0;
    }

    /**
     * Discover relationships for an object
     */
    async discoverRelationships(objectName) {
        console.log(`  Discovering relationships for ${objectName}...`);
        
        try {
            const describeResult = execSync(
                `sf sobject describe ${objectName} --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8' }
            );
            
            const data = JSON.parse(describeResult);
            if (data.status !== 0) {
                throw new Error('Failed to describe object');
            }

            const relationships = [];
            
            // Find lookup and master-detail relationships
            data.result.fields.forEach(field => {
                if (field.type === 'reference' && field.referenceTo && field.referenceTo.length > 0) {
                    relationships.push({
                        fieldName: field.name,
                        relationshipName: field.relationshipName,
                        referenceTo: field.referenceTo[0],
                        type: field.updateable ? 'lookup' : 'master-detail'
                    });
                }
            });

            console.log(`  Found ${relationships.length} relationships\n`);
            return relationships;
        } catch (error) {
            console.error(`  ⚠️  Failed to discover relationships: ${error.message}\n`);
            return [];
        }
    }

    /**
     * Generate report type configurations based on relationships
     */
    generateReportTypeConfigs(objectName, relationships, options) {
        const configs = [];
        const baseLabel = objectName.replace('__c', '').replace(/_/g, ' ');
        
        // 1. Basic report type (object alone)
        configs.push({
            developerName: `${objectName.replace('__c', '')}_Report`,
            masterLabel: `${baseLabel} Reports`,
            description: `Reports on ${baseLabel} records`,
            baseObject: objectName,
            category: options.category || 'other',
            sections: []
        });

        // 2. Report types with parent relationships
        const parentRelationships = relationships.filter(r => 
            ['Account', 'Contact', 'Opportunity', 'Contract'].includes(r.referenceTo)
        );

        parentRelationships.forEach(rel => {
            // With parent
            configs.push({
                developerName: `${objectName.replace('__c', '')}_with_${rel.referenceTo}`,
                masterLabel: `${baseLabel} with ${rel.referenceTo}`,
                description: `${baseLabel} records with their related ${rel.referenceTo}`,
                baseObject: objectName,
                category: options.category || 'other',
                sections: [{
                    relationship: rel.relationshipName,
                    relatedObject: rel.referenceTo,
                    outerJoin: false,
                    label: rel.referenceTo
                }]
            });

            // Without parent (for gap analysis)
            configs.push({
                developerName: `${objectName.replace('__c', '')}_without_${rel.referenceTo}`,
                masterLabel: `${baseLabel} without ${rel.referenceTo}`,
                description: `${baseLabel} records without related ${rel.referenceTo}`,
                baseObject: objectName,
                category: options.category || 'other',
                sections: [{
                    relationship: rel.relationshipName,
                    relatedObject: rel.referenceTo,
                    outerJoin: true,
                    label: rel.referenceTo
                }]
            });
        });

        // 3. Custom relationships between custom objects
        const customRelationships = relationships.filter(r => r.referenceTo.endsWith('__c'));
        
        customRelationships.forEach(rel => {
            configs.push({
                developerName: `${objectName.replace('__c', '')}_with_${rel.referenceTo.replace('__c', '')}`,
                masterLabel: `${baseLabel} with ${rel.referenceTo.replace('__c', '').replace(/_/g, ' ')}`,
                description: `${baseLabel} records with related ${rel.referenceTo.replace('__c', '').replace(/_/g, ' ')}`,
                baseObject: objectName,
                category: options.category || 'other',
                sections: [{
                    relationship: rel.relationshipName,
                    relatedObject: rel.referenceTo,
                    outerJoin: false,
                    label: rel.referenceTo.replace('__c', '').replace(/_/g, ' ')
                }]
            });
        });

        return configs;
    }

    /**
     * Create report types for all custom objects
     */
    async createAllReportTypes(options = {}) {
        console.log('🚀 Creating report types for all custom objects...\n');
        
        // Query all custom objects
        const customObjects = await this.queryCustomObjects();
        
        if (customObjects.length === 0) {
            console.log('No custom objects found.\n');
            return;
        }

        console.log(`Found ${customObjects.length} custom objects.\n`);
        
        let hasErrors = false;
        
        for (const obj of customObjects) {
            try {
                await this.createReportType(obj, options);
            } catch (error) {
                hasErrors = true;
                console.error(`Failed to process ${obj}: ${error.message}`);
                if (options.stopOnError) {
                    break;
                }
            }
        }

        this.generateSummary();
        
        // Clean up backups if everything succeeded
        if (!hasErrors && this.failedTypes.length === 0) {
            this.cleanupBackups();
        }
    }

    /**
     * Query all custom objects in the org
     */
    async queryCustomObjects() {
        try {
            const result = execSync(
                `sf sobject list --target-org ${this.orgAlias} --sobject custom --json`,
                { encoding: 'utf8' }
            );
            
            const data = JSON.parse(result);
            if (data.status === 0 && data.result) {
                return data.result.map(obj => obj.name);
            }
            return [];
        } catch (error) {
            console.error('❌ Failed to query custom objects:', error.message);
            return [];
        }
    }

    /**
     * Generate summary report
     */
    generateSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 Report Type Creation Summary\n');
        
        if (this.createdTypes.length > 0) {
            console.log(`✅ Successfully created ${this.createdTypes.length} report types:`);
            this.createdTypes.forEach(rt => {
                console.log(`   - ${rt.masterLabel} (${rt.developerName})`);
            });
        }
        
        if (this.failedTypes.length > 0) {
            console.log(`\n❌ Failed to create ${this.failedTypes.length} report types:`);
            this.failedTypes.forEach(ft => {
                console.log(`   - ${ft.config.masterLabel}: ${ft.error}`);
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
        }
    });
    
    const orgAlias = options.org || process.env.SF_TARGET_ORG;
    const creator = new ReportTypeCreator(orgAlias);
    
    async function run() {
        if (options.help || !objectName) {
            console.log('Report Type Creator - Automatically create report types for custom objects\n');
            console.log('Usage: node report-type-creator.js <object|all> [options]\n');
            console.log('Arguments:');
            console.log('  <object>    Name of the custom object (e.g., Subscription__c)');
            console.log('  all         Create report types for all custom objects\n');
            console.log('Options:');
            console.log('  --org <alias>       Target org alias');
            console.log('  --category <cat>    Report category (other, accounts, opportunities, etc.)');
            console.log('  --force             Recreate existing report types');
            console.log('  --skip-deploy       Create metadata files without deploying');
            console.log('  --no-rollback       Disable automatic rollback on failure');
            console.log('  --stop-on-error     Stop processing on first error');
            console.log('  --help              Show this help message\n');
            console.log('Examples:');
            console.log('  node report-type-creator.js Subscription__c --org myorg');
            console.log('  node report-type-creator.js all --category other');
            console.log('  node report-type-creator.js Contract__c --force --skip-deploy');
            return;
        }
        
        if (objectName === 'all') {
            await creator.createAllReportTypes(options);
        } else {
            await creator.createReportType(objectName, options);
        }
    }
    
    run().catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = ReportTypeCreator;