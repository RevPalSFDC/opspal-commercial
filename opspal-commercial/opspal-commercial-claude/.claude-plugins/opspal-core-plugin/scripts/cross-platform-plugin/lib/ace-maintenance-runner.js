#!/usr/bin/env node

/**
 * ACE Framework Maintenance Runner
 *
 * Orchestrates periodic maintenance tasks for the ACE Framework:
 * - Health check
 * - Confidence decay
 * - Cache cleanup
 * - Metrics reporting
 *
 * Designed to be scheduled via cron or task scheduler.
 *
 * Usage:
 *   node ace-maintenance-runner.js           # Run all tasks
 *   node ace-maintenance-runner.js --task health
 *   node ace-maintenance-runner.js --task decay
 *   node ace-maintenance-runner.js --task cleanup
 *   node ace-maintenance-runner.js --task report
 *
 * @version 1.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const SCRIPT_DIR = __dirname;
const CACHE_DIR = path.join(os.homedir(), '.claude', 'cache', 'ace-routing');
const LOG_FILE = path.join(os.homedir(), '.claude', 'logs', 'ace-maintenance.log');

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function runScript(scriptPath, args = []) {
    if (!fs.existsSync(scriptPath)) {
        log(`Script not found: ${scriptPath}`);
        return { success: false, error: 'Script not found' };
    }

    try {
        const result = execSync(`node "${scriptPath}" ${args.join(' ')}`, {
            encoding: 'utf-8',
            timeout: 60000,
            env: process.env
        });
        return { success: true, output: result.trim() };
    } catch (error) {
        return { success: false, error: error.message, output: error.stdout || '' };
    }
}

async function runHealthCheck() {
    log('=== Running ACE Health Check ===');

    const healthScript = path.join(SCRIPT_DIR, 'ace-health-check.js');
    const result = runScript(healthScript, ['--json']);

    if (result.success) {
        try {
            const health = JSON.parse(result.output);
            log(`Health Status: ${health.overall.toUpperCase()}`);

            if (health.warnings.length > 0) {
                log(`Warnings: ${health.warnings.join(', ')}`);
            }
            if (health.errors.length > 0) {
                log(`Errors: ${health.errors.join(', ')}`);
            }

            return { status: health.overall, details: health };
        } catch (e) {
            log(`Health check output parse error: ${e.message}`);
            return { status: 'unknown', error: e.message };
        }
    } else {
        log(`Health check failed: ${result.error}`);
        return { status: 'error', error: result.error };
    }
}

async function runConfidenceDecay() {
    log('=== Running Confidence Decay ===');

    // Only run if Supabase is configured
    if (!process.env.SUPABASE_URL) {
        log('Supabase not configured - skipping confidence decay');
        return { skipped: true, reason: 'Supabase not configured' };
    }

    const decayScript = path.join(SCRIPT_DIR, 'strategy-confidence-decay.js');
    const result = runScript(decayScript, ['--dry-run']); // Use dry-run for safety

    if (result.success) {
        log(`Confidence decay completed`);
        if (result.output) {
            // Parse output to count affected skills
            const lines = result.output.split('\n');
            const affectedCount = lines.filter(l => l.includes('decay')).length;
            log(`Skills affected: ${affectedCount}`);
            return { success: true, affected: affectedCount };
        }
        return { success: true };
    } else {
        log(`Confidence decay failed: ${result.error}`);
        return { success: false, error: result.error };
    }
}

async function runCacheCleanup() {
    log('=== Running Cache Cleanup ===');

    if (!fs.existsSync(CACHE_DIR)) {
        log('Cache directory does not exist - nothing to clean');
        return { cleaned: 0 };
    }

    let cleaned = 0;
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    try {
        const files = fs.readdirSync(CACHE_DIR);

        for (const file of files) {
            // Skip stats files (keep those longer)
            if (file.endsWith('_stats.json')) {
                continue;
            }

            const filePath = path.join(CACHE_DIR, file);
            const stat = fs.statSync(filePath);
            const age = now - stat.mtimeMs;

            if (age > maxAge) {
                fs.unlinkSync(filePath);
                cleaned++;
                log(`Cleaned expired cache: ${file}`);
            }
        }

        log(`Cache cleanup complete: ${cleaned} files removed`);
        return { cleaned };
    } catch (error) {
        log(`Cache cleanup error: ${error.message}`);
        return { cleaned, error: error.message };
    }
}

async function runPerformanceReport() {
    log('=== Running Performance Report ===');

    const recorderScript = path.join(SCRIPT_DIR, 'ace-execution-recorder.js');
    const result = runScript(recorderScript, ['health']);

    if (result.success) {
        try {
            const report = JSON.parse(result.output);
            log(`Total Agents Tracked: ${report.total_agents}`);
            log(`Total Executions: ${report.total_executions}`);
            log(`Overall Success Rate: ${(report.overall_success_rate * 100).toFixed(1)}%`);

            if (report.top_performers && report.top_performers.length > 0) {
                log('Top Performers:');
                for (const agent of report.top_performers) {
                    log(`  - ${agent.agent}: ${(agent.success_rate * 100).toFixed(1)}% (${agent.executions} runs)`);
                }
            }

            if (report.low_performers && report.low_performers.length > 0) {
                log('Low Performers (need attention):');
                for (const agent of report.low_performers) {
                    log(`  - ${agent.agent}: ${(agent.success_rate * 100).toFixed(1)}% (${agent.executions} runs)`);
                }
            }

            return { success: true, report };
        } catch (e) {
            log(`Report parse error: ${e.message}`);
            return { success: false, error: e.message };
        }
    } else {
        // No data yet is okay
        if (result.output && result.output.includes('total_agents')) {
            log('No execution data yet - ACE will start learning from agent usage');
            return { success: true, noData: true };
        }
        log(`Performance report failed: ${result.error}`);
        return { success: false, error: result.error };
    }
}

async function runAllTasks() {
    log('========================================');
    log('ACE FRAMEWORK MAINTENANCE');
    log(`Started: ${new Date().toISOString()}`);
    log('========================================');

    const results = {
        timestamp: new Date().toISOString(),
        tasks: {}
    };

    // 1. Health Check
    results.tasks.health = await runHealthCheck();

    // 2. Confidence Decay
    results.tasks.decay = await runConfidenceDecay();

    // 3. Cache Cleanup
    results.tasks.cleanup = await runCacheCleanup();

    // 4. Performance Report
    results.tasks.report = await runPerformanceReport();

    log('========================================');
    log('MAINTENANCE COMPLETE');
    log('========================================');

    // Summary
    const healthStatus = results.tasks.health.status || 'unknown';
    const cachesCleaned = results.tasks.cleanup.cleaned || 0;

    console.log(JSON.stringify(results, null, 2));

    return results;
}

// Parse arguments
function parseArgs(args) {
    const options = {
        task: null,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--task' && args[i + 1]) {
            options.task = args[++i];
        } else if (args[i] === '--help' || args[i] === '-h') {
            options.help = true;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
ACE Framework Maintenance Runner

Usage:
  node ace-maintenance-runner.js [options]

Options:
  --task <name>   Run specific task: health, decay, cleanup, report
  --help, -h      Show this help

Tasks:
  health    Run ACE health check
  decay     Run confidence decay (requires Supabase)
  cleanup   Clean expired cache files
  report    Generate performance report

Examples:
  # Run all maintenance tasks
  node ace-maintenance-runner.js

  # Run only health check
  node ace-maintenance-runner.js --task health

  # Run only performance report
  node ace-maintenance-runner.js --task report

Schedule via cron:
  # Weekly at 3 AM Sunday
  0 3 * * 0 node /path/to/ace-maintenance-runner.js
`);
}

async function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (options.task) {
        switch (options.task) {
            case 'health':
                await runHealthCheck();
                break;
            case 'decay':
                await runConfidenceDecay();
                break;
            case 'cleanup':
                await runCacheCleanup();
                break;
            case 'report':
                await runPerformanceReport();
                break;
            default:
                console.error(`Unknown task: ${options.task}`);
                process.exit(1);
        }
    } else {
        await runAllTasks();
    }
}

main().catch(error => {
    log(`Fatal error: ${error.message}`);
    process.exit(1);
});
