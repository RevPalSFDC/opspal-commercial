# User Communication and Remediation

## Goal
Provide clear, actionable updates and safe remediation steps.

## Communication Pattern

1. **Restate the issue** in plain language with evidence.
2. **Identify root cause** and why it happened.
3. **Recommend a fix** with expected outcome.
4. **Ask for confirmation** on any write actions.
5. **Confirm resolution** with validation steps.

## Evidence Checklist
- Affected campaign/program ids
- Sample lead ids with missing activities
- Time window and relevant activity timestamps
- Error codes or approval messages

## Remediation Patterns

### Safe Automated Actions (Read-Only)
- Activity queries and token inventory checks
- Program member counts
- Bulk export status checks

### Write Actions (Require Confirmation)
- Creating or editing tokens
- Campaign activation/deactivation
- Backfilling program statuses
- Resending emails or requesting campaigns
- Canceling or re-queuing bulk exports

## Example User Update

"The Welcome Smart Campaign is active, but leads who filled Form A have no campaign run in their activity logs. The Smart List only listens for Data Value Changes, so new leads are never caught. I recommend adding a 'Person is Created' trigger and reactivating the campaign. Want me to proceed?"

## Post-Fix Validation
- Re-test with a known lead.
- Confirm campaign run activity appears.
- Verify the expected status or email send is logged.

## Follow-Up
- Document the fix and prevention step.
- Schedule monitoring for recurrence.
