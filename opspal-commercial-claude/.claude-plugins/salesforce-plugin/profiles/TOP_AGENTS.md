# Top Agents for Performance Profiling

**Purpose**: Track the most critical agents for performance optimization

**Created**: 2025-10-18
**Phase**: 4 - Performance Optimization + Test Coverage

---

## Top 10 Most Critical Agents

Priority based on:
- Frequency of use (high-impact operations)
- Execution complexity (likely bottlenecks)
- User-facing impact (visible performance)

### Tier 1: High-Frequency Operations (Profile First)

1. **sfdc-merge-orchestrator**
   - Purpose: Orchestrates duplicate record merging
   - Complexity: High (multi-step workflow)
   - Expected bottlenecks: Conflict detection, bulk operations
   - Priority: **Critical**

2. **sfdc-conflict-resolver**
   - Purpose: Detects and resolves merge conflicts
   - Complexity: High (field-level analysis)
   - Expected bottlenecks: Field comparison logic, rule evaluation
   - Priority: **Critical**

3. **sfdc-data-operations**
   - Purpose: Bulk data operations (query, update, delete)
   - Complexity: Medium-High
   - Expected bottlenecks: Query execution, batch processing
   - Priority: **High**

### Tier 2: Complex Workflows

4. **sfdc-metadata-analyzer**
   - Purpose: Analyzes org metadata for issues
   - Complexity: Very High (full org scan)
   - Expected bottlenecks: API calls, data aggregation
   - Priority: **High**

5. **sfdc-planner**
   - Purpose: Plans complex multi-step operations
   - Complexity: High (dependency analysis)
   - Expected bottlenecks: Graph traversal, planning algorithms
   - Priority: **High**

6. **sfdc-orchestrator**
   - Purpose: Main orchestration agent
   - Complexity: Medium-High
   - Expected bottlenecks: Agent routing, state management
   - Priority: **Medium-High**

### Tier 3: Assessment & Analysis

7. **sfdc-revops-auditor**
   - Purpose: RevOps configuration auditing
   - Complexity: High (comprehensive analysis)
   - Expected bottlenecks: Object scanning, rule validation
   - Priority: **Medium-High**

8. **sfdc-cpq-assessor**
   - Purpose: CPQ configuration assessment
   - Complexity: Very High (CPQ-specific metadata)
   - Expected bottlenecks: Quote object analysis, price book evaluation
   - Priority: **Medium**

9. **sfdc-discovery**
   - Purpose: Initial org discovery and analysis
   - Complexity: Very High (full org scan)
   - Expected bottlenecks: Metadata retrieval, object enumeration
   - Priority: **Medium**

10. **sfdc-remediation-executor**
    - Purpose: Executes remediation plans
    - Complexity: High (phased deployment)
    - Expected bottlenecks: Validation checks, deployment steps
    - Priority: **Medium**

---

## Profiling Workflow

### Step 1: Instrument Agent Code

Add profiling to agent execution:

```javascript
const AgentProfiler = require('.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler');

async function executeAgent(agentName, params) {
  const profiler = AgentProfiler.getInstance();
  const session = profiler.startProfiling(agentName, {
    org: params.org,
    recordCount: params.recordCount,
    operation: params.operation
  });

  try {
    // Step 1: Validation
    profiler.checkpoint(session, 'Input validation complete');
    await validateInputs(params);

    // Step 2: Data retrieval
    profiler.checkpoint(session, 'Data retrieval complete');
    const data = await fetchData(params);

    // Step 3: Processing
    profiler.checkpoint(session, 'Processing complete');
    const result = await processData(data);

    // Step 4: Output
    profiler.checkpoint(session, 'Output generation complete');
    const output = await generateOutput(result);

    const profile = profiler.endProfiling(session);
    console.log(`Performance Score: ${profile.analysis.performanceScore}/100`);

    return output;
  } catch (error) {
    profiler.endProfiling(session); // Capture failure profile
    throw error;
  }
}
```

### Step 2: Execute and Collect Profiles

```bash
# Run agent operations to collect profile data
# (This happens naturally during normal usage or can be triggered manually)

# For testing, can create synthetic workloads:
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/test-agent-performance.js sfdc-merge-orchestrator --records 100
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/test-agent-performance.js sfdc-conflict-resolver --records 50
```

### Step 3: Generate Baseline Reports

```bash
# Generate individual agent reports
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler-cli.js report sfdc-merge-orchestrator --format json > profiles/baseline/sfdc-merge-orchestrator.json

# Generate summary report
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler-cli.js list --format markdown > profiles/baseline/SUMMARY.md

# Export detailed HTML reports
for agent in sfdc-merge-orchestrator sfdc-conflict-resolver sfdc-data-operations; do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/agent-profiler-cli.js export $agent --format html --output profiles/baseline/$agent.html
done
```

---

## Success Criteria

**Baseline Established When**:
- ✅ All 10 agents have profile data collected
- ✅ Performance scores calculated (0-100)
- ✅ Bottlenecks identified (>30% segments)
- ✅ Memory usage patterns documented
- ✅ Baseline reports generated (JSON + HTML)

**Target Metrics**:
- Performance score >70 for all agents (current: TBD)
- No critical bottlenecks (>50% of time) (current: TBD)
- No memory leaks detected (current: TBD)
- Execution time within acceptable ranges (current: TBD)

---

## Next Steps

1. **Instrument top 3 agents** (sfdc-merge-orchestrator, sfdc-conflict-resolver, sfdc-data-operations)
2. **Create test workloads** to trigger profiling
3. **Collect baseline data** (execute agents with profiling enabled)
4. **Generate baseline reports** (JSON + HTML + Markdown)
5. **Identify optimization opportunities** (bottlenecks, memory issues, regressions)

---

## Tracking

**Status**: 🔄 In Progress
- [ ] sfdc-merge-orchestrator - Not profiled
- [ ] sfdc-conflict-resolver - Not profiled
- [ ] sfdc-data-operations - Not profiled
- [ ] sfdc-metadata-analyzer - Not profiled
- [ ] sfdc-planner - Not profiled
- [ ] sfdc-orchestrator - Not profiled
- [ ] sfdc-revops-auditor - Not profiled
- [ ] sfdc-cpq-assessor - Not profiled
- [ ] sfdc-discovery - Not profiled
- [ ] sfdc-remediation-executor - Not profiled

**Last Updated**: 2025-10-18
