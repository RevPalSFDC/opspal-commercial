/**
 * Selects relevant plugins based on task description keywords
 *
 * Usage:
 *   const selector = new PluginSelector("Run CPQ assessment for eta-corp");
 *   const plugins = selector.selectPlugins();
 *   console.log(plugins); // ['salesforce-plugin', 'opspal-core']
 */

const { TaskKeywordExtractor } = require('./task-keyword-extractor');

class PluginSelector {
  constructor(taskDescription) {
    this.extractor = new TaskKeywordExtractor(taskDescription);
    this.keywords = this.extractor.extract();
    this.text = taskDescription.toLowerCase();
    this.plugins = [];
  }

  /**
   * Select plugins based on task keywords
   * @returns {string[]} Array of plugin names to load
   */
  selectPlugins() {
    // Tier 1: Core plugins (always consider, but may skip if clearly not needed)
    const corePlugins = ['salesforce-plugin', 'hubspot-plugin', 'opspal-core'];

    // Start with detected platforms
    if (this.keywords.platforms.includes('salesforce')) {
      this.plugins.push('salesforce-plugin');
    }
    if (this.keywords.platforms.includes('hubspot')) {
      this.plugins.push('hubspot-plugin');
    }
    if (this.keywords.platforms.includes('cross-platform')) {
      this.plugins.push('opspal-core');
    }

    // Check for platform-ambiguous objects that could be either SF or HS
    const hasLead = /\blead\b/i.test(this.text);
    const hasContact = /\bcontact\b/i.test(this.text);
    const hasAccount = /\baccount\b/i.test(this.text);
    const hasDeal = /\bdeal\b/i.test(this.text);

    // If task mentions both SF and HS objects, or is ambiguous about platform
    if ((hasLead || hasContact || hasAccount) && !this.text.includes('salesforce') && !this.text.includes('hubspot')) {
      // Ambiguous - could be either platform
      // Check operation context
      if (this.keywords.operations.includes('import') || this.keywords.operations.includes('export')) {
        // Data operations - likely need both platforms
        if (!this.plugins.includes('salesforce-plugin')) this.plugins.push('salesforce-plugin');
        if (!this.plugins.includes('hubspot-plugin')) this.plugins.push('hubspot-plugin');
      }
    }

    // Check for sync/integration keywords that suggest cross-platform
    if (/\b(sync|synchronize|integrate|between|across)\b/i.test(this.text)) {
      if (!this.plugins.includes('opspal-core')) {
        this.plugins.push('opspal-core');
      }
    }

    // Check for analysis/audit that might need reporting
    if (this.keywords.operations.includes('audit') || /\b(analyze|assessment|report)\b/i.test(this.text)) {
      if (!this.plugins.includes('opspal-core')) {
        this.plugins.push('opspal-core');
      }
    }

    // Tier 2: Specialized plugins (load only if keywords match)
    if (this.keywords.platforms.includes('marketo') ||
        this.text.includes('marketo') ||
        this.text.includes('mql')) {
      this.plugins.push('marketo-plugin');
    }

    if (this.keywords.platforms.includes('monday') ||
        (this.text.includes('monday') && !this.text.includes('monday.com')) ||
        (this.text.includes('board') && /\b(monday|project tracking|kanban)\b/i.test(this.text))) {
      this.plugins.push('monday-plugin');
    }

    // GTM Planning
    if (this.text.includes('gtm') ||
        this.text.includes('go-to-market') ||
        this.text.includes('launch strategy')) {
      this.plugins.push('gtm-planning-plugin');
    }

    // AI Consulting
    if (this.text.match(/\bai\b/) || // Word boundary for "ai" to avoid false matches
        this.text.includes('consult') ||
        this.text.includes('strategy assessment')) {
      this.plugins.push('ai-consult-plugin');
    }

    // Data Hygiene
    if (this.keywords.operations.includes('cleanup') ||
        this.keywords.domains.includes('cleanup') ||
        this.text.includes('deduplicate') ||
        this.text.includes('dedup') ||
        this.text.includes('data quality')) {
      this.plugins.push('data-hygiene-plugin');

      // Deduplication across systems needs both SF and HS
      if (/\b(across|all systems|both|multiple)\b/i.test(this.text)) {
        if (!this.plugins.includes('salesforce-plugin')) this.plugins.push('salesforce-plugin');
        if (!this.plugins.includes('hubspot-plugin')) this.plugins.push('hubspot-plugin');
      }
    }

    // Special handling for generic/ambiguous tasks
    if (this.plugins.length === 0 ||
        (this.plugins.length === 1 && this.plugins[0] === 'opspal-core' &&
         /\b(help|project|task|work)\b/i.test(this.text))) {
      // Very generic task - load core 3
      this.plugins = corePlugins;
    }

    // Remove duplicates
    this.plugins = [...new Set(this.plugins)];

    return this.plugins;
  }

  /**
   * Get skill filter configuration for each selected plugin
   * @returns {Object} Map of plugin name → skill filter config
   */
  getSkillFilters() {
    const filters = {};

    this.plugins.forEach(plugin => {
      filters[plugin] = {
        keywords: this.keywords,
        topN: this.getTopNForPlugin(plugin),
        minScore: this.getMinScoreForPlugin(plugin)
      };
    });

    return filters;
  }

  /**
   * Get number of skills to load for a plugin
   * @param {string} pluginName
   * @returns {number}
   */
  getTopNForPlugin(pluginName) {
    // Higher topN for larger plugins, lower for smaller
    const baselineSkillCounts = {
      'salesforce-plugin': 20,     // Top 20 of 68 (~29%)
      'hubspot-plugin': 12,         // Top 12 of 27 (~44%)
      'opspal-core': 15,  // Top 15 of 74 (~20%)
      'marketo-plugin': 19,         // All skills (small plugin)
      'monday-plugin': 1,           // All skills (tiny plugin)
      'gtm-planning-plugin': 2,     // All skills (tiny plugin)
      'ai-consult-plugin': 2,       // All skills (tiny plugin)
      'data-hygiene-plugin': 2      // All skills (tiny plugin)
    };
    return baselineSkillCounts[pluginName] || 10; // Default to top 10
  }

  /**
   * Get minimum relevance score for skill loading
   * @param {string} pluginName
   * @returns {number}
   */
  getMinScoreForPlugin(pluginName) {
    // Lower threshold for core plugins (more permissive)
    // Higher threshold for specialized plugins (more selective)
    const minScores = {
      'salesforce-plugin': 30,
      'hubspot-plugin': 30,
      'opspal-core': 30,
      'marketo-plugin': 50,
      'monday-plugin': 50,
      'gtm-planning-plugin': 50,
      'ai-consult-plugin': 50,
      'data-hygiene-plugin': 50
    };
    return minScores[pluginName] || 40;
  }

  /**
   * Estimate token savings from conditional loading
   * @returns {Object} Savings breakdown
   */
  estimateTokenSavings() {
    const totalPlugins = 9;
    const totalSkills = 206;
    const avgTokensPerSkill = 335;

    const loadedSkills = this.plugins.reduce((sum, plugin) => {
      return sum + this.getTopNForPlugin(plugin);
    }, 0);

    const savedSkills = totalSkills - loadedSkills;
    const savedTokens = savedSkills * avgTokensPerSkill;
    const savingsPercent = ((savedSkills / totalSkills) * 100).toFixed(1);

    return {
      totalSkills,
      loadedSkills,
      savedSkills,
      savedTokens,
      savingsPercent: `${savingsPercent}%`,
      loadedPlugins: this.plugins.length,
      totalPlugins
    };
  }
}

// CLI usage
if (require.main === module) {
  const taskDesc = process.argv[2] || 'Run CPQ assessment for eta-corp';
  const selector = new PluginSelector(taskDesc);

  const plugins = selector.selectPlugins();
  const filters = selector.getSkillFilters();
  const savings = selector.estimateTokenSavings();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PLUGIN SELECTION RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nTask:', taskDesc);
  console.log('\nSelected Plugins:', plugins.join(', '));
  console.log('\nSkill Filters:');
  Object.entries(filters).forEach(([plugin, config]) => {
    console.log(`  ${plugin}: top ${config.topN} skills (min score: ${config.minScore})`);
  });
  console.log('\nEstimated Token Savings:');
  console.log(`  Loading: ${savings.loadedSkills}/${savings.totalSkills} skills`);
  console.log(`  Saving: ${savings.savedSkills} skills = ~${savings.savedTokens} tokens (${savings.savingsPercent})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

module.exports = { PluginSelector };
