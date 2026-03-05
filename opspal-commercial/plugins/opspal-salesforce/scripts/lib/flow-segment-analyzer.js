/**
 * Flow Segment Analyzer
 *
 * Analyzes existing Salesforce flows and detects logical segment boundaries
 * using pattern matching and element clustering. Enables automatic segmentation
 * of pre-existing flows.
 *
 * @module flow-segment-analyzer
 * @version 1.0.0
 * @since salesforce-plugin@3.65.0
 *
 * Key Capabilities:
 * - Analyze loaded flow structure
 * - Detect validation, enrichment, routing, notification, and loop patterns
 * - Suggest logical segment boundaries with confidence scores
 * - Identify natural break points based on connector flow
 * - Calculate per-segment complexity
 *
 * Usage:
 *   const FlowSegmentAnalyzer = require('./flow-segment-analyzer');
 *   const analyzer = new FlowSegmentAnalyzer(flowAuthor);
 *
 *   const analysis = await analyzer.analyzeFlowStructure();
 *   console.log(analysis.suggestedSegments);
 */

const fs = require('fs').promises;
const xml2js = require('xml2js');
const FlowComplexityCalculator = require('./flow-complexity-calculator');

/**
 * Segment type definitions with detection patterns
 */
const SEGMENT_PATTERNS = {
    validation: {
        name: 'Validation',
        defaultBudget: 5,
        budgetRange: [3, 7],
        description: 'Data validation and input checks',
        patterns: {
            // Elements typically found at flow start
            position: 'start',
            // Decision elements with check/validate naming
            namePatterns: [/check/i, /validate/i, /verify/i, /is_?valid/i, /confirm/i],
            // Primarily decisions without record operations before them
            primaryElements: ['decisions'],
            excludeElements: ['recordLookups', 'recordCreates', 'recordUpdates'],
            maxElements: 5,
            maxNesting: 2
        }
    },
    enrichment: {
        name: 'Enrichment',
        defaultBudget: 8,
        budgetRange: [6, 12],
        description: 'Data lookups and calculations',
        patterns: {
            // Record lookups followed by assignments
            primaryElements: ['recordLookups', 'assignments'],
            // Should precede major decision logic
            position: 'early-middle',
            namePatterns: [/get_?/i, /fetch/i, /load/i, /lookup/i, /enrich/i, /calculate/i],
            requiresElements: ['recordLookups'],
            maxElements: 10
        }
    },
    routing: {
        name: 'Routing',
        defaultBudget: 6,
        budgetRange: [4, 10],
        description: 'Decision trees and branching logic',
        patterns: {
            // Dense decision clusters
            primaryElements: ['decisions'],
            position: 'middle',
            namePatterns: [/route/i, /branch/i, /path/i, /direct/i, /switch/i],
            minDecisions: 2,
            maxNesting: 4,
            allowsBranching: true
        }
    },
    notification: {
        name: 'Notification',
        defaultBudget: 4,
        budgetRange: [2, 6],
        description: 'Email, Chatter, and alert actions',
        patterns: {
            // Notification-type actions
            primaryElements: ['actionCalls'],
            position: 'end',
            namePatterns: [/send/i, /notify/i, /email/i, /alert/i, /chatter/i, /post/i],
            actionTypes: ['emailAlert', 'chatterPost', 'postToChatter', 'sendEmail'],
            maxElements: 5
        }
    },
    loopProcessing: {
        name: 'Loop Processing',
        defaultBudget: 10,
        budgetRange: [8, 15],
        description: 'Bulkified loop operations',
        patterns: {
            primaryElements: ['loops'],
            position: 'any',
            namePatterns: [/loop/i, /iterate/i, /each/i, /process/i, /batch/i],
            requiresElements: ['loops'],
            includesInnerElements: true
        }
    }
};

/**
 * Complexity weights aligned with FlowComplexityCalculator
 */
const COMPLEXITY_WEIGHTS = {
    decisions: 2,
    loops: 3,
    subflows: 2,
    actionCalls: 1,
    assignments: 1,
    screens: 2,
    waits: 2,
    recordLookups: 2,
    recordUpdates: 1,
    recordCreates: 1,
    recordDeletes: 2
};

class FlowSegmentAnalyzer {
    /**
     * Create a new FlowSegmentAnalyzer
     * @param {Object} flowAuthor - FlowAuthor instance with loaded flow
     * @param {Object} options - Configuration options
     * @param {boolean} options.verbose - Enable verbose logging
     * @param {number} options.minClusterSize - Minimum elements for cluster (default: 2)
     * @param {number} options.minConfidence - Minimum confidence score (default: 0.5)
     */
    constructor(flowAuthor, options = {}) {
        this.flowAuthor = flowAuthor;
        this.verbose = options.verbose || false;
        this.minClusterSize = options.minClusterSize || 2;
        this.minConfidence = options.minConfidence || 0.5;
        this.complexityCalculator = new FlowComplexityCalculator();
        this.parser = new xml2js.Parser({ explicitArray: false });
    }

    /**
     * Log message if verbose mode is enabled
     * @param {string} message - Message to log
     * @private
     */
    _log(message) {
        if (this.verbose) {
            console.log(`[FlowSegmentAnalyzer] ${message}`);
        }
    }

    /**
     * Analyze flow structure and suggest segments
     * @param {Object} options - Analysis options
     * @param {boolean} options.includeConfidenceScores - Include confidence scores
     * @param {string[]} options.priorityPatterns - Patterns to prioritize
     * @returns {Promise<Object>} Analysis result with suggested segments
     */
    async analyzeFlowStructure(options = {}) {
        this._log('Starting flow structure analysis');

        // Get flow data
        let flow;
        if (this.flowAuthor?.currentFlow) {
            flow = this.flowAuthor.currentFlow;
        } else if (this.flowAuthor?.flowPath) {
            const xml = await fs.readFile(this.flowAuthor.flowPath, 'utf8');
            const parsed = await this.parser.parseStringPromise(xml);
            flow = parsed.Flow;
        } else {
            throw new Error('No flow loaded in FlowAuthor');
        }

        // Extract all elements with metadata
        const elements = this._extractElements(flow);
        const connectors = this._extractConnectors(flow, elements);

        // Build execution graph
        const graph = this._buildExecutionGraph(elements, connectors, flow.startElementReference);

        // Calculate total complexity
        const totalComplexity = this._calculateTotalComplexity(elements);

        // Detect patterns for each segment type
        const detectedPatterns = {};
        for (const [type, config] of Object.entries(SEGMENT_PATTERNS)) {
            detectedPatterns[type] = this._detectPattern(type, config, elements, graph, flow);
        }

        // Generate segment suggestions
        const suggestedSegments = this._generateSegmentSuggestions(
            detectedPatterns,
            elements,
            graph,
            options
        );

        // Find unclassified elements
        const classifiedElements = new Set();
        for (const segment of suggestedSegments) {
            for (const element of segment.elements) {
                classifiedElements.add(element);
            }
        }
        const unclassifiedElements = elements
            .filter(e => !classifiedElements.has(e.name))
            .map(e => e.name);

        // Generate recommendations
        const recommendations = this._generateRecommendations(
            suggestedSegments,
            unclassifiedElements,
            totalComplexity
        );

        const result = {
            totalElements: elements.length,
            totalComplexity,
            suggestedSegments,
            unclassifiedElements,
            patterns: detectedPatterns,
            recommendations,
            graph: {
                nodeCount: graph.nodes.size,
                edgeCount: graph.edges.length,
                startElement: flow.startElementReference
            }
        };

        this._log(`Analysis complete: ${suggestedSegments.length} segments suggested`);
        return result;
    }

    /**
     * Extract all elements from flow with metadata
     * @param {Object} flow - Parsed flow object
     * @returns {Array<Object>} Elements with metadata
     * @private
     */
    _extractElements(flow) {
        const elements = [];
        const elementTypes = [
            'decisions', 'assignments', 'recordLookups', 'recordUpdates',
            'recordCreates', 'recordDeletes', 'loops', 'screens', 'subflows',
            'actionCalls', 'waits', 'collectionProcessors', 'customErrors'
        ];

        for (const type of elementTypes) {
            const flowElements = flow[type];
            if (flowElements) {
                const elementArray = Array.isArray(flowElements) ? flowElements : [flowElements];
                for (const element of elementArray) {
                    if (element.name) {
                        elements.push({
                            name: element.name,
                            type,
                            label: element.label || element.name,
                            element,
                            complexity: COMPLEXITY_WEIGHTS[type] || 1
                        });
                    }
                }
            }
        }

        return elements;
    }

    /**
     * Extract connector relationships
     * @param {Object} flow - Parsed flow object
     * @param {Array<Object>} elements - Extracted elements
     * @returns {Array<Object>} Connectors
     * @private
     */
    _extractConnectors(flow, elements) {
        const connectors = [];
        const connectorTypes = ['connector', 'defaultConnector', 'faultConnector', 'nextValueConnector', 'noMoreValuesConnector'];

        for (const elementData of elements) {
            const element = elementData.element;

            for (const connType of connectorTypes) {
                if (element[connType]?.targetReference) {
                    connectors.push({
                        source: elementData.name,
                        target: element[connType].targetReference,
                        type: connType
                    });
                }
            }

            // Decision rules
            if (element.rules) {
                const rules = Array.isArray(element.rules) ? element.rules : [element.rules];
                for (const rule of rules) {
                    if (rule.connector?.targetReference) {
                        connectors.push({
                            source: elementData.name,
                            target: rule.connector.targetReference,
                            type: 'rule',
                            ruleName: rule.name
                        });
                    }
                }
            }
        }

        return connectors;
    }

    /**
     * Build execution graph from elements and connectors
     * @param {Array<Object>} elements - Extracted elements
     * @param {Array<Object>} connectors - Connector relationships
     * @param {string} startElement - Start element reference
     * @returns {Object} Graph structure
     * @private
     */
    _buildExecutionGraph(elements, connectors, startElement) {
        const nodes = new Map();
        const edges = [];
        const inDegree = new Map();
        const outDegree = new Map();

        // Add nodes
        for (const element of elements) {
            nodes.set(element.name, {
                ...element,
                order: -1,
                depth: -1
            });
            inDegree.set(element.name, 0);
            outDegree.set(element.name, 0);
        }

        // Add edges
        for (const connector of connectors) {
            if (nodes.has(connector.source) && nodes.has(connector.target)) {
                edges.push(connector);
                inDegree.set(connector.target, (inDegree.get(connector.target) || 0) + 1);
                outDegree.set(connector.source, (outDegree.get(connector.source) || 0) + 1);
            }
        }

        // Calculate execution order (BFS from start)
        if (startElement && nodes.has(startElement)) {
            let order = 0;
            const visited = new Set();
            const queue = [{ name: startElement, depth: 0 }];

            while (queue.length > 0) {
                const { name, depth } = queue.shift();
                if (visited.has(name)) continue;
                visited.add(name);

                const node = nodes.get(name);
                if (node) {
                    node.order = order++;
                    node.depth = depth;
                }

                // Find outgoing edges
                for (const edge of edges) {
                    if (edge.source === name && !visited.has(edge.target)) {
                        queue.push({ name: edge.target, depth: depth + 1 });
                    }
                }
            }
        }

        return { nodes, edges, inDegree, outDegree };
    }

    /**
     * Detect a specific segment pattern in the flow
     * @param {string} type - Segment type
     * @param {Object} config - Pattern configuration
     * @param {Array<Object>} elements - All elements
     * @param {Object} graph - Execution graph
     * @param {Object} flow - Flow object
     * @returns {Object} Detection result
     * @private
     */
    _detectPattern(type, config, elements, graph, flow) {
        const result = {
            detected: false,
            elements: [],
            confidence: 0,
            reason: ''
        };

        const patterns = config.patterns;
        const matchingElements = [];

        // Filter by primary elements
        const primaryTypeElements = elements.filter(e =>
            patterns.primaryElements?.includes(e.type)
        );

        // Check position requirement
        if (patterns.position === 'start') {
            // Elements should be near the start (low order)
            const startElements = primaryTypeElements.filter(e => {
                const node = graph.nodes.get(e.name);
                return node && node.order >= 0 && node.order < 5;
            });

            if (startElements.length > 0) {
                // Check naming patterns
                for (const element of startElements) {
                    const matchesName = patterns.namePatterns?.some(p =>
                        p.test(element.name) || p.test(element.label)
                    );
                    if (matchesName) {
                        matchingElements.push(element);
                    }
                }

                // Even without name match, early decisions are validation candidates
                if (matchingElements.length === 0 && type === 'validation') {
                    const earlyDecisions = elements.filter(e => {
                        const node = graph.nodes.get(e.name);
                        return e.type === 'decisions' && node && node.order >= 0 && node.order < 3;
                    });
                    if (earlyDecisions.length > 0) {
                        matchingElements.push(...earlyDecisions);
                        result.reason = 'Decision elements at flow start detected as validation';
                    }
                }
            }
        }

        // Check for required elements
        if (patterns.requiresElements) {
            const hasRequired = patterns.requiresElements.every(reqType =>
                elements.some(e => e.type === reqType)
            );
            if (!hasRequired) {
                return result;
            }
        }

        // For enrichment: record lookups followed by assignments
        if (type === 'enrichment') {
            const lookups = elements.filter(e => e.type === 'recordLookups');
            for (const lookup of lookups) {
                matchingElements.push(lookup);
                // Find downstream assignments
                const downstreamAssignments = this._findDownstreamElements(
                    lookup.name, graph, elements, 'assignments', 3
                );
                matchingElements.push(...downstreamAssignments);
            }
        }

        // For routing: clusters of decisions
        if (type === 'routing' && patterns.minDecisions) {
            const decisions = elements.filter(e => e.type === 'decisions');
            if (decisions.length >= patterns.minDecisions) {
                // Find connected decision clusters
                const clusters = this._findElementClusters(decisions, graph);
                for (const cluster of clusters) {
                    if (cluster.length >= patterns.minDecisions) {
                        matchingElements.push(...cluster.filter(c =>
                            !matchingElements.some(m => m.name === c.name)
                        ));
                        result.reason = `Decision cluster with ${cluster.length} connected decisions`;
                    }
                }
            }
        }

        // For notification: action calls of specific types
        if (type === 'notification') {
            const actions = elements.filter(e => e.type === 'actionCalls');
            for (const action of actions) {
                const matchesName = patterns.namePatterns?.some(p =>
                    p.test(action.name) || p.test(action.label)
                );
                // Check action type if available
                const actionType = action.element?.actionType;
                const matchesType = patterns.actionTypes?.some(t =>
                    actionType === t || action.name.toLowerCase().includes(t.toLowerCase())
                );
                if (matchesName || matchesType) {
                    matchingElements.push(action);
                }
            }
        }

        // For loop processing: loops with their contents
        if (type === 'loopProcessing') {
            const loops = elements.filter(e => e.type === 'loops');
            for (const loop of loops) {
                matchingElements.push(loop);
                // Find elements inside the loop
                if (patterns.includesInnerElements) {
                    const innerElements = this._findLoopInnerElements(loop, graph, elements);
                    matchingElements.push(...innerElements);
                }
            }
        }

        // Calculate confidence and finalize
        if (matchingElements.length > 0) {
            result.detected = true;
            result.elements = [...new Set(matchingElements.map(e => e.name))];
            result.confidence = this._calculateConfidence(
                matchingElements, patterns, elements, graph
            );
            if (!result.reason) {
                result.reason = `Detected ${result.elements.length} elements matching ${type} pattern`;
            }
        }

        return result;
    }

    /**
     * Find downstream elements of a specific type
     * @param {string} startElement - Starting element name
     * @param {Object} graph - Execution graph
     * @param {Array<Object>} elements - All elements
     * @param {string} targetType - Type to find
     * @param {number} maxDepth - Maximum search depth
     * @returns {Array<Object>} Found elements
     * @private
     */
    _findDownstreamElements(startElement, graph, elements, targetType, maxDepth) {
        const found = [];
        const visited = new Set();
        const queue = [{ name: startElement, depth: 0 }];

        while (queue.length > 0) {
            const { name, depth } = queue.shift();
            if (visited.has(name) || depth > maxDepth) continue;
            visited.add(name);

            // Find outgoing edges
            for (const edge of graph.edges) {
                if (edge.source === name) {
                    const targetElement = elements.find(e => e.name === edge.target);
                    if (targetElement?.type === targetType) {
                        found.push(targetElement);
                    }
                    queue.push({ name: edge.target, depth: depth + 1 });
                }
            }
        }

        return found;
    }

    /**
     * Find clusters of connected elements
     * @param {Array<Object>} targetElements - Elements to cluster
     * @param {Object} graph - Execution graph
     * @returns {Array<Array<Object>>} Clusters
     * @private
     */
    _findElementClusters(targetElements, graph) {
        const clusters = [];
        const visited = new Set();

        for (const element of targetElements) {
            if (visited.has(element.name)) continue;

            const cluster = [element];
            visited.add(element.name);
            const queue = [element.name];

            while (queue.length > 0) {
                const current = queue.shift();

                // Find connected elements of same type
                for (const edge of graph.edges) {
                    let connectedName = null;
                    if (edge.source === current) {
                        connectedName = edge.target;
                    } else if (edge.target === current) {
                        connectedName = edge.source;
                    }

                    if (connectedName && !visited.has(connectedName)) {
                        const connected = targetElements.find(e => e.name === connectedName);
                        if (connected) {
                            visited.add(connectedName);
                            cluster.push(connected);
                            queue.push(connectedName);
                        }
                    }
                }
            }

            if (cluster.length >= 2) {
                clusters.push(cluster);
            }
        }

        return clusters;
    }

    /**
     * Find elements inside a loop
     * @param {Object} loop - Loop element
     * @param {Object} graph - Execution graph
     * @param {Array<Object>} elements - All elements
     * @returns {Array<Object>} Inner elements
     * @private
     */
    _findLoopInnerElements(loop, graph, elements) {
        const inner = [];
        const loopElement = loop.element;

        // Find the nextValueConnector target (loop body start)
        const bodyStart = loopElement.nextValueConnector?.targetReference;
        if (!bodyStart) return inner;

        // Find elements between nextValueConnector and noMoreValuesConnector
        const loopEnd = loopElement.noMoreValuesConnector?.targetReference;
        const visited = new Set();
        const queue = [bodyStart];

        while (queue.length > 0) {
            const name = queue.shift();
            if (visited.has(name) || name === loopEnd || name === loop.name) continue;
            visited.add(name);

            const element = elements.find(e => e.name === name);
            if (element) {
                inner.push(element);
            }

            // Continue to connected elements
            for (const edge of graph.edges) {
                if (edge.source === name && !visited.has(edge.target)) {
                    queue.push(edge.target);
                }
            }
        }

        return inner;
    }

    /**
     * Calculate confidence score for a pattern match
     * @param {Array<Object>} matchingElements - Matched elements
     * @param {Object} patterns - Pattern configuration
     * @param {Array<Object>} elements - All elements
     * @param {Object} graph - Execution graph
     * @returns {number} Confidence score (0-1)
     * @private
     */
    _calculateConfidence(matchingElements, patterns, elements, graph) {
        let score = 0;
        let factors = 0;

        // Factor 1: Name pattern matches
        if (patterns.namePatterns) {
            const nameMatches = matchingElements.filter(e =>
                patterns.namePatterns.some(p => p.test(e.name) || p.test(e.label))
            );
            score += (nameMatches.length / matchingElements.length) * 0.4;
            factors++;
        }

        // Factor 2: Position appropriateness
        if (patterns.position) {
            const avgOrder = matchingElements.reduce((sum, e) => {
                const node = graph.nodes.get(e.name);
                return sum + (node?.order || 0);
            }, 0) / matchingElements.length;

            if (patterns.position === 'start' && avgOrder < 3) {
                score += 0.3;
            } else if (patterns.position === 'end' && avgOrder > elements.length * 0.7) {
                score += 0.3;
            } else if (patterns.position === 'middle' || patterns.position === 'any') {
                score += 0.2;
            }
            factors++;
        }

        // Factor 3: Element count within expected range
        if (patterns.maxElements) {
            if (matchingElements.length <= patterns.maxElements) {
                score += 0.2;
            }
            factors++;
        }

        // Factor 4: Cluster connectivity
        const connected = this._findElementClusters(matchingElements, graph);
        if (connected.length > 0 && connected[0].length > 1) {
            score += 0.1 * (connected[0].length / matchingElements.length);
            factors++;
        }

        return Math.min(1, score + 0.3); // Base confidence of 0.3
    }

    /**
     * Generate segment suggestions from detected patterns
     * @param {Object} detectedPatterns - Detection results per type
     * @param {Array<Object>} elements - All elements
     * @param {Object} graph - Execution graph
     * @param {Object} options - Generation options
     * @returns {Array<Object>} Suggested segments
     * @private
     */
    _generateSegmentSuggestions(detectedPatterns, elements, graph, options) {
        const suggestions = [];
        const usedElements = new Set();
        let segmentIndex = 1;

        // Sort patterns by priority (validation first, loop processing last)
        const priorityOrder = ['validation', 'enrichment', 'routing', 'notification', 'loopProcessing'];

        for (const type of priorityOrder) {
            const detection = detectedPatterns[type];
            if (!detection.detected) continue;
            if (detection.confidence < this.minConfidence) continue;

            // Filter out already-used elements
            const availableElements = detection.elements.filter(e => !usedElements.has(e));
            if (availableElements.length < this.minClusterSize) continue;

            // Mark elements as used
            availableElements.forEach(e => usedElements.add(e));

            // Calculate complexity for this segment
            const segmentComplexity = availableElements.reduce((sum, eName) => {
                const element = elements.find(e => e.name === eName);
                return sum + (element?.complexity || 1);
            }, 0);

            const config = SEGMENT_PATTERNS[type];
            suggestions.push({
                name: `${config.name}_${segmentIndex++}`,
                type,
                elements: availableElements,
                suggestedBudget: config.defaultBudget,
                budgetRange: config.budgetRange,
                calculatedComplexity: segmentComplexity,
                confidenceScore: detection.confidence,
                reason: detection.reason,
                description: config.description
            });
        }

        return suggestions;
    }

    /**
     * Calculate total flow complexity
     * @param {Array<Object>} elements - All elements
     * @returns {number} Total complexity
     * @private
     */
    _calculateTotalComplexity(elements) {
        return elements.reduce((sum, e) => sum + (e.complexity || 1), 0);
    }

    /**
     * Generate recommendations based on analysis
     * @param {Array<Object>} segments - Suggested segments
     * @param {Array<string>} unclassified - Unclassified element names
     * @param {number} totalComplexity - Total complexity
     * @returns {Array<string>} Recommendations
     * @private
     */
    _generateRecommendations(segments, unclassified, totalComplexity) {
        const recommendations = [];

        // High complexity recommendation
        if (totalComplexity > 20) {
            recommendations.push(
                `High complexity (${totalComplexity} points) - strongly recommend segmentation and subflow extraction`
            );
        } else if (totalComplexity > 10) {
            recommendations.push(
                `Moderate complexity (${totalComplexity} points) - segmentation recommended for maintainability`
            );
        }

        // Unclassified elements
        if (unclassified.length > 0) {
            recommendations.push(
                `${unclassified.length} element(s) not classified into segments - review manually or add to custom segment`
            );
        }

        // Over-budget segments
        for (const segment of segments) {
            if (segment.calculatedComplexity > segment.suggestedBudget) {
                const overflow = Math.round((segment.calculatedComplexity / segment.suggestedBudget - 1) * 100);
                recommendations.push(
                    `${segment.name} exceeds budget by ${overflow}% - consider splitting or extracting to subflow`
                );
            }
        }

        // Low confidence segments
        const lowConfidence = segments.filter(s => s.confidenceScore < 0.7);
        if (lowConfidence.length > 0) {
            recommendations.push(
                `${lowConfidence.length} segment(s) have low confidence scores - review element assignments`
            );
        }

        return recommendations;
    }

    /**
     * Suggest segments for an existing flow
     * @param {Object} options - Suggestion options
     * @returns {Promise<Array<Object>>} Segment suggestions
     */
    async suggestSegments(options = {}) {
        const analysis = await this.analyzeFlowStructure(options);
        return analysis.suggestedSegments;
    }

    /**
     * Get segment pattern definitions
     * @returns {Object} Pattern definitions
     */
    static get PATTERNS() {
        return SEGMENT_PATTERNS;
    }
}

module.exports = FlowSegmentAnalyzer;
