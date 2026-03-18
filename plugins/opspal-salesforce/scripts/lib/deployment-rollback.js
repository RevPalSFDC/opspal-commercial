#!/usr/bin/env node

/**
 * Deployment Rollback Manager
 * Handles automatic rollback on deployment failures
 *
 * Security enhancements (2026-01-31):
 * - Pre-flight validation of rollback metadata
 * - Dry-run capability before actual deployment
 * - File locking to prevent race conditions
 * - Input validation for deployment IDs and org aliases
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Simple file-based lock to prevent concurrent operations
 */
class FileLock {
    constructor(lockPath) {
        this.lockPath = lockPath;
        this.locked = false;
    }

    acquire(timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            try {
                // O_EXCL flag ensures atomic creation - fails if file exists
                fs.writeFileSync(this.lockPath, process.pid.toString(), { flag: 'wx' });
                this.locked = true;
                return true;
            } catch (e) {
                if (e.code === 'EEXIST') {
                    // Check if lock is stale (older than 60 seconds)
                    try {
                        const stat = fs.statSync(this.lockPath);
                        if (Date.now() - stat.mtimeMs > 60000) {
                            fs.unlinkSync(this.lockPath);
                            continue;
                        }
                    } catch (statErr) {
                        // Lock file disappeared, retry
                        continue;
                    }
                    // Wait and retry
                    const waitMs = 100 + Math.random() * 100;
                    const waitUntil = Date.now() + waitMs;
                    while (Date.now() < waitUntil) { /* busy wait */ }
                } else {
                    throw e;
                }
            }
        }
        return false;
    }

    release() {
        if (this.locked) {
            try {
                fs.unlinkSync(this.lockPath);
            } catch (e) {
                // Ignore if already deleted
            }
            this.locked = false;
        }
    }
}

/**
 * Input validation patterns
 */
const SAFE_PATTERNS = {
    deploymentId: /^[a-zA-Z0-9_-]{1,64}$/,
    orgAlias: /^[a-zA-Z0-9_-]{1,64}$/
};

function validateInput(value, type) {
    if (!value || typeof value !== 'string') return false;
    const pattern = SAFE_PATTERNS[type];
    return pattern ? pattern.test(value) : false;
}

function getPlaybookVersion(playbookPath) {
    try {
        const repoRoot = path.resolve(__dirname, '..', '..');
        // Use execFileSync to prevent command injection
        const output = execFileSync('git', [
            '-C', repoRoot,
            'log', '-1',
            '--pretty=format:%h',
            '--', playbookPath
        ], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        return output || 'untracked';
    } catch (error) {
        return 'unknown';
    }
}

function logPlaybookUsage() {
    const version = getPlaybookVersion('docs/playbooks/deployment-rollback.md');
    console.log(`📘 Playbook: docs/playbooks/deployment-rollback.md (version: ${version})`);
}

class DeploymentRollback {
    constructor(options = {}) {
        this.org = options.org || process.env.SF_TARGET_ORG;
        this.rollbackDir = options.rollbackDir || '.rollback';
        this.historyFile = path.join(this.rollbackDir, 'deployment-history.json');
        if (options.logPlaybook !== false) {
            logPlaybookUsage();
        }
    }

    createSnapshot(deploymentId) {
        // Create backup before deployment
        if (!fs.existsSync(this.rollbackDir)) {
            fs.mkdirSync(this.rollbackDir, { recursive: true });
        }
        
        const snapshot = {
            id: deploymentId,
            timestamp: new Date().toISOString(),
            org: this.org,
            metadata: this.retrieveCurrentMetadata(),
            status: 'pending'
        };
        
        this.saveSnapshot(snapshot);
        return snapshot;
    }

    /**
     * Validate that rollback metadata exists and is well-formed
     */
    validateRollbackPayload(rollbackPath) {
        // Check path exists
        if (!fs.existsSync(rollbackPath)) {
            return { valid: false, error: `Rollback path does not exist: ${rollbackPath}` };
        }

        const stat = fs.statSync(rollbackPath);
        if (!stat.isDirectory()) {
            return { valid: false, error: `Rollback path is not a directory: ${rollbackPath}` };
        }

        // Check for package.xml or sfdx-project.json
        const packageXml = path.join(rollbackPath, 'package.xml');
        const sfdxProject = path.join(rollbackPath, 'sfdx-project.json');
        const manifestDir = path.join(rollbackPath, 'main', 'default');

        if (!fs.existsSync(packageXml) && !fs.existsSync(sfdxProject) && !fs.existsSync(manifestDir)) {
            return { valid: false, error: 'No valid Salesforce metadata structure found (missing package.xml, sfdx-project.json, or source directory)' };
        }

        // Check for at least one metadata file
        const files = this.findMetadataFiles(rollbackPath);
        if (files.length === 0) {
            return { valid: false, error: 'No metadata files found in rollback payload' };
        }

        return { valid: true, fileCount: files.length };
    }

    /**
     * Find metadata files recursively
     */
    findMetadataFiles(dir, files = []) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                this.findMetadataFiles(fullPath, files);
            } else if (entry.name.endsWith('-meta.xml') || entry.name.endsWith('.cls') || entry.name.endsWith('.trigger')) {
                files.push(fullPath);
            }
        }
        return files;
    }

    /**
     * Execute dry-run validation deployment
     */
    executeDryRun(rollbackPath) {
        if (!validateInput(this.org, 'orgAlias')) {
            return { success: false, error: `Invalid org alias: ${this.org}` };
        }

        try {
            // Use --dry-run flag to validate without deploying
            const result = execFileSync('sf', [
                'project', 'deploy', 'validate',
                '--source-dir', rollbackPath,
                '--target-org', this.org,
                '--json'
            ], { encoding: 'utf8' });

            const parsed = JSON.parse(result);
            return {
                success: parsed.status === 0 || parsed.result?.success === true,
                result: parsed
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                output: error.stdout || error.stderr
            };
        }
    }

    executeRollback(deploymentId, options = {}) {
        // Validate deployment ID
        if (!validateInput(deploymentId, 'deploymentId')) {
            throw new Error(`Invalid deployment ID format: ${deploymentId}`);
        }

        // Validate org alias
        if (!validateInput(this.org, 'orgAlias')) {
            throw new Error(`Invalid org alias format: ${this.org}`);
        }

        const snapshot = this.loadSnapshot(deploymentId);
        if (!snapshot) {
            throw new Error(`No snapshot found for deployment ${deploymentId}`);
        }

        const rollbackPath = path.join(this.rollbackDir, deploymentId);

        // STEP 1: Validate rollback payload exists and is valid
        const validation = this.validateRollbackPayload(rollbackPath);
        if (!validation.valid) {
            throw new Error(`Rollback validation failed: ${validation.error}`);
        }
        console.log(`✅ Rollback payload validated: ${validation.fileCount} metadata files`);

        // STEP 2: Execute dry-run to catch errors before actual deployment
        if (options.skipDryRun !== true) {
            console.log('🔍 Executing dry-run validation...');
            const dryRun = this.executeDryRun(rollbackPath);
            if (!dryRun.success) {
                throw new Error(`Rollback dry-run failed: ${dryRun.error || 'Validation errors detected'}`);
            }
            console.log('✅ Dry-run validation passed');
        }

        // STEP 3: Execute actual rollback deployment using execFileSync (prevents command injection)
        try {
            execFileSync('sf', [
                'project', 'deploy', 'start',
                '--source-dir', rollbackPath,
                '--target-org', this.org
            ], { stdio: 'inherit' });

            snapshot.rollback = {
                status: 'success',
                timestamp: new Date().toISOString(),
                fileCount: validation.fileCount
            };
            this.saveSnapshot(snapshot);
            return true;
        } catch (error) {
            snapshot.rollback = {
                status: 'failed',
                error: error.message,
                timestamp: new Date().toISOString()
            };
            this.saveSnapshot(snapshot);
            throw error;
        }
    }

    retrieveCurrentMetadata() {
        // Simplified - would retrieve actual metadata
        return {
            retrievedAt: new Date().toISOString()
        };
    }

    saveSnapshot(snapshot) {
        // Use file locking to prevent race conditions
        const lockPath = this.historyFile + '.lock';
        const lock = new FileLock(lockPath);

        if (!lock.acquire(10000)) {
            throw new Error('Could not acquire lock for snapshot save - another operation in progress');
        }

        try {
            const history = this.loadHistory();
            history[snapshot.id] = snapshot;
            // Write to temp file first, then rename (atomic operation)
            const tempFile = this.historyFile + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(history, null, 2));
            fs.renameSync(tempFile, this.historyFile);
        } finally {
            lock.release();
        }
    }

    loadSnapshot(deploymentId) {
        const history = this.loadHistory();
        return history[deploymentId];
    }

    loadHistory() {
        if (fs.existsSync(this.historyFile)) {
            return JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        }
        return {};
    }
}

module.exports = DeploymentRollback;
