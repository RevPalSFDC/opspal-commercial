#!/usr/bin/env node
/**
 * Consultation Trigger
 *
 * Determines when Gemini consultation should be suggested based on:
 * - Task complexity (>= 0.85 suggests cross-model consultation)
 * - Routing confidence (< 40% suggests uncertainty)
 * - Agent struggles (error patterns, retries, low confidence signals)
 * - No agent match for complex tasks
 * - ACE skill history (learning from past consultation outcomes)
 *
 * Can be called by:
 * - Routing hooks (subagent-utilization-booster.sh)
 * - Other agents when they're struggling
 * - PostToolUse hooks on errors
 *
 * @module consultation-trigger
 * @version 1.1.0
 */

const fs = require('fs');
const path = require('path');

// ACE integration (optional - gracefully degrades if not available)
let aceIntegration = null;
try {
  const { getACEIntegration } = require('./ace-integration');
  aceIntegration = getACEIntegration();
} catch (e) {
  // ACE not available - will use default triggers
}

/**
 * Consultation trigger thresholds
 */
const THRESHOLDS = {
  // Complexity threshold for suggesting consultation
  VERY_HIGH_COMPLEXITY: 0.85,

  // Confidence threshold below which consultation is suggested
  LOW_CONFIDENCE: 40,

  // Number of errors/retries that suggest consultation
  ERROR_COUNT_TRIGGER: 2,

  // Uncertainty phrases in agent output
  UNCERTAINTY_PHRASES: [
    "i'm not sure",
    "i'm uncertain",
    "i don't know",
    "it's unclear",
    "might be",
    "could be",
    "possibly",
    "i think",
    "i believe",
    "not confident",
    "uncertain about",
    "hard to say",
    "difficult to determine",
    "multiple approaches",
    "several options",
    "trade-offs",
    "pros and cons",
    "it depends",
    "without more context"
  ]
};

function isGeminiDisabled() {
  const value = String(process.env.GEMINI_DISABLED || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/**
 * Check if consultation should be triggered based on routing metrics
 * @param {object} routingData - Routing hook output
 * @returns {object} - Consultation recommendation
 */
function checkRoutingTrigger(routingData) {
  const {
    complexity = 0,
    confidence = 0,
    suggestedAgent = null,
    action = ''
  } = routingData;

  const result = {
    shouldConsult: false,
    reason: null,
    urgency: 'low',
    consultationType: null
  };

  // Very high complexity without clear agent match
  if (complexity >= THRESHOLDS.VERY_HIGH_COMPLEXITY) {
    if (!suggestedAgent || confidence < THRESHOLDS.LOW_CONFIDENCE) {
      result.shouldConsult = true;
      result.reason = `Very high complexity (${Math.round(complexity * 100)}%) with low confidence - cross-model consultation recommended`;
      result.urgency = 'high';
      result.consultationType = 'complexity';
    } else {
      // High complexity with agent - suggest consultation as backup
      result.shouldConsult = true;
      result.reason = `High complexity task (${Math.round(complexity * 100)}%) - consider Gemini consultation for alternative perspective`;
      result.urgency = 'medium';
      result.consultationType = 'verification';
    }
  }

  // Low confidence in routing
  if (confidence > 0 && confidence < THRESHOLDS.LOW_CONFIDENCE) {
    result.shouldConsult = true;
    result.reason = `Low routing confidence (${confidence}%) - Gemini consultation may provide clarity`;
    result.urgency = result.urgency === 'high' ? 'high' : 'medium';
    result.consultationType = 'uncertainty';
  }

  return result;
}

/**
 * Check if agent output indicates struggle/uncertainty
 * @param {string} agentOutput - Text output from an agent
 * @returns {object} - Consultation recommendation
 */
function checkAgentUncertainty(agentOutput) {
  const result = {
    shouldConsult: false,
    reason: null,
    urgency: 'low',
    uncertaintySignals: [],
    uncertaintyScore: 0
  };

  if (!agentOutput) return result;

  const outputLower = agentOutput.toLowerCase();

  // Count uncertainty phrases
  for (const phrase of THRESHOLDS.UNCERTAINTY_PHRASES) {
    if (outputLower.includes(phrase)) {
      result.uncertaintySignals.push(phrase);
    }
  }

  // Calculate uncertainty score
  result.uncertaintyScore = Math.min(result.uncertaintySignals.length / 5, 1);

  if (result.uncertaintySignals.length >= 3) {
    result.shouldConsult = true;
    result.reason = `Agent output shows high uncertainty (${result.uncertaintySignals.length} signals detected)`;
    result.urgency = 'high';
  } else if (result.uncertaintySignals.length >= 2) {
    result.shouldConsult = true;
    result.reason = `Agent output shows moderate uncertainty`;
    result.urgency = 'medium';
  }

  return result;
}

/**
 * Check if error patterns suggest consultation would help
 * @param {object} errorData - Error information
 * @returns {object} - Consultation recommendation
 */
function checkErrorTrigger(errorData) {
  const {
    errorCount = 0,
    errorTypes = [],
    lastError = null,
    retryCount = 0
  } = errorData;

  const result = {
    shouldConsult: false,
    reason: null,
    urgency: 'low',
    consultationType: null
  };

  // Multiple errors suggest stuck pattern
  if (errorCount >= THRESHOLDS.ERROR_COUNT_TRIGGER || retryCount >= THRESHOLDS.ERROR_COUNT_TRIGGER) {
    result.shouldConsult = true;
    result.reason = `Multiple errors/retries (${errorCount} errors, ${retryCount} retries) - Gemini may offer alternative approach`;
    result.urgency = 'high';
    result.consultationType = 'debugging';
  }

  // Specific error types that benefit from cross-model consultation
  const consultationBenefitErrors = [
    'architecture',
    'design',
    'pattern',
    'approach',
    'strategy',
    'trade-off',
    'decision'
  ];

  if (lastError) {
    const errorLower = lastError.toLowerCase();
    for (const keyword of consultationBenefitErrors) {
      if (errorLower.includes(keyword)) {
        result.shouldConsult = true;
        result.reason = `Error relates to ${keyword} - cross-model consultation may help`;
        result.urgency = 'medium';
        result.consultationType = 'architecture';
        break;
      }
    }
  }

  return result;
}

/**
 * Generate consultation suggestion message
 * @param {object} trigger - Trigger check result
 * @returns {string} - Formatted suggestion message
 */
function formatConsultationSuggestion(trigger) {
  if (!trigger.shouldConsult) {
    return null;
  }

  const urgencyIcons = {
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  };

  const icon = urgencyIcons[trigger.urgency] || '💡';

  let message = `\n${icon} GEMINI CONSULTATION SUGGESTED\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `Reason: ${trigger.reason}\n`;
  message += `Urgency: ${trigger.urgency.toUpperCase()}\n`;

  if (trigger.consultationType) {
    message += `Type: ${trigger.consultationType}\n`;
  }

  message += `\nTo consult Gemini:\n`;
  message += `  Task(subagent_type='gemini-consult', prompt='<your question>')\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  return message;
}

/**
 * Check ACE history for learning-based recommendations
 * @param {object} data - Task data including agent, topic, complexity, confidence
 * @returns {Promise<object>} - ACE-based recommendation
 */
async function checkACEHistory(data) {
  const result = {
    shouldConsult: false,
    reason: null,
    urgency: 'low',
    consultationType: 'ace-learning',
    aceConfidence: null
  };

  if (!aceIntegration) {
    return result;
  }

  try {
    const aceRecommendation = await aceIntegration.shouldConsult({
      agent: data.agent || 'unknown',
      topic: data.topic || null,
      complexity: data.routing?.complexity || 0.5,
      confidence: data.routing?.confidence || 50
    });

    if (aceRecommendation.recommended) {
      result.shouldConsult = true;
      result.reason = `ACE history: ${aceRecommendation.reason}`;
      result.aceConfidence = aceRecommendation.confidence;

      // Set urgency based on ACE confidence
      if (aceRecommendation.confidence >= 70) {
        result.urgency = 'high';
      } else if (aceRecommendation.confidence >= 50) {
        result.urgency = 'medium';
      }
    }

    return result;
  } catch (error) {
    // ACE check failed - return no recommendation
    return result;
  }
}

/**
 * Combined check for all trigger conditions
 * @param {object} data - All available data
 * @returns {object} - Combined consultation recommendation
 */
function checkAllTriggers(data) {
  if (isGeminiDisabled()) {
    return {
      shouldConsult: false,
      reasons: [],
      urgency: 'low',
      triggers: [],
      suggestion: null,
      disabled: true
    };
  }

  const results = [];

  if (data.routing) {
    results.push(checkRoutingTrigger(data.routing));
  }

  if (data.agentOutput) {
    results.push(checkAgentUncertainty(data.agentOutput));
  }

  if (data.error) {
    results.push(checkErrorTrigger(data.error));
  }

  // Combine results - if any trigger fires, recommend consultation
  const combined = {
    shouldConsult: results.some(r => r.shouldConsult),
    reasons: results.filter(r => r.shouldConsult).map(r => r.reason),
    urgency: 'low',
    triggers: results.filter(r => r.shouldConsult)
  };

  // Set urgency to highest among triggers
  for (const result of results) {
    if (result.urgency === 'high') combined.urgency = 'high';
    else if (result.urgency === 'medium' && combined.urgency !== 'high') combined.urgency = 'medium';
  }

  combined.suggestion = formatConsultationSuggestion({
    shouldConsult: combined.shouldConsult,
    reason: combined.reasons.join('; '),
    urgency: combined.urgency
  });

  return combined;
}

/**
 * Combined check for all trigger conditions including ACE history (async)
 * @param {object} data - All available data
 * @returns {Promise<object>} - Combined consultation recommendation with ACE learning
 */
async function checkAllTriggersWithACE(data) {
  // Start with synchronous checks
  const combined = checkAllTriggers(data);

  // Add ACE history check if available
  if (aceIntegration) {
    try {
      const aceResult = await checkACEHistory(data);

      if (aceResult.shouldConsult) {
        combined.shouldConsult = true;
        combined.reasons.push(aceResult.reason);
        combined.triggers.push(aceResult);
        combined.aceConfidence = aceResult.aceConfidence;

        // ACE high-confidence recommendations override urgency
        if (aceResult.urgency === 'high' && aceResult.aceConfidence >= 70) {
          combined.urgency = 'high';
        } else if (aceResult.urgency === 'medium' && combined.urgency === 'low') {
          combined.urgency = 'medium';
        }

        // Regenerate suggestion with ACE data
        combined.suggestion = formatConsultationSuggestion({
          shouldConsult: combined.shouldConsult,
          reason: combined.reasons.join('; '),
          urgency: combined.urgency
        });
      }
    } catch (e) {
      // ACE check failed - continue with regular triggers
    }
  }

  return combined;
}

// Export functions
module.exports = {
  checkRoutingTrigger,
  checkAgentUncertainty,
  checkErrorTrigger,
  checkAllTriggers,
  checkAllTriggersWithACE,
  checkACEHistory,
  formatConsultationSuggestion,
  isGeminiDisabled,
  THRESHOLDS,
  aceIntegration
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json-only');

  if (args.includes('--help')) {
    console.log(`
Consultation Trigger - Determines when to suggest Gemini consultation

Usage:
  node consultation-trigger.js --routing '{"complexity": 0.9, "confidence": 30}'
  node consultation-trigger.js --output "I'm not sure which approach is best..."
  node consultation-trigger.js --error '{"errorCount": 3, "lastError": "design decision"}'
  node consultation-trigger.js --all '{"routing": {...}, "agentOutput": "...", "error": {...}}'

Options:
  --routing JSON     Check routing metrics
  --output TEXT      Check agent output for uncertainty
  --error JSON       Check error patterns
  --all JSON         Check all triggers combined
  --json-only        Emit JSON only (suppress human-readable suggestion text)
  --thresholds       Show current thresholds

Thresholds:
  VERY_HIGH_COMPLEXITY: ${THRESHOLDS.VERY_HIGH_COMPLEXITY}
  LOW_CONFIDENCE: ${THRESHOLDS.LOW_CONFIDENCE}%
  ERROR_COUNT_TRIGGER: ${THRESHOLDS.ERROR_COUNT_TRIGGER}
`);
    process.exit(0);
  }

  if (args.includes('--thresholds')) {
    console.log(JSON.stringify(THRESHOLDS, null, 2));
    process.exit(0);
  }

  // Parse arguments
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
  };

  let result = null;

  const routingArg = getArg('routing');
  if (routingArg) {
    try {
      const routing = JSON.parse(routingArg);
      result = checkRoutingTrigger(routing);
    } catch (e) {
      console.error('Invalid routing JSON:', e.message);
      process.exit(1);
    }
  }

  const outputArg = getArg('output');
  if (outputArg) {
    result = checkAgentUncertainty(outputArg);
  }

  const errorArg = getArg('error');
  if (errorArg) {
    try {
      const error = JSON.parse(errorArg);
      result = checkErrorTrigger(error);
    } catch (e) {
      console.error('Invalid error JSON:', e.message);
      process.exit(1);
    }
  }

  const allArg = getArg('all');
  if (allArg) {
    try {
      const data = JSON.parse(allArg);
      result = checkAllTriggers(data);
    } catch (e) {
      console.error('Invalid JSON:', e.message);
      process.exit(1);
    }
  }

  if (result) {
    console.log(JSON.stringify(result, null, 2));
    if (!jsonOnly && result.suggestion) {
      console.log(result.suggestion);
    }
  } else {
    console.error('No check specified. Use --help for usage.');
    process.exit(1);
  }
}
