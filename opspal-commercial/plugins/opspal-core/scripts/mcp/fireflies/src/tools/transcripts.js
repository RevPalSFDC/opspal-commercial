/**
 * Fireflies Transcripts MCP Tools
 *
 * Tools: transcripts_list, transcript_get, download_recording
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

export function registerTranscriptTools(server, getClient) {

  server.tool(
    'transcripts_list',
    'List Fireflies transcripts with filtering by date range, keyword, organizer, or participants. Returns transcript IDs, titles, dates, durations, and participant info.',
    {
      fromDate: { type: 'string', description: 'Start date in ISO 8601 format (e.g., 2026-01-01)' },
      toDate: { type: 'string', description: 'End date in ISO 8601 format (optional, defaults to now)' },
      keyword: { type: 'string', description: 'Keyword to search within transcripts (optional)' },
      scope: {
        type: 'string',
        description: 'Search scope when keyword is provided: "title", "sentences", or "all" (default: all)',
        enum: ['title', 'sentences', 'all']
      },
      limit: { type: 'number', description: 'Maximum number of transcripts to return (max 50, default 50)' },
      skip: { type: 'number', description: 'Number of transcripts to skip for pagination (default 0)' },
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
      const client = getClient();

      const queryParams = {
        fromDate: params.fromDate || null,
        toDate: params.toDate || null,
        limit: Math.min(params.limit || 50, 50),
        skip: params.skip || 0
      };

      if (params.keyword) queryParams.keyword = params.keyword;
      if (params.scope && params.scope !== 'all') queryParams.scope = params.scope;
      if (params.organizers && params.organizers.length > 0) queryParams.organizers = params.organizers;
      if (params.participants && params.participants.length > 0) queryParams.participants = params.participants;

      const query = `
        query {
          transcripts(
            ${queryParams.fromDate ? `fromDate: "${queryParams.fromDate}"` : ''}
            ${queryParams.toDate ? `toDate: "${queryParams.toDate}"` : ''}
            ${queryParams.keyword ? `keyword: "${queryParams.keyword}"` : ''}
            ${queryParams.scope ? `scope: ${queryParams.scope}` : ''}
            limit: ${queryParams.limit}
            skip: ${queryParams.skip}
            ${queryParams.organizers ? `organizers: ${JSON.stringify(queryParams.organizers)}` : ''}
            ${queryParams.participants ? `participants: ${JSON.stringify(queryParams.participants)}` : ''}
          ) {
            id
            title
            dateString
            duration
            organizer_email
            participants
            transcript_url
          }
        }
      `;

      const data = await client.query(query);
      const transcripts = (data && data.transcripts) ? data.transcripts : [];

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            transcripts: transcripts.map(t => ({
              id: t.id,
              title: t.title,
              dateString: t.dateString,
              duration: t.duration,
              organizer_email: t.organizer_email,
              participants: t.participants,
              transcript_url: t.transcript_url
            })),
            count: transcripts.length,
            skip: queryParams.skip,
            limit: queryParams.limit
          }, null, 2)
        }]
      };
    }
  );

  server.tool(
    'transcript_get',
    'Get full transcript details including speaker-attributed sentences, AI summary, action items, and meeting attendance. Recording URLs expire after 24 hours.',
    {
      id: { type: 'string', description: 'The transcript ID to retrieve (required)' }
    },
    async (params) => {
      if (!params.id) {
        return {
          content: [{ type: 'text', text: 'Error: id is required' }],
          isError: true
        };
      }

      const client = getClient();

      const query = `
        query {
          transcript(id: "${params.id}") {
            id
            title
            dateString
            duration
            organizer_email
            participants
            meeting_link
            privacy
            sentences {
              index
              speaker_id
              speaker_name
              raw_text
              start_time
              end_time
            }
            summary {
              keywords
              action_items
              gist
              short_summary
              outline
              topics_discussed
            }
            meeting_attendance {
              name
              join_time
              leave_time
            }
            audio_url
            video_url
          }
        }
      `;

      const data = await client.query(query);
      const transcript = data && data.transcript;

      if (!transcript) {
        return {
          content: [{ type: 'text', text: `No transcript found with id: ${params.id}` }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(transcript, null, 2)
        }]
      };
    }
  );

  server.tool(
    'download_recording',
    'Download a meeting audio or video recording from Fireflies. Recording URLs expire after 24 hours — a fresh URL is always fetched before downloading.',
    {
      id: { type: 'string', description: 'The transcript ID whose recording to download (required)' },
      type: {
        type: 'string',
        description: 'Recording type to download: "audio" or "video" (default: audio)',
        enum: ['audio', 'video']
      },
      outputDir: { type: 'string', description: 'Directory to save the recording (default: current working directory)' }
    },
    async (params) => {
      if (!params.id) {
        return {
          content: [{ type: 'text', text: 'Error: id is required' }],
          isError: true
        };
      }

      const client = getClient();
      const recordingType = params.type || 'audio';

      // Always fetch a fresh URL — recording URLs expire after 24 hours
      const urlQuery = `
        query {
          transcript(id: "${params.id}") {
            id
            title
            audio_url
            video_url
          }
        }
      `;

      let transcript;
      try {
        const data = await client.query(urlQuery);
        transcript = data && data.transcript;
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error fetching transcript URLs: ${err.message}` }],
          isError: true
        };
      }

      if (!transcript) {
        return {
          content: [{ type: 'text', text: `No transcript found with id: ${params.id}` }],
          isError: true
        };
      }

      const recordingUrl = recordingType === 'video' ? transcript.video_url : transcript.audio_url;

      if (!recordingUrl) {
        return {
          content: [{ type: 'text', text: `No ${recordingType} URL available for transcript ${params.id}` }],
          isError: true
        };
      }

      // Determine output path
      const outputDir = params.outputDir || process.cwd();
      const ext = recordingType === 'video' ? 'mp4' : 'mp3';
      const safeTitle = (transcript.title || transcript.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
      const outputPath = resolve(outputDir, `${safeTitle}_${transcript.id}.${ext}`);

      // Download the file using https
      try {
        const https = require('https');
        const fileHandle = await fs.open(outputPath, 'w');
        const fileStream = fileHandle.createWriteStream();

        await new Promise((resolveDownload, reject) => {
          const download = (url, redirectCount = 0) => {
            if (redirectCount > 5) {
              reject(new Error('Too many redirects'));
              return;
            }
            https.get(url, (res) => {
              if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                download(res.headers.location, redirectCount + 1);
                return;
              }
              if (res.statusCode !== 200) {
                reject(new Error(`Download failed with status ${res.statusCode}`));
                return;
              }
              res.pipe(fileStream);
              res.on('end', () => resolveDownload());
              res.on('error', reject);
            }).on('error', reject);
          };
          download(recordingUrl);
        });

        await fileHandle.close();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              transcriptId: params.id,
              type: recordingType,
              outputPath,
              note: 'Recording URL was freshly fetched before download (URLs expire after 24 hours)'
            }, null, 2)
          }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Download error: ${err.message}` }],
          isError: true
        };
      }
    }
  );
}
