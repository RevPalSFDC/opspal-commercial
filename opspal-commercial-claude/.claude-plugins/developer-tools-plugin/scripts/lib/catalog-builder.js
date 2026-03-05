/**
 * catalog-builder.js
 *
 * Marketplace catalog builder that aggregates all plugins, agents, scripts,
 * and commands into searchable catalog formats (JSON, Markdown, CSV).
 *
 * @module catalog-builder
 */

const fs = require('fs');
const path = require('path');

/**
 * Scan for all plugins in marketplace directory
 * @param {string} rootDir - Root marketplace directory (defaults to CWD)
 * @returns {array} Array of plugin directory paths
 */
function scanPlugins(rootDir = process.cwd()) {
  const pluginsDir = path.join(rootDir, '.claude-plugins');

  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  return fs.readdirSync(pluginsDir)
    .map(name => path.join(pluginsDir, name))
    .filter(dir => {
      if (!fs.statSync(dir).isDirectory()) return false;
      const manifestPath = path.join(dir, '.claude-plugin', 'plugin.json');
      return fs.existsSync(manifestPath);
    });
}

/**
 * Parse agent frontmatter (reused from readme-generator pattern)
 * @param {string} content - File content
 * @returns {object|null} Parsed frontmatter or null
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
 * Extract agent metadata from file
 * @param {string} agentPath - Path to agent file
 * @returns {object} Agent metadata
 */
function extractAgentMetadata(agentPath) {
  try {
    const content = fs.readFileSync(agentPath, 'utf8');
    const frontmatter = parseAgentFrontmatter(content);

    return {
      name: frontmatter?.name || path.basename(agentPath, '.md'),
      description: frontmatter?.description || 'No description available',
      tools: frontmatter?.tools || 'Not specified',
      model: frontmatter?.model || 'Not specified'
    };
  } catch (error) {
    return {
      name: path.basename(agentPath, '.md'),
      description: 'Error reading agent file',
      tools: 'Not specified',
      model: 'Not specified',
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

    // Extract JSDoc comment
    const jsdocMatch = content.match(/\/\*\*\s*\n([\s\S]*?)\*\//);
    let purpose = 'No description available';

    if (jsdocMatch) {
      const jsdoc = jsdocMatch[1];
      const descMatch = jsdoc.match(/@description\s+(.+)/i) ||
                       jsdoc.match(/^\s*\*\s*(.+)/m);
      if (descMatch) {
        purpose = descMatch[1].trim();
      }
    }

    return {
      name: filename,
      purpose
    };
  } catch (error) {
    return {
      name: path.basename(scriptPath),
      purpose: 'Error reading script file',
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

    let description = 'No description available';
    const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    const descMatch = contentWithoutFrontmatter.match(/^(.+?)(?:\n\n|$)/);
    if (descMatch) {
      description = descMatch[1].trim();
    }

    return {
      name: commandName,
      description
    };
  } catch (error) {
    return {
      name: '/' + path.basename(commandPath, '.md'),
      description: 'Error reading command file',
      error: error.message
    };
  }
}

/**
 * Extract complete plugin metadata
 * @param {string} pluginDir - Path to plugin directory
 * @returns {object} Complete plugin metadata
 */
function extractPluginMetadata(pluginDir) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const pluginName = path.basename(pluginDir);

    // Extract agents
    const agents = [];
    const agentsDir = path.join(pluginDir, 'agents');
    if (fs.existsSync(agentsDir)) {
      const agentFiles = fs.readdirSync(agentsDir)
        .filter(f => f.endsWith('.md'))
        .sort();

      for (const file of agentFiles) {
        const agentPath = path.join(agentsDir, file);
        agents.push(extractAgentMetadata(agentPath));
      }
    }

    // Extract scripts
    const scripts = [];
    const scriptsDir = path.join(pluginDir, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      const scriptFiles = fs.readdirSync(scriptsDir)
        .filter(f => f.endsWith('.js') && !f.includes('.test.js'))
        .sort();

      for (const file of scriptFiles) {
        const scriptPath = path.join(scriptsDir, file);
        scripts.push(extractScriptMetadata(scriptPath));
      }
    }

    // Extract commands
    const commands = [];
    const commandsDir = path.join(pluginDir, 'commands');
    if (fs.existsSync(commandsDir)) {
      const commandFiles = fs.readdirSync(commandsDir)
        .filter(f => f.endsWith('.md'))
        .sort();

      for (const file of commandFiles) {
        const commandPath = path.join(commandsDir, file);
        commands.push(extractCommandMetadata(commandPath));
      }
    }

    return {
      name: manifest.name || pluginName,
      version: manifest.version || '0.0.0',
      description: manifest.description || 'No description available',
      author: manifest.author || { name: 'Unknown' },
      agentCount: agents.length,
      scriptCount: scripts.length,
      commandCount: commands.length,
      agents,
      scripts,
      commands,
      dependencies: manifest.dependencies || {},
      path: pluginDir
    };
  } catch (error) {
    return {
      name: path.basename(pluginDir),
      version: '0.0.0',
      description: 'Error reading plugin manifest',
      error: error.message,
      path: pluginDir
    };
  }
}

/**
 * Build complete marketplace catalog
 * @param {string} rootDir - Root marketplace directory
 * @returns {object} Complete catalog object
 */
function buildCatalog(rootDir = process.cwd()) {
  const pluginDirs = scanPlugins(rootDir);
  const plugins = [];

  for (const dir of pluginDirs) {
    const metadata = extractPluginMetadata(dir);
    if (metadata) {
      plugins.push(metadata);
    }
  }

  const summary = {
    totalPlugins: plugins.length,
    totalAgents: plugins.reduce((sum, p) => sum + p.agentCount, 0),
    totalScripts: plugins.reduce((sum, p) => sum + p.scriptCount, 0),
    totalCommands: plugins.reduce((sum, p) => sum + p.commandCount, 0)
  };

  return {
    generated: new Date().toISOString(),
    version: '1.0.0',
    summary,
    plugins
  };
}

/**
 * Search catalog by keyword
 * @param {object} catalog - Catalog object
 * @param {string} keyword - Search keyword
 * @returns {object} Search results
 */
function searchCatalog(catalog, keyword) {
  if (!catalog || !keyword || typeof keyword !== 'string') {
    return { results: [], count: 0 };
  }

  const lowerKeyword = keyword.toLowerCase();
  const results = [];

  for (const plugin of catalog.plugins) {
    // Search agents
    for (const agent of plugin.agents || []) {
      if (agent.name.toLowerCase().includes(lowerKeyword) ||
          agent.description.toLowerCase().includes(lowerKeyword)) {
        results.push({
          type: 'agent',
          plugin: plugin.name,
          name: agent.name,
          description: agent.description
        });
      }
    }

    // Search scripts
    for (const script of plugin.scripts || []) {
      if (script.name.toLowerCase().includes(lowerKeyword) ||
          script.purpose.toLowerCase().includes(lowerKeyword)) {
        results.push({
          type: 'script',
          plugin: plugin.name,
          name: script.name,
          purpose: script.purpose
        });
      }
    }

    // Search commands
    for (const command of plugin.commands || []) {
      if (command.name.toLowerCase().includes(lowerKeyword) ||
          command.description.toLowerCase().includes(lowerKeyword)) {
        results.push({
          type: 'command',
          plugin: plugin.name,
          name: command.name,
          description: command.description
        });
      }
    }
  }

  return {
    keyword,
    results,
    count: results.length
  };
}

/**
 * Filter catalog by domain
 * @param {object} catalog - Catalog object
 * @param {string} domain - Domain name (salesforce, hubspot, developer, gtm, cross-platform)
 * @returns {object} Filtered catalog
 */
function filterByDomain(catalog, domain) {
  if (!catalog || !domain || typeof domain !== 'string') {
    return catalog;
  }

  const lowerDomain = domain.toLowerCase();
  const domainPatterns = {
    salesforce: /salesforce|sfdc|sf-/i,
    hubspot: /hubspot|hs-/i,
    developer: /developer|dev-/i,
    gtm: /gtm|go-to-market/i,
    'cross-platform': /cross-platform|unified/i
  };

  const pattern = domainPatterns[lowerDomain] || new RegExp(lowerDomain, 'i');

  const filteredPlugins = catalog.plugins.filter(plugin =>
    pattern.test(plugin.name) || pattern.test(plugin.description)
  );

  return {
    ...catalog,
    summary: {
      totalPlugins: filteredPlugins.length,
      totalAgents: filteredPlugins.reduce((sum, p) => sum + p.agentCount, 0),
      totalScripts: filteredPlugins.reduce((sum, p) => sum + p.scriptCount, 0),
      totalCommands: filteredPlugins.reduce((sum, p) => sum + p.commandCount, 0)
    },
    plugins: filteredPlugins,
    filtered: { domain }
  };
}

/**
 * Generate statistics from catalog
 * @param {object} catalog - Catalog object
 * @returns {object} Statistics object
 */
function generateStatistics(catalog) {
  if (!catalog || !catalog.plugins) {
    return {};
  }

  // Calculate totals
  const stats = {
    summary: catalog.summary,
    byPlugin: [],
    byDomain: {},
    averages: {
      agentsPerPlugin: 0,
      scriptsPerPlugin: 0,
      commandsPerPlugin: 0
    }
  };

  // Per-plugin stats
  for (const plugin of catalog.plugins) {
    stats.byPlugin.push({
      name: plugin.name,
      version: plugin.version,
      agents: plugin.agentCount,
      scripts: plugin.scriptCount,
      commands: plugin.commandCount
    });
  }

  // Domain grouping (heuristic based on plugin name)
  const domains = {
    salesforce: [],
    hubspot: [],
    developer: [],
    gtm: [],
    'cross-platform': []
  };

  for (const plugin of catalog.plugins) {
    if (/salesforce|sfdc/i.test(plugin.name)) {
      domains.salesforce.push(plugin.name);
    } else if (/hubspot/i.test(plugin.name)) {
      domains.hubspot.push(plugin.name);
    } else if (/developer/i.test(plugin.name)) {
      domains.developer.push(plugin.name);
    } else if (/gtm/i.test(plugin.name)) {
      domains.gtm.push(plugin.name);
    } else if (/cross-platform/i.test(plugin.name)) {
      domains['cross-platform'].push(plugin.name);
    }
  }

  stats.byDomain = Object.entries(domains)
    .filter(([_, plugins]) => plugins.length > 0)
    .reduce((acc, [domain, plugins]) => {
      acc[domain] = {
        pluginCount: plugins.length,
        plugins
      };
      return acc;
    }, {});

  // Calculate averages
  if (catalog.plugins.length > 0) {
    stats.averages.agentsPerPlugin =
      (catalog.summary.totalAgents / catalog.plugins.length).toFixed(1);
    stats.averages.scriptsPerPlugin =
      (catalog.summary.totalScripts / catalog.plugins.length).toFixed(1);
    stats.averages.commandsPerPlugin =
      (catalog.summary.totalCommands / catalog.plugins.length).toFixed(1);
  }

  return stats;
}

/**
 * Generate Markdown output from catalog
 * @param {object} catalog - Catalog object
 * @returns {string} Markdown string
 */
function generateMarkdown(catalog) {
  if (!catalog) {
    return '';
  }

  let md = '# OpsPal Plugin Marketplace Catalog\n\n';
  md += `**Generated**: ${new Date(catalog.generated).toLocaleDateString()}\n\n`;

  // Summary
  md += '## Summary\n\n';
  md += `- **Total Plugins**: ${catalog.summary.totalPlugins}\n`;
  md += `- **Total Agents**: ${catalog.summary.totalAgents}\n`;
  md += `- **Total Scripts**: ${catalog.summary.totalScripts}\n`;
  md += `- **Total Commands**: ${catalog.summary.totalCommands}\n\n`;

  // Statistics
  const stats = generateStatistics(catalog);
  if (stats.byDomain && Object.keys(stats.byDomain).length > 0) {
    md += '## By Domain\n\n';
    for (const [domain, info] of Object.entries(stats.byDomain)) {
      md += `### ${domain.charAt(0).toUpperCase() + domain.slice(1)}\n`;
      md += `- Plugins: ${info.pluginCount}\n`;
      md += `- Plugins: ${info.plugins.join(', ')}\n\n`;
    }
  }

  // Plugins
  md += '## Plugins\n\n';
  for (const plugin of catalog.plugins) {
    md += `### ${plugin.name} (v${plugin.version})\n\n`;
    md += `**Description**: ${plugin.description}\n\n`;

    if (plugin.agentCount > 0) {
      md += `**Agents** (${plugin.agentCount}):\n`;
      for (const agent of plugin.agents.slice(0, 5)) {
        md += `- **${agent.name}**: ${agent.description}\n`;
      }
      if (plugin.agents.length > 5) {
        md += `- ... (${plugin.agents.length - 5} more)\n`;
      }
      md += '\n';
    }

    if (plugin.scriptCount > 0) {
      md += `**Scripts** (${plugin.scriptCount}):\n`;
      for (const script of plugin.scripts.slice(0, 3)) {
        md += `- ${script.name}\n`;
      }
      if (plugin.scripts.length > 3) {
        md += `- ... (${plugin.scripts.length - 3} more)\n`;
      }
      md += '\n';
    }

    if (plugin.commandCount > 0) {
      md += `**Commands** (${plugin.commandCount}):\n`;
      for (const command of plugin.commands) {
        md += `- ${command.name}\n`;
      }
      md += '\n';
    }

    md += '---\n\n';
  }

  return md;
}

/**
 * Generate CSV output from catalog
 * @param {object} catalog - Catalog object
 * @returns {string} CSV string
 */
function generateCSV(catalog) {
  if (!catalog) {
    return '';
  }

  let csv = 'Plugin,Version,Description,Agents,Scripts,Commands\n';

  for (const plugin of catalog.plugins) {
    const desc = plugin.description.replace(/,/g, ';').replace(/"/g, '""');
    csv += `"${plugin.name}","${plugin.version}","${desc}",${plugin.agentCount},${plugin.scriptCount},${plugin.commandCount}\n`;
  }

  return csv;
}

/**
 * Write catalog to file
 * @param {string} filePath - Output file path
 * @param {string} content - Content to write
 * @returns {string} Path to written file
 */
function writeCatalog(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// Public API
module.exports = {
  scanPlugins,
  extractPluginMetadata,
  buildCatalog,
  searchCatalog,
  filterByDomain,
  generateStatistics,
  generateMarkdown,
  generateCSV,
  writeCatalog,
  // Export internal functions for testing
  parseAgentFrontmatter,
  extractAgentMetadata,
  extractScriptMetadata,
  extractCommandMetadata
};
