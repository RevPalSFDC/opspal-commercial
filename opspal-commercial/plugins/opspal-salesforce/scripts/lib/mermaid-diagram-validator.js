#!/usr/bin/env node

/**
 * Mermaid Diagram Validator
 *
 * Validates and fixes Mermaid diagrams in markdown files before PDF generation.
 * Strips incompatible directives and removes failed diagrams cleanly.
 *
 * User Preferences:
 * - Remove failed diagrams completely (no error message)
 * - Strip %%{init:...}%% directives (incompatible with md-to-pdf)
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

class MermaidDiagramValidator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.maxLines = options.maxLines || 500; // Warn on large diagrams
  }

  /**
   * Process markdown content and fix/remove Mermaid diagrams
   * @param {string} markdown - Input markdown content
   * @returns {{content: string, fixed: number, removed: number, warnings: Array}}
   */
  process(markdown) {
    const result = {
      content: markdown,
      fixed: 0,
      removed: 0,
      warnings: []
    };

    // Find all Mermaid code blocks
    const mermaidBlockRegex = /```mermaid\n([\s\S]*?)```/g;
    let match;
    const replacements = [];

    while ((match = mermaidBlockRegex.exec(markdown)) !== null) {
      const fullBlock = match[0];
      const diagramContent = match[1];
      const startPos = match.index;

      // Process this diagram
      const processed = this._processDiagram(diagramContent);

      if (processed.action === 'fix') {
        // Replace with fixed version
        replacements.push({
          start: startPos,
          end: startPos + fullBlock.length,
          replacement: '```mermaid\n' + processed.content + '```'
        });
        result.fixed++;
        if (this.verbose) {
          console.log(`✓ Fixed Mermaid diagram (stripped init directive)`);
        }
      } else if (processed.action === 'remove') {
        // Remove completely (user preference: no error message)
        replacements.push({
          start: startPos,
          end: startPos + fullBlock.length,
          replacement: '' // Complete removal
        });
        result.removed++;
        if (this.verbose) {
          console.log(`⚠ Removed invalid Mermaid diagram: ${processed.reason}`);
        }
      }

      if (processed.warnings) {
        result.warnings.push(...processed.warnings);
      }
    }

    // Apply replacements in reverse order (to maintain positions)
    replacements.sort((a, b) => b.start - a.start);
    let newContent = markdown;
    for (const repl of replacements) {
      newContent = newContent.substring(0, repl.start) + repl.replacement + newContent.substring(repl.end);
    }

    result.content = newContent;
    return result;
  }

  /**
   * Process a single Mermaid diagram
   * @private
   * @param {string} diagram - Diagram content
   * @returns {{action: string, content: string, reason: string, warnings: Array}}
   */
  _processDiagram(diagram) {
    const result = {
      action: 'keep', // 'keep', 'fix', or 'remove'
      content: diagram,
      reason: '',
      warnings: []
    };

    // Check diagram size
    const lineCount = diagram.split('\n').length;
    if (lineCount > this.maxLines) {
      result.warnings.push(`Large diagram: ${lineCount} lines (may impact PDF generation performance)`);
    }

    // Check for init directive (incompatible with md-to-pdf)
    if (diagram.includes('%%{init:')) {
      // Strip init directive
      const fixed = diagram.replace(/%%\{init:.*?\}%%\n?/g, '');

      // Validate the fixed version
      const validation = this._validateMermaidSyntax(fixed);
      if (validation.valid) {
        result.action = 'fix';
        result.content = fixed;
      } else {
        // Stripping init didn't help - remove diagram
        result.action = 'remove';
        result.reason = validation.reason;
      }
    } else {
      // No init directive, but validate anyway
      const validation = this._validateMermaidSyntax(diagram);
      if (!validation.valid) {
        result.action = 'remove';
        result.reason = validation.reason;
      }
    }

    return result;
  }

  /**
   * Validate Mermaid diagram syntax
   * @private
   * @param {string} diagram - Diagram content
   * @returns {{valid: boolean, reason: string}}
   */
  _validateMermaidSyntax(diagram) {
    const lines = diagram.split('\n').filter(l => l.trim() && !l.trim().startsWith('%%'));

    if (lines.length === 0) {
      return { valid: false, reason: 'Empty diagram' };
    }

    // Check for diagram type declaration
    const firstLine = lines[0].trim();
    const validTypes = [
      'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
      'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'journey',
      'gantt', 'pie', 'gitGraph', 'C4Context', 'mindmap', 'timeline'
    ];

    const hasValidType = validTypes.some(type =>
      firstLine.startsWith(type) || firstLine.includes(type)
    );

    if (!hasValidType) {
      return {
        valid: false,
        reason: `Invalid or missing diagram type. Expected one of: ${validTypes.slice(0, 5).join(', ')}, etc.`
      };
    }

    // Check for basic syntax issues
    if (diagram.includes('```')) {
      return { valid: false, reason: 'Nested code blocks detected' };
    }

    // ERD specific validation
    if (firstLine.includes('erDiagram')) {
      // Check for entity declarations (basic validation)
      const hasEntities = lines.some(line => {
        const trimmed = line.trim();
        return trimmed.match(/^\w+\s+\{/) || // Entity with attributes
               trimmed.match(/^\w+\s*$/);      // Entity without attributes
      });

      if (!hasEntities && lines.length > 10) {
        // Large ERD with no visible entities might be malformed
        return { valid: false, reason: 'ERD diagram appears malformed (no valid entities detected)' };
      }
    }

    return { valid: true, reason: '' };
  }

  /**
   * Generate summary report
   * @param {Object} result - Processing result
   * @returns {string}
   */
  generateSummary(result) {
    let summary = `Mermaid Diagram Validation:\n`;
    summary += `  Fixed: ${result.fixed} diagram(s)\n`;
    summary += `  Removed: ${result.removed} diagram(s)\n`;

    if (result.warnings.length > 0) {
      summary += `  Warnings: ${result.warnings.length}\n`;
      result.warnings.forEach(w => {
        summary += `    - ${w}\n`;
      });
    }

    return summary;
  }
}

module.exports = MermaidDiagramValidator;

// CLI usage
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: mermaid-diagram-validator.js <input.md> [output.md] [--verbose]');
    console.log('\nValidates and fixes Mermaid diagrams in markdown files.');
    console.log('\nOptions:');
    console.log('  --verbose    Show detailed processing information');
    console.log('\nExample:');
    console.log('  node mermaid-diagram-validator.js report.md report-fixed.md --verbose');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1] && !args[1].startsWith('--') ? args[1] : inputFile;
  const verbose = args.includes('--verbose');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`Processing: ${inputFile}`);

  const markdown = fs.readFileSync(inputFile, 'utf8');
  const validator = new MermaidDiagramValidator({ verbose });
  const result = validator.process(markdown);

  // Write output
  fs.writeFileSync(outputFile, result.content, 'utf8');

  // Print summary
  console.log('\n' + validator.generateSummary(result));

  if (outputFile !== inputFile) {
    console.log(`\nOutput written to: ${outputFile}`);
  } else {
    console.log(`\nFile updated in place: ${outputFile}`);
  }

  process.exit(result.removed > 0 ? 1 : 0);
}
