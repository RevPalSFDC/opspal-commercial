# Google Slides Generator - API Reference

## Overview

This document provides technical reference for developers working with or extending the Google Slides Generator system. It covers architecture, class APIs, patterns, and extension points.

**Target Audience:** Developers, contributors, plugin maintainers

**Version:** 1.25.0
**Last Updated:** 2025-12-08

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Class Reference](#class-reference)
3. [API Patterns](#api-patterns)
4. [Extension Points](#extension-points)
5. [Testing Guide](#testing-guide)
6. [Performance Considerations](#performance-considerations)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│              google-slides-generator (Agent)             │
│                  Main Orchestrator                       │
└───────────────┬─────────────────────────────────────────┘
                │
                ├─── GoogleSlidesManager
                │    └─> Google Slides API v1
                │    └─> Google Drive API v3
                │
                ├─── GoogleSlidesContentGenerator
                │    └─> Anthropic Claude API (LLM)
                │
                ├─── GoogleSlidesLayoutEngine
                │    └─> GoogleSlidesContentGenerator (abbreviation)
                │
                └─── GoogleSlidesTemplateManager
                     └─> File system (template JSON)
```

### Data Flow

```
User Request
    │
    ▼
┌─────────────────────────────────────┐
│ Phase 1: Request Understanding     │  Parse intent, validate inputs
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│ Phase 2: Outline Generation        │  LLM → Slide structure
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│ Phase 3: Template Selection        │  Choose template + layouts
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│ Phase 4: Content Generation        │  LLM → Detailed content
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│ Phase 5: Slide Creation            │  Clone + Populate via API
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│ Phase 6: Validation                │  Quality gates + Overflow
└─────────────┬───────────────────────┘
              ▼
┌─────────────────────────────────────┐
│ Phase 7: Finalization              │  Export PDF + Share
└─────────────────────────────────────┘
```

### File Structure

```
.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/
├── agents/
│   └── google-slides-generator.md          # Main orchestrator
├── scripts/lib/
│   ├── google-slides-manager.js            # API interface (720 lines)
│   ├── google-slides-content-generator.js  # LLM integration (530 lines)
│   ├── google-slides-layout-engine.js      # Overflow handling (380 lines)
│   ├── google-slides-template-manager.js   # Template management (390 lines)
│   └── google-drive-manager.js             # Existing (updated for Slides scope)
├── templates/google-slides/
│   ├── revpal-master.json                  # Master template
│   ├── executive-brief.json                # Executive variant
│   ├── customer-update.json                # QBR variant
│   └── deep-dive.json                      # Technical variant
├── config/
│   └── slides-generation-rules.json        # Quality gates
└── docs/
    ├── GOOGLE_SLIDES_GUIDE.md              # User documentation
    └── GOOGLE_SLIDES_API_REFERENCE.md      # This file
```

---

## Class Reference

### GoogleSlidesManager

**Path:** `.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-slides-manager.js`

**Purpose:** Core interface to Google Slides API and Google Drive API. Handles all presentation operations.

#### Constructor

```javascript
new GoogleSlidesManager(options = {})
```

**Options:**
- `verbose` (boolean): Enable detailed logging (default: `false`)
- `mode` (string): Operation mode - `'api'`, `'auto'`, or `'manual'` (default: `'auto'`)

**Modes:**
- `api`: Direct API operations only
- `auto`: API with fallback to manual instructions
- `manual`: Returns instructions without API execution

**Example:**
```javascript
const GoogleSlidesManager = require('./google-slides-manager');

const manager = new GoogleSlidesManager({
  verbose: true,
  mode: 'api'
});
```

#### Methods

##### cloneTemplate(templateId, title)

Clone an existing Google Slides template via Drive API.

```javascript
async cloneTemplate(templateId, title)
```

**Parameters:**
- `templateId` (string): Google Slides template ID
- `title` (string): Title for new presentation

**Returns:** Promise<Object>
```javascript
{
  presentationId: string,  // New presentation ID
  url: string             // Shareable URL
}
```

**Example:**
```javascript
const result = await manager.cloneTemplate(
  '1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU',
  'Q4 Pipeline Review'
);

console.log(result.url);
// https://docs.google.com/presentation/d/ABC123/edit
```

**Implementation Details:**
- Uses Drive API v3 `files.copy`
- Preserves all layouts, branding, and placeholders
- Automatic retry on 429 rate limits (3 attempts)

##### createBlankPresentation(title)

Create a new blank presentation.

```javascript
async createBlankPresentation(title)
```

**Parameters:**
- `title` (string): Presentation title

**Returns:** Promise<Object>
```javascript
{
  presentationId: string,
  url: string
}
```

**Example:**
```javascript
const result = await manager.createBlankPresentation('New Deck');
```

##### addSlide(presentationId, layout, options)

Add a new slide with specified layout.

```javascript
async addSlide(presentationId, layout, options = {})
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `layout` (string): Layout ID or predefined layout name
  - Predefined: `'TITLE'`, `'CONTENT'`, `'TWO_COLUMN'`, `'QUOTE'`, `'KPI'`, `'IMAGE_TITLE'`, `'SECTION_HEADER'`, `'CLOSING'`
  - Or custom layout ID
- `options` (object):
  - `insertionIndex` (number): Position to insert (0 = first, omit = end)

**Returns:** Promise<Object>
```javascript
{
  slideId: string,     // New slide object ID
  index: number        // Position in deck
}
```

**Example:**
```javascript
const { slideId } = await manager.addSlide(
  'ABC123',
  'KPI',
  { insertionIndex: 5 }  // Insert after slide 5
);
```

##### replaceText(presentationId, findText, replaceText)

Replace text across entire presentation.

```javascript
async replaceText(presentationId, findText, replaceText)
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `findText` (string): Text to find (supports placeholders like `{{title}}`)
- `replaceText` (string): Replacement text

**Returns:** Promise<Object>
```javascript
{
  occurrencesChanged: number  // Number of replacements made
}
```

**Example:**
```javascript
const result = await manager.replaceText(
  'ABC123',
  '{{title}}',
  'Q4 Results'
);

console.log(`Replaced ${result.occurrencesChanged} instances`);
```

##### replaceImage(presentationId, imageToken, imageUrl)

Replace image placeholder with actual image.

```javascript
async replaceImage(presentationId, imageToken, imageUrl)
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `imageToken` (string): Placeholder token (e.g., `{{company_logo}}`)
- `imageUrl` (string): Public URL of image to insert

**Returns:** Promise<Object>
```javascript
{
  imagesReplaced: number
}
```

**Example:**
```javascript
await manager.replaceImage(
  'ABC123',
  '{{company_logo}}',
  'https://example.com/logo.png'
);
```

##### batchUpdate(presentationId, requests)

Execute multiple operations atomically.

```javascript
async batchUpdate(presentationId, requests)
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `requests` (Array<Object>): Array of Slides API requests

**Returns:** Promise<Object>
```javascript
{
  replies: Array<Object>,  // API responses
  batches: number          // Number of batches (if split)
}
```

**Request Types:**
- `createSlide`
- `deleteObject`
- `updateTextStyle`
- `replaceAllText`
- `replaceAllShapesWithImage`
- [Full list](https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate)

**Example:**
```javascript
const requests = [
  {
    replaceAllText: {
      containsText: { text: '{{title}}' },
      replaceText: 'My Title'
    }
  },
  {
    replaceAllText: {
      containsText: { text: '{{subtitle}}' },
      replaceText: 'My Subtitle'
    }
  }
];

await manager.batchUpdate('ABC123', requests);
```

**Automatic Batching:**
- If `requests.length > 100`, automatically splits into multiple API calls
- Each batch: max 100 requests
- All batches execute sequentially

##### getPresentation(presentationId)

Retrieve presentation metadata.

```javascript
async getPresentation(presentationId)
```

**Parameters:**
- `presentationId` (string): Target presentation ID

**Returns:** Promise<Object> - [Presentation resource](https://developers.google.com/slides/api/reference/rest/v1/presentations#Presentation)

**Example:**
```javascript
const presentation = await manager.getPresentation('ABC123');

console.log(`Slides: ${presentation.slides.length}`);
console.log(`Title: ${presentation.title}`);
```

##### deleteSlide(presentationId, slideId)

Delete a slide by object ID.

```javascript
async deleteSlide(presentationId, slideId)
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `slideId` (string): Slide object ID (not index)

**Returns:** Promise<void>

**Example:**
```javascript
const presentation = await manager.getPresentation('ABC123');
const slideToDelete = presentation.slides[5].objectId;

await manager.deleteSlide('ABC123', slideToDelete);
```

##### exportToPDF(presentationId, outputPath)

Export presentation as PDF.

```javascript
async exportToPDF(presentationId, outputPath)
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `outputPath` (string): Local file path for PDF

**Returns:** Promise<string> - Output file path

**Example:**
```javascript
const pdfPath = await manager.exportToPDF(
  'ABC123',
  './output/presentation.pdf'
);

console.log(`PDF saved: ${pdfPath}`);
```

##### exportToPPTX(presentationId, outputPath)

Export presentation as PPTX.

```javascript
async exportToPPTX(presentationId, outputPath)
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `outputPath` (string): Local file path for PPTX

**Returns:** Promise<string> - Output file path

**Example:**
```javascript
const pptxPath = await manager.exportToPPTX(
  'ABC123',
  './output/presentation.pptx'
);

console.log(`PPTX saved: ${pptxPath}`);
```

#### CLI Usage

```bash
# Clone template
node scripts/lib/google-slides-manager.js clone <templateId> <title> [--verbose]

# Add slide
node scripts/lib/google-slides-manager.js add-slide <presentationId> <layout> [--position <n>] [--verbose]

# Replace text
node scripts/lib/google-slides-manager.js replace-text <presentationId> <findText> <replaceText> [--verbose]

# Export PDF
node scripts/lib/google-slides-manager.js export-pdf <presentationId> <outputPath> [--verbose]

# Export PPTX
node scripts/lib/google-slides-manager.js export-pptx <presentationId> <outputPath> [--verbose]

# Get presentation
node scripts/lib/google-slides-manager.js get <presentationId> [--verbose]
```

---

### GoogleSlidesContentGenerator

**Path:** `.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-slides-content-generator.js`

**Purpose:** AI-powered content generation using LLM. Creates slide outlines and detailed content from input specifications.

#### Constructor

```javascript
new GoogleSlidesContentGenerator(options = {})
```

**Options:**
- `verbose` (boolean): Enable detailed logging (default: `false`)
- `model` (string): LLM model to use (default: `'claude-sonnet-4.5'`)

#### Methods

##### generateOutline(input)

Generate slide structure from input specification.

```javascript
async generateOutline(input)
```

**Input Contract:**
```javascript
{
  deck_type: 'executive_brief' | 'deep_dive' | 'customer_update' | 'general',
  audience: 'executive' | 'technical' | 'sales' | 'customer',
  topic: string,
  source_content: {
    type: 'text' | 'csv' | 'transcript' | 'structured',
    data: string | object
  },
  constraints: {
    max_slides: number,
    slide_count_preference: 'concise' | 'moderate' | 'detailed',
    include_appendix: boolean
  },
  branding: {
    company_name: string,
    tagline: string
  }
}
```

**Output Contract:**
```javascript
{
  outline: [
    {
      slide_number: number,
      layout: string,        // e.g., 'TITLE', 'CONTENT', 'KPI'
      title: string,
      content: object,       // Layout-specific content structure
      notes: string          // Speaker notes
    }
  ],
  metadata: {
    total_slides: number,
    estimated_duration: string,
    content_sources: string[]
  }
}
```

**Example:**
```javascript
const generator = new GoogleSlidesContentGenerator({ verbose: true });

const outline = await generator.generateOutline({
  deck_type: 'executive_brief',
  audience: 'executive',
  topic: 'Q4 Pipeline Performance',
  source_content: {
    type: 'text',
    data: 'Our Q4 pipeline shows...'
  },
  constraints: {
    max_slides: 15,
    slide_count_preference: 'concise',
    include_appendix: false
  },
  branding: {
    company_name: 'RevPal',
    tagline: 'OpsPal by RevPal'
  }
});

console.log(`Generated ${outline.outline.length} slides`);
```

##### generateSlideContent(outline, options)

Generate detailed content for each slide.

```javascript
async generateSlideContent(outline, options = {})
```

**Parameters:**
- `outline` (object): Output from `generateOutline()`
- `options` (object):
  - `template` (string): Template name for content guidelines

**Returns:** Promise<Object>
```javascript
{
  slides: [
    {
      slide_number: number,
      layout: string,
      title: string,
      content: object,       // Detailed content per layout
      speaker_notes: string
    }
  ],
  metadata: {
    total_words: number,
    content_sources: string[],
    citations: object[]
  },
  validation: {
    content_verified: boolean,
    no_hallucinations: boolean,
    sources_cited: boolean
  }
}
```

**Example:**
```javascript
const content = await generator.generateSlideContent(outline, {
  template: 'executive-brief'
});

for (const slide of content.slides) {
  console.log(`Slide ${slide.slide_number}: ${slide.title}`);
}
```

##### summarizeContent(text, maxLength, unit)

Condense verbose text while preserving meaning.

```javascript
async summarizeContent(text, maxLength, unit = 'words')
```

**Parameters:**
- `text` (string): Text to summarize
- `maxLength` (number): Target length
- `unit` (string): `'words'` or `'characters'`

**Returns:** Promise<string> - Summarized text

**Example:**
```javascript
const original = "This is a very long explanation that needs to be condensed...";
const summarized = await generator.summarizeContent(original, 10, 'words');

console.log(summarized);
// "Concise explanation of key points..."
```

##### validateContent(content, sources)

Validate content for hallucinations and missing sources.

```javascript
async validateContent(content, sources = [])
```

**Parameters:**
- `content` (object): Generated content to validate
- `sources` (array): Expected data sources

**Returns:** Promise<Object>
```javascript
{
  valid: boolean,
  issues: [
    {
      type: 'hallucination' | 'missing_source' | 'fake_data',
      severity: 'error' | 'warning',
      description: string,
      location: string
    }
  ]
}
```

**Detection Patterns:**
- **Fake Data:** lorem ipsum, [placeholder], Example Corp, John Doe
- **Uncited Claims:** Numbers without sources
- **Hallucinations:** Claims not in source content

**Example:**
```javascript
const validation = await generator.validateContent(
  content,
  ['Salesforce Q4 2024', 'Internal Metrics']
);

if (!validation.valid) {
  console.error('Validation failed:', validation.issues);
}
```

##### citeSources(content, sources)

Add source citations to content.

```javascript
citeSources(content, sources)
```

**Parameters:**
- `content` (object): Content object
- `sources` (array): Array of source objects

**Returns:** Object - Content with citations added

**Example:**
```javascript
const cited = generator.citeSources(content, [
  { claim: 'Win rate 24%', source: 'Salesforce Q4 2024' },
  { claim: '$125K avg deal', source: 'Salesforce Q4 2024' }
]);
```

#### CLI Usage

```bash
# Generate outline
node scripts/lib/google-slides-content-generator.js generate-outline \
  --deck-type executive_brief \
  --audience executive \
  --topic "Q4 Results" \
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

---

### GoogleSlidesLayoutEngine

**Path:** `.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-slides-layout-engine.js`

**Purpose:** Dynamic content fitting and overflow resolution using 4-tier strategy.

#### Constructor

```javascript
new GoogleSlidesLayoutEngine(options = {})
```

**Options:**
- `verbose` (boolean): Enable detailed logging
- `contentGenerator` (GoogleSlidesContentGenerator): Injected generator for abbreviation
- `minFontSize` (number): Minimum font size (default: 12pt)
- `defaultFontSize` (number): Default font size (default: 16pt)
- `maxFontReduction` (number): Max font reduction (default: 3pt)

#### Methods

##### detectOverflow(slide, layout)

Detect if content will overflow a slide.

```javascript
async detectOverflow(slide, layout)
```

**Parameters:**
- `slide` (object): Slide object with content
- `layout` (object): Layout constraints

**Returns:** Promise<Object>
```javascript
{
  overflow: boolean,
  percentage: number,      // Overflow as decimal (0.15 = 15%)
  strategy: string,        // Recommended strategy
  details: {
    currentLength: number,
    capacity: number,
    overflow: number
  }
}
```

**Example:**
```javascript
const engine = new GoogleSlidesLayoutEngine({ verbose: true });

const result = await engine.detectOverflow(slide, layout);

if (result.overflow) {
  console.log(`Overflow: ${result.percentage * 100}%`);
  console.log(`Strategy: ${result.strategy}`);
}
```

##### reduceFontSize(presentationId, slideId, reduction, slidesManager)

Reduce font size on a slide (Tier 1 strategy).

```javascript
async reduceFontSize(presentationId, slideId, reduction, slidesManager)
```

**Parameters:**
- `presentationId` (string): Target presentation ID
- `slideId` (string): Target slide ID
- `reduction` (number): Points to reduce (1-3)
- `slidesManager` (GoogleSlidesManager): Manager instance

**Returns:** Promise<Object>
```javascript
{
  applied: boolean,
  newFontSize: number
}
```

**Example:**
```javascript
const result = await engine.reduceFontSize(
  'ABC123',
  'slide_456',
  2,  // Reduce by 2pt
  slidesManager
);

console.log(`New font size: ${result.newFontSize}pt`);
```

##### abbreviateContent(content, targetReduction)

Abbreviate/condense content (Tier 2 strategy).

```javascript
async abbreviateContent(content, targetReduction = 0.25)
```

**Parameters:**
- `content` (object): Slide content
- `targetReduction` (number): Target reduction (0.25 = 25%)

**Returns:** Promise<Object> - Abbreviated content

**Example:**
```javascript
const abbreviated = await engine.abbreviateContent(content, 0.3);
// Reduces content by 30%
```

##### splitSlide(slide, breakpoint)

Split slide into multiple slides (Tier 3 strategy).

```javascript
async splitSlide(slide, breakpoint = 0.5)
```

**Parameters:**
- `slide` (object): Slide to split
- `breakpoint` (number): Split point (0.5 = halfway)

**Returns:** Promise<Array<Object>> - Two slide objects

**Example:**
```javascript
const [first, second] = await engine.splitSlide(slide, 0.5);

console.log(`First slide: ${first.title}`);
console.log(`Second slide: ${second.title} (cont.)`);
```

##### moveToAppendix(slide, appendixSlides)

Move slide to appendix (Tier 4 strategy).

```javascript
async moveToAppendix(slide, appendixSlides = [])
```

**Parameters:**
- `slide` (object): Slide to move
- `appendixSlides` (array): Existing appendix slides

**Returns:** Promise<Object>
```javascript
{
  referenceSlide: object,      // Replacement slide with reference
  appendixSlides: Array<object> // Updated appendix array
}
```

**Example:**
```javascript
const result = await engine.moveToAppendix(slide, appendixSlides);

// Use referenceSlide in main deck
// Append appendixSlides to end of deck
```

##### validateLayout(presentation)

Validate layout of entire presentation.

```javascript
async validateLayout(presentation)
```

**Parameters:**
- `presentation` (object): Full presentation from API

**Returns:** Promise<Array<string>> - Array of slide IDs with overflow

**Example:**
```javascript
const presentation = await slidesManager.getPresentation('ABC123');
const overflowSlides = await engine.validateLayout(presentation);

if (overflowSlides.length > 0) {
  console.log(`Overflow detected on ${overflowSlides.length} slides`);
}
```

##### resolveOverflow(slides, slidesManager, presentationId)

Automatically resolve overflow using appropriate strategies.

```javascript
async resolveOverflow(slides, slidesManager, presentationId)
```

**Parameters:**
- `slides` (array): Slides with overflow
- `slidesManager` (GoogleSlidesManager): Manager instance
- `presentationId` (string): Target presentation ID

**Returns:** Promise<Array<Object>>
```javascript
[
  {
    slideId: string,
    strategy: string,        // Strategy applied
    applied: boolean,
    details: object
  }
]
```

**Example:**
```javascript
const results = await engine.resolveOverflow(
  overflowSlides,
  slidesManager,
  'ABC123'
);

for (const result of results) {
  console.log(`Slide ${result.slideId}: ${result.strategy}`);
}
```

---

### GoogleSlidesTemplateManager

**Path:** `.claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/google-slides-template-manager.js`

**Purpose:** Template library management with metadata-driven selection.

#### Constructor

```javascript
new GoogleSlidesTemplateManager(options = {})
```

**Options:**
- `verbose` (boolean): Enable detailed logging
- `templatesDir` (string): Path to templates directory

#### Methods

##### loadTemplateMetadata(templateName)

Load template metadata from JSON file.

```javascript
async loadTemplateMetadata(templateName)
```

**Parameters:**
- `templateName` (string): Template name (e.g., `'revpal-master'`)

**Returns:** Promise<Object> - Template metadata

**Caching:** Results cached in memory, subsequent calls return cached version

**Example:**
```javascript
const manager = new GoogleSlidesTemplateManager({ verbose: true });

const template = await manager.loadTemplateMetadata('revpal-master');

console.log(`Template ID: ${template.templateId}`);
console.log(`Layouts: ${template.layouts.length}`);
```

##### selectTemplate(deckType, audience)

Select best template based on criteria.

```javascript
async selectTemplate(deckType, audience)
```

**Parameters:**
- `deckType` (string): `'executive_brief'`, `'deep_dive'`, `'customer_update'`, `'general'`
- `audience` (string): `'executive'`, `'technical'`, `'sales'`, `'customer'`

**Returns:** Promise<Object> - Selected template metadata

**Selection Logic:**
1. Filter by deck type
2. Filter by audience (if specified)
3. Return first match or fallback to `revpal-master`

**Example:**
```javascript
const template = await manager.selectTemplate('executive_brief', 'executive');

console.log(`Selected: ${template.name}`);
```

##### getLayoutByName(templateName, layoutName)

Get layout by name from template.

```javascript
async getLayoutByName(templateName, layoutName)
```

**Parameters:**
- `templateName` (string): Template name
- `layoutName` (string): Layout ID or name (e.g., `'KPI'`, `'CONTENT'`)

**Returns:** Promise<Object> - Layout metadata

**Example:**
```javascript
const layout = await manager.getLayoutByName('revpal-master', 'KPI');

console.log(`Placeholders: ${layout.placeholders.join(', ')}`);
```

##### getPlaceholders(layout)

Get all placeholders from a layout.

```javascript
getPlaceholders(layout)
```

**Parameters:**
- `layout` (object): Layout object

**Returns:** Array<string> - Placeholder tokens

**Example:**
```javascript
const placeholders = manager.getPlaceholders(layout);
// ['{{title}}', '{{metric_1_label}}', '{{metric_1_value}}', ...]
```

##### validateTemplate(templateId, slidesManager)

Validate that template exists and is accessible.

```javascript
async validateTemplate(templateId, slidesManager = null)
```

**Parameters:**
- `templateId` (string): Google Slides template ID
- `slidesManager` (GoogleSlidesManager): Optional manager for API check

**Returns:** Promise<Object>
```javascript
{
  valid: boolean,
  error?: string
}
```

**Example:**
```javascript
const validation = await manager.validateTemplate(
  '1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU',
  slidesManager
);

if (!validation.valid) {
  console.error(`Validation failed: ${validation.error}`);
}
```

##### listTemplates()

List all available templates.

```javascript
async listTemplates()
```

**Returns:** Promise<Array<Object>> - Array of template metadata

**Example:**
```javascript
const templates = await manager.listTemplates();

for (const template of templates) {
  console.log(`${template.name} (${template.deckType})`);
}
```

##### getContentGuidelines(templateName)

Get content guidelines from template.

```javascript
async getContentGuidelines(templateName)
```

**Returns:** Promise<Object>
```javascript
{
  maxBulletsPerSlide: number,
  maxWordsPerBullet: number,
  maxSlidesPerDeck: number,
  tone: string,
  structure: string
}
```

##### getBrandingSpecs(templateName)

Get branding specifications from template.

```javascript
async getBrandingSpecs(templateName)
```

**Returns:** Promise<Object>
```javascript
{
  primaryFont: string,
  bodyFont: string,
  colors: {
    primary: string,
    secondary: string,
    accent: string
  }
}
```

#### CLI Usage

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

---

## API Patterns

### Error Handling

All classes follow consistent error handling:

**Pattern:**
```javascript
try {
  const result = await operation();
  return result;
} catch (error) {
  if (error.code === 429) {
    // Rate limit - retry with backoff
    await exponentialBackoff(attempt);
    return retry();
  }

  if (error.code === 404) {
    // Not found - provide fallback
    console.warn('Resource not found, using fallback');
    return fallback();
  }

  // Unhandled error - throw with context
  throw new Error(`Operation failed: ${error.message}`);
}
```

**Rate Limiting (429):**
- Automatic exponential backoff: 1s, 2s, 4s
- Max 3 retry attempts
- Applies to all API calls

**Not Found (404):**
- Template not found → fallback to `revpal-master`
- Presentation not found → throw error with clear message

**Authentication Errors:**
- Missing credentials → throw with setup instructions
- Invalid credentials → throw with renewal instructions

### Logging

**Verbose Mode:**
```javascript
log(message, data = null) {
  if (this.verbose) {
    console.log(`[ClassName] ${message}`, data !== null ? data : '');
  }
}
```

**Usage:**
```javascript
this.log('Loading template', { templateName: 'revpal-master' });
this.log('Operation complete');
```

**Output:**
```
[GoogleSlidesManager] Loading template { templateName: 'revpal-master' }
[GoogleSlidesManager] Operation complete
```

### Lazy Loading

API clients initialize only when needed:

```javascript
async _initializeApiClient() {
  if (this.slidesClient) {
    return;  // Already initialized
  }

  const { google } = require('googleapis');
  const auth = await this._getAuth();
  this.slidesClient = google.slides({ version: 'v1', auth });
  this.driveClient = google.drive({ version: 'v3', auth });

  this.log('API client initialized');
}
```

**Benefits:**
- Faster startup time
- Reduced memory usage
- Defer credential validation until needed

### Batch Operations

**Pattern:**
```javascript
async batchUpdate(presentationId, requests) {
  const batchSize = 100;
  const batches = [];

  // Split requests into batches of 100
  for (let i = 0; i < requests.length; i += batchSize) {
    batches.push(requests.slice(i, i + batchSize));
  }

  // Execute batches sequentially
  const results = [];
  for (const batch of batches) {
    const result = await this.slidesClient.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: batch }
    });
    results.push(result.data);
  }

  return {
    replies: results.flatMap(r => r.replies),
    batches: batches.length
  };
}
```

**Benefits:**
- Handles any number of requests
- Respects API limits (100 requests/batch)
- Atomic per-batch execution

### Template Inheritance

**Pattern:**
```javascript
async loadTemplateMetadata(templateName) {
  const template = JSON.parse(await fs.readFile(templatePath, 'utf8'));

  if (template.inheritsFrom) {
    const parent = await this.loadTemplateMetadata(template.inheritsFrom);

    // Merge child overrides parent
    template.branding = { ...parent.branding, ...template.branding };
    template.layouts = template.layouts || parent.layouts;
    template.contentGuidelines = {
      ...parent.contentGuidelines,
      ...template.contentGuidelines
    };
  }

  return template;
}
```

**Benefits:**
- DRY: Common settings in master template
- Flexibility: Child templates override specific settings
- Consistency: Branding inherited automatically

---

## Extension Points

### Adding New Layouts

**1. Update Template JSON:**

```json
{
  "layouts": [
    {
      "id": "CUSTOM_LAYOUT",
      "name": "My Custom Layout",
      "placeholders": [
        "{{custom_field_1}}",
        "{{custom_field_2}}"
      ],
      "recommendedFor": ["custom_content_type"],
      "description": "Description of when to use this layout"
    }
  ]
}
```

**2. Add Layout to Template:**

In Google Slides UI, create the layout with placeholder text using `{{tokens}}`.

**3. Use in Content Generation:**

```javascript
const slide = {
  layout: 'CUSTOM_LAYOUT',
  title: 'My Slide',
  content: {
    custom_field_1: 'Value 1',
    custom_field_2: 'Value 2'
  }
};
```

### Adding New Templates

**1. Create Template JSON:**

`templates/google-slides/my-template.json`

```json
{
  "inheritsFrom": "revpal-master",
  "templateId": "YOUR_GOOGLE_SLIDES_TEMPLATE_ID",
  "name": "My Template",
  "version": "1.0.0",
  "deckType": "custom_type",
  "targetAudience": ["custom_audience"],
  "contentGuidelines": {
    "maxSlidesPerDeck": 30,
    "tone": "professional, concise",
    "structure": "Custom structure"
  }
}
```

**2. Create Template in Google Slides:**

1. Clone revpal-master template
2. Customize layouts as needed
3. Share with service account
4. Copy template ID to JSON

**3. Use Template:**

```javascript
const template = await templateManager.selectTemplate('custom_type', 'custom_audience');
```

### Adding New Overflow Strategies

**1. Define Strategy:**

In `google-slides-layout-engine.js`:

```javascript
async customStrategy(slide, options) {
  this.log('Applying custom strategy', { slideId: slide.slideId });

  // Custom overflow resolution logic
  const result = await this._applyCustomFix(slide, options);

  return {
    applied: true,
    strategy: 'custom_strategy',
    details: result
  };
}
```

**2. Add Trigger:**

Update `_determineStrategy()`:

```javascript
_determineStrategy(overflowPercentage) {
  if (overflowPercentage < 0.10) {
    return 'none';
  } else if (overflowPercentage < 0.20) {
    return 'custom_strategy';  // NEW
  } else if (overflowPercentage < 0.30) {
    return 'reduce_font_size';
  }
  // ... rest of strategies
}
```

**3. Add to Quality Rules:**

In `config/slides-generation-rules.json`:

```json
{
  "overflowStrategies": {
    "tiers": [
      {
        "level": 1.5,
        "name": "Custom Strategy",
        "trigger": {
          "overflowPercentage": "10-20%"
        },
        "action": "custom_strategy",
        "parameters": {
          "customParam": "value"
        }
      }
    ]
  }
}
```

### Adding New Quality Gates

**1. Define Rule:**

In `config/slides-generation-rules.json`:

```json
{
  "quality_gates": {
    "custom_category": {
      "required": true,
      "severity": "error",
      "checks": [
        {
          "id": "custom_check",
          "name": "Custom Check Name",
          "description": "What this checks",
          "validation": "custom_validation_type",
          "parameters": {
            "threshold": 5
          }
        }
      ]
    }
  }
}
```

**2. Implement Validation:**

In agent or script:

```javascript
const { QualityGateValidator } = require('./scripts/lib/quality-gate-validator');
const validator = new QualityGateValidator();

validator.custom('Custom Check Name', () => {
  // Return true if passes, false if fails
  return customValidationLogic();
});

if (!validator.isValid()) {
  const errors = validator.getErrors();
  throw new Error(`Quality gates failed: ${errors.join(', ')}`);
}
```

### Integrating New LLM Providers

**1. Create Adapter:**

```javascript
class CustomLLMProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async generateText(prompt, options = {}) {
    // Call custom LLM API
    const response = await fetch('https://api.custom-llm.com/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, ...options })
    });

    const data = await response.json();
    return data.text;
  }
}
```

**2. Update GoogleSlidesContentGenerator:**

```javascript
constructor(options = {}) {
  this.verbose = options.verbose || false;

  // Allow provider injection
  if (options.llmProvider) {
    this.llmProvider = options.llmProvider;
  } else {
    // Default to Anthropic
    this.llmProvider = new AnthropicProvider();
  }
}
```

**3. Use Custom Provider:**

```javascript
const customProvider = new CustomLLMProvider(process.env.CUSTOM_LLM_API_KEY);

const generator = new GoogleSlidesContentGenerator({
  verbose: true,
  llmProvider: customProvider
});
```

---

## Testing Guide

### Unit Testing

**Setup:**

```javascript
const assert = require('assert');
const GoogleSlidesManager = require('./google-slides-manager');

describe('GoogleSlidesManager', () => {
  let manager;

  beforeEach(() => {
    manager = new GoogleSlidesManager({ verbose: false });
  });

  // Tests here
});
```

**Test Template Cloning:**

```javascript
it('should clone template and return new ID', async () => {
  const templateId = '1iFug0S1BfOx9uW__McTPNFXOidg47wqgavhIWQltcNU';
  const result = await manager.cloneTemplate(templateId, 'Test Deck');

  assert(result.presentationId);
  assert(result.url);
  assert(result.url.includes('presentation/d/'));
});
```

**Test Batch Operations:**

```javascript
it('should handle 150 requests in 2 batches', async () => {
  const requests = Array(150).fill({
    replaceAllText: {
      containsText: { text: '{{test}}' },
      replaceText: 'Test'
    }
  });

  const result = await manager.batchUpdate('ABC123', requests);

  assert.strictEqual(result.batches, 2);
  assert.strictEqual(result.replies.length, 150);
});
```

**Test Error Handling:**

```javascript
it('should retry on 429 rate limit', async () => {
  // Mock API to return 429 first, then success
  const stub = sinon.stub(manager.slidesClient.presentations, 'get')
    .onFirstCall().throws({ code: 429 })
    .onSecondCall().resolves({ data: { presentationId: 'ABC123' } });

  const result = await manager.getPresentation('ABC123');

  assert.strictEqual(stub.callCount, 2);
  assert.strictEqual(result.presentationId, 'ABC123');
});
```

### Integration Testing

**End-to-End Deck Creation:**

```javascript
describe('Full Workflow Integration', () => {
  it('should create complete deck from text', async () => {
    const input = {
      deck_type: 'executive_brief',
      topic: 'Test Topic',
      audience: 'executive',
      source_content: { type: 'text', data: 'Test content...' }
    };

    // Phase 2: Generate outline
    const contentGenerator = new GoogleSlidesContentGenerator({ verbose: false });
    const outline = await contentGenerator.generateOutline(input);

    assert(outline.outline.length > 0);
    assert(outline.outline.length <= 15);  // Executive brief limit

    // Phase 3: Select template
    const templateManager = new GoogleSlidesTemplateManager({ verbose: false });
    const template = await templateManager.selectTemplate(
      input.deck_type,
      input.audience
    );

    assert.strictEqual(template.deckType, 'executive_brief');

    // Phase 4: Generate content
    const content = await contentGenerator.generateSlideContent(outline);

    assert(content.slides.length === outline.outline.length);

    // Phase 5: Create presentation
    const slidesManager = new GoogleSlidesManager({ verbose: false });
    const presentation = await slidesManager.cloneTemplate(
      template.templateId,
      input.topic
    );

    assert(presentation.presentationId);

    // Phase 6: Validate
    const layoutEngine = new GoogleSlidesLayoutEngine({ verbose: false });
    const finalPresentation = await slidesManager.getPresentation(
      presentation.presentationId
    );
    const overflowSlides = await layoutEngine.validateLayout(finalPresentation);

    assert(Array.isArray(overflowSlides));

    console.log(`✅ Created presentation: ${presentation.url}`);
  });
});
```

### Mocking External Services

**Mock Google Slides API:**

```javascript
const sinon = require('sinon');

const mockSlidesClient = {
  presentations: {
    create: sinon.stub().resolves({
      data: { presentationId: 'mock123', presentationUrl: 'https://...' }
    }),
    get: sinon.stub().resolves({
      data: { presentationId: 'mock123', slides: [] }
    }),
    batchUpdate: sinon.stub().resolves({
      data: { replies: [] }
    })
  }
};

manager.slidesClient = mockSlidesClient;
```

**Mock LLM Provider:**

```javascript
class MockLLMProvider {
  async generateText(prompt, options = {}) {
    return 'Mock generated content';
  }
}

const generator = new GoogleSlidesContentGenerator({
  llmProvider: new MockLLMProvider()
});
```

### Manual Testing Checklist

**Before Release:**

- [ ] Create deck from text (500+ words)
- [ ] Create deck from CSV (10+ rows)
- [ ] Create deck from RevPal template
- [ ] Modify existing deck (add slide)
- [ ] Modify existing deck (update text)
- [ ] Modify existing deck (remove slide)
- [ ] Verify branding on all decks
- [ ] Test overflow handling (create slide with 200-word text)
- [ ] Export to PDF and verify formatting
- [ ] Validate WCAG color contrast
- [ ] Test with no internet (graceful error)
- [ ] Test with invalid credentials (clear error message)

**Performance Tests:**

- [ ] Create 50-slide deck (< 60 seconds)
- [ ] Clone template (< 5 seconds)
- [ ] Batch update 100 requests (< 10 seconds)
- [ ] Generate outline from 5000-word text (< 30 seconds)

---

## Performance Considerations

### API Quotas

**Google Slides API Limits:**
- 300 requests per 10 seconds
- 100 requests per user per 100 seconds

**Mitigation:**
- Batch operations (100 requests/batch)
- Exponential backoff on 429
- Request pacing in high-volume scenarios

**Monitor Usage:**
```bash
# View quota usage
# https://console.cloud.google.com/apis/api/slides.googleapis.com/quotas
```

### Memory Management

**Template Caching:**
- In-memory cache: `Map<string, Object>`
- Cache cleared on: `clearCache()`
- Memory impact: ~10KB per template

**Lazy Loading:**
- API clients: Load on first use
- Templates: Load on first access
- Memory savings: ~50MB until first API call

### Network Optimization

**Batch Operations:**
- Single API call for 100 operations
- Reduces latency by 99%
- Example: 150 text replacements = 2 API calls (not 150)

**Parallel Execution:**
- Content generation + template cloning in parallel
- Outline + template selection in parallel
- 30% faster overall workflow

### Caching Strategies

**Template Metadata:**
- Cached after first load
- Lifetime: Session duration
- Invalidation: `clearCache()` or process restart

**API Responses:**
- Not cached (always fresh)
- Rate limit headers used for pacing

---

## Troubleshooting

### Debug Mode

**Enable Verbose Logging:**

```javascript
const manager = new GoogleSlidesManager({ verbose: true });
```

**Output:**
```
[GoogleSlidesManager] Initializing API client
[GoogleSlidesManager] Cloning template { templateId: '1iFug...' }
[GoogleSlidesManager] Template cloned { presentationId: 'ABC123' }
```

**CLI Verbose:**

```bash
node scripts/lib/google-slides-manager.js clone <id> <title> --verbose
```

### Common Issues

**"Cannot find module 'googleapis'"**

**Cause:** Missing dependency

**Solution:**
```bash
npm install googleapis
```

**"Invalid authentication credentials"**

**Cause:** GOOGLE_APPLICATION_CREDENTIALS not set or invalid

**Solution:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Verify file exists
ls -la $GOOGLE_APPLICATION_CREDENTIALS

# Verify scopes include presentations
cat $GOOGLE_APPLICATION_CREDENTIALS | jq '.scopes'
```

**"Template not found" (404)**

**Cause:** Template ID incorrect or not shared with service account

**Solution:**
1. Verify template ID
2. Share template with service account email (found in credentials.json)
3. Test access:
```bash
node scripts/lib/google-slides-manager.js get <templateId> --verbose
```

**"Rate limit exceeded" (429)**

**Cause:** Too many requests in short time window

**Solution:**
- Automatic retry will handle it
- If persistent, check for infinite loops
- Monitor quota usage in Google Cloud Console

### Validation Failures

**Quality Gate Failures:**

Check validation details in output:
```
❌ Quality gates failed:
  - No unreplaced placeholders: FAILED ({{bullet_3}} on slide 5)
  - WCAG color contrast: FAILED (3.2:1 on slide 8, need 4.5:1)
```

**Fix:**
1. Replace placeholders manually in Google Slides UI
2. Adjust colors for contrast compliance
3. Or disable strict validation (not recommended):
```bash
export GOOGLE_SLIDES_ENFORCE_QUALITY_GATES=0
```

---

## Additional Resources

### Google APIs

- **Slides API v1:** https://developers.google.com/slides/api
- **Drive API v3:** https://developers.google.com/drive/api
- **API Explorer:** https://developers.google.com/slides/api/reference/rest

### Related Documentation

- **User Guide:** `GOOGLE_SLIDES_GUIDE.md`
- **Plugin README:** `README.md`
- **CLAUDE.md:** Project standards and conventions

### Support

- **GitHub Issues:** https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Internal Reflection:** Use `/reflect` command

---

**Version:** 1.25.0
**Last Updated:** 2025-12-08
**Maintained By:** RevPal Engineering
