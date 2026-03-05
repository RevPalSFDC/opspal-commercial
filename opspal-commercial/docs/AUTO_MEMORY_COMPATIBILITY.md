# Auto Memory Compatibility Guide

**Claude Code v2.1.32** introduces **auto memory** - Claude automatically records and recalls information across sessions via persistent memory files.

## What Auto Memory Does

Auto memory creates and maintains files in `~/.claude/projects/{project}/memory/` that persist across conversations. Claude automatically:
- Records insights about the project as it works
- Recalls relevant memories when starting new sessions
- Updates memories when information changes

## Relationship to Existing OpsPal Systems

Auto memory **supplements but does not replace** the structured data systems in OpsPal:

### Systems NOT Replaced by Auto Memory

| System | Why It Remains | Auto Memory Relationship |
|--------|---------------|--------------------------|
| **Work Index** | Structured, queryable, org-specific project history | Auto memory may recall recent work, but Work Index is the canonical source |
| **Field Dictionary** | Structured metadata with 14 fields per entry, tag-based querying | Auto memory cannot replicate structured field lookups |
| **Living Runbook** | Versioned operational knowledge with diff tracking | Auto memory supplements with ad-hoc observations |
| **Reflection Pipeline** | Supabase-backed with taxonomy, cohort detection, prevention hooks | Auto memory cannot trigger prevention infrastructure |
| **Org Quirks** | Structured JSON detection of label customizations | Auto memory may note quirks informally, but structured detection is authoritative |

### How Auto Memory Complements OpsPal

| Scenario | Auto Memory Adds |
|----------|-----------------|
| Session start | Quick context about recent work patterns |
| Org preferences | Informal notes about client communication style |
| Tool tips | Remembered workarounds for specific environments |
| Error patterns | Notes about recurring issues not yet in reflections |

## Precedence Rule

**Structured sources always take precedence over auto-recalled memories.**

When auto memory recalls something that conflicts with structured data:

1. **Field Dictionary** wins over auto-recalled field descriptions
2. **Work Index** wins over auto-recalled work history
3. **Org Quirks JSON** wins over auto-recalled label mappings
4. **Living Runbook** wins over auto-recalled operational procedures

The session init hook communicates this precedence at session start when org context loads.

## Configuration

Auto memory is enabled by default in Claude Code v2.1.32+. No OpsPal configuration needed.

**Memory location**: `~/.claude/projects/{project-hash}/memory/MEMORY.md`

To view auto memory for this project:
```bash
cat ~/.claude/projects/-home-chris-Desktop-RevPal-Agents-opspal-internal-plugins/memory/MEMORY.md
```

## Best Practices

1. **Don't duplicate structured data in MEMORY.md** - Let the existing systems handle structured context
2. **Use auto memory for informal observations** - Client preferences, debugging tips, workflow shortcuts
3. **Review auto memory periodically** - Remove stale observations that might conflict with current state
4. **Trust structured sources** - When in doubt, query Work Index / Field Dictionary / Runbook directly

---

**Version**: 1.0.0
**Last Updated**: 2026-02-05
