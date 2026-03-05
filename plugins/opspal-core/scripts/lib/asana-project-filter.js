#!/usr/bin/env node

/**
 * Asana Project Filter
 *
 * Prevents workspace-scoped search results from leaking across projects.
 *
 * Problem: Asana's `sections_any` search parameter is workspace-scoped,
 * NOT project-scoped. When you search by section GIDs, tasks from ANY
 * project containing sections with those GIDs will be returned — not just
 * tasks from the intended project. This caused incorrect recommendations
 * in client assessments (e.g., Peregrine/Cadmium/Filmhub tasks appearing
 * in Aspire project results).
 *
 * Solution: This utility post-filters search results by verifying each
 * task's project membership via the REST API, and provides a convenience
 * wrapper that combines `sections_any` + `projects_any` with post-filter
 * as a safety net.
 *
 * Usage:
 *   const AsanaProjectFilter = require('./asana-project-filter');
 *   const filter = new AsanaProjectFilter();
 *
 *   // Post-filter tasks to a specific project
 *   const result = await filter.filterByProject(tasks, projectGid);
 *
 *   // Safe search combining sections_any + projects_any + post-filter
 *   const tasks = await filter.searchTasksInProjectSections(projectGid, sectionGids, searchOpts);
 *
 *   // Single-task membership check
 *   const isMember = await filter.verifyTaskProjectMembership(taskGid, projectGid);
 *
 * CLI:
 *   node asana-project-filter.js --project <gid> --tasks <gid1,gid2,...>
 *
 * See: docs/ASANA_API_GOTCHAS.md (GOTCHA-001)
 *
 * API Reference:
 *   GET /tasks/{gid}?opt_fields=memberships.project.gid,name
 */

const https = require('https');

class AsanaProjectFilter {
  constructor(workspaceId = null) {
    this.workspaceId = workspaceId || process.env.ASANA_WORKSPACE_ID || 'REDACTED_WORKSPACE_ID';
    this.token = process.env.ASANA_ACCESS_TOKEN;

    if (!this.token) {
      throw new Error('ASANA_ACCESS_TOKEN environment variable is required');
    }
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
   * Fetch task details with membership info in batches of 25
   * Uses GET /tasks/{gid}?opt_fields=memberships.project.gid,name
   * @param {Array<string>} taskGids - Task GIDs to fetch
   * @returns {Promise<Array<Object>>} Task objects with membership data
   */
  async fetchTaskMemberships(taskGids) {
    const results = [];
    const batchSize = 25;

    for (let i = 0; i < taskGids.length; i += batchSize) {
      const batch = taskGids.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(gid =>
          this.asanaRequest('GET', `/tasks/${gid}?opt_fields=memberships.project.gid,name`)
            .catch(err => {
              console.warn(`  Warning: Could not fetch task ${gid}: ${err.message}`);
              return null;
            })
        )
      );

      results.push(...batchResults.filter(r => r !== null));

      // Rate limiting between batches
      if (i + batchSize < taskGids.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return results;
  }

  /**
   * Filter tasks to only those belonging to a specific project.
   *
   * For each task, verifies memberships[].project.gid === projectGid.
   * Batch-fetches membership data in groups of 25 via REST API.
   *
   * @param {Array<Object>} tasks - Tasks from search results (must have .gid property)
   * @param {string} projectGid - Target project GID to filter by
   * @param {Object} opts - Options
   * @param {boolean} opts.verbose - Log details about excluded tasks (default: true)
   * @returns {Promise<Object>} { filtered, excluded, stats }
   */
  async filterByProject(tasks, projectGid, opts = {}) {
    const { verbose = true } = opts;

    if (!tasks || tasks.length === 0) {
      return { filtered: [], excluded: [], stats: { total: 0, kept: 0, removed: 0 } };
    }

    if (!projectGid) {
      throw new Error('projectGid is required');
    }

    const taskGids = tasks.map(t => t.gid).filter(Boolean);

    if (verbose) {
      console.log(`Verifying project membership for ${taskGids.length} tasks against project ${projectGid}...`);
    }

    const tasksWithMemberships = await this.fetchTaskMemberships(taskGids);

    // Build lookup: gid -> project membership status
    const membershipMap = new Map();
    for (const task of tasksWithMemberships) {
      const memberships = task.memberships || [];
      const projectGids = memberships.map(m => m.project?.gid).filter(Boolean);
      membershipMap.set(task.gid, {
        name: task.name,
        isMember: projectGids.includes(projectGid),
        projects: projectGids
      });
    }

    const filtered = [];
    const excluded = [];

    for (const task of tasks) {
      const info = membershipMap.get(task.gid);
      if (info && info.isMember) {
        filtered.push(task);
      } else {
        excluded.push({
          ...task,
          _exclusionReason: info
            ? `Task belongs to projects [${info.projects.join(', ')}], not ${projectGid}`
            : 'Could not verify membership'
        });
      }
    }

    if (excluded.length > 0 && verbose) {
      console.warn(`\nWARNING: ${excluded.length} task(s) excluded — not members of project ${projectGid}:`);
      for (const task of excluded) {
        const info = membershipMap.get(task.gid);
        console.warn(`  - ${task.gid} "${info?.name || task.name || 'unknown'}": ${task._exclusionReason}`);
      }
    }

    const stats = {
      total: tasks.length,
      kept: filtered.length,
      removed: excluded.length
    };

    if (verbose) {
      console.log(`\nFilter result: ${stats.kept} kept, ${stats.removed} excluded out of ${stats.total} total`);
    }

    return { filtered, excluded, stats };
  }

  /**
   * Search tasks within a project's sections with built-in safety filtering.
   *
   * Combines `sections_any` AND `projects_any` in the search call, then
   * post-filters as a safeguard against workspace-scoped leakage.
   *
   * @param {string} projectGid - Target project GID
   * @param {Array<string>|string} sectionGids - Section GID(s) to search
   * @param {Object} searchOpts - Additional search parameters (text, completed, etc.)
   * @returns {Promise<Object>} { tasks, stats }
   */
  async searchTasksInProjectSections(projectGid, sectionGids, searchOpts = {}) {
    const sectionsParam = Array.isArray(sectionGids) ? sectionGids.join(',') : sectionGids;

    console.log(`Searching tasks in project ${projectGid}, sections: ${sectionsParam}`);

    // Build search params with BOTH sections_any AND projects_any
    const searchParams = {
      workspace: this.workspaceId,
      sections_any: sectionsParam,
      projects_any: projectGid,
      ...searchOpts
    };

    // Execute search via MCP tool or REST API
    const rawTasks = await this.asanaRequest('GET',
      `/workspaces/${this.workspaceId}/tasks/search?` +
      Object.entries(searchParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&') +
      '&opt_fields=gid,name,completed,due_on'
    );

    const tasks = Array.isArray(rawTasks) ? rawTasks : [];

    // Post-filter as safety net
    const { filtered, excluded, stats } = await this.filterByProject(tasks, projectGid, { verbose: true });

    if (excluded.length > 0) {
      console.warn(
        `GOTCHA-001: sections_any returned ${excluded.length} task(s) from other projects despite projects_any filter. ` +
        `These have been excluded. See docs/ASANA_API_GOTCHAS.md for details.`
      );
    }

    return { tasks: filtered, stats };
  }

  /**
   * Verify a single task's project membership.
   *
   * @param {string} taskGid - Task GID to check
   * @param {string} projectGid - Project GID to verify against
   * @returns {Promise<boolean>} true if task belongs to project
   */
  async verifyTaskProjectMembership(taskGid, projectGid) {
    try {
      const task = await this.asanaRequest('GET', `/tasks/${taskGid}?opt_fields=memberships.project.gid`);
      const memberships = task.memberships || [];
      return memberships.some(m => m.project?.gid === projectGid);
    } catch (error) {
      console.error(`Error verifying membership for task ${taskGid}: ${error.message}`);
      return false;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      flags.project = args[++i];
    } else if (args[i] === '--tasks' && args[i + 1]) {
      flags.tasks = args[++i].split(',').map(s => s.trim());
    } else if (args[i] === '--sections' && args[i + 1]) {
      flags.sections = args[++i].split(',').map(s => s.trim());
    } else if (args[i] === '--help' || args[i] === '-h') {
      flags.help = true;
    }
  }

  if (flags.help || (!flags.project)) {
    console.log('Asana Project Filter');
    console.log('');
    console.log('Prevents workspace-scoped section searches from returning tasks');
    console.log('from unrelated projects. See docs/ASANA_API_GOTCHAS.md (GOTCHA-001).');
    console.log('');
    console.log('Usage:');
    console.log('  node asana-project-filter.js --project <gid> --tasks <gid1,gid2,...>');
    console.log('  node asana-project-filter.js --project <gid> --sections <gid1,gid2,...>');
    console.log('');
    console.log('Options:');
    console.log('  --project   Target project GID to filter by (required)');
    console.log('  --tasks     Comma-separated task GIDs to verify');
    console.log('  --sections  Comma-separated section GIDs to search within');
    console.log('');
    console.log('Examples:');
    console.log('  node asana-project-filter.js --project 1234567890123 --tasks 9876543210123,1111111111111');
    console.log('  node asana-project-filter.js --project 1234567890123 --sections 5555555555555,6666666666666');
    process.exit(flags.help ? 0 : 1);
  }

  const filter = new AsanaProjectFilter();

  (async () => {
    try {
      if (flags.tasks) {
        // Verify specific tasks against project
        const taskObjects = flags.tasks.map(gid => ({ gid }));
        const result = await filter.filterByProject(taskObjects, flags.project);

        console.log('\n--- Results ---');
        console.log(JSON.stringify(result.stats, null, 2));

        if (result.filtered.length > 0) {
          console.log('\nTasks IN project:');
          result.filtered.forEach(t => console.log(`  ${t.gid}`));
        }
        if (result.excluded.length > 0) {
          console.log('\nTasks NOT in project:');
          result.excluded.forEach(t => console.log(`  ${t.gid}: ${t._exclusionReason}`));
        }
      } else if (flags.sections) {
        // Search sections with project filter
        const result = await filter.searchTasksInProjectSections(flags.project, flags.sections);

        console.log('\n--- Results ---');
        console.log(`Found ${result.tasks.length} tasks in project sections`);
        console.log(JSON.stringify(result.stats, null, 2));

        result.tasks.forEach(t => {
          console.log(`  ${t.gid}: ${t.name}${t.completed ? ' (completed)' : ''}`);
        });
      }
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = AsanaProjectFilter;
