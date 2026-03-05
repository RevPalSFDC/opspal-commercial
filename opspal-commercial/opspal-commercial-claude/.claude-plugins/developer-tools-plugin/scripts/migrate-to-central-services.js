#!/usr/bin/env node
/**
 * Migration Script - Automated migration to central services
 *
 * Executes big bang migration from deprecated services to centralized
 * report_service and record_match_and_merge services.
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEPRECATION_MANIFEST = path.join(__dirname, '../config/deprecation_manifest.json');
const MIGRATION_LOG = path.join(__dirname, '../logs/migration.jsonl');

class MigrationExecutor {
  constructor() {
    this.manifest = JSON.parse(fs.readFileSync(DEPRECATION_MANIFEST, 'utf-8'));
    this.migrationLog = [];
  }

  async execute() {
    console.log('=== OpsPal Central Services Migration ===\n');
    console.log(`Migration Deadline: ${this.manifest.migration_deadline}`);
    console.log(`Total Files to Migrate: ${this.manifest.metrics.total_files_deprecated}`);
    console.log(`Affected Agents: ${this.manifest.metrics.total_agents_affected}\n`);

    // Phase 2: Agent Migration
    await this.migrateAgents();

    // Phase 3: Script Migration
    await this.migrateScripts();

    // Phase 5: Cleanup (removing deprecated files)
    await this.cleanupDeprecated();

    // Generate migration report
    this.generateReport();
  }

  async migrateAgents() {
    console.log('\n📝 Phase 2: Agent Migration\n');

    const agentUpdates = {
      '.claude-plugins/salesforce-plugin/agents/sfdc-revops-auditor.md': this.updateRevOpsAuditor,
      '.claude-plugins/salesforce-plugin/agents/sfdc-cpq-assessor.md': this.updateCPQAssessor,
      '.claude-plugins/salesforce-plugin/agents/sfdc-automation-auditor.md': this.updateAutomationAuditor
    };

    for (const [agentPath, updateFn] of Object.entries(agentUpdates)) {
      try {
        console.log(`  Updating ${path.basename(agentPath)}...`);

        if (fs.existsSync(agentPath)) {
          const content = fs.readFileSync(agentPath, 'utf-8');
          const updated = updateFn.call(this, content);
          fs.writeFileSync(agentPath, updated);

          this.log({
            phase: 'agent_migration',
            file: agentPath,
            status: 'success',
            changes: 'Updated to use report_service'
          });

          console.log(`  ✅ ${path.basename(agentPath)} migrated`);
        } else {
          console.log(`  ⚠️  ${path.basename(agentPath)} not found, skipping`);
        }
      } catch (error) {
        console.error(`  ❌ Error migrating ${agentPath}:`, error.message);
        this.log({
          phase: 'agent_migration',
          file: agentPath,
          status: 'failed',
          error: error.message
        });
      }
    }
  }

  updateRevOpsAuditor(content) {
    // Add import/reference to report_service
    const header = `## Report Generation

This agent uses the centralized **report_service** for all executive reports and assessments.

**Service Contract**: See \`.claude-plugins/developer-tools-plugin/config/central_services.json\`

To generate reports:
\`\`\`javascript
const ReportService = require('../../../developer-tools-plugin/scripts/lib/report-service.js');
const service = new ReportService();

const request = {
  report_type: 'assessment',
  audience: 'exec',
  objectives: ['Document RevOps assessment findings'],
  key_messages: ['Key finding 1', 'Key finding 2'],
  inputs: {
    facts: [...],
    metrics: {...},
    risks: [...]
  },
  constraints: {
    length: 'medium',
    style: 'analytical',
    pii_policy: 'mask',
    format: 'markdown'
  }
};

const report = await service.generateReport(request);
console.log(report.content);
\`\`\`

---

`;

    // Insert header after frontmatter
    return content.replace(/^---\n.*?\n---\n\n/s, (match) => match + header);
  }

  updateCPQAssessor(content) {
    return this.updateRevOpsAuditor(content); // Same pattern
  }

  updateAutomationAuditor(content) {
    return this.updateRevOpsAuditor(content); // Same pattern
  }

  async migrateScripts() {
    console.log('\n🔧 Phase 3: Script Migration\n');
    console.log('  No direct script replacements needed (routing handles this automatically)');
    console.log('  ✅ Scripts will be deprecated in cleanup phase');
  }

  async cleanupDeprecated() {
    console.log('\n🗑️  Phase 5: Cleanup & Removal\n');

    for (const category of this.manifest.deprecations) {
      console.log(`\n  Category: ${category.category}`);
      console.log(`  Replacement: ${category.service_replacement}\n`);

      for (const item of category.items) {
        if (item.type === 'agent_partial' || item.type === 'script_partial') {
          console.log(`  ⚠️  Partial deprecation - manual review required: ${item.path}`);
          continue;
        }

        if (item.type === 'agent' || item.type === 'script') {
          try {
            const fullPath = path.join(process.cwd(), item.path);

            if (fs.existsSync(fullPath)) {
              // Move to archive instead of deleting
              const archivePath = fullPath.replace(/\.claude-plugins/, '.claude-plugins/.archived');
              const archiveDir = path.dirname(archivePath);

              if (!fs.existsSync(archiveDir)) {
                fs.mkdirSync(archiveDir, { recursive: true });
              }

              fs.renameSync(fullPath, archivePath);
              console.log(`  📦 Archived: ${item.path}`);

              this.log({
                phase: 'cleanup',
                file: item.path,
                status: 'archived',
                archive_path: archivePath
              });
            } else {
              console.log(`  ⚠️  File not found: ${item.path}`);
            }
          } catch (error) {
            console.error(`  ❌ Error archiving ${item.path}:`, error.message);
            this.log({
              phase: 'cleanup',
              file: item.path,
              status: 'failed',
              error: error.message
            });
          }
        }
      }
    }
  }

  generateReport() {
    console.log('\n📊 Migration Report\n');

    const successful = this.migrationLog.filter(l => l.status === 'success').length;
    const failed = this.migrationLog.filter(l => l.status === 'failed').length;
    const archived = this.migrationLog.filter(l => l.status === 'archived').length;

    console.log(`  ✅ Successful migrations: ${successful}`);
    console.log(`  ❌ Failed migrations: ${failed}`);
    console.log(`  📦 Files archived: ${archived}`);
    console.log(`  📝 Total operations: ${this.migrationLog.length}`);

    // Write log file
    const logDir = path.dirname(MIGRATION_LOG);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    for (const entry of this.migrationLog) {
      fs.appendFileSync(MIGRATION_LOG, JSON.stringify(entry) + '\n');
    }

    console.log(`\n📁 Migration log: ${MIGRATION_LOG}`);

    if (failed > 0) {
      console.log('\n⚠️  WARNING: Some migrations failed. Review the log for details.');
      console.log('Run validation suite: node validate-migration.js');
    } else {
      console.log('\n✅ Migration completed successfully!');
      console.log('Next steps:');
      console.log('  1. Run validation suite: node validate-migration.js');
      console.log('  2. Test affected agents');
      console.log('  3. Update plugin manifests');
      console.log('  4. Commit changes');
    }
  }

  log(entry) {
    this.migrationLog.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
  }
}

// CLI execution
if (require.main === module) {
  const executor = new MigrationExecutor();
  executor.execute().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = MigrationExecutor;
