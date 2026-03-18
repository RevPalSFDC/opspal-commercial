# High Bounce or Unsubscribe Rates

## Goal
Reduce deliverability damage and prevent future spikes.

## When to Use
- Hard bounce rate exceeds normal thresholds (often >5%).
- Unsubscribe rate spikes above normal baseline.

## Fast Triage
- Quantify hard vs soft bounces.
- Identify domains with concentrated bounces.
- Check if the campaign hit cold or newly imported lists.

## Likely Root Causes
- Poor list quality (invalid or stale emails).
- ISP blocks or spam filtering, including spam traps.
- Sending to uninterested or over-mailed segments.
- Recently imported list with low quality.
- Opt-in or preference management gaps.

## Diagnostics

1. **Bounce breakdown**
   - Group by bounce type and domain.

2. **List source analysis**
   - Check acquisition source and created date for bounced leads.
   - Confirm Email Invalid flags are set for hard bounces.

3. **Unsubscribe correlation**
   - Confirm unsubscribes are tied to the campaign.

4. **Compliance check**
   - Confirm opt-in expectations and unsubscribe link presence.

## Primary API Evidence
- Email performance export (bounces, unsubscribes)
- Activity export for Email Bounced and Unsubscribe

See [09-api-queries-and-payloads](./09-api-queries-and-payloads.md) for examples.

## Resolution Steps
- Suppress invalid and bounced addresses.
- Clean or re-verify new lists before sending.
- Segment to engaged leads only; sunset inactive contacts.
- Adjust frequency and message relevance.
- Consider double opt-in for new acquisition sources.

## Validation
- Monitor bounce/unsub rates on next send.

## Escalation
- ISP block indications require deliverability escalation.

## Priority
- High. Deliverability risk and brand impact.

## Automation Guardrails
- List suppression or preference changes require confirmation.
