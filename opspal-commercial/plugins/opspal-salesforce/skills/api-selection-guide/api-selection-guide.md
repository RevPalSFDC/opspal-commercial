---
name: api-selection-guide
description: Guide for selecting the correct Salesforce API for different operations. Use when querying metadata objects, performing bulk operations, or encountering API errors.
version: 1.0.0
---

# Salesforce API Selection Guide

## Quick Decision Tree

When performing a Salesforce operation, follow this decision tree:

```
1. Is this a metadata/schema change?
   └─YES→ Use Metadata API (sf project deploy/retrieve)

2. Is this a query on metadata objects (ApexClass, Flow, etc.)?
   └─YES→ Use Tooling API (sf data query --use-tooling-api)

3. Is this a data operation?
   ├─ Single record or < 200 records → Use REST API (sf data query/create/update)
   ├─ 200+ records → Use Bulk API (sf data bulk query/upsert)
   ├─ Multiple independent operations (2-25) → Use Composite API
   └─ Complex multi-object query → Consider GraphQL API
```

## API Quick Reference

| API | Best For | Max Records | Sync/Async |
|-----|----------|-------------|------------|
| **REST** | Single records, < 200 records | 2,000 | Sync |
| **Bulk** | Large data loads, 200+ records | 10,000,000 | Async |
| **Composite** | Multiple independent operations | 25 subrequests | Sync |
| **Metadata** | Schema/config deployment | N/A | Async |
| **Tooling** | Metadata queries, Apex operations | 2,000 | Sync |
| **GraphQL** | Complex multi-object queries | 1,000 | Sync |
| **SOAP** | Legacy integrations, ERP | 2,000 | Sync |

## Objects Requiring Tooling API

These objects REQUIRE `--use-tooling-api` flag:

**Flow Objects:**
- FlowDefinitionView
- FlowVersionView
- Flow
- FlowDefinition

**Apex Objects:**
- ApexClass
- ApexTrigger
- ApexPage
- ApexComponent
- ApexTestQueueItem
- ApexTestResult
- ApexCodeCoverage
- ApexLog

**Metadata Definition Objects:**
- CustomField
- CustomObject
- EntityDefinition
- FieldDefinition
- ValidationRule
- WorkflowRule
- Layout
- CompactLayout
- PermissionSet
- Profile
- RecordType

## Common Mistakes & Corrections

| Mistake | Correction |
|---------|------------|
| `sf data query "SELECT Id FROM FlowDefinitionView"` | Add `--use-tooling-api` flag |
| REST API for 10,000 record insert | Use Bulk API 2.0 (`sf data bulk upsert`) |
| Multiple sequential REST calls | Batch with Composite API |
| Deploy single Apex class via Metadata | Use Tooling API for single-file changes |
| Query ApexClass without tooling flag | Add `--use-tooling-api` flag |

## CLI Command Examples

### REST API (Standard)
```bash
# Single record query
sf data query --query "SELECT Id, Name FROM Account LIMIT 1"

# Single record create
sf data create record --sobject Account --values "Name='Test'"
```

### Tooling API
```bash
# Query Flow definitions
sf data query --query "SELECT Id, DeveloperName, ActiveVersionId FROM FlowDefinitionView" --use-tooling-api

# Query Apex classes
sf data query --query "SELECT Id, Name, Body FROM ApexClass WHERE Name = 'MyClass'" --use-tooling-api

# Query Validation Rules
sf data query --query "SELECT Id, ValidationName, ErrorMessage FROM ValidationRule WHERE EntityDefinitionId = 'Account'" --use-tooling-api
```

### Bulk API
```bash
# Bulk query (large datasets)
sf data bulk query --query "SELECT Id, Name FROM Contact" --file contacts.csv

# Bulk upsert
sf data bulk upsert --sobject Contact --file contacts.csv --external-id Email

# Bulk delete
sf data bulk delete --sobject Contact --file delete-ids.csv
```

### Metadata API
```bash
# Deploy metadata
sf project deploy start --source-dir force-app

# Retrieve metadata
sf project retrieve start --target-metadata-dir metadata

# Deploy specific components
sf project deploy start -m "ApexClass:MyClass" -m "Flow:MyFlow"
```

## Error → API Alternative Mapping

When you encounter these errors, try the suggested alternative:

| Error | Current API | Try Instead | Command |
|-------|-------------|-------------|---------|
| `sObject type 'FlowDefinitionView' is not supported` | REST | Tooling | Add `--use-tooling-api` |
| `REQUEST_LIMIT_EXCEEDED` | REST | Bulk | `sf data bulk query` |
| `QUERY_TOO_COMPLICATED` | REST | GraphQL | Split query or use GraphQL |
| `EXCEEDED_MAX_SEMIJOIN_SUBSELECTS` | REST | Composite | Break into separate queries |
| `Exceeded max number of records` | REST | Bulk | `sf data bulk upsert` |
| `INVALID_FIELD_FOR_INSERT_UPDATE` | REST | Tooling | Check if metadata-only field |

## Volume-Based Recommendations

| Record Count | Recommended API | Reason |
|--------------|-----------------|--------|
| 1 | REST | Simple, immediate response |
| 2-25 | REST or Composite | Composite for independent ops |
| 26-199 | REST (batched) | Still within limits |
| 200-9,999 | Bulk | Async processing, no rate limits |
| 10,000+ | Bulk | Only option for massive loads |

## Integration with Error Recovery

The API Type Router automatically integrates with the error recovery system. When an API call fails:

1. **Pre-execution**: Hook checks if better API available
2. **On error**: Enhanced error recovery suggests alternative API
3. **In logs**: API routing suggestions are logged for analysis

### Environment Variables

```bash
# Enable/disable API routing suggestions
export SF_API_ROUTING_ENABLED=1    # default: enabled

# Verbose output
export SF_API_ROUTING_VERBOSE=0    # default: minimal

# Custom thresholds
export SF_BULK_THRESHOLD=200       # Records before suggesting Bulk
export SF_COMPOSITE_THRESHOLD=2    # Operations before suggesting Composite
```

## Related Resources

- **API Type Router**: `scripts/lib/api-type-router.js`
- **API Fallback Mapper**: `scripts/lib/api-fallback-mapper.js`
- **Routing Config**: `config/api-routing-config.json`
- **Error Recovery**: `scripts/lib/enhanced-error-recovery.js`
