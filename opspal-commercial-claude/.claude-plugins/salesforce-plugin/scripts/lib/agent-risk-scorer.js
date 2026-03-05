#!/usr/bin/env node

/**
 * Agent Risk Scorer
 *
 * Calculates risk scores (0-100) for autonomous agent operations in Salesforce.
 * Part of the Agent Governance Framework.
 *
 * Risk calculation formula:
 *   riskScore = impactScore (0-30) + environmentRisk (0-25) +
 *               volumeRisk (0-20) + historicalRisk (0-15) +
 *               complexityRisk (0-10)
 *
 * Risk levels:
 *   0-30: LOW (proceed automatically)
 *   31-50: MEDIUM (proceed with logging)
 *   51-70: HIGH (require approval)
 *   71-100: CRITICAL (block + manual review)
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const fs = require('fs');
const path = require('path');

/**
 * Agent Risk Scorer class
 */
class AgentRiskScorer {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.historyPath = options.historyPath || path.join(
            process.env.HOME || process.env.USERPROFILE,
            '.claude',
            'logs',
            'agent-governance',
            'operation-history.json'
        );

        // Load historical data
        this.history = this.loadHistory();

        // Risk thresholds
        this.thresholds = {
            LOW: { min: 0, max: 30 },
            MEDIUM: { min: 31, max: 50 },
            HIGH: { min: 51, max: 70 },
            CRITICAL: { min: 71, max: 100 }
        };
    }

    /**
     * Calculate risk score for an operation
     *
     * @param {Object} operation - Operation details
     * @param {string} operation.type - Operation type (e.g., 'DEPLOY_FIELD', 'UPDATE_RECORDS')
     * @param {string} operation.agent - Agent name
     * @param {string} operation.environment - Target environment (production, sandbox, dev)
     * @param {string} operation.orgId - Salesforce org ID
     * @param {number} operation.recordCount - Number of records affected
     * @param {number} operation.componentCount - Number of metadata components
     * @param {Array<string>} operation.components - List of components
     * @param {Array<string>} operation.dependencies - Dependencies
     * @param {boolean} operation.hasCircularDeps - Has circular dependencies
     * @param {boolean} operation.isRecursive - Is recursive operation
     * @returns {Object} Risk assessment
     */
    calculateRisk(operation) {
        const startTime = Date.now();

        // Validate input
        this.validateOperation(operation);

        const normalizedOperation = {
            ...operation,
            environment: operation.environment ||
                process.env.SALESFORCE_ENVIRONMENT ||
                process.env.SF_ENVIRONMENT ||
                'unknown'
        };

        // Calculate each risk component
        const impactScore = this.calculateImpactScore(normalizedOperation);
        const environmentRisk = this.calculateEnvironmentRisk(normalizedOperation);
        const volumeRisk = this.calculateVolumeRisk(normalizedOperation);
        const historicalRisk = this.calculateHistoricalRisk(normalizedOperation);
        const complexityRisk = this.calculateComplexityRisk(normalizedOperation);

        // Total risk score
        const totalRisk = Math.min(
            impactScore + environmentRisk + volumeRisk + historicalRisk + complexityRisk,
            100
        );

        // Determine risk level
        const riskLevel = this.getRiskLevel(totalRisk);
        const dataMutationRequiresApproval = this.requiresApprovalForDataMutation(normalizedOperation);
        const requiresApproval = riskLevel === 'HIGH' || riskLevel === 'CRITICAL' || dataMutationRequiresApproval;
        const approvalReasons = [];

        if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
            approvalReasons.push(`risk_${riskLevel.toLowerCase()}`);
        }
        if (dataMutationRequiresApproval) {
            approvalReasons.push('data_mutation_production');
        }

        // Build detailed result
        const result = {
            riskScore: totalRisk,
            riskLevel: riskLevel,
            requiresApproval: requiresApproval,
            blocked: riskLevel === 'CRITICAL',
            approvalReasons: approvalReasons,
            breakdown: {
                impactScore: {
                    score: impactScore,
                    maxScore: 30,
                    factors: this.getImpactFactors(normalizedOperation)
                },
                environmentRisk: {
                    score: environmentRisk,
                    maxScore: 25,
                    environment: normalizedOperation.environment
                },
                volumeRisk: {
                    score: volumeRisk,
                    maxScore: 20,
                    recordCount: normalizedOperation.recordCount || 0,
                    componentCount: normalizedOperation.componentCount || 0
                },
                historicalRisk: {
                    score: historicalRisk,
                    maxScore: 15,
                    failureRate: this.getFailureRate(normalizedOperation)
                },
                complexityRisk: {
                    score: complexityRisk,
                    maxScore: 10,
                    factors: this.getComplexityFactors(normalizedOperation)
                }
            },
            recommendations: this.generateRecommendations(totalRisk, normalizedOperation, {
                requiresApproval,
                approvalReasons
            }),
            calculationTime: Date.now() - startTime
        };

        if (this.verbose) {
            this.printRiskAssessment(result, normalizedOperation);
        }

        return result;
    }

    /**
     * Normalize environment to standard types
     */
    normalizeEnvironment(environment) {
        const env = String(environment || '').toLowerCase();

        if (!env || env === 'unknown') {
            return 'unknown';
        }

        if (env.includes('production') || env.includes('prod') || env.includes('main') || env.includes('live')) {
            return 'production';
        }

        if (env.includes('full') && env.includes('sandbox')) {
            return 'full-sandbox';
        }

        if (env.includes('sandbox') || env.includes('sbx')) {
            return 'sandbox';
        }

        if (env.includes('uat')) {
            return 'uat';
        }

        if (env.includes('staging') || env.includes('stage')) {
            return 'staging';
        }

        if (env.includes('qa') || env.includes('test')) {
            return 'test';
        }

        if (env.includes('dev')) {
            return 'dev';
        }

        return 'unknown';
    }

    /**
     * Check if operation is a data mutation (create/update/delete/upsert/import)
     */
    isDataMutationOperation(operationType) {
        const type = String(operationType || '').toUpperCase();

        if (!type) {
            return false;
        }

        if (['CREATE', 'INSERT', 'UPDATE', 'DELETE', 'UPSERT', 'MERGE'].includes(type)) {
            return true;
        }

        const mutationMarkers = [
            'CREATE_RECORD',
            'CREATE_RECORDS',
            'UPDATE_RECORD',
            'UPDATE_RECORDS',
            'UPSERT_RECORD',
            'UPSERT_RECORDS',
            'DELETE_RECORD',
            'DELETE_RECORDS',
            'MERGE_RECORD',
            'MERGE_RECORDS',
            'DATA_LOAD',
            'DATA_MIGRATION',
            'DATA_IMPORT',
            'DATA_UPLOAD',
            'DATA_UPDATE',
            'DATA_DELETE',
            'DATA_UPSERT',
            'DATA_INSERT',
            'BULK_UPDATE',
            'BULK_INSERT',
            'BULK_DELETE',
            'BULK_UPSERT',
            'BULK_LOAD'
        ];

        if (mutationMarkers.some(marker => type.includes(marker))) {
            return true;
        }

        if (type.includes('RECORD') && (
            type.includes('CREATE') ||
            type.includes('UPDATE') ||
            type.includes('UPSERT') ||
            type.includes('DELETE') ||
            type.includes('MERGE')
        )) {
            return true;
        }

        if (type.includes('DATA') && (
            type.includes('IMPORT') ||
            type.includes('UPLOAD') ||
            type.includes('UPDATE') ||
            type.includes('DELETE') ||
            type.includes('UPSERT') ||
            type.includes('INSERT') ||
            type.includes('LOAD') ||
            type.includes('MIGRATION')
        )) {
            return true;
        }

        return false;
    }

    /**
     * Determine if data mutation requires approval in this environment
     */
    requiresApprovalForDataMutation(operation) {
        const normalizedEnv = this.normalizeEnvironment(operation.environment);
        const prepMode = process.env.GOVERNANCE_PREP_MODE === '1' ||
            process.env.GOVERNANCE_PREP_MODE === 'true';

        if (prepMode) {
            return false;
        }

        if (!this.isDataMutationOperation(operation.type)) {
            return false;
        }

        return normalizedEnv === 'production';
    }

    /**
     * Calculate impact score (0-30)
     * Based on what data/functionality is affected
     */
    calculateImpactScore(operation) {
        const type = operation.type.toUpperCase();

        // Critical impact (30 points)
        const criticalOps = [
            'UPDATE_PROFILE',
            'UPDATE_PERMISSION_SET',
            'UPDATE_ROLE',
            'UPDATE_SHARING_RULE',
            'DELETE_PERMISSION_SET',
            'GRANT_ADMIN_ACCESS'
        ];
        if (criticalOps.some(op => type.includes(op))) {
            return 30;
        }

        // High impact (20 points)
        const highImpactOps = [
            'DEPLOY_VALIDATION_RULE',
            'DEPLOY_TRIGGER',
            'DEPLOY_FLOW',
            'DELETE_RECORDS',
            'DELETE_FIELD'
        ];
        if (highImpactOps.some(op => type.includes(op))) {
            return 20;
        }

        // Medium impact (10 points)
        const mediumImpactOps = [
            'DEPLOY_FIELD',
            'DEPLOY_OBJECT',
            'UPDATE_WORKFLOW',
            'BULK_UPDATE'
        ];
        if (mediumImpactOps.some(op => type.includes(op))) {
            return 10;
        }

        // Low impact (5 points)
        const lowImpactOps = [
            'UPDATE_RECORD',
            'CREATE_RECORD',
            'DEPLOY_LAYOUT',
            'DEPLOY_REPORT'
        ];
        if (lowImpactOps.some(op => type.includes(op))) {
            return 5;
        }

        // No impact (0 points) - read-only operations
        if (type.includes('QUERY') || type.includes('READ') || type.includes('GET')) {
            return 0;
        }

        // Default to medium for unknown operations
        return 10;
    }

    /**
     * Calculate environment risk (0-25)
     * Based on where the operation is happening
     */
    calculateEnvironmentRisk(operation) {
        const env = (operation.environment || 'unknown').toLowerCase();

        if (env.includes('production') || env.includes('prod')) {
            return 25;
        }

        if (env.includes('full') && env.includes('sandbox')) {
            return 15; // Full sandbox (production replica)
        }

        if (env.includes('uat') || env.includes('staging')) {
            return 10;
        }

        if (env.includes('qa') || env.includes('test')) {
            return 5;
        }

        if (env.includes('dev') || env.includes('sandbox')) {
            return 0;
        }

        // Unknown environment - treat as medium risk
        return 10;
    }

    /**
     * Calculate volume risk (0-20)
     * Based on how many records/components are affected
     */
    calculateVolumeRisk(operation) {
        const recordCount = operation.recordCount || 0;
        const componentCount = operation.componentCount || 0;

        // Use the higher of record count or component count risk
        let recordRisk = 0;
        if (recordCount === 0) {
            recordRisk = 0;
        } else if (recordCount < 100) {
            recordRisk = 2;
        } else if (recordCount < 1000) {
            recordRisk = 5;
        } else if (recordCount < 10000) {
            recordRisk = 10;
        } else if (recordCount < 50000) {
            recordRisk = 15;
        } else {
            recordRisk = 20; // 50k+ records
        }

        let componentRisk = 0;
        if (componentCount === 0) {
            componentRisk = 0;
        } else if (componentCount < 5) {
            componentRisk = 2;
        } else if (componentCount < 10) {
            componentRisk = 5;
        } else if (componentCount < 25) {
            componentRisk = 10;
        } else if (componentCount < 50) {
            componentRisk = 15;
        } else {
            componentRisk = 20; // 50+ components
        }

        return Math.max(recordRisk, componentRisk);
    }

    /**
     * Calculate historical risk (0-15)
     * Based on past failures for this operation type + agent
     */
    calculateHistoricalRisk(operation) {
        const failureRate = this.getFailureRate(operation);

        if (failureRate === 0) {
            return 0;
        }

        if (failureRate < 0.05) {
            return 3; // <5% failure rate
        }

        if (failureRate < 0.10) {
            return 7; // 5-10% failure rate
        }

        if (failureRate < 0.20) {
            return 12; // 10-20% failure rate
        }

        return 15; // 20%+ failure rate
    }

    /**
     * Calculate complexity risk (0-10)
     * Based on operation complexity indicators
     */
    calculateComplexityRisk(operation) {
        let score = 0;

        // Dependencies increase complexity
        const depCount = (operation.dependencies || []).length;
        if (depCount === 0) {
            score += 0;
        } else if (depCount < 3) {
            score += 2;
        } else if (depCount < 10) {
            score += 5;
        } else {
            score += 8;
        }

        // Circular dependencies are highly complex
        if (operation.hasCircularDeps) {
            score += 5;
        }

        // Recursive operations add complexity
        if (operation.isRecursive) {
            score += 3;
        }

        // Cross-object operations add complexity
        if (operation.crossObject) {
            score += 2;
        }

        return Math.min(score, 10);
    }

    /**
     * Get failure rate for this operation type + agent from history
     */
    getFailureRate(operation) {
        const key = `${operation.agent}:${operation.type}`;
        const data = this.history[key];

        if (!data || data.attempts === 0) {
            return 0;
        }

        return data.failures / data.attempts;
    }

    /**
     * Get risk level from score
     */
    getRiskLevel(score) {
        for (const [level, threshold] of Object.entries(this.thresholds)) {
            if (score >= threshold.min && score <= threshold.max) {
                return level;
            }
        }
        return 'UNKNOWN';
    }

    /**
     * Get impact factors for display
     */
    getImpactFactors(operation) {
        const factors = [];
        const type = operation.type.toUpperCase();

        if (type.includes('PROFILE') || type.includes('PERMISSION') ||
            type.includes('ROLE') || type.includes('SHARING')) {
            factors.push('Security/permission change');
        }

        if (type.includes('DELETE')) {
            factors.push('Destructive operation');
        }

        if (type.includes('VALIDATION') || type.includes('TRIGGER') ||
            type.includes('FLOW')) {
            factors.push('Automation deployment');
        }

        if (type.includes('FIELD') || type.includes('OBJECT')) {
            factors.push('Schema modification');
        }

        if (factors.length === 0) {
            factors.push('Standard operation');
        }

        return factors;
    }

    /**
     * Get complexity factors for display
     */
    getComplexityFactors(operation) {
        const factors = [];

        const depCount = (operation.dependencies || []).length;
        if (depCount > 0) {
            factors.push(`${depCount} dependencies`);
        }

        if (operation.hasCircularDeps) {
            factors.push('Circular dependencies detected');
        }

        if (operation.isRecursive) {
            factors.push('Recursive operation');
        }

        if (operation.crossObject) {
            factors.push('Cross-object operation');
        }

        if (factors.length === 0) {
            factors.push('Simple operation');
        }

        return factors;
    }

    /**
     * Generate recommendations based on risk level
     */
    generateRecommendations(riskScore, operation, options = {}) {
        const recommendations = [];

        if (options.requiresApproval && riskScore < 51) {
            recommendations.push({
                type: 'POLICY',
                message: 'Approval required for production data mutation',
                action: 'Submit approval request with data change scope and rollback plan'
            });
        }

        if (riskScore >= 71) {
            recommendations.push({
                type: 'CRITICAL',
                message: 'Operation blocked - manual review required',
                action: 'Submit detailed change request with business justification and rollback plan'
            });
            recommendations.push({
                type: 'CRITICAL',
                message: 'Test in sandbox environment first',
                action: 'Validate operation in dev/QA sandbox before production'
            });
        } else if (riskScore >= 51) {
            recommendations.push({
                type: 'HIGH',
                message: 'Approval required before proceeding',
                action: 'Submit approval request with operation details and reasoning'
            });
            recommendations.push({
                type: 'HIGH',
                message: 'Prepare rollback plan',
                action: 'Document steps to undo this operation if issues occur'
            });
        } else if (riskScore >= 31) {
            recommendations.push({
                type: 'MEDIUM',
                message: 'Proceeding with enhanced logging',
                action: 'Monitor logs closely for unexpected behavior'
            });
            recommendations.push({
                type: 'MEDIUM',
                message: 'Consider sandbox testing',
                action: 'Test in sandbox if this is a new or modified operation'
            });
        } else {
            recommendations.push({
                type: 'LOW',
                message: 'Low risk - proceeding automatically',
                action: 'Standard logging and monitoring'
            });
        }

        // Environment-specific recommendations
        if ((operation.environment || '').toLowerCase().includes('production')) {
            recommendations.push({
                type: 'INFO',
                message: 'Production environment',
                action: 'Ensure change window compliance and stakeholder notification'
            });
        }

        // Volume-specific recommendations
        const recordCount = operation.recordCount || 0;
        if (recordCount > 10000) {
            recommendations.push({
                type: 'INFO',
                message: 'High volume operation',
                action: 'Consider batch processing and rate limiting'
            });
        }

        return recommendations;
    }

    /**
     * Validate operation input
     */
    validateOperation(operation) {
        if (!operation) {
            throw new Error('Operation object is required');
        }

        if (!operation.type) {
            throw new Error('Operation type is required');
        }

        if (!operation.agent) {
            throw new Error('Agent name is required');
        }

        if (!operation.environment) {
            console.warn('Warning: Environment not specified, defaulting to unknown');
        }
    }

    /**
     * Load operation history from disk
     */
    loadHistory() {
        try {
            if (fs.existsSync(this.historyPath)) {
                const data = fs.readFileSync(this.historyPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Could not load history from ${this.historyPath}:`, error.message);
            }
        }

        return {};
    }

    /**
     * Save operation history to disk
     */
    saveHistory() {
        try {
            const dir = path.dirname(this.historyPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(
                this.historyPath,
                JSON.stringify(this.history, null, 2),
                'utf8'
            );

            return true;
        } catch (error) {
            if (this.verbose) {
                console.error(`Could not save history to ${this.historyPath}:`, error.message);
            }
            return false;
        }
    }

    /**
     * Record operation outcome to history
     */
    recordOutcome(operation, success) {
        const key = `${operation.agent}:${operation.type}`;

        if (!this.history[key]) {
            this.history[key] = {
                attempts: 0,
                successes: 0,
                failures: 0,
                lastAttempt: null,
                lastSuccess: null,
                lastFailure: null
            };
        }

        const data = this.history[key];
        data.attempts++;
        data.lastAttempt = new Date().toISOString();

        if (success) {
            data.successes++;
            data.lastSuccess = data.lastAttempt;
        } else {
            data.failures++;
            data.lastFailure = data.lastAttempt;
        }

        this.saveHistory();
    }

    /**
     * Print risk assessment to console
     */
    printRiskAssessment(result, operation) {
        console.log('\n' + '='.repeat(70));
        console.log('AGENT RISK ASSESSMENT');
        console.log('='.repeat(70));
        console.log(`\nAgent: ${operation.agent}`);
        console.log(`Operation: ${operation.type}`);
        console.log(`Environment: ${operation.environment}`);
        console.log(`\nRISK SCORE: ${result.riskScore}/100 (${result.riskLevel})`);

        const getBar = (score, max) => {
            const width = 40;
            const filled = Math.round((score / max) * width);
            const empty = width - filled;
            return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
        };

        console.log(`\nBREAKDOWN:`);
        console.log(`  Impact Score:      ${result.breakdown.impactScore.score}/${result.breakdown.impactScore.maxScore}  ${getBar(result.breakdown.impactScore.score, result.breakdown.impactScore.maxScore)}`);
        result.breakdown.impactScore.factors.forEach(f => console.log(`                      - ${f}`));

        console.log(`  Environment Risk:  ${result.breakdown.environmentRisk.score}/${result.breakdown.environmentRisk.maxScore}  ${getBar(result.breakdown.environmentRisk.score, result.breakdown.environmentRisk.maxScore)}`);
        console.log(`                      - ${result.breakdown.environmentRisk.environment}`);

        console.log(`  Volume Risk:       ${result.breakdown.volumeRisk.score}/${result.breakdown.volumeRisk.maxScore}  ${getBar(result.breakdown.volumeRisk.score, result.breakdown.volumeRisk.maxScore)}`);
        if (result.breakdown.volumeRisk.recordCount > 0) {
            console.log(`                      - ${result.breakdown.volumeRisk.recordCount} records`);
        }
        if (result.breakdown.volumeRisk.componentCount > 0) {
            console.log(`                      - ${result.breakdown.volumeRisk.componentCount} components`);
        }

        console.log(`  Historical Risk:   ${result.breakdown.historicalRisk.score}/${result.breakdown.historicalRisk.maxScore}  ${getBar(result.breakdown.historicalRisk.score, result.breakdown.historicalRisk.maxScore)}`);
        const failureRate = result.breakdown.historicalRisk.failureRate;
        if (failureRate > 0) {
            console.log(`                      - ${(failureRate * 100).toFixed(1)}% failure rate`);
        } else {
            console.log(`                      - No historical failures`);
        }

        console.log(`  Complexity Risk:   ${result.breakdown.complexityRisk.score}/${result.breakdown.complexityRisk.maxScore}  ${getBar(result.breakdown.complexityRisk.score, result.breakdown.complexityRisk.maxScore)}`);
        result.breakdown.complexityRisk.factors.forEach(f => console.log(`                      - ${f}`));

        console.log(`\nDECISION:`);
        if (result.blocked) {
            console.log(`  ❌ BLOCKED - Manual review required`);
        } else if (result.requiresApproval) {
            console.log(`  ⚠️  APPROVAL REQUIRED`);
        } else {
            console.log(`  ✅ PROCEED with ${result.riskLevel} risk`);
        }

        console.log(`\nRECOMMENDATIONS:`);
        result.recommendations.forEach((rec, i) => {
            console.log(`  ${i + 1}. [${rec.type}] ${rec.message}`);
            console.log(`      → ${rec.action}`);
        });

        console.log('\n' + '='.repeat(70) + '\n');
    }
}

/**
 * CLI interface
 */
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Agent Risk Scorer - Calculate risk scores for agent operations

Usage:
  node agent-risk-scorer.js [options]

Options:
  --type <type>                Operation type (required)
  --agent <name>               Agent name (required)
  --environment <env>          Target environment (default: unknown)
  --record-count <n>           Number of records affected (default: 0)
  --component-count <n>        Number of components affected (default: 0)
  --has-circular-deps          Has circular dependencies (default: false)
  --is-recursive               Is recursive operation (default: false)
  --cross-object               Cross-object operation (default: false)
  --verbose                    Verbose output
  --help, -h                   Show this help

Examples:
  # Query operation in production
  node agent-risk-scorer.js --type QUERY_RECORDS --agent sfdc-data-operations --environment production --record-count 500 --verbose

  # Field deployment in production
  node agent-risk-scorer.js --type DEPLOY_FIELD --agent sfdc-metadata-manager --environment production --verbose

  # Permission set update in production
  node agent-risk-scorer.js --type UPDATE_PERMISSION_SET --agent sfdc-security-admin --environment production --verbose

  # Bulk update in sandbox
  node agent-risk-scorer.js --type UPDATE_RECORDS --agent sfdc-data-operations --environment sandbox --record-count 50000 --verbose
`);
        process.exit(0);
    }

    // Parse arguments
    const options = {
        type: null,
        agent: null,
        environment: 'unknown',
        recordCount: 0,
        componentCount: 0,
        dependencies: [],
        hasCircularDeps: false,
        isRecursive: false,
        crossObject: false,
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];

        if (arg === '--type' && next) {
            options.type = next;
            i++;
        } else if (arg === '--agent' && next) {
            options.agent = next;
            i++;
        } else if (arg === '--environment' && next) {
            options.environment = next;
            i++;
        } else if (arg === '--record-count' && next) {
            options.recordCount = parseInt(next, 10);
            i++;
        } else if (arg === '--component-count' && next) {
            options.componentCount = parseInt(next, 10);
            i++;
        } else if (arg === '--has-circular-deps') {
            options.hasCircularDeps = true;
        } else if (arg === '--is-recursive') {
            options.isRecursive = true;
        } else if (arg === '--cross-object') {
            options.crossObject = true;
        } else if (arg === '--verbose') {
            options.verbose = true;
        }
    }

    if (!options.type || !options.agent) {
        console.error('Error: --type and --agent are required');
        console.error('Run with --help for usage information');
        process.exit(1);
    }

    // Calculate risk
    const scorer = new AgentRiskScorer({ verbose: options.verbose });
    const result = scorer.calculateRisk(options);

    // Output JSON result
    if (!options.verbose) {
        console.log(JSON.stringify(result, null, 2));
    }

    // Exit with appropriate code
    process.exit(result.blocked ? 1 : 0);
}

module.exports = AgentRiskScorer;
