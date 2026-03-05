#!/usr/bin/env node

/**
 * Package.xml Generator for Targeted Metadata Retrieval
 * 
 * Generates optimized package.xml files for efficient metadata retrieval
 * Supports batching, filtering, and incremental retrieval strategies
 * 
 * Usage:
 *   const generator = new PackageXMLGenerator();
 *   const xml = generator.generateForObject('Opportunity', ['ValidationRule', 'Flow']);
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class PackageXMLGenerator {
    constructor(apiVersion = '62.0') {
        this.apiVersion = apiVersion;
        this.outputDir = path.join(__dirname, '..', '..', '.metadata-packages');
    }

    /**
     * Initialize output directory
     */
    async init() {
        await fs.mkdir(this.outputDir, { recursive: true });
    }

    /**
     * Generate package.xml for specific object and metadata types
     */
    generateForObject(objectName, metadataTypes = null) {
        const types = metadataTypes || this.getDefaultMetadataTypes();
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${types.map(type => this.generateTypeSection(type, objectName)).join('\n')}
    <version>${this.apiVersion}</version>
</Package>`;
        
        return xml;
    }

    /**
     * Generate type section for package.xml
     */
    generateTypeSection(metadataType, objectName = null) {
        const memberPattern = this.getMemberPattern(metadataType, objectName);
        
        return `    <types>
        <members>${memberPattern}</members>
        <name>${metadataType}</name>
    </types>`;
    }

    /**
     * Get member pattern for metadata type
     */
    getMemberPattern(metadataType, objectName) {
        const patterns = {
            'ValidationRule': objectName ? `${objectName}.*` : '*',
            'Flow': '*',
            'FlowDefinition': '*',
            'Layout': objectName ? `${objectName}-*` : '*',
            'RecordType': objectName ? `${objectName}.*` : '*',
            'Profile': '*',
            'PermissionSet': '*',
            'CustomField': objectName ? `${objectName}.*` : '*',
            'CustomObject': objectName || '*',
            'ApexTrigger': objectName ? `*${objectName}*` : '*',
            'ApexClass': '*',
            'LightningComponentBundle': '*',
            'FlexiPage': objectName ? `*${objectName}*` : '*'
        };
        
        return patterns[metadataType] || '*';
    }

    /**
     * Get default metadata types for comprehensive analysis
     */
    getDefaultMetadataTypes() {
        return [
            'ValidationRule',
            'Flow',
            'FlowDefinition',
            'Layout',
            'RecordType',
            'CustomField',
            'ApexTrigger'
        ];
    }

    /**
     * Generate minimal package for validation rules and formulas
     */
    async generateValidationRulePackage(objectName) {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${objectName}.*</members>
        <name>ValidationRule</name>
    </types>
    <version>${this.apiVersion}</version>
</Package>`;
        
        const filename = `package-validation-rules-${objectName}.xml`;
        const filepath = path.join(this.outputDir, filename);
        
        await this.init();
        await fs.writeFile(filepath, xml);
        
        return filepath;
    }

    /**
     * Generate package XML for flows (synchronous, returns string)
     * Used by FlowMetadataRetriever for in-memory package generation
     */
    generateForFlows() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>Flow</name>
    </types>
    <version>${this.apiVersion}</version>
</Package>`;
    }

    /**
     * Generate package for flows and process builders (async, writes to file)
     */
    async generateFlowPackage() {
        const xml = this.generateForFlows();

        const filename = 'package-flows.xml';
        const filepath = path.join(this.outputDir, filename);

        await this.init();
        await fs.writeFile(filepath, xml);

        return filepath;
    }

    /**
     * Generate package for layouts and field requirements
     */
    async generateLayoutPackage(objectName) {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${objectName}-*</members>
        <name>Layout</name>
    </types>
    <types>
        <members>${objectName}.*</members>
        <name>RecordType</name>
    </types>
    <version>${this.apiVersion}</version>
</Package>`;
        
        const filename = `package-layouts-${objectName}.xml`;
        const filepath = path.join(this.outputDir, filename);
        
        await this.init();
        await fs.writeFile(filepath, xml);
        
        return filepath;
    }

    /**
     * Generate package for profiles (batched to avoid timeouts)
     */
    async generateProfilePackages(batchSize = 10) {
        // Get all profile names first
        const profiles = await this.listProfiles();
        const batches = [];
        
        for (let i = 0; i < profiles.length; i += batchSize) {
            const batch = profiles.slice(i, i + batchSize);
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
${batch.map(p => `        <members>${p}</members>`).join('\n')}
        <name>Profile</name>
    </types>
    <version>${this.apiVersion}</version>
</Package>`;
            
            const filename = `package-profiles-batch-${Math.floor(i / batchSize) + 1}.xml`;
            const filepath = path.join(this.outputDir, filename);
            
            await fs.writeFile(filepath, xml);
            batches.push(filepath);
        }
        
        return batches;
    }

    /**
     * List all profiles in org
     */
    async listProfiles(orgAlias = null) {
        const org = orgAlias || process.env.SF_TARGET_ORG || 'myorg';
        const cmd = `sf data query --query "SELECT Name FROM Profile ORDER BY Name" --json --target-org ${org}`;
        
        try {
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            if (result.status === 0 && result.result.records) {
                return result.result.records.map(p => p.Name);
            }
        } catch (error) {
            console.error('Could not list profiles:', error.message);
        }
        
        return [];
    }

    /**
     * Generate comprehensive package for full object analysis
     */
    async generateComprehensivePackage(objectName) {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${objectName}</members>
        <name>CustomObject</name>
    </types>
    <types>
        <members>${objectName}.*</members>
        <name>CustomField</name>
    </types>
    <types>
        <members>${objectName}.*</members>
        <name>ValidationRule</name>
    </types>
    <types>
        <members>${objectName}.*</members>
        <name>RecordType</name>
    </types>
    <types>
        <members>${objectName}-*</members>
        <name>Layout</name>
    </types>
    <types>
        <members>*${objectName}*</members>
        <name>Flow</name>
    </types>
    <types>
        <members>*${objectName}*</members>
        <name>ApexTrigger</name>
    </types>
    <types>
        <members>*${objectName}*</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>*${objectName}*</members>
        <name>FlexiPage</name>
    </types>
    <version>${this.apiVersion}</version>
</Package>`;
        
        const filename = `package-comprehensive-${objectName}.xml`;
        const filepath = path.join(this.outputDir, filename);
        
        await this.init();
        await fs.writeFile(filepath, xml);
        
        return filepath;
    }

    /**
     * Generate incremental package based on last modified date
     */
    async generateIncrementalPackage(sinceDate, metadataTypes = null) {
        // This would query for recently modified components
        // For now, generate a standard package
        const types = metadataTypes || ['Flow', 'ValidationRule', 'ApexClass', 'ApexTrigger'];
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${types.map(type => `    <types>
        <members>*</members>
        <name>${type}</name>
    </types>`).join('\n')}
    <version>${this.apiVersion}</version>
</Package>`;
        
        const filename = `package-incremental-${sinceDate.toISOString().split('T')[0]}.xml`;
        const filepath = path.join(this.outputDir, filename);
        
        await this.init();
        await fs.writeFile(filepath, xml);
        
        return filepath;
    }

    /**
     * Execute retrieval with generated package
     */
    async retrieveWithPackage(packagePath, orgAlias = null, outputDir = null) {
        const org = orgAlias || process.env.SF_TARGET_ORG || 'myorg';
        const output = outputDir || path.join(this.outputDir, 'retrieved', Date.now().toString());
        
        console.log(`📦 Retrieving metadata with ${path.basename(packagePath)}...`);
        
        const cmd = `sf project retrieve start --manifest "${packagePath}" --target-org ${org} --output-dir "${output}" --wait 10`;
        
        try {
            execSync(cmd, { encoding: 'utf8', stdio: 'inherit' });
            console.log(`✅ Metadata retrieved to: ${output}`);
            return output;
        } catch (error) {
            console.error('❌ Retrieval failed:', error.message);
            
            // Try with longer wait time
            console.log('🔄 Retrying with longer wait time...');
            const retryCmd = cmd.replace('--wait 10', '--wait 30');
            
            try {
                execSync(retryCmd, { encoding: 'utf8', stdio: 'inherit' });
                console.log(`✅ Metadata retrieved to: ${output}`);
                return output;
            } catch (retryError) {
                console.error('❌ Retry failed:', retryError.message);
                throw retryError;
            }
        }
    }

    /**
     * Generate and execute retrieval plan
     */
    async executeRetrievalPlan(objectName, orgAlias = null) {
        await this.init();
        
        console.log(`📋 Executing retrieval plan for ${objectName}...`);
        
        const results = {
            success: [],
            failed: []
        };
        
        // Step 1: Validation Rules
        try {
            console.log('\n1️⃣ Retrieving Validation Rules...');
            const vrPackage = await this.generateValidationRulePackage(objectName);
            const vrOutput = await this.retrieveWithPackage(vrPackage, orgAlias);
            results.success.push({ type: 'ValidationRule', output: vrOutput });
        } catch (error) {
            results.failed.push({ type: 'ValidationRule', error: error.message });
        }
        
        // Step 2: Flows
        try {
            console.log('\n2️⃣ Retrieving Flows...');
            const flowPackage = await this.generateFlowPackage();
            const flowOutput = await this.retrieveWithPackage(flowPackage, orgAlias);
            results.success.push({ type: 'Flow', output: flowOutput });
        } catch (error) {
            results.failed.push({ type: 'Flow', error: error.message });
        }
        
        // Step 3: Layouts
        try {
            console.log('\n3️⃣ Retrieving Layouts...');
            const layoutPackage = await this.generateLayoutPackage(objectName);
            const layoutOutput = await this.retrieveWithPackage(layoutPackage, orgAlias);
            results.success.push({ type: 'Layout', output: layoutOutput });
        } catch (error) {
            results.failed.push({ type: 'Layout', error: error.message });
        }
        
        // Step 4: Profiles (in batches)
        try {
            console.log('\n4️⃣ Retrieving Profiles (batched)...');
            const profilePackages = await this.generateProfilePackages(5); // Small batches
            
            for (let i = 0; i < profilePackages.length; i++) {
                console.log(`  Batch ${i + 1}/${profilePackages.length}...`);
                try {
                    const profileOutput = await this.retrieveWithPackage(profilePackages[i], orgAlias);
                    results.success.push({ type: `Profile_Batch_${i + 1}`, output: profileOutput });
                } catch (error) {
                    results.failed.push({ type: `Profile_Batch_${i + 1}`, error: error.message });
                }
            }
        } catch (error) {
            results.failed.push({ type: 'Profile', error: error.message });
        }
        
        // Summary
        console.log('\n📊 Retrieval Summary:');
        console.log(`✅ Successful: ${results.success.length}`);
        console.log(`❌ Failed: ${results.failed.length}`);
        
        if (results.failed.length > 0) {
            console.log('\nFailed retrievals:');
            results.failed.forEach(f => console.log(`  - ${f.type}: ${f.error}`));
        }
        
        return results;
    }
}

// Export for use by other scripts
module.exports = PackageXMLGenerator;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Usage: package-xml-generator.js <command> [options]');
        console.log('Commands:');
        console.log('  generate <object> [type]  - Generate package.xml');
        console.log('  retrieve <object> [org]   - Execute full retrieval plan');
        console.log('  validation <object>       - Generate validation rule package');
        console.log('  flows                     - Generate flow package');
        console.log('  layouts <object>          - Generate layout package');
        console.log('  comprehensive <object>    - Generate comprehensive package');
        process.exit(1);
    }
    
    const command = args[0];
    const generator = new PackageXMLGenerator();
    
    (async () => {
        await generator.init();
        
        switch (command) {
            case 'generate':
                const objectName = args[1];
                const metadataType = args[2];
                const xml = generator.generateForObject(objectName, metadataType ? [metadataType] : null);
                console.log(xml);
                break;
                
            case 'retrieve':
                const retrieveObject = args[1];
                const org = args[2];
                await generator.executeRetrievalPlan(retrieveObject, org);
                break;
                
            case 'validation':
                const vrObject = args[1];
                const vrPath = await generator.generateValidationRulePackage(vrObject);
                console.log(`Generated: ${vrPath}`);
                break;
                
            case 'flows':
                const flowPath = await generator.generateFlowPackage();
                console.log(`Generated: ${flowPath}`);
                break;
                
            case 'layouts':
                const layoutObject = args[1];
                const layoutPath = await generator.generateLayoutPackage(layoutObject);
                console.log(`Generated: ${layoutPath}`);
                break;
                
            case 'comprehensive':
                const compObject = args[1];
                const compPath = await generator.generateComprehensivePackage(compObject);
                console.log(`Generated: ${compPath}`);
                break;
                
            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    })().catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}