# Task Graph Migration Guide

This guide documents the migration path for existing orchestrators to the Task Graph framework.

## Overview

The Task Graph framework provides a standardized way to:
- Decompose complex requests into DAGs
- Execute tasks with dependency-aware scheduling
- Enforce risk-based tool policies
- Verify results with deterministic gates

Existing orchestrators can gradually adopt these patterns without breaking changes.

## Migration Phases

### Phase 1: Adopt TaskSpec Contracts (Non-Breaking)

**Goal**: Standardize task definitions without changing orchestration logic.

#### Current Pattern
```javascript
// Old: Informal task objects
const tasks = [
  { name: 'Discovery', action: 'find_flows' },
  { name: 'Update', action: 'modify_flow' }
];
```

#### New Pattern
```javascript
// New: Formal TaskSpec contracts
const tasks = [
  {
    id: 'T-01',
    title: 'Flow Discovery',
    domain: 'salesforce-flow',
    goal: 'Locate current flows and decision nodes',
    inputs: ['org_alias'],
    outputs: ['flow_inventory.json'],
    acceptance_criteria: ['All flows identified'],
    dependencies: [],
    concurrency_group: 'none',
    risk_level: 'low'
  },
  {
    id: 'T-02',
    title: 'Flow Update',
    domain: 'salesforce-flow',
    goal: 'Modify flow XML with specified changes',
    inputs: ['flow_inventory.json', 'change_spec.md'],
    outputs: ['updated_flow.xml'],
    acceptance_criteria: ['Flow validates without errors'],
    dependencies: ['T-01'],
    concurrency_group: 'flow-xml',
    risk_level: 'medium'
  }
];
```

#### Migration Steps

1. **Add ID field**: Use `T-XX` format
2. **Add domain**: Choose from standard domains
3. **Formalize inputs/outputs**: List explicit files/references
4. **Add acceptance_criteria**: Define measurable completion
5. **Add dependencies**: Reference other task IDs
6. **Add risk_level**: low/medium/high/critical

### Phase 2: Adopt ResultBundle Format (Non-Breaking)

**Goal**: Standardize task output format.

#### Current Pattern
```javascript
// Old: Informal results
return {
  success: true,
  message: 'Flow updated',
  files: ['flow.xml']
};
```

#### New Pattern
```javascript
// New: ResultBundle schema
return {
  task_id: 'T-02',
  status: 'success',  // success | partial | failed | blocked
  summary: 'Flow updated with new decision node',
  files_changed: ['force-app/main/default/flows/Lead_Routing.flow-meta.xml'],
  evidence: [
    'Flow XML validated successfully',
    'No deployment errors'
  ],
  verification_results: {
    tests_passed: true,
    validation_passed: true
  },
  risks: [],
  next_steps: ['Deploy to sandbox for testing']
};
```

#### Migration Steps

1. **Add task_id**: Match the TaskSpec ID
2. **Use standard status**: success/partial/failed/blocked
3. **Add evidence array**: Capture verification outputs
4. **Track risks and next_steps**: Document follow-up items

### Phase 3: Add Complexity Assessment (Enhancement)

**Goal**: Auto-determine when to use Task Graph orchestration.

#### Integration
```javascript
const { ComplexityCalculator } = require('./task-graph');

async function processRequest(request) {
  const calculator = new ComplexityCalculator();
  const complexity = calculator.calculate(request);

  if (complexity.shouldDecompose) {
    // Use Task Graph orchestration
    return await executeWithTaskGraph(request);
  } else {
    // Direct execution (existing logic)
    return await executeDirect(request);
  }
}
```

#### Complexity Thresholds

| Score | Recommendation | Action |
|-------|---------------|--------|
| 0-3 | direct_execution | Use existing orchestrator |
| 4-5 | task_graph_recommended | Consider Task Graph |
| 6+ | task_graph_required | Must use Task Graph |

### Phase 4: Adopt TaskGraph Class (Enhancement)

**Goal**: Use DAG representation for dependency management.

#### Integration
```javascript
const { TaskGraph, TaskScheduler } = require('./task-graph');

async function executeWithTaskGraph(tasks) {
  // Build graph
  const graph = new TaskGraph();
  tasks.forEach(task => graph.addTask(task));
  tasks.forEach(task => {
    task.dependencies.forEach(dep => {
      graph.addDependency(task.id, dep);
    });
  });

  // Validate
  graph.validateAcyclic();

  // Get execution waves
  const waves = graph.getExecutionWaves();
  console.log(`Execution plan: ${waves.length} waves`);

  // Schedule execution
  const scheduler = new TaskScheduler({ maxConcurrency: 3 });
  await scheduler.schedule(graph, executeTask);
}
```

### Phase 5: Add Verification Gates (Enhancement)

**Goal**: Enforce domain-specific quality checks.

#### Integration
```javascript
const { Verifier } = require('./task-graph');

async function executeTask(taskSpec) {
  // Execute task logic
  const result = await performTaskWork(taskSpec);

  // Verify result
  const verifier = new Verifier();
  const verification = await verifier.verify(taskSpec, result);

  if (!verification.passed) {
    result.status = 'failed';
    result.verification_errors = verification.failedGates;
  }

  return result;
}
```

## Orchestrator-Specific Migration

### GTM Planning Orchestrator

**Current State**: Uses informal phase transitions

**Migration Plan**:
1. Convert phases to TaskSpecs with explicit dependencies
2. Add complexity assessment at intake
3. Use TaskGraph for phase ordering
4. Add verification gates for each phase

**Example Migration**:
```yaml
# Before: Informal phases
phases:
  - name: Data Insights
    depends_on: []
  - name: Attribution Governance
    depends_on: []
  - name: Implementation
    depends_on: [Data Insights, Attribution Governance]

# After: TaskSpec format
tasks:
  - id: T-01
    title: Data Insights Analysis
    domain: cross-platform
    goal: Analyze data insights across platforms
    dependencies: []
    concurrency_group: none

  - id: T-02
    title: Attribution Governance Setup
    domain: cross-platform
    goal: Configure attribution rules
    dependencies: []
    concurrency_group: none
    can_run_in_parallel_with: [T-01]

  - id: T-03
    title: Implementation
    domain: cross-platform
    goal: Implement GTM changes
    dependencies: [T-01, T-02]
    concurrency_group: prod
```

### SFDC Orchestrator

**Current State**: Uses batch operations with manual sequencing

**Migration Plan**:
1. Convert batch operations to TaskSpecs
2. Add concurrency groups for SF operations
3. Integrate with existing validation hooks
4. Add verification matrix gates

### HubSpot Orchestrator

**Current State**: Uses parallel/sequential patterns informally

**Migration Plan**:
1. Convert workflow operations to TaskSpecs
2. Add HubSpot-specific verification gates
3. Integrate with cross-platform workflows
4. Add data validation gates

## Backward Compatibility

### Feature Flags

Use environment variables to control migration:

```bash
# Enable Task Graph for new requests
export TASK_GRAPH_ENABLED=1

# Set complexity threshold (default: 4)
export TASK_GRAPH_THRESHOLD=4

# Block execution if threshold met
export TASK_GRAPH_BLOCKING=0
```

### Gradual Rollout

1. **Week 1-2**: Enable TaskSpec format for new tasks
2. **Week 3-4**: Add complexity assessment (non-blocking)
3. **Week 5-6**: Enable TaskGraph for high-complexity requests
4. **Week 7-8**: Add verification gates

### Rollback Plan

If issues occur:

```bash
# Disable Task Graph completely
export TASK_GRAPH_ENABLED=0

# Revert to direct execution
export TASK_GRAPH_THRESHOLD=999
```

## Testing Migration

### Unit Tests

```bash
# Run task-graph tests
npm test -- test/task-graph/

# Run specific module
npm test -- test/task-graph/complexity.test.js
```

### Integration Tests

```bash
# Run full pipeline test
npm test -- test/task-graph/integration.test.js
```

### Validation Checklist

- [ ] TaskSpec schema validation passes
- [ ] ResultBundle schema validation passes
- [ ] Circular dependency detection works
- [ ] Concurrency groups prevent collisions
- [ ] Verification gates execute correctly
- [ ] Backward compatibility maintained

## Common Issues

### Circular Dependencies

**Symptom**: `Circular dependency detected: T-01 -> T-02 -> T-01`

**Fix**: Review task dependencies and break the cycle

### Concurrency Conflicts

**Symptom**: File conflicts when parallel tasks edit same file

**Fix**: Assign same `concurrency_group` to conflicting tasks

### Verification Gate Failures

**Symptom**: `Gate 'apex_tests' failed`

**Fix**: Check gate configuration and command output

## Resources

- **TaskSpec Schema**: `schemas/task-spec.schema.json`
- **ResultBundle Schema**: `schemas/result-bundle.schema.json`
- **Complexity Rubric**: `config/complexity-rubric.json`
- **Tool Policies**: `config/tool-policies.json`
- **Verification Matrix**: `config/verification-matrix.json`
- **Playbooks**: `playbooks/`
- **Tests**: `test/task-graph/`

## Support

For migration assistance:
- Review playbooks for domain-specific patterns
- Check test fixtures for examples
- Use `/complexity` command to assess requests
- Use `/task-graph` command for manual orchestration
