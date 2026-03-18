---
description: Diagnose Marketo lead routing failures with canonical identity, membership, timeline, and smart-list correlation
argument-hint: "[--lead-id=id | --email=user@example.com] [--since=iso] [--campaign=id] [--program=id]"
---

# Diagnose Marketo Lead Routing

Run deterministic lead-routing diagnostics with API evidence.

## Usage

```bash
/diagnose-lead-routing [--lead-id=id | --email=user@example.com] [--since=iso] [--campaign=id] [--program=id]
```

## What This Command Does

1. Resolves canonical lead identity and duplicate risk
2. Captures list/program/smart-campaign memberships
3. Reconstructs activities + lead changes timeline
4. Correlates candidate campaigns and Smart List rules (`includeRules=true`)
5. Detects loop/race indicators from routing-field oscillation
6. Returns root-cause candidates with confidence and evidence links

## Primary Tool Calls

```javascript
mcp__marketo__lead_routing_trace({
  leadId,
  filterType: 'email',
  filterValues: [email],
  sinceDatetime,
  candidateCampaignIds: campaignId ? [campaignId] : [],
  includeCampaignDetails: true
})
```

## Output Shape

- Incident summary
- Root-cause candidates
- Evidence timeline
- Membership gates/suppressions
- Loop/race risk indicators
- Recommended remediation ladder (read-only)

## Related Runbooks

- `docs/runbooks/lead-routing-diagnostics/README.md`
- `docs/runbooks/campaign-diagnostics/README.md`
