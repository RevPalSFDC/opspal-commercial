#!/usr/bin/env node
'use strict';

/**
 * Intake Completeness Scorer
 *
 * Scores how complete a natural-language project request is across
 * eight dimensions used for active intake gating.
 *
 * Usage:
 *   node intake-completeness-scorer.js --json "Kickoff a new project..."
 *   node intake-completeness-scorer.js "Kickoff a new project..."
 */

const DIMENSIONS = [
  {
    id: 'business_goal',
    label: 'Business goal',
    patterns: [
      /\b(goal|objective|outcome|target)\b/i,
      /\b(increase|decrease|improve|reduce|fix|solve)\b/i,
      /\bwe need to\b/i,
      /\bi want to\b/i,
      /\bproblem\b/i
    ]
  },
  {
    id: 'platform',
    label: 'Platform/system',
    patterns: [
      /\b(salesforce|hubspot|marketo|asana|n8n)\b/i,
      /\bcross[-\s]?platform\b/i,
      /\binternal\b/i
    ]
  },
  {
    id: 'scope',
    label: 'Scope details',
    patterns: [
      /\b(across|all|multiple|several|single)\b/i,
      /\b(object|objects|record type|team|department|workflow|process)\b/i,
      /\b(including|with|along with)\b/i
    ]
  },
  {
    id: 'success_criteria',
    label: 'Success criteria',
    patterns: [
      /\b(success|done when|acceptance|kpi|metric|measure)\b/i,
      /\b(target|baseline|expected)\b/i
    ]
  },
  {
    id: 'constraints',
    label: 'Constraints',
    patterns: [
      /\b(constraint|limit|must|cannot|can\'t|should not)\b/i,
      /\b(security|compliance|budget|resource|permission)\b/i
    ]
  },
  {
    id: 'timeline',
    label: 'Timeline',
    patterns: [
      /\b(timeline|deadline|due|milestone|rollout)\b/i,
      /\b(asap|this week|this month|next week|next month)\b/i,
      /\bq[1-4]\b/i,
      /\b\d+\s*(day|days|week|weeks|month|months)\b/i
    ]
  },
  {
    id: 'stakeholders',
    label: 'Stakeholders',
    patterns: [
      /\b(owner|stakeholder|team|teams|users|admins|sales|marketing|ops)\b/i,
      /\b(customer|customers|leadership|manager)\b/i
    ]
  },
  {
    id: 'risks_non_goals',
    label: 'Risks / non-goals',
    patterns: [
      /\b(risk|risks|dependency|dependencies|assumption)\b/i,
      /\b(non[-\s]?goal|out of scope|exclude|excluded)\b/i,
      /\b(rollback|fallback)\b/i
    ]
  }
];

function normalizeText(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function isDimensionPresent(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function scoreRequest(text) {
  const normalized = normalizeText(text);
  const present = [];
  const missing = [];
  const dimensions = {};

  for (const dimension of DIMENSIONS) {
    const hit = isDimensionPresent(normalized, dimension.patterns);
    dimensions[dimension.id] = hit;
    if (hit) {
      present.push(dimension.id);
    } else {
      missing.push(dimension.id);
    }
  }

  const total = DIMENSIONS.length;
  const score = total === 0 ? 0 : present.length / total;

  return {
    score: Number(score.toFixed(3)),
    present,
    missing,
    dimensions
  };
}

function formatResult(result) {
  const lines = [];
  lines.push(`Completeness Score: ${result.score}`);
  lines.push(`Present (${result.present.length}): ${result.present.join(', ') || 'none'}`);
  lines.push(`Missing (${result.missing.length}): ${result.missing.join(', ') || 'none'}`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const textParts = args.filter((arg) => arg !== '--json');
  const text = textParts.join(' ');

  const result = scoreRequest(text);

  if (jsonMode) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(formatResult(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  scoreRequest,
  DIMENSIONS
};
