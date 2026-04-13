---
name: runbook-domain-router
description: Route ambiguous operational requests to the correct domain runbooks across plugins with confidence scoring and fallback paths.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-runbook-generator
version: 1.0.0
---

# runbook-domain-router

## When to Use This Skill

- A request mentions multiple platforms (Salesforce + HubSpot, or HubSpot + Marketo) and runbook ownership is ambiguous
- An incident or lifecycle task (deploy, rollback, dedup, territory assignment) could belong to 2+ domain runbooks
- The user's request contains keywords from different plugin domains and the correct runbook is not obvious
- A low-confidence routing event requires presenting alternatives with justification rather than a single silent choice
- A new cross-domain use case needs a routing entry added to the domain table

**Not for**: routing Claude's sub-agent task execution — use the routing governance skills for that. This skill routes to operational runbooks, not agents.

## Domain Routing Table

| Primary Keyword(s) | Confidence Signal | First Runbook | Fallback Runbook |
|--------------------|------------------|---------------|-----------------|
| CPQ, quote, contract | `sfdc` in context | `opspal-salesforce:cpq-assessment` | `opspal-salesforce:q2c-audit` |
| Lead routing, MQL | `marketo` or `hubspot` in context | `opspal-marketo:diagnose-lead-routing` | `opspal-hubspot:hssfdc-analyze` |
| Territory, quota | GTM context | `opspal-gtm-planning:gtm-territory` | `opspal-salesforce:territory-management` |
| Dedup, duplicates | platform not specified | `opspal-data-hygiene` | `opspal-hubspot:hsdedup` |
| Workflow, automation | platform not specified | Prompt for platform | — |
| OKR, objective | any | `opspal-okrs:okr-generate` | `opspal-okrs:okr-status` |

## Workflow

1. **Extract domain signals from the request**: identify platform mentions, tool names, object types (Lead, Contact, Opportunity), and lifecycle stage (audit, build, incident, dedup).
2. **Score domain candidates**: assign a confidence score (0–1) to each candidate runbook based on signal match strength; a single strong platform mention scores 0.8+.
3. **Apply the routing table**: match the highest-confidence candidate against the domain routing table; select the `First Runbook` if confidence > 0.7, present alternatives if confidence is 0.5–0.7.
4. **Handle low-confidence routing**: if confidence < 0.5 or the request spans 3+ domains, surface the top 2–3 runbook candidates with their confidence scores and ask the user to confirm before proceeding.
5. **Produce the ordered route**: output a ranked list: primary runbook, alternatives, and escalation path (e.g., `opspal-core:intake` for highly ambiguous multi-domain requests).
6. **Log the routing decision**: append the route decision to the session's routing audit trail with request summary, domain scores, and selected runbook.

## Safety Checks

- Require user confirmation when confidence is below 0.6 — do not silently execute a low-confidence runbook
- Prefer read-only or diagnostic runbooks over build/deploy runbooks when intent is ambiguous
- Preserve an audit trail of every route decision including the alternatives considered
