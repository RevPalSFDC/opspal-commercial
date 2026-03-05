# Orchestrator Agent - Sub-Agent Verification Requirements

**Reference for**: Orchestrator agents that invoke sub-agents via Task tool

**Purpose**: Ensure all sub-agent outputs are verified for hallucinations and data quality

---

## MANDATORY: Sub-Agent Verification Protocol

All orchestrator agents that invoke sub-agents via the Task tool MUST follow this verification protocol.

### Required Integration

Add to agent backstory/instructions:

```markdown
## Sub-Agent Verification (MANDATORY)

**ALWAYS verify sub-agent outputs** to prevent hallucinations and ensure data quality.

Reference documentation: @import ../docs/SUBAGENT_VERIFICATION_GUIDE.md

### Required Pattern for Sub-Agent Invocation

\`\`\`javascript
const enforcer = require('../scripts/lib/json-output-enforcer');
const verifier = require('../scripts/lib/subagent-verifier');

// Wrap sub-agent execution
const result = await enforcer.wrapExecution(
  async () => {
    return await Task({
      subagent_type: 'sub-agent-name',
      prompt: 'Task description',
      description: 'Short task description'
    });
  },
  {
    agentName: 'sub-agent-name',
    expectedSchema: {
      type: 'object',
      required: ['data_source', 'records'],
      properties: {
        data_source: { type: 'string' },
        records: { type: 'array' }
      }
    },
    verifyOutput: true,
    saveReport: true,
    reportPath: './reports/verification-{agent-name}-{timestamp}.json'
  }
);

// Check verification result
if (!result.success) {
  console.error(`❌ Sub-agent ${result.agentName} failed:`, result.error);
  // Handle failure appropriately
}

if (!result.verified) {
  console.warn(`⚠️  Sub-agent ${result.agentName} output has verification issues`);
  console.warn('Issues:', result.verificationSummary);
  // Decide whether to proceed or fail
}

// Use verified data
const data = result.data;
\`\`\`

### Critical Rules
1. **ALWAYS use enforcer.wrapExecution()** - Never invoke sub-agents without verification
2. **ALWAYS check result.success** - Handle failed sub-agent executions
3. **ALWAYS check result.verified** - Review verification warnings
4. **ALWAYS save reports** - Enable saveReport for traceability
5. **NEVER use unverified data** - Only proceed if result.success === true
```

---

## Example: SFDC State Discovery Orchestrator

```markdown
---
name: sfdc-state-orchestrator
description: Orchestrates multiple SFDC state discovery sub-agents
tools: Task, Read, Write, TodoWrite
---

# SFDC State Discovery Orchestrator

You orchestrate multiple Salesforce state discovery agents to build a comprehensive org analysis.

## Sub-Agent Verification (MANDATORY)

**ALWAYS verify sub-agent outputs** to prevent hallucinations and ensure data quality.

Reference documentation: @import ../docs/SUBAGENT_VERIFICATION_GUIDE.md

### Sub-Agents Invoked

This orchestrator invokes the following sub-agents:
- `sfdc-state-discovery` - Object and field analysis
- `sfdc-automation-auditor` - Workflow and process discovery
- `sfdc-security-analyzer` - Permission and sharing analysis

### Verification Pattern

\`\`\`javascript
const enforcer = require('../scripts/lib/json-output-enforcer');

// Invoke sub-agent with verification
async function discoverOrgState() {
  const result = await enforcer.wrapExecution(
    async () => {
      return await Task({
        subagent_type: 'sfdc-state-discovery',
        prompt: 'Analyze all custom objects and fields in the org',
        description: 'SFDC org state discovery'
      });
    },
    {
      agentName: 'sfdc-state-discovery',
      expectedSchema: {
        type: 'object',
        required: ['data_source', 'objects', 'fields'],
        properties: {
          data_source: { type: 'string' },
          objects: { type: 'array' },
          fields: { type: 'array' },
          query_executed: { type: 'string' }
        }
      },
      verifyOutput: true,
      saveReport: true,
      reportPath: './reports/sfdc-state-discovery-verification.json'
    }
  );

  if (!result.success) {
    throw new Error(\`SFDC state discovery failed: \${result.error}\`);
  }

  if (!result.verified) {
    console.warn('⚠️  State discovery output has verification issues');
    console.warn('Confidence:', result.verificationSummary.confidenceScore);
  }

  return result.data;
}
\`\`\`

### Handling Verification Failures

\`\`\`javascript
// Attempt sub-agent execution with verification
try {
  const stateData = await discoverOrgState();

  // Use verified data
  console.log(\`Found \${stateData.objects.length} custom objects\`);

} catch (error) {
  console.error('State discovery failed:', error.message);

  // Provide fallback or manual instructions
  console.log('Manual fallback:');
  console.log('1. Run: sf sobject list --sobject-type custom');
  console.log('2. Review results manually');

  // Do NOT proceed with unverified data
  throw error;
}
\`\`\`
```

---

## Verification Report Structure

Reports saved to `./reports/verification-{agent}-{timestamp}.json`:

```json
{
  "timestamp": "2025-10-13T12:00:00.000Z",
  "agentName": "sfdc-state-discovery",
  "success": true,
  "parsed": true,
  "parseMethod": "markdown",
  "compliant": true,
  "complianceIssues": [],
  "verified": true,
  "confidenceScore": 0.95,
  "errors": [],
  "warnings": [],
  "verificationSummary": {
    "structureValid": true,
    "fakeDataDetected": false,
    "sourcesVerified": true
  },
  "data": {
    "data_source": "VERIFIED",
    "objects": [...],
    "query_executed": "..."
  }
}
```

---

## Benefits of Verification

1. **Prevent Hallucinations**: Catch fake data before it's used
2. **Ensure Data Quality**: Verify data source and structure
3. **Traceability**: Verification reports for debugging
4. **Confidence Scoring**: Know reliability of sub-agent outputs
5. **Automatic Detection**: No manual checking required

---

## Success Metrics

Track orchestrator-level verification:

```javascript
// Orchestrator-level metrics
const metrics = {
  subAgentsInvoked: 0,
  verificationsPassed: 0,
  verificationsFailed: 0,
  hallucinationsDetected: 0
};

// After each sub-agent invocation
const result = await enforcer.wrapExecution(...);
metrics.subAgentsInvoked++;

if (result.verified) {
  metrics.verificationsPassed++;
} else {
  metrics.verificationsFailed++;
}

if (result.verificationSummary?.fakeDataDetected) {
  metrics.hallucinationsDetected++;
}

// Report at end
console.log('📊 Verification Summary:');
console.log(\`  Sub-agents invoked: \${metrics.subAgentsInvoked}\`);
console.log(\`  Verifications passed: \${metrics.verificationsPassed}\`);
console.log(\`  Hallucinations detected: \${metrics.hallucinationsDetected}\`);
```

---

**Questions?** See full documentation at `../docs/SUBAGENT_VERIFICATION_GUIDE.md`
