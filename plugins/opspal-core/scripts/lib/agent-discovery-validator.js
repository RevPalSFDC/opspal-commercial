#!/usr/bin/env node

/**
 * Agent Discovery Validator
 *
 * Validates agent discovery and YAML frontmatter across all plugins.
 * Detects naming conflicts, invalid frontmatter, and missing required fields.
 */

const fs = require('fs');
const path = require('path');

class AgentDiscoveryValidator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.pluginName = options.pluginName || null;
    this.autoFix = options.autoFix || false;

    this.pluginsDir = options.pluginsDir || path.join(process.cwd(), '.claude-plugins');
    this.userAgentsDir = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.claude',
      'agents'
    );

    this.results = {
      discovered: [],
      failed: [],
      duplicates: [],
      warnings: [],
      fixesApplied: []
    };

    this.agentNames = new Map();
  }

  /**
   * Validate all agents
   */
  async validate() {
    console.log('🔍 Validating agent discovery...\n');

    // Scan plugin agents
    await this.scanPluginAgents();

    // Scan user agents
    await this.scanUserAgents();

    // Check for duplicates
    this.checkDuplicates();

    return this.generateSummary();
  }

  /**
   * Scan plugin agents
   */
  async scanPluginAgents() {
    if (!fs.existsSync(this.pluginsDir)) {
      console.warn(`⚠️ Plugins directory not found: ${this.pluginsDir}`);
      return;
    }

    const plugins = fs.readdirSync(this.pluginsDir).filter(p => {
      const pluginPath = path.join(this.pluginsDir, p);
      return fs.statSync(pluginPath).isDirectory() && p !== 'node_modules';
    });

    for (const pluginName of plugins) {
      if (this.pluginName && pluginName !== this.pluginName) {
        continue; // Skip if specific plugin requested
      }

      const agentsDir = path.join(this.pluginsDir, pluginName, 'agents');

      if (fs.existsSync(agentsDir)) {
        await this.scanAgentsDirectory(agentsDir, `plugin:${pluginName}`);
      }
    }
  }

  /**
   * Scan user-scope agents
   */
  async scanUserAgents() {
    if (fs.existsSync(this.userAgentsDir)) {
      await this.scanAgentsDirectory(this.userAgentsDir, 'user-scope');
    }
  }

  /**
   * Scan a specific agents directory
   */
  async scanAgentsDirectory(dir, scope) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const agentPath = path.join(dir, file);
        await this.validateAgent(agentPath, file, scope);
      }

    } catch (error) {
      console.error(`Error scanning ${dir}: ${error.message}`);
    }
  }

  /**
   * Validate a single agent file
   */
  async validateAgent(agentPath, filename, scope) {
    try {
      const content = fs.readFileSync(agentPath, 'utf-8');

      // Check for YAML frontmatter
      if (!content.startsWith('---')) {
        this.results.failed.push({
          path: agentPath,
          filename,
          scope,
          error: 'Missing YAML frontmatter',
          fix: 'Add YAML frontmatter at the beginning: ---\\nname: agent-name\\n---'
        });
        return;
      }

      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        this.results.failed.push({
          path: agentPath,
          filename,
          scope,
          error: 'Invalid YAML frontmatter (not properly closed)',
          fix: 'Ensure frontmatter ends with ---'
        });
        return;
      }

      const frontmatter = frontmatterMatch[1];

      // Parse YAML fields (basic parsing)
      const fields = this.parseYAMLFrontmatter(frontmatter);

      // Validate required fields
      const requiredFields = ['name', 'description', 'tools'];
      const missingFields = requiredFields.filter(f => !fields[f]);

      if (missingFields.length > 0) {
        this.results.failed.push({
          path: agentPath,
          filename,
          scope,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          fix: `Add missing fields to YAML frontmatter`,
          fields
        });

        if (this.autoFix && fields.name) {
          // Can attempt to add missing fields
          this.fixMissingFields(agentPath, fields, missingFields);
        }

        return;
      }

      // Check filename matches agent name
      const expectedFilename = `${fields.name}.md`;
      if (filename !== expectedFilename) {
        this.results.warnings.push({
          path: agentPath,
          filename,
          scope,
          warning: 'Filename does not match agent name',
          expected: expectedFilename,
          actual: filename,
          fix: `Rename ${filename} to ${expectedFilename}`
        });
      }

      // Check for common field issues
      if (fields.tools && typeof fields.tools === 'string') {
        this.results.warnings.push({
          path: agentPath,
          filename,
          scope,
          warning: 'tools field should be array, not string',
          fix: 'Change "tools: tool1, tool2" to "tools: [tool1, tool2]" or list format'
        });
      }

      // Record successful discovery
      this.results.discovered.push({
        name: fields.name,
        filename,
        scope,
        path: agentPath,
        fields
      });

      // Track agent names for duplicate detection
      if (!this.agentNames.has(fields.name)) {
        this.agentNames.set(fields.name, []);
      }
      this.agentNames.get(fields.name).push({
        path: agentPath,
        scope
      });

      this.log(`  ✓ ${fields.name} (${scope})`);

    } catch (error) {
      this.results.failed.push({
        path: agentPath,
        filename,
        scope,
        error: error.message
      });
    }
  }

  /**
   * Parse YAML frontmatter (basic implementation)
   */
  parseYAMLFrontmatter(yaml) {
    const fields = {};
    const lines = yaml.split('\n');

    let currentKey = null;
    let currentValue = [];
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue; // Skip empty lines and comments
      }

      // Key-value pair
      const keyMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (keyMatch) {
        // Save previous key if exists
        if (currentKey) {
          fields[currentKey] = inList ? currentValue : currentValue.join(' ');
        }

        currentKey = keyMatch[1];
        currentValue = keyMatch[2] ? [keyMatch[2]] : [];
        inList = false;

        // Check if value is a list
        if (!keyMatch[2] || keyMatch[2] === '[') {
          inList = true;
          currentValue = [];
        }
      } else if (trimmed.startsWith('- ') && currentKey) {
        // List item
        inList = true;
        currentValue.push(trimmed.substring(2));
      } else if (currentKey) {
        // Continuation of previous value
        currentValue.push(trimmed);
      }
    }

    // Save last key
    if (currentKey) {
      fields[currentKey] = inList ? currentValue : currentValue.join(' ');
    }

    return fields;
  }

  /**
   * Check for duplicate agent names
   */
  checkDuplicates() {
    for (const [name, locations] of this.agentNames.entries()) {
      if (locations.length > 1) {
        this.results.duplicates.push({
          name,
          locations,
          warning: 'Duplicate agent name - only one will be loaded',
          fix: 'Rename one agent or remove from user scope (~/.claude/agents/)'
        });
      }
    }
  }

  /**
   * Auto-fix missing fields
   */
  fixMissingFields(agentPath, fields, missingFields) {
    try {
      const content = fs.readFileSync(agentPath, 'utf-8');
      const frontmatterEnd = content.indexOf('\n---', 4);

      if (frontmatterEnd === -1) return;

      let frontmatter = content.substring(4, frontmatterEnd);

      // Add missing fields
      if (missingFields.includes('description')) {
        frontmatter += `\ndescription: TODO - Add agent description`;
      }

      if (missingFields.includes('tools')) {
        frontmatter += `\ntools: Read, Write`;
      }

      // Write updated content
      const newContent = `---\n${frontmatter}\n---${content.substring(frontmatterEnd + 4)}`;
      fs.writeFileSync(agentPath, newContent, 'utf-8');

      this.results.fixesApplied.push({
        path: agentPath,
        fix: `Added missing fields: ${missingFields.join(', ')}`
      });

      console.log(`  🔧 Auto-fixed: Added missing fields to ${fields.name}`);

    } catch (error) {
      console.error(`  ✗ Auto-fix failed: ${error.message}`);
    }
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
    const totalDiscovered = this.results.discovered.length;
    const totalFailed = this.results.failed.length;
    const totalDuplicates = this.results.duplicates.length;
    const totalWarnings = this.results.warnings.length;
    const totalFixes = this.results.fixesApplied.length;

    console.log('\n' + '─'.repeat(60));
    console.log('📋 AGENT DISCOVERY VALIDATION');
    console.log('─'.repeat(60));

    console.log(`Agents discovered: ${totalDiscovered}`);

    if (totalFailed > 0) {
      console.log(`Failed to load: ${totalFailed}`);
    }

    if (totalDuplicates > 0) {
      console.log(`Duplicate names: ${totalDuplicates}`);
    }

    if (totalWarnings > 0) {
      console.log(`Warnings: ${totalWarnings}`);
    }

    // Failed agents
    if (totalFailed > 0) {
      console.log('\nFailed Agents:');
      for (const failed of this.results.failed) {
        console.log(`  ✗ ${failed.filename} (${failed.scope})`);
        console.log(`    Error: ${failed.error}`);
        if (failed.fix) {
          console.log(`    Fix: ${failed.fix}`);
        }
      }
    }

    // Duplicate names
    if (totalDuplicates > 0) {
      console.log('\nDuplicate Agent Names:');
      for (const dup of this.results.duplicates) {
        console.log(`  ⚠️ ${dup.name}`);
        for (const loc of dup.locations) {
          console.log(`    • ${loc.scope}: ${loc.path}`);
        }
        console.log(`    Fix: ${dup.fix}`);
      }
    }

    // Warnings
    if (totalWarnings > 0 && this.verbose) {
      console.log('\nWarnings:');
      for (const warning of this.results.warnings) {
        console.log(`  ⚠️ ${warning.filename} (${warning.scope})`);
        console.log(`    Warning: ${warning.warning}`);
        if (warning.fix) {
          console.log(`    Fix: ${warning.fix}`);
        }
      }
    }

    // Auto-fixes
    if (totalFixes > 0) {
      console.log('\n🔧 Auto-fixes Applied:');
      for (const fix of this.results.fixesApplied) {
        console.log(`  • ${fix.fix}`);
        console.log(`    File: ${fix.path}`);
      }
    }

    console.log('─'.repeat(60));

    const passed = totalFailed === 0 && totalDuplicates === 0;
    const status = passed
      ? (totalWarnings === 0 ? 'ALL VALID ✓' : 'VALID (with warnings) ⚠️')
      : 'ERRORS DETECTED ✗';

    console.log(`Overall Status: ${status}`);
    console.log('─'.repeat(60) + '\n');

    return {
      passed,
      discovered: this.results.discovered,
      failed: this.results.failed,
      duplicates: this.results.duplicates,
      warnings: this.results.warnings,
      fixesApplied: this.results.fixesApplied,
      summary: {
        totalDiscovered,
        totalFailed,
        totalDuplicates,
        totalWarnings
      }
    };
  }

  /**
   * Get JSON report
   */
  getJSONReport() {
    return {
      timestamp: new Date().toISOString(),
      discovered: this.results.discovered,
      failed: this.results.failed,
      duplicates: this.results.duplicates,
      warnings: this.results.warnings,
      fixesApplied: this.results.fixesApplied,
      summary: {
        totalDiscovered: this.results.discovered.length,
        totalFailed: this.results.failed.length,
        totalDuplicates: this.results.duplicates.length,
        totalWarnings: this.results.warnings.length,
        passed: this.results.failed.length === 0 && this.results.duplicates.length === 0
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

  const validator = new AgentDiscoveryValidator(options);

  validator.validate().then(result => {
    if (options.json) {
      console.log(JSON.stringify(validator.getJSONReport(), null, 2));
    }

    process.exit(result.passed ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(2);
  });
}

module.exports = AgentDiscoveryValidator;
