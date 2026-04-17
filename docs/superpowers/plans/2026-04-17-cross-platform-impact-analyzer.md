# Cross-Platform Impact Analyzer: SF↔HubSpot Ordering Dependencies

> **Status:** follow-up spec — run `superpowers:brainstorm` before writing implementation tasks.
> **Filed:** 2026-04-17
> **Origin:** reflection-remediation-2026-04-17 branch, Task 5

## Problem

When making changes in Salesforce that have downstream effects in HubSpot — or vice versa —
there is no pre-flight step that surfaces ordering dependencies. The clearest example: HubSpot's
v4 flows API validates CampaignMemberStatus string values against the target Campaign's
currently-existing labels at save time, not at execution time. If a Salesforce flow deletes old
CampaignMemberStatus records before HubSpot workflows referencing those labels are updated, the
HubSpot save fails with a cryptic validation error. The same class of problem applies to case
drift (`No show` vs `No Show`), where a label that exists in both platforms diverges in
capitalization and breaks HubSpot automation silently. The `opspal-core` cross-platform-impact
analyzer exists but does not enumerate these Salesforce→HubSpot ordering constraints or guard
against destructive DML on setup-adjacent records (CampaignMemberStatus, Queue, Group) without
verifying HubSpot consumers are updated first.

## Source reflections

- `9e6373b8`: "HubSpot's v4 flows API validates the status string against the target Campaign's currently-existing CampaignMemberStatus labels at save time — implicit cross-platform ordering dependency" (org: Client-A, 2026-04-17)
- `9e6373b8`: "v10 flow design assumed the immediate Create path always ran and produced replacement CampaignMemberStatus records before the scheduled Delete path fired" (org: Client-A, 2026-04-17)
- `9e6373b8`: "The deployed flow creates 'No show' (lowercase s) while the documentation/spec uses 'No Show' (title case) — a silent case mismatch that would break downstream automation" (org: Client-A, 2026-04-17)
- `5ec7d0aa`: Cascading HubSpot workflow impact from stale CampaignMemberStatus labels — runbook synthesizer did not surface cross-platform dependency chain (org: Client-A, 2026-04-16)

## Target plugins

- `opspal-core` (primary: cross-platform-impact-analyzer already scaffolded; this extends it with SF↔HubSpot ordering rules)
- `opspal-salesforce` (coordinator: pre-flight hook integration for destructive DML on setup-adjacent objects)
- `opspal-hubspot` (consumer: workflow validation on label changes)

## Open questions for brainstorm

1. Which Salesforce-side change types have known HubSpot ordering dependencies we should enumerate exhaustively? (CampaignMemberStatus, Queue, Group, LeadSource picklist are obvious — what else?)
2. What's the policy for "replacement exists before delete"? Should the analyzer block, warn-and-proceed, or annotate a runbook entry requiring manual verification?
3. How do we detect case drift between platforms? Is a normalization pass (lowercase comparison) sufficient, or do we need a reference mapping table?
4. Should this be integrated as a pre-flight hook in the SF deployment pipeline, or as an explicit agent step the operator invokes before any cross-platform setup change?

## Out of scope

- Full bidirectional sync orchestration — this analyzer is read-only (surfaces dependencies, does not execute changes)
- HubSpot-to-Salesforce reverse ordering constraints (separate feature scope)
- Marketo impact analysis (different stub: cross-platform dedup methodology)

## Pre-requisites

- `opspal-core:impact-analysis` skill should be reviewed to understand current coverage before extending

---
**Next step:** Run `superpowers:brainstorm` with this stub as input.
