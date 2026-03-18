#!/usr/bin/env node

/**
 * Asana Integration Compliance Checker
 *
 * Validates that agents follow the Asana Agent Integration Playbook standards.
 * Can be run as pre-commit hook, CI check, or manual audit.
 *
 * Checks for:
 * - Agents reference playbook in their documentation
 * - Agents that use Asana MCP tools have update standards section
 * - Update templates exist and are properly formatted
 * - Utility scripts are referenced correctly
 *
 * Part of the Asana Agent Integration Playbook (Future Enhancement)
 */

const fs = require('fs');
const path = require('path');

class AsanaIntegrationComplianceChecker {
  constructor(options = {}) {
    this.options = {
      strictMode: options.strictMode || false,
      autoFix: options.autoFix || false,
      ...options
    };
    this.violations = [];
  }

  /**
   * Check compliance for all agents in a plugin
   */
  async checkPlugin(pluginPath) {
    console.log(`🔍 Checking Asana integration compliance for: ${pluginPath}\n`);

    const agentsDir = path.join(pluginPath, 'agents');

    if (!fs.existsSync(agentsDir)) {
      console.log(`⚠️  No agents directory found at ${agentsDir}`);
      return { compliant: true, violations: [] };
    }

    const agentFiles = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'));

    console.log(`Found ${agentFiles.length} agent(s) to check\n`);

    for (const agentFile of agentFiles) {
      const agentPath = path.join(agentsDir, agentFile);
      await this._checkAgent(agentPath);
    }

    return this._generateReport();
  }

  /**
   * Check single agent file
   */
  async _checkAgent(agentPath) {
    const agentName = path.basename(agentPath, '.md');
    const content = fs.readFileSync(agentPath, 'utf8');

    // Parse YAML frontmatter
    const frontmatter = this._parseFrontmatter(content);
    const tools = frontmatter.tools || [];

    // Check if agent uses Asana tools
    const usesAsana = this._usesAsanaTools(tools);

    if (!usesAsana) {
      // Agent doesn't use Asana, skip compliance checks
      console.log(`⚪ ${agentName}: No Asana tools - skipped`);
      return;
    }

    console.log(`🔵 ${agentName}: Uses Asana tools - checking compliance...`);

    // Run compliance checks
    const checks = [
      this._checkPlaybookReference(content, agentName),
      this._checkUpdateStandards(content, agentName),
      this._checkTemplateReferences(content, agentName),
      this._checkBrevityGuidelines(content, agentName)
    ];

    const results = checks.filter(c => c !== null);

    if (results.length === 0) {
      console.log(`  ✅ All checks passed\n`);
    } else {
      this.violations.push(...results);
      results.forEach(violation => {
        console.log(`  ❌ ${violation.check}: ${violation.message}`);
      });
      console.log();
    }
  }

  /**
   * Check if agent uses Asana MCP tools
   */
  _usesAsanaTools(tools) {
    if (typeof tools === 'string') {
      return tools.includes('mcp_asana') || tools.includes('mcp__asana');
    }

    if (Array.isArray(tools)) {
      return tools.some(t =>
        t.includes('mcp_asana') || t.includes('mcp__asana')
      );
    }

    return false;
  }

  /**
   * Check for playbook reference
   */
  _checkPlaybookReference(content, agentName) {
    const hasReference =
      content.includes('ASANA_AGENT_PLAYBOOK.md') ||
      content.includes('@import.*ASANA_AGENT_PLAYBOOK') ||
      content.includes('Asana Integration') ||
      content.includes('Asana Update Standards');

    if (!hasReference) {
      return {
        agent: agentName,
        check: 'Playbook Reference',
        severity: 'HIGH',
        message: 'Agent does not reference Asana Agent Playbook',
        fix: 'Add reference to ../docs/ASANA_AGENT_PLAYBOOK.md in agent documentation'
      };
    }

    return null;
  }

  /**
   * Check for update standards section
   */
  _checkUpdateStandards(content, agentName) {
    const hasStandards =
      content.includes('## Asana Update Standards') ||
      content.includes('## Asana Integration') ||
      content.includes('### Update Requirements');

    if (!hasStandards) {
      return {
        agent: agentName,
        check: 'Update Standards',
        severity: 'MEDIUM',
        message: 'Agent does not have Asana Update Standards section',
        fix: 'Add section documenting update requirements and templates'
      };
    }

    return null;
  }

  /**
   * Check for template references
   */
  _checkTemplateReferences(content, agentName) {
    const hasTemplates =
      content.includes('templates/asana-updates') ||
      content.includes('progress-update.md') ||
      content.includes('asanaUpdateFormatter');

    if (!hasTemplates) {
      return {
        agent: agentName,
        check: 'Template References',
        severity: 'MEDIUM',
        message: 'Agent does not reference update templates',
        fix: 'Reference templates from ../templates/asana-updates/'
      };
    }

    return null;
  }

  /**
   * Check for brevity guidelines
   */
  _checkBrevityGuidelines(content, agentName) {
    const hasBrevity =
      content.includes('100 words') ||
      content.includes('word limit') ||
      content.includes('Brevity') ||
      content.includes('Max Length');

    if (!hasBrevity) {
      return {
        agent: agentName,
        check: 'Brevity Guidelines',
        severity: 'LOW',
        message: 'Agent does not mention brevity requirements',
        fix: 'Document word limits (< 100 words for progress, etc.)'
      };
    }

    return null;
  }

  /**
   * Parse YAML frontmatter
   */
  _parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]+?)\n---/);

    if (!match) return {};

    const yaml = match[1];
    const frontmatter = {};

    // Simple YAML parsing (tools, name, description)
    yaml.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim();
        frontmatter[key.trim()] = value;
      }
    });

    return frontmatter;
  }

  /**
   * Generate compliance report
   */
  _generateReport() {
    const byAgent = {};
    for (const violation of this.violations) {
      if (!byAgent[violation.agent]) {
        byAgent[violation.agent] = [];
      }
      byAgent[violation.agent].push(violation);
    }

    const highSeverity = this.violations.filter(v => v.severity === 'HIGH').length;
    const mediumSeverity = this.violations.filter(v => v.severity === 'MEDIUM').length;
    const lowSeverity = this.violations.filter(v => v.severity === 'LOW').length;

    return {
      compliant: this.violations.length === 0,
      totalViolations: this.violations.length,
      highSeverity,
      mediumSeverity,
      lowSeverity,
      violations: this.violations,
      byAgent
    };
  }
}

// Export
module.exports = { AsanaIntegrationComplianceChecker };

// CLI usage
if (require.main === module) {
  const pluginPath = process.argv[2] || process.cwd();

  const checker = new AsanaIntegrationComplianceChecker({
    strictMode: process.argv.includes('--strict'),
    autoFix: process.argv.includes('--fix')
  });

  checker.checkPlugin(pluginPath)
    .then(report => {
      console.log('═'.repeat(70));
      console.log('📋 ASANA INTEGRATION COMPLIANCE REPORT');
      console.log('═'.repeat(70));
      console.log();

      if (report.compliant) {
        console.log('✅ All agents are compliant with Asana Integration Playbook\n');
      } else {
        console.log(`❌ Found ${report.totalViolations} violation(s):\n`);
        console.log(`  🔴 High Severity: ${report.highSeverity}`);
        console.log(`  🟡 Medium Severity: ${report.mediumSeverity}`);
        console.log(`  ⚪ Low Severity: ${report.lowSeverity}`);
        console.log();

        console.log('By Agent:');
        Object.entries(report.byAgent).forEach(([agent, violations]) => {
          console.log(`\n  ${agent}:`);
          violations.forEach(v => {
            console.log(`    ${v.severity === 'HIGH' ? '🔴' : v.severity === 'MEDIUM' ? '🟡' : '⚪'} ${v.check}: ${v.message}`);
            console.log(`       Fix: ${v.fix}`);
          });
        });
        console.log();
      }

      console.log('═'.repeat(70));

      // Exit with error code if non-compliant and in strict mode
      if (!report.compliant && checker.options.strictMode) {
        console.error('\n❌ Compliance check failed in strict mode');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Compliance check error:', error.message);
      process.exit(1);
    });
}
