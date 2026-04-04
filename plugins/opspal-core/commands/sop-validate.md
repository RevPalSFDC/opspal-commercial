---
name: sop-validate
description: Validate all SOP policy files against the schema and report errors
argument-hint: "[--fix] [--verbose]"
visibility: user-invocable
tags:
  - sop
  - validation
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# SOP Validate

## Purpose

Validate all SOP policy and mapping files against their JSON schemas. Report errors, warnings, and deprecated field usage.

## Behavior

Load the SOP registry with validation enabled. For each file:
1. Parse YAML
2. Validate against `schemas/sop-policy.schema.json` or `schemas/sop-mapping.schema.json`
3. Check `schema_version` is supported
4. Check `mapping_ref` references resolve
5. Check for deprecated fields (documented in `config/sop/SCHEMA_CHANGELOG.md`)
6. Check for conflicting policies (same event + target + incompatible mutations)

## Output

```
Validating SOP policies...

  config/sop/global/work-blocked.yaml               PASS
  config/sop/client-delivery/work-started.yaml       PASS
  config/sop/client-delivery/work-completed.yaml     PASS
  config/sop/revpal-internal/work-started.yaml       PASS
  config/sop/revpal-internal/work-completed.yaml     PASS

Validating SOP mappings...

  config/sop/mappings/standard-client-boards.yaml    WARN  (target GID is placeholder)

Summary: 5 policies valid, 1 mapping warning, 0 errors
Conflicts: 0
```

## Fix Mode (`--fix`)

If `--fix` is provided:
- Add missing `schema_version: "1.0.0"` to files that lack it
- Apply pending schema migrations if migration scripts exist at `scripts/lib/sop/migrations/`
- Print changes made

## Verbose Mode (`--verbose`)

Show full validation error details including JSON Schema paths and field values.
