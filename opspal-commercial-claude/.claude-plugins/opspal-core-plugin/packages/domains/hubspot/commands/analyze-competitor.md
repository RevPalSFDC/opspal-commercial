---
name: analyze-competitor
description: Deep-dive competitive analysis for a single competitor with actionable recommendations
stage: production
version: 1.0.0
---

# Analyze Competitor Command

Performs deep competitive intelligence analysis on a single competitor, identifying their strengths, weaknesses, and opportunities to outrank them.

## Usage

### Basic Competitor Analysis
```bash
/analyze-competitor --your-site https://mysite.com --competitor https://competitor.com
```

### Focused Keyword Analysis
```bash
/analyze-competitor --your-site https://mysite.com \
  --competitor https://competitor.com \
  --keywords "marketing automation,crm software,sales tools"
```

### Comprehensive Deep Dive
```bash
/analyze-competitor --your-site https://mysite.com \
  --competitor https://competitor.com \
  --keywords "primary keyword,secondary keyword" \
  --max-pages 100 \
  --include-backlinks \
  --output ./reports/competitor-analysis
```

## Parameters

### Required
- `--your-site <url>` - Your website URL
- `--competitor <url>` - Single competitor URL to analyze in-depth

### Optional - Analysis Depth
- `--keywords <keywords>` - Comma-separated keywords for SERP and ranking analysis
- `--max-pages <number>` - Maximum pages to analyze per site (default: 50)
- `--include-backlinks` - Estimate competitor's backlink profile (experimental)
- `--include-traffic` - Estimate competitor's traffic patterns (experimental)

### Optional - Report Configuration
- `--output <path>` - Output directory for reports (default: ./competitor-analysis)
- `--format <json|markdown|both>` - Report format (default: both)
- `--focus <strengths|weaknesses|opportunities>` - Analysis focus (default: all)

## What This Command Does

This command provides **360-degree competitive intelligence** on a single competitor:

### 1. Competitor Profile Analysis
- Site architecture and structure
- Content strategy and topics covered
- Technical SEO implementation
- Schema markup and rich results
- Internal linking strategy
- User experience patterns

### 2. Comparative Benchmarking
- Technical performance comparison
- Content quality and depth comparison
- Schema markup coverage
- Image optimization
- Link structure efficiency
- Page speed and Core Web Vitals

### 3. Keyword & Ranking Analysis (if --keywords provided)
- Where they rank vs you
- Keywords they rank for that you don't
- SERP features they capture
- Ranking patterns and strategies
- Title/description patterns that work

### 4. Content Gap Analysis
- Topics they cover extensively (you don't)
- Content clusters they've built
- Content depth and comprehensiveness
- Update frequency and freshness

### 5. Strategic Recommendations
- **Quick wins** - Low effort, high impact opportunities
- **Strategic initiatives** - Long-term competitive moves
- **Defensive actions** - Protect your existing rankings
- **Offensive actions** - Target their weak spots

## Output Files

The command generates a comprehensive competitive intelligence package:

```
<output-dir>/
├── executive-summary.md                # 1-page strategic overview
├── competitor-profile.json             # Complete competitor data
├── competitive-scorecard.md            # Side-by-side comparison
├── content-analysis/
│   ├── topic-coverage.json            # Topics they cover (you don't)
│   ├── content-clusters.json          # Their content hub strategy
│   ├── content-depth-comparison.csv   # Word count, images, depth
│   └── update-frequency.json          # Publishing cadence
├── keyword-analysis/                   # If --keywords provided
│   ├── ranking-comparison.csv         # Position tracking
│   ├── keyword-gaps.json              # Keywords they rank for (you don't)
│   ├── serp-features.json             # Featured snippets, PAA they capture
│   └── title-pattern-analysis.md      # What titles work for them
├── technical-analysis/
│   ├── technical-comparison.json      # Technical SEO comparison
│   ├── schema-analysis.json           # Their schema strategy
│   ├── internal-linking.json          # Link structure analysis
│   └── performance-metrics.json       # Speed, Core Web Vitals
├── strategic-recommendations.md        # Prioritized action plan
└── opportunity-matrix.csv             # Impact vs Effort grid
```

## Analysis Workflow

### Step 1: Data Collection (2-5 minutes)
```
Analyzing competitor: https://competitor.com
├── Discovering sitemap...               ✅ Found 250 URLs
├── Crawling pages (max: 50)...         ✅ 50/50 pages analyzed
├── Extracting topics...                 ✅ 37 unique topics found
├── Analyzing schema...                  ✅ 85% schema coverage
├── Mapping internal links...            ✅ 347 internal links
└── Calculating metrics...               ✅ Complete

Analyzing your site: https://mysite.com
├── Discovering sitemap...               ✅ Found 180 URLs
├── Crawling pages (max: 50)...         ✅ 50/50 pages analyzed
├── Extracting topics...                 ✅ 28 unique topics found
├── Analyzing schema...                  ✅ 42% schema coverage
├── Mapping internal links...            ✅ 198 internal links
└── Calculating metrics...               ✅ Complete
```

### Step 2: SERP Analysis (if --keywords provided, 3-5 minutes)
```
Analyzing SERP rankings for 3 keywords...
├── "marketing automation"
│   ├── Your position: #15
│   ├── Competitor position: #3
│   └── SERP features: Featured snippet, PAA, Videos
├── "crm software"
│   ├── Your position: Not ranking
│   ├── Competitor position: #5
│   └── SERP features: Featured snippet, Shopping
└── "sales tools"
    ├── Your position: #8
    ├── Competitor position: #4
    └── SERP features: PAA, Images
```

### Step 3: Gap Analysis (2-3 minutes)
```
Identifying content gaps...
├── Topic gaps: 9 major topics
├── Keyword gaps: 23 keywords
├── SERP feature gaps: 4 opportunities
└── Content depth gaps: 5 dimensions

Analyzing competitive advantages...
├── Your strengths: 3 areas
├── Their strengths: 7 areas
├── Your weaknesses: 5 areas
└── Their weaknesses: 2 areas
```

### Step 4: Strategic Recommendations (1-2 minutes)
```
Generating recommendations...
├── Quick wins: 5 opportunities
├── Strategic initiatives: 8 opportunities
├── Defensive actions: 3 opportunities
└── Offensive actions: 4 opportunities

Prioritizing by impact/effort ratio...
✅ 20 recommendations generated
```

## Example Output: Executive Summary

```markdown
# Competitor Analysis: competitor.com vs mysite.com

## Executive Summary

**Analyzed:** 2025-01-15
**Competitor:** https://competitor.com
**Your Site:** https://mysite.com

### Overall Assessment

Competitor Health Score: **82/100** (Very Good)
Your Health Score: **68/100** (Good)

**Gap: -14 points**

### Key Findings

#### Their Strengths
1. **Schema Markup** - 85% coverage vs your 42% (-43%)
2. **Content Depth** - Avg 2,100 words vs your 1,200 (-900 words)
3. **Internal Linking** - 12.5 links/page vs your 7.2 (-5.3)
4. **Topic Coverage** - 37 topics vs your 28 (-9 topics)

#### Your Strengths
1. **Page Speed** - 1.2s vs their 2.1s (+0.9s faster)
2. **Image Optimization** - 92% vs their 78% (+14%)
3. **Mobile Experience** - Better viewport/responsive

#### Critical Gaps

1. **"Marketing Automation" Keyword**
   - They rank #3, you rank #15
   - They have featured snippet
   - Gap: 12 positions

2. **Content Topic: "Email Marketing Best Practices"**
   - They have 8 pages, you have 0
   - High opportunity

3. **SERP Features**
   - They capture 4 featured snippets
   - You capture 0

### Top 3 Recommendations

1. **[QUICK WIN]** Add schema markup to top 20 pages
   - Impact: 9/10 | Effort: 4/10
   - Time: 2-3 days
   - Expected: Close 20-point gap

2. **[STRATEGIC]** Create "Email Marketing" content cluster
   - Impact: 8/10 | Effort: 7/10
   - Time: 2-3 weeks
   - Expected: Capture 5-8 new rankings

3. **[OFFENSIVE]** Target their weak spot: Page speed
   - Impact: 7/10 | Effort: 3/10
   - Time: 1 week
   - Expected: Outrank on mobile searches
```

## Use Cases

### Use Case 1: New Market Entry
**Scenario:** You're entering a market with an established competitor

```bash
/analyze-competitor --your-site https://newsite.com \
  --competitor https://established-leader.com \
  --keywords "target keyword 1,target keyword 2" \
  --max-pages 100
```

**Goal:** Understand what it takes to compete, identify gaps in their strategy

---

### Use Case 2: Lost Rankings Investigation
**Scenario:** A competitor recently outranked you

```bash
/analyze-competitor --your-site https://mysite.com \
  --competitor https://newlyranking.com \
  --keywords "keyword we lost" \
  --focus strengths
```

**Goal:** Understand what they did better, create recovery plan

---

### Use Case 3: Strategic Planning
**Scenario:** Annual competitive assessment

```bash
/analyze-competitor --your-site https://mysite.com \
  --competitor https://maincompetitor.com \
  --max-pages 100 \
  --include-backlinks \
  --output ./reports/annual-competitive-review
```

**Goal:** Comprehensive competitive intelligence for strategic planning

---

### Use Case 4: Content Strategy
**Scenario:** Need ideas for content roadmap

```bash
/analyze-competitor --your-site https://mysite.com \
  --competitor https://thoughtleader.com \
  --focus opportunities
```

**Goal:** Identify content gaps and opportunities

## Tips & Best Practices

### Choosing the Right Competitor
1. **Direct competitor** - Same target audience and keywords
2. **Outranking you** - Focus on those ranking better than you
3. **Similar size** - Analyze achievable targets, not giants
4. **Different strengths** - Learn from various competitive advantages

### Getting Actionable Insights
1. **Use --keywords** - Without keywords, analysis is purely technical
2. **Analyze top performer** - Study the #1 ranking competitor for your target keyword
3. **Focus analysis** - Use --focus to zero in on specific aspects
4. **Regular tracking** - Run quarterly to track competitor changes

### Common Mistakes to Avoid
1. **Analyzing too many pages** - Start with 20-50 pages for quick insights
2. **No keyword context** - Always provide --keywords for strategic value
3. **Ignoring their weaknesses** - Look for gaps you can exploit
4. **Analysis paralysis** - Focus on top 3-5 recommendations

## Performance Expectations

| Scenario | Pages | Keywords | Time |
|----------|-------|----------|------|
| Quick analysis | 20 | 0 | 2-3 minutes |
| Standard analysis | 50 | 3 | 5-7 minutes |
| Deep dive | 100 | 5 | 10-15 minutes |
| Comprehensive | 100 | 10 | 15-20 minutes |

## Comparison: /seo-audit vs /analyze-competitor

| Feature | /seo-audit | /analyze-competitor |
|---------|------------|---------------------|
| **Focus** | Your site health | Competitive intelligence |
| **Competitors** | Multiple (2-5) | Single (deep dive) |
| **Depth** | Broad overview | Deep analysis |
| **Keywords** | Optional | Recommended |
| **Output** | Health report | Strategic plan |
| **Use Case** | Regular audits | Competitive research |
| **Time** | 3-5 minutes | 5-15 minutes |

**Rule of thumb:**
- Use `/seo-audit` for regular health monitoring
- Use `/analyze-competitor` when researching a specific competitor

## Agent Routing

This command always routes to the specialist agent:

```yaml
Agent: hubspot-seo-competitor-analyzer
Mode: Single competitor deep-dive
Features:
  - Comprehensive competitor profiling
  - Comparative benchmarking
  - Content gap analysis
  - Keyword ranking analysis
  - Strategic recommendation engine
```

## Related Commands

- `/seo-audit` - Comprehensive audit with optional multi-competitor comparison
- `/seo-broken-links` - Fast broken link scanning

## Troubleshooting

### "Competitor site blocking crawler"
- **Solution:** Some sites block automated crawlers. Try reducing --max-pages.
- **Tip:** If site is heavily protected, consider manual research supplement.

### "No keyword data available"
- **Solution:** WebSearch API may not return data. Try different/broader keywords.
- **Tip:** Use commercial keywords (not branded) for better SERP data.

### "Analysis too shallow"
- **Solution:** Increase --max-pages to 100 for more comprehensive analysis.
- **Tip:** Balance depth with time constraints.

## Version History

- **v1.0.0** - Initial release (Phase 2)

---

**You are an AI assistant processing this command. When invoked:**

1. **Parse and validate parameters**
   - Ensure both --your-site and --competitor are provided
   - Validate URLs
   - Check keyword format if provided

2. **Invoke the specialist agent**
   ```javascript
   await Task({
     subagent_type: 'hubspot-seo-competitor-analyzer',
     prompt: `
       Perform deep-dive competitive analysis:

       Your Site: ${params.yourSite}
       Competitor: ${params.competitor} (SINGLE COMPETITOR - DEEP DIVE)

       Analysis Parameters:
       - Keywords: ${params.keywords || 'none'}
       - Max pages: ${params.maxPages || 50}
       - Include backlinks: ${params.includeBacklinks || false}
       - Include traffic: ${params.includeTraffic || false}
       - Focus: ${params.focus || 'all'}
       - Output: ${params.output || './competitor-analysis'}

       IMPORTANT: This is a DEEP-DIVE analysis of a SINGLE competitor.
       Provide comprehensive competitive intelligence including:

       1. Complete competitor profile (architecture, topics, strategy)
       2. Detailed comparative benchmarking (5 dimensions)
       3. Content gap analysis (topics they cover, you don't)
       4. Keyword ranking comparison (if keywords provided)
       5. SERP feature analysis
       6. Strategic recommendations (quick wins + long-term)

       Generate executive summary with:
       - Overall assessment (health score comparison)
       - Key findings (their strengths, your strengths, critical gaps)
       - Top 3 prioritized recommendations with impact/effort scores
       - Detailed opportunity analysis

       Format: ${params.format || 'both'}
     `
   });
   ```

3. **Present results to user**
   ```
   ✅ Competitor Analysis Complete

   Competitor: https://competitor.com
   Health Score: 82/100 (Very Good)

   Your Site: https://mysite.com
   Health Score: 68/100 (Good)

   Gap: -14 points

   Key Findings:
   - Their Strengths: Schema markup (85%), Content depth (2100 words avg)
   - Your Strengths: Page speed (1.2s), Image optimization (92%)
   - Critical Gap: "Marketing automation" keyword (#3 vs #15)

   Top 3 Recommendations:
   1. [QUICK WIN] Add schema markup - Impact: 9/10 | Effort: 4/10
   2. [STRATEGIC] Create email marketing cluster - Impact: 8/10 | Effort: 7/10
   3. [OFFENSIVE] Leverage speed advantage - Impact: 7/10 | Effort: 3/10

   Full competitive intelligence report saved to: ${params.output}

   Next Steps:
   - Review executive-summary.md for strategic overview
   - Check opportunity-matrix.csv for prioritized actions
   - Implement top 3 recommendations within 30 days
   ```

**If user needs clarification on parameters, provide examples and explain the difference between /seo-audit and /analyze-competitor.**
