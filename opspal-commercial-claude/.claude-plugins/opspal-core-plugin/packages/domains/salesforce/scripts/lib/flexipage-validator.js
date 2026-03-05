#!/usr/bin/env node

/**
 * Salesforce FlexiPage Validator
 * ===============================
 * Validates Lightning page XML structure before deployment
 * Prevents common deployment failures and provides fixes
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// Color output utilities (fallback if chalk not available)
let chalk;
try {
    chalk = require('chalk');
} catch (e) {
    // Fallback for when chalk is not available
    chalk = {
        bold: (str) => `**${str}**`,
        red: (str) => `[ERROR] ${str}`,
        yellow: (str) => `[WARNING] ${str}`,
        green: (str) => `[SUCCESS] ${str}`,
        cyan: (str) => `[INFO] ${str}`,
        gray: (str) => `[DEBUG] ${str}`
    };
}

// Valid FlexiPage components and their properties
const FLEXIPAGE_SCHEMA = {
    // Standard page templates
    validTemplates: [
        'flexipage:recordHomeTemplateDesktop',
        'flexipage:recordHomeTemplateMobile',
        'flexipage:appHomeTemplateDesktop',
        'flexipage:appHomeTemplateHeaderTwoColumnsLeftSidebar',
        'flexipage:defaultAppHomeTemplate',
        'home:desktopTemplate',
        'home:mobileTemplate',
        'flexipage:emailTemplateShowHeader'
    ],
    
    // Valid page types
    validTypes: [
        'RecordPage',
        'AppPage',
        'HomePage',
        'EmailTemplatePage',
        'UtilityBar'
    ],
    
    // Valid region types
    regionTypes: {
        'Region': ['header', 'main', 'sidebar', 'top', 'bottomLeft', 'bottomRight'],
        'Facet': [] // Facets can have any name
    },
    
    // Valid Lightning components
    validComponents: {
        // Force namespace components
        'force:highlightsPanel': {
            requiresIdentifier: true,
            validProperties: []
        },
        'force:detailPanel': {
            requiresIdentifier: true,
            validProperties: []
        },
        'force:relatedListContainer': {
            requiresIdentifier: true,
            validProperties: []
        },
        'force:relatedListSingleContainer': {
            requiresIdentifier: true,
            validProperties: ['relatedListApiName']
        },
        
        // Flexipage namespace components
        'flexipage:tab': {
            requiresIdentifier: true,
            validProperties: ['body', 'title', 'active']
        },
        'flexipage:tabset': {
            requiresIdentifier: true,
            validProperties: ['tabs']
        },
        'flexipage:richText': {
            requiresIdentifier: true,
            validProperties: ['content']
        },
        'flexipage:container': {
            requiresIdentifier: true,
            validProperties: ['label', 'sectionColumns']
        },
        
        // Home namespace components
        'home:heroChart': {
            requiresIdentifier: true,
            validProperties: []
        },
        'home:assistant': {
            requiresIdentifier: true,
            validProperties: []
        },
        'home:recentRecordContainer': {
            requiresIdentifier: true,
            validProperties: []
        },
        'home:eventContainer': {
            requiresIdentifier: true,
            validProperties: []
        },
        'home:todoContainer': {
            requiresIdentifier: true,
            validProperties: []
        },
        
        // Lightning namespace components
        'lightning:card': {
            requiresIdentifier: true,
            validProperties: ['title', 'iconName', 'variant']
        },
        'lightning:reportChart': {
            requiresIdentifier: true,
            validProperties: ['reportId']
        }
    },
    
    // Properties that should not appear in certain locations
    invalidLocations: {
        'apiVersion': 'Cannot be a direct child of FlexiPage',
        'flexipageLocationSettings': 'Only valid in page assignments, not component instances'
    }
};

/**
 * Main validator class
 */
class FlexiPageValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.fixes = [];
    }
    
    /**
     * Validate a FlexiPage XML file
     */
    async validateFile(filePath) {
        try {
            const xmlContent = fs.readFileSync(filePath, 'utf8');
            return await this.validateXML(xmlContent, path.basename(filePath));
        } catch (error) {
            this.errors.push(`Failed to read file: ${error.message}`);
            return this.getResults();
        }
    }
    
    /**
     * Validate FlexiPage XML content
     */
    async validateXML(xmlContent, fileName = 'flexipage.xml') {
        this.errors = [];
        this.warnings = [];
        this.fixes = [];
        
        try {
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(xmlContent);
            
            if (!result.FlexiPage) {
                this.errors.push('Invalid FlexiPage: Missing root FlexiPage element');
                return this.getResults();
            }
            
            const flexiPage = result.FlexiPage;
            
            // Validate basic structure
            this.validateBasicStructure(flexiPage);
            
            // Validate template
            this.validateTemplate(flexiPage);
            
            // Validate page type
            this.validatePageType(flexiPage);
            
            // Validate regions
            this.validateRegions(flexiPage);
            
            // Validate components
            this.validateComponents(flexiPage);
            
            // Check for invalid elements
            this.checkInvalidElements(flexiPage);
            
        } catch (error) {
            this.errors.push(`XML parsing error: ${error.message}`);
        }
        
        return this.getResults();
    }
    
    /**
     * Validate basic FlexiPage structure
     */
    validateBasicStructure(flexiPage) {
        // Check required elements
        if (!flexiPage.masterLabel) {
            this.errors.push('Missing required element: masterLabel');
            this.fixes.push('Add <masterLabel>Page Name</masterLabel>');
        }
        
        if (!flexiPage.template) {
            this.errors.push('Missing required element: template');
            this.fixes.push('Add <template><name>flexipage:recordHomeTemplateDesktop</name></template>');
        }
        
        if (!flexiPage.type) {
            this.errors.push('Missing required element: type');
            this.fixes.push('Add <type>RecordPage</type>');
        }
    }
    
    /**
     * Validate template
     */
    validateTemplate(flexiPage) {
        if (flexiPage.template && flexiPage.template[0] && flexiPage.template[0].name) {
            const templateName = flexiPage.template[0].name[0];
            if (!FLEXIPAGE_SCHEMA.validTemplates.includes(templateName)) {
                this.errors.push(`Invalid template: ${templateName}`);
                this.fixes.push(`Use one of: ${FLEXIPAGE_SCHEMA.validTemplates.join(', ')}`);
            }
        }
    }
    
    /**
     * Validate page type
     */
    validatePageType(flexiPage) {
        if (flexiPage.type && flexiPage.type[0]) {
            const pageType = flexiPage.type[0];
            if (!FLEXIPAGE_SCHEMA.validTypes.includes(pageType)) {
                this.errors.push(`Invalid page type: ${pageType}`);
                this.fixes.push(`Use one of: ${FLEXIPAGE_SCHEMA.validTypes.join(', ')}`);
            }
            
            // Validate sobjectType for RecordPage
            if (pageType === 'RecordPage' && !flexiPage.sobjectType) {
                this.errors.push('RecordPage requires sobjectType element');
                this.fixes.push('Add <sobjectType>YourObject__c</sobjectType>');
            }
        }
    }
    
    /**
     * Validate regions
     */
    validateRegions(flexiPage) {
        if (!flexiPage.flexiPageRegions) {
            this.warnings.push('No regions defined in FlexiPage');
            return;
        }
        
        const regions = Array.isArray(flexiPage.flexiPageRegions) 
            ? flexiPage.flexiPageRegions 
            : [flexiPage.flexiPageRegions];
        
        const usedIdentifiers = new Set();
        const facetNames = new Set();
        
        regions.forEach((region, index) => {
            // Check region type
            if (!region.type || !region.type[0]) {
                this.errors.push(`Region ${index + 1}: Missing type`);
                this.fixes.push(`Add <type>Region</type> or <type>Facet</type>`);
                return;
            }
            
            const regionType = region.type[0];
            if (!['Region', 'Facet'].includes(regionType)) {
                this.errors.push(`Region ${index + 1}: Invalid type '${regionType}'`);
                this.fixes.push('Use either "Region" or "Facet"');
            }
            
            // Check region name
            if (!region.name || !region.name[0]) {
                this.errors.push(`Region ${index + 1}: Missing name`);
                this.fixes.push('Add <name>regionName</name>');
            } else {
                const regionName = region.name[0];
                
                // Validate Region names against template requirements
                if (regionType === 'Region' && 
                    FLEXIPAGE_SCHEMA.regionTypes.Region.length > 0 &&
                    !FLEXIPAGE_SCHEMA.regionTypes.Region.includes(regionName)) {
                    this.warnings.push(`Region '${regionName}' may not be valid for the selected template`);
                }
                
                // Track Facet names for tab validation
                if (regionType === 'Facet') {
                    facetNames.add(regionName);
                }
            }
            
            // Validate components in region
            if (region.itemInstances && region.itemInstances[0]) {
                const items = Array.isArray(region.itemInstances) 
                    ? region.itemInstances 
                    : [region.itemInstances];
                
                items.forEach(item => {
                    if (item.componentInstance) {
                        this.validateComponentInstance(item.componentInstance[0], usedIdentifiers, facetNames);
                    }
                });
            }
        });
    }
    
    /**
     * Validate component instance
     */
    validateComponentInstance(component, usedIdentifiers, facetNames) {
        if (!component.componentName || !component.componentName[0]) {
            this.errors.push('Component missing componentName');
            return;
        }
        
        const componentName = component.componentName[0];
        
        // Check if component is valid
        if (!FLEXIPAGE_SCHEMA.validComponents[componentName]) {
            this.warnings.push(`Unknown component: ${componentName}`);
        } else {
            const componentSchema = FLEXIPAGE_SCHEMA.validComponents[componentName];
            
            // Check identifier requirement
            if (componentSchema.requiresIdentifier) {
                if (!component.identifier || !component.identifier[0]) {
                    this.errors.push(`Component ${componentName}: Missing required identifier`);
                    const suggestedId = componentName.replace(/[:.]/g, '_') + '_' + Date.now();
                    this.fixes.push(`Add <identifier>${suggestedId}</identifier>`);
                } else {
                    const identifier = component.identifier[0];
                    if (usedIdentifiers.has(identifier)) {
                        this.errors.push(`Duplicate identifier: ${identifier}`);
                        this.fixes.push('Each component must have a unique identifier');
                    }
                    usedIdentifiers.add(identifier);
                }
            }
            
            // Validate properties
            if (component.componentInstanceProperties) {
                const properties = Array.isArray(component.componentInstanceProperties)
                    ? component.componentInstanceProperties
                    : [component.componentInstanceProperties];
                
                properties.forEach(prop => {
                    if (prop.name && prop.name[0]) {
                        const propName = prop.name[0];
                        
                        // Special validation for tab body references
                        if (componentName === 'flexipage:tab' && propName === 'body') {
                            const bodyValue = prop.value ? prop.value[0] : '';
                            if (!facetNames.has(bodyValue)) {
                                this.warnings.push(`Tab references non-existent facet: ${bodyValue}`);
                            }
                        }
                        
                        // Special validation for tabset tabs reference
                        if (componentName === 'flexipage:tabset' && propName === 'tabs') {
                            const tabsValue = prop.value ? prop.value[0] : '';
                            if (!facetNames.has(tabsValue)) {
                                this.warnings.push(`Tabset references non-existent facet: ${tabsValue}`);
                            }
                        }
                    }
                });
            }
        }
    }
    
    /**
     * Validate all components
     */
    validateComponents(flexiPage) {
        // Additional cross-component validation
        // This is handled within validateRegions for efficiency
    }
    
    /**
     * Check for invalid elements
     */
    checkInvalidElements(flexiPage) {
        // Check for apiVersion as direct child
        if (flexiPage.apiVersion) {
            this.errors.push('apiVersion cannot be a direct child of FlexiPage');
            this.fixes.push('Remove <apiVersion> element from FlexiPage');
        }
        
        // Check for other invalid elements
        Object.keys(flexiPage).forEach(key => {
            if (key === '$') return; // XML attributes
            
            const validElements = [
                'flexiPageRegions', 'masterLabel', 'sobjectType', 
                'template', 'type', 'description', 'platformActionlist'
            ];
            
            if (!validElements.includes(key)) {
                this.warnings.push(`Unexpected element: ${key}`);
            }
        });
    }
    
    /**
     * Auto-fix common issues
     */
    async autoFix(xmlContent) {
        let fixedXml = xmlContent;
        
        // Remove apiVersion if present
        fixedXml = fixedXml.replace(/<apiVersion>.*?<\/apiVersion>\s*/g, '');
        
        // Fix missing identifiers
        const componentMatches = fixedXml.matchAll(/<componentInstance>([\s\S]*?)<\/componentInstance>/g);
        for (const match of componentMatches) {
            const componentBlock = match[1];
            if (!componentBlock.includes('<identifier>')) {
                const componentName = componentBlock.match(/<componentName>(.*?)<\/componentName>/);
                if (componentName) {
                    const identifier = componentName[1].replace(/[:.]/g, '_') + '_' + Date.now();
                    const fixedBlock = componentBlock.replace(
                        '</componentName>',
                        `</componentName>\n                <identifier>${identifier}</identifier>`
                    );
                    fixedXml = fixedXml.replace(componentBlock, fixedBlock);
                }
            }
        }
        
        return fixedXml;
    }
    
    /**
     * Get validation results
     */
    getResults() {
        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            fixes: this.fixes,
            summary: {
                errorCount: this.errors.length,
                warningCount: this.warnings.length,
                fixCount: this.fixes.length
            }
        };
    }
    
    /**
     * Print results to console
     */
    printResults(results, fileName = 'FlexiPage') {
        console.log(chalk.bold('\n=== FlexiPage Validation Results ==='));
        console.log(chalk.gray(`File: ${fileName}\n`));
        
        if (results.valid) {
            console.log(chalk.green('✓ FlexiPage is valid'));
        } else {
            console.log(chalk.red('✗ FlexiPage has errors'));
        }
        
        if (results.errors.length > 0) {
            console.log(chalk.red('\nErrors:'));
            results.errors.forEach((error, i) => {
                console.log(chalk.red(`  ${i + 1}. ${error}`));
            });
        }
        
        if (results.warnings.length > 0) {
            console.log(chalk.yellow('\nWarnings:'));
            results.warnings.forEach((warning, i) => {
                console.log(chalk.yellow(`  ${i + 1}. ${warning}`));
            });
        }
        
        if (results.fixes.length > 0) {
            console.log(chalk.cyan('\nSuggested Fixes:'));
            results.fixes.forEach((fix, i) => {
                console.log(chalk.cyan(`  ${i + 1}. ${fix}`));
            });
        }
        
        console.log(chalk.gray(`\nSummary: ${results.summary.errorCount} errors, ${results.summary.warningCount} warnings`));
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: flexipage-validator.js <file.xml> [--fix]');
        console.log('Options:');
        console.log('  --fix    Attempt to auto-fix common issues');
        process.exit(1);
    }
    
    const validator = new FlexiPageValidator();
    const filePath = args[0];
    const shouldFix = args.includes('--fix');
    
    (async () => {
        try {
            let results;
            if (shouldFix) {
                const xmlContent = fs.readFileSync(filePath, 'utf8');
                const fixedXml = await validator.autoFix(xmlContent);
                const outputPath = filePath.replace('.xml', '.fixed.xml');
                fs.writeFileSync(outputPath, fixedXml);
                console.log(chalk.green(`Fixed XML written to: ${outputPath}`));
                
                results = await validator.validateXML(fixedXml, path.basename(filePath));
                validator.printResults(results, path.basename(filePath));
            } else {
                results = await validator.validateFile(filePath);
                validator.printResults(results, path.basename(filePath));
            }
            
            process.exit(results && results.valid ? 0 : 1);
        } catch (error) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
    })();
}

module.exports = FlexiPageValidator;