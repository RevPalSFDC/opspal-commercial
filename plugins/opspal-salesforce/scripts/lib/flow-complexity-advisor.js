/**
 * Flow Complexity Advisor
 *
 * Provides intelligent guidance on whether segmentation is beneficial
 * for a given flow based on complexity analysis. Helps prevent overhead
 * for simple flows while recommending segmentation for complex ones.
 *
 * @module flow-complexity-advisor
 * @version 1.0.0
 * @since salesforce-plugin@3.65.0
 *
 * Key Capabilities:
 * - Analyze flow complexity and recommend editing mode
 * - Provide threshold-based segmentation guidance
 * - Support org-specific threshold customization
 * - Generate user-friendly guidance messages
 *
 * Usage:
 *   const FlowComplexityAdvisor = require('./flow-complexity-advisor');
 *   const advisor = new FlowComplexityAdvisor();
 *
 *   const analysis = await advisor.analyzeForSegmentation('./MyFlow.flow-meta.xml');
 *   if (analysis.shouldSegment) {
 *     // Recommend segmentation mode
 *   } else {
 *     // Suggest simple edit mode
 *   }
 */

const fs = require('fs').promises;
const path = require('path');
const FlowComplexityCalculator = require('./flow-complexity-calculator');

/**
 * Default complexity thresholds
 * Based on empirical analysis of flow maintenance patterns
 */
const DEFAULT_THRESHOLDS = {
    SEGMENTATION: 10,  // Min complexity to recommend segmentation
    SIMPLE_MODE: 5,    // Max complexity for Simple Edit Mode
    STANDARD: { min: 6, max: 9 }  // Standard mode range
};

/**
 * Editing mode recommendations
 */
const EDITING_MODES = {
    SIMPLE: {
        name: 'Simple Edit Mode',
        key: 'simple',
        maxComplexity: 5,
        description: 'Direct flow editing without segmentation overhead. Best for small flows with minimal complexity.',
        benefits: [
            'Faster edits with minimal validation',
            'No budget tracking overhead',
            'Single rollback point for easy undo',
            'Quick 4-stage validation'
        ]
    },
    STANDARD: {
        name: 'Standard Mode',
        key: 'standard',
        minComplexity: 6,
        maxComplexity: 9,
        description: 'Normal editing with optional segmentation. Good balance for medium-complexity flows.',
        benefits: [
            'Full validation pipeline available',
            'Optional segmentation if needed',
            'Flexible for various use cases'
        ]
    },
    SEGMENTED: {
        name: 'Segmentation Mode',
        key: 'segmentation',
        minComplexity: 10,
        description: 'Segment-by-segment building with complexity budgets. Essential for complex flows.',
        benefits: [
            'Prevents context overload',
            'Budget enforcement catches issues early',
            'Auto-subflow extraction when needed',
            'Template-driven best practices'
        ]
    }
};

class FlowComplexityAdvisor {
    /**
     * Create a new FlowComplexityAdvisor
     * @param {Object} options - Configuration options
     * @param {Object} options.thresholds - Custom complexity thresholds
     * @param {boolean} options.verbose - Enable verbose logging
     */
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.thresholds = {
            ...DEFAULT_THRESHOLDS,
            ...(options.thresholds || {})
        };
        this.calculator = new FlowComplexityCalculator();
        this.orgThresholds = new Map(); // Cache for org-specific thresholds
    }

    /**
     * Log message if verbose mode is enabled
     * @param {string} message - Message to log
     * @private
     */
    _log(message) {
        if (this.verbose) {
            console.log(`[FlowComplexityAdvisor] ${message}`);
        }
    }

    /**
     * Analyze a flow and determine if segmentation is beneficial
     * @param {string} flowXMLOrPath - Flow XML content or file path
     * @param {Object} options - Analysis options
     * @param {string} options.orgAlias - Org alias for org-specific thresholds
     * @returns {Promise<Object>} Analysis result with recommendations
     */
    async analyzeForSegmentation(flowXMLOrPath, options = {}) {
        this._log(`Analyzing flow for segmentation: ${typeof flowXMLOrPath === 'string' && flowXMLOrPath.endsWith('.xml') ? flowXMLOrPath : 'XML content'}`);

        // Load thresholds (org-specific if available)
        const thresholds = options.orgAlias
            ? await this.loadOrgThresholds(options.orgAlias)
            : this.thresholds;

        // Get flow XML
        let flowXML = flowXMLOrPath;
        let flowPath = null;
        if (typeof flowXMLOrPath === 'string' && flowXMLOrPath.endsWith('.xml')) {
            flowPath = flowXMLOrPath;
            flowXML = await fs.readFile(flowXMLOrPath, 'utf8');
        }

        // Calculate complexity
        const complexity = await this.calculator.calculateFromXML(flowXML);

        // Determine recommended mode
        const recommendedMode = this.getRecommendedMode(complexity.finalScore, thresholds);
        const shouldSegment = this.shouldSegment(complexity.finalScore, thresholds);

        // Build analysis result
        const result = {
            complexity: complexity.finalScore,
            complexityBreakdown: complexity.breakdown,
            riskCategory: complexity.riskCategory,
            riskFactors: complexity.riskFactors,
            shouldSegment,
            recommendedMode: recommendedMode.key,
            modeDetails: recommendedMode,
            thresholds: {
                segmentation: thresholds.SEGMENTATION || DEFAULT_THRESHOLDS.SEGMENTATION,
                simpleMode: thresholds.SIMPLE_MODE || DEFAULT_THRESHOLDS.SIMPLE_MODE
            },
            recommendation: this._generateRecommendation(complexity.finalScore, recommendedMode, shouldSegment),
            guidance: this.formatGuidanceMessage({
                complexity: complexity.finalScore,
                mode: recommendedMode,
                shouldSegment,
                thresholds
            }),
            flowPath
        };

        this._log(`Analysis complete: complexity=${result.complexity}, mode=${result.recommendedMode}`);
        return result;
    }

    /**
     * Determine if segmentation should be used based on complexity
     * @param {number} complexity - Flow complexity score
     * @param {Object} thresholds - Thresholds to use
     * @returns {boolean} Whether segmentation is recommended
     */
    shouldSegment(complexity, thresholds = this.thresholds) {
        const threshold = thresholds.SEGMENTATION || DEFAULT_THRESHOLDS.SEGMENTATION;
        return complexity >= threshold;
    }

    /**
     * Get the recommended editing mode based on complexity
     * @param {number} complexity - Flow complexity score
     * @param {Object} thresholds - Thresholds to use
     * @returns {Object} Recommended editing mode details
     */
    getRecommendedMode(complexity, thresholds = this.thresholds) {
        const simpleThreshold = thresholds.SIMPLE_MODE || DEFAULT_THRESHOLDS.SIMPLE_MODE;
        const segmentationThreshold = thresholds.SEGMENTATION || DEFAULT_THRESHOLDS.SEGMENTATION;

        if (complexity <= simpleThreshold) {
            return EDITING_MODES.SIMPLE;
        } else if (complexity >= segmentationThreshold) {
            return EDITING_MODES.SEGMENTED;
        } else {
            return EDITING_MODES.STANDARD;
        }
    }

    /**
     * Generate a recommendation string based on analysis
     * @param {number} complexity - Flow complexity score
     * @param {Object} mode - Recommended mode
     * @param {boolean} shouldSegment - Whether segmentation is recommended
     * @returns {string} Recommendation message
     * @private
     */
    _generateRecommendation(complexity, mode, shouldSegment) {
        if (mode.key === 'simple') {
            return `This flow has low complexity (${complexity} points). Segmentation is not recommended. Use Simple Edit Mode for faster, lightweight edits.`;
        } else if (mode.key === 'segmentation') {
            return `This flow has high complexity (${complexity} points). Segmentation is strongly recommended to prevent context overload and ensure maintainability.`;
        } else {
            return `This flow has moderate complexity (${complexity} points). Segmentation is optional but may help organize larger modifications.`;
        }
    }

    /**
     * Format a user-friendly guidance message for display
     * @param {Object} params - Parameters for message formatting
     * @returns {string} Formatted guidance message
     */
    formatGuidanceMessage(params) {
        const { complexity, mode, shouldSegment, thresholds } = params;
        const segThreshold = thresholds?.SEGMENTATION || DEFAULT_THRESHOLDS.SEGMENTATION;

        const lines = [
            `Flow Complexity Analysis`,
            `========================`,
            ``,
            `Complexity Score: ${complexity}/${segThreshold} (threshold for segmentation)`,
            `Recommended Mode: ${mode.name}`,
            ``
        ];

        if (!shouldSegment) {
            lines.push(
                `This flow is simple enough that segmentation might not be beneficial.`,
                ``,
                `Options:`,
                `  1. Use Simple Edit Mode (recommended for quick changes)`,
                `  2. Continue with Segmentation Mode anyway`,
                `  3. View complexity breakdown`,
                ``
            );
        } else {
            lines.push(
                `Segmentation is recommended for this flow to prevent complexity issues.`,
                ``,
                `Benefits of Segmentation:`,
                ...mode.benefits.map(b => `  - ${b}`),
                ``
            );
        }

        return lines.join('\n');
    }

    /**
     * Load org-specific thresholds if available
     * @param {string} orgAlias - Salesforce org alias
     * @returns {Promise<Object>} Org thresholds or defaults
     */
    async loadOrgThresholds(orgAlias) {
        // Check cache first
        if (this.orgThresholds.has(orgAlias)) {
            return this.orgThresholds.get(orgAlias);
        }

        // Try to load from org config file
        const configPaths = [
            `./instances/${orgAlias}/flow-config.json`,
            `./.claude/instances/${orgAlias}/flow-config.json`,
            `./config/orgs/${orgAlias}/flow-config.json`
        ];

        for (const configPath of configPaths) {
            try {
                const configContent = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configContent);

                if (config.segmentation_thresholds) {
                    const thresholds = {
                        SEGMENTATION: config.segmentation_thresholds.segmentation || DEFAULT_THRESHOLDS.SEGMENTATION,
                        SIMPLE_MODE: config.segmentation_thresholds.simple_mode || DEFAULT_THRESHOLDS.SIMPLE_MODE
                    };

                    this.orgThresholds.set(orgAlias, thresholds);
                    this._log(`Loaded org thresholds from ${configPath}`);
                    return thresholds;
                }
            } catch (err) {
                // File not found or invalid, continue to next path
            }
        }

        // Return defaults if no org-specific config found
        this._log(`No org-specific thresholds found for ${orgAlias}, using defaults`);
        return this.thresholds;
    }

    /**
     * Save org-specific thresholds
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} thresholds - Thresholds to save
     * @returns {Promise<void>}
     */
    async saveOrgThresholds(orgAlias, thresholds) {
        const configDir = `./instances/${orgAlias}`;
        const configPath = path.join(configDir, 'flow-config.json');

        // Ensure directory exists
        await fs.mkdir(configDir, { recursive: true });

        // Load existing config or create new
        let config = {};
        try {
            const existing = await fs.readFile(configPath, 'utf8');
            config = JSON.parse(existing);
        } catch (err) {
            // File doesn't exist, create new config
        }

        // Update thresholds
        config.segmentation_thresholds = {
            segmentation: thresholds.SEGMENTATION || DEFAULT_THRESHOLDS.SEGMENTATION,
            simple_mode: thresholds.SIMPLE_MODE || DEFAULT_THRESHOLDS.SIMPLE_MODE,
            calculated_at: new Date().toISOString()
        };

        // Save
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        // Update cache
        this.orgThresholds.set(orgAlias, {
            SEGMENTATION: config.segmentation_thresholds.segmentation,
            SIMPLE_MODE: config.segmentation_thresholds.simple_mode
        });

        this._log(`Saved org thresholds for ${orgAlias}`);
    }

    /**
     * Calculate recommended thresholds based on org's existing flows
     * @param {string} orgAlias - Salesforce org alias
     * @param {string[]} flowPaths - Paths to org's flow files
     * @returns {Promise<Object>} Calculated thresholds with statistics
     */
    async calculateOrgThresholds(orgAlias, flowPaths) {
        if (!flowPaths || flowPaths.length === 0) {
            this._log(`No flows provided for ${orgAlias}, returning defaults`);
            return {
                thresholds: DEFAULT_THRESHOLDS,
                metrics: null
            };
        }

        // Calculate complexity for all flows
        const complexities = [];
        for (const flowPath of flowPaths) {
            try {
                const flowXML = await fs.readFile(flowPath, 'utf8');
                const result = await this.calculator.calculateFromXML(flowXML);
                complexities.push(result.finalScore);
            } catch (err) {
                this._log(`Skipping ${flowPath}: ${err.message}`);
            }
        }

        if (complexities.length === 0) {
            return {
                thresholds: DEFAULT_THRESHOLDS,
                metrics: null
            };
        }

        // Calculate statistics
        const sorted = [...complexities].sort((a, b) => a - b);
        const avg = complexities.reduce((a, b) => a + b, 0) / complexities.length;
        const median = this._calculateMedian(sorted);
        const p75 = this._calculatePercentile(sorted, 75);
        const p90 = this._calculatePercentile(sorted, 90);

        // Recommend thresholds based on org patterns
        const thresholds = {
            SEGMENTATION: Math.max(10, Math.round(p75)),
            SIMPLE_MODE: Math.max(5, Math.round(avg * 0.5)),
            STANDARD: {
                min: Math.max(5, Math.round(avg * 0.5)) + 1,
                max: Math.max(10, Math.round(p75)) - 1
            }
        };

        const metrics = {
            flowCount: complexities.length,
            averageComplexity: Math.round(avg * 10) / 10,
            medianComplexity: median,
            p75Complexity: p75,
            p90Complexity: p90,
            minComplexity: Math.min(...complexities),
            maxComplexity: Math.max(...complexities)
        };

        return { thresholds, metrics };
    }

    /**
     * Calculate median of sorted array
     * @param {number[]} sorted - Sorted array of numbers
     * @returns {number} Median value
     * @private
     */
    _calculateMedian(sorted) {
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Calculate percentile of sorted array
     * @param {number[]} sorted - Sorted array of numbers
     * @param {number} percentile - Percentile to calculate (0-100)
     * @returns {number} Percentile value
     * @private
     */
    _calculatePercentile(sorted, percentile) {
        const index = Math.ceil(percentile / 100 * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
    }

    /**
     * Check if a flow's complexity is below the threshold for segmentation
     * Useful for quick checks before enabling segmentation
     * @param {string} flowXMLOrPath - Flow XML content or file path
     * @param {Object} options - Options
     * @returns {Promise<Object>} Quick check result
     */
    async quickCheck(flowXMLOrPath, options = {}) {
        const analysis = await this.analyzeForSegmentation(flowXMLOrPath, options);

        return {
            complexity: analysis.complexity,
            belowThreshold: !analysis.shouldSegment,
            recommendedMode: analysis.recommendedMode,
            message: analysis.shouldSegment
                ? null
                : `This flow is simple enough (${analysis.complexity}/${analysis.thresholds.segmentation}) that segmentation might not be beneficial.`
        };
    }

    /**
     * Get available editing modes
     * @returns {Object} Available editing modes
     */
    static get MODES() {
        return EDITING_MODES;
    }

    /**
     * Get default thresholds
     * @returns {Object} Default thresholds
     */
    static get DEFAULT_THRESHOLDS() {
        return DEFAULT_THRESHOLDS;
    }
}

module.exports = FlowComplexityAdvisor;
