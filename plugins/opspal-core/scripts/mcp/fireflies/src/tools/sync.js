/**
 * Fireflies Sync MCP Tools
 *
 * Tools: sync_transcripts_to_crm, run_meeting_analysis, extract_action_items
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Resolve paths to lib scripts relative to the plugin root
function getLibPath() {
  // Navigate from fireflies/src/tools/ up to scripts/lib/
  return resolve(__dirname, '..', '..', '..', '..', 'lib');
}

export function registerSyncTools(server, getClient) {

  server.tool(
    'sync_transcripts_to_crm',
    'Sync Fireflies transcript metadata to Salesforce Event records or HubSpot Meeting engagements. Uses Fireflies_Transcript_ID__c as external ID for idempotency — safe to run repeatedly without creating duplicates.',
    {
      fromDate: { type: 'string', description: 'Start date in ISO 8601 format (e.g., 2026-01-01)' },
      toDate: { type: 'string', description: 'End date in ISO 8601 format' },
      target: {
        type: 'string',
        description: 'Target CRM: "salesforce" or "hubspot" (default: salesforce)',
        enum: ['salesforce', 'hubspot']
      },
      dryRun: { type: 'boolean', description: 'Preview sync without writing to CRM (default: false)' },
      orgAlias: { type: 'string', description: 'Salesforce org alias (optional, defaults to SF_TARGET_ORG env)' }
    },
    async (params) => {
      try {
        const libPath = getLibPath();
        const { FirefliesSyncEngine } = require(resolve(libPath, 'fireflies-sync.js'));

        const engine = new FirefliesSyncEngine({
          verbose: true,
          dryRun: params.dryRun || false,
          target: params.target || 'salesforce',
          orgAlias: params.orgAlias
        });

        let report;
        if ((params.target || 'salesforce') === 'hubspot') {
          report = await engine.syncToHubSpot({
            fromDate: params.fromDate,
            toDate: params.toDate
          });
        } else {
          report = await engine.syncTranscripts({
            fromDate: params.fromDate,
            toDate: params.toDate
          });
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(report, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Sync error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'run_meeting_analysis',
    'Analyze meeting health and engagement metrics for a date range. Returns engagement scores, talk time ratios, participation rates, and meeting frequency trends per organizer.',
    {
      fromDate: { type: 'string', description: 'Start date in ISO 8601 format (e.g., 2026-01-01)' },
      toDate: { type: 'string', description: 'End date in ISO 8601 format' },
      participants: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter analysis to specific participant email addresses (optional)'
      }
    },
    async (params) => {
      try {
        const client = getClient();
        const libPath = getLibPath();

        // Load the meeting analyzer (CJS module)
        let analyzeMeetingHealth, calculateEngagementMetrics;
        try {
          const analyzer = require(resolve(libPath, 'fireflies-meeting-analyzer.js'));
          analyzeMeetingHealth = analyzer.analyzeMeetingHealth;
          calculateEngagementMetrics = analyzer.calculateEngagementMetrics;
        } catch (e) {
          // Fallback: provide basic analysis inline if the dedicated module is unavailable
          analyzeMeetingHealth = null;
          calculateEngagementMetrics = null;
        }

        // Fetch transcripts for the date range
        const query = `
          query {
            transcripts(
              ${params.fromDate ? `fromDate: "${params.fromDate}"` : ''}
              ${params.toDate ? `toDate: "${params.toDate}"` : ''}
              ${params.participants && params.participants.length > 0 ? `participants: ${JSON.stringify(params.participants)}` : ''}
              limit: 50
              skip: 0
            ) {
              id
              title
              dateString
              duration
              organizer_email
              participants
              sentences {
                speaker_id
                speaker_name
                raw_text
                start_time
                end_time
              }
            }
          }
        `;

        const data = await client.query(query);
        const transcripts = (data && data.transcripts) ? data.transcripts : [];

        let healthMetrics, engagementMetrics;

        if (analyzeMeetingHealth && calculateEngagementMetrics) {
          healthMetrics = analyzeMeetingHealth(transcripts);
          engagementMetrics = calculateEngagementMetrics(transcripts);
        } else {
          // Inline basic analysis
          const totalMeetings = transcripts.length;
          const totalDurationSec = transcripts.reduce((sum, t) => sum + (t.duration || 0), 0);
          const avgDurationMin = totalMeetings > 0 ? Math.round(totalDurationSec / totalMeetings / 60) : 0;

          const byOrganizer = {};
          transcripts.forEach(t => {
            const org = t.organizer_email || 'unknown';
            if (!byOrganizer[org]) byOrganizer[org] = { count: 0, totalDuration: 0 };
            byOrganizer[org].count++;
            byOrganizer[org].totalDuration += (t.duration || 0);
          });

          healthMetrics = {
            totalMeetings,
            totalDurationMinutes: Math.round(totalDurationSec / 60),
            avgDurationMinutes: avgDurationMin,
            organizerBreakdown: byOrganizer
          };

          engagementMetrics = {
            meetingsAnalyzed: totalMeetings,
            avgParticipants: totalMeetings > 0
              ? (transcripts.reduce((sum, t) => sum + (Array.isArray(t.participants) ? t.participants.length : 0), 0) / totalMeetings).toFixed(1)
              : 0
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              fromDate: params.fromDate,
              toDate: params.toDate,
              transcriptCount: transcripts.length,
              meetingHealth: healthMetrics,
              engagementMetrics
            }, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Meeting analysis error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'extract_action_items',
    'Extract action items from Fireflies transcript summaries. Provide a single transcriptId for a specific meeting, or fromDate/toDate to aggregate across a date range.',
    {
      transcriptId: { type: 'string', description: 'Single transcript ID to extract action items from (optional)' },
      fromDate: { type: 'string', description: 'Start date for bulk extraction in ISO 8601 format (optional)' },
      toDate: { type: 'string', description: 'End date for bulk extraction in ISO 8601 format (optional)' }
    },
    async (params) => {
      try {
        const client = getClient();
        const libPath = getLibPath();

        // Try to load FirefliesActionTracker if it exists
        let actionTracker = null;
        try {
          const { FirefliesActionTracker } = require(resolve(libPath, 'fireflies-action-tracker.js'));
          actionTracker = new FirefliesActionTracker({ client });
        } catch (e) {
          // Module not yet available — fall back to inline extraction from summary fields
          actionTracker = null;
        }

        if (actionTracker) {
          const result = await actionTracker.extract({
            transcriptId: params.transcriptId,
            fromDate: params.fromDate,
            toDate: params.toDate
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        }

        // Inline fallback: fetch transcripts and pull action_items from summary
        let transcripts = [];

        if (params.transcriptId) {
          const query = `
            query {
              transcript(id: "${params.transcriptId}") {
                id
                title
                dateString
                organizer_email
                summary {
                  action_items
                }
              }
            }
          `;
          const data = await client.query(query);
          if (data && data.transcript) transcripts = [data.transcript];
        } else {
          const query = `
            query {
              transcripts(
                ${params.fromDate ? `fromDate: "${params.fromDate}"` : ''}
                ${params.toDate ? `toDate: "${params.toDate}"` : ''}
                limit: 50
                skip: 0
              ) {
                id
                title
                dateString
                organizer_email
                summary {
                  action_items
                }
              }
            }
          `;
          const data = await client.query(query);
          transcripts = (data && data.transcripts) ? data.transcripts : [];
        }

        // Aggregate action items across transcripts
        const allActionItems = [];
        transcripts.forEach(t => {
          const items = t.summary && t.summary.action_items;
          if (items) {
            // action_items may be a string (newline-separated) or an array
            const itemList = Array.isArray(items)
              ? items
              : items.split('\n').filter(line => line.trim());

            itemList.forEach(item => {
              allActionItems.push({
                transcriptId: t.id,
                transcriptTitle: t.title,
                date: t.dateString,
                organizer: t.organizer_email,
                actionItem: item.trim()
              });
            });
          }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              transcriptsScanned: transcripts.length,
              actionItemCount: allActionItems.length,
              actionItems: allActionItems
            }, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Action item extraction error: ${err.message}` }],
          isError: true
        };
      }
    }
  );
}
