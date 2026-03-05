/**
 * FlowBatchManager - Manage batch operations on multiple Flows
 *
 * Features:
 * - Parallel processing with concurrency control
 * - Progress tracking and error aggregation
 * - Support for validate, deploy, and modify operations
 * - Graceful error handling with continue-on-error support
 *
 * Part of Phase 4.1: Batch Operations
 */

const path = require('path');
const pLimit = require('p-limit');
const FlowAuthor = require('./flow-author');

class FlowBatchManager {
    /**
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Configuration options
     * @param {boolean} options.verbose - Enable verbose logging
     * @param {number} options.parallel - Max parallel operations (default: 5)
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.parallelLimit = options.parallel || 5;

        // Concurrency limiter
        this.limit = pLimit(this.parallelLimit);

        // Track results
        this.results = [];

        // FlowAuthor instances (one per parallel worker)
        this.authors = [];
    }

    /**
     * Validate multiple Flows in parallel
     * @param {string[]} flowPaths - Array of Flow file paths
     * @returns {Promise<Array>} Array of validation results
     */
    async validateBatch(flowPaths) {
        this.log(`Validating ${flowPaths.length} Flows with parallelism=${this.parallelLimit}...`);

        const tasks = flowPaths.map(flowPath =>
            this.limit(() => this._validateSingle(flowPath))
        );

        const results = await Promise.all(tasks);

        this.log(`Validation complete: ${results.filter(r => r.success).length}/${flowPaths.length} passed`);

        return results;
    }

    /**
     * Deploy multiple Flows in parallel
     * @param {string[]} flowPaths - Array of Flow file paths
     * @param {Object} options - Deployment options
     * @param {boolean} options.activateOnDeploy - Activate Flows after deployment
     * @param {boolean} options.continueOnError - Continue deploying even if some fail
     * @returns {Promise<Array>} Array of deployment results
     */
    async deployBatch(flowPaths, options = {}) {
        this.log(`Deploying ${flowPaths.length} Flows with parallelism=${this.parallelLimit}...`);

        const tasks = flowPaths.map(flowPath =>
            this.limit(() => this._deploySingle(flowPath, options))
        );

        const results = await Promise.all(tasks);

        const succeeded = results.filter(r => r.success).length;
        this.log(`Deployment complete: ${succeeded}/${flowPaths.length} succeeded`);

        return results;
    }

    /**
     * Modify multiple Flows with same instruction
     * @param {string[]} flowPaths - Array of Flow file paths
     * @param {string} instruction - Natural language modification instruction
     * @returns {Promise<Array>} Array of modification results
     */
    async modifyBatch(flowPaths, instruction) {
        this.log(`Modifying ${flowPaths.length} Flows with instruction: "${instruction}"...`);

        // Modifications are sequential to avoid conflicts
        const results = [];

        for (const flowPath of flowPaths) {
            const result = await this._modifySingle(flowPath, instruction);
            results.push(result);

            // Stop if any modification fails
            if (!result.success) {
                this.log(`Modification failed for ${flowPath}, stopping batch operation`);
                break;
            }
        }

        const succeeded = results.filter(r => r.success).length;
        this.log(`Modification complete: ${succeeded}/${flowPaths.length} succeeded`);

        return results;
    }

    /**
     * Validate a single Flow
     * @private
     */
    async _validateSingle(flowPath) {
        const startTime = Date.now();

        try {
            this.log(`Validating: ${path.basename(flowPath)}...`);

            const author = new FlowAuthor(this.orgAlias, { verbose: this.verbose });

            await author.loadFlow(flowPath);
            const validation = await author.validate();

            await author.close();

            const duration = Date.now() - startTime;

            return {
                flowPath,
                success: validation.valid,
                validation,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            this.log(`Error validating ${path.basename(flowPath)}: ${error.message}`);

            return {
                flowPath,
                success: false,
                error: error.message,
                duration
            };
        }
    }

    /**
     * Deploy a single Flow
     * @private
     */
    async _deploySingle(flowPath, options) {
        const startTime = Date.now();

        try {
            this.log(`Deploying: ${path.basename(flowPath)}...`);

            const author = new FlowAuthor(this.orgAlias, { verbose: this.verbose });

            await author.loadFlow(flowPath);

            // Validate first
            const validation = await author.validate();
            if (!validation.valid) {
                throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
            }

            // Deploy
            const deployResult = await author.deploy(options);

            await author.close();

            const duration = Date.now() - startTime;

            return {
                flowPath,
                success: true,
                deploymentId: deployResult.deploymentId,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            this.log(`Error deploying ${path.basename(flowPath)}: ${error.message}`);

            return {
                flowPath,
                success: false,
                error: error.message,
                duration
            };
        }
    }

    /**
     * Modify a single Flow
     * @private
     */
    async _modifySingle(flowPath, instruction) {
        const startTime = Date.now();

        try {
            this.log(`Modifying: ${path.basename(flowPath)}...`);

            const author = new FlowAuthor(this.orgAlias, { verbose: this.verbose });

            await author.loadFlow(flowPath);

            // Apply modification
            await author.addElement(instruction);

            // Save changes
            await author.save();

            await author.close();

            const duration = Date.now() - startTime;

            return {
                flowPath,
                success: true,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;

            this.log(`Error modifying ${path.basename(flowPath)}: ${error.message}`);

            return {
                flowPath,
                success: false,
                error: error.message,
                duration
            };
        }
    }

    /**
     * Get aggregated statistics from batch operation
     * @returns {Object} Statistics summary
     */
    getStatistics() {
        const total = this.results.length;
        const succeeded = this.results.filter(r => r.success).length;
        const failed = this.results.filter(r => !r.success).length;
        const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);
        const avgDuration = total > 0 ? totalDuration / total : 0;

        return {
            total,
            succeeded,
            failed,
            successRate: total > 0 ? (succeeded / total * 100).toFixed(1) + '%' : '0%',
            totalDuration: `${totalDuration}ms`,
            avgDuration: `${Math.round(avgDuration)}ms`
        };
    }

    /**
     * Get errors from batch operation
     * @returns {Array} Array of errors with Flow paths
     */
    getErrors() {
        return this.results
            .filter(r => !r.success)
            .map(r => ({
                flowPath: r.flowPath,
                error: r.error || 'Unknown error'
            }));
    }

    /**
     * Log message if verbose enabled
     * @private
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowBatchManager] ${message}`);
        }
    }

    /**
     * Clean up resources
     */
    async close() {
        // Close any open FlowAuthor instances
        for (const author of this.authors) {
            try {
                await author.close();
            } catch (error) {
                // Ignore cleanup errors
            }
        }

        this.authors = [];
    }
}

module.exports = FlowBatchManager;
