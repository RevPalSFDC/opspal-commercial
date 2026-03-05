# 04 - Multi-Context Execution

## Purpose

Document patterns for scripts that execute across multiple contexts (hooks, subagents, CLI, CI/CD) to prevent context-dependent failures.

## The Problem

From reflection data: "Hook worked in manual testing but failed when triggered by subagent - different working directory."

Scripts behave differently depending on their execution context, leading to intermittent failures.

## Execution Contexts

### Context Characteristics

| Context | cwd | Environment | stdin/stdout | Timeout |
|---------|-----|-------------|--------------|---------|
| Direct CLI | User's location | Full shell env | Interactive | None |
| Hook | Project root | Filtered env | Captured | Short |
| Subagent | Project root | Minimal env | Captured | Varies |
| CI/CD | Checkout dir | CI-provided | Piped | Job limit |
| Cron/Scheduled | Root or home | Minimal | None/logged | Job limit |

### Context Detection

```javascript
// scripts/lib/context-detector.js
function detectExecutionContext() {
  const context = {
    type: 'unknown',
    isInteractive: false,
    hasTTY: process.stdout.isTTY,
    env: {}
  };

  // Detect CI/CD
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) {
    context.type = 'ci';
    context.ciProvider = process.env.GITHUB_ACTIONS ? 'github' :
                         process.env.GITLAB_CI ? 'gitlab' :
                         process.env.JENKINS_URL ? 'jenkins' : 'unknown';
  }
  // Detect Claude hook
  else if (process.env.TOOL_NAME || process.env.HOOK_TYPE) {
    context.type = 'hook';
    context.hookType = process.env.HOOK_TYPE || 'PreToolUse';
    context.toolName = process.env.TOOL_NAME;
  }
  // Detect Claude subagent
  else if (process.env.CLAUDE_SUBAGENT || process.env.SUBAGENT_TYPE) {
    context.type = 'subagent';
    context.subagentType = process.env.SUBAGENT_TYPE;
  }
  // Detect cron/scheduled
  else if (!process.env.USER && !process.env.HOME) {
    context.type = 'scheduled';
  }
  // Default to CLI
  else if (context.hasTTY) {
    context.type = 'cli';
    context.isInteractive = true;
  }

  return context;
}

module.exports = { detectExecutionContext };
```

## Context-Aware Patterns

### Pattern 1: Logging Adaptation

```javascript
// scripts/lib/context-logger.js
const { detectExecutionContext } = require('./context-detector');

class ContextAwareLogger {
  constructor(name) {
    this.name = name;
    this.context = detectExecutionContext();
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      name: this.name,
      context: this.context.type,
      message,
      ...data
    };

    switch (this.context.type) {
      case 'ci':
        // CI expects specific log formats
        if (level === 'error') {
          console.log(`::error::${message}`);
        } else if (level === 'warn') {
          console.log(`::warning::${message}`);
        } else {
          console.log(`[${level.toUpperCase()}] ${message}`);
        }
        break;

      case 'hook':
        // Hooks should be quiet, only output on error
        if (level === 'error') {
          console.error(JSON.stringify(entry));
        }
        break;

      case 'subagent':
        // Subagents need structured output
        console.log(JSON.stringify(entry));
        break;

      default:
        // Interactive CLI gets pretty output
        const color = level === 'error' ? '\x1b[31m' :
                      level === 'warn' ? '\x1b[33m' :
                      level === 'info' ? '\x1b[36m' : '\x1b[0m';
        console.log(`${color}[${level}]\x1b[0m ${message}`);
    }
  }

  info(msg, data) { this.log('info', msg, data); }
  warn(msg, data) { this.log('warn', msg, data); }
  error(msg, data) { this.log('error', msg, data); }
  debug(msg, data) {
    if (process.env.DEBUG) this.log('debug', msg, data);
  }
}

module.exports = { ContextAwareLogger };
```

### Pattern 2: Path Resolution by Context

```javascript
// scripts/lib/context-paths.js
const path = require('path');
const fs = require('fs');

function getContextRoot() {
  const context = detectExecutionContext();

  switch (context.type) {
    case 'hook':
    case 'subagent':
      // Always use project root for Claude contexts
      return findProjectRoot();

    case 'ci':
      // Use CI workspace
      return process.env.GITHUB_WORKSPACE ||
             process.env.CI_PROJECT_DIR ||
             process.cwd();

    default:
      // CLI uses current directory
      return process.cwd();
  }
}

function resolveContextPath(...segments) {
  const root = getContextRoot();
  return path.join(root, ...segments);
}

// Get a safe temp directory that works in all contexts
function getContextTempDir() {
  const context = detectExecutionContext();

  if (context.type === 'ci') {
    // CI often has restricted temp access
    return process.env.RUNNER_TEMP ||
           path.join(getContextRoot(), '.tmp');
  }

  return require('os').tmpdir();
}

module.exports = { getContextRoot, resolveContextPath, getContextTempDir };
```

### Pattern 3: Timeout Handling

```javascript
// scripts/lib/context-timeout.js

const TIMEOUT_DEFAULTS = {
  hook: 30000,        // 30 seconds - hooks should be fast
  subagent: 300000,   // 5 minutes
  ci: 600000,         // 10 minutes
  cli: 0,             // No timeout for interactive
  scheduled: 1800000  // 30 minutes for cron jobs
};

function getContextTimeout(override = null) {
  if (override !== null) return override;

  const context = detectExecutionContext();
  return TIMEOUT_DEFAULTS[context.type] || TIMEOUT_DEFAULTS.cli;
}

async function withContextTimeout(fn, options = {}) {
  const timeout = getContextTimeout(options.timeout);

  if (timeout === 0) {
    return fn();
  }

  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
    )
  ]);
}

module.exports = { getContextTimeout, withContextTimeout };
```

### Pattern 4: Input/Output Handling

```javascript
// scripts/lib/context-io.js
const readline = require('readline');

async function getInput(prompt, defaultValue = '') {
  const context = detectExecutionContext();

  // Non-interactive contexts use default
  if (!context.isInteractive) {
    return defaultValue;
  }

  // Interactive CLI prompts user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`${prompt} [${defaultValue}]: `, answer => {
      rl.close();
      resolve(answer || defaultValue);
    });
  });
}

function outputResult(result, options = {}) {
  const context = detectExecutionContext();
  const { format = 'auto' } = options;

  const actualFormat = format === 'auto'
    ? (context.type === 'cli' && context.hasTTY ? 'pretty' : 'json')
    : format;

  switch (actualFormat) {
    case 'json':
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'pretty':
      if (typeof result === 'object') {
        console.log(require('util').inspect(result, { colors: true, depth: 4 }));
      } else {
        console.log(result);
      }
      break;

    case 'silent':
      // Output nothing
      break;

    default:
      console.log(result);
  }
}

module.exports = { getInput, outputResult };
```

## Hook-Specific Patterns

### Safe Hook Script Template

```bash
#!/bin/bash
# Template for context-aware hook scripts

set -euo pipefail

# Resolve script directory regardless of execution context
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find project root
find_project_root() {
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/package.json" ]] || [[ -d "$dir/.git" ]]; then
      echo "$dir"
      return
    fi
    dir="$(dirname "$dir")"
  done
  echo "$PWD"  # Fallback
}

PROJECT_ROOT=$(find_project_root)

# Change to project root for consistent execution
cd "$PROJECT_ROOT"

# Parse hook input (JSON from stdin for Claude hooks)
if [[ -n "${TOOL_INPUT:-}" ]]; then
  HOOK_INPUT="$TOOL_INPUT"
elif [[ ! -t 0 ]]; then
  # Read from stdin if not a TTY
  HOOK_INPUT=$(cat)
else
  HOOK_INPUT="{}"
fi

# Execute main logic
main() {
  # Your hook logic here
  echo "Executing in context: ${HOOK_TYPE:-unknown}"
  echo "Project root: $PROJECT_ROOT"
  echo "Tool: ${TOOL_NAME:-unknown}"
}

# Run with error handling
if ! main; then
  echo "Hook failed" >&2
  exit 1
fi

exit 0
```

### Hook Environment Validation

```javascript
// scripts/lib/hook-env-validator.js

const REQUIRED_HOOK_ENV = {
  PreToolUse: ['TOOL_NAME'],
  PostToolUse: ['TOOL_NAME', 'TOOL_OUTPUT'],
  PreCommit: [],
  PostCommit: ['COMMIT_HASH']
};

function validateHookEnvironment() {
  const hookType = process.env.HOOK_TYPE;

  if (!hookType) {
    return { valid: false, reason: 'Not running in hook context' };
  }

  const required = REQUIRED_HOOK_ENV[hookType] || [];
  const missing = required.filter(v => !process.env[v]);

  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Missing hook variables: ${missing.join(', ')}`
    };
  }

  return { valid: true, hookType };
}

module.exports = { validateHookEnvironment };
```

## CI/CD Patterns

### GitHub Actions Compatibility

```javascript
// scripts/lib/github-actions-output.js

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    // GitHub Actions new output syntax
    const fs = require('fs');
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${name}=${value}\n`
    );
  } else if (process.env.GITHUB_ACTIONS) {
    // Legacy syntax
    console.log(`::set-output name=${name}::${value}`);
  }
}

function addStepSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = require('fs');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  }
}

function logError(message, file = null, line = null) {
  let annotation = `::error`;
  if (file) annotation += ` file=${file}`;
  if (line) annotation += `,line=${line}`;
  console.log(`${annotation}::${message}`);
}

module.exports = { setOutput, addStepSummary, logError };
```

## Testing Across Contexts

```javascript
// scripts/lib/__tests__/context-detector.test.js
const { detectExecutionContext } = require('../context-detector');

describe('Context Detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('detects GitHub Actions', () => {
    process.env.GITHUB_ACTIONS = 'true';
    const ctx = detectExecutionContext();
    expect(ctx.type).toBe('ci');
    expect(ctx.ciProvider).toBe('github');
  });

  test('detects Claude hook', () => {
    process.env.HOOK_TYPE = 'PreToolUse';
    process.env.TOOL_NAME = 'Bash';
    const ctx = detectExecutionContext();
    expect(ctx.type).toBe('hook');
    expect(ctx.hookType).toBe('PreToolUse');
  });

  test('detects subagent', () => {
    process.env.SUBAGENT_TYPE = 'sfdc-cpq-assessor';
    const ctx = detectExecutionContext();
    expect(ctx.type).toBe('subagent');
  });
});
```

## Success Criteria

- [ ] All scripts detect execution context before behavior
- [ ] Logging adapts to context (JSON for hooks, pretty for CLI)
- [ ] Path resolution uses project root in non-interactive contexts
- [ ] Timeouts appropriate for each context type
- [ ] Zero context-dependent failures in production

## Sources

- [Node.js Process Documentation](https://nodejs.org/api/process.html)
- [GitHub Actions Environment Variables](https://docs.github.com/en/actions/learn-github-actions/variables)
- [Claude Code Hooks Documentation](https://code.claude.com/docs/en/hooks)
