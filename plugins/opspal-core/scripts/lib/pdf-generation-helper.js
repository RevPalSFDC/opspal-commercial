/**
 * PDF Generation Helper Library
 *
 * Simplifies PDF generation integration for report generators.
 * Provides high-level convenience methods with sensible defaults.
 *
 * Purpose:
 * - Standardize PDF generation across all report generators
 * - Reduce boilerplate code
 * - Ensure consistent error handling
 * - Provide non-fatal fallbacks
 *
 * Usage Examples:
 *
 * // Single report
 * await PDFGenerationHelper.generateSingleReportPDF({
 *   markdownPath: 'report.md',
 *   orgAlias: 'acme',
 *   reportType: 'automation-audit',
 *   coverTemplate: 'salesforce-audit'
 * });
 *
 * // Multiple reports
 * await PDFGenerationHelper.generateMultiReportPDF({
 *   orgAlias: 'acme',
 *   outputDir: './output',
 *   documents: [
 *     { path: 'summary.md', title: 'Summary', order: 0 },
 *     { path: 'analysis.md', title: 'Analysis', order: 1 }
 *   ],
 *   coverTemplate: 'salesforce-audit'
 * });
 *
 * // Auto-generate from directory
 * await PDFGenerationHelper.autoGeneratePDFFromDirectory({
 *   orgAlias: 'acme',
 *   outputDir: './output',
 *   reportType: 'automation-audit',
 *   coverTemplate: 'salesforce-audit'
 * });
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const os = require('os');
const { execSync } = require('child_process');
const { DataAccessError } = require('./data-access-error');
const {
  resolveStyleProfile,
  assertNoLegacyStyleOverrides,
  DEFAULT_STYLE_PROFILE
} = require('./pdf-style-policy');
const { getResolver } = require('./customization/resolver-factory');

// =============================================================================
// Configuration Constants
// =============================================================================

const PDF_CONFIG = {
  // Timeout defaults
  defaultTimeout: 120000, // 2 minutes
  maxTimeout: 600000,     // 10 minutes

  // Config complexity levels for retry logic
  configLevels: {
    minimal: {
      name: 'minimal',
      description: 'Basic PDF with default styles',
      options: { format: 'A4', margin: '20mm' },
    },
    standard: {
      name: 'standard',
      description: 'Standard PDF with custom margins',
      options: {
        format: 'A4',
        margin: { top: '25mm', bottom: '25mm', left: '20mm', right: '20mm' },
        displayHeaderFooter: true,
      },
    },
    full: {
      name: 'full',
      description: 'Full PDF with custom CSS and advanced features',
      options: {
        format: 'A4',
        margin: { top: '30mm', bottom: '30mm', left: '25mm', right: '25mm' },
        displayHeaderFooter: true,
        printBackground: true,
      },
    },
  },

  // Path length limits (ENAMETOOLONG prevention)
  maxPathLength: 200,

  // Mermaid config
  mermaid: {
    theme: 'default',
    width: 800,
    height: 600,
    backgroundColor: 'white',
  },
};

class PDFGenerationHelper {

  /**
   * Generate PDF from single markdown file
   *
   * @param {Object} options
   * @param {string} options.markdownPath - Path to markdown file
   * @param {string} options.outputPath - Optional output PDF path
   * @param {string} options.orgAlias - Organization name
   * @param {string} options.reportType - Report type identifier
   * @param {string} options.coverTemplate - Cover template name
   * @param {Object} options.metadata - Optional metadata overrides
   * @param {string} options.profile - Preset profile (simple, cover-toc)
   * @param {string} options.theme - Theme override
   * @param {string} options.format - PDF page format
   * @param {string|Object} options.margin - PDF margins
   * @param {boolean} options.printBackground - Print background colors
   * @param {Object} options.features - Feature overrides (e.g., headerFooter)
   * @param {string} options.basedir - Base directory for relative assets
   * @param {Object} options.markedOptions - Marked options override
   * @param {boolean} options.bookmarks - Enable bookmarks (best-effort)
   * @param {number} options.tocDepth - TOC depth used for bookmark extraction
   * @param {boolean} options.renderMermaid - Render Mermaid diagrams (default: true)
   * @param {boolean} options.verbose - Enable verbose logging (default: false)
   * @returns {Promise<string|null>} Path to generated PDF or null if failed
   */
  static async generateSingleReportPDF(options) {
    const {
      markdownPath,
      outputPath = null,
      orgAlias,
      reportType,
      coverTemplate,
      metadata = {},
      profile,
      theme,
      format,
      margin,
      printBackground,
      features,
      basedir,
      markedOptions,
      bookmarks,
      tocDepth,
      renderMermaid = true,
      verbose = false
    } = options;

    try {
      // Validate inputs
      if (!markdownPath) throw new Error('markdownPath is required');
      if (!orgAlias) throw new Error('orgAlias is required');
      if (!reportType) throw new Error('reportType is required');

      // Check file exists
      if (!fs.existsSync(markdownPath)) {
        console.warn(`⚠️  Markdown file not found: ${markdownPath}`);
        return null;
      }

      // Load PDF generator with customization resolver
      const PDFGenerator = require('./pdf-generator');
      const resolver = await getResolver();
      const generator = new PDFGenerator({ verbose, resolver });
      const resolvedProfile = resolveStyleProfile(profile || DEFAULT_STYLE_PROFILE);
      assertNoLegacyStyleOverrides({ theme, coverTemplate });
      const resolvedCoverTemplate = (coverTemplate && coverTemplate.trim())
        ? coverTemplate.trim()
        : this.getRecommendedCoverTemplate(reportType);

      // Determine output path
      const pdfPath = outputPath || markdownPath.replace(/\.md$/, '.pdf');

      // Prepare metadata
      const fullMetadata = {
        title: `${reportType} - ${orgAlias}`,
        org: orgAlias,
        date: new Date().toISOString().split('T')[0],
        version: '1.0',
        ...metadata
      };

      if (verbose) {
        console.log(`\n📄 Generating PDF: ${path.basename(pdfPath)}`);
      }

      // Generate PDF
      await generator.convertMarkdown(markdownPath, pdfPath, {
        profile: resolvedProfile,
        coverTemplate: resolvedCoverTemplate,
        renderMermaid,
        metadata: fullMetadata,
        format,
        margin,
        printBackground,
        features,
        basedir,
        markedOptions,
        bookmarks,
        tocDepth
      });

      if (verbose) {
        console.log(`✅ PDF generated: ${path.basename(pdfPath)}`);
      }

      return pdfPath;

    } catch (error) {
      // Actual errors (not expected conditions like missing files) must be thrown
      throw new DataAccessError(
        'PDF_Generation',
        `Failed to generate PDF for ${reportType}: ${error.message}`,
        {
          markdownPath,
          orgAlias,
          reportType,
          originalError: error.message,
          workaround: 'Check PDFGenerator installation: npm install md-to-pdf pdf-lib'
        }
      );
    }
  }

  /**
   * Generate PDF from multiple markdown files (collation)
   *
   * @param {Object} options
   * @param {string} options.orgAlias - Organization name
   * @param {string} options.outputDir - Output directory
   * @param {Array} options.documents - Array of {path, title, order}
   * @param {string} options.coverTemplate - Cover template name
   * @param {Object} options.metadata - Optional metadata overrides
   * @param {string} options.outputFilename - Optional output filename (default: auto-generated)
   * @param {string} options.profile - Preset profile (simple, cover-toc)
   * @param {string} options.theme - Theme override
   * @param {boolean} options.toc - Enable table of contents
   * @param {boolean} options.bookmarks - Enable bookmarks
   * @param {boolean} options.renderMermaid - Render Mermaid diagrams (default: true)
   * @param {boolean} options.verbose - Enable verbose logging (default: false)
   * @returns {Promise<string|null>} Path to generated PDF or null if failed
   */
  static async generateMultiReportPDF(options) {
    const {
      orgAlias,
      outputDir,
      documents,
      coverTemplate,
      metadata = {},
      outputFilename = null,
      profile,
      theme,
      toc,
      bookmarks,
      renderMermaid = true,
      verbose = false
    } = options;

    try {
      // Validate inputs
      if (!orgAlias) throw new Error('orgAlias is required');
      if (!outputDir) throw new Error('outputDir is required');
      if (!documents || documents.length === 0) {
        console.warn('⚠️  No documents provided - skipping PDF generation');
        return null;
      }

      // Filter out non-existent files
      const existingDocuments = documents.filter(doc => {
        const exists = fs.existsSync(doc.path);
        if (!exists && verbose) {
          console.warn(`⚠️  Skipping non-existent file: ${doc.path}`);
        }
        return exists;
      });

      if (existingDocuments.length === 0) {
        console.warn('⚠️  No markdown reports found - skipping PDF generation');
        return null;
      }

      // Load PDF generator with customization resolver
      const PDFGenerator = require('./pdf-generator');
      const resolver = await getResolver();
      const generator = new PDFGenerator({ verbose, resolver });
      const resolvedProfile = resolveStyleProfile(profile || DEFAULT_STYLE_PROFILE);
      assertNoLegacyStyleOverrides({ theme, coverTemplate, toc });
      const inferredReportType = metadata?.reportType || metadata?.title || 'executive summary';
      const resolvedCoverTemplate = (coverTemplate && coverTemplate.trim())
        ? coverTemplate.trim()
        : this.getRecommendedCoverTemplate(inferredReportType);

      // Determine output path
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = outputFilename || `report-${orgAlias}-${timestamp}.pdf`;
      const pdfPath = path.join(outputDir, filename);

      // Prepare metadata
      const fullMetadata = {
        title: `Report - ${orgAlias}`,
        org: orgAlias,
        date: timestamp,
        version: '1.0',
        ...metadata
      };

      if (verbose) {
        console.log(`\n📄 Generating consolidated PDF: ${path.basename(pdfPath)}`);
        console.log(`   Collating ${existingDocuments.length} document(s)...`);
      }

      // Generate PDF
      const resolvedBookmarks = bookmarks !== undefined ? bookmarks : true;

      await generator.collate(existingDocuments, pdfPath, {
        profile: resolvedProfile,
        coverTemplate: resolvedCoverTemplate,
        bookmarks: resolvedBookmarks,
        renderMermaid,
        metadata: fullMetadata
      });

      if (!verbose) {
        // Always log success (even if not verbose)
        console.log(`✅ PDF generated: ${path.basename(pdfPath)}`);
      }

      return pdfPath;

    } catch (error) {
      // Actual errors (not expected conditions like missing files) must be thrown
      throw new DataAccessError(
        'PDF_Generation',
        `Failed to generate multi-report PDF for ${orgAlias}: ${error.message}`,
        {
          outputDir,
          orgAlias,
          documentCount: documents?.length || 0,
          originalError: error.message,
          workaround: 'Check PDFGenerator installation: npm install md-to-pdf pdf-lib'
        }
      );
    }
  }

  /**
   * Auto-generate PDF from all markdown files in directory
   *
   * Scans directory for markdown files and automatically generates PDF.
   * Uses smart ordering based on filename patterns.
   *
   * @param {Object} options
   * @param {string} options.orgAlias - Organization name
   * @param {string} options.outputDir - Output directory to scan
   * @param {string} options.reportType - Report type identifier
   * @param {string} options.coverTemplate - Cover template name
   * @param {string} options.includePattern - Glob pattern for files to include (default: '*.md')
   * @param {string} options.excludePattern - Pattern for files to exclude
   * @param {Object} options.metadata - Optional metadata overrides
   * @param {string} options.profile - Preset profile (simple, cover-toc)
   * @param {string} options.theme - Theme override
   * @param {boolean} options.toc - Enable table of contents
   * @param {boolean} options.bookmarks - Enable bookmarks
   * @param {boolean} options.renderMermaid - Render Mermaid diagrams (default: true)
   * @param {boolean} options.verbose - Enable verbose logging (default: false)
   * @returns {Promise<string|null>} Path to generated PDF or null if failed
   */
  static async autoGeneratePDFFromDirectory(options) {
    const {
      orgAlias,
      outputDir,
      reportType,
      coverTemplate,
      includePattern = '*.md',
      excludePattern = null,
      metadata = {},
      profile,
      theme,
      toc,
      bookmarks,
      renderMermaid = true,
      verbose = false
    } = options;

    try {
      // Validate inputs
      if (!orgAlias) throw new Error('orgAlias is required');
      if (!outputDir) throw new Error('outputDir is required');
      if (!reportType) throw new Error('reportType is required');

      // Find markdown files
      const pattern = path.join(outputDir, includePattern);
      const files = glob.sync(pattern);

      // Filter excluded patterns
      let filteredFiles = files;
      if (excludePattern) {
        const excludeRegex = new RegExp(excludePattern);
        filteredFiles = files.filter(file => !excludeRegex.test(file));
      }

      if (filteredFiles.length === 0) {
        console.warn('⚠️  No markdown files found - skipping PDF generation');
        return null;
      }

      // Convert to document objects with smart ordering
      const documents = this._createDocumentList(filteredFiles);

      if (verbose) {
        console.log(`\n📄 Auto-generating PDF from ${documents.length} markdown file(s)...`);
      }

      // Generate PDF using multi-report method
      const timestamp = new Date().toISOString().split('T')[0];
      return await this.generateMultiReportPDF({
        orgAlias,
        outputDir,
        documents,
        coverTemplate,
        outputFilename: `${reportType}-complete-${orgAlias}-${timestamp}.pdf`,
        metadata: {
          title: `${reportType} - ${orgAlias}`,
          ...metadata
        },
        profile,
        theme,
        bookmarks,
        renderMermaid,
        verbose
      });

    } catch (error) {
      // Actual errors (not expected conditions like missing files) must be thrown
      throw new DataAccessError(
        'PDF_Generation',
        `Failed to auto-generate PDF for ${reportType}: ${error.message}`,
        {
          outputDir,
          orgAlias,
          reportType,
          originalError: error.message,
          workaround: 'Check PDFGenerator installation: npm install md-to-pdf pdf-lib'
        }
      );
    }
  }

  /**
   * Create document list with smart ordering
   *
   * @private
   * @param {Array<string>} filePaths - Array of file paths
   * @returns {Array<Object>} Array of {path, title, order}
   */
  static _createDocumentList(filePaths) {
    const orderPatterns = [
      { regex: /executive.*summary|summary.*executive/i, priority: 1, title: 'Executive Summary' },
      { regex: /overview|introduction|intro/i, priority: 2, title: 'Overview' },
      { regex: /automation.*summary/i, priority: 3, title: 'Automation Summary' },
      { regex: /analysis|detailed|technical/i, priority: 4, title: 'Analysis' },
      { regex: /conflict/i, priority: 5, title: 'Conflict Analysis' },
      { regex: /collision/i, priority: 6, title: 'Collision Analysis' },
      { regex: /recommendation|remediation|plan/i, priority: 7, title: 'Recommendations' },
      { regex: /appendix|attachment/i, priority: 8, title: 'Appendix' }
    ];

    return filePaths.map((filePath, index) => {
      const basename = path.basename(filePath, '.md');

      // Determine priority and title
      let priority = 99; // Default low priority
      let title = basename.replace(/[-_]/g, ' '); // Convert to readable title

      for (const pattern of orderPatterns) {
        if (pattern.regex.test(basename)) {
          priority = pattern.priority;
          title = pattern.title;
          break;
        }
      }

      return {
        path: filePath,
        title,
        order: priority * 100 + index // Ensure stable sort with index as tiebreaker
      };
    }).sort((a, b) => a.order - b.order);
  }

  /**
   * Get recommended cover template for report type
   *
   * @param {string} reportType - Report type identifier
   * @returns {string} Recommended cover template name
   */
  static getRecommendedCoverTemplate(reportType) {
    const lowerType = String(reportType || '').toLowerCase();

    if (lowerType.includes('salesforce') || lowerType.includes('automation') || lowerType.includes('sfdc')) {
      return 'salesforce-audit';
    }
    if (lowerType.includes('hubspot') || lowerType.includes('portal')) {
      return 'hubspot-assessment';
    }
    if (lowerType.includes('executive') || lowerType.includes('summary')) {
      return 'executive-report';
    }
    if (lowerType.includes('gtm') || lowerType.includes('planning') || lowerType.includes('quota')) {
      return 'gtm-planning';
    }
    if (lowerType.includes('data') || lowerType.includes('quality') || lowerType.includes('dedup')) {
      return 'data-quality';
    }
    if (lowerType.includes('integration') || lowerType.includes('sync')) {
      return 'cross-platform-integration';
    }
    if (lowerType.includes('security') || lowerType.includes('compliance')) {
      return 'security-audit';
    }

    return 'default';
  }

  /**
   * Validate PDF generation dependencies
   *
   * @returns {Object} {installed: boolean, missing: Array<string>}
   */
  static checkDependencies() {
    const required = ['md-to-pdf', 'pdf-lib'];
    const missing = [];

    for (const dep of required) {
      try {
        require.resolve(dep);
      } catch (error) {
        missing.push(dep);
      }
    }

    return {
      installed: missing.length === 0,
      missing
    };
  }

  /**
   * Get installation command for missing dependencies
   *
   * @returns {string|null} npm install command or null if all installed
   */
  static getInstallCommand() {
    const check = this.checkDependencies();
    if (check.installed) return null;

    return `npm install --save ${check.missing.join(' ')}`;
  }

  /**
   * Generate PDF with BLUF+4 executive summary prepended
   *
   * Automatically generates a BLUF+4 executive summary and prepends it
   * to the document list before generating the final PDF.
   *
   * @param {Object} options
   * @param {Object} options.blufInput - Input data for BLUF+4 generator
   * @param {Array} options.documents - Additional documents to include
   * @param {string} options.orgAlias - Organization name
   * @param {string} options.outputDir - Output directory
   * @param {string} options.reportType - Report type identifier
   * @param {string} options.coverTemplate - Cover template name (default: 'executive-report')
   * @param {Object} options.metadata - Optional metadata overrides
   * @param {boolean} options.verbose - Enable verbose logging (default: false)
   * @returns {Promise<Object>} {pdfPath, summaryPath, validation}
   */
  static async generateWithBLUFSummary(options) {
    const {
      blufInput,
      documents = [],
      orgAlias,
      outputDir,
      reportType,
      coverTemplate = 'executive-report',
      metadata = {},
      verbose = false
    } = options;

    try {
      // Validate inputs
      if (!blufInput) throw new Error('blufInput is required');
      if (!orgAlias) throw new Error('orgAlias is required');
      if (!outputDir) throw new Error('outputDir is required');

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Load BLUF generator
      const BLUFSummaryGenerator = require('./bluf-summary-generator');
      const generator = new BLUFSummaryGenerator({ verbose });

      // Add metadata to input
      const enrichedInput = {
        ...blufInput,
        metadata: {
          ...blufInput.metadata,
          reportType: reportType || blufInput.metadata?.reportType || 'Assessment',
          org: orgAlias,
          date: new Date().toISOString().split('T')[0]
        }
      };

      // Generate BLUF+4 summary
      const blufResult = await generator.generate(enrichedInput, { format: 'markdown' });

      // Write summary to temp file
      const timestamp = new Date().toISOString().split('T')[0];
      const summaryFilename = `EXECUTIVE_SUMMARY_${timestamp}.md`;
      const summaryPath = path.join(outputDir, summaryFilename);
      fs.writeFileSync(summaryPath, blufResult.content);

      if (verbose) {
        console.log(`\n📝 Generated BLUF+4 summary: ${summaryFilename}`);
        console.log(`   Word count: ${blufResult.metadata.totalWordCount}`);
      }

      // Prepend summary to documents array
      const allDocuments = [
        { path: summaryPath, title: 'Executive Summary', order: 0 },
        ...documents.map((doc, i) => ({
          ...doc,
          order: (doc.order || 0) + 10 // Shift other documents after summary
        }))
      ];

      // Generate PDF using existing method
      const pdfFilename = `${reportType || 'report'}-${orgAlias}-${timestamp}.pdf`;
      const pdfPath = await this.generateMultiReportPDF({
        orgAlias,
        outputDir,
        documents: allDocuments,
        coverTemplate,
        outputFilename: pdfFilename,
        metadata: {
          title: `${reportType || 'Assessment'} - ${orgAlias}`,
          ...metadata
        },
        verbose
      });

      return {
        pdfPath,
        summaryPath,
        validation: blufResult.validation,
        wordCount: blufResult.metadata.totalWordCount
      };

    } catch (error) {
      throw new DataAccessError(
        'PDF_Generation',
        `Failed to generate PDF with BLUF summary for ${orgAlias}: ${error.message}`,
        {
          outputDir,
          orgAlias,
          reportType,
          originalError: error.message,
          workaround: 'Ensure bluf-summary-generator.js is available and input is valid'
        }
      );
    }
  }

  /**
   * Generate BLUF+4 summary from audit file and create PDF
   *
   * Convenience method that extracts BLUF data from an audit file
   * and generates a PDF with executive summary.
   *
   * @param {Object} options
   * @param {string} options.auditFilePath - Path to audit output file (JSON or MD)
   * @param {Array} options.additionalDocuments - Additional documents to include
   * @param {string} options.orgAlias - Organization name
   * @param {string} options.outputDir - Output directory
   * @param {string} options.reportType - Report type identifier
   * @param {string} options.coverTemplate - Cover template name
   * @param {boolean} options.verbose - Enable verbose logging
   * @returns {Promise<Object>} {pdfPath, summaryPath, extractedData, validation}
   */
  static async generateFromAuditFile(options) {
    const {
      auditFilePath,
      additionalDocuments = [],
      orgAlias,
      outputDir,
      reportType,
      coverTemplate = 'executive-report',
      verbose = false
    } = options;

    try {
      // Validate inputs
      if (!auditFilePath) throw new Error('auditFilePath is required');
      if (!fs.existsSync(auditFilePath)) {
        throw new Error(`Audit file not found: ${auditFilePath}`);
      }

      // Load BLUF data extractor
      const BLUFDataExtractor = require('./bluf-data-extractor');
      const extractor = new BLUFDataExtractor({ verbose });

      // Extract BLUF data from audit file
      const extractedData = await extractor.extractFromFile(auditFilePath);

      if (verbose) {
        console.log(`\n📊 Extracted BLUF data from: ${path.basename(auditFilePath)}`);
        console.log(`   Headline: ${extractedData.headline?.substring(0, 50)}...`);
        console.log(`   Findings: ${extractedData.keyFindings?.length || 0}`);
        console.log(`   Next Steps: ${extractedData.nextSteps?.length || 0}`);
      }

      // Prepare documents list (include source audit file if markdown)
      const documents = [...additionalDocuments];
      if (auditFilePath.endsWith('.md')) {
        documents.push({
          path: auditFilePath,
          title: 'Detailed Analysis',
          order: 10
        });
      }

      // Generate PDF with BLUF summary
      const result = await this.generateWithBLUFSummary({
        blufInput: extractedData,
        documents,
        orgAlias: orgAlias || extractedData.metadata?.org || 'unknown',
        outputDir,
        reportType: reportType || extractedData.metadata?.reportType || 'Assessment',
        coverTemplate,
        verbose
      });

      return {
        ...result,
        extractedData
      };

    } catch (error) {
      throw new DataAccessError(
        'PDF_Generation',
        `Failed to generate PDF from audit file: ${error.message}`,
        {
          auditFilePath,
          outputDir,
          originalError: error.message,
          workaround: 'Ensure audit file exists and contains extractable data'
        }
      );
    }
  }

  // ===========================================================================
  // NEW: Complexity Detection and Retry Features (v1.1.0)
  // Addresses reflection: PDF generation config complexity causing ENAMETOOLONG
  // ===========================================================================

  /**
   * Detect content complexity to suggest config level
   *
   * @param {string} content - Markdown content
   * @returns {Object} Complexity analysis with recommended config level
   */
  static detectContentComplexity(content) {
    const indicators = {
      hasMermaid: /```mermaid/i.test(content),
      hasCodeBlocks: /```[a-z]*\n/i.test(content),
      hasImages: /!\[.*\]\(.*\)/i.test(content),
      hasTables: /\|.*\|.*\|/m.test(content),
      hasHeaders: /^#{1,6}\s/m.test(content),
      lineCount: content.split('\n').length,
      charCount: content.length,
    };

    // Calculate complexity score
    let score = 0;
    if (indicators.hasMermaid) score += 0.3;
    if (indicators.hasCodeBlocks) score += 0.1;
    if (indicators.hasImages) score += 0.2;
    if (indicators.hasTables) score += 0.1;
    if (indicators.lineCount > 100) score += 0.1;
    if (indicators.charCount > 10000) score += 0.1;

    // Determine config level
    let recommendedLevel;
    if (score < 0.2) {
      recommendedLevel = 'minimal';
    } else if (score < 0.5) {
      recommendedLevel = 'standard';
    } else {
      recommendedLevel = 'full';
    }

    return {
      indicators,
      score,
      recommendedLevel,
      configLevels: PDF_CONFIG.configLevels,
    };
  }

  /**
   * Pre-render Mermaid diagrams to images
   *
   * Delegates to the canonical MermaidPreRenderer class for consistent
   * rendering with caching, multi-strategy fallback, and verification.
   *
   * @param {string} content - Markdown content with Mermaid blocks
   * @param {string} outputDir - Directory for rendered images
   * @param {boolean} verbose - Enable verbose logging
   * @returns {Object} {content: modified content, renderedCount: number}
   */
  static async preRenderMermaid(content, outputDir, verbose = false) {
    const mermaidCount = (content.match(/```mermaid/gi) || []).length;
    if (mermaidCount === 0) {
      return { content, renderedCount: 0 };
    }

    if (verbose) {
      console.log(`Found ${mermaidCount} Mermaid diagram(s) to pre-render`);
    }

    try {
      const MermaidPreRenderer = require('./mermaid-pre-renderer');
      const renderer = new MermaidPreRenderer({
        verbose,
        cacheDir: path.join(outputDir, '.mermaid-cache'),
      });

      const processedContent = await renderer.render(content, outputDir);
      const remainingCount = (processedContent.match(/```mermaid/gi) || []).length;
      const renderedCount = mermaidCount - remainingCount;

      return { content: processedContent, renderedCount };
    } catch (e) {
      if (verbose) console.log(`  ✗ Mermaid pre-rendering failed: ${e.message}`);
      return { content, renderedCount: 0 };
    }
  }

  /**
   * Generate safe output path (prevent ENAMETOOLONG)
   *
   * @param {string} inputPath - Original input path
   * @param {string} outputPath - Desired output path
   * @returns {string} Safe output path
   */
  static generateSafeOutputPath(inputPath, outputPath) {
    let safePath = outputPath || inputPath.replace(/\.md$/i, '.pdf');

    if (safePath.length > PDF_CONFIG.maxPathLength) {
      const dir = path.dirname(safePath);
      const ext = path.extname(safePath);
      const baseName = path.basename(safePath, ext);
      const maxNameLength = PDF_CONFIG.maxPathLength - dir.length - ext.length - 1;
      const truncatedName = baseName.substring(0, Math.max(10, maxNameLength));
      safePath = path.join(dir, `${truncatedName}${ext}`);
    }

    return safePath;
  }

  /**
   * Generate PDF with automatic retry and config simplification
   *
   * On failure, automatically retries with simpler configs.
   * Addresses reflection: Over-engineered PDF config causing ENAMETOOLONG errors.
   *
   * @param {Object} options
   * @param {string} options.markdownPath - Path to markdown file
   * @param {string} options.outputPath - Optional output path
   * @param {string} options.configLevel - Config level: minimal|standard|full|auto
   * @param {number} options.timeout - Timeout in ms (default: 120000)
   * @param {boolean} options.retry - Enable retry with simpler config (default: true)
   * @param {boolean} options.preRenderMermaid - Pre-render Mermaid diagrams (default: true)
   * @param {Object} options.metadata - Optional metadata overrides
   * @param {string} options.profile - Preset profile (simple, cover-toc)
   * @param {string} options.theme - Theme override
   * @param {boolean} options.renderMermaid - Render Mermaid diagrams (default: true)
   * @param {boolean} options.verbose - Enable verbose logging
   * @returns {Promise<Object>} Generation result with attempts history
   */
  static async generateWithRetry(options) {
    const {
      markdownPath,
      outputPath = null,
      configLevel = 'auto',
      timeout = PDF_CONFIG.defaultTimeout,
      retry = true,
      preRenderMermaid: shouldPreRender = true,
      metadata = {},
      profile,
      theme,
      coverTemplate,
      renderMermaid = true,
      verbose = false,
    } = options;

    const results = {
      success: false,
      attempts: [],
      finalPath: null,
      pdfPath: null,
      preRenderedDiagrams: 0,
    };

    if (!fs.existsSync(markdownPath)) {
      return { success: false, error: `Input file not found: ${markdownPath}` };
    }

    let content = fs.readFileSync(markdownPath, 'utf8');
    let inputPath = markdownPath;

    // Detect complexity if auto config
    const complexity = this.detectContentComplexity(content);
    let currentLevel = configLevel === 'auto' ? complexity.recommendedLevel : configLevel;
    const resolvedProfile = resolveStyleProfile(profile || DEFAULT_STYLE_PROFILE);
    assertNoLegacyStyleOverrides({ theme });

    if (verbose) {
      console.log(`Content complexity: ${complexity.score.toFixed(2)}`);
      console.log(`Using config: ${currentLevel}`);
    }

    // Pre-render Mermaid if enabled
    if (shouldPreRender && complexity.indicators.hasMermaid) {
      const outputDir = path.dirname(markdownPath);
      try {
        const mermaidResult = await this.preRenderMermaid(content, outputDir, verbose);
        content = mermaidResult.content;
        results.preRenderedDiagrams = mermaidResult.renderedCount;

        if (mermaidResult.renderedCount > 0) {
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-gen-'));
          inputPath = path.join(tempDir, path.basename(markdownPath));
          fs.writeFileSync(inputPath, content);
        }
      } catch (e) {
        if (verbose) console.log(`Mermaid pre-rendering failed: ${e.message}`);
      }
    }

      const safeOutputPath = this.generateSafeOutputPath(inputPath, outputPath);
    const levels = ['full', 'standard', 'minimal'];
    const startIndex = levels.indexOf(currentLevel);
    const levelsToTry = retry ? levels.slice(startIndex) : [currentLevel];

    for (const level of levelsToTry) {
      const attempt = { level, timestamp: new Date().toISOString(), success: false, error: null };

      if (verbose) console.log(`\nAttempting PDF generation with '${level}' config...`);

      try {
        // Use existing generateSingleReportPDF or direct generation
        const config = PDF_CONFIG.configLevels[level]?.options || {};
        const featureOverrides = typeof config.displayHeaderFooter === 'boolean'
          ? { headerFooter: config.displayHeaderFooter }
          : undefined;

        const result = await this.generateSingleReportPDF({
          markdownPath: inputPath,
          outputPath: safeOutputPath,
          orgAlias: 'report',
          reportType: 'document',
          metadata,
          profile: resolvedProfile,
          coverTemplate,
          renderMermaid,
          verbose,
          format: config.format,
          margin: config.margin,
          printBackground: config.printBackground,
          features: featureOverrides
        });

        if (result) {
          attempt.success = true;
          results.success = true;
          results.finalPath = result;
          results.pdfPath = result;
          results.attempts.push(attempt);
          if (verbose) console.log(`✅ PDF generated: ${result}`);
          break;
        }
      } catch (e) {
        attempt.error = e.message;
        results.attempts.push(attempt);

        if (verbose) console.log(`❌ Failed with '${level}' config: ${e.message}`);

        const simplifyErrors = ['ENAMETOOLONG', 'timeout', 'ETIMEOUT', 'memory'];
        const shouldSimplify = simplifyErrors.some(err =>
          e.message.toLowerCase().includes(err.toLowerCase())
        );

        if (!retry || !shouldSimplify) break;
        if (verbose) console.log('Retrying with simpler config...');
      }
    }

    if (!results.success) {
      results.error = results.attempts[results.attempts.length - 1]?.error || 'Unknown error';
    }

    return results;
  }
}

// Export configuration for external use
PDFGenerationHelper.CONFIG = PDF_CONFIG;

module.exports = PDFGenerationHelper;
