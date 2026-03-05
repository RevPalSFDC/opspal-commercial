#!/usr/bin/env node

/**
 * Cohort-Specific Fix Planner - Enhanced Fix Plan Generation
 *
 * Generates actionable, cohort-specific fix plans with 5-Why RCA.
 *
 * Key Features:
 * - Cohort-specific plan generation
 * - 5-Why root cause analysis
 * - Solution templates for common patterns
 * - Actionability validation
 * - Alternative solution generation
 * - Success criteria definition
 *
 * Addresses: Phase 3.1 - Fix plan quality issues
 *
 * Prevention Target: Generic fix plans → specific, actionable plans
 *
 * Usage:
 *   const { CohortFixPlanner } = require('./cohort-fix-planner');
 *   const planner = new CohortFixPlanner();
 *
 *   const plan = await planner.generateFixPlan({
 *     cohortType: 'tool-contract',
 *     reflections: [...],
 *     rootCause: '...',
 *     impact: '...'
 *   });
 */

const fs = require('fs').promises;
const path = require('path');

class CohortFixPlanner {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './.fix-plans';

    // Phase 2.3: Hierarchical Classification Rules
    // Higher priority cohorts are checked first and take precedence
    this.cohortHierarchy = [
      { cohort: 'schema-parse', priority: 1, weight: 0.40 },
      { cohort: 'tool-contract', priority: 2, weight: 0.30 },
      { cohort: 'config-env', priority: 3, weight: 0.20 },
      { cohort: 'data-quality', priority: 4, weight: 0.10 },
      { cohort: 'planning-scope', priority: 5, weight: 0.08 },
      { cohort: 'agent-selection', priority: 6, weight: 0.07 },
      { cohort: 'operation-idempotency', priority: 7, weight: 0.05 },
      { cohort: 'unknown', priority: 99, weight: 0.01 }
    ];

    // Confidence thresholds
    this.confidenceThresholds = {
      HIGH: 0.7,      // Reliable classification
      MEDIUM: 0.4,    // Moderate confidence
      LOW: 0.2        // Low confidence - consider secondary cohorts
    };

    // Keyword patterns for weighted scoring
    this.cohortKeywordPatterns = {
      'schema-parse': {
        keywords: ['field', 'object', 'schema', 'validation', 'type', 'null', 'undefined', 'parse', 'metadata'],
        patterns: [/\.null__NotFound/i, /field\s+does\s+not\s+exist/i, /invalid\s+type/i, /cannot\s+find/i],
        weight: 0.40
      },
      'tool-contract': {
        keywords: ['routing', 'agent', 'selection', 'capability', 'duplicate', 'search-replace', 'tool'],
        patterns: [/wrong\s+agent/i, /routing\s+error/i, /duplicate\s+field/i, /search.*replace/i],
        weight: 0.30
      },
      'config-env': {
        keywords: ['path', 'environment', 'config', 'directory', 'instance', 'label', 'deployment'],
        patterns: [/path\s+not\s+found/i, /environment\s+mismatch/i, /config.*missing/i, /wrong\s+org/i],
        weight: 0.20
      },
      'data-quality': {
        keywords: ['incomplete', 'partial', 'missing', 'quality', 'verification', 'multi-file'],
        patterns: [/incomplete\s+operation/i, /partial\s+edit/i, /missing\s+data/i],
        weight: 0.10
      },
      'planning-scope': {
        keywords: ['scope', 'unbounded', 'all', 'every', 'entire', 'requirements'],
        patterns: [/unbounded\s+scope/i, /unclear\s+requirements/i, /scope\s+creep/i],
        weight: 0.08
      },
      'agent-selection': {
        keywords: ['agent', 'wrong', 'selection', 'orchestration', 'multi-faceted'],
        patterns: [/wrong\s+agent/i, /should\s+have\s+used/i, /multi-faceted/i],
        weight: 0.07
      },
      'operation-idempotency': {
        keywords: ['duplicate', 'idempotency', 'retry', 'multiple', 'repeated'],
        patterns: [/duplicate\s+operation/i, /already\s+exists/i, /ran\s+twice/i],
        weight: 0.05
      }
    };

    // Solution templates by cohort type
    this.solutionTemplates = {
      'tool-contract': {
        name: 'Tool Contract & Routing Issues',
        commonCauses: [
          'Agent routing logic unclear',
          'Tool capabilities not well-defined',
          'Semantic matching insufficient',
          'Confidence thresholds too low'
        ],
        solutionPatterns: [
          {
            name: 'Enhanced Routing Clarity',
            components: ['routing-clarity-enhancer.js', 'semantic-router.js'],
            steps: [
              'Add human-readable routing explanations',
              'Implement confidence level reporting',
              'Generate alternative agent suggestions',
              'Log routing decisions for analysis'
            ],
            successCriteria: [
              'Routing decisions include clear explanations',
              'Confidence levels accurately reflect match quality',
              'Alternative agents provided for low-confidence matches',
              'Decision logs created for every routing'
            ]
          },
          {
            name: 'Agent Capability Matrix',
            components: ['agent-decision-matrix.js'],
            steps: [
              'Decompose tasks into facets',
              'Map facets to agent capabilities',
              'Score agent matches by capability overlap',
              'Generate sequential execution plans'
            ],
            successCriteria: [
              'Tasks decomposed into distinct facets',
              'Agents matched to appropriate facets',
              'Multi-agent orchestration for complex tasks',
              'Execution plans follow logical order'
            ]
          }
        ]
      },

      'schema-parse': {
        name: 'Schema & Validation Issues',
        commonCauses: [
          'Missing validation rules',
          'Incorrect field types expected',
          'Schema assumptions not validated',
          'Error messages unclear'
        ],
        solutionPatterns: [
          {
            name: 'Pre-Operation Validation',
            components: ['field-validator.js', 'schema-validator.js'],
            steps: [
              'Query actual schema before operations',
              'Validate field types and constraints',
              'Check for custom fields vs standard',
              'Verify record type availability'
            ],
            successCriteria: [
              'Schema queried before every operation',
              'Field type mismatches detected early',
              'Custom vs standard fields identified',
              'Clear error messages on validation failure'
            ]
          }
        ]
      },

      'config-env': {
        name: 'Configuration & Environment Issues',
        commonCauses: [
          'Hardcoded assumptions about labels',
          'Missing environment-specific config',
          'Deployment order not validated',
          'Property names assumed'
        ],
        solutionPatterns: [
          {
            name: 'Environment Configuration Registry',
            components: ['env-config-validator.js', 'pre-operation-env-validator.sh'],
            steps: [
              'Generate ENV_CONFIG.json per instance',
              'Validate property names against config',
              'Check deployment order rules',
              'Graceful degradation when config missing'
            ],
            successCriteria: [
              'ENV_CONFIG.json exists for all instances',
              'Property validation runs before operations',
              'Deployment order validated',
              'Returns "unknown" instead of failing'
            ]
          }
        ]
      },

      'data-quality': {
        name: 'Data Quality & Completeness Issues',
        commonCauses: [
          'Multi-file edits incomplete',
          'Pattern replacements partial',
          'No verification after operations',
          'Success claimed prematurely'
        ],
        solutionPatterns: [
          {
            name: 'Post-Operation Verification',
            components: ['edit-verification-checkpoint.js', 'post-edit-verification.sh'],
            steps: [
              'Scan files for remaining old patterns',
              'Calculate completion rate percentage',
              'Report file-by-file breakdown',
              'Block success claims until verified'
            ],
            successCriteria: [
              'Verification runs after every edit operation',
              'Completion rate calculated accurately',
              'Remaining occurrences reported with line numbers',
              'Success only claimed at 100% completion'
            ]
          }
        ]
      },

      'planning-scope': {
        name: 'Planning & Scope Issues',
        commonCauses: [
          'Unbounded scope (all, every, entire)',
          'Vague requirements without criteria',
          'Missing constraints or filters',
          'Success criteria not defined'
        ],
        solutionPatterns: [
          {
            name: 'Requirement Extraction & Validation',
            components: ['requirement-extractor.js', 'pre-plan-scope-validation.sh'],
            steps: [
              'Extract explicit requirements from request',
              'Detect unbounded scope patterns',
              'Generate prioritized clarification questions',
              'Require approval before execution'
            ],
            successCriteria: [
              'Unbounded scope detected and flagged',
              'Clarifications generated for vague requirements',
              'User approval required for risky scope',
              'Success criteria documented before start'
            ]
          }
        ]
      },

      'agent-selection': {
        name: 'Agent Selection Issues',
        commonCauses: [
          'Wrong agent for multi-faceted tasks',
          'Missing orchestration for complex tasks',
          'Agent capabilities not matched to needs',
          'No sequential planning'
        ],
        solutionPatterns: [
          {
            name: 'Agent Decision Matrix',
            components: ['agent-decision-matrix.js', 'pre-task-agent-recommendation.sh'],
            steps: [
              'Decompose task into facets',
              'Calculate task complexity',
              'Match agents to facets by capability',
              'Generate sequential execution plan'
            ],
            successCriteria: [
              'Multi-faceted tasks decomposed',
              'Appropriate agent(s) recommended',
              'Orchestration suggested for complexity > 70%',
              'Execution plan follows logical order'
            ]
          }
        ]
      },

      'operation-idempotency': {
        name: 'Operation Idempotency Issues',
        commonCauses: [
          'Operations run multiple times',
          'No duplicate detection',
          'Inconsistent state after retries',
          'No operation tracking'
        ],
        solutionPatterns: [
          {
            name: 'Operation Registry',
            components: ['operation-registry.js', 'pre-operation-idempotency-check.sh'],
            steps: [
              'Generate operation fingerprint',
              'Check if operation already completed',
              'Block duplicate executions',
              'Allow safe retries after failures'
            ],
            successCriteria: [
              'Operations tracked by fingerprint',
              'Duplicates detected and blocked',
              'Retry logic respects operation state',
              'Statistics track prevention rate'
            ]
          }
        ]
      }
    };
  }

  /**
   * Generate comprehensive fix plan for cohort
   *
   * @param {Object} cohortData - Cohort information
   * @returns {Object} - Detailed fix plan
   */
  async generateFixPlan(cohortData) {
    const {
      cohortType,
      reflections = [],
      rootCause = '',
      impact = {},
      taxonomy = ''
    } = cohortData;

    // Perform 5-Why analysis
    const rcaAnalysis = this._perform5WhyAnalysis(reflections, rootCause);

    // Get solution template
    const template = this.solutionTemplates[cohortType];

    if (!template) {
      throw new Error(`Unknown cohort type: ${cohortType}`);
    }

    // Generate fix plan
    const fixPlan = {
      cohortType,
      cohortName: template.name,
      timestamp: new Date().toISOString(),
      reflections: {
        count: reflections.length,
        totalROI: impact.roiAnnualValue || 0,
        frequency: impact.frequency || 0
      },
      rootCauseAnalysis: rcaAnalysis,
      solutionApproach: this._selectOptimalSolution(template, rcaAnalysis),
      implementationPlan: null,
      alternatives: this._generateAlternatives(template, rcaAnalysis),
      successCriteria: [],
      estimatedEffort: {},
      preventionRate: {}
    };

    // Generate implementation plan
    fixPlan.implementationPlan = this._generateImplementationPlan(
      fixPlan.solutionApproach,
      rcaAnalysis
    );

    // Extract success criteria
    fixPlan.successCriteria = fixPlan.solutionApproach.successCriteria;

    // Estimate effort
    fixPlan.estimatedEffort = this._estimateEffort(fixPlan);

    // Calculate prevention rate
    fixPlan.preventionRate = this._calculatePreventionRate(fixPlan);

    // Validate actionability
    const actionabilityCheck = this._validateActionability(fixPlan);
    fixPlan.actionable = actionabilityCheck.actionable;
    fixPlan.actionabilityIssues = actionabilityCheck.issues;

    return fixPlan;
  }

  // =========================================================================
  // Phase 2.3: Hierarchical Classification Methods
  // =========================================================================

  /**
   * Classify a reflection into cohorts with confidence scoring
   * Implements hierarchical classification with secondary cohort tracking
   *
   * @param {Object} reflection - Reflection data to classify
   * @returns {Object} Classification result with primary/secondary cohorts and confidence
   */
  classifyReflection(reflection) {
    const text = this._extractClassificationText(reflection);
    const scores = {};

    // Calculate weighted scores for each cohort
    for (const [cohortType, config] of Object.entries(this.cohortKeywordPatterns)) {
      scores[cohortType] = this._calculateCohortScore(text, config);
    }

    // Sort by score descending
    const sortedCohorts = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .map(([cohort, score]) => ({ cohort, score }));

    // Determine primary cohort
    const primary = sortedCohorts[0] || { cohort: 'unknown', score: 0 };

    // Determine confidence level
    const confidence = this._calculateConfidence(primary.score, sortedCohorts);

    // Track secondary cohorts for multi-faceted issues
    const secondaryCohorts = sortedCohorts
      .slice(1, 3)
      .filter(c => c.score >= this.confidenceThresholds.LOW);

    // Apply hierarchy rules - if confidence is low, prefer higher priority cohort
    let finalCohort = primary.cohort;
    if (confidence < this.confidenceThresholds.HIGH && sortedCohorts.length > 1) {
      // Check if a higher-priority cohort has similar score
      const primaryHierarchy = this.cohortHierarchy.find(h => h.cohort === primary.cohort);
      const scoreDiff = primary.score - sortedCohorts[1].score;

      if (scoreDiff < 0.1) {
        // Scores are close - prefer higher priority cohort
        for (const { cohort, score } of sortedCohorts) {
          const hierarchy = this.cohortHierarchy.find(h => h.cohort === cohort);
          if (hierarchy && hierarchy.priority < (primaryHierarchy?.priority || 99)) {
            if (Math.abs(primary.score - score) < 0.15) {
              finalCohort = cohort;
              break;
            }
          }
        }
      }
    }

    return {
      primaryCohort: finalCohort,
      primaryScore: primary.score,
      confidence,
      confidenceLevel: this._getConfidenceLevel(confidence),
      isReliable: confidence >= this.confidenceThresholds.HIGH,
      secondaryCohorts,
      allScores: scores,
      hierarchy: this._getCohortHierarchy(finalCohort),
      recommendation: this._generateClassificationRecommendation(finalCohort, confidence, secondaryCohorts)
    };
  }

  /**
   * Batch classify multiple reflections
   *
   * @param {Array} reflections - Array of reflection objects
   * @returns {Object} Classification results with cohort grouping
   */
  batchClassify(reflections) {
    const results = {
      classifications: [],
      cohortGroups: {},
      statistics: {
        total: reflections.length,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        multiFaceted: 0
      }
    };

    // Classify each reflection
    for (const reflection of reflections) {
      const classification = this.classifyReflection(reflection);
      classification.reflectionId = reflection.id || reflection.reflection_id;
      results.classifications.push(classification);

      // Group by primary cohort
      if (!results.cohortGroups[classification.primaryCohort]) {
        results.cohortGroups[classification.primaryCohort] = [];
      }
      results.cohortGroups[classification.primaryCohort].push(classification);

      // Update statistics
      if (classification.confidence >= this.confidenceThresholds.HIGH) {
        results.statistics.highConfidence++;
      } else if (classification.confidence >= this.confidenceThresholds.MEDIUM) {
        results.statistics.mediumConfidence++;
      } else {
        results.statistics.lowConfidence++;
      }

      if (classification.secondaryCohorts.length > 0) {
        results.statistics.multiFaceted++;
      }
    }

    // Sort cohort groups by hierarchy priority
    results.cohortGroupsSorted = this.cohortHierarchy
      .filter(h => results.cohortGroups[h.cohort])
      .map(h => ({
        cohort: h.cohort,
        priority: h.priority,
        count: results.cohortGroups[h.cohort].length,
        avgConfidence: this._calculateAvgConfidence(results.cohortGroups[h.cohort])
      }));

    return results;
  }

  /**
   * Extract text for classification from reflection
   * @private
   */
  _extractClassificationText(reflection) {
    const parts = [
      reflection.error_message || '',
      reflection.what_happened || '',
      reflection.context || '',
      reflection.title || '',
      reflection.description || '',
      reflection.root_cause || ''
    ];

    return parts.join(' ').toLowerCase();
  }

  /**
   * Calculate weighted cohort score
   * @private
   */
  _calculateCohortScore(text, config) {
    let score = 0;
    const textLower = text.toLowerCase();

    // Keyword matching (each keyword match adds to score)
    const keywordMatches = config.keywords.filter(kw => textLower.includes(kw.toLowerCase()));
    const keywordScore = (keywordMatches.length / config.keywords.length) * config.weight * 0.5;

    // Pattern matching (stronger signal)
    const patternMatches = config.patterns.filter(pattern => pattern.test(text));
    const patternScore = patternMatches.length > 0 ? config.weight * 0.5 : 0;

    score = keywordScore + patternScore;

    // Bonus for multiple signals
    if (keywordMatches.length >= 3 && patternMatches.length >= 1) {
      score *= 1.2; // 20% bonus for strong correlation
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Calculate overall confidence in classification
   * @private
   */
  _calculateConfidence(primaryScore, sortedCohorts) {
    if (sortedCohorts.length < 2) {
      return primaryScore;
    }

    // Confidence is higher when there's a clear winner
    const secondScore = sortedCohorts[1].score;
    const scoreDiff = primaryScore - secondScore;

    // If scores are very close, confidence is lower
    let confidence = primaryScore;
    if (scoreDiff < 0.05) {
      confidence *= 0.7; // 30% penalty for ambiguous classification
    } else if (scoreDiff < 0.10) {
      confidence *= 0.85; // 15% penalty for somewhat ambiguous
    }

    return confidence;
  }

  /**
   * Get confidence level label
   * @private
   */
  _getConfidenceLevel(confidence) {
    if (confidence >= this.confidenceThresholds.HIGH) return 'HIGH';
    if (confidence >= this.confidenceThresholds.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get cohort hierarchy info
   * @private
   */
  _getCohortHierarchy(cohort) {
    return this.cohortHierarchy.find(h => h.cohort === cohort) || { cohort, priority: 99, weight: 0.01 };
  }

  /**
   * Generate recommendation based on classification
   * @private
   */
  _generateClassificationRecommendation(cohort, confidence, secondaryCohorts) {
    const recommendations = [];

    if (confidence < this.confidenceThresholds.HIGH) {
      recommendations.push('Classification confidence is below 70% - consider manual review');
    }

    if (secondaryCohorts.length > 0) {
      const secondaryNames = secondaryCohorts.map(c => c.cohort).join(', ');
      recommendations.push(`Multi-faceted issue - also consider: ${secondaryNames}`);
    }

    const template = this.solutionTemplates[cohort];
    if (template) {
      recommendations.push(`Apply ${template.name} solution patterns`);
    }

    return recommendations;
  }

  /**
   * Calculate average confidence for a group
   * @private
   */
  _calculateAvgConfidence(classifications) {
    if (!classifications || classifications.length === 0) return 0;
    const sum = classifications.reduce((acc, c) => acc + c.confidence, 0);
    return sum / classifications.length;
  }

  // =========================================================================
  // Original Methods (RCA, Fix Planning, etc.)
  // =========================================================================

  /**
   * Perform 5-Why root cause analysis
   */
  _perform5WhyAnalysis(reflections, initialCause) {
    const analysis = {
      symptom: initialCause || 'Unknown issue',
      why1: '',
      why2: '',
      why3: '',
      why4: '',
      why5: '',
      ultimateRootCause: '',
      preventionLayer: ''
    };

    // Extract common patterns from reflections
    const patterns = this._extractPatterns(reflections);

    // Build 5-Why chain
    analysis.why1 = this._inferWhy1(analysis.symptom, patterns);
    analysis.why2 = this._inferWhy2(analysis.why1, patterns);
    analysis.why3 = this._inferWhy3(analysis.why2, patterns);
    analysis.why4 = this._inferWhy4(analysis.why3, patterns);
    analysis.why5 = this._inferWhy5(analysis.why4, patterns);

    // Identify ultimate root cause
    analysis.ultimateRootCause = analysis.why5 || analysis.why4 || analysis.why3;

    // Determine prevention layer
    analysis.preventionLayer = this._determinePreventionLayer(analysis);

    return analysis;
  }

  /**
   * Extract common patterns from reflections
   */
  _extractPatterns(reflections) {
    const patterns = {
      commonErrors: [],
      commonContexts: [],
      commonOperations: []
    };

    reflections.forEach(reflection => {
      // Extract error patterns
      if (reflection.error_message) {
        patterns.commonErrors.push(reflection.error_message);
      }

      // Extract context patterns
      if (reflection.context) {
        patterns.commonContexts.push(reflection.context);
      }

      // Extract operation patterns
      if (reflection.operation) {
        patterns.commonOperations.push(reflection.operation);
      }
    });

    return patterns;
  }

  /**
   * Infer Why1: Direct cause
   */
  _inferWhy1(symptom, patterns) {
    if (symptom.includes('routing') || symptom.includes('agent selection')) {
      return 'Agent routing logic does not provide clear explanations for selection';
    }
    if (symptom.includes('validation') || symptom.includes('schema')) {
      return 'Schema not validated before operations';
    }
    if (symptom.includes('config') || symptom.includes('environment')) {
      return 'Environment-specific configuration not checked';
    }
    if (symptom.includes('incomplete') || symptom.includes('partial')) {
      return 'No verification after multi-file operations';
    }
    if (symptom.includes('scope') || symptom.includes('unbounded')) {
      return 'Requirements not validated for scope boundaries';
    }
    if (symptom.includes('duplicate') || symptom.includes('idempotency')) {
      return 'Operations not tracked to prevent duplicates';
    }
    return 'Specific validation missing for this operation type';
  }

  /**
   * Infer Why2: Why did Why1 happen?
   */
  _inferWhy2(why1, patterns) {
    if (why1.includes('routing') || why1.includes('explanations')) {
      return 'Routing system lacks transparency and confidence reporting';
    }
    if (why1.includes('schema') || why1.includes('validated')) {
      return 'No pre-operation schema discovery phase';
    }
    if (why1.includes('configuration') || why1.includes('environment')) {
      return 'Assumption that all environments are identical';
    }
    if (why1.includes('verification') || why1.includes('multi-file')) {
      return 'Success claimed based on single operation success';
    }
    if (why1.includes('scope') || why1.includes('requirements')) {
      return 'No structured requirement extraction';
    }
    if (why1.includes('tracked') || why1.includes('duplicates')) {
      return 'No operation registry or fingerprinting';
    }
    return 'No defensive validation framework';
  }

  /**
   * Infer Why3: System-level cause
   */
  _inferWhy3(why2, patterns) {
    if (why2.includes('transparency') || why2.includes('confidence')) {
      return 'Routing treated as black box without observability';
    }
    if (why2.includes('discovery') || why2.includes('pre-operation')) {
      return 'Assumed metadata is known without querying';
    }
    if (why2.includes('assumption') || why2.includes('identical')) {
      return 'No environment-specific configuration framework';
    }
    if (why2.includes('single operation') || why2.includes('success claimed')) {
      return 'No post-operation verification framework';
    }
    if (why2.includes('structured') || why2.includes('extraction')) {
      return 'No requirement validation before planning';
    }
    if (why2.includes('registry') || why2.includes('fingerprinting')) {
      return 'No idempotency framework';
    }
    return 'No preventive quality gates';
  }

  /**
   * Infer Why4: Process-level cause
   */
  _inferWhy4(why3, patterns) {
    return 'Quality gates not built into standard workflow';
  }

  /**
   * Infer Why5: Cultural/organizational cause
   */
  _inferWhy5(why4, patterns) {
    return 'Move fast culture prioritized over defensive checks';
  }

  /**
   * Determine appropriate prevention layer
   */
  _determinePreventionLayer(analysis) {
    if (analysis.why3.includes('framework')) {
      return 'System - Build preventive framework';
    }
    if (analysis.why2.includes('validation') || analysis.why2.includes('checking')) {
      return 'Process - Add validation step';
    }
    return 'Tooling - Implement defensive check';
  }

  /**
   * Select optimal solution from template
   */
  _selectOptimalSolution(template, rcaAnalysis) {
    // For now, select first solution pattern
    // Future: Use ML or heuristics to select best match
    return template.solutionPatterns[0];
  }

  /**
   * Generate alternative solutions
   */
  _generateAlternatives(template, rcaAnalysis) {
    // Return remaining solution patterns as alternatives
    return template.solutionPatterns.slice(1).map(pattern => ({
      name: pattern.name,
      components: pattern.components,
      tradeoffs: this._analyzeTradeoffs(pattern),
      whenToUse: this._determineWhenToUse(pattern)
    }));
  }

  /**
   * Analyze tradeoffs for solution
   */
  _analyzeTradeoffs(pattern) {
    return {
      pros: [
        'Addresses root cause directly',
        'Prevents future occurrences',
        'Automated validation'
      ],
      cons: [
        'Implementation effort required',
        'Slight performance overhead',
        'Maintenance ongoing'
      ]
    };
  }

  /**
   * Determine when to use alternative
   */
  _determineWhenToUse(pattern) {
    return `Use when ${pattern.name.toLowerCase()} is the primary concern`;
  }

  /**
   * Generate detailed implementation plan
   */
  _generateImplementationPlan(solution, rcaAnalysis) {
    const plan = {
      phases: [],
      totalSteps: 0,
      estimatedHours: 0
    };

    // Phase 1: Implementation
    plan.phases.push({
      phase: 1,
      name: 'Core Implementation',
      steps: solution.steps.map((step, i) => ({
        stepNumber: i + 1,
        description: step,
        estimatedHours: 2,
        deliverable: this._inferDeliverable(step),
        dependencies: i === 0 ? [] : [i]
      })),
      estimatedHours: solution.steps.length * 2
    });

    // Phase 2: Integration
    plan.phases.push({
      phase: 2,
      name: 'Hook Integration',
      steps: [
        {
          stepNumber: solution.steps.length + 1,
          description: 'Create pre/post operation hooks',
          estimatedHours: 1,
          deliverable: 'Executable hook scripts',
          dependencies: [solution.steps.length]
        },
        {
          stepNumber: solution.steps.length + 2,
          description: 'Configure environment variables',
          estimatedHours: 0.5,
          deliverable: '.env.example with defaults',
          dependencies: [solution.steps.length + 1]
        }
      ],
      estimatedHours: 1.5
    });

    // Phase 3: Testing
    plan.phases.push({
      phase: 3,
      name: 'Testing & Validation',
      steps: [
        {
          stepNumber: solution.steps.length + 3,
          description: 'Write unit tests for all components',
          estimatedHours: 2,
          deliverable: 'Test suite with >80% coverage',
          dependencies: [solution.steps.length + 2]
        },
        {
          stepNumber: solution.steps.length + 4,
          description: 'Integration testing with real scenarios',
          estimatedHours: 1,
          deliverable: 'Integration test results',
          dependencies: [solution.steps.length + 3]
        },
        {
          stepNumber: solution.steps.length + 5,
          description: 'Generate test report',
          estimatedHours: 0.5,
          deliverable: 'Test results markdown',
          dependencies: [solution.steps.length + 4]
        }
      ],
      estimatedHours: 3.5
    });

    plan.totalSteps = solution.steps.length + 6;
    plan.estimatedHours = plan.phases.reduce((sum, phase) => sum + phase.estimatedHours, 0);

    return plan;
  }

  /**
   * Infer deliverable from step description
   */
  _inferDeliverable(stepDescription) {
    if (stepDescription.includes('implement') || stepDescription.includes('create')) {
      return 'Code implementation';
    }
    if (stepDescription.includes('generate') || stepDescription.includes('log')) {
      return 'Output artifact';
    }
    if (stepDescription.includes('validate') || stepDescription.includes('check')) {
      return 'Validation result';
    }
    return 'Implementation artifact';
  }

  /**
   * Estimate effort
   */
  _estimateEffort(fixPlan) {
    return {
      implementation: fixPlan.implementationPlan.estimatedHours,
      testing: 3.5,
      documentation: 1,
      total: fixPlan.implementationPlan.estimatedHours + 4.5
    };
  }

  /**
   * Calculate prevention rate
   */
  _calculatePreventionRate(fixPlan) {
    // Estimate based on coverage
    const coverageEstimates = {
      'tool-contract': 0.85,
      'schema-parse': 0.90,
      'config-env': 0.95,
      'data-quality': 0.95,
      'planning-scope': 0.80,
      'agent-selection': 0.85,
      'operation-idempotency': 0.95
    };

    const rate = coverageEstimates[fixPlan.cohortType] || 0.80;

    return {
      estimated: rate,
      reasoning: `Based on coverage of ${Math.round(rate * 100)}% of reflection scenarios`,
      assumptions: [
        'Hooks integrated into workflow',
        'Users follow recommendations',
        'Environment variables configured'
      ]
    };
  }

  /**
   * Validate plan actionability
   */
  _validateActionability(fixPlan) {
    const issues = [];

    // Check for specific components
    if (!fixPlan.solutionApproach.components || fixPlan.solutionApproach.components.length === 0) {
      issues.push('No specific components identified');
    }

    // Check for concrete steps
    if (!fixPlan.implementationPlan || fixPlan.implementationPlan.totalSteps === 0) {
      issues.push('No implementation steps defined');
    }

    // Check for success criteria
    if (!fixPlan.successCriteria || fixPlan.successCriteria.length === 0) {
      issues.push('No success criteria defined');
    }

    // Check for effort estimate
    if (!fixPlan.estimatedEffort || !fixPlan.estimatedEffort.total) {
      issues.push('No effort estimate provided');
    }

    return {
      actionable: issues.length === 0,
      issues
    };
  }

  /**
   * Generate human-readable summary
   */
  generateSummary(fixPlan) {
    let summary = `# Fix Plan: ${fixPlan.cohortName}\n\n`;

    summary += `**Generated**: ${fixPlan.timestamp}\n`;
    summary += `**Cohort Type**: ${fixPlan.cohortType}\n`;
    summary += `**Reflections**: ${fixPlan.reflections.count}\n`;
    summary += `**Annual ROI**: $${(fixPlan.reflections.totalROI / 1000).toFixed(1)}K\n\n`;

    // Root cause analysis
    summary += '## Root Cause Analysis (5-Why)\n\n';
    summary += `**Symptom**: ${fixPlan.rootCauseAnalysis.symptom}\n\n`;
    summary += `**Why 1**: ${fixPlan.rootCauseAnalysis.why1}\n`;
    summary += `**Why 2**: ${fixPlan.rootCauseAnalysis.why2}\n`;
    summary += `**Why 3**: ${fixPlan.rootCauseAnalysis.why3}\n`;
    summary += `**Why 4**: ${fixPlan.rootCauseAnalysis.why4}\n`;
    summary += `**Why 5**: ${fixPlan.rootCauseAnalysis.why5}\n\n`;
    summary += `**Ultimate Root Cause**: ${fixPlan.rootCauseAnalysis.ultimateRootCause}\n`;
    summary += `**Prevention Layer**: ${fixPlan.rootCauseAnalysis.preventionLayer}\n\n`;

    // Solution approach
    summary += '## Solution Approach\n\n';
    summary += `**Name**: ${fixPlan.solutionApproach.name}\n\n`;
    summary += `**Components**:\n`;
    fixPlan.solutionApproach.components.forEach(comp => {
      summary += `- ${comp}\n`;
    });
    summary += '\n';

    // Implementation plan
    summary += '## Implementation Plan\n\n';
    fixPlan.implementationPlan.phases.forEach(phase => {
      summary += `### Phase ${phase.phase}: ${phase.name} (${phase.estimatedHours}h)\n\n`;
      phase.steps.forEach(step => {
        summary += `${step.stepNumber}. ${step.description}\n`;
        summary += `   - Estimated: ${step.estimatedHours}h\n`;
        summary += `   - Deliverable: ${step.deliverable}\n\n`;
      });
    });

    // Success criteria
    summary += '## Success Criteria\n\n';
    fixPlan.successCriteria.forEach((criterion, i) => {
      summary += `${i + 1}. ${criterion}\n`;
    });
    summary += '\n';

    // Effort estimate
    summary += '## Effort Estimate\n\n';
    summary += `- Implementation: ${fixPlan.estimatedEffort.implementation}h\n`;
    summary += `- Testing: ${fixPlan.estimatedEffort.testing}h\n`;
    summary += `- Documentation: ${fixPlan.estimatedEffort.documentation}h\n`;
    summary += `- **Total**: ${fixPlan.estimatedEffort.total}h\n\n`;

    // Prevention rate
    summary += '## Expected Prevention Rate\n\n';
    summary += `**${Math.round(fixPlan.preventionRate.estimated * 100)}%** - ${fixPlan.preventionRate.reasoning}\n\n`;

    // Alternatives
    if (fixPlan.alternatives.length > 0) {
      summary += '## Alternative Solutions\n\n';
      fixPlan.alternatives.forEach((alt, i) => {
        summary += `### Alternative ${i + 1}: ${alt.name}\n\n`;
        summary += `**When to use**: ${alt.whenToUse}\n\n`;
        summary += `**Pros**:\n`;
        alt.tradeoffs.pros.forEach(pro => summary += `- ${pro}\n`);
        summary += `\n**Cons**:\n`;
        alt.tradeoffs.cons.forEach(con => summary += `- ${con}\n`);
        summary += '\n';
      });
    }

    return summary;
  }

  /**
   * Save fix plan to file
   */
  async savePlan(fixPlan, filename = null) {
    await fs.mkdir(this.outputDir, { recursive: true });

    const fname = filename || `fix-plan-${fixPlan.cohortType}-${Date.now()}.json`;
    const filePath = path.join(this.outputDir, fname);

    await fs.writeFile(filePath, JSON.stringify(fixPlan, null, 2));

    // Also save markdown summary
    const summary = this.generateSummary(fixPlan);
    const markdownPath = filePath.replace('.json', '.md');
    await fs.writeFile(markdownPath, summary);

    return { jsonPath: filePath, markdownPath };
  }
}

// CLI interface
if (require.main === module) {
  const [,, command, arg1] = process.argv;

  const showHelp = () => {
    console.log(`
Cohort-Specific Fix Planner (Phase 2.3 Enhanced)

Usage:
  node cohort-fix-planner.js <command> [args]

Commands:
  plan <cohort-type>        Generate fix plan for cohort
  classify <text>           Classify text into cohort
  hierarchy                 Show cohort hierarchy
  help                      Show this help

Cohort Types (by priority):
  1. schema-parse           (validation, field, schema issues)
  2. tool-contract          (routing, agent, tool issues)
  3. config-env             (environment, path, config issues)
  4. data-quality           (incomplete, verification issues)
  5. planning-scope         (unbounded, requirements issues)
  6. agent-selection        (wrong agent, orchestration issues)
  7. operation-idempotency  (duplicate, retry issues)

Examples:
  node cohort-fix-planner.js plan tool-contract
  node cohort-fix-planner.js classify "Field does not exist on object"
  node cohort-fix-planner.js hierarchy
    `);
  };

  const planner = new CohortFixPlanner();

  async function main() {
    switch (command) {
      case 'plan': {
        if (!arg1) {
          console.error('Error: cohort-type required');
          showHelp();
          process.exit(1);
        }

        console.log(`Generating fix plan for cohort: ${arg1}...\n`);

        const cohortData = {
          cohortType: arg1,
          reflections: [{ id: 1 }, { id: 2 }],
          rootCause: 'Sample root cause',
          impact: { roiAnnualValue: 10000, frequency: 5 }
        };

        const fixPlan = await planner.generateFixPlan(cohortData);
        const summary = planner.generateSummary(fixPlan);

        console.log(summary);

        const { jsonPath, markdownPath } = await planner.savePlan(fixPlan);
        console.log(`\nFix plan saved to:`);
        console.log(`  JSON: ${jsonPath}`);
        console.log(`  Markdown: ${markdownPath}`);
        break;
      }

      case 'classify': {
        if (!arg1) {
          console.error('Error: text to classify required');
          showHelp();
          process.exit(1);
        }

        // Get remaining args as text
        const text = process.argv.slice(3).join(' ');

        console.log(`Classifying: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"\n`);

        const result = planner.classifyReflection({
          what_happened: text,
          error_message: text
        });

        console.log('Classification Result:');
        console.log('─'.repeat(50));
        console.log(`  Primary Cohort: ${result.primaryCohort}`);
        console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}% (${result.confidenceLevel})`);
        console.log(`  Reliable: ${result.isReliable ? 'Yes' : 'No (< 70%)'}`);
        console.log(`  Hierarchy Priority: ${result.hierarchy.priority}`);

        if (result.secondaryCohorts.length > 0) {
          console.log(`\nSecondary Cohorts:`);
          result.secondaryCohorts.forEach(sc => {
            console.log(`  - ${sc.cohort}: ${(sc.score * 100).toFixed(1)}%`);
          });
        }

        console.log(`\nRecommendations:`);
        result.recommendation.forEach(rec => {
          console.log(`  • ${rec}`);
        });

        console.log(`\nAll Scores:`);
        Object.entries(result.allScores)
          .sort(([,a], [,b]) => b - a)
          .forEach(([cohort, score]) => {
            const bar = '█'.repeat(Math.round(score * 20));
            console.log(`  ${cohort.padEnd(22)} ${bar.padEnd(20)} ${(score * 100).toFixed(1)}%`);
          });
        break;
      }

      case 'hierarchy': {
        console.log('Cohort Hierarchy (Phase 2.3):');
        console.log('═'.repeat(60));
        console.log(`${'Priority'.padEnd(10)} ${'Cohort'.padEnd(25)} ${'Weight'.padEnd(10)} ${'Threshold'}`);
        console.log('─'.repeat(60));

        planner.cohortHierarchy.forEach(h => {
          console.log(`${String(h.priority).padEnd(10)} ${h.cohort.padEnd(25)} ${(h.weight * 100).toFixed(0)}%`.padEnd(10), `${planner.confidenceThresholds.HIGH * 100}% (reliable)`);
        });

        console.log('\nConfidence Thresholds:');
        console.log(`  HIGH:   >= ${planner.confidenceThresholds.HIGH * 100}% (reliable classification)`);
        console.log(`  MEDIUM: >= ${planner.confidenceThresholds.MEDIUM * 100}% (moderate confidence)`);
        console.log(`  LOW:    >= ${planner.confidenceThresholds.LOW * 100}% (consider secondary cohorts)`);
        break;
      }

      case 'help':
      default:
        showHelp();
        if (command && command !== 'help') {
          console.error(`\nUnknown command: ${command}`);
          process.exit(1);
        }
    }
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { CohortFixPlanner };
