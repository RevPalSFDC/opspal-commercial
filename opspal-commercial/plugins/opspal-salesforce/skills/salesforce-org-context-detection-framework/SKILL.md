---
name: salesforce-org-context-detection-framework
description: Salesforce org context detection framework for auto-detecting target org, loading org quirks, and propagating consistent execution context across hooks and agents.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Org Context Detection Framework

Use this skill for hook workflows that establish authoritative org context.

## Workflow

1. Detect org context from path/env/CLI/session signals.
2. Load org-specific quirks and mappings.
3. Export context for downstream hooks/agents.
4. Enforce strict-mode behavior when context is missing.

## Routing Boundaries

Use this skill for hook-level context propagation.
Use `operations-readiness-framework` for broader environment readiness.

## References

- [pretask context loading](./pretask-context-loading.md)
- [session start context bootstrap](./session-start-bootstrap.md)
- [post-auth org quirks sync](./postauth-org-quirks-sync.md)
