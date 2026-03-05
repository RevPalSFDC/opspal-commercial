#!/usr/bin/env node

/**
 * Report Pre-Processor
 *
 * Orchestrates the complete workflow:
 * 1. Format markdown (convert lists to tables)
 * 2. Validate/fix Mermaid diagrams
 * 3. Generate enhanced PDF
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const MermaidDiagramValidator = require('./mermaid-diagram-validator');
const MarkdownReportFormatter = require('./markdown-report-formatter');
const PDFGenerator = require('../../../opspal-core/scripts/lib/pdf-generator');

class ReportPreProcessor {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.tempDir = options.tempDir || path.join(os.tmpdir(), 'audit-pdf-processing');
  }

  /**
   * Process reports and generate branded PDF
   * @param {string} inputDir - Directory containing markdown reports
   * @param {string} outputPdf - Path for output PDF
   * @param {Object} options - Processing options
   * @param {string} options.coverTemplate - Cover template name
   */
  async process(inputDir, outputPdf, options = {}) {
    const {
      orgName = 'Organization',
      version = '1.0',
      date = new Date().toISOString().split('T')[0]
    } = options;

    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║     Automation Audit PDF Generation (Branded)        ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);

    console.log(`Input Directory: ${inputDir}`);
    console.log(`Output PDF: ${outputPdf}`);
    console.log(`Organization: ${orgName}`);
    console.log(`Version: ${version}\n`);

    // Step 1: Prepare temp directory
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Step 2: Find all markdown files
    console.log(`[1/4] Finding markdown reports...`);
    const files = this._findMarkdownFiles(inputDir);
    console.log(`      Found ${files.length} markdown file(s)\n`);

    if (files.length === 0) {
      throw new Error(`No markdown files found in ${inputDir}`);
    }

    // Step 3: Process each file (format + validate)
    console.log(`[2/4] Processing reports (format + validate)...`);
    const processedFiles = [];
    let totalFormatted = 0;
    let totalMermaidFixed = 0;
    let totalMermaidRemoved = 0;

    const formatter = new MarkdownReportFormatter({ verbose: false });
    const mermaidValidator = new MermaidDiagramValidator({ verbose: false });

    for (const file of files) {
      const basename = path.basename(file);
      const content = fs.readFileSync(file, 'utf8');

      // Format markdown (convert lists to tables)
      const formatted = formatter.format(content);
      totalFormatted += formatted.converted;

      // Validate/fix Mermaid diagrams
      const validated = mermaidValidator.process(formatted.content);
      totalMermaidFixed += validated.fixed;
      totalMermaidRemoved += validated.removed;

      // Save processed file to temp directory
      const processedPath = path.join(this.tempDir, basename);
      fs.writeFileSync(processedPath, validated.content, 'utf8');

      processedFiles.push({
        path: processedPath,
        title: this._generateTitle(basename),
        order: files.indexOf(file)
      });

      if (this.verbose) {
        console.log(`      ✓ ${basename}: ${formatted.converted} lists → tables, ${validated.fixed} diagrams fixed`);
      }
    }

    console.log(`      ✓ Converted ${totalFormatted} lists to tables`);
    console.log(`      ✓ Fixed ${totalMermaidFixed} Mermaid diagrams`);
    if (totalMermaidRemoved > 0) {
      console.log(`      ✓ Removed ${totalMermaidRemoved} invalid diagrams\n`);
    } else {
      console.log(``);
    }

    // Step 4: Generate enhanced PDF
    console.log(`[3/4] Generating PDF with RevPal branded template...`);
    const generator = new PDFGenerator({ verbose: this.verbose });
    await generator.collate(processedFiles, outputPdf, {
      profile: 'cover-toc',
      bookmarks: true,
      renderMermaid: true,
      metadata: {
        title: `Automation Audit - ${orgName}`,
        org: orgName,
        date,
        version,
        reportType: 'Automation Audit'
      }
    });

    // Step 5: Cleanup temp files
    console.log(`\n[4/4] Cleaning up temporary files...`);
    this._cleanupTempDir();
    console.log(`      ✓ Cleanup complete\n`);

    // Print summary
    console.log(`╔═══════════════════════════════════════════════════════╗`);
    console.log(`║                   Success Summary                     ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝`);
    console.log(`  Reports Processed: ${files.length}`);
    console.log(`  Lists Converted to Tables: ${totalFormatted}`);
    console.log(`  Mermaid Diagrams Fixed: ${totalMermaidFixed}`);
    if (totalMermaidRemoved > 0) {
      console.log(`  Mermaid Diagrams Removed: ${totalMermaidRemoved}`);
    }

    const stats = fs.statSync(outputPdf);
    console.log(`  PDF Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Output: ${outputPdf}\n`);

    return outputPdf;
  }

  /**
   * Find all markdown files in directory
   * @private
   */
  _findMarkdownFiles(dir) {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(dir, f))
      .filter(f => fs.statSync(f).isFile());

    // Sort by common order
    const order = [
      'EXECUTIVE_SUMMARY',
      'QUICK_REFERENCE',
      'Master_Inventory',
      'V3.29.0_ENHANCEMENTS',
      'FIELD_WRITE_MAP',
      'SCHEDULED_AUTOMATION',
      'namespace-analysis',
      'business-process',
      'validation-rules',
      'cascade-mapping',
      'dependency-graph',
      'migration-recommendations',
      'risk-based-implementation'
    ];

    files.sort((a, b) => {
      const aName = path.basename(a);
      const bName = path.basename(b);

      const aIndex = order.findIndex(o => aName.includes(o));
      const bIndex = order.findIndex(o => bName.includes(o));

      if (aIndex === -1 && bIndex === -1) return aName.localeCompare(bName);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return files;
  }

  /**
   * Generate human-readable title from filename
   * @private
   */
  _generateTitle(filename) {
    return filename
      .replace('.md', '')
      .replace(/[-_]/g, ' ')
      .replace(/\bV\d+\.\d+\.\d+\b/i, (match) => match.toUpperCase())
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Cleanup temporary directory
   * @private
   */
  _cleanupTempDir() {
    if (fs.existsSync(this.tempDir)) {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.tempDir, file));
      }
      fs.rmdirSync(this.tempDir);
    }
  }
}

module.exports = ReportPreProcessor;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
  console.log('Usage: report-pre-processor.js <input-dir> <output.pdf> [options]');
  console.log('\nGenerates branded PDF from audit reports with formatting and validation.');
    console.log('\nOptions:');
  console.log('  --org <name>       Organization name (default: Organization)');
  console.log('  --version <ver>    Version number (default: 1.0)');
  console.log('  --cover <name>     Unsupported (profile is fixed to cover-toc)');
  console.log('  --verbose        Show detailed processing information');
    console.log('\nExample:');
    console.log('  node report-pre-processor.js ./audit-reports audit-complete.pdf --org "gamma-corp" --version "3.29.0"');
    process.exit(1);
  }

  const inputDir = args[0];
  const outputPdf = args[1];
  const verbose = args.includes('--verbose');
  const orgIndex = args.indexOf('--org');
  const versionIndex = args.indexOf('--version');
  const orgName = orgIndex !== -1 && args[orgIndex + 1] ? args[orgIndex + 1] : 'Organization';
  const version = versionIndex !== -1 && args[versionIndex + 1] ? args[versionIndex + 1] : '1.0';
  if (args.includes('--cover')) {
    console.error('Error: --cover is no longer supported. This command always uses the cover-toc profile.');
    process.exit(1);
  }

  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  const processor = new ReportPreProcessor({ verbose });

  processor.process(inputDir, outputPdf, { orgName, version })
    .then(() => {
      console.log(`✅ PDF generation complete!\n`);
      process.exit(0);
    })
    .catch(error => {
      console.error(`\n❌ Error: ${error.message}`);
      if (verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    });
}
