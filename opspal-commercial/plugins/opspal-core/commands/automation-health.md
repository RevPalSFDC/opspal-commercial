---
description: Show unified automation health signals across Marketo, HubSpot, Salesforce, and browser workflows
argument-hint: "[--platform marketo|hubspot|salesforce|all] [--window 15m|1h|24h] [--format markdown|json]"
---

# Automation Health

Display cross-platform automation reliability signals using normalized `AutomationEventV1` telemetry.

## Usage

```bash
/automation-health
/automation-health --platform marketo --window 1h
/automation-health --platform all --window 24h --format json
```

## Core Signals

- Authentication/session success rate
- Rate limit pressure and 429 trend
- Retry volume and circuit-breaker events
- UI manual intervention events (login/CAPTCHA)
- Policy-block events (daily budget / circuit open)

## Output Sections

1. **Health Summary**
- `overall_status`: healthy | warning | degraded
- `window`: selected observation period

2. **Platform Breakdown**
- `success_rate`
- `api_limit_pressure`
- `retry_rate`
- `manual_intervention_events`
- `policy_blocks`

3. **Active Risks**
- Prioritized list of blockers/warnings with recommendations

## Example

```markdown
overall_status: warning
window: 1h

platforms:
- marketo: success_rate 94.1%, api_limit_pressure high, policy_blocks 0
- hubspot: success_rate 98.9%, api_limit_pressure moderate, policy_blocks 0
- salesforce: success_rate 96.7%, api_limit_pressure low, policy_blocks 1

active_risks:
- salesforce: one circuit-open event in last 15 minutes
- marketo: sustained retry growth (+42% vs previous window)
```
