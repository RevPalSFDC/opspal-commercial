# Sub-Agent Data Integrity Framework

## Overview

This document provides comprehensive guidance on preventing sub-agents from generating fake data and ensuring all data operations are transparent, traceable, and verifiable.

## The Problem

During the NeonOne RevOps assessment, the `sfdc-revops-auditor` agent generated simulated data (with suspiciously round percentages like 15%, 30%) instead of executing real queries against the Salesforce org. This occurred because:

1. MCP tools were not accessible to the sub-agent
2. The agent silently defaulted to generating example data
3. No error was reported about the query failure
4. The simulated data was presented as if it were real

## The Solution Framework

### 1. Prevention Layer

#### Preflight Validation
Before any sub-agent execution involving data queries:

```bash
# Full validation
node scripts/preflight-data-validator.js all

# Quick check for CI/CD
node scripts/preflight-data-validator.js quick
```

This validates:
- MCP server availability
- Authentication status
- Query capabilities
- Permission levels

#### Safe Query Executor
All data queries must use the SafeQueryExecutor wrapper:

```javascript
const { SafeQueryExecutor } = require('./scripts/lib/safe-query-executor');

async function queryLeads() {
  const executor = new SafeQueryExecutor({
    enforceRealData: true,  // Never simulate
    requireMetadata: true,   // Always include metadata
    logQueries: true        // Full audit trail
  });
  
  try {
    const result = await executor.executeQuery(
      'SELECT Id, Name, Status FROM Lead LIMIT 100'
    );
    
    // Result includes data + metadata
    console.log(`Source: ${result.dataSourceLabel}`);
    console.log(`Records: ${result.metadata.recordCount}`);
    console.log(`Confidence: ${result.confidence}`);
    
    return result;
  } catch (error) {
    // Query failed - handle appropriately
    console.error('Query failed:', error.message);
    throw error;  // Never default to fake data
  }
}
```

### 2. Detection Layer

#### Real-Time Monitoring
Monitor sub-agent execution in real-time:

```javascript
const SubagentErrorMonitor = require('./scripts/subagent-error-monitor');

const monitor = new SubagentErrorMonitor({
  alertThreshold: 'WARNING',
  realTimeMonitoring: true
});

// Start monitoring
const monitorId = await monitor.startMonitoring('sfdc-revops-auditor');

// Process output as it comes
monitor.on('issue:detected', (event) => {
  console.error(`Issue in ${event.agentName}: ${event.issue.message}`);
});

// Generate report when done
const report = await monitor.stopMonitoring(monitorId);
```

#### Pattern Detection
The framework detects these patterns indicating fake data:

**Critical Patterns:**
- Generic naming: `Lead 1`, `Opportunity 23`, `Account 45`
- Fake IDs: `00Q000000000000045`, `006000000000000023`
- Round percentages: `15.0%`, `30.0%`, `45.0%`
- Example indicators: `Example 1:`, `Sample data`, `Demo`

**Query Absence Indicators:**
- No `SELECT` statements in output
- No mention of `mcp_salesforce` tool usage
- No query execution timestamps
- No record count reporting

### 3. Enforcement Layer

#### Agent Configuration
All data-querying agents must include:

```yaml
# In agent YAML/MD configuration
critical_requirements:
  data_integrity:
    - NEVER generate fake/example data without explicit disclosure
    - ALWAYS report query failures with detailed error messages
    - MUST prefix simulated data with "⚠️ SIMULATED DATA:"
    - REQUIRED to log all query attempts with timestamps
    
tools:
  - mcp_salesforce_data_query  # Primary method
  - mcp_salesforce             # Fallback
  # CLI tools only as last resort with explicit notification
```

#### Post-Execution Validation
Automatic validation after agent execution:

```bash
# Hook automatically runs after agent execution
.claude/hooks/post-execution-validator.sh [output-file] [agent-name]
```

This checks for:
- Simulated data patterns
- Missing query evidence
- Data source declarations
- Suspicious patterns

### 4. Transparency Layer

#### Mandatory Data Labels
Every data point must be labeled:

```markdown
✅ VERIFIED: Account "Acme Corp" - $1,234,567.89 (ID: 001xx000003DHP0)
Source: Live Salesforce Query
Query Time: 2025-09-09T10:30:45Z
Records: 247 of 15,234 analyzed

⚠️ SIMULATED: Example Account "Tech Co" - $100,000
Reason: Demonstration requested by user
Based On: Typical B2B SaaS pattern

❌ FAILED: Unable to retrieve Opportunity data
Error: INSUFFICIENT_ACCESS_RIGHTS
Query: SELECT Amount FROM Opportunity
Action: Request admin to grant read access to Opportunity object
```

#### Report Headers
All reports must begin with:

```markdown
## Data Source Declaration
- **Primary Data Source**: LIVE/SIMULATED/FAILED
- **Query Execution Time**: 2025-09-09T10:30:45Z
- **Instance**: neonone-production
- **Verification Status**: VERIFIED
- **Total Queries**: 15
- **Failed Queries**: 0
```

## Implementation Guide

### Step 1: Update Agent Instructions

Add to all data-querying agents:

```markdown
## CRITICAL DATA INTEGRITY PROTOCOL

### MANDATORY Rules
1. NEVER generate synthetic data as substitute for real queries
2. ALWAYS fail explicitly if queries cannot execute
3. MUST include query metadata in all outputs
4. REQUIRED to use data source labels

### Query Failure Protocol
If query fails:
1. STOP execution immediately
2. REPORT specific error
3. DO NOT continue with simulated data
```

### Step 2: Implement Monitoring

```javascript
// In your agent orchestration code
const { spawn } = require('child_process');
const monitor = require('./scripts/subagent-error-monitor');

async function executeAgent(agentName, prompt) {
  // Start monitoring
  const monitorId = await monitor.startMonitoring(agentName);
  
  // Execute agent
  const proc = spawn('claude', ['agent', agentName, prompt]);
  
  // Monitor output
  proc.stdout.on('data', (data) => {
    monitor.processOutput(monitorId, data.toString());
  });
  
  // Check results
  const report = await monitor.stopMonitoring(monitorId);
  if (report.health === 'CRITICAL') {
    throw new Error('Data integrity violation detected');
  }
}
```

### Step 3: Add Validation Hooks

```json
// In .claude/settings.json
{
  "hooks": {
    "post-execution": ".claude/hooks/post-execution-validator.sh"
  }
}
```

### Step 4: Regular Auditing

```bash
# Weekly audit of agent outputs
for file in logs/*.json; do
  node scripts/subagent-query-verifier.js analyze "$file"
done

# Generate compliance report
node scripts/subagent-query-verifier.js report
```

## Testing the Framework

### Test Scenario 1: Valid Query Execution

```javascript
// Test with real query
const executor = new SafeQueryExecutor();
const result = await executor.executeQuery('SELECT Id FROM User LIMIT 1');
assert(result.verified === true);
assert(result.dataSourceLabel.includes('VERIFIED'));
```

### Test Scenario 2: Query Failure Handling

```javascript
// Test with invalid query
const executor = new SafeQueryExecutor();
try {
  await executor.executeQuery('SELECT InvalidField FROM InvalidObject');
  assert.fail('Should have thrown error');
} catch (error) {
  assert(error.name === 'QueryExecutionError');
  assert(error.execution.dataSource === 'QUERY_FAILED');
}
```

### Test Scenario 3: Pattern Detection

```bash
# Create test file with fake data
echo "Lead 1, Lead 2, Opportunity 45" > test.txt
echo "Conversion rate: 30%" >> test.txt

# Run validation
node scripts/subagent-query-verifier.js analyze test.txt

# Should detect:
# - Generic naming patterns
# - Suspicious round percentages
```

## Rollout Plan

### Phase 1: Immediate (Day 1)
- ✅ Deploy validation scripts
- ✅ Update sfdc-revops-auditor agent
- ✅ Add post-execution hooks
- ✅ Update CLAUDE.md documentation

### Phase 2: Short-term (Week 1)
- Update all data-querying agents
- Implement monitoring dashboard
- Train team on new requirements
- Run initial compliance audit

### Phase 3: Long-term (Month 1)
- Automate compliance checking in CI/CD
- Create agent certification process
- Build historical analysis tools
- Implement predictive detection

## Metrics and Success Criteria

### Key Metrics
- **Zero Tolerance**: 0 instances of undisclosed simulated data
- **Query Success Rate**: > 95% of queries execute successfully
- **Error Reporting**: 100% of failures reported with details
- **Metadata Coverage**: 100% of data points include source metadata

### Monitoring Dashboard
```javascript
// Real-time metrics
{
  "totalAgentExecutions": 1247,
  "dataIntegrityViolations": 0,
  "queryFailures": 23,
  "averageConfidenceScore": 0.97,
  "agentsRequiringUpdate": 3
}
```

## Troubleshooting Guide

### Issue: MCP tools not accessible
**Symptoms**: Queries fail with "MCP tool unavailable"
**Solution**:
1. Check .mcp.json configuration
2. Restart MCP servers: `claude mcp restart salesforce-dx`
3. Verify authentication: `sf org display`

### Issue: Silent data simulation
**Symptoms**: Round percentages, generic names in output
**Solution**:
1. Update agent with data integrity rules
2. Implement SafeQueryExecutor
3. Add post-execution validation

### Issue: Query permission errors
**Symptoms**: INSUFFICIENT_ACCESS errors
**Solution**:
1. Verify field-level security
2. Check object permissions
3. Use appropriate user context

## Appendix: Quick Reference

### Commands
```bash
# Validate before execution
node scripts/preflight-data-validator.js all

# Monitor execution
node scripts/subagent-error-monitor.js start [agent]

# Analyze output
node scripts/subagent-query-verifier.js analyze [file]

# Check specific agent
.claude/hooks/post-execution-validator.sh [output] [agent]
```

### Required Files
- `/scripts/subagent-query-verifier.js` - Query verification system
- `/scripts/subagent-error-monitor.js` - Real-time monitoring
- `/scripts/lib/safe-query-executor.js` - Safe query wrapper
- `/scripts/preflight-data-validator.js` - Pre-execution validation
- `/.claude/hooks/post-execution-validator.sh` - Post-execution hook
- `/.claude/agents/DATA_SOURCE_REQUIREMENTS.md` - Requirements doc

### Error Codes
- `DI001`: Simulated data without disclosure
- `DI002`: Missing query metadata
- `DI003`: No data source declaration
- `DI004`: Generic naming pattern detected
- `DI005`: Query failed but execution continued

## Conclusion

This framework ensures that sub-agents:
1. Never generate fake data without explicit disclosure
2. Always report query failures transparently
3. Include complete metadata for traceability
4. Can be monitored and validated in real-time

By following these guidelines, we prevent incidents like the NeonOne assessment where simulated data was presented as real, maintaining trust and data integrity across the entire RevPal agent system.

---
**Version**: 1.0.0  
**Last Updated**: 2025-09-09  
**Status**: Active  
**Owner**: Principal Engineer Agent System