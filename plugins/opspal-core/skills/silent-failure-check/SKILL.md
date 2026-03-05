---
name: silent-failure-check
description: Comprehensive silent failure detection across the OpsPal plugin ecosystem.
usage: Use when validating pre-session safety, cache freshness, and hidden failure modes.
---

# Silent Failure Check Skill

Comprehensive silent failure detection across the OpsPal plugin ecosystem.

## Invocation

- `/silent-failure-check`
- "check for silent failures"
- "run silent failure detection"
- "silent failure health"

## Description

Silent failures occur when operations complete without explicit errors but produce incorrect, incomplete, or stale results. This skill detects conditions that cause silent failures before they impact your work.

## What It Detects

### Critical (Severity: CRITICAL)

1. **Validation Bypass** - `SKIP_VALIDATION=1` disables ALL safety checks
2. **Open Circuit Breakers** - Validation hooks being silently skipped

### High (Severity: HIGH)

3. **Cache Fallbacks** - Using stale data after API failures
4. **Environment Leakage** - Wrong client context (ORG_SLUG mismatch)
5. **Silent Hook Failures** - Hooks that exit 0 but produce invalid output

### Medium (Severity: MEDIUM)

6. **Stale Caches** - Outdated field dictionaries, org context
7. **Missing Packages** - npm dependencies not installed

## Usage

### Quick Check (Pre-Session Only)

```
/silent-failure-check --quick
```

Fast validation of current state without historical analysis.

### Full Check with Trends

```
/silent-failure-check --days 14
```

Includes 14-day trend analysis and pattern detection.

### JSON Output

```
/silent-failure-check --json
```

For automation and scripting.

## Output Interpretation

### Health Score

| Score | Status | Action |
|-------|--------|--------|
| 80-100 | Healthy | No action needed |
| 50-79 | Degraded | Review warnings |
| 0-49 | Unhealthy | Immediate attention required |

### Trend Direction

- **Improving** - Fewer issues over time
- **Stable** - Consistent issue rate
- **Worsening** - Increasing issues (investigate)

## Automatic Behavior

The silent failure detection system runs automatically:

- **SessionStart hook** - Checks dangerous conditions before work begins
- **Stop hook** - Analyzes session patterns and updates metrics
- **Runtime monitors** - Track validation skips, cache fallbacks, hook failures

You only need to manually run this skill when:
- Investigating specific issues
- Reviewing historical trends
- Verifying that fixes were effective

## Integration with Self-Improvement Pipeline

When critical patterns are detected:
1. Auto-reflection is generated
2. Reflection feeds into `/processreflections`
3. Prevention hooks may be auto-generated
4. ROI is tracked for effectiveness verification

## Related Skills

- `/hooks-health` - Diagnose hook system issues
- `/checkdependencies` - Verify npm packages
- `/reflect` - Submit development feedback

## Configuration

Config file: `plugins/opspal-core/config/silent-failure-detection.json`

Key settings:
- `preSession.enabled` - Enable/disable pre-session checks
- `runtime.thresholds` - Alert thresholds for various metrics
- `alerting.terminal` - Show terminal banners for critical issues
- `verification.period` - Days for trend analysis (default: 7)
