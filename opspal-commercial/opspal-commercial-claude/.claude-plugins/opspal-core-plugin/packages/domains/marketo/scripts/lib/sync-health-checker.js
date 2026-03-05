/**
 * Salesforce Sync Health Checker for Marketo
 *
 * Monitors and validates the health of Marketo-Salesforce synchronization:
 * - Sync status monitoring
 * - Error rate tracking
 * - Field mapping validation
 * - Queue depth analysis
 * - Performance metrics
 *
 * @module sync-health-checker
 * @version 1.0.0
 */

'use strict';

// Health status thresholds
const HEALTH_THRESHOLDS = {
  // Error rate thresholds (percentage)
  errorRate: {
    healthy: 1,      // < 1% errors = healthy
    warning: 5,      // 1-5% errors = warning
    critical: 10,    // > 5% errors = critical
  },
  // Queue depth thresholds (record count)
  queueDepth: {
    healthy: 100,    // < 100 records = healthy
    warning: 1000,   // 100-1000 records = warning
    critical: 5000,  // > 1000 records = critical
  },
  // Sync latency thresholds (minutes)
  syncLatency: {
    healthy: 5,      // < 5 min = healthy
    warning: 15,     // 5-15 min = warning
    critical: 60,    // > 15 min = critical
  },
  // Last sync thresholds (minutes since last successful sync)
  lastSync: {
    healthy: 10,     // < 10 min = healthy
    warning: 30,     // 10-30 min = warning
    critical: 60,    // > 30 min = critical
  },
};

// Common sync error categories
const ERROR_CATEGORIES = {
  FIELD_VALIDATION: {
    patterns: ['FIELD_CUSTOM_VALIDATION', 'REQUIRED_FIELD_MISSING', 'INVALID_TYPE'],
    severity: 'medium',
    resolution: 'Check field mappings and validation rules in Salesforce',
  },
  PERMISSION: {
    patterns: ['INSUFFICIENT_ACCESS', 'FIELD_FILTER_VALIDATION', 'CANNOT_UPDATE'],
    severity: 'high',
    resolution: 'Review Marketo sync user permissions in Salesforce',
  },
  DUPLICATE: {
    patterns: ['DUPLICATE_VALUE', 'DUPLICATE_DETECTED', 'DUPLICATES_DETECTED'],
    severity: 'medium',
    resolution: 'Configure duplicate rules or merge existing duplicates',
  },
  LOCK: {
    patterns: ['UNABLE_TO_LOCK_ROW', 'RECORD_IN_USE'],
    severity: 'low',
    resolution: 'Retry automatically - record temporarily locked',
  },
  DELETED: {
    patterns: ['ENTITY_IS_DELETED', 'INVALID_CROSS_REFERENCE'],
    severity: 'medium',
    resolution: 'Record was deleted in Salesforce - verify data integrity',
  },
  LIMIT: {
    patterns: ['LIMIT_EXCEEDED', 'TOO_MANY_ENUM', 'API_LIMIT'],
    severity: 'high',
    resolution: 'Reduce sync volume or increase API limits',
  },
  CONNECTION: {
    patterns: ['CONNECTION_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE'],
    severity: 'critical',
    resolution: 'Check Salesforce service status and network connectivity',
  },
};

/**
 * Determine health status from a value and thresholds
 * @param {number} value - The value to check
 * @param {Object} thresholds - Threshold configuration
 * @returns {string} Health status: 'healthy', 'warning', or 'critical'
 */
function getHealthStatus(value, thresholds) {
  if (value <= thresholds.healthy) return 'healthy';
  if (value <= thresholds.warning) return 'warning';
  return 'critical';
}

/**
 * Categorize a sync error
 * @param {string} errorMessage - The error message
 * @returns {Object} Error category and resolution
 */
function categorizeError(errorMessage) {
  if (!errorMessage) {
    return { category: 'UNKNOWN', severity: 'medium', resolution: 'Review error details in Marketo Admin' };
  }

  const upperError = errorMessage.toUpperCase();

  for (const [category, config] of Object.entries(ERROR_CATEGORIES)) {
    for (const pattern of config.patterns) {
      if (upperError.includes(pattern)) {
        return {
          category,
          severity: config.severity,
          resolution: config.resolution,
        };
      }
    }
  }

  return {
    category: 'UNKNOWN',
    severity: 'medium',
    resolution: 'Review error details in Marketo Admin > Integration > Salesforce',
  };
}

/**
 * Analyze sync errors and group by category
 * @param {Array} errors - Array of sync errors
 * @returns {Object} Error analysis
 */
function analyzeErrors(errors) {
  const byCategory = {};
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };

  for (const error of errors) {
    const errorMsg = error.message || error.reason || error.errorMessage || String(error);
    const { category, severity, resolution } = categorizeError(errorMsg);

    if (!byCategory[category]) {
      byCategory[category] = {
        count: 0,
        severity,
        resolution,
        examples: [],
      };
    }

    byCategory[category].count++;
    if (byCategory[category].examples.length < 3) {
      byCategory[category].examples.push({
        leadId: error.leadId || error.id,
        message: errorMsg.substring(0, 200), // Truncate long messages
      });
    }

    bySeverity[severity]++;
  }

  return {
    totalErrors: errors.length,
    byCategory,
    bySeverity,
    hasCritical: bySeverity.critical > 0,
    hasHigh: bySeverity.high > 0,
  };
}

/**
 * Calculate sync health metrics
 * @param {Object} syncStatus - Sync status data
 * @returns {Object} Health metrics
 */
function calculateHealthMetrics(syncStatus) {
  const metrics = {
    overallHealth: 'healthy',
    components: {},
    issues: [],
    recommendations: [],
  };

  // Check sync enabled
  if (!syncStatus.enabled) {
    metrics.overallHealth = 'critical';
    metrics.issues.push({
      component: 'sync_status',
      severity: 'critical',
      message: 'Salesforce sync is DISABLED',
    });
    metrics.recommendations.push('Enable Salesforce sync in Admin > Integration > Salesforce');
    return metrics;
  }

  // Check connection status
  if (syncStatus.connectionStatus !== 'connected') {
    metrics.overallHealth = 'critical';
    metrics.components.connection = { status: 'critical', value: syncStatus.connectionStatus };
    metrics.issues.push({
      component: 'connection',
      severity: 'critical',
      message: `Salesforce connection: ${syncStatus.connectionStatus}`,
    });
    metrics.recommendations.push('Verify Salesforce credentials and network connectivity');
  } else {
    metrics.components.connection = { status: 'healthy', value: 'connected' };
  }

  // Check error rate
  if (syncStatus.syncedCount > 0) {
    const errorRate = (syncStatus.errorCount / (syncStatus.syncedCount + syncStatus.errorCount)) * 100;
    const errorStatus = getHealthStatus(errorRate, HEALTH_THRESHOLDS.errorRate);
    metrics.components.errorRate = { status: errorStatus, value: `${errorRate.toFixed(2)}%` };

    if (errorStatus !== 'healthy') {
      if (errorStatus === 'critical') metrics.overallHealth = 'critical';
      else if (metrics.overallHealth !== 'critical') metrics.overallHealth = 'warning';

      metrics.issues.push({
        component: 'error_rate',
        severity: errorStatus,
        message: `Sync error rate: ${errorRate.toFixed(2)}% (${syncStatus.errorCount} errors)`,
      });
    }
  }

  // Check queue depth
  if (syncStatus.pendingCount !== undefined) {
    const queueStatus = getHealthStatus(syncStatus.pendingCount, HEALTH_THRESHOLDS.queueDepth);
    metrics.components.queueDepth = { status: queueStatus, value: syncStatus.pendingCount };

    if (queueStatus !== 'healthy') {
      if (queueStatus === 'critical') metrics.overallHealth = 'critical';
      else if (metrics.overallHealth !== 'critical') metrics.overallHealth = 'warning';

      metrics.issues.push({
        component: 'queue_depth',
        severity: queueStatus,
        message: `Sync queue depth: ${syncStatus.pendingCount} records pending`,
      });
      metrics.recommendations.push('Monitor queue - may indicate sync delays or bottleneck');
    }
  }

  // Check last sync time
  if (syncStatus.lastSyncTime) {
    const lastSync = new Date(syncStatus.lastSyncTime);
    const minutesSinceSync = Math.floor((new Date() - lastSync) / (1000 * 60));
    const lastSyncStatus = getHealthStatus(minutesSinceSync, HEALTH_THRESHOLDS.lastSync);
    metrics.components.lastSync = { status: lastSyncStatus, value: `${minutesSinceSync} min ago` };

    if (lastSyncStatus !== 'healthy') {
      if (lastSyncStatus === 'critical') metrics.overallHealth = 'critical';
      else if (metrics.overallHealth !== 'critical') metrics.overallHealth = 'warning';

      metrics.issues.push({
        component: 'last_sync',
        severity: lastSyncStatus,
        message: `Last successful sync: ${minutesSinceSync} minutes ago`,
      });
    }
  }

  return metrics;
}

/**
 * Validate field mappings between Marketo and Salesforce
 * @param {Array} mappings - Field mapping configuration
 * @param {Object} marketoSchema - Marketo lead schema
 * @param {Object} sfSchema - Salesforce schema (Lead/Contact)
 * @returns {Object} Validation results
 */
function validateFieldMappings(mappings, marketoSchema = {}, sfSchema = {}) {
  const results = {
    totalMappings: mappings.length,
    valid: 0,
    issues: [],
    unmappedRequired: [],
    typeMismatches: [],
  };

  // Required fields that should be mapped
  const requiredMarketoFields = ['Email', 'FirstName', 'LastName', 'Company'];
  const mappedMarketoFields = new Set();

  for (const mapping of mappings) {
    mappedMarketoFields.add(mapping.marketoField || mapping.marketo);

    // Check if mapping looks valid
    const marketoField = mapping.marketoField || mapping.marketo;
    const sfField = mapping.salesforceField || mapping.salesforce || mapping.sfdc;

    if (!marketoField || !sfField) {
      results.issues.push({
        type: 'incomplete',
        message: `Incomplete mapping: ${marketoField || '?'} -> ${sfField || '?'}`,
      });
      continue;
    }

    // Check type compatibility if schemas provided
    if (marketoSchema[marketoField] && sfSchema[sfField]) {
      const mType = marketoSchema[marketoField].type;
      const sType = sfSchema[sfField].type;

      // Simple type compatibility check
      const compatible = checkTypeCompatibility(mType, sType);
      if (!compatible) {
        results.typeMismatches.push({
          marketoField,
          marketoType: mType,
          sfField,
          sfType: sType,
        });
      } else {
        results.valid++;
      }
    } else {
      results.valid++;
    }
  }

  // Check for unmapped required fields
  for (const field of requiredMarketoFields) {
    if (!mappedMarketoFields.has(field)) {
      results.unmappedRequired.push(field);
    }
  }

  return results;
}

/**
 * Check type compatibility between Marketo and Salesforce field types
 * @param {string} marketoType - Marketo field type
 * @param {string} sfType - Salesforce field type
 * @returns {boolean} Whether types are compatible
 */
function checkTypeCompatibility(marketoType, sfType) {
  const compatibilityMap = {
    'string': ['string', 'text', 'textarea', 'picklist', 'multipicklist', 'email', 'phone', 'url'],
    'email': ['email', 'string', 'text'],
    'phone': ['phone', 'string', 'text'],
    'integer': ['integer', 'number', 'double', 'percent', 'currency'],
    'float': ['number', 'double', 'percent', 'currency', 'integer'],
    'date': ['date', 'datetime'],
    'datetime': ['datetime', 'date'],
    'boolean': ['boolean', 'checkbox'],
    'currency': ['currency', 'number', 'double'],
    'text': ['text', 'string', 'textarea', 'picklist'],
    'reference': ['reference', 'lookup', 'id'],
  };

  const mType = (marketoType || '').toLowerCase();
  const sType = (sfType || '').toLowerCase();

  if (mType === sType) return true;

  const compatible = compatibilityMap[mType];
  if (compatible && compatible.includes(sType)) return true;

  return false;
}

/**
 * Generate sync health report
 * @param {Object} syncStatus - Current sync status
 * @param {Array} recentErrors - Recent sync errors
 * @param {Array} fieldMappings - Field mapping configuration
 * @returns {Object} Comprehensive health report
 */
function generateHealthReport(syncStatus, recentErrors = [], fieldMappings = []) {
  const healthMetrics = calculateHealthMetrics(syncStatus);
  const errorAnalysis = analyzeErrors(recentErrors);
  const mappingValidation = validateFieldMappings(fieldMappings);

  // Generate overall health score (0-100)
  let healthScore = 100;

  // Deduct for issues
  if (healthMetrics.overallHealth === 'critical') healthScore -= 50;
  else if (healthMetrics.overallHealth === 'warning') healthScore -= 20;

  if (errorAnalysis.hasCritical) healthScore -= 20;
  else if (errorAnalysis.hasHigh) healthScore -= 10;

  if (mappingValidation.unmappedRequired.length > 0) healthScore -= 10;
  if (mappingValidation.typeMismatches.length > 0) healthScore -= 5;

  healthScore = Math.max(0, healthScore);

  return {
    timestamp: new Date().toISOString(),
    healthScore,
    overallStatus: healthMetrics.overallHealth,
    metrics: healthMetrics,
    errors: errorAnalysis,
    mappings: mappingValidation,
    summary: generateSummary(healthMetrics, errorAnalysis, mappingValidation),
  };
}

/**
 * Generate human-readable summary
 * @param {Object} metrics - Health metrics
 * @param {Object} errors - Error analysis
 * @param {Object} mappings - Mapping validation
 * @returns {string} Summary text
 */
function generateSummary(metrics, errors, mappings) {
  const lines = [];

  // Overall status
  if (metrics.overallHealth === 'healthy') {
    lines.push('Salesforce sync is healthy.');
  } else if (metrics.overallHealth === 'warning') {
    lines.push('Salesforce sync has warnings that need attention.');
  } else {
    lines.push('CRITICAL: Salesforce sync has issues requiring immediate action.');
  }

  // Key issues
  if (metrics.issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    for (const issue of metrics.issues.slice(0, 5)) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }

  // Error summary
  if (errors.totalErrors > 0) {
    lines.push('');
    lines.push(`Recent Errors: ${errors.totalErrors} total`);
    const topCategories = Object.entries(errors.byCategory)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
    for (const [category, data] of topCategories) {
      lines.push(`- ${category}: ${data.count} errors (${data.resolution})`);
    }
  }

  // Mapping issues
  if (mappings.unmappedRequired.length > 0) {
    lines.push('');
    lines.push(`Unmapped required fields: ${mappings.unmappedRequired.join(', ')}`);
  }

  // Recommendations
  if (metrics.recommendations.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const rec of metrics.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  HEALTH_THRESHOLDS,
  ERROR_CATEGORIES,
  getHealthStatus,
  categorizeError,
  analyzeErrors,
  calculateHealthMetrics,
  validateFieldMappings,
  checkTypeCompatibility,
  generateHealthReport,
  generateSummary,
};
