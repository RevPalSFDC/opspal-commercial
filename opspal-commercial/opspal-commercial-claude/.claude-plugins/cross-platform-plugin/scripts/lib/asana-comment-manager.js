#!/usr/bin/env node

/**
 * Asana Comment Manager
 *
 * Manages task comments (stories) with template support for standardized updates.
 *
 * Features:
 * - Post comments to tasks via POST /tasks/{id}/stories
 * - Template-based comments (completion, progress, blocker)
 * - Variable substitution in templates
 * - Comment formatting and validation
 * - Batch comment operations
 *
 * Usage:
 *   const AsanaCommentManager = require('./asana-comment-manager');
 *   const manager = new AsanaCommentManager();
 *
 *   // Post simple comment
 *   await manager.addComment(taskGid, 'Work completed successfully');
 *
 *   // Post using template
 *   await manager.addCommentFromTemplate(taskGid, 'completion', {
 *     date: '2025-10-26',
 *     summary: 'Implemented pricebook structure',
 *     accomplishment_1: 'Created 3 pricebooks'
 *   });
 *
 * API Reference:
 *   POST /tasks/{task_gid}/stories
 *   Body: { "data": { "text": "comment text" } }
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class AsanaCommentManager {
  constructor() {
    this.token = process.env.ASANA_ACCESS_TOKEN;

    if (!this.token) {
      throw new Error('ASANA_ACCESS_TOKEN environment variable is required');
    }

    // Template directory
    this.templateDir = path.join(__dirname, '../../templates/asana-comments');
  }

  /**
   * Make Asana API request
   */
  asanaRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'app.asana.com',
        path: `/api/1.0${path}`,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed.data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      if (data) req.write(JSON.stringify({ data }));
      req.end();
    });
  }

  /**
   * Load template file
   * @param {string} templateName - Template name (completion, progress, blocker)
   * @returns {string} Template content
   */
  loadTemplate(templateName) {
    const templatePath = path.join(this.templateDir, `${templateName}-comment.md`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    return fs.readFileSync(templatePath, 'utf8');
  }

  /**
   * Substitute variables in template
   * @param {string} template - Template content
   * @param {Object} variables - Variable substitutions
   * @returns {string} Template with substitutions
   */
  substituteVariables(template, variables) {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || '');
    }

    // Remove any remaining unsubstituted placeholders
    result = result.replace(/{{[^}]+}}/g, '[NOT PROVIDED]');

    return result;
  }

  /**
   * Extract example from template (remove example section before posting)
   * @param {string} template - Template content
   * @returns {string} Template without example
   */
  removeExample(template) {
    // Remove everything after "---" which marks the example section
    const parts = template.split('---');
    if (parts.length > 1) {
      return parts[0].trim();
    }
    return template;
  }

  /**
   * Add comment to task
   * @param {string} taskGid - Task GID
   * @param {string} text - Comment text
   * @param {boolean} isPinned - Pin comment (default false)
   * @returns {Promise<Object>} Created story object
   */
  async addComment(taskGid, text, isPinned = false) {
    if (!text || text.trim().length === 0) {
      throw new Error('Comment text cannot be empty');
    }

    console.log(`💬 Adding comment to task ${taskGid}...`);

    try {
      const storyData = {
        text: text.trim()
      };

      if (isPinned) {
        storyData.is_pinned = true;
      }

      const story = await this.asanaRequest(
        'POST',
        `/tasks/${taskGid}/stories`,
        storyData
      );

      console.log(`✅ Comment posted successfully (${story.gid})`);
      return story;
    } catch (error) {
      console.error(`❌ Error adding comment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add comment using template
   * @param {string} taskGid - Task GID
   * @param {string} templateName - Template name (completion, progress, blocker)
   * @param {Object} variables - Variable substitutions
   * @param {boolean} isPinned - Pin comment (default false)
   * @returns {Promise<Object>} Created story object
   */
  async addCommentFromTemplate(taskGid, templateName, variables = {}, isPinned = false) {
    console.log(`📝 Preparing ${templateName} comment for task ${taskGid}...`);

    try {
      // Load template
      const template = this.loadTemplate(templateName);

      // Remove example section
      const templateWithoutExample = this.removeExample(template);

      // Substitute variables
      const text = this.substituteVariables(templateWithoutExample, variables);

      // Post comment
      return await this.addComment(taskGid, text, isPinned);
    } catch (error) {
      console.error(`❌ Error using template: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add completion comment
   * @param {string} taskGid - Task GID
   * @param {Object} data - Completion data
   * @returns {Promise<Object>} Created story object
   */
  async addCompletionComment(taskGid, data) {
    const variables = {
      date: new Date().toISOString().split('T')[0],
      summary: data.summary || '',
      accomplishment_1: data.accomplishments?.[0] || '',
      accomplishment_2: data.accomplishments?.[1] || '',
      accomplishment_3: data.accomplishments?.[2] || '',
      metric_1: data.metrics?.[0] || '',
      metric_2: data.metrics?.[1] || '',
      metric_3: data.metrics?.[2] || '',
      deliverable_1: data.deliverables?.[0] || '',
      deliverable_2: data.deliverables?.[1] || '',
      location_or_link_1: data.locations?.[0] || '',
      location_or_link_2: data.locations?.[1] || '',
      verification_step_1: data.verificationSteps?.[0] || '',
      verification_step_2: data.verificationSteps?.[1] || '',
      verification_step_3: data.verificationSteps?.[2] || '',
      additional_context_or_lessons_learned: data.notes || ''
    };

    return await this.addCommentFromTemplate(taskGid, 'completion', variables, false);
  }

  /**
   * Add progress comment
   * @param {string} taskGid - Task GID
   * @param {Object} data - Progress data
   * @returns {Promise<Object>} Created story object
   */
  async addProgressComment(taskGid, data) {
    const variables = {
      date: new Date().toISOString().split('T')[0],
      percentage: data.percentage || '0',
      completed_item_1: data.completed?.[0] || '',
      completed_item_2: data.completed?.[1] || '',
      metric_1: data.completedMetrics?.[0] || '',
      metric_2: data.completedMetrics?.[1] || '',
      current_work_1: data.currentWork?.[0] || '',
      current_work_2: data.currentWork?.[1] || '',
      progress_indicator_1: data.progressIndicators?.[0] || '',
      progress_indicator_2: data.progressIndicators?.[1] || '',
      next_step_1: data.nextSteps?.[0] || '',
      next_step_2: data.nextSteps?.[1] || '',
      time_estimate_1: data.timeEstimates?.[0] || '',
      time_estimate_2: data.timeEstimates?.[1] || '',
      expected_date: data.expectedDate || '',
      blockers_or_none: data.blockers || 'None'
    };

    return await this.addCommentFromTemplate(taskGid, 'progress', variables, false);
  }

  /**
   * Add blocker comment
   * @param {string} taskGid - Task GID
   * @param {Object} data - Blocker data
   * @returns {Promise<Object>} Created story object
   */
  async addBlockerComment(taskGid, data) {
    const variables = {
      date: new Date().toISOString().split('T')[0],
      clear_description_of_blocker: data.description || '',
      impact_on_timeline: data.timelineImpact || '',
      what_is_blocked: data.scopeImpact || '',
      what_else_is_affected: data.downstreamImpact || '',
      why_this_is_blocking_work: data.rootCause || '',
      specific_action_required: data.actionNeeded || '',
      person_who_can_unblock: data.assignee || '',
      deadline_for_resolution: data.deadline || '',
      temporary_workaround_if_available_or_none: data.workaround || 'None',
      what_can_continue_in_parallel: data.progressWhileBlocked || 'None'
    };

    return await this.addCommentFromTemplate(taskGid, 'blocker', variables, true);
  }

  /**
   * Get comments for a task
   * @param {string} taskGid - Task GID
   * @returns {Promise<Array>} Array of story objects
   */
  async getTaskComments(taskGid) {
    try {
      const stories = await this.asanaRequest('GET', `/tasks/${taskGid}/stories`);

      // Filter to just comment stories (not system stories)
      const comments = stories.filter(story => story.type === 'comment');

      return comments;
    } catch (error) {
      console.error(`❌ Error fetching comments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Batch add comments to multiple tasks
   * @param {Array<Object>} tasks - Array of {taskGid, text} or {taskGid, template, variables}
   * @param {number} delayMs - Delay between requests (default 500ms)
   * @returns {Promise<Object>} Batch results
   */
  async batchAddComments(tasks, delayMs = 500) {
    console.log(`\n🔄 Batch adding comments to ${tasks.length} tasks...\n`);

    const results = {
      total: tasks.length,
      successful: 0,
      failed: 0,
      details: []
    };

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      console.log(`\n[${i + 1}/${tasks.length}] Processing task ${task.taskGid}...`);

      try {
        let result;

        if (task.text) {
          // Direct text comment
          result = await this.addComment(task.taskGid, task.text, task.isPinned);
        } else if (task.template) {
          // Template-based comment
          result = await this.addCommentFromTemplate(
            task.taskGid,
            task.template,
            task.variables || {},
            task.isPinned
          );
        } else {
          throw new Error('Either text or template must be provided');
        }

        results.successful++;
        results.details.push({ success: true, taskGid: task.taskGid, storyGid: result.gid });

        // Rate limiting delay
        if (i < tasks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        results.failed++;
        results.details.push({
          success: false,
          taskGid: task.taskGid,
          error: error.message
        });
      }
    }

    console.log(`\n📊 Batch Summary:`);
    console.log(`   Total: ${results.total}`);
    console.log(`   ✅ Successful: ${results.successful}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log('');

    return results;
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const taskGid = process.argv[3];
  const text = process.argv[4];

  const manager = new AsanaCommentManager();

  (async () => {
    try {
      switch (command) {
        case 'add':
          if (!taskGid || !text) {
            console.error('Usage: node asana-comment-manager.js add <taskGid> <text>');
            process.exit(1);
          }
          await manager.addComment(taskGid, text);
          break;

        case 'list':
          if (!taskGid) {
            console.error('Usage: node asana-comment-manager.js list <taskGid>');
            process.exit(1);
          }
          const comments = await manager.getTaskComments(taskGid);
          console.log(`\n💬 Task ${taskGid} has ${comments.length} comments:\n`);
          comments.forEach((comment, i) => {
            console.log(`${i + 1}. [${comment.created_at}] ${comment.created_by.name}:`);
            console.log(`   ${comment.text.substring(0, 100)}${comment.text.length > 100 ? '...' : ''}`);
            console.log('');
          });
          break;

        case 'templates':
          console.log('\n📋 Available Templates:\n');
          console.log('1. completion - Task completion with deliverables and verification');
          console.log('2. progress - Progress update with metrics and next steps');
          console.log('3. blocker - Blocker notification with impact and resolution needs');
          console.log('');
          console.log('Template Location:', manager.templateDir);
          console.log('');
          break;

        default:
          console.log('Asana Comment Manager\n');
          console.log('Usage:');
          console.log('  node asana-comment-manager.js add <taskGid> <text>');
          console.log('  node asana-comment-manager.js list <taskGid>');
          console.log('  node asana-comment-manager.js templates');
          console.log('');
          console.log('Examples:');
          console.log('  node asana-comment-manager.js add 1234567890 "Work completed"');
          console.log('  node asana-comment-manager.js list 1234567890');
          console.log('  node asana-comment-manager.js templates');
          process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = AsanaCommentManager;
