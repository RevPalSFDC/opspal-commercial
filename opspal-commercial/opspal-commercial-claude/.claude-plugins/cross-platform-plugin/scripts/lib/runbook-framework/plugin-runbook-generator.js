#!/usr/bin/env node

/**
 * Plugin Runbook Generator
 *
 * NEW capability: Generates runbooks for Claude Code plugins themselves,
 * documenting agent selection, workflows, best practices, and usage patterns.
 *
 * This is different from instance runbooks (Salesforce org, HubSpot portal).
 * Plugin runbooks document how to USE a plugin effectively.
 *
 * Features:
 * - Plugin structure analysis (agents, commands, scripts, hooks)
 * - Agent workflow documentation
 * - Best practices generation
 * - Agent selection guidance
 * - Command/script reference
 *
 * Output:
 * - PLUGIN_RUNBOOK.md - Comprehensive plugin usage guide
 * - docs/AGENT_WORKFLOWS.md - Agent decision tree
 * - docs/BEST_PRACTICES.md - Operational best practices
 *
 * @module runbook-framework/plugin-runbook-generator
 */

const fs = require('fs');
const path = require('path');
const { SimpleTemplateEngine } = require('./core/renderer');

/**
 * Plugin Runbook Generator
 */
class PluginRunbookGenerator {
  /**
   * Create a new plugin runbook generator
   * @param {Object} options - Configuration options
   * @param {string} options.pluginPath - Path to the plugin directory
   */
  constructor(options = {}) {
    this.pluginPath = options.pluginPath || process.cwd();
    this.pluginName = path.basename(this.pluginPath);
    this.outputDir = options.outputDir || path.join(this.pluginPath, 'docs', 'runbooks');
  }

  /**
   * Analyze plugin structure
   * @returns {Object} Plugin structure analysis
   */
  analyzePlugin() {
    const analysis = {
      name: this.pluginName,
      path: this.pluginPath,
      manifest: null,
      agents: [],
      commands: [],
      scripts: [],
      hooks: [],
      templates: [],
      statistics: {
        agentCount: 0,
        commandCount: 0,
        scriptCount: 0,
        hookCount: 0
      }
    };

    // Load plugin manifest
    const manifestPath = path.join(this.pluginPath, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(manifestPath)) {
      try {
        analysis.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.warn(`Failed to parse plugin.json: ${err.message}`);
      }
    }

    // Analyze agents
    const agentsDir = path.join(this.pluginPath, 'agents');
    if (fs.existsSync(agentsDir)) {
      analysis.agents = this.analyzeAgents(agentsDir);
      analysis.statistics.agentCount = analysis.agents.length;
    }

    // Analyze commands
    const commandsDir = path.join(this.pluginPath, 'commands');
    if (fs.existsSync(commandsDir)) {
      analysis.commands = this.analyzeCommands(commandsDir);
      analysis.statistics.commandCount = analysis.commands.length;
    }

    // Analyze scripts
    const scriptsDir = path.join(this.pluginPath, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      analysis.scripts = this.analyzeScripts(scriptsDir);
      analysis.statistics.scriptCount = analysis.scripts.length;
    }

    // Analyze hooks
    const hooksDir = path.join(this.pluginPath, 'hooks');
    if (fs.existsSync(hooksDir)) {
      analysis.hooks = this.analyzeHooks(hooksDir);
      analysis.statistics.hookCount = analysis.hooks.length;
    }

    return analysis;
  }

  /**
   * Analyze agents directory
   * @param {string} agentsDir - Path to agents directory
   * @returns {Array} Agent analysis array
   */
  analyzeAgents(agentsDir) {
    const agents = [];

    fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .forEach(file => {
        const filePath = path.join(agentsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Parse YAML frontmatter
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        let frontmatter = {};
        if (frontmatterMatch) {
          try {
            // Simple YAML parsing
            frontmatterMatch[1].split('\n').forEach(line => {
              const colonIdx = line.indexOf(':');
              if (colonIdx > 0) {
                const key = line.substring(0, colonIdx).trim();
                const value = line.substring(colonIdx + 1).trim();
                frontmatter[key] = value;
              }
            });
          } catch (err) {
            // Ignore parsing errors
          }
        }

        // Extract description from content
        const descMatch = content.match(/^#+\s+.*?\n+(.+?)(?:\n\n|$)/m);
        const description = descMatch
          ? descMatch[1].trim().substring(0, 200)
          : 'No description available';

        // Extract tools from frontmatter
        const tools = frontmatter.tools
          ? frontmatter.tools.split(',').map(t => t.trim())
          : [];

        // Detect agent category from name
        const name = path.basename(file, '.md');
        const category = this.categorizeAgent(name);

        agents.push({
          name,
          file,
          description,
          tools,
          category,
          frontmatter,
          lineCount: content.split('\n').length
        });
      });

    return agents;
  }

  /**
   * Categorize agent by name
   * @param {string} name - Agent name
   * @returns {string} Category
   */
  categorizeAgent(name) {
    if (name.includes('orchestrator') || name.includes('coordinator')) {
      return 'Orchestration';
    }
    if (name.includes('auditor') || name.includes('analyzer') || name.includes('assessor')) {
      return 'Assessment';
    }
    if (name.includes('builder') || name.includes('creator') || name.includes('developer')) {
      return 'Creation';
    }
    if (name.includes('manager') || name.includes('admin')) {
      return 'Management';
    }
    if (name.includes('validator') || name.includes('checker')) {
      return 'Validation';
    }
    if (name.includes('specialist')) {
      return 'Specialized';
    }
    return 'General';
  }

  /**
   * Analyze commands directory
   * @param {string} commandsDir - Path to commands directory
   * @returns {Array} Command analysis array
   */
  analyzeCommands(commandsDir) {
    const commands = [];

    fs.readdirSync(commandsDir)
      .filter(f => f.endsWith('.md'))
      .forEach(file => {
        const filePath = path.join(commandsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract description from first line after frontmatter
        const descMatch = content.match(/^#+\s+.*?\n+(.+?)(?:\n\n|$)/m);
        const description = descMatch
          ? descMatch[1].trim().substring(0, 200)
          : 'No description available';

        commands.push({
          name: '/' + path.basename(file, '.md'),
          file,
          description
        });
      });

    return commands;
  }

  /**
   * Analyze scripts directory
   * @param {string} scriptsDir - Path to scripts directory
   * @returns {Array} Script analysis array
   */
  analyzeScripts(scriptsDir) {
    const scripts = [];

    const walkDir = (dir, prefix = '') => {
      fs.readdirSync(dir).forEach(item => {
        const fullPath = path.join(dir, item);
        const relativePath = prefix ? `${prefix}/${item}` : item;

        if (fs.statSync(fullPath).isDirectory()) {
          walkDir(fullPath, relativePath);
        } else if (item.endsWith('.js') || item.endsWith('.sh')) {
          scripts.push({
            name: relativePath,
            path: fullPath,
            type: item.endsWith('.js') ? 'JavaScript' : 'Shell'
          });
        }
      });
    };

    walkDir(scriptsDir);
    return scripts;
  }

  /**
   * Analyze hooks directory
   * @param {string} hooksDir - Path to hooks directory
   * @returns {Array} Hook analysis array
   */
  analyzeHooks(hooksDir) {
    const hooks = [];

    fs.readdirSync(hooksDir)
      .filter(f => f.endsWith('.sh'))
      .forEach(file => {
        const filePath = path.join(hooksDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Detect hook type from name
        let hookType = 'unknown';
        if (file.startsWith('pre-')) hookType = 'pre-operation';
        if (file.startsWith('post-')) hookType = 'post-operation';
        if (file.includes('user-prompt')) hookType = 'user-prompt';
        if (file.includes('session')) hookType = 'session';

        hooks.push({
          name: file,
          type: hookType,
          lineCount: content.split('\n').length
        });
      });

    return hooks;
  }

  /**
   * Generate agent selection guidance
   * @param {Array} agents - Analyzed agents
   * @returns {Object} Selection guidance
   */
  generateAgentGuidance(agents) {
    const guidance = {
      byCategory: {},
      byTask: [],
      decisionTree: []
    };

    // Group by category
    agents.forEach(agent => {
      if (!guidance.byCategory[agent.category]) {
        guidance.byCategory[agent.category] = [];
      }
      guidance.byCategory[agent.category].push(agent);
    });

    // Generate task-based guidance
    const taskPatterns = [
      { keywords: ['audit', 'analyze', 'assess'], task: 'Analysis & Assessment' },
      { keywords: ['deploy', 'migration', 'release'], task: 'Deployment' },
      { keywords: ['create', 'build', 'generate'], task: 'Creation' },
      { keywords: ['report', 'dashboard'], task: 'Reporting' },
      { keywords: ['data', 'import', 'export'], task: 'Data Operations' },
      { keywords: ['permission', 'security', 'access'], task: 'Security' },
      { keywords: ['workflow', 'flow', 'automation'], task: 'Automation' }
    ];

    taskPatterns.forEach(pattern => {
      const matchingAgents = agents.filter(agent =>
        pattern.keywords.some(kw => agent.name.includes(kw) || agent.description.toLowerCase().includes(kw))
      );

      if (matchingAgents.length > 0) {
        guidance.byTask.push({
          task: pattern.task,
          agents: matchingAgents.map(a => a.name)
        });
      }
    });

    // Generate decision tree nodes
    guidance.decisionTree = [
      {
        question: 'Is this a read-only analysis task?',
        yes: agents.filter(a => a.category === 'Assessment').map(a => a.name),
        no: 'Continue to next question'
      },
      {
        question: 'Does this involve multiple agents or complex orchestration?',
        yes: agents.filter(a => a.category === 'Orchestration').map(a => a.name),
        no: 'Continue to next question'
      },
      {
        question: 'Is this creating new automation or configuration?',
        yes: agents.filter(a => a.category === 'Creation').map(a => a.name),
        no: 'Use a specialized or general agent'
      }
    ];

    return guidance;
  }

  /**
   * Generate best practices from analysis
   * @param {Object} analysis - Plugin analysis
   * @returns {Array} Best practices
   */
  generateBestPractices(analysis) {
    const practices = [];

    // General practices
    practices.push(
      'Always check the agent decision tree before starting work',
      'Use orchestrator agents for complex multi-step operations',
      'Run assessment agents before making major changes',
      'Use `/reflect` after sessions to capture patterns'
    );

    // Hook-specific practices
    if (analysis.hooks.some(h => h.type === 'pre-operation')) {
      practices.push(
        'Pre-operation hooks provide automatic validation - review their output'
      );
    }

    // Agent-specific practices
    if (analysis.agents.some(a => a.name.includes('validator'))) {
      practices.push(
        'Use validator agents to check configurations before deployment'
      );
    }

    // Script-specific practices
    if (analysis.scripts.length > 20) {
      practices.push(
        'This plugin has extensive scripting - check scripts/lib/ for reusable utilities'
      );
    }

    return practices;
  }

  /**
   * Generate the plugin runbook
   * @returns {Promise<Object>} Generation result
   */
  async generate() {
    console.log(`📚 Generating runbook for plugin: ${this.pluginName}`);
    console.log('');

    // Analyze plugin
    console.log('🔍 Analyzing plugin structure...');
    const analysis = this.analyzePlugin();
    console.log(`   Agents: ${analysis.statistics.agentCount}`);
    console.log(`   Commands: ${analysis.statistics.commandCount}`);
    console.log(`   Scripts: ${analysis.statistics.scriptCount}`);
    console.log(`   Hooks: ${analysis.statistics.hookCount}`);
    console.log('');

    // Generate guidance
    console.log('🎯 Generating agent selection guidance...');
    const guidance = this.generateAgentGuidance(analysis.agents);
    console.log(`   Categories: ${Object.keys(guidance.byCategory).length}`);
    console.log(`   Task mappings: ${guidance.byTask.length}`);
    console.log('');

    // Generate best practices
    console.log('✅ Generating best practices...');
    const bestPractices = this.generateBestPractices(analysis);
    console.log(`   Practices: ${bestPractices.length}`);
    console.log('');

    // Ensure output directory
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Generate main runbook
    console.log('📝 Writing PLUGIN_RUNBOOK.md...');
    const runbookContent = this.renderMainRunbook(analysis, guidance, bestPractices);
    const runbookPath = path.join(this.outputDir, 'PLUGIN_RUNBOOK.md');
    fs.writeFileSync(runbookPath, runbookContent, 'utf-8');

    // Generate agent workflows
    console.log('📝 Writing AGENT_WORKFLOWS.md...');
    const workflowsContent = this.renderAgentWorkflows(analysis.agents, guidance);
    const workflowsPath = path.join(this.outputDir, 'AGENT_WORKFLOWS.md');
    fs.writeFileSync(workflowsPath, workflowsContent, 'utf-8');

    // Generate best practices
    console.log('📝 Writing BEST_PRACTICES.md...');
    const practicesContent = this.renderBestPractices(bestPractices, analysis);
    const practicesPath = path.join(this.outputDir, 'BEST_PRACTICES.md');
    fs.writeFileSync(practicesPath, practicesContent, 'utf-8');

    console.log('');
    console.log('✅ Plugin runbook generated successfully!');
    console.log(`   Output: ${this.outputDir}`);

    return {
      success: true,
      outputDir: this.outputDir,
      files: [
        runbookPath,
        workflowsPath,
        practicesPath
      ],
      analysis,
      guidance,
      bestPractices
    };
  }

  /**
   * Render the main plugin runbook
   * @param {Object} analysis - Plugin analysis
   * @param {Object} guidance - Agent guidance
   * @param {Array} bestPractices - Best practices
   * @returns {string} Rendered content
   */
  renderMainRunbook(analysis, guidance, bestPractices) {
    const lines = [];

    lines.push(`# ${analysis.manifest?.name || analysis.name} Plugin Runbook`);
    lines.push('');
    lines.push(`**Version:** ${analysis.manifest?.version || 'Unknown'}`);
    lines.push(`**Last Updated:** ${new Date().toISOString().split('T')[0]}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Overview
    lines.push('## Overview');
    lines.push('');
    if (analysis.manifest?.description) {
      lines.push(analysis.manifest.description);
    }
    lines.push('');
    lines.push('| Component | Count |');
    lines.push('|-----------|-------|');
    lines.push(`| Agents | ${analysis.statistics.agentCount} |`);
    lines.push(`| Commands | ${analysis.statistics.commandCount} |`);
    lines.push(`| Scripts | ${analysis.statistics.scriptCount} |`);
    lines.push(`| Hooks | ${analysis.statistics.hookCount} |`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Quick Start
    lines.push('## Quick Start');
    lines.push('');
    lines.push('### Agent Selection');
    lines.push('');
    lines.push('| Task Type | Recommended Agents |');
    lines.push('|-----------|-------------------|');
    guidance.byTask.forEach(task => {
      lines.push(`| ${task.task} | ${task.agents.slice(0, 3).join(', ')}${task.agents.length > 3 ? '...' : ''} |`);
    });
    lines.push('');
    lines.push('See [AGENT_WORKFLOWS.md](./AGENT_WORKFLOWS.md) for the complete decision tree.');
    lines.push('');
    lines.push('---');
    lines.push('');

    // Available Commands
    if (analysis.commands.length > 0) {
      lines.push('## Available Commands');
      lines.push('');
      analysis.commands.forEach(cmd => {
        lines.push(`- \`${cmd.name}\` - ${cmd.description}`);
      });
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    // Best Practices Summary
    lines.push('## Best Practices');
    lines.push('');
    bestPractices.slice(0, 5).forEach(practice => {
      lines.push(`- ${practice}`);
    });
    lines.push('');
    lines.push('See [BEST_PRACTICES.md](./BEST_PRACTICES.md) for the complete guide.');
    lines.push('');
    lines.push('---');
    lines.push('');

    // Footer
    lines.push('*Generated by the Cross-Platform Runbook Framework*');

    return lines.join('\n');
  }

  /**
   * Render agent workflows document
   * @param {Array} agents - Analyzed agents
   * @param {Object} guidance - Agent guidance
   * @returns {string} Rendered content
   */
  renderAgentWorkflows(agents, guidance) {
    const lines = [];

    lines.push('# Agent Workflows');
    lines.push('');
    lines.push(`**Total Agents:** ${agents.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Decision Tree
    lines.push('## Agent Selection Decision Tree');
    lines.push('');
    guidance.decisionTree.forEach((node, idx) => {
      lines.push(`### ${idx + 1}. ${node.question}`);
      lines.push('');
      if (Array.isArray(node.yes) && node.yes.length > 0) {
        lines.push('**Yes →** Use one of:');
        node.yes.forEach(agent => {
          lines.push(`- \`${agent}\``);
        });
      } else if (node.yes) {
        lines.push(`**Yes →** ${node.yes}`);
      }
      lines.push('');
      lines.push(`**No →** ${node.no}`);
      lines.push('');
    });
    lines.push('---');
    lines.push('');

    // Agents by Category
    lines.push('## Agents by Category');
    lines.push('');

    Object.entries(guidance.byCategory).forEach(([category, categoryAgents]) => {
      lines.push(`### ${category}`);
      lines.push('');
      lines.push('| Agent | Description |');
      lines.push('|-------|-------------|');
      categoryAgents.forEach(agent => {
        lines.push(`| \`${agent.name}\` | ${agent.description.substring(0, 100)}${agent.description.length > 100 ? '...' : ''} |`);
      });
      lines.push('');
    });

    // Agents by Task
    lines.push('---');
    lines.push('');
    lines.push('## Agents by Task Type');
    lines.push('');

    guidance.byTask.forEach(task => {
      lines.push(`### ${task.task}`);
      lines.push('');
      task.agents.forEach(agent => {
        lines.push(`- \`${agent}\``);
      });
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Render best practices document
   * @param {Array} bestPractices - Best practices
   * @param {Object} analysis - Plugin analysis
   * @returns {string} Rendered content
   */
  renderBestPractices(bestPractices, analysis) {
    const lines = [];

    lines.push('# Best Practices');
    lines.push('');
    lines.push(`**Plugin:** ${analysis.name}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    lines.push('## General Practices');
    lines.push('');
    bestPractices.forEach(practice => {
      lines.push(`- ${practice}`);
    });
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('## When to Use This Plugin');
    lines.push('');
    lines.push('✅ **Do use when:**');
    lines.push('- Working with the platform this plugin supports');
    lines.push('- Need specialized agents for complex operations');
    lines.push('- Want pre-built validation and error prevention');
    lines.push('');
    lines.push('❌ **Don\'t use when:**');
    lines.push('- Simple one-off operations that don\'t need agents');
    lines.push('- Working with a different platform');
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push('## Troubleshooting');
    lines.push('');
    lines.push('### Agent Not Found');
    lines.push('1. Verify plugin is installed: `/plugin list`');
    lines.push('2. Check agent name spelling');
    lines.push('3. Run `/agents` to see available agents');
    lines.push('');
    lines.push('### Hook Errors');
    lines.push('1. Check hook permissions: `chmod +x hooks/*.sh`');
    lines.push('2. Review hook logs');
    lines.push('3. Disable temporarily with environment variable if needed');
    lines.push('');

    return lines.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  let pluginPath = process.cwd();
  let outputDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plugin' || args[i] === '-p') {
      pluginPath = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      outputDir = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Plugin Runbook Generator');
      console.log('');
      console.log('Usage: plugin-runbook-generator.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  -p, --plugin <path>  Plugin directory (default: current directory)');
      console.log('  -o, --output <path>  Output directory (default: <plugin>/docs/runbooks)');
      console.log('  -h, --help           Show this help message');
      console.log('');
      console.log('Example:');
      console.log('  node plugin-runbook-generator.js --plugin .claude-plugins/salesforce-plugin');
      process.exit(0);
    }
  }

  const generator = new PluginRunbookGenerator({
    pluginPath,
    outputDir
  });

  generator.generate().then(result => {
    if (result.success) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

// Export
module.exports = PluginRunbookGenerator;
