#!/usr/bin/env node

/**
 * Fix Invalid Reflections Migration Script
 *
 * Purpose: Find and fix reflection files with validation issues
 * Usage: node scripts/lib/fix-invalid-reflections.js [options]
 *
 * Features:
 * - Finds reflection files with empty issues arrays
 * - Adds default "no-issues" entry for empty arrays
 * - Validates summary field exists
 * - Creates backup before modifying
 * - Provides dry-run mode for safe testing
 *
 * Options:
 *   --dry-run           Preview changes without modifying files
 *   --delete-invalid    Delete invalid files instead of fixing
 *   --backup-dir=PATH   Custom backup directory (default: ./reflection-backups)
 *   --verbose           Show detailed output
 *   --help              Show usage information
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error
 *
 * Version: 1.0.0
 * Date: 2025-12-16
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for output
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';
const RESET = '\x1b[0m';

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    dryRun: false,
    deleteInvalid: false,
    backupDir: './reflection-backups',
    verbose: false,
    help: false
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--delete-invalid') {
      flags.deleteInvalid = true;
    } else if (arg.startsWith('--backup-dir=')) {
      flags.backupDir = arg.split('=')[1];
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    }
  }

  return flags;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Fix Invalid Reflections Migration Script');
  console.log('');
  console.log('Usage: fix-invalid-reflections.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run           Preview changes without modifying files');
  console.log('  --delete-invalid    Delete invalid files instead of fixing');
  console.log('  --backup-dir=PATH   Custom backup directory (default: ./reflection-backups)');
  console.log('  --verbose           Show detailed output');
  console.log('  --help              Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node fix-invalid-reflections.js --dry-run');
  console.log('  node fix-invalid-reflections.js --verbose');
  console.log('  node fix-invalid-reflections.js --delete-invalid --dry-run');
}

/**
 * Find all reflection files
 */
function findReflectionFiles() {
  const searchPaths = [
    path.join(process.cwd(), '.claude'),
    path.join(process.env.HOME || process.env.USERPROFILE || '~', '.claude'),
    path.join(process.cwd(), 'instances')
  ];

  const files = [];

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;

    try {
      const findCommand = `find "${searchPath}" -name "SESSION_REFLECTION_*.json" -type f 2>/dev/null`;
      const output = execSync(findCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const foundFiles = output.trim().split('\n').filter(Boolean);
      files.push(...foundFiles);
    } catch (err) {
      // Ignore errors (path might not exist or find might fail)
    }
  }

  return [...new Set(files)]; // Remove duplicates
}

/**
 * Validate reflection file
 */
function validateReflection(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const reflection = JSON.parse(content);

    const issues = [];

    // Check for summary
    if (!reflection.summary) {
      issues.push('missing_summary');
    }

    // Check for issues array
    const hasIssues = reflection.issues || reflection.issues_identified;
    if (!hasIssues) {
      issues.push('missing_issues_field');
    } else if (Array.isArray(hasIssues) && hasIssues.length === 0) {
      issues.push('empty_issues_array');
    } else if (!Array.isArray(hasIssues)) {
      issues.push('invalid_issues_format');
    }

    return {
      valid: issues.length === 0,
      issues,
      reflection
    };
  } catch (err) {
    return {
      valid: false,
      issues: ['parse_error'],
      error: err.message
    };
  }
}

/**
 * Fix reflection file
 */
function fixReflection(filePath, reflection, issues, options) {
  const fixed = { ...reflection };

  // Fix missing summary
  if (issues.includes('missing_summary')) {
    fixed.summary = 'Session reflection (auto-generated summary)';
    console.log(`${YELLOW}   Fixed: Added default summary${RESET}`);
  }

  // Fix missing issues field
  if (issues.includes('missing_issues_field')) {
    fixed.issues = [];
    fixed.issues_identified = [];
    console.log(`${YELLOW}   Fixed: Added empty issues array${RESET}`);
  }

  // Fix empty issues array (add placeholder)
  if (issues.includes('empty_issues_array')) {
    const placeholder = {
      id: 'no_issues',
      taxonomy: 'success',
      reproducible_trigger: 'N/A - Error-free session',
      root_cause: 'No errors encountered during session',
      minimal_patch: 'N/A',
      agnostic_fix: 'N/A',
      blast_radius: 'NONE',
      priority: 'P3',
      resolution: 'Session completed successfully without errors',
      time_wasted_minutes: 0
    };

    fixed.issues = [placeholder];
    fixed.issues_identified = [placeholder];
    console.log(`${YELLOW}   Fixed: Added placeholder issue for error-free session${RESET}`);
  }

  // Fix invalid format
  if (issues.includes('invalid_issues_format')) {
    fixed.issues = [];
    fixed.issues_identified = [];
    console.log(`${YELLOW}   Fixed: Reset issues to empty array${RESET}`);
  }

  return fixed;
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${CYAN}🔧 Fix Invalid Reflections Migration${RESET}`);
  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log('');

  if (options.dryRun) {
    console.log(`${YELLOW}⚠️  DRY RUN MODE - No files will be modified${RESET}`);
    console.log('');
  }

  // Find all reflection files
  console.log(`${CYAN}📁 Searching for reflection files...${RESET}`);
  const files = findReflectionFiles();
  console.log(`${GREEN}✓${RESET} Found ${files.length} reflection files`);
  console.log('');

  if (files.length === 0) {
    console.log('✅ No reflection files found');
    process.exit(0);
  }

  // Validate and process each file
  const results = {
    valid: 0,
    fixed: 0,
    deleted: 0,
    errors: 0
  };

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const validation = validateReflection(filePath);

    if (validation.valid) {
      results.valid++;
      if (options.verbose) {
        console.log(`${GREEN}✓${RESET} ${fileName} - Valid`);
      }
      continue;
    }

    console.log(`${YELLOW}⚠${RESET} ${fileName}`);
    console.log(`${GRAY}   Path: ${filePath}${RESET}`);
    console.log(`${RED}   Issues: ${validation.issues.join(', ')}${RESET}`);

    if (validation.issues.includes('parse_error')) {
      console.log(`${RED}   Error: ${validation.error}${RESET}`);
      results.errors++;
      console.log('');
      continue;
    }

    // Handle invalid file
    if (options.deleteInvalid) {
      if (!options.dryRun) {
        fs.unlinkSync(filePath);
      }
      console.log(`${RED}   Action: Deleted${RESET}`);
      results.deleted++;
    } else {
      // Fix the reflection
      const fixed = fixReflection(filePath, validation.reflection, validation.issues, options);

      if (!options.dryRun) {
        // Create backup
        const backupDir = path.resolve(options.backupDir);
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupPath = path.join(backupDir, fileName);
        fs.copyFileSync(filePath, backupPath);

        // Write fixed version
        fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2), 'utf8');
        console.log(`${GREEN}   Action: Fixed (backup: ${backupPath})${RESET}`);
      } else {
        console.log(`${GREEN}   Action: Would fix${RESET}`);
      }

      results.fixed++;
    }

    console.log('');
  }

  // Print summary
  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${CYAN}📊 Summary${RESET}`);
  console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log('');
  console.log(`${GREEN}✓${RESET} Valid:   ${results.valid}`);
  console.log(`${YELLOW}⚠${RESET} Fixed:   ${results.fixed}`);
  if (options.deleteInvalid) {
    console.log(`${RED}✗${RESET} Deleted: ${results.deleted}`);
  }
  if (results.errors > 0) {
    console.log(`${RED}!${RESET} Errors:  ${results.errors}`);
  }
  console.log('');

  if (options.dryRun && (results.fixed > 0 || results.deleted > 0)) {
    console.log(`${YELLOW}💡 Tip: Remove --dry-run to apply changes${RESET}`);
    console.log('');
  }

  console.log('✅ Migration complete');
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error(`${RED}❌ Error:${RESET}`, err.message);
    process.exit(1);
  });
}

module.exports = { findReflectionFiles, validateReflection, fixReflection };
