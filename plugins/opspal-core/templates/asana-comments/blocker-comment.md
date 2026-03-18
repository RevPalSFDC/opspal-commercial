# Task Blocker Comment Template

**Status**: 🚨 **BLOCKED**
**Date**: {{date}}
**Severity**: High / Medium / Low

## Blocker Description
{{clear_description_of_blocker}} (1-2 sentences)

## Impact
- **Timeline**: {{impact_on_timeline}}
- **Scope**: {{what_is_blocked}}
- **Downstream**: {{what_else_is_affected}}

## Root Cause
{{why_this_is_blocking_work}}

## Required Resolution
- **Action Needed**: {{specific_action_required}}
- **Who**: @{{person_who_can_unblock}}
- **By When**: {{deadline_for_resolution}}

## Workaround
{{temporary_workaround_if_available_or_none}}

## Progress While Blocked
{{what_can_continue_in_parallel}}

---
**Example:**

**Status**: 🚨 **BLOCKED**
**Date**: 2025-10-26
**Severity**: High

## Blocker Description
Cannot complete Enterprise pricebook configuration - missing product cost data for 75 SKUs required for margin calculations.

## Impact
- **Timeline**: 2-day delay unless resolved by COB today
- **Scope**: Blocks REQ-004 (Enterprise pricebook) and REQ-005 (Margin rule creation)
- **Downstream**: Will delay REQ-008 (Quote templates) which depends on all pricebooks

## Root Cause
Product cost field (Cost__c) not populated for products created in Q3 2025. Finance team has cost data in separate system but hasn't synced to Salesforce.

## Required Resolution
- **Action Needed**: Finance to run cost data import for 75 SKUs using standard import template
- **Who**: @Sarah.Johnson (Finance Ops) or @Mark.Chen (RevOps)
- **By When**: Today EOB (2025-10-26 5:00 PM) to stay on schedule

## Workaround
Using estimated costs based on similar products for initial pricebook setup. Will need to re-run price calculations once actual costs are imported.

## Progress While Blocked
- ✅ Can complete Standard and Partner pricebooks (not margin-dependent)
- ✅ Can build approval workflow structure (not price-dependent)
- ✅ Can create quote templates with placeholder pricing
- 🚫 Cannot finalize Enterprise pricing or margin rules
