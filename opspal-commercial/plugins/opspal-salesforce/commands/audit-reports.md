---
name: audit-reports
description: Comprehensive 6-month usage audit for Salesforce reports and dashboards
argument-hint: "<org-alias>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - TodoWrite
thinking-mode: enabled
---

# Reports & Dashboards Usage Audit

## Purpose

**What this command does**: Analyzes all Salesforce reports and dashboards over a rolling 6-month window, identifying stale inventory, filter compliance violations, department coverage gaps, and unused critical fields.

**When to use it**:
- ✅ Quarterly reporting health checks
- ✅ Before major cleanup initiatives (identify deletion candidates)
- ✅ After org mergers or acquisitions (understand inherited reports)
- ✅ When reporting performance is degraded (find filter violations)
- ✅ To assess department-level reporting coverage

**When NOT to use it**:
- ❌ For real-time report performance debugging (use Salesforce Event Monitoring)
- ❌ For individual report quality checks (use existing quality validators)
- ❌ During active report creation (wait until implementation complete)

## Prerequisites

### Required Configuration

**Salesforce CLI Authentication** (MANDATORY):
```bash
# Authenticate to target org
sf org login web --alias myorg

# Verify authentication
sf org display --target-org myorg
```

**Environment Variables** (Optional):
```bash
# Default org (prevents wrong-org operations)
export SF_TARGET_ORG=myorg
```

### Analytics API Access

**Required Permissions**:
- View All Data OR View All Reports
- View Dashboards
- Read access to Report and Dashboard objects

**Verification**:
```bash
# Test Analytics API access
sf data query --query "SELECT Id FROM Report LIMIT 1" --target-org myorg --json
```

## Usage

### Basic Usage

```bash
/audit-reports <org-alias>
```

**Example**:
```bash
/audit-reports production
/audit-reports delta-sandbox
```

### Advanced Usage

**Custom date window** (default 6 months):
```bash
/audit-reports <org-alias> --window-months 12
```

**Custom output directory**:
```bash
/audit-reports <org-alias> --output /path/to/custom/directory
```

**Enable Owner metadata for better classification** (+30-60 seconds, +10-30 confidence):
```bash
/audit-reports <org-alias> --include-owner-metadata
```

## Execution Workflow

The command orchestrates a 6-step analysis pipeline:

### Step 1: Data Collection (reports-usage-analyzer.js)
- Queries all Reports via SOQL (Id, Name, FolderName, OwnerId, LastModifiedDate)
- Queries all Dashboards via SOQL (Title, FolderName, LastViewedDate, **DashboardResultRefreshedDate**)
- Tracks dashboard utilization within **last 30 days** using LastRunDate (DashboardResultRefreshedDate)
- Maps Dashboards to Reports via DashboardComponent relationships
- Fetches field metadata via Analytics API (200 active reports max)
- **Time**: 2-10 minutes depending on org size

### Step 2: Department Classification (department-classifier.js)
- Multi-factor scoring: 40% folder name, 30% fields, 20% owner, 10% report type
- Classifies into 8 departments: Sales, Marketing, Support, Customer Success, Finance, Executive, Operations, Unknown
- Generates confidence scores (0.0-1.0)
- **Time**: 10-30 seconds

### Step 3: Field Usage Aggregation (field-usage-aggregator.js)
- Aggregates 500+ unique fields across all reports
- Identifies top 20 most used fields
- Finds rarely used fields (≤1 report)
- Groups by object for coverage analysis
- **Time**: 5-15 seconds

### Step 4: Filter Pattern Analysis (filter-pattern-analyzer.js)
- Detects date filter compliance (best practice check)
- Detects owner filter compliance
- Identifies common filter patterns
- Flags reports with NO filters (performance risk)
- **Time**: 5-15 seconds

### Step 5: Gap Detection (gap-detector.js)
- Identifies departments with low/no reporting activity
- Detects missing dashboards for active departments
- Finds unused critical fields (Amount, StageName, etc.)
- Flags stale inventory (>6 months unused)
- Prioritizes gaps: High/Medium/Low
- **Time**: 5-15 seconds

### Step 6: Report Generation (usage-audit-report-generator.js)
- Generates markdown executive summary (AUDIT_REPORT.md)
- Exports 4 CSV files for detailed analysis
- Creates actionable recommendations
- **Time**: 5-10 seconds

## Output Structure

```
instances/<org-alias>/reports-usage-audit-<date>/
├── AUDIT_REPORT.md                    # Executive summary (20+ sections)
├── usage-stats.csv                    # All reports with usage metrics
├── field-usage.csv                    # Field frequency analysis
├── department-breakdown.csv           # Department summary
├── gaps.csv                           # Prioritized gaps with recommendations
├── usage-metrics.json                 # Raw data (all reports/dashboards with 30-day metrics)
├── department-classification.json     # Classification results with scores
├── field-usage-aggregation.json       # Field usage details
├── filter-patterns.json               # Filter compliance analysis
└── gap-detection.json                 # Gap findings with metadata
```

### usage-metrics.json Structure (Enhanced)

**New Dashboard Metrics** (v1.1.0):
- `summary.recentDashboards`: Count of dashboards run in last 30 days
- `topDashboards`: Top 10 dashboards by LastRunDate (DashboardResultRefreshedDate)
- `dashboards[].lastRunDate`: When dashboard was last refreshed/run
- `dashboards[].isRecent`: True if run within last 30 days
- `metadata.dashboardRecentDays`: 30 (configurable)
- `metadata.dashboardRecentCutoff`: ISO date for 30-day cutoff

### AUDIT_REPORT.md Sections

1. **Executive Summary**: High-level metrics (total reports, active rate, gaps)
2. **Key Findings**: Top insights (most used, stale inventory, filter gaps)
3. **Usage Metrics**: Top 10 most/least used reports + **Top 10 dashboards by LastRunDate (30 days)**
4. **Field Usage Analysis**: Most/rarely used fields
5. **Filter Patterns**: Compliance metrics and violations
6. **Department Breakdown**: 8 departments with active/total counts
7. **Gap Analysis**: 20+ gaps prioritized by high/medium/low
8. **Recommendations**: 4 actionable next steps

## Interpreting Results

### Active vs Stale Classification

**Definition**:
- **Reports**:
  - **Active**: Modified in last 6 months (LastModifiedDate)
  - **Stale**: Not modified in 6+ months (deletion candidate)
  - **Note**: Uses `LastModifiedDate` because `LastRunDate` not available via SOQL

- **Dashboards**:
  - **Active**: Viewed in last 6 months (LastViewedDate)
  - **Recent**: Run in last 30 days (**DashboardResultRefreshedDate**)
  - **Stale**: Not viewed in 6+ months (deletion candidate)
  - **Note**: Dashboards track actual run/refresh dates via `DashboardResultRefreshedDate`

### Department Classification Confidence

**Confidence Scores** (0.0-1.0):
- **0.00-0.10**: Low confidence (generic folder, no clear ownership) → "Unknown" likely
- **0.10-0.30**: Medium confidence (some signals, but weak)
- **0.30-1.00**: High confidence (strong folder/field/owner signals)

**Improving Classification**:
```bash
# Enable Owner metadata for +10-30 confidence points (+30-60 seconds)
/audit-reports myorg --include-owner-metadata
```

### Filter Compliance Violations

**Best Practices**:
- ✅ **Date filters**: Reports should filter by date range (CreatedDate, CloseDate, etc.)
- ✅ **Owner filters**: Reports should filter by user/team (OwnerId, Owner.Name, etc.)
- ❌ **No filters**: Reports without filters are performance risks (full table scans)

**Typical Findings**:
- 97%+ orgs have reports missing date filters
- 98%+ orgs have reports missing owner filters
- 5-10 reports per org have NO filters at all

### Gap Priority Levels

**High Priority** (fix in 1-2 weeks):
- Critical fields never used (Amount, StageName, etc.)
- Departments with 100+ reports but 0% active
- Reports with NO filters (performance risk)

**Medium Priority** (fix in 1-2 months):
- Low department engagement (<5 active reports)
- Stale inventory (7,000+ reports unused)
- Missing date filters (97%+ reports)

**Low Priority** (address when convenient):
- Rarely used fields (≤1 report)
- Minor department coverage gaps

## Performance Benchmarks

**Org Size vs Execution Time**:
- Small (<500 reports): <2 minutes
- Medium (500-2,000 reports): 2-5 minutes
- Large (2,000-10,000 reports): 5-10 minutes
- Very Large (>10,000 reports): May require buffer increase

**Bottlenecks**:
- SOQL queries: 30-60 seconds for 7,000+ reports
- Analytics API: 30-90 seconds for 200 metadata fetches
- Classification: 10-30 seconds
- Other steps: <30 seconds combined

## Known Limitations

### 1. No Actual Usage Tracking for Reports

**Issue**: Salesforce doesn't expose `LastRunDate` or `TimesRun` for **Reports** via SOQL.

**Workaround**: Uses `LastModifiedDate` as proxy for report activity.

**Impact**: Reports run frequently but not modified appear "stale".

**Alternative**: Use Salesforce Event Monitoring or ReportRun object (requires additional API calls).

**Dashboard Exception**: Dashboards DO have `DashboardResultRefreshedDate` which tracks actual run dates. This is used for the 30-day utilization metric.

### 2. Classification Confidence

**Issue**: Low confidence scores (0.05-0.08) without Owner metadata.

**Workaround**: Enable `--include-owner-metadata` flag (+30-60 seconds).

**Impact**: 40-60% reports classified as "Unknown" without Owner data.

### 3. Metadata Fetch Failures

**Issue**: 3-5% of reports fail metadata fetch (deleted fields, permission errors).

**Impact**: Field usage analysis incomplete for failed reports.

**Mitigation**: Failures logged with report name and error message (continue processing).

### 4. Buffer Limits

**Issue**: Very large orgs (>10,000 reports) may exceed 50MB buffer.

**Workaround**: Increase buffer in `reports-usage-analyzer.js`:
```javascript
const { stdout } = await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 }); // 100MB
```

## Troubleshooting

### Error: "sf command not found"

**Cause**: Salesforce CLI not installed or not in PATH.

**Fix**:
```bash
npm install -g @salesforce/cli
sf --version
```

### Error: "Invalid org alias"

**Cause**: Org not authenticated or wrong alias.

**Fix**:
```bash
sf org list
sf org login web --alias myorg
```

### Error: "INSUFFICIENT_ACCESS: You do not have the level of access necessary"

**Cause**: User lacks View All Data or View All Reports permission.

**Fix**: Grant user "View All Data" permission or "View All Reports" object permission.

### Error: "stdout maxBuffer length exceeded"

**Cause**: Org has >10,000 reports and exceeds 50MB buffer.

**Fix**: Increase buffer in `scripts/lib/reports-usage-analyzer.js`:
```javascript
const CONFIG = {
    MAX_BUFFER_SIZE: 100 * 1024 * 1024  // 100MB
};
```

### Warning: "Low classification confidence"

**Cause**: Missing Owner metadata.

**Fix**: Re-run with `--include-owner-metadata` flag:
```bash
/audit-reports myorg --include-owner-metadata
```

### Warning: "Failed to fetch metadata for N reports"

**Cause**: Reports contain deleted fields or user lacks permission.

**Impact**: 3-5% failure rate is normal and expected.

**Fix**: Review failed reports in logs, fix permission or metadata issues.

## Integration with Other Audits

This command can be invoked as part of comprehensive assessments:

### From sfdc-revops-auditor
```bash
# RevOps audits include reporting analysis by default
# Reports usage automatically analyzed for revenue team reporting coverage
```

### From sfdc-cpq-assessor
```bash
# CPQ assessments include CPQ-specific report analysis
# Checks for Quote, Product, Pricing, and Revenue reports
```

### Standalone Usage
```bash
# Run reports audit independently
/audit-reports production
```

## Best Practices

### ✅ DO

- **Run quarterly**: Detect drift over time
- **Review gaps first**: Start with high-priority gaps (executive summary)
- **Export CSVs**: Share with stakeholders for review
- **Clean up stale reports**: Delete reports unused for 12+ months (after approval)
- **Add missing filters**: Fix date filter violations for performance
- **Use with other audits**: Combine with RevOps/CPQ assessments for complete picture

### 🚫 DON'T

- **Delete reports without approval**: Always review with business owners
- **Ignore Unknown department**: May contain critical cross-functional reports
- **Over-optimize classification**: 0.05-0.08 confidence is normal without Owner metadata
- **Run during business hours**: May impact org performance (large SOQL queries)
- **Skip filter compliance**: 97%+ orgs have violations - fix these first

## Success Metrics

**Expected Outcomes**:
- 20+ gaps identified with actionable recommendations
- 70-90% stale inventory identified (cleanup candidates)
- 97%+ filter compliance violations detected
- 10-15 unused critical fields found
- 8 departments classified with coverage metrics

**ROI**:
- 6-month audit in <10 minutes (vs. hours manually)
- $10,000+ annual value in reduced storage and improved performance
- Clear deletion candidates (7,000+ stale reports in typical org)
- Prioritized remediation plan (high/medium/low gaps)

## Examples

### Example 1: Production Org Quarterly Audit
```bash
/audit-reports production

# Output (instances/production/reports-usage-audit-2025-10-18/):
# - 5,234 reports (412 active, 4,822 stale) - 92.1% cleanup opportunity
# - 287 dashboards:
#   - 8 active (6 months) - 2.8%
#   - 3 recent (30 days) - 1.0% utilization
#   - 279 stale - 97.2% cleanup opportunity
# - 18 high-priority gaps (unused critical fields, missing dashboards)
# - 4,822 stale reports → $8,000/year storage savings
# - Top dashboards: Sales Overview, Executive Dashboard, Support Metrics (all run this week)
```

### Example 2: Post-Merger Org Analysis
```bash
/audit-reports merged-org --window-months 12

# Output:
# - 12,456 reports (merged from 3 orgs)
# - 89% duplicate/stale inventory
# - 34 departments (many redundant)
# - Recommendation: Consolidate to 8 departments, delete 11,000 stale reports
```

### Example 3: CPQ Implementation Validation
```bash
/audit-reports cpq-org

# Output:
# - Gap: "Critical field SBQQ__NetTotal__c never used in reports"
# - Gap: "Sales has 45 reports but 0 Quote analysis reports"
# - Recommendation: Create CPQ-specific reports for Quote analysis
```

## See Also

- **USAGE.md**: Complete agent and workflow documentation
- **REPORTS_USAGE_AUDITOR_LESSONS_LEARNED.md**: Testing results and recommendations
- **CHANGELOG.md**: Version 3.11.0 release notes
- **sfdc-reports-usage-auditor agent**: Conversational invocation alternative

---

**Version**: 3.11.0
**Last Updated**: 2025-10-18
**Author**: RevPal Engineering
