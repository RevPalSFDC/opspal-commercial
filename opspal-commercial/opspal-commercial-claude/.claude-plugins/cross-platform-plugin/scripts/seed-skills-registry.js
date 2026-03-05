#!/usr/bin/env node

/**
 * Seed Skills Registry - ACE Framework Setup
 *
 * Populates the Supabase skills table with predefined skills from
 * config/skill-registry.json. This establishes the initial skill catalog
 * that agents can reference for execution tracking.
 *
 * Usage:
 *   node seed-skills-registry.js [options]
 *
 * Options:
 *   --dry-run     Preview changes without modifying database
 *   --verbose     Enable detailed logging
 *   --force       Replace existing skills (default: skip existing)
 *
 * @version 1.0.0
 * @see https://github.com/kayba-ai/agentic-context-engine
 */

const path = require('path');
const fs = require('fs');

// Load environment
const envPath = path.join(__dirname, '..', '..', '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const SkillRegistry = require('./lib/strategy-registry');

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  force: args.includes('--force'),
  help: args.includes('--help') || args.includes('-h')
};

const usage = `
Seed Skills Registry - ACE Framework Setup

Populates the skills table with predefined skills from skill-registry.json.

Usage:
  node seed-skills-registry.js [options]

Options:
  --dry-run     Preview changes without modifying database
  --verbose     Enable detailed logging
  --force       Replace existing skills (default: skip existing)
  --help, -h    Show this help message

Example:
  # Preview what would be seeded
  node seed-skills-registry.js --dry-run --verbose

  # Seed the registry
  node seed-skills-registry.js --verbose

  # Force replace existing skills
  node seed-skills-registry.js --force
`;

if (options.help) {
  console.log(usage);
  process.exit(0);
}

// Load skill registry config
const configPath = path.join(__dirname, '..', 'config', 'skill-registry.json');
if (!fs.existsSync(configPath)) {
  console.error(`ERROR: Config file not found: ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * Transform config skills to database format
 */
function transformSkills(config) {
  const skills = [];

  for (const [categoryKey, category] of Object.entries(config.skillCategories || {})) {
    for (const [skillId, skillData] of Object.entries(category.skills || {})) {
      // Primary agent is first in the agents array
      const primaryAgent = skillData.agents?.[0] || 'unknown';

      skills.push({
        skillId: skillId,
        name: skillData.displayName,
        description: skillData.description,
        category: categoryKey,
        tags: skillData.keywords || [],
        sourceAgent: primaryAgent,
        sourceType: 'playbook',
        content: {
          displayName: skillData.displayName,
          description: skillData.description,
          agents: skillData.agents || [],
          keywords: skillData.keywords || [],
          category: categoryKey,
          categoryDescription: category.description
        }
      });
    }
  }

  return skills;
}

/**
 * Main seeding function
 */
async function seedSkillsRegistry() {
  console.log('='.repeat(70));
  console.log('ACE Skills Framework - Registry Seeding');
  console.log('='.repeat(70));
  console.log();

  if (options.dryRun) {
    console.log('🔄 DRY RUN MODE - No changes will be made\n');
  }

  // Initialize registry
  let registry;
  try {
    registry = new SkillRegistry({
      verbose: options.verbose,
      dryRun: options.dryRun
    });
  } catch (error) {
    console.error(`ERROR: Failed to initialize registry: ${error.message}`);
    console.error('Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env');
    process.exit(1);
  }

  // Transform config to skill records
  const skills = transformSkills(config);
  console.log(`📦 Found ${skills.length} skills to seed across ${Object.keys(config.skillCategories).length} categories\n`);

  // Group by category for reporting
  const byCategory = skills.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {});

  console.log('Categories:');
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  • ${cat}: ${count} skills`);
  }
  console.log();

  // Check existing skills
  let existingSkillIds = new Set();
  if (!options.force) {
    try {
      const stats = await registry.getStats();
      if (stats.totalSkills > 0) {
        // Query existing skill IDs
        const existingUrl = `${process.env.SUPABASE_URL}/rest/v1/skills?select=skill_id`;
        const headers = {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY}`
        };

        const { execSync } = require('child_process');
        const response = execSync(
          `curl -s -H "apikey: ${headers.apikey}" -H "Authorization: ${headers.Authorization}" "${existingUrl}"`,
          { encoding: 'utf-8' }
        );
        const existing = JSON.parse(response);
        existingSkillIds = new Set(existing.map(s => s.skill_id));
        console.log(`ℹ️  Found ${existingSkillIds.size} existing skills in registry`);
      }
    } catch (error) {
      if (options.verbose) {
        console.log(`Note: Could not check existing skills: ${error.message}`);
      }
    }
  }

  // Seed skills
  console.log('\n' + '─'.repeat(70));
  console.log('Seeding skills...\n');

  const results = {
    registered: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };

  for (const skill of skills) {
    // Skip existing unless force mode
    if (!options.force && existingSkillIds.has(skill.skillId)) {
      if (options.verbose) {
        console.log(`  ⏭️  Skipping existing: ${skill.skillId}`);
      }
      results.skipped++;
      continue;
    }

    try {
      const result = await registry.registerSkill(skill);

      if (options.dryRun) {
        console.log(`  📝 Would register: ${skill.skillId} (${skill.category})`);
      } else {
        console.log(`  ✅ Registered: ${skill.skillId}`);
      }
      results.registered++;
    } catch (error) {
      console.log(`  ❌ Failed: ${skill.skillId} - ${error.message}`);
      results.failed++;
      results.errors.push({ skillId: skill.skillId, error: error.message });
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(70));
  console.log('Summary:');
  console.log('─'.repeat(70));
  console.log(`  ✅ Registered: ${results.registered}`);
  console.log(`  ⏭️  Skipped:    ${results.skipped}`);
  console.log(`  ❌ Failed:     ${results.failed}`);
  console.log();

  if (results.errors.length > 0) {
    console.log('Errors:');
    for (const err of results.errors) {
      console.log(`  • ${err.skillId}: ${err.error}`);
    }
    console.log();
  }

  // Final stats
  if (!options.dryRun) {
    try {
      const finalStats = await registry.getStats();
      console.log('Final Registry State:');
      console.log(`  Total skills: ${finalStats.totalSkills}`);
      console.log(`  By category:`);
      for (const [cat, count] of Object.entries(finalStats.byCategory || {})) {
        console.log(`    • ${cat}: ${count}`);
      }
    } catch (error) {
      // Stats failed, continue
    }
  }

  console.log('\n' + '='.repeat(70));

  if (options.dryRun) {
    console.log('✅ Dry run complete. Run without --dry-run to apply changes.');
  } else if (results.failed === 0) {
    console.log('✅ Skills registry seeded successfully!');
  } else {
    console.log(`⚠️  Completed with ${results.failed} errors`);
    process.exit(1);
  }
}

// Run
seedSkillsRegistry().catch(error => {
  console.error('Fatal error:', error.message);
  if (options.verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});
