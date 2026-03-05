#!/usr/bin/env node

/**
 * Pipeline Plan Builder
 *
 * Translates natural language requests + detected platforms into a TaskSpec DAG
 * for the cross-platform pipeline orchestrator. Loads the playbook template and
 * filters tasks based on which platforms are available.
 *
 * @module pipeline-plan-builder
 * @version 1.0.0
 * @since 2026-02-08
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml') || null; // Optional dep

const PLUGIN_ROOT = path.resolve(__dirname, '../../../');
const CONFIG_PATH = path.join(PLUGIN_ROOT, 'config', 'pipeline-config.json');
const PLAYBOOK_PATH = path.join(PLUGIN_ROOT, 'playbooks', 'cross-platform', 'parallel-pipeline.yaml');

// Platform detection keywords
const PLATFORM_KEYWORDS = {
  salesforce: ['salesforce', 'sf', 'sfdc', 'account', 'opportunity', 'lead', 'contact', 'apex', 'soql'],
  hubspot: ['hubspot', 'hs', 'portal', 'deal', 'engagement', 'hubspot contact'],
  asana: ['asana', 'task', 'project', 'milestone', 'assignee'],
  marketo: ['marketo', 'mk', 'campaign', 'program', 'smart list', 'munchkin'],
};

class PipelinePlanBuilder {
  constructor(options = {}) {
    this.config = this._loadConfig();
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG;
  }

  /**
   * Detect which platforms are mentioned in the request and available in env
   */
  detectPlatforms(request) {
    const lower = request.toLowerCase();
    const detected = [];

    for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
      const mentioned = keywords.some(kw => lower.includes(kw));
      const envVars = this.config.platforms[platform]?.envVars || [];
      const configured = envVars.some(v => process.env[v]);

      if (mentioned && configured) {
        detected.push({ platform, status: 'ready', mentioned: true, configured: true });
      } else if (mentioned && !configured) {
        detected.push({ platform, status: 'unconfigured', mentioned: true, configured: false });
      } else if (!mentioned && configured) {
        detected.push({ platform, status: 'available', mentioned: false, configured: true });
      }
    }

    return detected;
  }

  /**
   * Build execution plan from request
   */
  buildPlan(request, options = {}) {
    const platforms = this.detectPlatforms(request);
    const readyPlatforms = platforms.filter(p => p.status === 'ready');
    const unconfigured = platforms.filter(p => p.status === 'unconfigured');

    if (readyPlatforms.length === 0) {
      return {
        error: true,
        message: 'No platforms detected or configured for this request',
        detected: platforms,
        suggestion: unconfigured.length > 0
          ? `Configure: ${unconfigured.map(p => p.platform).join(', ')} (run /envcheck for details)`
          : 'Mention platform names (Salesforce, HubSpot, Asana, Marketo) in your request',
      };
    }

    // Load playbook template
    const playbook = this._loadPlaybook();

    // Filter DAG tasks based on detected platforms
    const activeTasks = (playbook.default_dag || []).filter(task => {
      if (!task.conditional) return true;
      // Simple platform detection check
      const match = task.conditional.match(/platform_detected\('(\w+)'\)/);
      if (match) {
        return readyPlatforms.some(p => p.platform === match[1]);
      }
      // Env check
      const envMatch = task.conditional.match(/env\('(\w+)'\)/);
      if (envMatch) {
        return !!process.env[envMatch[1]];
      }
      return true;
    });

    // Organize by waves
    const waves = {};
    for (const task of activeTasks) {
      const wave = task.wave || 1;
      if (!waves[wave]) waves[wave] = [];
      waves[wave].push(task);
    }

    // Build agent mapping for each task
    const agentMap = {};
    for (const task of activeTasks) {
      const domain = task.domain;
      for (const [platform, platformConfig] of Object.entries(this.config.platforms)) {
        if (domain.startsWith(platform) || (domain === 'cross-platform' && task.title.toLowerCase().includes(platform))) {
          agentMap[task.id] = platformConfig.agents.query || platformConfig.agents.data || platformConfig.agents.audit;
          break;
        }
      }
    }

    return {
      error: false,
      request,
      orgSlug: this.orgSlug,
      platforms: {
        ready: readyPlatforms.map(p => p.platform),
        unconfigured: unconfigured.map(p => p.platform),
        available: platforms.filter(p => p.status === 'available').map(p => p.platform),
      },
      waves,
      tasks: activeTasks,
      agentMap,
      totalTasks: activeTasks.length,
      estimatedWaves: Object.keys(waves).length,
    };
  }

  /**
   * Format plan as user-readable table
   */
  formatPlan(plan) {
    if (plan.error) return plan.message;

    const lines = [];
    lines.push('## Cross-Platform Pipeline Plan');
    lines.push('');
    lines.push(`**Platforms:** ${plan.platforms.ready.join(', ')}`);
    if (plan.platforms.unconfigured.length > 0) {
      lines.push(`**Skipped (unconfigured):** ${plan.platforms.unconfigured.join(', ')}`);
    }
    lines.push(`**Total tasks:** ${plan.totalTasks} across ${plan.estimatedWaves} waves`);
    lines.push('');

    for (const [waveNum, tasks] of Object.entries(plan.waves)) {
      const waveConfig = this.config.waves[`wave${waveNum}`];
      const parallel = waveConfig?.parallel ? '(parallel)' : '(sequential)';
      lines.push(`### Wave ${waveNum}: ${waveConfig?.name || 'Execution'} ${parallel}`);
      lines.push('');
      lines.push('| Task | Domain | Goal |');
      lines.push('|------|--------|------|');
      for (const task of tasks) {
        lines.push(`| ${task.id} | ${task.domain} | ${task.goal} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  _loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      return { platforms: {}, reconciliation: {}, output: {}, waves: {} };
    }
  }

  _loadPlaybook() {
    try {
      const content = fs.readFileSync(PLAYBOOK_PATH, 'utf8');
      // Simple YAML-like parser (avoids requiring js-yaml)
      if (yaml) return yaml.load(content);
      // Fallback: return empty structure
      return { default_dag: [] };
    } catch {
      return { default_dag: [] };
    }
  }
}

module.exports = { PipelinePlanBuilder };

// CLI
if (require.main === module) {
  const request = process.argv.slice(2).join(' ');
  if (!request) {
    console.log('Usage: pipeline-plan-builder.js "Compare Account ownership in SF with Asana task assignments"');
    process.exit(0);
  }

  const builder = new PipelinePlanBuilder();
  const plan = builder.buildPlan(request);

  if (plan.error) {
    console.error(plan.message);
    process.exit(1);
  }

  console.log(builder.formatPlan(plan));
}
