---
name: optimize-content
description: Focused content optimization for single pages or new content planning. Analyzes content quality, AEO opportunities, readability, and generates optimization recommendations.
argument-hint: "--url <url> --keyword <keyword> [--format detailed|html] [--file <path>] [--generate-brief]"
stage: production
version: 1.0.0
---

# Optimize Content Command

Performs focused content optimization analysis for single pages or generates content briefs for new content. Part of Phase 3: Content Optimization & AEO.

## Usage

### Analyze Existing Page
```bash
/optimize-content --url https://example.com/page --keyword "target keyword"
/optimize-content --url https://example.com/page --keyword "revenue operations" --format detailed
```

### Compare to Competitors
```bash
/optimize-content --url https://example.com/page \
  --keyword "target keyword" \
  --competitors https://comp1.com/similar,https://comp2.com/similar
```

### Generate Content Brief for New Page
```bash
/optimize-content --generate-brief \
  --topic "how to implement revenue operations" \
  --competitors https://comp1.com/guide,https://comp2.com/guide \
  --keyword "revenue operations implementation"
```

### File-Based Analysis
```bash
/optimize-content --file ./content.html --keyword "target keyword" --format html
/optimize-content --file ./draft.md --keyword "target keyword" --format markdown
```

## Parameters

### Required (choose one)
- `--url <url>` - URL of page to optimize
- `--file <path>` - Local file path for content analysis
- `--generate-brief` - Generate content brief for new content (requires --topic)

### Optional - Analysis Configuration
- `--keyword <keyword>` - Target keyword for optimization
- `--competitors <urls>` - Comma-separated competitor URLs for comparison
- `--format <html|markdown|text>` - Input format for file analysis (default: html)
- `--analysis-type <quick|detailed|comprehensive>` - Analysis depth (default: detailed)

### Optional - Focus Areas
- `--focus-aeo` - Focus on Answer Engine Optimization opportunities
- `--focus-readability` - Focus on readability improvements
- `--focus-depth` - Focus on content depth and comprehensiveness
- `--focus-engagement` - Focus on engagement factors

### Optional - Content Brief Generation
- `--topic <topic>` - Topic for new content brief (required with --generate-brief)
- `--target-length <words>` - Target word count for content
- `--audience <description>` - Target audience description

### Optional - Output Configuration
- `--output <path>` - Output directory (default: ./content-optimization)
- `--brief-format <markdown|json>` - Content brief format (default: markdown)
- `--include-examples` - Include competitor examples in report

## Analysis Types

### Quick Analysis (30-60 seconds)
- Content quality score (overall)
- Key readability metrics
- Top 3 recommendations
- Suitable for rapid content reviews

### Detailed Analysis (1-2 minutes)
- Full 6-dimensional content scoring
- Comprehensive readability analysis
- AEO opportunity identification
- Specific improvement recommendations
- Default for most use cases

### Comprehensive Analysis (2-3 minutes)
- Everything in Detailed
- Competitor content comparison
- Internal linking suggestions
- Detailed content brief with sections
- Best for strategic content planning

## Workflow

### Existing Page Optimization

1. **Content Extraction**
   - Fetch page content
   - Parse HTML/Markdown
   - Extract metadata

2. **Quality Analysis**
   - Score 6 dimensions (Readability, Depth, SEO, Engagement, E-E-A-T, Technical)
   - Calculate grade level
   - Identify strengths/weaknesses

3. **Readability Analysis**
   - Multiple readability metrics
   - Sentence/paragraph complexity
   - Passive voice detection
   - Transition word usage
   - Vocabulary difficulty

4. **AEO Analysis**
   - Featured snippet opportunities
   - People Also Ask questions
   - Schema recommendations
   - Answer quality scoring

5. **Competitor Comparison** (if URLs provided)
   - Benchmark against competitors
   - Identify content gaps
   - Extract best practices

6. **Recommendations**
   - Prioritized improvements
   - Specific actions with impact scores
   - Expected results

### New Content Brief Generation

1. **Competitor Research**
   - Analyze competitor content
   - Extract common elements
   - Identify gaps and opportunities

2. **Content Planning**
   - Suggest optimal length
   - Recommend sections/structure
   - Identify required elements

3. **Keyword Strategy**
   - Primary keyword integration
   - Secondary keyword suggestions
   - LSI keyword recommendations

4. **Brief Generation**
   - Detailed writing instructions
   - Required sections
   - Image/example requirements
   - Target snippet format
   - Internal linking suggestions

## Output Files

### For Page Optimization
```
<output-dir>/
├── content-score.json              # 6-dimensional quality scores
├── readability-report.json         # Detailed readability metrics
├── aeo-opportunities.json          # Featured snippet opportunities
├── optimization-brief.md           # Actionable recommendations
└── competitor-comparison.json      # Benchmarking (if --competitors used)
```

### For Content Brief Generation
```
<output-dir>/
├── content-brief.md                # Detailed writing brief
├── competitor-analysis.json        # Competitor content breakdown
├── keyword-strategy.json           # Primary/secondary/LSI keywords
└── structure-template.md           # Suggested outline with placeholders
```

## Examples

### Example 1: Quick Page Review
```bash
/optimize-content --url https://mysite.com/blog/post --keyword "seo tools" --analysis-type quick
```

**What happens:**
1. Analyzes content quality
2. Scores readability
3. Provides top 3 improvements

**Time:** 30-60 seconds

**Output:**
```
✅ Content Optimization Complete

Overall Score: 72/100 (Good)
Readability Grade: 9.5 (Accessible)

Top 3 Recommendations:
1. [HIGH] Add 3-5 images to improve engagement (+8 points)
2. [HIGH] Optimize for "what is" featured snippet (+6 points)
3. [MEDIUM] Shorten 5 long sentences for better readability (+4 points)
```

---

### Example 2: Detailed Optimization with Competitor Comparison
```bash
/optimize-content --url https://mysite.com/guide \
  --keyword "marketing automation" \
  --competitors https://comp1.com/guide,https://comp2.com/guide \
  --analysis-type detailed
```

**What happens:**
1. Full content quality analysis
2. Comprehensive readability metrics
3. AEO opportunity identification
4. Competitor content comparison
5. Detailed improvement plan

**Time:** 2-3 minutes

**Output:**
```
✅ Content Optimization Analysis

Your Content: https://mysite.com/guide
Overall Score: 68/100 (Good)

Dimension Breakdown:
- Readability: 75/100 (Good) - Grade 8.5
- Depth: 65/100 (Fair) - 1,800 words (competitors avg: 2,500)
- SEO: 70/100 (Good) - Keyword usage appropriate
- Engagement: 60/100 (Fair) - Missing lists and examples
- E-E-A-T: 55/100 (Needs Work) - No author info
- Technical: 80/100 (Very Good)

Competitor Comparison:
- Competitor 1: 78/100 (2,500 words, 8 images, strong structure)
- Competitor 2: 75/100 (2,200 words, 6 images, good examples)

Your Gaps:
1. Content 700 words shorter than competitors
2. Missing step-by-step format (competitors use numbered lists)
3. No author bio or credentials
4. Fewer images (3 vs avg 7)

AEO Opportunities:
1. Featured snippet potential for "what is marketing automation"
   - Current: Paragraph format (150 words)
   - Recommended: Concise paragraph (40-60 words)
   - Opportunity: 8.5/10

2. PAA question: "How does marketing automation work?"
   - Answered: Yes, but could be more direct
   - Quality: 6/10
   - Improvement: Add H2 with this exact question

Top 5 Recommendations:
1. [HIGH] Expand content from 1,800 to 2,500 words (+15 point impact)
2. [HIGH] Add 4 more images with detailed captions (+10 point impact)
3. [HIGH] Optimize introduction for featured snippet (+8 point impact)
4. [MEDIUM] Add author bio with credentials (+7 point impact)
5. [MEDIUM] Convert key points to numbered lists (+6 point impact)

Estimated Impact: 68 → 83 (+15 points)
Estimated Effort: 6-8 hours

Full reports saved to: ./content-optimization/
```

---

### Example 3: Generate Content Brief for New Page
```bash
/optimize-content --generate-brief \
  --topic "How to Build a Revenue Operations Team" \
  --keyword "revenue operations team" \
  --competitors https://comp1.com/revops-team,https://comp2.com/guide \
  --target-length 2500
```

**What happens:**
1. Analyzes 2 competitor pages
2. Extracts common elements and best practices
3. Identifies content gaps
4. Generates detailed writing brief

**Time:** 2 minutes

**Output:**
```
✅ Content Brief Generated

Topic: How to Build a Revenue Operations Team
Primary Keyword: "revenue operations team"
Target Length: 2,500 words
Target Audience: B2B executives and operations leaders

Competitor Analysis:
- Comp 1: 2,800 words, step-by-step format, 7 images, HowTo schema
- Comp 2: 2,300 words, guide format, 5 images, examples
- Common Elements: Team structure diagrams, role definitions, implementation timeline

Recommended Structure:
1. Introduction (200 words)
   - Define revenue operations
   - Why teams are critical
   - Hook: "Companies with RevOps teams see 19% faster revenue growth"

2. What is a Revenue Operations Team? (300 words)
   - Definition
   - Key responsibilities
   - How it differs from sales ops

3. Core Roles in a RevOps Team (600 words)
   - RevOps Leader/Director
   - Revenue Analyst
   - Systems Administrator
   - Revenue Enablement Specialist
   [For each: responsibilities, skills, when to hire]

4. How to Build Your RevOps Team (800 words)
   - Step 1: Assess current state
   - Step 2: Define objectives
   - Step 3: Determine team structure
   - Step 4: Hire key roles (in order)
   - Step 5: Implement systems
   [Each step with detailed sub-points]

5. Team Structure Examples (400 words)
   - Startup (1-50 employees): Lean structure
   - Mid-market (50-500): Core team
   - Enterprise (500+): Full department

6. FAQ (200 words)
   - When should we hire a RevOps leader?
   - What's the average RevOps team size?
   - How much does a RevOps team cost?

Required Elements:
- 8-10 images (team structure diagrams, flowcharts, org charts)
- 3-5 real-world examples
- Comparison table (team structures by company size)
- Downloadable: RevOps team hiring checklist
- Internal links to: RevOps definition, CRM setup, data governance

SEO Requirements:
- Primary keyword in H1, intro, first H2
- Secondary keywords: "revops structure", "revenue operations roles", "building revops"
- LSI keywords: "sales operations", "marketing operations", "customer success", "revenue growth"
- Target snippet: Numbered list for "Steps to Build RevOps Team"
- Schema: HowTo with 5 steps

AEO Optimization:
- Format step-by-step as numbered list
- Use exact H2: "How to Build a Revenue Operations Team"
- Add FAQ section for PAA questions
- Keep answers concise (40-60 words for featured snippets)

Tone & Style:
- Professional but accessible
- Use second person ("you", "your")
- Include data points and statistics
- Avoid jargon, define technical terms

Expected Outcomes:
- Target featured snippet for "how to build revenue operations team"
- Rank for 5-10 related long-tail keywords
- Engagement: 7-10 minute read time
- Grade level: 9-10 (business professionals)

Content brief saved to: ./content-optimization/content-brief-revenue-operations-team.md
```

---

### Example 4: Focus on AEO Optimization
```bash
/optimize-content --url https://mysite.com/page \
  --keyword "what is crm" \
  --focus-aeo \
  --include-examples
```

**What happens:**
1. Analyzes current content
2. Identifies featured snippet opportunities
3. Analyzes PAA questions
4. Recommends schema markup
5. Provides rewrite examples

**Time:** 1-2 minutes

**Output:**
```
✅ AEO Optimization Analysis

Page: https://mysite.com/page
Keyword: "what is crm"
AEO Score: 42/100 (Needs Improvement)

Featured Snippet Opportunities:

1. Definition Snippet (High Priority)
   Current format: Long paragraph (180 words)
   Recommended: Concise definition (30-50 words)
   Opportunity: 9/10

   Current:
   "Customer Relationship Management (CRM) is a technology for managing
   all your company's relationships and interactions with customers and
   potential customers. The goal is simple: Improve business relationships
   to grow your business. A CRM system helps companies stay connected to
   customers, streamline processes, and improve profitability... [continues]"

   Recommended:
   "CRM (Customer Relationship Management) is software that manages all
   customer interactions, sales processes, and data in one centralized
   system. It helps businesses track leads, improve customer relationships,
   and increase sales efficiency."

2. List Snippet - "CRM Features"
   Current: Features mentioned in paragraphs
   Recommended: Numbered list with H2 "Key CRM Features"
   Opportunity: 7.5/10

People Also Ask Questions:

1. "How does CRM software work?"
   - Currently answered: Yes (paragraph format)
   - Answer quality: 5/10 (too technical)
   - Improvement: Add H2 with this question, simplify answer

2. "What are the benefits of CRM?"
   - Currently answered: Partially
   - Answer quality: 4/10 (buried in text)
   - Improvement: Create dedicated H2 section with bullet list

3. "How much does CRM cost?"
   - Currently answered: No
   - Recommendation: Add pricing section

Schema Recommendations:

1. DefinedTerm Schema (High Priority)
   For the "What is CRM" definition
   Impact: Eligible for definition rich snippets

2. FAQPage Schema (Medium Priority)
   For PAA questions section
   Impact: Expandable FAQ in search results

Quick Wins (< 1 hour):
1. Rewrite opening paragraph to 40-60 words
2. Add H2 "How Does CRM Work?" with simplified answer
3. Convert features to numbered list under H2

Medium Effort (2-3 hours):
1. Add FAQ section addressing all 3 PAA questions
2. Implement DefinedTerm schema
3. Create comparison table for featured snippet

Expected Results:
- 60% chance of capturing featured snippet
- Improved visibility for 3 PAA questions
- Better click-through rate from search results

Detailed examples saved to: ./content-optimization/aeo-recommendations.md
```

---

## Agent Routing

This command always routes to:

```yaml
Agent: hubspot-seo-content-optimizer
Trigger: Always
Mode: Single-page focused optimization
Features: Content scoring, readability analysis, AEO optimization, competitor comparison, brief generation
```

## Performance Expectations

| Scenario | Analysis Type | Competitors | Time |
|----------|---------------|-------------|------|
| Quick review | quick | 0 | 30-60 seconds |
| Detailed analysis | detailed | 0 | 1-2 minutes |
| With competitors | detailed | 2 | 2-3 minutes |
| Comprehensive | comprehensive | 2-3 | 3-5 minutes |
| Content brief | N/A | 2-3 | 2-3 minutes |

## Tips & Best Practices

### For Accurate Analysis
1. **Provide target keyword**: Essential for SEO and AEO analysis
2. **Compare to similar content**: Use competitor pages targeting same keyword
3. **Specify format**: Helps parser extract content correctly
4. **Focus your analysis**: Use --focus flags for specific areas

### For Actionable Results
1. **Start with detailed analysis**: Best balance of speed and depth
2. **Include competitors**: Provides benchmarking context
3. **Review full reports**: CLI summary is abbreviated
4. **Implement top 3**: Focus on high-impact recommendations first

### For Content Briefs
1. **Analyze 2-3 competitors**: Provides diverse perspective
2. **Specify target length**: Based on competitor average
3. **Define audience**: Helps tailor tone and complexity
4. **Use generated outline**: Starting point for writers

## Common Issues & Solutions

### "Content extraction failed"
- **Solution**: Try different --format option or provide file instead of URL
- **Tip**: Some JavaScript-heavy sites don't parse well

### "Keyword not found in content"
- **Solution**: Verify keyword is actually present or adjust analysis focus
- **Tip**: Analysis works without keyword but recommendations less specific

### "Competitor analysis incomplete"
- **Solution**: Some competitor URLs may not be accessible
- **Tip**: Ensure competitor URLs are similar content type

### "Brief seems generic"
- **Solution**: Provide more competitors and specify --audience
- **Tip**: Better competitor analysis → better briefs

## Related Commands

- `/seo-audit` - Full site audit with content optimization (Phase 1+2+3)
- `/analyze-competitor` - Deep competitor analysis (Phase 2)

## Version History

- **v1.0.0** (Phase 3) - Initial release with focused content optimization

---

**You are an AI assistant processing this command. When user invokes this command:**

1. **Parse parameters** from user input

2. **Determine mode**:
   - Page optimization (`--url` or `--file`)
   - Content brief generation (`--generate-brief`)

3. **Invoke agent** with Task tool:

```javascript
await Task({
  subagent_type: 'hubspot-seo-content-optimizer',
  prompt: `
    ${params.generateBrief ? 'Generate content brief' : 'Optimize existing content'}:

    ${params.url ? `URL: ${params.url}` : ''}
    ${params.file ? `File: ${params.file} (format: ${params.format})` : ''}
    ${params.topic ? `Topic: ${params.topic}` : ''}

    Keyword: ${params.keyword || 'none'}
    Competitors: ${params.competitors || 'none'}
    Analysis type: ${params.analysisType || 'detailed'}

    Focus areas:
    - AEO: ${params.focusAeo || false}
    - Readability: ${params.focusReadability || false}
    - Depth: ${params.focusDepth || false}
    - Engagement: ${params.focusEngagement || false}

    ${params.generateBrief ? `
      Generate detailed content brief with:
      1. Competitor analysis (${params.competitors})
      2. Recommended structure and sections
      3. SEO and AEO requirements
      4. Required elements (images, examples, links)
      5. Keyword strategy
      6. Expected outcomes

      Target length: ${params.targetLength || '2000-2500'} words
      Audience: ${params.audience || 'general business audience'}
    ` : `
      Perform content optimization analysis:
      1. Content quality scoring (6 dimensions)
      2. Readability analysis (multiple metrics)
      3. AEO opportunity identification
      ${params.competitors ? '4. Competitor comparison and benchmarking' : ''}
      5. Prioritized recommendations with impact scores
      6. ${params.analysisType === 'comprehensive' ? 'Detailed improvement brief' : 'Quick action plan'}
    `}

    Output to: ${params.output || './content-optimization'}
  `
});
```

4. **Present results** with clear summary and next steps

---

**Note**: This command is part of Phase 3 (Content Optimization & AEO). For full-site content optimization, use `/seo-audit` with Phase 3 flags.
