#!/usr/bin/env node

/**
 * Scratchpad Manager - ACE Framework Session Persistence
 *
 * Manages persistent scratchpad directories for multi-session task continuity.
 * Based on ACE Framework's .agent/ directory pattern.
 *
 * Features:
 * - Per-session scratchpad creation and management
 * - Plan and progress persistence across iterations
 * - Blocker tracking and context accumulation
 * - Skills usage tracking for session
 * - Automatic cleanup of old scratchpads
 *
 * @version 1.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ScratchpadManager {
    constructor(options = {}) {
        // Base directory for scratchpads
        this.baseDir = options.baseDir ||
            process.env.CLAUDE_SCRATCHPAD_DIR ||
            path.join(process.env.HOME || '/tmp', '.claude', 'scratchpad');

        // Session configuration
        this.sessionId = options.sessionId || this.generateSessionId();
        this.projectDir = options.projectDir || process.cwd();
        this.verbose = options.verbose || false;

        // Retention settings
        this.maxAgeDays = options.maxAgeDays || 7; // Keep scratchpads for 7 days
        this.maxScratchpads = options.maxScratchpads || 50; // Max scratchpads to keep

        // Initialize
        this.scratchpadDir = null;
        this.state = null;
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        return `session_${timestamp}_${random}`;
    }

    /**
     * Initialize scratchpad for session
     */
    async initialize() {
        // Create base directory if needed
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
            this.log(`Created scratchpad base directory: ${this.baseDir}`);
        }

        // Create session-specific directory
        this.scratchpadDir = path.join(this.baseDir, this.sessionId);

        if (!fs.existsSync(this.scratchpadDir)) {
            fs.mkdirSync(this.scratchpadDir, { recursive: true });
            this.log(`Created session scratchpad: ${this.scratchpadDir}`);
        }

        // Initialize or load state
        await this.loadState();

        return this;
    }

    /**
     * Load existing state or create new
     */
    async loadState() {
        const statePath = path.join(this.scratchpadDir, 'state.json');

        if (fs.existsSync(statePath)) {
            try {
                this.state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                this.log(`Loaded existing state: ${this.state.iterations} iterations`);
            } catch (error) {
                this.log(`Warning: Could not load state: ${error.message}`);
                this.state = this.createInitialState();
            }
        } else {
            this.state = this.createInitialState();
            await this.saveState();
        }

        return this.state;
    }

    /**
     * Create initial state structure
     */
    createInitialState() {
        return {
            version: '1.0.0',
            sessionId: this.sessionId,
            projectDir: this.projectDir,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            iterations: 0,
            plan: {
                title: null,
                steps: [],
                currentStep: 0,
                completedSteps: []
            },
            progress: {
                completed: [],
                inProgress: [],
                pending: []
            },
            context: {
                learnings: [],
                discoveries: [],
                decisions: []
            },
            blockers: [],
            skillsApplied: [],
            metadata: {
                lastActivity: new Date().toISOString(),
                totalDurationMs: 0,
                toolCalls: 0
            }
        };
    }

    /**
     * Save current state to disk
     */
    async saveState() {
        if (!this.scratchpadDir || !this.state) {
            throw new Error('Scratchpad not initialized');
        }

        this.state.updatedAt = new Date().toISOString();
        this.state.metadata.lastActivity = new Date().toISOString();

        const statePath = path.join(this.scratchpadDir, 'state.json');
        fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2), 'utf-8');

        this.log(`State saved: ${statePath}`);
        return this.state;
    }

    /**
     * Start a new iteration
     */
    async startIteration() {
        this.state.iterations++;
        this.state.metadata.lastActivity = new Date().toISOString();

        await this.saveState();

        return {
            iteration: this.state.iterations,
            sessionId: this.sessionId,
            previousContext: this.state.context
        };
    }

    /**
     * Set or update the task plan
     */
    async setPlan(plan) {
        this.state.plan = {
            title: plan.title || this.state.plan.title,
            steps: plan.steps || this.state.plan.steps,
            currentStep: plan.currentStep !== undefined ? plan.currentStep : this.state.plan.currentStep,
            completedSteps: plan.completedSteps || this.state.plan.completedSteps
        };

        // Also save as markdown file for easy viewing
        await this.savePlanMarkdown();
        await this.saveState();

        return this.state.plan;
    }

    /**
     * Save plan as markdown file
     */
    async savePlanMarkdown() {
        const plan = this.state.plan;
        const lines = [
            `# Task Plan`,
            '',
            `**Title:** ${plan.title || 'Untitled Task'}`,
            `**Session:** ${this.sessionId}`,
            `**Created:** ${this.state.createdAt}`,
            '',
            '## Steps',
            ''
        ];

        plan.steps.forEach((step, index) => {
            const status = plan.completedSteps.includes(index) ? '✅' :
                          (index === plan.currentStep ? '🔄' : '⬜');
            lines.push(`${status} ${index + 1}. ${step}`);
        });

        lines.push('');
        lines.push(`## Progress`);
        lines.push(`- Current Step: ${plan.currentStep + 1} of ${plan.steps.length}`);
        lines.push(`- Completed: ${plan.completedSteps.length}`);
        lines.push(`- Remaining: ${plan.steps.length - plan.completedSteps.length}`);

        const planPath = path.join(this.scratchpadDir, 'plan.md');
        fs.writeFileSync(planPath, lines.join('\n'), 'utf-8');

        return planPath;
    }

    /**
     * Mark a step as complete
     */
    async completeStep(stepIndex) {
        if (!this.state.plan.completedSteps.includes(stepIndex)) {
            this.state.plan.completedSteps.push(stepIndex);
            this.state.plan.completedSteps.sort((a, b) => a - b);
        }

        // Move to next step
        const nextIncomplete = this.state.plan.steps.findIndex(
            (_, idx) => !this.state.plan.completedSteps.includes(idx)
        );
        this.state.plan.currentStep = nextIncomplete >= 0 ? nextIncomplete : this.state.plan.steps.length;

        await this.savePlanMarkdown();
        await this.saveState();

        return {
            completedStep: stepIndex,
            currentStep: this.state.plan.currentStep,
            allComplete: this.state.plan.completedSteps.length === this.state.plan.steps.length
        };
    }

    /**
     * Update progress (todos)
     */
    async updateProgress(progress) {
        this.state.progress = {
            completed: progress.completed || this.state.progress.completed,
            inProgress: progress.inProgress || this.state.progress.inProgress,
            pending: progress.pending || this.state.progress.pending
        };

        // Save as progress.json for easy access
        const progressPath = path.join(this.scratchpadDir, 'progress.json');
        fs.writeFileSync(progressPath, JSON.stringify(this.state.progress, null, 2), 'utf-8');

        await this.saveState();

        return this.state.progress;
    }

    /**
     * Add context learning
     */
    async addLearning(learning) {
        this.state.context.learnings.push({
            content: learning,
            addedAt: new Date().toISOString(),
            iteration: this.state.iterations
        });

        await this.saveState();
        await this.saveContextMarkdown();

        return this.state.context.learnings;
    }

    /**
     * Add discovery
     */
    async addDiscovery(discovery) {
        this.state.context.discoveries.push({
            content: discovery,
            addedAt: new Date().toISOString(),
            iteration: this.state.iterations
        });

        await this.saveState();
        await this.saveContextMarkdown();

        return this.state.context.discoveries;
    }

    /**
     * Add decision
     */
    async addDecision(decision, rationale) {
        this.state.context.decisions.push({
            decision,
            rationale,
            addedAt: new Date().toISOString(),
            iteration: this.state.iterations
        });

        await this.saveState();
        await this.saveContextMarkdown();

        return this.state.context.decisions;
    }

    /**
     * Save context as markdown
     */
    async saveContextMarkdown() {
        const ctx = this.state.context;
        const lines = [
            `# Session Context`,
            '',
            `**Session:** ${this.sessionId}`,
            `**Iterations:** ${this.state.iterations}`,
            ''
        ];

        if (ctx.learnings.length > 0) {
            lines.push('## Learnings');
            lines.push('');
            ctx.learnings.forEach((l, i) => {
                lines.push(`${i + 1}. ${l.content}`);
                lines.push(`   _Iteration ${l.iteration} - ${l.addedAt}_`);
            });
            lines.push('');
        }

        if (ctx.discoveries.length > 0) {
            lines.push('## Discoveries');
            lines.push('');
            ctx.discoveries.forEach((d, i) => {
                lines.push(`${i + 1}. ${d.content}`);
                lines.push(`   _Iteration ${d.iteration} - ${d.addedAt}_`);
            });
            lines.push('');
        }

        if (ctx.decisions.length > 0) {
            lines.push('## Decisions');
            lines.push('');
            ctx.decisions.forEach((d, i) => {
                lines.push(`${i + 1}. **${d.decision}**`);
                lines.push(`   Rationale: ${d.rationale}`);
                lines.push(`   _Iteration ${d.iteration} - ${d.addedAt}_`);
            });
            lines.push('');
        }

        const contextPath = path.join(this.scratchpadDir, 'context.md');
        fs.writeFileSync(contextPath, lines.join('\n'), 'utf-8');

        return contextPath;
    }

    /**
     * Add blocker
     */
    async addBlocker(blocker) {
        this.state.blockers.push({
            id: `blocker_${this.state.blockers.length + 1}`,
            description: blocker.description,
            severity: blocker.severity || 'medium',
            status: 'open',
            addedAt: new Date().toISOString(),
            iteration: this.state.iterations,
            resolution: null,
            resolvedAt: null
        });

        await this.saveState();
        await this.saveBlockersMarkdown();

        return this.state.blockers;
    }

    /**
     * Resolve blocker
     */
    async resolveBlocker(blockerId, resolution) {
        const blocker = this.state.blockers.find(b => b.id === blockerId);
        if (blocker) {
            blocker.status = 'resolved';
            blocker.resolution = resolution;
            blocker.resolvedAt = new Date().toISOString();

            await this.saveState();
            await this.saveBlockersMarkdown();
        }

        return blocker;
    }

    /**
     * Save blockers as markdown
     */
    async saveBlockersMarkdown() {
        const lines = [
            `# Blockers`,
            '',
            `**Session:** ${this.sessionId}`,
            ''
        ];

        const open = this.state.blockers.filter(b => b.status === 'open');
        const resolved = this.state.blockers.filter(b => b.status === 'resolved');

        if (open.length > 0) {
            lines.push('## Open Blockers');
            lines.push('');
            open.forEach(b => {
                lines.push(`### ${b.id} [${b.severity.toUpperCase()}]`);
                lines.push(b.description);
                lines.push(`_Added iteration ${b.iteration} - ${b.addedAt}_`);
                lines.push('');
            });
        }

        if (resolved.length > 0) {
            lines.push('## Resolved Blockers');
            lines.push('');
            resolved.forEach(b => {
                lines.push(`### ${b.id} [RESOLVED]`);
                lines.push(`**Issue:** ${b.description}`);
                lines.push(`**Resolution:** ${b.resolution}`);
                lines.push(`_Resolved ${b.resolvedAt}_`);
                lines.push('');
            });
        }

        if (this.state.blockers.length === 0) {
            lines.push('_No blockers recorded._');
        }

        const blockersPath = path.join(this.scratchpadDir, 'blockers.md');
        fs.writeFileSync(blockersPath, lines.join('\n'), 'utf-8');

        return blockersPath;
    }

    /**
     * Record skill usage
     */
    async recordSkillUsage(skillId, success, notes) {
        this.state.skillsApplied.push({
            skillId,
            success,
            notes,
            appliedAt: new Date().toISOString(),
            iteration: this.state.iterations
        });

        // Save skills applied as JSON
        const skillsPath = path.join(this.scratchpadDir, 'skills_applied.json');
        fs.writeFileSync(skillsPath, JSON.stringify(this.state.skillsApplied, null, 2), 'utf-8');

        await this.saveState();

        return this.state.skillsApplied;
    }

    /**
     * Get session summary
     */
    getSummary() {
        const plan = this.state.plan;
        const progress = this.state.progress;
        const blockers = this.state.blockers;

        return {
            sessionId: this.sessionId,
            iterations: this.state.iterations,
            createdAt: this.state.createdAt,
            lastActivity: this.state.metadata.lastActivity,
            plan: {
                title: plan.title,
                totalSteps: plan.steps.length,
                completedSteps: plan.completedSteps.length,
                currentStep: plan.currentStep,
                progress: plan.steps.length > 0 ?
                    `${Math.round(plan.completedSteps.length / plan.steps.length * 100)}%` : '0%'
            },
            todos: {
                completed: progress.completed.length,
                inProgress: progress.inProgress.length,
                pending: progress.pending.length
            },
            blockers: {
                open: blockers.filter(b => b.status === 'open').length,
                resolved: blockers.filter(b => b.status === 'resolved').length
            },
            context: {
                learnings: this.state.context.learnings.length,
                discoveries: this.state.context.discoveries.length,
                decisions: this.state.context.decisions.length
            },
            skillsApplied: this.state.skillsApplied.length
        };
    }

    /**
     * Find and load previous session for a project
     */
    async findPreviousSession(projectDir) {
        projectDir = projectDir || this.projectDir;

        if (!fs.existsSync(this.baseDir)) {
            return null;
        }

        // Get all session directories
        const sessions = fs.readdirSync(this.baseDir)
            .filter(f => f.startsWith('session_'))
            .map(f => {
                const statePath = path.join(this.baseDir, f, 'state.json');
                if (fs.existsSync(statePath)) {
                    try {
                        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                        return { dir: f, state };
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            })
            .filter(s => s !== null)
            .filter(s => s.state.projectDir === projectDir)
            .sort((a, b) => new Date(b.state.updatedAt) - new Date(a.state.updatedAt));

        if (sessions.length > 0) {
            return sessions[0];
        }

        return null;
    }

    /**
     * Resume a previous session
     */
    async resumeSession(sessionId) {
        const sessionDir = path.join(this.baseDir, sessionId);

        if (!fs.existsSync(sessionDir)) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        this.sessionId = sessionId;
        this.scratchpadDir = sessionDir;
        await this.loadState();

        this.log(`Resumed session: ${sessionId}`);

        return this.state;
    }

    /**
     * Clean up old scratchpads
     */
    async cleanup() {
        if (!fs.existsSync(this.baseDir)) {
            return { deleted: 0 };
        }

        const now = Date.now();
        const maxAge = this.maxAgeDays * 24 * 60 * 60 * 1000;
        let deleted = 0;

        const sessions = fs.readdirSync(this.baseDir)
            .filter(f => f.startsWith('session_'))
            .map(f => {
                const statePath = path.join(this.baseDir, f, 'state.json');
                if (fs.existsSync(statePath)) {
                    try {
                        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                        return {
                            dir: f,
                            path: path.join(this.baseDir, f),
                            updatedAt: new Date(state.updatedAt).getTime()
                        };
                    } catch (e) {
                        return { dir: f, path: path.join(this.baseDir, f), updatedAt: 0 };
                    }
                }
                return { dir: f, path: path.join(this.baseDir, f), updatedAt: 0 };
            })
            .sort((a, b) => b.updatedAt - a.updatedAt);

        // Delete sessions older than maxAge or exceeding maxScratchpads
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            const age = now - session.updatedAt;

            // Skip current session
            if (session.dir === this.sessionId) continue;

            // Delete if too old or exceeds limit
            if (age > maxAge || i >= this.maxScratchpads) {
                try {
                    fs.rmSync(session.path, { recursive: true, force: true });
                    deleted++;
                    this.log(`Deleted old scratchpad: ${session.dir}`);
                } catch (e) {
                    this.log(`Warning: Could not delete ${session.dir}: ${e.message}`);
                }
            }
        }

        return { deleted };
    }

    /**
     * Export session for sharing/archiving
     */
    async exportSession() {
        const exportData = {
            ...this.state,
            exportedAt: new Date().toISOString(),
            files: {}
        };

        // Include all files in scratchpad
        const files = fs.readdirSync(this.scratchpadDir);
        for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.json')) {
                const filePath = path.join(this.scratchpadDir, file);
                exportData.files[file] = fs.readFileSync(filePath, 'utf-8');
            }
        }

        return exportData;
    }

    /**
     * Log message if verbose
     */
    log(message) {
        if (this.verbose) {
            console.log(`[SCRATCHPAD] ${message}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    const printHelp = () => {
        console.log('Usage: scratchpad-manager.js <command> [options]');
        console.log('');
        console.log('ACE Framework Scratchpad Manager v1.0.0');
        console.log('');
        console.log('Commands:');
        console.log('  init                  Initialize new scratchpad session');
        console.log('  resume <session-id>   Resume previous session');
        console.log('  find                  Find previous session for current project');
        console.log('  summary               Show session summary');
        console.log('  export                Export session data as JSON');
        console.log('  cleanup               Clean up old scratchpads');
        console.log('  list                  List all scratchpad sessions');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h            Show this help');
        console.log('  --verbose, -v         Verbose output');
        console.log('  --json                JSON output');
        console.log('  --project-dir <path>  Project directory');
        console.log('');
        console.log('Examples:');
        console.log('  scratchpad-manager.js init');
        console.log('  scratchpad-manager.js find --project-dir /path/to/project');
        console.log('  scratchpad-manager.js resume session_abc123');
        console.log('  scratchpad-manager.js summary --json');
    };

    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        printHelp();
        process.exit(0);
    }

    const verbose = args.includes('--verbose') || args.includes('-v');
    const json = args.includes('--json');
    const projectDirIndex = args.indexOf('--project-dir');
    const projectDir = projectDirIndex >= 0 ? args[projectDirIndex + 1] : process.cwd();

    const command = args.find(a => !a.startsWith('-') && a !== projectDir);

    (async () => {
        try {
            const manager = new ScratchpadManager({ verbose, projectDir });

            switch (command) {
                case 'init':
                    await manager.initialize();
                    if (json) {
                        console.log(JSON.stringify({ sessionId: manager.sessionId, path: manager.scratchpadDir }));
                    } else {
                        console.log(`Initialized session: ${manager.sessionId}`);
                        console.log(`Scratchpad: ${manager.scratchpadDir}`);
                    }
                    break;

                case 'resume':
                    const sessionId = args[args.indexOf('resume') + 1];
                    if (!sessionId || sessionId.startsWith('-')) {
                        console.error('Error: Session ID required');
                        process.exit(1);
                    }
                    await manager.initialize();
                    await manager.resumeSession(sessionId);
                    if (json) {
                        console.log(JSON.stringify(manager.getSummary()));
                    } else {
                        console.log(`Resumed session: ${sessionId}`);
                        console.log(`Iterations: ${manager.state.iterations}`);
                    }
                    break;

                case 'find':
                    await manager.initialize();
                    const previous = await manager.findPreviousSession();
                    if (previous) {
                        if (json) {
                            console.log(JSON.stringify(previous.state));
                        } else {
                            console.log(`Found previous session: ${previous.dir}`);
                            console.log(`Last updated: ${previous.state.updatedAt}`);
                            console.log(`Iterations: ${previous.state.iterations}`);
                        }
                    } else {
                        if (json) {
                            console.log(JSON.stringify({ found: false }));
                        } else {
                            console.log('No previous session found for this project');
                        }
                    }
                    break;

                case 'summary':
                    await manager.initialize();
                    const summary = manager.getSummary();
                    if (json) {
                        console.log(JSON.stringify(summary, null, 2));
                    } else {
                        console.log('='.repeat(50));
                        console.log('Session Summary');
                        console.log('='.repeat(50));
                        console.log(`Session ID:    ${summary.sessionId}`);
                        console.log(`Iterations:    ${summary.iterations}`);
                        console.log(`Plan Progress: ${summary.plan.progress}`);
                        console.log(`Todos:         ${summary.todos.completed} done, ${summary.todos.inProgress} in progress, ${summary.todos.pending} pending`);
                        console.log(`Blockers:      ${summary.blockers.open} open, ${summary.blockers.resolved} resolved`);
                        console.log(`Skills Used:   ${summary.skillsApplied}`);
                        console.log('='.repeat(50));
                    }
                    break;

                case 'export':
                    await manager.initialize();
                    const exportData = await manager.exportSession();
                    console.log(JSON.stringify(exportData, null, 2));
                    break;

                case 'cleanup':
                    await manager.initialize();
                    const result = await manager.cleanup();
                    if (json) {
                        console.log(JSON.stringify(result));
                    } else {
                        console.log(`Cleaned up ${result.deleted} old scratchpad(s)`);
                    }
                    break;

                case 'list':
                    const baseDir = path.join(process.env.HOME || '/tmp', '.claude', 'scratchpad');
                    if (!fs.existsSync(baseDir)) {
                        console.log('No scratchpads found');
                        break;
                    }
                    const sessions = fs.readdirSync(baseDir)
                        .filter(f => f.startsWith('session_'))
                        .map(f => {
                            const statePath = path.join(baseDir, f, 'state.json');
                            if (fs.existsSync(statePath)) {
                                try {
                                    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                                    return {
                                        sessionId: f,
                                        projectDir: state.projectDir,
                                        iterations: state.iterations,
                                        updatedAt: state.updatedAt
                                    };
                                } catch (e) {
                                    return null;
                                }
                            }
                            return null;
                        })
                        .filter(s => s !== null)
                        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

                    if (json) {
                        console.log(JSON.stringify(sessions, null, 2));
                    } else {
                        console.log('='.repeat(70));
                        console.log('Scratchpad Sessions');
                        console.log('='.repeat(70));
                        sessions.forEach(s => {
                            console.log(`${s.sessionId}`);
                            console.log(`  Project:    ${s.projectDir}`);
                            console.log(`  Iterations: ${s.iterations}`);
                            console.log(`  Updated:    ${s.updatedAt}`);
                            console.log('');
                        });
                        console.log(`Total: ${sessions.length} session(s)`);
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

module.exports = { ScratchpadManager };
