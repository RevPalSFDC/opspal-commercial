---
name: reflect
description: Analyze session for errors, feedback, and generate improvement playbook. Use after development sessions to document patterns and submit to centralized database.
allowed-tools: Read, Write, Bash, Grep, Glob
---

# Session Reflection Skill

This skill analyzes your development session and generates a structured improvement playbook, then submits findings to the centralized Supabase database for trend analysis.

## Quick Execution

```bash
/reflect
```

## When to Use This Skill

- After completing a Salesforce, HubSpot, or Marketo development session to capture errors and friction points before they are lost to compaction
- When you encountered a tool failure, routing error, or agent misconfiguration worth documenting for future prevention
- After discovering a pattern that could be automated (e.g., a repeated manual step that should become a hook or command)
- When a user correction occurred mid-session ("no, actually do X") — these corrections are high-value signal for hook and agent improvement
- At the end of a multi-hour session before closing Claude Code, to preserve the session's learnings in the database

**Not for**: Real-time session monitoring — `/reflect` is a post-session analysis tool, not a live dashboard.

## What It Does

1. Loads any pre-compact session context saved by the PreCompact hook (error messages, friction points)
2. Analyzes session tool call history: errors, retries, user corrections, and successful patterns
3. Classifies issues by taxonomy (12 categories including routing, hook, agent, data quality, auth)
4. Generates an improvement playbook with root cause analysis and wiring plan for each issue
5. Saves the reflection JSON locally and submits to Supabase for cross-session trend analysis

## Output

Creates `.claude/SESSION_REFLECTION_<timestamp>.json` with:

| Field | Description |
|-------|-------------|
| `summary` | Session outcome and key accomplishments |
| `issues` | Each issue with taxonomy, priority (P1–P4), and root cause |
| `user_feedback` | Corrections and feedback classified by category |
| `wiring_plan` | Specific hook, agent, or command changes recommended |
| `roi_analysis` | Estimated time saved if improvements are implemented |

## Workflow

1. Run `/reflect` at the end of the session — it automatically loads pre-compact context if available.
2. Review the generated issues list: confirm P1 items are accurate and not false positives.
3. If the wiring plan includes hook changes, create a follow-up task (Asana or backlog item) before closing the session.
4. Confirm submission to Supabase succeeded — look for `"submitted": true` in the output JSON.

For full documentation, see the `/reflect` command.
