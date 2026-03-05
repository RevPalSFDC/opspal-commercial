---
name: generate-pptx
description: Generate an offline PPTX deck from markdown with RevPal branding and embedded fonts
argument-hint: "[input.md|glob] [output.pptx] [--title <text>] [--org <name>] [--profile <executive|standard|detailed>] [--no-llm] [--allow-empty] [--no-mermaid] [--no-embed-fonts] [--font-template <path>]"
stage: ready
---

# Generate PPTX Command

Create offline PowerPoint decks from markdown or a slide spec. Uses the shared slide spec pipeline and defaults to embedded-font output via a template PPTX.

## Usage

```bash
/generate-pptx [input.md|glob] [output.pptx] [options]
```

## Quick Examples

**Single Document:**
```bash
/generate-pptx report.md report.pptx
```

**Multiple Documents:**
```bash
/generate-pptx "reports/*.md" complete-report.pptx --title "Q4 Report"
```

## Required Template (Embedded Fonts)

The generator expects an embedded-font template at:

`templates/powerpoint/solutions-proposal/solutions-proposal-template.pptx`

See `templates/powerpoint/README.md` for creation steps.

## LLM Summarization (Recommended)

Executive decks benefit from LLM summarization to reduce report-style prose. Set `ANTHROPIC_API_KEY` to enable Claude summarization.

## Task Breakdown

### Step 1: Parse User Input
- Determine input (single file vs glob)
- Extract output filename
- Parse optional metadata flags (title, org, version)
- Confirm embedded-font template path

### Step 2: Build Slide Spec
- Use `SlideSpecGenerator` to convert markdown into a shared slide spec
- Validate slide limits (max bullets, max words per bullet)
- Render Mermaid diagrams to images (unless `--no-mermaid`)
- Fail fast on unsupported DOCX/PDF conversion unless `--allow-empty` is supplied

### Step 3: Generate PPTX
- Use `PptxGenerator` to render slides offline
- Apply RevPal theme defaults (colors, fonts, logo)
- Embed fonts using the template PPTX unless `--no-embed-fonts`

### Step 4: Report Results
- Return output path, slide count, and any warnings
- If font embedding failed, provide the missing template path and instructions

## Options Reference

| Flag | Description | Default |
|------|-------------|---------|
| `--title "TEXT"` | Presentation title | Derived from file |
| `--org "NAME"` | Organization name | Empty |
| `--version "VER"` | Version label | 1.0 |
| `--profile "NAME"` | Content profile (`executive`, `standard`, `detailed`) | executive |
| `--no-llm` | Disable LLM summarization and use heuristic bullets | false |
| `--allow-empty` | Allow DOCX/PDF conversion to fall back to a warning slide | false |
| `--no-mermaid` | Skip Mermaid rendering | false |
| `--no-embed-fonts` | Skip embedded fonts | false |
| `--font-template` | Template PPTX path | `templates/powerpoint/solutions-proposal/solutions-proposal-template.pptx` |
| `--verbose` | Verbose logging | false |

## Implementation Reference

```javascript
const PptxGenerator = require('../scripts/lib/pptx-generator');
const generator = new PptxGenerator({ embedFonts: true });

await generator.generateFromMarkdown('report.md', 'report.pptx', {
  title: 'Q4 Report',
  org: 'ACME Corp'
});
```
