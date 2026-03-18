#!/usr/bin/env node
/**
 * ACE Skill Aggregator
 *
 * Retroactively analyzes historical reflections from Supabase to:
 * 1. Extract skill usage patterns
 * 2. Calculate success/failure rates
 * 3. Identify skill improvements and new skills discovered
 * 4. Generate/update skill-data.json for ACE learning
 *
 * Usage:
 *   node ace-skill-aggregator.js analyze    - Analyze without updating
 *   node ace-skill-aggregator.js update     - Analyze and update skill-data.json
 *   node ace-skill-aggregator.js --days 90  - Analyze last 90 days (default: 180)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = 'https://REDACTED_SUPABASE_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'REDACTED_SUPABASE_ANON_KEY';

// Resolve plugin root - prefer __dirname resolution for accuracy
// CLAUDE_PLUGIN_ROOT may point to parent repo, not specific plugin
function resolvePluginRoot() {
    const fromDirname = path.resolve(__dirname, '../..');
    const fromEnv = process.env.CLAUDE_PLUGIN_ROOT;

    // If env var is set and appears to be this plugin's directory, use it
    if (fromEnv && fromEnv.endsWith('opspal-core')) {
        return fromEnv;
    }

    // Otherwise use __dirname resolution (more reliable)
    return fromDirname;
}

const PLUGIN_ROOT = resolvePluginRoot();
const SKILL_DATA_PATH = path.join(PLUGIN_ROOT, 'config', 'skill-data.json');
const SKILL_REGISTRY_PATH = path.join(PLUGIN_ROOT, 'config', 'skill-registry.json');

class ACESkillAggregator {
    constructor(options = {}) {
        this.days = options.days || 180;
        this.verbose = options.verbose || false;
    }

    async fetchReflections() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.days);
        const cutoffISO = cutoffDate.toISOString();

        const url = `${SUPABASE_URL}/rest/v1/reflections?select=id,created_at,data&created_at=gte.${cutoffISO}&order=created_at.desc`;

        return new Promise((resolve, reject) => {
            const options = {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            };

            const req = https.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    analyzeReflections(reflections) {
        const stats = {
            total_reflections: reflections.length,
            with_skills_data: 0,
            analysis_window_days: this.days,
            analyzed_at: new Date().toISOString(),

            // Skill usage tracking
            skill_usage: {},
            skill_feedback: {},

            // New skills discovered
            new_skills_discovered: [],

            // Skill improvements suggested
            skill_improvements: [],

            // Error patterns by skill
            error_patterns: {},

            // Session outcomes
            outcomes: { success: 0, partial: 0, failure: 0, blocked: 0, unknown: 0 }
        };

        for (const reflection of reflections) {
            if (!reflection.data) continue;

            const data = reflection.data;

            // Track outcomes
            const outcome = data.outcome || 'unknown';
            stats.outcomes[outcome] = (stats.outcomes[outcome] || 0) + 1;

            // Extract skills data (handle both old and new formats)
            const skillsData = data.skills || {};
            const skillsUsed = skillsData.skills_used || data.skills_used || [];
            const skillFeedback = skillsData.skill_feedback || data.skill_feedback || {};
            const newSkills = skillsData.new_skills_discovered || data.new_skills_discovered || [];
            const improvements = skillsData.skill_improvements || data.skill_improvements || [];

            if (skillsUsed.length > 0 || Object.keys(skillFeedback).length > 0) {
                stats.with_skills_data++;
            }

            // Aggregate skill usage
            for (const skill of skillsUsed) {
                if (!stats.skill_usage[skill]) {
                    stats.skill_usage[skill] = { count: 0, sessions: [] };
                }
                stats.skill_usage[skill].count++;
                stats.skill_usage[skill].sessions.push({
                    reflection_id: reflection.id,
                    date: reflection.created_at
                });
            }

            // Aggregate skill feedback
            for (const [skill, feedback] of Object.entries(skillFeedback)) {
                if (!stats.skill_feedback[skill]) {
                    stats.skill_feedback[skill] = {
                        success: 0,
                        failure: 0,
                        notes: [],
                        error_types: {}
                    };
                }

                if (feedback.success) {
                    stats.skill_feedback[skill].success++;
                } else {
                    stats.skill_feedback[skill].failure++;
                    if (feedback.error_type) {
                        const errorType = feedback.error_type;
                        stats.skill_feedback[skill].error_types[errorType] =
                            (stats.skill_feedback[skill].error_types[errorType] || 0) + 1;
                    }
                }

                if (feedback.notes) {
                    stats.skill_feedback[skill].notes.push(feedback.notes);
                }
            }

            // Collect new skills discovered
            for (const newSkill of newSkills) {
                stats.new_skills_discovered.push({
                    ...newSkill,
                    discovered_in: reflection.id,
                    discovered_at: reflection.created_at
                });
            }

            // Collect skill improvements
            for (const improvement of improvements) {
                stats.skill_improvements.push({
                    ...improvement,
                    suggested_in: reflection.id,
                    suggested_at: reflection.created_at
                });
            }

            // Extract error patterns
            const issues = data.issues || data.issues_identified || [];
            for (const issue of issues) {
                if (issue.taxonomy) {
                    if (!stats.error_patterns[issue.taxonomy]) {
                        stats.error_patterns[issue.taxonomy] = { count: 0, examples: [] };
                    }
                    stats.error_patterns[issue.taxonomy].count++;
                    if (stats.error_patterns[issue.taxonomy].examples.length < 5) {
                        stats.error_patterns[issue.taxonomy].examples.push({
                            root_cause: issue.root_cause,
                            priority: issue.priority
                        });
                    }
                }
            }
        }

        return stats;
    }

    calculateSkillConfidence(stats) {
        const skillConfidence = {};

        for (const [skill, feedback] of Object.entries(stats.skill_feedback)) {
            const total = feedback.success + feedback.failure;
            if (total === 0) continue;

            const successRate = feedback.success / total;
            const usage = stats.skill_usage[skill]?.count || 0;

            // Confidence formula: success_rate * min(1, usage/10)
            // More usage = more confidence in the rate
            const usageFactor = Math.min(1, usage / 10);
            const confidence = successRate * usageFactor;

            skillConfidence[skill] = {
                success_rate: (successRate * 100).toFixed(1) + '%',
                total_uses: total,
                confidence_score: confidence.toFixed(3),
                confidence_level: confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low',
                common_errors: Object.entries(feedback.error_types)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([type, count]) => ({ type, count }))
            };
        }

        return skillConfidence;
    }

    generateSkillData(stats) {
        const skillConfidence = this.calculateSkillConfidence(stats);

        // Deduplicate new skills discovered
        const uniqueNewSkills = [];
        const seenNames = new Set();
        for (const skill of stats.new_skills_discovered) {
            if (!seenNames.has(skill.name)) {
                seenNames.add(skill.name);
                uniqueNewSkills.push(skill);
            }
        }

        // Deduplicate improvements by skill_id
        const improvementsBySkill = {};
        for (const improvement of stats.skill_improvements) {
            const key = improvement.skill_id;
            if (!improvementsBySkill[key]) {
                improvementsBySkill[key] = improvement;
            }
        }

        return {
            version: '1.0.0',
            generated_at: new Date().toISOString(),
            analysis_window_days: stats.analysis_window_days,
            total_reflections_analyzed: stats.total_reflections,
            reflections_with_skill_data: stats.with_skills_data,

            session_outcomes: stats.outcomes,

            skill_confidence: skillConfidence,

            top_skills: Object.entries(stats.skill_usage)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 20)
                .map(([skill, data]) => ({
                    skill,
                    usage_count: data.count,
                    confidence: skillConfidence[skill]?.confidence_level || 'unknown'
                })),

            error_patterns: Object.entries(stats.error_patterns)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([taxonomy, data]) => ({
                    taxonomy,
                    occurrence_count: data.count,
                    examples: data.examples.slice(0, 3)
                })),

            new_skills_discovered: uniqueNewSkills.slice(0, 20),

            pending_improvements: Object.values(improvementsBySkill).slice(0, 20),

            recommendations: this.generateRecommendations(stats, skillConfidence)
        };
    }

    generateRecommendations(stats, skillConfidence) {
        const recommendations = [];

        // Low confidence skills
        const lowConfidenceSkills = Object.entries(skillConfidence)
            .filter(([_, data]) => data.confidence_level === 'low')
            .map(([skill, data]) => ({ skill, ...data }));

        if (lowConfidenceSkills.length > 0) {
            recommendations.push({
                type: 'skill_improvement',
                priority: 'high',
                message: `${lowConfidenceSkills.length} skills have low confidence and need improvement`,
                skills: lowConfidenceSkills.slice(0, 5).map(s => s.skill)
            });
        }

        // High error patterns
        const highErrorPatterns = Object.entries(stats.error_patterns)
            .filter(([_, data]) => data.count >= 5)
            .sort((a, b) => b[1].count - a[1].count);

        if (highErrorPatterns.length > 0) {
            recommendations.push({
                type: 'error_pattern',
                priority: 'high',
                message: `Recurring error patterns detected that should be addressed`,
                patterns: highErrorPatterns.slice(0, 3).map(([taxonomy, data]) => ({
                    taxonomy,
                    occurrences: data.count
                }))
            });
        }

        // New skills to formalize
        if (stats.new_skills_discovered.length >= 3) {
            recommendations.push({
                type: 'skill_formalization',
                priority: 'medium',
                message: `${stats.new_skills_discovered.length} new skill patterns discovered - consider adding to skill registry`,
                count: stats.new_skills_discovered.length
            });
        }

        return recommendations;
    }

    async run(command = 'analyze') {
        console.log('═'.repeat(60));
        console.log('  ACE SKILL AGGREGATOR');
        console.log('═'.repeat(60));
        console.log();

        console.log(`📥 Fetching reflections from last ${this.days} days...`);
        const reflections = await this.fetchReflections();
        console.log(`   Found ${reflections.length} reflections\n`);

        console.log('🔍 Analyzing skill usage patterns...');
        const stats = this.analyzeReflections(reflections);
        console.log(`   Reflections with skill data: ${stats.with_skills_data}`);
        console.log(`   Unique skills used: ${Object.keys(stats.skill_usage).length}`);
        console.log(`   New skills discovered: ${stats.new_skills_discovered.length}`);
        console.log(`   Improvement suggestions: ${stats.skill_improvements.length}\n`);

        console.log('📊 Session Outcomes:');
        for (const [outcome, count] of Object.entries(stats.outcomes)) {
            if (count > 0) {
                const pct = ((count / stats.total_reflections) * 100).toFixed(1);
                console.log(`   ${outcome}: ${count} (${pct}%)`);
            }
        }
        console.log();

        const skillData = this.generateSkillData(stats);

        console.log('📈 Top Skills by Usage:');
        for (const skill of skillData.top_skills.slice(0, 10)) {
            const conf = skillData.skill_confidence[skill.skill];
            const rate = conf ? conf.success_rate : 'N/A';
            console.log(`   ${skill.skill}: ${skill.usage_count} uses (${rate} success)`);
        }
        console.log();

        if (skillData.recommendations.length > 0) {
            console.log('💡 Recommendations:');
            for (const rec of skillData.recommendations) {
                console.log(`   [${rec.priority.toUpperCase()}] ${rec.message}`);
            }
            console.log();
        }

        if (command === 'update') {
            console.log(`💾 Saving skill data to: ${SKILL_DATA_PATH}`);
            // Ensure config directory exists
            const configDir = path.dirname(SKILL_DATA_PATH);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(SKILL_DATA_PATH, JSON.stringify(skillData, null, 2));
            console.log('   ✅ Skill data updated!\n');
        } else {
            console.log('ℹ️  Run with "update" command to save skill-data.json\n');
        }

        console.log('─'.repeat(60));
        console.log('Summary:');
        console.log(`  Total reflections analyzed: ${stats.total_reflections}`);
        console.log(`  With skill data: ${stats.with_skills_data}`);
        console.log(`  Success rate overall: ${((stats.outcomes.success / stats.total_reflections) * 100).toFixed(1)}%`);
        console.log('─'.repeat(60));

        return skillData;
    }
}

// CLI
async function main() {
    const args = process.argv.slice(2);
    const command = args.find(a => !a.startsWith('--')) || 'analyze';
    const daysArg = args.find(a => a.startsWith('--days='));
    const days = daysArg ? parseInt(daysArg.split('=')[1]) : 180;
    const verbose = args.includes('--verbose');

    const aggregator = new ACESkillAggregator({ days, verbose });

    try {
        await aggregator.run(command);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
