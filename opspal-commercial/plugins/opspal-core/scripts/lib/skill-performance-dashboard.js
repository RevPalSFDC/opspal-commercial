#!/usr/bin/env node

/**
 * Skill Performance Dashboard
 *
 * Analyzes skill usage and success rates from reflections data.
 * Generates actionable insights for skill improvement.
 *
 * Usage:
 *   node skill-performance-dashboard.js                    # Full report
 *   node skill-performance-dashboard.js --json             # JSON output
 *   node skill-performance-dashboard.js --top 10           # Top N skills
 *   node skill-performance-dashboard.js --threshold 0.5    # Skills below threshold
 *
 * Environment Variables:
 *   SUPABASE_URL       - Supabase project URL
 *   SUPABASE_ANON_KEY  - Supabase anon key
 */

const https = require('https');
const { URL } = require('url');

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// =============================================================================
// HTTP Helper
// =============================================================================

function makeRequest(url, options) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);

        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    data: data ? JSON.parse(data) : null
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchReflectionsWithSkills() {
    const url = `${SUPABASE_URL}/rest/v1/reflections?select=id,created_at,focus_area,outcome,data&order=created_at.desc`;

    const response = await makeRequest(url, {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch reflections: ${response.status}`);
    }

    return response.data;
}

// =============================================================================
// Analytics
// =============================================================================

function analyzeSkillPerformance(reflections) {
    const skillStats = {};
    const timeSeriesData = {};
    let totalReflections = 0;
    let reflectionsWithSkills = 0;

    for (const reflection of reflections) {
        totalReflections++;

        const skillsUsed = reflection.data?.skills_used || [];
        const skillFeedback = reflection.data?.skill_feedback || {};
        const createdDate = reflection.created_at?.substring(0, 10) || 'unknown';

        if (skillsUsed.length === 0) continue;
        reflectionsWithSkills++;

        // Track time series
        if (!timeSeriesData[createdDate]) {
            timeSeriesData[createdDate] = { total: 0, successes: 0, failures: 0 };
        }

        for (const skillId of skillsUsed) {
            if (!skillStats[skillId]) {
                skillStats[skillId] = {
                    skillId,
                    totalUses: 0,
                    successes: 0,
                    failures: 0,
                    errorTypes: {},
                    focusAreas: {},
                    firstSeen: createdDate,
                    lastSeen: createdDate
                };
            }

            const stats = skillStats[skillId];
            stats.totalUses++;
            stats.lastSeen = createdDate;

            // Track focus area distribution
            const focusArea = reflection.focus_area || 'unclassified';
            stats.focusAreas[focusArea] = (stats.focusAreas[focusArea] || 0) + 1;

            // Track success/failure from feedback
            const feedback = skillFeedback[skillId];
            if (feedback) {
                if (feedback.success) {
                    stats.successes++;
                    timeSeriesData[createdDate].successes++;
                } else {
                    stats.failures++;
                    timeSeriesData[createdDate].failures++;

                    // Track error types
                    const errorType = feedback.error_type || 'unknown';
                    stats.errorTypes[errorType] = (stats.errorTypes[errorType] || 0) + 1;
                }
            }

            timeSeriesData[createdDate].total++;
        }
    }

    // Calculate success rates
    for (const skillId of Object.keys(skillStats)) {
        const stats = skillStats[skillId];
        const totalWithFeedback = stats.successes + stats.failures;
        stats.successRate = totalWithFeedback > 0
            ? stats.successes / totalWithFeedback
            : null;
        stats.feedbackCoverage = stats.totalUses > 0
            ? totalWithFeedback / stats.totalUses
            : 0;
    }

    return {
        totalReflections,
        reflectionsWithSkills,
        skillCoverage: totalReflections > 0 ? reflectionsWithSkills / totalReflections : 0,
        skillStats,
        timeSeriesData,
        uniqueSkills: Object.keys(skillStats).length,
        totalSkillUsages: Object.values(skillStats).reduce((sum, s) => sum + s.totalUses, 0)
    };
}

function generateInsights(analysis) {
    const insights = [];
    const skillArray = Object.values(analysis.skillStats);

    // Top skills by usage
    const topByUsage = skillArray
        .sort((a, b) => b.totalUses - a.totalUses)
        .slice(0, 5);

    // Skills needing improvement (low success rate with enough data)
    const needsImprovement = skillArray
        .filter(s => s.successRate !== null && s.successRate < 0.5 && s.failures >= 3)
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, 5);

    // Skills with high success (candidates for templates)
    const highPerformers = skillArray
        .filter(s => s.successRate !== null && s.successRate >= 0.8 && s.totalUses >= 5)
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 5);

    // Error type patterns
    const errorPatterns = {};
    for (const skill of skillArray) {
        for (const [errorType, count] of Object.entries(skill.errorTypes)) {
            if (!errorPatterns[errorType]) {
                errorPatterns[errorType] = { count: 0, skills: [] };
            }
            errorPatterns[errorType].count += count;
            errorPatterns[errorType].skills.push(skill.skillId);
        }
    }

    return {
        topByUsage,
        needsImprovement,
        highPerformers,
        errorPatterns,
        recommendations: generateRecommendations(needsImprovement, highPerformers, errorPatterns)
    };
}

function generateRecommendations(needsImprovement, highPerformers, errorPatterns) {
    const recommendations = [];

    // Recommendations for struggling skills
    for (const skill of needsImprovement) {
        const topErrorType = Object.entries(skill.errorTypes)
            .sort((a, b) => b[1] - a[1])[0];

        recommendations.push({
            type: 'improve',
            skill: skill.skillId,
            priority: skill.failures >= 10 ? 'high' : 'medium',
            reason: `${skill.failures} failures (${((1 - skill.successRate) * 100).toFixed(0)}% failure rate)`,
            action: topErrorType
                ? `Focus on ${topErrorType[0]} errors (${topErrorType[1]} occurrences)`
                : 'Review error patterns and add validation'
        });
    }

    // Recommendations for high performers
    for (const skill of highPerformers) {
        recommendations.push({
            type: 'template',
            skill: skill.skillId,
            priority: 'low',
            reason: `${(skill.successRate * 100).toFixed(0)}% success rate with ${skill.totalUses} uses`,
            action: 'Extract patterns as reusable templates'
        });
    }

    // Recommendations for error patterns
    const topErrors = Object.entries(errorPatterns)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

    for (const [errorType, data] of topErrors) {
        if (data.count >= 5) {
            recommendations.push({
                type: 'infrastructure',
                skill: `${data.skills.length} skills`,
                priority: data.count >= 20 ? 'high' : 'medium',
                reason: `${data.count} "${errorType}" errors across ${data.skills.length} skills`,
                action: `Create validation/prevention for ${errorType} pattern`
            });
        }
    }

    return recommendations.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}

// =============================================================================
// Output Formatters
// =============================================================================

function printDashboard(analysis, insights, options = {}) {
    const { top = 10, threshold = null } = options;

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SKILL PERFORMANCE DASHBOARD');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Generated: ${new Date().toISOString().substring(0, 19)}`);
    console.log('');

    // Summary
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  SUMMARY                                                     │');
    console.log('├─────────────────────────────────────────────────────────────┤');
    console.log(`│  Total Reflections:      ${analysis.totalReflections.toString().padEnd(34)}│`);
    console.log(`│  With Skill Data:        ${analysis.reflectionsWithSkills.toString().padEnd(34)}│`);
    console.log(`│  Skill Coverage:         ${(analysis.skillCoverage * 100).toFixed(1)}%${' '.repeat(31)}│`);
    console.log(`│  Unique Skills:          ${analysis.uniqueSkills.toString().padEnd(34)}│`);
    console.log(`│  Total Skill Usages:     ${analysis.totalSkillUsages.toString().padEnd(34)}│`);
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('');

    // Top Skills by Usage
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  TOP SKILLS BY USAGE                                        │');
    console.log('├─────────────────────────────────────────────────────────────┤');

    const sortedByUsage = Object.values(analysis.skillStats)
        .sort((a, b) => b.totalUses - a.totalUses)
        .slice(0, top);

    for (const skill of sortedByUsage) {
        const successRate = skill.successRate !== null
            ? `${(skill.successRate * 100).toFixed(0)}%`
            : 'N/A';
        const line = `│  ${skill.skillId.padEnd(25)} ${skill.totalUses.toString().padStart(4)} uses  ${successRate.padStart(4)} success │`;
        console.log(line);
    }
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log('');

    // Skills Needing Improvement
    if (insights.needsImprovement.length > 0) {
        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│  ⚠️  SKILLS NEEDING IMPROVEMENT                              │');
        console.log('├─────────────────────────────────────────────────────────────┤');

        for (const skill of insights.needsImprovement) {
            const successRate = `${(skill.successRate * 100).toFixed(0)}%`;
            const line = `│  ${skill.skillId.padEnd(25)} ${skill.failures.toString().padStart(3)} fails  ${successRate.padStart(4)} success │`;
            console.log(line);
        }
        console.log('└─────────────────────────────────────────────────────────────┘');
        console.log('');
    }

    // High Performers
    if (insights.highPerformers.length > 0) {
        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│  ✅ HIGH PERFORMING SKILLS (template candidates)            │');
        console.log('├─────────────────────────────────────────────────────────────┤');

        for (const skill of insights.highPerformers) {
            const successRate = `${(skill.successRate * 100).toFixed(0)}%`;
            const line = `│  ${skill.skillId.padEnd(25)} ${skill.totalUses.toString().padStart(4)} uses  ${successRate.padStart(4)} success │`;
            console.log(line);
        }
        console.log('└─────────────────────────────────────────────────────────────┘');
        console.log('');
    }

    // Recommendations
    if (insights.recommendations.length > 0) {
        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│  📋 RECOMMENDATIONS                                         │');
        console.log('├─────────────────────────────────────────────────────────────┤');

        for (const rec of insights.recommendations.slice(0, 5)) {
            const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
            console.log(`│  ${priority} [${rec.type.toUpperCase().padEnd(12)}] ${rec.skill.padEnd(20).substring(0, 20)} │`);
            console.log(`│     ${rec.action.substring(0, 55).padEnd(55)} │`);
        }
        console.log('└─────────────────────────────────────────────────────────────┘');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
}

function outputJson(analysis, insights) {
    const output = {
        generated: new Date().toISOString(),
        summary: {
            totalReflections: analysis.totalReflections,
            reflectionsWithSkills: analysis.reflectionsWithSkills,
            skillCoverage: analysis.skillCoverage,
            uniqueSkills: analysis.uniqueSkills,
            totalSkillUsages: analysis.totalSkillUsages
        },
        skills: Object.values(analysis.skillStats).map(s => ({
            skillId: s.skillId,
            totalUses: s.totalUses,
            successes: s.successes,
            failures: s.failures,
            successRate: s.successRate,
            feedbackCoverage: s.feedbackCoverage,
            errorTypes: s.errorTypes,
            focusAreas: s.focusAreas,
            firstSeen: s.firstSeen,
            lastSeen: s.lastSeen
        })),
        insights: {
            topByUsage: insights.topByUsage.map(s => s.skillId),
            needsImprovement: insights.needsImprovement.map(s => ({
                skillId: s.skillId,
                successRate: s.successRate,
                failures: s.failures
            })),
            highPerformers: insights.highPerformers.map(s => ({
                skillId: s.skillId,
                successRate: s.successRate,
                totalUses: s.totalUses
            })),
            recommendations: insights.recommendations
        },
        timeSeries: analysis.timeSeriesData
    };

    console.log(JSON.stringify(output, null, 2));
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
    const args = process.argv.slice(2);

    const options = {
        json: args.includes('--json'),
        top: 10,
        threshold: null
    };

    // Parse --top N
    const topIdx = args.indexOf('--top');
    if (topIdx !== -1 && args[topIdx + 1]) {
        options.top = parseInt(args[topIdx + 1], 10);
    }

    // Parse --threshold N
    const threshIdx = args.indexOf('--threshold');
    if (threshIdx !== -1 && args[threshIdx + 1]) {
        options.threshold = parseFloat(args[threshIdx + 1]);
    }

    // Help
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Skill Performance Dashboard - Analyze skill usage and success rates

Usage:
  node skill-performance-dashboard.js              # Full dashboard
  node skill-performance-dashboard.js --json       # JSON output
  node skill-performance-dashboard.js --top 10     # Show top N skills
  node skill-performance-dashboard.js --threshold 0.5  # Filter by success rate

Options:
  --json          Output as JSON (for programmatic use)
  --top N         Show top N skills (default: 10)
  --threshold N   Show skills below this success rate
  --help, -h      Show this help message

Environment Variables:
  SUPABASE_URL       Supabase project URL (required)
  SUPABASE_ANON_KEY  Supabase anon key (required)
`);
        process.exit(0);
    }

    // Validate environment
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('Error: Missing SUPABASE_URL or SUPABASE_ANON_KEY');
        process.exit(1);
    }

    try {
        const reflections = await fetchReflectionsWithSkills();
        const analysis = analyzeSkillPerformance(reflections);
        const insights = generateInsights(analysis);

        if (options.json) {
            outputJson(analysis, insights);
        } else {
            printDashboard(analysis, insights, options);
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();

module.exports = { analyzeSkillPerformance, generateInsights };
