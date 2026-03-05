#!/usr/bin/env node

/**
 * Project Plan Generator
 *
 * Parses specifications and generates executable project plans for Asana.
 * Extracts requirements, estimates effort, maps dependencies, and assigns agents.
 *
 * Part of the Implementation Planner system.
 *
 * @see ../../agents/implementation-planner.md
 * @see ../../docs/ASANA_AGENT_PLAYBOOK.md
 */

const fs = require('fs');
const path = require('path');

class ProjectPlanGenerator {
  constructor() {
    this.agentMapping = {
      // Salesforce agents
      'sfdc-metadata-manager': ['object creation', 'field creation', 'layout', 'page layout', 'record type', 'picklist'],
      'sfdc-data-operations': ['data import', 'data migration', 'bulk update', 'data loader', 'csv import'],
      'sfdc-security-admin': ['profile', 'permission set', 'sharing rule', 'field level security', 'object permissions'],
      'sfdc-automation-builder': ['flow', 'process builder', 'workflow rule', 'approval process', 'automation'],
      'sfdc-apex-developer': ['apex class', 'trigger', 'test class', 'batch apex', 'scheduled apex'],
      'sfdc-lightning-developer': ['lwc', 'aura', 'lightning component', 'lightning web component'],
      'sfdc-deployment-manager': ['deployment', 'change set', 'package', 'metadata deploy'],
      'sfdc-cpq-specialist': ['cpq', 'quote', 'product', 'price book', 'discounting'],

      // HubSpot agents
      'hubspot-workflow-builder': ['workflow', 'automation', 'email sequence', 'hubspot workflow'],
      'hubspot-data-operations-manager': ['property', 'contact import', 'company data', 'hubspot data'],
      'hubspot-integrations': ['api', 'webhook', 'integration', 'hubspot api'],

      // Cross-platform
      'unified-orchestrator': ['multi-platform', 'salesforce and hubspot', 'cross-platform'],
      'sfdc-hubspot-bridge': ['bidirectional sync', 'data bridge', 'sync salesforce hubspot'],

      // Specialized
      'sfdc-reports-dashboards': ['report', 'dashboard', 'analytics', 'chart'],
      'hubspot-assessment-analyzer': ['assessment', 'audit', 'analysis', 'review']
    };

    this.implicitDependencyRules = [
      { before: 'object creation', after: 'field creation' },
      { before: 'field creation', after: 'layout configuration' },
      { before: 'field creation', after: 'validation rule' },
      { before: 'data model', after: 'automation' },
      { before: 'data model', after: 'report' },
      { before: 'apex class', after: 'test class' },
      { before: 'apex class', after: 'trigger' },
      { before: 'sandbox deployment', after: 'production deployment' },
      { before: 'workflow', after: 'testing' },
      { before: 'property creation', after: 'workflow' },
      { before: 'integration setup', after: 'data sync' }
    ];
  }

  /**
   * Parse specification document
   *
   * @param {string} specPath - Path to specification file
   * @returns {Promise<object>} - Parsed specification
   */
  async parseSpecification(specPath) {
    const extension = path.extname(specPath).toLowerCase();
    const content = fs.readFileSync(specPath, 'utf8');

    switch (extension) {
      case '.md':
        return this.parseMarkdown(content);
      case '.txt':
        return this.parseText(content);
      case '.pdf':
        throw new Error('PDF parsing requires external tool - please convert to markdown first');
      default:
        throw new Error(`Unsupported file format: ${extension}. Use .md or .txt`);
    }
  }

  /**
   * Parse markdown specification
   *
   * @param {string} content - Markdown content
   * @returns {object} - Parsed spec
   */
  parseMarkdown(content) {
    const lines = content.split('\n');
    const spec = {
      title: '',
      summary: '',
      objectives: [],
      scope: { included: [], excluded: [], assumptions: [] },
      requirements: [],
      technical: {
        platforms: [],
        integrations: [],
        dataVolume: 'medium',
        complexity: 'moderate'
      }
    };

    let currentSection = null;
    let currentRequirement = null;
    let inRequirements = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Extract title (first H1)
      if (line.startsWith('# ') && !spec.title) {
        spec.title = line.substring(2).trim();
        continue;
      }

      // Section headers
      if (line.startsWith('## ')) {
        currentSection = line.substring(3).trim().toLowerCase();

        if (currentSection.includes('requirement') || currentSection.includes('feature')) {
          inRequirements = true;
        } else {
          inRequirements = false;
        }
        continue;
      }

      // In requirements section
      if (inRequirements) {
        // New requirement (H3 or list item with REQ- prefix)
        if (line.startsWith('### ') || line.match(/^REQ-\d+:/i)) {
          if (currentRequirement) {
            spec.requirements.push(currentRequirement);
          }

          const reqTitle = line.startsWith('### ') ?
            line.substring(4).trim() :
            line.substring(line.indexOf(':') + 1).trim();

          const reqId = line.match(/REQ-\d+/i) ?
            line.match(/REQ-\d+/i)[0] :
            `REQ-${String(spec.requirements.length + 1).padStart(3, '0')}`;

          currentRequirement = {
            id: reqId,
            type: 'functional',
            platform: 'salesforce',
            priority: 'medium',
            description: reqTitle,
            acceptanceCriteria: [],
            dependencies: [],
            estimatedHours: 8,
            complexity: 'moderate'
          };
          continue;
        }

        // Requirement metadata
        if (currentRequirement && line.startsWith('**')) {
          const match = line.match(/\*\*([^:]+):\*\*\s*(.+)/);
          if (match) {
            const [, key, value] = match;
            const keyLower = key.toLowerCase();

            if (keyLower.includes('type')) {
              currentRequirement.type = value.toLowerCase().split('|')[0].trim();
            } else if (keyLower.includes('priority')) {
              currentRequirement.priority = value.toLowerCase().split('|')[0].trim();
            } else if (keyLower.includes('platform')) {
              currentRequirement.platform = value.toLowerCase().split('|')[0].trim();
            } else if (keyLower.includes('effort') || keyLower.includes('estimate')) {
              const hours = parseInt(value.match(/\d+/)?.[0] || '8');
              currentRequirement.estimatedHours = hours;
            } else if (keyLower.includes('description')) {
              currentRequirement.description = value;
            } else if (keyLower.includes('dependencies')) {
              currentRequirement.dependencies = value.split(',').map(d => d.trim()).filter(Boolean);
            }
          }
          continue;
        }

        // Acceptance criteria
        if (currentRequirement && (
          line.startsWith('- ') ||
          line.match(/^\d+\./) ||
          line.toLowerCase().includes('acceptance criteria')
        )) {
          if (!line.toLowerCase().includes('acceptance criteria')) {
            const criterion = line.replace(/^-\s*/, '').replace(/^\d+\.\s*/, '').trim();
            if (criterion && !currentRequirement.acceptanceCriteria.includes(criterion)) {
              currentRequirement.acceptanceCriteria.push(criterion);
            }
          }
        }
      }

      // Parse other sections
      if (currentSection) {
        if (currentSection.includes('overview') || currentSection.includes('summary')) {
          if (line && !line.startsWith('#')) {
            spec.summary += (spec.summary ? ' ' : '') + line;
          }
        } else if (currentSection.includes('objective')) {
          if (line.startsWith('- ')) {
            spec.objectives.push(line.substring(2).trim());
          }
        } else if (currentSection.includes('scope')) {
          if (line.includes('In Scope') || line.includes('Included')) {
            currentSection = 'scope_included';
          } else if (line.includes('Out of Scope') || line.includes('Excluded')) {
            currentSection = 'scope_excluded';
          } else if (currentSection === 'scope_included' && line.startsWith('- ')) {
            spec.scope.included.push(line.substring(2).trim());
          } else if (currentSection === 'scope_excluded' && line.startsWith('- ')) {
            spec.scope.excluded.push(line.substring(2).trim());
          }
        } else if (currentSection.includes('technical')) {
          if (line.toLowerCase().includes('platform') && line.includes(':')) {
            const platforms = line.split(':')[1].split(',').map(p => p.trim().toLowerCase());
            spec.technical.platforms.push(...platforms);
          } else if (line.toLowerCase().includes('complexity') && line.includes(':')) {
            spec.technical.complexity = line.split(':')[1].trim().toLowerCase();
          }
        }
      }
    }

    // Add last requirement
    if (currentRequirement) {
      spec.requirements.push(currentRequirement);
    }

    // Detect platforms from requirements if not specified
    if (spec.technical.platforms.length === 0) {
      const contentLower = content.toLowerCase();
      if (contentLower.includes('salesforce')) spec.technical.platforms.push('salesforce');
      if (contentLower.includes('hubspot')) spec.technical.platforms.push('hubspot');
    }

    return spec;
  }

  /**
   * Parse plain text specification
   *
   * @param {string} content - Text content
   * @returns {object} - Parsed spec
   */
  parseText(content) {
    // Convert plain text to structured format
    const lines = content.split('\n').filter(l => l.trim());

    const spec = {
      title: lines[0] || 'Untitled Project',
      summary: lines.slice(1, 3).join(' '),
      requirements: [],
      technical: {
        platforms: [],
        complexity: 'moderate'
      }
    };

    // Simple requirement extraction - each non-empty line is a requirement
    let reqCounter = 1;
    for (const line of lines.slice(1)) {
      if (line.trim().length > 10) { // Skip very short lines
        spec.requirements.push({
          id: `REQ-${String(reqCounter++).padStart(3, '0')}`,
          type: 'functional',
          platform: 'salesforce',
          priority: 'medium',
          description: line.trim(),
          acceptanceCriteria: ['Requirement implemented as described'],
          dependencies: [],
          estimatedHours: 8
        });
      }
    }

    return spec;
  }

  /**
   * Select appropriate agent for requirement
   *
   * @param {object} requirement - Requirement object
   * @returns {string} - Agent name
   */
  selectAgent(requirement) {
    const description = requirement.description.toLowerCase();

    for (const [agent, keywords] of Object.entries(this.agentMapping)) {
      if (keywords.some(keyword => description.includes(keyword))) {
        return agent;
      }
    }

    // Default based on platform
    if (requirement.platform === 'hubspot') {
      return 'hubspot-workflow-orchestrator';
    } else if (requirement.platform === 'salesforce') {
      return 'sfdc-orchestrator';
    }

    return 'unified-orchestrator';
  }

  /**
   * Estimate effort for requirement
   *
   * @param {object} requirement - Requirement object
   * @returns {number} - Hours
   */
  estimateEffort(requirement) {
    // If estimate provided, use it
    if (requirement.estimatedHours && requirement.estimatedHours > 0) {
      return requirement.estimatedHours;
    }

    const baselineHours = {
      'simple': 2,
      'moderate': 8,
      'complex': 24,
      'enterprise': 80
    };

    let hours = baselineHours[requirement.complexity] || 8;

    // Adjust for keywords
    const description = requirement.description.toLowerCase();
    if (description.includes('apex') || description.includes('trigger')) hours *= 1.5;
    if (description.includes('integration') || description.includes('api')) hours *= 2;
    if (description.includes('migration') || description.includes('import')) hours *= 1.8;
    if (description.includes('test') || description.includes('testing')) hours += 4;
    if (description.includes('report') || description.includes('dashboard')) hours += 3;

    return Math.ceil(hours);
  }

  /**
   * Map dependencies between requirements
   *
   * @param {array} requirements - List of requirements
   * @returns {Map} - Dependency map
   */
  mapDependencies(requirements) {
    const dependencies = new Map();

    // Explicit dependencies from requirement definitions
    for (const req of requirements) {
      if (req.dependencies && req.dependencies.length > 0) {
        dependencies.set(req.id, req.dependencies);
      }
    }

    // Implicit dependencies from rules
    for (const req of requirements) {
      const description = req.description.toLowerCase();

      for (const rule of this.implicitDependencyRules) {
        if (description.includes(rule.after)) {
          // Find requirement that includes the "before" keyword
          const dependency = requirements.find(r =>
            r.id !== req.id && r.description.toLowerCase().includes(rule.before)
          );

          if (dependency) {
            if (!dependencies.has(req.id)) {
              dependencies.set(req.id, []);
            }
            const deps = dependencies.get(req.id);
            if (!deps.includes(dependency.id)) {
              deps.push(dependency.id);
            }
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Organize requirements into phases
   *
   * @param {array} requirements - List of requirements
   * @param {Map} dependencies - Dependency map
   * @returns {array} - Phases
   */
  organizeIntoPhases(requirements, dependencies) {
    const phases = [
      {
        name: 'Foundation',
        sequence: 1,
        parallelizable: false,
        criteria: r => {
          if (!r.description) return false;
          const desc = r.description.toLowerCase();
          return r.type === 'data' ||
                 desc.includes('object') ||
                 desc.includes('field') ||
                 desc.includes('data model');
        },
        requirements: []
      },
      {
        name: 'Configuration',
        sequence: 2,
        parallelizable: true,
        criteria: r => {
          if (!r.description) return false;
          const desc = r.description.toLowerCase();
          return (r.type === 'functional' || r.type === 'configuration') &&
                 !desc.includes('code') &&
                 !desc.includes('apex') &&
                 !desc.includes('flow') &&
                 !desc.includes('automation');
        },
        requirements: []
      },
      {
        name: 'Automation',
        sequence: 3,
        parallelizable: true,
        criteria: r => {
          if (!r.description) return false;
          const desc = r.description.toLowerCase();
          return desc.includes('flow') ||
                 desc.includes('workflow') ||
                 desc.includes('automation') ||
                 desc.includes('process builder');
        },
        requirements: []
      },
      {
        name: 'Integration',
        sequence: 4,
        parallelizable: false,
        criteria: r => {
          if (!r.description) return false;
          const desc = r.description.toLowerCase();
          return r.type === 'integration' ||
                 desc.includes('integration') ||
                 desc.includes('api') ||
                 desc.includes('sync');
        },
        requirements: []
      },
      {
        name: 'Testing & Deployment',
        sequence: 5,
        parallelizable: false,
        criteria: r => {
          if (!r.description) return false;
          const desc = r.description.toLowerCase();
          return desc.includes('test') ||
                 desc.includes('deploy') ||
                 desc.includes('production');
        },
        requirements: []
      }
    ];

    // Assign requirements to phases
    const assigned = new Set();

    for (const phase of phases) {
      for (const req of requirements) {
        if (!assigned.has(req.id) && phase.criteria(req)) {
          phase.requirements.push(req);
          assigned.add(req.id);
        }
      }
    }

    // Assign any unassigned requirements to Configuration phase
    for (const req of requirements) {
      if (!assigned.has(req.id)) {
        phases[1].requirements.push(req); // Configuration phase
        assigned.add(req.id);
      }
    }

    // Remove empty phases
    const nonEmptyPhases = phases.filter(p => p.requirements.length > 0);

    // Calculate phase estimates
    for (const phase of nonEmptyPhases) {
      phase.estimatedHours = phase.requirements.reduce(
        (sum, req) => sum + this.estimateEffort(req),
        0
      );
    }

    return nonEmptyPhases;
  }

  /**
   * Generate complete project plan
   *
   * @param {object} spec - Parsed specification
   * @returns {object} - Project plan
   */
  generatePlan(spec) {
    // Select agents for each requirement
    for (const req of spec.requirements) {
      req.agent = this.selectAgent(req);
      req.estimatedHours = this.estimateEffort(req);
    }

    // Map dependencies
    const dependencies = this.mapDependencies(spec.requirements);
    for (const req of spec.requirements) {
      if (dependencies.has(req.id)) {
        req.dependencies = dependencies.get(req.id);
      }
    }

    // Organize into phases
    const phases = this.organizeIntoPhases(spec.requirements, dependencies);

    // Calculate total effort
    const totalHours = spec.requirements.reduce(
      (sum, req) => sum + req.estimatedHours,
      0
    );

    // Estimate completion date (assuming 6 productive hours per day)
    const workingDays = Math.ceil(totalHours / 6);
    const estimatedCompletion = new Date();
    estimatedCompletion.setDate(estimatedCompletion.getDate() + workingDays);

    // Generate plan
    const plan = {
      metadata: {
        title: spec.title,
        summary: spec.summary,
        createdAt: new Date().toISOString(),
        estimatedTotalHours: totalHours,
        estimatedWorkingDays: workingDays,
        estimatedCompletionDate: estimatedCompletion.toISOString().split('T')[0],
        complexity: spec.technical.complexity,
        platforms: spec.technical.platforms,
        requirementCount: spec.requirements.length,
        phaseCount: phases.length
      },

      phases: phases.map(phase => ({
        name: phase.name,
        sequence: phase.sequence,
        parallelizable: phase.parallelizable,
        estimatedHours: phase.estimatedHours,
        tasks: phase.requirements.map(req => ({
          title: req.description,
          requirementId: req.id,
          description: req.description,
          agent: req.agent,
          platform: req.platform,
          type: req.type,
          priority: req.priority,
          estimatedHours: req.estimatedHours,
          dependencies: req.dependencies || [],
          acceptanceCriteria: req.acceptanceCriteria || [],
          deliverables: this.generateDeliverables(req),
          complexity: req.complexity || 'moderate'
        }))
      })),

      asanaConfig: {
        projectName: spec.title,
        projectDescription: spec.summary,
        sections: phases.map(p => p.name),
        customFields: {
          'estimated_hours': 'number',
          'actual_hours': 'number',
          'assigned_agent': 'text',
          'requirement_id': 'text',
          'platform': 'enum',
          'complexity': 'enum',
          'task_type': 'enum'
        }
      }
    };

    return plan;
  }

  /**
   * Generate expected deliverables for requirement
   *
   * @param {object} requirement - Requirement object
   * @returns {array} - Deliverables
   */
  generateDeliverables(requirement) {
    const deliverables = [];
    const desc = requirement.description.toLowerCase();

    if (desc.includes('field')) {
      deliverables.push('Field definitions in metadata');
      deliverables.push('Field level security configuration');
    }
    if (desc.includes('object')) {
      deliverables.push('Object definition');
      deliverables.push('Page layouts');
    }
    if (desc.includes('flow') || desc.includes('automation')) {
      deliverables.push('Flow/automation configuration');
      deliverables.push('Test cases documentation');
    }
    if (desc.includes('integration') || desc.includes('api')) {
      deliverables.push('Integration documentation');
      deliverables.push('API credentials configuration');
    }
    if (desc.includes('report') || desc.includes('dashboard')) {
      deliverables.push('Report/dashboard deployment');
      deliverables.push('User guide');
    }
    if (desc.includes('test')) {
      deliverables.push('Test results report');
      deliverables.push('Quality assurance sign-off');
    }

    // Default deliverables if none specific
    if (deliverables.length === 0) {
      deliverables.push('Implementation complete');
      deliverables.push('Documentation updated');
      deliverables.push('Testing completed');
    }

    return deliverables;
  }

  /**
   * Export plan to various formats
   *
   * @param {object} plan - Project plan
   * @param {string} format - Output format (json, markdown, text)
   * @returns {string} - Formatted output
   */
  exportPlan(plan, format = 'markdown') {
    if (format === 'json') {
      return JSON.stringify(plan, null, 2);
    }

    if (format === 'markdown') {
      let output = `# ${plan.metadata.title}\n\n`;
      output += `**Summary**: ${plan.metadata.summary}\n\n`;
      output += `## Project Overview\n\n`;
      output += `- **Total Effort**: ${plan.metadata.estimatedTotalHours} hours (${plan.metadata.estimatedWorkingDays} working days)\n`;
      output += `- **Estimated Completion**: ${plan.metadata.estimatedCompletionDate}\n`;
      output += `- **Complexity**: ${plan.metadata.complexity}\n`;
      output += `- **Platforms**: ${plan.metadata.platforms.join(', ')}\n`;
      output += `- **Requirements**: ${plan.metadata.requirementCount}\n`;
      output += `- **Phases**: ${plan.metadata.phaseCount}\n\n`;

      for (const phase of plan.phases) {
        output += `## Phase ${phase.sequence}: ${phase.name}\n\n`;
        output += `- **Estimated Effort**: ${phase.estimatedHours} hours\n`;
        output += `- **Parallelizable**: ${phase.parallelizable ? 'Yes' : 'No'}\n`;
        output += `- **Tasks**: ${phase.tasks.length}\n\n`;

        for (const task of phase.tasks) {
          output += `### ${task.requirementId}: ${task.title}\n\n`;
          output += `- **Agent**: ${task.agent}\n`;
          output += `- **Platform**: ${task.platform}\n`;
          output += `- **Effort**: ${task.estimatedHours} hours\n`;
          output += `- **Priority**: ${task.priority}\n`;

          if (task.dependencies.length > 0) {
            output += `- **Dependencies**: ${task.dependencies.join(', ')}\n`;
          }

          if (task.acceptanceCriteria.length > 0) {
            output += `\n**Acceptance Criteria**:\n`;
            for (const criterion of task.acceptanceCriteria) {
              output += `- ${criterion}\n`;
            }
          }

          output += `\n`;
        }
      }

      return output;
    }

    // Plain text format
    return JSON.stringify(plan, null, 2);
  }
}

// Export for use in other scripts
module.exports = { ProjectPlanGenerator };

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Project Plan Generator

Usage:
  node project-plan-generator.js <spec-file> [options]

Options:
  --format <json|markdown|text>  Output format (default: markdown)
  --output <file>                Save to file instead of stdout

Examples:
  node project-plan-generator.js specs/implementation.md
  node project-plan-generator.js specs/implementation.md --format json --output plan.json
    `);
    process.exit(0);
  }

  const specPath = args[0];
  const format = args.find((arg, i) => args[i - 1] === '--format') || 'markdown';
  const outputFile = args.find((arg, i) => args[i - 1] === '--output');

  const generator = new ProjectPlanGenerator();

  (async () => {
    try {
      console.error('Parsing specification...');
      const spec = await generator.parseSpecification(specPath);

      if (!spec.requirements || !Array.isArray(spec.requirements) || spec.requirements.length === 0) {
        throw new Error('No requirements found in specification');
      }

      console.error(`Found ${spec.requirements.length} requirements`);
      console.error('Generating project plan...');

      const plan = generator.generatePlan(spec);

      console.error(`Generated plan with ${plan.phases.length} phases, ${plan.metadata.estimatedTotalHours} hours total\n`);

      const output = generator.exportPlan(plan, format);

      if (outputFile) {
        fs.writeFileSync(outputFile, output);
        console.error(`Plan saved to ${outputFile}`);
      } else {
        console.log(output);
      }

    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })();
}
