---
name: promote-skills
description: Analyze, deduplicate, enrich, and promote skill scaffolds from skills-staging/ to active skills/
---

Manage the skill enrichment pipeline. Scaffolds in `skills-staging/` are discovered from reflections and need enrichment before they become active Claude Code skills.

## Subcommands

### Analyze (default)
Show dedup report, tier breakdown, and top candidates:
```bash
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js analyze
```

### Deduplicate
Remove near-duplicate scaffolds (keeps the one with the richest description):
```bash
# Preview
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js dedup --dry-run

# Execute
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js dedup
```

### Enrich
Pull source reflection data from Supabase and generate production-quality SKILL.md:
```bash
# Enrich top tier (5+ reflection occurrences)
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js enrich --tier 1

# Enrich all tiers
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js enrich --tier 3

# Enrich a specific skill
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js enrich --skill vr-state-pre-flight-check
```

### Promote
Move enriched skills from `skills-staging/` to `skills/` — makes them active in Claude Code:
```bash
# Promote a specific skill
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js promote --skill vr-state-pre-flight-check

# Promote all enriched tier 1 skills
node opspal-internal-plugins/.claude/scripts/lib/skill-enrichment-pipeline.js promote --tier 1
```

## Typical Workflow

Execute the following steps in order:

1. **Analyze** — understand what's in staging
2. **Dedup** — remove duplicates
3. **Enrich** — generate proper SKILL.md content from reflection data
4. **Review** — read the enriched files in `opspal-commercial/plugins/opspal-core/skills-staging/`
5. **Promote** — move approved skills to active

## Environment Setup

Requires Supabase connection for enrichment (reflection data lookup):
```bash
export SUPABASE_URL=<url>
export SUPABASE_SERVICE_ROLE_KEY=<key>
export OPSPAL_COMMERCIAL_ROOT=/path/to/opspal-commercial
```

## Where Skills Live

| Location | Status | Claude Code Sees It? |
|----------|--------|---------------------|
| `skills-staging/<name>/SKILL.md` | Pending review | No |
| `skills/<name>/SKILL.md` | Active | Yes — next session |
| `config/skill-registry.json` | Catalog (telemetry) | No — ACE only |
