#!/usr/bin/env node

/**
 * Reflection Skill Analyzer - Auto-populate skill fields in reflections
 *
 * Analyzes reflection data to:
 * 1. Auto-detect skills used from agent/tool invocations
 * 2. Infer skill success/failure from reflection outcomes
 * 3. Populate skills_used and skill_feedback fields
 * 4. Backfill existing reflections with inferred skill data
 *
 * @version 1.0.0
 * @date 2025-12-10
 */

const fs = require('fs');
const path = require('path');

// Try to load SkillTracker from cross-platform-plugin
let SkillTracker;
try {
    const skillTrackerPath = path.join(__dirname, '../../../../opspal-core/cross-platform-plugin/scripts/lib/skill-tracker.js');
    SkillTracker = require(skillTrackerPath).SkillTracker;
} catch (e) {
    // Fallback - create minimal implementation
    SkillTracker = null;
}

class ReflectionSkillAnalyzer {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.skillTracker = SkillTracker ? new SkillTracker({ verbose: this.verbose }) : null;

        // Load skill registry directly if tracker not available
        this.skillRegistry = this._loadSkillRegistry(options.skillRegistryPath);

        // Keyword to skill mapping for detection
        this.keywordSkillMap = this._buildKeywordMap();

        // Agent to skill mapping
        this.agentSkillMap = this._buildAgentMap();
    }

    /**
     * Load skill registry
     */
    _loadSkillRegistry(customPath) {
        const registryPath = customPath || path.join(
            __dirname,
            '../../../../opspal-core/cross-platform-plugin/config/skill-registry.json'
        );

        try {
            if (fs.existsSync(registryPath)) {
                return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            }
        } catch (error) {
            if (this.verbose) {
                console.error(`[SKILL_ANALYZER] Failed to load registry: ${error.message}`);
            }
        }
        return { skillCategories: {} };
    }

    /**
     * Build keyword to skill mapping
     */
    _buildKeywordMap() {
        const map = {};

        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            for (const [skillId, skillDef] of Object.entries(categoryData.skills || {})) {
                for (const keyword of (skillDef.keywords || [])) {
                    const normalizedKeyword = keyword.toLowerCase();
                    if (!map[normalizedKeyword]) {
                        map[normalizedKeyword] = [];
                    }
                    map[normalizedKeyword].push(skillId);
                }
            }
        }

        return map;
    }

    /**
     * Build agent to skill mapping
     */
    _buildAgentMap() {
        const map = {};

        for (const [category, categoryData] of Object.entries(this.skillRegistry.skillCategories || {})) {
            for (const [skillId, skillDef] of Object.entries(categoryData.skills || {})) {
                for (const agent of (skillDef.agents || [])) {
                    if (!map[agent]) {
                        map[agent] = [];
                    }
                    map[agent].push(skillId);
                }
            }
        }

        return map;
    }

    /**
     * Analyze a reflection and detect skills used
     * @param {Object} reflection - Reflection data
     * @returns {Object} Analysis result with skills_used and skill_feedback
     */
    analyzeReflection(reflection) {
        const detectedSkills = new Set();
        const skillFeedback = {};

        // 1. Detect from focus_area
        if (reflection.focus_area) {
            const focusSkills = this._detectFromText(reflection.focus_area);
            focusSkills.forEach(s => detectedSkills.add(s));
        }

        // 2. Detect from summary
        if (reflection.data?.summary) {
            const summarySkills = this._detectFromText(reflection.data.summary);
            summarySkills.forEach(s => detectedSkills.add(s));
        }

        // 3. Detect from issues identified
        if (reflection.data?.issues_identified) {
            for (const issue of reflection.data.issues_identified) {
                // Detect from taxonomy
                if (issue.taxonomy) {
                    const taxonomySkills = this._detectFromTaxonomy(issue.taxonomy);
                    taxonomySkills.forEach(s => detectedSkills.add(s));
                }

                // Detect from root cause
                if (issue.root_cause) {
                    const rcSkills = this._detectFromText(issue.root_cause);
                    rcSkills.forEach(s => detectedSkills.add(s));
                }

                // Detect from affected components
                if (issue.affected_components) {
                    for (const component of issue.affected_components) {
                        const compSkills = this._detectFromText(component);
                        compSkills.forEach(s => detectedSkills.add(s));
                    }
                }
            }
        }

        // 4. Detect from wiring recommendations
        if (reflection.data?.wiring_recommendations) {
            const wiring = reflection.data.wiring_recommendations;

            // Detect from agent recommendations
            if (wiring.agents) {
                for (const agentRec of wiring.agents) {
                    if (agentRec.name && this.agentSkillMap[agentRec.name]) {
                        this.agentSkillMap[agentRec.name].forEach(s => detectedSkills.add(s));
                    }
                }
            }

            // Detect from tool recommendations
            if (wiring.tools) {
                for (const tool of wiring.tools) {
                    const toolSkills = this._detectFromText(tool.name || tool.purpose || '');
                    toolSkills.forEach(s => detectedSkills.add(s));
                }
            }
        }

        // 5. Detect from playbook
        if (reflection.data?.playbook && Array.isArray(reflection.data.playbook)) {
            for (const play of reflection.data.playbook) {
                const playSkills = this._detectFromText(play.name || '');
                playSkills.forEach(s => detectedSkills.add(s));

                if (play.steps && Array.isArray(play.steps)) {
                    for (const step of play.steps) {
                        const stepSkills = this._detectFromText(typeof step === 'string' ? step : step.description || '');
                        stepSkills.forEach(s => detectedSkills.add(s));
                    }
                }
            }
        }

        // 6. Infer skill outcomes from reflection outcome
        const skillsArray = Array.from(detectedSkills);
        const sessionSuccess = this._inferSessionSuccess(reflection);

        for (const skillId of skillsArray) {
            // Check if any issue directly relates to this skill
            const skillIssue = this._findSkillIssue(reflection, skillId);

            if (skillIssue) {
                // Skill had an issue - mark as failed
                skillFeedback[skillId] = {
                    success: false,
                    error_type: this._mapTaxonomyToErrorType(skillIssue.taxonomy),
                    notes: skillIssue.root_cause?.substring(0, 200),
                    inferred: true
                };
            } else {
                // No specific issue - infer from overall outcome
                skillFeedback[skillId] = {
                    success: sessionSuccess,
                    error_type: sessionSuccess ? null : 'unknown',
                    notes: sessionSuccess ? null : 'Inferred from session outcome',
                    inferred: true
                };
            }
        }

        return {
            skills_used: skillsArray,
            skill_feedback: skillFeedback,
            detection_metadata: {
                analyzed_at: new Date().toISOString(),
                skills_detected: skillsArray.length,
                detection_sources: this._getDetectionSources(reflection),
                session_success_inferred: sessionSuccess
            }
        };
    }

    /**
     * Detect skills from text using keyword matching
     */
    _detectFromText(text) {
        if (!text) return [];

        const normalizedText = text.toLowerCase();
        const detected = new Set();

        for (const [keyword, skillIds] of Object.entries(this.keywordSkillMap)) {
            if (normalizedText.includes(keyword)) {
                skillIds.forEach(s => detected.add(s));
            }
        }

        return Array.from(detected);
    }

    /**
     * Detect skills from issue taxonomy
     */
    _detectFromTaxonomy(taxonomy) {
        const taxonomySkillMap = {
            'agent_routing': ['agent-selection'],
            'tool-contract': ['pre-deploy-check', 'field-validation'],
            'external-api': ['api-integration'],
            'prompt-mismatch': ['prompt-tuning'],
            'idempotency/state': ['metadata-deploy', 'flow-deploy'],
            'script-dependencies': ['dependency-check'],
            'command-execution': ['cli-execution'],
            'documentation-gap': ['documentation'],
            'supabase-schema': ['data-validation'],
            'config/env': ['configuration'],
            'data-quality': ['data-validation', 'data-export'],
            'schema/parse': ['syntax-validation', 'field-validation']
        };

        return taxonomySkillMap[taxonomy] || [];
    }

    /**
     * Map taxonomy to error type
     */
    _mapTaxonomyToErrorType(taxonomy) {
        const map = {
            'agent_routing': 'tool-contract',
            'tool-contract': 'tool-contract',
            'external-api': 'api-failure',
            'prompt-mismatch': 'tool-contract',
            'idempotency/state': 'data-quality',
            'script-dependencies': 'dependency-missing',
            'command-execution': 'tool-contract',
            'documentation-gap': 'unknown',
            'supabase-schema': 'validation-failure',
            'config/env': 'validation-failure',
            'data-quality': 'data-quality',
            'schema/parse': 'validation-failure'
        };

        return map[taxonomy] || 'unknown';
    }

    /**
     * Infer session success from reflection data
     */
    _inferSessionSuccess(reflection) {
        // Check explicit outcome
        if (reflection.outcome) {
            const outcome = reflection.outcome.toLowerCase();
            if (outcome.includes('success') || outcome.includes('complete')) {
                return true;
            }
            if (outcome.includes('fail') || outcome.includes('error') || outcome.includes('blocked')) {
                return false;
            }
        }

        // Check issue count and priorities
        const issues = reflection.data?.issues_identified || [];
        if (issues.length === 0) {
            return true; // No issues = success
        }

        // Check for critical issues
        const criticalIssues = issues.filter(i =>
            i.priority === 'P0' || i.blast_radius === 'HIGH'
        );

        if (criticalIssues.length > 0) {
            return false;
        }

        // Default to partial success if there are issues but none critical
        return true;
    }

    /**
     * Find if any issue directly relates to a skill
     */
    _findSkillIssue(reflection, skillId) {
        const issues = reflection.data?.issues_identified || [];

        for (const issue of issues) {
            const issueSkills = [
                ...this._detectFromTaxonomy(issue.taxonomy || ''),
                ...this._detectFromText(issue.root_cause || ''),
                ...this._detectFromText(issue.title || '')
            ];

            if (issueSkills.includes(skillId)) {
                return issue;
            }
        }

        return null;
    }

    /**
     * Get detection sources for metadata
     */
    _getDetectionSources(reflection) {
        const sources = [];

        if (reflection.focus_area) sources.push('focus_area');
        if (reflection.data?.summary) sources.push('summary');
        if (reflection.data?.issues_identified?.length) sources.push('issues');
        if (reflection.data?.wiring_recommendations) sources.push('wiring');
        if (reflection.data?.playbook?.length) sources.push('playbook');

        return sources;
    }

    /**
     * Analyze multiple reflections
     * @param {Array} reflections - Array of reflections
     * @returns {Array} Array of analysis results with reflection IDs
     */
    analyzeMultiple(reflections) {
        return reflections.map(reflection => ({
            reflection_id: reflection.id,
            org: reflection.org,
            created_at: reflection.created_at,
            ...this.analyzeReflection(reflection)
        }));
    }

    /**
     * Generate backfill update for a reflection
     * @param {Object} reflection - Original reflection
     * @returns {Object} Update payload for Supabase
     */
    generateBackfillUpdate(reflection) {
        const analysis = this.analyzeReflection(reflection);

        // Merge with existing data if present
        const existingSkills = reflection.skills_used || [];
        const existingFeedback = reflection.skill_feedback || {};

        const mergedSkills = [...new Set([...existingSkills, ...analysis.skills_used])];
        const mergedFeedback = { ...existingFeedback, ...analysis.skill_feedback };

        return {
            id: reflection.id,
            skills_used: mergedSkills,
            skill_feedback: mergedFeedback,
            // Store in data if present
            data: reflection.data ? {
                ...reflection.data,
                _skill_analysis: analysis.detection_metadata
            } : undefined
        };
    }

    /**
     * Generate summary statistics from analysis
     * @param {Array} analyses - Array of analysis results
     * @returns {Object} Summary statistics
     */
    generateSummary(analyses) {
        const skillCounts = {};
        const skillSuccesses = {};
        const skillFailures = {};

        for (const analysis of analyses) {
            for (const skillId of analysis.skills_used) {
                skillCounts[skillId] = (skillCounts[skillId] || 0) + 1;

                const feedback = analysis.skill_feedback[skillId];
                if (feedback) {
                    if (feedback.success) {
                        skillSuccesses[skillId] = (skillSuccesses[skillId] || 0) + 1;
                    } else {
                        skillFailures[skillId] = (skillFailures[skillId] || 0) + 1;
                    }
                }
            }
        }

        // Calculate success rates
        const skillStats = Object.keys(skillCounts).map(skillId => ({
            skillId,
            totalUses: skillCounts[skillId],
            successes: skillSuccesses[skillId] || 0,
            failures: skillFailures[skillId] || 0,
            successRate: (skillSuccesses[skillId] || 0) / skillCounts[skillId]
        }));

        // Sort by usage
        skillStats.sort((a, b) => b.totalUses - a.totalUses);

        return {
            totalReflectionsAnalyzed: analyses.length,
            uniqueSkillsDetected: Object.keys(skillCounts).length,
            totalSkillUsages: Object.values(skillCounts).reduce((a, b) => a + b, 0),
            averageSkillsPerReflection: Object.values(skillCounts).reduce((a, b) => a + b, 0) / analyses.length,
            topSkills: skillStats.slice(0, 10),
            lowestSuccessRateSkills: [...skillStats]
                .filter(s => s.totalUses >= 3) // At least 3 uses
                .sort((a, b) => a.successRate - b.successRate)
                .slice(0, 5),
            highestSuccessRateSkills: [...skillStats]
                .filter(s => s.totalUses >= 3)
                .sort((a, b) => b.successRate - a.successRate)
                .slice(0, 5)
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const analyzer = new ReflectionSkillAnalyzer({ verbose: true });

    switch (command) {
        case 'analyze':
            const filePath = args[1];
            if (!filePath) {
                console.error('Usage: reflection-skill-analyzer analyze <reflection.json>');
                process.exit(1);
            }

            try {
                const reflection = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const result = analyzer.analyzeReflection(reflection);
                console.log(JSON.stringify(result, null, 2));
            } catch (error) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
            break;

        case 'analyze-batch':
            const batchPath = args[1];
            if (!batchPath) {
                console.error('Usage: reflection-skill-analyzer analyze-batch <reflections.json>');
                process.exit(1);
            }

            try {
                const reflections = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
                const results = analyzer.analyzeMultiple(
                    Array.isArray(reflections) ? reflections : [reflections]
                );
                const summary = analyzer.generateSummary(results);

                console.log('=== Analysis Results ===');
                console.log(JSON.stringify({ summary, results }, null, 2));
            } catch (error) {
                console.error(`Error: ${error.message}`);
                process.exit(1);
            }
            break;

        case 'test':
            // Test with sample reflection
            const sampleReflection = {
                id: 'test-123',
                org: 'test-org',
                focus_area: 'cpq-assessment',
                outcome: 'partial success',
                data: {
                    summary: 'Ran CPQ assessment and found pricing issues',
                    issues_identified: [
                        {
                            taxonomy: 'data-quality',
                            priority: 'P1',
                            root_cause: 'Pricing rules not deployed correctly',
                            affected_components: ['SBQQ__PriceRule__c']
                        }
                    ],
                    wiring_recommendations: {
                        agents: [{ name: 'sfdc-cpq-assessor' }]
                    }
                }
            };

            const testResult = analyzer.analyzeReflection(sampleReflection);
            console.log('=== Test Analysis ===');
            console.log(JSON.stringify(testResult, null, 2));
            break;

        default:
            console.log(`
Reflection Skill Analyzer - Auto-populate skill fields in reflections

Usage:
  reflection-skill-analyzer analyze <file>        Analyze single reflection
  reflection-skill-analyzer analyze-batch <file>  Analyze multiple reflections
  reflection-skill-analyzer test                  Run test with sample data

Examples:
  reflection-skill-analyzer analyze ./reflection.json
  reflection-skill-analyzer analyze-batch ./reflections.json
  reflection-skill-analyzer test
            `);
    }
}

module.exports = { ReflectionSkillAnalyzer };
