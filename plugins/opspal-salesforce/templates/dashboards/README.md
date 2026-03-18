# B2B Dashboard Template Catalog

Comprehensive collection of dashboard templates for Sales, Marketing, and Customer Success functions, supporting Executive, Manager, and Individual Contributor levels.

## Overview

| Function | Templates | Levels |
|----------|-----------|--------|
| **Sales** | 9 | Executive (3), Manager (3), Individual (3) |
| **Marketing** | 4 | Executive (2), Individual (2) |
| **Customer Success** | 5 | Executive (3), Individual (2) |
| **Total** | **18** | |

## Quick Start

### 1. Find the Right Template

Use the **Dashboard Template Registry** (`dashboard-template-registry.json`) to search by:
- **Function**: sales, marketing, customer-success
- **Level**: executive, manager, individual
- **Persona**: cro, cmo, csm, rep, etc.
- **Keywords**: nrr, pipeline, mql, renewal, etc.

### 2. Deploy Using the Agent

```bash
# Via Task tool
Task(subagent_type='opspal-salesforce:sfdc-reports-dashboards',
     prompt='Deploy marketing-performance dashboard for our CMO')
```

### 3. Customize for Your Org

Each template includes:
- `orgAdaptation.fieldFallbacks` - Alternative field names
- `dashboardFilters` - Configurable filter values
- `prerequisites` - Required fields/objects

## Templates by Function

### Sales Dashboards

#### Executive Level
| Template | Audience | Key Metrics |
|----------|----------|-------------|
| `revenue-performance` | CRO, CFO | Revenue vs target, trends, pipeline health |
| `pipeline-health` | CRO, VP Sales | Coverage, velocity, stage conversion |
| `team-productivity` | VP Sales | Activity metrics, quota attainment |

#### Manager Level
| Template | Audience | Key Metrics |
|----------|----------|-------------|
| `team-pipeline` | Sales Managers | Team pipeline, deals at risk |
| `quota-attainment` | Sales Managers | Rep quota progress, pacing |
| `activity-metrics` | Sales Managers | Calls, emails, meetings |

#### Individual Level
| Template | Audience | Key Metrics |
|----------|----------|-------------|
| `my-pipeline` | Reps | Personal pipeline, next steps |
| `my-quota` | Reps | Personal quota attainment |
| `my-activities` | Reps | Personal activity tracking |

### Marketing Dashboards

#### Executive Level
| Template | Audience | Key Metrics |
|----------|----------|-------------|
| `marketing-performance` | CMO, VP Marketing | Marketing-sourced pipeline, MROI, CAC |
| `demand-gen-funnel` | CMO, Marketing Ops | Full funnel, MQL→SQL conversion, CPL |

#### Individual Level
| Template | Audience | Key Metrics |
|----------|----------|-------------|
| `campaign-performance` | Campaign Managers | Campaign ROI, leads, engagement |
| `lead-generation` | SDRs, BDRs | New leads, MQLs, follow-up queue |

### Customer Success Dashboards

#### Executive Level
| Template | Audience | Key Metrics |
|----------|----------|-------------|
| `cs-overview` | CCO, VP CS | NRR, churn, expansion, TTV |
| `renewal-pipeline` | CS Directors | Renewals due, at-risk, forecast |
| `account-health` | CS Directors | Health distribution, NPS, cases |

#### Individual Level
| Template | Audience | Key Metrics |
|----------|----------|-------------|
| `my-accounts` | CSMs | Account health, cases, renewals |
| `support-performance` | Support Managers | Cases, resolution time, CSAT |

## Template Schema

Each template follows this structure:

```json
{
  "templateMetadata": {
    "templateId": "unique-id",
    "templateName": "Display Name",
    "function": "sales|marketing|customer-success",
    "level": "executive|manager|individual",
    "audience": "Who uses this",
    "componentCount": 6
  },
  "dashboardLayout": {
    "columns": 3,
    "components": [...]
  },
  "dashboardFilters": [...],
  "sourceReportTemplates": [...],
  "orgAdaptation": {
    "fieldFallbacks": {...}
  },
  "kpiDefinitions": {...},
  "deploymentInstructions": {...}
}
```

## Org Adaptation

Templates automatically adapt to your org's field naming:

### Common Field Fallbacks

| Metric | Primary | Fallback 1 | Fallback 2 |
|--------|---------|------------|------------|
| ARR | `ARR__c` | `Annual_Recurring_Revenue__c` | `Amount` |
| Health Score | `Health_Score__c` | `Customer_Health__c` | Formula calculation |
| MQL Date | `MQL_Date__c` | `Marketing_Qualified_Date__c` | `CreatedDate` |
| CSM Owner | `CSM_Owner__c` | `Customer_Success_Manager__c` | `OwnerId` |

### Graceful Degradation

When optional fields are missing:
1. Template attempts fallback fields
2. Uses formula calculation if available
3. Hides component if no alternative exists
4. Reports minimum fidelity (default 70%)

## Prerequisites by Function

### Sales
- Standard Opportunity object
- `StageName` picklist
- `Amount` or custom revenue field

### Marketing
- Campaign object with `ActualCost`
- Lead object with `Status` (MQL value)
- `LeadSource` on Opportunity
- Optional: Campaign Influence

### Customer Success
- `Health_Score__c` on Account (or calculate from activity)
- `Type = 'Renewal'` on Opportunity
- Case object for support metrics
- Optional: `NPS_Score__c`, `ARR__c`

## Persona KPI Validation

Templates are validated against persona-specific requirements:

| Persona | Required Metrics | Forbidden Keywords |
|---------|------------------|-------------------|
| CRO | pipeline, bookings, ARR, win_rate | activity, case, ticket |
| CMO | pipeline_sourced, MQL, campaign_roi | case, renewal, churn |
| CCO/CS Director | NRR, renewal_rate, health_score | lead, MQL, campaign |
| CSM | health_score, renewal_rate | MQL, SQL, campaign |

## Deployment Checklist

- [ ] Verify required fields exist in org
- [ ] Deploy source report templates first
- [ ] Create dashboard folder (by function)
- [ ] Deploy dashboard using agent
- [ ] Configure filters with org-specific values
- [ ] Set refresh schedule
- [ ] Share with appropriate users

## Related Resources

- **Report Templates**: `../reports/` - Source reports for dashboards
- **Persona KPI Contracts**: `../../config/persona-kpi-contracts.json`
- **Metric Definitions**: `../../config/metric-definitions.json`
- **Quality Validator**: `../../scripts/lib/dashboard-quality-validator.js`

## Support

For issues or enhancements:
1. Check template prerequisites
2. Verify field names match your org
3. Review `orgAdaptation` section for alternatives
4. Contact RevPal support if needed

---
**Last Updated**: 2026-01-24
**Version**: 1.0.0
**Total Templates**: 18
