# Phase 1 Testing Guide - SEO Site Crawler System

## Overview

This guide provides comprehensive testing procedures for the Phase 1 site crawler system to ensure production readiness. Follow these tests systematically to identify bugs, performance issues, and edge cases.

## Prerequisites

### 1. Install Dependencies
```bash
cd .claude-plugins/hubspot-plugin
npm install xml2js cheerio node-fetch
```

### 2. Verify Installation
```bash
node -e "console.log('xml2js:', require('xml2js') ? 'OK' : 'FAIL')"
node -e "console.log('cheerio:', require('cheerio') ? 'OK' : 'FAIL')"
node -e "console.log('node-fetch:', require('node-fetch') ? 'OK' : 'FAIL')"
```

Expected output: All should show "OK"

### 3. Test Websites (Public, No Auth Required)

We'll test on these diverse sites:
- **Small Blog**: https://www.example.com (< 20 pages)
- **Medium Site**: Your production website (20-100 pages)
- **Large News Site**: https://www.bbc.com (100+ pages)
- **E-commerce**: https://www.etsy.com (100+ pages with images)
- **Documentation Site**: https://docs.github.com (structured content)

## Test Suite

### Test 1: Sitemap Crawler - Basic Functionality

**Objective**: Verify sitemap discovery and parsing works correctly

**Test 1.1 - Standard Sitemap**
```bash
node scripts/lib/seo-sitemap-crawler.js https://www.example.com/sitemap.xml
```

**Expected Results**:
- ✅ Successfully fetches sitemap
- ✅ Parses XML without errors
- ✅ Returns URL count
- ✅ Shows first 10 URLs
- ✅ Displays last modified date
- ✅ Creates cache file in `.cache/sitemaps/`

**Verification**:
```bash
# Check cache was created
ls -la .cache/sitemaps/

# Verify cache contains valid JSON
cat .cache/sitemaps/*.json | head -20
```

**Success Criteria**:
- No errors in output
- URL count > 0
- Cache file created

**Test 1.2 - Sitemap Discovery (Auto-detect)**
```bash
node scripts/lib/seo-sitemap-crawler.js discover https://www.example.com
```

**Expected Results**:
- ✅ Checks standard locations (/sitemap.xml, /sitemap_index.xml)
- ✅ Parses robots.txt for sitemap declarations
- ✅ Lists all discovered sitemaps
- ✅ No false positives

**Test 1.3 - Compressed Sitemap (.xml.gz)**
```bash
# Find a site with compressed sitemap
node scripts/lib/seo-sitemap-crawler.js https://www.wordpress.org/sitemap.xml.gz
```

**Expected Results**:
- ✅ Detects gzip compression
- ✅ Decompresses successfully
- ✅ Parses XML content

**Test 1.4 - Sitemap Index (Nested)**
```bash
# Test with a sitemap index
node scripts/lib/seo-sitemap-crawler.js https://www.etsy.com/sitemap.xml
```

**Expected Results**:
- ✅ Detects sitemap index type
- ✅ Recursively parses child sitemaps
- ✅ Aggregates all URLs
- ✅ Shows child sitemap count

**Test 1.5 - Cache Behavior**
```bash
# First run (cold cache)
time node scripts/lib/seo-sitemap-crawler.js https://www.example.com/sitemap.xml

# Second run (hot cache)
time node scripts/lib/seo-sitemap-crawler.js https://www.example.com/sitemap.xml
```

**Expected Results**:
- ✅ First run takes longer
- ✅ Second run is instant (< 1 second)
- ✅ Console shows "Using cached sitemap"

**Test 1.6 - Error Handling**
```bash
# Test with invalid URL
node scripts/lib/seo-sitemap-crawler.js https://invalid-domain-12345.com/sitemap.xml

# Test with 404 sitemap
node scripts/lib/seo-sitemap-crawler.js https://www.example.com/nonexistent-sitemap.xml

# Test with invalid XML
node scripts/lib/seo-sitemap-crawler.js /tmp/invalid.xml
```

**Expected Results**:
- ✅ Graceful error messages (not stack traces)
- ✅ Clear indication of what went wrong
- ✅ Exit code 1 (failure)

### Test 2: Batch Analyzer - Page Analysis

**Objective**: Verify parallel page crawling and analysis

**Test 2.1 - Basic Page Analysis**
```bash
node scripts/lib/seo-batch-analyzer.js \
  https://www.example.com \
  https://www.example.com/about \
  --checks technical,content
```

**Expected Results**:
- ✅ Processes 2 pages successfully
- ✅ Shows progress bar
- ✅ Returns technical metrics (load time, status code)
- ✅ Returns content analysis (title, headings, word count)
- ✅ Success rate = 100%

**Test 2.2 - All Analysis Dimensions**
```bash
node scripts/lib/seo-batch-analyzer.js \
  https://www.example.com \
  https://www.example.com/about \
  https://www.example.com/contact \
  --checks technical,content,schema,images,links
```

**Expected Results**:
- ✅ All 5 dimensions analyzed
- ✅ Schema extraction works (if schemas present)
- ✅ Image analysis includes alt text coverage
- ✅ Link analysis shows internal/external counts

**Test 2.3 - Batch Processing (10+ Pages)**
```bash
# Generate URL list from sitemap
node -e "
const SitemapCrawler = require('./scripts/lib/seo-sitemap-crawler');
(async () => {
  const crawler = new SitemapCrawler();
  const sitemap = await crawler.parseSitemap('https://www.example.com/sitemap.xml');
  const urls = sitemap.urls.slice(0, 20).map(u => u.loc).join(' ');
  console.log(urls);
})();
" > /tmp/urls.txt

# Analyze 20 pages
node scripts/lib/seo-batch-analyzer.js $(cat /tmp/urls.txt) --batch-size 10
```

**Expected Results**:
- ✅ Processes in batches of 10
- ✅ Shows progress for each batch
- ✅ Rate limiting respected (1 req/sec)
- ✅ Completion time reasonable (~20-30 seconds)

**Test 2.4 - Rate Limiting**
```bash
# Test rate limiting (should take ~10 seconds for 10 pages)
time node scripts/lib/seo-batch-analyzer.js \
  $(node scripts/lib/seo-sitemap-crawler.js https://www.example.com/sitemap.xml | grep '1\.' | awk '{print $2}' | head -10 | tr '\n' ' ') \
  --rate-limit 1000
```

**Expected Results**:
- ✅ Takes approximately 10 seconds (10 pages × 1 sec rate limit)
- ✅ No rate limit errors from server
- ✅ Consistent timing between requests

**Test 2.5 - Cache Behavior**
```bash
# First run (no cache)
time node scripts/lib/seo-batch-analyzer.js https://www.example.com --checks technical

# Second run (cached)
time node scripts/lib/seo-batch-analyzer.js https://www.example.com --checks technical
```

**Expected Results**:
- ✅ Second run is instant
- ✅ Results identical to first run

**Test 2.6 - Error Resilience**
```bash
# Mix valid and invalid URLs
node scripts/lib/seo-batch-analyzer.js \
  https://www.example.com \
  https://invalid-url-12345.com \
  https://www.example.com/404-page \
  https://www.example.com/about
```

**Expected Results**:
- ✅ Continues processing after failures
- ✅ Reports failures separately
- ✅ Success rate < 100% but > 0%
- ✅ Returns results for successful pages

**Test 2.7 - Different Page Types**
```bash
# Test diverse content types
node scripts/lib/seo-batch-analyzer.js \
  https://www.example.com/blog/post-1 \
  https://www.example.com/products/item-1 \
  https://www.example.com/landing-page
```

**Expected Results**:
- ✅ Blog posts have higher word counts
- ✅ Product pages have more images
- ✅ Landing pages may have more schema markup

### Test 3: Broken Link Detector

**Objective**: Verify link validation and broken link detection

**Test 3.1 - Internal Link Validation**
```bash
# First, crawl a small site
node scripts/lib/seo-batch-analyzer.js \
  https://www.example.com \
  https://www.example.com/about \
  https://www.example.com/contact > /tmp/crawl-results.json

# Then check for broken links
node scripts/lib/seo-broken-link-detector.js \
  https://www.example.com \
  /tmp/crawl-results.json \
  --output-csv /tmp/broken-links.csv
```

**Expected Results**:
- ✅ Scans all internal links
- ✅ Identifies broken links (404, 5xx)
- ✅ Shows which pages link to broken URLs
- ✅ CSV report generated

**Test 3.2 - Redirect Chain Detection**
```bash
# Test on a site with redirects
node scripts/lib/seo-broken-link-detector.js \
  https://www.example.com \
  /tmp/crawl-results.json
```

**Expected Results**:
- ✅ Detects redirect chains (301 → 301 → 200)
- ✅ Shows number of hops
- ✅ Identifies final destination
- ✅ Flags chains > 3 hops as issues

**Test 3.3 - Orphan Page Detection**
```bash
node scripts/lib/seo-broken-link-detector.js \
  https://www.example.com \
  /tmp/crawl-results.json \
  --output-md /tmp/link-report.md
```

**Expected Results**:
- ✅ Identifies pages with no incoming links
- ✅ Skips homepage (can't be orphan)
- ✅ Lists orphan pages with titles
- ✅ Markdown report generated

**Test 3.4 - External Link Validation (Optional)**
```bash
# WARNING: This is slow
node scripts/lib/seo-broken-link-detector.js \
  https://www.example.com \
  /tmp/crawl-results.json \
  --check-external
```

**Expected Results**:
- ✅ Validates external links
- ✅ Respects rate limiting
- ✅ Identifies broken external links
- ✅ Takes significantly longer (5-10 minutes)

**Test 3.5 - Performance on Large Link Set**
```bash
# Test with 100+ pages
time node scripts/lib/seo-broken-link-detector.js \
  https://www.bbc.com \
  /tmp/large-crawl-results.json
```

**Expected Results**:
- ✅ Completes in reasonable time (< 5 minutes)
- ✅ Shows progress updates
- ✅ Handles large link graphs efficiently

### Test 4: Technical Health Scorer

**Objective**: Verify health scoring algorithm and issue prioritization

**Test 4.1 - Basic Health Score Calculation**
```bash
node scripts/lib/seo-technical-health-scorer.js \
  /tmp/crawl-results.json
```

**Expected Results**:
- ✅ Calculates overall score (0-100)
- ✅ Shows breakdown by dimension
- ✅ Lists top issues
- ✅ Provides recommendations
- ✅ Generates text report

**Test 4.2 - With Link Analysis**
```bash
node scripts/lib/seo-technical-health-scorer.js \
  /tmp/crawl-results.json \
  /tmp/link-analysis.json
```

**Expected Results**:
- ✅ Incorporates link health in score
- ✅ Broken links penalize score
- ✅ Orphan pages penalize score
- ✅ More comprehensive issue list

**Test 4.3 - Score Consistency**
```bash
# Run twice on same data
node scripts/lib/seo-technical-health-scorer.js /tmp/crawl-results.json > /tmp/score1.txt
node scripts/lib/seo-technical-health-scorer.js /tmp/crawl-results.json > /tmp/score2.txt

# Compare
diff /tmp/score1.txt /tmp/score2.txt
```

**Expected Results**:
- ✅ Scores are identical
- ✅ No randomness in scoring

**Test 4.4 - Different Site Profiles**
```bash
# Test on high-quality site
node scripts/lib/seo-technical-health-scorer.js /tmp/good-site-results.json

# Test on low-quality site
node scripts/lib/seo-technical-health-scorer.js /tmp/poor-site-results.json
```

**Expected Results**:
- ✅ High-quality site scores 70-90
- ✅ Low-quality site scores 30-60
- ✅ Score reflects actual site quality
- ✅ Issue recommendations are relevant

**Test 4.5 - Custom Weights**
```javascript
// Create custom test
const TechnicalHealthScorer = require('./scripts/lib/seo-technical-health-scorer');
const scorer = new TechnicalHealthScorer({
  weights: {
    technical: 0.50,  // Emphasize technical
    content: 0.20,
    schema: 0.10,
    images: 0.10,
    links: 0.10
  }
});

// Should recalculate with new weights
```

**Expected Results**:
- ✅ Accepts custom weights
- ✅ Score changes based on weights
- ✅ Validates weights sum to 1.0

### Test 5: Integration Tests

**Objective**: Test full end-to-end workflows

**Test 5.1 - Complete Site Audit Workflow**
```bash
#!/bin/bash
set -e

URL="https://www.example.com"
OUTPUT_DIR="/tmp/seo-audit-$(date +%s)"
mkdir -p "$OUTPUT_DIR"

echo "1. Discovering sitemap..."
node scripts/lib/seo-sitemap-crawler.js "$URL/sitemap.xml" > "$OUTPUT_DIR/sitemap.json"

echo "2. Extracting URLs..."
URLS=$(cat "$OUTPUT_DIR/sitemap.json" | grep -o 'https://[^"]*' | head -20 | tr '\n' ' ')

echo "3. Crawling pages..."
node scripts/lib/seo-batch-analyzer.js $URLS > "$OUTPUT_DIR/crawl-results.json"

echo "4. Checking broken links..."
node scripts/lib/seo-broken-link-detector.js \
  "$URL" \
  "$OUTPUT_DIR/crawl-results.json" \
  --output-csv "$OUTPUT_DIR/broken-links.csv" \
  --output-md "$OUTPUT_DIR/broken-links.md"

echo "5. Calculating health score..."
node scripts/lib/seo-technical-health-scorer.js \
  "$OUTPUT_DIR/crawl-results.json" \
  "$OUTPUT_DIR/link-analysis.json" > "$OUTPUT_DIR/health-score.txt"

echo "✅ Complete site audit finished!"
echo "Results in: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"
```

**Expected Results**:
- ✅ All steps complete without errors
- ✅ All output files generated
- ✅ Total time < 5 minutes for 20 pages
- ✅ Reports are accurate and useful

**Test 5.2 - Agent Invocation (via Claude Code)**

Use Claude Code to test agent invocation:

```
Test the hubspot-seo-site-crawler agent with:
- URL: https://www.example.com
- Max pages: 20
- All checks enabled
- Generate health score
```

**Expected Results**:
- ✅ Agent responds to invocation
- ✅ Executes full workflow
- ✅ Returns structured results
- ✅ Handles errors gracefully

**Test 5.3 - Slash Command Integration**

Test in Claude Code:

```
/seo-audit --crawl-full-site https://www.example.com --max-pages 20
```

**Expected Results**:
- ✅ Command recognized
- ✅ Routes to site crawler agent
- ✅ Generates comprehensive report
- ✅ Creates PDF if requested

### Test 6: Edge Cases & Error Handling

**Test 6.1 - Empty Sitemap**
```bash
echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>' > /tmp/empty-sitemap.xml
node scripts/lib/seo-sitemap-crawler.js /tmp/empty-sitemap.xml
```

**Expected Results**:
- ✅ Handles gracefully
- ✅ Reports 0 URLs
- ✅ No crash

**Test 6.2 - Invalid XML**
```bash
echo 'not valid xml' > /tmp/invalid.xml
node scripts/lib/seo-sitemap-crawler.js /tmp/invalid.xml
```

**Expected Results**:
- ✅ Clear error message: "Invalid XML"
- ✅ No stack trace to user
- ✅ Exit code 1

**Test 6.3 - Network Timeout**
```bash
# Simulate slow server (if you have control)
node scripts/lib/seo-batch-analyzer.js https://httpstat.us/200?sleep=35000
```

**Expected Results**:
- ✅ Times out after 30 seconds
- ✅ Reports timeout error
- ✅ Continues to next URL

**Test 6.4 - Very Large Pages**
```bash
# Test with page > 10MB
node scripts/lib/seo-batch-analyzer.js https://example.com/large-page.html
```

**Expected Results**:
- ✅ Handles large pages
- ✅ Doesn't crash with OOM
- ✅ May be slow but completes

**Test 6.5 - Special Characters in URLs**
```bash
node scripts/lib/seo-batch-analyzer.js \
  "https://example.com/page?param=value&other=123" \
  "https://example.com/página-español"
```

**Expected Results**:
- ✅ Properly encodes URLs
- ✅ Handles query parameters
- ✅ Handles international characters

**Test 6.6 - JavaScript-Heavy Sites**
```bash
# Single-page application
node scripts/lib/seo-batch-analyzer.js https://react-app-example.com
```

**Expected Results**:
- ✅ Extracts server-rendered content
- ❌ May miss client-rendered content (known limitation)
- ✅ Logs warning about JS-rendered content

**Test 6.7 - Rate Limiting from Server**
```bash
# Rapid requests to same domain
for i in {1..20}; do
  node scripts/lib/seo-batch-analyzer.js https://example.com/page-$i &
done
wait
```

**Expected Results**:
- ✅ Rate limiting prevents 429 errors
- ✅ All requests complete eventually
- ✅ No errors from server

## Performance Benchmarks

Run these benchmarks to establish baseline performance:

### Benchmark 1: Sitemap Parsing Speed
```bash
echo "Benchmark: Sitemap Parsing (1000 URLs)"
time for i in {1..10}; do
  node scripts/lib/seo-sitemap-crawler.js https://large-site.com/sitemap.xml --no-cache > /dev/null
done
```

**Target**: < 2 seconds per parse (cold cache)

### Benchmark 2: Page Analysis Throughput
```bash
echo "Benchmark: Page Analysis (100 pages)"
time node scripts/lib/seo-batch-analyzer.js \
  $(cat /tmp/100-urls.txt) \
  --batch-size 10
```

**Target**: < 2 minutes for 100 pages (internal checks only)

### Benchmark 3: Memory Usage
```bash
/usr/bin/time -v node scripts/lib/seo-batch-analyzer.js $(cat /tmp/100-urls.txt) 2>&1 | grep "Maximum resident"
```

**Target**: < 500 MB for 100 pages

## Success Criteria

Phase 1 is ready for production if:

- ✅ All basic functionality tests pass
- ✅ Edge case handling is robust
- ✅ Performance meets benchmarks
- ✅ Error messages are clear and actionable
- ✅ No memory leaks in extended runs
- ✅ Cache behavior is correct
- ✅ Rate limiting prevents server overload
- ✅ Reports are accurate and useful
- ✅ Integration with agents works
- ✅ Slash commands execute correctly

## Known Limitations (Document These)

1. **JavaScript-Rendered Content**: Cannot analyze content that requires JavaScript execution
2. **Authentication**: Cannot crawl password-protected pages
3. **Rate Limits**: Respects 1 req/sec by default (may be too slow for some use cases)
4. **External Links**: External link checking is slow (disabled by default)
5. **Sitemap Size**: Performance degrades with sitemaps > 50,000 URLs

## Next Steps After Testing

1. **Document Issues Found**: Create GitHub issues for bugs
2. **Add Unit Tests**: Create test/*.test.js files
3. **Performance Optimization**: Profile and optimize slow code paths
4. **Error Handling**: Improve error messages based on test findings
5. **User Documentation**: Update agent/command docs with learnings

---

**Testing Checklist**:
- [ ] All Test 1 (Sitemap Crawler) cases pass
- [ ] All Test 2 (Batch Analyzer) cases pass
- [ ] All Test 3 (Broken Link Detector) cases pass
- [ ] All Test 4 (Health Scorer) cases pass
- [ ] All Test 5 (Integration) cases pass
- [ ] All Test 6 (Edge Cases) cases pass
- [ ] Performance benchmarks meet targets
- [ ] Known limitations documented
- [ ] Bugs logged and prioritized

**Ready for Production**: ☐ YES / ☐ NO (with conditions)
