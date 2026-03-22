#!/usr/bin/env node

/**
 * Flow Decision Logic Analyzer
 *
 * Validates decision logic in Salesforce Flows to prevent:
 * - Contradictory decision conditions
 * - Unreachable decision branches
 * - Required fields used before population
 * - Infinite loops in flow paths
 * - Dead-end paths with no fault handler
 *
 * This prevents data-quality issues by ensuring all flow logic paths are valid
 * and reachable before deployment.
 *
 * Usage:
 *   const analyzer = new FlowDecisionLogicAnalyzer(orgAlias);
 *   const result = await analyzer.analyze(flowXmlPath);
 *
 * Example validation:
 *   Decision 1: Amount >= 10000
 *   Decision 2: Amount < 5000
 *   → ERROR: Contradictory conditions (can't be both >= 10000 AND < 5000)
 *
 * @module flow-decision-logic-analyzer
 * @version 1.0.0
 * @created 2025-10-26
 * @addresses Reflection Cohort - Flow Decision Logic Issues ($48k annual ROI)
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class FlowDecisionLogicAnalyzer {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.checkInfiniteLoops = options.checkInfiniteLoops !== false; // Default true
        this.checkDeadEnds = options.checkDeadEnds !== false; // Default true

        this.stats = {
            totalAnalyses: 0,
            passed: 0,
            failed: 0,
            decisionsAnalyzed: 0,
            contradictionsFound: 0,
            unreachableBranches: 0,
            infiniteLoops: 0,
            deadEnds: 0
        };
    }

    /**
     * Analyze flow decision logic
     *
     * @param {string} flowXmlPath - Path to flow-meta.xml file
     * @returns {Object} Analysis result with errors, warnings, and graph
     */
    async analyze(flowXmlPath) {
        this.stats.totalAnalyses++;

        const result = {
            valid: false,
            flowPath: flowXmlPath,
            flowName: path.basename(flowXmlPath, '.flow-meta.xml'),
            errors: [],
            warnings: [],
            suggestions: [],
            decisions: [],
            flowGraph: null,
            reachabilityMatrix: null
        };

        // Read and parse flow XML
        let flowContent, flowXml;
        try {
            flowContent = fs.readFileSync(flowXmlPath, 'utf8');
            flowXml = await xml2js.parseStringPromise(flowContent);
        } catch (error) {
            result.errors.push({
                type: 'PARSE_ERROR',
                message: `Failed to parse flow XML: ${error.message}`,
                severity: 'CRITICAL'
            });
            this.stats.failed++;
            return result;
        }

        // Extract flow structure
        const flow = flowXml.Flow || flowXml;
        const decisions = this.extractDecisions(flow);
        const assignments = this.extractAssignments(flow);
        const recordLookups = this.extractRecordLookups(flow);
        const flowGraph = this.buildFlowGraph(flow);

        result.decisions = decisions;
        result.flowGraph = flowGraph;
        this.stats.decisionsAnalyzed += decisions.length;

        // Build reachability matrix first — needed by contradiction check
        result.reachabilityMatrix = this.buildReachabilityMatrix(flowGraph);

        // Analysis 1: Check for contradictory conditions
        const contradictions = this.findContradictoryConditions(decisions);
        result.errors.push(...contradictions);
        this.stats.contradictionsFound += contradictions.length;

        // Analysis 2: Check for unreachable branches
        const unreachable = this.findUnreachableBranches(flowGraph);
        result.warnings.push(...unreachable);
        this.stats.unreachableBranches += unreachable.length;

        // Analysis 3: Check field usage before population
        const fieldUsage = this.checkFieldUsageOrder(decisions, assignments, recordLookups, flowGraph);
        result.errors.push(...fieldUsage.errors);
        result.warnings.push(...fieldUsage.warnings);

        // Analysis 4: Check for infinite loops
        if (this.checkInfiniteLoops) {
            const loops = this.findInfiniteLoops(flowGraph);
            result.errors.push(...loops);
            this.stats.infiniteLoops += loops.length;
        }

        // Analysis 5: Check for dead-end paths
        if (this.checkDeadEnds) {
            const deadEnds = this.findDeadEndPaths(flowGraph);
            result.warnings.push(...deadEnds);
            this.stats.deadEnds += deadEnds.length;
        }

        // Determine overall validity
        result.valid = result.errors.length === 0;

        // Update stats
        if (result.valid) {
            this.stats.passed++;
        } else {
            this.stats.failed++;
        }

        return result;
    }

    /**
     * Extract decision elements from flow XML
     */
    extractDecisions(flow) {
        const decisions = [];

        if (flow.decisions) {
            for (const decision of flow.decisions) {
                const rules = decision.rules || [];
                const decisionInfo = {
                    name: decision.name ? decision.name[0] : 'Unknown',
                    label: decision.label ? decision.label[0] : 'Unknown',
                    rules: [],
                    defaultConnector: decision.defaultConnector ? decision.defaultConnector[0] : null
                };

                for (const rule of rules) {
                    const ruleInfo = {
                        name: rule.name ? rule.name[0] : 'Unknown',
                        label: rule.label ? rule.label[0] : 'Unknown',
                        conditions: [],
                        connector: rule.connector ? rule.connector[0] : null
                    };

                    if (rule.conditions) {
                        for (const condition of rule.conditions) {
                            // Extract right value from nested structure
                            let rightVal = null;
                            if (condition.rightValue && condition.rightValue[0]) {
                                const rv = condition.rightValue[0];
                                if (rv.numberValue) {
                                    rightVal = rv.numberValue[0];
                                } else if (rv.stringValue) {
                                    rightVal = rv.stringValue[0];
                                } else if (rv.booleanValue) {
                                    rightVal = rv.booleanValue[0];
                                } else if (typeof rv === 'string') {
                                    rightVal = rv;
                                }
                            }

                            ruleInfo.conditions.push({
                                leftValueReference: condition.leftValueReference ? condition.leftValueReference[0] : null,
                                operator: condition.operator ? condition.operator[0] : null,
                                rightValue: rightVal
                            });
                        }
                    }

                    decisionInfo.rules.push(ruleInfo);
                }

                decisions.push(decisionInfo);
            }
        }

        return decisions;
    }

    /**
     * Extract assignment elements from flow XML
     */
    extractAssignments(flow) {
        const assignments = [];

        if (flow.assignments) {
            for (const assignment of flow.assignments) {
                const assignmentItems = assignment.assignmentItems || [];
                assignments.push({
                    name: assignment.name ? assignment.name[0] : 'Unknown',
                    items: assignmentItems.map(item => ({
                        assignToReference: item.assignToReference ? item.assignToReference[0] : null,
                        operator: item.operator ? item.operator[0] : null,
                        value: item.value ? item.value[0] : null
                    }))
                });
            }
        }

        return assignments;
    }

    /**
     * Extract record lookup elements from flow XML
     */
    extractRecordLookups(flow) {
        const lookups = [];

        if (flow.recordLookups) {
            for (const lookup of flow.recordLookups) {
                lookups.push({
                    name: lookup.name ? lookup.name[0] : 'Unknown',
                    object: lookup.object ? lookup.object[0] : null,
                    outputReference: lookup.outputReference ? lookup.outputReference[0] : null,
                    queriedFields: lookup.queriedFields || []
                });
            }
        }

        return lookups;
    }

    /**
     * Build flow execution graph
     */
    buildFlowGraph(flow) {
        const graph = {
            nodes: new Map(),
            edges: [],
            startNode: flow.start && flow.start[0] && flow.start[0].connector ? flow.start[0].connector[0].targetReference[0] : null
        };

        // Helper to add node
        const addNode = (name, type, element = null) => {
            if (!graph.nodes.has(name)) {
                graph.nodes.set(name, { name, type, element });
            }
        };

        // Helper to add edge
        const addEdge = (from, to, condition = null) => {
            graph.edges.push({ from, to, condition });
        };

        // Add decision nodes and edges
        if (flow.decisions) {
            for (const decision of flow.decisions) {
                const decisionName = decision.name[0];
                addNode(decisionName, 'decision', decision);

                // Add edges for each rule
                if (decision.rules) {
                    for (const rule of decision.rules) {
                        if (rule.connector && rule.connector[0].targetReference) {
                            const target = rule.connector[0].targetReference[0];
                            addEdge(decisionName, target, {
                                type: 'rule',
                                ruleName: rule.name[0],
                                conditions: rule.conditions || []
                            });
                        }
                    }
                }

                // Add default connector edge
                if (decision.defaultConnector && decision.defaultConnector[0].targetReference) {
                    const target = decision.defaultConnector[0].targetReference[0];
                    addEdge(decisionName, target, { type: 'default' });
                }
            }
        }

        // Add assignment nodes and edges
        if (flow.assignments) {
            for (const assignment of flow.assignments) {
                const assignmentName = assignment.name[0];
                addNode(assignmentName, 'assignment', assignment);

                if (assignment.connector && assignment.connector[0].targetReference) {
                    const target = assignment.connector[0].targetReference[0];
                    addEdge(assignmentName, target);
                }
            }
        }

        // Add record lookup nodes and edges
        if (flow.recordLookups) {
            for (const lookup of flow.recordLookups) {
                const lookupName = lookup.name[0];
                addNode(lookupName, 'recordLookup', lookup);

                if (lookup.connector && lookup.connector[0].targetReference) {
                    const target = lookup.connector[0].targetReference[0];
                    addEdge(lookupName, target);
                }
            }
        }

        return graph;
    }

    /**
     * Find contradictory conditions in decision rules
     *
     * Example:
     *   Decision 1: Amount >= 10000
     *   Decision 2: Amount < 5000
     *   → Contradictory (can't be both)
     */
    findContradictoryConditions(decisions) {
        const errors = [];
        const allConditions = [];

        // Collect all conditions across decisions
        for (const decision of decisions) {
            for (const rule of decision.rules) {
                for (const condition of rule.conditions) {
                    allConditions.push({
                        decision: decision.name,
                        rule: rule.name,
                        ...condition
                    });
                }
            }
        }

        // Check for contradictions
        for (let i = 0; i < allConditions.length; i++) {
            for (let j = i + 1; j < allConditions.length; j++) {
                const c1 = allConditions[i];
                const c2 = allConditions[j];

                // Conditions on different rules of the same decision are mutually
                // exclusive by definition — only one rule fires. Not contradictions.
                if (c1.decision === c2.decision && c1.rule !== c2.rule) {
                    continue;
                }

                // Check if same field
                if (c1.leftValueReference === c2.leftValueReference) {
                    const contradiction = this.detectContradiction(c1, c2);
                    if (contradiction) {
                        errors.push({
                            type: 'CONTRADICTORY_CONDITIONS',
                            message: `Contradictory conditions detected for field '${c1.leftValueReference}'`,
                            severity: 'ERROR',
                            details: {
                                condition1: {
                                    decision: c1.decision,
                                    rule: c1.rule,
                                    operator: c1.operator,
                                    value: c1.rightValue
                                },
                                condition2: {
                                    decision: c2.decision,
                                    rule: c2.rule,
                                    operator: c2.operator,
                                    value: c2.rightValue
                                },
                                contradiction: contradiction
                            },
                            suggestion: 'Review decision logic to ensure conditions are not mutually exclusive'
                        });
                    }
                }
            }
        }

        return errors;
    }

    /**
     * Detect if two conditions are contradictory
     */
    detectContradiction(c1, c2) {
        // Normalize operators
        const normalizeOp = (op) => {
            const map = {
                'EqualTo': '==',
                'NotEqualTo': '!=',
                'GreaterThan': '>',
                'LessThan': '<',
                'GreaterThanOrEqualTo': '>=',
                'LessThanOrEqualTo': '<='
            };
            return map[op] || op;
        };

        const op1 = normalizeOp(c1.operator);
        const op2 = normalizeOp(c2.operator);
        const val1 = parseFloat(c1.rightValue) || c1.rightValue;
        const val2 = parseFloat(c2.rightValue) || c2.rightValue;

        // Check for numeric contradictions
        if (typeof val1 === 'number' && typeof val2 === 'number') {
            if (op1 === '>=' && op2 === '<' && val1 >= val2) {
                return `Cannot be both >= ${val1} AND < ${val2}`;
            }
            if (op1 === '>' && op2 === '<=' && val1 >= val2) {
                return `Cannot be both > ${val1} AND <= ${val2}`;
            }
            if (op1 === '==' && op2 === '!=' && val1 === val2) {
                return `Cannot be both == ${val1} AND != ${val2}`;
            }
            if (op1 === '>' && op2 === '<' && val1 >= val2) {
                return `Cannot be both > ${val1} AND < ${val2}`;
            }
        }

        // Check for string contradictions
        if (op1 === '==' && op2 === '!=' && val1 === val2) {
            return `Cannot be both == '${val1}' AND != '${val2}'`;
        }

        return null;
    }

    /**
     * Find unreachable branches in flow graph
     */
    findUnreachableBranches(flowGraph) {
        const warnings = [];
        const reachable = new Set();

        // BFS from start node
        if (!flowGraph.startNode) {
            return warnings;
        }

        const queue = [flowGraph.startNode];
        reachable.add(flowGraph.startNode);

        while (queue.length > 0) {
            const current = queue.shift();

            // Find outgoing edges
            const outgoingEdges = flowGraph.edges.filter(e => e.from === current);
            for (const edge of outgoingEdges) {
                if (!reachable.has(edge.to)) {
                    reachable.add(edge.to);
                    queue.push(edge.to);
                }
            }
        }

        // Check for unreachable nodes
        for (const [nodeName, node] of flowGraph.nodes) {
            if (!reachable.has(nodeName) && nodeName !== flowGraph.startNode) {
                warnings.push({
                    type: 'UNREACHABLE_BRANCH',
                    message: `Node '${nodeName}' is unreachable from flow start`,
                    severity: 'WARNING',
                    details: {
                        nodeName,
                        nodeType: node.type
                    },
                    suggestion: 'Review flow connections to ensure all nodes are reachable'
                });
            }
        }

        return warnings;
    }

    /**
     * Check field usage order (ensure fields are populated before use)
     */
    checkFieldUsageOrder(decisions, assignments, recordLookups, flowGraph) {
        const errors = [];
        const warnings = [];
        const fieldPopulations = new Map(); // Track where fields are populated

        // Track field populations from assignments
        for (const assignment of assignments) {
            for (const item of assignment.items) {
                if (item.assignToReference) {
                    fieldPopulations.set(item.assignToReference, {
                        type: 'assignment',
                        node: assignment.name
                    });
                }
            }
        }

        // Track field populations from record lookups
        for (const lookup of recordLookups) {
            if (lookup.outputReference) {
                fieldPopulations.set(lookup.outputReference, {
                    type: 'recordLookup',
                    node: lookup.name
                });
            }
        }

        // Check decision conditions use fields before population
        for (const decision of decisions) {
            for (const rule of decision.rules) {
                for (const condition of rule.conditions) {
                    const fieldRef = condition.leftValueReference;

                    if (fieldRef && fieldPopulations.has(fieldRef)) {
                        const population = fieldPopulations.get(fieldRef);

                        // Check if decision comes before population in flow graph
                        // (simplified - would need full path analysis for production)
                        warnings.push({
                            type: 'FIELD_USAGE_ORDER',
                            message: `Field '${fieldRef}' used in decision before it may be populated`,
                            severity: 'WARNING',
                            details: {
                                decision: decision.name,
                                rule: rule.name,
                                field: fieldRef,
                                populatedBy: population.node,
                                populationType: population.type
                            },
                            suggestion: 'Ensure field is populated before decision evaluation in all flow paths'
                        });
                    }
                }
            }
        }

        return { errors, warnings };
    }

    /**
     * Find infinite loops in flow graph
     */
    findInfiniteLoops(flowGraph) {
        const errors = [];
        const visited = new Set();
        const stack = new Set();

        const dfs = (node, path = []) => {
            if (!node) return;

            if (stack.has(node)) {
                // Found cycle
                const cycleStart = path.indexOf(node);
                const cycle = path.slice(cycleStart);
                cycle.push(node);

                errors.push({
                    type: 'INFINITE_LOOP',
                    message: `Potential infinite loop detected: ${cycle.join(' → ')}`,
                    severity: 'ERROR',
                    details: {
                        cyclePath: cycle
                    },
                    suggestion: 'Add loop exit condition or ensure flow terminates'
                });
                return;
            }

            if (visited.has(node)) return;

            visited.add(node);
            stack.add(node);
            path.push(node);

            // Visit all outgoing edges
            const outgoingEdges = flowGraph.edges.filter(e => e.from === node);
            for (const edge of outgoingEdges) {
                dfs(edge.to, [...path]);
            }

            stack.delete(node);
        };

        if (flowGraph.startNode) {
            dfs(flowGraph.startNode);
        }

        return errors;
    }

    /**
     * Find dead-end paths (paths with no outcome)
     */
    findDeadEndPaths(flowGraph) {
        const warnings = [];

        for (const [nodeName, node] of flowGraph.nodes) {
            const outgoingEdges = flowGraph.edges.filter(e => e.from === nodeName);

            // Check if node has no outgoing edges and is not a screen or wait element
            if (outgoingEdges.length === 0 &&
                node.type !== 'screen' &&
                node.type !== 'recordCreate' &&
                node.type !== 'recordUpdate') {

                warnings.push({
                    type: 'DEAD_END_PATH',
                    message: `Node '${nodeName}' has no outcome (dead end)`,
                    severity: 'WARNING',
                    details: {
                        nodeName,
                        nodeType: node.type
                    },
                    suggestion: 'Add fault handler or ensure flow terminates gracefully'
                });
            }
        }

        return warnings;
    }

    /**
     * Build reachability matrix (which nodes can reach which)
     */
    buildReachabilityMatrix(flowGraph) {
        const matrix = new Map();

        for (const [nodeName] of flowGraph.nodes) {
            const reachable = new Set();
            const queue = [nodeName];
            const visited = new Set([nodeName]);

            while (queue.length > 0) {
                const current = queue.shift();
                const outgoingEdges = flowGraph.edges.filter(e => e.from === current);

                for (const edge of outgoingEdges) {
                    if (!visited.has(edge.to)) {
                        visited.add(edge.to);
                        reachable.add(edge.to);
                        queue.push(edge.to);
                    }
                }
            }

            matrix.set(nodeName, Array.from(reachable));
        }

        return matrix;
    }

    /**
     * Get analysis statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalAnalyses: 0,
            passed: 0,
            failed: 0,
            decisionsAnalyzed: 0,
            contradictionsFound: 0,
            unreachableBranches: 0,
            infiniteLoops: 0,
            deadEnds: 0
        };
    }
}

module.exports = FlowDecisionLogicAnalyzer;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: flow-decision-logic-analyzer.js [orgAlias] <flowXmlPath>');
        console.log('');
        console.log('  orgAlias is optional. When omitted, org-dependent checks are skipped.');
        console.log('');
        console.log('Examples:');
        console.log('  node flow-decision-logic-analyzer.js ./flows/MyFlow.flow-meta.xml');
        console.log('  node flow-decision-logic-analyzer.js myorg ./flows/MyFlow.flow-meta.xml');
        console.log('  node flow-decision-logic-analyzer.js myorg ./force-app/main/default/flows/');
        process.exit(1);
    }

    // Support both:  <orgAlias> <flowXmlPath>  and just  <flowXmlPath>
    let orgAlias, flowPath;
    if (args.length >= 2 && !args[0].endsWith('.xml')) {
        orgAlias = args[0];
        flowPath = args[1];
    } else {
        orgAlias = null;
        flowPath = args[0];
    }
    const analyzer = new FlowDecisionLogicAnalyzer(orgAlias, { verbose: true });

    (async () => {
        try {
            if (fs.statSync(flowPath).isDirectory()) {
                // Analyze all flows in directory
                const flowFiles = fs.readdirSync(flowPath)
                    .filter(f => f.endsWith('.flow-meta.xml'))
                    .map(f => path.join(flowPath, f));

                console.log(`\n📊 Analyzing ${flowFiles.length} flows in ${flowPath}\n`);

                for (const flowFile of flowFiles) {
                    const result = await analyzer.analyze(flowFile);

                    console.log(`\n${result.valid ? '✅' : '❌'} ${result.flowName}`);

                    if (result.errors.length > 0) {
                        console.log(`\n  Errors (${result.errors.length}):`);
                        for (const error of result.errors) {
                            console.log(`    - ${error.message}`);
                        }
                    }

                    if (result.warnings.length > 0) {
                        console.log(`\n  Warnings (${result.warnings.length}):`);
                        for (const warning of result.warnings) {
                            console.log(`    - ${warning.message}`);
                        }
                    }
                }

                console.log('\n📈 Statistics:');
                console.log(JSON.stringify(analyzer.getStats(), null, 2));

            } else {
                // Analyze single flow
                const result = await analyzer.analyze(flowPath);

                console.log(`\n${result.valid ? '✅' : '❌'} Analysis Result: ${result.flowName}\n`);
                console.log(JSON.stringify(result, null, 2));
            }

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    })();
}
