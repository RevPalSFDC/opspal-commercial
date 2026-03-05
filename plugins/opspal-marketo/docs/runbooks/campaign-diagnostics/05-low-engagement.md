# Low Engagement (Open/Click Rates)

## Goal
Identify drivers of weak engagement and improve campaign performance.

## When to Use
- Opens or clicks drop significantly below historical baseline.
- Engagement declines across multiple campaigns.

## Fast Triage
- Compare opens/clicks to recent benchmarks.
- Check bounce and complaint rates for the same send.
- Validate audience targeting and recency.

## Likely Root Causes
- Content/subject mismatch to audience.
- Stale or overused lists (fatigue).
- Deliverability issues (spam placement).
- Frequency too high.
- Links or CTAs not compelling.
- Tracking changes or privacy settings affecting open measurement.

## Diagnostics

1. **Benchmark comparison**
   - Compare to previous sends and typical ranges.

2. **Deliverability signals**
   - Review bounce and unsubscribe trends.

3. **Audience quality**
   - Check last engagement dates and list source.

4. **Content review**
   - Inspect subject line and CTA clarity.

## Primary API Evidence
- Email performance export (send, delivered, open, click)
- Activity export for opens/clicks/bounces

See [09-api-queries-and-payloads](./09-api-queries-and-payloads.md) for examples.

## Resolution Steps
- Segment and send to engaged audiences first.
- Run A/B subject tests and adjust content.
- Reduce frequency or add preference management.
- Verify SPF/DKIM/DMARC alignment and deliverability status.

## Validation
- Monitor next send for improved open/click rates.

## Escalation
- Persistent deliverability issues may need deliverability specialist.

## Priority
- Low to Moderate. Performance concern rather than system outage.

## Automation Guardrails
- Reporting and analysis are safe; list exclusions or content changes require confirmation.
