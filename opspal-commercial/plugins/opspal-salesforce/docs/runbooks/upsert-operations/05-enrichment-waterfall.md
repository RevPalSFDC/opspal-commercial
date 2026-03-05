# 05 - Enrichment Waterfall

Data enrichment strategies for upserted records using multiple providers.

## Enrichment Overview

Data enrichment fills missing fields with high-quality data from internal and external sources. The waterfall strategy tries multiple providers until all target fields are populated or all providers are exhausted.

## Waterfall Strategy

```
1. INTERNAL ENRICHMENT (Free, Fastest)
   ├── Query existing Accounts for company data
   ├── Query existing Contacts for person data
   └── Use Salesforce Data.com if available
           │
           ▼
2. PRIMARY PROVIDER (e.g., ZoomInfo)
   ├── If API key configured
   ├── Rate limit: 100/minute
   └── Fields: Revenue, Employees, Industry, Technographics
           │
           ▼
3. SECONDARY PROVIDER (e.g., Clearbit)
   ├── If primary fails or incomplete
   ├── Rate limit: 200/minute
   └── Fields: Description, Logo, Social profiles
           │
           ▼
4. TERTIARY PROVIDER (e.g., Apollo.io)
   ├── If secondary fails or incomplete
   ├── Rate limit: 150/minute
   └── Fields: Email verification, Phone, Job changes
           │
           ▼
5. MANUAL ENRICHMENT QUEUE
   └── Flag for human review if all providers fail
```

## Enrichment Timing

### Pre-Upsert Enrichment

**When:** Before matching/creating records
**Purpose:** Improve matching accuracy

```javascript
const preUpsertEnrich = async (record) => {
    // Normalize company name for better matching
    if (record.Company) {
        record._normalizedCompany = normalizeCompanyName(record.Company);
    }

    // Extract domain from website or email
    if (record.Website) {
        record._domain = extractDomain(record.Website);
    } else if (record.Email) {
        record._domain = record.Email.split('@')[1];
    }

    // Standardize industry
    if (record.Industry) {
        record.Industry = standardizeIndustry(record.Industry);
    }

    return record;
};
```

### Post-Create Enrichment

**When:** After record is created/updated
**Purpose:** Fill missing firmographic/demographic data

```javascript
const postCreateEnrich = async (recordId, objectType, config) => {
    // Query current record state
    const record = await getRecord(recordId, objectType);

    // Identify missing fields
    const targetFields = config.fieldPriority[objectType];
    const missingFields = targetFields.filter(f => !record[f]);

    if (missingFields.length === 0) {
        return { status: 'COMPLETE', message: 'No enrichment needed' };
    }

    // Execute waterfall enrichment
    const enrichedData = await waterfallEnrich(record, missingFields, config);

    // Update record with enriched data
    if (Object.keys(enrichedData).length > 0) {
        await updateRecord(objectType, recordId, enrichedData);

        return {
            status: 'ENRICHED',
            fieldsEnriched: Object.keys(enrichedData),
            providers: enrichedData._providers
        };
    }

    return {
        status: 'PARTIAL',
        fieldsMissing: missingFields,
        action: 'QUEUED_FOR_MANUAL_REVIEW'
    };
};
```

### Stage-Aligned Enrichment

Different enrichment levels based on record lifecycle:

| Stage | Enrichment Level | Fields |
|-------|------------------|--------|
| New Lead | Basic | Company, Industry, Website |
| MQL | Standard | + Revenue, Employees, Phone |
| SQL | Enhanced | + Technographics, Intent data |
| Opportunity | Full | + Org chart, News, Competitors |

```javascript
const getEnrichmentLevel = (record, objectType) => {
    if (objectType === 'Lead') {
        switch (record.Status) {
            case 'Qualified':
            case 'SQL':
                return 'ENHANCED';
            case 'Marketing Qualified':
            case 'MQL':
                return 'STANDARD';
            default:
                return 'BASIC';
        }
    }

    if (objectType === 'Opportunity') {
        return 'FULL';
    }

    return 'STANDARD';
};

const ENRICHMENT_FIELDS = {
    BASIC: ['Company', 'Industry', 'Website'],
    STANDARD: ['Company', 'Industry', 'Website', 'AnnualRevenue', 'NumberOfEmployees', 'Phone'],
    ENHANCED: ['Company', 'Industry', 'Website', 'AnnualRevenue', 'NumberOfEmployees', 'Phone', 'Technologies__c', 'Intent_Score__c'],
    FULL: ['Company', 'Industry', 'Website', 'AnnualRevenue', 'NumberOfEmployees', 'Phone', 'Technologies__c', 'Intent_Score__c', 'Org_Chart__c', 'Recent_News__c']
};
```

## Provider Configuration

**Location:** `instances/{org}/enrichment-providers.json`

```json
{
  "providers": {
    "internal": {
      "priority": 1,
      "enabled": true,
      "description": "Cross-reference with existing Salesforce data",
      "fields": ["OwnerId", "RecordTypeId", "Industry", "Website", "AnnualRevenue", "NumberOfEmployees"]
    },
    "zoominfo": {
      "priority": 2,
      "enabled": true,
      "apiKeyEnv": "ZOOMINFO_API_KEY",
      "baseUrl": "https://api.zoominfo.com/v2",
      "rateLimitPerMinute": 100,
      "timeoutMs": 5000,
      "fields": ["AnnualRevenue", "NumberOfEmployees", "Industry", "Website", "Phone", "Technologies"],
      "mapping": {
        "revenue": "AnnualRevenue",
        "employeeCount": "NumberOfEmployees",
        "industry": "Industry",
        "technologies": "Technologies__c"
      }
    },
    "clearbit": {
      "priority": 3,
      "enabled": true,
      "apiKeyEnv": "CLEARBIT_API_KEY",
      "baseUrl": "https://company.clearbit.com/v2",
      "rateLimitPerMinute": 200,
      "timeoutMs": 5000,
      "fields": ["Description", "Website", "Industry", "LogoUrl"],
      "mapping": {
        "description": "Description",
        "domain": "Website",
        "logo": "Logo_URL__c"
      }
    },
    "apollo": {
      "priority": 4,
      "enabled": false,
      "apiKeyEnv": "APOLLO_API_KEY",
      "baseUrl": "https://api.apollo.io/v1",
      "rateLimitPerMinute": 150,
      "fields": ["Phone", "Email", "Title"],
      "mapping": {
        "phone": "Phone",
        "email": "Email",
        "title": "Title"
      }
    }
  },
  "waterfall": {
    "continueOnSuccess": false,
    "continueOnPartialSuccess": true,
    "stopOnCriticalFieldPopulated": ["AnnualRevenue", "NumberOfEmployees"],
    "maxProvidersPerRecord": 3,
    "timeoutMs": 5000
  },
  "fieldPriority": {
    "Lead": ["Industry", "AnnualRevenue", "NumberOfEmployees", "Website", "Phone"],
    "Account": ["Industry", "AnnualRevenue", "NumberOfEmployees", "Website", "Description"],
    "Contact": ["Title", "Phone", "MobilePhone"]
  }
}
```

## Internal Enrichment

Cross-reference with existing Salesforce data (free, fastest):

```javascript
const internalEnrich = async (record, missingFields) => {
    const enrichedData = {};

    // If Lead has email domain, check for matching Account
    if (record.Email && missingFields.some(f => ['Industry', 'Website', 'AnnualRevenue', 'NumberOfEmployees'].includes(f))) {
        const domain = record.Email.split('@')[1];

        // Skip common email providers
        if (!COMMON_EMAIL_PROVIDERS.has(domain)) {
            const accountQuery = `
                SELECT Industry, Website, AnnualRevenue, NumberOfEmployees, Phone
                FROM Account
                WHERE Website LIKE '%${domain}%'
                LIMIT 1
            `;

            const accounts = await executeQuery(accountQuery);

            if (accounts.length > 0) {
                const account = accounts[0];

                // Copy non-null values for missing fields
                for (const field of missingFields) {
                    if (account[field] && !enrichedData[field]) {
                        enrichedData[field] = account[field];
                    }
                }
            }
        }
    }

    // Check for existing Contact with same email
    if (record.Email && missingFields.includes('Phone')) {
        const contactQuery = `
            SELECT Phone, MobilePhone
            FROM Contact
            WHERE Email = '${record.Email.toLowerCase()}'
            LIMIT 1
        `;

        const contacts = await executeQuery(contactQuery);

        if (contacts.length > 0 && contacts[0].Phone) {
            enrichedData.Phone = contacts[0].Phone;
        }
    }

    return enrichedData;
};
```

## External Provider Integration

### ZoomInfo Example

```javascript
const enrichFromZoomInfo = async (record, fields, config) => {
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) return null;

    try {
        // Build search parameters
        const params = {};
        if (record.Company) params.companyName = record.Company;
        if (record.Website) params.companyWebsite = record.Website;
        if (record.Email) params.emailAddress = record.Email;

        const response = await fetch(`${config.baseUrl}/search/company`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params),
            timeout: config.timeoutMs
        });

        if (!response.ok) {
            throw new Error(`ZoomInfo API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.data || data.data.length === 0) {
            return null;
        }

        // Map response to Salesforce fields
        const company = data.data[0];
        const enrichedData = {};

        for (const [apiField, sfField] of Object.entries(config.mapping)) {
            if (fields.includes(sfField) && company[apiField]) {
                enrichedData[sfField] = company[apiField];
            }
        }

        return enrichedData;

    } catch (error) {
        console.warn('ZoomInfo enrichment failed:', error.message);
        return null;
    }
};
```

### Clearbit Example

```javascript
const enrichFromClearbit = async (record, fields, config) => {
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) return null;

    try {
        // Clearbit uses domain lookup
        let domain = record.Website;
        if (!domain && record.Email) {
            domain = record.Email.split('@')[1];
        }

        if (!domain) return null;

        const response = await fetch(`${config.baseUrl}/companies/find?domain=${domain}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            timeout: config.timeoutMs
        });

        if (!response.ok) {
            return null;
        }

        const company = await response.json();
        const enrichedData = {};

        // Map Clearbit response
        if (fields.includes('Description') && company.description) {
            enrichedData.Description = company.description;
        }
        if (fields.includes('Industry') && company.category?.industry) {
            enrichedData.Industry = company.category.industry;
        }
        if (fields.includes('NumberOfEmployees') && company.metrics?.employees) {
            enrichedData.NumberOfEmployees = company.metrics.employees;
        }

        return enrichedData;

    } catch (error) {
        console.warn('Clearbit enrichment failed:', error.message);
        return null;
    }
};
```

## Waterfall Execution

```javascript
const waterfallEnrich = async (record, missingFields, config) => {
    let enrichedData = {};
    let remainingFields = [...missingFields];
    const providersUsed = [];

    // Sort providers by priority
    const providers = Object.entries(config.providers)
        .filter(([_, p]) => p.enabled)
        .sort((a, b) => a[1].priority - b[1].priority);

    for (const [name, provider] of providers) {
        if (remainingFields.length === 0) break;
        if (providersUsed.length >= config.waterfall.maxProvidersPerRecord) break;

        // Get fields this provider can enrich
        const providerFields = remainingFields.filter(f =>
            provider.fields.includes(f)
        );

        if (providerFields.length === 0) continue;

        try {
            // Call provider
            let providerData;

            switch (name) {
                case 'internal':
                    providerData = await internalEnrich(record, providerFields);
                    break;
                case 'zoominfo':
                    providerData = await enrichFromZoomInfo(record, providerFields, provider);
                    break;
                case 'clearbit':
                    providerData = await enrichFromClearbit(record, providerFields, provider);
                    break;
                default:
                    providerData = await enrichFromGenericProvider(record, providerFields, provider);
            }

            if (providerData && Object.keys(providerData).length > 0) {
                providersUsed.push(name);

                // Merge results
                for (const [field, value] of Object.entries(providerData)) {
                    if (value && !enrichedData[field]) {
                        enrichedData[field] = value;
                        remainingFields = remainingFields.filter(f => f !== field);
                    }
                }

                // Check stop conditions
                if (!config.waterfall.continueOnSuccess && Object.keys(providerData).length > 0) {
                    break;
                }

                const criticalPopulated = config.waterfall.stopOnCriticalFieldPopulated
                    .some(f => enrichedData[f]);
                if (criticalPopulated) break;
            }

        } catch (error) {
            console.warn(`Provider ${name} failed:`, error.message);
            // Continue to next provider
        }
    }

    enrichedData._providers = providersUsed;
    enrichedData._remainingFields = remainingFields;

    return enrichedData;
};
```

## Periodic Refresh

Re-enrich stale records to combat data decay:

```javascript
const refreshStaleRecords = async (objectType, options = {}) => {
    const staleDays = options.staleDays || 180;
    const batchSize = options.batchSize || 100;

    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleDays);

    const query = `
        SELECT Id, Name, Email, Website, Industry, AnnualRevenue,
               NumberOfEmployees, LastModifiedDate
        FROM ${objectType}
        WHERE LastModifiedDate < ${staleDate.toISOString()}
          AND (AnnualRevenue = null OR NumberOfEmployees = null)
        ORDER BY LastModifiedDate ASC
        LIMIT ${batchSize}
    `;

    const records = await executeQuery(query);

    const results = {
        processed: 0,
        refreshed: [],
        skipped: [],
        errors: []
    };

    for (const record of records) {
        results.processed++;

        try {
            const enrichResult = await postCreateEnrich(record.Id, objectType);

            if (enrichResult.status === 'ENRICHED') {
                results.refreshed.push({
                    id: record.Id,
                    fields: enrichResult.fieldsEnriched
                });
            } else {
                results.skipped.push({
                    id: record.Id,
                    reason: enrichResult.message || 'No data found'
                });
            }
        } catch (error) {
            results.errors.push({
                id: record.Id,
                error: error.message
            });
        }
    }

    return results;
};
```

## Data Quality Validation

Validate enriched data before applying:

```javascript
const VALIDATION_RULES = {
    AnnualRevenue: {
        type: 'number',
        min: 0,
        max: 1000000000000 // 1 trillion
    },
    NumberOfEmployees: {
        type: 'number',
        min: 1,
        max: 10000000
    },
    Website: {
        type: 'string',
        pattern: /^https?:\/\/.+/
    },
    Phone: {
        type: 'string',
        pattern: /^[\d\s\-\+\(\)]+$/
    }
};

const validateEnrichedData = (data, rules = VALIDATION_RULES) => {
    const validated = {};
    const issues = [];

    for (const [field, value] of Object.entries(data)) {
        if (field.startsWith('_')) {
            // Skip metadata fields
            validated[field] = value;
            continue;
        }

        const rule = rules[field];

        if (!rule) {
            validated[field] = value;
            continue;
        }

        // Type validation
        if (rule.type === 'number' && typeof value !== 'number') {
            issues.push({ field, issue: 'Invalid type, expected number' });
            continue;
        }

        // Range validation
        if (rule.min !== undefined && value < rule.min) {
            issues.push({ field, issue: `Value ${value} below minimum ${rule.min}` });
            continue;
        }

        if (rule.max !== undefined && value > rule.max) {
            issues.push({ field, issue: `Value ${value} above maximum ${rule.max}` });
            continue;
        }

        // Pattern validation
        if (rule.pattern && !rule.pattern.test(value)) {
            issues.push({ field, issue: 'Does not match expected pattern' });
            continue;
        }

        validated[field] = value;
    }

    return { validated, issues };
};
```

## Output Format

```json
{
  "enrichmentResults": {
    "summary": {
      "totalRecords": 100,
      "enriched": 75,
      "partial": 15,
      "failed": 10,
      "successRate": "75%"
    },
    "enriched": [
      {
        "recordId": "00QXXXXXXXXXX",
        "fieldsEnriched": ["AnnualRevenue", "NumberOfEmployees", "Industry"],
        "providers": ["internal", "zoominfo"],
        "confidence": "high"
      }
    ],
    "partial": [
      {
        "recordId": "00QYYYYYYYYYY",
        "fieldsEnriched": ["Industry"],
        "fieldsMissing": ["AnnualRevenue"],
        "providers": ["clearbit"],
        "reason": "Provider returned incomplete data"
      }
    ],
    "failed": [
      {
        "recordId": "00QZZZZZZZZZZ",
        "reason": "No providers returned data",
        "action": "QUEUED_FOR_MANUAL_REVIEW"
      }
    ],
    "providerStats": {
      "internal": { "calls": 100, "successes": 30, "failures": 0 },
      "zoominfo": { "calls": 70, "successes": 50, "failures": 5, "rateLimit": 0 },
      "clearbit": { "calls": 25, "successes": 20, "failures": 3, "rateLimit": 2 }
    }
  }
}
```

## Best Practices

1. **Internal First** - Always try internal enrichment before external providers
2. **Rate Limit Awareness** - Respect provider rate limits to avoid blocks
3. **Validate Data** - Always validate enriched data before saving
4. **Track Provider Stats** - Monitor success rates to optimize provider order
5. **Schedule Refresh** - Regularly refresh stale records (180 days default)

## Related Sections

- [01 - Upsert Fundamentals](01-upsert-fundamentals.md)
- [03 - Field Mapping Rules](03-field-mapping-rules.md)
- [07 - Error Handling](07-error-handling.md)

---
Next: [06 - Lead Auto-Conversion](06-lead-auto-conversion.md)
