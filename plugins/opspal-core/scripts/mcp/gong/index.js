#!/usr/bin/env node

/**
 * Gong MCP Server
 *
 * Model Context Protocol server exposing Gong conversation intelligence tools.
 * Provides call data, transcripts, tracker info, sync operations, and risk analysis.
 *
 * @module gong-mcp-server
 * @version 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { registerCallsTools } from './src/tools/calls.js';
import { registerUsersTools } from './src/tools/users.js';
import { registerTrackersTools } from './src/tools/trackers.js';
import { registerSyncTools } from './src/tools/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Lazy-load GongAPIClient (CJS module)
let _client = null;
function getClient() {
  if (!_client) {
    const libPath = resolve(__dirname, '..', '..', 'lib');
    const { GongAPIClient } = require(resolve(libPath, 'gong-api-client.js'));
    _client = new GongAPIClient({
      verbose: process.env.GONG_VERBOSE === '1' || process.env.GONG_VERBOSE === 'true'
    });
  }
  return _client;
}

async function main() {
  const server = new Server(
    { name: 'gong', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register all tool modules
  registerCallsTools(server, getClient);
  registerUsersTools(server, getClient);
  registerTrackersTools(server, getClient);
  registerSyncTools(server, getClient);

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[gong-mcp] Server started on stdio');
}

main().catch(err => {
  console.error(`[gong-mcp] Fatal: ${err.message}`);
  process.exit(1);
});
