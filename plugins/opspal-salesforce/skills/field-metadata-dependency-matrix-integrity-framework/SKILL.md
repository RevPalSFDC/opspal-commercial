---
name: field-metadata-dependency-matrix-integrity-framework
description: Enforce field-level metadata dependency integrity across record types, picklists, and formulas.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Field Metadata Dependency Matrix

## When to Use This Skill

Use this skill when:
- Deploying or deleting a custom field that may be referenced by formulas, flows, or validation rules
- Auditing field dependencies before schema changes
- Checking record type and picklist value dependencies across objects
- Preventing deployment failures caused by broken field references

**Not for**: General metadata deployment (use `deployment-validation-framework`), field population monitoring (use `data-quality-operations-framework`), or permission propagation (use `salesforce-permission-propagation-and-field-readiness-framework`).

## Dependency Check Queries

```bash
# Find everything that depends on a specific field
sf data query --query "SELECT MetadataComponentName, MetadataComponentType, RefMetadataComponentName FROM MetadataComponentDependency WHERE RefMetadataComponentName = 'Account.My_Field__c'" --target-org <org> --use-tooling-api

# Find all formula fields referencing a specific field
sf data query --query "SELECT QualifiedApiName, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Account' AND DataType = 'Formula'" --target-org <org> --use-tooling-api
```

## Dependency Types

| Dependency | Example | Impact of Field Deletion |
|-----------|---------|------------------------|
| Formula field | `My_Formula__c` references `Source_Field__c` | Formula breaks, shows #Error |
| Validation rule | Rule formula uses `ISBLANK(My_Field__c)` | Rule breaks, blocks all saves |
| Flow | Get Records filter on `My_Field__c` | Flow fails at runtime |
| Report | Column or filter uses field | Report errors on run |
| Page layout | Field displayed on layout | Field disappears from UI |

## Workflow

1. Query `MetadataComponentDependency` for the field being changed
2. Classify dependencies by type and severity
3. Update dependent components before removing the field
4. Deploy in correct order: update dependents first, then remove field

## References

- [Dependency Matrix](./dependency-matrix.md)
- [Static Validation](./static-validation.md)
- [Rollout Controls](./rollout-controls.md)
