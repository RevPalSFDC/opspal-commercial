# Session Resume Guide

**Claude Code v2.1.32** improves `--resume` to preserve the `--agent` value across sessions, simplifying client work session continuity.

## What Changed

Previously, resuming a session with `--resume` would lose the agent context, requiring re-specification. Now:

```bash
# Start a session with a specific agent
claude --agent sfdc-revops-auditor

# Resume later - agent context is preserved
claude --resume <session-id>
```

## Combining `--resume` with `--add-dir`

For org-specific work, combine both flags to get full context continuity:

```bash
# First session: org context + agent
claude --add-dir orgs/acme-corp --agent sfdc-cpq-assessor
# ... work on CPQ assessment ...
# Session ID displayed at exit

# Next day: resume with same org context
claude --resume <session-id> --add-dir orgs/acme-corp
# Agent (sfdc-cpq-assessor) is automatically restored
# Org skills from orgs/acme-corp/.claude/skills/ are loaded
```

## Best Practices for Client Work Sessions

### Starting a New Client Engagement

```bash
# Set org context
export ORG_SLUG=acme-corp

# Start with org directory for skills + context
claude --add-dir orgs/acme-corp
```

### Resuming Multi-Day Assessments

Multi-day assessments (CPQ audits, RevOps reviews) benefit most from `--resume`:

1. **Day 1**: Start assessment, session captures discovery findings
2. **Day 2**: `--resume` picks up where you left off, with agent context intact
3. **Day 3**: Final analysis builds on accumulated session context

```bash
# Day 1
claude --add-dir orgs/acme-corp
# Note the session ID on exit

# Day 2
claude --resume abc123 --add-dir orgs/acme-corp

# Day 3
claude --resume abc123 --add-dir orgs/acme-corp
```

### Session ID Discovery

Find recent session IDs:

```bash
# List recent sessions
claude sessions list

# Find sessions for a specific project
claude sessions list --project /path/to/project
```

## Relationship to Existing Context Systems

| System | Role with `--resume` |
|--------|---------------------|
| **Work Index** | Tracks deliverables across sessions. Resume provides in-session continuity. |
| **Auto Memory** | Persists key observations. Resume preserves full conversation context. |
| **Org Skills** | Loaded fresh via `--add-dir`. Not dependent on resume. |
| **Field Dictionary** | Injected by hooks. Available in both new and resumed sessions. |

## Limitations

- `--resume` preserves the conversation transcript but not background process state
- Large sessions may hit context limits; auto-compaction handles this transparently
- `--add-dir` must be re-specified on resume (it's not stored in the session)

---

**Version**: 1.0.0
**Last Updated**: 2026-02-05
