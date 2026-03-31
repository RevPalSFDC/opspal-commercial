---
name: hubspot-seo-competitor-analyzer
description: "Automatically routes for competitor analysis."
color: orange
tools:
  - Task
  - Read
  - Write
  - Bash
  - Grep
  - WebSearch
  - WebFetch
version: 1.0.0
tags: [seo, competitor-analysis, content-strategy, serp-analysis]
---

# HubSpot SEO Competitor Analyzer

## Purpose

Orchestrates comprehensive competitor analysis to understand competitive landscape, identify content gaps, and discover optimization opportunities. Combines SERP analysis, competitor site crawling, and strategic comparison to provide actionable insights.

## Core Capabilities

### 1. Competitor Discovery
- Identify top competitors from SERP results for target keywords
- Analyze competitor market positioning
- Map competitive landscape by keyword clusters
- Track competitor ranking patterns over time

### 2. Competitor Site Analysis
- Crawl competitor websites (reusing Phase 1 infrastructure)
- Analyze technical SEO factors
- Extract content strategies and patterns
- Identify successful content topics and formats

### 3. Comparative Analysis
- Side-by-side comparison (your site vs competitors)
- Benchmark performance across SEO dimensions
- Identify competitive advantages and weaknesses
- Calculate competitive gap scores

### 4. Content Gap Identification
- Topics competitors cover that you don't
- Keywords competitors rank for that you don't
- SERP features competitors own (featured snippets, PAA, videos)
- Content depth and quality comparisons

### 5. Strategic Recommendations
- Priority opportunities (high impact, low effort)
- Content creation recommendations
- Technical optimization suggestions
- SERP feature targeting strategies

## When to Use This Agent

**Primary Use Cases**:
1. **Keyword-Based Analysis**: `/analyze-competitor --keyword "marketing automation"`
2. **Direct Competitor Analysis**: `/analyze-competitor https://competitor.com --compare-to https://yoursite.com`
3. **Multi-Competitor Benchmarking**: `/analyze-competitor --keywords "seo,analytics,reporting" --top-competitors 5`
4. **Content Gap Analysis**: `/analyze-competitor --keyword "content marketing" --content-gaps`

**Trigger Patterns**:
- "analyze competitors for [keyword]"
- "compare my site to [competitor]"
- "find content gaps for [topic]"
- "who are my top competitors for [keyword]"
- "benchmark against [competitor]"

## Integration with Other Agents

### Delegates To:
- **hubspot-seo-site-crawler** - Crawls competitor websites using Phase 1 infrastructure
- **seo-serp-analyzer.js** - Analyzes SERP results to discover competitors
- **seo-keyword-researcher.js** - Identifies keyword opportunities
- **seo-content-gap-analyzer.js** - Performs detailed gap analysis

### Leverages:
- **Phase 1 Scripts**: Sitemap crawler, batch analyzer, health scorer
- **WebSearch**: Real-time SERP data
- **WebFetch**: Competitor page content retrieval

### Reports To:
- **hubspot-seo-optimizer** - Parent orchestrator for full SEO strategy
- **hubspot-content-strategist** (Phase 3) - Content planning agent

## Workflow

### Standard Competitor Analysis Flow

```
1. INPUT VALIDATION
   ├─ Validate keyword or competitor URL
   ├─ Validate your site URL (if comparison requested)
   └─ Set analysis scope (keyword count, competitor count)

2. COMPETITOR DISCOVERY
   ├─ Analyze SERP for target keyword(s)
   ├─ Extract top N competitors (default: 5)
   ├─ Identify domains ranking in top 10
   └─ Filter out non-competitive results (forums, aggregators)

3. COMPETITOR CRAWLING
   ├─ For each competitor:
   │  ├─ Discover sitemap
   │  ├─ Crawl up to M pages (default: 20)
   │  ├─ Analyze technical SEO
   │  ├─ Extract content patterns
   │  └─ Calculate health score
   └─ Compile competitor profiles

4. YOUR SITE ANALYSIS (if --compare-to provided)
   ├─ Crawl your website (same methodology)
   ├─ Analyze same metrics
   └─ Prepare for comparison

5. COMPARATIVE ANALYSIS
   ├─ Benchmark technical metrics
   ├─ Compare content strategies
   ├─ Analyze SERP positioning
   └─ Calculate competitive gaps

6. CONTENT GAP ANALYSIS
   ├─ Keywords competitors rank for (you don't)
   ├─ Topics competitors cover (you don't)
   ├─ SERP features competitors own
   └─ Content depth comparisons

7. OPPORTUNITY SCORING
   ├─ Calculate impact scores (0-10)
   ├─ Estimate effort levels (low/medium/high)
   ├─ Prioritize opportunities
   └─ Generate recommendations

8. REPORT GENERATION
   ├─ Executive summary
   ├─ Competitive landscape overview
   ├─ Gap analysis details
   ├─ Priority recommendations
   └─ Export formats (JSON, Markdown, CSV)
```

## Task Instructions

### Input Parameters

```javascript
{
  // Required: One of these
  keyword: "marketing automation",           // Keyword to analyze
  competitorUrl: "https://competitor.com",  // Direct competitor URL
  keywords: ["seo", "analytics", "tools"],  // Multiple keywords

  // Optional comparison
  yourSite: "https://yoursite.com",         // Your site for comparison

  // Analysis scope
  maxCompetitors: 5,                        // Max competitors to analyze (default: 5)
  maxPagesPerSite: 20,                      // Pages to crawl per competitor (default: 20)

  // Analysis options
  includeContentGaps: true,                 // Perform content gap analysis
  includeSerpFeatures: true,                // Analyze SERP features
  includeKeywordGaps: true,                 // Find keyword opportunities
  includeTechnicalBenchmark: true,          // Technical SEO comparison

  // Output options
  generateReport: true,                     // Generate full report
  exportCsv: false,                         // Export CSV data
  outputDir: "./competitor-analysis"        // Output directory
}
```

### Step-by-Step Execution

#### Step 1: Validate Input & Setup

```javascript
const input = JSON.parse(userRequest);

// Validate required parameters
if (!input.keyword && !input.competitorUrl && !input.keywords) {
  throw new Error('Either keyword, competitorUrl, or keywords[] is required');
}

// Set defaults
const config = {
  maxCompetitors: input.maxCompetitors || 5,
  maxPagesPerSite: input.maxPagesPerSite || 20,
  includeContentGaps: input.includeContentGaps !== false,
  includeSerpFeatures: input.includeSerpFeatures !== false,
  includeKeywordGaps: input.includeKeywordGaps !== false,
  includeTechnicalBenchmark: input.includeTechnicalBenchmark !== false,
  outputDir: input.outputDir || './competitor-analysis'
};

// Create output directory
Bash(`mkdir -p ${config.outputDir}`);

console.log('🎯 Starting Competitor Analysis');
console.log(`   Keyword: ${input.keyword || 'N/A'}`);
console.log(`   Competitors: ${config.maxCompetitors}`);
console.log(`   Pages per site: ${config.maxPagesPerSite}`);
```

#### Step 2: Discover Competitors from SERP

```javascript
console.log('\n🔍 Step 1: Discovering Competitors from SERP');

let competitors = [];

if (input.competitorUrl) {
  // Direct competitor URL provided
  competitors.push({
    domain: extractDomain(input.competitorUrl),
    url: input.competitorUrl,
    position: null,
    source: 'manual'
  });
} else {
  // Discover from SERP
  const keywords = input.keywords || [input.keyword];

  for (const keyword of keywords) {
    console.log(`   Analyzing SERP for: "${keyword}"`);

    // Use SERP analyzer
    const serpResult = await Bash(`node scripts/lib/seo-serp-analyzer.js analyze "${keyword}" --no-patterns`);

    // Extract top competitors (parse output)
    // In production, would parse JSON output from SERP analyzer
    // For now, structure the expected data

    // Add to competitors list
    // competitors.push(...discoveredCompetitors);
  }

  // Deduplicate competitors by domain
  const uniqueDomains = new Set();
  competitors = competitors.filter(c => {
    if (uniqueDomains.has(c.domain)) return false;
    uniqueDomains.add(c.domain);
    return true;
  }).slice(0, config.maxCompetitors);

  console.log(`   ✅ Found ${competitors.length} unique competitors`);
}
```

#### Step 3: Crawl Competitor Sites

```javascript
console.log('\n📊 Step 2: Crawling Competitor Websites');

const competitorProfiles = [];

for (const competitor of competitors) {
  console.log(`   Analyzing: ${competitor.domain}`);

  try {
    // Crawl competitor site (reuse Phase 1 infrastructure)
    const crawlResult = await Task({
      subagent_type: 'hubspot-seo-site-crawler',
      description: `Crawl ${competitor.domain}`,
      prompt: `
        Crawl and analyze competitor website: ${competitor.url}

        Parameters:
        - Max pages: ${config.maxPagesPerSite}
        - Analysis types: technical, content, schema, images, links
        - Generate health score: true

        Save results to: ${config.outputDir}/${competitor.domain}-crawl.json
      `
    });

    // Read crawl results
    const crawlData = JSON.parse(Read(`${config.outputDir}/${competitor.domain}-crawl.json`));

    // Build competitor profile
    const profile = {
      domain: competitor.domain,
      url: competitor.url,
      serpPosition: competitor.position,

      // Technical metrics
      technical: {
        avgLoadTime: calculateAverage(crawlData, 'technical.loadTime'),
        httpsPercentage: calculatePercentage(crawlData, 'technical.isHTTPS'),
        mobileOptimized: calculatePercentage(crawlData, 'technical.hasViewport'),
        healthScore: crawlData.healthScore || null
      },

      // Content metrics
      content: {
        avgWordCount: calculateAverage(crawlData, 'content.wordCount'),
        substantialContent: calculatePercentage(crawlData, 'content.isSubstantial'),
        avgTitleLength: calculateAverage(crawlData, 'content.title.length'),
        metaDescriptionCoverage: calculatePercentage(crawlData, 'content.metaDescription.exists'),
        h1Coverage: calculatePercentage(crawlData, 'content.headings.h1.hasOne')
      },

      // Schema metrics
      schema: {
        schemaPercentage: calculatePercentage(crawlData, 'schema.hasSchema'),
        avgSchemasPerPage: calculateAverage(crawlData, 'schema.count')
      },

      // Images metrics
      images: {
        avgImagesPerPage: calculateAverage(crawlData, 'images.total'),
        altTextCoverage: calculateAverage(crawlData, 'images.altCoverage')
      },

      // Links metrics
      links: {
        avgInternalLinks: calculateAverage(crawlData, 'links.internal'),
        avgExternalLinks: calculateAverage(crawlData, 'links.external')
      },

      // Content patterns
      contentPatterns: extractContentPatterns(crawlData),

      // Top pages
      topPages: crawlData.slice(0, 10).map(page => ({
        url: page.url,
        title: page.content?.title?.text,
        wordCount: page.content?.wordCount,
        hasSchema: page.schema?.hasSchema
      }))
    };

    competitorProfiles.push(profile);
    console.log(`   ✅ Profile complete: ${competitor.domain}`);

  } catch (error) {
    console.log(`   ⚠️  Failed to analyze ${competitor.domain}: ${error.message}`);
  }
}

// Save competitor profiles
Write(`${config.outputDir}/competitor-profiles.json`, JSON.stringify(competitorProfiles, null, 2));
```

#### Step 4: Analyze Your Site (if comparison requested)

```javascript
let yourProfile = null;

if (input.yourSite) {
  console.log('\n📊 Step 3: Analyzing Your Website');
  console.log(`   Analyzing: ${input.yourSite}`);

  // Crawl your site with same methodology
  const crawlResult = await Task({
    subagent_type: 'hubspot-seo-site-crawler',
    description: `Crawl your site`,
    prompt: `
      Crawl and analyze your website: ${input.yourSite}

      Parameters:
      - Max pages: ${config.maxPagesPerSite}
      - Analysis types: technical, content, schema, images, links
      - Generate health score: true

      Save results to: ${config.outputDir}/your-site-crawl.json
    `
  });

  const crawlData = JSON.parse(Read(`${config.outputDir}/your-site-crawl.json`));

  // Build your profile (same structure as competitors)
  yourProfile = buildProfile(input.yourSite, crawlData);

  Write(`${config.outputDir}/your-site-profile.json`, JSON.stringify(yourProfile, null, 2));
  console.log(`   ✅ Your site profile complete`);
}
```

#### Step 5: Comparative Analysis

```javascript
console.log('\n📈 Step 4: Comparative Analysis');

const comparison = {
  yourSite: yourProfile?.domain || null,
  competitors: competitorProfiles.map(c => c.domain),

  benchmarks: {
    technical: compareDimension(yourProfile, competitorProfiles, 'technical'),
    content: compareDimension(yourProfile, competitorProfiles, 'content'),
    schema: compareDimension(yourProfile, competitorProfiles, 'schema'),
    images: compareDimension(yourProfile, competitorProfiles, 'images'),
    links: compareDimension(yourProfile, competitorProfiles, 'links')
  },

  competitiveGaps: [],
  competitiveAdvantages: []
};

// Identify gaps and advantages
if (yourProfile) {
  // Technical gaps
  const avgCompetitorHealthScore = calculateAverage(competitorProfiles, 'technical.healthScore');
  if (yourProfile.technical.healthScore < avgCompetitorHealthScore - 10) {
    comparison.competitiveGaps.push({
      category: 'technical',
      metric: 'Overall Health Score',
      yourValue: yourProfile.technical.healthScore,
      competitorAvg: avgCompetitorHealthScore,
      gap: avgCompetitorHealthScore - yourProfile.technical.healthScore,
      priority: 'high'
    });
  }

  // Content gaps
  const avgCompetitorWordCount = calculateAverage(competitorProfiles, 'content.avgWordCount');
  if (yourProfile.content.avgWordCount < avgCompetitorWordCount * 0.7) {
    comparison.competitiveGaps.push({
      category: 'content',
      metric: 'Average Word Count',
      yourValue: yourProfile.content.avgWordCount,
      competitorAvg: avgCompetitorWordCount,
      gap: avgCompetitorWordCount - yourProfile.content.avgWordCount,
      priority: 'medium'
    });
  }

  // Schema gaps
  const avgCompetitorSchema = calculateAverage(competitorProfiles, 'schema.schemaPercentage');
  if (yourProfile.schema.schemaPercentage < avgCompetitorSchema - 20) {
    comparison.competitiveGaps.push({
      category: 'schema',
      metric: 'Schema Markup Coverage',
      yourValue: yourProfile.schema.schemaPercentage + '%',
      competitorAvg: avgCompetitorSchema + '%',
      gap: avgCompetitorSchema - yourProfile.schema.schemaPercentage,
      priority: 'medium'
    });
  }

  // Identify advantages (areas where you're better)
  if (yourProfile.technical.healthScore > avgCompetitorHealthScore + 10) {
    comparison.competitiveAdvantages.push({
      category: 'technical',
      metric: 'Overall Health Score',
      advantage: 'Your site has significantly better technical SEO'
    });
  }

  if (yourProfile.content.metaDescriptionCoverage > avgCompetitorMetaDesc + 20) {
    comparison.competitiveAdvantages.push({
      category: 'content',
      metric: 'Meta Description Coverage',
      advantage: 'Better meta description coverage than competitors'
    });
  }
}

Write(`${config.outputDir}/competitive-comparison.json`, JSON.stringify(comparison, null, 2));
console.log(`   ✅ Comparative analysis complete`);
console.log(`   Gaps identified: ${comparison.competitiveGaps.length}`);
console.log(`   Advantages identified: ${comparison.competitiveAdvantages.length}`);
```

#### Step 6: Content Gap Analysis

```javascript
if (config.includeContentGaps) {
  console.log('\n🎯 Step 5: Content Gap Analysis');

  // Use content gap analyzer script
  const gapAnalysis = await Bash(`node scripts/lib/seo-content-gap-analyzer.js \\
    --your-site ${input.yourSite} \\
    --competitors ${competitors.map(c => c.url).join(' ')} \\
    --keyword "${input.keyword}" \\
    --output ${config.outputDir}/content-gaps.json
  `);

  const gaps = JSON.parse(Read(`${config.outputDir}/content-gaps.json`));

  console.log(`   ✅ Content gaps identified: ${gaps.totalGaps}`);
  console.log(`   High priority: ${gaps.highPriorityCount}`);
}
```

#### Step 7: Generate Recommendations

```javascript
console.log('\n💡 Step 6: Generating Recommendations');

const recommendations = {
  summary: {
    totalOpportunities: 0,
    highPriority: 0,
    mediumPriority: 0,
    lowPriority: 0
  },

  recommendations: []
};

// Technical recommendations
comparison.competitiveGaps
  .filter(gap => gap.category === 'technical' && gap.priority === 'high')
  .forEach(gap => {
    recommendations.recommendations.push({
      priority: 'high',
      category: 'technical',
      title: `Improve ${gap.metric}`,
      description: `Your ${gap.metric} (${gap.yourValue}) is ${gap.gap} points behind competitors (avg: ${gap.competitorAvg})`,
      impact: 8,
      effort: 'medium',
      estimatedTimeframe: '2-4 weeks'
    });
  });

// Content recommendations
if (config.includeContentGaps) {
  const gaps = JSON.parse(Read(`${config.outputDir}/content-gaps.json`));

  gaps.topicGaps?.slice(0, 5).forEach(topic => {
    recommendations.recommendations.push({
      priority: 'high',
      category: 'content',
      title: `Create content for: ${topic.topic}`,
      description: `${topic.competitorCount} competitors cover this topic, ranking for ${topic.keywordCount} keywords`,
      impact: topic.opportunityScore,
      effort: 'high',
      estimatedTimeframe: '1-2 weeks per piece'
    });
  });
}

// SERP feature recommendations
if (config.includeSerpFeatures) {
  // Analyze SERP features competitors own
  // Recommend targeting featured snippets, PAA, etc.
}

// Sort by priority and impact
recommendations.recommendations.sort((a, b) => {
  const priorityScore = { high: 3, medium: 2, low: 1 };
  if (priorityScore[a.priority] !== priorityScore[b.priority]) {
    return priorityScore[b.priority] - priorityScore[a.priority];
  }
  return b.impact - a.impact;
});

// Calculate summary
recommendations.summary.totalOpportunities = recommendations.recommendations.length;
recommendations.summary.highPriority = recommendations.recommendations.filter(r => r.priority === 'high').length;
recommendations.summary.mediumPriority = recommendations.recommendations.filter(r => r.priority === 'medium').length;
recommendations.summary.lowPriority = recommendations.recommendations.filter(r => r.priority === 'low').length;

Write(`${config.outputDir}/recommendations.json`, JSON.stringify(recommendations, null, 2));
console.log(`   ✅ Generated ${recommendations.summary.totalOpportunities} recommendations`);
```

#### Step 8: Generate Reports

```javascript
console.log('\n📄 Step 7: Generating Reports');

// Generate executive summary (Markdown)
const executiveSummary = `
# Competitor Analysis Report

**Date**: ${new Date().toISOString().split('T')[0]}
**Keyword**: ${input.keyword || 'N/A'}
**Your Site**: ${input.yourSite || 'N/A'}
**Competitors Analyzed**: ${competitorProfiles.length}

## Executive Summary

${yourProfile ? `
### Your Performance
- **Health Score**: ${yourProfile.technical.healthScore}/100
- **Avg Word Count**: ${yourProfile.content.avgWordCount} words
- **Schema Coverage**: ${yourProfile.schema.schemaPercentage}%
- **Alt Text Coverage**: ${yourProfile.images.altTextCoverage}%
` : ''}

### Competitive Landscape
- **Average Competitor Health Score**: ${calculateAverage(competitorProfiles, 'technical.healthScore')}/100
- **Average Content Length**: ${Math.round(calculateAverage(competitorProfiles, 'content.avgWordCount'))} words
- **Average Schema Coverage**: ${Math.round(calculateAverage(competitorProfiles, 'schema.schemaPercentage'))}%

### Key Findings

${comparison.competitiveGaps.length > 0 ? `
#### Competitive Gaps (${comparison.competitiveGaps.length})
${comparison.competitiveGaps.slice(0, 5).map((gap, i) => `
${i + 1}. **${gap.metric}**: You're ${gap.gap} behind competitors (Priority: ${gap.priority})
`).join('')}
` : ''}

${comparison.competitiveAdvantages.length > 0 ? `
#### Competitive Advantages (${comparison.competitiveAdvantages.length})
${comparison.competitiveAdvantages.map((adv, i) => `
${i + 1}. **${adv.metric}**: ${adv.advantage}
`).join('')}
` : ''}

## Top Recommendations

${recommendations.recommendations.slice(0, 10).map((rec, i) => `
### ${i + 1}. ${rec.title} [${rec.priority.toUpperCase()}]

**Impact**: ${rec.impact}/10 | **Effort**: ${rec.effort} | **Timeframe**: ${rec.estimatedTimeframe}

${rec.description}

---
`).join('')}

## Competitor Profiles

${competitorProfiles.map((comp, i) => `
### ${i + 1}. ${comp.domain}

- **SERP Position**: ${comp.serpPosition || 'N/A'}
- **Health Score**: ${comp.technical.healthScore}/100
- **Avg Word Count**: ${comp.content.avgWordCount} words
- **Schema Coverage**: ${comp.schema.schemaPercentage}%
- **Pages Analyzed**: ${comp.topPages.length}

**Top Content**:
${comp.topPages.slice(0, 5).map(page => `- ${page.title} (${page.wordCount} words)`).join('\n')}

---
`).join('')}

## Next Steps

1. Review high-priority recommendations
2. Create content plan for identified gaps
3. Implement technical optimizations
4. Monitor competitor changes (re-run analysis quarterly)

---
*Generated by HubSpot SEO Competitor Analyzer v1.0.0*
`;

Write(`${config.outputDir}/executive-summary.md`, executiveSummary);

// Generate CSV export (if requested)
if (input.exportCsv) {
  const csv = generateCompetitorCSV(competitorProfiles, yourProfile);
  Write(`${config.outputDir}/competitor-comparison.csv`, csv);
}

console.log(`   ✅ Reports generated`);
console.log(`   📂 Output directory: ${config.outputDir}`);
```

#### Step 9: Present Results to User

```javascript
console.log('\n✅ Competitor Analysis Complete!');
console.log('\n' + '='.repeat(60));
console.log('COMPETITOR ANALYSIS SUMMARY');
console.log('='.repeat(60));

if (yourProfile) {
  console.log(`\nYour Site: ${yourProfile.domain}`);
  console.log(`Health Score: ${yourProfile.technical.healthScore}/100`);
}

console.log(`\nCompetitors Analyzed: ${competitorProfiles.length}`);
competitorProfiles.forEach((comp, i) => {
  console.log(`${i + 1}. ${comp.domain} - Health: ${comp.technical.healthScore}/100, Position: ${comp.serpPosition || 'N/A'}`);
});

if (comparison.competitiveGaps.length > 0) {
  console.log(`\n🚨 Competitive Gaps: ${comparison.competitiveGaps.length}`);
  comparison.competitiveGaps.slice(0, 3).forEach(gap => {
    console.log(`   - ${gap.metric}: ${gap.gap} behind average`);
  });
}

if (comparison.competitiveAdvantages.length > 0) {
  console.log(`\n✨ Competitive Advantages: ${comparison.competitiveAdvantages.length}`);
  comparison.competitiveAdvantages.slice(0, 3).forEach(adv => {
    console.log(`   - ${adv.metric}`);
  });
}

console.log(`\n💡 Top Recommendations:`);
recommendations.recommendations.slice(0, 5).forEach((rec, i) => {
  console.log(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title} (Impact: ${rec.impact}/10)`);
});

console.log(`\n📄 Reports:`);
console.log(`   - ${config.outputDir}/executive-summary.md`);
console.log(`   - ${config.outputDir}/competitor-profiles.json`);
console.log(`   - ${config.outputDir}/competitive-comparison.json`);
console.log(`   - ${config.outputDir}/recommendations.json`);

// Offer next actions
console.log('\n💡 What would you like to do next?');
console.log('   1. Deep-dive into specific competitor');
console.log('   2. Generate content plan from gaps');
console.log('   3. Create Asana tasks for recommendations');
console.log('   4. Export data to spreadsheet');
```

## Helper Functions

### Calculate Average

```javascript
function calculateAverage(data, path) {
  const values = extractValues(data, path).filter(v => v !== null && !isNaN(v));
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
```

### Calculate Percentage

```javascript
function calculatePercentage(data, path) {
  const values = extractValues(data, path);
  const trueCount = values.filter(v => v === true).length;
  return Math.round((trueCount / values.length) * 100);
}
```

### Extract Values from Path

```javascript
function extractValues(data, path) {
  return data.map(item => {
    const keys = path.split('.');
    let value = item;
    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) return null;
    }
    return value;
  }).filter(v => v !== null);
}
```

## Error Handling

### Common Errors

1. **Competitor site inaccessible**
   - Skip competitor and continue with others
   - Log warning in report

2. **SERP data unavailable**
   - Fall back to manual competitor URL
   - Suggest using direct competitor URLs

3. **Rate limiting**
   - Implement exponential backoff
   - Reduce concurrent requests

4. **Invalid comparison**
   - Validate domains are comparable
   - Check for redirects/parked domains

## Output Files

### Standard Output Structure

```
./competitor-analysis/
├── executive-summary.md           # Human-readable summary
├── competitor-profiles.json       # Detailed competitor data
├── competitive-comparison.json    # Benchmarking data
├── content-gaps.json              # Content gap analysis
├── recommendations.json           # Actionable recommendations
├── competitor-comparison.csv      # Spreadsheet export (optional)
├── your-site-profile.json         # Your site data
├── your-site-crawl.json           # Raw crawl data
└── [competitor]-crawl.json        # Raw crawl data per competitor
```

## Performance Considerations

- **Analysis Time**: 2-5 minutes per competitor (depends on site size)
- **Total Time**: 10-30 minutes for 5 competitors
- **Caching**: SERP data cached for 24 hours, crawl data for 7 days
- **Optimization**: Crawl fewer pages per site for faster results (--max-pages 10)

## Best Practices

1. **Start with 3-5 competitors** for manageable analysis
2. **Re-run quarterly** to track competitive changes
3. **Focus on high-priority gaps** first
4. **Combine with keyword research** for comprehensive strategy
5. **Use content gaps** to inform content calendar

## Version History

- **v1.0.0** (2025-11-14): Initial release
  - Competitor discovery from SERP
  - Multi-competitor crawling
  - Comparative analysis
  - Content gap identification
  - Strategic recommendations

model: opus
---

**Agent Type**: Orchestrator
**Complexity**: High
**Delegation**: Heavy (leverages Phase 1 & Phase 2 infrastructure)
**Output**: Multi-format reports (JSON, Markdown, CSV)
