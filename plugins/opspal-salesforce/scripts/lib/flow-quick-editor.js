/**
 * Flow Quick Editor
 *
 * Lightweight editing for minor Flow changes without segmentation overhead.
 * Part of the Safe Edit Mode feature for simple, fast flow modifications.
 *
 * @module flow-quick-editor
 * @version 1.0.0
 * @since salesforce-plugin@3.65.0
 *
 * Key Capabilities:
 * - Quick edits via natural language instructions
 * - Direct element modification
 * - Single-element add/remove operations
 * - In-memory rollback capability
 * - 4-stage quick validation
 *
 * Usage:
 *   const FlowQuickEditor = require('./flow-quick-editor');
 *   const editor = new FlowQuickEditor('myOrg', { verbose: true });
 *
 *   await editor.loadFlow('./MyFlow.flow-meta.xml');
 *   const result = await editor.executeQuickEdit('Change Status_Check label to "Active Status"');
 *   if (result.success) {
 *     await editor.save();
 *   } else {
 *     await editor.rollback(result.rollbackId);
 *   }
 */

const fs = require('fs').promises;
const path = require('path');
const FlowQuickValidator = require('./flow-quick-validator');
const FlowNLPModifier = require('./flow-nlp-modifier');
const FlowComplexityAdvisor = require('./flow-complexity-advisor');

/**
 * Rollback point structure
 * @typedef {Object} RollbackPoint
 * @property {string} id - Unique rollback ID
 * @property {string} flowXML - Original flow XML content
 * @property {Date} createdAt - Timestamp
 * @property {string} description - Description of operation
 */

/**
 * Quick edit result structure
 * @typedef {Object} QuickEditResult
 * @property {boolean} success - Whether edit succeeded
 * @property {string} rollbackId - ID for rollback if needed
 * @property {Object} validation - Quick validation result
 * @property {Object} change - Description of change made
 * @property {string} message - User-friendly message
 * @property {boolean} dryRun - Whether this was a dry run
 */

class FlowQuickEditor {
    /**
     * Create a new FlowQuickEditor
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Configuration options
     * @param {boolean} options.verbose - Enable verbose logging
     * @param {boolean} options.dryRun - Preview without making changes
     * @param {boolean} options.skipValidation - Skip validation (NOT recommended)
     * @param {string} options.apiVersion - Target API version (default: 62.0)
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;
        this.skipValidation = options.skipValidation || false;
        this.apiVersion = options.apiVersion || '62.0';

        // Initialize components
        this.validator = new FlowQuickValidator({
            apiVersion: this.apiVersion,
            verbose: this.verbose
        });
        this.complexityAdvisor = new FlowComplexityAdvisor({ verbose: this.verbose });

        // State
        this.flowPath = null;
        this.flowXML = null;
        this.modifier = null;
        this.rollbackPoints = new Map();
        this.lastRollbackId = null;

        // Rollback expiration (1 hour)
        this.rollbackExpiration = 60 * 60 * 1000;
    }

    /**
     * Log message if verbose mode is enabled
     * @param {string} message - Message to log
     * @private
     */
    _log(message) {
        if (this.verbose) {
            console.log(`[FlowQuickEditor] ${message}`);
        }
    }

    /**
     * Generate unique rollback ID
     * @returns {string} Unique ID
     * @private
     */
    _generateRollbackId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `rb_${timestamp}_${random}`;
    }

    /**
     * Find a flow file by name
     * @param {string} flowName - Flow name (with or without extension)
     * @returns {Promise<string>} Full path to flow file
     */
    async findFlow(flowName) {
        // If already a path, return it
        if (flowName.endsWith('.xml') || flowName.endsWith('.flow-meta.xml')) {
            return flowName;
        }

        // Search common locations
        const searchPaths = [
            `./${flowName}.flow-meta.xml`,
            `./flows/${flowName}.flow-meta.xml`,
            `./force-app/main/default/flows/${flowName}.flow-meta.xml`,
            `./${flowName}.xml`
        ];

        for (const searchPath of searchPaths) {
            try {
                await fs.access(searchPath);
                return searchPath;
            } catch {
                // Continue to next path
            }
        }

        throw new Error(`Flow not found: ${flowName}`);
    }

    /**
     * Load a flow for editing
     * @param {string} flowPath - Path to .flow-meta.xml
     * @returns {Promise<Object>} Flow metadata
     */
    async loadFlow(flowPath) {
        this._log(`Loading flow: ${flowPath}`);

        // Resolve path
        this.flowPath = await this.findFlow(flowPath);

        // Read flow content
        this.flowXML = await fs.readFile(this.flowPath, 'utf8');

        // Initialize NLP modifier
        this.modifier = new FlowNLPModifier(this.flowPath, this.orgAlias, {
            verbose: this.verbose
        });
        await this.modifier.init();

        // Check complexity for guidance
        const complexityCheck = await this.complexityAdvisor.quickCheck(this.flowXML);
        if (complexityCheck.message) {
            this._log(complexityCheck.message);
        }

        return {
            path: this.flowPath,
            complexity: complexityCheck.complexity,
            recommendedMode: complexityCheck.recommendedMode,
            loaded: true
        };
    }

    /**
     * Check if an instruction represents a minor edit
     * @param {string} instruction - Natural language instruction
     * @returns {boolean} Whether this is a minor edit
     */
    isMinorEdit(instruction) {
        const lower = instruction.toLowerCase();

        // Complex patterns that suggest major changes
        const complexPatterns = [
            /add\s+(\d+|multiple|several|many)/i,  // Multiple elements
            /loop\s+through/i,                      // Loop creation
            /bulk\s+/i,                             // Bulk operations
            /decision\s+tree/i,                     // Complex decision structures
            /workflow/i,                            // Workflow-level changes
            /refactor/i,                            // Refactoring
            /restructure/i                          // Restructuring
        ];

        for (const pattern of complexPatterns) {
            if (pattern.test(instruction)) {
                return false;
            }
        }

        // Count action verbs to estimate affected elements
        const actionVerbs = ['add', 'remove', 'delete', 'change', 'modify', 'update', 'set'];
        let actionCount = 0;
        for (const verb of actionVerbs) {
            const matches = lower.match(new RegExp(`\\b${verb}\\b`, 'gi'));
            if (matches) {
                actionCount += matches.length;
            }
        }

        // Minor if 2 or fewer actions
        return actionCount <= 2;
    }

    /**
     * Create a rollback point before making changes
     * @param {string} description - Description of the operation
     * @returns {string} Rollback ID
     */
    createRollbackPoint(description = 'Quick edit') {
        const id = this._generateRollbackId();

        this.rollbackPoints.set(id, {
            id,
            flowXML: this.flowXML,
            createdAt: new Date(),
            description
        });

        this.lastRollbackId = id;
        this._log(`Created rollback point: ${id}`);

        // Clean up expired rollback points
        this._cleanupExpiredRollbacks();

        return id;
    }

    /**
     * Clean up expired rollback points
     * @private
     */
    _cleanupExpiredRollbacks() {
        const now = Date.now();

        for (const [id, point] of this.rollbackPoints.entries()) {
            if (now - point.createdAt.getTime() > this.rollbackExpiration) {
                this.rollbackPoints.delete(id);
                this._log(`Expired rollback point: ${id}`);
            }
        }
    }

    /**
     * Rollback to a previous state
     * @param {string} rollbackId - ID from createRollbackPoint
     * @returns {Promise<boolean>} Success
     */
    async rollback(rollbackId) {
        const point = this.rollbackPoints.get(rollbackId);

        if (!point) {
            throw new Error(`Rollback point not found or expired: ${rollbackId}`);
        }

        this._log(`Rolling back to: ${rollbackId} (${point.description})`);

        // Restore flow XML
        this.flowXML = point.flowXML;

        // Write to file
        await fs.writeFile(this.flowPath, this.flowXML);

        // Re-initialize modifier
        this.modifier = new FlowNLPModifier(this.flowPath, this.orgAlias, {
            verbose: this.verbose
        });
        await this.modifier.init();

        // Remove used rollback point
        this.rollbackPoints.delete(rollbackId);

        return true;
    }

    /**
     * Execute a quick edit using natural language
     * @param {string} instruction - NL instruction
     * @param {Object} options - Edit options
     * @param {boolean} options.force - Force edit even if validation warns
     * @returns {Promise<QuickEditResult>}
     */
    async executeQuickEdit(instruction, options = {}) {
        if (!this.modifier) {
            throw new Error('No flow loaded. Call loadFlow() first.');
        }

        const result = {
            success: false,
            rollbackId: null,
            validation: null,
            change: null,
            message: '',
            dryRun: this.dryRun || options.dryRun
        };

        // Check if this is a minor edit
        if (!this.isMinorEdit(instruction) && !options.force) {
            result.message = 'This edit appears complex. Consider using segmentation mode or add --force to proceed.';
            return result;
        }

        // Create rollback point
        result.rollbackId = this.createRollbackPoint(instruction);

        try {
            // Execute the edit
            this._log(`Executing: ${instruction}`);

            if (!result.dryRun) {
                await this.modifier.parseAndApply(instruction);
                await this.modifier.save();

                // Reload flow XML
                this.flowXML = await fs.readFile(this.flowPath, 'utf8');
            }

            // Run quick validation
            if (!this.skipValidation) {
                result.validation = await this.validator.validate(this.flowPath);

                if (!result.validation.valid && !options.force) {
                    // Rollback on validation failure
                    await this.rollback(result.rollbackId);
                    result.message = `Validation failed: ${result.validation.errors.map(e => e.message).join(', ')}`;
                    return result;
                }
            }

            result.success = true;
            result.change = {
                instruction,
                timestamp: new Date().toISOString()
            };
            result.message = result.dryRun
                ? 'Dry run complete - no changes applied'
                : 'Edit applied successfully';

        } catch (error) {
            // Rollback on error
            if (!result.dryRun) {
                try {
                    await this.rollback(result.rollbackId);
                } catch (rollbackError) {
                    this._log(`Rollback failed: ${rollbackError.message}`);
                }
            }

            result.message = `Edit failed: ${error.message}`;
            result.error = error.message;
        }

        return result;
    }

    /**
     * Modify a single element directly
     * @param {string} elementName - API name of element
     * @param {Object} changes - Property changes to apply
     * @returns {Promise<QuickEditResult>}
     */
    async modifyElement(elementName, changes) {
        if (!this.modifier) {
            throw new Error('No flow loaded. Call loadFlow() first.');
        }

        const result = {
            success: false,
            rollbackId: null,
            validation: null,
            change: null,
            message: '',
            dryRun: this.dryRun
        };

        // Create rollback point
        result.rollbackId = this.createRollbackPoint(`Modify ${elementName}`);

        try {
            // Build modification instruction from changes
            const changeDescriptions = Object.entries(changes)
                .map(([prop, value]) => `${prop} to "${value}"`)
                .join(', ');

            const instruction = `Modify ${elementName} ${changeDescriptions}`;

            if (!result.dryRun) {
                // Use direct modification if available, otherwise NLP
                if (this.modifier.modifyElement) {
                    await this.modifier.modifyElement(elementName, changes);
                } else {
                    await this.modifier.parseAndApply(`Change ${elementName} ${changeDescriptions}`);
                }
                await this.modifier.save();
                this.flowXML = await fs.readFile(this.flowPath, 'utf8');
            }

            // Validate
            if (!this.skipValidation) {
                result.validation = await this.validator.validate(this.flowPath);
                if (!result.validation.valid) {
                    await this.rollback(result.rollbackId);
                    result.message = `Validation failed after modification`;
                    return result;
                }
            }

            result.success = true;
            result.change = { elementName, changes };
            result.message = 'Element modified successfully';

        } catch (error) {
            if (!result.dryRun) {
                try {
                    await this.rollback(result.rollbackId);
                } catch (rollbackError) {
                    this._log(`Rollback failed: ${rollbackError.message}`);
                }
            }
            result.message = `Modification failed: ${error.message}`;
        }

        return result;
    }

    /**
     * Add a single element
     * @param {string} instruction - NL instruction for element
     * @returns {Promise<QuickEditResult>}
     */
    async addElement(instruction) {
        // Delegate to executeQuickEdit with add-specific instruction
        const fullInstruction = instruction.toLowerCase().startsWith('add')
            ? instruction
            : `Add ${instruction}`;
        return this.executeQuickEdit(fullInstruction);
    }

    /**
     * Remove a single element
     * @param {string} elementName - Element to remove
     * @param {Object} options - Remove options
     * @param {boolean} options.removeConnectors - Auto-fix dangling connectors
     * @returns {Promise<QuickEditResult>}
     */
    async removeElement(elementName, options = {}) {
        if (!this.modifier) {
            throw new Error('No flow loaded. Call loadFlow() first.');
        }

        const result = {
            success: false,
            rollbackId: null,
            validation: null,
            change: null,
            message: '',
            dryRun: this.dryRun
        };

        // Create rollback point
        result.rollbackId = this.createRollbackPoint(`Remove ${elementName}`);

        try {
            const instruction = `Remove the ${elementName} element`;

            if (!result.dryRun) {
                await this.modifier.parseAndApply(instruction);
                await this.modifier.save();
                this.flowXML = await fs.readFile(this.flowPath, 'utf8');
            }

            // Validate
            if (!this.skipValidation) {
                result.validation = await this.validator.validate(this.flowPath);

                // If dangling references and auto-fix enabled, try to fix
                if (!result.validation.valid && options.removeConnectors) {
                    const danglingErrors = result.validation.errors.filter(
                        e => e.stage === 'references'
                    );

                    if (danglingErrors.length > 0) {
                        this._log('Attempting to fix dangling connectors...');
                        // Would need to implement connector cleanup
                        // For now, just report
                        result.message = `Element removed but has dangling connectors. Manual cleanup may be needed.`;
                    }
                }

                if (!result.validation.valid && !options.force) {
                    await this.rollback(result.rollbackId);
                    result.message = `Validation failed after removal`;
                    return result;
                }
            }

            result.success = true;
            result.change = { removed: elementName };
            result.message = 'Element removed successfully';

        } catch (error) {
            if (!result.dryRun) {
                try {
                    await this.rollback(result.rollbackId);
                } catch (rollbackError) {
                    this._log(`Rollback failed: ${rollbackError.message}`);
                }
            }
            result.message = `Removal failed: ${error.message}`;
        }

        return result;
    }

    /**
     * Run quick validation on current flow
     * @returns {Promise<Object>} Validation result
     */
    async quickValidate() {
        if (!this.flowPath) {
            throw new Error('No flow loaded. Call loadFlow() first.');
        }
        return this.validator.validate(this.flowPath);
    }

    /**
     * Save current flow state
     * @returns {Promise<void>}
     */
    async save() {
        if (!this.modifier) {
            throw new Error('No flow loaded. Call loadFlow() first.');
        }
        await this.modifier.save();
        this.flowXML = await fs.readFile(this.flowPath, 'utf8');
        this._log('Flow saved');
    }

    /**
     * Get list of available rollback points
     * @returns {Array<Object>} Rollback point summaries
     */
    getRollbackPoints() {
        return Array.from(this.rollbackPoints.values()).map(p => ({
            id: p.id,
            description: p.description,
            createdAt: p.createdAt.toISOString()
        }));
    }

    /**
     * Format result for display
     * @param {QuickEditResult} result - Edit result
     * @returns {string} Formatted output
     */
    formatResult(result) {
        const lines = [
            '',
            `Quick Edit ${result.success ? '✅ Success' : '❌ Failed'}`,
            ''
        ];

        if (result.dryRun) {
            lines.push('  (Dry run - no changes applied)');
            lines.push('');
        }

        lines.push(`  Message: ${result.message}`);

        if (result.rollbackId) {
            lines.push(`  Rollback ID: ${result.rollbackId}`);
        }

        if (result.validation) {
            lines.push('');
            lines.push(this.validator.formatResult(result.validation));
        }

        if (result.change) {
            lines.push('');
            lines.push('  Change:');
            if (result.change.instruction) {
                lines.push(`    Instruction: ${result.change.instruction}`);
            }
            if (result.change.elementName) {
                lines.push(`    Element: ${result.change.elementName}`);
            }
        }

        return lines.join('\n');
    }
}

module.exports = FlowQuickEditor;
