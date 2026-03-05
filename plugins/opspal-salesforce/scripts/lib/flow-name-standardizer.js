#!/usr/bin/env node

/**
 * Flow Name Standardizer Utility
 * 
 * Converts between Salesforce Flow naming conventions:
 * - MasterLabel (display): "Opp: Contract Generation"
 * - DeveloperName (API): "Opp_Contract_Generation_v2"
 * - File name: "Opp_Contract_Generation_v2.flow-meta.xml"
 * 
 * Usage:
 *   node flow-name-standardizer.js convert --label "Opp: Contract Generation"
 *   node flow-name-standardizer.js suggest --file "MyFlow.flow-meta.xml"
 *   node flow-name-standardizer.js fix --dir force-app/main/default/flows
 */

const fs = require('fs').promises;
const path = require('path');

class FlowNameStandardizer {
    constructor() {
        // Common patterns found in flow names
        this.patterns = {
            // Characters that become underscores
            separators: /[\s\-:\/\\,\.\(\)\[\]{}]/g,
            // Characters to remove entirely
            invalid: /[^a-zA-Z0-9_]/g,
            // Multiple underscores
            multipleUnderscores: /_+/g,
            // Leading/trailing underscores
            trimUnderscores: /^_+|_+$/g,
            // Version patterns
            versionSuffix: /_v\d+$/i,
            // Common abbreviations
            abbreviations: {
                'Opportunity': 'Opp',
                'Account': 'Acc',
                'Contact': 'Con',
                'Contract': 'Cont',
                'Quote': 'Qt',
                'Product': 'Prod',
                'Price Book': 'PB',
                'Subscription': 'Sub'
            }
        };
    }

    /**
     * Convert MasterLabel to DeveloperName
     */
    labelToDeveloperName(masterLabel, options = {}) {
        const { 
            addVersion = false, 
            versionNumber = 2,
            useAbbreviations = false,
            maxLength = 40 
        } = options;
        
        let developerName = masterLabel;
        
        // Apply abbreviations if requested
        if (useAbbreviations) {
            for (const [full, abbr] of Object.entries(this.patterns.abbreviations)) {
                const regex = new RegExp(full, 'gi');
                developerName = developerName.replace(regex, abbr);
            }
        }
        
        // Replace separators with underscores
        developerName = developerName.replace(this.patterns.separators, '_');
        
        // Remove invalid characters
        developerName = developerName.replace(this.patterns.invalid, '');
        
        // Collapse multiple underscores
        developerName = developerName.replace(this.patterns.multipleUnderscores, '_');
        
        // Trim underscores
        developerName = developerName.replace(this.patterns.trimUnderscores, '');
        
        // Ensure it starts with a letter
        if (!/^[a-zA-Z]/.test(developerName)) {
            developerName = 'Flow_' + developerName;
        }
        
        // Add version suffix if requested
        if (addVersion && !this.patterns.versionSuffix.test(developerName)) {
            developerName += '_v' + versionNumber;
        }
        
        // Truncate if too long
        if (developerName.length > maxLength) {
            developerName = developerName.substring(0, maxLength);
            // Clean up any trailing underscore from truncation
            developerName = developerName.replace(this.patterns.trimUnderscores, '');
        }
        
        return developerName;
    }

    /**
     * Try to convert DeveloperName back to likely MasterLabel
     */
    developerNameToLabel(developerName) {
        let label = developerName;
        
        // Remove version suffix
        label = label.replace(this.patterns.versionSuffix, '');
        
        // Expand common abbreviations
        for (const [full, abbr] of Object.entries(this.patterns.abbreviations)) {
            const regex = new RegExp(`\\b${abbr}\\b`, 'g');
            label = label.replace(regex, full);
        }
        
        // Add spaces before capitals (camelCase to Title Case)
        label = label.replace(/([a-z])([A-Z])/g, '$1 $2');
        
        // Replace underscores with spaces or colons based on context
        // If it looks like a prefix pattern, use colon
        label = label.replace(/^([A-Z][a-z]+)_/, '$1: ');
        
        // Other underscores become spaces
        label = label.replace(/_/g, ' ');
        
        // Clean up multiple spaces
        label = label.replace(/\s+/g, ' ').trim();
        
        return label;
    }

    /**
     * Generate multiple possible DeveloperName variations
     */
    generateVariations(masterLabel) {
        const variations = [];
        
        // Standard conversion
        variations.push(this.labelToDeveloperName(masterLabel));
        
        // With version suffix
        variations.push(this.labelToDeveloperName(masterLabel, { addVersion: true }));
        variations.push(this.labelToDeveloperName(masterLabel, { addVersion: true, versionNumber: 1 }));
        variations.push(this.labelToDeveloperName(masterLabel, { addVersion: true, versionNumber: 3 }));
        
        // With abbreviations
        variations.push(this.labelToDeveloperName(masterLabel, { useAbbreviations: true }));
        variations.push(this.labelToDeveloperName(masterLabel, { useAbbreviations: true, addVersion: true }));
        
        // Remove duplicates
        return [...new Set(variations)];
    }

    /**
     * Analyze a flow file and suggest proper naming
     */
    async analyzeFlowFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const fileName = path.basename(filePath, '.flow-meta.xml');
            
            // Extract MasterLabel from XML
            const labelMatch = content.match(/<label>([^<]+)<\/label>/);
            if (!labelMatch) {
                return {
                    error: 'Could not find <label> in flow file',
                    fileName,
                    filePath
                };
            }
            
            const masterLabel = labelMatch[1];
            const suggestedDeveloperName = this.labelToDeveloperName(masterLabel);
            const variations = this.generateVariations(masterLabel);
            
            // Check if current file name matches any variation
            const isStandard = variations.includes(fileName);
            
            return {
                filePath,
                fileName,
                masterLabel,
                suggestedDeveloperName,
                suggestedFileName: suggestedDeveloperName + '.flow-meta.xml',
                isStandard,
                variations,
                recommendation: isStandard 
                    ? 'File name follows standard convention' 
                    : `Consider renaming to: ${suggestedDeveloperName}.flow-meta.xml`
            };
        } catch (error) {
            return {
                error: error.message,
                fileName: path.basename(filePath),
                filePath
            };
        }
    }

    /**
     * Scan directory for flow files and analyze naming
     */
    async scanDirectory(dirPath) {
        const results = [];
        
        try {
            const files = await fs.readdir(dirPath);
            const flowFiles = files.filter(f => f.endsWith('.flow-meta.xml'));
            
            console.log(`Found ${flowFiles.length} flow files in ${dirPath}\n`);
            
            for (const file of flowFiles) {
                const filePath = path.join(dirPath, file);
                const analysis = await this.analyzeFlowFile(filePath);
                results.push(analysis);
            }
            
            return results;
        } catch (error) {
            console.error(`Error scanning directory: ${error.message}`);
            return results;
        }
    }

    /**
     * Create a mapping table for documentation
     */
    generateMappingTable(analyses) {
        const table = [];
        table.push('| MasterLabel | Current File | Suggested File | Status |');
        table.push('|-------------|--------------|----------------|--------|');
        
        for (const analysis of analyses) {
            if (analysis.error) {
                table.push(`| ERROR | ${analysis.fileName} | - | ${analysis.error} |`);
            } else {
                const status = analysis.isStandard ? '✅ OK' : '⚠️ Non-standard';
                table.push(`| ${analysis.masterLabel} | ${analysis.fileName} | ${analysis.suggestedFileName} | ${status} |`);
            }
        }
        
        return table.join('\n');
    }

    /**
     * Fix flow file names in a directory (with confirmation)
     */
    async fixFileNames(dirPath, autoConfirm = false) {
        const analyses = await this.scanDirectory(dirPath);
        const toRename = analyses.filter(a => !a.error && !a.isStandard);
        
        if (toRename.length === 0) {
            console.log('✅ All flow files follow standard naming convention!');
            return;
        }
        
        console.log(`\n⚠️ Found ${toRename.length} files with non-standard names:\n`);
        
        for (const analysis of toRename) {
            console.log(`  ${analysis.fileName}`);
            console.log(`    → ${analysis.suggestedFileName}`);
        }
        
        if (!autoConfirm) {
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const answer = await new Promise(resolve => {
                readline.question('\nRename these files? (y/N): ', resolve);
            });
            readline.close();
            
            if (answer.toLowerCase() !== 'y') {
                console.log('Cancelled');
                return;
            }
        }
        
        // Perform renames
        for (const analysis of toRename) {
            const oldPath = analysis.filePath;
            const newPath = path.join(path.dirname(oldPath), analysis.suggestedFileName);
            
            try {
                await fs.rename(oldPath, newPath);
                console.log(`✅ Renamed: ${analysis.fileName} → ${analysis.suggestedFileName}`);
            } catch (error) {
                console.error(`❌ Failed to rename ${analysis.fileName}: ${error.message}`);
            }
        }
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const standardizer = new FlowNameStandardizer();
    
    // Parse arguments
    const options = {};
    for (let i = 1; i < args.length; i += 2) {
        if (args[i].startsWith('--')) {
            options[args[i].slice(2)] = args[i + 1];
        }
    }
    
    switch (command) {
        case 'convert':
            if (!options.label) {
                console.error('Required: --label "Flow Master Label"');
                process.exit(1);
            }
            
            const developerName = standardizer.labelToDeveloperName(options.label);
            const variations = standardizer.generateVariations(options.label);
            
            console.log(`\nMasterLabel: "${options.label}"`);
            console.log(`Suggested DeveloperName: ${developerName}`);
            console.log(`Suggested File Name: ${developerName}.flow-meta.xml`);
            console.log('\nPossible variations:');
            variations.forEach(v => console.log(`  - ${v}`));
            break;
            
        case 'reverse':
            if (!options.name) {
                console.error('Required: --name "DeveloperName"');
                process.exit(1);
            }
            
            const label = standardizer.developerNameToLabel(options.name);
            console.log(`\nDeveloperName: "${options.name}"`);
            console.log(`Likely MasterLabel: "${label}"`);
            break;
            
        case 'analyze':
            if (!options.file) {
                console.error('Required: --file path/to/flow.flow-meta.xml');
                process.exit(1);
            }
            
            const analysis = await standardizer.analyzeFlowFile(options.file);
            console.log('\nFlow File Analysis:');
            console.log(JSON.stringify(analysis, null, 2));
            break;
            
        case 'scan':
            const dirPath = options.dir || 'force-app/main/default/flows';
            const results = await standardizer.scanDirectory(dirPath);
            
            console.log('\nScan Results:');
            console.log('=' * 50);
            
            const nonStandard = results.filter(r => !r.error && !r.isStandard);
            const errors = results.filter(r => r.error);
            
            if (nonStandard.length > 0) {
                console.log('\n⚠️ Non-standard naming:');
                nonStandard.forEach(r => {
                    console.log(`  ${r.fileName} → ${r.suggestedFileName}`);
                });
            }
            
            if (errors.length > 0) {
                console.log('\n❌ Errors:');
                errors.forEach(r => {
                    console.log(`  ${r.fileName}: ${r.error}`);
                });
            }
            
            if (options.table) {
                console.log('\n' + standardizer.generateMappingTable(results));
            }
            break;
            
        case 'fix':
            const fixDir = options.dir || 'force-app/main/default/flows';
            await standardizer.fixFileNames(fixDir, options.yes === 'true');
            break;
            
        default:
            console.log('Flow Name Standardizer\n');
            console.log('Commands:');
            console.log('  convert --label "..."      Convert MasterLabel to DeveloperName');
            console.log('  reverse --name "..."       Convert DeveloperName to MasterLabel');
            console.log('  analyze --file ...         Analyze a single flow file');
            console.log('  scan --dir ...            Scan directory for naming issues');
            console.log('  fix --dir ... [--yes]     Fix file names (with confirmation)');
            console.log('\nOptions:');
            console.log('  --table                   Generate markdown table (with scan)');
            console.log('  --yes                     Auto-confirm fixes');
            console.log('\nExamples:');
            console.log('  node flow-name-standardizer.js convert --label "Opp: Contract Generation"');
            console.log('  node flow-name-standardizer.js scan --dir force-app/main/default/flows --table');
            console.log('  node flow-name-standardizer.js fix --dir force-app/main/default/flows');
    }
}

// Export for use as module
module.exports = FlowNameStandardizer;

// Run if called directly
if (require.main === module) {
    main();
}