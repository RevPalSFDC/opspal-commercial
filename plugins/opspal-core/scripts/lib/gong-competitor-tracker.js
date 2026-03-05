#!/usr/bin/env node

/**
 * Gong Competitive Intelligence Tracker
 *
 * Cross-references Gong tracker data against configured competitor list.
 * Groups mentions by competitor, stage, and win/loss outcome.
 * Syncs findings to Opportunity.Competitors_Mentioned__c.
 *
 * @module gong-competitor-tracker
 * @version 1.0.0
 */

const { GongAPIClient } = require('./gong-api-client');
const { detectTrackerSignals } = require('./gong-risk-analyzer');

const DEFAULT_COMPETITORS = [];

class GongCompetitorTracker {
  constructor(options = {}) {
    this.client = options.client || new GongAPIClient({ verbose: options.verbose });
    this.competitors = options.competitors || DEFAULT_COMPETITORS;
    this.verbose = options.verbose || false;
  }

  /**
   * Analyze calls for competitive intelligence.
   * @param {Object} options
   * @param {string} options.fromDateTime - ISO 8601 start
   * @param {string} options.toDateTime - ISO 8601 end
   * @param {string[]} [options.competitors] - Override competitor list
   * @returns {Promise<Object>} Competitive intelligence report
   */
  async analyze(options = {}) {
    const competitors = options.competitors || this.competitors;
    const { fromDateTime, toDateTime } = options;

    if (!fromDateTime) {
      throw new Error('fromDateTime is required');
    }

    const calls = await this.client.getAllCallsExtensive(
      fromDateTime,
      toDateTime || new Date().toISOString()
    );

    this._log(`Analyzing ${calls.length} calls for ${competitors.length} competitors`);

    // Detect tracker signals
    const trackerMappings = {
      competitor: competitors.map(c => c.toLowerCase()),
      risk: ['going dark', 'delay', 'budget', 'reevaluate'],
      positive: ['champion', 'buy-in', 'urgency', 'next steps']
    };
    const signals = detectTrackerSignals(calls, trackerMappings);

    // Build competitor breakdown
    const byCompetitor = this._groupByCompetitor(signals.competitor, competitors);
    const byStage = this._groupByStage(calls, signals.competitor);
    const trends = this._analyzeTrends(signals.competitor);

    return {
      period: { from: fromDateTime, to: toDateTime || new Date().toISOString() },
      callsAnalyzed: calls.length,
      totalMentions: signals.competitor.length,
      byCompetitor,
      byStage,
      trends,
      topCompetitors: Object.entries(byCompetitor)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 10),
      recommendations: this._generateRecommendations(byCompetitor, signals)
    };
  }

  /**
   * Group mentions by competitor name.
   */
  _groupByCompetitor(mentions, competitors) {
    const result = {};

    // Initialize all known competitors
    competitors.forEach(name => {
      result[name] = { mentions: 0, calls: [], uniqueDeals: new Set() };
    });

    mentions.forEach(mention => {
      const trackerName = (mention.trackerName || '').toLowerCase();
      let matched = false;

      for (const competitor of competitors) {
        if (trackerName.includes(competitor.toLowerCase())) {
          if (!result[competitor]) {
            result[competitor] = { mentions: 0, calls: [], uniqueDeals: new Set() };
          }
          result[competitor].mentions++;
          result[competitor].calls.push({
            callId: mention.callId,
            title: mention.callTitle,
            date: mention.callDate
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        const key = mention.trackerName || 'Unknown';
        if (!result[key]) {
          result[key] = { mentions: 0, calls: [], uniqueDeals: new Set() };
        }
        result[key].mentions++;
        result[key].calls.push({
          callId: mention.callId,
          title: mention.callTitle,
          date: mention.callDate
        });
      }
    });

    // Convert Sets to counts for serialization
    for (const key of Object.keys(result)) {
      result[key].uniqueDealCount = result[key].uniqueDeals.size;
      delete result[key].uniqueDeals;
    }

    return result;
  }

  /**
   * Group mentions by deal stage.
   */
  _groupByStage(calls, mentions) {
    const result = {};
    const callMap = new Map(calls.map(c => [c.id || c.metaData?.id, c]));

    mentions.forEach(mention => {
      const call = callMap.get(mention.callId);
      const stage = call?.context?.[0]?.objects?.[0]?.stage || 'Unknown';

      if (!result[stage]) result[stage] = { count: 0, competitors: {} };
      result[stage].count++;

      const competitorName = mention.trackerName || 'Unknown';
      result[stage].competitors[competitorName] = (result[stage].competitors[competitorName] || 0) + 1;
    });

    return result;
  }

  /**
   * Analyze mention trends over time.
   */
  _analyzeTrends(mentions) {
    const byWeek = {};

    mentions.forEach(mention => {
      if (!mention.callDate) return;
      const date = new Date(mention.callDate);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);

      if (!byWeek[weekKey]) byWeek[weekKey] = 0;
      byWeek[weekKey]++;
    });

    const weeks = Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));

    // Trend direction
    let trend = 'stable';
    if (weeks.length >= 4) {
      const recent = weeks.slice(-2).reduce((s, w) => s + w.count, 0);
      const earlier = weeks.slice(-4, -2).reduce((s, w) => s + w.count, 0);
      if (recent > earlier * 1.2) trend = 'increasing';
      else if (recent < earlier * 0.8) trend = 'decreasing';
    }

    return { byWeek: weeks, trend };
  }

  /**
   * Generate actionable recommendations.
   */
  _generateRecommendations(byCompetitor, signals) {
    const recommendations = [];

    const topCompetitors = Object.entries(byCompetitor)
      .filter(([, data]) => data.mentions > 0)
      .sort(([, a], [, b]) => b.mentions - a.mentions);

    if (topCompetitors.length > 0) {
      const [topName, topData] = topCompetitors[0];
      recommendations.push(
        `Top competitor "${topName}" mentioned ${topData.mentions} times - ensure battlecard is current`
      );
    }

    if (topCompetitors.length > 3) {
      recommendations.push(
        `${topCompetitors.length} distinct competitors identified - review competitive positioning strategy`
      );
    }

    if (signals.risk.length > signals.positive.length) {
      recommendations.push(
        'Risk signals outpace positive signals - review deal health across pipeline'
      );
    }

    return recommendations;
  }

  /**
   * Build Competitors_Mentioned__c field value for an opportunity.
   * @param {Array} calls - Calls associated with this opportunity
   * @param {string[]} competitors - Competitor list
   * @returns {string} Semicolon-separated competitor names
   */
  buildCompetitorField(calls, competitors) {
    const trackerMappings = {
      competitor: competitors.map(c => c.toLowerCase()),
      risk: [],
      positive: []
    };

    const signals = detectTrackerSignals(calls, trackerMappings);
    const mentioned = new Set();

    signals.competitor.forEach(entry => {
      for (const comp of competitors) {
        if ((entry.trackerName || '').toLowerCase().includes(comp.toLowerCase())) {
          mentioned.add(comp);
          break;
        }
      }
    });

    return Array.from(mentioned).join(';');
  }

  _log(msg) {
    if (this.verbose) console.error(`[gong-competitor] ${msg}`);
  }
}

module.exports = { GongCompetitorTracker };
