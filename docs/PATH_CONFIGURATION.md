# Path Configuration System

## Overview

This project uses a centralized path configuration system to ensure portability across different environments. All file system paths are managed through environment variables and a central configuration module.

## Quick Start

### For Developers

```javascript
// Instead of hard-coding paths:
const projectPath = '/home/chris/Desktop/RevPal/Agents';  // ❌ Don't do this

// Use the path configuration:
const { PROJECT_ROOT } = require('./config/paths.config');  // ✅ Do this
const projectPath = PROJECT_ROOT;
```

### For DevOps

1. Copy the environment template:
   ```bash
   cp .env.template .env
   ```

2. Edit `.env` with your environment-specific paths:
   ```bash
   PROJECT_ROOT=/opt/revpal/agents
   TEMP_DIR=/var/tmp
   ```

## Available Paths

The `config/paths.config.js` module provides these configured paths:

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECT_ROOT` | Base project directory | Current working directory |
| `USER_HOME` | User home directory | `os.homedir()` |
| `TEMP_DIR` | Temporary files directory | `os.tmpdir()` |
| `APP_DATA_DIR` | Application data | `${PROJECT_ROOT}/data` |
| `APP_LOG_DIR` | Log files | `${PROJECT_ROOT}/logs` |
| `SFDC_ROOT` | Salesforce platform root | `${PROJECT_ROOT}/platforms/SFDC` |
| `HS_ROOT` | HubSpot platform root | `${PROJECT_ROOT}/platforms/HS` |
| `CLAUDE_CONFIG_DIR` | Claude configuration | `${PROJECT_ROOT}/.claude` |

## Usage Examples

### JavaScript/TypeScript

```javascript
const paths = require('./config/paths.config');

// Access paths
const logFile = path.join(paths.APP_LOG_DIR, 'app.log');
const tempFile = paths.getTempPath('upload.tmp');

// Resolve relative paths
const scriptPath = paths.resolve('scripts', 'my-script.js');

// Replace hard-coded paths dynamically
const corrected = paths.replacePath('/home/user/project/file.txt');
```

### Python

```python
import os
from dotenv import load_dotenv

load_dotenv()

project_root = os.getenv('PROJECT_ROOT', os.getcwd())
temp_dir = os.getenv('TEMP_DIR', '/tmp')
```

### Shell Scripts

```bash
#!/bin/bash
source .env

PROJECT_ROOT=${PROJECT_ROOT:-$(pwd)}
TEMP_DIR=${TEMP_DIR:-/tmp}

echo "Working in: $PROJECT_ROOT"
```

## Path Validation

### Pre-commit Hook

The project includes a pre-commit hook that prevents committing files with hard-coded absolute paths:

```bash
# The hook runs automatically on commit
git commit -m "My changes"

# If hard-coded paths are detected:
❌ Hard-coded paths detected!
  Line 15: /home/chris/Desktop/RevPal/Agents

# To bypass (not recommended):
git commit --no-verify
```

### Manual Validation

```bash
# Scan entire project for hard-coded paths
npm run scan-paths

# Check staged files only
npm run check-paths

# Automatically refactor paths
npm run refactor-paths
```

### CI/CD Integration

The project includes GitHub Actions workflow that:
1. Scans for hard-coded paths on every PR
2. Blocks merge if new hard-coded paths are introduced
3. Provides automated feedback with fix suggestions

## Environment Variables

### Required Variables

```bash
# Core paths (minimum required)
PROJECT_ROOT=/path/to/project
USER_HOME=/home/username
TEMP_DIR=/tmp
```

### Optional Variables

```bash
# Application directories
APP_DATA_DIR=${PROJECT_ROOT}/data
APP_LOG_DIR=${PROJECT_ROOT}/logs
APP_CONFIG_DIR=${PROJECT_ROOT}/config
APP_CACHE_DIR=${PROJECT_ROOT}/.cache

# Platform-specific
SFDC_ROOT=${PROJECT_ROOT}/platforms/SFDC
HS_ROOT=${PROJECT_ROOT}/platforms/HS

# Performance tuning
MAX_FILE_SIZE=10        # MB
MAX_FILE_LINES=10000
CACHE_ENABLED=true
CACHE_TTL=300000        # ms
```

## Migration Guide

### From Hard-coded Paths

```javascript
// Before:
require('dotenv').config({ path: '/home/chris/Desktop/RevPal/Agents/.env' });
const logDir = '/home/chris/Desktop/RevPal/Agents/logs';

// After:
const paths = require('./config/paths.config');
require('dotenv').config({ path: path.join(paths.PROJECT_ROOT, '.env') });
const logDir = paths.APP_LOG_DIR;
```

### Updating Existing Code

1. Run the scanner to find hard-coded paths:
   ```bash
   npm run scan-paths
   ```

2. Review the report:
   ```bash
   cat reports/PATH_SCAN_REPORT.md
   ```

3. Automatically refactor:
   ```bash
   npm run refactor-paths
   ```

4. Test your changes:
   ```bash
   npm test
   npm run test-config
   ```

## Best Practices

### ✅ DO:
- Use environment variables for all absolute paths
- Use the central `paths.config.js` module
- Use `path.join()` for building paths
- Use `os.homedir()` and `os.tmpdir()` for system paths
- Configure paths in `.env` for each environment

### ❌ DON'T:
- Hard-code absolute file system paths
- Use string concatenation for paths
- Assume paths exist across different systems
- Commit `.env` files to version control
- Use user-specific paths in code

## Troubleshooting

### Path not found errors

1. Check your `.env` file exists and is configured:
   ```bash
   cat .env | grep PROJECT_ROOT
   ```

2. Verify the path configuration:
   ```bash
   npm run test-config
   ```

### Pre-commit hook not working

1. Reinstall the hooks:
   ```bash
   npm run setup-hooks
   ```

2. Check hook is installed:
   ```bash
   ls -la .git/hooks/pre-commit
   ```

### Refactoring errors

1. Check for syntax errors in modified files:
   ```bash
   npm run lint
   ```

2. Restore from backups if needed:
   ```bash
   cp .backups/path-refactor-*/file.js.bak file.js
   ```

## Support

For issues or questions about path configuration:

1. Check this documentation
2. Run `npm run test-config` to verify setup
3. Review `reports/PATH_SCAN_REPORT.md` for findings
4. Check `.github/workflows/path-validation.yml` for CI status

---

*Path configuration system implemented on 2025-09-21*