#!/usr/bin/env node

/**
 * Flow XML Development Runbooks - Integration Point Verification
 *
 * Verifies all 5 integration layers are properly wired:
 * 1. Documentation Layer - Runbooks accessible and cross-referenced
 * 2. CLI Layer - flow runbook command functionality
 * 3. Agent Layer - Flow agents with runbook references
 * 4. Script Layer - JSDoc runbook references
 * 5. Living Runbook Layer - Observation hooks and synthesis
 *
 * Usage: node scripts/verify-integration-points.js [--verbose]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PLUGIN_ROOT = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

// Color output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Verification results
const results = {
  layers: [],
  totalChecks: 0,
  passed: 0,
  failed: 0,
  warnings: 0
};

/**
 * Log message with color
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Add verification result
 */
function addResult(layer, check, status, details = null) {
  results.totalChecks++;

  let layerResult = results.layers.find(l => l.name === layer);
  if (!layerResult) {
    layerResult = { name: layer, checks: [], passed: 0, failed: 0, warnings: 0 };
    results.layers.push(layerResult);
  }

  layerResult.checks.push({ check, status, details });

  if (status === 'pass') {
    results.passed++;
    layerResult.passed++;
    if (VERBOSE) log(`  ✓ ${check}`, 'green');
  } else if (status === 'warn') {
    results.warnings++;
    layerResult.warnings++;
    log(`  ⚠ ${check}`, 'yellow');
    if (details) log(`    ${details}`, 'yellow');
  } else if (status === 'fail') {
    results.failed++;
    layerResult.failed++;
    log(`  ✗ ${check}`, 'red');
    if (details) log(`    ${details}`, 'red');
  }
}

/**
 * Layer 1: Documentation Layer Verification
 */
function verifyDocumentationLayer() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Layer 1: Documentation Layer', 'bold');
  log('='.repeat(80), 'cyan');

  const runbookDir = path.join(PLUGIN_ROOT, 'docs/runbooks/flow-xml-development');
  const expectedRunbooks = [
    '01-authoring-flows-via-xml.md',
    '02-designing-flows-for-project-scenarios.md',
    '03-tools-and-techniques.md',
    '04-validation-and-best-practices.md',
    '05-testing-and-deployment.md',
    '06-monitoring-maintenance-rollback.md'
  ];

  // Check 1: Runbook directory exists
  if (fs.existsSync(runbookDir)) {
    addResult('Documentation', 'Runbook directory exists', 'pass');
  } else {
    addResult('Documentation', 'Runbook directory exists', 'fail', runbookDir);
    return;
  }

  // Check 2: All 6 runbooks exist
  let allExist = true;
  expectedRunbooks.forEach(runbook => {
    const filePath = path.join(runbookDir, runbook);
    if (fs.existsSync(filePath)) {
      addResult('Documentation', `Runbook exists: ${runbook}`, 'pass');
    } else {
      addResult('Documentation', `Runbook exists: ${runbook}`, 'fail', filePath);
      allExist = false;
    }
  });

  // Check 3: README.md index exists
  const readmePath = path.join(runbookDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    addResult('Documentation', 'Runbook index (README.md) exists', 'pass');

    // Check 3a: README contains navigation table
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    if (readmeContent.includes('Quick Navigation')) {
      addResult('Documentation', 'README contains Quick Navigation table', 'pass');
    } else {
      addResult('Documentation', 'README contains Quick Navigation table', 'warn', 'Navigation table not found');
    }

    // Check 3b: README contains common workflows
    if (readmeContent.includes('Common Workflows')) {
      addResult('Documentation', 'README contains Common Workflows section', 'pass');
    } else {
      addResult('Documentation', 'README contains Common Workflows section', 'warn');
    }
  } else {
    addResult('Documentation', 'Runbook index (README.md) exists', 'fail', readmePath);
  }

  // Check 4: CLAUDE.md references runbooks
  const claudeMdPath = path.join(PLUGIN_ROOT, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const claudeContent = fs.readFileSync(claudeMdPath, 'utf8');
    if (claudeContent.includes('Flow XML Development Runbooks')) {
      addResult('Documentation', 'CLAUDE.md contains Flow Runbooks section', 'pass');
    } else {
      addResult('Documentation', 'CLAUDE.md contains Flow Runbooks section', 'fail');
    }
  } else {
    addResult('Documentation', 'CLAUDE.md exists', 'fail', claudeMdPath);
  }

  // Check 5: README.md references runbooks
  const pluginReadmePath = path.join(PLUGIN_ROOT, 'README.md');
  if (fs.existsSync(pluginReadmePath)) {
    const readmeContent = fs.readFileSync(pluginReadmePath, 'utf8');
    if (readmeContent.includes('Flow XML Development Runbooks')) {
      addResult('Documentation', 'Plugin README.md contains Flow Runbooks section', 'pass');
    } else {
      addResult('Documentation', 'Plugin README.md contains Flow Runbooks section', 'warn');
    }
  }

  // Check 6: CHANGELOG.md has v3.42.0 entry
  const changelogPath = path.join(PLUGIN_ROOT, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const changelogContent = fs.readFileSync(changelogPath, 'utf8');
    if (changelogContent.includes('## [3.42.0]')) {
      addResult('Documentation', 'CHANGELOG.md has v3.42.0 entry', 'pass');
    } else {
      addResult('Documentation', 'CHANGELOG.md has v3.42.0 entry', 'fail');
    }
  }

  // Check 7: Cross-references between runbooks
  let crossRefCount = 0;
  expectedRunbooks.forEach(runbook => {
    const filePath = path.join(runbookDir, runbook);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.match(/Runbook \d/g);
      if (matches && matches.length > 0) {
        crossRefCount += matches.length;
      }
    }
  });

  if (crossRefCount > 0) {
    addResult('Documentation', `Cross-references between runbooks: ${crossRefCount} references`, 'pass');
  } else {
    addResult('Documentation', 'Cross-references between runbooks', 'warn', 'No cross-references found');
  }
}

/**
 * Layer 2: CLI Layer Verification
 */
function verifyCLILayer() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Layer 2: CLI Layer', 'bold');
  log('='.repeat(80), 'cyan');

  const cliDir = path.join(PLUGIN_ROOT, 'cli');

  // Check 1: CLI directory exists
  if (fs.existsSync(cliDir)) {
    addResult('CLI', 'CLI directory exists', 'pass');
  } else {
    addResult('CLI', 'CLI directory exists', 'fail', cliDir);
    return;
  }

  // Check 2: flow-cli.js contains runbook command
  const flowCliScript = path.join(cliDir, 'flow-cli.js');
  if (fs.existsSync(flowCliScript)) {
    addResult('CLI', 'flow-cli.js script exists', 'pass');

    const scriptContent = fs.readFileSync(flowCliScript, 'utf8');

    // Check 2a: Contains runbook command
    if (scriptContent.includes('.command(\'runbook')) {
      addResult('CLI', 'flow-cli.js contains runbook command', 'pass');
    } else {
      addResult('CLI', 'flow-cli.js contains runbook command', 'fail');
    }

    // Check 2b: Script has required modes
    const requiredModes = ['--list', '--search'];
    requiredModes.forEach(mode => {
      if (scriptContent.includes(mode)) {
        addResult('CLI', `runbook command supports ${mode} mode`, 'pass');
      } else {
        addResult('CLI', `runbook command supports ${mode} mode`, 'fail');
      }
    });

    // Check 2c: Script is executable
    try {
      fs.accessSync(flowCliScript, fs.constants.X_OK);
      addResult('CLI', 'flow-cli.js is executable', 'pass');
    } catch (error) {
      addResult('CLI', 'flow-cli.js is executable', 'warn', 'Not executable - may need chmod +x');
    }
  } else {
    addResult('CLI', 'flow-cli.js script exists', 'fail', flowCliScript);
  }

  // Check 3: CLI help integration
  const flowScripts = ['flow-author.js', 'flow-validator.js', 'flow-deployment-manager.js'];
  flowScripts.forEach(script => {
    const scriptPath = path.join(PLUGIN_ROOT, 'scripts/lib', script);
    if (fs.existsSync(scriptPath)) {
      const content = fs.readFileSync(scriptPath, 'utf8');
      if (content.includes('--help-runbook')) {
        addResult('CLI', `${script} supports --help-runbook flag`, 'pass');
      } else {
        addResult('CLI', `${script} supports --help-runbook flag`, 'warn');
      }
    }
  });

  // Check 4: Test flow-cli.js functionality (syntax only)
  try {
    execSync('node --check cli/flow-cli.js', { cwd: PLUGIN_ROOT, stdio: 'pipe' });
    addResult('CLI', 'flow-cli.js syntax valid', 'pass');
  } catch (error) {
    addResult('CLI', 'flow-cli.js syntax valid', 'fail', error.message);
  }
}

/**
 * Layer 3: Agent Layer Verification
 */
function verifyAgentLayer() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Layer 3: Agent Layer', 'bold');
  log('='.repeat(80), 'cyan');

  const agentsDir = path.join(PLUGIN_ROOT, 'agents');
  const expectedAgents = [
    'sfdc-automation-builder.md',
    'flow-template-specialist.md',
    'sfdc-deployment-manager.md'
  ];

  // Check 1: Agents directory exists
  if (fs.existsSync(agentsDir)) {
    addResult('Agent', 'Agents directory exists', 'pass');
  } else {
    addResult('Agent', 'Agents directory exists', 'fail', agentsDir);
    return;
  }

  // Check 2: Expected agents exist and reference runbooks
  expectedAgents.forEach(agent => {
    const agentPath = path.join(agentsDir, agent);
    if (fs.existsSync(agentPath)) {
      addResult('Agent', `Agent exists: ${agent}`, 'pass');

      const content = fs.readFileSync(agentPath, 'utf8');

      // Check 2a: Agent references runbooks
      if (content.includes('Runbook') || content.includes('runbook')) {
        addResult('Agent', `${agent} references runbooks`, 'pass');
      } else {
        addResult('Agent', `${agent} references runbooks`, 'fail');
      }

      // Check 2b: Agent mentions Flow XML or automation
      if (content.includes('Flow') || content.includes('automation')) {
        addResult('Agent', `${agent} mentions Flow/automation`, 'pass');
      } else {
        addResult('Agent', `${agent} mentions Flow/automation`, 'warn');
      }
    } else {
      addResult('Agent', `Agent exists: ${agent}`, 'fail', agentPath);
    }
  });

  // Check 3: Agents reference runbook file paths
  let pathReferences = 0;
  expectedAgents.forEach(agent => {
    const agentPath = path.join(agentsDir, agent);
    if (fs.existsSync(agentPath)) {
      const content = fs.readFileSync(agentPath, 'utf8');
      const matches = content.match(/docs\/runbooks\/flow-xml-development/g);
      if (matches) {
        pathReferences += matches.length;
      }
    }
  });

  if (pathReferences > 0) {
    addResult('Agent', `Agents reference runbook file paths: ${pathReferences} references`, 'pass');
  } else {
    addResult('Agent', 'Agents reference runbook file paths', 'warn', 'No file path references found');
  }
}

/**
 * Layer 4: Script Layer Verification
 */
function verifyScriptLayer() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Layer 4: Script Layer', 'bold');
  log('='.repeat(80), 'cyan');

  const scriptsLibDir = path.join(PLUGIN_ROOT, 'scripts/lib');
  const expectedScripts = [
    'flow-author.js',
    'flow-nlp-modifier.js',
    'flow-validator.js',
    'flow-deployment-manager.js'
  ];

  // Check 1: scripts/lib directory exists
  if (fs.existsSync(scriptsLibDir)) {
    addResult('Script', 'scripts/lib directory exists', 'pass');
  } else {
    addResult('Script', 'scripts/lib directory exists', 'fail', scriptsLibDir);
    return;
  }

  // Check 2: Expected scripts exist and have JSDoc runbook references
  expectedScripts.forEach(script => {
    const scriptPath = path.join(scriptsLibDir, script);
    if (fs.existsSync(scriptPath)) {
      addResult('Script', `Script exists: ${script}`, 'pass');

      const content = fs.readFileSync(scriptPath, 'utf8');

      // Check 2a: JSDoc comment exists
      if (content.includes('/**')) {
        addResult('Script', `${script} has JSDoc comments`, 'pass');
      } else {
        addResult('Script', `${script} has JSDoc comments`, 'warn');
      }

      // Check 2b: JSDoc references runbooks
      if (content.includes('@see Runbook') || content.includes('Runbook')) {
        addResult('Script', `${script} JSDoc references runbooks`, 'pass');
      } else {
        addResult('Script', `${script} JSDoc references runbooks`, 'fail');
      }

      // Check 2c: Script syntax is valid
      try {
        execSync(`node --check ${scriptPath}`, { stdio: 'pipe' });
        addResult('Script', `${script} syntax valid`, 'pass');
      } catch (error) {
        addResult('Script', `${script} syntax valid`, 'fail', error.message);
      }
    } else {
      addResult('Script', `Script exists: ${script}`, 'fail', scriptPath);
    }
  });

  // Check 3: Count total JSDoc runbook references
  let jsdocRefCount = 0;
  expectedScripts.forEach(script => {
    const scriptPath = path.join(scriptsLibDir, script);
    if (fs.existsSync(scriptPath)) {
      const content = fs.readFileSync(scriptPath, 'utf8');
      // Check for both @see Runbook N and **Runbook N** patterns
      const matches1 = content.match(/@see Runbook \d/g) || [];
      const matches2 = content.match(/\*\*Runbook \d\*\*/g) || [];
      jsdocRefCount += matches1.length + matches2.length;
    }
  });

  if (jsdocRefCount > 0) {
    addResult('Script', `JSDoc runbook references: ${jsdocRefCount} references`, 'pass');
  } else {
    addResult('Script', 'JSDoc runbook references', 'warn', 'No Runbook references found in JSDoc');
  }
}

/**
 * Layer 5: Living Runbook Layer Verification
 */
function verifyLivingRunbookLayer() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Layer 5: Living Runbook Layer', 'bold');
  log('='.repeat(80), 'cyan');

  // Check 1: post-operation-observe.sh hook exists
  const observeHook = path.join(PLUGIN_ROOT, 'hooks/post-operation-observe.sh');
  if (fs.existsSync(observeHook)) {
    addResult('Living Runbook', 'post-operation-observe.sh hook exists', 'pass');

    const hookContent = fs.readFileSync(observeHook, 'utf8');

    // Check 1a: Hook detects Flow operations
    if (hookContent.includes('flow-operation')) {
      addResult('Living Runbook', 'Hook detects Flow operations', 'pass');
    } else {
      addResult('Living Runbook', 'Hook detects Flow operations', 'fail');
    }

    // Check 1b: Hook captures Flow context
    const flowContextVars = ['OPERATION_FLOWS', 'FLOW_OPERATION_TYPE', 'TEMPLATES_USED'];
    flowContextVars.forEach(varName => {
      if (hookContent.includes(varName)) {
        addResult('Living Runbook', `Hook captures ${varName}`, 'pass');
      } else {
        addResult('Living Runbook', `Hook captures ${varName}`, 'fail');
      }
    });

    // Check 1c: Hook is executable
    try {
      fs.accessSync(observeHook, fs.constants.X_OK);
      addResult('Living Runbook', 'Hook is executable', 'pass');
    } catch (error) {
      addResult('Living Runbook', 'Hook is executable', 'warn', 'Not executable - may need chmod +x');
    }
  } else {
    addResult('Living Runbook', 'post-operation-observe.sh hook exists', 'fail', observeHook);
  }

  // Check 2: runbook-synthesizer.js has Flow pattern functions
  const synthesizerScript = path.join(PLUGIN_ROOT, 'scripts/lib/runbook-synthesizer.js');
  if (fs.existsSync(synthesizerScript)) {
    addResult('Living Runbook', 'runbook-synthesizer.js script exists', 'pass');

    const synthesizerContent = fs.readFileSync(synthesizerScript, 'utf8');

    // Check 2a: synthesizeFlowPatterns function exists
    if (synthesizerContent.includes('function synthesizeFlowPatterns')) {
      addResult('Living Runbook', 'synthesizeFlowPatterns() function exists', 'pass');
    } else {
      addResult('Living Runbook', 'synthesizeFlowPatterns() function exists', 'fail');
    }

    // Check 2b: generateFlowPatternAnalysisPrompt function exists
    if (synthesizerContent.includes('function generateFlowPatternAnalysisPrompt')) {
      addResult('Living Runbook', 'generateFlowPatternAnalysisPrompt() function exists', 'pass');
    } else {
      addResult('Living Runbook', 'generateFlowPatternAnalysisPrompt() function exists', 'fail');
    }

    // Check 2c: Flow pattern synthesis integrated in main pipeline
    if (synthesizerContent.includes('flow_patterns')) {
      addResult('Living Runbook', 'Flow pattern synthesis integrated in pipeline', 'pass');
    } else {
      addResult('Living Runbook', 'Flow pattern synthesis integrated in pipeline', 'fail');
    }

    // Check 2d: Module exports include Flow functions
    if (synthesizerContent.includes('synthesizeFlowPatterns') && synthesizerContent.includes('module.exports')) {
      addResult('Living Runbook', 'Flow functions exported from module', 'pass');
    } else {
      addResult('Living Runbook', 'Flow functions exported from module', 'warn');
    }
  } else {
    addResult('Living Runbook', 'runbook-synthesizer.js script exists', 'fail', synthesizerScript);
  }

  // Check 3: Keyword mapping includes Flow contexts
  const keywordMappingPath = path.join(PLUGIN_ROOT, 'contexts/metadata-manager/keyword-mapping.json');
  if (fs.existsSync(keywordMappingPath)) {
    addResult('Living Runbook', 'keyword-mapping.json exists', 'pass');

    try {
      const keywordMapping = JSON.parse(fs.readFileSync(keywordMappingPath, 'utf8'));

      const flowContexts = keywordMapping.contexts.filter(c => c.contextName.startsWith('flow-xml-runbook-'));
      if (flowContexts.length > 0) {
        addResult('Living Runbook', `Flow XML contexts defined: ${flowContexts.length} contexts`, 'pass');
      } else {
        addResult('Living Runbook', 'Flow XML contexts defined', 'fail');
      }
    } catch (error) {
      addResult('Living Runbook', 'keyword-mapping.json is valid JSON', 'fail', error.message);
    }
  } else {
    addResult('Living Runbook', 'keyword-mapping.json exists', 'warn', keywordMappingPath);
  }
}

/**
 * Generate summary report
 */
function generateSummary() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Integration Verification Summary', 'bold');
  log('='.repeat(80), 'cyan');

  log(`\nTotal Checks: ${results.totalChecks}`, 'cyan');
  log(`✓ Passed: ${results.passed} (${Math.round(results.passed / results.totalChecks * 100)}%)`, 'green');
  log(`⚠ Warnings: ${results.warnings} (${Math.round(results.warnings / results.totalChecks * 100)}%)`, 'yellow');
  log(`✗ Failed: ${results.failed} (${Math.round(results.failed / results.totalChecks * 100)}%)`, 'red');

  log('\nBy Layer:', 'cyan');
  results.layers.forEach(layer => {
    const total = layer.passed + layer.warnings + layer.failed;
    const passRate = Math.round(layer.passed / total * 100);
    const status = layer.failed === 0 ? '✓' : '✗';
    log(`  ${status} ${layer.name}: ${layer.passed}/${total} passed (${passRate}%)`,
        layer.failed === 0 ? 'green' : 'red');
  });

  // List failures
  if (results.failed > 0) {
    log('\nFailed Checks:', 'red');
    results.layers.forEach(layer => {
      const failures = layer.checks.filter(c => c.status === 'fail');
      if (failures.length > 0) {
        log(`\n  ${layer.name}:`, 'red');
        failures.forEach(f => {
          log(`    ✗ ${f.check}`, 'red');
          if (f.details) log(`      ${f.details}`, 'red');
        });
      }
    });
  }

  // List warnings
  if (results.warnings > 0 && VERBOSE) {
    log('\nWarnings:', 'yellow');
    results.layers.forEach(layer => {
      const warnings = layer.checks.filter(c => c.status === 'warn');
      if (warnings.length > 0) {
        log(`\n  ${layer.name}:`, 'yellow');
        warnings.forEach(w => {
          log(`    ⚠ ${w.check}`, 'yellow');
          if (w.details) log(`      ${w.details}`, 'yellow');
        });
      }
    });
  }

  // Overall status
  log('\n' + '='.repeat(80), 'cyan');
  if (results.failed === 0) {
    log('✅ All Integration Points Verified', 'green');
    if (results.warnings > 0) {
      log(`   (${results.warnings} warnings - review recommended)`, 'yellow');
    }
  } else {
    log('❌ Integration Verification Failed', 'red');
    log(`   ${results.failed} critical issues found`, 'red');
  }
  log('='.repeat(80) + '\n', 'cyan');

  return results.failed === 0 ? 0 : 1;
}

/**
 * Main verification function
 */
function runVerification() {
  log('\n' + '='.repeat(80), 'cyan');
  log('Flow XML Development Runbooks - Integration Point Verification', 'bold');
  log('='.repeat(80) + '\n', 'cyan');

  // Run all layer verifications
  verifyDocumentationLayer();
  verifyCLILayer();
  verifyAgentLayer();
  verifyScriptLayer();
  verifyLivingRunbookLayer();

  // Generate summary
  const exitCode = generateSummary();

  return exitCode;
}

// Run verification
const exitCode = runVerification();
process.exit(exitCode);
