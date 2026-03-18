/**
 * Gong Trackers MCP Tools
 *
 * Tools: trackers_list
 */

export function registerTrackersTools(server, getClient) {

  server.tool(
    'trackers_list',
    'List Gong trackers (keyword/topic monitors). Returns tracker IDs, names, and categories for competitive intelligence and risk signal detection.',
    {
      workspaceId: { type: 'string', description: 'Workspace ID to filter trackers (optional)' }
    },
    async (params) => {
      const client = getClient();
      const queryParams = {};
      if (params.workspaceId) queryParams.workspaceId = params.workspaceId;

      const result = await client.listTrackers(queryParams);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            trackers: (result.trackers || []).map(t => ({
              id: t.trackerId || t.id,
              name: t.trackerName || t.name,
              type: t.type,
              keywords: t.keywords || []
            }))
          }, null, 2)
        }]
      };
    }
  );
}
