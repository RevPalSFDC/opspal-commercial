# Leads Not Progressing or Reaching Success

## Goal
Ensure leads advance to the correct program status and success milestones.

## When to Use
- Program members remain stuck in early statuses.
- Success counts are zero or unexpectedly low.

## Fast Triage
- Confirm a campaign exists that sets the expected status.
- Verify the status is marked as Success in the channel.
- Check if the lead actually performed the success action.

## Likely Root Causes
- Missing or misconfigured Change Program Status step.
- Success criteria not met or not recorded in Marketo.
- Status progression rules prevent transitions.
- Leads not recognized as program members.
- Engagement program stream exhaustion or missing transition rules.
- Timing or race conditions (status change before membership is registered).
- Reporting misalignment (looking at the wrong program or success definition).

## Diagnostics

1. **Program member distribution**
   - Count members by status.

2. **Status-change campaign review**
   - Confirm Smart List + Flow set the correct status for the correct program.

3. **Lead activity verification**
   - Look for status change activities for sample leads.

4. **Channel setup**
   - Ensure the intended status is marked as Success.

5. **Engagement program checks**
   - Confirm stream content and transition rules.

## Primary API Evidence
- Program members: `/rest/v1/programs/{programId}/members.json`
- Program status update (diagnostic): `/rest/v1/leads/programs/{programId}/status.json`
- Lead activities: `/rest/v1/activities.json`

See [09-api-queries-and-payloads](./09-api-queries-and-payloads.md) for examples.

## Resolution Steps
- Add or fix the status-change campaign and logic.
- Batch backfill success for leads who already met criteria.
- Remove circular "member of program" filters that prevent entry; changing status adds membership.
- Adjust engagement streams or add new content.

## Validation
- Confirm success counts increase after backfill.
- Spot-check sample leads for correct status.

## Escalation
- Channel status design changes require admin approval.

## Priority
- Moderate; Critical if success triggers downstream handoff or alerts.

## Automation Guardrails
- Backfilling statuses is a write action and requires confirmation.
