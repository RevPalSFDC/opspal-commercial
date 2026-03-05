#!/usr/bin/env node

/**
 * Skill Loader - ACE Framework Dynamic Skill Loading
 *
 * Dynamically loads and ranks skills based on task context, historical success,
 * and agent compatibility. Uses TF-IDF similarity for semantic matching.
 *
 * Features:
 * - Task-based skill retrieval
 * - TF-IDF similarity scoring
 * - Agent-specific skill filtering
 * - Confidence-weighted ranking
 * - Prompt context injection
 * - LRU caching for performance
 *
 * @version 1.0.0
 * @author ACE Framework
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Skill loading settings
  maxSkillsToLoad: parseInt(process.env.SKILL_MAX_LOAD || '5'),
  minRelevanceScore: parseFloat(process.env.SKILL_MIN_RELEVANCE || '0.3'),
  minConfidence: parseFloat(process.env.SKILL_MIN_CONFIDENCE || '0.5'),

  // Cache settings
  cacheEnabled: process.env.SKILL_CACHE_ENABLED !== '0',
  cacheTTLMs: parseInt(process.env.SKILL_CACHE_TTL || '300000'), // 5 minutes
  maxCacheSize: parseInt(process.env.SKILL_MAX_CACHE || '100'),

  // Paths
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,

  // Verbose logging
  verbose: process.env.SKILL_LOADER_VERBOSE === '1'
};

// ============================================================================
// TF-IDF Implementation
// ============================================================================

class TfIdfVectorizer {
  constructor() {
    this.vocabulary = new Map();
    this.idf = new Map();
    this.documentCount = 0;
  }

  /**
   * Tokenize text into normalized terms
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2)
      .map(term => term.replace(/^-+|-+$/g, ''));
  }

  /**
   * Calculate term frequency for a document
   */
  termFrequency(terms) {
    const tf = new Map();
    terms.forEach(term => {
      tf.set(term, (tf.get(term) || 0) + 1);
    });
    // Normalize by document length
    const maxFreq = Math.max(...tf.values());
    tf.forEach((freq, term) => {
      tf.set(term, freq / maxFreq);
    });
    return tf;
  }

  /**
   * Fit the vectorizer on a corpus of documents
   */
  fit(documents) {
    const docFreq = new Map();
    this.documentCount = documents.length;

    documents.forEach(doc => {
      const terms = new Set(this.tokenize(doc));
      terms.forEach(term => {
        if (!this.vocabulary.has(term)) {
          this.vocabulary.set(term, this.vocabulary.size);
        }
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      });
    });

    // Calculate IDF
    docFreq.forEach((freq, term) => {
      this.idf.set(term, Math.log(this.documentCount / (freq + 1)) + 1);
    });
  }

  /**
   * Transform a document into TF-IDF vector
   */
  transform(text) {
    const terms = this.tokenize(text);
    const tf = this.termFrequency(terms);
    const vector = new Map();

    tf.forEach((freq, term) => {
      if (this.vocabulary.has(term)) {
        const tfidf = freq * (this.idf.get(term) || 1);
        vector.set(term, tfidf);
      }
    });

    return vector;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    vectorA.forEach((val, key) => {
      normA += val * val;
      if (vectorB.has(key)) {
        dotProduct += val * vectorB.get(key);
      }
    });

    vectorB.forEach(val => {
      normB += val * val;
    });

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

class LRUCache {
  constructor(maxSize = 100, ttlMs = 300000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });
    return entry.value;
  }

  set(key, value) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// ============================================================================
// Skill Loader Class
// ============================================================================

class SkillLoader {
  constructor(options = {}) {
    this.config = { ...CONFIG, ...options };
    this.vectorizer = new TfIdfVectorizer();
    this.skillCache = new LRUCache(
      this.config.maxCacheSize,
      this.config.cacheTTLMs
    );
    this.skills = [];
    this.initialized = false;
  }

  /**
   * Initialize the skill loader with skill corpus
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load skills from Supabase or fallback to local
      this.skills = await this.loadSkills();

      if (this.skills.length === 0) {
        this.log('WARN', 'No skills loaded - dynamic loading disabled');
        return;
      }

      // Build TF-IDF model from skill descriptions
      const corpus = this.skills.map(skill =>
        `${skill.name} ${skill.description || ''} ${(skill.keywords || []).join(' ')}`
      );

      this.vectorizer.fit(corpus);

      // Pre-compute skill vectors
      this.skills.forEach(skill => {
        const text = `${skill.name} ${skill.description || ''} ${(skill.keywords || []).join(' ')}`;
        skill._vector = this.vectorizer.transform(text);
      });

      this.initialized = true;
      this.log('INFO', `Initialized with ${this.skills.length} skills`);

    } catch (error) {
      this.log('ERROR', `Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load skills from Supabase or local file
   */
  async loadSkills() {
    // Try Supabase first
    if (this.config.supabaseUrl && this.config.supabaseKey) {
      try {
        const response = await fetch(
          `${this.config.supabaseUrl}/rest/v1/skills?status=eq.active&select=*`,
          {
            headers: {
              'apikey': this.config.supabaseKey,
              'Authorization': `Bearer ${this.config.supabaseKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const skills = await response.json();
          this.log('INFO', `Loaded ${skills.length} skills from Supabase`);
          return skills;
        }
      } catch (error) {
        this.log('WARN', `Supabase load failed: ${error.message}, trying local`);
      }
    }

    // Fallback to local skill catalog
    const localPath = path.join(__dirname, '../../data/skill-catalog.json');
    if (fs.existsSync(localPath)) {
      const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      this.log('INFO', `Loaded ${data.skills?.length || 0} skills from local catalog`);
      return data.skills || [];
    }

    return [];
  }

  /**
   * Load skills for a specific task
   *
   * @param {string} taskDescription - Description of the task
   * @param {string} agent - Agent requesting skills (optional)
   * @param {object} options - Additional options
   * @returns {Array} Ranked skills for the task
   */
  async loadSkillsForTask(taskDescription, agent = null, options = {}) {
    await this.initialize();

    const cacheKey = `${taskDescription}:${agent || 'any'}`;

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.skillCache.get(cacheKey);
      if (cached) {
        this.log('DEBUG', `Cache hit for: ${cacheKey.substring(0, 50)}`);
        return cached;
      }
    }

    // Transform task to vector
    const taskVector = this.vectorizer.transform(taskDescription);

    // Score and rank skills
    const scoredSkills = this.skills
      .filter(skill => {
        // Filter by agent if specified
        if (agent && skill.source_agent !== agent) {
          // Check if skill is assigned to agent
          const assignments = skill.agent_assignments || [];
          if (!assignments.includes(agent)) {
            return false;
          }
        }

        // Filter by minimum confidence
        if ((skill.confidence || 0) < this.config.minConfidence) {
          return false;
        }

        return true;
      })
      .map(skill => {
        // Calculate relevance score
        const similarity = this.vectorizer.cosineSimilarity(taskVector, skill._vector);
        const confidenceBoost = (skill.confidence || 0.5) * 0.3;
        const successBoost = (skill.success_rate || 0.5) * 0.2;
        const usageBoost = Math.min((skill.usage_count || 0) / 100, 0.2);

        const score = similarity * 0.5 + confidenceBoost + successBoost + usageBoost;

        return {
          ...skill,
          relevanceScore: similarity,
          combinedScore: score
        };
      })
      .filter(skill => skill.relevanceScore >= this.config.minRelevanceScore)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, options.maxSkills || this.config.maxSkillsToLoad);

    // Cache results
    if (this.config.cacheEnabled && scoredSkills.length > 0) {
      this.skillCache.set(cacheKey, scoredSkills);
    }

    this.log('INFO', `Found ${scoredSkills.length} relevant skills for task`);
    return scoredSkills;
  }

  /**
   * Get all skills for a specific agent
   */
  async getSkillsForAgent(agent) {
    await this.initialize();

    return this.skills.filter(skill => {
      if (skill.source_agent === agent) return true;
      const assignments = skill.agent_assignments || [];
      return assignments.includes(agent);
    }).sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0));
  }

  /**
   * Rank skills by relevance to a task
   */
  rankSkillsByRelevance(skills, taskDescription) {
    const taskVector = this.vectorizer.transform(taskDescription);

    return skills
      .map(skill => {
        const skillText = `${skill.name} ${skill.description || ''}`;
        const skillVector = this.vectorizer.transform(skillText);
        const similarity = this.vectorizer.cosineSimilarity(taskVector, skillVector);

        return {
          ...skill,
          relevanceScore: similarity
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Format skills for prompt injection
   */
  injectSkillContext(skills, format = 'markdown') {
    if (!skills || skills.length === 0) {
      return '';
    }

    switch (format) {
      case 'markdown':
        return this.formatMarkdown(skills);
      case 'json':
        return JSON.stringify(skills.map(s => ({
          id: s.skill_id,
          name: s.name,
          description: s.description,
          relevance: Math.round((s.relevanceScore || 0) * 100)
        })), null, 2);
      case 'compact':
        return skills.map(s =>
          `- ${s.name}: ${s.description || 'No description'}`
        ).join('\n');
      default:
        return this.formatMarkdown(skills);
    }
  }

  formatMarkdown(skills) {
    let output = '## Available Skills (ACE Framework)\n\n';
    output += 'The following skills are recommended based on task analysis:\n\n';

    skills.forEach((skill, index) => {
      const relevance = Math.round((skill.relevanceScore || 0) * 100);
      const success = Math.round((skill.success_rate || 0) * 100);

      output += `### ${index + 1}. ${skill.name}\n`;
      output += `**Relevance**: ${relevance}% | **Success Rate**: ${success}%\n\n`;

      if (skill.description) {
        output += `${skill.description}\n\n`;
      }

      if (skill.content && typeof skill.content === 'object') {
        if (skill.content.steps) {
          output += '**Steps**:\n';
          skill.content.steps.forEach((step, i) => {
            output += `${i + 1}. ${step}\n`;
          });
          output += '\n';
        }
        if (skill.content.best_practices) {
          output += '**Best Practices**:\n';
          skill.content.best_practices.forEach(practice => {
            output += `- ${practice}\n`;
          });
          output += '\n';
        }
      }
    });

    output += '---\n';
    output += '*Skills loaded dynamically by ACE Framework*\n';

    return output;
  }

  /**
   * Clear the skill cache
   */
  clearCache() {
    this.skillCache.clear();
    this.log('INFO', 'Skill cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.skillCache.size(),
      maxSize: this.config.maxCacheSize,
      ttlMs: this.config.cacheTTLMs,
      enabled: this.config.cacheEnabled
    };
  }

  /**
   * Logging helper
   */
  log(level, message) {
    if (this.config.verbose || level === 'ERROR') {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [SkillLoader] [${level}] ${message}`);
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const loader = new SkillLoader({ verbose: true });

  try {
    switch (command) {
      case 'load': {
        // Load skills for a task
        const task = args.slice(1).join(' ') || 'general task';
        const skills = await loader.loadSkillsForTask(task);

        if (skills.length === 0) {
          console.log('No relevant skills found for this task.');
        } else {
          console.log(loader.injectSkillContext(skills, 'markdown'));
        }
        break;
      }

      case 'agent': {
        // Get skills for an agent
        const agent = args[1];
        if (!agent) {
          console.error('Usage: skill-loader.js agent <agent-name>');
          process.exit(1);
        }

        const skills = await loader.getSkillsForAgent(agent);
        console.log(`\nSkills for agent: ${agent}\n`);
        skills.forEach(skill => {
          const success = Math.round((skill.success_rate || 0) * 100);
          console.log(`- ${skill.name} (${success}% success)`);
        });
        break;
      }

      case 'rank': {
        // Rank provided skills against a task
        const task = args[1];
        if (!task) {
          console.error('Usage: skill-loader.js rank "<task description>"');
          process.exit(1);
        }

        await loader.initialize();
        const skills = loader.skills.slice(0, 20); // Sample
        const ranked = loader.rankSkillsByRelevance(skills, task);

        console.log(`\nSkills ranked for: "${task}"\n`);
        ranked.slice(0, 10).forEach((skill, i) => {
          const relevance = Math.round(skill.relevanceScore * 100);
          console.log(`${i + 1}. ${skill.name} (${relevance}% relevance)`);
        });
        break;
      }

      case 'inject': {
        // Format skills for injection
        const task = args.slice(2).join(' ') || 'Run Salesforce assessment';
        const format = args[1] || 'markdown';

        const skills = await loader.loadSkillsForTask(task);
        console.log(loader.injectSkillContext(skills, format));
        break;
      }

      case 'cache': {
        // Cache operations
        const subCmd = args[1];
        if (subCmd === 'clear') {
          loader.clearCache();
          console.log('Cache cleared');
        } else if (subCmd === 'stats') {
          const stats = loader.getCacheStats();
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.error('Usage: skill-loader.js cache [clear|stats]');
        }
        break;
      }

      case 'stats': {
        // Show skill statistics
        await loader.initialize();
        const skills = loader.skills;

        const stats = {
          totalSkills: skills.length,
          byCategory: {},
          byAgent: {},
          avgSuccessRate: 0,
          avgConfidence: 0
        };

        let successSum = 0;
        let confidenceSum = 0;

        skills.forEach(skill => {
          // By category
          const cat = skill.category || 'uncategorized';
          stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;

          // By agent
          const agent = skill.source_agent || 'unknown';
          stats.byAgent[agent] = (stats.byAgent[agent] || 0) + 1;

          successSum += skill.success_rate || 0;
          confidenceSum += skill.confidence || 0;
        });

        if (skills.length > 0) {
          stats.avgSuccessRate = Math.round((successSum / skills.length) * 100);
          stats.avgConfidence = Math.round((confidenceSum / skills.length) * 100);
        }

        console.log(JSON.stringify(stats, null, 2));
        break;
      }

      default:
        console.log(`
Skill Loader - ACE Framework v1.0.0

Usage: skill-loader.js <command> [options]

Commands:
  load <task>           Load skills relevant to a task description
  agent <name>          Get all skills for a specific agent
  rank "<task>"         Rank sample skills by relevance to task
  inject <format> <task>  Format skills for prompt injection
                         Formats: markdown, json, compact
  cache [clear|stats]   Manage skill cache
  stats                 Show skill statistics

Examples:
  skill-loader.js load "Run CPQ assessment for pricing rules"
  skill-loader.js agent sfdc-revops-auditor
  skill-loader.js inject markdown "Deploy validation rules"
  skill-loader.js stats

Environment Variables:
  SKILL_MAX_LOAD        Maximum skills to return (default: 5)
  SKILL_MIN_RELEVANCE   Minimum relevance score (default: 0.3)
  SKILL_MIN_CONFIDENCE  Minimum confidence threshold (default: 0.5)
  SKILL_CACHE_ENABLED   Enable caching (default: 1)
  SKILL_LOADER_VERBOSE  Enable verbose logging (default: 0)
`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  SkillLoader,
  TfIdfVectorizer,
  LRUCache
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}
