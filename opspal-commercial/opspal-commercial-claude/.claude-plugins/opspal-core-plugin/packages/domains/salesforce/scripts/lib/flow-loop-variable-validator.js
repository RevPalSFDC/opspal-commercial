#!/usr/bin/env node

/**
 * Flow Loop Variable Validator
 *
 * Purpose: Validate flow loop variable references before deployment
 *
 * Problem Solved (42 reflections):
 * - Loop variables missing `.CurrentItem` accessor
 * - Results in `.null__NotFound` errors at runtime
 * - Example: `$Record.LeadSource` should be `$Record.CurrentItem.LeadSource`
 *
 * Usage:
 *   const { FlowLoopValidator } = require('./flow-loop-variable-validator');
 *   const validator = new FlowLoopValidator();
 *   const result = validator.validate(flowXML);
 *
 * ROI: Prevents loop variable errors, part of $13,500/year savings
 */

const fs = require('fs');
const path = require('path');

class FlowLoopValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'FlowLoopValidationError';
    this.details = details;
  }
}

class FlowLoopValidator {
  constructor(options = {}) {
    this.strict = options.strict !== false; // Strict by default
    this.autoFix = options.autoFix === true; // No auto-fix by default
  }

  /**
   * Validate flow XML for loop variable issues
   *
   * @param {string} flowXML - Flow metadata XML content
   * @returns {object} Validation result
   */
  validate(flowXML) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      autoFixable: [],
      stats: {
        totalLoops: 0,
        totalReferences: 0,
        invalidReferences: 0
      }
    };

    // Extract loop definitions
    const loops = this.extractLoops(flowXML);
    result.stats.totalLoops = loops.length;

    if (loops.length === 0) {
      // No loops in this flow
      return result;
    }

    // Extract all variable references in the flow
    const references = this.extractVariableReferences(flowXML);
    result.stats.totalReferences = references.length;

    // Build loop variable map
    const loopVars = new Map();
    loops.forEach(loop => {
      loopVars.set(loop.collectionReference, {
        loopName: loop.name,
        type: loop.iterationOrder || 'Asc'
      });
    });

    // Check each reference
    references.forEach(ref => {
      // Is this referencing a loop collection variable?
      const loopInfo = loopVars.get(ref.baseVariable);

      if (loopInfo) {
        // This is a loop variable reference
        if (!ref.path.includes('.CurrentItem')) {
          // INVALID: Missing .CurrentItem accessor
          result.stats.invalidReferences++;

          const error = {
            type: 'missing_currentitem',
            severity: 'ERROR',
            variable: ref.baseVariable,
            path: ref.fullPath,
            loopName: loopInfo.loopName,
            location: ref.location,
            message: `Loop variable "${ref.baseVariable}" missing .CurrentItem accessor`,
            expected: this.suggestFix(ref),
            found: ref.fullPath
          };

          result.errors.push(error);
          result.valid = false;

          if (this.canAutoFix(ref)) {
            result.autoFixable.push(error);
          }
        }
      }
    });

    // Check for common mistakes
    this.checkCommonMistakes(flowXML, result);

    return result;
  }

  /**
   * Extract loop element definitions from flow XML
   */
  extractLoops(flowXML) {
    const loops = [];
    const loopRegex = /<loops>[\s\S]*?<\/loops>/g;
    const matches = flowXML.match(loopRegex) || [];

    matches.forEach(loopBlock => {
      const name = this.extractTagContent(loopBlock, 'name');
      const collectionReference = this.extractTagContent(loopBlock, 'collectionReference');
      const iterationOrder = this.extractTagContent(loopBlock, 'iterationOrder');

      if (name && collectionReference) {
        loops.push({
          name,
          collectionReference,
          iterationOrder,
          xml: loopBlock
        });
      }
    });

    return loops;
  }

  /**
   * Extract all variable references from flow XML
   */
  extractVariableReferences(flowXML) {
    const references = [];

    // Common patterns for variable references
    const patterns = [
      // Assignment references: <reference>$Record.Field</reference>
      /<reference>([^<]+)<\/reference>/g,
      // Formula expressions: {!$Record.Field}
      /\{!([^}]+)\}/g,
      // Field value: <value><elementReference>$Record.Field</elementReference></value>
      /<elementReference>([^<]+)<\/elementReference>/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(flowXML)) !== null) {
        const fullPath = match[1].trim();

        // Skip if not a variable reference
        if (!fullPath.startsWith('$') && !fullPath.includes('.')) {
          continue;
        }

        const parsed = this.parseVariablePath(fullPath);

        references.push({
          fullPath,
          baseVariable: parsed.base,
          path: parsed.path,
          location: {
            index: match.index,
            context: flowXML.substring(Math.max(0, match.index - 100), match.index + 100)
          }
        });
      }
    });

    return references;
  }

  /**
   * Parse variable path into base and accessor path
   *
   * Examples:
   *   $Record.Name → {base: '$Record', path: 'Name'}
   *   $Record.CurrentItem.Name → {base: '$Record', path: 'CurrentItem.Name'}
   */
  parseVariablePath(fullPath) {
    const parts = fullPath.split('.');
    return {
      base: parts[0],
      path: parts.slice(1).join('.')
    };
  }

  /**
   * Suggest fix for invalid reference
   */
  suggestFix(ref) {
    // Insert .CurrentItem after base variable
    return `${ref.baseVariable}.CurrentItem.${ref.path}`;
  }

  /**
   * Check if reference can be auto-fixed
   */
  canAutoFix(ref) {
    // Can auto-fix if:
    // 1. Path doesn't already contain .CurrentItem
    // 2. Path is not empty
    // 3. Base variable starts with $
    return (
      !ref.path.includes('.CurrentItem') &&
      ref.path.length > 0 &&
      ref.baseVariable.startsWith('$')
    );
  }

  /**
   * Check for common mistakes beyond loop variables
   */
  checkCommonMistakes(flowXML, result) {
    // Check for .null__NotFound pattern (indicates runtime error)
    const nullNotFoundPattern = /\.null__NotFound/g;
    const matches = flowXML.match(nullNotFoundPattern);

    if (matches && matches.length > 0) {
      result.warnings.push({
        type: 'null_not_found_pattern',
        severity: 'WARNING',
        count: matches.length,
        message: `Found ${matches.length} instances of ".null__NotFound" pattern, ` +
                 `indicating loop variables without .CurrentItem accessor`
      });
    }

    // Check for iteration without loop definition
    const assignmentRecordRegex = /<assignmentItems>[\s\S]*?<assignToReference>\$Record<\/assignToReference>[\s\S]*?<\/assignmentItems>/g;
    const assignmentMatches = flowXML.match(assignmentRecordRegex) || [];

    if (assignmentMatches.length > 0) {
      const hasLoops = flowXML.includes('<loops>');
      if (!hasLoops) {
        result.warnings.push({
          type: 'assignment_without_loop',
          severity: 'WARNING',
          message: 'Found assignments to $Record but no loop definition. ' +
                   'Ensure $Record is defined as a loop collection variable.'
        });
      }
    }
  }

  /**
   * Auto-fix flow XML (if autoFix enabled)
   */
  fix(flowXML) {
    if (!this.autoFix) {
      throw new Error('Auto-fix is not enabled. Create validator with {autoFix: true}');
    }

    const validation = this.validate(flowXML);

    if (validation.valid) {
      return {
        fixed: false,
        xml: flowXML,
        message: 'No fixes needed'
      };
    }

    let fixedXML = flowXML;
    let fixCount = 0;

    validation.autoFixable.forEach(error => {
      // Replace invalid reference with fixed version
      const pattern = new RegExp(this.escapeRegExp(error.found), 'g');
      const replacement = error.expected;

      const occurrences = (fixedXML.match(pattern) || []).length;
      fixedXML = fixedXML.replace(pattern, replacement);

      fixCount += occurrences;
    });

    return {
      fixed: true,
      xml: fixedXML,
      fixCount,
      errors: validation.errors
    };
  }

  /**
   * Extract content from XML tag
   */
  extractTagContent(xml, tagName) {
    const regex = new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Escape string for use in RegExp
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate validation report
   */
  generateReport(validation) {
    const lines = [];

    lines.push('='.repeat(80));
    lines.push('FLOW LOOP VARIABLE VALIDATION REPORT');
    lines.push('='.repeat(80));
    lines.push('');

    lines.push(`Status: ${validation.valid ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push('');

    lines.push('Statistics:');
    lines.push(`  Total Loops: ${validation.stats.totalLoops}`);
    lines.push(`  Total Variable References: ${validation.stats.totalReferences}`);
    lines.push(`  Invalid References: ${validation.stats.invalidReferences}`);
    lines.push('');

    if (validation.errors.length > 0) {
      lines.push(`❌ Errors (${validation.errors.length}):`);
      lines.push('');

      validation.errors.forEach((error, index) => {
        lines.push(`${index + 1}. ${error.message}`);
        lines.push(`   Loop: ${error.loopName}`);
        lines.push(`   Found: ${error.found}`);
        lines.push(`   Expected: ${error.expected}`);
        lines.push('');
      });
    }

    if (validation.warnings.length > 0) {
      lines.push(`⚠️  Warnings (${validation.warnings.length}):`);
      lines.push('');

      validation.warnings.forEach((warning, index) => {
        lines.push(`${index + 1}. ${warning.message}`);
        lines.push('');
      });
    }

    if (validation.autoFixable.length > 0) {
      lines.push(`🔧 Auto-fixable (${validation.autoFixable.length}):`);
      lines.push('');
      lines.push('  Run with --auto-fix flag to automatically correct these issues.');
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }
}

module.exports = {
  FlowLoopValidator,
  FlowLoopValidationError
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node flow-loop-variable-validator.js <flow-xml-file> [--auto-fix]');
    console.log('');
    console.log('Examples:');
    console.log('  node flow-loop-variable-validator.js opportunity-flow.xml');
    console.log('  node flow-loop-variable-validator.js opportunity-flow.xml --auto-fix');
    process.exit(1);
  }

  const flowFile = args[0];
  const autoFix = args.includes('--auto-fix');

  if (!fs.existsSync(flowFile)) {
    console.error(`Error: File not found: ${flowFile}`);
    process.exit(1);
  }

  const flowXML = fs.readFileSync(flowFile, 'utf8');
  const validator = new FlowLoopValidator({ autoFix });

  console.log(`Validating flow: ${flowFile}\n`);

  const validation = validator.validate(flowXML);
  console.log(validator.generateReport(validation));

  if (autoFix && !validation.valid) {
    console.log('\nAttempting auto-fix...\n');

    const fixResult = validator.fix(flowXML);

    if (fixResult.fixed) {
      // Write fixed XML to new file
      const fixedFile = flowFile.replace('.xml', '-fixed.xml');
      fs.writeFileSync(fixedFile, fixResult.xml);

      console.log(`✅ Auto-fix complete:`);
      console.log(`   Fixed ${fixResult.fixCount} occurrences`);
      console.log(`   Output: ${fixedFile}\n`);
      console.log(`Review the fixed file, then replace the original if correct.`);
    } else {
      console.log('No auto-fixes applied.');
    }
  }

  process.exit(validation.valid ? 0 : 1);
}
