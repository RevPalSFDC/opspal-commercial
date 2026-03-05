/**
 * Governance Module
 *
 * Provides comprehensive data governance capabilities including:
 * - Field telemetry and health analysis
 * - Anomaly detection and correction
 * - Relationship inference
 * - Policy enforcement and approval workflows
 * - Audit logging and compliance
 *
 * @module governance
 */

'use strict';

const { FieldTelemetryAnalyzer, HEALTH_STATUS, UPDATE_SOURCES } = require('./field-telemetry-analyzer');
const { DataHealthReporter, REPORT_TYPES, REPORT_FORMATS, HEALTH_GRADES } = require('./data-health-reporter');
const { AnomalyDetectionEngine, SEVERITY, ANOMALY_TYPES } = require('./anomaly-detection-engine');
const { RelationshipInferenceService, RELATIONSHIP_TYPES, CONFIDENCE } = require('./relationship-inference-service');
const { GovernanceController, ACTION_OUTCOME, APPROVAL_STATUS } = require('./governance-controller');
const { AuditLogger, AUDIT_TYPES } = require('./audit-logger');

/**
 * Create a fully configured governance system
 * @param {Object} options - Configuration options
 * @returns {Object} Configured governance system components
 */
function createGovernanceSystem(options = {}) {
    const configPath = options.configPath || null;

    // Create components
    const auditLogger = new AuditLogger({
        storagePath: options.auditStoragePath,
        retentionDays: options.retentionDays
    });

    const fieldTelemetryAnalyzer = new FieldTelemetryAnalyzer({
        configPath,
        dataConnector: options.dataConnector,
        ...options.telemetryOptions
    });

    const anomalyDetector = new AnomalyDetectionEngine({
        patternsPath: options.anomalyPatternsPath,
        ...options.anomalyOptions
    });

    const relationshipService = new RelationshipInferenceService({
        anomalyDetector,
        ...options.relationshipOptions
    });

    const governanceController = new GovernanceController({
        policiesPath: options.policiesPath,
        auditLogger,
        notificationHandler: options.notificationHandler,
        ...options.governanceOptions
    });

    const dataHealthReporter = new DataHealthReporter({
        telemetryAnalyzer: fieldTelemetryAnalyzer,
        anomalyDetector,
        governanceController,
        orgName: options.orgName,
        ...options.reporterOptions
    });

    // Wire up dependencies
    relationshipService.setAnomalyDetector(anomalyDetector);
    governanceController.setAuditLogger(auditLogger);

    return {
        auditLogger,
        fieldTelemetryAnalyzer,
        anomalyDetector,
        relationshipService,
        governanceController,
        dataHealthReporter,

        // Convenience method to run comprehensive analysis
        async analyzeDataQuality(data) {
            const results = {};

            // Run anomaly detection
            results.anomalies = await anomalyDetector.detectAll(data);

            // Generate health report
            results.healthReport = dataHealthReporter.generateDetailedReport({
                ...data,
                anomalies: results.anomalies.anomalies
            });

            // Infer relationships
            if (data.accounts) {
                results.relationships = relationshipService.inferParentChildRelationships(
                    data.accounts
                );
            }

            return results;
        }
    };
}

module.exports = {
    // Classes
    FieldTelemetryAnalyzer,
    DataHealthReporter,
    AnomalyDetectionEngine,
    RelationshipInferenceService,
    GovernanceController,
    AuditLogger,

    // Constants
    HEALTH_STATUS,
    UPDATE_SOURCES,
    REPORT_TYPES,
    REPORT_FORMATS,
    HEALTH_GRADES,
    SEVERITY,
    ANOMALY_TYPES,
    RELATIONSHIP_TYPES,
    CONFIDENCE,
    ACTION_OUTCOME,
    APPROVAL_STATUS,
    AUDIT_TYPES,

    // Factory
    createGovernanceSystem
};
