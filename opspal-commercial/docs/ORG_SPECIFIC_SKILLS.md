# Org-Specific Skills via `--add-dir`

**Claude Code v2.1.32+** auto-loads skills from `.claude/skills/` in directories passed via `--add-dir`. This enables org-specific workflows without modifying the plugin codebase.

## How It Works

When you run:

```bash
claude --add-dir orgs/acme-corp
```

Claude Code automatically discovers and loads any skills found at:

```
orgs/acme-corp/.claude/skills/{skill-name}/SKILL.md
```

These skills become available as slash commands alongside the standard plugin skills.

## Directory Structure

```
orgs/
└── acme-corp/
    ├── .claude/
    │   └── skills/
    │       ├── pre-deploy-checklist/
    │       │   └── SKILL.md
    │       ├── quarterly-review/
    │       │   └── SKILL.md
    │       └── custom-assessment/
    │           └── SKILL.md
    ├── platforms/
    │   ├── salesforce/
    │   └── hubspot/
    └── WORK_INDEX.yaml
```

## Creating an Org-Specific Skill

1. **Copy the template**:
   ```bash
   cp -r plugins/opspal-core/templates/org-skill-template \
     orgs/{org_slug}/.claude/skills/{skill-name}
   ```

2. **Edit `SKILL.md`** with org-specific content

3. **Test with `--add-dir`**:
   ```bash
   claude --add-dir orgs/{org_slug}
   # Then use: /{skill-name}
   ```

## Example Use Cases

### Pre-Deployment Checklist
An org may have specific deployment gates (e.g., "verify custom approval process is active", "check sandbox sync status").

### Assessment Workflow
Org-specific assessment steps that go beyond the standard framework (e.g., "check custom CPQ approval matrix", "verify territory alignment with fiscal calendar").

### Runbook Extensions
Org-specific operational procedures that augment the living runbook system.

## Context Budget

Skills loaded via `--add-dir` share a **2% context budget** (increased in v2.1.32 from previous limits). This means skill descriptions can be more detailed than before, but should still be kept concise.

**Guidelines**:
- Keep each skill's SKILL.md under 200 lines
- Use references to external files for detailed procedures
- Prefer imperative instructions over explanatory prose

## Combining with `--resume`

v2.1.32 also preserves the `--agent` value across `--resume` sessions. This means you can combine org context with session continuity:

```bash
# First session
claude --add-dir orgs/acme-corp
# ... do work ...

# Resume later with same org context
claude --resume <session-id> --add-dir orgs/acme-corp
```

## Session Init Hint

When `ORG_SLUG` is set and org-specific skills exist, the session init hook emits:

```
Org-specific skills available for acme-corp. Use: claude --add-dir orgs/acme-corp
```

## Relationship to Other Systems

| System | Purpose | Org Skills Complement |
|--------|---------|----------------------|
| Work Index | Tracks work history per org | Skills automate recurring work patterns |
| Field Dictionary | Maps field metadata | Skills reference field conventions |
| Living Runbook | Captures operational knowledge | Skills codify runbook steps |
| Org Quirks | Detects label customizations | Skills use quirks for correct references |

---

**Version**: 1.0.0
**Last Updated**: 2026-02-05
