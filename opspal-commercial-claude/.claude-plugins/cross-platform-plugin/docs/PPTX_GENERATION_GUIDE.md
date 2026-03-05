# PPTX Generation Guide

## Overview

The Cross-Platform Plugin includes offline PPTX generation built on a shared slide spec. This pipeline produces branded PowerPoint decks from markdown without external APIs.

**Version**: 1.0.0  
**Status**: Beta (offline)

## Quick Start

```bash
# Single markdown file
node scripts/lib/pptx-generator.js report.md report.pptx

# Multiple markdown files
node scripts/lib/pptx-generator.js "reports/*.md" combined.pptx --title "Q4 Report"
```

## Supported Inputs

- `.md` or `.markdown`: parsed directly
- `.docx`: uses `pandoc` or `docx2txt` if available
- `.pdf`: uses `pdftotext` if available
- `.log` or `.txt`: normalized into sections (Errors, Warnings, Info, Details)

If conversion tools are missing (or return no text), the generator fails fast unless `--allow-empty` is provided. With `--allow-empty`, it inserts a conversion warning slide instead of returning empty output.

## LLM Summarization (Executive Profile)

Decks read differently than reports. The generator can summarize long paragraphs and dense bullet lists into concise executive bullets.

- Enabled by default when `ANTHROPIC_API_KEY` is set
- Executive profile targets 3-4 bullets per slide, 12 words max
- Use `--no-llm` to disable and stick to deterministic heuristics

## Embedded Fonts (Required for Brand Fidelity)

The PPTX generator merges embedded fonts from a template PPTX. Place the default template at:

`templates/powerpoint/solutions-proposal/solutions-proposal-template.pptx`

### Create the Template

1. Open a branded PPTX with Montserrat and Figtree fonts installed.
2. File -> Options -> Save -> Enable "Embed fonts in the file".
3. Save as `solutions-proposal-template.pptx` in the templates folder.

If the template is missing, generation will fail with a clear error.

## Slide Spec Contract

The slide spec is a JSON contract that drives both PPTX and Google Slides rendering.

**Schema:** `schemas/slide-spec.schema.json`

Additional metadata fields:
- `deckPurpose`: short description of why the deck exists (e.g., sales pitch, QBR).
- `persona`: target audience persona (e.g., CEO, RevOps, CFO).

Layouts supported:
- `TITLE`
- `SECTION`
- `CONTENT`
- `KPI`
- `TWO_COLUMN`
- `TABLE`
- `IMAGE`
- `PROCESS`
- `TIMELINE`
- `QUOTE`
- `CHART`
- `CHART_TEXT`
- `CODE`
- `CLOSING`
- `APPENDIX`

Optional slide fields:
- `punchline`: TL;DR statement for one-column content slides.
- `slideKind`: `editable` (default) or `static` (locked content).

## Markdown Conventions

- **Punchlines**: add a line like `Punchline: Short takeaway` (or `TL;DR:`) before a list/paragraph to attach a punchline to the next slide.
- **Static slides**: append `[static]` or `(static)` to a heading to lock that section from summarization and auto-rewrites.

## Mermaid Diagrams

Mermaid diagrams are rendered to PNG images using `mermaid-pre-renderer.js` and inserted into IMAGE slides.

Disable with `--no-mermaid`.

## Optional Google Slides Output

Use the shared slide spec to render a Google Slides deck when collaboration is required.

```bash
node scripts/lib/slide-spec-generator.js report.md /tmp/spec.json
node scripts/lib/google-slides-spec-renderer.js /tmp/spec.json --template revpal-master
```

## CLI Options

```
--title "TEXT"         Presentation title
--subtitle "TEXT"      Presentation subtitle
--org "NAME"           Organization name
--version "VER"        Version label
--profile "NAME"       Content profile (executive, standard, detailed)
--deck-purpose "TEXT"  Deck purpose metadata (optional)
--persona "TEXT"       Audience persona metadata (optional)
--no-llm               Disable LLM summarization
--model "MODEL"        Override Claude model (optional)
--allow-empty          Allow DOCX/PDF conversion fallback slide
--no-mermaid           Skip Mermaid rendering
--no-embed-fonts       Skip embedded-font merge
--font-template PATH   PPTX template path (embedded fonts)
--verbose              Verbose logging
```

## Quality Gates

The slide spec generator enforces:
- Max bullets per slide
- Max words per bullet
- Max words per slide (runbook density check)
- Placeholder detection
- Slide count limits
- Assertion-title and bullet hygiene warnings (BLUF, single-idea bullets)

These limits are sourced from `config/slides-generation-rules.json`.

## Troubleshooting

**Error:** Embedded font template not found  
**Fix:** Add `templates/powerpoint/solutions-proposal/solutions-proposal-template.pptx` or set `PPTX_FONT_TEMPLATE`.

**Error:** `zip` or `unzip` not found  
**Fix:** Install system zip utilities; required for font embedding.

## Next Steps

- Add layout-specific refinements (charts, tables, visuals)
- Expand slide spec coverage for advanced report types
- Add regression test fixtures and visual diff pipeline
