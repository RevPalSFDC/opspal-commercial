#!/usr/bin/env node

/**
 * Context Injector for Progressive Disclosure
 *
 * Reads matched context files and injects them into the user prompt
 * for Claude to process with additional context.
 *
 * Usage:
 *   node context-injector.js <matched-contexts-json> [--base-dir <path>]
 *
 * Example:
 *   node context-injector.js '{"matches":[{"contextFile":"orchestrator/fls-bundling-enforcement.md"}]}'
 *   echo '{"matches":[...]}' | node context-injector.js --stdin
 */

const fs = require('fs');
const path = require('path');

// Default base directory for context files
const DEFAULT_BASE_DIR = path.join(__dirname, '../../contexts');

/**
 * Read context file content
 */
function readContextFile(contextFile, baseDir = DEFAULT_BASE_DIR) {
  const fullPath = path.join(baseDir, contextFile);

  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    console.error(`Warning: Could not read context file ${contextFile}: ${error.message}`);
    return null;
  }
}

/**
 * Format context for injection
 */
function formatContext(contextName, contextContent, matchInfo) {
  const header = `
═══════════════════════════════════════════════════════════════════════════════
🔍 PROGRESSIVE DISCLOSURE CONTEXT: ${contextName}
═══════════════════════════════════════════════════════════════════════════════

**Auto-loaded based on keyword detection**:
  - Matched keywords: ${matchInfo.matchedKeywords.join(', ') || 'none'}
  - Matched patterns: ${matchInfo.matchedPatterns.length > 0 ? matchInfo.matchedPatterns.length + ' pattern(s)' : 'none'}
  - Priority: ${matchInfo.priority}
  - Relevance score: ${matchInfo.score}

**Context file**: ${matchInfo.contextFile}

`;

  const footer = `
═══════════════════════════════════════════════════════════════════════════════
END OF CONTEXT: ${contextName}
═══════════════════════════════════════════════════════════════════════════════
`;

  return header + contextContent + footer;
}

/**
 * Inject contexts into prompt
 */
function injectContexts(matchedContexts, baseDir = DEFAULT_BASE_DIR) {
  const injectedContexts = [];
  const failedContexts = [];

  for (const match of matchedContexts.matches || []) {
    const contextContent = readContextFile(match.contextFile, baseDir);

    if (contextContent) {
      const formattedContext = formatContext(match.contextName, contextContent, match);
      injectedContexts.push(formattedContext);
    } else {
      failedContexts.push(match.contextFile);
    }
  }

  // Build injection message
  let injectionMessage = '';

  if (injectedContexts.length > 0) {
    injectionMessage += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 PROGRESSIVE DISCLOSURE SYSTEM ACTIVATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**System**: Keyword detection identified ${injectedContexts.length} relevant context${injectedContexts.length > 1 ? 's' : ''}
for this request. The following detailed context files have been automatically
loaded to enhance your response capabilities:

`;

    injectedContexts.forEach((context, index) => {
      injectionMessage += context;
      if (index < injectedContexts.length - 1) {
        injectionMessage += '\n\n';
      }
    });

    injectionMessage += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF INJECTED CONTEXTS (${injectedContexts.length} context${injectedContexts.length > 1 ? 's' : ''} loaded)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Instructions**: Use the above context to inform your response. These contexts
provide detailed implementation patterns, code examples, and best practices relevant
to the user's request.

`;
  }

  if (failedContexts.length > 0) {
    injectionMessage += `
⚠️  Warning: Could not load ${failedContexts.length} context file(s): ${failedContexts.join(', ')}
`;
  }

  return {
    injectionMessage,
    contextsInjected: injectedContexts.length,
    contextsFailed: failedContexts.length,
    totalContexts: matchedContexts.matches?.length || 0
  };
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let matchedContextsJson = '';
  let baseDir = DEFAULT_BASE_DIR;
  let useStdin = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-dir' && i + 1 < args.length) {
      baseDir = args[i + 1];
      i++;
    } else if (args[i] === '--stdin') {
      useStdin = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node context-injector.js <matched-contexts-json> [options]

Arguments:
  <matched-contexts-json>  JSON output from keyword-detector.js
  --base-dir <path>        Base directory for context files (default: ../../contexts)
  --stdin                  Read matched contexts from stdin
  --help, -h               Show this help message

Examples:
  node context-injector.js '{"matches":[{"contextFile":"orchestrator/fls-bundling-enforcement.md","contextName":"fls-bundling-enforcement","priority":"high","score":12,"matchedKeywords":["FLS"],"matchedPatterns":[]}]}'

  node keyword-detector.js "Deploy field" | node context-injector.js --stdin

Output:
  Formatted context injection message to be prepended to user prompt
`);
      process.exit(0);
    } else {
      matchedContextsJson += (matchedContextsJson ? ' ' : '') + args[i];
    }
  }

  // Read from stdin if requested
  if (useStdin) {
    const stdin = fs.readFileSync(0, 'utf8');
    matchedContextsJson = stdin.trim();
  }

  if (!matchedContextsJson) {
    console.error('Error: No matched contexts JSON provided');
    console.error('Usage: node context-injector.js <matched-contexts-json> [options]');
    console.error('Use --help for more information');
    process.exit(1);
  }

  // Parse matched contexts
  let matchedContexts;
  try {
    matchedContexts = JSON.parse(matchedContextsJson);
  } catch (error) {
    console.error(`Error parsing matched contexts JSON: ${error.message}`);
    process.exit(1);
  }

  // Inject contexts
  const result = injectContexts(matchedContexts, baseDir);

  // Output injection message
  console.log(result.injectionMessage);

  // Output metadata to stderr for logging
  console.error(`[Context Injector] Injected ${result.contextsInjected}/${result.totalContexts} contexts`);
  if (result.contextsFailed > 0) {
    console.error(`[Context Injector] Failed to load ${result.contextsFailed} context(s)`);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for testing
module.exports = {
  readContextFile,
  formatContext,
  injectContexts
};
