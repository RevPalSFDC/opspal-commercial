#!/usr/bin/env node

/**
 * PDF Context Optimizer
 *
 * Purpose: Optimize PDF reading using Claude Code's page range feature (v2.1.30+).
 * Analyzes PDF structure and returns relevant page ranges for queries.
 *
 * Features:
 * - Analyzes PDF structure (TOC, sections) on first pass
 * - Returns page ranges relevant to specific queries
 * - Caches PDF structure for subsequent reads
 * - Recommends optimal reading strategy
 *
 * For Claude Code v2.1.30+:
 * - Read tool now supports `pages: "1-5"` parameter for PDFs
 * - Large PDFs (>10 pages) return lightweight references when @-mentioned
 * - Maximum 20 pages per request
 *
 * Usage:
 *   const { PDFContextOptimizer } = require('./pdf-context-optimizer');
 *
 *   const optimizer = new PDFContextOptimizer();
 *
 *   // Analyze PDF structure
 *   const structure = await optimizer.analyzeStructure('/path/to/doc.pdf');
 *
 *   // Get relevant pages for a query
 *   const pages = await optimizer.getRelevantPages('/path/to/doc.pdf', 'validation rules');
 *
 * @module pdf-context-optimizer
 * @version 1.0.0
 * @created 2026-02-04
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CACHE_DIR = path.join(__dirname, '../../data/pdf-cache');
const MAX_PAGES_PER_READ = 20;
const CACHE_TTL_HOURS = 24;

// Section patterns for Salesforce documentation
const SECTION_PATTERNS = {
  salesforce: {
    'validation_rules': /validation\s*rule|vr\s*[0-9]|formula\s*field/i,
    'flows': /flow|process\s*builder|automation|trigger/i,
    'permissions': /permission|profile|role|sharing|access/i,
    'objects': /object|field|relationship|lookup|master.detail/i,
    'apex': /apex|trigger|class|test|code\s*coverage/i,
    'reports': /report|dashboard|analytics|chart/i,
    'layouts': /layout|page|lightning|record\s*type/i,
    'cpq': /cpq|quote|pricing|product|bundle|discount/i,
    'users': /user|license|login|authentication/i,
    'data': /data|import|export|migration|backup/i
  },
  hubspot: {
    'workflows': /workflow|automation|sequence/i,
    'properties': /property|field|custom/i,
    'contacts': /contact|lead|company|deal/i,
    'forms': /form|landing\s*page|conversion/i,
    'integrations': /integration|api|sync|webhook/i
  },
  generic: {
    'executive_summary': /executive\s*summary|overview|introduction|summary/i,
    'findings': /finding|issue|problem|concern|gap/i,
    'recommendations': /recommendation|suggest|action\s*item|next\s*step/i,
    'appendix': /appendix|attachment|reference|glossary/i,
    'methodology': /methodology|approach|process|procedure/i,
    'metrics': /metric|kpi|measure|performance|score/i
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(pdfPath) {
  const stat = fs.statSync(pdfPath);
  const hash = Buffer.from(`${pdfPath}:${stat.mtime.getTime()}`).toString('base64').replace(/[/+=]/g, '').slice(0, 16);
  return hash;
}

function loadCache(cacheKey) {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const ageHours = (Date.now() - new Date(data.cached_at).getTime()) / (1000 * 60 * 60);
      if (ageHours < CACHE_TTL_HOURS) {
        return data;
      }
    }
  } catch (e) {
    // Cache miss
  }
  return null;
}

function saveCache(cacheKey, data) {
  ensureCacheDir();
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  data.cached_at = new Date().toISOString();
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf8');
}

// =============================================================================
// PDF CONTEXT OPTIMIZER
// =============================================================================

class PDFContextOptimizer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || CACHE_DIR;
    this.maxPagesPerRead = options.maxPagesPerRead || MAX_PAGES_PER_READ;
  }

  /**
   * Analyze PDF structure
   *
   * @param {string} pdfPath - Path to PDF file
   * @returns {object} PDF structure analysis
   */
  async analyzeStructure(pdfPath) {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not found: ${pdfPath}`);
    }

    const cacheKey = getCacheKey(pdfPath);
    const cached = loadCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Get basic PDF info using pdfinfo (if available) or estimate
    let totalPages = 0;
    let metadata = {};

    try {
      // Try pdfinfo first (from poppler-utils)
      const info = execSync(`pdfinfo "${pdfPath}" 2>/dev/null`, { encoding: 'utf8' });
      const pagesMatch = info.match(/Pages:\s*(\d+)/);
      if (pagesMatch) {
        totalPages = parseInt(pagesMatch[1]);
      }
      const titleMatch = info.match(/Title:\s*(.+)/);
      if (titleMatch) {
        metadata.title = titleMatch[1].trim();
      }
    } catch (e) {
      // Fallback: estimate from file size (rough heuristic: ~50KB per page)
      const stat = fs.statSync(pdfPath);
      totalPages = Math.max(1, Math.ceil(stat.size / 50000));
    }

    // Determine document type from filename/path
    const docType = this._detectDocumentType(pdfPath);

    // Build structure estimate based on document type
    const structure = {
      path: pdfPath,
      filename: path.basename(pdfPath),
      total_pages: totalPages,
      document_type: docType,
      metadata,
      sections: this._estimateSections(totalPages, docType),
      reading_strategy: this._getReadingStrategy(totalPages)
    };

    saveCache(cacheKey, structure);
    return structure;
  }

  /**
   * Get relevant page ranges for a query
   *
   * @param {string} pdfPath - Path to PDF file
   * @param {string} query - Search query
   * @returns {object} Recommended page ranges
   */
  async getRelevantPages(pdfPath, query) {
    const structure = await this.analyzeStructure(pdfPath);
    const queryLower = query.toLowerCase();

    // Find matching sections
    const matchingSections = [];
    const patterns = {
      ...SECTION_PATTERNS[structure.document_type] || {},
      ...SECTION_PATTERNS.generic
    };

    for (const [sectionName, pattern] of Object.entries(patterns)) {
      if (pattern.test(query) || queryLower.includes(sectionName.replace(/_/g, ' '))) {
        const section = structure.sections.find(s =>
          s.name === sectionName || s.name.includes(sectionName)
        );
        if (section) {
          matchingSections.push(section);
        }
      }
    }

    // If no specific matches, use smart defaults based on query type
    if (matchingSections.length === 0) {
      matchingSections.push(...this._getDefaultSections(structure, query));
    }

    // Build page ranges
    const pageRanges = [];
    let totalPages = 0;

    for (const section of matchingSections) {
      if (totalPages + (section.end_page - section.start_page + 1) <= this.maxPagesPerRead) {
        pageRanges.push(`${section.start_page}-${section.end_page}`);
        totalPages += section.end_page - section.start_page + 1;
      } else if (totalPages < this.maxPagesPerRead) {
        // Add partial range
        const remaining = this.maxPagesPerRead - totalPages;
        pageRanges.push(`${section.start_page}-${section.start_page + remaining - 1}`);
        break;
      }
    }

    // Format for Claude Code Read tool
    const pagesParam = pageRanges.length > 0 ? pageRanges.join(',') : '1-5';

    return {
      query,
      pdf_path: pdfPath,
      total_pdf_pages: structure.total_pages,
      recommended_pages: pagesParam,
      pages_to_read: totalPages || 5,
      matching_sections: matchingSections.map(s => s.name),
      reading_notes: this._getReadingNotes(structure, matchingSections),
      claude_read_params: {
        file_path: pdfPath,
        pages: pagesParam
      }
    };
  }

  /**
   * Get optimal chunking strategy for large PDF
   *
   * @param {string} pdfPath - Path to PDF file
   * @returns {object} Chunking strategy
   */
  async getChunkingStrategy(pdfPath) {
    const structure = await this.analyzeStructure(pdfPath);

    if (structure.total_pages <= this.maxPagesPerRead) {
      return {
        strategy: 'single_read',
        chunks: [{ pages: `1-${structure.total_pages}` }],
        total_reads: 1
      };
    }

    // Build chunks based on sections
    const chunks = [];
    let currentChunk = { sections: [], start: 1, end: 0 };

    for (const section of structure.sections) {
      const sectionPages = section.end_page - section.start_page + 1;

      if (currentChunk.end - currentChunk.start + 1 + sectionPages <= this.maxPagesPerRead) {
        currentChunk.sections.push(section.name);
        currentChunk.end = section.end_page;
        if (currentChunk.start === 1 && currentChunk.end === 0) {
          currentChunk.start = section.start_page;
        }
      } else {
        // Save current chunk and start new one
        if (currentChunk.sections.length > 0) {
          chunks.push({
            pages: `${currentChunk.start}-${currentChunk.end}`,
            sections: currentChunk.sections
          });
        }
        currentChunk = {
          sections: [section.name],
          start: section.start_page,
          end: section.end_page
        };
      }
    }

    // Add final chunk
    if (currentChunk.sections.length > 0) {
      chunks.push({
        pages: `${currentChunk.start}-${currentChunk.end}`,
        sections: currentChunk.sections
      });
    }

    return {
      strategy: 'chunked_read',
      chunks,
      total_reads: chunks.length,
      total_pages: structure.total_pages,
      max_per_read: this.maxPagesPerRead
    };
  }

  /**
   * Detect document type from path/filename
   */
  _detectDocumentType(pdfPath) {
    const filename = path.basename(pdfPath).toLowerCase();
    const dirPath = path.dirname(pdfPath).toLowerCase();

    if (filename.includes('salesforce') || dirPath.includes('salesforce') ||
        filename.includes('sfdc') || dirPath.includes('sfdc')) {
      return 'salesforce';
    }
    if (filename.includes('hubspot') || dirPath.includes('hubspot')) {
      return 'hubspot';
    }
    if (filename.includes('marketo') || dirPath.includes('marketo')) {
      return 'marketo';
    }
    if (filename.includes('audit') || filename.includes('assessment')) {
      return 'audit';
    }
    if (filename.includes('report')) {
      return 'report';
    }

    return 'generic';
  }

  /**
   * Estimate sections based on total pages and doc type
   */
  _estimateSections(totalPages, docType) {
    // Standard section distribution heuristics
    const sections = [];

    if (totalPages <= 5) {
      sections.push({
        name: 'full_document',
        start_page: 1,
        end_page: totalPages,
        estimated: true
      });
      return sections;
    }

    // Common section breakdown (percentages of document)
    const sectionBreakdown = {
      audit: [
        { name: 'executive_summary', percent: 0.1 },
        { name: 'findings', percent: 0.4 },
        { name: 'recommendations', percent: 0.25 },
        { name: 'appendix', percent: 0.25 }
      ],
      report: [
        { name: 'overview', percent: 0.15 },
        { name: 'metrics', percent: 0.3 },
        { name: 'analysis', percent: 0.35 },
        { name: 'appendix', percent: 0.2 }
      ],
      salesforce: [
        { name: 'overview', percent: 0.1 },
        { name: 'objects_fields', percent: 0.25 },
        { name: 'validation_rules', percent: 0.15 },
        { name: 'flows', percent: 0.2 },
        { name: 'permissions', percent: 0.15 },
        { name: 'appendix', percent: 0.15 }
      ],
      generic: [
        { name: 'introduction', percent: 0.15 },
        { name: 'main_content', percent: 0.55 },
        { name: 'conclusion', percent: 0.15 },
        { name: 'appendix', percent: 0.15 }
      ]
    };

    const breakdown = sectionBreakdown[docType] || sectionBreakdown.generic;
    let currentPage = 1;

    for (const section of breakdown) {
      const sectionPages = Math.max(1, Math.round(totalPages * section.percent));
      const endPage = Math.min(currentPage + sectionPages - 1, totalPages);

      sections.push({
        name: section.name,
        start_page: currentPage,
        end_page: endPage,
        estimated: true
      });

      currentPage = endPage + 1;
      if (currentPage > totalPages) break;
    }

    return sections;
  }

  /**
   * Get reading strategy recommendation
   */
  _getReadingStrategy(totalPages) {
    if (totalPages <= 10) {
      return {
        approach: 'full_read',
        description: 'Document is small enough to read entirely',
        recommended_pages: `1-${totalPages}`
      };
    }
    if (totalPages <= 20) {
      return {
        approach: 'single_targeted_read',
        description: 'Use targeted page ranges for specific sections',
        recommended_pages: '1-20'
      };
    }
    if (totalPages <= 50) {
      return {
        approach: 'section_based',
        description: 'Read executive summary first, then specific sections as needed',
        recommended_pages: '1-5 (summary), then section-specific'
      };
    }
    return {
      approach: 'chunked_progressive',
      description: 'Large document - read in chunks, starting with summary and key sections',
      recommended_pages: 'Use getChunkingStrategy() for optimal reading plan'
    };
  }

  /**
   * Get default sections when no query matches
   */
  _getDefaultSections(structure, query) {
    // Start with executive summary or introduction
    const defaults = structure.sections.filter(s =>
      s.name.includes('summary') ||
      s.name.includes('overview') ||
      s.name.includes('introduction')
    );

    // If nothing found, return first section(s)
    if (defaults.length === 0 && structure.sections.length > 0) {
      defaults.push(structure.sections[0]);
    }

    return defaults;
  }

  /**
   * Get reading notes for the recommendation
   */
  _getReadingNotes(structure, matchingSections) {
    const notes = [];

    if (structure.total_pages > this.maxPagesPerRead) {
      notes.push(`Document has ${structure.total_pages} pages (max ${this.maxPagesPerRead} per read)`);
    }

    if (matchingSections.length === 0) {
      notes.push('No specific section matched - defaulting to document start');
    } else {
      notes.push(`Matched sections: ${matchingSections.map(s => s.name).join(', ')}`);
    }

    if (structure.sections.some(s => s.estimated)) {
      notes.push('Section boundaries are estimated - actual content may vary');
    }

    return notes;
  }

  /**
   * Clear cache
   */
  clearCache() {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    }
  }
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const optimizer = new PDFContextOptimizer();

  (async () => {
    switch (command) {
      case 'analyze': {
        const pdfPath = args[1];
        if (!pdfPath) {
          console.error('Usage: node pdf-context-optimizer.js analyze <pdf-path>');
          process.exit(1);
        }
        try {
          const structure = await optimizer.analyzeStructure(pdfPath);
          console.log('\nPDF Structure Analysis:');
          console.log(JSON.stringify(structure, null, 2));
        } catch (e) {
          console.error(`Error: ${e.message}`);
          process.exit(1);
        }
        break;
      }

      case 'pages': {
        const [, pdfPath, ...queryParts] = args;
        const query = queryParts.join(' ');
        if (!pdfPath || !query) {
          console.error('Usage: node pdf-context-optimizer.js pages <pdf-path> <query>');
          process.exit(1);
        }
        try {
          const result = await optimizer.getRelevantPages(pdfPath, query);
          console.log('\nRelevant Pages for Query:');
          console.log(JSON.stringify(result, null, 2));
          console.log('\n--- For Claude Code Read tool ---');
          console.log(`Read(file_path="${result.pdf_path}", pages="${result.recommended_pages}")`);
        } catch (e) {
          console.error(`Error: ${e.message}`);
          process.exit(1);
        }
        break;
      }

      case 'chunks': {
        const pdfPath = args[1];
        if (!pdfPath) {
          console.error('Usage: node pdf-context-optimizer.js chunks <pdf-path>');
          process.exit(1);
        }
        try {
          const strategy = await optimizer.getChunkingStrategy(pdfPath);
          console.log('\nChunking Strategy:');
          console.log(JSON.stringify(strategy, null, 2));
        } catch (e) {
          console.error(`Error: ${e.message}`);
          process.exit(1);
        }
        break;
      }

      case 'clear-cache': {
        optimizer.clearCache();
        console.log('PDF cache cleared.');
        break;
      }

      default:
        console.log(`
PDF Context Optimizer

Optimize PDF reading using Claude Code's page range feature (v2.1.30+).

Usage: node pdf-context-optimizer.js <command> [args]

Commands:
  analyze <pdf-path>           Analyze PDF structure
  pages <pdf-path> <query>     Get relevant pages for a query
  chunks <pdf-path>            Get chunking strategy for large PDF
  clear-cache                  Clear PDF structure cache

Examples:
  node pdf-context-optimizer.js analyze ./report.pdf
  node pdf-context-optimizer.js pages ./audit.pdf "validation rules"
  node pdf-context-optimizer.js chunks ./large-doc.pdf

Notes:
  - Claude Code v2.1.30+ supports pages parameter (e.g., pages="1-5,10-15")
  - Maximum 20 pages per Read request
  - Large PDFs (>10 pages) return lightweight references when @-mentioned
`);
    }
  })().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  PDFContextOptimizer,
  SECTION_PATTERNS,
  MAX_PAGES_PER_READ
};
