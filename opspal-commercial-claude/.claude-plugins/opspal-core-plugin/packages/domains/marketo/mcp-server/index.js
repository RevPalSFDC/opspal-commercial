#!/usr/bin/env node

/**
 * Marketo MCP Server
 *
 * Model Context Protocol server for Marketo API integration.
 * Provides native tool access to Marketo leads, campaigns, programs, and more.
 *
 * @version 2.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { getConfig, getTokenInfo, apiRequest } from './src/auth/oauth-handler.js';
import { leadTools, executeLeadTool } from './src/tools/leads.js';
import { campaignTools, executeCampaignTool } from './src/tools/campaigns.js';
import { programTools, executeProgramTool } from './src/tools/programs.js';
import { emailTools, executeEmailTool } from './src/tools/emails-mcp.js';
import { landingPageTools, executeLandingPageTool } from './src/tools/landing-pages-mcp.js';
import { formTools, executeFormTool } from './src/tools/forms-mcp.js';
import { analyticsTools, executeAnalyticsTool } from './src/tools/analytics-mcp.js';
import { syncTools, executeSyncTool } from './src/tools/sync.js';

// Server metadata
const SERVER_NAME = 'marketo-mcp-server';
const SERVER_VERSION = '2.0.0';

/**
 * Create and configure the MCP server
 */
function createServer() {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION
    },
    {
      capabilities: {
        tools: {},
        resources: {}
      }
    }
  );

  // Combine all tools
  const allTools = [
    ...leadTools,
    ...campaignTools,
    ...programTools,
    ...emailTools,
    ...landingPageTools,
    ...formTools,
    ...analyticsTools,
    ...syncTools
  ];

  // Handler: List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  });

  // Handler: Execute tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result;

      // Route to appropriate tool handler
      if (name.includes('__lead_')) {
        result = await executeLeadTool(name, args || {});
      } else if (name.includes('__campaign_')) {
        result = await executeCampaignTool(name, args || {});
      } else if (name.includes('__program_')) {
        result = await executeProgramTool(name, args || {});
      } else if (name.includes('__email_')) {
        result = await executeEmailTool(name, args || {});
      } else if (name.includes('__landing_page_')) {
        result = await executeLandingPageTool(name, args || {});
      } else if (name.includes('__form_')) {
        result = await executeFormTool(name, args || {});
      } else if (name.includes('__analytics_')) {
        result = await executeAnalyticsTool(name, args || {});
      } else if (name.includes('__sync_')) {
        result = await executeSyncTool(name, args || {});
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
              tool: name
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  });

  // Handler: List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'marketo://instance/info',
          name: 'Marketo Instance Info',
          description: 'Current Marketo instance configuration and authentication status',
          mimeType: 'application/json'
        },
        {
          uri: 'marketo://instance/limits',
          name: 'Marketo API Limits',
          description: 'Current API usage and rate limits',
          mimeType: 'application/json'
        }
      ]
    };
  });

  // Handler: Read resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      if (uri === 'marketo://instance/info') {
        const config = getConfig();
        const tokenInfo = getTokenInfo();

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                munchkinId: config.munchkinId,
                baseUrl: config.baseUrl,
                authentication: {
                  hasToken: tokenInfo.hasToken,
                  expiresAt: tokenInfo.expiresAt,
                  expiresInSeconds: tokenInfo.expiresIn
                }
              }, null, 2)
            }
          ]
        };

      } else if (uri === 'marketo://instance/limits') {
        // Get API usage stats
        const statsResult = await apiRequest('/rest/v1/stats/usage.json');

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                apiUsage: statsResult.result || [],
                retrievedAt: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      }

      throw new Error(`Unknown resource: ${uri}`);

    } catch (error) {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: error.message
            }, null, 2)
          }
        ]
      };
    }
  });

  return server;
}

/**
 * Main entry point
 */
async function main() {
  // Validate configuration on startup
  try {
    getConfig();
    console.error(`[${SERVER_NAME}] Configuration validated`);
  } catch (error) {
    console.error(`[${SERVER_NAME}] Configuration error: ${error.message}`);
    console.error(`[${SERVER_NAME}] Required environment variables:`);
    console.error('  - MARKETO_CLIENT_ID');
    console.error('  - MARKETO_CLIENT_SECRET');
    console.error('  - MARKETO_BASE_URL');
    process.exit(1);
  }

  // Create server
  const server = createServer();

  // Create transport
  const transport = new StdioServerTransport();

  // Connect
  console.error(`[${SERVER_NAME}] Starting MCP server v${SERVER_VERSION}...`);
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server connected and ready`);
}

// Run
main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error: ${error.message}`);
  process.exit(1);
});
