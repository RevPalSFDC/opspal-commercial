#!/usr/bin/env node

/*
 * Generate executive AI leverage + feature gap artifacts for OpsPal.
 * Sources of truth:
 * - docs/PLUGIN_SUITE_CATALOG.json
 * - plugin manifests (via manifestPath fields in catalog)
 * - top-level docs for narrative drift detection
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { emitCommandTelemetry } = require('./lib/command-telemetry');

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, 'docs', 'PLUGIN_SUITE_CATALOG.json');
const README_PATH = path.join(ROOT, 'README.md');
const FEATURES_PATH = path.join(ROOT, 'FEATURES.md');
const OUTPUT_DIR = path.join(ROOT, 'reports', 'exec');
const RUNTIME_OUTPUT_DIR = path.join(OUTPUT_DIR, 'runtime');
const CONTRACTS_DIR = path.join(ROOT, 'docs', 'contracts');
const APPROVED_WORK_ITEMS_PATH = path.join(
  RUNTIME_OUTPUT_DIR,
  'opspal-approved-work-items.json'
);
const NEXT_ACTION_TRIAGE_TELEMETRY_PATH = path.join(
  ROOT,
  'state',
  'next-action-triage-telemetry.ndjson'
);
const STRATEGY_DASHBOARD_COMMAND_DOC_PATH = path.join(
  ROOT,
  'plugins',
  'opspal-core',
  'commands',
  'strategy-dashboard.md'
);
const PLAN_START_DATE = new Date('2026-02-14T00:00:00Z');

const WORKFLOW_STAGES = [
  'detect',
  'diagnose',
  'recommend',
  'simulate',
  'execute',
  'verify',
  'learn',
];

const MATURITY_LEVELS = [
  'rules_based',
  'llm_assisted',
  'closed_loop_learning',
  'autonomous_execution',
];

const COMMAND_TELEMETRY_CONTRACT_VERSION = 'opspal-command-telemetry-v1';
const COMMAND_TELEMETRY_ENABLED_VALUES = ['true', '1', 'yes', 'on'];
const COMMAND_TELEMETRY_ENABLED_VALUE_SET = new Set(
  COMMAND_TELEMETRY_ENABLED_VALUES
);

const WORKFLOW_KEYWORDS = {
  detect: [
    'detect',
    'discovery',
    'discover',
    'identify',
    'monitor',
    'scan',
    'watch',
  ],
  diagnose: [
    'diagnose',
    'analysis',
    'analyze',
    'audit',
    'health check',
    'root cause',
    'troubleshoot',
    'investigate',
  ],
  recommend: [
    'recommend',
    'recommendation',
    'suggest',
    'prioritize',
    'roadmap',
    'plan',
    'strategy',
    'next best action',
  ],
  simulate: [
    'simulate',
    'simulation',
    'scenario',
    'what-if',
    'forecast',
    'modeling',
    'monte carlo',
    'projection',
    'predict',
  ],
  execute: [
    'deploy',
    'create',
    'update',
    'merge',
    'run',
    'orchestrate',
    'automation',
    'execute',
    'sync',
    'manage',
    'build',
    'generate',
    'fix',
  ],
  verify: [
    'validate',
    'validation',
    'verify',
    'verification',
    'test',
    'preflight',
    'compliance',
    'quality gate',
    'check',
    'guardrail',
  ],
  learn: [
    'learn',
    'learning',
    'adaptive',
    'reflection',
    'self-improvement',
    'ace',
    'feedback loop',
    'continuous intelligence',
  ],
};

const MATURITY_KEYWORDS = {
  closed_loop_learning: [
    'closed-loop',
    'closed loop',
    'self-learning',
    'adaptive routing',
    'roi tracking',
    'reflection',
    'strategy transfer',
    'ace',
  ],
  autonomous_execution: [
    'autonomous',
    'auto-implement',
    'autofix',
    'self-healing',
    'auto-fix',
    'orchestrates',
    'runs automatically',
    'automatic execution',
  ],
  llm_assisted: [
    'llm',
    'ai-powered',
    'ai powered',
    'claude',
    'gemini',
    'nlp',
    'intelligent',
    'synthesizer',
    'model selection',
    'prompt',
  ],
  rules_based: [
    'rules-based',
    'rules based',
    'deterministic',
    'regex',
    'static analysis',
    'policy',
    'template',
    'validator',
  ],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson(filePath);
}

function readNdjsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch (_error) {
      // Ignore malformed telemetry lines so generation remains resilient.
    }
  }
  return rows;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function escapeMarkdown(value) {
  return String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const cloned = new Date(date);
  cloned.setDate(cloned.getDate() + days);
  return cloned;
}

function asPercent(numerator, denominator) {
  if (!denominator) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function computeSourceFingerprint(inputs) {
  const hash = crypto.createHash('sha256');
  for (const value of inputs) {
    hash.update(String(value || ''));
    hash.update('\n---\n');
  }
  return hash.digest('hex').slice(0, 16);
}

function collectAssets(plugin) {
  const assets = [];
  const add = (assetType, items) => {
    for (const item of items || []) {
      const text = normalizeText(
        [item.name, item.description, item.frontmatter && item.frontmatter.description]
          .filter(Boolean)
          .join(' ')
      );
      assets.push({
        plugin: plugin.name,
        type: assetType,
        name: item.name,
        text,
      });
    }
  };

  add('agent', plugin.agents);
  add('command', plugin.commands);
  add('skill', plugin.skills);
  add('hook', plugin.hooks);
  return assets;
}

function classifyWorkflow(asset) {
  const matched = new Set();
  const text = asset.text;

  for (const stage of WORKFLOW_STAGES) {
    for (const keyword of WORKFLOW_KEYWORDS[stage]) {
      if (text.includes(keyword)) {
        matched.add(stage);
        break;
      }
    }
  }

  if (matched.size === 0) {
    if (asset.type === 'hook') {
      matched.add('verify');
    } else if (asset.type === 'skill') {
      matched.add('learn');
    } else if (asset.type === 'command') {
      matched.add('execute');
    } else {
      matched.add('diagnose');
    }
  }

  return matched;
}

function classifyMaturity(asset) {
  const text = asset.text;

  // Highest maturity checked first.
  const ordered = [
    'closed_loop_learning',
    'autonomous_execution',
    'llm_assisted',
    'rules_based',
  ];

  for (const level of ordered) {
    const keywords = MATURITY_KEYWORDS[level];
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return level;
      }
    }
  }

  if (asset.type === 'hook') {
    return 'rules_based';
  }
  if (asset.type === 'skill' && text.includes('framework')) {
    return 'rules_based';
  }
  return 'rules_based';
}

function parseReadmeStats(readmeText) {
  const metrics = ['plugins', 'agents', 'commands', 'skills', 'hooks', 'scripts'];
  const result = {};
  for (const metric of metrics) {
    const label = metric.charAt(0).toUpperCase() + metric.slice(1);
    const regex = new RegExp(`\\|\\s*${label}\\s*\\|\\s*(\\d+)\\s*\\|`, 'i');
    const match = readmeText.match(regex);
    if (match) {
      result[metric] = Number(match[1]);
    }
  }
  return result;
}

function parseFeaturesStats(featuresText) {
  const patterns = {
    agents: /\*\*(\d+)\+?\s+Specialized Agents\*\*/i,
    scripts: /\*\*(\d+)\+?\s+Automation Scripts\*\*/i,
    commands: /\*\*(\d+)\+?\s+Slash Commands\*\*/i,
    plugins: /\*\*(\d+)\s+Modular Plugins\*\*/i,
  };

  const result = {};
  for (const [metric, pattern] of Object.entries(patterns)) {
    const match = featuresText.match(pattern);
    if (match) {
      result[metric] = Number(match[1]);
    }
  }
  return result;
}

function computeDriftRows(catalogTotals, readmeStats, featuresStats) {
  const sources = [
    { source: 'README.md', stats: readmeStats },
    { source: 'FEATURES.md', stats: featuresStats },
  ];
  const rows = [];

  for (const source of sources) {
    for (const metric of Object.keys(source.stats)) {
      const expected = catalogTotals[metric];
      if (typeof expected !== 'number') {
        continue;
      }
      const reported = source.stats[metric];
      const delta = reported - expected;
      if (delta !== 0) {
        rows.push({
          source: source.source,
          metric,
          reported,
          expected,
          delta,
        });
      }
    }
  }

  return rows;
}

function aggregateMatrices(catalog) {
  const workflowMatrix = {};
  const maturityMatrix = {};
  const pluginInventory = [];

  for (const plugin of catalog.plugins) {
    workflowMatrix[plugin.name] = Object.fromEntries(
      WORKFLOW_STAGES.map((stage) => [stage, 0])
    );
    maturityMatrix[plugin.name] = Object.fromEntries(
      MATURITY_LEVELS.map((level) => [level, 0])
    );

    const mandatoryAgents = (plugin.agents || []).filter((agent) =>
      String(agent.description || '').includes('MUST BE USED')
    ).length;

    pluginInventory.push({
      name: plugin.name,
      version: plugin.version,
      status: plugin.status,
      owner: plugin.owner || 'unset',
      stability: plugin.stability || 'unset',
      agents: (plugin.agents || []).length,
      commands: (plugin.commands || []).length,
      skills: (plugin.skills || []).length,
      hooks: (plugin.hooks || []).length,
      scripts: (plugin.scripts || []).length,
      mandatoryAgents,
      description: plugin.description || '',
    });

    const assets = collectAssets(plugin);
    for (const asset of assets) {
      const workflowTags = classifyWorkflow(asset);
      for (const tag of workflowTags) {
        workflowMatrix[plugin.name][tag] += 1;
      }
      const maturity = classifyMaturity(asset);
      maturityMatrix[plugin.name][maturity] += 1;
    }
  }

  return { workflowMatrix, maturityMatrix, pluginInventory };
}

function getMaturityRatios(pluginInventory, maturityMatrix) {
  const ratios = [];
  for (const plugin of pluginInventory) {
    const matrix = maturityMatrix[plugin.name];
    const totalAssets = MATURITY_LEVELS.reduce(
      (acc, level) => acc + matrix[level],
      0
    );
    const aiEnabled =
      matrix.llm_assisted +
      matrix.closed_loop_learning +
      matrix.autonomous_execution;
    const ratio = totalAssets === 0 ? 0 : aiEnabled / totalAssets;
    ratios.push({
      plugin: plugin.name,
      totalAssets,
      aiEnabled,
      ratio,
      status: plugin.status,
    });
  }
  return ratios.sort((a, b) => a.ratio - b.ratio);
}

function scoreOpportunity(row) {
  const weighted =
    row.impact_score * 0.32 +
    row.risk_reduction_score * 0.2 +
    row.time_to_value_score * 0.2 +
    row.governance_fit_score * 0.18 +
    (6 - row.effort_score) * 0.1;
  const overall = Number(weighted.toFixed(2));
  return {
    ...row,
    overall_score: overall,
    ninety_day_fit: overall >= 4.0 && row.effort_score <= 3 ? 'yes' : 'conditional',
  };
}

function buildOpportunities(input) {
  const {
    catalog,
    pluginInventory,
    maturityRatios,
    driftRows,
  } = input;

  const deprecatedPlugins = pluginInventory
    .filter((plugin) => plugin.status === 'deprecated')
    .map((plugin) => plugin.name);
  const experimentalPlugins = pluginInventory
    .filter((plugin) => plugin.status === 'experimental')
    .map((plugin) => plugin.name);
  const mandatoryTotal = pluginInventory.reduce(
    (acc, plugin) => acc + plugin.mandatoryAgents,
    0
  );

  const lowMaturityTargets = maturityRatios
    .filter((item) => item.status !== 'deprecated')
    .slice(0, 3)
    .map((item) => `${item.plugin} (${(item.ratio * 100).toFixed(1)}%)`);

  const opportunities = [
    {
      id: 'OPP-001',
      title: 'Capability Narrative Drift Guardrail',
      category: 'feature_gap',
      plugin_scope: 'suite-wide',
      problem_statement:
        'Top-level product narratives drift from generated registry truth, weakening leadership confidence and field alignment.',
      evidence: `Detected ${driftRows.length} metric drift rows across README/FEATURES vs generated catalog.`,
      owner_suggested: 'revpal-platform',
      impact_score: driftRows.length > 0 ? 5 : 3,
      risk_reduction_score: 4,
      time_to_value_score: 5,
      effort_score: 2,
      governance_fit_score: 5,
    },
    {
      id: 'OPP-002',
      title: 'AI Maturity Uplift for Lowest-Coverage Plugins',
      category: 'ai_leverage',
      plugin_scope: lowMaturityTargets.join('; '),
      problem_statement:
        'AI-enabled capability coverage is uneven across plugins, reducing perceived suite intelligence consistency.',
      evidence: `Lowest AI-enabled ratios: ${lowMaturityTargets.join(', ')}.`,
      owner_suggested: 'revpal-platform',
      impact_score: 4,
      risk_reduction_score: 3,
      time_to_value_score: 4,
      effort_score: 3,
      governance_fit_score: 4,
    },
    {
      id: 'OPP-003',
      title: 'Copilot Approval Queue for Mandatory Route Outputs',
      category: 'ai_leverage',
      plugin_scope: 'opspal-core; opspal-salesforce; opspal-marketo',
      problem_statement:
        'High mandatory-agent concentration requires a unified approval workflow for production-impacting recommendations.',
      evidence: `${mandatoryTotal} mandatory agents across suite require predictable human-approval gating.`,
      owner_suggested: 'revpal-platform',
      impact_score: 5,
      risk_reduction_score: 5,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 5,
    },
    {
      id: 'OPP-004',
      title: 'Cross-Plugin Command Telemetry Contract',
      category: 'feature_gap',
      plugin_scope: 'suite-wide',
      problem_statement:
        'Command-level outcomes are not normalized for comparable executive-level KPI tracking across plugins.',
      evidence: 'No suite-wide command telemetry schema is published for standardized outcome collection.',
      owner_suggested: 'revpal-platform',
      impact_score: 4,
      risk_reduction_score: 4,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 5,
    },
    {
      id: 'OPP-005',
      title: 'Data Hygiene Sunset Completion',
      category: 'feature_gap',
      plugin_scope: deprecatedPlugins.join('; ') || 'none',
      problem_statement:
        'Deprecated plugin capabilities still represent migration surface area and support overhead.',
      evidence: `${deprecatedPlugins.length} deprecated plugin(s): ${deprecatedPlugins.join(', ') || 'none'}.`,
      owner_suggested: 'revpal-platform',
      impact_score: 4,
      risk_reduction_score: 4,
      time_to_value_score: 4,
      effort_score: 2,
      governance_fit_score: 5,
    },
    {
      id: 'OPP-006',
      title: 'Monday Plugin Graduation Readiness',
      category: 'feature_gap',
      plugin_scope: experimentalPlugins.join('; ') || 'none',
      problem_statement:
        'Experimental plugin status limits enterprise confidence and routable use-case expansion.',
      evidence: `${experimentalPlugins.length} experimental plugin(s): ${experimentalPlugins.join(', ') || 'none'}.`,
      owner_suggested: 'revpal-experimental',
      impact_score: 3,
      risk_reduction_score: 3,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 4,
    },
    {
      id: 'OPP-007',
      title: 'Manual Review Load Reduction in Dedup and Routing',
      category: 'ai_leverage',
      plugin_scope: 'opspal-core; opspal-hubspot; opspal-salesforce',
      problem_statement:
        'Manual review checkpoints are necessary but expensive; confidence-scored triage can shrink review volume.',
      evidence: 'Multiple dedup/routing workflows explicitly escalate to manual review states.',
      owner_suggested: 'revpal-platform',
      impact_score: 4,
      risk_reduction_score: 4,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 5,
    },
    {
      id: 'OPP-008',
      title: 'Cross-Model Consultation Expansion',
      category: 'ai_leverage',
      plugin_scope: 'opspal-ai-consult; suite-wide consumers',
      problem_statement:
        'Cross-model consultation value is concentrated in a single plugin rather than embedded in key orchestration paths.',
      evidence: 'Dedicated cross-model capability exists, but trigger propagation across other plugins is limited.',
      owner_suggested: 'revpal-ai',
      impact_score: 3,
      risk_reduction_score: 3,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 4,
    },
    {
      id: 'OPP-009',
      title: 'Unified RevOps Next-Best-Action Layer',
      category: 'ai_leverage',
      plugin_scope: 'opspal-core; opspal-salesforce; opspal-hubspot; opspal-marketo',
      problem_statement:
        'Insights exist across many agents, but remediation sequencing is fragmented without unified next-best-action ranking.',
      evidence: 'Large command/agent surface supports diagnostics but lacks a common prioritized remediation object.',
      owner_suggested: 'revpal-platform',
      impact_score: 5,
      risk_reduction_score: 4,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 5,
    },
    {
      id: 'OPP-010',
      title: 'Forecast and Simulation Standardization',
      category: 'feature_gap',
      plugin_scope: 'opspal-gtm-planning; opspal-hubspot; opspal-core',
      problem_statement:
        'Forecasting/simulation logic is distributed across domains without a shared confidence and scenario contract.',
      evidence: 'Simulation and forecast capabilities exist but are not normalized into one reusable suite contract.',
      owner_suggested: 'revpal-gtm',
      impact_score: 3,
      risk_reduction_score: 3,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 4,
    },
    {
      id: 'OPP-011',
      title: 'Initiative ROI Instrumentation Layer',
      category: 'feature_gap',
      plugin_scope: 'suite-wide',
      problem_statement:
        'ROI reporting exists in pockets; initiative-level KPI baseline/target tracking is not consistently surfaced for executives.',
      evidence: 'Self-improvement ROI tooling exists, but not all feature initiatives map to standardized executive KPI objects.',
      owner_suggested: 'revpal-platform',
      impact_score: 4,
      risk_reduction_score: 3,
      time_to_value_score: 3,
      effort_score: 3,
      governance_fit_score: 5,
    },
    {
      id: 'OPP-012',
      title: 'Strategy Dashboard Gap Category Feeds',
      category: 'feature_gap',
      plugin_scope: 'opspal-core',
      problem_statement:
        'The strategy dashboard command does not yet consume dedicated AI-gap and feature-gap portfolio payloads.',
      evidence: 'Gap payloads are not currently published as explicit dashboard category data sources.',
      owner_suggested: 'revpal-platform',
      impact_score: 3,
      risk_reduction_score: 3,
      time_to_value_score: 4,
      effort_score: 2,
      governance_fit_score: 5,
    },
  ];

  return opportunities.map(scoreOpportunity).sort((a, b) => b.overall_score - a.overall_score);
}

function buildCapabilityReport(input) {
  const {
    catalog,
    pluginInventory,
    workflowMatrix,
    maturityMatrix,
    driftRows,
    opportunities,
    manifestMismatches,
    sourceFingerprint,
  } = input;

  const inventoryRows = pluginInventory
    .map(
      (plugin) =>
        `| \`${plugin.name}\` | \`${plugin.owner}\` | ${plugin.status} | ${plugin.stability} | ${plugin.agents} | ${plugin.commands} | ${plugin.skills} | ${plugin.hooks} | ${plugin.scripts} | ${plugin.mandatoryAgents} |`
    )
    .join('\n');

  const workflowRows = pluginInventory
    .map((plugin) => {
      const row = workflowMatrix[plugin.name];
      return (
        `| \`${plugin.name}\` | ${row.detect} | ${row.diagnose} | ${row.recommend} | ` +
        `${row.simulate} | ${row.execute} | ${row.verify} | ${row.learn} |`
      );
    })
    .join('\n');

  const maturityRows = pluginInventory
    .map((plugin) => {
      const row = maturityMatrix[plugin.name];
      const total = MATURITY_LEVELS.reduce((acc, key) => acc + row[key], 0);
      const aiEnabled =
        row.llm_assisted + row.closed_loop_learning + row.autonomous_execution;
      return (
        `| \`${plugin.name}\` | ${row.rules_based} | ${row.llm_assisted} | ` +
        `${row.closed_loop_learning} | ${row.autonomous_execution} | ${asPercent(aiEnabled, total)} |`
      );
    })
    .join('\n');

  const driftTable =
    driftRows.length === 0
      ? '_No drift detected._'
      : [
          '| Source | Metric | Reported | Generated Truth | Delta |',
          '|---|---|---:|---:|---:|',
          ...driftRows.map(
            (row) =>
              `| \`${row.source}\` | ${row.metric} | ${row.reported} | ${row.expected} | ${row.delta > 0 ? '+' : ''}${row.delta} |`
          ),
        ].join('\n');

  const topOpportunities = opportunities
    .slice(0, 12)
    .map(
      (row, index) =>
        `${index + 1}. **${row.title}** (\`${row.id}\`, ${row.category}, score ${row.overall_score}) - ${row.problem_statement}`
    )
    .join('\n');

  const manifestAlignment =
    manifestMismatches.length === 0
      ? '- Manifest alignment check: no mismatches detected between catalog and plugin manifests.'
      : [
          '- Manifest alignment mismatches detected:',
          ...manifestMismatches.map(
            (row) => `  - ${row.plugin}: ${row.issue}`
          ),
        ].join('\n');

  const problemStatements = pluginInventory
    .map(
      (plugin) =>
        `- **${plugin.name}**: ${plugin.description || 'No description in manifest.'}`
    )
    .join('\n');

  return `# OpsPal Capability vs AI Maturity Heatmap

Source Fingerprint: \`${sourceFingerprint}\`

## What OpsPal Is Solving For (Current State)
${problemStatements}

## Source-of-Truth Suite Matrix

| Metric | Count |
|---|---:|
| Plugins | ${catalog.totals.plugins} |
| Agents | ${catalog.totals.agents} |
| Commands | ${catalog.totals.commands} |
| Skills | ${catalog.totals.skills} |
| Hooks | ${catalog.totals.hooks} |
| Scripts | ${catalog.totals.scripts} |

## Plugin Inventory and Governance Shape

| Plugin | Owner | Status | Stability | Agents | Commands | Skills | Hooks | Scripts | Mandatory Agents |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
${inventoryRows}

## Workflow Stage Coverage Heatmap

| Plugin | Detect | Diagnose | Recommend | Simulate | Execute | Verify | Learn |
|---|---:|---:|---:|---:|---:|---:|---:|
${workflowRows}

## AI Maturity Heatmap

| Plugin | Rules-Based | LLM-Assisted | Closed-Loop Learning | Autonomous Execution | AI-Enabled Ratio |
|---|---:|---:|---:|---:|---:|
${maturityRows}

## Documentation Drift Signals
${driftTable}

## Missed Opportunities (Top 12)
${topOpportunities}

## Notes
- Classification is deterministic keyword-based over agent/command/skill/hook metadata.
- Scores are normalized to a 1.0-5.0 range with copilot-first governance weighting.
${manifestAlignment}
`;
}

function buildDocumentationTrustDigest(input) {
  const { sourceFingerprint, driftRows, manifestMismatches } = input;

  const driftSummary =
    driftRows.length === 0
      ? '- Narrative drift status: PASS (0 metric drift rows detected).'
      : `- Narrative drift status: FAIL (${driftRows.length} metric drift row(s) detected).`;

  const manifestSummary =
    manifestMismatches.length === 0
      ? '- Manifest alignment status: PASS (no manifest mismatches detected).'
      : `- Manifest alignment status: WARN (${manifestMismatches.length} mismatch(es) detected).`;

  const driftTable =
    driftRows.length === 0
      ? '_No drift detected._'
      : [
          '| Source | Metric | Reported | Generated Truth | Delta |',
          '|---|---|---:|---:|---:|',
          ...driftRows.map(
            (row) =>
              `| \`${row.source}\` | ${row.metric} | ${row.reported} | ${row.expected} | ${row.delta > 0 ? '+' : ''}${row.delta} |`
          ),
        ].join('\n');

  return `# OpsPal Documentation Trust Digest

Source Fingerprint: \`${sourceFingerprint}\`

## Trust Status
${driftSummary}
${manifestSummary}

## Approved Source-of-Truth Pointers

| Artifact | Purpose |
|---|---|
| \`docs/PLUGIN_SUITE_CATALOG.json\` | Canonical machine-readable plugin inventory and totals. |
| \`docs/PLUGIN_SUITE_CATALOG.md\` | Canonical human-readable plugin inventory and lifecycle context. |
| \`docs/PLUGIN_OWNERSHIP_AND_LIFECYCLE.md\` | Ownership, lifecycle status, and review accountability source. |
| \`reports/exec/opspal-capability-vs-ai-maturity.md\` | Executive capability baseline including narrative drift signals. |
| \`reports/exec/opspal-gap-priority-matrix.csv\` | Ranked opportunity scoring baseline for initiative prioritization. |
| \`reports/exec/opspal-90-day-initiatives.md\` | Funded initiative plan derived from the scoring baseline. |
| \`reports/exec/opspal-90-day-execution-board.md\` | Sprint timeline and KPI gates for the 90-day plan. |
| \`reports/exec/opspal-sprint6-executive-readout.md\` | Sprint 6 executive outcome summary with KPI deltas and phase-2 recommendations. |

## Release-Blocking Guardrails
- Local blocking command: \`npm run exec:validate\`
- CI blocking command: \`npm run exec:ci\`
- Workflow gate: \`.github/workflows/exec-gap-analysis-check.yml\`

## Current Narrative Drift Detail
${driftTable}
`;
}

function selectAiMaturityTargets(maturityRatios, maxTargets = 3) {
  return (maturityRatios || [])
    .filter((item) => item.status !== 'deprecated')
    .slice(0, maxTargets)
    .map((item) => {
      const ratio = Number(item.ratio || 0);
      return {
        ...item,
        ratio,
        targetRatio: Math.min(1, ratio + 0.15),
      };
    });
}

function buildAiMaturityExecutionSnapshot(targetPlugins) {
  const approvedPayload = readJsonIfExists(APPROVED_WORK_ITEMS_PATH) || {};
  const approvedItems = Array.isArray(approvedPayload.items)
    ? approvedPayload.items
    : [];
  const runtimeChecklistFiles = fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];
  const opp002ChecklistFiles = runtimeChecklistFiles.filter((name) => {
    const lower = String(name || '').toLowerCase();
    return (
      lower.includes('wi-nba-opp-002') ||
      lower.includes('opp-002') ||
      (lower.includes('ai-maturity') && lower.includes('checklist'))
    );
  });

  const approvedWorkItem = approvedItems.find(
    (item) =>
      normalizeText(item.title) ===
      normalizeText('AI Maturity Uplift for Lowest-Coverage Plugins')
  );
  const approvedReady = normalizeText(approvedWorkItem?.ready_state) === 'ready';
  const handoffProofReady = opp002ChecklistFiles.length > 0 || approvedReady;

  const targetPluginProgress = (targetPlugins || []).map((item) => {
    const currentRatio = Number(item.current_ai_enabled_ratio || 0);
    const targetRatio = Number(item.target_ai_enabled_ratio || 0);
    const upliftGapRatio = toFixed2(targetRatio - currentRatio);
    const evidenceStatus =
      Number.isFinite(currentRatio) &&
      Number.isFinite(targetRatio) &&
      typeof item.total_assets === 'number' &&
      item.total_assets >= 0
        ? 'tracked'
        : 'missing';
    return {
      plugin: item.plugin,
      owner: item.owner,
      current_ai_enabled_ratio: currentRatio,
      target_ai_enabled_ratio: targetRatio,
      uplift_gap_ratio: upliftGapRatio,
      has_positive_uplift_gap: upliftGapRatio > 0,
      evidence_status: evidenceStatus,
      evidence_sources: [
        'reports/exec/opspal-ai-maturity-scorecards.json',
        'reports/exec/opspal-ai-maturity-uplift-pack.md',
        'reports/exec/opspal-capability-vs-ai-maturity.md',
      ],
    };
  });

  const total = targetPluginProgress.length;
  const trackedCount = targetPluginProgress.filter(
    (row) => row.evidence_status === 'tracked'
  ).length;
  const positiveGapCount = targetPluginProgress.filter(
    (row) => row.has_positive_uplift_gap
  ).length;
  const trackedReady = total > 0 && trackedCount === total;

  return {
    target_plugins_total: total,
    target_plugins_with_tracked_evidence: trackedCount,
    target_plugins_with_positive_uplift_gap: positiveGapCount,
    runtime_handoff: {
      approved_work_item_detected: Boolean(approvedWorkItem),
      approved_work_item_id: approvedWorkItem?.work_item_id || null,
      approved_ready_state: approvedWorkItem?.ready_state || null,
      checklist_files_detected: opp002ChecklistFiles.length,
      checklist_files: opp002ChecklistFiles,
      handoff_proof_ready: handoffProofReady,
    },
    target_plugin_progress: targetPluginProgress,
    completion_gate: {
      tracked_uplift_evidence_ready: trackedReady,
      runtime_handoff_proof_ready: handoffProofReady,
      ready_for_completion: trackedReady && handoffProofReady,
    },
  };
}

function buildAiMaturityScorecardsPayload(input) {
  const { sourceFingerprint, maturityRatios, maturityMatrix, pluginInventory } = input;
  const ownerByPlugin = Object.fromEntries(
    pluginInventory.map((plugin) => [plugin.name, plugin.owner || 'unassigned'])
  );
  const targets = selectAiMaturityTargets(maturityRatios);
  const targetPlugins = targets.map((item) => {
    const matrix = maturityMatrix[item.plugin] || {};
    const aiEnabledAssets =
      Number(matrix.llm_assisted || 0) +
      Number(matrix.closed_loop_learning || 0) +
      Number(matrix.autonomous_execution || 0);
    return {
      plugin: item.plugin,
      owner: ownerByPlugin[item.plugin] || 'unassigned',
      total_assets: Number(item.totalAssets || 0),
      ai_enabled_assets: aiEnabledAssets,
      current_ai_enabled_ratio: toFixed2(item.ratio),
      target_ai_enabled_ratio: toFixed2(item.targetRatio),
      maturity_profile: {
        rules_based: Number(matrix.rules_based || 0),
        llm_assisted: Number(matrix.llm_assisted || 0),
        closed_loop_learning: Number(matrix.closed_loop_learning || 0),
        autonomous_execution: Number(matrix.autonomous_execution || 0),
      },
    };
  });
  const executionSnapshot = buildAiMaturityExecutionSnapshot(targetPlugins);

  return {
    source_opportunity_id: 'OPP-002',
    source_fingerprint: sourceFingerprint,
    uplift_target_delta_ratio: 0.15,
    deterministic_fallback_contract: {
      confidence_threshold: 0.7,
      fallback_behavior: 'rules_based_only',
    },
    target_plugins: targetPlugins,
    execution_snapshot: executionSnapshot,
  };
}

function buildAiMaturityUpliftPack(input) {
  const {
    sourceFingerprint,
    maturityRatios,
    maturityMatrix,
    pluginInventory,
    aiMaturityScorecards,
  } = input;
  const ownerByPlugin = Object.fromEntries(
    pluginInventory.map((plugin) => [plugin.name, plugin.owner || 'unassigned'])
  );

  const targets = selectAiMaturityTargets(maturityRatios);
  const execution = aiMaturityScorecards?.execution_snapshot || {};
  const completionGate = execution.completion_gate || {};
  const handoff = execution.runtime_handoff || {};

  const scorecardRows =
    targets.length === 0
      ? '| - | - | - | - | - | - | - | - |\n'
      : targets
          .map((item) => {
            const matrix = maturityMatrix[item.plugin] || {};
            return (
              `| \`${item.plugin}\` | \`${ownerByPlugin[item.plugin] || 'unassigned'}\` | ${(
                item.ratio * 100
              ).toFixed(1)}% | ${item.totalAssets} | ${matrix.rules_based || 0} | ${
                matrix.llm_assisted || 0
              } | ${matrix.closed_loop_learning || 0} | ${(
                item.targetRatio * 100
              ).toFixed(1)}% |`
            );
          })
          .join('\n');

  const targetList =
    targets.length === 0
      ? '- No eligible active plugins found.'
      : targets
          .map((item) => `- \`${item.plugin}\` (${(item.ratio * 100).toFixed(1)}% AI-enabled)`)
          .join('\n');

  return `# OpsPal AI Maturity Uplift Pack

Source Fingerprint: \`${sourceFingerprint}\`

## Objective
Raise AI-enabled coverage for the lowest-maturity active plugins using reusable LLM-assisted blocks with deterministic fallback paths.

## Target Plugins (Lowest Current Coverage)
${targetList}

## Plugin Maturity Scorecards

| Plugin | Owner | Current AI-Enabled Ratio | Total Assets | Rules-Based | LLM-Assisted | Closed-Loop Learning | 90-Day Target Ratio |
|---|---|---:|---:|---:|---:|---:|---:|
${scorecardRows}

## Machine-Readable Scorecard Feed
- Canonical artifact: \`reports/exec/opspal-ai-maturity-scorecards.json\`
- Target plugins tracked: ${targets.length}
- Release guardrail: \`npm run exec:validate\` verifies scorecard structure and ratio bounds.

## Execution Tracking
- Tracked uplift evidence: ${execution.target_plugins_with_tracked_evidence || 0}/${execution.target_plugins_total || targets.length}
- Positive uplift-gap tracking: ${execution.target_plugins_with_positive_uplift_gap || 0}/${execution.target_plugins_total || targets.length}
- Runtime handoff proof: ${handoff.handoff_proof_ready ? 'yes' : 'no'} (checklists: ${handoff.checklist_files_detected || 0})
- Completion gate ready: ${completionGate.ready_for_completion ? 'yes' : 'no'}

## Reusable LLM-Assisted Analysis Blocks
1. Capability Intake Block: normalize plugin command/agent context into a compact, model-ready payload.
2. Recommendation Block: produce confidence-scored uplift actions with expected impact and owner assignment.
3. Fallback Decision Block: require deterministic fallback route when confidence is below threshold.

## Deterministic Fallback Contract
- Confidence threshold: \`0.70\`
- If confidence < threshold, route to rules-based playbook output only.
- Always attach rollback plan and validation checkpoints before promotion.

## Release Integration
- Regenerated by: \`npm run exec:generate\`
- Enforced by: \`npm run exec:validate\`
- CI gate: \`.github/workflows/exec-gap-analysis-check.yml\`
`;
}

function deriveOpportunityRiskClass(opportunity) {
  if (!opportunity) {
    return 'medium';
  }
  if (opportunity.impact_score >= 5 && opportunity.risk_reduction_score >= 5) {
    return 'critical';
  }
  if (opportunity.impact_score >= 4 && opportunity.risk_reduction_score >= 4) {
    return 'high';
  }
  if (opportunity.impact_score >= 3) {
    return 'medium';
  }
  return 'low';
}

function approvalPolicyForRiskClass(riskClass) {
  if (riskClass === 'critical') {
    return {
      required_approver_count: 3,
      required_roles: ['domain-owner', 'platform-owner', 'security-owner'],
    };
  }
  if (riskClass === 'high') {
    return {
      required_approver_count: 2,
      required_roles: ['domain-owner', 'platform-owner'],
    };
  }
  return {
    required_approver_count: 1,
    required_roles: ['domain-owner'],
  };
}

function parsePluginScope(scopeValue) {
  return String(scopeValue || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectFundedInitiatives(opportunities, maxCount = 5) {
  const byId = Object.fromEntries(opportunities.map((item) => [item.id, item]));
  const preferredOrder = ['OPP-001', 'OPP-003', 'OPP-009', 'OPP-002', 'OPP-004'];
  const selected = [];

  for (const id of preferredOrder) {
    if (byId[id]) {
      selected.push(byId[id]);
    }
    if (selected.length >= maxCount) {
      return selected.slice(0, maxCount);
    }
  }

  for (const row of opportunities) {
    if (selected.length >= maxCount) {
      break;
    }
    if (!selected.find((item) => item.id === row.id)) {
      selected.push(row);
    }
  }

  return selected.slice(0, maxCount);
}

function buildInitiativeRoiInstrumentationPayload(input) {
  const { opportunities, sourceFingerprint, driftRows, maturityRatios } = input;
  const selected = selectFundedInitiatives(opportunities, 5);

  const maturityTargets = (maturityRatios || [])
    .filter((item) => item.status !== 'deprecated')
    .slice(0, 3);
  const maturityBaseline =
    maturityTargets.length === 0
      ? 0
      : maturityTargets.reduce((acc, item) => acc + Number(item.ratio || 0), 0) /
        maturityTargets.length;
  const roundedMaturityBaseline = Number(maturityBaseline.toFixed(3));
  const roundedMaturityTarget = Number(Math.min(1, maturityBaseline + 0.15).toFixed(3));

  const initiativeNameByOpportunity = {
    'OPP-001': 'Documentation Trust Layer',
    'OPP-003': 'Copilot Approval Queue',
    'OPP-009': 'Unified Next-Best-Action Layer',
    'OPP-002': 'AI Maturity Uplift Pack',
    'OPP-004': 'Command Telemetry Contract Adoption',
  };

  const metricByOpportunity = {
    'OPP-001': {
      metric_id: 'doc_drift_rows',
      metric_name: 'Documentation narrative drift rows',
      unit: 'count',
      direction: 'down',
      baseline_value: Number((driftRows || []).length),
      target_value: 0,
      data_source: 'reports/exec/opspal-capability-vs-ai-maturity.md',
      reporting_artifact: 'reports/exec/opspal-documentation-trust-digest.md',
    },
    'OPP-003': {
      metric_id: 'approval_gated_recommendation_coverage',
      metric_name: 'High-risk recommendations routed through approval gate',
      unit: 'ratio',
      direction: 'up',
      baseline_value: 0,
      target_value: 1,
      data_source: 'reports/exec/opspal-next-best-actions.json',
      reporting_artifact: 'reports/exec/runtime/opspal-approved-work-items.json',
    },
    'OPP-009': {
      metric_id: 'ranked_action_adoption_rate',
      metric_name: 'Top-ranked actions accepted into execution queue',
      unit: 'ratio',
      direction: 'up',
      baseline_value: 0.25,
      target_value: 0.7,
      data_source: 'reports/exec/opspal-next-best-actions.json',
      reporting_artifact: 'reports/exec/runtime/opspal-approved-work-items.json',
    },
    'OPP-002': {
      metric_id: 'ai_enabled_ratio_lowest_three_plugins',
      metric_name: 'Average AI-enabled ratio across lowest-coverage active plugins',
      unit: 'ratio',
      direction: 'up',
      baseline_value: roundedMaturityBaseline,
      target_value: roundedMaturityTarget,
      data_source: 'reports/exec/opspal-ai-maturity-uplift-pack.md',
      reporting_artifact: 'reports/exec/opspal-capability-vs-ai-maturity.md',
    },
    'OPP-004': {
      metric_id: 'telemetry_contract_coverage',
      metric_name: 'High-volume command coverage for telemetry contract',
      unit: 'ratio',
      direction: 'up',
      baseline_value: 0,
      target_value: 0.8,
      data_source: 'docs/contracts/opspal-command-telemetry-contract.schema.json',
      reporting_artifact: 'reports/exec/strategy-dashboard-portfolio.json',
    },
  };

  const initiatives = selected.map((opportunity, index) => {
    const letter = String.fromCharCode(65 + index);
    const metricTemplate = metricByOpportunity[opportunity.id] || {
      metric_id: `metric-${String(opportunity.id || '').toLowerCase()}`,
      metric_name: opportunity.title || 'Initiative metric',
      unit: 'ratio',
      direction: 'up',
      baseline_value: 0,
      target_value: 0.6,
      data_source: 'reports/exec/opspal-gap-priority-matrix.csv',
      reporting_artifact: 'reports/exec/opspal-90-day-execution-board.md',
    };

    return {
      initiative_id: `INIT-${letter}`,
      initiative_label: `Initiative ${letter}`,
      linked_opportunity_id: opportunity.id,
      title: initiativeNameByOpportunity[opportunity.id] || opportunity.title,
      owner_team: opportunity.owner_suggested || 'unassigned',
      category: opportunity.category,
      risk_class: deriveOpportunityRiskClass(opportunity),
      overall_score: opportunity.overall_score,
      ninety_day_fit: opportunity.ninety_day_fit,
      reporting_cadence: 'bi-weekly',
      metrics: [metricTemplate],
    };
  });

  const rollup = {
    initiatives_total: initiatives.length,
    metrics_total: initiatives.reduce(
      (acc, initiative) => acc + (initiative.metrics || []).length,
      0
    ),
    high_or_critical_risk_initiatives: initiatives.filter((initiative) =>
      ['high', 'critical'].includes(initiative.risk_class)
    ).length,
  };

  const initiativesWithMetrics = initiatives.filter(
    (initiative) => Array.isArray(initiative.metrics) && initiative.metrics.length > 0
  ).length;
  let metricsWithEvidence = 0;
  for (const initiative of initiatives) {
    for (const metric of initiative.metrics || []) {
      if (metric.data_source && metric.reporting_artifact) {
        metricsWithEvidence += 1;
      }
    }
  }
  const kpiCoverageRatio =
    rollup.metrics_total === 0 ? 0 : toFixed2(metricsWithEvidence / rollup.metrics_total);
  const kpiContractReady =
    initiatives.length > 0 &&
    initiativesWithMetrics === initiatives.length &&
    rollup.metrics_total > 0 &&
    metricsWithEvidence === rollup.metrics_total;

  const checklistFiles = fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];
  const roiExecutionChecklistFile =
    findRuntimeChecklist(checklistFiles, ['wi-nba-opp-011', 'execution-checklist']) ||
    findRuntimeChecklist(checklistFiles, ['wi-nba-opp-011']);
  const strategyDashboardPayloadPath = path.join(
    OUTPUT_DIR,
    'strategy-dashboard-portfolio.json'
  );
  const strategyDashboardPayloadDetected = fs.existsSync(strategyDashboardPayloadPath);
  const runtimeHandoffReady =
    Boolean(roiExecutionChecklistFile) && strategyDashboardPayloadDetected;

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-011',
    title: 'Initiative ROI Instrumentation Layer',
    objective:
      'Standardize baseline/target KPI tracking for funded initiatives so executives can measure 90-day plan outcomes consistently.',
    measurement_window: {
      start_date: toDateString(PLAN_START_DATE),
      end_date: toDateString(addDays(PLAN_START_DATE, 83)),
      cadence: 'bi-weekly',
    },
    initiatives,
    rollup,
    execution_snapshot: {
      kpi_contract: {
        initiatives_total: initiatives.length,
        initiatives_with_metrics: initiativesWithMetrics,
        metrics_total: rollup.metrics_total,
        metrics_with_evidence: metricsWithEvidence,
        coverage_ratio: kpiCoverageRatio,
      },
      runtime_handoff: {
        execution_checklist_detected: Boolean(roiExecutionChecklistFile),
        execution_checklist_path: roiExecutionChecklistFile
          ? `reports/exec/runtime/${roiExecutionChecklistFile}`
          : null,
        strategy_dashboard_payload_detected: strategyDashboardPayloadDetected,
        strategy_dashboard_payload_path: path.relative(
          ROOT,
          strategyDashboardPayloadPath
        ),
      },
      completion_gate: {
        kpi_contract_ready: kpiContractReady,
        runtime_handoff_ready: runtimeHandoffReady,
        ready_for_phase2_reporting: kpiContractReady && runtimeHandoffReady,
      },
    },
    assumptions: [
      'Ratio metrics use [0,1] range where 1 equals 100% coverage.',
      'Baseline values may be seeded from current generated artifacts and updated after first sprint telemetry cut.',
    ],
  };
}

function formatMetricNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return String(value == null ? '-' : value);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function normalizeMetricNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (Number.isInteger(numeric)) {
    return numeric;
  }
  return Number(numeric.toFixed(3));
}

function buildInitiativeRoiInstrumentationMarkdown(payload) {
  const initiativeRows = (payload.initiatives || [])
    .map(
      (initiative) =>
        `| \`${initiative.initiative_id}\` | \`${initiative.linked_opportunity_id}\` | ${escapeMarkdown(initiative.title)} | \`${initiative.owner_team}\` | \`${initiative.risk_class}\` | \`${initiative.ninety_day_fit}\` | ${initiative.overall_score} |`
    )
    .join('\n');

  const kpiRows = [];
  for (const initiative of payload.initiatives || []) {
    for (const metric of initiative.metrics || []) {
      kpiRows.push(
        `| \`${initiative.initiative_id}\` | \`${metric.metric_id}\` | ${escapeMarkdown(
          metric.metric_name
        )} | \`${metric.unit}\` | ${formatMetricNumber(
          metric.baseline_value
        )} | ${formatMetricNumber(metric.target_value)} | \`${metric.direction}\` | \`${metric.data_source}\` | \`${metric.reporting_artifact}\` |`
      );
    }
  }

  const execution = payload.execution_snapshot || {};
  const kpiContract = execution.kpi_contract || {};
  const runtimeHandoff = execution.runtime_handoff || {};
  const gate = execution.completion_gate || {};

  return `# OpsPal Initiative ROI Instrumentation Layer

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
${payload.objective}

## Measurement Window
- Start: \`${payload.measurement_window?.start_date || 'unknown'}\`
- End: \`${payload.measurement_window?.end_date || 'unknown'}\`
- Cadence: \`${payload.measurement_window?.cadence || 'unknown'}\`

## Initiative Coverage

| Initiative | Linked Opportunity | Title | Owner | Risk | 90-Day Fit | Score |
|---|---|---|---|---|---|---:|
${initiativeRows || '| - | - | No initiatives | - | - | - | 0 |'}

## KPI Baseline and Target Registry

| Initiative | Metric ID | Metric | Unit | Baseline | Target | Direction | Data Source | Reporting Artifact |
|---|---|---|---|---:|---:|---|---|---|
${kpiRows.join('\n') || '| - | - | No metrics | - | 0 | 0 | - | - | - |'}

## Instrumentation Rules
- Each funded initiative must publish at least one KPI with explicit baseline and target.
- KPI updates should be published on the bi-weekly sprint cadence.
- Release validation remains blocked by \`npm run exec:validate\` when ROI artifacts are missing or malformed.

## Execution Readiness Snapshot
- KPI contract coverage: ${kpiContract.metrics_with_evidence || 0}/${kpiContract.metrics_total || 0} (ratio ${kpiContract.coverage_ratio || 0})
- Initiatives with metrics: ${kpiContract.initiatives_with_metrics || 0}/${kpiContract.initiatives_total || 0}
- Execution checklist detected: \`${runtimeHandoff.execution_checklist_detected ? 'yes' : 'no'}\`
- Execution checklist path: \`${runtimeHandoff.execution_checklist_path || 'not_detected'}\`
- Strategy dashboard payload detected: \`${runtimeHandoff.strategy_dashboard_payload_detected ? 'yes' : 'no'}\`
- Strategy dashboard payload path: \`${runtimeHandoff.strategy_dashboard_payload_path || 'reports/exec/strategy-dashboard-portfolio.json'}\`
- KPI contract ready: \`${gate.kpi_contract_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${gate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for phase-2 reporting: \`${gate.ready_for_phase2_reporting ? 'yes' : 'no'}\`
`;
}

function resolveCurrentMetricValue(metricId, context) {
  const {
    driftRows,
    unifiedNextBestActionQueue,
    aiMaturityScorecards,
    commandTelemetryAdoption,
  } = context;

  if (metricId === 'doc_drift_rows') {
    return normalizeMetricNumber(Array.isArray(driftRows) ? driftRows.length : 0);
  }

  if (metricId === 'approval_gated_recommendation_coverage') {
    const execution = unifiedNextBestActionQueue?.queue_execution_snapshot || {};
    const total = Number(execution.approval_required_items_total || 0);
    const approved = Number(execution.approval_required_items_approved || 0);
    return normalizeMetricNumber(total === 0 ? 0 : approved / total);
  }

  if (metricId === 'ranked_action_adoption_rate') {
    const execution = unifiedNextBestActionQueue?.queue_execution_snapshot || {};
    const total = Number(execution.queue_items_total || 0);
    const ready = Number(execution.queue_items_execution_ready_total || 0);
    return normalizeMetricNumber(total === 0 ? 0 : ready / total);
  }

  if (metricId === 'ai_enabled_ratio_lowest_three_plugins') {
    const targets = Array.isArray(aiMaturityScorecards?.target_plugins)
      ? aiMaturityScorecards.target_plugins
      : [];
    if (targets.length === 0) {
      return normalizeMetricNumber(0);
    }
    const total = targets.reduce(
      (acc, item) => acc + Number(item.current_ai_enabled_ratio || 0),
      0
    );
    return normalizeMetricNumber(total / targets.length);
  }

  if (metricId === 'telemetry_contract_coverage') {
    const baseline = commandTelemetryAdoption?.adoption_baseline || {};
    return normalizeMetricNumber(Number(baseline.adoption_ratio || 0));
  }

  return null;
}

function evaluateMetricDelta(metric, currentValue) {
  const baseline = normalizeMetricNumber(metric?.baseline_value);
  const target = normalizeMetricNumber(metric?.target_value);
  const direction = String(metric?.direction || 'up').toLowerCase();

  if (
    baseline == null ||
    target == null ||
    currentValue == null ||
    !['up', 'down'].includes(direction)
  ) {
    return {
      status: 'insufficient_data',
      target_met: false,
      delta_from_baseline: null,
      delta_to_target: null,
      progress_ratio: null,
    };
  }

  const deltaFromBaseline = normalizeMetricNumber(currentValue - baseline);
  const deltaToTarget = normalizeMetricNumber(target - currentValue);

  if (direction === 'up') {
    const targetMet = currentValue >= target - 0.0001;
    const improving = currentValue > baseline + 0.0001;
    const denominator = target - baseline;
    const ratio =
      denominator === 0
        ? targetMet
          ? 1
          : 0
        : (currentValue - baseline) / denominator;
    return {
      status: targetMet ? 'met' : improving ? 'progressing' : 'at_risk',
      target_met: targetMet,
      delta_from_baseline: deltaFromBaseline,
      delta_to_target: deltaToTarget,
      progress_ratio: normalizeMetricNumber(Math.max(0, Math.min(1, ratio))),
    };
  }

  const targetMet = currentValue <= target + 0.0001;
  const improving = currentValue < baseline - 0.0001;
  const denominator = baseline - target;
  const ratio =
    denominator === 0 ? (targetMet ? 1 : 0) : (baseline - currentValue) / denominator;

  return {
    status: targetMet ? 'met' : improving ? 'progressing' : 'at_risk',
    target_met: targetMet,
    delta_from_baseline: deltaFromBaseline,
    delta_to_target: deltaToTarget,
    progress_ratio: normalizeMetricNumber(Math.max(0, Math.min(1, ratio))),
  };
}

function buildSprint6ExecutiveReadoutPayload(input) {
  const {
    sourceFingerprint,
    opportunities,
    planProgressSnapshot,
    initiativeRoiInstrumentation,
    driftRows,
    unifiedNextBestActionQueue,
    aiMaturityScorecards,
    commandTelemetryAdoption,
  } = input;

  const opportunityById = Object.fromEntries(
    (opportunities || []).map((item) => [item.id, item])
  );
  const fundedMilestones = Array.isArray(planProgressSnapshot?.milestones)
    ? planProgressSnapshot.milestones
    : [];

  const fundedSummaryRows = fundedMilestones.map((milestone) => {
    const opportunity = opportunityById[milestone.opportunity_id] || {};
    return {
      opportunity_id: milestone.opportunity_id,
      title: milestone.title,
      owner_team: opportunity.owner_suggested || 'unassigned',
      overall_score: opportunity.overall_score || 0,
      status: milestone.status,
      evidence: milestone.evidence,
      completed: milestone.status === 'complete',
    };
  });
  const fundedTotal = fundedSummaryRows.length;
  const fundedComplete = fundedSummaryRows.filter((row) => row.completed).length;
  const fundedInProgress = fundedSummaryRows.filter(
    (row) => row.status === 'in_progress'
  ).length;
  const fundedPlanned = fundedSummaryRows.filter((row) => row.status === 'planned').length;
  const fundedCompletionRatio =
    fundedTotal === 0 ? 0 : normalizeMetricNumber(fundedComplete / fundedTotal);

  const kpiRows = [];
  for (const initiative of initiativeRoiInstrumentation?.initiatives || []) {
    for (const metric of initiative.metrics || []) {
      const currentValue = resolveCurrentMetricValue(metric.metric_id, {
        driftRows,
        unifiedNextBestActionQueue,
        aiMaturityScorecards,
        commandTelemetryAdoption,
      });
      const delta = evaluateMetricDelta(metric, currentValue);
      kpiRows.push({
        initiative_id: initiative.initiative_id,
        linked_opportunity_id: initiative.linked_opportunity_id,
        metric_id: metric.metric_id,
        metric_name: metric.metric_name,
        unit: metric.unit,
        direction: metric.direction,
        baseline_value: normalizeMetricNumber(metric.baseline_value),
        current_value: currentValue,
        target_value: normalizeMetricNumber(metric.target_value),
        status: delta.status,
        target_met: delta.target_met,
        delta_from_baseline: delta.delta_from_baseline,
        delta_to_target: delta.delta_to_target,
        progress_ratio: delta.progress_ratio,
        data_source: metric.data_source,
        reporting_artifact: metric.reporting_artifact,
      });
    }
  }

  const kpiTotal = kpiRows.length;
  const kpiMet = kpiRows.filter((row) => row.target_met).length;
  const kpiProgressing = kpiRows.filter((row) => row.status === 'progressing').length;
  const kpiAtRisk = kpiRows.filter((row) => row.status === 'at_risk').length;
  const kpiCoverageReady =
    kpiRows.length > 0 &&
    kpiRows.every((row) => typeof row.current_value === 'number' && Number.isFinite(row.current_value));
  const kpiMetRatio = kpiTotal === 0 ? 0 : normalizeMetricNumber(kpiMet / kpiTotal);

  const fundedIds = new Set(fundedSummaryRows.map((row) => row.opportunity_id));
  const phase2Recommendations = (unifiedNextBestActionQueue?.queue_items || [])
    .filter((item) => !fundedIds.has(item.opportunity_id))
    .slice(0, 5)
    .map((item) => {
      const opportunity = opportunityById[item.opportunity_id] || {};
      return {
        rank: item.rank,
        opportunity_id: item.opportunity_id,
        title: item.title,
        owner_team: item.owner_team,
        risk_class: item.risk_class,
        wave: item.wave,
        overall_score: item.overall_score,
        rationale:
          opportunity.problem_statement ||
          'Prioritized next-wave opportunity for phase-2 planning.',
      };
    });

  const phase2Ready = phase2Recommendations.length >= 3;
  const fundedCompleteReady = fundedTotal > 0 && fundedComplete === fundedTotal;
  const readyForExecutiveReview =
    fundedCompleteReady && kpiCoverageReady && phase2Ready;

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-011',
    title: 'Sprint 6 Executive Readout',
    objective:
      'Publish executive-ready adoption outcomes, KPI deltas, and phase-2 recommendation set for next-quarter planning.',
    measurement_window:
      initiativeRoiInstrumentation?.measurement_window || {
        start_date: toDateString(PLAN_START_DATE),
        end_date: toDateString(addDays(PLAN_START_DATE, 83)),
        cadence: 'bi-weekly',
      },
    funded_initiative_completion_summary: {
      total_initiatives: fundedTotal,
      completed_initiatives: fundedComplete,
      in_progress_initiatives: fundedInProgress,
      planned_initiatives: fundedPlanned,
      completion_ratio: fundedCompletionRatio,
      initiatives: fundedSummaryRows,
    },
    kpi_delta_summary: {
      total_metrics: kpiTotal,
      metrics_met_target: kpiMet,
      metrics_progressing: kpiProgressing,
      metrics_at_risk: kpiAtRisk,
      met_target_ratio: kpiMetRatio,
      metrics: kpiRows,
    },
    phase2_recommendations: phase2Recommendations,
    completion_gate: {
      funded_initiatives_complete: fundedCompleteReady,
      kpi_delta_coverage_ready: kpiCoverageReady,
      phase2_recommendations_ready: phase2Ready,
      ready_for_executive_review: readyForExecutiveReview,
    },
  };
}

function buildSprint6ExecutiveReadoutMarkdown(payload) {
  const funded = payload.funded_initiative_completion_summary || {};
  const kpi = payload.kpi_delta_summary || {};
  const gate = payload.completion_gate || {};

  const fundedRows = (funded.initiatives || [])
    .map(
      (row) =>
        `| \`${row.opportunity_id}\` | ${escapeMarkdown(row.title)} | \`${row.owner_team}\` | ${row.overall_score || 0} | \`${row.status}\` |`
    )
    .join('\n');

  const kpiRows = (kpi.metrics || [])
    .map(
      (row) =>
        `| \`${row.initiative_id}\` | \`${row.linked_opportunity_id}\` | \`${row.metric_id}\` | ${escapeMarkdown(
          row.metric_name
        )} | ${formatMetricNumber(row.baseline_value)} | ${formatMetricNumber(
          row.current_value
        )} | ${formatMetricNumber(row.target_value)} | \`${row.status}\` | \`${row.target_met ? 'yes' : 'no'}\` |`
    )
    .join('\n');

  const phase2Rows = (payload.phase2_recommendations || [])
    .map(
      (row) =>
        `| ${row.rank} | \`${row.opportunity_id}\` | ${escapeMarkdown(
          row.title
        )} | \`${row.owner_team}\` | \`${row.risk_class}\` | \`${row.wave}\` | ${row.overall_score} |`
    )
    .join('\n');

  return `# OpsPal Sprint 6 Executive Readout

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
${payload.objective}

## Measurement Window
- Start: \`${payload.measurement_window?.start_date || 'unknown'}\`
- End: \`${payload.measurement_window?.end_date || 'unknown'}\`
- Cadence: \`${payload.measurement_window?.cadence || 'unknown'}\`

## Funded Initiative Completion Summary
- Completed initiatives: ${funded.completed_initiatives || 0}/${funded.total_initiatives || 0}
- Completion ratio: ${formatMetricNumber(funded.completion_ratio)}

| Opportunity | Initiative | Owner | Score | Status |
|---|---|---|---:|---|
${fundedRows || '| - | No funded initiatives | - | 0 | - |'}

## KPI Delta Summary
- Metrics at target: ${kpi.metrics_met_target || 0}/${kpi.total_metrics || 0}
- Metrics progressing: ${kpi.metrics_progressing || 0}
- Metrics at risk: ${kpi.metrics_at_risk || 0}
- Target-met ratio: ${formatMetricNumber(kpi.met_target_ratio)}

| Initiative | Opportunity | Metric ID | Metric | Baseline | Current | Target | Status | Target Met |
|---|---|---|---|---:|---:|---:|---|---|
${kpiRows || '| - | - | - | No metrics | 0 | 0 | 0 | - | - |'}

## Phase-2 Recommendation Set

| Rank | Opportunity | Title | Owner | Risk | Wave | Score |
|---:|---|---|---|---|---|---:|
${phase2Rows || '| 1 | - | No recommendations | - | - | - | 0 |'}

## Executive Readiness Gate
- Funded initiatives complete: \`${gate.funded_initiatives_complete ? 'yes' : 'no'}\`
- KPI delta coverage ready: \`${gate.kpi_delta_coverage_ready ? 'yes' : 'no'}\`
- Phase-2 recommendations ready: \`${gate.phase2_recommendations_ready ? 'yes' : 'no'}\`
- Ready for executive review: \`${gate.ready_for_executive_review ? 'yes' : 'no'}\`
`;
}

function toFraction(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

function parseDateOrNull(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function toFixed2(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(2));
}

function unquoteScalar(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function getMarkdownFrontmatter(content) {
  const match = String(content || '').match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : '';
}

function readFrontmatterScalar(frontmatter, key) {
  const match = String(frontmatter || '').match(
    new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'im')
  );
  return match ? unquoteScalar(match[1]) : '';
}

function isCommandTelemetryFrontmatterEnabled(sourcePath) {
  if (!sourcePath) {
    return false;
  }

  const fullPath = path.join(ROOT, sourcePath);
  if (!fs.existsSync(fullPath)) {
    return false;
  }

  const frontmatter = getMarkdownFrontmatter(readText(fullPath));
  if (!frontmatter) {
    return false;
  }

  const contractVersion = normalizeText(
    readFrontmatterScalar(frontmatter, 'telemetry-contract')
  );
  const enabledValue = normalizeText(
    readFrontmatterScalar(frontmatter, 'telemetry-enabled')
  );

  return (
    contractVersion === COMMAND_TELEMETRY_CONTRACT_VERSION &&
    COMMAND_TELEMETRY_ENABLED_VALUE_SET.has(enabledValue)
  );
}

function buildMondayGraduationReadinessPayload(input) {
  const {
    catalog,
    pluginInventory,
    workflowMatrix,
    maturityMatrix,
    maturityRatios,
    sourceFingerprint,
  } = input;

  const focusPlugin = 'opspal-monday';
  const experimentalPlugins = pluginInventory
    .filter((plugin) => plugin.status === 'experimental')
    .map((plugin) => plugin.name);

  const mondayCatalog = (catalog.plugins || []).find((plugin) => plugin.name === focusPlugin);
  const mondayInventory = pluginInventory.find((plugin) => plugin.name === focusPlugin);
  const mondayWorkflow =
    workflowMatrix[focusPlugin] ||
    Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, 0]));
  const mondayMaturity =
    maturityMatrix[focusPlugin] ||
    Object.fromEntries(MATURITY_LEVELS.map((level) => [level, 0]));
  const mondayRatioEntry = (maturityRatios || []).find(
    (entry) => entry.plugin === focusPlugin
  );
  const aiEnabledRatio = toFraction(mondayRatioEntry?.ratio || 0, 0);

  const lastReviewedAt =
    mondayCatalog?.lastReviewedAt || mondayCatalog?.last_reviewed_at || '';
  const lastReviewedDate = parseDateOrNull(lastReviewedAt);
  const reviewAgeDays = lastReviewedDate
    ? Math.max(
        0,
        Math.floor(
          (PLAN_START_DATE.getTime() - lastReviewedDate.getTime()) / (24 * 60 * 60 * 1000)
        )
      )
    : null;
  const checklistFiles = getRuntimeChecklistFiles();
  const mondayExecutionChecklistFile = findExecutionChecklistByOpportunity(
    'OPP-006',
    checklistFiles
  );

  if (!mondayInventory || !mondayCatalog) {
    return {
      generated_at: sourceFingerprint,
      source_fingerprint: sourceFingerprint,
      source_opportunity_id: 'OPP-006',
      title: 'Monday Plugin Graduation Readiness',
      focus_plugin: focusPlugin,
      plugin_detected: false,
      readiness_status: 'plugin_missing',
      readiness_score: 0,
      experimental_plugins_in_suite: experimentalPlugins,
      plugin_snapshot: null,
      workflow_stage_coverage: mondayWorkflow,
      maturity_profile: {
        ...mondayMaturity,
        ai_enabled_ratio: toFixed2(aiEnabledRatio),
      },
      graduation_gates: [],
      blocking_gates: [
        {
          gate_id: 'plugin_detected',
          description: 'Focus plugin must exist in suite catalog.',
        },
      ],
      execution_snapshot: {
        gate_progress: {
          total_gates: 0,
          passing_gates: 0,
          failing_gates: 0,
        },
        runtime_handoff: {
          execution_checklist_detected: Boolean(mondayExecutionChecklistFile),
          execution_checklist_path: mondayExecutionChecklistFile
            ? `reports/exec/runtime/${mondayExecutionChecklistFile}`
            : null,
        },
        completion_gate: {
          readiness_contract_ready: false,
          blocker_reporting_ready: false,
          runtime_handoff_ready: Boolean(mondayExecutionChecklistFile),
          ready_for_phase2_execution: false,
        },
      },
      recommended_next_actions: [
        'Reconcile PLUGIN_SUITE_CATALOG generation to restore opspal-monday inventory.',
      ],
    };
  }

  const metadataComplete = Boolean(
    mondayInventory.status &&
      mondayInventory.owner &&
      mondayInventory.stability &&
      lastReviewedAt
  );
  const ownerAssigned = mondayInventory.owner !== 'unset';
  const commandSurfaceReady = Number(mondayInventory.commands || 0) >= 2;
  const aiCoverageReady = aiEnabledRatio >= 0.15;
  const executeCoverageReady = Number(mondayWorkflow.execute || 0) >= 1;
  const verifyCoverageReady = Number(mondayWorkflow.verify || 0) >= 1;
  const reviewFreshnessReady =
    typeof reviewAgeDays === 'number' ? reviewAgeDays <= 45 : false;

  const gates = [
    {
      gate_id: 'lifecycle_metadata_complete',
      description: 'Status, owner, stability, and last reviewed fields are populated.',
      threshold: 'all_present',
      current_value: metadataComplete ? 'complete' : 'incomplete',
      result: metadataComplete ? 'pass' : 'fail',
    },
    {
      gate_id: 'owner_assigned',
      description: 'Plugin owner is explicitly assigned for graduation accountability.',
      threshold: 'owner_not_unset',
      current_value: mondayInventory.owner,
      result: ownerAssigned ? 'pass' : 'fail',
    },
    {
      gate_id: 'command_surface_minimum',
      description: 'Plugin has at least 2 user-facing commands before graduation.',
      threshold: '>=2',
      current_value: Number(mondayInventory.commands || 0),
      result: commandSurfaceReady ? 'pass' : 'fail',
    },
    {
      gate_id: 'ai_enabled_ratio_minimum',
      description:
        'AI-enabled maturity ratio (llm_assisted + closed_loop_learning + autonomous_execution) meets minimum threshold.',
      threshold: '>=0.15',
      current_value: toFixed2(aiEnabledRatio),
      result: aiCoverageReady ? 'pass' : 'fail',
    },
    {
      gate_id: 'execute_stage_coverage',
      description: 'Workflow execute-stage coverage exists in plugin assets.',
      threshold: '>=1',
      current_value: Number(mondayWorkflow.execute || 0),
      result: executeCoverageReady ? 'pass' : 'fail',
    },
    {
      gate_id: 'verify_stage_coverage',
      description: 'Workflow verify-stage coverage exists in plugin assets.',
      threshold: '>=1',
      current_value: Number(mondayWorkflow.verify || 0),
      result: verifyCoverageReady ? 'pass' : 'fail',
    },
    {
      gate_id: 'review_recency',
      description: 'Lifecycle review is fresh within 45 days of plan baseline.',
      threshold: '<=45_days',
      current_value: reviewAgeDays == null ? 'unknown' : `${reviewAgeDays}_days`,
      result: reviewFreshnessReady ? 'pass' : 'fail',
    },
  ];

  const passingGateCount = gates.filter((gate) => gate.result === 'pass').length;
  const failingGateCount = gates.filter((gate) => gate.result === 'fail').length;
  const readinessScore = gates.length === 0 ? 0 : toFixed2(passingGateCount / gates.length);
  const blockingGates = gates
    .filter((gate) => gate.result === 'fail')
    .map((gate) => ({
      gate_id: gate.gate_id,
      description: gate.description,
      threshold: gate.threshold,
      current_value: gate.current_value,
    }));
  const readinessContractReady =
    gates.length > 0 && Number.isFinite(Number(readinessScore));
  const blockerReportingReady = blockingGates.length === failingGateCount;
  const runtimeHandoffReady = Boolean(mondayExecutionChecklistFile);

  const recommendedActions = [];
  if (!commandSurfaceReady) {
    recommendedActions.push(
      'Add at least one additional monday command with docs/validation to expand routable user-facing surface.'
    );
  }
  if (!aiCoverageReady) {
    recommendedActions.push(
      'Introduce at least one LLM-assisted or closed-loop capability in monday workflows to raise AI-enabled ratio above 0.15.'
    );
  }
  if (!verifyCoverageReady) {
    recommendedActions.push(
      'Add verify-stage checks (preflight/validation/test guardrails) for monday operations before graduation request.'
    );
  }
  if (!reviewFreshnessReady) {
    recommendedActions.push(
      'Refresh lifecycle review metadata and owner attestation before graduation promotion.'
    );
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push(
      'All graduation gates are passing. Prepare status promotion proposal from experimental to active.'
    );
  }

  const readinessStatus =
    !experimentalPlugins.includes(focusPlugin)
      ? 'already_graduated_or_reclassified'
      : blockingGates.length === 0
        ? 'ready_to_graduate'
        : 'needs_remediation';

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-006',
    title: 'Monday Plugin Graduation Readiness',
    focus_plugin: focusPlugin,
    plugin_detected: true,
    readiness_status: readinessStatus,
    readiness_score: readinessScore,
    experimental_plugins_in_suite: experimentalPlugins,
    plugin_snapshot: {
      status: mondayInventory.status,
      owner: mondayInventory.owner,
      stability: mondayInventory.stability,
      version: mondayInventory.version,
      last_reviewed_at: lastReviewedAt || 'unknown',
      agents: Number(mondayInventory.agents || 0),
      commands: Number(mondayInventory.commands || 0),
      skills: Number(mondayInventory.skills || 0),
      hooks: Number(mondayInventory.hooks || 0),
      scripts: Number(mondayInventory.scripts || 0),
      mandatory_agents: Number(mondayInventory.mandatoryAgents || 0),
    },
    workflow_stage_coverage: mondayWorkflow,
    maturity_profile: {
      ...mondayMaturity,
      ai_enabled_ratio: toFixed2(aiEnabledRatio),
    },
    graduation_gates: gates,
    blocking_gates: blockingGates,
    execution_snapshot: {
      gate_progress: {
        total_gates: gates.length,
        passing_gates: passingGateCount,
        failing_gates: failingGateCount,
      },
      runtime_handoff: {
        execution_checklist_detected: runtimeHandoffReady,
        execution_checklist_path: mondayExecutionChecklistFile
          ? `reports/exec/runtime/${mondayExecutionChecklistFile}`
          : null,
      },
      completion_gate: {
        readiness_contract_ready: readinessContractReady,
        blocker_reporting_ready: blockerReportingReady,
        runtime_handoff_ready: runtimeHandoffReady,
        ready_for_phase2_execution:
          readinessContractReady && blockerReportingReady && runtimeHandoffReady,
      },
    },
    recommended_next_actions: recommendedActions,
  };
}

function buildMondayGraduationReadinessMarkdown(payload) {
  const snapshot = payload.plugin_snapshot || {};
  const workflow = payload.workflow_stage_coverage || {};
  const maturity = payload.maturity_profile || {};
  const execution = payload.execution_snapshot || {};
  const gateProgress = execution.gate_progress || {};
  const runtimeHandoff = execution.runtime_handoff || {};
  const completionGate = execution.completion_gate || {};
  const gateRows = (payload.graduation_gates || [])
    .map(
      (gate) =>
        `| \`${gate.gate_id}\` | ${escapeMarkdown(gate.description)} | \`${gate.threshold}\` | \`${gate.current_value}\` | \`${gate.result}\` |`
    )
    .join('\n');
  const blockers = (payload.blocking_gates || [])
    .map(
      (gate) =>
        `- \`${gate.gate_id}\`: ${gate.description} (threshold \`${gate.threshold}\`, current \`${gate.current_value}\`)`
    )
    .join('\n');
  const nextActions = (payload.recommended_next_actions || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');

  if (!payload.plugin_detected) {
    return `# OpsPal Monday Graduation Readiness Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Readiness Status
- Focus plugin: \`${payload.focus_plugin}\`
- Plugin detected: \`no\`
- Status: \`${payload.readiness_status}\`

## Blocking Gaps
${blockers || '- Plugin detection failed; no additional gate output.'}

## Execution Snapshot
- Gate progress: ${gateProgress.passing_gates || 0}/${gateProgress.total_gates || 0} passing (failing: ${gateProgress.failing_gates || 0})
- Runtime checklist detected: \`${runtimeHandoff.execution_checklist_detected ? 'yes' : 'no'}\`
- Runtime checklist path: \`${runtimeHandoff.execution_checklist_path || 'not_detected'}\`
- Readiness contract ready: \`${completionGate.readiness_contract_ready ? 'yes' : 'no'}\`
- Blocker reporting ready: \`${completionGate.blocker_reporting_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${completionGate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for phase-2 execution: \`${completionGate.ready_for_phase2_execution ? 'yes' : 'no'}\`

## Recommended Next Steps
${nextActions || '1. Restore plugin inventory and rerun exec generation.'}
`;
  }

  return `# OpsPal Monday Graduation Readiness Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Readiness Status
- Focus plugin: \`${payload.focus_plugin}\`
- Status: \`${payload.readiness_status}\`
- Readiness score: \`${payload.readiness_score}\`
- Experimental plugins in suite: ${
    (payload.experimental_plugins_in_suite || []).length
  }

## Plugin Snapshot

| Status | Owner | Stability | Version | Last Reviewed |
|---|---|---|---|---|
| \`${snapshot.status || 'unknown'}\` | \`${snapshot.owner || 'unknown'}\` | \`${snapshot.stability || 'unknown'}\` | \`${snapshot.version || 'unknown'}\` | \`${snapshot.last_reviewed_at || 'unknown'}\` |

| Agents | Commands | Skills | Hooks | Scripts | Mandatory Agents |
|---:|---:|---:|---:|---:|---:|
| ${snapshot.agents || 0} | ${snapshot.commands || 0} | ${snapshot.skills || 0} | ${snapshot.hooks || 0} | ${snapshot.scripts || 0} | ${snapshot.mandatory_agents || 0} |

## Workflow and Maturity Coverage

| Detect | Diagnose | Recommend | Simulate | Execute | Verify | Learn |
|---:|---:|---:|---:|---:|---:|---:|
| ${workflow.detect || 0} | ${workflow.diagnose || 0} | ${workflow.recommend || 0} | ${workflow.simulate || 0} | ${workflow.execute || 0} | ${workflow.verify || 0} | ${workflow.learn || 0} |

| Rules-Based | LLM-Assisted | Closed-Loop | Autonomous | AI-Enabled Ratio |
|---:|---:|---:|---:|---:|
| ${maturity.rules_based || 0} | ${maturity.llm_assisted || 0} | ${maturity.closed_loop_learning || 0} | ${maturity.autonomous_execution || 0} | ${maturity.ai_enabled_ratio || 0} |

## Graduation Gate Scorecard

| Gate | Description | Threshold | Current Value | Result |
|---|---|---|---|---|
${gateRows || '| - | No gates generated | - | - | - |'}

## Blocking Gaps
${blockers || '- None. Graduation gates are currently passing.'}

## Execution Snapshot
- Gate progress: ${gateProgress.passing_gates || 0}/${gateProgress.total_gates || 0} passing (failing: ${gateProgress.failing_gates || 0})
- Runtime checklist detected: \`${runtimeHandoff.execution_checklist_detected ? 'yes' : 'no'}\`
- Runtime checklist path: \`${runtimeHandoff.execution_checklist_path || 'not_detected'}\`
- Readiness contract ready: \`${completionGate.readiness_contract_ready ? 'yes' : 'no'}\`
- Blocker reporting ready: \`${completionGate.blocker_reporting_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${completionGate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for phase-2 execution: \`${completionGate.ready_for_phase2_execution ? 'yes' : 'no'}\`

## Recommended Next Steps
${nextActions || '1. Continue standard governance monitoring and periodic review.'}
`;
}

function buildCrossModelConsultationExpansionPayload(input) {
  const { pluginInventory, workflowMatrix, maturityMatrix, sourceFingerprint } = input;
  const focusPlugin = 'opspal-ai-consult';

  const consultInventory = pluginInventory.find((plugin) => plugin.name === focusPlugin) || null;
  const consultWorkflow =
    workflowMatrix[focusPlugin] ||
    Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, 0]));

  const candidates = pluginInventory
    .filter(
      (plugin) =>
        plugin.name !== focusPlugin && plugin.status !== 'deprecated' && plugin.status !== 'experimental'
    )
    .map((plugin) => {
      const workflow =
        workflowMatrix[plugin.name] ||
        Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, 0]));
      const maturity =
        maturityMatrix[plugin.name] ||
        Object.fromEntries(MATURITY_LEVELS.map((level) => [level, 0]));
      const llmAssets =
        Number(maturity.llm_assisted || 0) +
        Number(maturity.closed_loop_learning || 0) +
        Number(maturity.autonomous_execution || 0);
      const integrationScore =
        Number(workflow.recommend || 0) * 0.4 +
        Number(workflow.diagnose || 0) * 0.2 +
        Number(plugin.commands || 0) * 0.2 +
        Number(llmAssets || 0) * 0.2;
      const priority =
        integrationScore >= 15 ? 'high' : integrationScore >= 8 ? 'medium' : 'low';
      const routeContracts = [];
      if (Number(workflow.diagnose || 0) > 0) {
        routeContracts.push('diagnostic-second-opinion');
      }
      if (Number(workflow.recommend || 0) > 0) {
        routeContracts.push('recommendation-reconciliation');
      }
      routeContracts.push('approval-gated-consultation');

      return {
        plugin: plugin.name,
        owner: plugin.owner,
        status: plugin.status,
        agents: Number(plugin.agents || 0),
        commands: Number(plugin.commands || 0),
        llm_assisted_assets: llmAssets,
        recommend_stage_assets: Number(workflow.recommend || 0),
        diagnose_stage_assets: Number(workflow.diagnose || 0),
        integration_score: toFixed2(integrationScore),
        integration_priority: priority,
        launch_wave: priority === 'high' ? 'wave_1' : 'wave_2',
        route_contracts: routeContracts,
      };
    })
    .sort((a, b) => {
      const delta = Number(b.integration_score) - Number(a.integration_score);
      if (Math.abs(delta) > 0.0001) {
        return delta;
      }
      return a.plugin.localeCompare(b.plugin);
    })
    .slice(0, 5);

  const rolloutPlan = [
    {
      phase: 'phase_1',
      scope: 'wave_1 consumer plugins',
      objective: 'Attach cross-model consultation to diagnosis/recommendation outputs in highest-value routes.',
      success_gate: '>=80% of wave_1 recommendations include consult summary with confidence.',
    },
    {
      phase: 'phase_2',
      scope: 'wave_2 consumer plugins',
      objective: 'Extend consultation contracts to medium-priority workflows with deterministic fallback.',
      success_gate: '>=60% of wave_2 recommendation routes are consultation-enabled.',
    },
    {
      phase: 'phase_3',
      scope: 'suite-wide governance',
      objective: 'Standardize consultation telemetry fields for executive rollups.',
      success_gate: 'Consultation override + acceptance metrics available in dashboard portfolio feed.',
    },
  ];
  const guardrails = [
    'Consultation output must include confidence and fallback rationale before promotion.',
    'Production-impacting recommendations remain approval-gated by risk class.',
    'Consultation telemetry should capture acceptance, override, and rework indicators.',
  ];
  const successKpis = [
    {
      metric_id: 'consultation_coverage_wave_1',
      baseline_value: 0,
      target_value: 0.8,
      unit: 'ratio',
    },
    {
      metric_id: 'consultation_coverage_wave_2',
      baseline_value: 0,
      target_value: 0.6,
      unit: 'ratio',
    },
    {
      metric_id: 'consultation_acceptance_rate',
      baseline_value: 0,
      target_value: 0.7,
      unit: 'ratio',
    },
  ];
  const checklistFiles = getRuntimeChecklistFiles();
  const executionChecklistFile = findExecutionChecklistByOpportunity(
    'OPP-008',
    checklistFiles
  );
  const packageContractReady =
    Boolean(consultInventory) &&
    candidates.length > 0 &&
    rolloutPlan.length > 0 &&
    guardrails.length > 0 &&
    successKpis.length > 0;
  const runtimeHandoffReady = Boolean(executionChecklistFile);

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-008',
    title: 'Cross-Model Consultation Expansion',
    focus_plugin: focusPlugin,
    consult_plugin_detected: Boolean(consultInventory),
    consult_plugin_snapshot: consultInventory
      ? {
          owner: consultInventory.owner,
          status: consultInventory.status,
          commands: Number(consultInventory.commands || 0),
          agents: Number(consultInventory.agents || 0),
          recommend_stage_assets: Number(consultWorkflow.recommend || 0),
        }
      : null,
    model_provider_baseline: [
      {
        provider: 'anthropic',
        role: 'primary_consultation_provider',
        mode: 'llm_assisted',
      },
      {
        provider: 'google',
        role: 'secondary_consultation_provider',
        mode: 'llm_assisted',
      },
    ],
    consumer_targets: candidates,
    rollout_plan: rolloutPlan,
    guardrails,
    success_kpis: successKpis,
    execution_snapshot: {
      adoption_baseline: {
        model_providers_total: 2,
        consumer_targets_total: candidates.length,
        high_priority_targets: candidates.filter(
          (target) => target.integration_priority === 'high'
        ).length,
      },
      rollout_readiness: {
        rollout_phases_total: rolloutPlan.length,
        guardrails_total: guardrails.length,
        success_kpis_total: successKpis.length,
      },
      runtime_handoff: {
        execution_checklist_detected: runtimeHandoffReady,
        execution_checklist_path: executionChecklistFile
          ? `reports/exec/runtime/${executionChecklistFile}`
          : null,
      },
      completion_gate: {
        package_contract_ready: packageContractReady,
        runtime_handoff_ready: runtimeHandoffReady,
        ready_for_phase2_execution: packageContractReady && runtimeHandoffReady,
      },
    },
  };
}

function buildCrossModelConsultationExpansionMarkdown(payload) {
  const consult = payload.consult_plugin_snapshot || {};
  const execution = payload.execution_snapshot || {};
  const adoption = execution.adoption_baseline || {};
  const rolloutReadiness = execution.rollout_readiness || {};
  const runtimeHandoff = execution.runtime_handoff || {};
  const gate = execution.completion_gate || {};
  const targetRows = (payload.consumer_targets || [])
    .map(
      (target, index) =>
        `| ${index + 1} | \`${target.plugin}\` | \`${target.owner}\` | ${target.commands} | ${target.agents} | ${target.recommend_stage_assets} | ${target.llm_assisted_assets} | ${target.integration_score} | \`${target.integration_priority}\` | \`${target.launch_wave}\` |`
    )
    .join('\n');
  const rolloutRows = (payload.rollout_plan || [])
    .map(
      (phase) =>
        `| \`${phase.phase}\` | ${escapeMarkdown(phase.scope)} | ${escapeMarkdown(
          phase.objective
        )} | ${escapeMarkdown(phase.success_gate)} |`
    )
    .join('\n');
  const guardrails = (payload.guardrails || [])
    .map((item) => `- ${item}`)
    .join('\n');
  const kpiRows = (payload.success_kpis || [])
    .map(
      (kpi) =>
        `| \`${kpi.metric_id}\` | ${formatMetricNumber(kpi.baseline_value)} | ${formatMetricNumber(
          kpi.target_value
        )} | \`${kpi.unit}\` |`
    )
    .join('\n');

  return `# OpsPal Cross-Model Consultation Expansion Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
Expand cross-model consultation beyond \`${payload.focus_plugin}\` by attaching standardized consultation contracts to high-value diagnose/recommend routes.

## Consultation Baseline
- Focus plugin detected: \`${payload.consult_plugin_detected ? 'yes' : 'no'}\`
- Focus plugin owner: \`${consult.owner || 'unknown'}\`
- Focus plugin status: \`${consult.status || 'unknown'}\`
- Focus plugin commands: ${consult.commands || 0}
- Focus plugin agents: ${consult.agents || 0}

## Consumer Target Prioritization

| Rank | Plugin | Owner | Commands | Agents | Recommend Assets | AI-Enabled Assets | Integration Score | Priority | Launch Wave |
|---:|---|---|---:|---:|---:|---:|---:|---|---|
${targetRows || '| 1 | - | - | 0 | 0 | 0 | 0 | 0 | - | - |'}

## Rollout Plan

| Phase | Scope | Objective | Success Gate |
|---|---|---|---|
${rolloutRows || '| - | - | - | - |'}

## Guardrails
${guardrails || '- No guardrails defined.'}

## Success KPI Baselines

| Metric | Baseline | Target | Unit |
|---|---:|---:|---|
${kpiRows || '| - | 0 | 0 | - |'}

## Execution Snapshot
- Consumer targets: ${adoption.consumer_targets_total || 0} (high priority: ${adoption.high_priority_targets || 0})
- Model providers: ${adoption.model_providers_total || 0}
- Rollout phases: ${rolloutReadiness.rollout_phases_total || 0}
- Guardrails: ${rolloutReadiness.guardrails_total || 0}
- Success KPIs: ${rolloutReadiness.success_kpis_total || 0}
- Runtime checklist detected: \`${runtimeHandoff.execution_checklist_detected ? 'yes' : 'no'}\`
- Runtime checklist path: \`${runtimeHandoff.execution_checklist_path || 'not_detected'}\`
- Package contract ready: \`${gate.package_contract_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${gate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for phase-2 execution: \`${gate.ready_for_phase2_execution ? 'yes' : 'no'}\`
`;
}

function buildForecastSimulationStandardizationPayload(input) {
  const { pluginInventory, workflowMatrix, sourceFingerprint } = input;
  const scopePlugins = ['opspal-gtm-planning', 'opspal-hubspot', 'opspal-core'];

  const pluginRows = scopePlugins.map((pluginName) => {
    const plugin = pluginInventory.find((item) => item.name === pluginName) || null;
    const workflow =
      workflowMatrix[pluginName] ||
      Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, 0]));
    return {
      plugin: pluginName,
      detected: Boolean(plugin),
      owner: plugin?.owner || 'unknown',
      status: plugin?.status || 'missing',
      commands: Number(plugin?.commands || 0),
      agents: Number(plugin?.agents || 0),
      simulate_assets: Number(workflow.simulate || 0),
      recommend_assets: Number(workflow.recommend || 0),
      execute_assets: Number(workflow.execute || 0),
      verify_assets: Number(workflow.verify || 0),
    };
  });

  const pluginsWithSimulation = pluginRows.filter((row) => row.simulate_assets > 0).length;
  const pluginsWithVerify = pluginRows.filter((row) => row.verify_assets > 0).length;
  const pluginsDetected = pluginRows.filter((row) => row.detected).length;
  const coverageRatio = toFixed2(
    pluginRows.length === 0 ? 0 : pluginsWithSimulation / pluginRows.length
  );

  const standardContract = {
    contract_id: 'opspal-forecast-simulation-v1',
    required_fields: [
      {
        name: 'scenario_id',
        type: 'string',
        required: true,
        description: 'Stable unique identifier for each scenario run.',
      },
      {
        name: 'scenario_horizon_days',
        type: 'number',
        required: true,
        description: 'Forecast horizon in days.',
      },
      {
        name: 'assumptions',
        type: 'array<string>',
        required: true,
        description: 'Explicit scenario assumptions used by model/rules engine.',
      },
      {
        name: 'confidence',
        type: 'number',
        required: true,
        description: 'Normalized confidence score in [0,1].',
      },
      {
        name: 'projected_delta',
        type: 'number',
        required: true,
        description: 'Expected positive/negative delta against baseline metric.',
      },
      {
        name: 'recommended_actions',
        type: 'array<object>',
        required: true,
        description: 'Ranked follow-up actions linked to scenario outcomes.',
      },
    ],
    confidence_bands: [
      { band: 'high', min: 0.8, max: 1.0, action: 'allow direct recommendation packaging' },
      {
        band: 'medium',
        min: 0.6,
        max: 0.79,
        action: 'require consultation + reviewer confirmation',
      },
      { band: 'low', min: 0, max: 0.59, action: 'fallback to deterministic baseline guidance' },
    ],
    output_artifacts: [
      'reports/exec/opspal-next-best-actions.json',
      'reports/exec/strategy-dashboard-portfolio.json',
    ],
  };

  const blockingGaps = [];
  for (const row of pluginRows) {
    if (!row.detected) {
      blockingGaps.push({
        gap_id: `${row.plugin}-missing`,
        description: `${row.plugin} missing from plugin inventory.`,
      });
      continue;
    }
    if (row.simulate_assets === 0) {
      blockingGaps.push({
        gap_id: `${row.plugin}-simulate-coverage`,
        description: `${row.plugin} has no simulate-stage asset coverage.`,
      });
    }
    if (row.verify_assets === 0) {
      blockingGaps.push({
        gap_id: `${row.plugin}-verify-coverage`,
        description: `${row.plugin} has no verify-stage guardrail coverage for scenarios.`,
      });
    }
  }

  const recommendations = [];
  if (pluginsWithSimulation < pluginRows.length) {
    recommendations.push(
      'Add at least one standardized simulate-stage command/agent path for each scope plugin.'
    );
  }
  if (blockingGaps.some((gap) => gap.gap_id.endsWith('verify-coverage'))) {
    recommendations.push(
      'Add verify-stage validation checkpoints to all forecast/simulation scenario outputs.'
    );
  }
  recommendations.push(
    'Adopt the shared forecast/simulation contract fields in dashboard and next-best-action outputs.'
  );

  const readinessStatus = blockingGaps.length === 0 ? 'standardization_ready' : 'needs_remediation';
  const checklistFiles = getRuntimeChecklistFiles();
  const executionChecklistFile = findExecutionChecklistByOpportunity(
    'OPP-010',
    checklistFiles
  );
  const packageContractReady =
    Array.isArray(standardContract.required_fields) &&
    standardContract.required_fields.length > 0 &&
    Array.isArray(standardContract.confidence_bands) &&
    standardContract.confidence_bands.length > 0 &&
    Array.isArray(standardContract.output_artifacts) &&
    standardContract.output_artifacts.length > 0;
  const runtimeHandoffReady = Boolean(executionChecklistFile);

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-010',
    title: 'Forecast and Simulation Standardization',
    scope_plugins: pluginRows,
    readiness_status: readinessStatus,
    simulation_coverage_ratio: coverageRatio,
    plugins_with_simulation: pluginsWithSimulation,
    plugins_with_verify: pluginsWithVerify,
    plugins_detected: pluginsDetected,
    plugins_in_scope: pluginRows.length,
    standard_contract: standardContract,
    blocking_gaps: blockingGaps,
    recommended_next_actions: recommendations,
    execution_snapshot: {
      contract_snapshot: {
        required_fields_total: standardContract.required_fields.length,
        confidence_bands_total: standardContract.confidence_bands.length,
        output_artifacts_total: standardContract.output_artifacts.length,
        output_artifacts: standardContract.output_artifacts,
      },
      scope_readiness: {
        plugins_in_scope: pluginRows.length,
        plugins_detected: pluginsDetected,
        plugins_with_simulation: pluginsWithSimulation,
        plugins_with_verify: pluginsWithVerify,
      },
      runtime_handoff: {
        execution_checklist_detected: runtimeHandoffReady,
        execution_checklist_path: executionChecklistFile
          ? `reports/exec/runtime/${executionChecklistFile}`
          : null,
      },
      completion_gate: {
        package_contract_ready: packageContractReady,
        runtime_handoff_ready: runtimeHandoffReady,
        ready_for_phase2_execution: packageContractReady && runtimeHandoffReady,
      },
    },
  };
}

function buildForecastSimulationStandardizationMarkdown(payload) {
  const execution = payload.execution_snapshot || {};
  const contractSnapshot = execution.contract_snapshot || {};
  const scopeReadiness = execution.scope_readiness || {};
  const runtimeHandoff = execution.runtime_handoff || {};
  const gate = execution.completion_gate || {};
  const scopeRows = (payload.scope_plugins || [])
    .map(
      (row) =>
        `| \`${row.plugin}\` | \`${row.owner}\` | \`${row.status}\` | ${row.commands} | ${row.agents} | ${row.simulate_assets} | ${row.verify_assets} | ${row.recommend_assets} |`
    )
    .join('\n');
  const contractRows = (payload.standard_contract?.required_fields || [])
    .map(
      (field) =>
        `| \`${field.name}\` | \`${field.type}\` | \`${field.required ? 'yes' : 'no'}\` | ${escapeMarkdown(
          field.description
        )} |`
    )
    .join('\n');
  const confidenceRows = (payload.standard_contract?.confidence_bands || [])
    .map(
      (band) =>
        `| \`${band.band}\` | ${band.min} | ${band.max} | ${escapeMarkdown(band.action)} |`
    )
    .join('\n');
  const blockers = (payload.blocking_gaps || [])
    .map((gap) => `- \`${gap.gap_id}\`: ${gap.description}`)
    .join('\n');
  const actions = (payload.recommended_next_actions || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');

  return `# OpsPal Forecast and Simulation Standardization Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
Standardize forecast and simulation outputs across GTM planning, HubSpot, and Core into one reusable scenario contract.

## Scope Coverage
- Readiness status: \`${payload.readiness_status}\`
- Scope plugins: ${payload.plugins_in_scope}
- Plugins with simulation coverage: ${payload.plugins_with_simulation}
- Simulation coverage ratio: ${payload.simulation_coverage_ratio}

| Plugin | Owner | Status | Commands | Agents | Simulate Assets | Verify Assets | Recommend Assets |
|---|---|---|---:|---:|---:|---:|---:|
${scopeRows || '| - | - | - | 0 | 0 | 0 | 0 | 0 |'}

## Standard Scenario Contract

| Field | Type | Required | Description |
|---|---|---|---|
${contractRows || '| - | - | - | - |'}

## Confidence Bands

| Band | Min | Max | Action |
|---|---:|---:|---|
${confidenceRows || '| - | 0 | 0 | - |'}

## Blocking Gaps
${blockers || '- None. Scope plugins meet current standardization gates.'}

## Recommended Next Steps
${actions || '1. Continue governance review and maintain contract adoption.'}

## Execution Snapshot
- Contract fields: ${contractSnapshot.required_fields_total || 0}
- Confidence bands: ${contractSnapshot.confidence_bands_total || 0}
- Output artifacts: ${contractSnapshot.output_artifacts_total || 0}
- Scope plugins detected: ${scopeReadiness.plugins_detected || 0}/${scopeReadiness.plugins_in_scope || payload.plugins_in_scope || 0}
- Plugins with simulation: ${scopeReadiness.plugins_with_simulation || payload.plugins_with_simulation || 0}
- Plugins with verify: ${scopeReadiness.plugins_with_verify || payload.plugins_with_verify || 0}
- Runtime checklist detected: \`${runtimeHandoff.execution_checklist_detected ? 'yes' : 'no'}\`
- Runtime checklist path: \`${runtimeHandoff.execution_checklist_path || 'not_detected'}\`
- Package contract ready: \`${gate.package_contract_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${gate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for phase-2 execution: \`${gate.ready_for_phase2_execution ? 'yes' : 'no'}\`
`;
}

function readApprovalQueueSnapshot() {
  const queuePath = path.join(ROOT, 'state', 'copilot-approval-queue.json');
  const queue = readJsonIfExists(queuePath);
  if (!queue || !Array.isArray(queue.requests)) {
    return {
      queue_file_present: false,
      queue_file: path.relative(ROOT, queuePath),
      total_requests: 0,
      by_status: { pending: 0, approved: 0, rejected: 0 },
      high_or_critical_pending: 0,
    };
  }

  const byStatus = { pending: 0, approved: 0, rejected: 0 };
  let highOrCriticalPending = 0;
  for (const request of queue.requests) {
    const status = request.status || 'pending';
    if (byStatus[status] == null) {
      byStatus[status] = 0;
    }
    byStatus[status] += 1;
    if (
      status === 'pending' &&
      ['high', 'critical'].includes(String(request.risk_class || ''))
    ) {
      highOrCriticalPending += 1;
    }
  }

  return {
    queue_file_present: true,
    queue_file: path.relative(ROOT, queuePath),
    total_requests: queue.requests.length,
    by_status: byStatus,
    high_or_critical_pending: highOrCriticalPending,
  };
}

function buildQueueExecutionSnapshot(input) {
  const { queueItems, dependencies } = input;
  const queuePath = path.join(ROOT, 'state', 'copilot-approval-queue.json');
  const queuePayload = readJsonIfExists(queuePath) || {};
  const requests = Array.isArray(queuePayload.requests) ? queuePayload.requests : [];
  const approvedPayload = readJsonIfExists(APPROVED_WORK_ITEMS_PATH) || {};
  const approvedItems = Array.isArray(approvedPayload.items) ? approvedPayload.items : [];
  const checklistFiles = fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];

  const toTimestamp = (value) => {
    const numeric = Date.parse(String(value || ''));
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const requestByTitle = new Map();
  for (const request of requests) {
    const key = normalizeText(request.title);
    if (!key) {
      continue;
    }
    const current = requestByTitle.get(key);
    if (!current) {
      requestByTitle.set(key, request);
      continue;
    }
    const currentTs = toTimestamp(current.updated_at || current.created_at);
    const candidateTs = toTimestamp(request.updated_at || request.created_at);
    if (candidateTs >= currentTs) {
      requestByTitle.set(key, request);
    }
  }

  const workItemByTitle = new Map();
  for (const item of approvedItems) {
    const key = normalizeText(item.title);
    if (!key) {
      continue;
    }
    const current = workItemByTitle.get(key);
    if (!current) {
      workItemByTitle.set(key, item);
      continue;
    }
    const currentReady = normalizeText(current.ready_state) === 'ready';
    const candidateReady = normalizeText(item.ready_state) === 'ready';
    if (candidateReady && !currentReady) {
      workItemByTitle.set(key, item);
      continue;
    }
    const currentTs = toTimestamp(current.updated_at || current.created_at);
    const candidateTs = toTimestamp(item.updated_at || item.created_at);
    if (candidateTs >= currentTs) {
      workItemByTitle.set(key, item);
    }
  }

  const hasChecklistForWorkItem = (workItemId) => {
    if (!workItemId) {
      return false;
    }
    const needle = String(workItemId).toLowerCase();
    return checklistFiles.some((name) => String(name).toLowerCase().includes(needle));
  };

  const hasChecklistForOpportunity = (opportunityId) => {
    const needle = String(opportunityId || '').toLowerCase();
    if (!needle) {
      return false;
    }
    return checklistFiles.some((name) => String(name).toLowerCase().includes(needle));
  };

  const queueItemExecution = (queueItems || []).map((item) => {
    const key = normalizeText(item.title);
    const request = requestByTitle.get(key) || null;
    const workItem = workItemByTitle.get(key) || null;
    const approvalRequired = ['high', 'critical'].includes(String(item.risk_class || ''));
    const approvalStatus = approvalRequired
      ? normalizeText(request?.status) || 'missing'
      : 'not_required';
    const workItemReady = normalizeText(workItem?.ready_state) === 'ready';
    const checklistDetected = workItem
      ? hasChecklistForWorkItem(workItem.work_item_id)
      : hasChecklistForOpportunity(item.opportunity_id);
    const executionReady = approvalRequired
      ? approvalStatus === 'approved' && workItemReady && checklistDetected
      : workItemReady || checklistDetected;

    return {
      rank: Number(item.rank || 0),
      opportunity_id: item.opportunity_id,
      title: item.title,
      risk_class: item.risk_class,
      approval_required: approvalRequired,
      approval_request_id: request?.request_id || null,
      approval_status: approvalStatus,
      ready_work_item_id: workItem?.work_item_id || null,
      ready_state: workItem?.ready_state || null,
      runtime_checklist_detected: checklistDetected,
      execution_ready: executionReady,
    };
  });

  const approvalRequiredRows = queueItemExecution.filter((row) => row.approval_required);
  const dependencyGates = (dependencies || []).map((dependency) => {
    const row = queueItemExecution.find(
      (item) => item.opportunity_id === dependency.from_opportunity_id
    );
    return {
      opportunity_id: dependency.from_opportunity_id,
      title: row?.title || 'unknown',
      execution_ready: Boolean(row?.execution_ready),
      approval_status: row?.approval_status || 'missing',
      ready_work_item_id: row?.ready_work_item_id || null,
      runtime_checklist_detected: Boolean(row?.runtime_checklist_detected),
    };
  });

  const focalRow = queueItemExecution.find((row) => row.opportunity_id === 'OPP-009') || null;
  const focalOpportunity = focalRow
    ? {
        opportunity_id: focalRow.opportunity_id,
        title: focalRow.title,
        execution_ready: focalRow.execution_ready,
        approval_status: focalRow.approval_status,
        ready_work_item_id: focalRow.ready_work_item_id,
        runtime_checklist_detected: focalRow.runtime_checklist_detected,
      }
    : {
        opportunity_id: 'OPP-009',
        title: 'Unified RevOps Next-Best-Action Layer',
        execution_ready: false,
        approval_status: 'missing',
        ready_work_item_id: null,
        runtime_checklist_detected: false,
      };

  return {
    approval_queue_file: path.relative(ROOT, queuePath),
    approval_queue_present: fs.existsSync(queuePath),
    approved_work_items_file: path.relative(ROOT, APPROVED_WORK_ITEMS_PATH),
    approved_work_items_present: fs.existsSync(APPROVED_WORK_ITEMS_PATH),
    runtime_checklist_files_detected: checklistFiles.length,
    queue_items_total: queueItemExecution.length,
    queue_items_execution_ready_total: queueItemExecution.filter(
      (row) => row.execution_ready
    ).length,
    approval_required_items_total: approvalRequiredRows.length,
    approval_required_items_approved: approvalRequiredRows.filter(
      (row) => row.approval_status === 'approved'
    ).length,
    approval_required_items_ready_work_item: approvalRequiredRows.filter(
      (row) => normalizeText(row.ready_state) === 'ready'
    ).length,
    approval_required_items_checklist_ready: approvalRequiredRows.filter(
      (row) => row.runtime_checklist_detected
    ).length,
    approval_required_items_execution_ready: approvalRequiredRows.filter(
      (row) => row.execution_ready
    ).length,
    dependency_gates: dependencyGates,
    focal_opportunity: focalOpportunity,
    queue_item_execution: queueItemExecution,
  };
}

function buildMandatoryRouteApprovalGovernancePayload(input) {
  const { pluginInventory, opportunities, sourceFingerprint } = input;

  const mandatoryPlugins = pluginInventory
    .filter((plugin) => plugin.status !== 'deprecated' && Number(plugin.mandatoryAgents || 0) > 0)
    .map((plugin) => ({
      plugin: plugin.name,
      owner: plugin.owner,
      status: plugin.status,
      mandatory_agents: Number(plugin.mandatoryAgents || 0),
      commands: Number(plugin.commands || 0),
    }))
    .sort(
      (a, b) =>
        b.mandatory_agents - a.mandatory_agents ||
        b.commands - a.commands ||
        a.plugin.localeCompare(b.plugin)
    );

  const mandatoryPluginNames = new Set(mandatoryPlugins.map((item) => item.plugin));
  const governedOpportunities = opportunities
    .map((opportunity) => {
      const scopePlugins = parsePluginScope(opportunity.plugin_scope);
      const inMandatoryScope =
        scopePlugins.includes('suite-wide') ||
        scopePlugins.some((name) => mandatoryPluginNames.has(name));
      const riskClass = deriveOpportunityRiskClass(opportunity);
      const policy = approvalPolicyForRiskClass(riskClass);
      return {
        opportunity_id: opportunity.id,
        title: opportunity.title,
        plugin_scope: opportunity.plugin_scope,
        in_mandatory_scope: inMandatoryScope,
        risk_class: riskClass,
        required_approver_count: policy.required_approver_count,
        required_roles: policy.required_roles,
        approval_required: ['high', 'critical'].includes(riskClass),
      };
    })
    .filter((item) => item.in_mandatory_scope)
    .sort(
      (a, b) =>
        Number(b.required_approver_count) - Number(a.required_approver_count) ||
        a.opportunity_id.localeCompare(b.opportunity_id)
    );

  const queueSnapshot = readApprovalQueueSnapshot();
  const policyMatrix = ['low', 'medium', 'high', 'critical'].map((riskClass) => {
    const policy = approvalPolicyForRiskClass(riskClass);
    return {
      risk_class: riskClass,
      required_approver_count: policy.required_approver_count,
      required_roles: policy.required_roles,
    };
  });

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-003',
    title: 'Copilot Approval Queue for Mandatory Route Outputs',
    mandatory_route_plugins: mandatoryPlugins,
    governed_opportunities: governedOpportunities,
    approval_policy_matrix: policyMatrix,
    queue_snapshot: queueSnapshot,
    release_gate: {
      gate_id: 'mandatory-route-approval-governance',
      status:
        governedOpportunities.filter((item) => item.approval_required).length > 0
          ? 'active'
          : 'review',
      criteria: [
        'High/critical recommendations in mandatory-route scope require explicit approval.',
        'Approval queue state remains append-only with auditable decision log.',
        'Approved requests are promoted via runtime work-item exports.',
      ],
    },
    controls: [
      'Use risk-based approver role requirements before status transition to approved.',
      'Keep queue state in `state/copilot-approval-queue.json` and decision log in append-only NDJSON.',
      'Run `npm run next-actions:promote` after approval decisions to refresh runtime handoff exports.',
    ],
  };
}

function buildMandatoryRouteApprovalGovernanceMarkdown(payload) {
  const pluginRows = (payload.mandatory_route_plugins || [])
    .map(
      (row) =>
        `| \`${row.plugin}\` | \`${row.owner}\` | \`${row.status}\` | ${row.mandatory_agents} | ${row.commands} |`
    )
    .join('\n');
  const governedRows = (payload.governed_opportunities || [])
    .map(
      (row) =>
        `| \`${row.opportunity_id}\` | ${escapeMarkdown(row.title)} | \`${row.risk_class}\` | ${row.required_approver_count} | \`${row.required_roles.join(', ')}\` | \`${row.approval_required ? 'yes' : 'no'}\` |`
    )
    .join('\n');
  const policyRows = (payload.approval_policy_matrix || [])
    .map(
      (row) =>
        `| \`${row.risk_class}\` | ${row.required_approver_count} | \`${row.required_roles.join(', ')}\` |`
    )
    .join('\n');
  const controls = (payload.controls || []).map((item) => `- ${item}`).join('\n');
  const queue = payload.queue_snapshot || {};

  return `# OpsPal Mandatory Route Approval Governance Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
Enforce explicit approval governance for production-impacting recommendations in mandatory-route plugin scope.

## Mandatory Route Plugin Inventory

| Plugin | Owner | Status | Mandatory Agents | Commands |
|---|---|---|---:|---:|
${pluginRows || '| - | - | - | 0 | 0 |'}

## Governed Opportunity Coverage

| Opportunity | Title | Risk | Required Approvals | Required Roles | Approval Required |
|---|---|---|---:|---|---|
${governedRows || '| - | No governed opportunities | - | 0 | - | - |'}

## Risk-to-Approval Policy

| Risk Class | Required Approvers | Required Roles |
|---|---:|---|
${policyRows || '| - | 0 | - |'}

## Queue Snapshot
- Queue file present: \`${queue.queue_file_present ? 'yes' : 'no'}\`
- Queue file: \`${queue.queue_file || 'state/copilot-approval-queue.json'}\`
- Total requests: ${queue.total_requests || 0}
- Pending: ${(queue.by_status && queue.by_status.pending) || 0}
- Approved: ${(queue.by_status && queue.by_status.approved) || 0}
- Rejected: ${(queue.by_status && queue.by_status.rejected) || 0}
- Pending high/critical: ${queue.high_or_critical_pending || 0}

## Operational Controls
${controls || '- No controls defined.'}
`;
}

function buildUnifiedNextBestActionQueuePayload(input) {
  const { opportunities, sourceFingerprint } = input;
  const queueItems = opportunities
    .map((row, index) => {
      const riskClass = deriveOpportunityRiskClass(row);
      const wave = index < 3 ? 'wave_1' : index < 7 ? 'wave_2' : 'wave_3';
      return {
        rank: index + 1,
        opportunity_id: row.id,
        action_id: `nba-${String(row.id || '').toLowerCase()}`,
        title: row.title,
        category: row.category,
        owner_team: row.owner_suggested,
        risk_class: riskClass,
        overall_score: row.overall_score,
        ninety_day_fit: row.ninety_day_fit,
        wave,
      };
    })
    .sort((a, b) => a.rank - b.rank);

  const ownerRollupMap = new Map();
  const riskRollup = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const item of queueItems) {
    ownerRollupMap.set(item.owner_team, (ownerRollupMap.get(item.owner_team) || 0) + 1);
    riskRollup[item.risk_class] = (riskRollup[item.risk_class] || 0) + 1;
  }
  const ownerRollup = Array.from(ownerRollupMap.entries())
    .map(([owner_team, item_count]) => ({ owner_team, item_count }))
    .sort((a, b) => b.item_count - a.item_count || a.owner_team.localeCompare(b.owner_team));

  const dependencies = [
    {
      from_opportunity_id: 'OPP-003',
      to_opportunity_id: 'OPP-009',
      rationale: 'Approval governance should be active before broad recommendation automation.',
    },
    {
      from_opportunity_id: 'OPP-004',
      to_opportunity_id: 'OPP-009',
      rationale: 'Telemetry contract should be in place for action outcome observability.',
    },
  ];
  const queueExecutionSnapshot = buildQueueExecutionSnapshot({
    queueItems,
    dependencies,
  });

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-009',
    title: 'Unified RevOps Next-Best-Action Layer',
    queue_items: queueItems,
    owner_rollup: ownerRollup,
    risk_rollup: riskRollup,
    dependencies,
    queue_execution_snapshot: queueExecutionSnapshot,
    sla_targets: [
      { risk_class: 'critical', approve_or_decide_within_hours: 24 },
      { risk_class: 'high', approve_or_decide_within_hours: 48 },
      { risk_class: 'medium', approve_or_decide_within_hours: 120 },
      { risk_class: 'low', approve_or_decide_within_hours: 168 },
    ],
  };
}

function buildUnifiedNextBestActionQueueMarkdown(payload) {
  const queueRows = (payload.queue_items || [])
    .map(
      (item) =>
        `| ${item.rank} | \`${item.opportunity_id}\` | ${escapeMarkdown(item.title)} | \`${item.category}\` | \`${item.risk_class}\` | ${item.overall_score} | \`${item.owner_team}\` | \`${item.wave}\` |`
    )
    .join('\n');
  const ownerRows = (payload.owner_rollup || [])
    .map((row) => `| \`${row.owner_team}\` | ${row.item_count} |`)
    .join('\n');
  const dependencyRows = (payload.dependencies || [])
    .map(
      (row) =>
        `| \`${row.from_opportunity_id}\` | \`${row.to_opportunity_id}\` | ${escapeMarkdown(
          row.rationale
        )} |`
    )
    .join('\n');
  const slaRows = (payload.sla_targets || [])
    .map(
      (row) =>
        `| \`${row.risk_class}\` | ${row.approve_or_decide_within_hours} |`
    )
    .join('\n');
  const risk = payload.risk_rollup || {};
  const execution = payload.queue_execution_snapshot || {};
  const executionRows = (execution.queue_item_execution || [])
    .filter((row) => row.approval_required)
    .map(
      (row) =>
        `| \`${row.opportunity_id}\` | \`${row.approval_status}\` | \`${row.ready_work_item_id || 'none'}\` | \`${row.runtime_checklist_detected ? 'yes' : 'no'}\` | \`${row.execution_ready ? 'yes' : 'no'}\` |`
    )
    .join('\n');
  const focal = execution.focal_opportunity || {};
  const dependencyReadyCount = Array.isArray(execution.dependency_gates)
    ? execution.dependency_gates.filter((gate) => gate.execution_ready).length
    : 0;
  const dependencyTotal = Array.isArray(execution.dependency_gates)
    ? execution.dependency_gates.length
    : 0;

  return `# OpsPal Unified Next-Best-Action Queue Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
Provide a unified cross-plugin remediation queue with wave planning, ownership rollups, and explicit governance dependencies.

## Ranked Queue

| Rank | Opportunity | Title | Category | Risk | Score | Owner | Wave |
|---:|---|---|---|---|---:|---|---|
${queueRows || '| 1 | - | No items | - | - | 0 | - | - |'}

## Owner Rollup

| Owner Team | Queue Items |
|---|---:|
${ownerRows || '| - | 0 |'}

## Risk Rollup
- Critical: ${risk.critical || 0}
- High: ${risk.high || 0}
- Medium: ${risk.medium || 0}
- Low: ${risk.low || 0}

## Dependency Map

| From | To | Rationale |
|---|---|---|
${dependencyRows || '| - | - | - |'}

## Current Queue Execution
- Approval queue present: \`${execution.approval_queue_present ? 'yes' : 'no'}\` (\`${execution.approval_queue_file || 'state/copilot-approval-queue.json'}\`)
- Approved work-item export present: \`${execution.approved_work_items_present ? 'yes' : 'no'}\` (\`${execution.approved_work_items_file || 'reports/exec/runtime/opspal-approved-work-items.json'}\`)
- Approval-required items execution-ready: ${execution.approval_required_items_execution_ready || 0}/${execution.approval_required_items_total || 0}
- Focal opportunity \`OPP-009\` execution-ready: \`${focal.execution_ready ? 'yes' : 'no'}\` (approval: \`${focal.approval_status || 'missing'}\`, work item: \`${focal.ready_work_item_id || 'none'}\`, checklist: \`${focal.runtime_checklist_detected ? 'yes' : 'no'}\`)
- Dependency gates ready: ${dependencyReadyCount}/${dependencyTotal}

| Opportunity | Approval Status | Ready Work Item | Runtime Checklist | Execution Ready |
|---|---|---|---|---|
${executionRows || '| - | - | - | - | - |'}

## Decision SLA Targets

| Risk Class | Decide Within (Hours) |
|---|---:|
${slaRows || '| - | 0 |'}
`;
}

function buildCommandTelemetryAdoptionPayload(input) {
  const { catalog, pluginInventory, sourceFingerprint } = input;
  const activePlugins = pluginInventory
    .filter((plugin) => plugin.status === 'active')
    .sort((a, b) => b.commands - a.commands || a.name.localeCompare(b.name));

  const pilotPlugins = activePlugins.slice(0, 5);
  const pilotCommandSamples = [];
  for (const plugin of pilotPlugins) {
    const catalogPlugin = (catalog.plugins || []).find((entry) => entry.name === plugin.name);
    const commands = (catalogPlugin?.commands || []).slice(0, 3);
    for (const command of commands) {
      const sourcePath = command.sourcePath || command.file || 'unknown';
      const instrumented = isCommandTelemetryFrontmatterEnabled(sourcePath);
      pilotCommandSamples.push({
        plugin: plugin.name,
        command: command.name || 'unknown-command',
        source_path: sourcePath,
        telemetry_status: instrumented ? 'instrumented' : 'not_instrumented',
      });
    }
  }

  const targetCount = pilotCommandSamples.length;
  const enabledCount = pilotCommandSamples.filter(
    (row) => row.telemetry_status === 'instrumented'
  ).length;
  const adoptionRatio = targetCount === 0 ? 0 : enabledCount / targetCount;

  const controlPlaneCommandSamples = [
    {
      command: 'copilot:approval',
      source_path: 'scripts/copilot-approval-queue.js',
      source_plugin: 'opspal-core',
    },
    {
      command: 'next-actions:generate',
      source_path: 'scripts/generate-next-best-actions.js',
      source_plugin: 'opspal-core',
    },
    {
      command: 'next-actions:promote',
      source_path: 'scripts/promote-approved-actions.js',
      source_plugin: 'opspal-core',
    },
    {
      command: 'exec:generate',
      source_path: 'scripts/generate-exec-gap-analysis.js',
      source_plugin: 'opspal-core',
    },
    {
      command: 'exec:validate',
      source_path: 'scripts/validate-exec-gap-analysis.js',
      source_plugin: 'opspal-core',
    },
  ].map((row) => {
    const fullPath = path.join(ROOT, row.source_path);
    const scriptBody = fs.existsSync(fullPath) ? readText(fullPath) : '';
    const hasTelemetryRequire =
      /const\s+\{[^}]*emitCommandTelemetry[^}]*\}\s*=\s*require\(['"]\.\/lib\/command-telemetry['"]\)/.test(
        scriptBody
      );
    const hasTelemetryEmit = scriptBody.includes('emitCommandTelemetry(');
    const instrumented = hasTelemetryRequire && hasTelemetryEmit;
    return {
      ...row,
      telemetry_status: instrumented ? 'instrumented' : 'not_instrumented',
    };
  });

  const controlTargetCount = controlPlaneCommandSamples.length;
  const controlEnabledCount = controlPlaneCommandSamples.filter(
    (row) => row.telemetry_status === 'instrumented'
  ).length;
  const controlAdoptionRatio =
    controlTargetCount === 0 ? 0 : controlEnabledCount / controlTargetCount;

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-004',
    title: 'Cross-Plugin Command Telemetry Contract',
    telemetry_contract_fields: [
      'timestamp',
      'command',
      'agent',
      'outcome',
      'time_saved_estimate_minutes',
      'human_override',
      'rework_required',
      'risk_class',
      'source_plugin',
    ],
    pilot_scope_plugins: pilotPlugins.map((plugin) => ({
      plugin: plugin.name,
      owner: plugin.owner,
      commands: plugin.commands,
    })),
    pilot_instrumentation_markers: {
      telemetry_contract: COMMAND_TELEMETRY_CONTRACT_VERSION,
      telemetry_enabled_values: COMMAND_TELEMETRY_ENABLED_VALUES,
    },
    pilot_command_samples: pilotCommandSamples,
    adoption_baseline: {
      telemetry_enabled_commands: enabledCount,
      pilot_commands_total: targetCount,
      adoption_ratio: toFixed2(adoptionRatio),
      target_ratio: 0.8,
    },
    control_plane_command_samples: controlPlaneCommandSamples,
    control_plane_adoption_baseline: {
      telemetry_enabled_commands: controlEnabledCount,
      pilot_commands_total: controlTargetCount,
      adoption_ratio: toFixed2(controlAdoptionRatio),
      target_ratio: 1,
    },
    rollout_phases: [
      {
        phase: 'phase_1',
        scope: 'Top-volume pilot commands',
        target_ratio: 0.4,
      },
      {
        phase: 'phase_2',
        scope: 'All pilot commands',
        target_ratio: 0.8,
      },
      {
        phase: 'phase_3',
        scope: 'Suite-wide command coverage',
        target_ratio: 0.9,
      },
    ],
  };
}

function buildCommandTelemetryAdoptionMarkdown(payload) {
  const pluginRows = (payload.pilot_scope_plugins || [])
    .map((row) => `| \`${row.plugin}\` | \`${row.owner}\` | ${row.commands} |`)
    .join('\n');
  const commandRows = (payload.pilot_command_samples || [])
    .map(
      (row) =>
        `| \`${row.plugin}\` | \`${row.command}\` | \`${row.telemetry_status}\` | \`${row.source_path}\` |`
    )
    .join('\n');
  const markerPolicy = payload.pilot_instrumentation_markers || {};
  const enabledValues = Array.isArray(markerPolicy.telemetry_enabled_values)
    ? markerPolicy.telemetry_enabled_values
        .map((value) => `\`${value}\``)
        .join(', ')
    : '';
  const phaseRows = (payload.rollout_phases || [])
    .map(
      (row) =>
        `| \`${row.phase}\` | ${escapeMarkdown(row.scope)} | ${row.target_ratio} |`
    )
    .join('\n');
  const baseline = payload.adoption_baseline || {};
  const controlRows = (payload.control_plane_command_samples || [])
    .map(
      (row) =>
        `| \`${row.command}\` | \`${row.telemetry_status}\` | \`${row.source_plugin}\` | \`${row.source_path}\` |`
    )
    .join('\n');
  const controlBaseline = payload.control_plane_adoption_baseline || {};

  return `# OpsPal Command Telemetry Adoption Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
Operationalize the command telemetry contract across a high-volume pilot command set and track adoption progress.

## Telemetry Contract Fields
${(payload.telemetry_contract_fields || []).map((field) => `- \`${field}\``).join('\n')}

## Pilot Instrumentation Markers
- \`telemetry-contract\`: \`${markerPolicy.telemetry_contract || COMMAND_TELEMETRY_CONTRACT_VERSION}\`
- \`telemetry-enabled\`: ${enabledValues || '`true`'}

## Pilot Scope Plugins

| Plugin | Owner | Commands |
|---|---|---:|
${pluginRows || '| - | - | 0 |'}

## Pilot Command Samples

| Plugin | Command | Telemetry Status | Source Path |
|---|---|---|---|
${commandRows || '| - | - | - | - |'}

## Adoption Baseline
- Pilot commands total: ${baseline.pilot_commands_total || 0}
- Telemetry enabled commands: ${baseline.telemetry_enabled_commands || 0}
- Current adoption ratio: ${baseline.adoption_ratio || 0}
- Target adoption ratio: ${baseline.target_ratio || 0}

## Control-Plane Command Adoption Baseline

| Command | Telemetry Status | Source Plugin | Source Path |
|---|---|---|---|
${controlRows || '| - | - | - | - |'}

- Control-plane commands total: ${controlBaseline.pilot_commands_total || 0}
- Telemetry enabled commands: ${controlBaseline.telemetry_enabled_commands || 0}
- Current adoption ratio: ${controlBaseline.adoption_ratio || 0}
- Target adoption ratio: ${controlBaseline.target_ratio || 0}

## Rollout Phases

| Phase | Scope | Target Ratio |
|---|---|---:|
${phaseRows || '| - | - | 0 |'}
`;
}

function collectManualReviewHotspots(catalog, pluginNames) {
  const keywords = [
    'manual review',
    'human review',
    'approval',
    'triage',
    'escalat',
    'needs review',
  ];
  const hotspots = [];

  for (const pluginName of pluginNames) {
    const plugin = (catalog.plugins || []).find((item) => item.name === pluginName);
    if (!plugin) {
      continue;
    }
    const assets = [];
    const add = (type, items) => {
      for (const item of items || []) {
        const text = normalizeText(
          [
            item.name,
            item.description,
            item.frontmatter && item.frontmatter.description,
            item.file,
            item.sourcePath,
          ]
            .filter(Boolean)
            .join(' ')
        );
        assets.push({
          plugin: plugin.name,
          type,
          name: item.name || item.file || 'unknown',
          source_path: item.sourcePath || item.file || 'unknown',
          text,
        });
      }
    };
    add('agent', plugin.agents);
    add('command', plugin.commands);
    add('skill', plugin.skills);
    add('hook', plugin.hooks);
    add('script', plugin.scripts);

    for (const asset of assets) {
      const matchedKeywords = keywords.filter((keyword) => asset.text.includes(keyword));
      if (matchedKeywords.length === 0) {
        continue;
      }
      const weight = ['agent', 'command'].includes(asset.type) ? 2 : 1;
      hotspots.push({
        plugin: asset.plugin,
        type: asset.type,
        name: asset.name,
        source_path: asset.source_path,
        matched_keywords: matchedKeywords,
        hotspot_score: matchedKeywords.length * weight,
      });
    }
  }

  return hotspots.sort(
    (a, b) =>
      b.hotspot_score - a.hotspot_score ||
      a.plugin.localeCompare(b.plugin) ||
      a.name.localeCompare(b.name)
  );
}

function buildManualReviewReductionPayload(input) {
  const { catalog, sourceFingerprint } = input;
  const focusPlugins = ['opspal-core', 'opspal-hubspot', 'opspal-salesforce'];
  const hotspots = collectManualReviewHotspots(catalog, focusPlugins).slice(0, 25);

  const hotspotRollupMap = new Map();
  for (const hotspot of hotspots) {
    hotspotRollupMap.set(hotspot.plugin, (hotspotRollupMap.get(hotspot.plugin) || 0) + 1);
  }
  const hotspot_rollup = focusPlugins.map((plugin) => ({
    plugin,
    hotspot_count: hotspotRollupMap.get(plugin) || 0,
  }));

  const baselineIndex = hotspots.length;
  const targetIndex = Math.max(0, Math.floor(baselineIndex * 0.65));

  const triageEvents = readNdjsonIfExists(NEXT_ACTION_TRIAGE_TELEMETRY_PATH).filter(
    (event) =>
      event &&
      typeof event === 'object' &&
      String(event.command || '') === 'next-actions:generate'
  );
  const latestTriageEvent =
    triageEvents.length > 0 ? triageEvents[triageEvents.length - 1] : null;
  const latestDistribution = latestTriageEvent?.triage_distribution || {};
  const latestPolicy = latestTriageEvent?.triage_policy || {};
  const latestTotalActions = Number(latestDistribution.total_actions || 0);
  const latestAutoRoute = Number(latestDistribution.auto_route || 0);
  const latestAssistedReview = Number(latestDistribution.assisted_review || 0);
  const latestManualReview = Number(latestDistribution.manual_review || 0);
  const distributionConsistent =
    latestTotalActions > 0 &&
    latestAutoRoute + latestAssistedReview + latestManualReview === latestTotalActions;

  const approvedPayload = readJsonIfExists(APPROVED_WORK_ITEMS_PATH) || {};
  const approvedItems = Array.isArray(approvedPayload.items)
    ? approvedPayload.items
    : [];
  const checklistFiles = fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];
  const manualReviewWorkItems = approvedItems.filter((item) => {
    const title = String(item.title || '')
      .toLowerCase()
      .trim();
    return title === 'manual review load reduction in dedup and routing';
  });
  const readyWorkItem =
    manualReviewWorkItems.find(
      (item) => String(item.ready_state || '').toLowerCase() === 'ready'
    ) || manualReviewWorkItems[0] || null;
  const readyWorkItemId = readyWorkItem ? String(readyWorkItem.work_item_id || '') : '';
  const readyStateRaw = readyWorkItem
    ? String(readyWorkItem.ready_state || '').toLowerCase()
    : '';
  const readyState = readyWorkItem
    ? readyStateRaw === 'ready'
      ? 'ready'
      : 'blocked'
    : 'missing';
  const requestId = readyWorkItemId.startsWith('wi-')
    ? readyWorkItemId.slice('wi-'.length)
    : '';
  const executionChecklistFile = requestId
    ? findRuntimeChecklist(checklistFiles, [requestId, 'execution-checklist']) ||
      findRuntimeChecklist(checklistFiles, [requestId, 'implementation-checklist'])
    : null;
  const shadowTriageChecklistFile = requestId
    ? findRuntimeChecklist(checklistFiles, [requestId, 'phase3-shadow-triage-checklist']) ||
      findRuntimeChecklist(checklistFiles, [requestId, 'shadow-triage'])
    : null;
  const triageShadowModeReady =
    Boolean(latestTriageEvent) &&
    Boolean(latestTriageEvent?.triage_shadow_mode) &&
    distributionConsistent;
  const runtimeHandoffReady = readyState === 'ready' && Boolean(shadowTriageChecklistFile);

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-007',
    title: 'Manual Review Load Reduction in Dedup and Routing',
    focus_plugins: focusPlugins,
    hotspots,
    hotspot_rollup,
    review_load_index: {
      baseline: baselineIndex,
      target_90_day: targetIndex,
      target_reduction_ratio: baselineIndex === 0 ? 0 : toFixed2((baselineIndex - targetIndex) / baselineIndex),
    },
    triage_policy: {
      auto_route_threshold: 0.85,
      assisted_route_threshold: 0.65,
      manual_review_threshold: 0.64,
      rule: 'Scores below assisted threshold remain in manual review.',
    },
    execution_snapshot: {
      triage_telemetry: {
        telemetry_file: path.relative(ROOT, NEXT_ACTION_TRIAGE_TELEMETRY_PATH),
        events_detected: triageEvents.length,
        latest_event_at: latestTriageEvent?.timestamp || null,
        latest_source_fingerprint: latestTriageEvent?.source_fingerprint || null,
        shadow_mode_enabled: Boolean(latestTriageEvent?.triage_shadow_mode),
        distribution_consistent: distributionConsistent,
        distribution: {
          total_actions: latestTotalActions,
          auto_route: latestAutoRoute,
          assisted_review: latestAssistedReview,
          manual_review: latestManualReview,
          auto_route_ratio: toFixed2(
            latestDistribution.auto_route_ratio ||
              (latestTotalActions > 0 ? latestAutoRoute / latestTotalActions : 0)
          ),
          assisted_review_ratio: toFixed2(
            latestDistribution.assisted_review_ratio ||
              (latestTotalActions > 0 ? latestAssistedReview / latestTotalActions : 0)
          ),
          manual_review_ratio: toFixed2(
            latestDistribution.manual_review_ratio ||
              (latestTotalActions > 0 ? latestManualReview / latestTotalActions : 0)
          ),
        },
        policy: {
          source:
            latestPolicy.source ||
            'reports/exec/opspal-manual-review-reduction-pack.json',
          auto_route_threshold: normalizeMetricNumber(
            latestPolicy.auto_route_threshold ?? 0.85
          ),
          assisted_route_threshold: normalizeMetricNumber(
            latestPolicy.assisted_route_threshold ?? 0.65
          ),
          manual_review_threshold: normalizeMetricNumber(
            latestPolicy.manual_review_threshold ?? 0.64
          ),
        },
      },
      runtime_handoff: {
        approved_work_items_total: manualReviewWorkItems.length,
        ready_work_item_id: readyWorkItemId || null,
        ready_state: readyState,
        execution_checklist_detected: Boolean(executionChecklistFile),
        execution_checklist_path: executionChecklistFile
          ? `reports/exec/runtime/${executionChecklistFile}`
          : null,
        shadow_triage_checklist_detected: Boolean(shadowTriageChecklistFile),
        shadow_triage_checklist_path: shadowTriageChecklistFile
          ? `reports/exec/runtime/${shadowTriageChecklistFile}`
          : null,
      },
      completion_gate: {
        triage_shadow_mode_ready: triageShadowModeReady,
        runtime_handoff_ready: runtimeHandoffReady,
        ready_for_phase2_execution: triageShadowModeReady && runtimeHandoffReady,
      },
    },
    recommended_next_actions: [
      'Instrument confidence scoring on highest-volume dedup/routing flows first.',
      'Route medium-confidence cases to assisted review queue with suggested remediation.',
      'Keep low-confidence and high-risk cases in mandatory manual review path.',
    ],
  };
}

function buildManualReviewReductionMarkdown(payload) {
  const hotspotRows = (payload.hotspots || [])
    .map(
      (row, index) =>
        `| ${index + 1} | \`${row.plugin}\` | \`${row.type}\` | ${escapeMarkdown(
          row.name
        )} | ${row.hotspot_score} | \`${row.matched_keywords.join(', ')}\` | \`${row.source_path}\` |`
    )
    .join('\n');
  const rollupRows = (payload.hotspot_rollup || [])
    .map((row) => `| \`${row.plugin}\` | ${row.hotspot_count} |`)
    .join('\n');
  const actions = (payload.recommended_next_actions || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  const reviewLoad = payload.review_load_index || {};
  const triage = payload.triage_policy || {};
  const execution = payload.execution_snapshot || {};
  const triageTelemetry = execution.triage_telemetry || {};
  const triageDistribution = triageTelemetry.distribution || {};
  const runtimeHandoff = execution.runtime_handoff || {};
  const gate = execution.completion_gate || {};

  return `# OpsPal Manual Review Reduction Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
Reduce manual-review burden in dedup and routing workflows with confidence-based triage and protected fallback paths.

## Focus Plugin Rollup

| Plugin | Hotspot Count |
|---|---:|
${rollupRows || '| - | 0 |'}

## Manual Review Hotspots

| Rank | Plugin | Asset Type | Asset | Hotspot Score | Matched Keywords | Source Path |
|---:|---|---|---|---:|---|---|
${hotspotRows || '| 1 | - | - | No hotspots detected | 0 | - | - |'}

## Review Load Targets
- Baseline index: ${reviewLoad.baseline || 0}
- 90-day target index: ${reviewLoad.target_90_day || 0}
- Target reduction ratio: ${reviewLoad.target_reduction_ratio || 0}

## Confidence Triage Policy
- Auto-route threshold: ${triage.auto_route_threshold || 0}
- Assisted-route threshold: ${triage.assisted_route_threshold || 0}
- Manual-review threshold: ${triage.manual_review_threshold || 0}
- Rule: ${triage.rule || 'No rule defined.'}

## Execution Snapshot
- Triage telemetry file: \`${triageTelemetry.telemetry_file || path.relative(ROOT, NEXT_ACTION_TRIAGE_TELEMETRY_PATH)}\`
- Triage events detected: ${triageTelemetry.events_detected || 0}
- Latest triage event: \`${triageTelemetry.latest_event_at || 'none'}\`
- Shadow mode enabled: \`${triageTelemetry.shadow_mode_enabled ? 'yes' : 'no'}\`
- Distribution consistent: \`${triageTelemetry.distribution_consistent ? 'yes' : 'no'}\`
- Distribution: total=${triageDistribution.total_actions || 0}, auto=${triageDistribution.auto_route || 0}, assisted=${triageDistribution.assisted_review || 0}, manual=${triageDistribution.manual_review || 0}
- Approved work items detected: ${runtimeHandoff.approved_work_items_total || 0}
- Ready work item: \`${runtimeHandoff.ready_work_item_id || 'none'}\` (state: \`${runtimeHandoff.ready_state || 'missing'}\`)
- Execution checklist detected: \`${runtimeHandoff.execution_checklist_detected ? 'yes' : 'no'}\`
- Shadow-triage checklist detected: \`${runtimeHandoff.shadow_triage_checklist_detected ? 'yes' : 'no'}\`
- Shadow-triage checklist path: \`${runtimeHandoff.shadow_triage_checklist_path || 'not_detected'}\`
- Triage shadow-mode ready: \`${gate.triage_shadow_mode_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${gate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for phase-2 execution: \`${gate.ready_for_phase2_execution ? 'yes' : 'no'}\`

## Recommended Next Steps
${actions || '1. No actions defined.'}
`;
}

function buildDataHygieneSunsetPayload(input) {
  const { catalog, sourceFingerprint } = input;
  const plugins = Array.isArray(catalog.plugins) ? catalog.plugins : [];
  const pluginByName = Object.fromEntries(
    plugins.map((plugin) => [plugin.name, plugin])
  );
  const mappingAssetTypes = ['commands', 'agents'];

  const deprecatedPlugins = (catalog.plugins || [])
    .filter((plugin) => plugin.status === 'deprecated')
    .map((plugin) => {
      const replacement = plugin.replacedBy || plugin.replaced_by || '';
      const replacementPlugin = replacement ? pluginByName[replacement] : null;
      const replacementDetected = Boolean(
        replacement && replacementPlugin
      );

      const replacementMappings = mappingAssetTypes.flatMap((assetType) =>
        (plugin[assetType] || []).map((asset) => {
          const assetName = String(asset.name || '').trim();
          const replacementAsset =
            replacementPlugin && assetName
              ? (replacementPlugin[assetType] || []).find(
                  (candidate) => String(candidate.name || '').trim() === assetName
                )
              : null;
          const mapped = Boolean(replacementAsset);
          return {
            deprecated_plugin: plugin.name,
            deprecated_asset_id: `${plugin.name}:${assetName || 'unknown'}`,
            deprecated_asset_name: assetName || 'unknown',
            deprecated_source_path: asset.sourcePath || '',
            asset_type: assetType === 'commands' ? 'command' : 'agent',
            replacement_plugin: replacement || 'not_declared',
            replacement_asset_id: mapped
              ? `${replacement}:${replacementAsset.name}`
              : null,
            replacement_asset_name: mapped ? replacementAsset.name : null,
            replacement_source_path: mapped ? replacementAsset.sourcePath || '' : null,
            mapping_status: mapped ? 'mapped' : 'unmapped',
            mapping_rule: mapped
              ? 'same_name_in_replacement_plugin'
              : replacementDetected
                ? 'no_name_match_in_replacement_plugin'
                : 'replacement_plugin_missing',
          };
        })
      );

      const totalMappedAssets = replacementMappings.filter(
        (row) => row.mapping_status === 'mapped'
      ).length;
      const totalAssets = replacementMappings.length;
      const unmappedAssets = totalAssets - totalMappedAssets;
      const coverageRatio = totalAssets === 0 ? 1 : toFixed2(totalMappedAssets / totalAssets);

      return {
        plugin: plugin.name,
        owner: plugin.owner || 'unassigned',
        deprecation_date: plugin.deprecationDate || plugin.deprecation_date || '',
        replaced_by: replacement || 'not_declared',
        replacement_detected: replacementDetected,
        mapping_coverage: {
          mapped_assets: totalMappedAssets,
          total_assets: totalAssets,
          unmapped_assets: unmappedAssets,
          coverage_ratio: coverageRatio,
          scope_asset_types: ['command', 'agent'],
        },
        replacement_mappings: replacementMappings,
        assets: {
          agents: (plugin.agents || []).length,
          commands: (plugin.commands || []).length,
          skills: (plugin.skills || []).length,
          hooks: (plugin.hooks || []).length,
          scripts: (plugin.scripts || []).length,
        },
      };
    });

  const replacementPluginGaps = deprecatedPlugins
    .filter((plugin) => !plugin.replacement_detected)
    .map((plugin) => ({
      gap_id: `${plugin.plugin}-replacement-missing`,
      description: `${plugin.plugin} does not declare a detectable replacement plugin.`,
    }));

  const assetMappingGaps = deprecatedPlugins.flatMap((plugin) =>
    (plugin.replacement_mappings || [])
      .filter((row) => row.mapping_status !== 'mapped')
      .map((row) => ({
        gap_id: `${row.deprecated_plugin}-${row.asset_type}-${row.deprecated_asset_name}-mapping-missing`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-'),
        description: `${row.deprecated_asset_id} is not mapped to a replacement ${row.asset_type} in ${row.replacement_plugin}.`,
      }))
  );

  const replacementMappings = deprecatedPlugins.flatMap(
    (plugin) => plugin.replacement_mappings || []
  );
  const totalAssets = replacementMappings.length;
  const mappedAssets = replacementMappings.filter(
    (row) => row.mapping_status === 'mapped'
  ).length;
  const unmappedAssets = totalAssets - mappedAssets;
  const coverageRatio = totalAssets === 0 ? 1 : toFixed2(mappedAssets / totalAssets);
  const blockingGaps = [...replacementPluginGaps, ...assetMappingGaps];
  const mappingReady =
    blockingGaps.length === 0 &&
    unmappedAssets === 0 &&
    Math.abs(coverageRatio - 1) <= 0.0001;

  const approvedPayload = readJsonIfExists(APPROVED_WORK_ITEMS_PATH) || {};
  const approvedItems = Array.isArray(approvedPayload.items)
    ? approvedPayload.items
    : [];
  const checklistFiles = fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];
  const sunsetWorkItems = approvedItems.filter((item) => {
    const title = String(item.title || '')
      .toLowerCase()
      .trim();
    const sourcePlugin = String(item.source_plugin || '')
      .toLowerCase()
      .trim();
    return (
      title === 'data hygiene sunset completion' ||
      sourcePlugin === 'opspal-data-hygiene'
    );
  });
  const readyWorkItem =
    sunsetWorkItems.find(
      (item) => String(item.ready_state || '').toLowerCase() === 'ready'
    ) || sunsetWorkItems[0] || null;
  const readyWorkItemId = readyWorkItem ? String(readyWorkItem.work_item_id || '') : '';
  const readyStateRaw = readyWorkItem
    ? String(readyWorkItem.ready_state || '').toLowerCase()
    : '';
  const readyState = readyWorkItem ? (readyStateRaw === 'ready' ? 'ready' : 'blocked') : 'missing';
  const requestId = readyWorkItemId.startsWith('wi-')
    ? readyWorkItemId.slice('wi-'.length)
    : '';
  const checklistFile = requestId
    ? findRuntimeChecklist(checklistFiles, [requestId, 'execution-checklist']) ||
      findRuntimeChecklist(checklistFiles, [requestId, 'implementation-checklist']) ||
      findRuntimeChecklist(checklistFiles, [requestId])
    : null;
  const runtimeHandoffReady = readyState === 'ready' && Boolean(checklistFile);

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-005',
    title: 'Data Hygiene Sunset Completion',
    deprecated_plugins: deprecatedPlugins,
    replacement_mappings: replacementMappings,
    mapping_coverage: {
      mapped_assets: mappedAssets,
      total_assets: totalAssets,
      unmapped_assets: unmappedAssets,
      coverage_ratio: coverageRatio,
      scope_asset_types: ['command', 'agent'],
    },
    readiness_status: mappingReady ? 'sunset_ready' : 'needs_remediation',
    blocking_gaps: blockingGaps,
    execution_snapshot: {
      approved_work_items_total: sunsetWorkItems.length,
      ready_work_item_id: readyWorkItemId || null,
      ready_state: readyState,
      runtime_checklist_detected: Boolean(checklistFile),
      runtime_checklist_path: checklistFile
        ? `reports/exec/runtime/${checklistFile}`
        : null,
      completion_gate: {
        mapping_ready: mappingReady,
        runtime_handoff_ready: runtimeHandoffReady,
        ready_for_sunset_completion: mappingReady && runtimeHandoffReady,
      },
    },
    migration_checklist: [
      'Confirm all deprecated plugin commands/agents have mapped replacements.',
      'Remove deprecated plugin from active routing recommendations.',
      'Publish migration note and rollback plan for remaining consumers.',
      'Track sunset completion in runtime work-item exports.',
    ],
  };
}

function buildDataHygieneSunsetMarkdown(payload) {
  const deprecatedRows = (payload.deprecated_plugins || [])
    .map(
      (row) =>
        `| \`${row.plugin}\` | \`${row.owner}\` | \`${row.deprecation_date || 'unknown'}\` | \`${row.replaced_by}\` | \`${row.replacement_detected ? 'yes' : 'no'}\` | ${row.assets.commands} | ${row.assets.agents} | ${row.assets.scripts} |`
    )
    .join('\n');
  const mappingRows = (payload.replacement_mappings || [])
    .map(
      (row) =>
        `| \`${row.deprecated_asset_id}\` | \`${row.asset_type}\` | \`${row.replacement_plugin}\` | \`${row.replacement_asset_id || 'unmapped'}\` | \`${row.mapping_status}\` | \`${row.deprecated_source_path || '-'}\` | \`${row.replacement_source_path || '-'}\` |`
    )
    .join('\n');
  const gaps = (payload.blocking_gaps || [])
    .map((gap) => `- \`${gap.gap_id}\`: ${gap.description}`)
    .join('\n');
  const checklist = (payload.migration_checklist || [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  const coverage = payload.mapping_coverage || {};
  const scope = Array.isArray(coverage.scope_asset_types)
    ? coverage.scope_asset_types.join(', ')
    : 'command, agent';
  const execution = payload.execution_snapshot || {};
  const executionGate = execution.completion_gate || {};
  const runtimeChecklistPath =
    execution.runtime_checklist_path || 'not_detected';

  return `# OpsPal Data Hygiene Sunset Pack

Source Fingerprint: \`${payload.source_fingerprint}\`

## Objective
Complete deprecated plugin sunset readiness with explicit replacement mapping and migration controls.

## Deprecated Plugin Inventory

| Plugin | Owner | Deprecation Date | Replaced By | Replacement Detected | Commands | Agents | Scripts |
|---|---|---|---|---|---:|---:|---:|
${deprecatedRows || '| - | - | - | - | - | 0 | 0 | 0 |'}

## Replacement Mapping Coverage
- Scope: ${scope}
- Total assets in scope: ${coverage.total_assets || 0}
- Mapped assets: ${coverage.mapped_assets || 0}
- Unmapped assets: ${coverage.unmapped_assets || 0}
- Coverage ratio: ${coverage.coverage_ratio || 0}

| Deprecated Asset | Asset Type | Replacement Plugin | Replacement Asset | Mapping Status | Deprecated Source Path | Replacement Source Path |
|---|---|---|---|---|---|---|
${mappingRows || '| - | - | - | - | - | - | - |'}

## Sunset Readiness
- Status: \`${payload.readiness_status}\`

## Blocking Gaps
${gaps || '- None. Replacement mappings are present for deprecated plugins.'}

## Sunset Execution Snapshot
- Approved work items detected: ${execution.approved_work_items_total || 0}
- Ready work item: \`${execution.ready_work_item_id || 'none'}\` (state: \`${execution.ready_state || 'missing'}\`)
- Runtime checklist detected: \`${execution.runtime_checklist_detected ? 'yes' : 'no'}\`
- Runtime checklist path: \`${runtimeChecklistPath}\`
- Mapping ready: \`${executionGate.mapping_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${executionGate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for sunset completion: \`${executionGate.ready_for_sunset_completion ? 'yes' : 'no'}\`

## Migration Checklist
${checklist || '1. No checklist defined.'}
`;
}

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildOpportunityCsv(opportunities) {
  const headers = [
    'id',
    'title',
    'category',
    'plugin_scope',
    'problem_statement',
    'evidence',
    'impact_score',
    'risk_reduction_score',
    'time_to_value_score',
    'effort_score',
    'governance_fit_score',
    'overall_score',
    'ninety_day_fit',
    'owner_suggested',
  ];

  const lines = [headers.join(',')];
  for (const row of opportunities) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  return lines.join('\n') + '\n';
}

function statusRank(status) {
  if (status === 'complete') {
    return 2;
  }
  if (status === 'in_progress') {
    return 1;
  }
  return 0;
}

function maxStatus(statuses) {
  const ranked = statuses
    .filter(Boolean)
    .sort((a, b) => statusRank(b) - statusRank(a));
  return ranked[0] || 'planned';
}

function findRuntimeChecklist(checklistFiles, fragments) {
  if (!Array.isArray(checklistFiles) || checklistFiles.length === 0) {
    return null;
  }
  return (
    checklistFiles.find((fileName) =>
      fragments.every((fragment) => fileName.includes(fragment))
    ) || null
  );
}

function hasRuntimeChecklist(checklistFiles, fragments) {
  return Boolean(findRuntimeChecklist(checklistFiles, fragments));
}

function getRuntimeChecklistFiles() {
  return fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];
}

function findExecutionChecklistByOpportunity(opportunityId, checklistFiles) {
  const files = Array.isArray(checklistFiles)
    ? checklistFiles
    : getRuntimeChecklistFiles();
  const normalizedOpportunity = String(opportunityId || '').toLowerCase();
  if (!normalizedOpportunity) {
    return null;
  }
  const workItemStem = `wi-nba-${normalizedOpportunity}`;
  return (
    findRuntimeChecklist(files, [workItemStem, 'execution-checklist']) ||
    findRuntimeChecklist(files, [workItemStem])
  );
}

function buildPlanProgressSnapshot(input) {
  const {
    opportunities,
    driftRows,
    commandTelemetryAdoption,
    aiMaturityScorecards,
    sprint6ExecutiveReadout,
    unifiedNextBestActionQueue,
  } = input;
  const funded = selectFundedInitiatives(opportunities, 5);

  const approvedPayload = readJsonIfExists(APPROVED_WORK_ITEMS_PATH) || {};
  const approvedItems = Array.isArray(approvedPayload.items)
    ? approvedPayload.items
    : [];
  const approvedTitles = new Set(
    approvedItems.map((item) => String(item.title || '').trim()).filter(Boolean)
  );
  const approvedReadyCount = approvedItems.filter(
    (item) => String(item.ready_state || '').toLowerCase() === 'ready'
  ).length;

  const checklistFiles = fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];

  const telemetryBaseline = commandTelemetryAdoption?.adoption_baseline || {};
  const controlTelemetryBaseline =
    commandTelemetryAdoption?.control_plane_adoption_baseline || {};

  const telemetryPilotRatio = Number(telemetryBaseline.adoption_ratio || 0);
  const telemetryPilotEnabled = Number(telemetryBaseline.telemetry_enabled_commands || 0);
  const telemetryPilotTotal = Number(telemetryBaseline.pilot_commands_total || 0);
  const controlTelemetryEnabled = Number(
    controlTelemetryBaseline.telemetry_enabled_commands || 0
  );
  const controlTelemetryTotal = Number(
    controlTelemetryBaseline.pilot_commands_total || 0
  );

  const sprint6Gate = sprint6ExecutiveReadout?.completion_gate || {};
  let sprint6Status = 'planned';
  let sprint6Evidence =
    'Stabilization and executive readout are queued after rollout completion.';
  if (Boolean(sprint6Gate.ready_for_executive_review)) {
    sprint6Status = 'complete';
    sprint6Evidence =
      'Executive readout package is generated with funded completion summary, KPI deltas, and phase-2 recommendations.';
  } else if (sprint6ExecutiveReadout) {
    sprint6Status = 'in_progress';
    sprint6Evidence = `Executive readout gate status: funded_complete=${
      sprint6Gate.funded_initiatives_complete ? 'yes' : 'no'
    }, kpi_coverage=${sprint6Gate.kpi_delta_coverage_ready ? 'yes' : 'no'}, phase2_ready=${
      sprint6Gate.phase2_recommendations_ready ? 'yes' : 'no'
    }.`;
  }

  const milestones = funded.map((opportunity) => {
    const approvedPromoted = approvedTitles.has(String(opportunity.title || '').trim());

    let status = approvedPromoted ? 'in_progress' : 'planned';
    let evidence = approvedPromoted
      ? 'Approved work item is promoted in runtime handoff exports.'
      : 'No promoted work item detected yet.';

    if (opportunity.id === 'OPP-001') {
      status = driftRows.length === 0 ? 'complete' : 'in_progress';
      evidence = `Documentation drift rows currently ${driftRows.length}.`;
    } else if (opportunity.id === 'OPP-002') {
      const upliftPackPresent = fs.existsSync(
        path.join(OUTPUT_DIR, 'opspal-ai-maturity-uplift-pack.md')
      );
      const scorecards = aiMaturityScorecards || {};
      const snapshot = scorecards.execution_snapshot || {};
      const completionGate = snapshot.completion_gate || {};
      const handoff = snapshot.runtime_handoff || {};
      const totalTargets = Number(
        snapshot.target_plugins_total ||
          (Array.isArray(scorecards.target_plugins) ? scorecards.target_plugins.length : 0)
      );
      const trackedCount = Number(
        snapshot.target_plugins_with_tracked_evidence || 0
      );
      const positiveGapCount = Number(
        snapshot.target_plugins_with_positive_uplift_gap || 0
      );
      const handoffProofReady = Boolean(
        completionGate.runtime_handoff_proof_ready ?? handoff.handoff_proof_ready
      );
      const readyForCompletion = Boolean(completionGate.ready_for_completion);

      if (readyForCompletion) {
        status = 'complete';
      } else if (upliftPackPresent || trackedCount > 0 || handoffProofReady) {
        status = 'in_progress';
      } else {
        status = 'planned';
      }

      evidence = `AI maturity execution snapshot: tracked_evidence=${trackedCount}/${totalTargets}, positive_uplift_gap=${positiveGapCount}/${totalTargets}, handoff_proof=${
        handoffProofReady ? 'yes' : 'no'
      }, completion_gate=${readyForCompletion ? 'ready' : 'not_ready'}.`;
    } else if (opportunity.id === 'OPP-003') {
      const hasChecklist = hasRuntimeChecklist(checklistFiles, [
        '1771122550654-9e9d45',
      ]);
      status = approvedPromoted && hasChecklist ? 'complete' : approvedPromoted ? 'in_progress' : 'planned';
      evidence = approvedPromoted
        ? hasChecklist
          ? 'Approval queue execution checklist captured and promoted work item is ready.'
          : 'Promoted work item detected; execution checklist not found.'
        : 'Awaiting governed approval/promotion for queue rollout.';
    } else if (opportunity.id === 'OPP-004') {
      const hasPhase2Checklist = hasRuntimeChecklist(checklistFiles, [
        '1771177002482-8c63aa',
        'implementation-checklist',
      ]);
      const hasPhase3ControlPlane = hasRuntimeChecklist(checklistFiles, [
        '1771177002482-8c63aa',
        'phase3-telemetry-rollout',
      ]);
      const hasPhase3Pilot = hasRuntimeChecklist(checklistFiles, [
        '1771177002482-8c63aa',
        'phase3-pilot-command-telemetry',
      ]);
      if (
        telemetryPilotRatio >= 0.8 &&
        hasPhase2Checklist &&
        hasPhase3ControlPlane &&
        hasPhase3Pilot
      ) {
        status = 'complete';
      } else if (telemetryPilotEnabled > 0 || hasPhase2Checklist || hasPhase3ControlPlane) {
        status = 'in_progress';
      } else {
        status = 'planned';
      }
      evidence = `Pilot telemetry coverage ${telemetryPilotEnabled}/${telemetryPilotTotal} (${toFixed2(
        telemetryPilotRatio
      )}); phase checklists: phase2=${hasPhase2Checklist ? 'yes' : 'no'}, phase3-control=${hasPhase3ControlPlane ? 'yes' : 'no'}, phase3-pilot=${hasPhase3Pilot ? 'yes' : 'no'}.`;
    } else if (opportunity.id === 'OPP-009') {
      const hasChecklist = hasRuntimeChecklist(checklistFiles, [
        '1771176220727-50bc66',
      ]);
      const queueExecution =
        unifiedNextBestActionQueue?.queue_execution_snapshot || {};
      const focal = queueExecution.focal_opportunity || {};
      const dependencyGates = Array.isArray(queueExecution.dependency_gates)
        ? queueExecution.dependency_gates
        : [];
      const dependencyReadyCount = dependencyGates.filter(
        (gate) => gate.execution_ready
      ).length;
      const dependencyTotal = dependencyGates.length;
      const focalExecutionReady = Boolean(focal.execution_ready);
      const focalApprovalStatus = String(focal.approval_status || 'missing');
      const focalWorkItem = String(focal.ready_work_item_id || '');
      const focalChecklist = Boolean(focal.runtime_checklist_detected);
      const dependenciesReady =
        dependencyTotal > 0 && dependencyReadyCount === dependencyTotal;

      if (focalExecutionReady && dependenciesReady) {
        status = 'complete';
      } else if (
        focalApprovalStatus === 'approved' ||
        focalWorkItem ||
        focalChecklist ||
        approvedPromoted ||
        hasChecklist
      ) {
        status = 'in_progress';
      } else {
        status = 'planned';
      }

      evidence = `Queue execution snapshot: OPP-009 approval=${focalApprovalStatus}, ready_work_item=${
        focalWorkItem || 'none'
      }, checklist=${focalChecklist ? 'yes' : 'no'}, execution_ready=${
        focalExecutionReady ? 'yes' : 'no'
      }; dependency_gates_ready=${dependencyReadyCount}/${dependencyTotal}.`;
    }

    return {
      opportunity_id: opportunity.id,
      title: opportunity.title,
      status,
      approved_promoted: approvedPromoted,
      evidence,
    };
  });

  return {
    approved_work_items_total: approvedItems.length,
    approved_work_items_ready: approvedReadyCount,
    funded_initiatives_total: funded.length,
    funded_with_approved_work_items: milestones.filter((item) => item.approved_promoted)
      .length,
    telemetry_pilot_enabled: telemetryPilotEnabled,
    telemetry_pilot_total: telemetryPilotTotal,
    telemetry_pilot_ratio: toFixed2(telemetryPilotRatio),
    control_telemetry_enabled: controlTelemetryEnabled,
    control_telemetry_total: controlTelemetryTotal,
    runtime_checklists_detected: checklistFiles.length,
    sprint6_readout: {
      status: sprint6Status,
      evidence: sprint6Evidence,
    },
    milestones,
  };
}

function buildInitiatives(opportunities, totals, progressSnapshot) {
  const sourceFingerprint = totals.source_fingerprint || 'unknown';
  const selected = selectFundedInitiatives(opportunities, 5);

  const templates = {
    'OPP-001': {
      initiative: 'Initiative A - Documentation Trust Layer',
      objective:
        'Eliminate product capability drift between narrative docs and generated registry outputs.',
      deliverables: [
        'Automated drift check comparing README/FEATURES claims to generated catalog totals',
        'Release-blocking policy for unresolved metric drift',
        'Executive digest output with approved source-of-truth pointers',
      ],
      kpi: `Drift rows reduced from current baseline to 0 (baseline currently captured in opportunity matrix).`,
    },
    'OPP-003': {
      initiative: 'Initiative B - Copilot Approval Queue',
      objective:
        'Standardize human approval routing for production-impacting recommendations from mandatory agents.',
      deliverables: [
        'Shared approval object with risk class + confidence + rollback metadata',
        'Approval queue by severity with explicit approver roles',
        'Audit-friendly decision log for accepted/rejected AI recommendations',
      ],
      kpi: '100% of high-risk recommendations routed through explicit approval checkpoints.',
    },
    'OPP-009': {
      initiative: 'Initiative C - Unified Next-Best-Action Layer',
      objective:
        'Consolidate diagnostic outputs into ranked remediation actions with clear ownership and expected value.',
      deliverables: [
        'Normalized recommendation contract across Salesforce/HubSpot/Marketo/Core',
        'Cross-plugin prioritization service producing top remediation queue',
        'Action-level KPI projections (risk avoided, time saved, revenue lift)',
      ],
      kpi: 'Reduce average time from diagnosis to approved action by 30% in pilot teams.',
    },
    'OPP-002': {
      initiative: 'Initiative D - AI Maturity Uplift Pack',
      objective:
        'Raise AI-enabled coverage in lowest-maturity active plugins using reusable copilot patterns.',
      deliverables: [
        'Reusable LLM-assisted analysis blocks for selected low-ratio plugins',
        'Confidence-scored recommendation templates with deterministic fallback',
        'Plugin-level maturity scorecards refreshed each release',
      ],
      kpi: 'Lift AI-enabled ratio by at least 15 percentage points in targeted plugins.',
    },
    'OPP-004': {
      initiative: 'Initiative E - Command Telemetry Contract Adoption',
      objective:
        'Implement a standard command telemetry envelope for suite-level executive reporting.',
      deliverables: [
        'Published telemetry schema with validation checks',
        'Command emitters in pilot commands for outcome + override + rework tracking',
        'Executive rollup dashboard feed in JSON for strategy consumers',
      ],
      kpi: 'Capture telemetry for at least 80% of high-volume commands in pilot scope.',
    },
  };

  const blocks = selected
    .map((opportunity, index) => {
      const letter = String.fromCharCode(65 + index);
      const template = templates[opportunity.id];
      if (!template) {
        return `### ${letter}. Initiative ${letter} - ${opportunity.title}
- Linked Opportunity: \`${opportunity.id}\` (${opportunity.title})
- Objective: ${opportunity.problem_statement}
- KPI: Define baseline and target in sprint planning.
- Deliverables:
- Convert opportunity into implementation-ready epic
- Define owner, dependencies, and rollout guardrails
- Publish success metrics for executive tracking`;
      }
      const deliverables = template.deliverables.map((item) => `- ${item}`).join('\n');
      return `### ${letter}. ${template.initiative}
- Linked Opportunity: \`${opportunity.id}\` (${opportunity.title})
- Objective: ${template.objective}
- KPI: ${template.kpi}
- Deliverables:
${deliverables}`;
    })
    .join('\n\n');

  const progressRows = (progressSnapshot?.milestones || [])
    .map(
      (milestone) =>
        `| \`${milestone.opportunity_id}\` | ${escapeMarkdown(
          milestone.title
        )} | \`${milestone.status}\` | ${escapeMarkdown(milestone.evidence)} |`
    )
    .join('\n');

  return `# OpsPal 90-Day Initiatives

Source Fingerprint: \`${sourceFingerprint}\`

## Portfolio Summary
- Plugins in scope: ${totals.plugins}
- Total command surface: ${totals.commands}
- Copilot-first posture: production-impacting actions remain human-approved.
- Selected initiatives: top 5 by weighted score from \`opspal-gap-priority-matrix.csv\`.

## Progress Snapshot
- Approved work items promoted: ${progressSnapshot?.approved_work_items_total || 0} (ready: ${
    progressSnapshot?.approved_work_items_ready || 0
  })
- Funded initiatives with approved work items: ${
    progressSnapshot?.funded_with_approved_work_items || 0
  }/${progressSnapshot?.funded_initiatives_total || 0}
- Telemetry pilot coverage (OPP-004): ${
    progressSnapshot?.telemetry_pilot_enabled || 0
  }/${progressSnapshot?.telemetry_pilot_total || 0} (ratio ${
    progressSnapshot?.telemetry_pilot_ratio || 0
  })
- Control-plane telemetry coverage: ${
    progressSnapshot?.control_telemetry_enabled || 0
  }/${progressSnapshot?.control_telemetry_total || 0}
- Runtime phase checklists detected: ${progressSnapshot?.runtime_checklists_detected || 0}

| Opportunity | Initiative | Status | Evidence |
|---|---|---|---|
${progressRows || '| - | - | - | - |'}

## Funded Initiatives
${blocks}

## Dependency Notes
- Initiative A should land first to stabilize reporting trust.
- Initiative B and Initiative C can run in parallel once telemetry definitions are agreed.
- Initiative D should reuse Initiative C recommendation contracts.
- Initiative E must publish schema validation before broad adoption.
`;
}

function buildExecutionBoard(
  opportunities,
  sourceFingerprint,
  progressSnapshot,
  sprint6ExecutiveReadout
) {
  const start = new Date(PLAN_START_DATE.getTime());

  const top5 = opportunities.slice(0, 5);
  const sprintRows = [];
  for (let sprint = 0; sprint < 6; sprint += 1) {
    const sprintStart = addDays(start, sprint * 14);
    const sprintEnd = addDays(start, sprint * 14 + 13);
    sprintRows.push({
      sprint: sprint + 1,
      start: toDateString(sprintStart),
      end: toDateString(sprintEnd),
    });
  }

  const roadmapRows = [
    {
      sprint: 1,
      focus: 'Truth model baseline + drift guardrail specification',
      outputs:
        'Capability matrix baseline, drift alerting rules, ownership alignment',
      kpi: 'Baseline approved by platform owner group',
    },
    {
      sprint: 2,
      focus: 'Opportunity scoring lock + schema publication',
      outputs:
        'Final priority matrix, capability/opportunity/telemetry schema files',
      kpi: 'Top-5 initiative package ratified',
    },
    {
      sprint: 3,
      focus: 'Copilot approval queue alpha + next-best-action contract alpha',
      outputs:
        'Approval object and action ranking contract in pilot commands',
      kpi: 'At least 10 pilot recommendations processed end-to-end',
    },
    {
      sprint: 4,
      focus: 'AI maturity uplift implementation in low-ratio plugins',
      outputs:
        'Reusable LLM-assisted modules + confidence fallback paths',
      kpi: 'Target plugin AI-enabled ratio trending +10pp',
    },
    {
      sprint: 5,
      focus: 'Telemetry contract integration + dashboard feed',
      outputs:
        'Command telemetry emitters + ai-gaps/feature-gaps payload publication',
      kpi: 'Telemetry coverage > 60% in pilot command set',
    },
    {
      sprint: 6,
      focus: 'Stabilization + executive readout',
      outputs:
        'Adoption report, KPI deltas, phase-2 recommendation set',
      kpi: 'Executive review package accepted for next-quarter planning',
    },
  ];

  const sprintTable = sprintRows
    .map(
      (row) => `| Sprint ${row.sprint} | ${row.start} | ${row.end} | ${roadmapRows[row.sprint - 1].focus} |`
    )
    .join('\n');

  const deliveryRows = roadmapRows
    .map(
      (row) =>
        `| Sprint ${row.sprint} | ${escapeMarkdown(row.outputs)} | ${escapeMarkdown(
          row.kpi
        )} |`
    )
    .join('\n');

  const milestoneById = Object.fromEntries(
    (progressSnapshot?.milestones || []).map((item) => [item.opportunity_id, item])
  );
  const sprintProgress = [
    {
      sprint: 1,
      status: milestoneById['OPP-001']?.status || 'planned',
      evidence:
        milestoneById['OPP-001']?.evidence ||
        'Awaiting documentation trust baseline updates.',
    },
    {
      sprint: 2,
      status:
        fs.existsSync(path.join(OUTPUT_DIR, 'opspal-gap-priority-matrix.csv')) &&
        fs.existsSync(path.join(CONTRACTS_DIR, 'opspal-command-telemetry-contract.schema.json'))
          ? 'complete'
          : 'in_progress',
      evidence:
        'Priority matrix and contract schemas are generated and validated in exec pipeline.',
    },
    {
      sprint: 3,
      status: maxStatus([
        milestoneById['OPP-003']?.status || 'planned',
        milestoneById['OPP-009']?.status || 'planned',
      ]),
      evidence: `OPP-003 is ${
        milestoneById['OPP-003']?.status || 'planned'
      }; OPP-009 is ${milestoneById['OPP-009']?.status || 'planned'}.`,
    },
    {
      sprint: 4,
      status: milestoneById['OPP-002']?.status || 'planned',
      evidence:
        milestoneById['OPP-002']?.evidence ||
        'Awaiting uplift implementation handoff beyond baseline pack.',
    },
    {
      sprint: 5,
      status: milestoneById['OPP-004']?.status || 'planned',
      evidence:
        milestoneById['OPP-004']?.evidence ||
        'Awaiting telemetry contract rollout completion evidence.',
    },
    {
      sprint: 6,
      status:
        progressSnapshot?.sprint6_readout?.status ||
        (sprint6ExecutiveReadout
          ? sprint6ExecutiveReadout?.completion_gate?.ready_for_executive_review
            ? 'complete'
            : 'in_progress'
          : 'planned'),
      evidence:
        progressSnapshot?.sprint6_readout?.evidence ||
        (sprint6ExecutiveReadout
          ? 'Executive readout artifact is generated; completion gate remains in progress.'
          : 'Stabilization and executive readout are queued after rollout completion.'),
    },
  ];

  const sprintProgressRows = sprintProgress
    .map(
      (row) =>
        `| Sprint ${row.sprint} | \`${row.status}\` | ${escapeMarkdown(row.evidence)} |`
    )
    .join('\n');

  return `# OpsPal 90-Day Execution Board

Source Fingerprint: \`${sourceFingerprint}\`

## Timeline (2-Week Sprints)

| Sprint | Start | End | Focus |
|---|---|---|---|
${sprintTable}

## Sprint Deliverables and KPIs

| Sprint | Outputs | KPI Gate |
|---|---|---|
${deliveryRows}

## Current Progress

| Sprint | Status | Evidence |
|---|---|---|
${sprintProgressRows}

## Top Opportunities Driving This Plan
${top5
  .map((row, index) => `${index + 1}. \`${row.id}\` ${row.title} (score ${row.overall_score})`)
  .join('\n')}
`;
}

function buildContracts() {
  const capabilitySchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://revpal.dev/schemas/opspal-capability-contract.schema.json',
    title: 'OpsPal Capability Contract',
    type: 'object',
    required: [
      'capability_id',
      'plugin',
      'workflow_stage',
      'ai_maturity_level',
      'risk_class',
      'human_approval_required',
    ],
    properties: {
      capability_id: { type: 'string' },
      plugin: { type: 'string' },
      workflow_stage: { enum: WORKFLOW_STAGES },
      ai_maturity_level: { enum: MATURITY_LEVELS },
      risk_class: { enum: ['low', 'medium', 'high', 'critical'] },
      human_approval_required: { type: 'boolean' },
      source_artifact: { type: 'string' },
      owner: { type: 'string' },
    },
    additionalProperties: false,
  };

  const opportunitySchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://revpal.dev/schemas/opspal-opportunity-scoring-contract.schema.json',
    title: 'OpsPal Opportunity Scoring Contract',
    type: 'object',
    required: [
      'opportunity_id',
      'category',
      'impact_score',
      'effort_score',
      'confidence',
      'ninety_day_fit',
      'owner_team',
    ],
    properties: {
      opportunity_id: { type: 'string' },
      category: { enum: ['ai_leverage', 'feature_gap'] },
      impact_score: { type: 'number', minimum: 1, maximum: 5 },
      effort_score: { type: 'number', minimum: 1, maximum: 5 },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      ninety_day_fit: { enum: ['yes', 'conditional', 'no'] },
      owner_team: { type: 'string' },
      rationale: { type: 'string' },
    },
    additionalProperties: false,
  };

  const telemetrySchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://revpal.dev/schemas/opspal-command-telemetry-contract.schema.json',
    title: 'OpsPal Command Telemetry Contract',
    type: 'object',
    required: [
      'timestamp',
      'command',
      'agent',
      'outcome',
      'time_saved_estimate_minutes',
      'human_override',
      'rework_required',
    ],
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
      command: { type: 'string' },
      agent: { type: 'string' },
      outcome: { enum: ['success', 'partial', 'failed', 'blocked'] },
      time_saved_estimate_minutes: { type: 'number', minimum: 0 },
      human_override: { type: 'boolean' },
      rework_required: { type: 'boolean' },
      risk_class: { enum: ['low', 'medium', 'high', 'critical'] },
      source_plugin: { type: 'string' },
    },
    additionalProperties: false,
  };

  return {
    capabilitySchema,
    opportunitySchema,
    telemetrySchema,
  };
}

function buildDashboardPayload(opportunities, category, sourceFingerprint) {
  const filtered = opportunities.filter((row) => row.category === category);
  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-012',
    category,
    total_items: filtered.length,
    top_items: filtered.slice(0, 10).map((row) => ({
      id: row.id,
      title: row.title,
      overall_score: row.overall_score,
      ninety_day_fit: row.ninety_day_fit,
      plugin_scope: row.plugin_scope,
      owner_suggested: row.owner_suggested,
    })),
  };
}

function buildStrategyDashboardPortfolioPayload(aiPayload, featurePayload, sourceFingerprint) {
  const categoryFeeds = [aiPayload, featurePayload].map((payload) => ({
    category: payload.category,
    total_items: payload.total_items,
    top_items_count: Array.isArray(payload.top_items) ? payload.top_items.length : 0,
  }));

  const combined = [];
  for (const payload of [aiPayload, featurePayload]) {
    for (const item of payload.top_items || []) {
      combined.push({
        ...item,
        category: payload.category,
      });
    }
  }

  combined.sort((a, b) => {
    const delta = Number(b.overall_score) - Number(a.overall_score);
    if (Math.abs(delta) > 0.0001) {
      return delta;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  const ownerCounts = new Map();
  const fitCounts = {
    overall: { yes: 0, conditional: 0, other: 0 },
    ai_leverage: { yes: 0, conditional: 0, other: 0 },
    feature_gap: { yes: 0, conditional: 0, other: 0 },
  };

  for (const item of combined) {
    const owner = item.owner_suggested || 'unassigned';
    ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);

    const bucket = ['yes', 'conditional'].includes(item.ninety_day_fit)
      ? item.ninety_day_fit
      : 'other';
    fitCounts.overall[bucket] += 1;
    if (fitCounts[item.category]) {
      fitCounts[item.category][bucket] += 1;
    }
  }

  const ownerRollup = Array.from(ownerCounts.entries())
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));

  const categoryFeedsReady =
    categoryFeeds.length >= 2 &&
    categoryFeeds.every((row) => row.total_items > 0 && row.top_items_count > 0);
  const portfolioFeedReady = combined.length > 0 && ownerRollup.length > 0;

  const commandDocRequiredRefs = [
    'reports/exec/strategy-dashboard-ai-gaps.json',
    'reports/exec/strategy-dashboard-feature-gaps.json',
    'reports/exec/strategy-dashboard-portfolio.json',
  ];
  const commandDocText = fs.existsSync(STRATEGY_DASHBOARD_COMMAND_DOC_PATH)
    ? readText(STRATEGY_DASHBOARD_COMMAND_DOC_PATH)
    : '';
  const commandDocMissingRefs = commandDocRequiredRefs.filter(
    (ref) => !commandDocText.includes(ref)
  );
  const commandDocIntegrationReady = commandDocMissingRefs.length === 0;

  const checklistFiles = fs.existsSync(RUNTIME_OUTPUT_DIR)
    ? fs
        .readdirSync(RUNTIME_OUTPUT_DIR)
        .filter((name) => name.endsWith('.md') && name.includes('checklist'))
    : [];
  const runtimeChecklistFile =
    findRuntimeChecklist(checklistFiles, ['wi-nba-opp-012', 'execution-checklist']) ||
    findRuntimeChecklist(checklistFiles, ['wi-nba-opp-012']);
  const runtimeHandoffReady = Boolean(runtimeChecklistFile);
  const readyForPhase2Consumers =
    categoryFeedsReady &&
    portfolioFeedReady &&
    commandDocIntegrationReady &&
    runtimeHandoffReady;

  return {
    generated_at: sourceFingerprint,
    source_fingerprint: sourceFingerprint,
    source_opportunity_id: 'OPP-012',
    title: 'Strategy Dashboard Gap Category Feeds',
    objective:
      'Publish AI-gap and feature-gap category feeds with unified portfolio rollup so strategy dashboard consumers have a stable executive contract.',
    category_feeds: categoryFeeds,
    combined_total_items: combined.length,
    combined_top_items: combined.slice(0, 15),
    owner_rollup: ownerRollup,
    ninety_day_fit_rollup: fitCounts,
    execution_snapshot: {
      category_feed_status: {
        category_feeds_published: categoryFeedsReady,
        ai_leverage_total_items: Number(aiPayload.total_items || 0),
        feature_gap_total_items: Number(featurePayload.total_items || 0),
        combined_total_items: combined.length,
      },
      command_integration: {
        command_doc_path: path.relative(ROOT, STRATEGY_DASHBOARD_COMMAND_DOC_PATH),
        required_feed_references: commandDocRequiredRefs,
        missing_references: commandDocMissingRefs,
        integration_ready: commandDocIntegrationReady,
      },
      runtime_handoff: {
        execution_checklist_detected: runtimeHandoffReady,
        execution_checklist_path: runtimeChecklistFile
          ? `reports/exec/runtime/${runtimeChecklistFile}`
          : null,
      },
      completion_gate: {
        category_feeds_ready: categoryFeedsReady,
        portfolio_feed_ready: portfolioFeedReady,
        command_integration_ready: commandDocIntegrationReady,
        runtime_handoff_ready: runtimeHandoffReady,
        ready_for_phase2_consumers: readyForPhase2Consumers,
      },
    },
  };
}

function buildStrategyDashboardPortfolioMarkdown(portfolioPayload) {
  const categoryRows = (portfolioPayload.category_feeds || [])
    .map(
      (row) =>
        `| \`${row.category}\` | ${row.total_items} | ${row.top_items_count} |`
    )
    .join('\n');

  const combinedRows = (portfolioPayload.combined_top_items || [])
    .map(
      (item, index) =>
        `| ${index + 1} | \`${item.id}\` | ${item.title.replace(/\|/g, '\\|')} | \`${item.category}\` | ${item.overall_score} | \`${item.ninety_day_fit}\` | \`${item.owner_suggested || 'unassigned'}\` |`
    )
    .join('\n');

  const ownerRows = (portfolioPayload.owner_rollup || [])
    .map((row) => `| \`${row.owner}\` | ${row.count} |`)
    .join('\n');

  const fit = portfolioPayload.ninety_day_fit_rollup || {};
  const fitRows = ['overall', 'ai_leverage', 'feature_gap']
    .map((scope) => ({
      scope,
      yes: fit[scope]?.yes || 0,
      conditional: fit[scope]?.conditional || 0,
      other: fit[scope]?.other || 0,
    }))
    .map(
      (row) =>
        `| \`${row.scope}\` | ${row.yes} | ${row.conditional} | ${row.other} |`
    )
    .join('\n');
  const execution = portfolioPayload.execution_snapshot || {};
  const feedStatus = execution.category_feed_status || {};
  const commandIntegration = execution.command_integration || {};
  const runtimeHandoff = execution.runtime_handoff || {};
  const gate = execution.completion_gate || {};
  const missingRefs = Array.isArray(commandIntegration.missing_references)
    ? commandIntegration.missing_references
    : [];

  return `# OpsPal Strategy Dashboard Portfolio Feed

Source Fingerprint: \`${portfolioPayload.source_fingerprint}\`

## Category Feed Coverage

| Category | Total Items | Top Items Published |
|---|---:|---:|
${categoryRows || '| - | 0 | 0 |'}

## Combined Top Opportunities

| Rank | ID | Title | Category | Score | 90-Day Fit | Owner |
|---|---|---|---|---:|---|---|
${combinedRows || '| - | - | No items | - | 0 | - | - |'}

## Owner Rollup

| Owner | Opportunity Count |
|---|---:|
${ownerRows || '| - | 0 |'}

## 90-Day Fit Rollup

| Scope | yes | conditional | other |
|---|---:|---:|---:|
${fitRows}

## Execution Snapshot
- Category feeds published: \`${feedStatus.category_feeds_published ? 'yes' : 'no'}\`
- AI leverage items: ${feedStatus.ai_leverage_total_items || 0}
- Feature-gap items: ${feedStatus.feature_gap_total_items || 0}
- Combined items: ${feedStatus.combined_total_items || 0}
- Command integration ready: \`${commandIntegration.integration_ready ? 'yes' : 'no'}\`
- Command doc path: \`${commandIntegration.command_doc_path || path.relative(ROOT, STRATEGY_DASHBOARD_COMMAND_DOC_PATH)}\`
- Missing feed references: ${missingRefs.length === 0 ? '`none`' : missingRefs.map((ref) => `\`${ref}\``).join(', ')}
- Runtime checklist detected: \`${runtimeHandoff.execution_checklist_detected ? 'yes' : 'no'}\`
- Runtime checklist path: \`${runtimeHandoff.execution_checklist_path || 'not_detected'}\`
- Category feeds ready: \`${gate.category_feeds_ready ? 'yes' : 'no'}\`
- Portfolio feed ready: \`${gate.portfolio_feed_ready ? 'yes' : 'no'}\`
- Command integration ready (gate): \`${gate.command_integration_ready ? 'yes' : 'no'}\`
- Runtime handoff ready: \`${gate.runtime_handoff_ready ? 'yes' : 'no'}\`
- Ready for phase-2 consumers: \`${gate.ready_for_phase2_consumers ? 'yes' : 'no'}\`
`;
}

function verifyManifestAlignment(catalog) {
  const mismatches = [];
  for (const plugin of catalog.plugins) {
    const manifestPath = path.join(ROOT, plugin.manifestPath);
    const lifecyclePath = path.join(path.dirname(manifestPath), 'lifecycle.json');
    if (!fs.existsSync(manifestPath)) {
      mismatches.push({
        plugin: plugin.name,
        issue: `Manifest file missing at ${plugin.manifestPath}`,
      });
      continue;
    }
    const manifest = readJson(manifestPath);
    const lifecycle = readJsonIfExists(lifecyclePath) || {};
    const lifecycleStatus =
      lifecycle.status ||
      lifecycle.lifecycle_status ||
      lifecycle.lifecycleStatus ||
      manifest.status;
    const lifecycleOwner = lifecycle.owner || lifecycle.maintainer || manifest.owner;
    const lifecycleStability = lifecycle.stability || lifecycle.lifecycle || manifest.stability;
    const checks = [
      ['name', manifest.name, plugin.name],
      ['version', manifest.version, plugin.version],
      ['status', lifecycleStatus, plugin.status],
      ['owner', lifecycleOwner, plugin.owner],
      ['stability', lifecycleStability, plugin.stability],
    ];
    for (const [field, manifestValue, catalogValue] of checks) {
      if ((manifestValue || null) !== (catalogValue || null)) {
        mismatches.push({
          plugin: plugin.name,
          issue: `${field} mismatch (manifest=${manifestValue}, catalog=${catalogValue})`,
        });
      }
    }
  }
  return mismatches;
}

function main() {
  const catalogRaw = readText(CATALOG_PATH);
  const catalog = JSON.parse(catalogRaw);
  const readme = readText(README_PATH);
  const features = readText(FEATURES_PATH);
  const sourceFingerprint = computeSourceFingerprint([catalogRaw, readme, features]);

  const { pluginInventory, workflowMatrix, maturityMatrix } = aggregateMatrices(catalog);
  const readmeStats = parseReadmeStats(readme);
  const featuresStats = parseFeaturesStats(features);
  const driftRows = computeDriftRows(catalog.totals, readmeStats, featuresStats);
  const maturityRatios = getMaturityRatios(pluginInventory, maturityMatrix);
  const manifestMismatches = verifyManifestAlignment(catalog);

  const opportunities = buildOpportunities({
    catalog,
    pluginInventory,
    maturityRatios,
    driftRows,
  });

  const capabilityReport = buildCapabilityReport({
    catalog,
    pluginInventory,
    workflowMatrix,
    maturityMatrix,
    driftRows,
    opportunities,
    manifestMismatches,
    sourceFingerprint,
  });
  const opportunityCsv = buildOpportunityCsv(opportunities);
  const trustDigest = buildDocumentationTrustDigest({
    sourceFingerprint,
    driftRows,
    manifestMismatches,
  });
  const aiMaturityScorecards = buildAiMaturityScorecardsPayload({
    sourceFingerprint,
    maturityRatios,
    maturityMatrix,
    pluginInventory,
  });
  const upliftPack = buildAiMaturityUpliftPack({
    sourceFingerprint,
    maturityRatios,
    maturityMatrix,
    pluginInventory,
    aiMaturityScorecards,
  });
  const mondayGraduationReadiness = buildMondayGraduationReadinessPayload({
    catalog,
    pluginInventory,
    workflowMatrix,
    maturityMatrix,
    maturityRatios,
    sourceFingerprint,
  });
  const mandatoryRouteApprovalGovernance =
    buildMandatoryRouteApprovalGovernancePayload({
      pluginInventory,
      opportunities,
      sourceFingerprint,
    });
  const unifiedNextBestActionQueue = buildUnifiedNextBestActionQueuePayload({
    opportunities,
    sourceFingerprint,
  });
  const commandTelemetryAdoption = buildCommandTelemetryAdoptionPayload({
    catalog,
    pluginInventory,
    sourceFingerprint,
  });
  const initiativeRoiInstrumentation = buildInitiativeRoiInstrumentationPayload({
    opportunities,
    sourceFingerprint,
    driftRows,
    maturityRatios,
  });
  const planProgressSnapshotBase = buildPlanProgressSnapshot({
    opportunities,
    driftRows,
    commandTelemetryAdoption,
    aiMaturityScorecards,
    unifiedNextBestActionQueue,
  });
  const sprint6ExecutiveReadout = buildSprint6ExecutiveReadoutPayload({
    sourceFingerprint,
    opportunities,
    planProgressSnapshot: planProgressSnapshotBase,
    initiativeRoiInstrumentation,
    driftRows,
    unifiedNextBestActionQueue,
    aiMaturityScorecards,
    commandTelemetryAdoption,
  });
  const planProgressSnapshot = buildPlanProgressSnapshot({
    opportunities,
    driftRows,
    commandTelemetryAdoption,
    aiMaturityScorecards,
    sprint6ExecutiveReadout,
    unifiedNextBestActionQueue,
  });
  const initiatives = buildInitiatives(
    opportunities,
    {
      ...catalog.totals,
      source_fingerprint: sourceFingerprint,
    },
    planProgressSnapshot
  );
  const executionBoard = buildExecutionBoard(
    opportunities,
    sourceFingerprint,
    planProgressSnapshot,
    sprint6ExecutiveReadout
  );
  const manualReviewReduction = buildManualReviewReductionPayload({
    catalog,
    sourceFingerprint,
  });
  const dataHygieneSunset = buildDataHygieneSunsetPayload({
    catalog,
    sourceFingerprint,
  });
  const crossModelConsultationExpansion = buildCrossModelConsultationExpansionPayload({
    pluginInventory,
    workflowMatrix,
    maturityMatrix,
    sourceFingerprint,
  });
  const forecastSimulationStandardization =
    buildForecastSimulationStandardizationPayload({
      pluginInventory,
      workflowMatrix,
      sourceFingerprint,
    });

  writeText(
    path.join(OUTPUT_DIR, 'opspal-capability-vs-ai-maturity.md'),
    capabilityReport
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-gap-priority-matrix.csv'),
    opportunityCsv
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-90-day-initiatives.md'),
    initiatives
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-90-day-execution-board.md'),
    executionBoard
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-documentation-trust-digest.md'),
    trustDigest
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-ai-maturity-scorecards.json'),
    `${JSON.stringify(aiMaturityScorecards, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-ai-maturity-uplift-pack.md'),
    upliftPack
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-monday-graduation-readiness.json'),
    `${JSON.stringify(mondayGraduationReadiness, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-monday-graduation-readiness.md'),
    buildMondayGraduationReadinessMarkdown(mondayGraduationReadiness)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-mandatory-route-approval-governance.json'),
    `${JSON.stringify(mandatoryRouteApprovalGovernance, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-mandatory-route-approval-governance.md'),
    buildMandatoryRouteApprovalGovernanceMarkdown(mandatoryRouteApprovalGovernance)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-unified-next-best-action-queue.json'),
    `${JSON.stringify(unifiedNextBestActionQueue, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-unified-next-best-action-queue.md'),
    buildUnifiedNextBestActionQueueMarkdown(unifiedNextBestActionQueue)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-command-telemetry-adoption-pack.json'),
    `${JSON.stringify(commandTelemetryAdoption, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-command-telemetry-adoption-pack.md'),
    buildCommandTelemetryAdoptionMarkdown(commandTelemetryAdoption)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-manual-review-reduction-pack.json'),
    `${JSON.stringify(manualReviewReduction, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-manual-review-reduction-pack.md'),
    buildManualReviewReductionMarkdown(manualReviewReduction)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-data-hygiene-sunset-pack.json'),
    `${JSON.stringify(dataHygieneSunset, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-data-hygiene-sunset-pack.md'),
    buildDataHygieneSunsetMarkdown(dataHygieneSunset)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-cross-model-consultation-expansion.json'),
    `${JSON.stringify(crossModelConsultationExpansion, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-cross-model-consultation-expansion.md'),
    buildCrossModelConsultationExpansionMarkdown(crossModelConsultationExpansion)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-forecast-simulation-standardization.json'),
    `${JSON.stringify(forecastSimulationStandardization, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-forecast-simulation-standardization.md'),
    buildForecastSimulationStandardizationMarkdown(forecastSimulationStandardization)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-initiative-roi-instrumentation.json'),
    `${JSON.stringify(initiativeRoiInstrumentation, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-initiative-roi-instrumentation.md'),
    buildInitiativeRoiInstrumentationMarkdown(initiativeRoiInstrumentation)
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-sprint6-executive-readout.json'),
    `${JSON.stringify(sprint6ExecutiveReadout, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'opspal-sprint6-executive-readout.md'),
    buildSprint6ExecutiveReadoutMarkdown(sprint6ExecutiveReadout)
  );

  const aiGapPayload = buildDashboardPayload(
    opportunities,
    'ai_leverage',
    sourceFingerprint
  );
  const featureGapPayload = buildDashboardPayload(
    opportunities,
    'feature_gap',
    sourceFingerprint
  );
  const strategyDashboardPortfolio = buildStrategyDashboardPortfolioPayload(
    aiGapPayload,
    featureGapPayload,
    sourceFingerprint
  );
  writeText(
    path.join(OUTPUT_DIR, 'strategy-dashboard-ai-gaps.json'),
    `${JSON.stringify(aiGapPayload, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'strategy-dashboard-feature-gaps.json'),
    `${JSON.stringify(featureGapPayload, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'strategy-dashboard-portfolio.json'),
    `${JSON.stringify(strategyDashboardPortfolio, null, 2)}\n`
  );
  writeText(
    path.join(OUTPUT_DIR, 'strategy-dashboard-portfolio.md'),
    buildStrategyDashboardPortfolioMarkdown(strategyDashboardPortfolio)
  );

  const contracts = buildContracts();
  writeText(
    path.join(CONTRACTS_DIR, 'opspal-capability-contract.schema.json'),
    `${JSON.stringify(contracts.capabilitySchema, null, 2)}\n`
  );
  writeText(
    path.join(CONTRACTS_DIR, 'opspal-opportunity-scoring-contract.schema.json'),
    `${JSON.stringify(contracts.opportunitySchema, null, 2)}\n`
  );
  writeText(
    path.join(CONTRACTS_DIR, 'opspal-command-telemetry-contract.schema.json'),
    `${JSON.stringify(contracts.telemetrySchema, null, 2)}\n`
  );

  const summary = [
    `Generated executive artifacts in ${path.relative(ROOT, OUTPUT_DIR)}`,
    `Generated contract schemas in ${path.relative(ROOT, CONTRACTS_DIR)}`,
    `Source fingerprint ${sourceFingerprint}`,
    `Detected ${driftRows.length} documentation drift row(s)`,
    `Detected ${manifestMismatches.length} manifest alignment mismatch(es)`,
    `Top opportunity: ${opportunities[0].id} (${opportunities[0].title})`,
  ].join('\n');
  console.log(summary);

  const topOpportunity = opportunities[0] || null;
  return {
    top_risk_class: topOpportunity ? deriveOpportunityRiskClass(topOpportunity) : 'medium',
    opportunity_count: opportunities.length,
  };
}

const telemetry = {
  command: 'exec:generate',
  agent: 'exec-gap-analysis-generator',
  source_plugin: 'opspal-core',
  outcome: 'success',
  time_saved_estimate_minutes: 20,
  human_override: false,
  rework_required: false,
  risk_class: 'medium',
};

try {
  const summary = main();
  if (summary && typeof summary === 'object') {
    telemetry.risk_class = summary.top_risk_class || 'medium';
  }
  emitCommandTelemetry(telemetry, { silent: true });
} catch (error) {
  telemetry.outcome = 'failed';
  telemetry.rework_required = true;
  emitCommandTelemetry(telemetry, { silent: true });
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
