---
name: revops-assessment-framework
description: Revenue Operations assessment methodology for Salesforce. Use when evaluating GTM architecture, pipeline health, sales processes, forecast accuracy, or performing RevOps audits. Provides statistical analysis frameworks, health scoring, industry benchmarks, and data-driven recommendations.
allowed-tools:
  - Read
  - Grep
  - Glob
agent: opspal-salesforce:sfdc-revops-auditor
context:
  fork: true
  checkpoint: statistical-analysis-complete
  state-keys:
    - baseline-metrics
    - funnel-analysis
    - forecast-accuracy
    - health-scores
    - gtm-architecture
---

# RevOps Assessment Framework

## When to Use This Skill

- Performing RevOps or pipeline audits
- Evaluating GTM (Go-to-Market) architecture
- Analyzing sales process effectiveness
- Assessing forecast accuracy and pipeline health
- Conducting field utilization analysis
- Generating revenue operations recommendations

## Quick Reference

### Instance Type Detection (CRITICAL)

```javascript
function detectInstanceType(orgUrl) {
  const isSandbox = orgUrl.includes('.sandbox.') ||
                    orgUrl.includes('--') ||
                    orgUrl.includes('test.salesforce.com');

  return {
    type: isSandbox ? 'SANDBOX' : 'PRODUCTION',
    analysisApproach: isSandbox ? 'METADATA_FOCUSED' : 'DATA_DRIVEN',
    skipFieldUtilization: isSandbox,
    statisticalSampling: !isSandbox
  };
}
```

### Assessment Categories

| Category | Focus Area |
|----------|-----------|
| GTM Architecture | Sales model alignment, territory design |
| Pipeline Health | Stage conversion, velocity, aging |
| Data Quality | Field utilization, accuracy, completeness |
| Automation | Process efficiency, manual steps |
| Forecasting | Accuracy, methodology, confidence |

### Health Score Calculation

```
Overall Score = (
  GTM_Architecture × 0.20 +
  Pipeline_Health × 0.25 +
  Data_Quality × 0.20 +
  Automation × 0.15 +
  Forecasting × 0.20
)
```

## Core Principles

### 1. Data Integrity Requirements
- ALWAYS execute real queries using mcp_salesforce_data_query
- NEVER return simulated statistics or example data
- FAIL EXPLICITLY if queries cannot be executed
- LABEL ALL DATA with source: VERIFIED, FAILED, or UNKNOWN

### 2. Bulk Operations for Speed
- Parallel assessment analysis: 15x faster
- Batched validation checks: 20x faster
- Cache-first metadata: 5x faster
- Expected audit cycle: 15-22s (vs 80-120s sequential)

### 3. Pre-Assessment Automation
1. Auto-detect org quirks (label customizations)
2. Load org context (previous assessments)
3. Confirm assessment framework
4. Update context post-assessment

## Detailed Documentation

See supporting files:
- `scoring-frameworks.md` - Health score calculations
- `statistical-methods.md` - Pipeline analysis methods
- `benchmark-standards.md` - Industry benchmarks
- `report-templates.md` - Output formats
