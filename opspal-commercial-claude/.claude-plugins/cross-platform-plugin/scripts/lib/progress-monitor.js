#!/usr/bin/env node

/**
 * Progress Monitor - ACE Framework Stall Detection
 *
 * Tracks progress signals to detect when agents are stuck making no meaningful progress.
 * Uses git commits, file changes, and todo progress as progress indicators.
 *
 * Based on ACE Framework's git-based progress tracking pattern.
 *
 * Features:
 * - Git commit tracking (primary progress signal)
 * - File modification tracking
 * - Todo completion tracking
 * - Stall detection with configurable thresholds
 * - Automatic intervention suggestions
 *
 * @version 1.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ProgressMonitor {
    constructor(options = {}) {
        this.projectDir = options.projectDir || process.cwd();
        this.verbose = options.verbose || false;

        // Stall detection configuration
        this.stallThreshold = options.stallThreshold || 3; // Iterations without progress
        this.checkInterval = options.checkInterval || 60000; // 1 minute between checks

        // Progress tracking state
        this.state = {
            iterations: 0,
            stallCount: 0,
            lastProgressAt: new Date().toISOString(),
            snapshots: [],
            interventions: []
        };

        // State persistence
        this.stateFile = options.stateFile ||
            path.join(this.projectDir, '.claude', 'progress-monitor.json');

        // Load existing state
        this.loadState();
    }

    /**
     * Load existing state from disk
     */
    loadState() {
        if (fs.existsSync(this.stateFile)) {
            try {
                this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8'));
                this.log(`Loaded state: ${this.state.iterations} iterations, ${this.state.stallCount} stalls`);
            } catch (error) {
                this.log(`Warning: Could not load state: ${error.message}`);
            }
        }
    }

    /**
     * Save state to disk
     */
    saveState() {
        try {
            const dir = path.dirname(this.stateFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8');
        } catch (error) {
            this.log(`Warning: Could not save state: ${error.message}`);
        }
    }

    /**
     * Capture current state snapshot
     */
    captureSnapshot() {
        const snapshot = {
            timestamp: new Date().toISOString(),
            iteration: this.state.iterations,
            git: this.captureGitState(),
            files: this.captureFileState(),
            todos: this.captureTodoState()
        };

        this.log(`Captured snapshot at iteration ${this.state.iterations}`);

        return snapshot;
    }

    /**
     * Capture git state
     */
    captureGitState() {
        try {
            // Check if we're in a git repo
            execSync('git rev-parse --git-dir', {
                cwd: this.projectDir,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Get current commit hash
            const headCommit = execSync('git rev-parse HEAD', {
                cwd: this.projectDir,
                encoding: 'utf-8'
            }).trim();

            // Get uncommitted changes count
            const status = execSync('git status --porcelain', {
                cwd: this.projectDir,
                encoding: 'utf-8'
            });
            const changedFiles = status.split('\n').filter(l => l.trim()).length;

            // Get recent commits count (last hour)
            const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
            const recentCommits = execSync(
                `git log --oneline --since="${oneHourAgo}" 2>/dev/null | wc -l`,
                { cwd: this.projectDir, encoding: 'utf-8' }
            ).trim();

            return {
                isGitRepo: true,
                headCommit,
                changedFiles,
                recentCommits: parseInt(recentCommits) || 0
            };
        } catch (error) {
            return {
                isGitRepo: false,
                error: error.message
            };
        }
    }

    /**
     * Capture file modification state
     */
    captureFileState() {
        try {
            // Get recently modified files (last 5 minutes)
            const fiveMinutesAgo = Date.now() - 300000;
            const claudeDir = path.join(this.projectDir, '.claude');
            const pluginsDir = path.join(this.projectDir, '.claude-plugins');

            const recentFiles = [];

            // Check common working directories
            const checkDirs = [claudeDir, pluginsDir, this.projectDir];

            for (const dir of checkDirs) {
                if (fs.existsSync(dir)) {
                    try {
                        const files = this.getRecentFiles(dir, fiveMinutesAgo, 3);
                        recentFiles.push(...files);
                    } catch (e) {
                        // Skip inaccessible directories
                    }
                }
            }

            return {
                recentlyModified: recentFiles.length,
                files: recentFiles.slice(0, 10) // Limit to 10 files
            };
        } catch (error) {
            return {
                recentlyModified: 0,
                error: error.message
            };
        }
    }

    /**
     * Get recently modified files in a directory
     */
    getRecentFiles(dir, since, depth = 2) {
        const files = [];

        const scan = (currentDir, currentDepth) => {
            if (currentDepth > depth) return;

            try {
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });

                for (const entry of entries) {
                    // Skip node_modules, .git, etc.
                    if (entry.name.startsWith('.') && entry.name !== '.claude') continue;
                    if (entry.name === 'node_modules') continue;

                    const fullPath = path.join(currentDir, entry.name);

                    if (entry.isDirectory()) {
                        scan(fullPath, currentDepth + 1);
                    } else if (entry.isFile()) {
                        try {
                            const stats = fs.statSync(fullPath);
                            if (stats.mtimeMs > since) {
                                files.push({
                                    path: path.relative(this.projectDir, fullPath),
                                    modifiedAt: new Date(stats.mtimeMs).toISOString()
                                });
                            }
                        } catch (e) {
                            // Skip inaccessible files
                        }
                    }
                }
            } catch (e) {
                // Skip inaccessible directories
            }
        };

        scan(dir, 0);
        return files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    }

    /**
     * Capture todo state from scratchpad
     */
    captureTodoState() {
        try {
            // Check for scratchpad progress file
            const scratchpadBase = path.join(process.env.HOME || '/tmp', '.claude', 'scratchpad');

            if (!fs.existsSync(scratchpadBase)) {
                return { available: false };
            }

            // Find most recent session
            const sessions = fs.readdirSync(scratchpadBase)
                .filter(f => f.startsWith('session_'))
                .map(f => {
                    const progressFile = path.join(scratchpadBase, f, 'progress.json');
                    if (fs.existsSync(progressFile)) {
                        try {
                            const progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
                            return { session: f, progress };
                        } catch (e) {
                            return null;
                        }
                    }
                    return null;
                })
                .filter(s => s !== null)
                .sort((a, b) =>
                    new Date(b.progress.lastUpdated || 0) - new Date(a.progress.lastUpdated || 0)
                );

            if (sessions.length > 0) {
                const latest = sessions[0];
                return {
                    available: true,
                    session: latest.session,
                    completed: latest.progress.completed?.length || 0,
                    inProgress: latest.progress.inProgress?.length || 0,
                    pending: latest.progress.pending?.length || 0,
                    lastUpdated: latest.progress.lastUpdated
                };
            }

            return { available: false };
        } catch (error) {
            return {
                available: false,
                error: error.message
            };
        }
    }

    /**
     * Check if meaningful progress was made between snapshots
     */
    detectProgress(before, after) {
        const progress = {
            hasProgress: false,
            signals: [],
            details: {}
        };

        // Check git commits
        if (before.git.isGitRepo && after.git.isGitRepo) {
            if (before.git.headCommit !== after.git.headCommit) {
                progress.hasProgress = true;
                progress.signals.push('new_commit');
                progress.details.gitCommit = {
                    before: before.git.headCommit?.substring(0, 7),
                    after: after.git.headCommit?.substring(0, 7)
                };
            }

            // More uncommitted changes is also progress
            if (after.git.changedFiles > before.git.changedFiles) {
                progress.hasProgress = true;
                progress.signals.push('file_changes');
                progress.details.changedFiles = {
                    before: before.git.changedFiles,
                    after: after.git.changedFiles
                };
            }
        }

        // Check file modifications
        if (after.files.recentlyModified > 0) {
            progress.hasProgress = true;
            progress.signals.push('files_modified');
            progress.details.filesModified = after.files.recentlyModified;
        }

        // Check todo completion
        if (before.todos.available && after.todos.available) {
            if (after.todos.completed > before.todos.completed) {
                progress.hasProgress = true;
                progress.signals.push('todos_completed');
                progress.details.todosCompleted = {
                    before: before.todos.completed,
                    after: after.todos.completed
                };
            }
        }

        return progress;
    }

    /**
     * Run a progress check iteration
     */
    async checkProgress() {
        this.state.iterations++;

        // Capture current snapshot
        const currentSnapshot = this.captureSnapshot();

        // Get previous snapshot
        const previousSnapshot = this.state.snapshots.length > 0 ?
            this.state.snapshots[this.state.snapshots.length - 1] : null;

        // Store current snapshot (keep last 10)
        this.state.snapshots.push(currentSnapshot);
        if (this.state.snapshots.length > 10) {
            this.state.snapshots.shift();
        }

        // Check for progress
        let progressResult = { hasProgress: true, signals: ['first_check'] };

        if (previousSnapshot) {
            progressResult = this.detectProgress(previousSnapshot, currentSnapshot);
        }

        // Update stall counter
        if (progressResult.hasProgress) {
            this.state.stallCount = 0;
            this.state.lastProgressAt = new Date().toISOString();
            this.log(`Progress detected: ${progressResult.signals.join(', ')}`);
        } else {
            this.state.stallCount++;
            this.log(`No progress detected (stall count: ${this.state.stallCount}/${this.stallThreshold})`);
        }

        // Check if intervention needed
        const intervention = this.checkIntervention();

        // Save state
        this.saveState();

        return {
            iteration: this.state.iterations,
            stallCount: this.state.stallCount,
            progress: progressResult,
            intervention,
            snapshot: currentSnapshot
        };
    }

    /**
     * Check if user intervention is needed
     */
    checkIntervention() {
        if (this.state.stallCount >= this.stallThreshold) {
            const intervention = {
                needed: true,
                reason: `No meaningful progress detected after ${this.state.stallCount} iterations`,
                suggestions: [
                    'Review the current approach - it may need adjustment',
                    'Check for blockers or missing dependencies',
                    'Consider breaking down the task into smaller steps',
                    'Ask for clarification if requirements are unclear'
                ],
                lastProgressAt: this.state.lastProgressAt
            };

            // Record intervention
            this.state.interventions.push({
                ...intervention,
                timestamp: new Date().toISOString(),
                iteration: this.state.iterations
            });

            return intervention;
        }

        return {
            needed: false,
            stallCount: this.state.stallCount,
            threshold: this.stallThreshold
        };
    }

    /**
     * Reset stall counter (call after user provides input)
     */
    resetStallCounter() {
        this.state.stallCount = 0;
        this.state.lastProgressAt = new Date().toISOString();
        this.saveState();
        this.log('Stall counter reset');
    }

    /**
     * Get current monitoring status
     */
    getStatus() {
        return {
            iterations: this.state.iterations,
            stallCount: this.state.stallCount,
            stallThreshold: this.stallThreshold,
            lastProgressAt: this.state.lastProgressAt,
            isStalled: this.state.stallCount >= this.stallThreshold,
            recentSnapshots: this.state.snapshots.length,
            interventions: this.state.interventions.length
        };
    }

    /**
     * Format status for display
     */
    formatStatus() {
        const status = this.getStatus();
        const lines = [
            '='.repeat(50),
            'Progress Monitor Status',
            '='.repeat(50),
            `Iterations:      ${status.iterations}`,
            `Stall Count:     ${status.stallCount}/${status.stallThreshold}`,
            `Is Stalled:      ${status.isStalled ? '⚠️ YES' : '✅ No'}`,
            `Last Progress:   ${status.lastProgressAt}`,
            `Interventions:   ${status.interventions}`,
            '='.repeat(50)
        ];

        if (status.isStalled) {
            lines.push('');
            lines.push('⚠️  STALL DETECTED - Consider:');
            lines.push('  • Reviewing current approach');
            lines.push('  • Checking for blockers');
            lines.push('  • Breaking task into smaller steps');
            lines.push('  • Asking for clarification');
        }

        return lines.join('\n');
    }

    /**
     * Log message if verbose
     */
    log(message) {
        if (this.verbose) {
            console.log(`[PROGRESS] ${message}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    const printHelp = () => {
        console.log('Usage: progress-monitor.js <command> [options]');
        console.log('');
        console.log('ACE Framework Progress Monitor v1.0.0');
        console.log('');
        console.log('Commands:');
        console.log('  check                Run a progress check');
        console.log('  status               Show current monitoring status');
        console.log('  snapshot             Capture and display current snapshot');
        console.log('  reset                Reset stall counter');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h           Show this help');
        console.log('  --verbose, -v        Verbose output');
        console.log('  --json               JSON output');
        console.log('  --threshold <n>      Set stall threshold (default: 3)');
        console.log('  --project-dir <path> Project directory');
        console.log('');
        console.log('Examples:');
        console.log('  progress-monitor.js check');
        console.log('  progress-monitor.js status --json');
        console.log('  progress-monitor.js check --threshold 5');
    };

    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        printHelp();
        process.exit(0);
    }

    const verbose = args.includes('--verbose') || args.includes('-v');
    const json = args.includes('--json');

    const thresholdIndex = args.indexOf('--threshold');
    const threshold = thresholdIndex >= 0 ? parseInt(args[thresholdIndex + 1]) : 3;

    const projectDirIndex = args.indexOf('--project-dir');
    const projectDir = projectDirIndex >= 0 ? args[projectDirIndex + 1] : process.cwd();

    const command = args.find(a => !a.startsWith('-') && a !== args[thresholdIndex + 1] && a !== args[projectDirIndex + 1]);

    (async () => {
        try {
            const monitor = new ProgressMonitor({
                verbose,
                projectDir,
                stallThreshold: threshold
            });

            switch (command) {
                case 'check':
                    const result = await monitor.checkProgress();
                    if (json) {
                        console.log(JSON.stringify(result, null, 2));
                    } else {
                        console.log(`Iteration: ${result.iteration}`);
                        console.log(`Progress: ${result.progress.hasProgress ? '✅ Yes' : '❌ No'}`);
                        if (result.progress.signals.length > 0) {
                            console.log(`Signals: ${result.progress.signals.join(', ')}`);
                        }
                        console.log(`Stall Count: ${result.stallCount}/${threshold}`);
                        if (result.intervention.needed) {
                            console.log('');
                            console.log('⚠️  INTERVENTION NEEDED:');
                            console.log(`   ${result.intervention.reason}`);
                            console.log('');
                            console.log('Suggestions:');
                            result.intervention.suggestions.forEach(s => {
                                console.log(`   • ${s}`);
                            });
                        }
                    }
                    break;

                case 'status':
                    if (json) {
                        console.log(JSON.stringify(monitor.getStatus(), null, 2));
                    } else {
                        console.log(monitor.formatStatus());
                    }
                    break;

                case 'snapshot':
                    const snapshot = monitor.captureSnapshot();
                    if (json) {
                        console.log(JSON.stringify(snapshot, null, 2));
                    } else {
                        console.log('='.repeat(50));
                        console.log('Current Snapshot');
                        console.log('='.repeat(50));
                        console.log(`Timestamp: ${snapshot.timestamp}`);
                        console.log('');
                        console.log('Git:');
                        if (snapshot.git.isGitRepo) {
                            console.log(`  HEAD: ${snapshot.git.headCommit?.substring(0, 7)}`);
                            console.log(`  Changed files: ${snapshot.git.changedFiles}`);
                            console.log(`  Recent commits: ${snapshot.git.recentCommits}`);
                        } else {
                            console.log('  Not a git repository');
                        }
                        console.log('');
                        console.log('Files:');
                        console.log(`  Recently modified: ${snapshot.files.recentlyModified}`);
                        if (snapshot.files.files?.length > 0) {
                            snapshot.files.files.slice(0, 5).forEach(f => {
                                console.log(`    • ${f.path}`);
                            });
                        }
                        console.log('');
                        console.log('Todos:');
                        if (snapshot.todos.available) {
                            console.log(`  Completed: ${snapshot.todos.completed}`);
                            console.log(`  In Progress: ${snapshot.todos.inProgress}`);
                            console.log(`  Pending: ${snapshot.todos.pending}`);
                        } else {
                            console.log('  No todo data available');
                        }
                        console.log('='.repeat(50));
                    }
                    break;

                case 'reset':
                    monitor.resetStallCounter();
                    if (json) {
                        console.log(JSON.stringify({ reset: true, status: monitor.getStatus() }));
                    } else {
                        console.log('Stall counter reset');
                        console.log(monitor.formatStatus());
                    }
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    printHelp();
                    process.exit(1);
            }

        } catch (error) {
            console.error(`Error: ${error.message}`);
            if (verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        }
    })();
}

module.exports = { ProgressMonitor };
