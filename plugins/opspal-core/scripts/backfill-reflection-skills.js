#!/usr/bin/env node

/**
 * Backfill Reflection Skills - ACE Framework
 *
 * Infers skills_used from existing reflection content and updates
 * the reflections table. This populates historical data for the
 * ACE Framework skill tracking system.
 *
 * Prerequisites:
 *   - Migration 002 must be applied (adds skills_used column)
 *   - Skills must be seeded (run seed-skills-registry.js first)
 *
 * Usage:
 *   node backfill-reflection-skills.js [options]
 *
 * Options:
 *   --dry-run     Preview changes without modifying database
 *   --verbose     Enable detailed logging
 *   --limit N     Process only N reflections (default: all)
 *   --since DATE  Process reflections since DATE (ISO format)
 *
 * @version 1.0.0
 * @see https://github.com/kayba-ai/agentic-context-engine
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// Load environment
const envPath = path.join(__dirname, '..', '..', '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// Parse CLI arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  help: args.includes('--help') || args.includes('-h'),
  limit: null,
  since: null
};

// Parse --limit N
const limitIdx = args.indexOf('--limit');
if (limitIdx !== -1 && args[limitIdx + 1]) {
  options.limit = parseInt(args[limitIdx + 1], 10);
}

// Parse --since DATE
const sinceIdx = args.indexOf('--since');
if (sinceIdx !== -1 && args[sinceIdx + 1]) {
  options.since = args[sinceIdx + 1];
}

const usage = `
Backfill Reflection Skills - ACE Framework

Infers skills_used from existing reflection content and updates the database.

Usage:
  node backfill-reflection-skills.js [options]

Options:
  --dry-run     Preview changes without modifying database
  --verbose     Enable detailed logging
  --limit N     Process only N reflections (default: all)
  --since DATE  Process reflections since DATE (ISO format)
  --help, -h    Show this help message

Example:
  # Preview what would be backfilled
  node backfill-reflection-skills.js --dry-run --verbose

  # Backfill all reflections
  node backfill-reflection-skills.js --verbose

  # Backfill last 10 reflections only
  node backfill-reflection-skills.js --limit 10

  # Backfill since specific date
  node backfill-reflection-skills.js --since 2025-01-01
`;

if (options.help) {
  console.log(usage);
  process.exit(0);
}

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY required');
  process.exit(1);
}

// Skill inference patterns from skill-registry.json
const SKILL_PATTERNS = {
  // Assessment skills
  'cpq-assessment': {
    keywords: ['cpq', 'quote', 'pricing', 'product bundle', 'discount', 'sbqq', 'quote-to-cash', 'q2c'],
    agents: ['sfdc-cpq-assessor', 'sfdc-cpq-specialist']
  },
  'revops-audit': {
    keywords: ['revops', 'pipeline', 'forecast', 'sales process', 'revenue operations', 'win rate', 'conversion'],
    agents: ['sfdc-revops-auditor', 'sfdc-revops-coordinator']
  },
  'automation-audit': {
    keywords: ['automation', 'flow audit', 'process builder', 'workflow', 'trigger audit', 'automation conflict'],
    agents: ['sfdc-automation-auditor', 'sfdc-automation-builder']
  },
  'permission-review': {
    keywords: ['permission', 'profile', 'sharing', 'access', 'permission set', 'security', 'fls'],
    agents: ['sfdc-permission-assessor', 'sfdc-permission-orchestrator', 'sfdc-security-admin']
  },
  'object-audit': {
    keywords: ['object audit', 'metadata analysis', 'field analysis', 'object review', 'custom object'],
    agents: ['sfdc-object-auditor', 'sfdc-metadata-analyzer']
  },

  // Deployment skills
  'metadata-deploy': {
    keywords: ['deploy', 'metadata', 'package', 'deployment', 'release', 'migration'],
    agents: ['sfdc-deployment-manager', 'sfdc-metadata-manager']
  },
  'flow-deploy': {
    keywords: ['flow deploy', 'activate flow', 'flow activation', 'deploy flow'],
    agents: ['sfdc-flow-diagnostician', 'sfdc-automation-builder']
  },
  'apex-deploy': {
    keywords: ['apex deploy', 'trigger deploy', 'class deploy', 'apex code', 'test class'],
    agents: ['sfdc-apex-developer']
  },
  'permission-deploy': {
    keywords: ['permission deploy', 'profile deploy', 'permission set deploy'],
    agents: ['sfdc-permission-orchestrator']
  },

  // Validation skills
  'pre-deploy-check': {
    keywords: ['validate', 'pre-deploy', 'check deployment', 'validation', 'pre-flight'],
    agents: ['sfdc-deployment-manager']
  },
  'field-validation': {
    keywords: ['field check', 'field validation', 'field dependency', 'field reference'],
    agents: ['sfdc-field-analyzer']
  },
  'dependency-check': {
    keywords: ['dependency', 'reference check', 'impact analysis', 'dependent metadata'],
    agents: ['sfdc-dependency-analyzer']
  },

  // Query skills
  'soql-build': {
    keywords: ['soql', 'query', 'select', 'data query', 'api query'],
    agents: ['sfdc-query-specialist']
  },
  'report-create': {
    keywords: ['report', 'create report', 'report type', 'salesforce report'],
    agents: ['sfdc-reports-dashboards', 'sfdc-report-designer']
  },
  'dashboard-create': {
    keywords: ['dashboard', 'create dashboard', 'kpi', 'analytics'],
    agents: ['sfdc-reports-dashboards', 'sfdc-dashboard-designer']
  },
  'data-export': {
    keywords: ['export', 'data export', 'backup', 'extract data'],
    agents: ['sfdc-data-export-manager', 'sfdc-data-operations']
  },
  'data-import': {
    keywords: ['import', 'upsert', 'data load', 'bulk upload', 'csv import'],
    agents: ['sfdc-data-import-manager', 'sfdc-data-operations']
  },

  // Automation skills
  'flow-create': {
    keywords: ['create flow', 'build flow', 'flow builder', 'new flow', 'record-triggered flow'],
    agents: ['sfdc-automation-builder']
  },
  'trigger-create': {
    keywords: ['trigger', 'apex trigger', 'handler', 'create trigger'],
    agents: ['trigger-orchestrator', 'sfdc-apex-developer']
  },
  'validation-rule-create': {
    keywords: ['validation rule', 'formula', 'create validation', 'error message'],
    agents: ['validation-rule-orchestrator']
  },

  // Configuration skills
  'field-create': {
    keywords: ['create field', 'custom field', 'add field', 'new field'],
    agents: ['sfdc-metadata-manager']
  },
  'object-create': {
    keywords: ['create object', 'custom object', 'new object'],
    agents: ['sfdc-metadata-manager']
  },
  'layout-modify': {
    keywords: ['layout', 'page layout', 'lightning page', 'flexipage', 'layout change'],
    agents: ['sfdc-layout-generator', 'sfdc-ui-customizer']
  },

  // Troubleshooting skills
  'debug-log-analysis': {
    keywords: ['debug log', 'trace', 'log analysis', 'apex log', 'debug'],
    agents: ['sfdc-apex-developer', 'apex-debug-analyst']
  },
  'error-diagnosis': {
    keywords: ['error', 'diagnose', 'troubleshoot', 'fix error', 'conflict'],
    agents: ['sfdc-conflict-resolver']
  },
  'performance-optimize': {
    keywords: ['performance', 'optimize', 'governor limit', 'soql optimization', 'bulk'],
    agents: ['sfdc-performance-optimizer']
  }
};

/**
 * Infer skills from reflection content
 */
function inferSkillsFromContent(reflection) {
  const skills = new Set();

  // Extract data fields (summary, issues, etc. are in data JSONB)
  const data = reflection.data || {};

  // Build searchable text from reflection content
  const searchableFields = [
    data.summary,
    reflection.focus_area,
    data.description,
    reflection.org,
    data.agent,
    reflection.plugin_name,
    JSON.stringify(data),
    JSON.stringify(data.issues_identified || []),
    JSON.stringify(data.user_feedback || []),
    JSON.stringify(data.playbook || {})
  ];

  const searchText = searchableFields.filter(Boolean).join(' ').toLowerCase();

  // Check each skill's patterns
  for (const [skillId, patterns] of Object.entries(SKILL_PATTERNS)) {
    // Check keywords
    const keywordMatch = patterns.keywords.some(keyword =>
      searchText.includes(keyword.toLowerCase())
    );

    // Check agent names
    const agentMatch = patterns.agents.some(agent =>
      searchText.includes(agent.toLowerCase())
    );

    if (keywordMatch || agentMatch) {
      skills.add(skillId);

      if (options.verbose) {
        const matchType = keywordMatch ? 'keyword' : 'agent';
        console.log(`    Found skill '${skillId}' via ${matchType} match`);
      }
    }
  }

  return Array.from(skills);
}

/**
 * Determine outcome from reflection data
 */
function determineOutcome(reflection) {
  const data = reflection.data || {};

  // Check explicit outcome
  if (reflection.outcome) {
    return reflection.outcome;
  }

  // Check data.outcome
  if (data.outcome) {
    return data.outcome;
  }

  // Infer from issues count
  const issueCount = reflection.total_issues ||
    reflection.priority_issues ||
    (data.issues_identified?.length || 0);

  if (issueCount === 0) {
    return 'success';
  } else if (issueCount > 3) {
    return 'failure';
  } else {
    return 'partial';
  }
}

/**
 * Execute Supabase query via curl
 */
function supabaseQuery(endpoint, method = 'GET', body = null, headers = {}) {
  const allHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...headers
  };

  let tmpFile = null;
  try {
    const curlArgs = [
      'curl', '-s',
      '-X', method
    ];

    for (const [k, v] of Object.entries(allHeaders)) {
      curlArgs.push('-H', `"${k}: ${v}"`);
    }

    if (body) {
      tmpFile = `${os.tmpdir()}/supabase-body-${Date.now()}.json`;
      fs.writeFileSync(tmpFile, JSON.stringify(body), 'utf8');
      curlArgs.push('-d', `@${tmpFile}`);
    }

    curlArgs.push(`"${SUPABASE_URL}/rest/v1/${endpoint}"`);

    const curlCmd = curlArgs.join(' ');
    if (options.verbose) {
      console.log(`  [DEBUG] Query: ${method} ${endpoint.split('?')[0]}`);
    }

    const response = execSync(curlCmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

    if (!response || response.trim() === '') {
      return [];
    }

    const parsed = JSON.parse(response);

    // Check for error response
    if (parsed && parsed.message) {
      throw new Error(`Supabase error: ${parsed.message}`);
    }

    return parsed;
  } catch (error) {
    if (error.message.includes('Supabase error')) {
      throw error;
    }
    throw new Error(`Supabase query failed: ${error.message}`);
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Main backfill function
 */
async function backfillReflectionSkills() {
  console.log('='.repeat(70));
  console.log('ACE Skills Framework - Reflection Backfill');
  console.log('='.repeat(70));
  console.log();

  if (options.dryRun) {
    console.log('🔄 DRY RUN MODE - No changes will be made\n');
  }

  // Build query params - note: summary is inside data.summary, not a top-level column
  let queryParams = 'select=id,created_at,focus_area,org,data,outcome,total_issues,priority_issues,plugin_name,plugin_version&order=created_at.desc';

  if (options.limit) {
    queryParams += `&limit=${options.limit}`;
  }

  if (options.since) {
    queryParams += `&created_at=gte.${options.since}`;
  }

  console.log('📖 Querying reflections from Supabase...\n');

  // Query reflections
  let reflections;
  try {
    reflections = supabaseQuery(`reflections?${queryParams}`);
  } catch (error) {
    console.error(`ERROR: Failed to query reflections: ${error.message}`);
    process.exit(1);
  }

  console.log(`📊 Found ${reflections.length} reflections to process\n`);

  if (reflections.length === 0) {
    console.log('No reflections to backfill.');
    return;
  }

  // Process reflections
  const results = {
    processed: 0,
    updated: 0,
    skipped: 0,
    noSkills: 0,
    errors: []
  };

  console.log('─'.repeat(70));
  console.log('Processing reflections...\n');

  for (const reflection of reflections) {
    results.processed++;

    const reflectionDate = new Date(reflection.created_at).toISOString().split('T')[0];
    const reflectionData = reflection.data || {};
    // Handle summary as string or object with description/title
    let summaryText = reflectionData.summary || reflection.focus_area || 'No summary';
    if (typeof summaryText === 'object') {
      summaryText = summaryText.description || summaryText.title || JSON.stringify(summaryText);
    }
    const shortSummary = String(summaryText).substring(0, 50);

    if (options.verbose) {
      console.log(`\n[${results.processed}/${reflections.length}] ${reflection.id.substring(0, 8)}... (${reflectionDate})`);
      console.log(`  Summary: ${shortSummary}...`);
    }

    // Check if already has skills_used
    const data = reflection.data || {};
    const existingSkills = data.skills?.skills_used ||
      data.skills_used ||
      [];

    if (existingSkills.length > 0) {
      if (options.verbose) {
        console.log(`  ⏭️  Already has ${existingSkills.length} skills: ${existingSkills.join(', ')}`);
      }
      results.skipped++;
      continue;
    }

    // Infer skills from content
    const inferredSkills = inferSkillsFromContent(reflection);

    if (inferredSkills.length === 0) {
      if (options.verbose) {
        console.log('  ⚠️  No skills could be inferred');
      }
      results.noSkills++;
      continue;
    }

    // Determine outcome
    const outcome = determineOutcome(reflection);

    // Build updated data
    const updatedData = {
      ...(reflection.data || {}),
      skills_used: inferredSkills,
      skills: {
        ...(reflection.data?.skills || {}),
        skills_used: inferredSkills,
        skill_feedback: inferredSkills.reduce((acc, skill) => {
          acc[skill] = {
            success: outcome === 'success',
            notes: 'Inferred via backfill script'
          };
          return acc;
        }, {})
      },
      backfill_metadata: {
        backfilled_at: new Date().toISOString(),
        inferred_skills: inferredSkills.length,
        backfill_version: '1.0.0'
      }
    };

    if (options.verbose) {
      console.log(`  ✅ Inferred ${inferredSkills.length} skills: ${inferredSkills.join(', ')}`);
      console.log(`  📋 Outcome: ${outcome}`);
    }

    if (options.dryRun) {
      console.log(`  📝 Would update reflection ${reflection.id.substring(0, 8)}...`);
      results.updated++;
      continue;
    }

    // Update reflection in Supabase
    try {
      supabaseQuery(
        `reflections?id=eq.${reflection.id}`,
        'PATCH',
        {
          data: updatedData,
          skills_used: inferredSkills,
          outcome: outcome
        },
        { 'Prefer': 'return=minimal' }
      );

      console.log(`  ✅ Updated reflection ${reflection.id.substring(0, 8)}...`);
      results.updated++;
    } catch (error) {
      console.log(`  ❌ Failed to update: ${error.message}`);
      results.errors.push({ id: reflection.id, error: error.message });
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(70));
  console.log('Summary:');
  console.log('─'.repeat(70));
  console.log(`  📊 Processed: ${results.processed}`);
  console.log(`  ✅ Updated:   ${results.updated}`);
  console.log(`  ⏭️  Skipped:   ${results.skipped} (already had skills)`);
  console.log(`  ⚠️  No skills: ${results.noSkills}`);
  console.log(`  ❌ Errors:    ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of results.errors.slice(0, 5)) {
      console.log(`  • ${err.id.substring(0, 8)}...: ${err.error}`);
    }
    if (results.errors.length > 5) {
      console.log(`  ... and ${results.errors.length - 5} more`);
    }
  }

  console.log('\n' + '='.repeat(70));

  if (options.dryRun) {
    console.log('✅ Dry run complete. Run without --dry-run to apply changes.');
  } else if (results.errors.length === 0) {
    console.log('✅ Reflection backfill completed successfully!');
  } else {
    console.log(`⚠️  Completed with ${results.errors.length} errors`);
  }

  // Skill statistics
  console.log('\n📊 Skill Inference Statistics:');
  const skillCounts = {};
  for (const reflection of reflections) {
    const skills = inferSkillsFromContent(reflection);
    for (const skill of skills) {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1;
    }
  }

  const sortedSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sortedSkills.length > 0) {
    console.log('  Top 10 inferred skills:');
    for (const [skill, count] of sortedSkills) {
      console.log(`    • ${skill}: ${count} reflections`);
    }
  }
}

// Run
backfillReflectionSkills().catch(error => {
  console.error('Fatal error:', error.message);
  if (options.verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});
