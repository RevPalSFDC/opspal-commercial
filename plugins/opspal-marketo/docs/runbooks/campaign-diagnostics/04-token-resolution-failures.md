# Token Resolution Failures

## Goal
Restore token rendering in emails and landing pages.

## When to Use
- Emails show raw token syntax or blank fields.
- Email approval fails with "token not found" errors.

## Fast Triage
- Identify which tokens are failing (my tokens vs lead tokens).
- Confirm token definitions exist in the correct program/folder.
- Check lead data for empty values.

## Likely Root Causes
- Undefined or misspelled my tokens.
- Email asset outside the token's program/folder context.
- Lead field values are blank.
- Timing issue on trigger sends (data not saved yet).
- Velocity script token errors.
- My tokens do not resolve in Sales Insight or CRM-sent emails.

## Diagnostics

1. **Token inventory**
   - Pull program tokens and compare names.
   - Remember token names are case- and space-sensitive.

2. **Email context**
   - Ensure the email lives in the program that defines tokens.

3. **Lead field audit**
   - Sample leads for missing fields.

4. **Approval checks**
   - Attempt approval to surface missing token errors.

5. **Script token review**
   - Inspect Velocity logic for null handling.

## Primary API Evidence
- Program tokens: `/rest/asset/v1/folder/{programId}/tokens.json?folderType=Program`
- Email metadata: `/rest/asset/v1/email/{id}.json`
- Email approval: `/rest/asset/v1/email/{id}/approveDraft.json`
- Lead data: `/rest/v1/leads.json`

See [09-api-queries-and-payloads](./09-api-queries-and-payloads.md) for examples.

## Resolution Steps
- Create missing tokens or correct token names.
- Move/clone emails into the correct program.
- Add a short wait step before send to resolve timing issues.
- Add default values for lead tokens in email content.
- Fix Velocity script tokens with null checks.

## Validation
- Preview email with a known lead.
- Send a test email and confirm rendering.

## Escalation
- Script token failures or complex personalization may require developer support.

## Priority
- Moderate; becomes High if approvals block sends.

## Automation Guardrails
- Creating tokens or editing emails requires confirmation.
