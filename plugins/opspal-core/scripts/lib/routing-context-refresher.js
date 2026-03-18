#!/usr/bin/env node
/**
 * routing-context-refresher.js - Generate condensed routing text for post-compaction injection
 *
 * Reads routing-index.json and generates a compact routing reminder (~300-400 tokens)
 * for injection into conversation context after compaction or periodically.
 *
 * Usage:
 *   node routing-context-refresher.js [--format=compact|full] [--routing-index=<path>] [--output=<path>]
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const format = (args.find(a => a.startsWith('--format=')) || '--format=compact').split('=')[1];
const outputPath = (args.find(a => a.startsWith('--output=')) || '').split('=')[1] || '';

// Find routing index
function findRoutingIndex() {
  const customPath = (args.find(a => a.startsWith('--routing-index=')) || '').split('=')[1];
  if (customPath && fs.existsSync(customPath)) return customPath;

  const candidates = [
    path.join(__dirname, '..', '..', 'routing-index.json'),
    path.join(process.cwd(), 'plugins', 'opspal-core', 'routing-index.json'),
    path.join(process.cwd(), '.claude-plugins', 'opspal-core', 'routing-index.json'),
  ];

  // Also check marketplace paths
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    candidates.push(path.join(home, '.claude', 'plugins', 'marketplaces', 'revpal-internal-plugins', 'plugins', 'opspal-core', 'routing-index.json'));
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Extract mandatory routes from the generated CLAUDE.md routing table
function extractMandatoryRoutes(index) {
  const routes = [];
  const agents = index.agents || {};

  for (const [shortName, agent] of Object.entries(agents)) {
    if (!agent.triggerKeywords || agent.triggerKeywords.length === 0) continue;

    // Detect mandatory from description
    const desc = (agent.description || '').toLowerCase();
    const isMandatory = desc.includes('must be used') ||
      desc.includes('must use') ||
      desc.includes('mandatory') ||
      desc.includes('blocked operation');

    if (!isMandatory) continue;

    // Calculate a priority score
    let priority = 50; // base mandatory score
    if (desc.includes('orchestrat')) priority += 10;
    if (desc.includes('assessment') || desc.includes('audit')) priority += 15;
    if (agent.triggerKeywords.length > 3) priority += 5;

    routes.push({
      keywords: agent.triggerKeywords.slice(0, 4).join(', '),
      agent: agent.fullName || `${agent.plugin}:${shortName}`,
      priority
    });
  }

  // Sort by priority descending, take top 12
  return routes.sort((a, b) => b.priority - a.priority).slice(0, 12);
}

// Generate compact routing text
function generateCompact(routes) {
  if (routes.length === 0) return generateFallback();

  let text = `## CRITICAL: Agent Routing Rules

**STOP** before responding. Check this table first.

| If user mentions... | Use this agent | Invoke with |
|---------------------|---------------|-------------|
`;

  for (const route of routes) {
    text += `| ${route.keywords} | \`${route.agent}\` | \`Task(subagent_type='${route.agent}', prompt=<request>)\` |\n`;
  }

  text += `
**Self-check**: (1) Does this match a keyword above? (2) Is this multi-step? (3) Is this an assessment/audit?
If YES to any → use Task(). If unsure → use Task(). Override: \`[DIRECT]\` to skip.`;

  return text;
}

// Generate full routing text (includes recommended routes too)
function generateFull(index) {
  const mandatoryRoutes = extractMandatoryRoutes(index);
  let text = generateCompact(mandatoryRoutes);

  // Add recommended routes
  const agents = index.agents || {};
  const recommended = [];

  for (const [shortName, agent] of Object.entries(agents)) {
    if (!agent.triggerKeywords || agent.triggerKeywords.length === 0) continue;
    const desc = (agent.description || '').toLowerCase();
    const isMandatory = desc.includes('must be used') || desc.includes('mandatory');
    if (isMandatory) continue; // skip mandatory (already shown)

    const isRecommended = desc.includes('proactively') || desc.includes('recommended');
    if (!isRecommended) continue;

    recommended.push({
      keywords: agent.triggerKeywords.slice(0, 4).join(', '),
      agent: agent.fullName || `${agent.plugin}:${shortName}`
    });
  }

  if (recommended.length > 0) {
    text += `\n\n### Recommended Routing\n\n| Keywords | Agent |\n|----------|-------|\n`;
    for (const route of recommended.slice(0, 10)) {
      text += `| ${route.keywords} | \`${route.agent}\` |\n`;
    }
  }

  return text;
}

// Hardcoded fallback if no routing index found
function generateFallback() {
  return `## CRITICAL: Agent Routing Rules

**STOP** before responding. For revops/audit use \`opspal-salesforce:sfdc-revops-auditor\`, for cpq/quote use \`opspal-salesforce:sfdc-cpq-assessor\`, for automation audit use \`opspal-salesforce:sfdc-automation-auditor\`, for hubspot assessment use \`opspal-hubspot:hubspot-assessment-analyzer\`, for marketo use \`opspal-marketo:marketo-orchestrator\`. Always invoke via Task(subagent_type='<agent>', prompt=<request>). If unsure → use Task().`;
}

// Main
function main() {
  const indexPath = findRoutingIndex();

  if (!indexPath) {
    const text = generateFallback();
    if (outputPath) {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outputPath, text, 'utf8');
    }
    process.stdout.write(text);
    return;
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`Warning: Failed to parse routing index: ${err.message}\n`);
    const text = generateFallback();
    if (outputPath) fs.writeFileSync(outputPath, text, 'utf8');
    process.stdout.write(text);
    return;
  }

  let text;
  if (format === 'full') {
    text = generateFull(index);
  } else {
    const routes = extractMandatoryRoutes(index);
    text = generateCompact(routes);
  }

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, text, 'utf8');
  }

  process.stdout.write(text);
}

main();
