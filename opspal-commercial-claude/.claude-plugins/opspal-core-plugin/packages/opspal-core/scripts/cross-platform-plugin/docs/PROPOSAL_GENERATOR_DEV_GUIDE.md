# Proposal Generator Development Guide

Last Updated: 2025-12-09

## Overview

The Aspire Proposal Generator creates personalized Google Slides proposals from discovery call transcripts. It uses **template-based slide selection** combined with **LLM-powered content generation**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROPOSAL GENERATION PIPELINE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  PHASE 1     │    │  PHASE 2     │    │  PHASE 3     │       │
│  │  Parse       │───▶│  Select      │───▶│  Clone &     │       │
│  │  Transcript  │    │  Slides      │    │  Trim        │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Pain points  │    │ Score 46     │    │ Clone template│       │
│  │ Tech stack   │    │ template     │    │ Remove unused │       │
│  │ Budget/time  │    │ slides       │    │ slides        │       │
│  │ Stakeholders │    │ Select 8-12  │    │               │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                 │                │
│                                                 ▼                │
│                              ┌──────────────────────────────┐   │
│                              │        PHASE 4               │   │
│                              │  Populate Slides             │   │
│                              │  - NET NEW: Generate content │   │
│                              │  - TEMPLATE: Personalize     │   │
│                              └──────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

### Main Script
| File | Purpose |
|------|---------|
| `generate-aspire-proposal.js` | Main entry point, orchestrates the pipeline |

### Libraries (in `lib/`)
| File | Purpose |
|------|---------|
| `transcript-parser.js` | Parses CSV transcripts, extracts pain points, tech stack, budget |
| `slide-selection-engine.js` | Scores and selects relevant slides from template catalog |
| `slide-content-generator.js` | Generates content for NET NEW slides |
| `google-slides-manager.js` | Google Slides API wrapper |
| `claude-api-client.js` | Anthropic API wrapper for LLM calls |
| `transcript-semantic-analyzer.js` | LLM-powered deep transcript analysis (--enhance mode) |
| `proposal-persona-engine.js` | Persona detection and content reframing |
| `proposal-enhancement-reviewer.js` | Post-generation quality review |

### Configuration
| File | Purpose |
|------|---------|
| `config/template-slide-catalog.json` | Metadata for all 46 template slides |
| `config/slide-selection-rules.json` | Selection quotas and constraints |

## Slide Types

### 1. NET NEW Slides (Generated from Scratch)
Created using Google's predefined layouts, populated with transcript content.

| Slide | Layout | Content Source |
|-------|--------|----------------|
| Title | `TITLE` | Client name, contact, services |
| Executive Summary | `TITLE_AND_BODY` | Approach + Outcomes (LLM-generated) |
| What We Heard | `TITLE_AND_BODY` | Pain points (LLM-summarized) + Quote + Tech |

### 2. Template Slides (Selected & Personalized)
Kept from the 46-slide template, with minimal personalization.

| Type | Personalization |
|------|-----------------|
| `service` | None (keep template content) |
| `caseStudy` | None (keep template content) |
| `investment` | Budget/timeline from transcript |
| `closing` | Client name replacement |

## Content Generation Flow

### Pain Points → What We Heard Slide

```
Transcript
    │
    ▼
TranscriptParser.parse()
    │ extracts raw pain points
    ▼
SlideContentGenerator.generateWhatWeHeard()
    │ prioritizes & categorizes
    ▼
populateWhatWeHeardSlide()
    │
    ├── summarizePainPoints() ←── Claude API
    │   └── "8-12 word concise statements"
    │
    ├── Quote (truncated to 60 chars)
    │
    └── Tech stack (top 4 tools)
```

### Executive Summary Flow

```
SlideContentGenerator.generateExecutiveSummary()
    │
    ├── buildApproachBullets()  ←── "Our Approach" section
    │   └── Maps services to action statements
    │
    └── buildOutcomeBullets()   ←── "Expected Outcomes" section
        └── Maps pain points to outcome statements
```

## Key Functions

### `summarizePainPoints(painPoints)`
Uses Claude to convert verbose transcript pain points into concise 8-12 word statements.

```javascript
// Input: ["Account ownership transfers require manual admin intervention for AE-to-AE transfers"]
// Output: ["Account transfers between AEs require manual admin approval"]
```

### `populateSlideElements(presentationId, slideIndex, elements)`
Populates a slide's placeholders with text content.

```javascript
await slidesManager.populateSlideElements(presentationId, slideIndex, [
  { index: 0, text: 'Headline', fontSize: 32, bold: true },
  { index: 1, text: 'Body content', fontSize: 14 }
]);
```

### Text Styling
All NET NEW slides use explicit RGB colors (not theme colors) because predefined layouts don't inherit template themes.

```javascript
// In google-slides-manager.js replaceElementText()
foregroundColor: {
  rgbColor: { red: 0.2, green: 0.2, blue: 0.2 }  // Dark gray
}
```

## CLI Usage

```bash
# Basic generation
node generate-aspire-proposal.js --transcript <file>

# Specify slide count
node generate-aspire-proposal.js --transcript <file> --slides 12

# Update existing presentation
node generate-aspire-proposal.js --transcript <file> --id <presentation-id>

# Preview slide selection without generating
node generate-aspire-proposal.js --transcript <file> --preview-selection

# Enhanced mode (LLM semantic analysis + persona)
node generate-aspire-proposal.js --transcript <file> --enhance

# Enhanced with specific persona
node generate-aspire-proposal.js --transcript <file> --enhance --persona executive
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...        # Required for LLM summarization
GOOGLE_APPLICATION_CREDENTIALS=...   # For Google Slides API
```

## Known Limitations

### 1. Predefined Layouts Don't Inherit Theme
NET NEW slides use Google's predefined layouts (TITLE, TITLE_AND_BODY) which don't inherit the template's theme colors/fonts. We work around this with explicit RGB styling.

### 2. TEXT_AUTOFIT Unreliable
Google's TEXT_AUTOFIT API is unreliable (Google Issue #191389037). We removed it and use content truncation/summarization instead.

### 3. Placeholder Dimensions
TITLE_AND_BODY body placeholder: ~9" x 3.7" (~648x267 points)
- At 14pt Montserrat: ~70-80 chars/line, 12-14 lines
- We target 8-12 word summaries to fit comfortably

## Future Improvements (Phase 2)

### Template Duplication (Recommended)
Instead of using predefined layouts for NET NEW slides, duplicate styled template slides:

```javascript
// Current approach (has styling issues):
await slidesManager.addSlide(presentationId, 'TITLE_AND_BODY', {...});

// Better approach:
const templateSlideId = catalog.getBlankContentSlide();
await slidesManager.duplicateSlide(presentationId, templateSlideId, position);
// Then just replace placeholder text (inherits all styling)
```

**Benefits:**
- Inherits template colors, fonts, spacing
- No explicit RGB color codes needed
- Consistent look with other slides

### Implementation Steps
1. Identify/create blank content slides in template
2. Add to `template-slide-catalog.json`
3. Modify `createNetNewSlide()` to use duplication
4. Remove explicit styling code

## Debugging

### View Generated Content
Add `--verbose` flag or insert console.logs:

```javascript
console.log('Pain points:', JSON.stringify(rawPainPoints, null, 2));
console.log('Summarized:', JSON.stringify(summarizedPainPoints, null, 2));
```

### Test Summarization Independently
```javascript
const ClaudeAPIClient = require('./lib/claude-api-client');
const client = new ClaudeAPIClient();

const result = await client.completeJSON(`
  Summarize into 8-12 words: "Account ownership transfers require manual admin intervention"
`);
console.log(result);
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Invisible text | Theme color on predefined layout | Use explicit RGB colors |
| Text overflow | Content too long | Increase truncation/summarization |
| Over-truncation | Aggressive char limit | Use LLM summarization instead |
| Slide not created | Wrong layout name | Check Google Slides API docs |

## Template Information

- **Template ID:** `1VUGRtUbqwz-UIc9J2pDXp3PQllFdv9K27cHPrM-urhc`
- **Total Slides:** 46
- **Mandatory Slides:** Title (0), Executive Summary (1), Investment (last)

## Related Documentation

- [Google Slides API](https://developers.google.com/slides/api)
- [Anthropic API](https://docs.anthropic.com/claude/reference)
- Plan file: `/home/chris/.claude/plans/kind-wibbling-karp.md`

## Changelog

### 2025-12-09
- Added LLM summarization for pain points (replaces truncation)
- Differentiated Executive Summary from What We Heard content
- Increased truncation limits (45→70→80 chars)
- Implemented smart word-boundary truncation
- Removed TEXT_AUTOFIT (unreliable via API)
- Changed body font from 12pt to 14pt
