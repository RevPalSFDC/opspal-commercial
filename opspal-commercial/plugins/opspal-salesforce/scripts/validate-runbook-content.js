#!/usr/bin/env node

/**
 * Flow XML Development Runbooks - Content Validator
 *
 * Validates:
 * - Internal links within runbooks
 * - File path references to scripts/tools
 * - CLI command references
 * - XML examples (basic syntax check)
 * - Code block syntax
 * - Cross-references between runbooks
 *
 * Usage: node scripts/validate-runbook-content.js [--verbose]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const RUNBOOK_DIR = path.join(__dirname, '../docs/runbooks/flow-xml-development');
const PLUGIN_ROOT = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

// Color output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

// Validation results
const results = {
  totalChecks: 0,
  passed: 0,
  warnings: 0,
  errors: 0,
  details: []
};

/**
 * Log message with color
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Add validation result
 */
function addResult(type, category, message, file = null) {
  results.totalChecks++;

  const result = { type, category, message, file };
  results.details.push(result);

  if (type === 'pass') {
    results.passed++;
    if (VERBOSE) log(`  ✓ ${message}`, 'green');
  } else if (type === 'warn') {
    results.warnings++;
    log(`  ⚠ ${message}`, 'yellow');
    if (file) log(`    File: ${file}`, 'yellow');
  } else if (type === 'error') {
    results.errors++;
    log(`  ✗ ${message}`, 'red');
    if (file) log(`    File: ${file}`, 'red');
  }
}

/**
 * Get all runbook files
 */
function getRunbookFiles() {
  const files = fs.readdirSync(RUNBOOK_DIR)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .map(f => path.join(RUNBOOK_DIR, f));

  return files;
}

/**
 * Read runbook content
 */
function readRunbook(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Check internal markdown links
 */
function validateInternalLinks(content, filePath) {
  const fileName = path.basename(filePath);
  log(`\n📎 Validating internal links in ${fileName}...`, 'cyan');

  // Find all markdown links [text](#anchor)
  const linkRegex = /\[([^\]]+)\]\(#([^)]+)\)/g;
  const links = [...content.matchAll(linkRegex)];

  if (links.length === 0) {
    addResult('warn', 'links', `No internal anchor links found in ${fileName}`, filePath);
    return;
  }

  // Find all heading anchors in the document
  const headingRegex = /^#+\s+(.+)$/gm;
  const headings = [...content.matchAll(headingRegex)];
  const anchors = headings.map(h => {
    // Convert heading to anchor format (lowercase, replace spaces with hyphens)
    return h[1].toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  });

  // Check each link
  links.forEach(match => {
    const linkText = match[1];
    const anchor = match[2];

    if (anchors.includes(anchor)) {
      addResult('pass', 'links', `Valid link: [${linkText}](#${anchor})`, fileName);
    } else {
      addResult('error', 'links', `Broken link: [${linkText}](#${anchor}) - anchor not found`, filePath);
    }
  });
}

/**
 * Check file path references
 */
function validateFilePathReferences(content, filePath) {
  const fileName = path.basename(filePath);
  log(`\n📁 Validating file path references in ${fileName}...`, 'cyan');

  // Find references to scripts, CLI, agents
  const pathPatterns = [
    /scripts\/lib\/([a-z-]+\.js)/g,
    /cli\/([a-z-]+\.js)/g,
    /agents\/([a-z-]+\.md)/g,
    /hooks\/([a-z-]+\.sh)/g,
    /templates\/([a-z-\/]+\.xml)/g
  ];

  let foundPaths = 0;

  pathPatterns.forEach(pattern => {
    const matches = [...content.matchAll(pattern)];

    matches.forEach(match => {
      const relativePath = match[0];
      const fullPath = path.join(PLUGIN_ROOT, relativePath);

      foundPaths++;

      if (fs.existsSync(fullPath)) {
        addResult('pass', 'paths', `File exists: ${relativePath}`, fileName);
      } else {
        addResult('error', 'paths', `File not found: ${relativePath}`, filePath);
      }
    });
  });

  if (foundPaths === 0) {
    addResult('warn', 'paths', `No file path references found in ${fileName}`, filePath);
  }
}

/**
 * Check CLI command references
 */
function validateCLICommands(content, filePath) {
  const fileName = path.basename(filePath);
  log(`\n💻 Validating CLI command references in ${fileName}...`, 'cyan');

  // Find CLI command references
  const cliPatterns = [
    /flow runbook/g,
    /flow create/g,
    /flow validate/g,
    /flow deploy/g,
    /flow add/g,
    /flow batch/g
  ];

  let foundCommands = 0;

  cliPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      foundCommands += matches.length;
      addResult('pass', 'cli', `Found ${matches.length} references to "${pattern.source}"`, fileName);
    }
  });

  if (foundCommands === 0) {
    addResult('warn', 'cli', `No CLI command references found in ${fileName}`, filePath);
  } else {
    log(`  Total CLI commands referenced: ${foundCommands}`, 'green');
  }
}

/**
 * Check XML code blocks
 */
function validateXMLExamples(content, filePath) {
  const fileName = path.basename(filePath);
  log(`\n🔖 Validating XML code blocks in ${fileName}...`, 'cyan');

  // Find XML code blocks
  const xmlBlockRegex = /```xml\n([\s\S]*?)\n```/g;
  const xmlBlocks = [...content.matchAll(xmlBlockRegex)];

  if (xmlBlocks.length === 0) {
    addResult('warn', 'xml', `No XML code blocks found in ${fileName}`, filePath);
    return;
  }

  xmlBlocks.forEach((match, index) => {
    const xmlContent = match[1];

    // Basic XML syntax checks
    const checks = [
      { test: /<\?xml version=/, message: 'XML declaration present' },
      { test: /<Flow xmlns=/, message: 'Flow root element with namespace' },
      { test: /<\/Flow>/, message: 'Closing Flow tag' }
    ];

    let blockValid = true;

    checks.forEach(check => {
      if (!check.test.test(xmlContent)) {
        blockValid = false;
        addResult('warn', 'xml', `XML block ${index + 1}: Missing ${check.message}`, filePath);
      }
    });

    if (blockValid) {
      addResult('pass', 'xml', `XML block ${index + 1}: Valid structure`, fileName);
    }
  });

  log(`  Total XML blocks: ${xmlBlocks.length}`, 'green');
}

/**
 * Check code block syntax
 */
function validateCodeBlocks(content, filePath) {
  const fileName = path.basename(filePath);
  log(`\n💾 Validating code blocks in ${fileName}...`, 'cyan');

  // Find all code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
  const codeBlocks = [...content.matchAll(codeBlockRegex)];

  if (codeBlockRegex.length === 0) {
    addResult('warn', 'code', `No code blocks found in ${fileName}`, filePath);
    return;
  }

  const languages = {};

  codeBlocks.forEach((match, index) => {
    const language = match[1] || 'plain';
    const code = match[2];

    languages[language] = (languages[language] || 0) + 1;

    // Check for common issues
    if (code.trim().length === 0) {
      addResult('warn', 'code', `Code block ${index + 1} (${language}): Empty code block`, filePath);
    } else {
      addResult('pass', 'code', `Code block ${index + 1} (${language}): Contains code`, fileName);
    }
  });

  log(`  Total code blocks: ${codeBlocks.length}`, 'green');
  log(`  Languages: ${Object.keys(languages).join(', ')}`, 'cyan');
}

/**
 * Check cross-references between runbooks
 */
function validateCrossReferences(content, filePath) {
  const fileName = path.basename(filePath);
  log(`\n🔗 Validating cross-references in ${fileName}...`, 'cyan');

  // Find references to other runbooks
  const runbookRefRegex = /Runbook (\d)/g;
  const refs = [...content.matchAll(runbookRefRegex)];

  if (refs.length === 0) {
    addResult('warn', 'xref', `No cross-references to other runbooks found in ${fileName}`, filePath);
    return;
  }

  refs.forEach(match => {
    const runbookNum = parseInt(match[1]);

    if (runbookNum >= 1 && runbookNum <= 6) {
      addResult('pass', 'xref', `Valid reference to Runbook ${runbookNum}`, fileName);
    } else {
      addResult('error', 'xref', `Invalid runbook number: Runbook ${runbookNum}`, filePath);
    }
  });

  log(`  Total cross-references: ${refs.length}`, 'green');
}

/**
 * Main validation function
 */
function validateRunbooks() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Flow XML Development Runbooks - Content Validation', 'cyan');
  log('='.repeat(80) + '\n', 'cyan');

  const runbookFiles = getRunbookFiles();

  log(`Found ${runbookFiles.length} runbook files to validate\n`, 'cyan');

  runbookFiles.forEach(filePath => {
    const content = readRunbook(filePath);

    // Run all validations
    validateInternalLinks(content, filePath);
    validateFilePathReferences(content, filePath);
    validateCLICommands(content, filePath);
    validateXMLExamples(content, filePath);
    validateCodeBlocks(content, filePath);
    validateCrossReferences(content, filePath);
  });

  // Print summary
  log('\n' + '='.repeat(80), 'cyan');
  log('Validation Summary', 'cyan');
  log('='.repeat(80), 'cyan');

  log(`\nTotal checks: ${results.totalChecks}`, 'cyan');
  log(`✓ Passed: ${results.passed}`, 'green');
  log(`⚠ Warnings: ${results.warnings}`, 'yellow');
  log(`✗ Errors: ${results.errors}`, 'red');

  // Group results by category
  const categories = {};
  results.details.forEach(result => {
    if (!categories[result.category]) {
      categories[result.category] = { pass: 0, warn: 0, error: 0 };
    }
    categories[result.category][result.type]++;
  });

  log('\nBy Category:', 'cyan');
  Object.keys(categories).forEach(category => {
    const stats = categories[category];
    log(`  ${category}: ${stats.pass} passed, ${stats.warn} warnings, ${stats.error} errors`, 'cyan');
  });

  // Exit code
  const exitCode = results.errors > 0 ? 1 : 0;

  if (exitCode === 0) {
    log('\n✅ All validations passed!', 'green');
  } else {
    log('\n❌ Validation failed with errors', 'red');
  }

  log('\n' + '='.repeat(80) + '\n', 'cyan');

  return exitCode;
}

// Run validation
const exitCode = validateRunbooks();
process.exit(exitCode);
