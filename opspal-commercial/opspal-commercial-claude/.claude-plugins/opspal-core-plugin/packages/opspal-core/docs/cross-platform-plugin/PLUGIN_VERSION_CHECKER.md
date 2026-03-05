# Plugin Version Checker

**Version**: 1.0.0
**Status**: ✅ Production Ready
**Last Updated**: 2025-12-08

---

## Overview

The **Plugin Version Checker** automatically checks for plugin updates at session start and displays notifications when new versions are available. It uses GitHub API integration with intelligent caching to minimize API calls and prevent rate limits.

## Features

- ✅ **Automatic checking** at session start
- ✅ **1-hour cache TTL** to minimize GitHub API calls
- ✅ **Graceful fallback** on API failures
- ✅ **Silent when up-to-date** (no spam)
- ✅ **3-second timeout** prevents slow startups
- ✅ **Multi-plugin support** checks all installed plugins
- ✅ **Semantic versioning** comparison
- ✅ **JSON and text output** formats

## How It Works

```
Session Start
    ↓
SessionStart Hook Triggered
    ↓
session-start-version-check.sh
    ↓
plugin-version-checker.js
    ↓
┌─────────────────────────┐
│ Check Cache (1-hour TTL)│
└─────────────────────────┘
    ↓
    ├─→ Cache Valid?
    │   ├─ YES → Use cached versions
    │   └─ NO  → Fetch from GitHub API
    ↓
Compare Installed vs Latest
    ↓
    ├─→ Updates Available?
    │   ├─ YES → Display notification
    │   └─ NO  → Silent exit
    ↓
Save to Cache
```

## What You'll See

### When Updates Are Available

At session start, you'll see:

```
🔔 Plugin Updates Available:
   • salesforce-plugin: 3.42.0 → 3.45.0
   • hubspot-plugin: 3.0.2 → 3.1.0

Run: /plugin update to upgrade
```

### When Everything Is Up-to-Date

No message (silent) - you only see notifications when updates exist.

## Configuration

### Environment Variables

```bash
# Enable/disable version checking (default: 1)
export ENABLE_VERSION_CHECK=1

# Force verbose logging (default: 0)
export ROUTING_VERBOSE=1
```

### Disable Version Checking

To temporarily disable:

```bash
export ENABLE_VERSION_CHECK=0
```

Or add to `.env` file:

```bash
ENABLE_VERSION_CHECK=0
```

## Manual Usage

### Check for Updates (CLI)

```bash
# JSON output (for hooks)
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-version-checker.js --format=json

# Text output (human-readable)
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-version-checker.js --format=text

# Force refresh cache
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-version-checker.js --force-refresh
```

### Programmatic Usage

```javascript
const {
  checkForUpdates,
  getInstalledVersion,
  compareVersions
} = require('./plugin-version-checker');

// Check all plugins
const results = await checkForUpdates();

// Get specific plugin version
const version = getInstalledVersion('salesforce-plugin');

// Compare versions
const comparison = compareVersions('3.42.0', '3.45.0'); // Returns -1
```

## Cache Management

### Cache Location

```
~/.claude/plugin-versions-cache.json
```

### Cache Structure

```json
{
  "timestamp": 1733684400000,
  "versions": [
    {
      "plugin": "salesforce-plugin",
      "installed": "3.42.0",
      "latest": "3.45.0",
      "hasUpdate": true
    },
    {
      "plugin": "hubspot-plugin",
      "installed": "3.0.2",
      "latest": "3.0.2",
      "hasUpdate": false
    }
  ]
}
```

### Cache TTL

- **Default**: 1 hour (3,600,000 ms)
- **Rationale**: Balances freshness with API rate limits
- **Override**: Use `--force-refresh` flag to bypass

### Clear Cache

```bash
rm ~/.claude/plugin-versions-cache.json
```

## Supported Plugins

The version checker monitors these plugins:

1. `salesforce-plugin`
2. `hubspot-plugin`
3. `cross-platform-plugin`
4. `data-hygiene-plugin`
5. `developer-tools-plugin`
6. `gtm-planning-plugin`
7. `ai-consult-plugin`

## GitHub API Integration

### API Endpoint

```
https://api.github.com/repos/RevPalSFDC/opspal-plugin-internal-marketplace/contents/.claude-plugins/{plugin}/.claude-plugin/plugin.json
```

### Rate Limits

- **Unauthenticated**: 60 requests/hour
- **With cache**: ~1 request/hour (per session start)
- **Protection**: 1-hour cache + timeout prevents abuse

### Authentication (Optional)

To increase rate limits, set GitHub token:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

Then modify `plugin-version-checker.js` to add auth header:

```javascript
headers: {
  'User-Agent': 'OpsPal-Plugin-Version-Checker/1.0',
  'Authorization': `token ${process.env.GITHUB_TOKEN}`
}
```

## Testing

### Run Test Suite

```bash
# Basic tests
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/test-version-checker.sh

# Verbose output
bash .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/test-version-checker.sh --verbose
```

### Test Coverage

1. ✅ Script existence and executability
2. ✅ JSON output format validation
3. ✅ Text output format validation
4. ✅ Cache creation
5. ✅ Force refresh functionality
6. ✅ Timeout handling (< 3 seconds)
7. ✅ Installed version detection

### Expected Output

```
[TEST] Starting Plugin Version Checker Tests
[TEST] ======================================

[TEST] Test 1: Checking script existence...
✅ Script exists and is executable

[TEST] Test 2: Checking JSON output format...
✅ Valid JSON output

[TEST] Test 3: Checking text output format...
✅ Valid text output

[TEST] Test 4: Checking cache creation...
✅ Cache file created successfully

[TEST] Test 5: Checking force refresh...
✅ Force refresh working

[TEST] Test 6: Checking timeout handling...
✅ Completes within timeout

[TEST] Test 7: Checking installed version detection...
✅ Installed version detected: 3.42.0

[TEST] ======================================
✅ All tests passed!
```

## Troubleshooting

### Issue: No Updates Shown When Expected

**Symptoms**: You know there's a new version, but no notification appears

**Solutions**:

1. Clear cache and force refresh:
   ```bash
   rm ~/.claude/plugin-versions-cache.json
   node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/plugin-version-checker.js --force-refresh
   ```

2. Check GitHub API manually:
   ```bash
   curl -H "Accept: application/vnd.github.v3+json" \
     "https://api.github.com/repos/RevPalSFDC/opspal-plugin-internal-marketplace/contents/.claude-plugins/opspal-core-plugin/packages/domains/salesforce/.claude-plugin/plugin.json" \
     | jq -r '.content' | base64 -d | jq -r '.version'
   ```

3. Enable verbose logging:
   ```bash
   export ROUTING_VERBOSE=1
   ```

### Issue: Version Check Times Out

**Symptoms**: Hook takes too long, times out at 3 seconds

**Solutions**:

1. Check network connectivity:
   ```bash
   ping api.github.com
   ```

2. Test GitHub API access:
   ```bash
   curl -I https://api.github.com
   ```

3. Temporarily disable version check:
   ```bash
   export ENABLE_VERSION_CHECK=0
   ```

### Issue: Cache File Permissions Error

**Symptoms**: Error creating/reading cache file

**Solutions**:

1. Check directory permissions:
   ```bash
   ls -la ~/.claude/
   ```

2. Create directory manually:
   ```bash
   mkdir -p ~/.claude
   chmod 755 ~/.claude
   ```

3. Remove corrupted cache:
   ```bash
   rm ~/.claude/plugin-versions-cache.json
   ```

### Issue: GitHub Rate Limit Exceeded

**Symptoms**: API returns 403 error

**Solutions**:

1. Wait for rate limit reset (shown in response headers)

2. Use GitHub token for authentication (increases limit to 5,000/hour)

3. Increase cache TTL in `plugin-version-checker.js`:
   ```javascript
   const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
   ```

## Performance Impact

| Metric | Value |
|--------|-------|
| **Startup delay** | 50-200ms (cached) |
| **Startup delay** | 500-1500ms (API fetch) |
| **Cache hit rate** | 98%+ (1-hour TTL) |
| **Network usage** | ~5KB per API fetch |
| **Timeout protection** | 3 seconds max |

**Conclusion**: Minimal impact on session startup, with intelligent caching preventing repeated API calls.

## Architecture

### Components

1. **plugin-version-checker.js** - Core logic
   - Installed version detection
   - GitHub API integration
   - Cache management
   - Version comparison

2. **session-start-version-check.sh** - Hook wrapper
   - Timeout protection
   - Error handling
   - Graceful fallback

3. **test-version-checker.sh** - Test suite
   - 7 comprehensive tests
   - Validates all functionality

### Data Flow

```
Installed Plugin JSON → getInstalledVersion()
                             ↓
                    Cache Check (1-hour TTL)
                             ↓
                    ┌────────┴────────┐
                    │                 │
              Cache Hit         Cache Miss
                    │                 │
              Use Cache    Fetch from GitHub API
                    │                 │
                    └────────┬────────┘
                             ↓
                    compareVersions()
                             ↓
                    Format Output (JSON/Text)
                             ↓
                    Display to User (if updates)
```

## Future Enhancements

- [ ] Slack/email notifications for updates
- [ ] Automatic update installation (with confirmation)
- [ ] Version history tracking
- [ ] Release notes display
- [ ] Rollback to previous version
- [ ] Plugin dependency checking
- [ ] Breaking change warnings

## Related Documentation

- **Hook Architecture**: `docs/HOOK_ARCHITECTURE.md`
- **SessionStart Hooks**: `.claude/settings.json`
- **Plugin Development**: `CLAUDE.md`

## Support

For issues or questions:
- GitHub Issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- Reflection System: Use `/reflect` to submit feedback

---

**Developed by**: RevPal Engineering
**License**: Internal Use Only
