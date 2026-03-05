#!/usr/bin/env node

/**
 * Sales Activity Analyzer
 *
 * Deep-dive rep productivity analysis with time-of-day optimization, efficiency
 * metrics, coaching opportunity detection, and best practice identification.
 *
 * @module sales-activity-analyzer
 * @version 1.0.0
 * @author RevPal Engineering
 *
 * Features:
 * - Activity efficiency analysis (calls-to-meetings, emails-to-responses)
 * - Time-of-day optimization (best hours for connect rates)
 * - Day-of-week patterns
 * - Coaching opportunity detection (skill gaps, process gaps)
 * - Best practice identification from top performers
 * - Rep comparison and benchmarking
 * - Segment analysis (by team, region, role)
 * - CLI interface for standalone analysis
 *
 * Usage:
 *   const ActivityAnalyzer = require('./sales-activity-analyzer');
 *   const analyzer = new ActivityAnalyzer();
 *   const analysis = analyzer.analyze(activities, reps);
 *
 * CLI:
 *   node sales-activity-analyzer.js --activities ./activities.json --output ./analysis.json
 */

const fs = require('fs');
const path = require('path');

/**
 * Sales Activity Analyzer
 */
class SalesActivityAnalyzer {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.minActivitiesPerRep = options.minActivitiesPerRep || 50;

    // Working hours (24-hour format)
    this.workingHours = {
      start: 8,
      end: 18
    };

    if (this.verbose) {
      console.log('SalesActivityAnalyzer initialized');
    }
  }

  /**
   * Main analysis function
   *
   * @param {Array} activities - Activity records with timestamps and outcomes
   * @param {Array} reps - Rep information (optional, for segmentation)
   * @returns {Object} Comprehensive activity analysis
   */
  analyze(activities, reps = []) {
    if (this.verbose) {
      console.log(`\n=== Analyzing ${activities.length} activities ===\n`);
    }

    // Enrich activities with time attributes
    const enrichedActivities = this.enrichActivities(activities);

    // Group by rep
    const byRep = this.groupByRep(enrichedActivities);

    // Calculate rep-level metrics
    const repMetrics = this.calculateRepMetrics(byRep);

    // Identify best practices from top performers
    const bestPractices = this.identifyBestPractices(repMetrics);

    // Detect coaching opportunities
    const coachingOpportunities = this.detectCoachingOpportunities(repMetrics, bestPractices);

    // Time-of-day analysis
    const timeAnalysis = this.analyzeTimePatterns(enrichedActivities);

    // Activity efficiency
    const efficiency = this.analyzeEfficiency(enrichedActivities);

    // Generate summary
    const summary = this.generateSummary(repMetrics, bestPractices, coachingOpportunities);

    return {
      summary,
      repMetrics,
      bestPractices,
      coachingOpportunities,
      timeAnalysis,
      efficiency,
      metadata: {
        totalActivities: activities.length,
        totalReps: Object.keys(byRep).length,
        analysisDate: new Date().toISOString()
      }
    };
  }

  /**
   * Enrich activities with time attributes
   */
  enrichActivities(activities) {
    return activities.map(activity => {
      const date = new Date(activity.timestamp || activity.activityDate || activity.createdDate);

      return {
        ...activity,
        hour: date.getHours(),
        dayOfWeek: date.getDay(), // 0 = Sunday
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()],
        isWorkingHours: date.getHours() >= this.workingHours.start &&
                       date.getHours() < this.workingHours.end,
        timeSlot: this.getTimeSlot(date.getHours())
      };
    });
  }

  /**
   * Get time slot for hour
   */
  getTimeSlot(hour) {
    if (hour >= 8 && hour < 10) return 'Early Morning (8-10am)';
    if (hour >= 10 && hour < 12) return 'Late Morning (10am-12pm)';
    if (hour >= 12 && hour < 14) return 'Lunch (12-2pm)';
    if (hour >= 14 && hour < 16) return 'Early Afternoon (2-4pm)';
    if (hour >= 16 && hour < 18) return 'Late Afternoon (4-6pm)';
    return 'After Hours';
  }

  /**
   * Group activities by rep
   */
  groupByRep(activities) {
    const grouped = {};

    for (const activity of activities) {
      const repId = activity.ownerId || activity.repId || activity.userId || 'unknown';

      if (!grouped[repId]) {
        grouped[repId] = [];
      }

      grouped[repId].push(activity);
    }

    return grouped;
  }

  /**
   * Calculate rep-level metrics
   */
  calculateRepMetrics(byRep) {
    const metrics = [];

    for (const [repId, activities] of Object.entries(byRep)) {
      if (activities.length < this.minActivitiesPerRep) {
        if (this.verbose) {
          console.log(`Skipping rep ${repId}: insufficient activities (${activities.length})`);
        }
        continue;
      }

      const calls = activities.filter(a => a.type === 'Call' || a.activityType === 'Call');
      const emails = activities.filter(a => a.type === 'Email' || a.activityType === 'Email');
      const meetings = activities.filter(a => a.type === 'Meeting' || a.activityType === 'Meeting');

      const connects = calls.filter(a => a.outcome === 'Connected' || a.connected === true);
      const responses = emails.filter(a => a.outcome === 'Response' || a.responded === true);
      const meetingsHeld = meetings.filter(a => a.outcome === 'Held' || a.held === true);

      const repMetric = {
        repId,
        repName: activities[0].ownerName || activities[0].repName || repId,
        totalActivities: activities.length,
        calls: calls.length,
        emails: emails.length,
        meetings: meetings.length,
        connects: connects.length,
        responses: responses.length,
        meetingsHeld: meetingsHeld.length,
        connectRate: calls.length > 0 ? connects.length / calls.length : 0,
        responseRate: emails.length > 0 ? responses.length / emails.length : 0,
        meetingHeldRate: meetings.length > 0 ? meetingsHeld.length / meetings.length : 0,
        callsPerDay: this.calculateDailyAverage(calls),
        emailsPerDay: this.calculateDailyAverage(emails),
        activitiesPerDay: this.calculateDailyAverage(activities),
        bestTimeSlot: this.getBestTimeSlot(activities),
        bestDay: this.getBestDay(activities)
      };

      // Calculate efficiency score
      repMetric.efficiencyScore = this.calculateEfficiencyScore(repMetric);

      metrics.push(repMetric);
    }

    // Sort by efficiency score
    metrics.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

    return metrics;
  }

  /**
   * Calculate daily average
   */
  calculateDailyAverage(activities) {
    if (activities.length === 0) return 0;

    const dates = [...new Set(activities.map(a => {
      const date = new Date(a.timestamp || a.activityDate || a.createdDate);
      return date.toISOString().split('T')[0];
    }))];

    return activities.length / dates.length;
  }

  /**
   * Get best time slot for a rep
   */
  getBestTimeSlot(activities) {
    const byTimeSlot = {};

    for (const activity of activities) {
      const slot = activity.timeSlot;
      if (!byTimeSlot[slot]) {
        byTimeSlot[slot] = { total: 0, successful: 0 };
      }

      byTimeSlot[slot].total++;
      if (activity.outcome === 'Connected' || activity.outcome === 'Response' ||
          activity.connected || activity.responded) {
        byTimeSlot[slot].successful++;
      }
    }

    // Find slot with highest success rate
    let bestSlot = null;
    let bestRate = 0;

    for (const [slot, data] of Object.entries(byTimeSlot)) {
      const rate = data.successful / data.total;
      if (rate > bestRate && data.total >= 10) { // Minimum 10 activities
        bestRate = rate;
        bestSlot = slot;
      }
    }

    return bestSlot || 'Insufficient data';
  }

  /**
   * Get best day for a rep
   */
  getBestDay(activities) {
    const byDay = {};

    for (const activity of activities) {
      const day = activity.dayName;
      if (!byDay[day]) {
        byDay[day] = { total: 0, successful: 0 };
      }

      byDay[day].total++;
      if (activity.outcome === 'Connected' || activity.outcome === 'Response' ||
          activity.connected || activity.responded) {
        byDay[day].successful++;
      }
    }

    // Find day with highest success rate
    let bestDay = null;
    let bestRate = 0;

    for (const [day, data] of Object.entries(byDay)) {
      const rate = data.successful / data.total;
      if (rate > bestRate && data.total >= 10) {
        bestRate = rate;
        bestDay = day;
      }
    }

    return bestDay || 'Insufficient data';
  }

  /**
   * Calculate efficiency score (0-100)
   */
  calculateEfficiencyScore(metrics) {
    // Weighted score
    const weights = {
      connectRate: 0.35,
      responseRate: 0.25,
      meetingHeldRate: 0.20,
      activityVolume: 0.20
    };

    // Normalize activity volume (assume 50 activities/day is 100%)
    const volumeScore = Math.min(metrics.activitiesPerDay / 50, 1.0);

    const score = (
      metrics.connectRate * weights.connectRate +
      metrics.responseRate * weights.responseRate +
      metrics.meetingHeldRate * weights.meetingHeldRate +
      volumeScore * weights.activityVolume
    ) * 100;

    return Math.round(score);
  }

  /**
   * Identify best practices from top performers
   */
  identifyBestPractices(repMetrics) {
    if (repMetrics.length === 0) return [];

    // Top quartile performers
    const topQuartile = Math.ceil(repMetrics.length * 0.25);
    const topPerformers = repMetrics.slice(0, topQuartile);
    const avgPerformers = repMetrics.slice(topQuartile);

    const practices = [];

    // Compare top vs average performers
    const topAvgConnectRate = this.average(topPerformers, 'connectRate');
    const avgConnectRate = this.average(avgPerformers, 'connectRate');

    if (topAvgConnectRate > avgConnectRate * 1.2) {
      practices.push({
        practice: 'Higher connect rates',
        topQuartile: (topAvgConnectRate * 100).toFixed(1) + '%',
        average: (avgConnectRate * 100).toFixed(1) + '%',
        impact: `${((topAvgConnectRate / avgConnectRate - 1) * 100).toFixed(0)}% improvement`,
        observation: 'Top performers achieve significantly higher connect rates',
        recommendation: 'Analyze top performer call scripts and timing strategies'
      });
    }

    // Activity volume
    const topAvgVolume = this.average(topPerformers, 'activitiesPerDay');
    const avgVolume = this.average(avgPerformers, 'activitiesPerDay');

    if (topAvgVolume > avgVolume * 1.15) {
      practices.push({
        practice: 'Higher activity volume',
        topQuartile: topAvgVolume.toFixed(1) + ' activities/day',
        average: avgVolume.toFixed(1) + ' activities/day',
        impact: `${((topAvgVolume / avgVolume - 1) * 100).toFixed(0)}% more activities`,
        observation: 'Top performers maintain higher daily activity levels',
        recommendation: 'Review tools and processes to increase capacity'
      });
    }

    // Time slot consistency
    const topTimeSlots = topPerformers.map(p => p.bestTimeSlot);
    const mostCommonSlot = this.mostCommon(topTimeSlots);

    if (mostCommonSlot) {
      practices.push({
        practice: 'Optimal time slot usage',
        topQuartile: mostCommonSlot,
        observation: `${topPerformers.length} of top ${topQuartile} reps peak during this time`,
        recommendation: `Encourage activity during ${mostCommonSlot} for best results`
      });
    }

    return practices;
  }

  /**
   * Detect coaching opportunities
   */
  detectCoachingOpportunities(repMetrics, bestPractices) {
    const opportunities = [];

    // Bottom quartile performers
    const bottomQuartile = Math.floor(repMetrics.length * 0.75);
    const needsCoaching = repMetrics.slice(bottomQuartile);

    for (const rep of needsCoaching) {
      const repOpportunities = [];

      // Low connect rate
      if (rep.connectRate < 0.12) {
        repOpportunities.push({
          area: 'Connect Rate',
          current: (rep.connectRate * 100).toFixed(1) + '%',
          target: '15%+',
          gap: 'Significant',
          coaching: 'Practice cold calling techniques, review script, optimize calling times'
        });
      }

      // Low activity volume
      if (rep.activitiesPerDay < 30) {
        repOpportunities.push({
          area: 'Activity Volume',
          current: rep.activitiesPerDay.toFixed(1) + ' activities/day',
          target: '40-50/day',
          gap: 'Moderate',
          coaching: 'Time management training, reduce admin time, use automation tools'
        });
      }

      // Low response rate
      if (rep.responseRate < 0.08) {
        repOpportunities.push({
          area: 'Email Response Rate',
          current: (rep.responseRate * 100).toFixed(1) + '%',
          target: '10%+',
          gap: 'Moderate',
          coaching: 'Email copywriting workshop, A/B test subject lines, personalization training'
        });
      }

      if (repOpportunities.length > 0) {
        opportunities.push({
          repId: rep.repId,
          repName: rep.repName,
          efficiencyScore: rep.efficiencyScore,
          opportunities: repOpportunities,
          priority: repOpportunities.length >= 3 ? 'High' : 'Medium'
        });
      }
    }

    return opportunities;
  }

  /**
   * Analyze time patterns
   */
  analyzeTimePatterns(activities) {
    const byTimeSlot = {};
    const byHour = {};
    const byDay = {};

    for (const activity of activities) {
      // By time slot
      const slot = activity.timeSlot;
      if (!byTimeSlot[slot]) {
        byTimeSlot[slot] = { total: 0, successful: 0 };
      }
      byTimeSlot[slot].total++;
      if (activity.outcome === 'Connected' || activity.outcome === 'Response') {
        byTimeSlot[slot].successful++;
      }

      // By hour
      const hour = activity.hour;
      if (!byHour[hour]) {
        byHour[hour] = { total: 0, successful: 0 };
      }
      byHour[hour].total++;
      if (activity.outcome === 'Connected' || activity.outcome === 'Response') {
        byHour[hour].successful++;
      }

      // By day
      const day = activity.dayName;
      if (!byDay[day]) {
        byDay[day] = { total: 0, successful: 0 };
      }
      byDay[day].total++;
      if (activity.outcome === 'Connected' || activity.outcome === 'Response') {
        byDay[day].successful++;
      }
    }

    // Calculate success rates
    const timeSlotAnalysis = Object.entries(byTimeSlot).map(([slot, data]) => ({
      slot,
      total: data.total,
      successful: data.successful,
      successRate: (data.successful / data.total * 100).toFixed(1) + '%'
    })).sort((a, b) => b.successful / b.total - a.successful / a.total);

    const dayAnalysis = Object.entries(byDay).map(([day, data]) => ({
      day,
      total: data.total,
      successful: data.successful,
      successRate: (data.successful / data.total * 100).toFixed(1) + '%'
    })).sort((a, b) => b.successful / b.total - a.successful / a.total);

    return {
      byTimeSlot: timeSlotAnalysis,
      byDay: dayAnalysis,
      bestTimeSlot: timeSlotAnalysis[0],
      bestDay: dayAnalysis[0]
    };
  }

  /**
   * Analyze efficiency
   */
  analyzeEfficiency(activities) {
    const calls = activities.filter(a => a.type === 'Call' || a.activityType === 'Call');
    const emails = activities.filter(a => a.type === 'Email' || a.activityType === 'Email');
    const meetings = activities.filter(a => a.type === 'Meeting' || a.activityType === 'Meeting');

    const connects = calls.filter(a => a.outcome === 'Connected' || a.connected === true);
    const responses = emails.filter(a => a.outcome === 'Response' || a.responded === true);
    const meetingsHeld = meetings.filter(a => a.outcome === 'Held' || a.held === true);

    return {
      callEfficiency: {
        total: calls.length,
        successful: connects.length,
        rate: calls.length > 0 ? (connects.length / calls.length * 100).toFixed(1) + '%' : 'N/A'
      },
      emailEfficiency: {
        total: emails.length,
        successful: responses.length,
        rate: emails.length > 0 ? (responses.length / emails.length * 100).toFixed(1) + '%' : 'N/A'
      },
      meetingEfficiency: {
        total: meetings.length,
        successful: meetingsHeld.length,
        rate: meetings.length > 0 ? (meetingsHeld.length / meetings.length * 100).toFixed(1) + '%' : 'N/A'
      }
    };
  }

  /**
   * Generate summary
   */
  generateSummary(repMetrics, bestPractices, coachingOpportunities) {
    if (repMetrics.length === 0) {
      return {
        status: 'insufficient_data',
        message: 'Not enough rep data for meaningful analysis'
      };
    }

    const avgEfficiency = this.average(repMetrics, 'efficiencyScore');
    const topPerformer = repMetrics[0];
    const needsCoachingCount = coachingOpportunities.length;

    return {
      status: 'complete',
      totalReps: repMetrics.length,
      avgEfficiencyScore: Math.round(avgEfficiency),
      topPerformer: {
        name: topPerformer.repName,
        score: topPerformer.efficiencyScore,
        connectRate: (topPerformer.connectRate * 100).toFixed(1) + '%'
      },
      bestPracticesIdentified: bestPractices.length,
      repsNeedingCoaching: needsCoachingCount,
      coachingPriority: needsCoachingCount > repMetrics.length * 0.3 ? 'High' : 'Medium'
    };
  }

  /**
   * Utility: Calculate average of a property
   */
  average(array, property) {
    if (array.length === 0) return 0;
    const sum = array.reduce((acc, item) => acc + (item[property] || 0), 0);
    return sum / array.length;
  }

  /**
   * Utility: Find most common value
   */
  mostCommon(array) {
    if (array.length === 0) return null;

    const counts = {};
    for (const item of array) {
      counts[item] = (counts[item] || 0) + 1;
    }

    let maxCount = 0;
    let mostCommon = null;

    for (const [item, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    }

    return mostCommon;
  }
}

/**
 * CLI Interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Sales Activity Analyzer - CLI Usage

Usage:
  node sales-activity-analyzer.js [options]

Options:
  --activities <file>   Path to activities JSON file (required)
  --output <file>       Output file for analysis (optional)
  --verbose             Enable verbose logging
  --help, -h            Show this help message

Example:
  node sales-activity-analyzer.js \\
    --activities ./activities.json \\
    --output ./activity-analysis.json \\
    --verbose

Input Format:
  activities.json: Array of activity objects with:
    - ownerId/repId: Rep identifier
    - type/activityType: Call, Email, Meeting
    - timestamp/activityDate: ISO 8601 timestamp
    - outcome: Connected, Response, Held (optional)

Output Format:
  JSON object with:
    - summary: High-level analysis summary
    - repMetrics: Individual rep performance
    - bestPractices: Identified from top performers
    - coachingOpportunities: Areas for improvement
    - timeAnalysis: Time-of-day patterns
    - efficiency: Overall efficiency metrics
`);
    process.exit(0);
  }

  const activitiesFile = args[args.indexOf('--activities') + 1];
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  const verbose = args.includes('--verbose');

  if (!activitiesFile) {
    console.error('Error: --activities is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  try {
    // Load activities
    const activities = JSON.parse(fs.readFileSync(activitiesFile, 'utf-8'));

    // Run analysis
    const analyzer = new SalesActivityAnalyzer({ verbose });
    const analysis = analyzer.analyze(activities);

    // Output results
    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(analysis, null, 2));
      console.log(`\n✓ Analysis written to ${outputFile}`);
    } else {
      console.log('\n=== Activity Analysis Results ===\n');
      console.log(JSON.stringify(analysis, null, 2));
    }

    // Summary output
    if (verbose && analysis.summary) {
      console.log('\n=== Summary ===');
      console.log(`Total Reps: ${analysis.summary.totalReps}`);
      console.log(`Avg Efficiency Score: ${analysis.summary.avgEfficiencyScore}/100`);
      console.log(`Top Performer: ${analysis.summary.topPerformer.name} (${analysis.summary.topPerformer.score}/100)`);
      console.log(`Best Practices Identified: ${analysis.summary.bestPracticesIdentified}`);
      console.log(`Reps Needing Coaching: ${analysis.summary.repsNeedingCoaching}`);
    }

  } catch (error) {
    console.error('Error running analysis:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

module.exports = SalesActivityAnalyzer;
