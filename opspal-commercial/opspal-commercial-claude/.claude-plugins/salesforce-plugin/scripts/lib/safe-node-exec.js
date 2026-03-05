#!/usr/bin/env node

/**
 * Safe Node.js Code Executor
 *
 * Eliminates bash escaping issues by accepting JavaScript code via stdin
 * instead of command-line arguments.
 *
 * Usage:
 *   echo "console.log('hello')" | node scripts/lib/safe-node-exec.js
 *   cat script.js | node scripts/lib/safe-node-exec.js
 *   node scripts/lib/safe-node-exec.js < script.js
 *
 * Features:
 * - No shell escaping issues (accepts code via stdin)
 * - Proper error handling with stack traces
 * - Support for async/await
 * - Access to common Node.js modules
 * - JSON output mode for structured data
 *
 * Options:
 *   --json     Output results as JSON
 *   --require  Pre-load modules (comma-separated): --require fs,path
 *   --cwd      Set working directory
 *
 * Examples:
 *   # Simple execution
 *   echo "console.log(2 + 2)" | node scripts/lib/safe-node-exec.js
 *
 *   # With pre-loaded modules
 *   echo "console.log(fs.existsSync('.'))" | node scripts/lib/safe-node-exec.js --require fs
 *
 *   # JSON output mode
 *   echo "return { result: 42 }" | node scripts/lib/safe-node-exec.js --json
 *
 *   # Complex data processing
 *   cat > /tmp/process.js << 'EOF'
 *   const data = require('./data.json');
 *   const filtered = data.filter(item => !item.deleted);
 *   return filtered.length;
 *   EOF
 *   node scripts/lib/safe-node-exec.js < /tmp/process.js
 */

const fs = require('fs');
const path = require('path');

// Parse command-line arguments
const args = process.argv.slice(2);
const options = {
  jsonOutput: args.includes('--json'),
  requireModules: [],
  cwd: process.cwd()
};

// Parse --require option
const requireIndex = args.indexOf('--require');
if (requireIndex !== -1 && args[requireIndex + 1]) {
  options.requireModules = args[requireIndex + 1].split(',').map(m => m.trim());
}

// Parse --cwd option
const cwdIndex = args.indexOf('--cwd');
if (cwdIndex !== -1 && args[cwdIndex + 1]) {
  options.cwd = path.resolve(args[cwdIndex + 1]);
  process.chdir(options.cwd);
}

// Read code from stdin
let code = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  code += chunk;
});

process.stdin.on('end', async () => {
  try {
    // Pre-load requested modules into global scope
    const preloaded = {};
    for (const moduleName of options.requireModules) {
      try {
        preloaded[moduleName] = require(moduleName);
      } catch (err) {
        console.error(`Warning: Could not load module '${moduleName}': ${err.message}`);
      }
    }

    // Create execution context with common modules
    const context = {
      require,
      console,
      process,
      Buffer,
      __dirname: options.cwd,
      __filename: path.join(options.cwd, 'stdin.js'),
      ...preloaded,
      // Common modules available by default
      fs,
      path
    };

    // Execute code directly without string interpolation to avoid escaping issues
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const paramNames = Object.keys(context);
    const paramValues = Object.values(context);

    // Create function that executes the code
    const fn = new AsyncFunction(...paramNames, code);
    const result = await fn(...paramValues);

    // Output result
    if (options.jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result !== undefined) {
      console.log(result);
    }

    process.exit(0);
  } catch (error) {
    console.error('Execution Error:');
    console.error(error.stack || error.message);
    process.exit(1);
  }
});

// Handle stdin errors
process.stdin.on('error', err => {
  console.error('stdin Error:', err.message);
  process.exit(1);
});

// Show help if no stdin
if (process.stdin.isTTY) {
  console.log(`
Safe Node.js Code Executor

Usage:
  echo "code" | node safe-node-exec.js [options]
  cat script.js | node safe-node-exec.js [options]
  node safe-node-exec.js [options] < script.js

Options:
  --json              Output results as JSON
  --require <modules> Pre-load modules (comma-separated)
  --cwd <directory>   Set working directory

Examples:
  # Simple execution
  echo "console.log(2 + 2)" | node safe-node-exec.js

  # With pre-loaded modules
  echo "console.log(fs.existsSync('.'))" | node safe-node-exec.js --require fs

  # JSON output
  echo "return { result: 42 }" | node safe-node-exec.js --json

  # Change working directory
  echo "console.log(process.cwd())" | node safe-node-exec.js --cwd /tmp
  `);
  process.exit(0);
}
