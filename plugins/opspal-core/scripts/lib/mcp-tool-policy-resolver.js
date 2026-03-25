#!/usr/bin/env node

'use strict';

const path = require('path');
const {
  DEFAULT_MCP_POLICY_CONFIG_PATH,
  classifyMCPTool,
  inferNamespace,
  loadMcpPolicyConfig
} = require('./classify-operation');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CONFIG_PATH = DEFAULT_MCP_POLICY_CONFIG_PATH || path.join(PROJECT_ROOT, 'config', 'mcp-tool-policies.json');

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  return loadMcpPolicyConfig(configPath);
}

function unknownClassification(toolName, config = {}) {
  const classification = classifyMCPTool(toolName, {}, config);
  return {
    tool: toolName,
    matched: false,
    policyId: null,
    namespace: inferNamespace(toolName),
    mutability: classification.mutability,
    pendingRouteAction: classification.pendingRouteAction,
    matchedPattern: null,
    notes: 'No explicit MCP tool policy matched.'
  };
}

function classifyTool(toolName, config = loadConfig()) {
  const classification = classifyMCPTool(toolName, {}, config);

  if (!classification.matched) {
    return unknownClassification(toolName, config);
  }

  return {
    tool: toolName,
    matched: true,
    policyId: classification.policyId,
    namespace: classification.namespace,
    mutability: classification.mutability,
    pendingRouteAction: classification.pendingRouteAction,
    matchedPattern: classification.matchedPattern,
    notes: classification.notes || ''
  };
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
