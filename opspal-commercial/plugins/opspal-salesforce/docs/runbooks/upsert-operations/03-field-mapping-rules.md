# 03 - Field Mapping Rules

Standardized field mapping, transformation, and null handling for upsert operations.

## Field Mapping Overview

Field mapping defines how data flows between:
- External sources → Salesforce objects
- Lead → Contact (on conversion)
- Lead → Account (on conversion)
- External systems → Multiple objects

## Standard Mappings

### Lead → Contact

| Lead Field | Contact Field | Notes |
|------------|---------------|-------|
| `FirstName` | `FirstName` | Direct copy |
| `LastName` | `LastName` | Direct copy |
| `Email` | `Email` | Lowercase transformation |
| `Phone` | `Phone` | Phone normalization |
| `MobilePhone` | `MobilePhone` | Phone normalization |
| `Title` | `Title` | Direct copy |
| `LeadSource` | `LeadSource` | Direct copy |
| `MailingStreet` | `MailingStreet` | From Lead address |
| `MailingCity` | `MailingCity` | Direct copy |
| `MailingState` | `MailingState` | Direct copy |
| `MailingPostalCode` | `MailingPostalCode` | Direct copy |
| `MailingCountry` | `MailingCountry` | Direct copy |
| `Description` | `Description` | Direct copy |

### Lead → Account

| Lead Field | Account Field | Notes |
|------------|---------------|-------|
| `Company` | `Name` | Company normalization |
| `Website` | `Website` | URL normalization |
| `Industry` | `Industry` | Direct copy |
| `NumberOfEmployees` | `NumberOfEmployees` | Direct copy |
| `AnnualRevenue` | `AnnualRevenue` | Direct copy |
| `Phone` | `Phone` | Company phone |
| `Street` | `BillingStreet` | From Lead address |
| `City` | `BillingCity` | Direct copy |
| `State` | `BillingState` | Direct copy |
| `PostalCode` | `BillingPostalCode` | Direct copy |
| `Country` | `BillingCountry` | Direct copy |
| `Description` | `Description` | Direct copy |

## Configuration File

**Location:** `config/upsert-field-mappings.json`

```json
{
  "leadToContact": {
    "FirstName": "FirstName",
    "LastName": "LastName",
    "Email": "Email",
    "Phone": "Phone",
    "MobilePhone": "MobilePhone",
    "Title": "Title",
    "LeadSource": "LeadSource",
    "Street": "MailingStreet",
    "City": "MailingCity",
    "State": "MailingState",
    "PostalCode": "MailingPostalCode",
    "Country": "MailingCountry"
  },
  "leadToAccount": {
    "Company": "Name",
    "Website": "Website",
    "Industry": "Industry",
    "NumberOfEmployees": "NumberOfEmployees",
    "AnnualRevenue": "AnnualRevenue",
    "Phone": "Phone",
    "Street": "BillingStreet",
    "City": "BillingCity",
    "State": "BillingState",
    "PostalCode": "BillingPostalCode",
    "Country": "BillingCountry"
  },
  "transformations": {
    "Email": { "transform": "lowercase" },
    "Phone": { "transform": "phoneNormalize" },
    "MobilePhone": { "transform": "phoneNormalize" },
    "Company": { "transform": "companyNormalize" },
    "Website": { "transform": "urlNormalize" }
  },
  "nullHandling": {
    "default": "preserveExisting",
    "overrides": {
      "Description": "allowNull"
    }
  }
}
```

## Data Transformations

### Email Normalization

```javascript
const normalizeEmail = (email) => {
    if (!email) return null;

    return email
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '');
};

// Examples:
// "John.Doe@ACME.com " → "john.doe@acme.com"
// "  USER@example.COM" → "user@example.com"
```

### Phone Normalization

```javascript
const normalizePhone = (phone) => {
    if (!phone) return null;

    // Remove all non-numeric characters
    const digits = phone.replace(/\D/g, '');

    // Handle US numbers
    if (digits.length === 10) {
        return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }

    // Handle US numbers with country code
    if (digits.length === 11 && digits[0] === '1') {
        return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    }

    // Return cleaned digits for international
    return `+${digits}`;
};

// Examples:
// "555-123-4567" → "(555) 123-4567"
// "1.800.555.1234" → "+1 (800) 555-1234"
// "+44 20 7946 0958" → "+442079460958"
```

### Company Name Normalization

```javascript
const COMPANY_SUFFIXES = [
    'inc', 'inc.', 'incorporated',
    'llc', 'l.l.c.', 'limited liability company',
    'ltd', 'ltd.', 'limited',
    'corp', 'corp.', 'corporation',
    'co', 'co.', 'company',
    'plc', 'p.l.c.'
];

const normalizeCompany = (company) => {
    if (!company) return null;

    let normalized = company
        .trim()
        .replace(/\s+/g, ' ');

    // Remove common suffixes for matching
    const lowerCompany = normalized.toLowerCase();
    for (const suffix of COMPANY_SUFFIXES) {
        if (lowerCompany.endsWith(suffix)) {
            normalized = normalized.slice(0, -suffix.length).trim();
            // Remove trailing comma or period
            normalized = normalized.replace(/[,.]$/, '').trim();
            break;
        }
    }

    return normalized;
};

// Examples:
// "Acme Corporation" → "Acme"
// "Smith & Jones, LLC" → "Smith & Jones"
// "BigCo, Inc." → "BigCo"
```

### URL Normalization

```javascript
const normalizeUrl = (url) => {
    if (!url) return null;

    let normalized = url.trim().toLowerCase();

    // Add protocol if missing
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = 'https://' + normalized;
    }

    // Remove trailing slash
    normalized = normalized.replace(/\/+$/, '');

    // Remove www.
    normalized = normalized.replace(/^(https?:\/\/)www\./, '$1');

    return normalized;
};

// Examples:
// "www.acme.com" → "https://acme.com"
// "HTTP://EXAMPLE.COM/" → "https://example.com"
```

## Null Handling Strategies

### Strategy Options

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `preserveExisting` | Keep existing value if new is null | Default - protects data |
| `allowNull` | Overwrite with null | Explicitly clear field |
| `useDefault` | Replace null with default value | Ensure field has value |
| `skipField` | Don't include field in update | Ignore field entirely |

### Implementation

```javascript
const applyNullHandling = (existingValue, newValue, strategy, defaultValue) => {
    switch (strategy) {
        case 'preserveExisting':
            return newValue ?? existingValue;

        case 'allowNull':
            return newValue;

        case 'useDefault':
            return newValue ?? defaultValue ?? existingValue;

        case 'skipField':
            return undefined; // Field omitted from update

        default:
            return newValue ?? existingValue;
    }
};
```

### Configuration Example

```json
{
  "nullHandling": {
    "default": "preserveExisting",
    "overrides": {
      "Description": "allowNull",
      "LeadSource": "useDefault",
      "Industry": "preserveExisting"
    },
    "defaults": {
      "LeadSource": "Web"
    }
  }
}
```

## Custom Field Mapping

### Adding Custom Fields

```json
{
  "customMappings": {
    "Lead": {
      "UTM_Source__c": "LeadSource",
      "Campaign_ID__c": {
        "target": "Campaign_ID__c",
        "transform": "none"
      },
      "Lead_Score__c": {
        "target": "Lead_Score__c",
        "transform": "toNumber",
        "default": 0
      }
    }
  }
}
```

### External Source Mapping

```json
{
  "externalSources": {
    "hubspot": {
      "firstname": "FirstName",
      "lastname": "LastName",
      "email": "Email",
      "company": "Company",
      "hs_lead_status": {
        "target": "Status",
        "valueMapping": {
          "NEW": "Open - Not Contacted",
          "OPEN": "Working - Contacted",
          "IN_PROGRESS": "Working - Contacted",
          "QUALIFIED": "Qualified",
          "UNQUALIFIED": "Closed - Not Converted"
        }
      }
    },
    "marketo": {
      "firstName": "FirstName",
      "lastName": "LastName",
      "emailAddress": "Email",
      "company": "Company",
      "leadScore": {
        "target": "Lead_Score__c",
        "transform": "toNumber"
      }
    }
  }
}
```

## Value Mapping

### Picklist Value Mapping

```javascript
const mapPicklistValue = (value, mapping) => {
    if (!value) return null;

    // Check direct mapping
    if (mapping[value]) {
        return mapping[value];
    }

    // Check case-insensitive
    const lowerValue = value.toLowerCase();
    for (const [key, mappedValue] of Object.entries(mapping)) {
        if (key.toLowerCase() === lowerValue) {
            return mappedValue;
        }
    }

    // Return original if no mapping found
    return value;
};
```

### Example Picklist Mappings

```json
{
  "valueMapping": {
    "Status": {
      "new": "Open - Not Contacted",
      "contacted": "Working - Contacted",
      "qualified": "Qualified",
      "disqualified": "Closed - Not Converted",
      "converted": "Closed - Converted"
    },
    "Industry": {
      "tech": "Technology",
      "software": "Technology",
      "finance": "Financial Services",
      "banking": "Financial Services",
      "healthcare": "Healthcare",
      "medical": "Healthcare"
    }
  }
}
```

## Required Fields Validation

### Configuration

```json
{
  "requiredFields": {
    "Lead": ["LastName", "Company"],
    "Contact": ["LastName", "AccountId"],
    "Account": ["Name"]
  },
  "conditionalRequired": {
    "Lead": {
      "if": { "Status": "Qualified" },
      "then": ["Email", "Phone"]
    }
  }
}
```

### Validation Implementation

```javascript
const validateRequiredFields = (record, objectType, config) => {
    const errors = [];
    const required = config.requiredFields[objectType] || [];

    // Check standard required fields
    for (const field of required) {
        if (!record[field]) {
            errors.push({
                field,
                error: 'REQUIRED_FIELD_MISSING',
                message: `Required field '${field}' is missing`
            });
        }
    }

    // Check conditional required fields
    const conditional = config.conditionalRequired?.[objectType];
    if (conditional) {
        const conditionMet = Object.entries(conditional.if)
            .every(([field, value]) => record[field] === value);

        if (conditionMet) {
            for (const field of conditional.then) {
                if (!record[field]) {
                    errors.push({
                        field,
                        error: 'CONDITIONAL_REQUIRED_MISSING',
                        message: `Field '${field}' required when ${JSON.stringify(conditional.if)}`
                    });
                }
            }
        }
    }

    return errors;
};
```

## Field Mapper Implementation

### Core Mapper Class

```javascript
class UpsertFieldMapper {
    constructor(config) {
        this.config = config;
        this.transformers = {
            lowercase: (v) => v?.toLowerCase(),
            phoneNormalize: normalizePhone,
            companyNormalize: normalizeCompany,
            urlNormalize: normalizeUrl,
            toNumber: (v) => v ? Number(v) : null,
            toBoolean: (v) => v === true || v === 'true' || v === '1',
            trim: (v) => v?.trim()
        };
    }

    mapFields(source, mappingType, existingRecord = null) {
        const mapping = this.config[mappingType];
        if (!mapping) {
            throw new Error(`Unknown mapping type: ${mappingType}`);
        }

        const result = {};

        for (const [sourceField, targetConfig] of Object.entries(mapping)) {
            const targetField = typeof targetConfig === 'string'
                ? targetConfig
                : targetConfig.target;

            let value = source[sourceField];

            // Apply transformation
            const transform = this.config.transformations?.[sourceField]?.transform
                || (typeof targetConfig === 'object' ? targetConfig.transform : null);

            if (transform && this.transformers[transform]) {
                value = this.transformers[transform](value);
            }

            // Apply null handling
            const nullStrategy = this.config.nullHandling?.overrides?.[targetField]
                || this.config.nullHandling?.default
                || 'preserveExisting';

            const existingValue = existingRecord?.[targetField];
            const defaultValue = this.config.nullHandling?.defaults?.[targetField];

            value = applyNullHandling(existingValue, value, nullStrategy, defaultValue);

            if (value !== undefined) {
                result[targetField] = value;
            }
        }

        return result;
    }
}
```

## Testing Field Mappings

```javascript
describe('UpsertFieldMapper', () => {
    const mapper = new UpsertFieldMapper(config);

    it('maps Lead to Contact correctly', () => {
        const lead = {
            FirstName: 'John',
            LastName: 'Doe',
            Email: 'JOHN@ACME.COM',
            Phone: '555-123-4567'
        };

        const contact = mapper.mapFields(lead, 'leadToContact');

        expect(contact.FirstName).toBe('John');
        expect(contact.Email).toBe('john@acme.com');
        expect(contact.Phone).toBe('(555) 123-4567');
    });

    it('preserves existing values when input is null', () => {
        const existing = { Email: 'existing@acme.com' };
        const input = { Email: null };

        const result = mapper.mapFields(input, 'leadToContact', existing);

        expect(result.Email).toBe('existing@acme.com');
    });
});
```

## Related Sections

- [01 - Upsert Fundamentals](01-upsert-fundamentals.md)
- [02 - Matching Strategies](02-matching-strategies.md)
- [06 - Lead Auto-Conversion](06-lead-auto-conversion.md)

---
Next: [04 - Ownership Routing](04-ownership-routing.md)
