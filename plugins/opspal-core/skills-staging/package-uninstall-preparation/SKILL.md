---
name: package-uninstall-preparation
description: "Systematic cleanup of permission set assignments, Lightning page field references, and other dependencies before managed package uninstall"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-security-admin, sfdc-metadata-manager
---

# Package Uninstall Preparation

Systematic cleanup of permission set assignments, Lightning page field references, and other dependencies before managed package uninstall

## When to Use This Skill

- Before executing the operation described in this skill

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Systematic cleanup of permission set assignments, Lightning page field references, and other dependencies before managed package uninstall
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: a651241a-113a-483e-912b-5b6b2357863a
- **Agent**: sfdc-security-admin, sfdc-metadata-manager
- **Enriched**: 2026-04-03
