---
name: pipeline-health
description: Analyze pipeline health including bottlenecks, deal risk, and coverage metrics
argument-hint: "[--org <alias>] [--segment <name>] [--detailed]"
arguments:
  - name: org
    description: Salesforce org alias
    required: false
  - name: segment
    description: Filter by segment (enterprise, mid-market, smb)
    required: false
  - name: detailed
    description: Include deal-level details
    required: false
---

# Pipeline Health Analysis Command

Comprehensive pipeline health scoring with bottleneck detection, deal risk assessment, and actionable recommendations.

## Usage

```bash
/pipeline-health                         # Full pipeline analysis
/pipeline-health --org production        # Specific org
/pipeline-health --segment enterprise    # Enterprise segment only
/pipeline-health --detailed              # Include deal-level details
```

## What This Does

1. **Calculates health scores** for coverage, velocity, quality, freshness
2. **Identifies bottlenecks** using stage velocity analysis
3. **Assesses deal risk** based on age, engagement, signals
4. **Generates recommendations** for pipeline improvement

## Execution

Use the pipeline-intelligence-agent:

```javascript
Agent({
  subagent_type: 'opspal-core:pipeline-intelligence-agent',
  prompt: `Analyze pipeline health for ${org || 'default org'}. Segment: ${segment || 'all'}. Detail level: ${detailed ? 'deal-level' : 'summary'}`
});
```

## Output

The analysis includes:
- **Health scorecard**: Coverage, velocity, quality, freshness (0-100)
- **Bottleneck report**: Stages with conversion issues
- **At-risk deals**: Deals needing attention with reasons
- **Next-best-actions**: Prioritized recommendations

## Related Commands

- `/forecast` - Revenue forecasting
- `/win-loss` - Win/loss pattern analysis
- `/sales-playbook` - Deal coaching recommendations
