---
name: routing-governance-playbook
description: Configure and tune hook-based routing governance, complexity thresholds, block modes, and override policies across core prompt/task hooks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# routing-governance-playbook

## When to Use This Skill

- Routing complexity thresholds need adjustment after a wave of false-positive sub-agent triggers
- A new agent is added and the routing hook's decision table must be updated to cover it
- Block mode is enabled (`ENABLE_AGENT_BLOCKING=1`) for the first time and governance rules need to be established
- An override or exception (`[DIRECT]`, `[USE: agent-name]`) is being used frequently and the underlying routing rule should be fixed instead
- The routing hook is being modified and a governance review is required before the change ships

**Not for**: recovering from a noisy routing session in real time — use `routing-noise-recovery-playbook` for that.

## Governance Configuration Reference

| Parameter | Default | Governance Rule |
|-----------|---------|----------------|
| `ENABLE_SUBAGENT_BOOST` | `1` | Change requires routing team approval |
| `ENABLE_AGENT_BLOCKING` | `1` | Block mode changes require canary rollout via `hook-rollout-and-canary-manager` |
| `ACTIVE_INTAKE_MODE` | `recommend` | Promotion to `require` mode requires complexity baseline review |
| Complexity threshold (block) | `0.7` | Threshold changes must be documented in `./complexity-thresholds.md` with before/after impact |
| Override frequency cap | none | Sustained `[DIRECT]` usage > 5/day signals a routing rule gap |

## Workflow

1. **Audit current routing config**: read `config/complexity-rubric.json` and the routing hook script to capture the current threshold set, block mode state, and active overrides.
2. **Review override usage logs**: scan `~/.claude/logs/routing.jsonl` for `[DIRECT]` and `[USE:]` patterns over the last 7 days; high frequency indicates a rule gap.
3. **Assess threshold accuracy**: compute the false-positive block rate (tasks that were blocked but should have been allowed) and false-negative rate (tasks that bypassed routing but should have been sub-agented); compare against targets from `./routing-policy.md`.
4. **Propose threshold or rule changes**: document the proposed change, expected impact, and rollback plan in a governance record; reference `./complexity-thresholds.md` for the change log format.
5. **Validate with dry-run**: run the routing hook in advisory-only mode against a replay of the last 50 routing decisions; confirm the proposed change does not regress any correct decisions.
6. **Apply with canary rollout**: for block-mode changes, use `hook-rollout-and-canary-manager` to phase the change; for advisory-only changes, ship directly with monitoring for 24 hours.
7. **Update override controls**: if any `[DIRECT]` overrides were covering for the gap now fixed, document them in `./override-controls.md` and confirm they are no longer needed.

## Routing Boundaries

Use this skill for routing hook governance: threshold tuning, block-mode decisions, and exception policy.
Defer to `routing-noise-recovery-playbook` for real-time noise recovery and to `runbook-domain-router` for cross-domain request routing.

## References

- [Routing Policy Tuning](./routing-policy.md)
- [Complexity Threshold Governance](./complexity-thresholds.md)
- [Override and Exception Controls](./override-controls.md)
