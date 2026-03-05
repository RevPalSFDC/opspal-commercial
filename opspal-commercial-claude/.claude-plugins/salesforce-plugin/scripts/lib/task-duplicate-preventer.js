#!/usr/bin/env node

/**
 * Task Duplicate Prevention Module
 *
 * Prevents duplicate task creation through multiple strategies:
 * - Pre-creation duplicate checking
 * - Hash-based task fingerprinting
 * - Idempotent operation support
 * - Transaction logging with unique IDs
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class TaskDuplicatePreventer {
    constructor(targetOrg, options = {}) {
        this.targetOrg = targetOrg;
        this.cacheDir = options.cacheDir || '/tmp/task-duplicate-cache';
        this.historyFile = path.join(this.cacheDir, 'task-creation-history.json');
        this.duplicateThreshold = options.duplicateThreshold || 3600000; // 1 hour
        this.enableLogging = options.enableLogging !== false;

        this.ensureCacheDir();
        this.loadHistory();
    }

    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    loadHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                const content = fs.readFileSync(this.historyFile, 'utf-8');
                this.history = JSON.parse(content);
            } else {
                this.history = {
                    tasks: {},
                    sessions: [],
                    lastCleanup: Date.now()
                };
            }
        } catch (error) {
            console.warn('⚠️ Could not load history, starting fresh:', error.message);
            this.history = {
                tasks: {},
                sessions: [],
                lastCleanup: Date.now()
            };
        }

        // Cleanup old entries periodically
        if (Date.now() - this.history.lastCleanup > 86400000) { // 24 hours
            this.cleanupOldEntries();
        }
    }

    saveHistory() {
        try {
            fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
        } catch (error) {
            console.error('❌ Failed to save history:', error.message);
        }
    }

    /**
     * Generate unique hash for a task based on key fields
     */
    generateTaskHash(task) {
        // Use key fields that uniquely identify a task
        const keyFields = {
            subject: task.Subject || '',
            ownerId: task.OwnerId || '',
            whatId: task.WhatId || '',
            whoId: task.WhoId || '',
            activityDate: task.ActivityDate || '',
            description: (task.Description || '').substring(0, 100) // First 100 chars
        };

        const hashInput = JSON.stringify(keyFields);
        return crypto.createHash('sha256').update(hashInput).digest('hex');
    }

    /**
     * Check for existing duplicates in Salesforce
     */
    async checkExistingDuplicates(tasks, options = {}) {
        console.log('\n🔍 Checking for existing duplicates in Salesforce...');

        const duplicates = [];
        const batchSize = options.batchSize || 10;

        // Process in batches for efficiency
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            const results = await this.queryBatchForDuplicates(batch);
            duplicates.push(...results);
        }

        if (duplicates.length > 0) {
            console.log(`⚠️ Found ${duplicates.length} potential duplicates`);

            if (options.detailed) {
                duplicates.forEach(dup => {
                    console.log(`  - "${dup.task.Subject}" for ${dup.task.WhatId || 'No related record'}`);
                    console.log(`    Existing: ${dup.existing.length} similar task(s) found`);
                });
            }
        } else {
            console.log('✅ No duplicates found');
        }

        return duplicates;
    }

    /**
     * Query for duplicates in a batch
     */
    async queryBatchForDuplicates(batch) {
        const duplicates = [];

        for (const task of batch) {
            try {
                // Build query to find similar tasks
                let query = 'SELECT Id, Subject, OwnerId, WhatId, WhoId, ActivityDate, CreatedDate FROM Task WHERE';
                const conditions = [];

                // Match on subject (fuzzy)
                if (task.Subject) {
                    const escapedSubject = task.Subject.replace(/'/g, "\\'");
                    conditions.push(`Subject LIKE '%${escapedSubject}%'`);
                }

                // Match on owner
                if (task.OwnerId) {
                    conditions.push(`OwnerId = '${task.OwnerId}'`);
                }

                // Match on related record
                if (task.WhatId) {
                    conditions.push(`WhatId = '${task.WhatId}'`);
                }

                // Match on date (within same day)
                if (task.ActivityDate) {
                    conditions.push(`ActivityDate = ${task.ActivityDate}`);
                }

                // Only check recent tasks to improve performance
                conditions.push('CreatedDate = LAST_N_DAYS:7');

                if (conditions.length === 0) {
                    continue; // Skip if no meaningful conditions
                }

                query += ' ' + conditions.join(' AND ') + ' LIMIT 10';

                const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json 2>/dev/null`;
                const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

                if (result.result && result.result.totalSize > 0) {
                    // Further check if it's really a duplicate
                    const realDuplicates = this.filterRealDuplicates(task, result.result.records);

                    if (realDuplicates.length > 0) {
                        duplicates.push({
                            task: task,
                            existing: realDuplicates,
                            hash: this.generateTaskHash(task)
                        });
                    }
                }

            } catch (error) {
                // Query failed, but continue checking others
                if (this.enableLogging) {
                    console.warn(`⚠️ Could not check duplicate for task: ${task.Subject}`);
                }
            }
        }

        return duplicates;
    }

    /**
     * Filter out false positives from duplicate check
     */
    filterRealDuplicates(newTask, existingTasks) {
        return existingTasks.filter(existing => {
            // Check if subjects are very similar (not just partial match)
            const subjectSimilarity = this.calculateSimilarity(
                newTask.Subject || '',
                existing.Subject || ''
            );

            // Check if it's the same date
            const sameDate = newTask.ActivityDate === existing.ActivityDate;

            // Check if it's the same owner
            const sameOwner = newTask.OwnerId === existing.OwnerId;

            // Check if it's the same related record
            const sameRelated = newTask.WhatId === existing.WhatId;

            // Consider it a duplicate if subject is >80% similar and at least 2 other fields match
            const matchCount = [sameDate, sameOwner, sameRelated].filter(Boolean).length;

            return subjectSimilarity > 0.8 && matchCount >= 2;
        });
    }

    /**
     * Calculate string similarity (Levenshtein distance based)
     */
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        if (str1 === str2) return 1;

        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * Check if tasks were recently created (idempotency check)
     */
    checkRecentCreation(tasks) {
        console.log('\n🕐 Checking recent creation history...');

        const recentlyCreated = [];
        const now = Date.now();

        for (const task of tasks) {
            const hash = this.generateTaskHash(task);
            const previous = this.history.tasks[hash];

            if (previous && (now - previous.timestamp) < this.duplicateThreshold) {
                recentlyCreated.push({
                    task: task,
                    previous: previous,
                    hash: hash,
                    minutesAgo: Math.floor((now - previous.timestamp) / 60000)
                });
            }
        }

        if (recentlyCreated.length > 0) {
            console.log(`⚠️ Found ${recentlyCreated.length} tasks created recently:`);
            recentlyCreated.forEach(item => {
                console.log(`  - "${item.task.Subject}" created ${item.minutesAgo} minutes ago`);
                if (item.previous.taskId) {
                    console.log(`    Task ID: ${item.previous.taskId}`);
                }
            });
        }

        return recentlyCreated;
    }

    /**
     * Record successful task creation
     */
    recordCreation(task, taskId) {
        const hash = this.generateTaskHash(task);

        this.history.tasks[hash] = {
            taskId: taskId,
            timestamp: Date.now(),
            subject: task.Subject,
            ownerId: task.OwnerId,
            createdIn: this.targetOrg
        };

        this.saveHistory();
    }

    /**
     * Record bulk creation session
     */
    recordBulkSession(sessionId, tasks, results) {
        const session = {
            id: sessionId,
            timestamp: Date.now(),
            org: this.targetOrg,
            totalTasks: tasks.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            taskHashes: tasks.map(t => this.generateTaskHash(t))
        };

        this.history.sessions.push(session);

        // Keep only last 100 sessions
        if (this.history.sessions.length > 100) {
            this.history.sessions = this.history.sessions.slice(-100);
        }

        this.saveHistory();
    }

    /**
     * Get deduplicated task list
     */
    async deduplicateTasks(tasks, options = {}) {
        console.log(`\n🔄 Deduplicating ${tasks.length} tasks...`);

        // Check for exact duplicates within the batch
        const uniqueMap = new Map();
        const internalDuplicates = [];

        for (const task of tasks) {
            const hash = this.generateTaskHash(task);
            if (uniqueMap.has(hash)) {
                internalDuplicates.push(task);
            } else {
                uniqueMap.set(hash, task);
            }
        }

        if (internalDuplicates.length > 0) {
            console.log(`📋 Removed ${internalDuplicates.length} duplicates within batch`);
        }

        const uniqueTasks = Array.from(uniqueMap.values());

        // Check against recent history
        const recentlyCreated = this.checkRecentCreation(uniqueTasks);
        const recentHashes = new Set(recentlyCreated.map(r => r.hash));

        // Check against Salesforce
        let existingDuplicates = [];
        if (!options.skipSalesforceCheck) {
            existingDuplicates = await this.checkExistingDuplicates(
                uniqueTasks.filter(t => !recentHashes.has(this.generateTaskHash(t))),
                options
            );
        }

        // Filter out all duplicates
        const duplicateHashes = new Set([
            ...recentHashes,
            ...existingDuplicates.map(d => d.hash)
        ]);

        const finalTasks = uniqueTasks.filter(task =>
            !duplicateHashes.has(this.generateTaskHash(task))
        );

        const summary = {
            original: tasks.length,
            internalDuplicates: internalDuplicates.length,
            recentDuplicates: recentlyCreated.length,
            existingDuplicates: existingDuplicates.length,
            final: finalTasks.length,
            removed: tasks.length - finalTasks.length
        };

        console.log('\n📊 Deduplication Summary:');
        console.log(`  Original tasks: ${summary.original}`);
        console.log(`  Internal duplicates: ${summary.internalDuplicates}`);
        console.log(`  Recently created: ${summary.recentDuplicates}`);
        console.log(`  Existing in Salesforce: ${summary.existingDuplicates}`);
        console.log(`  ✅ Tasks to create: ${summary.final}`);

        return {
            tasks: finalTasks,
            summary: summary,
            duplicates: {
                internal: internalDuplicates,
                recent: recentlyCreated,
                existing: existingDuplicates
            }
        };
    }

    /**
     * Cleanup old entries from history
     */
    cleanupOldEntries() {
        const cutoff = Date.now() - (7 * 24 * 3600000); // 7 days
        let removed = 0;

        // Remove old task entries
        Object.keys(this.history.tasks).forEach(hash => {
            if (this.history.tasks[hash].timestamp < cutoff) {
                delete this.history.tasks[hash];
                removed++;
            }
        });

        // Remove old sessions
        this.history.sessions = this.history.sessions.filter(s => s.timestamp >= cutoff);

        this.history.lastCleanup = Date.now();

        if (removed > 0) {
            console.log(`🧹 Cleaned up ${removed} old history entries`);
            this.saveHistory();
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}

// CLI interface for testing
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node task-duplicate-preventer.js <command> <target-org> [options]

Commands:
  check <csv-file>     Check CSV file for duplicates
  clean <csv-file>     Remove duplicates and output clean CSV
  history              Show creation history
  clear                Clear history cache

Examples:
  node task-duplicate-preventer.js check tasks.csv myorg
  node task-duplicate-preventer.js clean tasks.csv myorg > clean-tasks.csv
  node task-duplicate-preventer.js history myorg
        `);
        process.exit(1);
    }

    const command = args[0];
    const targetOrg = args[1];

    const preventer = new TaskDuplicatePreventer(targetOrg);

    switch (command) {
        case 'history':
            console.log('📜 Creation History:');
            console.log(`  Total tasks tracked: ${Object.keys(preventer.history.tasks).length}`);
            console.log(`  Sessions recorded: ${preventer.history.sessions.length}`);

            if (preventer.history.sessions.length > 0) {
                const recent = preventer.history.sessions.slice(-5);
                console.log('\n  Recent sessions:');
                recent.forEach(s => {
                    const date = new Date(s.timestamp).toLocaleString();
                    console.log(`    ${date}: ${s.successful}/${s.totalTasks} tasks created`);
                });
            }
            break;

        case 'clear':
            fs.rmSync(preventer.cacheDir, { recursive: true, force: true });
            console.log('✅ History cache cleared');
            break;

        default:
            console.log('❌ Unknown command:', command);
            process.exit(1);
    }
}

module.exports = TaskDuplicatePreventer;