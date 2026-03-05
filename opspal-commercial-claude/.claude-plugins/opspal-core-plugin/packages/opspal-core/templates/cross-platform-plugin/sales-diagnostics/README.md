# Sales Funnel Diagnostic Report Templates

This directory contains markdown templates for generating professional sales funnel diagnostic reports.

## Overview

These templates are used by the `sales-funnel-diagnostic` agent to generate comprehensive, standardized reports for B2B sales funnel performance analysis.

## Template Structure

### Report Types (5 Templates - Coming in Phase 2)

1. **executive-summary.md** - Executive Summary (2 pages)
   - Top 3-5 critical findings
   - Business impact quantification
   - Top priorities with expected ROI
   - Executive recommendations

2. **full-diagnostic-report.md** - Full Diagnostic Report (15-25 pages)
   - Funnel flow analysis (stage-by-stage)
   - Conversion rate analysis
   - Benchmark comparison tables
   - Root cause analysis
   - Segmentation insights (if applicable)
   - Activity productivity metrics

3. **remediation-action-plan.md** - Remediation Action Plan (8-12 pages)
   - Prioritized recommendations (by impact)
   - Phased implementation approach:
     - Phase 1: Quick wins (0-30 days)
     - Phase 2: Process improvements (30-90 days)
     - Phase 3: Systematic changes (90+ days)
   - Expected impact per action
   - Success metrics and KPIs
   - Resource requirements

4. **benchmark-comparison.md** - Benchmark Comparison Tables
   - Industry vs organization metrics
   - Performance tier identification
   - Variance analysis
   - Top quartile comparison
   - Gap prioritization

5. **rep-performance-analysis.md** - Rep Performance Scorecards (if segmented)
   - Individual performance metrics
   - Team/region comparisons
   - Coaching opportunities
   - Best practices from top performers
   - Improvement recommendations per rep

## Template Variables

All templates support the following variables:

### Organization Variables
- `{{orgAlias}}` - Salesforce org alias or HubSpot portal name
- `{{orgName}}` - Full organization name
- `{{industry}}` - Industry classification (saas, pharma, enterprise, proptech, smb)
- `{{dateRange}}` - Analysis period (e.g., "Last 90 days", "Q3 2025")
- `{{generatedDate}}` - Report generation date (ISO 8601)

### Metrics Variables
- `{{totalLeads}}` - Total leads/contacts in period
- `{{totalActivities}}` - Total activities (calls + emails)
- `{{totalMeetings}}` - Total meetings held
- `{{totalOpportunities}}` - Total opportunities created
- `{{totalWon}}` - Total closed-won opportunities
- `{{conversionRates}}` - Object with all conversion rates
- `{{benchmarkComparison}}` - Object with benchmark data

### Analysis Variables
- `{{topFindings}}` - Array of top 3-5 findings
- `{{criticalGaps}}` - Array of critical performance gaps
- `{{priorityRecommendations}}` - Array of prioritized recommendations
- `{{segmentationResults}}` - Object with segmentation data (if applicable)

### Formatting Variables
- `{{performanceTier}}` - Overall performance tier (Top Quartile, Above Average, etc.)
- `{{severityLevel}}` - Highest severity level found (Critical, Significant, etc.)
- `{{reportTitle}}` - Custom report title
- `{{executiveSummary}}` - Pre-generated executive summary text

## Usage

### By sales-funnel-diagnostic Agent

The agent automatically selects and populates templates based on diagnostic results:

```javascript
// Agent will use templates like this:
const templates = [
  { template: 'executive-summary.md', title: 'Executive Summary', order: 0 },
  { template: 'full-diagnostic-report.md', title: 'Full Diagnostic', order: 1 },
  { template: 'benchmark-comparison.md', title: 'Benchmark Comparison', order: 2 },
  { template: 'remediation-action-plan.md', title: 'Remediation Plan', order: 3 }
];

if (segmentationEnabled) {
  templates.push({
    template: 'rep-performance-analysis.md',
    title: 'Rep Performance',
    order: 4
  });
}
```

### Direct Usage (Advanced)

You can also use templates directly for custom reports:

```javascript
const fs = require('fs');
const Handlebars = require('handlebars');

// Load template
const templateContent = fs.readFileSync(
  'templates/sales-diagnostics/executive-summary.md',
  'utf-8'
);

// Compile template
const template = Handlebars.compile(templateContent);

// Populate with data
const report = template({
  orgAlias: 'production',
  orgName: 'ACME Corp',
  industry: 'saas',
  dateRange: 'Q4 2025',
  topFindings: [
    { finding: 'Low meeting conversion', impact: '$250K ARR', priority: 'High' }
  ],
  // ... more variables
});

// Write report
fs.writeFileSync('reports/executive-summary.md', report);
```

## Report Generation Workflow

1. **Data Collection** - Collect metrics from Salesforce/HubSpot
2. **Benchmark Comparison** - Compare to industry standards
3. **Root Cause Analysis** - Identify bottlenecks and patterns
4. **Template Selection** - Choose appropriate templates
5. **Variable Substitution** - Populate templates with data
6. **Markdown Generation** - Create 5 markdown reports
7. **PDF Collation** - Combine into professional PDF using PDFGenerationHelper

## Integration with PDF Generation

All templates are designed to work with the PDF generation system:

```javascript
const PDFGenerationHelper = require('../../scripts/lib/pdf-generation-helper');

await PDFGenerationHelper.generateMultiReportPDF({
  orgAlias,
  outputDir: './reports/sales-funnel-diagnostic',
  documents: [
    { path: 'executive-summary.md', title: 'Executive Summary', order: 0 },
    { path: 'full-diagnostic-report.md', title: 'Full Diagnostic', order: 1 },
    { path: 'benchmark-comparison.md', title: 'Benchmark Comparison', order: 2 },
    { path: 'remediation-action-plan.md', title: 'Remediation Plan', order: 3 },
    { path: 'rep-performance-analysis.md', title: 'Rep Performance', order: 4 }
  ],
  coverTemplate: 'revops-audit',
  metadata: {
    title: `Sales Funnel Diagnostic - ${orgAlias}`,
    version: '1.0.0',
    date: new Date().toISOString()
  }
});
```

## Best Practices

### For Template Authors

1. **Keep it Scannable** - Use headers, bullet points, tables
2. **Be Data-Driven** - Include specific metrics and outcomes
3. **Show Context** - Always compare to benchmarks
4. **Provide Actions** - Every finding should have actionable recommendations
5. **Use Visuals** - Include tables, charts (Mermaid diagrams if helpful)
6. **Maintain Brevity** - Respect page count targets

### For Template Users

1. **Validate Data** - Ensure all variables have valid values before generation
2. **Check Context** - Verify industry and date range are correct
3. **Review Output** - Always review generated reports for accuracy
4. **Customize Thoughtfully** - Templates are starting points, adapt as needed
5. **Maintain Consistency** - Use templates consistently across all diagnostics

## Future Enhancements

### Phase 2 Enhancements (Planned)
- **Interactive charts** - Embedded Mermaid diagrams for funnel flow
- **Comparative analysis** - Compare current vs previous diagnostics
- **Custom sections** - User-defined template sections
- **Multi-language** - Internationalization support
- **Brand customization** - Client-specific logos and branding

### Phase 3 Enhancements (Future)
- **Automated updates** - Track progress and update reports
- **Email delivery** - Scheduled report distribution
- **Dashboard integration** - Live metrics dashboards
- **Asana integration** - Auto-create tasks from recommendations

## Related Documentation

- **Implementation Guide**: `../../docs/SALES_FUNNEL_DIAGNOSTIC_IMPLEMENTATION.md`
- **Command Reference**: `../../commands/diagnose-sales-funnel.md`
- **Agent Definition**: `../../agents/sales-funnel-diagnostic.md`
- **PDF Generation**: `../../docs/PDF_GENERATION_GUIDE.md`

## Template Status

| Template | Status | Lines | Last Updated |
|----------|--------|-------|--------------|
| executive-summary.md | ✅ Complete | 300+ | 2025-10-28 |
| full-diagnostic-report.md | ✅ Complete | 400+ | 2025-10-28 |
| remediation-action-plan.md | ✅ Complete | 300+ | 2025-10-28 |
| benchmark-comparison.md | ✅ Complete | 200+ | 2025-10-28 |
| rep-performance-analysis.md | ✅ Complete | 300+ | 2025-10-28 |

**Total**: 5/5 templates implemented ✅ COMPLETE

---

**Version**: 1.0.0
**Last Updated**: 2025-10-28
**Maintained By**: RevPal Engineering
