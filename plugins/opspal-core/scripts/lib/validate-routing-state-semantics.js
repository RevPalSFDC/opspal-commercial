#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const SCAN_ROOTS = [
  path.join(PLUGIN_ROOT, 'hooks'),
  path.join(PLUGIN_ROOT, 'scripts'),
  path.join(PLUGIN_ROOT, 'test', 'hooks')
];
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'output',
  'reports',
  '.cache',
  'temp',
  'backups'
]);
const EXPLICIT_ROUTING_MARKERS = [
  'route_kind',
  'guidance_action',
  'required_agent',
  'requires_specialist',
  'prompt_guidance_only',
  'prompt_blocked',
  'execution_block_until_cleared',
  'route_pending_clearance',
  'route_cleared',
  'clearance_status',
  'routing_confidence',
  'auto_delegation',
  'routeKind',
  'guidanceAction',
  'requiredAgent',
  'requiresSpecialist',
  'promptGuidanceOnly',
  'promptBlocked',
  'executionBlockUntilCleared',
  'routePendingClearance',
  'routeCleared',
  'clearanceStatus',
  'routingConfidence',
  'autoDelegation'
];
const ALLOWLIST = new Set([
  'hooks/user-prompt-router.sh',
  'scripts/lib/canonical-routing-registry.js',
  'scripts/lib/validate-routing-state-semantics.js',
  'scripts/lib/routing-semantics.js',
  'scripts/lib/routing-state-manager.js',
  'test/hooks/unit/routing-state-manager.test.js',
  'test/hooks/unit/validate-routing-state-semantics.test.js'
]);
const LEGACY_ACTION_VALUE_REGEX = /\b(BLOCKED|MANDATORY_BLOCKED|MANDATORY_ALERT|INTAKE_REQUIRED|RECOMMENDED|AVAILABLE|ALLOWED|DIRECT_OK|DEPLOYMENT_HANDOFF|ALERT_INVALID_AGENT)\b/;

function normalizeRelativePath(filePath) {
  return path.relative(PLUGIN_ROOT, filePath).split(path.sep).join('/');
}

function isCommentLine(line) {
  const trimmed = String(line || '').trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/')
  );
}

function shouldScanFile(relativePath, content) {
  if (ALLOWLIST.has(relativePath)) {
    return false;
  }

  const lower = relativePath.toLowerCase();
  if (!lower.endsWith('.js') && !lower.endsWith('.sh')) {
    return false;
  }

  if (
    /(^|\/)(unified-router|pre-task-agent-validator|pre-tool-use-contract-validation|pre-deploy-agent-context-check|routing-health-check)\.sh$/.test(lower) ||
    /(^|\/)(mcp-tool-policy-routing|pre-deploy-agent-context-check|pre-tool-use-contract-validation|pre-task-agent-validator|unified-router|validate-routing-(integrity|state-semantics)|routing-state-manager)\.test\.js$/.test(lower)
  ) {
    return true;
  }

  if (
    lower === 'scripts/lib/compliance-tracker.js' ||
    lower === 'scripts/lib/routing-logger.js' ||
    lower === 'scripts/lib/routing-learner.js' ||
    lower === 'scripts/lib/routing-metrics.js' ||
    lower === 'scripts/lib/routing-metrics-tracker.js'
  ) {
    return true;
  }

  if (
    lower.includes('/test/hooks/') &&
    /(routing|pre-task-agent-validator|pre-tool-use-contract-validation|pre-deploy-agent-context-check|mcp-tool-policy-routing|validate-routing-)/.test(lower)
  ) {
    return true;
  }

  return false;
}

function findLegacyRoutingFieldUsages(content, relativePath) {
  if (!shouldScanFile(relativePath, content)) {
    return [];
  }

  const violations = [];
  const lines = String(content || '').split('\n');

  lines.forEach((line, index) => {
    if (isCommentLine(line)) {
      return;
    }

    const lineNumber = index + 1;
    const excerpt = line.trim();
    const add = (code, message) => {
      violations.push({
        code,
        message,
        file: relativePath,
        line: lineNumber,
        excerpt
      });
    };

    if (/\brecommended_agent\b|\brecommendedAgent\b/.test(line)) {
      add('legacy_recommended_agent', 'Use required_agent or suggestedAgent instead of recommended_agent.');
    }

    if (/\broutingActionType\b|\brouting_action_type\b/.test(line)) {
      add('legacy_routing_action_type', 'Use routeKind and guidanceAction instead of routingActionType.');
    }

    if ((/\.\s*blocked\b/.test(line) || /\bblocked\s*:\s*(true|false|null|["'{[])/.test(line))) {
      add('legacy_blocked_field', 'Use prompt_blocked or execution_block_until_cleared instead of blocked.');
    }

    if ((/\.\s*action\b/.test(line) || /\baction\s*:/.test(line)) && LEGACY_ACTION_VALUE_REGEX.test(line)) {
      add('legacy_action_field', 'Use explicit route_kind and guidance_action values instead of legacy action tokens.');
    }

    if (
      (/\.\s*status\b/.test(line) || /\bstatus\s*:/.test(line)) &&
      /(pending(?:_clearance)?|cleared|bypassed|state\.status|clearanceStatus|clearance_status)/.test(line)
    ) {
      add('legacy_status_alias', 'Use clearance_status instead of the legacy status alias for routing state.');
    }

    if (
      !/executionBlockUntilCleared|execution_block_until_cleared/.test(line) &&
      /(requiresSpecialist|requires_specialist)/.test(line) &&
      /(promptGuidanceOnly|prompt_guidance_only)/.test(line) &&
      /!|false/.test(line)
    ) {
      add('execution_gate_inference', 'Do not infer execution gating from requiresSpecialist and promptGuidanceOnly.');
    }
  });

  return violations;
}

function walkFiles(rootDir, files = []) {
  if (!fs.existsSync(rootDir)) {
    return files;
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      walkFiles(path.join(rootDir, entry.name), files);
      continue;
    }

    files.push(path.join(rootDir, entry.name));
  }

  return files;
}

function collectRoutingSemanticsViolations(rootDir = PLUGIN_ROOT) {
  const files = [];

  for (const scanRoot of SCAN_ROOTS) {
    if (!scanRoot.startsWith(rootDir)) {
      continue;
    }
    walkFiles(scanRoot, files);
  }

  const violations = [];
  for (const filePath of files) {
    const relativePath = normalizeRelativePath(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    violations.push(...findLegacyRoutingFieldUsages(content, relativePath));
  }

  return violations;
}

function main() {
  const jsonOutput = process.argv.includes('--json');
  const violations = collectRoutingSemanticsViolations();
  const report = {
    pass: violations.length === 0,
    violationCount: violations.length,
    violations
  };

  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.pass) {
    console.log('Routing state semantics validation passed');
  } else {
    console.log(`Routing state semantics validation failed (${report.violationCount})`);
    for (const violation of violations) {
      console.log(`- ${violation.code}: ${violation.file}:${violation.line} ${violation.message}`);
    }
  }

  process.exit(report.pass ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOWLIST,
  EXPLICIT_ROUTING_MARKERS,
  PLUGIN_ROOT,
  collectRoutingSemanticsViolations,
  findLegacyRoutingFieldUsages
};
