# 01 - System Dependencies

## Purpose

Provide OS-specific dependency management patterns to prevent "package not found" errors during Puppeteer/Playwright operations.

## The Problem

From reflection data: "Puppeteer failed to launch Chrome: libasound2 has no installation candidate on Ubuntu 24.04."

Ubuntu 24.04 renamed several packages with a `t64` suffix as part of the 64-bit time_t transition. This breaks documentation and scripts that reference old package names.

## OS Detection Script

```bash
#!/bin/bash
# scripts/lib/os-dependency-resolver.sh

detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ -f /etc/os-release ]]; then
    source /etc/os-release
    if [[ "$ID" == "ubuntu" ]]; then
      echo "ubuntu-${VERSION_ID}"
    elif [[ "$ID" == "debian" ]]; then
      echo "debian-${VERSION_ID}"
    else
      echo "linux-other"
    fi
  else
    echo "unknown"
  fi
}

get_puppeteer_deps() {
  local os=$(detect_os)

  case "$os" in
    ubuntu-24.*)
      # Ubuntu 24.04+ uses t64 suffix packages
      echo "libasound2t64 libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0 libcups2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 libcairo2"
      ;;
    ubuntu-22.*|ubuntu-20.*)
      # Ubuntu 22.04 and earlier
      echo "libasound2 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 libcairo2 libgconf-2-4"
      ;;
    debian-*)
      echo "libasound2 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 libgbm1"
      ;;
    macos)
      echo "chromium"  # For Homebrew
      ;;
    *)
      echo ""  # Unknown - let Puppeteer handle it
      ;;
  esac
}
```

## Package Mapping Reference

### Ubuntu 22.04 → 24.04 Changes

| Ubuntu 22.04 | Ubuntu 24.04 | Reason |
|--------------|--------------|--------|
| libasound2 | libasound2t64 | 64-bit time_t |
| libatk1.0-0 | libatk1.0-0t64 | 64-bit time_t |
| libgconf-2-4 | N/A | Deprecated (removed) |
| libc6 | libc6 | Unchanged |
| libnss3 | libnss3 | Unchanged |
| libnspr4 | libnspr4 | Unchanged |

### Full Puppeteer Dependency List

```bash
# Ubuntu 24.04+ (copy-paste ready)
sudo apt-get update && sudo apt-get install -y \
  libasound2t64 \
  libatk-bridge2.0-0 \
  libatk1.0-0t64 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxkbcommon0 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6

# Ubuntu 22.04 and earlier
sudo apt-get update && sudo apt-get install -y \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libgconf-2-4 \
  libgbm1 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxss1
```

## Dependency Validation Script

```javascript
// scripts/lib/dependency-validator.js
const { execSync } = require('child_process');
const os = require('os');

const REQUIRED_COMMANDS = {
  all: ['node', 'npm', 'git'],
  puppeteer: ['google-chrome', 'chromium-browser', 'chromium'],
  salesforce: ['sf'],
  hubspot: ['node']  // HubSpot CLI uses Node directly
};

function checkCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkLinuxPackage(pkg) {
  try {
    const output = execSync(`dpkg -l ${pkg} 2>/dev/null | grep '^ii'`, {
      stdio: 'pipe',
      encoding: 'utf8'
    });
    return output.includes(pkg);
  } catch {
    return false;
  }
}

function getUbuntuVersion() {
  try {
    const release = execSync('lsb_release -rs', {
      stdio: 'pipe',
      encoding: 'utf8'
    }).trim();
    return release;
  } catch {
    return null;
  }
}

function validateEnvironment(feature = 'all') {
  const results = { passed: [], failed: [], warnings: [] };
  const platform = os.platform();

  // Check required commands
  const commands = REQUIRED_COMMANDS[feature] || REQUIRED_COMMANDS.all;
  for (const cmd of commands) {
    if (checkCommand(cmd)) {
      results.passed.push(`Command '${cmd}' available`);
    } else if (feature === 'puppeteer' && cmd !== 'google-chrome') {
      // For Puppeteer, any browser is fine
      continue;
    } else {
      results.failed.push(`Command '${cmd}' not found`);
    }
  }

  // Linux-specific package checks
  if (platform === 'linux' && feature === 'puppeteer') {
    const version = getUbuntuVersion();
    const packages = version && version.startsWith('24')
      ? ['libasound2t64', 'libnss3', 'libnspr4']
      : ['libasound2', 'libnss3', 'libnspr4'];

    for (const pkg of packages) {
      if (checkLinuxPackage(pkg)) {
        results.passed.push(`Package '${pkg}' installed`);
      } else {
        results.failed.push(`Package '${pkg}' missing`);
      }
    }
  }

  return {
    success: results.failed.length === 0,
    ...results
  };
}

module.exports = { validateEnvironment, checkCommand, checkLinuxPackage };
```

## Pre-Operation Hooks

### Hook: Pre-Puppeteer Validation

```bash
#!/bin/bash
# hooks/pre-puppeteer-validation.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/..claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/os-dependency-resolver.sh"

# Check if this operation uses Puppeteer
if echo "$TOOL_INPUT" | grep -qE "(puppeteer|playwright|chromium|headless)"; then
  # Run dependency check
  MISSING_DEPS=$(check_puppeteer_deps)

  if [ -n "$MISSING_DEPS" ]; then
    echo "⚠️ Missing Puppeteer dependencies:"
    echo "$MISSING_DEPS"
    echo ""
    echo "Install with:"
    echo "  sudo apt-get install $MISSING_DEPS"
    exit 1
  fi
fi

exit 0
```

## Troubleshooting

### Error: "libasound2 has no installation candidate"

**Cause**: Ubuntu 24.04 renamed the package.

**Fix**:
```bash
# Instead of: sudo apt-get install libasound2
sudo apt-get install libasound2t64
```

### Error: "libgconf-2-4 has no installation candidate"

**Cause**: Package deprecated and removed in Ubuntu 24.04.

**Fix**: This package is no longer required for Chrome/Puppeteer. Remove it from your installation scripts.

### Error: "Chrome failed to launch"

**Diagnosis**:
```bash
# Check which libraries are missing
ldd $(which google-chrome) | grep "not found"

# Or for Puppeteer's bundled Chromium
ldd node_modules/puppeteer/.local-chromium/*/chrome-linux/chrome | grep "not found"
```

### Error: "Protocol error: Connection closed"

**Cause**: Chrome crashed during startup, often due to missing dependencies.

**Fix**:
1. Run the full dependency installation script
2. Check available memory (Chrome needs ~500MB minimum)
3. Verify no sandbox issues: `--no-sandbox` flag (use with caution)

## CI/CD Considerations

### GitHub Actions

```yaml
# For Ubuntu 24.04 runners
jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - name: Install Chrome dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libasound2t64 \
            libnss3 \
            libatk1.0-0t64 \
            libatk-bridge2.0-0 \
            libcups2 \
            libxcomposite1 \
            libxdamage1 \
            libgbm1

      - name: Run tests
        run: npm test
```

### Docker

```dockerfile
# For Ubuntu 24.04 base image
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    libasound2t64 \
    libnss3 \
    libatk1.0-0t64 \
    && rm -rf /var/lib/apt/lists/*
```

## Success Criteria

- [ ] OS detection script identifies Ubuntu version correctly
- [ ] Package lists maintained for Ubuntu 22.04 and 24.04
- [ ] Pre-operation hooks validate dependencies
- [ ] CI/CD pipelines use correct package names
- [ ] Zero "package not found" errors in production

## Sources

- [Puppeteer Troubleshooting](https://pptr.dev/troubleshooting)
- [Ubuntu 24.04 t64 Transition](https://github.com/browser-actions/setup-chrome/issues/618)
- [Puppeteer GitHub Issues](https://github.com/puppeteer/puppeteer/issues/3443)
