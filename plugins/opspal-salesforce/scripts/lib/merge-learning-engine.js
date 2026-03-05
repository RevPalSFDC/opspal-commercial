#!/usr/bin/env node

/**
 * Merge Learning Engine - Phase 2 Enhancement
 *
 * Analyzes feedback from merge operations and generates confidence
 * score adjustments to improve future decision quality.
 *
 * Implementation Date: 2025-10-16
 * Part of: PHASE2_DESIGN.md - Task 2.4
 *
 * Usage:
 *   const engine = new MergeLearningEngine(feedbackDbPath);
 *   const adjustments = await engine.generateAdjustments();
 *   const newConfidence = engine.applyAdjustments(decision, adjustments);
 */

const fs = require('fs');
const path = require('path');
const MergeFeedbackCollector = require('./merge-feedback-collector');

class MergeLearningEngine {
    constructor(feedbackDbPath = './merge-feedback.json') {
        this.collector = new MergeFeedbackCollector(feedbackDbPath);
        this.adjustments = null;
    }

    /**
     * Generate confidence score adjustments based on historical data
     * @returns {Object} - Adjustment rules
     */
    async generateAdjustments() {
        const metrics = await this.collector.getAccuracyMetrics();
        const patterns = await this.collector.getPatternAnalysis();

        const adjustments = {
            version: '1.0.0',
            generated_at: new Date().toISOString(),
            sample_size: metrics.total_merges,
            rules: []
        };

        // Rule 1: Adjust by confidence band accuracy
        for (const [band, data] of Object.entries(metrics.by_confidence_band)) {
            if (data.total < 10) continue; // Insufficient data

            const successRate = parseFloat(data.success_rate);
            const avgPredicted = parseFloat(data.avg_predicted_confidence);
            const avgActual = parseFloat(data.avg_actual_confidence);

            if (isNaN(successRate) || isNaN(avgPredicted) || isNaN(avgActual)) continue;

            // Calculate adjustment factor
            let adjustment = 0;
            if (Math.abs(avgPredicted - avgActual) > 5) {
                // Predicted confidence is off by more than 5%
                adjustment = Math.round((avgActual - avgPredicted) / 2); // Apply half the difference
            }

            if (adjustment !== 0) {
                adjustments.rules.push({
                    type: 'CONFIDENCE_BAND_ADJUSTMENT',
                    condition: {
                        confidence_range: this.parseBand(band)
                    },
                    adjustment: adjustment,
                    reason: `Historical success rate: ${data.success_rate} (${data.total} merges)`,
                    confidence_level: 'MEDIUM'
                });
            }
        }

        // Rule 2: Adjust based on guardrail patterns
        for (const [guardrailKey, data] of Object.entries(patterns.by_guardrails)) {
            if (data.total < 5) continue; // Insufficient data

            const successRate = parseFloat(data.success_rate);
            if (isNaN(successRate)) continue;

            let adjustment = 0;
            if (successRate >= 95) {
                adjustment = +5; // Very high success rate
            } else if (successRate < 70) {
                adjustment = -10; // Low success rate
            }

            if (adjustment !== 0) {
                adjustments.rules.push({
                    type: 'GUARDRAIL_PATTERN_ADJUSTMENT',
                    condition: {
                        guardrails: guardrailKey === 'NO_GUARDRAILS' ? [] : guardrailKey.split(',')
                    },
                    adjustment: adjustment,
                    reason: `Guardrails '${guardrailKey}' have ${data.success_rate} success rate (${data.total} merges)`,
                    confidence_level: 'LOW'
                });
            }
        }

        // Rule 3: Adjust based on conflict patterns
        for (const [conflictKey, data] of Object.entries(patterns.by_conflicts)) {
            if (data.total < 5) continue;

            const successRate = parseFloat(data.success_rate);
            if (isNaN(successRate)) continue;

            let adjustment = 0;
            if (conflictKey === 'NO_CONFLICTS' && successRate >= 95) {
                adjustment = +3;
            } else if (conflictKey !== 'NO_CONFLICTS' && successRate < 75) {
                adjustment = -5;
            }

            if (adjustment !== 0) {
                adjustments.rules.push({
                    type: 'CONFLICT_PATTERN_ADJUSTMENT',
                    condition: {
                        conflicts: conflictKey === 'NO_CONFLICTS' ? 0 : parseInt(conflictKey)
                    },
                    adjustment: adjustment,
                    reason: `${conflictKey} have ${data.success_rate} success rate (${data.total} merges)`,
                    confidence_level: 'LOW'
                });
            }
        }

        // Rule 4: Penalize not following recommendations
        const followedData = patterns.by_followed_recommendation;
        if (followedData.true.total >= 10 && followedData.false.total >= 10) {
            const followedRate = parseFloat(followedData.true.success_rate);
            const notFollowedRate = parseFloat(followedData.false.success_rate);

            if (!isNaN(followedRate) && !isNaN(notFollowedRate) && followedRate > notFollowedRate + 10) {
                adjustments.rules.push({
                    type: 'RECOMMENDATION_ADHERENCE_ADJUSTMENT',
                    condition: {
                        followed_recommendation: false
                    },
                    adjustment: -10,
                    reason: `Not following recommendations has ${notFollowedRate}% success vs ${followedRate}% when followed`,
                    confidence_level: 'MEDIUM'
                });
            }
        }

        this.adjustments = adjustments;
        return adjustments;
    }

    /**
     * Parse confidence band string to range
     */
    parseBand(band) {
        const match = band.match(/(\d+)-(\d+)%/);
        if (match) {
            return {
                min: parseInt(match[1]),
                max: parseInt(match[2])
            };
        }
        return null;
    }

    /**
     * Apply adjustments to a decision
     * @param {Object} decision - Decision from dedup-safety-engine
     * @param {Object} adjustments - Adjustment rules (optional, uses cached if not provided)
     * @returns {Number} - Adjusted confidence score
     */
    applyAdjustments(decision, adjustments = null) {
        const rules = adjustments || this.adjustments;
        if (!rules || !rules.rules) {
            return decision.confidence || 50;
        }

        let baseConfidence = decision.confidence || 50;
        let totalAdjustment = 0;
        const appliedRules = [];

        for (const rule of rules.rules) {
            if (this.matchesCondition(decision, rule.condition)) {
                totalAdjustment += rule.adjustment;
                appliedRules.push({
                    type: rule.type,
                    adjustment: rule.adjustment,
                    reason: rule.reason
                });
            }
        }

        // Apply adjustments with bounds checking
        const adjustedConfidence = Math.max(0, Math.min(100, baseConfidence + totalAdjustment));

        return {
            original_confidence: baseConfidence,
            adjusted_confidence: Math.round(adjustedConfidence),
            total_adjustment: totalAdjustment,
            applied_rules: appliedRules
        };
    }

    /**
     * Check if decision matches rule condition
     */
    matchesCondition(decision, condition) {
        // Check confidence range
        if (condition.confidence_range) {
            const confidence = decision.confidence || 50;
            if (confidence < condition.confidence_range.min || confidence > condition.confidence_range.max) {
                return false;
            }
        }

        // Check guardrails
        if (condition.guardrails !== undefined) {
            const decisionGuardrails = decision.guardrails_triggered
                ? decision.guardrails_triggered.map(g => g.type)
                : [];

            if (condition.guardrails.length === 0 && decisionGuardrails.length !== 0) {
                return false;
            }

            if (condition.guardrails.length > 0) {
                const hasAllGuardrails = condition.guardrails.every(g =>
                    decisionGuardrails.includes(g)
                );
                if (!hasAllGuardrails) return false;
            }
        }

        // Check conflicts
        if (condition.conflicts !== undefined) {
            const conflictCount = decision.conflicts ? decision.conflicts.conflictCount : 0;
            if (conflictCount !== condition.conflicts) {
                return false;
            }
        }

        // Check followed recommendation
        if (condition.followed_recommendation !== undefined) {
            // This check would require execution data, which we don't have at decision time
            // Skip this check for pre-merge adjustment
            return false;
        }

        return true;
    }

    /**
     * Save adjustments to file
     */
    saveAdjustments(outputPath) {
        if (!this.adjustments) {
            throw new Error('No adjustments generated. Call generateAdjustments() first.');
        }

        fs.writeFileSync(outputPath, JSON.stringify(this.adjustments, null, 2));
        console.log(`Adjustments saved to: ${outputPath}`);
    }

    /**
     * Load adjustments from file
     */
    loadAdjustments(inputPath) {
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Adjustments file not found: ${inputPath}`);
        }

        this.adjustments = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        console.log(`Loaded adjustments: ${this.adjustments.rules.length} rules`);
        return this.adjustments;
    }

    /**
     * Generate learning report
     */
    async generateLearningReport() {
        const adjustments = await this.generateAdjustments();
        const recommendations = await this.collector.getConfidenceRecommendations();

        return {
            summary: {
                total_rules: adjustments.rules.length,
                sample_size: adjustments.sample_size,
                generated_at: adjustments.generated_at
            },
            adjustment_rules: adjustments.rules,
            recommendations: recommendations,
            example_applications: this.generateExampleApplications(adjustments)
        };
    }

    /**
     * Generate example applications of adjustment rules
     */
    generateExampleApplications(adjustments) {
        const examples = [];

        // Example 1: High confidence, no guardrails
        const example1 = {
            scenario: 'High confidence (92%), no guardrails',
            decision: {
                confidence: 92,
                guardrails_triggered: [],
                conflicts: { conflictCount: 0 }
            }
        };
        const result1 = this.applyAdjustments(example1.decision, adjustments);
        examples.push({
            ...example1,
            result: result1
        });

        // Example 2: Medium confidence, with guardrails
        const example2 = {
            scenario: 'Medium confidence (68%), domain mismatch guardrail',
            decision: {
                confidence: 68,
                guardrails_triggered: [{ type: 'TYPE_1_DOMAIN_MISMATCH' }],
                conflicts: { conflictCount: 0 }
            }
        };
        const result2 = this.applyAdjustments(example2.decision, adjustments);
        examples.push({
            ...example2,
            result: result2
        });

        // Example 3: Low confidence, conflicts detected
        const example3 = {
            scenario: 'Low confidence (45%), 2 conflicts detected',
            decision: {
                confidence: 45,
                guardrails_triggered: [],
                conflicts: { conflictCount: 2 }
            }
        };
        const result3 = this.applyAdjustments(example3.decision, adjustments);
        examples.push({
            ...example3,
            result: result3
        });

        return examples;
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || args.includes('--help')) {
        console.log(`
Merge Learning Engine - Phase 2 Enhancement

Usage:
  node merge-learning-engine.js generate [--db <path>] [--output <file>]
  node merge-learning-engine.js apply <decision-file> [--adjustments <file>]
  node merge-learning-engine.js report [--db <path>]

Commands:
  generate    Generate adjustment rules from feedback data
  apply       Apply adjustments to a decision file
  report      Generate comprehensive learning report

Options:
  --db <path>            Path to feedback database (default: merge-feedback.json)
  --output <file>        Output file for adjustments (default: confidence-adjustments.json)
  --adjustments <file>   Path to adjustments file

Examples:
  node merge-learning-engine.js generate
  node merge-learning-engine.js generate --output /config/adjustments.json
  node merge-learning-engine.js apply decisions.json --adjustments adjustments.json
  node merge-learning-engine.js report --db /data/feedback.json
        `);
        process.exit(0);
    }

    const getOption = (flag, defaultValue = null) => {
        const index = args.indexOf(flag);
        return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
    };

    const dbPath = getOption('--db', './merge-feedback.json');
    const engine = new MergeLearningEngine(dbPath);

    (async () => {
        try {
            if (command === 'generate') {
                const outputFile = getOption('--output', 'confidence-adjustments.json');

                console.log('Generating confidence adjustments from feedback data...');
                const adjustments = await engine.generateAdjustments();

                console.log(`\nGenerated ${adjustments.rules.length} adjustment rules from ${adjustments.sample_size} merges\n`);

                for (const rule of adjustments.rules) {
                    console.log(`[${rule.type}]`);
                    console.log(`  Adjustment: ${rule.adjustment > 0 ? '+' : ''}${rule.adjustment}%`);
                    console.log(`  Reason: ${rule.reason}`);
                    console.log(`  Confidence: ${rule.confidence_level}\n`);
                }

                engine.saveAdjustments(outputFile);
                console.log(`✅ Adjustments saved to: ${outputFile}`);

            } else if (command === 'apply') {
                const decisionFile = args[1];
                const adjustmentsFile = getOption('--adjustments', 'confidence-adjustments.json');

                if (!decisionFile || !fs.existsSync(decisionFile)) {
                    console.error('Error: Decision file not found');
                    process.exit(1);
                }

                // Load adjustments
                const adjustments = engine.loadAdjustments(adjustmentsFile);

                // Load decisions
                const decisions = JSON.parse(fs.readFileSync(decisionFile, 'utf8'));

                console.log(`Applying adjustments to ${decisions.length} decisions...\n`);

                let adjustedCount = 0;
                for (const decision of decisions) {
                    const result = engine.applyAdjustments(decision, adjustments);
                    if (result.total_adjustment !== 0) {
                        console.log(`Decision ${decision.pair_id}:`);
                        console.log(`  Original: ${result.original_confidence}%`);
                        console.log(`  Adjusted: ${result.adjusted_confidence}%`);
                        console.log(`  Change: ${result.total_adjustment > 0 ? '+' : ''}${result.total_adjustment}%`);
                        console.log(`  Rules applied: ${result.applied_rules.length}\n`);
                        adjustedCount++;

                        // Update decision with adjusted confidence
                        decision.adjusted_confidence = result.adjusted_confidence;
                        decision.confidence_adjustment_details = result;
                    }
                }

                console.log(`\n✅ Applied adjustments to ${adjustedCount}/${decisions.length} decisions`);

                // Save updated decisions
                const outputFile = decisionFile.replace('.json', '-adjusted.json');
                fs.writeFileSync(outputFile, JSON.stringify(decisions, null, 2));
                console.log(`Updated decisions saved to: ${outputFile}`);

            } else if (command === 'report') {
                console.log('Generating learning report...\n');
                const report = await engine.generateLearningReport();

                console.log('═'.repeat(70));
                console.log('MERGE LEARNING REPORT');
                console.log('═'.repeat(70));
                console.log(`Total Rules Generated: ${report.summary.total_rules}`);
                console.log(`Sample Size: ${report.summary.sample_size} merges`);
                console.log(`Generated: ${report.summary.generated_at}`);

                console.log('\n' + '─'.repeat(70));
                console.log('ADJUSTMENT RULES');
                console.log('─'.repeat(70));
                for (const rule of report.adjustment_rules) {
                    console.log(`\n[${rule.type}]`);
                    console.log(`  Adjustment: ${rule.adjustment > 0 ? '+' : ''}${rule.adjustment}%`);
                    console.log(`  Reason: ${rule.reason}`);
                    console.log(`  Confidence: ${rule.confidence_level}`);
                }

                console.log('\n' + '─'.repeat(70));
                console.log('RECOMMENDATIONS');
                console.log('─'.repeat(70));
                for (const rec of report.recommendations) {
                    console.log(`\n[${rec.type}] ${rec.band}`);
                    console.log(`  ${rec.suggestion}`);
                }

                console.log('\n' + '─'.repeat(70));
                console.log('EXAMPLE APPLICATIONS');
                console.log('─'.repeat(70));
                for (const example of report.example_applications) {
                    console.log(`\n${example.scenario}:`);
                    console.log(`  Original Confidence: ${example.result.original_confidence}%`);
                    console.log(`  Adjusted Confidence: ${example.result.adjusted_confidence}%`);
                    console.log(`  Total Adjustment: ${example.result.total_adjustment > 0 ? '+' : ''}${example.result.total_adjustment}%`);
                    console.log(`  Rules Applied: ${example.result.applied_rules.length}`);
                }

                console.log('\n' + '═'.repeat(70));

                // Save full report
                const reportFile = 'learning-report.json';
                fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
                console.log(`\n✅ Full report saved to: ${reportFile}`);

            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }

            process.exit(0);

        } catch (error) {
            console.error('Error:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    })();
}

module.exports = MergeLearningEngine;
