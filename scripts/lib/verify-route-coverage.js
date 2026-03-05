#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, collectInventory } = require('./plugin-doc-inventory');

const CLAUDE_PATH = path.join(REPO_ROOT, 'CLAUDE.md');
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'route-coverage-baseline.json');

const RULES = {
  MANDATORY_AGENT_MISSING_ROUTE: 'mandatory-agent-missing-route',
  MANDATORY_AGENT_NOT_IN_MANDATORY_SECTION: 'mandatory-agent-not-in-mandatory-section'
};

function parseArgs(argv) {
  return {
    updateBaseline: argv.includes('--update-baseline')
  };
}

function extractSection(content, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`### ${escaped}[\\s\\S]*?(?=\\n### |\\n## |$)`);
  const match = content.match(regex);
  return match ? match[0] : '';
}

function extractRouteTargets(sectionContent) {
  const targets = [];
  const lines = sectionContent.split('\n');

  for (const line of lines) {
    const match = line.match(/\|\s*[^|]+\s*\|\s*`([^`]+:[^`]+)`\s*\|/);
    if (!match) continue;
    targets.push(match[1].trim());
  }

  return targets;
}

function mandatoryRouteTargets(inventory) {
  const targets = [];
  for (const plugin of inventory.plugins) {
    for (const agent of plugin.agents) {
      if (!/MUST BE USED/i.test(agent.description || '')) continue;
      targets.push({
        target: `${plugin.name}:${agent.name}`,
        sourcePath: agent.sourcePath
      });
    }
  }
  return targets.sort((a, b) => a.target.localeCompare(b.target));
}

function signatureFor(violation) {
  return `${violation.rule}|${violation.target}`;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { entries: [], signatures: new Set() };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const entries = Array.isArray(parsed.violations) ? parsed.violations : [];
    const signatures = new Set(entries.map((entry) => entry.signature).filter(Boolean));
    return { entries, signatures };
  } catch (error) {
    throw new Error(`Failed to parse baseline at ${BASELINE_PATH}: ${error.message}`);
  }
}

function saveBaseline(violations) {
  const payload = {
    generatedAt: new Date().toISOString(),
    ruleSetVersion: '1.0.0',
    violations: violations.map((violation) => ({
      signature: signatureFor(violation),
      rule: violation.rule,
      target: violation.target,
      sourcePath: violation.sourcePath,
      message: violation.message
    }))
  };

  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function collectViolations(inventory, mandatoryRoutes, allRoutes, mandatorySectionRoutes) {
  const allRouteSet = new Set(allRoutes);
  const mandatorySectionSet = new Set(mandatorySectionRoutes);
  const violations = [];

  for (const route of mandatoryRoutes) {
    if (!allRouteSet.has(route.target)) {
      violations.push({
        rule: RULES.MANDATORY_AGENT_MISSING_ROUTE,
        target: route.target,
        sourcePath: route.sourcePath,
        message: `Mandatory agent is not routed in CLAUDE.md: ${route.target}`
      });
      continue;
    }

    if (!mandatorySectionSet.has(route.target)) {
      violations.push({
        rule: RULES.MANDATORY_AGENT_NOT_IN_MANDATORY_SECTION,
        target: route.target,
        sourcePath: route.sourcePath,
        message: `Mandatory agent is only routed outside "Mandatory Routing" section: ${route.target}`
      });
    }
  }

  return violations.sort((a, b) => {
    const byRule = a.rule.localeCompare(b.rule);
    if (byRule !== 0) return byRule;
    return a.target.localeCompare(b.target);
  });
}

function printViolations(title, violations) {
  if (violations.length === 0) return;

  console.log(`\n${title} (${violations.length})`);
  for (const violation of violations.slice(0, 40)) {
    console.log(`- [${violation.rule}] ${violation.target}`);
    if (violation.sourcePath) {
      console.log(`  source: ${violation.sourcePath}`);
    }
  }
  if (violations.length > 40) {
    console.log(`- ... ${violations.length - 40} more`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inventory = collectInventory();

  if (!fs.existsSync(CLAUDE_PATH)) {
    throw new Error(`CLAUDE.md not found: ${CLAUDE_PATH}`);
  }

  const claude = fs.readFileSync(CLAUDE_PATH, 'utf8');
  const mandatorySectionRoutes = extractRouteTargets(
    extractSection(claude, 'Mandatory Routing (MUST Use Task Tool)')
  );
  const recommendedRoutes = extractRouteTargets(extractSection(claude, 'Recommended Routing'));
  const allRoutes = [...mandatorySectionRoutes, ...recommendedRoutes];
  const mandatoryRoutes = mandatoryRouteTargets(inventory);

  const violations = collectViolations(
    inventory,
    mandatoryRoutes,
    allRoutes,
    mandatorySectionRoutes
  );

  if (options.updateBaseline) {
    saveBaseline(violations);
    console.log('Route Coverage Check');
    console.log('====================');
    console.log(`Baseline updated: ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    console.log(`Violations recorded: ${violations.length}`);
    process.exit(0);
  }

  const baseline = loadBaseline();
  const current = new Map(violations.map((violation) => [signatureFor(violation), violation]));

  const newViolations = [];
  for (const [signature, violation] of current.entries()) {
    if (!baseline.signatures.has(signature)) {
      newViolations.push(violation);
    }
  }

  const resolvedViolations = [];
  for (const old of baseline.entries) {
    if (!current.has(old.signature)) {
      resolvedViolations.push(old);
    }
  }

  console.log('Route Coverage Check');
  console.log('====================');
  console.log(`Mandatory agents: ${mandatoryRoutes.length}`);
  console.log(`Current violations: ${violations.length}`);
  console.log(`Baseline violations: ${baseline.entries.length}`);
  console.log(`New violations: ${newViolations.length}`);
  console.log(`Resolved since baseline: ${resolvedViolations.length}`);

  printViolations('New violations', newViolations);

  if (newViolations.length > 0) {
    console.error('\nRoute coverage gate failed due to net-new violations.');
    console.error('If intentional, update baseline with:');
    console.error('  node scripts/lib/verify-route-coverage.js --update-baseline');
    process.exit(1);
  }

  console.log('\nRoute coverage gate passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    process.exit(2);
  }
}
