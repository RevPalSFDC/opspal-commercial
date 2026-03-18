#!/usr/bin/env node

/**
 * Improvement Plan Integration Test Suite
 *
 * Tests all Phase 1-2 components from the reflection-based improvement plan:
 * - Phase 1: Quick Wins (csv-parser-safe, multi-path-resolver, system-dependency-validator)
 * - Phase 2: Core Infrastructure (metadata-dependency-analyzer, flow-xml-parser, data-quality-monitor)
 *
 * @version 1.0.0
 * @date 2026-01-08
 * @see ~/.claude/plans/improvement-plan-2026-01-08.md
 */

const path = require('path');
const fs = require('fs');

// Test configuration
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CANONICAL_SF_PLUGIN_ROOT = path.join(REPO_ROOT, 'plugins', 'opspal-salesforce');
const LEGACY_SF_PLUGIN_ROOT = path.resolve(__dirname, '../../salesforce-plugin');
const SALESFORCE_PLUGIN_ROOT = fs.existsSync(CANONICAL_SF_PLUGIN_ROOT)
  ? CANONICAL_SF_PLUGIN_ROOT
  : LEGACY_SF_PLUGIN_ROOT;

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  components: []
};

async function test(name, fn) {
  results.total++;
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    results.passed++;
    results.components.push({ name, status: 'PASSED' });
    console.log('✅');
  } catch (error) {
    results.failed++;
    results.components.push({ name, status: 'FAILED', error: error.message });
    console.log(`❌ ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ============================================================================
// Phase 1: Quick Wins Tests
// ============================================================================

async function testPhase1() {
  console.log('\n📦 Phase 1: Quick Wins');
  console.log('─'.repeat(60));

  // 1.1 CSV Parser Safe
  await test('csv-parser-safe exists', () => {
    const csvParserPath = path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/csv-parser-safe.js');
    assert(fs.existsSync(csvParserPath), 'csv-parser-safe.js not found');
  });

  await test('csv-parser-safe exports required functions', () => {
    const csvParser = require(path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/csv-parser-safe.js'));
    assert(typeof csvParser.parse === 'function' || typeof csvParser === 'function', 'Missing parse function');
  });

  // 1.2 Multi-Path Resolver
  await test('multi-path-resolver exists', () => {
    const resolverPath = path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/multi-path-resolver.js');
    assert(fs.existsSync(resolverPath), 'multi-path-resolver.js not found');
  });

  await test('multi-path-resolver exports PathResolver class', () => {
    const resolver = require(path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/multi-path-resolver.js'));
    assert(typeof resolver.PathResolver === 'function', 'Missing PathResolver class');
    assert(typeof resolver.findInstancePath === 'function', 'Missing findInstancePath function');
  });

  // 1.3 System Dependency Validator
  await test('system-dependency-validator exists', () => {
    const validatorPath = path.join(PLUGIN_ROOT, 'scripts/lib/system-dependency-validator.js');
    assert(fs.existsSync(validatorPath), 'system-dependency-validator.js not found');
  });

  await test('system-dependency-validator exports validateProfile', async () => {
    const validator = require(path.join(PLUGIN_ROOT, 'scripts/lib/system-dependency-validator.js'));
    assert(typeof validator.validateProfile === 'function', 'Missing validateProfile function');
  });

  await test('system-dependency-validator validates core profile', async () => {
    const { validateProfile } = require(path.join(PLUGIN_ROOT, 'scripts/lib/system-dependency-validator.js'));
    const result = await validateProfile('core');
    assert(result.profile === 'core', 'Wrong profile returned');
    assert(result.summary, 'Missing summary');
    assert(typeof result.summary.score === 'number', 'Missing score');
  });

  // 1.4 Pre-Dependency Check Hook
  await test('pre-dependency-check.sh hook exists', () => {
    const hookPath = path.join(PLUGIN_ROOT, 'hooks/pre-dependency-check.sh');
    assert(fs.existsSync(hookPath), 'pre-dependency-check.sh not found');
  });

  await test('pre-dependency-check.sh is executable', () => {
    const hookPath = path.join(PLUGIN_ROOT, 'hooks/pre-dependency-check.sh');
    const stats = fs.statSync(hookPath);
    assert(stats.mode & fs.constants.S_IXUSR, 'Hook not executable');
  });
}

// ============================================================================
// Phase 2: Core Infrastructure Tests
// ============================================================================

async function testPhase2() {
  console.log('\n🔧 Phase 2: Core Infrastructure');
  console.log('─'.repeat(60));

  // 2.1 Metadata Dependency Analyzer
  await test('metadata-dependency-analyzer exists', () => {
    const analyzerPath = path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/metadata-dependency-analyzer.js');
    assert(fs.existsSync(analyzerPath), 'metadata-dependency-analyzer.js not found');
  });

  await test('metadata-dependency-analyzer exports class', () => {
    const Analyzer = require(path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/metadata-dependency-analyzer.js'));
    assert(typeof Analyzer === 'function' || typeof Analyzer.analyze === 'function', 'Missing Analyzer export');
  });

  await test('metadata-dependency-analyzer has test file', () => {
    const testPath = path.join(SALESFORCE_PLUGIN_ROOT, 'test/metadata-dependency-analyzer.test.js');
    assert(fs.existsSync(testPath), 'Test file not found');
  });

  // 2.2 Flow XML Parser
  await test('flow-xml-parser exists', () => {
    const parserPath = path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/flow-xml-parser.js');
    assert(fs.existsSync(parserPath), 'flow-xml-parser.js not found');
  });

  await test('flow-xml-parser exports class', () => {
    const Parser = require(path.join(SALESFORCE_PLUGIN_ROOT, 'scripts/lib/flow-xml-parser.js'));
    assert(typeof Parser === 'function' || typeof Parser.parse === 'function', 'Missing Parser export');
  });

  await test('flow-xml-parser has test file', () => {
    const testPath = path.join(SALESFORCE_PLUGIN_ROOT, 'test/flow-xml-parser.test.js');
    assert(fs.existsSync(testPath), 'Test file not found');
  });

  // 2.3 Data Quality Monitor
  await test('data-quality-monitor exists', () => {
    const monitorPath = path.join(PLUGIN_ROOT, 'scripts/lib/data-quality-monitor.js');
    assert(fs.existsSync(monitorPath), 'data-quality-monitor.js not found');
  });

  await test('data-quality-monitor exports DataQualityMonitor class', () => {
    const { DataQualityMonitor } = require(path.join(PLUGIN_ROOT, 'scripts/lib/data-quality-monitor.js'));
    assert(typeof DataQualityMonitor === 'function', 'Missing DataQualityMonitor class');
  });

  await test('data-quality-monitor has built-in rules', () => {
    const { DataQualityMonitor } = require(path.join(PLUGIN_ROOT, 'scripts/lib/data-quality-monitor.js'));
    const monitor = new DataQualityMonitor();
    const rules = monitor.getBuiltInRules ? monitor.getBuiltInRules() : monitor.rules;
    assert(rules && Object.keys(rules).length >= 5, 'Missing built-in rules');
  });
}

// ============================================================================
// Phase 3: Integration Tests
// ============================================================================

async function testPhase3() {
  console.log('\n🔗 Phase 3: Integration');
  console.log('─'.repeat(60));

  // 3.1 Pre-deployment comprehensive validation hook
  await test('pre-deployment-comprehensive-validation.sh exists', () => {
    const hookPath = path.join(SALESFORCE_PLUGIN_ROOT, 'hooks/pre-deployment-comprehensive-validation.sh');
    assert(fs.existsSync(hookPath), 'Hook not found');
  });

  await test('pre-deployment hook references metadata-dependency-analyzer', () => {
    const hookPath = path.join(SALESFORCE_PLUGIN_ROOT, 'hooks/pre-deployment-comprehensive-validation.sh');
    const content = fs.readFileSync(hookPath, 'utf-8');
    assert(content.includes('metadata-dependency-analyzer'), 'Missing metadata-dependency-analyzer reference');
  });

  await test('pre-deployment hook references csv-parser-safe', () => {
    const hookPath = path.join(SALESFORCE_PLUGIN_ROOT, 'hooks/pre-deployment-comprehensive-validation.sh');
    const content = fs.readFileSync(hookPath, 'utf-8');
    assert(content.includes('csv-parser-safe'), 'Missing csv-parser-safe reference');
  });

  await test('pre-deployment hook has 8 validation steps', () => {
    const hookPath = path.join(SALESFORCE_PLUGIN_ROOT, 'hooks/pre-deployment-comprehensive-validation.sh');
    const content = fs.readFileSync(hookPath, 'utf-8');
    const stepCount = (content.match(/Step \d+\/8/g) || []).length;
    assert(stepCount >= 8, `Only ${stepCount} steps found, expected 8`);
  });

  // 3.2 Context loader hook
  await test('pre-task-context-loader.sh exists', () => {
    const hookPath = path.join(SALESFORCE_PLUGIN_ROOT, 'hooks/pre-task-context-loader.sh');
    assert(fs.existsSync(hookPath), 'Hook not found');
  });
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Improvement Plan Integration Test Suite                  ║');
  console.log('║     Reflection-Based Infrastructure Enhancements             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Date: ${new Date().toISOString().split('T')[0]}                                        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await testPhase1();
    await testPhase2();
    await testPhase3();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total: ${results.total}`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌`);
  console.log(`Score: ${Math.round((results.passed / results.total) * 100)}%`);

  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.components
      .filter(c => c.status === 'FAILED')
      .forEach(c => console.log(`  - ${c.name}: ${c.error}`));
  }

  console.log('\n' + '═'.repeat(60));

  // Only exit if running standalone
  if (require.main === module) {
    process.exit(results.failed > 0 ? 1 : 0);
  }

  return results;
}

// Only run automatically if called directly (not via Jest)
if (require.main === module) {
  main().catch(console.error);
}

// Jest wrapper
describe('ImprovementPlanIntegration', () => {
  it('should pass all improvement plan integration tests', async () => {
    const originalLog = console.log;
    const originalStdout = process.stdout.write.bind(process.stdout);
    console.log = () => {};
    process.stdout.write = () => true;

    try {
      const result = await main();
      expect(result.failed).toBe(0);
    } finally {
      console.log = originalLog;
      process.stdout.write = originalStdout;
    }
  }, 30000);
});

module.exports = { main, results };
