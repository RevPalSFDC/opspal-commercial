#!/usr/bin/env node

/**
 * ACE Framework Health Check
 *
 * Comprehensive health check for the ACE (Agentic Context Engineering) Framework.
 * Validates all components are properly configured and functioning.
 *
 * Usage:
 *   node ace-health-check.js              # Full health check
 *   node ace-health-check.js --quick      # Quick connectivity check
 *   node ace-health-check.js --json       # JSON output
 *
 * @version 1.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Resolve plugin root - prefer __dirname resolution for accuracy
// CLAUDE_PLUGIN_ROOT may point to parent repo, not specific plugin
function resolvePluginRoot() {
    const fromDirname = path.resolve(__dirname, '../..');
    const fromEnv = process.env.CLAUDE_PLUGIN_ROOT;

    // If env var is set and appears to be this plugin's directory, use it
    if (fromEnv && fromEnv.endsWith('opspal-core')) {
        return fromEnv;
    }

    // Otherwise use __dirname resolution (more reliable)
    return fromDirname;
}

// Configuration
const CONFIG = {
    PLUGIN_ROOT: resolvePluginRoot(),
    CACHE_DIR: path.join(os.homedir(), '.claude', 'cache', 'ace-routing'),
    LOG_DIR: path.join(os.homedir(), '.claude', 'logs'),
    METRICS_FILE: path.join(os.homedir(), '.claude', 'logs', 'ace-executions.jsonl'),
    ROUTING_LOG: path.join(os.homedir(), '.claude', 'logs', 'routing.jsonl')
};

class ACEHealthCheck {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.quick = options.quick || false;
        this.results = {
            timestamp: new Date().toISOString(),
            overall: 'unknown',
            components: {},
            warnings: [],
            errors: [],
            recommendations: []
        };
    }

    /**
     * Run all health checks
     */
    async runChecks() {
        console.error('[ACE Health Check] Starting...\n');

        // Core component checks
        await this.checkEnvironment();
        await this.checkScriptFiles();
        await this.checkHooks();
        await this.checkCacheDirectory();
        await this.checkLocalMetrics();

        if (!this.quick) {
            await this.checkSupabaseConnectivity();
            await this.checkSkillRegistry();
            await this.checkRoutingIntegration();
        }

        // Calculate overall health
        this.calculateOverallHealth();

        return this.results;
    }

    /**
     * Check environment variables
     */
    async checkEnvironment() {
        const component = {
            name: 'Environment Variables',
            status: 'healthy',
            details: {}
        };

        // Check ACE-specific env vars
        const aceVars = {
            'ENABLE_ACE_ROUTING': process.env.ENABLE_ACE_ROUTING || '1',
            'ENABLE_ACE_TIER_OVERRIDE': process.env.ENABLE_ACE_TIER_OVERRIDE || '1',
            'ENABLE_ACE_TRACKING': process.env.ENABLE_ACE_TRACKING || '1',
            'ACE_CACHE_TTL': process.env.ACE_CACHE_TTL || '300'
        };

        component.details.ace_settings = aceVars;

        // Check if ACE is enabled
        if (aceVars.ENABLE_ACE_ROUTING === '0') {
            component.status = 'disabled';
            this.results.warnings.push('ACE routing is disabled (ENABLE_ACE_ROUTING=0)');
        }

        // Check Supabase configuration
        const hasSupabase = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY));
        component.details.supabase_configured = hasSupabase;

        if (!hasSupabase) {
            this.results.warnings.push('Supabase not configured - ACE will use local-only mode');
        }

        this.results.components.environment = component;
    }

    /**
     * Check required script files exist
     */
    async checkScriptFiles() {
        const component = {
            name: 'Script Files',
            status: 'healthy',
            details: { files: {} }
        };

        const scriptDir = path.join(__dirname);
        const requiredScripts = [
            'skill-routing-boost.js',
            'ace-execution-recorder.js',
            'strategy-registry.js',
            'routing-learner.js',
            'strategy-confidence-decay.js'
        ];

        let missingCount = 0;
        for (const script of requiredScripts) {
            const scriptPath = path.join(scriptDir, script);
            const exists = fs.existsSync(scriptPath);
            component.details.files[script] = exists ? 'found' : 'missing';

            if (!exists) {
                missingCount++;
                this.results.errors.push(`Missing script: ${script}`);
            }
        }

        if (missingCount > 0) {
            component.status = missingCount === requiredScripts.length ? 'critical' : 'degraded';
        }

        this.results.components.scripts = component;
    }

    /**
     * Check hooks are properly configured
     * NOTE: subagent-utilization-booster.sh was consolidated into unified-router.sh (v2.0.0)
     */
    async checkHooks() {
        const component = {
            name: 'Hooks',
            status: 'healthy',
            details: { hooks: {} }
        };

        const hookDir = path.join(__dirname, '..', '..', 'hooks');

        // Required hooks - note: subagent-utilization-booster.sh is now unified-router.sh
        const requiredHooks = [
            'post-tool-use.sh',
            'post-reflect-strategy-update.sh'
        ];

        // Check for unified-router.sh OR legacy subagent-utilization-booster.sh
        const unifiedRouterPath = path.join(hookDir, 'unified-router.sh');
        const legacyBoosterPath = path.join(hookDir, 'subagent-utilization-booster.sh');

        if (fs.existsSync(unifiedRouterPath)) {
            try {
                fs.accessSync(unifiedRouterPath, fs.constants.X_OK);
                component.details.hooks['unified-router.sh'] = 'executable';
                component.details.routing_consolidation = 'unified-router.sh (replaces legacy 5-script chain)';
            } catch {
                component.details.hooks['unified-router.sh'] = 'not_executable';
                this.results.warnings.push('Hook not executable: unified-router.sh');
            }
        } else if (fs.existsSync(legacyBoosterPath)) {
            // Fall back to legacy hook if unified doesn't exist
            try {
                fs.accessSync(legacyBoosterPath, fs.constants.X_OK);
                component.details.hooks['subagent-utilization-booster.sh'] = 'executable';
            } catch {
                component.details.hooks['subagent-utilization-booster.sh'] = 'not_executable';
                this.results.warnings.push('Hook not executable: subagent-utilization-booster.sh');
            }
        } else {
            component.details.hooks['routing'] = 'missing';
            this.results.warnings.push('Missing routing hook (unified-router.sh or subagent-utilization-booster.sh)');
        }

        // Check other required hooks
        for (const hook of requiredHooks) {
            const hookPath = path.join(hookDir, hook);
            if (fs.existsSync(hookPath)) {
                try {
                    fs.accessSync(hookPath, fs.constants.X_OK);
                    component.details.hooks[hook] = 'executable';
                } catch {
                    component.details.hooks[hook] = 'not_executable';
                    this.results.warnings.push(`Hook not executable: ${hook}`);
                }
            } else {
                component.details.hooks[hook] = 'missing';
                this.results.warnings.push(`Missing hook: ${hook}`);
            }
        }

        // Check if routing hook contains ACE integration
        const routingHook = fs.existsSync(unifiedRouterPath) ? unifiedRouterPath : legacyBoosterPath;
        if (fs.existsSync(routingHook)) {
            const content = fs.readFileSync(routingHook, 'utf-8');
            component.details.ace_integrated = content.includes('ACE') ||
                                               content.includes('skill-routing-boost') ||
                                               content.includes('complexity');

            if (!component.details.ace_integrated) {
                component.status = 'degraded';
                this.results.warnings.push('ACE integration not found in routing hook');
            }
        }

        this.results.components.hooks = component;
    }

    /**
     * Check cache directory and contents
     */
    async checkCacheDirectory() {
        const component = {
            name: 'Cache Directory',
            status: 'healthy',
            details: {}
        };

        if (fs.existsSync(CONFIG.CACHE_DIR)) {
            component.details.path = CONFIG.CACHE_DIR;
            component.details.exists = true;

            // Count cache files
            const files = fs.readdirSync(CONFIG.CACHE_DIR);
            component.details.cache_files = files.length;

            // Check cache age - look for all json files (context_*.json and *_stats.json)
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            component.details.skill_cache_files = jsonFiles.length;

            if (jsonFiles.length > 0) {
                // Check oldest and newest cache
                let oldest = Date.now();
                let newest = 0;
                let newestFile = '';

                for (const file of jsonFiles) {
                    const filePath = path.join(CONFIG.CACHE_DIR, file);
                    const stat = fs.statSync(filePath);
                    if (stat.mtimeMs < oldest) oldest = stat.mtimeMs;
                    if (stat.mtimeMs > newest) {
                        newest = stat.mtimeMs;
                        newestFile = file;
                    }
                }

                const oldestDate = new Date(oldest);
                const newestDate = new Date(newest);
                const daysSinceUpdate = ((Date.now() - newest) / (24 * 3600000)).toFixed(1);

                component.details.oldest_cache_date = oldestDate.toISOString().split('T')[0];
                component.details.newest_cache_date = newestDate.toISOString().split('T')[0];
                component.details.newest_cache_file = newestFile;
                component.details.days_since_last_update = parseFloat(daysSinceUpdate);

                // Warn if skill data is stale (>14 days)
                if (parseFloat(daysSinceUpdate) > 14) {
                    component.status = 'degraded';
                    this.results.warnings.push(
                        `Skill data is stale (last updated ${daysSinceUpdate} days ago on ${newestDate.toISOString().split('T')[0]}). ` +
                        `Run /reflect to update ACE learning data.`
                    );
                }

                // Extract timestamp from newest cache file if possible
                try {
                    const newestContent = JSON.parse(fs.readFileSync(path.join(CONFIG.CACHE_DIR, newestFile), 'utf-8'));
                    if (newestContent.timestamp) {
                        component.details.last_recorded_timestamp = newestContent.timestamp;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        } else {
            component.details.exists = false;
            component.status = 'degraded';
            this.results.warnings.push('Cache directory does not exist - will be created on first use');
        }

        // Also check aggregated skill-data.json (generated by ace-skill-aggregator.js)
        // Debug: log path resolution
        if (this.verbose) {
            console.log('[DEBUG] PLUGIN_ROOT:', CONFIG.PLUGIN_ROOT);
        }
        const skillDataPath = path.join(CONFIG.PLUGIN_ROOT, 'config', 'skill-data.json');
        if (this.verbose) {
            console.log('[DEBUG] skillDataPath:', skillDataPath);
            console.log('[DEBUG] exists:', fs.existsSync(skillDataPath));
        }
        if (fs.existsSync(skillDataPath)) {
            try {
                const skillData = JSON.parse(fs.readFileSync(skillDataPath, 'utf-8'));
                component.details.aggregated_skill_data = {
                    exists: true,
                    generated_at: skillData.generated_at,
                    reflections_analyzed: skillData.total_reflections_analyzed,
                    skills_tracked: Object.keys(skillData.skill_confidence || {}).length
                };

                // If aggregated data is fresh, clear the stale warning
                if (skillData.generated_at) {
                    const generatedDate = new Date(skillData.generated_at);
                    const daysSinceAggregation = ((Date.now() - generatedDate.getTime()) / (24 * 3600000)).toFixed(1);
                    component.details.aggregated_skill_data.days_since_aggregation = parseFloat(daysSinceAggregation);

                    if (parseFloat(daysSinceAggregation) <= 14) {
                        // Fresh aggregated data - update status
                        component.status = 'healthy';
                        // Remove stale warning if it was added
                        this.results.warnings = this.results.warnings.filter(w => !w.includes('Skill data is stale'));
                    }
                }
            } catch (e) {
                component.details.aggregated_skill_data = { exists: true, error: e.message };
            }
        } else {
            component.details.aggregated_skill_data = { exists: false };
        }

        this.results.components.cache = component;
    }

    /**
     * Check local metrics/execution logs
     */
    async checkLocalMetrics() {
        const component = {
            name: 'Local Metrics',
            status: 'healthy',
            details: {}
        };

        // Check execution log
        if (fs.existsSync(CONFIG.METRICS_FILE)) {
            const stat = fs.statSync(CONFIG.METRICS_FILE);
            component.details.executions_file = {
                exists: true,
                size_kb: (stat.size / 1024).toFixed(1),
                last_modified: new Date(stat.mtimeMs).toISOString()
            };

            // Count lines (executions)
            try {
                const content = fs.readFileSync(CONFIG.METRICS_FILE, 'utf-8');
                const lines = content.trim().split('\n').filter(l => l.length > 0);
                component.details.executions_file.record_count = lines.length;

                // Parse last few entries
                if (lines.length > 0) {
                    const last = JSON.parse(lines[lines.length - 1]);
                    component.details.last_execution = {
                        agent: last.agent,
                        success: last.success,
                        timestamp: last.timestamp
                    };
                }
            } catch (e) {
                component.details.executions_file.parse_error = e.message;
            }
        } else {
            component.details.executions_file = { exists: false };
            this.results.warnings.push('No execution history yet - ACE will start learning from first agent use');
        }

        // Check routing log
        if (fs.existsSync(CONFIG.ROUTING_LOG)) {
            const stat = fs.statSync(CONFIG.ROUTING_LOG);
            component.details.routing_log = {
                exists: true,
                size_kb: (stat.size / 1024).toFixed(1)
            };
        } else {
            component.details.routing_log = { exists: false };
        }

        this.results.components.metrics = component;
    }

    /**
     * Check Supabase connectivity
     */
    async checkSupabaseConnectivity() {
        const component = {
            name: 'Supabase Connection',
            status: 'healthy',
            details: {}
        };

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            component.status = 'disabled';
            component.details.reason = 'Not configured';
            this.results.components.supabase = component;
            return;
        }

        try {
            // Test connectivity with a simple query
            const testUrl = `${supabaseUrl}/rest/v1/skills?limit=1&select=skill_id`;
            const result = execSync(
                `curl -s -o /dev/null -w "%{http_code}" -X GET "${testUrl}" ` +
                `-H "apikey: ${supabaseKey}" -H "Authorization: Bearer ${supabaseKey}"`,
                { encoding: 'utf-8', timeout: 10000 }
            ).trim();

            if (result === '200') {
                component.details.connectivity = 'ok';
                component.details.response_code = result;
            } else if (result === '401' || result === '403') {
                component.status = 'degraded';
                component.details.connectivity = 'auth_error';
                component.details.response_code = result;
                this.results.errors.push(`Supabase auth error (HTTP ${result})`);
            } else {
                component.status = 'degraded';
                component.details.connectivity = 'error';
                component.details.response_code = result;
                this.results.warnings.push(`Supabase returned HTTP ${result}`);
            }
        } catch (error) {
            component.status = 'error';
            component.details.connectivity = 'failed';
            component.details.error = error.message;
            this.results.errors.push('Cannot connect to Supabase');
        }

        this.results.components.supabase = component;
    }

    /**
     * Check skill registry has data
     */
    async checkSkillRegistry() {
        const component = {
            name: 'Skill Registry',
            status: 'healthy',
            details: {}
        };

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            component.status = 'disabled';
            component.details.reason = 'Supabase not configured';
            this.results.components.registry = component;
            return;
        }

        try {
            // Count skills
            const countUrl = `${supabaseUrl}/rest/v1/skills?select=skill_id&limit=1000`;
            const result = execSync(
                `curl -s -X GET "${countUrl}" ` +
                `-H "apikey: ${supabaseKey}" -H "Authorization: Bearer ${supabaseKey}"`,
                { encoding: 'utf-8', timeout: 10000 }
            );

            const skills = JSON.parse(result);
            component.details.skill_count = Array.isArray(skills) ? skills.length : 0;

            if (component.details.skill_count === 0) {
                component.status = 'empty';
                this.results.recommendations.push('Register skills using /reflect to start building ACE performance data');
            }

            // Count recent executions
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const execUrl = `${supabaseUrl}/rest/v1/skill_executions?created_at=gte.${weekAgo}&select=id&limit=1000`;
            const execResult = execSync(
                `curl -s -X GET "${execUrl}" ` +
                `-H "apikey: ${supabaseKey}" -H "Authorization: Bearer ${supabaseKey}"`,
                { encoding: 'utf-8', timeout: 10000 }
            );

            const executions = JSON.parse(execResult);
            component.details.executions_last_7_days = Array.isArray(executions) ? executions.length : 0;

        } catch (error) {
            component.status = 'error';
            component.details.error = error.message;
            this.results.errors.push('Cannot query skill registry');
        }

        this.results.components.registry = component;
    }

    /**
     * Check routing integration is working
     */
    async checkRoutingIntegration() {
        const component = {
            name: 'Routing Integration',
            status: 'healthy',
            details: {}
        };

        // Test skill-routing-boost.js
        const boostScript = path.join(__dirname, 'skill-routing-boost.js');

        if (fs.existsSync(boostScript)) {
            try {
                const result = execSync(
                    `node "${boostScript}" --agent test-agent --format json 2>/dev/null`,
                    { encoding: 'utf-8', timeout: 5000 }
                );

                const parsed = JSON.parse(result.trim());
                component.details.boost_script = 'working';
                component.details.test_result = {
                    boost: parsed.boost,
                    reason: parsed.reason || 'No skills found'
                };
            } catch (error) {
                component.details.boost_script = 'error';
                component.details.error = error.message;
                component.status = 'degraded';
                this.results.warnings.push('skill-routing-boost.js returned error');
            }
        } else {
            component.details.boost_script = 'missing';
            component.status = 'critical';
            this.results.errors.push('skill-routing-boost.js not found');
        }

        this.results.components.routing = component;
    }

    /**
     * Calculate overall health status
     */
    calculateOverallHealth() {
        const components = Object.values(this.results.components);

        // Count statuses
        const critical = components.filter(c => c.status === 'critical').length;
        const errors = components.filter(c => c.status === 'error').length;
        const degraded = components.filter(c => c.status === 'degraded').length;
        const disabled = components.filter(c => c.status === 'disabled').length;
        const healthy = components.filter(c => c.status === 'healthy').length;

        if (critical > 0 || errors > 0) {
            this.results.overall = 'critical';
        } else if (degraded > 0) {
            this.results.overall = 'degraded';
        } else if (disabled > 0 && healthy === 0) {
            this.results.overall = 'disabled';
        } else {
            this.results.overall = 'healthy';
        }

        // Add recommendations based on state
        if (this.results.overall === 'healthy' && this.results.warnings.length === 0) {
            this.results.recommendations.push('ACE Framework is fully operational');
        }

        if (!process.env.SUPABASE_URL) {
            this.results.recommendations.push('Configure Supabase for persistent skill tracking and cross-session learning');
        }
    }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function parseArgs(args) {
    const options = {
        verbose: false,
        quick: false,
        json: false,
        help: false
    };

    for (const arg of args) {
        if (arg === '--verbose' || arg === '-v') options.verbose = true;
        if (arg === '--quick' || arg === '-q') options.quick = true;
        if (arg === '--json' || arg === '-j') options.json = true;
        if (arg === '--help' || arg === '-h') options.help = true;
    }

    return options;
}

function showHelp() {
    console.log(`
ACE Framework Health Check

Usage:
  node ace-health-check.js [options]

Options:
  --quick, -q     Quick check (skip Supabase/registry checks)
  --json, -j      Output in JSON format
  --verbose, -v   Show verbose output
  --help, -h      Show this help

Components Checked:
  - Environment variables (ACE settings)
  - Script files (boost, recorder, registry)
  - Hooks (routing, tool validation, reflect)
  - Cache directory and contents
  - Local metrics/execution logs
  - Supabase connectivity (if configured)
  - Skill registry data
  - Routing integration

Examples:
  # Full health check with human-readable output
  node ace-health-check.js

  # Quick check (faster, no network calls)
  node ace-health-check.js --quick

  # JSON output for programmatic use
  node ace-health-check.js --json
`);
}

function formatResults(results, jsonOutput) {
    if (jsonOutput) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }

    // Human-readable output
    const statusIcons = {
        healthy: '\u2705',      // Green checkmark
        degraded: '\u26A0\uFE0F', // Warning
        critical: '\u274C',     // Red X
        error: '\u274C',        // Red X
        disabled: '\u23F8\uFE0F', // Pause
        empty: '\u2139\uFE0F',   // Info
        unknown: '\u2753'       // Question mark
    };

    console.log('\n' + '='.repeat(60));
    console.log('ACE FRAMEWORK HEALTH CHECK');
    console.log('='.repeat(60) + '\n');

    // Overall status
    const overallIcon = statusIcons[results.overall] || statusIcons.unknown;
    console.log(`Overall Status: ${overallIcon} ${results.overall.toUpperCase()}\n`);

    // Component details
    console.log('Components:');
    console.log('-'.repeat(40));

    for (const [key, component] of Object.entries(results.components)) {
        const icon = statusIcons[component.status] || statusIcons.unknown;
        console.log(`  ${icon} ${component.name}: ${component.status}`);
    }

    // Warnings
    if (results.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of results.warnings) {
            console.log(`  \u26A0\uFE0F  ${warning}`);
        }
    }

    // Errors
    if (results.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of results.errors) {
            console.log(`  \u274C ${error}`);
        }
    }

    // Recommendations
    if (results.recommendations.length > 0) {
        console.log('\nRecommendations:');
        for (const rec of results.recommendations) {
            console.log(`  \u2192 ${rec}`);
        }
    }

    console.log('\n' + '='.repeat(60) + '\n');
}

async function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    const checker = new ACEHealthCheck(options);
    const results = await checker.runChecks();

    formatResults(results, options.json);

    // Exit code based on health
    if (results.overall === 'critical' || results.overall === 'error') {
        process.exit(1);
    } else if (results.overall === 'degraded') {
        process.exit(2);
    } else {
        process.exit(0);
    }
}

// Run CLI
if (require.main === module) {
    main().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

module.exports = { ACEHealthCheck };
