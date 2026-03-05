---
name: project-intake-framework
description: Project intake methodology for gathering specifications, validating requirements, and generating runbooks. Use when starting new projects, gathering requirements, or validating project scope.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-core:intelligent-intake-orchestrator
context:
  fork: true
  checkpoint: phase-completion
  state-keys:
    - intake-data
    - validation-result
    - context-gathered
    - runbook-path
---

# Project Intake Framework

## When to Use This Skill

- Starting a new RevOps or platform implementation project
- Gathering and validating project requirements
- Creating project runbooks and Asana task structures
- Validating intake data for completeness and consistency
- Detecting circular dependencies in project scope

## Quick Reference

### Workflow Phases

| Phase | Purpose | Output |
|-------|---------|--------|
| 1 | Form Generation | `intake-form.html` |
| 2 | Data Collection | `intake-data.json` |
| 3 | Validation | Validation result with errors/warnings |
| 4 | Context Gathering | Context from SF/Asana/runbooks |
| 5 | Runbook Generation | `PROJECT_RUNBOOK.md` |
| 6 | Asana Creation | Project with requirement tasks |

### Completeness Scoring Weights

| Section | Weight | Required |
|---------|--------|----------|
| Project Identity | 15% | Yes |
| Goals & Objectives | 20% | Yes |
| Scope | 20% | Yes |
| Data Sources | 10% | No |
| Timeline & Budget | 15% | Yes |
| Dependencies & Risks | 10% | No |
| Technical Requirements | 5% | No |
| Approval & Sign-off | 5% | No |

**Ready for handoff**: Score >= 80% AND no validation errors

### Commands

```bash
/intake                           # Interactive workflow
/intake --form-data ./data.json   # Process existing data
/intake --validate ./data.json    # Validate only
/intake-generate-form             # Generate form only
```

## Validation Checks

### Errors (Must Fix)
- Missing required fields (projectName, projectOwner, businessObjective, inScope, dates)
- Invalid dates (start > end)
- Milestones outside date range
- Circular dependencies detected
- Empty required arrays

### Warnings (Should Review)
- Completeness score < 80%
- No risks documented
- Unvalidated assumptions
- Missing out-of-scope items
- Budget-scope mismatch

### Circular Dependency Detection

Uses depth-first search (DFS) to detect cycles:
```
A depends on B → B depends on C → C depends on A = CIRCULAR
```

## Form Schema Sections

### 1. Project Identity
- Project name, type, priority
- Owner (name, email, phone, department)
- Additional stakeholders

### 2. Goals & Objectives
- Business objective (detailed)
- Success metrics with targets
- Expected user impact

### 3. Project Scope
- In-scope items (features, deliverables)
- Out-of-scope items (explicit exclusions)
- Assumptions (with validation status)
- Constraints (technical, resource, timeline)

### 4. Data Sources
- Primary sources (type, direction, volume)
- Integrations (APIs, middleware)
- Existing automations

### 5. Timeline & Budget
- Start/end dates
- Milestones with dates
- Hard deadline flag
- Budget range and flexibility

### 6. Dependencies & Risks
- Dependencies (internal, external, technical, resource)
- Blocking dependencies flagged
- Risks with impact/probability/mitigation

### 7. Technical Requirements
- Platforms (Salesforce, HubSpot, both, other)
- Salesforce org details (alias, type, edition, CPQ, Experience Cloud)
- HubSpot portal details (ID, tier, active hubs)
- Complexity assessment

### 8. Approval & Sign-off
- Required approvers by type
- Communication plan
- Additional notes

## Detailed Documentation

See supporting files:
- `methodology.md` - Complete 6-phase workflow guide
- `patterns.md` - Common intake patterns and templates
- `troubleshooting.md` - Common issues and solutions
