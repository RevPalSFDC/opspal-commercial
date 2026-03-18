---
name: automation-audit-framework
description: Salesforce automation audit methodology. Use when auditing Flows, Process Builders, Workflow Rules, Apex Triggers, or automation conflicts. Provides namespace detection, business process classification, cascade mapping, migration rationale, and risk-based phasing.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-automation-auditor
context:
  fork: true
  checkpoint: cascade-mapping-complete
  state-keys:
    - automation-inventory
    - conflict-matrix
    - execution-order-analysis
    - migration-candidates
    - risk-scores
---

# Automation Audit Framework

## When to Use This Skill

- Auditing Salesforce automation (Flows, Triggers, Process Builders)
- Detecting conflicts between automation components
- Mapping automation dependencies and cascades
- Planning Process Builder to Flow migrations
- Classifying automation by business process
- Assessing trigger consolidation opportunities

## Quick Reference

### Automation Types Inventory

| Type | Discovery Method | Key Metrics |
|------|-----------------|-------------|
| Apex Triggers | Tooling API | Events, handler pattern |
| Flows | FlowDefinitionView | Type, status, version |
| Process Builders | Flow (deprecated) | Actions, conditions |
| Workflow Rules | WorkflowRule | Status, actions |
| Validation Rules | ValidationRule | Active, formula |

### Conflict Risk Scoring

```
Risk Score = (
  component_count > 5 ? 30 : 0 +
  has_multiple_triggers ? 25 : 0 +
  mixed_automation_types ? 20 : 0 +
  exceeds_average ? 15 : 0 +
  historical_conflict_rate > 0.3 ? 10 : 0
)

Risk Level: 0-29 (LOW), 30-59 (MEDIUM), 60+ (HIGH)
```

### Read-Only Protocol

This is a READ-ONLY audit framework:
- Query Tooling API for metadata
- Query REST API for records
- Retrieve metadata via Metadata API
- Parse and analyze locally
- Generate reports and artifacts

**NEVER**: Deploy metadata, update records, delete components, deactivate automation

## Core Capabilities

### 1. Namespace Detection
- Identify managed packages vs custom code
- Flag non-modifiable components
- Separate package automation from custom

### 2. Business Process Classification
- Auto-tag by stage: Top of Funnel, Sales Cycle, Post-Close
- Auto-tag by department: Marketing, Sales, CS, Finance, IT
- Enable prioritized remediation by business area

### 3. Cascade Mapping
- Trace automation chains up to 5 levels
- Identify circular dependencies
- Estimate performance impact

### 4. Migration Rationale
- Decision matrix for trigger-to-flow migration
- Confidence scoring for migration success
- Complexity assessment per component

## Detailed Documentation

See supporting files:
- `classification-matrix.md` - Business process classification
- `migration-guide.md` - Process Builder to Flow migration
- `conflict-detection.md` - Circular dependency patterns
- `optimization-patterns.md` - Performance optimization
