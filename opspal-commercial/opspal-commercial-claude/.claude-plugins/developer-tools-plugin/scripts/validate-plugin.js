#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Plugin Validation Script
 *
 * Comprehensive validation of plugin structure, naming, manifests, and quality
 *
 * Usage:
 *   node validate-plugin.js <plugin-dir>
 *   node validate-plugin.js <plugin-dir> --json
 *   node validate-plugin.js <plugin-dir> --fix (auto-fix issues when possible)
 */

class PluginValidator {
  constructor(pluginDir, options = {}) {
    this.pluginDir = path.resolve(pluginDir);
    this.options = options;

    // Validation patterns
    this.PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*-plugin$/;
    this.AGENT_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.md$/;
    this.SCRIPT_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.js$/;
    this.SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

    // Valid tools list
    this.VALID_TOOLS = [
      'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
      'TodoWrite', 'Task', 'ExitPlanMode', 'WebFetch', 'WebSearch',
      'NotebookEdit', 'BashOutput', 'KillShell', 'SlashCommand'
    ];

    // Results
    this.issues = [];
    this.warnings = [];
  }

  /**
   * Main validation workflow
   */
  async validate() {
    try {
      // Use stderr for progress in JSON mode to avoid corrupting output
      const log = this.options.json ? console.error : console.log;
      log(`\n🔍 Validating Plugin: ${path.basename(this.pluginDir)}\n`);

      // Check if plugin directory exists
      if (!fs.existsSync(this.pluginDir)) {
        throw new Error(`Plugin directory not found: ${this.pluginDir}`);
      }

      // Run validation checks
      const manifest = await this.validateStructure();
      await this.validateManifest(manifest);
      await this.validateNaming(manifest);
      await this.validateAgents();
      await this.validateDocumentation();
      await this.validateDependencies(manifest);

      // Calculate quality score
      const qualityScore = this.calculateQualityScore();

      // Generate report
      const report = this.generateReport(manifest, qualityScore);

      // Output results
      if (this.options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        this.printReport(report);
      }

      // Return exit code based on quality
      const passed = qualityScore.score >= 80 && this.issues.filter(i => i.severity === 'critical').length === 0;

      return {
        passed,
        report,
        exitCode: passed ? 0 : 1
      };

    } catch (error) {
      console.error(`\n❌ Validation failed: ${error.message}\n`);
      return {
        passed: false,
        error: error.message,
        exitCode: 1
      };
    }
  }

  /**
   * Validate plugin structure
   */
  async validateStructure() {
    const required = [
      '.claude-plugin',
      '.claude-plugin/plugin.json',
      'agents',
      'scripts',
      'README.md'
    ];

    const optional = [
      'commands',
      'hooks',
      'tests',
      '.gitignore'
    ];

    // Check required files/directories
    required.forEach(item => {
      const itemPath = path.join(this.pluginDir, item);
      if (!fs.existsSync(itemPath)) {
        this.addIssue('critical', 'structure', {
          message: `Missing required: ${item}`,
          remediation: `Create ${item}`
        });
      }
    });

    // Check optional (warn if missing)
    optional.forEach(item => {
      const itemPath = path.join(this.pluginDir, item);
      if (!fs.existsSync(itemPath)) {
        this.addWarning('structure', {
          message: `Missing recommended: ${item}`,
          suggestion: `Consider adding ${item}`
        });
      }
    });

    // Load manifest
    const manifestPath = path.join(this.pluginDir, '.claude-plugin/plugin.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('plugin.json not found - cannot continue validation');
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest;
  }

  /**
   * Validate manifest
   */
  async validateManifest(manifest) {
    const required = [
      'name',
      'description',
      'version',
      'author',
      'keywords',
      'repository'
    ];

    // Check required fields
    required.forEach(field => {
      if (!manifest[field]) {
        this.addIssue('critical', 'manifest', {
          field,
          message: `Missing required field: ${field}`,
          remediation: `Add ${field} to plugin.json`
        });
      }
    });

    // Validate version format
    if (manifest.version && !this.SEMVER_PATTERN.test(manifest.version)) {
      this.addIssue('high', 'manifest', {
        field: 'version',
        message: `Invalid version format: ${manifest.version}`,
        expected: 'Semantic versioning (e.g., 1.0.0)',
        remediation: 'Update to semver format'
      });
    }

    // Validate author
    if (manifest.author) {
      if (!manifest.author.name) {
        this.addIssue('high', 'manifest', {
          field: 'author.name',
          message: 'Author name is required'
        });
      }
      if (!manifest.author.email) {
        this.addIssue('high', 'manifest', {
          field: 'author.email',
          message: 'Author email is required'
        });
      }
    }

    // Validate keywords (at least 2)
    if (!Array.isArray(manifest.keywords) || manifest.keywords.length < 2) {
      this.addIssue('medium', 'manifest', {
        field: 'keywords',
        message: 'Should have at least 2 keywords for discoverability',
        suggestion: 'Add relevant keywords'
      });
    }

    // Validate repository
    if (manifest.repository && !manifest.repository.startsWith('http')) {
      this.addWarning('manifest', {
        field: 'repository',
        message: 'Repository should be a full URL',
        suggestion: 'Use https:// URL'
      });
    }
  }

  /**
   * Validate naming conventions
   */
  async validateNaming(manifest) {
    // Validate plugin name
    if (!this.PLUGIN_NAME_PATTERN.test(manifest.name)) {
      this.addIssue('critical', 'naming', {
        item: 'plugin name',
        actual: manifest.name,
        message: 'Plugin name doesn\'t follow convention',
        expected: 'lowercase-hyphen-plugin format (e.g., my-plugin)',
        remediation: 'Rename plugin to follow convention'
      });
    }

    // Validate agent names
    const agentDir = path.join(this.pluginDir, 'agents');
    if (fs.existsSync(agentDir)) {
      const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');

      agentFiles.forEach(file => {
        if (!this.AGENT_NAME_PATTERN.test(file)) {
          this.addIssue('high', 'naming', {
            file: `agents/${file}`,
            message: `Agent file doesn't follow naming convention`,
            expected: 'lowercase-hyphen.md format',
            remediation: `Rename to follow convention`
          });
        }
      });
    }

    // Validate script names
    const scriptDir = path.join(this.pluginDir, 'scripts');
    if (fs.existsSync(scriptDir)) {
      const findScripts = (dir) => {
        let scripts = [];
        const items = fs.readdirSync(dir);

        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            scripts = scripts.concat(findScripts(fullPath));
          } else if (item.endsWith('.js') && item !== '.gitkeep') {
            scripts.push(path.relative(this.pluginDir, fullPath));
          }
        });

        return scripts;
      };

      const scriptFiles = findScripts(scriptDir);
      scriptFiles.forEach(file => {
        const basename = path.basename(file);
        if (!this.SCRIPT_NAME_PATTERN.test(basename)) {
          this.addIssue('medium', 'naming', {
            file,
            message: `Script file doesn't follow naming convention`,
            expected: 'lowercase-hyphen.js format',
            remediation: 'Rename to follow convention'
          });
        }
      });
    }
  }

  /**
   * Validate agent files
   */
  async validateAgents() {
    const agentDir = path.join(this.pluginDir, 'agents');
    if (!fs.existsSync(agentDir)) {
      return;
    }

    const agentFiles = fs.readdirSync(agentDir)
      .filter(f => f.endsWith('.md') && f !== '.gitkeep')
      .map(f => path.join(agentDir, f));

    if (agentFiles.length === 0) {
      this.addWarning('agents', {
        message: 'No agents found',
        suggestion: 'Add agents to agents/ directory'
      });
      return;
    }

    let validAgents = 0;

    agentFiles.forEach(agentPath => {
      const issues = this.validateAgentFile(agentPath);
      if (issues.length === 0) {
        validAgents++;
      }
    });

    // Use stderr for progress in JSON mode
    const log = this.options.json ? console.error : console.log;
    log(`   ✓ Agents: ${validAgents}/${agentFiles.length} valid`);
  }

  /**
   * Validate individual agent file
   */
  validateAgentFile(agentPath) {
    const content = fs.readFileSync(agentPath, 'utf8');
    const relativePath = path.relative(this.pluginDir, agentPath);
    const localIssues = [];

    // Check for YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      this.addIssue('critical', 'agents', {
        file: relativePath,
        message: 'Missing YAML frontmatter',
        remediation: 'Add frontmatter with name, description, tools'
      });
      return ['frontmatter_missing'];
    }

    // Parse frontmatter (simple parsing, not full YAML)
    const frontmatterLines = frontmatterMatch[1].split('\n');
    const frontmatter = {};

    frontmatterLines.forEach(line => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        frontmatter[match[1].trim()] = match[2].trim();
      }
    });

    // Validate required fields
    const required = ['name', 'description', 'tools'];
    required.forEach(field => {
      if (!frontmatter[field]) {
        this.addIssue('critical', 'agents', {
          file: relativePath,
          field,
          message: `Missing required frontmatter field: ${field}`,
          remediation: `Add ${field} to frontmatter`
        });
        localIssues.push(field);
      }
    });

    // Validate tools
    if (frontmatter.tools) {
      const tools = frontmatter.tools.split(',').map(t => t.trim());

      tools.forEach(tool => {
        if (!this.VALID_TOOLS.includes(tool)) {
          this.addIssue('medium', 'agents', {
            file: relativePath,
            message: `Unknown tool: ${tool}`,
            suggestion: `Valid tools: ${this.VALID_TOOLS.join(', ')}`
          });
          localIssues.push('invalid_tool');
        }
      });
    }

    // Check description length
    if (frontmatter.description && frontmatter.description.length < 20) {
      this.addIssue('low', 'agents', {
        file: relativePath,
        message: 'Description is too short (< 20 chars)',
        suggestion: 'Provide a more detailed description'
      });
    }

    // Check for core sections
    const hasResponsibilities = content.includes('## Core Responsibilities') ||
                                content.includes('## Responsibilities');
    if (!hasResponsibilities) {
      this.addIssue('medium', 'agents', {
        file: relativePath,
        message: 'Missing "Core Responsibilities" section',
        suggestion: 'Add section describing agent responsibilities'
      });
    }

    return localIssues;
  }

  /**
   * Validate documentation
   */
  async validateDocumentation() {
    const readmePath = path.join(this.pluginDir, 'README.md');

    if (!fs.existsSync(readmePath)) {
      this.addIssue('high', 'documentation', {
        file: 'README.md',
        message: 'README.md is missing',
        remediation: 'Create README.md with plugin documentation'
      });
      return;
    }

    const content = fs.readFileSync(readmePath, 'utf8');

    // Check for key sections
    const sections = [
      { name: 'Installation', pattern: /##\s*Installation/i },
      { name: 'Usage', pattern: /##\s*Usage/i },
      { name: 'Dependencies', pattern: /##\s*Dependencies/i }
    ];

    sections.forEach(section => {
      if (!section.pattern.test(content)) {
        this.addIssue('medium', 'documentation', {
          section: section.name,
          message: `README missing "${section.name}" section`,
          suggestion: `Add ## ${section.name} section`
        });
      }
    });

    // Check for code examples
    if (!content.includes('```')) {
      this.addWarning('documentation', {
        message: 'README has no code examples',
        suggestion: 'Add usage examples with code blocks'
      });
    }
  }

  /**
   * Validate dependencies
   */
  async validateDependencies(manifest) {
    if (!manifest.dependencies) {
      this.addWarning('dependencies', {
        message: 'No dependencies section',
        suggestion: 'Add dependencies section even if empty'
      });
      return;
    }

    // Validate CLI dependencies
    if (manifest.dependencies.cli) {
      Object.entries(manifest.dependencies.cli).forEach(([name, config]) => {
        if (!config.check) {
          this.addIssue('medium', 'dependencies', {
            dependency: name,
            type: 'CLI',
            message: 'Missing "check" command',
            remediation: 'Add check command (e.g., "sf --version")'
          });
        }

        if (!config.description) {
          this.addIssue('low', 'dependencies', {
            dependency: name,
            type: 'CLI',
            message: 'Missing description',
            suggestion: 'Add description explaining what this tool does'
          });
        }
      });
    }

    // Validate system dependencies
    if (manifest.dependencies.system) {
      Object.entries(manifest.dependencies.system).forEach(([name, config]) => {
        if (!config.install || typeof config.install !== 'object') {
          this.addIssue('medium', 'dependencies', {
            dependency: name,
            type: 'system',
            message: 'Should have platform-specific install commands',
            example: '{ "linux": "apt-get install", "darwin": "brew install" }'
          });
        }
      });
    }
  }

  /**
   * Calculate quality score
   */
  calculateQualityScore() {
    let score = 100;

    // Deductions by severity
    const deductions = {
      critical: 25,
      high: 10,
      medium: 5,
      low: 2
    };

    // Count issues by severity
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    this.issues.forEach(issue => {
      counts[issue.severity]++;
      score -= deductions[issue.severity];
    });

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    // Determine grade
    let grade;
    if (score >= 95) grade = 'A+';
    else if (score >= 90) grade = 'A';
    else if (score >= 85) grade = 'B+';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';

    return {
      score,
      grade,
      breakdown: counts
    };
  }

  /**
   * Generate validation report
   */
  generateReport(manifest, qualityScore) {
    return {
      plugin: manifest.name,
      version: manifest.version,
      validatedAt: new Date().toISOString(),
      qualityScore,
      summary: {
        critical: qualityScore.breakdown.critical,
        high: qualityScore.breakdown.high,
        medium: qualityScore.breakdown.medium,
        low: qualityScore.breakdown.low,
        total: this.issues.length
      },
      issues: this.issues,
      warnings: this.warnings,
      passed: qualityScore.score >= 80 && qualityScore.breakdown.critical === 0,
      recommendation: this.getRecommendation(qualityScore)
    };
  }

  /**
   * Get recommendation based on score
   */
  getRecommendation(qualityScore) {
    if (qualityScore.breakdown.critical > 0) {
      return 'Fix critical issues immediately - plugin cannot be published';
    } else if (qualityScore.score < 80) {
      return 'Fix high and medium priority issues before publishing';
    } else if (qualityScore.score < 90) {
      return 'Good quality - consider fixing medium priority issues';
    } else if (qualityScore.score < 95) {
      return 'Very good quality - ready for publishing';
    } else {
      return 'Excellent quality - best practices followed';
    }
  }

  /**
   * Print formatted report
   */
  printReport(report) {
    console.log(`📊 Validation Summary:`);
    console.log(`   Plugin: ${report.plugin}`);
    console.log(`   Version: ${report.version}`);
    console.log(`   Quality Score: ${report.qualityScore.score}/100 (${report.qualityScore.grade})\n`);

    // Print summary
    if (report.summary.total === 0) {
      console.log(`✅ No issues found!\n`);
    } else {
      console.log(`📋 Issues Found (${report.summary.total}):`);
      if (report.summary.critical > 0) console.log(`   🔴 Critical: ${report.summary.critical}`);
      if (report.summary.high > 0) console.log(`   🟠 High: ${report.summary.high}`);
      if (report.summary.medium > 0) console.log(`   🟡 Medium: ${report.summary.medium}`);
      if (report.summary.low > 0) console.log(`   🔵 Low: ${report.summary.low}`);
      console.log('');
    }

    // Print issues
    if (report.issues.length > 0) {
      console.log(`🔍 Detailed Issues:\n`);

      ['critical', 'high', 'medium', 'low'].forEach(severity => {
        const severityIssues = report.issues.filter(i => i.severity === severity);

        if (severityIssues.length > 0) {
          const icon = severity === 'critical' ? '🔴' :
                      severity === 'high' ? '🟠' :
                      severity === 'medium' ? '🟡' : '🔵';

          console.log(`${icon} ${severity.toUpperCase()}:`);
          severityIssues.forEach(issue => {
            console.log(`   ${issue.message}`);
            if (issue.file) console.log(`      File: ${issue.file}`);
            if (issue.remediation) console.log(`      Fix: ${issue.remediation}`);
            if (issue.suggestion) console.log(`      Suggestion: ${issue.suggestion}`);
            console.log('');
          });
        }
      });
    }

    // Print recommendation
    console.log(`💡 Recommendation: ${report.recommendation}\n`);

    // Print result
    if (report.passed) {
      console.log(`✅ Plugin validation PASSED\n`);
    } else {
      console.log(`❌ Plugin validation FAILED\n`);
    }
  }

  /**
   * Add issue
   */
  addIssue(severity, category, details) {
    this.issues.push({
      severity,
      category,
      ...details
    });
  }

  /**
   * Add warning
   */
  addWarning(category, details) {
    this.warnings.push({
      category,
      ...details
    });
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Plugin Validator

Usage:
  node validate-plugin.js <plugin-dir>              # Validate plugin
  node validate-plugin.js <plugin-dir> --json       # JSON output
  node validate-plugin.js <plugin-dir> --help       # Show help

Examples:
  node validate-plugin.js .claude-plugins/salesforce-plugin
  node validate-plugin.js . --json
    `);
    process.exit(0);
  }

  const pluginDir = args[0];
  const options = {
    json: args.includes('--json'),
    fix: args.includes('--fix')
  };

  const validator = new PluginValidator(pluginDir, options);
  validator.validate().then(result => {
    // In JSON mode, always exit 0 - let the caller decide based on output
    // In non-JSON mode, exit with actual code for human-readable feedback
    process.exit(options.json ? 0 : result.exitCode);
  });
}

module.exports = PluginValidator;
