/**
 * Field Telemetry Analyzer
 *
 * Analyzes CRM field health by examining population rates,
 * update patterns, staleness, and usage statistics.
 *
 * @module governance/field-telemetry-analyzer
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Field health status levels
 */
const HEALTH_STATUS = {
    HEALTHY: 'healthy',
    WARNING: 'warning',
    CRITICAL: 'critical',
    UNKNOWN: 'unknown'
};

/**
 * Update source types
 */
const UPDATE_SOURCES = {
    USER: 'user',
    AUTOMATION: 'automation',
    INTEGRATION: 'integration',
    IMPORT: 'import',
    ENRICHMENT: 'enrichment',
    UNKNOWN: 'unknown'
};

/**
 * Field Telemetry Analyzer
 */
class FieldTelemetryAnalyzer {
    /**
     * Create a field telemetry analyzer
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Thresholds
        this.populationWarningThreshold = options.populationWarningThreshold || 0.7;
        this.populationCriticalThreshold = options.populationCriticalThreshold || 0.5;
        this.stalenessDays = options.stalenessDays || 365;
        this.decayWarningDays = options.decayWarningDays || 180;

        // Field decay rates (days until considered stale)
        this.fieldDecayRates = {
            email: 180,
            phone: 365,
            mobile_phone: 365,
            title: 365,
            department: 365,
            employee_count: 365,
            annual_revenue: 365,
            address: 730,
            industry: 1095,
            description: 1095,
            ...options.fieldDecayRates
        };

        // Critical fields that should always be populated
        this.criticalFields = options.criticalFields || [
            'name', 'email', 'phone', 'account_name', 'website'
        ];

        // Data connector (for CRM queries)
        this.dataConnector = options.dataConnector || null;

        // Cache for analysis results
        this._cache = new Map();
        this._cacheExpiry = options.cacheExpiry_ms || 300000; // 5 minutes

        // Load config if provided
        if (options.configPath) {
            this._loadConfig(options.configPath);
        }
    }

    /**
     * Load configuration from file
     * @private
     */
    _loadConfig(configPath) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.field_telemetry) {
                const ft = config.field_telemetry;
                if (ft.population_warning_threshold) {
                    this.populationWarningThreshold = ft.population_warning_threshold;
                }
                if (ft.population_critical_threshold) {
                    this.populationCriticalThreshold = ft.population_critical_threshold;
                }
                if (ft.staleness_days) {
                    this.stalenessDays = ft.staleness_days;
                }
                if (ft.field_decay_rates) {
                    this.fieldDecayRates = { ...this.fieldDecayRates, ...ft.field_decay_rates };
                }
                if (ft.critical_fields) {
                    this.criticalFields = ft.critical_fields;
                }
            }
        } catch (error) {
            console.warn(`Failed to load telemetry config: ${error.message}`);
        }
    }

    /**
     * Analyze field health for a specific object type
     * @param {string} objectType - Object type (e.g., 'Account', 'Contact')
     * @param {string} fieldName - Field API name
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Field health analysis
     */
    async analyzeFieldHealth(objectType, fieldName, options = {}) {
        const cacheKey = `${objectType}.${fieldName}`;

        // Check cache
        const cached = this._getFromCache(cacheKey);
        if (cached && !options.bypassCache) {
            return cached;
        }

        const startTime = Date.now();

        // Get field statistics
        const stats = await this._getFieldStatistics(objectType, fieldName, options);

        // Calculate health metrics
        const populationRate = stats.totalRecords > 0
            ? stats.populatedCount / stats.totalRecords
            : 0;

        const stalenessRate = stats.totalRecords > 0
            ? stats.staleCount / stats.totalRecords
            : 0;

        const automationRatio = stats.totalUpdates > 0
            ? stats.automationUpdates / stats.totalUpdates
            : 0;

        // Determine health status
        const healthScore = this._calculateHealthScore({
            populationRate,
            stalenessRate,
            automationRatio,
            isCritical: this.criticalFields.includes(fieldName.toLowerCase())
        });

        const status = this._determineStatus(healthScore);

        const result = {
            objectType,
            fieldName,
            status,
            healthScore,
            metrics: {
                populationRate: Math.round(populationRate * 1000) / 1000,
                stalenessRate: Math.round(stalenessRate * 1000) / 1000,
                automationRatio: Math.round(automationRatio * 1000) / 1000,
                totalRecords: stats.totalRecords,
                populatedCount: stats.populatedCount,
                staleCount: stats.staleCount,
                lastUpdated: stats.lastUpdated,
                avgUpdateFrequencyDays: stats.avgUpdateFrequencyDays
            },
            updatePatterns: stats.updatePatterns,
            decayRisk: this._assessDecayRisk(fieldName, stats),
            recommendations: this._generateRecommendations({
                fieldName,
                populationRate,
                stalenessRate,
                automationRatio,
                status
            }),
            analyzedAt: new Date().toISOString(),
            duration_ms: Date.now() - startTime
        };

        // Cache result
        this._setCache(cacheKey, result);

        return result;
    }

    /**
     * Get field statistics from data source
     * @private
     */
    async _getFieldStatistics(objectType, fieldName, options = {}) {
        // If data connector is available, query CRM
        if (this.dataConnector && typeof this.dataConnector.queryFieldStats === 'function') {
            return await this.dataConnector.queryFieldStats(objectType, fieldName, options);
        }

        // Otherwise, use sample data or records provided
        if (options.records) {
            return this._calculateStatsFromRecords(options.records, fieldName);
        }

        // Return empty stats if no data available
        return {
            totalRecords: 0,
            populatedCount: 0,
            staleCount: 0,
            lastUpdated: null,
            avgUpdateFrequencyDays: null,
            totalUpdates: 0,
            automationUpdates: 0,
            updatePatterns: {}
        };
    }

    /**
     * Calculate statistics from a set of records
     * @param {Object[]} records - Array of records
     * @param {string} fieldName - Field to analyze
     * @returns {Object} Statistics
     */
    _calculateStatsFromRecords(records, fieldName) {
        if (!records || records.length === 0) {
            return {
                totalRecords: 0,
                populatedCount: 0,
                staleCount: 0,
                lastUpdated: null,
                avgUpdateFrequencyDays: null,
                totalUpdates: 0,
                automationUpdates: 0,
                updatePatterns: {}
            };
        }

        const now = new Date();
        const decayDays = this.fieldDecayRates[fieldName.toLowerCase()] || this.stalenessDays;

        let populatedCount = 0;
        let staleCount = 0;
        let lastUpdated = null;
        const updateDates = [];
        const updateSources = {};

        for (const record of records) {
            // Check if field is populated
            const value = this._getFieldValue(record, fieldName);
            if (value !== null && value !== undefined && value !== '') {
                populatedCount++;

                // Check staleness
                const modifiedDate = this._getFieldModifiedDate(record, fieldName);
                if (modifiedDate) {
                    updateDates.push(modifiedDate);
                    if (!lastUpdated || modifiedDate > lastUpdated) {
                        lastUpdated = modifiedDate;
                    }

                    const daysSinceUpdate = Math.floor(
                        (now - modifiedDate) / (1000 * 60 * 60 * 24)
                    );
                    if (daysSinceUpdate > decayDays) {
                        staleCount++;
                    }
                }

                // Track update source if available
                const source = this._getUpdateSource(record, fieldName);
                updateSources[source] = (updateSources[source] || 0) + 1;
            }
        }

        // Calculate average update frequency
        let avgUpdateFrequencyDays = null;
        if (updateDates.length > 1) {
            updateDates.sort((a, b) => a - b);
            const totalDays = (updateDates[updateDates.length - 1] - updateDates[0]) / (1000 * 60 * 60 * 24);
            avgUpdateFrequencyDays = Math.round(totalDays / (updateDates.length - 1));
        }

        const totalUpdates = Object.values(updateSources).reduce((a, b) => a + b, 0);
        const automationUpdates = (updateSources[UPDATE_SOURCES.AUTOMATION] || 0) +
            (updateSources[UPDATE_SOURCES.INTEGRATION] || 0) +
            (updateSources[UPDATE_SOURCES.ENRICHMENT] || 0);

        return {
            totalRecords: records.length,
            populatedCount,
            staleCount,
            lastUpdated: lastUpdated ? lastUpdated.toISOString() : null,
            avgUpdateFrequencyDays,
            totalUpdates,
            automationUpdates,
            updatePatterns: updateSources
        };
    }

    /**
     * Get field value from record (handles nested paths)
     * @private
     */
    _getFieldValue(record, fieldName) {
        // Handle dot notation for nested fields
        const parts = fieldName.split('.');
        let value = record;

        for (const part of parts) {
            if (value === null || value === undefined) return null;

            // Try exact match first
            if (value[part] !== undefined) {
                value = value[part];
            } else {
                // Try case-insensitive match
                const key = Object.keys(value).find(
                    k => k.toLowerCase() === part.toLowerCase()
                );
                value = key ? value[key] : null;
            }
        }

        return value;
    }

    /**
     * Get field modified date from record
     * @private
     */
    _getFieldModifiedDate(record, fieldName) {
        // Check for field-specific modification date
        const fieldModifiedKey = `${fieldName}__LastModified`;
        if (record[fieldModifiedKey]) {
            return new Date(record[fieldModifiedKey]);
        }

        // Fall back to record-level modification date
        const modifiedFields = ['LastModifiedDate', 'SystemModstamp', 'lastmodifieddate', 'updated_at'];
        for (const field of modifiedFields) {
            if (record[field]) {
                return new Date(record[field]);
            }
        }

        return null;
    }

    /**
     * Determine update source from record metadata
     * @private
     */
    _getUpdateSource(record, fieldName) {
        // Check for field history or metadata
        const lastModifiedBy = record.LastModifiedById || record.lastModifiedBy;

        if (!lastModifiedBy) return UPDATE_SOURCES.UNKNOWN;

        // Check for known automation users
        const automationPatterns = [
            /^005\w{12}$/, // System user IDs in Salesforce
            /automation/i,
            /integration/i,
            /api\s*user/i,
            /sync/i
        ];

        const modifierName = record.LastModifiedBy?.Name || lastModifiedBy;
        for (const pattern of automationPatterns) {
            if (pattern.test(modifierName)) {
                return UPDATE_SOURCES.AUTOMATION;
            }
        }

        return UPDATE_SOURCES.USER;
    }

    /**
     * Calculate overall health score (0-100)
     * @private
     */
    _calculateHealthScore(metrics) {
        let score = 100;

        // Population rate impact (40% of score)
        if (metrics.populationRate < this.populationCriticalThreshold) {
            score -= 40;
        } else if (metrics.populationRate < this.populationWarningThreshold) {
            score -= 20;
        }

        // Staleness impact (30% of score)
        if (metrics.stalenessRate > 0.5) {
            score -= 30;
        } else if (metrics.stalenessRate > 0.25) {
            score -= 15;
        }

        // Critical field bonus/penalty (20% of score)
        if (metrics.isCritical) {
            if (metrics.populationRate < 0.9) {
                score -= 20;
            }
        }

        // Automation balance impact (10% of score)
        // Too much automation (>90%) or too little (<10%) can be concerning
        if (metrics.automationRatio > 0.9 || metrics.automationRatio < 0.1) {
            score -= 5;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Determine status from health score
     * @private
     */
    _determineStatus(healthScore) {
        if (healthScore >= 80) return HEALTH_STATUS.HEALTHY;
        if (healthScore >= 60) return HEALTH_STATUS.WARNING;
        if (healthScore >= 0) return HEALTH_STATUS.CRITICAL;
        return HEALTH_STATUS.UNKNOWN;
    }

    /**
     * Assess decay risk for a field
     * @private
     */
    _assessDecayRisk(fieldName, stats) {
        const decayDays = this.fieldDecayRates[fieldName.toLowerCase()] || this.stalenessDays;

        if (!stats.lastUpdated) {
            return {
                level: 'unknown',
                daysUntilDecay: null,
                decayThresholdDays: decayDays
            };
        }

        const lastUpdate = new Date(stats.lastUpdated);
        const daysSinceUpdate = Math.floor(
            (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const daysUntilDecay = Math.max(0, decayDays - daysSinceUpdate);

        let level = 'low';
        if (daysUntilDecay === 0) {
            level = 'decayed';
        } else if (daysUntilDecay < 30) {
            level = 'high';
        } else if (daysUntilDecay < 90) {
            level = 'medium';
        }

        return {
            level,
            daysUntilDecay,
            daysSinceUpdate,
            decayThresholdDays: decayDays
        };
    }

    /**
     * Generate recommendations based on analysis
     * @private
     */
    _generateRecommendations(metrics) {
        const recommendations = [];

        if (metrics.populationRate < this.populationCriticalThreshold) {
            recommendations.push({
                priority: 'high',
                type: 'population',
                message: `Field "${metrics.fieldName}" has very low population rate (${Math.round(metrics.populationRate * 100)}%). Consider enrichment or data collection initiative.`
            });
        } else if (metrics.populationRate < this.populationWarningThreshold) {
            recommendations.push({
                priority: 'medium',
                type: 'population',
                message: `Field "${metrics.fieldName}" has below-average population rate (${Math.round(metrics.populationRate * 100)}%). Review data entry processes.`
            });
        }

        if (metrics.stalenessRate > 0.25) {
            recommendations.push({
                priority: metrics.stalenessRate > 0.5 ? 'high' : 'medium',
                type: 'staleness',
                message: `${Math.round(metrics.stalenessRate * 100)}% of "${metrics.fieldName}" values may be stale. Consider scheduled re-enrichment.`
            });
        }

        if (metrics.automationRatio > 0.95) {
            recommendations.push({
                priority: 'low',
                type: 'automation',
                message: `Field "${metrics.fieldName}" is almost exclusively updated by automation. Verify data quality is being maintained.`
            });
        }

        if (metrics.automationRatio < 0.05 && metrics.populationRate < 0.8) {
            recommendations.push({
                priority: 'medium',
                type: 'automation',
                message: `Consider automating enrichment for "${metrics.fieldName}" to improve population rate.`
            });
        }

        return recommendations;
    }

    /**
     * Analyze multiple fields for an object type
     * @param {string} objectType - Object type
     * @param {string[]} fieldNames - Fields to analyze
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Multi-field analysis
     */
    async analyzeMultipleFields(objectType, fieldNames, options = {}) {
        const results = {};
        const startTime = Date.now();

        for (const fieldName of fieldNames) {
            results[fieldName] = await this.analyzeFieldHealth(objectType, fieldName, options);
        }

        // Calculate aggregate metrics
        const healthScores = Object.values(results).map(r => r.healthScore);
        const avgHealthScore = healthScores.length > 0
            ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
            : 0;

        const statusCounts = {
            [HEALTH_STATUS.HEALTHY]: 0,
            [HEALTH_STATUS.WARNING]: 0,
            [HEALTH_STATUS.CRITICAL]: 0,
            [HEALTH_STATUS.UNKNOWN]: 0
        };

        for (const result of Object.values(results)) {
            statusCounts[result.status]++;
        }

        return {
            objectType,
            fieldCount: fieldNames.length,
            fields: results,
            aggregate: {
                avgHealthScore,
                statusCounts,
                criticalFields: Object.entries(results)
                    .filter(([, r]) => r.status === HEALTH_STATUS.CRITICAL)
                    .map(([name]) => name),
                warningFields: Object.entries(results)
                    .filter(([, r]) => r.status === HEALTH_STATUS.WARNING)
                    .map(([name]) => name)
            },
            analyzedAt: new Date().toISOString(),
            duration_ms: Date.now() - startTime
        };
    }

    /**
     * Detect fields at risk of decay
     * @param {string} objectType - Object type
     * @param {string[]} fieldNames - Fields to check
     * @param {Object} options - Options
     * @returns {Promise<Object[]>} Fields at decay risk
     */
    async detectDecayRisk(objectType, fieldNames, options = {}) {
        const atRisk = [];

        for (const fieldName of fieldNames) {
            const analysis = await this.analyzeFieldHealth(objectType, fieldName, options);

            if (analysis.decayRisk.level === 'high' || analysis.decayRisk.level === 'decayed') {
                atRisk.push({
                    fieldName,
                    decayRisk: analysis.decayRisk,
                    populationRate: analysis.metrics.populationRate,
                    recommendation: analysis.decayRisk.level === 'decayed'
                        ? 'Immediate re-enrichment recommended'
                        : `Re-enrichment needed within ${analysis.decayRisk.daysUntilDecay} days`
                });
            }
        }

        return atRisk.sort((a, b) =>
            (a.decayRisk.daysUntilDecay || 0) - (b.decayRisk.daysUntilDecay || 0)
        );
    }

    /**
     * Get field usage summary
     * @param {Object} options - Options including reports/dashboards using field
     * @returns {Object} Usage summary
     */
    getFieldUsage(fieldName, options = {}) {
        const usage = {
            fieldName,
            usedIn: {
                reports: options.reports || [],
                dashboards: options.dashboards || [],
                workflows: options.workflows || [],
                validationRules: options.validationRules || [],
                formulas: options.formulas || []
            },
            usageCount: 0,
            criticality: 'low'
        };

        // Count total usage
        usage.usageCount = Object.values(usage.usedIn)
            .reduce((sum, arr) => sum + arr.length, 0);

        // Determine criticality
        if (usage.usageCount > 10) {
            usage.criticality = 'high';
        } else if (usage.usageCount > 5) {
            usage.criticality = 'medium';
        }

        return usage;
    }

    /**
     * Set data connector
     * @param {Object} connector - Data connector instance
     */
    setDataConnector(connector) {
        this.dataConnector = connector;
    }

    /**
     * Clear analysis cache
     */
    clearCache() {
        this._cache.clear();
    }

    /**
     * Get from cache
     * @private
     */
    _getFromCache(key) {
        const cached = this._cache.get(key);
        if (cached && Date.now() - cached.timestamp < this._cacheExpiry) {
            return cached.data;
        }
        return null;
    }

    /**
     * Set cache
     * @private
     */
    _setCache(key, data) {
        this._cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Get health status constants
     * @returns {Object}
     */
    static get STATUS() {
        return { ...HEALTH_STATUS };
    }

    /**
     * Get update source constants
     * @returns {Object}
     */
    static get SOURCES() {
        return { ...UPDATE_SOURCES };
    }
}

module.exports = {
    FieldTelemetryAnalyzer,
    HEALTH_STATUS,
    UPDATE_SOURCES
};
