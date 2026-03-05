#!/usr/bin/env node

/**
 * Plugin Health Checker
 *
 * Validates plugin installations, manifests, agents, commands, hooks, and scripts.
 * Detects common issues and provides actionable fixes.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PluginHealthChecker {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.pluginName = options.pluginName || null;
    this.pluginsDir = options.pluginsDir || path.join(process.cwd(), '.claude-plugins');
    this.autoFix = options.autoFix || false;

    this.results = {
      healthy: [],
      warnings: [],
      errors: [],
      fixesApplied: []
    };
  }

  /**
   * Check all plugins or a specific plugin
   */
  async checkAll() {
    console.log('🔍 Checking plugin health...\n');

    if (!fs.existsSync(this.pluginsDir)) {
      console.error(`✗ Plugins directory not found: ${this.pluginsDir}`);
      return { passed: false, error: 'Plugins directory missing' };
    }

    const plugins = this.pluginName
      ? [this.pluginName]
      : fs.readdirSync(this.pluginsDir).filter(p => {
          const pluginPath = path.join(this.pluginsDir, p);
          return fs.statSync(pluginPath).isDirectory() && p !== 'node_modules';
        });

    for (const pluginName of plugins) {
      await this.checkPlugin(pluginName);
    }

    return this.generateSummary();
  }

  /**
   * Check a single plugin
   */
  async checkPlugin(pluginName) {
    const pluginPath = path.join(this.pluginsDir, pluginName);
    const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');

    console.log(`\n📦 Checking ${pluginName}...`);

    // Check plugin directory exists
    if (!fs.existsSync(pluginPath)) {
      this.addError(pluginName, 'Plugin directory not found', { path: pluginPath });
      return;
    }

    // Check manifest
    const manifestCheck = this.checkManifest(pluginName, manifestPath);
    if (!manifestCheck.valid) {
      return; // Can't continue without valid manifest
    }

    const manifest = manifestCheck.manifest;

    // Check agents
    await this.checkAgents(pluginName, pluginPath, manifest);

    // Check commands
    await this.checkCommands(pluginName, pluginPath, manifest);

    // Check hooks
    await this.checkHooks(pluginName, pluginPath, manifest);

    // Check scripts
    await this.checkScripts(pluginName, pluginPath, manifest);

    // Overall health
    const pluginErrors = this.results.errors.filter(e => e.plugin === pluginName);
    const pluginWarnings = this.results.warnings.filter(w => w.plugin === pluginName);

    if (pluginErrors.length === 0) {
      if (pluginWarnings.length === 0) {
        console.log(`  ✓ ${pluginName} is healthy`);
        this.results.healthy.push(pluginName);
      } else {
        console.log(`  ⚠️ ${pluginName} has ${pluginWarnings.length} warning(s)`);
      }
    } else {
      console.log(`  ✗ ${pluginName} has ${pluginErrors.length} error(s)`);
    }
  }

  /**
   * Check plugin manifest (plugin.json)
   */
  checkManifest(pluginName, manifestPath) {
    if (!fs.existsSync(manifestPath)) {
      this.addError(pluginName, 'Manifest not found', {
        path: manifestPath,
        fix: `Create ${manifestPath} with required fields`
      });
      return { valid: false };
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      // Validate required fields
      const requiredFields = ['name', 'version', 'description'];
      const missingFields = requiredFields.filter(f => !manifest[f]);

      if (missingFields.length > 0) {
        this.addError(pluginName, 'Manifest missing required fields', {
          fields: missingFields,
          fix: `Add missing fields to ${manifestPath}: ${missingFields.join(', ')}`
        });
        return { valid: false, manifest };
      }

      // Check for disallowed fields (common mistake)
      const disallowedFields = ['agents', 'commands', 'hooks'];
      const foundDisallowed = disallowedFields.filter(f => manifest[f]);

      if (foundDisallowed.length > 0) {
        this.addError(pluginName, 'Manifest contains disallowed fields', {
          fields: foundDisallowed,
          fix: `Remove fields from ${manifestPath}: jq 'del(.${foundDisallowed.join(', .')})' ${manifestPath} > tmp.json && mv tmp.json ${manifestPath}`
        });

        if (this.autoFix) {
          this.fixManifest(pluginName, manifestPath, manifest, foundDisallowed);
        }
      }

      // Validate version format (semver)
      if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
        this.addWarning(pluginName, 'Invalid version format (should be semver)', {
          version: manifest.version,
          fix: 'Use format: MAJOR.MINOR.PATCH (e.g., 1.0.0)'
        });
      }

      console.log(`  ✓ Manifest valid (v${manifest.version})`);
      return { valid: true, manifest };

    } catch (error) {
      this.addError(pluginName, 'Manifest parse error', {
        error: error.message,
        fix: 'Validate JSON syntax at jsonlint.com'
      });
      return { valid: false };
    }
  }

  /**
   * Check agents directory and agent files
   */
  async checkAgents(pluginName, pluginPath, manifest) {
    const agentsDir = path.join(pluginPath, 'agents');

    if (!fs.existsSync(agentsDir)) {
      this.addWarning(pluginName, 'Agents directory not found', {
        path: agentsDir,
        note: 'Optional if plugin has no agents'
      });
      return;
    }

    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

    if (agentFiles.length === 0) {
      this.addWarning(pluginName, 'No agent files found', {
        path: agentsDir
      });
      return;
    }

    console.log(`  📋 Checking ${agentFiles.length} agent(s)...`);

    for (const agentFile of agentFiles) {
      const agentPath = path.join(agentsDir, agentFile);
      await this.checkAgentFile(pluginName, agentPath, agentFile);
    }
  }

  /**
   * Check individual agent file
   */
  async checkAgentFile(pluginName, agentPath, agentFile) {
    try {
      const content = fs.readFileSync(agentPath, 'utf-8');

      // Check for YAML frontmatter
      if (!content.startsWith('---')) {
        this.addError(pluginName, `Agent ${agentFile} missing YAML frontmatter`, {
          path: agentPath,
          fix: 'Add YAML frontmatter at the beginning of the file'
        });
        return;
      }

      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        this.addError(pluginName, `Agent ${agentFile} invalid YAML frontmatter`, {
          path: agentPath,
          fix: 'Ensure frontmatter is properly closed with ---'
        });
        return;
      }

      const frontmatter = frontmatterMatch[1];

      // Parse YAML (basic validation)
      const requiredFields = ['name', 'description', 'tools'];
      const missingFields = [];

      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        this.addError(pluginName, `Agent ${agentFile} missing required fields`, {
          fields: missingFields,
          path: agentPath,
          fix: `Add missing fields to YAML frontmatter: ${missingFields.join(', ')}`
        });
        return;
      }

      // Extract agent name
      const nameMatch = frontmatter.match(/name:\s*(.+)/);
      if (nameMatch) {
        const agentName = nameMatch[1].trim();

        // Check if filename matches agent name
        const expectedFilename = `${agentName}.md`;
        if (agentFile !== expectedFilename) {
          this.addWarning(pluginName, `Agent filename mismatch`, {
            expected: expectedFilename,
            actual: agentFile,
            fix: `Rename ${agentFile} to ${expectedFilename}`
          });
        }

        this.log(`    ✓ Agent: ${agentName}`);
      }

    } catch (error) {
      this.addError(pluginName, `Agent ${agentFile} read error`, {
        error: error.message,
        path: agentPath
      });
    }
  }

  /**
   * Check commands directory
   */
  async checkCommands(pluginName, pluginPath, manifest) {
    const commandsDir = path.join(pluginPath, 'commands');

    if (!fs.existsSync(commandsDir)) {
      this.addWarning(pluginName, 'Commands directory not found', {
        path: commandsDir,
        note: 'Optional if plugin has no commands'
      });
      return;
    }

    const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));

    if (commandFiles.length === 0) {
      this.addWarning(pluginName, 'No command files found', {
        path: commandsDir
      });
      return;
    }

    console.log(`  💬 Checking ${commandFiles.length} command(s)...`);

    for (const commandFile of commandFiles) {
      this.log(`    ✓ Command: ${commandFile}`);
    }
  }

  /**
   * Check hooks directory
   */
  async checkHooks(pluginName, pluginPath, manifest) {
    const hooksDir = path.join(pluginPath, 'hooks');

    if (!fs.existsSync(hooksDir)) {
      this.addWarning(pluginName, 'Hooks directory not found', {
        path: hooksDir,
        note: 'Optional if plugin has no hooks'
      });
      return;
    }

    const hookFiles = fs.readdirSync(hooksDir).filter(f => f.endsWith('.sh'));

    if (hookFiles.length === 0) {
      this.addWarning(pluginName, 'No hook files found', {
        path: hooksDir
      });
      return;
    }

    console.log(`  🪝 Checking ${hookFiles.length} hook(s)...`);

    for (const hookFile of hookFiles) {
      const hookPath = path.join(hooksDir, hookFile);
      await this.checkHookFile(pluginName, hookPath, hookFile);
    }
  }

  /**
   * Check individual hook file
   */
  async checkHookFile(pluginName, hookPath, hookFile) {
    // Check if executable
    try {
      const stats = fs.statSync(hookPath);
      const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;

      if (!isExecutable) {
        this.addWarning(pluginName, `Hook ${hookFile} not executable`, {
          path: hookPath,
          fix: `chmod +x ${hookPath}`
        });

        if (this.autoFix) {
          this.fixHookPermissions(pluginName, hookPath);
        }
      }

      // Check for shebang
      const content = fs.readFileSync(hookPath, 'utf-8');
      if (!content.startsWith('#!/')) {
        this.addWarning(pluginName, `Hook ${hookFile} missing shebang`, {
          path: hookPath,
          fix: 'Add #!/bin/bash at the beginning'
        });
      }

      this.log(`    ✓ Hook: ${hookFile}`);

    } catch (error) {
      this.addError(pluginName, `Hook ${hookFile} check error`, {
        error: error.message,
        path: hookPath
      });
    }
  }

  /**
   * Check scripts directory
   */
  async checkScripts(pluginName, pluginPath, manifest) {
    const scriptsDir = path.join(pluginPath, 'scripts', 'lib');

    if (!fs.existsSync(scriptsDir)) {
      this.addWarning(pluginName, 'Scripts directory not found', {
        path: scriptsDir,
        note: 'Optional if plugin has no scripts'
      });
      return;
    }

    const scriptFiles = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));

    if (scriptFiles.length === 0) {
      this.addWarning(pluginName, 'No script files found', {
        path: scriptsDir
      });
      return;
    }

    console.log(`  📜 Checking ${scriptFiles.length} script(s)...`);

    for (const scriptFile of scriptFiles) {
      this.log(`    ✓ Script: ${scriptFile}`);
    }
  }

  /**
   * Auto-fix manifest issues
   */
  fixManifest(pluginName, manifestPath, manifest, disallowedFields) {
    try {
      // Remove disallowed fields
      for (const field of disallowedFields) {
        delete manifest[field];
      }

      // Write fixed manifest
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      this.results.fixesApplied.push({
        plugin: pluginName,
        fix: `Removed disallowed fields: ${disallowedFields.join(', ')}`,
        file: manifestPath
      });

      console.log(`  🔧 Auto-fixed: Removed disallowed fields from manifest`);

    } catch (error) {
      console.error(`  ✗ Auto-fix failed: ${error.message}`);
    }
  }

  /**
   * Auto-fix hook permissions
   */
  fixHookPermissions(pluginName, hookPath) {
    try {
      execSync(`chmod +x "${hookPath}"`);

      this.results.fixesApplied.push({
        plugin: pluginName,
        fix: 'Made hook executable',
        file: hookPath
      });

      console.log(`  🔧 Auto-fixed: Made hook executable`);

    } catch (error) {
      console.error(`  ✗ Auto-fix failed: ${error.message}`);
    }
  }

  /**
   * Add error to results
   */
  addError(plugin, message, details = {}) {
    this.results.errors.push({ plugin, message, ...details });
  }

  /**
   * Add warning to results
   */
  addWarning(plugin, message, details = {}) {
    this.results.warnings.push({ plugin, message, ...details });
  }

  /**
   * Log verbose output
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Generate summary report
   */
  generateSummary() {
    const totalErrors = this.results.errors.length;
    const totalWarnings = this.results.warnings.length;
    const totalHealthy = this.results.healthy.length;
    const totalFixes = this.results.fixesApplied.length;

    console.log('\n' + '─'.repeat(60));
    console.log('📊 PLUGIN HEALTH SUMMARY');
    console.log('─'.repeat(60));

    if (totalHealthy > 0) {
      console.log(`✓ Healthy plugins: ${totalHealthy}`);
      this.results.healthy.forEach(p => console.log(`  • ${p}`));
    }

    if (totalWarnings > 0) {
      console.log(`\n⚠️ Warnings: ${totalWarnings}`);
      this.results.warnings.forEach(w => {
        console.log(`  • ${w.plugin}: ${w.message}`);
        if (w.fix) console.log(`    Fix: ${w.fix}`);
      });
    }

    if (totalErrors > 0) {
      console.log(`\n✗ Errors: ${totalErrors}`);
      this.results.errors.forEach(e => {
        console.log(`  • ${e.plugin}: ${e.message}`);
        if (e.fix) console.log(`    Fix: ${e.fix}`);
      });
    }

    if (totalFixes > 0) {
      console.log(`\n🔧 Auto-fixes applied: ${totalFixes}`);
      this.results.fixesApplied.forEach(f => {
        console.log(`  • ${f.plugin}: ${f.fix}`);
      });
    }

    console.log('─'.repeat(60));

    const passed = totalErrors === 0;
    const status = passed
      ? (totalWarnings === 0 ? 'HEALTHY ✓' : 'HEALTHY (with warnings) ⚠️')
      : 'DEGRADED ✗';

    console.log(`Overall Status: ${status}`);
    console.log('─'.repeat(60) + '\n');

    return {
      passed,
      healthy: this.results.healthy,
      warnings: this.results.warnings,
      errors: this.results.errors,
      fixesApplied: this.results.fixesApplied,
      exitCode: passed ? 0 : (totalWarnings > 0 ? 1 : 2)
    };
  }

  /**
   * Get JSON report
   */
  getJSONReport() {
    return {
      timestamp: new Date().toISOString(),
      healthy: this.results.healthy,
      warnings: this.results.warnings,
      errors: this.results.errors,
      fixesApplied: this.results.fixesApplied,
      summary: {
        totalHealthy: this.results.healthy.length,
        totalWarnings: this.results.warnings.length,
        totalErrors: this.results.errors.length,
        totalFixes: this.results.fixesApplied.length,
        passed: this.results.errors.length === 0
      }
    };
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    autoFix: args.includes('--fix'),
    json: args.includes('--json')
  };

  // Get plugin name if specified
  const pluginFlag = args.indexOf('--plugin');
  if (pluginFlag !== -1 && args[pluginFlag + 1]) {
    options.pluginName = args[pluginFlag + 1];
  }

  const checker = new PluginHealthChecker(options);

  checker.checkAll().then(result => {
    if (options.json) {
      console.log(JSON.stringify(checker.getJSONReport(), null, 2));
    }

    process.exit(result.exitCode);
  }).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(2);
  });
}

module.exports = PluginHealthChecker;
