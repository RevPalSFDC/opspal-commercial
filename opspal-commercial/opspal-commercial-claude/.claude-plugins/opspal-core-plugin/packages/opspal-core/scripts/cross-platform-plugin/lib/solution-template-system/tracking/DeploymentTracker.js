/**
 * DeploymentTracker.js
 *
 * Tracks deployment history, status, and metrics across solution deployments.
 * Provides querying, analytics, and audit trail capabilities.
 *
 * @module solution-template-system/tracking/DeploymentTracker
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Deployment history tracker
 */
class DeploymentTracker {
  constructor(options = {}) {
    this.options = {
      storageDir: options.storageDir || './solutions/deployments',
      historyFile: options.historyFile || 'deployment-history.json',
      maxHistoryEntries: options.maxHistoryEntries || 1000,
      retentionDays: options.retentionDays || 90,
      ...options
    };

    this.history = [];
    this.initialized = false;
  }

  /**
   * Initialize tracker and load existing history
   */
  async initialize() {
    if (this.initialized) return;

    // Ensure storage directory exists
    if (!fs.existsSync(this.options.storageDir)) {
      fs.mkdirSync(this.options.storageDir, { recursive: true });
    }

    // Load existing history
    await this.loadHistory();

    this.initialized = true;
  }

  /**
   * Record a new deployment
   * @param {Object} deployment - Deployment details
   * @returns {Object} Recorded deployment with ID
   */
  async recordDeployment(deployment) {
    await this.initialize();

    const record = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      status: 'in_progress',
      ...deployment,
      phases: [],
      metrics: {
        startTime: Date.now(),
        endTime: null,
        duration: null,
        componentsAttempted: 0,
        componentsSucceeded: 0,
        componentsFailed: 0
      }
    };

    this.history.unshift(record);
    await this.saveHistory();

    return record;
  }

  /**
   * Update deployment status
   * @param {string} deploymentId - Deployment ID
   * @param {Object} update - Status update
   * @returns {Object} Updated deployment
   */
  async updateDeployment(deploymentId, update) {
    await this.initialize();

    const deployment = this.history.find(d => d.id === deploymentId);

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    // Merge update
    Object.assign(deployment, update);

    // Update timestamps
    deployment.lastUpdated = new Date().toISOString();

    if (update.status === 'success' || update.status === 'failed') {
      deployment.metrics.endTime = Date.now();
      deployment.metrics.duration = deployment.metrics.endTime - deployment.metrics.startTime;
    }

    await this.saveHistory();

    return deployment;
  }

  /**
   * Record a deployment phase completion
   * @param {string} deploymentId - Deployment ID
   * @param {Object} phase - Phase details
   */
  async recordPhase(deploymentId, phase) {
    await this.initialize();

    const deployment = this.history.find(d => d.id === deploymentId);

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    deployment.phases.push({
      name: phase.name,
      status: phase.status,
      startTime: phase.startTime,
      endTime: phase.endTime || new Date().toISOString(),
      components: phase.components || [],
      errors: phase.errors || []
    });

    // Update metrics
    if (phase.components) {
      deployment.metrics.componentsAttempted += phase.components.length;
      deployment.metrics.componentsSucceeded += phase.components.filter(
        c => c.status === 'success'
      ).length;
      deployment.metrics.componentsFailed += phase.components.filter(
        c => c.status === 'failed'
      ).length;
    }

    await this.saveHistory();
  }

  /**
   * Mark deployment as completed
   * @param {string} deploymentId - Deployment ID
   * @param {string} status - Final status
   * @param {Object} summary - Deployment summary
   */
  async completeDeployment(deploymentId, status, summary = {}) {
    return this.updateDeployment(deploymentId, {
      status,
      summary,
      completedAt: new Date().toISOString()
    });
  }

  /**
   * Get deployment by ID
   * @param {string} deploymentId - Deployment ID
   * @returns {Object} Deployment record
   */
  async getDeployment(deploymentId) {
    await this.initialize();
    return this.history.find(d => d.id === deploymentId);
  }

  /**
   * Query deployments with filters
   * @param {Object} filters - Query filters
   * @returns {Array} Matching deployments
   */
  async queryDeployments(filters = {}) {
    await this.initialize();

    let results = [...this.history];

    // Filter by solution
    if (filters.solution) {
      results = results.filter(d => d.solution === filters.solution);
    }

    // Filter by environment
    if (filters.environment) {
      results = results.filter(d => d.environment === filters.environment);
    }

    // Filter by status
    if (filters.status) {
      results = results.filter(d => d.status === filters.status);
    }

    // Filter by date range
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      results = results.filter(d => new Date(d.timestamp) >= start);
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      results = results.filter(d => new Date(d.timestamp) <= end);
    }

    // Filter by user
    if (filters.user) {
      results = results.filter(d => d.user === filters.user);
    }

    // Apply limit
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * Get deployment statistics
   * @param {Object} filters - Filter criteria
   * @returns {Object} Statistics summary
   */
  async getStatistics(filters = {}) {
    const deployments = await this.queryDeployments(filters);

    const stats = {
      total: deployments.length,
      byStatus: {
        success: 0,
        failed: 0,
        in_progress: 0,
        rolled_back: 0
      },
      bySolution: {},
      byEnvironment: {},
      averageDuration: 0,
      totalComponentsDeployed: 0,
      successRate: 0
    };

    let totalDuration = 0;
    let durationsCount = 0;

    for (const deployment of deployments) {
      // Count by status
      stats.byStatus[deployment.status] = (stats.byStatus[deployment.status] || 0) + 1;

      // Count by solution
      stats.bySolution[deployment.solution] = (stats.bySolution[deployment.solution] || 0) + 1;

      // Count by environment
      stats.byEnvironment[deployment.environment] =
        (stats.byEnvironment[deployment.environment] || 0) + 1;

      // Track duration
      if (deployment.metrics?.duration) {
        totalDuration += deployment.metrics.duration;
        durationsCount++;
      }

      // Track components
      stats.totalComponentsDeployed += deployment.metrics?.componentsSucceeded || 0;
    }

    // Calculate averages
    stats.averageDuration = durationsCount > 0
      ? Math.round(totalDuration / durationsCount)
      : 0;

    stats.successRate = stats.total > 0
      ? Math.round((stats.byStatus.success / stats.total) * 100)
      : 0;

    return stats;
  }

  /**
   * Get recent deployments for a solution
   * @param {string} solutionName - Solution name
   * @param {number} limit - Number of results
   * @returns {Array} Recent deployments
   */
  async getRecentDeployments(solutionName, limit = 10) {
    return this.queryDeployments({
      solution: solutionName,
      limit
    });
  }

  /**
   * Get deployment timeline
   * @param {string} deploymentId - Deployment ID
   * @returns {Array} Timeline events
   */
  async getDeploymentTimeline(deploymentId) {
    const deployment = await this.getDeployment(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const timeline = [];

    // Add start event
    timeline.push({
      time: deployment.timestamp,
      event: 'deployment_started',
      details: {
        solution: deployment.solution,
        environment: deployment.environment
      }
    });

    // Add phase events
    for (const phase of deployment.phases || []) {
      timeline.push({
        time: phase.startTime,
        event: 'phase_started',
        details: { name: phase.name }
      });

      if (phase.endTime) {
        timeline.push({
          time: phase.endTime,
          event: phase.status === 'success' ? 'phase_completed' : 'phase_failed',
          details: {
            name: phase.name,
            components: phase.components?.length || 0,
            errors: phase.errors?.length || 0
          }
        });
      }
    }

    // Add completion event
    if (deployment.completedAt) {
      timeline.push({
        time: deployment.completedAt,
        event: deployment.status === 'success' ? 'deployment_completed' : 'deployment_failed',
        details: deployment.summary || {}
      });
    }

    // Sort by time
    timeline.sort((a, b) => new Date(a.time) - new Date(b.time));

    return timeline;
  }

  /**
   * Export deployment report
   * @param {string} deploymentId - Deployment ID
   * @param {string} format - Output format (json, markdown)
   * @returns {string} Formatted report
   */
  async exportReport(deploymentId, format = 'json') {
    const deployment = await this.getDeployment(deploymentId);

    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    if (format === 'markdown') {
      return this.formatMarkdownReport(deployment);
    }

    return JSON.stringify(deployment, null, 2);
  }

  /**
   * Format deployment as Markdown report
   * @param {Object} deployment - Deployment record
   * @returns {string} Markdown report
   */
  formatMarkdownReport(deployment) {
    const lines = [
      `# Deployment Report: ${deployment.id}`,
      '',
      '## Summary',
      '',
      `| Property | Value |`,
      `|----------|-------|`,
      `| Solution | ${deployment.solution} |`,
      `| Version | ${deployment.version || 'N/A'} |`,
      `| Environment | ${deployment.environment} |`,
      `| Status | ${deployment.status} |`,
      `| Started | ${deployment.timestamp} |`,
      `| Duration | ${this.formatDuration(deployment.metrics?.duration)} |`,
      '',
      '## Metrics',
      '',
      `- Components Attempted: ${deployment.metrics?.componentsAttempted || 0}`,
      `- Components Succeeded: ${deployment.metrics?.componentsSucceeded || 0}`,
      `- Components Failed: ${deployment.metrics?.componentsFailed || 0}`,
      ''
    ];

    if (deployment.phases?.length > 0) {
      lines.push('## Phases', '');

      for (const phase of deployment.phases) {
        lines.push(`### ${phase.name}`);
        lines.push(`- Status: ${phase.status}`);
        lines.push(`- Components: ${phase.components?.length || 0}`);

        if (phase.errors?.length > 0) {
          lines.push('- Errors:');
          for (const error of phase.errors) {
            lines.push(`  - ${error.message || error}`);
          }
        }

        lines.push('');
      }
    }

    if (deployment.summary) {
      lines.push('## Summary Notes', '', deployment.summary.notes || '');
    }

    return lines.join('\n');
  }

  /**
   * Clean old deployments based on retention policy
   */
  async cleanOldDeployments() {
    await this.initialize();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);

    const originalCount = this.history.length;

    this.history = this.history.filter(d => {
      const deployDate = new Date(d.timestamp);
      return deployDate >= cutoffDate;
    });

    // Also trim to max entries
    if (this.history.length > this.options.maxHistoryEntries) {
      this.history = this.history.slice(0, this.options.maxHistoryEntries);
    }

    const removedCount = originalCount - this.history.length;

    if (removedCount > 0) {
      await this.saveHistory();
    }

    return { removed: removedCount };
  }

  /**
   * Load history from file
   */
  async loadHistory() {
    const historyPath = path.join(this.options.storageDir, this.options.historyFile);

    if (fs.existsSync(historyPath)) {
      try {
        const content = fs.readFileSync(historyPath, 'utf-8');
        this.history = JSON.parse(content);
      } catch (error) {
        console.warn(`Failed to load deployment history: ${error.message}`);
        this.history = [];
      }
    }
  }

  /**
   * Save history to file
   */
  async saveHistory() {
    const historyPath = path.join(this.options.storageDir, this.options.historyFile);

    fs.writeFileSync(historyPath, JSON.stringify(this.history, null, 2));

    // Also save individual deployment files for easy access
    for (const deployment of this.history.slice(0, 10)) {
      const deploymentPath = path.join(this.options.storageDir, `${deployment.id}.json`);
      fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    }
  }

  /**
   * Generate unique deployment ID
   * @returns {string} Deployment ID
   */
  generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `deploy-${timestamp}-${random}`;
  }

  /**
   * Format duration in human-readable format
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    if (!ms) return 'N/A';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

module.exports = DeploymentTracker;
