---
name: automation-audit-self-verification
description: "When audit claims 'API limitations', challenge by exploring runbooks/scripts for existing extractors before accepting the limitation"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:Explore
---

# Automation Audit Self Verification

When audit claims 'API limitations', challenge by exploring runbooks/scripts for existing extractors before accepting the limitation

## When to Use This Skill

- Before executing the operation described in this skill
- When performing audits or assessments of the target system

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When audit claims 'API limitations', challenge by exploring runbooks/scripts for existing extractors before accepting the limitation
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 626a1dbd-6e87-4723-8e90-cbc22db0bc79
- **Agent**: Explore
- **Enriched**: 2026-04-03
