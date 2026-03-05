# Sync and API Job Failures

## Goal
Restore data sync and bulk job execution without exceeding limits.

## When to Use
- CRM sync backlog, stalled exports, or API errors.
- Marketo Admin shows API quota or rate limit warnings.

## Fast Triage
- Look for API error codes 606/607/615 and bulk error 1029.
- Check bulk export job status (Queued/Processing/Failed).
- Confirm API credentials are valid.

## Likely Root Causes
- Daily API quota exceeded (607).
- Rate or concurrency limits hit (606/615).
- Bulk export daily size limit or queue cap (1029, 500MB/day, 10 jobs).
- CRM validation errors or permission issues.
- Misconfigured integration polling too frequently.

## Diagnostics

1. **API error review**
   - Capture exact error codes and messages.

2. **Bulk job status**
   - Inspect export job state and failure reason.
   - Check for oversized date ranges or overlapping jobs.

3. **Usage attribution**
   - Identify which integration/user is consuming quota.

4. **CRM sync health**
   - Check for recurring sync errors and required fields.

## Primary API Evidence
- Bulk export status: `/bulk/v1/activities/export/{exportId}/status.json`
- Cancel export: `/bulk/v1/activities/export/{exportId}.json`
- Lead sync retry or status update (if applicable)

See [09-api-queries-and-payloads](./09-api-queries-and-payloads.md) for examples.

## Resolution Steps
- Throttle or batch API calls; reduce polling.
- Split bulk exports by date range to fit daily size limits and 31-day windows.
- Cancel stuck jobs and retry in off-peak windows.
- Fix CRM validation errors and re-sync.
- Rotate or re-auth credentials if expired.

## Validation
- Confirm jobs complete and data appears in CRM/export.
- Monitor API usage to avoid repeated quota hits.

## Escalation
- Persistent sync backlog or platform issues should go to Marketo Support.

## Priority
- Critical. Data continuity and downstream systems are impacted.

## Automation Guardrails
- Job cancellation and retry require confirmation.
