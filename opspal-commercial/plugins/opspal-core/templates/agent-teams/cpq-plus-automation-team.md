# Team Template: CPQ + Automation Assessment

> **BLOCKED: Requires Agent Teams GA**

## Team Purpose

Run CPQ assessment and automation audit simultaneously against the same Salesforce org, with a response validator monitoring output quality in real-time. The two assessors share discoveries about CPQ-automation interactions that would be missed in sequential runs.

## Team Structure

```
Team Lead: cpq-automation-coordinator
├── Teammate 1: sfdc-cpq-assessor (model: opus)
├── Teammate 2: sfdc-automation-auditor (model: sonnet)
└── Teammate 3: response-validator (model: opus)
```

### Roles

| Agent | Role | Display Mode |
|-------|------|-------------|
| `cpq-automation-coordinator` | Orchestrates team, merges findings | `delegate` |
| `sfdc-cpq-assessor` | Analyzes CPQ configuration, pricing rules, bundles | `full` |
| `sfdc-automation-auditor` | Maps flows, triggers, process builders | `full` |
| `response-validator` | Validates plausibility of findings in real-time | `full` |

### Communication Pattern

```
cpq-assessor ──SendMessage──> automation-auditor
  "Found pricing rule X that triggers flow Y - can you trace it?"

automation-auditor ──SendMessage──> cpq-assessor
  "Flow Y modifies field Z which affects discount calculation"

Both ──SendMessage──> response-validator
  "Validate these findings against org data"
```

## Expected Benefits

- **Time**: ~40% reduction (parallel execution + shared discovery)
- **Quality**: Better coverage of CPQ-automation intersections
- **Cost**: ~3x token cost vs sequential (offset by time savings)

## Sequential Equivalent (Current)

```
1. Task(sfdc-cpq-assessor, "Run CPQ assessment for {org}")
2. Task(sfdc-automation-auditor, "Run automation audit for {org}")
3. Task(response-validator, "Validate combined findings")
```

## When to Use

- Full CPQ + automation assessment for a new client
- Complex orgs with heavy CPQ-automation coupling
- When the $3-5 additional cost is justified by time savings
