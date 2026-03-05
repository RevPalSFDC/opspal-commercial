# 05 - Daisy-Chain Delay, Loop, and Race Detection

## Goal

Detect timing and contention patterns that create routing thrash or unexpected latency.

## Patterns

- Daisy-chain delay:
  - batch schedule operations introduce minimum delay
  - downstream campaign entry appears late but expected
- Loop:
  - repeated field oscillation in short windows
  - repeated campaign membership churn
- Race:
  - concurrent writes or duplicate lead creation fork routing state

## APIs

- `mcp__marketo__analytics_loop_detector`
- `mcp__marketo__analytics_lead_changes`
- `mcp__marketo__lead_smart_campaign_membership`

## Procedure

1. Select routing fields likely to thrash.
2. Run loop detector on lead change timeline.
3. Cross-reference oscillation with campaign membership and request/schedule evidence.
4. Flag race indicators:
   - duplicate identity
   - multiple campaigns writing same fields

## Evidence to Persist

- oscillation metrics (count, flips, cadence)
- likely writer campaigns
- confidence and unresolved ambiguity
