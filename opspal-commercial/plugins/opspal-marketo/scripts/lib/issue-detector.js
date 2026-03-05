/**
 * Issue Detector for Marketo Campaigns
 *
 * Implements proactive detection strategies from the Campaign Diagnostics runbook series (Module 08).
 * Monitors campaign health and triggers alerts before issues impact users.
 *
 * @module issue-detector
 * @version 1.0.0
 * @see docs/runbooks/campaign-diagnostics/08-detection-strategies.md
 */

'use strict';

// Detection thresholds from Module 08
const DETECTION_THRESHOLDS = {
  // Activity correlation thresholds
  triggerDelay: {
    healthy: 60,      // < 60 seconds = healthy
    warning: 300,     // 60-300 seconds = warning
    critical: 900,    // > 300 seconds = critical (15 min)
  },

  // Program member thresholds
  successRate: {
    healthy: 0.20,    // > 20% success rate = healthy
    warning: 0.10,    // 10-20% = warning
    critical: 0.05,   // < 5% = critical
  },

  // Engagement thresholds (baseline-relative)
  engagementDrop: {
    healthy: 0.10,    // < 10% drop = healthy
    warning: 0.25,    // 10-25% drop = warning
    critical: 0.50,   // > 50% drop = critical
  },

  // Bounce/Unsubscribe thresholds
  bounceRate: {
    healthy: 0.02,    // < 2% = healthy
    warning: 0.05,    // 2-5% = warning
    critical: 0.10,   // > 10% = critical
  },
  unsubRate: {
    healthy: 0.005,   // < 0.5% = healthy
    warning: 0.01,    // 0.5-1% = warning
    critical: 0.02,   // > 2% = critical
  },

  // API health thresholds
  apiQuotaUsage: {
    healthy: 0.60,    // < 60% = healthy
    warning: 0.80,    // 60-80% = warning
    critical: 0.95,   // > 95% = critical
  },
  errorRate: {
    healthy: 0.01,    // < 1% = healthy
    warning: 0.03,    // 1-3% = warning
    critical: 0.05,   // > 5% = critical
  },
};

// Alert severity levels
const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

// Detection cadence recommendations
const DETECTION_CADENCE = {
  REALTIME: 'realtime',     // Near real-time (< 1 min)
  HOURLY: 'hourly',         // Every hour
  DAILY: 'daily',           // Once per day
  WEEKLY: 'weekly',         // Once per week
};

// Detection strategy definitions
const DETECTION_STRATEGIES = {
  TRIGGER_CORRELATION: {
    name: 'Activity Log Correlation',
    description: 'Detect missing campaign runs after trigger events',
    cadence: DETECTION_CADENCE.REALTIME,
    runbook: '01-smart-campaigns-not-triggering.md',
  },
  PROGRAM_MEMBER_ANOMALY: {
    name: 'Program Member Anomaly Check',
    description: 'Alert when success counts are zero or below thresholds',
    cadence: DETECTION_CADENCE.DAILY,
    runbook: '03-leads-not-progressing.md',
  },
  TRIGGER_QUEUE_BACKLOG: {
    name: 'Trigger Queue Backlog Inference',
    description: 'Measure time between trigger event and first flow activity',
    cadence: DETECTION_CADENCE.REALTIME,
    runbook: '01-smart-campaigns-not-triggering.md',
  },
  API_HEALTH: {
    name: 'API Health Monitoring',
    description: 'Track error codes 606/607/615 and bulk errors 1029',
    cadence: DETECTION_CADENCE.REALTIME,
    runbook: '07-sync-api-job-failures.md',
  },
  METRIC_THRESHOLD: {
    name: 'Metric Threshold Alerts',
    description: 'Bounce rate, unsub rate, open rate, and click rate thresholds',
    cadence: DETECTION_CADENCE.DAILY,
    runbook: '05-low-engagement.md',
  },
  TOKEN_VALIDATION: {
    name: 'Token Validation Preflight',
    description: 'Scan email content for tokens and confirm definitions',
    cadence: DETECTION_CADENCE.REALTIME,
    runbook: '04-token-resolution-failures.md',
  },
  ENGAGEMENT_TREND: {
    name: 'Engagement Trend Analysis',
    description: 'Compare recent campaign performance to historical baselines',
    cadence: DETECTION_CADENCE.WEEKLY,
    runbook: '05-low-engagement.md',
  },
};

/**
 * Issue Detector class
 * Implements proactive monitoring and detection strategies
 */
class IssueDetector {
  constructor(options = {}) {
    this.options = {
      defaultLookbackDays: 7,
      baselineWindow: 30,
      minSampleSize: 100,
      ...options,
    };
    this.baselines = {};
    this.alerts = [];
  }

  /**
   * Detect missing campaign runs after trigger events
   * Strategy: Compare trigger activity timestamps to campaign run timestamps
   *
   * @param {Array} triggerActivities - Activities that should trigger campaign
   * @param {Array} campaignRuns - Campaign run activities for same leads
   * @param {number} campaignId - Expected campaign ID
   * @returns {Object} Detection result
   */
  detectMissingCampaignRuns(triggerActivities, campaignRuns, campaignId) {
    const result = {
      strategy: DETECTION_STRATEGIES.TRIGGER_CORRELATION,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      findings: [],
      affectedLeads: [],
      recommendations: [],
    };

    // Build map of campaign runs by lead
    const runsByLead = new Map();
    for (const run of campaignRuns) {
      if (run.campaignId === campaignId || run.primaryAttributeValueId === campaignId) {
        if (!runsByLead.has(run.leadId)) {
          runsByLead.set(run.leadId, []);
        }
        runsByLead.get(run.leadId).push(new Date(run.activityDate));
      }
    }

    // Check each trigger activity
    for (const trigger of triggerActivities) {
      const triggerTime = new Date(trigger.activityDate);
      const leadRuns = runsByLead.get(trigger.leadId) || [];

      // Find if there's a campaign run after this trigger
      const hasRun = leadRuns.some(runTime =>
        runTime >= triggerTime && (runTime - triggerTime) < 24 * 60 * 60 * 1000 // Within 24 hours
      );

      if (!hasRun) {
        result.affectedLeads.push({
          leadId: trigger.leadId,
          triggerTime: trigger.activityDate,
          triggerType: trigger.activityTypeId,
          primaryAttribute: trigger.primaryAttributeValue,
        });
      }
    }

    // Evaluate results
    if (result.affectedLeads.length > 0) {
      const missingRate = result.affectedLeads.length / triggerActivities.length;

      if (missingRate > 0.5) {
        result.status = 'critical';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `${result.affectedLeads.length} leads (${(missingRate * 100).toFixed(1)}%) have trigger events but no campaign run`,
        });
        result.recommendations.push('Check campaign is active and has correct triggers');
        result.recommendations.push('Verify Smart List qualification rules');
      } else if (missingRate > 0.1) {
        result.status = 'warning';
        result.findings.push({
          severity: SEVERITY.WARNING,
          message: `${result.affectedLeads.length} leads (${(missingRate * 100).toFixed(1)}%) missing campaign runs`,
        });
        result.recommendations.push('Review Smart List filters for unexpected exclusions');
      }
    }

    return result;
  }

  /**
   * Detect stuck programs with low success rates
   * Strategy: Alert when success counts are zero or below thresholds
   *
   * @param {Object} programStats - Program member statistics by status
   * @param {number} programId - Program ID
   * @param {Object} channelConfig - Channel configuration including success statuses
   * @returns {Object} Detection result
   */
  detectStuckPrograms(programStats, programId, channelConfig = {}) {
    const result = {
      strategy: DETECTION_STRATEGIES.PROGRAM_MEMBER_ANOMALY,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      programId,
      findings: [],
      statusDistribution: {},
      recommendations: [],
    };

    const totalMembers = Object.values(programStats).reduce((sum, count) => sum + count, 0);
    if (totalMembers === 0) {
      result.findings.push({
        severity: SEVERITY.INFO,
        message: 'Program has no members',
      });
      return result;
    }

    // Calculate success rate
    const successStatuses = channelConfig.successStatuses || ['Success', 'Attended', 'Converted'];
    let successCount = 0;
    for (const status of successStatuses) {
      successCount += programStats[status] || 0;
    }
    const successRate = successCount / totalMembers;

    // Store status distribution
    for (const [status, count] of Object.entries(programStats)) {
      result.statusDistribution[status] = {
        count,
        percentage: ((count / totalMembers) * 100).toFixed(1),
      };
    }

    // Check for zero success
    if (successCount === 0 && totalMembers > this.options.minSampleSize) {
      result.status = 'critical';
      result.findings.push({
        severity: SEVERITY.CRITICAL,
        message: `Zero success with ${totalMembers} members`,
      });
      result.recommendations.push('Verify Change Program Status flow step exists');
      result.recommendations.push('Check channel success configuration');
    } else if (successRate < DETECTION_THRESHOLDS.successRate.critical) {
      result.status = 'critical';
      result.findings.push({
        severity: SEVERITY.CRITICAL,
        message: `Success rate ${(successRate * 100).toFixed(1)}% is below critical threshold`,
      });
    } else if (successRate < DETECTION_THRESHOLDS.successRate.warning) {
      result.status = 'warning';
      result.findings.push({
        severity: SEVERITY.WARNING,
        message: `Success rate ${(successRate * 100).toFixed(1)}% is below warning threshold`,
      });
    }

    // Check for accumulation in early stages
    const firstStatus = Object.keys(programStats)[0];
    const firstStatusRate = (programStats[firstStatus] || 0) / totalMembers;
    if (firstStatusRate > 0.8) {
      result.findings.push({
        severity: SEVERITY.WARNING,
        message: `${(firstStatusRate * 100).toFixed(1)}% of members stuck in "${firstStatus}"`,
      });
      result.recommendations.push('Review flow logic for status progression');
    }

    return result;
  }

  /**
   * Measure trigger queue delay
   * Strategy: Measure time between trigger event and first flow activity
   *
   * @param {Array} triggerActivities - Trigger events
   * @param {Array} flowActivities - First flow action for same leads
   * @returns {Object} Detection result
   */
  measureTriggerDelay(triggerActivities, flowActivities) {
    const result = {
      strategy: DETECTION_STRATEGIES.TRIGGER_QUEUE_BACKLOG,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      findings: [],
      metrics: {
        sampleSize: 0,
        averageDelay: 0,
        maxDelay: 0,
        p95Delay: 0,
      },
      recommendations: [],
    };

    // Build map of first flow activity by lead
    const flowByLead = new Map();
    for (const flow of flowActivities) {
      const leadId = flow.leadId;
      const flowTime = new Date(flow.activityDate);

      if (!flowByLead.has(leadId) || flowTime < flowByLead.get(leadId)) {
        flowByLead.set(leadId, flowTime);
      }
    }

    // Calculate delays
    const delays = [];
    for (const trigger of triggerActivities) {
      const triggerTime = new Date(trigger.activityDate);
      const flowTime = flowByLead.get(trigger.leadId);

      if (flowTime && flowTime >= triggerTime) {
        const delaySeconds = (flowTime - triggerTime) / 1000;
        delays.push(delaySeconds);
      }
    }

    if (delays.length === 0) {
      result.findings.push({
        severity: SEVERITY.INFO,
        message: 'No trigger-to-flow pairs found for analysis',
      });
      return result;
    }

    // Calculate metrics
    delays.sort((a, b) => a - b);
    result.metrics.sampleSize = delays.length;
    result.metrics.averageDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    result.metrics.maxDelay = delays[delays.length - 1];
    result.metrics.p95Delay = delays[Math.floor(delays.length * 0.95)];

    // Evaluate against thresholds
    const avgDelay = result.metrics.averageDelay;
    if (avgDelay > DETECTION_THRESHOLDS.triggerDelay.critical) {
      result.status = 'critical';
      result.findings.push({
        severity: SEVERITY.CRITICAL,
        message: `Average trigger delay ${(avgDelay / 60).toFixed(1)} minutes exceeds critical threshold`,
      });
      result.recommendations.push('Check for trigger queue backlog in Admin');
      result.recommendations.push('Reduce high-priority competing campaigns');
    } else if (avgDelay > DETECTION_THRESHOLDS.triggerDelay.warning) {
      result.status = 'warning';
      result.findings.push({
        severity: SEVERITY.WARNING,
        message: `Average trigger delay ${(avgDelay / 60).toFixed(1)} minutes is elevated`,
      });
    }

    return result;
  }

  /**
   * Check API health
   * Strategy: Track error codes and quota usage
   *
   * @param {Object} apiUsage - Current API usage stats
   * @param {Array} recentErrors - Recent API errors
   * @returns {Object} Detection result
   */
  checkApiHealth(apiUsage, recentErrors = []) {
    const result = {
      strategy: DETECTION_STRATEGIES.API_HEALTH,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      findings: [],
      metrics: {
        quotaUsage: 0,
        errorRate: 0,
        errorsByCode: {},
      },
      recommendations: [],
    };

    // Check quota usage
    if (apiUsage.dailyLimit > 0) {
      result.metrics.quotaUsage = apiUsage.dailyUsed / apiUsage.dailyLimit;

      if (result.metrics.quotaUsage > DETECTION_THRESHOLDS.apiQuotaUsage.critical) {
        result.status = 'critical';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `API quota ${(result.metrics.quotaUsage * 100).toFixed(1)}% used`,
        });
        result.recommendations.push('Reduce API call volume or wait until midnight reset');
      } else if (result.metrics.quotaUsage > DETECTION_THRESHOLDS.apiQuotaUsage.warning) {
        if (result.status === 'healthy') result.status = 'warning';
        result.findings.push({
          severity: SEVERITY.WARNING,
          message: `API quota ${(result.metrics.quotaUsage * 100).toFixed(1)}% used`,
        });
      }
    }

    // Check for critical error codes
    const criticalCodes = [606, 607, 615, 1029, 1035];
    for (const error of recentErrors) {
      const code = error.code || error.errorCode;
      if (!result.metrics.errorsByCode[code]) {
        result.metrics.errorsByCode[code] = 0;
      }
      result.metrics.errorsByCode[code]++;

      if (criticalCodes.includes(code)) {
        result.status = 'critical';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `API error ${code} detected: ${this.getErrorDescription(code)}`,
        });
      }
    }

    return result;
  }

  /**
   * Check engagement metrics against thresholds and baselines
   * Strategy: Alert on bounce rate, unsub rate, engagement drops
   *
   * @param {Object} currentMetrics - Current campaign metrics
   * @param {Object} baseline - Baseline metrics for comparison
   * @returns {Object} Detection result
   */
  checkEngagementThresholds(currentMetrics, baseline = {}) {
    const result = {
      strategy: DETECTION_STRATEGIES.METRIC_THRESHOLD,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      findings: [],
      metrics: {},
      recommendations: [],
    };

    // Check bounce rate
    if (currentMetrics.bounceRate !== undefined) {
      result.metrics.bounceRate = currentMetrics.bounceRate;

      if (currentMetrics.bounceRate > DETECTION_THRESHOLDS.bounceRate.critical) {
        result.status = 'critical';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `Bounce rate ${(currentMetrics.bounceRate * 100).toFixed(1)}% exceeds critical threshold`,
        });
        result.recommendations.push('Suppress invalid addresses immediately');
        result.recommendations.push('Review list source quality');
      } else if (currentMetrics.bounceRate > DETECTION_THRESHOLDS.bounceRate.warning) {
        if (result.status === 'healthy') result.status = 'warning';
        result.findings.push({
          severity: SEVERITY.WARNING,
          message: `Bounce rate ${(currentMetrics.bounceRate * 100).toFixed(1)}% is elevated`,
        });
      }
    }

    // Check unsubscribe rate
    if (currentMetrics.unsubRate !== undefined) {
      result.metrics.unsubRate = currentMetrics.unsubRate;

      if (currentMetrics.unsubRate > DETECTION_THRESHOLDS.unsubRate.critical) {
        result.status = 'critical';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `Unsubscribe rate ${(currentMetrics.unsubRate * 100).toFixed(2)}% exceeds critical threshold`,
        });
        result.recommendations.push('Review email frequency and content relevance');
        result.recommendations.push('Implement preference management');
      } else if (currentMetrics.unsubRate > DETECTION_THRESHOLDS.unsubRate.warning) {
        if (result.status === 'healthy') result.status = 'warning';
        result.findings.push({
          severity: SEVERITY.WARNING,
          message: `Unsubscribe rate ${(currentMetrics.unsubRate * 100).toFixed(2)}% is elevated`,
        });
      }
    }

    // Check engagement drop from baseline
    if (baseline.openRate && currentMetrics.openRate !== undefined) {
      const openDrop = (baseline.openRate - currentMetrics.openRate) / baseline.openRate;
      result.metrics.openRateDrop = openDrop;

      if (openDrop > DETECTION_THRESHOLDS.engagementDrop.critical) {
        result.status = 'critical';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `Open rate dropped ${(openDrop * 100).toFixed(1)}% from baseline`,
        });
        result.recommendations.push('Review subject lines and sender reputation');
        result.recommendations.push('Check deliverability indicators');
      } else if (openDrop > DETECTION_THRESHOLDS.engagementDrop.warning) {
        if (result.status === 'healthy') result.status = 'warning';
        result.findings.push({
          severity: SEVERITY.WARNING,
          message: `Open rate dropped ${(openDrop * 100).toFixed(1)}% from baseline`,
        });
      }
    }

    return result;
  }

  /**
   * Validate tokens in email content
   * Strategy: Scan for tokens and verify definitions exist
   *
   * @param {Array} tokensUsed - Tokens found in email content
   * @param {Array} tokensDefined - Tokens defined in program
   * @param {string} emailId - Email ID for context
   * @returns {Object} Detection result
   */
  validateTokens(tokensUsed, tokensDefined, emailId) {
    const result = {
      strategy: DETECTION_STRATEGIES.TOKEN_VALIDATION,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      emailId,
      findings: [],
      undefinedTokens: [],
      recommendations: [],
    };

    const definedSet = new Set(tokensDefined.map(t => t.name || t));

    for (const token of tokensUsed) {
      const tokenName = token.name || token;
      if (!definedSet.has(tokenName)) {
        result.undefinedTokens.push(tokenName);
      }
    }

    if (result.undefinedTokens.length > 0) {
      result.status = 'critical';
      result.findings.push({
        severity: SEVERITY.CRITICAL,
        message: `${result.undefinedTokens.length} undefined tokens: ${result.undefinedTokens.join(', ')}`,
      });
      result.recommendations.push('Create missing tokens in program folder');
      result.recommendations.push('Verify email is in correct program hierarchy');
      result.recommendations.push('Check token name case sensitivity');
    }

    return result;
  }

  /**
   * Analyze engagement trend over time
   * Strategy: Compare recent performance to historical baseline
   *
   * @param {Array} recentPerformance - Last N days of performance
   * @param {Array} historicalPerformance - Baseline performance data
   * @returns {Object} Detection result
   */
  analyzeEngagementTrend(recentPerformance, historicalPerformance) {
    const result = {
      strategy: DETECTION_STRATEGIES.ENGAGEMENT_TREND,
      timestamp: new Date().toISOString(),
      status: 'healthy',
      findings: [],
      trend: {
        direction: 'stable',
        magnitude: 0,
      },
      recommendations: [],
    };

    if (recentPerformance.length === 0 || historicalPerformance.length === 0) {
      result.findings.push({
        severity: SEVERITY.INFO,
        message: 'Insufficient data for trend analysis',
      });
      return result;
    }

    // Calculate averages
    const recentAvg = this.calculateAverageMetrics(recentPerformance);
    const historicalAvg = this.calculateAverageMetrics(historicalPerformance);

    // Compare open rates
    if (historicalAvg.openRate > 0) {
      const openChange = (recentAvg.openRate - historicalAvg.openRate) / historicalAvg.openRate;
      result.trend.openRateChange = openChange;

      if (openChange < -DETECTION_THRESHOLDS.engagementDrop.critical) {
        result.status = 'critical';
        result.trend.direction = 'declining';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `Sustained open rate decline of ${(Math.abs(openChange) * 100).toFixed(1)}%`,
        });
        result.recommendations.push('Investigate deliverability issues');
        result.recommendations.push('Review audience segmentation');
      } else if (openChange < -DETECTION_THRESHOLDS.engagementDrop.warning) {
        if (result.status === 'healthy') result.status = 'warning';
        result.trend.direction = 'declining';
        result.findings.push({
          severity: SEVERITY.WARNING,
          message: `Open rate trending down ${(Math.abs(openChange) * 100).toFixed(1)}%`,
        });
      }
    }

    // Compare click rates
    if (historicalAvg.clickRate > 0) {
      const clickChange = (recentAvg.clickRate - historicalAvg.clickRate) / historicalAvg.clickRate;
      result.trend.clickRateChange = clickChange;

      if (clickChange < -DETECTION_THRESHOLDS.engagementDrop.critical) {
        if (result.status !== 'critical') result.status = 'critical';
        result.findings.push({
          severity: SEVERITY.CRITICAL,
          message: `Sustained click rate decline of ${(Math.abs(clickChange) * 100).toFixed(1)}%`,
        });
        result.recommendations.push('Review content and CTA relevance');
      }
    }

    return result;
  }

  /**
   * Calculate average metrics from performance array
   */
  calculateAverageMetrics(performance) {
    if (performance.length === 0) return {};

    const totals = performance.reduce((acc, p) => ({
      openRate: (acc.openRate || 0) + (p.openRate || 0),
      clickRate: (acc.clickRate || 0) + (p.clickRate || 0),
      bounceRate: (acc.bounceRate || 0) + (p.bounceRate || 0),
      unsubRate: (acc.unsubRate || 0) + (p.unsubRate || 0),
    }), {});

    return {
      openRate: totals.openRate / performance.length,
      clickRate: totals.clickRate / performance.length,
      bounceRate: totals.bounceRate / performance.length,
      unsubRate: totals.unsubRate / performance.length,
    };
  }

  /**
   * Get error description for API error code
   */
  getErrorDescription(code) {
    const descriptions = {
      606: 'Rate limit exceeded (100 calls/20 sec)',
      607: 'Daily quota reached',
      615: 'Concurrent request limit (10 max)',
      1029: 'Bulk export quota or queue limit',
      1035: 'Export limit exceeded (500MB/day)',
    };
    return descriptions[code] || `Unknown error code ${code}`;
  }

  /**
   * Run all relevant detections for a given context
   * @param {Object} context - Detection context with all available data
   * @returns {Object} Combined detection results
   */
  runAllDetections(context) {
    const results = {
      timestamp: new Date().toISOString(),
      overallStatus: 'healthy',
      detections: [],
      criticalCount: 0,
      warningCount: 0,
    };

    // Run each applicable detection
    if (context.triggerActivities && context.campaignRuns) {
      const triggerResult = this.detectMissingCampaignRuns(
        context.triggerActivities,
        context.campaignRuns,
        context.campaignId
      );
      results.detections.push(triggerResult);
    }

    if (context.programStats && context.programId) {
      const programResult = this.detectStuckPrograms(
        context.programStats,
        context.programId,
        context.channelConfig
      );
      results.detections.push(programResult);
    }

    if (context.apiUsage) {
      const apiResult = this.checkApiHealth(context.apiUsage, context.recentErrors);
      results.detections.push(apiResult);
    }

    if (context.currentMetrics) {
      const engagementResult = this.checkEngagementThresholds(
        context.currentMetrics,
        context.baseline
      );
      results.detections.push(engagementResult);
    }

    // Aggregate results
    for (const detection of results.detections) {
      if (detection.status === 'critical') {
        results.criticalCount++;
        results.overallStatus = 'critical';
      } else if (detection.status === 'warning') {
        results.warningCount++;
        if (results.overallStatus !== 'critical') {
          results.overallStatus = 'warning';
        }
      }
    }

    return results;
  }
}

module.exports = {
  IssueDetector,
  DETECTION_THRESHOLDS,
  DETECTION_STRATEGIES,
  DETECTION_CADENCE,
  SEVERITY,
};
