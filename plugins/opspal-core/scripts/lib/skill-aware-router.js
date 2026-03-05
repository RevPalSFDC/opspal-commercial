#!/usr/bin/env node

/**
 * Skill-Aware Agent Router - Confidence-based agent routing
 *
 * Enhances agent routing by incorporating skill confidence scores
 * from historical performance data. Agents with high-confidence
 * skills for the task type receive score boosts.
 *
 * @version 1.0.0
 * @date 2025-12-10
 */

const fs = require('fs');
const path = require('path');

// Load SkillTracker
let SkillTracker;
try {
    SkillTracker = require('./skill-tracker.js').SkillTracker;
} catch (e) {
    SkillTracker = null;
}

class SkillAwareRouter {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.skillTracker = SkillTracker ? new SkillTracker({ verbose: this.verbose }) : null;

        // Configuration
        this.config = {
            // How much to boost score based on skill confidence (0-1)
            maxConfidenceBoost: options.maxConfidenceBoost || 0.3,
            // Minimum confidence to consider for boost
            minConfidenceThreshold: options.minConfidenceThreshold || 0.3,
            // Weight for skill match vs base score
            skillWeight: options.skillWeight || 0.4,
            baseScoreWeight: options.baseScoreWeight || 0.6,
            // Penalty for agents with low-confidence skills
            lowConfidencePenalty: options.lowConfidencePenalty || 0.1
        };

        // Load skill registry for task analysis
        this.skillRegistry = this._loadSkillRegistry(options.skillRegistryPath);

        // Cache for agent skill mappings
        this.agentSkillCache = new Map();
    }

    /**
     * Load skill registry
     */
    _loadSkillRegistry(customPath) {
        const registryPath = customPath || path.join(__dirname, '../../config/skill-registry.json');

        try {
            if (fs.existsSync(registryPath)) {
                return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[SKILL_ROUTER] Failed to load registry: ${error.message}`);
            }
        }
        return { skillCategories: {} };
    }

    /**
     * Get skills for an agent (cached)
     * @param {string} agentName - Agent name
     * @returns {Array} Skill IDs associated with agent
     */
    getAgentSkills(agentName) {
        if (this.agentSkillCache.has(agentName)) {
            return this.agentSkillCache.get(agentName);
        }

        const skills = [];
        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            for (const [skillId, skillDef] of Object.entries(categoryData.skills || {})) {
                if (skillDef.agents && skillDef.agents.includes(agentName)) {
                    skills.push(skillId);
                }
            }
        }

        this.agentSkillCache.set(agentName, skills);
        return skills;
    }

    /**
     * Detect required skills from task description
     * @param {string} taskDescription - Task description
     * @returns {Array} Detected skill IDs
     */
    detectTaskSkills(taskDescription) {
        if (!taskDescription) return [];

        const normalizedTask = taskDescription.toLowerCase();
        const detectedSkills = new Set();

        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            for (const [skillId, skillDef] of Object.entries(categoryData.skills || {})) {
                const keywords = skillDef.keywords || [];
                for (const keyword of keywords) {
                    if (normalizedTask.includes(keyword.toLowerCase())) {
                        detectedSkills.add(skillId);
                    }
                }
            }
        }

        return Array.from(detectedSkills);
    }

    /**
     * Calculate skill confidence boost for an agent
     * @param {string} agentName - Agent name
     * @param {Array} taskSkills - Skills required for task
     * @returns {number} Confidence boost (0 to maxConfidenceBoost)
     */
    getSkillConfidenceBoost(agentName, taskSkills) {
        if (!this.skillTracker || taskSkills.length === 0) {
            return 0;
        }

        const agentSkills = this.getAgentSkills(agentName);
        const matchingSkills = taskSkills.filter(s => agentSkills.includes(s));

        if (matchingSkills.length === 0) {
            return 0;
        }

        // Calculate average confidence for matching skills
        let totalConfidence = 0;
        let validSkills = 0;

        for (const skillId of matchingSkills) {
            const confidence = this.skillTracker.getSkillConfidence(skillId);
            if (confidence.totalExecutions > 0) {
                totalConfidence += confidence.confidence;
                validSkills++;
            } else {
                // Default confidence for unknown skills
                totalConfidence += 0.5;
                validSkills++;
            }
        }

        const avgConfidence = validSkills > 0 ? totalConfidence / validSkills : 0.5;

        // Calculate boost
        if (avgConfidence < this.config.minConfidenceThreshold) {
            // Low confidence - apply penalty
            return -this.config.lowConfidencePenalty;
        }

        // Scale confidence to boost range
        const confidenceRange = 1 - this.config.minConfidenceThreshold;
        const normalizedConfidence = (avgConfidence - this.config.minConfidenceThreshold) / confidenceRange;
        const boost = normalizedConfidence * this.config.maxConfidenceBoost;

        return boost;
    }

    /**
     * Calculate skill match score between agent and task
     * @param {string} agentName - Agent name
     * @param {Array} taskSkills - Skills required for task
     * @returns {number} Match score (0-1)
     */
    getSkillMatchScore(agentName, taskSkills) {
        if (taskSkills.length === 0) return 0;

        const agentSkills = this.getAgentSkills(agentName);
        const matchingSkills = taskSkills.filter(s => agentSkills.includes(s));

        return matchingSkills.length / taskSkills.length;
    }

    /**
     * Select best agent for a task
     * @param {string} taskDescription - Task description
     * @param {Array} candidates - Array of candidate agents with baseScore
     * @returns {Object} Selected agent with enhanced score
     */
    selectAgent(taskDescription, candidates) {
        if (!candidates || candidates.length === 0) {
            return null;
        }

        const taskSkills = this.detectTaskSkills(taskDescription);

        if (this.verbose) {
            console.log(`[SKILL_ROUTER] Detected task skills: ${taskSkills.join(', ')}`);
        }

        // Calculate enhanced scores for each candidate
        const scoredCandidates = candidates.map(candidate => {
            const agentName = candidate.name || candidate.agent || candidate;
            const baseScore = candidate.baseScore || candidate.score || 0.5;

            // Get skill-based enhancements
            const confidenceBoost = this.getSkillConfidenceBoost(agentName, taskSkills);
            const matchScore = this.getSkillMatchScore(agentName, taskSkills);

            // Calculate weighted score
            const weightedBaseScore = baseScore * this.config.baseScoreWeight;
            const weightedSkillScore = matchScore * this.config.skillWeight;
            const enhancedScore = weightedBaseScore + weightedSkillScore + confidenceBoost;

            return {
                name: agentName,
                baseScore: baseScore,
                confidenceBoost: confidenceBoost,
                matchScore: matchScore,
                enhancedScore: enhancedScore,
                matchingSkills: taskSkills.filter(s => this.getAgentSkills(agentName).includes(s)),
                agentSkills: this.getAgentSkills(agentName)
            };
        });

        // Sort by enhanced score (descending)
        scoredCandidates.sort((a, b) => b.enhancedScore - a.enhancedScore);

        if (this.verbose) {
            console.log('[SKILL_ROUTER] Ranked candidates:');
            scoredCandidates.slice(0, 5).forEach((c, i) => {
                console.log(`  ${i + 1}. ${c.name}: ${c.enhancedScore.toFixed(3)} (base: ${c.baseScore.toFixed(2)}, boost: ${c.confidenceBoost.toFixed(3)}, match: ${c.matchScore.toFixed(2)})`);
            });
        }

        return scoredCandidates[0];
    }

    /**
     * Get routing recommendation with explanation
     * @param {string} taskDescription - Task description
     * @param {Array} candidates - Candidate agents
     * @returns {Object} Recommendation with reasoning
     */
    getRoutingRecommendation(taskDescription, candidates) {
        const selected = this.selectAgent(taskDescription, candidates);

        if (!selected) {
            return {
                recommended: null,
                confidence: 0,
                reasoning: 'No candidates provided'
            };
        }

        const taskSkills = this.detectTaskSkills(taskDescription);

        return {
            recommended: selected.name,
            confidence: selected.enhancedScore,
            baseScore: selected.baseScore,
            confidenceBoost: selected.confidenceBoost,
            skillMatchScore: selected.matchScore,
            taskSkillsDetected: taskSkills,
            matchingSkills: selected.matchingSkills,
            agentSkills: selected.agentSkills,
            reasoning: this._generateReasoning(selected, taskSkills)
        };
    }

    /**
     * Generate human-readable reasoning
     */
    _generateReasoning(selected, taskSkills) {
        const parts = [];

        if (selected.matchingSkills.length > 0) {
            parts.push(`Agent has ${selected.matchingSkills.length} matching skill(s): ${selected.matchingSkills.join(', ')}`);
        }

        if (selected.confidenceBoost > 0) {
            parts.push(`Skill confidence boost: +${(selected.confidenceBoost * 100).toFixed(1)}%`);
        } else if (selected.confidenceBoost < 0) {
            parts.push(`Low skill confidence penalty: ${(selected.confidenceBoost * 100).toFixed(1)}%`);
        }

        if (taskSkills.length === 0) {
            parts.push('No specific skills detected in task - using base score only');
        }

        return parts.join('. ');
    }

    /**
     * Get skill analysis for a task
     * @param {string} taskDescription - Task description
     * @returns {Object} Skill analysis
     */
    analyzeTask(taskDescription) {
        const detectedSkills = this.detectTaskSkills(taskDescription);
        const skillDetails = detectedSkills.map(skillId => {
            const confidence = this.skillTracker ?
                this.skillTracker.getSkillConfidence(skillId) :
                { confidence: 0.5, level: 'unknown' };

            return {
                skillId,
                confidence: confidence.confidence,
                level: confidence.level,
                trend: confidence.trend,
                totalExecutions: confidence.totalExecutions
            };
        });

        return {
            taskDescription: taskDescription.substring(0, 100),
            detectedSkills: detectedSkills,
            skillDetails: skillDetails,
            recommendedCategory: this._inferCategory(detectedSkills),
            complexity: this._estimateComplexity(detectedSkills)
        };
    }

    /**
     * Infer task category from skills
     */
    _inferCategory(skills) {
        const categoryScores = {};

        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            const categorySkills = Object.keys(categoryData.skills || {});
            const matches = skills.filter(s => categorySkills.includes(s));
            categoryScores[category] = matches.length;
        }

        const sorted = Object.entries(categoryScores)
            .sort((a, b) => b[1] - a[1])
            .filter(([_, count]) => count > 0);

        return sorted.length > 0 ? sorted[0][0] : 'general';
    }

    /**
     * Estimate task complexity from skills
     */
    _estimateComplexity(skills) {
        // More skills = more complex
        if (skills.length === 0) return 'simple';
        if (skills.length <= 2) return 'moderate';
        if (skills.length <= 4) return 'complex';
        return 'highly-complex';
    }

    /**
     * Get agents ranked by skill fit for a task
     * @param {string} taskDescription - Task description
     * @param {number} limit - Max results
     * @returns {Array} Ranked agents
     */
    getAgentRankings(taskDescription, limit = 10) {
        const taskSkills = this.detectTaskSkills(taskDescription);

        // Get all unique agents from skill registry
        const allAgents = new Set();
        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            for (const [skillId, skillDef] of Object.entries(categoryData.skills || {})) {
                (skillDef.agents || []).forEach(a => allAgents.add(a));
            }
        }

        // Create candidates with default scores
        const candidates = Array.from(allAgents).map(name => ({
            name,
            baseScore: 0.5
        }));

        // Get scored list
        const selected = this.selectAgent(taskDescription, candidates);

        // Re-score all and return top N
        return candidates
            .map(c => {
                const matchScore = this.getSkillMatchScore(c.name, taskSkills);
                const boost = this.getSkillConfidenceBoost(c.name, taskSkills);
                return {
                    name: c.name,
                    matchScore,
                    confidenceBoost: boost,
                    totalScore: matchScore + boost,
                    matchingSkills: taskSkills.filter(s => this.getAgentSkills(c.name).includes(s))
                };
            })
            .filter(c => c.matchScore > 0 || c.matchingSkills.length > 0)
            .sort((a, b) => b.totalScore - a.totalScore)
            .slice(0, limit);
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const router = new SkillAwareRouter({ verbose: true });

    switch (command) {
        case 'analyze':
            const taskDesc = args.slice(1).join(' ');
            if (!taskDesc) {
                console.error('Usage: skill-aware-router analyze <task description>');
                process.exit(1);
            }
            console.log(JSON.stringify(router.analyzeTask(taskDesc), null, 2));
            break;

        case 'rank':
            const rankTask = args.slice(1).join(' ');
            if (!rankTask) {
                console.error('Usage: skill-aware-router rank <task description>');
                process.exit(1);
            }
            console.log(JSON.stringify(router.getAgentRankings(rankTask), null, 2));
            break;

        case 'recommend':
            const recTask = args.slice(1).join(' ');
            if (!recTask) {
                console.error('Usage: skill-aware-router recommend <task description>');
                process.exit(1);
            }

            // Get rankings as candidates
            const rankings = router.getAgentRankings(recTask, 20);
            const candidates = rankings.map(r => ({ name: r.name, baseScore: 0.5 }));
            const recommendation = router.getRoutingRecommendation(recTask, candidates);
            console.log(JSON.stringify(recommendation, null, 2));
            break;

        default:
            console.log(`
Skill-Aware Agent Router - Confidence-based agent routing

Usage:
  skill-aware-router analyze <task>     Analyze task for skills
  skill-aware-router rank <task>        Get ranked agents for task
  skill-aware-router recommend <task>   Get routing recommendation

Examples:
  skill-aware-router analyze "Run CPQ assessment for production org"
  skill-aware-router rank "Deploy validation rules to production"
  skill-aware-router recommend "Create a new flow for lead assignment"
            `);
    }
}

module.exports = { SkillAwareRouter };
