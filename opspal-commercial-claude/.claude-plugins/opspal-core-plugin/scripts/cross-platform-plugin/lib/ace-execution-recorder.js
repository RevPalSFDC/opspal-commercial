#!/usr/bin/env node

/**
 * ACE Execution Recorder - Automatic Skill Performance Tracking
 *
 * Records agent task executions to the ACE Framework for routing optimization.
 * Called by post-tool-use hooks after Task tool completions.
 *
 * Usage:
 *   node ace-execution-recorder.js --agent sfdc-revops-auditor --success true --duration 45000
 *   node ace-execution-recorder.js --agent sfdc-cpq-assessor --success false --error-type timeout
 *
 * @version 1.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Configuration
const CONFIG = {
    LOG_DIR: path.join(os.homedir(), '.claude', 'logs'),
    METRICS_FILE: path.join(os.homedir(), '.claude', 'logs', 'ace-executions.jsonl'),
    CACHE_DIR: path.join(os.homedir(), '.claude', 'cache', 'ace-routing'),
    MIN_EXECUTIONS_FOR_SKILL: 3,  // Register as skill after N successful executions
    CATEGORY_KEYWORDS: {
        assessment: ['audit', 'assessment', 'review', 'analyze', 'evaluate', 'check'],
        deployment: ['deploy', 'release', 'push', 'production', 'migrate'],
        creation: ['create', 'build', 'new', 'add', 'generate', 'setup'],
        remediation: ['fix', 'resolve', 'debug', 'error', 'repair', 'correct'],
        analysis: ['query', 'report', 'dashboard', 'metrics', 'data', 'search']
    }
};

class ACEExecutionRecorder {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;

        // Ensure directories exist
        if (!fs.existsSync(CONFIG.LOG_DIR)) {
            fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
        }
        if (!fs.existsSync(CONFIG.CACHE_DIR)) {
            fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
        }
    }

    /**
     * Record a task execution
     * @param {Object} execution
     * @param {string} execution.agent - Agent that was used
     * @param {boolean} execution.success - Whether task succeeded
     * @param {number} [execution.durationMs] - Execution time in milliseconds
     * @param {string} [execution.taskDescription] - Description of the task
     * @param {string} [execution.errorType] - Error type if failed
     * @param {string} [execution.errorMessage] - Error message if failed
     * @param {string} [execution.orgAlias] - Target org/portal
     * @param {string} [execution.category] - Task category
     * @returns {Promise<Object>} Recording result
     */
    async record(execution) {
        this.log('Recording execution', execution);

        // Validate required fields
        if (!execution.agent) {
            throw new Error('Agent is required');
        }
        if (execution.success === undefined) {
            throw new Error('Success status is required');
        }

        // Detect category if not provided
        const category = execution.category || this.detectCategory(execution.taskDescription || '');

        // Generate execution record
        const record = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            agent: execution.agent,
            success: execution.success,
            duration_ms: execution.durationMs || null,
            task_description: execution.taskDescription || null,
            category: category,
            error_type: execution.errorType || null,
            error_message: execution.errorMessage || null,
            org_alias: execution.orgAlias || null,
            user_email: process.env.USER_EMAIL || null,
            session_id: process.env.CLAUDE_SESSION_ID || null
        };

        if (this.dryRun) {
            this.log('[DRY RUN] Would record', record);
            return { recorded: true, dryRun: true, record };
        }

        // Append to local JSONL log
        await this.appendToLog(record);

        // Update local metrics cache
        await this.updateLocalCache(record);

        // Try to sync to Supabase if available
        const synced = await this.syncToSupabase(record);

        // Check if agent should be promoted to skill
        if (execution.success) {
            await this.checkSkillPromotion(execution.agent, category);
        }

        // Invalidate routing boost cache for this agent
        this.invalidateBoostCache(execution.agent);

        return {
            recorded: true,
            id: record.id,
            synced,
            category
        };
    }

    /**
     * Detect task category from description
     */
    detectCategory(description) {
        if (!description) return 'general';

        const lower = description.toLowerCase();

        // Detect flow-scanner operations (v3.56.0+)
        if (lower.match(/auto-fix|sarif|\.flow-validator\.yml|flow.?scanner/)) {
            return 'flow-scanner';
        }

        for (const [category, keywords] of Object.entries(CONFIG.CATEGORY_KEYWORDS)) {
            if (keywords.some(kw => lower.includes(kw))) {
                return category;
            }
        }

        return 'general';
    }

    /**
     * Append record to local JSONL log
     */
    async appendToLog(record) {
        try {
            const line = JSON.stringify(record) + '\n';
            fs.appendFileSync(CONFIG.METRICS_FILE, line);
            this.log('Appended to log', CONFIG.METRICS_FILE);
        } catch (error) {
            this.log('Failed to append to log', error.message);
        }
    }

    /**
     * Update local cache with execution stats
     */
    async updateLocalCache(record) {
        const cacheKey = `${record.agent}_stats`;
        const cachePath = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);

        try {
            let stats = {
                agent: record.agent,
                total: 0,
                success: 0,
                failed: 0,
                categories: {},
                last_execution: null,
                total_duration_ms: 0
            };

            if (fs.existsSync(cachePath)) {
                stats = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            }

            // Update stats
            stats.total++;
            if (record.success) {
                stats.success++;
            } else {
                stats.failed++;
            }

            if (record.duration_ms) {
                stats.total_duration_ms += record.duration_ms;
            }

            stats.last_execution = record.timestamp;

            // Update category stats
            if (!stats.categories[record.category]) {
                stats.categories[record.category] = { total: 0, success: 0 };
            }
            stats.categories[record.category].total++;
            if (record.success) {
                stats.categories[record.category].success++;
            }

            // Calculate success rate
            stats.success_rate = stats.total > 0 ? stats.success / stats.total : 0;
            stats.avg_duration_ms = stats.total > 0 ? Math.round(stats.total_duration_ms / stats.total) : null;

            // Save cache
            fs.writeFileSync(cachePath, JSON.stringify(stats, null, 2));
            this.log('Updated cache', stats);

            return stats;
        } catch (error) {
            this.log('Failed to update cache', error.message);
            return null;
        }
    }

    /**
     * Try to sync record to Supabase
     */
    async syncToSupabase(record) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            this.log('Supabase not configured, skipping sync');
            return false;
        }

        try {
            // Try to find or create skill for this agent
            const skillId = await this.getOrCreateSkillId(record.agent, record.category);

            const { execSync } = require('child_process');
            const payload = JSON.stringify({
                skill_id: skillId,
                agent: record.agent,
                success: record.success,
                duration_ms: record.duration_ms,
                session_id: record.session_id,
                task_description: record.task_description,
                error_type: record.error_type,
                error_message: record.error_message,
                user_email: record.user_email,
                context: { category: record.category }
            });

            const curlCmd = `curl -s -X POST "${supabaseUrl}/rest/v1/skill_executions" ` +
                `-H "apikey: ${supabaseKey}" ` +
                `-H "Authorization: Bearer ${supabaseKey}" ` +
                `-H "Content-Type: application/json" ` +
                `-H "Prefer: return=minimal" ` +
                `-d '${payload.replace(/'/g, "'\\''")}'`;

            execSync(curlCmd, { encoding: 'utf-8', timeout: 10000 });
            this.log('Synced to Supabase');
            return true;
        } catch (error) {
            this.log('Supabase sync failed', error.message);
            return false;
        }
    }

    /**
     * Get or create skill ID for agent
     */
    async getOrCreateSkillId(agent, category) {
        // Generate deterministic skill ID based on agent name
        const skillId = `native_${agent.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        return skillId;
    }

    /**
     * Check if agent should be promoted to a registered skill
     */
    async checkSkillPromotion(agent, category) {
        const cacheKey = `${agent}_stats`;
        const cachePath = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);

        if (!fs.existsSync(cachePath)) return;

        try {
            const stats = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

            // Check if meets threshold for skill registration
            if (stats.success >= CONFIG.MIN_EXECUTIONS_FOR_SKILL) {
                this.log(`Agent ${agent} qualifies for skill registration (${stats.success} successful executions)`);
                // Skill registration happens via strategy-registry.js
                // This just logs the qualification
            }
        } catch (error) {
            this.log('Skill promotion check failed', error.message);
        }
    }

    /**
     * Invalidate boost cache for agent
     */
    invalidateBoostCache(agent) {
        const patterns = [
            `${agent}_all.json`,
            `${agent}_assessment.json`,
            `${agent}_deployment.json`,
            `${agent}_creation.json`,
            `${agent}_remediation.json`,
            `${agent}_analysis.json`,
            `${agent}_general.json`
        ];

        for (const pattern of patterns) {
            const cachePath = path.join(CONFIG.CACHE_DIR, pattern);
            if (fs.existsSync(cachePath)) {
                try {
                    fs.unlinkSync(cachePath);
                    this.log('Invalidated cache', cachePath);
                } catch (error) {
                    // Ignore
                }
            }
        }
    }

    /**
     * Get execution stats for an agent (from local cache)
     */
    getAgentStats(agent) {
        const cacheKey = `${agent}_stats`;
        const cachePath = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);

        if (!fs.existsSync(cachePath)) {
            return null;
        }

        try {
            return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        } catch (error) {
            return null;
        }
    }

    /**
     * Get all agent stats (for health check)
     */
    getAllStats() {
        const stats = {};

        try {
            const files = fs.readdirSync(CONFIG.CACHE_DIR)
                .filter(f => f.endsWith('_stats.json'));

            for (const file of files) {
                const agent = file.replace('_stats.json', '');
                const data = JSON.parse(fs.readFileSync(path.join(CONFIG.CACHE_DIR, file), 'utf-8'));
                stats[agent] = data;
            }
        } catch (error) {
            this.log('Failed to get all stats', error.message);
        }

        return stats;
    }

    /**
     * Log message if verbose
     */
    log(message, data = null) {
        if (this.verbose) {
            if (data) {
                console.error(`[ace-recorder] ${message}:`, typeof data === 'string' ? data : JSON.stringify(data));
            } else {
                console.error(`[ace-recorder] ${message}`);
            }
        }
    }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function parseArgs(args) {
    const options = {
        agent: null,
        success: null,
        durationMs: null,
        taskDescription: null,
        errorType: null,
        errorMessage: null,
        orgAlias: null,
        category: null,
        verbose: false,
        dryRun: false,
        command: 'record'  // record, stats, health
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--agent' && args[i + 1]) {
            options.agent = args[++i];
        } else if ((arg === '--success' || arg === '-s') && args[i + 1]) {
            options.success = args[++i].toLowerCase() === 'true';
        } else if ((arg === '--duration' || arg === '--duration-ms') && args[i + 1]) {
            options.durationMs = parseInt(args[++i], 10);
        } else if ((arg === '--task' || arg === '--task-description') && args[i + 1]) {
            options.taskDescription = args[++i];
        } else if (arg === '--error-type' && args[i + 1]) {
            options.errorType = args[++i];
        } else if (arg === '--error-message' && args[i + 1]) {
            options.errorMessage = args[++i];
        } else if ((arg === '--org' || arg === '--org-alias') && args[i + 1]) {
            options.orgAlias = args[++i];
        } else if (arg === '--category' && args[i + 1]) {
            options.category = args[++i];
        } else if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === 'stats') {
            options.command = 'stats';
        } else if (arg === 'health') {
            options.command = 'health';
        } else if (arg === '--help' || arg === '-h') {
            options.help = true;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
ACE Execution Recorder - Automatic Skill Performance Tracking

Usage:
  node ace-execution-recorder.js [command] [options]

Commands:
  record (default)     Record a task execution
  stats                Show stats for an agent
  health               Show ACE Framework health summary

Options for 'record':
  --agent <name>       Agent that was used (required)
  --success <bool>     Whether task succeeded (required)
  --duration <ms>      Execution duration in milliseconds
  --task <desc>        Task description
  --error-type <type>  Error type if failed
  --error-message <m>  Error message if failed
  --org <alias>        Target org/portal
  --category <cat>     Task category (auto-detected if not provided)

Options for 'stats':
  --agent <name>       Agent to show stats for

General Options:
  --verbose, -v        Show debug output
  --dry-run            Don't actually record
  --help, -h           Show this help

Examples:
  # Record successful execution
  node ace-execution-recorder.js --agent sfdc-revops-auditor --success true --duration 45000

  # Record failed execution
  node ace-execution-recorder.js --agent sfdc-cpq-assessor --success false --error-type timeout

  # Show agent stats
  node ace-execution-recorder.js stats --agent sfdc-revops-auditor

  # Show health summary
  node ace-execution-recorder.js health
`);
}

async function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    const recorder = new ACEExecutionRecorder({
        verbose: options.verbose,
        dryRun: options.dryRun
    });

    try {
        switch (options.command) {
            case 'stats': {
                if (!options.agent) {
                    console.error('Error: --agent is required for stats command');
                    process.exit(1);
                }
                const stats = recorder.getAgentStats(options.agent);
                if (stats) {
                    console.log(JSON.stringify(stats, null, 2));
                } else {
                    console.log(JSON.stringify({ agent: options.agent, total: 0, message: 'No stats recorded' }));
                }
                break;
            }

            case 'health': {
                const allStats = recorder.getAllStats();
                const agents = Object.keys(allStats);

                const summary = {
                    total_agents: agents.length,
                    total_executions: agents.reduce((sum, a) => sum + allStats[a].total, 0),
                    total_successes: agents.reduce((sum, a) => sum + allStats[a].success, 0),
                    total_failures: agents.reduce((sum, a) => sum + allStats[a].failed, 0),
                    overall_success_rate: 0,
                    top_performers: [],
                    low_performers: [],
                    agents: allStats
                };

                if (summary.total_executions > 0) {
                    summary.overall_success_rate = (summary.total_successes / summary.total_executions).toFixed(3);
                }

                // Find top/low performers
                const sortedBySuccess = agents
                    .filter(a => allStats[a].total >= 3)
                    .sort((a, b) => allStats[b].success_rate - allStats[a].success_rate);

                summary.top_performers = sortedBySuccess.slice(0, 5).map(a => ({
                    agent: a,
                    success_rate: allStats[a].success_rate,
                    executions: allStats[a].total
                }));

                summary.low_performers = sortedBySuccess.slice(-3).filter(a => allStats[a].success_rate < 0.7).map(a => ({
                    agent: a,
                    success_rate: allStats[a].success_rate,
                    executions: allStats[a].total
                }));

                console.log(JSON.stringify(summary, null, 2));
                break;
            }

            case 'record':
            default: {
                if (!options.agent) {
                    console.error('Error: --agent is required');
                    process.exit(1);
                }
                if (options.success === null) {
                    console.error('Error: --success is required');
                    process.exit(1);
                }

                const result = await recorder.record({
                    agent: options.agent,
                    success: options.success,
                    durationMs: options.durationMs,
                    taskDescription: options.taskDescription,
                    errorType: options.errorType,
                    errorMessage: options.errorMessage,
                    orgAlias: options.orgAlias,
                    category: options.category
                });

                console.log(JSON.stringify(result));
                break;
            }
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Run CLI
if (require.main === module) {
    main();
}

module.exports = { ACEExecutionRecorder, CONFIG };
