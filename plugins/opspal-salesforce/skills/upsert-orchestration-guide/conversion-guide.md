# Lead Conversion Guide

Methodology for converting Leads to Contacts and Accounts with data preservation.

## Conversion Prerequisites

### Required Conditions

| Condition | Check | Error if Missing |
|-----------|-------|------------------|
| Lead exists | Query by ID | `ENTITY_IS_DELETED` |
| Lead not converted | `IsConverted = false` | `ALREADY_CONVERTED` |
| Lead Status valid | Not "Disqualified" | Custom logic |
| Owner active | User.IsActive = true | `INACTIVE_OWNER_OR_USER` |

### Field Requirements

```sql
-- Check required fields before conversion
SELECT Id, FirstName, LastName, Company, Email, Status, OwnerId
FROM Lead
WHERE Id = '00QXX...'
AND IsConverted = false
```

**Minimum required:**
- `LastName` (always required)
- `Company` (for Account creation)

---

## Conversion Scenarios

### Scenario 1: Create New Account + Contact

**When:** Lead doesn't match any existing Account

```javascript
const result = await convertLead({
    leadId: '00QXX...',
    convertedStatus: 'Closed - Converted',
    doNotCreateOpportunity: true,
    sendNotificationEmail: false
});
// Creates: 1 Account + 1 Contact
```

### Scenario 2: Convert to Existing Account

**When:** Lead matches existing Account by domain/name

```javascript
const result = await convertLead({
    leadId: '00QXX...',
    accountId: '001XX...',  // Existing Account
    convertedStatus: 'Closed - Converted',
    doNotCreateOpportunity: true
});
// Creates: 1 Contact under existing Account
```

### Scenario 3: Convert to Existing Contact

**When:** Contact already exists with same email

```javascript
const result = await convertLead({
    leadId: '00QXX...',
    accountId: '001XX...',
    contactId: '003XX...',  // Existing Contact - merge Lead data
    convertedStatus: 'Closed - Converted',
    overwriteLeadSource: false  // Preserve original Lead Source
});
// Updates: Existing Contact with Lead data
```

---

## Field Mapping During Conversion

### Standard Field Mapping

| Lead Field | Contact Field | Account Field |
|------------|---------------|---------------|
| FirstName | FirstName | - |
| LastName | LastName | - |
| Email | Email | - |
| Phone | Phone | Phone |
| MobilePhone | MobilePhone | - |
| Company | - | Name |
| Title | Title | - |
| Street | MailingStreet | BillingStreet |
| City | MailingCity | BillingCity |
| State | MailingState | BillingState |
| PostalCode | MailingPostalCode | BillingPostalCode |
| Country | MailingCountry | BillingCountry |
| Website | - | Website |
| Industry | - | Industry |
| NumberOfEmployees | - | NumberOfEmployees |
| LeadSource | LeadSource | - |
| Description | Description | Description |

### Custom Field Mapping

Custom fields with same API name auto-map. For different names:

```apex
// Apex trigger on Lead conversion
trigger LeadConversionMapping on Lead (after update) {
    for (Lead l : Trigger.new) {
        if (l.IsConverted && !Trigger.oldMap.get(l.Id).IsConverted) {
            // Map custom fields
            Contact c = [SELECT Id FROM Contact WHERE Id = :l.ConvertedContactId];
            c.Custom_Field__c = l.Lead_Custom_Field__c;
            update c;
        }
    }
}
```

---

## Campaign Member Preservation

### During Conversion

Campaign membership automatically transfers from Lead to Contact.

**Verify after conversion:**
```sql
SELECT Id, CampaignId, Campaign.Name, Status, LeadOrContactId
FROM CampaignMember
WHERE LeadOrContactId = '003XX...'  -- New Contact ID
```

### Campaign Response History

All campaign responses preserved:
- Responded Date
- First Responded Date
- Status history

---

## Ownership During Conversion

### Default Behavior

- Contact inherits Lead Owner
- Account inherits Lead Owner (if creating new)

### Account-Based Assignment

**Override to use Account Owner:**
```javascript
const result = await convertLead({
    leadId: '00QXX...',
    accountId: '001XX...',
    ownerId: existingAccount.OwnerId  // Use Account Owner
});
```

### Territory Assignment

**Trigger territory rules after conversion:**
```javascript
// Post-conversion: Run assignment rules
await runAssignmentRules(result.accountId);
```

---

## Duplicate Prevention

### Pre-Conversion Check

```sql
-- Check for existing Contact with same email
SELECT Id, Name, Email, AccountId
FROM Contact
WHERE Email = 'john@acme.com'

-- If found, convert to existing Contact (merge)
```

### Handling Duplicates

| Scenario | Action |
|----------|--------|
| Contact exists under same Account | Merge to existing Contact |
| Contact exists under different Account | Manual review required |
| Multiple Contacts with same email | Manual review required |

---

## Batch Lead Conversion

### Prerequisites for Batch

1. All Leads must be convertible (not already converted)
2. Account matching logic pre-calculated
3. Owner assignments determined

### Batch API Pattern

```javascript
const batchConvert = async (leads) => {
    const conversions = leads.map(lead => ({
        leadId: lead.Id,
        accountId: lead.matchedAccountId || null,
        convertedStatus: 'Closed - Converted',
        doNotCreateOpportunity: true
    }));

    const results = await LeadConvert.executeWithRetry(conversions);

    return {
        success: results.filter(r => r.success),
        failed: results.filter(r => !r.success)
    };
};
```

### Batch Size Limits

| Operation | Limit |
|-----------|-------|
| API batch size | 200 records |
| Daily conversions | Based on API limits |
| Concurrent conversions | 10 parallel threads recommended |

---

## Common Conversion Errors

### Error: ALREADY_CONVERTED

```
Lead has already been converted
```

**Solution:** Query `ConvertedContactId`, `ConvertedAccountId` for merged records.

### Error: REQUIRED_FIELD_MISSING

```
Required field missing: Company
```

**Solution:** Ensure `Company` field populated before conversion.

### Error: INVALID_CROSS_REFERENCE_KEY

```
Account ID is invalid
```

**Solution:** Verify Account exists and user has access.

### Error: CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY

```
Trigger/workflow error during conversion
```

**Solution:** Check triggers, validation rules on Contact/Account.

---

## Post-Conversion Verification

### Verify Conversion Success

```sql
SELECT Id, IsConverted, ConvertedDate,
       ConvertedContactId, ConvertedAccountId, ConvertedOpportunityId
FROM Lead
WHERE Id = '00QXX...'
```

### Verify Data Transfer

```sql
-- Check Contact has Lead data
SELECT Id, Name, Email, Phone, LeadSource, Account.Name
FROM Contact
WHERE Id = :convertedContactId
```

### Verify Campaign Membership

```sql
SELECT COUNT()
FROM CampaignMember
WHERE LeadOrContactId = :convertedContactId
```
