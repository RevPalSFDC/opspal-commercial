---
name: org-claim-evidence-enforcement
description: Enforce hook policies that require org-state claims to be backed by executable evidence and citations.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# org-claim-evidence-enforcement

## When to Use This Skill

- A PostToolUse hook should block or flag responses that assert org state ("this org has X flows active") without evidence from a prior tool call
- Tuning the claim-detection regex patterns to catch new assertion phrasings without generating false positives
- Diagnosing why a response was incorrectly blocked (false positive: the evidence was present but not recognized by the hook)
- Adding a new claim category (e.g., permission set assertions, data volume claims) to the enforcement policy
- Reviewing hook output quality: the guard message must tell the user specifically what evidence is missing, not just that a claim was blocked

**Not for**: Validating data quality in CRM records — use `data-quality-audit` or the platform-specific dedup skills for that.

## Claim Categories and Evidence Requirements

| Claim Type | Example Phrase | Required Evidence |
|------------|----------------|-------------------|
| Flow state | "this org has 47 active flows" | `sf flow list` output in current session |
| Record count | "there are 12,000 contacts" | SOQL/API query result |
| Permission state | "users have View All Data" | Permission set or profile query |
| Integration status | "the HubSpot sync is active" | Integration health check output |
| Field existence | "the field Arr__c exists" | Metadata describe output |

## Workflow

1. Read `claim-detection.md` to understand the current regex patterns and claim-category taxonomy.
2. Test the detection gate: craft a response that makes an unsupported org-state claim and confirm the hook intercepts it before the response is delivered.
3. Verify the evidence-check logic (see `evidence-check.md`): the hook must scan the current session's tool call history for the specific evidence type required for each claim category.
4. Test the true-positive path: provide the required evidence via a prior tool call, then make the same claim — confirm the hook allows the response.
5. Review `response-guard.md` for the final-response guard: it must produce a specific, actionable message naming the missing evidence type, not a generic block notice.
6. Update claim-category patterns if new assertion phrasings are detected in production session logs.

## Routing Boundaries

Use this skill for hook-level org-claim evidence gating.
Defer to `evidence-capture-packager` when the goal is archiving already-collected evidence rather than enforcing its collection.

## References

- [Claim Detection Gate](./claim-detection.md)
- [Evidence Retrieval Enforcement](./evidence-check.md)
- [Final Response Guard](./response-guard.md)
