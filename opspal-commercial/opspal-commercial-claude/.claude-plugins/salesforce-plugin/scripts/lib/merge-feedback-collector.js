#!/usr/bin/env node

/**
 * Merge Feedback Collector - Phase 2 Enhancement
 *
 * Collects feedback from merge operations to improve future decision quality.
 * Tracks merge outcomes, detects patterns, and enables learning.
 *
 * Implementation Date: 2025-10-16
 * Part of: PHASE2_DESIGN.md - Task 2.4
 *
 * Usage:
 *   const collector = new MergeFeedbackCollector(feedbackDbPath);
 *   await collector.recordMerge(decision, outcome);
 *   const metrics = await collector.getAccuracyMetrics();
 */

const fs = require('fs');
const path = require('path');

class MergeFeedbackCollector {
    constructor(feedbackDbPath = './merge-feedback.json') {
        this.feedbackDbPath = feedbackDbPath;
        this.feedback = this.loadFeedbackDb();
    }

    /**
     * Load feedback database from file
     */
    loadFeedbackDb() {
        if (fs.existsSync(this.feedbackDbPath)) {
            try {
                return JSON.parse(fs.readFileSync(this.feedbackDbPath, 'utf8'));
            } catch (error) {
                console.error(`Failed to load feedback DB: ${error.message}`);
                return this.createEmptyDb();
            }
        }
        return this.createEmptyDb();
    }

    /**
     * Create empty feedback database structure
     */
    createEmptyDb() {
        return {
            version: '1.0.0',
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            merges: [],
            stats: {
                totalMerges: 0,
                successfulMerges: 0,
                failedMerges: 0,
                rolledBackMerges: 0
            }
        };
    }

    /**
     * Save feedback database to file
     */
    saveFeedbackDb() {
        this.feedback.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.feedbackDbPath, JSON.stringify(this.feedback, null, 2));
    }

    /**
     * Record merge outcome
     * @param {Object} decision - Original decision object from dedup-safety-engine
     * @param {Object} outcome - Merge outcome from merge-executor
     * @returns {String} - Merge ID
     */
    async recordMerge(decision, outcome) {
        const mergeId = this.generateMergeId();

        const feedbackRecord = {
            merge_id: mergeId,
            timestamp: new Date().toISOString(),
            pair_id: decision.pair_id,

            // Original decision
            original_decision: {
                decision: decision.decision,
                recommended_survivor: decision.recommended_survivor,
                recommended_deleted: decision.recommended_deleted,
                confidence: decision.confidence || this.calculateBasicConfidence(decision),
                enhanced_confidence: decision.enhanced_confidence || null,
                guardrails_triggered: decision.guardrails_triggered.map(g => g.type),
                conflicts_detected: decision.conflicts ? decision.conflicts.conflictCount : 0
            },

            // Actual execution
            execution: {
                executed_at: outcome.executed_at || new Date().toISOString(),
                actual_survivor: outcome.survivor,
                actual_deleted: outcome.deleted,
                followed_recommendation: outcome.survivor === decision.recommended_survivor
            },

            // Outcome
            outcome: {
                status: outcome.status, // SUCCESS, ERROR, ROLLBACK
                error_message: outcome.error_message || null,
                rollback_required: outcome.rollback_required || false,
                data_loss: outcome.data_loss || false,
                user_correction: outcome.user_correction || false
            },

            // Metrics
            metrics: {
                contacts_transferred: outcome.contacts_transferred || 0,
                opportunities_transferred: outcome.opportunities_transferred || 0,
                cases_transferred: outcome.cases_transferred || 0,
                fields_merged: outcome.fields_merged || 0,
                conflicts_encountered: outcome.conflicts_encountered || 0,
                duration_ms: outcome.duration_ms || 0
            },

            // Calculated actual confidence (post-merge assessment)
            actual_confidence: this.calculateActualConfidence(outcome)
        };

        // Add to database
        this.feedback.merges.push(feedbackRecord);

        // Update stats
        this.feedback.stats.totalMerges++;
        if (outcome.status === 'SUCCESS') {
            this.feedback.stats.successfulMerges++;
        } else if (outcome.status === 'ERROR') {
            this.feedback.stats.failedMerges++;
        } else if (outcome.status === 'ROLLBACK') {
            this.feedback.stats.rolledBackMerges++;
        }

        // Save to disk
        this.saveFeedbackDb();

        return mergeId;
    }

    /**
     * Generate unique merge ID
     */
    generateMergeId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `merge_${timestamp}_${random}`;
    }

    /**
     * Calculate basic confidence from decision (if not present)
     */
    calculateBasicConfidence(decision) {
        const scoreA = decision.scores.recordA.score;
        const scoreB = decision.scores.recordB.score;
        const maxScore = Math.max(scoreA, scoreB);
        const minScore = Math.min(scoreA, scoreB);

        if (maxScore === 0) return 50;

        const ratio = minScore / maxScore;
        const confidence = 50 + ((1 - ratio) * 50);
        return Math.round(confidence);
    }

    /**
     * Calculate actual confidence based on merge outcome
     * High actual confidence = successful merge with no issues
     * Low actual confidence = errors, rollbacks, data loss
     */
    calculateActualConfidence(outcome) {
        let confidence = 100;

        // Major issues
        if (outcome.status === 'ERROR') confidence -= 50;
        if (outcome.rollback_required) confidence -= 40;
        if (outcome.data_loss) confidence -= 30;

        // Minor issues
        if (outcome.user_correction) confidence -= 10;
        if (outcome.conflicts_encountered > 0) confidence -= (outcome.conflicts_encountered * 5);

        // Performance factors
        if (outcome.duration_ms > 30000) confidence -= 5; // Took >30 seconds

        return Math.max(0, confidence);
    }

    /**
     * Get accuracy metrics by confidence band
     * @returns {Object} - Accuracy metrics
     */
    async getAccuracyMetrics() {
        const bands = {
            '90-100%': { predicted: [], actual: [], successful: 0, total: 0 },
            '75-89%': { predicted: [], actual: [], successful: 0, total: 0 },
            '60-74%': { predicted: [], actual: [], successful: 0, total: 0 },
            '40-59%': { predicted: [], actual: [], successful: 0, total: 0 },
            '0-39%': { predicted: [], actual: [], successful: 0, total: 0 }
        };

        for (const merge of this.feedback.merges) {
            const predictedConfidence = merge.original_decision.confidence;
            const actualConfidence = merge.actual_confidence;
            const successful = merge.outcome.status === 'SUCCESS';

            // Determine band
            let band;
            if (predictedConfidence >= 90) band = '90-100%';
            else if (predictedConfidence >= 75) band = '75-89%';
            else if (predictedConfidence >= 60) band = '60-74%';
            else if (predictedConfidence >= 40) band = '40-59%';
            else band = '0-39%';

            bands[band].predicted.push(predictedConfidence);
            bands[band].actual.push(actualConfidence);
            bands[band].total++;
            if (successful) bands[band].successful++;
        }

        // Calculate success rates
        const metrics = {};
        for (const [band, data] of Object.entries(bands)) {
            metrics[band] = {
                total: data.total,
                successful: data.successful,
                failed: data.total - data.successful,
                success_rate: data.total > 0 ? ((data.successful / data.total) * 100).toFixed(1) + '%' : 'N/A',
                avg_predicted_confidence: data.predicted.length > 0
                    ? (data.predicted.reduce((a, b) => a + b, 0) / data.predicted.length).toFixed(1)
                    : 'N/A',
                avg_actual_confidence: data.actual.length > 0
                    ? (data.actual.reduce((a, b) => a + b, 0) / data.actual.length).toFixed(1)
                    : 'N/A'
            };
        }

        return {
            total_merges: this.feedback.stats.totalMerges,
            overall_success_rate: this.feedback.stats.totalMerges > 0
                ? ((this.feedback.stats.successfulMerges / this.feedback.stats.totalMerges) * 100).toFixed(1) + '%'
                : 'N/A',
            by_confidence_band: metrics
        };
    }

    /**
     * Get pattern analysis: which factors correlate with success
     * @returns {Object} - Pattern insights
     */
    async getPatternAnalysis() {
        const patterns = {
            by_guardrails: {},
            by_conflicts: {},
            by_decision_type: {
                'APPROVE': { total: 0, successful: 0 },
                'REVIEW': { total: 0, successful: 0 },
                'BLOCK': { total: 0, successful: 0 }
            },
            by_followed_recommendation: {
                true: { total: 0, successful: 0 },
                false: { total: 0, successful: 0 }
            }
        };

        for (const merge of this.feedback.merges) {
            const successful = merge.outcome.status === 'SUCCESS';
            const decision = merge.original_decision.decision;

            // By decision type
            patterns.by_decision_type[decision].total++;
            if (successful) patterns.by_decision_type[decision].successful++;

            // By followed recommendation
            const followed = merge.execution.followed_recommendation;
            patterns.by_followed_recommendation[followed].total++;
            if (successful) patterns.by_followed_recommendation[followed].successful++;

            // By guardrails
            const guardrailTypes = merge.original_decision.guardrails_triggered;
            const guardrailKey = guardrailTypes.length === 0 ? 'NO_GUARDRAILS' : guardrailTypes.join(',');
            if (!patterns.by_guardrails[guardrailKey]) {
                patterns.by_guardrails[guardrailKey] = { total: 0, successful: 0 };
            }
            patterns.by_guardrails[guardrailKey].total++;
            if (successful) patterns.by_guardrails[guardrailKey].successful++;

            // By conflicts
            const conflictCount = merge.original_decision.conflicts_detected;
            const conflictKey = conflictCount === 0 ? 'NO_CONFLICTS' : `${conflictCount}_CONFLICTS`;
            if (!patterns.by_conflicts[conflictKey]) {
                patterns.by_conflicts[conflictKey] = { total: 0, successful: 0 };
            }
            patterns.by_conflicts[conflictKey].total++;
            if (successful) patterns.by_conflicts[conflictKey].successful++;
        }

        // Calculate success rates
        const calculateRate = (data) => {
            return data.total > 0 ? ((data.successful / data.total) * 100).toFixed(1) + '%' : 'N/A';
        };

        return {
            by_decision_type: Object.fromEntries(
                Object.entries(patterns.by_decision_type).map(([key, data]) => [
                    key,
                    { ...data, success_rate: calculateRate(data) }
                ])
            ),
            by_followed_recommendation: Object.fromEntries(
                Object.entries(patterns.by_followed_recommendation).map(([key, data]) => [
                    key,
                    { ...data, success_rate: calculateRate(data) }
                ])
            ),
            by_guardrails: Object.fromEntries(
                Object.entries(patterns.by_guardrails)
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 10) // Top 10 guardrail combinations
                    .map(([key, data]) => [
                        key,
                        { ...data, success_rate: calculateRate(data) }
                    ])
            ),
            by_conflicts: Object.fromEntries(
                Object.entries(patterns.by_conflicts).map(([key, data]) => [
                    key,
                    { ...data, success_rate: calculateRate(data) }
                ])
            )
        };
    }

    /**
     * Get recommendations for confidence score adjustments
     * @returns {Array} - Array of recommendations
     */
    async getConfidenceRecommendations() {
        const metrics = await this.getAccuracyMetrics();
        const recommendations = [];

        for (const [band, data] of Object.entries(metrics.by_confidence_band)) {
            if (data.total < 10) continue; // Skip bands with insufficient data

            const successRate = parseFloat(data.success_rate);
            const avgPredicted = parseFloat(data.avg_predicted_confidence);
            const avgActual = parseFloat(data.avg_actual_confidence);

            // Check if predicted confidence is too high
            if (successRate < 80 && avgPredicted > avgActual + 10) {
                recommendations.push({
                    band,
                    type: 'DECREASE_CONFIDENCE',
                    reason: `Success rate (${data.success_rate}) is below 80% but predicted confidence is high`,
                    suggestion: `Consider decreasing confidence scores in this band by ~${Math.round(avgPredicted - avgActual)}%`,
                    data: {
                        current_success_rate: data.success_rate,
                        avg_predicted: avgPredicted,
                        avg_actual: avgActual,
                        sample_size: data.total
                    }
                });
            }

            // Check if predicted confidence is too low
            if (successRate > 95 && avgActual > avgPredicted + 10) {
                recommendations.push({
                    band,
                    type: 'INCREASE_CONFIDENCE',
                    reason: `Success rate (${data.success_rate}) is very high but predicted confidence is conservative`,
                    suggestion: `Consider increasing confidence scores in this band by ~${Math.round(avgActual - avgPredicted)}%`,
                    data: {
                        current_success_rate: data.success_rate,
                        avg_predicted: avgPredicted,
                        avg_actual: avgActual,
                        sample_size: data.total
                    }
                });
            }

            // Check if success rate is acceptable
            if (successRate >= 80 && successRate <= 95 && Math.abs(avgPredicted - avgActual) < 10) {
                recommendations.push({
                    band,
                    type: 'CONFIDENCE_ACCURATE',
                    reason: `Success rate (${data.success_rate}) is good and confidence prediction is accurate`,
                    suggestion: 'No adjustment needed - confidence scoring is working well',
                    data: {
                        current_success_rate: data.success_rate,
                        avg_predicted: avgPredicted,
                        avg_actual: avgActual,
                        sample_size: data.total
                    }
                });
            }
        }

        return recommendations;
    }

    /**
     * Generate comprehensive feedback report
     */
    async generateReport() {
        const metrics = await this.getAccuracyMetrics();
        const patterns = await this.getPatternAnalysis();
        const recommendations = await getConfidenceRecommendations();

        return {
            summary: {
                total_merges: this.feedback.stats.totalMerges,
                successful: this.feedback.stats.successfulMerges,
                failed: this.feedback.stats.failedMerges,
                rolled_back: this.feedback.stats.rolledBackMerges,
                overall_success_rate: metrics.overall_success_rate
            },
            accuracy_by_confidence: metrics.by_confidence_band,
            pattern_analysis: patterns,
            recommendations: recommendations,
            generated_at: new Date().toISOString()
        };
    }

    /**
     * Export feedback data for analysis
     */
    exportFeedback(outputPath) {
        fs.writeFileSync(outputPath, JSON.stringify(this.feedback, null, 2));
        console.log(`Feedback data exported to: ${outputPath}`);
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || args.includes('--help')) {
        console.log(`
Merge Feedback Collector - Phase 2 Enhancement

Usage:
  node merge-feedback-collector.js metrics [--db <path>]
  node merge-feedback-collector.js patterns [--db <path>]
  node merge-feedback-collector.js recommendations [--db <path>]
  node merge-feedback-collector.js report [--db <path>]
  node merge-feedback-collector.js export <output-file> [--db <path>]

Commands:
  metrics          Display accuracy metrics by confidence band
  patterns         Display pattern analysis (guardrails, conflicts, etc.)
  recommendations  Display confidence adjustment recommendations
  report           Generate comprehensive feedback report
  export           Export feedback database to file

Options:
  --db <path>      Path to feedback database (default: merge-feedback.json)

Examples:
  node merge-feedback-collector.js metrics
  node merge-feedback-collector.js recommendations --db /data/feedback.json
  node merge-feedback-collector.js export feedback-export.json
        `);
        process.exit(0);
    }

    const getOption = (flag, defaultValue = null) => {
        const index = args.indexOf(flag);
        return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
    };

    const dbPath = getOption('--db', './merge-feedback.json');
    const collector = new MergeFeedbackCollector(dbPath);

    (async () => {
        try {
            if (command === 'metrics') {
                const metrics = await collector.getAccuracyMetrics();
                console.log('\n' + '═'.repeat(70));
                console.log('MERGE ACCURACY METRICS');
                console.log('═'.repeat(70));
                console.log(`Total Merges: ${metrics.total_merges}`);
                console.log(`Overall Success Rate: ${metrics.overall_success_rate}`);
                console.log('\nBy Confidence Band:');
                console.log('─'.repeat(70));
                for (const [band, data] of Object.entries(metrics.by_confidence_band)) {
                    console.log(`\n${band}:`);
                    console.log(`  Total: ${data.total}`);
                    console.log(`  Successful: ${data.successful}`);
                    console.log(`  Failed: ${data.failed}`);
                    console.log(`  Success Rate: ${data.success_rate}`);
                    console.log(`  Avg Predicted Confidence: ${data.avg_predicted_confidence}`);
                    console.log(`  Avg Actual Confidence: ${data.avg_actual_confidence}`);
                }
                console.log('═'.repeat(70));

            } else if (command === 'patterns') {
                const patterns = await collector.getPatternAnalysis();
                console.log('\n' + '═'.repeat(70));
                console.log('PATTERN ANALYSIS');
                console.log('═'.repeat(70));
                console.log('\nBy Decision Type:');
                console.log(JSON.stringify(patterns.by_decision_type, null, 2));
                console.log('\nBy Followed Recommendation:');
                console.log(JSON.stringify(patterns.by_followed_recommendation, null, 2));
                console.log('\nTop Guardrail Combinations:');
                console.log(JSON.stringify(patterns.by_guardrails, null, 2));
                console.log('\nBy Conflicts:');
                console.log(JSON.stringify(patterns.by_conflicts, null, 2));
                console.log('═'.repeat(70));

            } else if (command === 'recommendations') {
                const recommendations = await collector.getConfidenceRecommendations();
                console.log('\n' + '═'.repeat(70));
                console.log('CONFIDENCE ADJUSTMENT RECOMMENDATIONS');
                console.log('═'.repeat(70));
                if (recommendations.length === 0) {
                    console.log('\nNo recommendations - insufficient data or confidence scoring is accurate.');
                } else {
                    for (const rec of recommendations) {
                        console.log(`\n[${rec.type}] ${rec.band}`);
                        console.log(`Reason: ${rec.reason}`);
                        console.log(`Suggestion: ${rec.suggestion}`);
                        console.log(`Data: Success Rate=${rec.data.current_success_rate}, Sample=${rec.data.sample_size}`);
                    }
                }
                console.log('═'.repeat(70));

            } else if (command === 'report') {
                const report = await collector.generateReport();
                console.log(JSON.stringify(report, null, 2));

            } else if (command === 'export') {
                const outputFile = args[1];
                if (!outputFile) {
                    console.error('Error: Output file path required');
                    process.exit(1);
                }
                collector.exportFeedback(outputFile);

            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }

            process.exit(0);

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = MergeFeedbackCollector;
