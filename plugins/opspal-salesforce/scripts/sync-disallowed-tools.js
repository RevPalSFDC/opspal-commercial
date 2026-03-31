#!/usr/bin/env node

/**
 * Sync disallowedTools to tools field
 *
 * Claude Code enforces both `tools` and `disallowedTools`.
 * Patterned `disallowedTools` entries such as `Bash(sf ...)` are runtime-active
 * deny rules, not documentation. For Bash-critical agents, those patterns can
 * shadow the entire Bash tool from delegated subagent context.
 *
 * This script keeps the explicit `tools` allowlist aligned with concrete
 * disallowed tool names. It must not be used to justify patterned Bash denies
 * on Bash-contract agents.
 *
 * Usage:
 *   node scripts/sync-disallowed-tools.js [--dry-run] [--plugin <name>]
 */

const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const pluginIndex = args.indexOf('--plugin');
const TARGET_PLUGIN = pluginIndex >= 0 ? args[pluginIndex + 1] : null;

// All available tools (complete list)
const ALL_TOOLS = [
  'Read', 'Write', 'Edit', 'NotebookEdit',
  'Bash', 'BashOutput', 'KillShell',
  'Glob', 'Grep', 'TodoWrite',
  'Task', 'Skill', 'SlashCommand',
  'WebFetch', 'WebSearch',
  'AskUserQuestion', 'ExitPlanMode',
  'ListMcpResourcesTool', 'ReadMcpResourceTool'
];

// Find all agent files
function findAgentFiles(pluginPath) {
  const agentsDir = path.join(pluginPath, 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  return fs.readdirSync(agentsDir)
    .filter(file => file.endsWith('.md') && !file.includes('_backup'))
    .map(file => path.join(agentsDir, file));
}

// Parse YAML frontmatter
function parseYAMLFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const parsed = {};
  let currentKey = null;
  let currentArray = null;

  yaml.split('\n').forEach(line => {
    if (line.trim() === '') return;

    // Handle array items
    if (line.trim().startsWith('- ') && currentKey) {
      if (!currentArray) {
        currentArray = [];
        parsed[currentKey] = currentArray;
      }
      currentArray.push(line.trim().substring(2).trim());
      return;
    }

    // Handle key-value pairs
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      currentArray = null;
      const value = kvMatch[2].trim();

      if (value === '') {
        parsed[currentKey] = [];
      } else {
        parsed[currentKey] = value;
      }
    }
  });

  return {
    yaml: parsed,
    endIndex: match[0].length
  };
}

// Check if tool matches pattern
function toolMatchesPattern(tool, pattern) {
  if (pattern.includes('*')) {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(tool);
  }
  return tool === pattern;
}

// Sync disallowedTools to tools field
function syncAgent(filePath) {
  const fileName = path.basename(filePath, '.md');
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseYAMLFrontmatter(content);

  if (!frontmatter) {
    if (VERBOSE) console.log(`⚠️  ${fileName}: No frontmatter found`);
    return { processed: false, reason: 'no_frontmatter' };
  }

  // Get disallowedTools
  const disallowedTools = frontmatter.yaml.disallowedTools;
  if (!disallowedTools || disallowedTools.length === 0) {
    if (VERBOSE) console.log(`ℹ️  ${fileName}: No disallowedTools defined`);
    return { processed: false, reason: 'no_disallowed_tools' };
  }

  // Get current tools
  let currentTools = frontmatter.yaml.tools || '';
  if (typeof currentTools === 'string') {
    currentTools = currentTools.split(',').map(t => t.trim()).filter(t => t);
  }

  // Filter out disallowed tools
  const allowedTools = currentTools.filter(tool => {
    // Check if tool matches any disallowed pattern
    for (const disallowed of disallowedTools) {
      if (toolMatchesPattern(tool, disallowed)) {
        if (VERBOSE) {
          console.log(`  🚫 ${fileName}: Removing '${tool}' (matches pattern '${disallowed}')`);
        }
        return false; // Tool is disallowed
      }
    }
    return true; // Tool is allowed
  });

  // Check if anything changed
  if (allowedTools.length === currentTools.length) {
    if (VERBOSE) console.log(`ℹ️  ${fileName}: No conflicts found (tools already clean)`);
    return { processed: false, reason: 'no_conflicts' };
  }

  const removedCount = currentTools.length - allowedTools.length;

  if (!DRY_RUN) {
    // Rebuild YAML with updated tools
    const newYaml = { ...frontmatter.yaml };
    newYaml.tools = allowedTools.join(', ');

    // Reconstruct frontmatter
    let yamlString = '---\n';
    const orderedKeys = ['name', 'description', 'tools', 'disallowedTools', 'model'];

    orderedKeys.forEach(key => {
      if (newYaml[key] !== undefined) {
        if (Array.isArray(newYaml[key])) {
          yamlString += `${key}:\n`;
          newYaml[key].forEach(item => {
            yamlString += `  - ${item}\n`;
          });
        } else {
          yamlString += `${key}: ${newYaml[key]}\n`;
        }
        delete newYaml[key];
      }
    });

    // Add remaining keys
    Object.entries(newYaml).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        yamlString += `${key}:\n`;
        value.forEach(item => yamlString += `  - ${item}\n`);
      } else {
        yamlString += `${key}: ${value}\n`;
      }
    });

    yamlString += '---';

    // Replace frontmatter
    const bodyContent = content.substring(frontmatter.endIndex);
    const newContent = yamlString + bodyContent;

    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✅ ${fileName}: Removed ${removedCount} conflicting tool(s) from allowlist`);
  } else {
    console.log(`🔍 [DRY RUN] ${fileName}: Would remove ${removedCount} conflicting tool(s)`);
    if (VERBOSE) {
      const removed = currentTools.filter(t => !allowedTools.includes(t));
      removed.forEach(tool => console.log(`    - ${tool}`));
    }
  }

  return { processed: true, removedCount, agentName: fileName };
}

// Main
async function main() {
  console.log('🔄 Syncing disallowedTools to tools field\n');

  if (DRY_RUN) {
    console.log('📋 DRY RUN MODE - No files will be modified\n');
  }

  // Find plugins
  const pluginsDir = path.join(__dirname, '../../');
  const plugins = fs.readdirSync(pluginsDir)
    .filter(dir => {
      const pluginPath = path.join(pluginsDir, dir);
      return fs.statSync(pluginPath).isDirectory() &&
             fs.existsSync(path.join(pluginPath, 'agents'));
    })
    .filter(dir => !TARGET_PLUGIN || dir === TARGET_PLUGIN);

  console.log(`🔍 Found ${plugins.length} plugin(s) to process\n`);

  const stats = {
    totalAgents: 0,
    processed: 0,
    skipped: 0,
    totalRemoved: 0
  };

  plugins.forEach(plugin => {
    console.log(`\n📦 Processing ${plugin}...`);
    const pluginPath = path.join(pluginsDir, plugin);
    const agentFiles = findAgentFiles(pluginPath);

    console.log(`   Found ${agentFiles.length} agent files`);

    agentFiles.forEach(file => {
      stats.totalAgents++;
      const result = syncAgent(file);

      if (result.processed) {
        stats.processed++;
        stats.totalRemoved += result.removedCount;
      } else {
        stats.skipped++;
      }
    });
  });

  // Summary
  console.log('\n\n📊 Summary');
  console.log('═'.repeat(50));
  console.log(`Total agents found:    ${stats.totalAgents}`);
  console.log(`Agents processed:      ${stats.processed}`);
  console.log(`Agents skipped:        ${stats.skipped}`);
  console.log(`Tools removed:         ${stats.totalRemoved}`);

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ All changes applied successfully!');
  }

  console.log('\n🔐 Security Impact:');
  console.log(`   - ${stats.processed} agents now have consistent tool restrictions`);
  console.log(`   - ${stats.totalRemoved} conflicting tools removed from allowlists`);
  console.log(`   - disallowedTools field is now documentation-only`);
  console.log(`   - tools field provides actual enforcement`);
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
