---
name: consultation-escalation-and-ace-logging-framework
description: Use post-tool hooks to trigger consultation escalation and log consultation outcomes into ACE learning registry.
allowed-tools: Read, Grep, Glob
---

# consultation-escalation-and-ace-logging-framework

## When to Use This Skill

- Implementing or reviewing a PostToolUse hook that detects complexity signals and triggers a Gemini consultation advisory
- Adding ACE (Agent Consultation Event) logging to capture consultation outcomes for pattern analysis
- Configuring auto-escalation thresholds (complexity score, confidence level, uncertainty phrase count) for a specific plugin or agent
- Auditing whether escalation hooks are firing correctly or suppressing notifications that should be surfacing
- Ensuring consultation outcomes (alignment %, key differences, final recommendation) are written to the ACE registry in a structured, queryable format

**Not for**: the Gemini consultation itself (use `opspal-ai-consult:gemini-consult`) or general hook implementation patterns (use `opspal-core:hook-decision-contract-enforcer`).

## Escalation Trigger Reference

| Signal | Default Threshold | Urgency Emitted | Override Variable |
|--------|------------------|----------------|-------------------|
| Complexity score | >= 85% | HIGH | `CONSULTATION_COMPLEXITY_THRESHOLD` |
| Routing confidence | < 40% | MEDIUM | `CONSULTATION_CONFIDENCE_THRESHOLD` |
| Uncertainty phrases | >= 3 in output | HIGH | `CONSULTATION_UNCERTAINTY_COUNT` |
| Error/retry count | >= 2 in session | HIGH | — |
| Architecture decision detected | Pattern match | MEDIUM | — |

## Workflow

1. **Identify the hook surface**: confirm which PostToolUse event carries the agent output that should be evaluated for escalation signals (typically the Stop hook or a PostToolUse on high-complexity tool calls).
2. **Implement complexity signal detection**: parse the hook payload for the composite signals (complexity score from frontmatter, confidence from routing output, uncertainty phrase count from response body); compare against configured thresholds.
3. **Emit advisory (nonblocking)**: when thresholds are exceeded, write the escalation advisory to stdout in the standard format — never block tool execution or return a non-zero exit code.
4. **Log to ACE registry**: after a consultation completes, append a structured ACE record to the registry file (`~/.claude/ace-registry.jsonl` or plugin-local equivalent) with fields: `timestamp`, `agent`, `question_hash`, `gemini_alignment_pct`, `urgency`, `recommendation_summary`.
5. **Validate registry integrity**: confirm ACE log entries are valid JSON, contain all required fields, and do not duplicate entries for the same consultation (key on `question_hash` + `timestamp` window).
6. **Audit escalation coverage**: periodically review whether agents with known high-complexity patterns are generating appropriate escalation events; flag silent agents for threshold recalibration.

## Routing Boundaries

Use this skill for escalation hook implementation and ACE logging mechanics.
Defer to `opspal-ai-consult:gemini-consult` for the actual multi-model consultation workflow.
Defer to `opspal-core:hook-decision-contract-enforcer` for general hook contract and nonblocking advisory patterns.

## References

- [Consultation Escalation Triggers](./escalation-triggers.md)
- [ACE Outcome Logging](./ace-logging.md)
- [Nonblocking Consultation Guidance](./nonblocking-behavior.md)
