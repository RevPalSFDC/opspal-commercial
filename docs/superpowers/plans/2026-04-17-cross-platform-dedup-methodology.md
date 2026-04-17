# Cross-Platform Dedup Methodology: Unified Match Key Hierarchy Across HubSpot, Salesforce, and Marketo

> **Status:** follow-up spec — run `superpowers:brainstorm` before writing implementation tasks.
> **Filed:** 2026-04-17
> **Origin:** reflection-remediation-2026-04-17 branch, Task 5

## Problem

Each platform's dedup capability is siloed: `opspal-hubspot` deduplicates HubSpot companies,
`opspal-salesforce` deduplicates Salesforce accounts, and Marketo company records are not
deduplicated at all. There is no unified methodology that defines a canonical match-key
hierarchy (domain → normalized company name → normalized phone → …) that works across all
three platforms and respects each platform's uniqueness constraints. The consequences are
concrete: the HubSpot dedup wave was too conservative — it blocked all matches where HubSpot
Company IDs differed, even when domain evidence strongly suggested the same entity. Meanwhile,
`Account.HubSpot_Company_ID__c` as a Salesforce External ID parent lookup silently fails when
the parent Account doesn't exist yet in production (timing dependency) or was deduplicated
away. Additionally, FLS mis-wiring on cross-platform mirroring fields (e.g.,
`Qualification_Status__c`) means records merged on one platform can produce invisible fields
on the other, with standard SOQL returning empty rather than an error.

## Source reflections

- `867ce333`: "Initial dedup methodology was too conservative — blocked ALL matches where HubSpot Company IDs differed, even when domain evidence (exact match or root match) strongly suggested same entity" (org: Client-A, 2026-03-14)
- `a99ceb96`: "External ID parent lookup via Account.HubSpot_Company_ID__c in bulk CSV silently fails when the parent Account either (a) doesn't exist in production, (b) the HubSpot Company ID was changed during a prior dedup wave" (org: Client-A, 2026-04-14)
- `01b06248`: "24 HubSpot company records had names matching existing Accounts in the org, triggering Salesforce duplicate detection rules that block record creation" (org: Client-A, 2026-03-14)
- `011c05a4`: "Qualification_Status__c was created but its FLS was only granted to System Administrator profile via FieldPermissions, yet standard SOQL still returned empty — cross-platform field-mirroring gotcha" (org: Client-A, 2026-03-14)

## Target plugins

- `opspal-data-hygiene` (primary: owns the methodology, match-key catalog, and confidence scoring)
- `opspal-hubspot` (coordinator: HubSpot company merge execution)
- `opspal-salesforce` (coordinator: Salesforce account merge + External ID reconciliation)
- `opspal-marketo` (consumer: Marketo company lookup key alignment, currently no dedup coverage)

## Open questions for brainstorm

1. What's the canonical match-key hierarchy across platforms? What confidence threshold triggers auto-merge vs. human-review-queue? How do we handle conflicts when domain says "same" but company-name edit-distance says "different"?
2. How does the methodology handle platform-specific uniqueness constraints — Salesforce Account Id vs. HubSpot Company Id vs. Marketo's company-lookup-key — when the same real-world entity has been created independently in each system?
3. What's the rollback story if a cross-platform merge discovers downstream breakage after the fact (broken workflow triggers, missing External ID references, invisible merged fields)?
4. Should this be implemented as a read-only analyzer (proposes matches, human approves each batch) or an orchestrator (executes merges with telemetry and an undo log)? What's the risk profile of each?

## Out of scope

- Platform-specific dedup for purely internal duplicates (two HubSpot records with no SF counterpart) — that's the existing `opspal-hubspot:hsdedup` scope
- Person/contact-level dedup (this stub is scoped to company/account records only)
- Attribution model changes that stem from merges — separate GTM planning concern

## Pre-requisites

- Review `opspal-data-hygiene` current methodology (what match keys it uses today) before brainstorming the new hierarchy
- Understand HubSpot Company merge API constraints (v3 merge endpoint, limitations on re-merge of already-merged records)

---
**Next step:** Run `superpowers:brainstorm` with this stub as input.
