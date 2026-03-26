#!/usr/bin/env node

/**
 * Auto Agent Router - Automatic agent invocation based on patterns and complexity
 * Monitors operations and routes to appropriate agents without user intervention
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    purple: '\x1b[35m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

class AutoAgentRouter {
    constructor() {
        // Use CLAUDE_PLUGIN_ROOT if available, otherwise fallback to relative path
        const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');
        this.configPath = path.join(pluginRoot, '.claude/agent-triggers.json');
        this.analyticsPath = path.join(pluginRoot, '.claude/agent-usage-data.json');
        this.config = this.loadConfig();
        this.analytics = this.loadAnalytics();
        this.complexityThreshold = 0.7;
        this.autoInvokeEnabled = true;
    }

    loadConfig() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Warning: Could not load agent triggers config');
            return { triggers: { mandatory: { patterns: [] } } };
        }
    }

    loadAnalytics() {
        try {
            if (fs.existsSync(this.analyticsPath)) {
                return JSON.parse(fs.readFileSync(this.analyticsPath, 'utf8'));
            }
        } catch (error) {
            // Ignore
        }
        return { agentUsage: {}, autoInvocations: [] };
    }

    saveAnalytics() {
        try {
            fs.writeFileSync(this.analyticsPath, JSON.stringify(this.analytics, null, 2));
        } catch (error) {
            // Ignore save errors
        }
    }

    /**
     * Calculate operation complexity score
     */
    calculateComplexity(operation) {
        let score = 0;

        // Check for multiple objects/fields
        const objectMatches = operation.match(/object|field|class|trigger/gi) || [];
        score += objectMatches.length * 0.1;

        // Check for bulk operations
        if (/bulk|mass|batch|multiple/i.test(operation)) {
            score += 0.3;
        }

        // Check for production environment
        if (/production|prod|release/i.test(operation)) {
            score += 0.4;
        }

        // Check for dependencies
        if (/dependency|depends|relationship|junction/i.test(operation)) {
            score += 0.2;
        }

        // Check for complex patterns
        if (/merge|consolidate|migrate|transform/i.test(operation)) {
            score += 0.3;
        }

        // Layout generation is low-medium complexity (persona-driven)
        if (/layout|flexipage|lightning page|page layout/i.test(operation)) {
            score += 0.2;
        }

        // Check command complexity (pipes, flags, etc.)
        const pipeCount = (operation.match(/\|/g) || []).length;
        const flagCount = (operation.match(/ -/g) || []).length;
        score += (pipeCount * 0.1) + (flagCount * 0.05);

        // Check for error/conflict patterns
        if (/error|failed|conflict|issue|problem/i.test(operation)) {
            score += 0.3;
        }

        return Math.min(score, 1.0); // Cap at 1.0
    }

    /**
     * Detect persona from operation text
     * Returns persona name or null if not detected
     */
    detectPersona(operation) {
        const personaAliases = {
            'sales-rep': /\b(sales rep|AE|account executive|sales person|rep)\b/i,
            'sales-manager': /\b(sales manager|VP sales|sales lead|manager)\b/i,
            'executive': /\b(executive|exec|C-level|VP|CXO|CEO|CFO|CRO)\b/i,
            'support-agent': /\b(support agent|service agent|case manager|support|service)\b/i,
            'support-manager': /\b(support manager|service manager|support lead)\b/i,
            'marketing': /\b(marketing|marketing ops|marketer|marketing user|CMO)\b/i,
            'customer-success': /\b(customer success|CSM|customer success manager|CS team|customer service|account manager)\b/i
        };

        for (const [persona, pattern] of Object.entries(personaAliases)) {
            if (pattern.test(operation)) {
                return persona;
            }
        }

        return null;
    }

    /**
     * Detect parallelizable patterns
     */
    hasParallelizablePattern(operation) {
        // Explicit parallelization
        const explicitParallel = /\b(in parallel|concurrently|simultaneously|all at once)\b/i.test(operation);

        // Multiple targets (comma-separated lists or "all X")
        // Matches: "plugin-a, plugin-b" or "salesforce-plugin, hubspot-plugin" or "all 5"
        const multipleTargets = /([\w-]*)(plugin|agent|file|org|instance)([\w-]*),\s*([\w-]*)(plugin|agent|file|org|instance)|all \d+/i.test(operation);

        // Multiple actions with AND
        const multipleActions = /\b(analyze|generate|create|update|deploy|process)\b.*\bAND\b.*\b(analyze|generate|create|update|deploy|process)\b/i.test(operation);

        // Batch operations with "all/every/each"
        const batchPattern = /\b(all|every|each)\b.*\b(plugin|agent|script|command|file|org|instance|reflection|report)\b/i.test(operation);

        return explicitParallel || multipleTargets || multipleActions || batchPattern;
    }

    /**
     * Find the best matching agent for an operation
     */
    findBestAgent(operation, complexity) {
        // Check for explicit supervisor override flag FIRST (absolute priority)
        if (/\[SUPERVISOR\]/i.test(operation)) {
            return {
                agent: 'supervisor-auditor',
                confidence: 1.0,
                reason: 'Explicit [SUPERVISOR] flag detected'
            };
        }

        // Check for Supervisor-Auditor triggers (high priority for complex parallel work)
        if (complexity >= this.complexityThreshold || this.hasParallelizablePattern(operation)) {

            // Check for direct execution override (skip supervisor)
            if (/\[DIRECT\]/i.test(operation)) {
                // Continue to regular routing
            } else if (this.hasParallelizablePattern(operation)) {
                // Parallelizable pattern detected - use supervisor
                return {
                    agent: 'supervisor-auditor',
                    confidence: 0.95,
                    reason: 'Parallelizable pattern detected - supervisor will decompose and execute in parallel'
                };
            } else if (complexity >= this.complexityThreshold) {
                // High complexity without clear parallelization - check if planning vs orchestration
                if (/plan|strategy|design|architecture/i.test(operation)) {
                    return {
                        agent: 'sfdc-planner',
                        confidence: 0.95,
                        reason: 'High complexity planning task'
                    };
                }
                // Default to orchestrator for high complexity without parallelization
                return {
                    agent: 'sfdc-orchestrator',
                    confidence: 0.9,
                    reason: 'High complexity operation requires orchestration'
                };
            }
        }

        // Medium complexity with parallelization hints - consider supervisor
        if (complexity >= 0.5 && this.hasParallelizablePattern(operation)) {
            return {
                agent: 'supervisor-auditor',
                confidence: 0.85,
                reason: 'Medium complexity with parallelization opportunity'
            };
        }

        // Check mandatory patterns first
        const mandatoryPatterns = this.config.triggers?.mandatory?.patterns || [];
        for (const pattern of mandatoryPatterns) {
            if (new RegExp(pattern.pattern, 'i').test(operation)) {
                return {
                    agent: pattern.agent,
                    confidence: 1.0,
                    reason: pattern.message
                };
            }
        }

        // Check for layout generation patterns (high priority - before keyword mappings)
        const layoutPattern = /\b(create|generate|design|make|build)\b.*\b(layout|lightning page|flexipage|page layout)\b/i;
        const layoutAnalysisPattern = /\b(analyze|review|audit|check|assess)\b.*\b(layout|lightning page|flexipage)\b/i;

        if (layoutPattern.test(operation)) {
            const persona = this.detectPersona(operation);
            const objectMatch = operation.match(/\b(contact|account|opportunity|lead|case|custom)\b/i);

            return {
                agent: 'sfdc-layout-generator',
                confidence: 0.85,
                reason: `Layout generation detected${persona ? ` (persona: ${persona})` : ''}${objectMatch ? ` for ${objectMatch[0]}` : ''}`,
                metadata: {
                    persona: persona,
                    object: objectMatch ? objectMatch[0] : null
                }
            };
        }

        if (layoutAnalysisPattern.test(operation)) {
            return {
                agent: 'sfdc-layout-analyzer',
                confidence: 0.85,
                reason: 'Layout analysis detected'
            };
        }

        // Route Apex rollup type-conversion failures to field diagnostics before generic error/apex handlers.
        const rollupTypeErrorPattern = /\billegal assignment from datetime to date\b|\bdatetime\s+to\s+date\b|\brollup summary schedule items?\b|\bfailed to update rollups?\b|\bscheduled apex job\b.*\bfailed\b.*\brollups?\b/i;
        if (rollupTypeErrorPattern.test(operation)) {
            return {
                agent: 'sfdc-field-analyzer',
                confidence: 0.92,
                reason: 'Detected Salesforce rollup field/type error signature'
            };
        }

        // Check keyword mappings
        const keywordMappings = this.config.triggers?.keywords?.mappings || {};
        for (const [keyword, agents] of Object.entries(keywordMappings)) {
            if (new RegExp(keyword, 'i').test(operation)) {
                return {
                    agent: agents[0],
                    confidence: 0.8,
                    reason: `Keyword match: ${keyword}`
                };
            }
        }

        // Pattern-based routing
        const agentPatterns = {
            'sfdc-deployment-manager': /deploy|package|changeset|release/i,
            'sfdc-conflict-resolver': /conflict|error|failed|incompatible/i,
            'sfdc-data-operations': /data|import|export|bulk|migration/i,
            'sfdc-metadata-manager': /metadata|field|object|validation/i,
            'sfdc-permission-orchestrator': /permission|profile|security|access|sharing/i,
            'sfdc-apex-developer': /apex|trigger|class|test|coverage/i,
            'sfdc-automation-builder': /flow|automation|workflow|process/i,
            'sfdc-reports-dashboards': /report|dashboard|analytics|chart/i,
            'sfdc-query-specialist': /soql|sosl|query|select.*from/i,
            'sfdc-field-analyzer': /field.*analysis|updateable|formula|illegal assignment from datetime to date|datetime.*to.*date|rollup.*summary.*schedule|failed.*update.*rollup|scheduled.*apex.*job/i,
            'sfdc-dependency-analyzer': /dependency|circular|relationship|order/i
        };

        for (const [agent, pattern] of Object.entries(agentPatterns)) {
            if (pattern.test(operation)) {
                return {
                    agent: agent,
                    confidence: 0.7,
                    reason: 'Pattern match'
                };
            }
        }

        // Default to planner for unknown operations
        if (complexity > 0.3) {
            return {
                agent: 'sfdc-planner',
                confidence: 0.5,
                reason: 'Unknown operation - planning recommended'
            };
        }

        return null;
    }

    /**
     * Check if agent should be auto-invoked
     */
    shouldAutoInvoke(agent, confidence, complexity) {
        // Always auto-invoke for high confidence matches
        if (confidence >= 0.9) return true;

        // Auto-invoke for high complexity
        if (complexity >= this.complexityThreshold) return true;

        // Check auto-invoke rules from config
        const autoRules = this.config.triggers?.auto_invoke?.rules || [];
        for (const rule of autoRules) {
            if (rule.agent === agent) return true;
        }

        // Check if agent has high success rate in analytics
        const agentStats = this.analytics.agentUsage[agent];
        if (agentStats && agentStats.totalUses > 5) {
            const successRate = agentStats.successCount / agentStats.totalUses;
            if (successRate > 0.8) return true;
        }

        return false;
    }

    /**
     * Display routing decision
     */
    displayRoutingDecision(operation, agent, confidence, complexity, autoInvoke, validationCheck) {
        console.log('\n' + colors.cyan + '═'.repeat(60) + colors.reset);
        console.log(colors.bold + colors.blue + '🤖 AUTO AGENT ROUTER ANALYSIS' + colors.reset);
        console.log(colors.cyan + '═'.repeat(60) + colors.reset);

        console.log('\n' + colors.yellow + 'Operation:' + colors.reset);
        console.log('  ' + operation.substring(0, 100) + (operation.length > 100 ? '...' : ''));

        console.log('\n' + colors.yellow + 'Analysis:' + colors.reset);
        console.log(`  Complexity Score: ${this.getComplexityBar(complexity)} ${(complexity * 100).toFixed(0)}%`);
        console.log(`  Confidence Level: ${this.getConfidenceBar(confidence)} ${(confidence * 100).toFixed(0)}%`);

        if (agent) {
            console.log('\n' + colors.green + 'Selected Agent:' + colors.reset);
            console.log('  ' + colors.purple + agent.agent + colors.reset);
            console.log('  Reason: ' + agent.reason);

            if (autoInvoke) {
                console.log('\n' + colors.bold + colors.green + '✓ AUTO-INVOKING AGENT' + colors.reset);
            } else {
                console.log('\n' + colors.yellow + '⚠ Manual confirmation required' + colors.reset);
            }

            // Display validation recommendation
            if (validationCheck && validationCheck.needed) {
                console.log('\n' + colors.cyan + '🔍 Response Validation:' + colors.reset);
                console.log('  ' + colors.yellow + '⚠ Validation Recommended' + colors.reset);
                console.log('  Trigger: ' + validationCheck.trigger);
                console.log('  ' + validationCheck.reason);
                console.log('  ' + colors.bold + 'After agent execution, invoke response-validator' + colors.reset);
            }
        } else {
            console.log('\n' + colors.red + '❌ No suitable agent found' + colors.reset);
            console.log('  Consider using sfdc-planner for guidance');
        }

        console.log(colors.cyan + '═'.repeat(60) + colors.reset + '\n');
    }

    getComplexityBar(complexity) {
        const filled = Math.round(complexity * 10);
        const empty = 10 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        if (complexity < 0.3) return colors.green + bar + colors.reset;
        if (complexity < 0.7) return colors.yellow + bar + colors.reset;
        return colors.red + bar + colors.reset;
    }

    getConfidenceBar(confidence) {
        const filled = Math.round(confidence * 10);
        const empty = 10 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        if (confidence < 0.5) return colors.red + bar + colors.reset;
        if (confidence < 0.8) return colors.yellow + bar + colors.reset;
        return colors.green + bar + colors.reset;
    }

    /**
     * Log auto-invocation
     */
    logAutoInvocation(operation, agent, success = true) {
        if (!this.analytics.autoInvocations) {
            this.analytics.autoInvocations = [];
        }

        this.analytics.autoInvocations.push({
            timestamp: new Date().toISOString(),
            operation: operation.substring(0, 200),
            agent: agent,
            success: success
        });

        // Update agent usage stats
        if (!this.analytics.agentUsage[agent]) {
            this.analytics.agentUsage[agent] = {
                totalUses: 0,
                successCount: 0,
                failureCount: 0,
                autoInvoked: 0
            };
        }

        this.analytics.agentUsage[agent].totalUses++;
        this.analytics.agentUsage[agent].autoInvoked++;
        if (success) {
            this.analytics.agentUsage[agent].successCount++;
        } else {
            this.analytics.agentUsage[agent].failureCount++;
        }

        this.saveAnalytics();
    }

    /**
     * Check if response validation is needed
     */
    shouldValidateResponse(operation, complexity) {
        // Check for validation triggers
        const validationTriggers = {
            production: /\b(prod|production|main|master)\b/i,
            bulk: /\b(bulk|mass|batch|multiple)\b.*\b(\d+)\b/i,
            statistical: /\b(\d+)\s*%/,
            destructive: /\b(delete|truncate|drop|merge)\b/i,
            fieldAnalysis: /\b(orphan|unused|inactive|dormant|adoption|usage)\b/i,
            extremePercentage: /\b(9[0-9]|100|[0-4])\s*%/
        };

        // Check each trigger
        for (const [trigger, pattern] of Object.entries(validationTriggers)) {
            if (pattern.test(operation)) {
                return {
                    needed: true,
                    trigger: trigger,
                    reason: `Response validation recommended (${trigger} detected)`
                };
            }
        }

        // Check complexity
        if (complexity >= 0.6) {
            return {
                needed: true,
                trigger: 'complexity',
                reason: `Response validation recommended (high complexity: ${(complexity * 100).toFixed(0)}%)`
            };
        }

        return { needed: false };
    }

    /**
     * Route operation to appropriate agent
     */
    async routeOperation(operation, silent = false) {
        // Calculate complexity
        const complexity = this.calculateComplexity(operation);

        // Find best matching agent
        const agentMatch = this.findBestAgent(operation, complexity);

        if (!agentMatch) {
            if (!silent) {
                this.displayRoutingDecision(operation, null, 0, complexity, false);
            }
            return { routed: false };
        }

        // Check if should auto-invoke
        const autoInvoke = this.shouldAutoInvoke(agentMatch.agent, agentMatch.confidence, complexity);

        // Check if validation needed
        const validationCheck = this.shouldValidateResponse(operation, complexity);

        // Display decision only if not in silent mode
        if (!silent) {
            this.displayRoutingDecision(operation, agentMatch, agentMatch.confidence, complexity, autoInvoke, validationCheck);
        }

        if (autoInvoke) {
            // Log the auto-invocation
            this.logAutoInvocation(operation, agentMatch.agent);

            // Here you would actually invoke the Task tool with the agent
            // For now, return the routing decision
            return {
                routed: true,
                agent: agentMatch.agent,
                autoInvoked: true,
                confidence: agentMatch.confidence,
                complexity: complexity,
                validation: validationCheck
            };
        }

        return {
            routed: true,
            agent: agentMatch.agent,
            autoInvoked: false,
            confidence: agentMatch.confidence,
            complexity: complexity,
            requiresConfirmation: true,
            validation: validationCheck
        };
    }

    /**
     * Generate routing report
     */
    generateReport() {
        const report = [];
        report.push('\n' + colors.bold + '📊 AUTO-ROUTING STATISTICS' + colors.reset);
        report.push('═'.repeat(50));

        const totalAuto = this.analytics.autoInvocations?.length || 0;
        report.push(`Total Auto-Invocations: ${totalAuto}`);

        if (this.analytics.agentUsage) {
            report.push('\n' + colors.yellow + 'Agent Usage:' + colors.reset);
            Object.entries(this.analytics.agentUsage)
                .sort((a, b) => b[1].totalUses - a[1].totalUses)
                .slice(0, 10)
                .forEach(([agent, stats]) => {
                    const successRate = stats.totalUses > 0
                        ? ((stats.successCount / stats.totalUses) * 100).toFixed(1)
                        : 0;
                    report.push(`  ${agent}:`);
                    report.push(`    Uses: ${stats.totalUses} | Auto: ${stats.autoInvoked || 0} | Success: ${successRate}%`);
                });
        }

        if (this.analytics.autoInvocations && this.analytics.autoInvocations.length > 0) {
            report.push('\n' + colors.yellow + 'Recent Auto-Invocations:' + colors.reset);
            this.analytics.autoInvocations
                .slice(-5)
                .reverse()
                .forEach(inv => {
                    const time = new Date(inv.timestamp).toLocaleTimeString();
                    const status = inv.success ? '✓' : '✗';
                    report.push(`  [${time}] ${status} ${inv.agent}`);
                });
        }

        report.push('═'.repeat(50));
        return report.join('\n');
    }
}

// CLI Interface
if (require.main === module) {
    const router = new AutoAgentRouter();
    const command = process.argv[2];
    const args = process.argv.slice(3);
    const jsonOutput = args.includes('--json');

    switch (command) {
        case 'route':
            const operation = args.filter(a => a !== '--json').join(' ');
            if (!operation) {
                console.log('Usage: auto-agent-router.js route <operation> [--json]');
                break;
            }
            router.routeOperation(operation, jsonOutput).then(result => {
                if (jsonOutput) {
                    // Output only JSON for script parsing (silent mode)
                    console.log(JSON.stringify(result));
                } else {
                    // Human-readable output with visual display
                    if (!result.routed) {
                        process.exit(1);
                    }
                    console.log('\n' + JSON.stringify(result, null, 2));
                }
            });
            break;

        case 'analyze':
            const op = args.filter(a => a !== '--json').join(' ');
            if (!op) {
                console.log('Usage: auto-agent-router.js analyze <operation> [--json]');
                break;
            }
            const complexity = router.calculateComplexity(op);
            const agent = router.findBestAgent(op, complexity);
            if (jsonOutput) {
                console.log(JSON.stringify({ complexity, agent }));
            } else {
                console.log('Complexity:', complexity);
                console.log('Best Agent:', agent);
            }
            break;

        case 'init':
            console.log('✓ Configuration files already created:');
            console.log('  - ' + router.configPath);
            console.log('  - ' + router.analyticsPath);
            console.log('\nAgent routing system initialized and ready.');
            break;

        case 'report':
            console.log(router.generateReport());
            break;

        case 'config':
            console.log(JSON.stringify(router.config, null, 2));
            break;

        case 'test':
            // Test mode - run routing on sample operations
            const samples = [
                'deploy to production',
                'update 500 opportunity renewal dates',
                'create new custom field',
                'fix deployment conflict',
                'bulk delete 1000 accounts',
                'create Contact layout for marketing users',
                'generate Opportunity layout for sales reps',
                'design Account layout for customer success managers',
                'analyze the Contact layout quality'
            ];
            console.log(colors.bold + '\n🧪 Testing Auto-Router with Sample Operations\n' + colors.reset);
            samples.forEach(async (sample) => {
                console.log(colors.cyan + `\nOperation: "${sample}"` + colors.reset);
                const result = await router.routeOperation(sample);
                console.log(`  Agent: ${result.agent || 'none'}`);
                console.log(`  Complexity: ${(result.complexity * 100).toFixed(0)}%`);
                console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
                console.log(`  Auto-invoke: ${result.autoInvoked ? 'YES' : 'NO'}`);
            });
            break;

        default:
            console.log(colors.bold + 'Auto Agent Router' + colors.reset);
            console.log('\nCommands:');
            console.log('  route <operation> [--json]  - Route operation to best agent');
            console.log('  analyze <operation> [--json] - Analyze complexity and find agent');
            console.log('  init                         - Initialize configuration files');
            console.log('  report                       - Show routing statistics');
            console.log('  config                       - Show current configuration');
            console.log('  test                         - Test router with sample operations');
            console.log('\nExamples:');
            console.log('  auto-agent-router.js route "deploy to production"');
            console.log('  auto-agent-router.js route "bulk update accounts" --json');
            console.log('  auto-agent-router.js analyze "bulk update 10000 accounts"');
            console.log('  auto-agent-router.js test');
    }
}

module.exports = AutoAgentRouter;
