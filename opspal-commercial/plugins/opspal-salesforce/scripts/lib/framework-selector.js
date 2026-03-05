#!/usr/bin/env node

/**
 * Framework Selector
 *
 * Detects, compares, and confirms assessment frameworks before execution,
 * preventing confusion about which methodology is being used.
 *
 * Usage:
 *   node scripts/lib/framework-selector.js list --type revops
 *   node scripts/lib/framework-selector.js last-used eta-corp --type revops
 *   node scripts/lib/framework-selector.js lock sfdc-revops-auditor@2.0 --project ./path/
 *   node scripts/lib/framework-selector.js recommend eta-corp --type cpq
 *
 * Maintains framework usage history in .claude/framework-history.json
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(process.cwd(), '.claude', 'framework-history.json');
const AGENTS_DIR = path.join(process.cwd(), '.claude', 'agents');

// Framework definitions (could be moved to config)
const KNOWN_FRAMEWORKS = {
  'revops': [
    {
      agent: 'sfdc-revops-auditor',
      version: '2.0',
      name: 'RevOps Assessment Framework v2.0',
      description: 'Comprehensive RevOps audit with multi-dimensional scoring',
      features: [
        'GTM Architecture Assessment',
        'Automation Pattern Detection',
        'User Behavior Analysis',
        'Campaign Attribution Tracking',
        'Statistical Sampling (95% CI)',
        'Multi-dimensional Scoring'
      ]
    }
  ],
  'cpq': [
    {
      agent: 'sfdc-cpq-assessor',
      version: '2.0',
      name: 'CPQ Assessment Framework v2.0',
      description: 'Salesforce CPQ evaluation with data quality safeguards',
      features: [
        'Package Verification',
        'Discovery Phase',
        'Utilization Analysis',
        'Configuration Review',
        'Data Quality Checkpoints',
        'Time-Series Pattern Detection'
      ]
    }
  ],
  'security': [
    {
      agent: 'sfdc-security-admin',
      version: '1.0',
      name: 'Security Assessment Framework',
      description: 'Comprehensive security audit',
      features: [
        'Permission Set Analysis',
        'Profile Review',
        'Sharing Rules Audit',
        'Field-Level Security',
        'Object Access Review'
      ]
    }
  ]
};

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return { history: [] };
  }
  return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
}

function saveHistory(history) {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function listFrameworks(type) {
  if (type && KNOWN_FRAMEWORKS[type]) {
    return {
      type: type,
      frameworks: KNOWN_FRAMEWORKS[type]
    };
  }

  return {
    all_types: Object.keys(KNOWN_FRAMEWORKS),
    frameworks: KNOWN_FRAMEWORKS
  };
}

function getLastUsed(orgAlias, type) {
  const history = loadHistory();

  const filtered = history.history.filter(entry => {
    if (type && entry.assessment_type !== type) return false;
    if (orgAlias && entry.org !== orgAlias) return false;
    return true;
  });

  if (filtered.length === 0) {
    return null;
  }

  // Sort by date descending
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  return filtered[0];
}

function lockFramework(frameworkSpec, projectPath) {
  // Parse framework spec: agent@version
  const [agent, version] = frameworkSpec.split('@');

  const lockData = {
    framework: {
      agent: agent,
      version: version || 'latest',
      locked_at: new Date().toISOString()
    }
  };

  // Save to project metadata
  const metadataPath = path.join(projectPath, 'PROJECT_METADATA.json');

  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  }

  metadata.framework = lockData.framework;
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  console.log(`✅ Framework locked: ${frameworkSpec}`);
  console.log(`   Metadata saved to: ${metadataPath}`);

  return lockData;
}

function recommendFramework(orgAlias, type) {
  const lastUsed = getLastUsed(orgAlias, type);
  const available = KNOWN_FRAMEWORKS[type] || [];

  if (available.length === 0) {
    return {
      error: `No frameworks available for type: ${type}`,
      available_types: Object.keys(KNOWN_FRAMEWORKS)
    };
  }

  let recommendation;

  if (lastUsed) {
    // Find matching framework
    recommendation = available.find(f =>
      f.agent === lastUsed.framework && f.version === lastUsed.version
    );

    if (recommendation) {
      return {
        recommended: recommendation,
        reason: `Previously used for ${orgAlias} on ${lastUsed.date}`,
        last_used: lastUsed,
        alternatives: available.filter(f => f !== recommendation)
      };
    }
  }

  // No history or not found, recommend first (usually latest version)
  return {
    recommended: available[0],
    reason: 'Latest version (no previous usage history)',
    last_used: null,
    alternatives: available.slice(1)
  };
}

function recordUsage(orgAlias, assessmentType, framework, version, projectPath) {
  const history = loadHistory();

  history.history.push({
    org: orgAlias,
    assessment_type: assessmentType,
    framework: framework,
    version: version,
    date: new Date().toISOString().split('T')[0],
    project_path: projectPath
  });

  saveHistory(history);
  console.log(`✅ Framework usage recorded: ${framework}@${version} for ${orgAlias}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: framework-selector.js <action> [options]');
    console.error('');
    console.error('Actions:');
    console.error('  list [--type TYPE]              List available frameworks');
    console.error('  last-used ORG [--type TYPE]     Get last used framework for org');
    console.error('  lock FRAMEWORK@VERSION --project PATH   Lock framework version for project');
    console.error('  recommend ORG --type TYPE       Recommend framework for org');
    console.error('  record ORG --type TYPE --framework NAME --version VER --project PATH');
    console.error('');
    console.error('Examples:');
    console.error('  node framework-selector.js list --type revops');
    console.error('  node framework-selector.js last-used eta-corp --type revops');
    console.error('  node framework-selector.js lock sfdc-revops-auditor@2.0 --project ./assessment/');
    console.error('  node framework-selector.js recommend eta-corp --type cpq');
    process.exit(1);
  }

  const action = args[0];

  switch (action) {
    case 'list': {
      const typeIndex = args.indexOf('--type');
      const type = typeIndex !== -1 ? args[typeIndex + 1] : null;
      const result = listFrameworks(type);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'last-used': {
      const orgAlias = args[1];
      const typeIndex = args.indexOf('--type');
      const type = typeIndex !== -1 ? args[typeIndex + 1] : null;

      if (!orgAlias) {
        console.error('❌ Org alias required');
        process.exit(1);
      }

      const lastUsed = getLastUsed(orgAlias, type);
      if (lastUsed) {
        console.log(JSON.stringify(lastUsed, null, 2));
      } else {
        console.log(JSON.stringify({
          message: 'No usage history found',
          org: orgAlias,
          type: type
        }, null, 2));
      }
      break;
    }

    case 'lock': {
      const frameworkSpec = args[1];
      const projectIndex = args.indexOf('--project');

      if (!frameworkSpec || projectIndex === -1 || !args[projectIndex + 1]) {
        console.error('❌ Usage: lock FRAMEWORK@VERSION --project PATH');
        process.exit(1);
      }

      const projectPath = args[projectIndex + 1];
      const result = lockFramework(frameworkSpec, projectPath);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'recommend': {
      const orgAlias = args[1];
      const typeIndex = args.indexOf('--type');

      if (!orgAlias || typeIndex === -1 || !args[typeIndex + 1]) {
        console.error('❌ Usage: recommend ORG --type TYPE');
        process.exit(1);
      }

      const type = args[typeIndex + 1];
      const result = recommendFramework(orgAlias, type);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'record': {
      const orgAlias = args[1];
      const typeIndex = args.indexOf('--type');
      const frameworkIndex = args.indexOf('--framework');
      const versionIndex = args.indexOf('--version');
      const projectIndex = args.indexOf('--project');

      if (!orgAlias || typeIndex === -1 || frameworkIndex === -1 || versionIndex === -1 || projectIndex === -1) {
        console.error('❌ Usage: record ORG --type TYPE --framework NAME --version VER --project PATH');
        process.exit(1);
      }

      const type = args[typeIndex + 1];
      const framework = args[frameworkIndex + 1];
      const version = args[versionIndex + 1];
      const projectPath = args[projectIndex + 1];

      recordUsage(orgAlias, type, framework, version, projectPath);
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  listFrameworks,
  getLastUsed,
  lockFramework,
  recommendFramework,
  recordUsage
};
