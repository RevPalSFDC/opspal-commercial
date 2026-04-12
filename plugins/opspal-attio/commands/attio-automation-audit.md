---
description: Webhook and integration health audit for Attio
argument-hint: "[--check-urls] [--verify-hmac]"
---

# /attio-automation-audit

Audit webhook health and integration coverage for your Attio workspace. Since Attio has no REST API for internal workflow automations, this command focuses exclusively on API-accessible automation surfaces: webhooks, event coverage, HMAC security, and URL reachability.

## Usage

```
/attio-automation-audit
/attio-automation-audit --check-urls
/attio-automation-audit --verify-hmac
/attio-automation-audit --check-urls --verify-hmac
```

## Important Limitation

**Attio has no REST API for workflow automations.** Attio's internal trigger-based workflows, automatic record updates, and notification rules are managed exclusively through the Attio UI and are not accessible via API or MCP tools. This command audits only what is API-visible.

## Flags

### `--check-urls`
Performs an HTTP health check on each registered webhook's target URL.
- GET or HEAD request to the URL (with a 5-second timeout)
- Reports HTTP status code: 200–299 (healthy), 4xx (auth/routing issue), 5xx (server error), timeout (unreachable)
- Adds ~30 seconds to audit runtime per 10 webhooks

### `--verify-hmac`
Checks whether each webhook has an HMAC secret configured.
- Webhooks without HMAC accept any inbound POST without signature verification
- Reports: configured (count) vs. not configured (count)
- Lists webhook IDs missing HMAC as HIGH priority findings

## What Gets Audited

### 1. Webhook Inventory
Complete listing of all registered webhooks:
- ID, name, target URL
- Subscribed event types
- HMAC secret presence (yes/no — secret value never logged)
- Active/inactive status

### 2. Event Coverage Analysis
Maps subscribed events against business-critical Attio events:
- people: created, updated, deleted
- companies: created, updated, merged
- deals: created, updated, status_changed (if deals object active)
- Custom objects: created, updated, deleted

Reports gaps: critical object events with no webhook subscriber.

### 3. API Token Scope Review (Advisory)
Notes that API token management is UI-only. Flags manual review as a required follow-up:
- Review all active tokens in Attio Settings → API
- Revoke tokens unused for 90+ days
- Ensure automation tokens have minimum required scope

### 4. Zombie Webhook Detection
Webhooks pointing to decommissioned or unreachable endpoints (only available with `--check-urls`).

## Output Format

```markdown
# Attio Automation Audit
Date: [timestamp]

## Critical Limitation
Internal workflow automations are UI-only and not auditable via API.

## Webhook Summary
Total: [N] | Active: [N] | Inactive: [N]
HMAC Configured: [N] | Not Configured: [N]

## Findings

### HIGH: HMAC Not Configured
- Webhook [id] — [name] → [URL]

### HIGH: Unreachable Webhook Endpoint
- Webhook [id] — [name] → [URL] (HTTP 0 — connection refused)

### MEDIUM: Event Coverage Gaps
- Object 'companies' has no webhook for 'merged' event

### LOW: Inactive Webhooks
- Webhook [id] — inactive for >90 days

## Recommendations
[Prioritized list with remediation steps]

## Manual Audit Items
- Internal workflow rule review (Attio UI → Automations)
- API token scope review (Attio UI → Settings → API)
```

## Delegates To

**attio-automation-auditor** (read-only audit agent using Sonnet model).
