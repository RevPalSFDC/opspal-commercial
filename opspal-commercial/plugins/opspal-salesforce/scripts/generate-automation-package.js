#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Metadata types to retrieve
const METADATA_TYPES = [
    'ApexTrigger',
    'Flow', 
    'WorkflowRule',
    'ValidationRule',
    'AssignmentRule',
    'AutoResponseRule', 
    'EscalationRule',
    'MatchingRule',
    'DuplicateRule'
];

// Generate package.xml
function generatePackageXml(metadataTypes) {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const packageStart = '<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';
    const packageEnd = '    <version>62.0</version>\n</Package>';

    const typesContent = metadataTypes.map(type => 
        `    <types>
        <name>${type}</name>
        <members>*</members>
    </types>`
    ).join('\n');

    return `${xmlHeader}${packageStart}${typesContent}\n${packageEnd}`;
}

// Write package.xml to file
async function writePackageXml() {
    const packageXmlContent = generatePackageXml(METADATA_TYPES);
    const packageXmlPath = path.join(__dirname, '..', 'manifest', 'automation-package.xml');
    
    // Ensure manifest directory exists
    const manifestDir = path.dirname(packageXmlPath);
    if (!fs.existsSync(manifestDir)) {
        fs.mkdirSync(manifestDir, { recursive: true });
    }

    fs.writeFileSync(packageXmlPath, packageXmlContent);
    console.log(`✅ Package XML generated: ${packageXmlPath}`);
    return packageXmlPath;
}

// Retrieve metadata using sf CLI
async function retrieveMetadata(packageXmlPath) {
    try {
        console.log('🔍 Starting metadata retrieval...');
        const outputDir = path.join(__dirname, '..', 'retrieved-metadata');
        
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Retrieve metadata
        const { stdout, stderr } = await execPromise(
            `sf project retrieve start --manifest "${packageXmlPath}" --output-dir "${outputDir}"`
        );

        if (stderr) {
            console.warn('⚠️ Warning during retrieval:', stderr);
        }

        console.log('✅ Metadata retrieval completed successfully');
        return outputDir;
    } catch (error) {
        console.error('❌ Metadata retrieval failed:', error);
        throw error;
    }
}

// Main execution
async function main() {
    try {
        const packageXmlPath = await writePackageXml();
        const retrievedMetadataDir = await retrieveMetadata(packageXmlPath);
        
        console.log(`🗂️ Metadata retrieved to: ${retrievedMetadataDir}`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Automation metadata retrieval failed:', error);
        process.exit(1);
    }
}

main();