# Batch Import Validation

## Pre-Import Checklist

### Data Quality Checks
- [ ] All required properties have values
- [ ] Email format validated (RFC 5322)
- [ ] Phone numbers in consistent format
- [ ] Dates in ISO 8601 format
- [ ] Enumeration values match defined options
- [ ] No duplicate identifiers in batch
- [ ] Character encoding is UTF-8

### File Format Requirements
| Format | Max Size | Max Rows |
|--------|----------|----------|
| CSV | 512 MB | 1,000,000 |
| XLSX | 40 MB | 250,000 |

## Import Modes

### Create Only
- Creates new records
- Skips existing (by identifier)
- Use for: Initial data loads

### Update Only
- Updates existing records
- Skips new records
- Use for: Data enrichment

### Create and Update (Upsert)
- Creates new, updates existing
- Most common mode
- Use for: Ongoing syncs

## Identifier Selection

### Contact Identifiers
| Identifier | Priority | Use When |
|------------|----------|----------|
| email | 1 (default) | Standard imports |
| hs_object_id | - | Updating known records |
| custom_unique_id__c | - | Legacy system sync |

### Company Identifiers
| Identifier | Priority | Use When |
|------------|----------|----------|
| domain | 1 (default) | Standard imports |
| hs_object_id | - | Updating known records |
| name | 2 | Domain unavailable |

### Deal Identifiers
| Identifier | Priority | Use When |
|------------|----------|----------|
| hs_object_id | 1 | Always required for updates |
| dealname + associatedcompanyid | - | Creation with association |

## Validation Functions

### Email Validation
```javascript
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email) return { valid: false, error: 'Email required' };
  if (!emailRegex.test(email)) return { valid: false, error: 'Invalid format' };
  if (email.length > 254) return { valid: false, error: 'Too long' };

  return { valid: true };
}
```

### Phone Validation
```javascript
function normalizePhone(phone) {
  // Remove all non-numeric except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Ensure E.164 format
  if (!cleaned.startsWith('+')) {
    return '+1' + cleaned; // Assume US if no country code
  }

  return cleaned;
}
```

### Date Validation
```javascript
function validateDate(dateStr) {
  const date = new Date(dateStr);

  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }

  // Convert to midnight UTC for date properties
  return {
    valid: true,
    normalized: date.setUTCHours(0, 0, 0, 0)
  };
}
```

## Batch Processing

### Recommended Batch Sizes
| Object | Create | Update |
|--------|--------|--------|
| Contacts | 100 | 100 |
| Companies | 100 | 100 |
| Deals | 100 | 100 |

### Rate Limits
- 100 requests per 10 seconds
- 10,000 records per day (free)
- Unlimited (paid tiers)

### Error Handling
```javascript
async function importWithRetry(batch, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await hubspot.crm.contacts.batchApi.create({ inputs: batch });
      return { success: true, result };
    } catch (error) {
      if (error.statusCode === 429) {
        // Rate limited - wait and retry
        const waitTime = Math.pow(2, attempt) * 1000;
        await sleep(waitTime);
        continue;
      }

      if (attempt === maxRetries) {
        return { success: false, error };
      }
    }
  }
}
```

## Post-Import Validation

### Verification Queries
```javascript
// Verify import counts
const imported = await hubspot.crm.contacts.searchApi.doSearch({
  filterGroups: [{
    filters: [{
      propertyName: 'hs_object_source',
      operator: 'EQ',
      value: 'IMPORT'
    }, {
      propertyName: 'createdate',
      operator: 'GTE',
      value: importStartTime
    }]
  }],
  limit: 0
});

console.log(`Expected: ${batchSize}, Imported: ${imported.total}`);
```

### Common Import Errors
| Error | Cause | Solution |
|-------|-------|----------|
| DUPLICATE_IDENTIFIER | Email already exists | Use upsert mode |
| INVALID_PROPERTY | Property doesn't exist | Create property first |
| INVALID_OPTION | Bad enum value | Map to valid option |
| RATE_LIMITED | Too many requests | Implement backoff |
