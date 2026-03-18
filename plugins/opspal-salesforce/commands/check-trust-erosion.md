---
name: check-trust-erosion
description: Detect trust erosion signals in Salesforce reports and dashboards (shadow reports, metric inconsistencies, ownership abandonment)
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

# Check Trust Erosion

## Purpose

**What this command does**: Analyzes Salesforce reports and dashboards for trust erosion signals - indicators that users don't trust the official reporting and are creating workarounds.

**Trust Erosion Signals Detected**:
1. **Shadow Reports** - Unofficial copies with similar names (e.g., "Pipeline - Copy", "My Pipeline v2")
2. **Metric Inconsistencies** - Same metric calculated differently across reports
3. **Ownership Abandonment** - Reports owned by deactivated users or generic accounts
4. **Dashboard Fragmentation** - Multiple dashboards covering the same metrics for same audience
5. **Export Patterns** - High export activity suggesting data is being manipulated in spreadsheets

**When to use it**:
- ✅ During reporting health checks
- ✅ Before dashboard consolidation projects
- ✅ When stakeholders complain about "conflicting numbers"
- ✅ After org mergers to identify redundant reporting
- ✅ When investigating why users don't trust official dashboards

**When NOT to use it**:
- ❌ For individual report quality assessment (use `/audit-reports`)
- ❌ For migration validation (use semantic diff tools)
- ❌ During active report development

## Prerequisites

### Required Configuration

**Salesforce CLI Authentication** (MANDATORY):
```bash
sf org login web --alias myorg
sf org display --target-org myorg
```

**Required Permissions**:
- View All Data OR View All Reports
- View Dashboards
- Read access to Report, Dashboard, and User objects

## Usage

### Basic Usage

```bash
/check-trust-erosion <org-alias>
```

**Examples**:
```bash
/check-trust-erosion production
/check-trust-erosion staging --output-format json
```

### Advanced Options

**Custom thresholds**:
```bash
/check-trust-erosion <org-alias> --shadow-threshold 3 --abandonment-days 90
```

**Focus on specific signals**:
```bash
/check-trust-erosion <org-alias> --signals shadow,metric-inconsistency
```

**Include detailed component analysis**:
```bash
/check-trust-erosion <org-alias> --detailed
```

## Execution Workflow

### Step 1: Data Collection
- Query all Reports (Name, FolderName, OwnerId, LastModifiedDate)
- Query all Dashboards (Title, Components, LastViewedDate)
- Query User status (Active/Inactive)
- **Time**: 1-3 minutes

### Step 2: Shadow Report Detection
- Group reports by normalized name (removing copy/v2/backup patterns)
- Flag groups with >threshold similar reports
- Identify "official" vs "shadow" based on folder location and age
- **Time**: 10-30 seconds

### Step 3: Metric Inconsistency Analysis
- Extract metric type from report configuration
- Compare calculation patterns for same metric across reports
- Flag inconsistencies (e.g., ARR vs TCV for "Pipeline")
- **Time**: 15-45 seconds

### Step 4: Ownership Analysis
- Identify reports owned by inactive users
- Detect reports owned by generic accounts (admin, integration)
- Calculate abandonment risk scores
- **Time**: 10-20 seconds

### Step 5: Fragmentation Detection
- Analyze dashboard audience overlap
- Identify duplicate metric coverage
- Calculate fragmentation index
- **Time**: 15-30 seconds

### Step 6: Trust Score Calculation
- Aggregate all signals with weights
- Calculate org-wide trust score (0-100)
- Generate recommendations by priority
- **Time**: 5-10 seconds

## Output Structure

```
instances/<org-alias>/trust-erosion-<date>/
├── TRUST_EROSION_REPORT.md        # Executive summary
├── trust-score.json                # Overall score and breakdown
├── shadow-reports.csv              # Detected shadow reports
├── metric-inconsistencies.csv      # Metric calculation conflicts
├── abandoned-reports.csv           # Ownership risk items
├── fragmented-dashboards.csv       # Dashboard overlap analysis
└── recommendations.json            # Prioritized action items
```

## Trust Score Interpretation

### Overall Trust Score (0-100)

| Score | Status | Interpretation |
|-------|--------|----------------|
| 90-100 | Healthy | Minimal trust erosion, well-governed reporting |
| 70-89 | Good | Some signals present, minor cleanup needed |
| 50-69 | Warning | Significant trust issues, remediation recommended |
| 30-49 | Critical | Widespread distrust, major consolidation needed |
| 0-29 | Severe | Reporting ecosystem compromised, redesign required |

### Signal Weights

| Signal | Weight | Threshold |
|--------|--------|-----------|
| Shadow Reports | 30% | >3 copies = high risk |
| Metric Inconsistency | 25% | >2 definitions = warning |
| Ownership Abandonment | 20% | >90 days inactive = risk |
| Dashboard Fragmentation | 15% | >60% overlap = warning |
| Export Patterns | 10% | >10 exports/week = signal |

## Common Findings

### Shadow Report Patterns

**Typical findings**:
- "Pipeline Dashboard" + "Pipeline Dashboard - Copy" + "My Pipeline"
- "Executive Summary" + "Executive Summary v2" + "Executive Summary (Old)"
- Reports in Public folders cloned to Private folders

**Root causes**:
- Users don't trust official numbers
- Permission issues forcing personal copies
- Lack of governance on report creation

### Metric Inconsistency Patterns

**Common conflicts**:
- Win Rate: Count-based vs Value-based
- Pipeline: ARR vs TCV vs ACV
- Revenue: Bookings vs Recognized vs Invoiced

**Impact**:
- Different numbers in executive presentations
- Decision-making based on inconsistent data
- Loss of confidence in reporting system

## Remediation Recommendations

### High Priority (Immediate)

1. **Consolidate shadow reports**
   - Identify authoritative version
   - Migrate users to official report
   - Archive/delete shadows

2. **Standardize metric definitions**
   - Map all reports to canonical metrics
   - Update inconsistent reports
   - Document calculation methodology

### Medium Priority (1-2 Months)

3. **Reassign abandoned reports**
   - Transfer ownership to active users
   - Review and archive if unused
   - Establish ownership governance

4. **Reduce dashboard fragmentation**
   - Merge overlapping dashboards
   - Define audience-specific views
   - Remove redundant components

### Low Priority (Ongoing)

5. **Monitor export patterns**
   - Investigate high-export reports
   - Address root causes (missing filters, poor UX)
   - Consider embedding in workflows

## Integration with Other Commands

### Recommended Workflow

```bash
# 1. Run trust erosion check first
/check-trust-erosion production

# 2. Deep dive into report quality
/audit-reports production

# 3. Assess specific dashboard quality
node scripts/lib/dashboard-quality-validator.js --dashboard Dashboard.json

# 4. Plan remediation
# Review recommendations.json and prioritize fixes
```

### From sfdc-reports-dashboards Agent

The trust erosion check is automatically invoked when:
- Creating new dashboards (checks for existing similar)
- Validating report migrations
- Running comprehensive reporting audits

## Troubleshooting

### Error: "No reports found"

**Cause**: Org has no reports or permission denied.

**Fix**:
```bash
sf data query --query "SELECT COUNT() FROM Report" --target-org myorg
```

### Warning: "High shadow report count"

**Cause**: Many duplicate reports detected.

**Action**: Review shadow-reports.csv and plan consolidation.

### Warning: "Low trust score (<50)"

**Cause**: Multiple trust erosion signals detected.

**Action**:
1. Review TRUST_EROSION_REPORT.md
2. Prioritize based on recommendations.json
3. Address high-impact signals first

## Success Metrics

**Expected Outcomes**:
- Trust score baseline established
- Shadow report inventory identified (typically 10-30% of reports)
- Metric inconsistencies documented
- Prioritized remediation plan

**ROI**:
- Reduce conflicting numbers in exec meetings
- Decrease support tickets about "wrong data"
- Improve report adoption rates
- Save hours of manual duplicate detection

## See Also

- `/audit-reports` - Comprehensive usage audit
- `/analyze-decay-risk` - Predict report abandonment
- `/score-actionability` - Evaluate dashboard effectiveness
- `scripts/lib/trust-erosion-detector.js` - Core detection logic
- `config/migration-failure-taxonomy.json` - Failure patterns

---

**Version**: 1.0.0
**Last Updated**: 2026-01-15
**Author**: RevPal Engineering
