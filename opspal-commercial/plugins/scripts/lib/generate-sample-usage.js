#!/usr/bin/env node
/**
 * Generate Sample Usage Data
 *
 * Creates realistic usage patterns for testing usage-based prioritization.
 * Simulates 30 days of skill usage based on common workflows.
 */

const { SkillUsageTracker } = require('./skill-usage-tracker');
const fs = require('fs');
const path = require('path');

class SampleUsageGenerator {
  constructor() {
    this.tracker = new SkillUsageTracker();

    // Common workflows with frequency weights
    this.workflows = {
      // High frequency (daily)
      cpqAssessment: {
        weight: 15,
        skills: [
          { plugin: 'salesforce-plugin', skill: 'cpq-assessment' },
          { plugin: 'salesforce-plugin', skill: 'q2c-audit' },
          { plugin: 'opspal-core', skill: 'generate-diagram' },
          { plugin: 'salesforce-plugin', skill: 'sfdc-discovery' }
        ]
      },
      dataImport: {
        weight: 12,
        skills: [
          { plugin: 'salesforce-plugin', skill: 'sfdc-data-import' },
          { plugin: 'salesforce-plugin', skill: 'csv-enrichment' },
          { plugin: 'opspal-core', skill: 'validate-data' }
        ]
      },
      reportCreation: {
        weight: 10,
        skills: [
          { plugin: 'salesforce-plugin', skill: 'create-report' },
          { plugin: 'salesforce-plugin', skill: 'create-dashboard' },
          { plugin: 'opspal-core', skill: 'pdf-export' }
        ]
      },

      // Medium frequency (2-3x/week)
      revopsAudit: {
        weight: 6,
        skills: [
          { plugin: 'salesforce-plugin', skill: 'revops-audit' },
          { plugin: 'salesforce-plugin', skill: 'pipeline-analysis' },
          { plugin: 'opspal-core', skill: 'generate-report' }
        ]
      },
      workflowCreation: {
        weight: 5,
        skills: [
          { plugin: 'hubspot-plugin', skill: 'create-workflow' },
          { plugin: 'hubspot-plugin', skill: 'workflow-validation' }
        ]
      },
      territorySetup: {
        weight: 4,
        skills: [
          { plugin: 'salesforce-plugin', skill: 'territory-discovery' },
          { plugin: 'salesforce-plugin', skill: 'territory-assignment' }
        ]
      },

      // Low frequency (weekly)
      automationAudit: {
        weight: 3,
        skills: [
          { plugin: 'salesforce-plugin', skill: 'audit-automation' },
          { plugin: 'opspal-core', skill: 'flowchart' }
        ]
      },
      dataSyncSetup: {
        weight: 2,
        skills: [
          { plugin: 'opspal-core', skill: 'live-wire-sync-test' },
          { plugin: 'hubspot-plugin', skill: 'hssfdc-analyze' }
        ]
      },

      // Rare frequency (monthly)
      securityAudit: {
        weight: 1,
        skills: [
          { plugin: 'salesforce-plugin', skill: 'security-audit' },
          { plugin: 'salesforce-plugin', skill: 'permission-analysis' }
        ]
      },
      marketoSetup: {
        weight: 1,
        skills: [
          { plugin: 'marketo-plugin', skill: 'create-scoring-model' },
          { plugin: 'marketo-plugin', skill: 'sync-program-to-sfdc' }
        ]
      }
    };
  }

  /**
   * Generate usage data for N days
   * @param {number} days - Number of days to simulate
   */
  generateUsage(days = 30) {
    console.log(`Generating ${days} days of sample usage data...\n`);

    let totalInvocations = 0;
    const now = new Date();

    for (let day = 0; day < days; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() - (days - day - 1));

      // Generate random number of invocations per day (5-20)
      const invocationsPerDay = Math.floor(Math.random() * 16) + 5;

      for (let i = 0; i < invocationsPerDay; i++) {
        // Select workflow based on weight
        const workflow = this.selectWeightedWorkflow();
        const randomSkill = workflow.skills[Math.floor(Math.random() * workflow.skills.length)];

        // Log the usage with timestamp from the past
        const timestamp = new Date(date);
        timestamp.setHours(Math.floor(Math.random() * 24));
        timestamp.setMinutes(Math.floor(Math.random() * 60));

        const entry = {
          timestamp: timestamp.toISOString(),
          plugin: randomSkill.plugin,
          skill: randomSkill.skill,
          metadata: { synthetic: true }
        };

        fs.appendFileSync(this.tracker.logPath, JSON.stringify(entry) + '\n');
        totalInvocations++;
      }
    }

    console.log(`✅ Generated ${totalInvocations} skill invocations over ${days} days`);
    console.log(`   Log file: ${this.tracker.logPath}\n`);

    // Show summary stats
    const stats = this.tracker.getUsageStats(days);
    console.log('Summary:');
    console.log(`  Unique skills used: ${stats.uniqueSkills}`);
    console.log(`  Unique plugins used: ${stats.uniquePlugins}`);
    console.log(`  Average invocations/day: ${Math.round(totalInvocations / days)}\n`);

    console.log('Top 10 Skills:');
    const topSkills = this.tracker.getTopNSkills(10, days);
    topSkills.forEach((s, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. ${s.plugin}:${s.skill.padEnd(30)} ${s.count} uses`);
    });
  }

  /**
   * Select a workflow based on frequency weights
   * @returns {Object} Selected workflow
   */
  selectWeightedWorkflow() {
    const totalWeight = Object.values(this.workflows).reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const workflow of Object.values(this.workflows)) {
      random -= workflow.weight;
      if (random <= 0) {
        return workflow;
      }
    }

    // Fallback
    return Object.values(this.workflows)[0];
  }
}

// CLI usage
if (require.main === module) {
  const days = parseInt(process.argv[2]) || 30;
  const generator = new SampleUsageGenerator();

  // Clear existing logs first
  console.log('⚠️  Warning: This will clear existing usage logs!\n');
  generator.tracker.clearLogs();

  generator.generateUsage(days);
}

module.exports = { SampleUsageGenerator };
