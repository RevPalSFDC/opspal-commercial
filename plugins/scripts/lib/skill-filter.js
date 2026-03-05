/**
 * Skill Filter - Filters skills within selected plugins based on task relevance
 *
 * Usage:
 *   const filter = new SkillFilter(taskDescription, selectedPlugins);
 *   const filteredSkills = filter.filterSkills();
 *   const savings = filter.estimateTokenSavings();
 */

const fs = require('fs');
const path = require('path');
const { TaskKeywordExtractor } = require('./task-keyword-extractor');

class SkillFilter {
  constructor(taskDescription, selectedPlugins = []) {
    this.taskDescription = taskDescription;
    this.selectedPlugins = selectedPlugins;
    this.extractor = new TaskKeywordExtractor(taskDescription);
    this.keywords = this.extractor.extract();
    this.metadata = this.loadMetadata();
    this.filteredSkills = {};
    this.scores = {};
  }

  /**
   * Load skill metadata from generated JSON file
   */
  loadMetadata() {
    const metadataPath = path.join(__dirname, 'skill-metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Skill metadata not found at ${metadataPath}. Run skill-metadata-collector.js first.`);
    }
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  }

  /**
   * Filter skills for selected plugins based on relevance
   * @returns {Object} Map of plugin → filtered skill list
   */
  filterSkills() {
    for (const plugin of this.selectedPlugins) {
      const skills = this.metadata[plugin] || [];
      const scoredSkills = this.scoreSkills(skills);
      const topN = this.getTopNForPlugin(plugin);
      const minScore = this.getMinScoreForPlugin(plugin);

      // Filter by min score and select top N
      const filtered = scoredSkills
        .filter(s => s.score >= minScore)
        .slice(0, topN);

      // Ensure minimum skills loaded (fallback to top skills if too few match)
      const minimumSkills = Math.min(10, skills.length);
      if (filtered.length < minimumSkills) {
        const topSkills = scoredSkills.slice(0, minimumSkills);
        this.filteredSkills[plugin] = topSkills.map(s => s.skill);
        this.scores[plugin] = topSkills;
      } else {
        this.filteredSkills[plugin] = filtered.map(s => s.skill);
        this.scores[plugin] = filtered;
      }
    }

    return this.filteredSkills;
  }

  /**
   * Score all skills in a plugin based on relevance to task
   */
  scoreSkills(skills) {
    const scoredSkills = skills.map(skill => ({
      skill,
      score: this.calculateRelevance(skill)
    }));

    // Sort by score descending
    return scoredSkills.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate relevance score for a skill
   * @param {Object} skill - Skill metadata object
   * @returns {number} Score (0-200+)
   */
  calculateRelevance(skill) {
    let score = 0;
    const skillText = `${skill.name} ${skill.description}`.toLowerCase();

    // Platform match: +100
    // Check if any task platform matches skill keywords
    for (const platform of this.keywords.platforms) {
      if (skill.keywords.includes(platform)) {
        score += 100;
        break;
      }
    }

    // Operation match: +50
    // Check if any task operation matches skill keywords
    for (const operation of this.keywords.operations) {
      if (skill.keywords.includes(operation)) {
        score += 50;
        break;
      }
    }

    // Domain match: +30
    // Check if any task domain matches skill keywords
    for (const domain of this.keywords.domains) {
      if (skill.keywords.includes(domain)) {
        score += 30;
        break;
      }
    }

    // Task word match: +10 per match (max +20)
    const taskWords = this.taskDescription
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4); // Words > 4 chars

    let wordMatches = 0;
    for (const word of taskWords) {
      if (skillText.includes(word)) {
        wordMatches++;
      }
    }
    score += Math.min(wordMatches * 10, 20);

    // Usage frequency bonus (if available in metadata)
    if (skill.usageCount && skill.usageCount > 10) {
      score += 20;
    }

    return score;
  }

  /**
   * Get number of skills to load for a plugin
   * @param {string} pluginName
   * @returns {number}
   */
  getTopNForPlugin(pluginName) {
    // These values match the plugin-selector.js configuration
    const baselineSkillCounts = {
      'salesforce-plugin': 20,
      'hubspot-plugin': 12,
      'opspal-core': 15,
      'marketo-plugin': 19,
      'monday-plugin': 1,
      'gtm-planning-plugin': 2,
      'ai-consult-plugin': 2,
      'data-hygiene-plugin': 2,
      'developer-tools-plugin': 10
    };
    return baselineSkillCounts[pluginName] || 10;
  }

  /**
   * Get minimum relevance score for skill loading
   * @param {string} pluginName
   * @returns {number}
   */
  getMinScoreForPlugin(pluginName) {
    // These values match the plugin-selector.js configuration
    const minScores = {
      'salesforce-plugin': 30,
      'hubspot-plugin': 30,
      'opspal-core': 30,
      'marketo-plugin': 50,
      'monday-plugin': 50,
      'gtm-planning-plugin': 50,
      'ai-consult-plugin': 50,
      'data-hygiene-plugin': 50,
      'developer-tools-plugin': 40
    };
    return minScores[pluginName] || 40;
  }

  /**
   * Estimate token savings from skill filtering
   * @returns {Object} Savings breakdown
   */
  estimateTokenSavings() {
    const avgTokensPerSkill = 335;

    // Calculate total skills in selected plugins without filtering
    let totalSkillsInSelectedPlugins = 0;
    for (const plugin of this.selectedPlugins) {
      const skills = this.metadata[plugin] || [];
      totalSkillsInSelectedPlugins += skills.length;
    }

    // Calculate loaded skills after filtering
    let loadedSkills = 0;
    for (const plugin of this.selectedPlugins) {
      loadedSkills += (this.filteredSkills[plugin] || []).length;
    }

    const savedSkills = totalSkillsInSelectedPlugins - loadedSkills;
    const savedTokens = savedSkills * avgTokensPerSkill;
    const savingsPercent = totalSkillsInSelectedPlugins > 0
      ? ((savedSkills / totalSkillsInSelectedPlugins) * 100).toFixed(1)
      : '0.0';

    return {
      totalSkillsInSelectedPlugins,
      loadedSkills,
      savedSkills,
      savedTokens,
      savingsPercent: `${savingsPercent}%`
    };
  }

  /**
   * Get detailed breakdown of filtered skills with scores
   * @returns {Object} Detailed breakdown by plugin
   */
  getDetailedBreakdown() {
    const breakdown = {};

    for (const plugin of this.selectedPlugins) {
      const allSkills = this.metadata[plugin] || [];
      const scoredSkills = this.scores[plugin] || [];
      const loadedSkills = this.filteredSkills[plugin] || [];

      breakdown[plugin] = {
        totalSkills: allSkills.length,
        loadedSkills: loadedSkills.length,
        topSkills: scoredSkills.slice(0, 5).map(s => ({
          name: s.skill.name,
          score: s.score,
          description: s.skill.description.substring(0, 80) + '...'
        }))
      };
    }

    return breakdown;
  }
}

// CLI usage
if (require.main === module) {
  const taskDesc = process.argv[2];
  const pluginsArg = process.argv[3];

  if (!taskDesc || !pluginsArg) {
    console.error('Usage: node skill-filter.js "<task description>" "<plugin1,plugin2>"');
    console.error('Example: node skill-filter.js "Run CPQ assessment" "salesforce-plugin,opspal-core"');
    process.exit(1);
  }

  const selectedPlugins = pluginsArg.split(',').map(p => p.trim());
  const filter = new SkillFilter(taskDesc, selectedPlugins);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SKILL FILTER RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\nTask: ${taskDesc}`);
  console.log(`Selected Plugins: ${selectedPlugins.join(', ')}\n`);

  const filteredSkills = filter.filterSkills();
  const savings = filter.estimateTokenSavings();
  const breakdown = filter.getDetailedBreakdown();

  console.log('Filtered Skills by Plugin:');
  for (const [plugin, skills] of Object.entries(filteredSkills)) {
    console.log(`\n  ${plugin}:`);
    console.log(`    Loaded: ${skills.length}/${breakdown[plugin].totalSkills} skills`);
    console.log(`    Top 5 by relevance:`);
    breakdown[plugin].topSkills.forEach((skill, i) => {
      console.log(`      ${i + 1}. ${skill.name.padEnd(30)} (score: ${skill.score})`);
      console.log(`         ${skill.description}`);
    });
  }

  console.log('\n\nToken Savings:');
  console.log(`  Total skills in selected plugins: ${savings.totalSkillsInSelectedPlugins}`);
  console.log(`  Loaded skills after filtering: ${savings.loadedSkills}`);
  console.log(`  Saved skills: ${savings.savedSkills}`);
  console.log(`  Saved tokens: ~${savings.savedTokens} tokens (${savings.savingsPercent})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

module.exports = { SkillFilter };
