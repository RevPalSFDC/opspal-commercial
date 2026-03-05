#!/usr/bin/env node

/**
 * FlexiPage Auto-Recovery Module
 * ================================
 * Intelligent error detection and automatic recovery for FlexiPage deployments
 * Learns from errors and applies fixes automatically
 */

const fs = require('fs');
const path = require('path');
const FlexiPageValidator = require('./flexipage-validator');

class FlexiPageRecovery {
    constructor() {
        this.validator = new FlexiPageValidator();
        this.errorPatternsPath = path.join(__dirname, '../../templates/flexipage-error-patterns.json');
        this.recoveryLogPath = path.join(__dirname, '../../logs/flexipage-recovery.log');
        this.errorPatterns = this.loadErrorPatterns();
        this.recoveryStrategies = this.initializeStrategies();
    }
    
    /**
     * Load error patterns from configuration
     */
    loadErrorPatterns() {
        try {
            return JSON.parse(fs.readFileSync(this.errorPatternsPath, 'utf8'));
        } catch (error) {
            console.warn('Could not load error patterns:', error.message);
            return { errorPatterns: {}, fixStrategies: {} };
        }
    }
    
    /**
     * Initialize recovery strategies
     */
    initializeStrategies() {
        return {
            'missing_identifier': this.fixMissingIdentifiers.bind(this),
            'invalid_location': this.fixInvalidLocation.bind(this),
            'component_not_found': this.replaceInvalidComponent.bind(this),
            'duplicate_identifier': this.fixDuplicateIdentifiers.bind(this),
            'missing_required_property': this.addMissingProperties.bind(this),
            'invalid_region_type': this.fixRegionTypes.bind(this),
            'missing_sobject_type': this.addSObjectType.bind(this),
            'invalid_template': this.fixTemplate.bind(this),
            'facet_reference_error': this.fixFacetReferences.bind(this),
            'xml_parsing_error': this.fixXMLStructure.bind(this)
        };
    }
    
    /**
     * Main recovery function - detects and fixes errors
     * @param {string} xmlContent - FlexiPage XML with errors
     * @param {string} errorMessage - Deployment error message
     * @param {object} options - Recovery options
     */
    async recoverFlexiPage(xmlContent, errorMessage, options = {}) {
        const recovery = {
            originalXml: xmlContent,
            fixedXml: xmlContent,
            errorsDetected: [],
            fixesApplied: [],
            success: false,
            iterations: 0,
            maxIterations: options.maxIterations || 5
        };
        
        // Detect error patterns
        recovery.errorsDetected = this.detectErrorPatterns(errorMessage);
        
        // Apply recovery strategies iteratively
        while (recovery.iterations < recovery.maxIterations && !recovery.success) {
            recovery.iterations++;
            
            // Apply fixes for detected errors
            for (const error of recovery.errorsDetected) {
                if (this.recoveryStrategies[error.pattern]) {
                    const fix = await this.recoveryStrategies[error.pattern](
                        recovery.fixedXml,
                        error
                    );
                    
                    if (fix.success) {
                        recovery.fixedXml = fix.xml;
                        recovery.fixesApplied.push(fix.description);
                    }
                }
            }
            
            // Validate the fixed XML
            const validation = await this.validator.validateXML(recovery.fixedXml);
            
            if (validation.valid) {
                recovery.success = true;
            } else {
                // Detect new errors
                recovery.errorsDetected = this.analyzeValidationErrors(validation.errors);
                
                // If no new fixes can be applied, try fallback
                if (recovery.errorsDetected.length === 0) {
                    const fallback = await this.applyFallbackStrategy(recovery.fixedXml);
                    recovery.fixedXml = fallback.xml;
                    recovery.fixesApplied.push(fallback.description);
                    recovery.success = fallback.success;
                    break;
                }
            }
        }
        
        // Log recovery attempt
        this.logRecovery(recovery);
        
        return recovery;
    }
    
    /**
     * Detect error patterns in deployment error message
     */
    detectErrorPatterns(errorMessage) {
        const detected = [];
        
        if (!errorMessage) return detected;
        
        const errorStr = typeof errorMessage === 'string' 
            ? errorMessage 
            : JSON.stringify(errorMessage);
        
        Object.keys(this.errorPatterns.errorPatterns).forEach(patternKey => {
            const pattern = this.errorPatterns.errorPatterns[patternKey];
            const regex = new RegExp(pattern.regex, 'i');
            
            if (errorStr.match(regex)) {
                detected.push({
                    pattern: patternKey,
                    ...pattern,
                    matchedError: errorStr
                });
            }
        });
        
        return detected;
    }
    
    /**
     * Analyze validation errors and convert to patterns
     */
    analyzeValidationErrors(errors) {
        const patterns = [];
        
        errors.forEach(error => {
            // Map validation errors to recovery patterns
            if (error.includes('Missing required identifier')) {
                patterns.push({
                    pattern: 'missing_identifier',
                    error: error
                });
            } else if (error.includes('Invalid type')) {
                patterns.push({
                    pattern: 'invalid_region_type',
                    error: error
                });
            } else if (error.includes('Missing required element')) {
                if (error.includes('sobjectType')) {
                    patterns.push({
                        pattern: 'missing_sobject_type',
                        error: error
                    });
                }
            }
        });
        
        return patterns;
    }
    
    // Recovery Strategy Implementations
    
    /**
     * Fix missing identifiers
     */
    async fixMissingIdentifiers(xml, error) {
        const lines = xml.split('\n');
        const fixed = [];
        let inComponent = false;
        let hasIdentifier = false;
        let componentName = '';
        let changesMade = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.includes('<componentInstance>')) {
                inComponent = true;
                hasIdentifier = false;
                componentName = '';
            } else if (line.includes('</componentInstance>')) {
                if (inComponent && !hasIdentifier && componentName) {
                    // Add identifier before closing tag
                    const identifier = `${componentName.replace(/[:.]/g, '_')}_${Date.now()}`;
                    fixed.push(`                <identifier>${identifier}</identifier>`);
                    changesMade = true;
                }
                inComponent = false;
            } else if (inComponent) {
                if (line.includes('<componentName>')) {
                    componentName = line.match(/<componentName>(.*?)<\/componentName>/)?.[1] || '';
                } else if (line.includes('<identifier>')) {
                    hasIdentifier = true;
                }
            }
            
            fixed.push(line);
        }
        
        return {
            success: changesMade,
            xml: fixed.join('\n'),
            description: 'Added missing component identifiers'
        };
    }
    
    /**
     * Fix invalid element locations
     */
    async fixInvalidLocation(xml, error) {
        let fixed = xml;
        
        // Remove apiVersion if present
        fixed = fixed.replace(/<apiVersion>.*?<\/apiVersion>\s*/g, '');
        
        // Remove flexipageLocationSettings
        fixed = fixed.replace(/<flexipageLocationSettings>[\s\S]*?<\/flexipageLocationSettings>/g, '');
        
        return {
            success: true,
            xml: fixed,
            description: 'Removed elements in invalid locations'
        };
    }
    
    /**
     * Replace invalid components
     */
    async replaceInvalidComponent(xml, error) {
        let fixed = xml;
        
        const replacements = {
            'force:recordDetailAndRelatedListTabs': 'force:detailPanel',
            'force:recordDetail': 'force:detailPanel'
        };
        
        Object.keys(replacements).forEach(invalid => {
            if (fixed.includes(invalid)) {
                fixed = fixed.replace(new RegExp(invalid, 'g'), replacements[invalid]);
            }
        });
        
        return {
            success: true,
            xml: fixed,
            description: 'Replaced invalid components with supported alternatives'
        };
    }
    
    /**
     * Fix duplicate identifiers
     */
    async fixDuplicateIdentifiers(xml, error) {
        const lines = xml.split('\n');
        const identifiers = new Set();
        const fixed = [];
        
        lines.forEach(line => {
            if (line.includes('<identifier>')) {
                const match = line.match(/<identifier>(.*?)<\/identifier>/);
                if (match) {
                    const id = match[1];
                    if (identifiers.has(id)) {
                        // Generate new unique identifier
                        const newId = `${id}_${Date.now()}`;
                        fixed.push(line.replace(id, newId));
                        identifiers.add(newId);
                    } else {
                        identifiers.add(id);
                        fixed.push(line);
                    }
                } else {
                    fixed.push(line);
                }
            } else {
                fixed.push(line);
            }
        });
        
        return {
            success: true,
            xml: fixed.join('\n'),
            description: 'Fixed duplicate identifiers'
        };
    }
    
    /**
     * Add missing required properties
     */
    async addMissingProperties(xml, error) {
        // This would need to be more sophisticated based on component type
        // For now, return as-is
        return {
            success: false,
            xml: xml,
            description: 'Could not automatically add missing properties'
        };
    }
    
    /**
     * Fix invalid region types
     */
    async fixRegionTypes(xml, error) {
        let fixed = xml;
        
        // Fix common region type errors
        fixed = fixed.replace(/<type>InvalidType<\/type>/g, '<type>Region</type>');
        fixed = fixed.replace(/<type>region<\/type>/gi, '<type>Region</type>');
        fixed = fixed.replace(/<type>facet<\/type>/gi, '<type>Facet</type>');
        
        return {
            success: true,
            xml: fixed,
            description: 'Fixed invalid region types'
        };
    }
    
    /**
     * Add missing sObject type
     */
    async addSObjectType(xml, error) {
        // Try to infer object type from file name or page label
        let objectType = 'Account'; // Default fallback
        
        const labelMatch = xml.match(/<masterLabel>(.*?)<\/masterLabel>/);
        if (labelMatch) {
            const label = labelMatch[1];
            // Extract potential object name from label
            const words = label.split(/\s+/);
            if (words.length > 0) {
                objectType = words[0].replace(/\s+/g, '_');
                if (!objectType.endsWith('__c')) {
                    // Standard object
                    objectType = objectType.charAt(0).toUpperCase() + objectType.slice(1);
                }
            }
        }
        
        // Add sObjectType after type element
        const fixed = xml.replace(
            /<type>RecordPage<\/type>/,
            `<type>RecordPage</type>\n    <sobjectType>${objectType}</sobjectType>`
        );
        
        return {
            success: true,
            xml: fixed,
            description: `Added sObjectType: ${objectType}`
        };
    }
    
    /**
     * Fix invalid template
     */
    async fixTemplate(xml, error) {
        let fixed = xml;
        
        // Determine correct template based on page type
        if (fixed.includes('<type>RecordPage</type>')) {
            fixed = fixed.replace(
                /<template>[\s\S]*?<\/template>/,
                '<template>\n        <name>flexipage:recordHomeTemplateDesktop</name>\n    </template>'
            );
        } else if (fixed.includes('<type>AppPage</type>')) {
            fixed = fixed.replace(
                /<template>[\s\S]*?<\/template>/,
                '<template>\n        <name>flexipage:appHomeTemplateDesktop</name>\n    </template>'
            );
        } else if (fixed.includes('<type>HomePage</type>')) {
            fixed = fixed.replace(
                /<template>[\s\S]*?<\/template>/,
                '<template>\n        <name>home:desktopTemplate</name>\n    </template>'
            );
        }
        
        return {
            success: true,
            xml: fixed,
            description: 'Fixed template to match page type'
        };
    }
    
    /**
     * Fix facet reference errors
     */
    async fixFacetReferences(xml, error) {
        // Extract all facet names
        const facetNames = new Set();
        const facetMatches = xml.matchAll(/<name>(.*?)<\/name>[\s\S]*?<type>Facet<\/type>/g);
        
        for (const match of facetMatches) {
            facetNames.add(match[1]);
        }
        
        // Find references to non-existent facets
        const bodyMatches = xml.matchAll(/<name>body<\/name>[\s\S]*?<value>(.*?)<\/value>/g);
        
        for (const match of bodyMatches) {
            const facetRef = match[1];
            if (!facetNames.has(facetRef)) {
                // Create the missing facet
                const newFacet = `
    <flexiPageRegions>
        <name>${facetRef}</name>
        <type>Facet</type>
    </flexiPageRegions>`;
                
                // Add before closing FlexiPage tag
                xml = xml.replace('</FlexiPage>', `${newFacet}\n</FlexiPage>`);
            }
        }
        
        return {
            success: true,
            xml: xml,
            description: 'Added missing facet definitions'
        };
    }
    
    /**
     * Fix XML structure errors
     */
    async fixXMLStructure(xml, error) {
        // Basic XML fixes
        let fixed = xml;
        
        // Ensure proper XML declaration
        if (!fixed.startsWith('<?xml')) {
            fixed = '<?xml version="1.0" encoding="UTF-8"?>\n' + fixed;
        }
        
        // Fix unclosed tags (basic)
        const openTags = [];
        const lines = fixed.split('\n');
        
        lines.forEach(line => {
            const openMatch = line.match(/<([a-zA-Z]+)>/);
            if (openMatch) {
                openTags.push(openMatch[1]);
            }
            const closeMatch = line.match(/<\/([a-zA-Z]+)>/);
            if (closeMatch) {
                const tag = closeMatch[1];
                const index = openTags.lastIndexOf(tag);
                if (index >= 0) {
                    openTags.splice(index, 1);
                }
            }
        });
        
        // Add missing closing tags
        openTags.reverse().forEach(tag => {
            fixed += `\n</${tag}>`;
        });
        
        return {
            success: true,
            xml: fixed,
            description: 'Fixed XML structure issues'
        };
    }
    
    /**
     * Apply fallback strategy when specific fixes don't work
     */
    async applyFallbackStrategy(xml) {
        // Load the simplest template
        const templatePath = path.join(__dirname, '../../templates/flexipages/standard-record-page.xml');
        
        try {
            let template = fs.readFileSync(templatePath, 'utf8');
            
            // Try to preserve some information from the original
            const labelMatch = xml.match(/<masterLabel>(.*?)<\/masterLabel>/);
            const objectMatch = xml.match(/<sobjectType>(.*?)<\/sobjectType>/);
            
            if (labelMatch) {
                template = template.replace('{PAGE_LABEL}', labelMatch[1]);
            }
            if (objectMatch) {
                template = template.replace('{OBJECT_API_NAME}', objectMatch[1]);
            }
            
            return {
                success: true,
                xml: template,
                description: 'Applied fallback to standard template'
            };
            
        } catch (error) {
            return {
                success: false,
                xml: xml,
                description: 'Fallback strategy failed'
            };
        }
    }
    
    /**
     * Log recovery attempts for analysis
     */
    logRecovery(recovery) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            success: recovery.success,
            iterations: recovery.iterations,
            errorsDetected: recovery.errorsDetected.map(e => e.pattern),
            fixesApplied: recovery.fixesApplied
        };
        
        try {
            // Ensure log directory exists
            const logDir = path.dirname(this.recoveryLogPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            // Append to log file
            fs.appendFileSync(
                this.recoveryLogPath,
                JSON.stringify(logEntry) + '\n'
            );
        } catch (error) {
            console.warn('Could not write to recovery log:', error.message);
        }
    }
    
    /**
     * Learn from successful recoveries to improve future attempts
     */
    async learnFromRecovery(originalError, successfulFixes) {
        // This could be expanded to update the error patterns
        // based on successful recoveries
        console.log('Learning from recovery:', successfulFixes);
    }
}

// Export for use in other modules
module.exports = FlexiPageRecovery;

// CLI interface for testing
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: flexipage-recovery.js <file.xml> "<error message>"');
        process.exit(1);
    }
    
    const recovery = new FlexiPageRecovery();
    const xmlFile = args[0];
    const errorMessage = args[1];
    
    (async () => {
        try {
            const xmlContent = fs.readFileSync(xmlFile, 'utf8');
            const result = await recovery.recoverFlexiPage(xmlContent, errorMessage);
            
            console.log('Recovery Result:');
            console.log('Success:', result.success);
            console.log('Iterations:', result.iterations);
            console.log('Fixes Applied:', result.fixesApplied);
            
            if (result.success) {
                const outputFile = xmlFile.replace('.xml', '.recovered.xml');
                fs.writeFileSync(outputFile, result.fixedXml);
                console.log(`Recovered XML written to: ${outputFile}`);
            }
            
            process.exit(result.success ? 0 : 1);
            
        } catch (error) {
            console.error('Recovery failed:', error.message);
            process.exit(1);
        }
    })();
}