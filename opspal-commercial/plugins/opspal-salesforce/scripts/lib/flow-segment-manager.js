/**
 * Flow Segment Manager
 *
 * Orchestrates segment-by-segment flow building to prevent AI context overload
 * and keep flows maintainable. Tracks complexity budgets, validates segments,
 * and offers subflow extraction when thresholds are exceeded.
 *
 * @module flow-segment-manager
 * @version 1.0.0
 * @since salesforce-plugin@3.50.0
 *
 * Key Capabilities:
 * - Track segment boundaries and metadata
 * - Real-time complexity calculation per segment
 * - Budget enforcement and warnings
 * - Segment validation and completion checks
 * - Auto-detect segments exceeding thresholds
 * - Subflow extraction recommendations
 *
 * Usage:
 *   const SegmentManager = require('./flow-segment-manager');
 *   const manager = new SegmentManager(flowAuthor);
 *
 *   manager.startSegment('Validation', { type: 'validation', budget: 5 });
 *   const result = await manager.addElementToSegment('Add decision Status_Check...');
 *   if (result.budgetExceeded) {
 *     await manager.completeSegment({ validate: true });
 *   }
 */

const path = require('path');
const fs = require('fs').promises;

// Lazy load to avoid circular dependencies
let FlowComplexityCalculator;
let FlowValidator;
let FlowSegmentTemplates;
let FlowSubflowExtractor;

/**
 * Segment metadata structure
 * @typedef {Object} SegmentMetadata
 * @property {string} name - Segment name (e.g., "Validation_Segment")
 * @property {string} type - Segment type (validation, enrichment, routing, etc.)
 * @property {number} budget - Max complexity allowed in this segment
 * @property {number} currentComplexity - Current complexity score
 * @property {string} purpose - Human-readable purpose description
 * @property {Array<string>} dependencies - Names of segments this depends on
 * @property {Array<string>} elements - API names of elements in this segment
 * @property {Date} startedAt - When segment building started
 * @property {Date} completedAt - When segment was completed
 * @property {boolean} validated - Whether segment passed validation
 * @property {Object} validationResults - Validation results if validated
 */

/**
 * Segment status types
 * @enum {string}
 */
const SegmentStatus = {
    PLANNING: 'planning',      // Segment defined but not started
    IN_PROGRESS: 'in_progress', // Currently building
    COMPLETED: 'completed',     // Finished and validated
    EXTRACTED: 'extracted',    // Extracted as subflow
    IMPORTED: 'imported'       // Imported from existing flow (legacy segment)
};

// Special segment name for imported elements
const LEGACY_SEGMENT_NAME = 'Imported_Legacy';
const LEGACY_SEGMENT_TYPE = 'legacy';

/**
 * Segment types with default budgets
 * Based on empirical analysis of flow complexity patterns
 */
const DEFAULT_SEGMENT_BUDGETS = {
    validation: 5,      // Data validation with decisions (low complexity)
    enrichment: 8,      // Get Records + assignments (medium complexity)
    routing: 6,         // Decision trees and branching (medium complexity)
    notification: 4,    // Email/Chatter actions (low complexity)
    loopProcessing: 10, // Bulkified loops (high complexity)
    custom: 7           // Default for custom segments
};

/**
 * Complexity calculation weights
 * Aligned with flow-complexity-audit.js
 */
const COMPLEXITY_WEIGHTS = {
    decisions: 2,
    loops: 3,
    subflows: 2,
    actions: 1,
    assignments: 1,
    screens: 2,
    waits: 2,
    recordLookups: 2,
    recordUpdates: 1,
    recordCreates: 1,
    recordDeletes: 2,
    approvals: 3,
    customApex: 4,
    collections: 2,
    formulas: 1
};

/**
 * Warning thresholds as percentage of budget
 */
const WARNING_THRESHOLDS = {
    CAUTION: 0.7,  // 70% of budget - show caution
    CRITICAL: 0.9  // 90% of budget - strong warning
};

class SegmentManager {
    /**
     * Create a new SegmentManager
     * @param {FlowAuthor} flowAuthor - FlowAuthor instance to manage
     * @param {Object} options - Configuration options
     * @param {boolean} options.autoValidate - Validate segments on completion (default: true)
     * @param {boolean} options.strictMode - Fail hard on budget violations (default: false)
     * @param {number} options.defaultBudget - Default segment budget (default: 7)
     * @param {boolean} options.autoExtractSubflows - Auto-extract when threshold exceeded (default: false)
     * @param {number} options.extractionThreshold - Threshold for auto-extraction (default: 1.5 = 150%)
     */
    constructor(flowAuthor, options = {}) {
        this.flowAuthor = flowAuthor;
        this.options = {
            autoValidate: true,
            strictMode: false,
            defaultBudget: 7,
            autoExtractSubflows: false,
            extractionThreshold: 1.5,
            ...options
        };

        /** @type {Array<SegmentMetadata>} */
        this.segments = [];

        /** @type {SegmentMetadata|null} */
        this.currentSegment = null;

        /** @type {number} */
        this.totalFlowComplexity = 0;

        /** @type {Object} */
        this.history = {
            operations: [],
            checkpoints: []
        };

        this._initializeLazyDependencies();
    }

    /**
     * Lazy load dependencies to avoid circular requires
     * @private
     */
    _initializeLazyDependencies() {
        if (!FlowComplexityCalculator) {
            try {
                // Will implement after extracting from flow-complexity-audit.js
                FlowComplexityCalculator = require('./flow-complexity-calculator');
            } catch (err) {
                // Fallback to basic calculation if not yet available
                FlowComplexityCalculator = null;
            }
        }

        if (!FlowValidator) {
            try {
                FlowValidator = require('./flow-validator');
            } catch (err) {
                FlowValidator = null;
            }
        }

        if (!FlowSegmentTemplates) {
            try {
                FlowSegmentTemplates = require('./flow-segment-templates');
            } catch (err) {
                FlowSegmentTemplates = null;
            }
        }

        if (!FlowSubflowExtractor) {
            try {
                FlowSubflowExtractor = require('./flow-subflow-extractor');
            } catch (err) {
                FlowSubflowExtractor = null;
            }
        }
    }

    /**
     * Start a new segment
     * @param {string} name - Segment name (e.g., "Validation")
     * @param {Object} options - Segment options
     * @param {string} options.type - Segment type (validation, enrichment, etc.)
     * @param {number} options.budget - Max complexity for this segment
     * @param {string} options.purpose - Human-readable purpose
     * @param {Array<string>} options.dependencies - Segment dependencies
     * @returns {SegmentMetadata} Created segment metadata
     */
    startSegment(name, options = {}) {
        // Complete current segment if one is in progress
        if (this.currentSegment && this.currentSegment.status === SegmentStatus.IN_PROGRESS) {
            throw new Error(
                `Cannot start segment "${name}": segment "${this.currentSegment.name}" ` +
                `is still in progress. Complete it first with completeSegment().`
            );
        }

        // Normalize segment name
        const normalizedName = this._normalizeSegmentName(name);

        // Check for duplicate names
        if (this.segments.some(s => s.name === normalizedName)) {
            throw new Error(`Segment "${normalizedName}" already exists. Use a unique name.`);
        }

        // Determine segment type and budget
        const segmentType = options.type || 'custom';
        const budget = options.budget || DEFAULT_SEGMENT_BUDGETS[segmentType] || this.options.defaultBudget;

        // Load template if available
        let template = null;
        if (FlowSegmentTemplates && segmentType !== 'custom') {
            template = FlowSegmentTemplates.getTemplate(segmentType);
        }

        // Create segment metadata
        const segment = {
            name: normalizedName,
            type: segmentType,
            budget,
            currentComplexity: 0,
            purpose: options.purpose || template?.purpose || `${segmentType} segment`,
            dependencies: options.dependencies || [],
            elements: [],
            startedAt: new Date(),
            completedAt: null,
            status: SegmentStatus.IN_PROGRESS,
            validated: false,
            validationResults: null,
            template: template?.name || null
        };

        this.segments.push(segment);
        this.currentSegment = segment;

        // Create checkpoint
        this._createCheckpoint('segment_start', { segment: normalizedName });

        // Log operation
        this.history.operations.push({
            timestamp: new Date(),
            operation: 'startSegment',
            segment: normalizedName,
            type: segmentType,
            budget
        });

        return segment;
    }

    /**
     * Add an element to the current segment
     * @param {string} instruction - Natural language instruction or element XML
     * @param {Object} options - Add options
     * @param {boolean} options.dryRun - Calculate complexity without adding (default: false)
     * @param {boolean} options.force - Force add even if exceeds budget (default: false)
     * @returns {Promise<Object>} Result with complexity info and warnings
     */
    async addElementToSegment(instruction, options = {}) {
        if (!this.currentSegment) {
            throw new Error('No segment in progress. Start a segment with startSegment() first.');
        }

        if (this.currentSegment.status !== SegmentStatus.IN_PROGRESS) {
            throw new Error(
                `Segment "${this.currentSegment.name}" is ${this.currentSegment.status}. ` +
                `Cannot add elements.`
            );
        }

        // Calculate complexity impact of this instruction
        const complexityImpact = await this._calculateInstructionComplexity(instruction);
        const newComplexity = this.currentSegment.currentComplexity + complexityImpact.score;
        const budgetUsage = newComplexity / this.currentSegment.budget;

        // Build result object
        const result = {
            instruction,
            complexityImpact: complexityImpact.score,
            breakdown: complexityImpact.breakdown,
            currentComplexity: this.currentSegment.currentComplexity,
            newComplexity,
            budget: this.currentSegment.budget,
            budgetUsage: Math.round(budgetUsage * 100),
            budgetRemaining: this.currentSegment.budget - newComplexity,
            warnings: [],
            budgetExceeded: newComplexity > this.currentSegment.budget,
            shouldComplete: false,
            dryRun: options.dryRun || false
        };

        // Generate warnings based on budget usage
        if (budgetUsage >= WARNING_THRESHOLDS.CRITICAL) {
            result.warnings.push({
                level: 'critical',
                message: `🛑 CRITICAL: Segment at ${result.budgetUsage}% of budget. ` +
                         `Consider completing this segment now.`
            });
            result.shouldComplete = true;
        } else if (budgetUsage >= WARNING_THRESHOLDS.CAUTION) {
            result.warnings.push({
                level: 'caution',
                message: `⚠️  CAUTION: Segment at ${result.budgetUsage}% of budget. ` +
                         `Plan to complete soon.`
            });
        }

        // Check budget violation
        if (result.budgetExceeded) {
            const overBudget = newComplexity - this.currentSegment.budget;
            result.warnings.push({
                level: 'error',
                message: `❌ BUDGET EXCEEDED: Adding this element would exceed budget by ${overBudget} points. ` +
                         `Complete segment or increase budget.`
            });

            if (this.options.strictMode && !options.force) {
                throw new Error(
                    `Budget exceeded for segment "${this.currentSegment.name}". ` +
                    `New complexity (${newComplexity}) exceeds budget (${this.currentSegment.budget}). ` +
                    `Use force: true to override or complete the segment first.`
                );
            }
        }

        // If dry run, return without adding
        if (options.dryRun) {
            return result;
        }

        // Add element to flow (delegate to FlowAuthor)
        let addResult;
        try {
            addResult = await this.flowAuthor.addElement(instruction);
        } catch (error) {
            throw new Error(`Failed to add element to flow: ${error.message}`);
        }

        // Update segment metadata
        this.currentSegment.currentComplexity = newComplexity;
        this.currentSegment.elements.push(addResult.elementName || 'unknown');
        this.totalFlowComplexity += complexityImpact.score;

        // Log operation
        this.history.operations.push({
            timestamp: new Date(),
            operation: 'addElement',
            segment: this.currentSegment.name,
            instruction,
            complexityImpact: complexityImpact.score,
            newComplexity
        });

        // Merge results
        result.elementAdded = addResult;
        result.dryRun = false;

        return result;
    }

    /**
     * Complete the current segment
     * @param {Object} options - Completion options
     * @param {boolean} options.validate - Run validation (default: autoValidate setting)
     * @param {boolean} options.strict - Fail if validation errors (default: false)
     * @returns {Promise<Object>} Completion result
     */
    async completeSegment(options = {}) {
        if (!this.currentSegment) {
            throw new Error('No segment in progress to complete.');
        }

        if (this.currentSegment.status !== SegmentStatus.IN_PROGRESS) {
            throw new Error(
                `Segment "${this.currentSegment.name}" is already ${this.currentSegment.status}.`
            );
        }

        const segment = this.currentSegment;
        const shouldValidate = options.validate !== undefined
            ? options.validate
            : this.options.autoValidate;

        const result = {
            segment: segment.name,
            type: segment.type,
            complexity: segment.currentComplexity,
            budget: segment.budget,
            budgetUsage: Math.round((segment.currentComplexity / segment.budget) * 100),
            elementsAdded: segment.elements.length,
            duration: new Date() - segment.startedAt,
            validated: false,
            validationResults: null,
            warnings: [],
            errors: []
        };

        // Check if segment is under-utilized
        if (segment.currentComplexity < segment.budget * 0.3) {
            result.warnings.push({
                level: 'info',
                message: `Segment only used ${result.budgetUsage}% of budget. ` +
                         `Consider combining with adjacent segments if they have similar purpose.`
            });
        }

        // Run validation if requested
        if (shouldValidate && FlowValidator) {
            try {
                const validationResults = await this._validateSegment(segment);
                result.validated = true;
                result.validationResults = validationResults;
                segment.validated = true;
                segment.validationResults = validationResults;

                // Check for errors
                if (validationResults.errors && validationResults.errors.length > 0) {
                    result.errors = validationResults.errors;

                    if (options.strict) {
                        throw new Error(
                            `Segment validation failed with ${result.errors.length} error(s). ` +
                            `Fix errors before completing segment.`
                        );
                    }
                }
            } catch (error) {
                result.errors.push({
                    level: 'error',
                    message: `Validation failed: ${error.message}`
                });

                if (options.strict) {
                    throw error;
                }
            }
        }

        // Check for automatic subflow extraction (Phase 4.1)
        if (this.options.autoExtractSubflows && FlowSubflowExtractor) {
            try {
                const extractor = new FlowSubflowExtractor(this.flowAuthor, {
                    verbose: false,
                    defaultThreshold: this.options.extractionThreshold
                });

                const extractionCheck = extractor.shouldExtract(segment, this.options.extractionThreshold);

                if (extractionCheck.shouldExtract) {
                    result.warnings.push({
                        level: 'info',
                        message: `Segment exceeds extraction threshold (${Math.round(extractionCheck.budgetUsage * 100)}% > ${Math.round(extractionCheck.threshold * 100)}%). ` +
                                 `Consider extracting to subflow with: extractSegmentToSubflow('${segment.name}')`
                    });

                    // Auto-extract if option is set and not in dry-run
                    if (options.autoExtract) {
                        const extractionResult = await extractor.extractSegmentToSubflow(segment.name, {
                            threshold: this.options.extractionThreshold
                        });

                        if (extractionResult.extracted) {
                            result.extracted = true;
                            result.subflowName = extractionResult.subflowName;
                            result.subflowPath = extractionResult.subflowPath;
                            result.complexityReduction = extractionResult.complexityReduction;

                            result.warnings.push({
                                level: 'success',
                                message: `Segment automatically extracted to subflow: ${extractionResult.subflowName}. ` +
                                         `Complexity reduced by ${extractionResult.complexityReduction} points.`
                            });
                        }
                    }
                }
            } catch (error) {
                result.warnings.push({
                    level: 'warning',
                    message: `Subflow extraction check failed: ${error.message}`
                });
            }
        }

        // Update segment status
        segment.status = SegmentStatus.COMPLETED;
        segment.completedAt = new Date();
        this.currentSegment = null;

        // Create checkpoint
        this._createCheckpoint('segment_complete', {
            segment: segment.name,
            complexity: segment.currentComplexity
        });

        // Log operation
        this.history.operations.push({
            timestamp: new Date(),
            operation: 'completeSegment',
            segment: segment.name,
            complexity: segment.currentComplexity,
            validated: result.validated
        });

        return result;
    }

    /**
     * Get status of current segment
     * @returns {Object} Current segment status
     */
    getSegmentStatus() {
        if (!this.currentSegment) {
            return {
                hasActiveSegment: false,
                totalSegments: this.segments.length,
                completedSegments: this.segments.filter(s => s.status === SegmentStatus.COMPLETED).length,
                totalFlowComplexity: this.totalFlowComplexity
            };
        }

        const segment = this.currentSegment;
        const budgetUsage = segment.currentComplexity / segment.budget;

        return {
            hasActiveSegment: true,
            name: segment.name,
            type: segment.type,
            complexity: segment.currentComplexity,
            budget: segment.budget,
            budgetUsage: Math.round(budgetUsage * 100),
            budgetRemaining: segment.budget - segment.currentComplexity,
            elementsAdded: segment.elements.length,
            duration: new Date() - segment.startedAt,
            warnings: this._generateSegmentWarnings(segment),
            totalSegments: this.segments.length,
            completedSegments: this.segments.filter(s => s.status === SegmentStatus.COMPLETED).length,
            totalFlowComplexity: this.totalFlowComplexity
        };
    }

    /**
     * List all segments
     * @param {Object} options - Listing options
     * @param {string} options.status - Filter by status
     * @returns {Array<Object>} Segment summaries
     */
    listSegments(options = {}) {
        let segments = this.segments;

        // Filter by status if specified
        if (options.status) {
            segments = segments.filter(s => s.status === options.status);
        }

        return segments.map(segment => ({
            name: segment.name,
            type: segment.type,
            status: segment.status,
            complexity: segment.currentComplexity,
            budget: segment.budget,
            budgetUsage: Math.round((segment.currentComplexity / segment.budget) * 100),
            elementsAdded: segment.elements.length,
            validated: segment.validated,
            dependencies: segment.dependencies,
            startedAt: segment.startedAt,
            completedAt: segment.completedAt,
            duration: segment.completedAt
                ? segment.completedAt - segment.startedAt
                : new Date() - segment.startedAt
        }));
    }

    /**
     * Extract segment as subflow (Phase 4.1)
     * @param {string} segmentName - Name of segment to extract
     * @param {Object} options - Extraction options
     * @param {number} [options.threshold] - Extraction threshold (default: 1.5)
     * @param {string} [options.subflowName] - Custom subflow name
     * @param {string} [options.subflowLabel] - Custom subflow label
     * @param {boolean} [options.dryRun=false] - Preview without extracting
     * @param {boolean} [options.force=false] - Force extraction even if below threshold
     * @returns {Promise<Object>} Extraction result
     */
    async extractSegmentAsSubflow(segmentName, options = {}) {
        const segment = this.segments.find(s => s.name === segmentName);
        if (!segment) {
            throw new Error(`Segment "${segmentName}" not found.`);
        }

        if (segment.status !== SegmentStatus.COMPLETED) {
            throw new Error(
                `Segment "${segmentName}" must be completed before extraction. ` +
                `Current status: ${segment.status}`
            );
        }

        if (!FlowSubflowExtractor) {
            throw new Error('FlowSubflowExtractor not available. Ensure flow-subflow-extractor.js is present.');
        }

        const extractor = new FlowSubflowExtractor(this.flowAuthor, {
            verbose: options.verbose || false,
            defaultThreshold: options.threshold || this.options.extractionThreshold,
            subflowPrefix: options.subflowPrefix || 'SF_',
            subflowOutputDir: options.subflowOutputDir || './flows/subflows'
        });

        // Perform extraction
        const result = await extractor.extractSegmentToSubflow(segmentName, {
            threshold: options.threshold,
            subflowName: options.subflowName,
            subflowLabel: options.subflowLabel,
            dryRun: options.dryRun,
            force: options.force
        });

        // Update segment metadata if extraction succeeded
        if (result.extracted) {
            segment.extractedToSubflow = true;
            segment.subflowName = result.subflowName;
            segment.subflowPath = result.subflowPath;
            segment.complexityAfterExtraction = result.newComplexity;

            // Update total flow complexity
            this.totalFlowComplexity -= result.complexityReduction;

            // Log operation
            this.history.operations.push({
                timestamp: new Date(),
                operation: 'extractSegmentAsSubflow',
                segment: segmentName,
                subflowName: result.subflowName,
                complexityReduction: result.complexityReduction
            });
        }

        return result;
    }

    /**
     * Calculate complexity impact of an instruction
     * @param {string} instruction - Natural language instruction
     * @returns {Promise<Object>} Complexity score and breakdown
     * @private
     */
    async _calculateInstructionComplexity(instruction) {
        // Basic keyword-based complexity estimation
        // Will be enhanced with FlowComplexityCalculator in Phase 1.2

        const lowerInstruction = instruction.toLowerCase();
        let score = 0;
        const breakdown = {};

        // Decision elements
        if (lowerInstruction.includes('decision') || lowerInstruction.includes('if ')) {
            score += COMPLEXITY_WEIGHTS.decisions;
            breakdown.decisions = 1;
        }

        // Loop elements
        if (lowerInstruction.includes('loop') || lowerInstruction.includes('iterate')) {
            score += COMPLEXITY_WEIGHTS.loops;
            breakdown.loops = 1;
        }

        // Record operations
        if (lowerInstruction.includes('get records') || lowerInstruction.includes('record lookup')) {
            score += COMPLEXITY_WEIGHTS.recordLookups;
            breakdown.recordLookups = 1;
        }
        if (lowerInstruction.includes('create record')) {
            score += COMPLEXITY_WEIGHTS.recordCreates;
            breakdown.recordCreates = 1;
        }
        if (lowerInstruction.includes('update record')) {
            score += COMPLEXITY_WEIGHTS.recordUpdates;
            breakdown.recordUpdates = 1;
        }
        if (lowerInstruction.includes('delete record')) {
            score += COMPLEXITY_WEIGHTS.recordDeletes;
            breakdown.recordDeletes = 1;
        }

        // Actions
        if (lowerInstruction.includes('action') || lowerInstruction.includes('invoke')) {
            score += COMPLEXITY_WEIGHTS.actions;
            breakdown.actions = 1;
        }

        // Assignments
        if (lowerInstruction.includes('assignment') || lowerInstruction.includes('set ')) {
            score += COMPLEXITY_WEIGHTS.assignments;
            breakdown.assignments = 1;
        }

        // Subflows
        if (lowerInstruction.includes('subflow') || lowerInstruction.includes('call flow')) {
            score += COMPLEXITY_WEIGHTS.subflows;
            breakdown.subflows = 1;
        }

        // Screens
        if (lowerInstruction.includes('screen')) {
            score += COMPLEXITY_WEIGHTS.screens;
            breakdown.screens = 1;
        }

        // Waits
        if (lowerInstruction.includes('wait')) {
            score += COMPLEXITY_WEIGHTS.waits;
            breakdown.waits = 1;
        }

        // Approvals
        if (lowerInstruction.includes('approval')) {
            score += COMPLEXITY_WEIGHTS.approvals;
            breakdown.approvals = 1;
        }

        // Apex
        if (lowerInstruction.includes('apex') || lowerInstruction.includes('custom action')) {
            score += COMPLEXITY_WEIGHTS.customApex;
            breakdown.customApex = 1;
        }

        // Default if nothing matched
        if (score === 0) {
            score = 1;
            breakdown.default = 1;
        }

        return { score, breakdown };
    }

    /**
     * Validate a segment
     * @param {SegmentMetadata} segment - Segment to validate
     * @returns {Promise<Object>} Validation results
     * @private
     */
    async _validateSegment(segment) {
        // Phase 2.2: Enhanced segment validation with FlowValidator integration
        const results = {
            segment: segment.name,
            passed: true,
            errors: [],
            warnings: [],
            info: []
        };

        // Basic validations
        if (segment.elements.length === 0) {
            results.warnings.push({
                level: 'warning',
                message: 'Segment has no elements. Consider removing empty segment.'
            });
        }

        if (segment.currentComplexity > segment.budget) {
            results.errors.push({
                level: 'error',
                message: `Segment complexity (${segment.currentComplexity}) exceeds budget (${segment.budget}).`
            });
            results.passed = false;
        }

        // If FlowValidator is available, use segment-specific validation
        if (FlowValidator) {
            try {
                // Get flow XML from FlowAuthor
                const flowXML = await this.flowAuthor.getCurrentFlowXML();
                if (flowXML) {
                    const validator = new FlowValidator({ verbose: false });
                    const parser = require('xml2js').Parser();
                    const flowData = await parser.parseStringPromise(flowXML);
                    const flow = flowData.Flow || {};

                    // Run segment-specific validation
                    const segmentValidation = await validator.validateSegment(flow, segment);

                    // Merge validation results
                    if (!segmentValidation.valid) {
                        results.passed = false;
                    }

                    if (segmentValidation.errors) {
                        results.errors.push(...segmentValidation.errors);
                    }

                    if (segmentValidation.warnings) {
                        results.warnings.push(...segmentValidation.warnings);
                    }

                    if (segmentValidation.info) {
                        results.info.push(...segmentValidation.info);
                    }
                }
            } catch (error) {
                results.warnings.push({
                    level: 'warning',
                    message: `Could not run detailed segment validation: ${error.message}`
                });
            }
        }

        return results;
    }

    /**
     * Generate warnings for current segment state
     * @param {SegmentMetadata} segment - Segment to analyze
     * @returns {Array<Object>} Warnings
     * @private
     */
    _generateSegmentWarnings(segment) {
        const warnings = [];
        const budgetUsage = segment.currentComplexity / segment.budget;

        if (budgetUsage >= WARNING_THRESHOLDS.CRITICAL) {
            warnings.push({
                level: 'critical',
                message: `Segment at ${Math.round(budgetUsage * 100)}% of budget. Complete segment soon.`
            });
        } else if (budgetUsage >= WARNING_THRESHOLDS.CAUTION) {
            warnings.push({
                level: 'caution',
                message: `Segment at ${Math.round(budgetUsage * 100)}% of budget. Plan completion.`
            });
        }

        return warnings;
    }

    /**
     * Normalize segment name
     * @param {string} name - Raw segment name
     * @returns {string} Normalized name
     * @private
     */
    _normalizeSegmentName(name) {
        // Convert to PascalCase with underscores
        return name
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('_');
    }

    /**
     * Create a checkpoint for rollback
     * @param {string} type - Checkpoint type
     * @param {Object} metadata - Checkpoint metadata
     * @private
     */
    _createCheckpoint(type, metadata) {
        this.history.checkpoints.push({
            timestamp: new Date(),
            type,
            metadata,
            segmentCount: this.segments.length,
            totalComplexity: this.totalFlowComplexity
        });
    }

    /**
     * Serialize segment manager state
     * @returns {Object} Serialized state
     */
    toJSON() {
        return {
            segments: this.segments,
            currentSegment: this.currentSegment,
            totalFlowComplexity: this.totalFlowComplexity,
            options: this.options,
            history: this.history
        };
    }

    /**
     * Restore segment manager from serialized state
     * @param {Object} state - Serialized state
     * @param {FlowAuthor} flowAuthor - FlowAuthor instance
     * @returns {SegmentManager} Restored manager
     */
    static fromJSON(state, flowAuthor) {
        const manager = new SegmentManager(flowAuthor, state.options);
        manager.segments = state.segments;
        manager.currentSegment = state.currentSegment;
        manager.totalFlowComplexity = state.totalFlowComplexity;
        manager.history = state.history;
        return manager;
    }

    // ========================================================================
    // EXISTING FLOW SUPPORT (Phase 3.65.0)
    // Methods for handling flows loaded from the org
    // ========================================================================

    /**
     * Initialize segment manager from a loaded flow (not a new flow)
     * Creates "Segment 0: Imported Legacy" containing all existing elements
     * and optionally analyzes for segment suggestions.
     *
     * @param {Object} options - Initialization options
     * @param {boolean} options.analyzeForSegmentation - Run auto-detection (default: true)
     * @param {boolean} options.createLegacySegment - Create Segment 0 (default: true)
     * @param {boolean} options.validateOnInit - Run validation immediately (default: true)
     * @returns {Promise<Object>} Initialization result
     */
    async initializeFromLoadedFlow(options = {}) {
        const config = {
            analyzeForSegmentation: true,
            createLegacySegment: true,
            validateOnInit: true,
            ...options
        };

        const result = {
            legacySegment: null,
            analysis: null,
            suggestedSegments: [],
            validationResult: null,
            initialized: true
        };

        // Get existing elements from the flow
        const existingElements = this._getExistingElements();
        if (existingElements.length === 0) {
            return result; // Empty flow, nothing to do
        }

        // Create legacy segment for existing elements
        if (config.createLegacySegment) {
            result.legacySegment = this.importLegacySegment({
                elements: existingElements,
                budgetMultiplier: options.budgetMultiplier || 1.2
            });
        }

        // Run auto-detection if requested
        if (config.analyzeForSegmentation) {
            try {
                const FlowSegmentAnalyzer = require('./flow-segment-analyzer');
                const analyzer = new FlowSegmentAnalyzer(this.flowAuthor, {
                    verbose: this.options.verbose
                });
                result.analysis = await analyzer.analyzeFlowStructure();
                result.suggestedSegments = result.analysis.suggestedSegments || [];
            } catch (err) {
                // Analyzer not available
                console.warn(`[SegmentManager] FlowSegmentAnalyzer not available: ${err.message}`);
            }
        }

        // Run validation if requested
        if (config.validateOnInit && FlowValidator) {
            try {
                const validator = new FlowValidator({ verbose: this.options.verbose });
                result.validationResult = await validator.validate(
                    this.flowAuthor.currentFlowPath,
                    ['critical', 'bestPractices']
                );
            } catch (err) {
                console.warn(`[SegmentManager] Validation failed: ${err.message}`);
            }
        }

        // Log operation
        this.history.operations.push({
            timestamp: new Date(),
            operation: 'initializeFromLoadedFlow',
            elementCount: existingElements.length,
            legacySegmentCreated: !!result.legacySegment,
            suggestedSegmentCount: result.suggestedSegments.length
        });

        return result;
    }

    /**
     * Import all existing elements into "Segment 0: Imported Legacy"
     *
     * @param {Object} options - Import options
     * @param {Array} options.elements - Elements to import (or auto-detect)
     * @param {number} options.budgetMultiplier - Multiplier for calculated budget (default: 1.2)
     * @returns {Object} Created legacy segment
     */
    importLegacySegment(options = {}) {
        // Get elements if not provided
        const elements = options.elements || this._getExistingElements();
        if (elements.length === 0) {
            return null;
        }

        // Calculate complexity of existing elements
        const complexity = this._calculateElementsComplexity(elements);

        // Set budget as complexity * multiplier (give some headroom)
        const budgetMultiplier = options.budgetMultiplier || 1.2;
        const budget = Math.max(
            Math.ceil(complexity * budgetMultiplier),
            this.options.defaultBudget
        );

        // Create the legacy segment
        const legacySegment = {
            name: LEGACY_SEGMENT_NAME,
            type: LEGACY_SEGMENT_TYPE,
            budget,
            currentComplexity: complexity,
            purpose: 'Pre-existing flow elements imported for segmentation',
            dependencies: [],
            elements: elements.map(e => e.name || e),
            startedAt: new Date(),
            completedAt: new Date(), // Already complete
            status: SegmentStatus.IMPORTED,
            validated: false,
            validationResults: null,
            template: null,
            isLegacy: true
        };

        // Add to segments array at the beginning
        this.segments.unshift(legacySegment);

        // Update total complexity
        this.totalFlowComplexity = complexity;

        // Create checkpoint
        this._createCheckpoint('legacy_import', {
            elementCount: elements.length,
            complexity
        });

        // Log operation
        this.history.operations.push({
            timestamp: new Date(),
            operation: 'importLegacySegment',
            elementCount: elements.length,
            complexity,
            budget
        });

        return legacySegment;
    }

    /**
     * Apply suggested segments from analyzer
     * Partitions elements from legacy segment into suggested segments
     *
     * @param {Array<Object>} suggestions - Suggested segments from analyzer
     * @param {Object} options - Application options
     * @param {boolean} options.keepLegacySegment - Keep Segment 0 for unclassified elements (default: true)
     * @param {boolean} options.requireConfirmation - Require user confirmation (default: false)
     * @returns {Promise<Object>} Application result
     */
    async applySuggestedSegments(suggestions, options = {}) {
        const config = {
            keepLegacySegment: true,
            requireConfirmation: false,
            ...options
        };

        const result = {
            appliedSegments: [],
            movedElements: new Map(),
            unassignedElements: [],
            totalComplexityReduction: 0
        };

        // Find the legacy segment
        const legacySegment = this.segments.find(s => s.name === LEGACY_SEGMENT_NAME);
        if (!legacySegment) {
            throw new Error('No legacy segment found. Call initializeFromLoadedFlow() first.');
        }

        const legacyElements = new Set(legacySegment.elements);

        // Process each suggestion
        for (const suggestion of suggestions) {
            // Skip if no elements
            if (!suggestion.elements || suggestion.elements.length === 0) continue;

            // Filter to elements that exist in legacy segment
            const validElements = suggestion.elements.filter(e => legacyElements.has(e));
            if (validElements.length === 0) continue;

            // Create the new segment
            const newSegment = {
                name: suggestion.name,
                type: suggestion.type,
                budget: suggestion.suggestedBudget,
                currentComplexity: suggestion.calculatedComplexity || 0,
                purpose: suggestion.description || `${suggestion.type} segment`,
                dependencies: [],
                elements: validElements,
                startedAt: new Date(),
                completedAt: new Date(),
                status: SegmentStatus.COMPLETED,
                validated: false,
                validationResults: null,
                template: null,
                confidenceScore: suggestion.confidenceScore,
                reason: suggestion.reason
            };

            // Remove elements from legacy segment
            for (const element of validElements) {
                legacyElements.delete(element);
                result.movedElements.set(element, suggestion.name);
            }

            // Add to segments
            this.segments.push(newSegment);
            result.appliedSegments.push(newSegment);
        }

        // Update legacy segment
        legacySegment.elements = Array.from(legacyElements);
        legacySegment.currentComplexity = this._calculateElementsComplexity(
            legacySegment.elements.map(name => ({ name }))
        );

        // Remove legacy segment if empty and not keeping
        if (legacySegment.elements.length === 0 && !config.keepLegacySegment) {
            const legacyIndex = this.segments.findIndex(s => s.name === LEGACY_SEGMENT_NAME);
            if (legacyIndex >= 0) {
                this.segments.splice(legacyIndex, 1);
            }
        } else {
            result.unassignedElements = legacySegment.elements;
        }

        // Log operation
        this.history.operations.push({
            timestamp: new Date(),
            operation: 'applySuggestedSegments',
            appliedCount: result.appliedSegments.length,
            movedElements: result.movedElements.size,
            unassignedElements: result.unassignedElements.length
        });

        return result;
    }

    /**
     * Reassign an element from one segment to another
     * Used during interactive partition mode
     *
     * @param {string} elementName - Element to move
     * @param {string} fromSegment - Source segment name
     * @param {string} toSegment - Target segment name
     * @returns {Object} Move result with complexity impact
     */
    reassignElement(elementName, fromSegment, toSegment) {
        // Find source segment
        const source = this.segments.find(s => s.name === fromSegment);
        if (!source) {
            throw new Error(`Source segment not found: ${fromSegment}`);
        }

        // Find target segment
        const target = this.segments.find(s => s.name === toSegment);
        if (!target) {
            throw new Error(`Target segment not found: ${toSegment}`);
        }

        // Check element exists in source
        const elementIndex = source.elements.indexOf(elementName);
        if (elementIndex < 0) {
            throw new Error(`Element "${elementName}" not found in segment "${fromSegment}"`);
        }

        // Get element complexity
        const elementComplexity = this._getElementComplexity(elementName);

        // Move element
        source.elements.splice(elementIndex, 1);
        target.elements.push(elementName);

        // Update complexities
        source.currentComplexity -= elementComplexity;
        target.currentComplexity += elementComplexity;

        // Calculate budget status
        const getBudgetStatus = (segment) => {
            const usage = segment.currentComplexity / segment.budget;
            if (usage <= WARNING_THRESHOLDS.CAUTION) return 'healthy';
            if (usage <= WARNING_THRESHOLDS.CRITICAL) return 'caution';
            if (usage <= 1.0) return 'critical';
            return 'exceeded';
        };

        const result = {
            moved: true,
            element: elementName,
            from: fromSegment,
            to: toSegment,
            complexityDelta: {
                from: -elementComplexity,
                to: elementComplexity
            },
            budgetStatus: {
                from: getBudgetStatus(source),
                to: getBudgetStatus(target)
            }
        };

        // Log operation
        this.history.operations.push({
            timestamp: new Date(),
            operation: 'reassignElement',
            ...result
        });

        return result;
    }

    /**
     * Get existing elements from the flow
     * @returns {Array<Object>} Elements with names and types
     * @private
     */
    _getExistingElements() {
        if (!this.flowAuthor?.currentFlow) {
            return [];
        }

        const elements = [];
        const flow = this.flowAuthor.currentFlow;
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
                            label: element.label || element.name
                        });
                    }
                }
            }
        }

        return elements;
    }

    /**
     * Calculate complexity for a list of elements
     * @param {Array<Object>} elements - Elements with type info
     * @returns {number} Total complexity
     * @private
     */
    _calculateElementsComplexity(elements) {
        let complexity = 0;
        for (const element of elements) {
            const weight = COMPLEXITY_WEIGHTS[element.type] || 1;
            complexity += weight;
        }
        return complexity;
    }

    /**
     * Get complexity for a single element by name
     * @param {string} elementName - Element name
     * @returns {number} Element complexity
     * @private
     */
    _getElementComplexity(elementName) {
        const elements = this._getExistingElements();
        const element = elements.find(e => e.name === elementName);
        if (!element) return 1; // Default
        return COMPLEXITY_WEIGHTS[element.type] || 1;
    }
}

module.exports = SegmentManager;
module.exports.SegmentStatus = SegmentStatus;
module.exports.DEFAULT_SEGMENT_BUDGETS = DEFAULT_SEGMENT_BUDGETS;
module.exports.COMPLEXITY_WEIGHTS = COMPLEXITY_WEIGHTS;
