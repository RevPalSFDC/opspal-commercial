---
name: salesforce-runtime-telemetry-and-api-quota-framework
description: Operate telemetry and API quota tracking hooks for Salesforce command workflows and alert thresholds.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Runtime Telemetry and API Quota Framework

## When to Use This Skill

Use this skill when:
- Tracking Salesforce API call consumption across hook-driven workflows
- Setting up quota alert thresholds to prevent DailyApiRequests exhaustion
- Instrumenting telemetry for `sf` CLI command execution (duration, success/failure)
- Building hooks that warn or block when API budgets are low

**Not for**: Query safety validation (use `salesforce-query-safety-framework`), large result pagination (use `soql-large-result-paging-framework`), or general operations readiness (use `operations-readiness-framework`).

## API Quota Thresholds

| Limit | Check Command | Warning | Block |
|-------|--------------|---------|-------|
| DailyApiRequests | `sf org list limits --target-org <org>` | <20% remaining | <5% remaining |
| DataStorageMB | REST `/limits` endpoint | <10% remaining | <2% remaining |
| DailyBulkV2QueryJobs | REST `/limits` endpoint | <20% remaining | <5% remaining |
| SingleEmail | REST `/limits` endpoint | <100 remaining | 0 remaining |

## Telemetry Signals

```bash
# Check current API usage
sf org list limits --target-org <org> --json | jq '.result[] | select(.name == "DailyApiRequests") | {name, max: .max, remaining: .remaining, pctUsed: (100 - (.remaining / .max * 100))}'
```

Hook telemetry captures per `sf` command:
- Command name and arguments (redacted for sensitive data)
- Execution duration (ms)
- Exit code (success/failure)
- API calls consumed (estimated from command type)

## Alert Actions

| Budget Level | Hook Response |
|-------------|---------------|
| >80% remaining | No action |
| 50-80% remaining | Log advisory to telemetry |
| 20-50% remaining | Surface warning banner |
| 5-20% remaining | Block non-essential queries, allow critical operations |
| <5% remaining | Block all API-consuming operations |

## Workflow

1. Instrument PostToolUse hooks to track `sf` command execution
2. Query `/limits` endpoint periodically (cached, 5-min TTL)
3. Apply threshold-based advisory/block behavior
4. Log all telemetry to `~/.claude/logs/api-limits.jsonl`

## Routing Boundaries

Use this skill for API quota tracking and telemetry instrumentation.
Use `salesforce-query-safety-framework` for query-level validation.

## References

- [SF Command Telemetry](./sf-command-telemetry.md)
- [Operation Observation Signals](./operation-observe.md)
- [Quota and Budget Alerting](./quota-alerting.md)
