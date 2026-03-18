# PDF Generation - Standard Integration Pattern

**Version**: 1.0.0
**Status**: Mandatory for all report generators
**Last Updated**: 2025-10-22

---

## Purpose

This document defines the **mandatory standard pattern** for integrating PDF generation into all report-generating scripts, agents, and workflows.

**Goal**: Every report generator should automatically produce a PDF deliverable without requiring manual intervention.

---

## Core Principle

> **"If it generates markdown, it must offer PDF"**

Every script that generates markdown reports MUST:
- ✅ Automatically generate PDF after markdown creation
- ✅ Use the PDF Generation Helper Library
- ✅ Handle errors gracefully (non-fatal)
- ✅ Log PDF generation status
- ✅ Use appropriate cover template

---

## Standard Integration Pattern

### Pattern 1: Single Report Generator

**Use Case**: Script generates one markdown report

**Implementation:**

```javascript
const fs = require('fs');
const path = require('path');
const PDFGenerationHelper = require('../../../opspal-core/scripts/lib/pdf-generation-helper');

class MyReportGenerator {
  async generate(orgAlias, outputDir) {
    // 1. Generate markdown report
    const markdownPath = path.join(outputDir, 'report.md');
    await this.generateMarkdown(markdownPath);

    // 2. Generate PDF automatically
    await PDFGenerationHelper.generateSingleReportPDF({
      markdownPath,
      orgAlias,
      reportType: 'my-report-type',
      coverTemplate: 'salesforce-audit', // or appropriate template
      metadata: {
        title: 'My Report Title',
        version: '1.0.0'
      }
    });

    console.log(`✅ Report generated: ${markdownPath}`);
    console.log(`✅ PDF generated: ${markdownPath.replace('.md', '.pdf')}`);
  }
}
```

**What This Does:**
- Generates markdown report
- Automatically generates PDF with same filename
- Uses appropriate cover template
- Non-fatal if PDF generation fails
- Logs both markdown and PDF paths

---

### Pattern 2: Multi-Document Report Generator

**Use Case**: Script generates multiple markdown files that should be combined into one PDF

**Implementation:**

```javascript
const PDFGenerationHelper = require('../../../opspal-core/scripts/lib/pdf-generation-helper');

class MyMultiReportGenerator {
  async generate(orgAlias, outputDir) {
    // 1. Generate markdown reports
    const reportPaths = {
      summary: path.join(outputDir, 'EXECUTIVE_SUMMARY.md'),
      analysis: path.join(outputDir, 'DETAILED_ANALYSIS.md'),
      recommendations: path.join(outputDir, 'RECOMMENDATIONS.md')
    };

    await this.generateSummary(reportPaths.summary);
    await this.generateAnalysis(reportPaths.analysis);
    await this.generateRecommendations(reportPaths.recommendations);

    // 2. Generate consolidated PDF
    await PDFGenerationHelper.generateMultiReportPDF({
      orgAlias,
      outputDir,
      documents: [
        { path: reportPaths.summary, title: 'Executive Summary', order: 0 },
        { path: reportPaths.analysis, title: 'Detailed Analysis', order: 1 },
        { path: reportPaths.recommendations, title: 'Recommendations', order: 2 }
      ],
      coverTemplate: 'salesforce-audit',
      metadata: {
        title: `My Assessment - ${orgAlias}`,
        version: '1.0.0'
      }
    });

    console.log('✅ All reports generated successfully!');
  }
}
```

**What This Does:**
- Generates multiple markdown files
- Combines them into single PDF with TOC
- Smart document ordering
- Cover page with metadata
- Non-fatal error handling

---

### Pattern 3: CLI Script Integration

**Use Case**: Standalone CLI script that generates reports

**Implementation:**

```javascript
// At the end of your CLI script (after markdown generation)

if (require.main === module) {
  const args = process.argv.slice(2);
  const orgAlias = args[0];
  const outputDir = args[1];

  (async () => {
    try {
      // Your existing report generation
      const reportGenerator = new MyReportGenerator(orgAlias, outputDir);
      await reportGenerator.execute();

      // ✅ ADD THIS: Automatic PDF generation
      const PDFGenerationHelper = require('../../../opspal-core/scripts/lib/pdf-generation-helper');
      await PDFGenerationHelper.autoGeneratePDFFromDirectory({
        orgAlias,
        outputDir,
        reportType: 'my-report',
        coverTemplate: 'salesforce-audit'
      });

      console.log('All reports generated successfully!');
      console.log(`\nView results: ${outputDir}/`);

    } catch (error) {
      console.error('\n❌ Generation failed:', error.message);
      process.exit(1);
    }
  })();
}
```

**What This Does:**
- Generates all markdown reports
- Automatically scans directory for markdown files
- Generates PDF with all found reports
- Uses smart ordering
- Non-fatal (script succeeds even if PDF fails)

---

## Helper Library Usage

The `PDFGenerationHelper` library provides 3 convenience methods:

### Method 1: `generateSingleReportPDF()`

**Purpose**: Generate PDF from single markdown file

**Parameters:**
```javascript
{
  markdownPath: string,        // Path to markdown file
  orgAlias: string,             // Organization name
  reportType: string,           // Type identifier (e.g., 'automation-audit')
  coverTemplate: string,        // Cover template name
  profile: string,              // Optional: simple | cover-toc
  metadata: {                   // Optional metadata
    title: string,
    version: string,
    period: string,
    // ... other fields
  }
}
```

**Returns:** `Promise<string>` - Path to generated PDF (or null if failed)

---

### Method 2: `generateMultiReportPDF()`

**Purpose**: Combine multiple markdown files into one PDF

**Parameters:**
```javascript
{
  orgAlias: string,
  outputDir: string,
  documents: [                  // Array of documents to combine
    {
      path: string,             // Path to markdown file
      title: string,            // Section title
      order: number             // Display order (0-based)
    }
  ],
  coverTemplate: string,
  profile: string,              // Optional: simple | cover-toc
  metadata: object
}
```

**Returns:** `Promise<string>` - Path to generated PDF (or null if failed)

---

### Method 3: `autoGeneratePDFFromDirectory()`

**Purpose**: Automatically scan directory and generate PDF from all markdown files

**Parameters:**
```javascript
{
  orgAlias: string,
  outputDir: string,
  reportType: string,
  coverTemplate: string,
  profile: string,              // Optional: simple | cover-toc
  includePattern: string,       // Optional: glob pattern (default: '*.md')
  excludePattern: string        // Optional: exclude pattern
}
```

**Returns:** `Promise<string>` - Path to generated PDF (or null if failed)

---

## Preset Profiles (Optional)

Use profiles to standardize branded output across environments:

- `simple` - Branded PDF with no cover and no TOC
- `cover-toc` - Branded PDF with cover page and TOC

**Example:**
```javascript
await PDFGenerationHelper.generateMultiReportPDF({
  orgAlias,
  outputDir,
  documents,
  profile: 'cover-toc',
  metadata: { title: `Report - ${orgAlias}` }
});
```

---

## Cover Template Selection

**Rule**: Choose cover template based on report type

| Report Type | Cover Template | When to Use |
|-------------|----------------|-------------|
| Salesforce Automation Audit | `salesforce-audit` | Automation health, conflicts |
| HubSpot Portal Assessment | `hubspot-assessment` | Portal optimization |
| Executive Summary | `executive-report` | Board presentations |
| GTM Planning | `gtm-planning` | Compensation, quotas |
| Data Quality | `data-quality` | Deduplication, hygiene |
| Cross-Platform Integration | `cross-platform-integration` | Multi-platform sync |
| Security Audit | `security-audit` | Compliance, security |
| General Report | `default` | Any other type |

**Example:**
```javascript
// Salesforce automation audit
coverTemplate: 'salesforce-audit'

// HubSpot workflow assessment
coverTemplate: 'hubspot-assessment'

// Executive summary
coverTemplate: 'executive-report'
```

---

## Error Handling

**Critical Rule**: PDF generation MUST be non-fatal

**Pattern:**
```javascript
try {
  await PDFGenerationHelper.generateSingleReportPDF({...});
  console.log('✅ PDF generated successfully');
} catch (pdfError) {
  console.warn('⚠️  PDF generation failed (non-fatal):', pdfError.message);
  // Script continues - markdown reports still available
}
```

**Why Non-Fatal?**
- Markdown reports are primary deliverable
- PDF is enhancement
- Missing dependencies shouldn't break workflows
- Users can manually generate PDF later if needed

---

## Logging Standards

**Required Log Messages:**

```javascript
// Before PDF generation
console.log('\n📄 Generating PDF report...');

// On success
console.log(`✅ PDF generated: ${path.basename(pdfPath)}`);

// On failure (non-fatal)
console.warn('⚠️  PDF generation failed (non-fatal):', error.message);

// No markdown files found
console.log('⚠️  No markdown reports found - skipping PDF generation');
```

---

## Metadata Standards

**Required Fields:**
- `title` - Report title
- `org` - Organization name
- `date` - Generation date (ISO format)
- `version` - Report version

**Optional Fields:**
- `period` - Reporting period (e.g., "Q3 2025")
- `scope` - Assessment scope
- `confidentiality` - Security level

**Example:**
```javascript
metadata: {
  title: `Automation Audit - ${orgAlias}`,
  org: orgAlias,
  date: new Date().toISOString().split('T')[0],
  version: '3.28.2',
  period: 'Q4 2025'
}
```

---

## Testing Requirements

Before deploying any report generator:

### 1. Test Markdown Generation
```bash
node my-report-generator.js test-org ./test-output
```
Verify markdown files created

### 2. Test PDF Generation
```bash
ls -lh ./test-output/*.pdf
```
Verify PDF created and reasonable size (>10KB)

### 3. Test PDF Content
Open PDF and verify:
- [ ] Cover page shows correct org name
- [ ] Table of contents present (multi-document)
- [ ] All sections included
- [ ] Diagrams render (if applicable)
- [ ] Metadata correct (Properties → Details)

### 4. Test Error Handling
```bash
# Test with missing dependencies (uninstall md-to-pdf)
npm uninstall md-to-pdf
node my-report-generator.js test-org ./test-output
```
Verify:
- [ ] Script completes successfully
- [ ] Warning logged about PDF failure
- [ ] Markdown reports still created

---

## Migration Checklist

For existing report generators:

- [ ] **Import Helper Library**
  ```javascript
  const PDFGenerationHelper = require('../../../opspal-core/scripts/lib/pdf-generation-helper');
  ```

- [ ] **Add PDF Generation Call** (after markdown generation)
  ```javascript
  await PDFGenerationHelper.generateMultiReportPDF({...});
  ```

- [ ] **Choose Appropriate Cover Template**
  - Review template list above
  - Select best match for report type

- [ ] **Add Error Handling**
  - Wrap in try/catch
  - Log warnings, not errors
  - Continue execution on failure

- [ ] **Add Logging**
  - Log PDF generation start
  - Log success with filename
  - Log failure (non-fatal)

- [ ] **Test Integration**
  - Run with real org data
  - Verify PDF generated
  - Verify markdown unaffected
  - Test error scenarios

- [ ] **Update Documentation**
  - Mention PDF generation in script header
  - Update README if applicable
  - Note cover template used

---

## Real-World Examples

### Example 1: automation-audit-v2-orchestrator.js (✅ Implemented)

**Location**: `.claude-plugins/opspal-salesforce/scripts/lib/automation-audit-v2-orchestrator.js`

**Implementation** (lines 2347-2384):
```javascript
// Generate consolidated PDF report
try {
  console.log('\n📄 Generating consolidated PDF report...');
  const PDFGenerator = require('../../../opspal-core/scripts/lib/pdf-generator');
  const generator = new PDFGenerator({ verbose: false });

  const documents = [
    { path: path.join(outputDir, 'EXECUTIVE_SUMMARY_V2.md'), title: 'Executive Summary', order: 0 },
    { path: path.join(outputDir, 'AUTOMATION_SUMMARY.md'), title: 'Automation Summary', order: 1 },
    { path: path.join(outputDir, 'CONFLICTS.md'), title: 'Conflict Analysis', order: 2 },
    { path: path.join(outputDir, 'FIELD_COLLISION_ANALYSIS.md'), title: 'Field Collisions', order: 3 },
    { path: path.join(outputDir, 'PRIORITIZED_REMEDIATION_PLAN.md'), title: 'Remediation Plan', order: 4 }
  ].filter(doc => fs.existsSync(doc.path));

  if (documents.length > 0) {
    const timestamp = new Date().toISOString().split('T')[0];
    const pdfPath = path.join(outputDir, `automation-audit-complete-${orgAlias}-${timestamp}.pdf`);

    await generator.collate(documents, pdfPath, {
      toc: true,
      bookmarks: true, // Best-effort; requires pdftk/qpdf
      renderMermaid: true,
      coverPage: { template: 'salesforce-audit' },
      metadata: {
        title: `Automation Audit - ${orgAlias}`,
        org: orgAlias,
        date: timestamp,
        version: '3.28.2'
      }
    });

    console.log(`✅ PDF generated: ${path.basename(pdfPath)}`);
  }
} catch (pdfError) {
  console.warn('⚠️  PDF generation failed (non-fatal):', pdfError.message);
}
```

**Key Features:**
- Multi-document collation
- Smart filtering (only existing files)
- Salesforce audit cover template
- Non-fatal error handling
- Clear logging

---

### Example 2: executive-reporter.js (✅ Implemented)

**Location**: `.claude-plugins/opspal-salesforce/scripts/lib/executive-reporter.js`

**Implementation** (lines 592-648):
```javascript
async generatePDF(reportPaths, timestamp) {
  try {
    console.log('\n📄 Generating consolidated PDF report...');

    const PDFGenerator = require('../../../opspal-core/scripts/lib/pdf-generator');
    const generator = new PDFGenerator({ verbose: false });

    const documents = [
      { path: reportPaths.summary, title: 'Executive Summary', order: 0 },
      { path: reportPaths.metrics, title: 'Key Metrics', order: 1 },
      { path: reportPaths.detailed, title: 'Detailed Analysis', order: 2 },
      { path: reportPaths.recommendations, title: 'Recommendations', order: 3 }
    ].filter(doc => fs.existsSync(doc.path));

    const pdfPath = path.join(this.outputDir, `executive-report-${timestamp}.pdf`);

    await generator.collate(documents, pdfPath, {
      toc: true,
      bookmarks: true, // Best-effort; requires pdftk/qpdf
      renderMermaid: true,
      coverPage: { template: 'executive-report' },
      metadata: {
        title: 'Executive Compliance Report',
        org: process.env.ORG_NAME || 'Organization',
        period: this.getReportingPeriod(),
        date: timestamp,
        version: '1.0'
      }
    });

    console.log(`✅ PDF report generated: ${path.basename(pdfPath)}`);
    return pdfPath;

  } catch (error) {
    console.warn('⚠️  PDF generation failed (non-fatal):', error.message);
    return null;
  }
}
```

**Key Features:**
- Method-based integration
- Executive report cover template
- Period metadata included
- Returns path or null
- Error handling with return value

---

## Quick Reference: Integration Steps

### For New Report Generators

```javascript
// Step 1: Import helper
const PDFGenerationHelper = require('../../../opspal-core/scripts/lib/pdf-generation-helper');

// Step 2: After markdown generation, add:
await PDFGenerationHelper.generateMultiReportPDF({
  orgAlias: args[0],
  outputDir: args[1],
  documents: [
    { path: 'report1.md', title: 'Part 1', order: 0 },
    { path: 'report2.md', title: 'Part 2', order: 1 }
  ],
  coverTemplate: 'salesforce-audit', // Choose appropriate template
  metadata: {
    title: `Report Title - ${orgAlias}`,
    version: '1.0.0'
  }
});

// Step 3: Done! PDF auto-generated
```

---

## Validation & Quality Control

### Automated Checks

**Pre-Commit Hook** (`.claude/hooks/pre-commit-pdf-integration-check.sh`):
```bash
#!/bin/bash
# Check if report generator has PDF integration

# Find all report generators
GENERATORS=$(find . -name "*-generator.js" -o -name "*-orchestrator.js")

for file in $GENERATORS; do
  if ! grep -q "PDFGenerator\|pdf-generation-helper" "$file"; then
    echo "⚠️  WARNING: $file may be missing PDF integration"
  fi
done
```

### Manual Review Checklist

Before merging new report generator:

- [ ] Imports PDF helper library
- [ ] Calls PDF generation after markdown
- [ ] Uses appropriate cover template
- [ ] Has non-fatal error handling
- [ ] Includes required metadata
- [ ] Logs PDF generation status
- [ ] Tested with real data
- [ ] PDF verified to contain correct content

---

## Troubleshooting Integration Issues

### Issue 1: "Cannot find module 'pdf-generator'"

**Cause**: Incorrect relative path to opspal-core

**Fix**: Use correct relative path:
```javascript
// From salesforce-plugin/scripts/lib/
require('../../../opspal-core/scripts/lib/pdf-generator')

// From hubspot-plugin/scripts/lib/
require('../../../opspal-core/scripts/lib/pdf-generator')
```

---

### Issue 2: "PDF generation breaking my script"

**Cause**: Not using non-fatal error handling

**Fix**: Wrap in try/catch:
```javascript
try {
  await generatePDF();
} catch (pdfError) {
  console.warn('⚠️  PDF generation failed (non-fatal):', pdfError.message);
  // Script continues
}
```

---

### Issue 3: "Cover page not showing correct data"

**Cause**: Missing or incorrect metadata

**Fix**: Ensure all required fields:
```javascript
metadata: {
  title: 'My Report Title',      // ✅ Required
  org: orgAlias,                  // ✅ Required
  date: new Date().toISOString().split('T')[0],  // ✅ Required
  version: '1.0.0'                // ✅ Required
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-22 | Initial standard pattern document |

---

## Feedback & Updates

**Questions?** Review the examples above or check:
- PDF_GENERATION_GUIDE.md - Technical details
- PDF_GENERATION_INTEGRATION.md - Integration patterns
- pdf-generation-helper.js - Helper library source

**Suggestions?** Submit improvements to this standard pattern.

---

**Status**: ✅ Mandatory Standard
**Compliance**: All new report generators MUST follow this pattern
