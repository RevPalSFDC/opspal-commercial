/**
 * Fireflies Users MCP Tools
 *
 * Tools: users_list
 */

export function registerUserTools(server, getClient) {

  server.tool(
    'users_list',
    'List Fireflies workspace users. Returns user IDs, names, emails, and integrations for mapping meeting organizers to CRM owners.',
    {},
    async (_params) => {
      const client = getClient();

      const query = `
        query {
          users {
            user_id
            name
            email
            integrations
          }
        }
      `;

      const data = await client.query(query);
      const users = (data && data.users) ? data.users : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            users: users.map(u => ({
              user_id: u.user_id,
              name: u.name,
              email: u.email,
              integrations: u.integrations || []
            })),
            count: users.length
          }, null, 2)
        }]
      };
    }
  );
}
