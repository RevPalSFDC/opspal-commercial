#!/usr/bin/env node

/**
 * Backfill Reflection Skills
 *
 * Retroactively processes existing reflections to populate:
 * - skills_used: Array of skill IDs detected from reflection content
 * - skill_feedback: Object mapping skill IDs to success/failure outcomes
 *
 * Usage:
 *   node backfill-reflection-skills.js              # Dry run (no updates)
 *   node backfill-reflection-skills.js --execute    # Actually update records
 *   node backfill-reflection-skills.js --limit 10   # Process only N reflections
 *
 * Environment Variables:
 *   SUPABASE_URL       - Supabase project URL
 *   SUPABASE_ANON_KEY  - Service role key (for updates)
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { ReflectionSkillAnalyzer } = require('./reflection-skill-analyzer.js');

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_READ_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_WRITE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// =============================================================================
// HTTP Helper
// =============================================================================

function makeRequest(url, options, body) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = protocol.request(requestOptions, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    data: data ? JSON.parse(data) : null
                });
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

// =============================================================================
// Supabase Operations
// =============================================================================

async function fetchAllReflections(limit = null) {
    let url = `${SUPABASE_URL}/rest/v1/reflections?select=*&order=created_at.desc`;
    if (limit) {
        url += `&limit=${limit}`;
    }

    const response = await makeRequest(url, {
        method: 'GET',
        headers: {
            'apikey': SUPABASE_READ_KEY,
            'Authorization': `Bearer ${SUPABASE_READ_KEY}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch reflections: ${response.status}`);
    }

    return response.data;
}

async function updateReflection(id, updates) {
    const url = `${SUPABASE_URL}/rest/v1/reflections?id=eq.${id}`;

    const response = await makeRequest(url, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_WRITE_KEY,
            'Authorization': `Bearer ${SUPABASE_WRITE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    }, JSON.stringify(updates));

    if (!response.ok) {
        const errorDetails = response.data ? JSON.stringify(response.data) : 'No error details';
        throw new Error(`Failed to update reflection ${id}: ${response.status} - ${errorDetails}`);
    }

    return response.data;
}

// =============================================================================
// Main Backfill Process
// =============================================================================

async function backfillReflectionSkills(options = {}) {
    const { execute = false, limit = null, verbose = false } = options;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  REFLECTION SKILLS BACKFILL');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Mode: ${execute ? '🔴 EXECUTE (will update records)' : '🟢 DRY RUN (no changes)'}`);
    if (limit) console.log(`  Limit: ${limit} reflections`);
    console.log('');

    // Validate environment
    if (!SUPABASE_URL || !SUPABASE_READ_KEY) {
        console.error('❌ Missing environment variables: SUPABASE_URL, SUPABASE_ANON_KEY');
        process.exit(1);
    }

    // For execute mode, require service role key
    if (execute && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Execute mode requires SUPABASE_SERVICE_ROLE_KEY for write operations');
        console.error('   Set: export SUPABASE_SERVICE_ROLE_KEY=sb_secret_...');
        process.exit(1);
    }

    // Initialize analyzer
    const analyzer = new ReflectionSkillAnalyzer({ verbose });

    // Fetch reflections
    console.log('📥 Fetching reflections from Supabase...');
    const reflections = await fetchAllReflections(limit);
    console.log(`   Found ${reflections.length} reflection(s)`);
    console.log('');

    if (reflections.length === 0) {
        console.log('No reflections to process.');
        return;
    }

    // Track statistics
    const stats = {
        total: reflections.length,
        analyzed: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        skillsDetected: 0,
        reflectionsWithSkills: 0
    };

    const updates = [];

    // Process each reflection
    console.log('🔍 Analyzing reflections...');
    console.log('');

    for (const reflection of reflections) {
        try {
            // Check if already has skills
            const hasExistingSkills = reflection.skills_used && reflection.skills_used.length > 0;

            // Analyze
            const analysis = analyzer.analyzeReflection(reflection);
            stats.analyzed++;

            if (analysis.skills_used.length === 0) {
                stats.skipped++;
                if (verbose) {
                    console.log(`  ⏭️  ${reflection.id.substring(0, 8)}... - No skills detected`);
                }
                continue;
            }

            stats.reflectionsWithSkills++;
            stats.skillsDetected += analysis.skills_used.length;

            // Prepare update
            const update = {
                id: reflection.id,
                skills_used: analysis.skills_used,
                skill_feedback: analysis.skill_feedback
            };

            updates.push(update);

            // Log progress
            const skillList = analysis.skills_used.slice(0, 3).join(', ');
            const moreSkills = analysis.skills_used.length > 3 ? ` +${analysis.skills_used.length - 3} more` : '';
            console.log(`  ✅ ${reflection.id.substring(0, 8)}... - ${analysis.skills_used.length} skill(s): ${skillList}${moreSkills}`);

            if (hasExistingSkills && verbose) {
                console.log(`     (Merging with ${reflection.skills_used.length} existing skills)`);
            }

        } catch (error) {
            stats.errors++;
            console.log(`  ❌ ${reflection.id.substring(0, 8)}... - Error: ${error.message}`);
        }
    }

    console.log('');
    console.log('───────────────────────────────────────────────────────────');
    console.log('  ANALYSIS COMPLETE');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  Total reflections:      ${stats.total}`);
    console.log(`  Analyzed:               ${stats.analyzed}`);
    console.log(`  With skills detected:   ${stats.reflectionsWithSkills}`);
    console.log(`  Skipped (no skills):    ${stats.skipped}`);
    console.log(`  Errors:                 ${stats.errors}`);
    console.log(`  Total skills detected:  ${stats.skillsDetected}`);
    console.log(`  Avg skills/reflection:  ${(stats.skillsDetected / stats.reflectionsWithSkills || 0).toFixed(1)}`);
    console.log('');

    // Execute updates if requested
    if (execute && updates.length > 0) {
        console.log('📤 Updating reflections in Supabase...');
        console.log('   (Storing skills in data.skills_used and data.skill_feedback)');
        console.log('');

        for (const update of updates) {
            try {
                // Find the original reflection to get existing data
                const originalReflection = reflections.find(r => r.id === update.id);
                const existingData = originalReflection?.data || {};

                // Merge skill data into existing data column
                const mergedData = {
                    ...existingData,
                    skills_used: update.skills_used,
                    skill_feedback: update.skill_feedback
                };

                await updateReflection(update.id, {
                    data: mergedData
                });
                stats.updated++;
                console.log(`  ✅ Updated ${update.id.substring(0, 8)}...`);
            } catch (error) {
                console.log(`  ❌ Failed to update ${update.id.substring(0, 8)}...: ${error.message}`);
            }
        }

        console.log('');
        console.log(`  Successfully updated: ${stats.updated}/${updates.length} reflections`);
    } else if (!execute && updates.length > 0) {
        console.log('ℹ️  DRY RUN - No updates made');
        console.log(`   ${updates.length} reflection(s) would be updated`);
        console.log('');
        console.log('   Run with --execute to apply changes:');
        console.log('   node backfill-reflection-skills.js --execute');
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    // Generate summary
    const summary = analyzer.generateSummary(
        updates.map(u => ({
            skills_used: u.skills_used,
            skill_feedback: u.skill_feedback
        }))
    );

    console.log('');
    console.log('📊 SKILL STATISTICS');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`  Unique skills detected: ${summary.uniqueSkillsDetected}`);
    console.log(`  Total skill usages:     ${summary.totalSkillUsages}`);
    console.log('');

    if (summary.topSkills.length > 0) {
        console.log('  Top Skills:');
        summary.topSkills.slice(0, 10).forEach((skill, i) => {
            const successRate = (skill.successRate * 100).toFixed(0);
            console.log(`    ${i + 1}. ${skill.skillId} (${skill.totalUses} uses, ${successRate}% success)`);
        });
    }

    if (summary.lowestSuccessRateSkills.length > 0) {
        console.log('');
        console.log('  Skills Needing Improvement (lowest success rate):');
        summary.lowestSuccessRateSkills.forEach(skill => {
            const successRate = (skill.successRate * 100).toFixed(0);
            console.log(`    - ${skill.skillId}: ${successRate}% success (${skill.failures} failures)`);
        });
    }

    console.log('');

    return { stats, updates, summary };
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
    const args = process.argv.slice(2);

    const options = {
        execute: args.includes('--execute') || args.includes('-e'),
        verbose: args.includes('--verbose') || args.includes('-v'),
        limit: null
    };

    // Parse limit
    const limitIdx = args.findIndex(a => a === '--limit' || a === '-l');
    if (limitIdx !== -1 && args[limitIdx + 1]) {
        options.limit = parseInt(args[limitIdx + 1], 10);
    }

    // Help
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Backfill Reflection Skills - Populate skills_used and skill_feedback fields

Usage:
  node backfill-reflection-skills.js              # Dry run (preview changes)
  node backfill-reflection-skills.js --execute    # Actually update records
  node backfill-reflection-skills.js --limit 10   # Process only N reflections
  node backfill-reflection-skills.js --verbose    # Show detailed output

Options:
  --execute, -e    Apply updates to Supabase (default: dry run)
  --limit, -l N    Process only first N reflections
  --verbose, -v    Show detailed analysis output
  --help, -h       Show this help message

Environment Variables:
  SUPABASE_URL       Supabase project URL (required)
  SUPABASE_ANON_KEY  Supabase service key (required)

Examples:
  # Preview what would be updated
  node backfill-reflection-skills.js

  # Test with 5 reflections
  node backfill-reflection-skills.js --limit 5

  # Run for real
  node backfill-reflection-skills.js --execute
        `);
        process.exit(0);
    }

    try {
        await backfillReflectionSkills(options);
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();

module.exports = { backfillReflectionSkills };
