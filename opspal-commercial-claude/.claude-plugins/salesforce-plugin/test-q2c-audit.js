#!/usr/bin/env node
/**
 * Test Q2C Audit Orchestrator against NeonOne Production
 *
 * This is a READ-ONLY test that generates Q2C audit diagrams.
 */

const Q2CAuditOrchestrator = require('./scripts/lib/q2c-audit-orchestrator');
const path = require('path');

async function runTest() {
  console.log('🚀 Starting Q2C Audit Test - NeonOne Production (Read-Only)\n');

  const orgAlias = 'neonone';
  const outputDir = path.join(__dirname, 'test-output', `q2c-audit-${orgAlias}-${Date.now()}`);

  console.log(`📋 Configuration:`);
  console.log(`   Org: ${orgAlias}`);
  console.log(`   Output: ${outputDir}`);
  console.log(`   Detail Level: both (high-level + detailed)\n`);

  try {
    // Initialize orchestrator
    const orchestrator = new Q2CAuditOrchestrator(orgAlias, {
      outputDir,
      detailLevel: 'both',
      includeInactive: false,
      generateSummary: true,
      verbose: true
    });

    console.log('⚙️  Generating Q2C audit diagrams...\n');

    // Run complete audit
    const startTime = Date.now();
    const results = await orchestrator.generateCompleteAudit();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ Q2C Audit Complete!\n');
    console.log('📊 Results Summary:');
    console.log(`   Duration: ${duration}s`);
    console.log(`   Output Directory: ${outputDir}`);

    // Get statistics
    const stats = orchestrator.getStatistics();
    console.log('\n📈 Statistics:');
    console.log(`   Diagrams Generated: ${stats.diagramsGenerated}`);
    console.log(`   Total Diagrams: ${stats.totalDiagrams}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Warnings: ${stats.warnings}`);

    if (results.diagrams.q2cProcess?.generated) {
      console.log('\n📄 Q2C Process Flow: ✅ Generated');
      if (results.diagrams.q2cProcess.highLevel) {
        console.log(`   High-Level: ${results.diagrams.q2cProcess.highLevel.paths?.markdown}`);
      }
      if (results.diagrams.q2cProcess.detailed) {
        console.log(`   Detailed: ${results.diagrams.q2cProcess.detailed.paths?.markdown}`);
      }
    }

    if (results.diagrams.erd?.generated) {
      console.log('\n🔗 Entity Relationship Diagram: ✅ Generated');
      if (results.diagrams.erd.highLevel) {
        console.log(`   High-Level: ${results.diagrams.erd.highLevel.paths?.markdown}`);
      }
      if (results.diagrams.erd.detailed) {
        console.log(`   Detailed: ${results.diagrams.erd.detailed.paths?.markdown}`);
      }
    }

    if (results.diagrams.automation?.generated) {
      console.log('\n⚙️  Automation Cascades: ✅ Generated');
      console.log(`   Cascades Found: ${results.diagrams.automation.cascades || 0}`);
      console.log(`   Circular Dependencies: ${results.diagrams.automation.circularDependencies || 0}`);
      if (results.diagrams.automation.highLevel) {
        console.log(`   High-Level: ${results.diagrams.automation.highLevel.paths?.markdown}`);
      }
      if (results.diagrams.automation.detailed) {
        console.log(`   Detailed: ${results.diagrams.automation.detailed.paths?.markdown}`);
      }
    }

    if (results.diagrams.approvals?.generated) {
      console.log('\n✅ Approval Flows: ✅ Generated');
      console.log(`   Processes Found: ${results.diagrams.approvals.processCount || 0}`);
      if (results.diagrams.approvals.diagrams) {
        results.diagrams.approvals.diagrams.forEach(diagram => {
          console.log(`   - ${diagram.processName} (${diagram.object})`);
        });
      }
    }

    if (results.diagrams.cpqConfiguration) {
      if (results.diagrams.cpqConfiguration.generated) {
        console.log('\n📊 CPQ Configuration: ✅ Generated');
      } else {
        console.log('\n📊 CPQ Configuration: ℹ️  Skipped (requires assessment data)');
        if (results.diagrams.cpqConfiguration.reason) {
          console.log(`   Reason: ${results.diagrams.cpqConfiguration.reason}`);
        }
      }
    }

    if (results.errors && results.errors.length > 0) {
      console.log('\n❌ Errors:');
      results.errors.forEach(error => {
        console.log(`   [${error.phase}] ${error.message}`);
      });
    }

    if (results.warnings && results.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      results.warnings.forEach(warning => {
        console.log(`   [${warning.phase}] ${warning.message}`);
      });
    }

    console.log('\n📁 View Results:');
    console.log(`   Summary: ${path.join(outputDir, 'Q2C-AUDIT-SUMMARY.md')}`);
    console.log(`   All Diagrams: ${outputDir}`);

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run test
runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
