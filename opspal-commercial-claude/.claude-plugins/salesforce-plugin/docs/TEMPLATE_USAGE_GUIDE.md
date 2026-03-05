# Salesforce Reports & Dashboards Template Usage Guide

## Overview

This guide demonstrates how to use the enterprise-grade Reports & Dashboards framework, which includes:

- **21 Pre-Built Templates** (12 reports, 9 dashboards)
- **4 Intelligence Scripts** (chart selection, layout optimization, quality validation)
- **4 Specialized Agents** (designers, analyzers, report builders)
- **Comprehensive Design Guidelines** (10,000+ word reference)

**Version**: 1.0.0
**Last Updated**: 2025-10-17
**Framework Version**: Phase 1-4 Complete

---

## Quick Start

### 30-Second Quickstart

```bash
# 1. Create a report using a template
Ask agent: "Create an MQL to SQL conversion report using the marketing template"

# 2. Validate quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX

# 3. Create a dashboard using a template
Ask agent: "Create a team pipeline dashboard using the manager template"

# 4. Optimize layout
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY
```

### 5-Minute Setup

**Prerequisites:**
- Salesforce org with API access
- SF CLI installed and authenticated
- Node.js 16+ installed
- salesforce-plugin installed

**Setup Steps:**
```bash
# 1. Navigate to plugin directory
cd .claude-plugins/salesforce-plugin

# 2. Install dependencies (if needed)
npm install

# 3. Authenticate to Salesforce org
sf org login web --alias my-org

# 4. Verify template access
ls templates/reports/
ls templates/dashboards/

# 5. Test intelligence scripts
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --help
```

---

## Template Catalog

### Report Templates (12)

#### Marketing Templates

**1. Marketing Lifecycle Funnel** (`templates/reports/marketing/lifecycle-funnel.json`)
- **Purpose**: Track contacts through marketing lifecycle stages
- **Audience**: Marketing Managers, Demand Generation
- **Key Metrics**: Stage-by-stage conversion rates
- **Prerequisites**: Custom field `Lifecycle_Stage__c` on Contact
- **Use With Agent**: `sfdc-report-designer`

**2. MQL to SQL Conversion** (`templates/reports/marketing/mql-to-sql-conversion.json`)
- **Purpose**: Measure marketing-to-sales handoff efficiency
- **Audience**: Marketing Operations, Sales Development
- **Key Metrics**: MQL→SQL conversion rate, average days to SQL
- **Prerequisites**: `Is_MQL__c`, `Is_SQL__c`, `Days_to_SQL__c` fields
- **Use With Agent**: `sfdc-report-designer`

**3. Campaign ROI** (`templates/reports/marketing/campaign-roi.json`)
- **Purpose**: Calculate return on investment for campaigns
- **Audience**: Marketing Leadership
- **Key Metrics**: Cost per lead, cost per opportunity, ROI percentage
- **Prerequisites**: Campaign `Actual_Cost__c` and `Expected_Revenue__c` fields
- **Use With Agent**: `sfdc-report-designer`

#### Sales Rep Templates

**4. My Pipeline by Stage** (`templates/reports/sales-reps/my-pipeline-by-stage.json`)
- **Purpose**: Personal pipeline management
- **Audience**: Individual Sales Reps
- **Key Metrics**: Total opportunity value by stage
- **Prerequisites**: Standard Opportunity object
- **Dynamic Filter**: OwnerId = $User.Id
- **Use With Agent**: `sfdc-report-designer`

**5. Speed to Lead** (`templates/reports/sales-reps/speed-to-lead.json`)
- **Purpose**: Track lead response time
- **Audience**: Sales Development Reps
- **Key Metrics**: Average hours to first contact
- **Prerequisites**: `Hours_to_First_Contact__c` field on Contact
- **Org Adaptation**: Contact-first orgs (uses Contact instead of Lead)
- **Use With Agent**: `sfdc-report-designer`

#### Sales Leader Templates

**6. Team Performance** (`templates/reports/sales-leaders/team-performance.json`)
- **Purpose**: Track team quota attainment
- **Audience**: Sales Managers, VPs of Sales
- **Key Metrics**: Quota attainment %, closed revenue, pipeline coverage
- **Prerequisites**: `Quota__c` field on User
- **Use With Agent**: `sfdc-report-designer`

**7. Win-Loss Analysis** (`templates/reports/sales-leaders/win-loss-analysis.json`)
- **Purpose**: Identify win/loss patterns
- **Audience**: Sales Leadership, Revenue Operations
- **Key Metrics**: Win rate by segment, loss reasons
- **Prerequisites**: `Loss_Reason__c` picklist on Opportunity
- **Use With Agent**: `sfdc-report-designer`

**8. Forecast Accuracy** (`templates/reports/sales-leaders/forecast-accuracy.json`)
- **Purpose**: Measure forecast reliability
- **Audience**: Sales Leadership, CRO
- **Key Metrics**: Commit vs Actual revenue, forecast accuracy %
- **Prerequisites**: `Forecast_Category__c` standard field
- **Report Format**: Matrix (recommended for cross-tab analysis)
- **Use With Agent**: `sfdc-report-designer`

#### Customer Success Templates

**9. Account Health** (`templates/reports/customer-success/account-health.json`)
- **Purpose**: Identify at-risk accounts
- **Audience**: Customer Success Managers
- **Key Metrics**: Health score, risk flag, account value
- **Prerequisites**: `Health_Score__c`, `Risk_Flag__c` fields on Account
- **Use With Agent**: `sfdc-report-designer`

**10. Renewal Pipeline** (`templates/reports/customer-success/renewal-pipeline.json`)
- **Purpose**: Track upcoming renewals
- **Audience**: Customer Success Leadership
- **Key Metrics**: Renewal value by quarter, at-risk renewals
- **Prerequisites**: `Renewal_Date__c`, `Renewal_Risk__c` fields on Opportunity
- **Use With Agent**: `sfdc-report-designer`

**11. Support Trends** (`templates/reports/customer-success/support-trends.json`)
- **Purpose**: Monitor case volume and resolution
- **Audience**: Support Managers
- **Key Metrics**: Case volume, average resolution time
- **Prerequisites**: Standard Case object
- **Use With Agent**: `sfdc-report-designer`

### Dashboard Templates (9)

#### Executive Templates

**12. Revenue Performance** (`templates/dashboards/executive/revenue-performance.json`)
- **Purpose**: Executive revenue overview
- **Audience**: CEO, CFO, CRO, Board
- **Component Count**: 6 (optimal for executive consumption)
- **Key Metrics**: Quarterly revenue vs target, revenue trends, pipeline stages
- **Layout Pattern**: F-pattern (most important metrics top-left)
- **Use With Agent**: `sfdc-dashboard-designer`

**13. Pipeline Health** (`templates/dashboards/executive/pipeline-health.json`)
- **Purpose**: Pipeline quality assessment
- **Audience**: CRO, VP Sales
- **Component Count**: 7
- **Key Metrics**: Pipeline coverage ratio, win rates, stalled deals
- **Use With Agent**: `sfdc-dashboard-designer`

**14. Team Productivity** (`templates/dashboards/executive/team-productivity.json`)
- **Purpose**: Team performance overview
- **Audience**: CRO, VP Sales
- **Component Count**: 6
- **Key Metrics**: Team quota attainment, rep performance, activity metrics
- **Use With Agent**: `sfdc-dashboard-designer`

#### Manager Templates

**15. Team Pipeline** (`templates/dashboards/manager/team-pipeline.json`)
- **Purpose**: Manager's team pipeline view
- **Audience**: Sales Managers, Team Leads
- **Component Count**: 7
- **Key Metrics**: Team pipeline by rep, stage distribution, deal velocity
- **Dynamic Filter**: Owner.Manager = $User.Id
- **Use With Agent**: `sfdc-dashboard-designer`

**16. Activity Metrics** (`templates/dashboards/manager/activity-metrics.json`)
- **Purpose**: Team activity tracking
- **Audience**: Sales Managers
- **Component Count**: 6
- **Key Metrics**: Team activities, inactive reps, activity trends
- **Use With Agent**: `sfdc-dashboard-designer`

**17. Quota Attainment** (`templates/dashboards/manager/quota-attainment.json`)
- **Purpose**: Team quota performance
- **Audience**: Sales Managers
- **Component Count**: 6
- **Key Metrics**: Team quota attainment, at-risk reps, top performers
- **Use With Agent**: `sfdc-dashboard-designer`

#### Individual Contributor Templates

**18. My Pipeline** (`templates/dashboards/individual/my-pipeline.json`)
- **Purpose**: Personal pipeline view
- **Audience**: Sales Reps, Account Executives
- **Component Count**: 6
- **Key Metrics**: My pipeline by stage, quota attainment, next actions
- **Dynamic Filter**: OwnerId = $User.Id
- **Use With Agent**: `sfdc-dashboard-designer`

**19. My Activities** (`templates/dashboards/individual/my-activities.json`)
- **Purpose**: Daily activity tracking
- **Audience**: Sales Reps, SDRs
- **Component Count**: 5
- **Key Metrics**: Daily activity count, activity trends, productivity score
- **Use With Agent**: `sfdc-dashboard-designer`

**20. My Quota** (`templates/dashboards/individual/my-quota.json`)
- **Purpose**: Personal quota tracking
- **Audience**: Sales Reps, Account Executives
- **Component Count**: 6
- **Key Metrics**: Quota attainment, pacing, forecasted close
- **Use With Agent**: `sfdc-dashboard-designer`

---

## Intelligence Scripts

### 1. Chart Type Selector

**Purpose**: AI-powered chart type recommendations based on data patterns

**Usage:**
```bash
# Basic usage
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX

# With audience context
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX --audience executive

# With position context (dashboard placement)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX --position top-left

# JSON output
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX --output json
```

**Data Patterns Detected:**
1. **Trend Over Time** → Line Chart, Area Chart
2. **Comparison** → Bar Chart, Column Chart
3. **Part-to-Whole** → Donut Chart, Funnel Chart
4. **Sequential Process** → Funnel Chart
5. **Correlation** → Scatter Chart
6. **Ranking** → Bar Chart
7. **Single Metric** → Gauge, Metric
8. **Target vs Actual** → Gauge
9. **Distribution** → Column Chart

**Example Output:**
```
Chart Type Recommendations for Report: MQL to SQL Conversion

Data Pattern Detected: Sequential Process (MQL → SQL flow)

Recommendations:
1. Funnel Chart (Score: 95/100) ⭐ RECOMMENDED
   Rationale: Perfect for conversion funnels, clearly shows drop-off at each stage
   Use Cases: Marketing funnels, sales process stages, qualification flows

2. Bar Chart (Score: 75/100)
   Rationale: Good for showing comparisons between stages
   Use Cases: Alternative view, stage comparison focus

3. Table (Score: 60/100)
   Rationale: Provides detailed data but lacks visual impact
   Use Cases: Drill-down reports, detailed analysis
```

### 2. Dashboard Layout Optimizer

**Purpose**: Optimize component placement using F-pattern visual hierarchy

**Usage:**
```bash
# Basic usage
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY

# With audience context
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY --audience manager

# Dry-run mode (preview without applying)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY --dry-run

# JSON output
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY --output json
```

**Optimization Features:**
- **Importance Scoring**: Calculates 0-100 importance for each component
- **F-Pattern Layout**: Places high-importance components top-left
- **Size Optimization**: Adjusts component sizes based on importance
- **Row Balancing**: Prevents orphaned small components
- **Grid System**: 12-column Bootstrap-style grid

**Example Output:**
```
Dashboard Layout Optimization for: Team Pipeline Dashboard

Component Importance Scores:
1. "Team Quota Attainment" (Gauge) - 95/100 → Row 1, Col 1, Size: Large
2. "Pipeline by Stage" (Funnel) - 85/100 → Row 1, Col 7, Size: Medium
3. "Top Performers" (Table) - 75/100 → Row 2, Col 1, Size: Medium
4. "Activity This Week" (Metric) - 70/100 → Row 2, Col 7, Size: Small
5. "Pipeline Trend" (Line) - 65/100 → Row 3, Col 1, Size: Medium

Layout Quality Score: 88/100 (A)
- F-Pattern Applied: ✅ Yes
- Component Balance: ✅ Good (no orphaned small components)
- Importance Placement: ✅ Optimal (highest importance at top-left)
```

### 3. Dashboard Quality Validator

**Purpose**: Enterprise-grade quality assessment with 8-dimensional scoring

**Usage:**
```bash
# Basic usage
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY

# With threshold (fail if below score)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY --threshold 70

# JSON output for automation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY --output json

# Include recommendations
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY --recommendations
```

**8 Quality Dimensions:**
1. **Component Count** (15% weight) - Optimal: 5-7 components
2. **Naming Convention** (10% weight) - Clear, descriptive titles
3. **Chart Appropriateness** (20% weight) - Right chart for data pattern
4. **Visual Hierarchy** (15% weight) - F-pattern application
5. **Filter Usage** (10% weight) - Appropriate filters, not excessive
6. **Performance** (10% weight) - Row limits, refresh frequency
7. **Audience Alignment** (15% weight) - Matches audience needs
8. **Actionability** (15% weight) - Enables decision-making

**Grading Scale:**
- **A+ (95-100)**: Exceptional quality, best practices exemplified
- **A (90-94)**: Excellent quality, minor improvements only
- **A- (85-89)**: Very good quality, few issues
- **B+ (80-84)**: Good quality, some improvements needed
- **B (75-79)**: Above average, several improvements needed
- **B- (70-74)**: Acceptable quality, notable improvements needed
- **C+ (65-69)**: Below average, significant improvements needed
- **C (60-64)**: Poor quality, major rework needed
- **C- (55-59)**: Very poor quality, complete redesign recommended
- **D (50-54)**: Failing quality, unusable
- **F (<50)**: Completely failing, start over

**Example Output:**
```
Dashboard Quality Report: Team Pipeline Dashboard

Overall Score: 87/100 (A-)
Grade: A- (Very Good Quality)

Dimension Scores:
✅ Component Count: 100/100 (6 components - optimal)
✅ Naming Convention: 95/100 (Clear, descriptive titles)
✅ Chart Appropriateness: 90/100 (Appropriate chart types for data)
⚠️  Visual Hierarchy: 75/100 (F-pattern partially applied)
✅ Filter Usage: 90/100 (Appropriate filters)
✅ Performance: 85/100 (Good refresh settings, row limits applied)
✅ Audience Alignment: 95/100 (Perfect for manager audience)
⚠️  Actionability: 80/100 (Enables decisions, could add more CTAs)

Issues Found (2):
1. [Visual Hierarchy] Component 4 ("Pipeline Trend") has high importance but is placed at bottom-right
2. [Actionability] No direct links to report drill-downs from components 3 and 5

Recommendations (3):
1. Move "Pipeline Trend" to top-left position (F-pattern hot zone)
2. Add report links to "Top Performers" and "At Risk Deals" components
3. Consider adding a "Next Actions" component with actionable items

Quality Improvement Potential: +8 points (target: A grade, 95/100)
```

### 4. Report Quality Validator

**Purpose**: Enterprise-grade report quality assessment with 8-dimensional scoring

**Usage:**
```bash
# Basic usage
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX

# With threshold
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX --threshold 70

# JSON output
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX --output json

# Include recommendations
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX --recommendations
```

**8 Quality Dimensions:**
1. **Format Selection** (20% weight) - Right format for use case
2. **Naming Convention** (10% weight) - Clear, searchable names
3. **Filter Usage** (15% weight) - Appropriate filters
4. **Field Selection** (15% weight) - Relevant fields only
5. **Grouping Logic** (15% weight) - Meaningful groupings
6. **Chart Usage** (10% weight) - Chart supports insight
7. **Performance** (15% weight) - Row limits, indexable filters
8. **Documentation** (5% weight) - Description present

**Example Output:**
```
Report Quality Report: MQL to SQL Conversion

Overall Score: 92/100 (A)
Grade: A (Excellent Quality)

Dimension Scores:
✅ Format Selection: 100/100 (Summary format perfect for grouped data)
✅ Naming Convention: 95/100 (Clear, follows convention)
✅ Filter Usage: 90/100 (Appropriate filters, date range set)
✅ Field Selection: 95/100 (Relevant fields, no clutter)
✅ Grouping Logic: 90/100 (Grouped by lifecycle stage - appropriate)
⚠️  Chart Usage: 80/100 (Funnel chart used, but could optimize sizing)
✅ Performance: 90/100 (Row limit set, indexed fields used)
⚠️  Documentation: 75/100 (Description present but could be more detailed)

Issues Found (2):
1. [Chart Usage] Chart height set to 200px - increase to 300px for better readability
2. [Documentation] Report description lacks usage instructions and data source info

Recommendations (3):
1. Increase chart height to 300-400px for executive dashboards
2. Enhance description to include: data source, refresh frequency, typical use cases
3. Consider adding a "Days in Stage" calculated field for conversion velocity

Quality Improvement Potential: +3 points (target: A+ grade, 95/100)
```

---

## Agent Workflows

### Workflow 1: Create Report from Template

**Agent**: `sfdc-report-designer`

**Steps:**
1. Ask the agent to create a report using a specific template
2. Agent loads template JSON
3. Agent adapts field mappings for your org
4. Agent creates prerequisite fields (if needed)
5. Agent builds report in Salesforce
6. Agent validates quality using report-quality-validator.js
7. Agent provides quality score and Salesforce ID

**Example Conversation:**
```
You: Create an MQL to SQL conversion report using the marketing template for our org

Agent: I'll create an MQL to SQL Conversion report using the enterprise template.

[Agent performs org analysis]
Detected: Contact-first org (LAI: 0.85)
Adapting template for Contact object instead of Lead...

[Agent checks prerequisites]
✅ Field exists: Is_MQL__c (checkbox)
❌ Field missing: Days_to_SQL__c (will create)

Creating calculated field: Days_to_SQL__c
Formula: IF(AND(Is_MQL__c, Is_SQL__c), SQL_Date__c - MQL_Date__c, NULL)

[Agent creates report]
Creating Summary report with grouping by Lifecycle Stage...

[Agent validates quality]
Running quality validation...

✅ MQL TO SQL CONVERSION REPORT CREATED

📊 Report Details:
- Salesforce ID: 00O8c00000012345
- Template Used: mql-to-sql-conversion (templates/reports/marketing/)
- Org Adaptation: Contact-first (LAI: 0.85)

📈 Quality Score: A (92/100)
- Format Selection: 100/100 (Summary format optimal for grouped data)
- Naming Convention: 95/100 (Clear, searchable)
- Filter Usage: 90/100 (Appropriate date filters)
- Field Selection: 95/100 (All relevant fields included)
- Grouping Logic: 90/100 (Grouped by lifecycle stage)
- Chart Usage: 85/100 (Funnel chart appropriate)
- Performance: 90/100 (Row limit: 2000, indexed filters)
- Documentation: 75/100 (Description present)

📋 Chart Recommendation: Funnel Chart (Score: 95/100)
- Best for: Sequential process visualization
- Data Pattern: MQL → SQL conversion flow

🎯 Next Steps:
1. View report: https://your-org.lightning.force.com/lightning/r/Report/00O8c00000012345/view
2. Add to dashboard: Ask me to create a dashboard using this report
3. Improve quality: Address the 1 issue found (enhance description)
```

### Workflow 2: Create Dashboard from Template

**Agent**: `sfdc-dashboard-designer`

**Steps:**
1. Ask the agent to create a dashboard using a specific template
2. Agent loads template JSON
3. Agent creates required reports (or uses existing)
4. Agent optimizes layout using dashboard-layout-optimizer.js
5. Agent builds dashboard in Salesforce
6. Agent validates quality using dashboard-quality-validator.js
7. Agent provides quality score and Salesforce ID

**Example Conversation:**
```
You: Create a team pipeline dashboard using the manager template

Agent: I'll create a Team Pipeline dashboard for managers using the enterprise template.

[Agent loads template]
Template: team-pipeline (7 components)
Audience: Sales Managers, Team Leads

[Agent checks required reports]
Required reports (7):
1. ✅ Team Pipeline by Rep (exists: 00O8c00000012301)
2. ❌ Pipeline by Stage (will create)
3. ❌ Top Performers This Quarter (will create)
4. ✅ At Risk Deals (exists: 00O8c00000012302)
5. ❌ Team Activity Metrics (will create)
6. ❌ Pipeline Trend (will create)
7. ✅ Deal Velocity (exists: 00O8c00000012303)

Creating 4 missing reports...
[Reports created]

[Agent optimizes layout]
Running layout optimizer...

Component Importance Scores:
1. "Team Quota Attainment" → 95/100 → Row 1, Col 1 (Large)
2. "Pipeline by Stage" → 85/100 → Row 1, Col 7 (Medium)
3. "Top Performers" → 80/100 → Row 2, Col 1 (Medium)
4. "At Risk Deals" → 75/100 → Row 2, Col 7 (Medium)
5. "Team Activity" → 70/100 → Row 3, Col 1 (Small)
6. "Pipeline Trend" → 70/100 → Row 3, Col 5 (Medium)
7. "Deal Velocity" → 65/100 → Row 3, Col 9 (Small)

Layout Quality: 90/100 (F-pattern applied, balanced rows)

[Agent creates dashboard]
Creating dashboard with 7 components...

[Agent validates quality]
Running quality validation...

✅ TEAM PIPELINE DASHBOARD CREATED

📊 Dashboard Details:
- Salesforce ID: 01Z8c00000056789
- Template Used: team-pipeline (templates/dashboards/manager/)
- Component Count: 7 (optimal for managers)

📈 Quality Score: A- (88/100)
- Component Count: 100/100 (7 components - optimal)
- Naming Convention: 95/100 (Clear, descriptive)
- Chart Appropriateness: 90/100 (Appropriate types)
- Visual Hierarchy: 85/100 (F-pattern applied)
- Filter Usage: 85/100 (Dynamic manager filter)
- Performance: 90/100 (Daily refresh, row limits)
- Audience Alignment: 95/100 (Perfect for managers)
- Actionability: 80/100 (Enables decisions)

🎨 Layout Optimization:
- F-Pattern Applied: ✅ Yes
- Most Important Component: "Team Quota Attainment" (top-left, gauge)
- Secondary Focus: "Pipeline by Stage" (top-right, funnel)

📋 Components & Chart Types:
1. Team Quota Attainment (Gauge) - Best for target tracking
2. Pipeline by Stage (Funnel) - Optimal for stage visualization
3. Top Performers (Table) - Best for rankings
4. At Risk Deals (Table) - Actionable list
5. Team Activity (Metric) - Quick KPI view
6. Pipeline Trend (Line) - Trend visualization
7. Deal Velocity (Metric) - Speed indicator

⚠️  Issues Found (1):
1. [Actionability] Consider adding direct links to report drill-downs

🎯 Next Steps:
1. View dashboard: https://your-org.lightning.force.com/lightning/r/Dashboard/01Z8c00000056789/view
2. Share with managers: Set up folder permissions
3. Improve quality: Add report drill-down links (+7 points → A grade)
```

### Workflow 3: Analyze and Improve Existing Dashboard

**Agent**: `sfdc-dashboard-analyzer`

**Steps:**
1. Ask the agent to analyze an existing dashboard
2. Agent fetches dashboard metadata
3. Agent runs quality validation
4. Agent identifies improvement opportunities
5. Agent provides actionable recommendations
6. (Optional) Agent creates optimized replica

**Example Conversation:**
```
You: Analyze dashboard 01Z8c00000056789 and provide quality improvements

Agent: I'll analyze the dashboard and provide quality improvement recommendations.

[Agent fetches metadata]
Dashboard: Team Pipeline Dashboard
Owner: Sales Manager
Component Count: 7
Last Modified: 2025-10-15

[Agent runs quality validation]
Running dashboard quality validator...

📊 DASHBOARD QUALITY ANALYSIS

Current Quality Score: B+ (82/100)

Dimension Breakdown:
✅ Component Count: 100/100 (7 components - optimal)
✅ Naming Convention: 95/100 (Clear titles)
⚠️  Chart Appropriateness: 75/100 (2 issues found)
⚠️  Visual Hierarchy: 70/100 (Poor layout)
✅ Filter Usage: 90/100 (Appropriate filters)
✅ Performance: 85/100 (Good settings)
✅ Audience Alignment: 90/100 (Good for managers)
⚠️  Actionability: 75/100 (Missing drill-downs)

🔍 Issues Found (5):

HIGH PRIORITY:
1. [Visual Hierarchy - Score: 70/100]
   Problem: "Pipeline Trend" component has high importance (85/100) but is placed at bottom-right
   Impact: Users may miss critical trend information
   Fix: Move to Row 1, Col 1 (top-left position)

2. [Chart Appropriateness - Score: 75/100]
   Problem: "Top Performers" uses Bar Chart for ranking data
   Impact: Horizontal bars make comparison harder
   Fix: Use Table component for rankings (better for 5+ items)

MEDIUM PRIORITY:
3. [Actionability - Score: 75/100]
   Problem: No drill-down links on "Top Performers" and "At Risk Deals"
   Impact: Users must manually find detail reports
   Fix: Add report links to these components

4. [Chart Appropriateness - Score: 75/100]
   Problem: "Team Activity" uses Metric component but shows trend data
   Impact: Trend information is hidden
   Fix: Change to Line Chart to show activity trend over time

LOW PRIORITY:
5. [Naming Convention - Score: 95/100]
   Problem: Component titles lack emoji or visual indicators
   Impact: Minor UX improvement opportunity
   Fix: Add emojis (🎯 for quota, 📈 for trends, ⚠️ for risks)

📈 Quality Improvement Plan

Target Score: A- (88/100) - +6 point improvement

Actions Required:
1. ✅ IMPLEMENT: Move "Pipeline Trend" to top-left position (+3 points)
2. ✅ IMPLEMENT: Change "Top Performers" from Bar Chart to Table (+2 points)
3. ✅ IMPLEMENT: Add drill-down links to 2 components (+3 points)
4. ⚠️  CONSIDER: Change "Team Activity" to Line Chart (+2 points)
5. 🔲 OPTIONAL: Add emojis to titles (+1 point)

Estimated Improvement: +8 points → A (90/100)

🎯 Next Steps:
1. Create optimized replica: "Yes, create an improved version"
2. Manual updates: I can provide step-by-step instructions
3. Defer improvements: Bookmark this analysis for later

Would you like me to create an optimized replica dashboard?
```

### Workflow 4: Migrate Dashboard to New Org

**Agent**: `sfdc-dashboard-analyzer`

**Steps:**
1. Ask the agent to migrate a dashboard from source org to target org
2. Agent analyzes source dashboard (including quality baseline)
3. Agent decomposes dashboard into reports
4. Agent creates migration blueprint
5. Agent adapts for target org (field mappings, object differences)
6. Agent recreates in target org with quality improvements
7. Agent validates quality parity (replica >= original score)

**Example Conversation:**
```
You: Migrate dashboard 01Z8c00000056789 from production to sandbox, maintain quality

Agent: I'll migrate the Team Pipeline Dashboard from production to sandbox with quality assurance.

[Agent analyzes source dashboard]
Source Org: production-org
Source Dashboard: Team Pipeline Dashboard (01Z8c00000056789)

[Agent runs baseline quality assessment]
Running quality validation on source dashboard...

📊 SOURCE DASHBOARD QUALITY (Baseline)

Quality Score: B+ (82/100)
Grade: B+ (Good Quality)

[Agent decomposes dashboard]
Dashboard Components (7):
1. Team Quota Attainment (Gauge) → Report: 00O8c00000012301
2. Pipeline by Stage (Funnel) → Report: 00O8c00000012302
3. Top Performers (Table) → Report: 00O8c00000012303
4. At Risk Deals (Table) → Report: 00O8c00000012304
5. Team Activity (Metric) → Report: 00O8c00000012305
6. Pipeline Trend (Line) → Report: 00O8c00000012306
7. Deal Velocity (Metric) → Report: 00O8c00000012307

[Agent analyzes report dependencies]
Required Objects: Opportunity, User, OpportunityHistory
Required Fields:
- Opportunity: Amount, StageName, CloseDate, OwnerId, Probability
- User: Quota__c (custom), ManagerId
- OpportunityHistory: StageName, CreatedDate

[Agent checks target org]
Target Org: sandbox-org
Verifying field availability...
✅ All required fields present in target org
⚠️  Field mapping needed: User.Quota__c → User.Quota_Amount__c (different API name)

[Agent creates migration blueprint]
Migration Plan:
1. Create 7 reports in sandbox (adapted field mappings)
2. Create dashboard with optimized layout (fix known issues)
3. Set folder permissions
4. Validate quality parity

Optimization Opportunities (from baseline analysis):
- Fix visual hierarchy (move Pipeline Trend to top-left)
- Add drill-down links
- Target quality: A- (88/100) - +6 point improvement

[Agent executes migration]
Creating reports in sandbox...
✅ Report 1: Team Quota Attainment (00O5g00000023401)
✅ Report 2: Pipeline by Stage (00O5g00000023402)
[... 5 more reports created ...]

Creating dashboard with optimized layout...
✅ Dashboard created: 01Z5g00000067890

[Agent validates replica quality]
Running quality validation on replica...

📊 MIGRATION QUALITY BENCHMARK

Original Dashboard (Production):
- Quality Score: 82/100 (B+)
- Grade: B+ (Good Quality)

Replica Dashboard (Sandbox):
- Quality Score: 89/100 (A-)
- Grade: A- (Very Good Quality)

Quality Improvement: +7 points ✅
Quality Parity: Achieved (replica > original)

Improvements Applied:
1. ✅ Visual hierarchy optimized (Pipeline Trend moved to top-left)
2. ✅ Drill-down links added to 2 components
3. ✅ Layout optimized using F-pattern algorithm

✅ DASHBOARD MIGRATION COMPLETE

📊 Migration Summary:
- Source: production-org (01Z8c00000056789)
- Target: sandbox-org (01Z5g00000067890)
- Reports Migrated: 7
- Field Mappings: 1 (Quota__c → Quota_Amount__c)
- Quality Improvement: +7 points (82 → 89)

📈 Quality Comparison:
Dimension | Original | Replica | Change
----------|----------|---------|--------
Component Count | 100 | 100 | ✅ Same
Naming Convention | 95 | 95 | ✅ Same
Chart Appropriateness | 75 | 90 | ✅ +15
Visual Hierarchy | 70 | 90 | ✅ +20
Filter Usage | 90 | 90 | ✅ Same
Performance | 85 | 85 | ✅ Same
Audience Alignment | 90 | 90 | ✅ Same
Actionability | 75 | 85 | ✅ +10

🎯 Sandbox Dashboard Ready:
https://sandbox-org.lightning.force.com/lightning/r/Dashboard/01Z5g00000067890/view

Validation Steps:
1. ✅ All components render correctly
2. ✅ Data populates as expected
3. ✅ Filters work (dynamic manager filter)
4. ✅ Quality score >= original (89 vs 82)
```

---

## Common Use Cases

### Use Case 1: Marketing Lifecycle Reporting

**Scenario**: Marketing team needs to track contact progression through lifecycle stages

**Components Needed:**
- Template: `lifecycle-funnel.json`
- Agent: `sfdc-report-designer`
- Intelligence: `chart-type-selector.js`

**Steps:**
```bash
# 1. Create report using agent
Agent: "Create a marketing lifecycle funnel report using the template for our org"

# 2. Validate chart type
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX
# Expected: Funnel Chart (Score: 95/100)

# 3. Validate report quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX
# Target: A- or higher (85+)

# 4. Add to dashboard
Agent: "Add this lifecycle funnel report to the marketing dashboard"
```

**Expected Quality Scores:**
- Report Format: 100/100 (Summary with grouping by stage)
- Chart Usage: 95/100 (Funnel chart perfect for conversion flow)
- Overall: A- to A (85-92)

### Use Case 2: Sales Manager Team Dashboard

**Scenario**: Sales managers need a comprehensive team performance view

**Components Needed:**
- Template: `team-pipeline.json`
- Agent: `sfdc-dashboard-designer`
- Intelligence: `dashboard-layout-optimizer.js`, `dashboard-quality-validator.js`

**Steps:**
```bash
# 1. Create dashboard using agent
Agent: "Create a team pipeline dashboard for sales managers using the template"

# 2. Optimize layout
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY
# Applies F-pattern, optimizes component placement

# 3. Validate quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY
# Target: A- or higher (85+)

# 4. Set folder permissions
Agent: "Share this dashboard with the Sales Managers folder"
```

**Expected Quality Scores:**
- Component Count: 100/100 (7 components - optimal for managers)
- Visual Hierarchy: 90-100/100 (F-pattern applied)
- Audience Alignment: 95-100/100 (Perfect for manager audience)
- Overall: A- to A (88-92)

### Use Case 3: Executive Revenue Dashboard

**Scenario**: Executives need high-level revenue and pipeline visibility

**Components Needed:**
- Template: `revenue-performance.json`
- Agent: `sfdc-dashboard-designer`
- Intelligence: All 4 scripts

**Steps:**
```bash
# 1. Create dashboard with executive template
Agent: "Create an executive revenue performance dashboard using the template"

# 2. Validate chart appropriateness for each component
for component in component_1 component_2 component_3 component_4 component_5 component_6; do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --component-id $component --audience executive
done
# Expected: Gauges for targets, Line for trends, Funnel for stages

# 3. Optimize layout for executive viewing
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000ZZZZ --audience executive
# Places Quarterly Revenue vs Target (gauge) at top-left (highest importance)

# 4. Validate quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000ZZZZ
# Target: A or higher (90+)

# 5. Set refresh schedule
Agent: "Set this dashboard to refresh daily at 6 AM"
```

**Expected Quality Scores:**
- Component Count: 100/100 (6 components - optimal for executives)
- Chart Appropriateness: 95-100/100 (Gauges, Lines, Funnels)
- Audience Alignment: 100/100 (Perfect for executive consumption)
- Overall: A to A+ (90-95)

### Use Case 4: Quality Improvement Sprint

**Scenario**: Existing dashboards have quality issues, need systematic improvement

**Components Needed:**
- Agent: `sfdc-dashboard-analyzer`
- Intelligence: `dashboard-quality-validator.js`, `dashboard-layout-optimizer.js`

**Steps:**
```bash
# 1. Audit all dashboards
for dashboard_id in $(sf data query --query "SELECT Id FROM Dashboard" --json | jq -r '.result.records[].Id'); do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id $dashboard_id --output json >> dashboard_audit.json
done

# 2. Identify low-quality dashboards (< 70)
cat dashboard_audit.json | jq '.[] | select(.totalScore < 70)'

# 3. Prioritize by impact (executive dashboards first)
cat dashboard_audit.json | jq '.[] | select(.audience == "executive" and .totalScore < 85)' | jq -s 'sort_by(.totalScore)'

# 4. Improve each dashboard using agent
Agent: "Analyze dashboard 01Z8c000000AAAA and create an improved replica with quality score >= 85"

# 5. Track improvements
echo "Dashboard,Original Score,Replica Score,Improvement" > improvement_tracking.csv
# Manually populate as dashboards are improved

# 6. Validate improvements
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000AAAA_REPLICA
# Confirm: Replica score >= 85 (B- minimum)
```

**Quality Improvement Targets:**
- Executive Dashboards: A- or higher (85+)
- Manager Dashboards: B+ or higher (80+)
- Individual Dashboards: B or higher (75+)

### Use Case 5: Org-to-Org Dashboard Migration

**Scenario**: Migrate 10 dashboards from production to sandbox for testing

**Components Needed:**
- Agent: `sfdc-dashboard-analyzer`
- Intelligence: All 4 scripts (for validation)

**Steps:**
```bash
# 1. Export dashboard list from production
sf data query --query "SELECT Id, DeveloperName, Title FROM Dashboard WHERE FolderName = 'Sales Dashboards'" --target-org production > dashboards_to_migrate.json

# 2. Migrate each dashboard with quality assurance
for dashboard in $(cat dashboards_to_migrate.json | jq -r '.result.records[].Id'); do
  Agent: "Migrate dashboard $dashboard from production to sandbox, maintain quality"
done

# 3. Validate quality parity for all migrations
for replica_dashboard in $(cat migration_log.json | jq -r '.replicas[].Id'); do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id $replica_dashboard --output json >> replica_quality.json
done

# 4. Compare quality scores
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/compare-migration-quality.js --original dashboards_to_migrate.json --replica replica_quality.json
# Verify: All replicas >= original score

# 5. Update dynamic filters for sandbox (e.g., OwnerId, ManagerId)
Agent: "Update all migrated dashboards to use sandbox user IDs for dynamic filters"

# 6. Set folder permissions in sandbox
Agent: "Set up folder permissions for Sales Dashboards in sandbox matching production"
```

**Quality Parity Requirements:**
- All replicas must achieve >= original quality score
- No replicas with grade < B- (70)
- High-priority dashboards (executive, manager) must achieve A- or higher (85+)

---

## Troubleshooting

### Issue: Template Not Found

**Symptom:**
```
Error: Template file not found: templates/reports/marketing/lifecycle-funnel.json
```

**Diagnosis:**
```bash
# Check if templates directory exists
ls .claude-plugins/opspal-core-plugin/packages/domains/salesforce/templates/

# Check if specific template exists
ls .claude-plugins/opspal-core-plugin/packages/domains/salesforce/templates/reports/marketing/lifecycle-funnel.json
```

**Solution:**
```bash
# If templates directory missing, verify plugin installation
/plugin list

# Reinstall plugin if needed
/plugin uninstall salesforce-plugin@revpal-internal-plugins
/plugin install salesforce-plugin@revpal-internal-plugins

# Verify templates are present
ls -R .claude-plugins/opspal-core-plugin/packages/domains/salesforce/templates/
```

### Issue: Intelligence Script Fails

**Symptom:**
```
Error: Cannot find module './data-access-layer.js'
```

**Diagnosis:**
```bash
# Check if scripts directory exists
ls .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/

# Check if specific script exists
ls .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js

# Check dependencies
cat .claude-plugins/opspal-core-plugin/packages/domains/salesforce/package.json | jq '.dependencies'
```

**Solution:**
```bash
# Install dependencies
cd .claude-plugins/salesforce-plugin
npm install

# Verify script is executable
chmod +x scripts/lib/chart-type-selector.js

# Test script
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --help
```

### Issue: Quality Validator Returns Low Score

**Symptom:**
```
Dashboard Quality Score: 45/100 (F - Failing)
```

**Diagnosis:**
```bash
# Run validator with detailed output
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY --recommendations

# Review issues found
# Common causes:
# - Too many components (>9)
# - Poor naming convention
# - Inappropriate chart types
# - Missing filters
# - No visual hierarchy
```

**Solution:**
```bash
# Use agent to analyze and fix
Agent: "Analyze dashboard 01Z8c000000YYYY and provide detailed quality improvements"

# Follow agent's recommendations
# Typical fixes:
# 1. Reduce component count to 5-7
# 2. Rename components with clear, descriptive titles
# 3. Replace inappropriate charts (e.g., Pie → Donut for part-to-whole)
# 4. Add appropriate filters (date range, dynamic user filter)
# 5. Apply F-pattern layout optimization

# Validate improvements
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY
# Target: >= 70 (B- minimum)
```

### Issue: Chart Recommendation Doesn't Match Expectations

**Symptom:**
```
Expected: Funnel Chart
Got: Bar Chart (Score: 85/100)
```

**Diagnosis:**
```bash
# Run chart selector with verbose output
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX --verbose

# Review data pattern detection
# Check: Data characteristics, grouping dimensions, date fields
```

**Solution:**
```bash
# Adjust report structure if needed
Agent: "Modify report 00O8c000000XXXX to group by sequential field (Lifecycle_Stage__c)"

# Re-run chart selector
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX
# Should now recommend Funnel Chart for sequential data

# Override recommendation if business need requires it
Agent: "Use Funnel Chart for report 00O8c000000XXXX even though Bar Chart scored higher"
```

### Issue: Dashboard Layout Optimizer Not Working

**Symptom:**
```
Error: Unable to calculate component importance - missing metadata
```

**Diagnosis:**
```bash
# Check dashboard metadata access
sf data query --query "SELECT Id, DeveloperName, Title FROM Dashboard WHERE Id = '01Z8c000000YYYY'" --json

# Check component metadata
sf data query --query "SELECT Id, Name, ComponentType FROM DashboardComponent WHERE DashboardId = '01Z8c000000YYYY'" --use-tooling-api --json

# Verify API access
sf org display --target-org my-org
```

**Solution:**
```bash
# Ensure authenticated to correct org
sf org login web --alias my-org

# Set default org
sf config set target-org=my-org

# Re-run optimizer
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY

# If still failing, use agent fallback
Agent: "Optimize layout for dashboard 01Z8c000000YYYY using F-pattern guidelines"
```

### Issue: Template Prerequisites Not Met

**Symptom:**
```
Template Error: Required field Quota__c not found on User object
```

**Diagnosis:**
```bash
# Check object metadata
sf sobject describe User | jq '.fields[] | select(.name | contains("Quota"))'

# Check if field exists with different API name
sf sobject describe User | jq '.fields[] | select(.label == "Quota")'
```

**Solution:**
```bash
# Option 1: Create missing field
Agent: "Create custom field Quota__c (Currency) on User object"

# Option 2: Adapt template to use existing field
Agent: "Modify template to use Quota_Amount__c instead of Quota__c"

# Option 3: Use alternative template
Agent: "Is there a template that doesn't require User.Quota__c?"
# Agent will recommend templates without quota dependency
```

---

## Best Practices

### 1. Always Validate Quality

**DO:**
```bash
# Create report
Agent: "Create MQL to SQL report using template"

# IMMEDIATELY validate quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX

# Target minimum: B- (70/100)
```

**DON'T:**
```bash
# Create report
Agent: "Create MQL to SQL report using template"

# Deploy to production without validation ❌
# Users discover quality issues later
```

### 2. Use Templates as Starting Points

**DO:**
```bash
# Load template
Agent: "Create pipeline report using sales-rep template"

# Customize for specific use case
Agent: "Add Industry field grouping and filter to only show High Priority accounts"

# Validate customized version
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id 00O8c000000XXXX
```

**DON'T:**
```bash
# Treat templates as rigid, unchangeable structures ❌
# Templates are designed to be customized for your org's needs
```

### 3. Optimize Layout Before Sharing

**DO:**
```bash
# Create dashboard
Agent: "Create team pipeline dashboard"

# Optimize layout BEFORE sharing
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id 01Z8c000000YYYY

# Validate quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY

# THEN share with users
Agent: "Share dashboard with Sales Managers folder"
```

**DON'T:**
```bash
# Create dashboard
Agent: "Create team pipeline dashboard"

# Share immediately without optimization ❌
# Users experience poor layout, miss important information
```

### 4. Set Quality Targets by Audience

**Quality Targets:**
```
Executive Dashboards: A- or higher (85+)
Manager Dashboards: B+ or higher (80+)
Individual Dashboards: B or higher (75+)
Operational Reports: B- or higher (70+)
```

**Rationale:**
- Executives: High-stakes decision-making requires exceptional quality
- Managers: Frequent use requires very good quality and usability
- Individuals: Daily use requires good quality and performance
- Operational: Minimum acceptable quality for functional use

### 5. Document Custom Adaptations

**DO:**
```bash
# When adapting template
Agent: "Create lifecycle funnel report using template"
Agent: "Adapt for our org: Use Contact instead of Lead, add custom field CPQ_Stage__c"

# Document adaptation
Agent: "Add report description: Adapted from lifecycle-funnel template for Contact-first org with CPQ stages"
```

**DON'T:**
```bash
# Make adaptations without documentation ❌
# Future maintainers won't understand customizations
```

### 6. Benchmark Quality Improvements

**DO:**
```bash
# Before improvement
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY > before.json

# Make improvements
Agent: "Improve dashboard 01Z8c000000YYYY based on quality analysis"

# After improvement
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id 01Z8c000000YYYY > after.json

# Calculate improvement
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/compare-quality.js --before before.json --after after.json
# Shows: +12 points (B+ → A-)
```

**DON'T:**
```bash
# Make improvements without measuring impact ❌
# Can't prove ROI or justify time spent
```

### 7. Use Agent Workflows for Complex Tasks

**DO:**
```bash
# Complex migration with quality assurance
Agent: "Migrate dashboard 01Z8c000000YYYY from production to sandbox, maintain quality >= B+"

# Agent handles:
# - Source analysis
# - Prerequisite checks
# - Field mapping adaptations
# - Quality validation
# - Parity confirmation
```

**DON'T:**
```bash
# Manual step-by-step migration ❌
# High risk of missing steps, quality regression
```

### 8. Regular Quality Audits

**DO:**
```bash
# Monthly quality audit
for dashboard_id in $(sf data query --query "SELECT Id FROM Dashboard" --json | jq -r '.result.records[].Id'); do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id $dashboard_id --output json >> monthly_audit_2025-10.json
done

# Identify quality trends
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/analyze-quality-trends.js --input monthly_audit_2025-10.json

# Prioritize improvements
cat monthly_audit_2025-10.json | jq '.[] | select(.totalScore < 70)' | jq -s 'sort_by(.totalScore)'
```

**DON'T:**
```bash
# Wait for users to complain about quality ❌
# Proactive quality management prevents issues
```

---

## Advanced Topics

### Custom Template Creation

**Creating Your Own Templates:**

1. **Start with existing template** as reference
2. **Follow JSON structure** from template library
3. **Include all metadata sections**:
   - templateMetadata (name, version, description, audience, use case)
   - reportMetadata or dashboardLayout
   - customizationPoints
   - prerequisites
   - deploymentInstructions
   - calculatedFields (if any)
   - orgAdaptations (if any)
4. **Validate template structure**:
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/validate-template.js --template-path my-custom-template.json
```

5. **Test template with agent**:
```bash
Agent: "Create a report using my custom template at path/to/my-custom-template.json"
```

6. **Document template** in templates/README.md

### Intelligence Script Extension

**Adding Custom Scoring Logic:**

**Example: Custom Chart Scoring for Industry-Specific Patterns**

```javascript
// scripts/lib/custom-chart-scorer.js
const {detectDataPattern} = require('./chart-type-selector');

function scoreChartTypeForIndustry(chartType, dataPattern, industry) {
  let baseScore = scoreChartType(chartType, dataPattern);

  // Industry-specific adjustments
  if (industry === 'financial-services') {
    if (chartType === CHART_TYPES.LINE && dataPattern === DATA_PATTERNS.TREND_OVER_TIME) {
      baseScore += 10; // Financial services prefer line charts for trends
    }
  } else if (industry === 'healthcare') {
    if (chartType === CHART_TYPES.TABLE) {
      baseScore += 5; // Healthcare prefers detailed tables for compliance
    }
  }

  return Math.min(100, baseScore);
}

module.exports = {scoreChartTypeForIndustry};
```

**Usage:**
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id 00O8c000000XXXX --industry financial-services
```

### Quality Scoring Customization

**Adjusting Dimension Weights:**

```javascript
// scripts/lib/custom-quality-validator.js
const {validateDashboardQuality} = require('./dashboard-quality-validator');

function validateDashboardQualityForOrg(dashboard, orgPriorities) {
  const result = validateDashboardQuality(dashboard);

  // Adjust weights based on org priorities
  if (orgPriorities.performanceFirst) {
    result.dimensionScores.find(d => d.dimension === 'performance').weight = 25; // Increased from 10
    result.dimensionScores.find(d => d.dimension === 'naming').weight = 5; // Decreased from 10
  }

  // Recalculate total score with new weights
  result.totalScore = recalculateTotalScore(result.dimensionScores);
  result.grade = scoreToGrade(result.totalScore);

  return result;
}
```

### Automated Quality Improvement Pipelines

**CI/CD Integration:**

```yaml
# .github/workflows/dashboard-quality-check.yml
name: Dashboard Quality Check

on:
  pull_request:
    paths:
      - 'dashboards/**'

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Validate Dashboard Quality
        run: |
          for dashboard_file in dashboards/*.json; do
            score=$(node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-file $dashboard_file --output json | jq '.totalScore')
            if [ $score -lt 70 ]; then
              echo "Dashboard $dashboard_file has quality score $score (< 70 threshold)"
              exit 1
            fi
          done

      - name: Post Quality Report
        run: |
          node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/post-quality-report-to-pr.js
```

---

## Appendix

### A. Quick Reference

**Common Commands:**
```bash
# Create report from template
Agent: "Create [report-name] using [template-name] template"

# Create dashboard from template
Agent: "Create [dashboard-name] using [template-name] template"

# Validate report quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/report-quality-validator.js --report-id [ID]

# Validate dashboard quality
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-quality-validator.js --dashboard-id [ID]

# Get chart recommendations
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/chart-type-selector.js --report-id [ID]

# Optimize dashboard layout
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/dashboard-layout-optimizer.js --dashboard-id [ID]

# Analyze existing dashboard
Agent: "Analyze dashboard [ID] and provide quality improvements"

# Migrate dashboard
Agent: "Migrate dashboard [ID] from [source-org] to [target-org]"
```

### B. Quality Score Interpretation

**Score Ranges:**
- **90-100 (A/A+)**: Exceptional quality, ready for executive consumption
- **85-89 (A-)**: Very good quality, minor improvements only
- **80-84 (B+)**: Good quality, suitable for production use
- **75-79 (B)**: Above average quality, some improvements recommended
- **70-74 (B-)**: Acceptable quality, notable improvements needed
- **65-69 (C+)**: Below average quality, significant improvements needed
- **60-64 (C)**: Poor quality, major rework recommended
- **55-59 (C-)**: Very poor quality, complete redesign recommended
- **50-54 (D)**: Failing quality, unusable in current state
- **<50 (F)**: Completely failing, start over

### C. Template Selection Matrix

**Select Template By:**

| Use Case | Audience | Template | Quality Target |
|----------|----------|----------|----------------|
| Track marketing funnel | Marketing | lifecycle-funnel | A- (85+) |
| Measure MQL→SQL conversion | Marketing Ops | mql-to-sql-conversion | A- (85+) |
| Calculate campaign ROI | Marketing Leadership | campaign-roi | A (90+) |
| Personal pipeline tracking | Sales Reps | my-pipeline-by-stage | B+ (80+) |
| Lead response time | SDRs | speed-to-lead | B+ (80+) |
| Team quota performance | Sales Managers | team-performance | A- (85+) |
| Win/loss patterns | Sales Leadership | win-loss-analysis | A (90+) |
| Forecast accuracy | Sales Leadership | forecast-accuracy | A (90+) |
| At-risk account identification | CSMs | account-health | B+ (80+) |
| Renewal tracking | CS Leadership | renewal-pipeline | A- (85+) |
| Support case trends | Support Managers | support-trends | B+ (80+) |
| Executive revenue overview | CEO/CFO/CRO | revenue-performance | A+ (95+) |
| Pipeline health | CRO | pipeline-health | A (90+) |
| Team productivity | CRO | team-productivity | A (90+) |
| Manager team view | Sales Managers | team-pipeline | A- (85+) |
| Team activity tracking | Sales Managers | activity-metrics | B+ (80+) |
| Team quota dashboard | Sales Managers | quota-attainment | A- (85+) |
| Personal pipeline dashboard | Sales Reps | my-pipeline | B (75+) |
| Daily activity goals | Sales Reps | my-activities | B (75+) |
| Personal quota tracking | Sales Reps | my-quota | B (75+) |

### D. Related Documentation

- **Design Guidelines**: `docs/REPORT_DASHBOARD_DESIGN_GUIDELINES.md` (10,000+ words)
- **Template Catalog**: `templates/README.md` (600+ lines)
- **Agent Documentation**:
  - `agents/sfdc-report-designer.md`
  - `agents/sfdc-dashboard-designer.md`
  - `agents/sfdc-reports-dashboards.md`
  - `agents/sfdc-dashboard-analyzer.md`
- **Script Documentation**:
  - `scripts/lib/chart-type-selector.js` (inline JSDoc)
  - `scripts/lib/dashboard-layout-optimizer.js` (inline JSDoc)
  - `scripts/lib/dashboard-quality-validator.js` (inline JSDoc)
  - `scripts/lib/report-quality-validator.js` (inline JSDoc)

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-17
**Maintained By**: RevPal Engineering
**Feedback**: Submit via `/reflect` command in salesforce-plugin
