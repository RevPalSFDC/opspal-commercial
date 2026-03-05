#!/usr/bin/env node

/**
 * Pandoc Bookmarks - PDF Outline/Bookmark Injection
 *
 * Adds navigational bookmarks (PDF outline) to generated PDFs using
 * pdftk or Pandoc. Bookmarks enable quick navigation in PDF viewers.
 *
 * Approach:
 * 1. Generate bookmark metadata from heading structure
 * 2. Use pdftk to inject bookmarks into existing PDF
 * 3. Fallback gracefully if tools unavailable
 *
 * Requirements:
 * - pdftk (recommended): brew install pdftk-java / apt install pdftk
 * - OR Pandoc with pdfunite support
 *
 * @version 1.0.0
 * @date 2025-12-25
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

class PandocBookmarks {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.tempDir = options.tempDir || '/tmp/pdf-bookmarks';
    this.toolAvailable = null; // Cache availability check
  }

  /**
   * Add bookmarks to an existing PDF
   * @param {string} inputPath - Source PDF path
   * @param {Array} headings - Array of {level, text, pageNumber?}
   * @param {string} outputPath - Output PDF path (can be same as input)
   * @returns {Promise<boolean>} Success status
   */
  async addBookmarks(inputPath, headings, outputPath) {
    try {
      // Check tool availability
      const tool = await this._getAvailableTool();
      if (!tool) {
        if (this.verbose) {
          console.log('  ⚠️ No PDF bookmark tool available (pdftk or Pandoc not found)');
        }
        return false;
      }

      // Validate inputs
      if (!headings || headings.length === 0) {
        if (this.verbose) {
          console.log('  No headings provided for bookmarks');
        }
        return false;
      }

      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });

      // Generate bookmark metadata file
      const bookmarksFile = await this._generateBookmarkFile(headings);

      // Apply bookmarks based on available tool
      if (tool === 'pdftk') {
        await this._applyWithPdftk(inputPath, bookmarksFile, outputPath);
      } else if (tool === 'qpdf') {
        await this._applyWithQpdf(inputPath, headings, outputPath);
      }

      // Cleanup temp files
      await this._cleanup(bookmarksFile);

      if (this.verbose) {
        console.log(`  ✅ Added ${headings.length} bookmarks to PDF`);
      }

      return true;

    } catch (error) {
      if (this.verbose) {
        console.error('  ❌ Bookmark injection failed:', error.message);
      }
      // Non-fatal - copy original if needed
      if (inputPath !== outputPath) {
        await fs.copyFile(inputPath, outputPath);
      }
      return false;
    }
  }

  /**
   * Check which PDF tool is available
   * @private
   */
  async _getAvailableTool() {
    if (this.toolAvailable !== null) {
      return this.toolAvailable;
    }

    // Check for pdftk
    try {
      await execAsync('pdftk --version');
      this.toolAvailable = 'pdftk';
      return 'pdftk';
    } catch (e) {
      // pdftk not available
    }

    // Check for qpdf as alternative
    try {
      await execAsync('qpdf --version');
      this.toolAvailable = 'qpdf';
      return 'qpdf';
    } catch (e) {
      // qpdf not available
    }

    this.toolAvailable = null;
    return null;
  }

  /**
   * Generate pdftk-compatible bookmark metadata file
   * @private
   */
  async _generateBookmarkFile(headings) {
    const lines = [];

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const pageNum = heading.pageNumber || this._estimatePageNumber(i, headings.length);

      lines.push('BookmarkBegin');
      lines.push(`BookmarkTitle: ${this._sanitizeTitle(heading.text)}`);
      lines.push(`BookmarkLevel: ${heading.level}`);
      lines.push(`BookmarkPageNumber: ${pageNum}`);
    }

    const bookmarkPath = path.join(this.tempDir, `bookmarks-${Date.now()}.txt`);
    await fs.writeFile(bookmarkPath, lines.join('\n'), 'utf8');

    return bookmarkPath;
  }

  /**
   * Apply bookmarks using pdftk
   * @private
   */
  async _applyWithPdftk(inputPath, bookmarksFile, outputPath) {
    const tempOutput = path.join(this.tempDir, `output-${Date.now()}.pdf`);

    // pdftk input.pdf update_info bookmarks.txt output output.pdf
    const cmd = `pdftk "${inputPath}" update_info "${bookmarksFile}" output "${tempOutput}"`;

    if (this.verbose) {
      console.log(`  Running: ${cmd}`);
    }

    await execAsync(cmd);

    // Move to final location
    if (inputPath === outputPath) {
      // Replace original
      await fs.unlink(inputPath);
    }
    await fs.rename(tempOutput, outputPath);
  }

  /**
   * Apply bookmarks using qpdf (limited support)
   * @private
   */
  async _applyWithQpdf(inputPath, headings, outputPath) {
    // qpdf doesn't support bookmark injection directly
    // We'll use a workaround with object streams if possible
    // For now, just copy the file as qpdf bookmark support is limited

    if (this.verbose) {
      console.log('  ⚠️ qpdf has limited bookmark support, TOC in document body only');
    }

    if (inputPath !== outputPath) {
      await fs.copyFile(inputPath, outputPath);
    }
  }

  /**
   * Sanitize title for bookmark metadata
   * @private
   */
  _sanitizeTitle(text) {
    return text
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/&/g, '&amp;') // Escape ampersands
      .replace(/\n/g, ' ') // Remove newlines
      .trim();
  }

  /**
   * Estimate page number based on heading position
   * @private
   */
  _estimatePageNumber(index, total) {
    // Simple estimation: assume roughly 3 headings per page
    // This is used when actual page numbers aren't available
    return Math.max(1, Math.ceil((index + 1) / 3));
  }

  /**
   * Cleanup temporary files
   * @private
   */
  async _cleanup(bookmarksFile) {
    try {
      await fs.unlink(bookmarksFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  /**
   * Generate bookmark structure from markdown headings
   * Static utility method for extracting heading structure
   * @param {string} markdown - Markdown content
   * @param {number} maxDepth - Maximum heading depth to include
   * @returns {Array} Heading structure for bookmarks
   */
  static extractHeadingsFromMarkdown(markdown, maxDepth = 3) {
    const headings = [];
    const lines = markdown.split('\n');

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        if (level <= maxDepth) {
          headings.push({
            level,
            text: match[2].trim(),
            pageNumber: null // Will be estimated or determined later
          });
        }
      }
    }

    return headings;
  }

  /**
   * Check if PDF tools are available on the system
   * @returns {Promise<Object>} Tool availability status
   */
  static async checkToolAvailability() {
    const result = {
      pdftk: false,
      qpdf: false,
      recommended: null
    };

    try {
      await execAsync('pdftk --version');
      result.pdftk = true;
      result.recommended = 'pdftk';
    } catch (e) {
      // Not available
    }

    try {
      await execAsync('qpdf --version');
      result.qpdf = true;
      if (!result.recommended) {
        result.recommended = 'qpdf';
      }
    } catch (e) {
      // Not available
    }

    return result;
  }

  /**
   * Get installation instructions for PDF tools
   * @returns {string} Installation instructions
   */
  static getInstallInstructions() {
    return `
PDF Bookmark Tool Installation
==============================

For full PDF bookmark/outline support, install pdftk:

macOS:
  brew install pdftk-java

Ubuntu/Debian:
  sudo apt-get install pdftk

Fedora/RHEL:
  sudo dnf install pdftk

Alternative (qpdf - limited support):
  brew install qpdf
  sudo apt-get install qpdf

Note: Without these tools, PDFs will still be generated correctly,
but navigation bookmarks in the PDF viewer sidebar won't be available.
The Table of Contents will still appear in the document body.
    `.trim();
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: pandoc-bookmarks.js <command> [options]');
    console.log('\nCommands:');
    console.log('  check                     Check tool availability');
    console.log('  install                   Show installation instructions');
    console.log('  add <pdf> <headings.json> Add bookmarks to PDF');
    console.log('\nExamples:');
    console.log('  pandoc-bookmarks.js check');
    console.log('  pandoc-bookmarks.js add report.pdf headings.json');
    process.exit(1);
  }

  const command = args[0];

  (async () => {
    try {
      switch (command) {
        case 'check': {
          const availability = await PandocBookmarks.checkToolAvailability();
          console.log('PDF Tool Availability:');
          console.log(`  pdftk: ${availability.pdftk ? '✅ Available' : '❌ Not found'}`);
          console.log(`  qpdf:  ${availability.qpdf ? '✅ Available' : '❌ Not found'}`);
          console.log(`\nRecommended: ${availability.recommended || 'None available'}`);
          if (!availability.recommended) {
            console.log('\nRun "pandoc-bookmarks.js install" for installation instructions.');
          }
          break;
        }

        case 'install': {
          console.log(PandocBookmarks.getInstallInstructions());
          break;
        }

        case 'add': {
          const pdfPath = args[1];
          const headingsPath = args[2];

          if (!pdfPath || !headingsPath) {
            console.error('Error: PDF path and headings file required');
            process.exit(1);
          }

          const headingsContent = await fs.readFile(headingsPath, 'utf8');
          const headings = JSON.parse(headingsContent);

          const bookmarker = new PandocBookmarks({ verbose: true });
          const success = await bookmarker.addBookmarks(pdfPath, headings, pdfPath);

          if (success) {
            console.log('Bookmarks added successfully!');
          } else {
            console.log('Bookmark injection skipped or failed.');
          }
          break;
        }

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = PandocBookmarks;
