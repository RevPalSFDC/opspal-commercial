#!/usr/bin/env node

/**
 * N+1 Query Pattern Detector
 *
 * Analyzes JavaScript files for potential N+1 query patterns using AST analysis.
 *
 * N+1 Pattern: Making N separate queries inside a loop instead of 1 batch query.
 *
 * Detection Strategy:
 * - Parse JavaScript into Abstract Syntax Tree (AST)
 * - Find loops (for, forEach, map, etc.)
 * - Check if loop body contains await + query patterns
 * - Score severity based on query type and context
 *
 * Usage:
 *   node scripts/detect-n-plus-1-patterns.js [path]                    # Scan path
 *   node scripts/detect-n-plus-1-patterns.js [path] --fix              # Show fix suggestions
 *   node scripts/detect-n-plus-1-patterns.js [path] --severity high    # Filter by severity
 *
 * Exit Codes:
 *   0 - No issues found
 *   1 - Issues found (check report)
 *   2 - Script error
 */

const fs = require('fs');
const path = require('path');

// Check if Babel is available (will install if not)
let parse, traverse;
try {
  const babelParser = require('@babel/parser');
  const babelTraverse = require('@babel/traverse');
  parse = babelParser.parse;
  traverse = babelTraverse.default || babelTraverse;
} catch (error) {
  console.error('❌ Required dependencies not found.');
  console.error('   Installing @babel/parser and @babel/traverse...');
  console.error('');
  console.error('   Run: npm install --save-dev @babel/parser @babel/traverse');
  console.error('   Then try again.');
  process.exit(2);
}

// Patterns indicating potential queries
const QUERY_PATTERNS = [
  'query', 'select', 'insert', 'update', 'delete',
  'fetch', 'request', 'get', 'post', 'put', 'patch',
  'mcp__supabase', 'mcp__asana', 'mcp__',
  'supabase', 'makeRequest', 'callAPI', 'apiCall',
  'from(', '.eq(', '.in(', '.match(',
  'findOne', 'findMany', 'findUnique'
];

// Loop types to check
const LOOP_TYPES = [
  'ForStatement',
  'ForOfStatement',
  'ForInStatement',
  'WhileStatement',
  'DoWhileStatement'
];

// Array iteration methods
const ITERATION_METHODS = [
  'forEach', 'map', 'filter', 'reduce', 'find', 'some', 'every',
  'flatMap', 'findIndex'
];

/**
 * Analyze a single file for N+1 patterns
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const findings = [];

  try {
    // Parse JavaScript
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true
    });

    // Traverse AST looking for patterns
    traverse(ast, {
      // Check traditional loops
      ForStatement(nodePath) {
        checkLoopForNPlusOne(nodePath, filePath, content, findings);
      },
      ForOfStatement(nodePath) {
        checkLoopForNPlusOne(nodePath, filePath, content, findings);
      },
      ForInStatement(nodePath) {
        checkLoopForNPlusOne(nodePath, filePath, content, findings);
      },
      WhileStatement(nodePath) {
        checkLoopForNPlusOne(nodePath, filePath, content, findings);
      },
      DoWhileStatement(nodePath) {
        checkLoopForNPlusOne(nodePath, filePath, content, findings);
      },

      // Check array iteration methods
      CallExpression(nodePath) {
        const { callee } = nodePath.node;
        if (callee.type === 'MemberExpression') {
          const methodName = callee.property?.name;
          if (ITERATION_METHODS.includes(methodName)) {
            checkIterationMethodForNPlusOne(nodePath, filePath, content, findings);
          }
        }
      }
    });

  } catch (error) {
    // Parsing error - skip file with note
    return {
      filePath,
      findings: [],
      error: `Parse error: ${error.message}`,
      skipped: true
    };
  }

  return { filePath, findings, error: null, skipped: false };
}

/**
 * Check if loop contains potential N+1 pattern
 */
function checkLoopForNPlusOne(nodePath, filePath, content, findings) {
  let hasAwait = false;
  let hasQuery = false;
  let queryDetails = [];

  // Traverse the loop body
  nodePath.traverse({
    AwaitExpression(innerPath) {
      hasAwait = true;

      // Get the code being awaited
      const awaitedCode = getCodeSnippet(innerPath.node.argument, content);

      // Check if it matches query patterns
      const matchedPattern = QUERY_PATTERNS.find(pattern =>
        awaitedCode.toLowerCase().includes(pattern.toLowerCase())
      );

      if (matchedPattern) {
        hasQuery = true;
        queryDetails.push({
          line: innerPath.node.loc?.start.line,
          pattern: matchedPattern,
          code: awaitedCode.substring(0, 60) + (awaitedCode.length > 60 ? '...' : '')
        });
      }
    }
  });

  if (hasAwait && hasQuery) {
    const loopType = nodePath.node.type.replace('Statement', '');
    const severity = calculateSeverity(queryDetails);

    findings.push({
      type: 'loop_with_await_query',
      loopType: loopType,
      severity: severity,
      line: nodePath.node.loc?.start.line,
      queryLine: queryDetails[0]?.line,
      queryPattern: queryDetails[0]?.pattern,
      queryCode: queryDetails[0]?.code,
      description: `${loopType} loop with awaited ${queryDetails[0]?.pattern} - potential N+1 pattern`,
      fixSuggestion: generateFixSuggestion(queryDetails[0]?.pattern)
    });
  }
}

/**
 * Check array iteration methods for N+1 patterns
 */
function checkIterationMethodForNPlusOne(nodePath, filePath, content, findings) {
  const callback = nodePath.node.arguments[0];
  const methodName = nodePath.node.callee.property?.name;

  if (!callback ||
      (callback.type !== 'ArrowFunctionExpression' &&
       callback.type !== 'FunctionExpression')) {
    return;
  }

  let hasAwait = false;
  let hasQuery = false;
  let queryDetails = null;

  // Create a new traversal context for the callback
  const callbackPath = nodePath.get('arguments.0');
  if (!callbackPath || !callbackPath.traverse) return;

  callbackPath.traverse({
    AwaitExpression(innerPath) {
      hasAwait = true;

      const awaitedCode = getCodeSnippet(innerPath.node.argument, content);
      const matchedPattern = QUERY_PATTERNS.find(pattern =>
        awaitedCode.toLowerCase().includes(pattern.toLowerCase())
      );

      if (matchedPattern) {
        hasQuery = true;
        queryDetails = {
          line: innerPath.node.loc?.start.line,
          pattern: matchedPattern,
          code: awaitedCode.substring(0, 60) + (awaitedCode.length > 60 ? '...' : '')
        };
      }
    }
  });

  if (hasAwait && hasQuery) {
    const severity = calculateSeverity([queryDetails]);

    findings.push({
      type: 'iteration_method_with_query',
      loopType: methodName,
      severity: severity,
      line: nodePath.node.loc?.start.line,
      queryLine: queryDetails?.line,
      queryPattern: queryDetails?.pattern,
      queryCode: queryDetails?.code,
      description: `${methodName}() with awaited ${queryDetails?.pattern} - potential N+1 pattern`,
      fixSuggestion: generateFixSuggestion(queryDetails?.pattern, methodName)
    });
  }
}

/**
 * Extract code snippet from AST node
 */
function getCodeSnippet(node, fullContent) {
  if (!node || !node.loc) return '';

  try {
    const lines = fullContent.split('\n');
    const startLine = node.loc.start.line - 1;
    const endLine = node.loc.end.line - 1;

    if (startLine === endLine) {
      const line = lines[startLine];
      return line.substring(node.loc.start.column, node.loc.end.column);
    } else {
      // Multi-line expression
      const snippet = lines.slice(startLine, endLine + 1).join(' ');
      return snippet.substring(0, 200);
    }
  } catch (error) {
    return '';
  }
}

/**
 * Calculate severity based on query patterns
 */
function calculateSeverity(queryDetails) {
  if (!queryDetails || queryDetails.length === 0) return 'LOW';

  const pattern = queryDetails[0]?.pattern?.toLowerCase() || '';
  const code = queryDetails[0]?.code?.toLowerCase() || '';

  // CRITICAL: Direct MCP database queries
  if (pattern.includes('mcp__supabase') || pattern.includes('mcp__asana')) {
    return 'CRITICAL';
  }

  // HIGH: Supabase client with .eq (single-record lookup pattern)
  if (code.includes('.from(') && code.includes('.eq(')) {
    return 'HIGH';
  }

  // HIGH: Direct database operations
  if (pattern.includes('select') || pattern.includes('insert') ||
      pattern.includes('update') || pattern.includes('delete')) {
    return 'HIGH';
  }

  // MEDIUM: API calls
  if (pattern.includes('fetch') || pattern.includes('request') ||
      pattern.includes('get') || pattern.includes('post')) {
    return 'MEDIUM';
  }

  // LOW: Generic await in loop (might not be query-related)
  return 'LOW';
}

/**
 * Generate fix suggestion based on pattern
 */
function generateFixSuggestion(pattern, loopType = 'for') {
  if (!pattern) return 'Review and optimize if querying in loop';

  const p = pattern.toLowerCase();

  if (p.includes('mcp__supabase') || p.includes('.eq(')) {
    return 'Use WHERE IN clause or .in() method to batch query';
  }

  if (p.includes('mcp__asana')) {
    return 'Check if Asana has batch API, or use Promise.all for parallel calls';
  }

  if (p.includes('select') || p.includes('query')) {
    return 'Batch queries using IN clause or preload data before loop';
  }

  if (loopType === 'forEach' || loopType === 'map') {
    return 'Use Promise.all() to parallelize independent operations';
  }

  return 'Consider batching or parallelizing operations';
}

/**
 * Scan directory recursively
 */
function scanDirectory(dir, fileFilter = /\.js$/) {
  const results = [];

  function scan(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip common non-code directories
        const skipDirs = [
          'node_modules', '.git', 'dist', 'build', '.temp',
          'backups', 'instances', 'execution-logs', 'coverage'
        ];

        if (!skipDirs.includes(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.isFile() && fileFilter.test(entry.name)) {
        const analysis = analyzeFile(fullPath);
        results.push(analysis);
      }
    }
  }

  scan(dir);
  return results;
}

/**
 * Generate comprehensive report
 */
function generateReport(results, options = {}) {
  console.log('');
  console.log('🔍 N+1 Query Pattern Detection Report');
  console.log('=====================================');
  console.log('');

  const allFindings = [];
  const skippedFiles = [];
  const bySeverity = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: []
  };

  // Collect and categorize findings
  results.forEach(result => {
    if (result.skipped) {
      skippedFiles.push(result);
      return;
    }

    if (result.findings.length > 0) {
      result.findings.forEach(finding => {
        const enriched = { ...finding, file: result.filePath };
        allFindings.push(enriched);
        bySeverity[finding.severity].push(enriched);
      });
    }
  });

  // Filter by severity if requested
  const severityFilter = options.severity?.toUpperCase();
  const displayFindings = severityFilter
    ? allFindings.filter(f => f.severity === severityFilter)
    : allFindings;

  // Print findings by severity
  const severitiesToShow = severityFilter
    ? [severityFilter]
    : ['CRITICAL', 'HIGH', 'MEDIUM'];

  severitiesToShow.forEach(severity => {
    const findings = bySeverity[severity];
    if (findings.length === 0) return;

    const icon = {
      CRITICAL: '🔴',
      HIGH: '🚨',
      MEDIUM: '⚠️',
      LOW: '🟡'
    }[severity];

    console.log(`${icon} ${severity} SEVERITY (${findings.length} issues)`);
    console.log('');

    findings.forEach((finding, index) => {
      const relPath = path.relative(process.cwd(), finding.file);
      console.log(`${index + 1}. ${relPath}:${finding.line}`);
      console.log(`   ${finding.description}`);

      if (finding.loopType) {
        console.log(`   Loop type: ${finding.loopType}`);
      }

      if (finding.queryCode) {
        console.log(`   Query: ${finding.queryCode}`);
      }

      if (options.fix && finding.fixSuggestion) {
        console.log(`   💡 Fix: ${finding.fixSuggestion}`);
      }

      console.log('');
    });
  });

  // Show LOW severity count (but don't print details unless requested)
  if (!severityFilter && bySeverity.LOW.length > 0) {
    console.log(`🟡 LOW SEVERITY (${bySeverity.LOW.length} issues - not shown)`);
    console.log('   Use --severity low to see these');
    console.log('');
  }

  // Summary
  console.log('==================================================');
  console.log('📊 Summary:');
  console.log(`   Total files scanned: ${results.length}`);
  console.log(`   Files with issues: ${results.filter(r => r.findings?.length > 0).length}`);
  console.log(`   Files skipped (parse errors): ${skippedFiles.length}`);
  console.log(`   Total findings: ${allFindings.length}`);
  console.log(`   Critical: ${bySeverity.CRITICAL.length}`);
  console.log(`   High severity: ${bySeverity.HIGH.length}`);
  console.log(`   Medium severity: ${bySeverity.MEDIUM.length}`);
  console.log(`   Low severity: ${bySeverity.LOW.length}`);
  console.log('');

  // Save detailed report
  const reportDir = './reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, 'n-plus-1-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_files: results.length,
      files_with_issues: results.filter(r => r.findings?.length > 0).length,
      files_skipped: skippedFiles.length,
      total_findings: allFindings.length,
      critical: bySeverity.CRITICAL.length,
      high_severity: bySeverity.HIGH.length,
      medium_severity: bySeverity.MEDIUM.length,
      low_severity: bySeverity.LOW.length
    },
    findings_by_severity: bySeverity,
    all_findings: allFindings,
    skipped_files: skippedFiles.map(f => ({ file: f.filePath, error: f.error }))
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Detailed report saved: ${reportPath}`);
  console.log('');

  // Recommendations
  if (bySeverity.CRITICAL.length > 0 || bySeverity.HIGH.length > 0) {
    console.log('🎯 Next steps:');
    console.log('  1. Review CRITICAL and HIGH severity issues first');
    console.log('  2. For each issue, consider:');
    console.log('     • Can queries be batched? (WHERE IN, .in() method)');
    console.log('     • Can operations run in parallel? (Promise.all)');
    console.log('     • Is the loop actually needed?');
    console.log('  3. See docs/MCP_USAGE_GUIDE.md#performance for fix patterns');
    console.log('  4. Run with --fix flag to see specific suggestions');
    console.log('');
  }

  return allFindings.length;
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  const options = {
    path: '.claude-plugins',
    fix: false,
    severity: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--fix') {
      options.fix = true;
    } else if (arg === '--severity') {
      options.severity = args[++i];
    } else if (!arg.startsWith('--')) {
      options.path = arg;
    }
  }

  return options;
}

/**
 * Show help
 */
function showHelp() {
  console.log('');
  console.log('N+1 Query Pattern Detector');
  console.log('==========================');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/detect-n-plus-1-patterns.js [path] [options]');
  console.log('');
  console.log('Options:');
  console.log('  --fix              Show fix suggestions for each issue');
  console.log('  --severity LEVEL   Filter by severity (critical, high, medium, low)');
  console.log('  --help, -h         Show this help');
  console.log('');
  console.log('Examples:');
  console.log('  # Scan all plugins');
  console.log('  node scripts/detect-n-plus-1-patterns.js .claude-plugins');
  console.log('');
  console.log('  # Show only critical issues with fixes');
  console.log('  node scripts/detect-n-plus-1-patterns.js .claude-plugins --severity critical --fix');
  console.log('');
  console.log('  # Scan specific plugin');
  console.log('  node scripts/detect-n-plus-1-patterns.js .claude-plugins/opspal-salesforce');
  console.log('');
  console.log('Output:');
  console.log('  • Console: Categorized findings by severity');
  console.log('  • File: ./reports/n-plus-1-report.json (detailed JSON)');
  console.log('');
  console.log('Exit codes:');
  console.log('  0 - No issues found');
  console.log('  1 - Issues found (check report)');
  console.log('  2 - Script error');
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const targetPath = options.path;

  console.log('');
  console.log('🔍 Scanning for N+1 query patterns...');
  console.log(`📁 Target: ${targetPath}`);
  console.log('');

  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Path not found: ${targetPath}`);
    process.exit(2);
  }

  // Scan directory
  const results = scanDirectory(targetPath);

  console.log(`✅ Scanned ${results.length} JavaScript files`);

  // Generate report
  const issueCount = generateReport(results, options);

  // Exit with appropriate code
  process.exit(issueCount > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(2);
});
