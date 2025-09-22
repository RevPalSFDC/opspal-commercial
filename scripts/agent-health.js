#!/usr/bin/env node

/**
 * Agent Health Check System
 * Validates agent configurations, tool availability, and connectivity
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execSync } = require('child_process');

class AgentHealthChecker {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.autoFix = options.autoFix || false;
    this.directories = [
      '.claude/agents',
      'platforms/SFDC/.claude/agents',
      'platforms/HS/.claude/agents'
    ];
    this.requiredFields = ['name', 'model', 'description', 'tools'];
    this.validModels = ['sonnet', 'opus', 'haiku'];
    this.mcpServers = this.loadMcpServers();
    this.results = {
      healthy: [],
      warnings: [],
      errors: [],
      fixed: []
    };
  }

  /**
   * Load MCP server configuration
   */
  loadMcpServers() {
    try {
      if (fs.existsSync('.mcp.json')) {
        const config = JSON.parse(fs.readFileSync('.mcp.json', 'utf8'));
        return Object.keys(config.mcpServers || {});
      }
    } catch (error) {
      console.warn('Warning: Could not load .mcp.json');
    }
    return [];
  }

  /**
   * Run full health check
   */
  async runHealthCheck() {
    console.log('🏥 Starting Agent Health Check...\n');

    // Check each directory
    for (const dir of this.directories) {
      if (fs.existsSync(dir)) {
        await this.checkDirectory(dir);
      } else {
        this.log(`Directory not found: ${dir}`, 'warn');
      }
    }

    // Check agent routing
    await this.checkAgentRouting();

    // Check MCP connectivity
    await this.checkMcpConnectivity();

    // Check script dependencies
    await this.checkScriptDependencies();

    // Generate report
    this.generateReport();

    return this.results;
  }

  /**
   * Check all agents in a directory
   */
  async checkDirectory(dir) {
    this.log(`Checking ${dir}...`);

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(dir, file);
      await this.checkAgent(filePath);
    }
  }

  /**
   * Check individual agent
   */
  async checkAgent(filePath) {
    const agentName = path.basename(filePath, '.md');
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    const warnings = [];

    try {
      // Extract YAML frontmatter
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!yamlMatch) {
        issues.push('Missing YAML frontmatter');
      } else {
        const frontmatter = yaml.load(yamlMatch[1]);

        // Check required fields
        for (const field of this.requiredFields) {
          if (!frontmatter[field]) {
            issues.push(`Missing required field: ${field}`);
          }
        }

        // Validate name matches filename
        if (frontmatter.name && frontmatter.name !== agentName) {
          issues.push(`Name mismatch: ${frontmatter.name} != ${agentName}`);
          if (this.autoFix) {
            frontmatter.name = agentName;
            this.fixAgent(filePath, frontmatter, content);
            this.results.fixed.push(`${agentName}: Fixed name mismatch`);
          }
        }

        // Validate model
        if (frontmatter.model && !this.validModels.includes(frontmatter.model)) {
          warnings.push(`Unknown model: ${frontmatter.model}`);
        }

        // Check tools availability
        if (frontmatter.tools) {
          const tools = frontmatter.tools.split(',').map(t => t.trim());
          for (const tool of tools) {
            if (!this.isToolAvailable(tool)) {
              warnings.push(`Tool may not be available: ${tool}`);
            }
          }
        }

        // Check for stage if mentioned
        if (content.includes('stage:') && !frontmatter.stage) {
          warnings.push('Agent mentions stage but no stage field in frontmatter');
        }
      }

      // Check content structure
      if (!content.includes('## Instructions')) {
        warnings.push('Missing ## Instructions section');
      }

      if (!content.includes('## Context')) {
        warnings.push('Missing ## Context section');
      }

      // Record results
      if (issues.length > 0) {
        this.results.errors.push({
          agent: agentName,
          path: filePath,
          issues
        });
      } else if (warnings.length > 0) {
        this.results.warnings.push({
          agent: agentName,
          path: filePath,
          warnings
        });
      } else {
        this.results.healthy.push({
          agent: agentName,
          path: filePath
        });
      }

    } catch (error) {
      this.results.errors.push({
        agent: agentName,
        path: filePath,
        issues: [`Parse error: ${error.message}`]
      });
    }
  }

  /**
   * Check if tool is available
   */
  isToolAvailable(tool) {
    // Check for MCP tools
    if (tool.startsWith('mcp_') || tool.startsWith('mcp__')) {
      const serverName = tool.split('_')[1];
      return this.mcpServers.includes(serverName);
    }

    // Standard Claude Code tools
    const standardTools = [
      'Read', 'Write', 'Edit', 'MultiEdit',
      'Bash', 'Task', 'WebFetch', 'WebSearch',
      'Grep', 'Glob', 'TodoWrite', 'NotebookEdit',
      'ExitPlanMode', 'BashOutput', 'KillShell'
    ];

    return standardTools.includes(tool) || tool === '*';
  }

  /**
   * Fix agent configuration
   */
  fixAgent(filePath, frontmatter, content) {
    const yamlStr = '---\n' + yaml.dump(frontmatter) + '---';
    const newContent = content.replace(/^---\n[\s\S]*?\n---/, yamlStr);
    fs.writeFileSync(filePath, newContent);
  }

  /**
   * Check agent routing configuration
   */
  async checkAgentRouting() {
    this.log('Checking agent routing...');

    if (fs.existsSync('scripts/test-agent-routing.js')) {
      try {
        const output = execSync('node scripts/test-agent-routing.js', {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        if (output.includes('FAIL')) {
          const failures = output.match(/FAIL: .+/g) || [];
          this.results.warnings.push({
            component: 'Agent Routing',
            warnings: failures
          });
        }
      } catch (error) {
        this.results.errors.push({
          component: 'Agent Routing',
          issues: ['Routing tests failed to execute']
        });
      }
    }
  }

  /**
   * Check MCP server connectivity
   */
  async checkMcpConnectivity() {
    this.log('Checking MCP connectivity...');

    for (const server of this.mcpServers) {
      try {
        // Check if server is running
        const status = execSync(`claude mcp status ${server} 2>/dev/null`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        if (!status.includes('running')) {
          this.results.warnings.push({
            component: 'MCP',
            warnings: [`Server ${server} is not running`]
          });
        }
      } catch (error) {
        // Server check failed
        this.results.warnings.push({
          component: 'MCP',
          warnings: [`Cannot check status of ${server}`]
        });
      }
    }
  }

  /**
   * Check script dependencies
   */
  async checkScriptDependencies() {
    this.log('Checking script dependencies...');

    const requiredScripts = [
      'scripts/lib/conflict-detector.js',
      'scripts/lib/conflict-analyzer.js',
      'scripts/lib/conflict-resolver.js',
      'scripts/lib/field-conflict-scanner.js',
      'scripts/lib/validation-rule-analyzer.js'
    ];

    const missingScripts = [];
    for (const script of requiredScripts) {
      if (!fs.existsSync(script)) {
        missingScripts.push(script);
      }
    }

    if (missingScripts.length > 0) {
      this.results.errors.push({
        component: 'Script Libraries',
        issues: missingScripts.map(s => `Missing: ${s}`)
      });
    }

    // Check npm dependencies
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const requiredDeps = ['js-yaml'];
      const missingDeps = [];

      for (const dep of requiredDeps) {
        if (!packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]) {
          missingDeps.push(dep);
        }
      }

      if (missingDeps.length > 0) {
        this.results.warnings.push({
          component: 'NPM Dependencies',
          warnings: missingDeps.map(d => `Missing: ${d}`)
        });
      }
    } catch (error) {
      // Package.json check failed
    }
  }

  /**
   * Generate health report
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('                AGENT HEALTH REPORT');
    console.log('='.repeat(60) + '\n');

    // Summary
    const totalAgents = this.results.healthy.length +
                       this.results.warnings.length +
                       this.results.errors.length;

    console.log('📊 Summary:');
    console.log(`  Total Agents: ${totalAgents}`);
    console.log(`  ✅ Healthy: ${this.results.healthy.length}`);
    console.log(`  ⚠️  Warnings: ${this.results.warnings.length}`);
    console.log(`  ❌ Errors: ${this.results.errors.length}`);
    if (this.results.fixed.length > 0) {
      console.log(`  🔧 Auto-fixed: ${this.results.fixed.length}`);
    }
    console.log();

    // Healthy agents
    if (this.results.healthy.length > 0 && this.verbose) {
      console.log('✅ Healthy Agents:');
      for (const agent of this.results.healthy) {
        console.log(`  • ${agent.agent}`);
      }
      console.log();
    }

    // Warnings
    if (this.results.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      for (const item of this.results.warnings) {
        if (item.agent) {
          console.log(`  ${item.agent}:`);
          for (const warning of item.warnings) {
            console.log(`    - ${warning}`);
          }
        } else if (item.component) {
          console.log(`  ${item.component}:`);
          for (const warning of item.warnings) {
            console.log(`    - ${warning}`);
          }
        }
      }
      console.log();
    }

    // Errors
    if (this.results.errors.length > 0) {
      console.log('❌ Errors (Must Fix):');
      for (const item of this.results.errors) {
        if (item.agent) {
          console.log(`  ${item.agent} (${item.path}):`);
          for (const issue of item.issues) {
            console.log(`    - ${issue}`);
          }
        } else if (item.component) {
          console.log(`  ${item.component}:`);
          for (const issue of item.issues) {
            console.log(`    - ${issue}`);
          }
        }
      }
      console.log();
    }

    // Auto-fixes
    if (this.results.fixed.length > 0) {
      console.log('🔧 Auto-fixed Issues:');
      for (const fix of this.results.fixed) {
        console.log(`  • ${fix}`);
      }
      console.log();
    }

    // Recommendations
    console.log('💡 Recommendations:');
    if (this.results.errors.length > 0) {
      console.log('  1. Fix all errors before deploying');
      console.log('  2. Run with --auto-fix to attempt automatic fixes');
    }
    if (this.results.warnings.length > 0) {
      console.log('  3. Review warnings and update configurations');
    }
    console.log('  4. Run health check regularly (daily recommended)');
    console.log('  5. Add to CI/CD pipeline for continuous validation');
    console.log();

    // Overall status
    const healthScore = ((this.results.healthy.length / totalAgents) * 100).toFixed(1);
    console.log('='.repeat(60));
    if (this.results.errors.length === 0) {
      console.log(`✅ System Health: GOOD (${healthScore}% healthy)`);
    } else {
      console.log(`❌ System Health: NEEDS ATTENTION (${this.results.errors.length} errors)`);
    }
    console.log('='.repeat(60));
  }

  /**
   * Log message based on verbosity
   */
  log(message, level = 'info') {
    if (this.verbose || level === 'error' || level === 'warn') {
      const prefix = {
        info: '  ',
        warn: '⚠️ ',
        error: '❌ '
      };
      console.log(prefix[level] + message);
    }
  }

  /**
   * Export results as JSON
   */
  exportResults(outputFile) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.healthy.length + this.results.warnings.length + this.results.errors.length,
        healthy: this.results.healthy.length,
        warnings: this.results.warnings.length,
        errors: this.results.errors.length,
        fixed: this.results.fixed.length
      },
      details: this.results
    };

    fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report exported to ${outputFile}`);
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    autoFix: args.includes('--auto-fix')
  };

  const outputFile = args.includes('--output') ?
    args[args.indexOf('--output') + 1] : null;

  const checker = new AgentHealthChecker(options);

  checker.runHealthCheck().then(results => {
    if (outputFile) {
      checker.exportResults(outputFile);
    }

    // Exit with error code if issues found
    process.exit(results.errors.length > 0 ? 1 : 0);
  });
}

module.exports = AgentHealthChecker;