---
name: session-continuity-ops
description: Operate session continuity hooks for scratchpad persistence, context hydration, and transcript backup reliability.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# session-continuity-ops

## When to Use This Skill

- After context compaction, the session has lost critical context (active org alias, in-progress deployment state, pending evidence bundle) that needs to be re-hydrated
- The PreCompact hook is not saving scratchpad state correctly — diagnosing what is missing or malformed in the saved context file
- Configuring the session-stop persistence hook to capture a richer snapshot before a long session ends
- Validating that transcript backup controls are operating correctly (backup exists at the expected path, is not stale)
- Recovering a session after an unexpected Claude Code crash by loading the most recent scratchpad state

**Not for**: Context budget management within an active session — use `context-budget-guardrails-framework` for throttling tool use before compaction is needed.

## Hook Event Map

| Hook Event | Purpose | Output Location |
|------------|---------|----------------|
| PreCompact | Extract and save session state before compaction | `~/.claude/session-context/<timestamp>.json` |
| Stop | Persist scratchpad + in-progress artifacts | `~/.claude/session-context/last-session.json` |
| UserPromptSubmit | Hydrate context at session start if prior state exists | Injected into system prompt |

## Workflow

1. Read `session-start.md` to understand the hydration contract — what fields must be present in the saved context file for the Start hook to inject them.
2. Simulate a PreCompact event: trigger the hook manually with a test session context and verify the output JSON contains all required fields (org alias, active task, evidence paths, scratchpad summary).
3. Validate the Stop hook: confirm it writes `last-session.json` with a complete artifact inventory before the session terminates.
4. Check transcript backup controls (see `transcript-backup.md`): confirm the backup file exists at the expected path and was written within the current session window.
5. Test recovery: start a new session, confirm the UserPromptSubmit hook detects the prior state file and injects the context summary.
6. Diagnose failures: if hydration is incomplete, compare the saved context schema against the hydration contract to find missing fields.

## Routing Boundaries

Use this skill for hook-level session state persistence and hydration.
Defer to `context-budget-guardrails-framework` when the concern is throttling tool use to avoid compaction, rather than recovering after it.

## References

- [Session Start Hydration](./session-start.md)
- [Session Stop Persistence](./session-stop.md)
- [Transcript Backup Controls](./transcript-backup.md)
