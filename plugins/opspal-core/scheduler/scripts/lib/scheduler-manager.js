#!/usr/bin/env node
/**
 * Scheduler Manager - CLI Backend for Task Scheduling
 *
 * Manages scheduled tasks configuration and cron installation.
 *
 * Commands:
 *   add         Add a new scheduled task
 *   remove      Remove a task by ID
 *   list        List all tasks
 *   enable      Enable a task
 *   disable     Disable a task
 *   run         Run a task immediately
 *   logs        View task execution logs
 *   history     View execution history
 *   install     Install crontab entries
 *   uninstall   Remove crontab entries
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');

// Paths
const SCRIPT_DIR = __dirname;
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const SCHEDULER_ROOT = path.resolve(PLUGIN_ROOT, 'scheduler');
const CONFIG_FILE = path.join(SCHEDULER_ROOT, 'config/scheduler-config.json');
const LOG_DIR = path.join(SCHEDULER_ROOT, 'logs');
const TASK_RUNNER = path.join(SCHEDULER_ROOT, 'scripts/task-runner.sh');
const CRON_COMMENT = '# Claude-Code-Scheduler';

/**
 * SchedulerManager - Core class for managing scheduled tasks
 */
class SchedulerManager {
    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from file, creating default if needed
     */
    loadConfig() {
        if (!fs.existsSync(CONFIG_FILE)) {
            const defaultConfig = {
                version: '1.0.0',
                defaults: {
                    timeout: 600,
                    retries: 0,
                    workingDir: '${PROJECT_ROOT}',
                    logRetentionDays: 30,
                    notifications: {
                        slack: {
                            enabled: true,
                            webhookEnvVar: 'SLACK_WEBHOOK_URL',
                            notifyOn: ['failure']
                        }
                    }
                },
                tasks: []
            };
            this.saveConfig(defaultConfig);
            return defaultConfig;
        }
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }

    /**
     * Save configuration to file
     */
    saveConfig(config = this.config) {
        const dir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    }

    /**
     * Generate a unique task ID from name
     */
    generateTaskId(name) {
        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        const hash = crypto.randomBytes(4).toString('hex');
        return `${slug}-${hash}`;
    }

    /**
     * Validate cron schedule format (5 fields)
     */
    validateCronSchedule(schedule) {
        const parts = schedule.trim().split(/\s+/);
        if (parts.length !== 5) {
            throw new Error('Invalid cron schedule: must have 5 fields (minute hour day month weekday)');
        }

        // Basic validation for each field
        const ranges = [
            { min: 0, max: 59, name: 'minute' },
            { min: 0, max: 23, name: 'hour' },
            { min: 1, max: 31, name: 'day' },
            { min: 1, max: 12, name: 'month' },
            { min: 0, max: 6, name: 'weekday' }
        ];

        parts.forEach((part, i) => {
            if (part === '*') return;
            if (part.includes('/')) return; // Step values
            if (part.includes('-')) return; // Ranges
            if (part.includes(',')) return; // Lists

            const num = parseInt(part, 10);
            if (isNaN(num) || num < ranges[i].min || num > ranges[i].max) {
                throw new Error(`Invalid ${ranges[i].name} value: ${part}`);
            }
        });

        return true;
    }

    /**
     * Get human-readable description of cron schedule
     */
    describeCronSchedule(schedule) {
        const parts = schedule.trim().split(/\s+/);
        const [minute, hour, day, month, weekday] = parts;

        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        if (minute.startsWith('*/')) {
            return `Every ${minute.slice(2)} minutes`;
        }
        if (hour === '*' && minute !== '*') {
            return `Every hour at :${minute.padStart(2, '0')}`;
        }
        if (day === '*' && month === '*' && weekday === '*') {
            return `Daily at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        }
        if (weekday !== '*' && day === '*') {
            const dayName = weekdays[parseInt(weekday)] || weekday;
            return `Weekly ${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        }

        return schedule;
    }

    // =============================================================================
    // Task Management
    // =============================================================================

    /**
     * Add a new scheduled task
     */
    addTask(options) {
        const {
            name,
            type,
            schedule,
            command,
            prompt,
            workingDir = this.config.defaults.workingDir,
            timeout = this.config.defaults.timeout,
            enabled = true,
            notifyOn = ['failure'],
            env = {}
        } = options;

        // Validate required fields
        if (!name) throw new Error('Task name is required');
        if (!type || !['claude-prompt', 'script', 'hybrid'].includes(type)) {
            throw new Error('Task type must be: claude-prompt, script, or hybrid');
        }
        if (!schedule) throw new Error('Schedule is required');
        this.validateCronSchedule(schedule);

        if (type === 'claude-prompt' && !prompt) {
            throw new Error('Prompt is required for claude-prompt tasks');
        }
        if ((type === 'script' || type === 'hybrid') && !command) {
            throw new Error('Command is required for script/hybrid tasks');
        }

        // Check for duplicate names
        const existing = this.config.tasks.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            throw new Error(`Task with name "${name}" already exists (ID: ${existing.id})`);
        }

        const taskId = this.generateTaskId(name);
        const timestamp = new Date().toISOString();

        const task = {
            id: taskId,
            name,
            type,
            schedule,
            ...(type === 'claude-prompt' ? { prompt } : { command }),
            ...(type === 'hybrid' ? { mayInvokeClaude: true } : {}),
            workingDir,
            timeout: parseInt(timeout, 10),
            enabled,
            ...(Object.keys(env).length > 0 ? { env } : {}),
            notifications: {
                slack: { notifyOn: Array.isArray(notifyOn) ? notifyOn : [notifyOn] }
            },
            metadata: {
                created: timestamp,
                lastModified: timestamp,
                createdBy: process.env.USER_EMAIL || process.env.USER || 'unknown'
            }
        };

        this.config.tasks.push(task);
        this.saveConfig();
        this.installCrontab();

        return task;
    }

    /**
     * Add a task to config without writing crontab (for batch operations)
     */
    addTaskToConfig(options) {
        const {
            name,
            type,
            schedule,
            command,
            prompt,
            workingDir = this.config.defaults.workingDir,
            timeout = this.config.defaults.timeout,
            enabled = true,
            notifyOn = ['failure'],
            env = {}
        } = options;

        if (!name) throw new Error('Task name is required');
        if (!type || !['claude-prompt', 'script', 'hybrid'].includes(type)) {
            throw new Error('Task type must be: claude-prompt, script, or hybrid');
        }
        if (!schedule) throw new Error('Schedule is required');
        this.validateCronSchedule(schedule);

        if (type === 'claude-prompt' && !prompt) {
            throw new Error('Prompt is required for claude-prompt tasks');
        }
        if ((type === 'script' || type === 'hybrid') && !command) {
            throw new Error('Command is required for script/hybrid tasks');
        }

        // Skip if task with same name already exists (idempotent)
        const existing = this.config.tasks.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            return { task: existing, skipped: true };
        }

        const taskId = this.generateTaskId(name);
        const timestamp = new Date().toISOString();

        const task = {
            id: taskId,
            name,
            type,
            schedule,
            ...(type === 'claude-prompt' ? { prompt } : { command }),
            ...(type === 'hybrid' ? { mayInvokeClaude: true } : {}),
            workingDir,
            timeout: parseInt(timeout, 10),
            enabled,
            ...(Object.keys(env).length > 0 ? { env } : {}),
            notifications: {
                slack: { notifyOn: Array.isArray(notifyOn) ? notifyOn : [notifyOn] }
            },
            metadata: {
                created: timestamp,
                lastModified: timestamp,
                createdBy: process.env.USER_EMAIL || process.env.USER || 'unknown'
            }
        };

        this.config.tasks.push(task);
        return { task, skipped: false };
    }

    /**
     * Load a preset file containing multiple task definitions.
     * Adds tasks idempotently (skips by name match), writes config and crontab once.
     */
    loadPreset(presetPath) {
        const resolvedPath = path.resolve(presetPath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Preset file not found: ${resolvedPath}`);
        }

        const preset = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        if (!preset.tasks || !Array.isArray(preset.tasks)) {
            throw new Error('Preset must contain a "tasks" array');
        }

        const results = { added: [], skipped: [], errors: [] };

        for (const taskDef of preset.tasks) {
            try {
                const { task, skipped } = this.addTaskToConfig(taskDef);
                if (skipped) {
                    results.skipped.push(task.name);
                } else {
                    results.added.push(task.name);
                }
            } catch (err) {
                results.errors.push({ name: taskDef.name || '(unnamed)', error: err.message });
            }
        }

        // Single write for config and crontab
        if (results.added.length > 0) {
            this.saveConfig();
            this.installCrontab();
        }

        return results;
    }

    /**
     * Remove a task by ID
     */
    removeTask(taskId) {
        const index = this.config.tasks.findIndex(t => t.id === taskId);
        if (index === -1) {
            throw new Error(`Task not found: ${taskId}`);
        }

        const removed = this.config.tasks.splice(index, 1)[0];
        this.saveConfig();
        this.installCrontab();

        return removed;
    }

    /**
     * List tasks with optional filter
     */
    listTasks(filter = 'all') {
        let tasks = this.config.tasks;

        if (filter === 'enabled') {
            tasks = tasks.filter(t => t.enabled);
        } else if (filter === 'disabled') {
            tasks = tasks.filter(t => !t.enabled);
        }

        return tasks;
    }

    /**
     * Get a single task by ID
     */
    getTask(taskId) {
        return this.config.tasks.find(t => t.id === taskId);
    }

    /**
     * Enable a task
     */
    enableTask(taskId) {
        const task = this.getTask(taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);

        task.enabled = true;
        task.metadata.lastModified = new Date().toISOString();
        this.saveConfig();
        this.installCrontab();

        return task;
    }

    /**
     * Disable a task
     */
    disableTask(taskId) {
        const task = this.getTask(taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);

        task.enabled = false;
        task.metadata.lastModified = new Date().toISOString();
        this.saveConfig();
        this.installCrontab();

        return task;
    }

    // =============================================================================
    // Crontab Management
    // =============================================================================

    /**
     * Generate cron entry for a task
     */
    generateCronEntry(task) {
        if (!task.enabled) return null;

        return `${task.schedule} "${TASK_RUNNER}" "${task.id}" >> "${LOG_DIR}/cron.log" 2>&1`;
    }

    /**
     * Install/update crontab entries
     */
    installCrontab() {
        try {
            // Get existing crontab
            let existingCron = '';
            try {
                existingCron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
            } catch (e) {
                // No existing crontab
            }

            // Remove our existing entries
            const lines = existingCron.split('\n')
                .filter(line => !line.includes(CRON_COMMENT) && !line.includes('task-runner.sh'));

            // Generate new entries
            const newEntries = [
                '',
                CRON_COMMENT,
                `# Generated: ${new Date().toISOString()}`,
                `# Config: ${CONFIG_FILE}`,
                ''
            ];

            const enabledTasks = this.config.tasks.filter(t => t.enabled);

            for (const task of enabledTasks) {
                const entry = this.generateCronEntry(task);
                if (entry) {
                    newEntries.push(`# Task: ${task.name} (${task.id})`);
                    newEntries.push(entry);
                    newEntries.push('');
                }
            }

            // Combine and install
            const cleanedLines = lines.filter(l => l.trim() !== '');
            const newCrontab = [...cleanedLines, ...newEntries].join('\n').trim() + '\n';

            // Write to temp file and install
            const tmpFile = `${os.tmpdir()}/claude-scheduler-crontab-${Date.now()}`;
            fs.writeFileSync(tmpFile, newCrontab);
            execSync(`crontab "${tmpFile}"`, { timeout: 5000 });
            fs.unlinkSync(tmpFile);

            return { installed: enabledTasks.length };
        } catch (error) {
            throw new Error(`Failed to install crontab: ${error.message}`);
        }
    }

    /**
     * Remove all scheduler entries from crontab
     */
    uninstallCrontab() {
        try {
            let existingCron = '';
            try {
                existingCron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
            } catch (e) {
                return { removed: 0 };
            }

            const enabledCount = this.config.tasks.filter(t => t.enabled).length;

            const lines = existingCron.split('\n')
                .filter(line => !line.includes(CRON_COMMENT) && !line.includes('task-runner.sh'));

            const tmpFile = `${os.tmpdir()}/claude-scheduler-crontab-${Date.now()}`;
            fs.writeFileSync(tmpFile, lines.join('\n'));
            execSync(`crontab "${tmpFile}"`, { timeout: 5000 });
            fs.unlinkSync(tmpFile);

            return { removed: enabledCount };
        } catch (error) {
            throw new Error(`Failed to uninstall crontab: ${error.message}`);
        }
    }

    // =============================================================================
    // Manual Execution
    // =============================================================================

    /**
     * Run a task immediately
     */
    runTask(taskId) {
        const task = this.getTask(taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);

        console.log(`\nExecuting task: ${task.name} (${taskId})`);
        console.log(`Type: ${task.type}`);
        console.log(`Timeout: ${task.timeout}s\n`);

        // Run the task runner script
        const result = spawnSync('bash', [TASK_RUNNER, taskId], {
            stdio: 'inherit',
            timeout: (task.timeout || 600) * 1000
        });

        return {
            success: result.status === 0,
            exitCode: result.status,
            signal: result.signal
        };
    }

    // =============================================================================
    // Logs
    // =============================================================================

    /**
     * Get logs for a task
     */
    getTaskLogs(taskId, options = {}) {
        const { limit = 10, tail = null } = options;

        if (!fs.existsSync(LOG_DIR)) {
            return { logs: [], message: 'No logs found' };
        }

        // Find log files for this task
        const files = fs.readdirSync(LOG_DIR)
            .filter(f => f.startsWith(taskId) && f.endsWith('.log'))
            .sort()
            .reverse()
            .slice(0, limit);

        if (files.length === 0) {
            return { logs: [], message: `No logs found for task: ${taskId}` };
        }

        const logs = files.map(file => {
            const filePath = path.join(LOG_DIR, file);
            const stats = fs.statSync(filePath);
            let content = fs.readFileSync(filePath, 'utf8');

            // If tail is specified, only show last N lines
            if (tail) {
                const lines = content.split('\n');
                content = lines.slice(-tail).join('\n');
            }

            return {
                file,
                path: filePath,
                timestamp: stats.mtime.toISOString(),
                size: stats.size,
                content: tail ? content : (content.length > 2000 ? content.slice(0, 2000) + '\n... (truncated)' : content)
            };
        });

        return { logs, total: files.length };
    }

    /**
     * Get execution history
     */
    getExecutionHistory(taskId = null, limit = 20) {
        const historyFile = path.join(LOG_DIR, 'execution-history.jsonl');

        if (!fs.existsSync(historyFile)) {
            return [];
        }

        const lines = fs.readFileSync(historyFile, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(entry => entry && (!taskId || entry.task_id === taskId))
            .reverse()
            .slice(0, limit);

        return lines;
    }
}

// =============================================================================
// CLI Interface
// =============================================================================

function printUsage() {
    console.log(`
Claude Code Task Scheduler Manager

USAGE:
  node scheduler-manager.js <command> [options]

COMMANDS:
  add           Add a new scheduled task
  remove        Remove a task by ID
  list          List all tasks
  enable        Enable a task
  disable       Disable a task
  run           Run a task immediately
  logs          View task execution logs
  history       View execution history
  install       Install crontab entries
  uninstall     Remove crontab entries

ADD OPTIONS:
  --name=NAME         Task name (required)
  --type=TYPE         Task type: claude-prompt, script, hybrid (required)
  --schedule=CRON     Cron schedule expression (required)
  --prompt=PROMPT     Claude prompt (for claude-prompt type)
  --command=CMD       Command to run (for script/hybrid type)
  --working-dir=DIR   Working directory
  --timeout=SECONDS   Execution timeout (default: 600)
  --notify-on=STATUS  Notification triggers: failure,completion (comma-separated)

EXAMPLES:
  # Add a Claude prompt task
  node scheduler-manager.js add \\
    --name="Daily CPQ Check" \\
    --type=claude-prompt \\
    --schedule="0 6 * * *" \\
    --prompt="Run CPQ health check on gamma-corp org"

  # Add a script task
  node scheduler-manager.js add \\
    --name="Weekly Report" \\
    --type=script \\
    --schedule="0 8 * * 0" \\
    --command="node scripts/generate-report.js"

  # List all tasks
  node scheduler-manager.js list

  # Run task manually
  node scheduler-manager.js run daily-cpq-check-a1b2c3d4

  # View logs
  node scheduler-manager.js logs daily-cpq-check-a1b2c3d4 --limit=5

CRON SCHEDULE REFERENCE:
  ┌───────────── minute (0 - 59)
  │ ┌───────────── hour (0 - 23)
  │ │ ┌───────────── day of month (1 - 31)
  │ │ │ ┌───────────── month (1 - 12)
  │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
  │ │ │ │ │
  * * * * *

  Examples:
    "0 6 * * *"     - Daily at 6:00 AM
    "0 8 * * 0"     - Weekly Sunday at 8:00 AM
    "0 * * * *"     - Every hour
    "*/15 * * * *"  - Every 15 minutes
    "0 2 * * 1"     - Weekly Monday at 2:00 AM
`);
}

function parseArgs(args) {
    const options = { _positional: [] };

    for (const arg of args) {
        if (arg.startsWith('--')) {
            const eqIndex = arg.indexOf('=');
            if (eqIndex !== -1) {
                const key = arg.slice(2, eqIndex).replace(/-/g, '_');
                const value = arg.slice(eqIndex + 1);
                options[key] = value;
            } else {
                const key = arg.slice(2).replace(/-/g, '_');
                options[key] = true;
            }
        } else {
            options._positional.push(arg);
        }
    }

    return options;
}

async function main() {
    const [, , command, ...args] = process.argv;
    const options = parseArgs(args);
    const manager = new SchedulerManager();

    try {
        switch (command) {
            case 'add': {
                const task = manager.addTask({
                    name: options.name,
                    type: options.type,
                    schedule: options.schedule,
                    prompt: options.prompt,
                    command: options.command,
                    workingDir: options.working_dir,
                    timeout: options.timeout ? parseInt(options.timeout) : undefined,
                    notifyOn: options.notify_on ? options.notify_on.split(',') : ['failure']
                });
                console.log('\n✓ Task added successfully:\n');
                console.log(`  ID:       ${task.id}`);
                console.log(`  Name:     ${task.name}`);
                console.log(`  Type:     ${task.type}`);
                console.log(`  Schedule: ${task.schedule} (${manager.describeCronSchedule(task.schedule)})`);
                console.log(`  Enabled:  ${task.enabled}`);
                console.log(`  Timeout:  ${task.timeout}s`);
                console.log('\nCrontab updated.');
                break;
            }

            case 'remove': {
                const taskId = options._positional[0];
                if (!taskId) throw new Error('Task ID required');
                const removed = manager.removeTask(taskId);
                console.log(`\n✓ Removed task: ${removed.name} (${removed.id})`);
                console.log('Crontab updated.');
                break;
            }

            case 'list': {
                const filter = options.enabled ? 'enabled' :
                    options.disabled ? 'disabled' : 'all';
                const tasks = manager.listTasks(filter);

                console.log(`\nScheduled Tasks (${tasks.length}):\n`);

                if (tasks.length === 0) {
                    console.log('  No tasks configured. Use "add" to create one.');
                } else {
                    for (const t of tasks) {
                        const status = t.enabled ? '✓' : '✗';
                        const statusColor = t.enabled ? '\x1b[32m' : '\x1b[31m';
                        const reset = '\x1b[0m';

                        console.log(`${statusColor}[${status}]${reset} ${t.id}`);
                        console.log(`    Name:     ${t.name}`);
                        console.log(`    Type:     ${t.type}`);
                        console.log(`    Schedule: ${t.schedule} (${manager.describeCronSchedule(t.schedule)})`);
                        console.log(`    Timeout:  ${t.timeout}s`);
                        console.log('');
                    }
                }
                break;
            }

            case 'enable': {
                const taskId = options._positional[0];
                if (!taskId) throw new Error('Task ID required');
                const task = manager.enableTask(taskId);
                console.log(`\n✓ Enabled task: ${task.name}`);
                console.log('Crontab updated.');
                break;
            }

            case 'disable': {
                const taskId = options._positional[0];
                if (!taskId) throw new Error('Task ID required');
                const task = manager.disableTask(taskId);
                console.log(`\n✓ Disabled task: ${task.name}`);
                console.log('Crontab updated.');
                break;
            }

            case 'run': {
                const taskId = options._positional[0];
                if (!taskId) throw new Error('Task ID required');
                const result = manager.runTask(taskId);
                process.exit(result.success ? 0 : 1);
                break;
            }

            case 'logs': {
                const taskId = options._positional[0];
                if (!taskId) throw new Error('Task ID required');

                const tail = options.tail ? parseInt(options.tail) : null;
                const limit = options.limit ? parseInt(options.limit) : 10;

                const { logs, total, message } = manager.getTaskLogs(taskId, { limit, tail });

                if (message && logs.length === 0) {
                    console.log(`\n${message}`);
                    break;
                }

                console.log(`\nLogs for ${taskId} (showing ${logs.length} of ${total}):\n`);

                for (const log of logs) {
                    console.log(`\x1b[36m--- ${log.file} (${log.timestamp}) ---\x1b[0m`);
                    console.log(log.content);
                    console.log('');
                }
                break;
            }

            case 'history': {
                const taskId = options._positional[0];
                const limit = options.limit ? parseInt(options.limit) : 20;
                const history = manager.getExecutionHistory(taskId, limit);

                console.log(`\nExecution History${taskId ? ` for ${taskId}` : ''} (${history.length} entries):\n`);

                if (history.length === 0) {
                    console.log('  No execution history found.');
                } else {
                    for (const entry of history) {
                        const statusColor = entry.status === 'success' ? '\x1b[32m' :
                            entry.status === 'failure' ? '\x1b[31m' : '\x1b[33m';
                        const reset = '\x1b[0m';

                        if (entry.event === 'end') {
                            console.log(`${entry.timestamp} | ${entry.task_id.padEnd(30)} | ${statusColor}${entry.status.padEnd(8)}${reset} | ${entry.duration_seconds}s | exit: ${entry.exit_code}`);
                        }
                    }
                }
                break;
            }

            case 'load-preset': {
                const presetPath = options._positional[0];
                if (!presetPath) throw new Error('Preset file path required');
                const result = manager.loadPreset(presetPath);

                console.log(`\nPreset loaded:`);
                if (result.added.length > 0) {
                    console.log(`  Added (${result.added.length}):`);
                    result.added.forEach(n => console.log(`    + ${n}`));
                }
                if (result.skipped.length > 0) {
                    console.log(`  Skipped (${result.skipped.length}, already exist):`);
                    result.skipped.forEach(n => console.log(`    ~ ${n}`));
                }
                if (result.errors.length > 0) {
                    console.log(`  Errors (${result.errors.length}):`);
                    result.errors.forEach(e => console.log(`    ! ${e.name}: ${e.error}`));
                }
                if (result.added.length > 0) {
                    console.log(`\nCrontab updated with ${result.added.length} new entries.`);
                } else {
                    console.log(`\nNo new tasks added.`);
                }
                break;
            }

            case 'install': {
                const result = manager.installCrontab();
                console.log(`\n✓ Installed ${result.installed} cron entries`);
                break;
            }

            case 'uninstall': {
                const result = manager.uninstallCrontab();
                console.log(`\n✓ Removed ${result.removed} cron entries`);
                break;
            }

            case 'help':
            case '--help':
            case '-h':
            case undefined:
                printUsage();
                break;

            default:
                console.error(`Unknown command: ${command}`);
                console.log('Run with --help for usage information');
                process.exit(1);
        }
    } catch (error) {
        console.error(`\n✗ Error: ${error.message}`);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = { SchedulerManager };

// Run CLI if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}
