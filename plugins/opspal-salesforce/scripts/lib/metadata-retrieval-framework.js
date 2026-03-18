#!/usr/bin/env node

/**
 * Metadata Retrieval Framework for Salesforce
 * 
 * Provides robust metadata retrieval and analysis capabilities for all sub-agents
 * Handles API limitations, timeouts, and provides fallback strategies
 * 
 * Usage:
 *   const retriever = new MetadataRetriever(orgAlias);
 *   const validationRules = await retriever.getValidationRules('Opportunity');
 *   const flows = await retriever.getFlows('Opportunity');
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

class MetadataRetriever {
    constructor(orgAlias) {
        this.orgAlias = orgAlias;
        this.tempDir = path.join(__dirname, '..', '..', '.metadata-cache', orgAlias);
        this.parser = new xml2js.Parser();
        this.cache = new Map();
    }

    /**
     * Initialize cache directory
     */
    async init() {
        await fs.mkdir(this.tempDir, { recursive: true });
    }

    /**
     * Get validation rules with formulas for an object
     */
    async getValidationRules(objectName, options = {}) {
        const cacheKey = `vr_${objectName}`;
        
        // Check cache first
        if (!options.forceRefresh && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        console.log(`📥 Retrieving validation rules for ${objectName}...`);
        
        try {
            // Method 1: Try bulk query first (without formula)
            const bulkRules = await this.queryValidationRules(objectName);
            
            // Method 2: Get formulas individually or via metadata retrieve
            const rulesWithFormulas = await this.enrichValidationRulesWithFormulas(bulkRules, objectName);
            
            this.cache.set(cacheKey, rulesWithFormulas);
            return rulesWithFormulas;
            
        } catch (error) {
            console.log(`⚠️ Falling back to metadata retrieve for ${objectName}`);
            return await this.retrieveValidationRulesViaMetadata(objectName);
        }
    }

    /**
     * Query validation rules using Tooling API
     */
    async queryValidationRules(objectName) {
        const query = `SELECT Id, ValidationName, Active, Description, ErrorMessage, ErrorDisplayField 
                       FROM ValidationRule 
                       WHERE EntityDefinition.QualifiedApiName = '${objectName}'`;
        
        const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
        
        try {
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            if (result.status === 0 && result.result.records) {
                return result.result.records;
            }
        } catch (error) {
            console.error('Query failed:', error.message);
        }
        
        return [];
    }

    /**
     * Enrich validation rules with formulas
     */
    async enrichValidationRulesWithFormulas(rules, objectName) {
        const enrichedRules = [];
        
        for (const rule of rules) {
            try {
                // Try to get formula via individual query
                const formula = await this.getValidationRuleFormula(rule.Id);
                enrichedRules.push({
                    ...rule,
                    ErrorConditionFormula: formula || null,
                    // Analysis fields
                    referencesRecordType: this.checkForRecordTypeReference(formula),
                    referencesPortal: this.checkForPortalReference(formula),
                    complexity: this.calculateFormulaComplexity(formula)
                });
            } catch (error) {
                enrichedRules.push({
                    ...rule,
                    ErrorConditionFormula: null,
                    formulaRetrievalError: error.message
                });
            }
        }
        
        return enrichedRules;
    }

    /**
     * Get individual validation rule formula
     */
    async getValidationRuleFormula(ruleId) {
        const query = `SELECT Id, Metadata FROM ValidationRule WHERE Id='${ruleId}'`;
        const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
        
        try {
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
            if (result.status === 0 && result.result.records?.[0]?.Metadata) {
                return result.result.records[0].Metadata.errorConditionFormula;
            }
        } catch (error) {
            console.debug(`Could not get formula for ${ruleId}:`, error.message);
        }
        
        return null;
    }

    /**
     * Retrieve validation rules via metadata API
     */
    async retrieveValidationRulesViaMetadata(objectName) {
        const outputDir = path.join(this.tempDir, 'validation-rules', objectName);
        
        console.log(`📦 Retrieving validation rules metadata for ${objectName}...`);
        
        const cmd = `sf project retrieve start --metadata "ValidationRule:${objectName}.*" --target-org ${this.orgAlias} --output-dir "${outputDir}" --wait 10`;
        
        try {
            execSync(cmd, { encoding: 'utf8' });
            
            // Parse retrieved XML files
            const rules = await this.parseValidationRuleXML(outputDir, objectName);
            return rules;
            
        } catch (error) {
            console.error('Metadata retrieve failed:', error.message);
            return [];
        }
    }

    /**
     * Parse validation rule XML files
     */
    async parseValidationRuleXML(baseDir, objectName) {
        const rules = [];
        const rulesDir = path.join(baseDir, 'force-app', 'main', 'default', 'objects', objectName, 'validationRules');
        
        try {
            const files = await fs.readdir(rulesDir);
            
            for (const file of files) {
                if (file.endsWith('.validationRule-meta.xml')) {
                    const content = await fs.readFile(path.join(rulesDir, file), 'utf8');
                    const parsed = await this.parser.parseStringPromise(content);
                    
                    if (parsed.ValidationRule) {
                        const rule = parsed.ValidationRule;
                        rules.push({
                            ValidationName: path.basename(file, '.validationRule-meta.xml'),
                            Active: rule.active?.[0] === 'true',
                            Description: rule.description?.[0] || '',
                            ErrorConditionFormula: rule.errorConditionFormula?.[0] || '',
                            ErrorMessage: rule.errorMessage?.[0] || '',
                            ErrorDisplayField: rule.errorDisplayField?.[0] || null,
                            // Analysis
                            referencesRecordType: this.checkForRecordTypeReference(rule.errorConditionFormula?.[0]),
                            referencesPortal: this.checkForPortalReference(rule.errorConditionFormula?.[0]),
                            complexity: this.calculateFormulaComplexity(rule.errorConditionFormula?.[0])
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error parsing validation rules: ${error.message}`);
        }
        
        return rules;
    }

    /**
     * Get flows for an object with entry criteria
     */
    async getFlows(objectName, options = {}) {
        const cacheKey = `flows_${objectName}`;
        
        if (!options.forceRefresh && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        console.log(`📥 Retrieving flows for ${objectName}...`);
        
        try {
            // Method 1: Query active flows
            const activeFlows = await this.queryFlows();
            
            // Method 2: Retrieve metadata for detailed criteria
            const flowsWithDetails = await this.enrichFlowsWithMetadata(activeFlows, objectName);
            
            this.cache.set(cacheKey, flowsWithDetails);
            return flowsWithDetails;
            
        } catch (error) {
            console.log(`⚠️ Falling back to metadata retrieve for flows`);
            return await this.retrieveFlowsViaMetadata(objectName);
        }
    }

    /**
     * Query flows using REST API
     */
    async queryFlows() {
        const query = `SELECT Id, MasterLabel, ProcessType, IsActive, Description 
                       FROM Flow 
                       WHERE IsActive = true`;
        
        const cmd = `sf data query --query "${query}" --json --target-org ${this.orgAlias}`;
        
        try {
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            if (result.status === 0 && result.result.records) {
                return result.result.records;
            }
        } catch (error) {
            console.error('Flow query failed:', error.message);
        }
        
        return [];
    }

    /**
     * Enrich flows with metadata details
     */
    async enrichFlowsWithMetadata(flows, objectName) {
        const outputDir = path.join(this.tempDir, 'flows');
        
        // Retrieve all flow metadata
        console.log(`📦 Retrieving flow metadata...`);
        const cmd = `sf project retrieve start --metadata "Flow" --target-org ${this.orgAlias} --output-dir "${outputDir}" --wait 10`;
        
        try {
            execSync(cmd, { encoding: 'utf8' });
            
            // Parse and match flows
            const enrichedFlows = [];
            for (const flow of flows) {
                const details = await this.parseFlowXML(outputDir, flow.MasterLabel);
                enrichedFlows.push({
                    ...flow,
                    ...details,
                    affectsObject: details.object === objectName,
                    referencesRecordType: details.hasRecordTypeFilter,
                    referencesPortal: details.hasPortalReference
                });
            }
            
            return enrichedFlows;
            
        } catch (error) {
            console.error('Flow metadata retrieve failed:', error.message);
            return flows;
        }
    }

    /**
     * Parse flow XML for details
     */
    async parseFlowXML(baseDir, flowLabel) {
        const flowsDir = path.join(baseDir, 'force-app', 'main', 'default', 'flows');
        
        try {
            const files = await fs.readdir(flowsDir);
            
            for (const file of files) {
                if (file.endsWith('.flow-meta.xml')) {
                    const content = await fs.readFile(path.join(flowsDir, file), 'utf8');
                    const parsed = await this.parser.parseStringPromise(content);
                    
                    if (parsed.Flow?.label?.[0] === flowLabel) {
                        return this.extractFlowDetails(parsed.Flow);
                    }
                }
            }
        } catch (error) {
            console.debug(`Error parsing flow XML: ${error.message}`);
        }
        
        return {
            object: null,
            triggerType: null,
            hasRecordTypeFilter: false,
            hasPortalReference: false,
            entryCriteria: null
        };
    }

    /**
     * Extract flow details from parsed XML
     */
    extractFlowDetails(flow) {
        const details = {
            object: null,
            triggerType: null,
            hasRecordTypeFilter: false,
            hasPortalReference: false,
            entryCriteria: null,
            complexity: 0
        };
        
        // Get object from start element
        if (flow.start?.[0]?.object) {
            details.object = flow.start[0].object[0];
        }
        
        // Get trigger type from recordTriggers
        if (flow.start?.[0]?.recordTriggerType) {
            details.triggerType = flow.start[0].recordTriggerType[0];
        }
        
        // Check for record type filters
        const flowString = JSON.stringify(flow);
        details.hasRecordTypeFilter = /RecordType|Record\.Type/i.test(flowString);
        details.hasPortalReference = /Portal|Onboarding|BRV/i.test(flowString);
        
        // Extract entry criteria
        if (flow.start?.[0]?.filterLogic) {
            details.entryCriteria = flow.start[0].filterLogic[0];
        }
        
        // Calculate complexity
        details.complexity = this.calculateFlowComplexity(flow);
        
        return details;
    }

    /**
     * Get page layouts with field requirements
     */
    async getLayouts(objectName, options = {}) {
        const cacheKey = `layouts_${objectName}`;
        
        if (!options.forceRefresh && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        console.log(`📥 Retrieving layouts for ${objectName}...`);
        
        const outputDir = path.join(this.tempDir, 'layouts', objectName);
        const cmd = `sf project retrieve start --metadata "Layout:${objectName}-*" --target-org ${this.orgAlias} --output-dir "${outputDir}" --wait 10`;
        
        try {
            execSync(cmd, { encoding: 'utf8' });
            
            const layouts = await this.parseLayoutXML(outputDir, objectName);
            this.cache.set(cacheKey, layouts);
            return layouts;
            
        } catch (error) {
            console.error('Layout retrieve failed:', error.message);
            return [];
        }
    }

    /**
     * Parse layout XML files
     */
    async parseLayoutXML(baseDir, objectName) {
        const layouts = [];
        const layoutsDir = path.join(baseDir, 'force-app', 'main', 'default', 'layouts');
        
        try {
            const files = await fs.readdir(layoutsDir);
            
            for (const file of files) {
                if (file.startsWith(objectName) && file.endsWith('.layout-meta.xml')) {
                    const content = await fs.readFile(path.join(layoutsDir, file), 'utf8');
                    const parsed = await this.parser.parseStringPromise(content);
                    
                    if (parsed.Layout) {
                        const layoutName = path.basename(file, '.layout-meta.xml');
                        const fieldRequirements = this.extractFieldRequirements(parsed.Layout);
                        
                        layouts.push({
                            name: layoutName,
                            recordType: this.extractRecordTypeFromLayoutName(layoutName),
                            fields: fieldRequirements
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error parsing layouts: ${error.message}`);
        }
        
        return layouts;
    }

    /**
     * Extract field requirements from layout
     */
    extractFieldRequirements(layout) {
        const fields = new Map();
        
        if (layout.layoutSections) {
            for (const section of layout.layoutSections) {
                if (section.layoutColumns) {
                    for (const column of section.layoutColumns) {
                        if (column.layoutItems) {
                            for (const item of column.layoutItems) {
                                if (item.field) {
                                    const fieldName = item.field[0];
                                    fields.set(fieldName, {
                                        required: item.behavior?.[0] === 'Required',
                                        readOnly: item.behavior?.[0] === 'Readonly',
                                        edit: item.behavior?.[0] === 'Edit'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return Array.from(fields.entries()).map(([name, props]) => ({
            fieldName: name,
            ...props
        }));
    }

    /**
     * Get profile visibility settings
     */
    async getProfiles(options = {}) {
        const cacheKey = 'profiles';
        
        if (!options.forceRefresh && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        console.log(`📥 Retrieving profiles...`);
        
        const outputDir = path.join(this.tempDir, 'profiles');
        const cmd = `sf project retrieve start --metadata "Profile" --target-org ${this.orgAlias} --output-dir "${outputDir}" --wait 10`;
        
        try {
            execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
            
            const profiles = await this.parseProfileXML(outputDir);
            this.cache.set(cacheKey, profiles);
            return profiles;
            
        } catch (error) {
            console.error('Profile retrieve failed:', error.message);
            return [];
        }
    }

    /**
     * Parse profile XML files
     */
    async parseProfileXML(baseDir) {
        const profiles = [];
        const profilesDir = path.join(baseDir, 'force-app', 'main', 'default', 'profiles');
        
        try {
            const files = await fs.readdir(profilesDir);
            
            for (const file of files) {
                if (file.endsWith('.profile-meta.xml')) {
                    const content = await fs.readFile(path.join(profilesDir, file), 'utf8');
                    const parsed = await this.parser.parseStringPromise(content);
                    
                    if (parsed.Profile) {
                        const profileName = path.basename(file, '.profile-meta.xml');
                        profiles.push({
                            name: profileName,
                            applicationVisibilities: this.extractAppVisibility(parsed.Profile),
                            recordTypeVisibilities: this.extractRecordTypeVisibility(parsed.Profile)
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error parsing profiles: ${error.message}`);
        }
        
        return profiles;
    }

    /**
     * Extract application visibility from profile
     */
    extractAppVisibility(profile) {
        const apps = [];
        
        if (profile.applicationVisibilities) {
            for (const appVis of profile.applicationVisibilities) {
                apps.push({
                    application: appVis.application?.[0],
                    visible: appVis.visible?.[0] === 'true'
                });
            }
        }
        
        return apps;
    }

    /**
     * Extract record type visibility from profile
     */
    extractRecordTypeVisibility(profile) {
        const recordTypes = [];
        
        if (profile.recordTypeVisibilities) {
            for (const rtVis of profile.recordTypeVisibilities) {
                recordTypes.push({
                    recordType: rtVis.recordType?.[0],
                    visible: rtVis.visible?.[0] === 'true',
                    default: rtVis.default?.[0] === 'true'
                });
            }
        }
        
        return recordTypes;
    }

    /**
     * Check for record type reference in formula
     */
    checkForRecordTypeReference(formula) {
        if (!formula) return false;
        return /RecordType|Record\.Type|\$RecordType/i.test(formula);
    }

    /**
     * Check for portal reference in formula
     */
    checkForPortalReference(formula) {
        if (!formula) return false;
        return /Portal|Onboarding|BRV/i.test(formula);
    }

    /**
     * Calculate formula complexity
     */
    calculateFormulaComplexity(formula) {
        if (!formula) return 0;
        
        let complexity = 0;
        
        // Count logical operators
        complexity += (formula.match(/AND\(/gi) || []).length * 2;
        complexity += (formula.match(/OR\(/gi) || []).length * 2;
        complexity += (formula.match(/NOT\(/gi) || []).length * 1;
        complexity += (formula.match(/IF\(/gi) || []).length * 3;
        complexity += (formula.match(/CASE\(/gi) || []).length * 4;
        
        // Count field references
        complexity += (formula.match(/\w+__c/gi) || []).length * 0.5;
        
        return Math.round(complexity);
    }

    /**
     * Calculate flow complexity
     */
    calculateFlowComplexity(flow) {
        let complexity = 0;
        
        complexity += (flow.decisions?.length || 0) * 2;
        complexity += (flow.loops?.length || 0) * 3;
        complexity += (flow.subflows?.length || 0) * 2;
        complexity += (flow.recordCreates?.length || 0) * 1;
        complexity += (flow.recordUpdates?.length || 0) * 1;
        complexity += (flow.assignments?.length || 0) * 0.5;
        
        return Math.round(complexity);
    }

    /**
     * Extract record type from layout name
     */
    extractRecordTypeFromLayoutName(layoutName) {
        const match = layoutName.match(/^[^-]+-(.+) Layout$/);
        return match ? match[1] : 'Unknown';
    }

    /**
     * Generate comprehensive analysis report
     */
    async generateAnalysisReport(objectName) {
        await this.init();
        
        console.log(`📊 Generating comprehensive analysis for ${objectName}...`);
        
        const report = {
            timestamp: new Date().toISOString(),
            object: objectName,
            org: this.orgAlias,
            validationRules: await this.getValidationRules(objectName),
            flows: await this.getFlows(objectName),
            layouts: await this.getLayouts(objectName),
            profiles: await this.getProfiles(),
            analysis: {}
        };
        
        // Analyze validation rules
        report.analysis.validationRules = {
            total: report.validationRules.length,
            active: report.validationRules.filter(r => r.Active).length,
            referencingRecordType: report.validationRules.filter(r => r.referencesRecordType).length,
            referencingPortal: report.validationRules.filter(r => r.referencesPortal).length,
            highComplexity: report.validationRules.filter(r => r.complexity > 10).length
        };
        
        // Analyze flows
        report.analysis.flows = {
            total: report.flows.length,
            affectingObject: report.flows.filter(f => f.affectsObject).length,
            referencingRecordType: report.flows.filter(f => f.referencesRecordType).length,
            referencingPortal: report.flows.filter(f => f.referencesPortal).length,
            highComplexity: report.flows.filter(f => f.complexity > 10).length
        };
        
        // Analyze layouts
        report.analysis.layouts = {
            total: report.layouts.length,
            byRecordType: {}
        };
        
        for (const layout of report.layouts) {
            const requiredFields = layout.fields.filter(f => f.required).length;
            const readOnlyFields = layout.fields.filter(f => f.readOnly).length;
            
            report.analysis.layouts.byRecordType[layout.recordType] = {
                requiredFields,
                readOnlyFields,
                totalFields: layout.fields.length
            };
        }
        
        return report;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// Export for use by other scripts
module.exports = MetadataRetriever;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: metadata-retrieval-framework.js <command> <object> [org]');
        console.log('Commands:');
        console.log('  validation-rules <object> [org] - Get validation rules with formulas');
        console.log('  flows <object> [org]            - Get flows with entry criteria');
        console.log('  layouts <object> [org]          - Get layouts with field requirements');
        console.log('  profiles [org]                  - Get profile visibility settings');
        console.log('  analyze <object> [org]          - Generate comprehensive report');
        process.exit(1);
    }
    
    const command = args[0];
    const objectName = args[1];
    const orgAlias = args[2] || process.env.SF_TARGET_ORG || 'myorg';
    
    const retriever = new MetadataRetriever(orgAlias);
    
    (async () => {
        await retriever.init();
        
        switch (command) {
            case 'validation-rules':
                const rules = await retriever.getValidationRules(objectName);
                console.log(JSON.stringify(rules, null, 2));
                break;
                
            case 'flows':
                const flows = await retriever.getFlows(objectName);
                console.log(JSON.stringify(flows, null, 2));
                break;
                
            case 'layouts':
                const layouts = await retriever.getLayouts(objectName);
                console.log(JSON.stringify(layouts, null, 2));
                break;
                
            case 'profiles':
                const profiles = await retriever.getProfiles();
                console.log(JSON.stringify(profiles, null, 2));
                break;
                
            case 'analyze':
                const report = await retriever.generateAnalysisReport(objectName);
                const reportFile = path.join(__dirname, '..', '..', 'reports', `metadata-analysis-${objectName}-${Date.now()}.json`);
                await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
                console.log(`📊 Report saved to: ${reportFile}`);
                console.log('\nSummary:');
                console.log(JSON.stringify(report.analysis, null, 2));
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