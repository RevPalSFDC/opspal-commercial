---
name: hook-rollout-and-canary-manager
description: Roll out hook changes safely using phased canaries, rollback thresholds, and success gates.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-rollout-and-canary-manager

## When to Use This Skill

- A hook change modifies routing enforcement, blocking logic, or exit-code semantics for widely-used tool matchers
- A new `PreToolUse` block hook is being deployed and needs staged exposure before full rollout
- A hook regression was detected in production and requires a controlled rollback with failure rate gating
- You are rolling out a hook to multiple plugins simultaneously and need coordinated gate checks
- A hook previously in warn mode is being promoted to block mode and requires a canary validation period

**Not for**: low-risk observability-only hooks (logging, telemetry) that have no enforcement behavior — those can ship without canary.

## Rollout Phase Template

| Phase | Cohort | Duration | Success Gate | Rollback Trigger |
|-------|--------|----------|-------------|-----------------|
| 0 — Warn shadow | All sessions, warn-only | 24 hours | 0 false-positive blocks | Any confirmed false block |
| 1 — Canary block | 10% of sessions (by hash) | 48 hours | Block rate < 2% on legit traffic | Block rate > 5% OR any crash |
| 2 — Expanded block | 50% of sessions | 24 hours | Block rate stable; no regression | Block rate deviation > 1% vs Phase 1 |
| 3 — Full rollout | 100% of sessions | Permanent | Monitor for 72 hours | Sustained block rate > 3% |

## Workflow

1. **Characterize the hook change**: document which tools are matched, whether the action changes (warn→block), and estimated session impact percentage.
2. **Define success and rollback criteria**: set numeric thresholds for false-positive block rate, hook crash rate, and routing decision drift before Phase 0 begins.
3. **Implement cohort gating**: use a session-hash modulo check (e.g., `COHORT=$((RANDOM % 100)); [ $COHORT -lt 10 ]`) to limit Phase 1 exposure; log the cohort assignment in the decision envelope.
4. **Deploy Phase 0 (warn shadow)**: ship the hook with `action: warn`; collect 24 hours of decision logs and compute baseline block rates against known-good traffic.
5. **Promote through phases**: after each gate passes, update the hook config's cohort percentage; keep the previous phase's hook version available for immediate rollback.
6. **Monitor with hooks-health**: run `/hooks-health` after each phase promotion and assert hook appears healthy with the expected action distribution.
7. **Execute rollback if triggered**: revert to the previous hook version and emit a rollback event to the observability log; do not skip the rollback record even for minor incidents.

## Safety Checks

- Enforce maximum blast radius per phase: Phase 1 caps at 10% of sessions regardless of pressure to accelerate
- Automatic stop on failure threshold: if block rate exceeds rollback trigger in any phase, halt promotion immediately
- Keep rollback path pre-approved: the prior hook version must remain in the plugin directory (suffixed `.prev`) until Phase 3 completes
