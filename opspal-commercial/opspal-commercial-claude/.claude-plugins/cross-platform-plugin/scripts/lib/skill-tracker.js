#!/usr/bin/env node

/**
 * Skill Tracker - ACE Framework Skill Usage and Outcome Tracking
 *
 * Tracks skill usage during sessions, records outcomes (success/failure),
 * calculates skill confidence from historical feedback, and exports
 * data for reflection integration.
 *
 * @version 1.0.0
 * @date 2025-12-10
 */

const fs = require('fs');
const path = require('path');

class SkillTracker {
    constructor(options = {}) {
        this.skillRegistryPath = options.skillRegistryPath ||
            path.join(__dirname, '../../config/skill-registry.json');
        this.historyFile = options.historyFile ||
            path.join(process.env.HOME || '/tmp', '.claude/skill-history.jsonl');
        this.sessionFile = options.sessionFile ||
            path.join('/tmp', `skill-session-${Date.now()}.json`);
        this.verbose = options.verbose || false;

        // Session state
        this.sessionSkills = [];
        this.sessionFeedback = {};
        this.sessionStartTime = new Date().toISOString();

        // Load skill registry
        this.skillRegistry = this._loadSkillRegistry();

        // Ensure history directory exists
        this._ensureHistoryDir();
    }

    /**
     * Load the skill registry configuration
     * @returns {Object} Skill registry data
     */
    _loadSkillRegistry() {
        try {
            if (fs.existsSync(this.skillRegistryPath)) {
                const data = fs.readFileSync(this.skillRegistryPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[SKILL_TRACKER] Failed to load registry: ${error.message}`);
            }
        }
        return { skillCategories: {}, errorTypes: {}, confidenceLevels: {} };
    }

    /**
     * Ensure history directory exists
     */
    _ensureHistoryDir() {
        const dir = path.dirname(this.historyFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Validate if a skill ID exists in the registry
     * @param {string} skillId - Skill ID to validate
     * @returns {Object|null} Skill definition or null if not found
     */
    getSkillById(skillId) {
        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            if (categoryData.skills && categoryData.skills[skillId]) {
                return {
                    ...categoryData.skills[skillId],
                    id: skillId,
                    category: category
                };
            }
        }
        return null;
    }

    /**
     * Get all skills in a category
     * @param {string} category - Category name
     * @returns {Object} Skills in category
     */
    getSkillsByCategory(category) {
        const categoryData = this.skillRegistry.skillCategories?.[category];
        return categoryData?.skills || {};
    }

    /**
     * Get skills associated with an agent
     * @param {string} agentName - Agent name
     * @returns {Array} List of skill IDs
     */
    getSkillsByAgent(agentName) {
        const skills = [];
        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            for (const [skillId, skillDef] of Object.entries(categoryData.skills || {})) {
                if (skillDef.agents && skillDef.agents.includes(agentName)) {
                    skills.push(skillId);
                }
            }
        }
        return skills;
    }

    /**
     * Get skills matching a keyword
     * @param {string} keyword - Keyword to match
     * @returns {Array} List of matching skill IDs
     */
    getSkillsByKeyword(keyword) {
        const normalizedKeyword = keyword.toLowerCase();
        const skills = [];

        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            for (const [skillId, skillDef] of Object.entries(categoryData.skills || {})) {
                const keywords = skillDef.keywords || [];
                if (keywords.some(k => k.toLowerCase().includes(normalizedKeyword))) {
                    skills.push(skillId);
                }
            }
        }
        return skills;
    }

    /**
     * Track skill usage during session
     * @param {string} skillId - Skill ID being used
     * @param {Object} context - Context about the usage
     */
    trackSkillUsage(skillId, context = {}) {
        const skill = this.getSkillById(skillId);

        if (!skill && this.verbose) {
            console.warn(`[SKILL_TRACKER] Unknown skill ID: ${skillId}`);
        }

        // Add to session if not already tracked
        if (!this.sessionSkills.includes(skillId)) {
            this.sessionSkills.push(skillId);
        }

        // Initialize feedback entry if not exists
        if (!this.sessionFeedback[skillId]) {
            this.sessionFeedback[skillId] = {
                success: null, // Unknown until recorded
                error_type: null,
                notes: null,
                inferred: false,
                usageCount: 0,
                firstUsed: new Date().toISOString(),
                lastUsed: new Date().toISOString(),
                context: []
            };
        }

        // Update usage
        this.sessionFeedback[skillId].usageCount++;
        this.sessionFeedback[skillId].lastUsed = new Date().toISOString();
        if (context) {
            this.sessionFeedback[skillId].context.push({
                timestamp: new Date().toISOString(),
                ...context
            });
        }

        if (this.verbose) {
            console.log(`[SKILL_TRACKER] Tracked skill: ${skillId} (${skill?.displayName || 'unknown'})`);
        }

        return this;
    }

    /**
     * Record skill outcome (success/failure)
     * @param {string} skillId - Skill ID
     * @param {boolean} success - Whether skill executed successfully
     * @param {string} errorType - Type of error if failed
     * @param {string} notes - Additional notes
     */
    recordSkillOutcome(skillId, success, errorType = null, notes = null) {
        // Ensure skill is tracked
        if (!this.sessionSkills.includes(skillId)) {
            this.trackSkillUsage(skillId);
        }

        // Validate error type
        if (errorType && !this.skillRegistry.errorTypes?.[errorType]) {
            if (this.verbose) {
                console.warn(`[SKILL_TRACKER] Unknown error type: ${errorType}`);
            }
        }

        // Update feedback
        this.sessionFeedback[skillId] = {
            ...this.sessionFeedback[skillId],
            success: success,
            error_type: success ? null : (errorType || 'unknown'),
            notes: notes,
            inferred: false,
            outcomeRecordedAt: new Date().toISOString()
        };

        // Write to history
        this._appendToHistory({
            timestamp: new Date().toISOString(),
            skillId: skillId,
            success: success,
            errorType: errorType,
            notes: notes
        });

        if (this.verbose) {
            console.log(`[SKILL_TRACKER] Recorded outcome for ${skillId}: ${success ? 'SUCCESS' : 'FAILED'}`);
        }

        return this;
    }

    /**
     * Infer skill outcome from session outcome (when not explicitly recorded)
     * @param {boolean} sessionSuccess - Whether overall session was successful
     */
    inferOutcomesFromSession(sessionSuccess) {
        for (const skillId of this.sessionSkills) {
            if (this.sessionFeedback[skillId]?.success === null) {
                this.sessionFeedback[skillId].success = sessionSuccess;
                this.sessionFeedback[skillId].inferred = true;
                this.sessionFeedback[skillId].notes = `Inferred from session outcome: ${sessionSuccess ? 'success' : 'failure'}`;

                // Write inferred outcome to history
                this._appendToHistory({
                    timestamp: new Date().toISOString(),
                    skillId: skillId,
                    success: sessionSuccess,
                    inferred: true
                });
            }
        }

        if (this.verbose) {
            console.log(`[SKILL_TRACKER] Inferred outcomes for ${this.sessionSkills.length} skills`);
        }

        return this;
    }

    /**
     * Calculate skill confidence from historical feedback
     * @param {string} skillId - Skill ID
     * @returns {Object} Confidence data
     */
    getSkillConfidence(skillId) {
        const history = this._getSkillHistory(skillId);

        if (history.length === 0) {
            return {
                skillId: skillId,
                confidence: 0.5, // Default confidence for unknown skills
                level: 'medium',
                totalExecutions: 0,
                successes: 0,
                failures: 0,
                lastExecution: null,
                trend: 'unknown'
            };
        }

        const successes = history.filter(h => h.success).length;
        const failures = history.filter(h => !h.success).length;
        const total = history.length;
        const successRate = successes / total;

        // Calculate weighted confidence (recent executions weighted more)
        let weightedSuccess = 0;
        let totalWeight = 0;
        history.forEach((h, index) => {
            const weight = (index + 1) / history.length; // More recent = higher weight
            weightedSuccess += h.success ? weight : 0;
            totalWeight += weight;
        });
        const weightedConfidence = weightedSuccess / totalWeight;

        // Determine confidence level
        let level = 'medium';
        if (weightedConfidence >= 0.8) level = 'high';
        else if (weightedConfidence < 0.5) level = 'low';

        // Calculate trend (last 5 vs previous 5)
        let trend = 'stable';
        if (history.length >= 10) {
            const recent5 = history.slice(-5).filter(h => h.success).length / 5;
            const prev5 = history.slice(-10, -5).filter(h => h.success).length / 5;
            if (recent5 > prev5 + 0.2) trend = 'improving';
            else if (recent5 < prev5 - 0.2) trend = 'declining';
        }

        return {
            skillId: skillId,
            confidence: weightedConfidence,
            level: level,
            totalExecutions: total,
            successes: successes,
            failures: failures,
            successRate: successRate,
            lastExecution: history[history.length - 1]?.timestamp || null,
            trend: trend
        };
    }

    /**
     * Get all skill confidences
     * @returns {Object} Map of skillId -> confidence data
     */
    getAllSkillConfidences() {
        const confidences = {};
        const allHistory = this._loadAllHistory();

        // Get unique skill IDs from history
        const skillIds = [...new Set(allHistory.map(h => h.skillId))];

        for (const skillId of skillIds) {
            confidences[skillId] = this.getSkillConfidence(skillId);
        }

        return confidences;
    }

    /**
     * Export session data for reflection integration
     * @returns {Object} Data formatted for reflection schema
     */
    exportForReflection() {
        // Build skills_used array
        const skillsUsed = [...this.sessionSkills];

        // Build skill_feedback object
        const skillFeedback = {};
        for (const [skillId, feedback] of Object.entries(this.sessionFeedback)) {
            skillFeedback[skillId] = {
                success: feedback.success,
                error_type: feedback.error_type,
                notes: feedback.notes,
                inferred: feedback.inferred
            };
        }

        return {
            skills_used: skillsUsed,
            skill_feedback: skillFeedback,
            session_metadata: {
                startTime: this.sessionStartTime,
                endTime: new Date().toISOString(),
                totalSkillsUsed: skillsUsed.length,
                successfulSkills: Object.values(skillFeedback).filter(f => f.success).length,
                failedSkills: Object.values(skillFeedback).filter(f => f.success === false).length,
                unknownOutcomes: Object.values(skillFeedback).filter(f => f.success === null).length
            }
        };
    }

    /**
     * Reset session state
     */
    resetSession() {
        this.sessionSkills = [];
        this.sessionFeedback = {};
        this.sessionStartTime = new Date().toISOString();

        if (this.verbose) {
            console.log('[SKILL_TRACKER] Session reset');
        }

        return this;
    }

    /**
     * Get skill execution history
     * @param {string} skillId - Skill ID
     * @param {number} limit - Max records to return
     * @returns {Array} History records
     */
    _getSkillHistory(skillId, limit = 100) {
        const allHistory = this._loadAllHistory();
        return allHistory
            .filter(h => h.skillId === skillId)
            .slice(-limit);
    }

    /**
     * Load all history from JSONL file
     * @returns {Array} All history records
     */
    _loadAllHistory() {
        try {
            if (fs.existsSync(this.historyFile)) {
                const content = fs.readFileSync(this.historyFile, 'utf8');
                return content
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        try {
                            return JSON.parse(line);
                        } catch {
                            return null;
                        }
                    })
                    .filter(record => record !== null);
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[SKILL_TRACKER] Failed to load history: ${error.message}`);
            }
        }
        return [];
    }

    /**
     * Append record to history file
     * @param {Object} record - Record to append
     */
    _appendToHistory(record) {
        try {
            fs.appendFileSync(this.historyFile, JSON.stringify(record) + '\n');
        } catch (error) {
            if (this.verbose) {
                console.error(`[SKILL_TRACKER] Failed to append to history: ${error.message}`);
            }
        }
    }

    /**
     * Get summary statistics
     * @returns {Object} Summary stats
     */
    getStatistics() {
        const allHistory = this._loadAllHistory();
        const confidences = this.getAllSkillConfidences();

        const skillIds = Object.keys(confidences);
        const avgConfidence = skillIds.length > 0
            ? skillIds.reduce((sum, id) => sum + confidences[id].confidence, 0) / skillIds.length
            : 0;

        const highConfidenceSkills = skillIds.filter(id => confidences[id].level === 'high');
        const lowConfidenceSkills = skillIds.filter(id => confidences[id].level === 'low');

        return {
            totalHistoryRecords: allHistory.length,
            uniqueSkillsTracked: skillIds.length,
            averageConfidence: avgConfidence,
            highConfidenceCount: highConfidenceSkills.length,
            mediumConfidenceCount: skillIds.length - highConfidenceSkills.length - lowConfidenceSkills.length,
            lowConfidenceCount: lowConfidenceSkills.length,
            topSkills: highConfidenceSkills.slice(0, 5),
            bottomSkills: lowConfidenceSkills.slice(0, 5),
            currentSession: {
                skillsUsed: this.sessionSkills.length,
                outcomesRecorded: Object.values(this.sessionFeedback).filter(f => f.success !== null).length
            }
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const tracker = new SkillTracker({ verbose: true });

    switch (command) {
        case 'stats':
            console.log(JSON.stringify(tracker.getStatistics(), null, 2));
            break;

        case 'confidence':
            const skillId = args[1];
            if (skillId) {
                console.log(JSON.stringify(tracker.getSkillConfidence(skillId), null, 2));
            } else {
                console.log(JSON.stringify(tracker.getAllSkillConfidences(), null, 2));
            }
            break;

        case 'lookup':
            const lookupId = args[1];
            if (lookupId) {
                console.log(JSON.stringify(tracker.getSkillById(lookupId), null, 2));
            } else {
                console.error('Usage: skill-tracker lookup <skillId>');
            }
            break;

        case 'by-agent':
            const agentName = args[1];
            if (agentName) {
                console.log(JSON.stringify(tracker.getSkillsByAgent(agentName), null, 2));
            } else {
                console.error('Usage: skill-tracker by-agent <agentName>');
            }
            break;

        case 'by-keyword':
            const keyword = args[1];
            if (keyword) {
                console.log(JSON.stringify(tracker.getSkillsByKeyword(keyword), null, 2));
            } else {
                console.error('Usage: skill-tracker by-keyword <keyword>');
            }
            break;

        default:
            console.log(`
Skill Tracker - ACE Framework Skill Usage and Outcome Tracking

Usage:
  skill-tracker stats              Show statistics summary
  skill-tracker confidence [id]    Show confidence for skill(s)
  skill-tracker lookup <id>        Look up skill definition
  skill-tracker by-agent <name>    Get skills for an agent
  skill-tracker by-keyword <word>  Find skills by keyword

Examples:
  skill-tracker stats
  skill-tracker confidence cpq-assessment
  skill-tracker by-agent sfdc-revops-auditor
  skill-tracker by-keyword deploy
            `);
    }
}

module.exports = { SkillTracker };
