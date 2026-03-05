# Cross-Object Reporting Patterns

## Report Type Selection by Use Case

### Single Object Reports
**When to use**: Simple listings, counts, aggregations on one object

```
Report Type: Account
Format: TABULAR or SUMMARY
Use Case: Account listings, account counts by industry
```

### Parent-Child Reports
**When to use**: Showing parent records with related child details

```
Report Type: AccountOpportunity
Format: SUMMARY (group by Account)
Use Case: Pipeline by account, opportunities per account
```

### Child-to-Parent Reports
**When to use**: Child record listings with parent context

```
Report Type: OpportunityProduct
Format: SUMMARY (group by Product)
Use Case: Product mix analysis, revenue by product
```

### Multi-Object Joined Reports
**When to use**: Comparing data across unrelated objects

```
Report Type: Multiple (via Joined Report)
Format: JOINED
Use Case: Pipeline vs. closed won comparison, year-over-year
```

## Format Selection Matrix

| Scenario | Format | Why |
|----------|--------|-----|
| Simple listing | TABULAR | No grouping needed |
| Grouped with subtotals | SUMMARY | One grouping dimension |
| Matrix/pivot analysis | MATRIX | Two grouping dimensions |
| Multi-source comparison | JOINED | Different data sources |

## Joined Report Patterns

### Creating Joined Reports
```javascript
const joinedReport = {
    reportType: 'joined',
    blocks: [
        {
            reportType: 'Opportunity',
            filters: [{ field: 'StageName', value: 'Closed Won' }]
        },
        {
            reportType: 'Opportunity',
            filters: [{ field: 'StageName', value: 'Pipeline' }]
        }
    ],
    commonGrouping: 'Owner.Name'
};
```

### Joined Report Limitations
- Maximum 5 blocks per joined report
- Each block can have different report types
- Common grouping required across blocks
- Some field types not available in joined context

## Custom Report Type Creation

### When to Create Custom Types
- Standard types don't provide needed relationships
- Need specific field combinations
- Cross-object lookups required
- Filtering at report type level needed

### Custom Report Type Structure
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomReportType xmlns="http://soap.sforce.com/2006/04/metadata">
    <baseObject>Opportunity</baseObject>
    <category>opportunities</category>
    <deployed>true</deployed>
    <description>Opportunities with Products and Accounts</description>
    <join>
        <outerJoin>false</outerJoin>
        <relationship>OpportunityLineItems</relationship>
    </join>
    <label>Opportunities with Products</label>
</CustomReportType>
```

### Deployment Validation
```bash
# Validate report type before deployment
node scripts/lib/report-format-validator.js --validate-type ./customReportType.xml
```

## Historical Usage Patterns

### Learn from Past Creations
```javascript
function createCustomReportTypeWithHistory(baseObject, relatedObjects, context) {
    const creationHistory = context.provenStrategies?.customReportTypes?.filter(crt =>
        crt.baseObject === baseObject
    );

    if (creationHistory?.length > 0) {
        const bestCreation = creationHistory.sort((a, b) => b.successRate - a.successRate)[0];

        console.log('✅ Found similar custom report type creation:');
        console.log(`   Report Type: ${bestCreation.reportTypeName}`);
        console.log(`   Success Rate: ${bestCreation.successRate}%`);

        return { template: bestCreation, confidence: bestCreation.successRate };
    }

    return { template: null, confidence: 60 };
}
```

### Field Combination Success Rates
```javascript
if (context.provenStrategies?.fieldCombinations) {
    console.log('✅ Proven field combinations:');
    context.provenStrategies.fieldCombinations.forEach(combo => {
        console.log(`   ${combo.name}: ${combo.fields.join(', ')}`);
        console.log(`   Usage rate: ${combo.usageRate}%`);
    });
}
```

## Performance Considerations

### Relationship Depth
- Limit to 5 levels of relationships
- Each level adds query complexity
- Consider denormalization for frequently used reports

### Filter Optimization
- Apply filters at report type level when possible
- Use indexed fields for filtering
- Avoid LIKE with leading wildcard

### Large Data Volumes
- Use date range filters
- Consider summary/rollup fields instead of detail
- Implement report folders with row limits
