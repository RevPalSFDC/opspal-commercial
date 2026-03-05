#!/usr/bin/env node

/**
 * Salesforce Flow Best Practices Validator
 *
 * Analyzes Flow metadata XML to detect anti-patterns and best practice violations.
 *
 * Anti-Patterns Detected:
 * 1. DML operations inside loops (CRITICAL)
 * 2. SOQL queries inside loops (CRITICAL)
 * 3. Unnecessary Get Records (MEDIUM)
 * 4. Hard-coded IDs (HIGH)
 * 5. Missing fault paths (MEDIUM)
 * 6. Non-bulkified patterns (HIGH)
 * 7. Subflow opportunities (LOW)
 *
 * Output:
 * - Compliance score (0-100)
 * - List of violations
 * - Recommendations
 * - Risk assessment
 *
 * @see docs/FLOW_DESIGN_BEST_PRACTICES.md
 */

const fs = require('fs').promises;
const xml2js = require('xml2js');
const path = require('path');

class FlowBestPracticesValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.flowPath = options.flowPath;
        this.flowXml = null;
        this.flowData = null;
        this.violations = [];
        this.complianceScore = 100;
    }

    /**
     * Log message if verbose mode enabled
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowValidator] ${message}`);
        }
    }

    /**
     * Load and parse Flow XML
     */
    async loadFlow() {
        this.log(`Loading Flow from: ${this.flowPath}`);

        const xmlContent = await fs.readFile(this.flowPath, 'utf8');
        this.flowXml = xmlContent;

        const parser = new xml2js.Parser({ explicitArray: false });
        this.flowData = await parser.parseStringPromise(xmlContent);

        this.log('Flow loaded and parsed successfully');
    }

    /**
     * Run all validation checks
     */
    async validate() {
        await this.loadFlow();

        this.log('Running validation checks...');

        // Extract Flow elements
        const flow = this.flowData.Flow || {};

        // Run checks
        this.checkDMLInLoops(flow);
        this.checkSOQLInLoops(flow);
        this.checkUnnecessaryGetRecords(flow);
        this.checkHardCodedIds(flow);
        this.checkMissingFaultPaths(flow);
        this.checkBulkification(flow);
        this.checkSubflowOpportunities(flow);

        // Calculate final score
        this.calculateScore();

        this.log(`Validation complete. Compliance score: ${this.complianceScore}`);

        return {
            passed: this.violations.length === 0,
            complianceScore: this.complianceScore,
            violations: this.violations,
            recommendations: this.generateRecommendations()
        };
    }

    /**
     * Check for DML operations inside loops (CRITICAL)
     */
    checkDMLInLoops(flow) {
        this.log('Checking for DML in loops...');

        const loops = this.extractElementArray(flow.loops);
        const dmlElements = [
            ...this.extractElementArray(flow.recordCreates),
            ...this.extractElementArray(flow.recordUpdates),
            ...this.extractElementArray(flow.recordDeletes)
        ];

        loops.forEach(loop => {
            const loopName = loop.name;
            const loopConnector = loop.nextValueConnector?.targetReference;

            // Check if DML elements are reachable from loop
            dmlElements.forEach(dml => {
                if (this.isElementInPath(loopConnector, dml.name, flow)) {
                    this.addViolation({
                        severity: 'CRITICAL',
                        category: 'Performance',
                        issue: 'DML operation inside loop',
                        element: dml.name,
                        loop: loopName,
                        description: `Element "${dml.name}" performs DML inside loop "${loopName}". This will hit governor limits with >150 iterations.`,
                        recommendation: 'Move DML outside loop. Use Assignment to add records to collection, then perform bulk DML after loop.',
                        scoreImpact: -20
                    });
                }
            });
        });
    }

    /**
     * Check for SOQL queries inside loops (CRITICAL)
     */
    checkSOQLInLoops(flow) {
        this.log('Checking for SOQL in loops...');

        const loops = this.extractElementArray(flow.loops);
        const queries = this.extractElementArray(flow.recordLookups);

        loops.forEach(loop => {
            const loopName = loop.name;
            const loopConnector = loop.nextValueConnector?.targetReference;

            queries.forEach(query => {
                if (this.isElementInPath(loopConnector, query.name, flow)) {
                    this.addViolation({
                        severity: 'CRITICAL',
                        category: 'Performance',
                        issue: 'SOQL query inside loop',
                        element: query.name,
                        loop: loopName,
                        description: `Element "${query.name}" performs SOQL inside loop "${loopName}". This will hit governor limits with >100 iterations.`,
                        recommendation: 'Query all needed records BEFORE the loop with appropriate filters. Store in collection and reference in loop.',
                        scoreImpact: -20
                    });
                }
            });
        });
    }

    /**
     * Check for unnecessary Get Records (MEDIUM)
     */
    checkUnnecessaryGetRecords(flow) {
        this.log('Checking for unnecessary Get Records...');

        const queries = this.extractElementArray(flow.recordLookups);

        // Check if flow is record-triggered
        const triggerType = flow.processMetadataValues?.find(p => p.name === 'triggerType')?.value?.stringValue;
        const isRecordTriggered = triggerType && triggerType.includes('Record');

        if (isRecordTriggered) {
            queries.forEach(query => {
                // Check if query is for the same object as trigger
                const queryObject = query.object;
                const filters = this.extractElementArray(query.filters);

                // Check if querying by Id = $Record.Id (unnecessary - you already have $Record)
                const hasRecordIdFilter = filters.some(f =>
                    f.field === 'Id' &&
                    f.value?.elementReference === '$Record.Id'
                );

                if (hasRecordIdFilter) {
                    this.addViolation({
                        severity: 'MEDIUM',
                        category: 'Efficiency',
                        issue: 'Unnecessary Get Records',
                        element: query.name,
                        description: `Query "${query.name}" fetches the triggering record by Id. The record is already available via $Record.`,
                        recommendation: 'Remove this Get Records element and use $Record directly.',
                        scoreImpact: -10
                    });
                }
            });
        }
    }

    /**
     * Check for hard-coded Salesforce IDs (HIGH)
     */
    checkHardCodedIds(flow) {
        this.log('Checking for hard-coded IDs...');

        // Regex for 15 or 18 character Salesforce IDs
        const idPattern = /[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?/g;

        const xmlString = JSON.stringify(this.flowData);
        const matches = xmlString.match(idPattern) || [];

        // Filter out false positives (e.g., field names, common strings)
        const likelyIds = matches.filter(id => {
            // Salesforce IDs typically start with 3-character object prefix
            return /^[a-zA-Z0-9]{3}[a-zA-Z0-9]{12,15}$/.test(id);
        });

        if (likelyIds.length > 0) {
            this.addViolation({
                severity: 'HIGH',
                category: 'Portability',
                issue: 'Hard-coded Salesforce IDs',
                description: `Found ${likelyIds.length} potential hard-coded ID(s): ${likelyIds.slice(0, 3).join(', ')}${likelyIds.length > 3 ? '...' : ''}`,
                recommendation: 'Use Custom Metadata, Custom Settings, or query records by name/external ID instead of hard-coding IDs.',
                scoreImpact: -15
            });
        }
    }

    /**
     * Check for missing fault paths (MEDIUM)
     */
    checkMissingFaultPaths(flow) {
        this.log('Checking for missing fault paths...');

        const dmlElements = [
            ...this.extractElementArray(flow.recordCreates),
            ...this.extractElementArray(flow.recordUpdates),
            ...this.extractElementArray(flow.recordDeletes),
            ...this.extractElementArray(flow.recordLookups)
        ];

        dmlElements.forEach(element => {
            if (!element.faultConnector) {
                this.addViolation({
                    severity: 'MEDIUM',
                    category: 'Reliability',
                    issue: 'Missing fault path',
                    element: element.name,
                    description: `Element "${element.name}" does not have a fault path configured.`,
                    recommendation: 'Add a fault path to handle errors gracefully (e.g., log error, display message, rollback).',
                    scoreImpact: -5
                });
            }
        });
    }

    /**
     * Check for bulkification issues (HIGH)
     */
    checkBulkification(flow) {
        this.log('Checking bulkification patterns...');

        const updates = this.extractElementArray(flow.recordUpdates);
        const creates = this.extractElementArray(flow.recordCreates);

        // Check if DML uses inputReference (collection) vs inputAssignments (single record)
        [...updates, ...creates].forEach(element => {
            const hasInputReference = !!element.inputReference;
            const hasInputAssignments = !!element.inputAssignments;

            if (hasInputAssignments && !hasInputReference) {
                // Potential singleton DML (not necessarily wrong, but worth flagging)
                this.addViolation({
                    severity: 'LOW',
                    category: 'Scalability',
                    issue: 'Potential non-bulk DML',
                    element: element.name,
                    description: `Element "${element.name}" uses field assignments instead of collection reference. Verify this handles bulk operations.`,
                    recommendation: 'If processing multiple records, use collection variable with inputReference for better performance.',
                    scoreImpact: -3
                });
            }
        });
    }

    /**
     * Check for subflow opportunities (LOW)
     */
    checkSubflowOpportunities(flow) {
        this.log('Checking for subflow opportunities...');

        // This is a simple check - look for repeated element patterns
        const allElements = [
            ...this.extractElementArray(flow.assignments),
            ...this.extractElementArray(flow.decisions),
            ...this.extractElementArray(flow.recordLookups)
        ];

        // Group elements by type and check for similar names
        const elementsByType = {};
        allElements.forEach(el => {
            const type = el.$?.['xsi:type'] || 'unknown';
            if (!elementsByType[type]) {
                elementsByType[type] = [];
            }
            elementsByType[type].push(el.name);
        });

        // If there are many similar elements, suggest subflow
        Object.entries(elementsByType).forEach(([type, names]) => {
            if (names.length > 10) {
                this.addViolation({
                    severity: 'LOW',
                    category: 'Maintainability',
                    issue: 'Consider subflow extraction',
                    description: `Flow has ${names.length} ${type} elements. Consider extracting repeated logic into subflow(s).`,
                    recommendation: 'Group related logic into reusable subflows for better maintainability.',
                    scoreImpact: -2
                });
            }
        });
    }

    /**
     * Helper: Add violation to list
     */
    addViolation(violation) {
        this.violations.push(violation);
        this.complianceScore += violation.scoreImpact;
    }

    /**
     * Helper: Extract element array (handle single element or array)
     */
    extractElementArray(element) {
        if (!element) return [];
        return Array.isArray(element) ? element : [element];
    }

    /**
     * Helper: Check if element is in execution path
     * (Simplified - actual implementation would need full graph traversal)
     */
    isElementInPath(startElement, targetElement, flow) {
        // Simplified check - just check if target is directly referenced
        // Full implementation would traverse entire flow graph
        return startElement === targetElement;
    }

    /**
     * Calculate final compliance score
     */
    calculateScore() {
        // Ensure score doesn't go below 0
        this.complianceScore = Math.max(0, this.complianceScore);
    }

    /**
     * Generate recommendations based on violations
     */
    generateRecommendations() {
        const recommendations = [];

        // Group by severity
        const critical = this.violations.filter(v => v.severity === 'CRITICAL');
        const high = this.violations.filter(v => v.severity === 'HIGH');
        const medium = this.violations.filter(v => v.severity === 'MEDIUM');

        if (critical.length > 0) {
            recommendations.push({
                priority: 'CRITICAL',
                message: `Fix ${critical.length} critical issue(s) immediately. These will cause governor limit failures in production.`,
                actions: critical.map(v => v.recommendation)
            });
        }

        if (high.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                message: `Address ${high.length} high-priority issue(s) before deployment.`,
                actions: high.map(v => v.recommendation)
            });
        }

        if (medium.length > 0) {
            recommendations.push({
                priority: 'MEDIUM',
                message: `Consider fixing ${medium.length} medium-priority issue(s) for better reliability.`,
                actions: medium.map(v => v.recommendation)
            });
        }

        if (this.complianceScore >= 90) {
            recommendations.push({
                priority: 'INFO',
                message: 'Flow follows best practices. Ready for deployment.'
            });
        } else if (this.complianceScore >= 70) {
            recommendations.push({
                priority: 'WARNING',
                message: 'Flow has some issues but is acceptable for deployment. Address violations when possible.'
            });
        } else {
            recommendations.push({
                priority: 'ERROR',
                message: 'Flow has significant issues. Recommend refactoring before production deployment.'
            });
        }

        return recommendations;
    }
}

// ========================================
// CLI Interface
// ========================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Salesforce Flow Best Practices Validator

Usage:
  node flow-best-practices-validator.js <flow-path> [options]

Options:
  --verbose              Verbose output
  --json                 Output as JSON

Examples:
  # Validate a Flow
  node flow-best-practices-validator.js ./flows/Account_Record_Trigger.flow-meta.xml

  # Validate with verbose output
  node flow-best-practices-validator.js ./flows/My_Flow.flow-meta.xml --verbose

  # Output as JSON
  node flow-best-practices-validator.js ./flows/My_Flow.flow-meta.xml --json
        `);
        process.exit(0);
    }

    async function runCLI() {
        const flowPath = args[0];
        const verbose = args.includes('--verbose');
        const jsonOutput = args.includes('--json');

        const validator = new FlowBestPracticesValidator({ flowPath, verbose });

        try {
            const result = await validator.validate();

            if (jsonOutput) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                // Human-readable output
                console.log('\n===========================================');
                console.log('Flow Best Practices Validation Report');
                console.log('===========================================\n');

                console.log(`Compliance Score: ${result.complianceScore}/100\n`);

                if (result.violations.length === 0) {
                    console.log('✅ No violations found. Flow follows best practices!\n');
                } else {
                    console.log(`⚠️  Found ${result.violations.length} violation(s):\n`);

                    result.violations.forEach((v, idx) => {
                        console.log(`${idx + 1}. [${v.severity}] ${v.issue}`);
                        console.log(`   Element: ${v.element || 'N/A'}`);
                        console.log(`   ${v.description}`);
                        console.log(`   💡 ${v.recommendation}\n`);
                    });
                }

                console.log('Recommendations:');
                result.recommendations.forEach(rec => {
                    console.log(`\n[${rec.priority}] ${rec.message}`);
                    if (rec.actions) {
                        rec.actions.forEach((action, idx) => {
                            console.log(`  ${idx + 1}. ${action}`);
                        });
                    }
                });

                console.log('\n===========================================\n');
            }

            process.exit(result.complianceScore >= 70 ? 0 : 1);

        } catch (error) {
            console.error(`Error: ${error.message}`);
            if (verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    }

    runCLI();
}

module.exports = FlowBestPracticesValidator;
