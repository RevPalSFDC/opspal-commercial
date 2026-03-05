#!/usr/bin/env node

/**
 * Keyword Detector for Progressive Disclosure Context Injection
 *
 * Analyzes user prompts for keywords and intent patterns to determine
 * which context files should be injected for the orchestrator agent.
 *
 * Usage:
 *   node keyword-detector.js <prompt-text> [--config <path-to-keyword-mapping.json>]
 *
 * Example:
 *   node keyword-detector.js "Deploy custom field with FLS to Account"
 *   node keyword-detector.js "Bulk operation with parallel agents" --config contexts/keyword-mapping.json
 */

const fs = require('fs');
const path = require('path');

// Default configuration path
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../contexts/keyword-mapping.json');

/**
 * Load keyword mapping configuration
 */
function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error(`Error loading keyword mapping config: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Calculate match score for a context against the prompt
 */
function calculateMatchScore(prompt, context, config) {
  const promptLower = prompt.toLowerCase();
  let score = 0;
  const matchedKeywords = [];
  const matchedPatterns = [];

  // Check keyword matches
  for (const keyword of context.keywords || []) {
    if (promptLower.includes(keyword.toLowerCase())) {
      score += 1;
      matchedKeywords.push(keyword);
    }
  }

  // Check intent pattern matches (regex)
  for (const pattern of context.intentPatterns || []) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(prompt)) {
        score += 2; // Intent patterns worth more than keywords
        matchedPatterns.push(pattern);
      }
    } catch (error) {
      console.error(`Invalid regex pattern: ${pattern}`);
    }
  }

  // Apply priority weighting
  const priorityWeights = config.rules?.priorityWeighting || { high: 3, medium: 2, low: 1 };
  const priorityMultiplier = priorityWeights[context.priority] || 1;
  const weightedScore = score * priorityMultiplier;

  return {
    score: weightedScore,
    rawScore: score,
    matchedKeywords,
    matchedPatterns,
    priority: context.priority
  };
}

/**
 * Detect matching contexts from prompt
 */
function detectContexts(prompt, config) {
  const matches = [];
  const detectedNames = new Set();

  // Handle both array and object format for contexts
  const contexts = Array.isArray(config.contexts)
    ? config.contexts
    : Object.entries(config.contexts || {}).map(([name, ctx]) => ({ contextName: name, ...ctx }));

  // FIRST PASS: Detect contexts based on keywords and patterns
  for (const context of contexts) {
    const contextName = context.contextName;
    const matchResult = calculateMatchScore(prompt, context, config);

    // Only include if minimum keyword matches met
    const minKeywordMatches = config.rules?.minKeywordMatches || 1;
    if (matchResult.rawScore >= minKeywordMatches) {
      matches.push({
        contextName,
        contextFile: context.contextFile,
        priority: context.priority,
        description: context.description,
        ...matchResult
      });
      detectedNames.add(contextName);
    }
  }

  // SECOND PASS: Add related contexts for high-scoring detections
  const relatedContextThreshold = config.rules?.relatedContextThreshold || 12;
  const relatedContextMinScore = config.rules?.relatedContextMinScore || 6;
  const relatedToAdd = [];

  for (const detected of matches) {
    // Only suggest related contexts for high-scoring detections
    if (detected.score >= relatedContextThreshold) {
      const context = contexts.find(c => c.contextName === detected.contextName);

      if (context && context.relatedContexts && context.relatedContexts.length > 0) {
        for (const relatedName of context.relatedContexts) {
          if (!detectedNames.has(relatedName)) {
            const relatedContext = contexts.find(c => c.contextName === relatedName);

            if (relatedContext) {
              relatedToAdd.push({
                contextName: relatedName,
                contextFile: relatedContext.contextFile,
                priority: relatedContext.priority,
                description: relatedContext.description,
                score: relatedContextMinScore,
                rawScore: relatedContextMinScore,
                matchedKeywords: [],
                matchedPatterns: [],
                suggestedBy: detected.contextName
              });
              detectedNames.add(relatedName);
            }
          }
        }
      }
    }
  }

  // Combine primary and related contexts
  const allMatches = [...matches, ...relatedToAdd];

  // Sort by weighted score (descending), then by priority
  allMatches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
  });

  // Limit to maxContextsPerRequest
  const maxContexts = config.rules?.maxContextsPerRequest || 8;
  const limitedMatches = allMatches.slice(0, maxContexts);

  return {
    matches: limitedMatches,
    totalMatches: allMatches.length,
    maxContextsAllowed: maxContexts,
    truncated: allMatches.length > maxContexts,
    relatedContextsAdded: relatedToAdd.length
  };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let prompt = '';
  let configPath = DEFAULT_CONFIG_PATH;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node keyword-detector.js <prompt-text> [--config <path>]

Arguments:
  <prompt-text>           User prompt to analyze for keywords
  --config <path>         Path to keyword-mapping.json (default: ../../contexts/keyword-mapping.json)
  --help, -h              Show this help message

Examples:
  node keyword-detector.js "Deploy custom field with FLS"
  node keyword-detector.js "Bulk operation with parallel agents" --config custom-config.json

Output:
  JSON object with matched contexts sorted by relevance

Output Format:
  {
    "matches": [
      {
        "contextName": "fls-bundling-enforcement",
        "contextFile": "orchestrator/fls-bundling-enforcement.md",
        "priority": "high",
        "score": 9,
        "rawScore": 3,
        "matchedKeywords": ["deploy field", "FLS", "custom field"],
        "matchedPatterns": ["(create|deploy|add).*(custom )?field"]
      }
    ],
    "totalMatches": 2,
    "maxContextsAllowed": 8,
    "truncated": false
  }
`);
      process.exit(0);
    } else {
      prompt += (prompt ? ' ' : '') + args[i];
    }
  }

  if (!prompt) {
    console.error('Error: No prompt provided');
    console.error('Usage: node keyword-detector.js <prompt-text> [--config <path>]');
    console.error('Use --help for more information');
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig(configPath);

  // Detect contexts
  const result = detectContexts(prompt, config);

  // Output JSON result
  console.log(JSON.stringify(result, null, 2));
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  loadConfig,
  calculateMatchScore,
  detectContexts
};
