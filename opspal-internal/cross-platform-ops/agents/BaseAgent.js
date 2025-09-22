#!/usr/bin/env node

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * BaseAgent - Foundation class for all specialized agents
 * Provides common functionality for state management, error handling, and inter-agent communication
 */
class BaseAgent extends EventEmitter {
    constructor(config = {}) {
        super();

        this.id = config.id || crypto.randomUUID();
        this.name = config.name || this.constructor.name;
        this.type = config.type || 'generic';
        this.parent = config.parent || null;
        this.children = new Map();

        // Configuration
        this.config = {
            maxRetries: 3,
            retryDelay: 1000,
            stateDir: './.agent-states',
            logLevel: process.env.LOG_LEVEL || 'info',
            ...config
        };

        // Runtime state
        this.state = {
            status: 'idle',
            startTime: null,
            lastActivity: Date.now(),
            metrics: {
                operations: 0,
                errors: 0,
                successRate: 100
            }
        };

        // Message queue for inter-agent communication
        this.messageQueue = [];
        this.messageHandlers = new Map();

        this.initialize();
    }

    async initialize() {
        // Ensure state directory exists
        await fs.mkdir(this.config.stateDir, { recursive: true });

        // Load previous state if exists
        await this.loadState();

        // Register base message handlers
        this.on('message', this.handleMessage.bind(this));
        this.on('error', this.handleError.bind(this));

        this.log('info', `Agent ${this.name} initialized`);
    }

    /**
     * Core execution method - must be implemented by child classes
     */
    async execute(task) {
        throw new Error(`${this.name} must implement execute() method`);
    }

    /**
     * Run a task with error handling and retries
     */
    async run(task) {
        this.state.status = 'running';
        this.state.startTime = Date.now();
        this.state.operations++;

        try {
            this.emit('task:start', { agent: this.name, task });

            const result = await this.executeWithRetry(task);

            this.state.status = 'idle';
            this.updateSuccessRate(true);

            this.emit('task:complete', { agent: this.name, task, result });

            return result;
        } catch (error) {
            this.state.status = 'error';
            this.state.errors++;
            this.updateSuccessRate(false);

            this.emit('task:error', { agent: this.name, task, error });

            throw error;
        } finally {
            await this.saveState();
        }
    }

    /**
     * Execute with retry logic
     */
    async executeWithRetry(task, attempt = 1) {
        try {
            return await this.execute(task);
        } catch (error) {
            if (attempt < this.config.maxRetries && this.isRetryable(error)) {
                this.log('warn', `Retry ${attempt}/${this.config.maxRetries} for ${this.name}`);
                await this.sleep(this.config.retryDelay * attempt);
                return this.executeWithRetry(task, attempt + 1);
            }
            throw error;
        }
    }

    /**
     * Send message to another agent
     */
    async sendMessage(targetAgent, type, payload) {
        const message = {
            id: crypto.randomUUID(),
            from: this.name,
            to: targetAgent,
            type,
            payload,
            timestamp: Date.now()
        };

        this.emit('message:send', message);

        // If we have a parent, route through it
        if (this.parent) {
            return this.parent.routeMessage(message);
        }

        // Otherwise, emit globally
        process.emit('agent:message', message);

        return message.id;
    }

    /**
     * Handle incoming messages
     */
    handleMessage(message) {
        if (message.to !== this.name && message.to !== '*') return;

        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler.call(this, message);
        } else {
            this.log('debug', `No handler for message type: ${message.type}`);
        }
    }

    /**
     * Register a message handler
     */
    onMessage(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    /**
     * Add child agent
     */
    addChild(agent) {
        this.children.set(agent.name, agent);
        agent.parent = this;
    }

    /**
     * Route message to appropriate child or handle internally
     */
    async routeMessage(message) {
        // Check if it's for us
        if (message.to === this.name) {
            this.handleMessage(message);
            return;
        }

        // Check if it's for a child
        const child = this.children.get(message.to);
        if (child) {
            child.handleMessage(message);
            return;
        }

        // Pass up to parent if we have one
        if (this.parent) {
            return this.parent.routeMessage(message);
        }

        this.log('warn', `Unable to route message to ${message.to}`);
    }

    /**
     * Error handling
     */
    handleError(error) {
        this.log('error', `${this.name} error: ${error.message}`, error);
        this.state.errors++;
    }

    /**
     * Check if error is retryable
     */
    isRetryable(error) {
        const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'];
        return retryableCodes.includes(error.code) || error.statusCode >= 500;
    }

    /**
     * State persistence
     */
    async saveState() {
        const statePath = path.join(this.config.stateDir, `${this.name}-state.json`);
        const state = {
            ...this.state,
            lastSaved: Date.now()
        };
        await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    }

    async loadState() {
        try {
            const statePath = path.join(this.config.stateDir, `${this.name}-state.json`);
            const data = await fs.readFile(statePath, 'utf8');
            const savedState = JSON.parse(data);

            // Merge saved state with current state
            this.state = {
                ...this.state,
                ...savedState,
                status: 'idle' // Reset status on load
            };
        } catch (error) {
            // No saved state, use defaults
        }
    }

    /**
     * Metrics and monitoring
     */
    updateSuccessRate(success) {
        const total = this.state.metrics.operations;
        const successful = success
            ? (this.state.metrics.successRate * (total - 1) / 100) + 1
            : (this.state.metrics.successRate * (total - 1) / 100);

        this.state.metrics.successRate = (successful / total) * 100;
    }

    getMetrics() {
        return {
            ...this.state.metrics,
            uptime: Date.now() - (this.state.startTime || Date.now()),
            status: this.state.status
        };
    }

    /**
     * Logging
     */
    log(level, message, data = null) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevel = levels.indexOf(this.config.logLevel);
        const messageLevel = levels.indexOf(level);

        if (messageLevel >= currentLevel) {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] [${this.name}] [${level.toUpperCase()}] ${message}`;

            if (data) {
                console.log(logMessage, data);
            } else {
                console.log(logMessage);
            }

            this.emit('log', { level, message, data, timestamp });
        }
    }

    /**
     * Utility methods
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        this.log('info', `Shutting down ${this.name}`);
        this.state.status = 'shutdown';
        await this.saveState();

        // Shutdown children
        for (const child of this.children.values()) {
            await child.shutdown();
        }

        this.removeAllListeners();
    }
}

module.exports = BaseAgent;