---
name: automation-preflight
description: Run cross-platform automation preflight checks for API/UI/hybrid operations
argument-hint: "[--platform marketo|hubspot|salesforce] [--mode api|ui|hybrid] [--operation <name>] [--instance <alias>]"
---

# Automation Preflight

Run a standardized preflight before executing automation workflows.

## Usage

```bash
/automation-preflight --platform marketo --mode api --operation bulk-export --instance prod-na
/automation-preflight --platform salesforce --mode ui --operation layout-audit --instance peregrine-staging
/automation-preflight --platform hubspot --mode hybrid --operation sync-remediation --instance portal-12345
```

## Inputs

- `--platform`: `marketo`, `hubspot`, or `salesforce`
- `--mode`: `api`, `ui`, or `hybrid`
- `--operation`: human-readable operation identifier
- `--instance`: instance/org/portal identifier

## What This Command Validates

1. **Auth posture**
- API mode: verify token/credential path exists and is non-interactive.
- UI mode: verify session file policy (age + existence).
- Hybrid mode: validate both and identify fallback path.

2. **Policy posture**
- Throughput budget status (window + daily soft limit)
- Retry + backoff policy is configured
- Circuit-breaker state is not open

3. **Safety posture**
- UI mode: destructive actions require explicit confirmation
- Login/CAPTCHA flows require manual intervention
- Export operations with PII flag human confirmation requirement

## Standard Output Contract

- `status`: `proceed`, `warn`, or `block`
- `blockers`: list of reasons that must be remediated before execution
- `warnings`: list of non-blocking risks
- `recommended_next_steps`: immediate actions by operator
- `policy_snapshot`: current window/daily usage and retry config summary

## Example Output

```markdown
status: warn

blockers:
- None

warnings:
- Session age exceeds 24h policy for instance "prod-na".
- Daily API budget is above 80% soft threshold.

recommended_next_steps:
- Re-authenticate in headed mode before destructive UI actions.
- Defer non-critical batch exports until budget resets.

policy_snapshot:
  calls_in_window: 44/50
  daily_count: 41021/50000
  circuit_state: CLOSED
```

## Escalation Rules

- `block`: auth failure, circuit open, daily budget exhausted
- `warn`: session stale, high API utilization, transient endpoint instability
- `proceed`: no blockers and no material warnings
