---
name: seo-audit
description: Comprehensive SEO audit with optional competitor analysis, content optimization, GEO validation, and AI search optimization
stage: production
version: 4.0.0
---

# SEO Audit Command

Performs comprehensive SEO audits combining website crawling, technical analysis, and optional competitor intelligence.

## Usage

### Basic Site Audit (Phase 1)
```bash
/seo-audit --url https://example.com
/seo-audit --url https://example.com --max-pages 50
/seo-audit --url https://example.com --check-broken-links
```

### Competitor Analysis (Phase 2)
```bash
/seo-audit --url https://example.com --competitors https://comp1.com,https://comp2.com
/seo-audit --url https://example.com --competitors https://comp1.com,https://comp2.com --max-pages 20
```

### Keyword-Focused Audit (Phase 2)
```bash
/seo-audit --url https://example.com --keywords "marketing automation,crm software,sales tools"
/seo-audit --url https://example.com --keywords "seo tools" --competitors https://comp1.com
```

### Full Competitive Intelligence (Phase 2)
```bash
/seo-audit --url https://example.com \
  --competitors https://comp1.com,https://comp2.com \
  --keywords "primary keyword,secondary keyword" \
  --max-pages 50 \
  --check-broken-links \
  --output ./reports/seo-audit
```

## Parameters

### Required
- `--url <url>` - Your website URL to audit

### Optional - Basic Audit (Phase 1)
- `--max-pages <number>` - Maximum pages to analyze per site (default: 100)
- `--check-broken-links` - Include broken link detection (adds 2-5 minutes)
- `--output <path>` - Output directory for reports (default: ./seo-audit-results)

### Optional - Competitive Analysis (Phase 2)
- `--competitors <urls>` - Comma-separated competitor URLs to compare against
- `--keywords <keywords>` - Comma-separated keywords for SERP analysis and ranking comparison
- `--discover-competitors` - Automatically discover competitors from SERP results for provided keywords

### Optional - Content Optimization (Phase 3)
- `--analyze-content` - Include comprehensive content quality analysis (6 dimensions)
- `--aeo-optimization` - Analyze featured snippet and AEO opportunities
- `--content-recommendations` - Generate prioritized content improvement plan with briefs
- `--readability` - Include detailed readability analysis (multiple metrics)
- `--internal-linking` - Analyze internal linking structure and suggest improvements

### Optional - GEO Validation (Phase 3.1)
- `--geo-validation` - Validate Generative Engine Optimization readiness (AI search visibility)
- `--check-robots` - Include robots.txt analysis for AI crawler access (use with --geo-validation)

### Optional - AI Search Optimization (Phase 4.0 - NEW)
- `--generate-schema` - Auto-generate schema markup (Organization, WebSite, Article, etc.)
- `--optimize-content` - Auto-generate AI-optimized content (TL;DR, answer blocks, FAQ)
- `--deploy-preview` - Preview deployment changes without making live changes
- `--full-ai-optimization` - Complete Phase 4 workflow (schema + content + deployment preview)

### Optional - Report Configuration
- `--format <json|markdown|both>` - Report format (default: both)
- `--include-recommendations` - Include actionable recommendations (default: true)
- `--priority <all|high|medium>` - Filter recommendations by priority (default: all)

## Workflow

The command orchestrates a multi-step workflow:

### Phase 1: Your Site Analysis
1. **Sitemap Discovery** - Automatically find and parse sitemaps
2. **Page Crawling** - Analyze up to --max-pages pages
3. **Technical Analysis** - 5-dimensional health scoring:
   - Technical (HTTPS, load times, status codes)
   - Content (titles, descriptions, headings, word count)
   - Schema (structured data markup)
   - Images (alt text, optimization, lazy loading)
   - Links (internal/external link structure)
4. **Broken Links** - Optional link validation
5. **Health Report** - Overall score with prioritized issues

### Phase 2: Competitive Intelligence (if --competitors or --keywords provided)
6. **SERP Analysis** - Analyze search rankings for target keywords
7. **Competitor Discovery** - Identify top-ranking competitors
8. **Competitor Crawling** - Analyze competitor sites (same depth as yours)
9. **Content Gap Analysis** - Identify topics and keywords competitors cover but you don't
10. **SERP Feature Analysis** - Find featured snippet and PAA opportunities
11. **Competitive Benchmarking** - Compare your performance across 5 dimensions
12. **Strategic Recommendations** - Prioritized action plan with impact/effort scores

### Phase 3: Content Optimization (if Phase 3 flags provided)
13. **Content Quality Scoring** - 6-dimensional analysis (Readability, Depth, SEO, Engagement, E-E-A-T, Technical)
14. **Readability Analysis** - Multiple metrics (Flesch-Kincaid, Gunning Fog, SMOG, Coleman-Liau, ARI)
15. **AEO Optimization** - Featured snippet opportunities, People Also Ask questions, schema recommendations
16. **Internal Linking Analysis** - Orphan page detection, hub identification, topic cluster mapping
17. **Content Recommendations** - Prioritized content improvement plan with detailed briefs
18. **Integrated Reports** - Comprehensive content optimization strategy with Phase 1+2+3 insights

## Output Files

The command generates comprehensive reports in the specified output directory:

### Phase 1 Reports
```
<output-dir>/
├── executive-summary.md                # High-level overview and key findings
├── technical-health-report.json        # Detailed technical analysis
├── technical-health-report.txt         # Human-readable health report
├── sitemap-analysis.json               # Sitemap structure and URLs
├── page-analysis.json                  # Individual page analysis data
├── broken-links.csv                    # Broken link report (if --check-broken-links)
└── recommendations.json                # Prioritized action items
```

### Phase 2 Reports (if competitors analyzed)
```
<output-dir>/
├── competitive-analysis/
│   ├── competitor-profiles.json        # Detailed competitor analysis
│   ├── content-gaps.json               # Topic and keyword gaps
│   ├── serp-analysis.json              # Ranking and feature analysis
│   ├── competitive-comparison.md       # Side-by-side benchmarking
│   └── opportunity-matrix.csv          # Impact vs effort matrix
└── strategic-recommendations.md        # Competitive action plan
```

### Phase 3 Reports (if content optimization requested)
```
<output-dir>/
├── content-optimization/
│   ├── executive-summary.md            # Content optimization overview
│   ├── content-scores.json             # Quality scores for all pages
│   ├── aeo-opportunities.json          # Featured snippet opportunities
│   ├── readability-report.json         # Detailed readability analysis
│   ├── internal-linking.json           # Linking structure and suggestions
│   ├── content-recommendations.json    # Prioritized improvement plan
│   └── content-briefs/                 # Detailed briefs for top opportunities
│       ├── brief-topic-1.md
│       ├── brief-topic-2.md
│       └── ...
└── integrated-content-strategy.md      # Combined Phase 1+2+3 action plan
```

## Examples

### Example 1: Basic Technical Audit
```bash
/seo-audit --url https://mysite.com
```

**What happens:**
1. Discovers sitemap
2. Analyzes up to 100 pages
3. Generates technical health report
4. Identifies top 10 issues
5. Provides recommendations

**Time:** 1-3 minutes for 100 pages

---

### Example 2: Competitive Analysis
```bash
/seo-audit --url https://mysite.com \
  --competitors https://competitor1.com,https://competitor2.com \
  --max-pages 20
```

**What happens:**
1. Analyzes your site (20 pages)
2. Analyzes 2 competitors (20 pages each)
3. Compares technical performance
4. Identifies content gaps
5. Generates competitive benchmarks
6. Provides strategic recommendations

**Time:** 3-5 minutes (60 pages total)

---

### Example 3: Keyword-Focused Competitive Analysis
```bash
/seo-audit --url https://mysite.com \
  --keywords "marketing automation,email marketing,crm software" \
  --discover-competitors
```

**What happens:**
1. Performs SERP analysis for 3 keywords
2. Discovers top 5 competitors from SERP
3. Analyzes your site + competitors
4. Identifies keyword gaps (where you don't rank)
5. Finds SERP feature opportunities
6. Generates keyword-specific recommendations

**Time:** 5-7 minutes (multiple SERP queries + crawling)

---

### Example 4: Complete Audit with All Features
```bash
/seo-audit --url https://mysite.com \
  --competitors https://comp1.com,https://comp2.com \
  --keywords "primary keyword,secondary keyword" \
  --max-pages 50 \
  --check-broken-links \
  --output ./reports/monthly-audit \
  --priority high
```

**What happens:**
1. Full technical analysis (50 pages)
2. Broken link detection
3. SERP analysis for 2 keywords
4. Competitor benchmarking
5. Content gap analysis
6. SERP feature opportunities
7. Generates comprehensive reports
8. Filters recommendations to high-priority only

**Time:** 10-15 minutes (comprehensive analysis)

---

### Example 5: Full Content Optimization Audit (Phase 3)
```bash
/seo-audit --url https://mysite.com \
  --analyze-content \
  --aeo-optimization \
  --content-recommendations \
  --readability \
  --internal-linking \
  --output ./reports/content-optimization
```

**What happens:**
1. Full site crawl and technical analysis
2. Content quality scoring (6 dimensions) for all pages
3. Readability analysis (multiple metrics)
4. AEO opportunity identification (featured snippets, PAA)
5. Internal linking structure analysis
6. Content recommendations with detailed briefs
7. Generates comprehensive content strategy

**Time:** 8-12 minutes (50 pages)

---

### Example 6: Complete Phase 1+2+3 Audit
```bash
/seo-audit --url https://mysite.com \
  --competitors https://comp1.com,https://comp2.com \
  --keywords "marketing automation,crm software" \
  --analyze-content \
  --aeo-optimization \
  --content-recommendations \
  --max-pages 50 \
  --output ./reports/full-audit
```

**What happens:**
1. Technical health analysis (Phase 1)
2. Competitive benchmarking (Phase 2)
3. Content gap analysis (Phase 2)
4. Content quality scoring (Phase 3)
5. AEO optimization opportunities (Phase 3)
6. Internal linking strategy (Phase 3)
7. Unified strategic plan combining all insights

**Time:** 15-20 minutes (comprehensive multi-phase analysis)

---

### Example 7: GEO Validation for AI Search (Phase 3.1 - NEW)
```bash
/seo-audit --url https://mysite.com \
  --geo-validation \
  --check-robots \
  --output ./reports/geo-audit
```

**What happens:**
1. Check robots.txt for AI crawler access (GPTBot, Google-Extended, Claude-Web)
2. Validate entity markup completeness (Organization, WebSite, Person schema)
3. Analyze structured content (TL;DR sections, lists, tables, Q&A format)
4. Check answer block readiness (40-60 word concise answers)
5. Validate citation readiness (author info, dates, sources)
6. Generate GEO score (0-100) with recommendations

**GEO Score Dimensions:**
- AI Crawler Access (25%) - Can AI search engines crawl your site?
- Entity Markup (25%) - Is your organization/brand properly defined?
- Structured Content (20%) - Do you have TL;DR sections and lists?
- Answer Blocks (20%) - Do you have concise, extractable answers?
- Citation Readiness (10%) - Do you have author info and sources?

**Why GEO matters:**
- ChatGPT search visibility
- Google AI Overviews inclusion
- Perplexity AI citations
- Claude web search results
- Bing Copilot mentions

**Time:** 2-3 minutes

---

### Example 8: Complete AI Search Optimization (Phase 3.1 + 4.0 - NEW)
```bash
/seo-audit --url https://mysite.com \
  --geo-validation \
  --check-robots \
  --generate-schema \
  --optimize-content \
  --output ./reports/ai-search-optimization
```

**What happens:**
1. **Phase 3.1: GEO Validation**
   - Check robots.txt for AI crawler access (9 crawlers)
   - Validate entity markup completeness
   - Analyze structured content readiness
   - Check answer block quality
   - Validate citation readiness
   - Generate GEO score (0-100)

2. **Phase 4.0: AI Search Optimization**
   - Auto-generate missing schema markup (Organization, WebSite, Article, etc.)
   - Auto-generate TL;DR sections (40-60 words)
   - Auto-generate answer blocks for key questions
   - Auto-generate FAQ sections with schema
   - Validate all generated content
   - Generate deployment preview

3. **Output:**
   - GEO validation report with current score
   - Generated schema JSON files
   - Generated content HTML files
   - Deployment preview (what would change)
   - Projected GEO score improvement

**Example Output:**
```
✅ GEO Validation Complete
Current GEO Score: 25/100

GEO Dimensions:
- AI Crawler Access: 0/100 (missing robots.txt rules)
- Entity Markup: 0/100 (no schema)
- Structured Content: 60/100 (basic headings)
- Answer Blocks: 30/100 (some Q&A but not optimized)
- Citation Readiness: 65/100 (author but incomplete)

✅ AI Search Optimization Complete

Generated Content:
- Schema: 2 schemas (Organization, WebSite)
- TL;DR sections: 1 (52 words)
- Answer blocks: 5 (avg 48 words each)
- FAQ section: 7 Q&A pairs

Projected GEO Improvement: 25 → 82/100 (+57 points)

📝 Deployment Preview:
- Add schema to site header HTML
- Add AI crawler rules to robots.txt
- Deploy TL;DR section to homepage
- Deploy 5 answer blocks throughout content
- Deploy FAQ section before footer

Next Steps:
1. Review generated content for accuracy
2. Deploy to HubSpot: /deploy-ai-seo --portal-id <id> --deploy-all
3. Complete manual steps (schema, robots.txt)
4. Re-run GEO validation to confirm improvement

Full reports saved to: ./reports/ai-search-optimization
```

**Time:** 5-8 minutes (validation + generation)

**Phase 4 Advantages:**
- ✅ No manual content writing required
- ✅ Auto-generates from existing content
- ✅ Validates word counts and quality
- ✅ Preview before deployment
- ✅ One-command optimization workflow

---

## Agent Routing

This command routes to different agents based on parameters:

### Basic Audit (Phase 1)
```yaml
Agent: hubspot-seo-site-crawler
Trigger: No --competitors or --keywords
Features: Site crawling, technical analysis, health scoring
```

### Competitive Analysis (Phase 2)
```yaml
Agent: hubspot-seo-competitor-analyzer
Trigger: --competitors OR --keywords present
Features: All Phase 1 features + competitor analysis, gap analysis, SERP intelligence
```

### Content Optimization (Phase 3)
```yaml
Agent: hubspot-seo-content-optimizer
Trigger: ANY Phase 3 flag (--analyze-content, --aeo-optimization, --content-recommendations, --readability, --internal-linking)
Features: All Phase 1+2 features + content quality scoring, AEO optimization, readability analysis, internal linking, content recommendations
```

### AI Search Optimization (Phase 4 - NEW)
```yaml
Agent: hubspot-schema-automation-agent, hubspot-content-automation-agent
Trigger: ANY Phase 4 flag (--generate-schema, --optimize-content, --deploy-preview, --full-ai-optimization)
Features: Auto-generate schema markup + AI-optimized content + deployment preview
Sub-commands:
  - /ai-search-optimize (generation workflow)
  - /deploy-ai-seo (deployment workflow)
```

## Performance Expectations

| Scenario | Pages | Competitors | Time |
|----------|-------|-------------|------|
| Quick audit | 10 | 0 | 30-60 seconds |
| Standard audit | 50 | 0 | 2-3 minutes |
| Full audit | 100 | 0 | 3-5 minutes |
| Competitive (small) | 20 | 2 | 3-5 minutes |
| Competitive (medium) | 50 | 2 | 8-12 minutes |
| Competitive (large) | 100 | 3 | 15-20 minutes |
| Keyword-focused | 50 | auto | 10-15 minutes |

## Tips & Best Practices

### For Accurate Results
1. **Use realistic --max-pages**: Analyzing 1000+ pages takes time
2. **Start small**: First audit with 20-50 pages to get feel for site
3. **Compare apples to apples**: Use same --max-pages for you and competitors
4. **Target specific keywords**: Use 3-5 high-value keywords, not dozens

### For Actionable Insights
1. **Include competitors**: Even 1 competitor provides valuable context
2. **Focus on high priority**: Use `--priority high` to focus on quick wins
3. **Regular audits**: Run monthly to track progress
4. **Export data**: Use JSON output for trend analysis over time

### For Performance
1. **Enable caching**: Scripts cache results for 7 days by default
2. **Limit scope**: Use --max-pages to control analysis depth
3. **Skip broken links**: Only use --check-broken-links when needed (adds 2-5 min)
4. **Run in background**: Large audits can run while you work on other tasks

## Common Issues & Solutions

### "No sitemap found"
- **Solution**: Site may not have sitemap. Command will analyze homepage + crawlable links.
- **Tip**: Ensure your site has a sitemap at /sitemap.xml for best results.

### "Rate limited by target site"
- **Solution**: Scripts include rate limiting (1 req/sec). Wait and retry.
- **Tip**: Some sites block automated requests. May need manual analysis.

### "Competitor analysis taking too long"
- **Solution**: Reduce --max-pages or analyze fewer competitors
- **Tip**: For initial analysis, use --max-pages 20

### "Missing SERP data for keywords"
- **Solution**: WebSearch API may not return results. Try different keywords.
- **Tip**: Use commercial keywords (not branded) for better SERP data.

## Related Commands

- `/seo-broken-links` - Fast broken link scanning only
- `/analyze-competitor` - Deep-dive competitor analysis (Phase 2)
- `/optimize-content` - Focused content optimization for single pages (Phase 3)

## Version History

- **v4.0.0** (Phase 4.0) - Added AI search optimization: auto-generate schema markup (7 types), auto-generate AI-optimized content (TL;DR, answer blocks, FAQ), deployment preview, one-command optimization workflow
- **v3.1.0** (Phase 3.1) - Added GEO validation: AI crawler access, entity markup, structured content, answer blocks, citation readiness scoring
- **v3.0.0** (Phase 3.0) - Added content optimization: content quality scoring, AEO optimization, readability analysis, internal linking, content recommendations
- **v2.0.0** (Phase 2.0) - Added competitor analysis, SERP intelligence, content gap analysis
- **v1.0.0** (Phase 1.0) - Initial release with site crawling and technical health scoring

---

**You are an AI assistant processing this command. Based on the parameters provided:**

1. **Parse parameters** from user input
2. **Validate URLs** and parameter combinations
3. **Determine agent** to route to:
   - Use `hubspot-seo-site-crawler` if no competitors/keywords
   - Use `hubspot-seo-competitor-analyzer` if competitors/keywords present
4. **Invoke agent** with Task tool, passing all parameters as structured prompt
5. **Present results** with clear summary of findings and next steps

**Example routing logic:**

```javascript
if (params.generateSchema || params.optimizeContent || params.fullAiOptimization) {
  // Phase 4: AI search optimization
  await Task({
    subagent_type: 'hubspot-schema-automation-agent',
    prompt: `
      Perform AI search optimization:
      - URL: ${params.url}
      - GEO validation: ${params.geoValidation || false}
      - Generate schema: ${params.generateSchema || false}
      - Optimize content: ${params.optimizeContent || false}
      - Deploy preview: ${params.deployPreview || false}
      - Output: ${params.output || './seo-audit-results'}

      Generate comprehensive AI search optimization with:
      1. GEO validation (if requested)
      2. Auto-generated schema markup (7 types)
      3. Auto-generated AI-optimized content (TL;DR, answer blocks, FAQ)
      4. Deployment preview
      5. Projected GEO score improvement

      Use /ai-search-optimize for full workflow automation.
    `
  });
} else if (params.analyzeContent || params.aeoOptimization || params.contentRecommendations ||
    params.readability || params.internalLinking) {
  // Phase 3: Content optimization (may include Phase 1+2)
  await Task({
    subagent_type: 'hubspot-seo-content-optimizer',
    prompt: `
      Perform comprehensive content optimization:
      - Your site: ${params.url}
      - Competitors: ${params.competitors || 'none'}
      - Keywords: ${params.keywords || 'none'}
      - Max pages: ${params.maxPages || 100}
      - Output: ${params.output || './seo-audit-results'}

      Content optimization requests:
      - Analyze content quality: ${params.analyzeContent || false}
      - AEO optimization: ${params.aeoOptimization || false}
      - Content recommendations: ${params.contentRecommendations || false}
      - Readability analysis: ${params.readability || false}
      - Internal linking: ${params.internalLinking || false}

      Generate comprehensive content strategy with Phase 1+2+3 integration.
    `
  });
} else if (params.competitors || params.keywords || params.discoverCompetitors) {
  // Phase 2: Competitive analysis
  await Task({
    subagent_type: 'hubspot-seo-competitor-analyzer',
    prompt: `
      Perform competitive SEO analysis:
      - Your site: ${params.url}
      - Competitors: ${params.competitors || 'auto-discover from keywords'}
      - Keywords: ${params.keywords || 'none'}
      - Max pages: ${params.maxPages || 100}
      - Check broken links: ${params.checkBrokenLinks || false}
      - Output: ${params.output || './seo-audit-results'}

      Generate comprehensive competitive analysis with:
      1. Your site technical health
      2. Competitor benchmarking
      3. Content gap analysis
      4. SERP feature opportunities
      5. Strategic recommendations (priority: ${params.priority || 'all'})
    `
  });
} else {
  // Phase 1: Basic technical audit
  await Task({
    subagent_type: 'hubspot-seo-site-crawler',
    prompt: `
      Perform SEO site audit:
      - URL: ${params.url}
      - Max pages: ${params.maxPages || 100}
      - Check broken links: ${params.checkBrokenLinks || false}
      - Output: ${params.output || './seo-audit-results'}

      Generate technical health report with prioritized recommendations.
    `
  });
}
```

**After agent completes:**

Present summary to user:

```
✅ SEO Audit Complete

Your Site: https://example.com
Overall Health Score: 75/100 (Good)

Key Findings:
- Technical: 85/100 (Very Good)
- Content: 70/100 (Good) - 5 pages missing meta descriptions
- Schema: 40/100 (Needs Improvement) - Only 20% coverage
- Images: 65/100 (Fair) - 15% missing alt text
- Links: 90/100 (Excellent)

Top 3 Recommendations:
1. [HIGH] Add schema markup to 80% of pages (+25 point impact)
2. [HIGH] Fix 5 missing meta descriptions (+10 point impact)
3. [MEDIUM] Add alt text to 12 images (+8 point impact)

[If competitors analyzed:]

Competitive Analysis:
- Competitor 1: https://comp1.com (Health: 82/100)
- Competitor 2: https://comp2.com (Health: 78/100)

Content Gaps Identified: 15 topics
Keyword Opportunities: 23 keywords
SERP Feature Gaps: 8 opportunities

Top Competitive Opportunity:
Create content about "marketing automation best practices"
- 3 competitors rank, you don't
- High search volume, medium difficulty
- Impact: 9/10 | Effort: 5/10

Full reports saved to: ${params.output}
```
