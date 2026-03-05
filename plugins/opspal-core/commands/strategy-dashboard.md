---
name: strategy-dashboard
description: View ACE Framework strategy registry overview with performance metrics
argument-hint: "[--category <category>] [--agent <agent>] [--json]"
---

# Strategy Dashboard - ACE Framework

Display comprehensive strategy registry statistics, transfer status, and agent portfolio health.

## Usage

```bash
# Full dashboard
/strategy-dashboard

# Filter by category
/strategy-dashboard --category assessment

# Filter by agent
/strategy-dashboard --agent sfdc-revops-auditor

# Output as JSON
/strategy-dashboard --json

# Executive gap portfolio views
/strategy-dashboard --category ai_leverage --json
/strategy-dashboard --category feature_gap --json
```

## Dashboard Sections

### 1. Registry Overview
```
=== ACE Framework Skill Dashboard ===
Generated: 2025-12-06 10:30:00 UTC

Registry Statistics:
  Total Skills:          127
  Active Skills:         118
  Needs Refinement:      6
  Deprecated:            3
  Avg Success Rate:      87.3%
```

### 2. Top Performing Skills
```
Top 10 Skills by Success Rate (min 20 uses):

  1. cpq-preflight-validation    98.2%  (142 uses)
  2. revops-pipeline-audit       96.8%  (89 uses)
  3. permission-set-bundling     95.4%  (67 uses)
  4. flow-coverage-analysis      94.1%  (53 uses)
  5. field-deployment-verify     93.7%  (234 uses)
```

### 3. Skills Needing Refinement
```
Skills Below 75% Success (flagged for review):

  - soql-query-builder           68.2%  (last 30 days: 12 failures)
    Root causes: Complex joins, governor limits
    Action: /strategy-transfer refine soql-query-builder

  - validation-rule-merger       72.1%  (last 30 days: 8 failures)
    Root causes: Formula complexity
    Action: /strategy-transfer refine validation-rule-merger
```

### 4. Recent Transfers
```
Skill Transfers (Last 30 Days):

  Completed (8):
    - cpq-preflight → sfdc-cpq-specialist (validated)
    - revops-audit → sfdc-sales-operations (validated)

  In Validation (3):
    - flow-testing: sfdc-automation → sfdc-flow-test (12/20 uses)
    - permission-audit: security → compliance (8/20 uses)

  Rolled Back (1):
    - complex-soql: query-specialist → data-operations (47% success)
```

### 5. Agent Portfolio Health
```
Agent Skill Health Scores:

  sfdc-revops-auditor      92.4  (15 skills, 87% utilization)
  sfdc-cpq-assessor        91.2  (12 skills, 84% utilization)
  sfdc-automation-auditor  88.7  (18 skills, 79% utilization)
  sfdc-deployment-manager  85.3  (9 skills, 91% utilization)

  Needs Attention:
  sfdc-data-operations     64.2  (22 skills, 52% utilization)
    - 4 skills below threshold
    - Recommend: /strategy-transfer analyze sfdc-data-operations
```

## Skill Categories

| Category | Description |
|----------|-------------|
| `assessment` | Audit and analysis skills |
| `deployment` | Deployment and release skills |
| `validation` | Pre-flight and verification skills |
| `query` | SOQL/SOSL query skills |
| `automation` | Flow and automation skills |
| `security` | Permission and compliance skills |
| `data` | Data operations skills |

## Executive Gap Category Feeds

For exec-planning contexts, this command can render generated portfolio feeds:
- `reports/exec/strategy-dashboard-ai-gaps.json`
- `reports/exec/strategy-dashboard-feature-gaps.json`
- `reports/exec/strategy-dashboard-portfolio.json`

These feeds are regenerated via:

```bash
npm run exec:generate
```

Use category filters:
- `--category ai_leverage`
- `--category feature_gap`

## Example Workflow

```bash
# Check overall health
/skill-dashboard

# Investigate low-performing agent
/skill-dashboard --agent sfdc-data-operations

# Check specific skill category
/skill-dashboard --category query

# Review skills needing refinement
/strategy-transfer candidates --needs-refinement

# Run manual transfer
/strategy-transfer transfer skill-id source-agent target-agent
```

## Metrics Definitions

| Metric | Definition |
|--------|------------|
| Success Rate | successful_executions / total_executions |
| Utilization | times_used / times_available_for_task |
| Confidence | weighted_recent_success_rate (30-day decay) |
| Health Score | (success_rate * 0.4) + (utilization * 0.3) + (confidence * 0.3) |

## Configuration

```bash
# Set minimum usage for stats
export SKILL_MIN_USAGE_FOR_STATS=20

# Set success rate threshold
export SKILL_SUCCESS_THRESHOLD=0.75

# Enable verbose metrics
export SKILL_VERBOSE_METRICS=1
```

## See Also

- `/strategy-transfer` - Manual skill transfer operations
- `/routing-compliance` - Routing system health
- `/routing-health` - Full routing diagnostics
