# Flow Design Standards

## Flow Types and Use Cases

| Flow Type | Use Case | Entry Criteria |
|-----------|----------|----------------|
| **Record-Triggered** | Automate on record changes | DML events (insert, update, delete) |
| **Screen Flow** | User-guided processes | User interaction required |
| **Schedule-Triggered** | Batch/periodic processing | Time-based execution |
| **Platform Event-Triggered** | Event-driven automation | Platform event published |
| **Autolaunched** | Subflow or API-called | Invoked by another process |

## Naming Conventions

### Record-Triggered Flows

```
{Object}_{Action}_{Timing}
```

**Examples:**
- `Account_Enrich_AfterInsert`
- `Opportunity_Validate_BeforeUpdate`
- `Case_Escalate_AfterCreate`
- `Lead_Convert_BeforeDelete`

### Screen Flows

```
{Process}_{Purpose}
```

**Examples:**
- `Case_Escalation_Request`
- `Lead_Qualification_Wizard`
- `Contract_Amendment_Form`
- `Quote_Approval_Submission`

### Scheduled Flows

```
{Frequency}_{Process}
```

**Examples:**
- `Daily_Lead_Aging_Update`
- `Weekly_Pipeline_Snapshot`
- `Monthly_Invoice_Generation`
- `Hourly_Integration_Sync`

---

## Bulkification Requirements

### MANDATORY: Handle 1-200+ Records

Flows must handle bulk operations (up to 200 records per transaction).

### Collection Operations

```
// ✅ CORRECT - Use loops with collections
Loop through records
  Add to collection
End Loop
Update Records (collection)

// ❌ WRONG - DML inside loop
Loop through records
  Update Record (single)
End Loop
```

### Pattern: Collect-Then-DML

1. **Collect** records to process in a collection variable
2. **Loop** to identify which records need changes
3. **Build** a collection of records with changes
4. **Execute** single DML operation on collection

---

## Entry Criteria Best Practices

### Optimize Entry Criteria

```
// ✅ EFFICIENT - Specific entry criteria
Entry Criteria:
  Status CHANGED to "Closed"
  AND Type = "Customer"

// ❌ INEFFICIENT - Broad entry, filter in flow
Entry Criteria:
  ANY change
Flow checks:
  Decision: Is Status Closed?
  Decision: Is Type Customer?
```

### Use ISCHANGED Wisely

```
// Best for: Field value transitions
ISCHANGED({!$Record.Status__c})

// Combine with value check
ISCHANGED({!$Record.Stage__c})
AND {!$Record.Stage__c} = "Closed Won"
```

---

## Error Handling

### Fault Paths (MANDATORY)

Every DML operation must have a fault path:

```
[Get Records]
    ↓
[Update Records] ──fault──> [Create Error Log]
    ↓                              ↓
[Continue]                  [Send Notification]
```

### Error Logging Pattern

Create a custom object `Flow_Error_Log__c`:
- `Flow_Name__c` - Which flow failed
- `Error_Message__c` - Error details
- `Record_Id__c` - Related record
- `Timestamp__c` - When error occurred
- `Stack_Trace__c` - Full error context

---

## Decision Element Standards

### Naming

```
Dec_{WhatDecides}
```

**Examples:**
- `Dec_HasRequiredFields`
- `Dec_IsHighValue`
- `Dec_NeedsApproval`

### Structure

```
Decision: Dec_RecordType
  ├── Outcome: Is_Customer → [Customer Path]
  ├── Outcome: Is_Prospect → [Prospect Path]
  └── Default Outcome → [Default Path]
```

### Always Include Default

Every decision must have a default outcome, even if it's "No Action".

---

## Variable Standards

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Record Variable | `var_{Object}` | `var_Account` |
| Collection | `col_{Object}` | `col_Contacts` |
| Text | `txt_{Purpose}` | `txt_ErrorMessage` |
| Number | `num_{Purpose}` | `num_Count` |
| Boolean | `bool_{Condition}` | `bool_IsValid` |
| Date | `dt_{Purpose}` | `dt_DueDate` |

### Avoid Magic Values

```
// ❌ BAD - Hard-coded values
{!$Record.Amount} > 100000

// ✅ GOOD - Use custom metadata or constant
{!$Record.Amount} > {!$Setup.Thresholds__mdt.High_Value_Amount__c}
```

---

## Subflow Patterns

### When to Use Subflows

- **Reusability**: Same logic in multiple flows
- **Complexity**: Flow exceeds 50 elements
- **Maintainability**: Isolate specific functions
- **Testing**: Unit test smaller pieces

### Subflow Naming

```
Sub_{Parent}_{Function}
```

**Examples:**
- `Sub_Account_GetHierarchy`
- `Sub_Opportunity_CalculateCommission`
- `Sub_Contact_ValidateEmail`

### Input/Output Variables

```
// Input: Clearly named with purpose
Input_AccountId (Text, Required)
Input_IncludeInactive (Boolean, Default: False)

// Output: Indicate what's returned
Output_TotalRevenue (Currency)
Output_ContactCount (Number)
Output_ErrorMessage (Text)
```

---

## Performance Guidelines

### Governor Limits Awareness

| Limit | Value | Impact |
|-------|-------|--------|
| SOQL queries per transaction | 100 | Get Records elements |
| DML statements | 150 | Create/Update/Delete elements |
| CPU time | 10,000ms | Complex formulas, loops |
| Heap size | 6MB | Large collections |

### Optimization Techniques

1. **Minimize Get Records**: Combine where possible
2. **Filter early**: Use entry criteria, not decisions
3. **Batch collections**: Single DML per type
4. **Avoid nested loops**: O(n²) complexity
5. **Use formula resources**: Calculate once, reuse

---

## Testing Requirements

### Test Coverage

| Scenario | Required |
|----------|----------|
| Happy path | ✅ Yes |
| Bulk (200 records) | ✅ Yes |
| Negative cases | ✅ Yes |
| Boundary conditions | ✅ Yes |
| Error handling | ✅ Yes |

### Debug Mode

Enable debug logging for development:
```
Setup → Debug Logs → New Trace Flag
Category: Workflow = FINER
```

---

## Documentation Standards

### Flow Description

Every flow must include in Description field:
1. **Purpose**: What the flow does
2. **Trigger**: When it runs
3. **Owner**: Who maintains it
4. **Version**: Change history

### Example Description

```
PURPOSE: Enriches Account data after creation by:
- Setting Industry segment based on SIC code
- Assigning to territory based on Billing State
- Creating default Contact record

TRIGGER: After Insert on Account

OWNER: RevOps Team
VERSION: 2.1 (2025-01-15) - Added territory assignment
```

---

## Migration from Process Builder

### Deprecation Timeline

- Process Builder deprecated
- Workflow Rules deprecated
- Migrate to Flow

### Conversion Checklist

| Process Builder Feature | Flow Equivalent |
|------------------------|-----------------|
| Record Change | Record-Triggered Flow |
| Scheduled Actions | Scheduled Paths |
| Immediate Actions | After Save path |
| Criteria | Entry Criteria + Decisions |
| Field Updates | Update Records |
| Email Alerts | Send Email action |
| Apex | Apex Action |
