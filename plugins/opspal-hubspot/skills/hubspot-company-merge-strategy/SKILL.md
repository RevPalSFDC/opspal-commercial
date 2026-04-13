---
name: hubspot-company-merge-strategy
description: Use hook guidance to choose safe merge strategies for HubSpot companies with Salesforce sync constraints.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# hubspot-company-merge-strategy

## When to Use This Skill

- Deduplicating HubSpot Company records where one or both companies are synced to a Salesforce Account
- Choosing which company record to retain as the winner (canonical) based on data completeness, Salesforce binding, and association count
- Blocking merges that would orphan an active Salesforce Account sync or break a live deal pipeline
- Running post-merge verification to confirm associated contacts, deals, and tickets re-parented correctly
- Batch merge campaigns where 50+ duplicate company pairs must be resolved in a controlled window

**Not for**: Contact deduplication (use `hsdedup`), cross-portal migrations, or property remapping after merge.

## Merge Strategy Decision Matrix

| Scenario | Strategy | Salesforce Constraint |
|---|---|---|
| One company has SF Account ID | Retain SF-bound record as winner | Never overwrite `hs_object_id` mapping |
| Both have SF Account IDs | Block — escalate to SF admin | Dual-bind creates sync conflict |
| Neither has SF Account ID | Retain higher association count | No constraint |
| Winner has 0 associated contacts | Swap winner/loser | Association count is the tiebreaker |
| Active open deals on loser | Warn — confirm re-parent | Deals must re-associate before merge |

## Workflow

1. **Premerge blocker checks** — query HubSpot CRM API `GET /crm/v3/objects/companies/{id}` for both records. Check `hs_object_id`, `hubspot_owner_id`, and association counts. Flag any Salesforce Account ID bindings.
2. **Apply strategy routing** — use the matrix above to select the winner/loser pair. If the scenario is ambiguous or both have Salesforce IDs, halt and surface a structured blocker message.
3. **Confirm association re-parent scope** — list all associated contacts, deals, and tickets on the loser via `GET /crm/v3/associations/companies/{loserId}/contacts`. Estimate re-parent blast radius.
4. **Execute merge** — call `POST /crm/v3/objects/companies/merge` with `{ primaryObjectId: winnerId, objectIdToMerge: loserId }`. Capture the merge response and timestamp.
5. **Post-merge verification** — re-query the winner record and confirm association counts increased by the expected delta. Verify Salesforce sync status via `GET /integrations/v1/me` or the SF sync audit log.
6. **Log the merge event** — write `{ts, winnerId, loserId, strategy, sfConstraint, assocDelta}` to `logs/company-merge-history.jsonl`.

## Routing Boundaries

Use this skill for company merge hook governance only.
Defer to `hubspot-data-hygiene-specialist` agent for full dedup campaigns and to `hubspot-sfdc-sync-scraper` for Salesforce sync diagnostics.

## References

- [Premerge Blocker Checks](./premerge-checks.md)
- [Merge Strategy Routing](./strategy-routing.md)
- [Postmerge Verification Signals](./postmerge-verification.md)
