#!/usr/bin/env node

/**
 * Task Router - Core Agent Routing Logic
 *
 * Analyzes task descriptions and recommends the optimal agent with confidence scoring.
 * Now includes automatic resolution of short agent names to fully-qualified names.
 *
 * QA-002: Now loads keywords from routing-index.json instead of hardcoded values.
 *
 * Usage:
 *   const { TaskRouter } = require('./task-router');
 *   const router = new TaskRouter();
 *   const recommendation = router.analyze(taskDescription);
 *
 * @version 2.0.0
 * @date 2026-02-02
 * @changelog 2.0.0 - QA-002: Load from routing-index.json, fallback to hardcoded
 * @changelog 1.2.0 - Added agent alias resolution for fully-qualified names
 * @changelog 1.1.0 - Added Playwright-enabled agents
 */

const fs = require('fs');
const path = require('path');
const { resolveAgentName } = require('./agent-alias-resolver');
const SEMVER_PLUGIN_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

class TaskRouter {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.agentIndex = null;
        this.indexLoaded = false;
        this.guardrailLogPath = options.guardrailLogPath ||
            path.join(process.env.HOME || '/tmp', '.claude', 'logs', 'routing-alerts.jsonl');

        // QA-002: Try to load routing index first
        this.loadRoutingIndex();

        // Fallback: Keyword patterns for agent matching (used if index not available)
        this.fallbackKeywords = {
            'release-coordinator': ['production', 'deploy to prod', 'release', 'tag', 'merge to main', 'ship'],
            'sfdc-merge-orchestrator': ['merge', 'consolidate', 'dedupe', 'duplicate', 'combine objects'],
            'sfdc-conflict-resolver': ['conflict', 'deployment failed', 'field mismatch', 'metadata error'],
            'sfdc-revops-auditor': ['revops assessment', 'revops audit', 'pipeline assessment', 'forecast audit', 'salesforce assessment', 'revops', 'revenue operations', 'audit', 'assessment', 'analysis', 'lifecycle', 'stage definitions', 'stage exit', 'lifecycle governance', 'lifecycle rules', 'salesforce governance', 'sf governance'],
            'sfdc-cpq-assessor': ['cpq', 'pricing', 'quote', 'steelbrick', 'sbqq'],
            'sfdc-deployment-manager': ['deploy', 'deployment', 'metadata', 'package.xml'],
            'sfdc-metadata-analyzer': ['analyze metadata', 'validation rules', 'flow analysis', 'layout audit'],
            'sfdc-field-analyzer': [
                'field analysis',
                'field type mismatch',
                'illegal assignment from datetime to date',
                'datetime to date',
                'failed to update rollups',
                'rollup summary schedule items',
                'scheduled apex job.*failed.*rollup'
            ],
            'sfdc-automation-auditor': ['automation audit', 'flow audit', 'workflow audit', 'process builder'],
            'sfdc-permission-orchestrator': ['permission set', 'profile', 'fls', 'sharing rules'],
            'sfdc-data-operations': ['data import', 'data export', 'bulk data', 'csv'],
            'sfdc-reports-dashboards': ['report', 'dashboard', 'analytics', 'chart'],
            'revops-reporting-assistant': ['revops report', 'kpi report', 'metrics report', 'forecast report', 'kpi forecast', 'kpi alert', 'revenue report', 'arr report', 'mrr report', 'kpi', 'metrics', 'forecast', 'alert', 'threshold'],
            'implementation-planner': ['implementation plan', 'implementation planning', 'plan from spec', 'project plan', 'asana plan', 'implementation roadmap'],
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

        // QA-002: Use index keywords if loaded, otherwise use fallback
        this.keywords = this.indexLoaded ? this.buildKeywordsFromIndex() : this.fallbackKeywords;
        this.keywordFrequency = this.buildKeywordFrequency();

        // Generic single-token keywords add noise when matching against large indexes.
        // Keep them, but heavily down-rank to favor compound specialist phrases.
        this.genericKeywords = new Set([
            'task', 'tasks', 'work', 'workflow', 'workflows', 'manage', 'management',
            'operations', 'operation', 'process', 'processes', 'analysis', 'analyze',
            'report', 'reports', 'data', 'system', 'platform', 'project',
            'execution', 'run', 'create', 'build', 'update', 'monitor', 'planning',
            'assistant', 'manager', 'specialist', 'orchestrator', 'agent'
        ]);

        this.highSignalAcronyms = new Set([
            'api', 'arr', 'mrr', 'nrr', 'grr', 'cpq', 'mql', 'sql', 'sdr', 'lwc', 'seo', 'n8n'
        ]);

        // Complexity scoring weights
        this.complexityWeights = {
            bulk: 0.3,
            production: 0.4,
            dependencies: 0.2,
            metadata: 0.2,
            migration: 0.1,
            integration: 0.1,
            multiObject: 0.1,
            rollback: 0.1,
            advancedDesign: 0.3,
            analyticsReporting: 0.2,
            crossPlatform: 0.25,
            scopeBreadth: 0.1
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
            'revops-reporting-assistant': {
                description: 'Generates RevOps KPI reports with methodology and benchmarks',
                capabilities: ['revops reporting', 'kpi definitions', 'forecasting', 'alerting'],
                tier: 3
            },
            'implementation-planner': {
                description: 'Transforms specifications into executable Asana project plans',
                capabilities: ['implementation planning', 'task breakdown', 'dependency mapping', 'asana execution'],
                tier: 3
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

        // Enrich hardcoded descriptions with full index metadata when available.
        this.agentDescriptions = this.buildAgentDescriptions(this.agentDescriptions);
    }

    /**
     * Check whether a plugin name looks like a semantic version.
     * @param {string} pluginName
     * @returns {boolean}
     */
    isSemverPluginName(pluginName) {
        return SEMVER_PLUGIN_PATTERN.test(String(pluginName || '').trim());
    }

    /**
     * Check whether an agent name has a semver plugin prefix.
     * @param {string} agentName
     * @returns {boolean}
     */
    isSemverPrefixedAgent(agentName) {
        if (typeof agentName !== 'string' || !agentName.includes(':')) {
            return false;
        }

        const pluginName = agentName.split(':')[0];
        return this.isSemverPluginName(pluginName);
    }

    /**
     * Extract short name from full or short agent identifier.
     * @param {string} agentName
     * @returns {string}
     */
    getAgentShortName(agentName) {
        if (typeof agentName !== 'string' || agentName.length === 0) {
            return '';
        }
        return agentName.includes(':') ? agentName.split(':').pop() : agentName;
    }

    /**
     * Persist routing guardrail alerts for telemetry.
     * @param {Object} alert
     */
    logGuardrailAlert(alert) {
        try {
            const payload = {
                timestamp: new Date().toISOString(),
                source: 'task-router',
                ...alert
            };

            const logDir = path.dirname(this.guardrailLogPath);
            fs.mkdirSync(logDir, { recursive: true });
            fs.appendFileSync(this.guardrailLogPath, JSON.stringify(payload) + '\n', 'utf-8');
        } catch (error) {
            if (this.verbose) {
                console.warn(`[task-router][guardrail] Failed to write alert: ${error.message}`);
            }
        }
    }

    /**
     * Record and optionally print a guardrail alert.
     * @param {Object[]} alerts
     * @param {Object} alert
     */
    addGuardrailAlert(alerts, alert) {
        alerts.push(alert);
        this.logGuardrailAlert(alert);

        if (this.verbose) {
            console.warn(`[task-router][guardrail] ${alert.message}`);
        }
    }

    /**
     * Ensure resolved agent output does not contain semver pseudo-plugin prefixes.
     * Attempts recovery by re-resolving short name from a fresh registry.
     * @param {string} rawAgentName
     * @param {string} source
     * @param {Object[]} alerts
     * @returns {string}
     */
    normalizeResolvedAgentName(rawAgentName, source, alerts) {
        const initialResolved = resolveAgentName(rawAgentName, { warnOnConflict: false }) || rawAgentName;

        if (!this.isSemverPrefixedAgent(initialResolved)) {
            return initialResolved;
        }

        const shortName = this.getAgentShortName(initialResolved);
        const recovered = resolveAgentName(shortName, {
            warnOnConflict: false,
            forceRebuild: true
        }) || shortName;

        if (!this.isSemverPrefixedAgent(recovered)) {
            this.addGuardrailAlert(alerts, {
                type: 'semver_plugin_prefix_detected',
                source,
                originalAgent: rawAgentName,
                leakedAgent: initialResolved,
                recoveredAgent: recovered,
                message: `Semver-prefixed agent "${initialResolved}" detected (${source}); recovered to "${recovered}".`
            });
            return recovered;
        }

        this.addGuardrailAlert(alerts, {
            type: 'semver_plugin_prefix_detected',
            source,
            originalAgent: rawAgentName,
            leakedAgent: initialResolved,
            recoveredAgent: shortName,
            message: `Semver-prefixed agent "${initialResolved}" detected (${source}); fallback to short name "${shortName}".`
        });

        return shortName;
    }

    /**
     * QA-002: Load routing index from file
     * Enables dynamic keyword loading instead of hardcoded values
     */
    loadRoutingIndex() {
        // Try multiple possible locations for the routing index
        const possiblePaths = [
            path.join(__dirname, '../../routing-index.json'),
            path.join(__dirname, '../../../routing-index.json'),
            path.join(process.cwd(), 'plugins/opspal-core/routing-index.json'),
            path.join(process.cwd(), 'routing-index.json')
        ];

        for (const indexPath of possiblePaths) {
            if (fs.existsSync(indexPath)) {
                try {
                    const content = fs.readFileSync(indexPath, 'utf-8');
                    this.agentIndex = JSON.parse(content);
                    this.indexLoaded = true;

                    if (this.verbose) {
                        console.log(`✓ Loaded routing index from: ${indexPath}`);
                        console.log(`  Agents: ${this.agentIndex.totalAgents || 0}`);
                        console.log(`  Commands: ${this.agentIndex.totalCommands || 0}`);
                        console.log(`  Keywords: ${Object.keys(this.agentIndex.byKeyword || {}).length}`);
                    }
                    return;
                } catch (error) {
                    if (this.verbose) {
                        console.warn(`Warning: Failed to parse routing index at ${indexPath}: ${error.message}`);
                    }
                }
            }
        }

        if (this.verbose) {
            console.log('Note: Using hardcoded keywords (routing-index.json not found)');
        }
    }

    /**
     * QA-002: Build keywords map from routing index
     * Converts byKeyword index to agent -> keywords format
     * @returns {Object} Keywords map
     */
    buildKeywordsFromIndex() {
        if (!this.agentIndex || (!this.agentIndex.byKeyword && !this.agentIndex.byKeywordFull)) {
            return this.fallbackKeywords;
        }

        const keywords = {};
        const keywordSource = this.agentIndex.byKeywordFull || this.agentIndex.byKeyword;

        // Invert the byKeyword map (keyword -> agents) to (agent -> keywords)
        for (const [keyword, agents] of Object.entries(keywordSource)) {
            for (const agent of agents) {
                // Skip command references (prefixed with 'command:')
                if (agent.startsWith('command:')) continue;
                if (this.isSemverPrefixedAgent(agent)) {
                    this.logGuardrailAlert({
                        type: 'semver_index_reference_filtered',
                        source: 'routing-index',
                        leakedAgent: agent,
                        keyword,
                        message: `Filtered semver-prefixed index agent "${agent}" for keyword "${keyword}".`
                    });
                    continue;
                }

                if (!keywords[agent]) {
                    keywords[agent] = [];
                }
                if (!keywords[agent].includes(keyword)) {
                    keywords[agent].push(keyword);
                }
            }
        }

        // Merge fallback keywords with index keywords to ensure complete coverage
        // This combines both sources rather than replacing one with the other
        for (const [agent, agentKeywords] of Object.entries(this.fallbackKeywords)) {
            let targetAgentKey = agent;
            if (!keywords[targetAgentKey]) {
                const resolved = resolveAgentName(agent) || agent;
                targetAgentKey = keywords[resolved] ? resolved : resolved;
            }

            if (!keywords[targetAgentKey]) {
                keywords[targetAgentKey] = [...agentKeywords];
            } else {
                // Merge fallback keywords that aren't already in the index keywords
                for (const fallbackKw of agentKeywords) {
                    if (!keywords[targetAgentKey].includes(fallbackKw)) {
                        keywords[targetAgentKey].push(fallbackKw);
                    }
                }
            }
        }

        return keywords;
    }

    /**
     * Build keyword frequency map (keyword -> number of agents using keyword)
     * Used to down-rank generic high-frequency keywords.
     * @returns {Object}
     */
    buildKeywordFrequency() {
        const frequency = {};

        const keywordSource = this.agentIndex
            ? (this.agentIndex.byKeywordFull || this.agentIndex.byKeyword)
            : null;

        if (keywordSource) {
            for (const [keyword, refs] of Object.entries(keywordSource)) {
                const uniqueAgents = new Set(
                    (refs || []).filter(ref =>
                        typeof ref === 'string' &&
                        !ref.startsWith('command:') &&
                        !this.isSemverPrefixedAgent(ref)
                    )
                );
                frequency[keyword.toLowerCase()] = Math.max(1, uniqueAgents.size);
            }
            return frequency;
        }

        // Fallback: estimate from local keyword map
        for (const keywords of Object.values(this.keywords || {})) {
            const unique = new Set((keywords || []).map(k => String(k).toLowerCase()));
            for (const keyword of unique) {
                frequency[keyword] = (frequency[keyword] || 0) + 1;
            }
        }

        return frequency;
    }

    /**
     * Infer tier from description text when explicit tier metadata is missing.
     * @param {string} description
     * @returns {number}
     */
    inferTierFromDescription(description) {
        const text = String(description || '').toLowerCase();
        if (!text) return 0;
        if (text.includes('must be used')) return 5;
        if (text.includes('use proactively')) return 4;
        if (text.includes('automatically routes')) return 3;
        return 0;
    }

    /**
     * Merge hardcoded descriptions with metadata from routing-index.
     * @param {Object} baseDescriptions
     * @returns {Object}
     */
    buildAgentDescriptions(baseDescriptions = {}) {
        const mergedDescriptions = { ...baseDescriptions };

        if (!this.agentIndex || (!this.agentIndex.agents && !this.agentIndex.agentsByFull)) {
            return mergedDescriptions;
        }

        const agentMetadata = this.agentIndex.agentsByFull || this.agentIndex.agents;

        for (const [agentName, metadata] of Object.entries(agentMetadata)) {
            const existing = { ...(mergedDescriptions[agentName] || {}) };
            const description = typeof metadata.description === 'string'
                ? metadata.description.trim()
                : '';

            if ((!existing.description || existing.description === 'No description') && description) {
                existing.description = description;
            }

            const parsedTier = Number.parseInt(String(metadata.tier || ''), 10);
            if (Number.isFinite(parsedTier)) {
                existing.tier = parsedTier;
            } else if (!existing.tier) {
                const inferred = this.inferTierFromDescription(existing.description || description);
                if (inferred > 0) {
                    existing.tier = inferred;
                }
            }

            if (!Array.isArray(existing.capabilities) || existing.capabilities.length === 0) {
                let capabilities = [];

                if (Array.isArray(metadata.tools) && metadata.tools.length > 0) {
                    capabilities = metadata.tools
                        .map(tool => String(tool).trim())
                        .filter(Boolean)
                        .slice(0, 6);
                }

                if (capabilities.length === 0 && Array.isArray(metadata.triggerKeywords)) {
                    capabilities = metadata.triggerKeywords
                        .map(keyword => String(keyword).trim())
                        .filter(keyword => keyword.length > 0)
                        .slice(0, 6);
                }

                if (capabilities.length > 0) {
                    existing.capabilities = capabilities;
                }
            }

            if (Object.keys(existing).length > 0) {
                mergedDescriptions[agentName] = existing;
            }
        }

        return mergedDescriptions;
    }

    /**
     * Get agent info by short or fully-qualified name.
     * @param {string} agentName
     * @returns {Object}
     */
    getAgentInfo(agentName) {
        const shortName = agentName.includes(':') ? agentName.split(':').pop() : agentName;
        if (this.agentDescriptions[agentName]) {
            return this.agentDescriptions[agentName];
        }
        if (this.agentDescriptions[shortName]) {
            return this.agentDescriptions[shortName];
        }

        const shortMap = this.agentIndex?.agentsByShort?.[shortName];
        if (Array.isArray(shortMap) && shortMap.length > 0) {
            const primaryFullName = shortMap[0];
            return this.agentDescriptions[primaryFullName] || {};
        }

        return {};
    }

    /**
     * Extract normalized numeric tier value for an agent.
     * @param {string} agentName
     * @returns {number}
     */
    extractTierValue(agentName) {
        const shortName = agentName.includes(':') ? agentName.split(':').pop() : agentName;
        const info = this.getAgentInfo(shortName);
        const parsedTier = Number.parseInt(String(info.tier || ''), 10);

        if (Number.isFinite(parsedTier)) {
            return parsedTier;
        }

        let indexInfo = null;
        if (this.agentIndex?.agentsByShort?.[shortName]?.length > 0 && this.agentIndex.agentsByFull) {
            indexInfo = this.agentIndex.agentsByFull[this.agentIndex.agentsByShort[shortName][0]] || null;
        } else if (this.agentIndex?.agents) {
            indexInfo = this.agentIndex.agents[shortName] || null;
        }

        const indexTier = Number.parseInt(String(indexInfo?.tier || ''), 10);
        if (Number.isFinite(indexTier)) {
            return indexTier;
        }

        const inferredTier = this.inferTierFromDescription(
            info.description || indexInfo?.description || ''
        );

        return inferredTier > 0 ? inferredTier : 1;
    }

    /**
     * Count keyword tokens after normalizing punctuation and regex markers.
     * @param {string} keyword
     * @returns {number}
     */
    getKeywordTokenCount(keyword) {
        const tokens = String(keyword || '')
            .toLowerCase()
            .replace(/[.*+?^${}()|[\]\\]/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

        return tokens.length || 1;
    }

    /**
     * Calculate weighted keyword contribution to agent score.
     * @param {string} keyword
     * @returns {number}
     */
    getKeywordContribution(keyword) {
        const normalized = String(keyword || '').toLowerCase().trim();
        if (!normalized) return 0;

        const tokens = normalized
            .replace(/[.*+?^${}()|[\]\\]/g, ' ')
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

        if (tokens.length === 0) return 0;

        const tokenCount = tokens.length;
        const frequency = this.keywordFrequency[normalized] || 1;
        const rarityWeight = 1 / Math.sqrt(Math.max(1, frequency));

        let baseWeight = 0.55;
        if (tokenCount === 2) baseWeight = 0.95;
        if (tokenCount >= 3) baseWeight = 1.35;

        if (tokenCount === 1) {
            const token = tokens[0];
            if (this.genericKeywords.has(token)) {
                baseWeight *= 0.2;
            }

            if (token.length <= 3 && !this.highSignalAcronyms.has(token)) {
                baseWeight *= 0.75;
            }
        }

        // Regex-like patterns are flexible but usually less specific than concrete phrases.
        if (/[.*+?()[\]{}|]/.test(normalized)) {
            baseWeight *= 0.9;
        }

        return baseWeight * rarityWeight;
    }

    /**
     * Detect explicit platform intent in task text.
     * @param {string} task
     * @returns {Set<string>}
     */
    detectPlatformIntent(task) {
        const intents = new Set();
        const text = String(task || '').toLowerCase();

        if (/\b(salesforce|sfdc)\b/.test(text)) intents.add('salesforce');
        if (/\b(hubspot|hs)\b/.test(text)) intents.add('hubspot');
        if (/\bmarketo\b/.test(text)) intents.add('marketo');
        if (/\bmonday(?:\.com)?\b/.test(text)) intents.add('monday');
        if (/\bn8n\b/.test(text)) intents.add('n8n');
        if (/\bgtm\b|go[-\s]?to[-\s]?market/.test(text)) intents.add('gtm-planning');

        return intents;
    }

    /**
     * Infer platform from fully-qualified or short agent name.
     * @param {string} agentName
     * @returns {string|null}
     */
    getAgentPlatform(agentName) {
        const name = String(agentName || '').toLowerCase();
        if (!name) return null;

        if (name.includes(':')) {
            const plugin = name.split(':')[0].replace(/^opspal-/, '');
            if (plugin === 'salesforce') return 'salesforce';
            if (plugin === 'hubspot') return 'hubspot';
            if (plugin === 'marketo') return 'marketo';
            if (plugin === 'monday') return 'monday';
            if (plugin === 'gtm-planning') return 'gtm-planning';
            if (plugin === 'core') return 'core';
            return plugin;
        }

        if (name.startsWith('sfdc-')) return 'salesforce';
        if (name.startsWith('hubspot-')) return 'hubspot';
        if (name.startsWith('marketo-')) return 'marketo';
        if (name.startsWith('monday-')) return 'monday';
        if (name.startsWith('gtm-')) return 'gtm-planning';

        return null;
    }

    /**
     * Apply platform-intent weighting to reduce cross-platform routing collisions.
     * @param {number} score
     * @param {string} agentName
     * @param {Set<string>} platformIntent
     * @returns {number}
     */
    applyPlatformIntentWeight(score, agentName, platformIntent) {
        if (!platformIntent || platformIntent.size === 0) {
            return score;
        }

        const agentPlatform = this.getAgentPlatform(agentName);
        if (!agentPlatform) {
            return score;
        }

        const neutralPlatforms = new Set(['core', 'data-hygiene', 'ai-consult']);

        if (platformIntent.size === 1) {
            const [target] = [...platformIntent];
            if (agentPlatform === target) {
                return score * 1.35;
            }
            if (neutralPlatforms.has(agentPlatform)) {
                return score * 0.9;
            }
            return score * 0.6;
        }

        if (platformIntent.has(agentPlatform)) {
            return score * 1.1;
        }

        if (neutralPlatforms.has(agentPlatform)) {
            return score * 0.95;
        }

        return score * 0.9;
    }

    /**
     * Apply targeted intent boosts for known high-value specialist routes.
     * @param {number} score
     * @param {string} agentName
     * @param {string} task
     * @param {Set<string>} platformIntent
     * @returns {number}
     */
    applyIntentSpecificWeight(score, agentName, task, platformIntent) {
        let adjusted = score;
        const text = String(task || '').toLowerCase();
        const shortName = this.getAgentShortName(agentName).toLowerCase();

        // Preserve dedicated RevOps reporting route without hijacking assessment/audit flows.
        if (/revops/.test(text) && /\b(report|kpi|metrics|forecast|alert)\b/.test(text)) {
            const hasAssessmentIntent = /\b(audit|assessment|governance|lifecycle)\b/.test(text);
            if (hasAssessmentIntent && shortName === 'sfdc-revops-auditor') {
                adjusted *= 1.45;
            } else if (!hasAssessmentIntent && shortName === 'revops-reporting-assistant') {
                adjusted *= 1.45;
            }
        }

        // For explicit platform orchestration requests, prioritize platform orchestrators.
        if (/\borchestrat|coordinate|multi[-\s]?step|complex workflow/.test(text) && platformIntent?.size === 1) {
            const [platform] = [...platformIntent];
            const preferredOrchestratorByPlatform = {
                salesforce: 'sfdc-orchestrator',
                hubspot: 'hubspot-orchestrator',
                marketo: 'marketo-orchestrator',
                monday: 'monday-orchestrator'
            };
            if (preferredOrchestratorByPlatform[platform] === shortName) {
                adjusted *= 1.5;
            }
        }

        // Preserve explicit "plan carefully" routing semantics.
        if (/\bplan carefully\b|unknown scope/.test(text) && shortName === 'sequential-planner') {
            adjusted *= 1.6;
        }

        // Prevent generic n8n workflow routing from overriding explicit HubSpot workflow requests.
        if (/\bhubspot\b/.test(text) && /\bworkflow|automation\b/.test(text)) {
            if (shortName === 'hubspot-workflow-builder') {
                adjusted *= 1.6;
            } else if (shortName === 'n8n-workflow-builder') {
                adjusted *= 0.7;
            }
        }

        // Salesforce field-creation requests should route to Salesforce field/metadata specialists.
        if (/\b(salesforce|sfdc)\b/.test(text) && /\bfield\b/.test(text) && /\b(add|create|update|modify|text|picklist|number|date)\b/.test(text)) {
            if (shortName === 'sfdc-field-analyzer') {
                adjusted *= 1.9;
            }
            if (shortName === 'sfdc-metadata-manager') {
                adjusted *= 1.5;
            }
            if (shortName === 'marketo-lead-manager' || shortName === 'marketo-lead-operations') {
                adjusted *= 0.55;
            }
        }

        // Cross-platform Salesforce↔HubSpot migration should prioritize migration orchestration.
        if (/\b(migrate|migration|transfer|etl)\b/.test(text) && /\bsalesforce|sfdc\b/.test(text) && /\bhubspot|hs\b/.test(text)) {
            if (shortName === 'data-migration-orchestrator') {
                adjusted *= 2.4;
            }
            if (shortName === 'cross-platform-pipeline-orchestrator') {
                adjusted *= 1.7;
            }
            if (shortName === 'account-expansion-orchestrator') {
                adjusted *= 0.45;
            }
        }

        // Preserve canonical Salesforce reporting route for dashboard/report build requests.
        if (/\b(salesforce|sfdc)\b/.test(text) && /\breport\b/.test(text) && /\bdashboard\b/.test(text)) {
            const isBuildIntent = /\b(build|create|generate|make)\b/.test(text);
            if (shortName === 'sfdc-reports-dashboards') {
                adjusted *= isBuildIntent ? 2.3 : 1.7;
            }
            if (shortName === 'sfdc-report-designer') {
                adjusted *= 0.75;
            }
            if (shortName === 'sfdc-report-type-manager') {
                adjusted *= 0.4;
            }
            if (isBuildIntent && (shortName === 'sfdc-report-validator' || shortName === 'compliance-report-generator')) {
                adjusted *= 0.45;
            }
        }

        return adjusted;
    }

    /**
     * Apply agent-tier and phrase-specific complexity floors so specialist routing
     * can still be required even when lexical complexity appears low.
     * @param {Object} complexity
     * @param {Object} match
     * @returns {Object}
     */
    applyAgentComplexityFloor(complexity, match) {
        if (!match) {
            return complexity;
        }

        const adjusted = {
            ...complexity,
            factors: Array.isArray(complexity.factors) ? [...complexity.factors] : []
        };

        const tier = this.extractTierValue(match.agent);
        let floor = 0;

        if (tier >= 5 && (match.strongMatches >= 1 || match.maxKeywordTokens >= 2)) {
            floor = 0.7;
        } else if (tier >= 4 && (match.strongMatches >= 1 || match.maxKeywordTokens >= 2)) {
            floor = 0.55;
        } else if (tier >= 3 && match.strongMatches >= 2) {
            floor = 0.4;
        } else if (tier >= 3 && match.strongMatches >= 1 && match.maxKeywordTokens >= 2) {
            floor = 0.35;
        }

        if (match.maxKeywordTokens >= 3) {
            floor = Math.max(floor, 0.5);
        }

        if (match.rawScore >= 1.4 && match.strongMatches >= 2) {
            floor = Math.max(floor, 0.6);
        }

        if (adjusted.score < floor) {
            adjusted.score = floor;
            adjusted.factors.push(`agent-specific complexity floor (tier ${tier})`);
        }

        adjusted.level = adjusted.score < 0.3 ? 'SIMPLE'
            : adjusted.score < 0.7 ? 'MEDIUM'
            : 'HIGH';

        return adjusted;
    }

    /**
     * QA-002: Get post-assessment handoff recommendation
     * Returns the recommended next agent after an assessment completes
     * @param {string} assessmentType - Type of completed assessment
     * @param {Array} findings - Assessment findings
     * @returns {Object} Handoff recommendation
     */
    postAssessmentHandoff(assessmentType, findings = []) {
        const findingsCount = Array.isArray(findings) ? findings.length : 0;

        return {
            recommendedAgent: 'implementation-planner',
            context: {
                assessmentType,
                findingsCount,
                priority: this.calculateFindingsPriority(findings),
                suggestedAction: findingsCount > 0
                    ? 'Create implementation plan for remediation'
                    : 'Assessment complete, no remediation needed'
            }
        };
    }

    /**
     * Calculate priority based on findings
     * @param {Array} findings - Assessment findings
     * @returns {string} Priority level
     */
    calculateFindingsPriority(findings) {
        if (!Array.isArray(findings) || findings.length === 0) return 'low';

        const hasCritical = findings.some(f =>
            f.severity === 'critical' || f.priority === 'P0'
        );
        const hasHigh = findings.some(f =>
            f.severity === 'high' || f.priority === 'P1'
        );

        if (hasCritical) return 'critical';
        if (hasHigh) return 'high';
        if (findings.length > 10) return 'medium';
        return 'low';
    }

    /**
     * Analyze task description and recommend agent
     * @param {string} taskDescription - The task to analyze
     * @returns {Object} Recommendation with agent, confidence, complexity, reasoning
     */
    analyze(taskDescription) {
        const lowercaseTask = String(taskDescription || '').toLowerCase();
        const guardrailAlerts = [];
        // Find matching agents first so we can apply agent-specific complexity floors.
        const matches = this.findMatchingAgents(lowercaseTask);

        // Calculate base lexical complexity
        const baseComplexity = this.calculateComplexity(lowercaseTask);

        // Determine recommendation
        if (matches.length === 0) {
            return this.noAgentRecommendation(baseComplexity);
        }

        // Get top recommendation
        const topMatch = matches[0];
        const complexity = this.applyAgentComplexityFloor(baseComplexity, topMatch);
        const agent = this.getAgentInfo(topMatch.agent);

        // Resolve short name to fully-qualified name
        const resolvedAgent = this.normalizeResolvedAgentName(topMatch.agent, 'primary', guardrailAlerts);
        const alternatives = matches.slice(1, 4).map(m => {
            const normalizedAgent = this.normalizeResolvedAgentName(m.agent, 'alternative', guardrailAlerts);
            return {
                agent: normalizedAgent,
                agentShortName: this.getAgentShortName(normalizedAgent),
                confidence: m.confidence,
                description: this.getAgentInfo(m.agent).description || 'No description'
            };
        });
        const reasoning = this.generateReasoning(topMatch, complexity, lowercaseTask);

        if (guardrailAlerts.length > 0) {
            reasoning.push(`Guardrail alerts: ${guardrailAlerts.map(alert => alert.type).join(', ')}`);
        }

        return {
            agent: resolvedAgent,
            agentShortName: this.getAgentShortName(resolvedAgent),
            confidence: topMatch.confidence,
            complexity: {
                score: complexity.score,
                level: complexity.level
            },
            reasoning,
            capabilities: agent.capabilities || [],
            guardrailAlerts,
            alternatives,
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
        if (/\b(bulk|batch|multiple|many|all)\b/.test(task)) {
            score += this.complexityWeights.bulk;
            factors.push('bulk operation');
        }

        if (/\b(production|prod|live|main)\b/.test(task)) {
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

        if (/\b(migrate|migration|move|transfer)\b/.test(task)) {
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

        if (/\b(rollback|revert|undo)\b/.test(task)) {
            score += this.complexityWeights.rollback;
            factors.push('rollback considerations');
        }

        if (/orchestrat|architect|design|model|framework|audit|assessment|diagnos|investigat|optimiz|strategy/.test(task)) {
            score += this.complexityWeights.advancedDesign;
            factors.push('advanced design/analysis task');
        }

        if (/report|dashboard|forecast|quota|territory|pipeline|revops|governance|compliance|scorecard|kpi|metrics/.test(task)) {
            score += this.complexityWeights.analyticsReporting;
            factors.push('analytics/reporting scope');
        }

        if (/cross[-\s]?platform|multi[-\s]?platform|salesforce.*hubspot|hubspot.*salesforce|marketo.*salesforce|marketo.*hubspot|sf.*hs|hs.*sf/.test(task)) {
            score += this.complexityWeights.crossPlatform;
            factors.push('cross-platform coordination');
        }

        if (task.split(/\s+/).filter(Boolean).length >= 14) {
            score += this.complexityWeights.scopeBreadth;
            factors.push('broad task scope');
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
        const platformIntent = this.detectPlatformIntent(task);

        for (const [agent, keywords] of Object.entries(this.keywords)) {
            let matchCount = 0;
            let rawScore = 0;
            let strongMatches = 0;
            let maxKeywordTokens = 0;
            const matchedKeywords = [];

            for (const keyword of keywords) {
                if (this.matchesKeyword(task, keyword)) {
                    const contribution = this.getKeywordContribution(keyword);
                    if (contribution <= 0) {
                        continue;
                    }

                    matchCount++;
                    rawScore += contribution;

                    const tokenCount = this.getKeywordTokenCount(keyword);
                    maxKeywordTokens = Math.max(maxKeywordTokens, tokenCount);
                    if (tokenCount >= 2) {
                        strongMatches++;
                    }

                    matchedKeywords.push({
                        keyword,
                        contribution,
                        tokenCount
                    });
                }
            }

            if (matchCount > 0) {
                rawScore = this.applyPlatformIntentWeight(rawScore, agent, platformIntent);
                rawScore = this.applyIntentSpecificWeight(rawScore, agent, task, platformIntent);

                // Filter weak incidental matches (e.g. single generic token collisions).
                const minScore = strongMatches > 0 ? 0.22 : 0.32;
                if (rawScore < minScore) {
                    continue;
                }

                matchedKeywords.sort((a, b) =>
                    b.contribution - a.contribution ||
                    b.tokenCount - a.tokenCount ||
                    b.keyword.length - a.keyword.length
                );

                const normalizedScore = rawScore / (rawScore + 1.2);
                const confidence = Math.min(
                    0.99,
                    Math.max(0.3, 0.35 + (normalizedScore * 0.6))
                );

                matches.push({
                    agent,
                    confidence,
                    matchCount,
                    rawScore,
                    strongMatches,
                    maxKeywordTokens,
                    tier: this.extractTierValue(agent),
                    matchQuality: normalizedScore,
                    matchedKeywords: matchedKeywords.map(m => m.keyword),
                    matchedKeywordScores: matchedKeywords.slice(0, 6)
                });
            }
        }

        // Sort by weighted score and specificity.
        matches.sort((a, b) =>
            b.rawScore - a.rawScore ||
            b.strongMatches - a.strongMatches ||
            b.maxKeywordTokens - a.maxKeywordTokens ||
            b.matchCount - a.matchCount ||
            b.tier - a.tier ||
            b.confidence - a.confidence
        );

        return matches;
    }

    /**
     * Match keyword using word boundaries to avoid substring collisions (e.g., "tag" in "stage").
     * @param {string} task - Lowercase task description
     * @param {string} keyword - Keyword to match
     * @returns {boolean} Match result
     */
    matchesKeyword(task, keyword) {
        const raw = keyword.toLowerCase().trim();
        if (!raw) return false;

        // Support regex-like keywords from routing registries (e.g., revops.*report).
        if (/[.*+?()[\]{}|]/.test(raw)) {
            try {
                const regexPattern = new RegExp(raw, 'i');
                if (regexPattern.test(task)) {
                    return true;
                }
            } catch (error) {
                // Fall back to escaped literal matching below.
            }
        }

        const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const spaced = escaped.replace(/\s+/g, '\\s+');
        const pattern = new RegExp(`\\b${spaced}\\b`, 'i');
        return pattern.test(task);
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
        if (match.matchedKeywordScores && match.matchedKeywordScores.length > 0) {
            const topKeywords = match.matchedKeywordScores
                .slice(0, 5)
                .map(m => m.keyword);
            reasoning.push(`Keywords detected: ${topKeywords.join(', ')}`);
        } else if (match.matchedKeywords.length > 0) {
            reasoning.push(`Keywords detected: ${match.matchedKeywords.slice(0, 5).join(', ')}`);
        }

        if (match.strongMatches > 0) {
            reasoning.push(`Specialist phrase matches: ${match.strongMatches}`);
        }

        // Add complexity factors
        if (complexity.factors.length > 0) {
            reasoning.push(...complexity.factors.map(f => `Complexity factor: ${f}`));
        }

        // Add agent-specific reasoning
        const agentInfo = this.getAgentInfo(match.agent);
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
                complexity.score >= 0.3
                    ? 'Task has complexity signals but no strong specialist match'
                    : 'Task appears to be straightforward',
                ...complexity.factors.map(f => `Note: ${f}`)
            ],
            capabilities: [],
            guardrailAlerts: [],
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

        if (recommendation.guardrailAlerts && recommendation.guardrailAlerts.length > 0) {
            lines.push('🚨 Guardrail Alerts:');
            for (const alert of recommendation.guardrailAlerts) {
                lines.push(`- ${alert.message}`);
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
    const args = process.argv.slice(2);
    const jsonOutput = args.includes('--json');
    const taskDescription = args.filter(arg => arg !== '--json').join(' ');

    if (!taskDescription) {
        console.error('Usage: task-router.js [--json] <task description>');
        console.error('Example: task-router.js "Deploy validation rules to production"');
        process.exit(1);
    }

    const router = new TaskRouter({ verbose: !jsonOutput });
    const recommendation = router.analyze(taskDescription);
    if (jsonOutput) {
        console.log(JSON.stringify(recommendation));
    } else {
        console.log(router.format(recommendation));
    }
}

module.exports = { TaskRouter };
