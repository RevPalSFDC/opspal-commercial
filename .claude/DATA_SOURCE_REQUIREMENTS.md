# Data Source Transparency Requirements for Sub-Agents

**Effective Date**: 2025-09-09  
**Priority**: CRITICAL  
**Scope**: All data-querying sub-agents across RevPal system

## Executive Summary

This document establishes mandatory requirements for data source transparency in all sub-agent operations. These requirements prevent the generation of fake/simulated data without explicit disclosure and ensure complete traceability of all data operations.

## Core Principles

1. **Never Simulate Without Disclosure**: Sub-agents must NEVER generate synthetic data as a substitute for real queries without explicit labeling
2. **Fail Fast and Loud**: Query failures must be immediately reported with detailed error information
3. **Complete Transparency**: Every data point must include its source and confidence level
4. **Audit Trail**: All query attempts must be logged with sufficient detail for troubleshooting

## Mandatory Data Source Labels

Every piece of data in sub-agent outputs MUST be prefixed with one of these labels:

### ✅ VERIFIED (Live Data)
```
✅ VERIFIED: [Data from live system query]
Source: Salesforce Production (neonone)
Query Time: 2025-09-09T10:30:45Z
Records: 1,247
```

### ⚠️ SIMULATED (Example Data)
```
⚠️ SIMULATED: [Example data for demonstration]
Reason: MCP tools unavailable
Requested By: User (explicit)
Pattern: Representative sample based on typical values
```

### ❌ FAILED (Query Failed)
```
❌ FAILED: [Query attempted but failed]
Error: Permission denied for object Lead
Query: SELECT Id, Name FROM Lead LIMIT 10
Attempted: 2025-09-09T10:30:45Z
```

### ❓ UNKNOWN (Cannot Determine)
```
❓ UNKNOWN: [Data source cannot be determined]
Reason: Inherited from external system
Confidence: Low (< 50%)
```

## Query Execution Metadata Requirements

Every query execution MUST generate the following metadata:

```json
{
  "queryId": "q_1234567890",
  "timestamp": "2025-09-09T10:30:45Z",
  "agent": "sfdc-revops-auditor",
  "query": "SELECT Id, Name, Amount FROM Opportunity WHERE...",
  "dataSource": {
    "type": "LIVE_SALESFORCE",
    "instance": "neonone-production",
    "connection": "mcp_salesforce"
  },
  "execution": {
    "startTime": "2025-09-09T10:30:45.123Z",
    "endTime": "2025-09-09T10:30:46.789Z",
    "duration": 1666,
    "success": true
  },
  "results": {
    "recordCount": 247,
    "truncated": false,
    "confidence": 0.99
  },
  "errors": []
}
```

## Report Structure Requirements

### Header Section (MANDATORY)
Every report must begin with:

```markdown
# [Report Title]

## Data Source Declaration
- **Primary Data Source**: [LIVE/SIMULATED/MIXED]
- **Query Execution Time**: [ISO 8601 timestamp]
- **Instance**: [Instance name and type]
- **Confidence Level**: [Percentage]
- **Verification Status**: [VERIFIED/UNVERIFIED/PARTIAL]

## Query Execution Summary
- Total Queries Executed: [Number]
- Successful Queries: [Number]
- Failed Queries: [Number]
- Simulated Data Points: [Number or "NONE"]
```

### Data Section Requirements

#### For Live Data:
```markdown
### Finding: [Title]
✅ **Data Source**: VERIFIED - Live Salesforce Query
**Query Time**: 2025-09-09T10:30:45Z
**Records Analyzed**: 1,247 of 15,234 total
**Sampling Method**: Random stratified sample

**Evidence**:
- Account ID: 001xx000003DHP0 (Production record)
- Opportunity: "Enterprise Deal Q4" - $485,000
- Last Modified: 2025-09-08T15:45:00Z by User043
```

#### For Simulated Data (Only When Explicitly Allowed):
```markdown
### Example Scenario: [Title]
⚠️ **Data Source**: SIMULATED - Representative Example
**Justification**: User requested example scenario
**Based On**: Typical patterns from 1000+ implementations

**Example** (Not Real Data):
- Hypothetical Lead: "Tech Startup Inc"
- Representative Status: "Qualified"
- Typical Conversion Time: 15-20 days
```

## Error Handling Requirements

### Query Failure Protocol

When a query fails, agents MUST:

1. **Stop Execution**
```javascript
if (queryResult.error) {
  throw new Error(`Query Failed: ${queryResult.error}`);
  // DO NOT CONTINUE WITH SYNTHETIC DATA
}
```

2. **Report Detailed Error**
```markdown
❌ **QUERY FAILURE DETECTED**
- **Query**: SELECT Id FROM Lead WHERE...
- **Error**: INVALID_FIELD: Field 'CustomField__c' does not exist
- **Timestamp**: 2025-09-09T10:30:45Z
- **Troubleshooting**:
  1. Verify field exists in target org
  2. Check field-level security permissions
  3. Confirm API name spelling
```

3. **Provide Alternatives**
```markdown
**Alternative Actions**:
1. Run diagnostic: `sf sobject describe Lead`
2. Check permissions: `sf org display user`
3. Contact administrator for field access
```

## Compliance Validation

### Automated Checks
All sub-agent outputs will be automatically scanned for:

1. **Suspicious Patterns**
   - Round percentages (15%, 20%, 25%, etc.)
   - Generic names (Lead 1, Lead 2, Opportunity 1)
   - Sequential IDs
   - Uniform timestamps

2. **Missing Metadata**
   - No query timestamps
   - No record counts
   - No data source declaration
   - No confidence scores

3. **Red Flags**
   - "Example 1:", "Example 2:" patterns
   - Lorem ipsum text
   - Test data indicators
   - Placeholder values

### Manual Review Triggers
Reports will be flagged for manual review if:
- More than 10% simulated data detected
- Query metadata missing
- Confidence score below 80%
- Pattern matching indicates synthetic data

## Implementation Guidelines

### For Agent Developers

1. **Use Safe Query Wrapper**
```javascript
const { SafeQueryExecutor } = require('./lib/safe-query-executor');

async function queryData(soql) {
  const executor = new SafeQueryExecutor();
  try {
    const result = await executor.executeQuery(soql);
    // Result includes both data and metadata
    return result;
  } catch (error) {
    // Never simulate on failure
    throw error;
  }
}
```

2. **Include Metadata in All Outputs**
```javascript
function formatFinding(data, metadata) {
  return {
    finding: data,
    source: metadata.dataSource,
    queryTime: metadata.timestamp,
    confidence: metadata.confidence,
    recordCount: metadata.recordCount
  };
}
```

3. **Label All Data Points**
```javascript
function formatDataPoint(value, source) {
  const prefix = source === 'LIVE' ? '✅ VERIFIED' : 
                 source === 'SIMULATED' ? '⚠️ SIMULATED' :
                 '❌ UNKNOWN';
  return `${prefix}: ${value}`;
}
```

### For Agent Users

1. **Verify Data Sources**: Always check the data source declaration at the top of reports
2. **Question Round Numbers**: Be suspicious of perfectly round percentages or counts
3. **Request Live Data**: If you see simulated data, request live query execution
4. **Check Timestamps**: Ensure queries were executed recently and during business hours

## Enforcement and Monitoring

### Automated Enforcement
- Pre-commit hooks validate agent outputs
- CI/CD pipeline includes data source verification
- Runtime monitoring detects simulation patterns

### Consequences of Non-Compliance
1. **First Violation**: Warning and education
2. **Second Violation**: Agent disabled pending fix
3. **Third Violation**: Complete audit and rewrite required

### Reporting Violations
Report suspected fake data generation:
- Slack: #data-integrity-alerts
- Email: data-integrity@revpal.com
- Issue Tracker: Label as "data-integrity-violation"

## Appendix A: Common Anti-Patterns

### ❌ DO NOT DO THIS:
```javascript
// Never default to fake data
if (!queryResult) {
  return {
    leads: [
      { name: "Lead 1", status: "New" },
      { name: "Lead 2", status: "Qualified" }
    ]
  };
}
```

### ✅ DO THIS INSTEAD:
```javascript
// Always fail explicitly
if (!queryResult) {
  throw new Error("Query failed: Unable to retrieve leads. MCP connection unavailable.");
}
```

### ❌ DO NOT DO THIS:
```javascript
// Never hide the data source
return {
  conversionRate: 0.15,  // Where did this come from?
  averageDealSize: 50000
};
```

### ✅ DO THIS INSTEAD:
```javascript
// Always include source metadata
return {
  conversionRate: {
    value: 0.1547,
    source: "LIVE_QUERY",
    query: "SELECT COUNT() FROM Lead WHERE Status='Converted'",
    timestamp: "2025-09-09T10:30:45Z",
    sampleSize: 1247
  }
};
```

## Appendix B: Verification Checklist

Before submitting any data-driven report, verify:

- [ ] Data source declared in header
- [ ] All queries include timestamps
- [ ] Record counts provided for samples
- [ ] No round percentages without explanation
- [ ] No generic names (Lead 1, Opportunity 2)
- [ ] Query failures explicitly documented
- [ ] Confidence scores included
- [ ] Metadata attached to all findings
- [ ] No unlabeled simulated data
- [ ] Audit trail complete

## Version History

- **v1.0.0** (2025-09-09): Initial release following NeonOne incident
- **Contributors**: Principal Engineer Agent System
- **Review Cycle**: Quarterly
- **Next Review**: 2025-12-09

---

**Remember**: Trust is earned through transparency. Every data point must be traceable to its source.