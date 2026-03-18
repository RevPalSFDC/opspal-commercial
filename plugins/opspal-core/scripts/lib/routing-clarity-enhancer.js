#!/usr/bin/env node

/**
 * Routing Clarity Enhancer
 *
 * Extends the semantic router with human-readable explanations, decision logging,
 * and confidence breakdowns to address agent routing confusion.
 *
 * Addresses: Reflection cohorts 1, 7 (tool-contract, 21 reflections, $31.5K ROI)
 *
 * Features:
 * - "Why this agent?" explanations with reasoning
 * - Confidence breakdown (what matched, what didn't)
 * - Decision logging for analysis
 * - Alternative suggestions when confidence is low
 * - User override controls
 *
 * Usage:
 *   const { RoutingClarityEnhancer } = require('./routing-clarity-enhancer');
 *
 *   const enhancer = new RoutingClarityEnhancer();
 *   const result = await enhancer.route("Run CPQ assessment for eta-corp");
 *
 * @module routing-clarity-enhancer
 * @version 1.0.0
 * @created 2025-11-10
 * @addresses Cohorts #1, #7 - Agent Routing Issues ($31.5k ROI)
 */

const fs = require('fs');
const path = require('path');
const { SemanticRouter } = require('./semantic-router');

class RoutingClarityEnhancer {
    constructor(options = {}) {
        this.semanticRouter = new SemanticRouter(options);
        this.verbose = options.verbose || false;
        this.logPath = options.logPath ||
            path.join(process.cwd(), '.claude', 'logs', 'routing-decisions.log');

        // Ensure log directory exists
        const logDir = path.dirname(this.logPath);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // Load routing index for metadata
        this.routingIndexPath = options.routingIndexPath ||
            path.join(__dirname, '../../routing-index.json');
        this.loadRoutingIndex();

        // Statistics
        this.stats = {
            totalRoutings: 0,
            highConfidence: 0,
            mediumConfidence: 0,
            lowConfidence: 0,
            userOverrides: 0
        };
    }

    /**
     * Load routing index for agent metadata
     */
    loadRoutingIndex() {
        if (fs.existsSync(this.routingIndexPath)) {
            this.routingIndex = JSON.parse(fs.readFileSync(this.routingIndexPath, 'utf-8'));
        } else {
            this.routingIndex = { agents: {}, agentsByFull: {}, agentsByShort: {} };
        }
    }

    /**
     * Resolve agent metadata across legacy and collision-safe index formats
     *
     * @param {string} agentName - Full or short agent name
     * @returns {Object|null} Agent metadata
     */
    getAgentMetadata(agentName) {
        if (!agentName) {
            return null;
        }

        if (this.routingIndex.agentsByFull?.[agentName]) {
            return this.routingIndex.agentsByFull[agentName];
        }

        const legacyMetadata = this.routingIndex.agents?.[agentName];
        if (legacyMetadata && !Array.isArray(legacyMetadata)) {
            return legacyMetadata;
        }

        const candidates = this.routingIndex.agentsByShort?.[agentName];
        if (Array.isArray(candidates) && candidates.length > 0) {
            const fullName = candidates.find(name => this.routingIndex.agentsByFull?.[name]) || candidates[0];
            return this.routingIndex.agentsByFull?.[fullName] || null;
        }

        return null;
    }

    /**
     * Normalize confidence scores to 0-1 range
     *
     * @param {number} confidence - Raw confidence score
     * @returns {number} Normalized confidence score
     */
    normalizeConfidence(confidence) {
        if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
            return 0;
        }
        return confidence > 1 ? confidence / 100 : confidence;
    }

    /**
     * Normalize semantic router result for downstream confidence handling
     *
     * @param {Object} semanticResult - Raw semantic router result
     * @returns {Object} Normalized result
     */
    normalizeSemanticResult(semanticResult) {
        const normalizedMatches = (semanticResult.matches || []).map(match => ({
            ...match,
            confidence: this.normalizeConfidence(match.confidence)
        }));

        return {
            ...semanticResult,
            matches: normalizedMatches,
            confidence: normalizedMatches.length > 0 ?
                normalizedMatches[0].confidence :
                this.normalizeConfidence(semanticResult.confidence)
        };
    }

    /**
     * Route task with enhanced explanations
     *
     * @param {string} taskDescription - Task to route
     * @param {Object} options - Routing options
     * @param {boolean} options.explainDecision - Include detailed explanation
     * @param {boolean} options.includeAlternatives - Show alternative agents
     * @param {string} options.userOverride - User-specified agent
     * @returns {Object} Enhanced routing result
     */
    async route(taskDescription, options = {}) {
        this.stats.totalRoutings++;

        const result = {
            taskDescription: taskDescription,
            timestamp: new Date().toISOString(),
            routing: null,
            confidence: 0,
            confidenceLevel: '',
            explanation: '',
            reasoning: {
                matchedKeywords: [],
                matchedPhrases: [],
                similarityScore: 0,
                confidenceFactors: []
            },
            alternatives: [],
            recommendation: '',
            userOverride: options.userOverride || null
        };

        // Handle user override
        if (options.userOverride) {
            this.stats.userOverrides++;
            result.routing = options.userOverride;
            result.confidence = 1.0;
            result.confidenceLevel = 'USER_OVERRIDE';
            result.explanation = `User explicitly requested agent: ${options.userOverride}`;
            this.logDecision(result);
            return result;
        }

        // Get semantic routing result
        const semanticResult = this.normalizeSemanticResult(
            this.semanticRouter.route(taskDescription)
        );

        result.routing = semanticResult.topAgent;
        result.confidence = semanticResult.confidence;
        result.confidenceLevel = this.getConfidenceLevel(semanticResult.confidence);

        // Update confidence stats
        if (result.confidence >= 0.7) {
            this.stats.highConfidence++;
        } else if (result.confidence >= 0.4) {
            this.stats.mediumConfidence++;
        } else {
            this.stats.lowConfidence++;
        }

        // Generate explanation
        if (options.explainDecision !== false) {
            result.explanation = this.generateExplanation(semanticResult, taskDescription);
            result.reasoning = this.analyzeReasoning(semanticResult, taskDescription);
        }

        // Include alternatives
        if (options.includeAlternatives !== false) {
            result.alternatives = this.generateAlternatives(semanticResult);
        }

        // Generate recommendation
        result.recommendation = this.generateRecommendation(result);

        // Log decision
        this.logDecision(result);

        return result;
    }

    /**
     * Get confidence level label
     *
     * @param {number} confidence - Confidence score (0-1)
     * @returns {string} Confidence level
     */
    getConfidenceLevel(confidence) {
        if (confidence >= 0.85) return 'VERY_HIGH';
        if (confidence >= 0.7) return 'HIGH';
        if (confidence >= 0.5) return 'MEDIUM';
        if (confidence >= 0.3) return 'LOW';
        return 'VERY_LOW';
    }

    /**
     * Generate human-readable explanation for routing decision
     *
     * @param {Object} semanticResult - Semantic routing result
     * @param {string} taskDescription - Original task
     * @returns {string} Explanation
     */
    generateExplanation(semanticResult, taskDescription) {
        if (!semanticResult.topAgent) {
            return 'No suitable agent found. Consider using direct tool execution or creating a new agent.';
        }

        const agent = semanticResult.topAgent;
        const confidence = semanticResult.confidence;
        const similarity = semanticResult.similarity;

        let explanation = `Selected agent "${agent}" with ${(confidence * 100).toFixed(1)}% confidence.\n\n`;

        // Confidence-based explanation
        if (confidence >= 0.85) {
            explanation += `🟢 **Very High Confidence** - This agent is an excellent match for your task.\n\n`;
            explanation += `The semantic analysis shows strong alignment between your task description and this agent's capabilities. `;
            explanation += `The agent specializes in operations matching "${taskDescription.substring(0, 50)}..."\n\n`;
        } else if (confidence >= 0.7) {
            explanation += `🟡 **High Confidence** - This agent is a good match for your task.\n\n`;
            explanation += `There's strong semantic similarity (${(similarity * 100).toFixed(1)}%) between your task and this agent's expertise. `;
            explanation += `Proceed with this agent, but review the alternatives if the task has specific requirements.\n\n`;
        } else if (confidence >= 0.5) {
            explanation += `🟠 **Medium Confidence** - This agent may be suitable, but consider alternatives.\n\n`;
            explanation += `The semantic match is moderate (${(similarity * 100).toFixed(1)}%). `;
            explanation += `Review the agent's description to confirm it matches your needs, or check the alternatives below.\n\n`;
        } else {
            explanation += `🔴 **Low Confidence** - This agent may not be the best match.\n\n`;
            explanation += `The semantic similarity is below optimal (${(similarity * 100).toFixed(1)}%). `;
            explanation += `**Recommendation**: Review alternatives or consider direct tool execution if this is a simple operation.\n\n`;
        }

        // Add agent metadata if available
        const agentMetadata = this.getAgentMetadata(agent);
        if (agentMetadata) {
            explanation += `**Agent Capabilities:**\n`;
            if (agentMetadata.description) {
                explanation += `- ${agentMetadata.description}\n`;
            }
            if (agentMetadata.primaryKeywords && agentMetadata.primaryKeywords.length > 0) {
                explanation += `- Key expertise: ${agentMetadata.primaryKeywords.slice(0, 5).join(', ')}\n`;
            }
        }

        return explanation;
    }

    /**
     * Analyze reasoning for routing decision
     *
     * @param {Object} semanticResult - Semantic routing result
     * @param {string} taskDescription - Original task
     * @returns {Object} Reasoning analysis
     */
    analyzeReasoning(semanticResult, taskDescription) {
        const reasoning = {
            matchedKeywords: [],
            matchedPhrases: [],
            similarityScore: semanticResult.similarity,
            confidenceFactors: []
        };

        if (!semanticResult.topAgent) {
            return reasoning;
        }

        const agent = semanticResult.topAgent;
        const agentMetadata = this.getAgentMetadata(agent);

        if (!agentMetadata) {
            return reasoning;
        }

        // Extract keywords from task
        const taskWords = this.extractKeywords(taskDescription);

        // Match against agent keywords
        const agentKeywords = new Set([
            ...(agentMetadata.primaryKeywords || []),
            ...(agentMetadata.triggerKeywords || [])
        ]);

        for (const keyword of taskWords) {
            for (const agentKeyword of agentKeywords) {
                if (keyword.includes(agentKeyword) || agentKeyword.includes(keyword)) {
                    reasoning.matchedKeywords.push({
                        task: keyword,
                        agent: agentKeyword,
                        weight: 1.0
                    });
                }
            }
        }

        // Confidence factors
        reasoning.confidenceFactors = this.calculateConfidenceFactors(
            semanticResult,
            reasoning.matchedKeywords.length
        );

        return reasoning;
    }

    /**
     * Extract keywords from text
     *
     * @param {string} text - Text to analyze
     * @returns {string[]} Keywords
     */
    extractKeywords(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 3);
    }

    /**
     * Calculate confidence factors
     *
     * @param {Object} semanticResult - Semantic routing result
     * @param {number} keywordMatchCount - Number of matched keywords
     * @returns {Object[]} Confidence factors
     */
    calculateConfidenceFactors(semanticResult, keywordMatchCount) {
        const factors = [];

        // Semantic similarity
        factors.push({
            factor: 'Semantic Similarity',
            value: semanticResult.similarity,
            weight: 0.6,
            contribution: (semanticResult.similarity * 0.6).toFixed(2)
        });

        // Keyword matches
        const keywordScore = Math.min(keywordMatchCount / 5, 1.0);
        factors.push({
            factor: 'Keyword Matches',
            value: keywordMatchCount,
            weight: 0.3,
            contribution: (keywordScore * 0.3).toFixed(2)
        });

        // Match count (how many agents matched)
        const uniquenessScore = Math.max(1 - (semanticResult.matchCount / 20), 0);
        factors.push({
            factor: 'Agent Uniqueness',
            value: uniquenessScore,
            weight: 0.1,
            contribution: (uniquenessScore * 0.1).toFixed(2)
        });

        return factors;
    }

    /**
     * Generate alternative agent suggestions
     *
     * @param {Object} semanticResult - Semantic routing result
     * @returns {Object[]} Alternative agents
     */
    generateAlternatives(semanticResult) {
        if (!semanticResult.matches || semanticResult.matches.length <= 1) {
            return [];
        }

        // Get top 3 alternatives (excluding the top match)
        const alternatives = semanticResult.matches.slice(1, 4).map(match => {
            const agentMetadata = this.getAgentMetadata(match.agent);

            return {
                agent: match.agent,
                confidence: match.confidence,
                similarity: match.similarity,
                description: agentMetadata?.description || 'No description available',
                reason: this.generateAlternativeReason(match, semanticResult.matches[0])
            };
        });

        return alternatives;
    }

    /**
     * Generate reason for alternative suggestion
     *
     * @param {Object} alternative - Alternative match
     * @param {Object} topMatch - Top match
     * @returns {string} Reason
     */
    generateAlternativeReason(alternative, topMatch) {
        const confidenceDiff = ((topMatch.confidence - alternative.confidence) * 100).toFixed(1);

        if (confidenceDiff < 5) {
            return `Very close match (only ${confidenceDiff}% lower confidence). Consider this if the top agent doesn't fit.`;
        } else if (confidenceDiff < 15) {
            return `Good alternative with ${(alternative.confidence * 100).toFixed(1)}% confidence.`;
        } else {
            return `Possible alternative if task has specific requirements this agent handles better.`;
        }
    }

    /**
     * Generate recommendation based on confidence level
     *
     * @param {Object} result - Routing result
     * @returns {string} Recommendation
     */
    generateRecommendation(result) {
        const confidence = result.confidence;

        if (confidence >= 0.85) {
            return `✅ **Proceed with confidence** - The selected agent is highly suitable for this task.`;
        } else if (confidence >= 0.7) {
            return `✅ **Recommended** - The agent is well-suited. Review alternatives if task has specific needs.`;
        } else if (confidence >= 0.5) {
            return `⚠️  **Review before proceeding** - Moderate match. Confirm agent capabilities align with task requirements.`;
        } else if (confidence >= 0.3) {
            return `⚠️  **Consider alternatives** - Low confidence match. Review alternatives or use direct tool execution.`;
        } else {
            return `❌ **Not recommended** - Very low confidence. Consider:\n- Using direct tool execution\n- Creating a specialized agent\n- Refining task description`;
        }
    }

    /**
     * Log routing decision to file
     *
     * @param {Object} decision - Routing decision
     */
    logDecision(decision) {
        const logEntry = {
            timestamp: decision.timestamp,
            task: decision.taskDescription.substring(0, 100),
            agent: decision.routing,
            confidence: decision.confidence,
            confidenceLevel: decision.confidenceLevel,
            userOverride: decision.userOverride !== null
        };

        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.logPath, logLine);
        } catch (error) {
            if (this.verbose) {
                console.error(`Failed to log routing decision: ${error.message}`);
            }
        }
    }

    /**
     * Get routing statistics
     *
     * @returns {Object} Statistics
     */
    getStats() {
        const total = this.stats.totalRoutings;

        return {
            ...this.stats,
            highConfidenceRate: total > 0 ? ((this.stats.highConfidence / total) * 100).toFixed(1) + '%' : 'N/A',
            mediumConfidenceRate: total > 0 ? ((this.stats.mediumConfidence / total) * 100).toFixed(1) + '%' : 'N/A',
            lowConfidenceRate: total > 0 ? ((this.stats.lowConfidence / total) * 100).toFixed(1) + '%' : 'N/A',
            userOverrideRate: total > 0 ? ((this.stats.userOverrides / total) * 100).toFixed(1) + '%' : 'N/A'
        };
    }

    /**
     * Analyze routing log for patterns
     *
     * @param {number} lastN - Analyze last N decisions
     * @returns {Object} Analysis
     */
    analyzeLog(lastN = 100) {
        if (!fs.existsSync(this.logPath)) {
            return {
                entriesAnalyzed: 0,
                message: 'No routing log found'
            };
        }

        const logContent = fs.readFileSync(this.logPath, 'utf-8');
        const entries = logContent.trim().split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line))
            .slice(-lastN);

        const analysis = {
            entriesAnalyzed: entries.length,
            averageConfidence: 0,
            confidenceLevels: {},
            topAgents: {},
            userOverrideCount: 0,
            lowConfidenceCount: 0
        };

        let totalConfidence = 0;

        for (const entry of entries) {
            totalConfidence += entry.confidence;

            // Count confidence levels
            analysis.confidenceLevels[entry.confidenceLevel] =
                (analysis.confidenceLevels[entry.confidenceLevel] || 0) + 1;

            // Count agents
            analysis.topAgents[entry.agent] =
                (analysis.topAgents[entry.agent] || 0) + 1;

            // Count user overrides
            if (entry.userOverride) {
                analysis.userOverrideCount++;
            }

            // Count low confidence
            if (entry.confidence < 0.5) {
                analysis.lowConfidenceCount++;
            }
        }

        analysis.averageConfidence = (totalConfidence / entries.length).toFixed(2);

        // Sort top agents
        analysis.topAgents = Object.entries(analysis.topAgents)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .reduce((obj, [agent, count]) => {
                obj[agent] = count;
                return obj;
            }, {});

        return analysis;
    }
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
    const command = process.argv[2];

    const enhancer = new RoutingClarityEnhancer({ verbose: true });

    if (command === 'route') {
        const taskDescription = process.argv.slice(3).join(' ');

        if (!taskDescription) {
            console.log(`
Routing Clarity Enhancer

Usage:
  node routing-clarity-enhancer.js route <task description>
  node routing-clarity-enhancer.js stats
  node routing-clarity-enhancer.js analyze [lastN]

Examples:
  node routing-clarity-enhancer.js route "Run CPQ assessment for eta-corp"
  node routing-clarity-enhancer.js stats
  node routing-clarity-enhancer.js analyze 100
            `);
            process.exit(1);
        }

        enhancer.route(taskDescription, {
            explainDecision: true,
            includeAlternatives: true
        }).then(result => {
            console.log('\n' + '═'.repeat(60));
            console.log('🧭 Routing Decision');
            console.log('═'.repeat(60));
            console.log(`\n**Task:** ${result.taskDescription}\n`);
            console.log(`**Selected Agent:** ${result.routing || 'NONE'}`);
            console.log(`**Confidence:** ${(result.confidence * 100).toFixed(1)}% (${result.confidenceLevel})\n`);
            console.log('---\n');
            console.log(result.explanation);

            if (result.alternatives.length > 0) {
                console.log('\n**Alternatives:**\n');
                result.alternatives.forEach((alt, i) => {
                    console.log(`${i + 1}. ${alt.agent} (${(alt.confidence * 100).toFixed(1)}% confidence)`);
                    console.log(`   ${alt.reason}\n`);
                });
            }

            console.log('---\n');
            console.log(result.recommendation);
            console.log('\n' + '═'.repeat(60) + '\n');

            process.exit(0);
        });

    } else if (command === 'stats') {
        const stats = enhancer.getStats();
        console.log('\n📊 Routing Statistics\n');
        console.log(JSON.stringify(stats, null, 2));
        console.log('');

    } else if (command === 'analyze') {
        const lastN = parseInt(process.argv[3]) || 100;
        const analysis = enhancer.analyzeLog(lastN);

        console.log('\n📈 Routing Log Analysis\n');
        console.log(JSON.stringify(analysis, null, 2));
        console.log('');

    } else {
        console.log('Unknown command. Use "route", "stats", or "analyze".');
        process.exit(1);
    }
}

module.exports = { RoutingClarityEnhancer };
