#!/usr/bin/env node

/**
 * Plugin Integration Tester
 *
 * Runs comprehensive integration tests for plugin installation, agent discovery,
 * functionality validation, and dependency checking.
 *
 * Usage:
 *   node test-plugin-installation.js --plugin <name>
 *   node test-plugin-installation.js --plugin <name> --level 1,2,3
 *   node test-plugin-installation.js --plugin <name> --all
 *
 * Examples:
 *   node test-plugin-installation.js --plugin my-plugin
 *   node test-plugin-installation.js --plugin my-plugin --level all --verbose
 *   node test-plugin-installation.js --plugin my-plugin --quick
 *   node test-plugin-installation.js --plugin my-plugin --json > report.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PluginIntegrationTester {
  constructor(options = {}) {
    this.options = options;
    this.marketplaceRoot = path.join(__dirname, '../../..');
    this.pluginsDir = path.join(this.marketplaceRoot, '.claude-plugins');

    this.results = {
      plugin: '',
      version: '',
      timestamp: new Date().toISOString(),
      duration: 0,
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        passRate: 0
      },
      levels: {},
      tests: [],
      failures: [],
      warnings: [],
      performance: {
        avgResponseTime: 0,
        maxResponseTime: 0,
        memoryPeak: 0
      }
    };

    this.startTime = Date.now();
  }

  /**
   * Run tests for a plugin
   */
  async runTests(pluginName) {
    const pluginDir = path.join(this.pluginsDir, pluginName);

    if (!fs.existsSync(pluginDir)) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    this.results.plugin = pluginName;
    this.results.version = this.getPluginVersion(pluginDir);

    console.log(`\n🧪 Testing plugin: ${pluginName} v${this.results.version}\n`);

    // Determine which levels to run
    const levels = this.parseLevels(this.options.level);

    // Run tests by level
    if (levels.includes(1)) await this.runLevel1Tests(pluginDir);
    if (levels.includes(2)) await this.runLevel2Tests(pluginDir);
    if (levels.includes(3)) await this.runLevel3Tests(pluginDir);
    if (levels.includes(4)) await this.runLevel4Tests(pluginDir);
    if (levels.includes(5)) await this.runLevel5Tests(pluginDir);

    // Calculate final metrics
    this.calculateMetrics();

    // Generate report
    return this.generateReport();
  }

  /**
   * Parse level specification
   */
  parseLevels(levelSpec) {
    if (!levelSpec || levelSpec === 'all') {
      return [1, 2, 3, 4, 5];
    }

    if (this.options.quick) {
      return [1, 2];
    }

    if (typeof levelSpec === 'string') {
      return levelSpec.split(',').map(l => parseInt(l.trim()));
    }

    return [levelSpec];
  }

  /**
   * Get plugin version
   */
  getPluginVersion(pluginDir) {
    try {
      const pluginJsonPath = this.findPluginJson(pluginDir);
      const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      return pluginJson.version || '0.0.0';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Find plugin.json
   */
  findPluginJson(pluginDir) {
    const claudePluginPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    const rootPath = path.join(pluginDir, 'plugin.json');

    if (fs.existsSync(claudePluginPath)) {
      return claudePluginPath;
    } else if (fs.existsSync(rootPath)) {
      return rootPath;
    } else {
      throw new Error('plugin.json not found');
    }
  }

  /**
   * Level 1: Structure Tests
   */
  async runLevel1Tests(pluginDir) {
    console.log('📋 Level 1: Structure Tests');

    const tests = [
      { name: 'Plugin directory exists', fn: () => this.testPluginDirectory(pluginDir) },
      { name: 'plugin.json exists', fn: () => this.testPluginJson(pluginDir) },
      { name: 'plugin.json is valid JSON', fn: () => this.testPluginJsonValid(pluginDir) },
      { name: 'Required directories present', fn: () => this.testRequiredDirectories(pluginDir) },
      { name: 'Naming conventions followed', fn: () => this.testNamingConventions(pluginDir) },
      { name: 'File permissions correct', fn: () => this.testFilePermissions(pluginDir) },
      { name: 'No extraneous files', fn: () => this.testNoExtraneousFiles(pluginDir) },
      { name: 'README.md exists', fn: () => this.testReadmeExists(pluginDir) },
      { name: '.gitignore exists', fn: () => this.testGitignoreExists(pluginDir) }
    ];

    await this.runTestSuite(1, tests);
  }

  /**
   * Level 2: Discovery Tests
   */
  async runLevel2Tests(pluginDir) {
    console.log('\n🔍 Level 2: Discovery Tests');

    const tests = [
      { name: 'Agents discoverable', fn: () => this.testAgentDiscovery(pluginDir) },
      { name: 'Agent names unique', fn: () => this.testAgentNamesUnique(pluginDir) },
      { name: 'Agent naming conventions', fn: () => this.testAgentNaming(pluginDir) },
      { name: 'Commands discoverable', fn: () => this.testCommandDiscovery(pluginDir) },
      { name: 'Scripts discoverable', fn: () => this.testScriptDiscovery(pluginDir) },
      { name: 'No naming conflicts', fn: () => this.testNoNamingConflicts(pluginDir) },
      { name: 'Marketplace integration', fn: () => this.testMarketplaceIntegration(path.basename(pluginDir)) }
    ];

    await this.runTestSuite(2, tests);
  }

  /**
   * Level 3: Functionality Tests
   */
  async runLevel3Tests(pluginDir) {
    console.log('\n⚙️  Level 3: Functionality Tests');

    const tests = [
      { name: 'Agent YAML frontmatter valid', fn: () => this.testAgentFrontmatter(pluginDir) },
      { name: 'Agent descriptions present', fn: () => this.testAgentDescriptions(pluginDir) },
      { name: 'Agent tools valid', fn: () => this.testAgentTools(pluginDir) },
      { name: 'Scripts executable', fn: () => this.testScriptsExecutable(pluginDir) },
      { name: 'Commands have documentation', fn: () => this.testCommandDocumentation(pluginDir) },
      { name: 'Dependencies declared', fn: () => this.testDependenciesDeclared(pluginDir) }
    ];

    await this.runTestSuite(3, tests);
  }

  /**
   * Level 4: Integration Tests
   */
  async runLevel4Tests(pluginDir) {
    console.log('\n🔗 Level 4: Integration Tests');

    const tests = [
      { name: 'Plugin validates successfully', fn: () => this.testPluginValidation(pluginDir) },
      { name: 'Dependencies available', fn: () => this.testDependenciesAvailable(pluginDir) },
      { name: 'No circular dependencies', fn: () => this.testNoCircularDependencies(pluginDir) }
    ];

    await this.runTestSuite(4, tests);
  }

  /**
   * Level 5: Regression Tests
   */
  async runLevel5Tests(pluginDir) {
    console.log('\n🔄 Level 5: Regression Tests');

    const tests = [
      { name: 'Historical scenarios pass', fn: () => this.testHistoricalScenarios(pluginDir) },
      { name: 'No breaking changes detected', fn: () => this.testNoBreakingChanges(pluginDir) }
    ];

    await this.runTestSuite(5, tests);
  }

  /**
   * Run a test suite
   */
  async runTestSuite(level, tests) {
    this.results.levels[level] = {
      passed: 0,
      total: tests.length,
      passRate: 0
    };

    for (const test of tests) {
      const result = await this.runTest(test.name, test.fn, level);
      this.results.tests.push(result);
      this.results.summary.total++;

      if (result.status === 'passed') {
        this.results.summary.passed++;
        this.results.levels[level].passed++;
        if (this.options.verbose) {
          console.log(`  ✅ ${test.name}`);
        }
      } else if (result.status === 'warning') {
        this.results.summary.passed++;
        this.results.levels[level].passed++;
        this.results.summary.warnings++;
        this.results.warnings.push(result);
        console.log(`  ⚠️  ${test.name}: ${result.message}`);
      } else {
        this.results.summary.failed++;
        this.results.failures.push(result);
        console.log(`  ❌ ${test.name}: ${result.message}`);
      }
    }

    this.results.levels[level].passRate = Math.round(
      (this.results.levels[level].passed / this.results.levels[level].total) * 100
    );

    console.log(`  ${this.results.levels[level].passed}/${this.results.levels[level].total} tests passed (${this.results.levels[level].passRate}%)`);
  }

  /**
   * Run a single test
   */
  async runTest(name, fn, level) {
    const startTime = Date.now();

    try {
      await fn();
      return {
        name,
        level,
        status: 'passed',
        duration: Date.now() - startTime
      };
    } catch (error) {
      // Check if it's a warning
      if (error.warning) {
        return {
          name,
          level,
          status: 'warning',
          message: error.message,
          duration: Date.now() - startTime
        };
      }

      return {
        name,
        level,
        status: 'failed',
        message: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Test plugin directory exists
   */
  testPluginDirectory(pluginDir) {
    if (!fs.existsSync(pluginDir)) {
      throw new Error('Plugin directory does not exist');
    }

    const stat = fs.statSync(pluginDir);
    if (!stat.isDirectory()) {
      throw new Error('Plugin path is not a directory');
    }
  }

  /**
   * Test plugin.json exists
   */
  testPluginJson(pluginDir) {
    const pluginJsonPath = this.findPluginJson(pluginDir);
    if (!fs.existsSync(pluginJsonPath)) {
      throw new Error('plugin.json not found');
    }
  }

  /**
   * Test plugin.json is valid JSON
   */
  testPluginJsonValid(pluginDir) {
    const pluginJsonPath = this.findPluginJson(pluginDir);
    const content = fs.readFileSync(pluginJsonPath, 'utf8');

    try {
      const json = JSON.parse(content);

      // Check required fields
      if (!json.name) throw new Error('Missing required field: name');
      if (!json.version) throw new Error('Missing required field: version');
      if (!json.description) throw new Error('Missing required field: description');
    } catch (error) {
      throw new Error(`Invalid plugin.json: ${error.message}`);
    }
  }

  /**
   * Test required directories
   */
  testRequiredDirectories(pluginDir) {
    const required = ['agents'];
    const missing = [];

    required.forEach(dir => {
      const dirPath = path.join(pluginDir, dir);
      if (!fs.existsSync(dirPath)) {
        missing.push(dir);
      }
    });

    if (missing.length > 0) {
      throw new Error(`Missing required directories: ${missing.join(', ')}`);
    }
  }

  /**
   * Test naming conventions
   */
  testNamingConventions(pluginDir) {
    const pluginName = path.basename(pluginDir);
    const pattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*-plugin$/;

    if (!pattern.test(pluginName)) {
      throw new Error(`Plugin name '${pluginName}' doesn't follow lowercase-hyphen-plugin convention`);
    }
  }

  /**
   * Test file permissions
   */
  testFilePermissions(pluginDir) {
    const scriptsDir = path.join(pluginDir, 'scripts');

    if (fs.existsSync(scriptsDir)) {
      const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));

      const nonExecutable = [];
      scripts.forEach(script => {
        const scriptPath = path.join(scriptsDir, script);
        try {
          fs.accessSync(scriptPath, fs.constants.X_OK);
        } catch (error) {
          nonExecutable.push(script);
        }
      });

      if (nonExecutable.length > 0) {
        const warning = new Error(`Scripts not executable: ${nonExecutable.join(', ')}`);
        warning.warning = true;
        throw warning;
      }
    }
  }

  /**
   * Test no extraneous files
   */
  testNoExtraneousFiles(pluginDir) {
    const extraneous = ['node_modules', '.DS_Store', 'Thumbs.db', '*.swp', '*.swo'];
    const found = [];

    extraneous.forEach(pattern => {
      const files = this.glob(pluginDir, pattern);
      if (files.length > 0) {
        found.push(...files);
      }
    });

    if (found.length > 0) {
      const warning = new Error(`Extraneous files found: ${found.slice(0, 3).join(', ')}${found.length > 3 ? '...' : ''}`);
      warning.warning = true;
      throw warning;
    }
  }

  /**
   * Test README exists
   */
  testReadmeExists(pluginDir) {
    const readmePath = path.join(pluginDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      throw new Error('README.md not found');
    }
  }

  /**
   * Test .gitignore exists
   */
  testGitignoreExists(pluginDir) {
    const gitignorePath = path.join(pluginDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const warning = new Error('.gitignore not found');
      warning.warning = true;
      throw warning;
    }
  }

  /**
   * Test agent discovery
   */
  testAgentDiscovery(pluginDir) {
    const agentsDir = path.join(pluginDir, 'agents');

    if (!fs.existsSync(agentsDir)) {
      throw new Error('Agents directory not found');
    }

    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

    if (agents.length === 0) {
      const warning = new Error('No agents found');
      warning.warning = true;
      throw warning;
    }

    console.log(`    Found ${agents.length} agent(s)`);
  }

  /**
   * Test agent names are unique
   */
  testAgentNamesUnique(pluginDir) {
    const agentsDir = path.join(pluginDir, 'agents');

    if (!fs.existsSync(agentsDir)) return;

    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    const names = agents.map(f => path.basename(f, '.md'));
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    if (duplicates.length > 0) {
      throw new Error(`Duplicate agent names: ${duplicates.join(', ')}`);
    }
  }

  /**
   * Test agent naming
   */
  testAgentNaming(pluginDir) {
    const agentsDir = path.join(pluginDir, 'agents');

    if (!fs.existsSync(agentsDir)) return;

    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    const pattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.md$/;
    const invalid = agents.filter(agent => !pattern.test(agent));

    if (invalid.length > 0) {
      throw new Error(`Invalid agent names: ${invalid.join(', ')}`);
    }
  }

  /**
   * Test command discovery
   */
  testCommandDiscovery(pluginDir) {
    const commandsDir = path.join(pluginDir, 'commands');

    if (!fs.existsSync(commandsDir)) {
      console.log('    No commands directory');
      return;
    }

    const commands = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    console.log(`    Found ${commands.length} command(s)`);
  }

  /**
   * Test script discovery
   */
  testScriptDiscovery(pluginDir) {
    const scriptsDir = path.join(pluginDir, 'scripts');

    if (!fs.existsSync(scriptsDir)) {
      console.log('    No scripts directory');
      return;
    }

    const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
    console.log(`    Found ${scripts.length} script(s)`);
  }

  /**
   * Test no naming conflicts
   */
  testNoNamingConflicts(pluginDir) {
    const pluginName = path.basename(pluginDir);

    // Check against other plugins
    const allPlugins = fs.readdirSync(this.pluginsDir).filter(p => {
      const stat = fs.statSync(path.join(this.pluginsDir, p));
      return stat.isDirectory() && p !== pluginName;
    });

    if (allPlugins.includes(pluginName)) {
      throw new Error(`Plugin name conflicts with existing plugin: ${pluginName}`);
    }
  }

  /**
   * Test marketplace integration
   */
  testMarketplaceIntegration(pluginName) {
    const marketplaceJsonPath = path.join(this.marketplaceRoot, '.claude-plugin', 'marketplace.json');

    if (!fs.existsSync(marketplaceJsonPath)) {
      const warning = new Error('marketplace.json not found');
      warning.warning = true;
      throw warning;
    }

    const marketplace = JSON.parse(fs.readFileSync(marketplaceJsonPath, 'utf8'));
    const plugin = marketplace.plugins.find(p => p.name === pluginName);

    if (!plugin) {
      throw new Error(`Plugin not found in marketplace.json: ${pluginName}`);
    }
  }

  /**
   * Test agent frontmatter
   */
  testAgentFrontmatter(pluginDir) {
    const agentsDir = path.join(pluginDir, 'agents');

    if (!fs.existsSync(agentsDir)) return;

    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    const invalid = [];

    agents.forEach(agentFile => {
      const content = fs.readFileSync(path.join(agentsDir, agentFile), 'utf8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (!frontmatterMatch) {
        invalid.push(`${agentFile}: No frontmatter`);
        return;
      }

      // Basic YAML validation
      const frontmatter = frontmatterMatch[1];
      if (!frontmatter.includes('name:')) invalid.push(`${agentFile}: Missing name`);
      if (!frontmatter.includes('model:')) invalid.push(`${agentFile}: Missing model`);
      if (!frontmatter.includes('description:')) invalid.push(`${agentFile}: Missing description`);
      if (!frontmatter.includes('tools:')) invalid.push(`${agentFile}: Missing tools`);
    });

    if (invalid.length > 0) {
      throw new Error(`Invalid agent frontmatter:\n  ${invalid.join('\n  ')}`);
    }
  }

  /**
   * Test agent descriptions
   */
  testAgentDescriptions(pluginDir) {
    const agentsDir = path.join(pluginDir, 'agents');

    if (!fs.existsSync(agentsDir)) return;

    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    const short = [];

    agents.forEach(agentFile => {
      const content = fs.readFileSync(path.join(agentsDir, agentFile), 'utf8');
      const descMatch = content.match(/description:\s*(.+)/);

      if (descMatch) {
        const desc = descMatch[1].trim();
        if (desc.length < 20) {
          short.push(`${agentFile}: ${desc.length} chars`);
        }
      }
    });

    if (short.length > 0) {
      const warning = new Error(`Short descriptions (< 20 chars): ${short.join(', ')}`);
      warning.warning = true;
      throw warning;
    }
  }

  /**
   * Test agent tools are valid
   */
  testAgentTools(pluginDir) {
    const agentsDir = path.join(pluginDir, 'agents');

    if (!fs.existsSync(agentsDir)) return;

    const validTools = [
      'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
      'TodoWrite', 'Task', 'ExitPlanMode', 'WebFetch', 'WebSearch',
      'NotebookEdit', 'SlashCommand', 'BashOutput', 'KillShell'
    ];

    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    const invalid = [];

    agents.forEach(agentFile => {
      const content = fs.readFileSync(path.join(agentsDir, agentFile), 'utf8');
      const toolsMatch = content.match(/tools:\s*(.+)/);

      if (toolsMatch) {
        const tools = toolsMatch[1].replace(/[\[\]]/g, '').split(',').map(t => t.trim());
        const invalidTools = tools.filter(t => !validTools.includes(t));

        if (invalidTools.length > 0) {
          invalid.push(`${agentFile}: ${invalidTools.join(', ')}`);
        }
      }
    });

    if (invalid.length > 0) {
      throw new Error(`Invalid tools:\n  ${invalid.join('\n  ')}`);
    }
  }

  /**
   * Test scripts are executable
   */
  testScriptsExecutable(pluginDir) {
    const scriptsDir = path.join(pluginDir, 'scripts');

    if (!fs.existsSync(scriptsDir)) return;

    const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
    const nonExecutable = [];

    scripts.forEach(script => {
      const scriptPath = path.join(scriptsDir, script);
      try {
        fs.accessSync(scriptPath, fs.constants.X_OK);
      } catch (error) {
        nonExecutable.push(script);
      }
    });

    if (nonExecutable.length > 0) {
      throw new Error(`Scripts not executable: ${nonExecutable.join(', ')}`);
    }
  }

  /**
   * Test command documentation
   */
  testCommandDocumentation(pluginDir) {
    const commandsDir = path.join(pluginDir, 'commands');

    if (!fs.existsSync(commandsDir)) return;

    const commands = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    const undocumented = [];

    commands.forEach(cmdFile => {
      const content = fs.readFileSync(path.join(commandsDir, cmdFile), 'utf8');
      if (content.length < 50) {
        undocumented.push(cmdFile);
      }
    });

    if (undocumented.length > 0) {
      const warning = new Error(`Minimal command documentation: ${undocumented.join(', ')}`);
      warning.warning = true;
      throw warning;
    }
  }

  /**
   * Test dependencies declared
   */
  testDependenciesDeclared(pluginDir) {
    const pluginJsonPath = this.findPluginJson(pluginDir);
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));

    if (!pluginJson.dependencies) {
      const warning = new Error('No dependencies declared');
      warning.warning = true;
      throw warning;
    }
  }

  /**
   * Test plugin validation
   */
  testPluginValidation(pluginDir) {
    try {
      const validatorPath = path.join(this.pluginsDir, 'developer-tools-plugin', 'scripts', 'validate-plugin.js');

      if (!fs.existsSync(validatorPath)) {
        const warning = new Error('Plugin validator not found, skipping validation');
        warning.warning = true;
        throw warning;
      }

      execSync(`node "${validatorPath}" "${pluginDir}"`, {
        cwd: this.marketplaceRoot,
        stdio: 'pipe'
      });
    } catch (error) {
      if (error.warning) throw error;
      throw new Error(`Plugin validation failed: ${error.message}`);
    }
  }

  /**
   * Test dependencies available
   */
  testDependenciesAvailable(pluginDir) {
    const pluginJsonPath = this.findPluginJson(pluginDir);
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    const dependencies = pluginJson.dependencies || {};

    const missing = [];

    // Check CLI dependencies
    if (dependencies.cli) {
      Object.entries(dependencies.cli).forEach(([tool, info]) => {
        if (info.required) {
          try {
            execSync(info.check || `which ${tool}`, { stdio: 'pipe' });
          } catch (error) {
            missing.push(tool);
          }
        }
      });
    }

    if (missing.length > 0) {
      const warning = new Error(`Missing dependencies: ${missing.join(', ')}`);
      warning.warning = true;
      throw warning;
    }
  }

  /**
   * Test no circular dependencies
   */
  testNoCircularDependencies(pluginDir) {
    // Basic implementation - could be expanded
    const pluginJsonPath = this.findPluginJson(pluginDir);
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    const dependencies = pluginJson.dependencies || {};

    if (dependencies.plugins && dependencies.plugins.includes(path.basename(pluginDir))) {
      throw new Error('Plugin depends on itself');
    }
  }

  /**
   * Test historical scenarios
   */
  testHistoricalScenarios(pluginDir) {
    // Placeholder - would load and run historical test scenarios
    console.log('    No historical scenarios defined');
  }

  /**
   * Test no breaking changes
   */
  testNoBreakingChanges(pluginDir) {
    // Placeholder - would compare against previous version
    console.log('    Breaking change detection not implemented');
  }

  /**
   * Calculate final metrics
   */
  calculateMetrics() {
    this.results.duration = (Date.now() - this.startTime) / 1000;
    this.results.summary.passRate = Math.round(
      (this.results.summary.passed / this.results.summary.total) * 100
    );
  }

  /**
   * Generate report
   */
  generateReport() {
    if (this.options.json) {
      return this.results;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`Plugin: ${this.results.plugin} v${this.results.version}`);
    console.log(`Duration: ${this.results.duration.toFixed(1)}s`);
    console.log(`Total tests: ${this.results.summary.total}`);
    console.log(`Passed: ${this.results.summary.passed} (${this.results.summary.passRate}%)`);
    console.log(`Failed: ${this.results.summary.failed}`);
    console.log(`Warnings: ${this.results.summary.warnings}`);

    console.log('\nResults by Level:');
    Object.entries(this.results.levels).forEach(([level, stats]) => {
      const icon = stats.passRate === 100 ? '✅' : stats.passRate >= 90 ? '⚠️' : '❌';
      console.log(`  Level ${level}: ${icon} ${stats.passed}/${stats.total} (${stats.passRate}%)`);
    });

    if (this.results.failures.length > 0) {
      console.log('\n❌ Failures:');
      this.results.failures.forEach((failure, i) => {
        console.log(`  ${i + 1}. ${failure.name}`);
        console.log(`     ${failure.message}`);
      });
    }

    if (this.results.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.results.warnings.forEach((warning, i) => {
        console.log(`  ${i + 1}. ${warning.name}: ${warning.message}`);
      });
    }

    const threshold = this.options.threshold || 0;
    const status = this.results.summary.passRate >= threshold ? 'PASSED' : 'FAILED';
    const icon = status === 'PASSED' ? '✅' : '❌';

    console.log('\n' + '='.repeat(60));
    console.log(`${icon} Overall: ${status} (${this.results.summary.passRate}% >= ${threshold}%)`);
    console.log('='.repeat(60) + '\n');

    return this.results;
  }

  /**
   * Simple glob implementation
   */
  glob(dir, pattern) {
    const results = [];
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));

    const search = (currentDir) => {
      const items = fs.readdirSync(currentDir);

      items.forEach(item => {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          search(fullPath);
        } else if (regex.test(item)) {
          results.push(path.relative(dir, fullPath));
        }
      });
    };

    search(dir);
    return results;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || !args.includes('--plugin')) {
    console.log('Usage: node test-plugin-installation.js --plugin <name> [options]');
    console.log('\nOptions:');
    console.log('  --plugin <name>      Plugin name (required)');
    console.log('  --level <levels>     Test levels to run (1-5, comma-separated, or "all")');
    console.log('  --quick              Run only fast tests (Level 1-2)');
    console.log('  --verbose            Verbose output');
    console.log('  --json               Output JSON report');
    console.log('  --threshold <num>    Pass rate threshold (default: 0)');
    console.log('\nExamples:');
    console.log('  node test-plugin-installation.js --plugin my-plugin');
    console.log('  node test-plugin-installation.js --plugin my-plugin --level 1,2,3');
    console.log('  node test-plugin-installation.js --plugin my-plugin --quick');
    console.log('  node test-plugin-installation.js --plugin my-plugin --json > report.json');
    process.exit(1);
  }

  const options = {
    level: args.includes('--level') ? args[args.indexOf('--level') + 1] : 'all',
    quick: args.includes('--quick'),
    verbose: args.includes('--verbose'),
    json: args.includes('--json'),
    threshold: args.includes('--threshold') ? parseInt(args[args.indexOf('--threshold') + 1]) : 0
  };

  const pluginName = args[args.indexOf('--plugin') + 1];
  const tester = new PluginIntegrationTester(options);

  (async () => {
    try {
      const results = await tester.runTests(pluginName);

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      }

      // Exit with error if below threshold
      if (results.summary.passRate < options.threshold) {
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = PluginIntegrationTester;
