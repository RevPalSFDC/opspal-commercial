---
name: context-budget-guardrails-framework
description: Implement hook-level context budget controls to prevent quality degradation at high token utilization.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# context-budget-guardrails-framework

## When to Use This Skill

- A session is approaching high token utilization and a PreToolUse hook should fire a context-budget warning
- You are tuning the threshold values at which warnings (soft) vs. intervention (hard) fire
- An agent is generating excessively large tool outputs that are consuming context budget unexpectedly
- The hook's mitigation prompting (e.g., "summarize and compress findings") needs to be improved
- Diagnosing cases where the guardrail fired incorrectly (false positive) or missed a genuine budget risk

**Not for**: Prompt engineering to reduce model verbosity — this skill is about hook-level budget enforcement, not output style.

## Budget Threshold Reference

| Utilization Band | Hook Behavior | Exit Code |
|-----------------|---------------|-----------|
| < 70% | No action | — |
| 70–84% | Soft warning injected into hook output | 0 (advisory) |
| 85–94% | Mitigation prompt suggested; flag set | 0 (advisory) |
| 95%+ | Hard guardrail: blocks non-essential tool calls | 2 (block) |

## Workflow

1. Read `budget-thresholds.md` to understand the current threshold configuration and how utilization is calculated (token count from session metadata).
2. Verify the hook reads context size from the correct field in the hook payload — field name varies by Claude Code version.
3. Test the soft-warning band: simulate a 75% utilization state and confirm the advisory message is injected without blocking execution.
4. Review `mitigation-prompts.md` — the mitigation prompt must instruct the model to summarize accumulated context and defer large reads.
5. Test the hard-guardrail band: confirm the hook blocks `Read` and `Bash` calls with large output potential but allows `Write` (to preserve in-progress work).
6. Check `safety-fallbacks.md` for the graceful-degradation path — if utilization cannot be determined, the hook must fail open (advisory only, no block).

## Routing Boundaries

Use this skill for context-window budget guardrail hooks.
Defer to `session-continuity-ops` when the concern is preserving session state across compaction rather than throttling tool use within a session.

## References

- [Context Budget Thresholds](./budget-thresholds.md)
- [Mitigation Prompting](./mitigation-prompts.md)
- [Fallback Behavior](./safety-fallbacks.md)
