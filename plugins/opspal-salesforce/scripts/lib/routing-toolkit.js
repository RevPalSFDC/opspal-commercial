#!/usr/bin/env node

/**
 * Routing Toolkit - Practical tools for managing agent routing
 *
 * Capabilities:
 * 1. VALIDATE - Check patterns for conflicts, validate agent references
 * 2. TEST - Interactive testing of routing decisions
 * 3. ANALYZE - Usage analytics and pattern effectiveness
 * 4. OPTIMIZE - Suggest improvements based on real usage
 *
 * Philosophy: Tools you'll actually use, not just defensive checks
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m'
};

class RoutingToolkit {
  constructor(options = {}) {
    this.pluginRoot = options.pluginRoot || path.join(__dirname, '../..');
    this.verbose = options.verbose || false;

    // Load routing components
    this.autoRouter = this.loadAutoRouter();
    this.patterns = this.loadPatterns();
    this.analytics = this.loadAnalytics();
    this.agentList = this.loadAgentList();
  }

  loadAutoRouter() {
    try {
      const AutoAgentRouter = require(path.join(this.pluginRoot, 'scripts/auto-agent-router.js'));
      return new AutoAgentRouter();
    } catch (error) {
      this.warn('Could not load auto-router:', error.message);
      return null;
    }
  }

  loadPatterns() {
    try {
      const candidatePaths = [
        path.join(this.pluginRoot, '.claude/agent-triggers.json'),
        path.join(this.pluginRoot, '.claude-plugin/agent-triggers.json')
      ];

      for (const patternsPath of candidatePaths) {
        if (fs.existsSync(patternsPath)) {
          return JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
        }
      }
    } catch (error) {
      this.warn('Could not load patterns:', error.message);
    }
    return { triggers: { mandatory: { patterns: [] }, keywords: { mappings: {} } } };
  }

  loadAnalytics() {
    try {
      const analyticsPath = path.join(this.pluginRoot, '.claude/agent-usage-data.json');
      if (fs.existsSync(analyticsPath)) {
        return JSON.parse(fs.readFileSync(analyticsPath, 'utf8'));
      }
    } catch (error) {
      // Analytics file may not exist yet
    }
    return { agentUsage: {}, autoInvocations: [] };
  }

  loadAgentList() {
    try {
      const agentsDir = path.join(this.pluginRoot, 'agents');
      if (fs.existsSync(agentsDir)) {
        return fs.readdirSync(agentsDir)
          .filter(f => f.endsWith('.md'))
          .map(f => f.replace('.md', ''));
      }
    } catch (error) {
      this.warn('Could not load agent list:', error.message);
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════
  // VALIDATION - Check patterns for conflicts and errors
  // ═══════════════════════════════════════════════════════════════

  validate() {
    console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.blue}🔍 ROUTING VALIDATION${c.reset}`);
    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    const issues = [];
    const warnings = [];

    // 1. Check for pattern conflicts
    console.log(`${c.yellow}1. Checking pattern conflicts...${c.reset}`);
    const conflicts = this.findPatternConflicts();
    if (conflicts.length > 0) {
      issues.push(...conflicts);
      console.log(`   ${c.red}✗ Found ${conflicts.length} conflict(s)${c.reset}`);
    } else {
      console.log(`   ${c.green}✓ No pattern conflicts${c.reset}`);
    }

    // 2. Validate agent references
    console.log(`${c.yellow}2. Validating agent references...${c.reset}`);
    const invalidRefs = this.validateAgentReferences();
    if (invalidRefs.length > 0) {
      issues.push(...invalidRefs);
      console.log(`   ${c.red}✗ Found ${invalidRefs.length} invalid reference(s)${c.reset}`);
    } else {
      console.log(`   ${c.green}✓ All agent references valid${c.reset}`);
    }

    // 3. Check complexity scoring consistency
    console.log(`${c.yellow}3. Checking complexity scoring...${c.reset}`);
    const scoringIssues = this.checkComplexityScoring();
    if (scoringIssues.length > 0) {
      warnings.push(...scoringIssues);
      console.log(`   ${c.yellow}⚠ Found ${scoringIssues.length} scoring inconsistency/ies${c.reset}`);
    } else {
      console.log(`   ${c.green}✓ Complexity scoring consistent${c.reset}`);
    }

    // 4. Check for unused patterns
    console.log(`${c.yellow}4. Checking for unused patterns...${c.reset}`);
    const unused = this.findUnusedPatterns();
    if (unused.length > 0) {
      warnings.push(...unused);
      console.log(`   ${c.yellow}⚠ Found ${unused.length} unused pattern(s)${c.reset}`);
    } else {
      console.log(`   ${c.green}✓ All patterns are used${c.reset}`);
    }

    // Summary
    console.log(`\n${c.bold}Summary:${c.reset}`);
    if (issues.length === 0 && warnings.length === 0) {
      console.log(`${c.green}${c.bold}✓ ALL CHECKS PASSED${c.reset}`);
      return { valid: true, issues: [], warnings: [] };
    }

    if (issues.length > 0) {
      console.log(`${c.red}✗ ${issues.length} issue(s) found (must fix)${c.reset}`);
      issues.forEach(issue => {
        console.log(`  ${c.red}•${c.reset} ${issue.message}`);
        if (issue.suggestion) {
          console.log(`    ${c.yellow}Suggestion: ${issue.suggestion}${c.reset}`);
        }
      });
    }

    if (warnings.length > 0) {
      console.log(`${c.yellow}⚠ ${warnings.length} warning(s) (should review)${c.reset}`);
      warnings.forEach(warning => {
        console.log(`  ${c.yellow}•${c.reset} ${warning.message}`);
      });
    }

    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    return { valid: issues.length === 0, issues, warnings };
  }

  findPatternConflicts() {
    const conflicts = [];
    const patterns = this.patterns.triggers?.mandatory?.patterns || [];

    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const p1 = patterns[i];
        const p2 = patterns[j];

        // Check if patterns overlap
        try {
          const regex1 = new RegExp(p1.pattern, 'i');
          const regex2 = new RegExp(p2.pattern, 'i');

          // Test with common operations
          const testCases = [
            'deploy to production',
            'bulk merge 100 accounts',
            'update production metadata',
            'production deployment'
          ];

          testCases.forEach(testCase => {
            const matches1 = regex1.test(testCase);
            const matches2 = regex2.test(testCase);

            if (matches1 && matches2 && p1.agent !== p2.agent) {
              conflicts.push({
                type: 'pattern_conflict',
                message: `Patterns "${p1.pattern}" and "${p2.pattern}" both match "${testCase}" but route to different agents (${p1.agent} vs ${p2.agent})`,
                suggestion: 'Make patterns more specific or merge into single pattern'
              });
            }
          });
        } catch (error) {
          conflicts.push({
            type: 'invalid_regex',
            message: `Pattern "${p1.pattern}" or "${p2.pattern}" is not a valid regex: ${error.message}`,
            suggestion: 'Fix regex syntax'
          });
        }
      }
    }

    return conflicts;
  }

  validateAgentReferences() {
    const invalid = [];
    const patterns = this.patterns.triggers?.mandatory?.patterns || [];
    const keywordMappings = this.patterns.triggers?.keywords?.mappings || {};

    // Check mandatory patterns
    patterns.forEach(p => {
      if (!this.agentList.includes(p.agent)) {
        invalid.push({
          type: 'invalid_agent',
          message: `Pattern "${p.pattern}" references non-existent agent "${p.agent}"`,
          suggestion: `Available agents: ${this.agentList.slice(0, 5).join(', ')}...`
        });
      }
    });

    // Check keyword mappings
    Object.entries(keywordMappings).forEach(([keyword, agents]) => {
      agents.forEach(agent => {
        if (!this.agentList.includes(agent)) {
          invalid.push({
            type: 'invalid_agent',
            message: `Keyword "${keyword}" references non-existent agent "${agent}"`,
            suggestion: 'Check agent name spelling or create the agent'
          });
        }
      });
    });

    return invalid;
  }

  checkComplexityScoring() {
    const issues = [];

    // Test similar operations and check if scoring is consistent
    const testPairs = [
      {
        op1: 'bulk update 100 accounts',
        op2: 'bulk update 100 contacts',
        expectedSimilar: true
      },
      {
        op1: 'deploy to production',
        op2: 'deploy to sandbox',
        expectedSimilar: false
      },
      {
        op1: 'create single field',
        op2: 'create 10 fields',
        expectedSimilar: false
      }
    ];

    testPairs.forEach(({ op1, op2, expectedSimilar }) => {
      const score1 = this.autoRouter.calculateComplexity(op1);
      const score2 = this.autoRouter.calculateComplexity(op2);
      const diff = Math.abs(score1 - score2);

      if (expectedSimilar && diff > 0.2) {
        issues.push({
          type: 'scoring_inconsistency',
          message: `Similar operations have different complexity scores:\n    "${op1}" = ${score1.toFixed(2)}\n    "${op2}" = ${score2.toFixed(2)}`
        });
      }

      if (!expectedSimilar && diff < 0.1) {
        issues.push({
          type: 'scoring_too_similar',
          message: `Different operations have too similar complexity scores:\n    "${op1}" = ${score1.toFixed(2)}\n    "${op2}" = ${score2.toFixed(2)}`
        });
      }
    });

    return issues;
  }

  findUnusedPatterns() {
    const unused = [];
    const invocations = this.analytics.autoInvocations || [];
    const patterns = this.patterns.triggers?.mandatory?.patterns || [];

    if (invocations.length === 0) {
      return [{ type: 'no_data', message: 'No usage data available yet - patterns cannot be evaluated' }];
    }

    patterns.forEach(pattern => {
      const regex = new RegExp(pattern.pattern, 'i');
      const matchCount = invocations.filter(inv => regex.test(inv.operation)).length;

      if (matchCount === 0) {
        unused.push({
          type: 'unused_pattern',
          message: `Pattern "${pattern.pattern}" has never matched any operation (${invocations.length} total operations checked)`
        });
      }
    });

    return unused;
  }

  // ═══════════════════════════════════════════════════════════════
  // TESTING - Interactive routing testing
  // ═══════════════════════════════════════════════════════════════

  async test(operations = null) {
    console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.blue}🧪 ROUTING TEST${c.reset}`);
    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    const testOps = operations || [
      'deploy to production',
      'bulk merge 50 duplicate accounts',
      'create Contact layout for sales reps',
      'analyze automation workflows',
      'update single field on Account',
      'fix deployment conflict in validation rules',
      'generate opportunity layout for executives',
      'bulk delete 1000 old leads'
    ];

    console.log(`Testing ${testOps.length} operations...\n`);

    const results = [];

    for (const op of testOps) {
      console.log(`${c.cyan}Operation: ${c.reset}"${op}"`);

      const result = await this.autoRouter.routeOperation(op, true);
      results.push({ operation: op, ...result });

      if (result.routed) {
        console.log(`  ${c.green}✓ Routed to: ${result.agent}${c.reset}`);
        console.log(`    Complexity: ${this.getComplexityLabel(result.complexity)} (${(result.complexity * 100).toFixed(0)}%)`);
        console.log(`    Confidence: ${this.getConfidenceLabel(result.confidence)} (${(result.confidence * 100).toFixed(0)}%)`);
        console.log(`    Auto-invoke: ${result.autoInvoked ? c.green + 'YES' + c.reset : c.yellow + 'NO' + c.reset}`);
      } else {
        console.log(`  ${c.red}✗ No agent matched${c.reset}`);
      }
      console.log('');
    }

    // Summary
    console.log(`${c.bold}Test Summary:${c.reset}`);
    const routed = results.filter(r => r.routed).length;
    const autoInvoked = results.filter(r => r.autoInvoked).length;
    console.log(`  Total operations: ${results.length}`);
    console.log(`  Successfully routed: ${routed} (${((routed / results.length) * 100).toFixed(0)}%)`);
    console.log(`  Auto-invoked: ${autoInvoked} (${((autoInvoked / results.length) * 100).toFixed(0)}%)`);

    console.log(`\n${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    return results;
  }

  getComplexityLabel(score) {
    if (score < 0.3) return `${c.green}SIMPLE${c.reset}`;
    if (score < 0.7) return `${c.yellow}MEDIUM${c.reset}`;
    return `${c.red}HIGH${c.reset}`;
  }

  getConfidenceLabel(score) {
    if (score < 0.5) return `${c.red}LOW${c.reset}`;
    if (score < 0.8) return `${c.yellow}MEDIUM${c.reset}`;
    return `${c.green}HIGH${c.reset}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYTICS - Usage analytics and effectiveness
  // ═══════════════════════════════════════════════════════════════

  analyze(options = {}) {
    console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.blue}📊 ROUTING ANALYTICS${c.reset}`);
    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    const invocations = this.analytics.autoInvocations || [];
    const agentUsage = this.analytics.agentUsage || {};

    if (invocations.length === 0) {
      console.log(`${c.yellow}No routing data available yet.${c.reset}`);
      console.log(`Use the routing system in real operations to generate analytics.\n`);
      return;
    }

    // 1. Overall stats
    console.log(`${c.bold}Overall Statistics:${c.reset}`);
    console.log(`  Total routing operations: ${invocations.length}`);
    const uniqueAgents = new Set(invocations.map(i => i.agent)).size;
    console.log(`  Unique agents used: ${uniqueAgents}`);
    const avgSuccessRate = Object.values(agentUsage).reduce((sum, stats) => {
      return sum + (stats.totalUses > 0 ? stats.successCount / stats.totalUses : 0);
    }, 0) / Object.keys(agentUsage).length;
    console.log(`  Average success rate: ${(avgSuccessRate * 100).toFixed(1)}%\n`);

    // 2. Top agents by usage
    console.log(`${c.bold}Top Agents (by usage):${c.reset}`);
    const topAgents = Object.entries(agentUsage)
      .sort((a, b) => b[1].totalUses - a[1].totalUses)
      .slice(0, options.limit || 10);

    topAgents.forEach(([agent, stats], idx) => {
      const successRate = stats.totalUses > 0
        ? ((stats.successCount / stats.totalUses) * 100).toFixed(0)
        : 0;
      const bar = this.makeBar(stats.totalUses, topAgents[0][1].totalUses, 20);
      console.log(`  ${idx + 1}. ${agent}`);
      console.log(`     ${bar} ${stats.totalUses} uses | ${successRate}% success | ${stats.autoInvoked || 0} auto`);
    });
    console.log('');

    // 3. Pattern effectiveness
    console.log(`${c.bold}Pattern Effectiveness:${c.reset}`);
    const patterns = this.patterns.triggers?.mandatory?.patterns || [];
    patterns.forEach(pattern => {
      const regex = new RegExp(pattern.pattern, 'i');
      const matches = invocations.filter(inv => regex.test(inv.operation));
      const successCount = matches.filter(m => m.success).length;
      const successRate = matches.length > 0 ? ((successCount / matches.length) * 100).toFixed(0) : 0;

      if (matches.length > 0) {
        console.log(`  Pattern: "${pattern.pattern}"`);
        console.log(`    Matched: ${matches.length} times | Success: ${successRate}% | Agent: ${pattern.agent}`);
      }
    });
    console.log('');

    // 4. Recent activity
    console.log(`${c.bold}Recent Activity (last 10):${c.reset}`);
    invocations.slice(-10).reverse().forEach(inv => {
      const time = new Date(inv.timestamp).toLocaleString();
      const status = inv.success ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      const opShort = inv.operation.substring(0, 50) + (inv.operation.length > 50 ? '...' : '');
      console.log(`  ${status} [${time}] ${inv.agent}`);
      console.log(`     "${opShort}"`);
    });

    console.log(`\n${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);
  }

  makeBar(value, max, width) {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    return `${c.cyan}${'█'.repeat(filled)}${c.reset}${'░'.repeat(empty)}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIMIZATION - Suggest improvements
  // ═══════════════════════════════════════════════════════════════

  optimize() {
    console.log(`\n${c.bold}${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.blue}⚡ ROUTING OPTIMIZATION${c.reset}`);
    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    const suggestions = [];
    const invocations = this.analytics.autoInvocations || [];
    const agentUsage = this.analytics.agentUsage || {};

    if (invocations.length < 10) {
      console.log(`${c.yellow}Not enough data for optimization (need 10+ operations, have ${invocations.length})${c.reset}\n`);
      return [];
    }

    // 1. Find frequently matched operations without patterns
    console.log(`${c.yellow}Analyzing operation patterns...${c.reset}\n`);

    const operationWords = {};
    invocations.forEach(inv => {
      const words = inv.operation.toLowerCase().match(/\b\w{4,}\b/g) || [];
      words.forEach(word => {
        operationWords[word] = (operationWords[word] || 0) + 1;
      });
    });

    const frequentWords = Object.entries(operationWords)
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (frequentWords.length > 0) {
      console.log(`${c.bold}1. Frequent Operation Keywords:${c.reset}`);
      frequentWords.forEach(([word, count]) => {
        console.log(`   "${word}" appears ${count} times`);
        suggestions.push({
          type: 'add_pattern',
          message: `Consider adding pattern for "${word}" operations`,
          impact: 'medium',
          action: `Add to agent-triggers.json: { "pattern": "${word}", "agent": "<appropriate-agent>" }`
        });
      });
      console.log('');
    }

    // 2. Find low success rate agents
    console.log(`${c.bold}2. Agent Performance:${c.reset}`);
    Object.entries(agentUsage).forEach(([agent, stats]) => {
      if (stats.totalUses >= 3) {
        const successRate = stats.successCount / stats.totalUses;
        if (successRate < 0.6) {
          console.log(`   ${c.red}✗ ${agent}: ${(successRate * 100).toFixed(0)}% success (${stats.totalUses} uses)${c.reset}`);
          suggestions.push({
            type: 'low_success_rate',
            message: `Agent "${agent}" has low success rate (${(successRate * 100).toFixed(0)}%)`,
            impact: 'high',
            action: `Review agent capabilities or improve routing logic for this agent`
          });
        } else if (successRate > 0.9 && stats.totalUses > 5) {
          console.log(`   ${c.green}✓ ${agent}: ${(successRate * 100).toFixed(0)}% success (${stats.totalUses} uses) - Excellent!${c.reset}`);
        }
      }
    });
    console.log('');

    // 3. Find auto-invoke opportunities
    console.log(`${c.bold}3. Auto-Invoke Opportunities:${c.reset}`);
    Object.entries(agentUsage).forEach(([agent, stats]) => {
      if (stats.totalUses >= 5) {
        const successRate = stats.successCount / stats.totalUses;
        const autoRate = stats.autoInvoked / stats.totalUses;

        if (successRate > 0.8 && autoRate < 0.5) {
          console.log(`   ${c.yellow}⚡ ${agent}: High success (${(successRate * 100).toFixed(0)}%) but low auto-invoke (${(autoRate * 100).toFixed(0)}%)${c.reset}`);
          suggestions.push({
            type: 'enable_auto_invoke',
            message: `Agent "${agent}" has high success rate but is rarely auto-invoked`,
            impact: 'medium',
            action: `Consider enabling auto-invoke for this agent in agent-triggers.json`
          });
        }
      }
    });
    console.log('');

    // Summary
    if (suggestions.length === 0) {
      console.log(`${c.green}${c.bold}✓ No optimization opportunities found - routing is working well!${c.reset}\n`);
    } else {
      console.log(`${c.bold}Optimization Summary:${c.reset}`);
      console.log(`  Total suggestions: ${suggestions.length}\n`);

      const highImpact = suggestions.filter(s => s.impact === 'high');
      if (highImpact.length > 0) {
        console.log(`${c.red}${c.bold}High Priority (${highImpact.length}):${c.reset}`);
        highImpact.forEach(s => {
          console.log(`  • ${s.message}`);
          console.log(`    ${c.yellow}Action: ${s.action}${c.reset}`);
        });
        console.log('');
      }

      const mediumImpact = suggestions.filter(s => s.impact === 'medium');
      if (mediumImpact.length > 0) {
        console.log(`${c.yellow}${c.bold}Medium Priority (${mediumImpact.length}):${c.reset}`);
        mediumImpact.forEach(s => {
          console.log(`  • ${s.message}`);
        });
        console.log('');
      }
    }

    console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

    return suggestions;
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════

  warn(message, details = '') {
    if (this.verbose) {
      console.warn(`${c.yellow}Warning: ${message}${c.reset}`, details);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════════

if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  const toolkit = new RoutingToolkit({ verbose: args.includes('--verbose') });

  switch (command) {
    case 'validate':
      const result = toolkit.validate();
      process.exit(result.valid ? 0 : 1);
      break;

    case 'test':
      const operations = args.filter(a => !a.startsWith('--'));
      toolkit.test(operations.length > 0 ? operations : null);
      break;

    case 'analyze':
      const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 10;
      toolkit.analyze({ limit });
      break;

    case 'optimize':
      toolkit.optimize();
      break;

    case 'all':
      console.log(`\n${c.bold}${c.purple}Running complete routing analysis...${c.reset}\n`);
      toolkit.validate();
      toolkit.test();
      toolkit.analyze();
      toolkit.optimize();
      break;

    default:
      console.log(`${c.bold}Routing Toolkit${c.reset} - Practical tools for managing agent routing\n`);
      console.log('Commands:');
      console.log(`  ${c.green}validate${c.reset}           Check patterns for conflicts and errors`);
      console.log(`  ${c.green}test${c.reset} [ops...]      Test routing with sample operations`);
      console.log(`  ${c.green}analyze${c.reset}            Show usage analytics and effectiveness`);
      console.log(`  ${c.green}optimize${c.reset}           Suggest improvements based on usage`);
      console.log(`  ${c.green}all${c.reset}                Run all tools (full analysis)\n`);
      console.log('Options:');
      console.log('  --verbose          Show detailed output');
      console.log('  --limit=N          Limit results (for analyze)\n');
      console.log('Examples:');
      console.log(`  ${c.cyan}routing-toolkit.js validate${c.reset}`);
      console.log(`  ${c.cyan}routing-toolkit.js test "deploy to production" "bulk merge accounts"${c.reset}`);
      console.log(`  ${c.cyan}routing-toolkit.js analyze --limit=20${c.reset}`);
      console.log(`  ${c.cyan}routing-toolkit.js optimize${c.reset}`);
      console.log(`  ${c.cyan}routing-toolkit.js all${c.reset}\n`);
  }
}

module.exports = RoutingToolkit;
