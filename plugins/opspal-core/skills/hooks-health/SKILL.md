---
name: hooks-health
description: Run a comprehensive health check of the Claude Code hook system.
allowed-tools: Read, Bash, Glob, Grep
---

# Hook System Health Check

Run comprehensive diagnostics on all configured hooks with silent failure detection.

## Quick Start

```bash
/hooks-health
```

## Usage

```bash
/hooks-health                    # Full diagnostic (terminal output)
/hooks-health --quick            # Skip execution tests (faster)
/hooks-health --verbose          # Include detailed fix instructions
/hooks-health --format json      # JSON output for automation
/hooks-health --format markdown  # Markdown report
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

## Exit Codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | HEALTHY | All checks pass, score 90-100 |
| 1 | DEGRADED | Warnings present, score 50-89 |
| 2 | UNHEALTHY | Critical issues, score 0-49 |

## Execution

Run the health checker:

```bash
node "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $(dirname $0)))}/scripts/lib/hook-health-checker.js" "$@"
```
