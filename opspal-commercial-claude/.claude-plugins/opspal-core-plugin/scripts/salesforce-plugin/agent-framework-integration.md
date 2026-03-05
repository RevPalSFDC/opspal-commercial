# Sub-Agent Framework Integration Guide

## Current State Analysis

### ✅ Agents Ready to Use Framework

1. **sfdc-revops-auditor**
   - Has MCP Salesforce tools (`mcp_salesforce_data_query`, `mcp_salesforce`)
   - Can execute SOQL queries directly
   - Missing: Bash tool (needed for Python scripts)

2. **sfdc-dashboard-analyzer**
   - Has full toolset including Bash
   - Can run all framework scripts
   - Fully compatible with dashboard-process-extractor.js

3. **sfdc-reports-dashboards**
   - Complete MCP report tools
   - Has Bash for script execution
   - Can leverage all analysis scripts

4. **sfdc-data-operations**
   - Has data query/update tools
   - Has Bash for Python execution
   - Compatible with field-usage-analyzer.py

### ⚠️ Agents Needing Enhancement

1. **sfdc-revops-auditor** - Add Bash tool to enable Python script execution
2. **sfdc-query-specialist** - Already has Bash, fully ready

## Integration Points

### Primary Scripts Agents Can Use

```bash
# Dashboard & Report Analysis
analysis/comprehensive-revops-audit.py          # Requires: Bash, MCP tools
analysis/field-usage-analyzer.py                # Requires: Bash, MCP tools
scripts/lib/dashboard-process-extractor.js      # Requires: Bash

# Monitoring & Metrics
monitoring/reports-metrics-collector.js         # Requires: Bash
scripts/dashboard-refresh-system.js             # Requires: Bash
```

## How Agents Use the Framework

### Method 1: Direct Script Execution (Preferred)
Agents with Bash tool can directly execute:
```bash
# Example for sfdc-dashboard-analyzer
python3 ${PROJECT_ROOT}

# Example for sfdc-reports-dashboards
node ${PROJECT_ROOT} --dashboard "Sales Pipeline"
```

### Method 2: MCP Tool Direct Queries
Agents can replicate script logic using MCP tools:
```javascript
// Direct SOQL via MCP
mcp_salesforce_data_query({
    query: "SELECT Id, Title, CreatedDate FROM Dashboard WHERE CreatedDate >= LAST_N_MONTHS:6"
})
```

### Method 3: Task Delegation
Agents can delegate to other agents:
```javascript
Task.launch('sfdc-dashboard-analyzer', {
    prompt: 'Run comprehensive-revops-audit.py and analyze results'
})
```

## Quick Fix Required

### Update sfdc-revops-auditor
Add Bash tool to enable full framework usage:
```yaml
tools: mcp_salesforce_data_query, mcp_salesforce, Read, Write, TodoWrite, Bash
```

## Usage Examples by Agent

### sfdc-revops-auditor (after Bash addition)
```bash
# Can run full RevOps audit
python3 analysis/comprehensive-revops-audit.py --org example-company-production

# Can analyze field usage
python3 analysis/field-usage-analyzer.py --focus-objects Account,Opportunity
```

### sfdc-dashboard-analyzer
```bash
# Extract dashboard processes
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-process-extractor.js \
  --dashboard "Revenue Pipeline" \
  --output pipeline-analysis.json

# Run Python analysis
python3 analysis/comprehensive-revops-audit.py
```

### sfdc-reports-dashboards
```bash
# Analyze recent reports
sf data query --query "SELECT Id, Name, CreatedDate, ReportType FROM Report WHERE CreatedDate >= LAST_N_MONTHS:6" --use-tooling-api

# Generate metrics report
node monitoring/reports-metrics-collector.js --window 30
```

## Verification Commands

Agents can verify framework availability:
```bash
# Check Python scripts exist
ls -la ${PROJECT_ROOT}

# Check Node.js scripts
ls -la ${PROJECT_ROOT}

# Verify MCP tools
echo "MCP tools available for dashboard/report analysis"
```

## Summary

- **Most agents ARE equipped** to use the framework
- **Only sfdc-revops-auditor** needs Bash tool addition
- **All critical agents** (dashboard-analyzer, reports-dashboards, data-operations) are fully compatible
- **Framework scripts** are accessible to all agents with Bash tool