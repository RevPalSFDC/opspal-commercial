#!/usr/bin/env node

/**
 * Runtime Playbook Resolver
 * =========================
 * Dynamically matches tasks to appropriate playbooks
 * Provides intelligent playbook discovery and recommendation
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const PlaybookRegistry = require('./playbook-registry');

class PlaybookResolver {
    constructor(options = {}) {
        this.registry = new PlaybookRegistry(options);
        this.initialized = false;
        this.matchCache = new Map();
        this.executionLog = [];
        this.confidenceThreshold = options.confidenceThreshold || 0.5;
    }

    /**
     * Initialize resolver with registry
     */
    async initialize() {
        if (this.initialized) return;

        await this.registry.initialize();
        this.initialized = true;
        console.log('✅ Playbook Resolver initialized');
    }

    /**
     * Find relevant playbooks for a given task
     */
    async resolvePlaybooks(taskDescription, context = {}) {
        await this.initialize();

        // Check cache first
        const cacheKey = this.getCacheKey(taskDescription, context);
        if (this.matchCache.has(cacheKey)) {
            return this.matchCache.get(cacheKey);
        }

        // Extract task characteristics
        const taskProfile = this.analyzeTask(taskDescription, context);

        // Score all playbooks
        const matches = [];
        for (const playbook of this.registry.registry.playbooks) {
            const score = this.scorePlaybook(playbook, taskProfile);
            if (score.confidence > this.confidenceThreshold) {
                matches.push({
                    playbook: playbook.name,
                    path: playbook.path,
                    confidence: score.confidence,
                    reasons: score.reasons,
                    required: score.required
                });
            }
        }

        // Sort by confidence and requirement
        matches.sort((a, b) => {
            if (a.required !== b.required) {
                return b.required - a.required; // Required first
            }
            return b.confidence - a.confidence; // Then by confidence
        });

        // Cache result
        this.matchCache.set(cacheKey, matches);

        return matches;
    }

    /**
     * Analyze task to extract characteristics
     */
    analyzeTask(taskDescription, context) {
        const profile = {
            keywords: [],
            operations: [],
            objects: [],
            risks: [],
            environment: context.environment || 'unknown',
            agent: context.agent || 'unknown',
            urgency: context.urgency || 'normal'
        };

        // Convert to lowercase for analysis
        const lowerTask = taskDescription.toLowerCase();

        // Extract operation types
        const operations = {
            deployment: /\b(deploy|release|promote|push|rollout)\b/g,
            validation: /\b(validat|check|verify|test|audit|review)\b/g,
            rollback: /\b(rollback|revert|undo|restore|recover)\b/g,
            data: /\b(bulk|import|export|upsert|insert|update|delete|load|extract)\b/g,
            metadata: /\b(metadata|field|object|layout|profile|permission|flow|workflow)\b/g,
            report: /\b(report|dashboard|analytics|chart|metric)\b/g,
            error: /\b(error|fail|issue|problem|bug|fix|troubleshoot)\b/g,
            configuration: /\b(config|setting|setup|install|initialize)\b/g
        };

        for (const [op, pattern] of Object.entries(operations)) {
            if (pattern.test(lowerTask)) {
                profile.operations.push(op);
            }
        }

        // Extract Salesforce objects
        const objects = {
            account: /\b(account|accounts)\b/gi,
            contact: /\b(contact|contacts)\b/gi,
            opportunity: /\b(opportunit|opportunities|opp|opps)\b/gi,
            lead: /\b(lead|leads)\b/gi,
            case: /\b(case|cases)\b/gi,
            user: /\b(user|users)\b/gi,
            profile: /\b(profile|profiles)\b/gi,
            permission: /\b(permission|permissions|permset)\b/gi,
            flow: /\b(flow|flows|automation)\b/gi,
            report: /\b(report|reports|dashboard|dashboards)\b/gi
        };

        for (const [obj, pattern] of Object.entries(objects)) {
            if (pattern.test(lowerTask)) {
                profile.objects.push(obj);
            }
        }

        // Assess risk level
        const highRiskIndicators = [
            /\bproduction\b/,
            /\bprod\b/,
            /\blive\b/,
            /\bdelete\b/,
            /\bpurge\b/,
            /\bmass\b/,
            /\ball\b.*\brecords\b/,
            /\bbulk\b.*\bupdate\b/
        ];

        for (const indicator of highRiskIndicators) {
            if (indicator.test(lowerTask)) {
                profile.risks.push(indicator.source);
            }
        }

        // Extract general keywords
        const words = lowerTask.split(/\s+/);
        const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for']);
        profile.keywords = words.filter(w => w.length > 2 && !stopWords.has(w));

        return profile;
    }

    /**
     * Score a playbook against task profile
     */
    scorePlaybook(playbook, taskProfile) {
        const score = {
            confidence: 0,
            reasons: [],
            required: false,
            matches: {
                operations: 0,
                objects: 0,
                keywords: 0,
                triggers: 0,
                agent: 0,
                risk: 0
            }
        };

        // Check operation matches
        if (taskProfile.operations.length > 0) {
            const opMatches = taskProfile.operations.filter(op =>
                playbook.keywords.includes(op)
            ).length;
            score.matches.operations = opMatches / taskProfile.operations.length;
            if (opMatches > 0) {
                score.reasons.push(`Matches operations: ${taskProfile.operations.filter(op => playbook.keywords.includes(op)).join(', ')}`);
            }
        }

        // Check object matches
        if (taskProfile.objects.length > 0 && playbook.keywords) {
            const objMatches = taskProfile.objects.filter(obj =>
                playbook.keywords.some(kw => kw.includes(obj) || obj.includes(kw))
            ).length;
            score.matches.objects = objMatches / taskProfile.objects.length;
            if (objMatches > 0) {
                score.reasons.push(`Relevant to objects: ${taskProfile.objects.filter(obj => playbook.keywords.some(kw => kw.includes(obj))).join(', ')}`);
            }
        }

        // Check trigger matches
        if (playbook.triggers) {
            for (const trigger of playbook.triggers) {
                const triggerText = trigger.text || trigger;
                const triggerLower = triggerText.toLowerCase();
                for (const keyword of taskProfile.keywords) {
                    if (triggerLower.includes(keyword)) {
                        score.matches.triggers++;
                    }
                }
            }
            if (score.matches.triggers > 0) {
                score.reasons.push('Matches playbook triggers');
            }
        }

        // Check agent match
        if (playbook.agents && playbook.agents.includes(taskProfile.agent)) {
            score.matches.agent = 1;
            score.reasons.push(`Configured for agent: ${taskProfile.agent}`);
        }

        // Check risk correlation
        if (taskProfile.risks.length > 0) {
            // High-risk tasks should use validation/rollback playbooks
            if (playbook.name.includes('validation') ||
                playbook.name.includes('rollback') ||
                playbook.name.includes('pre-deployment')) {
                score.matches.risk = 1;
                score.reasons.push('Recommended for high-risk operations');
                score.required = true;
            }
        }

        // Special case: deployment always needs validation
        if (taskProfile.operations.includes('deployment') &&
            playbook.name.includes('pre-deployment-validation')) {
            score.required = true;
            score.reasons.push('Required for all deployments');
        }

        // Calculate overall confidence
        const weights = {
            operations: 0.35,
            objects: 0.15,
            keywords: 0.15,
            triggers: 0.20,
            agent: 0.10,
            risk: 0.05
        };

        score.confidence = Object.entries(score.matches).reduce((total, [key, value]) => {
            return total + (value * (weights[key] || 0));
        }, 0);

        // Boost confidence for required playbooks
        if (score.required) {
            score.confidence = Math.max(score.confidence, 0.8);
        }

        return score;
    }

    /**
     * Get cache key for task
     */
    getCacheKey(taskDescription, context) {
        const contextKey = JSON.stringify({
            env: context.environment,
            agent: context.agent,
            urgency: context.urgency
        });
        return `${taskDescription}::${contextKey}`;
    }

    /**
     * Resolve playbook for specific agent
     */
    async resolveForAgent(agentName, taskDescription) {
        await this.initialize();

        // Get agent's configured playbooks
        const agentPlaybooks = this.registry.getAgentPlaybooks(agentName);

        // First check explicit playbooks
        if (agentPlaybooks.explicit.length > 0) {
            const explicitMatches = await this.resolvePlaybooks(taskDescription, { agent: agentName });
            const configured = explicitMatches.filter(m =>
                agentPlaybooks.explicit.includes(m.playbook)
            );
            if (configured.length > 0) {
                return configured;
            }
        }

        // Then check implicit playbooks
        if (agentPlaybooks.implicit.length > 0) {
            const implicitMatches = await this.resolvePlaybooks(taskDescription, { agent: agentName });
            const inferred = implicitMatches.filter(m =>
                agentPlaybooks.implicit.includes(m.playbook)
            );
            if (inferred.length > 0) {
                return inferred;
            }
        }

        // Finally, general resolution
        return await this.resolvePlaybooks(taskDescription, { agent: agentName });
    }

    /**
     * Get execution instructions for a playbook
     */
    async getExecutionInstructions(playbookName) {
        await this.initialize();

        const metadata = this.registry.getPlaybookMetadata(playbookName);
        if (!metadata) {
            throw new Error(`Playbook '${playbookName}' not found`);
        }

        const content = await this.registry.getPlaybookContent(playbookName);

        // Parse content for structured instructions
        const instructions = {
            name: playbookName,
            version: metadata.version,
            preconditions: metadata.preconditions,
            steps: [],
            fallbacks: [],
            references: metadata.scripts
        };

        // Extract workflow steps
        const lines = content.split('\n');
        let inWorkflow = false;
        let inFallback = false;
        let stepNumber = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes('## Workflow')) {
                inWorkflow = true;
                inFallback = false;
                continue;
            } else if (line.includes('## Failure Handling') || line.includes('## Fallback')) {
                inWorkflow = false;
                inFallback = true;
                continue;
            } else if (line.startsWith('## ')) {
                inWorkflow = false;
                inFallback = false;
                continue;
            }

            if (inWorkflow) {
                // Parse numbered steps
                const stepMatch = line.match(/^(\d+)\.\s+\*\*(.*?)\*\*/);
                if (stepMatch) {
                    stepNumber = parseInt(stepMatch[1]);
                    instructions.steps[stepNumber - 1] = {
                        number: stepNumber,
                        title: stepMatch[2],
                        description: '',
                        commands: []
                    };
                } else if (stepNumber > 0) {
                    // Parse code blocks
                    if (line.includes('```')) {
                        let codeBlock = [];
                        i++;
                        while (i < lines.length && !lines[i].includes('```')) {
                            codeBlock.push(lines[i]);
                            i++;
                        }
                        if (instructions.steps[stepNumber - 1]) {
                            instructions.steps[stepNumber - 1].commands.push(codeBlock.join('\n'));
                        }
                    } else if (line.trim() && instructions.steps[stepNumber - 1]) {
                        instructions.steps[stepNumber - 1].description += line.trim() + ' ';
                    }
                }
            }

            if (inFallback && line.startsWith('- ')) {
                instructions.fallbacks.push(line.substring(2).trim());
            }
        }

        return instructions;
    }

    /**
     * Log playbook execution
     */
    logExecution(playbookName, agent, result) {
        const entry = {
            timestamp: new Date().toISOString(),
            playbook: playbookName,
            agent: agent,
            result: result,
            version: null
        };

        // Get playbook version
        const metadata = this.registry.getPlaybookMetadata(playbookName);
        if (metadata) {
            entry.version = metadata.version;
        }

        this.executionLog.push(entry);

        // Also write to file
        const logDir = path.join(__dirname, '../../logs/playbook-execution');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.jsonl`);
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');

        return entry;
    }

    /**
     * Get recent execution history
     */
    getExecutionHistory(limit = 10) {
        return this.executionLog.slice(-limit);
    }

    /**
     * Validate task against playbook requirements
     */
    async validateTask(taskDescription, playbookName) {
        await this.initialize();

        const instructions = await this.getExecutionInstructions(playbookName);
        const validation = {
            valid: true,
            missingPreconditions: [],
            warnings: []
        };

        // Check preconditions
        for (const precondition of instructions.preconditions) {
            // Simple keyword check for now
            const keywords = precondition.toLowerCase().split(/\s+/)
                .filter(w => w.length > 3);
            const taskLower = taskDescription.toLowerCase();
            const met = keywords.some(kw => taskLower.includes(kw));

            if (!met) {
                validation.valid = false;
                validation.missingPreconditions.push(precondition);
            }
        }

        // Check for risk indicators
        if (taskDescription.toLowerCase().includes('production') &&
            !playbookName.includes('production')) {
            validation.warnings.push('Task mentions production but playbook may not be production-ready');
        }

        return validation;
    }

    /**
     * Generate decision tree for task
     */
    async generateDecisionTree(taskDescription) {
        const matches = await this.resolvePlaybooks(taskDescription);

        const tree = {
            task: taskDescription,
            decision: null,
            alternatives: [],
            reasoning: []
        };

        if (matches.length === 0) {
            tree.decision = 'NO_PLAYBOOK_NEEDED';
            tree.reasoning.push('No matching playbooks found for this task');
        } else if (matches[0].required) {
            tree.decision = 'USE_REQUIRED_PLAYBOOK';
            tree.playbook = matches[0].playbook;
            tree.reasoning = matches[0].reasons;
        } else if (matches[0].confidence > 0.7) {
            tree.decision = 'USE_RECOMMENDED_PLAYBOOK';
            tree.playbook = matches[0].playbook;
            tree.confidence = matches[0].confidence;
            tree.reasoning = matches[0].reasons;
            tree.alternatives = matches.slice(1, 3).map(m => ({
                playbook: m.playbook,
                confidence: m.confidence
            }));
        } else {
            tree.decision = 'CONSIDER_PLAYBOOK';
            tree.playbook = matches[0].playbook;
            tree.confidence = matches[0].confidence;
            tree.reasoning = ['Low confidence match - review before using'];
            tree.alternatives = matches.slice(1, 3).map(m => ({
                playbook: m.playbook,
                confidence: m.confidence
            }));
        }

        return tree;
    }
}

// CLI interface
if (require.main === module) {
    const resolver = new PlaybookResolver();
    const command = process.argv[2] || 'help';

    const commands = {
        async resolve() {
            const task = process.argv.slice(3).join(' ');
            if (!task) {
                console.error('Usage: node playbook-resolver.js resolve <task description>');
                process.exit(1);
            }

            const matches = await resolver.resolvePlaybooks(task);

            console.log(`\n🔍 Playbooks for: "${task}"\n`);
            if (matches.length === 0) {
                console.log('No matching playbooks found.');
            } else {
                matches.forEach((match, i) => {
                    const indicator = match.required ? '🔴' : match.confidence > 0.7 ? '🟢' : '🟡';
                    console.log(`${i + 1}. ${indicator} ${match.playbook} (${(match.confidence * 100).toFixed(0)}% confidence)`);
                    match.reasons.forEach(reason => {
                        console.log(`   - ${reason}`);
                    });
                    console.log('');
                });
            }
        },

        async instructions() {
            const playbook = process.argv[3];
            if (!playbook) {
                console.error('Usage: node playbook-resolver.js instructions <playbook-name>');
                process.exit(1);
            }

            const instructions = await resolver.getExecutionInstructions(playbook);

            console.log(`\n📖 Execution Instructions: ${playbook}\n`);
            console.log(`Version: ${instructions.version}`);
            console.log('\nPreconditions:');
            instructions.preconditions.forEach(p => console.log(`  ✓ ${p}`));
            console.log('\nSteps:');
            instructions.steps.forEach(step => {
                console.log(`\n${step.number}. ${step.title}`);
                if (step.description) {
                    console.log(`   ${step.description}`);
                }
                if (step.commands.length > 0) {
                    console.log('   Commands:');
                    step.commands.forEach(cmd => {
                        console.log(`   \`\`\`\n${cmd}\n   \`\`\``);
                    });
                }
            });
            if (instructions.fallbacks.length > 0) {
                console.log('\nFallback Procedures:');
                instructions.fallbacks.forEach(f => console.log(`  • ${f}`));
            }
        },

        async decide() {
            const task = process.argv.slice(3).join(' ');
            if (!task) {
                console.error('Usage: node playbook-resolver.js decide <task description>');
                process.exit(1);
            }

            const tree = await resolver.generateDecisionTree(task);

            console.log(`\n🌳 Decision Tree for: "${task}"\n`);
            console.log(`Decision: ${tree.decision}`);
            if (tree.playbook) {
                console.log(`Playbook: ${tree.playbook}`);
                if (tree.confidence) {
                    console.log(`Confidence: ${(tree.confidence * 100).toFixed(0)}%`);
                }
            }
            console.log('\nReasoning:');
            tree.reasoning.forEach(r => console.log(`  • ${r}`));

            if (tree.alternatives && tree.alternatives.length > 0) {
                console.log('\nAlternatives:');
                tree.alternatives.forEach(alt => {
                    console.log(`  • ${alt.playbook} (${(alt.confidence * 100).toFixed(0)}%)`);
                });
            }
        },

        async validate() {
            const [task, playbook] = process.argv.slice(3);
            if (!task || !playbook) {
                console.error('Usage: node playbook-resolver.js validate "<task>" <playbook>');
                process.exit(1);
            }

            const validation = await resolver.validateTask(task, playbook);

            console.log(`\n✅ Validation: ${playbook} for "${task}"\n`);
            if (validation.valid) {
                console.log('✅ All preconditions met');
            } else {
                console.log('❌ Missing preconditions:');
                validation.missingPreconditions.forEach(p => console.log(`  • ${p}`));
            }
            if (validation.warnings.length > 0) {
                console.log('\n⚠️  Warnings:');
                validation.warnings.forEach(w => console.log(`  • ${w}`));
            }
        },

        help() {
            console.log(`
Playbook Resolver - Dynamic Task-to-Playbook Matching

Usage: node scripts/lib/playbook-resolver.js <command> [args]

Commands:
  resolve <task>      - Find matching playbooks for a task
  instructions <name> - Get execution instructions for a playbook
  decide <task>       - Generate decision tree for task
  validate <task> <playbook> - Validate task against playbook
  help               - Show this help message

Examples:
  node playbook-resolver.js resolve "deploy metadata to production"
  node playbook-resolver.js instructions pre-deployment-validation
  node playbook-resolver.js decide "bulk import 10000 contacts"
  node playbook-resolver.js validate "deploy flow" deployment-rollback
            `);
        }
    };

    const cmd = commands[command] || commands.help;
    cmd().catch(console.error);
}

module.exports = PlaybookResolver;