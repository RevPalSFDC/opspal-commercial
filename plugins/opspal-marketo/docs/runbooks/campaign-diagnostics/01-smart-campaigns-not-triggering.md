# Smart Campaigns Not Triggering

## Goal
Restore trigger execution so expected leads enter the campaign and flow steps run.

## When to Use
- Triggered Smart Campaign shows zero members or no recent results despite events occurring.
- Lead activity shows the triggering event but no campaign run.

## Fast Triage
- Confirm campaign is active and set to trigger (not batch only).
- Confirm Smart List contains the correct trigger and constraints.
- Check qualification rules (run once vs every time).
- Look for trigger queue delays or backlog symptoms.

## Likely Root Causes
- Trigger misconfiguration or missing trigger (e.g., only Data Value Changes on new leads).
- Data Value Changes do not fire on initial values for new leads.
- Campaign inactive or scheduled as batch.
- Trigger queue backlog or infinite loops from other campaigns.
- Qualification rules prevent re-entry.
- Admin execution limits or campaign caps reached (per hour/day).

## Diagnostics

1. **Campaign metadata**
   - Verify triggerable + active status.
   - Confirm campaign type and schedule settings.

2. **Smart List logic**
   - Validate trigger(s) and constraints.
   - Check filters (ALL vs ANY) for impossible conditions.

3. **Lead activity correlation**
   - Find a lead who performed the triggering activity.
   - Confirm there is no campaign run for that lead.

4. **Queue/backlog inference**
   - Compare event timestamps to campaign run timestamps.
   - Long delays indicate queue congestion.

5. **Qualification rules**
   - Check if lead already ran through campaign.

6. **Execution limits**
   - Review Admin campaign limits if accessible.

## Primary API Evidence
- List campaign metadata: `/rest/asset/v1/smartCampaign/{id}.json`
- Activity lookups: `/rest/v1/activities.json` (use trigger activity type + lead id)
- Campaign run evidence: activity type "Campaign is Requested" or "Campaign Run"

See [09-api-queries-and-payloads](./09-api-queries-and-payloads.md) for examples.

## Resolution Steps
- Fix Smart List triggers (add "Person is Created" when needed).
- Activate campaign or switch to trigger campaign.
- Break trigger loops or reduce competing high-priority campaigns.
- Increase campaign cap if limits are too low.
- Adjust qualification rule if re-entry is required.

## Validation
- Trigger the event with a test lead.
- Confirm campaign membership increases and flow steps execute.

## Escalation
- If queue backlog persists or limits are unclear, involve Marketo Admin or Support.

## Priority
- Critical. Trigger failures block automation and lead processing.

## Automation Guardrails
- Read-only checks can be automated.
- Changes to campaign configuration require user confirmation.
