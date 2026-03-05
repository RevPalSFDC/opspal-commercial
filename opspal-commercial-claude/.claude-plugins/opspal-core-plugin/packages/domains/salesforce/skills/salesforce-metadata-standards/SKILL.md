---
name: salesforce-metadata-standards
description: Salesforce metadata best practices and naming conventions. Use when creating fields, objects, flows, validation rules, or reviewing metadata quality. Provides standards for API names, formulas, and deployment validation.
allowed-tools: Read, Grep, Glob
---

# Salesforce Metadata Standards

## When to Use This Skill

Activate this skill when the user:
- Creates new custom objects or fields
- Writes validation rule formulas
- Designs Salesforce Flows
- Reviews metadata for deployment
- Asks about naming conventions or API names
- Needs best practices for metadata design

## Naming Conventions

### Objects

| Type | Pattern | Example |
|------|---------|---------|
| Standard Extension | `{Standard}__{Extension}__c` | `Account__Extension__c` |
| Custom Object | `{BusinessName}__c` | `Billing_Schedule__c` |
| Junction Object | `{Parent1}_{Parent2}__c` | `Account_Contact__c` |

**Rules:**
- Use underscores between words
- Avoid abbreviations unless universally understood
- Max 40 characters for API name
- Label can differ from API name

### Fields

| Type | Pattern | Example |
|------|---------|---------|
| Standard Fields | `{DescriptiveName}__c` | `Annual_Revenue__c` |
| Lookup | `{RelatedObject}__c` | `Primary_Contact__c` |
| Formula | `{Output}_Formula__c` | `Days_Open_Formula__c` |
| Rollup Summary | `{Calculation}_{Child}__c` | `Total_Line_Items__c` |

**Rules:**
- Clear, descriptive names
- Include field type suffix for clarity
- Avoid redundant prefixes (no `Account_Account_Name__c`)

### Flows

| Type | Pattern | Example |
|------|---------|---------|
| Record-Triggered | `{Object}_{Action}_{Trigger}` | `Account_Enrich_AfterInsert` |
| Screen Flow | `{Process}_{Purpose}` | `Case_Escalation_Request` |
| Autolaunched | `{Integration}_{Action}` | `ERP_Sync_Orders` |
| Scheduled | `{Frequency}_{Process}` | `Daily_Lead_Cleanup` |

### Validation Rules

| Pattern | Example |
|---------|---------|
| `{Object}_{Field}_{Condition}` | `Opportunity_Amount_Required` |
| `{Object}_{Process}_{Rule}` | `Case_Escalation_ManagerRequired` |

## Formula Best Practices

### Picklist Fields

```javascript
// ❌ WRONG - NEVER use these on picklists
ISBLANK(Picklist_Field__c)
ISNULL(Picklist_Field__c)

// ✅ CORRECT
TEXT(Picklist_Field__c) = ""
LEN(TEXT(Picklist_Field__c)) = 0
ISPICKVAL(Picklist_Field__c, "")
```

### Null Handling

```javascript
// Check for null on text fields
IF(ISBLANK(Text_Field__c), "Default", Text_Field__c)

// Check for null on numbers
IF(ISNULL(Number_Field__c), 0, Number_Field__c)

// Safe division
IF(Denominator__c = 0, 0, Numerator__c / Denominator__c)
```

### Cross-Object References

```javascript
// Safe cross-object reference
IF(ISBLANK(Account__r.Industry), "Unknown", Account__r.Industry)

// Max 10 unique relationships per formula
// Max 5 levels deep (A.B.C.D.E)
```

## Deployment Validation

### Pre-Deployment Checklist

1. **Field History Tracking**: Max 20 fields per object (HARD LIMIT)
2. **Validation Rules**: Max 500 per object
3. **Apex Code Coverage**: Min 75%
4. **Package.xml**: Correct API version (v62.0)

### Common Blockers

| Issue | Detection | Resolution |
|-------|-----------|------------|
| Field History Limit | Query FieldDefinition | Remove tracking from less critical fields |
| Picklist Formula Error | Syntax check | Use TEXT() wrapper |
| Missing Dependencies | Deploy validation | Add dependencies to package |
| FLS Restrictions | Profile check | Update permissions first |

## Reference Documentation

For detailed standards, see:
- `naming-conventions.md` - Complete naming guide
- `validation-rules.md` - Validation rule best practices
- `flow-standards.md` - Flow design patterns
- `deployment-checklist.md` - Pre-deployment validation
