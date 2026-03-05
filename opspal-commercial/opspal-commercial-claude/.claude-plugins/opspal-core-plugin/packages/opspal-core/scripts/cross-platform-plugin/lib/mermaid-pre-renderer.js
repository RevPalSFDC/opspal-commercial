#!/usr/bin/env node

/**
 * Mermaid Pre-Renderer for PDF Generation
 *
 * Converts Mermaid code blocks in markdown to rendered images (PNG/SVG)
 * before PDF conversion. Provides caching to avoid re-rendering unchanged diagrams.
 *
 * Features:
 * - Automatic detection of Mermaid code blocks
 * - Syntax validation using existing mermaid-validator
 * - Image generation (PNG default, SVG optional)
 * - Smart caching based on diagram content hash
 * - Multi-strategy fallback (mmdc → Puppeteer → styled placeholder)
 * - Graceful degradation when rendering tools unavailable
 *
 * Problem Solved (Reflection Cohort: PDF Generation & Mermaid Diagrams):
 *   Agents were failing PDF generation when mmdc wasn't available. This
 *   implementation provides graceful fallback strategies.
 *
 * Rendering Strategies (in order of preference):
 *   1. mmdc (Mermaid CLI) - Best quality, requires @mermaid-js/mermaid-cli
 *   2. Puppeteer - Direct rendering, requires puppeteer
 *   3. Styled placeholder - ASCII art box with code preserved
 *
 * @version 2.0.0
 * @date 2025-11-27
 * @source Reflection Cohort - PDF Generation & Mermaid Diagrams
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class MermaidPreRenderer {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.cacheDir = options.cacheDir || path.join(__dirname, '../../.temp/mermaid-cache');
        this.outputFormat = options.outputFormat || 'png'; // png or svg
        this.theme = options.theme || 'default';
        this.backgroundColor = options.backgroundColor || 'white';

        // Sizing configuration
        this.sizingStrategy = options.sizingStrategy || 'adaptive'; // 'adaptive' | 'fixed'
        this.width = options.width || 800; // Default width (adaptive may override)
        this.height = options.height || 600; // Default height (adaptive may override)
        this.maxWidth = options.maxWidth || 1200; // Maximum width for adaptive sizing
        this.minWidth = options.minWidth || 400; // Minimum width for adaptive sizing

        // Resolution for high-DPI output
        this.devicePixelRatio = options.devicePixelRatio || 1; // Set to 2 for retina quality

        // Strategy preference (can be overridden)
        this.preferredStrategy = options.preferredStrategy || null; // null = auto-detect

        // Capability cache (detected once per instance)
        this._capabilities = null;

        // Size calculation cache
        this._sizeCache = new Map();
    }

    /**
     * Detect available rendering capabilities
     * @returns {Promise<Object>} Available rendering strategies
     */
    async detectCapabilities() {
        if (this._capabilities) {
            return this._capabilities;
        }

        this._capabilities = {
            mmdc: false,
            puppeteer: false,
            placeholder: true, // Always available
            detectedAt: new Date().toISOString()
        };

        // Check for mmdc (Mermaid CLI)
        try {
            await execAsync('mmdc --version');
            this._capabilities.mmdc = true;
            if (this.verbose) {
                console.log('    ✓ mmdc (Mermaid CLI) available');
            }
        } catch {
            if (this.verbose) {
                console.log('    ℹ️  mmdc not found');
            }
        }

        // Check for Puppeteer
        try {
            require.resolve('puppeteer');
            this._capabilities.puppeteer = true;
            if (this.verbose) {
                console.log('    ✓ Puppeteer available');
            }
        } catch {
            if (this.verbose) {
                console.log('    ℹ️  Puppeteer not installed');
            }
        }

        return this._capabilities;
    }

    /**
     * Get the best available rendering strategy
     * @returns {Promise<string>} Strategy name: 'mmdc', 'puppeteer', or 'placeholder'
     */
    async getBestStrategy() {
        const caps = await this.detectCapabilities();

        // Honor preference if available
        if (this.preferredStrategy && caps[this.preferredStrategy]) {
            return this.preferredStrategy;
        }

        // Auto-detect best available
        if (caps.mmdc) return 'mmdc';
        if (caps.puppeteer) return 'puppeteer';
        return 'placeholder';
    }

    /**
     * Render all Mermaid diagrams in markdown content
     * @param {string} markdown - Markdown content with Mermaid blocks
     * @param {string} basePath - Base path for resolving relative image paths
     * @returns {Promise<string>} Markdown with Mermaid blocks replaced by images
     */
    async render(markdown, basePath) {
        try {
            // Ensure cache directory exists
            await fs.mkdir(this.cacheDir, { recursive: true });

            // Find all Mermaid code blocks
            const mermaidBlocks = this._extractMermaidBlocks(markdown);

            if (mermaidBlocks.length === 0) {
                if (this.verbose) {
                    console.log('  ℹ️  No Mermaid diagrams found');
                }
                return markdown;
            }

            if (this.verbose) {
                console.log(`  🎨 Found ${mermaidBlocks.length} Mermaid diagram(s) to render...`);
            }

            let processedMarkdown = markdown;
            let renderedCount = 0;
            let cachedCount = 0;
            let failedCount = 0;

            // Process each block
            for (const block of mermaidBlocks) {
                try {
                    // Check if we have a cached version
                    const hash = this._hash(block.code);
                    const cachedImage = await this._getCached(hash);

                    let renderResult;
                    if (cachedImage) {
                        renderResult = cachedImage;  // String path for cached
                        cachedCount++;
                        if (this.verbose) {
                            console.log(`    ✓ Using cached diagram: ${path.basename(cachedImage)}`);
                        }
                    } else {
                        // Render new diagram (returns object with path and metadata)
                        renderResult = await this._renderDiagram(block.code, hash);
                        renderedCount++;
                        if (this.verbose) {
                            // Handle both object result and string path
                            const displayPath = typeof renderResult === 'object'
                                ? (renderResult.path || 'placeholder')
                                : renderResult;
                            console.log(`    ✓ Rendered diagram: ${path.basename(displayPath)}`);
                        }
                    }

                    // Replace block with image reference
                    const imageRef = this._createImageReference(renderResult, block.title);
                    processedMarkdown = processedMarkdown.replace(block.fullMatch, imageRef);

                } catch (error) {
                    failedCount++;
                    if (this.verbose) {
                        console.log(`    ⚠️  Failed to render diagram: ${error.message}`);
                        console.log(`       Keeping original code block`);
                    }
                    // Leave original code block in place
                }
            }

            if (this.verbose) {
                console.log(`  ✅ Diagram rendering complete:`);
                console.log(`     Rendered: ${renderedCount}, Cached: ${cachedCount}, Failed: ${failedCount}`);
            }

            // Quality Gate: Validate processed markdown is valid
            if (typeof processedMarkdown !== 'string') {
                throw new Error('Diagram rendering failed: Invalid processed markdown');
            }

            return processedMarkdown;

        } catch (error) {
            console.error('❌ Error during Mermaid pre-rendering:', error.message);
            // Return original markdown on error
            return markdown;
        }
    }

    /**
     * Extract all Mermaid code blocks from markdown
     * @private
     */
    _extractMermaidBlocks(markdown) {
        const blocks = [];
        const regex = /```mermaid\s*(?:\{([^}]*)\})?\s*\n([\s\S]*?)```/g;
        let match;

        while ((match = regex.exec(markdown)) !== null) {
            const attributes = match[1] || '';
            const code = match[2].trim();
            const title = this._extractTitle(attributes, code);

            blocks.push({
                fullMatch: match[0],
                attributes,
                code,
                title,
                index: match.index
            });
        }

        return blocks;
    }

    /**
     * Extract title from attributes or diagram code
     * @private
     */
    _extractTitle(attributes, code) {
        // Check attributes first
        const titleMatch = attributes.match(/title[=:]"([^"]+)"/);
        if (titleMatch) {
            return titleMatch[1];
        }

        // Check first line of code for title
        const lines = code.split('\n');
        for (const line of lines) {
            const titleLineMatch = line.match(/^title\s+(.+)$/);
            if (titleLineMatch) {
                return titleLineMatch[1].trim();
            }
        }

        return 'Diagram';
    }

    /**
     * Generate hash for diagram code
     * @private
     */
    _hash(content) {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Check if cached version exists
     * @private
     */
    async _getCached(hash) {
        const cachedPath = path.join(this.cacheDir, `${hash}.${this.outputFormat}`);
        try {
            await fs.access(cachedPath);
            return cachedPath;
        } catch {
            return null;
        }
    }

    /**
     * Render a Mermaid diagram to image file using multi-strategy fallback
     * @private
     */
    async _renderDiagram(code, hash) {
        // First, validate syntax
        const MermaidValidator = require('./mermaid-validator');
        const validator = new MermaidValidator();
        const validation = validator.validate(code);

        if (!validation.valid) {
            throw new Error(`Invalid Mermaid syntax: ${validation.errors.join(', ')}`);
        }

        // Calculate optimal size (adaptive or fixed)
        const size = this.sizingStrategy === 'adaptive'
            ? this._calculateOptimalSize(code)
            : { width: this.width, height: this.height, needsLandscape: false };

        // Write diagram code to temp file
        const tempMmdPath = path.join(this.cacheDir, `${hash}.mmd`);
        await fs.writeFile(tempMmdPath, code, 'utf8');

        // Output path
        const outputPath = path.join(this.cacheDir, `${hash}.${this.outputFormat}`);

        try {
            // Get best available strategy
            const strategy = await this.getBestStrategy();

            if (this.verbose) {
                console.log(`      Using rendering strategy: ${strategy}`);
            }

            switch (strategy) {
                case 'mmdc':
                    return await this._renderWithMmdc(tempMmdPath, outputPath, code, size);

                case 'puppeteer':
                    return await this._renderWithPuppeteer(code, outputPath, size);

                case 'placeholder':
                default:
                    return await this._renderPlaceholder(code, hash, size);
            }

        } finally {
            // Cleanup temp mmd file
            try {
                await fs.unlink(tempMmdPath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Strategy 1: Render using mmdc (Mermaid CLI) - Highest quality
     * @private
     */
    async _renderWithMmdc(inputPath, outputPath, code, size) {
        try {
            const cmd = [
                'mmdc',
                `-i "${inputPath}"`,
                `-o "${outputPath}"`,
                `-t ${this.theme}`,
                `-w ${size.width}`,
                `-H ${size.height}`,
                `-b ${this.backgroundColor}`,
                this.devicePixelRatio > 1 ? `-s ${this.devicePixelRatio}` : ''
            ].filter(Boolean).join(' ');

            await execAsync(cmd, { timeout: 30000 });

            // Verify output exists
            await fs.access(outputPath);

            // Return with landscape metadata for PDF layout
            return {
                path: outputPath,
                width: size.width,
                height: size.height,
                needsLandscape: size.needsLandscape
            };

        } catch (error) {
            if (this.verbose) {
                console.log(`      mmdc failed: ${error.message}, trying fallback...`);
            }

            // Try puppeteer fallback
            const caps = await this.detectCapabilities();
            if (caps.puppeteer) {
                return await this._renderWithPuppeteer(code, outputPath, size);
            }

            // Final fallback to placeholder
            return await this._renderPlaceholder(code, path.basename(outputPath, `.${this.outputFormat}`), size);
        }
    }

    /**
     * Strategy 2: Render using Puppeteer - Good quality fallback
     * @private
     */
    async _renderWithPuppeteer(code, outputPath, size) {
        try {
            const puppeteer = require('puppeteer');

            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            try {
                const page = await browser.newPage();

                // Set viewport with device pixel ratio for high-DPI rendering
                await page.setViewport({
                    width: size.width,
                    height: size.height,
                    deviceScaleFactor: this.devicePixelRatio
                });

                // Create HTML with Mermaid
                const html = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <style>
        body { margin: 0; padding: 20px; background: ${this.backgroundColor}; }
        .mermaid { font-family: 'trebuchet ms', verdana, arial, sans-serif; }
        .mermaid svg { max-width: 100%; }
    </style>
</head>
<body>
    <div class="mermaid" id="diagram">
${code}
    </div>
    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: '${this.theme}',
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true, htmlLabels: true },
            sequence: { useMaxWidth: true }
        });
    </script>
</body>
</html>`;

                await page.setContent(html, { waitUntil: 'networkidle0' });

                // Wait for Mermaid to render
                await page.waitForSelector('.mermaid svg', { timeout: 10000 });

                // Get the SVG element bounds
                const svgElement = await page.$('.mermaid svg');
                const boundingBox = await svgElement.boundingBox();

                // Handle SVG output format
                if (this.outputFormat === 'svg') {
                    // Extract SVG content directly
                    const svgContent = await page.evaluate(() => {
                        const svg = document.querySelector('.mermaid svg');
                        if (!svg) return null;
                        // Clone and clean up the SVG
                        const clone = svg.cloneNode(true);
                        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                        return clone.outerHTML;
                    });

                    if (svgContent) {
                        await fs.writeFile(outputPath, svgContent, 'utf8');
                        return {
                            path: outputPath,
                            width: size.width,
                            height: size.height,
                            needsLandscape: size.needsLandscape,
                            format: 'svg'
                        };
                    }
                }

                // PNG output (default)
                const screenshotOptions = {
                    path: outputPath,
                    type: 'png',
                    clip: boundingBox ? {
                        x: Math.max(0, boundingBox.x - 10),
                        y: Math.max(0, boundingBox.y - 10),
                        width: boundingBox.width + 20,
                        height: boundingBox.height + 20
                    } : undefined,
                    omitBackground: this.backgroundColor === 'transparent'
                };

                await page.screenshot(screenshotOptions);

                return {
                    path: outputPath,
                    width: boundingBox ? boundingBox.width : size.width,
                    height: boundingBox ? boundingBox.height : size.height,
                    needsLandscape: size.needsLandscape,
                    format: 'png'
                };

            } finally {
                await browser.close();
            }

        } catch (error) {
            if (this.verbose) {
                console.log(`      Puppeteer failed: ${error.message}, using placeholder...`);
            }

            // Final fallback to placeholder
            return await this._renderPlaceholder(code, path.basename(outputPath, `.${this.outputFormat}`), size);
        }
    }

    /**
     * Strategy 3: Create styled placeholder - Always available
     * @private
     */
    async _renderPlaceholder(code, hash, size = {}) {
        const diagramType = this._detectDiagramType(code);
        const placeholderPath = path.join(this.cacheDir, `${hash}.placeholder.md`);

        // Create a styled placeholder that looks good in PDFs
        const placeholder = `
---

**📊 ${this._getDiagramTypeLabel(diagramType)} Diagram**

> *Diagram rendering requires additional tools. Install with:*
> \`\`\`
> npm install -g @mermaid-js/mermaid-cli
> \`\`\`

<details>
<summary>View Diagram Code</summary>

\`\`\`mermaid
${code}
\`\`\`

</details>

*Tip: View this diagram at [mermaid.live](https://mermaid.live) by pasting the code above.*

---
`;

        await fs.writeFile(placeholderPath, placeholder, 'utf8');

        // Return special marker for placeholder handling
        return {
            type: 'placeholder',
            path: placeholderPath,
            code,
            needsLandscape: size.needsLandscape || false
        };
    }

    /**
     * Get human-readable diagram type label
     * @private
     */
    _getDiagramTypeLabel(type) {
        const labels = {
            flowchart: 'Flowchart',
            sequence: 'Sequence',
            class: 'Class',
            state: 'State',
            er: 'Entity Relationship',
            gantt: 'Gantt',
            pie: 'Pie Chart',
            journey: 'User Journey',
            unknown: 'Mermaid'
        };
        return labels[type] || 'Mermaid';
    }

    /**
     * Detect Mermaid diagram type from code
     * @private
     */
    _detectDiagramType(code) {
        const firstLine = code.split('\n')[0].toLowerCase().trim();

        if (firstLine.includes('graph') || firstLine.includes('flowchart')) {
            return 'flowchart';
        } else if (firstLine.includes('sequencediagram')) {
            return 'sequence';
        } else if (firstLine.includes('classdiagram')) {
            return 'class';
        } else if (firstLine.includes('statediagram')) {
            return 'state';
        } else if (firstLine.includes('erdiagram')) {
            return 'er';
        } else if (firstLine.includes('gantt')) {
            return 'gantt';
        } else if (firstLine.includes('pie')) {
            return 'pie';
        } else if (firstLine.includes('journey')) {
            return 'journey';
        } else if (firstLine.includes('mindmap')) {
            return 'mindmap';
        } else if (firstLine.includes('timeline')) {
            return 'timeline';
        } else if (firstLine.includes('quadrant')) {
            return 'quadrant';
        } else if (firstLine.includes('gitgraph')) {
            return 'gitgraph';
        } else if (firstLine.includes('c4')) {
            return 'c4';
        }

        return 'unknown';
    }

    /**
     * Calculate optimal diagram size based on type and complexity
     * @param {string} code - Mermaid diagram code
     * @returns {Object} { width, height, needsLandscape }
     * @private
     */
    _calculateOptimalSize(code) {
        // Check cache first
        const hash = this._hash(code);
        if (this._sizeCache.has(hash)) {
            return this._sizeCache.get(hash);
        }

        const type = this._detectDiagramType(code);
        const complexity = this._analyzeComplexity(code);

        let width, height, needsLandscape = false;

        // Base sizing by diagram type
        switch (type) {
            case 'flowchart':
                // Flowcharts grow horizontally with nodes
                width = Math.min(this.maxWidth, 400 + complexity.nodes * 80);
                height = 300 + complexity.depth * 100;
                needsLandscape = complexity.nodes > 8 || complexity.width > 4;
                break;

            case 'sequence':
                // Sequence diagrams grow horizontally with participants
                width = Math.min(this.maxWidth, 200 + complexity.participants * 150);
                height = 200 + complexity.interactions * 40;
                needsLandscape = complexity.participants > 5;
                break;

            case 'class':
            case 'er':
                // Class/ER diagrams grow in both dimensions
                width = Math.min(this.maxWidth, 300 + complexity.entities * 150);
                height = 300 + complexity.entities * 80;
                needsLandscape = complexity.entities > 5;
                break;

            case 'gantt':
            case 'timeline':
                // Timeline diagrams are wide
                width = this.maxWidth;
                height = 200 + complexity.items * 35;
                needsLandscape = true;
                break;

            case 'pie':
            case 'quadrant':
                // Pie/Quadrant charts are roughly square
                width = 500;
                height = 400;
                needsLandscape = false;
                break;

            case 'state':
                // State diagrams vary based on states
                width = Math.min(this.maxWidth, 400 + complexity.states * 100);
                height = 300 + complexity.depth * 80;
                needsLandscape = complexity.states > 6;
                break;

            case 'mindmap':
                // Mindmaps grow outward
                width = Math.min(this.maxWidth, 400 + complexity.nodes * 60);
                height = 400 + complexity.depth * 100;
                needsLandscape = complexity.nodes > 10;
                break;

            case 'gitgraph':
                // Git graphs grow horizontally
                width = Math.min(this.maxWidth, 400 + complexity.commits * 50);
                height = 200 + complexity.branches * 60;
                needsLandscape = complexity.commits > 10;
                break;

            case 'c4':
                // C4 diagrams need room for containers
                width = Math.min(this.maxWidth, 600 + complexity.entities * 100);
                height = 400 + complexity.entities * 60;
                needsLandscape = complexity.entities > 4;
                break;

            default:
                // Default sizing based on line count
                const lineCount = code.split('\n').length;
                width = Math.min(this.maxWidth, 500 + lineCount * 15);
                height = 300 + lineCount * 10;
                needsLandscape = lineCount > 40;
        }

        // Apply min/max constraints
        width = Math.max(this.minWidth, Math.min(this.maxWidth, width));
        height = Math.max(300, Math.min(1200, height));

        // Apply device pixel ratio for high-DPI
        if (this.devicePixelRatio > 1) {
            width = Math.round(width * this.devicePixelRatio);
            height = Math.round(height * this.devicePixelRatio);
        }

        const result = { width, height, needsLandscape };
        this._sizeCache.set(hash, result);

        if (this.verbose) {
            console.log(`      Calculated size: ${width}x${height} (landscape: ${needsLandscape})`);
        }

        return result;
    }

    /**
     * Analyze diagram complexity from code
     * @param {string} code - Mermaid diagram code
     * @returns {Object} Complexity metrics
     * @private
     */
    _analyzeComplexity(code) {
        const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('%%'));
        const type = this._detectDiagramType(code);

        const result = {
            nodes: 0,
            edges: 0,
            depth: 1,
            width: 1,
            participants: 0,
            interactions: 0,
            entities: 0,
            states: 0,
            items: 0,
            commits: 0,
            branches: 0
        };

        // Count elements based on diagram type
        for (const line of lines) {
            const trimmed = line.trim();

            // Flowchart nodes and edges
            if (trimmed.includes('-->') || trimmed.includes('---') || trimmed.includes('==>')) {
                result.edges++;
                // Count unique node identifiers
                const nodeMatch = trimmed.match(/^(\w+)/);
                if (nodeMatch) result.nodes++;
            }

            // Sequence diagram participants
            if (trimmed.startsWith('participant') || trimmed.startsWith('actor')) {
                result.participants++;
            }

            // Sequence interactions
            if (trimmed.includes('->>') || trimmed.includes('-->>') || trimmed.includes('-x')) {
                result.interactions++;
            }

            // Class/ER entities
            if (trimmed.startsWith('class ') || trimmed.match(/^\w+\s*\{/) || trimmed.match(/^\w+\s+\|/)) {
                result.entities++;
            }

            // State definitions
            if (trimmed.startsWith('state ') || trimmed.match(/\[.*\]/)) {
                result.states++;
            }

            // Gantt/Timeline items
            if (trimmed.match(/^\s+\w+.*:/)) {
                result.items++;
            }

            // Git commits
            if (trimmed.startsWith('commit')) {
                result.commits++;
            }

            // Git branches
            if (trimmed.startsWith('branch')) {
                result.branches++;
            }

            // Subgraph depth
            if (trimmed.startsWith('subgraph') || trimmed.startsWith('state ')) {
                result.depth++;
            }
        }

        // Estimate width from parallel elements (heuristic)
        result.width = Math.ceil(Math.sqrt(result.nodes || result.entities || result.states || 1));

        return result;
    }

    /**
     * Create markdown image reference or placeholder content
     * @private
     */
    _createImageReference(renderResult, title) {
        // Handle placeholder result (object with type, path, code)
        if (renderResult && typeof renderResult === 'object' && renderResult.type === 'placeholder') {
            const diagramType = this._detectDiagramType(renderResult.code);
            const typeLabel = this._getDiagramTypeLabel(diagramType);

            // Return inline styled placeholder that works in PDFs
            return `
---

**📊 ${typeLabel} Diagram** *(${title || 'Diagram'})*

> *Rendering requires mmdc or Puppeteer. View at [mermaid.live](https://mermaid.live)*

\`\`\`mermaid
${renderResult.code}
\`\`\`

---
`;
        }

        // Handle object with path and metadata
        if (renderResult && typeof renderResult === 'object' && renderResult.path) {
            const altText = title || 'Mermaid Diagram';
            const imagePath = renderResult.path;

            // Wrap in landscape section if needed
            if (renderResult.needsLandscape) {
                return `
<div class="landscape-section">

![${altText}](${imagePath})

</div>
`;
            }

            return `\n![${altText}](${imagePath})\n`;
        }

        // Handle regular image path (string - backward compatibility)
        const altText = title || 'Mermaid Diagram';
        return `\n![${altText}](${renderResult})\n`;
    }

    /**
     * Clear cache
     */
    async clearCache() {
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                await fs.unlink(path.join(this.cacheDir, file));
            }
            if (this.verbose) {
                console.log(`✅ Cleared ${files.length} cached diagram(s)`);
            }
        } catch (error) {
            if (this.verbose) {
                console.log('ℹ️  Cache directory does not exist or is empty');
            }
        }
    }

    /**
     * Get cache statistics
     */
    async getCacheStats() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const stats = {
                totalFiles: files.length,
                images: files.filter(f => f.endsWith('.png') || f.endsWith('.svg')).length,
                mmdFiles: files.filter(f => f.endsWith('.mmd')).length,
                pending: files.filter(f => f.endsWith('.pending')).length
            };

            // Calculate total size
            let totalSize = 0;
            for (const file of files) {
                const fileStat = await fs.stat(path.join(this.cacheDir, file));
                totalSize += fileStat.size;
            }
            stats.totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

            return stats;
        } catch {
            return { totalFiles: 0, images: 0, mmdFiles: 0, pending: 0, totalSizeMB: '0.00' };
        }
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const renderer = new MermaidPreRenderer({ verbose: true });

    (async () => {
        try {
            if (command === 'clear-cache') {
                await renderer.clearCache();
            } else if (command === 'stats') {
                const stats = await renderer.getCacheStats();
                console.log('Mermaid Cache Statistics:');
                console.log(`  Total files: ${stats.totalFiles}`);
                console.log(`  Images: ${stats.images}`);
                console.log(`  MermaidFiles: ${stats.mmdFiles}`);
                console.log(`  Pending: ${stats.pending}`);
                console.log(`  Total size: ${stats.totalSizeMB} MB`);
            } else if (command === 'capabilities' || command === 'check') {
                console.log('Mermaid Rendering Capabilities:');
                console.log('-------------------------------');
                const caps = await renderer.detectCapabilities();
                const best = await renderer.getBestStrategy();

                console.log(`  mmdc (Mermaid CLI): ${caps.mmdc ? '✅ Available' : '❌ Not installed'}`);
                console.log(`  Puppeteer:          ${caps.puppeteer ? '✅ Available' : '❌ Not installed'}`);
                console.log(`  Placeholder:        ✅ Always available`);
                console.log('');
                console.log(`  Best strategy: ${best}`);
                console.log('');

                if (!caps.mmdc && !caps.puppeteer) {
                    console.log('⚠️  No rendering tools available. Diagrams will use placeholders.');
                    console.log('');
                    console.log('To enable full rendering, install one of:');
                    console.log('  npm install -g @mermaid-js/mermaid-cli   # For mmdc');
                    console.log('  npm install puppeteer                     # For Puppeteer');
                }

                // Return capabilities as JSON for programmatic use
                if (args.includes('--json')) {
                    console.log('');
                    console.log(JSON.stringify({ ...caps, bestStrategy: best }, null, 2));
                }
            } else {
                console.log('Mermaid Pre-Renderer v2.0.0');
                console.log('');
                console.log('Usage: mermaid-pre-renderer.js <command>');
                console.log('');
                console.log('Commands:');
                console.log('  capabilities   Check available rendering strategies');
                console.log('  check          Alias for capabilities');
                console.log('  clear-cache    Clear all cached diagrams');
                console.log('  stats          Show cache statistics');
                console.log('');
                console.log('Options:');
                console.log('  --json         Output capabilities as JSON');
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = MermaidPreRenderer;
