#!/usr/bin/env node

/**
 * Add preferredModel hints to Salesforce plugin agents
 *
 * This script categorizes agents by optimal model type (Haiku vs Sonnet) and adds
 * the preferredModel field to their YAML frontmatter.
 *
 * Categorization Logic:
 * - Haiku: Read-only operations, simple CRUD, validation, analysis, queries
 * - Sonnet: Complex orchestration, planning, deployment, security, destructive operations
 *
 * Usage:
 *   node scripts/add-model-hints-to-agents.js [options]
 *
 * Options:
 *   --dry-run             Show what would be done without modifying files
 *   --verbose             Show detailed processing information
 *   --plugin <name>       Process only specified plugin (default: salesforce-plugin)
 *   --model <haiku|sonnet> Only process agents for specified model type
 *
 * Examples:
 *   node scripts/add-model-hints-to-agents.js --dry-run
 *   node scripts/add-model-hints-to-agents.js --verbose
 *   node scripts/add-model-hints-to-agents.js --model haiku --dry-run
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const PLUGIN_NAME = args.find(arg => arg.startsWith('--plugin='))?.split('=')[1] || 'salesforce-plugin';
const MODEL_FILTER = args.find(arg => arg.startsWith('--model='))?.split('=')[1] || null;

// Color codes for output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Model categorization rules
const MODEL_RULES = {
  haiku: {
    description: 'Fast, cost-effective for simple tasks',
    criteria: [
      'Read-only operations (Tier 1)',
      'Simple CRUD operations (Tier 2)',
      'Validation and analysis',
      'Query optimization',
      'Report generation',
      'Diagnostics and auditing'
    ]
  },
  sonnet: {
    description: 'Powerful, needed for complex tasks',
    criteria: [
      'Complex orchestration (Tier 3)',
      'Planning and decision-making',
      'Metadata deployments',
      'Security operations (Tier 4)',
      'Destructive operations (Tier 5)',
      'Multi-step workflows',
      'Conflict resolution',
      'Merge operations'
    ]
  }
};

// Agent categorization by model type
const AGENT_MODEL_MAPPING = {
  // === HAIKU AGENTS (Fast, Read-Only, Simple Operations) ===
  haiku: [
    // Tier 1: Read-Only Agents (17 agents)
    'response-validator',
    'sfdc-state-discovery',
    'sfdc-automation-auditor',
    'sfdc-cpq-assessor',
    'sfdc-dashboard-analyzer',
    'sfdc-dependency-analyzer',
    'sfdc-discovery',
    'sfdc-field-analyzer',
    'sfdc-layout-analyzer',
    'sfdc-metadata-analyzer',
    'sfdc-object-auditor',
    'sfdc-performance-optimizer',
    'sfdc-permission-assessor',
    'sfdc-quality-auditor',
    'sfdc-reports-usage-auditor',
    'sfdc-revops-auditor',
    'sfdc-planner', // Planning is analysis, not execution

    // Tier 2: Simple Operations (15 agents)
    'sfdc-advocate-assignment',
    'sfdc-csv-enrichment',
    'sfdc-dashboard-designer',
    'sfdc-dashboard-optimizer',
    'sfdc-data-generator',
    'sfdc-data-operations',
    'sfdc-layout-generator',
    'sfdc-lucid-diagrams',
    'sfdc-renewal-import',
    'sfdc-report-designer',
    'sfdc-reports-dashboards',
    'sfdc-report-template-deployer',
    'sfdc-report-type-manager',
    'sfdc-report-validator',
    'sfdc-query-specialist'
  ],

  // === SONNET AGENTS (Complex, Orchestration, Security) ===
  sonnet: [
    // Tier 3: Metadata Management (22 agents)
    'sfdc-apex',
    'sfdc-apex-developer',
    'sfdc-automation-builder',
    'sfdc-cli-executor',
    'sfdc-conflict-resolver',
    'sfdc-cpq-specialist',
    'sfdc-dashboard-migrator',
    'sfdc-deployment-manager',
    'sfdc-einstein-admin',
    'sfdc-integration-specialist',
    'sfdc-lightning-developer',
    'sfdc-metadata',
    'sfdc-metadata-manager',
    'sfdc-orchestrator', // Master orchestrator
    'sfdc-remediation-executor',
    'sfdc-revops-coordinator',
    'sfdc-sales-operations',
    'sfdc-service-cloud-admin',
    'sfdc-ui-customizer',
    'sfdc-merge-orchestrator', // Complex merge logic

    // Tier 4: Security & Permissions (5 agents)
    'sfdc-agent-governance',
    'sfdc-communication-manager',
    'sfdc-compliance-officer',
    'sfdc-permission-orchestrator',
    'sfdc-security-admin',

    // Tier 5: Destructive Operations (1 agent)
    'sfdc-dedup-safety-copilot'
  ]
};

// Helper function to log with color
function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

// Helper function to log section headers
function logSection(title) {
  const line = '═'.repeat(50);
  log(`\n${line}`, 'bright');
  log(title, 'bright');
  log(line, 'bright');
}

// Helper function to parse YAML frontmatter
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: content };
  }

  const [, frontmatterText, body] = match;
  const frontmatter = {};

  // Parse YAML line by line
  const lines = frontmatterText.split('\n');
  let currentKey = null;
  let currentValue = [];

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') continue;

    // Check if this is a key-value line
    const keyValueMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyValueMatch) {
      // Save previous key if exists
      if (currentKey) {
        frontmatter[currentKey] = currentValue.length > 1 ? currentValue : currentValue[0] || '';
      }

      // Start new key
      currentKey = keyValueMatch[1];
      currentValue = keyValueMatch[2] ? [keyValueMatch[2]] : [];
    } else if (currentKey && line.trim().startsWith('-')) {
      // This is an array item
      currentValue.push(line.trim().substring(1).trim());
    } else if (currentKey) {
      // This is a continuation of the previous value
      currentValue.push(line.trim());
    }
  }

  // Save last key
  if (currentKey) {
    frontmatter[currentKey] = currentValue.length > 1 ? currentValue : currentValue[0] || '';
  }

  return { frontmatter, body };
}

// Helper function to stringify frontmatter back to YAML
function stringifyFrontmatter(frontmatter, body) {
  let yaml = '---\n';

  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      yaml += `${key}:\n`;
      for (const item of value) {
        yaml += `  - ${item}\n`;
      }
    } else {
      yaml += `${key}: ${value}\n`;
    }
  }

  yaml += '---\n';
  yaml += body;

  return yaml;
}

// Determine optimal model for an agent
function determineModel(agentName) {
  if (AGENT_MODEL_MAPPING.haiku.includes(agentName)) {
    return 'haiku';
  } else if (AGENT_MODEL_MAPPING.sonnet.includes(agentName)) {
    return 'sonnet';
  }
  return null; // Unknown agent
}

// Process a single agent file
function processAgentFile(filePath, stats) {
  const agentName = path.basename(filePath, '.md');
  const model = determineModel(agentName);

  // Skip if model is unknown
  if (!model) {
    if (VERBOSE) {
      log(`  ⚠️  Skipped ${agentName} (not in model mapping)`, 'yellow');
    }
    stats.skipped++;
    return;
  }

  // Skip if filtering by model and this doesn't match
  if (MODEL_FILTER && model !== MODEL_FILTER) {
    if (VERBOSE) {
      log(`  ⏭️  Skipped ${agentName} (model filter: ${MODEL_FILTER})`, 'cyan');
    }
    stats.filtered++;
    return;
  }

  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter) {
    log(`  ❌ Failed to parse frontmatter: ${agentName}`, 'red');
    stats.errors.push({ agent: agentName, error: 'No frontmatter found' });
    return;
  }

  // Check if preferredModel already exists
  if (frontmatter.preferredModel || frontmatter.model) {
    if (VERBOSE) {
      const existingModel = frontmatter.preferredModel || frontmatter.model;
      if (existingModel === model) {
        log(`  ✓ ${agentName} already has correct model (${model})`, 'green');
      } else {
        log(`  ⚠️  ${agentName} has different model (${existingModel} vs recommended ${model})`, 'yellow');
      }
    }
    stats.alreadySet++;
    return;
  }

  // Add preferredModel field
  frontmatter.preferredModel = model;

  // Reconstruct file content
  const newContent = stringifyFrontmatter(frontmatter, body);

  if (DRY_RUN) {
    log(`  [DRY RUN] Would add preferredModel: ${model} to ${agentName}`, 'cyan');
    stats.dryRun++;
  } else {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    log(`  ✅ Added preferredModel: ${model} to ${agentName}`, 'green');
    stats.updated++;
  }

  // Update model counts
  if (model === 'haiku') {
    stats.haikuCount++;
  } else if (model === 'sonnet') {
    stats.sonnetCount++;
  }
}

// Main execution
function main() {
  logSection(`🎯 Adding Model Hints to Agents`);

  if (DRY_RUN) {
    log('⚠️  DRY RUN MODE - No files will be modified', 'yellow');
  }

  if (MODEL_FILTER) {
    log(`📋 Model Filter: ${MODEL_FILTER}`, 'blue');
  }

  // Display model rules
  log('\n📚 Model Selection Rules:', 'blue');
  log('  Haiku: ' + MODEL_RULES.haiku.description, 'cyan');
  MODEL_RULES.haiku.criteria.forEach(c => log(`    • ${c}`, 'cyan'));
  log('  Sonnet: ' + MODEL_RULES.sonnet.description, 'magenta');
  MODEL_RULES.sonnet.criteria.forEach(c => log(`    • ${c}`, 'magenta'));

  // Find plugin root
  const pluginRoot = path.join(__dirname, '..');
  const agentsDir = path.join(pluginRoot, 'agents');

  if (!fs.existsSync(agentsDir)) {
    log(`\n❌ Agents directory not found: ${agentsDir}`, 'red');
    process.exit(1);
  }

  // Find all agent files
  const agentFiles = fs.readdirSync(agentsDir)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(agentsDir, file));

  log(`\n📂 Found ${agentFiles.length} agent files in ${PLUGIN_NAME}`, 'blue');

  // Process statistics
  const stats = {
    total: agentFiles.length,
    updated: 0,
    alreadySet: 0,
    skipped: 0,
    filtered: 0,
    dryRun: 0,
    haikuCount: 0,
    sonnetCount: 0,
    errors: []
  };

  logSection('Processing Agents');

  // Process each agent file
  for (const filePath of agentFiles) {
    processAgentFile(filePath, stats);
  }

  // Display summary
  logSection('📊 Summary');

  log(`Total agents found:    ${stats.total}`, 'blue');

  if (DRY_RUN) {
    log(`Would update:          ${stats.dryRun}`, 'cyan');
  } else {
    log(`Agents updated:        ${stats.updated}`, 'green');
  }

  log(`Already set:           ${stats.alreadySet}`, 'yellow');
  log(`Skipped (not mapped):  ${stats.skipped}`, 'yellow');

  if (MODEL_FILTER) {
    log(`Filtered (model):      ${stats.filtered}`, 'cyan');
  }

  if (stats.errors.length > 0) {
    log(`Errors:                ${stats.errors.length}`, 'red');
    stats.errors.forEach(({ agent, error }) => {
      log(`  ❌ ${agent}: ${error}`, 'red');
    });
  }

  log('\n📈 Model Distribution:', 'blue');
  log(`  Haiku agents:  ${stats.haikuCount} (${Math.round(stats.haikuCount / stats.total * 100)}%)`, 'cyan');
  log(`  Sonnet agents: ${stats.sonnetCount} (${Math.round(stats.sonnetCount / stats.total * 100)}%)`, 'magenta');

  // Cost impact estimate
  const haikuSavings = stats.haikuCount * 0.6; // 60% avg cost savings per agent
  const totalSavings = Math.round(haikuSavings / (stats.haikuCount + stats.sonnetCount) * 100);

  logSection('💰 Cost Impact');
  log(`Estimated cost savings: ${totalSavings}% overall`, 'green');
  log(`  • ${stats.haikuCount} agents using cost-effective Haiku`, 'cyan');
  log(`  • ${stats.sonnetCount} agents using powerful Sonnet for complex tasks`, 'magenta');
  log(`  • Average 60% cost reduction per Haiku agent`, 'green');

  if (DRY_RUN) {
    logSection('💡 Next Steps');
    log('Run without --dry-run to apply changes:', 'yellow');
    log(`  node scripts/add-model-hints-to-agents.js`, 'cyan');
  } else {
    logSection('✅ Complete');
    log('Model hints have been added to agent definitions', 'green');
    log('Agents will now use optimal models for their tasks', 'green');
  }

  log(''); // Empty line for spacing
}

// Run the script
main();
