---
description: Run pre-flight validation checks before executing operations in Marketo
argument-hint: "<operation> [--target=id]"
---

# Marketo Pre-Operation Validation

Run pre-flight validation checks before executing operations in Marketo.

## Usage

```
/marketo-preflight [operation] [--target=id]
```

## Parameters

- `operation` - Type of operation to validate:
  - `campaign-activate` - Validate before activating a campaign
  - `bulk-update` - Validate before bulk lead operations
  - `program-clone` - Validate before cloning a program
  - `email-send` - Validate before sending an email
  - `sync` - Validate sync configuration

- `--target` - Target asset ID (campaign ID, program ID, etc.)

## What This Command Does

### Campaign Activation Preflight
- Validates all referenced emails are approved
- Checks landing pages are approved
- Verifies smart list configuration
- Flags when flow steps are not API-visible (UI verification required)
- Detects trigger conflicts with active campaigns
- Estimates daily volume impact
- Checks rate limit availability

**Recommended**: capture a Smart List snapshot before UI edits using:
```
/smart-list-snapshot campaigns --label=pre-activation-change
```

### Bulk Update Preflight
- Estimates record count
- Calculates API call requirements
- Checks rate limit status
- Validates field names exist
- Recommends backup approach

### Program Clone Preflight
- Verifies source program exists
- Checks asset dependencies
- Validates target folder permissions
- Estimates clone time

### Email Send Preflight
- Validates email is approved
- Checks from/reply-to settings
- Verifies audience list size
- Checks compliance elements

### Sync Preflight
- Tests Salesforce connection
- Validates field mappings
- Checks for recent sync errors
- Verifies sync user permissions

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 PRE-FLIGHT VALIDATION: Campaign Activation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Campaign: Welcome Series - Step 1
Campaign ID: 12345

## Validation Results

| Check | Status | Details |
|-------|--------|---------|
| Email Assets | ✅ Pass | 3 emails approved |
| Landing Pages | ✅ Pass | 2 LPs approved |
| Smart List | ⚠️ Warning | No filters defined |
| Trigger Conflicts | ✅ Pass | No conflicts found |
| Rate Limits | ✅ Pass | 45,000 calls remaining |

## Warnings (1)

⚠️ Smart list has trigger but no filters
   - May process more leads than expected
   - Consider adding qualification filters

## Estimated Impact

- Daily Volume: ~500 leads
- API Calls: ~5 per day
- Rate Limit Impact: Minimal

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ PRE-FLIGHT PASSED - Safe to activate
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Blocking vs Non-Blocking

- **BLOCKER**: Operation will fail or cause data issues. Must fix first.
- **WARNING**: Operation can proceed but review recommended.
- **INFO**: Informational, no action needed.

## Shared Output Contract

This command now aligns with the cross-platform preflight contract used by `/automation-preflight`:

- `status`: `proceed`, `warn`, or `block`
- `blockers`: blocking issues that must be remediated
- `warnings`: non-blocking risks and caveats
- `recommended_next_steps`: ordered actions for the operator
- `policy_snapshot`: current API/rate-limit posture at evaluation time

## Related Scripts

- `scripts/lib/campaign-activation-validator.js`
- `scripts/lib/sync-health-checker.js`
- `scripts/lib/rate-limit-manager.js`
