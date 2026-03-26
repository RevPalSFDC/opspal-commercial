#!/usr/bin/env node

/**
 * Routing Learner - Self-Improving Routing System with ACE Framework Integration
 *
 * Analyzes routing metrics to identify patterns, suggest improvements,
 * and automatically adapt routing decisions over time.
 *
 * ACE Framework Enhancement (v2.0.0):
 * - Skill-aware routing based on skill registry success rates
 * - Cross-agent skill transfer recommendations
 * - Skill confidence integration for routing decisions
 *
 * @version 2.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolveHistoricalRoutingLogSemantics } = require('./routing-semantics');

function getRoutingOutput(entry = {}) {
    return entry.output || entry;
}

function isExecutionGatedRoute(entry = {}) {
    return resolveHistoricalRoutingLogSemantics(entry).executionBlockUntilCleared;
}

function getRoutedAgent(entry = {}) {
    return resolveHistoricalRoutingLogSemantics(entry).routedAgent;
}

class RoutingLearner {
    constructor(options = {}) {
        this.metricsFile = options.metricsFile || path.join('/tmp', 'routing-metrics.jsonl');
        this.learningFile = options.learningFile || path.join('/tmp', 'routing-learning.json');
        this.verbose = options.verbose || false;

        // Learning parameters
        this.minSampleSize = 10; // Minimum samples before making recommendations
        this.confidenceThreshold = 0.7;
        this.failureThreshold = 0.3; // 30% failure rate triggers investigation

        // ACE Framework: Strategy registry configuration
        this.skillRegistryPath = options.skillRegistryPath ||
            path.join(__dirname, 'strategy-registry.js');
        this.skillMinSuccessRate = 0.8; // Minimum skill success rate for routing boost
        this.skillTransferThreshold = 0.9; // Success rate threshold for transfer candidates

        // Load existing learning data
        this.loadLearningData();

        // Load skill data if available
        this.loadSkillData();
    }

    /**
     * Load existing learning data
     */
    loadLearningData() {
        if (fs.existsSync(this.learningFile)) {
            try {
                this.learningData = JSON.parse(fs.readFileSync(this.learningFile, 'utf-8'));
                this.log(`Loaded learning data: ${this.learningData.insights.length} insights`);
            } catch (error) {
                this.log(`Failed to load learning data: ${error.message}`);
                this.learningData = this.initializeLearningData();
            }
        } else {
            this.learningData = this.initializeLearningData();
        }
    }

    /**
     * Initialize empty learning data structure
     */
    initializeLearningData() {
        return {
            version: '2.0.0',
            lastUpdated: new Date().toISOString(),
            insights: [],
            recommendations: [],
            thresholds: {
                routing_confidence: 0.7,
                complexity: 0.7,
                skill_boost_threshold: 0.8 // ACE: Boost routing for agents with high-performing skills
            },
            agentPerformance: {},
            keywordEffectiveness: {},
            // ACE Framework: Skill tracking
            skillPerformance: {},
            agentSkillPortfolios: {},
            skillTransferCandidates: []
        };
    }

    /**
     * ACE Framework: Load skill data from skill registry
     */
    loadSkillData() {
        this.skillData = {
            skills: [],
            agentSkills: {},
            highPerformers: [],
            needsRefinement: []
        };

        // Try to load skill data from registry
        if (fs.existsSync(this.skillRegistryPath)) {
            try {
                // Use skill-registry.js CLI to get skill data
                const skillsJson = execSync(
                    `node "${this.skillRegistryPath}" list --format json 2>/dev/null`,
                    { encoding: 'utf-8', timeout: 5000 }
                ).trim();

                if (skillsJson) {
                    const parsed = JSON.parse(skillsJson);
                    this.skillData.skills = parsed.skills || [];
                    this.log(`Loaded ${this.skillData.skills.length} skills from registry`);
                }

                // Get high performers
                const highPerformersJson = execSync(
                    `node "${this.skillRegistryPath}" high-performers --format json 2>/dev/null`,
                    { encoding: 'utf-8', timeout: 5000 }
                ).trim();

                if (highPerformersJson) {
                    const parsed = JSON.parse(highPerformersJson);
                    this.skillData.highPerformers = parsed.skills || [];
                }

                // Get skills needing refinement
                const needsRefinementJson = execSync(
                    `node "${this.skillRegistryPath}" needs-refinement --format json 2>/dev/null`,
                    { encoding: 'utf-8', timeout: 5000 }
                ).trim();

                if (needsRefinementJson) {
                    const parsed = JSON.parse(needsRefinementJson);
                    this.skillData.needsRefinement = parsed.skills || [];
                }

                // Build agent-to-skills mapping
                for (const skill of this.skillData.skills) {
                    const agent = skill.source_agent;
                    if (!this.skillData.agentSkills[agent]) {
                        this.skillData.agentSkills[agent] = [];
                    }
                    this.skillData.agentSkills[agent].push({
                        skill_id: skill.skill_id,
                        success_rate: skill.success_rate,
                        confidence: skill.confidence,
                        usage_count: skill.usage_count
                    });
                }

            } catch (error) {
                this.log(`Warning: Could not load skill data: ${error.message}`);
            }
        } else {
            this.log('Skill registry not found - skill-aware routing disabled');
        }
    }

    /**
     * Read metrics from JSONL file
     */
    readMetrics() {
        if (!fs.existsSync(this.metricsFile)) {
            this.log('No metrics file found');
            return [];
        }

        const lines = fs.readFileSync(this.metricsFile, 'utf-8')
            .split('\n')
            .filter(line => line.trim());

        const metrics = lines
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            })
            .filter(m => m !== null);

        return metrics;
    }

    /**
     * Analyze routing patterns and generate insights
     */
    analyze() {
        const metrics = this.readMetrics();

        if (metrics.length < this.minSampleSize) {
            return {
                status: 'insufficient_data',
                message: `Need at least ${this.minSampleSize} metrics, have ${metrics.length}`,
                insights: []
            };
        }

        this.log(`Analyzing ${metrics.length} metrics...`);

        const insights = [];

        // Analyze agent performance
        insights.push(...this.analyzeAgentPerformance(metrics));

        // Analyze routing accuracy
        insights.push(...this.analyzeRoutingAccuracy(metrics));

        // Analyze threshold effectiveness
        insights.push(...this.analyzeThresholds(metrics));

        // Detect routing patterns
        insights.push(...this.detectPatterns(metrics));

        // ACE Framework: Analyze skill performance
        insights.push(...this.analyzeSkillPerformance());

        // ACE Framework: Recommend skill transfers
        insights.push(...this.analyzeSkillTransferOpportunities());

        // Generate recommendations
        const recommendations = this.generateRecommendations(insights);

        // Update learning data
        this.learningData.insights = insights;
        this.learningData.recommendations = recommendations;
        this.learningData.lastUpdated = new Date().toISOString();

        this.saveLearningData();

        return {
            status: 'success',
            totalMetrics: metrics.length,
            insights,
            recommendations,
            summary: this.generateSummary(insights, recommendations)
        };
    }

    /**
     * Analyze agent performance from execution metrics
     */
    analyzeAgentPerformance(metrics) {
        const insights = [];
        const executions = metrics.filter(m => m.type === 'agent_execution');

        if (executions.length === 0) {
            return insights;
        }

        // Group by agent
        const byAgent = {};
        for (const exec of executions) {
            if (!byAgent[exec.agent]) {
                byAgent[exec.agent] = {
                    total: 0,
                    successes: 0,
                    failures: 0,
                    durations: []
                };
            }

            byAgent[exec.agent].total++;
            if (exec.success) {
                byAgent[exec.agent].successes++;
            } else {
                byAgent[exec.agent].failures++;
            }
            if (exec.duration) {
                byAgent[exec.agent].durations.push(exec.duration);
            }
        }

        // Analyze each agent
        for (const [agent, stats] of Object.entries(byAgent)) {
            const successRate = stats.successes / stats.total;
            const failureRate = stats.failures / stats.total;

            // Update agent performance in learning data
            this.learningData.agentPerformance[agent] = {
                successRate,
                failureRate,
                totalExecutions: stats.total,
                avgDuration: stats.durations.length > 0 ?
                    stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length : 0
            };

            // High failure rate
            if (failureRate >= this.failureThreshold && stats.total >= this.minSampleSize) {
                insights.push({
                    type: 'agent_performance',
                    severity: 'high',
                    agent,
                    message: `Agent ${agent} has high failure rate: ${(failureRate * 100).toFixed(1)}%`,
                    data: {
                        successRate,
                        failureRate,
                        totalExecutions: stats.total
                    },
                    recommendation: `Review ${agent} capabilities or routing conditions`
                });
            }

            // Excellent performance
            if (successRate >= 0.95 && stats.total >= this.minSampleSize) {
                insights.push({
                    type: 'agent_performance',
                    severity: 'info',
                    agent,
                    message: `Agent ${agent} has excellent success rate: ${(successRate * 100).toFixed(1)}%`,
                    data: {
                        successRate,
                        totalExecutions: stats.total
                    },
                    recommendation: `Consider routing more tasks to ${agent}`
                });
            }
        }

        return insights;
    }

    /**
     * Analyze routing accuracy
     */
    analyzeRoutingAccuracy(metrics) {
        const insights = [];
        const routings = metrics.filter(m => m.type === 'routing_decision');

        if (routings.length === 0) {
            return insights;
        }

        // Auto-routing rate
        const autoRouted = routings.filter(r => r.autoRouted).length;
        const autoRoutingRate = autoRouted / routings.length;

        if (autoRoutingRate < 0.5) {
            insights.push({
                type: 'routing_accuracy',
                severity: 'medium',
                message: `Low auto-routing rate: ${(autoRoutingRate * 100).toFixed(1)}%`,
                data: {
                    autoRouted,
                    total: routings.length,
                    autoRoutingRate
                },
                recommendation: 'Review routing thresholds - may be too conservative'
            });
        }

        // User overrides
        const overridden = routings.filter(r => r.userOverride).length;
        const overrideRate = overridden / routings.length;

        if (overrideRate > 0.2) {
            insights.push({
                type: 'routing_accuracy',
                severity: 'high',
                message: `High user override rate: ${(overrideRate * 100).toFixed(1)}%`,
                data: {
                    overridden,
                    total: routings.length,
                    overrideRate
                },
                recommendation: 'Routing recommendations may not match user expectations'
            });
        }

        // Execution-time gated routes
        const executionGated = routings.filter(isExecutionGatedRoute).length;
        const executionGateRate = executionGated / routings.length;

        insights.push({
            type: 'routing_accuracy',
            severity: 'info',
            message: `Execution-gated routes: ${executionGated} (${(executionGateRate * 100).toFixed(1)}%)`,
            data: {
                executionGated,
                total: routings.length,
                executionGateRate
            },
            recommendation: executionGateRate > 0.1 ?
                'Consider reviewing execution-time specialist rules - they may be too broad' :
                'Execution-time specialist rules are working well'
        });

        return insights;
    }

    /**
     * Analyze threshold effectiveness
     */
    analyzeThresholds(metrics) {
        const insights = [];
        const routings = metrics.filter(m => m.type === 'routing_decision');

        if (routings.length === 0) {
            return insights;
        }

        // Analyze confidence distribution
        const confidences = routings
            .filter(r => r.confidence)
            .map(r => r.confidence);

        if (confidences.length > 0) {
            const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
            const lowConfidence = confidences.filter(c => c < 0.5).length;
            const lowConfidenceRate = lowConfidence / confidences.length;

            if (lowConfidenceRate > 0.4) {
                insights.push({
                    type: 'threshold_analysis',
                    severity: 'medium',
                    message: `High proportion of low-confidence routings: ${(lowConfidenceRate * 100).toFixed(1)}%`,
                    data: {
                        avgConfidence,
                        lowConfidence,
                        total: confidences.length
                    },
                    recommendation: 'Consider improving keyword matching or agent descriptions'
                });
            }

            // Recommend threshold adjustment
            if (avgConfidence < 0.6) {
                const suggestedThreshold = Math.max(0.5, avgConfidence - 0.1);
                insights.push({
                    type: 'threshold_analysis',
                    severity: 'medium',
                    message: 'Average confidence is low - consider lowering threshold',
                    data: {
                        currentThreshold: this.learningData.thresholds.routing_confidence,
                        avgConfidence,
                        suggestedThreshold
                    },
                    recommendation: `Lower routing confidence threshold to ${suggestedThreshold.toFixed(2)}`
                });
            } else if (avgConfidence > 0.85) {
                const suggestedThreshold = Math.min(0.9, avgConfidence - 0.05);
                insights.push({
                    type: 'threshold_analysis',
                    severity: 'info',
                    message: 'Average confidence is high - can raise threshold',
                    data: {
                        currentThreshold: this.learningData.thresholds.routing_confidence,
                        avgConfidence,
                        suggestedThreshold
                    },
                    recommendation: `Raise routing confidence threshold to ${suggestedThreshold.toFixed(2)}`
                });
            }
        }

        return insights;
    }

    /**
     * Detect routing patterns
     */
    detectPatterns(metrics) {
        const insights = [];
        const routings = metrics.filter(m => m.type === 'routing_decision');

        if (routings.length < this.minSampleSize) {
            return insights;
        }

        // Find most routed-to agents
        const agentCounts = {};
        for (const routing of routings) {
            const agent = getRoutedAgent(routing);
            if (agent) {
                agentCounts[agent] = (agentCounts[agent] || 0) + 1;
            }
        }

        const topAgents = Object.entries(agentCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (topAgents.length > 0) {
            insights.push({
                type: 'routing_pattern',
                severity: 'info',
                message: `Top agents by usage: ${topAgents.map(a => `${a[0]} (${a[1]})`).join(', ')}`,
                data: {
                    topAgents: topAgents.map(([agent, count]) => ({ agent, count }))
                },
                recommendation: 'Most-used agents should have comprehensive documentation'
            });
        }

        // Detect underutilized agents
        const totalRoutings = routings.length;
        const underutilized = Object.entries(agentCounts)
            .filter(([_, count]) => count / totalRoutings < 0.01)
            .map(([agent, count]) => ({ agent, count }));

        if (underutilized.length > 0) {
            insights.push({
                type: 'routing_pattern',
                severity: 'low',
                message: `${underutilized.length} agents used < 1% of the time`,
                data: {
                    underutilized
                },
                recommendation: 'Review agent keywords or merge with similar agents'
            });
        }

        return insights;
    }

    /**
     * ACE Framework: Analyze skill performance across agents
     */
    analyzeSkillPerformance() {
        const insights = [];

        if (this.skillData.skills.length === 0) {
            return insights;
        }

        // Overall skill health
        const totalSkills = this.skillData.skills.length;
        const highPerformerCount = this.skillData.highPerformers.length;
        const needsRefinementCount = this.skillData.needsRefinement.length;

        // Skill health ratio
        const healthRatio = highPerformerCount / totalSkills;

        insights.push({
            type: 'skill_performance',
            severity: 'info',
            message: `Skill Registry: ${totalSkills} skills tracked (${highPerformerCount} high performers, ${needsRefinementCount} need refinement)`,
            data: {
                totalSkills,
                highPerformers: highPerformerCount,
                needsRefinement: needsRefinementCount,
                healthRatio: (healthRatio * 100).toFixed(1) + '%'
            },
            recommendation: healthRatio < 0.3 ?
                'Review skill definitions and training - low performer ratio' :
                'Skill registry is healthy'
        });

        // Skills needing immediate attention
        if (this.skillData.needsRefinement.length > 0) {
            const urgentSkills = this.skillData.needsRefinement
                .filter(s => s.usage_count >= 10 && s.success_rate < 0.5)
                .slice(0, 5);

            if (urgentSkills.length > 0) {
                insights.push({
                    type: 'skill_performance',
                    severity: 'high',
                    message: `${urgentSkills.length} heavily-used skills have <50% success rate`,
                    data: {
                        urgentSkills: urgentSkills.map(s => ({
                            skill_id: s.skill_id,
                            success_rate: s.success_rate,
                            usage_count: s.usage_count
                        }))
                    },
                    recommendation: 'Prioritize refinement of these skills to improve routing effectiveness'
                });
            }
        }

        // Agent skill portfolio analysis
        for (const [agent, skills] of Object.entries(this.skillData.agentSkills)) {
            if (skills.length === 0) continue;

            const avgSuccessRate = skills.reduce((sum, s) => sum + (s.success_rate || 0), 0) / skills.length;
            const totalUsage = skills.reduce((sum, s) => sum + (s.usage_count || 0), 0);

            // Update agent skill portfolio in learning data
            this.learningData.agentSkillPortfolios[agent] = {
                skillCount: skills.length,
                avgSuccessRate,
                totalSkillUsage: totalUsage
            };

            // Flag agents with poor skill performance
            if (avgSuccessRate < 0.6 && totalUsage >= this.minSampleSize) {
                insights.push({
                    type: 'skill_performance',
                    severity: 'medium',
                    message: `Agent ${agent} has low average skill success rate: ${(avgSuccessRate * 100).toFixed(1)}%`,
                    data: {
                        agent,
                        skillCount: skills.length,
                        avgSuccessRate,
                        totalUsage
                    },
                    recommendation: `Review skills for ${agent} - may need refinement or better task matching`
                });
            }

            // Highlight agents with excellent skill portfolios
            if (avgSuccessRate >= 0.9 && totalUsage >= this.minSampleSize) {
                insights.push({
                    type: 'skill_performance',
                    severity: 'info',
                    message: `Agent ${agent} has excellent skill portfolio: ${(avgSuccessRate * 100).toFixed(1)}% avg success`,
                    data: {
                        agent,
                        skillCount: skills.length,
                        avgSuccessRate,
                        totalUsage
                    },
                    recommendation: `Consider routing more tasks to ${agent} based on skill performance`
                });
            }
        }

        return insights;
    }

    /**
     * ACE Framework: Identify skill transfer opportunities
     */
    analyzeSkillTransferOpportunities() {
        const insights = [];

        if (this.skillData.highPerformers.length === 0) {
            return insights;
        }

        // Find high-performing skills that could benefit other agents
        const transferCandidates = this.skillData.highPerformers
            .filter(skill =>
                skill.success_rate >= this.skillTransferThreshold &&
                skill.usage_count >= 20 // Enough data to trust
            );

        if (transferCandidates.length === 0) {
            return insights;
        }

        // Find similar agents that don't have these skills
        for (const skill of transferCandidates) {
            const sourceAgent = skill.source_agent;
            const category = skill.category;

            // Find agents in similar categories
            const similarAgents = this.findSimilarAgents(sourceAgent, category);
            const potentialRecipients = similarAgents.filter(agent => {
                const agentSkills = this.skillData.agentSkills[agent] || [];
                return !agentSkills.some(s => s.skill_id === skill.skill_id);
            });

            if (potentialRecipients.length > 0) {
                // Add to transfer candidates list
                this.learningData.skillTransferCandidates.push({
                    skill_id: skill.skill_id,
                    source_agent: sourceAgent,
                    success_rate: skill.success_rate,
                    potential_recipients: potentialRecipients,
                    identified_at: new Date().toISOString()
                });
            }
        }

        // Generate insight for transfer opportunities
        if (this.learningData.skillTransferCandidates.length > 0) {
            insights.push({
                type: 'skill_transfer',
                severity: 'info',
                message: `${this.learningData.skillTransferCandidates.length} skill transfer opportunities identified`,
                data: {
                    candidates: this.learningData.skillTransferCandidates.slice(0, 5).map(c => ({
                        skill_id: c.skill_id,
                        source: c.source_agent,
                        success_rate: c.success_rate,
                        recipients: c.potential_recipients.length
                    }))
                },
                recommendation: 'Consider enabling automatic skill transfers to propagate successful strategies'
            });
        }

        return insights;
    }

    /**
     * ACE Framework: Find agents similar to a given agent
     */
    findSimilarAgents(sourceAgent, category) {
        // Simple similarity based on agent naming convention
        const similarAgents = [];

        // Extract platform prefix (e.g., 'sfdc-', 'hubspot-')
        const platformMatch = sourceAgent.match(/^(sfdc-|hubspot-|unified-)/);
        const platform = platformMatch ? platformMatch[1] : null;

        for (const [agent, skills] of Object.entries(this.skillData.agentSkills)) {
            if (agent === sourceAgent) continue;

            // Same platform
            if (platform && agent.startsWith(platform)) {
                similarAgents.push(agent);
                continue;
            }

            // Similar category skills
            const agentCategories = skills.map(s => {
                const skill = this.skillData.skills.find(sk => sk.skill_id === s.skill_id);
                return skill ? skill.category : null;
            }).filter(c => c);

            if (category && agentCategories.includes(category)) {
                similarAgents.push(agent);
            }
        }

        return similarAgents;
    }

    /**
     * ACE Framework: Get routing boost for an agent based on skill performance
     * @param {string} agent - Agent name
     * @returns {number} Boost factor (1.0 = no boost, >1.0 = boost)
     */
    getSkillRoutingBoost(agent) {
        const portfolio = this.learningData.agentSkillPortfolios[agent];

        if (!portfolio || portfolio.totalSkillUsage < this.minSampleSize) {
            return 1.0; // No boost without sufficient data
        }

        // Boost based on skill success rate
        if (portfolio.avgSuccessRate >= 0.9) {
            return 1.3; // 30% boost for excellent performers
        } else if (portfolio.avgSuccessRate >= 0.8) {
            return 1.15; // 15% boost for good performers
        } else if (portfolio.avgSuccessRate < 0.6) {
            return 0.85; // 15% penalty for poor performers
        }

        return 1.0;
    }

    /**
     * Generate recommendations from insights
     */
    generateRecommendations(insights) {
        const recommendations = [];

        // Group insights by severity
        const high = insights.filter(i => i.severity === 'high');
        const medium = insights.filter(i => i.severity === 'medium');

        // Critical recommendations (from high severity insights)
        if (high.length > 0) {
            recommendations.push({
                priority: 'critical',
                category: 'immediate_action',
                title: `${high.length} critical issues detected`,
                actions: high.map(i => i.recommendation)
            });
        }

        // Important recommendations (from medium severity insights)
        if (medium.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'optimization',
                title: `${medium.length} optimization opportunities`,
                actions: medium.map(i => i.recommendation)
            });
        }

        // Threshold tuning recommendations
        const thresholdInsights = insights.filter(i => i.type === 'threshold_analysis');
        if (thresholdInsights.length > 0) {
            recommendations.push({
                priority: 'medium',
                category: 'threshold_tuning',
                title: 'Threshold adjustments suggested',
                actions: thresholdInsights.map(i => i.recommendation)
            });
        }

        // ACE Framework: Skill-based recommendations
        const skillInsights = insights.filter(i => i.type === 'skill_performance');
        const urgentSkillIssues = skillInsights.filter(i => i.severity === 'high' || i.severity === 'medium');
        if (urgentSkillIssues.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'skill_refinement',
                title: `${urgentSkillIssues.length} skills need attention`,
                actions: urgentSkillIssues.map(i => i.recommendation)
            });
        }

        // ACE Framework: Skill transfer recommendations
        const transferInsights = insights.filter(i => i.type === 'skill_transfer');
        if (transferInsights.length > 0) {
            recommendations.push({
                priority: 'medium',
                category: 'skill_transfer',
                title: 'Skill transfer opportunities available',
                actions: transferInsights.map(i => i.recommendation)
            });
        }

        return recommendations;
    }

    /**
     * Generate summary of analysis
     */
    generateSummary(insights, recommendations) {
        const bySeverity = {
            high: insights.filter(i => i.severity === 'high').length,
            medium: insights.filter(i => i.severity === 'medium').length,
            low: insights.filter(i => i.severity === 'low').length,
            info: insights.filter(i => i.severity === 'info').length
        };

        // ACE Framework: Skill-specific summary
        const skillSummary = {
            totalSkills: this.skillData.skills.length,
            highPerformers: this.skillData.highPerformers.length,
            needsRefinement: this.skillData.needsRefinement.length,
            transferCandidates: this.learningData.skillTransferCandidates.length
        };

        return {
            totalInsights: insights.length,
            bySeverity,
            totalRecommendations: recommendations.length,
            criticalActions: recommendations.filter(r => r.priority === 'critical').length,
            optimizations: recommendations.filter(r => r.priority === 'high').length,
            skills: skillSummary
        };
    }

    /**
     * Save learning data to disk
     */
    saveLearningData() {
        try {
            fs.writeFileSync(
                this.learningFile,
                JSON.stringify(this.learningData, null, 2),
                'utf-8'
            );
            this.log(`Learning data saved: ${this.learningFile}`);
        } catch (error) {
            console.error(`Failed to save learning data: ${error.message}`);
        }
    }

    /**
     * Format analysis result for display
     */
    format(result) {
        const lines = [];

        lines.push('='.repeat(70));
        lines.push('Routing Learning Analysis');
        lines.push('='.repeat(70));

        if (result.status === 'insufficient_data') {
            lines.push(result.message);
            return lines.join('\n');
        }

        lines.push(`Total Metrics Analyzed: ${result.totalMetrics}`);
        lines.push(`Insights Generated: ${result.insights.length}`);
        lines.push(`Recommendations: ${result.recommendations.length}`);
        lines.push('');

        lines.push('Summary:');
        lines.push('-'.repeat(70));
        lines.push(`  Critical Issues:      ${result.summary.bySeverity.high}`);
        lines.push(`  Optimization Opps:    ${result.summary.bySeverity.medium}`);
        lines.push(`  Info/Low Priority:    ${result.summary.bySeverity.low + result.summary.bySeverity.info}`);
        lines.push(`  Critical Actions:     ${result.summary.criticalActions}`);
        lines.push('');

        // ACE Framework: Skill summary
        if (result.summary.skills && result.summary.skills.totalSkills > 0) {
            lines.push('ACE Skill Registry:');
            lines.push('-'.repeat(70));
            lines.push(`  Total Skills:         ${result.summary.skills.totalSkills}`);
            lines.push(`  High Performers:      ${result.summary.skills.highPerformers}`);
            lines.push(`  Needs Refinement:     ${result.summary.skills.needsRefinement}`);
            lines.push(`  Transfer Candidates:  ${result.summary.skills.transferCandidates}`);
            lines.push('');
        }

        if (result.recommendations.length > 0) {
            lines.push('Recommendations:');
            lines.push('-'.repeat(70));

            for (const rec of result.recommendations) {
                lines.push(`[${rec.priority.toUpperCase()}] ${rec.title}`);
                for (const action of rec.actions) {
                    lines.push(`  • ${action}`);
                }
                lines.push('');
            }
        }

        if (result.insights.length > 0) {
            lines.push('Detailed Insights:');
            lines.push('-'.repeat(70));

            const byType = {};
            for (const insight of result.insights) {
                if (!byType[insight.type]) {
                    byType[insight.type] = [];
                }
                byType[insight.type].push(insight);
            }

            for (const [type, insights] of Object.entries(byType)) {
                lines.push(`${type.replace(/_/g, ' ').toUpperCase()}:`);
                for (const insight of insights) {
                    lines.push(`  [${insight.severity}] ${insight.message}`);
                }
                lines.push('');
            }
        }

        lines.push('='.repeat(70));

        return lines.join('\n');
    }

    /**
     * Log message if verbose
     */
    log(message) {
        if (this.verbose) {
            console.log(`[LEARNER] ${message}`);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args[0] === '--help' || args[0] === '-h') {
        console.log('Usage: routing-learner.js [command] [options]');
        console.log('');
        console.log('Routing Learner v2.0.0 with ACE Framework Integration');
        console.log('');
        console.log('Commands:');
        console.log('  analyze             Run full analysis (default)');
        console.log('  skill-boost <agent> Get skill-based routing boost for agent');
        console.log('  skill-health        Show skill registry health summary');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h          Show this help message');
        console.log('  --verbose, -v       Show detailed output');
        console.log('  --json              Output as JSON');
        console.log('');
        console.log('Examples:');
        console.log('  routing-learner.js                        # Full analysis');
        console.log('  routing-learner.js --verbose              # With details');
        console.log('  routing-learner.js --json                 # JSON output');
        console.log('  routing-learner.js skill-boost sfdc-cpq-assessor');
        console.log('  routing-learner.js skill-health');
        console.log('');
        console.log('ACE Framework Features:');
        console.log('  - Skill-aware routing based on skill registry success rates');
        console.log('  - Cross-agent skill transfer recommendations');
        console.log('  - Agent skill portfolio health scoring');
        process.exit(0);
    }

    const verbose = args.includes('--verbose') || args.includes('-v');
    const json = args.includes('--json');
    const command = args.find(a => !a.startsWith('-')) || 'analyze';

    try {
        const learner = new RoutingLearner({ verbose });

        if (command === 'skill-boost') {
            // Get skill boost for specific agent
            const agentIndex = args.indexOf('skill-boost') + 1;
            const agent = args[agentIndex];
            if (!agent || agent.startsWith('-')) {
                console.error('Error: Agent name required for skill-boost command');
                process.exit(1);
            }
            learner.analyze(); // Load data first
            const boost = learner.getSkillRoutingBoost(agent);
            if (json) {
                console.log(JSON.stringify({ agent, boost }, null, 2));
            } else {
                console.log(`Agent: ${agent}`);
                console.log(`Skill Routing Boost: ${boost.toFixed(2)}x`);
                if (boost > 1.0) {
                    console.log(`(Agent receives ${((boost - 1) * 100).toFixed(0)}% routing priority boost)`);
                } else if (boost < 1.0) {
                    console.log(`(Agent receives ${((1 - boost) * 100).toFixed(0)}% routing priority penalty)`);
                } else {
                    console.log('(No skill-based boost - insufficient data or average performance)');
                }
            }
        } else if (command === 'skill-health') {
            // Show skill health summary
            learner.loadSkillData();
            const health = {
                totalSkills: learner.skillData.skills.length,
                highPerformers: learner.skillData.highPerformers.length,
                needsRefinement: learner.skillData.needsRefinement.length,
                agentsWithSkills: Object.keys(learner.skillData.agentSkills).length,
                healthRatio: learner.skillData.skills.length > 0 ?
                    (learner.skillData.highPerformers.length / learner.skillData.skills.length * 100).toFixed(1) + '%' :
                    'N/A'
            };
            if (json) {
                console.log(JSON.stringify(health, null, 2));
            } else {
                console.log('='.repeat(50));
                console.log('ACE Skill Registry Health');
                console.log('='.repeat(50));
                console.log(`Total Skills:         ${health.totalSkills}`);
                console.log(`High Performers:      ${health.highPerformers}`);
                console.log(`Needs Refinement:     ${health.needsRefinement}`);
                console.log(`Agents with Skills:   ${health.agentsWithSkills}`);
                console.log(`Health Ratio:         ${health.healthRatio}`);
                console.log('='.repeat(50));
            }
        } else {
            // Default: full analysis
            const result = learner.analyze();
            if (json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log(learner.format(result));
            }
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = { RoutingLearner };
