---
name: healthcheck-hooks
description: Run comprehensive hook system diagnostics with silent failure detection
argument-hint: "[--quick] [--verbose] [--format json|markdown] [--save] [--watch [interval_ms]]"
allowed_tools:
  - Bash
---

Run comprehensive hook system diagnostics with silent failure detection.

## Usage

```
/healthcheck-hooks                    # Full diagnostic (terminal output)
/healthcheck-hooks --quick            # Skip execution tests (faster)
/healthcheck-hooks --verbose          # Include detailed fix instructions
/healthcheck-hooks --format json      # JSON output for automation
/healthcheck-hooks --format markdown  # Markdown report
/healthcheck-hooks --save             # Save report to ~/.claude/reports/hooks/
/healthcheck-hooks --watch            # Real-time monitoring (30s interval)
/healthcheck-hooks --watch 10000      # Custom interval in ms
```

## What It Checks (10-Stage Pipeline)

| Stage | Check | Detects |
|-------|-------|---------|
| 1 | Configuration Discovery | Missing hooks.json, invalid JSON |
| 2 | File Permissions | Scripts exist, executable |
| 3 | Syntax Validation | bash -n, node --check errors |
| 4 | Dependency Detection | Missing jq, node, bc, etc. |
| 5 | Execution Test | Timeout, crash, non-zero exit |
| 6 | **Silent Failure Detection** | Empty output, missing fields, hidden errors |
| 7 | Circuit Breaker State | Open circuits, high failure counts |
| 8 | Log Analysis | Recent errors, patterns |
| 9 | Cross-Reference | Orphaned scripts, duplicates |
| 10 | Health Summary | Score, recommendations |

## Silent Failure Detection

Detects hooks that:
- Exit 0 but produce no output when output expected
- Return JSON without required fields (systemMessage, decision)
- Contain error messages but don't fail
- Near-timeout without reporting

## Output Formats

**Terminal** (default): Colored boxes with status icons
**JSON**: Structured data for CI/CD integration
**Markdown**: Report suitable for documentation

## Exit Codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | HEALTHY | All checks pass |
| 1 | DEGRADED | Warnings present, hooks functional |
| 2 | UNHEALTHY | Critical issues, hooks may fail |

---

Execute the diagnostic:

```bash
node "${CLAUDE_PLUGIN_ROOT:-$(pwd)/.claude-plugins/opspal-core}/scripts/lib/hook-health-checker.js" $@
```
