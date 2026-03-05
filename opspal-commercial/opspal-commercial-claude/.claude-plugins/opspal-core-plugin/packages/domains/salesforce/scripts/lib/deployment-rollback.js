#!/usr/bin/env node

/**
 * Deployment Rollback Manager
 * Handles automatic rollback on deployment failures
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getPlaybookVersion(playbookPath) {
    try {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const output = execSync(`git -C "${repoRoot}" log -1 --pretty=format:%h -- "${playbookPath}"`, {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
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

    executeRollback(deploymentId) {
        const snapshot = this.loadSnapshot(deploymentId);
        if (!snapshot) {
            throw new Error(`No snapshot found for deployment ${deploymentId}`);
        }
        
        // Deploy previous version
        const rollbackPath = path.join(this.rollbackDir, deploymentId);
        const cmd = `sf project deploy start -p ${rollbackPath} -u ${this.org}`;
        
        try {
            execSync(cmd, { stdio: 'inherit' });
            snapshot.rollback = {
                status: 'success',
                timestamp: new Date().toISOString()
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
        const history = this.loadHistory();
        history[snapshot.id] = snapshot;
        fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
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
