# List Membership Patterns

## List Types

### Static Lists
- Manual membership management
- Members don't change automatically
- Use for: One-time campaigns, manual segments

### Active (Dynamic) Lists
- Membership based on filter criteria
- Automatically updates as records change
- Use for: Ongoing segments, triggered workflows

## Association IDs Reference

**CRITICAL**: Using wrong association IDs is the #1 Lists API error.

| Association | Correct ID | Wrong ID (Common Mistake) |
|-------------|------------|---------------------------|
| Contact to Company | 279 | 280 |
| Contact to Deal | 4 | - |
| Contact to Ticket | 15 | - |
| Company to Deal | 341 | - |
| Company to Contact | 280 | 279 |

### Verification Pattern
```javascript
// Always verify association ID before use
const ASSOCIATION_IDS = {
  CONTACT_TO_COMPANY: 279,  // NOT 280!
  COMPANY_TO_CONTACT: 280,
  CONTACT_TO_DEAL: 4,
  DEAL_TO_CONTACT: 3
};
```

## Filter Branch Structure

### Correct Structure (OR with nested AND)
```json
{
  "filterBranch": {
    "filterBranchType": "OR",
    "filterBranches": [
      {
        "filterBranchType": "AND",
        "filterBranches": [],
        "filters": [
          {
            "filterType": "PROPERTY",
            "property": "lifecyclestage",
            "operation": {
              "operationType": "MULTISTRING",
              "operator": "IS_ANY_OF",
              "values": ["lead", "marketingqualifiedlead"]
            }
          }
        ]
      }
    ]
  }
}
```

### Common Mistakes

**Wrong: Flat filter structure**
```json
{
  "filters": [...]  // WRONG - missing filterBranch wrapper
}
```

**Wrong: AND at top level**
```json
{
  "filterBranch": {
    "filterBranchType": "AND",  // WRONG - must be OR
    ...
  }
}
```

## Membership Criteria Examples

### By Property Value
```json
{
  "filterType": "PROPERTY",
  "property": "lifecyclestage",
  "operation": {
    "operationType": "MULTISTRING",
    "operator": "IS_ANY_OF",
    "values": ["customer"]
  }
}
```

### By Association
```json
{
  "filterType": "ASSOCIATION",
  "associationTypeId": 279,
  "associationCategory": "HUBSPOT_DEFINED",
  "operator": "IS_DEFINED"
}
```

### By Form Submission
```json
{
  "filterType": "FORM_SUBMISSION",
  "formId": "abc123",
  "operator": "HAS_FILLED_OUT"
}
```

### By Email Activity
```json
{
  "filterType": "EMAIL",
  "operator": "HAS_OPENED",
  "emailId": "email123"
}
```

## Processing Type Requirements

### UNIFIED_EVENTS (Required for most filters)
```json
{
  "processingType": "UNIFIED_EVENTS",
  "filterBranch": { ... }
}
```

### When to Use SNAPSHOT
- Historical point-in-time analysis
- Performance-critical large lists
- When real-time updates not needed

## Validation Before API Call

```javascript
function validateListDefinition(listDef) {
  const errors = [];

  // Check filter branch structure
  if (!listDef.filterBranch) {
    errors.push('Missing filterBranch');
  } else if (listDef.filterBranch.filterBranchType !== 'OR') {
    errors.push('Top-level filterBranchType must be OR');
  }

  // Check processing type
  if (!listDef.processingType) {
    errors.push('Missing processingType');
  }

  // Validate association IDs
  const filters = extractAllFilters(listDef);
  for (const filter of filters) {
    if (filter.filterType === 'ASSOCIATION') {
      if (filter.associationTypeId === 280 &&
          filter.objectType === 'CONTACT') {
        errors.push('Wrong association ID: Use 279 for CONTACT_TO_COMPANY');
      }
    }
  }

  return errors;
}
```
