#!/usr/bin/env node

/**
 * Asana Task Reader
 *
 * Parses Asana tasks into agent-friendly format for contextual understanding.
 * Extracts structured fields, parses descriptions, gets project context, and
 * identifies dependencies.
 *
 * Part of the Asana Agent Integration Playbook.
 *
 * @see ../../docs/ASANA_AGENT_PLAYBOOK.md
 */

const https = require('https');

class AsanaTaskReader {
  constructor(accessToken) {
    if (!accessToken) {
      throw new Error('ASANA_ACCESS_TOKEN is required');
    }
    this.accessToken = accessToken;
  }

  /**
   * Parse task into agent-friendly context
   *
   * @param {string} taskId - Asana task GID
   * @param {object} options - Parsing options
   * @param {boolean} options.includeComments - Include comment history
   * @param {boolean} options.includeProject - Include project context
   * @param {boolean} options.includeDependencies - Include blocking/blocked tasks
   * @returns {Promise<object>} - Parsed task context
   */
  async parseTask(taskId, options = {}) {
    const {
      includeComments = false,
      includeProject = false,
      includeDependencies = false
    } = options;

    // Get task details
    const task = await this._getTask(taskId);

    // Parse task
    const context = {
      taskId,
      fields: this._extractFields(task),
      description: this._parseDescription(task.notes || ''),
      instructions: this._extractInstructions(task.notes || ''),
      requirements: this._extractRequirements(task.notes || '')
    };

    // Optional: Get comments
    if (includeComments) {
      context.comments = await this._getComments(taskId);
      context.recentDecisions = this._extractDecisions(context.comments);
    }

    // Optional: Get project context
    if (includeProject && task.projects && task.projects.length > 0) {
      try {
        context.projectContext = await this._getProjectContext(task.projects[0].gid);
      } catch (error) {
        console.warn(`Warning: Could not get project context: ${error.message}`);
        context.projectContext = null;
      }
    }

    // Optional: Get dependencies
    if (includeDependencies) {
      context.dependencies = await this._getDependencies(taskId);
    }

    return context;
  }

  /**
   * Extract structured fields from task
   */
  _extractFields(task) {
    return {
      name: task.name,
      completed: task.completed,
      assignee: task.assignee ? task.assignee.name : null,
      assigneeEmail: task.assignee ? task.assignee.email : null,
      dueOn: task.due_on,
      dueAt: task.due_at,
      startOn: task.start_on,
      priority: this._extractPriority(task),
      status: this._extractStatus(task),
      tags: task.tags ? task.tags.map(t => t.name) : [],
      customFields: this._extractCustomFields(task.custom_fields || []),
      projects: (task.projects && Array.isArray(task.projects)) ? task.projects.map(p => ({ gid: p.gid, name: p.name || p.gid })) : [],
      parent: task.parent ? { gid: task.parent.gid, name: task.parent.name } : null,
      numSubtasks: task.num_subtasks || 0
    };
  }

  /**
   * Parse description into sections
   */
  _parseDescription(notes) {
    if (!notes) return { raw: '', sections: {} };

    const sections = {};
    const lines = notes.split('\n');
    let currentSection = 'intro';
    let currentContent = [];

    for (const line of lines) {
      // Check if line is a section header (## or **)
      const headerMatch = line.match(/^##\s+(.+)$/) || line.match(/^\*\*(.+)\*\*$/);

      if (headerMatch) {
        // Save previous section
        if (currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n').trim();
        }
        // Start new section
        currentSection = headerMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '_');
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n').trim();
    }

    return {
      raw: notes,
      sections
    };
  }

  /**
   * Extract work instructions from description
   */
  _extractInstructions(notes) {
    if (!notes) return [];

    const instructions = [];
    const lines = notes.split('\n');

    for (const line of lines) {
      // Look for numbered steps or bullet points
      const match = line.match(/^[\s]*(?:\d+\.|[-*])\s+(.+)$/);
      if (match) {
        instructions.push(match[1].trim());
      }
    }

    return instructions;
  }

  /**
   * Extract requirements and success criteria
   */
  _extractRequirements(notes) {
    if (!notes) return { requirements: [], successCriteria: [] };

    const requirements = [];
    const successCriteria = [];

    // Look for sections containing requirements
    const reqSection = this._findSection(notes, ['requirement', 'deliverable', 'must have']);
    if (reqSection) {
      requirements.push(...this._extractListItems(reqSection));
    }

    // Look for success criteria
    const successSection = this._findSection(notes, ['success', 'done when', 'completion criteria']);
    if (successSection) {
      successCriteria.push(...this._extractListItems(successSection));
    }

    return { requirements, successCriteria };
  }

  /**
   * Find section in notes by keywords
   */
  _findSection(notes, keywords) {
    const sections = this._parseDescription(notes).sections;

    for (const [key, content] of Object.entries(sections)) {
      for (const keyword of keywords) {
        if (key.includes(keyword)) {
          return content;
        }
      }
    }

    return null;
  }

  /**
   * Extract list items from text
   */
  _extractListItems(text) {
    if (!text) return [];

    const items = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const match = line.match(/^[\s]*(?:\d+\.|[-*]|✓|✅)\s+(.+)$/);
      if (match) {
        items.push(match[1].trim());
      }
    }

    return items;
  }

  /**
   * Extract priority from custom fields or tags
   */
  _extractPriority(task) {
    // Check custom fields first
    if (task.custom_fields) {
      const priorityField = task.custom_fields.find(f =>
        f.name && f.name.toLowerCase().includes('priority')
      );
      if (priorityField && priorityField.enum_value) {
        return priorityField.enum_value.name;
      }
    }

    // Check tags
    if (task.tags) {
      const priorityTag = task.tags.find(t =>
        t.name && (t.name.match(/^P[0-3]$/i) || t.name.toLowerCase().includes('priority'))
      );
      if (priorityTag) {
        return priorityTag.name;
      }
    }

    return 'Medium'; // Default
  }

  /**
   * Extract status from custom fields
   */
  _extractStatus(task) {
    if (task.completed) return 'Completed';

    if (task.custom_fields) {
      const statusField = task.custom_fields.find(f =>
        f.name && f.name.toLowerCase().includes('status')
      );
      if (statusField && statusField.enum_value) {
        return statusField.enum_value.name;
      }
    }

    return 'Not Started'; // Default
  }

  /**
   * Extract custom fields into key-value pairs
   */
  _extractCustomFields(customFields) {
    const fields = {};

    for (const field of customFields) {
      if (!field.name) continue;

      const key = field.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

      if (field.enum_value) {
        fields[key] = field.enum_value.name;
      } else if (field.number_value !== null && field.number_value !== undefined) {
        fields[key] = field.number_value;
      } else if (field.text_value) {
        fields[key] = field.text_value;
      } else if (field.date_value) {
        fields[key] = field.date_value;
      }
    }

    return fields;
  }

  /**
   * Get task comments
   */
  async _getComments(taskId) {
    const stories = await this._asanaRequest('GET', `/tasks/${taskId}/stories`);

    return stories
      .filter(s => s.type === 'comment' && s.text)
      .map(s => ({
        id: s.gid,
        text: s.text,
        createdAt: s.created_at,
        createdBy: s.created_by ? s.created_by.name : 'Unknown'
      }))
      .reverse(); // Most recent first
  }

  /**
   * Extract decisions from comments
   */
  _extractDecisions(comments) {
    if (!comments) return [];

    return comments
      .filter(c =>
        c.text.includes('DECISION:') ||
        c.text.includes('✅') ||
        c.text.includes('APPROVED')
      )
      .map(c => ({
        decision: c.text,
        decidedBy: c.createdBy,
        decidedAt: c.createdAt
      }));
  }

  /**
   * Get project context
   */
  async _getProjectContext(projectId) {
    const project = await this._asanaRequest('GET', `/projects/${projectId}`);

    return {
      name: project.name,
      notes: project.notes,
      owner: project.owner ? project.owner.name : null,
      team: project.team ? project.team.name : null,
      archived: project.archived,
      currentStatus: project.current_status ? project.current_status.text : null
    };
  }

  /**
   * Get task dependencies
   */
  async _getDependencies(taskId) {
    const task = await this._getTask(taskId);

    return {
      dependents: task.dependents || [],
      dependencies: task.dependencies || [],
      blocked_by: (task.dependencies || []).map(d => d.gid),
      blocking: (task.dependents || []).map(d => d.gid)
    };
  }

  /**
   * Get task from Asana API
   */
  async _getTask(taskId) {
    return this._asanaRequest('GET', `/tasks/${taskId}?opt_fields=*`);
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
module.exports = { AsanaTaskReader };

// CLI usage
if (require.main === module) {
  const taskId = process.argv[2];
  const accessToken = process.env.ASANA_ACCESS_TOKEN;

  if (!taskId) {
    console.error('Usage: node asana-task-reader.js <task-id>');
    process.exit(1);
  }

  if (!accessToken) {
    console.error('Error: ASANA_ACCESS_TOKEN environment variable not set');
    process.exit(1);
  }

  const reader = new AsanaTaskReader(accessToken);

  reader.parseTask(taskId, {
    includeComments: true,
    includeProject: true,
    includeDependencies: true
  })
    .then(context => {
      console.log(JSON.stringify(context, null, 2));
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
