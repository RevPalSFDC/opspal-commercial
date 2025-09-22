#!/usr/bin/env node

const BaseAgent = require('./BaseAgent');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * AgentOrchestrator - Master orchestrator for the entire agent system
 * Manages agent lifecycle, hierarchy, and inter-agent communication
 */
class AgentOrchestrator extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            agentDir: path.join(__dirname),
            autoDiscovery: true,
            heartbeatInterval: 30000,
            maxAgents: 50,
            enableMetrics: true,
            ...config
        };

        // Agent registry
        this.agents = new Map();
        this.agentTypes = new Map();
        this.agentHierarchy = new Map();

        // Message bus
        this.messageBus = new EventEmitter();
        this.messageQueue = [];
        this.pendingResponses = new Map();

        // System state
        this.state = {
            status: 'initializing',
            startTime: Date.now(),
            agentsLoaded: 0,
            messagesProcessed: 0,
            errors: 0
        };

        // Performance metrics
        this.metrics = {
            agentPerformance: new Map(),
            messageLatency: [],
            systemLoad: []
        };

        this.initialize();
    }

    async initialize() {
        console.log('🚀 Initializing Agent Orchestrator...');

        // Set up message routing
        this.setupMessageRouting();

        // Discover and load agents
        if (this.config.autoDiscovery) {
            await this.discoverAgents();
        }

        // Initialize core agents
        await this.initializeCoreAgents();

        // Start heartbeat monitoring
        this.startHeartbeat();

        // Set up graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());

        this.state.status = 'ready';
        console.log('✅ Agent Orchestrator ready');

        this.emit('ready');
    }

    /**
     * Discover available agents
     */
    async discoverAgents() {
        const agentDirs = ['core', 'data', 'monitoring', 'integration', 'orchestration'];

        for (const dir of agentDirs) {
            const dirPath = path.join(this.config.agentDir, dir);

            try {
                const files = await fs.readdir(dirPath);

                for (const file of files) {
                    if (file.endsWith('.js') && !file.includes('.test.')) {
                        const agentPath = path.join(dirPath, file);
                        await this.loadAgent(agentPath, dir);
                    }
                }
            } catch (error) {
                // Directory might not exist
            }
        }

        console.log(`📦 Discovered ${this.agents.size} agents`);
    }

    /**
     * Load an agent module
     */
    async loadAgent(agentPath, type) {
        try {
            const AgentClass = require(agentPath);

            // Skip if not a valid agent class
            if (!AgentClass.prototype || !AgentClass.prototype.execute) {
                return;
            }

            const agentName = path.basename(agentPath, '.js');

            // Store agent type
            this.agentTypes.set(agentName, {
                class: AgentClass,
                type,
                path: agentPath,
                instances: []
            });

            this.state.agentsLoaded++;
            console.log(`  ✓ Loaded ${agentName} (${type})`);

        } catch (error) {
            console.error(`  ✗ Failed to load ${agentPath}: ${error.message}`);
        }
    }

    /**
     * Initialize core agents
     */
    async initializeCoreAgents() {
        // Create core agent instances
        const coreAgents = [
            { name: 'connection-manager', type: 'core' },
            { name: 'smart-router', type: 'orchestration' },
            { name: 'deduplication-engine', type: 'data' }
        ];

        for (const { name, type } of coreAgents) {
            await this.createAgent(name, type);
        }
    }

    /**
     * Create an agent instance
     */
    async createAgent(name, type, config = {}) {
        const agentType = this.agentTypes.get(name);

        if (!agentType) {
            throw new Error(`Unknown agent: ${name}`);
        }

        const AgentClass = agentType.class;
        const agent = new AgentClass(config);

        // Initialize agent
        await agent.initialize();

        // Register agent
        this.agents.set(agent.id, agent);
        agentType.instances.push(agent.id);

        // Set up agent event handlers
        this.setupAgentHandlers(agent);

        console.log(`🤖 Created ${name} instance (${agent.id})`);

        return agent;
    }

    /**
     * Setup agent event handlers
     */
    setupAgentHandlers(agent) {
        // Forward agent events
        agent.on('task:start', (data) => {
            this.emit('agent:task:start', { ...data, agentId: agent.id });
        });

        agent.on('task:complete', (data) => {
            this.emit('agent:task:complete', { ...data, agentId: agent.id });
            this.updateAgentMetrics(agent.id, 'success', data);
        });

        agent.on('task:error', (data) => {
            this.emit('agent:task:error', { ...data, agentId: agent.id });
            this.updateAgentMetrics(agent.id, 'error', data);
            this.state.errors++;
        });

        agent.on('message:send', (message) => {
            this.routeMessage(message);
        });

        agent.on('log', (log) => {
            this.emit('agent:log', { ...log, agentId: agent.id });
        });
    }

    /**
     * Setup message routing system
     */
    setupMessageRouting() {
        // Global message handler
        process.on('agent:message', (message) => {
            this.routeMessage(message);
        });

        // Message bus handlers
        this.messageBus.on('message', (message) => {
            this.processMessage(message);
        });

        // Start message processor
        setInterval(() => this.processMessageQueue(), 100);
    }

    /**
     * Route a message to the appropriate agent
     */
    async routeMessage(message) {
        message.routedAt = Date.now();

        // Add to queue
        this.messageQueue.push(message);

        // Track message
        if (message.expectsResponse) {
            this.pendingResponses.set(message.id, {
                from: message.from,
                timestamp: Date.now()
            });
        }

        this.state.messagesProcessed++;
    }

    /**
     * Process message queue
     */
    async processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();

            try {
                await this.deliverMessage(message);
            } catch (error) {
                console.error(`Failed to deliver message: ${error.message}`);
                this.handleMessageError(message, error);
            }
        }
    }

    /**
     * Deliver message to target agent
     */
    async deliverMessage(message) {
        // Handle broadcast messages
        if (message.to === '*') {
            for (const agent of this.agents.values()) {
                agent.handleMessage(message);
            }
            return;
        }

        // Find target agent
        let targetAgent = null;

        // Try by agent ID first
        if (this.agents.has(message.to)) {
            targetAgent = this.agents.get(message.to);
        } else {
            // Try by agent name
            for (const agent of this.agents.values()) {
                if (agent.name === message.to) {
                    targetAgent = agent;
                    break;
                }
            }
        }

        if (targetAgent) {
            targetAgent.handleMessage(message);

            // Track latency
            const latency = Date.now() - message.timestamp;
            this.metrics.messageLatency.push(latency);
            if (this.metrics.messageLatency.length > 1000) {
                this.metrics.messageLatency.shift();
            }
        } else {
            console.warn(`No agent found for message to: ${message.to}`);
        }
    }

    /**
     * Handle message delivery error
     */
    handleMessageError(message, error) {
        if (message.expectsResponse) {
            const pending = this.pendingResponses.get(message.id);
            if (pending) {
                // Send error response
                this.routeMessage({
                    id: crypto.randomUUID(),
                    from: 'orchestrator',
                    to: pending.from,
                    type: 'error',
                    correlationId: message.id,
                    payload: {
                        error: error.message
                    },
                    timestamp: Date.now()
                });

                this.pendingResponses.delete(message.id);
            }
        }
    }

    /**
     * Execute a task with appropriate agent
     */
    async executeTask(task) {
        // Use smart router to determine best agent
        const router = this.getAgentByName('smart-router');

        if (router) {
            return await router.execute(task);
        }

        // Fallback: try to find appropriate agent by type
        const agentName = this.findAgentForTask(task);
        if (agentName) {
            const agent = this.getAgentByName(agentName);
            return await agent.execute(task);
        }

        throw new Error(`No suitable agent found for task: ${task.type}`);
    }

    /**
     * Find agent for task type
     */
    findAgentForTask(task) {
        const typeMapping = {
            'import': 'bulk-import-agent',
            'export': 'bulk-export-agent',
            'dedupe': 'deduplication-engine',
            'connect': 'connection-manager'
        };

        return typeMapping[task.type] || null;
    }

    /**
     * Get agent by name
     */
    getAgentByName(name) {
        for (const agent of this.agents.values()) {
            if (agent.name === name) {
                return agent;
            }
        }
        return null;
    }

    /**
     * Update agent performance metrics
     */
    updateAgentMetrics(agentId, result, data) {
        if (!this.metrics.agentPerformance.has(agentId)) {
            this.metrics.agentPerformance.set(agentId, {
                tasks: 0,
                successes: 0,
                errors: 0,
                totalDuration: 0
            });
        }

        const metrics = this.metrics.agentPerformance.get(agentId);
        metrics.tasks++;

        if (result === 'success') {
            metrics.successes++;
        } else {
            metrics.errors++;
        }

        if (data.duration) {
            metrics.totalDuration += data.duration;
        }
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const heartbeat = {
                timestamp: Date.now(),
                agents: this.agents.size,
                status: this.state.status,
                messagesProcessed: this.state.messagesProcessed,
                errors: this.state.errors,
                uptime: Date.now() - this.state.startTime
            };

            this.emit('heartbeat', heartbeat);

            // Check agent health
            for (const agent of this.agents.values()) {
                if (agent.state.lastActivity < Date.now() - 60000) {
                    console.warn(`⚠️  Agent ${agent.name} appears inactive`);
                }
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * Get system status
     */
    getStatus() {
        const status = {
            ...this.state,
            uptime: Date.now() - this.state.startTime,
            agents: {}
        };

        // Add agent status
        for (const [id, agent] of this.agents) {
            status.agents[agent.name] = {
                id,
                status: agent.state.status,
                tasks: agent.state.metrics.operations,
                errors: agent.state.metrics.errors,
                successRate: agent.state.metrics.successRate
            };
        }

        // Add performance metrics
        if (this.config.enableMetrics) {
            status.metrics = {
                avgMessageLatency: this.metrics.messageLatency.length > 0
                    ? this.metrics.messageLatency.reduce((a, b) => a + b, 0) / this.metrics.messageLatency.length
                    : 0,
                agentPerformance: Object.fromEntries(this.metrics.agentPerformance)
            };
        }

        return status;
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        console.log('\n🛑 Shutting down Agent Orchestrator...');

        this.state.status = 'shutting-down';

        // Stop heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        // Shutdown all agents
        const shutdownPromises = [];
        for (const agent of this.agents.values()) {
            shutdownPromises.push(agent.shutdown());
        }

        await Promise.all(shutdownPromises);

        console.log('✅ All agents shut down successfully');

        // Clear message queue
        this.messageQueue = [];
        this.pendingResponses.clear();

        this.state.status = 'shutdown';
        this.emit('shutdown');

        // Give time for final events
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    }
}

// Export for use as library
module.exports = AgentOrchestrator;

// CLI interface
if (require.main === module) {
    const { program } = require('commander');

    program
        .name('agent-orchestrator')
        .description('Master orchestrator for agent system')
        .option('-c, --config <file>', 'Configuration file')
        .option('-d, --daemon', 'Run as daemon')
        .option('-p, --port <port>', 'API port', '3000')
        .parse(process.argv);

    const options = program.opts();

    async function main() {
        let config = {};

        if (options.config) {
            const configContent = await fs.readFile(options.config, 'utf8');
            config = JSON.parse(configContent);
        }

        const orchestrator = new AgentOrchestrator(config);

        // Wait for ready
        await new Promise(resolve => {
            orchestrator.once('ready', resolve);
        });

        // Set up API server if requested
        if (options.port) {
            const express = require('express');
            const app = express();

            app.use(express.json());

            // Status endpoint
            app.get('/status', (req, res) => {
                res.json(orchestrator.getStatus());
            });

            // Execute task endpoint
            app.post('/execute', async (req, res) => {
                try {
                    const result = await orchestrator.executeTask(req.body);
                    res.json({ success: true, result });
                } catch (error) {
                    res.status(500).json({ success: false, error: error.message });
                }
            });

            // Agent list endpoint
            app.get('/agents', (req, res) => {
                const agents = [];
                for (const [id, agent] of orchestrator.agents) {
                    agents.push({
                        id,
                        name: agent.name,
                        type: agent.type,
                        status: agent.state.status
                    });
                }
                res.json(agents);
            });

            app.listen(options.port, () => {
                console.log(`📡 API server listening on port ${options.port}`);
            });
        }

        // Handle console if not daemon
        if (!options.daemon) {
            console.log('\n📋 Commands:');
            console.log('  status - Show system status');
            console.log('  agents - List agents');
            console.log('  exit   - Shutdown');

            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: '\norchestrator> '
            });

            rl.prompt();

            rl.on('line', async (line) => {
                const command = line.trim();

                switch (command) {
                    case 'status':
                        console.log(JSON.stringify(orchestrator.getStatus(), null, 2));
                        break;

                    case 'agents':
                        for (const [id, agent] of orchestrator.agents) {
                            console.log(`  ${agent.name} (${id}) - ${agent.state.status}`);
                        }
                        break;

                    case 'exit':
                        await orchestrator.shutdown();
                        break;

                    default:
                        console.log(`Unknown command: ${command}`);
                }

                rl.prompt();
            });
        }

        // Keep alive
        if (options.daemon) {
            console.log('🔄 Running as daemon...');
            process.stdin.resume();
        }
    }

    main().catch(console.error);
}