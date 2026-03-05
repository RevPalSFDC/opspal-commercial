---
command: cms-audit-pages
description: Comprehensive audit of all CMS pages with SEO analysis, publishing status, and PDF report generation
usage: /cms-audit-pages [options]
---

# Audit CMS Pages

Generate a comprehensive audit of all HubSpot CMS pages (website pages and landing pages) including SEO scores, publishing status, content quality, template usage, and actionable recommendations. Outputs both console summary and detailed PDF report.

## Usage

```bash
# Full audit of all pages (recommended)
/cms-audit-pages

# Audit only landing pages
/cms-audit-pages --type landing-pages

# Audit only website pages
/cms-audit-pages --type site-pages

# Include archived pages
/cms-audit-pages --include-archived

# Custom output directory
/cms-audit-pages --output-dir ./custom-reports

# Skip PDF generation
/cms-audit-pages --no-pdf
```

## Options

- `--type` : Page type to audit (`site-pages`, `landing-pages`, or `both`) [default: both]
- `--include-archived` : Include archived pages in audit [default: false]
- `--generate-pdf` : Generate PDF report [default: true]
- `--no-pdf` : Skip PDF generation (console output only)
- `--output-dir` : Output directory for reports [default: ./reports/cms-audit]
- `--seo-threshold` : Minimum SEO score for "healthy" classification [default: 60]
- `--content-age-months` : Threshold for "outdated" content [default: 12]

## Audit Process

### Step 1: Discovery
```
📦 Discovering CMS pages...

   Fetching landing pages... 62 found
   Fetching site pages... 85 found

✅ Total pages discovered: 147
```

### Step 2: Publishing Status Analysis
```
📊 Analyzing publishing status...

   Published: 120 (81.6%)
   Drafts: 20 (13.6%)
   Scheduled: 5 (3.4%)
   Archived: 2 (1.4%)

✅ Publishing status analyzed
```

### Step 3: SEO Analysis
```
🔍 Running SEO analysis (batch processing)...

   Batch 1/15: Analyzing 10 pages... ✓
   Batch 2/15: Analyzing 10 pages... ✓
   ...
   Batch 15/15: Analyzing 7 pages... ✓

✅ SEO analysis complete
```

### Step 4: Content Quality Analysis
```
📝 Analyzing content quality...

   Checking content age... ✓
   Analyzing word counts... ✓
   Checking heading structure... ✓
   Validating meta descriptions... ✓

✅ Content quality analyzed
```

### Step 5: Template Usage Analysis
```
🎨 Analyzing template usage...

   Templates in use: 12
   Most used: templates/product.html (45 pages)
   Orphaned templates: 3

✅ Template usage analyzed
```

### Step 6: Report Generation
```
📄 Generating reports...

   Creating markdown reports... ✓
   Generating PDF (6 pages)... ✓

✅ Reports generated
   Location: ./reports/cms-audit/cms-audit-2025-11-04.pdf
```

## Console Output Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 HubSpot CMS Pages Audit Report
   Generated: 2025-11-04 14:30:00 UTC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Overview
   Total Pages: 147
   - Website Pages: 85 (57.8%)
   - Landing Pages: 62 (42.2%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 Publishing Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Published: 120 (81.6%) ✅
   Drafts: 20 (13.6%)
   Scheduled: 5 (3.4%)
   Archived: 2 (1.4%)

   📅 Upcoming Scheduled Publishes:
      - Product Launch v2 (Dec 1, 2025 3:00 PM)
      - Q1 Announcement (Jan 15, 2026 9:00 AM)
      ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 SEO Health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Average SEO Score: 68.3/100

   Score Distribution:
      90-100 (Excellent): 15 pages (10.2%)
      70-89 (Good): 74 pages (50.3%) ✅
      60-69 (Fair): 23 pages (15.6%)
      Below 60 (Poor): 35 pages (23.8%) ⚠️

   Common Issues:
      Missing meta descriptions: 12 pages (8.2%)
      Low word count (<500): 18 pages (12.2%)
      Missing H2 headings: 25 pages (17.0%)
      High keyword density (>2.5%): 8 pages (5.4%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Content Issues
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Outdated (>12 months): 23 pages (15.6%)
      Oldest: "2019 Product Launch" (1,825 days old)

   Low Word Count (<500): 18 pages (12.2%)
      Lowest: "Quick Update" (127 words)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 Template Usage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Templates in Use: 12

   Top Templates:
      1. templates/product.html - 45 pages (30.6%)
      2. templates/content.html - 32 pages (21.8%)
      3. templates/landing.html - 28 pages (19.0%)

   Orphaned Templates (no pages):
      - templates/old-design.html
      - templates/deprecated-2023.html
      - templates/test-template.html

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Priority Recommendations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 High Priority (Fix within 1 week):
   1. Optimize 35 pages with SEO score <60
      Effort: 2-3 hours per page
      Impact: High - improves search visibility

   2. Update 5 oldest pages (>3 years old)
      Effort: 4-6 hours total
      Impact: High - prevents outdated info

🟡 Medium Priority (Fix within 1 month):
   3. Add meta descriptions to 12 pages
      Effort: 1-2 hours total
      Impact: Medium - improves click-through

   4. Increase content on 18 pages (target 800+ words)
      Effort: 3-4 hours total
      Impact: Medium - better SEO & engagement

🟢 Low Priority (Ongoing maintenance):
   5. Review 18 remaining outdated pages
   6. Consolidate or remove orphaned templates
   7. Standardize heading structure across pages

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 Full Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   PDF Report: ./reports/cms-audit/cms-audit-2025-11-04.pdf
   Markdown Reports: ./reports/cms-audit/markdown/

   📊 Report includes:
      - Executive summary
      - Publishing status details
      - SEO analysis with specific page recommendations
      - Content quality metrics
      - Template usage breakdown
      - Prioritized action plan

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## PDF Report Structure

The generated PDF report includes:

### 1. Executive Summary (1 page)
- Total page count and breakdown
- Publishing status overview
- Average SEO score
- Top 5 priority recommendations
- Audit date and parameters

### 2. Publishing Analysis (2-3 pages)
- Published vs draft breakdown (pie chart)
- Scheduled publish calendar
- Unpublished draft pages list (table)
- Pages by state (table)

### 3. SEO Health Report (3-4 pages)
- SEO score distribution (histogram)
- Pages below threshold (detailed table with scores and issues)
- Common SEO issues (bar chart)
- Quick win opportunities (list)
- Page-by-page SEO recommendations

### 4. Content Quality Analysis (2-3 pages)
- Content age distribution (bar chart)
- Outdated content list (table with last modified dates)
- Low word count pages (table with word counts)
- Missing meta descriptions (list)
- Heading structure issues (list)

### 5. Template Usage Report (1-2 pages)
- Template distribution (pie chart)
- Template usage table (template, page count, percentage)
- Orphaned templates (list)
- Template health scores

### 6. Action Plan (1-2 pages)
- Prioritized recommendations
- Estimated effort per task (hours)
- Expected impact (High/Medium/Low)
- Quick wins (low effort, high impact)
- Long-term improvements

## Examples

### Example 1: Full Audit
```bash
/cms-audit-pages
```
This generates a complete audit of all pages with PDF report.

### Example 2: Landing Pages Only
```bash
/cms-audit-pages --type landing-pages
```
Audits only landing pages (faster for large portals).

### Example 3: Include Archived
```bash
/cms-audit-pages --include-archived
```
Includes archived pages in the audit (useful for cleanup planning).

### Example 4: Custom Output Location
```bash
/cms-audit-pages --output-dir ~/Desktop/hubspot-audit
```
Saves reports to custom directory.

### Example 5: Console-Only (No PDF)
```bash
/cms-audit-pages --no-pdf
```
Generates console summary only (fastest).

### Example 6: Custom Thresholds
```bash
/cms-audit-pages --seo-threshold 70 --content-age-months 6
```
Stricter criteria: SEO score ≥70, content >6 months is "outdated".

## Audit Checks

### Publishing Status
- ✅ Published pages with live URLs
- 📝 Draft pages (never published)
- 🕒 Scheduled pages with publish dates
- 📦 Archived pages (hidden from dashboard)

### SEO Analysis (per page)
- Overall SEO score (0-100)
- Target keyword presence in title
- Meta description length and quality
- Content length (word count)
- Heading structure (H1, H2, H3)
- Keyword density
- Image alt text
- Internal/external links

### Content Quality
- Last modified date
- Content age (days since last update)
- Word count
- Heading count and structure
- Missing meta descriptions
- Missing images or alt text

### Template Usage
- Number of pages per template
- Template distribution percentage
- Orphaned templates (no pages using)
- Deprecated templates still in use

## Performance

- **Page Discovery**: ~2-5 seconds for 100 pages
- **SEO Analysis**: ~10-20 seconds for 100 pages (batch processing)
- **Content Analysis**: ~5-10 seconds for 100 pages
- **PDF Generation**: ~30-60 seconds for 100 pages
- **Total Time**: ~2-5 minutes for 100 pages

**Optimization**:
- Batch API calls (10 pages at a time)
- Parallel analysis where possible
- 1-hour caching for repeated runs

## Behind the Scenes

This command orchestrates multiple operations:

```javascript
// Step 1: Discover all pages
const landingPages = await pagesManager.getAllPages({ pageType: 'landing-pages' });
const sitePages = await pagesManager.getAllPages({ pageType: 'site-pages' });

// Step 2: Analyze publishing status
const publishedCount = pages.filter(p => p.currentlyPublished).length;

// Step 3: Batch SEO analysis
const seoResults = await Task.invoke('hubspot-seo-optimizer', {
  action: 'batch_analyze',
  pages: pages.map(p => ({ id: p.id, content: p.widgets }))
});

// Step 4: Content quality analysis
const outdatedPages = pages.filter(p =>
  (Date.now() - new Date(p.updated)) > (contentAgeMonths * 30 * 24 * 60 * 60 * 1000)
);

// Step 5: Generate PDF report
const pdfHelper = require('../../../opspal-core/cross-platform-plugin/scripts/lib/pdf-generation-helper');
await pdfHelper.generateMultiReportPDF({
  orgAlias: portalId,
  outputDir,
  documents: [...markdownReports],
  coverTemplate: 'hubspot-audit'
});
```

## Best Practices

1. **Run Regularly**: Run monthly audits to track improvements
2. **Compare Over Time**: Save audit reports to track progress
3. **Act on Recommendations**: Prioritize high-impact, low-effort tasks first
4. **Focus on Quick Wins**: Fix missing meta descriptions quickly
5. **Schedule Content Updates**: Set reminders to update outdated pages

## Tips

- **Before Major Campaigns**: Run audit to ensure all pages are optimized
- **After Content Updates**: Re-run audit to measure improvements
- **Quarterly Reviews**: Use audits for quarterly content health reviews
- **Team Alignment**: Share PDF reports with content/SEO teams
- **Benchmark Progress**: Compare audit scores month-over-month

## Related Commands

- `/cms-create-page` - Create a new page
- `/cms-publish-page` - Publish a page
- `/hubspot-discovery` - Discover available templates and settings

## Technical Details

**Agents**:
- hubspot-cms-page-publisher (page discovery)
- hubspot-seo-optimizer (SEO analysis)
- PDF generation via `cross-platform-plugin/scripts/lib/pdf-generation-helper.js`

**API Endpoints**:
- GET /cms/v3/pages/landing-pages (list)
- GET /cms/v3/pages/site-pages (list)
- Batch operations for efficiency

**Rate Limiting**: 150 requests/10 seconds (automatic)
**Caching**: Results cached for 1 hour on repeated runs
**Output Format**: PDF (default) + Markdown + JSON

## Troubleshooting

**Problem**: Audit takes too long (>10 minutes)
**Solution**:
1. Audit by type separately (--type landing-pages, then --type site-pages)
2. Skip PDF generation temporarily (--no-pdf)
3. Check network/API latency

**Problem**: PDF generation fails
**Solution**:
1. Ensure chromium installed: `which chromium`
2. Check disk space for reports
3. Try without PDF first (--no-pdf)

**Problem**: Out of memory error
**Solution**:
1. Audit in batches by type
2. Increase Node.js heap: `NODE_OPTIONS="--max-old-space-size=4096" /cms-audit-pages`

**Problem**: SEO analysis slow
**Solution**:
SEO analysis uses batch processing (10 pages/batch). For 100+ pages, expect 1-2 minutes.

## Output Files

After running the audit, you'll find:

```
./reports/cms-audit/
├── cms-audit-2025-11-04.pdf          # Main PDF report
├── cms-audit-2025-11-04.json         # Raw JSON data
├── markdown/
│   ├── 01-executive-summary.md
│   ├── 02-publishing-analysis.md
│   ├── 03-seo-health.md
│   ├── 04-content-quality.md
│   ├── 05-template-usage.md
│   └── 06-action-plan.md
└── audit-log.txt                     # Audit execution log
```
