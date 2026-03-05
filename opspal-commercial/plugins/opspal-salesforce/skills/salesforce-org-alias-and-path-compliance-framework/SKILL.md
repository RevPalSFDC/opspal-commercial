---
name: salesforce-org-alias-and-path-compliance-framework
description: Salesforce org-alias and path compliance framework for preventing hardcoded org aliases and enforcing correct project-location conventions in hooks and generated artifacts.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Salesforce Org Alias and Path Compliance Framework

Use this skill for static compliance checks on alias usage and project pathing.

## Workflow

1. Scan writes for hardcoded alias anti-patterns.
2. Validate project path against Salesforce location conventions.
3. Emit warnings or blocks by policy severity.
4. Provide compliant replacement patterns.

## Routing Boundaries

Use this skill for alias/path compliance controls.
Use `salesforce-org-context-detection-framework` for runtime org detection and propagation.

## References

- [alias linting patterns](./alias-linting-patterns.md)
- [project path validation rules](./project-path-validation-rules.md)
- [safe replacement guidance](./safe-replacement-guidance.md)
