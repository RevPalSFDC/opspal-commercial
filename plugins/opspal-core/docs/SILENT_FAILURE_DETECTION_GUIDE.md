# Silent Failure Detection System Guide

## Overview

Silent failures occur when operations complete without explicit errors but produce incorrect, incomplete, or stale results. The Silent Failure Detection System proactively identifies these conditions before they impact your work.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 SILENT FAILURE DETECTOR                         │
│                    (Orchestrator)                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ PRE-SESSION  │  │   RUNTIME    │  │ POST-SESSION │
│ VALIDATORS   │  │  MONITORS    │  │  ANALYZERS   │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ • Env bypass │  │ • Skip track │  │ • Patterns   │
│ • Circuit    │  │ • Cache hits │  │ • Trends     │
│ • Staleness  │  │ • Hook fails │  │ • Health     │
│ • Packages   │  │ • Contracts  │  │   score      │
│ • Isolation  │  └──────────────┘  └──────────────┘
└──────────────┘           │
                           ▼
              ┌─────────────────────────┐
              │   ALERTING + METRICS    │
              ├─────────────────────────┤
              │ • Terminal banner       │
              │ • Log file              │
              │ • Auto-reflection       │
              │ • Dashboard             │
              └─────────────────────────┘
```

## Components

### 1. Pre-Session Validators

Run automatically at session start via `pre-session-silent-failure-check.sh` hook.

| Validator | What It Detects | Severity |
|-----------|-----------------|----------|
| **EnvBypassValidator** | `SKIP_VALIDATION=1` and similar vars | CRITICAL |
| **CircuitBreakerStateValidator** | Open circuit breakers (skipping hooks) | CRITICAL |
| **CacheStalenessValidator** | Outdated cached data | MEDIUM |
| **PackageAuditValidator** | Missing jq, npm packages | HIGH |
| **EnvironmentIsolationValidator** | ORG_SLUG leakage between clients | HIGH |

### 2. Runtime Monitors

Track events during the session, available via `getGlobalMonitor()`.

| Monitor | What It Tracks |
|---------|----------------|
| **ValidationSkipTracker** | Counts validation skips, alerts at threshold |
| **CacheHitMissMonitor** | Tracks stale hits and API fallbacks |
| **HookFailureCounter** | Counts silent vs explicit hook failures |

### 3. Post-Session Analyzers

Run at session end via `stop-session-silent-failure-summary.sh` hook.

| Analyzer | What It Does |
|----------|--------------|
| **SilentFailurePatternDetector** | Detects recurring patterns across metrics |
| **SessionAnomalyScorer** | Compares session to historical baseline |
| **ReflectionGenerator** | Auto-generates reflections for self-improvement |

### 4. Alerting System

Multi-channel alerting for detected issues.

| Channel | When Used |
|---------|-----------|
| **Terminal Banner** | CRITICAL and HIGH severity issues |
| **Log File** | All detections (JSONL format) |
| **Auto-Reflection** | CRITICAL patterns (feeds into /processreflections) |
| **Slack** | (Optional) HIGH and CRITICAL issues |

### 5. Metrics Aggregator

Trend analysis and dashboard generation.

- 7-day rolling analysis (configurable)
- Health score calculation
- Trend direction detection
- Markdown dashboard generation

## Quick Start

### Manual Check

```bash
# Full check with 7-day metrics
/silent-failure-check

# Quick pre-session check only
/silent-failure-check --quick

# 30-day trend analysis
/silent-failure-check --days 30

# JSON output for automation
/silent-failure-check --json
```

### CLI Usage

```bash
# Pre-session check (hook-compatible output)
node scripts/lib/silent-failure-detector.js pre-session

# Full check
node scripts/lib/silent-failure-detector.js check 14

# Generate dashboard
node scripts/lib/silent-failure-detector.js dashboard

# Quick health status
node scripts/lib/silent-failure-detector.js health
```

## Configuration

Config file: `config/silent-failure-detection.json`

```json
{
  "preSession": {
    "enabled": true,
    "validators": ["env-bypass", "circuit-breaker", "cache-staleness", "package-audit", "env-isolation"],
    "warnOnly": ["cache-staleness", "package-audit"]
  },
  "runtime": {
    "enabled": true,
    "thresholds": {
      "validationSkips": 5,
      "cacheStaleHits": 10,
      "hookFailures": 3
    }
  },
  "alerting": {
    "terminal": true,
    "log": true,
    "reflections": true
  },
  "verification": {
    "period": 7
  }
}
```

### Environment Variables

| Variable | Effect |
|----------|--------|
| `SKIP_VALIDATION=1` | **DANGEROUS** - Disables ALL validation |
| `SKIP_TOOL_VALIDATION=1` | Disables tool contract checks |
| `GLOBAL_LIVE_FIRST=false` | Enables stale cache fallbacks |

## Silent Failure Types

### Critical (Immediate Action Required)

#### ENV_BYPASS
**Cause**: `SKIP_VALIDATION=1` is set
**Impact**: ALL safety checks disabled
**Fix**: `unset SKIP_VALIDATION`

#### CIRCUIT_OPEN
**Cause**: Hook circuit breaker in OPEN state
**Impact**: Validation hooks being silently skipped
**Fix**: Fix underlying issue, then `rm .claude/hook-circuit-state.json`

### High (Review Promptly)

#### ENV_LEAKAGE
**Cause**: `ORG_SLUG` doesn't match working directory
**Impact**: Commands may run against wrong client
**Fix**: Verify correct context or `unset ORG_SLUG`

#### MISSING_SYSTEM_PACKAGE
**Cause**: Critical tool (jq, node) not installed
**Impact**: Hooks and scripts will fail
**Fix**: Install missing package

### Medium (Monitor)

#### STALE_CACHE
**Cause**: Cached data exceeds age threshold
**Impact**: Operations may use outdated context
**Fix**: Refresh or delete cache file

#### MISSING_NPM_PACKAGES
**Cause**: Plugin npm dependencies not installed
**Impact**: Scripts may fail at runtime
**Fix**: `/checkdependencies --fix`

## Integration with Self-Improvement Pipeline

The silent failure detection system integrates with the self-improvement pipeline:

1. **Detection** → Silent failure pattern detected
2. **Reflection** → Auto-generated reflection created
3. **Processing** → `/processreflections` analyzes patterns
4. **Prevention** → Hook generated when 3+ similar reflections
5. **Verification** → 7-day effectiveness measurement

This creates a closed loop where recurring issues automatically generate prevention mechanisms.

## Log Files

| Log | Location | Format |
|-----|----------|--------|
| Silent Failures | `~/.claude/logs/silent-failures.jsonl` | JSONL |
| Session Analysis | `~/.claude/logs/silent-failure-session.log` | Text |
| Metrics Reports | `~/.claude/metrics/silent-failures/` | JSON/MD |

### Viewing Logs

```bash
# Recent silent failures
tail -20 ~/.claude/logs/silent-failures.jsonl | jq .

# Session analysis log
tail -50 ~/.claude/logs/silent-failure-session.log
```

## Troubleshooting

### "CRITICAL issues detected" at session start

1. Check which validators triggered:
   ```bash
   node scripts/lib/silent-failure-detector.js pre-session --json | jq '.results[] | select(.passed == false)'
   ```

2. Address by severity (CRITICAL first)

3. Re-run check to verify fix:
   ```bash
   /silent-failure-check --quick
   ```

### Health score is low but no obvious issues

1. Check 7-day trend analysis:
   ```bash
   /silent-failure-check --days 7
   ```

2. Review log file for patterns:
   ```bash
   cat ~/.claude/logs/silent-failures.jsonl | jq -r '.type' | sort | uniq -c | sort -rn
   ```

3. Check if specific hook is failing:
   ```bash
   /hooks-health
   ```

### Circuit breaker keeps opening

1. Check which hook is failing:
   ```bash
   cat .claude/hook-circuit-state.json
   ```

2. Test the specific hook:
   ```bash
   bash hooks/<hook-name>.sh
   ```

3. Fix the underlying issue before resetting circuit

## Best Practices

1. **Don't suppress warnings** - Investigate the root cause instead of setting `SKIP_VALIDATION`

2. **Reset circuits after fixing** - Don't just delete the state file; fix the underlying issue first

3. **Review trends weekly** - Run `/silent-failure-check --days 7` to catch patterns early

4. **Keep caches fresh** - If you see stale cache warnings, refresh before proceeding

5. **Check context** - Verify `ORG_SLUG` matches your working directory when starting work

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/lib/silent-failure-detector.js` | Main orchestrator |
| `scripts/lib/silent-failure/pre-session-validators.js` | Pre-session checks |
| `scripts/lib/silent-failure/runtime-monitors.js` | Runtime tracking |
| `scripts/lib/silent-failure/post-session-analyzers.js` | Pattern detection |
| `scripts/lib/silent-failure/alerting.js` | Multi-channel alerts |
| `scripts/lib/silent-failure/metrics-aggregator.js` | Trend analysis |
| `hooks/pre-session-silent-failure-check.sh` | SessionStart hook |
| `hooks/stop-session-silent-failure-summary.sh` | Stop hook |
| `config/silent-failure-detection.json` | Configuration |
| `commands/silent-failure-check.md` | Command definition |
| `skills/silent-failure-check/SKILL.md` | Skill definition |

## Version History

- **v1.0.0** (2026-02-05): Initial release
  - Pre-session validators (5 types)
  - Runtime monitors (3 types)
  - Post-session analyzers (2 types)
  - Multi-channel alerting
  - 7-day trend analysis
  - Integration with self-improvement pipeline
