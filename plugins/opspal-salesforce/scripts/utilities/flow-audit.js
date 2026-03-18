#!/usr/bin/env node

/**
 * Flow Audit Utility
 * Analyzes Salesforce flows to identify consolidation opportunities
 * and calculate complexity scores for flow vs Apex decisions
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class FlowAuditor {
    constructor(options = {}) {
        this.org = options.org || process.env.SF_TARGET_ORG || 'production';
        this.outputFormat = options.outputFormat || 'json';
        this.verbose = options.verbose || false;
    }

    /**
     * Query all flows in the org
     */
    async queryFlows(objectFilter = null) {
        try {
            let query = `SELECT Id, Label, ProcessType, TriggerType, Status, VersionNumber, 
                        LastModifiedDate, LastModifiedBy.Name, Description,
                        (SELECT Id FROM FlowVersions) 
                        FROM FlowDefinitionView`;
            
            if (objectFilter) {
                query += ` WHERE ObjectType = '${objectFilter}'`;
            }
            
            query += ' ORDER BY ObjectType, TriggerType, Label';
            
            const command = `sf data query -q "${query}" -o ${this.org} --json`;
            const { stdout } = await execAsync(command);
            const result = JSON.parse(stdout);
            
            if (result.status === 0) {
                return result.result.records;
            } else {
                throw new Error(`Query failed: ${result.message}`);
            }
        } catch (error) {
            console.error('Error querying flows:', error.message);
            return [];
        }
    }

    /**
     * Analyze flow complexity with enhanced scoring factors
     */
    calculateComplexity(flowMetadata) {
        const complexity = {
            score: 0,
            factors: {},
            details: [],
            warnings: []
        };

        // Decision branches (Weight: 1 per decision)
        if (flowMetadata.decisions) {
            const decisionCount = Array.isArray(flowMetadata.decisions) 
                ? flowMetadata.decisions.length 
                : 1;
            complexity.factors.decisions = decisionCount;
            complexity.score += decisionCount;
            complexity.details.push(`${decisionCount} decision branches`);
            
            // Check for nested decisions (increases complexity)
            if (decisionCount > 3) {
                complexity.score += 2;
                complexity.warnings.push('Multiple decision branches detected - consider simplifying logic');
            }
        }

        // Loops (Weight: 3 per loop - high complexity)
        if (flowMetadata.loops) {
            const loopCount = Array.isArray(flowMetadata.loops) 
                ? flowMetadata.loops.length 
                : 1;
            complexity.factors.loops = loopCount;
            complexity.score += loopCount * 3;
            complexity.details.push(`${loopCount} loops (high complexity)`);
            
            // Nested loops are extremely complex
            if (loopCount > 1) {
                complexity.score += 3;
                complexity.warnings.push('Multiple loops detected - high risk of governor limit issues');
            }
        }

        // Record queries (Weight: 1 per query)
        if (flowMetadata.recordLookups) {
            const queryCount = Array.isArray(flowMetadata.recordLookups) 
                ? flowMetadata.recordLookups.length 
                : 1;
            complexity.factors.queries = queryCount;
            complexity.score += queryCount;
            complexity.details.push(`${queryCount} record queries`);
            
            // Queries in loops are dangerous
            if (flowMetadata.loops && queryCount > 2) {
                complexity.score += 3;
                complexity.warnings.push('Multiple queries with loops - risk of SOQL limits');
            }
        }

        // DML operations (Weight: 1 per operation)
        if (flowMetadata.recordUpdates || flowMetadata.recordCreates || flowMetadata.recordDeletes) {
            const updateCount = (flowMetadata.recordUpdates?.length || 0) + 
                              (flowMetadata.recordCreates?.length || 0) +
                              (flowMetadata.recordDeletes?.length || 0);
            complexity.factors.dmlOperations = updateCount;
            complexity.score += updateCount;
            complexity.details.push(`${updateCount} DML operations`);
            
            // DML in loops is very dangerous
            if (flowMetadata.loops && updateCount > 0) {
                complexity.score += 4;
                complexity.warnings.push('DML operations in loops - HIGH RISK of governor limits');
            }
        }

        // External calls and Apex actions (Weight: 3 per call)
        if (flowMetadata.actionCalls) {
            const calloutCount = flowMetadata.actionCalls.filter(
                a => a.actionType === 'apex' || a.actionType === 'externalService'
            ).length;
            if (calloutCount > 0) {
                complexity.factors.externalCalls = calloutCount;
                complexity.score += calloutCount * 3;
                complexity.details.push(`${calloutCount} external calls`);
            }
        }

        // Subflows (Weight: 2 per subflow)
        if (flowMetadata.subflows) {
            const subflowCount = Array.isArray(flowMetadata.subflows) 
                ? flowMetadata.subflows.length 
                : 1;
            complexity.factors.subflows = subflowCount;
            complexity.score += subflowCount * 2;
            complexity.details.push(`${subflowCount} subflows`);
        }

        // Screens (Weight: 1 per screen - adds user interaction complexity)
        if (flowMetadata.screens) {
            const screenCount = Array.isArray(flowMetadata.screens) 
                ? flowMetadata.screens.length 
                : 1;
            complexity.factors.screens = screenCount;
            complexity.score += screenCount;
            complexity.details.push(`${screenCount} screens`);
        }

        // Assignments (Weight: 0.5 per assignment)
        if (flowMetadata.assignments) {
            const assignmentCount = Array.isArray(flowMetadata.assignments) 
                ? flowMetadata.assignments.length 
                : 1;
            complexity.factors.assignments = assignmentCount;
            complexity.score += Math.ceil(assignmentCount * 0.5);
            complexity.details.push(`${assignmentCount} assignments`);
        }

        // Formulas (Weight: 1 per complex formula)
        if (flowMetadata.formulas) {
            const formulaCount = Array.isArray(flowMetadata.formulas) 
                ? flowMetadata.formulas.length 
                : 1;
            complexity.factors.formulas = formulaCount;
            complexity.score += formulaCount;
            complexity.details.push(`${formulaCount} formulas`);
        }

        // Wait elements (Weight: 2 per wait - adds time complexity)
        if (flowMetadata.waits) {
            const waitCount = Array.isArray(flowMetadata.waits) 
                ? flowMetadata.waits.length 
                : 1;
            complexity.factors.waits = waitCount;
            complexity.score += waitCount * 2;
            complexity.details.push(`${waitCount} wait elements`);
        }

        // Collection processing (Weight: 2 - adds memory complexity)
        if (flowMetadata.collectionProcessors) {
            const collectionCount = Array.isArray(flowMetadata.collectionProcessors) 
                ? flowMetadata.collectionProcessors.length 
                : 1;
            complexity.factors.collections = collectionCount;
            complexity.score += collectionCount * 2;
            complexity.details.push(`${collectionCount} collection processors`);
        }

        // Platform events (Weight: 3 - async complexity)
        if (flowMetadata.recordChanges && flowMetadata.recordChanges.some(rc => rc.triggerType === 'PlatformEvent')) {
            complexity.score += 3;
            complexity.details.push('Platform event trigger');
        }

        // Calculate final recommendation with detailed thresholds
        if (complexity.score >= 15) {
            complexity.recommendation = 'apex-urgent';
            complexity.rationale = `Complexity score ${complexity.score} is very high. Strongly recommend converting to Apex immediately for maintainability and performance.`;
        } else if (complexity.score >= 10) {
            complexity.recommendation = 'apex-recommended';
            complexity.rationale = `Complexity score ${complexity.score} exceeds best practice threshold. Consider converting to Apex for better control and debugging.`;
        } else if (complexity.score >= 7) {
            complexity.recommendation = 'apex-consider';
            complexity.rationale = `Complexity score ${complexity.score} is moderately high. Monitor performance and consider Apex if issues arise.`;
        } else {
            complexity.recommendation = 'flow';
            complexity.rationale = `Complexity score ${complexity.score} is manageable in a flow.`;
        }

        // Add performance impact estimate
        if (complexity.score >= 10) {
            complexity.performanceImpact = 'High - May experience slow performance with large data volumes';
        } else if (complexity.score >= 7) {
            complexity.performanceImpact = 'Medium - Should handle normal data volumes';
        } else {
            complexity.performanceImpact = 'Low - Good performance expected';
        }

        return complexity;
    }

    /**
     * Group flows by object and identify consolidation opportunities
     */
    analyzeConsolidationOpportunities(flows) {
        const analysis = {
            byObject: {},
            consolidationOpportunities: [],
            statistics: {
                totalFlows: flows.length,
                activeFlows: flows.filter(f => f.Status === 'Active').length,
                objectsWithMultipleFlows: 0,
                potentialReduction: 0
            }
        };

        // Group flows by object and trigger type
        flows.forEach(flow => {
            const object = flow.ObjectType || 'Unknown';
            const trigger = flow.TriggerType || 'Manual';
            
            if (!analysis.byObject[object]) {
                analysis.byObject[object] = {
                    total: 0,
                    byTriggerType: {}
                };
            }
            
            analysis.byObject[object].total++;
            
            if (!analysis.byObject[object].byTriggerType[trigger]) {
                analysis.byObject[object].byTriggerType[trigger] = [];
            }
            
            analysis.byObject[object].byTriggerType[trigger].push({
                id: flow.Id,
                label: flow.Label,
                status: flow.Status,
                lastModified: flow.LastModifiedDate
            });
        });

        // Identify consolidation opportunities
        Object.entries(analysis.byObject).forEach(([object, data]) => {
            Object.entries(data.byTriggerType).forEach(([trigger, flowList]) => {
                if (flowList.length > 1) {
                    const opportunity = {
                        object,
                        triggerType: trigger,
                        currentCount: flowList.length,
                        targetCount: 1,
                        reduction: flowList.length - 1,
                        flows: flowList.map(f => f.label),
                        recommendation: `Consolidate ${flowList.length} flows into ${object}_${trigger.replace(/\s+/g, '')}_Master`,
                        estimatedEffort: `${flowList.length * 2} hours`,
                        priority: flowList.filter(f => f.status === 'Active').length > 2 ? 'High' : 'Medium'
                    };
                    
                    analysis.consolidationOpportunities.push(opportunity);
                    analysis.statistics.potentialReduction += opportunity.reduction;
                }
            });
            
            if (data.total > 1) {
                analysis.statistics.objectsWithMultipleFlows++;
            }
        });

        // Sort opportunities by potential impact
        analysis.consolidationOpportunities.sort((a, b) => b.reduction - a.reduction);

        return analysis;
    }

    /**
     * Generate consolidation report
     */
    generateReport(analysis, format = 'console') {
        if (format === 'console') {
            console.log('\n========================================');
            console.log('         FLOW AUDIT REPORT');
            console.log('========================================\n');
            
            console.log('STATISTICS:');
            console.log(`  Total Flows: ${analysis.statistics.totalFlows}`);
            console.log(`  Active Flows: ${analysis.statistics.activeFlows}`);
            console.log(`  Objects with Multiple Flows: ${analysis.statistics.objectsWithMultipleFlows}`);
            console.log(`  Potential Flow Reduction: ${analysis.statistics.potentialReduction}`);
            
            if (analysis.consolidationOpportunities.length > 0) {
                console.log('\nCONSOLIDATION OPPORTUNITIES:');
                console.log('--------------------------------------------');
                
                analysis.consolidationOpportunities.forEach((opp, index) => {
                    console.log(`\n${index + 1}. ${opp.object} - ${opp.triggerType}`);
                    console.log(`   Current: ${opp.currentCount} flows`);
                    console.log(`   Target: ${opp.targetCount} flow`);
                    console.log(`   Reduction: ${opp.reduction} flows`);
                    console.log(`   Priority: ${opp.priority}`);
                    console.log(`   Effort: ${opp.estimatedEffort}`);
                    console.log(`   Recommendation: ${opp.recommendation}`);
                    console.log(`   Flows to consolidate:`);
                    opp.flows.forEach(f => console.log(`     - ${f}`));
                });
                
                console.log('\n--------------------------------------------');
                console.log('SUMMARY:');
                console.log(`Total consolidation opportunities: ${analysis.consolidationOpportunities.length}`);
                console.log(`Potential flow reduction: ${analysis.statistics.potentialReduction} flows`);
                
                const percentReduction = Math.round(
                    (analysis.statistics.potentialReduction / analysis.statistics.totalFlows) * 100
                );
                console.log(`Efficiency improvement: ${percentReduction}% reduction possible`);
            } else {
                console.log('\n✅ No consolidation opportunities found!');
                console.log('Your flows are already well-organized.');
            }
            
            console.log('\n========================================\n');
        } else if (format === 'csv') {
            return this.generateCSV(analysis);
        } else if (format === 'json') {
            return JSON.stringify(analysis, null, 2);
        }
    }

    /**
     * Generate CSV output
     */
    generateCSV(analysis) {
        const rows = [
            ['Object', 'Trigger Type', 'Current Count', 'Target Count', 'Reduction', 'Priority', 'Effort', 'Recommendation']
        ];
        
        analysis.consolidationOpportunities.forEach(opp => {
            rows.push([
                opp.object,
                opp.triggerType,
                opp.currentCount,
                opp.targetCount,
                opp.reduction,
                opp.priority,
                opp.estimatedEffort,
                opp.recommendation
            ]);
        });
        
        return rows.map(row => row.join(',')).join('\n');
    }

    /**
     * Main audit execution
     */
    async runAudit(options = {}) {
        console.log(`Running flow audit for org: ${this.org}...`);
        
        // Query flows
        const flows = await this.queryFlows(options.object);
        
        if (flows.length === 0) {
            console.log('No flows found.');
            return;
        }
        
        // Analyze consolidation opportunities
        const analysis = this.analyzeConsolidationOpportunities(flows);
        
        // Generate report
        const report = this.generateReport(analysis, options.output || 'console');
        
        // Save to file if requested
        if (options.outputFile) {
            await fs.writeFile(options.outputFile, 
                typeof report === 'string' ? report : JSON.stringify(report, null, 2)
            );
            console.log(`Report saved to: ${options.outputFile}`);
        }
        
        return analysis;
    }

    /**
     * Check complexity of a specific flow
     */
    async checkFlowComplexity(flowName) {
        try {
            // Retrieve flow metadata
            const command = `sf project retrieve start -m Flow:${flowName} -o ${this.org} --json`;
            const { stdout } = await execAsync(command);
            const result = JSON.parse(stdout);
            
            if (result.status === 0) {
                // Parse the retrieved flow file
                const flowPath = path.join('force-app', 'main', 'default', 'flows', `${flowName}.flow-meta.xml`);
                const flowContent = await fs.readFile(flowPath, 'utf8');
                
                // Simple XML parsing (in production, use proper XML parser)
                const flowMetadata = this.parseFlowXML(flowContent);
                
                // Calculate complexity
                const complexity = this.calculateComplexity(flowMetadata);
                
                console.log(`\n${'='.repeat(60)}`);
                console.log(`Complexity Analysis for ${flowName}`);
                console.log('='.repeat(60));
                
                // Color code the score based on severity
                const scoreColor = complexity.score >= 15 ? '\x1b[31m' : // Red
                                 complexity.score >= 10 ? '\x1b[33m' : // Yellow
                                 complexity.score >= 7 ? '\x1b[36m' :  // Cyan
                                 '\x1b[32m'; // Green
                
                console.log(`\n  Score: ${scoreColor}${complexity.score}\x1b[0m`);
                console.log(`  Recommendation: ${complexity.recommendation.toUpperCase()}`);
                console.log(`  Rationale: ${complexity.rationale}`);
                console.log(`  Performance Impact: ${complexity.performanceImpact}`);
                
                if (complexity.details.length > 0) {
                    console.log(`\n  Complexity Factors:`);
                    complexity.details.forEach(d => console.log(`    ✓ ${d}`));
                }
                
                if (complexity.warnings && complexity.warnings.length > 0) {
                    console.log(`\n  ⚠️  Warnings:`);
                    complexity.warnings.forEach(w => console.log(`    • ${w}`));
                }
                
                // Provide actionable recommendations
                if (complexity.score >= 10) {
                    console.log(`\n  📋 Recommended Actions:`);
                    console.log(`    1. Review flow for optimization opportunities`);
                    console.log(`    2. Consider breaking into smaller flows or subflows`);
                    console.log(`    3. Evaluate converting to Apex for better control`);
                    console.log(`    4. Test thoroughly with large data volumes`);
                }
                
                console.log('\n' + '='.repeat(60));
                
                return complexity;
            }
        } catch (error) {
            console.error(`Error checking flow complexity: ${error.message}`);
        }
    }

    /**
     * Enhanced XML parser for flow metadata with all complexity factors
     */
    parseFlowXML(xmlContent) {
        const metadata = {
            // Core flow elements
            decisions: (xmlContent.match(/<decisions>/g) || []).length,
            loops: (xmlContent.match(/<loops>/g) || []).length,
            recordLookups: (xmlContent.match(/<recordLookups>/g) || []).length,
            recordUpdates: (xmlContent.match(/<recordUpdates>/g) || []).length,
            recordCreates: (xmlContent.match(/<recordCreates>/g) || []).length,
            recordDeletes: (xmlContent.match(/<recordDeletes>/g) || []).length,
            actionCalls: (xmlContent.match(/<actionCalls>/g) || []).length,
            
            // Additional complexity factors
            subflows: (xmlContent.match(/<subflows>/g) || []).length,
            screens: (xmlContent.match(/<screens>/g) || []).length,
            assignments: (xmlContent.match(/<assignments>/g) || []).length,
            formulas: (xmlContent.match(/<formulas>/g) || []).length,
            waits: (xmlContent.match(/<waits>/g) || []).length,
            collectionProcessors: (xmlContent.match(/<collectionProcessors>/g) || []).length,
            
            // Platform event triggers
            recordChanges: []
        };
        
        // Check for platform event triggers
        if (xmlContent.includes('<triggerType>PlatformEvent</triggerType>')) {
            metadata.recordChanges.push({ triggerType: 'PlatformEvent' });
        }
        
        return metadata;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--org':
            case '-o':
                options.org = args[++i];
                break;
            case '--object':
                options.object = args[++i];
                break;
            case '--analyze':
            case '-a':
                options.analyze = true;
                break;
            case '--complexity':
            case '-c':
                options.complexity = args[++i];
                break;
            case '--output':
                options.output = args[++i];
                break;
            case '--output-file':
            case '-f':
                options.outputFile = args[++i];
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Flow Audit Utility

Usage: flow-audit.js [options]

Options:
  --org, -o <alias>        Salesforce org alias (default: SF_TARGET_ORG or 'production')
  --object <name>          Filter flows by object
  --analyze, -a            Run consolidation analysis
  --complexity, -c <flow>  Check complexity of specific flow
  --output <format>        Output format: console, csv, json (default: console)
  --output-file, -f <file> Save report to file
  --verbose, -v            Verbose output
  --help, -h               Show help

Examples:
  # Run basic audit
  node flow-audit.js --org myorg

  # Analyze specific object
  node flow-audit.js --object Account --analyze

  # Check flow complexity
  node flow-audit.js --complexity Account_AfterSave_Master

  # Generate CSV report
  node flow-audit.js --analyze --output csv --output-file report.csv
                `);
                process.exit(0);
        }
    }
    
    // Create auditor instance
    const auditor = new FlowAuditor(options);
    
    // Run appropriate command
    if (options.complexity) {
        auditor.checkFlowComplexity(options.complexity);
    } else {
        auditor.runAudit(options);
    }
}

module.exports = FlowAuditor;