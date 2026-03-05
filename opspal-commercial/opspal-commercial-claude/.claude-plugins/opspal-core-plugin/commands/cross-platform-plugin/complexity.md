---
name: complexity
description: Assess task complexity and get decomposition recommendation without full orchestration
argument-hint: "[task description]"
visibility: user-invocable
tags:
  - assessment
  - planning
  - complexity
---

# /complexity Command

Quickly assess the complexity of a task and get a recommendation on whether Task Graph orchestration is needed. This is a lightweight check that doesn't trigger full orchestration.

## Usage

```bash
# Check complexity of a task
/complexity Update the lead routing flow to add a fallback owner

# Check with explicit hints
/complexity [COMPLEX] Simple field addition that affects many objects
```

## What It Returns

```markdown
## Complexity Assessment

**Score:** 5/10
**Threshold:** 4 (decompose if >=4)
**Recommendation:** task_graph_recommended

### Factors Detected
- ✅ multi_domain (2 pts) - Crosses apex and flow domains
- ✅ high_risk (2 pts) - Affects routing/automation
- ⬜ multi_artifact (0 pts) - Single file expected
- ⬜ high_ambiguity (0 pts) - Requirements clear
- ✅ long_horizon (1 pt) - Multi-step execution

### Recommendation
Use `/task-graph` to decompose this request into a managed DAG
with parallel execution and verification gates.

### Domain
Primary: salesforce-flow
Base complexity: 0.3
```

## Scoring Rubric

| Factor | Points | Detection Criteria |
|--------|--------|-------------------|
| Multi-domain | 2 | Request spans 2+ domains (Apex+Flow, SF+HubSpot) |
| Multi-artifact | 2 | Affects 5+ files or deployables |
| High-risk | 2 | Production, permissions, deletes, security |
| High-ambiguity | 1 | Unclear requirements, needs discovery |
| Long-horizon | 1 | Multi-step, phased, rollout |

**Total possible:** 8 points
**Decomposition threshold:** 4 points

## Recommendations

| Score | Recommendation | Meaning |
|-------|---------------|---------|
| 0-3 | direct_execution | Simple task, delegate directly to specialist |
| 4-5 | task_graph_recommended | Moderate complexity, Task Graph improves tracking |
| 6+ | task_graph_required | High complexity, Task Graph needed for safety |

## User Flags

| Flag | Effect |
|------|--------|
| `[SEQUENTIAL]` | Forces score to 10, always recommends Task Graph |
| `[PLAN_CAREFULLY]` | Forces score to 10, always recommends Task Graph |
| `[DIRECT]` | Forces score to 0, always recommends direct execution |
| `[QUICK_MODE]` | Forces score to 0, always recommends direct execution |
| `[COMPLEX]` | Adds 2 points to detected score |
| `[SIMPLE]` | Subtracts 2 points from detected score |

## Examples

### Low Complexity
```bash
/complexity Add a new checkbox field to Account
```
```
Score: 1/10 - Recommendation: direct_execution
```

### Medium Complexity
```bash
/complexity Update the opportunity stage picklist and modify the flow
```
```
Score: 4/10 - Recommendation: task_graph_recommended
```

### High Complexity
```bash
/complexity Migrate all custom objects to new namespace across production
```
```
Score: 7/10 - Recommendation: task_graph_required
```

## Configuration

```bash
# Set custom threshold
export TASK_GRAPH_THRESHOLD=5

# Enable verbose output
export TASK_GRAPH_VERBOSE=1
```

## CLI Usage

You can also run the complexity calculator directly:

```bash
node .claude-plugins/cross-platform-plugin/scripts/lib/task-graph/complexity-calculator.js \
  "Update lead routing flow to add fallback owner"
```

## See Also

- `/task-graph` - Full Task Graph orchestration
- `/route` - Get agent routing recommendation
- `/agents` - List available specialist agents
