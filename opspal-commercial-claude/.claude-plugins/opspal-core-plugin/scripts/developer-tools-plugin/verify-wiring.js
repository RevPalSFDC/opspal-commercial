#!/usr/bin/env node
/**
 * Wiring Verification Script
 *
 * Verifies that all agents are properly wired to use central services
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

class WiringVerifier {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  async verify() {
    console.log('=== Centralized Services Wiring Verification ===\n');

    // Test 1: Check agent wiring
    await this.testAgentWiring();

    // Test 2: Check service accessibility
    await this.testServiceAccessibility();

    // Test 3: Check configuration files
    await this.testConfigurationFiles();

    // Test 4: Check report service functionality
    await this.testReportServiceFunctionality();

    // Generate report
    this.generateReport();
  }

  async testAgentWiring() {
    console.log('📝 Test 1: Agent Wiring\n');

    const agentsToCheck = [
      '.claude-plugins/salesforce-plugin/agents/sfdc-revops-auditor.md',
      '.claude-plugins/salesforce-plugin/agents/sfdc-cpq-assessor.md',
      '.claude-plugins/salesforce-plugin/agents/sfdc-automation-auditor.md',
      '.claude-plugins/salesforce-plugin/agents/sfdc-quality-auditor.md'
    ];

    for (const agentPath of agentsToCheck) {
      if (!fs.existsSync(agentPath)) {
        this.warnings.push(`Agent not found: ${agentPath}`);
        console.log(`  ⚠️  ${path.basename(agentPath)} not found`);
        continue;
      }

      const content = fs.readFileSync(agentPath, 'utf-8');

      // Check for centralized service references
      const hasServiceReference = content.includes('CENTRALIZED SERVICE') ||
                                   content.includes('report_service') ||
                                   content.includes('ReportService');

      const hasUsageExample = content.includes('const ReportService = require') ||
                               content.includes('const service = new ReportService');

      const hasServicePath = content.includes('../../../developer-tools-plugin/scripts/lib/report-service.js');

      if (hasServiceReference && hasUsageExample && hasServicePath) {
        this.successes.push(`${agentPath} properly wired`);
        console.log(`  ✅ ${path.basename(agentPath)} wired correctly`);
      } else {
        const missing = [];
        if (!hasServiceReference) missing.push('service reference');
        if (!hasUsageExample) missing.push('usage example');
        if (!hasServicePath) missing.push('service path');

        this.errors.push(`${agentPath} missing: ${missing.join(', ')}`);
        console.log(`  ❌ ${path.basename(agentPath)} missing: ${missing.join(', ')}`);
      }
    }

    console.log('');
  }

  async testServiceAccessibility() {
    console.log('🔍 Test 2: Service Accessibility\n');

    const services = [
      {
        name: 'report_service',
        path: '.claude-plugins/developer-tools-plugin/scripts/lib/report-service.js'
      },
      {
        name: 'record_match_and_merge',
        path: '.claude-plugins/data-hygiene-plugin/scripts/lib/record-match-merge-service.js'
      }
    ];

    for (const service of services) {
      if (fs.existsSync(service.path)) {
        try {
          const ServiceClass = require(path.join(process.cwd(), service.path));
          const instance = new ServiceClass();

          this.successes.push(`${service.name} accessible and instantiable`);
          console.log(`  ✅ ${service.name} accessible`);
        } catch (error) {
          this.errors.push(`${service.name} failed to load: ${error.message}`);
          console.log(`  ❌ ${service.name} failed to load: ${error.message}`);
        }
      } else {
        this.errors.push(`${service.name} file not found: ${service.path}`);
        console.log(`  ❌ ${service.name} file not found`);
      }
    }

    console.log('');
  }

  async testConfigurationFiles() {
    console.log('⚙️  Test 3: Configuration Files\n');

    const configs = [
      {
        name: 'Service Registry',
        path: '.claude-plugins/developer-tools-plugin/config/central_services.json',
        requiredFields: ['services', 'version']
      },
      {
        name: 'Routing Policy',
        path: '.claude-plugins/developer-tools-plugin/config/routing_policy.json',
        requiredFields: ['rules', 'thresholds']
      },
      {
        name: 'Settings (documentation)',
        path: '.claude/settings.json',
        requiredFields: ['comments']
      }
    ];

    for (const config of configs) {
      if (!fs.existsSync(config.path)) {
        this.errors.push(`${config.name} not found: ${config.path}`);
        console.log(`  ❌ ${config.name} not found`);
        continue;
      }

      try {
        const content = JSON.parse(fs.readFileSync(config.path, 'utf-8'));

        const missingFields = config.requiredFields.filter(field => !content[field]);

        if (missingFields.length === 0) {
          this.successes.push(`${config.name} valid`);
          console.log(`  ✅ ${config.name} valid`);
        } else {
          this.errors.push(`${config.name} missing fields: ${missingFields.join(', ')}`);
          console.log(`  ❌ ${config.name} missing: ${missingFields.join(', ')}`);
        }
      } catch (error) {
        this.errors.push(`${config.name} invalid JSON: ${error.message}`);
        console.log(`  ❌ ${config.name} invalid JSON`);
      }
    }

    console.log('');
  }

  async testReportServiceFunctionality() {
    console.log('🧪 Test 4: Report Service Functionality\n');

    try {
      const ReportService = require('../scripts/lib/report-service.js');
      const service = new ReportService();

      const testRequest = {
        report_type: 'exec_update',
        audience: 'exec',
        objectives: ['Test wiring verification'],
        key_messages: ['Wiring complete', 'Services functional'],
        inputs: {
          facts: ['Test fact 1', 'Test fact 2'],
          metrics: { test_score: 100 }
        },
        constraints: { length: 'short', style: 'neutral', pii_policy: 'mask', format: 'markdown' }
      };

      const report = await service.generateReport(testRequest);

      if (report.content && report.content.length > 0) {
        this.successes.push('report_service generates content');
        console.log('  ✅ report_service generates content');
      } else {
        this.errors.push('report_service returned empty content');
        console.log('  ❌ report_service returned empty content');
      }

      if (report.validation) {
        this.successes.push('report_service includes validation');
        console.log('  ✅ report_service includes validation');
      } else {
        this.warnings.push('report_service missing validation');
        console.log('  ⚠️  report_service missing validation');
      }

      if (report.metadata && report.metadata.author === 'report-service') {
        this.successes.push('report_service includes metadata');
        console.log('  ✅ report_service includes metadata');
      } else {
        this.warnings.push('report_service missing metadata');
        console.log('  ⚠️  report_service missing metadata');
      }

    } catch (error) {
      this.errors.push(`report_service test failed: ${error.message}`);
      console.log(`  ❌ report_service test failed: ${error.message}`);
    }

    console.log('');
  }

  generateReport() {
    console.log('📊 Verification Summary\n');

    const total = this.successes.length + this.warnings.length + this.errors.length;
    const successRate = total > 0 ? (this.successes.length / total) * 100 : 0;

    console.log(`  Total Checks: ${total}`);
    console.log(`  ✅ Successes: ${this.successes.length}`);
    console.log(`  ⚠️  Warnings: ${this.warnings.length}`);
    console.log(`  ❌ Errors: ${this.errors.length}`);
    console.log(`  Success Rate: ${successRate.toFixed(1)}%`);

    if (this.errors.length > 0) {
      console.log('\n❌ Errors:\n');
      this.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:\n');
      this.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (this.errors.length === 0) {
      console.log('\n✅ All agents properly wired to centralized services!');
      console.log('\nNext steps:');
      console.log('  1. Test agents with actual report generation tasks');
      console.log('  2. Monitor decision log: .claude-plugins/developer-tools-plugin/logs/routing_decisions.jsonl');
      console.log('  3. Check telemetry: node .claude-plugins/developer-tools-plugin/scripts/lib/routing-telemetry-dashboard.js');
    } else {
      console.log('\n❌ Wiring incomplete - fix errors above before proceeding');
      process.exit(1);
    }
  }
}

// CLI execution
if (require.main === module) {
  const verifier = new WiringVerifier();
  verifier.verify().catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
  });
}

module.exports = WiringVerifier;
