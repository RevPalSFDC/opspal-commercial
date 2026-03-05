#!/usr/bin/env node

/**
 * Branded PDF Generator for Audit Reports
 *
 * Generates RevPal-branded PDFs using the shared PDF generator:
 * - RevPal theme + cover templates
 * - TOC + bookmarks
 * - Mermaid rendering
 *
 * @version 1.1.0
 * @date 2025-12-29
 */

const path = require('path');
const fs = require('fs');
const PDFGenerator = require('../../../cross-platform-plugin/scripts/lib/pdf-generator');

class EnhancedPDFGenerator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
  }

  /**
   * Generate branded PDF from markdown files
   * @param {Array} documents - Array of {path, title, order}
   * @param {string} outputPath - Output PDF path
   * @param {Object} options - Generation options
   * @param {string} options.coverTemplate - Cover template name
   * @param {string} options.reportTitle - Report title for metadata
   */
  async generate(documents, outputPath, options = {}) {
    const {
      orgName = 'Organization',
      version = '1.0',
      date = new Date().toISOString().split('T')[0]
    } = options;
    const coverTemplate = options.coverTemplate || 'salesforce-audit';
    const reportTitle = options.reportTitle || 'Automation Audit';

    if (this.verbose) {
      console.log(`\n📄 Generating branded PDF with ${documents.length} document(s)...`);
    }

    const validDocuments = documents.filter(doc => fs.existsSync(doc.path));

    if (validDocuments.length === 0) {
      throw new Error('No markdown documents found for PDF generation.');
    }

    if (this.verbose && validDocuments.length !== documents.length) {
      console.log(`   ⚠ Skipping ${documents.length - validDocuments.length} missing document(s)`);
    }

    const generator = new PDFGenerator({ verbose: this.verbose });

    await generator.collate(validDocuments, outputPath, {
      toc: true,
      bookmarks: true,
      renderMermaid: true,
      coverPage: { template: coverTemplate },
      metadata: {
        title: `${reportTitle} - ${orgName}`,
        org: orgName,
        date,
        version,
        reportType: reportTitle
      }
    });

    if (this.verbose) {
      const stats = fs.statSync(outputPath);
      console.log(`\n✅ PDF generated: ${path.basename(outputPath)}`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }

    return outputPath;
  }

  /**
   * Create cover page
   * @private
   */
  _createCoverPage(orgName, version, date, docCount) {
    return `<div class="cover-page">
<h1>Automation Audit Complete</h1>
<div class="metadata">
<p><strong>Organization:</strong> ${orgName}</p>
<p><strong>Date:</strong> ${date}</p>
<p><strong>Version:</strong> ${version}</p>
<p><strong>Reports:</strong> ${docCount} Sections</p>
</div>
</div>

---

`;
  }

  /**
   * Create table of contents
   * @private
   */
  _createTableOfContents(documents) {
    let toc = `## Table of Contents\n\n`;
    documents.forEach((doc, index) => {
      toc += `${index + 1}. [${doc.title}](#section-${index + 1})  \n`;
    });
    toc += `\n<div style="page-break-before: always;"></div>\n\n`;
    return toc;
  }

  /**
   * Format a document for inclusion
   * @private
   */
  _formatDocument(content, title, sectionNumber) {
    let formatted = `\n<div id="section-${sectionNumber}" style="page-break-before: always;"></div>\n\n`;
    formatted += `# ${sectionNumber}. ${title}\n\n`;

    // Strip original H1 if present to avoid duplication
    const cleanContent = content.replace(/^#\s+[^\n]+\n\n?/, '');
    formatted += cleanContent;
    formatted += '\n\n';

    return formatted;
  }

  /**
   * Get custom CSS stylesheet with 9pt font
   * @private
   */
  _getCustomCSS() {
    return `
      /* Base styles - 9pt font (2pt reduction from standard 11pt) */
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        font-size: 9pt !important;
        line-height: 1.5;
        color: #24292e;
        max-width: 900px;
        margin: 0 auto;
        padding: 20px;
      }

      /* Headers - proportionally scaled */
      h1, h2, h3, h4, h5, h6 {
        margin-top: 20px;
        margin-bottom: 12px;
        font-weight: 600;
        line-height: 1.25;
        page-break-after: avoid;
      }
      h1 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
      h2 { font-size: 1.25em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
      h3 { font-size: 1.1em; }
      h4 { font-size: 1em; }
      h5 { font-size: 0.9em; }
      h6 { font-size: 0.85em; color: #6a737d; }

      /* Tables - improved styling for data tables */
      table {
        border-collapse: collapse;
        border-spacing: 0;
        width: 100%;
        margin: 12px 0;
        page-break-inside: avoid;
        font-size: 7.5pt; /* Slightly smaller for data density */
      }
      table th {
        padding: 4px 8px;
        border: 1px solid #d0d7de;
        font-weight: 600;
        background-color: #f6f8fa;
        text-align: left;
      }
      table td {
        padding: 4px 8px;
        border: 1px solid #d0d7de;
        vertical-align: top;
      }
      table tr {
        background-color: #fff;
      }
      table tr:nth-child(even) {
        background-color: #f9f9f9; /* Zebra striping */
      }

      /* Code blocks */
      code {
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 8pt;
        background-color: rgba(27,31,35,0.05);
        padding: 0.2em 0.4em;
        border-radius: 3px;
      }
      pre {
        background-color: #f6f8fa;
        border-radius: 3px;
        padding: 12px;
        overflow: auto;
        font-size: 7.5pt;
        line-height: 1.45;
        page-break-inside: avoid;
      }
      pre code {
        background-color: transparent;
        padding: 0;
      }

      /* Lists - improved spacing */
      ul, ol {
        padding-left: 20px;
        margin: 8px 0;
      }
      li {
        margin: 4px 0;
      }

      /* Blockquotes */
      blockquote {
        padding: 0 1em;
        color: #6a737d;
        border-left: 0.25em solid #dfe2e5;
        margin: 12px 0;
      }

      /* Images */
      img {
        max-width: 100%;
        page-break-inside: avoid;
      }

      /* Horizontal rules */
      hr {
        height: 0.25em;
        padding: 0;
        margin: 20px 0;
        background-color: #e1e4e8;
        border: 0;
      }

      /* Cover page */
      .cover-page {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        text-align: center;
        page-break-after: always;
      }
      .cover-page h1 {
        font-size: 2.5em;
        margin-bottom: 0.5em;
        border-bottom: none;
      }
      .cover-page .metadata {
        font-size: 1.2em;
        color: #6a737d;
        margin-top: 2em;
      }

      /* Page breaks */
      .section-break {
        page-break-before: always;
        margin-top: 30px;
        padding-top: 15px;
        border-top: 2px solid #0969da;
      }

      /* Print optimizations */
      @media print {
        body { margin: 0; padding: 0; }
        a { text-decoration: none; color: inherit; }
        .no-print { display: none; }
      }
    `;
  }
}

module.exports = EnhancedPDFGenerator;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: generate-pdf-enhanced.js <output-dir> <output.pdf> [--org <name>] [--version <ver>] [--cover <template>] [--verbose]');
    console.log('\nGenerates branded PDF from markdown files in directory.');
    console.log('\nOptions:');
    console.log('  --org <name>       Organization name (default: Organization)');
    console.log('  --version <ver>    Version number (default: 1.0)');
    console.log('  --cover <name>     Cover template name (default: salesforce-audit)');
    console.log('  --verbose          Show detailed processing information');
    console.log('\nExample:');
    console.log('  node generate-pdf-enhanced.js ./reports output.pdf --org "NeonOne" --version "3.29.0" --verbose');
    process.exit(1);
  }

  const outputDir = args[0];
  const outputPdf = args[1];
  const verbose = args.includes('--verbose');
  const orgIndex = args.indexOf('--org');
  const versionIndex = args.indexOf('--version');
  const orgName = orgIndex !== -1 && args[orgIndex + 1] ? args[orgIndex + 1] : 'Organization';
  const version = versionIndex !== -1 && args[versionIndex + 1] ? args[versionIndex + 1] : '1.0';
  const coverIndex = args.indexOf('--cover');
  const coverTemplate = coverIndex !== -1 && args[coverIndex + 1] ? args[coverIndex + 1] : 'salesforce-audit';

  // Find all markdown files
  const glob = require('glob');
  const files = glob.sync(path.join(outputDir, '*.md'));

  if (files.length === 0) {
    console.error(`Error: No markdown files found in ${outputDir}`);
    process.exit(1);
  }

  // Create document list
  const documents = files.map((file, index) => ({
    path: file,
    title: path.basename(file, '.md').replace(/[-_]/g, ' '),
    order: index
  }));

  const generator = new EnhancedPDFGenerator({ verbose });

  generator.generate(documents, outputPdf, { orgName, version, coverTemplate })
    .then(() => {
      console.log(`\n✅ Success! PDF generated: ${outputPdf}`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`\n❌ Error: ${error.message}`);
      process.exit(1);
    });
}
