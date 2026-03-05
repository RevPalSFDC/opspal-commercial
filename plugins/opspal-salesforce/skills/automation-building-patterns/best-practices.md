# Automation Best Practices

## Flow Design Principles

### 1. One Flow Per Trigger Context
- Don't create multiple Flows for the same object/trigger combination
- Consolidate logic into single Flow with decision elements
- Use subflows for reusable logic

### 2. Bulkification Requirements
- All Flows must handle 1-200+ records
- Never assume single record processing
- Use collection variables for batch operations

### 3. Fault Path Handling
- Always include fault paths for DML operations
- Log errors to custom object or Platform Events
- Provide meaningful error messages

### 4. Naming Conventions

```
[Object]_[TriggerContext]_[Purpose]

Examples:
- Account_AfterInsert_Enrichment
- Opportunity_BeforeUpdate_Validation
- Contact_Scheduled_Deduplication
```

## Anti-Patterns to Avoid

### 1. DML in Loops
```
❌ BAD: Create record inside loop element
✅ GOOD: Add to collection, single DML after loop
```

### 2. SOQL in Loops
```
❌ BAD: Get Records inside loop element
✅ GOOD: Get all records before loop, use collection filtering
```

### 3. Hardcoded IDs
```
❌ BAD: Owner = "005000000000001"
✅ GOOD: Owner = $Record.OwnerId or Custom Label
```

### 4. Missing Error Handling
```
❌ BAD: DML without fault path
✅ GOOD: Fault path → Error logging → Notification
```

## Governor Limit Considerations

| Limit | Per Transaction | Best Practice |
|-------|-----------------|---------------|
| SOQL Queries | 100 | Consolidate queries, use relationships |
| DML Operations | 150 | Batch records into collections |
| CPU Time | 10,000ms | Avoid complex formulas in loops |
| Heap Size | 6MB | Don't store large objects |

## Recommended Workflow

### For Single Flow Creation
1. Check if template exists: `flow template list`
2. If template available: `flow template apply <name>` with parameters
3. If custom needed: Use FlowAuthor with natural language
4. Validate: `flow validate <path> --best-practices`
5. Deploy: `flow deploy <path> --dry-run` → `flow deploy <path> --activate`

### For Multiple Flows
1. Use templates for consistency
2. Generate all Flows first
3. Validate in batch: `flow batch validate "./flows/*.xml"`
4. Deploy in batch: `flow batch deploy "./flows/*.xml" --activate`

## Testing Requirements

### Minimum Coverage
- 75% code coverage for Apex-based automation
- All decision branches tested
- Bulk scenarios (1, 10, 200 records)
- Error scenarios with fault paths

### Test Scenarios
1. Single record insert/update/delete
2. Bulk records (200)
3. Validation failures
4. Integration failures (API errors)
5. Concurrent execution
