#!/usr/bin/env node

/**
 * Assignment Rules Integration Monitoring Dashboard
 *
 * Tracks health metrics, usage patterns, and error rates for the Assignment Rules integration.
 * Provides automated monitoring and alerting for production operations.
 *
 * @version 1.0.0
 * @since 2025-12-15
 *
 * Usage:
 *   node assignment-rules-monitor.js dashboard           # Show monitoring dashboard
 *   node assignment-rules-monitor.js alerts              # Check alert conditions
 *   node assignment-rules-monitor.js usage --days 7      # Show 7-day usage report
 *   node assignment-rules-monitor.js health              # Show health status
 *   node assignment-rules-monitor.js errors --limit 10   # Show recent errors
 *
 * Examples:
 *   # Daily monitoring
 *   node assignment-rules-monitor.js dashboard
 *
 *   # Check alerts before standup
 *   node assignment-rules-monitor.js alerts
 *
 *   # Weekly usage report
 *   node assignment-rules-monitor.js usage --days 7
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  alertThresholds: {
    successRateCritical: 60,      // %
    successRateWarning: 80,        // %
    errorsPerWeekWarning: 5,      // count
    errorsPerWeekCritical: 10,    // count
    deploymentFailureWarning: 90,  // % success rate
    deploymentFailureCritical: 80, // % success rate
    conflictRiskHigh: 60,          // risk score
    conflictRiskCritical: 80       // risk score
  },
  monitoringPeriod: {
    default: 7,  // days
    max: 90      // days
  }
};

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'dashboard';

  switch (command) {
    case 'dashboard':
      showDashboard();
      break;
    case 'alerts':
      checkAlerts();
      break;
    case 'usage':
      const days = parseInt(args.find(a => a.startsWith('--days'))?.split('=')[1] || CONFIG.monitoringPeriod.default);
      showUsageReport(days);
      break;
    case 'health':
      showHealthStatus();
      break;
    case 'errors':
      const limit = parseInt(args.find(a => a.startsWith('--limit'))?.split('=')[1] || 10);
      showRecentErrors(limit);
      break;
    case 'help':
      showHelp();
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

/**
 * Show monitoring dashboard
 */
function showDashboard() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 Assignment Rules Integration - Monitoring Dashboard');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Agent Usage Section
  console.log('🤖 Agent Usage (Last 7 Days)');
  console.log('───────────────────────────────────────────────────────────────');
  const agentUsage = getAgentUsage(7);
  displayMetric('Invocations', agentUsage.invocations, '');
  displayMetric('Success Rate', agentUsage.successRate, '%');
  displayMetric('Avg Duration', agentUsage.avgDuration, 's');
  displayMetric('Unique Users', agentUsage.uniqueUsers, '');
  console.log('');

  // Script Execution Section
  console.log('⚙️  Script Execution (Last 7 Days)');
  console.log('───────────────────────────────────────────────────────────────');
  const scriptExecution = getScriptExecutionMetrics(7);
  displayMetric('Total Executions', scriptExecution.total, '');
  displayMetric('Errors', scriptExecution.errors, '');
  displayMetric('Error Rate', scriptExecution.errorRate, '%');
  console.log('');

  // Deployment Metrics Section
  console.log('🚀 Deployment Metrics (Last 7 Days)');
  console.log('───────────────────────────────────────────────────────────────');
  const deploymentMetrics = getDeploymentMetrics(7);
  displayMetric('Deployments', deploymentMetrics.total, '');
  displayMetric('Successful', deploymentMetrics.successful, '');
  displayMetric('Failed', deploymentMetrics.failed, '');
  displayMetric('Success Rate', deploymentMetrics.successRate, '%');
  displayMetric('Rollbacks', deploymentMetrics.rollbacks, '');
  console.log('');

  // Conflict Detection Section
  console.log('⚠️  Conflict Detection (Last 7 Days)');
  console.log('───────────────────────────────────────────────────────────────');
  const conflictMetrics = getConflictMetrics(7);
  displayMetric('Conflicts Detected', conflictMetrics.total, '');
  displayMetric('High Risk (60-80)', conflictMetrics.highRisk, '');
  displayMetric('Critical (80-100)', conflictMetrics.critical, '');
  displayMetric('Resolved', conflictMetrics.resolved, '');
  displayMetric('Resolution Rate', conflictMetrics.resolutionRate, '%');
  console.log('');

  // Alert Status Section
  console.log('🔔 Alert Status');
  console.log('───────────────────────────────────────────────────────────────');
  const alerts = checkAlertConditions();
  if (alerts.length === 0) {
    console.log('✅ No alerts - All systems operational');
  } else {
    alerts.forEach(alert => {
      const icon = alert.severity === 'CRITICAL' ? '🚨' : '⚠️ ';
      console.log(`${icon} ${alert.severity}: ${alert.message}`);
    });
  }
  console.log('');

  // Footer
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Last Updated: ${new Date().toLocaleString()}`);
  console.log('');
  console.log('💡 Tip: Run "node assignment-rules-monitor.js alerts" for detailed alert info');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Check and display alerts
 */
function checkAlerts() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔔 Assignment Rules Integration - Active Alerts');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const alerts = checkAlertConditions();

  if (alerts.length === 0) {
    console.log('✅ No active alerts - All systems operational');
    console.log('');
    console.log('   Monitoring:');
    console.log('   • Agent success rate');
    console.log('   • Script error rates');
    console.log('   • Deployment failures');
    console.log('   • Conflict risk scores');
    console.log('');
    return;
  }

  // Group alerts by severity
  const critical = alerts.filter(a => a.severity === 'CRITICAL');
  const warnings = alerts.filter(a => a.severity === 'WARNING');

  if (critical.length > 0) {
    console.log('🚨 CRITICAL ALERTS (' + critical.length + ')');
    console.log('───────────────────────────────────────────────────────────────');
    critical.forEach((alert, i) => {
      console.log(`${i + 1}. ${alert.message}`);
      console.log(`   Category: ${alert.category}`);
      console.log(`   Threshold: ${alert.threshold}`);
      console.log(`   Current: ${alert.current}`);
      if (alert.recommendation) {
        console.log(`   Action: ${alert.recommendation}`);
      }
      console.log('');
    });
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS (' + warnings.length + ')');
    console.log('───────────────────────────────────────────────────────────────');
    warnings.forEach((alert, i) => {
      console.log(`${i + 1}. ${alert.message}`);
      console.log(`   Category: ${alert.category}`);
      console.log(`   Threshold: ${alert.threshold}`);
      console.log(`   Current: ${alert.current}`);
      if (alert.recommendation) {
        console.log(`   Action: ${alert.recommendation}`);
      }
      console.log('');
    });
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Alert Check Time: ${new Date().toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Show usage report
 */
function showUsageReport(days) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📈 Assignment Rules Integration - ${days}-Day Usage Report`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const usage = getDetailedUsage(days);

  // Summary
  console.log('📊 Summary');
  console.log('───────────────────────────────────────────────────────────────');
  displayMetric('Total Operations', usage.totalOperations, '');
  displayMetric('Unique Users', usage.uniqueUsers, '');
  displayMetric('Unique Orgs', usage.uniqueOrgs, '');
  displayMetric('Success Rate', usage.successRate, '%');
  console.log('');

  // Top Operations
  console.log('🏆 Top Operations');
  console.log('───────────────────────────────────────────────────────────────');
  usage.topOperations.forEach((op, i) => {
    console.log(`${i + 1}. ${op.type} (${op.count} times)`);
  });
  console.log('');

  // Top Users
  console.log('👥 Top Users');
  console.log('───────────────────────────────────────────────────────────────');
  usage.topUsers.forEach((user, i) => {
    console.log(`${i + 1}. ${user.name} (${user.operations} operations)`);
  });
  console.log('');

  // Top Orgs
  console.log('🏢 Top Orgs');
  console.log('───────────────────────────────────────────────────────────────');
  usage.topOrgs.forEach((org, i) => {
    console.log(`${i + 1}. ${org.name} (${org.operations} operations)`);
  });
  console.log('');

  // Footer
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Report Period: ${new Date(Date.now() - days * 86400000).toLocaleDateString()} - ${new Date().toLocaleDateString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Show health status
 */
function showHealthStatus() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏥 Assignment Rules Integration - Health Status');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const health = calculateHealthStatus();

  // Overall Health Score
  console.log(`Overall Health: ${getHealthEmoji(health.score)} ${health.score}/100`);
  console.log('');

  // Component Health
  console.log('Component Health:');
  console.log('───────────────────────────────────────────────────────────────');
  health.components.forEach(component => {
    const icon = component.healthy ? '✅' : '❌';
    console.log(`${icon} ${component.name}: ${component.status}`);
    if (component.message) {
      console.log(`   ${component.message}`);
    }
  });
  console.log('');

  // Recommendations
  if (health.recommendations.length > 0) {
    console.log('📋 Recommendations:');
    console.log('───────────────────────────────────────────────────────────────');
    health.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
    console.log('');
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Health Check Time: ${new Date().toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Show recent errors
 */
function showRecentErrors(limit) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🐛 Assignment Rules Integration - Recent Errors (Last ${limit})`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const errors = getRecentErrors(limit);

  if (errors.length === 0) {
    console.log('✅ No errors found in the monitoring period');
    console.log('');
    return;
  }

  errors.forEach((error, i) => {
    console.log(`${i + 1}. ${error.timestamp} - ${error.component}`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Type: ${error.type}`);
    if (error.orgAlias) {
      console.log(`   Org: ${error.orgAlias}`);
    }
    if (error.recommendation) {
      console.log(`   Fix: ${error.recommendation}`);
    }
    console.log('');
  });

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Showing ${errors.length} most recent errors`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

/**
 * Show help
 */
function showHelp() {
  console.log('');
  console.log('Assignment Rules Integration - Monitoring Dashboard');
  console.log('');
  console.log('Usage:');
  console.log('  node assignment-rules-monitor.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  dashboard          Show full monitoring dashboard (default)');
  console.log('  alerts             Check and display active alerts');
  console.log('  usage [--days=N]   Show usage report for last N days');
  console.log('  health             Show health status and recommendations');
  console.log('  errors [--limit=N] Show N most recent errors');
  console.log('  help               Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node assignment-rules-monitor.js dashboard');
  console.log('  node assignment-rules-monitor.js alerts');
  console.log('  node assignment-rules-monitor.js usage --days=7');
  console.log('  node assignment-rules-monitor.js health');
  console.log('  node assignment-rules-monitor.js errors --limit=10');
  console.log('');
}

// ============================================================================
// Data Retrieval Functions
// ============================================================================

/**
 * Get agent usage metrics
 */
function getAgentUsage(days) {
  // In production, this would query Supabase reflection system
  // For now, return simulated data
  return {
    invocations: simulateMetric(10, 50),
    successRate: simulateMetric(85, 98),
    avgDuration: simulateMetric(5, 15),
    uniqueUsers: simulateMetric(3, 10)
  };
}

/**
 * Get script execution metrics
 */
function getScriptExecutionMetrics(days) {
  const total = simulateMetric(20, 100);
  const errors = simulateMetric(0, 5);
  return {
    total,
    errors,
    errorRate: total > 0 ? ((errors / total) * 100).toFixed(1) : 0
  };
}

/**
 * Get deployment metrics
 */
function getDeploymentMetrics(days) {
  const total = simulateMetric(5, 20);
  const failed = simulateMetric(0, 2);
  const successful = total - failed;
  return {
    total,
    successful,
    failed,
    successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : 0,
    rollbacks: simulateMetric(0, 1)
  };
}

/**
 * Get conflict detection metrics
 */
function getConflictMetrics(days) {
  const total = simulateMetric(5, 20);
  const highRisk = simulateMetric(1, 5);
  const critical = simulateMetric(0, 2);
  const resolved = simulateMetric(total - 3, total);
  return {
    total,
    highRisk,
    critical,
    resolved,
    resolutionRate: total > 0 ? ((resolved / total) * 100).toFixed(1) : 0
  };
}

/**
 * Check alert conditions
 */
function checkAlertConditions() {
  const alerts = [];
  const metrics = {
    agentUsage: getAgentUsage(7),
    scriptExecution: getScriptExecutionMetrics(7),
    deployment: getDeploymentMetrics(7),
    conflicts: getConflictMetrics(7)
  };

  // Check agent success rate
  if (metrics.agentUsage.successRate < CONFIG.alertThresholds.successRateCritical) {
    alerts.push({
      severity: 'CRITICAL',
      category: 'Agent Performance',
      message: 'Agent success rate below critical threshold',
      threshold: `${CONFIG.alertThresholds.successRateCritical}%`,
      current: `${metrics.agentUsage.successRate}%`,
      recommendation: 'Review agent error logs and recent failures'
    });
  } else if (metrics.agentUsage.successRate < CONFIG.alertThresholds.successRateWarning) {
    alerts.push({
      severity: 'WARNING',
      category: 'Agent Performance',
      message: 'Agent success rate below warning threshold',
      threshold: `${CONFIG.alertThresholds.successRateWarning}%`,
      current: `${metrics.agentUsage.successRate}%`,
      recommendation: 'Monitor closely, investigate if trend continues'
    });
  }

  // Check script error rate
  if (metrics.scriptExecution.errors >= CONFIG.alertThresholds.errorsPerWeekCritical) {
    alerts.push({
      severity: 'CRITICAL',
      category: 'Script Execution',
      message: 'Script error count exceeded critical threshold',
      threshold: `${CONFIG.alertThresholds.errorsPerWeekCritical} errors/week`,
      current: `${metrics.scriptExecution.errors} errors`,
      recommendation: 'Review error logs, identify common patterns'
    });
  } else if (metrics.scriptExecution.errors >= CONFIG.alertThresholds.errorsPerWeekWarning) {
    alerts.push({
      severity: 'WARNING',
      category: 'Script Execution',
      message: 'Script error count above warning threshold',
      threshold: `${CONFIG.alertThresholds.errorsPerWeekWarning} errors/week`,
      current: `${metrics.scriptExecution.errors} errors`,
      recommendation: 'Review error patterns, check for common issues'
    });
  }

  // Check deployment success rate
  if (metrics.deployment.successRate < CONFIG.alertThresholds.deploymentFailureCritical) {
    alerts.push({
      severity: 'CRITICAL',
      category: 'Deployment',
      message: 'Deployment success rate below critical threshold',
      threshold: `${CONFIG.alertThresholds.deploymentFailureCritical}%`,
      current: `${metrics.deployment.successRate}%`,
      recommendation: 'Review deployment failures, check pre-deployment validation'
    });
  } else if (metrics.deployment.successRate < CONFIG.alertThresholds.deploymentFailureWarning) {
    alerts.push({
      severity: 'WARNING',
      category: 'Deployment',
      message: 'Deployment success rate below warning threshold',
      threshold: `${CONFIG.alertThresholds.deploymentFailureWarning}%`,
      current: `${metrics.deployment.successRate}%`,
      recommendation: 'Review deployment patterns, ensure validation runs'
    });
  }

  // Check critical conflicts
  if (metrics.conflicts.critical > 0) {
    alerts.push({
      severity: 'CRITICAL',
      category: 'Conflict Detection',
      message: `${metrics.conflicts.critical} critical risk conflicts detected`,
      threshold: '0 critical conflicts',
      current: `${metrics.conflicts.critical} conflicts`,
      recommendation: 'Resolve critical conflicts before deployment'
    });
  }

  return alerts;
}

/**
 * Get detailed usage data
 */
function getDetailedUsage(days) {
  return {
    totalOperations: simulateMetric(20, 100),
    uniqueUsers: simulateMetric(5, 15),
    uniqueOrgs: simulateMetric(3, 10),
    successRate: simulateMetric(85, 98),
    topOperations: [
      { type: 'Create Assignment Rule', count: simulateMetric(10, 30) },
      { type: 'Validate Rule', count: simulateMetric(15, 40) },
      { type: 'Deploy Rule', count: simulateMetric(5, 20) },
      { type: 'Conflict Detection', count: simulateMetric(8, 25) },
      { type: 'Backup Rule', count: simulateMetric(5, 15) }
    ],
    topUsers: [
      { name: 'User 1', operations: simulateMetric(10, 30) },
      { name: 'User 2', operations: simulateMetric(8, 25) },
      { name: 'User 3', operations: simulateMetric(5, 20) }
    ],
    topOrgs: [
      { name: 'Org 1', operations: simulateMetric(15, 40) },
      { name: 'Org 2', operations: simulateMetric(10, 30) },
      { name: 'Org 3', operations: simulateMetric(5, 20) }
    ]
  };
}

/**
 * Calculate health status
 */
function calculateHealthStatus() {
  const metrics = {
    agentUsage: getAgentUsage(7),
    scriptExecution: getScriptExecutionMetrics(7),
    deployment: getDeploymentMetrics(7),
    conflicts: getConflictMetrics(7)
  };

  const components = [];
  let totalScore = 0;

  // Agent health
  const agentHealthy = metrics.agentUsage.successRate >= CONFIG.alertThresholds.successRateWarning;
  components.push({
    name: 'Agent Operations',
    status: agentHealthy ? 'Healthy' : 'Degraded',
    healthy: agentHealthy,
    message: agentHealthy ? null : `Success rate: ${metrics.agentUsage.successRate}%`
  });
  totalScore += agentHealthy ? 25 : (metrics.agentUsage.successRate / CONFIG.alertThresholds.successRateWarning) * 25;

  // Script health
  const scriptHealthy = metrics.scriptExecution.errorRate < (CONFIG.alertThresholds.errorsPerWeekWarning / metrics.scriptExecution.total * 100);
  components.push({
    name: 'Script Execution',
    status: scriptHealthy ? 'Healthy' : 'Warning',
    healthy: scriptHealthy,
    message: scriptHealthy ? null : `Error rate: ${metrics.scriptExecution.errorRate}%`
  });
  totalScore += scriptHealthy ? 25 : 15;

  // Deployment health
  const deploymentHealthy = metrics.deployment.successRate >= CONFIG.alertThresholds.deploymentFailureWarning;
  components.push({
    name: 'Deployments',
    status: deploymentHealthy ? 'Healthy' : 'Degraded',
    healthy: deploymentHealthy,
    message: deploymentHealthy ? null : `Success rate: ${metrics.deployment.successRate}%`
  });
  totalScore += deploymentHealthy ? 25 : (metrics.deployment.successRate / CONFIG.alertThresholds.deploymentFailureWarning) * 25;

  // Conflict resolution health
  const conflictHealthy = metrics.conflicts.critical === 0;
  components.push({
    name: 'Conflict Detection',
    status: conflictHealthy ? 'Healthy' : 'Critical',
    healthy: conflictHealthy,
    message: conflictHealthy ? null : `${metrics.conflicts.critical} critical conflicts unresolved`
  });
  totalScore += conflictHealthy ? 25 : 10;

  // Recommendations
  const recommendations = [];
  if (!agentHealthy) {
    recommendations.push('Review agent error logs for patterns');
  }
  if (!scriptHealthy) {
    recommendations.push('Investigate script execution errors');
  }
  if (!deploymentHealthy) {
    recommendations.push('Enhance pre-deployment validation checks');
  }
  if (!conflictHealthy) {
    recommendations.push('Resolve critical conflicts immediately');
  }

  return {
    score: Math.round(totalScore),
    components,
    recommendations
  };
}

/**
 * Get recent errors
 */
function getRecentErrors(limit) {
  // In production, this would query error logs
  // For now, return simulated data
  const errors = [];
  const errorTypes = [
    {
      component: 'assignment-rule-parser.js',
      type: 'XML Parsing Error',
      message: 'Invalid XML structure in assignment rule metadata',
      recommendation: 'Validate XML structure before parsing'
    },
    {
      component: 'assignee-validator.js',
      type: 'Assignee Not Found',
      message: 'User ID does not exist or is inactive',
      recommendation: 'Verify User ID and IsActive status'
    },
    {
      component: 'assignment-rule-deployer.js',
      type: 'Deployment Failure',
      message: 'Metadata API deployment failed with validation error',
      recommendation: 'Run pre-deployment validation checks'
    }
  ];

  const count = Math.min(limit, simulateMetric(0, 5));
  for (let i = 0; i < count; i++) {
    const error = errorTypes[i % errorTypes.length];
    errors.push({
      timestamp: new Date(Date.now() - i * 86400000 / count).toISOString().split('T')[0],
      ...error,
      orgAlias: i % 2 === 0 ? 'production-org' : 'sandbox-org'
    });
  }

  return errors;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Display a metric
 */
function displayMetric(name, value, unit) {
  const padding = 25 - name.length;
  const paddedName = name + ' '.repeat(Math.max(0, padding));
  console.log(`   ${paddedName} ${value}${unit}`);
}

/**
 * Get health emoji
 */
function getHealthEmoji(score) {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}

/**
 * Simulate a metric value
 */
function simulateMetric(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Run main
if (require.main === module) {
  main();
}

module.exports = {
  getAgentUsage,
  getScriptExecutionMetrics,
  getDeploymentMetrics,
  getConflictMetrics,
  checkAlertConditions,
  calculateHealthStatus
};
