---
name: subagent-verification-debugging
description: Debug subagent lifecycle hooks, verification failures, and recurring subagent execution issues.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# subagent-verification-debugging

## When to Use This Skill

- A subagent launched via the Task tool is not completing — diagnosing whether the failure is in context injection, hook execution, or the subagent's own logic
- The post-subagent verification hook is flagging incomplete results but the subagent reports success — reconciling the discrepancy
- A subagent is repeatedly failing on the same step across multiple sessions (recurrence pattern) — identifying the systemic root cause
- Debugging the context injection contract: confirming the parent agent is passing the required fields and the subagent is receiving them correctly
- Routing/complexity scoring is blocking a subagent from launching — investigating whether the block is justified or a false positive

**Not for**: Building new subagent workflows from scratch — use the `agents` skill or `plugin-dev:agent-development` for that.

## Diagnostic Decision Tree

```
Subagent failed?
├── Did it launch? (check Task tool output)
│   └── No → Context injection issue (see context-injection.md)
├── Did it complete but fail verification?
│   └── Yes → Post-verify contract mismatch (see postverify.md)
├── Did it fail on the same step repeatedly?
│   └── Yes → Recurrence pattern — check recurrence-detection.md
└── Did routing block it from launching?
    └── Yes → Complexity score false positive — use [USE: agent-name] override
```

## Workflow

1. Check the Task tool output: confirm the subagent was launched (non-empty result) and examine the exit state — success, error, or timeout.
2. If the subagent launched but produced incomplete output, read `postverify.md` — the post-subagent verification hook compares output against an expected schema; identify which fields are missing.
3. If the subagent failed to launch, read `context-injection.md` — verify the parent agent passed all required context fields (org alias, task spec, credential paths).
4. If the failure is recurring, read `recurrence-detection.md` — check the recurrence-detection log for repeated failure signatures and identify the common step.
5. Apply the fix: patch the context injection payload, update the verification schema, or add a targeted retry with a narrowed scope.
6. Re-run the subagent and confirm the post-verification hook passes cleanly before closing the issue.

## Routing Boundaries

Use this skill for subagent lifecycle hook debugging.
Defer to `tool-contract-engineering` when the issue is a specific tool call contract violation within the subagent, rather than the subagent's overall launch or verification lifecycle.

## References

- [Subagent Context Injection](./context-injection.md)
- [Post-Subagent Verification](./postverify.md)
- [Recurring Failure Detection](./recurrence-detection.md)
