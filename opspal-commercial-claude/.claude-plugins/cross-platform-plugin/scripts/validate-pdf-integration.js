#!/usr/bin/env node
/**
 * PDF Integration Validator
 *
 * Validates that report-generating scripts have proper PDF integration.
 *
 * Usage:
 *   node validate-pdf-integration.js [path]
 *   node validate-pdf-integration.js --all
 *   node validate-pdf-integration.js --fix [path]
 *
 * Exit Codes:
 *   0 - All checks passed
 *   1 - Validation errors found
 *   2 - Script execution error
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

class PDFIntegrationValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passed = [];
  }

  /**
   * Validate single file
   *
   * @param {string} filePath - Path to script file
   * @returns {Object} Validation result
   */
  validateFile(filePath) {
    const filename = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    const checks = {
      isReportGenerator: this._isReportGenerator(content, filename),
      hasPDFImport: this._hasPDFImport(content),
      hasPDFGeneration: this._hasPDFGeneration(content),
      hasErrorHandling: this._hasErrorHandling(content),
      hasLogging: this._hasLogging(content),
      hasCoverTemplate: this._hasCoverTemplate(content),
      hasMetadata: this._hasMetadata(content)
    };

    // Only validate report generators
    if (!checks.isReportGenerator) {
      return { type: 'skipped', filename, reason: 'Not a report generator' };
    }

    // Check if PDF integration present
    if (!checks.hasPDFImport && !checks.hasPDFGeneration) {
      this.warnings.push({
        file: filePath,
        message: 'Missing PDF integration',
        severity: 'WARNING',
        suggestion: 'Add PDFGenerationHelper import and generation call'
      });
      return { type: 'warning', filename, checks };
    }

    // Validate completeness if PDF integration present
    const issues = [];

    if (checks.hasPDFImport || checks.hasPDFGeneration) {
      if (!checks.hasErrorHandling) {
        issues.push('Missing non-fatal error handling (try/catch)');
      }
      if (!checks.hasLogging) {
        issues.push('Missing PDF generation logging');
      }
      if (!checks.hasCoverTemplate) {
        issues.push('Missing cover template specification');
      }
      if (!checks.hasMetadata) {
        issues.push('Missing metadata object');
      }
    }

    if (issues.length > 0) {
      this.warnings.push({
        file: filePath,
        message: 'Incomplete PDF integration',
        issues,
        severity: 'WARNING'
      });
      return { type: 'warning', filename, checks, issues };
    }

    // All checks passed
    this.passed.push(filePath);
    return { type: 'passed', filename, checks };
  }

  /**
   * Check if file is a report generator
   *
   * @private
   */
  _isReportGenerator(content, filename) {
    // Check filename patterns
    const reportGeneratorPatterns = [
      /generator\.js$/,
      /orchestrator\.js$/,
      /reporter\.js$/,
      /builder\.js$/,
      /exporter\.js$/
    ];

    const isReportFile = reportGeneratorPatterns.some(pattern => pattern.test(filename));
    if (!isReportFile) return false;

    // Check content patterns
    const reportContentPatterns = [
      /\.md/,                          // Writes markdown
      /writeFileSync.*\.md/,           // Writes markdown files
      /generateMarkdown/,              // Has markdown generation method
      /generateReport/,                // Has report generation method
      /\.join\(.*\.md/                 // Constructs markdown paths
    ];

    return reportContentPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if file imports PDF generator
   *
   * @private
   */
  _hasPDFImport(content) {
    const importPatterns = [
      /require\(['"].*pdf-generator.*['"]\)/,
      /require\(['"].*pdf-generation-helper.*['"]\)/,
      /from ['"].*pdf-generator.*['"]/,
      /from ['"].*pdf-generation-helper.*['"]/
    ];

    return importPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if file has PDF generation call
   *
   * @private
   */
  _hasPDFGeneration(content) {
    const generationPatterns = [
      /PDFGenerator/,
      /PDFGenerationHelper/,
      /generatePDF/,
      /generateSingleReportPDF/,
      /generateMultiReportPDF/,
      /autoGeneratePDFFromDirectory/,
      /generator\.generate/,
      /generator\.collate/
    ];

    return generationPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if file has error handling
   *
   * @private
   */
  _hasErrorHandling(content) {
    // Check for try/catch around PDF generation
    const lines = content.split('\n');
    let inTryCatch = false;
    let hasPDFInTry = false;

    for (const line of lines) {
      if (/try\s*{/.test(line)) {
        inTryCatch = true;
      }
      if (inTryCatch && /PDF|pdf/.test(line)) {
        hasPDFInTry = true;
      }
      if (/catch.*{/.test(line) && hasPDFInTry) {
        return true;
      }
      if (/}\s*catch/.test(line) && hasPDFInTry) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file has PDF logging
   *
   * @private
   */
  _hasLogging(content) {
    const loggingPatterns = [
      /console\.log.*PDF/,
      /console\.warn.*PDF/,
      /Generating.*PDF/,
      /PDF.*generated/
    ];

    return loggingPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if file specifies cover template
   *
   * @private
   */
  _hasCoverTemplate(content) {
    return /coverTemplate|coverPage.*template/.test(content);
  }

  /**
   * Check if file has metadata
   *
   * @private
   */
  _hasMetadata(content) {
    return /metadata\s*:/.test(content);
  }

  /**
   * Validate all report generators in directory
   *
   * @param {string} searchPath - Directory to search
   * @returns {Object} Validation summary
   */
  validateAll(searchPath = '.') {
    const patterns = [
      '**/scripts/lib/*generator.js',
      '**/scripts/lib/*orchestrator.js',
      '**/scripts/lib/*reporter.js',
      '**/scripts/lib/*builder.js'
    ];

    const files = [];
    for (const pattern of patterns) {
      const matches = glob.sync(path.join(searchPath, pattern));
      files.push(...matches);
    }

    // Remove duplicates
    const uniqueFiles = [...new Set(files)];

    console.log(`🔍 Scanning ${uniqueFiles.length} file(s) for PDF integration...\n`);

    const results = uniqueFiles.map(file => this.validateFile(file));

    return {
      total: uniqueFiles.length,
      passed: this.passed.length,
      warnings: this.warnings.length,
      errors: this.errors.length,
      results
    };
  }

  /**
   * Print validation report
   *
   * @param {Object} summary - Validation summary
   */
  printReport(summary) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PDF Integration Validation Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Summary
    console.log(`📊 Summary:`);
    console.log(`   Total files scanned: ${summary.total}`);
    console.log(`   ✅ Passed: ${summary.passed}`);
    console.log(`   ⚠️  Warnings: ${summary.warnings}`);
    console.log(`   ❌ Errors: ${summary.errors}`);
    console.log('');

    // Passed files
    if (this.passed.length > 0) {
      console.log('✅ Files with proper PDF integration:');
      this.passed.forEach(file => {
        console.log(`   • ${path.relative('.', file)}`);
      });
      console.log('');
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      this.warnings.forEach(warning => {
        console.log(`   • ${path.relative('.', warning.file)}`);
        console.log(`     ${warning.message}`);
        if (warning.issues) {
          warning.issues.forEach(issue => {
            console.log(`     - ${issue}`);
          });
        }
        if (warning.suggestion) {
          console.log(`     💡 ${warning.suggestion}`);
        }
        console.log('');
      });
    }

    // Errors
    if (this.errors.length > 0) {
      console.log('❌ Errors:');
      this.errors.forEach(error => {
        console.log(`   • ${path.relative('.', error.file)}`);
        console.log(`     ${error.message}`);
        console.log('');
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Overall status
    if (this.errors.length > 0) {
      console.log('❌ FAILED: Validation errors found');
      return 1;
    } else if (this.warnings.length > 0) {
      console.log('⚠️  PASSED WITH WARNINGS: Some files missing PDF integration');
      return 0; // Warnings don't fail validation
    } else {
      console.log('✅ PASSED: All report generators have proper PDF integration');
      return 0;
    }
  }

  /**
   * Generate fix suggestions for file
   *
   * @param {string} filePath - Path to file
   * @returns {string} Fix suggestions
   */
  generateFixSuggestions(filePath) {
    const filename = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    let suggestions = [];

    suggestions.push(`# PDF Integration Fix Suggestions for ${filename}\n`);

    // Check what's missing
    if (!this._hasPDFImport(content)) {
      suggestions.push(`## 1. Add Import Statement\n`);
      suggestions.push(`Add to the top of your file:\n`);
      suggestions.push('```javascript');
      suggestions.push("const PDFGenerationHelper = require('../../../cross-platform-plugin/scripts/lib/pdf-generation-helper');");
      suggestions.push('```\n');
    }

    if (!this._hasPDFGeneration(content)) {
      suggestions.push(`## 2. Add PDF Generation Call\n`);
      suggestions.push(`After your markdown generation, add:\n`);
      suggestions.push('```javascript');
      suggestions.push('// Generate PDF');
      suggestions.push('await PDFGenerationHelper.generateMultiReportPDF({');
      suggestions.push('  orgAlias: args[0], // or your org identifier');
      suggestions.push('  outputDir: args[1], // or your output directory');
      suggestions.push('  documents: [');
      suggestions.push('    { path: path.join(outputDir, "REPORT.md"), title: "Report", order: 0 }');
      suggestions.push('  ],');
      suggestions.push('  coverTemplate: "salesforce-audit", // Choose appropriate template');
      suggestions.push('  metadata: {');
      suggestions.push('    title: `Report - ${orgAlias}`,');
      suggestions.push('    version: "1.0.0"');
      suggestions.push('  }');
      suggestions.push('});');
      suggestions.push('```\n');
    }

    if (!this._hasErrorHandling(content)) {
      suggestions.push(`## 3. Add Error Handling\n`);
      suggestions.push(`Wrap PDF generation in try/catch:\n`);
      suggestions.push('```javascript');
      suggestions.push('try {');
      suggestions.push('  await PDFGenerationHelper.generateMultiReportPDF({...});');
      suggestions.push('  console.log("✅ PDF generated successfully");');
      suggestions.push('} catch (pdfError) {');
      suggestions.push('  console.warn("⚠️  PDF generation failed (non-fatal):", pdfError.message);');
      suggestions.push('}');
      suggestions.push('```\n');
    }

    suggestions.push(`## Reference Documentation\n`);
    suggestions.push(`- Standard Pattern: docs/PDF_GENERATION_STANDARD_PATTERN.md`);
    suggestions.push(`- Helper Library: scripts/lib/pdf-generation-helper.js`);
    suggestions.push(`- Examples: automation-audit-v2-orchestrator.js, executive-reporter.js\n`);

    return suggestions.join('\n');
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  const validator = new PDFIntegrationValidator();

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log('PDF Integration Validator');
    console.log('');
    console.log('Usage:');
    console.log('  node validate-pdf-integration.js [path]     Validate specific file');
    console.log('  node validate-pdf-integration.js --all      Validate all report generators');
    console.log('  node validate-pdf-integration.js --fix [path]  Generate fix suggestions');
    console.log('');
    console.log('Examples:');
    console.log('  node validate-pdf-integration.js scripts/lib/my-generator.js');
    console.log('  node validate-pdf-integration.js --all');
    console.log('  node validate-pdf-integration.js --fix scripts/lib/my-generator.js');
    process.exit(0);
  }

  try {
    if (args[0] === '--all') {
      const searchPath = args[1] || '.';
      const summary = validator.validateAll(searchPath);
      const exitCode = validator.printReport(summary);
      process.exit(exitCode);

    } else if (args[0] === '--fix') {
      const filePath = args[1];
      if (!filePath) {
        console.error('❌ Error: File path required for --fix');
        process.exit(2);
      }
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: File not found: ${filePath}`);
        process.exit(2);
      }

      const suggestions = validator.generateFixSuggestions(filePath);
      console.log(suggestions);
      process.exit(0);

    } else {
      // Validate single file
      const filePath = args[0];
      if (!fs.existsSync(filePath)) {
        console.error(`❌ Error: File not found: ${filePath}`);
        process.exit(2);
      }

      const result = validator.validateFile(filePath);
      console.log(`\n📄 ${result.filename}: ${result.type.toUpperCase()}`);

      if (result.checks) {
        console.log('');
        console.log('Checks:');
        Object.entries(result.checks).forEach(([check, passed]) => {
          const icon = passed ? '✅' : '❌';
          console.log(`  ${icon} ${check}`);
        });
      }

      if (result.issues) {
        console.log('');
        console.log('Issues:');
        result.issues.forEach(issue => console.log(`  - ${issue}`));
        console.log('');
        console.log('💡 Run with --fix to get suggestions:');
        console.log(`   node validate-pdf-integration.js --fix ${filePath}`);
      }

      process.exit(result.type === 'passed' ? 0 : 1);
    }

  } catch (error) {
    console.error('❌ Validation error:', error.message);
    console.error(error.stack);
    process.exit(2);
  }
}

module.exports = PDFIntegrationValidator;
