/**
 * ComplexityCalculator - Task complexity assessment using formal rubric
 *
 * Provides:
 * - Multi-factor complexity scoring
 * - Decomposition recommendation
 * - User flag detection
 * - Confidence scoring
 */

const fs = require('fs');
const path = require('path');

class ComplexityCalculator {
  constructor(options = {}) {
    // Load rubric
    if (options.rubric) {
      this.rubric = options.rubric;
    } else if (options.rubricPath) {
      this.rubric = JSON.parse(fs.readFileSync(options.rubricPath, 'utf8'));
    } else {
      // Load default rubric
      const defaultPath = path.join(__dirname, '../../../config/complexity-rubric.json');
      if (fs.existsSync(defaultPath)) {
        this.rubric = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
      } else {
        this.rubric = this.getDefaultRubric();
      }
    }

    this.options = {
      verbose: options.verbose || false,
      ...options
    };
  }

  /**
   * Get default rubric if config not found
   * @private
   */
  getDefaultRubric() {
    return {
      rubric: {
        multi_domain: { weight: 2, keyword_combinations: [['apex', 'flow'], ['salesforce', 'hubspot']] },
        multi_artifact: { weight: 2, threshold: 5, indicators: ['multiple', 'several', 'bulk'] },
        high_risk: { weight: 2, keywords: ['production', 'delete', 'permission', 'security'] },
        high_ambiguity: { weight: 1, indicators: ['unclear', 'unknown', 'investigate', 'discover'] },
        long_horizon: { weight: 1, indicators: ['phase', 'migration', 'rollout', 'multi-step'] }
      },
      decomposition_threshold: 4,
      user_flags: {
        force_task_graph: ['[SEQUENTIAL]', '[PLAN_CAREFULLY]', '[COMPLEX]'],
        skip_task_graph: ['[DIRECT]', '[QUICK_MODE]', '[SIMPLE]']
      }
    };
  }

  /**
   * Calculate complexity score for a task description
   * @param {string} taskDescription - Description of the task
   * @param {Object} context - Additional context
   * @returns {Object} Complexity assessment result
   */
  calculate(taskDescription, context = {}) {
    const normalizedDesc = taskDescription.toLowerCase();

    // Check for user flags first
    const flagResult = this.checkUserFlags(taskDescription);
    if (flagResult.flagged) {
      return {
        score: flagResult.forceTaskGraph ? 10 : 0,
        factors: [flagResult.flag],
        recommendation: flagResult.forceTaskGraph ? 'task_graph_required' : 'direct_execution',
        shouldDecompose: flagResult.forceTaskGraph,
        confidence: 1.0,
        flagOverride: true,
        details: {
          user_flag: flagResult.flag,
          original_text: taskDescription.slice(0, 200)
        }
      };
    }

    // Calculate score from rubric factors
    let score = 0;
    const factors = [];
    const details = {};

    // Multi-domain detection
    const multiDomainResult = this.detectMultiDomain(normalizedDesc, context);
    if (multiDomainResult.detected) {
      score += this.rubric.rubric.multi_domain.weight;
      factors.push('multi_domain');
      details.multi_domain = multiDomainResult;
    }

    // Multi-artifact detection
    const multiArtifactResult = this.detectMultiArtifact(normalizedDesc, context);
    if (multiArtifactResult.detected) {
      score += this.rubric.rubric.multi_artifact.weight;
      factors.push('multi_artifact');
      details.multi_artifact = multiArtifactResult;
    }

    // High risk detection
    const highRiskResult = this.detectHighRisk(normalizedDesc);
    if (highRiskResult.detected) {
      score += this.rubric.rubric.high_risk.weight;
      factors.push('high_risk');
      details.high_risk = highRiskResult;
    }

    // High ambiguity detection
    const ambiguityResult = this.detectAmbiguity(normalizedDesc);
    if (ambiguityResult.detected) {
      score += this.rubric.rubric.high_ambiguity.weight;
      factors.push('high_ambiguity');
      details.high_ambiguity = ambiguityResult;
    }

    // Long horizon detection
    const longHorizonResult = this.detectLongHorizon(normalizedDesc);
    if (longHorizonResult.detected) {
      score += this.rubric.rubric.long_horizon.weight;
      factors.push('long_horizon');
      details.long_horizon = longHorizonResult;
    }

    // Calculate confidence based on match strength
    const confidence = this.calculateConfidence(details);

    // Get recommendation
    const recommendation = this.getRecommendation(score);

    return {
      score,
      factors,
      recommendation: recommendation.recommendation,
      recommendationDescription: recommendation.description,
      shouldDecompose: score >= this.rubric.decomposition_threshold,
      confidence,
      flagOverride: false,
      details
    };
  }

  /**
   * Check for user flags in the description
   * @private
   */
  checkUserFlags(text) {
    const forceFlags = this.rubric.user_flags?.force_task_graph || [];
    const skipFlags = this.rubric.user_flags?.skip_task_graph || [];

    for (const flag of forceFlags) {
      if (text.includes(flag)) {
        return { flagged: true, forceTaskGraph: true, flag };
      }
    }

    for (const flag of skipFlags) {
      if (text.includes(flag)) {
        return { flagged: true, forceTaskGraph: false, flag };
      }
    }

    return { flagged: false };
  }

  /**
   * Detect multi-domain work
   * @private
   */
  detectMultiDomain(text, context) {
    const config = this.rubric.rubric.multi_domain;
    const matches = [];

    // Check keyword combinations
    if (config.keyword_combinations) {
      for (const combo of config.keyword_combinations) {
        const allPresent = combo.every(keyword =>
          text.includes(keyword.toLowerCase())
        );
        if (allPresent) {
          matches.push(combo);
        }
      }
    }

    // Check detection patterns
    if (config.detection_patterns) {
      for (const pattern of config.detection_patterns) {
        const allKeywords = pattern.keywords?.every(k =>
          text.includes(k.toLowerCase())
        );
        if (allKeywords) {
          matches.push(pattern.domains);
        }
      }
    }

    // Check context for explicit domains
    if (context.domains && context.domains.length >= 2) {
      matches.push(context.domains);
    }

    return {
      detected: matches.length > 0,
      matches,
      confidence: Math.min(matches.length * 0.5, 1.0)
    };
  }

  /**
   * Detect multi-artifact work
   * @private
   */
  detectMultiArtifact(text, context) {
    const config = this.rubric.rubric.multi_artifact;
    const matches = [];

    // Check indicators
    if (config.indicators) {
      for (const indicator of config.indicators) {
        if (text.includes(indicator.toLowerCase())) {
          matches.push(indicator);
        }
      }
    }

    // Check explicit artifact count in context
    const artifactCount = context.estimatedArtifacts || 0;
    const threshold = config.threshold || 5;

    // Look for numeric patterns suggesting multiple items
    const numberPatterns = text.match(/\d+\s*(files?|objects?|fields?|flows?|classes|records)/gi);
    let estimatedFromText = 0;
    if (numberPatterns) {
      for (const match of numberPatterns) {
        const num = parseInt(match.match(/\d+/)[0], 10);
        if (num >= threshold) {
          estimatedFromText = Math.max(estimatedFromText, num);
        }
      }
    }

    return {
      detected: matches.length >= 2 || artifactCount >= threshold || estimatedFromText >= threshold,
      matches,
      estimated_artifacts: Math.max(artifactCount, estimatedFromText),
      threshold,
      confidence: matches.length > 0 ? 0.7 : (estimatedFromText > 0 ? 0.9 : 0)
    };
  }

  /**
   * Detect high risk work
   * @private
   */
  detectHighRisk(text) {
    const config = this.rubric.rubric.high_risk;
    const matches = [];

    // Check keywords
    if (config.keywords) {
      for (const keyword of config.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          matches.push(keyword);
        }
      }
    }

    // Check patterns (regex)
    if (config.patterns) {
      for (const pattern of config.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          matches.push(pattern);
        }
      }
    }

    return {
      detected: matches.length > 0,
      matches,
      confidence: Math.min(matches.length * 0.4, 1.0)
    };
  }

  /**
   * Detect high ambiguity
   * @private
   */
  detectAmbiguity(text) {
    const config = this.rubric.rubric.high_ambiguity;
    const matches = [];

    if (config.indicators) {
      for (const indicator of config.indicators) {
        if (text.includes(indicator.toLowerCase())) {
          matches.push(indicator);
        }
      }
    }

    // Questions indicate ambiguity
    const questionCount = (text.match(/\?/g) || []).length;

    return {
      detected: matches.length >= 2 || questionCount >= 2,
      matches,
      question_count: questionCount,
      confidence: Math.min((matches.length + questionCount) * 0.25, 1.0)
    };
  }

  /**
   * Detect long horizon work
   * @private
   */
  detectLongHorizon(text) {
    const config = this.rubric.rubric.long_horizon;
    const matches = [];

    if (config.indicators) {
      for (const indicator of config.indicators) {
        if (text.includes(indicator.toLowerCase())) {
          matches.push(indicator);
        }
      }
    }

    return {
      detected: matches.length > 0,
      matches,
      confidence: Math.min(matches.length * 0.5, 1.0)
    };
  }

  /**
   * Calculate overall confidence from detail confidences
   * @private
   */
  calculateConfidence(details) {
    const confidences = Object.values(details)
      .filter(d => d.detected)
      .map(d => d.confidence || 0.5);

    if (confidences.length === 0) {
      return 0.5; // Neutral confidence when no factors detected
    }

    // Average of detected factor confidences
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  /**
   * Get recommendation based on score
   * @private
   */
  getRecommendation(score) {
    const scoring = this.rubric.scoring || {};

    if (score >= 6) {
      return scoring['6+'] || { recommendation: 'task_graph_required', description: 'High complexity' };
    } else if (score >= 4) {
      return scoring['4-5'] || { recommendation: 'task_graph_recommended', description: 'Moderate complexity' };
    } else {
      return scoring['0-3'] || { recommendation: 'direct_execution', description: 'Simple task' };
    }
  }

  /**
   * Get a brief explanation of the assessment
   * @param {Object} result - Assessment result
   * @returns {string} Human-readable explanation
   */
  explain(result) {
    if (result.flagOverride) {
      return `User flag ${result.details.user_flag} detected. ` +
        `Recommendation: ${result.recommendation}`;
    }

    const factorDescriptions = {
      multi_domain: 'spans multiple domains',
      multi_artifact: 'affects multiple artifacts',
      high_risk: 'involves high-risk operations',
      high_ambiguity: 'has unclear requirements',
      long_horizon: 'requires multi-step execution'
    };

    const factorList = result.factors
      .map(f => factorDescriptions[f] || f)
      .join(', ');

    return `Score: ${result.score}/10. ` +
      `Task ${factorList || 'is straightforward'}. ` +
      `Recommendation: ${result.recommendationDescription || result.recommendation}. ` +
      `Confidence: ${(result.confidence * 100).toFixed(0)}%`;
  }

  /**
   * Estimate domain from task description
   * @param {string} text - Task description
   * @returns {string} Estimated domain
   */
  estimateDomain(text) {
    const normalizedText = text.toLowerCase();
    const domainKeywords = {
      'salesforce-apex': ['apex', 'trigger', 'class', 'test class', 'batch'],
      'salesforce-flow': ['flow', 'process builder', 'workflow', 'screen flow'],
      'salesforce-metadata': ['metadata', 'deploy', 'package', 'field', 'object'],
      'salesforce-data': ['data', 'record', 'import', 'export', 'migration'],
      'salesforce-permission': ['permission', 'profile', 'role', 'sharing'],
      'salesforce-report': ['report', 'dashboard'],
      'hubspot-workflow': ['hubspot workflow', 'hs workflow', 'enrollment'],
      'hubspot-data': ['hubspot data', 'contact', 'deal', 'company'],
      'data-transform': ['transform', 'etl', 'mapping', 'csv'],
      'integration': ['integration', 'api', 'webhook', 'sync']
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword)) {
          return domain;
        }
      }
    }

    return 'cross-platform';
  }

  /**
   * Get the base complexity for a domain
   * @param {string} domain - Domain name
   * @returns {number} Base complexity (0-1)
   */
  getDomainBaseComplexity(domain) {
    const defaults = this.rubric.domain_complexity_defaults || {};
    return defaults[domain] || 0.4;
  }
}

// CLI interface
if (require.main === module) {
  const taskDescription = process.argv.slice(2).join(' ');

  if (!taskDescription) {
    console.log('Usage: node complexity-calculator.js <task description>');
    process.exit(1);
  }

  const calculator = new ComplexityCalculator();
  const result = calculator.calculate(taskDescription);

  console.log(JSON.stringify({
    ...result,
    explanation: calculator.explain(result)
  }, null, 2));
}

module.exports = { ComplexityCalculator };
