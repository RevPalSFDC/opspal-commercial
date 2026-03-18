#!/usr/bin/env node

/**
 * ROI Tracker
 *
 * Purpose: Track estimated vs actual ROI from generated improvements.
 * Validates ROI estimates from hooks, playbooks, and routing optimizations
 * using real performance data.
 *
 * Features:
 * - Track estimated ROI at generation time
 * - Verify actual impact after 30-day measurement period
 * - Compare performance before/after improvements
 * - Generate ROI reports for stakeholders
 *
 * Usage:
 *   const { ROITracker } = require('./roi-tracker');
 *
 *   const tracker = new ROITracker();
 *
 *   // Record estimated ROI
 *   tracker.recordEstimate('hook:schema-parse-001', {
 *     type: 'prevention_hook',
 *     estimated_annual_value: 500,
 *     description: 'Schema parse error prevention'
 *   });
 *
 *   // Verify actual ROI after measurement period
 *   tracker.measureActual('hook:schema-parse-001', {
 *     errors_prevented: 12,
 *     time_saved_hours: 3
 *   });
 *
 * @module roi-tracker
 * @version 1.0.0
 * @created 2026-02-04
 */

'use strict';

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const DATA_DIR = path.join(__dirname, '../../data');
const STATE_FILE = path.join(DATA_DIR, 'roi-tracker.json');
const HISTORY_FILE = path.join(DATA_DIR, 'roi-history.json');

// Measurement period (days before we can measure actual ROI)
const MEASUREMENT_PERIOD_DAYS = 30;

// Default ROI estimates by component type
const DEFAULT_ESTIMATES = {
  prevention_hook: 500,      // $500/year per hook
  playbook: 200,             // $200/year per playbook
  skill: 300,                // $300/year per skill
  routing_optimization: 100, // $100/year per optimization
  agent_improvement: 250     // $250/year per agent improvement
};

// Cost basis for calculations
const COST_BASIS = {
  hourly_rate: 100,          // Consultant hourly rate
  error_cost: 50,            // Cost per error to investigate/fix
  token_cost: 0.003          // Cost per 1K tokens
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(filepath, defaultValue) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    console.warn(`Warning: Could not load ${filepath}: ${e.message}`);
  }
  return defaultValue;
}

function saveJSON(filepath, data) {
  ensureDataDir();
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

// =============================================================================
// ROI TRACKER
// =============================================================================

class ROITracker {
  constructor(options = {}) {
    this.stateFile = options.stateFile || STATE_FILE;
    this.historyFile = options.historyFile || HISTORY_FILE;

    this.state = loadJSON(this.stateFile, {
      components: {},
      totals: {
        estimated_annual: 0,
        measured_annual: 0,
        components_tracked: 0,
        components_measured: 0
      },
      last_updated: null,
      version: '1.0.0'
    });

    this.history = loadJSON(this.historyFile, {
      measurements: [],
      monthly_snapshots: []
    });
  }

  /**
   * Record estimated ROI for a new component
   *
   * @param {string} componentId - Unique identifier (e.g., 'hook:schema-parse-001')
   * @param {object} estimate - ROI estimate details
   * @param {string} estimate.type - Component type (prevention_hook, playbook, etc.)
   * @param {number} [estimate.estimated_annual_value] - Estimated annual value
   * @param {string} estimate.description - What the component does
   * @param {string} [estimate.taxonomy] - Error taxonomy (for hooks)
   */
  recordEstimate(componentId, estimate) {
    const timestamp = new Date().toISOString();

    // Use default estimate if not provided
    const estimatedValue = estimate.estimated_annual_value ||
      DEFAULT_ESTIMATES[estimate.type] || 200;

    this.state.components[componentId] = {
      id: componentId,
      type: estimate.type,
      description: estimate.description,
      taxonomy: estimate.taxonomy,
      created_at: timestamp,
      estimated_annual_value: estimatedValue,
      status: 'pending_measurement',
      measurement_eligible_at: new Date(
        Date.now() + MEASUREMENT_PERIOD_DAYS * 24 * 60 * 60 * 1000
      ).toISOString(),
      measurements: [],
      actual_annual_value: null,
      accuracy_ratio: null
    };

    // Update totals
    this.state.totals.estimated_annual += estimatedValue;
    this.state.totals.components_tracked++;

    this.state.last_updated = timestamp;
    this._save();

    return {
      componentId,
      estimated_annual_value: estimatedValue,
      measurement_eligible_at: this.state.components[componentId].measurement_eligible_at
    };
  }

  /**
   * Record actual measurement data
   *
   * @param {string} componentId - Component identifier
   * @param {object} measurement - Actual performance data
   * @param {number} [measurement.errors_prevented] - Number of errors prevented
   * @param {number} [measurement.time_saved_hours] - Hours saved
   * @param {number} [measurement.tokens_saved] - Tokens saved
   * @param {number} [measurement.tasks_completed] - Tasks completed successfully
   */
  measureActual(componentId, measurement) {
    const component = this.state.components[componentId];

    if (!component) {
      throw new Error(`Component not found: ${componentId}`);
    }

    const timestamp = new Date().toISOString();

    // Calculate actual value from measurements
    let actualValue = 0;

    if (measurement.errors_prevented) {
      actualValue += measurement.errors_prevented * COST_BASIS.error_cost;
    }
    if (measurement.time_saved_hours) {
      actualValue += measurement.time_saved_hours * COST_BASIS.hourly_rate;
    }
    if (measurement.tokens_saved) {
      actualValue += (measurement.tokens_saved / 1000) * COST_BASIS.token_cost;
    }

    // Annualize based on measurement period
    const measurementDays = measurement.period_days || MEASUREMENT_PERIOD_DAYS;
    const annualizedValue = Math.round((actualValue / measurementDays) * 365);

    // Record measurement
    component.measurements.push({
      timestamp,
      ...measurement,
      calculated_value: actualValue,
      annualized_value: annualizedValue
    });

    // Update component status
    component.actual_annual_value = annualizedValue;
    component.accuracy_ratio = annualizedValue / component.estimated_annual_value;
    component.status = 'measured';
    component.last_measured = timestamp;

    // Update totals
    if (component.measurements.length === 1) {
      // First measurement
      this.state.totals.measured_annual += annualizedValue;
      this.state.totals.components_measured++;
    } else {
      // Update existing measurement (replace previous annualized value)
      const prevMeasurement = component.measurements[component.measurements.length - 2];
      this.state.totals.measured_annual =
        this.state.totals.measured_annual - prevMeasurement.annualized_value + annualizedValue;
    }

    // Record to history
    this.history.measurements.push({
      timestamp,
      componentId,
      type: component.type,
      measurement,
      actual_value: actualValue,
      annualized_value: annualizedValue
    });

    this.state.last_updated = timestamp;
    this._save();

    return {
      componentId,
      estimated: component.estimated_annual_value,
      actual: annualizedValue,
      accuracy: `${Math.round(component.accuracy_ratio * 100)}%`,
      status: component.status
    };
  }

  /**
   * Get components pending measurement
   */
  getPendingMeasurements() {
    const now = new Date().toISOString();

    return Object.values(this.state.components)
      .filter(c =>
        c.status === 'pending_measurement' &&
        c.measurement_eligible_at <= now
      )
      .map(c => ({
        id: c.id,
        type: c.type,
        description: c.description,
        created_at: c.created_at,
        estimated_value: c.estimated_annual_value,
        days_since_creation: Math.floor(
          (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )
      }));
  }

  /**
   * Generate ROI report
   */
  generateReport() {
    const components = Object.values(this.state.components);

    // Group by type
    const byType = {};
    for (const c of components) {
      if (!byType[c.type]) {
        byType[c.type] = {
          count: 0,
          estimated: 0,
          measured: 0,
          measured_count: 0
        };
      }
      byType[c.type].count++;
      byType[c.type].estimated += c.estimated_annual_value;
      if (c.actual_annual_value !== null) {
        byType[c.type].measured += c.actual_annual_value;
        byType[c.type].measured_count++;
      }
    }

    // Calculate accuracy stats
    const measuredComponents = components.filter(c => c.actual_annual_value !== null);
    const avgAccuracy = measuredComponents.length > 0
      ? measuredComponents.reduce((sum, c) => sum + c.accuracy_ratio, 0) / measuredComponents.length
      : null;

    // Get top performers
    const topPerformers = [...measuredComponents]
      .filter(c => c.accuracy_ratio >= 1)
      .sort((a, b) => b.actual_annual_value - a.actual_annual_value)
      .slice(0, 5);

    // Get underperformers
    const underperformers = [...measuredComponents]
      .filter(c => c.accuracy_ratio < 0.5)
      .sort((a, b) => a.accuracy_ratio - b.accuracy_ratio)
      .slice(0, 5);

    return {
      generated_at: new Date().toISOString(),
      summary: {
        total_components: components.length,
        components_measured: measuredComponents.length,
        estimated_annual_roi: this.state.totals.estimated_annual,
        measured_annual_roi: this.state.totals.measured_annual,
        accuracy_ratio: avgAccuracy ? `${Math.round(avgAccuracy * 100)}%` : 'N/A',
        pending_measurements: this.getPendingMeasurements().length
      },
      by_type: Object.entries(byType).map(([type, data]) => ({
        type,
        count: data.count,
        estimated_annual: data.estimated,
        measured_annual: data.measured,
        measured_count: data.measured_count,
        accuracy: data.measured_count > 0
          ? `${Math.round((data.measured / data.estimated) * 100)}%`
          : 'N/A'
      })),
      top_performers: topPerformers.map(c => ({
        id: c.id,
        type: c.type,
        estimated: c.estimated_annual_value,
        actual: c.actual_annual_value,
        accuracy: `${Math.round(c.accuracy_ratio * 100)}%`
      })),
      underperformers: underperformers.map(c => ({
        id: c.id,
        type: c.type,
        estimated: c.estimated_annual_value,
        actual: c.actual_annual_value,
        accuracy: `${Math.round(c.accuracy_ratio * 100)}%`
      })),
      pending_measurements: this.getPendingMeasurements()
    };
  }

  /**
   * Import metrics from adaptive routing engine
   */
  importRoutingMetrics(routingExport) {
    const timestamp = new Date().toISOString();

    // Create synthetic component for routing improvements
    const componentId = `routing:${timestamp.slice(0, 10)}`;

    if (!this.state.components[componentId]) {
      this.state.components[componentId] = {
        id: componentId,
        type: 'routing_optimization',
        description: 'Cumulative routing optimizations',
        created_at: timestamp,
        estimated_annual_value: 0,
        status: 'auto_measured',
        measurements: []
      };
    }

    const component = this.state.components[componentId];

    // Calculate value from routing data
    const value = routingExport.estimated_value?.total_estimated || 0;

    component.measurements.push({
      timestamp,
      source: 'adaptive-routing-engine',
      tasks_completed: routingExport.metrics?.tasks_completed || 0,
      token_savings: routingExport.metrics?.token_savings || 0,
      time_savings_hours: routingExport.metrics?.time_savings_hours || 0,
      calculated_value: value
    });

    // Update estimated to match actual (auto-calibration)
    component.estimated_annual_value = value;
    component.actual_annual_value = value;
    component.accuracy_ratio = 1;

    this.state.last_updated = timestamp;
    this._save();

    return {
      componentId,
      value,
      measurements: component.measurements.length
    };
  }

  /**
   * Take monthly snapshot
   */
  takeSnapshot() {
    const report = this.generateReport();
    const snapshot = {
      timestamp: new Date().toISOString(),
      month: new Date().toISOString().slice(0, 7),
      ...report.summary
    };

    this.history.monthly_snapshots.push(snapshot);

    // Keep last 24 months
    if (this.history.monthly_snapshots.length > 24) {
      this.history.monthly_snapshots.shift();
    }

    saveJSON(this.historyFile, this.history);

    return snapshot;
  }

  /**
   * Get trend data
   */
  getTrend() {
    return {
      monthly_snapshots: this.history.monthly_snapshots,
      recent_measurements: this.history.measurements.slice(-20)
    };
  }

  /**
   * Persist state
   */
  _save() {
    saveJSON(this.stateFile, this.state);
    saveJSON(this.historyFile, this.history);
  }

  /**
   * Reset (use with caution)
   */
  reset() {
    this.state = {
      components: {},
      totals: {
        estimated_annual: 0,
        measured_annual: 0,
        components_tracked: 0,
        components_measured: 0
      },
      last_updated: null,
      version: '1.0.0'
    };
    this.history = {
      measurements: [],
      monthly_snapshots: []
    };
    this._save();
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance = null;

function getTracker() {
  if (!instance) {
    instance = new ROITracker();
  }
  return instance;
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'report';

  const tracker = getTracker();

  switch (command) {
    case 'record': {
      // node roi-tracker.js record <id> <type> <value> "description"
      const [, id, type, value, ...descParts] = args;
      if (!id || !type) {
        console.error('Usage: node roi-tracker.js record <id> <type> [value] [description]');
        process.exit(1);
      }
      const result = tracker.recordEstimate(id, {
        type,
        estimated_annual_value: value ? parseInt(value) : undefined,
        description: descParts.join(' ') || `${type} component`
      });
      console.log('\nRecorded ROI estimate:');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'measure': {
      // node roi-tracker.js measure <id> errors=N time=H tokens=T
      const [, id, ...metrics] = args;
      if (!id) {
        console.error('Usage: node roi-tracker.js measure <id> errors=N time=H tokens=T');
        process.exit(1);
      }
      const measurement = {};
      for (const m of metrics) {
        const [key, val] = m.split('=');
        if (key === 'errors') measurement.errors_prevented = parseInt(val);
        if (key === 'time') measurement.time_saved_hours = parseFloat(val);
        if (key === 'tokens') measurement.tokens_saved = parseInt(val);
      }
      try {
        const result = tracker.measureActual(id, measurement);
        console.log('\nMeasurement recorded:');
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
      break;
    }

    case 'pending': {
      const pending = tracker.getPendingMeasurements();
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('  Pending Measurements');
      console.log('═══════════════════════════════════════════════════════\n');

      if (pending.length === 0) {
        console.log('  No components ready for measurement.');
      } else {
        pending.forEach(p => {
          console.log(`  ${p.id}`);
          console.log(`    Type: ${p.type} | Est. Value: $${p.estimated_value}/year`);
          console.log(`    Days since creation: ${p.days_since_creation}`);
          console.log('');
        });
      }
      console.log('═══════════════════════════════════════════════════════\n');
      break;
    }

    case 'report': {
      const report = tracker.generateReport();
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('  ROI Tracker Report');
      console.log('═══════════════════════════════════════════════════════\n');

      console.log('Summary:');
      console.log(`  Total components:       ${report.summary.total_components}`);
      console.log(`  Components measured:    ${report.summary.components_measured}`);
      console.log(`  Estimated annual ROI:   $${report.summary.estimated_annual_roi.toLocaleString()}`);
      console.log(`  Measured annual ROI:    $${report.summary.measured_annual_roi.toLocaleString()}`);
      console.log(`  Accuracy ratio:         ${report.summary.accuracy_ratio}`);
      console.log(`  Pending measurements:   ${report.summary.pending_measurements}`);

      if (report.by_type.length > 0) {
        console.log('\nBy Type:');
        report.by_type.forEach(t => {
          console.log(`  ${t.type}: ${t.count} components, $${t.estimated_annual.toLocaleString()} est.`);
        });
      }

      if (report.top_performers.length > 0) {
        console.log('\nTop Performers:');
        report.top_performers.forEach(p => {
          console.log(`  ${p.id}: $${p.actual}/year (${p.accuracy} of estimate)`);
        });
      }

      if (report.underperformers.length > 0) {
        console.log('\nUnderperformers:');
        report.underperformers.forEach(p => {
          console.log(`  ${p.id}: $${p.actual}/year (${p.accuracy} of estimate)`);
        });
      }

      console.log('\n═══════════════════════════════════════════════════════\n');
      break;
    }

    case 'snapshot': {
      const snapshot = tracker.takeSnapshot();
      console.log('\nMonthly snapshot taken:');
      console.log(JSON.stringify(snapshot, null, 2));
      break;
    }

    case 'trend': {
      const trend = tracker.getTrend();
      console.log('\nROI Trend Data:');
      console.log(JSON.stringify(trend, null, 2));
      break;
    }

    case 'reset': {
      tracker.reset();
      console.log('ROI tracker data has been reset.');
      break;
    }

    default:
      console.log(`
ROI Tracker

Track estimated vs actual ROI from improvements.

Usage: node roi-tracker.js <command> [args]

Commands:
  report                          Show ROI report
  record <id> <type> [value] [desc]
                                  Record ROI estimate
  measure <id> errors=N time=H tokens=T
                                  Record actual measurement
  pending                         Show components ready for measurement
  snapshot                        Take monthly snapshot
  trend                           Show trend data
  reset                           Reset all data (caution!)

Component Types:
  prevention_hook, playbook, skill, routing_optimization, agent_improvement

Examples:
  node roi-tracker.js report
  node roi-tracker.js record hook:schema-001 prevention_hook 500 "Schema error prevention"
  node roi-tracker.js measure hook:schema-001 errors=12 time=3
  node roi-tracker.js pending
`);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  ROITracker,
  getTracker,
  DEFAULT_ESTIMATES,
  COST_BASIS,
  MEASUREMENT_PERIOD_DAYS
};
