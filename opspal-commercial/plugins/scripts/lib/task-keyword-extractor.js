/**
 * Extracts keywords from task descriptions to determine relevant plugins/skills
 *
 * Usage:
 *   const extractor = new TaskKeywordExtractor("Run CPQ assessment for eta-corp");
 *   const keywords = extractor.extract();
 *   console.log(keywords); // { platforms: ['salesforce'], operations: ['audit'], domains: ['cpq'] }
 */

class TaskKeywordExtractor {
  constructor(taskDescription) {
    this.text = (taskDescription || '').toLowerCase();
    this.keywords = {
      platforms: [],
      operations: [],
      domains: []
    };
  }

  extract() {
    this.extractPlatforms();
    this.extractOperations();
    this.extractDomains();
    return this.keywords;
  }

  extractPlatforms() {
    const platformMap = {
      salesforce: ['salesforce', 'sfdc', 'apex', 'lightning', 'cpq', 'q2c', 'territory', 'revops', 'opportunity', 'pipeline', 'forecast'],
      hubspot: ['hubspot', 'hs', 'deal'],
      marketo: ['marketo', 'mql'],
      monday: ['monday'],
      'cross-platform': ['diagram', 'flowchart', 'erd', 'pdf', 'dashboard', 'sync', 'between']
    };

    for (const [platform, keywords] of Object.entries(platformMap)) {
      if (keywords.some(kw => this.text.includes(kw))) {
        if (!this.keywords.platforms.includes(platform)) {
          this.keywords.platforms.push(platform);
        }
      }
    }

    // Default to cross-platform if no specific platform detected
    if (this.keywords.platforms.length === 0) {
      this.keywords.platforms.push('cross-platform');
    }
  }

  extractOperations() {
    const operationMap = {
      import: ['import', 'upload', 'load', 'ingest'],
      export: ['export', 'download', 'extract', 'backup'],
      audit: ['audit', 'assess', 'analyze', 'review', 'evaluate'],
      deploy: ['deploy', 'release', 'publish', 'activate'],
      optimize: ['optimize', 'improve', 'enhance', 'tune'],
      create: ['create', 'build', 'generate', 'add'],
      update: ['update', 'modify', 'change', 'edit'],
      delete: ['delete', 'remove', 'clean', 'purge'],
      sync: ['sync', 'synchronize', 'integrate', 'connect'],
      test: ['test', 'validate', 'verify', 'check']
    };

    for (const [operation, keywords] of Object.entries(operationMap)) {
      if (keywords.some(kw => this.text.includes(kw))) {
        if (!this.keywords.operations.includes(operation)) {
          this.keywords.operations.push(operation);
        }
      }
    }
  }

  extractDomains() {
    const domainMap = {
      cpq: ['cpq', 'quote', 'pricing', 'q2c', 'configure price quote'],
      revops: ['revops', 'revenue', 'pipeline', 'forecast', 'sales ops'],
      workflow: ['workflow', 'automation', 'process', 'flow'],
      data: ['data', 'record', 'field', 'object', 'csv'],
      territory: ['territory', 'assignment', 'routing'],
      security: ['security', 'permission', 'profile', 'access'],
      reporting: ['report', 'dashboard', 'analytics', 'metrics'],
      integration: ['integration', 'api', 'webhook', 'connector'],
      migration: ['migration', 'migrate', 'transfer', 'move'],
      cleanup: ['cleanup', 'deduplicate', 'dedup', 'merge', 'consolidate']
    };

    for (const [domain, keywords] of Object.entries(domainMap)) {
      if (keywords.some(kw => this.text.includes(kw))) {
        if (!this.keywords.domains.includes(domain)) {
          this.keywords.domains.push(domain);
        }
      }
    }
  }

  /**
   * Get a relevance score for a given skill/command name and description
   * @param {string} skillName - Name of the skill
   * @param {string} skillDescription - Description of the skill
   * @returns {number} Score (0-200+)
   */
  calculateSkillRelevance(skillName, skillDescription) {
    let score = 0;
    const skillText = (skillName + ' ' + (skillDescription || '')).toLowerCase();

    // Exact platform match: +100
    if (this.keywords.platforms.some(p => skillText.includes(p))) {
      score += 100;
    }

    // Operation match: +50
    if (this.keywords.operations.some(op => skillText.includes(op))) {
      score += 50;
    }

    // Domain match: +30
    if (this.keywords.domains.some(d => skillText.includes(d))) {
      score += 30;
    }

    // Contains task keywords: +20
    const taskWords = this.text.split(/\s+/).filter(w => w.length > 4); // Words > 4 chars
    const matches = taskWords.filter(w => skillText.includes(w)).length;
    score += Math.min(matches * 10, 20); // Up to +20 for keyword matches

    return score;
  }
}

// CLI usage
if (require.main === module) {
  const taskDesc = process.argv[2] || 'Run CPQ assessment for eta-corp';
  const extractor = new TaskKeywordExtractor(taskDesc);
  const keywords = extractor.extract();

  console.log('Task:', taskDesc);
  console.log('Extracted Keywords:', JSON.stringify(keywords, null, 2));
}

module.exports = { TaskKeywordExtractor };
