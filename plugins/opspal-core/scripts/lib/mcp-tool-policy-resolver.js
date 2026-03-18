#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, 'config', 'mcp-tool-policies.json');

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function unknownClassification(toolName, config = {}) {
  const defaults = config.defaults || {};
  return {
    tool: toolName,
    matched: false,
    policyId: null,
    namespace: inferNamespace(toolName),
    mutability: defaults.unknownMutability || 'unknown',
    pendingRouteAction: defaults.unknownPendingRouteAction || 'deny',
    matchedPattern: null,
    notes: 'No explicit MCP tool policy matched.'
  };
}

function inferNamespace(toolName) {
  if (!toolName) {
    return 'unknown';
  }

  const namespaced = toolName.match(/^mcp__([^_]+)__.+$/);
  if (namespaced) {
    return namespaced[1];
  }

  const legacy = toolName.match(/^mcp_([^_]+)(?:_|$)/);
  if (legacy) {
    return legacy[1];
  }

  return 'unknown';
}

function classifyTool(toolName, config = loadConfig()) {
  for (const policy of config.policies || []) {
    for (const pattern of policy.patterns || []) {
      const regex = new RegExp(pattern);
      if (!regex.test(toolName)) {
        continue;
      }

      return {
        tool: toolName,
        matched: true,
        policyId: policy.id,
        namespace: policy.namespace || inferNamespace(toolName),
        mutability: policy.mutability || 'unknown',
        pendingRouteAction: policy.pendingRouteAction || 'deny',
        matchedPattern: pattern,
        notes: policy.notes || ''
      };
    }
  }

  return unknownClassification(toolName, config);
}

function main() {
  const [command, toolName] = process.argv.slice(2);

  if (command !== 'classify' || !toolName) {
    console.error('Usage: mcp-tool-policy-resolver.js classify <tool-name>');
    process.exit(1);
  }

  const configPath = process.env.MCP_TOOL_POLICY_CONFIG || DEFAULT_CONFIG_PATH;
  const config = loadConfig(configPath);
  console.log(JSON.stringify(classifyTool(toolName, config)));
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  classifyTool,
  inferNamespace,
  loadConfig,
  unknownClassification
};
