# Adaptive Thinking Guide

> **STATUS: INFORMATIONAL** - Adaptive thinking is an API-level feature in Opus 4.6. Claude Code does not yet expose effort levels in agent frontmatter. This guide documents the feature and its planned integration with our infrastructure.

## What Is Adaptive Thinking?

Opus 4.6 supports an `adaptive` thinking mode via the API parameter:

```json
{
  "thinking": {
    "type": "adaptive"
  }
}
```

When enabled, Opus decides **when and how much** to think based on task complexity. This replaces the binary "thinking on/off" with a spectrum of effort levels.

## Effort Levels

| Level | Behavior | Best For |
|-------|----------|----------|
| `max` | Always uses extended thinking | Complex audits, multi-domain analysis, strategic planning |
| `high` | Most tasks get extended thinking | Standard assessments, code generation, report creation |
| `medium` | Balanced - thinks when complexity warrants it | Moderate analysis, standard workflows |
| `low` | Minimal thinking, prioritizes speed | Simple queries, discovery, status checks |

### Interleaved Thinking

Opus 4.6 can think **between tool calls**, not just at the start of a response. This means:

- After receiving SOQL query results, Opus can reason about the data before making the next query
- Between deployment steps, it can reassess the plan
- During multi-step assessments, it can refine its analysis as new data comes in

This is particularly valuable for our assessment agents that make many sequential tool calls.

## Key Distinction: API vs Claude Code

**Current state**: Adaptive thinking is an **API-level parameter** passed in the request body. It is **not** exposed as a Claude Code agent frontmatter field.

**What this means**:
- We **cannot** set `effort: high` in agent YAML frontmatter today
- The `model: opus` field in frontmatter selects the model, but doesn't control thinking effort
- When Claude Code adds effort support to frontmatter, we'll be ready (see Phase 3 in implementation plan)

**What we can do now**:
- Document the planned mapping between complexity scores and effort levels
- Add effort recommendations to the adaptive routing engine as informational output
- Prepare our infrastructure so wiring is trivial when the feature is available

## Relationship to Our Model Tiers

Effort levels add a second dimension to model selection:

```
                    Low Effort    Medium Effort    High Effort    Max Effort
                    ──────────    ─────────────    ───────────    ──────────
Haiku              Discovery      -                -              -
Sonnet             Simple ops     Standard work    Complex work   -
Opus               Quick checks   Coordination     Assessments    Strategic planning
```

Potential insight: **Sonnet with `high` effort** might match **Opus with `low` effort** for some task types, at significantly lower cost. This creates optimization opportunities once effort levels are available.

## Relationship to Complexity Rubric

Our `complexity-rubric.json` scores tasks 0-8+. The natural effort mapping:

| Complexity Score | Effort Level | Example Tasks |
|-----------------|--------------|---------------|
| 0-2 | `low` | Single field creation, simple SOQL, status checks |
| 3-4 | `medium` | Multi-step workflows, standard configurations |
| 5-6 | `high` | Cross-domain analysis, permission restructuring |
| 7+ | `max` | Full org audits, cross-platform migrations, CPQ assessments |

This mapping is documented in `plugins/opspal-core/config/complexity-rubric.json` under `effort_mapping` and surfaced by the adaptive routing engine's `recommendAgent()` method.

## Agents That Would Benefit Most

### From `max` Effort (Complex Reasoning)

These Opus-tier agents perform deep analysis where extended thinking would improve quality:

- `sfdc-cpq-assessor` - Multi-domain CPQ analysis with pricing rule evaluation
- `sfdc-revops-auditor` - Statistical analysis across pipeline, forecast, and process domains
- `sfdc-orchestrator` - Complex dependency management across many agents
- `response-validator` - Hallucination detection requiring careful reasoning
- `benchmark-research-agent` - Citation accuracy for industry benchmarks

### From `low` Effort (Speed Priority)

These Haiku-tier agents do simple, well-defined work where thinking overhead hurts latency:

- `sfdc-discovery` - Read-only org queries
- `sfdc-cli-executor` - Command execution
- `sfdc-query-specialist` - SOQL query building
- `sfdc-territory-discovery` - Read-only territory analysis
- `sfdc-api-monitor` - API usage tracking

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| Documentation | Done | This guide + rubric mapping |
| Routing engine integration | Done | `effort` field in `recommendAgent()` output |
| Agent frontmatter wiring | **BLOCKED** | Requires Claude Code to expose effort parameter |
| Dynamic effort selection | **BLOCKED** | Requires API access from agent context |

## References

- Complexity rubric: `plugins/opspal-core/config/complexity-rubric.json`
- Adaptive routing engine: `.claude/scripts/lib/adaptive-routing-engine.js`
- Model tier recommendations: `docs/AGENT_MODEL_TIER_RECOMMENDATIONS.md`
- Agent Teams exploration: `docs/AGENT_TEAMS_EXPLORATION.md`

---

**Version**: 1.0.0
**Last Updated**: 2026-02-05
**Status**: Documentation + infrastructure preparation
