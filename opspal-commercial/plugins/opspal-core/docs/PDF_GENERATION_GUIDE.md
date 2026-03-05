# PDF Generation Guide

## Overview

The OpsPal Core now includes comprehensive **Markdown to PDF generation** with support for:
- ✅ Single document conversion
- ✅ Multi-document collation with table of contents
- ✅ Automatic Mermaid diagram rendering
- ✅ Optional PDF bookmarks (best-effort; requires pdftk/qpdf)
- ✅ Professional cover pages
- ✅ Custom styling and metadata

**Version**: 1.4.0
**Status**: Production Ready

## Quick Start

### Single Document to PDF

```bash
# Via Command
/generate-pdf report.md report.pdf

# Via Agent
"Convert the conflict report to PDF"

# Programmatic
const PDFGenerator = require('./scripts/lib/pdf-generator');
const generator = new PDFGenerator();
await generator.convertMarkdown('report.md', 'report.pdf', {
    renderMermaid: true
});
```

### Multiple Documents with TOC

```bash
# Via Command
/generate-pdf "instances/acme/*.md" acme-complete.pdf --toc --cover salesforce-audit

# Via Agent
"Generate a complete PDF for the ACME audit with all reports and diagrams"

# Programmatic
await generator.collate([
    { path: 'summary.md', title: 'Executive Summary' },
    { path: 'analysis.md', title: 'Technical Analysis' },
    { path: 'plan.md', title: 'Remediation Plan' }
], 'complete-audit.pdf', {
    toc: true,
    renderMermaid: true,
    coverPage: { template: 'salesforce-audit' }
});
```

## Preset Profiles

Use profiles to standardize branded output across machines:

- `simple` - Branded PDF with no cover and no TOC (uses `revpal-brand`)
- `cover-toc` - Branded PDF with cover page and TOC (uses `revpal`)

**Example:**
```bash
/generate-pdf report.md report.pdf --profile simple
```

## Features

### 1. Mermaid Diagram Rendering

Automatically detects and renders Mermaid diagrams to images:

```markdown
\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]
\`\`\`
```

**Becomes**: High-quality PNG/SVG image in PDF

**Supported Diagram Types:**
- Flowcharts
- Entity Relationship Diagrams (ERD)
- Sequence Diagrams
- State Diagrams
- Gantt Charts
- Pie Charts
- Journey Maps

### 2. Table of Contents

Automatically generates clickable TOC with:
- Hierarchical heading structure
- Page number placeholders (when supported)
- Customizable depth (1-6 heading levels)
- Cross-document navigation

**Bookmarks Note:** PDF outline bookmarks are best-effort and require `pdftk` or `qpdf`.

**Example TOC Output:**
```
## Table of Contents

- Executive Summary
  - Key Findings
  - Recommendations
- Technical Analysis
  - Data Quality Issues
  - System Performance
- Remediation Plan
  - Phase 1: Quick Wins
  - Phase 2: Major Improvements
```

### 3. Professional Cover Pages

Four built-in templates:

**salesforce-audit** - For Salesforce automation audits
```markdown
# ACME Corp Automation Audit

**Organization:** ACME Corp
**Generated:** 2025-10-21
**Version:** 1.0
```

**hubspot-assessment** - For HubSpot portal assessments
**executive-report** - For leadership reports
**default** - Generic professional cover

**Custom variables:**
- `{{title}}` - Report title
- `{{org}}` / `{{portal}}` - Organization name
- `{{date}}` - Generation date
- `{{version}}` - Document version
- `{{period}}` - Reporting period
- `{{assessmentType}}` - Assessment type

### 4. Document Collation

Intelligently orders documents based on:
- Manual `order` field
- Filename patterns (executive → analysis → plan → appendix)
- Alphabetical sorting

**Auto-detected patterns:**
- `summary`, `overview`, `executive` → Priority 1
- `introduction`, `getting-started` → Priority 2
- `analysis`, `detailed` → Priority 3
- `plan`, `roadmap`, `remediation` → Priority 4
- `implementation`, `deployment` → Priority 5
- `conclusion`, `next-steps` → Priority 6
- `appendix`, `reference` → Priority 7

### 5. Cross-Document Links

Automatically resolves links between documents in collated PDFs:

```markdown
<!-- In document A -->
See the [detailed analysis](analysis.md#findings)

<!-- Becomes in PDF -->
See the [detailed analysis](#findings)
```

## API Reference

### PDFGenerator Class

```javascript
const PDFGenerator = require('./scripts/lib/pdf-generator');
const generator = new PDFGenerator(options);
```

**Constructor Options:**
- `verbose` (boolean) - Enable verbose logging
- `tempDir` (string) - Temporary directory for processing

#### convertMarkdown(inputPath, outputPath, options)

Convert single markdown file to PDF.

**Parameters:**
- `inputPath` (string) - Source markdown file
- `outputPath` (string) - Destination PDF file
- `options` (object):
  - `renderMermaid` (boolean) - Render Mermaid diagrams
  - `format` (string) - Page format ('A4', 'Letter')
  - `margin` (string) - Page margins ('20mm')
  - `addCoverPage` (boolean) - Add cover page
  - `coverPage` (object) - Cover page config
  - `metadata` (object) - Document metadata
  - `profile` (string) - Preset profile (`simple`, `cover-toc`)

**Returns**: Promise<string> - Path to generated PDF

**Example:**
```javascript
await generator.convertMarkdown('report.md', 'report.pdf', {
    renderMermaid: true,
    metadata: {
        title: 'Quarterly Report',
        org: 'ACME Corp',
        date: '2025-10-21'
    }
});
```

#### collate(documents, outputPath, options)

Collate multiple documents into single PDF.

**Parameters:**
- `documents` (Array<object>) - Documents to collate
  - `path` (string) - File path
  - `title` (string) - Document title
  - `order` (number, optional) - Sort order
- `outputPath` (string) - Destination PDF
- `options` (object):
  - `toc` (boolean) - Generate table of contents
  - `tocDepth` (number) - TOC heading depth (1-6)
  - `bookmarks` (boolean) - Add PDF bookmarks (best-effort; requires pdftk/qpdf)
  - `sectionBreaks` (boolean) - Add section breaks
  - `renderMermaid` (boolean) - Render diagrams
  - `coverPage` (object) - Cover page config
  - `metadata` (object) - PDF metadata
  - `profile` (string) - Preset profile (`simple`, `cover-toc`)

**Returns**: Promise<string> - Path to generated PDF

**Example:**
```javascript
const documents = [
    { path: 'summary.md', title: 'Executive Summary', order: 0 },
    { path: 'details.md', title: 'Details', order: 1 }
];

await generator.collate(documents, 'complete.pdf', {
    toc: true,
    tocDepth: 3,
    renderMermaid: true,
    coverPage: { template: 'executive-report' },
    metadata: {
        title: 'Complete Report',
        org: 'ACME',
        version: '2.0'
    }
});
```

#### fromGlob(pattern, outputPath, options)

Generate PDF from glob pattern.

**Parameters:**
- `pattern` (string) - Glob pattern ('*.md', 'reports/**/*.md')
- `outputPath` (string) - Destination PDF
- `options` (object) - Same as collate()

**Returns**: Promise<string> - Path to generated PDF

**Example:**
```javascript
await generator.fromGlob(
    'instances/acme/audit-2025-01/*.md',
    'acme-audit-complete.pdf',
    { toc: true, renderMermaid: true }
);
```

## Command Reference

### /generate-pdf

```bash
/generate-pdf [input] [output] [options]
```

**Options:**
- `--toc` - Generate table of contents
- `--toc-depth N` - TOC depth (default: 3)
- `--bookmarks` - Add PDF bookmarks (best-effort; requires pdftk/qpdf)
- `--no-mermaid` - Skip Mermaid rendering
- `--cover TEMPLATE` - Cover page template
- `--title "TEXT"` - PDF title
- `--org "NAME"` - Organization name
- `--version "VER"` - Document version
- `--verbose` - Verbose output

**Examples:**
```bash
# Single file
/generate-pdf report.md report.pdf

# Multiple files with full features
/generate-pdf "audit/*.md" audit-complete.pdf --toc --cover salesforce-audit --org "ACME"

# Custom metadata
/generate-pdf "reports/*.md" quarterly.pdf --title "Q4 2025 Report" --version "2.1"
```

## Agent Usage

The `pdf-generator` agent handles natural language requests:

**Example Requests:**
- "Convert this report to PDF"
- "Generate a PDF from all the audit documents"
- "Create a single PDF with TOC from these markdown files"
- "Make a PDF with the Salesforce audit cover page"

**The agent will:**
1. Locate source documents
2. Determine single vs multi-document approach
3. Auto-detect if Mermaid rendering needed
4. Select appropriate cover page template
5. Generate PDF with optimal settings
6. Provide detailed confirmation

## Integration Examples

See [PDF_GENERATION_INTEGRATION.md](./PDF_GENERATION_INTEGRATION.md) for:
- Executive reporter integration
- Automation audit workflows
- HubSpot assessment PDFs
- Error handling patterns
- Performance optimization
- Testing strategies

## Performance

**Benchmarks (typical hardware):**
- Single document (no diagrams): <5 seconds
- Single document (5 diagrams): <15 seconds
- 10-document collation (no diagrams): <20 seconds
- 10-document collation (20 diagrams): <60 seconds

**File Sizes:**
- Text-heavy report (50 pages): ~500 KB
- Report with 10 diagrams: ~2-3 MB
- Complete audit (4 docs, 15 diagrams): ~3-5 MB

## Troubleshooting

### Issue: "No files found"
```
Solution: Check glob pattern syntax, use quotes around wildcards
Example: /generate-pdf "*.md" not /generate-pdf *.md
```

### Issue: "Mermaid rendering failed"
```
Solutions:
1. Validate diagram syntax with /diagram-generator
2. Use --no-mermaid to skip rendering
3. Check diagram doesn't exceed complexity limits
```

### Issue: "PDF is very large (>50MB)"
```
Solutions:
1. Reduce image resolution
2. Use SVG instead of PNG for diagrams
3. Split into multiple smaller PDFs
4. Compress images before embedding
```

### Issue: "Permission denied"
```
Solutions:
1. Check write permissions on output directory
2. Ensure output file is not open in PDF viewer
3. Use different output path
```

## Dependencies

**Installed packages:**
- `md-to-pdf@5.2.5` - Markdown to PDF conversion (~2MB)
- `pdf-lib@1.17.1` - PDF manipulation (~500KB)

**Total size:** ~100MB (includes Chromium for rendering)

### md-to-pdf Version Notes (v5.2.5+)

**Important**: md-to-pdf is used as a **Node.js library** in this codebase, not via CLI.

**If using CLI directly** (not recommended - use our helper scripts instead):
- v5.2.5 CLI syntax changed: `--dest` flag is no longer supported
- Use: `md-to-pdf input.md` (outputs to stdout) or `md-to-pdf input.md > output.pdf`
- For programmatic use: Pass `dest` option to the `mdToPdf()` function (still works)

**Recommended approach**: Always use our PDFGenerator class or PDFGenerationHelper:
```javascript
// Correct - uses the Node.js API
const PDFGenerator = require('./scripts/lib/pdf-generator');
await generator.convertMarkdown('input.md', 'output.pdf', { renderMermaid: true });
```

## Roadmap

**Planned Features:**
- [ ] Accurate PDF bookmarks with real page numbers (beyond pdftk/qpdf estimates)
- [ ] Custom CSS stylesheets
- [ ] Page headers and footers
- [ ] Page numbering in TOC
- [ ] SVG diagram export option
- [ ] Compression options
- [ ] Batch processing CLI
- [ ] Google Drive upload integration

## Changelog

### v1.4.0 (2025-10-21)
- ✨ Initial PDF generation feature
- ✨ Single document conversion
- ✨ Multi-document collation
- ✨ Mermaid diagram pre-rendering
- ✨ Table of Contents generation
- ✨ 4 professional cover page templates
- ✨ pdf-generator agent
- ✨ /generate-pdf command
- 📚 Complete documentation and integration guide

---

**Questions or issues?** See the main [OpsPal Core README](../README.md) or [file an issue](https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues).
