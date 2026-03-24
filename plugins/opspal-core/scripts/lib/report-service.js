/**
 * Centralized Report Service
 *
 * Provides a unified interface for all agents to generate reports.
 * Routes all report generation through PDFGenerationHelper with
 * standardized paths, naming, and tracking.
 *
 * Usage:
 * ```javascript
 * const ReportService = require('./report-service');
 *
 * // Generate a report
 * const result = await ReportService.generate({
 *   type: 'revops-audit',
 *   platform: 'salesforce',
 *   org: 'acme-corp',
 *   title: 'RevOps Assessment',
 *   content: markdownContent,
 *   // or: markdownPath: './report.md'
 * });
 *
 * // List recent reports
 * const reports = ReportService.listReports({ org: 'acme-corp' });
 * ```
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const PDFGenerationHelper = require('./pdf-generation-helper');
const PDFGenerator = require('./pdf-generator');
const {
  resolveStyleProfile,
  assertNoLegacyStyleOverrides,
  DEFAULT_STYLE_PROFILE
} = require('./pdf-style-policy');
const { getResolver } = require('./customization/resolver-factory');

// =============================================================================
// Report Type Configuration
// =============================================================================

const REPORT_TYPES = {
  // Salesforce Reports
  'revops-audit': {
    platform: 'salesforce',
    coverTemplate: 'salesforce-audit',
    category: 'audit',
    description: 'RevOps Assessment Report'
  },
  'cpq-assessment': {
    platform: 'salesforce',
    coverTemplate: 'salesforce-audit',
    category: 'assessment',
    description: 'CPQ Configuration Assessment'
  },
  'automation-audit': {
    platform: 'salesforce',
    coverTemplate: 'salesforce-audit',
    category: 'audit',
    description: 'Automation Audit Report'
  },
  'flow-diagnostic': {
    platform: 'salesforce',
    coverTemplate: 'salesforce-audit',
    category: 'diagnostic',
    description: 'Flow Diagnostic Report'
  },
  'metadata-analysis': {
    platform: 'salesforce',
    coverTemplate: 'salesforce-audit',
    category: 'analysis',
    description: 'Metadata Analysis Report'
  },
  'security-audit': {
    platform: 'salesforce',
    coverTemplate: 'security-audit',
    category: 'audit',
    description: 'Security Audit Report'
  },
  'permission-analysis': {
    platform: 'salesforce',
    coverTemplate: 'security-audit',
    category: 'analysis',
    description: 'Permission Set Analysis'
  },
  'data-quality': {
    platform: 'salesforce',
    coverTemplate: 'data-quality',
    category: 'audit',
    description: 'Data Quality Assessment'
  },

  // HubSpot Reports
  'hubspot-audit': {
    platform: 'hubspot',
    coverTemplate: 'hubspot-assessment',
    category: 'audit',
    description: 'HubSpot Assessment Report'
  },
  'hubspot-workflow': {
    platform: 'hubspot',
    coverTemplate: 'hubspot-assessment',
    category: 'analysis',
    description: 'Workflow Analysis Report'
  },

  // Cross-Platform Reports
  'executive-summary': {
    platform: 'cross-platform',
    coverTemplate: 'executive-report',
    category: 'summary',
    description: 'Executive Summary Report'
  },
  'integration-review': {
    platform: 'cross-platform',
    coverTemplate: 'cross-platform-integration',
    category: 'review',
    description: 'Integration Review Report'
  },
  'gtm-planning': {
    platform: 'cross-platform',
    coverTemplate: 'gtm-planning',
    category: 'planning',
    description: 'GTM Planning Report'
  },

  // Test Reports
  'uat-results': {
    platform: 'cross-platform',
    coverTemplate: 'default',
    category: 'test',
    description: 'UAT Test Results'
  },

  // OKR Reports (landscape by default for table-heavy content)
  'okr-executive': {
    platform: 'cross-platform',
    coverTemplate: 'okr-executive-report',
    category: 'report',
    description: 'OKR Executive Report',
    landscape: true
  },
  'okr-status': {
    platform: 'cross-platform',
    coverTemplate: 'okr-executive-report',
    category: 'report',
    description: 'OKR Status Report',
    landscape: true
  },
  'okr-retrospective': {
    platform: 'cross-platform',
    coverTemplate: 'okr-executive-report',
    category: 'report',
    description: 'OKR Retrospective Report',
    landscape: true
  }
};

function resolveFallbackCoverTemplate({ platform = 'cross-platform', type = '', title = '' }) {
  const platformLower = String(platform || 'cross-platform').toLowerCase();
  const typeSignal = `${type || ''} ${title || ''}`.toLowerCase();

  if (platformLower === 'salesforce') {
    if (/\bdata[-\s]?quality|dedup|duplicate\b/.test(typeSignal)) {
      return 'data-quality';
    }
    if (/\bsecurity|permission|fls|compliance\b/.test(typeSignal)) {
      return 'security-audit';
    }
    return 'salesforce-audit';
  }

  if (platformLower === 'hubspot') {
    return 'hubspot-assessment';
  }

  const inferred = PDFGenerationHelper.getRecommendedCoverTemplate(typeSignal || 'executive summary');
  return inferred === 'default' ? 'executive-report' : inferred;
}

function resolveTypeConfig({ type, platform, title }) {
  const knownType = REPORT_TYPES[type];
  if (knownType) {
    return { ...knownType };
  }

  const resolvedPlatform = platform || 'cross-platform';
  return {
    platform: resolvedPlatform,
    coverTemplate: resolveFallbackCoverTemplate({
      platform: resolvedPlatform,
      type,
      title
    }),
    category: 'report',
    description: title || 'Report'
  };
}

// =============================================================================
// Report Registry
// =============================================================================

class ReportRegistry {
  constructor(registryPath) {
    this.registryPath = registryPath || path.join(__dirname, '../../.report-registry.json');
    this.registry = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.registryPath)) {
        return JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
      }
    } catch (e) {
      console.warn('Could not load report registry:', e.message);
    }
    return { reports: [], lastUpdated: null };
  }

  _save() {
    try {
      this.registry.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2));
    } catch (e) {
      console.warn('Could not save report registry:', e.message);
    }
  }

  add(report) {
    this.registry.reports.unshift({
      id: this._generateId(),
      ...report,
      generatedAt: new Date().toISOString()
    });
    // Keep last 100 reports
    if (this.registry.reports.length > 100) {
      this.registry.reports = this.registry.reports.slice(0, 100);
    }
    this._save();
    return this.registry.reports[0];
  }

  list(filters = {}) {
    let reports = this.registry.reports;

    if (filters.org) {
      reports = reports.filter(r => r.org === filters.org);
    }
    if (filters.platform) {
      reports = reports.filter(r => r.platform === filters.platform);
    }
    if (filters.type) {
      reports = reports.filter(r => r.type === filters.type);
    }
    if (filters.category) {
      reports = reports.filter(r => r.category === filters.category);
    }
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      reports = reports.filter(r => new Date(r.generatedAt) >= sinceDate);
    }
    if (filters.limit) {
      reports = reports.slice(0, filters.limit);
    }

    return reports;
  }

  get(id) {
    return this.registry.reports.find(r => r.id === id);
  }

  _generateId() {
    return `rpt_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  }
}

// =============================================================================
// Report Service
// =============================================================================

class ReportService {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.baseOutputDir = options.baseOutputDir || path.join(__dirname, '../../../instances');
    this.registry = new ReportRegistry(options.registryPath);
  }

  /**
   * Generate a report
   *
   * @param {Object} options - Report options
   * @param {string} options.type - Report type (e.g., 'revops-audit', 'cpq-assessment')
   * @param {string} options.org - Organization/instance name
   * @param {string} options.title - Report title
   * @param {string} [options.content] - Markdown content (mutually exclusive with markdownPath)
   * @param {string} [options.markdownPath] - Path to markdown file
   * @param {string} [options.platform] - Platform override (salesforce, hubspot, cross-platform)
   * @param {Object} [options.metadata] - Additional metadata (version, author, subtitle)
   * @param {boolean} [options.includeBLUF] - Include BLUF+4 executive summary
   * @param {boolean} [options.renderMermaid] - Render Mermaid diagrams (default: true)
   * @param {string} [options.outputDir] - Custom output directory
   * @returns {Promise<Object>} Report result with path and registry entry
   */
  async generate(options) {
    const {
      type,
      org,
      title,
      content,
      markdownPath,
      platform,
      metadata = {},
      includeBLUF = false,
      renderMermaid = true,
      outputDir,
      profile,
      theme,
      landscape
    } = options;

    // Validate inputs
    if (!type) throw new Error('Report type is required');
    if (!org) throw new Error('Organization name is required');
    if (!content && !markdownPath) throw new Error('Either content or markdownPath is required');

    // Get report type config
    const resolvedProfile = resolveStyleProfile(profile || DEFAULT_STYLE_PROFILE);
    assertNoLegacyStyleOverrides({ theme });

    const typeConfig = resolveTypeConfig({ type, platform, title });

    // Determine output directory
    const reportPlatform = platform || typeConfig.platform;
    const outputPath = outputDir || this._getOutputDir(reportPlatform, org, type);

    // Ensure output directory exists
    fs.mkdirSync(outputPath, { recursive: true });

    // Write content to temp file if provided as string
    let mdPath = markdownPath;
    let tempFile = null;
    if (content) {
      tempFile = path.join(outputPath, `${this._slugify(title || type)}.md`);
      fs.writeFileSync(tempFile, content);
      mdPath = tempFile;
    }

    // Generate PDF filename
    const timestamp = new Date().toISOString().split('T')[0];
    const pdfFilename = `${this._slugify(title || typeConfig.description)}-${timestamp}.pdf`;
    const pdfPath = path.join(outputPath, pdfFilename);

    // Prepare metadata
    const fullMetadata = {
      title: title || typeConfig.description,
      org: org,
      date: timestamp,
      version: metadata.version || '1.0',
      author: metadata.author || 'OpsPal by RevPal',
      subtitle: metadata.subtitle || typeConfig.description,
      reportType: typeConfig.category.toUpperCase(),
      ...metadata
    };

    if (this.verbose) {
      console.log(`📄 Generating ${type} report for ${org}...`);
      console.log(`   Output: ${pdfPath}`);
    }

    try {
      // Use PDFGenerator directly for more control, with customization resolver
      const resolver = await getResolver();
      const generator = new PDFGenerator({
        verbose: this.verbose,
        resolver
      });

      // Resolve landscape: explicit option > type config default > false
      const resolvedLandscape = landscape !== undefined ? landscape : (typeConfig.landscape || false);

      await generator.convertMarkdown(mdPath, pdfPath, {
        profile: resolvedProfile,
        coverTemplate: typeConfig.coverTemplate,
        renderMermaid,
        metadata: fullMetadata,
        landscape: resolvedLandscape,
      });

      // Generate BLUF summary if requested
      let blufPath = null;
      if (includeBLUF) {
        blufPath = await this._generateBLUF(mdPath, outputPath, fullMetadata);
      }

      // Register the report
      const registryEntry = this.registry.add({
        type,
        platform: reportPlatform,
        category: typeConfig.category,
        org,
        title: fullMetadata.title,
        pdfPath,
        markdownPath: mdPath,
        blufPath,
        metadata: fullMetadata
      });

      if (this.verbose) {
        console.log(`✅ Report generated: ${pdfFilename}`);
        console.log(`   Registry ID: ${registryEntry.id}`);
      }

      return {
        success: true,
        pdfPath,
        markdownPath: mdPath,
        blufPath,
        outputDir: outputPath,
        registry: registryEntry
      };

    } catch (error) {
      console.error(`❌ Report generation failed: ${error.message}`);

      // Try fallback with simpler config
      if (this.verbose) {
        console.log('   Attempting fallback with minimal config...');
      }

      try {
        const result = await PDFGenerationHelper.generateWithRetry({
          markdownPath: mdPath,
          outputPath: pdfPath,
          metadata: fullMetadata,
          profile: resolvedProfile,
          coverTemplate: typeConfig.coverTemplate,
          renderMermaid,
          verbose: this.verbose
        });

        const registryEntry = this.registry.add({
          type,
          platform: reportPlatform,
          category: typeConfig.category,
          org,
          title: fullMetadata.title,
          pdfPath: result.pdfPath,
          markdownPath: mdPath,
          metadata: fullMetadata,
          fallback: true
        });

        return {
          success: true,
          pdfPath: result.pdfPath,
          markdownPath: mdPath,
          outputDir: outputPath,
          registry: registryEntry,
          fallback: true
        };
      } catch (fallbackError) {
        throw new Error(`Report generation failed: ${fallbackError.message}`);
      }
    }
  }

  /**
   * Generate multiple reports and collate into single PDF
   */
  async generateCollated(options) {
    const {
      type,
      org,
      title,
      documents,
      platform,
      metadata = {},
      renderMermaid = true,
      outputDir,
      profile,
      theme,
      toc,
      bookmarks,
      landscape
    } = options;

    const resolvedProfile = resolveStyleProfile(profile || DEFAULT_STYLE_PROFILE);
    assertNoLegacyStyleOverrides({ theme, toc });

    if (!documents || documents.length === 0) {
      throw new Error('Documents array is required');
    }

    const typeConfig = resolveTypeConfig({ type, platform, title });

    const reportPlatform = platform || typeConfig.platform;
    const outputPath = outputDir || this._getOutputDir(reportPlatform, org, type);
    fs.mkdirSync(outputPath, { recursive: true });

    const timestamp = new Date().toISOString().split('T')[0];
    const pdfFilename = `${this._slugify(title || type)}-collated-${timestamp}.pdf`;
    const pdfPath = path.join(outputPath, pdfFilename);

    const fullMetadata = {
      title: title || typeConfig.description,
      org,
      date: timestamp,
      version: metadata.version || '1.0',
      author: metadata.author || 'OpsPal by RevPal',
      reportType: typeConfig.category.toUpperCase(),
      ...metadata
    };

    const resolverForCollate = await getResolver();
    const generator = new PDFGenerator({
      verbose: this.verbose,
      resolver: resolverForCollate
    });

    const resolvedLandscape = landscape !== undefined ? landscape : (typeConfig.landscape || false);

    await generator.collate(documents, pdfPath, {
      profile: resolvedProfile,
      coverTemplate: typeConfig.coverTemplate,
      renderMermaid,
      bookmarks: bookmarks,
      metadata: fullMetadata,
      landscape: resolvedLandscape,
    });

    const registryEntry = this.registry.add({
      type,
      platform: reportPlatform,
      category: typeConfig.category,
      org,
      title: fullMetadata.title,
      pdfPath,
      documentCount: documents.length,
      metadata: fullMetadata,
      collated: true
    });

    return {
      success: true,
      pdfPath,
      outputDir: outputPath,
      documentCount: documents.length,
      registry: registryEntry
    };
  }

  /**
   * List generated reports
   */
  listReports(filters = {}) {
    return this.registry.list(filters);
  }

  /**
   * Get report by ID
   */
  getReport(id) {
    return this.registry.get(id);
  }

  /**
   * Get available report types
   */
  static getReportTypes() {
    return Object.entries(REPORT_TYPES).map(([key, config]) => ({
      type: key,
      ...config
    }));
  }

  /**
   * Get output directory for a report
   */
  _getOutputDir(platform, org, type) {
    const timestamp = new Date().toISOString().split('T')[0];
    const baseDir = this.baseOutputDir;

    // Platform-specific paths
    const platformDirs = {
      'salesforce': path.join(baseDir, 'salesforce', org, 'reports', type, timestamp),
      'hubspot': path.join(baseDir, 'hubspot', org, 'reports', type, timestamp),
      'cross-platform': path.join(baseDir, 'cross-platform', org, 'reports', type, timestamp)
    };

    return platformDirs[platform] || platformDirs['cross-platform'];
  }

  /**
   * Generate BLUF+4 executive summary
   */
  async _generateBLUF(markdownPath, outputDir, metadata) {
    try {
      const BLUFGenerator = require('./bluf-generator');
      const content = fs.readFileSync(markdownPath, 'utf8');
      const bluf = await BLUFGenerator.generate(content, metadata);
      const blufPath = path.join(outputDir, 'EXECUTIVE_SUMMARY.md');
      fs.writeFileSync(blufPath, bluf);
      return blufPath;
    } catch (e) {
      if (this.verbose) {
        console.log('   BLUF generation skipped:', e.message);
      }
      return null;
    }
  }

  /**
   * Convert string to URL-safe slug
   */
  _slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}

// =============================================================================
// Static Convenience Methods
// =============================================================================

/**
 * Quick report generation (static method)
 */
ReportService.generate = async function(options) {
  const service = new ReportService({ verbose: options.verbose });
  return service.generate(options);
};

/**
 * Quick collated report generation (static method)
 */
ReportService.generateCollated = async function(options) {
  const service = new ReportService({ verbose: options.verbose });
  return service.generateCollated(options);
};

/**
 * List reports (static method)
 */
ReportService.listReports = function(filters = {}) {
  const service = new ReportService();
  return service.listReports(filters);
};

// =============================================================================
// CLI Support
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Report Service CLI

Usage:
  node report-service.js generate --type <type> --org <org> --content <file>
  node report-service.js list [--org <org>] [--type <type>] [--limit <n>]
  node report-service.js types

Options:
  --type      Report type (revops-audit, cpq-assessment, etc.)
  --org       Organization name
  --content   Markdown file path
  --title     Report title
  --profile   Preset profile (simple, cover-toc)
  --verbose   Verbose output

Examples:
  node report-service.js generate --type revops-audit --org acme --content ./report.md
  node report-service.js list --org acme --limit 10
  node report-service.js types
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'types') {
    console.log('\nAvailable Report Types:\n');
    ReportService.getReportTypes().forEach(t => {
      console.log(`  ${t.type.padEnd(25)} ${t.platform.padEnd(15)} ${t.description}`);
    });
    process.exit(0);
  }

  if (command === 'list') {
    const filters = {};
    const orgIdx = args.indexOf('--org');
    const typeIdx = args.indexOf('--type');
    const limitIdx = args.indexOf('--limit');

    if (orgIdx > -1) filters.org = args[orgIdx + 1];
    if (typeIdx > -1) filters.type = args[typeIdx + 1];
    if (limitIdx > -1) filters.limit = parseInt(args[limitIdx + 1]);

    const reports = ReportService.listReports(filters);
    console.log(`\nRecent Reports (${reports.length}):\n`);
    reports.forEach(r => {
      console.log(`  ${r.id}  ${r.generatedAt.split('T')[0]}  ${r.type.padEnd(20)}  ${r.org}`);
      console.log(`          ${r.pdfPath}`);
    });
    process.exit(0);
  }

  if (command === 'generate') {
    const typeIdx = args.indexOf('--type');
    const orgIdx = args.indexOf('--org');
    const contentIdx = args.indexOf('--content');
    const titleIdx = args.indexOf('--title');
    const profileIdx = args.indexOf('--profile');
    const verbose = args.includes('--verbose');

    if (args.includes('--theme')) {
      console.error('Error: --theme is no longer supported. Use --profile simple or --profile cover-toc.');
      process.exit(1);
    }

    if (typeIdx === -1 || orgIdx === -1 || contentIdx === -1) {
      console.error('Error: --type, --org, and --content are required');
      process.exit(1);
    }

    (async () => {
      try {
        const result = await ReportService.generate({
          type: args[typeIdx + 1],
          org: args[orgIdx + 1],
          markdownPath: args[contentIdx + 1],
          title: titleIdx > -1 ? args[titleIdx + 1] : undefined,
          profile: profileIdx > -1 ? args[profileIdx + 1] : undefined,
          verbose
        });
        console.log('\n✅ Report generated successfully');
        console.log(`   PDF: ${result.pdfPath}`);
        console.log(`   ID:  ${result.registry.id}`);
        process.exit(0);
      } catch (e) {
        console.error(`\n❌ Error: ${e.message}`);
        process.exit(1);
      }
    })();
  }
}

module.exports = ReportService;
