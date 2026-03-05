---
description: Execute Salesforce Flow with test data and capture execution results
---

Execute a Salesforce Flow with test data and capture comprehensive execution results including state changes, debug logs, and performance metrics.

The test execution will:
- **Execute Flow** with specified test data (insert, update, delete operations)
- **Capture before/after state** for record-triggered Flows
- **Retrieve debug logs** automatically after execution
- **Parse execution details** (elements executed, decisions made, errors)
- **Generate execution report** with recommendations
- **Clean up test records** automatically (optional)

**Target Flow**: {flow-api-name}
**Target Org**: {org-alias} (optional, uses default if not specified)

**Flow Types Supported**:
- **Record-Triggered**: Insert, update, delete operations with test records
- **Scheduled**: On-demand execution without scheduling
- **Screen**: Interactive testing with input variables and screen responses
- **Auto-Launched**: Direct invocation with input variables

**Options** (required for execution):
- `--type <flow-type>`: Flow type - `record-triggered`, `scheduled`, `screen`, `auto-launched`
- `--object <ObjectName>`: Object API name (for record-triggered)
- `--operation <op>`: Operation - `insert`, `update`, `delete` (for record-triggered)
- `--data '<JSON>'`: Test record data as JSON string
- `--record-id <id>`: Existing record ID (for update/delete operations)
- `--inputs '<JSON>'`: Input variables as JSON (for auto-launched/screen Flows)
- `--keep-records`: Don't clean up test records after execution

**Output Location**: `instances/{org-alias}/flow-diagnostics/{flow-name}/execution-{timestamp}/`

**Generated Artifacts**:
- Execution result (JSON with execution ID, success status, timing)
- State diff report (before/after comparison for record-triggered)
- Debug log (parsed with Flow events, errors, governor limits)
- Recommendations (optimization suggestions, error fixes)

**Runbook Reference**: See [Runbook 7, Section 2](../../docs/runbooks/flow-xml-development/07-testing-and-diagnostics.md#section-2-execution-strategies)

**Estimated Duration**: 30 seconds - 2 minutes (depends on Flow complexity)

**Exit Codes**:
- `0` - Flow executed successfully
- `1` - Flow execution failed
- `2` - Execution succeeded with warnings (governor limit warnings, etc.)

**Examples**:

**Record-Triggered Flow (Insert)**:
```bash
# Insert new Account record
/flow-test Account_Validation_Flow neonone \
  --type record-triggered \
  --object Account \
  --operation insert \
  --data '{"Name":"Test Account","Type":"Customer","Industry":"Technology"}'
```

**Record-Triggered Flow (Update)**:
```bash
# Update existing Account
/flow-test Account_Validation_Flow neonone \
  --type record-triggered \
  --object Account \
  --operation update \
  --record-id 001xx000000XXXX \
  --data '{"Status__c":"Active","Rating":"Hot"}'
```

**Auto-Launched Flow**:
```bash
# Execute with input variables
/flow-test Calculate_Discount_Flow neonone \
  --type auto-launched \
  --inputs '{"OrderAmount":1000,"CustomerTier":"Gold"}'
```

**Screen Flow**:
```bash
# Interactive screen Flow
/flow-test Lead_Qualification_Flow neonone \
  --type screen \
  --inputs '{"LeadId":"00Qxx000000YYYY"}' \
  --screens '{"Screen1":{"Industry":"Technology","Budget":"100000"}}'
```

**Programmatic Usage**:
```javascript
// Direct script invocation
const { FlowExecutor } = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-executor');
const executor = new FlowExecutor('neonone', { verbose: true });

const result = await executor.executeRecordTriggeredFlow('Account_Validation_Flow', {
  object: 'Account',
  triggerType: 'after-save',
  operation: 'insert',
  recordData: {
    Name: 'Test Account',
    Type: 'Customer'
  }
});

console.log('Execution ID:', result.executionId);
console.log('Success:', result.success);
console.log('Duration:', result.executionDuration + 'ms');
```

**What Gets Captured**:

1. **Execution Metadata**
   - Execution ID (unique identifier)
   - Start/end timestamps
   - Duration (milliseconds)
   - Success status

2. **State Changes** (record-triggered only)
   - Before snapshot (all fields)
   - After snapshot (all fields)
   - Diff analysis (changed fields, magnitude, related records)

3. **Debug Log Analysis**
   - Flow start/end markers
   - Elements executed (assignments, decisions, loops, subflows)
   - Decision outcomes (which branches taken)
   - SOQL queries and DML operations
   - Governor limits (CPU, heap, queries, DML)
   - Errors and warnings

4. **Performance Metrics**
   - Total execution time
   - Time per element
   - Database operation counts
   - API call counts

5. **Recommendations**
   - Governor limit warnings (if >80% usage)
   - Optimization suggestions (bulkification, query optimization)
   - Error resolution steps
   - Best practice violations

**Post-Execution Commands**:
```bash
# View execution result
cat instances/{org-alias}/flow-diagnostics/{flow-name}/execution-latest/result.json | jq

# View state diff
cat instances/{org-alias}/flow-diagnostics/{flow-name}/execution-latest/state-diff.md

# View debug log
cat instances/{org-alias}/flow-diagnostics/{flow-name}/execution-latest/debug-log.json | jq '.flowExecutions[0]'

# View recommendations
cat instances/{org-alias}/flow-diagnostics/{flow-name}/execution-latest/recommendations.md
```

**Multiple Test Executions**:
```bash
# Run 3 test cases sequentially
for status in "Active" "Inactive" "Pending"; do
  /flow-test Account_Status_Flow neonone \
    --type record-triggered \
    --object Account \
    --operation insert \
    --data "{\"Name\":\"Test $status\",\"Status__c\":\"$status\"}"
done
```

**Integration with Coverage Analysis**:
```bash
# After multiple executions, run coverage analysis
/flow-diagnose Account_Status_Flow neonone --type coverage
```

**Use the flow-executor script to execute the {flow-api-name} Flow on the {org-alias} Salesforce org with the specified test data. Capture execution results, state changes, and debug logs for analysis.**
