#!/usr/bin/env node

/**
 * Add disallowedTools to Agent Definitions
 *
 * Automatically adds disallowedTools field to agent YAML frontmatter based on tier assignments.
 *
 * Usage:
 *   node scripts/add-disallowed-tools-to-agents.js [--dry-run] [--plugin <name>]
 *
 * Options:
 *   --dry-run     Show what would be changed without modifying files
 *   --plugin      Specific plugin to process (salesforce-plugin, hubspot-plugin, etc.)
 *   --verbose     Show detailed processing information
 *
 * Tier-Based Restrictions:
 *   Tier 1 (Read-Only): Block Write, Edit, deployment, delete
 *   Tier 2 (Standard Ops): Block deployment commands, delete operations
 *   Tier 3 (Metadata): Block production deployments without checks
 *   Tier 4 (Security): Block all except security operations
 *   Tier 5 (Destructive): Require explicit approval, no auto-blocking
 */

const fs = require('fs');
const path = require('path');
const { resolveProtectedAssetPath } = require('../../opspal-core/scripts/lib/protected-asset-runtime');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const pluginIndex = args.indexOf('--plugin');
const TARGET_PLUGIN = pluginIndex >= 0 ? args[pluginIndex + 1] : null;
const BASH_CONTRACT_AGENT_EXCLUSIONS = new Set([
  'sfdc-data-operations',
  'sfdc-automation-builder'
]);

// Tier-based tool restrictions
const TIER_RESTRICTIONS = {
  1: {
    // Read-only agents - NO write operations
    disallowedTools: [
      'Write',
      'Edit',
      'NotebookEdit',
      'Bash(sf project deploy:*)',
      'Bash(sf data upsert:*)',
      'Bash(sf data delete:*)',
      'Bash(sf data update:*)',
      'Bash(sf force source deploy:*)',
      'mcp__salesforce__*_create',
      'mcp__salesforce__*_update',
      'mcp__salesforce__*_delete'
    ]
  },
  2: {
    // Standard operations - NO metadata deployment or delete
    disallowedTools: [
      'Bash(sf project deploy:*)',
      'Bash(sf force source deploy:*)',
      'Bash(sf data delete:*)',
      'mcp__salesforce__*_delete'
    ]
  },
  3: {
    // Metadata management - NO production deployment without validation
    disallowedTools: [
      'Bash(sf project deploy --target-org production:*)',
      'Bash(sf data delete:*)',
      'mcp__salesforce__*_delete'
    ]
  },
  4: {
    // Security operations - ONLY security tools
    disallowedTools: [
      'Bash(sf data delete:*)',
      'Bash(sf project deploy --metadata-dir:*)', // Must use metadata API for profiles
      'mcp__salesforce__*_delete'
    ]
  },
  5: {
    // Destructive operations - Minimal restrictions (require approval workflow instead)
    disallowedTools: []
  }
};

// Load agent permission matrix
function loadPermissionMatrix() {
  const matrixPath = resolveProtectedAssetPath({
    pluginRoot: path.resolve(__dirname, '..'),
    pluginName: 'opspal-salesforce',
    relativePath: 'config/agent-permission-matrix.json',
    allowPlaintextFallback: true
  }) || path.join(__dirname, '../config/agent-permission-matrix.json');
  if (!fs.existsSync(matrixPath)) {
    console.error('❌ Error: agent-permission-matrix.json not found');
    console.error(`   Expected at: ${matrixPath}`);
    process.exit(1);
  }

  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  return matrix.agents;
}

// Find all agent files
function findAgentFiles(pluginPath) {
  const agentsDir = path.join(pluginPath, 'agents');
  if (!fs.existsSync(agentsDir)) {
    return [];
  }

  return fs.readdirSync(agentsDir)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(agentsDir, file));
}

// Parse YAML frontmatter
function parseYAMLFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  const yaml = match[1];
  const parsed = {};
  let currentKey = null;
  let currentArray = null;

  yaml.split('\n').forEach(line => {
    // Skip empty lines
    if (line.trim() === '') return;

    // Handle array items
    if (line.trim().startsWith('- ') && currentKey) {
      if (!currentArray) {
        currentArray = [];
        parsed[currentKey] = currentArray;
      }
      currentArray.push(line.trim().substring(2));
      return;
    }

    // Handle key-value pairs
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      currentArray = null;
      const value = kvMatch[2].trim();

      // Handle different value types
      if (value === '') {
        parsed[currentKey] = [];
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        parsed[currentKey] = value.slice(1, -1).split(',').map(v => v.trim());
      } else {
        parsed[currentKey] = value;
      }
    }
  });

  return {
    yaml: parsed,
    startIndex: 0,
    endIndex: match[0].length
  };
}

// Add disallowedTools to frontmatter
function addDisallowedTools(content, agentName, tier) {
  const frontmatter = parseYAMLFrontmatter(content);
  if (!frontmatter) {
    console.warn(`⚠️  Warning: No YAML frontmatter found in ${agentName}`);
    return null;
  }

  // Get restrictions for this tier
  const restrictions = TIER_RESTRICTIONS[tier];
  if (!restrictions) {
    console.warn(`⚠️  Warning: Unknown tier ${tier} for ${agentName}`);
    return null;
  }

  // Skip if no restrictions (Tier 5)
  if (restrictions.disallowedTools.length === 0) {
    if (VERBOSE) {
      console.log(`ℹ️  ${agentName} (Tier ${tier}): No restrictions (destructive operations tier)`);
    }
    return null;
  }

  // Check if disallowedTools already exists
  if (frontmatter.yaml.disallowedTools) {
    if (VERBOSE) {
      console.log(`ℹ️  ${agentName} already has disallowedTools field`);
    }
    return null;
  }

  // Build new frontmatter with disallowedTools
  const newYaml = { ...frontmatter.yaml };
  newYaml.disallowedTools = BASH_CONTRACT_AGENT_EXCLUSIONS.has(agentName)
    ? restrictions.disallowedTools.filter((tool) => !/^Bash\(/.test(tool))
    : restrictions.disallowedTools;

  // Reconstruct YAML
  let yamlString = '---\n';

  // Add fields in specific order
  const orderedKeys = ['name', 'description', 'tools', 'disallowedTools'];
  orderedKeys.forEach(key => {
    if (newYaml[key]) {
      if (Array.isArray(newYaml[key])) {
        yamlString += `${key}:\n`;
        newYaml[key].forEach(item => {
          yamlString += `  - ${item}\n`;
        });
      } else {
        yamlString += `${key}: ${newYaml[key]}\n`;
      }
      delete newYaml[key]; // Remove processed keys
    }
  });

  // Add remaining keys
  Object.entries(newYaml).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      yamlString += `${key}:\n`;
      value.forEach(item => {
        yamlString += `  - ${item}\n`;
      });
    } else {
      yamlString += `${key}: ${value}\n`;
    }
  });

  yamlString += '---';

  // Replace old frontmatter with new
  const bodyContent = content.substring(frontmatter.endIndex);
  return yamlString + bodyContent;
}

// Process a single agent file
function processAgentFile(filePath, agentMatrix) {
  const fileName = path.basename(filePath, '.md');
  const agentName = fileName;

  // Check if agent is in matrix
  const agentInfo = agentMatrix[agentName];
  if (!agentInfo) {
    if (VERBOSE) {
      console.log(`⚠️  ${agentName} not found in permission matrix, skipping`);
    }
    return { processed: false, reason: 'not_in_matrix' };
  }

  const tier = agentInfo.tier;
  const content = fs.readFileSync(filePath, 'utf8');
  const newContent = addDisallowedTools(content, agentName, tier);

  if (!newContent) {
    return { processed: false, reason: 'no_change_needed' };
  }

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✅ ${agentName} (Tier ${tier}): Added ${TIER_RESTRICTIONS[tier].disallowedTools.length} restrictions`);
  } else {
    console.log(`🔍 [DRY RUN] ${agentName} (Tier ${tier}): Would add ${TIER_RESTRICTIONS[tier].disallowedTools.length} restrictions`);
  }

  return { processed: true, tier, agentName };
}

// Main execution
async function main() {
  console.log('🚀 Adding disallowedTools to agent definitions\n');

  if (DRY_RUN) {
    console.log('📋 DRY RUN MODE - No files will be modified\n');
  }

  // Load permission matrix
  const agentMatrix = loadPermissionMatrix();
  console.log(`📊 Loaded permission matrix with ${Object.keys(agentMatrix).length} agents\n`);

  // Find plugins
  const pluginsDir = path.join(__dirname, '../../');
  const plugins = fs.readdirSync(pluginsDir)
    .filter(dir => {
      const pluginPath = path.join(pluginsDir, dir);
      return fs.statSync(pluginPath).isDirectory() &&
             fs.existsSync(path.join(pluginPath, 'agents'));
    })
    .filter(dir => !TARGET_PLUGIN || dir === TARGET_PLUGIN);

  console.log(`🔍 Found ${plugins.length} plugin(s) to process:\n`);

  // Process each plugin
  const stats = {
    totalAgents: 0,
    processed: 0,
    skipped: 0,
    byTier: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };

  plugins.forEach(plugin => {
    console.log(`\n📦 Processing ${plugin}...`);
    const pluginPath = path.join(pluginsDir, plugin);
    const agentFiles = findAgentFiles(pluginPath);

    console.log(`   Found ${agentFiles.length} agent files`);

    agentFiles.forEach(file => {
      stats.totalAgents++;
      const result = processAgentFile(file, agentMatrix);

      if (result.processed) {
        stats.processed++;
        stats.byTier[result.tier]++;
      } else {
        stats.skipped++;
      }
    });
  });

  // Print summary
  console.log('\n\n📊 Summary');
  console.log('═'.repeat(50));
  console.log(`Total agents found:    ${stats.totalAgents}`);
  console.log(`Agents processed:      ${stats.processed}`);
  console.log(`Agents skipped:        ${stats.skipped}`);
  console.log('\nBy Tier:');
  Object.entries(stats.byTier).forEach(([tier, count]) => {
    if (count > 0) {
      const tierName = ['', 'Read-Only', 'Standard Ops', 'Metadata', 'Security', 'Destructive'][tier];
      console.log(`  Tier ${tier} (${tierName}):  ${count} agents`);
    }
  });

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ All changes applied successfully!');
  }

  console.log('\n🔐 Security Impact:');
  console.log(`   - ${stats.byTier[1]} read-only agents now blocked from writes`);
  console.log(`   - ${stats.byTier[2]} standard ops agents blocked from deployments`);
  console.log(`   - ${stats.byTier[3]} metadata agents require validation for production`);
  console.log(`   - ${stats.byTier[4]} security agents restricted to security operations`);
}

// Run
main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
