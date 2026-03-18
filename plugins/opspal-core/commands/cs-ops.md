---
name: cs-ops
description: Customer Success operations including QBR generation, health interventions, and renewal forecasting
argument-hint: "<qbr|health-check|renewals|interventions> [--account <id>] [--period <period>]"
arguments:
  - name: action
    description: Action to perform (qbr, health-check, renewals, interventions)
    required: false
  - name: account
    description: Specific account ID
    required: false
  - name: period
    description: Period for analysis (this_quarter, next_quarter)
    required: false
  - name: org
    description: Salesforce org alias
    required: false
---

# Customer Success Operations Command

Automate CS operations including QBR preparation, health score interventions, renewal forecasting, and churn prevention.

## Usage

```bash
/cs-ops qbr --account 001XXXX              # Generate QBR for account
/cs-ops health-check                        # Review all health scores
/cs-ops renewals --period next_quarter      # Renewal forecast
/cs-ops interventions                       # Triggered interventions
```

## What This Does

1. **QBR Generation**: Prepares comprehensive quarterly business reviews
2. **Health Monitoring**: Analyzes scores and triggers interventions
3. **Renewal Forecasting**: Predicts renewal outcomes with risk factors
4. **Churn Prevention**: Executes prevention playbooks for at-risk accounts

## Execution

Use the cs-operations-orchestrator agent:

```javascript
Task({
  subagent_type: 'opspal-core:cs-operations-orchestrator',
  prompt: `CS Operations: ${action || 'overview'}. Account: ${account || 'all'}. Period: ${period || 'current'}. Org: ${org || 'default'}`
});
```

## Output

Depending on action:
- **QBR**: Full QBR document with metrics, value realization, roadmap
- **Health Check**: Health distribution, at-risk accounts, interventions
- **Renewals**: Forecast with risk levels, mitigation actions
- **Interventions**: Active playbooks, progress tracking

## Related Commands

- `/account-expansion` - Expansion opportunities
- `/pipeline-health` - Pipeline analysis
- `/exec-dashboard` - Executive overview
