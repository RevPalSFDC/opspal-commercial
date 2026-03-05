#!/usr/bin/env node
/**
 * Skill Metadata Collector
 *
 * Scans all plugins for skills and commands, extracting metadata for filtering.
 *
 * Usage:
 *   node scripts/lib/skill-metadata-collector.js [--output <path>]
 *
 * Output format:
 * {
 *   "salesforce-plugin": [
 *     {
 *       "name": "cpq-preflight",
 *       "description": "Run comprehensive pre-flight validation before CPQ assessments",
 *       "path": ".claude-plugins/opspal-salesforce/commands/cpq-preflight.md",
 *       "type": "command",
 *       "keywords": ["cpq", "quote", "pricing", "validate", "preflight"]
 *     },
 *     ...
 *   ],
 *   ...
 * }
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

class SkillMetadataCollector {
  constructor() {
    this.metadata = {};
    this.totalSkills = 0;
    this.pluginsDir = path.join(__dirname, '../../');
  }

  /**
   * Main collection method
   */
  async collect() {
    console.log('🔍 Scanning plugins for skills and commands...\n');

    // Find all command files
    const commandFiles = this.findFiles('commands/*.md');
    console.log(`Found ${commandFiles.length} command files`);

    // Find all skill files
    const skillFiles = this.findFiles('skills/*/SKILL.md');
    console.log(`Found ${skillFiles.length} skill files\n`);

    // Process command files
    for (const file of commandFiles) {
      this.processFile(file, 'command');
    }

    // Process skill files
    for (const file of skillFiles) {
      this.processFile(file, 'skill');
    }

    console.log(`\n✅ Collected metadata for ${this.totalSkills} skills/commands\n`);
    return this.metadata;
  }

  /**
   * Find files matching a glob pattern within plugins directory
   */
  findFiles(globPattern) {
    try {
      const fullPattern = path.join(this.pluginsDir, '*', globPattern);
      // Use spawnSync with args array to prevent shell injection
      const result = spawnSync('find', [
        this.pluginsDir,
        '-path', fullPattern,
        '-type', 'f'
      ], {
        encoding: 'utf8',
        timeout: 30000  // 30 second timeout
      });

      if (result.error) {
        console.error(`Error finding files with pattern ${globPattern}:`, result.error.message);
        return [];
      }

      return result.stdout.trim().split('\n').filter(f => f.length > 0);
    } catch (error) {
      console.error(`Error finding files with pattern ${globPattern}:`, error.message);
      return [];
    }
  }

  /**
   * Process a single skill or command file
   */
  processFile(filePath, type) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const pluginName = this.extractPluginName(filePath);
      const skillName = this.extractSkillName(filePath, type);
      const description = this.extractDescription(content);
      const keywords = this.extractKeywords(skillName, description);

      // Initialize plugin array if needed
      if (!this.metadata[pluginName]) {
        this.metadata[pluginName] = [];
      }

      // Add skill metadata
      this.metadata[pluginName].push({
        name: skillName,
        description,
        path: path.relative(process.cwd(), filePath),
        type,
        keywords
      });

      this.totalSkills++;
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error.message);
    }
  }

  /**
   * Extract plugin name from file path
   */
  extractPluginName(filePath) {
    const match = filePath.match(/\.claude-plugins\/([^/]+)\//);
    return match ? match[1] : 'unknown';
  }

  /**
   * Extract skill/command name from file path
   */
  extractSkillName(filePath, type) {
    if (type === 'command') {
      // commands/cpq-preflight.md -> cpq-preflight
      const basename = path.basename(filePath, '.md');
      return basename;
    } else {
      // skills/cpq-preflight/SKILL.md -> cpq-preflight
      const parts = filePath.split('/');
      const skillDir = parts[parts.length - 2];
      return skillDir;
    }
  }

  /**
   * Extract description from markdown content
   * Looks for description field in frontmatter or first paragraph
   */
  extractDescription(content) {
    // Try frontmatter first
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/description:\s*(.+?)(?:\n|$)/);
      if (descMatch) {
        return descMatch[1].replace(/^["']|["']$/g, '').trim();
      }
    }

    // Fall back to first paragraph after any headers
    const lines = content.split('\n');
    let inFrontmatter = false;
    let foundContent = false;

    for (const line of lines) {
      if (line.trim() === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter) continue;
      if (line.startsWith('#')) continue;
      if (line.trim().length === 0) continue;

      // First non-empty, non-header line after frontmatter
      foundContent = true;
      return line.trim();
    }

    return 'No description available';
  }

  /**
   * Extract keywords from skill name and description
   */
  extractKeywords(skillName, description) {
    const text = `${skillName} ${description}`.toLowerCase();
    const keywords = new Set();

    // Platform keywords
    const platformKeywords = {
      salesforce: /\b(salesforce|sfdc|apex|cpq|q2c|territory|revops|opportunity|pipeline|forecast)\b/g,
      hubspot: /\b(hubspot|hs|deal|workflow)\b/g,
      marketo: /\b(marketo|mql|nurture)\b/g,
      monday: /\b(monday|board)\b/g,
      'cross-platform': /\b(diagram|dashboard|sync|pdf|report|flowchart|erd)\b/g
    };

    // Operation keywords
    const operationKeywords = {
      import: /\b(import|upload|load|ingest)\b/g,
      export: /\b(export|download|extract|backup)\b/g,
      audit: /\b(audit|assess|analyze|review|evaluate)\b/g,
      deploy: /\b(deploy|release|publish|activate)\b/g,
      create: /\b(create|build|generate|add)\b/g,
      update: /\b(update|modify|change|edit)\b/g,
      sync: /\b(sync|synchronize|integrate)\b/g
    };

    // Domain keywords
    const domainKeywords = {
      cpq: /\b(cpq|quote|pricing|configure)\b/g,
      revops: /\b(revops|revenue|pipeline|forecast)\b/g,
      workflow: /\b(workflow|automation|process|flow)\b/g,
      data: /\b(data|record|field|object|csv)\b/g,
      territory: /\b(territory|assignment|routing)\b/g,
      security: /\b(security|permission|profile|access)\b/g,
      reporting: /\b(report|dashboard|analytics|metrics)\b/g
    };

    // Extract platform keywords
    for (const [platform, regex] of Object.entries(platformKeywords)) {
      if (regex.test(text)) {
        keywords.add(platform);
      }
    }

    // Extract operation keywords
    for (const [operation, regex] of Object.entries(operationKeywords)) {
      if (regex.test(text)) {
        keywords.add(operation);
      }
    }

    // Extract domain keywords
    for (const [domain, regex] of Object.entries(domainKeywords)) {
      if (regex.test(text)) {
        keywords.add(domain);
      }
    }

    // Add skill name tokens (words > 3 chars)
    const nameTokens = skillName.split(/[-_]/).filter(w => w.length > 3);
    nameTokens.forEach(token => keywords.add(token.toLowerCase()));

    return Array.from(keywords).sort();
  }

  /**
   * Generate summary statistics
   */
  generateSummary() {
    const summary = {
      totalSkills: this.totalSkills,
      totalPlugins: Object.keys(this.metadata).length,
      byPlugin: {}
    };

    for (const [plugin, skills] of Object.entries(this.metadata)) {
      summary.byPlugin[plugin] = {
        total: skills.length,
        commands: skills.filter(s => s.type === 'command').length,
        skills: skills.filter(s => s.type === 'skill').length
      };
    }

    return summary;
  }
}

// CLI usage
if (require.main === module) {
  const outputPath = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : path.join(__dirname, 'skill-metadata.json');

  const collector = new SkillMetadataCollector();

  collector.collect().then(metadata => {
    // Write metadata to file
    fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));
    console.log(`📝 Wrote metadata to: ${outputPath}\n`);

    // Generate and display summary
    const summary = collector.generateSummary();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SKILL METADATA COLLECTION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Skills/Commands: ${summary.totalSkills}`);
    console.log(`Total Plugins: ${summary.totalPlugins}\n`);
    console.log('By Plugin:');

    // Sort by total count descending
    const sortedPlugins = Object.entries(summary.byPlugin)
      .sort((a, b) => b[1].total - a[1].total);

    for (const [plugin, counts] of sortedPlugins) {
      console.log(`  ${plugin.padEnd(30)} ${counts.total.toString().padStart(3)} (${counts.commands} commands, ${counts.skills} skills)`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Validate expected count
    if (summary.totalSkills !== 206) {
      console.log(`⚠️  WARNING: Expected 206 skills, found ${summary.totalSkills}`);
      process.exit(1);
    } else {
      console.log('✅ Validation passed: All 206 skills captured\n');
    }
  }).catch(error => {
    console.error('Error collecting metadata:', error);
    process.exit(1);
  });
}

module.exports = { SkillMetadataCollector };
