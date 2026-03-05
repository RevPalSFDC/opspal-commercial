#!/usr/bin/env node

/**
 * PDF Generator - Cross-Platform Markdown to PDF Converter
 *
 * Converts markdown documents to professional PDFs with support for:
 * - Single document conversion with auto-TOC
 * - Multi-document collation with TOC and bookmarks
 * - Automatic Mermaid chart rendering
 * - Custom cover pages with full branding
 * - Headers/footers with page numbers
 * - External CSS theming system
 * - Cross-document link resolution
 *
 * @version 2.0.0
 * @date 2025-12-25
 */

const fs = require('fs').promises;
const path = require('path');
const { mdToPdf } = require('md-to-pdf');
const { PDFDocument } = require('pdf-lib');
const StyleManager = require('./style-manager');
const TemplateEngine = require('./template-engine');

class PDFGenerator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.tempDir = options.tempDir || path.join(__dirname, '../../.temp/pdf-generation');

        // Initialize style manager with RevPal theme and default branding
        this.styleManager = new StyleManager({
            verbose: this.verbose,
            theme: options.theme || 'revpal',
            branding: { ...StyleManager.getDefaultBranding(), ...(options.branding || {}) }
        });

        // Initialize template engine
        this.templateEngine = new TemplateEngine({
            verbose: this.verbose
        });

        // Default feature flags
        this.defaultFeatures = {
            coverPage: false,
            tableOfContents: 'auto',  // 'auto' | 'always' | 'never'
            headerFooter: true,
            pageNumbers: true,
            renderMermaid: true,
            bookmarks: false
        };

        // Auto-TOC thresholds
        this.autoTOCThresholds = {
            minHeadings: 5,
            minLength: 3000,
            maxDepth: 3
        };
    }

    /**
     * Convert a single markdown file to PDF
     * @param {string} inputPath - Path to markdown file
     * @param {string} outputPath - Path for PDF output
     * @param {Object} options - Generation options
     * @returns {Promise<string>} Path to generated PDF
     */
    async convertMarkdown(inputPath, outputPath, options = {}) {
        try {
            if (this.verbose) {
                console.log(`📄 Converting ${path.basename(inputPath)} to PDF...`);
            }

            // Merge features with defaults
            const features = { ...this.defaultFeatures, ...(options.features || {}) };

            // Read markdown content
            const markdown = await fs.readFile(inputPath, 'utf8');
            let processedMarkdown = markdown;

            // Pre-process: Render Mermaid diagrams
            if (features.renderMermaid || options.renderMermaid) {
                const MermaidPreRenderer = require('./mermaid-pre-renderer');
                const renderer = new MermaidPreRenderer({
                    verbose: this.verbose,
                    ...(options.diagrams || {})
                });
                processedMarkdown = await renderer.render(processedMarkdown, path.dirname(inputPath));
            }

            // Pre-process: Auto-generate TOC for single documents
            if (this._shouldGenerateTOC(processedMarkdown, features, options)) {
                if (this.verbose) {
                    console.log('  Adding auto-generated Table of Contents...');
                }
                processedMarkdown = this._insertTOC(processedMarkdown, options);
            }

            // Pre-process: Add cover page content if requested
            if (features.coverPage || options.addCoverPage || options.coverPage) {
                const coverContent = await this._generateCoverPage(options);
                processedMarkdown = coverContent + '\n\n' + processedMarkdown;
            }

            // Get stylesheet from StyleManager
            const stylesheet = await this._resolveStylesheet(options);

            // Build header/footer templates
            const { headerTemplate, footerTemplate } = this._buildHeaderFooter(features, options);

            // Determine margins (larger when using header/footer)
            const margins = this._resolveMargins(features, options);

            // Configure PDF options
            const pdfOptions = {
                dest: outputPath,
                pdf_options: {
                    format: options.format || 'A4',
                    margin: margins,
                    printBackground: true,
                    preferCSSPageSize: true,
                    displayHeaderFooter: features.headerFooter,
                    headerTemplate,
                    footerTemplate
                },
                stylesheet,
                body_class: options.bodyClass || 'markdown-body',
                launch_options: {
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                }
            };

            // Generate PDF
            const pdf = await mdToPdf({ content: processedMarkdown }, pdfOptions);

            if (pdf && pdf.filename) {
                if (this.verbose) {
                    const stats = await fs.stat(pdf.filename);
                    console.log(`✅ PDF generated: ${path.basename(pdf.filename)} (${(stats.size / 1024).toFixed(2)} KB)`);
                }

                // Post-process: Add bookmarks if requested and Pandoc available
                if (features.bookmarks && options.headings) {
                    await this._addBookmarksWithPandoc(pdf.filename, options.headings, outputPath);
                }

                // Cleanup temp CSS file
                await this._cleanupTempCss();

                return pdf.filename;
            }

            throw new Error('PDF generation failed - no output file created');

        } catch (error) {
            // Cleanup temp CSS on error
            await this._cleanupTempCss();
            console.error(`❌ Error converting ${inputPath}:`, error.message);
            throw error;
        }
    }

    /**
     * Determine if TOC should be generated for single document
     * @private
     */
    _shouldGenerateTOC(markdown, features, options) {
        const tocSetting = features.tableOfContents || options.toc;

        if (tocSetting === 'never') return false;
        if (tocSetting === 'always') return true;

        // Auto-detect based on thresholds
        const thresholds = options.autoTOC || this.autoTOCThresholds;
        const headingCount = this._countHeadings(markdown);
        const contentLength = markdown.length;

        return headingCount >= thresholds.minHeadings || contentLength >= thresholds.minLength;
    }

    /**
     * Count headings in markdown
     * @private
     */
    _countHeadings(markdown) {
        const headingPattern = /^#{1,6}\s+.+$/gm;
        const matches = markdown.match(headingPattern);
        return matches ? matches.length : 0;
    }

    /**
     * Extract headings from markdown
     * @private
     */
    _extractHeadings(markdown, maxDepth = 3) {
        const headings = [];
        const lines = markdown.split('\n');

        for (const line of lines) {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                if (level <= maxDepth) {
                    const text = match[2].trim();
                    headings.push({
                        level,
                        text,
                        id: this._slugify(text)
                    });
                }
            }
        }

        return headings;
    }

    /**
     * Generate TOC markdown and insert into content
     * @private
     */
    _insertTOC(markdown, options) {
        const maxDepth = options.autoTOC?.maxDepth || this.autoTOCThresholds.maxDepth;
        const headings = this._extractHeadings(markdown, maxDepth);

        if (headings.length === 0) return markdown;

        // Generate TOC markdown
        let toc = '<div class="toc">\n\n## Contents\n\n';

        for (const heading of headings) {
            const indent = '  '.repeat(heading.level - 1);
            toc += `${indent}- [${heading.text}](#${heading.id})\n`;
        }

        toc += '\n</div>\n\n';

        // Insert after first H1, or at beginning
        const firstH1Match = markdown.match(/^#\s+.+$/m);
        if (firstH1Match) {
            const insertIndex = markdown.indexOf(firstH1Match[0]) + firstH1Match[0].length;
            return markdown.slice(0, insertIndex) + '\n\n' + toc + markdown.slice(insertIndex);
        }

        return toc + markdown;
    }

    /**
     * Convert text to URL-safe slug
     * @private
     */
    _slugify(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    /**
     * Generate cover page content
     * @private
     */
    async _generateCoverPage(options) {
        const metadata = options.metadata || {};
        const coverTemplate = options.coverPage?.template || 'default';
        const templatePath = path.join(__dirname, `../../templates/pdf-covers/${coverTemplate}.md`);

        // Get default branding for logo
        const defaultBranding = StyleManager.getDefaultBranding();
        const logoPath = options.branding?.logo?.path || defaultBranding.logo.path;

        // Convert logo to base64 data URI for reliable PDF rendering
        let logoDataUri = null;
        if (logoPath) {
            try {
                const logoBuffer = await fs.readFile(logoPath);
                const ext = path.extname(logoPath).toLowerCase().slice(1);
                const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
                logoDataUri = `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
            } catch (e) {
                if (this.verbose) {
                    console.log(`  Warning: Could not load logo from ${logoPath}`);
                }
            }
        }

        // Prepare template data
        const data = {
            title: metadata.title || 'Document',
            org: metadata.org || '',
            date: metadata.date || new Date().toISOString().split('T')[0],
            version: metadata.version || '1.0',
            author: metadata.author || 'OpsPal by RevPal',
            subtitle: metadata.subtitle || '',
            reportType: metadata.reportType || '',
            logoPath: logoDataUri,
            ...metadata
        };

        try {
            // Try to use template file
            const templateContent = await fs.readFile(templatePath, 'utf8');
            return await this.templateEngine.render(templateContent, data);
        } catch (e) {
            // Fallback to basic cover
            if (this.verbose) {
                console.log(`  Cover template not found: ${coverTemplate}, using default`);
            }
            return this._getDefaultCover(data);
        }
    }

    /**
     * Get basic default cover page
     * @private
     */
    _getDefaultCover(data) {
        const logoHtml = data.logoPath
            ? `<div class="cover-logo"><img src="${data.logoPath}" alt="RevPal Logo" /></div>`
            : '';

        return `<div class="cover-page">

${logoHtml}

# ${data.title}

${data.reportType ? `<div class="cover-report-type">${data.reportType}</div>` : ''}

${data.subtitle ? `<p class="cover-subtitle">${data.subtitle}</p>` : ''}

<div class="cover-divider"></div>

<div class="cover-metadata">
<div class="cover-metadata-grid">
<div class="cover-metadata-item">
<span class="cover-metadata-label">Organization</span>
<span class="cover-metadata-value">${data.org || 'N/A'}</span>
</div>
<div class="cover-metadata-item">
<span class="cover-metadata-label">Generated</span>
<span class="cover-metadata-value">${data.date}</span>
</div>
<div class="cover-metadata-item">
<span class="cover-metadata-label">Version</span>
<span class="cover-metadata-value">${data.version}</span>
</div>
<div class="cover-metadata-item">
<span class="cover-metadata-label">Author</span>
<span class="cover-metadata-value">${data.author}</span>
</div>
</div>
</div>

<div class="cover-footer">
<p class="cover-branding"><strong>OpsPal</strong> by RevPal</p>
</div>

</div>

<div class="page-break"></div>
`;
    }

    /**
     * Resolve stylesheet using StyleManager
     * Writes CSS to temp file since md-to-pdf expects a file path
     * @private
     */
    async _resolveStylesheet(options) {
        // Honor explicit stylesheet path (backward compatibility)
        if (options.stylesheet) {
            // Check if it's a path (has extension) or CSS content
            if (options.stylesheet.endsWith('.css') || options.stylesheet.startsWith('/')) {
                return options.stylesheet;
            }
        }

        // Ensure temp directory exists
        await fs.mkdir(this.tempDir, { recursive: true });

        // Generate CSS content from StyleManager
        const cssContent = await this.styleManager.getStylesheet({
            theme: options.style?.theme || options.theme,
            branding: options.branding || options.style,
            components: options.components || ['tables', 'toc', 'cover'],
            customCSS: options.customCSS
        });

        // Write CSS to temp file (md-to-pdf expects a file path)
        const tempCssPath = path.join(this.tempDir, `pdf-styles-${Date.now()}.css`);
        await fs.writeFile(tempCssPath, cssContent, 'utf8');

        if (this.verbose) {
            console.log(`  Generated stylesheet: ${tempCssPath}`);
        }

        // Store for cleanup
        this._tempCssPath = tempCssPath;

        return tempCssPath;
    }

    /**
     * Clean up temporary CSS file
     * @private
     */
    async _cleanupTempCss() {
        if (this._tempCssPath) {
            try {
                await fs.unlink(this._tempCssPath);
            } catch (e) {
                // Ignore cleanup errors
            }
            this._tempCssPath = null;
        }
    }

    /**
     * Build header/footer templates
     * @private
     */
    _buildHeaderFooter(features, options) {
        if (!features.headerFooter) {
            return {
                headerTemplate: '<div></div>',
                footerTemplate: '<div></div>'
            };
        }

        const theme = options.theme || this.styleManager.theme;
        const coverPageEnabled = features.coverPage || options.addCoverPage || options.coverPage;
        const explicitShowHeader = options.hideHeader === false || options.header === true;
        const explicitHideHeader = options.hideHeader === true || options.header === false;
        const hideHeader = explicitHideHeader
            || (!explicitShowHeader && (theme === 'revpal-brand' || coverPageEnabled));

        return this.styleManager.getHeaderFooterTemplates({
            branding: options.branding,
            metadata: options.metadata,
            hideHeader
        });
    }

    /**
     * Resolve page margins based on features
     * @private
     */
    _resolveMargins(features, options) {
        // If explicit margins provided, use them
        if (options.margin) {
            return options.margin;
        }

        // Larger margins when using headers/footers
        if (features.headerFooter) {
            return {
                top: '25mm',
                bottom: '25mm',
                left: '20mm',
                right: '20mm'
            };
        }

        return '20mm';
    }

    /**
     * Add bookmarks using Pandoc/pdftk (if available)
     * @private
     */
    async _addBookmarksWithPandoc(inputPath, headings, outputPath) {
        try {
            // Try to use PandocBookmarks module
            const PandocBookmarks = require('./pandoc-bookmarks');
            const bookmarker = new PandocBookmarks({ verbose: this.verbose });
            await bookmarker.addBookmarks(inputPath, headings, outputPath);
        } catch (e) {
            if (this.verbose) {
                console.log('  ⚠️ PDF bookmarks skipped (Pandoc/pdftk not available)');
            }
            // Non-fatal - PDF is still valid without bookmarks
        }
    }

    /**
     * Collate multiple markdown documents into a single PDF
     * @param {Array<Object>} documents - Array of {path, title, order?}
     * @param {string} outputPath - Path for PDF output
     * @param {Object} options - Collation options
     * @returns {Promise<string>} Path to generated PDF
     */
    async collate(documents, outputPath, options = {}) {
        try {
            if (this.verbose) {
                console.log(`\n📚 Collating ${documents.length} documents into PDF...`);
            }

            // Ensure temp directory exists
            await fs.mkdir(this.tempDir, { recursive: true });

            // Use DocumentCollator for smart ordering and merging
            const DocumentCollator = require('./document-collator');
            const collator = new DocumentCollator({ verbose: this.verbose });

            // Collate markdown documents
            const collatedMarkdown = await collator.collate(documents, {
                toc: options.toc !== false, // Default to true
                tocDepth: options.tocDepth || 3,
                sectionBreaks: options.sectionBreaks !== false,
                resolveLinks: options.resolveLinks !== false,
                renderMermaid: options.renderMermaid !== false
            });

            // Write collated markdown to temp file
            const tempMarkdownPath = path.join(this.tempDir, `collated-${Date.now()}.md`);
            await fs.writeFile(tempMarkdownPath, collatedMarkdown, 'utf8');

            // Convert to PDF
            const tempPdfPath = await this.convertMarkdown(tempMarkdownPath, outputPath, {
                renderMermaid: options.renderMermaid,
                format: options.format,
                margin: options.margin,
                addCoverPage: options.coverPage !== undefined,
                coverPage: options.coverPage,
                metadata: options.metadata || {}
            });

            // Add PDF bookmarks if requested
            if (options.bookmarks) {
                await this._addBookmarks(tempPdfPath, collator.getOutline(), outputPath);
            } else if (tempPdfPath !== outputPath) {
                // Just copy to final destination
                await fs.copyFile(tempPdfPath, outputPath);
            }

            // Cleanup temp files
            try {
                await fs.unlink(tempMarkdownPath);
                if (tempPdfPath !== outputPath) {
                    await fs.unlink(tempPdfPath);
                }
            } catch (e) {
                // Ignore cleanup errors
            }

            if (this.verbose) {
                const stats = await fs.stat(outputPath);
                console.log(`\n✅ Collated PDF generated: ${path.basename(outputPath)} (${(stats.size / 1024).toFixed(2)} KB)`);
            }

            return outputPath;

        } catch (error) {
            console.error('❌ Error collating documents:', error.message);
            throw error;
        }
    }

    /**
     * Add PDF bookmarks/outline to generated PDF
     * @param {string} inputPath - Source PDF
     * @param {Array} outline - Bookmark structure
     * @param {string} outputPath - Output PDF path
     * @private
     */
    async _addBookmarks(inputPath, outline, outputPath) {
        try {
            const existingPdfBytes = await fs.readFile(inputPath);
            const pdfDoc = await PDFDocument.load(existingPdfBytes);

            // Note: pdf-lib doesn't support adding outlines/bookmarks yet
            // This is a known limitation. We'll add a TODO for future enhancement
            // For now, just copy the file
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }

            if (this.verbose) {
                console.log('⚠️  PDF bookmarks not yet supported (pdf-lib limitation)');
                console.log('    Table of Contents included in document body instead');
            }

        } catch (error) {
            console.error('❌ Error adding bookmarks:', error.message);
            // Non-fatal - copy original PDF
            if (inputPath !== outputPath) {
                await fs.copyFile(inputPath, outputPath);
            }
        }
    }

    /**
     * Generate PDF from glob pattern
     * @param {string} pattern - Glob pattern for markdown files
     * @param {string} outputPath - Output PDF path
     * @param {Object} options - Generation options
     */
    async fromGlob(pattern, outputPath, options = {}) {
        const glob = require('glob');
        const { promisify } = require('util');
        const globAsync = promisify(glob);

        const files = await globAsync(pattern, { nodir: true });

        if (files.length === 0) {
            throw new Error(`No files found matching pattern: ${pattern}`);
        }

        const documents = files.map(file => ({
            path: file,
            title: path.basename(file, '.md').replace(/-|_/g, ' ')
        }));

        return this.collate(documents, outputPath, options);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: pdf-generator.js <input.md> <output.pdf> [--render-mermaid] [--verbose]');
        console.log('   or: pdf-generator.js --collate <pattern> <output.pdf> [options]');
        console.log('\nOptions:');
        console.log('  --render-mermaid    Render Mermaid diagrams to images');
        console.log('  --toc               Generate table of contents (collation only)');
        console.log('  --bookmarks         Add PDF bookmarks (collation only)');
        console.log('  --cover             Add cover page');
        console.log('  --verbose           Verbose output');
        process.exit(1);
    }

    const options = {
        renderMermaid: args.includes('--render-mermaid'),
        toc: args.includes('--toc'),
        bookmarks: args.includes('--bookmarks'),
        coverPage: args.includes('--cover') ? {} : undefined,
        verbose: args.includes('--verbose')
    };

    const generator = new PDFGenerator({ verbose: options.verbose });

    (async () => {
        try {
            if (args[0] === '--collate') {
                const pattern = args[1];
                const output = args[2];
                await generator.fromGlob(pattern, output, options);
            } else {
                const input = args[0];
                const output = args[1];
                await generator.convertMarkdown(input, output, options);
            }
            process.exit(0);
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = PDFGenerator;
