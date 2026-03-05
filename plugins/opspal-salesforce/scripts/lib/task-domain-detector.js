#!/usr/bin/env node

/**
 * Task Domain Detector
 *
 * Automatically detects the domain (SFDC, HubSpot, CrossPlatform, Assessment)
 * from a task description using keyword matching and scoring algorithms.
 *
 * Usage:
 *   node scripts/lib/task-domain-detector.js "Run a CPQ assessment for eta-corp"
 *   node scripts/lib/task-domain-detector.js --agent sfdc-revops-auditor --task "Comprehensive RevOps audit"
 *
 * Returns JSON with domain, required_agent_pattern, required_path, and suggested_agents
 */

const fs = require('fs');
const path = require('path');

// Load agent routing rules
const ROUTING_RULES_PATH = path.join(__dirname, '../../../.claude/agent-routing-rules.json');

function loadRoutingRules() {
  if (!fs.existsSync(ROUTING_RULES_PATH)) {
    console.error(`❌ ERROR: Routing rules not found at ${ROUTING_RULES_PATH}`);
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(ROUTING_RULES_PATH, 'utf8'));
}

function detectDomain(taskDescription) {
  const rules = loadRoutingRules();
  const normalized = taskDescription.toLowerCase();

  // Score each domain by keyword matches
  const scores = rules.rules.map(rule => {
    const matchCount = rule.keywords.filter(keyword =>
      normalized.includes(keyword.toLowerCase())
    ).length;

    return {
      domain: rule.domain,
      score: matchCount,
      matchedKeywords: rule.keywords.filter(keyword =>
        normalized.includes(keyword.toLowerCase())
      ),
      rule: rule
    };
  });

  // Sort by score descending, then by priority order
  const priorityOrder = rules.detection_algorithm.priority_order;
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return priorityOrder.indexOf(a.domain) - priorityOrder.indexOf(b.domain);
  });

  const topScore = scores[0];
  const secondScore = scores[1];

  // Check for clear winner (score >= 2 and > second place)
  if (topScore.score >= 2 && topScore.score > secondScore.score) {
    return {
      domain: topScore.domain,
      confidence: 'high',
      score: topScore.score,
      matchedKeywords: topScore.matchedKeywords,
      required_agent_patterns: topScore.rule.required_agent_patterns,
      required_path_prefix: topScore.rule.required_path_prefix || topScore.rule.path_determination,
      suggested_agents: rules.suggestions[topScore.domain] || [],
      blocked_agents: topScore.rule.blocked_agents,
      blocked_reason: topScore.rule.blocked_reason
    };
  }

  // Tie or low confidence - return ambiguous
  return {
    domain: 'AMBIGUOUS',
    confidence: 'low',
    candidates: scores.filter(s => s.score > 0).map(s => ({
      domain: s.domain,
      score: s.score,
      matchedKeywords: s.matchedKeywords
    })),
    message: rules.error_messages.ambiguous_domain.replace(
      '{matched_domains}',
      scores.filter(s => s.score > 0)
        .map(s => `  - ${s.domain} (score: ${s.score}, keywords: ${s.matchedKeywords.join(', ')})`)
        .join('\n')
    )
  };
}

function validateAgent(agentName, domain) {
  const rules = loadRoutingRules();
  const domainRule = rules.rules.find(r => r.domain === domain);

  if (!domainRule) {
    return {
      valid: false,
      reason: `Unknown domain: ${domain}`
    };
  }

  // Check if agent is blocked
  if (domainRule.blocked_agents.includes(agentName)) {
    return {
      valid: false,
      reason: domainRule.blocked_reason,
      suggested_agents: rules.suggestions[domain]
    };
  }

  // Check if agent matches required pattern
  const matchesPattern = domainRule.required_agent_patterns.some(pattern => {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return regex.test(agentName);
  });

  if (!matchesPattern) {
    return {
      valid: false,
      reason: `Agent '${agentName}' does not match required pattern for domain '${domain}'`,
      required_patterns: domainRule.required_agent_patterns,
      suggested_agents: rules.suggestions[domain]
    };
  }

  // Check exceptions
  const hasException = domainRule.exceptions.some(exc => {
    return exc.allowed_agents.includes(agentName);
  });

  if (matchesPattern || hasException) {
    return {
      valid: true,
      reason: 'Agent matches domain requirements'
    };
  }

  return {
    valid: false,
    reason: `Agent '${agentName}' not allowed for domain '${domain}'`,
    suggested_agents: rules.suggestions[domain]
  };
}

function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let taskDescription = '';
  let agentName = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && i + 1 < args.length) {
      agentName = args[i + 1];
      i++;
    } else if (args[i] === '--task' && i + 1 < args.length) {
      taskDescription = args[i + 1];
      i++;
    } else {
      taskDescription = args[i];
    }
  }

  if (!taskDescription) {
    console.error('Usage: task-domain-detector.js [--agent AGENT_NAME] [--task] "TASK_DESCRIPTION"');
    console.error('Example: task-domain-detector.js "Run a CPQ assessment for eta-corp"');
    process.exit(1);
  }

  // Detect domain
  const detection = detectDomain(taskDescription);

  // If agent provided, validate it
  if (agentName && detection.domain !== 'AMBIGUOUS') {
    const validation = validateAgent(agentName, detection.domain);
    detection.agent_validation = validation;
  }

  // Output JSON
  console.log(JSON.stringify(detection, null, 2));

  // Exit code: 0 if valid or no agent provided, 1 if invalid or ambiguous
  if (detection.domain === 'AMBIGUOUS') {
    process.exit(1);
  }

  if (agentName && detection.agent_validation && !detection.agent_validation.valid) {
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { detectDomain, validateAgent };
