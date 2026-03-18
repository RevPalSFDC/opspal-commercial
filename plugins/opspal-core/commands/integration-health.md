---
name: integration-health
description: Run cross-platform integration health checks using the wire test framework — validates SF↔HS sync, API connectivity, and field mapping integrity
argument-hint: "[optional: --platform sf|hs|all] [--schedule daily|weekly]"
intent: Execute integration health monitoring across connected platforms using the wire test framework
dependencies: [live-wire-sync-test-orchestrator]
failure_modes: [no_platforms_connected, api_credentials_missing, wire_test_config_missing]
---

# Integration Health Monitor

Run the wire test framework to validate cross-platform integration health. Checks SF↔HS sync connectivity, field mapping integrity, and connector status.

## Usage

```
/integration-health                    # Run all integration checks now
/integration-health --platform sf      # Salesforce connectivity only
/integration-health --platform hs      # HubSpot connectivity only
/integration-health --schedule weekly  # Set up scheduled weekly checks
/integration-health --report           # Show latest health report
```

## Instructions

### One-Time Health Check

1. Load wire test configuration from `config/wire-test-config.json` (or create default if missing)
2. Route to `opspal-core:live-wire-sync-test-orchestrator` agent for execution
3. The agent will:
   - Run pre-flight checks (API connectivity, credentials, field existence)
   - Execute sync probes (SF→HS and HS→SF if both connected)
   - Validate field mappings against actual sync behavior
   - Detect collisions and orphaned records
   - Generate health report with pass/fail/warn status per check
4. Output report to `reports/integration-health-{date}.json` and display summary

### Scheduled Monitoring

When `--schedule` is provided:
1. Create a scheduled task using the task scheduler:
   ```
   /schedule-add --name="Integration Health Check" \
     --type=claude-prompt \
     --schedule="0 6 * * 1" \
     --prompt="Run /integration-health and alert on any failures"
   ```
2. Configure KPI alert thresholds for degradation detection
3. Set up Slack webhook notification for failures (if `SLACK_WEBHOOK_URL` is set)

### Health Report Format

```
Integration Health Report — {date}
====================================
Overall: HEALTHY / DEGRADED / CRITICAL

Platform Connectivity:
  Salesforce:  ✅ Connected (org: {alias})
  HubSpot:     ✅ Connected (portal: {id})

Sync Health:
  SF→HS Probe: ✅ Pass (lag: 12s)
  HS→SF Probe: ✅ Pass (lag: 8s)
  Bidirectional: ✅ Consistent

Field Mapping:
  Mapped fields: 45/50 (90%)
  Unmapped: Email_Custom__c, HS_Score_Override
  Stale mappings: 2 (last sync > 7d)

Connector Status:
  HubSpot-Salesforce: Active
  Last sync: 2026-03-16 06:00:00 UTC
  Errors (24h): 3 (threshold: 10)
```

## Related

- Wire test framework: `scripts/lib/wire-test-*.js`
- Agent: `opspal-core:live-wire-sync-test-orchestrator`
- Config: `config/wire-test-config.json`
