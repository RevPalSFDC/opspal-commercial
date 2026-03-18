#!/usr/bin/env node

/**
 * ROI Skill Metrics Updater
 *
 * Automatically updates the ROI tracking framework with current skill performance metrics.
 * Designed to run as part of the monthly measurement schedule.
 *
 * Usage:
 *   node roi-skill-metrics-updater.js                 # Update ROI framework
 *   node roi-skill-metrics-updater.js --dry-run      # Preview without updating
 *   node roi-skill-metrics-updater.js --json         # Output JSON only
 *
 * Environment Variables:
 *   SUPABASE_URL       - Supabase project URL
 *   SUPABASE_ANON_KEY  - Supabase anon key
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const ROI_FRAMEWORK_PATH = path.resolve(__dirname, '../../../../reports/roi-tracking-framework.json');

// =============================================================================
// HTTP Helper
// =============================================================================

function makeRequest(url, options) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        // Only set port if explicitly specified
        if (parsedUrl.port) {
            requestOptions.port = parsedUrl.port;
        }

        const req = protocol.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsedData = null;
                try {
                    parsedData = data ? JSON.parse(data) : null;
                } catch (e) {
                    // Ignore JSON parse errors
                }
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    data: parsedData
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// =============================================================================
// Fetch Skill Metrics from Supabase
// =============================================================================

async function fetchSkillMetrics() {
    const url = `${SUPABASE_URL}/rest/v1/reflections?select=id,data,reflection_status`;

    const response = await makeRequest(url, {
        method: 'GET',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch reflections: ${response.status}`);
    }

    const reflections = response.data;

    // Calculate metrics
    const totalReflections = reflections.length;
    const reflectionsWithSkills = reflections.filter(r =>
        r.data?.skills_used && r.data.skills_used.length > 0
    );

    // Aggregate skill performance
    const skillStats = {};
    let totalSkillUsages = 0;

    for (const reflection of reflectionsWithSkills) {
        const skills = reflection.data?.skills_used || [];
        const feedback = reflection.data?.skill_feedback || {};

        for (const skillId of skills) {
            totalSkillUsages++;
            if (!skillStats[skillId]) {
                skillStats[skillId] = { uses: 0, successes: 0, failures: 0 };
            }
            skillStats[skillId].uses++;

            if (feedback[skillId]) {
                if (feedback[skillId].success) skillStats[skillId].successes++;
                if (feedback[skillId].failure) skillStats[skillId].failures++;
            }
        }
    }

    // Calculate overall success rate
    let totalSuccesses = 0;
    let totalWithOutcome = 0;

    for (const skill of Object.values(skillStats)) {
        totalSuccesses += skill.successes;
        totalWithOutcome += (skill.successes + skill.failures);
    }

    const overallSuccessRate = totalWithOutcome > 0
        ? ((totalSuccesses / totalWithOutcome) * 100).toFixed(1)
        : 0;

    // Count skills at 0%
    const skillsAtZero = Object.entries(skillStats)
        .filter(([_, stats]) => stats.successes === 0 && stats.failures > 0)
        .map(([skillId]) => skillId);

    // Top skills by usage
    const topSkills = Object.entries(skillStats)
        .sort((a, b) => b[1].uses - a[1].uses)
        .slice(0, 5)
        .map(([skillId, stats]) => ({
            skillId,
            uses: stats.uses,
            successRate: stats.successes + stats.failures > 0
                ? ((stats.successes / (stats.successes + stats.failures)) * 100).toFixed(0)
                : 'N/A'
        }));

    return {
        snapshot_date: new Date().toISOString().split('T')[0],
        total_reflections: totalReflections,
        reflections_with_skills: reflectionsWithSkills.length,
        skill_coverage_percent: totalReflections > 0
            ? ((reflectionsWithSkills.length / totalReflections) * 100).toFixed(1)
            : 0,
        unique_skills: Object.keys(skillStats).length,
        total_skill_usages: totalSkillUsages,
        overall_success_rate_percent: parseFloat(overallSuccessRate),
        critical_skills_at_zero_count: skillsAtZero.length,
        critical_skills_at_zero: skillsAtZero.slice(0, 5),
        top_skills: topSkills
    };
}

// =============================================================================
// Update ROI Framework
// =============================================================================

function updateROIFramework(metrics, dryRun = false) {
    // Read existing framework
    let framework;
    try {
        framework = JSON.parse(fs.readFileSync(ROI_FRAMEWORK_PATH, 'utf8'));
    } catch (error) {
        throw new Error(`Cannot read ROI framework: ${error.message}`);
    }

    // Update skill_performance_baseline
    framework.skill_performance_baseline = {
        snapshot_date: metrics.snapshot_date,
        total_reflections: metrics.total_reflections,
        reflections_with_skills: metrics.reflections_with_skills,
        skill_coverage_percent: parseFloat(metrics.skill_coverage_percent),
        unique_skills: metrics.unique_skills,
        total_skill_usages: metrics.total_skill_usages,
        overall_success_rate_percent: metrics.overall_success_rate_percent,
        critical_skills_at_zero_percent: metrics.critical_skills_at_zero
    };

    // Find ACE skills implementation and add monthly measurement
    const aceImpl = framework.implementations.find(i => i.id === 'ace-skills-infrastructure');
    if (aceImpl) {
        const measurement = {
            date: metrics.snapshot_date,
            skill_coverage_percent: parseFloat(metrics.skill_coverage_percent),
            overall_success_rate: metrics.overall_success_rate_percent,
            critical_skills_at_zero: metrics.critical_skills_at_zero_count,
            top_skills: metrics.top_skills.map(s => s.skillId),
            notes: `Automated update: ${metrics.reflections_with_skills}/${metrics.total_reflections} reflections have skill data.`
        };

        // Avoid duplicate entries for same date
        const existingIdx = aceImpl.monthly_measurements.findIndex(
            m => m.date === metrics.snapshot_date
        );

        if (existingIdx >= 0) {
            aceImpl.monthly_measurements[existingIdx] = measurement;
        } else {
            aceImpl.monthly_measurements.push(measurement);
        }
    }

    if (!dryRun) {
        fs.writeFileSync(ROI_FRAMEWORK_PATH, JSON.stringify(framework, null, 2) + '\n');
    }

    return framework;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const jsonOnly = args.includes('--json');

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
ROI Skill Metrics Updater - Update ROI framework with skill performance data

Usage:
  node roi-skill-metrics-updater.js              # Update ROI framework
  node roi-skill-metrics-updater.js --dry-run    # Preview without updating
  node roi-skill-metrics-updater.js --json       # Output JSON only

Environment Variables:
  SUPABASE_URL       Supabase project URL (required)
  SUPABASE_ANON_KEY  Supabase anon key (required)
        `);
        process.exit(0);
    }

    // Validate environment
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('❌ Missing environment variables: SUPABASE_URL, SUPABASE_ANON_KEY');
        process.exit(1);
    }

    try {
        // Fetch current metrics
        if (!jsonOnly) {
            console.log('📊 Fetching skill metrics from Supabase...');
        }

        const metrics = await fetchSkillMetrics();

        if (jsonOnly) {
            console.log(JSON.stringify(metrics, null, 2));
            return;
        }

        console.log('');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  SKILL METRICS SNAPSHOT');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`  Date:                    ${metrics.snapshot_date}`);
        console.log(`  Total Reflections:       ${metrics.total_reflections}`);
        console.log(`  With Skill Data:         ${metrics.reflections_with_skills}`);
        console.log(`  Coverage:                ${metrics.skill_coverage_percent}%`);
        console.log(`  Unique Skills:           ${metrics.unique_skills}`);
        console.log(`  Total Skill Usages:      ${metrics.total_skill_usages}`);
        console.log(`  Overall Success Rate:    ${metrics.overall_success_rate_percent}%`);
        console.log(`  Skills at 0%:            ${metrics.critical_skills_at_zero_count}`);
        console.log('');

        console.log('  Top Skills by Usage:');
        for (const skill of metrics.top_skills) {
            console.log(`    - ${skill.skillId}: ${skill.uses} uses (${skill.successRate}% success)`);
        }
        console.log('');

        // Update framework
        if (dryRun) {
            console.log('🔍 DRY RUN - Would update ROI framework with above metrics');
            console.log(`   File: ${ROI_FRAMEWORK_PATH}`);
        } else {
            console.log('📝 Updating ROI framework...');
            updateROIFramework(metrics, false);
            console.log(`   ✅ Updated: ${ROI_FRAMEWORK_PATH}`);
        }

        console.log('');
        console.log('═══════════════════════════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();

module.exports = { fetchSkillMetrics, updateROIFramework };
