#!/usr/bin/env node
/**
 * Test Suite for Plugin Selector
 *
 * Validates that plugin selection works correctly across various task types
 * and achieves expected token savings.
 */

const { PluginSelector } = require('./lib/plugin-selector');

class PluginSelectorTests {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  addTest(name, taskDescription, expectedPlugins, minSavingsPercent = 80) {
    this.tests.push({
      name,
      taskDescription,
      expectedPlugins,
      minSavingsPercent
    });
  }

  runTests() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PLUGIN SELECTOR TEST SUITE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    this.tests.forEach((test, index) => {
      this.runTest(index + 1, test);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total: ${this.tests.length}`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return this.failed === 0;
  }

  runTest(number, test) {
    console.log(`Test ${number}: ${test.name}`);
    console.log(`Task: "${test.taskDescription}"`);

    const selector = new PluginSelector(test.taskDescription);
    const actualPlugins = selector.selectPlugins();
    const savings = selector.estimateTokenSavings();

    // Check plugin selection
    const pluginsMatch = this.arraysEqual(
      actualPlugins.sort(),
      test.expectedPlugins.sort()
    );

    // Check token savings
    const savingsPercent = parseFloat(savings.savingsPercent);
    const savingsMet = savingsPercent >= test.minSavingsPercent;

    const passed = pluginsMatch && savingsMet;

    if (passed) {
      console.log('✅ PASS');
      this.passed++;
    } else {
      console.log('❌ FAIL');
      this.failed++;

      if (!pluginsMatch) {
        console.log(`  Expected plugins: ${test.expectedPlugins.join(', ')}`);
        console.log(`  Actual plugins:   ${actualPlugins.join(', ')}`);
      }
      if (!savingsMet) {
        console.log(`  Expected savings: >=${test.minSavingsPercent}%`);
        console.log(`  Actual savings:   ${savingsPercent}%`);
      }
    }

    console.log(`  Plugins: ${actualPlugins.join(', ')}`);
    console.log(`  Skills loaded: ${savings.loadedSkills}/${savings.totalSkills}`);
    console.log(`  Token savings: ${savings.savingsPercent} (~${savings.savedTokens} tokens)`);
    console.log('');
  }

  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

// Initialize test suite
const suite = new PluginSelectorTests();

// ========================================
// Salesforce Tests
// ========================================

suite.addTest(
  'Salesforce CPQ Assessment',
  'Run CPQ assessment for eta-corp',
  ['salesforce-plugin', 'opspal-core'],
  82 // 2 plugins needed for assessment + reporting
);

suite.addTest(
  'Salesforce Data Import',
  'Import 500 leads from CSV to Salesforce',
  ['salesforce-plugin'],
  85
);

suite.addTest(
  'Salesforce RevOps Audit',
  'Analyze Salesforce pipeline and forecast accuracy',
  ['salesforce-plugin', 'opspal-core'],
  80
);

suite.addTest(
  'Salesforce Territory Management',
  'Set up territory assignment rules for EMEA region',
  ['salesforce-plugin'],
  85
);

suite.addTest(
  'Salesforce Flow Creation',
  'Create automation flow to update opportunity stage',
  ['salesforce-plugin'],
  85
);

// ========================================
// HubSpot Tests
// ========================================

suite.addTest(
  'HubSpot Workflow',
  'Create HubSpot workflow to send email when deal closes',
  ['hubspot-plugin'],
  85
);

suite.addTest(
  'HubSpot Data Export',
  'Export all HubSpot contacts to CSV for analysis',
  ['hubspot-plugin'],
  85
);

suite.addTest(
  'HubSpot Lead Scoring',
  'Configure lead scoring model in HubSpot',
  ['hubspot-plugin'],
  85
);

// ========================================
// Cross-Platform Tests
// ========================================

suite.addTest(
  'Multi-Platform Dashboard',
  'Generate executive dashboard with Salesforce and HubSpot data',
  ['salesforce-plugin', 'hubspot-plugin', 'opspal-core'],
  70 // Lower threshold due to multiple plugins
);

suite.addTest(
  'Diagram Generation',
  'Create ERD diagram of Salesforce CPQ data model',
  ['salesforce-plugin', 'opspal-core'],
  80
);

suite.addTest(
  'PDF Report',
  'Generate PDF report of Q4 sales performance',
  ['opspal-core'],
  85
);

suite.addTest(
  'Data Sync',
  'Synchronize contact data between Salesforce and HubSpot',
  ['salesforce-plugin', 'hubspot-plugin', 'opspal-core'],
  70
);

// ========================================
// Specialized Plugin Tests
// ========================================

suite.addTest(
  'Marketo Lead Nurture',
  'Set up lead nurture program in Marketo',
  ['marketo-plugin'],
  85
);

suite.addTest(
  'Monday.com Board',
  'Create project tracking board in Monday',
  ['monday-plugin'],
  85
);

suite.addTest(
  'Data Deduplication',
  'Deduplicate contact records across all systems',
  ['opspal-core', 'salesforce-plugin', 'hubspot-plugin', 'data-hygiene-plugin'],
  75 // 4 plugins needed for cross-system dedup
);

suite.addTest(
  'GTM Strategy',
  'Create go-to-market launch plan for new product',
  ['gtm-planning-plugin', 'opspal-core'], // GTM + cross-platform for planning docs
  85
);

// ========================================
// Edge Cases
// ========================================

suite.addTest(
  'Generic Task (No Keywords)',
  'Help me with this project',
  ['salesforce-plugin', 'hubspot-plugin', 'opspal-core'],
  70 // Default to core plugins
);

suite.addTest(
  'Ambiguous Platform',
  'Import data and create workflow',
  ['opspal-core'], // Truly ambiguous - load minimal
  85
);

suite.addTest(
  'AI Consulting',
  'AI strategy assessment for sales team',
  ['ai-consult-plugin', 'opspal-core'], // AI + cross-platform for assessment docs
  85
);

// ========================================
// Performance Tests
// ========================================

suite.addTest(
  'Bulk Operation (Salesforce)',
  'Bulk upload 10,000 account records to Salesforce',
  ['salesforce-plugin'],
  85
);

suite.addTest(
  'Complex Multi-Step',
  'Audit Salesforce automation, generate diagram, export to PDF',
  ['salesforce-plugin', 'opspal-core'],
  80
);

// Run all tests
const success = suite.runTests();

// Exit with appropriate code
process.exit(success ? 0 : 1);
