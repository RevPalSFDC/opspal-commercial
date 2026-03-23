#!/usr/bin/env node
/**
 * Reflection Reliability Manager
 *
 * Provides automated reliability enhancements for the reflection system:
 * 1. Auto-retry failed submissions from local queue
 * 2. Skill data freshness monitoring and auto-refresh
 * 3. ProcessReflections auto-trigger based on thresholds
 * 4. Self-healing for corrupt/missing files
 * 5. Health monitoring and alerting
 *
 * Usage:
 *   node reflection-reliability-manager.js run          # Run all reliability checks
 *   node reflection-reliability-manager.js retry        # Retry failed submissions
 *   node reflection-reliability-manager.js refresh      # Refresh skill data if stale
 *   node reflection-reliability-manager.js trigger      # Check if processreflections needed
 *   node reflection-reliability-manager.js heal         # Self-heal corrupt files
 *   node reflection-reliability-manager.js status       # Show system status
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');

// Load .env from project root (walk up from __dirname)
(function loadEnv() {
    let dir = __dirname;
    for (let i = 0; i < 6; i++) {
        const envPath = path.join(dir, '.env');
        if (fs.existsSync(envPath)) {
            for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
                const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)/);
                if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
            }
            break;
        }
        dir = path.dirname(dir);
    }
})();

// Configuration
const CONFIG = {
    // Paths
    CLAUDE_DIR: path.join(process.env.HOME, '.claude'),
    PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '../..'),

    // Thresholds
    SKILL_DATA_STALE_DAYS: 7,           // Refresh if older than this
    SKILL_DATA_CRITICAL_DAYS: 14,       // Alert if older than this
    PROCESS_REFLECTIONS_THRESHOLD: 5,   // Auto-trigger at this count
    STALE_BACKLOG_WARNING_DAYS: parseInt(process.env.REFLECTION_STALE_WARNING_DAYS || '7', 10),
    STALE_BACKLOG_CRITICAL_DAYS: parseInt(process.env.REFLECTION_STALE_CRITICAL_DAYS || '21', 10),
    NON_NEW_BACKLOG_STATUSES: (process.env.REFLECTION_BACKLOG_STATUSES || 'under_review,accepted')
        .split(',')
        .map(status => status.trim())
        .filter(Boolean),
    RETRY_MAX_ATTEMPTS: 3,              // Max retry attempts per item
    RETRY_BACKOFF_BASE_MS: 1000,        // Base backoff for retries

    // Supabase
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://kjgsodyuzjgbebfnbruz.supabase.co',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'sb_publishable_-_VJIjhOxqZCEMN1xyWPdg_TioDXc0a',

    // Files
    QUEUE_FILE: path.join(process.env.HOME, '.claude', 'pending-submissions.jsonl'),
    SKILL_QUEUE_FILE: path.join(process.env.HOME, '.claude', 'skill-execution-queue.jsonl'),
    STATUS_FILE: path.join(process.env.HOME, '.claude', 'reliability-status.json'),
    ALERT_LOG: path.join(process.env.HOME, '.claude', 'logs', 'reliability-alerts.jsonl')
};

class ReflectionReliabilityManager {
    constructor(options = {}) {
        this.verbose = options.verbose || process.argv.includes('--verbose');
        this.dryRun = options.dryRun || process.argv.includes('--dry-run');
        this.status = {
            lastRun: null,
            pendingSubmissions: 0,
            skillDataAge: null,
            openReflections: 0,
            nonNewBacklog: null,
            healthScore: 100,
            issues: [],
            actions: []
        };
    }

    log(message, level = 'INFO') {
        if (this.verbose || level === 'ERROR' || level === 'WARN') {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level}] ${message}`);
        }
    }

    // =========================================================================
    // 1. Retry Failed Submissions
    // =========================================================================

    async retryFailedSubmissions() {
        this.log('Checking for failed submissions to retry...');

        const queues = [
            { path: CONFIG.QUEUE_FILE, type: 'reflection' },
            { path: CONFIG.SKILL_QUEUE_FILE, type: 'skill-execution' }
        ];

        let totalRetried = 0;
        let totalSucceeded = 0;
        let totalFailed = 0;

        for (const queue of queues) {
            if (!fs.existsSync(queue.path)) {
                this.log(`No ${queue.type} queue found at ${queue.path}`);
                continue;
            }

            const content = fs.readFileSync(queue.path, 'utf-8').trim();
            if (!content) continue;

            const lines = content.split('\n').filter(l => l.trim());
            this.log(`Found ${lines.length} pending ${queue.type} submissions`);

            const failedItems = [];

            for (const line of lines) {
                try {
                    const item = JSON.parse(line);

                    // Check retry count
                    const retryCount = item._retryCount || 0;
                    if (retryCount >= CONFIG.RETRY_MAX_ATTEMPTS) {
                        this.log(`Skipping ${queue.type} item - max retries exceeded`, 'WARN');
                        failedItems.push({ ...item, _retryCount: retryCount, _permanentFailure: true });
                        totalFailed++;
                        continue;
                    }

                    // Exponential backoff
                    const backoffMs = CONFIG.RETRY_BACKOFF_BASE_MS * Math.pow(2, retryCount);
                    const lastAttempt = item._lastAttempt ? new Date(item._lastAttempt) : null;
                    if (lastAttempt && (Date.now() - lastAttempt.getTime()) < backoffMs) {
                        failedItems.push(item);
                        continue;
                    }

                    totalRetried++;

                    if (this.dryRun) {
                        this.log(`[DRY RUN] Would retry ${queue.type}: ${JSON.stringify(item).slice(0, 100)}`);
                        failedItems.push(item);
                        continue;
                    }

                    // Attempt submission
                    const success = await this.submitItem(item, queue.type);

                    if (success) {
                        totalSucceeded++;
                        this.log(`Successfully retried ${queue.type} submission`);
                    } else {
                        failedItems.push({
                            ...item,
                            _retryCount: retryCount + 1,
                            _lastAttempt: new Date().toISOString()
                        });
                    }
                } catch (e) {
                    this.log(`Error processing queue item: ${e.message}`, 'ERROR');
                    failedItems.push(line);
                }
            }

            // Rewrite queue with remaining items
            if (!this.dryRun) {
                if (failedItems.length > 0) {
                    fs.writeFileSync(queue.path, failedItems.map(i =>
                        typeof i === 'string' ? i : JSON.stringify(i)
                    ).join('\n') + '\n');
                } else {
                    fs.unlinkSync(queue.path);
                }
            }
        }

        this.status.pendingSubmissions = totalFailed;
        this.status.actions.push({
            action: 'retry_submissions',
            retried: totalRetried,
            succeeded: totalSucceeded,
            failed: totalFailed
        });

        return { retried: totalRetried, succeeded: totalSucceeded, failed: totalFailed };
    }

    async submitItem(item, type) {
        try {
            if (type === 'reflection') {
                // Submit reflection to Supabase
                return await this.submitReflection(item);
            } else if (type === 'skill-execution') {
                // Record skill execution
                return await this.recordSkillExecution(item);
            }
            return false;
        } catch (e) {
            this.log(`Submission failed: ${e.message}`, 'WARN');
            return false;
        }
    }

    async submitReflection(reflection) {
        return new Promise((resolve) => {
            const data = JSON.stringify({ data: reflection });

            const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/reflections`);
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                    'Prefer': 'return=minimal'
                }
            };

            const req = https.request(url, options, (res) => {
                resolve(res.statusCode >= 200 && res.statusCode < 300);
            });

            req.on('error', () => resolve(false));
            req.write(data);
            req.end();
        });
    }

    async recordSkillExecution(item) {
        // Use the strategy-registry if available
        const registryScript = path.join(CONFIG.PLUGIN_ROOT, 'scripts/lib/strategy-registry.js');
        if (!fs.existsSync(registryScript)) {
            return false;
        }

        try {
            execSync(`node "${registryScript}" record --skill-id "${item.skill_id}" --agent "${item.agent}" --success "${item.success}"`, {
                timeout: 10000,
                stdio: 'pipe'
            });
            return true;
        } catch {
            return false;
        }
    }

    // =========================================================================
    // 2. Skill Data Freshness Check & Auto-Refresh
    // =========================================================================

    async checkAndRefreshSkillData() {
        this.log('Checking skill data freshness...');

        const skillDataPath = path.join(CONFIG.PLUGIN_ROOT, 'config', 'skill-data.json');

        if (!fs.existsSync(skillDataPath)) {
            this.log('Skill data file does not exist - will create', 'WARN');
            this.status.skillDataAge = Infinity;
            this.status.issues.push({ type: 'skill_data_missing', severity: 'high' });

            if (!this.dryRun) {
                return await this.refreshSkillData();
            }
            return { status: 'missing', refreshed: false };
        }

        // Check age
        let skillData;
        try {
            skillData = JSON.parse(fs.readFileSync(skillDataPath, 'utf-8'));
        } catch (e) {
            this.log('Skill data file is corrupt - will regenerate', 'ERROR');
            this.status.issues.push({ type: 'skill_data_corrupt', severity: 'high' });

            if (!this.dryRun) {
                return await this.refreshSkillData();
            }
            return { status: 'corrupt', refreshed: false };
        }

        const generatedAt = skillData.generated_at ? new Date(skillData.generated_at) : null;
        if (!generatedAt) {
            this.log('Skill data has no generation timestamp - will refresh', 'WARN');
            if (!this.dryRun) {
                return await this.refreshSkillData();
            }
            return { status: 'no_timestamp', refreshed: false };
        }

        const ageInDays = (Date.now() - generatedAt.getTime()) / (24 * 3600000);
        this.status.skillDataAge = ageInDays.toFixed(1);

        this.log(`Skill data age: ${ageInDays.toFixed(1)} days`);

        if (ageInDays > CONFIG.SKILL_DATA_CRITICAL_DAYS) {
            this.status.issues.push({
                type: 'skill_data_critical',
                severity: 'high',
                message: `Skill data is critically stale (${ageInDays.toFixed(1)} days)`
            });
            this.log(`Skill data critically stale - refreshing`, 'WARN');

            if (!this.dryRun) {
                return await this.refreshSkillData();
            }
            return { status: 'critical', ageInDays, refreshed: false };
        }

        if (ageInDays > CONFIG.SKILL_DATA_STALE_DAYS) {
            this.status.issues.push({
                type: 'skill_data_stale',
                severity: 'medium',
                message: `Skill data is stale (${ageInDays.toFixed(1)} days)`
            });
            this.log(`Skill data stale - refreshing`, 'INFO');

            if (!this.dryRun) {
                return await this.refreshSkillData();
            }
            return { status: 'stale', ageInDays, refreshed: false };
        }

        this.log(`Skill data is fresh (${ageInDays.toFixed(1)} days old)`);
        return { status: 'fresh', ageInDays, refreshed: false };
    }

    async refreshSkillData() {
        this.log('Refreshing skill data from historical reflections...');

        const aggregatorScript = path.join(CONFIG.PLUGIN_ROOT, 'scripts/lib/ace-skill-aggregator.js');

        if (!fs.existsSync(aggregatorScript)) {
            this.log('Skill aggregator script not found', 'ERROR');
            return { status: 'error', error: 'aggregator_missing', refreshed: false };
        }

        try {
            execSync(`node "${aggregatorScript}" update --days=180`, {
                timeout: 120000,
                stdio: this.verbose ? 'inherit' : 'pipe'
            });

            this.log('Skill data refreshed successfully');
            this.status.actions.push({ action: 'refresh_skill_data', success: true });
            return { status: 'refreshed', refreshed: true };
        } catch (e) {
            this.log(`Failed to refresh skill data: ${e.message}`, 'ERROR');
            this.status.actions.push({ action: 'refresh_skill_data', success: false, error: e.message });
            return { status: 'error', error: e.message, refreshed: false };
        }
    }

    // =========================================================================
    // 3. Auto-Trigger ProcessReflections
    // =========================================================================

    async checkAndTriggerProcessReflections() {
        this.log('Checking if processreflections should be triggered...');

        // Count open reflections
        const openCount = await this.countOpenReflections();
        this.status.openReflections = openCount;

        this.log(`Open reflections: ${openCount}`);

        if (openCount >= CONFIG.PROCESS_REFLECTIONS_THRESHOLD) {
            this.log(`Threshold reached (${openCount} >= ${CONFIG.PROCESS_REFLECTIONS_THRESHOLD})`);
            this.status.actions.push({
                action: 'trigger_processreflections',
                openCount,
                threshold: CONFIG.PROCESS_REFLECTIONS_THRESHOLD
            });

            if (!this.dryRun) {
                return await this.triggerProcessReflections();
            }
            return { shouldTrigger: true, triggered: false, openCount };
        }

        this.log(`Below threshold (${openCount} < ${CONFIG.PROCESS_REFLECTIONS_THRESHOLD})`);
        return { shouldTrigger: false, triggered: false, openCount };
    }

    async countOpenReflections() {
        return new Promise((resolve) => {
            const url = `${CONFIG.SUPABASE_URL}/rest/v1/reflections?reflection_status=eq.new&select=id`;

            const options = {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            };

            const req = https.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const reflections = JSON.parse(data);
                        resolve(Array.isArray(reflections) ? reflections.length : 0);
                    } catch {
                        resolve(0);
                    }
                });
            });

            req.on('error', () => resolve(0));
            req.end();
        });
    }

    getStaleBacklogThresholds() {
        const warningDays = Number.isFinite(CONFIG.STALE_BACKLOG_WARNING_DAYS) && CONFIG.STALE_BACKLOG_WARNING_DAYS > 0
            ? CONFIG.STALE_BACKLOG_WARNING_DAYS
            : 7;
        const configuredCritical = Number.isFinite(CONFIG.STALE_BACKLOG_CRITICAL_DAYS) && CONFIG.STALE_BACKLOG_CRITICAL_DAYS > 0
            ? CONFIG.STALE_BACKLOG_CRITICAL_DAYS
            : 21;
        const criticalDays = configuredCritical > warningDays
            ? configuredCritical
            : warningDays + 7;

        return { warningDays, criticalDays };
    }

    getAgeDays(timestamp) {
        if (!timestamp) return null;
        const parsed = Date.parse(timestamp);
        if (Number.isNaN(parsed)) return null;
        return Math.max(0, Math.floor((Date.now() - parsed) / (24 * 3600000)));
    }

    async fetchReflectionsByStatuses(statuses) {
        return new Promise((resolve) => {
            if (!Array.isArray(statuses) || statuses.length === 0) {
                resolve([]);
                return;
            }

            const encodedStatuses = statuses.map(status => encodeURIComponent(status)).join(',');
            const url = `${CONFIG.SUPABASE_URL}/rest/v1/reflections?reflection_status=in.(${encodedStatuses})&select=id,reflection_status,created_at,reviewed_at`;

            const options = {
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
                }
            };

            const req = https.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const reflections = JSON.parse(data);
                        resolve(Array.isArray(reflections) ? reflections : []);
                    } catch {
                        resolve([]);
                    }
                });
            });

            req.on('error', () => resolve([]));
            req.end();
        });
    }

    async analyzeNonNewBacklog() {
        const statuses = [...new Set(CONFIG.NON_NEW_BACKLOG_STATUSES || [])];
        const { warningDays, criticalDays } = this.getStaleBacklogThresholds();
        const summary = {
            statuses,
            warningDays,
            criticalDays,
            total: 0,
            staleWarning: 0,
            staleCritical: 0,
            byStatus: {},
            oldestRecords: []
        };

        if (statuses.length === 0) {
            this.status.nonNewBacklog = summary;
            return summary;
        }

        const reflections = await this.fetchReflectionsByStatuses(statuses);
        summary.total = reflections.length;

        const oldest = [];
        for (const reflection of reflections) {
            const status = reflection.reflection_status || 'unknown';
            const ageDays = this.getAgeDays(reflection.reviewed_at || reflection.created_at);

            if (!summary.byStatus[status]) {
                summary.byStatus[status] = {
                    total: 0,
                    staleWarning: 0,
                    staleCritical: 0,
                    oldestDays: 0
                };
            }

            summary.byStatus[status].total += 1;

            if (ageDays !== null) {
                if (ageDays >= warningDays) {
                    summary.byStatus[status].staleWarning += 1;
                    summary.staleWarning += 1;
                }
                if (ageDays >= criticalDays) {
                    summary.byStatus[status].staleCritical += 1;
                    summary.staleCritical += 1;
                }
                if (ageDays > summary.byStatus[status].oldestDays) {
                    summary.byStatus[status].oldestDays = ageDays;
                }

                oldest.push({
                    id: reflection.id,
                    status,
                    ageDays
                });
            }
        }

        summary.oldestRecords = oldest
            .sort((a, b) => b.ageDays - a.ageDays)
            .slice(0, 5);

        this.status.nonNewBacklog = summary;
        return summary;
    }

    async triggerProcessReflections() {
        this.log('Triggering processreflections...');

        const processScript = path.join(process.cwd(), '.claude/scripts/process-reflections.js');

        if (!fs.existsSync(processScript)) {
            this.log('process-reflections.js not found', 'WARN');
            return { triggered: false, error: 'script_not_found' };
        }

        try {
            // Run in background
            const child = spawn('node', [processScript], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            this.log('ProcessReflections triggered in background');
            return { triggered: true };
        } catch (e) {
            this.log(`Failed to trigger processreflections: ${e.message}`, 'ERROR');
            return { triggered: false, error: e.message };
        }
    }

    // =========================================================================
    // 4. Self-Healing
    // =========================================================================

    async selfHeal() {
        this.log('Running self-healing checks...');

        const actions = [];

        // Ensure directories exist
        const dirs = [
            CONFIG.CLAUDE_DIR,
            path.join(CONFIG.CLAUDE_DIR, 'logs'),
            path.join(CONFIG.CLAUDE_DIR, 'cache'),
            path.join(CONFIG.PLUGIN_ROOT, 'config')
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                if (!this.dryRun) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                actions.push({ action: 'create_directory', path: dir });
                this.log(`Created missing directory: ${dir}`);
            }
        }

        // Check for corrupt JSON files and repair
        const jsonFiles = [
            path.join(CONFIG.PLUGIN_ROOT, 'config', 'skill-data.json'),
            path.join(CONFIG.PLUGIN_ROOT, 'config', 'skill-registry.json'),
            path.join(CONFIG.PLUGIN_ROOT, 'config', 'agent-alias-cache.json'),
            path.join(CONFIG.PLUGIN_ROOT, 'config', 'command-registry.json')
        ];

        for (const file of jsonFiles) {
            if (fs.existsSync(file)) {
                try {
                    JSON.parse(fs.readFileSync(file, 'utf-8'));
                } catch {
                    const backup = `${file}.corrupt.${Date.now()}`;
                    if (!this.dryRun) {
                        fs.renameSync(file, backup);
                    }
                    actions.push({
                        action: 'quarantine_corrupt_file',
                        file,
                        backup
                    });
                    this.log(`Quarantined corrupt file: ${file}`, 'WARN');
                    this.status.issues.push({
                        type: 'corrupt_file',
                        severity: 'medium',
                        file
                    });
                }
            }
        }

        // Clean up old log files (>30 days)
        const logsDir = path.join(CONFIG.CLAUDE_DIR, 'logs');
        if (fs.existsSync(logsDir)) {
            const cutoff = Date.now() - (30 * 24 * 3600000);
            const files = fs.readdirSync(logsDir);

            for (const file of files) {
                const filePath = path.join(logsDir, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (stat.mtimeMs < cutoff && stat.isFile()) {
                        if (!this.dryRun) {
                            fs.unlinkSync(filePath);
                        }
                        actions.push({ action: 'cleanup_old_log', file: filePath });
                    }
                } catch {
                    // Ignore
                }
            }
        }

        this.status.actions.push(...actions);
        return { actions };
    }

    // =========================================================================
    // 5. Health Monitoring
    // =========================================================================

    async checkHealth() {
        this.log('Running health checks...');

        let healthScore = 100;
        const issues = [];

        // Check Supabase connectivity
        const supabaseOk = await this.checkSupabaseConnectivity();
        if (!supabaseOk) {
            healthScore -= 30;
            issues.push({ type: 'supabase_unreachable', severity: 'high' });
        }

        // Check skill data
        const skillDataResult = await this.checkAndRefreshSkillData();
        if (skillDataResult.status === 'missing' || skillDataResult.status === 'corrupt') {
            healthScore -= 20;
        } else if (skillDataResult.status === 'critical') {
            healthScore -= 15;
        } else if (skillDataResult.status === 'stale') {
            healthScore -= 10;
        }

        // Check pending submissions
        const pendingCount = this.countPendingSubmissions();
        this.status.pendingSubmissions = pendingCount;
        if (pendingCount > 10) {
            healthScore -= 15;
            issues.push({ type: 'many_pending_submissions', count: pendingCount, severity: 'medium' });
        } else if (pendingCount > 0) {
            healthScore -= 5;
        }

        // Check open reflections backlog
        const openCount = await this.countOpenReflections();
        this.status.openReflections = openCount;
        if (openCount > 20) {
            healthScore -= 10;
            issues.push({ type: 'large_reflection_backlog', count: openCount, severity: 'medium' });
        }

        const nonNewBacklog = await this.analyzeNonNewBacklog();
        if (nonNewBacklog.staleCritical > 0) {
            healthScore -= 10;
            issues.push({
                type: 'stale_non_new_backlog_critical',
                count: nonNewBacklog.staleCritical,
                thresholdDays: nonNewBacklog.criticalDays,
                severity: 'high'
            });
        } else if (nonNewBacklog.staleWarning > 0) {
            healthScore -= 5;
            issues.push({
                type: 'stale_non_new_backlog_warning',
                count: nonNewBacklog.staleWarning,
                thresholdDays: nonNewBacklog.warningDays,
                severity: 'medium'
            });
        }

        this.status.healthScore = Math.max(0, healthScore);
        this.status.issues.push(...issues);

        return {
            healthScore: this.status.healthScore,
            issues: this.status.issues,
            status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'unhealthy'
        };
    }

    async checkSupabaseConnectivity() {
        return new Promise((resolve) => {
            const req = https.request(`${CONFIG.SUPABASE_URL}/rest/v1/`, {
                method: 'GET',
                headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY },
                timeout: 5000
            }, (res) => {
                resolve(res.statusCode < 500);
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }

    countPendingSubmissions() {
        let count = 0;

        if (fs.existsSync(CONFIG.QUEUE_FILE)) {
            const content = fs.readFileSync(CONFIG.QUEUE_FILE, 'utf-8').trim();
            count += content ? content.split('\n').length : 0;
        }

        if (fs.existsSync(CONFIG.SKILL_QUEUE_FILE)) {
            const content = fs.readFileSync(CONFIG.SKILL_QUEUE_FILE, 'utf-8').trim();
            count += content ? content.split('\n').length : 0;
        }

        return count;
    }

    // =========================================================================
    // 6. Status Reporting
    // =========================================================================

    async generateStatus() {
        await this.checkHealth();

        this.status.lastRun = new Date().toISOString();

        // Save status
        if (!this.dryRun) {
            fs.writeFileSync(CONFIG.STATUS_FILE, JSON.stringify(this.status, null, 2));
        }

        return this.status;
    }

    printStatus() {
        console.log('\n' + '═'.repeat(60));
        console.log('  REFLECTION SYSTEM RELIABILITY STATUS');
        console.log('═'.repeat(60) + '\n');

        const healthIcon = this.status.healthScore >= 80 ? '✅' :
                          this.status.healthScore >= 50 ? '⚠️' : '❌';

        console.log(`Health Score: ${healthIcon} ${this.status.healthScore}/100\n`);

        console.log('Metrics:');
        console.log(`  Skill Data Age: ${this.status.skillDataAge || 'N/A'} days`);
        console.log(`  Open Reflections: ${this.status.openReflections}`);
        console.log(`  Pending Submissions: ${this.status.pendingSubmissions}`);
        if (this.status.nonNewBacklog) {
            const backlog = this.status.nonNewBacklog;
            console.log(`  Non-new Backlog (${backlog.statuses.join(', ')}): ${backlog.total}`);
            console.log(`    Stale >=${backlog.warningDays}d: ${backlog.staleWarning}`);
            console.log(`    Critical >=${backlog.criticalDays}d: ${backlog.staleCritical}`);

            const statusBreakdown = Object.entries(backlog.byStatus)
                .sort((a, b) => b[1].total - a[1].total);
            for (const [status, stats] of statusBreakdown) {
                console.log(
                    `    - ${status}: total=${stats.total}, stale=${stats.staleWarning}, critical=${stats.staleCritical}, oldest=${stats.oldestDays}d`
                );
            }

            if (backlog.oldestRecords.length > 0) {
                const oldestPreview = backlog.oldestRecords
                    .map(item => `${item.id.slice(0, 8)}(${item.status},${item.ageDays}d)`)
                    .join(', ');
                console.log(`    Oldest: ${oldestPreview}`);
            }
        }

        if (this.status.issues.length > 0) {
            console.log('\nIssues:');
            for (const issue of this.status.issues) {
                const icon = issue.severity === 'high' ? '🔴' :
                            issue.severity === 'medium' ? '🟡' : '🟢';
                console.log(`  ${icon} ${issue.type}${issue.message ? `: ${issue.message}` : ''}`);
            }
        }

        if (this.status.actions.length > 0) {
            console.log('\nActions Taken:');
            for (const action of this.status.actions) {
                console.log(`  → ${action.action}`);
            }
        }

        console.log('\n' + '═'.repeat(60));
    }

    // =========================================================================
    // Main Runner
    // =========================================================================

    async run(command = 'run') {
        switch (command) {
            case 'run':
            case 'all':
                await this.selfHeal();
                await this.retryFailedSubmissions();
                await this.checkAndRefreshSkillData();
                await this.checkAndTriggerProcessReflections();
                await this.generateStatus();
                this.printStatus();
                break;

            case 'retry':
                const retryResult = await this.retryFailedSubmissions();
                console.log(`Retried: ${retryResult.retried}, Succeeded: ${retryResult.succeeded}, Failed: ${retryResult.failed}`);
                break;

            case 'refresh':
                const refreshResult = await this.checkAndRefreshSkillData();
                console.log(`Skill data status: ${refreshResult.status}`);
                break;

            case 'trigger':
                const triggerResult = await this.checkAndTriggerProcessReflections();
                console.log(`Should trigger: ${triggerResult.shouldTrigger}, Triggered: ${triggerResult.triggered || false}`);
                break;

            case 'heal':
                const healResult = await this.selfHeal();
                console.log(`Self-healing actions: ${healResult.actions.length}`);
                break;

            case 'status':
                await this.generateStatus();
                this.printStatus();
                break;

            default:
                console.log('Unknown command. Use: run, retry, refresh, trigger, heal, status');
        }

        return this.status;
    }
}

// CLI
async function main() {
    const command = process.argv[2] || 'run';
    const manager = new ReflectionReliabilityManager();

    try {
        await manager.run(command);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = { ReflectionReliabilityManager, CONFIG };

if (require.main === module) {
    main();
}
