---
name: metadata-dependency-patterns
description: Salesforce metadata dependency analysis and safe deletion patterns. Use when deleting fields, analyzing metadata dependencies, managing circular references, or planning deployment order. Provides dependency analysis, safe deletion workflows, and ordering rules.
allowed-tools: Read, Grep, Glob
---

# Metadata Dependency Patterns

## When to Use This Skill

- Before deleting ANY field or metadata component
- Analyzing dependencies for deployment planning
- Resolving circular dependencies
- Planning metadata deployment order
- Understanding impact of metadata changes

## Quick Reference

### Dependency Analysis Command

```bash
# Analyze field dependencies before deletion
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/metadata-dependency-analyzer.js \
  --org <org-alias> \
  --object Account \
  --field Status__c
```

### Common Dependency Types

| Reference Type | Risk Level | Example |
|----------------|------------|---------|
| Active Flow | HIGH | Flow using field in decision/assignment |
| Formula Field | HIGH | Formula referencing field |
| Validation Rule | HIGH | Rule checking field value |
| Page Layout | MEDIUM | Layout displaying field |
| Process Builder | MEDIUM | Process using field criteria |
| Workflow Rule | LOW | Workflow with field filter |

### Historical Failure Causes (42 reflections)

| Cause | Frequency | Impact |
|-------|-----------|--------|
| Active Flow references | 92% | Deletion blocked |
| Formula field dependencies | 78% | Cascade failures |
| Validation rule dependencies | 65% | Rule broken |
| Page layout references | 55% | Layout errors |
| Process Builder references | 45% | Process broken |

## Detailed Documentation

See supporting files:
- `dependency-analysis.md` - Mapping dependencies
- `deletion-safeguards.md` - Safe deletion patterns
- `circular-prevention.md` - Avoid circular refs
- `ordering-rules.md` - Deployment order
