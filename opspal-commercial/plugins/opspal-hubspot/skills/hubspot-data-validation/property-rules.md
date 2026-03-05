# Property Validation Rules

## Required Properties by Object

### Contact Properties
| Property | Type | Validation |
|----------|------|------------|
| email | string | Valid email format |
| firstname | string | Max 255 chars |
| lastname | string | Max 255 chars |
| phone | string | E.164 format preferred |
| company | string | Max 255 chars |

### Company Properties
| Property | Type | Validation |
|----------|------|------------|
| name | string | Required, max 255 chars |
| domain | string | Valid domain format |
| industry | enumeration | From defined values |
| annualrevenue | number | Positive integer |

### Deal Properties
| Property | Type | Validation |
|----------|------|------------|
| dealname | string | Required, max 255 chars |
| amount | number | Positive decimal |
| dealstage | enumeration | Valid pipeline stage |
| closedate | date | ISO 8601 format |

## Property Type Validation

### String Properties
```javascript
// Max length validation
if (value.length > 65536) {
  throw new Error('String exceeds max length');
}
```

### Number Properties
```javascript
// Range validation
if (typeof value !== 'number' || isNaN(value)) {
  throw new Error('Invalid number format');
}
```

### Date Properties
```javascript
// Must be midnight UTC timestamp
const timestamp = new Date(value).setUTCHours(0, 0, 0, 0);
```

### Enumeration Properties
```javascript
// Must match defined options
const validOptions = await getPropertyOptions(propertyName);
if (!validOptions.includes(value)) {
  throw new Error(`Invalid option: ${value}`);
}
```

## Custom Property Creation

### Naming Conventions
- Use snake_case for internal names
- Prefix with category: `lead_`, `deal_`, `company_`
- Avoid special characters except underscore

### Type Selection Guide
| Use Case | Property Type |
|----------|---------------|
| Free text input | string |
| Multiple choice (single) | enumeration |
| Multiple choice (multi) | multiple_checkboxes |
| Yes/No | bool |
| Whole numbers | number |
| Decimals/Currency | number |
| Date only | date |
| Date + time | datetime |

## Validation Patterns

### Pre-Import Validation
```javascript
async function validateBeforeImport(records, propertyMap) {
  const errors = [];

  for (const [index, record] of records.entries()) {
    for (const [prop, value] of Object.entries(record)) {
      const validation = propertyMap[prop];
      if (!validation) continue;

      const error = await validateProperty(prop, value, validation);
      if (error) {
        errors.push({ row: index + 1, property: prop, error });
      }
    }
  }

  return errors;
}
```

### Real-Time Validation
```javascript
function validateProperty(name, value, rules) {
  if (rules.required && !value) {
    return `${name} is required`;
  }

  if (rules.maxLength && value.length > rules.maxLength) {
    return `${name} exceeds max length of ${rules.maxLength}`;
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    return `${name} has invalid format`;
  }

  return null;
}
```
