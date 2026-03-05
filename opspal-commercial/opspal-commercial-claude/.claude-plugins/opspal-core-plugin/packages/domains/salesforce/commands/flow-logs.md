---
description: Retrieve and parse Salesforce debug logs for Flow execution analysis
---

Retrieve and parse Salesforce debug logs to extract Flow execution details, identify errors, and analyze performance characteristics.

The log analysis will:
- **Retrieve debug logs** from Salesforce (latest or specific log ID)
- **Parse Flow execution events** (start, end, elements, decisions)
- **Extract errors and warnings** (validation, fatal, SOQL, DML)
- **Analyze governor limits** (CPU, heap, queries, DML statements)
- **Generate recommendations** based on error patterns and performance
- **Support batch processing** (parse multiple logs for trend analysis)

**Target Flow**: {flow-api-name} (optional filter)
**Target Org**: {org-alias} (optional, uses default if not specified)

**Options**:
- `--log-id <id>`: Specific log ID to parse (e.g., 07Lxx000000001)
- `--latest`: Get and parse the latest debug log for current user
- `--user <username>`: Get logs for specific user (requires admin)
- `--limit <n>`: Number of recent logs to retrieve (1-100, default: 1)
- `--filter-type <type>`: Filter by log type - `Workflow`, `Apex`, `All` (default: Workflow)
- `--errors-only`: Extract only Flow errors, skip full parsing
- `--json`: Output results as JSON instead of markdown

**Output Location**: `instances/{org-alias}/flow-diagnostics/{flow-name}/logs-{timestamp}/`

**Generated Artifacts**:
- Parsed log (JSON with Flow executions, errors, limits)
- Error analysis (Markdown with recommendations)
- Performance report (execution timing, resource usage)
- Trend analysis (if multiple logs parsed)

**Runbook Reference**: See [Runbook 7, Section 3](../../docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md#section-3-result-capture-and-analysis)

**Estimated Duration**: 15-30 seconds per log

**Exit Codes**:
- `0` - Log parsed successfully
- `1` - Log retrieval or parsing failed
- `2` - Log contains errors (parsed successfully but Flow had errors)

**Examples**:

**Parse Latest Log**:
```bash
# Get and parse the most recent debug log
/flow-logs neonone --latest

# Filter for specific Flow
/flow-logs Account_Validation_Flow neonone --latest
```

**Parse Specific Log**:
```bash
# Parse by log ID
/flow-logs neonone --log-id 07Lxx000000001ABC

# With error extraction only
/flow-logs neonone --log-id 07Lxx000000001ABC --errors-only
```

**Batch Processing**:
```bash
# Parse last 10 logs for trend analysis
/flow-logs Account_Validation_Flow neonone --limit 10

# Get logs for specific user
/flow-logs neonone --user test.user@example.com --limit 5
```

**JSON Output for Automation**:
```bash
# CI/CD integration
/flow-logs neonone --latest --json > flow-execution-log.json

# Check for errors programmatically
ERROR_COUNT=$(cat flow-execution-log.json | jq '.errors | length')
if [ $ERROR_COUNT -gt 0 ]; then
  echo "Flow execution had $ERROR_COUNT errors"
  exit 1
fi
```

**Programmatic Usage**:
```javascript
// Direct script invocation
const { FlowLogParser } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-log-parser');
const parser = new FlowLogParser('neonone', { verbose: true });

// Parse latest log
const latest = await parser.getLatestLog('', { filterByType: 'Workflow' });
const parsed = await parser.parseLog(latest[0].Id);

console.log('Flow Executions:', parsed.flowExecutions.length);
console.log('Errors:', parsed.errors.length);
console.log('CPU Time:', parsed.governorLimits.cpuTimeUsed + 'ms');
```

**What Gets Extracted**:

1. **Flow Execution Details**
   - Flow API name and version
   - Start/end timestamps
   - Interview ID (unique execution identifier)
   - Elements executed (in order)
   - Execution duration

2. **Decision Outcomes**
   - Decision element names
   - Conditions evaluated
   - Branches taken (true/false/default)
   - Values at decision time

3. **Variable Assignments**
   - Variable names
   - Values assigned
   - Data types
   - Assignment timing

4. **SOQL Queries**
   - Query text
   - Row counts returned
   - Execution time
   - Selective filter warnings

5. **DML Operations**
   - Operation type (Insert, Update, Delete)
   - Object names
   - Record counts
   - Success/failure status

6. **Governor Limits**
   - CPU time (used/limit)
   - Heap size (used/limit)
   - SOQL queries (count/limit)
   - DML statements (count/limit)
   - DML rows (count/limit)

7. **Errors and Warnings**
   - Validation rule failures
   - Fatal errors (DML exceptions, null pointers)
   - SOQL errors (invalid queries, row limits)
   - Formula evaluation errors
   - Custom error messages

**Error Pattern Recommendations**:

| Error Pattern | Recommendation |
|---------------|----------------|
| FIELD_CUSTOM_VALIDATION_EXCEPTION | Validation rule blocking Flow - review rule logic or disable for testing |
| System.DmlException | DML operation failed - check required fields and permissions |
| System.NullPointerException | Null reference - add null checks before field access |
| System.QueryException | SOQL error - validate query syntax and field access |
| CPU_TIME_LIMIT_EXCEEDED | Optimize Flow logic - reduce loops, bulkify operations |
| HEAP_SIZE_EXCEEDED | Memory issue - process fewer records per transaction |

**Post-Analysis Commands**:
```bash
# View parsed log summary
cat instances/{org-alias}/flow-diagnostics/logs-latest/summary.md

# View errors only
cat instances/{org-alias}/flow-diagnostics/logs-latest/parsed.json | jq '.errors'

# View governor limit usage
cat instances/{org-alias}/flow-diagnostics/logs-latest/parsed.json | jq '.governorLimits'

# View recommendations
cat instances/{org-alias}/flow-diagnostics/logs-latest/recommendations.md
```

**Trend Analysis** (multiple logs):
```bash
# Parse last 10 executions
/flow-logs Account_Validation_Flow neonone --limit 10

# View trends
cat instances/{org-alias}/flow-diagnostics/{flow-name}/logs-batch-latest/trends.json | jq '{
  avgCpuTime: .avgCpuTime,
  avgErrors: .avgErrors,
  successRate: .successRate
}'
```

**Integration with Other Commands**:
```bash
# Full diagnostic workflow
/flow-preflight Account_Validation_Flow neonone --object Account --trigger-type after-save
/flow-test Account_Validation_Flow neonone --type record-triggered --object Account --operation insert --data '{"Name":"Test"}'
/flow-logs Account_Validation_Flow neonone --latest  # Automatically gets log from test execution
```

**Use the flow-log-parser script to retrieve and parse debug logs for the {flow-api-name} Flow (or all Flows) on the {org-alias} Salesforce org. Extract execution details, errors, and performance metrics for analysis.**
