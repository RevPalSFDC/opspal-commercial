#!/usr/bin/env node

/**
 * Instance-Agnostic Metadata Analyzer for Salesforce
 * 
 * Works with ANY Salesforce instance without hardcoded values
 * Automatically discovers and analyzes metadata for validation rules, flows, layouts, and profiles
 * 
 * Features:
 * - Auto-detects org and instance configuration
 * - Works with any object, not just Opportunity
 * - Handles all record types dynamically
 * - No hardcoded field names or record type names
 * 
 * Usage:
 *   const analyzer = new InstanceAgnosticAnalyzer();
 *   const report = await analyzer.analyzeObject('Account');
 */

const MetadataRetriever = require('./metadata-retrieval-framework');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class InstanceAgnosticAnalyzer {
    constructor(orgAlias = null) {
        // Auto-detect org if not provided
        this.orgAlias = orgAlias || this.detectCurrentOrg();
        this.retriever = new MetadataRetriever(this.orgAlias);
        this.reportDir = path.join(__dirname, '..', '..', 'reports', 'metadata-analysis');
    }

    /**
     * Detect current Salesforce org from environment or CLI
     */
    detectCurrentOrg() {
        // Try environment variable first
        if (process.env.SF_TARGET_ORG) {
            return process.env.SF_TARGET_ORG;
        }
        
        // Try to get default org from sf
        try {
            const result = execSync('sf config get target-org --json', { encoding: 'utf8' });
            const config = JSON.parse(result);
            if (config.result?.[0]?.value) {
                return config.result[0].value;
            }
        } catch (error) {
            console.debug('Could not detect default org:', error.message);
        }
        
        // Fallback
        console.warn('⚠️ No org detected. Please specify with --org parameter or set SF_TARGET_ORG');
        return 'default-org';
    }

    /**
     * Discover all custom and standard objects in the org
     */
    async discoverObjects() {
        console.log(`🔍 Discovering objects in ${this.orgAlias}...`);
        
        const query = `SELECT QualifiedApiName, Label, IsCustomizable 
                       FROM EntityDefinition 
                       WHERE IsCustomizable = true 
                       ORDER BY QualifiedApiName`;
        
        const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
        
        try {
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
            if (result.status === 0 && result.result.records) {
                return result.result.records.map(obj => ({
                    apiName: obj.QualifiedApiName,
                    label: obj.Label,
                    isCustom: obj.QualifiedApiName.endsWith('__c')
                }));
            }
        } catch (error) {
            console.error('Object discovery failed:', error.message);
        }
        
        return [];
    }

    /**
     * Discover record types for an object
     */
    async discoverRecordTypes(objectName) {
        console.log(`🔍 Discovering record types for ${objectName}...`);
        
        const query = `SELECT Id, Name, DeveloperName, IsActive, Description 
                       FROM RecordType 
                       WHERE SobjectType = '${objectName}' 
                       ORDER BY Name`;
        
        const cmd = `sf data query --query "${query}" --json --target-org ${this.orgAlias}`;
        
        try {
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            if (result.status === 0 && result.result.records) {
                return result.result.records;
            }
        } catch (error) {
            console.debug('Record type discovery failed:', error.message);
        }
        
        return [];
    }

    /**
     * Analyze validation rules for any patterns
     */
    async analyzeValidationRules(objectName) {
        const rules = await this.retriever.getValidationRules(objectName);
        const recordTypes = await this.discoverRecordTypes(objectName);
        
        const analysis = {
            total: rules.length,
            active: rules.filter(r => r.Active).length,
            byRecordType: {},
            patterns: {
                recordTypeSpecific: [],
                universalRules: [],
                complexRules: [],
                potentialIssues: []
            }
        };
        
        // Analyze each rule
        for (const rule of rules) {
            if (!rule.ErrorConditionFormula) continue;
            
            const formula = rule.ErrorConditionFormula;
            
            // Check for record type references
            const rtReferences = this.findRecordTypeReferences(formula, recordTypes);
            if (rtReferences.length > 0) {
                analysis.patterns.recordTypeSpecific.push({
                    ruleName: rule.ValidationName,
                    recordTypes: rtReferences,
                    recommendation: this.generateRecordTypeRecommendation(rule, rtReferences)
                });
            } else {
                analysis.patterns.universalRules.push({
                    ruleName: rule.ValidationName,
                    appliesTo: 'All Record Types',
                    risk: 'May block operations across all record types'
                });
            }
            
            // Check complexity
            if (rule.complexity > 10) {
                analysis.patterns.complexRules.push({
                    ruleName: rule.ValidationName,
                    complexity: rule.complexity,
                    recommendation: 'Consider breaking into multiple simpler rules'
                });
            }
            
            // Check for potential issues
            const issues = this.detectPotentialIssues(rule, recordTypes);
            if (issues.length > 0) {
                analysis.patterns.potentialIssues.push({
                    ruleName: rule.ValidationName,
                    issues: issues
                });
            }
        }
        
        // Group by record type impact
        for (const rt of recordTypes) {
            analysis.byRecordType[rt.DeveloperName] = {
                name: rt.Name,
                rulesAffecting: this.findRulesAffectingRecordType(rules, rt),
                exclusiveRules: this.findExclusiveRules(rules, rt)
            };
        }
        
        return analysis;
    }

    /**
     * Find record type references in formula
     */
    findRecordTypeReferences(formula, recordTypes) {
        const references = [];
        
        // Generic pattern for record type references
        const patterns = [
            /\$RecordType\.Name\s*[=<>!]+\s*['"]([^'"]+)['"]/gi,
            /\$RecordType\.DeveloperName\s*[=<>!]+\s*['"]([^'"]+)['"]/gi,
            /RecordType\.Name\s*[=<>!]+\s*['"]([^'"]+)['"]/gi,
            /RecordTypeId\s*[=<>!]+\s*['"]([^'"]+)['"]/gi
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(formula)) !== null) {
                const rtName = match[1];
                // Try to match with actual record types
                const actualRT = recordTypes.find(rt => 
                    rt.Name === rtName || 
                    rt.DeveloperName === rtName
                );
                
                if (actualRT) {
                    references.push(actualRT.DeveloperName);
                } else {
                    references.push(rtName); // Keep unmatched references
                }
            }
        }
        
        return [...new Set(references)]; // Remove duplicates
    }

    /**
     * Generate record type specific recommendation
     */
    generateRecordTypeRecommendation(rule, recordTypes) {
        const recommendations = [];
        
        if (recordTypes.length === 1) {
            recommendations.push(`Rule is specific to ${recordTypes[0]} record type`);
            recommendations.push('Consider if this should apply to other record types');
        } else {
            recommendations.push(`Rule applies to multiple record types: ${recordTypes.join(', ')}`);
            recommendations.push('Verify this is intentional');
        }
        
        // Check for exclusion patterns
        if (rule.ErrorConditionFormula.includes('!=') || rule.ErrorConditionFormula.includes('<>')) {
            recommendations.push('Rule excludes certain record types - verify exclusion list is complete');
        }
        
        return recommendations.join('. ');
    }

    /**
     * Detect potential issues in validation rules
     */
    detectPotentialIssues(rule, recordTypes) {
        const issues = [];
        const formula = rule.ErrorConditionFormula || '';
        
        // Check for hardcoded IDs
        if (/[a-zA-Z0-9]{15,18}/.test(formula) && !formula.includes('CASESAFEID')) {
            issues.push('Contains hardcoded IDs - will break across environments');
        }
        
        // Check for missing null checks
        if (formula.includes('.') && !formula.includes('ISBLANK') && !formula.includes('!= null')) {
            issues.push('May need null checks for relationship fields');
        }
        
        // Check for PRIORVALUE without bypass
        if (formula.includes('PRIORVALUE') && !formula.includes('ISNEW()')) {
            issues.push('PRIORVALUE without ISNEW() check may cause issues on insert');
        }
        
        // Check for profile/user specific logic
        if (formula.includes('$Profile') || formula.includes('$User')) {
            issues.push('Contains user/profile specific logic - verify all profiles tested');
        }
        
        return issues;
    }

    /**
     * Find rules affecting a specific record type
     */
    findRulesAffectingRecordType(rules, recordType) {
        return rules.filter(rule => {
            if (!rule.ErrorConditionFormula) return false;
            
            const formula = rule.ErrorConditionFormula;
            
            // Check if rule explicitly includes this record type
            if (formula.includes(recordType.Name) || formula.includes(recordType.DeveloperName)) {
                return true;
            }
            
            // Check if rule has no record type filter (applies to all)
            if (!formula.includes('RecordType') && !formula.includes('$RecordType')) {
                return true;
            }
            
            return false;
        }).map(r => r.ValidationName);
    }

    /**
     * Find rules exclusive to a record type
     */
    findExclusiveRules(rules, recordType) {
        return rules.filter(rule => {
            if (!rule.ErrorConditionFormula) return false;
            
            const formula = rule.ErrorConditionFormula;
            
            // Check for explicit inclusion
            const includesPattern = new RegExp(
                `(RecordType\\.Name|\\$RecordType\\.DeveloperName)\\s*=\\s*['"]${recordType.DeveloperName}['"]`,
                'i'
            );
            
            return includesPattern.test(formula);
        }).map(r => r.ValidationName);
    }

    /**
     * Analyze flows for record type and entry criteria
     */
    async analyzeFlows(objectName) {
        const flows = await this.retriever.getFlows(objectName);
        const recordTypes = await this.discoverRecordTypes(objectName);
        
        const analysis = {
            total: flows.length,
            affectingObject: flows.filter(f => f.affectsObject).length,
            byTriggerType: {},
            byRecordType: {},
            patterns: {
                recordTypeSpecific: [],
                universalFlows: [],
                complexFlows: [],
                potentialConflicts: []
            }
        };
        
        // Group by trigger type
        for (const flow of flows) {
            const triggerType = flow.triggerType || flow.ProcessType || 'Unknown';
            
            if (!analysis.byTriggerType[triggerType]) {
                analysis.byTriggerType[triggerType] = [];
            }
            
            analysis.byTriggerType[triggerType].push({
                name: flow.MasterLabel,
                hasRecordTypeFilter: flow.referencesRecordType,
                complexity: flow.complexity
            });
            
            // Analyze patterns
            if (flow.referencesRecordType) {
                analysis.patterns.recordTypeSpecific.push({
                    flowName: flow.MasterLabel,
                    recommendation: 'Verify record type filters are comprehensive'
                });
            } else if (flow.affectsObject) {
                analysis.patterns.universalFlows.push({
                    flowName: flow.MasterLabel,
                    risk: 'Triggers for all record types - verify this is intentional'
                });
            }
            
            if (flow.complexity > 10) {
                analysis.patterns.complexFlows.push({
                    flowName: flow.MasterLabel,
                    complexity: flow.complexity,
                    recommendation: 'Consider breaking into smaller flows or using Apex'
                });
            }
        }
        
        // Check for potential conflicts
        for (const triggerType of Object.keys(analysis.byTriggerType)) {
            const flowsOfType = analysis.byTriggerType[triggerType];
            if (flowsOfType.length > 1) {
                analysis.patterns.potentialConflicts.push({
                    triggerType: triggerType,
                    flows: flowsOfType.map(f => f.name),
                    recommendation: 'Multiple flows on same trigger - check execution order'
                });
            }
        }
        
        return analysis;
    }

    /**
     * Analyze layouts for field requirements
     */
    async analyzeLayouts(objectName) {
        const layouts = await this.retriever.getLayouts(objectName);
        const recordTypes = await this.discoverRecordTypes(objectName);
        
        const analysis = {
            total: layouts.length,
            fieldMatrix: {},
            inconsistencies: [],
            recommendations: []
        };
        
        // Build field requirement matrix
        const allFields = new Set();
        
        for (const layout of layouts) {
            for (const field of layout.fields) {
                allFields.add(field.fieldName);
                
                if (!analysis.fieldMatrix[field.fieldName]) {
                    analysis.fieldMatrix[field.fieldName] = {};
                }
                
                analysis.fieldMatrix[field.fieldName][layout.recordType] = {
                    required: field.required,
                    readOnly: field.readOnly,
                    present: true
                };
            }
        }
        
        // Check for inconsistencies
        for (const fieldName of allFields) {
            const fieldLayouts = analysis.fieldMatrix[fieldName];
            const requirements = Object.values(fieldLayouts);
            
            // Check if field has different requirements across layouts
            const hasInconsistency = requirements.some(r => r.required) && 
                                    requirements.some(r => !r.required);
            
            if (hasInconsistency) {
                analysis.inconsistencies.push({
                    field: fieldName,
                    issue: 'Field is required on some layouts but not others',
                    layouts: Object.entries(fieldLayouts).map(([rt, req]) => ({
                        recordType: rt,
                        required: req.required
                    }))
                });
            }
        }
        
        // Generate recommendations
        if (analysis.inconsistencies.length > 0) {
            analysis.recommendations.push(
                'Consider using validation rules instead of layout requirements for consistency'
            );
        }
        
        return analysis;
    }

    /**
     * Analyze profile visibility
     */
    async analyzeProfiles() {
        const profiles = await this.retriever.getProfiles();
        
        const analysis = {
            total: profiles.length,
            appVisibility: {},
            recordTypeAccess: {},
            issues: []
        };
        
        // Analyze app visibility
        for (const profile of profiles) {
            for (const appVis of profile.applicationVisibilities) {
                if (!analysis.appVisibility[appVis.application]) {
                    analysis.appVisibility[appVis.application] = {
                        visible: [],
                        hidden: []
                    };
                }
                
                if (appVis.visible) {
                    analysis.appVisibility[appVis.application].visible.push(profile.name);
                } else {
                    analysis.appVisibility[appVis.application].hidden.push(profile.name);
                }
            }
            
            // Analyze record type access
            for (const rtVis of profile.recordTypeVisibilities) {
                if (!analysis.recordTypeAccess[rtVis.recordType]) {
                    analysis.recordTypeAccess[rtVis.recordType] = {
                        visible: [],
                        hidden: [],
                        default: []
                    };
                }
                
                if (rtVis.visible) {
                    analysis.recordTypeAccess[rtVis.recordType].visible.push(profile.name);
                    if (rtVis.default) {
                        analysis.recordTypeAccess[rtVis.recordType].default.push(profile.name);
                    }
                } else {
                    analysis.recordTypeAccess[rtVis.recordType].hidden.push(profile.name);
                }
            }
        }
        
        // Check for issues
        for (const [app, visibility] of Object.entries(analysis.appVisibility)) {
            if (visibility.visible.length === 0) {
                analysis.issues.push({
                    type: 'app_visibility',
                    app: app,
                    issue: 'No profiles have access to this app'
                });
            }
        }
        
        for (const [rt, access] of Object.entries(analysis.recordTypeAccess)) {
            if (access.default.length === 0 && access.visible.length > 0) {
                analysis.issues.push({
                    type: 'record_type_default',
                    recordType: rt,
                    issue: 'No profile has this as default record type'
                });
            }
        }
        
        return analysis;
    }

    /**
     * Generate comprehensive analysis report for any object
     */
    async analyzeObject(objectName, options = {}) {
        await this.retriever.init();
        await fs.mkdir(this.reportDir, { recursive: true });
        
        console.log(`📊 Analyzing ${objectName} in ${this.orgAlias}...`);
        
        const report = {
            timestamp: new Date().toISOString(),
            org: this.orgAlias,
            object: objectName,
            recordTypes: await this.discoverRecordTypes(objectName),
            analysis: {
                validationRules: await this.analyzeValidationRules(objectName),
                flows: await this.analyzeFlows(objectName),
                layouts: await this.analyzeLayouts(objectName),
                profiles: await this.analyzeProfiles()
            },
            recommendations: [],
            remediationPlan: []
        };
        
        // Generate overall recommendations
        report.recommendations = this.generateRecommendations(report.analysis);
        
        // Generate remediation plan
        report.remediationPlan = this.generateRemediationPlan(report.analysis, objectName);
        
        // Save report
        const filename = `${objectName}-analysis-${this.orgAlias}-${Date.now()}.json`;
        const filepath = path.join(this.reportDir, filename);

        await fs.writeFile(filepath, JSON.stringify(report, null, 2));

        // Quality Gate: Validate report file was created
        const fsSync = require('fs');
        if (!fsSync.existsSync(filepath)) {
            throw new Error('Analysis failed: Report file was not created');
        }

        console.log(`✅ Analysis complete! Report saved to: ${filepath}`);
        
        // Print summary
        this.printSummary(report);
        
        return report;
    }

    /**
     * Generate overall recommendations
     */
    generateRecommendations(analysis) {
        const recommendations = [];
        
        // Validation rule recommendations
        if (analysis.validationRules.patterns.universalRules.length > 0) {
            recommendations.push({
                category: 'Validation Rules',
                priority: 'HIGH',
                recommendation: `${analysis.validationRules.patterns.universalRules.length} validation rules apply to all record types. Consider adding record type filters if needed.`,
                action: 'Review universal validation rules for record type specificity'
            });
        }
        
        if (analysis.validationRules.patterns.potentialIssues.length > 0) {
            recommendations.push({
                category: 'Validation Rules',
                priority: 'HIGH',
                recommendation: `${analysis.validationRules.patterns.potentialIssues.length} validation rules have potential issues`,
                action: 'Fix identified issues in validation rules'
            });
        }
        
        // Flow recommendations
        if (analysis.flows.patterns.potentialConflicts.length > 0) {
            recommendations.push({
                category: 'Flows',
                priority: 'MEDIUM',
                recommendation: 'Multiple flows trigger on same events',
                action: 'Review flow execution order and consider consolidation'
            });
        }
        
        // Layout recommendations
        if (analysis.layouts.inconsistencies.length > 0) {
            recommendations.push({
                category: 'Layouts',
                priority: 'MEDIUM',
                recommendation: `${analysis.layouts.inconsistencies.length} fields have inconsistent requirements across layouts`,
                action: 'Standardize field requirements or use validation rules'
            });
        }
        
        // Profile recommendations
        if (analysis.profiles.issues.length > 0) {
            recommendations.push({
                category: 'Profiles',
                priority: 'LOW',
                recommendation: `${analysis.profiles.issues.length} profile visibility issues found`,
                action: 'Review and fix profile access settings'
            });
        }
        
        return recommendations;
    }

    /**
     * Generate remediation plan
     */
    generateRemediationPlan(analysis, objectName) {
        const plan = [];
        
        // Phase 1: Validation Rules
        if (analysis.validationRules.patterns.potentialIssues.length > 0) {
            plan.push({
                phase: 1,
                category: 'Validation Rules',
                tasks: analysis.validationRules.patterns.potentialIssues.map(issue => ({
                    rule: issue.ruleName,
                    actions: issue.issues.map(i => `Fix: ${i}`),
                    script: `sf project retrieve start --metadata "ValidationRule:${objectName}.${issue.ruleName}"`
                }))
            });
        }
        
        // Phase 2: Flows
        if (analysis.flows.patterns.potentialConflicts.length > 0) {
            plan.push({
                phase: 2,
                category: 'Flows',
                tasks: analysis.flows.patterns.potentialConflicts.map(conflict => ({
                    flows: conflict.flows,
                    action: 'Review execution order and consolidate if possible',
                    script: `sf project retrieve start --metadata "Flow:${conflict.flows.join(',Flow:')}"`
                }))
            });
        }
        
        // Phase 3: Layouts
        if (analysis.layouts.inconsistencies.length > 0) {
            plan.push({
                phase: 3,
                category: 'Layouts',
                tasks: [{
                    action: 'Standardize field requirements across layouts',
                    fields: analysis.layouts.inconsistencies.map(i => i.field),
                    script: `sf project retrieve start --metadata "Layout:${objectName}-*"`
                }]
            });
        }
        
        return plan;
    }

    /**
     * Print analysis summary
     */
    printSummary(report) {
        console.log('\n📋 ANALYSIS SUMMARY');
        console.log('═'.repeat(50));
        console.log(`Object: ${report.object}`);
        console.log(`Org: ${report.org}`);
        console.log(`Record Types: ${report.recordTypes.length}`);
        console.log('');
        
        console.log('VALIDATION RULES:');
        console.log(`  Total: ${report.analysis.validationRules.total}`);
        console.log(`  Active: ${report.analysis.validationRules.active}`);
        console.log(`  Universal: ${report.analysis.validationRules.patterns.universalRules.length}`);
        console.log(`  Issues: ${report.analysis.validationRules.patterns.potentialIssues.length}`);
        console.log('');
        
        console.log('FLOWS:');
        console.log(`  Total: ${report.analysis.flows.total}`);
        console.log(`  Affecting Object: ${report.analysis.flows.affectingObject}`);
        console.log(`  Conflicts: ${report.analysis.flows.patterns.potentialConflicts.length}`);
        console.log('');
        
        console.log('RECOMMENDATIONS:');
        report.recommendations.forEach(rec => {
            console.log(`  [${rec.priority}] ${rec.category}: ${rec.action}`);
        });
    }

    /**
     * Generate deliverables in multiple formats
     */
    async generateDeliverables(objectName) {
        const report = await this.analyzeObject(objectName);
        
        // Generate CSV for validation rules
        await this.generateValidationRulesCSV(report);
        
        // Generate flow trigger map
        await this.generateFlowTriggerMap(report);
        
        // Generate field matrix
        await this.generateFieldMatrix(report);
        
        // Generate remediation script
        await this.generateRemediationScript(report);
        
        console.log('✅ All deliverables generated in reports/metadata-analysis/');
    }

    /**
     * Generate validation rules CSV
     */
    async generateValidationRulesCSV(report) {
        const csv = ['Rule Name,Active,References Record Type,Issues,Recommendation'];
        
        for (const rule of report.analysis.validationRules.patterns.recordTypeSpecific) {
            csv.push(`"${rule.ruleName}",true,true,"","${rule.recommendation}"`);
        }
        
        for (const rule of report.analysis.validationRules.patterns.universalRules) {
            csv.push(`"${rule.ruleName}",true,false,"${rule.risk}","Add record type filter if needed"`);
        }
        
        const filename = `${report.object}-validation-rules-${Date.now()}.csv`;
        await fs.writeFile(path.join(this.reportDir, filename), csv.join('\n'));
    }

    /**
     * Generate flow trigger map
     */
    async generateFlowTriggerMap(report) {
        const map = {
            object: report.object,
            flows: report.analysis.flows.byTriggerType,
            conflicts: report.analysis.flows.patterns.potentialConflicts
        };
        
        const filename = `${report.object}-flow-map-${Date.now()}.json`;
        await fs.writeFile(path.join(this.reportDir, filename), JSON.stringify(map, null, 2));
    }

    /**
     * Generate field requirement matrix
     */
    async generateFieldMatrix(report) {
        const matrix = report.analysis.layouts.fieldMatrix;
        const filename = `${report.object}-field-matrix-${Date.now()}.json`;
        await fs.writeFile(path.join(this.reportDir, filename), JSON.stringify(matrix, null, 2));
    }

    /**
     * Generate remediation script
     */
    async generateRemediationScript(report) {
        const script = ['#!/bin/bash', '', '# Remediation Script', `# Object: ${report.object}`, ''];
        
        for (const phase of report.remediationPlan) {
            script.push(`# Phase ${phase.phase}: ${phase.category}`);
            for (const task of phase.tasks) {
                if (task.script) {
                    script.push(task.script);
                }
            }
            script.push('');
        }
        
        const filename = `${report.object}-remediation-${Date.now()}.sh`;
        await fs.writeFile(path.join(this.reportDir, filename), script.join('\n'));
        await fs.chmod(path.join(this.reportDir, filename), 0o755);
    }
}

// Export for use by sub-agents
module.exports = InstanceAgnosticAnalyzer;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Usage: instance-agnostic-metadata-analyzer.js <object> [--org <alias>] [--deliverables]');
        console.log('Examples:');
        console.log('  instance-agnostic-metadata-analyzer.js Opportunity');
        console.log('  instance-agnostic-metadata-analyzer.js Account --org production');
        console.log('  instance-agnostic-metadata-analyzer.js Contact --deliverables');
        process.exit(1);
    }
    
    const objectName = args[0];
    const orgIndex = args.indexOf('--org');
    const orgAlias = orgIndex >= 0 ? args[orgIndex + 1] : null;
    const generateDeliverables = args.includes('--deliverables');
    
    const analyzer = new InstanceAgnosticAnalyzer(orgAlias);
    
    (async () => {
        if (generateDeliverables) {
            await analyzer.generateDeliverables(objectName);
        } else {
            await analyzer.analyzeObject(objectName);
        }
    })().catch(error => {
        console.error('Error:', error);
        process.exit(1);
    });
}
