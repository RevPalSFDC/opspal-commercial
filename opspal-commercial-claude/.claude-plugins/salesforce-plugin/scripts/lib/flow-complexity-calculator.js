/**
 * Flow Complexity Calculator
 *
 * Reusable complexity calculation logic extracted from flow-complexity-audit.js
 * for use across multiple tools (SegmentManager, FlowAuthor, validation, etc.)
 *
 * @module flow-complexity-calculator
 * @version 1.0.0
 * @since salesforce-plugin@3.50.0
 *
 * Key Capabilities:
 * - Calculate complexity from flow XML
 * - Calculate complexity from element counts
 * - Calculate complexity from natural language instructions
 * - Risk factor assessment
 * - Recommendation generation
 * - Support per-segment and whole-flow calculations
 *
 * Usage:
 *   const FlowComplexityCalculator = require('./flow-complexity-calculator');
 *   const calculator = new FlowComplexityCalculator();
 *
 *   // From XML
 *   const complexity = await calculator.calculateFromXML(flowXML);
 *
 *   // From element counts
 *   const complexity = calculator.calculateFromElementCounts({ decisions: 2, loops: 1 });
 *
 *   // From natural language instruction
 *   const complexity = await calculator.calculateFromInstruction('Add a decision...');
 */

const fs = require('fs').promises;
const xml2js = require('xml2js');

/**
 * Complexity calculation weights
 * Aligned with empirical analysis from flow-complexity-audit.js
 */
const COMPLEXITY_WEIGHTS = {
    // Flow elements
    decisions: 2,           // Decision elements
    loops: 3,              // Loop elements
    subflows: 2,           // Subflow calls
    actions: 1,            // Action elements
    assignments: 1,        // Variable assignments
    screens: 2,            // Screen elements
    waits: 2,              // Wait elements
    branches: 1,           // Branch paths

    // Record operations
    recordLookups: 2,      // Record lookups (Get Records)
    recordUpdates: 1,      // Record updates
    recordCreates: 1,      // Record creates
    recordDeletes: 2,      // Record deletes

    // Advanced elements
    emailAlerts: 1,        // Email alerts
    approvals: 3,          // Approval processes
    customApex: 4,         // Custom Apex invocations
    collections: 2,        // Collection operations
    formulas: 1,           // Formula expressions

    // Risk multipliers
    triggerMultiplier: 1.5,     // Record-triggered flows
    scheduledMultiplier: 1.2,   // Scheduled flows
    bulkMultiplier: 2.0,        // Bulk operations
};

/**
 * Risk categories for complexity scoring
 */
const RISK_CATEGORIES = {
    LOW: { min: 0, max: 6, color: 'green', label: 'Low Risk' },
    MEDIUM: { min: 7, max: 12, color: 'yellow', label: 'Medium Risk' },
    HIGH: { min: 13, max: 20, color: 'orange', label: 'High Risk' },
    CRITICAL: { min: 21, max: 999, color: 'red', label: 'Critical Risk' }
};

/**
 * XML element type mapping to complexity categories
 */
const XML_ELEMENT_MAPPING = {
    decisions: 'decisions',
    loops: 'loops',
    subflows: 'subflows',
    actionCalls: 'actions',
    assignments: 'assignments',
    screens: 'screens',
    waits: 'waits',
    recordLookups: 'recordLookups',
    recordUpdates: 'recordUpdates',
    recordCreates: 'recordCreates',
    recordDeletes: 'recordDeletes',
    emailAlerts: 'emailAlerts',
    approvals: 'approvals',
    apexPluginCalls: 'customApex',
    collectionProcessors: 'collections',
    formulas: 'formulas'
};

class FlowComplexityCalculator {
    /**
     * Create a new FlowComplexityCalculator
     * @param {Object} options - Configuration options
     * @param {Object} options.weights - Custom complexity weights (optional)
     * @param {Object} options.riskCategories - Custom risk categories (optional)
     */
    constructor(options = {}) {
        this.weights = {
            ...COMPLEXITY_WEIGHTS,
            ...(options.weights || {})
        };

        this.riskCategories = {
            ...RISK_CATEGORIES,
            ...(options.riskCategories || {})
        };
    }

    /**
     * Calculate complexity from flow XML
     * @param {string} flowXML - Flow XML content
     * @param {Object} options - Calculation options
     * @returns {Promise<Object>} Complexity result
     */
    async calculateFromXML(flowXML, options = {}) {
        try {
            // Parse XML
            const parser = new xml2js.Parser({ explicitArray: false });
            const flowData = await parser.parseStringPromise(flowXML);

            // Extract flow metadata
            const flow = flowData.Flow || {};
            const processType = flow.processType || 'Flow';
            const triggerType = flow.startElementReference || null;

            // Count elements
            const elementCounts = this._countXMLElements(flow);

            // Calculate complexity
            return this.calculateFromElementCounts(elementCounts, {
                processType,
                triggerType,
                ...options
            });
        } catch (error) {
            throw new Error(`Failed to parse flow XML: ${error.message}`);
        }
    }

    /**
     * Calculate complexity from element counts
     * @param {Object} elementCounts - Element type counts
     * @param {Object} options - Calculation options
     * @param {string} options.processType - Flow process type
     * @param {string} options.triggerType - Flow trigger type
     * @param {boolean} options.isBulkProcessing - Whether flow handles bulk
     * @returns {Object} Complexity result
     */
    calculateFromElementCounts(elementCounts, options = {}) {
        const result = {
            baseScore: 0,
            riskMultiplier: 1.0,
            finalScore: 0,
            breakdown: {},
            riskFactors: [],
            recommendations: [],
            riskCategory: null
        };

        // Calculate base score from element counts
        for (const [elementType, count] of Object.entries(elementCounts)) {
            if (count > 0 && this.weights[elementType]) {
                const elementScore = count * this.weights[elementType];
                result.baseScore += elementScore;
                result.breakdown[elementType] = {
                    count,
                    weight: this.weights[elementType],
                    score: elementScore
                };
            }
        }

        // Apply process type base score
        if (options.processType === 'AutoLaunchedFlow') {
            result.baseScore += 2;
            result.breakdown.autoLaunched = { count: 1, weight: 2, score: 2 };
        }

        // Apply risk multipliers
        if (options.triggerType === 'RecordAfterSave' || options.triggerType === 'RecordBeforeSave') {
            result.riskMultiplier *= this.weights.triggerMultiplier;
            result.riskFactors.push('Record-triggered flow');
        }

        if (options.triggerType === 'Scheduled') {
            result.riskMultiplier *= this.weights.scheduledMultiplier;
            result.riskFactors.push('Scheduled flow');
        }

        if (options.isBulkProcessing) {
            result.riskMultiplier *= this.weights.bulkMultiplier;
            result.riskFactors.push('Bulk processing enabled');
        }

        // Check for specific risk patterns
        if (elementCounts.loops > 2) {
            result.riskMultiplier *= 1.3;
            result.riskFactors.push(`Multiple nested loops detected (${elementCounts.loops})`);
        }

        if (elementCounts.customApex > 0) {
            result.riskMultiplier *= 1.4;
            result.riskFactors.push('Custom Apex integration');
        }

        if (elementCounts.approvals > 1) {
            result.riskMultiplier *= 1.2;
            result.riskFactors.push('Multiple approval processes');
        }

        // Calculate final score
        result.finalScore = Math.round(result.baseScore * result.riskMultiplier);

        // Determine risk category
        result.riskCategory = this.getRiskCategory(result.finalScore);

        // Generate recommendations
        result.recommendations = this.generateRecommendations(result, elementCounts, options);

        return result;
    }

    /**
     * Calculate complexity from natural language instruction
     * @param {string} instruction - Natural language instruction
     * @returns {Promise<Object>} Complexity impact
     */
    async calculateFromInstruction(instruction) {
        const lowerInstruction = instruction.toLowerCase();
        const elementCounts = {};

        // Keyword-based element detection
        const detectionPatterns = [
            { pattern: /decision|if\s+|when\s+/, type: 'decisions', count: 1 },
            { pattern: /loop|iterate|for each/i, type: 'loops', count: 1 },
            { pattern: /get records|record lookup|query/i, type: 'recordLookups', count: 1 },
            { pattern: /create record/i, type: 'recordCreates', count: 1 },
            { pattern: /update record/i, type: 'recordUpdates', count: 1 },
            { pattern: /delete record/i, type: 'recordDeletes', count: 1 },
            { pattern: /action|invoke/i, type: 'actions', count: 1 },
            { pattern: /assignment|set\s+|assign/i, type: 'assignments', count: 1 },
            { pattern: /subflow|call flow/i, type: 'subflows', count: 1 },
            { pattern: /screen/i, type: 'screens', count: 1 },
            { pattern: /wait/i, type: 'waits', count: 1 },
            { pattern: /approval/i, type: 'approvals', count: 1 },
            { pattern: /apex|custom action/i, type: 'customApex', count: 1 },
            { pattern: /email|send email|alert/i, type: 'emailAlerts', count: 1 },
            { pattern: /collection|add to|remove from/i, type: 'collections', count: 1 },
            { pattern: /formula|calculate/i, type: 'formulas', count: 1 }
        ];

        // Detect element types
        for (const { pattern, type, count } of detectionPatterns) {
            if (pattern.test(lowerInstruction)) {
                elementCounts[type] = (elementCounts[type] || 0) + count;
            }
        }

        // Calculate complexity
        const complexity = this.calculateFromElementCounts(elementCounts);

        // Simplify result for instruction context
        return {
            score: complexity.finalScore,
            breakdown: complexity.breakdown,
            elementCounts,
            riskFactors: complexity.riskFactors
        };
    }

    /**
     * Get risk category for a complexity score
     * @param {number} score - Complexity score
     * @returns {Object} Risk category info
     */
    getRiskCategory(score) {
        for (const [category, range] of Object.entries(this.riskCategories)) {
            if (score >= range.min && score <= range.max) {
                return { category, ...range };
            }
        }
        return { ...this.riskCategories.CRITICAL, category: 'CRITICAL' };
    }

    /**
     * Generate complexity-based recommendations
     * @param {Object} complexity - Complexity result
     * @param {Object} elementCounts - Element counts
     * @param {Object} options - Flow options
     * @returns {Array<string>} Recommendations
     */
    generateRecommendations(complexity, elementCounts, options = {}) {
        const recommendations = [];
        const score = complexity.finalScore;

        // High complexity
        if (score >= 15) {
            recommendations.push('Consider segmenting this flow into smaller, focused segments');
            recommendations.push('Evaluate if subflows can isolate complex logic');
        }

        if (score >= 21) {
            recommendations.push('CRITICAL: Flow complexity exceeds recommended limits');
            recommendations.push('Consider converting to Apex for better maintainability');
        }

        // Specific pattern recommendations
        if (complexity.riskFactors.includes('Multiple nested loops detected')) {
            recommendations.push('Optimize loop structures to prevent governor limit issues');
            recommendations.push('Consider bulkifying operations outside loops');
        }

        if (complexity.riskFactors.includes('Record-triggered flow')) {
            recommendations.push('Ensure bulkification for all record operations');
            recommendations.push('Consider consolidation with other flows on the same object');
        }

        if (elementCounts.customApex > 0) {
            recommendations.push('Review Apex integration for error handling and bulk processing');
        }

        if (elementCounts.loops > 0 && (elementCounts.recordUpdates > 0 || elementCounts.recordCreates > 0)) {
            recommendations.push('WARNING: Potential DML inside loops - verify operations are outside loops');
        }

        if (elementCounts.decisions > 3) {
            recommendations.push('Consider simplifying decision logic or using formula fields');
        }

        if (elementCounts.recordLookups > 3) {
            recommendations.push('Multiple Get Records detected - review for consolidation opportunities');
        }

        return recommendations;
    }

    /**
     * Count elements in parsed flow XML
     * @param {Object} flow - Parsed flow object
     * @returns {Object} Element counts
     * @private
     */
    _countXMLElements(flow) {
        const counts = {
            decisions: 0,
            loops: 0,
            subflows: 0,
            actions: 0,
            assignments: 0,
            screens: 0,
            waits: 0,
            recordLookups: 0,
            recordUpdates: 0,
            recordCreates: 0,
            recordDeletes: 0,
            emailAlerts: 0,
            approvals: 0,
            customApex: 0,
            collections: 0,
            formulas: 0
        };

        // Count each element type
        for (const [xmlType, countType] of Object.entries(XML_ELEMENT_MAPPING)) {
            if (flow[xmlType]) {
                const elements = Array.isArray(flow[xmlType]) ? flow[xmlType] : [flow[xmlType]];
                counts[countType] = elements.length;
            }
        }

        // Count formulas within other elements
        counts.formulas = this._countFormulas(flow);

        return counts;
    }

    /**
     * Count formula expressions in flow
     * @param {Object} flow - Parsed flow object
     * @returns {number} Formula count
     * @private
     */
    _countFormulas(flow) {
        let count = 0;

        // Recursive function to find formulas in nested structures
        const findFormulas = (obj) => {
            if (!obj || typeof obj !== 'object') return;

            for (const value of Object.values(obj)) {
                if (typeof value === 'string' && this._isFormulaExpression(value)) {
                    count++;
                } else if (typeof value === 'object') {
                    findFormulas(value);
                }
            }
        };

        findFormulas(flow);
        return count;
    }

    /**
     * Check if string is a formula expression
     * @param {string} str - String to check
     * @returns {boolean} True if formula
     * @private
     */
    _isFormulaExpression(str) {
        if (!str || typeof str !== 'string') return false;

        // Check for Salesforce formula patterns
        const formulaPatterns = [
            /\{![^\}]+\}/,           // Merge field syntax {!Variable}
            /\b(IF|AND|OR|NOT|ISBLANK|ISNULL|TEXT|VALUE|LEN|CONTAINS|SUBSTITUTE)\s*\(/i,
            /[A-Z][a-z]+\.[A-Z][a-z]+/, // Object.Field reference
        ];

        return formulaPatterns.some(pattern => pattern.test(str));
    }

    /**
     * Compare complexity between two flows or segments
     * @param {Object} complexity1 - First complexity result
     * @param {Object} complexity2 - Second complexity result
     * @returns {Object} Comparison result
     */
    compareComplexity(complexity1, complexity2) {
        return {
            scoreDelta: complexity2.finalScore - complexity1.finalScore,
            scoreChange: ((complexity2.finalScore - complexity1.finalScore) / complexity1.finalScore) * 100,
            riskCategoryChange: {
                from: complexity1.riskCategory?.category || 'UNKNOWN',
                to: complexity2.riskCategory?.category || 'UNKNOWN',
                improved: this._riskCategoryValue(complexity2.riskCategory?.category) <
                         this._riskCategoryValue(complexity1.riskCategory?.category)
            },
            elementChanges: this._compareBreakdowns(complexity1.breakdown, complexity2.breakdown)
        };
    }

    /**
     * Get numeric value for risk category (for comparison)
     * @param {string} category - Risk category
     * @returns {number} Numeric value
     * @private
     */
    _riskCategoryValue(category) {
        const values = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
        return values[category] || 5;
    }

    /**
     * Compare two complexity breakdowns
     * @param {Object} breakdown1 - First breakdown
     * @param {Object} breakdown2 - Second breakdown
     * @returns {Object} Element changes
     * @private
     */
    _compareBreakdowns(breakdown1, breakdown2) {
        const changes = {};
        const allTypes = new Set([
            ...Object.keys(breakdown1),
            ...Object.keys(breakdown2)
        ]);

        for (const type of allTypes) {
            const count1 = breakdown1[type]?.count || 0;
            const count2 = breakdown2[type]?.count || 0;
            const score1 = breakdown1[type]?.score || 0;
            const score2 = breakdown2[type]?.score || 0;

            if (count1 !== count2 || score1 !== score2) {
                changes[type] = {
                    countDelta: count2 - count1,
                    scoreDelta: score2 - score1
                };
            }
        }

        return changes;
    }

    /**
     * Get complexity statistics for multiple flows
     * @param {Array<Object>} complexities - Array of complexity results
     * @returns {Object} Statistics
     */
    getStatistics(complexities) {
        if (!complexities || complexities.length === 0) {
            return {
                count: 0,
                average: 0,
                median: 0,
                min: 0,
                max: 0,
                distribution: {}
            };
        }

        const scores = complexities.map(c => c.finalScore).sort((a, b) => a - b);

        const stats = {
            count: complexities.length,
            average: Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
            median: scores[Math.floor(scores.length / 2)],
            min: scores[0],
            max: scores[scores.length - 1],
            distribution: {}
        };

        // Calculate risk category distribution
        for (const complexity of complexities) {
            const category = complexity.riskCategory?.category || 'UNKNOWN';
            stats.distribution[category] = (stats.distribution[category] || 0) + 1;
        }

        return stats;
    }
}

module.exports = FlowComplexityCalculator;
module.exports.COMPLEXITY_WEIGHTS = COMPLEXITY_WEIGHTS;
module.exports.RISK_CATEGORIES = RISK_CATEGORIES;
module.exports.XML_ELEMENT_MAPPING = XML_ELEMENT_MAPPING;
