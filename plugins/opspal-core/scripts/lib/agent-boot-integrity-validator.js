#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadRoutingIndex,
  normalizeStringArray,
  parseFrontmatter,
  resolveAgentFilePath,
  resolvePluginRoot,
  resolvePluginsRoot
} = require('./agent-tool-registry');
const { RoutingIndexBuilder } = require('./routing-index-builder');

const ASSET_FRONTMATTER_REQUIREMENTS = {
  agent: ['name', 'description', 'tools'],
  command: ['description'],
  skill: ['name', 'description'],
  context: []
};

function createIssue({
  code,
  agentId = '',
  assetType = '',
  assetPath = '',
  field = '',
  sourceOfTruth = '',
  checkedSources = [],
  message = '',
  repairAction = '',
  details = {}
}) {
  return {
    code,
    severity: 'error',
    agentId: String(agentId || '').trim() || null,
    assetType: assetType || null,
    assetPath: assetPath || null,
    field: field || null,
    sourceOfTruth: sourceOfTruth || null,
    checkedSources: checkedSources.filter(Boolean),
    repairAction: repairAction || null,
    message,
    details
  };
}

function normalizeComparableArray(value) {
  return Array.from(new Set(normalizeStringArray(value))).sort((left, right) => left.localeCompare(right));
}

function normalizeComparableScalar(value) {
  return String(value || '').trim();
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function fileHasClosedFrontmatter(content = '') {
  return /^---\n[\s\S]*?\n---\s*\n?/.test(content);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getLaunchTextField(payload = {}) {
  const candidates = [
    ['prompt', payload.prompt],
    ['description', payload.description],
    ['message', payload.message],
    ['task', payload.task],
    ['user_message', payload.user_message],
    ['userPrompt', payload.userPrompt],
    ['tool_input.prompt', payload.tool_input?.prompt],
    ['tool_input.description', payload.tool_input?.description],
    ['tool_input.message', payload.tool_input?.message]
  ];

  for (const [field, value] of candidates) {
    if (value !== undefined) {
      return { field, value };
    }
  }

  return { field: 'prompt', value: undefined };
}

function validateLaunchPayload(agentId, payload) {
  const issues = [];

  if (!String(agentId || '').trim()) {
    issues.push(createIssue({
      code: 'agent_boot_missing_agent_id',
      field: 'subagent_type',
      sourceOfTruth: 'launch-payload',
      checkedSources: ['launch-payload'],
      message: 'Agent launch payload is missing subagent_type.',
      repairAction: 'Populate tool_input.subagent_type with the fully-qualified agent id before invoking Agent(...).'
    }));
    return issues;
  }

  if (!isPlainObject(payload)) {
    issues.push(createIssue({
      code: 'agent_boot_invalid_payload_object',
      agentId,
      field: 'tool_input',
      sourceOfTruth: 'launch-payload',
      checkedSources: ['launch-payload'],
      message: `Launch payload for ${agentId} must be a JSON object before agent boot.`,
      repairAction: 'Pass a JSON object as tool_input when invoking Agent(...).',
      details: { receivedType: typeof payload }
    }));
    return issues;
  }

  const declaredAgent = String(
    payload.subagent_type ||
    payload.agent_type ||
    payload.agentType ||
    ''
  ).trim();
  if (declaredAgent && declaredAgent !== agentId) {
    issues.push(createIssue({
      code: 'agent_boot_payload_agent_mismatch',
      agentId,
      field: 'subagent_type',
      sourceOfTruth: 'launch-payload',
      checkedSources: ['launch-payload'],
      message: `Launch payload agent id mismatch for ${agentId}: payload declares ${declaredAgent}.`,
      repairAction: `Keep tool_input.subagent_type aligned with ${agentId} before launch.`,
      details: { declaredAgent }
    }));
  }

  const launchField = getLaunchTextField(payload);
  if (launchField.value === undefined || launchField.value === null) {
    issues.push(createIssue({
      code: 'agent_boot_missing_launch_text',
      agentId,
      field: launchField.field,
      sourceOfTruth: 'launch-payload',
      checkedSources: ['launch-payload'],
      message: `Launch payload for ${agentId} is missing prompt text required for agent initialization.`,
      repairAction: 'Populate tool_input.prompt, description, or message before invoking Agent(...).'
    }));
    return issues;
  }

  if (typeof launchField.value !== 'string') {
    issues.push(createIssue({
      code: 'agent_boot_invalid_launch_text_type',
      agentId,
      field: launchField.field,
      sourceOfTruth: 'launch-payload',
      checkedSources: ['launch-payload'],
      message: `Launch payload field ${launchField.field} for ${agentId} must be a string.`,
      repairAction: `Serialize ${launchField.field} to a non-empty string before launch.`,
      details: { receivedType: typeof launchField.value }
    }));
    return issues;
  }

  if (!launchField.value.trim()) {
    issues.push(createIssue({
      code: 'agent_boot_empty_launch_text',
      agentId,
      field: launchField.field,
      sourceOfTruth: 'launch-payload',
      checkedSources: ['launch-payload'],
      message: `Launch payload field ${launchField.field} for ${agentId} is empty.`,
      repairAction: `Provide a non-empty ${launchField.field} before launching the agent.`
    }));
  }

  return issues;
}

function resolveOwningPluginRoot(filePath) {
  let current = path.dirname(path.resolve(filePath));

  while (true) {
    const baseName = path.basename(current);
    if (['agents', 'commands', 'skills', 'contexts', 'hooks', 'docs', 'templates', 'scripts'].includes(baseName)) {
      return path.dirname(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(filePath, '..', '..');
    }

    current = parent;
  }
}

function extractImports(body = '') {
  const imports = [];
  const pattern = /^@import\s+(.+)$/gm;
  let match = null;

  while ((match = pattern.exec(body)) !== null) {
    const importRef = String(match[1] || '').trim();
    if (importRef) {
      imports.push(importRef);
    }
  }

  return imports;
}

function resolveImportPath(importRef, assetPath) {
  const assetDir = path.dirname(path.resolve(assetPath));
  const pluginRoot = resolveOwningPluginRoot(assetPath);
  const pluginsRoot = path.dirname(pluginRoot);
  const normalizedRef = String(importRef || '').trim();

  if (!normalizedRef) {
    return '';
  }

  const candidates = /^\.{1,2}[\\/]/.test(normalizedRef)
    ? [path.resolve(assetDir, normalizedRef)]
    : (normalizedRef.startsWith('opspal-')
        ? [
            path.resolve(pluginsRoot, normalizedRef),
            path.resolve(pluginRoot, normalizedRef),
            path.resolve(assetDir, normalizedRef)
          ]
        : [
            path.resolve(pluginRoot, normalizedRef),
            path.resolve(pluginsRoot, normalizedRef),
            path.resolve(assetDir, normalizedRef)
          ]);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] || '';
}

function readPromptAsset(filePath) {
  const content = readUtf8(filePath);
  const hasFrontmatter = content.startsWith('---\n');
  const frontmatterClosed = !hasFrontmatter || fileHasClosedFrontmatter(content);
  const parsed = parseFrontmatter(content);

  return {
    content,
    hasFrontmatter,
    frontmatterClosed,
    frontmatter: parsed.data || {},
    body: typeof parsed.body === 'string' ? parsed.body : '',
    imports: extractImports(parsed.body || '')
  };
}

function hasRequiredField(frontmatter, fieldName) {
  if (fieldName === 'tools') {
    return normalizeStringArray(frontmatter.tools).length > 0;
  }

  return Boolean(String(frontmatter[fieldName] || '').trim());
}

function validatePromptAsset(filePath, assetType, options = {}) {
  const issues = [];
  const agentId = options.agentId || '';
  const checkedSources = [filePath];

  if (!fs.existsSync(filePath)) {
    issues.push(createIssue({
      code: 'agent_boot_missing_asset',
      agentId,
      assetType,
      assetPath: filePath,
      sourceOfTruth: assetType,
      checkedSources,
      message: `Required ${assetType} asset is missing: ${filePath}`,
      repairAction: `Restore ${filePath} before launching ${agentId || 'the agent'}.`
    }));
    return issues;
  }

  const parsed = readPromptAsset(filePath);
  const requiredFields = ASSET_FRONTMATTER_REQUIREMENTS[assetType] || [];

  if (!parsed.hasFrontmatter && requiredFields.length > 0) {
    issues.push(createIssue({
      code: 'agent_boot_missing_frontmatter',
      agentId,
      assetType,
      assetPath: filePath,
      sourceOfTruth: assetType,
      checkedSources,
      message: `${assetType} asset is missing YAML frontmatter: ${filePath}`,
      repairAction: `Add YAML frontmatter with the required fields to ${filePath}.`
    }));
    return issues;
  }

  if (parsed.hasFrontmatter && !parsed.frontmatterClosed) {
    issues.push(createIssue({
      code: 'agent_boot_invalid_frontmatter',
      agentId,
      assetType,
      assetPath: filePath,
      sourceOfTruth: assetType,
      checkedSources,
      message: `${assetType} asset has unclosed or malformed YAML frontmatter: ${filePath}`,
      repairAction: `Close the frontmatter block in ${filePath} with a terminating --- line.`
    }));
    return issues;
  }

  for (const fieldName of requiredFields) {
    if (!hasRequiredField(parsed.frontmatter, fieldName)) {
      issues.push(createIssue({
        code: 'agent_boot_missing_metadata_field',
        agentId,
        assetType,
        assetPath: filePath,
        field: fieldName,
        sourceOfTruth: assetType,
        checkedSources,
        message: `${assetType} asset ${filePath} is missing required field ${fieldName}.`,
        repairAction: `Populate ${fieldName} in ${filePath} before launch.`
      }));
    }
  }

  if (!String(parsed.body || '').trim()) {
    issues.push(createIssue({
      code: 'agent_boot_empty_prompt_content',
      agentId,
      assetType,
      assetPath: filePath,
      field: 'body',
      sourceOfTruth: assetType,
      checkedSources,
      message: `${assetType} asset ${filePath} has no prompt body content.`,
      repairAction: `Restore non-empty markdown content in ${filePath}; the host runtime assumes prompt content is present during boot.`
    }));
  }

  for (const importRef of parsed.imports) {
    const resolvedImport = resolveImportPath(importRef, filePath);
    const importCheckedSources = [filePath, resolvedImport].filter(Boolean);

    if (!resolvedImport || !fs.existsSync(resolvedImport)) {
      issues.push(createIssue({
        code: 'agent_boot_missing_import',
        agentId,
        assetType,
        assetPath: filePath,
        field: importRef,
        sourceOfTruth: 'agent-import',
        checkedSources: importCheckedSources,
        message: `${assetType} asset ${filePath} imports missing prompt fragment ${importRef}.`,
        repairAction: `Restore ${importRef} in the owning plugin or remove the @import from ${filePath}.`
      }));
      continue;
    }

    if (fs.statSync(resolvedImport).size === 0) {
      issues.push(createIssue({
        code: 'agent_boot_empty_import_asset',
        agentId,
        assetType,
        assetPath: resolvedImport,
        field: importRef,
        sourceOfTruth: 'agent-import',
        checkedSources: importCheckedSources,
        message: `${assetType} asset ${filePath} imports empty prompt fragment ${importRef}.`,
        repairAction: `Populate ${resolvedImport} with non-empty content or remove the import from ${filePath}.`
      }));
    }
  }

  return issues;
}

function buildExpectedRoutingIndexEntry(agentId, filePath, explicitPluginRoot = '') {
  const builder = new RoutingIndexBuilder();
  const pluginsRoot = resolvePluginsRoot(explicitPluginRoot);
  const pluginName = String(agentId || '').split(':', 1)[0] || path.basename(resolveOwningPluginRoot(filePath));
  const expected = builder.parseAgent(filePath, pluginName, pluginsRoot);

  if (!expected) {
    return null;
  }

  return {
    ...expected,
    shortName: expected.name,
    fullName: agentId
  };
}

function compareRoutingField(left, right, fieldName) {
  if (['tools', 'triggerKeywords', 'capabilities'].includes(fieldName)) {
    return JSON.stringify(normalizeComparableArray(left)) === JSON.stringify(normalizeComparableArray(right));
  }

  return normalizeComparableScalar(left) === normalizeComparableScalar(right);
}

function validateRoutingIndexEntry(agentId, filePath, explicitPluginRoot = '') {
  const issues = [];
  const routingIndex = loadRoutingIndex(explicitPluginRoot);
  const routingIndexPath = path.join(resolvePluginRoot(explicitPluginRoot), 'routing-index.json');
  const checkedSources = [filePath, routingIndexPath];

  if (!routingIndex) {
    issues.push(createIssue({
      code: 'agent_boot_missing_routing_index',
      agentId,
      assetType: 'routing-index',
      assetPath: routingIndexPath,
      sourceOfTruth: 'routing-index.json',
      checkedSources,
      message: `routing-index.json could not be loaded while validating ${agentId}.`,
      repairAction: `Regenerate ${routingIndexPath} before launching ${agentId}.`
    }));
    return issues;
  }

  const entry = routingIndex.agentsByFull?.[agentId];
  if (!entry) {
    issues.push(createIssue({
      code: 'agent_boot_missing_routing_index_entry',
      agentId,
      assetType: 'routing-index',
      assetPath: routingIndexPath,
      sourceOfTruth: 'routing-index.json',
      checkedSources,
      message: `routing-index.json is missing the ${agentId} entry required for launch validation.`,
      repairAction: `Regenerate ${routingIndexPath} so ${agentId} is indexed before launch.`
    }));
    return issues;
  }

  const expected = buildExpectedRoutingIndexEntry(agentId, filePath, explicitPluginRoot);
  if (!expected) {
    issues.push(createIssue({
      code: 'agent_boot_expected_index_generation_failed',
      agentId,
      assetType: 'routing-index',
      assetPath: routingIndexPath,
      sourceOfTruth: 'agent-markdown',
      checkedSources,
      message: `Expected routing metadata could not be derived from ${filePath}.`,
      repairAction: `Repair ${filePath} so routing metadata can be regenerated for ${agentId}.`
    }));
    return issues;
  }

  const fieldsToCheck = ['name', 'description', 'model', 'color', 'tools', 'triggerKeywords', 'capabilities', 'actorType', 'file', 'path'];
  fieldsToCheck.forEach((fieldName) => {
    if (!compareRoutingField(entry[fieldName], expected[fieldName], fieldName)) {
      issues.push(createIssue({
        code: 'agent_boot_routing_index_mismatch',
        agentId,
        assetType: 'routing-index',
        assetPath: routingIndexPath,
        field: fieldName,
        sourceOfTruth: 'routing-index.json',
        checkedSources,
        message: `routing-index.json field ${fieldName} for ${agentId} does not match the agent markdown source.`,
        repairAction: `Regenerate ${routingIndexPath} from the current agent markdown before launch.`,
        details: {
          expected: expected[fieldName] ?? null,
          actual: entry[fieldName] ?? null
        }
      }));
    }
  });

  return issues;
}

function validateAgentLaunch(options = {}) {
  const agentId = String(options.agentId || '').trim();
  const payload = options.payload;
  const explicitPluginRoot = options.explicitPluginRoot || '';
  const issues = [];

  issues.push(...validateLaunchPayload(agentId, payload));

  if (!agentId) {
    return { pass: false, issueCount: issues.length, issues };
  }

  const filePath = resolveAgentFilePath(agentId, explicitPluginRoot);
  if (!filePath) {
    issues.push(createIssue({
      code: 'agent_boot_missing_agent_markdown',
      agentId,
      assetType: 'agent',
      sourceOfTruth: 'agent-markdown',
      checkedSources: ['agent-markdown', path.join(resolvePluginRoot(explicitPluginRoot), 'routing-index.json')],
      message: `Agent markdown could not be resolved for ${agentId}.`,
      repairAction: `Restore ${agentId} in the plugin agents directory or repair the generated bundle before launch.`
    }));
    return { pass: false, issueCount: issues.length, issues };
  }

  issues.push(...validatePromptAsset(filePath, 'agent', { agentId }));
  issues.push(...validateRoutingIndexEntry(agentId, filePath, explicitPluginRoot));

  return {
    pass: issues.length === 0,
    issueCount: issues.length,
    issues
  };
}

function listMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => path.join(dirPath, entry));
}

function listSkillFiles(skillsDir) {
  if (!fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) {
    return [];
  }

  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, 'SKILL.md'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
}

function collectContextMappingIssues(pluginPath) {
  const issues = [];
  const contextsRoot = path.join(pluginPath, 'contexts');

  if (!fs.existsSync(contextsRoot) || !fs.statSync(contextsRoot).isDirectory()) {
    return issues;
  }

  const walk = (dirPath) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        return;
      }

      if (entry.name !== 'keyword-mapping.json') {
        return;
      }

      let mapping = null;
      try {
        mapping = JSON.parse(readUtf8(fullPath));
      } catch (error) {
        issues.push(createIssue({
          code: 'agent_boot_invalid_context_mapping',
          assetType: 'context',
          assetPath: fullPath,
          sourceOfTruth: 'keyword-mapping.json',
          checkedSources: [fullPath],
          message: `Context keyword mapping is not valid JSON: ${fullPath}`,
          repairAction: `Repair ${fullPath} so mapped context files can be validated.`,
          details: { error: error.message }
        }));
        return;
      }

      const contexts = Array.isArray(mapping.contexts)
        ? mapping.contexts
        : (mapping.contexts && typeof mapping.contexts === 'object'
            ? Object.values(mapping.contexts)
            : []);

      for (const context of contexts) {
        const contextFile = String(context.contextFile || '').trim();
        const contextName = String(context.contextName || contextFile || '').trim();
        if (!contextFile) {
          continue;
        }

        const resolvedPath = path.join(path.dirname(fullPath), contextFile);
        const checkedSources = [fullPath, resolvedPath];

        if (!fs.existsSync(resolvedPath)) {
          issues.push(createIssue({
            code: 'agent_boot_missing_mapped_context',
            assetType: 'context',
            assetPath: resolvedPath,
            field: contextName,
            sourceOfTruth: 'keyword-mapping.json',
            checkedSources,
            message: `Context mapping ${contextName} points to missing file ${contextFile}.`,
            repairAction: `Restore ${resolvedPath} or remove ${contextName} from ${fullPath}.`
          }));
          continue;
        }

        if (fs.statSync(resolvedPath).size === 0 || !readUtf8(resolvedPath).trim()) {
          issues.push(createIssue({
            code: 'agent_boot_empty_mapped_context',
            assetType: 'context',
            assetPath: resolvedPath,
            field: contextName,
            sourceOfTruth: 'keyword-mapping.json',
            checkedSources,
            message: `Context mapping ${contextName} points to empty prompt content in ${resolvedPath}.`,
            repairAction: `Populate ${resolvedPath} with non-empty content or remove the mapping from ${fullPath}.`
          }));
        }
      }
    });
  };

  walk(contextsRoot);
  return issues;
}

function auditPluginPromptAssets(pluginName, explicitPluginRoot = '', options = {}) {
  const issues = [];
  const pluginsRoot = resolvePluginsRoot(explicitPluginRoot);
  const pluginPath = path.join(pluginsRoot, pluginName);

  if (!fs.existsSync(pluginPath) || !fs.statSync(pluginPath).isDirectory()) {
    issues.push(createIssue({
      code: 'agent_boot_missing_plugin_root',
      assetType: 'plugin',
      assetPath: pluginPath,
      sourceOfTruth: 'plugin-root',
      checkedSources: [pluginPath],
      message: `Plugin directory is missing: ${pluginPath}`,
      repairAction: `Restore the ${pluginName} plugin directory before auditing boot assets.`
    }));
    return { pass: false, issueCount: issues.length, issues };
  }

  listMarkdownFiles(path.join(pluginPath, 'agents')).forEach((filePath) => {
    const agentId = `${pluginName}:${path.basename(filePath, '.md')}`;
    issues.push(...validatePromptAsset(filePath, 'agent', { agentId }));
  });

  listMarkdownFiles(path.join(pluginPath, 'commands')).forEach((filePath) => {
    issues.push(...validatePromptAsset(filePath, 'command'));
  });

  listSkillFiles(path.join(pluginPath, 'skills')).forEach((filePath) => {
    issues.push(...validatePromptAsset(filePath, 'skill'));
  });

  if (options.includeContexts !== false) {
    issues.push(...collectContextMappingIssues(pluginPath));
  }

  return {
    pass: issues.length === 0,
    issueCount: issues.length,
    issues
  };
}

function formatIssue(issue = {}) {
  const parts = [
    issue.code,
    issue.message
  ];

  if (issue.field) {
    parts.push(`field=${issue.field}`);
  }
  if (issue.sourceOfTruth) {
    parts.push(`sourceOfTruth=${issue.sourceOfTruth}`);
  }
  if (issue.assetPath) {
    parts.push(`asset=${issue.assetPath}`);
  }
  if (issue.repairAction) {
    parts.push(`repair=${issue.repairAction}`);
  }

  return parts.join(' | ');
}

function main() {
  const [command, target, explicitPluginRoot] = process.argv.slice(2);
  let report = { pass: true, issueCount: 0, issues: [] };

  if (command === 'launch-report') {
    let payload = {};
    const stdin = fs.readFileSync(0, 'utf8');

    if (stdin.trim()) {
      try {
        payload = JSON.parse(stdin);
      } catch (error) {
        report = {
          pass: false,
          issueCount: 1,
          issues: [
            createIssue({
              code: 'agent_boot_invalid_payload_json',
              agentId: target,
              field: 'tool_input',
              sourceOfTruth: 'launch-payload',
              checkedSources: ['launch-payload'],
              message: 'Launch payload is not valid JSON.',
              repairAction: 'Pass valid JSON to the agent boot integrity validator.',
              details: { error: error.message }
            })
          ]
        };
      }
    }

    if (report.pass) {
      report = validateAgentLaunch({
        agentId: target,
        payload,
        explicitPluginRoot
      });
    }
  } else if (command === 'audit-plugin') {
    report = auditPluginPromptAssets(target, explicitPluginRoot, { includeContexts: true });
  } else {
    process.stderr.write('Usage: agent-boot-integrity-validator.js <launch-report <agentId> [pluginRoot]|audit-plugin <pluginName> [pluginRoot]>\n');
    process.exit(2);
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.pass ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  auditPluginPromptAssets,
  collectContextMappingIssues,
  createIssue,
  formatIssue,
  validateAgentLaunch,
  validateLaunchPayload,
  validatePromptAsset,
  validateRoutingIndexEntry
};
