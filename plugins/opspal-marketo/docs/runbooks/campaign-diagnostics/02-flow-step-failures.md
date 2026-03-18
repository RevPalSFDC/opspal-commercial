# Flow Step Failures

## Goal
Identify why specific flow actions are skipped or error out and restore successful execution.

## When to Use
- Campaign triggers but emails, data updates, syncs, or webhooks do not run.
- Results log shows skipped or error messages.

## Fast Triage
- Check if assets are approved.
- Verify communication limits and subscription status for affected leads.
- Inspect lead activity for missing or failed flow steps.

## Likely Root Causes
- Email not approved or deleted.
- Lead unsubscribed, marketing suspended, or comm limits exceeded.
- Flow step constraints not met (program status rules, not a member).
- Program status cannot be downgraded or re-set to the same status.
- CRM sync validation errors (required fields, permissions, picklists).
- Webhook failures (timeouts, non-200 response).
- Campaign logic dependency order issues.

## Diagnostics

1. **Results and lead activity**
   - Check activity log for each expected step.
   - Identify skipped reasons or missing activities.

2. **Asset status**
   - Verify email/LP approval state.

3. **Lead compliance checks**
   - Confirm Unsubscribed, Marketing Suspended, and operational email settings.

4. **Program status constraints**
   - Ensure lead is a program member and status progression is valid.

5. **CRM sync errors**
   - Look for lead-level sync errors or admin notifications.

6. **Webhook logs**
   - Confirm response codes and timeouts.

## Primary API Evidence
- Email approval status: `/rest/asset/v1/email/{id}.json`
- Lead activity: `/rest/v1/activities.json` (email send, data value change, webhook)
- Program status updates: `/rest/v1/leads/programs/{programId}/status.json` (diagnostic call)

See [09-api-queries-and-payloads](./09-api-queries-and-payloads.md) for examples.

## Resolution Steps
- Approve assets or fix missing tokens then approve.
- Exclude unsubscribed or suspended leads; mark email as operational only if appropriate.
- Fix program status flow (valid transitions and membership).
- Correct CRM validation issues and retry sync.
- Retry or repair failing webhooks.
- Re-run steps for leads who were skipped.

## Validation
- Re-run campaign on a test lead and confirm activities appear.
- Spot-check a few previously skipped leads.

## Escalation
- CRM sync failures with permissions or validation errors require CRM admin.
- Persistent webhook failures require external service owners.

## Priority
- High. Critical if customer communications or CRM sync is impacted.

## Automation Guardrails
- Auto-read is safe.
- Resends, status changes, and sync retries require confirmation.
