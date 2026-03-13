/**
 * Fireflies Search MCP Tools
 *
 * Tools: transcript_search
 */

export function registerSearchTools(server, getClient) {

  server.tool(
    'transcript_search',
    'Search Fireflies transcripts by keyword with advanced filtering. When scope is "sentences", returns the matching excerpt from each transcript. Use this for finding meetings that discussed a specific topic, competitor, or decision.',
    {
      keyword: { type: 'string', description: 'Keyword or phrase to search for (required)' },
      scope: {
        type: 'string',
        description: 'Search scope: "title" (title only), "sentences" (transcript body), or "all" (default: all)',
        enum: ['title', 'sentences', 'all']
      },
      fromDate: { type: 'string', description: 'Start date in ISO 8601 format (optional)' },
      toDate: { type: 'string', description: 'End date in ISO 8601 format (optional)' },
      limit: { type: 'number', description: 'Maximum results to return (max 50, default 20)' },
      organizers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by organizer email addresses (optional)'
      },
      participants: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by participant email addresses (optional)'
      }
    },
    async (params) => {
      if (!params.keyword) {
        return {
          content: [{ type: 'text', text: 'Error: keyword is required' }],
          isError: true
        };
      }

      const client = getClient();
      const scope = params.scope || 'all';
      const limit = Math.min(params.limit || 20, 50);

      // Build the GraphQL transcripts query with keyword filter
      // When scope=sentences, also fetch sentences for excerpt extraction
      const includeSentences = scope === 'sentences' || scope === 'all';

      const query = `
        query {
          transcripts(
            keyword: "${params.keyword}"
            ${scope !== 'all' ? `scope: ${scope}` : ''}
            ${params.fromDate ? `fromDate: "${params.fromDate}"` : ''}
            ${params.toDate ? `toDate: "${params.toDate}"` : ''}
            limit: ${limit}
            skip: 0
            ${params.organizers && params.organizers.length > 0 ? `organizers: ${JSON.stringify(params.organizers)}` : ''}
            ${params.participants && params.participants.length > 0 ? `participants: ${JSON.stringify(params.participants)}` : ''}
          ) {
            id
            title
            dateString
            duration
            organizer_email
            participants
            ${includeSentences ? `
            sentences {
              index
              speaker_name
              raw_text
              start_time
            }
            ` : ''}
          }
        }
      `;

      const data = await client.query(query);
      const transcripts = (data && data.transcripts) ? data.transcripts : [];

      // When searching sentences, extract relevant excerpts containing the keyword
      const results = transcripts.map(t => {
        const result = {
          id: t.id,
          title: t.title,
          dateString: t.dateString,
          duration: t.duration,
          organizer_email: t.organizer_email,
          participants: t.participants
        };

        if (includeSentences && t.sentences && t.sentences.length > 0) {
          const keywordLower = params.keyword.toLowerCase();
          const matchingSentences = t.sentences.filter(s =>
            s.raw_text && s.raw_text.toLowerCase().includes(keywordLower)
          );

          if (matchingSentences.length > 0) {
            result.excerpt = matchingSentences.slice(0, 3).map(s => ({
              speaker: s.speaker_name,
              text: s.raw_text,
              start_time: s.start_time
            }));
            result.matchCount = matchingSentences.length;
          }
        }

        return result;
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            keyword: params.keyword,
            scope,
            results,
            count: results.length
          }, null, 2)
        }]
      };
    }
  );
}
