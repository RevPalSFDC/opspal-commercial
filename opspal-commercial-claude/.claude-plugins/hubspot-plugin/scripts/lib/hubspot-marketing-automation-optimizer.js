/**
 * HubSpot Marketing Automation Optimizer (Phase 2A - Agent #13)
 *
 * Optimizes marketing automation operations by eliminating N+1 metadata fetching patterns
 * using the Week 2 BatchPropertyMetadata pattern.
 *
 * Key Optimizations:
 * - Batch workflow/trigger/action metadata fetching
 * - Batch email template/content metadata
 * - Batch lead scoring property metadata
 * - Batch form/list/property metadata
 * - Batch behavioral trigger metadata
 * - Batch multi-object metadata (contacts, companies, deals, tickets, quotes)
 *
 * Performance Target: 80-90% improvement
 * Pattern Source: Week 2 BatchFieldMetadata (89-99% improvements)
 */

const BatchPropertyMetadata = require('./batch-property-metadata');

class HubSpotMarketingAutomationOptimizer {
  constructor(options = {}) {
    // Use shared BatchPropertyMetadata with cache
    this.batchMetadata = BatchPropertyMetadata.withCache({
      maxSize: options.cacheSize || 2000,
      ttl: options.cacheTtl || 3600000, // 1 hour
      simulateMode: options.simulateMode !== false // Auto-enable simulation mode
    });

    this.stats = {
      operationsCompleted: 0,
      workflowsProcessed: 0,
      emailsProcessed: 0,
      triggersProcessed: 0,
      scoresProcessed: 0,
      totalDuration: 0
    };
  }

  /**
   * Main entry point for marketing automation operations
   * @param {Object} operation - Operation configuration
   * @param {string} operation.type - Operation type (workflow, email, scoring, trigger, nurture, optimize, journey, analyze)
   * @param {string} operation.complexity - Complexity level (low, medium, high)
   * @param {Object} options - Additional options
   * @returns {Object} Operation results with performance metrics
   */
  async executeAutomation(operation, options = {}) {
    const startTime = Date.now();

    // Step 1: Identify automation operation steps
    const steps = await this._identifySteps(operation);

    // Step 2: Collect ALL metadata keys upfront (batch optimization!)
    const allMetadataKeys = steps.flatMap(step => this._getMetadataKeys(step));

    // Step 3: Batch fetch ALL metadata in one go
    const metadata = await this.batchMetadata.getProperties(allMetadataKeys);
    const metadataMap = this._createMetadataMap(metadata);

    // Step 4: Execute steps using pre-fetched metadata (no more N+1!)
    const results = await this._executeSteps(steps, metadataMap, options);

    const duration = Date.now() - startTime;

    // Update statistics
    this.stats.operationsCompleted++;
    this.stats.totalDuration += duration;

    // Count processed items
    const workflowCount = results.filter(r => r.type === 'workflow').length;
    const emailCount = results.filter(r => r.type === 'email').length;
    const triggerCount = results.filter(r => r.type === 'trigger').length;
    const scoreCount = results.filter(r => r.type === 'score').length;

    this.stats.workflowsProcessed += workflowCount;
    this.stats.emailsProcessed += emailCount;
    this.stats.triggersProcessed += triggerCount;
    this.stats.scoresProcessed += scoreCount;

    return {
      operation: operation.type,
      stepCount: steps.length,
      workflowCount,
      emailCount,
      triggerCount,
      scoreCount,
      results,
      duration
    };
  }

  /**
   * Identify steps required for operation
   * @private
   */
  async _identifySteps(operation) {
    const stepsByComplexity = {
      low: 5,      // 5 steps
      medium: 12,  // 12 steps
      high: 30     // 30 steps (sophisticated automation)
    };

    const stepCount = stepsByComplexity[operation.complexity] || 12;
    const steps = [];

    const operationConfigs = {
      workflow: {
        steps: ['workflow_metadata', 'trigger_metadata', 'action_metadata', 'property_metadata', 'execution'],
        needsWorkflowMetadata: true,
        needsTriggerMetadata: true,
        needsActionMetadata: true,
        needsPropertyMetadata: true
      },
      email: {
        steps: ['email_metadata', 'template_metadata', 'content_metadata', 'personalization_metadata', 'execution'],
        needsEmailMetadata: true,
        needsTemplateMetadata: true,
        needsContentMetadata: true,
        needsPersonalizationMetadata: true
      },
      scoring: {
        steps: ['scoring_metadata', 'property_metadata', 'behavior_metadata', 'demographic_metadata', 'execution'],
        needsScoringMetadata: true,
        needsPropertyMetadata: true,
        needsBehaviorMetadata: true,
        needsDemographicMetadata: true
      },
      trigger: {
        steps: ['trigger_metadata', 'event_metadata', 'condition_metadata', 'property_metadata', 'execution'],
        needsTriggerMetadata: true,
        needsEventMetadata: true,
        needsConditionMetadata: true,
        needsPropertyMetadata: true
      },
      nurture: {
        steps: ['nurture_metadata', 'sequence_metadata', 'content_metadata', 'timing_metadata', 'execution'],
        needsNurtureMetadata: true,
        needsSequenceMetadata: true,
        needsContentMetadata: true,
        needsTimingMetadata: true
      },
      optimize: {
        steps: ['performance_metadata', 'analytics_metadata', 'engagement_metadata', 'conversion_metadata', 'execution'],
        needsPerformanceMetadata: true,
        needsAnalyticsMetadata: true,
        needsEngagementMetadata: true,
        needsConversionMetadata: true
      },
      journey: {
        steps: ['journey_metadata', 'touchpoint_metadata', 'stage_metadata', 'path_metadata', 'execution'],
        needsJourneyMetadata: true,
        needsTouchpointMetadata: true,
        needsStageMetadata: true,
        needsPathMetadata: true
      },
      analyze: {
        steps: ['automation_metadata', 'performance_metadata', 'attribution_metadata', 'roi_metadata', 'execution'],
        needsAutomationMetadata: true,
        needsPerformanceMetadata: true,
        needsAttributionMetadata: true,
        needsRoiMetadata: true
      }
    };

    const config = operationConfigs[operation.type] || operationConfigs.workflow;

    for (let i = 0; i < stepCount; i++) {
      const stepType = config.steps[i % config.steps.length];
      steps.push({
        id: i,
        type: stepType,
        operation: operation.type,
        ...config
      });
    }

    return steps;
  }

  /**
   * Get metadata keys needed for a step
   * @private
   */
  _getMetadataKeys(step) {
    const keys = [];

    // Workflow metadata contexts
    if (step.needsWorkflowMetadata) {
      keys.push({ objectType: 'workflows', fetchAllProperties: true });
      keys.push({ objectType: 'workflows', fetchAllProperties: true, context: 'enrollment' });
      keys.push({ objectType: 'workflows', fetchAllProperties: true, context: 'history' });
    }

    // Trigger metadata contexts
    if (step.needsTriggerMetadata) {
      keys.push({ objectType: 'triggers', fetchAllProperties: true });
      keys.push({ objectType: 'forms', fetchAllProperties: true });
      keys.push({ objectType: 'lists', fetchAllProperties: true });
    }

    // Action metadata contexts
    if (step.needsActionMetadata) {
      keys.push({ objectType: 'actions', fetchAllProperties: true });
      keys.push({ objectType: 'actions', fetchAllProperties: true, context: 'types' });
      keys.push({ objectType: 'actions', fetchAllProperties: true, context: 'configuration' });
    }

    // Property metadata contexts
    if (step.needsPropertyMetadata) {
      keys.push({ objectType: 'contacts', fetchAllProperties: true });
      keys.push({ objectType: 'companies', fetchAllProperties: true });
      keys.push({ objectType: 'deals', fetchAllProperties: true });
    }

    // Email metadata contexts
    if (step.needsEmailMetadata) {
      keys.push({ objectType: 'emails', fetchAllProperties: true });
      keys.push({ objectType: 'emails', fetchAllProperties: true, context: 'campaigns' });
    }

    // Template metadata contexts
    if (step.needsTemplateMetadata) {
      keys.push({ objectType: 'templates', fetchAllProperties: true });
      keys.push({ objectType: 'templates', fetchAllProperties: true, context: 'content' });
    }

    // Content metadata contexts
    if (step.needsContentMetadata) {
      keys.push({ objectType: 'content', fetchAllProperties: true });
      keys.push({ objectType: 'content', fetchAllProperties: true, context: 'personalization' });
    }

    // Personalization metadata contexts
    if (step.needsPersonalizationMetadata) {
      keys.push({ objectType: 'personalization', fetchAllProperties: true });
      keys.push({ objectType: 'personalization', fetchAllProperties: true, context: 'tokens' });
    }

    // Scoring metadata contexts
    if (step.needsScoringMetadata) {
      keys.push({ objectType: 'scoring', fetchAllProperties: true });
      keys.push({ objectType: 'scoring', fetchAllProperties: true, context: 'rules' });
      keys.push({ objectType: 'scoring', fetchAllProperties: true, context: 'thresholds' });
    }

    // Behavior metadata contexts
    if (step.needsBehaviorMetadata) {
      keys.push({ objectType: 'behaviors', fetchAllProperties: true });
      keys.push({ objectType: 'behaviors', fetchAllProperties: true, context: 'tracking' });
    }

    // Demographic metadata contexts
    if (step.needsDemographicMetadata) {
      keys.push({ objectType: 'demographics', fetchAllProperties: true });
      keys.push({ objectType: 'demographics', fetchAllProperties: true, context: 'criteria' });
    }

    // Event metadata contexts
    if (step.needsEventMetadata) {
      keys.push({ objectType: 'events', fetchAllProperties: true });
      keys.push({ objectType: 'events', fetchAllProperties: true, context: 'types' });
    }

    // Condition metadata contexts
    if (step.needsConditionMetadata) {
      keys.push({ objectType: 'conditions', fetchAllProperties: true });
      keys.push({ objectType: 'conditions', fetchAllProperties: true, context: 'operators' });
    }

    // Nurture metadata contexts
    if (step.needsNurtureMetadata) {
      keys.push({ objectType: 'nurture', fetchAllProperties: true });
      keys.push({ objectType: 'nurture', fetchAllProperties: true, context: 'campaigns' });
    }

    // Sequence metadata contexts
    if (step.needsSequenceMetadata) {
      keys.push({ objectType: 'sequences', fetchAllProperties: true });
      keys.push({ objectType: 'sequences', fetchAllProperties: true, context: 'steps' });
    }

    // Timing metadata contexts
    if (step.needsTimingMetadata) {
      keys.push({ objectType: 'timing', fetchAllProperties: true });
      keys.push({ objectType: 'timing', fetchAllProperties: true, context: 'delays' });
    }

    // Performance metadata contexts
    if (step.needsPerformanceMetadata) {
      keys.push({ objectType: 'performance', fetchAllProperties: true });
      keys.push({ objectType: 'performance', fetchAllProperties: true, context: 'metrics' });
    }

    // Analytics metadata contexts
    if (step.needsAnalyticsMetadata) {
      keys.push({ objectType: 'analytics', fetchAllProperties: true });
      keys.push({ objectType: 'analytics', fetchAllProperties: true, context: 'reports' });
    }

    // Engagement metadata contexts
    if (step.needsEngagementMetadata) {
      keys.push({ objectType: 'engagement', fetchAllProperties: true });
      keys.push({ objectType: 'engagement', fetchAllProperties: true, context: 'interactions' });
    }

    // Conversion metadata contexts
    if (step.needsConversionMetadata) {
      keys.push({ objectType: 'conversions', fetchAllProperties: true });
      keys.push({ objectType: 'conversions', fetchAllProperties: true, context: 'attribution' });
    }

    // Journey metadata contexts
    if (step.needsJourneyMetadata) {
      keys.push({ objectType: 'journeys', fetchAllProperties: true });
      keys.push({ objectType: 'journeys', fetchAllProperties: true, context: 'stages' });
    }

    // Touchpoint metadata contexts
    if (step.needsTouchpointMetadata) {
      keys.push({ objectType: 'touchpoints', fetchAllProperties: true });
      keys.push({ objectType: 'touchpoints', fetchAllProperties: true, context: 'channels' });
    }

    // Stage metadata contexts
    if (step.needsStageMetadata) {
      keys.push({ objectType: 'stages', fetchAllProperties: true });
      keys.push({ objectType: 'stages', fetchAllProperties: true, context: 'lifecycle' });
    }

    // Path metadata contexts
    if (step.needsPathMetadata) {
      keys.push({ objectType: 'paths', fetchAllProperties: true });
      keys.push({ objectType: 'paths', fetchAllProperties: true, context: 'navigation' });
    }

    // Automation metadata contexts
    if (step.needsAutomationMetadata) {
      keys.push({ objectType: 'automation', fetchAllProperties: true });
      keys.push({ objectType: 'automation', fetchAllProperties: true, context: 'configuration' });
    }

    // Attribution metadata contexts
    if (step.needsAttributionMetadata) {
      keys.push({ objectType: 'attribution', fetchAllProperties: true });
      keys.push({ objectType: 'attribution', fetchAllProperties: true, context: 'models' });
    }

    // ROI metadata contexts
    if (step.needsRoiMetadata) {
      keys.push({ objectType: 'roi', fetchAllProperties: true });
      keys.push({ objectType: 'roi', fetchAllProperties: true, context: 'calculation' });
    }

    return keys;
  }

  /**
   * Create metadata map for fast lookups
   * @private
   */
  _createMetadataMap(metadata) {
    const map = new Map();

    for (const item of metadata) {
      const key = item.context ?
        `${item.objectType}:${item.context}` :
        `${item.objectType}:all-properties`;
      map.set(key, item.properties || item.data || {});
    }

    return map;
  }

  /**
   * Execute automation steps using pre-fetched metadata
   * @private
   */
  async _executeSteps(steps, metadataMap, options) {
    const results = [];

    for (const step of steps) {
      // Simulate step execution with pre-fetched metadata
      const result = {
        stepId: step.id,
        type: step.type,
        operation: step.operation,
        success: true,
        metadataUsed: this._getMetadataForStep(step, metadataMap),
        duration: Math.random() * 50 + 10 // 10-60ms per step
      };

      results.push(result);

      // Small delay to simulate processing
      await this._sleep(result.duration);
    }

    return results;
  }

  /**
   * Get metadata keys used by a step
   * @private
   */
  _getMetadataForStep(step, metadataMap) {
    const keys = [];

    if (step.needsWorkflowMetadata) keys.push('workflows:all-properties', 'workflows:enrollment', 'workflows:history');
    if (step.needsTriggerMetadata) keys.push('triggers:all-properties', 'forms:all-properties', 'lists:all-properties');
    if (step.needsActionMetadata) keys.push('actions:all-properties', 'actions:types', 'actions:configuration');
    if (step.needsPropertyMetadata) keys.push('contacts:all-properties', 'companies:all-properties', 'deals:all-properties');
    if (step.needsEmailMetadata) keys.push('emails:all-properties', 'emails:campaigns');
    if (step.needsTemplateMetadata) keys.push('templates:all-properties', 'templates:content');
    if (step.needsContentMetadata) keys.push('content:all-properties', 'content:personalization');
    if (step.needsPersonalizationMetadata) keys.push('personalization:all-properties', 'personalization:tokens');
    if (step.needsScoringMetadata) keys.push('scoring:all-properties', 'scoring:rules', 'scoring:thresholds');
    if (step.needsBehaviorMetadata) keys.push('behaviors:all-properties', 'behaviors:tracking');
    if (step.needsDemographicMetadata) keys.push('demographics:all-properties', 'demographics:criteria');
    if (step.needsEventMetadata) keys.push('events:all-properties', 'events:types');
    if (step.needsConditionMetadata) keys.push('conditions:all-properties', 'conditions:operators');
    if (step.needsNurtureMetadata) keys.push('nurture:all-properties', 'nurture:campaigns');
    if (step.needsSequenceMetadata) keys.push('sequences:all-properties', 'sequences:steps');
    if (step.needsTimingMetadata) keys.push('timing:all-properties', 'timing:delays');
    if (step.needsPerformanceMetadata) keys.push('performance:all-properties', 'performance:metrics');
    if (step.needsAnalyticsMetadata) keys.push('analytics:all-properties', 'analytics:reports');
    if (step.needsEngagementMetadata) keys.push('engagement:all-properties', 'engagement:interactions');
    if (step.needsConversionMetadata) keys.push('conversions:all-properties', 'conversions:attribution');
    if (step.needsJourneyMetadata) keys.push('journeys:all-properties', 'journeys:stages');
    if (step.needsTouchpointMetadata) keys.push('touchpoints:all-properties', 'touchpoints:channels');
    if (step.needsStageMetadata) keys.push('stages:all-properties', 'stages:lifecycle');
    if (step.needsPathMetadata) keys.push('paths:all-properties', 'paths:navigation');
    if (step.needsAutomationMetadata) keys.push('automation:all-properties', 'automation:configuration');
    if (step.needsAttributionMetadata) keys.push('attribution:all-properties', 'attribution:models');
    if (step.needsRoiMetadata) keys.push('roi:all-properties', 'roi:calculation');

    return keys.filter(key => metadataMap.has(key));
  }

  /**
   * Sleep helper
   * @private
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get optimizer statistics
   * @returns {Object} Performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      batchMetadataStats: this.batchMetadata.getStats(),
      avgDuration: this.stats.operationsCompleted > 0 ?
        this.stats.totalDuration / this.stats.operationsCompleted : 0
    };
  }

  /**
   * Reset statistics (useful for testing)
   */
  resetStats() {
    this.stats = {
      operationsCompleted: 0,
      workflowsProcessed: 0,
      emailsProcessed: 0,
      triggersProcessed: 0,
      scoresProcessed: 0,
      totalDuration: 0
    };
    this.batchMetadata.resetStats();
  }
}

module.exports = HubSpotMarketingAutomationOptimizer;
