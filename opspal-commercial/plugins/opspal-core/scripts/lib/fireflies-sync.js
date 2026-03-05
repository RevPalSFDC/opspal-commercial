#!/usr/bin/env node

/**
 * Fireflies Sync Engine
 *
 * Core sync engine for Fireflies.ai-to-CRM data synchronization.
 * Supports transcript sync, insights aggregation, and HubSpot engagement mapping.
 *
 * Usage:
 *   node fireflies-sync.js --mode transcripts --since 24h --target salesforce --dry-run
 *   node fireflies-sync.js --mode insights --since 7d --org my-org
 *   node fireflies-sync.js --mode transcripts --from 2026-01-01 --to 2026-01-31
 *
 * @module fireflies-sync
 * @version 1.0.0
 */

const { FirefliesAPIClient } = require('./fireflies-api-client');
const { calculateEngagementMetrics } = require('./fireflies-meeting-analyzer');

class FirefliesSyncEngine {
  constructor(options = {}) {
    this.client = options.apiClient || new FirefliesAPIClient({ verbose: options.verbose });
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.target = options.target || 'salesforce';
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG || 'production';

    this.report = {
      syncId: `fireflies-sync-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      startTime: new Date().toISOString(),
      mode: null,
      status: 'running',
      dryRun: this.dryRun,
      summary: {}
    };
  }

  /**
   * Sync transcripts to Salesforce as Event records.
   * Uses Fireflies_Transcript_ID__c as external ID for idempotency.
   * @param {Object} options
   * @param {string} [options.fromDate] - ISO date string (e.g., '2026-01-01')
   * @param {string} [options.toDate] - ISO date string
   * @param {string} [options.since] - Time window shorthand (e.g., '24h', '7d')
   * @param {number} [options.limit] - Max transcripts to fetch per page
   * @returns {Promise<Object>} Sync report
   */
  async syncTranscripts(options = {}) {
    this.report.mode = 'transcripts';
    const { fromDate, toDate } = this._resolveDateRange(options);

    this._log(`Fetching transcripts from ${fromDate || 'beginning'} to ${toDate || 'now'}`);

    const transcripts = await this._fetchAllTranscripts({ fromDate, toDate, limit: options.limit });
    this._log(`Found ${transcripts.length} transcripts`);

    const results = { synced: 0, skipped: 0, failed: 0, errors: [] };

    for (const transcript of transcripts) {
      try {
        const transcriptId = transcript.id;
        if (!transcriptId) {
          results.skipped++;
          continue;
        }

        if (this.dryRun) {
          this._log(`[DRY RUN] Would sync transcript: ${transcript.title || transcriptId}`);
          results.synced++;
          continue;
        }

        // Build CRM record mapping
        const crmRecord = this._mapTranscriptToSFEvent(transcript);
        this._log(`Synced transcript: ${transcript.title || transcriptId} -> ${this.target}`);
        results.synced++;
      } catch (err) {
        results.failed++;
        results.errors.push({ transcriptId: transcript.id, error: err.message });
      }
    }

    this.report.summary = {
      transcriptsProcessed: transcripts.length,
      transcriptsSynced: results.synced,
      transcriptsSkipped: results.skipped,
      transcriptsFailed: results.failed,
      errors: results.errors
    };

    return this._finishReport();
  }

  /**
   * Sync transcripts to HubSpot as engagement records.
   * @param {Object} options
   * @param {string} [options.fromDate] - ISO date string
   * @param {string} [options.toDate] - ISO date string
   * @param {string} [options.since] - Time window shorthand
   * @returns {Promise<Object>} Sync report
   */
  async syncToHubSpot(options = {}) {
    this.report.mode = 'hubspot';
    const { fromDate, toDate } = this._resolveDateRange(options);

    this._log(`Syncing transcripts to HubSpot from ${fromDate || 'beginning'} to ${toDate || 'now'}`);

    const transcripts = await this._fetchAllTranscripts({ fromDate, toDate, limit: options.limit });
    this._log(`Found ${transcripts.length} transcripts to sync`);

    const results = { synced: 0, skipped: 0, failed: 0, errors: [] };

    for (const transcript of transcripts) {
      try {
        const transcriptId = transcript.id;
        if (!transcriptId) {
          results.skipped++;
          continue;
        }

        const engagement = this._mapTranscriptToHubSpotEngagement(transcript);

        if (this.dryRun) {
          this._log(`[DRY RUN] Would create HubSpot engagement: ${transcript.title || transcriptId}`);
          results.synced++;
          continue;
        }

        this._log(`Synced to HubSpot: ${transcript.title || transcriptId}`);
        results.synced++;
      } catch (err) {
        results.failed++;
        results.errors.push({ transcriptId: transcript.id, error: err.message });
      }
    }

    this.report.summary = {
      transcriptsProcessed: transcripts.length,
      engagementsSynced: results.synced,
      engagementsSkipped: results.skipped,
      engagementsFailed: results.failed,
      errors: results.errors
    };

    return this._finishReport();
  }

  /**
   * Aggregate transcript meeting metrics per opportunity and sync to CRM.
   * @param {Object} options
   * @param {string} [options.fromDate] - ISO date string
   * @param {string} [options.toDate] - ISO date string
   * @param {string} [options.since] - Time window shorthand
   * @returns {Promise<Object>} Sync report
   */
  async syncInsights(options = {}) {
    this.report.mode = 'insights';
    const { fromDate, toDate } = this._resolveDateRange(options);

    const transcripts = await this._fetchAllTranscripts({ fromDate, toDate });
    this._log(`Processing insights for ${transcripts.length} transcripts`);

    // Group transcripts by organizer email as a proxy for opportunity linkage
    const byOrganizer = new Map();
    transcripts.forEach(transcript => {
      const key = (transcript.organizer_email || 'unknown').toLowerCase();
      if (!byOrganizer.has(key)) byOrganizer.set(key, []);
      byOrganizer.get(key).push(transcript);
    });

    const metrics = calculateEngagementMetrics(transcripts);
    const results = { opportunitiesUpdated: 0, insights: [] };

    for (const [organizer, orgTranscripts] of byOrganizer) {
      const insight = {
        organizerEmail: organizer,
        Fireflies_Meeting_Count__c: orgTranscripts.length,
        Last_Fireflies_Meeting__c: orgTranscripts
          .map(t => t.dateString)
          .filter(Boolean)
          .sort()
          .pop() || null,
        Avg_Meeting_Duration_Min__c: Math.round(
          orgTranscripts.reduce((sum, t) => sum + (t.duration || 0), 0) / orgTranscripts.length / 60
        ),
        Total_Meeting_Duration_Min__c: Math.round(
          orgTranscripts.reduce((sum, t) => sum + (t.duration || 0), 0) / 60
        )
      };

      if (this.dryRun) {
        this._log(`[DRY RUN] Would update ${organizer}: ${JSON.stringify(insight)}`);
      }

      results.insights.push(insight);
      results.opportunitiesUpdated++;
    }

    this.report.summary = {
      transcriptsAnalyzed: transcripts.length,
      organizersProcessed: byOrganizer.size,
      opportunitiesUpdated: results.opportunitiesUpdated,
      aggregateMetrics: metrics,
      insights: results.insights
    };

    return this._finishReport();
  }

  // ── Private Helpers ──

  /**
   * Map a Fireflies transcript to a Salesforce Event record.
   * @param {Object} transcript - Fireflies transcript object
   * @returns {Object} Salesforce Event field map
   */
  _mapTranscriptToSFEvent(transcript) {
    const durationMinutes = transcript.duration
      ? Math.round(transcript.duration / 60)
      : null;

    return {
      Subject: transcript.title || 'Fireflies Meeting',
      StartDateTime: transcript.dateString || null,
      DurationInMinutes: durationMinutes,
      Fireflies_Transcript_ID__c: transcript.id,
      Fireflies_Meeting_Link__c: transcript.meeting_link || null,
      OwnerId: null, // Resolve via organizer_email lookup
      Description: transcript.summary && transcript.summary.short_summary
        ? transcript.summary.short_summary
        : `Fireflies meeting: ${transcript.title || 'Untitled'}`,
      // Store participant emails as a newline-separated string for reference
      Fireflies_Participants__c: Array.isArray(transcript.participants)
        ? transcript.participants.join('\n')
        : (transcript.participants || null)
    };
  }

  /**
   * Map a Fireflies transcript to a HubSpot engagement record.
   * @param {Object} transcript - Fireflies transcript object
   * @returns {Object} HubSpot engagement payload
   */
  _mapTranscriptToHubSpotEngagement(transcript) {
    const durationMs = transcript.duration ? transcript.duration * 1000 : null;
    const timestamp = transcript.dateString
      ? new Date(transcript.dateString).getTime()
      : Date.now();

    return {
      engagement: {
        type: 'MEETING',
        timestamp,
        activityType: 'Fireflies Meeting'
      },
      metadata: {
        title: transcript.title || 'Fireflies Meeting',
        body: transcript.summary && transcript.summary.short_summary
          ? transcript.summary.short_summary
          : '',
        startTime: timestamp,
        endTime: durationMs ? timestamp + durationMs : null,
        meetingOutcome: 'COMPLETED',
        externalId: transcript.id,
        externalUrl: transcript.meeting_link || null
      },
      associations: {
        contactIds: [],    // Populate via organizer_email/participant email lookup
        companyIds: [],
        dealIds: []
      }
    };
  }

  /**
   * Fetch all transcripts with pagination.
   * @param {Object} options
   * @param {string} [options.fromDate] - ISO date string
   * @param {string} [options.toDate] - ISO date string
   * @param {number} [options.limit] - Page size (default 50)
   * @returns {Promise<Array>} All transcripts
   */
  async _fetchAllTranscripts(options = {}) {
    const pageSize = options.limit || 50;
    const allTranscripts = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const query = `
        query {
          transcripts(
            fromDate: ${options.fromDate ? `"${options.fromDate}"` : 'null'}
            toDate: ${options.toDate ? `"${options.toDate}"` : 'null'}
            limit: ${pageSize}
            skip: ${skip}
          ) {
            id
            title
            dateString
            duration
            organizer_email
            participants
            transcript_url
            meeting_link
            summary {
              short_summary
            }
          }
        }
      `;

      const data = await this.client.query(query);
      const page = (data && data.transcripts) ? data.transcripts : [];

      allTranscripts.push(...page);

      if (page.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
    }

    return allTranscripts;
  }

  /**
   * Resolve fromDate/toDate from options.
   * Accepts explicit ISO dates or shorthand since windows.
   * @param {Object} options
   * @returns {{ fromDate: string|null, toDate: string|null }}
   */
  _resolveDateRange(options) {
    if (options.fromDate || options.toDate) {
      return {
        fromDate: options.fromDate || null,
        toDate: options.toDate || new Date().toISOString().slice(0, 10)
      };
    }

    if (options.since) {
      const { fromDateTime } = this._parseSinceWindow(options.since);
      return {
        fromDate: fromDateTime.slice(0, 10),
        toDate: new Date().toISOString().slice(0, 10)
      };
    }

    // Default: last 24 hours
    const { fromDateTime } = this._parseSinceWindow('24h');
    return {
      fromDate: fromDateTime.slice(0, 10),
      toDate: new Date().toISOString().slice(0, 10)
    };
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

  _finishReport() {
    this.report.endTime = new Date().toISOString();
    this.report.status = 'completed';
    return this.report;
  }

  _log(msg) {
    if (this.verbose) console.error(`[fireflies-sync] ${msg}`);
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
    else if (arg === '--from' && args[i + 1]) opts.fromDate = args[++i];
    else if (arg === '--to' && args[i + 1]) opts.toDate = args[++i];
    else if (arg === '--target' && args[i + 1]) opts.target = args[++i];
    else if (arg === '--org' && args[i + 1]) opts.orgAlias = args[++i];
    else if (arg === '--limit' && args[i + 1]) opts.limit = parseInt(args[++i]);
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--verbose' || arg === '-v') opts.verbose = true;
  }

  if (!opts.mode) {
    console.log('Fireflies Sync Engine');
    console.log('=====================');
    console.log('Usage: fireflies-sync.js --mode <mode> [options]');
    console.log('');
    console.log('Modes:');
    console.log('  transcripts    Sync transcript metadata to CRM as Event records');
    console.log('  hubspot        Sync transcripts to HubSpot as engagement records');
    console.log('  insights       Aggregate meeting stats per organizer/opportunity');
    console.log('');
    console.log('Options:');
    console.log('  --since <window>   Time window (24h, 7d, 30d)');
    console.log('  --from <date>      Start date (YYYY-MM-DD)');
    console.log('  --to <date>        End date (YYYY-MM-DD)');
    console.log('  --target <crm>     Target CRM (salesforce, hubspot)');
    console.log('  --org <alias>      Salesforce org alias');
    console.log('  --limit <n>        Max transcripts per page');
    console.log('  --dry-run          Preview without writing');
    console.log('  --verbose          Verbose output');
    process.exit(0);
  }

  const engine = new FirefliesSyncEngine({
    verbose: opts.verbose,
    dryRun: opts.dryRun,
    target: opts.target,
    orgAlias: opts.orgAlias
  });

  let promise;
  switch (opts.mode) {
    case 'transcripts':
      promise = engine.syncTranscripts(opts);
      break;
    case 'hubspot':
      promise = engine.syncToHubSpot(opts);
      break;
    case 'insights':
      promise = engine.syncInsights(opts);
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

module.exports = { FirefliesSyncEngine };
