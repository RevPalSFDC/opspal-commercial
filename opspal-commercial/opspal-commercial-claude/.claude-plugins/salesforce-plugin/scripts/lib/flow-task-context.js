/**
 * FlowTaskContext
 *
 * Maintains execution context across multi-step flow operations.
 * Persists flow ID, target version, step progress, rollback points, etc.
 *
 * Usage:
 *   const context = new FlowTaskContext('./context.json');
 *   await context.init({ flowName: 'Account_AfterSave', operation: 'deploy' });
 *   await context.recordStep('validation', { passed: true });
 *   await context.recordStep('deployment', { version: 3 });
 *   await context.complete();
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FlowTaskContext {
    constructor(contextFile = './tmp/flow-context.json', options = {}) {
        this.contextFile = contextFile;
        this.verbose = options.verbose || false;
        this.context = null;
    }

    /**
     * Initialize new context
     */
    async init(initialData = {}) {
        this.context = {
            contextId: this.generateContextId(),
            createdAt: new Date().toISOString(),
            status: 'initialized',
            flowName: initialData.flowName || null,
            operation: initialData.operation || null,
            orgAlias: initialData.orgAlias || null,
            steps: [],
            checkpoints: [],
            metadata: initialData.metadata || {},
            errors: []
        };

        await this.save();

        this.log(`Context initialized: ${this.context.contextId}`);

        return this.context;
    }

    /**
     * Load existing context
     */
    async load() {
        try {
            const content = await fs.readFile(this.contextFile, 'utf8');
            this.context = JSON.parse(content);

            this.log(`Context loaded: ${this.context.contextId}`);

            return this.context;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('No context file found. Call init() first.');
            }
            throw error;
        }
    }

    /**
     * Record a step execution
     */
    async recordStep(stepName, data = {}) {
        if (!this.context) {
            throw new Error('Context not initialized. Call init() or load() first.');
        }

        const step = {
            stepName: stepName,
            timestamp: new Date().toISOString(),
            data: data,
            status: data.error ? 'failed' : 'completed'
        };

        this.context.steps.push(step);
        this.context.status = 'in_progress';

        await this.save();

        this.log(`Step recorded: ${stepName}`);

        return step;
    }

    /**
     * Create checkpoint (for rollback)
     */
    async createCheckpoint(checkpointName, data = {}) {
        if (!this.context) {
            throw new Error('Context not initialized');
        }

        const checkpoint = {
            checkpointName: checkpointName,
            timestamp: new Date().toISOString(),
            data: data,
            stepIndex: this.context.steps.length
        };

        this.context.checkpoints.push(checkpoint);

        await this.save();

        this.log(`Checkpoint created: ${checkpointName}`);

        return checkpoint;
    }

    /**
     * Get latest checkpoint
     */
    getLatestCheckpoint() {
        if (this.context.checkpoints.length === 0) {
            return null;
        }

        return this.context.checkpoints[this.context.checkpoints.length - 1];
    }

    /**
     * Record error
     */
    async recordError(error, step = null) {
        if (!this.context) {
            throw new Error('Context not initialized');
        }

        const errorRecord = {
            timestamp: new Date().toISOString(),
            step: step,
            message: error.message,
            stack: error.stack
        };

        this.context.errors.push(errorRecord);
        this.context.status = 'failed';

        await this.save();

        this.log(`Error recorded: ${error.message}`);

        return errorRecord;
    }

    /**
     * Mark context as complete
     */
    async complete(finalData = {}) {
        if (!this.context) {
            throw new Error('Context not initialized');
        }

        this.context.status = 'completed';
        this.context.completedAt = new Date().toISOString();
        this.context.finalData = finalData;

        await this.save();

        this.log(`Context completed: ${this.context.contextId}`);

        return this.context;
    }

    /**
     * Get current context
     */
    get() {
        return this.context;
    }

    /**
     * Update metadata
     */
    async updateMetadata(key, value) {
        if (!this.context) {
            throw new Error('Context not initialized');
        }

        this.context.metadata[key] = value;

        await this.save();

        return this.context.metadata;
    }

    /**
     * Save context to file
     */
    async save() {
        const dir = path.dirname(this.contextFile);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(
            this.contextFile,
            JSON.stringify(this.context, null, 2),
            'utf8'
        );
    }

    /**
     * Clear context
     */
    async clear() {
        try {
            await fs.unlink(this.contextFile);
            this.context = null;
            this.log('Context cleared');
        } catch (error) {
            // File doesn't exist
        }
    }

    /**
     * Generate unique context ID
     */
    generateContextId() {
        return `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Log helper
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowTaskContext] ${message}`);
        }
    }
}

module.exports = FlowTaskContext;
