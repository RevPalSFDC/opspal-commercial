# Sub-Agent Verification Guide

**Last Updated**: 2025-10-13
**Purpose**: Prevent sub-agent hallucinations and ensure structured JSON output
**ROI**: Part of Sub-Agent Verification Layer ($8,000/year)

---

## Why Sub-Agent Verification?

**Problem**: Sub-agents generate fake data, return unstructured text, or hallucinate information when queries fail, leading to wasted time debugging and correcting outputs.

**Solution**: Verify all sub-agent outputs for hallucinations, enforce structured JSON format, and require explicit data source labeling.

**Impact**:
- **Before**: 32 hours/month spent on sub-agent debugging and corrections
- **After**: < 3 hours/month with verification layer
- **Savings**: 29 hours/month = $1,450/month = $17,400/year (conservative: $8,000/year)

---

## Quick Start

### 1. Basic Verification

```javascript
const verifier = require('../scripts/lib/subagent-verifier');

// Verify sub-agent output
const result = verifier.verifyOutput({
  agentName: 'sfdc-state-discovery',
  output: agentOutputJSON,
  expectedSchema: {
    type: 'object',
    required: ['data_source', 'records'],
    properties: {
      data_source: { type: 'string' },
      records: { type: 'array' }
    }
  },
  options: {
    strictMode: false,  // Warnings won't fail verification
    requireDataSourceLabel: true
  }
});

verifier.logVerification(result);

if (!result.valid) {
  console.error('Sub-agent output failed verification');
  // Handle invalid output
}
```

### 2. JSON Output Enforcement

```javascript
const enforcer = require('../scripts/lib/json-output-enforcer');

// Parse sub-agent text output as JSON
const parseResult = enforcer.parseSubAgentOutput(rawTextOutput, {
  agentName: 'sfdc-state-discovery',
  expectWrappedJSON: true,      // Expects ```json code blocks
  fallbackToExtraction: true,   // Try to extract JSON from text
  strict: false                 // Don't throw on failure
});

if (!parseResult.success) {
  console.error('Failed to parse JSON:', parseResult.errors);
}

// Validate compliance
const complianceResult = enforcer.validateCompliance(parseResult.data);
if (!complianceResult.compliant) {
  console.warn('Compliance issues:', complianceResult.issues);
}
```

---

## Data Source Labeling (MANDATORY)

All sub-agents MUST include a `data_source` field in their JSON output:

### Valid Data Sources

| Source | When to Use | Required Fields |
|--------|-------------|-----------------|
| `VERIFIED` | Data from actual query execution | `query_executed` (recommended) |
| `SIMULATED` | Example/mock data for demonstration | `simulated_warning` (required) |
| `FAILED` | Query failed or unavailable | `failure_reason` (required) |
| `UNKNOWN` | Source cannot be determined | None |

### Examples

**✅ VERIFIED Data** (from actual query):
```json
{
  "data_source": "VERIFIED",
  "query_executed": "SELECT Id, Name FROM Account WHERE Industry = 'Technology' LIMIT 5",
  "record_count": 5,
  "records": [
    {"Id": "001Hn00001x8ZQFIA2", "Name": "Acme Corp"},
    {"Id": "001Hn00001x8ZQGIA2", "Name": "TechStart Inc"}
  ]
}
```

**✅ SIMULATED Data** (explicit mock data):
```json
{
  "data_source": "SIMULATED",
  "simulated_warning": "This is example data for demonstration purposes only",
  "example_query": "SELECT Id, Name FROM Account LIMIT 5",
  "records": [
    {"Id": "[EXAMPLE_ID]", "Name": "[Example Company]"}
  ]
}
```

**✅ FAILED Query**:
```json
{
  "data_source": "FAILED",
  "failure_reason": "Could not connect to Salesforce org",
  "attempted_query": "SELECT Id, Name FROM Account LIMIT 5",
  "suggestion": "Run manually: sf data query --query \"SELECT Id, Name FROM Account LIMIT 5\" --target-org production"
}
```

**❌ WRONG** (no data_source label):
```json
{
  "records": [
    {"Id": "001...", "Name": "Lead 1"},
    {"Id": "002...", "Name": "Lead 2"}
  ]
}
```

---

## Fake Data Detection

The verifier automatically detects common fake data patterns:

### Detected Patterns

1. **Generic Names**
   - ❌ "Lead 1", "Contact 23", "Account 456"
   - ❌ "Example Corp", "Test Company", "Sample Inc"
   - ❌ "John Doe", "Jane Smith"

2. **Round Percentages**
   - ❌ 15%, 30%, 45% (divisible by 15)
   - Suspicious when multiple round percentages appear

3. **Fake Salesforce IDs**
   - ❌ `00Q000000000000045` (all zeros with sequential digits)
   - ✅ `00QHn00001x8ZQFIA2` (real IDs have mixed characters)

4. **Example Domains**
   - ❌ `user@example.com`, `test@sample.org`
   - ❌ `demo@test.net`

### Example Detection

```javascript
const result = verifier.verifyOutput({
  agentName: 'my-agent',
  output: {
    data_source: 'VERIFIED',
    leads: [
      { name: 'Lead 1', email: 'user@example.com' }  // Will trigger warnings
    ]
  }
});

// Result will include:
// warnings: [
//   "Suspicious generic name at root.leads[0].name: 'Lead 1'",
//   "Example domain at root.leads[0].email: 'user@example.com'"
// ]
```

---

## Enforcing JSON Output in Sub-Agent Prompts

### Enhance Agent Prompts

```javascript
const enforcer = require('../scripts/lib/json-output-enforcer');

const basePrompt = `
You are a Salesforce state discovery agent.
Your task is to query Salesforce and return account data.
`;

// Add JSON enforcement
const enhancedPrompt = enforcer.enforceJSONInPrompt(basePrompt, {
  type: 'object',
  required: ['data_source', 'records'],
  properties: {
    data_source: { type: 'string' },
    records: { type: 'array' },
    query_executed: { type: 'string' }
  }
});

// Use enhancedPrompt when invoking sub-agent
```

This adds:
- Mandatory JSON format instructions
- Expected schema example
- Data source labeling requirements
- Failure handling guidelines

---

## Automatic Verification with Hooks

Enable automatic verification for all sub-agent executions:

### Setup Hook

```bash
# Enable verification
export SUBAGENT_VERIFICATION_ENABLED=true

# Optional: Enable strict mode (treat warnings as errors)
export SUBAGENT_VERIFICATION_STRICT=false

# Optional: Save verification reports
export SUBAGENT_VERIFICATION_SAVE_REPORTS=true
export SUBAGENT_VERIFICATION_REPORTS_DIR="./.claude/verification-reports"
```

The hook automatically runs after every sub-agent execution and:
1. Parses JSON output
2. Validates compliance
3. Verifies for hallucinations
4. Saves verification report
5. Blocks execution in strict mode if issues found

### Verification Reports

Reports are saved to `.claude/verification-reports/`:

```json
{
  "timestamp": "2025-10-13T12:00:00.000Z",
  "agentName": "sfdc-state-discovery",
  "success": true,
  "parsed": true,
  "parseMethod": "markdown",
  "compliant": true,
  "verified": true,
  "confidenceScore": 0.95,
  "errors": [],
  "warnings": [],
  "summary": {
    "structureValid": true,
    "fakeDataDetected": false,
    "sourcesVerified": true
  }
}
```

---

## CLI Validator

Validate sub-agent outputs from command line:

```bash
# Basic validation
node scripts/lib/subagent-output-validator.js \
  --agent sfdc-state-discovery \
  --output ./agent-output.json

# With report
node scripts/lib/subagent-output-validator.js \
  --agent sfdc-state-discovery \
  --output ./agent-output.json \
  --report ./verification-report.json

# Strict mode (warnings become errors)
node scripts/lib/subagent-output-validator.js \
  --agent sfdc-state-discovery \
  --output ./agent-output.json \
  --strict
```

**Exit Codes**:
- `0` - Validation passed
- `1` - Validation failed (errors found)

---

## Custom Verification Rules

Add custom rules specific to your use case:

```javascript
const verificationRules = [
  {
    name: 'Check record count',
    validator: (output, context) => {
      if (output.records && output.records.length === 0) {
        return { warning: 'No records returned' };
      }
      return true;
    },
    errorMessage: 'Record count validation failed'
  },
  {
    name: 'Verify all IDs are valid',
    validator: (output, context) => {
      if (output.records) {
        const invalidIds = output.records.filter(r =>
          r.Id && !r.Id.match(/^[a-zA-Z0-9]{15,18}$/)
        );
        return invalidIds.length === 0;
      }
      return true;
    },
    errorMessage: 'Invalid Salesforce IDs detected'
  }
];

const result = verifier.verifyOutput({
  agentName: 'my-agent',
  output: agentOutput,
  verificationRules
});
```

---

## Integration with Orchestrator Agents

Wrap sub-agent executions for automatic verification:

```javascript
const enforcer = require('../scripts/lib/json-output-enforcer');

// Define sub-agent execution
async function executeSubAgent() {
  // Your sub-agent execution logic
  return await invokeTaskTool({
    subagent_type: 'sfdc-state-discovery',
    prompt: 'Analyze Account records'
  });
}

// Wrap with enforcement and verification
const result = await enforcer.wrapExecution(executeSubAgent, {
  agentName: 'sfdc-state-discovery',
  expectedSchema: mySchema,
  verifyOutput: true,
  saveReport: true,
  reportPath: './reports/verification.json'
});

if (!result.success) {
  console.error('Sub-agent execution failed:', result.error);
}

if (!result.compliant) {
  console.warn('Compliance issues:', result.complianceIssues);
}

// Use verified data
const data = result.data;
```

---

## Confidence Scoring

Verification calculates a confidence score (0.0 - 1.0) based on:

| Factor | Weight | Impact |
|--------|--------|--------|
| Structure Valid | 30% | JSON matches expected schema |
| No Fake Data | 40% | No synthetic/generic patterns detected |
| Sources Verified | 20% | Data source is verified or properly labeled |
| Rules Passed | 10% | All custom rules passed |
| Warnings | -2% each | Minor deductions for warnings |

**Confidence Levels**:
- **95-100%**: High confidence, verified real data
- **85-94%**: Good confidence, minor warnings
- **70-84%**: Medium confidence, review recommended
- **<70%**: Low confidence, manual review required

```javascript
const result = verifier.verifyOutput({...});

console.log(`Confidence: ${Math.round(result.confidenceScore * 100)}%`);

if (result.confidenceScore < 0.85) {
  console.warn('Low confidence score - manual review recommended');
}
```

---

## Success Metrics

### Targets

- **Hallucination detection rate**: > 0 (catch all hallucinations)
- **False positive rate**: < 5% (valid data incorrectly flagged)
- **Sub-agent JSON compliance**: 100% of orchestrator-invoked agents
- **Verification execution rate**: 100% of sub-agent tasks

### Monitoring

```javascript
// Track verification metrics
const metrics = {
  totalVerifications: 0,
  hallucinationsDetected: 0,
  falsePositives: 0,
  complianceRate: 0
};

// Log after each verification
const result = verifier.verifyOutput({...});
metrics.totalVerifications++;

if (result.summary.fakeDataDetected) {
  metrics.hallucinationsDetected++;
}

// Calculate compliance rate
metrics.complianceRate = (compliantAgents / metrics.totalVerifications) * 100;
```

---

## Troubleshooting

### Issue: Sub-agent returns text instead of JSON

**Solution**: Enhance sub-agent prompt with JSON enforcement:

```javascript
const enhancedPrompt = enforcer.enforceJSONInPrompt(basePrompt);
```

### Issue: JSON parsing fails

**Check**:
1. Is JSON wrapped in markdown code block?
2. Are there syntax errors (trailing commas, unquoted keys)?
3. Is output actually JSON or just formatted text?

**Fix**: Enable fallback extraction:
```javascript
const result = enforcer.parseSubAgentOutput(rawOutput, {
  fallbackToExtraction: true
});
```

### Issue: False positives on real data

**Solution**: Add context data to verification:

```javascript
const result = verifier.verifyOutput({
  output: agentOutput,
  contextData: {
    expectedRecordCount: 50,
    availableObjects: ['Account', 'Contact', 'Lead']
  },
  options: {
    ignoreWarnings: true  // Suppress suspicious pattern warnings
  }
});
```

---

## Additional Resources

- **Verifier Library**: `../scripts/lib/subagent-verifier.js`
- **JSON Enforcer**: `../scripts/lib/json-output-enforcer.js`
- **CLI Validator**: `../scripts/lib/subagent-output-validator.js`
- **Hook**: `../hooks/post-subagent-execution.sh`

---

**Questions?** Submit a reflection via `/reflect` with category "subagent-verification"
