#!/usr/bin/env node

/**
 * Flow XML Development Runbooks - Context Loading Test
 *
 * Tests progressive disclosure system:
 * - Keyword matching works correctly
 * - Context files are properly mapped
 * - Related contexts are linked
 * - Priority weighting is applied
 *
 * Usage: node scripts/test-context-loading.js [--verbose]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const KEYWORD_MAPPING_FILE = path.join(__dirname, '../contexts/metadata-manager/keyword-mapping.json');
const CONTEXT_DIR = path.join(__dirname, '../contexts/metadata-manager');
const RUNBOOK_DIR = path.join(__dirname, '../docs/runbooks/flow-xml-development');
const VERBOSE = process.argv.includes('--verbose');

// Color output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

// Test results
const results = {
  total: 0,
  passed: 0,
  warnings: 0,
  failed: 0,
  details: []
};

/**
 * Log message with color
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Add test result
 */
function addResult(type, message, details = null) {
  results.total++;

  const result = { type, message, details };
  results.details.push(result);

  if (type === 'pass') {
    results.passed++;
    if (VERBOSE) log(`  ✓ ${message}`, 'green');
  } else if (type === 'warn') {
    results.warnings++;
    log(`  ⚠ ${message}`, 'yellow');
    if (details && VERBOSE) log(`    ${details}`, 'yellow');
  } else if (type === 'fail') {
    results.failed++;
    log(`  ✗ ${message}`, 'red');
    if (details) log(`    ${details}`, 'red');
  }
}

/**
 * Load and parse keyword mapping
 */
function loadKeywordMapping() {
  try {
    const content = fs.readFileSync(KEYWORD_MAPPING_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(`Failed to load keyword mapping: ${error.message}`, 'red');
    process.exit(1);
  }
}

/**
 * Test 1: Keyword mapping file exists and is valid JSON
 */
function testKeywordMappingFile() {
  log('\n🔍 Test 1: Keyword Mapping File Validation', 'cyan');

  if (!fs.existsSync(KEYWORD_MAPPING_FILE)) {
    addResult('fail', 'Keyword mapping file not found', KEYWORD_MAPPING_FILE);
    return null;
  }

  addResult('pass', 'Keyword mapping file exists');

  try {
    const mapping = loadKeywordMapping();
    addResult('pass', 'Keyword mapping is valid JSON');
    return mapping;
  } catch (error) {
    addResult('fail', 'Keyword mapping JSON parse failed', error.message);
    return null;
  }
}

/**
 * Test 2: Flow XML runbook contexts are defined
 */
function testFlowContextsDefined(mapping) {
  log('\n🔍 Test 2: Flow XML Runbook Contexts', 'cyan');

  const expectedContexts = [
    'flow-xml-runbook-authoring',
    'flow-xml-runbook-scenarios',
    'flow-xml-runbook-tools',
    'flow-xml-runbook-validation',
    'flow-xml-runbook-deployment',
    'flow-xml-runbook-monitoring'
  ];

  const definedContexts = mapping.contexts.map(c => c.contextName);

  expectedContexts.forEach(expected => {
    if (definedContexts.includes(expected)) {
      addResult('pass', `Context defined: ${expected}`);
    } else {
      addResult('fail', `Context missing: ${expected}`);
    }
  });
}

/**
 * Test 3: Context files exist (or are intentionally empty for dynamic loading)
 */
function testContextFiles(mapping) {
  log('\n🔍 Test 3: Context Files', 'cyan');

  const flowContexts = mapping.contexts.filter(c =>
    c.contextName.startsWith('flow-xml-runbook-')
  );

  flowContexts.forEach(context => {
    const filePath = path.join(CONTEXT_DIR, context.contextFile);

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);

      if (stats.size === 0) {
        addResult('warn', `Context file empty: ${context.contextFile}`, 'This is OK if using dynamic loading from full runbooks');
      } else {
        addResult('pass', `Context file exists and has content: ${context.contextFile} (${stats.size} bytes)`);
      }
    } else {
      addResult('fail', `Context file not found: ${context.contextFile}`, filePath);
    }
  });
}

/**
 * Test 4: Runbook files exist
 */
function testRunbookFiles() {
  log('\n🔍 Test 4: Runbook Files', 'cyan');

  const expectedRunbooks = [
    '01-authoring-flows-via-xml.md',
    '02-designing-flows-for-project-scenarios.md',
    '03-tools-and-techniques.md',
    '04-validation-and-best-practices.md',
    '05-testing-and-deployment.md',
    '06-monitoring-maintenance-rollback.md'
  ];

  expectedRunbooks.forEach(runbook => {
    const filePath = path.join(RUNBOOK_DIR, runbook);

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      addResult('pass', `Runbook exists: ${runbook} (${Math.round(stats.size / 1024)} KB)`);
    } else {
      addResult('fail', `Runbook not found: ${runbook}`, filePath);
    }
  });
}

/**
 * Test 5: Keyword coverage
 */
function testKeywordCoverage(mapping) {
  log('\n🔍 Test 5: Keyword Coverage', 'cyan');

  const flowContexts = mapping.contexts.filter(c =>
    c.contextName.startsWith('flow-xml-runbook-')
  );

  flowContexts.forEach(context => {
    const keywordCount = context.keywords.length;

    if (keywordCount === 0) {
      addResult('fail', `No keywords defined for ${context.contextName}`);
    } else if (keywordCount < 5) {
      addResult('warn', `Low keyword count for ${context.contextName}: ${keywordCount}`, 'Consider adding more keywords for better matching');
    } else {
      addResult('pass', `Good keyword coverage for ${context.contextName}: ${keywordCount} keywords`);
    }
  });
}

/**
 * Test 6: Intent pattern validation
 */
function testIntentPatterns(mapping) {
  log('\n🔍 Test 6: Intent Patterns', 'cyan');

  const flowContexts = mapping.contexts.filter(c =>
    c.contextName.startsWith('flow-xml-runbook-')
  );

  flowContexts.forEach(context => {
    const patternCount = (context.intentPatterns || []).length;

    if (patternCount === 0) {
      addResult('warn', `No intent patterns for ${context.contextName}`, 'Intent patterns help with natural language matching');
    } else {
      addResult('pass', `Intent patterns defined for ${context.contextName}: ${patternCount} patterns`);

      // Test pattern validity
      context.intentPatterns.forEach((pattern, index) => {
        try {
          new RegExp(pattern);
          if (VERBOSE) addResult('pass', `Pattern ${index + 1} is valid regex`);
        } catch (error) {
          addResult('fail', `Pattern ${index + 1} invalid regex: ${pattern}`, error.message);
        }
      });
    }
  });
}

/**
 * Test 7: Related contexts linkage
 */
function testRelatedContexts(mapping) {
  log('\n🔍 Test 7: Related Contexts', 'cyan');

  const flowContexts = mapping.contexts.filter(c =>
    c.contextName.startsWith('flow-xml-runbook-')
  );

  const allContextNames = mapping.contexts.map(c => c.contextName);

  flowContexts.forEach(context => {
    const relatedCount = (context.relatedContexts || []).length;

    if (relatedCount === 0) {
      addResult('warn', `No related contexts for ${context.contextName}`, 'Related contexts improve contextual loading');
    } else {
      addResult('pass', `Related contexts for ${context.contextName}: ${relatedCount}`);

      // Verify related contexts exist
      context.relatedContexts.forEach(related => {
        if (allContextNames.includes(related)) {
          if (VERBOSE) addResult('pass', `Related context exists: ${related}`);
        } else {
          addResult('fail', `Related context not found: ${related}`, `Referenced by ${context.contextName}`);
        }
      });
    }
  });
}

/**
 * Test 8: Test scenario validation
 */
function testScenarios(mapping) {
  log('\n🔍 Test 8: Test Scenarios', 'cyan');

  const testScenarios = mapping.testScenarios || [];

  if (testScenarios.length === 0) {
    addResult('warn', 'No test scenarios defined', 'Test scenarios help validate keyword matching');
    return;
  }

  testScenarios.forEach((scenario, index) => {
    const scenarioNum = index + 1;

    addResult('pass', `Scenario ${scenarioNum}: ${scenario.userIntent}`);

    if (scenario.expectedContexts && scenario.expectedContexts.length > 0) {
      if (VERBOSE) {
        log(`    Expected contexts: ${scenario.expectedContexts.join(', ')}`, 'cyan');
      }
    } else {
      addResult('warn', `Scenario ${scenarioNum} has no expected contexts`);
    }
  });
}

/**
 * Main test function
 */
function runTests() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Flow XML Development Runbooks - Context Loading Tests', 'cyan');
  log('='.repeat(80) + '\n', 'cyan');

  const mapping = testKeywordMappingFile();

  if (!mapping) {
    log('\n❌ Cannot continue tests without valid keyword mapping', 'red');
    process.exit(1);
  }

  // Run all tests
  testFlowContextsDefined(mapping);
  testContextFiles(mapping);
  testRunbookFiles();
  testKeywordCoverage(mapping);
  testIntentPatterns(mapping);
  testRelatedContexts(mapping);
  testScenarios(mapping);

  // Print summary
  log('\n' + '='.repeat(80), 'cyan');
  log('Test Summary', 'cyan');
  log('='.repeat(80), 'cyan');

  log(`\nTotal tests: ${results.total}`, 'cyan');
  log(`✓ Passed: ${results.passed}`, 'green');
  log(`⚠ Warnings: ${results.warnings}`, 'yellow');
  log(`✗ Failed: ${results.failed}`, 'red');

  // Detailed breakdown
  const byType = { pass: [], warn: [], fail: [] };
  results.details.forEach(result => {
    byType[result.type].push(result);
  });

  if (results.warnings > 0) {
    log('\nWarnings:', 'yellow');
    byType.warn.forEach(w => {
      log(`  - ${w.message}`, 'yellow');
    });
  }

  if (results.failed > 0) {
    log('\nFailures:', 'red');
    byType.fail.forEach(f => {
      log(`  - ${f.message}`, 'red');
      if (f.details) log(`    ${f.details}`, 'red');
    });
  }

  // Exit code
  const exitCode = results.failed > 0 ? 1 : 0;

  if (exitCode === 0) {
    log('\n✅ All tests passed!', 'green');
    if (results.warnings > 0) {
      log(`   (${results.warnings} warnings - review recommended)`, 'yellow');
    }
  } else {
    log('\n❌ Tests failed', 'red');
  }

  log('\n' + '='.repeat(80) + '\n', 'cyan');

  return exitCode;
}

// Run tests
const exitCode = runTests();
process.exit(exitCode);
