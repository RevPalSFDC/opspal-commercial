---
description: Interactive wizard for diagnosing Marketo campaign issues
argument-hint: "[campaign-id] [--issue=type]"
---

# Marketo Campaign Diagnostic Wizard

Interactively diagnose Marketo campaign and program issues using structured runbook modules.

## Usage

```
/diagnose-campaign [campaign-id] [--issue=type]
```

## Parameters

- `campaign-id` - Optional campaign ID to diagnose. If not provided, wizard prompts for it.

- `--issue` - Optional issue type to jump directly to diagnosis:
  - `trigger` - Smart campaign not triggering (Module 01)
  - `flow` - Flow step failures (Module 02)
  - `status` - Leads not progressing (Module 03)
  - `token` - Token resolution failures (Module 04)
  - `engagement` - Low opens/clicks (Module 05)
  - `deliverability` - High bounces/unsubscribes (Module 06)
  - `sync` - Sync or API failures (Module 07)

## What This Command Does

### Step 1: Identify Campaign

If campaign-id not provided:
1. Prompts for campaign name or ID
2. Searches Marketo for matching campaigns
3. Confirms selection with user

### Step 2: Describe Issue

Presents issue type selection:
```
What issue are you experiencing?

1. Campaign not triggering - leads aren't entering
2. Flow steps failing/skipping - emails not sending, data not updating
3. Leads stuck - not progressing through statuses
4. Token problems - personalization not working
5. Low engagement - open/click rates dropped
6. Deliverability issues - high bounces or unsubscribes
7. Sync/API errors - integration failures
8. Other - describe the issue
```

### Step 3: Gather Evidence

Based on issue type, prompts for:
- Time window of the issue
- Sample lead IDs (2-3 examples)
- Expected vs actual behavior
- Recent changes (imports, edits, CRM updates)

### Step 4: Run Diagnostics

Executes fast triage from the selected module:
- Retrieves campaign metadata
- Checks Smart List configuration
- Correlates lead activity evidence
- Checks relevant health indicators

Displays results in real-time.

### Step 5: Present Findings

Shows:
- Root cause determination
- Supporting evidence with timestamps
- Severity assessment (Critical/High/Moderate/Low)
- Impact description

### Step 6: Propose Remediation

For each recommended fix:
- Describes the change
- Explains expected outcome
- Requests confirmation for any write action

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 CAMPAIGN DIAGNOSTIC: Welcome Campaign (ID: 12345)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Issue: Campaign Not Triggering

### Fast Triage
| Check | Result |
|-------|--------|
| Campaign Active | ✅ Yes |
| Campaign Type | Trigger |
| Has Triggers | ⚠️ Only "Data Value Changes" |
| Has Filters | ✅ Yes (3 filters) |
| Qualification | Run once per lead |

### Activity Correlation
Lead ID 67890:
- ✅ Form fill activity: 2026-01-13 10:15:22
- ❌ No campaign run found

### Root Cause
The Smart List only uses "Data Value Changes" trigger.
New leads created via form fill never trigger this campaign
because form fills don't create a Data Value Change event.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ SEVERITY: Critical
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Recommended Fix

Add "Fills Out Form" trigger to the Smart List.

**Note**: Smart List edits must be done in the Marketo UI.
Steps:
1. Navigate to campaign > Smart List
2. Add trigger: "Fills Out Form"
3. Constraint: Form Name = "Contact Us"
4. Reactivate campaign

Would you like me to provide detailed instructions?
```

## Issue-Specific Diagnostics

### Trigger Issues (Module 01)
- Validates campaign is active and triggerable
- Checks Smart List has appropriate triggers
- Reviews qualification rules
- Detects trigger queue backlog
- Checks execution limits

### Flow Failures (Module 02)
- Checks email/asset approval status
- Verifies lead unsubscribe/suspended flags
- Reviews program membership
- Checks CRM sync errors
- Reviews webhook response codes

### Status Issues (Module 03)
- Counts members by status
- Verifies Change Program Status flow exists
- Checks channel success configuration
- Reviews engagement stream rules

### Token Issues (Module 04)
- Retrieves program tokens
- Compares token names (case-sensitive)
- Checks email-program hierarchy
- Validates Velocity script syntax

### Engagement Issues (Module 05)
- Compares to historical baselines
- Checks deliverability signals
- Reviews audience recency
- Analyzes content/subject alignment

### Deliverability Issues (Module 06)
- Breaks down bounces by type/domain
- Analyzes list source quality
- Reviews compliance settings
- Checks opt-in expectations

### Sync/API Issues (Module 07)
- Captures error codes
- Checks bulk export job status
- Reviews quota consumption
- Identifies offending integrations

## Runbooks Referenced

This command implements the Campaign Diagnostics runbook series:

| Module | Runbook |
|--------|---------|
| 01 | `docs/runbooks/campaign-diagnostics/01-smart-campaigns-not-triggering.md` |
| 02 | `docs/runbooks/campaign-diagnostics/02-flow-step-failures.md` |
| 03 | `docs/runbooks/campaign-diagnostics/03-leads-not-progressing.md` |
| 04 | `docs/runbooks/campaign-diagnostics/04-token-resolution-failures.md` |
| 05 | `docs/runbooks/campaign-diagnostics/05-low-engagement.md` |
| 06 | `docs/runbooks/campaign-diagnostics/06-high-bounce-unsubscribe.md` |
| 07 | `docs/runbooks/campaign-diagnostics/07-sync-api-job-failures.md` |
| Support | `docs/runbooks/campaign-diagnostics/08-detection-strategies.md` |
| Support | `docs/runbooks/campaign-diagnostics/09-api-queries-and-payloads.md` |
| Support | `docs/runbooks/campaign-diagnostics/10-user-communication-remediation.md` |

## Related Commands

- `/marketo-preflight` - Pre-operation validation
- `/marketo-logs` - View activity logs
- `/monitor-sync` - Real-time sync status
- `/api-usage` - API usage tracking
- `/diagnose-lead-routing` - Lead-level routing diagnostics with canonical trace

## Agent Delegation

This command invokes `marketo-campaign-diagnostician` agent which may delegate to:
- `marketo-campaign-builder` - For campaign modifications
- `marketo-email-specialist` - For email fixes
- `marketo-sfdc-sync-specialist` - For sync issues
- `marketo-observability-orchestrator` - For bulk export issues
