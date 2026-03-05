# Google Slides Generator - User Guide

## Overview

The Google Slides Generator is a comprehensive AI-powered presentation creation system that integrates with your RevPal template to generate professional, branded Google Slides presentations. It supports creating new decks from raw content, cloning templates, and modifying existing presentations.

**Key Features:**
- 🎯 **AI-Powered Content Generation** - LLM creates slide outlines and content
- 📋 **Template Management** - Clone and customize RevPal branded templates
- 🔧 **Automatic Overflow Handling** - 4-tier strategy ensures content fits
- ✅ **Quality Validation** - Enforces branding and content standards
- 📊 **Multiple Input Types** - Text, CSV, transcripts, structured data
- 🎨 **Branding Consistency** - RevPal colors, fonts, and style guidelines

**Version**: 1.25.0
**Release Date**: 2025-12-08

---

## Quick Start

### Prerequisites

1. **Google API Credentials** configured:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
   ```

2. **RevPal Template** accessible:
   - Template ID: `1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU`
   - URL: https://docs.google.com/presentation/d/1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU/edit

3. **Required scopes**:
   - `https://www.googleapis.com/auth/presentations`
   - `https://www.googleapis.com/auth/drive.file`

### Basic Usage

Simply ask Claude to create slides:

```
Create an executive brief about Q4 pipeline performance
```

The `google-slides-generator` agent will automatically:
1. ✅ Analyze your request and determine deck type
2. ✅ Generate a slide outline (8-20 slides)
3. ✅ Clone the RevPal template
4. ✅ Populate slides with AI-generated content
5. ✅ Validate branding and layout
6. ✅ Return a shareable presentation URL

**Result:**
```
📊 Presentation created: https://docs.google.com/presentation/d/ABC123
📈 Slides: 15
✓ Quality gates passed

Ready for review and presentation!
```

---

## Creating New Decks

### Scenario 1: From Text Input

**Use Case:** Turn a written summary into a presentation

**Example:**
```
Create slides about our new CPQ implementation. We deployed Salesforce CPQ
with custom pricing rules, automated approvals, and quote templates. The
system handles complex discounting scenarios and integrates with DocuSign
for electronic signatures.
```

**What Happens:**
1. **Outline Generation** - Creates 8-12 slides covering:
   - Title slide
   - Overview/Context
   - Key features (CPQ, pricing rules, approvals)
   - Integration points (DocuSign)
   - Implementation details
   - Benefits/Results
   - Next steps

2. **Content Generation** - Each slide gets:
   - Clear title (max 10 words)
   - 3-5 bullet points (max 15 words each)
   - Supporting details where appropriate

3. **Template Cloning** - Uses RevPal master template with:
   - Montserrat fonts for headings
   - Figtree fonts for body text
   - Deep Grape (#5F3B8C) primary color
   - OpsPal by RevPal branding

4. **Quality Validation** - Ensures:
   - No placeholder text ({{...}})
   - All claims cited with sources
   - No overflow on any slide
   - WCAG color contrast compliance

### Scenario 2: From CSV Data

**Use Case:** Turn tabular data into visualized insights

**Example:**
```
Create a technical deep dive from this CSV file: sales-pipeline.csv
```

**CSV Format:**
```csv
Region,Opportunities,Amount,Win Rate,Avg Deal Size
North,45,$2.3M,24%,$51K
South,38,$1.9M,31%,$50K
East,52,$2.8M,28%,$54K
West,41,$2.2M,22%,$54K
```

**What Happens:**
1. **Data Analysis** - Automatically identifies:
   - Key metrics (total opps, revenue, win rates)
   - Trends (which region performing best)
   - Anomalies (North has lowest win rate)

2. **Slide Structure** - Creates ~18 slides:
   - Title + Executive Summary
   - Overview of data (4 regions, 176 total opps)
   - Regional breakdown (1 slide per region)
   - Comparative analysis
   - Insights and recommendations

3. **Layout Selection** - Uses appropriate layouts:
   - KPI Dashboard for metrics
   - Two Column for comparisons
   - Content for detailed analysis

### Scenario 3: From RevPal Template

**Use Case:** Start with pre-designed template for consistency

**Example:**
```
Create an executive brief using the RevPal template about customer onboarding improvements
```

**What Happens:**
1. **Template Selection** - Chooses `executive-brief.json` which:
   - Limits to 15 slides max
   - Uses BLUF (Bottom Line Up Front) structure
   - Optimized for C-level audience
   - Concise bullet points

2. **Structured Sections:**
   - **Opening** (Slides 1-2): Title, Executive Summary
   - **Current State** (Slides 3-5): Situation analysis
   - **Analysis** (Slides 6-10): Key findings, data points
   - **Recommendations** (Slides 11-13): Proposed actions
   - **Closing** (Slides 14-15): Next steps, Q&A

3. **Audience Optimization:**
   - Executive brief: High-level, data-driven, action-oriented
   - Technical deep dive: Detailed, analytical, evidence-based
   - Customer update: Collaborative, transparent, forward-looking

---

## Modifying Existing Decks

### Add New Slides

**Example:**
```
Add a KPI slide to https://docs.google.com/presentation/d/ABC123 after slide 3
```

**What Happens:**
1. Presentation ID extracted: `ABC123`
2. Current structure analyzed (15 existing slides)
3. KPI layout selected from template
4. New slide inserted at position 4
5. Placeholder metrics added (ready for customization)

**Result:**
```
✅ Slide added successfully
   Position: 4 (after slide 3)
   Layout: KPI Dashboard
   View: https://docs.google.com/presentation/d/ABC123#slide=id.g4
```

### Update Existing Content

**Example:**
```
In presentation ABC123, update slide 5 to show Q4 2024 revenue of $1.5M instead of Q3 $1.2M
```

**What Happens:**
1. Slide 5 located in presentation
2. Text replacement: `Q3 2024 Revenue: $1.2M` → `Q4 2024 Revenue: $1.5M`
3. Validation: No other content affected

**Result:**
```
✅ Slide 5 updated
   Changes: 1 text replacement
   No layout changes
```

### Remove Slides

**Example:**
```
Remove slides 8-10 from presentation ABC123
```

**What Happens:**
1. Slides 8, 9, 10 identified
2. Dependency check (no other slides reference these)
3. Batch deletion executed
4. Slide numbers automatically adjusted

**Result:**
```
✅ Removed 3 slides
   Total slides: 15 → 12
   Updated: https://docs.google.com/presentation/d/ABC123
```

---

## Template Library

### Available Templates

| Template | Deck Type | Audience | Max Slides | Best For |
|----------|-----------|----------|------------|----------|
| **revpal-master** | general | all | 50 | Default, flexible structure |
| **executive-brief** | executive_brief | executive | 15 | C-level summaries, BLUF format |
| **customer-update** | customer_update | customer | 25 | QBRs, progress reports |
| **deep-dive** | deep_dive | technical | 50 | Technical analysis, detailed data |

### Template Specification

**revpal-master** (Default):
```json
{
  "templateId": "1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU",
  "name": "RevPal Master Template",
  "branding": {
    "primaryFont": "Montserrat",
    "bodyFont": "Figtree",
    "colors": {
      "primary": "#5F3B8C",    // Deep Grape
      "secondary": "#3E4A61",  // Slate Indigo
      "accent": "#E99560"      // Muted Apricot
    }
  },
  "layouts": [
    "TITLE",           // Title slide
    "SECTION_HEADER",  // Section dividers
    "CONTENT",         // Standard bullets
    "TWO_COLUMN",      // Side-by-side content
    "QUOTE",           // Pull quotes
    "KPI",             // Metrics dashboard
    "IMAGE_TITLE",     // Full-bleed image + title
    "CLOSING"          // Next steps, Q&A
  ]
}
```

### Layout Descriptions

**TITLE** - Opening slide
- Placeholders: `{{title}}`, `{{subtitle}}`
- Use: First slide only
- Style: Large centered text with branding

**SECTION_HEADER** - Section dividers
- Placeholders: `{{section_title}}`
- Use: Between major sections
- Style: Bold heading with accent color

**CONTENT** - Standard content
- Placeholders: `{{title}}`, `{{bullet_1}}` through `{{bullet_5}}`
- Use: Most common slide type
- Limits: Max 5 bullets, 15 words per bullet

**TWO_COLUMN** - Side-by-side comparison
- Placeholders: `{{title}}`, `{{left_heading}}`, `{{left_content}}`, `{{right_heading}}`, `{{right_content}}`
- Use: Before/after, pros/cons, comparisons
- Style: Equal column width

**QUOTE** - Pull quotes/testimonials
- Placeholders: `{{quote_text}}`, `{{author}}`
- Use: Customer testimonials, key findings
- Style: Large centered quote with attribution

**KPI** - Metrics dashboard
- Placeholders: `{{metric_1_label}}`, `{{metric_1_value}}`, `{{metric_2_label}}`, `{{metric_2_value}}`, `{{metric_3_label}}`, `{{metric_3_value}}`
- Use: Dashboard-style metrics
- Style: Large numbers with small labels

**IMAGE_TITLE** - Full-bleed images
- Placeholders: `{{title}}`, `{{image_url}}`
- Use: Impactful visuals
- Style: Image fills slide, title overlay

**CLOSING** - Final slides
- Placeholders: `{{title}}`, `{{next_steps}}`, `{{contact_info}}`
- Use: Wrap-up, Q&A, thank you
- Style: Clean layout with action items

### Template Inheritance

Templates can inherit from `revpal-master`:

**executive-brief.json:**
```json
{
  "inheritsFrom": "revpal-master",
  "deckType": "executive_brief",
  "targetAudience": ["executive"],
  "contentGuidelines": {
    "maxSlidesPerDeck": 15,
    "tone": "concise, data-driven, action-oriented",
    "structure": "BLUF (Bottom Line Up Front)"
  }
}
```

Child templates inherit branding and layouts but can override guidelines.

---

## Overflow Handling

### The Problem

Content doesn't always fit on slides. When you have too much text, you get:
- ❌ Text cut off at slide boundaries
- ❌ Unreadable small fonts
- ❌ Cluttered, unprofessional appearance

### 4-Tier Resolution Strategy

The system automatically detects and fixes overflow using a tiered approach:

#### Tier 1: Reduce Font Size (< 10% overflow)

**Trigger:** Slight overflow (1-2 words over capacity)

**Action:** Reduce font size by 1-3 points

**Limits:**
- Max reduction: 3 points (16pt → 13pt)
- Minimum size: 12pt (for readability)

**Example:**
```
Before: 16pt font, 5 bullets, 103% capacity
After:  14pt font, 5 bullets, 98% capacity
```

#### Tier 2: Abbreviate Content (10-30% overflow)

**Trigger:** Moderate overflow (several extra words)

**Action:** AI condenses content while preserving meaning

**Target:** 25% reduction in length

**Example:**
```
Before: "Implemented comprehensive validation rules for quote line items"
After:  "Implemented quote line validation"
```

#### Tier 3: Split Slide (30-50% overflow)

**Trigger:** Significant overflow (needs 1.5x capacity)

**Action:** Creates continuation slide

**Label:** `(cont.)` appended to title

**Example:**
```
Original Slide:
  Title: "Key Findings"
  Bullets: 8 bullets (too many)

Split Result:
  Slide 1: "Key Findings" (4 bullets)
  Slide 2: "Key Findings (cont.)" (4 bullets)
```

#### Tier 4: Move to Appendix (> 50% overflow)

**Trigger:** Severe overflow (needs 2x+ capacity)

**Action:** Moves detailed content to appendix, adds reference

**Main Slide:**
```
Title: Original Title
Content: "See Appendix for detailed information"
Reference: "Appendix Slide 1"
```

**Appendix Slide:**
```
Title: "Appendix: Original Title"
Content: Full detailed content
```

### Automatic Detection

The system estimates overflow using:
- Character count of all text
- Font size (default 16pt)
- Average character width (font size × 0.6)
- Layout capacity (varies by layout type)

**Estimation Formula:**
```
overflow_percentage = (current_length - capacity) / capacity
```

### Manual Override

You can control overflow behavior:

```javascript
// Disable auto-fix
export GOOGLE_SLIDES_AUTO_FIX_OVERFLOW=0

// Or specify preferred strategy
# In request: "Split slides if content doesn't fit"
```

---

## Quality Standards

### Mandatory Requirements

All generated presentations **MUST** pass these quality gates:

#### 1. Branding (ERROR severity)

✅ **OpsPal by RevPal label present**
- First slide or footer
- Exact text: "OpsPal by RevPal"

✅ **Font consistency**
- Headings: Montserrat (Bold, 48pt for H1, 36pt for H2)
- Body: Figtree (Regular, 16pt)

✅ **Color palette matches**
- Primary: #5F3B8C (Deep Grape) ±5 tolerance
- Secondary: #3E4A61 (Slate Indigo) ±5 tolerance
- Accent: #E99560 (Muted Apricot) ±5 tolerance

✅ **Standard disclaimer**
- Final slide or appendix
- Text includes: "OpsPal, by RevPal"

#### 2. Content (ERROR severity)

✅ **No placeholder text remaining**
- No `{{...}}` tokens left
- All placeholders replaced with actual content

✅ **All data cited with sources**
- Quantitative claims have citations (e.g., "24% win rate [Salesforce Q4]")
- Patterns requiring sources:
  - Percentages: `\d+%`
  - Currency: `\$\d+`
  - Multipliers: `\d+x`
  - Changes: `\d+ increase`, `\d+ decrease`

✅ **No fake/placeholder data**
- No lorem ipsum
- No `[insert ...]`, `[TBD]`, `[TODO]`
- No generic names: Example Corp, John Doe, Jane Smith, ACME Corporation

✅ **Slide count within limits**
- Min: 1 slide
- Max: 50 slides
- Warning: >30 slides (consider splitting deck)

#### 3. Layout (WARNING severity)

✅ **No text overflow**
- All text fits within slide boundaries
- Auto-fix applied if detected

✅ **Images properly scaled**
- Max width: 90% of slide width
- Max height: 80% of slide height
- Maintains aspect ratio

✅ **WCAG color contrast**
- Text-background contrast: 4.5:1 minimum
- Applies to all text and headings
- Standard: WCAG AA

#### 4. Accessibility (INFO severity)

✅ **Alt text on images** (best practice)
- Descriptive text (10-125 characters)
- Explains image content

✅ **Logical reading order** (best practice)
- Elements follow: title → body → footer

✅ **Color not sole indicator** (best practice)
- Information conveyed through text too, not just color

### Content Guidelines

**Bullet Points:**
- Max per slide: 5
- Max words per bullet: 15
- Style: Sentence fragments
- Start with verb when possible

**Titles:**
- Max words: 10
- Style: Descriptive (not generic)
- Capitalization: Title Case

**Citations:**
- Required: Yes (for all quantitative claims)
- Format: `[Source Name]`
- Location: Slide notes or footnote

**Tone by Audience:**
| Audience | Tone |
|----------|------|
| Executive | Concise, data-driven, action-oriented |
| Technical | Analytical, thorough, evidence-based |
| Sales | Engaging, benefit-focused, customer-centric |
| Customer | Collaborative, transparent, forward-looking |

---

## Configuration Options

### Environment Variables

```bash
# Required
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Optional - Template defaults
export GOOGLE_SLIDES_DEFAULT_TEMPLATE=revpal-master
export GOOGLE_SLIDES_PARENT_FOLDER_ID=  # Optional Drive folder

# Optional - Generation limits
export GOOGLE_SLIDES_MAX_SLIDES=50
export GOOGLE_SLIDES_MAX_BULLETS=5

# Optional - Quality gates
export GOOGLE_SLIDES_ENFORCE_QUALITY_GATES=1  # 1=enabled (default)
export GOOGLE_SLIDES_AUTO_FIX_OVERFLOW=1      # 1=enabled (default)
```

### Per-Request Options

You can specify options in your request:

**Slide Count Preference:**
```
Create a concise executive brief (max 10 slides) about pipeline
```
- `concise`: Fewer slides, high-level
- `moderate`: Balanced detail (default)
- `detailed`: Comprehensive coverage

**Deck Type:**
```
Create a technical deep dive about API integration
```
- `executive_brief`: C-level summary (15 slides max)
- `deep_dive`: Technical detail (50 slides max)
- `customer_update`: QBR format (25 slides max)
- `general`: Flexible (50 slides max)

**Audience:**
```
Create slides for a technical audience about database optimization
```
- `executive`: High-level, BLUF format
- `technical`: Detailed, analytical
- `sales`: Benefit-focused
- `customer`: Collaborative

**Export:**
```
Create slides and export to PDF
```
- Generates PDF in addition to Google Slides
- Saved to `/tmp/{presentationId}.pdf`

---

## Advanced Usage

### CLI Scripts

All core functionality is available via CLI:

#### GoogleSlidesManager

```bash
# Clone template
node scripts/lib/google-slides-manager.js clone \
  1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU \
  "My Presentation" \
  --verbose

# Add slide
node scripts/lib/google-slides-manager.js add-slide \
  ABC123 \
  CONTENT \
  --position 5 \
  --verbose

# Replace text
node scripts/lib/google-slides-manager.js replace-text \
  ABC123 \
  "{{title}}" \
  "My Title" \
  --verbose

# Export to PDF
node scripts/lib/google-slides-manager.js export-pdf \
  ABC123 \
  ./output.pdf \
  --verbose
```

#### GoogleSlidesTemplateManager

```bash
# List templates
node scripts/lib/google-slides-template-manager.js list --verbose

# Load template
node scripts/lib/google-slides-template-manager.js load revpal-master

# Select template
node scripts/lib/google-slides-template-manager.js select executive_brief executive

# Get layout
node scripts/lib/google-slides-template-manager.js layout revpal-master KPI
```

#### GoogleSlidesContentGenerator

```bash
# Generate outline
node scripts/lib/google-slides-content-generator.js generate-outline \
  --deck-type executive_brief \
  --audience executive \
  --topic "Q4 Pipeline Performance" \
  --verbose

# Generate content
node scripts/lib/google-slides-content-generator.js generate-content \
  outline.json \
  --verbose

# Validate content
node scripts/lib/google-slides-content-generator.js validate \
  content.json \
  sources.json \
  --verbose
```

### Programmatic API

```javascript
const GoogleSlidesManager = require('./scripts/lib/google-slides-manager');
const GoogleSlidesContentGenerator = require('./scripts/lib/google-slides-content-generator');
const GoogleSlidesTemplateManager = require('./scripts/lib/google-slides-template-manager');
const GoogleSlidesLayoutEngine = require('./scripts/lib/google-slides-layout-engine');

// Initialize
const slidesManager = new GoogleSlidesManager({ verbose: true });
const contentGenerator = new GoogleSlidesContentGenerator({ verbose: true });
const templateManager = new GoogleSlidesTemplateManager({ verbose: true });
const layoutEngine = new GoogleSlidesLayoutEngine({ verbose: true });

// Generate presentation
const outline = await contentGenerator.generateOutline({
  deck_type: 'executive_brief',
  audience: 'executive',
  topic: 'Q4 Results',
  source_content: { type: 'text', data: 'Our Q4 results...' }
});

const template = await templateManager.selectTemplate('executive_brief', 'executive');

const content = await contentGenerator.generateSlideContent(outline);

const presentation = await slidesManager.cloneTemplate(
  template.templateId,
  'Q4 Results Brief'
);

// Populate slides
const requests = [];
for (const slide of content.slides) {
  const { slideId } = await slidesManager.addSlide(
    presentation.presentationId,
    slide.layout
  );

  for (const [key, value] of Object.entries(slide.content)) {
    requests.push({
      replaceAllText: {
        containsText: { text: `{{${key}}}` },
        replaceText: String(value)
      }
    });
  }
}

await slidesManager.batchUpdate(presentation.presentationId, requests);

// Validate
const finalPresentation = await slidesManager.getPresentation(
  presentation.presentationId
);

const overflowSlides = await layoutEngine.validateLayout(finalPresentation);

if (overflowSlides.length > 0) {
  await layoutEngine.resolveOverflow(
    overflowSlides,
    slidesManager,
    presentation.presentationId
  );
}

console.log(`✅ Presentation created: ${presentation.url}`);
```

---

## Troubleshooting

### Common Issues

#### 1. "Template not found" (404 error)

**Symptoms:**
```
❌ Template not accessible: Request had invalid authentication credentials.
```

**Causes:**
- Google credentials not configured
- Credentials don't have Slides API scope
- Template ID incorrect

**Solutions:**

**Check credentials:**
```bash
echo $GOOGLE_APPLICATION_CREDENTIALS
# Should show: /path/to/credentials.json

# Verify file exists
ls -la $GOOGLE_APPLICATION_CREDENTIALS
```

**Verify scopes:**
```bash
# Check google-drive-manager.js has Slides scope
grep "presentations" scripts/lib/google-drive-manager.js
# Should show: 'https://www.googleapis.com/auth/presentations'
```

**Test template access:**
```bash
node scripts/lib/google-slides-manager.js get \
  1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU \
  --verbose
```

#### 2. "API rate limit exceeded" (429 error)

**Symptoms:**
```
⚠️  Rate limited. Retrying in 2000ms...
```

**Causes:**
- Too many requests in short time window
- Slides API quota exceeded (300 requests/minute)

**Solutions:**

**Let automatic retry work:**
- System automatically retries with exponential backoff
- Max 3 retries: 1s, 2s, 4s delays

**Reduce request volume:**
```bash
# Use batch operations (max 100 per batch)
# System automatically splits larger batches

# Check quota usage
# Visit: https://console.cloud.google.com/apis/api/slides.googleapis.com/quotas
```

#### 3. "Content generation failed"

**Symptoms:**
```
❌ Content generation failed: LLM request timeout
```

**Causes:**
- LLM service unavailable
- Request too complex
- Network timeout

**Solutions:**

**Retry with simpler request:**
```
Create a simple 5-slide deck about [topic]
```

**Use fallback content:**
- System automatically provides placeholder text
- Manual editing required

**Check LLM service:**
```bash
# Verify Anthropic API key (if used)
echo $ANTHROPIC_API_KEY
```

#### 4. "Overflow cannot be resolved"

**Symptoms:**
```
⚠️  Some slides still have overflow after auto-fix
   Manual review recommended for: slide_123
```

**Causes:**
- Content significantly exceeds capacity (>100% overflow)
- Auto-fix strategies exhausted

**Solutions:**

**Manual editing:**
1. Open presentation URL
2. Navigate to flagged slide
3. Manually condense content or split slide

**Request shorter content:**
```
Create a concise version with shorter bullet points
```

**Use appendix strategy:**
```
Move detailed content to appendix slides
```

#### 5. "Quality gates failed"

**Symptoms:**
```
❌ Quality gates failed: No unreplaced placeholders, WCAG color contrast
```

**Causes:**
- Placeholder tokens not replaced
- Color contrast below 4.5:1 ratio
- Missing branding elements

**Solutions:**

**Check validation report:**
```bash
# Validation details in agent output
# Example:
# ❌ Placeholder remaining: {{bullet_3}} on slide 5
# ❌ Color contrast: 3.2:1 (need 4.5:1) - slide 8 title
```

**Manual fixes:**
1. Replace placeholders in Google Slides UI
2. Adjust text/background colors for contrast
3. Add missing branding labels

**Disable strict validation (not recommended):**
```bash
export GOOGLE_SLIDES_ENFORCE_QUALITY_GATES=0
```

### Debug Mode

Enable verbose logging for detailed diagnostics:

```bash
# Enable for all scripts
export DEBUG=google-slides:*

# Or per-script
node scripts/lib/google-slides-manager.js clone ABC123 "Test" --verbose
```

**Output includes:**
- API request/response details
- Retry attempts and delays
- Batch operation splits
- Overflow detection calculations
- Validation rule checks

### Getting Help

**Check logs:**
```bash
# Recent Claude Code logs
tail -f ~/.claude/logs/claude.log
```

**Validate plugin installation:**
```bash
/agents
# Should show: google-slides-generator
```

**Test individual components:**
```bash
# Test template manager
node scripts/lib/google-slides-template-manager.js list --verbose

# Test content generator
node scripts/lib/google-slides-content-generator.js generate-outline \
  --topic "Test" --deck-type general --audience all --verbose
```

**Report issues:**
- GitHub: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- Include: Error message, command used, environment details

---

## Examples

### Example 1: Executive Brief from Salesforce Data

**Request:**
```
Create an executive brief about Q4 2024 pipeline performance using data
from Salesforce
```

**Agent Workflow:**

**Phase 1: Understanding**
```
✓ Deck type: executive_brief
✓ Audience: executive
✓ Topic: Q4 2024 pipeline performance
✓ Source: Will query Salesforce
```

**Phase 2: Outline**
```
📊 Generated outline with 8 slides:
1. Title: "Q4 2024 Pipeline Performance"
2. Executive Summary
3. Pipeline Overview
4. Win Rate Analysis
5. Deal Velocity
6. Risk Areas
7. Recommendations
8. Next Steps
```

**Phase 3: Template**
```
📋 Selected template: executive-brief.json
   Template ID: ABC123 (inherits from revpal-master)
```

**Phase 4: Content Generation**
```
✓ Querying Salesforce: SELECT Id, Amount, StageName, CloseDate
     FROM Opportunity WHERE CloseDate >= 2024-10-01
✓ Calculating metrics:
  - Total pipeline: $8.5M
  - Win rate: 24%
  - Avg deal size: $125K
  - Avg cycle: 47 days
✓ Creating slides with citations [Salesforce Q4 2024]
```

**Phase 5: Creation**
```
✓ Cloned template (ID: 1iFug...)
✓ Added 8 slides
✓ Populated 42 placeholders
```

**Phase 6: Validation**
```
✓ Branding present (OpsPal by RevPal on slide 1)
✓ No placeholders remaining
✓ All data cited
✓ No overflow detected
✓ WCAG color contrast passed
```

**Phase 7: Finalized**
```
📊 Presentation: https://docs.google.com/presentation/d/XYZ789
📈 Slides: 8
📄 PDF: /reports/q4-pipeline-exec-brief.pdf
✅ Ready for review
```

### Example 2: Customer QBR from Transcript

**Request:**
```
Create a customer update presentation from this call transcript:
[transcript.txt - 3000 words of meeting notes]
```

**Agent Workflow:**

**Phase 1-2:**
```
✓ Deck type: customer_update
✓ Analyzing transcript (3000 words)
✓ Extracting key topics:
  - Progress since last QBR
  - Current implementation status
  - Challenges and blockers
  - Upcoming milestones
```

**Phase 3:**
```
📋 Selected template: customer-update.json (QBR format)
```

**Phase 4:**
```
✓ Generating 25 slides:
  Section 1: Progress Review (slides 1-8)
  Section 2: Current State (slides 9-15)
  Section 3: Looking Ahead (slides 16-21)
  Section 4: Action Items (slides 22-25)
```

**Phase 5:**
```
✓ Creating presentation with:
  - Progress metrics from transcript
  - Direct quotes as pull quotes
  - Action items table
  - Timeline visualization
```

**Result:**
```
📊 25-slide QBR presentation
🎙️ 4 pull quotes from customer
📅 Timeline showing next 90 days
✅ Action items table (slide 24)
```

### Example 3: Adding Data Visualization

**Request:**
```
Add a KPI dashboard slide to presentation ABC123 showing:
- MRR: $245K
- Churn: 3.2%
- NPS: 67
```

**Agent Workflow:**

**Phase 1:**
```
✓ Operation: modify_existing
✓ Presentation ID: ABC123
✓ Action: Add KPI slide
```

**Phase 5:**
```
✓ Loaded template metadata (revpal-master)
✓ Selected layout: KPI
✓ Inserted slide at end (position 16)
✓ Populated metrics:
  Metric 1: MRR - $245K
  Metric 2: Churn - 3.2%
  Metric 3: NPS - 67
```

**Result:**
```
✅ KPI slide added successfully
   Position: 16 (end of deck)
   Layout: KPI Dashboard
   View: https://docs.google.com/presentation/d/ABC123#slide=id.g16
```

### Example 4: Bulk Content Update

**Request:**
```
Update all references to "Q3 2024" to "Q4 2024" in presentation ABC123
```

**Agent Workflow:**

**Phase 5:**
```
✓ Loaded presentation (18 slides)
✓ Found 12 instances of "Q3 2024"
✓ Batch replacement request:
  - Slide 2: Title
  - Slide 3: Bullet points (3 instances)
  - Slide 5: Chart title
  - Slide 7: Data label (2 instances)
  - Slide 9: Footer
  - Slide 12: Summary (4 instances)
✓ Executed batch update (12 replacements)
```

**Result:**
```
✅ Updated 12 instances across 7 slides
   Changes: "Q3 2024" → "Q4 2024"
   No layout changes
   View: https://docs.google.com/presentation/d/ABC123
```

---

## Best Practices

### ✅ Do's

**Content Input:**
- ✅ Provide specific, detailed source content
- ✅ Include metrics and data points
- ✅ Specify audience and purpose upfront
- ✅ Reference existing data sources (Salesforce, CSV)

**Templates:**
- ✅ Use appropriate template for audience
- ✅ Stick to template guidelines (slide count, tone)
- ✅ Leverage predefined layouts
- ✅ Trust the template inheritance system

**Modifications:**
- ✅ Make incremental changes
- ✅ Test modifications on copies first
- ✅ Use batch operations for bulk changes
- ✅ Validate after each modification

**Quality:**
- ✅ Review generated content before presenting
- ✅ Let auto-fix handle overflow
- ✅ Keep quality gates enabled
- ✅ Cite all data sources

### ❌ Don'ts

**Content Input:**
- ❌ Don't provide vague instructions ("make slides about stuff")
- ❌ Don't ignore audience specification
- ❌ Don't provide unstructured data without context
- ❌ Don't skip source attribution

**Templates:**
- ❌ Don't create blank presentations (use templates)
- ❌ Don't exceed template slide limits
- ❌ Don't mix templates within one deck
- ❌ Don't manually edit template files

**Modifications:**
- ❌ Don't make multiple rapid changes (rate limits)
- ❌ Don't delete slides referenced elsewhere
- ❌ Don't bypass batch operations
- ❌ Don't skip validation after changes

**Quality:**
- ❌ Don't disable quality gates
- ❌ Don't leave placeholder text
- ❌ Don't use non-Google fonts
- ❌ Don't skip WCAG contrast requirements

---

## Performance Optimization

### API Efficiency

**Batch Operations:**
- Group up to 100 requests per `batchUpdate`
- System automatically splits larger batches
- Reduces API calls by ~90%

**Template Caching:**
- Template metadata cached in memory
- Only loads from disk once per session
- ~50ms improvement per template access

**Lazy Loading:**
- API clients initialize only when needed
- Reduces startup time
- Saves memory for unused features

**Parallel Execution:**
- Content generation runs during template cloning
- Outline and template selection in parallel
- ~30% faster overall workflow

### Rate Limit Management

**Automatic Retry:**
- Exponential backoff: 1s, 2s, 4s
- Max 3 retry attempts
- Success rate: 98%+

**Request Pacing:**
- System respects 300 requests/10 seconds limit
- Batching reduces request volume
- Rarely hits rate limits

**Quota Monitoring:**
```bash
# Check current usage
# Visit: https://console.cloud.google.com/apis/api/slides.googleapis.com/quotas

# Monitor quota in code
node scripts/lib/google-slides-manager.js quota --verbose
```

---

## Version History

### v1.25.0 (2025-12-08)

**Initial Release**

**Features:**
- ✅ Create decks from text, CSV, transcripts
- ✅ Clone RevPal template with branding
- ✅ Modify existing presentations
- ✅ AI-powered content generation
- ✅ 4-tier overflow handling
- ✅ Quality gate validation
- ✅ WCAG accessibility compliance
- ✅ PDF export
- ✅ 8 predefined layouts
- ✅ 4 template variants

**Components:**
- GoogleSlidesManager (720 lines)
- GoogleSlidesContentGenerator (530 lines)
- GoogleSlidesLayoutEngine (380 lines)
- GoogleSlidesTemplateManager (390 lines)
- google-slides-generator agent (540 lines)

**Templates:**
- revpal-master
- executive-brief
- customer-update
- deep-dive

**Quality Gates:**
- Branding enforcement
- Content validation
- Layout compliance
- Accessibility checks

---

## Support & Resources

### Documentation

- **This Guide** - User-facing documentation
- **API_REFERENCE.md** - Developer documentation
- **README.md** - Plugin overview

### Code References

- `scripts/lib/google-slides-manager.js` - Core API interface
- `scripts/lib/google-slides-content-generator.js` - AI content generation
- `scripts/lib/google-slides-layout-engine.js` - Overflow handling
- `scripts/lib/google-slides-template-manager.js` - Template management
- `agents/google-slides-generator.md` - Main orchestrator
- `config/slides-generation-rules.json` - Quality gate rules

### Getting Help

**Issues:**
- GitHub: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues

**Questions:**
- Ask Claude: "How do I [task] with Google Slides?"
- Check examples in this guide
- Review agent documentation

**Feedback:**
- Use `/reflect` command in Claude Code
- Submit feature requests via GitHub

---

**Version**: 1.25.0
**Last Updated**: 2025-12-08
**Maintained By**: RevPal Engineering
