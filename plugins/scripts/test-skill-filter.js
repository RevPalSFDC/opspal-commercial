#!/usr/bin/env node
/**
 * Test Suite for Skill Filter (Week 2 Implementation)
 *
 * Tests the complete pipeline:
 * 1. Task keyword extraction
 * 2. Plugin selection
 * 3. Skill filtering within selected plugins
 * 4. Token savings validation
 *
 * Success Criteria:
 * - Relevance >90% (high-relevance skills loaded)
 * - Miss rate <5% (needed skills not missing)
 * - Token savings 20-30k additional (beyond plugin filtering)
 * - Performance <50ms overhead
 */

const { PluginSelector } = require('./lib/plugin-selector');
const { SkillFilter } = require('./lib/skill-filter');

class SkillFilterTests {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.totalTokenSavings = 0;
    this.totalPluginOnlySavings = 0;
  }

  addTest(name, taskDescription, category, minSkillsLoaded = 10, maxSkillsLoaded = 50, minAdditionalSavings = 5000) {
    this.tests.push({
      name,
      taskDescription,
      category,
      minSkillsLoaded,
      maxSkillsLoaded,
      minAdditionalSavings
    });
  }

  runTests() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SKILL FILTER TEST SUITE (Week 2 Implementation)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    this.tests.forEach((test, index) => {
      this.runTest(index + 1, test);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total Tests: ${this.tests.length}`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`);

    const avgTokenSavings = Math.round(this.totalTokenSavings / this.tests.length);
    const avgPluginOnlySavings = Math.round(this.totalPluginOnlySavings / this.tests.length);
    const additionalSavings = avgTokenSavings - avgPluginOnlySavings;

    console.log(`\nAverage Token Savings:`);
    console.log(`  Plugin-level only: ~${avgPluginOnlySavings} tokens`);
    console.log(`  With skill filtering: ~${avgTokenSavings} tokens`);
    console.log(`  Additional savings: ~${additionalSavings} tokens (${((additionalSavings / 69000) * 100).toFixed(1)}% of total skills)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return this.failed === 0;
  }

  runTest(number, test) {
    console.log(`Test ${number}: ${test.name}`);
    console.log(`Task: "${test.taskDescription}"`);

    const startTime = Date.now();

    // Step 1: Plugin selection
    const pluginSelector = new PluginSelector(test.taskDescription);
    const selectedPlugins = pluginSelector.selectPlugins();
    const pluginSavings = pluginSelector.estimateTokenSavings();

    // Step 2: Skill filtering within selected plugins
    const skillFilter = new SkillFilter(test.taskDescription, selectedPlugins);
    const filteredSkills = skillFilter.filterSkills();
    const skillSavings = skillFilter.estimateTokenSavings();
    const breakdown = skillFilter.getDetailedBreakdown();

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Calculate total skills loaded
    const totalSkillsLoaded = Object.values(filteredSkills).reduce((sum, skills) => sum + skills.length, 0);

    // Validation checks
    const checksPass = [];
    const checksFail = [];

    // Check 1: Skills loaded within expected range
    if (totalSkillsLoaded >= test.minSkillsLoaded && totalSkillsLoaded <= test.maxSkillsLoaded) {
      checksPass.push(`Skills loaded: ${totalSkillsLoaded} (within ${test.minSkillsLoaded}-${test.maxSkillsLoaded})`);
    } else {
      checksFail.push(`Skills loaded: ${totalSkillsLoaded} (expected ${test.minSkillsLoaded}-${test.maxSkillsLoaded})`);
    }

    // Check 2: Performance under 50ms
    if (duration < 50) {
      checksPass.push(`Performance: ${duration}ms (target: <50ms)`);
    } else {
      checksFail.push(`Performance: ${duration}ms (target: <50ms)`);
    }

    // Check 3: Additional token savings meet minimum threshold
    const additionalSavings = skillSavings.savedTokens;
    if (additionalSavings >= test.minAdditionalSavings) {
      checksPass.push(`Additional savings: ${additionalSavings} tokens (target: >${test.minAdditionalSavings})`);
    } else {
      checksFail.push(`Additional savings: ${additionalSavings} tokens (target: >${test.minAdditionalSavings})`);
    }

    // Check 4: At least some skills filtered (not loading all)
    const filterRate = (skillSavings.savedSkills / skillSavings.totalSkillsInSelectedPlugins) * 100;
    if (filterRate > 10) { // At least 10% filtering
      checksPass.push(`Filter rate: ${filterRate.toFixed(1)}% (skills filtered from selected plugins)`);
    } else {
      checksFail.push(`Filter rate: ${filterRate.toFixed(1)}% (too few skills filtered)`);
    }

    // Determine pass/fail
    const passed = checksFail.length === 0;

    if (passed) {
      console.log('✅ PASS');
      this.passed++;
    } else {
      console.log('❌ FAIL');
      this.failed++;
    }

    // Display results
    console.log(`  Plugins: ${selectedPlugins.join(', ')}`);
    console.log(`  Skills loaded: ${totalSkillsLoaded} across ${selectedPlugins.length} plugins`);

    for (const [plugin, data] of Object.entries(breakdown)) {
      console.log(`    ${plugin}: ${data.loadedSkills}/${data.totalSkills} skills`);
    }

    console.log(`  Token savings:`);
    console.log(`    Plugin-level only: ${pluginSavings.savedTokens} tokens (${pluginSavings.savingsPercent})`);
    console.log(`    With skill filtering: ${pluginSavings.savedTokens + skillSavings.savedTokens} tokens`);
    console.log(`    Additional from skill filtering: ${skillSavings.savedTokens} tokens`);
    console.log(`  Performance: ${duration}ms`);

    if (checksFail.length > 0) {
      console.log('  Failed checks:');
      checksFail.forEach(check => console.log(`    ❌ ${check}`));
    }

    console.log('');

    // Track token savings for summary
    this.totalTokenSavings += (pluginSavings.savedTokens + skillSavings.savedTokens);
    this.totalPluginOnlySavings += pluginSavings.savedTokens;
  }
}

// Initialize test suite
const suite = new SkillFilterTests();

// ========================================
// Category 1: Simple Platform-Specific Tasks
// Expect 12-20 skills loaded (minimal)
// ========================================

suite.addTest(
  'Salesforce Data Import',
  'Import 500 leads from CSV to Salesforce',
  'simple',
  10,
  25,
  10000 // Expect at least 10k additional token savings
);

suite.addTest(
  'HubSpot Workflow Creation',
  'Create HubSpot workflow to send email when deal closes',
  'simple',
  8,
  15,
  3000
);

suite.addTest(
  'Marketo Lead Scoring',
  'Configure lead scoring model in Marketo',
  'simple',
  5,
  20,
  100 // Small plugin, minimal additional savings
);

// ========================================
// Category 2: Specialized Domain Tasks
// Expect 20-40 skills loaded (moderate)
// ========================================

suite.addTest(
  'Salesforce CPQ Assessment',
  'Run comprehensive CPQ assessment for eta-corp',
  'specialized',
  20,
  40,
  30000 // Multi-plugin, expect significant savings
);

suite.addTest(
  'RevOps Pipeline Audit',
  'Analyze Salesforce pipeline and forecast accuracy',
  'specialized',
  20,
  40,
  30000
);

suite.addTest(
  'Territory Management Setup',
  'Configure territory assignment rules for EMEA region',
  'specialized',
  10,
  25,
  10000
);

// ========================================
// Category 3: Multi-Platform Tasks
// Expect 40-60 skills loaded (comprehensive)
// ========================================

suite.addTest(
  'Cross-Platform Data Sync',
  'Synchronize contact data between Salesforce and HubSpot',
  'multi-platform',
  35,
  55,
  35000 // 3 plugins, expect high savings
);

suite.addTest(
  'Executive Dashboard Creation',
  'Generate executive dashboard with Salesforce and HubSpot metrics',
  'multi-platform',
  35,
  55,
  35000
);

suite.addTest(
  'Multi-Platform Deduplication',
  'Deduplicate contact records across Salesforce, HubSpot, and Marketo',
  'multi-platform',
  50,
  75,
  35000 // 4-5 plugins
);

// ========================================
// Category 4: Cross-Platform Reporting
// Expect 25-40 skills loaded
// ========================================

suite.addTest(
  'Diagram Generation',
  'Create ERD diagram of Salesforce CPQ data model',
  'reporting',
  25,
  40,
  30000
);

suite.addTest(
  'PDF Report Generation',
  'Generate PDF report of Q4 sales performance',
  'reporting',
  10,
  25,
  15000
);

// ========================================
// Category 5: Automation Tasks
// Expect 15-30 skills loaded
// ========================================

suite.addTest(
  'Salesforce Flow Creation',
  'Create automation flow to update opportunity stage based on activity',
  'automation',
  10,
  25,
  10000
);

suite.addTest(
  'Automation Audit',
  'Audit all Salesforce automation for conflicts and circular dependencies',
  'automation',
  20,
  40,
  30000
);

// ========================================
// Category 6: Integration Tasks
// Expect 25-40 skills loaded
// ========================================

suite.addTest(
  'API Integration Setup',
  'Configure webhook integration between Salesforce and external system',
  'integration',
  20,
  40,
  30000
);

suite.addTest(
  'Data Migration',
  'Migrate customer data from legacy CRM to Salesforce',
  'integration',
  10,
  25,
  10000
);

// ========================================
// Category 7: Edge Cases
// Variable expectations
// ========================================

suite.addTest(
  'Generic Task (Minimal Keywords)',
  'Help me with this Salesforce project',
  'edge-case',
  10,
  30,
  10000
);

suite.addTest(
  'Highly Specific Task',
  'Update the Account object page layout to include Industry field',
  'edge-case',
  8,
  25,
  15000
);

// ========================================
// Category 8: Performance Tests
// Validate fast execution
// ========================================

suite.addTest(
  'Complex Multi-Step Task',
  'Audit Salesforce CPQ automation, generate architecture diagram, export findings to PDF',
  'performance',
  25,
  45,
  30000
);

suite.addTest(
  'Bulk Operation',
  'Bulk import 10,000 account records with territory assignment',
  'performance',
  20,
  40,
  15000
);

// Run all tests
const success = suite.runTests();

// Exit with appropriate code
process.exit(success ? 0 : 1);
