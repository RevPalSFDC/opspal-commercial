---
name: package-xml-manifest-governance-framework
description: Harden package.xml interpretation and enforcement for metadata dependency safety.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Package.xml Manifest Governance

## When to Use This Skill

Use this skill when:
- Generating or validating `package.xml` files for Salesforce deployments
- Splitting large manifests into phased deployment packages
- Checking manifest members against actual org metadata
- Debugging deployment failures caused by malformed or incomplete manifests

**Not for**: Deployment execution (use `deployment-state-management-framework`), quality gates (use `salesforce-deployment-quality-gates-framework`), or dependency analysis (use `metadata-dependency-patterns`).

## Common Manifest Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `No source-backed components present` | Members in manifest don't match local files | Verify `force-app/` structure matches manifest |
| `Unknown type name` | Wrong metadata type (e.g., `FlowDefinition` instead of `Flow`) | Use correct API names from Metadata Coverage Report |
| `Duplicate value found` | Same member listed twice in a `<types>` block | Deduplicate members |
| `An object must be specified` | Validation rule listed without `Object.RuleName` format | Use `Object.RuleName` format for object-scoped types |

## Manifest Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>My_Flow</members>
    <name>Flow</name>                    <!-- NOT FlowDefinition -->
  </types>
  <types>
    <members>Account.My_Validation</members>  <!-- Object.RuleName -->
    <name>ValidationRule</name>
  </types>
  <types>
    <members>My_Permission_Set</members>
    <name>PermissionSet</name>
  </types>
  <version>62.0</version>
</Package>
```

## Phased Manifest Splitting

For large deployments, split by dependency order:

| Phase | Metadata Types | Depends On |
|-------|----------------|------------|
| 1 | CustomObject, CustomField | Nothing |
| 2 | Flow, ValidationRule, ApexTrigger | Phase 1 fields |
| 3 | PermissionSet, Profile | Phase 1+2 components |
| 4 | Layout, FlexiPage | Phase 1+2+3 |

```bash
# Validate manifest against org (dry-run)
sf project deploy start --manifest package.xml --target-org <org> --dry-run

# Check that all members exist in the org
sf project deploy validate --manifest package.xml --target-org <org> --test-level NoTestRun
```

## Workflow

1. Validate manifest XML structure (well-formed, correct `<name>` values)
2. Check for duplicate members within each `<types>` block
3. Verify member format (object-scoped types need `Object.Member` notation)
4. Confirm members exist in local source or target org

## References

- [Manifest Parsing](./manifest-parsing.md)
- [Dependency Coverage](./dependency-coverage.md)
- [Deployment Gates](./deployment-gates.md)
