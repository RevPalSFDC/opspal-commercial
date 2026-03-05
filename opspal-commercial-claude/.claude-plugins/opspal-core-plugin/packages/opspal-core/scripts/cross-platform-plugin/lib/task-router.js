#!/usr/bin/env node

/**
 * Task Router - Core Agent Routing Logic
 *
 * Analyzes task descriptions and recommends the optimal agent with confidence scoring.
 * Now includes automatic resolution of short agent names to fully-qualified names.
 *
 * Usage:
 *   const { TaskRouter } = require('./task-router');
 *   const router = new TaskRouter();
 *   const recommendation = router.analyze(taskDescription);
 *
 * @version 1.2.0
 * @date 2025-12-10
 * @changelog 1.2.0 - Added agent alias resolution for fully-qualified names
 * @changelog 1.1.0 - Added Playwright-enabled agents (playwright-browser-controller, ui-documentation-generator, visual-regression-tester, etc.)
 */

const { resolveAgentName } = require('./agent-alias-resolver');

class TaskRouter {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.agentIndex = null; // Will be loaded from routing-index.json in Phase 2.2

        // Keyword patterns for agent matching
        this.keywords = {
            'release-coordinator': ['production', 'deploy to prod', 'release', 'tag', 'merge to main', 'ship'],
            'sfdc-merge-orchestrator': ['merge', 'consolidate', 'dedupe', 'duplicate', 'combine objects'],
            'sfdc-conflict-resolver': ['conflict', 'deployment failed', 'field mismatch', 'metadata error'],
            'sfdc-revops-auditor': ['revops', 'revenue operations', 'audit', 'assessment', 'analysis'],
            'sfdc-cpq-assessor': ['cpq', 'pricing', 'quote', 'steelbrick', 'sbqq'],
            'sfdc-deployment-manager': ['deploy', 'deployment', 'metadata', 'package.xml'],
            'sfdc-metadata-analyzer': ['analyze metadata', 'validation rules', 'flow analysis', 'layout audit'],
            'sfdc-automation-auditor': ['automation audit', 'flow audit', 'workflow audit', 'process builder'],
            'sfdc-permission-orchestrator': ['permission set', 'profile', 'fls', 'sharing rules'],
            'sfdc-data-operations': ['data import', 'data export', 'bulk data', 'csv'],
            'sfdc-reports-dashboards': ['report', 'dashboard', 'analytics', 'chart'],
            'unified-orchestrator': ['cross-platform', 'both platforms', 'sf and hs', 'salesforce and hubspot'],
            'unified-data-quality-validator': ['data quality', 'data consistency', 'validation', 'data integrity'],
            'sequential-planner': ['complex', 'multi-step', 'unknown scope', 'plan carefully'],
            'diagram-generator': ['diagram', 'flowchart', 'visualize', 'erd', 'architecture'],
            'hubspot-workflow-builder': ['hubspot workflow', 'hs workflow', 'automation'],
            'hubspot-data': ['hubspot property', 'hs property', 'contact property', 'company property'],
            'hubspot-assessment-analyzer': ['hubspot assessment', 'hs audit', 'portal audit'],
            'uat-orchestrator': ['uat', 'user acceptance test', 'acceptance testing', 'test cases', 'qa workbook', 'regression test', 'test scenario', 'test execution', 'run tests', 'build tests'],
            'n8n-workflow-builder': ['n8n workflow', 'n8n', 'workflow automation', 'create workflow', 'build workflow', 'workflow builder', 'n8n connector', 'parallel workflow', 'sub-workflow', 'error branch'],
            'n8n-execution-monitor': ['n8n execution', 'workflow execution', 'execution status', 'workflow failed', 'n8n error', 'n8n debug', 'workflow debug', 'execution monitor'],
            'n8n-integration-orchestrator': ['n8n orchestrate', 'n8n multi-platform', 'bidirectional sync', 'sf to hs sync', 'hs to sf sync', 'n8n integration', 'webhook workflow', 'schedule workflow', 'cross-platform workflow'],
            'n8n-lifecycle-manager': ['activate workflow', 'deactivate workflow', 'workflow lifecycle', 'clone workflow', 'archive workflow', 'workflow state', 'n8n activate', 'n8n deactivate', 'bulk activate', 'bulk deactivate', 'workflow schedule', 'activation window'],
            'n8n-optimizer': ['optimize workflow', 'workflow performance', 'n8n bottleneck', 'improve workflow', 'workflow efficiency', 'slow workflow', 'workflow speed', 'execution time', 'n8n optimize', 'performance analysis'],
            // Playwright-enabled agents
            'playwright-browser-controller': ['browser automation', 'browser control', 'playwright', 'web automation', 'headless browser', 'browser navigate', 'browser click', 'browser screenshot', 'accessibility snapshot', 'dom automation', 'web scraping', 'browser session'],
            'ui-documentation-generator': ['ui documentation', 'screenshot documentation', 'visual documentation', 'ui screenshot', 'interface documentation', 'capture ui', 'document interface', 'visual capture', 'annotate screenshot', 'ui walkthrough'],
            'visual-regression-tester': ['visual regression', 'visual test', 'screenshot comparison', 'ui comparison', 'visual diff', 'ui change detection', 'screenshot test', 'visual qa', 'ui validation', 'pixel comparison', 'visual baseline'],
            'hubspot-sfdc-sync-scraper': ['hubspot sync scraper', 'sync mapping', 'sync analysis', 'bidirectional sync', 'field mapping', 'sync report', 'sync configuration', 'sync screenshot'],
            'hubspot-workflow-auditor': ['hubspot workflow audit', 'workflow analysis', 'workflow report', 'workflow screenshot', 'audit workflows', 'workflow evidence'],
            'sfdc-architecture-auditor': ['architecture audit', 'salesforce architecture', 'architecture review', 'system architecture', 'architecture diagram', 'technical architecture'],
            'pdf-generator': ['generate pdf', 'create pdf', 'pdf report', 'convert to pdf', 'pdf export', 'browser pdf', 'print to pdf'],
            'task-scheduler': ['schedule', 'scheduled task', 'cron', 'recurring', 'automated task', 'run daily', 'run weekly', 'run hourly', 'timed execution', 'schedule prompt', 'schedule script', 'automation schedule', 'every morning', 'every day', 'every week', 'run automatically', 'run on schedule', 'schedule reporting']
        };

        // Complexity scoring weights
        this.complexityWeights = {
            bulk: 0.3,
            production: 0.4,
            dependencies: 0.2,
            metadata: 0.2,
            migration: 0.1,
            integration: 0.1,
            multiObject: 0.1,
            rollback: 0.1
        };

        // Agent descriptions (simplified - full index will be loaded in Phase 2.2)
        this.agentDescriptions = {
            'release-coordinator': {
                description: 'Orchestrates end-to-end release process with change control',
                capabilities: ['production deployment', 'change control', 'rollback planning', 'cross-platform releases'],
                tier: 5
            },
            'sfdc-merge-orchestrator': {
                description: 'Orchestrates object/field merges with safety validation',
                capabilities: ['bulk merge', 'conflict detection', 'staged execution', 'rollback support'],
                tier: 4
            },
            'sfdc-conflict-resolver': {
                description: 'Resolves metadata conflicts before deployment',
                capabilities: ['conflict detection', 'dependency analysis', 'resolution planning'],
                tier: 3
            },
            'sfdc-revops-auditor': {
                description: 'Comprehensive RevOps assessments with statistical analysis',
                capabilities: ['revops audit', 'business process analysis', 'statistical metrics', 'recommendations'],
                tier: 4
            },
            'sfdc-cpq-assessor': {
                description: 'Comprehensive CPQ assessments with data quality checks',
                capabilities: ['cpq audit', 'pricing analysis', 'configuration review', 'optimization recommendations'],
                tier: 4
            },
            'unified-orchestrator': {
                description: 'Master orchestrator for cross-platform operations',
                capabilities: ['multi-platform coordination', 'salesforce-hubspot sync', 'unified workflows'],
                tier: 5
            },
            'sequential-planner': {
                description: 'Complex problem-solving with adaptive planning',
                capabilities: ['multi-step planning', 'revision capabilities', 'complex analysis', 'unknown scope handling'],
                tier: 5
            },
            'diagram-generator': {
                description: 'Creates diagrams and visual documentation',
                capabilities: ['flowcharts', 'ERDs', 'sequence diagrams', 'architecture diagrams'],
                tier: 2
            },
            'uat-orchestrator': {
                description: 'Orchestrates UAT workflows including test case building, execution, and reporting',
                capabilities: ['test case building', 'csv workbook parsing', 'multi-platform execution', 'report generation', 'automatic cleanup'],
                tier: 3
            },
            'n8n-workflow-builder': {
                description: 'Designs and creates n8n workflows from natural language with full complexity support',
                capabilities: ['workflow creation', 'parallel execution', 'sub-workflows', 'error branches', 'SF/HS node configuration', 'credential management'],
                tier: 4
            },
            'n8n-execution-monitor': {
                description: 'On-demand monitoring and debugging of n8n workflow executions',
                capabilities: ['execution status', 'error analysis', 'performance metrics', 'troubleshooting', 'execution reports'],
                tier: 2
            },
            'n8n-integration-orchestrator': {
                description: 'Orchestrates complex multi-platform n8n integrations across SF, HS, and external APIs',
                capabilities: ['bidirectional sync', 'multi-platform workflows', 'webhook configuration', 'schedule management', 'agent delegation'],
                tier: 5
            },
            'n8n-lifecycle-manager': {
                description: 'Manages n8n workflow lifecycle states including activation, deactivation, archival, and scheduling',
                capabilities: ['activate/deactivate workflows', 'bulk operations', 'template cloning', 'scheduling', 'state history', 'rollback'],
                tier: 3
            },
            'n8n-optimizer': {
                description: 'Analyzes and optimizes n8n workflow performance based on execution data',
                capabilities: ['bottleneck detection', 'error analysis', 'optimization recommendations', 'efficiency scoring', 'workflow comparison'],
                tier: 3
            },
            // Playwright-enabled agents
            'playwright-browser-controller': {
                description: 'Master controller for Playwright browser automation across all platforms',
                capabilities: ['browser navigation', 'screenshot capture', 'PDF generation', 'accessibility snapshots', 'multi-tab management', 'form filling', 'DOM interaction'],
                tier: 3
            },
            'ui-documentation-generator': {
                description: 'Generates comprehensive UI documentation with screenshots and annotations',
                capabilities: ['screenshot documentation', 'UI walkthrough generation', 'before/after comparisons', 'annotated captures', 'visual guides'],
                tier: 2
            },
            'visual-regression-tester': {
                description: 'Performs visual regression testing by comparing screenshots against baselines',
                capabilities: ['baseline management', 'visual comparison', 'diff generation', 'threshold-based detection', 'cross-browser testing'],
                tier: 3
            },
            'hubspot-sfdc-sync-scraper': {
                description: 'Analyzes HubSpot-Salesforce sync configurations with UI evidence capture',
                capabilities: ['sync mapping analysis', 'field mapping extraction', 'sync conflict detection', 'screenshot evidence', 'configuration export'],
                tier: 3
            },
            'hubspot-workflow-auditor': {
                description: 'Audits HubSpot workflows with visual evidence and detailed analysis',
                capabilities: ['workflow analysis', 'screenshot documentation', 'performance audit', 'best practice validation', 'visual evidence capture'],
                tier: 3
            },
            'sfdc-architecture-auditor': {
                description: 'Validates Salesforce architectural decisions with comprehensive documentation',
                capabilities: ['architecture validation', 'ADR documentation', 'health scoring', 'screenshot evidence', 'environment analysis'],
                tier: 4
            },
            'pdf-generator': {
                description: 'Converts markdown and web content to professional PDFs with browser rendering',
                capabilities: ['markdown to PDF', 'multi-document collation', 'cover page generation', 'Mermaid diagram rendering', 'browser-based PDF export'],
                tier: 2
            },
            'task-scheduler': {
                description: 'Schedules Claude Code prompts and scripts to run automatically on cron schedules',
                capabilities: ['cron scheduling', 'Claude prompt automation', 'script scheduling', 'Slack notifications', 'execution logging'],
                tier: 2
            }
        };
    }

    /**
     * Analyze task description and recommend agent
     * @param {string} taskDescription - The task to analyze
     * @returns {Object} Recommendation with agent, confidence, complexity, reasoning
     */
    analyze(taskDescription) {
        const lowercaseTask = taskDescription.toLowerCase();

        // Calculate complexity score
        const complexity = this.calculateComplexity(lowercaseTask);

        // Find matching agents
        const matches = this.findMatchingAgents(lowercaseTask);

        // Determine recommendation
        if (matches.length === 0) {
            return this.noAgentRecommendation(complexity);
        }

        // Get top recommendation
        const topMatch = matches[0];
        const agent = this.agentDescriptions[topMatch.agent] || {};

        // Resolve short name to fully-qualified name
        const resolvedAgent = resolveAgentName(topMatch.agent) || topMatch.agent;

        return {
            agent: resolvedAgent,
            agentShortName: topMatch.agent, // Keep short name for reference
            confidence: topMatch.confidence,
            complexity: {
                score: complexity.score,
                level: complexity.level
            },
            reasoning: this.generateReasoning(topMatch, complexity, lowercaseTask),
            capabilities: agent.capabilities || [],
            alternatives: matches.slice(1, 4).map(m => ({
                agent: resolveAgentName(m.agent) || m.agent,
                agentShortName: m.agent,
                confidence: m.confidence,
                description: (this.agentDescriptions[m.agent] || {}).description || 'No description'
            })),
            recommendation: complexity.score >= 0.7 ? 'REQUIRED' :
                           complexity.score >= 0.3 ? 'RECOMMENDED' :
                           'OPTIONAL'
        };
    }

    /**
     * Calculate task complexity score
     * @param {string} task - Lowercase task description
     * @returns {Object} Score and level
     */
    calculateComplexity(task) {
        let score = 0.0;
        const factors = [];

        // Check for complexity factors
        if (/bulk|batch|multiple|many|all/.test(task)) {
            score += this.complexityWeights.bulk;
            factors.push('bulk operation');
        }

        if (/production|prod|live|main/.test(task)) {
            score += this.complexityWeights.production;
            factors.push('production environment');
        }

        if (/depend|relationship|parent|child|link/.test(task)) {
            score += this.complexityWeights.dependencies;
            factors.push('dependencies/relationships');
        }

        if (/metadata|validation|rule|layout|profile|permission/.test(task)) {
            score += this.complexityWeights.metadata;
            factors.push('metadata changes');
        }

        if (/migrate|migration|move|transfer/.test(task)) {
            score += this.complexityWeights.migration;
            factors.push('data migration');
        }

        if (/integrat|external|api|webhook|sync/.test(task)) {
            score += this.complexityWeights.integration;
            factors.push('integration/external system');
        }

        if (/\b(\d+)\s+(object|table|entity)/.test(task)) {
            const match = task.match(/\b(\d+)\s+(object|table|entity)/);
            if (match && parseInt(match[1]) > 1) {
                score += this.complexityWeights.multiObject;
                factors.push('multiple objects');
            }
        }

        if (/rollback|revert|undo/.test(task)) {
            score += this.complexityWeights.rollback;
            factors.push('rollback considerations');
        }

        // Cap at 1.0
        score = Math.min(score, 1.0);

        // Determine level
        const level = score < 0.3 ? 'SIMPLE' :
                      score < 0.7 ? 'MEDIUM' :
                      'HIGH';

        return { score, level, factors };
    }

    /**
     * Find agents matching the task description
     * @param {string} task - Lowercase task description
     * @returns {Array} Matching agents with confidence scores
     */
    findMatchingAgents(task) {
        const matches = [];

        for (const [agent, keywords] of Object.entries(this.keywords)) {
            let matchCount = 0;
            const matchedKeywords = [];

            for (const keyword of keywords) {
                if (task.includes(keyword.toLowerCase())) {
                    matchCount++;
                    matchedKeywords.push(keyword);
                }
            }

            if (matchCount > 0) {
                // Calculate confidence based on keyword matches
                const confidence = Math.min(0.5 + (matchCount * 0.2), 1.0);
                matches.push({
                    agent,
                    confidence,
                    matchCount,
                    matchedKeywords
                });
            }
        }

        // Sort by confidence (descending)
        matches.sort((a, b) => b.confidence - a.confidence);

        return matches;
    }

    /**
     * Generate reasoning explanation
     * @param {Object} match - Top matching agent
     * @param {Object} complexity - Complexity assessment
     * @param {string} task - Task description
     * @returns {Array} Reasoning bullet points
     */
    generateReasoning(match, complexity, task) {
        const reasoning = [];

        // Add matched keywords
        if (match.matchedKeywords.length > 0) {
            reasoning.push(`Keywords detected: ${match.matchedKeywords.join(', ')}`);
        }

        // Add complexity factors
        if (complexity.factors.length > 0) {
            reasoning.push(...complexity.factors.map(f => `Complexity factor: ${f}`));
        }

        // Add agent-specific reasoning
        const agentInfo = this.agentDescriptions[match.agent];
        if (agentInfo && agentInfo.description) {
            reasoning.push(`Agent specialization: ${agentInfo.description}`);
        }

        return reasoning;
    }

    /**
     * Return recommendation when no agent matches
     * @param {Object} complexity - Complexity assessment
     * @returns {Object} Direct execution recommendation
     */
    noAgentRecommendation(complexity) {
        return {
            agent: null,
            confidence: 0.0,
            complexity: {
                score: complexity.score,
                level: complexity.level
            },
            reasoning: [
                'No specialized agent matched for this task',
                'Task appears to be straightforward',
                ...complexity.factors.map(f => `Note: ${f}`)
            ],
            capabilities: [],
            alternatives: [],
            recommendation: complexity.score >= 0.7 ? 'REVIEW_NEEDED' : 'DIRECT_EXECUTION'
        };
    }

    /**
     * Format recommendation for display
     * @param {Object} recommendation - Analysis result
     * @returns {string} Formatted output
     */
    format(recommendation) {
        const lines = [];

        if (recommendation.agent) {
            lines.push(`🎯 RECOMMENDED AGENT: ${recommendation.agent}`);
            lines.push(`Confidence: ${(recommendation.confidence * 100).toFixed(0)}% (${this.getConfidenceLabel(recommendation.confidence)})`);
        } else {
            lines.push(`✅ DIRECT EXECUTION RECOMMENDED`);
        }

        lines.push(`Complexity: ${recommendation.complexity.level} (${recommendation.complexity.score.toFixed(2)})`);
        lines.push('');

        lines.push('📋 Reasoning:');
        for (const reason of recommendation.reasoning) {
            lines.push(`- ${reason}`);
        }
        lines.push('');

        if (recommendation.capabilities && recommendation.capabilities.length > 0) {
            lines.push('✨ Key Capabilities:');
            for (const capability of recommendation.capabilities) {
                lines.push(`- ${capability}`);
            }
            lines.push('');
        }

        if (recommendation.alternatives && recommendation.alternatives.length > 0) {
            lines.push('🔄 Alternative Agents:');
            for (const alt of recommendation.alternatives) {
                lines.push(`- ${alt.agent} (confidence: ${(alt.confidence * 100).toFixed(0)}%) - ${alt.description}`);
            }
            lines.push('');
        }

        lines.push(`💡 Recommendation: ${recommendation.recommendation}`);

        return lines.join('\n');
    }

    /**
     * Get confidence level label
     * @param {number} confidence - Confidence score 0.0-1.0
     * @returns {string} Label
     */
    getConfidenceLabel(confidence) {
        if (confidence >= 0.9) return 'Very High';
        if (confidence >= 0.75) return 'High';
        if (confidence >= 0.6) return 'Medium';
        if (confidence >= 0.4) return 'Low';
        return 'Very Low';
    }
}

// CLI interface
if (require.main === module) {
    const taskDescription = process.argv.slice(2).join(' ');

    if (!taskDescription) {
        console.error('Usage: task-router.js <task description>');
        console.error('Example: task-router.js "Deploy validation rules to production"');
        process.exit(1);
    }

    const router = new TaskRouter({ verbose: true });
    const recommendation = router.analyze(taskDescription);
    console.log(router.format(recommendation));
}

module.exports = { TaskRouter };
