---
name: generate-pdf
description: Convert markdown documents to professional PDFs with diagram rendering, multi-document collation, and table of contents
stage: ready
---

# Generate PDF Command

Convert markdown documents to professional, print-ready PDFs with support for Mermaid diagram rendering, multi-document collation, table of contents, and custom cover pages.

## Usage

```bash
/generate-pdf [input-pattern] [output.pdf] [options]
```

## Quick Examples

**Single Document:**
```bash
/generate-pdf report.md report.pdf
```

**Multiple Documents with TOC:**
```bash
/generate-pdf "instances/acme/*.md" acme-complete.pdf --toc --cover audit
```

**All Reports in Directory:**
```bash
/generate-pdf "instances/*/audit-2025-01/*.md" all-audits.pdf --collate --toc
```

## Task Breakdown

### Step 1: Parse User Input

**Analyze the command arguments:**
- Determine if single file or pattern
- Extract output filename
- Parse option flags
- Identify cover page template (if specified)

**If no arguments provided:**
- Prompt user for input pattern
- Suggest intelligent defaults based on current directory
- Ask about options (TOC, cover page, Mermaid rendering)

### Step 2: Locate Source Files

**For Single File:**
```javascript
// Direct file path
const inputFile = resolveFilePath(args[0]);
const exists = await fs.access(inputFile);
```

**For Pattern/Glob:**
```javascript
const glob = require('glob');
const files = await glob(args[0], { nodir: true });

if (files.length === 0) {
    throw new Error(`No markdown files found matching: ${args[0]}`);
}
```

**Interactive Mode (no args):**
```javascript
// Suggest files in current directory
const suggestions = await glob('*.md');
// Ask user to select or enter custom path
```

### Step 3: Determine PDF Generation Strategy

**Single Document Strategy:**
- Simple conversion with optional Mermaid rendering
- Optional cover page
- Metadata from front matter or filename

**Multi-Document Strategy:**
- Automatic document collation
- Generate table of contents
- Add section breaks
- Resolve cross-document links
- Create unified PDF

**User Confirmation:**
```
Found 4 markdown documents:
1. EXECUTIVE_SUMMARY.md
2. TECHNICAL_ANALYSIS.md
3. CONFLICT_REPORT.md
4. REMEDIATION_PLAN.md

Generate combined PDF with:
✅ Table of Contents
✅ Mermaid diagram rendering
✅ Salesforce Audit cover page
📄 Output: complete-audit.pdf

Proceed? [Y/n]
```

### Step 4: Generate PDF

**Use PDF Generator Library:**
```javascript
const PDFGenerator = require('../scripts/lib/pdf-generator');
const generator = new PDFGenerator({ verbose: true });

// Single document
if (singleFile) {
    await generator.convertMarkdown(inputFile, outputFile, options);
}

// Multi-document collation
else {
    const documents = files.map((file, index) => ({
        path: file,
        title: extractTitle(file),
        order: index
    }));

    await generator.collate(documents, outputFile, {
        toc: flags.includes('--toc'),
        bookmarks: flags.includes('--bookmarks'),
        renderMermaid: !flags.includes('--no-mermaid'),
        coverPage: coverPageConfig,
        metadata: {
            title: flags['--title'] || 'Document Collection',
            org: flags['--org'] || detectOrg(files[0]),
            date: new Date().toISOString().split('T')[0],
            version: flags['--version'] || '1.0'
        }
    });
}
```

### Step 5: Report Results

**Success Output:**
```
✅ PDF Generated Successfully

📄 Output: complete-audit-acme-2025-10-21.pdf
📊 Size: 2.8 MB
📑 Documents: 4 markdown files collated
🎨 Diagrams: 6 Mermaid diagrams rendered
📖 Pages: ~32 pages (estimated)

Features:
✓ Table of Contents
✓ Salesforce Audit cover page
✓ Cross-document links resolved
✓ Section breaks added

Location: /full/path/to/complete-audit-acme-2025-10-21.pdf
```

**With Warnings:**
```
✅ PDF Generated (with warnings)

⚠️  2 of 8 Mermaid diagrams failed to render (kept as code blocks)
⚠️  Cross-reference to missing file: old-report.md

📄 Output: audit-report.pdf (2.1 MB)

Review the PDF to verify diagram rendering.
```

## Options Reference

### Input Options

| Flag | Description | Example |
|------|-------------|---------|
| `[pattern]` | Glob pattern for input files | `"*.md"` or `"reports/*.md"` |
| `[output]` | Output PDF filename | `report.pdf` |

### Generation Options

| Flag | Description | Default |
|------|-------------|---------|
| `--toc` | Generate table of contents | true (multi-doc) |
| `--toc-depth N` | TOC heading depth | 3 |
| `--bookmarks` | Add PDF bookmarks/outline | false |
| `--no-mermaid` | Skip Mermaid rendering | false |
| `--cover TEMPLATE` | Cover page template | none |
| `--no-section-breaks` | Disable section breaks | false |

### Metadata Options

| Flag | Description | Example |
|------|-------------|---------|
| `--title "TEXT"` | PDF title | `--title "Q4 Audit"` |
| `--org "NAME"` | Organization name | `--org "ACME Corp"` |
| `--version "VER"` | Document version | `--version "2.1"` |
| `--author "NAME"` | Author name | `--author "RevPal"` |

### Output Options

| Flag | Description | Default |
|------|-------------|---------|
| `--format FORMAT` | Page format | A4 |
| `--margin SIZE` | Page margins | 20mm |
| `--verbose` | Verbose output | false |
| `--dry-run` | Show plan without generating | false |

## Cover Page Templates

**Available Templates:**

1. **salesforce-audit** - For Salesforce automation audits
   ```bash
   /generate-pdf "instances/acme/*.md" audit.pdf --cover salesforce-audit --org "ACME"
   ```

2. **hubspot-assessment** - For HubSpot portal assessments
   ```bash
   /generate-pdf "assessments/*.md" assessment.pdf --cover hubspot-assessment --org "Portal 12345"
   ```

3. **executive-report** - For executive summaries
   ```bash
   /generate-pdf "reports/exec-*.md" executive.pdf --cover executive-report --org "ACME"
   ```

4. **default** - Generic professional cover
   ```bash
   /generate-pdf "docs/*.md" manual.pdf --cover default
   ```

## Common Workflows

### Workflow 1: Quick Single File Conversion
```bash
# Convert one file, render Mermaid, no frills
/generate-pdf conflict-report.md conflict-report.pdf
```

### Workflow 2: Complete Audit Package
```bash
# Collate all audit docs with full features
/generate-pdf "instances/acme/audit-2025-01/*.md" \
  acme-audit-complete.pdf \
  --toc \
  --cover salesforce-audit \
  --org "ACME Corp" \
  --title "Automation Audit - January 2025"
```

### Workflow 3: Executive Presentation
```bash
# Create executive PDF with minimal technical detail
/generate-pdf "reports/executive-*.md" \
  executive-summary-Q4.pdf \
  --cover executive-report \
  --org "ACME Corp" \
  --title "Q4 2025 Executive Summary" \
  --toc-depth 2
```

### Workflow 4: Interactive Mode
```bash
# No arguments - interactive prompts
/generate-pdf

# Wizard asks:
# 1. Select files or enter pattern
# 2. Options (TOC, cover page, etc.)
# 3. Output filename
# 4. Confirmation before generation
```

## Troubleshooting

### Issue: No files found
```
❌ No markdown files found matching: "instances/xyz/*.md"

Solutions:
- Check spelling of path
- Verify files exist: ls instances/xyz/
- Try absolute path
- Use quotes around patterns with wildcards
```

### Issue: Mermaid rendering fails
```
⚠️  Mermaid diagram rendering failed

Solutions:
- Check diagram syntax with /diagram-generator
- Use --no-mermaid to skip rendering
- Verify mermaid-validator passes
```

### Issue: Large file size
```
⚠️  Generated PDF is 45 MB (very large)

Possible causes:
- High-resolution embedded images
- Many Mermaid diagrams rendered as PNG
- Large number of documents

Solutions:
- Use SVG instead of PNG for diagrams
- Compress images before embedding
- Split into multiple smaller PDFs
```

### Issue: Missing permissions
```
❌ Permission denied writing to: /protected/path/output.pdf

Solutions:
- Check write permissions
- Use different output directory
- Run with appropriate permissions
```

## Integration Points

**This command integrates with:**
- **diagram-generator agent** - Generate diagrams before PDF
- **sfdc-automation-auditor** - Auto-generate PDF after audit
- **hubspot-assessment-analyzer** - Create PDF deliverable
- **executive-reporter** - Format for leadership

**Post-Generation Hooks:**
- Automatic upload to Google Drive (if configured)
- Email distribution (if configured)
- Slack notification (if configured)

## Implementation Example

```javascript
// In command handler
const { Command } = require('@claude-code/command');
const PDFGenerator = require('../scripts/lib/pdf-generator');
const path = require('path');
const glob = require('glob');

class GeneratePDFCommand extends Command {
    async execute(args) {
        // Parse arguments
        const inputPattern = args[0];
        const outputFile = args[1];
        const options = this.parseOptions(args.slice(2));

        // Validate
        if (!inputPattern || !outputFile) {
            return this.showUsage();
        }

        // Find files
        const files = await glob(inputPattern);
        if (files.length === 0) {
            throw new Error(`No files found: ${inputPattern}`);
        }

        // Determine strategy
        const isSingleFile = files.length === 1 && !inputPattern.includes('*');

        // Generate PDF
        const generator = new PDFGenerator({ verbose: options.verbose });

        if (isSingleFile) {
            await generator.convertMarkdown(files[0], outputFile, options);
        } else {
            const documents = files.map((file, index) => ({
                path: file,
                title: path.basename(file, '.md').replace(/-|_/g, ' '),
                order: index
            }));

            await generator.collate(documents, outputFile, {
                ...options,
                toc: options.toc !== false,
                renderMermaid: options.renderMermaid !== false
            });
        }

        // Report success
        this.reportSuccess(outputFile, files.length, options);
    }
}

module.exports = GeneratePDFCommand;
```

## Success Criteria

- ✅ PDF generated successfully
- ✅ File size reasonable (<10MB for typical reports)
- ✅ All Mermaid diagrams rendered (or warnings shown)
- ✅ TOC accurate and linked
- ✅ Professional formatting maintained
- ✅ Output location confirmed to user

---

**Ready to generate professional PDFs from your markdown documents!**
