#!/usr/bin/env node

const BaseAgent = require('../BaseAgent');
const fs = require('fs').promises;
const path = require('path');

/**
 * SmartRouter - Intelligent operation routing agent
 * Routes operations to appropriate agents based on data volume, complexity, and system state
 */
class SmartRouter extends BaseAgent {
    constructor(config = {}) {
        super({
            name: 'smart-router',
            type: 'orchestration',
            ...config
        });

        this.config = {
            ...this.config,
            routingRules: {
                volumeThresholds: {
                    small: 1000,      // < 1k records
                    medium: 100000,   // 1k - 100k records
                    large: 1000000,   // 100k - 1M records
                    xlarge: 10000000  // > 1M records
                },
                complexityFactors: {
                    simpleFields: 1,
                    customObjects: 2,
                    relationships: 3,
                    workflows: 4,
                    integrations: 5
                },
                costWeights: {
                    time: 0.3,
                    memory: 0.2,
                    apiCalls: 0.3,
                    complexity: 0.2
                }
            },
            agentCapabilities: new Map(),
            performanceHistory: new Map(),
            maxHistorySize: 1000
        };

        // Initialize agent registry
        this.agentRegistry = new Map();

        // Routing statistics
        this.stats = {
            routingDecisions: 0,
            correctRoutes: 0,
            reroutes: 0,
            avgRoutingTime: 0
        };

        // Load agent capabilities
        this.loadAgentCapabilities();
    }

    /**
     * Main execution - route a task to appropriate agent
     */
    async execute(task) {
        const startTime = Date.now();

        // Analyze task
        const analysis = await this.analyzeTask(task);

        // Determine best agent
        const routing = await this.determineRouting(analysis);

        // Execute with selected agent
        const result = await this.executeWithAgent(routing.agent, task, routing);

        // Update statistics
        this.updatePerformanceHistory(routing.agent, task, result, Date.now() - startTime);

        this.stats.routingDecisions++;
        this.stats.avgRoutingTime = ((this.stats.avgRoutingTime * (this.stats.routingDecisions - 1)) +
                                     (Date.now() - startTime)) / this.stats.routingDecisions;

        return result;
    }

    /**
     * Analyze task characteristics
     */
    async analyzeTask(task) {
        const analysis = {
            type: task.type || this.inferTaskType(task),
            volume: await this.estimateVolume(task),
            complexity: this.calculateComplexity(task),
            requirements: this.extractRequirements(task),
            constraints: this.identifyConstraints(task),
            priority: task.priority || 'normal',
            estimatedResources: await this.estimateResources(task)
        };

        // Add ML predictions if available
        if (this.performanceHistory.size > 100) {
            analysis.predictions = this.predictPerformance(analysis);
        }

        this.log('debug', `Task analysis complete`, analysis);

        return analysis;
    }

    /**
     * Infer task type from content
     */
    inferTaskType(task) {
        if (task.operation) return task.operation;

        // Pattern matching for common operations
        const patterns = {
            import: /import|upload|load|ingest/i,
            export: /export|download|extract|dump/i,
            dedupe: /dedupe|duplicate|merge|consolidate/i,
            sync: /sync|synchronize|replicate|mirror/i,
            transform: /transform|convert|map|translate/i,
            validate: /validate|check|verify|audit/i,
            cleanup: /clean|purge|delete|archive/i
        };

        for (const [type, pattern] of Object.entries(patterns)) {
            if (task.description && pattern.test(task.description)) {
                return type;
            }
        }

        return 'general';
    }

    /**
     * Estimate data volume
     */
    async estimateVolume(task) {
        let volume = 0;

        // Check for explicit volume
        if (task.recordCount) {
            volume = task.recordCount;
        } else if (task.file) {
            // Estimate from file size
            try {
                const stats = await fs.stat(task.file);
                const avgRecordSize = 200; // bytes
                volume = Math.floor(stats.size / avgRecordSize);
            } catch (error) {
                volume = 1000; // Default estimate
            }
        } else if (task.data && Array.isArray(task.data)) {
            volume = task.data.length;
        }

        // Categorize volume
        const { volumeThresholds } = this.config.routingRules;

        if (volume < volumeThresholds.small) return { size: 'small', count: volume };
        if (volume < volumeThresholds.medium) return { size: 'medium', count: volume };
        if (volume < volumeThresholds.large) return { size: 'large', count: volume };
        if (volume < volumeThresholds.xlarge) return { size: 'xlarge', count: volume };

        return { size: 'massive', count: volume };
    }

    /**
     * Calculate task complexity
     */
    calculateComplexity(task) {
        const { complexityFactors } = this.config.routingRules;
        let score = 0;

        // Check various complexity indicators
        if (task.fields && task.fields.length > 10) score += complexityFactors.simpleFields;
        if (task.customObjects) score += complexityFactors.customObjects;
        if (task.relationships || task.associations) score += complexityFactors.relationships;
        if (task.workflows || task.automations) score += complexityFactors.workflows;
        if (task.integrations || task.platforms > 1) score += complexityFactors.integrations;

        // Normalize to 0-1 scale
        const maxScore = Object.values(complexityFactors).reduce((a, b) => a + b, 0);
        return score / maxScore;
    }

    /**
     * Extract task requirements
     */
    extractRequirements(task) {
        const requirements = {
            realtime: task.realtime || false,
            streaming: task.streaming || task.volume?.size === 'xlarge',
            atomicity: task.atomic || false,
            idempotent: task.idempotent !== false,
            resumable: task.resumable !== false,
            parallel: task.parallel !== false && task.volume?.size !== 'small'
        };

        // Platform-specific requirements
        if (task.platform === 'hubspot') {
            requirements.rateLimit = true;
            requirements.bulkApi = task.volume?.count > 1000;
        }

        if (task.platform === 'salesforce') {
            requirements.bulkApi = task.volume?.count > 10000;
            requirements.governor = true;
        }

        return requirements;
    }

    /**
     * Identify constraints
     */
    identifyConstraints(task) {
        return {
            timeLimit: task.timeout || null,
            memoryLimit: task.maxMemory || null,
            apiLimit: task.maxApiCalls || null,
            costLimit: task.maxCost || null
        };
    }

    /**
     * Estimate required resources
     */
    async estimateResources(task) {
        const volume = task.volume?.count || 1000;
        const complexity = task.complexity || 0.5;

        return {
            estimatedTime: Math.ceil(volume * complexity / 100), // seconds
            estimatedMemory: Math.ceil(volume * 0.001), // MB
            estimatedApiCalls: Math.ceil(volume / 100),
            estimatedCost: Math.ceil(volume * 0.00001) // arbitrary units
        };
    }

    /**
     * Determine optimal routing
     */
    async determineRouting(analysis) {
        const candidates = await this.identifyCandidateAgents(analysis);

        if (candidates.length === 0) {
            throw new Error(`No suitable agent found for task type: ${analysis.type}`);
        }

        // Score each candidate
        const scores = candidates.map(agent => ({
            agent,
            score: this.scoreAgent(agent, analysis),
            reasoning: this.explainScore(agent, analysis)
        }));

        // Sort by score (highest first)
        scores.sort((a, b) => b.score - a.score);

        const selected = scores[0];

        this.log('info', `Routing to ${selected.agent.name} (score: ${selected.score.toFixed(2)})`, {
            reasoning: selected.reasoning
        });

        return {
            agent: selected.agent,
            score: selected.score,
            reasoning: selected.reasoning,
            alternatives: scores.slice(1, 3).map(s => s.agent.name),
            strategy: this.determineStrategy(analysis, selected.agent)
        };
    }

    /**
     * Identify candidate agents
     */
    async identifyCandidateAgents(analysis) {
        const candidates = [];

        for (const [name, agent] of this.agentRegistry) {
            const capabilities = this.config.agentCapabilities.get(name);

            if (!capabilities) continue;

            // Check type compatibility
            if (capabilities.supportedTypes.includes(analysis.type) ||
                capabilities.supportedTypes.includes('*')) {

                // Check volume compatibility
                if (this.isVolumeCompatible(capabilities, analysis.volume)) {
                    candidates.push(agent);
                }
            }
        }

        return candidates;
    }

    /**
     * Check volume compatibility
     */
    isVolumeCompatible(capabilities, volume) {
        if (!capabilities.volumeLimits) return true;

        const { min, max } = capabilities.volumeLimits;
        const count = volume.count;

        return (!min || count >= min) && (!max || count <= max);
    }

    /**
     * Score an agent for a task
     */
    scoreAgent(agent, analysis) {
        const capabilities = this.config.agentCapabilities.get(agent.name);
        if (!capabilities) return 0;

        let score = 0;

        // Type match score
        if (capabilities.supportedTypes.includes(analysis.type)) {
            score += 30;
        } else if (capabilities.supportedTypes.includes('*')) {
            score += 10;
        }

        // Volume optimization score
        const volumeScore = this.scoreVolume(capabilities, analysis.volume);
        score += volumeScore * 20;

        // Complexity handling score
        const complexityScore = this.scoreComplexity(capabilities, analysis.complexity);
        score += complexityScore * 20;

        // Performance history score
        const historyScore = this.scoreHistory(agent.name, analysis);
        score += historyScore * 15;

        // Resource efficiency score
        const efficiencyScore = this.scoreEfficiency(capabilities, analysis.estimatedResources);
        score += efficiencyScore * 15;

        return score;
    }

    /**
     * Score volume handling
     */
    scoreVolume(capabilities, volume) {
        if (!capabilities.optimalVolume) return 0.5;

        const optimal = capabilities.optimalVolume;
        const actual = volume.count;

        // Calculate distance from optimal
        const ratio = Math.min(actual, optimal) / Math.max(actual, optimal);
        return ratio;
    }

    /**
     * Score complexity handling
     */
    scoreComplexity(capabilities, complexity) {
        if (!capabilities.maxComplexity) return 0.5;

        if (complexity <= capabilities.maxComplexity) {
            return 1 - (complexity / capabilities.maxComplexity) * 0.5;
        }

        return 0.5 - (complexity - capabilities.maxComplexity);
    }

    /**
     * Score based on performance history
     */
    scoreHistory(agentName, analysis) {
        const history = this.performanceHistory.get(agentName);
        if (!history || history.length === 0) return 0.5;

        // Find similar tasks
        const similar = history.filter(h =>
            h.type === analysis.type &&
            Math.abs(h.volume - analysis.volume.count) / h.volume < 0.5
        );

        if (similar.length === 0) return 0.5;

        // Calculate average success rate
        const successRate = similar.reduce((sum, h) => sum + (h.success ? 1 : 0), 0) / similar.length;

        return successRate;
    }

    /**
     * Score resource efficiency
     */
    scoreEfficiency(capabilities, estimatedResources) {
        if (!capabilities.efficiency) return 0.5;

        const { costWeights } = this.config.routingRules;

        let score = 0;
        let totalWeight = 0;

        if (capabilities.efficiency.timePerRecord) {
            const timeScore = Math.min(1, estimatedResources.estimatedTime /
                                          (capabilities.efficiency.timePerRecord * estimatedResources.estimatedTime));
            score += timeScore * costWeights.time;
            totalWeight += costWeights.time;
        }

        if (capabilities.efficiency.memoryPerRecord) {
            const memScore = Math.min(1, estimatedResources.estimatedMemory /
                                        (capabilities.efficiency.memoryPerRecord * estimatedResources.estimatedMemory));
            score += memScore * costWeights.memory;
            totalWeight += costWeights.memory;
        }

        return totalWeight > 0 ? score / totalWeight : 0.5;
    }

    /**
     * Explain scoring decision
     */
    explainScore(agent, analysis) {
        const capabilities = this.config.agentCapabilities.get(agent.name);
        const reasons = [];

        if (capabilities.supportedTypes.includes(analysis.type)) {
            reasons.push(`Direct support for ${analysis.type} operations`);
        }

        if (capabilities.optimalVolume) {
            const ratio = analysis.volume.count / capabilities.optimalVolume;
            if (ratio > 0.8 && ratio < 1.2) {
                reasons.push(`Optimal for ${analysis.volume.size} volumes`);
            }
        }

        const history = this.performanceHistory.get(agent.name);
        if (history && history.length > 10) {
            const successRate = history.filter(h => h.success).length / history.length;
            if (successRate > 0.9) {
                reasons.push(`High success rate (${(successRate * 100).toFixed(1)}%)`);
            }
        }

        return reasons.join('; ');
    }

    /**
     * Determine execution strategy
     */
    determineStrategy(analysis, agent) {
        const strategy = {
            parallel: false,
            streaming: false,
            batching: false,
            batchSize: 1000,
            retryPolicy: 'exponential',
            monitoring: 'standard'
        };

        // Parallel processing for large volumes
        if (analysis.volume.count > 10000 && analysis.requirements.parallel) {
            strategy.parallel = true;
            strategy.workers = Math.min(4, Math.ceil(analysis.volume.count / 100000));
        }

        // Streaming for very large datasets
        if (analysis.volume.size === 'xlarge' || analysis.volume.size === 'massive') {
            strategy.streaming = true;
        }

        // Batching based on platform
        if (analysis.requirements.bulkApi) {
            strategy.batching = true;
            strategy.batchSize = agent.name.includes('hubspot') ? 100 : 10000;
        }

        // Enhanced monitoring for complex tasks
        if (analysis.complexity > 0.7 || analysis.priority === 'high') {
            strategy.monitoring = 'detailed';
        }

        return strategy;
    }

    /**
     * Execute with selected agent
     */
    async executeWithAgent(agent, task, routing) {
        try {
            // Apply strategy
            const enhancedTask = {
                ...task,
                strategy: routing.strategy,
                routingId: routing.id
            };

            // Send to agent
            const messageId = await this.sendMessage(agent.name, 'execute', enhancedTask);

            // Wait for response (with timeout)
            const response = await this.waitForResponse(messageId, task.timeout || 300000);

            if (response.success) {
                this.stats.correctRoutes++;
            }

            return response.result;

        } catch (error) {
            this.log('warn', `Execution failed with ${agent.name}, attempting reroute`, error);

            // Try alternative agent
            if (routing.alternatives.length > 0) {
                this.stats.reroutes++;
                const altAgent = this.agentRegistry.get(routing.alternatives[0]);
                return this.executeWithAgent(altAgent, task, { ...routing, alternatives: routing.alternatives.slice(1) });
            }

            throw error;
        }
    }

    /**
     * Wait for agent response
     */
    async waitForResponse(messageId, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Response timeout for message ${messageId}`));
            }, timeout);

            const handler = (message) => {
                if (message.correlationId === messageId) {
                    clearTimeout(timer);
                    this.off('message:response', handler);
                    resolve(message.payload);
                }
            };

            this.on('message:response', handler);
        });
    }

    /**
     * Update performance history
     */
    updatePerformanceHistory(agent, task, result, duration) {
        const agentName = agent.name;

        if (!this.performanceHistory.has(agentName)) {
            this.performanceHistory.set(agentName, []);
        }

        const history = this.performanceHistory.get(agentName);

        history.push({
            timestamp: Date.now(),
            type: task.type,
            volume: task.volume?.count || 0,
            complexity: task.complexity || 0,
            duration,
            success: !result.error,
            errorType: result.error?.type || null
        });

        // Keep history bounded
        if (history.length > this.config.maxHistorySize) {
            history.shift();
        }
    }

    /**
     * Predict performance for a task
     */
    predictPerformance(analysis) {
        const predictions = {};

        for (const [agentName, history] of this.performanceHistory) {
            const similar = history.filter(h =>
                h.type === analysis.type &&
                Math.abs(h.volume - analysis.volume.count) / h.volume < 0.3
            );

            if (similar.length >= 3) {
                predictions[agentName] = {
                    estimatedDuration: similar.reduce((sum, h) => sum + h.duration, 0) / similar.length,
                    successProbability: similar.filter(h => h.success).length / similar.length,
                    samples: similar.length
                };
            }
        }

        return predictions;
    }

    /**
     * Load agent capabilities configuration
     */
    async loadAgentCapabilities() {
        // Define capabilities for each agent type
        const capabilities = {
            'bulk-import-agent': {
                supportedTypes: ['import', 'upload', 'load'],
                volumeLimits: { min: 1000, max: 10000000 },
                optimalVolume: 100000,
                maxComplexity: 0.7,
                efficiency: {
                    timePerRecord: 0.001,
                    memoryPerRecord: 0.01,
                    apiCallsPerRecord: 0.001
                }
            },
            'deduplication-engine': {
                supportedTypes: ['dedupe', 'merge', 'consolidate'],
                volumeLimits: { min: 10, max: 1000000 },
                optimalVolume: 50000,
                maxComplexity: 0.9,
                efficiency: {
                    timePerRecord: 0.002,
                    memoryPerRecord: 0.02
                }
            },
            'bulk-export-agent': {
                supportedTypes: ['export', 'download', 'extract'],
                volumeLimits: { min: 1, max: 10000000 },
                optimalVolume: 500000,
                maxComplexity: 0.5,
                efficiency: {
                    timePerRecord: 0.0005,
                    memoryPerRecord: 0.005,
                    apiCallsPerRecord: 0.0001
                }
            }
        };

        for (const [name, caps] of Object.entries(capabilities)) {
            this.config.agentCapabilities.set(name, caps);
        }
    }

    /**
     * Register an agent
     */
    registerAgent(agent) {
        this.agentRegistry.set(agent.name, agent);
        this.addChild(agent);

        this.log('info', `Registered agent: ${agent.name}`);
    }

    /**
     * Get routing statistics
     */
    getStats() {
        const accuracy = this.stats.routingDecisions > 0
            ? this.stats.correctRoutes / this.stats.routingDecisions
            : 0;

        return {
            ...this.stats,
            accuracy: `${(accuracy * 100).toFixed(1)}%`,
            registeredAgents: this.agentRegistry.size,
            historySize: this.performanceHistory.size
        };
    }
}

// Export for use as library
module.exports = SmartRouter;

// CLI interface
if (require.main === module) {
    const { program } = require('commander');

    program
        .name('smart-router')
        .description('Intelligent task routing to specialized agents')
        .option('-f, --file <path>', 'Task definition file (JSON)')
        .option('-t, --type <type>', 'Task type')
        .option('-v, --volume <n>', 'Data volume', parseInt)
        .option('-p, --platform <platform>', 'Target platform')
        .parse(process.argv);

    const options = program.opts();

    async function main() {
        const router = new SmartRouter();
        await router.initialize();

        let task;

        if (options.file) {
            const content = await fs.readFile(options.file, 'utf8');
            task = JSON.parse(content);
        } else {
            task = {
                type: options.type || 'import',
                volume: { count: options.volume || 10000 },
                platform: options.platform || 'hubspot'
            };
        }

        console.log('📋 Analyzing task...');
        const analysis = await router.analyzeTask(task);

        console.log('\n📊 Task Analysis:');
        console.log(`  Type: ${analysis.type}`);
        console.log(`  Volume: ${analysis.volume.size} (${analysis.volume.count} records)`);
        console.log(`  Complexity: ${(analysis.complexity * 100).toFixed(1)}%`);

        console.log('\n🎯 Routing Decision:');
        const routing = await router.determineRouting(analysis);

        console.log(`  Selected Agent: ${routing.agent.name}`);
        console.log(`  Score: ${routing.score.toFixed(2)}`);
        console.log(`  Reasoning: ${routing.reasoning}`);

        if (routing.alternatives.length > 0) {
            console.log(`  Alternatives: ${routing.alternatives.join(', ')}`);
        }

        console.log('\n📈 Strategy:');
        console.log(`  Parallel: ${routing.strategy.parallel}`);
        console.log(`  Streaming: ${routing.strategy.streaming}`);
        console.log(`  Batch Size: ${routing.strategy.batchSize}`);

        await router.shutdown();
    }

    main().catch(console.error);
}