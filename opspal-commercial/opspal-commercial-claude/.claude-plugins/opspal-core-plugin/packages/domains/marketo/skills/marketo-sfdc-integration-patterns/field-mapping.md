# Field Mapping Best Practices

## Critical Field Mappings

### Marketo → SFDC (on sync)

| Marketo Field | SFDC Field | Sync Rule |
|---------------|------------|-----------|
| Lead Status | Status | Marketo wins |
| Behavior Score | Behavior_Score__c | Marketo wins |
| Lead Source Detail | LeadSource | First touch wins |
| MQL Date | MQL_Date__c | Marketo wins |

### SFDC → Marketo (return sync)

| SFDC Field | Marketo Field | Sync Rule |
|------------|---------------|-----------|
| OwnerId | Lead Owner ID | SFDC wins |
| LeadOrContactId | SFDC Lead ID | SFDC wins |
| IsConverted | SFDC Converted | SFDC wins |

## Sync Rule Options

### Marketo Wins
Use when Marketo is the system of record:
- Behavior scores
- Engagement data
- Lead status
- MQL date

### SFDC Wins
Use when Salesforce is the system of record:
- Owner assignment
- Opportunity data
- Account information
- Lead conversion status

### First Touch Wins
Use for attribution fields:
- Lead source
- Original campaign
- First touch date

### Most Recent Wins
Use for activity-based fields:
- Last activity date
- Last engagement

## Field Type Considerations

### Type Compatibility

| Marketo Type | SFDC Type | Notes |
|--------------|-----------|-------|
| String | Text | Direct mapping |
| Integer | Number | Direct mapping |
| Float | Number(decimal) | Match precision |
| Boolean | Checkbox | Direct mapping |
| Date | Date | Format conversion |
| DateTime | DateTime | Timezone handling |
| Picklist | Picklist | Value alignment required |

### Picklist Synchronization

```yaml
Picklist Alignment:
  Issue: Values must match exactly

  Best Practice:
    1. Define master list in one system
    2. Replicate exactly in other system
    3. Use API names, not labels

  Example:
    Marketo: "Qualified"
    SFDC: "Qualified"
    NOT: "Qualified" vs "qualified" vs "QUALIFIED"
```

## Required Field Validation

### Pre-Sync Validation

```yaml
Before Sync to SFDC:
  Required:
    - Email Address: Valid format
    - First Name: Not empty
    - Last Name: Not empty
    - Company: Not empty

  Recommended:
    - Phone: Valid format
    - Country: ISO standard
    - State/Province: Valid for country
```

### Handling Missing Fields

```yaml
Missing Field Strategies:
  Email:
    - Block sync entirely
    - Cannot create SFDC record without valid email

  Company:
    - Use "Unknown" placeholder
    - Flag for enrichment

  Name:
    - Use email prefix as fallback
    - Flag for data cleanup
```

## Custom Field Mapping

### Naming Conventions

```
Marketo: LeadScoreTotal
SFDC: Lead_Score_Total__c

Marketo: LastWebVisitDate
SFDC: Last_Web_Visit_Date__c
```

### Field Creation Checklist

- [ ] Field exists in both systems
- [ ] Data types match or convert safely
- [ ] Field-level security set in SFDC
- [ ] Mapping created in Marketo Admin
- [ ] Sync direction specified
- [ ] Test sync with sample data

## Field Mapping Report Template

```markdown
## Field Mapping Analysis

### Mapped Fields Summary
- Total Marketo Fields: [N]
- Mapped to SFDC: [N] ([%])
- Unmapped: [N] ([%])

### Field Mapping Details
| Marketo Field | SFDC Field | Type | Sync Direction | Status |
|---------------|------------|------|----------------|--------|
| Email | Email | String | Bidirectional | ✅ |
| Company | Company | String | Bidirectional | ✅ |
| LeadScore | Lead_Score__c | Number | Marketo→SFDC | ✅ |

### Mapping Issues
| Issue | Marketo Field | SFDC Field | Resolution |
|-------|---------------|------------|------------|
| Type mismatch | [Field] | [Field] | [Action] |
| Unmapped required | [Field] | - | Create mapping |
```
