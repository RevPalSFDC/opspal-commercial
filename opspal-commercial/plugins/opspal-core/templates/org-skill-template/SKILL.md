# {Skill Name}

> Org-specific skill for {org_slug}. Loaded via `--add-dir orgs/{org_slug}`.

## Description

{What this skill does and when it should be used.}

## Usage

```
/{skill-name} [arguments]
```

## Steps

### 1. {First Step}

{Step description}

### 2. {Second Step}

{Step description}

## Notes

- This skill is org-specific and only available when using `--add-dir orgs/{org_slug}`
- Place in `orgs/{org_slug}/.claude/skills/{skill-name}/SKILL.md`
- Follow the naming convention: lowercase-hyphen for skill directories

## Template Instructions

To create a new org-specific skill:

1. Copy this template to `orgs/{org_slug}/.claude/skills/{skill-name}/SKILL.md`
2. Replace all `{placeholders}` with actual values
3. The skill will auto-load when using `claude --add-dir orgs/{org_slug}`

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Directory | `lowercase-hyphen` | `pre-deploy-checklist` |
| Skill file | `SKILL.md` | Always `SKILL.md` |
| Org slug | `lowercase-hyphen` | `acme-corp` |

### Context Budget

Skills loaded via `--add-dir` share a 2% context budget. Keep skill descriptions concise
to leave room for other skills and agent instructions.
