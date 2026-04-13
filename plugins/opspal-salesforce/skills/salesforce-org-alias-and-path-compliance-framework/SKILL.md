---
name: salesforce-org-alias-and-path-compliance-framework
description: Salesforce org-alias and path compliance framework for preventing hardcoded org aliases and enforcing correct project-location conventions in hooks and generated artifacts.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Org Alias and Path Compliance Framework

## When to Use This Skill

Use this skill when:
- Reviewing hooks or scripts for hardcoded org aliases (e.g., `--target-org prod` instead of a variable)
- Validating that file paths follow the org-centric or legacy instance path conventions
- Building lint checks that catch alias anti-patterns before they reach production
- Ensuring generated artifacts (reports, exports) use parameterized paths

**Not for**: Runtime org detection (use `salesforce-org-context-detection-framework`), deployment path validation (use `deployment-validation-framework`), or general environment readiness (use `operations-readiness-framework`).

## Anti-Patterns to Detect

| Pattern | Problem | Compliant Replacement |
|---------|---------|----------------------|
| `--target-org prod` | Hardcoded alias, breaks in other environments | `--target-org "${SF_TARGET_ORG}"` |
| `instances/salesforce/acme/` | Hardcoded org path | `"${INSTANCE_PATH}"` or path resolver |
| `sf config set target-org prod` | Sets global default to specific org | Only set in `.env` or per-project config |
| `00D000000000001` | Hardcoded org ID | Query from `Organization` sobject |

## Path Convention Rules

| Structure | Pattern | When Used |
|-----------|---------|-----------|
| Org-centric (preferred) | `orgs/{slug}/platforms/salesforce/{instance}/` | Multi-platform clients |
| Legacy platform | `instances/salesforce/{alias}/` | Single-platform clients |
| Legacy simple | `instances/{alias}/` | Backward compatibility |

```bash
# Use the path resolver for compliant path resolution
node scripts/lib/org-context-manager.js resolve <org-alias>

# Or use environment variable cascade
INSTANCE_PATH="${INSTANCE_PATH:-orgs/${ORG_SLUG}/platforms/salesforce/${SF_TARGET_ORG}}"
```

## Workflow

1. Scan hook/script files for hardcoded alias patterns (grep for `--target-org [a-z]`)
2. Validate file paths reference variables, not literal org names
3. Emit warnings for soft violations, blocks for production-targeting hardcodes
4. Provide the compliant replacement pattern in the warning message

## Routing Boundaries

Use this skill for alias/path compliance controls.
Use `salesforce-org-context-detection-framework` for runtime org detection and propagation.

## References

- [alias linting patterns](./alias-linting-patterns.md)
- [project path validation rules](./project-path-validation-rules.md)
- [safe replacement guidance](./safe-replacement-guidance.md)
