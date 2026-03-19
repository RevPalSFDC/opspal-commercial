---
name: data-migrate
description: Orchestrate data migrations between platforms with field mapping, validation, and rollback
argument-hint: "plan --source hubspot --target salesforce"
arguments:
  - name: action
    description: Action to perform (plan, test, execute, validate, rollback)
    required: false
  - name: source
    description: Source platform (hubspot, marketo, csv)
    required: false
  - name: target
    description: Target platform (salesforce, hubspot)
    required: false
  - name: mapping
    description: Path to field mapping configuration
    required: false
---

# Data Migration Command

Orchestrate data migrations between platforms with comprehensive field mapping, transformation, validation, and rollback capabilities.

## Usage

```bash
/data-migrate plan --source hubspot --target salesforce
/data-migrate test --mapping ./mappings/hs-to-sf.json
/data-migrate execute --source hubspot --target salesforce --mapping ./mappings/hs-to-sf.json
/data-migrate validate                      # Post-migration validation
/data-migrate rollback                      # Rollback last migration
```

## What This Does

1. **Migration Planning**: Scope migration, estimate records, identify risks
2. **Field Mapping**: Map fields between source and target with transformations
3. **Test Migration**: Run on sample data to validate mappings
4. **Production Migration**: Batch processing with checkpoints
5. **Validation**: Pre and post-migration data quality checks
6. **Rollback**: Revert migration if issues found

## Execution

Use the data-migration-orchestrator agent:

```javascript
Agent({
  subagent_type: 'opspal-core:data-migration-orchestrator',
  prompt: `Data migration: ${action || 'plan'}. Source: ${source || 'none'}. Target: ${target || 'none'}. Mapping: ${mapping || 'auto'}`
});
```

## Output

Depending on action:
- **Plan**: Scope, record counts, field mapping draft, risk assessment
- **Test**: Sample results, mapping validation, issues found
- **Execute**: Progress, batch results, final stats
- **Validate**: Record counts, data accuracy, missing records
- **Rollback**: Rollback status, records restored

## Features

- **Batch Processing**: Configurable batch sizes with rate limiting
- **Deduplication**: Match existing records, update vs. create
- **Transformation**: Field transformations (case, format, lookup)
- **Checkpoints**: Resume from failure point
- **Audit Trail**: Complete log of all changes

## Related Commands

- `/workflow-orchestrate` - General workflow orchestration
- `/campaign-orchestrate` - Campaign data sync
