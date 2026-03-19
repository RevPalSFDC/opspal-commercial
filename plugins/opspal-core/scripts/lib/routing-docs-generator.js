#!/usr/bin/env node

/**
 * Routing Documentation Generator (P2-1)
 *
 * Generates routing documentation from the canonical routing-patterns.json registry.
 * Ensures CLAUDE.md and docs/routing-help.md stay in sync with the single source of truth.
 *
 * Usage:
 *   node routing-docs-generator.js generate           # Generate all docs
 *   node routing-docs-generator.js check              # Check if docs are current
 *   node routing-docs-generator.js diff               # Show differences
 *   node routing-docs-generator.js --target claude-md # Generate specific doc
 *
 * @copyright 2024-2026 RevPal Partners, LLC
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// =============================================================================
// Configuration
// =============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const REGISTRY_PATH = path.resolve(__dirname, '../../config/routing-patterns.json');
const CLAUDE_MD_PATH = path.join(PROJECT_ROOT, 'CLAUDE.md');
const ROUTING_HELP_PATH = path.join(PROJECT_ROOT, 'docs/routing-help.md');

// Markers for generated sections
const MARKERS = {
  routingTableStart: '<!-- ROUTING_TABLE_START -->',
  routingTableEnd: '<!-- ROUTING_TABLE_END -->',
  blockedOpsStart: '<!-- BLOCKED_OPS_START -->',
  blockedOpsEnd: '<!-- BLOCKED_OPS_END -->',
  generatedStart: '<!-- GENERATED_ROUTING_START -->',
  generatedEnd: '<!-- GENERATED_ROUTING_END -->'
};

// =============================================================================
// Registry Loading
// =============================================================================

/**
 * Loads the canonical routing registry
 * @returns {Object|null} Registry or null if not found
 */
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
  } catch (e) {
    console.error(`Failed to load registry: ${e.message}`);
  }
  return null;
}

/**
 * Computes a hash of the registry for change detection
 * @param {Object} registry - The routing registry
 * @returns {string} SHA256 hash
 */
function computeRegistryHash(registry) {
  const content = JSON.stringify(registry, null, 0);
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
}

// =============================================================================
// Routing Table Generation
// =============================================================================

/**
 * Generates the routing table for CLAUDE.md
 * @param {Object} registry - The routing registry
 * @returns {string} Markdown table
 */
function generateRoutingTable(registry) {
  const lines = [];

  lines.push('| If user mentions... | Specialist | You MUST invoke... |');
  lines.push('|---------------------|------------|-------------------|');

  // Process all platform patterns
  const allPatterns = [];

  for (const [platform, data] of Object.entries(registry.platformPatterns || {})) {
    for (const pattern of data.patterns || []) {
      if (pattern.keywords && pattern.agent) {
        allPatterns.push({
          keywords: pattern.keywords.slice(0, 3).join(', '),
          agent: pattern.agent,
          blocking: pattern.blocking
        });
      }
    }
  }

  // Add exclusive keywords
  if (registry.exclusiveKeywords?.mappings) {
    for (const [keyword, agent] of Object.entries(registry.exclusiveKeywords.mappings)) {
      // Check if already covered
      const exists = allPatterns.some(p => p.agent === agent);
      if (!exists) {
        allPatterns.push({
          keywords: keyword,
          agent,
          blocking: true
        });
      }
    }
  }

  // Sort by blocking status (blocking first) then alphabetically
  allPatterns.sort((a, b) => {
    if (a.blocking !== b.blocking) return b.blocking ? 1 : -1;
    return a.keywords.localeCompare(b.keywords);
  });

  // Generate rows
  for (const pattern of allPatterns) {
    const invoke = `\`Agent(subagent_type='${pattern.agent}', prompt=...)\``;
    lines.push(`| ${pattern.keywords} | ${pattern.agent.split(':').pop()} | ${invoke} |`);
  }

  return lines.join('\n');
}

/**
 * Generates the blocked operations list
 * @param {Object} registry - The routing registry
 * @returns {string} Markdown list
 */
function generateBlockedOperations(registry) {
  const lines = [];

  // Get all blocking patterns
  const blockingPatterns = [];

  for (const [platform, data] of Object.entries(registry.platformPatterns || {})) {
    for (const pattern of data.patterns || []) {
      if (pattern.blocking) {
        blockingPatterns.push({
          id: pattern.id,
          agent: pattern.agent,
          keywords: pattern.keywords || []
        });
      }
    }
  }

  // Add mandatory patterns (note: mandatoryPatterns is an object with .patterns array)
  for (const pattern of registry.mandatoryPatterns?.patterns || []) {
    blockingPatterns.push({
      id: pattern.id || 'mandatory',
      agent: pattern.agent,
      keywords: pattern.keywords || [pattern.pattern]
    });
  }

  // Generate list items
  for (const pattern of blockingPatterns) {
    const agentName = pattern.agent;
    const keywords = pattern.keywords.slice(0, 2).join('/');
    lines.push(`- ❌ **${keywords}** → \`Agent(subagent_type='${agentName}', prompt='...')\``);
  }

  return lines.join('\n');
}

/**
 * Generates the full routing help document
 * @param {Object} registry - The routing registry
 * @returns {string} Full markdown document
 */
function generateRoutingHelpDoc(registry) {
  const hash = computeRegistryHash(registry);
  const timestamp = new Date().toISOString().split('T')[0];

  const lines = [];

  lines.push('# Routing Help - Agent Selection Guide');
  lines.push('');
  lines.push(`> Generated from \`routing-patterns.json\` v${registry.version || '1.0.0'}`);
  lines.push(`> Last updated: ${timestamp} | Hash: ${hash}`);
  lines.push('');
  lines.push('This document is auto-generated from the canonical routing registry.');
  lines.push('Do not edit directly - modify `plugins/opspal-core/config/routing-patterns.json` instead.');
  lines.push('');

  // Overview section
  lines.push('## Overview');
  lines.push('');
  lines.push('The routing system automatically directs tasks to specialized agents based on keywords.');
  lines.push('When a keyword match is found, the corresponding agent should be invoked via the Agent tool.');
  lines.push('');

  // Exclusive keywords
  if (registry.exclusiveKeywords?.mappings) {
    lines.push('## Exclusive Keywords');
    lines.push('');
    lines.push('These keywords must route to exactly one agent:');
    lines.push('');
    lines.push('| Keyword | Exclusive Agent |');
    lines.push('|---------|-----------------|');

    for (const [keyword, agent] of Object.entries(registry.exclusiveKeywords.mappings)) {
      lines.push(`| \`${keyword}\` | \`${agent}\` |`);
    }
    lines.push('');
  }

  // Platform sections
  for (const [platform, data] of Object.entries(registry.platformPatterns || {})) {
    lines.push(`## ${platform.charAt(0).toUpperCase() + platform.slice(1)} Patterns`);
    lines.push('');

    if (data.description) {
      lines.push(data.description);
      lines.push('');
    }

    lines.push('| Pattern ID | Keywords | Agent | Blocking |');
    lines.push('|------------|----------|-------|----------|');

    for (const pattern of data.patterns || []) {
      const keywords = (pattern.keywords || []).slice(0, 3).join(', ');
      const blocking = pattern.blocking ? '🔴 Yes' : '🟢 No';
      lines.push(`| ${pattern.id} | ${keywords} | \`${pattern.agent}\` | ${blocking} |`);
    }
    lines.push('');
  }

  // Mandatory patterns (note: mandatoryPatterns is an object with .patterns array)
  if (registry.mandatoryPatterns?.patterns?.length > 0) {
    lines.push('## Mandatory Patterns');
    lines.push('');
    lines.push('These patterns MUST be routed to their designated agent:');
    lines.push('');
    lines.push('| Pattern | Keywords | Agent | Reason |');
    lines.push('|---------|----------|-------|--------|');

    for (const pattern of registry.mandatoryPatterns.patterns) {
      const keywords = (pattern.keywords || []).slice(0, 2).join(', ');
      lines.push(`| \`${pattern.id}\` | ${keywords} | \`${pattern.agent}\` | ${pattern.reason || 'Required'} |`);
    }
    lines.push('');
  }

  // Blocking thresholds
  if (registry.blockingThresholds) {
    lines.push('## Blocking Thresholds');
    lines.push('');
    lines.push('| Level | Complexity | Action |');
    lines.push('|-------|------------|--------|');
    lines.push(`| Mandatory | ${registry.blockingThresholds.mandatory || 1.0} | **Must use agent** - No exceptions |`);
    lines.push(`| High | ${registry.blockingThresholds.high || 0.7} | Strongly recommended - Agent blocking enabled |`);
    lines.push(`| Recommended | ${registry.blockingThresholds.recommended || 0.5} | Agent suggested - Optional |`);
    lines.push(`| Available | ${registry.blockingThresholds.available || 0.0} | Agent available if needed |`);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('## Regenerating This Document');
  lines.push('');
  lines.push('```bash');
  lines.push('node plugins/opspal-core/scripts/lib/routing-docs-generator.js generate');
  lines.push('```');
  lines.push('');
  lines.push(`*Registry version: ${registry.version || 'unversioned'}*`);

  return lines.join('\n');
}

// =============================================================================
// Document Updates
// =============================================================================

/**
 * Updates a section in a markdown file between markers
 * @param {string} content - File content
 * @param {string} startMarker - Start marker
 * @param {string} endMarker - End marker
 * @param {string} newContent - New content to insert
 * @returns {string} Updated content
 */
function updateSection(content, startMarker, endMarker, newContent) {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    // Markers not found, return original
    return content;
  }

  const before = content.substring(0, startIdx + startMarker.length);
  const after = content.substring(endIdx);

  return `${before}\n${newContent}\n${after}`;
}

/**
 * Checks if a file needs updating
 * @param {string} filePath - Path to file
 * @param {string} marker - Marker to look for
 * @param {Object} registry - Current registry
 * @returns {boolean} True if needs update
 */
function needsUpdate(filePath, registry) {
  if (!fs.existsSync(filePath)) {
    return true;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const currentHash = computeRegistryHash(registry);

  // Check if hash is embedded in file
  const hashMatch = content.match(/Hash: ([a-f0-9]+)/);
  if (hashMatch) {
    return hashMatch[1] !== currentHash;
  }

  return true; // No hash found, assume needs update
}

// =============================================================================
// Main Generation Logic
// =============================================================================

/**
 * Generates all routing documentation
 * @param {Object} options - Generation options
 * @returns {Object} Generation results
 */
function generateAll(options = {}) {
  const { dryRun = false, verbose = false } = options;

  const registry = loadRegistry();
  if (!registry) {
    return { success: false, error: 'Could not load routing registry' };
  }

  const results = {
    success: true,
    registry: {
      version: registry.version,
      hash: computeRegistryHash(registry)
    },
    files: []
  };

  // Generate routing-help.md
  const routingHelpContent = generateRoutingHelpDoc(registry);

  if (dryRun) {
    results.files.push({
      path: ROUTING_HELP_PATH,
      action: 'would generate',
      lines: routingHelpContent.split('\n').length
    });
  } else {
    try {
      const dir = path.dirname(ROUTING_HELP_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(ROUTING_HELP_PATH, routingHelpContent);
      results.files.push({
        path: ROUTING_HELP_PATH,
        action: 'generated',
        lines: routingHelpContent.split('\n').length
      });
      if (verbose) {
        console.log(`✅ Generated: ${ROUTING_HELP_PATH}`);
      }
    } catch (e) {
      results.files.push({
        path: ROUTING_HELP_PATH,
        action: 'failed',
        error: e.message
      });
      results.success = false;
    }
  }

  // Note: CLAUDE.md update would require markers to be added first
  // For now, just report what would be updated
  const routingTable = generateRoutingTable(registry);
  const blockedOps = generateBlockedOperations(registry);

  results.generatedContent = {
    routingTable: routingTable.split('\n').length + ' lines',
    blockedOperations: blockedOps.split('\n').length + ' lines'
  };

  if (verbose) {
    console.log(`\nGenerated content summary:`);
    console.log(`  Routing table: ${results.generatedContent.routingTable}`);
    console.log(`  Blocked operations: ${results.generatedContent.blockedOperations}`);
  }

  return results;
}

/**
 * Checks if documentation is current
 * @returns {Object} Check results
 */
function checkDocumentation() {
  const registry = loadRegistry();
  if (!registry) {
    return { success: false, error: 'Could not load routing registry' };
  }

  const results = {
    registryVersion: registry.version,
    registryHash: computeRegistryHash(registry),
    files: []
  };

  // Check routing-help.md
  const routingHelpCurrent = !needsUpdate(ROUTING_HELP_PATH, registry);
  results.files.push({
    path: ROUTING_HELP_PATH,
    exists: fs.existsSync(ROUTING_HELP_PATH),
    current: routingHelpCurrent
  });

  results.allCurrent = results.files.every(f => f.current);

  return results;
}

// =============================================================================
// CLI Interface
// =============================================================================

function printHelp() {
  console.log(`
Routing Documentation Generator - Generate docs from routing registry

Usage:
  node routing-docs-generator.js <command> [options]

Commands:
  generate          Generate all routing documentation
  check             Check if documentation is current
  diff              Show differences (not yet implemented)
  routing-table     Output routing table only
  blocked-ops       Output blocked operations only

Options:
  --dry-run         Show what would be generated without writing
  --verbose         Show detailed output
  --target <file>   Generate specific file only

Examples:
  node routing-docs-generator.js generate
  node routing-docs-generator.js generate --dry-run
  node routing-docs-generator.js check
  node routing-docs-generator.js routing-table
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const isDryRun = args.includes('--dry-run');
  const isVerbose = args.includes('--verbose');
  const isJson = args.includes('--json');

  switch (command) {
    case 'generate': {
      console.log('Generating routing documentation...\n');
      const results = generateAll({ dryRun: isDryRun, verbose: isVerbose });

      if (isJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        if (results.success) {
          console.log(`\n✅ Generation complete`);
          console.log(`   Registry: v${results.registry.version} (${results.registry.hash})`);
          for (const file of results.files) {
            console.log(`   ${file.action}: ${path.basename(file.path)} (${file.lines} lines)`);
          }
        } else {
          console.log(`\n❌ Generation failed: ${results.error}`);
          process.exit(1);
        }
      }
      break;
    }

    case 'check': {
      console.log('Checking documentation status...\n');
      const results = checkDocumentation();

      if (isJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`Registry: v${results.registryVersion} (${results.registryHash})`);
        console.log('');
        for (const file of results.files) {
          const status = file.current ? '✅ Current' : '⚠️  Needs update';
          const exists = file.exists ? '' : ' (missing)';
          console.log(`  ${status}: ${path.basename(file.path)}${exists}`);
        }
        console.log('');
        if (results.allCurrent) {
          console.log('All documentation is current.');
        } else {
          console.log('Run `node routing-docs-generator.js generate` to update.');
          process.exit(1);
        }
      }
      break;
    }

    case 'routing-table': {
      const registry = loadRegistry();
      if (!registry) {
        console.error('Could not load registry');
        process.exit(1);
      }
      console.log(generateRoutingTable(registry));
      break;
    }

    case 'blocked-ops': {
      const registry = loadRegistry();
      if (!registry) {
        console.error('Could not load registry');
        process.exit(1);
      }
      console.log(generateBlockedOperations(registry));
      break;
    }

    case '--help':
    case 'help':
      printHelp();
      break;

    default:
      printHelp();
      process.exit(1);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  loadRegistry,
  computeRegistryHash,
  generateRoutingTable,
  generateBlockedOperations,
  generateRoutingHelpDoc,
  generateAll,
  checkDocumentation,
  needsUpdate
};

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(2);
  });
}
