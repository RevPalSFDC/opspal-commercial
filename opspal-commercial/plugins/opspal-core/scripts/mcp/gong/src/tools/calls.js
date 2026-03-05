/**
 * Gong Calls MCP Tools
 *
 * Tools: calls_list, calls_extensive, calls_transcript
 */

import { createRequire } from 'module';

export function registerCallsTools(server, getClient) {

  server.tool(
    'calls_list',
    'List Gong calls with metadata. Returns call IDs, titles, dates, durations, and participant info.',
    {
      fromDateTime: { type: 'string', description: 'ISO 8601 start datetime (e.g., 2026-01-01T00:00:00Z)' },
      toDateTime: { type: 'string', description: 'ISO 8601 end datetime (optional, defaults to now)' },
      cursor: { type: 'string', description: 'Pagination cursor from previous response' }
    },
    async (params) => {
      const client = getClient();
      const queryParams = {};
      if (params.fromDateTime) queryParams.fromDateTime = params.fromDateTime;
      if (params.toDateTime) queryParams.toDateTime = params.toDateTime;
      if (params.cursor) queryParams.cursor = params.cursor;

      const result = await client.listCalls(queryParams);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            calls: (result.calls || []).map(c => ({
              id: c.id,
              title: c.title,
              started: c.started,
              duration: c.duration,
              direction: c.direction,
              url: c.url,
              parties: (c.parties || []).length
            })),
            totalRecords: result.records?.totalRecords,
            nextCursor: result.records?.cursor || null
          }, null, 2)
        }]
      };
    }
  );

  server.tool(
    'calls_extensive',
    'Get detailed call data including parties, trackers, topics, and interaction stats. Use contentSelector to control which fields are returned.',
    {
      callIds: { type: 'string', description: 'Comma-separated call IDs (optional if using date range)' },
      fromDateTime: { type: 'string', description: 'ISO 8601 start datetime (alternative to callIds)' },
      toDateTime: { type: 'string', description: 'ISO 8601 end datetime' },
      cursor: { type: 'string', description: 'Pagination cursor' },
      includeTrackers: { type: 'boolean', description: 'Include tracker/keyword data (default: true)' },
      includeTopics: { type: 'boolean', description: 'Include topic data (default: true)' },
      includeInteraction: { type: 'boolean', description: 'Include interaction stats (default: true)' }
    },
    async (params) => {
      const client = getClient();
      const body = {};

      // Build filter
      const filter = {};
      if (params.callIds) {
        filter.callIds = params.callIds.split(',').map(id => id.trim());
      }
      if (params.fromDateTime) filter.fromDateTime = params.fromDateTime;
      if (params.toDateTime) filter.toDateTime = params.toDateTime;
      if (Object.keys(filter).length > 0) body.filter = filter;

      // Build content selector
      body.contentSelector = {
        exposedFields: {
          parties: true,
          content: {
            trackers: params.includeTrackers !== false,
            topics: params.includeTopics !== false
          },
          interaction: {
            speakers: params.includeInteraction !== false
          }
        }
      };

      if (params.cursor) body.cursor = params.cursor;

      const result = await client.getCallsExtensive(body);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            calls: result.calls || [],
            totalRecords: result.records?.totalRecords,
            nextCursor: result.records?.cursor || null
          }, null, 2)
        }]
      };
    }
  );

  server.tool(
    'calls_transcript',
    'Get full call transcripts with speaker identification. Cross-reference speakerId with parties from calls_extensive.',
    {
      callIds: { type: 'string', description: 'Comma-separated call IDs to get transcripts for (required)' },
      cursor: { type: 'string', description: 'Pagination cursor' }
    },
    async (params) => {
      if (!params.callIds) {
        return {
          content: [{ type: 'text', text: 'Error: callIds is required' }],
          isError: true
        };
      }

      const client = getClient();
      const body = {
        filter: {
          callIds: params.callIds.split(',').map(id => id.trim())
        }
      };
      if (params.cursor) body.cursor = params.cursor;

      const result = await client.getTranscripts(body);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            callTranscripts: result.callTranscripts || [],
            nextCursor: result.records?.cursor || null
          }, null, 2)
        }]
      };
    }
  );
}
