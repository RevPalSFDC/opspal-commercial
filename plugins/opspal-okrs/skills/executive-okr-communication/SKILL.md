---
name: executive-okr-communication
description: Executive communication standard for OKR reporting using BLUF+4, board-level scorelines, traffic-light health, and confidence-aware storytelling. Use when preparing OKR updates for boards, executive teams, or department leaders.
allowed-tools: Read, Grep, Glob
---

# Executive OKR Communication

## When to Use This Skill

- Writing a board-ready or executive-ready OKR report
- Turning an OKR status readout into a concise narrative
- Preparing an approval memo for a new OKR cycle
- Reframing detailed team updates into decision-ready leadership communication

## Communication Standard

Leadership updates should follow a **BLUF+4** structure:

1. **BLUF** - The answer first: overall cycle health, the main decision, and the most important risk
2. **Business Scoreline** - The five numbers leadership expects to see
3. **Objective Health** - Traffic-light status with enough evidence to trust the call
4. **Risks and Interventions** - What is off track, why, and what is being done
5. **Forward View** - What leadership should approve, watch, or change next

## The Five-Number Scoreline

Every board-oriented update should show these metrics in a compact summary:

| Metric | Include |
|--------|---------|
| ARR growth | Actual, plan, delta, and confidence note |
| NRR | Current level, trend, and material drivers |
| Pipeline coverage | Coverage versus target and any segment distortion |
| Burn multiple | Efficiency signal for the growth plan |
| KR completion rate | Overall execution health for the cycle |

Do not present the scoreline as a wall of numbers. The purpose is to orient the audience before the detailed objective discussion starts.

## Audience Modes

| Audience | What to Emphasize | What to Cut |
|----------|-------------------|-------------|
| Board | Material business impact, risk, decisions, confidence | Execution trivia and task detail |
| Executive team | Cross-functional tradeoffs, owners, recovery plan | Deep appendix data unless requested |
| Department leads | Initiative dependencies, local blockers, owner actions | Board-level narrative packaging |

## Traffic-Light Rules

Use health colors consistently:

| Color | Meaning |
|-------|---------|
| Green | Outcome is on track against the base plan with acceptable confidence |
| Yellow | Outcome is recoverable but trajectory, evidence, or dependencies are weakening |
| Red | Miss is likely without a meaningful change in plan or resource allocation |

Always pair the color with a short reason. Color without explanation is not actionable.

## Confidence Band Rules

When P10/P50/P90 ranges are available:

- Show the midpoint and the range, not just the midpoint
- Call out when the target sits above P90 or below P10
- Explain whether uncertainty comes from execution risk, data quality, or external volatility
- Avoid false precision; round to a level that matches data quality

## Narrative Guardrails

- Lead with the implication, not the chronology
- Separate facts, interpretation, and ask
- Use baselines and deltas, not isolated current-state numbers
- Name the owner of the recovery action for any yellow or red item
- Keep language plain; replace internal jargon with business meaning

## Templates

### Board Update Skeleton

```markdown
## BLUF
[One paragraph: overall health, biggest movement, key decision]

## Business Scoreline
- ARR growth: ...
- NRR: ...
- Pipeline coverage: ...
- Burn multiple: ...
- KR completion rate: ...

## Objective Health
- Objective 1: Green/Yellow/Red because ...
- Objective 2: Green/Yellow/Red because ...

## Risks and Interventions
- Risk: ...
- Action: ...
- Owner: ...

## Forward View
- Decision needed: ...
- Watch item: ...
```

### Executive Team Update Skeleton

```markdown
## BLUF
[What changed, what matters, what needs a decision]

## Objective Rollup
- Objective / health / delta / owner

## Recovery Actions
- Item / action / owner / due date

## Dependencies
- Where leadership help is required
```

## Common Failure Modes

- Burying the decision in the appendix
- Reporting activity volume instead of outcome movement
- Using green status with weak evidence
- Hiding uncertainty instead of expressing the confidence band
- Including too many metrics with no explanation of what matters

## References

- Status inputs: `commands/okr-status.md`
- Report output: `commands/okr-report.md`
- Methodology guardrails: `skills/okr-methodology-framework/SKILL.md`
