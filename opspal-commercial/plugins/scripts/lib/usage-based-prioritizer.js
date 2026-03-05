/**
 * Usage-Based Skill Prioritizer
 *
 * Enhances SkillFilter with usage-based prioritization.
 * Prioritizes frequently-used skills (hot path) over rarely-used skills (cold path).
 *
 * Usage:
 *   const prioritizer = new UsageBasedPrioritizer(skillFilter, usageTracker);
 *   const prioritizedSkills = prioritizer.prioritizeSkills();
 */

const { SkillUsageTracker } = require('./skill-usage-tracker');

class UsageBasedPrioritizer {
  constructor(skillFilter, usageTracker = null) {
    this.skillFilter = skillFilter;
    this.usageTracker = usageTracker || new SkillUsageTracker();
    this.hotPathSize = 50; // Top 50 skills are "hot path"
    this.usageBonus = 20; // Bonus points for hot path skills
  }

  /**
   * Prioritize skills based on usage frequency
   * @returns {Object} Map of plugin → prioritized skill list
   */
  prioritizeSkills() {
    // Get base filtered skills from SkillFilter
    const baseFilteredSkills = this.skillFilter.filteredSkills;
    const hotPathSkills = this.usageTracker.getHotPathSkills(this.hotPathSize);

    const prioritizedSkills = {};

    for (const [plugin, skills] of Object.entries(baseFilteredSkills)) {
      const hotPathForPlugin = hotPathSkills[plugin] || [];

      // Separate hot path and cold path skills
      const hot = [];
      const cold = [];

      for (const skill of skills) {
        if (hotPathForPlugin.includes(skill.name)) {
          hot.push(skill);
        } else {
          cold.push(skill);
        }
      }

      // Prioritize hot path skills first, then cold path
      prioritizedSkills[plugin] = [...hot, ...cold];
    }

    return prioritizedSkills;
  }

  /**
   * Calculate adjusted relevance score with usage bonus
   * @param {Object} skill - Skill metadata
   * @param {number} baseScore - Base relevance score from SkillFilter
   * @returns {number} Adjusted score
   */
  calculateAdjustedScore(skill, baseScore) {
    const isHotPath = this.usageTracker.isHotPath(skill.plugin || 'unknown', skill.name, this.hotPathSize);
    return isHotPath ? baseScore + this.usageBonus : baseScore;
  }

  /**
   * Get hot path skills for selected plugins
   * @returns {Object} Map of plugin → hot path skill names
   */
  getHotPathSkills() {
    const allHotPath = this.usageTracker.getHotPathSkills(this.hotPathSize);
    const selectedPlugins = this.skillFilter.selectedPlugins;

    const filteredHotPath = {};
    for (const plugin of selectedPlugins) {
      if (allHotPath[plugin]) {
        filteredHotPath[plugin] = allHotPath[plugin];
      }
    }

    return filteredHotPath;
  }

  /**
   * Get cold path skills for selected plugins
   * @returns {Object} Map of plugin → cold path skill names
   */
  getColdPathSkills() {
    const allHotPath = this.usageTracker.getHotPathSkills(this.hotPathSize);
    const allSkills = this.skillFilter.filteredSkills;

    const coldPath = {};
    for (const [plugin, skills] of Object.entries(allSkills)) {
      const hotPathForPlugin = allHotPath[plugin] || [];
      coldPath[plugin] = skills
        .filter(s => !hotPathForPlugin.includes(s.name))
        .map(s => s.name);
    }

    return coldPath;
  }

  /**
   * Estimate additional token savings from hot path loading
   * @returns {Object} Savings breakdown
   */
  estimateAdditionalSavings() {
    const baseFilteredSkills = this.skillFilter.filteredSkills;
    const hotPathSkills = this.getHotPathSkills();

    let totalSkillsInFiltered = 0;
    let hotPathCount = 0;

    for (const [plugin, skills] of Object.entries(baseFilteredSkills)) {
      totalSkillsInFiltered += skills.length;
      hotPathCount += (hotPathSkills[plugin] || []).length;
    }

    const coldPathCount = totalSkillsInFiltered - hotPathCount;
    const avgTokensPerSkill = 335;

    // In production, cold path skills would be lazy-loaded on demand
    // For estimation, assume 30% of cold path skills are never needed
    const unnecessaryColdPathSkills = Math.round(coldPathCount * 0.3);
    const savedTokens = unnecessaryColdPathSkills * avgTokensPerSkill;

    return {
      totalFilteredSkills: totalSkillsInFiltered,
      hotPathSkills: hotPathCount,
      coldPathSkills: coldPathCount,
      unnecessaryColdPathSkills,
      savedTokens,
      savingsPercent: ((unnecessaryColdPathSkills / totalSkillsInFiltered) * 100).toFixed(1) + '%'
    };
  }

  /**
   * Get usage statistics for filtered skills
   * @returns {Object} Usage stats
   */
  getFilteredSkillsUsageStats() {
    const baseFilteredSkills = this.skillFilter.filteredSkills;
    const stats = this.usageTracker.getUsageStats();

    const filteredUsage = {};
    let totalUses = 0;

    for (const [plugin, skills] of Object.entries(baseFilteredSkills)) {
      filteredUsage[plugin] = [];

      for (const skill of skills) {
        const key = `${plugin}:${skill.name}`;
        const count = stats.skillCounts[key] || 0;
        totalUses += count;

        filteredUsage[plugin].push({
          skill: skill.name,
          uses: count,
          isHotPath: this.usageTracker.isHotPath(plugin, skill.name, this.hotPathSize)
        });
      }

      // Sort by usage count
      filteredUsage[plugin].sort((a, b) => b.uses - a.uses);
    }

    return {
      byPlugin: filteredUsage,
      totalUses
    };
  }
}

// CLI usage
if (require.main === module) {
  const { PluginSelector } = require('./plugin-selector');
  const { SkillFilter } = require('./skill-filter');

  const taskDesc = process.argv[2];

  if (!taskDesc) {
    console.error('Usage: node usage-based-prioritizer.js "<task description>"');
    console.error('Example: node usage-based-prioritizer.js "Run CPQ assessment"');
    process.exit(1);
  }

  // Step 1: Select plugins
  const pluginSelector = new PluginSelector(taskDesc);
  const selectedPlugins = pluginSelector.selectPlugins();

  // Step 2: Filter skills
  const skillFilter = new SkillFilter(taskDesc, selectedPlugins);
  skillFilter.filterSkills();

  // Step 3: Apply usage-based prioritization
  const prioritizer = new UsageBasedPrioritizer(skillFilter);
  const prioritizedSkills = prioritizer.prioritizeSkills();
  const additionalSavings = prioritizer.estimateAdditionalSavings();
  const usageStats = prioritizer.getFilteredSkillsUsageStats();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('USAGE-BASED PRIORITIZATION RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\nTask: ${taskDesc}`);
  console.log(`Selected Plugins: ${selectedPlugins.join(', ')}\n`);

  console.log('Hot Path vs Cold Path Breakdown:');
  console.log(`  Total filtered skills: ${additionalSavings.totalFilteredSkills}`);
  console.log(`  Hot path (frequently used): ${additionalSavings.hotPathSkills}`);
  console.log(`  Cold path (rarely used): ${additionalSavings.coldPathSkills}`);
  console.log(`  Estimated unnecessary cold path: ${additionalSavings.unnecessaryColdPathSkills}`);
  console.log(`  Additional token savings: ~${additionalSavings.savedTokens} tokens (${additionalSavings.savingsPercent})\n`);

  console.log('Prioritized Skills by Plugin:');
  for (const [plugin, skills] of Object.entries(prioritizedSkills)) {
    console.log(`\n  ${plugin}:`);
    const pluginUsage = usageStats.byPlugin[plugin] || [];

    skills.slice(0, 10).forEach((skill, i) => {
      const usage = pluginUsage.find(u => u.skill === skill.name);
      const hotLabel = usage?.isHotPath ? '🔥 HOT' : '❄️  COLD';
      const useCount = usage?.uses || 0;
      console.log(`    ${(i + 1).toString().padStart(2)}. ${skill.name.padEnd(30)} ${hotLabel} (${useCount} uses)`);
    });

    if (skills.length > 10) {
      console.log(`    ... and ${skills.length - 10} more skills`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

module.exports = { UsageBasedPrioritizer };
