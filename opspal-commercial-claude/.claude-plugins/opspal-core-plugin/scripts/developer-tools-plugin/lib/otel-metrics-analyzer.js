#!/usr/bin/env node
/**
 * OpenTelemetry Metrics Analyzer
 * Analyzes OTel metrics from file or Supabase and generates insights
 */

const fs = require('fs');
const path = require('path');

class OTelMetricsAnalyzer {
  constructor(metricsFilePath) {
    this.metricsFilePath = metricsFilePath;
    this.metrics = [];
  }

  /**
   * Load metrics from file (JSON Lines format)
   */
  loadMetrics() {
    if (!fs.existsSync(this.metricsFilePath)) {
      console.log('⚠️  No metrics file found. Start the OTel collector first.');
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

    console.log(`📊 Loaded ${this.metrics.length} metric events\n`);
  }

  /**
   * Analyze agent performance
   */
  analyzeAgentPerformance() {
    console.log('🤖 Agent Performance Analysis\n');

    const agentMetrics = {};

    // Group metrics by agent type
    this.metrics.forEach(metric => {
      const attrs = metric.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics?.[0]?.dataPoints?.[0]?.attributes || [];
      const agentType = attrs.find(a => a.key === 'agent.type')?.value?.stringValue;

      if (agentType) {
        if (!agentMetrics[agentType]) {
          agentMetrics[agentType] = {
            count: 0,
            totalDuration: 0,
            totalTokens: 0,
            errors: 0
          };
        }

        agentMetrics[agentType].count++;

        // Extract duration
        const duration = attrs.find(a => a.key === 'agent.duration_ms')?.value?.intValue;
        if (duration) agentMetrics[agentType].totalDuration += parseInt(duration);

        // Extract token count
        const tokens = attrs.find(a => a.key === 'agent.token_count')?.value?.intValue;
        if (tokens) agentMetrics[agentType].totalTokens += parseInt(tokens);

        // Check for errors
        const success = attrs.find(a => a.key === 'agent.success')?.value?.boolValue;
        if (success === false) agentMetrics[agentType].errors++;
      }
    });

    // Sort by usage
    const sorted = Object.entries(agentMetrics)
      .sort((a, b) => b[1].count - a[1].count);

    console.log('Top 10 Most Used Agents:');
    console.log('─'.repeat(80));

    sorted.slice(0, 10).forEach(([agent, stats], i) => {
      const avgDuration = stats.totalDuration / stats.count;
      const avgTokens = stats.totalTokens / stats.count;
      const errorRate = ((stats.errors / stats.count) * 100).toFixed(1);

      console.log(`${i + 1}. ${agent}`);
      console.log(`   Invocations: ${stats.count}`);
      console.log(`   Avg Duration: ${avgDuration.toFixed(0)}ms`);
      console.log(`   Avg Tokens: ${avgTokens.toFixed(0)}`);
      console.log(`   Error Rate: ${errorRate}%`);
      console.log('');
    });
  }

  /**
   * Analyze cost metrics
   */
  analyzeCosts() {
    console.log('\n💰 Cost Analysis\n');

    const pluginCosts = {};
    let totalTokens = 0;

    this.metrics.forEach(metric => {
      const attrs = metric.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics?.[0]?.dataPoints?.[0]?.attributes || [];
      const plugin = attrs.find(a => a.key === 'plugin.name')?.value?.stringValue || 'unknown';
      const tokens = attrs.find(a => a.key === 'agent.token_count')?.value?.intValue;

      if (tokens) {
        const tokenCount = parseInt(tokens);
        totalTokens += tokenCount;

        if (!pluginCosts[plugin]) {
          pluginCosts[plugin] = 0;
        }
        pluginCosts[plugin] += tokenCount;
      }
    });

    // Claude pricing (approximate)
    const COST_PER_1M_TOKENS = 3.00; // Sonnet input tokens
    const totalCost = (totalTokens / 1_000_000) * COST_PER_1M_TOKENS;

    console.log(`Total Tokens: ${totalTokens.toLocaleString()}`);
    console.log(`Estimated Cost: $${totalCost.toFixed(2)}\n`);

    console.log('Cost by Plugin:');
    console.log('─'.repeat(60));

    Object.entries(pluginCosts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([plugin, tokens]) => {
        const cost = (tokens / 1_000_000) * COST_PER_1M_TOKENS;
        const percentage = ((tokens / totalTokens) * 100).toFixed(1);
        console.log(`${plugin.padEnd(30)} ${tokens.toLocaleString().padStart(12)} tokens  $${cost.toFixed(2).padStart(6)}  (${percentage}%)`);
      });
  }

  /**
   * Analyze quality metrics
   */
  analyzeQuality() {
    console.log('\n🎯 Quality Metrics\n');

    const errorsByType = {};
    let totalInvocations = 0;
    let totalErrors = 0;

    this.metrics.forEach(metric => {
      const attrs = metric.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics?.[0]?.dataPoints?.[0]?.attributes || [];
      const success = attrs.find(a => a.key === 'agent.success')?.value?.boolValue;
      const errorType = attrs.find(a => a.key === 'agent.error_type')?.value?.stringValue;

      totalInvocations++;

      if (success === false) {
        totalErrors++;
        const type = errorType || 'unknown';
        errorsByType[type] = (errorsByType[type] || 0) + 1;
      }
    });

    const errorRate = ((totalErrors / totalInvocations) * 100).toFixed(2);

    console.log(`Total Invocations: ${totalInvocations}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log(`Error Rate: ${errorRate}%\n`);

    if (totalErrors > 0) {
      console.log('Errors by Type:');
      console.log('─'.repeat(60));

      Object.entries(errorsByType)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          const percentage = ((count / totalErrors) * 100).toFixed(1);
          console.log(`${type.padEnd(30)} ${count.toString().padStart(5)} errors  (${percentage}%)`);
        });
    }

    // Quality recommendations
    console.log('\n💡 Recommendations:');
    if (errorRate > 10) {
      console.log('  ⚠️  High error rate detected! Review agent implementations.');
    }
    if (errorRate > 5 && errorRate <= 10) {
      console.log('  ⚠️  Moderate error rate. Consider improvements.');
    }
    if (errorRate <= 5) {
      console.log('  ✅ Error rate is acceptable.');
    }
  }

  /**
   * Analyze workflow patterns
   */
  analyzeWorkflows() {
    console.log('\n🔄 Workflow Analysis\n');

    const workflowChains = {};

    // Group by workflow ID
    const workflows = {};
    this.metrics.forEach(metric => {
      const attrs = metric.resourceMetrics?.[0]?.scopeMetrics?.[0]?.metrics?.[0]?.dataPoints?.[0]?.attributes || [];
      const workflowId = attrs.find(a => a.key === 'workflow.id')?.value?.stringValue;
      const agentType = attrs.find(a => a.key === 'agent.type')?.value?.stringValue;

      if (workflowId && agentType) {
        if (!workflows[workflowId]) {
          workflows[workflowId] = [];
        }
        workflows[workflowId].push(agentType);
      }
    });

    // Find common agent chains
    Object.values(workflows).forEach(chain => {
      const chainKey = chain.join(' → ');
      workflowChains[chainKey] = (workflowChains[chainKey] || 0) + 1;
    });

    console.log('Common Agent Chains:');
    console.log('─'.repeat(80));

    Object.entries(workflowChains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([chain, count]) => {
        console.log(`${count}x: ${chain}`);
      });
  }

  /**
   * Generate full report
   */
  generateReport() {
    this.loadMetrics();

    if (this.metrics.length === 0) {
      console.log('No metrics to analyze. Ensure the OTel collector is running and receiving data.');
      return;
    }

    console.log('═'.repeat(80));
    console.log('  RevPal Agent System - OpenTelemetry Metrics Report');
    console.log('═'.repeat(80));
    console.log('');

    this.analyzeAgentPerformance();
    this.analyzeCosts();
    this.analyzeQuality();
    this.analyzeWorkflows();

    console.log('\n═'.repeat(80));
    console.log('  Report Complete');
    console.log('═'.repeat(80));
  }
}

// CLI
if (require.main === module) {
  const metricsFile = process.argv[2] || path.join(__dirname, '../../../../../.otel/metrics.json');

  const analyzer = new OTelMetricsAnalyzer(metricsFile);
  analyzer.generateReport();
}

module.exports = OTelMetricsAnalyzer;
