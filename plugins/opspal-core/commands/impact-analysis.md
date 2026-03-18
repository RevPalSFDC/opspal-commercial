---
name: impact-analysis
description: Analyze cross-platform field and object dependencies before making changes — shows what breaks and the recommended change sequence
argument-hint: "<object.field> <change-type> — e.g. 'Opportunity.Amount rename' or 'Lead.Score__c delete'"
intent: Prevent cross-platform regressions by analyzing field and object dependencies before changes
dependencies: [cross-platform-impact-analyzer]
failure_modes: [field_not_found, sync_config_unavailable]
---

# Cross-Platform Impact Analysis

Analyze what would break if you change a specific field or object across connected platforms.

## Usage

```
/impact-analysis Opportunity.Amount rename
/impact-analysis Lead.Score__c delete
/impact-analysis Account.Industry type-change
/impact-analysis hubspot:lifecyclestage remove-value
```

## Instructions

Route to `opspal-core:cross-platform-impact-analyzer` agent. It will:
1. Build a dependency graph from sync configurations
2. Trace all references (flows, reports, formulas, scoring models)
3. Assess cross-platform sync impact
4. Generate a pre-change validation checklist

This is a READ-ONLY operation — it analyzes but never modifies.
