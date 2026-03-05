---
name: deployment-validation-framework
description: Salesforce deployment validation and error recovery methodology. Use when deploying metadata, validating deployments, recovering from deployment errors, managing rollbacks, or planning deployment sequences. Provides comprehensive pre-deployment validation, error recovery patterns, and dependency ordering.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-deployment-manager
---

# Deployment Validation Framework

## When to Use This Skill

- Validating deployments before execution
- Recovering from deployment failures
- Planning deployment sequences
- Managing rollback procedures
- Understanding deployment error codes
- Preventing common deployment failures

## Quick Reference

### Pre-Deployment Validation Gates

| Gate | Validation | Prevents |
|------|------------|----------|
| Gate 0 | Comprehensive pre-deployment | 80% of failures |
| Gate 1 | Deployment source structure | Package.xml errors |
| Gate 2 | Flow XML validation | .CurrentItem syntax errors |
| Gate 3 | Field dependency analysis | Field deletion failures |
| Gate 4 | CSV data validation | Positional index errors |
| Gate 5 | Flow best practices | Governor limit issues |
| Gate 6 | OOO dependency enforcement | Runtime failures |

### Validation Commands

```bash
# Comprehensive validation (run before ALL deployments)
bash hooks/pre-deployment-comprehensive-validation.sh

# Specific validators
node scripts/lib/metadata-dependency-analyzer.js <org> <object> <field>
node scripts/lib/flow-xml-validator.js <flow-file.xml>
node scripts/lib/csv-parser-safe.js <file.csv> --strict
```

### Error Prevention Statistics

Based on reflection analysis of 81 deployment issues:
- **$243K annual ROI** from prevented failures
- **80% of deployment failures** caught before execution
- **95% of .CurrentItem errors** auto-fixed
- **100% of positional CSV errors** eliminated

## Validation Phases

### Phase 1: Pre-Deployment Validation (MANDATORY)

Always run before ANY deployment:

1. **Deployment Source Validation** - Structure is valid
2. **Flow XML Validation** - All .flow-meta.xml files
3. **Field Dependency Analysis** - For deleted fields
4. **CSV Data Validation** - For all .csv files
5. **Field History Tracking Limits** - Max 20 per object
6. **Picklist Formula Validation** - ISBLANK/ISNULL errors

### Phase 2: OOO Dependency Enforcement

Five critical dependency rules:
1. Flow/Trigger field references must exist
2. Controlling picklist before dependent
3. RecordTypeId must be set FIRST
4. Parent record exists for master-detail
5. Validation/duplicate rules won't block

### Phase 3: Post-Deployment Verification

After EVERY deployment:
- Run verification script
- Include evidence in success claims
- Verify exit code 0

## Detailed Documentation

See supporting files:
- `pre-deploy-checklist.md` - Complete validation checklist
- `error-recovery.md` - Common errors and fixes
- `rollback-procedures.md` - Rollback patterns
- `dependency-order.md` - Deployment sequencing
