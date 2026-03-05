#!/usr/bin/env node

/**
 * Asana Roadmap Manager
 *
 * Breaks down projects into trackable subtasks, manages progress, and generates
 * milestone summaries. Implements the "Project-as-Roadmap" pattern from the
 * Asana Agent Playbook.
 *
 * Part of the Asana Agent Integration Playbook.
 *
 * @see ../../docs/ASANA_AGENT_PLAYBOOK.md
 */

const https = require('https');
const { AsanaUpdateFormatter } = require('./asana-update-formatter');

class AsanaRoadmapManager {
  constructor(accessToken) {
    if (!accessToken) {
      throw new Error('ASANA_ACCESS_TOKEN is required');
    }
    this.accessToken = accessToken;
    this.formatter = new AsanaUpdateFormatter();
  }

  /**
   * Create roadmap from project description
   *
   * @param {object} config - Roadmap configuration
   * @param {string} config.parentTaskId - Parent task GID
   * @param {string} config.projectId - Project GID
   * @param {array} config.phases - List of phases with steps
   * @param {object} config.options - Additional options
   * @returns {Promise<object>} - Created roadmap structure
   */
  async createRoadmap(config) {
    const { parentTaskId, projectId, phases, options = {} } = config;

    // Create subtasks for each phase
    const roadmap = {
      parentTaskId,
      projectId,
      phases: [],
      totalSteps: 0
    };

    for (const [phaseIndex, phase] of phases.entries()) {
      const phaseData = {
        name: phase.name,
        index: phaseIndex,
        steps: []
      };

      // Create subtasks for each step in the phase
      for (const [stepIndex, step] of phase.steps.entries()) {
        const subtask = await this._createSubtask({
          parent: parentTaskId,
          name: `${phase.name}: ${step.title}`,
          notes: step.description || '',
          custom_fields: {
            estimated_hours: step.effort || 0,
            phase: phase.name,
            step_number: stepIndex + 1
          },
          due_on: this._calculateDueDate(step.effort, phaseIndex, stepIndex)
        });

        phaseData.steps.push({
          taskId: subtask.gid,
          title: step.title,
          effort: step.effort,
          url: subtask.permalink_url
        });

        roadmap.totalSteps++;
      }

      roadmap.phases.push(phaseData);
    }

    // Post roadmap summary to parent task
    if (options.postSummary !== false) {
      const summary = this._generateRoadmapSummary(roadmap);
      await this._addComment(parentTaskId, summary);
    }

    return roadmap;
  }

  /**
   * Track progress of roadmap
   *
   * @param {string} parentTaskId - Parent task GID
   * @returns {Promise<object>} - Progress summary
   */
  async trackProgress(parentTaskId) {
    // Get all subtasks
    const subtasks = await this._getSubtasks(parentTaskId);

    // Calculate progress
    const total = subtasks.length;
    const completed = subtasks.filter(st => st.completed).length;
    const inProgress = subtasks.filter(st => !st.completed && st.assignee).length;
    const notStarted = total - completed - inProgress;

    const progress = {
      total,
      completed,
      inProgress,
      notStarted,
      percentage: Math.round((completed / total) * 100),
      subtasks: subtasks.map(st => ({
        id: st.gid,
        name: st.name,
        completed: st.completed,
        assignee: st.assignee ? st.assignee.name : null
      }))
    };

    return progress;
  }

  /**
   * Complete subtask and update parent
   *
   * @param {string} subtaskId - Subtask GID
   * @param {string} parentTaskId - Parent task GID
   * @param {object} results - Results from completed subtask
   * @returns {Promise<object>} - Updated progress
   */
  async completeSubtask(subtaskId, parentTaskId, results = {}) {
    // 1. Mark subtask complete
    await this._updateTask(subtaskId, { completed: true });

    // 2. Get updated progress
    const progress = await this.trackProgress(parentTaskId);

    // 3. Get subtask details
    const subtask = await this._getTask(subtaskId);

    // 4. Post checkpoint to parent
    const checkpoint = this._formatCheckpoint(subtask, progress, results);
    await this._addComment(parentTaskId, checkpoint);

    // 5. Update parent progress field
    await this._updateTask(parentTaskId, {
      custom_fields: {
        progress_percentage: progress.percentage
      }
    });

    return progress;
  }

  /**
   * Generate milestone update for phase completion
   *
   * @param {string} parentTaskId - Parent task GID
   * @param {object} phaseData - Phase completion data
   * @returns {Promise<object>} - Milestone update
   */
  async completeMilestone(parentTaskId, phaseData) {
    // Get current progress
    const progress = await this.trackProgress(parentTaskId);

    // Format milestone update
    const milestone = this.formatter.formatMilestone({
      phaseName: phaseData.phaseName,
      summary: phaseData.summary,
      achievements: phaseData.achievements,
      stats: phaseData.stats,
      nextPhase: phaseData.nextPhase,
      risks: phaseData.risks || ['None identified']
    });

    // Post to parent task
    await this._addComment(parentTaskId, milestone.text);

    // Update custom fields
    await this._updateTask(parentTaskId, {
      custom_fields: {
        current_phase: phaseData.nextPhase ? phaseData.nextPhase.name : 'Complete',
        progress_percentage: progress.percentage
      }
    });

    return {
      milestoneUpdate: milestone,
      progress
    };
  }

  /**
   * Update running summary
   *
   * @param {string} parentTaskId - Parent task GID
   * @returns {Promise<string>} - Summary text
   */
  async updateRunningSummary(parentTaskId) {
    const progress = await this.trackProgress(parentTaskId);
    const subtasks = progress.subtasks;

    const summary = `
**Project Status:** ${progress.completed}/${progress.total} tasks complete (${progress.percentage}%)

**Recent Completions:**
${this._getRecentCompletions(subtasks, 3).map(st => `- ✅ ${st.name}`).join('\n')}

**In Progress:**
${this._getInProgress(subtasks).map(st => `- 🔄 ${st.name}${st.assignee ? ` (@${st.assignee})` : ''}`).join('\n')}

**Next Up:**
${this._getUpcoming(subtasks, 2).map(st => `- ⏳ ${st.name}`).join('\n')}

**Last Updated:** ${new Date().toISOString().split('T')[0]}
    `.trim();

    // Update custom field or post as comment
    await this._updateTask(parentTaskId, {
      custom_fields: {
        latest_status: summary
      }
    });

    return summary;
  }

  /**
   * Get recent completions
   */
  _getRecentCompletions(subtasks, limit = 3) {
    return subtasks
      .filter(st => st.completed)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get in-progress tasks
   */
  _getInProgress(subtasks) {
    return subtasks.filter(st => !st.completed && st.assignee);
  }

  /**
   * Get upcoming tasks
   */
  _getUpcoming(subtasks, limit = 2) {
    return subtasks
      .filter(st => !st.completed && !st.assignee)
      .slice(0, limit);
  }

  /**
   * Generate roadmap summary
   */
  _generateRoadmapSummary(roadmap) {
    let summary = `**Project Roadmap Created**\n\n`;
    summary += `**Total Phases:** ${roadmap.phases.length}\n`;
    summary += `**Total Steps:** ${roadmap.totalSteps}\n\n`;

    for (const phase of roadmap.phases) {
      summary += `**Phase ${phase.index + 1}: ${phase.name}**\n`;
      for (const step of phase.steps) {
        summary += `- ${step.title} (${step.effort || 0} hours)\n`;
      }
      summary += `\n`;
    }

    summary += `**Estimated Total Effort:** ${this._calculateTotalEffort(roadmap)} hours`;

    return summary;
  }

  /**
   * Format checkpoint update
   */
  _formatCheckpoint(subtask, progress, results) {
    let checkpoint = `**Checkpoint:** ${subtask.name} Complete (${progress.completed}/${progress.total} - ${progress.percentage}%)\n\n`;

    if (results.findings && results.findings.length > 0) {
      checkpoint += `**Key Findings:**\n`;
      for (const finding of results.findings.slice(0, 3)) {
        checkpoint += `- ${finding}\n`;
      }
      checkpoint += `\n`;
    }

    if (results.impact) {
      checkpoint += `**Impact:** ${results.impact}\n\n`;
    }

    checkpoint += `**Next:** ${this._getNextStepName(progress.subtasks)}`;

    return checkpoint;
  }

  /**
   * Get next step name
   */
  _getNextStepName(subtasks) {
    const next = subtasks.find(st => !st.completed);
    return next ? next.name : 'All tasks complete';
  }

  /**
   * Calculate total effort across roadmap
   */
  _calculateTotalEffort(roadmap) {
    return roadmap.phases.reduce((total, phase) => {
      return total + phase.steps.reduce((phaseTotal, step) => {
        return phaseTotal + (step.effort || 0);
      }, 0);
    }, 0);
  }

  /**
   * Calculate due date based on effort and phase
   */
  _calculateDueDate(effort, phaseIndex, stepIndex) {
    const today = new Date();
    const baseOffset = (phaseIndex * 7) + (stepIndex * 2); // Weeks for phase, days for step
    const effortOffset = Math.ceil(effort / 8); // 1 day per 8 hours

    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + baseOffset + effortOffset);

    return dueDate.toISOString().split('T')[0];
  }

  /**
   * Create subtask
   */
  async _createSubtask(taskData) {
    return this._asanaRequest('POST', '/tasks', taskData);
  }

  /**
   * Get subtasks for parent task
   */
  async _getSubtasks(parentTaskId) {
    return this._asanaRequest('GET', `/tasks/${parentTaskId}/subtasks?opt_fields=gid,name,completed,assignee.name`);
  }

  /**
   * Get task
   */
  async _getTask(taskId) {
    return this._asanaRequest('GET', `/tasks/${taskId}?opt_fields=*`);
  }

  /**
   * Update task
   */
  async _updateTask(taskId, updates) {
    return this._asanaRequest('PUT', `/tasks/${taskId}`, updates);
  }

  /**
   * Add comment to task
   */
  async _addComment(taskId, text) {
    return this._asanaRequest('POST', `/tasks/${taskId}/stories`, {
      text
    });
  }

  /**
   * Make request to Asana API
   */
  async _asanaRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'app.asana.com',
        port: 443,
        path: `/api/1.0${path}`,
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed.data);
            } else {
              reject(new Error(`Asana API error (${res.statusCode}): ${JSON.stringify(parsed)}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${responseData}`));
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify({ data }));
      }

      req.end();
    });
  }
}

// Export for use in other scripts
module.exports = { AsanaRoadmapManager };

// CLI usage
if (require.main === module) {
  const accessToken = process.env.ASANA_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('Error: ASANA_ACCESS_TOKEN environment variable not set');
    process.exit(1);
  }

  const manager = new AsanaRoadmapManager(accessToken);

  // Example: Create roadmap for a project
  console.log('=== Asana Roadmap Manager ===\n');
  console.log('Example: Creating roadmap for "Salesforce Dashboard Implementation"\n');

  const exampleRoadmap = {
    parentTaskId: process.argv[2] || 'EXAMPLE_TASK_ID',
    projectId: process.argv[3] || 'EXAMPLE_PROJECT_ID',
    phases: [
      {
        name: 'Requirements Gathering',
        steps: [
          { title: 'Interview stakeholders', description: 'Meet with exec team', effort: 2 },
          { title: 'Document KPI requirements', description: 'List all metrics', effort: 1 },
          { title: 'Design mockup', description: 'Create visual mockup', effort: 3 }
        ]
      },
      {
        name: 'Data Analysis',
        steps: [
          { title: 'Identify data sources', description: 'Map data sources', effort: 2 },
          { title: 'Validate data quality', description: 'Run quality checks', effort: 4 },
          { title: 'Create data model', description: 'Build data model', effort: 3 }
        ]
      },
      {
        name: 'Dashboard Development',
        steps: [
          { title: 'Build dashboard components', description: 'Create charts', effort: 8 },
          { title: 'Configure filters', description: 'Add interactivity', effort: 4 },
          { title: 'Test with sample data', description: 'Validate accuracy', effort: 2 }
        ]
      },
      {
        name: 'Deployment',
        steps: [
          { title: 'User acceptance testing', description: 'UAT with stakeholders', effort: 4 },
          { title: 'Training session', description: 'Train users', effort: 2 },
          { title: 'Production deployment', description: 'Deploy to prod', effort: 1 }
        ]
      }
    ],
    options: {
      postSummary: true
    }
  };

  if (process.argv[2] && process.argv[3]) {
    // If task and project IDs provided, create actual roadmap
    manager.createRoadmap(exampleRoadmap)
      .then(roadmap => {
        console.log('✅ Roadmap created successfully\n');
        console.log(`Phases: ${roadmap.phases.length}`);
        console.log(`Total Steps: ${roadmap.totalSteps}`);
        console.log(`\nPhase Breakdown:`);
        for (const phase of roadmap.phases) {
          console.log(`\n${phase.name}:`);
          for (const step of phase.steps) {
            console.log(`  - ${step.title} (${step.effort}h): ${step.url}`);
          }
        }
      })
      .catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
      });
  } else {
    // Show example structure
    console.log('Example roadmap structure:');
    console.log(JSON.stringify(exampleRoadmap, null, 2));
    console.log('\nTo create actual roadmap:');
    console.log('  node asana-roadmap-manager.js <parent-task-id> <project-id>');
  }
}
