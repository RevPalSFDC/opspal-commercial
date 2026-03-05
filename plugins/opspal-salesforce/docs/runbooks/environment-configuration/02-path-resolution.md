# 02 - Path Resolution Patterns

## Purpose

Document consistent path resolution patterns to prevent "file not found" errors across different execution contexts.

## The Problem

From reflection data: "Script failed because it assumed project root but ran from plugin directory."

Different execution contexts (project root, plugin directory, user home) resolve relative paths differently, causing intermittent failures.

## Path Contexts

### Context Types

| Context | Base Path | Example |
|---------|-----------|---------|
| Project Root | `process.cwd()` | `/home/user/my-project` |
| Plugin Root | `CLAUDE_PLUGIN_ROOT` | `~/.claude/plugins/my-plugin` |
| Script Location | `__dirname` (CJS) or `import.meta.dirname` (ESM) | `/path/to/scripts/lib` |
| User Home | `os.homedir()` | `/home/user` |

### Resolution Priority

1. **Absolute paths** - Always prefer when the file location is known
2. **Environment variables** - For configurable paths
3. **Script-relative** - For files bundled with the script
4. **Project-relative** - For project-specific files (use with caution)

## Path Resolution Patterns

### Pattern 1: Safe Script-Relative Resolution

```javascript
// For CommonJS
const path = require('path');
const scriptDir = __dirname;
const configPath = path.join(scriptDir, '..', 'config', 'settings.json');

// For ESM
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '..', 'config', 'settings.json');
```

### Pattern 2: Plugin Root Resolution

```javascript
// scripts/lib/path-resolver.js
const path = require('path');
const os = require('os');

function getPluginRoot() {
  // Check environment variable first (set by Claude Code)
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }

  // Fall back to script location
  // Assumes script is in <plugin>/scripts/lib/
  return path.resolve(__dirname, '..', '..');
}

function resolvePluginPath(...segments) {
  return path.join(getPluginRoot(), ...segments);
}

function getConfigPath(filename) {
  return resolvePluginPath('config', filename);
}

function getTemplatePath(filename) {
  return resolvePluginPath('templates', filename);
}

module.exports = {
  getPluginRoot,
  resolvePluginPath,
  getConfigPath,
  getTemplatePath
};
```

### Pattern 3: Project Root Detection

```javascript
// scripts/lib/project-root-finder.js
const fs = require('fs');
const path = require('path');

const PROJECT_MARKERS = [
  'package.json',
  '.git',
  'CLAUDE.md',
  '.claude'
];

function findProjectRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current !== root) {
    for (const marker of PROJECT_MARKERS) {
      const markerPath = path.join(current, marker);
      if (fs.existsSync(markerPath)) {
        return current;
      }
    }
    current = path.dirname(current);
  }

  // No project root found, return cwd
  console.warn('Warning: No project root found, using cwd');
  return process.cwd();
}

function resolveProjectPath(...segments) {
  const root = findProjectRoot();
  return path.join(root, ...segments);
}

module.exports = { findProjectRoot, resolveProjectPath };
```

### Pattern 4: User Configuration Paths

```javascript
// scripts/lib/user-paths.js
const path = require('path');
const os = require('os');

const USER_PATHS = {
  claudeHome: () => path.join(os.homedir(), '.claude'),
  claudeSettings: () => path.join(os.homedir(), '.claude', 'settings.json'),
  claudePlugins: () => path.join(os.homedir(), '.claude', 'plugins'),
  claudeLogs: () => path.join(os.homedir(), '.claude', 'logs'),
  mcpConfig: () => path.join(os.homedir(), '.config', 'claude', 'mcp.json')
};

function getUserPath(key) {
  const resolver = USER_PATHS[key];
  if (!resolver) {
    throw new Error(`Unknown user path key: ${key}`);
  }
  return resolver();
}

module.exports = { getUserPath, USER_PATHS };
```

## ESM vs CommonJS Resolution

### Key Differences

| Feature | CommonJS | ESM |
|---------|----------|-----|
| Current file | `__filename` | `import.meta.url` |
| Current directory | `__dirname` | `import.meta.dirname` (Node 20.11+) |
| Relative imports | `require('./file')` | `import './file.js'` (extension required) |
| Dynamic imports | `require(variable)` | `await import(variable)` |
| JSON imports | `require('./data.json')` | `import data from './data.json' with { type: 'json' }` |

### ESM Compatibility Layer

```javascript
// scripts/lib/esm-compat.js
import { fileURLToPath } from 'url';
import path from 'path';

// Get __dirname equivalent in ESM
export function getDirname(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

// Get __filename equivalent in ESM
export function getFilename(importMetaUrl) {
  return fileURLToPath(importMetaUrl);
}

// Usage in ESM file:
// import { getDirname } from './esm-compat.js';
// const __dirname = getDirname(import.meta.url);
```

### Module Type Detection

```javascript
// scripts/lib/module-type.js

// Check if running as ESM
const isESM = typeof import.meta !== 'undefined';

// Check package.json type field
function getModuleType() {
  try {
    const pkg = require('./package.json');
    return pkg.type || 'commonjs';
  } catch {
    return 'commonjs';
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Hardcoded Paths

```javascript
// ❌ BAD: Hardcoded absolute path
const config = require('/home/chris/.claude/plugins/my-plugin/config.json');

// ✅ GOOD: Environment-based resolution
const config = require(path.join(process.env.CLAUDE_PLUGIN_ROOT, 'config.json'));
```

### Anti-Pattern 2: Assuming cwd

```javascript
// ❌ BAD: Assuming script runs from project root
const data = fs.readFileSync('./data/file.json');

// ✅ GOOD: Explicit path resolution
const projectRoot = findProjectRoot();
const data = fs.readFileSync(path.join(projectRoot, 'data', 'file.json'));
```

### Anti-Pattern 3: Platform-Specific Separators

```javascript
// ❌ BAD: Hardcoded path separators
const filepath = 'scripts/lib/utils.js';  // Fails on Windows

// ✅ GOOD: Platform-agnostic paths
const filepath = path.join('scripts', 'lib', 'utils.js');
```

### Anti-Pattern 4: Ignoring Symlinks

```javascript
// ❌ BAD: Not resolving symlinks
const scriptDir = __dirname;

// ✅ GOOD: Resolve symlinks when needed
const scriptDir = fs.realpathSync(__dirname);
```

## Path Validation Utility

```javascript
// scripts/lib/path-validator.js
const fs = require('fs');
const path = require('path');

function validatePath(filepath, options = {}) {
  const {
    mustExist = true,
    mustBeFile = false,
    mustBeDirectory = false,
    mustBeReadable = true,
    mustBeWritable = false
  } = options;

  const result = {
    valid: true,
    resolved: path.resolve(filepath),
    issues: []
  };

  try {
    const stats = fs.statSync(result.resolved);

    if (mustBeFile && !stats.isFile()) {
      result.issues.push('Path is not a file');
      result.valid = false;
    }

    if (mustBeDirectory && !stats.isDirectory()) {
      result.issues.push('Path is not a directory');
      result.valid = false;
    }
  } catch (err) {
    if (mustExist) {
      result.issues.push(`Path does not exist: ${err.message}`);
      result.valid = false;
    }
  }

  if (mustBeReadable && result.valid) {
    try {
      fs.accessSync(result.resolved, fs.constants.R_OK);
    } catch {
      result.issues.push('Path is not readable');
      result.valid = false;
    }
  }

  if (mustBeWritable && result.valid) {
    try {
      fs.accessSync(result.resolved, fs.constants.W_OK);
    } catch {
      result.issues.push('Path is not writable');
      result.valid = false;
    }
  }

  return result;
}

module.exports = { validatePath };
```

## Debugging Path Issues

### Diagnostic Script

```javascript
// scripts/diagnose-paths.js
const path = require('path');
const os = require('os');

console.log('=== Path Diagnostics ===\n');

console.log('Environment:');
console.log(`  Platform: ${os.platform()}`);
console.log(`  Node version: ${process.version}`);
console.log(`  cwd: ${process.cwd()}`);
console.log(`  __dirname: ${__dirname}`);
console.log(`  Home: ${os.homedir()}`);

console.log('\nRelevant Environment Variables:');
const envVars = [
  'CLAUDE_PLUGIN_ROOT',
  'NODE_PATH',
  'PATH'
];

for (const name of envVars) {
  console.log(`  ${name}: ${process.env[name] || '(not set)'}`);
}

console.log('\nModule resolution:');
console.log(`  Main module: ${require.main?.filename || 'N/A'}`);
console.log(`  Module paths:`);
module.paths.forEach(p => console.log(`    - ${p}`));
```

## Success Criteria

- [ ] All scripts use path.join() for path construction
- [ ] Plugin paths resolved via CLAUDE_PLUGIN_ROOT
- [ ] Project root detected using marker files
- [ ] ESM compatibility layer used for hybrid modules
- [ ] Zero "file not found" errors from path issues

## Sources

- [Node.js Path Module](https://nodejs.org/api/path.html)
- [Node.js ESM Documentation](https://nodejs.org/api/esm.html)
- [TypeScript Module Resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html)
