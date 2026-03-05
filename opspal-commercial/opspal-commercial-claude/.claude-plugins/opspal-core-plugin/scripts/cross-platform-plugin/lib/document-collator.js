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
                        content,
                        headings: this._extractHeadings(content)
                    };
                })
            );

            // Build outline for bookmarks
            this.outline = this._buildOutline(documentContents);

            // Generate collated markdown
            let collated = '';

            // Add table of contents if requested
            if (options.toc) {
                collated += this._generateTOC(documentContents, options.tocDepth || 3);
                collated += '\n\n';
            }

            // Add each document with section breaks
            for (let i = 0; i < documentContents.length; i++) {
                const doc = documentContents[i];

                // Add section break (except before first document)
                if (i > 0 && options.sectionBreaks !== false) {
                    collated += '\n\n<div class="section-break"></div>\n\n';
                    collated += '---\n\n';
                }

                // Add document title as H1 if not already present
                const firstLine = doc.content.trim().split('\n')[0];
                if (!firstLine.startsWith('#')) {
                    collated += `# ${doc.title}\n\n`;
                }

                // Add document content
                let content = doc.content;

                // Normalize heading levels if requested
                if (options.normalizeHeadings) {
                    content = this._normalizeHeadingLevels(content, i);
                }

                // Resolve cross-document links if requested
                if (options.resolveLinks) {
                    content = this._resolveLinks(content, doc, documentContents);
                }

                collated += content;
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

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(/^(#{1,6})\s+(.+)$/);

            if (match) {
                const level = match[1].length;
                const text = match[2].trim();

                headings.push({
                    level,
                    text,
                    line: i + 1,
                    id: this._slugify(text)
                });
            }
        }

        return headings;
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
        let toc = '<div class="toc">\n\n';
        toc += '## Table of Contents\n\n';

        for (const doc of documents) {
            // Document title
            toc += `- [${doc.title}](#${this._slugify(doc.title)})\n`;

            // Document headings (up to maxDepth)
            for (const heading of doc.headings) {
                if (heading.level <= maxDepth) {
                    const indent = '  '.repeat(heading.level);
                    toc += `${indent}- [${heading.text}](#${heading.id})\n`;
                }
            }

            toc += '\n';
        }

        toc += '</div>\n';
        return toc;
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

                // Convert to internal anchor link
                return `[${text}](${anchor || `#${this._slugify(linkedDoc.title)}`})`;
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
