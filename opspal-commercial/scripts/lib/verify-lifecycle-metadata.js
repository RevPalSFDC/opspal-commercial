#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const { REPO_ROOT, collectInventory } = require('./plugin-doc-inventory');

const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'lifecycle-metadata-baseline.json');
const DEFAULT_WARN_DAYS = 90;
const DEFAULT_FAIL_DAYS = 120;

const RULES = {
  PLUGIN_MISSING_STATUS: 'plugin-missing-status',
  PLUGIN_INVALID_STATUS: 'plugin-invalid-status',
  PLUGIN_MISSING_OWNER: 'plugin-missing-owner',
  PLUGIN_MISSING_STABILITY: 'plugin-missing-stability',
  PLUGIN_MISSING_LAST_REVIEWED: 'plugin-missing-last-reviewed',
  PLUGIN_LAST_REVIEWED_INVALID: 'plugin-last-reviewed-invalid',
  PLUGIN_LAST_REVIEWED_EXPIRED: 'plugin-last-reviewed-expired',
  DEPRECATED_PLUGIN_MISSING_REPLACED_BY: 'deprecated-plugin-missing-replaced-by',
  DEPRECATED_PLUGIN_MISSING_DATE: 'deprecated-plugin-missing-deprecation-date',
  AGENT_MISSING_INTENT: 'agent-missing-intent',
  AGENT_MISSING_FAILURE_MODES: 'agent-missing-failure-modes',
  AGENT_MISSING_DEPENDENCIES: 'agent-missing-dependencies',
  COMMAND_MISSING_INTENT: 'command-missing-intent',
  COMMAND_MISSING_FAILURE_MODES: 'command-missing-failure-modes',
  COMMAND_MISSING_DEPENDENCIES: 'command-missing-dependencies'
};

function parseArgs(argv) {
  return {
    updateBaseline: argv.includes('--update-baseline')
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function hasValue(value) {
  if (Array.isArray(value)) {
    return value.some((item) => hasValue(item));
  }
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAnyField(frontmatter, keys) {
  if (!frontmatter || typeof frontmatter !== 'object') return false;
  return keys.some((key) => hasValue(frontmatter[key]));
}

function daysSince(dateString, now) {
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const diffMs = now.getTime() - parsed.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function addViolation(list, rule, file, message) {
  list.push({
    rule,
    file,
    message
  });
}

function signatureFor(violation) {
  return `${violation.rule}|${violation.file}`;
}

function collectViolations(inventory, warnDays, failDays) {
  const now = new Date();
  const violations = [];
  const validStatuses = new Set(['active', 'experimental', 'deprecated']);

  for (const plugin of inventory.plugins) {
    const metadataPath = plugin.lifecyclePath || plugin.manifestPath;
    const status = (plugin.manifestStatus || '').toLowerCase();

    if (!hasValue(status)) {
      addViolation(
        violations,
        RULES.PLUGIN_MISSING_STATUS,
        metadataPath,
        `[${plugin.name}] missing required lifecycle field: status`
      );
    } else if (!validStatuses.has(status)) {
      addViolation(
        violations,
        RULES.PLUGIN_INVALID_STATUS,
        metadataPath,
        `[${plugin.name}] invalid lifecycle status "${status}" (expected one of: active, experimental, deprecated)`
      );
    }

    if (!hasValue(plugin.owner)) {
      addViolation(
        violations,
        RULES.PLUGIN_MISSING_OWNER,
        metadataPath,
        `[${plugin.name}] missing required lifecycle field: owner`
      );
    }

    if (!hasValue(plugin.stability)) {
      addViolation(
        violations,
        RULES.PLUGIN_MISSING_STABILITY,
        metadataPath,
        `[${plugin.name}] missing required lifecycle field: stability`
      );
    }

    if (!hasValue(plugin.lastReviewedAt)) {
      addViolation(
        violations,
        RULES.PLUGIN_MISSING_LAST_REVIEWED,
        metadataPath,
        `[${plugin.name}] missing required lifecycle field: last_reviewed_at`
      );
    } else {
      const ageDays = daysSince(plugin.lastReviewedAt, now);

      if (ageDays == null) {
        addViolation(
          violations,
          RULES.PLUGIN_LAST_REVIEWED_INVALID,
          metadataPath,
          `[${plugin.name}] last_reviewed_at is not a valid date: ${plugin.lastReviewedAt}`
        );
      } else if (ageDays > failDays) {
        addViolation(
          violations,
          RULES.PLUGIN_LAST_REVIEWED_EXPIRED,
          metadataPath,
          `[${plugin.name}] last_reviewed_at is stale (${ageDays} days old; fail>${failDays}, warn>${warnDays})`
        );
      }
    }

    if (status === 'deprecated' && !hasValue(plugin.replacedBy)) {
      addViolation(
        violations,
        RULES.DEPRECATED_PLUGIN_MISSING_REPLACED_BY,
        metadataPath,
        `[${plugin.name}] deprecated plugin missing replaced_by`
      );
    }

    if (status === 'deprecated' && !hasValue(plugin.deprecationDate)) {
      addViolation(
        violations,
        RULES.DEPRECATED_PLUGIN_MISSING_DATE,
        metadataPath,
        `[${plugin.name}] deprecated plugin missing deprecation_date`
      );
    }

    for (const agent of plugin.agents) {
      if (!hasAnyField(agent.frontmatter, ['intent'])) {
        addViolation(
          violations,
          RULES.AGENT_MISSING_INTENT,
          agent.sourcePath,
          `[${plugin.name}] agent missing frontmatter field: intent`
        );
      }

      if (!hasAnyField(agent.frontmatter, ['failure_modes', 'failure-modes', 'failureModes'])) {
        addViolation(
          violations,
          RULES.AGENT_MISSING_FAILURE_MODES,
          agent.sourcePath,
          `[${plugin.name}] agent missing frontmatter field: failure_modes`
        );
      }

      if (!hasAnyField(agent.frontmatter, ['dependencies', 'depends_on', 'depends-on'])) {
        addViolation(
          violations,
          RULES.AGENT_MISSING_DEPENDENCIES,
          agent.sourcePath,
          `[${plugin.name}] agent missing frontmatter field: dependencies`
        );
      }
    }

    for (const command of plugin.commands) {
      if (!hasAnyField(command.frontmatter, ['intent'])) {
        addViolation(
          violations,
          RULES.COMMAND_MISSING_INTENT,
          command.sourcePath,
          `[${plugin.name}] command missing frontmatter field: intent`
        );
      }

      if (!hasAnyField(command.frontmatter, ['failure_modes', 'failure-modes', 'failureModes'])) {
        addViolation(
          violations,
          RULES.COMMAND_MISSING_FAILURE_MODES,
          command.sourcePath,
          `[${plugin.name}] command missing frontmatter field: failure_modes`
        );
      }

      if (!hasAnyField(command.frontmatter, ['dependencies', 'depends_on', 'depends-on'])) {
        addViolation(
          violations,
          RULES.COMMAND_MISSING_DEPENDENCIES,
          command.sourcePath,
          `[${plugin.name}] command missing frontmatter field: dependencies`
        );
      }
    }
  }

  return violations.sort((a, b) => {
    const byRule = a.rule.localeCompare(b.rule);
    if (byRule !== 0) return byRule;
    return a.file.localeCompare(b.file);
  });
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
    warnDays: DEFAULT_WARN_DAYS,
    failDays: DEFAULT_FAIL_DAYS,
    violations: violations.map((violation) => ({
      signature: signatureFor(violation),
      rule: violation.rule,
      file: violation.file,
      message: violation.message
    }))
  };

  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printViolations(title, violations) {
  if (violations.length === 0) return;

  console.log(`\n${title} (${violations.length})`);
  for (const violation of violations.slice(0, 50)) {
    console.log(`- [${violation.rule}] ${violation.file}`);
    if (violation.message) {
      console.log(`  ${violation.message}`);
    }
  }
  if (violations.length > 50) {
    console.log(`- ... ${violations.length - 50} more`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const warnDays = parsePositiveInt(process.env.OPSPAL_LIFECYCLE_WARN_DAYS, DEFAULT_WARN_DAYS);
  const failDays = parsePositiveInt(process.env.OPSPAL_LIFECYCLE_FAIL_DAYS, DEFAULT_FAIL_DAYS);
  const inventory = collectInventory();
  const violations = collectViolations(inventory, warnDays, failDays);

  if (options.updateBaseline) {
    saveBaseline(violations);
    console.log('Lifecycle Metadata Check');
    console.log('========================');
    console.log(`Baseline updated: ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
    console.log(`Plugins scanned: ${inventory.totals.plugins}`);
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

  console.log('Lifecycle Metadata Check');
  console.log('========================');
  console.log(`Plugins scanned: ${inventory.totals.plugins}`);
  console.log(`Current violations: ${violations.length}`);
  console.log(`Baseline violations: ${baseline.entries.length}`);
  console.log(`New violations: ${newViolations.length}`);
  console.log(`Resolved since baseline: ${resolvedViolations.length}`);
  console.log(`Policy: warn>${warnDays} days, fail>${failDays} days`);

  printViolations('New violations', newViolations);

  if (newViolations.length > 0) {
    console.error('\nLifecycle metadata gate failed due to net-new violations.');
    console.error('If intentional, update baseline with:');
    console.error('  node scripts/lib/verify-lifecycle-metadata.js --update-baseline');
    process.exit(1);
  }

  console.log('\nLifecycle metadata gate passed.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Fatal: ${error.message}`);
    process.exit(2);
  }
}
