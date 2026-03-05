#!/usr/bin/env node

/**
 * Salesforce Object Analysis Engine
 * Advanced analysis algorithms for object metadata optimization
 */

class ObjectAnalysisEngine {
    constructor(metadata) {
        this.metadata = metadata;
        this.analysis = {};
        this.scores = {};
    }

    /**
     * Run complete analysis suite
     */
    async runFullAnalysis() {
        console.log('Starting comprehensive object analysis...');
        
        this.analysis = {
            fieldAnalysis: this.analyzeFields(),
            duplicateDetection: this.detectDuplicates(),
            validationAnalysis: this.analyzeValidationRules(),
            triggerAnalysis: this.analyzeTriggers(),
            automationAnalysis: this.analyzeAutomation(),
            performanceAnalysis: this.analyzePerformance(),
            securityAnalysis: this.analyzeSecurity(),
            dataQualityAnalysis: this.analyzeDataQuality(),
            integrationAnalysis: this.analyzeIntegration(),
            bestPracticeAnalysis: this.analyzeBestPractices(),
            technicalDebtAnalysis: this.analyzeTechnicalDebt(),
            complianceAnalysis: this.analyzeCompliance()
        };
        
        this.scores = this.calculateScores();
        
        return {
            analysis: this.analysis,
            scores: this.scores,
            summary: this.generateAnalysisSummary()
        };
    }

    /**
     * Comprehensive field analysis
     */
    analyzeFields() {
        if (!this.metadata.fields || !this.metadata.fields.details) {
            return { error: 'No field data available' };
        }

        const fields = this.metadata.fields.details;
        const customFields = fields.filter(f => f.custom);
        
        return {
            statistics: {
                total: fields.length,
                custom: customFields.length,
                standard: fields.length - customFields.length,
                required: fields.filter(f => f.required).length,
                unique: fields.filter(f => f.unique).length,
                encrypted: fields.filter(f => f.encrypted).length,
                externalId: fields.filter(f => f.externalId).length,
                formula: fields.filter(f => f.formula).length,
                rollupSummary: fields.filter(f => f.type === 'Summary').length
            },
            typeDistribution: this.getFieldTypeDistribution(fields),
            namingPatterns: this.analyzeNamingPatterns(customFields),
            dataTypes: this.analyzeDataTypes(fields),
            relationships: this.analyzeFieldRelationships(fields),
            utilization: this.analyzeFieldUtilization(),
            recommendations: this.generateFieldRecommendations(fields)
        };
    }

    /**
     * Get distribution of field types
     */
    getFieldTypeDistribution(fields) {
        const distribution = {};
        
        fields.forEach(field => {
            distribution[field.type] = (distribution[field.type] || 0) + 1;
        });
        
        return Object.entries(distribution)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => ({
                type,
                count,
                percentage: ((count / fields.length) * 100).toFixed(2) + '%'
            }));
    }

    /**
     * Analyze field naming patterns
     */
    analyzeNamingPatterns(fields) {
        const patterns = {
            camelCase: 0,
            snake_case: 0,
            PascalCase: 0,
            mixed: 0,
            prefixed: 0,
            suffixed: 0
        };
        
        fields.forEach(field => {
            const name = field.name.replace('__c', '');
            
            if (/^[a-z][a-zA-Z0-9]*$/.test(name)) {
                patterns.camelCase++;
            } else if (/^[a-z]+(_[a-z]+)*$/.test(name)) {
                patterns.snake_case++;
            } else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
                patterns.PascalCase++;
            } else {
                patterns.mixed++;
            }
            
            // Check for common prefixes/suffixes
            if (/^(Is|Has|Can|Should)/.test(name)) {
                patterns.prefixed++;
            }
            if (/(Date|Time|Number|Count|Id)$/.test(name)) {
                patterns.suffixed++;
            }
        });
        
        return {
            patterns,
            consistency: this.calculateNamingConsistency(patterns),
            recommendations: this.getNamingRecommendations(patterns)
        };
    }

    /**
     * Calculate naming consistency score
     */
    calculateNamingConsistency(patterns) {
        const total = Object.values(patterns).reduce((sum, count) => sum + count, 0);
        const maxPattern = Math.max(...Object.values(patterns));
        
        if (total === 0) return 100;
        
        return Math.round((maxPattern / total) * 100);
    }

    /**
     * Get naming recommendations
     */
    getNamingRecommendations(patterns) {
        const recommendations = [];
        const consistency = this.calculateNamingConsistency(patterns);
        
        if (consistency < 70) {
            recommendations.push({
                issue: 'Inconsistent naming conventions',
                recommendation: 'Standardize on PascalCase for field names',
                priority: 'Medium'
            });
        }
        
        if (patterns.mixed > 5) {
            recommendations.push({
                issue: `${patterns.mixed} fields with mixed naming patterns`,
                recommendation: 'Review and standardize field names',
                priority: 'Low'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze data types usage
     */
    analyzeDataTypes(fields) {
        const analysis = {
            textFields: fields.filter(f => f.type === 'string' || f.type === 'textarea'),
            numberFields: fields.filter(f => f.type === 'double' || f.type === 'int' || f.type === 'currency' || f.type === 'percent'),
            dateFields: fields.filter(f => f.type === 'date' || f.type === 'datetime'),
            booleanFields: fields.filter(f => f.type === 'boolean'),
            picklistFields: fields.filter(f => f.type === 'picklist' || f.type === 'multipicklist'),
            lookupFields: fields.filter(f => f.type === 'reference')
        };
        
        // Check for potential issues
        const issues = [];
        
        // Check for excessive text fields
        if (analysis.textFields.length > 100) {
            issues.push({
                type: 'Excessive text fields',
                count: analysis.textFields.length,
                recommendation: 'Consider using picklists for standardized values'
            });
        }
        
        // Check for missing external IDs
        const externalIds = fields.filter(f => f.externalId);
        if (externalIds.length === 0 && this.metadata.basic?.custom) {
            issues.push({
                type: 'No external ID fields',
                recommendation: 'Add external ID for integration purposes'
            });
        }
        
        return {
            distribution: analysis,
            issues
        };
    }

    /**
     * Analyze field relationships
     */
    analyzeFieldRelationships(fields) {
        const lookupFields = fields.filter(f => f.type === 'reference');
        const masterDetailFields = lookupFields.filter(f => f.cascadeDelete);
        
        return {
            lookups: lookupFields.length - masterDetailFields.length,
            masterDetails: masterDetailFields.length,
            relatedObjects: this.getUniqueRelatedObjects(lookupFields),
            circularReferences: this.detectCircularReferences(lookupFields),
            orphanedRelationships: this.detectOrphanedRelationships(lookupFields)
        };
    }

    /**
     * Get unique related objects
     */
    getUniqueRelatedObjects(lookupFields) {
        const objects = new Set();
        
        lookupFields.forEach(field => {
            if (field.referenceTo && Array.isArray(field.referenceTo)) {
                field.referenceTo.forEach(obj => objects.add(obj));
            }
        });
        
        return Array.from(objects);
    }

    /**
     * Detect circular references
     */
    detectCircularReferences(lookupFields) {
        // Simplified check - in production would do graph traversal
        const circular = [];
        const objectName = this.metadata.basic?.name;
        
        lookupFields.forEach(field => {
            if (field.referenceTo && field.referenceTo.includes(objectName)) {
                circular.push({
                    field: field.name,
                    type: 'Self-reference',
                    risk: 'Low'
                });
            }
        });
        
        return circular;
    }

    /**
     * Detect orphaned relationships
     */
    detectOrphanedRelationships(lookupFields) {
        // Would need to query related objects to verify
        return [];
    }

    /**
     * Analyze field utilization from usage data
     */
    analyzeFieldUtilization() {
        if (!this.metadata.fieldUsage || !this.metadata.fieldUsage.details) {
            return { status: 'No usage data available' };
        }
        
        const usage = this.metadata.fieldUsage.details;
        
        return {
            unused: usage.filter(f => parseFloat(f.usagePercentage) === 0),
            rarelyUsed: usage.filter(f => parseFloat(f.usagePercentage) > 0 && parseFloat(f.usagePercentage) < 5),
            underutilized: usage.filter(f => parseFloat(f.usagePercentage) >= 5 && parseFloat(f.usagePercentage) < 25),
            wellUsed: usage.filter(f => parseFloat(f.usagePercentage) >= 25 && parseFloat(f.usagePercentage) < 75),
            heavilyUsed: usage.filter(f => parseFloat(f.usagePercentage) >= 75),
            averageUtilization: this.calculateAverageUtilization(usage),
            recommendations: this.getUtilizationRecommendations(usage)
        };
    }

    /**
     * Calculate average field utilization
     */
    calculateAverageUtilization(usage) {
        if (usage.length === 0) return 0;
        
        const sum = usage.reduce((total, field) => 
            total + parseFloat(field.usagePercentage), 0
        );
        
        return (sum / usage.length).toFixed(2);
    }

    /**
     * Get utilization recommendations
     */
    getUtilizationRecommendations(usage) {
        const recommendations = [];
        const unused = usage.filter(f => parseFloat(f.usagePercentage) === 0);
        const rarelyUsed = usage.filter(f => parseFloat(f.usagePercentage) > 0 && parseFloat(f.usagePercentage) < 5);
        
        if (unused.length > 0) {
            recommendations.push({
                priority: 'High',
                action: 'Remove unused fields',
                fields: unused.map(f => f.fieldName),
                impact: 'Reduce complexity and improve performance',
                effort: '1-2 hours'
            });
        }
        
        if (rarelyUsed.length > 5) {
            recommendations.push({
                priority: 'Medium',
                action: 'Review rarely used fields',
                count: rarelyUsed.length,
                impact: 'Potential consolidation opportunity',
                effort: '2-3 hours'
            });
        }
        
        return recommendations;
    }

    /**
     * Generate field recommendations
     */
    generateFieldRecommendations(fields) {
        const recommendations = [];
        const customFields = fields.filter(f => f.custom);
        
        // Check field count limits
        if (customFields.length > 400) {
            recommendations.push({
                priority: 'Critical',
                issue: 'Approaching field limit',
                current: customFields.length,
                limit: 500,
                action: 'Archive or remove unused fields immediately'
            });
        } else if (customFields.length > 300) {
            recommendations.push({
                priority: 'High',
                issue: 'High field count',
                current: customFields.length,
                action: 'Plan field cleanup and consolidation'
            });
        }
        
        // Check for missing descriptions
        const missingHelp = customFields.filter(f => !f.inlineHelpText);
        if (missingHelp.length > 20) {
            recommendations.push({
                priority: 'Low',
                issue: 'Missing field descriptions',
                count: missingHelp.length,
                action: 'Add inline help text for user guidance'
            });
        }
        
        return recommendations;
    }

    /**
     * Detect duplicate fields
     */
    detectDuplicates() {
        if (!this.metadata.fields || !this.metadata.fields.details) {
            return { duplicates: [], consolidationOpportunities: [] };
        }
        
        const fields = this.metadata.fields.details.filter(f => f.custom);
        const duplicates = [];
        const consolidationOpportunities = [];
        
        for (let i = 0; i < fields.length; i++) {
            for (let j = i + 1; j < fields.length; j++) {
                const similarity = this.calculateSimilarity(fields[i], fields[j]);
                
                if (similarity.overall > 0.8) {
                    duplicates.push({
                        field1: fields[i].name,
                        field2: fields[j].name,
                        similarity: similarity,
                        recommendation: this.getDuplicateRecommendation(fields[i], fields[j], similarity)
                    });
                } else if (similarity.overall > 0.6) {
                    consolidationOpportunities.push({
                        fields: [fields[i].name, fields[j].name],
                        similarity: similarity,
                        potential: 'Medium'
                    });
                }
            }
        }
        
        return {
            duplicates,
            consolidationOpportunities,
            summary: {
                duplicateCount: duplicates.length,
                consolidationCount: consolidationOpportunities.length,
                estimatedSavings: `${(duplicates.length * 2 + consolidationOpportunities.length)} fields`
            }
        };
    }

    /**
     * Calculate field similarity
     */
    calculateSimilarity(field1, field2) {
        const nameSim = this.stringSimilarity(field1.name, field2.name);
        const labelSim = this.stringSimilarity(field1.label || '', field2.label || '');
        const typeSim = field1.type === field2.type ? 1 : 0;
        
        // Check semantic similarity
        const semanticSim = this.checkSemanticSimilarity(field1, field2);
        
        return {
            name: (nameSim * 100).toFixed(1) + '%',
            label: (labelSim * 100).toFixed(1) + '%',
            type: typeSim ? 'Match' : 'Different',
            semantic: semanticSim,
            overall: (nameSim * 0.3 + labelSim * 0.3 + typeSim * 0.2 + semanticSim * 0.2)
        };
    }

    /**
     * String similarity using Levenshtein distance
     */
    stringSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
        return (longer.length - distance) / longer.length;
    }

    /**
     * Levenshtein distance algorithm
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * Check semantic similarity between fields
     */
    checkSemanticSimilarity(field1, field2) {
        // Check if both fields serve similar purposes
        const purposeIndicators = {
            dates: ['date', 'time', 'created', 'modified', 'updated'],
            amounts: ['amount', 'price', 'cost', 'value', 'total', 'sum'],
            counts: ['count', 'number', 'quantity', 'num'],
            status: ['status', 'state', 'stage', 'phase'],
            identifiers: ['id', 'code', 'key', 'identifier', 'number']
        };
        
        for (const [purpose, indicators] of Object.entries(purposeIndicators)) {
            const field1Matches = indicators.some(ind => 
                field1.name.toLowerCase().includes(ind) || 
                (field1.label && field1.label.toLowerCase().includes(ind))
            );
            const field2Matches = indicators.some(ind => 
                field2.name.toLowerCase().includes(ind) || 
                (field2.label && field2.label.toLowerCase().includes(ind))
            );
            
            if (field1Matches && field2Matches) {
                return 0.8; // High semantic similarity
            }
        }
        
        return 0;
    }

    /**
     * Get duplicate field recommendation
     */
    getDuplicateRecommendation(field1, field2, similarity) {
        if (similarity.overall > 0.9) {
            return 'Strong candidate for consolidation - fields are nearly identical';
        } else if (similarity.type === 'Match' && similarity.overall > 0.8) {
            return 'Consider merging these fields after data analysis';
        } else {
            return 'Review for potential consolidation opportunity';
        }
    }

    /**
     * Analyze validation rules
     */
    analyzeValidationRules() {
        if (!this.metadata.validationRules) {
            return { status: 'No validation rules data' };
        }
        
        const rules = this.metadata.validationRules.details || [];
        
        return {
            total: rules.length,
            active: rules.filter(r => r.Active).length,
            inactive: rules.filter(r => !r.Active).length,
            complexity: this.analyzeRuleComplexity(rules),
            overlap: this.detectRuleOverlap(rules),
            consolidation: this.identifyConsolidationOpportunities(rules),
            recommendations: this.getValidationRecommendations(rules)
        };
    }

    /**
     * Analyze rule complexity
     */
    analyzeRuleComplexity(rules) {
        // Simplified complexity analysis
        return {
            simple: rules.filter(r => !r.Description || r.Description.length < 100).length,
            medium: rules.filter(r => r.Description && r.Description.length >= 100 && r.Description.length < 500).length,
            complex: rules.filter(r => r.Description && r.Description.length >= 500).length
        };
    }

    /**
     * Detect validation rule overlap
     */
    detectRuleOverlap(rules) {
        const overlaps = [];
        
        // Check for rules with similar error messages
        for (let i = 0; i < rules.length; i++) {
            for (let j = i + 1; j < rules.length; j++) {
                if (rules[i].ErrorMessage && rules[j].ErrorMessage) {
                    const similarity = this.stringSimilarity(rules[i].ErrorMessage, rules[j].ErrorMessage);
                    if (similarity > 0.7) {
                        overlaps.push({
                            rule1: rules[i].ValidationName,
                            rule2: rules[j].ValidationName,
                            similarity: (similarity * 100).toFixed(1) + '%',
                            recommendation: 'Consider consolidating these rules'
                        });
                    }
                }
            }
        }
        
        return overlaps;
    }

    /**
     * Identify consolidation opportunities for validation rules
     */
    identifyConsolidationOpportunities(rules) {
        const opportunities = [];
        
        // Group rules by error field
        const byField = {};
        rules.forEach(rule => {
            const field = rule.ErrorDisplayField || 'Top of Page';
            if (!byField[field]) {
                byField[field] = [];
            }
            byField[field].push(rule);
        });
        
        // Check for multiple rules on same field
        Object.entries(byField).forEach(([field, fieldRules]) => {
            if (fieldRules.length > 2) {
                opportunities.push({
                    field,
                    ruleCount: fieldRules.length,
                    rules: fieldRules.map(r => r.ValidationName),
                    recommendation: 'Consolidate into single comprehensive rule'
                });
            }
        });
        
        return opportunities;
    }

    /**
     * Get validation rule recommendations
     */
    getValidationRecommendations(rules) {
        const recommendations = [];
        
        if (rules.length > 20) {
            recommendations.push({
                priority: 'Medium',
                issue: 'High number of validation rules',
                count: rules.length,
                action: 'Review and consolidate related rules'
            });
        }
        
        const inactive = rules.filter(r => !r.Active);
        if (inactive.length > 5) {
            recommendations.push({
                priority: 'Low',
                issue: 'Multiple inactive validation rules',
                count: inactive.length,
                action: 'Remove or archive inactive rules'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze triggers
     */
    analyzeTriggers() {
        if (!this.metadata.triggers) {
            return { status: 'No trigger data' };
        }
        
        const triggers = this.metadata.triggers.details || [];
        
        return {
            count: triggers.length,
            totalLines: this.metadata.triggers.totalLines || 0,
            complexity: this.analyzeTriggerComplexity(triggers),
            patterns: this.detectTriggerPatterns(triggers),
            issues: this.identifyTriggerIssues(triggers),
            recommendations: this.getTriggerRecommendations(triggers)
        };
    }

    /**
     * Analyze trigger complexity
     */
    analyzeTriggerComplexity(triggers) {
        return triggers.map(trigger => ({
            name: trigger.name,
            lines: trigger.linesOfCode,
            complexity: this.calculateTriggerComplexity(trigger),
            events: this.countTriggerEvents(trigger.events),
            recommendation: this.getTriggerComplexityRecommendation(trigger)
        }));
    }

    /**
     * Calculate trigger complexity score
     */
    calculateTriggerComplexity(trigger) {
        let score = 0;
        
        // Lines of code
        if (trigger.linesOfCode > 200) score += 3;
        else if (trigger.linesOfCode > 100) score += 2;
        else if (trigger.linesOfCode > 50) score += 1;
        
        // Number of events
        const eventCount = this.countTriggerEvents(trigger.events);
        score += eventCount;
        
        // API version
        if (trigger.apiVersion && parseFloat(trigger.apiVersion) < 50) {
            score += 2;
        }
        
        return {
            score,
            level: score > 7 ? 'High' : score > 4 ? 'Medium' : 'Low'
        };
    }

    /**
     * Count trigger events
     */
    countTriggerEvents(events) {
        if (!events) return 0;
        
        return Object.values(events).filter(v => v === true).length;
    }

    /**
     * Get trigger complexity recommendation
     */
    getTriggerComplexityRecommendation(trigger) {
        const complexity = this.calculateTriggerComplexity(trigger);
        
        if (complexity.level === 'High') {
            return 'Refactor into handler pattern with separate classes';
        } else if (complexity.level === 'Medium') {
            return 'Consider splitting logic into helper methods';
        }
        
        return 'Well-structured trigger';
    }

    /**
     * Detect trigger patterns
     */
    detectTriggerPatterns(triggers) {
        return {
            handlerPattern: triggers.some(t => t.name.toLowerCase().includes('handler')),
            multipleTriggersPerEvent: this.detectMultipleTriggersPerEvent(triggers),
            bulkificationIssues: this.detectBulkificationIssues(triggers),
            recursionControl: this.detectRecursionControl(triggers)
        };
    }

    /**
     * Detect multiple triggers on same events
     */
    detectMultipleTriggersPerEvent(triggers) {
        const eventMap = {};
        const conflicts = [];
        
        triggers.forEach(trigger => {
            if (trigger.events) {
                Object.entries(trigger.events).forEach(([event, active]) => {
                    if (active) {
                        if (!eventMap[event]) {
                            eventMap[event] = [];
                        }
                        eventMap[event].push(trigger.name);
                    }
                });
            }
        });
        
        Object.entries(eventMap).forEach(([event, triggerNames]) => {
            if (triggerNames.length > 1) {
                conflicts.push({
                    event,
                    triggers: triggerNames,
                    issue: 'Multiple triggers on same event',
                    recommendation: 'Consolidate into single trigger'
                });
            }
        });
        
        return conflicts;
    }

    /**
     * Detect potential bulkification issues
     */
    detectBulkificationIssues(triggers) {
        // Would need to analyze trigger body for SOQL/DML in loops
        return [];
    }

    /**
     * Detect recursion control
     */
    detectRecursionControl(triggers) {
        // Would need to analyze trigger body for recursion control patterns
        return triggers.length > 0 ? 'Analysis requires trigger body inspection' : 'N/A';
    }

    /**
     * Identify trigger issues
     */
    identifyTriggerIssues(triggers) {
        const issues = [];
        
        triggers.forEach(trigger => {
            if (trigger.linesOfCode > 200) {
                issues.push({
                    trigger: trigger.name,
                    issue: 'Large trigger',
                    lines: trigger.linesOfCode,
                    severity: 'High'
                });
            }
            
            if (trigger.apiVersion && parseFloat(trigger.apiVersion) < 50) {
                issues.push({
                    trigger: trigger.name,
                    issue: 'Outdated API version',
                    version: trigger.apiVersion,
                    severity: 'Medium'
                });
            }
            
            if (!trigger.isValid) {
                issues.push({
                    trigger: trigger.name,
                    issue: 'Invalid trigger',
                    severity: 'Critical'
                });
            }
        });
        
        return issues;
    }

    /**
     * Get trigger recommendations
     */
    getTriggerRecommendations(triggers) {
        const recommendations = [];
        
        if (triggers.length > 1) {
            recommendations.push({
                priority: 'High',
                action: 'Consolidate multiple triggers',
                reason: 'Multiple triggers can cause order dependencies',
                pattern: 'Use single trigger with handler pattern'
            });
        }
        
        const largeTriggersCount = triggers.filter(t => t.linesOfCode > 200).length;
        if (largeTriggersCount > 0) {
            recommendations.push({
                priority: 'High',
                action: 'Refactor large triggers',
                count: largeTriggersCount,
                pattern: 'Move logic to handler classes'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze automation (flows, process builders, workflows)
     */
    analyzeAutomation() {
        if (!this.metadata.automation) {
            return { status: 'No automation data' };
        }
        
        return {
            flows: this.analyzeFlows(),
            consolidation: this.identifyAutomationConsolidation(),
            migration: this.recommendAutomationMigration(),
            recommendations: this.getAutomationRecommendations()
        };
    }

    /**
     * Analyze flows
     */
    analyzeFlows() {
        if (!this.metadata.automation.flows) {
            return { count: 0 };
        }
        
        const flows = this.metadata.automation.flows.details || [];
        
        return {
            total: flows.length,
            active: flows.filter(f => f.IsActive).length,
            byType: this.groupFlowsByType(flows),
            recent: flows.filter(f => {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                return new Date(f.LastModifiedDate) > thirtyDaysAgo;
            }).length
        };
    }

    /**
     * Group flows by type
     */
    groupFlowsByType(flows) {
        const byType = {};
        
        flows.forEach(flow => {
            const type = flow.ProcessType || 'Unknown';
            byType[type] = (byType[type] || 0) + 1;
        });
        
        return byType;
    }

    /**
     * Identify automation consolidation opportunities
     */
    identifyAutomationConsolidation() {
        const opportunities = [];
        
        // Check for multiple automations on same object
        if (this.metadata.automation.flows && this.metadata.automation.flows.count > 3) {
            opportunities.push({
                type: 'Multiple flows',
                count: this.metadata.automation.flows.count,
                recommendation: 'Consolidate related flows'
            });
        }
        
        return opportunities;
    }

    /**
     * Recommend automation migration
     */
    recommendAutomationMigration() {
        const recommendations = [];
        
        // Always recommend migrating to Flow
        if (this.metadata.automation.workflowRules && this.metadata.automation.workflowRules.count > 0) {
            recommendations.push({
                from: 'Workflow Rules',
                to: 'Flow',
                count: this.metadata.automation.workflowRules.count,
                reason: 'Workflow rules are being retired'
            });
        }
        
        if (this.metadata.automation.processBuilders && this.metadata.automation.processBuilders.count > 0) {
            recommendations.push({
                from: 'Process Builder',
                to: 'Flow',
                count: this.metadata.automation.processBuilders.count,
                reason: 'Process Builder is being retired'
            });
        }
        
        return recommendations;
    }

    /**
     * Get automation recommendations
     */
    getAutomationRecommendations() {
        const recommendations = [];
        
        if (this.metadata.automation.flows && this.metadata.automation.flows.count > 5) {
            recommendations.push({
                priority: 'Medium',
                issue: 'High number of flows',
                action: 'Review and consolidate automation'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze performance
     */
    analyzePerformance() {
        return {
            fieldCount: this.analyzeFieldCountPerformance(),
            triggerPerformance: this.analyzeTriggerPerformance(),
            pageLayoutPerformance: this.analyzePageLayoutPerformance(),
            queryPerformance: this.analyzeQueryPerformance(),
            recommendations: this.getPerformanceRecommendations()
        };
    }

    /**
     * Analyze field count performance impact
     */
    analyzeFieldCountPerformance() {
        const customFields = this.metadata.fields?.custom || 0;
        
        return {
            count: customFields,
            limit: 500,
            percentage: ((customFields / 500) * 100).toFixed(1) + '%',
            impact: customFields > 400 ? 'Critical' : 
                   customFields > 300 ? 'High' : 
                   customFields > 200 ? 'Medium' : 'Low'
        };
    }

    /**
     * Analyze trigger performance
     */
    analyzeTriggerPerformance() {
        const triggers = this.metadata.triggers?.details || [];
        const totalLines = this.metadata.triggers?.totalLines || 0;
        
        return {
            count: triggers.length,
            totalLines,
            averageLines: triggers.length > 0 ? Math.round(totalLines / triggers.length) : 0,
            impact: totalLines > 1000 ? 'High' : totalLines > 500 ? 'Medium' : 'Low'
        };
    }

    /**
     * Analyze page layout performance
     */
    analyzePageLayoutPerformance() {
        // Would need actual page layout field counts
        return {
            layoutCount: this.metadata.pageLayouts?.count || 0,
            recommendation: 'Review page layouts for excessive fields'
        };
    }

    /**
     * Analyze query performance
     */
    analyzeQueryPerformance() {
        const indexedFields = this.metadata.fields?.details?.filter(f => 
            f.unique || f.externalId
        ).length || 0;
        
        return {
            indexedFields,
            recommendation: indexedFields < 3 ? 'Consider adding indexed fields for common queries' : 'Good indexing coverage'
        };
    }

    /**
     * Get performance recommendations
     */
    getPerformanceRecommendations() {
        const recommendations = [];
        const fieldPerf = this.analyzeFieldCountPerformance();
        
        if (fieldPerf.impact === 'Critical' || fieldPerf.impact === 'High') {
            recommendations.push({
                priority: 'High',
                issue: 'High field count impacting performance',
                action: 'Archive or remove unused fields',
                impact: 'Improve page load times and API performance'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze security
     */
    analyzeSecurity() {
        return {
            encryption: this.analyzeEncryption(),
            fieldSecurity: this.analyzeFieldSecurity(),
            piiDetection: this.detectPIIFields(),
            recommendations: this.getSecurityRecommendations()
        };
    }

    /**
     * Analyze encryption
     */
    analyzeEncryption() {
        const encryptedFields = this.metadata.fields?.encrypted || 0;
        const piiFields = this.detectPIIFields();
        
        return {
            encryptedCount: encryptedFields,
            unencryptedPII: piiFields.filter(f => !f.encrypted),
            coverage: piiFields.length > 0 ? 
                ((piiFields.filter(f => f.encrypted).length / piiFields.length) * 100).toFixed(1) + '%' : 
                'N/A'
        };
    }

    /**
     * Analyze field-level security
     */
    analyzeFieldSecurity() {
        // Would need to query field permissions
        return {
            status: 'Requires permission analysis'
        };
    }

    /**
     * Detect PII fields
     */
    detectPIIFields() {
        if (!this.metadata.fields || !this.metadata.fields.details) {
            return [];
        }
        
        const piiPatterns = [
            'ssn', 'social', 'tax', 'tin', 'ein',
            'credit', 'card', 'bank', 'account', 'routing',
            'passport', 'license', 'dl',
            'dob', 'birth', 'birthdate',
            'salary', 'compensation', 'wage'
        ];
        
        const piiFields = [];
        
        this.metadata.fields.details.forEach(field => {
            const fieldNameLower = field.name.toLowerCase();
            const fieldLabelLower = (field.label || '').toLowerCase();
            
            const isPII = piiPatterns.some(pattern => 
                fieldNameLower.includes(pattern) || fieldLabelLower.includes(pattern)
            );
            
            if (isPII) {
                piiFields.push({
                    name: field.name,
                    label: field.label,
                    type: field.type,
                    encrypted: field.encrypted || false,
                    risk: field.encrypted ? 'Low' : 'High'
                });
            }
        });
        
        return piiFields;
    }

    /**
     * Get security recommendations
     */
    getSecurityRecommendations() {
        const recommendations = [];
        const piiFields = this.detectPIIFields();
        const unencryptedPII = piiFields.filter(f => !f.encrypted);
        
        if (unencryptedPII.length > 0) {
            recommendations.push({
                priority: 'Critical',
                issue: 'Unencrypted PII fields',
                fields: unencryptedPII.map(f => f.name),
                action: 'Enable platform encryption immediately'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze data quality
     */
    analyzeDataQuality() {
        return {
            fieldCompleteness: this.analyzeFieldCompleteness(),
            duplicatePotential: this.analyzeDuplicatePotential(),
            dataStandardization: this.analyzeDataStandardization(),
            recommendations: this.getDataQualityRecommendations()
        };
    }

    /**
     * Analyze field completeness
     */
    analyzeFieldCompleteness() {
        if (!this.metadata.fieldUsage || !this.metadata.fieldUsage.details) {
            return { status: 'No usage data available' };
        }
        
        const usage = this.metadata.fieldUsage.details;
        const requiredFields = this.metadata.fields?.details?.filter(f => f.required) || [];
        
        return {
            averageCompleteness: this.calculateAverageUtilization(usage) + '%',
            requiredFieldCount: requiredFields.length,
            lowCompletionFields: usage.filter(f => parseFloat(f.usagePercentage) < 50)
        };
    }

    /**
     * Analyze duplicate potential
     */
    analyzeDuplicatePotential() {
        const uniqueFields = this.metadata.fields?.details?.filter(f => f.unique).length || 0;
        const externalIds = this.metadata.fields?.details?.filter(f => f.externalId).length || 0;
        
        return {
            uniqueConstraints: uniqueFields,
            externalIds,
            hasDuplicateRules: false, // Would need to query duplicate rules
            risk: uniqueFields === 0 ? 'High' : uniqueFields < 2 ? 'Medium' : 'Low'
        };
    }

    /**
     * Analyze data standardization
     */
    analyzeDataStandardization() {
        const picklistFields = this.metadata.fields?.details?.filter(f => 
            f.type === 'picklist' || f.type === 'multipicklist'
        ).length || 0;
        
        const textFields = this.metadata.fields?.details?.filter(f => 
            f.type === 'string' || f.type === 'textarea'
        ).length || 0;
        
        return {
            standardizationRatio: textFields > 0 ? 
                ((picklistFields / (picklistFields + textFields)) * 100).toFixed(1) + '%' : 
                'N/A',
            recommendation: picklistFields < textFields * 0.3 ? 
                'Consider using more picklists for standardization' : 
                'Good standardization level'
        };
    }

    /**
     * Get data quality recommendations
     */
    getDataQualityRecommendations() {
        const recommendations = [];
        const duplicatePotential = this.analyzeDuplicatePotential();
        
        if (duplicatePotential.risk === 'High') {
            recommendations.push({
                priority: 'High',
                issue: 'No unique constraints',
                action: 'Add unique fields or duplicate rules to prevent duplicates'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze integration
     */
    analyzeIntegration() {
        return {
            externalIds: this.analyzeExternalIds(),
            apiUsage: this.analyzeAPIUsage(),
            connectedSystems: this.analyzeConnectedSystems(),
            recommendations: this.getIntegrationRecommendations()
        };
    }

    /**
     * Analyze external IDs
     */
    analyzeExternalIds() {
        const externalIdFields = this.metadata.fields?.details?.filter(f => f.externalId) || [];
        
        return {
            count: externalIdFields.length,
            fields: externalIdFields.map(f => ({
                name: f.name,
                type: f.type,
                unique: f.unique
            })),
            coverage: externalIdFields.length > 0 ? 'Configured' : 'Missing'
        };
    }

    /**
     * Analyze API usage
     */
    analyzeAPIUsage() {
        // Would need to analyze integration patterns
        return {
            status: 'Requires API usage analysis'
        };
    }

    /**
     * Analyze connected systems
     */
    analyzeConnectedSystems() {
        // Based on external ID naming patterns
        const externalIdFields = this.metadata.fields?.details?.filter(f => f.externalId) || [];
        const systems = new Set();
        
        externalIdFields.forEach(field => {
            // Common patterns: System_Id__c, SystemID__c, System_External_Id__c
            const match = field.name.match(/^([A-Z][a-z]+)(?:_|ID|_External)/);
            if (match) {
                systems.add(match[1]);
            }
        });
        
        return {
            identifiedSystems: Array.from(systems),
            externalIdCount: externalIdFields.length
        };
    }

    /**
     * Get integration recommendations
     */
    getIntegrationRecommendations() {
        const recommendations = [];
        const externalIds = this.analyzeExternalIds();
        
        if (externalIds.count === 0 && this.metadata.basic?.custom) {
            recommendations.push({
                priority: 'Medium',
                issue: 'No external ID fields',
                action: 'Add external ID field for integration purposes'
            });
        }
        
        return recommendations;
    }

    /**
     * Analyze best practices
     */
    analyzeBestPractices() {
        const violations = [];
        
        // Naming conventions
        const namingIssues = this.checkNamingConventions();
        if (namingIssues.length > 0) {
            violations.push(...namingIssues);
        }
        
        // Documentation
        const docIssues = this.checkDocumentation();
        if (docIssues.length > 0) {
            violations.push(...docIssues);
        }
        
        // Architecture patterns
        const architectureIssues = this.checkArchitecturePatterns();
        if (architectureIssues.length > 0) {
            violations.push(...architectureIssues);
        }
        
        return {
            violations,
            score: this.calculateBestPracticeScore(violations)
        };
    }

    /**
     * Check naming conventions
     */
    checkNamingConventions() {
        const issues = [];
        const fields = this.metadata.fields?.details?.filter(f => f.custom) || [];
        
        const poorlyNamed = fields.filter(f => {
            const name = f.name.replace('__c', '');
            return !/^[A-Z][a-zA-Z0-9_]*$/.test(name);
        });
        
        if (poorlyNamed.length > 5) {
            issues.push({
                category: 'Naming',
                issue: `${poorlyNamed.length} fields with non-standard naming`,
                severity: 'Low',
                recommendation: 'Follow CamelCase naming convention'
            });
        }
        
        return issues;
    }

    /**
     * Check documentation
     */
    checkDocumentation() {
        const issues = [];
        const fields = this.metadata.fields?.details?.filter(f => f.custom) || [];
        
        const undocumented = fields.filter(f => !f.inlineHelpText);
        
        if (undocumented.length > fields.length * 0.5) {
            issues.push({
                category: 'Documentation',
                issue: `${undocumented.length} fields without help text`,
                severity: 'Medium',
                recommendation: 'Add inline help text for user guidance'
            });
        }
        
        return issues;
    }

    /**
     * Check architecture patterns
     */
    checkArchitecturePatterns() {
        const issues = [];
        
        // Check trigger pattern
        if (this.metadata.triggers?.count > 1) {
            issues.push({
                category: 'Architecture',
                issue: 'Multiple triggers on object',
                severity: 'High',
                recommendation: 'Use single trigger with handler pattern'
            });
        }
        
        return issues;
    }

    /**
     * Calculate best practice score
     */
    calculateBestPracticeScore(violations) {
        let score = 100;
        
        violations.forEach(violation => {
            switch (violation.severity) {
                case 'Critical':
                    score -= 20;
                    break;
                case 'High':
                    score -= 10;
                    break;
                case 'Medium':
                    score -= 5;
                    break;
                case 'Low':
                    score -= 2;
                    break;
            }
        });
        
        return Math.max(0, score);
    }

    /**
     * Analyze technical debt
     */
    analyzeTechnicalDebt() {
        return {
            legacyComponents: this.identifyLegacyComponents(),
            deprecatedFeatures: this.identifyDeprecatedFeatures(),
            codeQuality: this.assessCodeQuality(),
            maintenanceRisk: this.assessMaintenanceRisk(),
            estimatedEffort: this.estimateRemediationEffort()
        };
    }

    /**
     * Identify legacy components
     */
    identifyLegacyComponents() {
        const legacy = [];
        
        // Check API versions
        if (this.metadata.triggers?.details) {
            this.metadata.triggers.details.forEach(trigger => {
                if (trigger.apiVersion && parseFloat(trigger.apiVersion) < 45) {
                    legacy.push({
                        type: 'Trigger',
                        name: trigger.name,
                        issue: `API version ${trigger.apiVersion}`,
                        recommendation: 'Update to latest API version'
                    });
                }
            });
        }
        
        return legacy;
    }

    /**
     * Identify deprecated features
     */
    identifyDeprecatedFeatures() {
        const deprecated = [];
        
        // Workflow rules and process builders are being deprecated
        if (this.metadata.automation?.workflowRules?.count > 0) {
            deprecated.push({
                feature: 'Workflow Rules',
                count: this.metadata.automation.workflowRules.count,
                recommendation: 'Migrate to Flow'
            });
        }
        
        if (this.metadata.automation?.processBuilders?.count > 0) {
            deprecated.push({
                feature: 'Process Builder',
                count: this.metadata.automation.processBuilders.count,
                recommendation: 'Migrate to Flow'
            });
        }
        
        return deprecated;
    }

    /**
     * Assess code quality
     */
    assessCodeQuality() {
        const triggers = this.metadata.triggers?.details || [];
        const avgLines = triggers.length > 0 ? 
            Math.round(this.metadata.triggers.totalLines / triggers.length) : 0;
        
        return {
            averageTriggerSize: avgLines,
            quality: avgLines > 200 ? 'Poor' : avgLines > 100 ? 'Fair' : 'Good'
        };
    }

    /**
     * Assess maintenance risk
     */
    assessMaintenanceRisk() {
        const factors = [];
        
        if (this.metadata.fields?.custom > 300) {
            factors.push('High field count');
        }
        
        if (this.metadata.triggers?.count > 2) {
            factors.push('Multiple triggers');
        }
        
        if (this.metadata.validationRules?.count > 20) {
            factors.push('Complex validation logic');
        }
        
        return {
            risk: factors.length > 2 ? 'High' : factors.length > 0 ? 'Medium' : 'Low',
            factors
        };
    }

    /**
     * Estimate remediation effort
     */
    estimateRemediationEffort() {
        let hours = 0;
        
        // Field cleanup
        const unusedFields = this.metadata.fieldUsage?.unused || 0;
        hours += unusedFields * 0.25; // 15 minutes per field
        
        // Trigger refactoring
        if (this.metadata.triggers?.totalLines > 500) {
            hours += 8; // Full day for trigger refactoring
        }
        
        // Validation rule consolidation
        if (this.metadata.validationRules?.count > 20) {
            hours += 4;
        }
        
        return {
            estimatedHours: Math.round(hours),
            breakdown: {
                fieldCleanup: Math.round(unusedFields * 0.25),
                triggerRefactoring: this.metadata.triggers?.totalLines > 500 ? 8 : 0,
                validationConsolidation: this.metadata.validationRules?.count > 20 ? 4 : 0
            }
        };
    }

    /**
     * Analyze compliance
     */
    analyzeCompliance() {
        return {
            dataPrivacy: this.analyzeDataPrivacy(),
            auditCompliance: this.analyzeAuditCompliance(),
            regulatoryRequirements: this.analyzeRegulatoryRequirements(),
            recommendations: this.getComplianceRecommendations()
        };
    }

    /**
     * Analyze data privacy compliance
     */
    analyzeDataPrivacy() {
        const piiFields = this.detectPIIFields();
        
        return {
            piiFieldCount: piiFields.length,
            encryptedPII: piiFields.filter(f => f.encrypted).length,
            unencryptedPII: piiFields.filter(f => !f.encrypted).length,
            complianceStatus: piiFields.every(f => f.encrypted) ? 'Compliant' : 'Non-compliant'
        };
    }

    /**
     * Analyze audit compliance
     */
    analyzeAuditCompliance() {
        // Check for field history tracking
        const hasFieldHistory = false; // Would need to query field history settings
        
        return {
            fieldHistoryTracking: hasFieldHistory ? 'Enabled' : 'Disabled',
            recommendation: !hasFieldHistory ? 'Enable field history for critical fields' : 'Configured'
        };
    }

    /**
     * Analyze regulatory requirements
     */
    analyzeRegulatoryRequirements() {
        // Basic regulatory checks
        return {
            gdpr: this.checkGDPRRequirements(),
            hipaa: this.checkHIPAARequirements(),
            sox: this.checkSOXRequirements()
        };
    }

    /**
     * Check GDPR requirements
     */
    checkGDPRRequirements() {
        const piiFields = this.detectPIIFields();
        
        return {
            applicable: piiFields.length > 0,
            requirements: [
                {
                    requirement: 'Data encryption',
                    status: piiFields.every(f => f.encrypted) ? 'Met' : 'Not Met'
                },
                {
                    requirement: 'Data retention policy',
                    status: 'Requires manual review'
                }
            ]
        };
    }

    /**
     * Check HIPAA requirements
     */
    checkHIPAARequirements() {
        // Check for health-related fields
        const healthPatterns = ['health', 'medical', 'diagnosis', 'treatment', 'prescription'];
        const healthFields = this.metadata.fields?.details?.filter(f => {
            const nameLower = f.name.toLowerCase();
            return healthPatterns.some(pattern => nameLower.includes(pattern));
        }) || [];
        
        return {
            applicable: healthFields.length > 0,
            requirements: healthFields.length > 0 ? [
                {
                    requirement: 'PHI encryption',
                    status: 'Requires review'
                }
            ] : []
        };
    }

    /**
     * Check SOX requirements
     */
    checkSOXRequirements() {
        // Check for financial fields
        const financialFields = this.metadata.fields?.details?.filter(f => 
            f.type === 'currency' || f.name.toLowerCase().includes('revenue')
        ) || [];
        
        return {
            applicable: financialFields.length > 0,
            requirements: financialFields.length > 0 ? [
                {
                    requirement: 'Audit trail',
                    status: 'Requires field history tracking'
                }
            ] : []
        };
    }

    /**
     * Get compliance recommendations
     */
    getComplianceRecommendations() {
        const recommendations = [];
        const dataPrivacy = this.analyzeDataPrivacy();
        
        if (dataPrivacy.unencryptedPII > 0) {
            recommendations.push({
                priority: 'Critical',
                category: 'Data Privacy',
                issue: 'Unencrypted PII',
                action: 'Enable platform encryption for PII fields'
            });
        }
        
        return recommendations;
    }

    /**
     * Calculate overall scores
     */
    calculateScores() {
        return {
            overall: this.calculateOverallScore(),
            fieldHealth: this.calculateFieldHealthScore(),
            automation: this.calculateAutomationScore(),
            performance: this.calculatePerformanceScore(),
            security: this.calculateSecurityScore(),
            compliance: this.calculateComplianceScore(),
            bestPractices: this.analysis.bestPracticeAnalysis?.score || 0
        };
    }

    /**
     * Calculate overall health score
     */
    calculateOverallScore() {
        const scores = [
            this.calculateFieldHealthScore(),
            this.calculateAutomationScore(),
            this.calculatePerformanceScore(),
            this.calculateSecurityScore(),
            this.calculateComplianceScore()
        ];
        
        return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    }

    /**
     * Calculate field health score
     */
    calculateFieldHealthScore() {
        let score = 100;
        
        // Deduct for unused fields
        const unusedCount = this.metadata.fieldUsage?.unused || 0;
        score -= Math.min(20, unusedCount * 2);
        
        // Deduct for duplicate fields
        const duplicateCount = this.analysis.duplicateDetection?.duplicates?.length || 0;
        score -= Math.min(20, duplicateCount * 5);
        
        // Deduct for high field count
        const fieldCount = this.metadata.fields?.custom || 0;
        if (fieldCount > 400) score -= 20;
        else if (fieldCount > 300) score -= 10;
        
        return Math.max(0, score);
    }

    /**
     * Calculate automation score
     */
    calculateAutomationScore() {
        let score = 100;
        
        // Deduct for multiple triggers
        if (this.metadata.triggers?.count > 1) {
            score -= 15;
        }
        
        // Deduct for large triggers
        if (this.metadata.triggers?.totalLines > 1000) {
            score -= 20;
        }
        
        // Deduct for too many validation rules
        if (this.metadata.validationRules?.count > 20) {
            score -= 10;
        }
        
        return Math.max(0, score);
    }

    /**
     * Calculate performance score
     */
    calculatePerformanceScore() {
        let score = 100;
        const fieldPerf = this.analysis.performanceAnalysis?.fieldCount;
        
        if (fieldPerf?.impact === 'Critical') score -= 30;
        else if (fieldPerf?.impact === 'High') score -= 20;
        else if (fieldPerf?.impact === 'Medium') score -= 10;
        
        return Math.max(0, score);
    }

    /**
     * Calculate security score
     */
    calculateSecurityScore() {
        let score = 100;
        const unencryptedPII = this.analysis.securityAnalysis?.piiDetection?.filter(f => !f.encrypted).length || 0;
        
        score -= unencryptedPII * 15;
        
        return Math.max(0, score);
    }

    /**
     * Calculate compliance score
     */
    calculateComplianceScore() {
        const dataPrivacy = this.analysis.complianceAnalysis?.dataPrivacy;
        
        if (dataPrivacy?.complianceStatus === 'Compliant') {
            return 100;
        } else if (dataPrivacy?.unencryptedPII > 0) {
            return Math.max(0, 100 - (dataPrivacy.unencryptedPII * 20));
        }
        
        return 80; // Default if no compliance issues detected
    }

    /**
     * Generate analysis summary
     */
    generateAnalysisSummary() {
        return {
            criticalIssues: this.getCriticalIssues(),
            quickWins: this.getQuickWins(),
            topRecommendations: this.getTopRecommendations(),
            estimatedCleanupEffort: this.analysis.technicalDebtAnalysis?.estimatedEffort || { estimatedHours: 0 }
        };
    }

    /**
     * Get critical issues
     */
    getCriticalIssues() {
        const issues = [];
        
        // Security issues
        const unencryptedPII = this.analysis.securityAnalysis?.piiDetection?.filter(f => !f.encrypted) || [];
        if (unencryptedPII.length > 0) {
            issues.push({
                category: 'Security',
                issue: `${unencryptedPII.length} unencrypted PII fields`,
                priority: 'Critical'
            });
        }
        
        // Performance issues
        if (this.metadata.fields?.custom > 400) {
            issues.push({
                category: 'Performance',
                issue: 'Approaching field limit',
                priority: 'Critical'
            });
        }
        
        return issues;
    }

    /**
     * Get quick wins
     */
    getQuickWins() {
        const quickWins = [];
        
        // Unused fields
        const unusedCount = this.metadata.fieldUsage?.unused || 0;
        if (unusedCount > 0) {
            quickWins.push({
                action: `Remove ${unusedCount} unused fields`,
                effort: '1-2 hours',
                impact: 'High'
            });
        }
        
        // Inactive validation rules
        const inactiveRules = this.metadata.validationRules?.details?.filter(r => !r.Active).length || 0;
        if (inactiveRules > 3) {
            quickWins.push({
                action: `Remove ${inactiveRules} inactive validation rules`,
                effort: '30 minutes',
                impact: 'Medium'
            });
        }
        
        return quickWins;
    }

    /**
     * Get top recommendations
     */
    getTopRecommendations() {
        const allRecommendations = [];
        
        // Collect all recommendations
        Object.values(this.analysis).forEach(analysisSection => {
            if (analysisSection && analysisSection.recommendations) {
                allRecommendations.push(...analysisSection.recommendations);
            }
        });
        
        // Sort by priority and return top 5
        return allRecommendations
            .sort((a, b) => {
                const priorityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
                return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
            })
            .slice(0, 5);
    }
}

// Export for use in other modules
module.exports = ObjectAnalysisEngine;

// CLI interface if run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node object-analysis-engine.js <metadata.json>');
        process.exit(1);
    }
    
    const fs = require('fs');
    const metadataFile = args[0];
    
    try {
        const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
        const engine = new ObjectAnalysisEngine(metadata);
        
        engine.runFullAnalysis().then(results => {
            console.log(JSON.stringify(results, null, 2));
        });
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}