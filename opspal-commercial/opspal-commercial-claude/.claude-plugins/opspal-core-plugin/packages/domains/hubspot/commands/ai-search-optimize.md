---
description: Complete AI search optimization workflow - generate schema, optimize content, and deploy to HubSpot
argument-hint: "<url> [--deploy] [--portal-id <id>] [--dry-run] [--staged] [--focus <types>]"
---

# AI Search Optimize Command

**Command**: `/ai-search-optimize`

**Purpose**: Complete AI search optimization workflow - generates schema, optimizes content, and optionally deploys to HubSpot in a single command.

## Usage

### Basic Optimization (Generate Only)

```bash
/ai-search-optimize https://example.com
```

Generates schema and content optimizations, saves locally, does NOT deploy.

**Output**:
- `example-com-schema.json` - Schema markup
- `example-com-content.json` - Content optimizations
- `example-com-report.md` - Summary report

### Full Workflow (Generate + Deploy)

```bash
/ai-search-optimize https://example.com --deploy --portal-id 12345
```

Generates optimizations AND deploys to HubSpot with backup.

### Dry Run (Preview Changes)

```bash
/ai-search-optimize https://example.com --deploy --portal-id 12345 --dry-run
```

Shows what would be deployed without making changes.

### Staged Deployment (10% → 100%)

```bash
/ai-search-optimize https://example.com --deploy --portal-id 12345 --staged
```

Deploys to 10% of pages first for testing.

### Focus on Specific Optimizations

```bash
/ai-search-optimize https://example.com --focus schema,tldr,faq
```

Generate only schema, TL;DR, and FAQ (skip other optimizations).

### Batch Processing

```bash
/ai-search-optimize crawl-results.json --batch --output ./optimizations/
```

Process multiple URLs from crawl data.

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--deploy` | Deploy to HubSpot after generation | `false` |
| `--portal-id <id>` | HubSpot portal ID (required if --deploy) | None |
| `--dry-run` | Preview changes without deploying | `false` |
| `--staged` | Deploy to 10% first (requires --deploy) | `false` |
| `--focus <types>` | Comma-separated optimization types | `all` |
| `--output <dir>` | Output directory for results | `./` |
| `--format <type>` | Output format: `json`, `text`, `both` | `both` |
| `--batch` | Process multiple URLs from JSON file | `false` |
| `--schema-types <types>` | Comma-separated schema types | Auto-detect |
| `--validate-only` | Run validation checks only | `false` |

## Optimization Types (--focus)

| Type | Generates | GEO Impact |
|------|-----------|-----------|
| `schema` | JSON-LD schema markup (7 types) | +25 points (Entity Markup) |
| `tldr` | 40-60 word page summary | +20 points (Structured Content) |
| `answerBlocks` | 40-60 word Q&A blocks | +40 points (Answer Blocks) |
| `faq` | FAQ section with schema | +15 points (Structured Content) |
| `qa` | Question-answer pairs | +10 points (Answer Blocks) |
| `citations` | Author, dates, sources | +10 points (Citation Readiness) |
| `voiceSearch` | Conversational Q&A | +5 points (Voice Search Ready) |
| `robots` | AI crawler rules | +25 points (AI Crawler Access) |

**Default**: All types (`schema,tldr,answerBlocks,faq,qa,citations,voiceSearch,robots`)

## Workflow Steps

### Step 1: URL Analysis
- Fetches page content
- Analyzes structure (headings, paragraphs, questions)
- Detects existing optimizations
- Estimates completion time

### Step 2: Schema Generation
- Auto-detects appropriate schema types
- Extracts company data, author info, etc.
- Validates schema before output
- Saves to `{site}-schema.json`

**Schema Types Auto-Detected**:
- Homepage → Organization + WebSite
- Blog post → Article + BreadcrumbList
- FAQ page → FAQPage
- Team member → Person
- Tutorial → HowTo

### Step 3: Content Optimization
- Generates TL;DR (40-60 words)
- Extracts answer blocks from content
- Creates FAQ section from Q&A patterns
- Validates word counts
- Saves to `{site}-content.json`

### Step 4: Deployment (if --deploy)
- Creates backup of current state
- Deploys schema to site header
- Updates robots.txt with AI crawler rules
- Deploys content optimizations
- Validates deployment
- Saves deployment record with rollback ID

### Step 5: Validation & Report
- Validates all generated content
- Calculates projected GEO score improvement
- Generates summary report
- Provides next steps

## Output Structure

### Generated Files

**Schema Output** (`example-com-schema.json`):
```json
{
  "url": "https://example.com",
  "generatedAt": "2025-11-15T10:30:00.000Z",
  "schemas": [
    {
      "type": "Organization",
      "schema": { "@context": "https://schema.org", "@type": "Organization", ... },
      "validation": "valid",
      "issues": []
    }
  ]
}
```

**Content Output** (`example-com-content.json`):
```json
{
  "url": "https://example.com",
  "optimizedAt": "2025-11-15T10:30:00.000Z",
  "optimizations": {
    "tldr": {
      "text": "...",
      "wordCount": 52,
      "html": "<div class=\"tldr-section\">...</div>",
      "placement": "After hero section"
    },
    "answerBlocks": {
      "blocks": [{ "question": "...", "answer": "...", "wordCount": 55 }],
      "count": 5
    },
    "faq": {
      "items": [{ "question": "...", "answer": "...", "wordCount": 48 }],
      "count": 7,
      "html": "<div class=\"faq-section\">...</div>",
      "schema": { "@type": "FAQPage", ... }
    }
  },
  "stats": {
    "improvements": {
      "structuredContent": 20,
      "answerBlocks": 40,
      "citationReadiness": 10,
      "overall": 23
    }
  }
}
```

**Report Output** (`example-com-report.md`):
```markdown
# AI Search Optimization Report

**URL**: https://example.com
**Generated**: 2025-11-15 10:30:00
**Duration**: 12 seconds

## Summary

✅ Schema generated: 2 schemas (Organization, WebSite)
✅ Content optimized: TL;DR, 5 answer blocks, 7 FAQ items
✅ Projected GEO improvement: +25 points (40 → 65/100)

## Next Steps

1. Review generated content for accuracy
2. Deploy to HubSpot (run with --deploy flag)
3. Verify schema at https://search.google.com/test/rich-results
4. Monitor GEO score improvement
```

## Real-World Examples

### Example 1: Homepage Optimization

**Command**:
```bash
/ai-search-optimize https://gorevpal.com --focus schema,tldr,answerBlocks
```

**Output**:
- Organization schema with company info, logo, social links
- WebSite schema with search action
- TL;DR: 52-word summary of RevPal
- 5 answer blocks for key questions
- Projected improvement: +30 points (25 → 55/100)

**Time**: 8 seconds

---

### Example 2: Blog Post with FAQ

**Command**:
```bash
/ai-search-optimize https://gorevpal.com/blog/what-is-revops --focus faq,citations
```

**Output**:
- Article schema with author, dates, publisher
- FAQ section with 8 Q&A pairs
- FAQPage schema
- Citation improvements (author metadata)
- Projected improvement: +20 points

**Time**: 6 seconds

---

### Example 3: Full Deployment

**Command**:
```bash
/ai-search-optimize https://gorevpal.com --deploy --portal-id 12345 --staged
```

**Workflow**:
1. Generates schema and content (10 seconds)
2. Creates backup of current HubSpot state (5 seconds)
3. Deploys to 10% of pages (2 minutes)
4. Provides manual instructions for schema and robots.txt
5. Generates deployment ID for rollback: `dep-1699123456-abc123`

**Output**:
- All generated files
- Deployment record: `.hubspot-backups/deployment-dep-1699123456-abc123.json`
- Manual instructions: `.hubspot-backups/schema-instructions-1699123456.txt`
- Manual instructions: `.hubspot-backups/robots-instructions-1699123456.txt`

**Manual Steps Required**:
- Add schema to HubSpot Site Header HTML (5 min)
- Add AI crawler rules to robots.txt (5 min)

**Total Time**: ~15 minutes (10 min automated, 5 min manual)

---

### Example 4: Batch Processing Service Pages

**Command**:
```bash
/ai-search-optimize service-pages-crawl.json --batch --output ./service-optimizations/ --focus tldr,answerBlocks
```

**Input** (`service-pages-crawl.json`):
```json
{
  "urls": [
    "https://gorevpal.com/services/revops",
    "https://gorevpal.com/services/salesforce",
    "https://gorevpal.com/services/hubspot"
  ]
}
```

**Output**:
- `./service-optimizations/revops-schema.json`
- `./service-optimizations/revops-content.json`
- `./service-optimizations/salesforce-schema.json`
- `./service-optimizations/salesforce-content.json`
- `./service-optimizations/hubspot-schema.json`
- `./service-optimizations/hubspot-content.json`
- `./service-optimizations/batch-report.md`

**Time**: ~30 seconds (3 URLs × 10 seconds each)

---

### Example 5: Validate Before Deploy

**Command**:
```bash
/ai-search-optimize https://gorevpal.com --validate-only
```

**Output**:
```
Validation Report
-----------------
✅ URL accessible (200 OK)
✅ Sufficient content for optimization (1,250 words)
✅ 8 headings found
✅ 5 questions detected
⚠️  Existing TL;DR section found (will skip)
⚠️  No FAQ section (recommended for GEO +15 points)
✅ Ready for optimization

Recommendations:
- Generate FAQ section (+15 points)
- Add answer blocks (+40 points)
- Deploy schema markup (+25 points)

Projected improvement: 25 → 80/100
```

**Time**: 2 seconds

---

## Integration with Phase 3.1 GEO Validator

**Complete workflow**:

```bash
# Step 1: Validate current state
/seo-audit https://gorevpal.com

# Output: GEO Score 25/100
# - AI Crawler Access: 0/100 (missing robots.txt rules)
# - Entity Markup: 0/100 (no schema)
# - Structured Content: 60/100 (basic headings)
# - Answer Blocks: 30/100 (some Q&A but not optimized)
# - Citation Readiness: 65/100 (author but incomplete)

# Step 2: Generate optimizations
/ai-search-optimize https://gorevpal.com

# Output: Generated schema and content

# Step 3: Deploy optimizations
/ai-search-optimize https://gorevpal.com --deploy --portal-id 12345

# Output: Deployed with backup ID dep-1699123456-abc123

# Step 4: Validate improvement (after manual steps complete)
/seo-audit https://gorevpal.com

# Output: GEO Score 82/100
# - AI Crawler Access: 100/100 (robots.txt updated)
# - Entity Markup: 80/100 (Organization + WebSite schema)
# - Structured Content: 85/100 (TL;DR + FAQ)
# - Answer Blocks: 75/100 (5 optimized answer blocks)
# - Citation Readiness: 70/100 (complete author metadata)
```

## Error Handling

### Error: "HTTP 301 - Please use final URL"

**Cause**: URL redirects to another URL

**Solution**:
```bash
# Wrong:
/ai-search-optimize https://www.gorevpal.com

# Right (use final URL after redirect):
/ai-search-optimize https://gorevpal.com
```

---

### Error: "Insufficient content for optimization"

**Cause**: Page has < 200 words

**Solution**:
- Add more content to page
- Use --focus flag to generate only schema
- Skip content optimization for thin pages

---

### Error: "HubSpot API key required for deployment"

**Cause**: HUBSPOT_API_KEY environment variable not set

**Solution**:
```bash
export HUBSPOT_API_KEY="your-api-key-here"
/ai-search-optimize https://example.com --deploy --portal-id 12345
```

---

### Warning: "Page already has TL;DR section"

**Cause**: Existing TL;DR detected

**Result**: TL;DR generation skipped automatically

**Action**: Review existing TL;DR for quality, no action needed

---

### Warning: "Manual step required: schema deployment"

**Cause**: HubSpot doesn't provide API for site header HTML

**Result**: Manual instructions generated

**Action**: Follow instructions in `.hubspot-backups/schema-instructions-{timestamp}.txt`

---

## Implementation Details

### Agents Invoked

This command coordinates 3 specialized agents:

1. **hubspot-schema-automation-agent**
   - Generates and validates schema markup
   - Auto-detects schema types from URL patterns
   - Outputs JSON-LD format

2. **hubspot-content-automation-agent**
   - Generates TL;DR, answer blocks, FAQ
   - Validates word counts
   - Outputs HTML + Schema

3. **hubspot-seo-deployment-agent** (if --deploy)
   - Creates backup before changes
   - Deploys schema, robots.txt, content
   - Provides rollback capability

### Scripts Called

```javascript
// Step 1: Schema generation
const schemaResults = await executeScript(
  '.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/seo-schema-generator.js',
  [url, '--format', 'json', '--output', schemaPath]
);

// Step 2: Content optimization
const contentResults = await executeScript(
  '.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/seo-content-optimizer.js',
  [url, '--generate-all', '--format', 'json', '--output', contentPath]
);

// Step 3: Deployment (if --deploy flag)
if (deployFlag) {
  const deployResults = await executeScript(
    '.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/seo-hubspot-deployer.js',
    ['--portal-id', portalId, '--deploy-schema', schemaPath, '--deploy-content', contentPath]
  );
}
```

## Performance Notes

- **Schema generation**: 2-5 seconds per URL
- **Content optimization**: 3-8 seconds per URL
- **Deployment**: 1-2 minutes for 10 pages
- **Batch processing**: ~10 seconds per URL
- **Total (generate only)**: 5-15 seconds
- **Total (generate + deploy)**: 2-5 minutes + manual steps (10 min)

## Best Practices

### Before Running

1. **Validate current state**: Run `/seo-audit` first to understand gaps
2. **Review content**: Ensure page has sufficient content (200+ words)
3. **Check accessibility**: Verify URL returns 200 OK
4. **Set environment**: Ensure HUBSPOT_API_KEY is set if deploying

### After Generation

1. **Review generated content**: Check TL;DR, answer blocks, FAQ for accuracy
2. **Validate schema**: Use Google Rich Results Test (https://search.google.com/test/rich-results)
3. **Edit if needed**: Adjust for brand voice and accuracy
4. **Test before deploy**: Use --dry-run flag first

### After Deployment

1. **Complete manual steps**: Follow schema and robots.txt instructions
2. **Verify deployment**: Check site header HTML and robots.txt
3. **Validate schema**: Re-run Rich Results Test
4. **Monitor**: Track GEO score improvement over 2-4 weeks
5. **Save deployment ID**: Keep for rollback if needed

### Rollback (if needed)

```bash
# If deployment causes issues
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/seo-hubspot-deployer.js \
  --portal-id 12345 \
  --rollback dep-1699123456-abc123
```

## Future Enhancements (Phase 4.1)

1. **HubSpot CLI integration**: Eliminate manual steps
2. **Content API automation**: Programmatic page updates
3. **Real-time validation**: Live schema and GEO checks
4. **AI crawler simulation**: Test how AI sees your content
5. **Competitive analysis**: Compare against competitors
6. **Multi-portal support**: Deploy to multiple HubSpot portals

## Related Commands

- `/seo-audit` - Validate current GEO score (Phase 3.1)
- `/deploy-ai-seo` - Deploy-only command (no generation)
- `/hubspot-workflow` - HubSpot workflow operations

## Related Documentation

- **Phase 4 Plan**: `PHASE4_AI_SEARCH_OPTIMIZATION_PLAN.md`
- **Schema Agent**: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/agents/hubspot-schema-automation-agent.md`
- **Content Agent**: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/agents/hubspot-content-automation-agent.md`
- **Deployment Agent**: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/agents/hubspot-seo-deployment-agent.md`
- **GEO Validator**: `.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/seo-geo-validator.js`

---

**Status**: Phase 4.0 MVP - Production Ready (with manual steps for schema and robots.txt)
**Dependencies**: Node.js 18+, HubSpot API key (if deploying)
**Testing**: Validated with 10+ real websites
**Limitation**: Schema and robots.txt require manual HubSpot UI steps until Phase 4.1
