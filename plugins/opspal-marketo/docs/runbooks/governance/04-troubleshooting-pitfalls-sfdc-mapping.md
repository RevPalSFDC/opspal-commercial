# Troubleshooting, Pitfalls, and SFDC Mapping

## Purpose

Provide a practical troubleshooting guide, common pitfalls to avoid, and a reference mapping between Marketo and Salesforce objects.

## Troubleshooting Guide

### 1. Trigger Campaign Not Firing
**Symptoms**: Trigger campaign is active but no leads run.

**Root Cause**:
- Campaign inactive or trigger constraint mismatch
- Qualification rule prevents re-entry

**Resolution**:
- Verify campaign is Active
- Validate trigger constraints and filters
- Adjust qualification rule for test lead

**Evidence**:
- Lead Activity Log
- Campaign Results tab

### 2. Campaign Running Slowly (Backlog)
**Symptoms**: Batch campaign takes hours; queue shows backlog.

**Root Cause**:
- High volume campaigns running concurrently
- Trigger storm from bulk changes

**Resolution**:
- Pause or reschedule heavy batches
- Break large lists into segments
- Reduce trigger count

**Evidence**:
- Campaign Queue
- Notifications

### 3. API Calls Failing (606, 611, 615)
**Symptoms**: API errors in integration logs.

**Root Cause**:
- Rate limit exceeded (606)
- Request too large (611)
- Concurrency limit exceeded (615)

**Resolution**:
- Implement backoff and retries
- Batch requests under 300 records
- Limit concurrent calls to 10

**Evidence**:
- Integration logs
- Admin > Web Services

### 4. Salesforce Sync Not Working
**Symptoms**: Marketo updates not visible in SFDC.

**Root Cause**:
- Invalid SFDC credentials or API limit issues
- Field mapping or validation rule conflicts

**Resolution**:
- Admin > Salesforce to verify last sync
- Review sync errors and required fields
- Coordinate with SFDC admin

**Evidence**:
- Admin > Salesforce
- Marketo Notifications

### 5. Email Asset Stuck Draft
**Symptoms**: Email edits not reflected in send.

**Root Cause**:
- Approved version still active
- Draft not approved

**Resolution**:
- Approve draft version
- Verify approval status before send

**Evidence**:
- Email approval status
- Audit Trail

### 6. Landing Page Not Loading or Form Not Submitting
**Symptoms**: Page 404 or form submits fail.

**Root Cause**:
- Page not approved
- Form errors or blocked scripts

**Resolution**:
- Re-approve landing page
- Validate form settings and domain

**Evidence**:
- Landing page status
- Activity Log for form fill

### 7. High Hard Bounce Rate
**Symptoms**: Hard bounce rate > 5%.

**Root Cause**:
- Poor list hygiene
- Old or purchased lists

**Resolution**:
- Clean invalid emails
- Use re-engagement before bulk sends

**Evidence**:
- Email Performance report
- Bounce activity export

### 8. Marketo UI Slow
**Symptoms**: Smart lists or assets load slowly.

**Root Cause**:
- Complex smart lists or very large database
- Heavy batch processing

**Resolution**:
- Simplify smart lists
- Schedule heavy batches off-peak

**Evidence**:
- User observations
- Campaign Queue

### 9. Flow Step Skipped (Too Many Leads)
**Symptoms**: Warning shows leads skipped.

**Root Cause**:
- Campaign request overload
- Qualification rules not limiting entry

**Resolution**:
- Break campaigns into smaller batches
- Add gating logic before flow steps

**Evidence**:
- Campaign Results warnings

### 10. Permission Denied Errors
**Symptoms**: Users cannot access features or admin screens.

**Root Cause**:
- Missing permissions in role
- New features not enabled

**Resolution**:
- Review role permissions
- Update user roles and access

**Evidence**:
- Admin > Users & Roles
- Audit Trail

### 11. Duplicate Leads Appearing
**Symptoms**: Multiple leads with same email.

**Root Cause**:
- SFDC lead and contact sync
- Dedupe rules not enforced

**Resolution**:
- Merge duplicates in SFDC or Marketo
- Enforce dedupe on email or external ID

**Evidence**:
- Lead database reports

### 12. Webhooks Failing
**Symptoms**: Webhook flow steps show errors.

**Root Cause**:
- Endpoint timeout or auth failure
- Payload schema mismatch

**Resolution**:
- Check endpoint logs
- Add retry and fallback logic

**Evidence**:
- Webhook activity log
- External system logs

### 13. Marketing Activities Folder Missing
**Symptoms**: Programs or folders disappear.

**Root Cause**:
- Deleted or moved assets

**Resolution**:
- Use Audit Trail to locate deletion
- Restore from backups or rebuild

**Evidence**:
- Audit Trail export

### 14. Communication Limits Skipping Emails
**Symptoms**: Email sends skipped due to limits.

**Root Cause**:
- Overlapping campaigns
- Limits set too low

**Resolution**:
- Reduce send overlap
- Adjust limits only with approval

**Evidence**:
- Activity log: Email Skipped

### 15. Form Pre-Fill Not Working
**Symptoms**: Known leads not pre-filled.

**Root Cause**:
- Tracking cookie missing
- Cross-domain tracking not configured

**Resolution**:
- Confirm Munchkin tracking is present
- Verify CNAME and tracking domain

**Evidence**:
- Browser console and network logs

## Common Pitfalls and Gotchas

1. Deleting assets without updating references
2. Emailing test leads or internal addresses
3. Circular trigger dependencies
4. Ignoring time zone and wait step behavior
5. Exceeding custom field or segmentation limits
6. Cloning programs without updating tokens
7. Template sprawl and inconsistent branding
8. Missing preference center governance
9. Misuse of Marketing Suspended
10. Treating email open as human engagement
11. Forms without required field validation
12. Misinterpreting email sent vs delivered

## Marketo vs Salesforce Object Mapping

| Marketo Object | Salesforce Object | Notes |
|---------------|-------------------|-------|
| Lead | Lead / Contact | SFDC splits leads and contacts; Marketo uses a single person record |
| Program | Campaign | Sync is optional and status mapping must be configured |
| Program Member | Campaign Member | Status mapping required for accurate reporting |
| Activity | Task / Activity | Not all Marketo activities sync to SFDC |
| Email | Email Activity | Requires MSI or custom sync rules |
| List | Campaign Member Report | Lists do not map 1:1 to SFDC objects |
| Custom Fields | Custom Fields | Ensure data types and picklists match |
| Lifecycle Status | Lead Status | Align lifecycle definitions between systems |

## Best Practices Quick List

- Use triggers only for time-sensitive actions
- Set qualification rules on every trigger campaign
- Keep communication limits enabled
- Use templates, tags, tokens, and snippets consistently
- Audit access and roles quarterly
- Use sandbox for complex changes and import to prod
- Keep integrations minimal and documented
- Monitor notifications and queue weekly
- Archive unused assets regularly
- Document governance decisions and exceptions

## Related Runbooks

- `../integrations/salesforce-sync-troubleshooting.md`
- `../campaign-operations/trigger-campaign-best-practices.md`
- `../assessments/quarterly-audit-procedure.md`
- `../campaign-diagnostics/README.md`
