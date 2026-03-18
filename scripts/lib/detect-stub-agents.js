#!/usr/bin/env node

/**
 * detect-stub-agents.js
 *
 * Detects incomplete "stub" agents that have placeholder sections without content.
 * Common patterns include:
 * - Numbered sections with no content (### 0, ### 1, etc.)
 * - Sections with only whitespace
 * - Very short agents (<100 lines of actual content)
 * - Missing required sections
 *
 * Usage:
 *   node detect-stub-agents.js [--plugin <name>] [--all] [--fix-report] [--json]
 *
 * @version 1.0.0
 * @author RevPal Engineering
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Configuration
const PLUGINS_DIR = path.resolve(__dirname, '../../.claude-plugins');
const MIN_CONTENT_LINES = 100;
const MIN_SECTIONS = 3;

// Patterns that indicate stub/incomplete content
const STUB_PATTERNS = [
  /^### \d+\s*$/gm,                    // Numbered headers with no content (### 0, ### 1, etc.)
  /^## [A-Za-z ]+\n\n(?=##|$)/gm,      // Empty H2 sections
  /^### [A-Za-z ]+\n\n(?=###|##|$)/gm, // Empty H3 sections
  /\[TODO\]/gi,                        // TODO markers
  /\[PLACEHOLDER\]/gi,                 // Placeholder markers
  /\[TBD\]/gi,                         // TBD markers
  /^```\s*\n```$/gm,                   // Empty code blocks
];

// Required sections for a complete agent
const REQUIRED_SECTIONS = [
  'Core Capabilities',
  'Best Practices',
  'Common Tasks',
  'Error Handling',
];

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  plugin: null,
  all: false,
  fixReport: false,
  json: false,
  verbose: false,
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--plugin':
      options.plugin = args[++i];
      break;
    case '--all':
      options.all = true;
      break;
    case '--fix-report':
      options.fixReport = true;
      break;
    case '--json':
      options.json = true;
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
  }
}

function printHelp() {
  console.log(`
detect-stub-agents.js - Find incomplete/stub agents in plugins

Usage:
  node detect-stub-agents.js [options]

Options:
  --plugin <name>   Scan only the specified plugin
  --all            Scan all plugins (default if no plugin specified)
  --fix-report     Generate a detailed report with fix suggestions
  --json           Output results as JSON
  --verbose, -v    Show detailed analysis
  --help, -h       Show this help message

Examples:
  node detect-stub-agents.js --all
  node detect-stub-agents.js --plugin hubspot-plugin --fix-report
  node detect-stub-agents.js --all --json > stub-report.json
`);
}

/**
 * Analyze an agent file for stub patterns
 * @param {string} filePath - Path to the agent markdown file
 * @returns {Object} Analysis results
 */
function analyzeAgent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileName = path.basename(filePath);
  const pluginName = path.basename(path.dirname(path.dirname(filePath)));

  const issues = [];
  const analysis = {
    file: filePath,
    fileName,
    pluginName,
    totalLines: lines.length,
    contentLines: 0,
    isStub: false,
    stubScore: 0, // 0-100, higher = more stub-like
    issues: [],
    missingSections: [],
    stubPatterns: [],
  };

  // Count actual content lines (non-empty, non-frontmatter)
  let inFrontmatter = false;
  let contentStarted = false;
  for (const line of lines) {
    if (line.trim() === '---') {
      if (!contentStarted) {
        inFrontmatter = !inFrontmatter;
        continue;
      }
    }
    if (!inFrontmatter && line.trim().length > 0) {
      contentStarted = true;
      analysis.contentLines++;
    }
  }

  // Check for stub patterns
  for (const pattern of STUB_PATTERNS) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      analysis.stubPatterns.push({
        pattern: pattern.toString(),
        count: matches.length,
        samples: matches.slice(0, 3),
      });
      analysis.stubScore += matches.length * 10;
    }
  }

  // Check for numbered empty sections (### 0, ### 1, etc.)
  const numberedSectionPattern = /### (\d+)\s*\n\s*\n/g;
  const numberedMatches = [...content.matchAll(numberedSectionPattern)];
  if (numberedMatches.length > 0) {
    analysis.issues.push({
      type: 'NUMBERED_STUB_SECTIONS',
      severity: 'CRITICAL',
      message: `Found ${numberedMatches.length} numbered stub sections (### 0, ### 1, etc.)`,
      lines: numberedMatches.map(m => m[1]),
    });
    analysis.stubScore += numberedMatches.length * 20;
  }

  // Check for required sections
  for (const section of REQUIRED_SECTIONS) {
    const sectionPattern = new RegExp(`##+ ${section}`, 'i');
    if (!sectionPattern.test(content)) {
      analysis.missingSections.push(section);
    }
  }
  if (analysis.missingSections.length > 0) {
    analysis.stubScore += analysis.missingSections.length * 5;
  }

  // Check for minimum content
  if (analysis.contentLines < MIN_CONTENT_LINES) {
    analysis.issues.push({
      type: 'INSUFFICIENT_CONTENT',
      severity: 'HIGH',
      message: `Only ${analysis.contentLines} lines of content (minimum: ${MIN_CONTENT_LINES})`,
    });
    analysis.stubScore += 20;
  }

  // Check for empty sections after headers
  const emptyAfterHeader = content.match(/^##+ .+\n\n(?=##)/gm);
  if (emptyAfterHeader && emptyAfterHeader.length > 2) {
    analysis.issues.push({
      type: 'EMPTY_SECTIONS',
      severity: 'HIGH',
      message: `${emptyAfterHeader.length} sections appear to be empty`,
    });
    analysis.stubScore += emptyAfterHeader.length * 5;
  }

  // Normalize stub score to 0-100
  analysis.stubScore = Math.min(100, analysis.stubScore);

  // Determine if this is a stub
  analysis.isStub = analysis.stubScore >= 30 ||
                    analysis.issues.some(i => i.severity === 'CRITICAL');

  return analysis;
}

/**
 * Get all agent files from a plugin
 * @param {string} pluginName - Plugin directory name
 * @returns {string[]} Array of agent file paths
 */
function getAgentFiles(pluginName) {
  const agentsDir = path.join(PLUGINS_DIR, pluginName, 'agents');
  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(agentsDir, f));
}

/**
 * Get all plugins
 * @returns {string[]} Array of plugin directory names
 */
function getPlugins() {
  return fs.readdirSync(PLUGINS_DIR)
    .filter(f => {
      const pluginPath = path.join(PLUGINS_DIR, f);
      return fs.statSync(pluginPath).isDirectory() &&
             fs.existsSync(path.join(pluginPath, 'agents'));
    });
}

/**
 * Generate fix suggestions for a stub agent
 * @param {Object} analysis - Analysis results
 * @returns {Object} Fix suggestions
 */
function generateFixSuggestions(analysis) {
  const suggestions = [];

  if (analysis.issues.some(i => i.type === 'NUMBERED_STUB_SECTIONS')) {
    suggestions.push({
      priority: 'CRITICAL',
      action: 'Replace numbered stub sections with actual content',
      details: `Remove lines like "### 0", "### 1", etc. and add proper section content:
        - Core Capabilities with specific functionality
        - Implementation examples with code
        - Error handling guidance
        - Integration patterns`,
      effort: 'HIGH',
    });
  }

  if (analysis.missingSections.length > 0) {
    suggestions.push({
      priority: 'HIGH',
      action: `Add missing sections: ${analysis.missingSections.join(', ')}`,
      details: 'Reference similar agents in salesforce-plugin for section templates',
      effort: 'MEDIUM',
    });
  }

  if (analysis.issues.some(i => i.type === 'INSUFFICIENT_CONTENT')) {
    suggestions.push({
      priority: 'HIGH',
      action: 'Expand agent documentation',
      details: `Add at least ${MIN_CONTENT_LINES - analysis.contentLines} more lines of content including:
        - Detailed capability descriptions
        - Code examples (3-5 minimum)
        - Best practices
        - Common error patterns`,
      effort: 'HIGH',
    });
  }

  return suggestions;
}

/**
 * Main execution
 */
async function main() {
  const results = {
    summary: {
      totalAgents: 0,
      stubAgents: 0,
      byPlugin: {},
    },
    stubAgents: [],
    allAnalysis: [],
  };

  // Determine which plugins to scan
  const plugins = options.plugin ? [options.plugin] : getPlugins();

  for (const plugin of plugins) {
    const agentFiles = getAgentFiles(plugin);
    results.summary.byPlugin[plugin] = {
      total: agentFiles.length,
      stubs: 0,
      stubRate: 0,
    };

    for (const agentFile of agentFiles) {
      const analysis = analyzeAgent(agentFile);
      results.summary.totalAgents++;
      results.allAnalysis.push(analysis);

      if (analysis.isStub) {
        results.summary.stubAgents++;
        results.summary.byPlugin[plugin].stubs++;

        if (options.fixReport) {
          analysis.fixSuggestions = generateFixSuggestions(analysis);
        }

        results.stubAgents.push(analysis);
      }
    }

    results.summary.byPlugin[plugin].stubRate =
      agentFiles.length > 0
        ? Math.round((results.summary.byPlugin[plugin].stubs / agentFiles.length) * 100)
        : 0;
  }

  // Sort stub agents by severity (stub score)
  results.stubAgents.sort((a, b) => b.stubScore - a.stubScore);

  // Output results
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printReport(results);
  }

  // Exit with error code if stubs found
  process.exit(results.stubAgents.length > 0 ? 1 : 0);
}

/**
 * Print human-readable report
 */
function printReport(results) {
  console.log('\n========================================');
  console.log('  STUB AGENT DETECTION REPORT');
  console.log('========================================\n');

  console.log(`Total agents scanned: ${results.summary.totalAgents}`);
  console.log(`Stub agents found: ${results.summary.stubAgents}`);
  console.log(`Overall stub rate: ${Math.round((results.summary.stubAgents / results.summary.totalAgents) * 100)}%\n`);

  console.log('By Plugin:');
  console.log('-'.repeat(50));
  for (const [plugin, stats] of Object.entries(results.summary.byPlugin)) {
    const status = stats.stubs > 0 ? '❌' : '✅';
    console.log(`  ${status} ${plugin}: ${stats.stubs}/${stats.total} stubs (${stats.stubRate}%)`);
  }

  if (results.stubAgents.length > 0) {
    console.log('\n========================================');
    console.log('  STUB AGENTS REQUIRING ATTENTION');
    console.log('========================================\n');

    for (const agent of results.stubAgents) {
      console.log(`\n📄 ${agent.fileName} (${agent.pluginName})`);
      console.log(`   Stub Score: ${agent.stubScore}/100`);
      console.log(`   Content Lines: ${agent.contentLines}`);

      if (agent.issues.length > 0) {
        console.log('   Issues:');
        for (const issue of agent.issues) {
          const icon = issue.severity === 'CRITICAL' ? '🔴' : '🟡';
          console.log(`     ${icon} [${issue.severity}] ${issue.message}`);
        }
      }

      if (agent.missingSections.length > 0) {
        console.log(`   Missing Sections: ${agent.missingSections.join(', ')}`);
      }

      if (options.fixReport && agent.fixSuggestions) {
        console.log('   Fix Suggestions:');
        for (const suggestion of agent.fixSuggestions) {
          console.log(`     📝 [${suggestion.priority}] ${suggestion.action}`);
          if (options.verbose) {
            console.log(`        ${suggestion.details}`);
          }
        }
      }
    }

    console.log('\n========================================');
    console.log('  RECOMMENDED ACTIONS');
    console.log('========================================\n');
    console.log('1. Fix CRITICAL issues first (numbered stub sections)');
    console.log('2. Add missing required sections');
    console.log('3. Expand content to meet minimum line requirements');
    console.log('4. Add code examples and best practices\n');
  } else {
    console.log('\n✅ No stub agents detected!\n');
  }
}

// Run
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
