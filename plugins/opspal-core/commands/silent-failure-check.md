---
name: silent-failure-check
description: Run comprehensive silent failure detection across the plugin ecosystem
argument-hint: "[--quick] [--verbose] [--days N] [--json]"
allowed_tools:
  - Bash
---

# /silent-failure-check

Run comprehensive silent failure detection across the plugin ecosystem.

## Usage

```
/silent-failure-check [--quick] [--verbose] [--days N] [--json]
```

## Options

| Option | Description |
|--------|-------------|
| `--quick` | Skip metrics analysis, pre-session checks only |
| `--verbose` | Include all detection details |
| `--days N` | Analysis period for trends (default: 7) |
| `--json` | Output as JSON for automation |

## What It Checks

### Pre-Session Validators

| Validator | What It Detects |
|-----------|-----------------|
| **Environment Bypass** | Dangerous env vars like `SKIP_VALIDATION=1` |
| **Circuit Breaker State** | Open circuit breakers (validation being skipped) |
| **Cache Staleness** | Outdated cached data that may cause incorrect results |
| **Package Audit** | Missing critical system or npm packages |
| **Environment Isolation** | `ORG_SLUG` leakage between client contexts |

### Runtime Metrics (from current session)

- Validation skips count
- Cache fallback events
- Hook failures (silent and explicit)
- Overall session health score

### Historical Trends (7-day default)

- Detection count by severity
- Trend direction (improving/worsening/stable)
- Top recurring issues
- Health score over time

## Output

### Normal Output

```
✅ Silent Failure Check Results

Health Score: 85/100
Pre-Session Issues: 2 (0 critical)
Metrics Period: 7 days
Total Detections: 5
Trend: improving

Recommendations:
  1. Refresh stale caches: 2 stale cache warnings
  2. Review logged issues and address by severity
```

### Critical Issues

```
⚠️ SILENT FAILURE WARNING: SKIP_VALIDATION is set, which disables ALL safety checks

Health Score: 45/100
Pre-Session Issues: 3 (1 critical)
...

Recommendations:
  1. Remove SKIP_VALIDATION environment variable (8 bypass events logged)
  2. Reset open circuit breakers after fixing underlying issues
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Healthy - no critical issues |
| 1 | Warnings - non-critical issues detected |
| 2 | Critical - immediate attention required |

## Related Commands

- `/hooks-health` - Check hook system health
- `/checkdependencies` - Verify npm packages
- `/reflect` - Submit feedback for self-improvement

## Examples

```bash
# Quick pre-session check only
/silent-failure-check --quick

# 30-day trend analysis
/silent-failure-check --days 30

# JSON output for automation
/silent-failure-check --json | jq '.healthScore'

# Verbose with all details
/silent-failure-check --verbose
```

## Automatic Checks

This system runs automatically:

1. **SessionStart** - Pre-session validators run at the start of each session
2. **Stop** - Post-session analysis runs when session ends
3. **Continuous** - Runtime monitors track events during the session

You typically only need to run `/silent-failure-check` manually when:
- Investigating issues
- Reviewing trends
- Verifying fixes

## Log Location

Silent failure events are logged to:
```
~/.claude/logs/silent-failures.jsonl
```

View recent entries:
```bash
tail -20 ~/.claude/logs/silent-failures.jsonl | jq .
```
