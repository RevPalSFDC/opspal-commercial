/**
 * Continuous Loop Manager
 *
 * Manages the feedback loop for the observability layer:
 * - Track recommendation implementation status
 * - Measure impact of applied changes
 * - Generate before/after comparisons
 * - Log learning outcomes for future analysis
 * - Alert on significant metric changes
 *
 * @module continuous-loop-manager
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Measurement windows for impact assessment
 */
const MEASUREMENT_WINDOWS = {
  quick: { days: 2, name: 'Quick Check' },
  standard: { days: 7, name: 'Standard Assessment' },
  extended: { days: 30, name: 'Extended Analysis' }
};

/**
 * Continuous Loop Manager class
 */
class ContinuousLoopManager {
  constructor(portal, options = {}) {
    this.portal = portal;
    this.basePath = options.basePath || `instances/${portal}/observability`;
    this.historyPath = path.join(this.basePath, 'history');
  }

  /**
   * Initialize storage directories
   */
  async initialize() {
    await fs.mkdir(this.historyPath, { recursive: true });
    await fs.mkdir(path.join(this.basePath, 'analysis/recommendations'), { recursive: true });
  }

  /**
   * Load loop state
   */
  async loadState() {
    try {
      const statePath = path.join(this.historyPath, 'feedback-loop.json');
      return JSON.parse(await fs.readFile(statePath, 'utf8'));
    } catch (e) {
      return {
        cycleCount: 0,
        lastCycle: null,
        pendingMeasurements: [],
        learningQueue: [],
        cumulativeStats: {
          totalRecommendations: 0,
          totalImplemented: 0,
          successfulImplementations: 0,
          avgImpactImprovement: 0
        }
      };
    }
  }

  /**
   * Save loop state
   */
  async saveState(state) {
    const statePath = path.join(this.historyPath, 'feedback-loop.json');
    state.lastUpdated = new Date().toISOString();
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Record a new implementation
   */
  async recordImplementation(implementation) {
    const state = await this.loadState();

    const record = {
      id: implementation.id || `impl-${Date.now()}`,
      recommendationId: implementation.recommendationId,
      type: implementation.type,
      description: implementation.description,
      implementedAt: new Date().toISOString(),
      autoImplemented: implementation.autoImplemented || false,
      target: implementation.target,
      values: implementation.values,
      snapshotBefore: implementation.snapshotBefore,
      status: 'measuring',
      measurements: {}
    };

    // Schedule measurements
    state.pendingMeasurements.push({
      implementationId: record.id,
      scheduledMeasurements: Object.entries(MEASUREMENT_WINDOWS).map(([key, window]) => ({
        window: key,
        dueAt: new Date(Date.now() + window.days * 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      }))
    });

    // Update stats
    state.cumulativeStats.totalImplemented++;

    // Save implementation record
    const changesPath = path.join(this.historyPath, 'changes.json');
    let changes = [];
    try {
      changes = JSON.parse(await fs.readFile(changesPath, 'utf8'));
    } catch (e) {}
    changes.push(record);
    await fs.writeFile(changesPath, JSON.stringify(changes, null, 2));

    await this.saveState(state);
    return record;
  }

  /**
   * Process pending measurements
   */
  async processPendingMeasurements(getMetricsFn) {
    const state = await this.loadState();
    const now = new Date();
    const results = [];

    for (const pending of state.pendingMeasurements) {
      for (const scheduled of pending.scheduledMeasurements) {
        if (scheduled.completed) continue;

        const dueAt = new Date(scheduled.dueAt);
        if (dueAt > now) continue;

        // Time to measure
        try {
          const measurement = await this.takeMeasurement(
            pending.implementationId,
            scheduled.window,
            getMetricsFn
          );
          scheduled.completed = true;
          scheduled.result = measurement;
          results.push(measurement);
        } catch (e) {
          console.error(`Measurement failed for ${pending.implementationId}:`, e.message);
          scheduled.error = e.message;
        }
      }
    }

    // Clean up fully measured implementations
    state.pendingMeasurements = state.pendingMeasurements.filter(p =>
      p.scheduledMeasurements.some(s => !s.completed)
    );

    await this.saveState(state);
    return results;
  }

  /**
   * Take a measurement for an implementation
   */
  async takeMeasurement(implementationId, windowName, getMetricsFn) {
    const window = MEASUREMENT_WINDOWS[windowName];
    const implementation = await this.getImplementation(implementationId);

    if (!implementation) {
      throw new Error(`Implementation ${implementationId} not found`);
    }

    const implementedAt = new Date(implementation.implementedAt);
    const windowEnd = new Date(implementedAt.getTime() + window.days * 24 * 60 * 60 * 1000);

    // Get before metrics (use snapshot or calculate)
    const beforeMetrics = implementation.snapshotBefore ||
      await getMetricsFn(
        new Date(implementedAt.getTime() - window.days * 24 * 60 * 60 * 1000),
        implementedAt
      );

    // Get after metrics
    const afterMetrics = await getMetricsFn(implementedAt, windowEnd);

    // Calculate impact
    const impact = this.calculateImpact(beforeMetrics, afterMetrics);

    const measurement = {
      implementationId,
      window: windowName,
      windowDays: window.days,
      measuredAt: new Date().toISOString(),
      beforeMetrics,
      afterMetrics,
      impact,
      assessment: this.assessImpact(impact)
    };

    // Store measurement
    await this.storeMeasurement(implementationId, measurement);

    // Queue for learning if final measurement
    if (windowName === 'extended') {
      await this.queueForLearning(implementationId, measurement);
    }

    return measurement;
  }

  /**
   * Calculate impact between before and after metrics
   */
  calculateImpact(before, after) {
    const metrics = ['openRate', 'clickRate', 'bounceRate', 'conversionRate'];
    const impact = {};

    for (const metric of metrics) {
      const beforeVal = before?.[metric];
      const afterVal = after?.[metric];

      if (beforeVal != null && afterVal != null) {
        const difference = afterVal - beforeVal;
        const percentChange = beforeVal !== 0
          ? ((difference / beforeVal) * 100).toFixed(1)
          : (afterVal !== 0 ? '∞' : '0');

        impact[metric] = {
          before: beforeVal,
          after: afterVal,
          difference: difference.toFixed(2),
          percentChange
        };
      }
    }

    return impact;
  }

  /**
   * Assess overall impact
   */
  assessImpact(impact) {
    // Determine primary metric (usually openRate or clickRate)
    const primaryMetric = impact.openRate || impact.clickRate;

    if (!primaryMetric) {
      return { status: 'insufficient_data', confidence: 0 };
    }

    const change = parseFloat(primaryMetric.percentChange);

    if (isNaN(change)) {
      return { status: 'insufficient_data', confidence: 0 };
    }

    if (change > 10) {
      return { status: 'positive', magnitude: 'significant', confidence: 'high' };
    } else if (change > 5) {
      return { status: 'positive', magnitude: 'moderate', confidence: 'medium' };
    } else if (change > 0) {
      return { status: 'positive', magnitude: 'minor', confidence: 'low' };
    } else if (change > -5) {
      return { status: 'neutral', magnitude: 'negligible', confidence: 'medium' };
    } else if (change > -10) {
      return { status: 'negative', magnitude: 'moderate', confidence: 'medium' };
    } else {
      return { status: 'negative', magnitude: 'significant', confidence: 'high' };
    }
  }

  /**
   * Store measurement result
   */
  async storeMeasurement(implementationId, measurement) {
    const measurementsPath = path.join(this.historyPath, 'impact-measurements.json');
    let measurements = [];

    try {
      measurements = JSON.parse(await fs.readFile(measurementsPath, 'utf8'));
    } catch (e) {}

    measurements.push(measurement);
    await fs.writeFile(measurementsPath, JSON.stringify(measurements, null, 2));

    // Also update the implementation record
    const changesPath = path.join(this.historyPath, 'changes.json');
    let changes = [];
    try {
      changes = JSON.parse(await fs.readFile(changesPath, 'utf8'));
    } catch (e) {}

    const changeIndex = changes.findIndex(c => c.id === implementationId);
    if (changeIndex >= 0) {
      changes[changeIndex].measurements[measurement.window] = measurement;
      changes[changeIndex].latestAssessment = measurement.assessment;

      // Update status based on measurement
      if (measurement.assessment.status === 'negative' &&
          measurement.assessment.magnitude === 'significant') {
        changes[changeIndex].status = 'rollback_candidate';
      } else if (measurement.window === 'extended') {
        changes[changeIndex].status = 'measured';
      }

      await fs.writeFile(changesPath, JSON.stringify(changes, null, 2));
    }
  }

  /**
   * Queue implementation for learning
   */
  async queueForLearning(implementationId, finalMeasurement) {
    const state = await this.loadState();

    state.learningQueue.push({
      implementationId,
      queuedAt: new Date().toISOString(),
      finalAssessment: finalMeasurement.assessment
    });

    // Update cumulative stats
    if (finalMeasurement.assessment.status === 'positive') {
      state.cumulativeStats.successfulImplementations++;
    }

    // Update average improvement
    const totalMeasured = state.cumulativeStats.totalImplemented;
    const successRate = state.cumulativeStats.successfulImplementations / totalMeasured;
    state.cumulativeStats.successRate = (successRate * 100).toFixed(1);

    await this.saveState(state);
  }

  /**
   * Get an implementation record
   */
  async getImplementation(implementationId) {
    const changesPath = path.join(this.historyPath, 'changes.json');
    try {
      const changes = JSON.parse(await fs.readFile(changesPath, 'utf8'));
      return changes.find(c => c.id === implementationId);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get implementations needing rollback consideration
   */
  async getRollbackCandidates() {
    const changesPath = path.join(this.historyPath, 'changes.json');
    try {
      const changes = JSON.parse(await fs.readFile(changesPath, 'utf8'));
      return changes.filter(c => c.status === 'rollback_candidate');
    } catch (e) {
      return [];
    }
  }

  /**
   * Get learning summary for baseline updates
   */
  async getLearningSummary() {
    const state = await this.loadState();
    const changesPath = path.join(this.historyPath, 'changes.json');

    let changes = [];
    try {
      changes = JSON.parse(await fs.readFile(changesPath, 'utf8'));
    } catch (e) {}

    // Group by type
    const byType = {};
    for (const change of changes.filter(c => c.latestAssessment)) {
      const type = change.type;
      if (!byType[type]) {
        byType[type] = { successes: 0, failures: 0, neutral: 0 };
      }

      const status = change.latestAssessment.status;
      if (status === 'positive') byType[type].successes++;
      else if (status === 'negative') byType[type].failures++;
      else byType[type].neutral++;
    }

    // Calculate success rates by type
    const successRatesByType = {};
    for (const [type, counts] of Object.entries(byType)) {
      const total = counts.successes + counts.failures + counts.neutral;
      successRatesByType[type] = {
        total,
        successRate: total > 0 ? ((counts.successes / total) * 100).toFixed(1) : null,
        recommendation: counts.successes > counts.failures ? 'prefer' :
                        counts.failures > counts.successes ? 'avoid' : 'neutral'
      };
    }

    return {
      cumulativeStats: state.cumulativeStats,
      successRatesByType,
      pendingLearning: state.learningQueue.length,
      lastUpdated: state.lastUpdated
    };
  }

  /**
   * Record a complete cycle run
   */
  async recordCycleRun(cycleResult) {
    const state = await this.loadState();

    state.cycleCount++;
    state.lastCycle = {
      timestamp: new Date().toISOString(),
      result: cycleResult
    };

    await this.saveState(state);
  }
}

module.exports = {
  ContinuousLoopManager,
  MEASUREMENT_WINDOWS
};
