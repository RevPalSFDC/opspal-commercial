# Quality Check Hooks

Pre-commit hooks to prevent common quality issues from being committed.

## Available Hooks

### pre-commit-quality-check.sh

**Purpose**: Prevents critical flaws from being committed by checking for:

1. **Cross-Boundary Imports** - `.claude/` imported from plugins (gitignored)
2. **Mock Data Generation** - Simulate mode returning fake data
3. **Silent Error Handling** - `catch { return null }` patterns
4. **Missing DataAccessError** - API files without proper error handling
5. **Hardcoded Credentials** - Exposed secrets or API keys

**Status**:
- ❌ **BLOCKING**: Cross-boundary imports, hardcoded credentials
- ⚠️  **WARNING**: Mock data, silent errors, missing DataAccessError

## Installation

### Option 1: Git Hook (Automatic on every commit)

```bash
# Install to git hooks directory
cp .claude-plugins/hooks/pre-commit-quality-check.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Option 2: Manual Execution (Run on demand)

```bash
# Run before committing
./.claude-plugins/hooks/pre-commit-quality-check.sh
```

### Option 3: CI/CD Integration

```yaml
# GitHub Actions example
- name: Quality Check
  run: |
    chmod +x .claude-plugins/hooks/pre-commit-quality-check.sh
    ./.claude-plugins/hooks/pre-commit-quality-check.sh
```

## Usage

### Automatic (Git Hook)

Once installed as a git hook, it runs automatically on every `git commit`:

```bash
git add .
git commit -m "feat: Add new feature"
# → Hook runs automatically
# → Blocks commit if critical issues found
# → Shows warnings for non-critical issues
```

### Manual

```bash
# Check staged files
git add .
./.claude-plugins/hooks/pre-commit-quality-check.sh

# Fix any issues, then commit
git commit -m "feat: Add new feature"
```

## Example Output

### ✅ All Checks Pass

```
🔍 Running pre-commit quality checks...

Checking 15 staged files...

[1/5] Checking for cross-boundary imports...
✓ No cross-boundary imports

[2/5] Checking for mock data generation...
✓ No mock data generation detected

[3/5] Checking for silent error handling...
✓ No obvious silent error patterns

[4/5] Checking for missing DataAccessError imports...
✓ All API files have DataAccessError or no API calls

[5/5] Checking for hardcoded credentials...
✓ No hardcoded credentials detected

═══════════════════════════════════════
✓ All quality checks passed!
```

### ❌ Critical Issues Found

```
🔍 Running pre-commit quality checks...

Checking 3 staged files...

[1/5] Checking for cross-boundary imports...
❌ BLOCKED: Found cross-boundary imports (gitignored .claude/ from plugins)

  • ${CLAUDE_PLUGIN_ROOT}/agents/example.md
    31:You MUST follow ALL standards defined in [cross-boundary-import]

Fix: Replace cross-boundary imports with plugin-local paths
Example: Use @import ../docs/shared/STANDARDS.md instead

[5/5] Checking for hardcoded credentials...
❌ BLOCKED: Found potential hardcoded credentials

  • ${CLAUDE_PLUGIN_ROOT}/hooks/post-reflect.sh:133
    export SUPABASE_URL="[hardcoded-url-example]"

Fix: Use environment variables instead
Example: Use process.env.SUPABASE_URL (not hardcoded URL)

═══════════════════════════════════════
❌ COMMIT BLOCKED: 2 critical issues found
⚠️  0 warnings (non-blocking)

Fix the errors above and try again.
```

### ⚠️ Warnings Only

```
🔍 Running pre-commit quality checks...

Checking 5 staged files...

[1/5] Checking for cross-boundary imports...
✓ No cross-boundary imports

[2/5] Checking for mock data generation...
⚠️  WARNING: Found potential mock data generation

  • .claude-plugins/hubspot-core-plugin/scripts/lib/batch-property-metadata.js
    195:    if (this.simulateMode) {
    197:      const mockProperties = Array.from({ length: 20 }, (_, i) => ({

Review: Ensure mock data throws DataAccessError instead of returning
Correct pattern:
  if (simulateMode) throw new DataAccessError('API', 'Simulate mode', {...})

[3/5] Checking for silent error handling...
⚠️  WARNING: Found potential silent error handling

  • ${CLAUDE_PLUGIN_ROOT}/scripts/lib/example.js
    42:    } catch (error) {
    43:      return null;

Review: Consider throwing DataAccessError instead of returning null/[]/{}
Correct pattern:
  catch (error) { throw new DataAccessError('Source', error.message, {...}) }

═══════════════════════════════════════
⚠️  2 warnings found (commit allowed)

Review warnings before pushing.

✓ Commit proceeding...
```

## What Each Check Does

### 1. Cross-Boundary Imports

**Problem**: Plugins importing from gitignored `.claude/` directory
**Impact**: Fresh installs will fail with "Cannot find module"
**Fix**: Copy shared files to each plugin's `docs/` directory

```diff
- [cross-boundary-import-example]
+ @import ../docs/shared/STANDARDS.md
```

### 2. Mock Data Generation

**Problem**: Simulate mode returning fake data instead of failing fast
**Impact**: Violates NO-MOCKS policy, operations appear successful with fake data
**Fix**: Throw DataAccessError instead

```diff
  if (this.simulateMode) {
-   return mockData;
+   throw new DataAccessError('API', 'Simulate mode enabled', {...});
  }
```

### 3. Silent Error Handling

**Problem**: Errors swallowed with `return null/[]/{}` fallbacks
**Impact**: Operations fail silently, hard to debug
**Fix**: Throw DataAccessError or propagate error

```diff
  try {
    data = await fetchData();
  } catch (error) {
-   return null;
+   throw new DataAccessError('API', error.message, {...});
  }
```

### 4. Missing DataAccessError

**Problem**: API files without DataAccessError import
**Impact**: Inconsistent error handling across codebase
**Fix**: Add import and use in error paths

```javascript
const { DataAccessError } = require('./data-access-error');

try {
  // API call
} catch (error) {
  throw new DataAccessError('HubSpot API', error.message, {
    endpoint: '/api/v1/resource'
  });
}
```

### 5. Hardcoded Credentials

**Problem**: API keys, URLs, tokens hardcoded in source
**Impact**: Security risk, credentials exposed in repo
**Fix**: Use environment variables

```diff
- const apiKey = 'sk_live_abc123';
+ const apiKey = process.env.API_KEY;
```

## Bypassing Checks

**NOT RECOMMENDED** - Only use if absolutely necessary:

```bash
# Skip pre-commit hook
git commit --no-verify -m "Emergency fix"

# Or set SKIP_QUALITY_CHECK=1
SKIP_QUALITY_CHECK=1 git commit -m "Emergency fix"
```

**IMPORTANT**: Never skip checks for:
- Cross-boundary imports (will break distribution)
- Hardcoded credentials (security risk)

## Troubleshooting

### Hook not running

**Problem**: Git hook doesn't execute
**Solution**:
```bash
# Ensure hook is in correct location
ls -la .git/hooks/pre-commit

# Ensure hook is executable
chmod +x .git/hooks/pre-commit

# Test manually
./.claude-plugins/hooks/pre-commit-quality-check.sh
```

### False positives

**Problem**: Hook flags legitimate code
**Solution**:
1. Review the flagged code
2. If legitimate, document why (code comment)
3. If hook is wrong, adjust pattern in hook script

### Hook too slow

**Problem**: Hook takes >5 seconds
**Solution**:
- Hook only checks **staged files**, not entire repo
- If still slow, check for very large files in staging

## Maintenance

### Adding New Checks

1. Edit `.claude-plugins/hooks/pre-commit-quality-check.sh`
2. Add new check section following the pattern:
   ```bash
   echo -e "${BOLD}[N/5] Checking for XYZ...${NC}"
   # Check logic here
   if [ condition ]; then
     echo -e "${RED}❌ BLOCKED: ...${NC}"
     ERRORS=$((ERRORS + 1))
   else
     echo -e "${GREEN}✓ No issues${NC}"
   fi
   ```
3. Update total check count `[N/5]` → `[N/6]`
4. Test with various scenarios

### Updating Patterns

Edit the grep patterns in the check sections:

```bash
# Example: Add new mock data pattern
MOCK_DATA=$(echo "$STAGED_FILES" | grep -E '\.(js|ts)$' | \
  xargs grep -l "mockData\|fakeData\|newPattern" 2>/dev/null || true)
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Quality Check

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Quality Checks
        run: |
          chmod +x .claude-plugins/hooks/pre-commit-quality-check.sh
          ./.claude-plugins/hooks/pre-commit-quality-check.sh
```

### GitLab CI

```yaml
quality-check:
  script:
    - chmod +x .claude-plugins/hooks/pre-commit-quality-check.sh
    - ./.claude-plugins/hooks/pre-commit-quality-check.sh
  only:
    - merge_requests
    - main
```

## Related Documentation

- **Phase 1 Audit Report**: See comprehensive audit findings
- **Data Integrity Policy**: `docs/DATA_INTEGRITY.md`
- **Error Handling Standards**: `docs/ERROR_HANDLING.md`
- **Plugin Architecture**: `docs/PLUGIN_ARCHITECTURE.md`

---

**Last Updated**: 2025-11-08
**Maintained By**: OpsPal Quality Team
