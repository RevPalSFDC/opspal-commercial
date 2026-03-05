#!/usr/bin/env node

/**
 * Skill Tips Aggregator - ACE Framework Phase 2
 *
 * Extracts actionable tips from skill execution history.
 * Aggregates error patterns and success factors to provide
 * guidance for agents before task execution.
 *
 * Usage:
 *   node skill-tips-aggregator.js --skill cpq-assessment --limit 3
 *   node skill-tips-aggregator.js --agent sfdc-cpq-assessor --category assessment
 *
 * @version 1.0.0
 * @date 2025-12-13
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Supabase connection
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,

  // Aggregation settings
  LOOKBACK_DAYS: 30,
  MIN_EXECUTIONS_FOR_TIP: 3,
  MAX_TIPS: 5,

  // Error pattern thresholds
  ERROR_RATE_THRESHOLD: 0.2, // 20%+ failure rate triggers tip

  // Cache settings
  CACHE_TTL: 600, // 10 minutes
  CACHE_DIR: path.join(os.homedir(), '.claude', 'cache', 'ace-routing'),

  // Static tips by category (fallback)
  staticTips: {
    assessment: [
      'Capture screenshots for evidence before making changes',
      'Document current state baseline before audit begins',
      'Verify data quality before drawing conclusions'
    ],
    deployment: [
      'Run validation in sandbox before production deployment',
      'Create rollback plan before destructive operations',
      'Check dependencies and deployment order'
    ],
    validation: [
      'Verify all required fields are populated',
      'Check for circular dependencies before deployment',
      'Test in sandbox first'
    ],
    query: [
      'Add LIMIT clause to prevent governor limit issues',
      'Use indexed fields in WHERE clause',
      'Consider async processing for large datasets'
    ],
    automation: [
      'Test with bulk data (200+ records)',
      'Check for conflicting automations',
      'Verify entry criteria covers all scenarios'
    ],
    configuration: [
      'Check field-level security after creation',
      'Verify profile/permission set assignments',
      'Test with different user personas'
    ],
    troubleshooting: [
      'Check debug logs for detailed error traces',
      'Verify user has required permissions',
      'Test with minimum reproducible case'
    ]
  }
};

// ============================================================================
// SKILL TIPS AGGREGATOR CLASS
// ============================================================================

class SkillTipsAggregator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.skillId = options.skill || null;
    this.agent = options.agent || null;
    this.category = options.category || null;
    this.limit = options.limit || CONFIG.MAX_TIPS;

    // Ensure cache directory exists
    if (!fs.existsSync(CONFIG.CACHE_DIR)) {
      fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
    }

    this.log('Initialized', { skill: this.skillId, agent: this.agent, category: this.category });
  }

  /**
   * Get aggregated tips
   * @returns {Object} Tips with metadata
   */
  async getTips() {
    try {
      // Check cache first
      const cached = this.getFromCache();
      if (cached) {
        this.log('Using cached tips');
        return cached;
      }

      // Try to get data-driven tips from execution history
      const dataDrivenTips = await this.getDataDrivenTips();

      // Get static tips as fallback/supplement
      const staticTips = this.getStaticTips();

      // Merge tips (data-driven first, then static to fill)
      const mergedTips = this.mergeTips(dataDrivenTips, staticTips);

      const result = {
        tips: mergedTips.slice(0, this.limit),
        source: dataDrivenTips.length > 0 ? 'data-driven' : 'static',
        totalDataDriven: dataDrivenTips.length,
        totalStatic: staticTips.length,
        skill: this.skillId,
        agent: this.agent,
        category: this.category,
        timestamp: new Date().toISOString()
      };

      // Cache the result
      this.saveToCache(result);

      return result;

    } catch (error) {
      this.log(`Error getting tips: ${error.message}`);

      // Return static tips on error
      return {
        tips: this.getStaticTips().slice(0, this.limit),
        source: 'static-fallback',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get data-driven tips from execution history
   */
  async getDataDrivenTips() {
    if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
      this.log('Supabase not configured, skipping data-driven tips');
      return [];
    }

    try {
      // Query recent executions
      const executions = await this.queryExecutions();

      if (executions.length < CONFIG.MIN_EXECUTIONS_FOR_TIP) {
        this.log(`Not enough executions (${executions.length}) for data-driven tips`);
        return [];
      }

      // Analyze patterns
      const tips = [];

      // Tip 1: Error type patterns
      const errorTips = this.analyzeErrorPatterns(executions);
      tips.push(...errorTips);

      // Tip 2: Success factors
      const successTips = this.analyzeSuccessFactors(executions);
      tips.push(...successTips);

      // Tip 3: Duration insights
      const durationTips = this.analyzeDurationPatterns(executions);
      tips.push(...durationTips);

      return tips;

    } catch (error) {
      this.log(`Error querying executions: ${error.message}`);
      return [];
    }
  }

  /**
   * Query skill executions from Supabase
   */
  async queryExecutions() {
    const since = new Date(Date.now() - CONFIG.LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let filter = `created_at=gte.${since}`;

    if (this.skillId) {
      filter += `&skill_id=eq.${encodeURIComponent(this.skillId)}`;
    }
    if (this.agent) {
      filter += `&agent=eq.${encodeURIComponent(this.agent)}`;
    }

    const url = `${CONFIG.supabaseUrl}/rest/v1/skill_executions?${filter}&order=created_at.desc&limit=100&select=*`;

    const curlCmd = `curl -s -H "apikey: ${CONFIG.supabaseKey}" -H "Authorization: Bearer ${CONFIG.supabaseKey}" "${url}"`;

    try {
      const output = execSync(curlCmd, { encoding: 'utf-8', timeout: 5000 });
      return JSON.parse(output) || [];
    } catch (error) {
      this.log(`Query failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Analyze error patterns to generate tips
   */
  analyzeErrorPatterns(executions) {
    const tips = [];
    const failures = executions.filter(e => !e.success);

    if (failures.length === 0) return tips;

    const errorRate = failures.length / executions.length;

    // High error rate warning
    if (errorRate >= CONFIG.ERROR_RATE_THRESHOLD) {
      tips.push({
        text: `This skill has ${Math.round(errorRate * 100)}% failure rate - proceed carefully`,
        type: 'warning',
        confidence: 0.9
      });
    }

    // Group by error type
    const errorTypes = {};
    for (const failure of failures) {
      const errorType = failure.error_type || 'unknown';
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    }

    // Find most common error type
    const sortedErrors = Object.entries(errorTypes).sort((a, b) => b[1] - a[1]);
    if (sortedErrors.length > 0 && sortedErrors[0][1] >= 2) {
      const [topError, count] = sortedErrors[0];
      const errorTipMap = {
        'permission': 'Verify user has required permissions before proceeding',
        'validation': 'Check all required fields are populated and valid',
        'dependency': 'Verify dependencies are deployed in correct order',
        'timeout': 'Consider breaking into smaller operations',
        'governor_limit': 'Optimize queries and use bulk operations',
        'data_quality': 'Validate input data quality before processing',
        'api_error': 'Check API connectivity and rate limits',
        'unknown': 'Review error logs for detailed diagnosis'
      };

      const tip = errorTipMap[topError] || `Watch for ${topError} errors (${count} occurrences)`;
      tips.push({
        text: tip,
        type: 'error-pattern',
        errorType: topError,
        count,
        confidence: Math.min(0.9, 0.5 + (count / 10))
      });
    }

    return tips;
  }

  /**
   * Analyze success factors
   */
  analyzeSuccessFactors(executions) {
    const tips = [];
    const successes = executions.filter(e => e.success);

    if (successes.length < 3) return tips;

    const successRate = successes.length / executions.length;

    // High success rate encouragement
    if (successRate >= 0.9) {
      tips.push({
        text: `This skill has ${Math.round(successRate * 100)}% success rate - well-established pattern`,
        type: 'success',
        confidence: 0.8
      });
    }

    return tips;
  }

  /**
   * Analyze duration patterns
   */
  analyzeDurationPatterns(executions) {
    const tips = [];

    const withDuration = executions.filter(e => e.duration_ms && e.duration_ms > 0);
    if (withDuration.length < 3) return tips;

    const avgDuration = withDuration.reduce((sum, e) => sum + e.duration_ms, 0) / withDuration.length;
    const maxDuration = Math.max(...withDuration.map(e => e.duration_ms));

    // Long duration warning
    if (avgDuration > 30000) { // > 30 seconds average
      tips.push({
        text: `Average execution time is ${Math.round(avgDuration / 1000)}s - plan for longer operations`,
        type: 'duration',
        confidence: 0.7
      });
    }

    // High variance warning
    if (maxDuration > avgDuration * 3) {
      tips.push({
        text: 'Execution time varies significantly - may depend on data volume',
        type: 'duration-variance',
        confidence: 0.6
      });
    }

    return tips;
  }

  /**
   * Get static tips by category
   */
  getStaticTips() {
    const category = this.category || this.detectCategory();

    if (category && CONFIG.staticTips[category]) {
      return CONFIG.staticTips[category].map(text => ({
        text,
        type: 'static',
        category,
        confidence: 0.5
      }));
    }

    // Default tips
    return [
      { text: 'Verify prerequisites before proceeding', type: 'static', confidence: 0.4 },
      { text: 'Test in sandbox before production', type: 'static', confidence: 0.4 },
      { text: 'Document changes for audit trail', type: 'static', confidence: 0.4 }
    ];
  }

  /**
   * Detect category from skill or agent name
   */
  detectCategory() {
    const searchText = `${this.skillId || ''} ${this.agent || ''}`.toLowerCase();

    for (const [category, tips] of Object.entries(CONFIG.staticTips)) {
      if (searchText.includes(category)) return category;
    }

    // Additional keyword matching
    if (searchText.match(/audit|assess|review/)) return 'assessment';
    if (searchText.match(/deploy|release|push/)) return 'deployment';
    if (searchText.match(/valid|check|verify/)) return 'validation';
    if (searchText.match(/query|report|data/)) return 'query';
    if (searchText.match(/flow|trigger|automat/)) return 'automation';
    if (searchText.match(/field|object|layout/)) return 'configuration';
    if (searchText.match(/debug|fix|error/)) return 'troubleshooting';

    return null;
  }

  /**
   * Merge data-driven and static tips
   */
  mergeTips(dataDriven, staticTips) {
    // Sort by confidence
    const sorted = [...dataDriven, ...staticTips]
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // Dedupe by text similarity
    const seen = new Set();
    const unique = [];

    for (const tip of sorted) {
      const key = tip.text.toLowerCase().substring(0, 30);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(tip);
      }
    }

    return unique;
  }

  /**
   * Get cached tips if valid
   */
  getFromCache() {
    const cacheKey = this.getCacheKey();
    const cachePath = path.join(CONFIG.CACHE_DIR, `tips_${cacheKey}.json`);

    try {
      if (!fs.existsSync(cachePath)) return null;

      const stat = fs.statSync(cachePath);
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;

      if (ageSeconds > CONFIG.CACHE_TTL) {
        this.log('Cache expired');
        return null;
      }

      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      cached._cached = true;
      return cached;

    } catch (error) {
      this.log(`Cache read error: ${error.message}`);
      return null;
    }
  }

  /**
   * Save tips to cache
   */
  saveToCache(result) {
    const cacheKey = this.getCacheKey();
    const cachePath = path.join(CONFIG.CACHE_DIR, `tips_${cacheKey}.json`);

    try {
      fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
      this.log(`Cached to ${cachePath}`);
    } catch (error) {
      this.log(`Cache write error: ${error.message}`);
    }
  }

  /**
   * Generate cache key
   */
  getCacheKey() {
    return `${this.skillId || 'all'}_${this.agent || 'all'}_${this.category || 'all'}`
      .replace(/[^a-z0-9_]/gi, '_');
  }

  /**
   * Log message if verbose
   */
  log(message, data = null) {
    if (this.verbose) {
      if (data) {
        console.error(`[skill-tips-aggregator] ${message}:`, JSON.stringify(data));
      } else {
        console.error(`[skill-tips-aggregator] ${message}`);
      }
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function parseArgs(args) {
  const options = {
    skill: null,
    agent: null,
    category: null,
    limit: CONFIG.MAX_TIPS,
    format: 'json',
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--skill' && args[i + 1]) {
      options.skill = args[++i];
    } else if (arg === '--agent' && args[i + 1]) {
      options.agent = args[++i];
    } else if (arg === '--category' && args[i + 1]) {
      options.category = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i]);
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Skill Tips Aggregator - ACE Framework Phase 2

Extracts actionable tips from skill execution history.

Usage:
  node skill-tips-aggregator.js [options]

Options:
  --skill <id>        Skill ID to get tips for
  --agent <name>      Agent name to get tips for
  --category <name>   Category to filter tips
  --limit <n>         Maximum tips to return (default: 5)
  --format <type>     Output format: json (default), text
  --verbose, -v       Show debug output to stderr
  --help, -h          Show this help message

Categories:
  assessment, deployment, validation, query,
  automation, configuration, troubleshooting

Examples:
  # Get tips for a skill
  node skill-tips-aggregator.js --skill cpq-assessment

  # Get tips for an agent
  node skill-tips-aggregator.js --agent sfdc-cpq-assessor

  # Get tips by category
  node skill-tips-aggregator.js --category deployment --limit 3

  # Text format output
  node skill-tips-aggregator.js --skill pre-deploy-check --format text
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  try {
    const aggregator = new SkillTipsAggregator(options);
    const result = await aggregator.getTips();

    if (options.format === 'text') {
      console.log('Tips:');
      for (const tip of result.tips) {
        console.log(`  → ${tip.text}`);
      }
      console.log(`\nSource: ${result.source}`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run CLI
if (require.main === module) {
  main();
}

module.exports = { SkillTipsAggregator, CONFIG };
