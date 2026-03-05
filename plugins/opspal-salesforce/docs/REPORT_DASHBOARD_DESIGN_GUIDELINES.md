# Salesforce Reports and Dashboards Design Guidelines

**Version**: 2.0
**Last Updated**: 2025-11-26
**Purpose**: Enterprise-grade design principles for creating effective Salesforce analytics

---

## 📚 Related Documentation

### Report API Development Runbooks (NEW - v3.51.0)

For detailed API implementation, row limits, and deployment guides, see:

| Runbook | Purpose | Key Topics |
|---------|---------|------------|
| [01-Report Formats Fundamentals](runbooks/report-api-development/01-report-formats-fundamentals.md) | Format comparison & selection | REST vs Metadata API, row limits |
| [02-Tabular Reports](runbooks/report-api-development/02-tabular-reports.md) | TABULAR format deep-dive | 50K row limit, data exports |
| [03-Summary Reports](runbooks/report-api-development/03-summary-reports.md) | SUMMARY format deep-dive | **2K HARD LIMIT**, silent truncation |
| [04-Matrix Reports](runbooks/report-api-development/04-matrix-reports.md) | MATRIX format deep-dive | 2K limit, sparse grid handling |
| [05-Joined Reports Basics](runbooks/report-api-development/05-joined-reports-basics.md) | JOINED fundamentals | Multi-block, Metadata API required |
| [06-Joined Reports Advanced](runbooks/report-api-development/06-joined-reports-advanced.md) | Advanced JOINED patterns | Cross-block formulas, 5-block patterns |
| [07-Custom Report Types](runbooks/report-api-development/07-custom-report-types.md) | Custom type creation | Object relationships, deployment |
| [08-Validation and Deployment](runbooks/report-api-development/08-validation-and-deployment.md) | Deployment workflows | CI/CD, pre-deployment validation |
| [09-Troubleshooting](runbooks/report-api-development/09-troubleshooting-optimization.md) | Error resolution | Performance, common errors |

### Critical Scripts

```bash
# Choose report format interactively
node scripts/lib/report-format-selector.js

# Validate report before deployment
node scripts/lib/report-format-validator.js --report ./report.json

# Build joined reports (Metadata API)
node scripts/lib/joined-report-builder.js --template yoy --name MyReport
```

### Configuration

- **API Limits**: `config/analytics-api-limits.json`
- **Format Templates**: `templates/reports/format-bases/`

---

## Table of Contents

1. [Introduction](#introduction)
2. [Report Design](#report-design)
3. [Dashboard Design](#dashboard-design)
4. [Chart Type Selection](#chart-type-selection)
5. [Audience Personas](#audience-personas)
6. [Performance Optimization](#performance-optimization)
7. [Visual Design Best Practices](#visual-design-best-practices)
8. [Common Patterns & Templates](#common-patterns--templates)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
10. [Quality Checklist](#quality-checklist)

---

## Introduction

### Purpose of This Guide

This guide provides enterprise best practices for designing Salesforce reports and dashboards that:
- **Drive decisions and actions** (not just display data)
- **Match audience needs** (exec vs manager vs rep)
- **Perform efficiently** (load quickly, refresh reliably)
- **Follow visual hierarchy** (guide attention to what matters)
- **Enable self-service** (reduce "how do I..." questions)

### Key Principles

**1. Audience-First Design**
- Every dashboard is tailored to its viewer's role and decision authority
- Executives need company-wide aggregates; reps need personal task lists
- Terminology matches viewer's vocabulary (e.g., "bookings" vs "closed opportunities")

**2. Clarity Over Completeness**
- Show 5-7 key metrics clearly rather than 20 mediocre ones
- Limit columns to essential fields (5-10 max)
- Use white space and visual hierarchy

**3. Performance is a Feature**
- Fast dashboards get used; slow dashboards get abandoned
- Target: <10 seconds for dashboard load, <5 seconds for source reports
- Optimize filters, limit date ranges, hide details when appropriate

**4. Visual Hierarchy Guides Attention**
- Use size, color, and placement to highlight what matters most
- Primary KPI should be largest and top-left (F-pattern)
- Consistent colors convey meaning (green = good, red = action needed)

**5. Actionable Insights**
- Every chart should answer a question or drive a decision
- Include drill-down for details
- Make components clickable to underlying records

---

## Report Design

### Report Format Selection

### Decision Tree

```
┌─────────────────────────────────────────────────┐
│ Do you need grouping or aggregations?          │
└─────────┬───────────────────────────────────────┘
          │
    ┌─────┴─────┐
    │ NO        │ YES
    ▼           ▼
┌───────┐   ┌────────────────────────────────────┐
│TABULAR│   │ Do you need cross-tabulation       │
│       │   │ (2 dimensions)?                    │
│Simple │   └──────┬─────────────────────────────┘
│list   │          │
└───────┘    ┌─────┴─────┐
             │ NO        │ YES
             ▼           ▼
        ┌─────────┐  ┌────────┐
        │ Combine │  │ MATRIX │
        │ data    │  │        │
        │ sets?   │  │2D      │
        └────┬────┘  │pivot   │
             │       └────────┘
       ┌─────┴─────┐
       │ NO        │ YES
       ▼           ▼
   ┌────────┐  ┌────────┐
   │SUMMARY │  │ JOINED │
   │        │  │        │
   │1-2     │  │Multiple│
   │groups  │  │blocks  │
   └────────┘  └────────┘
```

### Format Comparison Table

| Format | Use When | Capabilities | Row Limit | API | Dashboard Use |
|--------|----------|--------------|-----------|-----|---------------|
| **Tabular** | Simple list, export | No grouping, no charts | **50,000** | REST | ❌ No |
| **Summary** | Grouping, aggregates | 1-3 groupings, charts | **2,000** ⚠️ | REST | ✅ Yes |
| **Matrix** | Cross-tabulation | 2D pivot, complex agg | **2,000** ⚠️ | REST | ✅ Limited |
| **Joined** | Combine data sets | Up to 5 blocks | **2,000/block** | Metadata | ⚠️ Some |

> ⚠️ **CRITICAL**: SUMMARY and MATRIX formats have a **2,000-row HARD LIMIT** via REST API. Data is **silently truncated** with no error. See [03-Summary Reports](runbooks/report-api-development/03-summary-reports.md) for mitigation strategies.

> **JOINED REPORTS**: REST API cannot create joined reports. Must use Metadata API (`sf project deploy`). See [05-Joined Reports Basics](runbooks/report-api-development/05-joined-reports-basics.md).

### When to Use Each Format

#### Tabular Reports
**✅ Use For**:
- Simple record lists (export contacts, call lists)
- Quick data validation ("show me all records where...")
- Inline editing (list views)

**❌ Don't Use For**:
- Aggregations or summaries
- Dashboard components
- Analysis requiring grouping

**Example**: "Contacts in California for Email Campaign"

---

#### Summary Reports
**✅ Use For**:
- Pipeline by stage
- Sales by rep
- Count of records by category
- Any dashboard component
- Metrics requiring subtotals

**❌ Don't Use For**:
- Simple lists (use Tabular)
- Two-dimensional analysis (use Matrix)

**Example**: "Pipeline by Stage and Owner"

---

#### Matrix Reports
**✅ Use For**:
- Sales by rep by month (2D)
- Case count by priority AND status
- Product sales by region AND quarter
- Complex multi-dimensional analysis

**❌ Don't Use For**:
- Simple grouping (use Summary)
- When performance is critical (slowest format)
- When more than 10-12 groups per dimension

**Example**: "Opportunities by Sales Rep (rows) and Close Quarter (columns)"

---

#### Joined Reports
**✅ Use For**:
- Accounts with opportunities AND cases side-by-side
- Comparing won vs lost opportunities
- Executive 360° views

**❌ Don't Use For**:
- Simple related data (use standard report types)
- When individual reports would suffice
- Excel exports (must export blocks separately)

**Example**: "Account Health Dashboard (Accounts + Opps + Cases)"

---

### Report Naming & Metadata Standards

**Naming Format**:
- `[Audience] [Topic] [Timeframe]` (example: "Executive Revenue - This Quarter")
- Avoid generic names like "Report 1" or "Pipeline"
- Make the audience explicit when the same topic exists for multiple roles

**Description Requirements**:
- State the decision it supports (example: "Used to review pipeline coverage during weekly forecast")
- Include filter assumptions (example: "IsClosed = False, Close Date = THIS_QUARTER")
- Note ownership and update cadence (example: "Owner: RevOps, reviewed monthly")

**Metadata Hygiene**:
- Document key calculated fields or formulas used
- Keep report folder aligned to audience and data sensitivity
- If used as a dashboard source report, note that in the description

### Folder, Sharing, and Ownership

**Folder Strategy**:
- Use audience-based folders: "Executive Reports", "Sales Manager Reports", "Marketing Analytics"
- Avoid private folders for shared assets; dashboards depend on report visibility
- Keep shared dashboards in shared folders with explicit group permissions

**Ownership & Lifecycle**:
- Assign a primary owner (responsible for updates and deprecations)
- Tag reports with last-reviewed date in the description
- Archive or delete unused reports quarterly to reduce clutter

**Security & Access**:
- Apply least-privilege folder permissions
- For sensitive data, create a restricted folder and use a separate dashboard
- Validate visibility for different roles before rollout

### Calculated Fields vs Report Formulas

**Use Custom Fields When**:
- The formula is reused across multiple reports/dashboards
- The calculation is expensive or complex
- You need the value in other features (flows, list views, automation)

**Use Report Formulas When**:
- The calculation is report-specific and unlikely to be reused
- You need quick experimentation without schema changes

**Rule of Thumb**:
- If the formula is used in more than 2-3 reports, promote it to a custom field

### Filter Logic, Null Handling, and Data Quality

**Filter Logic**:
- Use explicit logic: `A AND (B OR C)` to avoid ambiguous results
- Keep filters testable by narrowing to a small dataset when debugging

**Null Handling**:
- Avoid blank-driven surprises by adding `ISBLANK()` or `!= ""` filters
- For picklists, define a default "Unknown" bucket if blanks are common

**Data Quality Checks**:
- Validate that key fields (Stage, Amount, Close Date) are populated
- Add a "Missing Data" report to monitor completeness

### Report Validation Workflow

**Before Deploying**:
1. Run the report with a narrow filter (single owner or last 7 days)
2. Validate totals against known system counts or a manual sample
3. Confirm chart types match the report format (Summary/Matrix)

**Tooling**:
- `node scripts/lib/report-format-validator.js --report ./report.json`
- `node scripts/lib/report-quality-validator.js --report ./report.json`

**Regression Check**:
- Re-run after schema changes (new fields, renamed fields, record type changes)
- Watch for silent truncation in Summary/Multi-group reports

## Dashboard Design

### Dashboard Design Principles

### The 5-7 Component Rule

**Optimal**: 5-7 components per dashboard

**Why**:
- Human attention span limits (~7 items)
- Reduces cognitive load
- Ensures each metric gets attention
- Improves load performance

**If you need more than 7**:
- Create multiple dashboards (e.g., "Pipeline Summary" + "Pipeline Detail")
- Use dashboard folders to organize
- Implement drill-down for details
- Use dynamic filters (one dashboard, multiple views)

### Visual Hierarchy

#### Size Hierarchy

```
┌─────────────────────────────────────────────────┐
│ FULL-WIDTH (Most Important)                    │
│ Primary KPI (e.g., Quota Progress Gauge)       │
└─────────────────────────────────────────────────┘

┌─────────────────────────┬───────────────────────┐
│ HALF-WIDTH (Supporting) │ HALF-WIDTH            │
│ Pipeline by Stage       │ Win Rate Trend        │
└─────────────────────────┴───────────────────────┘

┌───────────┬───────────────┬──────────────────────┐
│ THIRD     │ THIRD         │ THIRD                │
│ Top Deals │ Activities    │ Pipeline by Rep      │
└───────────┴───────────────┴──────────────────────┘
```

**Guidelines**:
- **Full-width**: 1-2 most important metrics (hero metrics)
- **Half-width**: 3-4 supporting metrics
- **Third-width**: 5-7 detail metrics or action lists

#### Color Hierarchy

**Semantic Colors** (consistent meaning):
- 🟢 **Green**: Positive, on-track, goal met
- 🔴 **Red**: Negative, at-risk, action required
- 🟡 **Yellow/Orange**: Warning, needs attention
- 🔵 **Blue**: Neutral, informational
- ⚪ **Gray**: Inactive, low-priority

**Consistency Rule**:
- Use same color for same category across ALL charts
- Example: "Closed Won" = green everywhere, "Closed Lost" = red everywhere

#### Placement Hierarchy

**F-Pattern Layout** (Most common):
```
TOP-LEFT      TOP-RIGHT
(Primary KPI) (Secondary KPI)
     ↓             ↓
MIDDLE-LEFT   MIDDLE-RIGHT
(Supporting)  (Supporting)
     ↓             ↓
BOTTOM-LEFT   BOTTOM-RIGHT
(Details)     (Action items)
```

Users naturally read F-pattern:
1. Scan top row (left to right)
2. Drop down to second row (left to right)
3. Glance at remaining items

**Place most important metric top-left!**

### Filter Strategy & Interactivity

**Global Filters**:
- Use 1-3 high-value filters (Region, Timeframe, Team)
- Set sensible defaults (THIS_QUARTER, My Team)
- Prefer relative dates over hard-coded ranges

**Component Filters**:
- Avoid per-component filters unless required
- Document any component-only filters in the dashboard description
- Test that global filters still apply as intended

**Dynamic Dashboards**:
- Use when the same dashboard serves many users with "My" data
- Validate visibility with at least two roles (manager + rep)
- Avoid for executive views (they need consistent, shared data)

### Refresh Cadence & Data Freshness

**Cadence Selection**:
- Executive dashboards: Daily or weekly
- Manager dashboards: Daily or hourly
- Rep dashboards: Real-time where possible, otherwise hourly

**Communicate Freshness**:
- Include refresh cadence in the description
- For scheduled refreshes, pick off-peak windows
- Use cached results for heavy dashboards to preserve performance

### Mobile & Layout Considerations

**Mobile-Friendly Layout**:
- Use fewer components (4-5 instead of 7)
- Prefer metrics and simple charts over wide tables
- Keep titles short (<= 40 characters)

**Responsive Layout Tips**:
- Avoid long axis labels; use abbreviations with a legend
- Use donut/pie with clear labels when space is tight

### Source Report Hygiene

**One Component = One Report**:
- Avoid reusing the same report for unrelated components
- Ensure each report has a clear, documented purpose

**Consistency Across Components**:
- Use the same date filters and ownership filters across related charts
- Keep field names consistent across report descriptions

**Dependency Management**:
- If a dashboard component depends on calculated fields, document that in the report description
- Re-validate reports after schema changes or record type updates

---

## Chart Type Selection

### Chart Selection Matrix

| Data Structure | Best Chart Type | Example Use Case |
|----------------|-----------------|------------------|
| **Single value vs target** | Gauge, Metric | Quota attainment: 85% of $500K |
| **Category comparison** | Bar (vertical/horizontal) | Pipeline by stage, sales by rep |
| **Time trend** | Line | Monthly revenue, weekly lead volume |
| **Part-of-whole** | Pie, Donut | Opportunity distribution by type |
| **Sequential stages** | Funnel | Lead → MQL → SQL → Customer |
| **Correlation** | Scatter | Deal size vs sales cycle length |
| **Detailed list** | Table | Top 10 deals, overdue tasks |

### Chart Type Guidelines

#### Bar Chart
**When to Use**:
- Comparing values across categories
- Ranking (top/bottom performers)

**Best Practices**:
- Limit to 10-12 categories
- Sort by value (descending) or logical order
- Use horizontal bars for long category names
- Use vertical bars for time periods

**Example**: Pipeline by Sales Rep (horizontal), Revenue by Month (vertical)

---

#### Line Chart
**When to Use**:
- Showing trends over time
- Continuous data (not discrete categories)

**Best Practices**:
- Max 3-4 lines per chart (more = spaghetti)
- Use different colors AND patterns (accessibility)
- Start Y-axis at zero (unless showing small variations)
- Label axes clearly

**Example**: Monthly Revenue Trend, Weekly Lead Volume

---

#### Pie / Donut Chart
**When to Use**:
- Showing parts of a whole (percentages)
- Distribution across categories

**Best Practices**:
- Limit to 5-7 slices (combine small slices into "Other")
- Order by size (largest to smallest)
- Add percentage labels
- Use consistent colors

**Avoid**:
- Comparing absolute values (use bar chart)
- More than 7 categories

**Example**: Opportunity Distribution by Type, Cases by Priority

---

#### Funnel Chart
**When to Use**:
- Sequential process stages with drop-off
- Conversion analysis

**Best Practices**:
- Use for sequential stages only
- Show conversion rates between stages
- Color-code by stage
- Add counts or values per stage

**Example**: Sales Pipeline (Lead → Opp → Closed Won), Marketing Funnel

---

#### Gauge
**When to Use**:
- Single KPI with target/goal
- Progress tracking

**Best Practices**:
- Use color zones (red/yellow/green)
- Show current value prominently
- Include target value as reference
- Reserve for high-priority metrics only

**Example**: Quota Attainment (85% of 100%), Revenue vs Target

---

#### Table
**When to Use**:
- Detailed lists requiring action
- Drill-down from summary charts

**Best Practices**:
- Limit to top N records (10-20 max)
- Sort by priority column
- Make rows clickable to records
- Use conditional formatting (e.g., red for overdue)

**Example**: Top 10 Deals, Overdue Opportunities, High-Priority Cases

---

## Audience Personas

### Executive Leadership (VP, CXO)

#### Characteristics
- **Scope**: Company-wide, regional aggregates
- **Frequency**: Weekly or monthly check-ins
- **Decision Type**: Strategic (resource allocation, targets)
- **Detail Level**: High-level summaries, trends

#### Dashboard Pattern
```
[ FULL-WIDTH: Quarterly Revenue vs Target Gauge ]

[ HALF: Monthly Revenue Trend ] [ HALF: Pipeline Health ]

[ THIRD: Revenue by Region ] [ THIRD: Win Rate ] [ THIRD: Top 10 Deals ]
```

#### Key KPIs
- Total Pipeline Value ($)
- Pipeline Coverage Ratio (pipeline / quota)
- Quarterly Revenue vs Target (%)
- Win Rate (%)
- Average Deal Size ($)
- Sales Cycle Length (days)

#### Report Examples
- "Executive Summary - Revenue Performance"
- "Company Pipeline Health Dashboard"
- "Quarterly Forecast Accuracy Report"

---

### Sales Managers (Directors, VPs)

#### Characteristics
- **Scope**: Team-level with rep breakdowns
- **Frequency**: Daily or weekly monitoring
- **Decision Type**: Tactical (coaching, resource allocation)
- **Detail Level**: Team summaries with drill-down to individuals

#### Dashboard Pattern
```
[ HALF: Team Quota Progress ] [ HALF: Pipeline by Stage ]

[ HALF: Quota Attainment by Rep ] [ HALF: Pipeline by Rep ]

[ THIRD: Activities This Week ] [ THIRD: Deals Closing This Month ]
```

#### Key KPIs
- Team Pipeline by Rep ($)
- Quota Attainment by Rep (%)
- Activity Metrics (calls, meetings per rep)
- Deals Closing This Month (count & $)
- Average Time in Stage (days)
- Lead Response Time by Rep (hours)

#### Report Examples
- "Sales Manager - Team Performance Dashboard"
- "Rep Activity Leaderboard"
- "Pipeline at Risk Report"

---

### Sales Reps / BDRs (Individual Contributors)

#### Characteristics
- **Scope**: "My" filtered views (personal performance)
- **Frequency**: Multiple times daily
- **Decision Type**: Operational (daily priorities, follow-ups)
- **Detail Level**: Record-level detail with action lists

#### Dashboard Pattern
```
[ FULL-WIDTH: My Quota Progress Gauge ]

[ HALF: My Pipeline by Stage ] [ HALF: My Pipeline by Close Month ]

[ THIRD: My Overdue Tasks ] [ THIRD: My Top 5 Deals ] [ THIRD: My Activities This Week ]
```

#### Key KPIs
- My Open Opportunities (count & $)
- My Quota Progress (%)
- My Overdue Tasks (count)
- My Activities This Week (calls, meetings)
- My Deals Closing This Month (list)
- My Pipeline by Stage ($)

#### Report Examples
- "My Pipeline Dashboard"
- "My Daily Action Items"
- "My Quota Tracker"

---

### Marketing Teams

#### Characteristics
- **Scope**: Campaign-level, channel-level
- **Frequency**: Weekly or monthly
- **Decision Type**: Campaign optimization, budget allocation
- **Detail Level**: Campaign summaries with lead/MQL breakdowns

#### Dashboard Pattern
```
[ FULL-WIDTH: MQL to SQL Conversion Rate Gauge ]

[ HALF: Campaign ROI Chart ] [ HALF: Lead Volume Trend ]

[ THIRD: Leads by Source ] [ THIRD: Top Campaigns ] [ THIRD: Pipeline Influenced ]
```

#### Key KPIs
- Campaign ROI ($ influenced / $ spent)
- MQL Count & MQL→SQL Conversion (%)
- Leads by Source (count)
- Cost per Lead ($)
- Time to MQL (days)
- Pipeline Influenced by Campaign ($)

#### Report Examples
- "Campaign Performance Dashboard"
- "Marketing Funnel Analysis"
- "Lead Source Attribution Report"

---

### Customer Success / Support

#### Characteristics
- **Scope**: Account-level, case-level
- **Frequency**: Daily monitoring
- **Decision Type**: Proactive intervention, escalation
- **Detail Level**: Account health + case details

#### Dashboard Pattern
```
[ FULL-WIDTH: At-Risk Accounts Gauge ]

[ HALF: Account Health Distribution ] [ HALF: Case Resolution Time ]

[ THIRD: Renewal Pipeline ] [ THIRD: Open Critical Cases ] [ THIRD: NPS Score ]
```

#### Key KPIs
- At-Risk Accounts (count)
- Renewal Pipeline by Month ($)
- Average Case Resolution Time (days)
- Customer Health Score Distribution (%)
- Open Critical Cases (count)
- Renewal Rate (%)

#### Report Examples
- "Customer Health Dashboard"
- "Renewal Pipeline Report"
- "Support Case Trends"

---

## Performance Optimization

### Target Performance Metrics

| Report Type | Target Load Time | Max Records |
|-------------|------------------|-------------|
| Tabular | <2 seconds | 50,000 |
| Summary | <5 seconds | 100,000 |
| Matrix | <10 seconds | 50,000 |
| Joined | <15 seconds | N/A (per block) |

### Optimization Techniques

#### 1. Use Selective Filters
**Always Include**:
- **Date Range**: `Close Date = THIS_QUARTER`, `CreatedDate = LAST_90_DAYS`
- **Owner**: `Owner = My Opportunities`, `Owner = My Team`
- **Status**: `IsClosed = False`, `Status = Open`

**Performance Impact**:
```
✅ FAST: Close Date = THIS_QUARTER (limits to ~3 months)
⚠️ MEDIUM: CreatedDate = LAST_YEAR (12 months)
❌ SLOW: No date filter (all history)
```

#### 2. Use Indexed Fields in Filters
**Indexed Standard Fields**:
- Id, Name, Owner
- CreatedDate, LastModifiedDate
- RecordType, IsDeleted

**Example**:
```
✅ Good: Owner = My Opportunities AND CreatedDate = THIS_QUARTER
❌ Bad: Account Name contains "Corp" (not indexed, wildcard)
```

#### 3. Limit Columns
**Guideline**: 5-10 columns max

**Why**:
- Each column adds query overhead
- More columns = harder to read
- Dashboard components only show first few columns

#### 4. Limit Grouping Levels
**Guideline**:
- 1 grouping level = Fast
- 2 grouping levels = Medium
- 3+ grouping levels = Slow (avoid)

#### 5. Hide Detail Rows (When Appropriate)
**When to Hide**:
- Dashboard source reports (only summaries needed)
- High-level executive reports
- Reports with >10,000 records

**Performance Gain**: 30-50% faster

#### 6. Schedule Dashboard Refresh
**For Large Data**:
- Schedule hourly or daily refresh
- Viewers see cached results (fast)
- Background refresh handles heavy lifting

**Configuration**:
- Dashboard settings → Refresh schedule
- Choose off-peak hours (e.g., 6 AM, 12 AM)

### Data Volume & Snapshot Strategy

**When Data Volume Is High**:
- Use reporting snapshots to store daily/weekly aggregates
- Pre-aggregate in custom objects when reports exceed practical limits
- Limit dashboards to summary metrics and provide drill-down reports separately

**Snapshot Use Cases**:
- Historical trend tracking without heavy queries
- Executive summaries that only need daily points
- SLA and operational metrics that are expensive to compute on the fly

**Trade-Offs**:
- Snapshots introduce a delay (data is as of last run)
- Requires a scheduled job and storage management
- Great for stability and predictable load time

### Schema Drift & Report Type Hygiene

**Why It Matters**:
- Field renames, record type changes, or new validation rules can break reports
- Dashboards fail silently if source reports error or return empty data

**Best Practices**:
- Use custom report types for cross-object relationships you control
- Review report type fields after major deployments
- Re-run the report validator after metadata changes

**Operational Tip**:
- Maintain a short list of "critical" reports and verify them after every release

### API vs UI Considerations

**REST API Limits**:
- Summary and Matrix formats truncate at 2,000 rows
- Joined reports require Metadata API (not REST)

**Export Strategy**:
- Use Tabular for data exports (50,000 row limit)
- For larger exports, use Bulk API or external ETL pipelines
- Avoid dashboard components that depend on export-only formats

---

## Visual Design Best Practices

### Component Sizing
- **Full-width**: 1-2 hero metrics (quota progress, revenue vs target)
- **Half-width**: 3-4 supporting metrics (pipeline, win rate)
- **Third-width**: 5-7 detail metrics (top deals, activities)

### Color Palette
**Semantic Colors**:
```
Green (#27ae60):  Closed Won, On Track, Positive
Red (#e74c3c):    Closed Lost, At Risk, Negative
Yellow (#f39c12): Warning, Needs Attention
Blue (#3498db):   Pipeline, Neutral, Informational
Gray (#95a5a6):   Inactive, Low Priority
```

**Consistency Example**:
```
Chart 1: Pipeline by Stage
  - Qualification: #3498db (blue)
  - Proposal: #5dade2 (light blue)
  - Negotiation: #48c9b0 (green-blue)
  - Closed Won: #27ae60 (green)
  - Closed Lost: #e74c3c (red)

Chart 2: Opportunities by Stage (Same colors!)
  - Qualification: #3498db (blue)
  - Closed Won: #27ae60 (green)
  - Closed Lost: #e74c3c (red)
```

### Typography & Labels
- **Component Titles**: Clear, descriptive (e.g., "Pipeline by Stage - This Quarter")
- **Axis Labels**: Include units (e.g., "Amount ($)", "Count")
- **Data Labels**: Show values on bars/slices when space permits
- **Font Size**: ≥12px for readability

### Accessibility & Inclusive Design

**Contrast & Readability**:
- Ensure text meets WCAG contrast guidelines (especially light gray labels)
- Avoid thin fonts on charts with busy backgrounds
- Use labels and annotations so color is not the only signal

**Color-Accessible Palettes**:
- Avoid red/green-only distinctions; pair with icons or patterns
- Use distinct shapes or line styles for multi-line charts
- Test with at least one color-blind simulator before publishing

### White Space
- Don't cram components together
- Use padding between components (20-30px)
- Allow charts to breathe (don't fill 100% of component)

---

## Common Patterns & Templates

### Pattern 1: Pipeline Dashboard
**Audience**: Sales Managers, Sales Reps

**Layout**:
```
[ FULL: Quota Progress Gauge ]
[ HALF: Pipeline by Stage Funnel ] [ HALF: Pipeline Trend Line ]
[ THIRD: Top 10 Deals Table ] [ THIRD: Stale Opps ] [ THIRD: Activities ]
```

**Source Reports**:
1. Quota Progress (Opportunities Summary: Owner = My, IsClosed = True AND IsWon = True)
2. Pipeline by Stage (Opportunities Summary: IsClosed = False, Group by Stage)
3. Pipeline Trend (Opportunities Summary: Close Date = THIS_FISCAL_YEAR, Group by Close Month)
4. Top 10 Deals (Opportunities Tabular: IsClosed = False, Sort by Amount DESC, Limit 10)

---

### Pattern 2: Marketing Funnel Dashboard
**Audience**: Marketing Managers, Demand Gen

**Layout**:
```
[ FULL: MQL to SQL Conversion Gauge ]
[ HALF: Funnel by Stage ] [ HALF: Lead Volume Trend ]
[ THIRD: Leads by Source Bar ] [ THIRD: Top Campaigns ] [ THIRD: Pipeline Influenced ]
```

**Source Reports**:
1. MQL to SQL (Contacts Summary: Group by MQL Stage, Calculate conversion %)
2. Funnel (Contacts Summary: Group by Lifecycle Stage)
3. Lead Volume (Leads Summary: Group by CreatedDate by Week)
4. Leads by Source (Leads Summary: Group by LeadSource)

---

### Pattern 3: Executive Summary Dashboard
**Audience**: VPs, CXOs

**Layout**:
```
[ FULL: Quarterly Revenue vs Target Gauge ]
[ HALF: Revenue Trend Line ] [ HALF: Pipeline Health Funnel ]
[ THIRD: Revenue by Region ] [ THIRD: Win Rate ] [ THIRD: Top 10 Deals ]
```

**Source Reports**:
1. Revenue vs Target (Opportunities Summary: IsWon = True, Group by Close Quarter)
2. Revenue Trend (Opportunities Summary: IsWon = True, Group by Close Month)
3. Pipeline Health (Opportunities Summary: IsClosed = False, Group by Stage)
4. Revenue by Region (Opportunities Summary: IsWon = True, Group by Account.Region)

---

### Pattern 4: Customer Success Dashboard
**Audience**: CSMs, Support Managers

**Layout**:
```
[ FULL: At-Risk Accounts Metric ]
[ HALF: Account Health Distribution ] [ HALF: Case Volume Trend ]
[ THIRD: Renewal Pipeline ] [ THIRD: Open Critical Cases ] [ THIRD: Avg Resolution Time ]
```

**Source Reports**:
1. At-Risk Accounts (Accounts Tabular: Health Score = Red OR Yellow)
2. Health Distribution (Accounts Summary: Group by Health Score)
3. Case Volume (Cases Summary: Group by CreatedDate by Week)
4. Renewal Pipeline (Opportunities Summary: Type = Renewal, Group by Close Month)

---

## Anti-Patterns to Avoid

### ❌ Too Many Components
**Problem**: Dashboard with 15+ charts becomes overwhelming

**Solution**: Create multiple focused dashboards or use folders

### ❌ Wrong Chart Type
**Problem**: Pie chart with 15 slices, line chart for categories

**Solution**: Follow chart type guidelines (see Chart Selection Matrix)

### ❌ No Visual Hierarchy
**Problem**: All components same size, random colors

**Solution**: Apply size/color/placement hierarchy based on importance

### ❌ Generic Naming
**Problem**: Dashboard titled "Sales Report 1"

**Solution**: Use descriptive names: "Sales Manager - Team Performance"

### ❌ Slow Performance
**Problem**: Dashboard takes 30+ seconds to load

**Solution**: Optimize source reports (filters, columns, date ranges)

### ❌ Buried KPI
**Problem**: Most important metric is small and at bottom

**Solution**: Put primary KPI top-left, make it large (full-width)

### ❌ Inconsistent Colors
**Problem**: "Closed Won" is green in one chart, blue in another

**Solution**: Define color palette, apply consistently

### ❌ Information Overload
**Problem**: Trying to answer every question in one dashboard

**Solution**: Focus on 1-2 key decisions, provide drill-down for details

### ❌ No Filters
**Problem**: Report queries all records (slow, overwhelming)

**Solution**: Add date range, owner, and status filters

### ❌ Too Many Columns
**Problem**: Report with 20+ columns is unreadable

**Solution**: Limit to 5-10 essential columns

---

## Quality Checklist

### Report Quality Checklist

#### Design Quality
- [ ] Report format matches use case (Tabular/Summary/Matrix/Joined)
- [ ] Report type includes all needed fields
- [ ] Columns limited to 5-10 (not more)
- [ ] Fields ordered logically (left-to-right importance)
- [ ] Groupings are meaningful (categorical fields)
- [ ] Aggregates are appropriate (sum, count, avg)

#### Performance
- [ ] Date range filter applied (LAST_90_DAYS, THIS_QUARTER, etc.)
- [ ] Owner filter applied (My, My Team, or specific)
- [ ] Filters use indexed fields when possible
- [ ] Avoid wildcard/contains filters
- [ ] Grouping levels ≤ 2
- [ ] Detail rows hidden if not needed
- [ ] Report loads in <10 seconds

#### Usability
- [ ] Clear, descriptive report name
- [ ] Report description documents purpose
- [ ] Filters are testable (can narrow to subset)
- [ ] Sort order is logical
- [ ] Chart type matches data (if applicable)

---

### Dashboard Quality Checklist

#### Design Quality
- [ ] 5-7 components (not more)
- [ ] Clear visual hierarchy (size, color, placement)
- [ ] Consistent color scheme (semantic colors)
- [ ] Appropriate chart types (match data structure)
- [ ] Clear component titles (self-explanatory)
- [ ] No redundant information
- [ ] Mobile-friendly layout (if applicable)

#### Audience Alignment
- [ ] KPIs match viewer's decision-making authority
- [ ] Scope matches viewer's responsibility (company/team/individual)
- [ ] Refresh frequency matches usage pattern
- [ ] Terminology matches viewer's vocabulary
- [ ] Drill-down depth matches viewer's needs

#### Performance
- [ ] All source reports load in <5 seconds
- [ ] Dashboard loads in <10 seconds
- [ ] No reports querying >100k records
- [ ] Filters use indexed fields
- [ ] Scheduled refresh configured (if needed)

#### Interactivity
- [ ] Dashboard filters work on all components
- [ ] Drill-down paths tested
- [ ] Source reports have detail fields
- [ ] Components are clickable where appropriate

#### Accessibility
- [ ] Color contrast meets WCAG standards
- [ ] Color is not the only indicator (use labels too)
- [ ] Text is readable (font size ≥12px)
- [ ] Chart legends are clear

---

## Conclusion

Effective Salesforce reports and dashboards are **purpose-driven**, **audience-tailored**, **visually optimized**, and **performance-focused**. By following the guidelines in this document, you can create analytics that:

✅ Drive decisions and actions
✅ Load quickly and reliably
✅ Guide attention to what matters most
✅ Match audience needs and vocabulary
✅ Enable self-service analytics

**Remember**: The goal is not to display all data—it's to deliver insights that drive action.

---

## Related Resources

- **Agents**:
  - `sfdc-dashboard-designer` - Dashboard design with audience tailoring
  - `sfdc-report-designer` - Report format selection and optimization
  - `sfdc-reports-dashboards` - Report/dashboard creation and deployment

- **Scripts**:
  - `chart-type-selector.js` - Recommend optimal chart types
  - `dashboard-layout-optimizer.js` - Optimize component placement
  - `dashboard-quality-validator.js` - Score dashboard quality
  - `report-quality-validator.js` - Score report quality

- **Templates**:
  - `templates/reports/` - Pre-built report templates by audience
  - `templates/dashboards/` - Pre-built dashboard templates by role

- **Documentation**:
  - `TEMPLATE_USAGE_GUIDE.md` - How to use and customize templates
  - Salesforce Help: [Dashboard Best Practices](https://help.salesforce.com)

---

**Version History**:
- v1.0 (2025-10-17): Initial release with enterprise design guidelines
