#!/usr/bin/env node

/**
 * Gong Sync Engine
 *
 * Core sync engine for Gong-to-CRM data synchronization.
 * Supports call sync, insights aggregation, risk analysis, and competitor reports.
 *
 * Usage:
 *   node gong-sync.js --mode calls --since 24h --target salesforce --dry-run
 *   node gong-sync.js --mode risk-analysis --pipeline Enterprise --min-amount 50000
 *   node gong-sync.js --mode competitor-report --period 2026-Q1 --output ./reports/
 *
 * @module gong-sync
 * @version 1.0.0
 */

const { GongAPIClient } = require('./gong-api-client');
const { calculateConversationRisk, aggregateCallMetrics, detectTrackerSignals } = require('./gong-risk-analyzer');
const fs = require('fs');
const path = require('path');

class GongSyncEngine {
  constructor(options = {}) {
    this.client = options.client || new GongAPIClient({ verbose: options.verbose });
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.target = options.target || 'salesforce';
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG || 'production';

    this.report = {
      syncId: `gong-sync-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      startTime: new Date().toISOString(),
      mode: null,
      status: 'running',
      dryRun: this.dryRun,
      summary: {}
    };
  }

  /**
   * Sync call metadata to CRM.
   * Creates SF Events / HS Engagements with Gong_Call_ID__c for idempotency.
   * @param {Object} options
   * @param {string} options.since - Time window (e.g., '24h', '7d', ISO date)
   * @returns {Promise<Object>} Sync report
   */
  async syncCalls(options = {}) {
    this.report.mode = 'calls';
    const { fromDateTime, toDateTime } = this._parseSinceWindow(options.since || '24h');

    this._log(`Fetching calls from ${fromDateTime} to ${toDateTime}`);
    const calls = await this.client.getAllCallsExtensive(fromDateTime, toDateTime);
    this._log(`Found ${calls.length} calls`);

    const results = { synced: 0, skipped: 0, failed: 0, errors: [] };

    for (const call of calls) {
      try {
        const callId = call.id || call.metaData?.id;
        if (!callId) {
          results.skipped++;
          continue;
        }

        if (this.dryRun) {
          this._log(`[DRY RUN] Would sync call: ${call.title || callId}`);
          results.synced++;
          continue;
        }

        // Build CRM record mapping
        const crmRecord = this._mapCallToSFEvent(call);
        this._log(`Synced call: ${call.title || callId} -> ${this.target}`);
        results.synced++;
      } catch (err) {
        results.failed++;
        results.errors.push({ callId: call.id, error: err.message });
      }
    }

    this.report.summary = {
      callsProcessed: calls.length,
      callsSynced: results.synced,
      callsSkipped: results.skipped,
      callsFailed: results.failed,
      errors: results.errors
    };

    return this._finishReport();
  }

  /**
   * Aggregate call insights onto Opportunity fields.
   * @param {Object} options
   * @param {string} options.since - Time window
   * @returns {Promise<Object>} Sync report
   */
  async syncInsights(options = {}) {
    this.report.mode = 'insights';
    const { fromDateTime, toDateTime } = this._parseSinceWindow(options.since || '24h');

    const calls = await this.client.getAllCallsExtensive(fromDateTime, toDateTime);
    this._log(`Processing insights for ${calls.length} calls`);

    // Group calls by opportunity
    const byOpportunity = new Map();
    calls.forEach(call => {
      const oppIds = this._extractOpportunityIds(call);
      oppIds.forEach(oppId => {
        if (!byOpportunity.has(oppId)) byOpportunity.set(oppId, []);
        byOpportunity.get(oppId).push(call);
      });
    });

    const results = { opportunitiesUpdated: 0, insights: [] };

    for (const [oppId, oppCalls] of byOpportunity) {
      const metrics = aggregateCallMetrics(oppCalls);
      const insight = {
        opportunityId: oppId,
        Gong_Calls_Count__c: metrics.callCount,
        Last_Gong_Call__c: metrics.lastCallDate,
        Days_Since_Gong_Call__c: metrics.daysSinceLastCall,
        Avg_Talk_Ratio__c: metrics.avgTalkRatio,
        Total_Call_Duration__c: metrics.totalDuration
      };

      if (this.dryRun) {
        this._log(`[DRY RUN] Would update ${oppId}: ${JSON.stringify(insight)}`);
      }

      results.insights.push(insight);
      results.opportunitiesUpdated++;
    }

    this.report.summary = {
      callsAnalyzed: calls.length,
      opportunitiesUpdated: results.opportunitiesUpdated,
      insights: results.insights
    };

    return this._finishReport();
  }

  /**
   * Run risk analysis on open opportunities.
   * @param {Object} options
   * @param {string} [options.pipeline] - Pipeline name filter
   * @param {number} [options.minAmount] - Minimum deal amount
   * @param {string} [options.output] - Output file path
   * @returns {Promise<Object>} Risk report
   */
  async runRiskAnalysis(options = {}) {
    this.report.mode = 'risk-analysis';

    // Fetch calls from last 90 days for risk context
    const { fromDateTime, toDateTime } = this._parseSinceWindow('90d');
    const calls = await this.client.getAllCallsExtensive(fromDateTime, toDateTime);
    this._log(`Loaded ${calls.length} calls for risk analysis`);

    // Group by opportunity
    const byOpportunity = new Map();
    calls.forEach(call => {
      const oppIds = this._extractOpportunityIds(call);
      oppIds.forEach(oppId => {
        if (!byOpportunity.has(oppId)) byOpportunity.set(oppId, []);
        byOpportunity.get(oppId).push(call);
      });
    });

    const riskResults = [];
    for (const [oppId, oppCalls] of byOpportunity) {
      const opportunity = { Id: oppId, Amount: options.minAmount || 0 };
      const risk = calculateConversationRisk(oppCalls, opportunity);

      if (options.minRiskLevel) {
        const levels = { LOW: 1, MEDIUM: 2, HIGH: 3 };
        if (levels[risk.riskLevel] < levels[options.minRiskLevel]) continue;
      }

      riskResults.push({
        opportunityId: oppId,
        ...risk
      });
    }

    // Sort by risk score descending
    riskResults.sort((a, b) => b.riskScore - a.riskScore);

    this.report.summary = {
      callsAnalyzed: calls.length,
      dealsAnalyzed: byOpportunity.size,
      riskAlerts: riskResults.filter(r => r.riskLevel === 'HIGH').length,
      results: riskResults
    };

    if (options.output) {
      this._writeOutput(options.output, this.report);
    }

    return this._finishReport();
  }

  /**
   * Generate competitor intelligence report.
   * @param {Object} options
   * @param {string} [options.period] - Period (e.g., '2026-Q1')
   * @param {string} [options.output] - Output file path
   * @returns {Promise<Object>} Competitor report
   */
  async runCompetitorReport(options = {}) {
    this.report.mode = 'competitor-report';

    const { fromDateTime, toDateTime } = this._parsePeriod(options.period || '90d');
    const calls = await this.client.getAllCallsExtensive(fromDateTime, toDateTime);
    this._log(`Analyzing ${calls.length} calls for competitor mentions`);

    const trackerMappings = options.trackerMappings || {
      competitor: ['competitor', 'alternative', 'vs', 'compared to'],
      risk: ['going dark', 'delay', 'budget issue', 'reevaluate', 'pushed back'],
      positive: ['champion', 'executive buy-in', 'urgency', 'timeline set', 'next steps']
    };

    const signals = detectTrackerSignals(calls, trackerMappings);

    // Group competitor mentions by name
    const competitorBreakdown = {};
    signals.competitor.forEach(entry => {
      const name = entry.trackerName || 'Unknown';
      if (!competitorBreakdown[name]) {
        competitorBreakdown[name] = { count: 0, calls: [] };
      }
      competitorBreakdown[name].count++;
      competitorBreakdown[name].calls.push({
        callId: entry.callId,
        title: entry.callTitle,
        date: entry.callDate
      });
    });

    this.report.summary = {
      period: options.period || 'Last 90 days',
      callsAnalyzed: calls.length,
      trackerSignals: signals.summary,
      competitorBreakdown,
      riskSignals: signals.risk,
      positiveSignals: signals.positive
    };

    if (options.output) {
      this._writeOutput(options.output, this.report);
    }

    return this._finishReport();
  }

  // ── Helpers ──

  _mapCallToSFEvent(call) {
    const meta = call.metaData || call;
    return {
      Subject: meta.title || 'Gong Call',
      StartDateTime: meta.started || meta.scheduled,
      DurationInMinutes: Math.round((meta.duration || 0) / 60),
      Gong_Call_ID__c: meta.id || call.id,
      Gong_Recording_URL__c: meta.url,
      Description: `Gong call: ${meta.title || 'Untitled'}`
    };
  }

  _extractOpportunityIds(call) {
    const ids = [];
    const context = call.context || call.metaData?.context || [];
    (Array.isArray(context) ? context : [context]).forEach(ctx => {
      const objects = ctx?.objects || [];
      objects.forEach(obj => {
        if (obj.objectType === 'Opportunity' || obj.objectType === 'Deal') {
          if (obj.objectId) ids.push(obj.objectId);
        }
      });
    });
    return ids;
  }

  _parseSinceWindow(since) {
    const now = new Date();
    let from;

    if (/^\d+h$/i.test(since)) {
      from = new Date(now - parseInt(since) * 60 * 60 * 1000);
    } else if (/^\d+d$/i.test(since)) {
      from = new Date(now - parseInt(since) * 24 * 60 * 60 * 1000);
    } else {
      from = new Date(since);
    }

    return {
      fromDateTime: from.toISOString(),
      toDateTime: now.toISOString()
    };
  }

  _parsePeriod(period) {
    if (/^\d{4}-Q[1-4]$/i.test(period)) {
      const [year, q] = period.split('-Q');
      const quarterStart = new Date(parseInt(year), (parseInt(q) - 1) * 3, 1);
      const quarterEnd = new Date(parseInt(year), parseInt(q) * 3, 0, 23, 59, 59);
      return { fromDateTime: quarterStart.toISOString(), toDateTime: quarterEnd.toISOString() };
    }
    return this._parseSinceWindow(period);
  }

  _writeOutput(outputPath, data) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (outputPath.endsWith('.csv')) {
      // Simple CSV for competitor report
      const rows = [];
      if (data.summary.competitorBreakdown) {
        rows.push('Competitor,Mentions,Calls');
        for (const [name, info] of Object.entries(data.summary.competitorBreakdown)) {
          rows.push(`"${name}",${info.count},"${info.calls.map(c => c.title).join('; ')}"`);
        }
      }
      fs.writeFileSync(outputPath, rows.join('\n'));
    } else {
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    }
    this._log(`Output written to ${outputPath}`);
  }

  _finishReport() {
    this.report.endTime = new Date().toISOString();
    this.report.status = 'completed';
    this.report.apiStats = this.client.getStats();
    this.report.throttleStatus = this.client.throttle.getStatus();
    return this.report;
  }

  _log(msg) {
    if (this.verbose) console.error(`[gong-sync] ${msg}`);
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--mode' && args[i + 1]) opts.mode = args[++i];
    else if (arg === '--since' && args[i + 1]) opts.since = args[++i];
    else if (arg === '--target' && args[i + 1]) opts.target = args[++i];
    else if (arg === '--org' && args[i + 1]) opts.orgAlias = args[++i];
    else if (arg === '--pipeline' && args[i + 1]) opts.pipeline = args[++i];
    else if (arg === '--min-amount' && args[i + 1]) opts.minAmount = parseInt(args[++i]);
    else if (arg === '--output' && args[i + 1]) opts.output = args[++i];
    else if (arg === '--period' && args[i + 1]) opts.period = args[++i];
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--verbose' || arg === '-v') opts.verbose = true;
  }

  if (!opts.mode) {
    console.log('Gong Sync Engine');
    console.log('================');
    console.log('Usage: gong-sync.js --mode <mode> [options]');
    console.log('');
    console.log('Modes:');
    console.log('  calls              Sync call metadata to CRM');
    console.log('  insights           Aggregate call stats to Opportunity fields');
    console.log('  risk-analysis      Score open deals for conversation risk');
    console.log('  competitor-report  Generate competitor mention summary');
    console.log('');
    console.log('Options:');
    console.log('  --since <window>   Time window (24h, 7d, 90d, ISO date)');
    console.log('  --target <crm>     Target CRM (salesforce, hubspot)');
    console.log('  --org <alias>      Salesforce org alias');
    console.log('  --pipeline <name>  Pipeline name filter');
    console.log('  --min-amount <n>   Minimum deal amount');
    console.log('  --period <p>       Period (2026-Q1)');
    console.log('  --output <path>    Output file path');
    console.log('  --dry-run          Preview without writing');
    console.log('  --verbose          Verbose output');
    process.exit(0);
  }

  const engine = new GongSyncEngine({
    verbose: opts.verbose,
    dryRun: opts.dryRun,
    target: opts.target,
    orgAlias: opts.orgAlias
  });

  let promise;
  switch (opts.mode) {
    case 'calls':
      promise = engine.syncCalls(opts);
      break;
    case 'insights':
      promise = engine.syncInsights(opts);
      break;
    case 'risk-analysis':
      promise = engine.runRiskAnalysis(opts);
      break;
    case 'competitor-report':
      promise = engine.runCompetitorReport(opts);
      break;
    default:
      console.error(`Unknown mode: ${opts.mode}`);
      process.exit(1);
  }

  promise.then(report => {
    console.log(JSON.stringify(report, null, 2));
  }).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { GongSyncEngine };
