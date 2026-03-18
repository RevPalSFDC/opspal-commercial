#!/usr/bin/env node

/**
 * Fireflies.ai MCP Server
 *
 * Model Context Protocol server exposing Fireflies meeting intelligence tools.
 * Provides transcript data, user info, search, and CRM sync operations.
 *
 * @module fireflies-mcp-server
 * @version 1.0.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { registerTranscriptTools } from './src/tools/transcripts.js';
import { registerUserTools } from './src/tools/users.js';
import { registerSearchTools } from './src/tools/search.js';
import { registerSyncTools } from './src/tools/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Lazy-load FirefliesAPIClient (CJS module)
let _client = null;
function getClient() {
  if (!_client) {
    const libPath = resolve(__dirname, '..', '..', 'lib');
    const { FirefliesAPIClient } = require(resolve(libPath, 'fireflies-api-client.js'));
    _client = new FirefliesAPIClient({
      verbose: process.env.FIREFLIES_VERBOSE === '1' || process.env.FIREFLIES_VERBOSE === 'true'
    });
  }
  return _client;
}

async function main() {
  const server = new McpServer({ name: 'fireflies-mcp', version: '1.0.0' });

  // Register all tool modules
  registerTranscriptTools(server, getClient);
  registerUserTools(server, getClient);
  registerSearchTools(server, getClient);
  registerSyncTools(server, getClient);

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[fireflies-mcp] Server started on stdio');
}

main().catch(err => {
  console.error(`[fireflies-mcp] Fatal: ${err.message}`);
  process.exit(1);
});
