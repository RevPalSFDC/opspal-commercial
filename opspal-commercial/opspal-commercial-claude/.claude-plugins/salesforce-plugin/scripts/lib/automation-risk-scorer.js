#!/usr/bin/env node

/**
 * Automation Risk Scorer
 *
 * Purpose: Calculate 0-100 risk score for each automation based on multiple factors.
 *
 * Scoring Factors:
 * - Active status (+30 base, +10 for scheduled)
 * - Critical field writes (+20 each, max 40)
 * - High fan-out/complexity (+15)
 * - Detected conflicts (+20 each, max 40)
 * - Governor limit risks (+10)
 * - Undefined execution order (+5)
 *
 * Usage:
 *   const scorer = new AutomationRiskScorer();
 *   const score = scorer.calculateRiskScore(automation, conflicts);
 *   const hotspots = scorer.identifyHotspots(automations);
 */

class AutomationRiskScorer {
    constructor() {
        this.criticalFields = [
            'OwnerId',
            'Amount',
            'StageName',
            'Status',
            'RecordTypeId',
            'CloseDate',
            'Type',
            'Priority',
            'AccountId',
            'ContactId'
        ];
    }

    /**
     * Calculate risk score for single automation (0-100)
     */
    calculateRiskScore(automation, conflicts = []) {
        let score = 0;

        // Factor 1: Active status
        if (automation.status === 'Active') {
            score += 30;
        }

        // Additional points for scheduled/async
        const hasScheduled = (automation.riskSignals || []).some(s =>
            s.code?.includes('TIME_BASED') || s.code?.includes('SCHEDULED')
        );
        if (hasScheduled) {
            score += 10;
        }

        // Factor 2: Critical field writes
        const criticalWrites = (automation.writes || []).filter(write =>
            this.criticalFields.some(cf => write.includes(cf))
        );
        score += Math.min(criticalWrites.length * 20, 40);

        // Factor 3: High fan-out (many invocations)
        if ((automation.invokes || []).length > 5) {
            score += 15;
        }

        // Factor 4: Detected conflicts
        const automationConflicts = conflicts.filter(c =>
            (c.involved || []).some(inv => inv.id === automation.id)
        );
        score += Math.min(automationConflicts.length * 20, 40);

        // Factor 5: Governor limit risks
        const governorRisks = (automation.riskSignals || []).filter(s =>
            s.code?.includes('DML') ||
            s.code?.includes('SOQL') ||
            s.code?.includes('GOVERNOR') ||
            s.code?.includes('LOOP')
        );
        if (governorRisks.length > 0) {
            score += 10;
        }

        // Factor 6: Undefined execution order
        if (automation.type === 'Flow' && !automation.triggerOrder) {
            score += 5;
        }

        // Factor 7: Re-evaluation risk
        if (automation.recursionSettings?.includes('Re-evaluates')) {
            score += 10;
        }

        // Factor 8: Complexity indicators
        const complexityScore = this.calculateComplexityScore(automation);
        score += complexityScore;

        return Math.min(score, 100);
    }

    /**
     * Calculate complexity score (0-10)
     */
    calculateComplexityScore(automation) {
        let complexity = 0;

        // Many field accesses
        const totalFields = (automation.reads || []).length + (automation.writes || []).length;
        if (totalFields > 20) complexity += 3;
        else if (totalFields > 10) complexity += 2;
        else if (totalFields > 5) complexity += 1;

        // Multiple DML operations
        const dmlCount = (automation.dml || []).length;
        if (dmlCount > 5) complexity += 3;
        else if (dmlCount > 3) complexity += 2;
        else if (dmlCount > 1) complexity += 1;

        // Multiple SOQL queries
        const soqlCount = (automation.soql || []).length;
        if (soqlCount > 5) complexity += 2;
        else if (soqlCount > 2) complexity += 1;

        // Multiple objects
        const objectCount = (automation.objectTargets || []).length;
        if (objectCount > 3) complexity += 2;
        else if (objectCount > 1) complexity += 1;

        return Math.min(complexity, 10);
    }

    /**
     * Calculate risk level from score
     */
    getRiskLevel(score) {
        if (score >= 80) return 'CRITICAL';
        if (score >= 60) return 'HIGH';
        if (score >= 40) return 'MEDIUM';
        if (score >= 20) return 'LOW';
        return 'MINIMAL';
    }

    /**
     * Get risk color for visualization
     */
    getRiskColor(score) {
        if (score >= 80) return 'red';
        if (score >= 60) return 'orange';
        if (score >= 40) return 'yellow';
        if (score >= 20) return 'lightgreen';
        return 'green';
    }

    /**
     * Identify hotspot objects (most automation with highest total risk)
     */
    identifyHotspots(automations, limit = 10) {
        const objectScores = new Map();

        for (const automation of automations) {
            const score = automation.riskScore || this.calculateRiskScore(automation);

            for (const target of (automation.objectTargets || [])) {
                const obj = target.objectApiName;

                if (!objectScores.has(obj)) {
                    objectScores.set(obj, {
                        object: obj,
                        automationCount: 0,
                        totalRiskScore: 0,
                        averageRiskScore: 0,
                        automations: []
                    });
                }

                const objScore = objectScores.get(obj);
                objScore.automationCount++;
                objScore.totalRiskScore += score;
                objScore.automations.push({
                    id: automation.id,
                    name: automation.name,
                    type: automation.type,
                    riskScore: score
                });
            }
        }

        // Calculate averages
        for (const objScore of objectScores.values()) {
            objScore.averageRiskScore = Math.round(
                objScore.totalRiskScore / objScore.automationCount
            );

            // Sort automations by risk score
            objScore.automations.sort((a, b) => b.riskScore - a.riskScore);
        }

        // Return top hotspots
        return Array.from(objectScores.values())
            .sort((a, b) => b.totalRiskScore - a.totalRiskScore)
            .slice(0, limit);
    }

    /**
     * Generate risk distribution summary
     */
    getRiskDistribution(automations) {
        const distribution = {
            CRITICAL: [],
            HIGH: [],
            MEDIUM: [],
            LOW: [],
            MINIMAL: []
        };

        for (const automation of automations) {
            const score = automation.riskScore || this.calculateRiskScore(automation);
            const level = this.getRiskLevel(score);
            distribution[level].push({
                id: automation.id,
                name: automation.name,
                type: automation.type,
                score: score
            });
        }

        return {
            distribution: distribution,
            counts: {
                CRITICAL: distribution.CRITICAL.length,
                HIGH: distribution.HIGH.length,
                MEDIUM: distribution.MEDIUM.length,
                LOW: distribution.LOW.length,
                MINIMAL: distribution.MINIMAL.length
            },
            total: automations.length
        };
    }

    /**
     * Get risk factors breakdown for automation
     */
    getRiskFactors(automation, conflicts = []) {
        const factors = [];

        // Active status
        if (automation.status === 'Active') {
            factors.push({
                factor: 'Active Status',
                score: 30,
                description: 'Automation is active and executing'
            });
        }

        // Critical field writes
        const criticalWrites = (automation.writes || []).filter(write =>
            this.criticalFields.some(cf => write.includes(cf))
        );
        if (criticalWrites.length > 0) {
            factors.push({
                factor: 'Critical Field Writes',
                score: Math.min(criticalWrites.length * 20, 40),
                description: `Writes to ${criticalWrites.length} critical field(s): ${criticalWrites.slice(0, 3).join(', ')}`
            });
        }

        // Fan-out
        if ((automation.invokes || []).length > 5) {
            factors.push({
                factor: 'High Fan-Out',
                score: 15,
                description: `Invokes ${automation.invokes.length} other components`
            });
        }

        // Conflicts
        const automationConflicts = conflicts.filter(c =>
            (c.involved || []).some(inv => inv.id === automation.id)
        );
        if (automationConflicts.length > 0) {
            factors.push({
                factor: 'Detected Conflicts',
                score: Math.min(automationConflicts.length * 20, 40),
                description: `Involved in ${automationConflicts.length} conflict(s)`
            });
        }

        // Governor risks
        const governorRisks = (automation.riskSignals || []).filter(s =>
            s.code?.includes('DML') ||
            s.code?.includes('SOQL') ||
            s.code?.includes('GOVERNOR')
        );
        if (governorRisks.length > 0) {
            factors.push({
                factor: 'Governor Limit Risks',
                score: 10,
                description: governorRisks.map(r => r.code).join(', ')
            });
        }

        // Undefined order
        if (automation.type === 'Flow' && !automation.triggerOrder) {
            factors.push({
                factor: 'Undefined Execution Order',
                score: 5,
                description: 'Flow lacks trigger order metadata'
            });
        }

        // Re-evaluation
        if (automation.recursionSettings?.includes('Re-evaluates')) {
            factors.push({
                factor: 'Re-Evaluation Enabled',
                score: 10,
                description: 'Can re-trigger on record changes'
            });
        }

        return factors;
    }

    /**
     * Calculate trend (if historical scores available)
     */
    calculateTrend(currentScore, historicalScores = []) {
        if (historicalScores.length === 0) {
            return { trend: 'NEW', change: 0 };
        }

        const previousScore = historicalScores[historicalScores.length - 1];
        const change = currentScore - previousScore;

        let trend = 'STABLE';
        if (change > 10) trend = 'INCREASING';
        else if (change < -10) trend = 'DECREASING';

        return {
            trend: trend,
            change: change,
            previousScore: previousScore,
            currentScore: currentScore
        };
    }
}

module.exports = AutomationRiskScorer;

// CLI Interface
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Automation Risk Scorer
======================

Usage:
  node automation-risk-scorer.js <udm-file.json> [options]

Options:
  --hotspots <n>      Show top N hotspot objects (default: 10)
  --distribution      Show risk distribution
  --output <file>     Write scores to file

Examples:
  node automation-risk-scorer.js automations.json --hotspots 10
  node automation-risk-scorer.js automations.json --distribution
  node automation-risk-scorer.js automations.json --output scores.json
        `);
        process.exit(1);
    }

    try {
        const inputFile = args[0];
        const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

        const automations = data.automations || data;
        const conflicts = data.conflicts || [];

        const scorer = new AutomationRiskScorer();

        // Calculate scores
        console.log('Calculating risk scores...');
        for (const automation of automations) {
            automation.riskScore = scorer.calculateRiskScore(automation, conflicts);
            automation.riskLevel = scorer.getRiskLevel(automation.riskScore);
        }

        // Show hotspots
        if (args.includes('--hotspots')) {
            const limit = parseInt(args[args.indexOf('--hotspots') + 1] || 10);
            const hotspots = scorer.identifyHotspots(automations, limit);

            console.log(`\nTop ${limit} Hotspot Objects:`);
            for (const [i, hotspot] of hotspots.entries()) {
                console.log(`\n${i + 1}. ${hotspot.object}`);
                console.log(`   Automation Count: ${hotspot.automationCount}`);
                console.log(`   Total Risk Score: ${hotspot.totalRiskScore}`);
                console.log(`   Average Risk: ${hotspot.averageRiskScore}`);
                console.log(`   Top Automations:`);
                for (const auto of hotspot.automations.slice(0, 3)) {
                    console.log(`     - ${auto.name} (${auto.type}): ${auto.riskScore}`);
                }
            }
        }

        // Show distribution
        if (args.includes('--distribution')) {
            const dist = scorer.getRiskDistribution(automations);

            console.log('\nRisk Distribution:');
            console.log(`  CRITICAL: ${dist.counts.CRITICAL} (${Math.round(dist.counts.CRITICAL / dist.total * 100)}%)`);
            console.log(`  HIGH: ${dist.counts.HIGH} (${Math.round(dist.counts.HIGH / dist.total * 100)}%)`);
            console.log(`  MEDIUM: ${dist.counts.MEDIUM} (${Math.round(dist.counts.MEDIUM / dist.total * 100)}%)`);
            console.log(`  LOW: ${dist.counts.LOW} (${Math.round(dist.counts.LOW / dist.total * 100)}%)`);
            console.log(`  MINIMAL: ${dist.counts.MINIMAL} (${Math.round(dist.counts.MINIMAL / dist.total * 100)}%)`);
        }

        // Output
        if (args.includes('--output')) {
            const outputFile = args[args.indexOf('--output') + 1];
            const output = {
                automations: automations,
                hotspots: scorer.identifyHotspots(automations),
                distribution: scorer.getRiskDistribution(automations)
            };
            fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
            console.log(`\n✓ Scores written to: ${outputFile}`);
        }

        // Summary
        console.log(`\n✓ Scored ${automations.length} automation(s)`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}
