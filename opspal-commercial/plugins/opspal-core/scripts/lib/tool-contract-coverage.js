#!/usr/bin/env node
/**
 * Tool Contract Coverage Report
 *
 * Analyzes tool invocations against contract coverage to identify gaps.
 * Generates contract templates for uncovered tools.
 *
 * Addresses: Tool contract validation gaps identified in reflection cohorts
 *
 * Usage:
 *   const { ToolContractCoverage } = require('./tool-contract-coverage');
 *   const coverage = new ToolContractCoverage();
 *   const report = await coverage.generateReport();
 *
 * CLI:
 *   node tool-contract-coverage.js report
 *   node tool-contract-coverage.js generate-template <tool-name>
 *   node tool-contract-coverage.js scan-invocations [--days 7]
 *
 * @module tool-contract-coverage
 * @version 1.0.0
 * @created 2026-01-24
 */

const fs = require('fs');
const path = require('path');

/**
 * Tool Contract Coverage Analyzer
 */
class ToolContractCoverage {
  constructor(options = {}) {
    this.contractsDir = options.contractsDir || path.join(__dirname, '../../config/tool-contracts');
    this.invocationsLog = options.invocationsLog || path.join(process.env.HOME || '~', '.claude/logs/tool-invocations.jsonl');
    this.verbose = options.verbose || false;

    // Load all contracts
    this.contracts = this.loadAllContracts();
  }

  /**
   * Load all tool contracts from the contracts directory
   */
  loadAllContracts() {
    const contracts = {};

    if (!fs.existsSync(this.contractsDir)) {
      console.warn(`Contracts directory not found: ${this.contractsDir}`);
      return contracts;
    }

    const files = fs.readdirSync(this.contractsDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.contractsDir, file), 'utf8');
        const parsed = JSON.parse(content);

        // Merge contracts from this file
        for (const [toolName, contract] of Object.entries(parsed)) {
          contracts[toolName] = {
            ...contract,
            _sourceFile: file
          };
        }
      } catch (e) {
        console.warn(`Failed to load contract file ${file}: ${e.message}`);
      }
    }

    return contracts;
  }

  /**
   * Scan invocation logs to find tools that have been used
   */
  scanInvocations(options = {}) {
    const days = options.days || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const invocations = {};
    const logPaths = [
      this.invocationsLog,
      path.join(process.env.HOME || '~', '.claude/logs/routing.jsonl'),
      path.join(process.env.HOME || '~', '.claude/logs/tool-calls.jsonl')
    ];

    for (const logPath of logPaths) {
      if (!fs.existsSync(logPath)) {
        if (this.verbose) {
          console.log(`Log file not found: ${logPath}`);
        }
        continue;
      }

      try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);

            // Check timestamp if available
            if (entry.timestamp) {
              const entryDate = new Date(entry.timestamp);
              if (entryDate < cutoffDate) continue;
            }

            // Extract tool name from various log formats
            const toolName = entry.tool || entry.toolName || entry.tool_name ||
                           (entry.invocation && entry.invocation.tool);

            if (toolName) {
              invocations[toolName] = invocations[toolName] || {
                count: 0,
                lastSeen: null,
                errors: 0,
                params: new Set()
              };

              invocations[toolName].count++;

              if (entry.timestamp) {
                const ts = new Date(entry.timestamp);
                if (!invocations[toolName].lastSeen || ts > invocations[toolName].lastSeen) {
                  invocations[toolName].lastSeen = ts;
                }
              }

              if (entry.error || entry.status === 'error' || entry.status === 'blocked') {
                invocations[toolName].errors++;
              }

              // Track unique parameter names
              const params = entry.params || entry.parameters || entry.arguments || {};
              Object.keys(params).forEach(p => invocations[toolName].params.add(p));
            }
          } catch (e) {
            // Skip malformed log entries
          }
        }
      } catch (e) {
        console.warn(`Failed to read log file ${logPath}: ${e.message}`);
      }
    }

    // Convert Sets to arrays for serialization
    for (const tool of Object.keys(invocations)) {
      invocations[tool].params = Array.from(invocations[tool].params);
    }

    return invocations;
  }

  /**
   * Analyze coverage and generate report
   */
  generateReport(options = {}) {
    const invocations = this.scanInvocations(options);
    const contractedTools = Object.keys(this.contracts);
    const invokedTools = Object.keys(invocations);

    // Calculate coverage metrics
    const coveredTools = invokedTools.filter(t => contractedTools.includes(t));
    const uncoveredTools = invokedTools.filter(t => !contractedTools.includes(t));
    const unusedContracts = contractedTools.filter(t => !invokedTools.includes(t));

    // Categorize uncovered tools
    const categorized = this.categorizeTools(uncoveredTools);

    // Calculate risk scores for uncovered tools
    const riskAssessment = uncoveredTools.map(tool => {
      const inv = invocations[tool];
      const errorRate = inv.count > 0 ? inv.errors / inv.count : 0;
      const riskScore = this.calculateRiskScore(tool, inv, errorRate);

      return {
        tool,
        invocationCount: inv.count,
        errorCount: inv.errors,
        errorRate: (errorRate * 100).toFixed(1) + '%',
        riskScore,
        riskLevel: riskScore >= 7 ? 'HIGH' : riskScore >= 4 ? 'MEDIUM' : 'LOW',
        params: inv.params,
        category: this.detectCategory(tool)
      };
    }).sort((a, b) => b.riskScore - a.riskScore);

    // Build report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalInvokedTools: invokedTools.length,
        totalContracts: contractedTools.length,
        coveredTools: coveredTools.length,
        uncoveredTools: uncoveredTools.length,
        unusedContracts: unusedContracts.length,
        coveragePercentage: invokedTools.length > 0
          ? ((coveredTools.length / invokedTools.length) * 100).toFixed(1) + '%'
          : '100%'
      },
      coverage: {
        covered: coveredTools,
        uncovered: uncoveredTools,
        unused: unusedContracts
      },
      riskAssessment,
      categorization: categorized,
      recommendations: this.generateRecommendations(riskAssessment, categorized)
    };

    return report;
  }

  /**
   * Calculate risk score for an uncovered tool
   */
  calculateRiskScore(toolName, invocation, errorRate) {
    let score = 0;

    // High invocation count = higher risk
    if (invocation.count >= 100) score += 3;
    else if (invocation.count >= 50) score += 2;
    else if (invocation.count >= 10) score += 1;

    // High error rate = higher risk
    if (errorRate >= 0.2) score += 3;
    else if (errorRate >= 0.1) score += 2;
    else if (errorRate >= 0.05) score += 1;

    // Destructive operations = higher risk
    const destructivePatterns = [
      /delete/i, /remove/i, /destroy/i, /drop/i,
      /update/i, /modify/i, /write/i, /create/i
    ];
    if (destructivePatterns.some(p => p.test(toolName))) {
      score += 2;
    }

    // MCP tools may have additional risks
    if (toolName.startsWith('mcp__')) {
      score += 1;
    }

    // SF/production operations
    if (/sf_|salesforce|deploy|production/i.test(toolName)) {
      score += 2;
    }

    return Math.min(score, 10);
  }

  /**
   * Detect tool category from name
   */
  detectCategory(toolName) {
    const categories = {
      'mcp__asana': 'asana',
      'mcp__supabase': 'supabase',
      'mcp__playwright': 'playwright',
      'mcp__sequential': 'sequential_thinking',
      'mcp__lucid': 'lucidchart',
      'mcp__gdrive': 'gdrive',
      'mcp__notebooklm': 'notebooklm',
      'sf_': 'salesforce',
      'hs_': 'hubspot',
      'mk_': 'marketo'
    };

    for (const [prefix, category] of Object.entries(categories)) {
      if (toolName.startsWith(prefix) || toolName.includes(prefix)) {
        return category;
      }
    }

    return 'unknown';
  }

  /**
   * Categorize uncovered tools by type/platform
   */
  categorizeTools(tools) {
    const categories = {};

    for (const tool of tools) {
      const category = this.detectCategory(tool);
      categories[category] = categories[category] || [];
      categories[category].push(tool);
    }

    return categories;
  }

  /**
   * Generate contract template for a tool
   */
  generateContractTemplate(toolName, invocationData = {}) {
    const params = invocationData.params || [];
    const category = this.detectCategory(toolName);

    // Generate basic contract structure
    const contract = {
      description: `[TODO: Add description for ${toolName}]`,
      required: [],
      optional: params.length > 0 ? params : [],
      types: {},
      rules: []
    };

    // Add common type hints based on parameter names
    for (const param of params) {
      if (param.endsWith('_id') || param.endsWith('Id') || param === 'id') {
        contract.types[param] = 'string';
      } else if (param.includes('count') || param.includes('limit') || param.includes('offset')) {
        contract.types[param] = 'number';
      } else if (param.includes('enabled') || param.includes('active') || param.startsWith('is_')) {
        contract.types[param] = 'boolean';
      } else if (param.includes('date') || param.includes('time') || param.endsWith('_at')) {
        contract.types[param] = 'string';
        contract.patterns = contract.patterns || {};
        contract.patterns[param] = {
          pattern: '^\\d{4}-\\d{2}-\\d{2}',
          description: 'ISO date format (YYYY-MM-DD)'
        };
      } else if (param.includes('url') || param.includes('link') || param.includes('href')) {
        contract.types[param] = 'string';
        contract.patterns = contract.patterns || {};
        contract.patterns[param] = {
          pattern: '^https?://',
          description: 'Valid HTTP/HTTPS URL'
        };
      } else {
        contract.types[param] = 'string';
      }
    }

    // Add category-specific rules
    if (category === 'supabase') {
      if (toolName.includes('delete') || toolName.includes('update')) {
        contract.rules.push({
          name: 'filter_required',
          description: 'Filter is required to prevent full-table operations',
          condition: {
            param: 'filter',
            missing: true
          },
          severity: 'CRITICAL',
          message: 'filter parameter is required to prevent accidental full-table operations',
          remediation: 'Add filter parameter to specify which rows to affect'
        });
      }
    } else if (category === 'salesforce') {
      contract.rules.push({
        name: 'org_authenticated',
        description: 'Salesforce org must be authenticated',
        condition: {
          env: 'SF_ORG_ALIAS',
          missing: true
        },
        severity: 'CRITICAL',
        message: 'Salesforce org must be authenticated before operations',
        remediation: 'Run sf org login web to authenticate'
      });
    }

    return { [toolName]: contract };
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(riskAssessment, categorization) {
    const recommendations = [];

    // High-risk tools need contracts immediately
    const highRisk = riskAssessment.filter(t => t.riskLevel === 'HIGH');
    if (highRisk.length > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        action: 'Create contracts for high-risk uncovered tools',
        tools: highRisk.map(t => t.tool),
        reason: 'High invocation count and/or error rate without validation'
      });
    }

    // Recommend category-based templates
    for (const [category, tools] of Object.entries(categorization)) {
      if (tools.length >= 3 && category !== 'unknown') {
        recommendations.push({
          priority: 'HIGH',
          action: `Create ${category} tool contract file`,
          tools,
          reason: `Multiple ${category} tools (${tools.length}) without contracts`
        });
      }
    }

    // General coverage improvement
    const mediumRisk = riskAssessment.filter(t => t.riskLevel === 'MEDIUM');
    if (mediumRisk.length > 5) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Batch create contracts for medium-risk tools',
        tools: mediumRisk.map(t => t.tool),
        reason: `${mediumRisk.length} tools with moderate risk lacking validation`
      });
    }

    return recommendations;
  }

  /**
   * Format report for display
   */
  formatForDisplay(report) {
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('  TOOL CONTRACT COVERAGE REPORT');
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Generated: ${report.timestamp}`);
    lines.push('');
    lines.push('─────────────────────────────────────────────────────────────────');
    lines.push('  SUMMARY');
    lines.push('─────────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push(`Total Tools Invoked:     ${report.summary.totalInvokedTools}`);
    lines.push(`Total Contracts:         ${report.summary.totalContracts}`);
    lines.push(`Covered Tools:           ${report.summary.coveredTools}`);
    lines.push(`Uncovered Tools:         ${report.summary.uncoveredTools}`);
    lines.push(`Unused Contracts:        ${report.summary.unusedContracts}`);
    lines.push(`Coverage:                ${report.summary.coveragePercentage}`);
    lines.push('');

    if (report.riskAssessment.length > 0) {
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('  UNCOVERED TOOLS (by risk)');
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('');

      for (const tool of report.riskAssessment.slice(0, 20)) {
        const icon = tool.riskLevel === 'HIGH' ? '❌' :
                    tool.riskLevel === 'MEDIUM' ? '⚠️' : 'ℹ️';
        lines.push(`${icon} [${tool.riskLevel}] ${tool.tool}`);
        lines.push(`   Invocations: ${tool.invocationCount} | Errors: ${tool.errorCount} (${tool.errorRate})`);
        lines.push(`   Category: ${tool.category}`);
        if (tool.params.length > 0) {
          lines.push(`   Known params: ${tool.params.slice(0, 5).join(', ')}${tool.params.length > 5 ? '...' : ''}`);
        }
        lines.push('');
      }

      if (report.riskAssessment.length > 20) {
        lines.push(`... and ${report.riskAssessment.length - 20} more tools`);
        lines.push('');
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('  RECOMMENDATIONS');
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('');

      for (let i = 0; i < report.recommendations.length; i++) {
        const rec = report.recommendations[i];
        const icon = rec.priority === 'CRITICAL' ? '🔴' :
                    rec.priority === 'HIGH' ? '🟠' : '🟡';
        lines.push(`${i + 1}. ${icon} [${rec.priority}] ${rec.action}`);
        lines.push(`   Reason: ${rec.reason}`);
        lines.push(`   Tools: ${rec.tools.slice(0, 3).join(', ')}${rec.tools.length > 3 ? ` (+${rec.tools.length - 3} more)` : ''}`);
        lines.push('');
      }
    }

    if (report.coverage.unused.length > 0) {
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('  UNUSED CONTRACTS');
      lines.push('─────────────────────────────────────────────────────────────────');
      lines.push('');
      lines.push('The following contracts exist but no tool invocations were found:');
      lines.push('');
      for (const tool of report.coverage.unused.slice(0, 10)) {
        lines.push(`  • ${tool}`);
      }
      if (report.coverage.unused.length > 10) {
        lines.push(`  ... and ${report.coverage.unused.length - 10} more`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'report';

  const coverage = new ToolContractCoverage({ verbose: args.includes('--verbose') });

  switch (command) {
    case 'report': {
      const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 7;
      const report = coverage.generateReport({ days });

      if (args.includes('--json')) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(coverage.formatForDisplay(report));
      }

      // Exit with warning if coverage is below threshold
      const coverageNum = parseFloat(report.summary.coveragePercentage);
      if (coverageNum < 80) {
        console.log('\n⚠️  Coverage below 80% threshold');
        process.exit(2);
      }
      break;
    }

    case 'generate-template': {
      const toolName = args[1];
      if (!toolName) {
        console.error('Usage: tool-contract-coverage.js generate-template <tool-name>');
        process.exit(1);
      }

      const invocations = coverage.scanInvocations({ days: 30 });
      const invocationData = invocations[toolName] || {};
      const template = coverage.generateContractTemplate(toolName, invocationData);

      console.log('// Generated contract template');
      console.log('// Add to appropriate file in config/tool-contracts/');
      console.log(JSON.stringify(template, null, 2));
      break;
    }

    case 'scan-invocations': {
      const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 7;
      const invocations = coverage.scanInvocations({ days });

      console.log(`Tool invocations (last ${days} days):`);
      console.log('');

      const sorted = Object.entries(invocations)
        .sort((a, b) => b[1].count - a[1].count);

      for (const [tool, data] of sorted.slice(0, 30)) {
        console.log(`${tool}: ${data.count} invocations, ${data.errors} errors`);
      }

      if (sorted.length > 30) {
        console.log(`... and ${sorted.length - 30} more tools`);
      }
      break;
    }

    case 'help':
    default:
      console.log('Tool Contract Coverage Report');
      console.log('');
      console.log('Usage:');
      console.log('  node tool-contract-coverage.js report [--days N] [--json]');
      console.log('  node tool-contract-coverage.js generate-template <tool-name>');
      console.log('  node tool-contract-coverage.js scan-invocations [--days N]');
      console.log('');
      console.log('Options:');
      console.log('  --days N      Number of days to scan (default: 7)');
      console.log('  --json        Output in JSON format');
      console.log('  --verbose     Verbose output');
      break;
  }
}

module.exports = { ToolContractCoverage };
