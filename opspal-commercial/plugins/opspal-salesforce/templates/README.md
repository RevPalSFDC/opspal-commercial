# Salesforce Reports & Dashboards Template Library

## Overview

This template library provides **enterprise-grade, audience-specific report and dashboard templates** designed following Salesforce best practices. Each template is production-ready with:

- ✅ **Audience-optimized design** (Executive, Manager, Sales Rep, Marketing, Customer Success)
- ✅ **Complete metadata** (filters, groupings, charts, calculated fields)
- ✅ **Customization points** for org-specific adjustments
- ✅ **Deployment instructions** with step-by-step guidance
- ✅ **KPI definitions** and usage scenarios
- ✅ **Troubleshooting guidance** and best practices

**Total Templates**: 21 templates (12 reports + 9 dashboards)

---

## Template Catalog

## Report Templates

### 📊 Report Templates (12)

#### Marketing (3 templates)
| Template | Audience | Use Case | Key Metrics |
|----------|----------|----------|-------------|
| **lifecycle-funnel.json** | Marketing Managers | Track funnel health, identify conversion bottlenecks | Leads → MQLs → SQLs → Opps → Won |
| **mql-to-sql-conversion.json** | Demand Generation | Measure lead quality and handoff effectiveness | MQL→SQL conversion rate, days to convert |
| **campaign-roi.json** | Marketing Leadership | Optimize campaign spend and demonstrate ROI | Cost per response, ROI, revenue per dollar |

#### Sales Reps (2 templates)
| Template | Audience | Use Case | Key Metrics |
|----------|----------|----------|-------------|
| **my-pipeline-by-stage.json** | Sales Reps, AEs | Daily pipeline management and prioritization | Pipeline by stage, deal counts |
| **speed-to-lead.json** | BDRs, SDRs | Track lead response time and SLA compliance | Hours to first response, SLA compliance % |

#### Sales Leaders (3 templates)
| Template | Audience | Use Case | Key Metrics |
|----------|----------|----------|-------------|
| **team-performance.json** | Sales Managers, VPs | Monitor team quota attainment and pipeline health | Quota attainment, win rate, pipeline coverage |
| **win-loss-analysis.json** | Sales Leadership | Identify win/loss patterns and improve close rates | Win rate by segment, loss reasons |
| **forecast-accuracy.json** | Sales Ops, CFO | Improve forecast reliability and executive confidence | Commit vs actual, accuracy %, variance |

#### Customer Success (3 templates)
| Template | Audience | Use Case | Key Metrics |
|----------|----------|----------|-------------|
| **account-health.json** | CSMs, CS Directors | Proactive churn prevention and risk identification | Health score distribution, at-risk accounts |
| **renewal-pipeline.json** | CS, Finance | Forecast renewal revenue and plan capacity | Renewals by quarter, risk assessment |
| **support-trends.json** | Support Managers | Track case volume and resolution performance | Case volume, avg resolution time |

---

## Dashboard Templates

### 📈 Dashboard Templates (9)

#### Executive (3 dashboards)
| Dashboard | Components | Refresh | Key Focus |
|-----------|------------|---------|-----------|
| **revenue-performance.json** | 6 (Gauge, Line, Funnel, Bar, Donut, Table) | Daily | Quarterly revenue vs target, trends, top deals |
| **pipeline-health.json** | 6 (Metrics, Funnel, Bar, Table) | Daily | Pipeline coverage, win rates, stalled deals |
| **team-productivity.json** | 6 (Metrics, Bar, Line, Table) | Daily | Quota attainment, rep performance, activities |

#### Manager (3 dashboards)
| Dashboard | Components | Refresh | Key Focus |
|-----------|------------|---------|-----------|
| **team-pipeline.json** | 7 (Metrics, Bar, Funnel, Donut, Table) | Hourly | Team pipeline by rep, stage distribution, top deals |
| **activity-metrics.json** | 7 (Metrics, Bar, Line, Table) | Daily | Team activities, inactive reps, activity trends |
| **quota-attainment.json** | 6 (Gauge, Bar, Table, Scatter) | Daily | Team quota performance, at-risk reps, pacing |

#### Individual (3 dashboards)
| Dashboard | Components | Refresh | Key Focus |
|-----------|------------|---------|-----------|
| **my-pipeline.json** | 6 (Metrics, Funnel, Donut, Table) | Real-time | Personal pipeline, coverage, priorities |
| **my-activities.json** | 6 (Metrics, Line, Donut, Table) | Real-time | Daily activity goals, trends, upcoming tasks |
| **my-quota.json** | 6 (Gauge, Metrics, Combo, Table) | Daily | Personal quota attainment, pacing, path to quota |

---

## How to Use

### Option 1: Use with sfdc-report-designer Agent

The **sfdc-report-designer** agent can automatically deploy templates for you:

```
Create a report using the MQL-to-SQL conversion template for our org
```

The agent will:
1. Read the template JSON
2. Adapt to your org's object/field names
3. Create calculated fields if needed
4. Deploy the report
5. Test and validate

### Option 2: Use with sfdc-dashboard-designer Agent

The **sfdc-dashboard-designer** agent can deploy dashboard templates:

```
Create a Team Pipeline dashboard using the manager template
```

The agent will:
1. Create all required source reports
2. Build the dashboard layout
3. Configure filters and components
4. Set refresh schedule
5. Share with appropriate users

### Option 3: Manual Deployment

1. **Read the template JSON** to understand structure
2. **Review prerequisites** (required fields, objects)
3. **Create calculated fields** as specified
4. **Create source reports** (for dashboards)
5. **Build report/dashboard** in Salesforce UI following template metadata
6. **Test and validate** with sample data

---

## Template Structure

Each template follows this standard format:

```json
{
  "templateMetadata": {
    "templateName": "Human-readable name",
    "templateVersion": "1.0",
    "description": "What this template does",
    "audience": "Who should use this",
    "useCase": "When to use this",
    "prerequisites": ["Required fields/objects"]
  },
  "reportMetadata": {
    "name": "Report name with {Period} placeholder",
    "reportType": "ContactList | OpportunityList | AccountList | CaseList",
    "reportFormat": "TABULAR | SUMMARY | MATRIX | JOINED",
    "reportFilters": [...],
    "groupingsDown": [...],
    "groupingsAcross": [...],
    "detailColumns": [...],
    "aggregates": [...],
    "chart": {...}
  },
  "calculatedFieldsRequired": [
    {
      "fieldName": "Field_Name__c",
      "fieldType": "Formula (Text | Number | Currency | Date | Percent)",
      "formula": "IF(condition, value_if_true, value_if_false)",
      "description": "What this field does"
    }
  ],
  "deploymentInstructions": {
    "steps": ["Step-by-step deployment guide"]
  }
}
```

---

## Customization

### Common Customizations

#### 1. Field Name Mapping
If your org uses different field names:

```json
"reportFilters": [
  {"column": "Account.Health_Score__c", "operator": "equals", "value": "Red,Yellow"}
]
```

Change to your org's field name:
```json
"reportFilters": [
  {"column": "Account.Customer_Health__c", "operator": "equals", "value": "At Risk,Warning"}
]
```

#### 2. Date Range Adjustments
Templates use standard date literals. Adjust as needed:

- `THIS_FISCAL_QUARTER` → `THIS_QUARTER` (calendar quarters)
- `LAST_90_DAYS` → `LAST_N_DAYS:60` (custom range)
- `NEXT_2_QUARTERS` → `THIS_FISCAL_YEAR` (broader range)

#### 3. Quota/Target Values
Templates include placeholder targets. Update to match your org:

```json
"target": "$5M"  // Change to your actual quota
"greenZone": ">95%"  // Adjust thresholds as needed
```

#### 4. Picklist Values
Templates assume standard picklist values. Update for your org:

```json
"picklistValues": ["Price - Too Expensive", "Lost to Competitor", "Timing - Not Ready"]
```

#### 5. Record Type Filters
If using record types, add filters:

```json
"reportFilters": [
  {"column": "RecordType", "operator": "equals", "value": "Enterprise Sales"}
]
```

---

## Calculated Fields

Many templates require calculated fields. Here's how to create them:

### Formula Field Creation Steps
1. **Setup** → **Object Manager** → Select Object
2. **Fields & Relationships** → **New**
3. **Formula** → Select Return Type
4. **Paste formula** from template
5. **Check Syntax** → **Save**

### Common Formula Patterns

#### Text Formula (Status/Category)
```
IF(field >= threshold, 'Category A', 'Category B')
```

#### Number Formula (Days/Count)
```
TODAY() - CreatedDate
```

#### Currency Formula (Calculations)
```
Amount * (Probability / 100)
```

#### Percent Formula (Ratios)
```
Closed_Won__c / Total_Closed__c
```

---

## Deployment Best Practices

### Pre-Deployment Checklist
- [ ] Verify all prerequisite objects/fields exist
- [ ] Create calculated fields first
- [ ] Test formulas with sample data
- [ ] Review filter logic for org-specific needs
- [ ] Confirm user permissions for report/dashboard access

### Post-Deployment Validation
- [ ] Run report/dashboard with sample data
- [ ] Verify metrics match expectations
- [ ] Test filters and drill-down functionality
- [ ] Confirm chart types display correctly
- [ ] Share with pilot users for feedback

### Sharing and Permissions
- **Executive Dashboards**: Share with C-level (view-only)
- **Manager Dashboards**: Share with managers (editor for customization)
- **Individual Dashboards**: Personal (each user sees their own) or shared with all reps

---

## Org-Specific Adaptations

### Contact-First vs Lead-Based Orgs

**Lead-based orgs** (high LAI score):
- Use Lead reports for prospecting metrics
- MQL/SQL tracking on Lead object
- Lead → Opportunity conversion reports

**Contact-first orgs** (low LAI score):
- Use Contact reports instead of Leads
- Lifecycle stages on Contact object
- Contact → Opportunity association reports

**Template Adaptation**:
```json
// Lead-based org
"reportType": "LeadList"

// Contact-first org
"reportType": "ContactList"
```

### CPQ Orgs (Salesforce CPQ)

If using CPQ, some templates need adjustments:

**Quote-based metrics**:
- Use `SBQQ__Quote__c` instead of `Opportunity` for proposal stage
- Track `SBQQ__QuoteLine__c` for product-level detail
- Use `SBQQ__Contracted__c` field to identify closed quotes

**Template Adaptation**:
```json
// Standard org
"sourceReport": "opportunity-pipeline"

// CPQ org
"sourceReport": "quote-pipeline"
```

---

## Troubleshooting

### Issue: "Field Does Not Exist" Error
**Cause**: Template references fields not in your org
**Solution**:
1. Review `calculatedFieldsRequired` section
2. Create missing calculated fields
3. Or map to equivalent existing fields

### Issue: "No Data Showing" in Report
**Cause**: Filters too restrictive or no matching data
**Solution**:
1. Temporarily remove all filters
2. Add filters back one at a time
3. Verify data exists for filter criteria

### Issue: Chart Not Displaying
**Cause**: Report format incompatible with chart type
**Solution**:
- Funnel charts require grouped reports (not tabular)
- Matrix charts require 2D grouping
- Line charts need date-based grouping

### Issue: Dashboard Components Not Refreshing
**Cause**: Reports referenced by dashboard don't exist
**Solution**:
1. Create all source reports first (listed in `sourceReportTemplates`)
2. Then create dashboard
3. Link dashboard components to actual report IDs

### Issue: Performance is Slow
**Cause**: Large data volume, no indexes, or inefficient filters
**Solution**:
1. Add selective filters (date range, record type)
2. Index frequently filtered fields
3. Hide detail rows on summary reports
4. Use report snapshots for historical trends

---

## KPI Definitions & Benchmarks

### Sales Metrics

| KPI | Formula | Benchmark | Why It Matters |
|-----|---------|-----------|----------------|
| Quota Attainment | Closed Won / Quota | 100% = on target | Primary performance measure |
| Win Rate | Closed Won / Total Closed | 20-30% (B2B SaaS) | Sales effectiveness |
| Pipeline Coverage | Open Pipeline / Quota | 3-4x | Forecast confidence |
| Avg Deal Size | Total Revenue / Deal Count | Varies by segment | Revenue predictability |
| Sales Cycle Length | Avg days from created to closed | <90 days typical | Sales efficiency |

### Marketing Metrics

| KPI | Formula | Benchmark | Why It Matters |
|-----|---------|-----------|----------------|
| MQL→SQL Conversion | SQLs / MQLs | 40-60% | Lead quality |
| SQL→Opp Conversion | Opps / SQLs | 60-80% | Handoff effectiveness |
| Opp→Won Conversion | Closed Won / Opps | 20-30% | Overall funnel health |
| Cost per MQL | Campaign Cost / MQLs | $50-200 | Marketing efficiency |
| Campaign ROI | Revenue / Campaign Cost | 5:1 or higher | Investment return |

### Customer Success Metrics

| KPI | Formula | Benchmark | Why It Matters |
|-----|---------|-----------|----------------|
| Net Retention Rate | (Starting ARR + Expansion - Churn) / Starting ARR | 100%+ = healthy | Revenue sustainability |
| Gross Retention Rate | (Starting ARR - Churn) / Starting ARR | 90%+ = healthy | Churn prevention |
| Avg Resolution Time | Sum(Resolution Time) / Case Count | <24 hours (critical) | Support quality |
| CSAT Score | Satisfied Customers / Total Respondents | 80%+ = good | Customer satisfaction |
| Health Score Distribution | % Green/Yellow/Red | 70% green target | Proactive management |

---

## Advanced Usage

### Dynamic Filtering with User Context

Use dynamic filters to show user-specific data:

```json
"reportFilters": [
  {"column": "OwnerId", "operator": "equals", "value": "$User.Id"}
]
```

**Common Dynamic Filters**:
- `$User.Id` - Current user's records
- `$User.Manager` - Direct reports
- `$User.ManagerId` - Manager's records
- `$Profile.Name` - Role-based filtering

### Cross-Filter Reports

For complex relationships, use cross-filters:

```json
"reportCrossFilters": [
  {
    "relatedEntity": "Opportunities",
    "filterType": "WITH",
    "criteria": {"CloseDate": "THIS_QUARTER"}
  }
]
```

**Example**: "Accounts WITH Opportunities closing this quarter"

### Joined Reports

For side-by-side comparisons, create joined reports:

```json
"reportFormat": "JOINED",
"blocks": [
  {"reportType": "Opportunity", "filters": [...]},
  {"reportType": "Opportunity", "filters": [...]}
]
```

**Example**: Compare this quarter's pipeline to last quarter

---

## Template Versioning & Updates

### Version History
- **v1.0** (2025-01) - Initial template library release

### Requesting Template Updates
If you need a template customized or have suggestions:
1. Open issue in the Salesforce Plugin repository
2. Provide org context (CPQ, Lead vs Contact, etc.)
3. Describe desired changes or new template needs

### Contributing Templates
To contribute new templates:
1. Follow the standard JSON structure
2. Include complete metadata, instructions, and KPIs
3. Test in a sandbox environment
4. Submit pull request with template documentation

---

## Related Documentation

- **Design Guidelines**: `.claude-plugins/opspal-salesforce/docs/REPORT_DASHBOARD_DESIGN_GUIDELINES.md`
- **sfdc-report-designer Agent**: `.claude-plugins/opspal-salesforce/agents/sfdc-report-designer.md`
- **sfdc-dashboard-designer Agent**: `.claude-plugins/opspal-salesforce/agents/sfdc-dashboard-designer.md`
- **sfdc-reports-dashboards Agent**: `.claude-plugins/opspal-salesforce/agents/sfdc-reports-dashboards.md`

---

## Quick Start Examples

### Example 1: Deploy Executive Revenue Dashboard

```bash
# Using agent
"Create the Executive Revenue Performance dashboard using the template"

# Manual steps
1. Create 6 source reports (quarterly-revenue-vs-target, monthly-revenue-trend, etc.)
2. Navigate to Dashboards → New Dashboard
3. Add Gauge component (Quarterly Revenue vs Target)
4. Add Line Chart component (Monthly Revenue Trend)
5. Add remaining 4 components per template
6. Set refresh to daily at 6 AM
7. Share with exec team
```

### Example 2: Deploy My Pipeline Report

```bash
# Using agent
"Create my personal pipeline report using the my-pipeline-by-stage template"

# Manual steps
1. Reports → New Report → Opportunities
2. Format: Summary Report
3. Group by: Stage
4. Filter: Owner = My Opportunities, IsClosed = False
5. Add Chart: Funnel
6. Save to My Reports folder
```

### Example 3: Customize for CPQ Org

```bash
# Agent prompt
"Create a quote pipeline report using the pipeline-by-stage template, adapted for our CPQ org"

# Manual adjustments
1. Change report type to SBQQ__Quote__c
2. Use SBQQ__Status__c instead of StageName
3. Filter on SBQQ__Primary__c = TRUE
4. Use SBQQ__NetAmount__c for amounts
```

---

## Support & Feedback

For issues, questions, or template requests:
- **Agent Support**: Use the sfdc-report-designer or sfdc-dashboard-designer agents
- **Documentation**: See REPORT_DASHBOARD_DESIGN_GUIDELINES.md
- **GitHub Issues**: Report bugs or request new templates

---

**Template Library Version**: 1.0
**Last Updated**: January 2025
**Total Templates**: 21 (12 reports + 9 dashboards)
**Maintained by**: Salesforce Plugin Team
