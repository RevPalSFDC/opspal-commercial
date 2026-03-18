#!/usr/bin/env node

/**
 * NotebookLM Source Formatter
 *
 * Converts assessment outputs to NotebookLM-optimal formats.
 * Supports hierarchical source creation with executive summaries
 * and cross-referenced detail documents.
 *
 * @version 1.0.0
 * @date 2025-01-22
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  maxSourceLength: 500000, // NotebookLM source size limit (~500KB text)
  summaryMaxLength: 5000,  // Executive summary target length
  chunkSize: 400000,       // Size for chunking large files
  chunkOverlap: 1000       // Overlap between chunks for context
};

/**
 * Format assessment report for NotebookLM
 * Creates hierarchical sources: executive summary + detail
 */
function formatAssessmentReport(content, metadata = {}) {
  const {
    title = 'Assessment Report',
    type = 'assessment',
    orgAlias = 'unknown',
    assessmentType = 'general'
  } = metadata;

  // Generate executive summary
  const executiveSummary = generateExecutiveSummary(content, {
    title,
    assessmentType
  });

  // Format full content
  const formattedContent = formatMarkdownForNotebook(content);

  // Check if chunking is needed
  const needsChunking = formattedContent.length > CONFIG.maxSourceLength;

  if (needsChunking) {
    const chunks = chunkContent(formattedContent, {
      title,
      orgAlias,
      assessmentType
    });

    return {
      primary: {
        title: `[${assessmentType.toUpperCase()}] Executive Summary`,
        content: executiveSummary,
        tier: 'primary',
        metadata: {
          type: 'summary',
          linkedSources: chunks.map((_, i) => `detail-${i + 1}`),
          assessmentType,
          orgAlias,
          generatedAt: new Date().toISOString()
        }
      },
      detail: chunks.map((chunk, i) => ({
        title: `[${assessmentType.toUpperCase()}] Full Report - Part ${i + 1}/${chunks.length}`,
        content: chunk.content,
        tier: 'detail',
        metadata: {
          type: 'detail',
          partNumber: i + 1,
          totalParts: chunks.length,
          linkedTo: 'primary',
          section: chunk.section,
          assessmentType,
          orgAlias,
          generatedAt: new Date().toISOString()
        }
      }))
    };
  }

  // Single document case
  return {
    primary: {
      title: `[${assessmentType.toUpperCase()}] Executive Summary`,
      content: executiveSummary,
      tier: 'primary',
      metadata: {
        type: 'summary',
        linkedSources: ['detail-1'],
        assessmentType,
        orgAlias,
        generatedAt: new Date().toISOString()
      }
    },
    detail: [{
      title: `[${assessmentType.toUpperCase()}] Full Findings & Recommendations`,
      content: formattedContent,
      tier: 'detail',
      metadata: {
        type: 'detail',
        linkedTo: 'primary',
        assessmentType,
        orgAlias,
        generatedAt: new Date().toISOString()
      }
    }]
  };
}

/**
 * Generate executive summary from content
 */
function generateExecutiveSummary(content, options = {}) {
  const { title, assessmentType } = options;

  const lines = content.split('\n');
  const summary = [];

  // Header
  summary.push(`# ${title} - Executive Summary`);
  summary.push('');
  summary.push(`**Assessment Type**: ${assessmentType}`);
  summary.push(`**Generated**: ${new Date().toISOString().split('T')[0]}`);
  summary.push('');

  // Extract key sections
  const keyHeadings = [
    'Executive Summary',
    'Key Findings',
    'Summary',
    'Overview',
    'Bottom Line',
    'BLUF',
    'Recommendations',
    'Next Steps',
    'Critical Issues',
    'High Priority',
    'Action Items'
  ];

  let currentSection = null;
  let sectionContent = [];
  let extractedSections = {};

  for (const line of lines) {
    // Check for heading
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentSection && sectionContent.length > 0) {
        extractedSections[currentSection] = sectionContent.join('\n');
      }

      const heading = headingMatch[1].trim();
      // Check if this is a key heading
      const isKeyHeading = keyHeadings.some(kh =>
        heading.toLowerCase().includes(kh.toLowerCase())
      );

      if (isKeyHeading) {
        currentSection = heading;
        sectionContent = [];
      } else {
        currentSection = null;
        sectionContent = [];
      }
    } else if (currentSection) {
      sectionContent.push(line);
    }
  }

  // Save last section
  if (currentSection && sectionContent.length > 0) {
    extractedSections[currentSection] = sectionContent.join('\n');
  }

  // Build summary from extracted sections
  if (Object.keys(extractedSections).length > 0) {
    for (const [heading, sectionContent] of Object.entries(extractedSections)) {
      summary.push(`## ${heading}`);
      summary.push('');
      // Truncate if needed
      const truncated = truncateText(sectionContent.trim(), 1500);
      summary.push(truncated);
      summary.push('');
    }
  } else {
    // Fallback: extract first meaningful paragraphs
    summary.push('## Overview');
    summary.push('');
    const meaningfulContent = extractMeaningfulContent(content, 2000);
    summary.push(meaningfulContent);
  }

  // Add navigation note
  summary.push('---');
  summary.push('');
  summary.push('*This is an executive summary. See linked detail sources for complete findings.*');

  return summary.join('\n');
}

/**
 * Format markdown content for optimal NotebookLM processing
 */
function formatMarkdownForNotebook(content) {
  let formatted = content;

  // Remove excessive blank lines
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  // Remove HTML comments
  formatted = formatted.replace(/<!--[\s\S]*?-->/g, '');

  // Simplify complex tables to lists if too wide
  formatted = simplifyWideTables(formatted);

  // Remove inline styling/HTML
  formatted = formatted.replace(/<style[\s\S]*?<\/style>/gi, '');
  formatted = formatted.replace(/<[^>]+>/g, '');

  // Ensure proper heading hierarchy
  formatted = normalizeHeadings(formatted);

  return formatted.trim();
}

/**
 * Chunk large content with section awareness
 */
function chunkContent(content, options = {}) {
  const { title, orgAlias, assessmentType } = options;
  const chunks = [];
  const lines = content.split('\n');

  let currentChunk = [];
  let currentSize = 0;
  let currentSection = 'Introduction';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineSize = line.length + 1; // +1 for newline

    // Detect section headers
    const headingMatch = line.match(/^#{1,2}\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
    }

    // Check if adding this line would exceed chunk size
    if (currentSize + lineSize > CONFIG.chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentChunk.join('\n'),
        section: currentSection,
        startLine: i - currentChunk.length,
        endLine: i - 1
      });

      // Start new chunk with overlap
      const overlapLines = getOverlapLines(currentChunk, CONFIG.chunkOverlap);
      currentChunk = overlapLines;
      currentSize = overlapLines.join('\n').length;
    }

    currentChunk.push(line);
    currentSize += lineSize;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push({
      content: currentChunk.join('\n'),
      section: currentSection,
      startLine: lines.length - currentChunk.length,
      endLine: lines.length - 1
    });
  }

  return chunks;
}

/**
 * Get overlap lines from end of chunk
 */
function getOverlapLines(lines, targetSize) {
  const overlap = [];
  let size = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const lineSize = lines[i].length + 1;
    if (size + lineSize > targetSize) break;
    overlap.unshift(lines[i]);
    size += lineSize;
  }

  return overlap;
}

/**
 * Simplify wide tables to lists
 */
function simplifyWideTables(content) {
  const tableRegex = /\|[^\n]+\|\n\|[-:\s|]+\|\n(\|[^\n]+\|\n)+/g;

  return content.replace(tableRegex, (table) => {
    const lines = table.trim().split('\n');
    if (lines.length < 3) return table;

    // Check table width (number of columns)
    const headerCols = lines[0].split('|').filter(c => c.trim()).length;
    if (headerCols <= 4) return table; // Keep narrow tables

    // Convert to list format
    const headers = lines[0].split('|').filter(c => c.trim()).map(c => c.trim());
    const dataLines = lines.slice(2);

    const listItems = [];
    for (const line of dataLines) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length === 0) continue;

      const item = cells.map((cell, i) => {
        const header = headers[i] || `Column ${i + 1}`;
        return `  - **${header}**: ${cell}`;
      }).join('\n');

      listItems.push(`- ${cells[0] || 'Item'}\n${item}`);
    }

    return listItems.join('\n\n') + '\n';
  });
}

/**
 * Normalize heading hierarchy
 */
function normalizeHeadings(content) {
  const lines = content.split('\n');
  const result = [];
  let minLevel = 6;

  // Find minimum heading level
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s/);
    if (match) {
      minLevel = Math.min(minLevel, match[1].length);
    }
  }

  // Normalize if needed
  const adjustment = minLevel > 1 ? minLevel - 1 : 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})(\s.+)$/);
    if (match && adjustment > 0) {
      const newLevel = Math.max(1, match[1].length - adjustment);
      result.push('#'.repeat(newLevel) + match[2]);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Truncate text to target length, preserving sentences
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSentence = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');

  const cutPoint = Math.max(lastSentence, lastNewline);
  if (cutPoint > maxLength * 0.7) {
    return truncated.substring(0, cutPoint + 1) + '\n\n*[Content truncated]*';
  }

  return truncated + '...\n\n*[Content truncated]*';
}

/**
 * Extract meaningful content (skip frontmatter, get first substantive text)
 */
function extractMeaningfulContent(content, maxLength) {
  const lines = content.split('\n');
  const meaningful = [];
  let charCount = 0;
  let inFrontmatter = false;

  for (const line of lines) {
    // Skip frontmatter
    if (line.trim() === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    // Skip empty lines at start
    if (meaningful.length === 0 && line.trim() === '') continue;

    // Skip pure heading lines without content
    if (/^#{1,6}\s*$/.test(line)) continue;

    meaningful.push(line);
    charCount += line.length;

    if (charCount >= maxLength) break;
  }

  return meaningful.join('\n');
}

/**
 * Format JSON context as narrative
 */
function formatJsonAsNarrative(json, options = {}) {
  const { title = 'Context Data' } = options;
  const data = typeof json === 'string' ? JSON.parse(json) : json;

  const narrative = [];
  narrative.push(`# ${title}`);
  narrative.push('');

  function processObject(obj, depth = 0) {
    const indent = '  '.repeat(depth);

    for (const [key, value] of Object.entries(obj)) {
      const humanKey = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
      const capitalizedKey = humanKey.charAt(0).toUpperCase() + humanKey.slice(1);

      if (value === null || value === undefined) {
        continue;
      } else if (Array.isArray(value)) {
        if (value.length === 0) continue;
        narrative.push(`${indent}**${capitalizedKey}**:`);
        for (const item of value) {
          if (typeof item === 'object') {
            narrative.push(`${indent}- Entry:`);
            processObject(item, depth + 2);
          } else {
            narrative.push(`${indent}- ${item}`);
          }
        }
      } else if (typeof value === 'object') {
        narrative.push(`${indent}**${capitalizedKey}**:`);
        processObject(value, depth + 1);
      } else {
        narrative.push(`${indent}**${capitalizedKey}**: ${value}`);
      }
    }
  }

  processObject(data);
  return narrative.join('\n');
}

/**
 * Format RUNBOOK.md for NotebookLM
 */
function formatRunbook(content, options = {}) {
  const { orgAlias = 'unknown' } = options;

  // Runbooks are typically already well-structured
  // Add context header and ensure proper formatting
  const header = [
    `# Operational Runbook - ${orgAlias}`,
    '',
    '**Document Type**: Operational Knowledge Base',
    `**Last Updated**: ${new Date().toISOString().split('T')[0]}`,
    '',
    '---',
    ''
  ].join('\n');

  const formattedContent = formatMarkdownForNotebook(content);

  return {
    primary: {
      title: `Operational Runbook - ${orgAlias}`,
      content: header + formattedContent,
      tier: 'primary',
      metadata: {
        type: 'runbook',
        orgAlias,
        generatedAt: new Date().toISOString()
      }
    },
    detail: []
  };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const commands = {
    'format-assessment': () => {
      const inputPath = args[1];
      const assessmentType = args[2] || 'general';
      const orgAlias = args[3] || 'unknown';

      if (!inputPath) {
        console.error('Usage: format-assessment <input-path> [assessment-type] [org-alias]');
        process.exit(1);
      }

      const content = fs.readFileSync(inputPath, 'utf-8');
      const result = formatAssessmentReport(content, {
        title: path.basename(inputPath, path.extname(inputPath)),
        assessmentType,
        orgAlias
      });

      console.log(JSON.stringify(result, null, 2));
    },

    'format-runbook': () => {
      const inputPath = args[1];
      const orgAlias = args[2] || 'unknown';

      if (!inputPath) {
        console.error('Usage: format-runbook <input-path> [org-alias]');
        process.exit(1);
      }

      const content = fs.readFileSync(inputPath, 'utf-8');
      const result = formatRunbook(content, { orgAlias });

      console.log(JSON.stringify(result, null, 2));
    },

    'format-json': () => {
      const inputPath = args[1];
      const title = args[2] || 'Context Data';

      if (!inputPath) {
        console.error('Usage: format-json <input-path> [title]');
        process.exit(1);
      }

      const content = fs.readFileSync(inputPath, 'utf-8');
      const result = formatJsonAsNarrative(content, { title });

      console.log(result);
    },

    'help': () => {
      console.log(`
NotebookLM Source Formatter

Commands:
  format-assessment <path> [type] [org]  Format assessment report for NotebookLM
  format-runbook <path> [org]            Format RUNBOOK.md for NotebookLM
  format-json <path> [title]             Convert JSON to narrative format
  help                                   Show this help message

Examples:
  node notebooklm-source-formatter.js format-assessment ./Q2C-AUDIT.md cpq eta-corp
  node notebooklm-source-formatter.js format-runbook ./RUNBOOK.md acme
  node notebooklm-source-formatter.js format-json ./ORG_CONTEXT.json "Organization Context"
`);
    }
  };

  const handler = commands[command] || commands['help'];
  handler();
}

// Exports for programmatic use
module.exports = {
  formatAssessmentReport,
  formatRunbook,
  formatJsonAsNarrative,
  formatMarkdownForNotebook,
  generateExecutiveSummary,
  chunkContent,
  CONFIG
};
