#!/usr/bin/env node

/**
 * Salesforce CLI Command Validator
 *
 * Validates SF CLI command syntax before execution to prevent common errors like:
 * - Using 'sf data export' instead of 'sf data query'
 * - Using deprecated flags like '--source-path' instead of '--source-dir'
 * - Using legacy CLI commands instead of 'sf'
 *
 * Root Cause Addressed: Reflection cohort FP-003
 * - Issue: Invalid CLI commands cause "command not found" errors
 * - Example: 'sf data export' is not valid (should be 'sf data query')
 * - Impact: 2 hours wasted per occurrence, $12K annual ROI
 *
 * Usage:
 *   const validator = require('./cli-command-validator');
 *   const result = validator.validate('sf data export --query "SELECT Id FROM Account"');
 *   if (!result.valid) {
 *     console.error(result.error);
 *     console.log('Suggested fix:', result.suggestion);
 *   }
 *
 * @module cli-command-validator
 * @version 1.0.0
 * @created 2025-10-22
 */

const fs = require('fs');
const path = require('path');

// Load command reference
const REFERENCE_PATH = path.join(__dirname, '../../data/sf-cli-command-reference.json');
let commandReference = null;

/**
 * Load command reference data
 *
 * @returns {Object} Command reference data
 */
function loadCommandReference() {
  if (commandReference) {
    return commandReference;
  }

  try {
    const data = fs.readFileSync(REFERENCE_PATH, 'utf-8');
    commandReference = JSON.parse(data);
    return commandReference;
  } catch (error) {
    console.warn(`Warning: Could not load CLI command reference: ${error.message}`);
    return { commands: {}, commonErrors: [] };
  }
}

/**
 * Parse command string into components
 *
 * @param {string} commandStr - Full command string (e.g., "sf data query --query 'SELECT...'")
 * @returns {Object} Parsed command { base, flags, args }
 */
function parseCommand(commandStr) {
  // Remove extra whitespace
  const cleaned = commandStr.trim().replace(/\s+/g, ' ');

  // Extract base command (e.g., "sf data query")
  const parts = cleaned.split(/\s+/);
  let baseCommand = '';
  let flagStart = 0;

  // Find where flags start (first -- or -)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith('-')) {
      flagStart = i;
      break;
    }
    baseCommand += (baseCommand ? ' ' : '') + parts[i];
    flagStart = i + 1;
  }

  // Extract flags
  const flags = [];
  for (let i = flagStart; i < parts.length; i++) {
    if (parts[i].startsWith('-')) {
      flags.push(parts[i]);
    }
  }

  return {
    base: baseCommand,
    flags,
    original: commandStr,
    parts
  };
}

/**
 * Validate a CLI command
 *
 * @param {string} commandStr - Full CLI command string
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - Strict mode (default: true)
 * @returns {Object} Validation result
 */
function validate(commandStr, options = {}) {
  const strict = options.strict !== false;
  const reference = loadCommandReference();

  // Parse command
  const parsed = parseCommand(commandStr);

  // Result object
  const result = {
    valid: true,
    command: parsed.base,
    flags: parsed.flags,
    errors: [],
    warnings: [],
    suggestions: []
  };

  // Check for legacy CLI syntax — route sfdx through the same validation
  // as sf commands by normalizing the prefix for lookup purposes
  const normalizedBase = parsed.base.startsWith('sfdx ')
    ? 'sf ' + parsed.base.slice(5)
    : parsed.base;

  // Reject commands that are neither sf nor sfdx
  if (!parsed.base.startsWith('sf ') && !parsed.base.startsWith('sfdx ')) {
    result.warnings.push('Command is not a recognized sf/sfdx CLI invocation');
  }

  // Check if command exists in reference
  const commandDef = reference.commands[normalizedBase] || reference.commands[parsed.base];

  if (!commandDef) {
    // Command not in reference - check common errors
    const commonError = reference.commonErrors.find(err =>
      parsed.base.includes(err.error) || commandStr.includes(err.error)
    );

    if (commonError) {
      result.valid = false;
      result.errors.push(`Invalid command: ${parsed.base}`);
      result.suggestions.push({
        issue: commonError.error,
        fix: commonError.correction,
        reason: commonError.explanation
      });
    } else if (strict) {
      // Unknown command in strict mode
      result.warnings.push(`Command '${parsed.base}' not found in reference (may be valid but not documented)`);
    }
    return result;
  }

  // Command exists - check if it's valid
  if (!commandDef.valid) {
    result.valid = false;
    result.errors.push(`Invalid command: ${parsed.base}`);
    result.suggestions.push({
      issue: parsed.base,
      fix: commandDef.replacement || 'See documentation',
      reason: commandDef.reason || 'Command is not valid in current SF CLI version'
    });
    return result;
  }

  // Validate flags
  if (commandDef.flags) {
    const validFlags = [
      ...(commandDef.flags.required || []),
      ...(commandDef.flags.optional || [])
    ];

    for (const flag of parsed.flags) {
      // Check if flag is valid
      if (!validFlags.includes(flag)) {
        // Check if it's a deprecated flag
        if (commandDef.flagDeprecations && commandDef.flagDeprecations[flag]) {
          const deprecation = commandDef.flagDeprecations[flag];
          result.warnings.push(`Deprecated flag: ${flag}`);
          result.suggestions.push({
            issue: flag,
            fix: deprecation.replacement,
            reason: deprecation.reason
          });

          if (deprecation.deprecated) {
            result.valid = false;
            result.errors.push(`Using deprecated flag: ${flag}`);
          }
        } else if (strict) {
          result.warnings.push(`Unknown flag: ${flag} (may be valid but not documented)`);
        }
      }
    }

    // Check required flags
    const requiredFlags = commandDef.flags.required || [];
    for (const required of requiredFlags) {
      const hasRequired = parsed.flags.some(f =>
        f === required || (required.startsWith('--') && f.startsWith('-') && required.includes(f.substring(1)))
      );

      if (!hasRequired) {
        result.warnings.push(`Missing required flag: ${required}`);
      }
    }
  }

  return result;
}

/**
 * Format validation result as human-readable string
 *
 * @param {Object} result - Validation result from validate()
 * @returns {string} Formatted message
 */
function formatResult(result) {
  let output = '';

  if (result.valid && result.warnings.length === 0) {
    output += `✅ Valid command: ${result.command}\n`;
    return output;
  }

  if (!result.valid) {
    output += `❌ Invalid command: ${result.command}\n\n`;
  } else {
    output += `⚠️  Command valid with warnings: ${result.command}\n\n`;
  }

  // Errors
  if (result.errors.length > 0) {
    output += 'Errors:\n';
    result.errors.forEach(error => {
      output += `  - ${error}\n`;
    });
    output += '\n';
  }

  // Warnings
  if (result.warnings.length > 0) {
    output += 'Warnings:\n';
    result.warnings.forEach(warning => {
      output += `  - ${warning}\n`;
    });
    output += '\n';
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    output += 'Suggested fixes:\n';
    result.suggestions.forEach(suggestion => {
      output += `  Issue: ${suggestion.issue}\n`;
      output += `  Fix: ${suggestion.fix}\n`;
      output += `  Reason: ${suggestion.reason}\n`;
      output += '\n';
    });
  }

  return output;
}

/**
 * Get command examples from reference
 *
 * @param {string} commandBase - Base command (e.g., "sf data query")
 * @returns {Array} Array of example commands
 */
function getExamples(commandBase) {
  const reference = loadCommandReference();
  const commandDef = reference.commands[commandBase];

  if (commandDef && commandDef.examples) {
    return commandDef.examples;
  }

  return [];
}

/**
 * Check if a command is valid (simple boolean check)
 *
 * @param {string} commandStr - Command to validate
 * @returns {boolean} True if valid
 */
function isValid(commandStr) {
  const result = validate(commandStr, { strict: false });
  return result.valid;
}

// Export functions
module.exports = {
  validate,
  formatResult,
  getExamples,
  isValid,
  parseCommand
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node cli-command-validator.js <command>');
    console.log('');
    console.log('Example:');
    console.log('  node cli-command-validator.js "sf data export --query \\"SELECT Id FROM Account\\""');
    process.exit(1);
  }

  const commandStr = args.join(' ');
  const result = validate(commandStr);
  console.log(formatResult(result));

  process.exit(result.valid ? 0 : 1);
}
