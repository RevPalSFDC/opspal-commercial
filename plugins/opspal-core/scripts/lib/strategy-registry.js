#!/usr/bin/env node

/**
 * Skill Registry - ACE Framework Core Library
 *
 * Central registry for managing learned skills/strategies.
 * Part of the Agentic Context Engineering (ACE) implementation.
 *
 * Features:
 * - Register and retrieve skills
 * - Track skill execution outcomes
 * - Calculate confidence scores
 * - Find high-performing skills for transfer
 * - Query skills by category, agent, or relevance
 *
 * @version 1.0.0
 * @see https://github.com/kayba-ai/agentic-context-engine
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

class SkillRegistry {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;

    // Supabase connection from environment
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required');
    }

    this.log('SkillRegistry initialized', {
      url: this.supabaseUrl,
      dryRun: this.dryRun
    });
  }

  // ============================================================================
  // SKILL REGISTRATION
  // ============================================================================

  /**
   * Register a new skill or update existing one
   *
   * @param {Object} skillData
   * @param {string} skillData.name - Human-readable skill name
   * @param {string} [skillData.skillId] - Unique skill identifier (auto-generated if not provided)
   * @param {string} skillData.category - Category: 'assessment', 'deployment', 'validation', etc.
   * @param {string} [skillData.subcategory] - More specific classification
   * @param {string[]} [skillData.tags] - Searchable tags
   * @param {string} skillData.sourceAgent - Agent that originated this skill
   * @param {string} [skillData.sourceFile] - Original playbook/template path
   * @param {string} [skillData.sourceType] - 'playbook', 'context', 'shared', 'learned'
   * @param {Object} skillData.content - Skill content (instructions, patterns, examples)
   * @param {string} [skillData.description] - Human-readable description
   * @returns {Promise<{skillId: string, skill: Object}>}
   */
  async registerSkill(skillData) {
    this.log('Registering skill', skillData);

    // Validate required fields
    if (!skillData.name) {
      throw new Error('Skill name is required');
    }
    if (!skillData.category) {
      throw new Error('Skill category is required');
    }
    if (!skillData.sourceAgent) {
      throw new Error('Source agent is required');
    }
    if (!skillData.content) {
      throw new Error('Skill content is required');
    }

    // Generate skill ID if not provided
    const skillId = skillData.skillId || this.generateSkillId(skillData.name, skillData.sourceAgent);

    if (this.dryRun) {
      this.log('[DRY RUN] Would register skill', { skillId, ...skillData });
      return { skillId, skill: skillData, dryRun: true };
    }

    const record = {
      skill_id: skillId,
      name: skillData.name,
      description: skillData.description || null,
      category: skillData.category,
      subcategory: skillData.subcategory || null,
      tags: skillData.tags || [],
      source_agent: skillData.sourceAgent,
      source_file: skillData.sourceFile || null,
      source_type: skillData.sourceType || 'playbook',
      content: skillData.content
    };

    try {
      const url = `${this.supabaseUrl}/rest/v1/skills`;
      const response = await this._executeQuery(url, 'POST', record, {
        'Prefer': 'resolution=merge-duplicates,return=representation'
      });

      const result = JSON.parse(response);
      this.log('Skill registered', result);

      return {
        skillId,
        skill: result[0] || record
      };
    } catch (error) {
      throw new Error(`Failed to register skill: ${error.message}`);
    }
  }

  /**
   * Bulk register multiple skills
   *
   * @param {Object[]} skills - Array of skill data objects
   * @returns {Promise<{registered: number, failed: number, results: Object[]}>}
   */
  async registerSkillsBulk(skills) {
    this.log(`Bulk registering ${skills.length} skills`);

    const results = [];
    let registered = 0;
    let failed = 0;

    for (const skill of skills) {
      try {
        const result = await this.registerSkill(skill);
        results.push({ success: true, skillId: result.skillId });
        registered++;
      } catch (error) {
        results.push({ success: false, name: skill.name, error: error.message });
        failed++;
        this.log(`Failed to register skill: ${skill.name}`, error.message);
      }
    }

    return { registered, failed, results };
  }

  // ============================================================================
  // SKILL RETRIEVAL
  // ============================================================================

  /**
   * Get a skill by ID
   *
   * @param {string} skillId - Skill identifier
   * @returns {Promise<Object|null>}
   */
  async getSkill(skillId) {
    this.log('Getting skill', { skillId });

    try {
      const url = `${this.supabaseUrl}/rest/v1/skills?skill_id=eq.${encodeURIComponent(skillId)}&select=*`;
      const response = await this._executeQuery(url, 'GET');
      const results = JSON.parse(response);

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      throw new Error(`Failed to get skill: ${error.message}`);
    }
  }

  /**
   * Get skills by category
   *
   * @param {string} category - Skill category
   * @param {Object} [options]
   * @param {number} [options.limit] - Max results (default: 50)
   * @param {string} [options.status] - Filter by status (default: 'active')
   * @returns {Promise<Object[]>}
   */
  async getSkillsByCategory(category, options = {}) {
    this.log('Getting skills by category', { category, ...options });

    const limit = options.limit || 50;
    const status = options.status || 'active';

    try {
      const url = `${this.supabaseUrl}/rest/v1/skills?` +
        `category=eq.${encodeURIComponent(category)}&` +
        `status=eq.${encodeURIComponent(status)}&` +
        `order=success_rate.desc,usage_count.desc&` +
        `limit=${limit}&select=*`;

      const response = await this._executeQuery(url, 'GET');
      return JSON.parse(response);
    } catch (error) {
      throw new Error(`Failed to get skills by category: ${error.message}`);
    }
  }

  /**
   * Get all skills available to an agent
   *
   * @param {string} agent - Agent name
   * @param {Object} [options]
   * @param {number} [options.limit] - Max results (default: 100)
   * @param {boolean} [options.activeOnly] - Only active assignments (default: true)
   * @returns {Promise<Object[]>}
   */
  async getSkillsForAgent(agent, options = {}) {
    this.log('Getting skills for agent', { agent, ...options });

    const limit = options.limit || 100;
    const activeOnly = options.activeOnly !== false;

    try {
      // Get agent's skill assignments
      let url = `${this.supabaseUrl}/rest/v1/agent_skill_assignments?` +
        `agent=eq.${encodeURIComponent(agent)}&` +
        `select=skill_id,assignment_type,priority`;

      if (activeOnly) {
        url += '&active=eq.true';
      }

      const assignmentsResponse = await this._executeQuery(url, 'GET');
      const assignments = JSON.parse(assignmentsResponse);

      if (assignments.length === 0) {
        // Return native skills if no explicit assignments
        return this.getSkillsBySourceAgent(agent, { limit });
      }

      // Get full skill details
      const skillIds = assignments.map(a => a.skill_id);
      const skillsUrl = `${this.supabaseUrl}/rest/v1/skills?` +
        `skill_id=in.(${skillIds.map(id => `"${id}"`).join(',')})&` +
        `status=eq.active&` +
        `order=success_rate.desc&` +
        `limit=${limit}&select=*`;

      const skillsResponse = await this._executeQuery(skillsUrl, 'GET');
      const skills = JSON.parse(skillsResponse);

      // Merge assignment info
      return skills.map(skill => ({
        ...skill,
        assignment: assignments.find(a => a.skill_id === skill.skill_id)
      }));
    } catch (error) {
      throw new Error(`Failed to get skills for agent: ${error.message}`);
    }
  }

  /**
   * Get skills by source agent
   *
   * @param {string} agent - Source agent name
   * @param {Object} [options]
   * @param {number} [options.limit] - Max results (default: 50)
   * @returns {Promise<Object[]>}
   */
  async getSkillsBySourceAgent(agent, options = {}) {
    this.log('Getting skills by source agent', { agent, ...options });

    const limit = options.limit || 50;

    try {
      const url = `${this.supabaseUrl}/rest/v1/skills?` +
        `source_agent=eq.${encodeURIComponent(agent)}&` +
        `status=eq.active&` +
        `order=success_rate.desc,usage_count.desc&` +
        `limit=${limit}&select=*`;

      const response = await this._executeQuery(url, 'GET');
      return JSON.parse(response);
    } catch (error) {
      throw new Error(`Failed to get skills by source agent: ${error.message}`);
    }
  }

  /**
   * Search skills by text query
   *
   * @param {string} query - Search query
   * @param {Object} [options]
   * @param {number} [options.limit] - Max results (default: 20)
   * @returns {Promise<Object[]>}
   */
  async searchSkills(query, options = {}) {
    this.log('Searching skills', { query, ...options });

    const limit = options.limit || 20;
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    if (tokens.length === 0) {
      return [];
    }

    try {
      // Full-text search
      const tsquery = tokens.join(' & ');
      const url = `${this.supabaseUrl}/rest/v1/skills?` +
        `status=eq.active&` +
        `order=success_rate.desc&` +
        `limit=${limit}&select=*`;

      const response = await this._executeQuery(url, 'GET');
      const allSkills = JSON.parse(response);

      // Filter by text match (Supabase REST API doesn't support full-text easily)
      const filtered = allSkills.filter(skill => {
        const searchText = [
          skill.name,
          skill.description,
          skill.category,
          (skill.tags || []).join(' '),
          JSON.stringify(skill.content)
        ].join(' ').toLowerCase();

        return tokens.every(token => searchText.includes(token));
      });

      return filtered.slice(0, limit);
    } catch (error) {
      throw new Error(`Failed to search skills: ${error.message}`);
    }
  }

  // ============================================================================
  // EXECUTION TRACKING
  // ============================================================================

  /**
   * Record a skill execution
   *
   * @param {Object} execution
   * @param {string} execution.skillId - Skill identifier
   * @param {string} execution.agent - Agent that used the skill
   * @param {boolean} execution.success - Whether execution succeeded
   * @param {number} [execution.durationMs] - Execution duration in milliseconds
   * @param {string} [execution.sessionId] - Session identifier
   * @param {string} [execution.taskDescription] - Description of the task
   * @param {string} [execution.orgAlias] - Salesforce org or HubSpot portal
   * @param {string} [execution.errorType] - Error taxonomy if failed
   * @param {string} [execution.errorMessage] - Error message if failed
   * @param {Object} [execution.context] - Additional context
   * @param {string} [execution.userEmail] - User attribution
   * @returns {Promise<{executionId: string}>}
   */
  async recordExecution(execution) {
    this.log('Recording execution', execution);

    // Validate required fields
    if (!execution.skillId) {
      throw new Error('Skill ID is required');
    }
    if (!execution.agent) {
      throw new Error('Agent is required');
    }
    if (execution.success === undefined) {
      throw new Error('Success status is required');
    }

    if (this.dryRun) {
      this.log('[DRY RUN] Would record execution', execution);
      return { executionId: `DRYRUN_${Date.now()}`, dryRun: true };
    }

    const record = {
      skill_id: execution.skillId,
      agent: execution.agent,
      success: execution.success,
      duration_ms: execution.durationMs || null,
      session_id: execution.sessionId || null,
      task_description: execution.taskDescription || null,
      org_alias: execution.orgAlias || null,
      error_type: execution.errorType || null,
      error_message: execution.errorMessage || null,
      context: execution.context || {},
      user_email: execution.userEmail || process.env.USER_EMAIL || null
    };

    try {
      const url = `${this.supabaseUrl}/rest/v1/skill_executions`;
      const response = await this._executeQuery(url, 'POST', record, {
        'Prefer': 'return=representation'
      });

      const result = JSON.parse(response);
      this.log('Execution recorded', result);

      return {
        executionId: result[0]?.id || 'unknown'
      };
    } catch (error) {
      throw new Error(`Failed to record execution: ${error.message}`);
    }
  }

  /**
   * Get recent executions for a skill
   *
   * @param {string} skillId - Skill identifier
   * @param {number} [days] - Look back period in days (default: 30)
   * @returns {Promise<Object[]>}
   */
  async getRecentExecutions(skillId, days = 30) {
    this.log('Getting recent executions', { skillId, days });

    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const url = `${this.supabaseUrl}/rest/v1/skill_executions?` +
        `skill_id=eq.${encodeURIComponent(skillId)}&` +
        `created_at=gte.${since}&` +
        `order=created_at.desc&` +
        `limit=100&select=*`;

      const response = await this._executeQuery(url, 'GET');
      return JSON.parse(response);
    } catch (error) {
      throw new Error(`Failed to get recent executions: ${error.message}`);
    }
  }

  // ============================================================================
  // CONFIDENCE MANAGEMENT
  // ============================================================================

  /**
   * Update skill confidence based on recent performance
   *
   * @param {string} skillId - Skill identifier
   * @returns {Promise<{previousConfidence: number, newConfidence: number, status: string}>}
   */
  async updateConfidence(skillId) {
    this.log('Updating confidence for skill', { skillId });

    try {
      // Get skill
      const skill = await this.getSkill(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }

      // Get recent executions
      const executions = await this.getRecentExecutions(skillId, 30);

      if (executions.length < 5) {
        this.log('Not enough recent executions to update confidence', { count: executions.length });
        return {
          previousConfidence: skill.confidence,
          newConfidence: skill.confidence,
          status: 'unchanged'
        };
      }

      // Calculate recent success rate
      const recentSuccessRate = executions.filter(e => e.success).length / executions.length;

      // Weighted average: 70% recent, 30% historical
      const newConfidence = Math.max(0.1, Math.min(1.0,
        (0.7 * recentSuccessRate) + (0.3 * skill.confidence)
      ));

      // Determine new status
      let newStatus = skill.status;
      if (newConfidence < 0.5 && skill.usage_count >= 10) {
        newStatus = 'needs_refinement';
      } else if (newConfidence >= 0.7 && skill.status === 'needs_refinement') {
        newStatus = 'active';
      }

      if (this.dryRun) {
        return {
          previousConfidence: skill.confidence,
          newConfidence,
          status: newStatus,
          dryRun: true
        };
      }

      // Update skill
      const url = `${this.supabaseUrl}/rest/v1/skills?skill_id=eq.${encodeURIComponent(skillId)}`;
      await this._executeQuery(url, 'PATCH', {
        confidence: newConfidence,
        status: newStatus
      });

      this.log('Confidence updated', {
        previousConfidence: skill.confidence,
        newConfidence,
        status: newStatus
      });

      return {
        previousConfidence: skill.confidence,
        newConfidence,
        status: newStatus
      };
    } catch (error) {
      throw new Error(`Failed to update confidence: ${error.message}`);
    }
  }

  // ============================================================================
  // TRANSFER CANDIDATES
  // ============================================================================

  /**
   * Find high-performing skills eligible for transfer
   *
   * @param {Object} [options]
   * @param {number} [options.successRateThreshold] - Min success rate (default: 0.90)
   * @param {number} [options.minUsage] - Min usage count (default: 50)
   * @param {number} [options.confidenceThreshold] - Min confidence (default: 0.85)
   * @param {number} [options.limit] - Max results (default: 20)
   * @returns {Promise<Object[]>}
   */
  async findHighPerformers(options = {}) {
    this.log('Finding high performers', options);

    const successRateThreshold = options.successRateThreshold || 0.90;
    const minUsage = options.minUsage || 50;
    const confidenceThreshold = options.confidenceThreshold || 0.85;
    const limit = options.limit || 20;

    try {
      const url = `${this.supabaseUrl}/rest/v1/skills?` +
        `status=eq.active&` +
        `success_rate=gte.${successRateThreshold}&` +
        `usage_count=gte.${minUsage}&` +
        `confidence=gte.${confidenceThreshold}&` +
        `order=success_rate.desc,usage_count.desc&` +
        `limit=${limit}&select=*`;

      const response = await this._executeQuery(url, 'GET');
      const skills = JSON.parse(response);

      // Filter out skills already transferred
      const transfersUrl = `${this.supabaseUrl}/rest/v1/skill_transfers?` +
        `status=in.("validating","accepted")&select=skill_id`;
      const transfersResponse = await this._executeQuery(transfersUrl, 'GET');
      const transferredSkillIds = JSON.parse(transfersResponse).map(t => t.skill_id);

      return skills.filter(s => !transferredSkillIds.includes(s.skill_id));
    } catch (error) {
      throw new Error(`Failed to find high performers: ${error.message}`);
    }
  }

  /**
   * Find skills needing refinement
   *
   * @param {Object} [options]
   * @param {number} [options.limit] - Max results (default: 20)
   * @returns {Promise<Object[]>}
   */
  async findSkillsNeedingRefinement(options = {}) {
    this.log('Finding skills needing refinement', options);

    const limit = options.limit || 20;

    try {
      const url = `${this.supabaseUrl}/rest/v1/skills?` +
        `or=(status.eq.needs_refinement,and(confidence.lt.0.6,usage_count.gte.10))&` +
        `order=confidence.asc&` +
        `limit=${limit}&select=*`;

      const response = await this._executeQuery(url, 'GET');
      return JSON.parse(response);
    } catch (error) {
      throw new Error(`Failed to find skills needing refinement: ${error.message}`);
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get skill registry statistics
   *
   * @returns {Promise<Object>}
   */
  async getStats() {
    this.log('Getting skill registry statistics');

    try {
      // Get skill counts by status
      const skillsUrl = `${this.supabaseUrl}/rest/v1/skills?select=status,category`;
      const skillsResponse = await this._executeQuery(skillsUrl, 'GET');
      const skills = JSON.parse(skillsResponse);

      // Get recent execution stats
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const execsUrl = `${this.supabaseUrl}/rest/v1/skill_executions?` +
        `created_at=gte.${since}&select=success`;
      const execsResponse = await this._executeQuery(execsUrl, 'GET');
      const executions = JSON.parse(execsResponse);

      // Get transfer stats
      const transfersUrl = `${this.supabaseUrl}/rest/v1/skill_transfers?select=status`;
      const transfersResponse = await this._executeQuery(transfersUrl, 'GET');
      const transfers = JSON.parse(transfersResponse);

      // Calculate stats
      const byStatus = skills.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {});

      const byCategory = skills.reduce((acc, s) => {
        acc[s.category] = (acc[s.category] || 0) + 1;
        return acc;
      }, {});

      const transfersByStatus = transfers.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {});

      const successfulExecs = executions.filter(e => e.success).length;

      return {
        totalSkills: skills.length,
        byStatus,
        byCategory,
        weeklyExecutions: executions.length,
        weeklySuccessRate: executions.length > 0 ?
          (successfulExecs / executions.length * 100).toFixed(1) + '%' : 'N/A',
        transfers: {
          total: transfers.length,
          ...transfersByStatus
        }
      };
    } catch (error) {
      throw new Error(`Failed to get stats: ${error.message}`);
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Generate a unique skill ID
   *
   * @param {string} name - Skill name
   * @param {string} agent - Source agent
   * @returns {string}
   */
  generateSkillId(name, agent) {
    const base = `${agent}-${name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    const hash = crypto.createHash('md5')
      .update(`${name}-${agent}-${Date.now()}`)
      .digest('hex')
      .substring(0, 6);

    return `${base}-${hash}`;
  }

  /**
   * Execute Supabase query via REST API
   *
   * @private
   * @param {string} url - API endpoint URL
   * @param {string} method - HTTP method
   * @param {Object} [body] - Request body
   * @param {Object} [extraHeaders] - Additional headers
   * @returns {Promise<string>} - Response body
   */
  async _executeQuery(url, method, body = null, extraHeaders = {}) {
    const headers = {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    };

    this.log('Executing query', { method, url: url.split('?')[0] });

    let tmpFile = null;
    try {
      const curlArgs = [
        'curl',
        '-s', // Silent mode
        '-X', method,
        ...Object.entries(headers).flatMap(([key, value]) => ['-H', `"${key}: ${value}"`])
      ];

      // Write body to temp file to avoid shell escaping issues with newlines
      if (body) {
        tmpFile = path.join(os.tmpdir(), `supabase-body-${Date.now()}.json`);
        fs.writeFileSync(tmpFile, JSON.stringify(body), 'utf8');
        curlArgs.push('-d', `@${tmpFile}`);
      }

      curlArgs.push(`"${url}"`);

      const curlCmd = curlArgs.filter(Boolean).join(' ');
      const response = execSync(curlCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      return response;
    } catch (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    } finally {
      // Clean up temp file
      if (tmpFile && fs.existsSync(tmpFile)) {
        try {
          fs.unlinkSync(tmpFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   * @param {string} message - Log message
   * @param {*} [data] - Optional data to log
   */
  log(message, data = null) {
    if (this.verbose) {
      console.error(`[SkillRegistry] ${message}`, data !== null ? JSON.stringify(data, null, 2) : '');
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const usage = `
Skill Registry - ACE Framework

Usage: node skill-registry.js <command> [options]

Commands:
  register       Register a new skill
  get            Get skill by ID
  search         Search skills by text
  by-category    Get skills by category
  by-agent       Get skills by source agent
  for-agent      Get skills available to agent
  record         Record skill execution
  stats          Show registry statistics
  high-performers Find transfer candidates
  needs-refinement Find skills needing work

Options:
  --verbose      Enable verbose logging
  --dry-run      Don't make changes

Examples:
  # Get skill by ID
  node skill-registry.js get --skill-id sfdc-cpq-assessment-abc123

  # Search skills
  node skill-registry.js search --query "deployment validation"

  # Get skills for agent
  node skill-registry.js for-agent --agent sfdc-cpq-assessor

  # Record execution
  node skill-registry.js record --skill-id sfdc-cpq-assessment-abc123 \\
    --agent sfdc-cpq-assessor --success true --duration-ms 5000

  # Show statistics
  node skill-registry.js stats

  # Find high performers
  node skill-registry.js high-performers --min-usage 30 --success-rate 0.85
`;

  if (!command || command === '--help' || command === '-h') {
    console.log(usage);
    process.exit(0);
  }

  const parseArgs = (args) => {
    const parsed = { _: [] };
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        parsed[key] = value;
        if (value !== true) i++;
      } else {
        parsed._.push(args[i]);
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const registry = new SkillRegistry({
    verbose: options.verbose || false,
    dryRun: options['dry-run'] || false
  });

  (async () => {
    try {
      let result;

      switch (command) {
        case 'get':
          result = await registry.getSkill(options['skill-id']);
          break;

        case 'search':
          result = await registry.searchSkills(options.query || options._.join(' '), {
            limit: parseInt(options.limit) || 20
          });
          break;

        case 'by-category':
          result = await registry.getSkillsByCategory(options.category, {
            limit: parseInt(options.limit) || 50
          });
          break;

        case 'by-agent':
          result = await registry.getSkillsBySourceAgent(options.agent, {
            limit: parseInt(options.limit) || 50
          });
          break;

        case 'for-agent':
          result = await registry.getSkillsForAgent(options.agent, {
            limit: parseInt(options.limit) || 100
          });
          break;

        case 'record':
          result = await registry.recordExecution({
            skillId: options['skill-id'],
            agent: options.agent,
            success: options.success === 'true',
            durationMs: parseInt(options['duration-ms']) || undefined,
            sessionId: options['session-id'],
            errorType: options['error-type'],
            errorMessage: options['error-message']
          });
          break;

        case 'stats':
          result = await registry.getStats();
          break;

        case 'high-performers':
          result = await registry.findHighPerformers({
            successRateThreshold: parseFloat(options['success-rate']) || 0.90,
            minUsage: parseInt(options['min-usage']) || 50,
            confidenceThreshold: parseFloat(options.confidence) || 0.85,
            limit: parseInt(options.limit) || 20
          });
          break;

        case 'needs-refinement':
          result = await registry.findSkillsNeedingRefinement({
            limit: parseInt(options.limit) || 20
          });
          break;

        case 'update-confidence':
          result = await registry.updateConfidence(options['skill-id']);
          break;

        default:
          console.error(`Unknown command: ${command}`);
          console.log(usage);
          process.exit(1);
      }

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = SkillRegistry;
