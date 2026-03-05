#!/usr/bin/env node
/**
 * Validation Suite - Verify migration to central services
 *
 * Validates that all deprecated services have been migrated and
 * central services are functioning correctly.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEPRECATION_MANIFEST = path.join(__dirname, '../config/deprecation_manifest.json');
const SERVICE_REGISTRY = path.join(__dirname, '../config/central_services.json');
const ROUTING_POLICY = path.join(__dirname, '../config/routing_policy.json');

class MigrationValidator {
  constructor() {
    this.manifest = JSON.parse(fs.readFileSync(DEPRECATION_MANIFEST, 'utf-8'));
    this.registry = JSON.parse(fs.readFileSync(SERVICE_REGISTRY, 'utf-8'));
    this.policy = JSON.parse(fs.readFileSync(ROUTING_POLICY, 'utf-8'));
    this.errors = [];
    this.warnings = [];
  }

  async validate() {
    console.log('=== OpsPal Migration Validation Suite ===\n');

    // Test 1: Verify deprecated services removed
    await this.testDeprecatedServicesRemoved();

    // Test 2: Verify agents reference central services
    await this.testAgentsReferenceCentralServices();

    // Test 3: Validate service contracts
    await this.testServiceContracts();

    // Test 4: Verify routing policy coverage
    await this.testRoutingPolicyCoverage();

    // Test 5: Test report service
    await this.testReportService();

    // Test 6: Test match/merge service
    await this.testMatchMergeService();

    // Generate report
    this.generateReport();
  }

  async testDeprecatedServicesRemoved() {
    console.log('📋 Test 1: Deprecated Services Removed\n');

    for (const category of this.manifest.deprecations) {
      for (const item of category.items) {
        if (item.type === 'script' || item.type === 'agent') {
          const fullPath = path.join(process.cwd(), item.path);
          const archived = fullPath.replace(/\.claude-plugins/, '.claude-plugins/.archived');

          if (fs.existsSync(fullPath) && !fs.existsSync(archived)) {
            this.errors.push(`Deprecated file still exists: ${item.path}`);
            console.log(`  ❌ ${item.path} should be removed`);
          } else if (fs.existsSync(archived)) {
            console.log(`  ✅ ${item.path} archived`);
          } else {
            console.log(`  ✅ ${item.path} not found (expected)`);
          }
        } else if (item.type === 'agent_partial' || item.type === 'script_partial') {
          console.log(`  ⚠️  ${item.path} partial deprecation (manual review required)`);
          this.warnings.push(`Manual review required: ${item.path}`);
        }
      }
    }

    console.log('');
  }

  async testAgentsReferenceCentralServices() {
    console.log('🤖 Test 2: Agents Reference Central Services\n');

    const agentsToCheck = [
      '.claude-plugins/salesforce-plugin/agents/sfdc-revops-auditor.md',
      '.claude-plugins/salesforce-plugin/agents/sfdc-cpq-assessor.md',
      '.claude-plugins/salesforce-plugin/agents/sfdc-automation-auditor.md'
    ];

    for (const agentPath of agentsToCheck) {
      if (fs.existsSync(agentPath)) {
        const content = fs.readFileSync(agentPath, 'utf-8');

        if (content.includes('report_service') || content.includes('ReportService')) {
          console.log(`  ✅ ${path.basename(agentPath)} references report_service`);
        } else {
          this.errors.push(`${agentPath} does not reference report_service`);
          console.log(`  ❌ ${path.basename(agentPath)} missing report_service reference`);
        }
      } else {
        console.log(`  ⚠️  ${path.basename(agentPath)} not found`);
      }
    }

    console.log('');
  }

  async testServiceContracts() {
    console.log('📜 Test 3: Service Contracts Validated\n');

    for (const service of this.registry.services) {
      console.log(`  Validating ${service.name}...`);

      // Check required contract fields
      if (!service.contract || !service.contract.input || !service.contract.output) {
        this.errors.push(`${service.name} missing contract fields`);
        console.log(`    ❌ Missing contract fields`);
        continue;
      }

      // Check if library/agent exists
      if (service.library) {
        const libPath = path.join(__dirname, '..', service.library);
        if (fs.existsSync(libPath)) {
          console.log(`    ✅ Library exists: ${service.library}`);
        } else {
          this.errors.push(`${service.name} library not found: ${service.library}`);
          console.log(`    ❌ Library not found: ${service.library}`);
        }
      }

      if (service.agent) {
        const agentPath = path.join(__dirname, '..', 'agents', `${service.agent}.md`);
        if (fs.existsSync(agentPath)) {
          console.log(`    ✅ Agent exists: ${service.agent}`);
        } else {
          this.errors.push(`${service.name} agent not found: ${service.agent}`);
          console.log(`    ❌ Agent not found: ${service.agent}`);
        }
      }
    }

    console.log('');
  }

  async testRoutingPolicyCoverage() {
    console.log('🔀 Test 4: Routing Policy Coverage\n');

    const concerns = ['report_generation', 'match_merge'];

    for (const concern of concerns) {
      const rules = this.policy.rules.filter(r => r.concern === concern);

      if (rules.length === 0) {
        this.errors.push(`No routing rules for concern: ${concern}`);
        console.log(`  ❌ No rules for ${concern}`);
      } else {
        console.log(`  ✅ ${rules.length} rule(s) for ${concern}`);

        // Check enforcement levels
        const mandatory = rules.filter(r => r.enforcement === 'mandatory');
        console.log(`    - ${mandatory.length} mandatory`);
      }
    }

    console.log('');
  }

  async testReportService() {
    console.log('📊 Test 5: Report Service\n');

    try {
      const ReportService = require('../scripts/lib/report-service.js');
      const service = new ReportService();

      const testRequest = {
        report_type: 'exec_update',
        audience: 'exec',
        objectives: ['Test report service'],
        key_messages: ['Service functional'],
        inputs: {
          facts: ['Test fact 1'],
          metrics: { test_metric: 100 }
        },
        constraints: { length: 'short', style: 'neutral', pii_policy: 'mask', format: 'markdown' }
      };

      const response = await service.generateReport(testRequest);

      if (response.content && response.content.length > 0) {
        console.log('  ✅ Report service generates content');
      } else {
        this.errors.push('Report service returned empty content');
        console.log('  ❌ Empty content returned');
      }

      if (response.validation && response.validation.hallucination_risk !== undefined) {
        console.log(`  ✅ Validation included (hallucination_risk: ${response.validation.hallucination_risk})`);
      } else {
        this.warnings.push('Report service missing validation data');
        console.log('  ⚠️  Missing validation data');
      }

    } catch (error) {
      this.errors.push(`Report service test failed: ${error.message}`);
      console.log(`  ❌ Error: ${error.message}`);
    }

    console.log('');
  }

  async testMatchMergeService() {
    console.log('🔀 Test 6: Match/Merge Service\n');

    try {
      const RecordMatchMergeService = require('../../data-hygiene-plugin/scripts/lib/record-match-merge-service.js');
      const service = new RecordMatchMergeService();

      const testRequest = {
        platform: 'salesforce',
        object_type: 'Account',
        records: [
          { Id: '001test1', Name: 'Test Corp', AnnualRevenue: 100000 },
          { Id: '001test2', Name: 'Test Corporation', AnnualRevenue: null }
        ],
        id_fields: ['Id', 'Name'],
        strategy: 'fuzzy',
        survivor_strategy: 'relationship_score',
        conflict_resolution: 'preserve_master',
        dry_run: true
      };

      const response = await service.executeMatchMerge(testRequest);

      if (response.clusters && Array.isArray(response.clusters)) {
        console.log(`  ✅ Match/merge service detects clusters (found: ${response.clusters.length})`);
      } else {
        this.errors.push('Match/merge service did not return clusters');
        console.log('  ❌ No clusters returned');
      }

      if (response.validation && response.validation.confidence !== undefined) {
        console.log(`  ✅ Validation included (confidence: ${response.validation.confidence.toFixed(2)})`);
      } else {
        this.warnings.push('Match/merge service missing validation data');
        console.log('  ⚠️  Missing validation data');
      }

    } catch (error) {
      this.errors.push(`Match/merge service test failed: ${error.message}`);
      console.log(`  ❌ Error: ${error.message}`);
    }

    console.log('');
  }

  generateReport() {
    console.log('📝 Validation Summary\n');
    console.log(`  ✅ Passed: ${this.errors.length === 0 ? 'YES' : 'NO'}`);
    console.log(`  ❌ Errors: ${this.errors.length}`);
    console.log(`  ⚠️  Warnings: ${this.warnings.length}`);

    if (this.errors.length > 0) {
      console.log('\n❌ Errors:\n');
      this.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:\n');
      this.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (this.errors.length === 0) {
      console.log('\n✅ Migration validation PASSED!');
      console.log('\nNext steps:');
      console.log('  1. Commit changes to git');
      console.log('  2. Update plugin manifests');
      console.log('  3. Notify users of migration completion');
    } else {
      console.log('\n❌ Migration validation FAILED!');
      console.log('\nAction required:');
      console.log('  1. Fix errors listed above');
      console.log('  2. Re-run validation: node validate-migration.js');
      console.log('  3. If issues persist, run rollback: See deprecation_manifest.json');
      process.exit(1);
    }
  }
}

// CLI execution
if (require.main === module) {
  const validator = new MigrationValidator();
  validator.validate().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
}

module.exports = MigrationValidator;
