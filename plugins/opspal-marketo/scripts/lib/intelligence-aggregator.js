/**
 * Intelligence Aggregator
 *
 * Prepares normalized data for Claude analysis by:
 * - Generating campaign performance summaries
 * - Calculating engagement metrics by segment
 * - Identifying statistical anomalies
 * - Creating Claude-optimized data packages
 * - Providing historical comparison data
 *
 * @module intelligence-aggregator
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Default thresholds for anomaly detection
 */
const DEFAULT_THRESHOLDS = {
  openRate: { min: 10, max: 50, stdDevMultiplier: 2 },
  clickRate: { min: 1, max: 15, stdDevMultiplier: 2 },
  bounceRate: { min: 0, max: 5, stdDevMultiplier: 2 },
  unsubscribeRate: { min: 0, max: 1, stdDevMultiplier: 2 },
  conversionRate: { min: 5, max: 50, stdDevMultiplier: 2 }
};

/**
 * Intelligence Aggregator class
 */
class IntelligenceAggregator {
  constructor(portal, options = {}) {
    this.portal = portal;
    this.basePath = options.basePath || `instances/${portal}/observability`;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  }

  /**
   * Load all available normalized data
   */
  async loadNormalizedData() {
    const data = {
      leads: null,
      activities: null,
      programs: []
    };

    try {
      const leadsPath = path.join(this.basePath, 'exports/leads/leads-current.json');
      data.leads = JSON.parse(await fs.readFile(leadsPath, 'utf8'));
    } catch (e) {
      console.warn('No current leads data available');
    }

    try {
      const activitiesPath = path.join(this.basePath, 'exports/activities/activities-7day.json');
      data.activities = JSON.parse(await fs.readFile(activitiesPath, 'utf8'));
    } catch (e) {
      console.warn('No activity data available');
    }

    try {
      const programsDir = path.join(this.basePath, 'exports/program-members');
      const files = await fs.readdir(programsDir);
      for (const file of files) {
        if (file.endsWith('-current.json')) {
          const content = JSON.parse(await fs.readFile(path.join(programsDir, file), 'utf8'));
          data.programs.push(content);
        }
      }
    } catch (e) {
      console.warn('No program membership data available');
    }

    return data;
  }

  /**
   * Load historical baselines
   */
  async loadBaselines() {
    try {
      const baselinesPath = path.join(this.basePath, 'metrics/baselines.json');
      return JSON.parse(await fs.readFile(baselinesPath, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  /**
   * Generate comprehensive metrics for Claude analysis
   */
  async generateMetricsPackage() {
    const data = await this.loadNormalizedData();
    const baselines = await this.loadBaselines();

    const metrics = {
      generatedAt: new Date().toISOString(),
      portal: this.portal,

      // Lead metrics
      leadMetrics: this.aggregateLeadMetrics(data.leads),

      // Activity/engagement metrics
      engagementMetrics: this.aggregateEngagementMetrics(data.activities),

      // Program performance
      programMetrics: this.aggregateProgramMetrics(data.programs),

      // Anomalies detected
      anomalies: this.detectAnomalies(data, baselines),

      // Historical comparison
      historicalComparison: baselines ? this.compareToBaselines(data, baselines) : null,

      // Recommendations input
      analysisContext: this.buildAnalysisContext(data)
    };

    return metrics;
  }

  /**
   * Aggregate lead-level metrics
   */
  aggregateLeadMetrics(leadData) {
    if (!leadData?.leads) return null;

    const leads = leadData.leads;
    const scores = leads.map(l => l.leadScore).filter(s => s != null);

    return {
      totalLeads: leads.length,
      scoring: {
        average: this.average(scores),
        median: this.median(scores),
        distribution: leadData.summary?.scoreDistribution || {}
      },
      domains: {
        unique: leadData.summary?.topDomains?.length || 0,
        top5: leadData.summary?.topDomains?.slice(0, 5) || []
      },
      dataQuality: {
        completeness: this.calculateCompleteness(leads),
        nullCounts: leadData.summary?.nullCounts || {}
      }
    };
  }

  /**
   * Aggregate engagement metrics from activities
   */
  aggregateEngagementMetrics(activityData) {
    if (!activityData?.activities) return null;

    const summary = activityData.summary || {};

    return {
      totalActivities: activityData.recordCount,
      dateRange: activityData.dateRange,
      emailPerformance: {
        openRate: parseFloat(summary.engagementRate?.openRate || 0),
        clickRate: parseFloat(summary.engagementRate?.clickRate || 0),
        clickToOpenRate: parseFloat(summary.engagementRate?.clickToOpenRate || 0),
        bounceRate: parseFloat(summary.engagementRate?.bounceRate || 0),
        unsubscribeRate: parseFloat(summary.engagementRate?.unsubscribeRate || 0)
      },
      activityDistribution: summary.byType || {},
      temporalPatterns: {
        byHour: summary.byHour || {},
        byDayOfWeek: summary.byDayOfWeek || {},
        peakHours: this.identifyPeakHours(summary.byHour || {}),
        peakDays: this.identifyPeakDays(summary.byDayOfWeek || {})
      },
      uniqueLeadsEngaged: summary.uniqueLeads || 0
    };
  }

  /**
   * Aggregate program performance metrics
   */
  aggregateProgramMetrics(programs) {
    if (!programs || programs.length === 0) return null;

    return programs.map(program => ({
      programId: program.programId,
      programName: program.programName,
      membership: {
        total: program.recordCount,
        byStatus: program.summary?.byStatus || {}
      },
      conversion: {
        successCount: program.summary?.successCount || 0,
        successRate: parseFloat(program.summary?.successRate || 0)
      },
      funnel: this.calculateFunnel(program.summary?.byStatus || {})
    }));
  }

  /**
   * Detect anomalies in current data compared to thresholds
   */
  detectAnomalies(data, baselines) {
    const anomalies = [];

    // Check engagement metrics against thresholds
    if (data.activities?.summary?.engagementRate) {
      const rates = data.activities.summary.engagementRate;

      // Open rate
      const openRate = parseFloat(rates.openRate);
      if (openRate < this.thresholds.openRate.min) {
        anomalies.push({
          type: 'low_open_rate',
          severity: openRate < 5 ? 'critical' : 'warning',
          metric: 'openRate',
          value: openRate,
          threshold: this.thresholds.openRate.min,
          message: `Email open rate (${openRate}%) is below minimum threshold (${this.thresholds.openRate.min}%)`
        });
      }

      // Bounce rate
      const bounceRate = parseFloat(rates.bounceRate);
      if (bounceRate > this.thresholds.bounceRate.max) {
        anomalies.push({
          type: 'high_bounce_rate',
          severity: bounceRate > 10 ? 'critical' : 'warning',
          metric: 'bounceRate',
          value: bounceRate,
          threshold: this.thresholds.bounceRate.max,
          message: `Email bounce rate (${bounceRate}%) exceeds maximum threshold (${this.thresholds.bounceRate.max}%)`
        });
      }

      // Unsubscribe rate
      const unsubRate = parseFloat(rates.unsubscribeRate);
      if (unsubRate > this.thresholds.unsubscribeRate.max) {
        anomalies.push({
          type: 'high_unsubscribe_rate',
          severity: unsubRate > 2 ? 'critical' : 'warning',
          metric: 'unsubscribeRate',
          value: unsubRate,
          threshold: this.thresholds.unsubscribeRate.max,
          message: `Unsubscribe rate (${unsubRate}%) exceeds threshold (${this.thresholds.unsubscribeRate.max}%)`
        });
      }
    }

    // Check against historical baselines
    if (baselines?.metrics) {
      const currentOpenRate = parseFloat(data.activities?.summary?.engagementRate?.openRate || 0);
      const baselineOpen = baselines.metrics.openRate;

      if (baselineOpen && currentOpenRate < baselineOpen.mean - (baselineOpen.stdDev * 2)) {
        anomalies.push({
          type: 'below_baseline',
          severity: 'warning',
          metric: 'openRate',
          value: currentOpenRate,
          baseline: baselineOpen.mean,
          stdDev: baselineOpen.stdDev,
          message: `Open rate (${currentOpenRate}%) is more than 2 std devs below baseline (${baselineOpen.mean.toFixed(1)}%)`
        });
      }
    }

    // Check program success rates
    if (data.programs) {
      for (const program of data.programs) {
        const successRate = parseFloat(program.summary?.successRate || 0);
        if (successRate < this.thresholds.conversionRate.min && program.recordCount > 50) {
          anomalies.push({
            type: 'low_program_conversion',
            severity: 'warning',
            metric: 'programSuccessRate',
            programId: program.programId,
            programName: program.programName,
            value: successRate,
            threshold: this.thresholds.conversionRate.min,
            message: `Program "${program.programName}" has low success rate (${successRate}%)`
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Compare current metrics to historical baselines
   */
  compareToBaselines(data, baselines) {
    if (!baselines?.metrics) return null;

    const comparison = {};
    const current = data.activities?.summary?.engagementRate || {};

    for (const [metric, baseline] of Object.entries(baselines.metrics)) {
      const currentValue = parseFloat(current[metric] || 0);
      if (baseline && baseline.mean != null) {
        const diff = currentValue - baseline.mean;
        const zScore = baseline.stdDev > 0 ? diff / baseline.stdDev : 0;

        comparison[metric] = {
          current: currentValue,
          baseline: baseline.mean,
          difference: diff.toFixed(2),
          percentChange: baseline.mean > 0 ? ((diff / baseline.mean) * 100).toFixed(1) : null,
          zScore: zScore.toFixed(2),
          status: Math.abs(zScore) > 2 ? 'anomaly' :
                  Math.abs(zScore) > 1 ? 'notable' : 'normal'
        };
      }
    }

    return comparison;
  }

  /**
   * Build context object for Claude analysis
   */
  buildAnalysisContext(data) {
    return {
      dataAvailability: {
        hasLeads: !!data.leads,
        hasActivities: !!data.activities,
        programCount: data.programs?.length || 0
      },
      timeRange: data.activities?.dateRange || null,
      recordCounts: {
        leads: data.leads?.recordCount || 0,
        activities: data.activities?.recordCount || 0,
        programMembers: data.programs?.reduce((sum, p) => sum + (p.recordCount || 0), 0) || 0
      },
      suggestedAnalysisTypes: this.suggestAnalysisTypes(data)
    };
  }

  /**
   * Suggest what types of analysis are possible with available data
   */
  suggestAnalysisTypes(data) {
    const types = [];

    if (data.activities?.recordCount > 100) {
      types.push('engagement_analysis');
      types.push('temporal_patterns');
    }

    if (data.programs?.length > 0) {
      types.push('program_performance');
      types.push('funnel_analysis');
    }

    if (data.leads?.recordCount > 100) {
      types.push('lead_scoring_analysis');
      types.push('data_quality_assessment');
    }

    if (data.activities?.recordCount > 1000 && data.programs?.length > 0) {
      types.push('comprehensive_campaign_review');
    }

    return types;
  }

  // Helper functions

  average(values) {
    const valid = values.filter(v => v != null && !isNaN(v));
    if (valid.length === 0) return null;
    return parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
  }

  median(values) {
    const sorted = values.filter(v => v != null).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  calculateCompleteness(records) {
    if (records.length === 0) return 0;
    const fields = Object.keys(records[0]);
    let totalFields = records.length * fields.length;
    let filledFields = 0;

    for (const record of records) {
      for (const field of fields) {
        if (record[field] != null && record[field] !== '') {
          filledFields++;
        }
      }
    }

    return parseFloat(((filledFields / totalFields) * 100).toFixed(1));
  }

  identifyPeakHours(byHour) {
    const entries = Object.entries(byHour).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 3).map(([hour, count]) => ({ hour, count }));
  }

  identifyPeakDays(byDayOfWeek) {
    const entries = Object.entries(byDayOfWeek).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, 3).map(([day, count]) => ({ day, count }));
  }

  calculateFunnel(byStatus) {
    // Attempt to order statuses by typical funnel progression
    const statusOrder = ['Member', 'Engaged', 'MQL', 'SQL', 'Opportunity', 'Customer', 'Success'];
    const funnel = [];

    for (const status of statusOrder) {
      if (byStatus[status]) {
        funnel.push({ status, count: byStatus[status] });
      }
    }

    // Add any remaining statuses not in the standard order
    for (const [status, count] of Object.entries(byStatus)) {
      if (!statusOrder.includes(status)) {
        funnel.push({ status, count });
      }
    }

    return funnel;
  }

  /**
   * Save metrics package to file
   */
  async saveMetrics(metrics, filename = 'aggregations.json') {
    const outputPath = path.join(this.basePath, 'metrics', filename);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(metrics, null, 2));
    return outputPath;
  }
}

module.exports = {
  IntelligenceAggregator,
  DEFAULT_THRESHOLDS
};
