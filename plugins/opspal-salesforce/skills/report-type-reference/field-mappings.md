# Report Type Field Mappings

## Field Discovery

### Using MCP Tools
```javascript
const reportType = await mcp_salesforce_report_type_describe('Opportunity');

console.log('Available Fields:');
reportType.fields.forEach(field => {
    console.log(`  ${field.label} (${field.name})`);
    console.log(`    Type: ${field.type}`);
    console.log(`    Groupable: ${field.groupable}`);
    console.log(`    Filterable: ${field.filterable}`);
});
```

### Using Metadata Cache
```bash
# Get object fields for report type field discovery
node scripts/lib/org-metadata-cache.js query <org> Opportunity | jq '.fields[] | {name, type, label}'
```

## Standard Field Categories

### Primary Object Fields
Direct fields from the primary object:
- Standard fields (Id, Name, CreatedDate, etc.)
- Custom fields
- Formula fields
- Rollup summaries

### Related Object Fields
Fields from parent relationships:
- Account.Name (on Opportunity)
- Contact.Email (on Case)
- Owner.Name (on any object)

### Cross-Object Fields
Fields available via relationships:
- Child object aggregations
- Lookup field references
- Master-detail rollups

## Field Type Behavior

### Groupable Fields
Can be used in SUMMARY/MATRIX grouping:
- Picklist fields
- Date fields (with grouping options)
- Lookup fields
- Checkbox fields
- Text fields (limited utility)

### Non-Groupable Fields
Cannot be grouped, only displayed:
- Long Text Area
- Rich Text
- Encrypted fields
- Formula fields (some)

### Aggregatable Fields
Can use SUM, AVG, MIN, MAX:
- Number fields
- Currency fields
- Percent fields

## Common Field Mappings by Report Type

### Opportunity Report Type
```
Standard Fields:
- Name → Opportunity Name
- Amount → Amount
- StageName → Stage
- CloseDate → Close Date
- Probability → Probability

Related Fields:
- Account.Name → Account Name
- Owner.Name → Opportunity Owner
- Campaign.Name → Primary Campaign Source
```

### Case Report Type
```
Standard Fields:
- CaseNumber → Case Number
- Subject → Subject
- Status → Status
- Priority → Priority

Related Fields:
- Account.Name → Account Name
- Contact.Name → Contact Name
- Owner.Name → Case Owner
```

### Lead Report Type
```
Standard Fields:
- Name → Name
- Company → Company
- Status → Lead Status
- Rating → Rating
- LeadSource → Lead Source

Related Fields:
- Owner.Name → Lead Owner
- ConvertedAccount.Name → Converted Account
```

## Field Validation

### Pre-Report Validation
```javascript
async function validateReportFields(reportTypeName, requestedFields) {
    const reportType = await mcp_salesforce_report_type_describe(reportTypeName);
    const availableFields = new Set(reportType.fields.map(f => f.name));

    const invalid = requestedFields.filter(f => !availableFields.has(f));

    if (invalid.length > 0) {
        console.error('Invalid fields:', invalid);
        return { valid: false, invalid };
    }

    return { valid: true };
}
```

### Field Resolution Rate
Target: 95%+ field resolution rate using template deployment:
```javascript
const deployed = await deployReportTemplate(template, {
    fieldMapping: resolvedFields
});

const resolutionRate = (deployed.resolvedFields / deployed.totalFields) * 100;
console.log(`Field Resolution Rate: ${resolutionRate}%`);
```
