/**
 * CheckpointManager.js
 *
 * Manages deployment checkpoints for rollback support. Captures pre-deployment
 * state, stores rollback data, and orchestrates rollback operations.
 *
 * @module solution-template-system/tracking/CheckpointManager
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Checkpoint manager for rollback support
 */
class CheckpointManager {
  constructor(options = {}) {
    this.options = {
      checkpointsDir: options.checkpointsDir || './solutions/checkpoints',
      maxCheckpoints: options.maxCheckpoints || 10,
      retentionDays: options.retentionDays || 30,
      compressOld: options.compressOld || true,
      verbose: options.verbose || false,
      ...options
    };

    this.activeCheckpoints = new Map();
  }

  /**
   * Create a new checkpoint before deployment
   * @param {Object} deployment - Deployment context
   * @param {Array} components - Components being deployed
   * @returns {Object} Checkpoint record
   */
  async createCheckpoint(deployment, components) {
    const checkpointId = this.generateCheckpointId();

    const checkpoint = {
      id: checkpointId,
      deploymentId: deployment.id,
      solution: deployment.solution,
      environment: deployment.environment,
      createdAt: new Date().toISOString(),
      status: 'capturing',
      components: [],
      metadata: {
        componentCount: components.length,
        platforms: [...new Set(components.map(c => c.type.split(':')[0]))]
      }
    };

    // Capture pre-deployment state for each component
    for (const component of components) {
      try {
        const componentState = await this.captureComponentState(component, deployment);
        checkpoint.components.push(componentState);
      } catch (error) {
        this.log(`Warning: Could not capture state for ${component.id}: ${error.message}`);
        checkpoint.components.push({
          id: component.id,
          type: component.type,
          captureStatus: 'failed',
          error: error.message
        });
      }
    }

    checkpoint.status = 'ready';
    checkpoint.captureCompletedAt = new Date().toISOString();

    // Save checkpoint
    await this.saveCheckpoint(checkpoint);

    // Track active checkpoint
    this.activeCheckpoints.set(checkpointId, checkpoint);

    // Clean old checkpoints
    await this.cleanOldCheckpoints();

    return checkpoint;
  }

  /**
   * Capture pre-deployment state of a component
   * @param {Object} component - Component to capture
   * @param {Object} deployment - Deployment context
   * @returns {Object} Component state
   */
  async captureComponentState(component, deployment) {
    const [platform, metadataType] = component.type.split(':');

    const state = {
      id: component.id,
      type: component.type,
      platform,
      metadataType,
      capturedAt: new Date().toISOString(),
      exists: false,
      previousContent: null,
      previousMetadata: null
    };

    // Platform-specific state capture
    if (platform === 'salesforce') {
      const sfState = await this.captureSalesforceState(component, metadataType, deployment);
      Object.assign(state, sfState);
    } else if (platform === 'hubspot') {
      const hsState = await this.captureHubSpotState(component, metadataType, deployment);
      Object.assign(state, hsState);
    } else if (platform === 'n8n') {
      const n8nState = await this.captureN8nState(component, metadataType, deployment);
      Object.assign(state, n8nState);
    }

    state.captureStatus = 'success';
    return state;
  }

  /**
   * Capture Salesforce component state
   * @param {Object} component - Component
   * @param {string} metadataType - Metadata type
   * @param {Object} deployment - Deployment context
   * @returns {Object} Captured state
   */
  async captureSalesforceState(component, metadataType, deployment) {
    // In production, this would use SalesforceDeployer.retrieve()
    // For now, record metadata that would be captured
    return {
      platform: 'salesforce',
      exists: false, // Would be determined by actual query
      wasActive: false, // For flows
      previousVersion: null,
      metadata: {
        orgAlias: deployment.environment?.credentials?.salesforce?.orgAlias,
        metadataType,
        captureMethod: 'metadata_api'
      }
    };
  }

  /**
   * Capture HubSpot component state
   * @param {Object} component - Component
   * @param {string} metadataType - Metadata type
   * @param {Object} deployment - Deployment context
   * @returns {Object} Captured state
   */
  async captureHubSpotState(component, metadataType, deployment) {
    return {
      platform: 'hubspot',
      exists: false,
      wasEnabled: false, // For workflows
      previousVersion: null,
      metadata: {
        portalId: deployment.environment?.credentials?.hubspot?.portalId,
        metadataType,
        captureMethod: 'hubspot_api'
      }
    };
  }

  /**
   * Capture n8n component state
   * @param {Object} component - Component
   * @param {string} metadataType - Metadata type
   * @param {Object} deployment - Deployment context
   * @returns {Object} Captured state
   */
  async captureN8nState(component, metadataType, deployment) {
    return {
      platform: 'n8n',
      exists: false,
      wasActive: false,
      previousVersion: null,
      metadata: {
        baseUrl: deployment.environment?.credentials?.n8n?.baseUrl,
        metadataType,
        captureMethod: 'n8n_api'
      }
    };
  }

  /**
   * Execute rollback to checkpoint
   * @param {string} checkpointId - Checkpoint ID
   * @param {Object} options - Rollback options
   * @returns {Object} Rollback result
   */
  async rollback(checkpointId, options = {}) {
    const checkpoint = await this.loadCheckpoint(checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    if (checkpoint.status !== 'ready') {
      throw new Error(`Checkpoint not ready for rollback: ${checkpoint.status}`);
    }

    const rollbackResult = {
      checkpointId,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      components: [],
      errors: []
    };

    // Mark checkpoint as rolling back
    checkpoint.status = 'rolling_back';
    await this.saveCheckpoint(checkpoint);

    // Rollback each component in reverse order
    const reversedComponents = [...checkpoint.components].reverse();

    for (const componentState of reversedComponents) {
      try {
        const result = await this.rollbackComponent(componentState, options);
        rollbackResult.components.push({
          id: componentState.id,
          status: result.success ? 'rolled_back' : 'failed',
          details: result
        });
      } catch (error) {
        rollbackResult.errors.push({
          component: componentState.id,
          error: error.message
        });

        if (!options.continueOnError) {
          rollbackResult.status = 'failed';
          break;
        }
      }
    }

    // Update checkpoint status
    checkpoint.status = rollbackResult.errors.length === 0 ? 'rolled_back' : 'rollback_failed';
    checkpoint.rollbackCompletedAt = new Date().toISOString();
    checkpoint.rollbackResult = rollbackResult;
    await this.saveCheckpoint(checkpoint);

    // Update result
    rollbackResult.completedAt = new Date().toISOString();
    rollbackResult.status = rollbackResult.errors.length === 0 ? 'success' : 'partial';

    return rollbackResult;
  }

  /**
   * Rollback a single component
   * @param {Object} componentState - Component's pre-deployment state
   * @param {Object} options - Rollback options
   * @returns {Object} Rollback result
   */
  async rollbackComponent(componentState, options = {}) {
    const { platform, id, exists, previousContent } = componentState;

    this.log(`Rolling back component: ${id} (${platform})`);

    if (!exists) {
      // Component didn't exist before - need to delete it
      return this.deleteComponent(componentState, options);
    } else if (previousContent) {
      // Restore previous content
      return this.restoreComponent(componentState, options);
    } else {
      // No previous content captured - can't rollback
      return {
        success: false,
        action: 'skipped',
        reason: 'No previous state captured'
      };
    }
  }

  /**
   * Delete a component that was newly created
   * @param {Object} componentState - Component state
   * @param {Object} options - Options
   * @returns {Object} Deletion result
   */
  async deleteComponent(componentState, options = {}) {
    // In production, this would call the appropriate deployer's delete method
    this.log(`Would delete: ${componentState.id} (${componentState.platform})`);

    return {
      success: true,
      action: 'delete',
      component: componentState.id,
      simulated: !options.execute
    };
  }

  /**
   * Restore a component to its previous state
   * @param {Object} componentState - Component state with previous content
   * @param {Object} options - Options
   * @returns {Object} Restoration result
   */
  async restoreComponent(componentState, options = {}) {
    // In production, this would deploy the previous content
    this.log(`Would restore: ${componentState.id} (${componentState.platform})`);

    return {
      success: true,
      action: 'restore',
      component: componentState.id,
      simulated: !options.execute
    };
  }

  /**
   * Save checkpoint to disk
   * @param {Object} checkpoint - Checkpoint to save
   */
  async saveCheckpoint(checkpoint) {
    if (!fs.existsSync(this.options.checkpointsDir)) {
      fs.mkdirSync(this.options.checkpointsDir, { recursive: true });
    }

    const checkpointPath = path.join(
      this.options.checkpointsDir,
      `${checkpoint.id}.json`
    );

    fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

    // Update index
    await this.updateCheckpointIndex(checkpoint);
  }

  /**
   * Load checkpoint from disk
   * @param {string} checkpointId - Checkpoint ID
   * @returns {Object} Checkpoint or null
   */
  async loadCheckpoint(checkpointId) {
    // Check active cache first
    if (this.activeCheckpoints.has(checkpointId)) {
      return this.activeCheckpoints.get(checkpointId);
    }

    const checkpointPath = path.join(
      this.options.checkpointsDir,
      `${checkpointId}.json`
    );

    if (fs.existsSync(checkpointPath)) {
      const content = fs.readFileSync(checkpointPath, 'utf-8');
      return JSON.parse(content);
    }

    return null;
  }

  /**
   * Update checkpoint index for quick lookups
   * @param {Object} checkpoint - Checkpoint to index
   */
  async updateCheckpointIndex(checkpoint) {
    const indexPath = path.join(this.options.checkpointsDir, 'index.json');
    let index = { checkpoints: [] };

    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } catch {
        index = { checkpoints: [] };
      }
    }

    // Remove existing entry
    index.checkpoints = index.checkpoints.filter(c => c.id !== checkpoint.id);

    // Add updated entry
    index.checkpoints.unshift({
      id: checkpoint.id,
      deploymentId: checkpoint.deploymentId,
      solution: checkpoint.solution,
      environment: checkpoint.environment,
      createdAt: checkpoint.createdAt,
      status: checkpoint.status
    });

    // Keep only recent entries in index
    index.checkpoints = index.checkpoints.slice(0, this.options.maxCheckpoints * 2);

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * List available checkpoints
   * @param {Object} filters - Optional filters
   * @returns {Array} Checkpoint summaries
   */
  async listCheckpoints(filters = {}) {
    const indexPath = path.join(this.options.checkpointsDir, 'index.json');

    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    let checkpoints = index.checkpoints || [];

    // Apply filters
    if (filters.solution) {
      checkpoints = checkpoints.filter(c => c.solution === filters.solution);
    }

    if (filters.environment) {
      checkpoints = checkpoints.filter(c => c.environment === filters.environment);
    }

    if (filters.status) {
      checkpoints = checkpoints.filter(c => c.status === filters.status);
    }

    if (filters.limit) {
      checkpoints = checkpoints.slice(0, filters.limit);
    }

    return checkpoints;
  }

  /**
   * Get checkpoint for a deployment
   * @param {string} deploymentId - Deployment ID
   * @returns {Object} Checkpoint or null
   */
  async getCheckpointForDeployment(deploymentId) {
    const checkpoints = await this.listCheckpoints();
    const match = checkpoints.find(c => c.deploymentId === deploymentId);

    if (match) {
      return this.loadCheckpoint(match.id);
    }

    return null;
  }

  /**
   * Clean old checkpoints based on retention policy
   */
  async cleanOldCheckpoints() {
    const checkpoints = await this.listCheckpoints();

    // Keep only maxCheckpoints recent ones
    const toDelete = checkpoints.slice(this.options.maxCheckpoints);

    // Also check retention
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);

    for (const checkpoint of toDelete) {
      const createdDate = new Date(checkpoint.createdAt);

      if (createdDate < cutoffDate) {
        await this.deleteCheckpoint(checkpoint.id);
      }
    }
  }

  /**
   * Delete a checkpoint
   * @param {string} checkpointId - Checkpoint ID
   */
  async deleteCheckpoint(checkpointId) {
    const checkpointPath = path.join(
      this.options.checkpointsDir,
      `${checkpointId}.json`
    );

    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
      this.log(`Deleted checkpoint: ${checkpointId}`);
    }

    this.activeCheckpoints.delete(checkpointId);

    // Update index
    const indexPath = path.join(this.options.checkpointsDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      index.checkpoints = index.checkpoints.filter(c => c.id !== checkpointId);
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }
  }

  /**
   * Generate checkpoint report
   * @param {string} checkpointId - Checkpoint ID
   * @returns {string} Markdown report
   */
  async generateReport(checkpointId) {
    const checkpoint = await this.loadCheckpoint(checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const lines = [
      `# Checkpoint Report: ${checkpoint.id}`,
      '',
      '## Summary',
      '',
      `| Property | Value |`,
      `|----------|-------|`,
      `| Solution | ${checkpoint.solution} |`,
      `| Environment | ${checkpoint.environment} |`,
      `| Status | ${checkpoint.status} |`,
      `| Created | ${checkpoint.createdAt} |`,
      `| Components | ${checkpoint.components.length} |`,
      ''
    ];

    if (checkpoint.components.length > 0) {
      lines.push('## Components', '');
      lines.push('| Component | Type | Exists Before | Status |');
      lines.push('|-----------|------|---------------|--------|');

      for (const comp of checkpoint.components) {
        lines.push(
          `| ${comp.id} | ${comp.type} | ${comp.exists ? 'Yes' : 'No'} | ${comp.captureStatus} |`
        );
      }

      lines.push('');
    }

    if (checkpoint.rollbackResult) {
      lines.push('## Rollback Result', '');
      lines.push(`- Started: ${checkpoint.rollbackResult.startedAt}`);
      lines.push(`- Completed: ${checkpoint.rollbackResult.completedAt || 'N/A'}`);
      lines.push(`- Status: ${checkpoint.rollbackResult.status}`);
      lines.push(`- Components Rolled Back: ${checkpoint.rollbackResult.components?.length || 0}`);
      lines.push(`- Errors: ${checkpoint.rollbackResult.errors?.length || 0}`);
    }

    return lines.join('\n');
  }

  /**
   * Generate unique checkpoint ID
   * @returns {string} Checkpoint ID
   */
  generateCheckpointId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `chkpt-${timestamp}-${random}`;
  }

  /**
   * Log message if verbose mode enabled
   * @param {...any} args - Log arguments
   */
  log(...args) {
    if (this.options.verbose) {
      console.log('[CheckpointManager]', ...args);
    }
  }
}

module.exports = CheckpointManager;
