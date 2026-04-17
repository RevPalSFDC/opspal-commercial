# Hook Governance Charter

**Status:** Normative — supersedes `HOOK_DEVELOPMENT_GUIDE.md` for new hook additions.

Two customer-log analyses (PRs #4–#8) surfaced recurring friction patterns: **safety hooks over-triggered**, **safety hooks ran too slowly**, or **both**. We keep adding hooks. This charter codifies what "adding a hook" means so new additions justify their cost rather than accumulate it silently.

## 1. When to add a hook vs other tooling

A hook is appropriate when all of the following are true:

1. **The intervention must fire automatically** without the agent knowing to invoke it.
2. **The decision must happen synchronously** with the tool call (not observability after the fact).
3. **The blast radius is bounded** — either the intervention is strictly read-only or it has an explicit escape hatch.

If any of these fails:

- Not automatic → use a skill, slash command, or agent system-prompt clause.
- Not synchronous → use a post-hoc log analyzer (`/healthcheck-hooks`, `/reflect`, etc.).
- Unbounded blast → add approval gate at the agent prompt level, not the hook level.

## 2. Latency budget

Every PreToolUse hook MUST declare a latency expectation in its header. The defaults:

| Event | p50 target | p95 ceiling | Fail threshold |
|---|---|---|---|
| PreToolUse (all matchers) | < 100ms | < 500ms | 2000ms |
| PreToolUse (Bash) | < 50ms (fast-exit for non-matching) | < 500ms | 2000ms |
| PostToolUse | < 200ms | < 1000ms | 5000ms |
| SessionStart | < 500ms | < 3000ms | 10000ms |
| Stop / SubagentStop | < 200ms | < 1000ms | 5000ms |

A hook that exceeds its p95 ceiling in production (measured via `~/.claude/logs/*-child-hook-timing.jsonl`) MUST either:

1. Move slow work to an async child (background), OR
2. Cache the expensive result with TTL, OR
3. Justify the cost with incident data proving the hook's value.

Silent over-budget operation is not acceptable — it shows up as customer friction.

## 3. Fanout budget (per-matcher)

Already enforced via `plugins/opspal-core/test/hooks/coverage/hook-fanout-budget-report.json` and `scripts/validate-hook-fanout-budget.js` in `docs:ci`. Current ceilings:

- `PreToolUse::*` (catch-all): max 13 hooks — **saturated**
- `PreToolUse::Bash`: max 6 hooks — **saturated**
- `PreToolUse::Agent`: max 13 hooks
- `SessionStart::*`: max 12 hooks
- `Stop::*`: max 6 hooks

**Saturated matchers are closed to new additions.** A new hook that would target a saturated matcher must either:

1. Consolidate behavior into an existing dispatcher (see `pre-bash-dispatcher.sh` pattern), OR
2. Replace an existing hook with equivalent or better coverage (delete one, add one).

No additions. No exceptions without explicit review.

## 4. Required metadata header

Every hook script MUST begin with a structured header comment:

```bash
#!/usr/bin/env bash
#
# PURPOSE: <one-line description of what this hook prevents or captures>
# BLAST_RADIUS: <read-only | denies-on-match | modifies-input>
# EXPECTED_RUNTIME_MS: <p95 target in ms>
# FAILURE_MODE: <advisory | deny | abort>
# ESCAPE_HATCH: <env var or flag that bypasses, or "none" if advisory>
# OWNER: <plugin-name>
#
set -euo pipefail
```

`scripts/validate-hook-metadata-headers.js` (to be added as a follow-up CI check under `docs:ci`) will parse this header and fail the build when it is missing or malformed on any registered hook.

## 5. Deprecation process

A hook that fires >100× per session without catching anything real is friction without value. Such hooks get flagged by a future `docs:verify-hook-value` check (deferred) and must either:

1. Be deleted, OR
2. Be narrowed (tighter matcher, `if:` filter, or fast-exit on stdin inspection), OR
3. Justify the volume with a concrete prevented-harm incident log.

The three current candidates to watch (from customer logs):

- `pre-tool-use-contract-validation.sh` — fires on every tool call; 500ms+ in smoke tests even on `echo hello`.
- `pre-operation-data-validator.sh` — fires on every Bash; pattern-matches command text.
- `pre-bash-dispatcher.sh` — fast-exit is good, but 15s deploy-chain timeout is a latency ceiling to watch.

Review quarterly.

## 6. Review gates

A PR that adds a new hook (any event) or modifies an existing dispatcher MUST include:

- **Latency data** from local smoke testing (`time bash hook.sh < fixture.json` over 10 runs, or `hook-fanout-budget-report.json` update if new).
- **Escape hatch documented** — either a `SKIP_<HOOK>=1` env var, a `--no-hooks` flag path, or a short rationale for why no bypass is needed.
- **Matcher justification** — why this matcher (vs a narrower one) and why this hook (vs extending an existing one).
- **Stderr + JSON contract** — the hook MUST return valid JSON (or empty `{}`) on stdout and reserve stderr for informational text only.

New PreToolUse hooks on the `Bash` matcher specifically require approval from someone outside the authoring plugin (to prevent plugin-scoped teams from accumulating cross-cutting latency).

## 7. Enforcement

Today: advisory via this doc + `docs:verify-hook-fanout-budget` CI.

Planned:
- `docs:verify-hook-metadata-headers` — parses every hook script and asserts header presence (small follow-up PR).
- `docs:verify-hook-value` — aggregates `~/.claude/logs/hooks/*.jsonl` over a sample window and reports high-volume / low-catch hooks (deferred; requires real telemetry).

## 8. Existing reference material

- `docs/HOOK_DEVELOPMENT_GUIDE.md` — pre-existing advisory guide; retain for patterns and examples, but this charter is the normative source for review decisions.
- `plugins/opspal-core/test/hooks/coverage/hook-fanout-budget-report.json` — per-matcher ceilings.
- `plugins/opspal-core/scripts/lib/hook-health-checker.js` — Stage 11 reports per-child p50/p95/p99 against the budgets in section 2.
- `plugins/opspal-core/skills/hook-observability-standardizer/SKILL.md` — structured logging patterns.
