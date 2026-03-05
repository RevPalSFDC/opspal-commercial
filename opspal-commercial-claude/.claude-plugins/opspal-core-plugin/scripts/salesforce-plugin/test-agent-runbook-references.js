#!/usr/bin/env node

/**
 * Flow XML Development Runbooks - Agent Reference Test
 *
 * Tests that Flow agents properly reference runbooks:
 * - Agent files exist
 * - Runbook references are present
 * - File paths are correct
 * - Runbook numbers are valid (1-6)
 *
 * Usage: node scripts/test-agent-runbook-references.js [--verbose]
 */

const fs = require('fs');
const path = require('path');

// Configuration
const PLUGIN_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(PLUGIN_ROOT, 'agents');
const RUNBOOK_DIR = path.join(PLUGIN_ROOT, 'docs/runbooks/flow-xml-development');
const VERBOSE = process.argv.includes('--verbose');

// Flow agents that should reference runbooks
const FLOW_AGENTS = [
  'sfdc-automation-builder.md',
  'flow-template-specialist.md',
  'sfdc-deployment-manager.md'
];

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
 * Read agent file
 */
function readAgent(agentFile) {
  const filePath = path.join(AGENTS_DIR, agentFile);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

/**
 * Test 1: Agent files exist
 */
function testAgentFilesExist() {
  log('\n🔍 Test 1: Agent Files', 'cyan');

  FLOW_AGENTS.forEach(agent => {
    const filePath = path.join(AGENTS_DIR, agent);

    if (fs.existsSync(filePath)) {
      addResult('pass', `Agent exists: ${agent}`);
    } else {
      addResult('fail', `Agent not found: ${agent}`, filePath);
    }
  });
}

/**
 * Test 2: Runbook references present
 */
function testRunbookReferencesPresent() {
  log('\n🔍 Test 2: Runbook References', 'cyan');

  FLOW_AGENTS.forEach(agent => {
    const content = readAgent(agent);

    if (!content) {
      addResult('fail', `Cannot read agent: ${agent}`);
      return;
    }

    // Count references to "Runbook" (case-insensitive)
    const runbookMatches = content.match(/runbook/gi) || [];
    const count = runbookMatches.length;

    if (count === 0) {
      addResult('fail', `No runbook references in ${agent}`);
    } else if (count < 3) {
      addResult('warn', `Low runbook references in ${agent}: ${count}`, 'Expected at least 3 references');
    } else {
      addResult('pass', `Good runbook references in ${agent}: ${count} references`);
    }
  });
}

/**
 * Test 3: Runbook file path references
 */
function testRunbookFilePaths() {
  log('\n🔍 Test 3: Runbook File Paths', 'cyan');

  FLOW_AGENTS.forEach(agent => {
    const content = readAgent(agent);

    if (!content) {
      return;
    }

    // Find all references to runbook file paths
    const pathRegex = /docs\/runbooks\/flow-xml-development\/([\w-]+\.md)/g;
    const matches = [...content.matchAll(pathRegex)];

    if (matches.length === 0) {
      addResult('warn', `No runbook file paths in ${agent}`, 'Paths help users locate runbooks');
      return;
    }

    matches.forEach(match => {
      const runbookFile = match[1];
      const fullPath = path.join(RUNBOOK_DIR, runbookFile);

      if (fs.existsSync(fullPath)) {
        if (VERBOSE) addResult('pass', `Valid path in ${agent}: ${runbookFile}`);
      } else {
        addResult('fail', `Invalid path in ${agent}: ${runbookFile}`, fullPath);
      }
    });

    addResult('pass', `File paths checked in ${agent}: ${matches.length} paths`);
  });
}

/**
 * Test 4: Runbook number references (1-6)
 */
function testRunbookNumberReferences() {
  log('\n🔍 Test 4: Runbook Number References', 'cyan');

  FLOW_AGENTS.forEach(agent => {
    const content = readAgent(agent);

    if (!content) {
      return;
    }

    // Find references to Runbook 1, Runbook 2, etc.
    const numberRegex = /Runbook (\d+)/g;
    const matches = [...content.matchAll(numberRegex)];

    if (matches.length === 0) {
      addResult('warn', `No runbook number references in ${agent}`, 'Numbered references help users navigate');
      return;
    }

    const invalidNumbers = [];

    matches.forEach(match => {
      const num = parseInt(match[1]);

      if (num < 1 || num > 6) {
        invalidNumbers.push(num);
      }
    });

    if (invalidNumbers.length > 0) {
      addResult('fail', `Invalid runbook numbers in ${agent}: ${invalidNumbers.join(', ')}`, 'Valid range: 1-6');
    } else {
      addResult('pass', `Valid runbook numbers in ${agent}: ${matches.length} references`);
    }
  });
}

/**
 * Test 5: Agent-specific runbook mappings
 */
function testAgentSpecificMappings() {
  log('\n🔍 Test 5: Agent-Specific Runbook Mappings', 'cyan');

  const expectedMappings = {
    'sfdc-automation-builder.md': {
      expected: [1, 2, 3, 4],  // Should reference Runbooks 1-4 (authoring, design, tools, validation)
      description: 'automation builder'
    },
    'flow-template-specialist.md': {
      expected: [2],  // Should reference Runbook 2 (design patterns)
      description: 'template specialist'
    },
    'sfdc-deployment-manager.md': {
      expected: [5, 6],  // Should reference Runbooks 5-6 (deployment, monitoring)
      description: 'deployment manager'
    }
  };

  Object.keys(expectedMappings).forEach(agent => {
    const content = readAgent(agent);

    if (!content) {
      return;
    }

    const mapping = expectedMappings[agent];
    const numberRegex = /Runbook (\d+)/g;
    const matches = [...content.matchAll(numberRegex)];
    const referencedNumbers = [...new Set(matches.map(m => parseInt(m[1])))];

    const missingRunbooks = mapping.expected.filter(num => !referencedNumbers.includes(num));

    if (missingRunbooks.length > 0) {
      addResult('warn',
        `${agent} missing expected runbooks: ${missingRunbooks.join(', ')}`,
        `As ${mapping.description}, should reference these runbooks`
      );
    } else {
      addResult('pass', `${agent} references expected runbooks: ${mapping.expected.join(', ')}`);
    }
  });
}

/**
 * Test 6: Integration with keyword mapping
 */
function testKeywordMappingIntegration() {
  log('\n🔍 Test 6: Keyword Mapping Integration', 'cyan');

  FLOW_AGENTS.forEach(agent => {
    const content = readAgent(agent);

    if (!content) {
      return;
    }

    // Check for references to keyword-mapping.json or progressive disclosure
    const hasKeywordMapping = content.includes('keyword-mapping') || content.includes('progressive disclosure');

    if (hasKeywordMapping) {
      addResult('pass', `${agent} mentions progressive disclosure/keyword mapping`);
    } else {
      addResult('warn',
        `${agent} doesn't mention progressive disclosure`,
        'Agents should explain how runbooks are loaded'
      );
    }
  });
}

/**
 * Test 7: CLI integration references
 */
function testCLIIntegrationReferences() {
  log('\n🔍 Test 7: CLI Integration References', 'cyan');

  FLOW_AGENTS.forEach(agent => {
    const content = readAgent(agent);

    if (!content) {
      return;
    }

    // Check for references to flow runbook CLI command
    const hasFlowRunbookCLI = content.includes('flow runbook');

    if (hasFlowRunbookCLI) {
      addResult('pass', `${agent} references 'flow runbook' CLI command`);
    } else {
      addResult('warn',
        `${agent} doesn't reference 'flow runbook' CLI`,
        'Agents should guide users to CLI command'
      );
    }
  });
}

/**
 * Main test function
 */
function runTests() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Flow XML Development Runbooks - Agent Reference Tests', 'cyan');
  log('='.repeat(80) + '\n', 'cyan');

  // Run all tests
  testAgentFilesExist();
  testRunbookReferencesPresent();
  testRunbookFilePaths();
  testRunbookNumberReferences();
  testAgentSpecificMappings();
  testKeywordMappingIntegration();
  testCLIIntegrationReferences();

  // Print summary
  log('\n' + '='.repeat(80), 'cyan');
  log('Test Summary', 'cyan');
  log('='.repeat(80), 'cyan');

  log(`\nTotal tests: ${results.total}`, 'cyan');
  log(`✓ Passed: ${results.passed}`, 'green');
  log(`⚠ Warnings: ${results.warnings}`, 'yellow');
  log(`✗ Failed: ${results.failed}`, 'red');

  // Detailed breakdown
  if (results.warnings > 0) {
    log('\nWarnings:', 'yellow');
    results.details.filter(r => r.type === 'warn').forEach(w => {
      log(`  - ${w.message}`, 'yellow');
      if (w.details && VERBOSE) log(`    ${w.details}`, 'yellow');
    });
  }

  if (results.failed > 0) {
    log('\nFailures:', 'red');
    results.details.filter(r => r.type === 'fail').forEach(f => {
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
