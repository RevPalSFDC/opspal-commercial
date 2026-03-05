#!/usr/bin/env node

/**
 * ACE Framework Integration for AI Consult Plugin
 *
 * Integrates Gemini consultations with the ACE (Agentic Context Engineering)
 * skill registry. Enables:
 * - Logging consultation outcomes to skill registry
 * - Tracking consultation success rates by topic/agent
 * - Learning which tasks benefit from cross-model consultation
 * - Transferring consultation patterns between agents
 *
 * @module ace-integration
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs');

// Skill registry path (cross-platform-plugin)
const CROSS_PLATFORM_ROOT = path.resolve(__dirname, '../../../../opspal-core/cross-platform-plugin');
const SKILL_REGISTRY_PATH = path.join(CROSS_PLATFORM_ROOT, 'scripts/lib/strategy-registry.js');

// Default consultation skill definition
const CONSULTATION_SKILL = {
  name: 'Gemini Cross-Model Consultation',
  skillId: 'gemini-consultation-core',
  category: 'consultation',
  subcategory: 'cross-model',
  tags: ['gemini', 'second-opinion', 'cross-model', 'synthesis', 'code-review', 'architecture'],
  sourceAgent: 'gemini-consult',
  sourceType: 'shared',
  description: 'Cross-model AI consultation using Google Gemini. Synthesizes Claude and Gemini perspectives for code review, architecture decisions, debugging, and best practices.',
  content: {
    instructions: `
1. Identify the task requiring consultation
2. Develop Claude's initial perspective
3. Invoke Gemini CLI with context
4. Synthesize both perspectives
5. Calculate alignment score
6. Generate unified recommendations
    `.trim(),
    patterns: [
      'code-review-consultation',
      'architecture-decision-consultation',
      'debugging-consultation',
      'best-practices-consultation'
    ],
    triggerConditions: [
      'complexity >= 85%',
      'confidence < 40%',
      'uncertainty phrases >= 3',
      'error count >= 2'
    ],
    examples: [
      {
        input: 'Review this caching implementation for edge cases',
        output: 'Synthesized analysis with 72% alignment on Redis TTL approach'
      }
    ],
    antiPatterns: [
      'Sending sensitive credentials to external APIs',
      'Using consultation for trivial questions',
      'Ignoring low alignment scores without investigation'
    ]
  }
};

/**
 * ACE Integration for AI Consult
 */
class ACEIntegration {
  constructor(options = {}) {
    this.verbose = options.verbose || process.env.ACE_VERBOSE === '1';
    this.dryRun = options.dryRun || false;
    this.registry = null;
    this.initialized = false;
  }

  /**
   * Initialize connection to skill registry
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (this.initialized) return true;

    try {
      // Check if skill registry exists
      if (!fs.existsSync(SKILL_REGISTRY_PATH)) {
        this.log('WARN', 'Skill registry not found - ACE integration disabled');
        return false;
      }

      // Check Supabase credentials
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        this.log('WARN', 'Supabase credentials not set - ACE integration disabled');
        return false;
      }

      // Load skill registry
      const SkillRegistry = require(SKILL_REGISTRY_PATH);
      this.registry = new SkillRegistry({
        verbose: this.verbose,
        dryRun: this.dryRun
      });

      this.initialized = true;
      this.log('INFO', 'ACE integration initialized');
      return true;
    } catch (error) {
      this.log('ERROR', `Failed to initialize ACE: ${error.message}`);
      return false;
    }
  }

  /**
   * Ensure the core consultation skill is registered
   * @returns {Promise<{skillId: string, created: boolean}>}
   */
  async ensureSkillRegistered() {
    if (!await this.initialize()) {
      return { skillId: null, created: false, error: 'ACE not available' };
    }

    try {
      // Check if skill exists
      const existing = await this.registry.getSkill(CONSULTATION_SKILL.skillId);
      if (existing) {
        this.log('INFO', 'Consultation skill already registered');
        return { skillId: existing.skill_id, created: false };
      }

      // Register the skill
      const result = await this.registry.registerSkill(CONSULTATION_SKILL);
      this.log('INFO', 'Consultation skill registered', result);
      return { skillId: result.skillId, created: true };
    } catch (error) {
      this.log('ERROR', `Failed to register skill: ${error.message}`);
      return { skillId: null, created: false, error: error.message };
    }
  }

  /**
   * Record a consultation execution
   *
   * @param {Object} consultation
   * @param {string} consultation.agent - Agent that invoked consultation
   * @param {boolean} consultation.success - Whether consultation helped
   * @param {number} [consultation.alignmentScore] - Claude/Gemini alignment (0-100)
   * @param {string} [consultation.topic] - Topic category
   * @param {string} [consultation.question] - Original question
   * @param {number} [consultation.durationMs] - Consultation duration
   * @param {string} [consultation.sessionId] - Session identifier
   * @param {string} [consultation.errorType] - Error type if failed
   * @param {string} [consultation.errorMessage] - Error message if failed
   * @param {string} [consultation.userFeedback] - 'helpful', 'not_helpful', null
   * @returns {Promise<{executionId: string}>}
   */
  async recordConsultation(consultation) {
    if (!await this.initialize()) {
      return { executionId: null, error: 'ACE not available' };
    }

    try {
      // Ensure skill is registered
      await this.ensureSkillRegistered();

      // Build context with consultation-specific data
      const context = {
        task_type: 'consultation',
        topic: consultation.topic || 'general',
        alignment_score: consultation.alignmentScore,
        question_preview: consultation.question?.substring(0, 100),
        user_feedback: consultation.userFeedback || null,
        complexity: consultation.complexity || null,
        confidence: consultation.confidence || null
      };

      // Record execution
      const result = await this.registry.recordExecution({
        skillId: CONSULTATION_SKILL.skillId,
        agent: consultation.agent || 'gemini-consult',
        success: consultation.success,
        durationMs: consultation.durationMs,
        sessionId: consultation.sessionId,
        taskDescription: consultation.question,
        errorType: consultation.errorType,
        errorMessage: consultation.errorMessage,
        context
      });

      this.log('INFO', 'Consultation recorded', result);
      return result;
    } catch (error) {
      this.log('ERROR', `Failed to record consultation: ${error.message}`);
      return { executionId: null, error: error.message };
    }
  }

  /**
   * Get consultation history for learning
   *
   * @param {Object} [options]
   * @param {string} [options.agent] - Filter by agent
   * @param {string} [options.topic] - Filter by topic
   * @param {number} [options.days] - Look back period (default: 30)
   * @param {number} [options.limit] - Max results (default: 50)
   * @returns {Promise<Object[]>}
   */
  async getConsultationHistory(options = {}) {
    if (!await this.initialize()) {
      return [];
    }

    try {
      const executions = await this.registry.getRecentExecutions(
        CONSULTATION_SKILL.skillId,
        options.days || 30
      );

      // Filter by agent if specified
      let filtered = executions;
      if (options.agent) {
        filtered = filtered.filter(e => e.agent === options.agent);
      }

      // Filter by topic if specified
      if (options.topic) {
        filtered = filtered.filter(e =>
          e.context?.topic?.toLowerCase().includes(options.topic.toLowerCase())
        );
      }

      return filtered.slice(0, options.limit || 50);
    } catch (error) {
      this.log('ERROR', `Failed to get history: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate consultation effectiveness for an agent
   *
   * @param {string} agent - Agent name
   * @param {number} [days] - Look back period (default: 30)
   * @returns {Promise<Object>}
   */
  async getAgentConsultationStats(agent, days = 30) {
    const history = await this.getConsultationHistory({ agent, days });

    if (history.length === 0) {
      return {
        agent,
        totalConsultations: 0,
        successRate: null,
        avgAlignmentScore: null,
        topTopics: [],
        recommendation: 'No consultation history'
      };
    }

    const successful = history.filter(e => e.success);
    const alignmentScores = history
      .map(e => e.context?.alignment_score)
      .filter(s => s !== null && s !== undefined);

    // Group by topic
    const topicCounts = {};
    const topicSuccess = {};
    history.forEach(e => {
      const topic = e.context?.topic || 'general';
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      if (e.success) {
        topicSuccess[topic] = (topicSuccess[topic] || 0) + 1;
      }
    });

    // Sort topics by frequency
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => ({
        topic,
        count,
        successRate: topicSuccess[topic] ? Math.round(topicSuccess[topic] / count * 100) : 0
      }));

    const successRate = Math.round(successful.length / history.length * 100);
    const avgAlignment = alignmentScores.length > 0
      ? Math.round(alignmentScores.reduce((a, b) => a + b, 0) / alignmentScores.length)
      : null;

    // Generate recommendation
    let recommendation;
    if (successRate >= 80) {
      recommendation = 'High consultation effectiveness - continue using for complex tasks';
    } else if (successRate >= 60) {
      recommendation = 'Moderate effectiveness - consider for high-complexity tasks only';
    } else if (successRate >= 40) {
      recommendation = 'Mixed results - review consultation topics for patterns';
    } else {
      recommendation = 'Low effectiveness - may need to refine consultation prompts';
    }

    return {
      agent,
      totalConsultations: history.length,
      successRate,
      avgAlignmentScore: avgAlignment,
      topTopics,
      recommendation
    };
  }

  /**
   * Check if consultation is recommended based on history
   *
   * @param {Object} task
   * @param {string} task.agent - Agent handling the task
   * @param {string} [task.topic] - Task topic/category
   * @param {number} [task.complexity] - Task complexity (0-1)
   * @param {number} [task.confidence] - Routing confidence (0-100)
   * @returns {Promise<{recommended: boolean, reason: string, confidence: number}>}
   */
  async shouldConsult(task) {
    // Get agent stats
    const stats = await this.getAgentConsultationStats(task.agent);

    // No history - use default triggers
    if (stats.totalConsultations === 0) {
      return {
        recommended: task.complexity >= 0.85 || task.confidence < 40,
        reason: 'No consultation history - using default triggers',
        confidence: 50
      };
    }

    // Check if this topic has good success rate
    const topicStat = stats.topTopics.find(t =>
      task.topic?.toLowerCase().includes(t.topic.toLowerCase())
    );

    if (topicStat && topicStat.successRate >= 70) {
      return {
        recommended: true,
        reason: `Topic "${topicStat.topic}" has ${topicStat.successRate}% consultation success rate`,
        confidence: topicStat.successRate
      };
    }

    // High complexity + good overall success rate
    if (task.complexity >= 0.7 && stats.successRate >= 60) {
      return {
        recommended: true,
        reason: `High complexity (${Math.round(task.complexity * 100)}%) + ${stats.successRate}% historical success`,
        confidence: stats.successRate
      };
    }

    // Low confidence + moderate success rate
    if (task.confidence < 50 && stats.successRate >= 50) {
      return {
        recommended: true,
        reason: `Low routing confidence (${task.confidence}%) + ${stats.successRate}% historical success`,
        confidence: Math.round((100 - task.confidence + stats.successRate) / 2)
      };
    }

    // Default: not recommended
    return {
      recommended: false,
      reason: 'Task does not meet consultation triggers based on history',
      confidence: 100 - stats.successRate
    };
  }

  /**
   * Get consultation skill details
   * @returns {Promise<Object|null>}
   */
  async getSkillDetails() {
    if (!await this.initialize()) {
      return null;
    }

    try {
      return await this.registry.getSkill(CONSULTATION_SKILL.skillId);
    } catch (error) {
      this.log('ERROR', `Failed to get skill details: ${error.message}`);
      return null;
    }
  }

  /**
   * Log message
   * @private
   */
  log(level, message, data = null) {
    if (this.verbose || level === 'ERROR') {
      const prefix = `[ACE-Consult] [${level}]`;
      if (data) {
        console.error(`${prefix} ${message}`, JSON.stringify(data, null, 2));
      } else {
        console.error(`${prefix} ${message}`);
      }
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get ACE integration instance
 * @param {Object} [options]
 * @returns {ACEIntegration}
 */
function getACEIntegration(options = {}) {
  if (!instance) {
    instance = new ACEIntegration(options);
  }
  return instance;
}

// Export
module.exports = {
  ACEIntegration,
  getACEIntegration,
  CONSULTATION_SKILL
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const usage = `
ACE Integration for AI Consult Plugin

Usage: node ace-integration.js <command> [options]

Commands:
  register       Register consultation skill in ACE
  record         Record a consultation outcome
  stats          Get consultation statistics for an agent
  history        Get consultation history
  should-consult Check if consultation is recommended
  skill          Get skill details

Options:
  --verbose      Enable verbose logging
  --dry-run      Don't make changes

Examples:
  # Register skill
  node ace-integration.js register

  # Record successful consultation
  node ace-integration.js record --agent sfdc-cpq-assessor --success true \\
    --alignment-score 72 --topic "caching strategy"

  # Get agent stats
  node ace-integration.js stats --agent sfdc-cpq-assessor

  # Check if consultation recommended
  node ace-integration.js should-consult --agent sfdc-cpq-assessor \\
    --complexity 0.85 --confidence 35
`;

  if (!command || command === '--help' || command === '-h') {
    console.log(usage);
    process.exit(0);
  }

  // Parse args
  const parseArgs = (args) => {
    const parsed = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2).replace(/-/g, '_');
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
        parsed[key] = value;
        if (value !== 'true') i++;
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const ace = getACEIntegration({
    verbose: options.verbose === 'true',
    dryRun: options.dry_run === 'true'
  });

  (async () => {
    try {
      let result;

      switch (command) {
        case 'register':
          result = await ace.ensureSkillRegistered();
          break;

        case 'record':
          result = await ace.recordConsultation({
            agent: options.agent,
            success: options.success === 'true',
            alignmentScore: options.alignment_score ? parseInt(options.alignment_score) : undefined,
            topic: options.topic,
            question: options.question,
            durationMs: options.duration_ms ? parseInt(options.duration_ms) : undefined,
            errorType: options.error_type,
            errorMessage: options.error_message,
            userFeedback: options.feedback
          });
          break;

        case 'stats':
          result = await ace.getAgentConsultationStats(
            options.agent || 'gemini-consult',
            parseInt(options.days) || 30
          );
          break;

        case 'history':
          result = await ace.getConsultationHistory({
            agent: options.agent,
            topic: options.topic,
            days: parseInt(options.days) || 30,
            limit: parseInt(options.limit) || 50
          });
          break;

        case 'should-consult':
          result = await ace.shouldConsult({
            agent: options.agent || 'unknown',
            topic: options.topic,
            complexity: parseFloat(options.complexity) || 0.5,
            confidence: parseInt(options.confidence) || 50
          });
          break;

        case 'skill':
          result = await ace.getSkillDetails();
          break;

        default:
          console.error(`Unknown command: ${command}`);
          console.log(usage);
          process.exit(1);
      }

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      if (options.verbose === 'true') {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}
