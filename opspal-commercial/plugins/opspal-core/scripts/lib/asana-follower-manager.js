#!/usr/bin/env node

/**
 * Asana Follower Manager
 *
 * Manages task followers (collaborators) for Asana tasks based on phase and task type.
 *
 * Features:
 * - Add followers to tasks via POST /tasks/{id}/addFollowers
 * - Determine stakeholders based on phase and task type
 * - Batch follower operations for performance
 * - Integration with AsanaUserManager for stakeholder GID lookup
 *
 * Usage:
 *   const AsanaFollowerManager = require('./asana-follower-manager');
 *   const manager = new AsanaFollowerManager();
 *
 *   // Add specific followers
 *   await manager.addFollowersToTask(taskGid, [userGid1, userGid2]);
 *
 *   // Add stakeholders based on phase/type
 *   await manager.addStakeholdersToTask(taskGid, 'foundation', 'data');
 *
 * API Reference:
 *   POST /tasks/{task_gid}/addFollowers
 *   Body: { "data": { "followers": ["userGid1", "userGid2"] } }
 */

const https = require('https');
const AsanaUserManager = require('./asana-user-manager');

class AsanaFollowerManager {
  constructor(workspaceId = null) {
    this.workspaceId = workspaceId || process.env.ASANA_WORKSPACE_ID;
    this.token = process.env.ASANA_ACCESS_TOKEN;

    if (!this.token) {
      throw new Error('ASANA_ACCESS_TOKEN environment variable is required');
    }

    // Initialize user manager for stakeholder lookup
    this.userManager = new AsanaUserManager(this.workspaceId);
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
   * Add followers to a task
   * @param {string} taskGid - Task GID
   * @param {Array<string>} followerGids - Array of user GIDs to add as followers
   * @returns {Promise<Object>} Updated task object
   */
  async addFollowersToTask(taskGid, followerGids) {
    if (!Array.isArray(followerGids) || followerGids.length === 0) {
      console.warn('⚠️  No followers provided');
      return null;
    }

    // Remove duplicates and filter out null/undefined
    const uniqueFollowers = [...new Set(followerGids.filter(gid => gid))];

    if (uniqueFollowers.length === 0) {
      console.warn('⚠️  No valid followers after filtering');
      return null;
    }

    try {
      console.log(`🔔 Adding ${uniqueFollowers.length} followers to task ${taskGid}...`);

      const result = await this.asanaRequest(
        'POST',
        `/tasks/${taskGid}/addFollowers`,
        { followers: uniqueFollowers }
      );

      console.log(`✅ Added followers successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Error adding followers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Determine stakeholders based on phase and task type
   * @param {string} phase - Phase name (e.g., 'foundation', 'configuration')
   * @param {string} taskType - Task type (e.g., 'data', 'functional', 'technical')
   * @returns {Object} Stakeholder information
   */
  determineStakeholders(phase, taskType) {
    // Get phase-specific stakeholders
    const phaseStakeholders = this.userManager.getPhaseStakeholders(phase);

    // Get task type-specific stakeholders
    const typeStakeholders = this.userManager.getTaskTypeStakeholders(taskType);

    // Combine and deduplicate
    const combined = [...new Set([...phaseStakeholders, ...typeStakeholders])];

    return {
      phase: phase,
      taskType: taskType,
      phaseStakeholders: phaseStakeholders,
      typeStakeholders: typeStakeholders,
      combined: combined,
      count: combined.length
    };
  }

  /**
   * Add stakeholders to task based on phase and task type
   * @param {string} taskGid - Task GID
   * @param {string} phase - Phase name
   * @param {string} taskType - Task type
   * @returns {Promise<Object>} Result with follower details
   */
  async addStakeholdersToTask(taskGid, phase, taskType) {
    console.log(`\n📋 Determining stakeholders for task ${taskGid}...`);
    console.log(`   Phase: ${phase}`);
    console.log(`   Type: ${taskType}`);

    const stakeholders = this.determineStakeholders(phase, taskType);

    console.log(`\n👥 Stakeholder Analysis:`);
    console.log(`   Phase stakeholders: ${stakeholders.phaseStakeholders.length}`);
    console.log(`   Type stakeholders: ${stakeholders.typeStakeholders.length}`);
    console.log(`   Total unique: ${stakeholders.combined.length}`);

    if (stakeholders.combined.length === 0) {
      console.warn('\n⚠️  No stakeholders configured for this phase/type combination');
      return { success: false, stakeholders, followers: [] };
    }

    try {
      const result = await this.addFollowersToTask(taskGid, stakeholders.combined);

      return {
        success: true,
        stakeholders,
        followers: stakeholders.combined,
        task: result
      };
    } catch (error) {
      console.error(`\n❌ Error adding stakeholders: ${error.message}`);
      return {
        success: false,
        stakeholders,
        followers: [],
        error: error.message
      };
    }
  }

  /**
   * Batch add followers to multiple tasks
   * @param {Array<Object>} tasks - Array of {taskGid, phase, taskType}
   * @param {number} delayMs - Delay between requests (default 500ms)
   * @returns {Promise<Object>} Batch results
   */
  async batchAddStakeholders(tasks, delayMs = 500) {
    console.log(`\n🔄 Batch adding stakeholders to ${tasks.length} tasks...\n`);

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
        const result = await this.addStakeholdersToTask(
          task.taskGid,
          task.phase,
          task.taskType
        );

        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
        }

        results.details.push(result);

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

  /**
   * Get current followers for a task
   * @param {string} taskGid - Task GID
   * @returns {Promise<Array>} Array of follower objects
   */
  async getTaskFollowers(taskGid) {
    try {
      const task = await this.asanaRequest('GET', `/tasks/${taskGid}?opt_fields=followers`);
      return task.followers || [];
    } catch (error) {
      console.error(`❌ Error fetching task followers: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove followers from a task
   * @param {string} taskGid - Task GID
   * @param {Array<string>} followerGids - Array of user GIDs to remove
   * @returns {Promise<Object>} Updated task object
   */
  async removeFollowersFromTask(taskGid, followerGids) {
    if (!Array.isArray(followerGids) || followerGids.length === 0) {
      console.warn('⚠️  No followers provided');
      return null;
    }

    try {
      console.log(`🔕 Removing ${followerGids.length} followers from task ${taskGid}...`);

      const result = await this.asanaRequest(
        'POST',
        `/tasks/${taskGid}/removeFollowers`,
        { followers: followerGids }
      );

      console.log(`✅ Removed followers successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Error removing followers: ${error.message}`);
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const taskGid = process.argv[3];
  const phase = process.argv[4];
  const taskType = process.argv[5];

  const manager = new AsanaFollowerManager();

  (async () => {
    try {
      switch (command) {
        case 'add':
          if (!taskGid || !phase || !taskType) {
            console.error('Usage: node asana-follower-manager.js add <taskGid> <phase> <taskType>');
            process.exit(1);
          }

          await manager.addStakeholdersToTask(taskGid, phase, taskType);
          break;

        case 'list':
          if (!taskGid) {
            console.error('Usage: node asana-follower-manager.js list <taskGid>');
            process.exit(1);
          }

          const followers = await manager.getTaskFollowers(taskGid);
          console.log(`\n👥 Task ${taskGid} has ${followers.length} followers:\n`);
          followers.forEach((follower, i) => {
            console.log(`${i + 1}. ${follower.name} (${follower.gid})`);
          });
          console.log('');
          break;

        case 'test':
          if (!phase || !taskType) {
            console.error('Usage: node asana-follower-manager.js test <phase> <taskType>');
            process.exit(1);
          }

          const stakeholders = manager.determineStakeholders(phase, taskType);
          console.log(`\n📋 Stakeholders for ${phase} / ${taskType}:`);
          console.log(`   Phase stakeholders: ${stakeholders.phaseStakeholders.length}`);
          console.log(`   Type stakeholders: ${stakeholders.typeStakeholders.length}`);
          console.log(`   Total unique: ${stakeholders.combined.length}`);
          console.log('\n   GIDs:', stakeholders.combined);
          console.log('');
          break;

        default:
          console.log('Asana Follower Manager\n');
          console.log('Usage:');
          console.log('  node asana-follower-manager.js add <taskGid> <phase> <taskType>');
          console.log('  node asana-follower-manager.js list <taskGid>');
          console.log('  node asana-follower-manager.js test <phase> <taskType>');
          console.log('');
          console.log('Examples:');
          console.log('  node asana-follower-manager.js add 1234567890 foundation data');
          console.log('  node asana-follower-manager.js list 1234567890');
          console.log('  node asana-follower-manager.js test configuration technical');
          process.exit(1);
      }
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = AsanaFollowerManager;
