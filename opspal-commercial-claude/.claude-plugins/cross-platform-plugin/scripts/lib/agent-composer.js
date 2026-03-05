#!/usr/bin/env node

/**
 * Agent Composer - Multi-Agent Workflow Composition
 *
 * Breaks down complex tasks into multi-agent workflows with proper ordering
 * and dependency management. Enables parallel execution where possible.
 *
 * @version 1.0.0
 * @date 2025-01-08
 */

const fs = require('fs');
const path = require('path');

class AgentComposer {
    constructor(options = {}) {
        this.routingIndexPath = options.routingIndexPath ||
            path.join(__dirname, '../../../cross-platform-plugin/routing-index.json');
        this.verbose = options.verbose || false;

        // Load routing index
        this.loadRoutingIndex();

        // Agent capability patterns
        this.capabilities = {
            discovery: ['discover', 'analyze', 'audit', 'assess', 'inventory', 'query', 'inspect'],
            planning: ['plan', 'design', 'architect', 'estimate', 'scope', 'recommend'],
            validation: ['validate', 'verify', 'check', 'test', 'review', 'quality'],
            transformation: ['migrate', 'convert', 'transform', 'refactor', 'restructure'],
            deployment: ['deploy', 'release', 'publish', 'install', 'activate'],
            conflict: ['conflict', 'resolve', 'fix', 'debug', 'troubleshoot'],
            merge: ['merge', 'consolidate', 'combine', 'deduplicate', 'unify'],
            orchestration: ['orchestrate', 'coordinate', 'manage', 'supervise', 'delegate'],
            reporting: ['report', 'document', 'export', 'summarize', 'visualize']
        };

        // Standard workflow templates
        this.workflowTemplates = {
            deployment: ['discovery', 'validation', 'conflict', 'deployment', 'validation'],
            migration: ['discovery', 'planning', 'validation', 'transformation', 'deployment', 'validation'],
            assessment: ['discovery', 'validation', 'reporting'],
            merge: ['discovery', 'conflict', 'merge', 'validation', 'reporting'],
            refactoring: ['discovery', 'planning', 'validation', 'transformation', 'validation']
        };
    }

    /**
     * Load routing index from JSON
     */
    loadRoutingIndex() {
        if (!fs.existsSync(this.routingIndexPath)) {
            throw new Error(`Routing index not found: ${this.routingIndexPath}`);
        }

        this.routingIndex = JSON.parse(fs.readFileSync(this.routingIndexPath, 'utf-8'));
        this.log(`Loaded routing index: ${this.routingIndex.totalAgents} agents`);
    }

    /**
     * Compose a multi-agent workflow for a complex task
     * @param {string} taskDescription - Task to decompose
     * @returns {Object} Composition result with agent workflow
     */
    compose(taskDescription) {
        const lowercaseTask = taskDescription.toLowerCase();

        // Detect required capabilities
        const requiredCapabilities = this.detectCapabilities(lowercaseTask);

        // Determine workflow template
        const template = this.selectTemplate(lowercaseTask, requiredCapabilities);

        // Map capabilities to agents
        const workflow = this.buildWorkflow(requiredCapabilities, template);

        // Optimize for parallel execution
        const optimized = this.optimizeWorkflow(workflow);

        // Generate execution plan
        const executionPlan = this.generateExecutionPlan(optimized);

        return {
            taskDescription,
            capabilities: requiredCapabilities,
            template: template.name,
            workflow: optimized,
            executionPlan,
            estimatedDuration: this.estimateDuration(optimized),
            parallelizationFactor: this.calculateParallelization(optimized)
        };
    }

    /**
     * Detect required capabilities from task description
     */
    detectCapabilities(taskDescription) {
        const detected = [];

        for (const [capability, patterns] of Object.entries(this.capabilities)) {
            for (const pattern of patterns) {
                if (taskDescription.includes(pattern)) {
                    detected.push(capability);
                    break;
                }
            }
        }

        // Add implicit capabilities based on task complexity
        if (this.isComplex(taskDescription)) {
            if (!detected.includes('planning')) {
                detected.push('planning');
            }
            if (!detected.includes('validation')) {
                detected.push('validation');
            }
        }

        return detected;
    }

    /**
     * Check if task is complex
     */
    isComplex(taskDescription) {
        const complexityIndicators = [
            /\b(production|prod|live)\b/i,
            /\b(bulk|multiple|all|many)\b/i,
            /\b(migrate|migration)\b/i,
            /\b(across|between)\b.*\b(systems?|platforms?|orgs?)\b/i,
            /\b\d{2,}\b/ // Numbers indicating bulk operations
        ];

        return complexityIndicators.some(pattern => pattern.test(taskDescription));
    }

    /**
     * Select workflow template based on task
     */
    selectTemplate(taskDescription, capabilities) {
        // Check for explicit workflow types
        if (/\b(deploy|release|push)\b/i.test(taskDescription)) {
            return { name: 'deployment', steps: this.workflowTemplates.deployment };
        }
        if (/\b(migrat|import|transfer)\b/i.test(taskDescription)) {
            return { name: 'migration', steps: this.workflowTemplates.migration };
        }
        if (/\b(assess|audit|analyz|review)\b/i.test(taskDescription)) {
            return { name: 'assessment', steps: this.workflowTemplates.assessment };
        }
        if (/\b(merge|consolidate|dedupe)\b/i.test(taskDescription)) {
            return { name: 'merge', steps: this.workflowTemplates.merge };
        }
        if (/\b(refactor|restructure|reorganize)\b/i.test(taskDescription)) {
            return { name: 'refactoring', steps: this.workflowTemplates.refactoring };
        }

        // Default: build workflow from detected capabilities
        return {
            name: 'custom',
            steps: capabilities.length > 0 ? capabilities : ['discovery', 'reporting']
        };
    }

    /**
     * Build workflow by mapping capabilities to agents
     */
    buildWorkflow(capabilities, template) {
        const workflow = [];

        for (const step of template.steps) {
            const agents = this.findAgentsForCapability(step);

            if (agents.length > 0) {
                workflow.push({
                    phase: step,
                    agents: agents.slice(0, 3), // Top 3 agents for this capability
                    primaryAgent: agents[0],
                    parallel: this.canRunParallel(step)
                });
            }
        }

        return workflow;
    }

    /**
     * Find agents matching a capability
     */
    findAgentsForCapability(capability) {
        const patterns = this.capabilities[capability] || [capability];
        const matchingAgents = [];

        for (const [agentName, agent] of Object.entries(this.routingIndex.agents)) {
            let score = 0;

            // Check agent name
            const agentNameLower = agentName.toLowerCase();
            for (const pattern of patterns) {
                if (agentNameLower.includes(pattern)) {
                    score += 3;
                }
            }

            // Check keywords
            if (agent.triggerKeywords) {
                for (const keyword of agent.triggerKeywords) {
                    for (const pattern of patterns) {
                        if (keyword.toLowerCase().includes(pattern)) {
                            score += 1;
                        }
                    }
                }
            }

            // Check description
            if (agent.description) {
                const descLower = agent.description.toLowerCase();
                for (const pattern of patterns) {
                    if (descLower.includes(pattern)) {
                        score += 2;
                    }
                }
            }

            if (score > 0) {
                matchingAgents.push({ agent: agentName, score, metadata: agent });
            }
        }

        // Sort by score (descending)
        matchingAgents.sort((a, b) => b.score - a.score);

        return matchingAgents.map(m => m.agent);
    }

    /**
     * Check if phase can run in parallel
     */
    canRunParallel(phase) {
        // Phases that can run in parallel with others
        const parallelizable = ['validation', 'reporting', 'discovery'];
        return parallelizable.includes(phase);
    }

    /**
     * Optimize workflow for parallel execution
     */
    optimizeWorkflow(workflow) {
        const optimized = [];
        let currentGroup = [];

        for (let i = 0; i < workflow.length; i++) {
            const step = workflow[i];

            if (step.parallel && currentGroup.length === 0) {
                // Start a new parallel group
                currentGroup.push(step);
            } else if (step.parallel && currentGroup.length > 0 &&
                       currentGroup[0].parallel) {
                // Add to existing parallel group
                currentGroup.push(step);
            } else {
                // Flush current group if any
                if (currentGroup.length > 0) {
                    optimized.push({
                        type: 'parallel',
                        steps: currentGroup
                    });
                    currentGroup = [];
                }
                // Add sequential step
                optimized.push({
                    type: 'sequential',
                    steps: [step]
                });
            }
        }

        // Flush remaining group
        if (currentGroup.length > 0) {
            optimized.push({
                type: 'parallel',
                steps: currentGroup
            });
        }

        return optimized;
    }

    /**
     * Generate execution plan with instructions
     */
    generateExecutionPlan(workflow) {
        const plan = [];
        let stepNumber = 1;

        for (const group of workflow) {
            if (group.type === 'sequential') {
                for (const step of group.steps) {
                    plan.push({
                        step: stepNumber++,
                        type: 'sequential',
                        phase: step.phase,
                        agent: step.primaryAgent,
                        alternatives: step.agents.slice(1),
                        instruction: `Use ${step.primaryAgent} to ${step.phase}`
                    });
                }
            } else {
                // Parallel group
                const parallelSteps = group.steps.map((step, idx) => ({
                    substep: String.fromCharCode(97 + idx), // a, b, c...
                    phase: step.phase,
                    agent: step.primaryAgent,
                    alternatives: step.agents.slice(1)
                }));

                plan.push({
                    step: stepNumber++,
                    type: 'parallel',
                    phases: group.steps.map(s => s.phase),
                    substeps: parallelSteps,
                    instruction: `Run in parallel: ${parallelSteps.map(s =>
                        `${s.agent} (${s.phase})`).join(', ')}`
                });
            }
        }

        return plan;
    }

    /**
     * Estimate workflow duration
     */
    estimateDuration(workflow) {
        let totalMinutes = 0;

        for (const group of workflow) {
            if (group.type === 'sequential') {
                // Sequential: add all durations
                totalMinutes += group.steps.length * 5; // 5 min per step
            } else {
                // Parallel: take max duration
                const maxDuration = Math.max(...group.steps.map(() => 5));
                totalMinutes += maxDuration;
            }
        }

        return {
            minutes: totalMinutes,
            hours: (totalMinutes / 60).toFixed(1),
            formatted: totalMinutes < 60 ?
                `${totalMinutes} minutes` :
                `${(totalMinutes / 60).toFixed(1)} hours`
        };
    }

    /**
     * Calculate parallelization factor
     */
    calculateParallelization(workflow) {
        const totalSteps = workflow.reduce((sum, group) =>
            sum + group.steps.length, 0);

        const parallelGroups = workflow.filter(g => g.type === 'parallel').length;

        const parallelSteps = workflow
            .filter(g => g.type === 'parallel')
            .reduce((sum, g) => sum + g.steps.length, 0);

        return {
            totalSteps,
            parallelSteps,
            parallelGroups,
            percentage: totalSteps > 0 ?
                Math.round((parallelSteps / totalSteps) * 100) : 0,
            speedup: totalSteps > 0 ?
                (totalSteps / (totalSteps - parallelSteps + parallelGroups)).toFixed(1) : 1
        };
    }

    /**
     * Format composition result for display
     */
    format(result) {
        const lines = [];

        lines.push('='.repeat(70));
        lines.push('Agent Composition Plan');
        lines.push('='.repeat(70));
        lines.push(`Task: ${result.taskDescription}`);
        lines.push(`Template: ${result.template}`);
        lines.push(`Estimated Duration: ${result.estimatedDuration.formatted}`);
        lines.push(`Parallelization: ${result.parallelizationFactor.percentage}% ` +
            `(${result.parallelizationFactor.speedup}x speedup)`);
        lines.push('');

        lines.push('Detected Capabilities:');
        lines.push('-'.repeat(70));
        for (const capability of result.capabilities) {
            lines.push(`  • ${capability}`);
        }
        lines.push('');

        lines.push('Execution Plan:');
        lines.push('-'.repeat(70));

        for (const step of result.executionPlan) {
            if (step.type === 'sequential') {
                lines.push(`Step ${step.step}: ${step.instruction}`);
                if (step.alternatives && step.alternatives.length > 0) {
                    lines.push(`  Alternatives: ${step.alternatives.join(', ')}`);
                }
            } else {
                lines.push(`Step ${step.step}: ${step.instruction}`);
                for (const substep of step.substeps) {
                    lines.push(`  ${step.step}${substep.substep}. ${substep.agent} (${substep.phase})`);
                    if (substep.alternatives && substep.alternatives.length > 0) {
                        lines.push(`      Alternatives: ${substep.alternatives.join(', ')}`);
                    }
                }
            }
            lines.push('');
        }

        lines.push('='.repeat(70));

        return lines.join('\n');
    }

    /**
     * Log message if verbose
     */
    log(message) {
        if (this.verbose) {
            console.log(`[COMPOSER] ${message}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log('Usage: agent-composer.js [options] <task description>');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h          Show this help message');
        console.log('  --verbose, -v       Show detailed output');
        console.log('  --json              Output as JSON');
        console.log('');
        console.log('Examples:');
        console.log('  agent-composer.js "Migrate account data to new Salesforce org"');
        console.log('  agent-composer.js "Deploy validation rules to production"');
        console.log('  agent-composer.js "Merge 50 duplicate accounts in Salesforce"');
        process.exit(0);
    }

    const verbose = args.includes('--verbose') || args.includes('-v');
    const json = args.includes('--json');

    try {
        const composer = new AgentComposer({ verbose });

        // Get task description
        const taskDescription = args
            .filter(a => !a.startsWith('-'))
            .join(' ');

        if (!taskDescription) {
            console.error('Error: No task description provided');
            process.exit(1);
        }

        // Compose workflow
        const result = composer.compose(taskDescription);

        if (json) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log(composer.format(result));
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = { AgentComposer };
