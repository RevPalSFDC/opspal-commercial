#!/usr/bin/env node
/**
 * OTel Metrics → Reflection System Integrator
 * Analyzes OTel metrics and creates reflection entries for quality issues
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

class OTelReflectionIntegrator {
  constructor(metricsFilePath) {
    this.metricsFilePath = metricsFilePath;
    this.metrics = [];
    this.reflections = [];

    if (SUPABASE_URL && SUPABASE_KEY) {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  }

  /**
   * Load metrics from file
   */
  loadMetrics() {
    if (!fs.existsSync(this.metricsFilePath)) {
      console.log('⚠️  No metrics file found');
      return;
    }

    const content = fs.readFileSync(this.metricsFilePath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    this.metrics = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    console.log(`📊 Loaded ${this.metrics.length} metric events`);
  }

  /**
   * Analyze metrics for quality issues
   */
  analyzeForIssues() {
    console.log('🔍 Analyzing metrics for quality issues...\n');

    const agentStats = {};
    let totalInvocations = 0;

    // Aggregate stats by agent
    this.metrics.forEach(metric => {
      const attrs = metric.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics?.[0]?.dataPoints?.[0]?.attributes || [];
      const agentType = attrs.find(a => a.key === 'agent.type')?.value?.stringValue;
      const success = attrs.find(a => a.key === 'agent.success')?.value?.boolValue;
      const duration = attrs.find(a => a.key === 'agent.duration_ms')?.value?.intValue;
      const tokens = attrs.find(a => a.key === 'agent.token_count')?.value?.intValue;
      const errorType = attrs.find(a => a.key === 'agent.error_type')?.value?.stringValue;

      if (agentType) {
        if (!agentStats[agentType]) {
          agentStats[agentType] = {
            count: 0,
            errors: 0,
            durations: [],
            tokens: [],
            errorTypes: {}
          };
        }

        agentStats[agentType].count++;
        totalInvocations++;

        if (success === false) {
          agentStats[agentType].errors++;
          if (errorType) {
            agentStats[agentType].errorTypes[errorType] = (agentStats[agentType].errorTypes[errorType] || 0) + 1;
          }
        }

        if (duration) agentStats[agentType].durations.push(parseInt(duration));
        if (tokens) agentStats[agentType].tokens.push(parseInt(tokens));
      }
    });

    // Detect issues and create reflection entries
    Object.entries(agentStats).forEach(([agent, stats]) => {
      const errorRate = stats.errors / stats.count;

      // Issue 1: High error rate
      if (errorRate > 0.15 && stats.count >= 5) {
        this.createReflection({
          type: 'HIGH_ERROR_RATE',
          severity: 'CRITICAL',
          agent,
          errorRate: (errorRate * 100).toFixed(1),
          totalErrors: stats.errors,
          totalInvocations: stats.count,
          errorTypes: stats.errorTypes,
          recommendation: `Agent ${agent} has a ${(errorRate * 100).toFixed(1)}% error rate. Investigate error types: ${Object.keys(stats.errorTypes).join(', ')}`
        });
      }

      // Issue 2: Moderate error rate (warning)
      if (errorRate > 0.05 && errorRate <= 0.15 && stats.count >= 10) {
        this.createReflection({
          type: 'MODERATE_ERROR_RATE',
          severity: 'WARNING',
          agent,
          errorRate: (errorRate * 100).toFixed(1),
          totalErrors: stats.errors,
          totalInvocations: stats.count,
          recommendation: `Agent ${agent} has a ${(errorRate * 100).toFixed(1)}% error rate. Monitor for trends.`
        });
      }

      // Issue 3: Slow performance
      if (stats.durations.length >= 5) {
        const avgDuration = stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length;
        const p95Duration = this.percentile(stats.durations, 0.95);

        if (p95Duration > 30000) { // 30 seconds
          this.createReflection({
            type: 'SLOW_AGENT_PERFORMANCE',
            severity: 'WARNING',
            agent,
            avgDuration: Math.round(avgDuration),
            p95Duration: Math.round(p95Duration),
            recommendation: `Agent ${agent} has slow P95 duration (${Math.round(p95Duration / 1000)}s). Consider optimization or model downgrade.`
          });
        }
      }

      // Issue 4: High token usage
      if (stats.tokens.length >= 5) {
        const avgTokens = stats.tokens.reduce((a, b) => a + b, 0) / stats.tokens.length;

        if (avgTokens > 10000 && stats.count >= 10) {
          const estimatedCost = (avgTokens * stats.count / 1_000_000) * 3.0; // $3/M tokens

          this.createReflection({
            type: 'HIGH_TOKEN_USAGE',
            severity: 'INFO',
            agent,
            avgTokens: Math.round(avgTokens),
            totalTokens: stats.tokens.reduce((a, b) => a + b, 0),
            estimatedCost: estimatedCost.toFixed(2),
            recommendation: `Agent ${agent} uses high tokens (${Math.round(avgTokens)} avg). Consider: (1) Using Haiku model, (2) Prompt optimization, (3) Context reduction.`
          });
        }
      }
    });

    console.log(`✅ Created ${this.reflections.length} reflection entries\n`);
  }

  /**
   * Calculate percentile
   */
  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }

  /**
   * Create reflection entry
   */
  createReflection(data) {
    const reflection = {
      timestamp: new Date().toISOString(),
      source: 'otel-metrics',
      ...data
    };

    this.reflections.push(reflection);

    // Log to console
    const severityEmoji = {
      CRITICAL: '🚨',
      WARNING: '⚠️',
      INFO: 'ℹ️'
    }[data.severity] || 'ℹ️';

    console.log(`${severityEmoji} ${data.type}: ${data.agent}`);
    console.log(`   ${data.recommendation}\n`);
  }

  /**
   * Save reflections to Supabase
   */
  async saveToSupabase() {
    if (!this.supabase) {
      console.log('⚠️  Supabase not configured. Skipping save.');
      return;
    }

    if (this.reflections.length === 0) {
      console.log('ℹ️  No reflections to save.');
      return;
    }

    console.log('💾 Saving reflections to Supabase...');

    try {
      const { data, error } = await this.supabase
        .from('reflections')
        .insert(
          this.reflections.map(r => ({
            summary: `${r.type}: ${r.agent}`,
            details: JSON.stringify(r),
            category: 'agent-performance',
            severity: r.severity.toLowerCase(),
            status: 'open',
            source: 'otel-metrics',
            created_at: new Date().toISOString()
          }))
        );

      if (error) throw error;

      console.log(`✅ Saved ${this.reflections.length} reflections to Supabase`);
    } catch (error) {
      console.error('❌ Error saving to Supabase:', error.message);
    }
  }

  /**
   * Save reflections to local file
   */
  saveToFile() {
    if (this.reflections.length === 0) {
      console.log('ℹ️  No reflections to save.');
      return;
    }

    const outputDir = path.join(__dirname, '../../../../../.otel/reflections');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = `reflection-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(this.reflections, null, 2));
    console.log(`💾 Saved reflections to ${filepath}`);
  }

  /**
   * Generate summary report
   */
  generateReport() {
    if (this.reflections.length === 0) {
      console.log('✅ No quality issues detected!');
      return;
    }

    console.log('═'.repeat(80));
    console.log('  OTel Metrics → Reflection System Integration Report');
    console.log('═'.repeat(80));
    console.log('');

    const bySeverity = {
      CRITICAL: this.reflections.filter(r => r.severity === 'CRITICAL'),
      WARNING: this.reflections.filter(r => r.severity === 'WARNING'),
      INFO: this.reflections.filter(r => r.severity === 'INFO')
    };

    console.log('📊 Summary:');
    console.log(`  🚨 Critical: ${bySeverity.CRITICAL.length}`);
    console.log(`  ⚠️  Warning: ${bySeverity.WARNING.length}`);
    console.log(`  ℹ️  Info: ${bySeverity.INFO.length}`);
    console.log('');

    // Critical issues
    if (bySeverity.CRITICAL.length > 0) {
      console.log('🚨 CRITICAL ISSUES:');
      console.log('─'.repeat(80));
      bySeverity.CRITICAL.forEach(r => {
        console.log(`  • ${r.agent} - ${r.type}`);
        console.log(`    ${r.recommendation}`);
        console.log('');
      });
    }

    // Warning issues
    if (bySeverity.WARNING.length > 0) {
      console.log('⚠️  WARNINGS:');
      console.log('─'.repeat(80));
      bySeverity.WARNING.forEach(r => {
        console.log(`  • ${r.agent} - ${r.type}`);
        console.log(`    ${r.recommendation}`);
        console.log('');
      });
    }

    console.log('═'.repeat(80));
    console.log('  Next Steps:');
    console.log('═'.repeat(80));
    console.log('  1. Review critical issues immediately');
    console.log('  2. Run /processreflections to create fix plans');
    console.log('  3. Monitor trends over time');
    console.log('═'.repeat(80));
  }

  /**
   * Run full integration
   */
  async run() {
    this.loadMetrics();

    if (this.metrics.length === 0) {
      console.log('No metrics to analyze.');
      return;
    }

    this.analyzeForIssues();
    this.saveToFile();
    await this.saveToSupabase();
    this.generateReport();
  }
}

// CLI
if (require.main === module) {
  const metricsFile = process.argv[2] || path.join(__dirname, '../../../../../.otel/metrics.json');

  const integrator = new OTelReflectionIntegrator(metricsFile);
  integrator.run();
}

module.exports = OTelReflectionIntegrator;
