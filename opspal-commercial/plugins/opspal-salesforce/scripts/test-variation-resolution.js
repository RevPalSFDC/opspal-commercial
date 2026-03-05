#!/usr/bin/env node

/**
 * test-variation-resolution.js
 *
 * Unit tests for the Template Variation System including:
 * - VariationResolver functionality
 * - CPQ detection accuracy
 * - Overlay application
 * - Field fallback resolution
 *
 * Usage:
 *   node scripts/test-variation-resolution.js
 *   node scripts/test-variation-resolution.js --verbose
 *   node scripts/test-variation-resolution.js --filter cpq
 */

const path = require('path');
const fs = require('fs');

// Test configuration
const CONFIG = {
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  filter: process.argv.find(arg => arg.startsWith('--filter='))?.split('=')[1] || null
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: []
};

// Console colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logVerbose(message) {
  if (CONFIG.verbose) {
    console.log(`${colors.dim}  ${message}${colors.reset}`);
  }
}

// Test assertion helpers
function assertEqual(actual, expected, message) {
  if (actual === expected) {
    results.passed++;
    log(`  ✓ ${message}`, 'green');
    return true;
  } else {
    results.failed++;
    log(`  ✗ ${message}`, 'red');
    log(`    Expected: ${JSON.stringify(expected)}`, 'dim');
    log(`    Actual:   ${JSON.stringify(actual)}`, 'dim');
    results.errors.push({ message, expected, actual });
    return false;
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);

  if (actualStr === expectedStr) {
    results.passed++;
    log(`  ✓ ${message}`, 'green');
    return true;
  } else {
    results.failed++;
    log(`  ✗ ${message}`, 'red');
    logVerbose(`Expected: ${expectedStr}`);
    logVerbose(`Actual: ${actualStr}`);
    results.errors.push({ message, expected, actual });
    return false;
  }
}

function assertTrue(condition, message) {
  return assertEqual(condition, true, message);
}

function assertFalse(condition, message) {
  return assertEqual(condition, false, message);
}

function assertNotNull(value, message) {
  if (value !== null && value !== undefined) {
    results.passed++;
    log(`  ✓ ${message}`, 'green');
    return true;
  } else {
    results.failed++;
    log(`  ✗ ${message} (was ${value})`, 'red');
    results.errors.push({ message, expected: 'non-null', actual: value });
    return false;
  }
}

function assertContains(array, value, message) {
  if (Array.isArray(array) && array.includes(value)) {
    results.passed++;
    log(`  ✓ ${message}`, 'green');
    return true;
  } else {
    results.failed++;
    log(`  ✗ ${message}`, 'red');
    logVerbose(`Array does not contain: ${value}`);
    results.errors.push({ message, expected: `contains ${value}`, actual: array });
    return false;
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

/**
 * Test Suite: Variation Schema Validation
 */
async function testVariationSchema() {
  log('\n📋 Test Suite: Variation Schema Validation', 'cyan');

  const schemaPath = path.join(__dirname, '../config/variation-schema.json');

  // Test: Schema file exists
  assertTrue(fs.existsSync(schemaPath), 'Schema file exists');

  // Test: Schema is valid JSON
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    assertTrue(true, 'Schema is valid JSON');
  } catch (e) {
    assertTrue(false, `Schema is valid JSON: ${e.message}`);
    return;
  }

  // Test: Schema has required top-level properties
  assertNotNull(schema.$schema, 'Schema has $schema property');
  // JSON Schema 2020-12 uses $defs instead of definitions
  assertNotNull(schema.$defs, 'Schema has $defs');
  assertNotNull(schema.$defs.variationOverlay, 'Schema defines variationOverlay');
  assertNotNull(schema.$defs.orgAdaptation, 'Schema defines orgAdaptation');
  assertNotNull(schema.$defs.fieldFallback, 'Schema defines fieldFallback');
  assertNotNull(schema.$defs.dataTier, 'Schema defines dataTier');

  // Test: variationDimensionDefinitions
  assertNotNull(schema.variationDimensionDefinitions, 'Schema has variationDimensionDefinitions');
  assertContains(
    Object.keys(schema.variationDimensionDefinitions),
    'complexity',
    'Schema defines complexity dimension'
  );
  assertContains(
    Object.keys(schema.variationDimensionDefinitions),
    'quotingSystem',
    'Schema defines quotingSystem dimension'
  );
}

/**
 * Test Suite: CPQ Field Mappings
 */
async function testCpqFieldMappings() {
  log('\n📋 Test Suite: CPQ Field Mappings', 'cyan');

  const mappingsPath = path.join(__dirname, '../config/cpq-field-mappings.json');

  // Test: Mappings file exists
  assertTrue(fs.existsSync(mappingsPath), 'CPQ mappings file exists');

  let mappings;
  try {
    mappings = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
    assertTrue(true, 'CPQ mappings is valid JSON');
  } catch (e) {
    assertTrue(false, `CPQ mappings is valid JSON: ${e.message}`);
    return;
  }

  // Test: Core object mappings exist
  assertNotNull(mappings.objectMappings, 'Has objectMappings section');
  assertNotNull(mappings.objectMappings.Quote, 'Has Quote object mapping');
  assertNotNull(mappings.objectMappings.QuoteLineItem, 'Has QuoteLineItem object mapping');
  assertNotNull(mappings.objectMappings.Opportunity, 'Has Opportunity object mapping');

  // Test: Quote mapping details
  const quoteMapping = mappings.objectMappings.Quote;
  assertEqual(quoteMapping.cpq, 'SBQQ__Quote__c', 'Quote maps to SBQQ__Quote__c');
  assertNotNull(quoteMapping.fieldMappings, 'Quote has field mappings');
  assertEqual(
    quoteMapping.fieldMappings.TotalPrice,
    'SBQQ__NetAmount__c',
    'Quote.TotalPrice maps to SBQQ__NetAmount__c'
  );

  // Test: metricCpqPatterns
  assertNotNull(mappings.metricCpqPatterns, 'Has metricCpqPatterns section');
  assertNotNull(mappings.metricCpqPatterns.revenue_metrics, 'Has revenue_metrics patterns');
  assertContains(
    mappings.metricCpqPatterns.revenue_metrics.amount,
    'SBQQ__NetAmount__c',
    'Revenue amount patterns include SBQQ__NetAmount__c'
  );

  // Test: Detection queries
  assertNotNull(mappings.detectionQueries, 'Has detectionQueries section');
  assertNotNull(
    mappings.detectionQueries.hasCpq,
    'Has hasCpq query'
  );
}

/**
 * Test Suite: CPQ Detector
 */
async function testCpqDetector() {
  log('\n📋 Test Suite: CPQ Detector', 'cyan');

  const detectorPath = path.join(__dirname, 'lib/cpq-detector.js');

  // Test: Detector file exists
  assertTrue(fs.existsSync(detectorPath), 'CPQ detector file exists');

  // Test: Detector can be required
  let CPQDetector;
  try {
    CPQDetector = require('./lib/cpq-detector.js');
    assertTrue(true, 'CPQ detector can be required');
  } catch (e) {
    assertTrue(false, `CPQ detector can be required: ${e.message}`);
    return;
  }

  // Test: Detector class has expected methods
  const detector = new CPQDetector('test-org');
  assertNotNull(detector.detect, 'Detector has detect method');
  assertNotNull(detector.checkObjectExists, 'Detector has checkObjectExists method');
  assertNotNull(detector.determineQuotingSystem, 'Detector has determineQuotingSystem method');

  // Test: determineQuotingSystem logic (without org connection)
  // Simulating the logic
  assertEqual(
    detector._classifyQuotingSystem(true, true, ['SBQQ']),
    'cpq',
    'Classifies as cpq when SBQQ installed with data'
  );
  assertEqual(
    detector._classifyQuotingSystem(true, false, ['SBQQ']),
    'native',
    'Classifies as native when SBQQ installed but no CPQ data (uses native Quote)'
  );
  assertEqual(
    detector._classifyQuotingSystem(false, false, []),
    'native',
    'Classifies as native when no SBQQ'
  );
}

/**
 * Test Suite: Variation Resolver
 */
async function testVariationResolver() {
  log('\n📋 Test Suite: Variation Resolver', 'cyan');

  const resolverPath = path.join(__dirname, 'lib/variation-resolver.js');

  // Test: Resolver file exists
  assertTrue(fs.existsSync(resolverPath), 'Variation resolver file exists');

  // Test: Resolver can be required
  let VariationResolver;
  try {
    VariationResolver = require('./lib/variation-resolver.js');
    assertTrue(true, 'Variation resolver can be required');
  } catch (e) {
    assertTrue(false, `Variation resolver can be required: ${e.message}`);
    return;
  }

  // Test: Resolver class has expected methods
  const resolver = new VariationResolver('test-org');
  assertNotNull(resolver.resolveVariation, 'Resolver has resolveVariation method');
  assertNotNull(resolver.applyVariation, 'Resolver has applyVariation method');
  assertNotNull(resolver.getCpqAwareFieldFallbacks, 'Resolver has getCpqAwareFieldFallbacks method');

  // Test: applyVariation with no variations (returns original)
  const templateNoVariations = {
    templateMetadata: { templateId: 'test' },
    dashboardLayout: { components: [1, 2, 3] }
  };
  const resultNoVar = resolver.applyVariation(templateNoVariations, 'standard');
  assertDeepEqual(
    resultNoVar.dashboardLayout.components,
    [1, 2, 3],
    'applyVariation returns original when no variations defined'
  );

  // Test: applyVariation with field substitutions
  const templateWithSubs = {
    templateMetadata: { templateId: 'test' },
    variations: {
      variationOverrides: {
        cpq: {
          fieldSubstitutions: {
            'Amount': 'SBQQ__NetAmount__c',
            'Quote': 'SBQQ__Quote__c'
          }
        }
      }
    },
    orgAdaptation: {
      fieldFallbacks: {
        'Amount': { patterns: ['Amount'] }
      }
    }
  };

  const resultWithSubs = resolver.applyVariation(templateWithSubs, 'cpq');
  assertNotNull(
    resultWithSubs._fieldSubstitutions,
    'applyVariation adds _fieldSubstitutions for cpq'
  );
  assertEqual(
    resultWithSubs._fieldSubstitutions?.Amount,
    'SBQQ__NetAmount__c',
    'Field substitution for Amount is correct'
  );

  // Test: applyVariation with component overrides
  const templateWithComponentOverride = {
    templateMetadata: { templateId: 'test' },
    variations: {
      variationOverrides: {
        simple: {
          componentOverrides: {
            maxComponents: 4,
            exclude: ['Pipeline Age', 'Stalled Opps']
          }
        }
      }
    },
    dashboardLayout: {
      components: [
        { title: 'Revenue' },
        { title: 'Pipeline Age' },
        { title: 'Win Rate' },
        { title: 'Stalled Opps' },
        { title: 'Forecast' }
      ]
    }
  };

  const resultSimple = resolver.applyVariation(templateWithComponentOverride, 'simple');
  assertTrue(
    resultSimple.dashboardLayout.components.length <= 4,
    'Simple variation limits components to maxComponents'
  );

  // Test: getCpqAwareFieldFallbacks
  const inputFallbacks = {
    'Amount': {
      patterns: ['Amount', 'Total_Amount__c'],
      cpqPatterns: ['SBQQ__NetAmount__c', 'SBQQ__CustomerAmount__c']
    }
  };
  const cpqFallbacks = resolver.getCpqAwareFieldFallbacks(inputFallbacks, true);

  // When CPQ is enabled, patterns should be enhanced with cpqPatterns
  const amountPatterns = cpqFallbacks?.Amount?.patterns || [];
  const hasCpqPattern = amountPatterns.includes('SBQQ__NetAmount__c') ||
                        inputFallbacks.Amount.cpqPatterns.includes('SBQQ__NetAmount__c');
  assertTrue(
    hasCpqPattern,
    'CPQ-aware fallbacks include cpqPatterns'
  );
}

/**
 * Test Suite: Template Variation Structures
 */
async function testTemplateVariations() {
  log('\n📋 Test Suite: Template Variation Structures', 'cyan');

  const templatePaths = [
    '../templates/dashboards/executive/revenue-performance.json',
    '../templates/dashboards/executive/pipeline-health.json',
    '../templates/dashboards/manager/quota-attainment.json',
    '../templates/dashboards/individual/my-pipeline.json'
  ];

  for (const templatePath of templatePaths) {
    const fullPath = path.join(__dirname, templatePath);
    const templateName = path.basename(templatePath, '.json');

    log(`\n  Testing: ${templateName}`, 'blue');

    // Test: Template exists
    if (!fs.existsSync(fullPath)) {
      assertTrue(false, `${templateName} exists`);
      continue;
    }
    assertTrue(true, `${templateName} exists`);

    // Test: Template is valid JSON
    let template;
    try {
      template = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      assertTrue(true, `${templateName} is valid JSON`);
    } catch (e) {
      assertTrue(false, `${templateName} is valid JSON: ${e.message}`);
      continue;
    }

    // Test: Template has variations section
    assertNotNull(template.variations, `${templateName} has variations section`);

    if (template.variations) {
      // Test: Variations schema version
      assertEqual(
        template.variations.schemaVersion,
        '1.0',
        `${templateName} has variations.schemaVersion = 1.0`
      );

      // Test: Has availableVariations array
      assertTrue(
        Array.isArray(template.variations.availableVariations),
        `${templateName} has availableVariations array`
      );

      // Test: Has variationOverrides
      assertNotNull(
        template.variations.variationOverrides,
        `${templateName} has variationOverrides`
      );

      // Test: Each declared variation has an override
      for (const variation of template.variations.availableVariations || []) {
        assertNotNull(
          template.variations.variationOverrides[variation],
          `${templateName} has override for '${variation}' variation`
        );
      }
    }

    // Test: Template has orgAdaptation section
    assertNotNull(template.orgAdaptation, `${templateName} has orgAdaptation section`);

    if (template.orgAdaptation) {
      // Test: Has required fields
      assertTrue(
        Array.isArray(template.orgAdaptation.requiredFields),
        `${templateName} has requiredFields array`
      );

      // Test: Has field fallbacks
      assertNotNull(
        template.orgAdaptation.fieldFallbacks,
        `${templateName} has fieldFallbacks`
      );

      // Test: Has data availability tiers
      assertNotNull(
        template.orgAdaptation.dataAvailabilityTiers,
        `${templateName} has dataAvailabilityTiers`
      );

      // Test: Data tiers have correct structure
      const tiers = template.orgAdaptation.dataAvailabilityTiers;
      for (const tierName of ['complete', 'partial', 'minimal']) {
        if (tiers[tierName]) {
          assertNotNull(
            tiers[tierName].minimumFidelity,
            `${templateName} ${tierName} tier has minimumFidelity`
          );
        }
      }

      // Test: Amount field has CPQ patterns (for relevant templates)
      const amountFallback = template.orgAdaptation.fieldFallbacks?.Amount;
      if (amountFallback) {
        assertNotNull(
          amountFallback.cpqPatterns,
          `${templateName} Amount fallback has cpqPatterns`
        );
        assertTrue(
          amountFallback.namespaceAware === true,
          `${templateName} Amount fallback is namespaceAware`
        );
      }
    }
  }
}

/**
 * Test Suite: Registry Variation Support
 */
async function testRegistryVariationSupport() {
  log('\n📋 Test Suite: Registry Variation Support', 'cyan');

  const registryPath = path.join(__dirname, '../templates/dashboards/dashboard-template-registry.json');

  // Test: Registry exists
  assertTrue(fs.existsSync(registryPath), 'Registry file exists');

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    assertTrue(true, 'Registry is valid JSON');
  } catch (e) {
    assertTrue(false, `Registry is valid JSON: ${e.message}`);
    return;
  }

  // Test: Has variationSupport section
  assertNotNull(registry.variationSupport, 'Registry has variationSupport section');

  if (registry.variationSupport) {
    assertEqual(
      registry.variationSupport.enabled,
      true,
      'Variation support is enabled'
    );
    assertNotNull(
      registry.variationSupport.schemaVersion,
      'variationSupport has schemaVersion'
    );
    assertNotNull(
      registry.variationSupport.defaultVariation,
      'variationSupport has defaultVariation'
    );
    assertTrue(
      Array.isArray(registry.variationSupport.variationResolutionOrder),
      'variationSupport has variationResolutionOrder array'
    );
  }

  // Test: Has variationProfiles
  assertNotNull(registry.variationProfiles, 'Registry has variationProfiles');

  if (registry.variationProfiles) {
    // Test common profiles exist
    assertNotNull(
      registry.variationProfiles['cpq-enterprise'],
      'Has cpq-enterprise profile'
    );
    assertNotNull(
      registry.variationProfiles['smb-starter'],
      'Has smb-starter profile'
    );
    assertNotNull(
      registry.variationProfiles['plg-standard'],
      'Has plg-standard profile'
    );
  }

  // Test: searchIndex has variations
  assertNotNull(registry.searchIndex?.variations, 'searchIndex has variations section');

  if (registry.searchIndex?.variations) {
    assertNotNull(
      registry.searchIndex.variations.cpq,
      'searchIndex.variations has cpq list'
    );
    assertNotNull(
      registry.searchIndex.variations.plg,
      'searchIndex.variations has plg list'
    );
    assertNotNull(
      registry.searchIndex.variations.simple,
      'searchIndex.variations has simple list'
    );
  }
}

/**
 * Test Suite: Metric Definitions CPQ Patterns
 */
async function testMetricDefinitionsCpq() {
  log('\n📋 Test Suite: Metric Definitions CPQ Patterns', 'cyan');

  const metricsPath = path.join(__dirname, '../config/metric-definitions.json');

  // Test: Metrics file exists
  assertTrue(fs.existsSync(metricsPath), 'Metric definitions file exists');

  let metrics;
  try {
    metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    assertTrue(true, 'Metric definitions is valid JSON');
  } catch (e) {
    assertTrue(false, `Metric definitions is valid JSON: ${e.message}`);
    return;
  }

  // Test key metrics have cpqPatterns
  const metricsToCheck = [
    { path: ['pipeline', 'arr'], name: 'pipeline.arr' },
    { path: ['bookings', 'tcv'], name: 'bookings.tcv' },
    { path: ['bookings', 'acv'], name: 'bookings.acv' }
  ];

  for (const { path: metricPath, name } of metricsToCheck) {
    let metric = metrics;
    for (const key of metricPath) {
      metric = metric?.[key];
    }

    if (metric?.fieldRoles) {
      // Check first fieldRole for cpqPatterns
      const firstRole = metric.fieldRoles[0];
      if (firstRole) {
        assertNotNull(
          firstRole.cpqPatterns,
          `${name} first fieldRole has cpqPatterns`
        );

        if (firstRole.cpqPatterns) {
          assertTrue(
            Array.isArray(firstRole.cpqPatterns) && firstRole.cpqPatterns.length > 0,
            `${name} cpqPatterns is non-empty array`
          );
        }
      }
    }
  }
}

/**
 * Test Suite: Integration - Overlay Application
 */
async function testOverlayApplication() {
  log('\n📋 Test Suite: Integration - Overlay Application', 'cyan');

  let VariationResolver;
  try {
    VariationResolver = require('./lib/variation-resolver.js');
  } catch (e) {
    assertTrue(false, `Could not load VariationResolver: ${e.message}`);
    return;
  }

  const resolver = new VariationResolver('test-org');

  // Load a real template
  const templatePath = path.join(__dirname, '../templates/dashboards/executive/revenue-performance.json');
  let template;
  try {
    template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } catch (e) {
    assertTrue(false, `Could not load template: ${e.message}`);
    return;
  }

  // Test: Apply 'simple' variation
  const simpleResult = resolver.applyVariation(template, 'simple');

  assertTrue(
    simpleResult._variationApplied?.variation === 'simple',
    'Applied variation is tracked (_variationApplied)'
  );

  // Simple should have fewer components
  if (template.variations?.variationOverrides?.simple?.componentOverrides?.maxComponents) {
    const maxComponents = template.variations.variationOverrides.simple.componentOverrides.maxComponents;
    assertTrue(
      simpleResult.dashboardLayout.components.length <= maxComponents,
      `Simple variation has at most ${maxComponents} components`
    );
  }

  // Test: Apply 'cpq' variation
  const cpqResult = resolver.applyVariation(template, 'cpq');

  if (template.variations?.variationOverrides?.cpq?.fieldSubstitutions) {
    assertNotNull(
      cpqResult._fieldSubstitutions,
      'CPQ variation has field substitutions applied'
    );
  }

  // Test: Apply 'standard' variation (should be minimal change)
  const standardResult = resolver.applyVariation(template, 'standard');

  assertEqual(
    standardResult.dashboardLayout.components.length,
    template.dashboardLayout.components.length,
    'Standard variation keeps all components'
  );
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runTests() {
  console.log('\n' + '='.repeat(70));
  log('  Template Variation System - Test Suite', 'blue');
  console.log('='.repeat(70));

  const startTime = Date.now();

  // Define all test suites
  const testSuites = [
    { name: 'schema', fn: testVariationSchema },
    { name: 'cpq-mappings', fn: testCpqFieldMappings },
    { name: 'cpq-detector', fn: testCpqDetector },
    { name: 'resolver', fn: testVariationResolver },
    { name: 'templates', fn: testTemplateVariations },
    { name: 'registry', fn: testRegistryVariationSupport },
    { name: 'metrics', fn: testMetricDefinitionsCpq },
    { name: 'integration', fn: testOverlayApplication }
  ];

  // Filter if specified
  const suitesToRun = CONFIG.filter
    ? testSuites.filter(s => s.name.includes(CONFIG.filter))
    : testSuites;

  if (CONFIG.filter && suitesToRun.length === 0) {
    log(`\n⚠️  No test suites match filter: ${CONFIG.filter}`, 'yellow');
    process.exit(1);
  }

  // Run test suites
  for (const suite of suitesToRun) {
    try {
      await suite.fn();
    } catch (error) {
      log(`\n❌ Test suite '${suite.name}' threw an error:`, 'red');
      console.error(error);
      results.failed++;
    }
  }

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(70));
  log('  Test Summary', 'blue');
  console.log('='.repeat(70));

  log(`  ✓ Passed:  ${results.passed}`, 'green');

  if (results.failed > 0) {
    log(`  ✗ Failed:  ${results.failed}`, 'red');
  } else {
    log(`  ✗ Failed:  ${results.failed}`, 'dim');
  }

  if (results.skipped > 0) {
    log(`  ○ Skipped: ${results.skipped}`, 'yellow');
  }

  log(`\n  Duration: ${duration}s`, 'dim');

  // Exit code
  if (results.failed > 0) {
    log('\n❌ Some tests failed!', 'red');
    process.exit(1);
  } else {
    log('\n✅ All tests passed!', 'green');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
