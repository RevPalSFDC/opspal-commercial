---
name: plg-slg-hybrid-okr-patterns
description: Hybrid PLG/SLG OKR patterns for product-sourced growth, handoff logic, and attribution framing. Use when designing PLG or hybrid-motion KRs, benchmarking PQL funnels, or deciding when product demand should stay self-serve versus become sales-assisted.
allowed-tools: Read, Grep, Glob
---

# PLG SLG Hybrid OKR Patterns

## When to Use This Skill

- Designing OKRs for PLG or hybrid go-to-market motions
- Translating PQL and activation signals into revenue-operating KRs
- Deciding when self-serve demand should hand off to sales
- Preventing attribution double-counting across product and sales motions

## Benchmark Priors

Use these as planning priors, not as substitutes for org baselines:

| Metric | Planning Reference |
|--------|--------------------|
| Visitor -> Signup | ~6% P50 |
| Free -> Paid | ~5% |
| Trial -> Paid | ~17% |
| Activation Rate | 20-40% |
| Expansion ARR | 40-50% of new ARR when model supports it |

## Motion Split Model

Treat the funnel as a sequence with ownership transitions:

```text
visitor -> signup -> activated -> PQL -> pipeline -> paid -> expansion
```

For each stage, name:
- the baseline
- the owner model: product, hybrid, or sales
- the next-stage conversion it influences
- the handoff trigger if ownership changes

## Handoff Trigger Rules

Escalate from self-serve to sales-assisted or sales-led when one or more of these become true:

- Expected ACV moves outside the normal self-serve band
- Security, legal, procurement, or implementation complexity increases
- Product engagement is strong but checkout or monetization is stalled
- Multi-user or admin behavior signals cross-team adoption

Do not hand off based on vibe or logo size alone. The handoff must name the actual trigger.

## Attribution Rules

Every opportunity or expansion event gets one primary source:

- `product_sourced`
- `sales_assisted`
- `sales_sourced`

Track assists separately, but do not add assist value on top of sourced ARR totals.

## Common KR Patterns

- Increase visitor -> signup conversion from `X%` to `Y%`
- Improve activation rate from `X%` to `Y%`
- Increase free -> paid or trial -> paid conversion from `X%` to `Y%`
- Grow product-sourced pipeline from `X%` to `Y%` of total pipeline
- Improve PQL -> sales-accepted opportunity from `X%` to `Y%`
- Keep expansion ARR at `40-50%` of new ARR where the model supports it

## Design Guardrails

- Pair top-of-funnel PLG KRs with monetization or handoff KRs
- Never benchmark without stage, GTM model, and product complexity context
- Do not use benchmark priors as the org baseline
- Keep product and sales attribution explicit whenever a hybrid motion is involved

## References

- KPI catalog: `../../opspal-core/config/revops-kpi-definitions.json`
- Product evidence: `../../opspal-core/agents/product-analytics-bridge.md`
- Methodology: `skills/okr-methodology-framework/SKILL.md`
