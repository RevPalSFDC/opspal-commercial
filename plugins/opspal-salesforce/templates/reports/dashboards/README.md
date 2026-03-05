# Salesforce Dashboard Templates - User Guide

**Version**: 2.0.0
**Last Updated**: 2025-10-17
**Status**: Production Ready

## Overview

This directory contains 6 production-ready Salesforce dashboard templates that deploy complete report + dashboard combinations in a single command. Each template creates a SUMMARY report and an associated dashboard with pre-configured components, eliminating hours of manual setup.

## Quick Start

```bash
# Deploy a dashboard template
ORG=my-org node scripts/lib/report-template-deployer.js \
  --org my-org \
  --template templates/reports/dashboards/01-pipeline-overview.json \
  --with-dashboard

# Output:
# ✅ Report created: Pipeline Overview Report
# ✅ Dashboard deployed: Pipeline Overview Dashboard (5 components)
# 🔗 URL: https://yourorg.my.salesforce.com/lightning/r/Report/00Oxx000001YYyy/view
```

## Available Dashboard Templates

### 1. Pipeline Overview Dashboard
**File**: `01-pipeline-overview.json`

**Purpose**: Executive-level pipeline visibility with key metrics and opportunity tracking.

**Components**:
- Total Pipeline Value (Metric) - Sum of all open opportunities
- Opportunity Count (Metric) - Number of active opportunities
- Average Deal Size (Metric) - Pipeline value / count
- Pipeline by Stage (Bar Chart) - Visual breakdown by stage
- Top 10 Opportunities (Table) - Highest-value opportunities

**Use Cases**:
- Weekly executive reviews
- Sales forecasting meetings
- Pipeline health monitoring
- Board presentations

**Tested**: ✅ beta-corp Revpal (Report ID: `00OVG000001bx0X2AQ`)

---

### 2. Sales Forecast Dashboard
**File**: `02-sales-forecast.json`

**Purpose**: Quarterly forecast breakdown with commit, best case, and pipeline visibility.

**Components**:
- Commit Forecast (Metric) - High-confidence deals
- Best Case Forecast (Metric) - Upside potential
- Weighted Forecast (Metric) - Probability-adjusted revenue
- Forecast by Category (Bar Chart) - Category breakdown
- This Quarter Opportunities (Table) - All opportunities closing this quarter

**Use Cases**:
- Quarterly business reviews
- Revenue forecasting
- Commit tracking
- Pipeline coverage analysis

**Tested**: ✅ beta-corp Revpal (Report ID: `00OVG000001bx292AA`)

---

### 3. Win/Loss Analysis Dashboard
**File**: `03-win-loss-analysis.json`

**Purpose**: Understand win/loss patterns to improve sales effectiveness.

**Components**:
- Win Rate (Metric) - Percentage of won opportunities
- Average Sales Cycle (Metric) - Days from create to close
- Win/Loss by Stage (Stacked Bar) - Where deals are won/lost
- Loss Reasons (Pie Chart) - Common reasons for losses
- Recent Closed Deals (Table) - Last 30 days

**Use Cases**:
- Sales process optimization
- Competitive analysis
- Training prioritization
- Forecast accuracy improvement

**Status**: Template ready, pending deployment testing

---

### 4. Sales Performance Dashboard
**File**: `04-sales-performance.json`

**Purpose**: Track individual and team performance metrics.

**Components**:
- Top Performers (Leaderboard) - By closed won amount
- Team Quota Attainment (Progress Bar) - Percentage to goal
- Activity Metrics (Table) - Calls, meetings, emails
- Performance Trend (Line Chart) - Monthly performance over time
- Pipeline Coverage (Metric) - Pipeline vs. quota ratio

**Use Cases**:
- Sales team management
- Quota tracking
- Performance reviews
- Coaching and development

**Status**: Template ready, pending deployment testing

---

### 5. Activity Tracking Dashboard
**File**: `05-activity-tracking.json`

**Purpose**: Monitor sales activities and engagement levels.

**Components**:
- Total Activities (Metric) - All logged activities
- Activity Mix (Pie Chart) - Breakdown by type
- Activities by Rep (Bar Chart) - Individual activity levels
- Upcoming Tasks (Table) - Next 7 days
- Overdue Follow-ups (Alert Table) - Missed tasks

**Use Cases**:
- Activity management
- Productivity tracking
- Process compliance
- Lead engagement monitoring

**Status**: Template ready, pending deployment testing

---

### 6. Lead Conversion Dashboard
**File**: `06-lead-conversion.json`

**Purpose**: Track lead generation and conversion effectiveness.

**Components**:
- Total Leads (Metric) - Current month
- Conversion Rate (Metric) - Leads to opportunities
- Lead Source ROI (Table) - Conversion by source
- Lead Aging (Histogram) - Distribution by age
- Top Converting Reps (Leaderboard) - Best converters

**Use Cases**:
- Marketing attribution
- Lead source optimization
- Lead nurturing effectiveness
- SDR/BDR performance

**Status**: Template ready, pending deployment testing

---

## Template Structure

Each dashboard template follows this JSON schema:

```json
{
  "templateMetadata": {
    "name": "Dashboard Name",
    "version": "1.0.0",
    "description": "Purpose and use case",
    "category": "sales|marketing|service",
    "author": "RevPal Engineering",
    "lastModified": "2025-10-17"
  },
  "reportMetadata": {
    "name": "Report Name",
    "reportType": "Opportunity",
    "reportFormat": "SUMMARY",
    "detailColumns": ["FIELD1", "FIELD2"],
    "groupingsDown": [],
    "aggregates": [{"name": "RowCount"}],
    "reportFilters": []
  },
  "dashboardUsage": {
    "enabled": true,
    "title": "Dashboard Title",
    "description": "Dashboard description for users",
    "dashboardType": "LoggedInUser",
    "runningUser": "optional@user.com",
    "components": [
      {
        "title": "Component Title",
        "componentType": "Metric|Bar|Table|Pie|Line|Column",
        "footer": "Optional footer text",
        "layout": {
          "section": "left|middle|right"
        },
        "indicatorBreakpoint1": 75,
        "indicatorBreakpoint2": 50,
        "indicatorHighColor": "#00C853",
        "indicatorMiddleColor": "#FFD600",
        "indicatorLowColor": "#D50000"
      }
    ]
  }
}
```

## Component Types

### Metric
**Purpose**: Display single KPI values

**Properties**:
- `title`: Component header
- `footer`: Descriptive text below value
- `indicatorColors`: Traffic light colors for thresholds

**Example Use Cases**: Total Pipeline, Win Rate, Quota Attainment

---

### Bar
**Purpose**: Compare values across categories

**Properties**:
- `title`: Chart title
- `chartAxisRange`: Auto or manual scale
- `legendPosition`: Top, Bottom, Right

**Example Use Cases**: Pipeline by Stage, Win/Loss by Reason

---

### Table
**Purpose**: Detailed record lists

**Properties**:
- `title`: Table header
- `sortBy`: RowLabelAscending, RowValueDescending, etc.
- Supports row-level actions (view, edit)

**Example Use Cases**: Top Opportunities, Recent Deals, Task Lists

---

### Pie
**Purpose**: Show proportional breakdown

**Properties**:
- `title`: Chart title
- `legendPosition`: Position of legend
- Supports drill-down to details

**Example Use Cases**: Win/Loss Mix, Activity Types, Lead Sources

---

### Line
**Purpose**: Track trends over time

**Properties**:
- `title`: Chart title
- `chartAxisRange`: Y-axis scale
- Supports multiple lines for comparison

**Example Use Cases**: Revenue Trends, Activity Over Time, Conversion Rates

---

### Column
**Purpose**: Vertical bar charts for time series

**Properties**:
- `title`: Chart title
- `legendPosition`: Legend placement
- Supports stacking for multiple dimensions

**Example Use Cases**: Monthly Revenue, Quarterly Attainment

---

## Deployment Options

### Standard Deployment
```bash
ORG=my-org node scripts/lib/report-template-deployer.js \
  --org my-org \
  --template templates/reports/dashboards/01-pipeline-overview.json \
  --with-dashboard
```

**Output**:
- ✅ Report created in target folder
- ✅ Dashboard deployed with all components
- ✅ Dashboard folder created (OpsPal_Dashboards)
- 🔗 Clickable report URL returned

**Deployment Time**: 15-20 seconds

---

### Report Only (No Dashboard)
```bash
ORG=my-org node scripts/lib/report-template-deployer.js \
  --org my-org \
  --template templates/reports/dashboards/01-pipeline-overview.json
```

**Use When**:
- Dashboard quota exhausted
- Testing report functionality only
- Manual dashboard creation preferred

---

### Dry Run (Validation Only)
```bash
ORG=my-org node scripts/lib/report-template-deployer.js \
  --org my-org \
  --template templates/reports/dashboards/01-pipeline-overview.json \
  --with-dashboard \
  --dry-run
```

**Use When**:
- Testing field resolution
- Validating template structure
- Previewing deployment changes

---

### Custom Folder
```bash
ORG=my-org node scripts/lib/report-template-deployer.js \
  --org my-org \
  --template templates/reports/dashboards/01-pipeline-overview.json \
  --with-dashboard \
  --folder "My Custom Reports"
```

**Note**: Folder must exist in target org

---

## Dashboard Types

### LoggedInUser (Default)
**Behavior**: Dashboard runs as the viewing user

**Pros**:
- User sees their own data (respects sharing rules)
- No maintenance of running user
- Personalized experience

**Cons**:
- Org-specific quota limits (typically 1-20 dashboards)
- Can exhaust quickly in small orgs

**Use When**:
- Individual user dashboards
- Team dashboards with shared access
- Quota available

---

### SpecifiedUser
**Behavior**: Dashboard runs as specific user (e.g., integration user)

**Pros**:
- No LoggedInUser quota limit
- Consistent data across all viewers
- Useful for shared executive dashboards

**Cons**:
- Requires valid org user
- User must have data access
- Requires maintenance if user changes

**Configuration**:
```json
{
  "dashboardUsage": {
    "dashboardType": "SpecifiedUser",
    "runningUser": "dashboarduser@yourorg.com"
  }
}
```

**Use When**:
- LoggedInUser quota exhausted
- Need consistent view across users
- Executive/board dashboards

---

## Known Limitations

### 1. LoggedInUser Dashboard Quotas

**Issue**: Salesforce orgs have varying limits on LoggedInUser dashboards.

**Observed Limits**:
- beta-corp Revpal: 1 LoggedInUser dashboard
- Typical orgs: 5-20 LoggedInUser dashboards
- Varies by org edition and configuration

**Error Message**:
```
❌ Dashboard deployment failed
Error: You reached the limit for dashboards run as the logged-in user.
```

**Solutions**:

**Option A: Delete Existing Dashboards**
```bash
# Find existing LoggedInUser dashboards
sf data query \
  --query "SELECT Id, Title, Type FROM Dashboard WHERE Type = 'LoggedInUser'" \
  --target-org my-org

# Delete specific dashboard
sf data delete record --sobject Dashboard --record-id 01Zxx000001YYyy --target-org my-org
```

**Option B: Use SpecifiedUser Dashboard Type**
```json
{
  "dashboardUsage": {
    "dashboardType": "SpecifiedUser",
    "runningUser": "valid.user@yourorg.com"
  }
}
```

**Option C: Manual Dashboard Creation**
- Report will still be created successfully
- Dashboard can be created manually via Salesforce UI
- Components can be added manually

---

### 2. Field Availability

**Issue**: Not all template fields may exist in all orgs.

**Symptoms**:
```
⚠️ Field resolution failed: EXPECTED_REVENUE
✅ Report created with 5/6 fields
```

**Impact**: Non-blocking - Report created without unavailable fields

**Solutions**:
- Use field hints in template to guide resolution
- Customize templates for org-specific fields
- Add missing fields to org if needed

---

### 3. SUMMARY Report Aggregates

**Issue**: Only `RowCount` aggregate supported via REST API.

**Blocked Aggregates**:
- SUM (field totals)
- AVG (field averages)
- MIN / MAX (field ranges)

**Workaround**: Add field aggregates manually via Salesforce UI after deployment

**Future**: Metadata API support may enable field aggregates

---

## Troubleshooting

### Dashboard Deployment Fails

**Symptom**: "You reached the limit for dashboards run as the logged-in user"

**Solution**:
1. Check current LoggedInUser dashboard count:
   ```bash
   sf data query \
     --query "SELECT COUNT(Id) FROM Dashboard WHERE Type = 'LoggedInUser'" \
     --target-org my-org
   ```

2. Delete unused dashboards or switch to SpecifiedUser type

---

### Dashboard Folder Conflict

**Symptom**: "SourceConflictError: conflicts detected"

**Solution**: Automatically handled - script detects existing folders and continues

**Manual Fix** (if needed):
```bash
# Deploy folder first
sf project deploy start \
  --source-dir .temp/force-app/main/default/dashboards/OpsPal_Dashboards-meta.xml \
  --target-org my-org
```

---

### Invalid Running User (SpecifiedUser)

**Symptom**: "Cannot find a user that matches: user@example.com"

**Solution**:
1. Verify user exists in target org:
   ```bash
   sf data query \
     --query "SELECT Id, Username FROM User WHERE Username = 'user@example.com'" \
     --target-org my-org
   ```

2. Update template with valid user or switch to LoggedInUser type

---

### Report Created but Dashboard Missing

**Symptom**: Report deployed successfully, but no dashboard created

**Possible Causes**:
- Dashboard quota exhausted
- Dashboard deployment failed silently
- `--with-dashboard` flag not provided

**Solutions**:
1. Check deployment logs for dashboard errors
2. Verify quota availability
3. Retry with `--with-dashboard` flag
4. Create dashboard manually via Salesforce UI

---

## Customization Guide

### Modifying Component Layout

**Default Layout**: 3-column responsive layout

**Customization**:
```json
{
  "components": [
    {
      "title": "My Component",
      "layout": {
        "section": "left"  // or "middle", "right"
      }
    }
  ]
}
```

**Auto-Distribution**: If `section` not specified, components distributed evenly across columns

---

### Adding Custom Filters

**Example**: Filter opportunities by amount

```json
{
  "reportFilters": [
    {
      "column": "AMOUNT",
      "operator": "greaterThan",
      "value": "50000"
    },
    {
      "column": "STAGE_NAME",
      "operator": "notEqual",
      "value": "Closed Lost"
    }
  ]
}
```

**Supported Operators**:
- `equals`, `notEqual`
- `greaterThan`, `greaterOrEqual`
- `lessThan`, `lessOrEqual`
- `contains`, `notContain`
- `startsWith`

---

### Changing Report Type

**Example**: Switch from Opportunity to Account

```json
{
  "reportMetadata": {
    "reportType": "Account",
    "detailColumns": ["NAME", "BILLINGSTATE", "INDUSTRY"],
    "groupingsDown": [{"field": "INDUSTRY"}]
  }
}
```

**Available Report Types**:
- `Opportunity` - Sales pipeline
- `Account` - Customer data
- `Contact` - Contact records
- `Lead` - Lead generation
- `Case` - Service cases
- `Task` - Activity tracking
- Custom objects: `CustomObject__c`

---

### Adding Time-Based Filters

**Example**: This fiscal quarter

```json
{
  "reportFilters": [
    {
      "column": "CLOSE_DATE",
      "operator": "equals",
      "value": "THIS_FISCAL_QUARTER"
    }
  ]
}
```

**Supported Time Periods**:
- `THIS_FISCAL_QUARTER`, `LAST_FISCAL_QUARTER`
- `THIS_YEAR`, `LAST_YEAR`
- `THIS_MONTH`, `LAST_MONTH`
- `LAST_N_DAYS:90` (use N notation for relative periods)

---

## Best Practices

### 1. Test in Sandbox First
Always deploy to sandbox before production:
```bash
ORG=my-sandbox node scripts/lib/report-template-deployer.js \
  --org my-sandbox \
  --template templates/reports/dashboards/01-pipeline-overview.json \
  --with-dashboard
```

### 2. Use Descriptive Names
Name reports and dashboards clearly for easy discovery:
```json
{
  "reportMetadata": {
    "name": "Q4 2025 Pipeline Overview - APAC Region"
  },
  "dashboardUsage": {
    "title": "Q4 2025 APAC Pipeline Dashboard"
  }
}
```

### 3. Monitor Quota Usage
Check LoggedInUser dashboard count regularly:
```bash
sf data query \
  --query "SELECT COUNT(Id), Type FROM Dashboard GROUP BY Type" \
  --target-org my-org
```

### 4. Document Customizations
Maintain a changelog in template metadata:
```json
{
  "templateMetadata": {
    "customizations": [
      {
        "date": "2025-10-17",
        "author": "user@yourorg.com",
        "change": "Added REGION filter for APAC"
      }
    ]
  }
}
```

### 5. Version Your Templates
Use semantic versioning for template modifications:
```json
{
  "templateMetadata": {
    "version": "1.1.0",
    "changelog": "Added new metric component for average deal size"
  }
}
```

---

## Support

**Documentation**:
- Main guide: `ENHANCED_SUMMARY_REPORTS_DOCUMENTATION.md`
- Test results: `test/DASHBOARD_DEPLOYMENT_TEST_RESULTS_2025-10-17.md`
- Integration test: `test/integration-test-report-2025-10-17.md`

**Code Files**:
- Report deployer: `scripts/lib/report-template-deployer.js`
- Dashboard deployer: `scripts/lib/dashboard-metadata-deployer.js`
- REST API client: `scripts/lib/reports-rest-api.js`

**Example Commands**:
```bash
# Deploy with verbose logging
ORG=my-org VERBOSE=1 node scripts/lib/report-template-deployer.js \
  --org my-org \
  --template templates/reports/dashboards/01-pipeline-overview.json \
  --with-dashboard

# Check deployment logs
cat /tmp/deploy-test-1.log
```

---

## Contributing

To add new dashboard templates:

1. **Copy existing template** as starting point
2. **Modify report metadata** (fields, filters, groupings)
3. **Configure dashboard components** (metrics, charts, tables)
4. **Test deployment** in sandbox
5. **Document use cases** in this README
6. **Add to version control** with descriptive commit message

**Template Checklist**:
- [ ] Valid JSON structure
- [ ] All required fields present
- [ ] Dashboard components configured
- [ ] Use case documented
- [ ] Tested in at least one org
- [ ] Version incremented

---

**Version**: 2.0.0
**Last Updated**: 2025-10-17
**Maintained By**: RevPal Engineering
**Status**: Production Ready
