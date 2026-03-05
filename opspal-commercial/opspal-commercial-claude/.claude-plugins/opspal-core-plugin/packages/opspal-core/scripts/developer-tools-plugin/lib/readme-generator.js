/**
 * readme-generator.js
 *
 * Generates comprehensive README.md files for plugins by extracting metadata
 * from plugin.json, agents, scripts, and commands.
 *
 * @module readme-generator
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse YAML frontmatter from agent file
 * @param {string} content - File content
 * @returns {object|null} Parsed frontmatter or null if not found
 */
function parseAgentFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  const frontmatter = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (key && value) {
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

/**
 * Extract example from agent content
 * @param {string} content - File content
 * @returns {string|null} Example content or null
 */
function extractAgentExample(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  // Look for example section in various formats
  const examplePatterns = [
    /##\s*Example[s]?\s*\n\n```([\s\S]*?)```/i,
    /##\s*Usage[s]?\s*\n\n```([\s\S]*?)```/i,
    /##\s*Common Tasks?\s*\n\n```([\s\S]*?)```/i
  ];

  for (const pattern of examplePatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract agent metadata from file
 * @param {string} agentPath - Path to agent file
 * @returns {object} Agent metadata
 */
function extractAgentMetadata(agentPath) {
  try {
    const content = fs.readFileSync(agentPath, 'utf8');
    const frontmatter = parseAgentFrontmatter(content);
    const example = extractAgentExample(content);

    return {
      name: frontmatter?.name || path.basename(agentPath, '.md'),
      description: frontmatter?.description || 'No description available',
      tools: frontmatter?.tools || 'Not specified',
      model: frontmatter?.model || 'Not specified',
      example: example
    };
  } catch (error) {
    return {
      name: path.basename(agentPath, '.md'),
      description: 'Error reading agent file',
      tools: 'Not specified',
      model: 'Not specified',
      example: null,
      error: error.message
    };
  }
}

/**
 * Extract script metadata from file
 * @param {string} scriptPath - Path to script file
 * @returns {object} Script metadata
 */
function extractScriptMetadata(scriptPath) {
  try {
    const content = fs.readFileSync(scriptPath, 'utf8');
    const filename = path.basename(scriptPath);

    // Extract JSDoc comment from top of file
    const jsdocMatch = content.match(/\/\*\*\s*\n([\s\S]*?)\*\//);
    let purpose = 'No description available';
    let usage = null;
    let examples = [];

    if (jsdocMatch) {
      const jsdoc = jsdocMatch[1];

      // Extract purpose/description
      const descMatch = jsdoc.match(/@description\s+(.+)/i) ||
                       jsdoc.match(/^\s*\*\s*(.+)/m);
      if (descMatch) {
        purpose = descMatch[1].trim();
      }

      // Extract usage
      const usageMatch = jsdoc.match(/@usage\s+([\s\S]+?)(?=\n\s*\*\s*@|$)/i);
      if (usageMatch) {
        usage = usageMatch[1].trim();
      }

      // Extract examples
      const exampleMatches = jsdoc.matchAll(/@example\s+([\s\S]+?)(?=\n\s*\*\s*@|$)/gi);
      for (const match of exampleMatches) {
        examples.push(match[1].trim());
      }
    }

    return {
      name: filename,
      purpose,
      usage,
      examples
    };
  } catch (error) {
    return {
      name: path.basename(scriptPath),
      purpose: 'Error reading script file',
      usage: null,
      examples: [],
      error: error.message
    };
  }
}

/**
 * Extract command metadata from file
 * @param {string} commandPath - Path to command file
 * @returns {object} Command metadata
 */
function extractCommandMetadata(commandPath) {
  try {
    const content = fs.readFileSync(commandPath, 'utf8');
    const filename = path.basename(commandPath, '.md');
    const commandName = '/' + filename;

    // Extract description (first paragraph after any frontmatter)
    let description = 'No description available';
    const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    const descMatch = contentWithoutFrontmatter.match(/^(.+?)(?:\n\n|$)/);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    return {
      name: commandName,
      filename,
      description,
      path: `./commands/${filename}.md`
    };
  } catch (error) {
    return {
      name: '/' + path.basename(commandPath, '.md'),
      filename: path.basename(commandPath, '.md'),
      description: 'Error reading command file',
      path: `./commands/${path.basename(commandPath)}`,
      error: error.message
    };
  }
}

/**
 * Generate Features section markdown
 * @param {object} plugin - Plugin manifest
 * @param {object} metadata - Plugin metadata
 * @returns {string} Features markdown
 */
function generateFeaturesSection(plugin, metadata) {
  let md = '## Features\n\n';

  if (metadata.agents && metadata.agents.length > 0) {
    md += '### Agents\n';
    for (const agent of metadata.agents) {
      md += `- **${agent.name}**: ${agent.description}\n`;
    }
    md += '\n';
  }

  if (metadata.scripts && metadata.scripts.length > 0) {
    md += '### Scripts\n';
    for (const script of metadata.scripts) {
      md += `- **${script.name}**: ${script.purpose}\n`;
    }
    md += '\n';
  }

  if (metadata.commands && metadata.commands.length > 0) {
    md += '### Commands\n';
    for (const command of metadata.commands) {
      md += `- **${command.name}**: ${command.description}\n`;
    }
    md += '\n';
  }

  return md;
}

/**
 * Generate Agents section markdown
 * @param {array} agents - Agent metadata array
 * @returns {string} Agents markdown
 */
function generateAgentsSection(agents) {
  if (!agents || agents.length === 0) {
    return '';
  }

  let md = '\n## Agents\n\n';

  for (const agent of agents) {
    md += `### ${agent.name}\n`;
    md += `**Description:** ${agent.description}\n\n`;
    md += `**Tools:** ${agent.tools}\n\n`;

    if (agent.example) {
      md += `**Example:**\n\`\`\`${agent.example.startsWith('yaml') || agent.example.startsWith('bash') ? '' : 'yaml'}\n${agent.example}\n\`\`\`\n\n`;
    }

    md += '---\n\n';
  }

  return md;
}

/**
 * Generate Scripts section markdown
 * @param {array} scripts - Script metadata array
 * @param {string} pluginName - Plugin name
 * @returns {string} Scripts markdown
 */
function generateScriptsSection(scripts, pluginName) {
  if (!scripts || scripts.length === 0) {
    return '';
  }

  let md = '\n## Scripts\n\n';

  for (const script of scripts) {
    md += `### ${script.name}\n`;
    md += `**Purpose:** ${script.purpose}\n\n`;

    md += `**Usage:**\n\`\`\`bash\n`;
    if (script.usage) {
      md += script.usage;
    } else {
      md += `node .claude-plugins/${pluginName}/scripts/${script.name}`;
    }
    md += `\n\`\`\`\n\n`;

    if (script.examples && script.examples.length > 0) {
      md += `**Examples:**\n`;
      for (const example of script.examples) {
        md += `\`\`\`bash\n${example}\n\`\`\`\n`;
      }
      md += '\n';
    }

    md += '---\n\n';
  }

  return md;
}

/**
 * Generate Commands section markdown
 * @param {array} commands - Command metadata array
 * @returns {string} Commands markdown
 */
function generateCommandsSection(commands) {
  if (!commands || commands.length === 0) {
    return '';
  }

  let md = '\n## Commands\n\n';

  for (const command of commands) {
    md += `### ${command.name}\n`;
    md += `${command.description}\n\n`;
    md += `See [commands/${command.filename}.md](${command.path}) for detailed usage.\n\n`;
    md += '---\n\n';
  }

  return md;
}

/**
 * Generate complete README markdown
 * @param {string} pluginPath - Path to plugin directory
 * @returns {string} Complete README markdown
 */
function generateReadme(pluginPath) {
  // Read plugin.json
  const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Plugin manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pluginName = manifest.name;

  // Discover plugin components
  const agentsDir = path.join(pluginPath, 'agents');
  const scriptsDir = path.join(pluginPath, 'scripts');
  const commandsDir = path.join(pluginPath, 'commands');

  const metadata = {
    agents: [],
    scripts: [],
    commands: []
  };

  // Extract agent metadata
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    for (const file of agentFiles) {
      const agentPath = path.join(agentsDir, file);
      metadata.agents.push(extractAgentMetadata(agentPath));
    }
  }

  // Extract script metadata
  if (fs.existsSync(scriptsDir)) {
    const scriptFiles = fs.readdirSync(scriptsDir)
      .filter(f => f.endsWith('.js') && !f.includes('.test.js'))
      .sort();

    for (const file of scriptFiles) {
      const scriptPath = path.join(scriptsDir, file);
      metadata.scripts.push(extractScriptMetadata(scriptPath));
    }
  }

  // Extract command metadata
  if (fs.existsSync(commandsDir)) {
    const commandFiles = fs.readdirSync(commandsDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    for (const file of commandFiles) {
      const commandPath = path.join(commandsDir, file);
      metadata.commands.push(extractCommandMetadata(commandPath));
    }
  }

  // Generate README
  let readme = `# ${manifest.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}\n\n`;
  readme += `${manifest.description}\n\n`;

  readme += `## Overview\n\n`;
  readme += `${manifest.description}\n\n`;
  readme += `This plugin provides ${metadata.agents.length} agents, ${metadata.scripts.length} scripts, ${metadata.commands.length} commands.\n\n`;

  readme += `## Quick Start\n\n`;
  readme += `### Installation\n\n`;
  readme += `\`\`\`bash\n`;
  readme += `/plugin install ${pluginName}@revpal-internal-plugins\n`;
  readme += `\`\`\`\n\n`;

  readme += `### Verify Installation\n\n`;
  readme += `\`\`\`bash\n`;
  readme += `/agents  # Should show ${metadata.agents.length} ${pluginName} agents\n`;
  readme += `\`\`\`\n\n`;

  if (metadata.agents.length > 0) {
    readme += `### Your First Task\n\n`;
    readme += `Try asking for help with ${metadata.agents[0].name}:\n`;
    readme += `\`\`\`\n`;
    readme += `User: "Help me ${metadata.agents[0].description.toLowerCase()}"\n`;
    readme += `\`\`\`\n\n`;
  }

  readme += generateFeaturesSection(manifest, metadata);
  readme += generateAgentsSection(metadata.agents);
  readme += generateScriptsSection(metadata.scripts, pluginName);
  readme += generateCommandsSection(metadata.commands);

  // Add standard sections
  readme += `## Dependencies\n\n`;
  readme += `### Required CLI Tools\n\n`;
  readme += `- **node** >=18.0.0\n`;
  readme += `  - Node.js runtime for development tools\n`;
  readme += `  - Check: \`node --version\`\n`;
  readme += `  - Install: https://nodejs.org/\n\n`;

  readme += `\n\n## Documentation\n\n`;
  readme += `### Plugin-Specific\n`;
  readme += `- [CHANGELOG](./CHANGELOG.md) - Version history\n`;
  readme += `- [Agents](./agents/) - Agent source files\n`;
  readme += `- [Scripts](./scripts/) - Utility scripts\n`;
  readme += `- [Commands](./commands/) - Slash commands\n\n`;

  readme += `### General Documentation\n`;
  readme += `- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT_GUIDE.md)\n`;
  readme += `- [Agent Writing Guide](../../docs/AGENT_WRITING_GUIDE.md)\n`;
  readme += `- [Plugin Quality Standards](../../docs/PLUGIN_QUALITY_STANDARDS.md)\n\n`;

  readme += `\n## Troubleshooting\n\n`;
  readme += `See individual agent documentation for specific troubleshooting guidance.\n\n`;
  readme += `Common issues:\n`;
  readme += `- Installation problems: Verify all dependencies are installed\n`;
  readme += `- Agent not discovered: Run \`/agents\` to verify installation\n`;
  readme += `- Permission errors: Check file permissions on scripts\n\n`;

  readme += `## Contributing\n\n`;
  readme += `See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.\n\n`;

  readme += `## Version History\n\n`;
  readme += `See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.\n\n`;

  readme += `## License\n\n`;
  readme += `${manifest.license || 'MIT'} License - see repository LICENSE file\n\n`;

  readme += `## Support\n\n`;
  readme += `- **Documentation**: See \`/docs\` directory\n`;
  readme += `- **Issues**: GitHub Issues\n`;
  readme += `- **Repository**: ${manifest.repository}\n\n`;

  readme += `---\n\n`;
  readme += `**${manifest.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} v${manifest.version}** - Built by ${manifest.author?.name || 'RevPal Engineering'}\n`;

  return readme;
}

/**
 * Write README to file
 * @param {string} pluginPath - Path to plugin directory
 * @param {string} readme - README content
 * @returns {string} Path to written file
 */
function writeReadme(pluginPath, readme) {
  const readmePath = path.join(pluginPath, 'README.md');
  fs.writeFileSync(readmePath, readme, 'utf8');
  return readmePath;
}

// Public API
module.exports = {
  parseAgentFrontmatter,
  extractAgentExample,
  extractAgentMetadata,
  extractScriptMetadata,
  extractCommandMetadata,
  generateFeaturesSection,
  generateAgentsSection,
  generateScriptsSection,
  generateCommandsSection,
  generateReadme,
  writeReadme
};
