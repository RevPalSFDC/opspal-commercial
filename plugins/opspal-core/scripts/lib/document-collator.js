#!/usr/bin/env node

/**
 * Document Collator for PDF Generation
 *
 * Merges multiple markdown documents into a single cohesive document with:
 * - Smart document ordering (manual, alphabetical, or auto-detect)
 * - Table of Contents generation with page number placeholders
 * - Section breaks between documents
 * - Cross-document link resolution
 * - Heading level normalization
 * - Outline/bookmark tree construction
 *
 * @version 1.0.0
 * @date 2025-10-21
 */

const fs = require('fs').promises;
const path = require('path');

class DocumentCollator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.outline = []; // For PDF bookmarks
    }

    /**
     * Collate multiple documents into single markdown
     * @param {Array<Object>} documents - Array of {path, title, order?}
     * @param {Object} options - Collation options
     * @returns {Promise<string>} Collated markdown content
     */
    async collate(documents, options = {}) {
        try {
            if (this.verbose) {
                console.log(`  📑 Collating ${documents.length} document(s)...`);
            }

            // Sort documents by order if specified
            const sortedDocs = this._sortDocuments(documents);

            // Read all documents
            const documentContents = await Promise.all(
                sortedDocs.map(async (doc) => {
                    const content = await fs.readFile(doc.path, 'utf8');
                    return {
                        ...doc,
                        content
                    };
                })
            );

            const slugger = this._createSlugger();
            const processedDocs = [];

            for (const doc of documentContents) {
                const firstLine = doc.content.trim().split('\n')[0] || '';
                const hasLeadingHeading = firstLine.startsWith('#');
                const anchorId = hasLeadingHeading ? null : slugger.slug(doc.title);
                processedDocs.push({
                    ...doc,
                    hasLeadingHeading,
                    anchorId
                });
            }

            for (let i = 0; i < processedDocs.length; i++) {
                const doc = processedDocs[i];
                let content = doc.content;

                if (options.normalizeHeadings) {
                    content = this._normalizeHeadingLevels(content, i);
                }

                const anchorResult = this._injectHeadingAnchors(content, slugger);
                doc.content = anchorResult.markdown;
                doc.headings = anchorResult.headings;

                if (!doc.anchorId) {
                    const firstHeading = doc.headings.find((heading) => heading.level === 1) || doc.headings[0];
                    if (firstHeading) {
                        doc.anchorId = firstHeading.id;
                    }
                }
            }

            if (options.resolveLinks) {
                for (const doc of processedDocs) {
                    doc.content = this._resolveLinks(doc.content, doc, processedDocs);
                }
            }

            // Build outline for bookmarks
            this.outline = this._buildOutline(processedDocs);

            // Generate collated markdown
            let collated = '';

            // Add table of contents if requested
            if (options.toc) {
                collated += this._generateTOC(processedDocs, options.tocDepth || 3);
                collated += '\n\n';
            }

            // Add each document with section breaks
            for (let i = 0; i < processedDocs.length; i++) {
                const doc = processedDocs[i];

                // Add section break (except before first document)
                if (i > 0 && options.sectionBreaks !== false) {
                    collated += '\n\n<div class="section-break"></div>\n\n';
                    collated += '---\n\n';
                }

                // Add document title as H1 if not already present
                if (!doc.hasLeadingHeading) {
                    collated += `<a id="${doc.anchorId}"></a>\n# ${doc.title}\n\n`;
                }

                // Add document content
                collated += doc.content;
                collated += '\n\n';
            }

            if (this.verbose) {
                const totalSize = (Buffer.byteLength(collated, 'utf8') / 1024).toFixed(2);
                console.log(`  ✅ Collated ${documentContents.length} documents (${totalSize} KB)`);
            }

            return collated;

        } catch (error) {
            console.error('❌ Error collating documents:', error.message);
            throw error;
        }
    }

    /**
     * Sort documents by order field or filename
     * @private
     */
    _sortDocuments(documents) {
        // If all documents have order field, sort by that
        const hasOrder = documents.every(doc => typeof doc.order === 'number');
        if (hasOrder) {
            return [...documents].sort((a, b) => a.order - b.order);
        }

        // Otherwise, try intelligent ordering based on common patterns
        const orderPatterns = [
            { regex: /summary|overview|executive/i, priority: 1 },
            { regex: /introduction|intro|getting-started/i, priority: 2 },
            { regex: /analysis|detailed|technical/i, priority: 3 },
            { regex: /plan|roadmap|remediation/i, priority: 4 },
            { regex: /implementation|deployment/i, priority: 5 },
            { regex: /conclusion|summary|next-steps/i, priority: 6 },
            { regex: /appendix|reference|glossary/i, priority: 7 }
        ];

        return [...documents].sort((a, b) => {
            const aPriority = this._getDocumentPriority(a, orderPatterns);
            const bPriority = this._getDocumentPriority(b, orderPatterns);

            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }

            // If same priority, sort alphabetically
            return a.path.localeCompare(b.path);
        });
    }

    /**
     * Get document priority based on filename patterns
     * @private
     */
    _getDocumentPriority(doc, patterns) {
        const filename = path.basename(doc.path, '.md').toLowerCase();

        for (const pattern of patterns) {
            if (pattern.regex.test(filename) || pattern.regex.test(doc.title || '')) {
                return pattern.priority;
            }
        }

        // Default priority (middle of the road)
        return 50;
    }

    /**
     * Extract headings from markdown content
     * @private
     */
    _extractHeadings(content) {
        const headings = [];
        const lines = content.split('\n');
        const slugger = this._createSlugger();
        let inCodeBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (inCodeBlock) continue;

            const match = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();

                headings.push({
                    level,
                    text,
                    line: i + 1,
                    id: slugger.slug(text)
                });
            }
        }

        return headings;
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
    _injectHeadingAnchors(content, slugger) {
        const headings = [];
        const lines = content.split('\n');
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
     * Build outline structure for PDF bookmarks
     * @private
     */
    _buildOutline(documents) {
        const outline = [];

        for (const doc of documents) {
            const docNode = {
                title: doc.title,
                level: 1,
                children: []
            };

            // Add document headings as children
            for (const heading of doc.headings) {
                docNode.children.push({
                    title: heading.text,
                    level: heading.level + 1, // Offset by document level
                    id: heading.id
                });
            }

            outline.push(docNode);
        }

        return outline;
    }

    /**
     * Generate Table of Contents
     * @private
     */
    _generateTOC(documents, maxDepth = 3) {
        let toc = '<div class="toc">\n';
        toc += '<h2 class="toc-title">Table of Contents</h2>\n';
        toc += '<ul>\n';

        for (const doc of documents) {
            const docAnchor = doc.anchorId || this._slugify(doc.title);
            toc += `  <li><a href="#${docAnchor}">${doc.title}</a>`;

            const docHeadings = (doc.headings || []).filter((heading, index) => {
                if (heading.level > maxDepth) return false;
                if (index === 0 && heading.level === 1 && heading.id === docAnchor) return false;
                return true;
            });

            if (docHeadings.length > 0) {
                toc += '\n' + this._buildHeadingList(docHeadings) + '  ';
            }

            toc += '</li>\n';
        }

        toc += '</ul>\n';
        toc += '</div>\n';
        return toc;
    }

    /**
     * Build nested heading list for TOC
     * @private
     */
    _buildHeadingList(headings) {
        if (headings.length === 0) return '';

        const baseLevel = Math.min(...headings.map((heading) => heading.level));
        let currentLevel = baseLevel;
        let html = '    <ul>\n';

        for (const heading of headings) {
            while (heading.level > currentLevel) {
                html += '      <ul>\n';
                currentLevel++;
            }
            while (heading.level < currentLevel) {
                html += '      </ul>\n';
                currentLevel--;
            }
            html += `      <li><a href="#${heading.id}">${heading.text}</a></li>\n`;
        }

        while (currentLevel > baseLevel) {
            html += '      </ul>\n';
            currentLevel--;
        }

        html += '    </ul>\n';
        return html;
    }

    /**
     * Normalize heading levels across documents
     * @private
     */
    _normalizeHeadingLevels(content, documentIndex) {
        // Increase all heading levels by 1 so document title can be H1
        return content.replace(/^(#{1,5})\s+/gm, (match, hashes) => {
            return '#'.repeat(hashes.length + 1) + ' ';
        });
    }

    /**
     * Resolve cross-document links
     * @private
     */
    _resolveLinks(content, currentDoc, allDocs) {
        // Find all markdown links
        return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
            // Skip external links
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return match;
            }

            // Skip anchors (already within document)
            if (url.startsWith('#')) {
                return match;
            }

            // Check if link points to another document in the collection
            const linkedDoc = allDocs.find(doc => {
                const docFilename = path.basename(doc.path);
                return url.includes(docFilename);
            });

            if (linkedDoc) {
                // Extract anchor if present
                const anchorMatch = url.match(/#(.+)$/);
                const anchor = anchorMatch ? `#${anchorMatch[1]}` : '';
                const docAnchor = linkedDoc.anchorId || this._slugify(linkedDoc.title);

                // Convert to internal anchor link
                return `[${text}](${anchor || `#${docAnchor}`})`;
            }

            // Leave other relative links as-is
            return match;
        });
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
     * Get outline structure for PDF bookmarks
     */
    getOutline() {
        return this.outline;
    }

    /**
     * Generate collation summary
     */
    generateSummary(documents) {
        const summary = {
            totalDocuments: documents.length,
            totalHeadings: documents.reduce((sum, doc) => sum + (doc.headings?.length || 0), 0),
            documents: documents.map(doc => ({
                title: doc.title,
                path: doc.path,
                headingCount: doc.headings?.length || 0,
                topHeading: doc.headings?.[0]?.text || 'N/A'
            }))
        };

        return summary;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: document-collator.js <doc1.md> <doc2.md> ... [--output collated.md]');
        console.log('\nOptions:');
        console.log('  --output <file>     Output file (default: stdout)');
        console.log('  --toc               Generate table of contents');
        console.log('  --toc-depth <n>     TOC depth (default: 3)');
        console.log('  --section-breaks    Add section breaks between documents');
        console.log('  --normalize         Normalize heading levels');
        console.log('  --resolve-links     Resolve cross-document links');
        console.log('  --verbose           Verbose output');
        process.exit(1);
    }

    const options = {
        toc: args.includes('--toc'),
        tocDepth: parseInt(args[args.indexOf('--toc-depth') + 1] || '3'),
        sectionBreaks: args.includes('--section-breaks'),
        normalizeHeadings: args.includes('--normalize'),
        resolveLinks: args.includes('--resolve-links'),
        verbose: args.includes('--verbose')
    };

    const outputIndex = args.indexOf('--output');
    const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;

    // Get document paths (filter out option flags)
    const docPaths = args.filter(arg =>
        !arg.startsWith('--') && arg.endsWith('.md') && arg !== outputFile
    );

    const documents = docPaths.map((p, index) => ({
        path: p,
        title: path.basename(p, '.md').replace(/-|_/g, ' '),
        order: index
    }));

    const collator = new DocumentCollator({ verbose: options.verbose });

    (async () => {
        try {
            const collated = await collator.collate(documents, options);

            if (outputFile) {
                await fs.writeFile(outputFile, collated, 'utf8');
                console.log(`✅ Collated document written to: ${outputFile}`);
            } else {
                console.log(collated);
            }

            if (options.verbose) {
                const summary = collator.generateSummary(documents);
                console.log('\nCollation Summary:');
                console.log(`  Total documents: ${summary.totalDocuments}`);
                console.log(`  Total headings: ${summary.totalHeadings}`);
            }

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = DocumentCollator;
