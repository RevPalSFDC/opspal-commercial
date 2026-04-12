---
description: Full governance and compliance audit for Attio workspace
argument-hint: "[--scope full|quick] [--dimension schema|access|webhook|data|change-control]"
---

# /attio-governance-audit

Run a governance and compliance audit across your Attio workspace. Scores 5 compliance dimensions (0–100 total) and produces a prioritized remediation backlog. Powered by the Attio governance framework methodology.

## Usage

```
/attio-governance-audit
/attio-governance-audit --scope quick
/attio-governance-audit --scope full
/attio-governance-audit --dimension webhook
/attio-governance-audit --dimension schema --dimension access
```

## What This Command Does

Delegates to **attio-governance-enforcer** + **attio-automation-auditor** to run a comprehensive workspace audit across all governance dimensions.

## Audit Dimensions

| Dimension | Weight | Checks |
|-----------|--------|--------|
| **Schema Compliance** | 20 pts | Naming conventions, orphaned attributes, relationship documentation |
| **Access Governance** | 20 pts | API token scopes, member roles, inactive member review |
| **Webhook Health** | 20 pts | URL reachability, HMAC configuration, event coverage gaps |
| **Data Quality** | 20 pts | Required attribute fill rates, duplicate detection, email validation |
| **Change Control** | 20 pts | Schema mutation log, export-before-delete policy, rollback documentation |

## Scope Options

### `--scope quick` (default for interactive use)
- Runs API-accessible checks only
- Skips URL health checks (faster)
- Produces a 5-dimension score with top 3 issues per dimension
- Runtime: ~1–2 minutes

### `--scope full`
- Runs all checks including webhook URL health probes
- Detailed sub-check scoring per dimension
- Full remediation backlog with effort estimates
- Runtime: ~3–5 minutes

## Dimension Targeting (`--dimension`)

Run a focused audit on a single dimension:
- `schema` — Object naming, attribute audit, relationship mapping
- `access` — Member roles, API token scope notes, inactive member check
- `webhook` — Webhook inventory, URL health, HMAC status, event coverage
- `data` — Fill rate analysis, duplicate detection lag, email format validation
- `change-control` — Schema mutation log review, delete policy enforcement

Multiple `--dimension` flags accepted for a subset audit.

## Output

```markdown
# Attio Governance Audit Report
Date: [timestamp]

## Governance Score: [0–100] ([Grade])

| Dimension          | Score | Grade |
|--------------------|-------|-------|
| Schema Compliance  | 18/20 | A     |
| Access Governance  | 14/20 | B     |
| Webhook Health     | 10/20 | C     |
| Data Quality       | 16/20 | A     |
| Change Control     | 12/20 | B     |

## Priority Remediation Backlog
[P1] Configure HMAC on 3 unsigned webhooks — High impact, Low effort
[P2] Suspend 4 inactive members — Medium impact, Low effort
...

## Manual Audit Items (UI Required)
- Internal workflow rule review
- API token scope verification
```

## Skill Reference

Audit methodology is defined in `skills/attio-governance-framework/`. Load it for scoring rubric details and remediation guidance.

## Delegates To

**attio-governance-enforcer** (schema, access, data, change-control dimensions) + **attio-automation-auditor** (webhook dimension).
