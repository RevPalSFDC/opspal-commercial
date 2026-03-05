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

// Dependency check with helpful error messages
const requiredModules = ['md-to-pdf', 'pdf-lib'];
for (const mod of requiredModules) {
  try {
    require.resolve(mod);
  } catch (e) {
    const pluginRoot = require('path').resolve(__dirname, '../..');
    const wrapperScript = require('path').join(__dirname, '..', 'generate-pdf.sh');

    // Use colors if terminal supports it
    const isTerminal = process.stderr.isTTY;
    const RED = isTerminal ? '\x1b[1;31m' : '';
    const YELLOW = isTerminal ? '\x1b[1;33m' : '';
    const CYAN = isTerminal ? '\x1b[1;36m' : '';
    const GREEN = isTerminal ? '\x1b[1;32m' : '';
    const RESET = isTerminal ? '\x1b[0m' : '';
    const BOLD = isTerminal ? '\x1b[1m' : '';

    console.error('');
    console.error(`${RED}╔══════════════════════════════════════════════════════════════╗${RESET}`);
    console.error(`${RED}║  ERROR: Missing dependency '${mod}'${' '.repeat(Math.max(0, 32 - mod.length))}║${RESET}`);
    console.error(`${RED}╚══════════════════════════════════════════════════════════════╝${RESET}`);
    console.error('');
    console.error(`${YELLOW}The pdf-generator.js requires dependencies in the plugin's node_modules.${RESET}`);
    console.error('');
    console.error(`${BOLD}✅ RECOMMENDED: Use the wrapper script${RESET}`);
    console.error(`   ${CYAN}${wrapperScript} report.md report.pdf${RESET}`);
    console.error(`   ${CYAN}${wrapperScript} --input report.md --output report.pdf${RESET}`);
    console.error('');
    console.error(`${BOLD}Alternative methods:${RESET}`);
    console.error(`   ${GREEN}1.${RESET} Install dependencies first:`);
    console.error(`      ${CYAN}cd ${pluginRoot} && npm install${RESET}`);
    console.error('');
    console.error(`   ${GREEN}2.${RESET} Set NODE_PATH for direct invocation:`);
    console.error(`      ${CYAN}NODE_PATH="${pluginRoot}/node_modules" node ${__filename} <args>${RESET}`);
    console.error('');
    console.error(`   ${GREEN}3.${RESET} Use npm script:`);
    console.error(`      ${CYAN}npm run pdf --prefix ${pluginRoot} -- report.md report.pdf${RESET}`);
    console.error(`      ${CYAN}npm run pdf --prefix ${pluginRoot} -- --input report.md --output report.pdf${RESET}`);
    console.error('');
    console.error(`${RED}Do NOT invoke directly with: node ${__filename}${RESET}`);
    console.error('');
    process.exit(1);
  }
}

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { mdToPdf } = require('md-to-pdf');
const { PDFDocument } = require('pdf-lib');
const StyleManager = require('./style-manager');
const TemplateEngine = require('./template-engine');
const { verifyBranding, logVerification } = require('./pdf-branding-verifier');
const { parseCliArgs, printCliUsage } = require('./pdf-cli-parser');
const {
    STYLE_PROFILES,
    DEFAULT_STYLE_PROFILE,
    CANONICAL_THEME,
    resolveStyleProfile,
    getProfileConfig,
    assertNoLegacyStyleOverrides
} = require('./pdf-style-policy');

const resolveChromePath = () => {
    // Cross-platform Chrome path resolution
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH,
        // macOS paths
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        // Linux paths
        '/opt/google/chrome/chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        // Windows paths (via WSL or native Node)
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ].filter(Boolean);

    return candidates.find(candidate => fsSync.existsSync(candidate)) || null;
};

const PDF_ENVIRONMENT_BLOCKER_PATTERN = /(listen\s+EPERM|operation not permitted|crashpad|sandbox|failed to launch the browser process|econnreset|zygote|browser process exited)/i;

function extractErrorMessage(error) {
    if (!error) return '';
    const parts = [];
    if (typeof error.message === 'string') parts.push(error.message);
    if (typeof error.stderr === 'string') parts.push(error.stderr);
    if (typeof error.stdout === 'string') parts.push(error.stdout);
    if (error.cause && typeof error.cause.message === 'string') parts.push(error.cause.message);
    return parts.join(' ').trim();
}

class PDFGenerator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.tempDir = options.tempDir || path.join(__dirname, '../../.temp/pdf-generation');
        if (options.theme && options.theme !== CANONICAL_THEME) {
            throw new Error(
                `Theme overrides are disabled. Use the canonical PDF theme "${CANONICAL_THEME}".`
            );
        }

        // Initialize style manager with RevPal brand theme and default branding
        this.styleManager = new StyleManager({
            verbose: this.verbose,
            theme: CANONICAL_THEME,
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

        // Output profiles for consistent branded presets
        this.profiles = {
            [STYLE_PROFILES.COVER_TOC]: getProfileConfig(STYLE_PROFILES.COVER_TOC),
            [STYLE_PROFILES.SIMPLE]: getProfileConfig(STYLE_PROFILES.SIMPLE)
        };
    }

    /**
     * Apply profile defaults to options (explicit options take precedence)
     * @private
     */
    _applyProfile(options = {}) {
        const internalStyleOverrides = options.__internalStyleOverrides === true;
        const requestedProfile = options.profile || options.preset;
        const profileName = resolveStyleProfile(requestedProfile || DEFAULT_STYLE_PROFILE);
        const profile = this.profiles[profileName] || getProfileConfig(profileName);
        const requestedCoverTemplate = typeof options.coverTemplate === 'string'
            ? options.coverTemplate.trim()
            : '';

        if (!internalStyleOverrides) {
            assertNoLegacyStyleOverrides(options, ['preset']);
        }

        const merged = { ...options };
        delete merged.preset;
        delete merged.__internalStyleOverrides;

        merged.profile = profileName;
        merged.theme = CANONICAL_THEME;
        merged.toc = internalStyleOverrides && options.toc !== undefined ? options.toc : profile.toc;

        merged.features = {
            ...(profile.features || {}),
            ...(options.features || {})
        };
        // Style-critical feature flags are profile-controlled and cannot drift.
        merged.features.coverPage = profile.features.coverPage;
        merged.features.tableOfContents = profile.features.tableOfContents;
        if (requestedCoverTemplate && profile.features.coverPage) {
            merged.coverPage = { template: requestedCoverTemplate };
        }
        delete merged.coverTemplate;

        if (!internalStyleOverrides) {
            delete merged.coverPage;
            delete merged.addCoverPage;
            delete merged.stylesheet;
            if (merged.style && typeof merged.style === 'object') {
                const { theme, ...rest } = merged.style;
                merged.style = rest;
            }
            if (requestedCoverTemplate && profile.features.coverPage) {
                merged.coverPage = { template: requestedCoverTemplate };
            }
        }

        if (profile.renderMermaid !== undefined && merged.renderMermaid === undefined) {
            merged.renderMermaid = profile.renderMermaid;
        }

        return merged;
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

            const resolvedOptions = this._applyProfile(options);

            // Merge features with defaults
            const features = { ...this.defaultFeatures, ...(resolvedOptions.features || {}) };
            const renderMermaid = this._resolveBooleanOption(resolvedOptions.renderMermaid, features.renderMermaid);
            const bookmarksEnabled = this._resolveBooleanOption(resolvedOptions.bookmarks, features.bookmarks);
            const printBackground = resolvedOptions.printBackground !== undefined
                ? resolvedOptions.printBackground
                : true;

            // Read markdown content
            const markdown = await fs.readFile(inputPath, 'utf8');
            let processedMarkdown = markdown;

            // Pre-process: Render Mermaid diagrams
            if (renderMermaid) {
                const MermaidPreRenderer = require('./mermaid-pre-renderer');
                const renderer = new MermaidPreRenderer({
                    verbose: this.verbose,
                    ...(resolvedOptions.diagrams || {})
                });
                processedMarkdown = await renderer.render(processedMarkdown, path.dirname(inputPath));
            }

            // Pre-process: Auto-generate TOC for single documents
            if (this._shouldGenerateTOC(processedMarkdown, features, resolvedOptions)) {
                if (this.verbose) {
                    console.log('  Adding auto-generated Table of Contents...');
                }
                processedMarkdown = this._insertTOC(processedMarkdown, resolvedOptions);
            }

            // Pre-process: Add cover page content if requested
            if (features.coverPage || resolvedOptions.addCoverPage || resolvedOptions.coverPage) {
                const coverContent = await this._generateCoverPage(resolvedOptions);
                processedMarkdown = coverContent + '\n\n' + processedMarkdown;
            }

            // Get stylesheet from StyleManager
            const stylesheet = await this._resolveStylesheet(resolvedOptions);

            // Verify branding before PDF generation (unless explicitly disabled)
            if (resolvedOptions.verifyBranding !== false) {
                try {
                    // Read CSS content for verification
                    const cssContent = await fs.readFile(stylesheet, 'utf8');
                    const verification = verifyBranding(cssContent, stylesheet);

                    if (!verification.complete && this.verbose) {
                        logVerification(verification, { verbose: false });
                    }

                    if (!verification.valid) {
                        const blockingIssues = verification.issues
                            .filter((issue) => issue.severity === 'error')
                            .map((issue) => issue.message)
                            .join('; ');
                        throw new Error(`Brand verification failed: ${blockingIssues}`);
                    }

                    // Warn on missing brand colors (main issue from beta-corp reflection)
                    if (!verification.colors.complete) {
                        const missingColors = verification.colors.missing.map(c => c.name);
                        console.warn(`⚠️ Brand colors missing from PDF stylesheet: ${missingColors.join(', ')}`);
                    }
                } catch (e) {
                    // Non-fatal - continue with PDF generation
                    if (this.verbose) {
                        console.log(`  Note: Could not verify branding: ${e.message}`);
                    }
                }
            }

            // Build header/footer templates
            const { headerTemplate, footerTemplate } = this._buildHeaderFooter(features, resolvedOptions);

            // Determine margins (larger when using header/footer)
            const margins = this._resolveMargins(features, resolvedOptions);

            // Configure PDF options
            const markedOptions = {
                headerIds: true,
                ...(resolvedOptions.markedOptions || resolvedOptions.marked_options || {})
            };

            const chromePath = resolveChromePath();
            const launchArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--disable-crashpad',
                '--disable-crash-reporter',
                '--disable-features=Crashpad'
            ];
            const explicitLaunchOptions = resolvedOptions.launchOptions || resolvedOptions.launch_options || {};
            const mergedLaunchArgs = Array.from(new Set([
                ...(Array.isArray(explicitLaunchOptions.args) ? explicitLaunchOptions.args : []),
                ...launchArgs
            ]));

            const launchOptions = {
                ...explicitLaunchOptions,
                args: mergedLaunchArgs,
                ...(explicitLaunchOptions.pipe !== undefined ? { pipe: explicitLaunchOptions.pipe } : {}),
                ...(chromePath && !explicitLaunchOptions.executablePath ? { executablePath: chromePath } : {})
            };

            const pdfOptions = {
                dest: outputPath,
                basedir: resolvedOptions.basedir || path.dirname(inputPath),
                marked_options: markedOptions,
                pdf_options: {
                    format: resolvedOptions.format || 'A4',
                    margin: margins,
                    printBackground,
                    preferCSSPageSize: true,
                    displayHeaderFooter: features.headerFooter,
                    headerTemplate,
                    footerTemplate
                },
                stylesheet,
                body_class: resolvedOptions.bodyClass || 'markdown-body',
                launch_options: launchOptions
            };

            // Generate PDF (with environment-blocker fallback handling)
            const generatedPdfPath = await this._generatePdfWithFallback({
                markdownContent: processedMarkdown,
                outputPath,
                pdfOptions,
                resolvedOptions
            });

            if (generatedPdfPath) {
                if (this.verbose) {
                    const stats = await fs.stat(generatedPdfPath);
                    console.log(`✅ PDF generated: ${path.basename(generatedPdfPath)} (${(stats.size / 1024).toFixed(2)} KB)`);
                }

                // Post-process: Add bookmarks if requested and Pandoc available
                if (bookmarksEnabled && !resolvedOptions.skipBookmarks) {
                    const PandocBookmarks = require('./pandoc-bookmarks');
                    const headings = Array.isArray(resolvedOptions.headings) && resolvedOptions.headings.length > 0
                        ? resolvedOptions.headings
                        : PandocBookmarks.extractHeadingsFromMarkdown(
                            processedMarkdown,
                            resolvedOptions.tocDepth || this.autoTOCThresholds.maxDepth
                        );
                    await this._addBookmarksWithPandoc(generatedPdfPath, headings, outputPath);
                }

                // Cleanup temp CSS file
                await this._cleanupTempCss();

                return generatedPdfPath;
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
        const tocSetting = options.toc !== undefined ? options.toc : features.tableOfContents;

        if (typeof tocSetting === 'boolean') return tocSetting;
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
        const lines = markdown.split('\n');
        let count = 0;
        let inCodeBlock = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (inCodeBlock) continue;
            if (/^#{1,6}\s+.+$/.test(trimmed)) {
                count++;
            }
        }

        return count;
    }

    /**
     * Create a slugger compatible with Marked heading IDs
     * @private
     */
    _createSlugger() {
        try {
            const { Slugger } = require('marked');
            return new Slugger();
        } catch (error) {
            return {
                slug: (text) => this._slugify(text)
            };
        }
    }

    /**
     * Inject anchor tags before headings and collect heading metadata
     * @private
     */
    _injectHeadingAnchors(markdown, slugger) {
        const headings = [];
        const lines = markdown.split('\n');
        const output = [];
        let inCodeBlock = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
                inCodeBlock = !inCodeBlock;
                output.push(line);
                continue;
            }

            if (!inCodeBlock) {
                const match = line.match(/^(#{1,6})\s+(.+)$/);
                if (match) {
                    const level = match[1].length;
                    const text = match[2].trim();
                    const id = slugger.slug(text);
                    headings.push({ level, text, id });
                    output.push(`<a id="${id}"></a>`);
                }
            }

            output.push(line);
        }

        return { markdown: output.join('\n'), headings };
    }

    /**
     * Extract headings from markdown
     * @private
     */
    _extractHeadings(markdown, maxDepth = 3, slugger = null) {
        const headings = [];
        const lines = markdown.split('\n');
        const sluggerInstance = slugger || this._createSlugger();
        let inCodeBlock = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (inCodeBlock) continue;

            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                if (level <= maxDepth) {
                    const text = match[2].trim();
                    headings.push({
                        level,
                        text,
                        id: sluggerInstance.slug(text)
                    });
                }
            }
        }

        return headings;
    }

    /**
     * Generate TOC HTML and insert into content
     * Uses a flat list of entries with CSS-class-driven styling.
     * No nested group divs — avoids unclosed div bugs entirely.
     * @private
     */
    _insertTOC(markdown, options) {
        const maxDepth = options.autoTOC?.maxDepth || this.autoTOCThresholds.maxDepth;
        const slugger = this._createSlugger();
        const anchorResult = this._injectHeadingAnchors(markdown, slugger);
        const tocHeadings = anchorResult.headings.filter((heading) => heading.level <= maxDepth);

        if (tocHeadings.length === 0) return markdown;

        // Generate TOC as a flat list — all styling via CSS classes, no inline styles
        let toc = '<div class="toc toc-numbered">\n';
        toc += '<h2 class="toc-title">Contents</h2>\n';
        toc += '<div class="toc-entries">\n';

        let sectionNum = 0;
        let subsectionNum = 0;
        let subsubsectionNum = 0;

        for (let i = 0; i < tocHeadings.length; i++) {
            const heading = tocHeadings[i];

            // Track numbering with dedicated counters per level
            if (heading.level === 1) {
                sectionNum++;
                subsectionNum = 0;
                subsubsectionNum = 0;
            } else if (heading.level === 2) {
                subsectionNum++;
                subsubsectionNum = 0;
            } else if (heading.level === 3) {
                subsubsectionNum++;
            }

            // Generate number prefix
            let numPrefix = '';
            if (heading.level === 1) {
                numPrefix = `${sectionNum}. `;
            } else if (heading.level === 2) {
                numPrefix = `${sectionNum}.${subsectionNum} `;
            } else if (heading.level === 3) {
                numPrefix = `${sectionNum}.${subsectionNum}.${subsubsectionNum} `;
            }

            const levelClass = `toc-level-${heading.level}`;

            toc += `<div class="toc-entry ${levelClass}">\n`;
            toc += `  <span class="toc-number">${numPrefix}</span>`;
            toc += `<a href="#${heading.id}">${heading.text}</a>\n`;
            toc += '</div>\n';
        }

        toc += '</div><!-- /toc-entries -->\n';
        toc += '</div><!-- /toc -->\n\n';

        // Insert after first H1, or at beginning
        const firstH1Match = anchorResult.markdown.match(/^#\s+.+$/m);
        if (firstH1Match) {
            const insertIndex = anchorResult.markdown.indexOf(firstH1Match[0]) + firstH1Match[0].length;
            return anchorResult.markdown.slice(0, insertIndex) + '\n\n' + toc + anchorResult.markdown.slice(insertIndex);
        }

        return toc + anchorResult.markdown;
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
        // Merge metadata from both locations for backward compatibility
        // options.metadata is the canonical location; options.coverPage.metadata is deprecated
        const coverPageMeta = options.coverPage?.metadata || {};
        if (options.coverPage?.metadata) {
            console.warn(
                '⚠️  DEPRECATION: Pass metadata via options.metadata, not options.coverPage.metadata. ' +
                'options.coverPage.metadata will be removed in v3.0.0.'
            );
        }
        const metadata = { ...coverPageMeta, ...(options.metadata || {}) };
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
<p class="cover-disclaimer"><strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.</p>
</div>

</div>

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
        // Default to 'revpal-brand' theme for consistent branding
        const cssContent = await this.styleManager.getStylesheet({
            theme: options.style?.theme || options.theme || 'revpal-brand',
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
     * Generate PDF via md-to-pdf and emit HTML fallback on environment blockers.
     * @private
     */
    async _generatePdfWithFallback({ markdownContent, outputPath, pdfOptions, resolvedOptions }) {
        try {
            const pdf = await mdToPdf({ content: markdownContent }, pdfOptions);
            if (pdf && pdf.filename) {
                return pdf.filename;
            }
            throw new Error('PDF generation failed - no output file created');
        } catch (primaryError) {
            if (!this._isEnvironmentBlockedError(primaryError)) {
                throw primaryError;
            }

            if (this.verbose) {
                console.warn('  ⚠️ md-to-pdf blocked by environment; writing HTML fallback...');
            }

            const fallbackHtmlPath = await this._writeHtmlFallback({
                markdownContent,
                outputPath,
                pdfOptions,
                resolvedOptions
            });
            const enriched = new Error(this._buildEnvironmentBlockerError({
                primaryError,
                fallbackHtmlPath
            }));
            enriched.code = 'PDF_ENVIRONMENT_BLOCKED';
            if (fallbackHtmlPath) {
                enriched.fallbackHtmlPath = fallbackHtmlPath;
            }
            throw enriched;
        }
    }

    /**
     * Emit a fallback HTML artifact when browser-based PDF conversion is blocked.
     * @private
     */
    async _writeHtmlFallback({ markdownContent, outputPath, pdfOptions, resolvedOptions }) {
        if (resolvedOptions?.htmlFallbackOnEnvBlocker === false) {
            return null;
        }
        const fallbackPath = outputPath.toLowerCase().endsWith('.pdf')
            ? outputPath.replace(/\.pdf$/i, '.fallback.html')
            : `${outputPath}.fallback.html`;
        const bodyClass = Array.isArray(pdfOptions.body_class)
            ? pdfOptions.body_class.join(' ')
            : (pdfOptions.body_class || 'markdown-body');
        const html = await this._buildHtmlDocument({
            markdownContent,
            stylesheetPath: pdfOptions.stylesheet,
            bodyClass,
            title: resolvedOptions?.metadata?.title || path.basename(fallbackPath)
        });
        await fs.writeFile(fallbackPath, html, 'utf8');
        if (this.verbose) {
            console.warn(`  ⚠️ Wrote HTML fallback: ${fallbackPath}`);
        }
        return fallbackPath;
    }

    /**
     * Build standalone HTML used by direct Puppeteer rendering and fallback output.
     * @private
     */
    async _buildHtmlDocument({ markdownContent, stylesheetPath, bodyClass, title }) {
        let stylesheetText = '';
        if (stylesheetPath) {
            try {
                stylesheetText = await fs.readFile(stylesheetPath, 'utf8');
            } catch (_) {
                stylesheetText = '';
            }
        }

        let htmlBody;
        try {
            const markedModule = require('marked');
            const parseMarkdown =
                typeof markedModule.parse === 'function'
                    ? markedModule.parse.bind(markedModule)
                    : (markedModule.marked && typeof markedModule.marked.parse === 'function')
                        ? markedModule.marked.parse.bind(markedModule.marked)
                        : null;
            htmlBody = parseMarkdown
                ? parseMarkdown(markdownContent, { headerIds: true })
                : `<pre>${this._escapeHtml(markdownContent)}</pre>`;
        } catch (_) {
            htmlBody = `<pre>${this._escapeHtml(markdownContent)}</pre>`;
        }

        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this._escapeHtml(title || 'PDF Report')}</title>
  <style>${stylesheetText}</style>
</head>
<body class="${this._escapeHtml(bodyClass || 'markdown-body')}">
${htmlBody}
</body>
</html>`;
    }

    /**
     * Check if an error indicates environment-level Chrome/Puppeteer restrictions.
     * @private
     */
    _isEnvironmentBlockedError(error) {
        return PDF_ENVIRONMENT_BLOCKER_PATTERN.test(extractErrorMessage(error));
    }

    /**
     * Build actionable environment blocker error message.
     * @private
     */
    _buildEnvironmentBlockerError({ primaryError, fallbackHtmlPath }) {
        const lines = [
            'PDF generation blocked by environment restrictions (Chromium sandbox/socket constraints).',
            `Primary failure: ${extractErrorMessage(primaryError) || 'unknown'}`
        ];
        if (fallbackHtmlPath) {
            lines.push(`Fallback HTML created: ${fallbackHtmlPath}`);
        }
        lines.push('Run: node plugins/opspal-core/scripts/test-pdf-pipeline.js --verbose');
        return lines.join('\n');
    }

    /**
     * Escape HTML entities for fallback HTML generation.
     * @private
     */
    _escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Resolve boolean option with fallback
     * @private
     */
    _resolveBooleanOption(value, fallback) {
        if (typeof value === 'boolean') return value;
        return Boolean(fallback);
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

            const resolvedOptions = this._applyProfile(options);

            // Ensure temp directory exists
            await fs.mkdir(this.tempDir, { recursive: true });

            // Use DocumentCollator for smart ordering and merging
            const DocumentCollator = require('./document-collator');
            const collator = new DocumentCollator({ verbose: this.verbose });

            // Collate markdown documents
            const collatedMarkdown = await collator.collate(documents, {
                toc: resolvedOptions.toc !== false, // Default to true
                tocDepth: resolvedOptions.tocDepth || 3,
                sectionBreaks: resolvedOptions.sectionBreaks !== false,
                resolveLinks: resolvedOptions.resolveLinks !== false,
                renderMermaid: resolvedOptions.renderMermaid !== false
            });
            const PandocBookmarks = require('./pandoc-bookmarks');
            const bookmarkHeadings = resolvedOptions.bookmarks
                ? (Array.isArray(resolvedOptions.headings) && resolvedOptions.headings.length > 0
                    ? resolvedOptions.headings
                    : PandocBookmarks.extractHeadingsFromMarkdown(
                        collatedMarkdown,
                        resolvedOptions.tocDepth || 3
                    ))
                : null;

            // Write collated markdown to temp file
            const tempMarkdownPath = path.join(this.tempDir, `collated-${Date.now()}.md`);
            await fs.writeFile(tempMarkdownPath, collatedMarkdown, 'utf8');

            // Convert to PDF
            const tempPdfPath = await this.convertMarkdown(tempMarkdownPath, outputPath, {
                ...resolvedOptions,
                renderMermaid: resolvedOptions.renderMermaid,
                format: resolvedOptions.format,
                margin: resolvedOptions.margin,
                __internalStyleOverrides: true,
                toc: false,
                metadata: resolvedOptions.metadata || {},
                features: {
                    ...(resolvedOptions.features || {}),
                    tableOfContents: 'never'
                },
                skipBookmarks: resolvedOptions.bookmarks === true
            });

            // Add PDF bookmarks if requested
            if (resolvedOptions.bookmarks && bookmarkHeadings && bookmarkHeadings.length > 0) {
                await this._addBookmarksWithPandoc(tempPdfPath, bookmarkHeadings, outputPath);
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
        const globModule = require('glob');
        const globFn = typeof globModule === 'function' ? globModule : globModule.glob;

        if (!globFn) {
            throw new Error('Glob module does not export a callable function');
        }

        let files;
        if (globFn.length >= 3) {
            files = await new Promise((resolve, reject) => {
                globFn(pattern, { nodir: true }, (err, matches) => {
                    if (err) return reject(err);
                    resolve(matches);
                });
            });
        } else {
            const result = globFn(pattern, { nodir: true });
            files = Array.isArray(result) ? result : await result;
        }

        if (files.length === 0) {
            throw new Error(`No files found matching pattern: ${pattern}`);
        }

        const documents = files.map(file => ({
            path: file,
            title: path.basename(file, '.md').replace(/-|_/g, ' ')
        }));

        return this.collate(documents, outputPath, options);
    }

    /**
     * Static factory method for creating PDFGenerator instances.
     * Prevents TypeError when callers forget `new`.
     * @param {Object} options - Same options as constructor
     * @returns {PDFGenerator}
     */
    static create(options = {}) {
        return new PDFGenerator(options);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const parsedArgs = parseCliArgs(args);

    if (!parsedArgs.ok) {
        if (parsedArgs.error) {
            console.error(`Error: ${parsedArgs.error}`);
            console.error('');
        }
        printCliUsage();
        process.exit(parsedArgs.help ? 0 : 1);
    }

    const { mode, input, output, options } = parsedArgs;
    const generator = new PDFGenerator({
        verbose: options.verbose
    });

    (async () => {
        try {
            if (mode === 'collate') {
                await generator.fromGlob(input, output, options);
            } else {
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
