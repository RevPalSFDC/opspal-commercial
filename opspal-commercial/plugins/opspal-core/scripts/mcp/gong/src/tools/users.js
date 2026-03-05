/**
 * Gong Users MCP Tools
 *
 * Tools: users_list
 */

export function registerUsersTools(server, getClient) {

  server.tool(
    'users_list',
    'List Gong users in the workspace. Returns user IDs, names, emails, and roles for mapping to CRM owners.',
    {
      cursor: { type: 'string', description: 'Pagination cursor from previous response' }
    },
    async (params) => {
      const client = getClient();
      const queryParams = {};
      if (params.cursor) queryParams.cursor = params.cursor;

      const result = await client.listUsers(queryParams);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            users: (result.users || []).map(u => ({
              id: u.id,
              emailAddress: u.emailAddress,
              firstName: u.firstName,
              lastName: u.lastName,
              title: u.title,
              active: u.active,
              created: u.created
            })),
            nextCursor: result.records?.cursor || null
          }, null, 2)
        }]
      };
    }
  );
}
