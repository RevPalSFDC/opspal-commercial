/**
 * Gong Sync MCP Tools
 *
 * Tools: sync_calls_to_crm, run_risk_analysis, competitor_report
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Resolve paths to lib scripts relative to the plugin root
function getLibPath() {
  // Navigate from gong/src/tools/ up to scripts/lib/
  return resolve(__dirname, '..', '..', '..', '..', 'lib');
}

export function registerSyncTools(server, getClient) {

  server.tool(
    'sync_calls_to_crm',
    'Sync Gong call data to Salesforce Events or HubSpot Engagements. Uses Gong_Call_ID__c for idempotency (no duplicate records).',
    {
      since: { type: 'string', description: 'Time window to sync (e.g., "24h", "7d", "2026-01-01")' },
      target: { type: 'string', description: 'Target CRM: "salesforce" or "hubspot" (default: salesforce)' },
      orgAlias: { type: 'string', description: 'Salesforce org alias (default: from SF_TARGET_ORG env)' },
      dryRun: { type: 'boolean', description: 'Preview sync without writing to CRM (default: false)' }
    },
    async (params) => {
      try {
        const libPath = getLibPath();
        const { GongSyncEngine } = require(resolve(libPath, 'gong-sync.js'));

        const engine = new GongSyncEngine({
          client: getClient(),
          verbose: true,
          dryRun: params.dryRun || false,
          target: params.target || 'salesforce',
          orgAlias: params.orgAlias
        });

        const report = await engine.syncCalls({
          since: params.since || '24h'
        });

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
    'run_risk_analysis',
    'Analyze open opportunities for conversation-based risk signals. Scores deals on engagement gaps, competitor mentions, budget concerns, and stakeholder diversity.',
    {
      orgAlias: { type: 'string', description: 'Salesforce org alias' },
      pipeline: { type: 'string', description: 'Pipeline name filter' },
      minAmount: { type: 'number', description: 'Minimum deal amount to analyze' },
      lookbackDays: { type: 'number', description: 'Days of call history to analyze (default: 90)' }
    },
    async (params) => {
      try {
        const libPath = getLibPath();
        const { GongSyncEngine } = require(resolve(libPath, 'gong-sync.js'));

        const engine = new GongSyncEngine({
          client: getClient(),
          verbose: true,
          orgAlias: params.orgAlias
        });

        const report = await engine.runRiskAnalysis({
          pipeline: params.pipeline,
          minAmount: params.minAmount,
          since: `${params.lookbackDays || 90}d`
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(report, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Risk analysis error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.tool(
    'competitor_report',
    'Generate competitive intelligence report from Gong tracker data. Groups competitor mentions by frequency, deal stage, and time trends.',
    {
      period: { type: 'string', description: 'Analysis period (e.g., "2026-Q1", "90d", "30d")' },
      competitors: { type: 'string', description: 'Comma-separated competitor names to track' },
      output: { type: 'string', description: 'Output file path (optional, returns data if not set)' }
    },
    async (params) => {
      try {
        const libPath = getLibPath();
        const { GongSyncEngine } = require(resolve(libPath, 'gong-sync.js'));

        const engine = new GongSyncEngine({
          client: getClient(),
          verbose: true
        });

        const trackerMappings = params.competitors
          ? {
              competitor: params.competitors.split(',').map(c => c.trim()),
              risk: ['going dark', 'delay', 'budget issue', 'reevaluate'],
              positive: ['champion', 'executive buy-in', 'urgency', 'timeline set']
            }
          : undefined;

        const report = await engine.runCompetitorReport({
          period: params.period || '90d',
          output: params.output,
          trackerMappings
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(report, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Competitor report error: ${err.message}` }],
          isError: true
        };
      }
    }
  );
}
