---
name: diagnose-sales-funnel
description: Run comprehensive top-of-funnel and mid-funnel sales performance diagnostic with industry-benchmarked analysis and actionable remediation plans
argument-hint: "[options]"
aliases: [diagnose-tofu, funnel-diagnostic, analyze-funnel]
---

# Sales Funnel Diagnostic Command

Executes a comprehensive sales funnel diagnostic to identify performance gaps, compare against industry benchmarks, and generate prioritized remediation plans.

## What This Command Does

1. **Data Collection**: Queries Salesforce and/or HubSpot for sales activities, leads/contacts, meetings, and opportunities
2. **Metrics Calculation**: Calculates conversion rates at each funnel stage (prospecting → engagement → meetings → pipeline → close)
3. **Industry Benchmarking**: Compares your metrics to industry standards (SaaS, Pharma, Enterprise, PropTech, SMB)
4. **Gap Analysis**: Identifies significant performance gaps and prioritizes by impact
5. **Root Cause Diagnostics**: Applies diagnostic patterns to identify why metrics are underperforming
6. **Remediation Planning**: Generates specific, actionable recommendations with expected impact
7. **Report Generation**: Creates professional PDF report with executive summary and detailed findings

## Usage

```bash
/diagnose-sales-funnel [options]
```

### Options

- **--platform <sf|hs|both>** - Platform to analyze (default: salesforce)
- **--date-range <range>** - Analysis period (e.g., 90d, 6m, 1y) (default: 90d)
- **--org-alias <alias>** - Salesforce org alias (if platform is sf or both)
- **--industry <industry>** - Industry for benchmarks (saas, pharma, enterprise, proptech, smb) or auto-detect
- **--segment-by <dimensions>** - Segment analysis by rep, team, region, etc. (comma-separated)
- **--focus <area>** - Focus on specific funnel area (tofu, mid-funnel, full)
- **--output-dir <path>** - Output directory for reports (default: ./reports/sales-funnel-diagnostic)

### Examples

**Basic Usage (Salesforce, 90 days)**
```bash
/diagnose-sales-funnel
```

**Full Funnel with Segmentation**
```bash
/diagnose-sales-funnel --date-range 6m --segment-by Owner,Region --industry saas
```

**Top-of-Funnel Focus**
```bash
/diagnose-sales-funnel --focus tofu --date-range 90d
```

**Cross-Platform Analysis**
```bash
/diagnose-sales-funnel --platform both --date-range 90d --industry enterprise
```

## What You'll Get

### Executive Summary (2 pages)
- **Key Findings**: Top 3-5 critical issues and strengths
- **Business Impact**: Quantified revenue opportunity
- **Top Priorities**: 3 highest-impact actions to take immediately
- **Expected Outcomes**: Projected improvements from remediation

### Full Diagnostic Report (15-25 pages)
- **Funnel Flow Analysis**: Stage-by-stage conversion rates and drop-offs
- **Benchmark Comparison**: Your org vs industry average vs top 25%
- **Activity Analysis**: Rep productivity and efficiency metrics
- **Root Cause Analysis**: Why each gap exists (data-driven)
- **Segmentation Insights**: Performance by rep, region, or team (if requested)

### Remediation Action Plan (8-12 pages)
- **Phased Implementation**: Quick wins → Process improvements → Systematic changes
- **Specific Actions**: Exactly what to do, by whom, by when
- **Expected Impact**: Quantified improvement for each action
- **Success Metrics**: KPIs to track progress
- **Resource Requirements**: Time, budget, and dependencies

### Additional Outputs
- **Benchmark Comparison Table**: Markdown table of all metrics
- **Rep Performance Scorecards**: Individual/team analysis (if segmented)
- **JSON Data Files**: Raw data for further analysis
- **PDF Report**: Professional multi-document PDF with cover page

## How Long Does It Take?

- **Data Collection**: 2-5 minutes (depends on data volume)
- **Analysis & Diagnostics**: 3-7 minutes
- **Report Generation**: 2-4 minutes
- **Total**: ~10-15 minutes for standard diagnostic

## Prerequisites

### Required Access
- Salesforce CLI authenticated to target org (if analyzing Salesforce)
- HubSpot API access via MCP (if analyzing HubSpot)
- Minimum 90 days of historical data (recommended)
- Activity tracking enabled (Tasks, Events in Salesforce)

### Minimum Data Requirements
- 100+ opportunities for statistical significance
- 1,000+ outreach activities (calls, emails)
- 50+ meetings held
- Consistent date range across all data

### Not Required (But Helpful)
- Custom fields for tracking engagement results (e.g., ShowedUp__c on Events)
- Lead/opportunity source tracking
- Rep territory/team assignments

## Interpretation Guide

### Performance Tiers
- **🏆 Top Quartile** - Performing in top 25% (celebrate and replicate!)
- **✅ Above Average** - Performing above industry average (good)
- **➡️ Average** - At industry average (room for improvement)
- **⚠️ Below Average** - Below acceptable threshold (needs attention)

### Severity Levels
- **🚨 Critical** - 30%+ below benchmark (immediate action required)
- **⚠️ Significant** - 20-30% below benchmark (high priority)
- **⚠️ Moderate** - 10-20% below benchmark (medium priority)
- **➡️ Minor** - 5-10% below benchmark (incremental improvement)

### Priority Scores
Higher priority scores indicate bigger impact opportunities:
- **80-100**: Fix immediately - massive impact
- **60-79**: High priority - significant impact
- **40-59**: Medium priority - good ROI
- **20-39**: Low priority - incremental gains
- **<20**: Nice to have - optimize when ready

## Common Findings & What They Mean

### "High Activity, Low Conversion"
**Symptoms**: Lots of calls/emails but few meetings
**Root Causes**: Poor targeting, generic messaging, bad data
**Actions**: Refine ICP, personalize outreach, clean contact database

### "Good Meetings, Poor Pipeline"
**Symptoms**: Meetings happen but don't become opportunities
**Root Causes**: Loose qualification, wrong personas, weak discovery
**Actions**: Tighten BANT criteria, train on discovery, score calls

### "Sufficient Pipeline, Low Win Rate"
**Symptoms**: Enough opps but not closing
**Root Causes**: Poor qualification, sales execution, competitive losses
**Actions**: Improve demos, develop battlecards, strengthen value prop

### "High No-Show Rate"
**Symptoms**: >20% of meetings don't occur
**Root Causes**: Weak commitment, no confirmation process, vague value
**Actions**: Implement reminder cadence, set clear agendas, reconfirm day before

## Tips for Best Results

### Before Running
1. **Verify data quality**: Check that activities are being logged
2. **Confirm date range**: Ensure 90+ days of clean data
3. **Define your ICP**: Know what "good-fit" prospect looks like
4. **Set success criteria**: What would "good" metrics look like for you?

### During Analysis
- The agent will auto-detect your industry - confirm it's correct
- If stage mapping prompts appear, map your custom stages carefully
- Segmentation adds 5-10 minutes - only use if needed for insights

### After Receiving Report
1. **Read executive summary first** - Get the big picture
2. **Review top 3 priorities** - These are highest ROI
3. **Share with leadership** - Get buy-in for changes
4. **Create action plan timeline** - Assign owners and deadlines
5. **Track progress weekly** - Monitor metrics as changes roll out

## Integration with Other Assessments

This diagnostic integrates well with:
- **RevOps Audit** (`sfdc-revops-auditor`) - Broader operational assessment
- **CPQ Assessment** (`sfdc-cpq-assessor`) - Quote-to-cash analysis
- **Permission Review** - Security and access optimization
- **Report Usage Audit** - Analytics and reporting assessment

The funnel diagnostic can be:
- **Standalone** - One-time health check
- **Part of RevOps** - Component of quarterly review
- **Pre-Campaign** - Baseline before sales initiative
- **Post-Mortem** - Understand why pipeline declined

## Troubleshooting

### "Insufficient data" Error
**Cause**: Less than minimum records for analysis
**Fix**: Expand date range or confirm activity tracking is enabled

### "Cannot connect to Salesforce" Error
**Cause**: Not authenticated or wrong org alias
**Fix**: Run `sf org login web --alias <alias>` first

### "Industry auto-detection failed" Warning
**Cause**: No clear industry signals in data
**Fix**: Specify industry manually with `--industry saas` (or other)

### "Stage mapping incomplete" Error
**Cause**: Custom stages don't map to standard funnel
**Fix**: Complete interactive stage mapping wizard when prompted

### Report shows all "N/A" for metrics
**Cause**: Activity tracking not enabled or no data in date range
**Fix**: Verify Task/Event records exist, check date filters

## What This Command Does NOT Do

- ❌ **Does not modify CRM data** - Read-only analysis
- ❌ **Does not auto-fix issues** - Provides recommendations only
- ❌ **Does not create Asana tasks** - Manual implementation required (use `/asana-update` separately if needed)
- ❌ **Does not track historical trends** - One-time snapshot (run periodically to track over time)
- ❌ **Does not guarantee improvements** - Success depends on implementing recommendations

## Related Commands

- `/sfdc-revops-auditor` - Comprehensive Salesforce revenue operations audit
- `/hubspot-analytics-orchestrator` - HubSpot engagement and pipeline analysis
- `/asana-link` - Link project to Asana for tracking remediation tasks
- `/asana-update` - Post diagnostic findings to Asana

## Support & Feedback

If the diagnostic reveals unexpected findings or you need help interpreting results:
1. Review the "Root Cause Analysis" section in the full report
2. Check the "Segmentation Insights" if results vary by rep/region
3. Use `/reflect` to submit feedback on the diagnostic process
4. Contact RevOps team for implementation support

## Version History

- **v1.0.0** (2025-10-28) - Initial release
  - Full funnel diagnostics (TOFU through close)
  - 5 industry benchmarks
  - Flexible stage mapping
  - Comprehensive remediation planning
  - Professional PDF output

---

**Pro Tip**: Run this diagnostic quarterly to track funnel health trends and measure impact of improvements!
