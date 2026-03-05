#!/usr/bin/env node

/**
 * Skill Cataloger - ACE Framework Initial Import Tool
 *
 * Scans existing playbooks, contexts, and shared resources
 * and imports them into the skill registry.
 *
 * Features:
 * - Scan playbooks from multiple plugins
 * - Parse markdown files for skill content
 * - Extract metadata from YAML frontmatter
 * - Categorize skills automatically
 * - Generate skill IDs
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const SkillRegistry = require('./strategy-registry');

class SkillCataloger {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.pluginRoot = options.pluginRoot ||
      path.resolve(__dirname, '../../../');

    this.registry = new SkillRegistry({
      verbose: this.verbose,
      dryRun: this.dryRun
    });

    // Category mapping based on path patterns
    this.categoryPatterns = {
      'assessment': /assess|audit|review|evaluat|analyz/i,
      'deployment': /deploy|release|package|metadata/i,
      'validation': /valid|verify|check|test|preflight/i,
      'query': /query|soql|report|data/i,
      'automation': /flow|workflow|trigger|process/i,
      'configuration': /config|setup|setting|perm/i,
      'integration': /integrat|api|connect|sync/i,
      'troubleshooting': /troubleshoot|debug|fix|error|issue/i,
      'orchestration': /orchestr|coordinat|bulk|batch/i,
      'documentation': /doc|readme|guide|playbook/i
    };

    // Source agent mapping based on directory
    this.agentMapping = {
      'salesforce-plugin': 'sfdc-orchestrator',
      'hubspot-plugin': 'hubspot-orchestrator',
      'opspal-core': 'unified-orchestrator',
      'marketo-plugin': 'marketo-orchestrator'
    };

    this.log('SkillCataloger initialized', {
      pluginRoot: this.pluginRoot,
      dryRun: this.dryRun
    });
  }

  /**
   * Scan and catalog all skills from plugins
   *
   * @param {Object} [options]
   * @param {string[]} [options.plugins] - Specific plugins to scan (default: all)
   * @param {string[]} [options.sourceTypes] - Source types to include (default: all)
   * @returns {Promise<Object>}
   */
  async catalogAll(options = {}) {
    this.log('Starting full catalog scan');

    const results = {
      playbooks: { scanned: 0, imported: 0, failed: 0 },
      contexts: { scanned: 0, imported: 0, failed: 0 },
      shared: { scanned: 0, imported: 0, failed: 0 },
      total: { scanned: 0, imported: 0, failed: 0 },
      skills: []
    };

    // Determine which plugins to scan
    const plugins = options.plugins || this.findPlugins();
    const sourceTypes = options.sourceTypes || ['playbook', 'context', 'shared'];

    this.log(`Scanning ${plugins.length} plugins`, plugins);

    for (const plugin of plugins) {
      const pluginPath = path.join(this.pluginRoot, plugin);

      if (!fs.existsSync(pluginPath)) {
        this.log(`Plugin not found: ${plugin}`);
        continue;
      }

      // Scan playbooks
      if (sourceTypes.includes('playbook')) {
        const playbooksPath = path.join(pluginPath, 'playbooks');
        if (fs.existsSync(playbooksPath)) {
          const pbResult = await this.scanDirectory(playbooksPath, {
            plugin,
            sourceType: 'playbook'
          });
          results.playbooks.scanned += pbResult.scanned;
          results.playbooks.imported += pbResult.imported;
          results.playbooks.failed += pbResult.failed;
          results.skills.push(...pbResult.skills);
        }
      }

      // Scan contexts
      if (sourceTypes.includes('context')) {
        const contextsPath = path.join(pluginPath, 'contexts');
        if (fs.existsSync(contextsPath)) {
          const ctxResult = await this.scanDirectory(contextsPath, {
            plugin,
            sourceType: 'context'
          });
          results.contexts.scanned += ctxResult.scanned;
          results.contexts.imported += ctxResult.imported;
          results.contexts.failed += ctxResult.failed;
          results.skills.push(...ctxResult.skills);
        }
      }

      // Scan shared resources
      if (sourceTypes.includes('shared')) {
        const sharedPath = path.join(pluginPath, 'agents', 'shared');
        if (fs.existsSync(sharedPath)) {
          const sharedResult = await this.scanDirectory(sharedPath, {
            plugin,
            sourceType: 'shared'
          });
          results.shared.scanned += sharedResult.scanned;
          results.shared.imported += sharedResult.imported;
          results.shared.failed += sharedResult.failed;
          results.skills.push(...sharedResult.skills);
        }
      }
    }

    // Calculate totals
    results.total.scanned = results.playbooks.scanned + results.contexts.scanned + results.shared.scanned;
    results.total.imported = results.playbooks.imported + results.contexts.imported + results.shared.imported;
    results.total.failed = results.playbooks.failed + results.contexts.failed + results.shared.failed;

    this.log('Catalog complete', {
      total: results.total,
      playbooks: results.playbooks,
      contexts: results.contexts,
      shared: results.shared
    });

    return results;
  }

  /**
   * Scan a directory for skill files
   *
   * @param {string} dirPath - Directory to scan
   * @param {Object} options
   * @param {string} options.plugin - Plugin name
   * @param {string} options.sourceType - Source type
   * @returns {Promise<Object>}
   */
  async scanDirectory(dirPath, options) {
    const result = {
      scanned: 0,
      imported: 0,
      failed: 0,
      skills: []
    };

    const files = this.findFiles(dirPath, ['.md', '.yaml', '.yml', '.json']);
    this.log(`Found ${files.length} files in ${dirPath}`);

    for (const file of files) {
      result.scanned++;

      try {
        const skill = await this.parseSkillFile(file, options);
        if (skill) {
          const registered = await this.registry.registerSkill(skill);
          result.imported++;
          result.skills.push({
            skillId: registered.skillId,
            name: skill.name,
            category: skill.category,
            sourceFile: file
          });
          this.log(`Imported: ${skill.name} (${registered.skillId})`);
        }
      } catch (error) {
        result.failed++;
        this.log(`Failed to import ${file}: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Parse a skill file and extract skill data
   *
   * @param {string} filePath - Path to skill file
   * @param {Object} options
   * @returns {Promise<Object|null>}
   */
  async parseSkillFile(filePath, options) {
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    let skillData;

    switch (ext) {
      case '.md':
        skillData = this.parseMarkdownSkill(filePath, content, options);
        break;
      case '.yaml':
      case '.yml':
        skillData = this.parseYamlSkill(filePath, content, options);
        break;
      case '.json':
        skillData = this.parseJsonSkill(filePath, content, options);
        break;
      default:
        return null;
    }

    if (!skillData || !skillData.name || !skillData.content) {
      return null;
    }

    // Add common fields
    skillData.sourceFile = filePath;
    skillData.sourceType = options.sourceType;
    skillData.sourceAgent = skillData.sourceAgent ||
      this.agentMapping[options.plugin] ||
      this.inferAgentFromPath(filePath);

    return skillData;
  }

  /**
   * Parse markdown file as skill
   *
   * @param {string} filePath
   * @param {string} content
   * @param {Object} options
   * @returns {Object}
   */
  parseMarkdownSkill(filePath, content, options) {
    const fileName = path.basename(filePath, '.md');

    // Extract YAML frontmatter if present
    let frontmatter = {};
    let body = content;

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (fmMatch) {
      try {
        frontmatter = this.parseYaml(fmMatch[1]);
        body = fmMatch[2];
      } catch (e) {
        // Ignore frontmatter parse errors
      }
    }

    // Extract title from first heading
    const titleMatch = body.match(/^#\s+(.+)$/m);
    const title = frontmatter.name || frontmatter.title ||
      (titleMatch ? titleMatch[1] : this.formatName(fileName));

    // Extract description
    const descMatch = body.match(/^#\s+.+\n+([^#].+?)(?:\n\n|\n#)/s);
    const description = frontmatter.description ||
      (descMatch ? descMatch[1].trim().substring(0, 500) : null);

    // Determine category
    const category = frontmatter.category ||
      this.inferCategory(filePath, title, body);

    // Extract sections as patterns
    const sections = this.extractSections(body);

    // Build content object
    const skillContent = {
      instructions: body.substring(0, 5000), // Limit size
      patterns: this.extractPatterns(body),
      sections: Object.keys(sections),
      examples: this.extractExamples(body),
      prerequisites: frontmatter.prerequisites || []
    };

    return {
      name: title,
      description,
      category,
      subcategory: frontmatter.subcategory || this.inferSubcategory(filePath),
      tags: this.extractTags(filePath, title, body, frontmatter),
      content: skillContent
    };
  }

  /**
   * Parse YAML file as skill
   *
   * @param {string} filePath
   * @param {string} content
   * @param {Object} options
   * @returns {Object}
   */
  parseYamlSkill(filePath, content, options) {
    const data = this.parseYaml(content);
    const fileName = path.basename(filePath, path.extname(filePath));

    return {
      name: data.name || data.title || this.formatName(fileName),
      description: data.description,
      category: data.category || this.inferCategory(filePath, data.name || fileName, content),
      subcategory: data.subcategory,
      tags: data.tags || this.extractTags(filePath, data.name || fileName, content, data),
      content: {
        instructions: data.instructions || JSON.stringify(data, null, 2),
        patterns: data.patterns || [],
        examples: data.examples || [],
        prerequisites: data.prerequisites || []
      }
    };
  }

  /**
   * Parse JSON file as skill
   *
   * @param {string} filePath
   * @param {string} content
   * @param {Object} options
   * @returns {Object}
   */
  parseJsonSkill(filePath, content, options) {
    const data = JSON.parse(content);
    const fileName = path.basename(filePath, '.json');

    return {
      name: data.name || data.title || this.formatName(fileName),
      description: data.description,
      category: data.category || this.inferCategory(filePath, data.name || fileName, content),
      subcategory: data.subcategory,
      tags: data.tags || this.extractTags(filePath, data.name || fileName, content, data),
      content: {
        instructions: data.instructions || JSON.stringify(data, null, 2),
        patterns: data.patterns || [],
        examples: data.examples || [],
        prerequisites: data.prerequisites || []
      }
    };
  }

  /**
   * Simple YAML parser
   *
   * @param {string} content
   * @returns {Object}
   */
  parseYaml(content) {
    const result = {};
    const lines = content.split('\n');
    let currentKey = null;
    let currentArray = null;

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || !line.trim()) continue;

      // Array item
      if (line.match(/^\s+-\s+/)) {
        if (currentArray) {
          const value = line.replace(/^\s+-\s+/, '').trim();
          currentArray.push(value.replace(/^['"]|['"]$/g, ''));
        }
        continue;
      }

      // Key-value pair
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        currentKey = kvMatch[1];
        const value = kvMatch[2].trim();

        if (!value) {
          // Start of array or nested object
          result[currentKey] = [];
          currentArray = result[currentKey];
        } else {
          result[currentKey] = value.replace(/^['"]|['"]$/g, '');
          currentArray = null;
        }
      }
    }

    return result;
  }

  /**
   * Infer category from path and content
   *
   * @param {string} filePath
   * @param {string} title
   * @param {string} content
   * @returns {string}
   */
  inferCategory(filePath, title, content) {
    const searchText = `${filePath} ${title}`.toLowerCase();

    for (const [category, pattern] of Object.entries(this.categoryPatterns)) {
      if (pattern.test(searchText)) {
        return category;
      }
    }

    // Check content for keywords
    const contentLower = content.toLowerCase();
    for (const [category, pattern] of Object.entries(this.categoryPatterns)) {
      if (pattern.test(contentLower)) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Infer subcategory from path
   *
   * @param {string} filePath
   * @returns {string|null}
   */
  inferSubcategory(filePath) {
    const parts = filePath.split(path.sep);
    const playbooksIdx = parts.indexOf('playbooks');
    const contextsIdx = parts.indexOf('contexts');

    const startIdx = Math.max(playbooksIdx, contextsIdx);
    if (startIdx >= 0 && startIdx < parts.length - 2) {
      return parts[startIdx + 1];
    }

    return null;
  }

  /**
   * Infer agent from file path
   *
   * @param {string} filePath
   * @returns {string}
   */
  inferAgentFromPath(filePath) {
    // Check for specific agent patterns in path
    const pathLower = filePath.toLowerCase();

    if (pathLower.includes('cpq') || pathLower.includes('quote')) {
      return 'sfdc-cpq-assessor';
    }
    if (pathLower.includes('revops') || pathLower.includes('forecast')) {
      return 'sfdc-revops-auditor';
    }
    if (pathLower.includes('metadata') || pathLower.includes('deploy')) {
      return 'sfdc-metadata-manager';
    }
    if (pathLower.includes('flow') || pathLower.includes('automation')) {
      return 'sfdc-automation-builder';
    }
    if (pathLower.includes('hubspot')) {
      return 'hubspot-orchestrator';
    }
    if (pathLower.includes('report') || pathLower.includes('dashboard')) {
      return 'sfdc-reports-dashboards';
    }
    if (pathLower.includes('permission')) {
      return 'sfdc-permission-orchestrator';
    }

    return 'sfdc-orchestrator';
  }

  /**
   * Extract tags from content
   *
   * @param {string} filePath
   * @param {string} title
   * @param {string} content
   * @param {Object} frontmatter
   * @returns {string[]}
   */
  extractTags(filePath, title, content, frontmatter = {}) {
    const tags = new Set();

    // Add frontmatter tags
    if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
      frontmatter.tags.forEach(t => tags.add(t.toLowerCase()));
    }

    // Extract from path
    const pathParts = filePath.toLowerCase().split(/[\/\\]/);
    pathParts.forEach(part => {
      if (part.length > 3 && !['scripts', 'lib', 'docs', 'src'].includes(part)) {
        tags.add(part.replace(/[-_]/g, '-'));
      }
    });

    // Extract from title
    const titleWords = title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3);
    titleWords.forEach(w => tags.add(w));

    // Plugin-specific tags
    if (filePath.includes('salesforce')) tags.add('salesforce');
    if (filePath.includes('hubspot')) tags.add('hubspot');
    if (filePath.includes('cpq')) tags.add('cpq');
    if (filePath.includes('flow')) tags.add('flow');

    return Array.from(tags).slice(0, 10);
  }

  /**
   * Extract sections from markdown
   *
   * @param {string} content
   * @returns {Object}
   */
  extractSections(content) {
    const sections = {};
    const headingMatches = content.matchAll(/^##\s+(.+)$/gm);

    for (const match of headingMatches) {
      sections[match[1].trim()] = match.index;
    }

    return sections;
  }

  /**
   * Extract code patterns from content
   *
   * @param {string} content
   * @returns {string[]}
   */
  extractPatterns(content) {
    const patterns = [];

    // Extract code blocks
    const codeBlocks = content.matchAll(/```[\w]*\n([\s\S]*?)\n```/g);
    for (const block of codeBlocks) {
      const code = block[1].trim();
      if (code.length > 20 && code.length < 500) {
        patterns.push(code);
      }
    }

    // Extract inline code that looks like commands
    const inlineCode = content.matchAll(/`([^`]+)`/g);
    for (const match of inlineCode) {
      const code = match[1];
      if (code.startsWith('sf ') || code.startsWith('node ') ||
          code.includes('query') || code.includes('deploy')) {
        patterns.push(code);
      }
    }

    return patterns.slice(0, 10);
  }

  /**
   * Extract examples from content
   *
   * @param {string} content
   * @returns {Object[]}
   */
  extractExamples(content) {
    const examples = [];

    // Look for example sections
    const exampleMatch = content.match(/##\s*Examples?\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (exampleMatch) {
      const exampleContent = exampleMatch[1];

      // Extract numbered examples
      const numberedExamples = exampleContent.matchAll(/\d+\.\s*(.+?)(?=\n\d+\.|\n##|$)/gs);
      for (const ex of numberedExamples) {
        examples.push({
          description: ex[1].trim().substring(0, 200)
        });
      }
    }

    return examples.slice(0, 5);
  }

  /**
   * Format filename as readable name
   *
   * @param {string} fileName
   * @returns {string}
   */
  formatName(fileName) {
    return fileName
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  }

  /**
   * Find all plugin directories
   *
   * @returns {string[]}
   */
  findPlugins() {
    const plugins = [];

    try {
      const entries = fs.readdirSync(this.pluginRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('-plugin')) {
          plugins.push(entry.name);
        }
      }
    } catch (error) {
      this.log(`Error finding plugins: ${error.message}`);
    }

    return plugins;
  }

  /**
   * Find files with specific extensions recursively
   *
   * @param {string} dir
   * @param {string[]} extensions
   * @returns {string[]}
   */
  findFiles(dir, extensions) {
    const files = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            files.push(...this.findFiles(fullPath, extensions));
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      this.log(`Error scanning ${dir}: ${error.message}`);
    }

    return files;
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   * @param {string} message
   * @param {*} [data]
   */
  log(message, data = null) {
    if (this.verbose) {
      console.error(`[SkillCataloger] ${message}`, data !== null ? JSON.stringify(data, null, 2) : '');
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const usage = `
Skill Cataloger - Import Existing Skills

Usage: node skill-cataloger.js <command> [options]

Commands:
  catalog        Scan and import all skills from plugins
  scan           Scan without importing (preview)

Options:
  --plugins      Comma-separated list of plugins (default: all)
  --types        Comma-separated source types: playbook,context,shared (default: all)
  --verbose      Enable verbose logging
  --dry-run      Don't make changes (preview mode)

Examples:
  # Catalog all skills from all plugins
  node skill-cataloger.js catalog --verbose

  # Preview what would be imported
  node skill-cataloger.js catalog --dry-run --verbose

  # Catalog only salesforce-plugin playbooks
  node skill-cataloger.js catalog --plugins salesforce-plugin --types playbook

  # Scan without importing
  node skill-cataloger.js scan --verbose
`;

  if (!command || command === '--help' || command === '-h') {
    console.log(usage);
    process.exit(0);
  }

  const parseArgs = (args) => {
    const parsed = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        parsed[key] = value;
        if (value !== true) i++;
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const cataloger = new SkillCataloger({
    verbose: options.verbose || false,
    dryRun: options['dry-run'] || command === 'scan'
  });

  (async () => {
    try {
      const plugins = options.plugins ? options.plugins.split(',') : undefined;
      const sourceTypes = options.types ? options.types.split(',') : undefined;

      const result = await cataloger.catalogAll({ plugins, sourceTypes });

      console.log('\n=== Skill Cataloger Results ===\n');
      console.log(`Total Files Scanned:  ${result.total.scanned}`);
      console.log(`Total Skills Imported: ${result.total.imported}`);
      console.log(`Total Failed:         ${result.total.failed}`);
      console.log('');
      console.log('By Source Type:');
      console.log(`  Playbooks: ${result.playbooks.imported}/${result.playbooks.scanned}`);
      console.log(`  Contexts:  ${result.contexts.imported}/${result.contexts.scanned}`);
      console.log(`  Shared:    ${result.shared.imported}/${result.shared.scanned}`);
      console.log('');

      if (result.skills.length > 0) {
        console.log('Imported Skills:');
        for (const skill of result.skills.slice(0, 20)) {
          console.log(`  - ${skill.name} [${skill.category}]`);
        }
        if (result.skills.length > 20) {
          console.log(`  ... and ${result.skills.length - 20} more`);
        }
      }

      if (options['dry-run'] || command === 'scan') {
        console.log('\n[DRY RUN] No changes were made.');
      }

    } catch (error) {
      console.error('Error:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = SkillCataloger;
