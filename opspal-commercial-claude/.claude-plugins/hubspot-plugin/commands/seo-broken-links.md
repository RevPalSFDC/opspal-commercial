---
description: Quick broken link scan for websites - detects 404s, redirect chains, orphan pages, and external link issues
tags: [seo, broken-links, audit, technical-seo]
version: 1.0.0
---

# SEO Broken Links Command

## Overview

The `/seo-broken-links` command performs a focused scan of a website to identify broken links, redirect chains, orphan pages, and optionally external link health. This is a fast, targeted check that complements the full `/seo-audit` command.

## Syntax

```bash
/seo-broken-links <url> [options]
```

## Parameters

- **url** (required): Base URL of website to scan (e.g., https://example.com)
- **options** (optional):
  - `--check-external`: Check external links (slower, default: false)
  - `--max-pages <n>`: Limit scan to N pages (default: 100)
  - `--export-csv <path>`: Export CSV report
  - `--export-md <path>`: Export Markdown report
  - `--no-orphans`: Skip orphan page detection

## Examples

### Quick Broken Link Scan
```bash
/seo-broken-links https://example.com
```
Scans internal links only (fast - typically < 2 minutes for 100 pages).

### Include External Links
```bash
/seo-broken-links https://example.com --check-external
```
Checks both internal and external links (slower - ~5-10 minutes for 100 pages).

### Export Reports
```bash
/seo-broken-links https://example.com --export-csv ./broken-links.csv --export-md ./report.md
```
Generates both CSV and Markdown reports for sharing with team.

### Limited Scan
```bash
/seo-broken-links https://example.com --max-pages 50
```
Scans only first 50 pages for faster results on large sites.

## How It Works

1. **Sitemap Discovery**: Automatically finds and parses sitemap.xml
2. **Page Crawling**: Crawls specified number of pages (default: 100)
3. **Link Extraction**: Extracts all links from crawled pages
4. **Link Validation**:
   - Internal links: HEAD requests to check status
   - Redirect chains: Follows up to 5 hops, detects loops
   - Orphan pages: Identifies pages with no incoming internal links
   - External links (optional): Validates external destinations
5. **Categorization**:
   - **Broken**: 404, 410, 5xx errors
   - **Redirect Chains**: Multiple redirects (>1 hop)
   - **Redirect Loops**: Circular redirects
   - **Orphans**: Pages not linked from any other page
6. **Reporting**: Generates summary with top issues and fix recommendations

## Output

The command displays:

1. **Summary Statistics**:
   - Total links checked
   - Broken links count
   - Redirect chains count
   - Orphan pages count

2. **Top Issues** (by impact):
   - Broken links with linking pages
   - Redirect chains with hop count
   - Redirect loops (critical)
   - Orphan pages

3. **Fix Recommendations**:
   - Specific actions for each issue type
   - Priority level for each issue

4. **Export Files** (if requested):
   - CSV: Detailed list of all issues for spreadsheet analysis
   - Markdown: Human-readable report for documentation

## Example Output

```
🔍 Scanning https://example.com for broken links...

📍 Discovering sitemap...
✅ Found sitemap with 142 URLs

📊 Crawling pages (max: 100)...
   Progress: 100/100 (100.0%)
✅ Crawled 100 pages successfully

🔗 Extracting links...
✅ Found 1,523 internal links

📍 Checking internal links...
   Progress: 1523/1523 (100.0%)

🔍 Detecting orphan pages...
✅ Found 5 orphan pages

✅ Scan complete!
   Total links: 1,523
   Broken links: 17
   Redirect chains: 42
   Orphan pages: 5

=== Top Issues ===

Broken Links (Top 5):
1. /old-blog-post (404) - 5 linking page(s)
2. /removed-product (404) - 3 linking page(s)
3. /archive/2019/news (410) - 2 linking page(s)
4. /api/endpoint (500) - 1 linking page(s)
5. /missing-image.jpg (404) - 8 linking page(s)

Redirect Chains (Top 5):
1. /product → /products → /products/all (2 hops)
2. /blog → /news → /newsroom (2 hops)
3. /contact → /contact-us → /get-in-touch (2 hops)
4. /home → / → /index.html (2 hops)
5. /about → /about-us → /company → /company/about (3 hops) ⚠️ LONG CHAIN

Orphan Pages:
1. /hidden-page-1
2. /old-landing-page
3. /test-page
4. /draft-content
5. /archive/old-post

💡 Recommendations:
1. Fix 17 broken links (HIGH PRIORITY)
   - Remove links or redirect to working pages
   - Check server for 5xx errors
2. Update 42 redirect chains (MEDIUM PRIORITY)
   - Update links to point directly to final destination
   - Reduces page load time and improves SEO
3. Review 5 orphan pages (LOW PRIORITY)
   - Add internal links if pages are valuable
   - Remove if pages are no longer needed

📄 Reports:
   - ./broken-links.csv
   - ./broken-links-report.md
```

## Task Instructions for Claude

When the user runs `/seo-broken-links <url> [options]`:

1. **Parse Parameters**:
   ```javascript
   const url = args[0];
   if (!url) {
     throw new Error('URL is required: /seo-broken-links https://example.com');
   }

   const options = {
     checkExternal: args.includes('--check-external'),
     maxPages: parseInt(getOption(args, '--max-pages', '100')),
     exportCsv: getOption(args, '--export-csv', null),
     exportMd: getOption(args, '--export-md', null),
     detectOrphans: !args.includes('--no-orphans')
   };
   ```

2. **Validate URL**:
   ```javascript
   try {
     new URL(url);
   } catch (error) {
     throw new Error(`Invalid URL: ${url}`);
   }

   // Quick accessibility check
   const testFetch = await fetch(url, { method: 'HEAD' });
   if (!testFetch.ok) {
     throw new Error(`Cannot access ${url} (HTTP ${testFetch.status})`);
   }
   ```

3. **Invoke Site Crawler Agent**:
   ```javascript
   const results = await Task.invoke('hubspot-seo-site-crawler', JSON.stringify({
     action: 'broken_links_scan',
     baseUrl: url,
     maxPages: options.maxPages,
     checkExternal: options.checkExternal,
     detectOrphans: options.detectOrphans
   }));
   ```

4. **Generate Reports**:
   ```javascript
   const BrokenLinkDetector = require('..claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/seo-broken-link-detector');
   const detector = new BrokenLinkDetector();

   // CSV export
   if (options.exportCsv) {
     detector.generateCSVReport(results, options.exportCsv);
     console.log(`📄 CSV report saved: ${options.exportCsv}`);
   }

   // Markdown export
   if (options.exportMd) {
     const markdown = detector.generateMarkdownReport(results);
     fs.writeFileSync(options.exportMd, markdown);
     console.log(`📄 Markdown report saved: ${options.exportMd}`);
   }
   ```

5. **Display Summary**:
   - Show total links checked
   - List broken links (top 5)
   - List redirect chains (top 5)
   - List orphan pages (top 5)
   - Provide fix recommendations

6. **Offer Next Steps**:
   ```
   💡 Next Steps:
   Would you like me to:
   1. Generate an Asana task list for fixing these issues?
   2. Export a full CSV report with all issues?
   3. Re-scan after you've made fixes to verify resolution?
   ```

## Prerequisites

- **No Authentication**: Works with any public website
- **Network Access**: Must be able to access target website
- **Dependencies**: Requires Node.js packages (xml2js, node-fetch, cheerio)

## Performance

| Site Size | Scan Type | Estimated Time |
|-----------|-----------|----------------|
| 50 pages | Internal only | 30-60 seconds |
| 100 pages | Internal only | 1-2 minutes |
| 50 pages | With external | 2-5 minutes |
| 100 pages | With external | 5-10 minutes |

**Note**: Scan time varies based on:
- Number of links per page
- Server response times
- External link count (if checking)
- Network latency

## Safety Features

- **Rate Limiting**: 1 request/second to avoid overwhelming servers
- **Timeout**: 10-second timeout per link check
- **Error Resilience**: Continues scan if individual links fail
- **Caching**: Results cached for 7 days (avoids redundant scans)
- **Read-Only**: Never modifies website content

## Comparison with /seo-audit

| Feature | /seo-broken-links | /seo-audit --crawl-full-site |
|---------|-------------------|------------------------------|
| **Focus** | Link health only | Comprehensive SEO analysis |
| **Speed** | Fast (1-2 min) | Slower (5-10 min) |
| **Checks** | Broken links, redirects, orphans | Technical, content, schema, images, links |
| **Use Case** | Quick link validation | Full site audit |
| **Output** | CSV, Markdown | CSV, Markdown, PDF, Health Score |

**When to use each**:
- Use `/seo-broken-links` for quick link checks after content updates
- Use `/seo-audit --crawl-full-site` for comprehensive site health analysis

## Troubleshooting

### "Cannot access URL"
- **Cause**: URL is not publicly accessible or server is down
- **Solution**: Verify URL is correct and website is online

### "Sitemap not found"
- **Cause**: Website doesn't have sitemap.xml
- **Solution**: Command will still work by crawling from homepage, but may miss pages

### "Scan taking too long"
- **Cause**: Large site with many external links
- **Solution**: Use `--no-check-external` or `--max-pages 50` to reduce scope

### "Too many broken links"
- **Cause**: Site has significant link rot
- **Solution**: Export CSV for systematic fixing, prioritize by linking page count

## Related Commands

- `/seo-audit` - Comprehensive SEO audit (includes broken links)
- `/seo-audit --crawl-full-site` - Full site crawl with health scoring
- `/optimize-content` - Fix content issues on specific pages

## Scripts Used

- `seo-sitemap-crawler.js` - Sitemap parsing
- `seo-batch-analyzer.js` - Page crawling
- `seo-broken-link-detector.js` - Link validation and reporting

## Success Metrics

Expected outcomes:
- **Detection Accuracy**: 95%+ (validated against manual link checking)
- **Scan Speed**: < 2 minutes for 100 pages (internal links only)
- **False Positives**: < 5% (temporary server errors may be flagged)
- **Usefulness**: 90%+ of identified issues are actionable

---

**Version**: 1.0.0 (Phase 1)
**Last Updated**: 2025-11-14
**Maintained By**: SEO Site Crawler Team
