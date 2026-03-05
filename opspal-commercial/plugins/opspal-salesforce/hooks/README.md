# Salesforce Plugin Hooks

This directory contains hooks for the Salesforce plugin that enhance Claude Code functionality with Salesforce-specific operations.

## Active Hooks Status

### Registered in settings.json

| Hook | Purpose | Status |
|------|---------|--------|
| `session-start-agent-reminder.sh` | SessionStart hook - creates temp directories, checks for AGENT_REMINDER.md | ✅ ACTIVE |

### Called by Cross-Platform Hooks

| Hook | Purpose | Called By | Status |
|------|---------|-----------|---------|
| `user-prompt-hybrid.sh` | Salesforce-specific routing and complexity scoring | subagent-utilization-booster.sh (opspal-core) | ✅ ACTIVE |

### Disabled Hooks

| Hook | Status | Reason |
|------|--------|---------|
| `user-prompt-submit.sh.disabled` | ⚠️ DISABLED | Superseded by cross-platform master-prompt-handler.sh |

## Quick Reference

**Active Hooks**: 2
**Disabled Hooks**: 1
**Total Hook Count**: 43+ (including specialized SF operations)

**Documentation**: See below for circuit breaker and monitoring details, or run `/hooks-health` for system status.

## Install Hooks in Claude Code

Follow the Claude Code hook setup guide: https://code.claude.com/docs/en/hooks-guide#get-started-with-claude-code-hooks

Use the installer to register the baseline hooks:

```bash
node scripts/install-claude-hooks.js
```

Optional flags:

```bash
node scripts/install-claude-hooks.js --include-tool-hooks
node scripts/install-claude-hooks.js --force
node scripts/install-claude-hooks.js --dry-run
node scripts/install-claude-hooks.js --settings /path/to/settings.json
```

---

# Hook Monitoring & Circuit Breaker System

Graceful degradation and real-time monitoring for Claude Code hooks.

## Overview

The hook circuit breaker prevents cascading failures by detecting repeated hook errors and temporarily bypassing problematic hooks while they recover.

**Key Benefits:**
- **Prevents user-facing failures** - System degrades gracefully instead of blocking operations
- **Automatic recovery** - Tests recovery after cooldown period
- **Real-time monitoring** - Dashboard shows hook health and performance
- **Production-ready** - Battle-tested circuit breaker pattern

## Components

### 1. Circuit Breaker (`hook-circuit-breaker.sh`)

Wraps hook execution with failure detection and automatic bypass.

**States:**
- `CLOSED` - Normal operation, hook runs
- `OPEN` - Hook failed 3+ times, bypass hook
- `HALF-OPEN` - After cooldown, test recovery

**Behavior:**
- 3 failures within 5 minutes → Circuit OPENS (bypass hook)
- 2-minute cooldown → Circuit goes HALF-OPEN (test one request)
- Success in HALF-OPEN → Circuit CLOSES (resume normal operation)
- Failure in HALF-OPEN → Circuit stays OPEN (retry cooldown)

### 2. Hook Monitor (`scripts/lib/hook-monitor.js`)

Real-time dashboard and historical analysis of hook performance.

**Commands:**
```bash
# Real-time status
node scripts/lib/hook-monitor.js dashboard

# Historical analysis
node scripts/lib/hook-monitor.js analyze

# Manual reset
node scripts/lib/hook-monitor.js reset

# Check for alerts (CI/CD)
node scripts/lib/hook-monitor.js alert
```

## Usage

### Option 1: Wrap Existing Hook (Recommended for Testing)

Test circuit breaker without modifying your hook:

```bash
# Test with a sample hook
HOOK_SCRIPT="hooks/user-prompt-hybrid.sh" \
  bash hooks/hook-circuit-breaker.sh < test-input.json
```

### Option 2: Integrate into Settings (Production)

Modify `.claude/settings.json` to use circuit breaker wrapper:

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "HOOK_SCRIPT='${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-hybrid.sh' bash ${CLAUDE_PLUGIN_ROOT}/hooks/hook-circuit-breaker.sh",
      "timeout": 10000,
      "description": "Routing hook with circuit breaker protection"
    }
  }
}
```

**Before (Direct Hook):**
```json
"command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-hybrid.sh"
```

**After (With Circuit Breaker):**
```json
"command": "HOOK_SCRIPT='${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-hybrid.sh' bash ${CLAUDE_PLUGIN_ROOT}/hooks/hook-circuit-breaker.sh"
```

## Monitoring Dashboard

### Real-Time Status

```bash
$ node scripts/lib/hook-monitor.js dashboard

═══════════════════════════════════════════════════════
📊 HOOK MONITORING DASHBOARD
═══════════════════════════════════════════════════════

Circuit Breaker Status:
  State: CLOSED
  Last state change: 5m 30s ago
  Recent failures: 0/3
  Total successes: 42
  Total failures: 2
  Times opened: 0
  Recovery attempts: 0

Performance Metrics:
  Success rate: 95.5% (42/44)
  Avg execution time: 287ms
  P95 execution time: 450ms
  ██████████░

Recent Events (last 10):
  ✓ [14:23:45] success          CLOSED (289ms)
  ✓ [14:22:30] success          CLOSED (310ms)
  ✗ [14:20:15] failure          CLOSED (5002ms)
  ✓ [14:19:00] success          CLOSED (275ms)

Health Check:
  ✓ All checks passed - hooks are healthy
```

### Historical Analysis

```bash
$ node scripts/lib/hook-monitor.js analyze

═══════════════════════════════════════════════════════
📈 HOOK PERFORMANCE ANALYSIS
═══════════════════════════════════════════════════════

Overall Statistics:
  Total events: 156
    success: 148
    failure: 5
    bypassed: 0
    transition: 2
    recovery_success: 1

Performance Trends:
  Performance over last 24 hours:
    Min avg: 245ms
    Max avg: 510ms
    Trend: ↓ Improving

Error Analysis:
  Total failures: 5
  Total bypassed: 0
  Peak failure hour: 14:00 (3 failures)
```

## Circuit Breaker Behavior

### Normal Operation (CLOSED)

```
User Request → Hook Executes → Returns Result
                     ↓
              [Success Logged]
```

### Failure Detection

```
Hook Fails (Timeout/Error)
     ↓
Record Failure (1/3)
     ↓
Continue Operation (Circuit Still CLOSED)

[After 3rd failure within 5 minutes]
     ↓
Circuit OPENS
     ↓
Hook Bypassed (Warning Message to User)
```

### Recovery (HALF-OPEN → CLOSED)

```
Circuit OPEN for 2 minutes
     ↓
Cooldown Complete
     ↓
Circuit Goes HALF-OPEN (Test One Request)
     ↓
Hook Executes
     ↓
Success? → Circuit CLOSES (Normal Operation Resumed)
Failure? → Circuit Stays OPEN (Retry Cooldown)
```

## Metrics Tracked

### State Files

**Circuit State** (`.claude/hook-circuit-state.json`):
```json
{
  "state": "CLOSED",
  "failures": [],
  "lastStateChange": 1697654321,
  "successCount": 42,
  "failureCount": 2,
  "openCount": 0,
  "recoveryAttempts": 0
}
```

**Metrics Log** (`.claude/hook-metrics.json`):
```json
[
  {
    "timestamp": 1697654321,
    "event": "success",
    "state": "CLOSED",
    "executionTimeMs": 287,
    "hook": "user-prompt-hybrid.sh"
  },
  ...
]
```

### Event Types

- `success` - Hook executed successfully
- `failure` - Hook failed (timeout or error)
- `bypassed` - Hook skipped due to circuit being OPEN
- `transition` - Circuit state changed (CLOSED↔OPEN↔HALF-OPEN)
- `recovery_success` - Recovery attempt succeeded in HALF-OPEN

## Alerting (CI/CD Integration)

Check for critical issues (exits 1 if alerts found):

```bash
$ node scripts/lib/hook-monitor.js alert

ALERTS (2):
[CRITICAL] Circuit breaker is OPEN - hooks are bypassed
[WARNING] High failure rate: 12 failures in last 50 events
```

**Use in CI/CD:**
```yaml
# GitHub Actions example
- name: Check Hook Health
  run: |
    cd .claude-plugins/opspal-salesforce
    node scripts/lib/hook-monitor.js alert
```

## Manual Recovery

If circuit breaker is stuck OPEN, manually reset:

```bash
$ node scripts/lib/hook-monitor.js reset

Resetting circuit breaker...

✓ Circuit breaker reset to CLOSED state
Hooks will resume normal operation.
```

**When to use:**
- Circuit stuck OPEN after fixing underlying issue
- False positives caused circuit to open incorrectly
- Testing after configuration changes

## Configuration

### Tuning Circuit Breaker

Edit `hooks/hook-circuit-breaker.sh`:

```bash
# Failure threshold (default: 3)
FAILURE_THRESHOLD=3

# Time window for counting failures (default: 5 minutes)
FAILURE_WINDOW_SECONDS=300

# Cooldown before recovery test (default: 2 minutes)
COOLDOWN_SECONDS=120

# Hook execution timeout (default: 10 seconds)
HOOK_TIMEOUT=10
```

**Conservative Settings** (Slower to open, longer cooldown):
```bash
FAILURE_THRESHOLD=5
FAILURE_WINDOW_SECONDS=600  # 10 minutes
COOLDOWN_SECONDS=300        # 5 minutes
```

**Aggressive Settings** (Faster to open, shorter cooldown):
```bash
FAILURE_THRESHOLD=2
FAILURE_WINDOW_SECONDS=180  # 3 minutes
COOLDOWN_SECONDS=60         # 1 minute
```

## Troubleshooting

### Circuit Opens Frequently

**Symptoms:**
- Circuit breaker opens multiple times per day
- High recovery attempt count

**Solutions:**
1. Check hook performance: `node scripts/lib/hook-monitor.js analyze`
2. Increase timeout in settings.json if hooks are slow but working
3. Investigate root cause of failures (check hook logs)
4. Consider more conservative circuit breaker settings

### Circuit Won't Close

**Symptoms:**
- Circuit stuck in OPEN state
- Recovery attempts fail repeatedly

**Solutions:**
1. Check underlying hook health (run hook directly)
2. Review recent errors in metrics: `cat .claude/hook-metrics.json | jq '[.[] | select(.event == "failure")] | .[-5:]'`
3. Fix underlying issue (hook script bugs, dependency issues, etc.)
4. Manual reset once fixed: `node scripts/lib/hook-monitor.js reset`

### No Metrics Data

**Symptoms:**
- Dashboard shows "No metrics data available"
- Metrics file doesn't exist

**Solutions:**
1. Ensure circuit breaker is actually wrapping hooks (check settings.json)
2. Trigger a few operations to generate metrics
3. Check file permissions on `.claude/` directory

## Best Practices

### Development
- **Test without circuit breaker first** - Ensure hook works before wrapping
- **Monitor dashboard regularly** - Catch issues before circuit opens
- **Use verbose logging** - Debug failures when developing new hooks

### Production
- **Always use circuit breaker** - Prevents cascading failures
- **Set up alerting** - Know when circuit opens (use alert command in CI/CD)
- **Review metrics weekly** - Identify trends and optimize performance
- **Conservative settings** - Prefer false negatives over false positives

### Recovery
- **Don't reset manually unless necessary** - Let automatic recovery work
- **Fix root cause before resetting** - Manual reset without fixing will just reopen circuit
- **Monitor after recovery** - Ensure issue is truly resolved

## FAQ

**Q: Will circuit breaker slow down my hooks?**
A: No. Overhead is <10ms for state management. Only metrics logging adds minimal cost.

**Q: What happens when circuit is OPEN?**
A: Hook is bypassed, user sees warning message, operation continues without hook. Routing still works, just without auto-routing suggestions.

**Q: Can I disable circuit breaker temporarily?**
A: Yes. Change settings.json to call hook directly (remove circuit breaker wrapper). Not recommended in production.

**Q: How do I know if circuit breaker is working?**
A: Check dashboard: `node scripts/lib/hook-monitor.js dashboard`. If you see state changes and metrics, it's working.

**Q: What's the performance impact of metrics logging?**
A: Minimal (<5ms per operation). Metrics are appended to JSON file (last 1000 entries kept).

## Version History

### v1.0.0 (2025-10-18)
- Initial circuit breaker implementation
- Hook monitoring dashboard
- Historical performance analysis
- Manual reset capability
- CI/CD alerting support

---

**Last Updated**: 2025-10-18
