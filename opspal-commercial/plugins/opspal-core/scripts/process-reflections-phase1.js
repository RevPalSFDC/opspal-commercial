#!/usr/bin/env node

/**
 * Copyright 2024-2026 RevPal Corp.
 *
 * Process Reflections - Phase 1: Analysis & Plan Generation
 *
 * Fetches reflections with status='new', detects cohorts, invokes fix planner,
 * and generates improvement plan for user approval.
 *
 * DOES NOT create Asana tasks or update reflection statuses - analysis only.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment configuration
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Supabase client setup - MUST use service role key for updates
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Check .env file in plugins/opspal-core/');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Cohort detection configuration
 */
const COHORT_CONFIG = {
  minSize: 2,
  taxonomyWeight: 0.4,
  rootCauseWeight: 0.3,
  componentWeight: 0.2,
  roiWeight: 0.1
};

/**
 * Priority thresholds
 */
const PRIORITY_THRESHOLDS = {
  CRITICAL: 3,  // 3+ occurrences
  HIGH: 2,      // 2 occurrences
  MEDIUM: 1     // Single occurrence but high ROI
};

/**
 * Cohort taxonomy -> runbook artifact references.
 * Used to enforce runbook-first remediation planning.
 */
const COHORT_RUNBOOK_REFERENCES = {
  'data-quality': [
    'plugins/opspal-salesforce/docs/runbooks/data-quality-operations/README.md',
    'plugins/opspal-hubspot/docs/runbooks/data-quality/README.md',
    'plugins/opspal-marketo/docs/runbooks/lead-management/lead-quality-maintenance.md'
  ],
  'config/env': [
    'plugins/opspal-salesforce/docs/runbooks/environment-configuration/README.md'
  ],
  'auth/permissions': [
    'plugins/opspal-salesforce/contexts/metadata-manager/fls-field-deployment.md',
    'plugins/opspal-salesforce/docs/PERMISSION_SET_USER_GUIDE.md'
  ],
  'prompt-mismatch': [
    'plugins/opspal-salesforce/docs/runbooks/automation-feasibility/README.md',
    'plugins/opspal-salesforce/docs/AUTO_AGENT_ROUTING.md',
    'docs/routing-help.md'
  ],
  'schema/parse': [
    'plugins/opspal-salesforce/docs/runbooks/territory-management/03-territory2-object-relationships.md',
    'plugins/opspal-salesforce/docs/runbooks/territory-management/10-troubleshooting-guide.md'
  ],
  'tool-contract': [
    'plugins/opspal-salesforce/docs/CLI_COMMAND_VALIDATOR_USAGE.md',
    'plugins/opspal-core/scripts/lib/tool-contract-validator.js',
    'plugins/opspal-core/scripts/lib/api-capability-checker.js'
  ]
};

const TAXONOMY_ALIASES = {
  'tool-contract-mismatch': 'tool-contract',
  'tool contract': 'tool-contract',
  'tool-contract mismatch': 'tool-contract',
  'prompt/llm mismatch': 'prompt-mismatch',
  'prompt mismatch': 'prompt-mismatch',
  'schema-parse': 'schema/parse',
  'schema parse': 'schema/parse',
  'data quality': 'data-quality'
};

function normalizeTaxonomy(taxonomy = '') {
  const base = String(taxonomy).trim().toLowerCase();
  if (!base) return 'unknown';
  return TAXONOMY_ALIASES[base] || base;
}

function getRunbookReferences(taxonomy) {
  const normalized = normalizeTaxonomy(taxonomy);
  return COHORT_RUNBOOK_REFERENCES[normalized] || [];
}

/**
 * Main Phase 1 execution
 */
async function executePhase1() {
  console.log('🔍 Phase 1: Reflection Analysis & Planning\n');

  try {
    // Step 1: Fetch reflections with status='new'
    console.log('📥 Step 1: Fetching reflections with status="new"...');
    const reflections = await fetchNewReflections();
    console.log(`   Found ${reflections.length} reflections to analyze\n`);

    if (reflections.length === 0) {
      console.log('✅ No new reflections to process');
      return {
        success: true,
        reflections: 0,
        cohorts: 0,
        message: 'No new reflections found'
      };
    }

    // Step 2: Detect recurring issues
    console.log('🔁 Step 2: Detecting recurring issues...');
    const recurringIssues = detectRecurringIssues(reflections);
    console.log(`   Identified ${recurringIssues.length} recurring issue patterns\n`);

    // Step 3: Detect cohorts
    console.log('🎯 Step 3: Detecting cohorts via pattern matching...');
    const cohorts = detectCohorts(reflections);
    console.log(`   Detected ${cohorts.length} cohorts (min size: ${COHORT_CONFIG.minSize})\n`);

    if (cohorts.length === 0) {
      console.log('⚠️  No cohorts detected - all reflections are unique');
      console.log('   Consider processing individually or adjusting cohort thresholds\n');
    }

    // Step 4: Calculate cohort scores and priorities
    console.log('📊 Step 4: Calculating cohort scores and priorities...');
    const scoredCohorts = calculateCohortScores(cohorts, reflections);
    scoredCohorts.sort((a, b) => b.score - a.score);
    console.log(`   Prioritized ${scoredCohorts.length} cohorts\n`);

    // Step 5: Generate improvement plan
    console.log('📝 Step 5: Generating improvement plan document...');
    const improvementPlan = generateImprovementPlan(
      reflections,
      recurringIssues,
      scoredCohorts
    );

    // Step 6: Save outputs
    console.log('💾 Step 6: Saving outputs...');
    const outputDir = path.join(__dirname, '../output/reflection-processing');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const planPath = path.join(outputDir, `improvement-plan-${timestamp}.md`);
    const dataPath = path.join(outputDir, `phase1-data-${timestamp}.json`);

    fs.writeFileSync(planPath, improvementPlan);
    fs.writeFileSync(dataPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      reflections: reflections.map(r => ({
        id: r.id,
        taxonomy: r.taxonomy,
        root_cause: r.root_cause,
        affected_components: r.affected_components,
        roi_annual_value: r.roi_annual_value
      })),
      recurringIssues,
      cohorts: scoredCohorts
    }, null, 2));

    console.log(`\n✅ Phase 1 Complete!\n`);
    console.log(`📄 Improvement Plan: ${planPath}`);
    console.log(`📊 Execution Data: ${dataPath}\n`);

    // Summary
    console.log('📈 Summary:');
    console.log(`   Total Reflections: ${reflections.length}`);
    console.log(`   Recurring Issues: ${recurringIssues.length}`);
    console.log(`   Cohorts Detected: ${scoredCohorts.length}`);
    console.log(`   Critical Priority: ${scoredCohorts.filter(c => c.priority === 'CRITICAL').length}`);
    console.log(`   High Priority: ${scoredCohorts.filter(c => c.priority === 'HIGH').length}`);
    console.log(`   Total ROI: $${scoredCohorts.reduce((sum, c) => sum + c.total_roi, 0).toLocaleString()}\n`);

    console.log('🔜 Next Steps:');
    console.log('   1. Review improvement plan document');
    console.log('   2. Approve or modify recommendations');
    console.log('   3. Run Phase 2 to create Asana tasks and update statuses\n');

    return {
      success: true,
      reflections: reflections.length,
      cohorts: scoredCohorts.length,
      improvementPlanPath: planPath,
      executionDataPath: dataPath
    };

  } catch (error) {
    console.error('❌ Phase 1 failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Fetch reflections with status='new' from Supabase
 * and normalize the data structure to extract issues
 */
async function fetchNewReflections() {
  const { data, error } = await supabase
    .from('reflections')
    .select('*')
    .eq('reflection_status', 'new')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch reflections: ${error.message}`);
  }

  // Normalize reflections to extract issues from nested data structure
  return (data || []).map(r => {
    // Extract issues from data.issues_identified or data.issues
    const issues = r.data?.issues_identified || r.data?.issues || [];

    // Get primary taxonomy and root_cause from first issue, or aggregate
    const taxonomies = [...new Set(issues.map(i => i.taxonomy).filter(Boolean))];
    const rootCauses = [...new Set(issues.map(i => i.root_cause).filter(Boolean))];

    // Extract affected components from wiring
    const affectedComponents = [];
    if (r.data?.wiring?.agents) {
      affectedComponents.push(...r.data.wiring.agents.map(a => a.agent));
    }
    if (r.data?.wiring?.scripts) {
      affectedComponents.push(...r.data.wiring.scripts.map(s => s.file));
    }

    return {
      ...r,
      // Normalized fields for cohort detection
      taxonomy: taxonomies[0] || r.focus_area || 'unknown',
      taxonomies: taxonomies,
      root_cause: rootCauses[0] || 'unknown',
      root_causes: rootCauses,
      affected_components: affectedComponents,
      issues: issues,
      issue_count: issues.length
    };
  });
}

/**
 * Detect recurring issues (3+ occurrences)
 * Expands multiple issues per reflection into individual entries
 */
function detectRecurringIssues(reflections) {
  const issueMap = new Map();

  reflections.forEach(r => {
    // Process each issue within the reflection
    const issues = r.issues || [];

    if (issues.length === 0) {
      // Fallback to normalized taxonomy/root_cause if no issues array
      const key = `${r.taxonomy}::${r.root_cause}`;
      if (!issueMap.has(key)) {
        issueMap.set(key, {
          taxonomy: r.taxonomy,
          root_cause: r.root_cause,
          occurrences: 0,
          reflections: []
        });
      }
      const issue = issueMap.get(key);
      issue.occurrences++;
      if (!issue.reflections.includes(r.id)) {
        issue.reflections.push(r.id);
      }
    } else {
      // Process each individual issue
      issues.forEach(issueData => {
        const taxonomy = issueData.taxonomy || 'unknown';
        const rootCause = issueData.root_cause || 'unknown';
        const key = `${taxonomy}::${rootCause}`;

        if (!issueMap.has(key)) {
          issueMap.set(key, {
            taxonomy: taxonomy,
            root_cause: rootCause,
            priority: issueData.priority || 'P3',
            agnostic_fix: issueData.agnostic_fix,
            minimal_patch: issueData.minimal_patch,
            occurrences: 0,
            reflections: []
          });
        }
        const issue = issueMap.get(key);
        issue.occurrences++;
        if (!issue.reflections.includes(r.id)) {
          issue.reflections.push(r.id);
        }
      });
    }
  });

  // Filter to recurring (3+)
  return Array.from(issueMap.values())
    .filter(issue => issue.occurrences >= PRIORITY_THRESHOLDS.CRITICAL)
    .sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Detect cohorts using pattern matching
 * Groups by taxonomy (from issues) to find patterns across reflections
 */
function detectCohorts(reflections) {
  const cohortMap = new Map();

  reflections.forEach(r => {
    const issues = r.issues || [];

    if (issues.length === 0) {
      // Fallback: use reflection-level taxonomy/focus_area
      const taxonomy = r.taxonomy || r.focus_area || 'unknown';
      const cohortKey = taxonomy;

      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, {
          id: cohortKey,
          taxonomy,
          root_causes: [],
          affected_components: [],
          reflections: [],
          issues: []
        });
      }

      const cohort = cohortMap.get(cohortKey);
      if (!cohort.reflections.includes(r.id)) {
        cohort.reflections.push(r.id);
      }
      if (r.root_cause && !cohort.root_causes.includes(r.root_cause)) {
        cohort.root_causes.push(r.root_cause);
      }
      (r.affected_components || []).forEach(comp => {
        if (!cohort.affected_components.includes(comp)) {
          cohort.affected_components.push(comp);
        }
      });
    } else {
      // Group by taxonomy from each issue
      issues.forEach(issueData => {
        const taxonomy = issueData.taxonomy || 'unknown';
        const cohortKey = taxonomy;

        if (!cohortMap.has(cohortKey)) {
          cohortMap.set(cohortKey, {
            id: cohortKey,
            taxonomy,
            root_causes: [],
            affected_components: [],
            reflections: [],
            issues: []
          });
        }

        const cohort = cohortMap.get(cohortKey);
        if (!cohort.reflections.includes(r.id)) {
          cohort.reflections.push(r.id);
        }
        if (issueData.root_cause && !cohort.root_causes.includes(issueData.root_cause)) {
          cohort.root_causes.push(issueData.root_cause);
        }
        cohort.issues.push({
          reflection_id: r.id,
          ...issueData
        });

        // Add affected components from wiring
        (r.affected_components || []).forEach(comp => {
          if (!cohort.affected_components.includes(comp)) {
            cohort.affected_components.push(comp);
          }
        });
      });
    }
  });

  // Filter to minimum cohort size
  return Array.from(cohortMap.values())
    .filter(cohort => cohort.reflections.length >= COHORT_CONFIG.minSize);
}

/**
 * Calculate cohort scores and priorities
 */
function calculateCohortScores(cohorts, reflections) {
  return cohorts.map(cohort => {
    const cohortReflections = reflections.filter(r =>
      cohort.reflections.includes(r.id)
    );

    // Calculate score components
    const frequency = cohortReflections.length;
    const totalROI = cohortReflections.reduce((sum, r) =>
      sum + (r.roi_annual_value || 0), 0
    );
    const avgRecency = cohortReflections.reduce((sum, r) =>
      sum + (Date.now() - new Date(r.created_at).getTime()), 0
    ) / frequency;
    const breadth = new Set(
      cohortReflections.flatMap(r => r.affected_components || [])
    ).size;

    // Weighted score
    const score = (
      (frequency * COHORT_CONFIG.taxonomyWeight * 100) +
      (Math.log10(totalROI + 1) * COHORT_CONFIG.roiWeight * 100) +
      (1 / (avgRecency / (1000 * 60 * 60 * 24)) * COHORT_CONFIG.rootCauseWeight * 100) +
      (breadth * COHORT_CONFIG.componentWeight * 100)
    );

    // Determine priority
    let priority = 'MEDIUM';
    if (frequency >= PRIORITY_THRESHOLDS.CRITICAL) {
      priority = 'CRITICAL';
    } else if (frequency >= PRIORITY_THRESHOLDS.HIGH) {
      priority = 'HIGH';
    }

    return {
      ...cohort,
      frequency,
      total_roi: totalROI,
      avg_recency_days: avgRecency / (1000 * 60 * 60 * 24),
      breadth,
      score: Math.round(score),
      priority,
      runbook_references: getRunbookReferences(cohort.taxonomy)
    };
  });
}

/**
 * Generate improvement plan document
 */
function generateImprovementPlan(reflections, recurringIssues, cohorts) {
  const timestamp = new Date().toISOString();

  let markdown = `# Reflection Processing - Improvement Plan\n\n`;
  markdown += `**Generated**: ${timestamp}\n`;
  markdown += `**Total Reflections Analyzed**: ${reflections.length}\n`;
  markdown += `**Cohorts Detected**: ${cohorts.length}\n`;
  markdown += `**Recurring Issues**: ${recurringIssues.length}\n\n`;

  markdown += `---\n\n`;
  markdown += `## Executive Summary\n\n`;

  const criticalCount = cohorts.filter(c => c.priority === 'CRITICAL').length;
  const highCount = cohorts.filter(c => c.priority === 'HIGH').length;
  const totalROI = cohorts.reduce((sum, c) => sum + c.total_roi, 0);

  markdown += `This analysis identified **${cohorts.length} cohorts** from ${reflections.length} reflections:\n\n`;
  markdown += `- **${criticalCount} CRITICAL** priority cohorts (3+ occurrences)\n`;
  markdown += `- **${highCount} HIGH** priority cohorts (2 occurrences)\n`;
  markdown += `- **Total Annual ROI**: $${totalROI.toLocaleString()}\n\n`;

  if (criticalCount > 0) {
    markdown += `⚠️  **Action Required**: ${criticalCount} recurring issues require immediate attention.\n\n`;
  }

  markdown += `---\n\n`;
  markdown += `## Recurring Issues (3+ Occurrences)\n\n`;

  if (recurringIssues.length === 0) {
    markdown += `*No recurring issues detected.*\n\n`;
  } else {
    recurringIssues.forEach((issue, idx) => {
      markdown += `### ${idx + 1}. ${issue.taxonomy}\n\n`;
      markdown += `**Root Cause**: ${issue.root_cause}\n\n`;
      markdown += `- **Occurrences**: ${issue.occurrences}\n`;
      markdown += `- **Priority**: ${issue.priority || 'CRITICAL'}\n`;
      if (issue.agnostic_fix) {
        markdown += `- **Suggested Fix**: ${issue.agnostic_fix}\n`;
      }
      if (issue.minimal_patch) {
        markdown += `- **Minimal Patch**: ${issue.minimal_patch}\n`;
      }
      // Show sample reflection IDs
      if (issue.reflections.length <= 5) {
        markdown += `- **Reflection IDs**: ${issue.reflections.join(', ')}\n\n`;
      } else {
        markdown += `- **Reflection IDs** (${issue.reflections.length} total): ${issue.reflections.slice(0, 5).join(', ')}...\n\n`;
      }
    });
  }

  markdown += `---\n\n`;
  markdown += `## Detected Cohorts (Sorted by Priority)\n\n`;

  if (cohorts.length === 0) {
    markdown += `*No cohorts detected - all reflections are unique.*\n\n`;
  } else {
    cohorts.forEach((cohort, idx) => {
      markdown += `### Cohort ${idx + 1}: ${cohort.taxonomy}\n\n`;
      markdown += `**Priority**: ${cohort.priority} | **Score**: ${cohort.score}\n\n`;

      // Show root causes (may be multiple)
      const rootCauses = cohort.root_causes || [cohort.root_cause];
      if (rootCauses.length === 1) {
        markdown += `- **Root Cause**: ${rootCauses[0]}\n`;
      } else {
        markdown += `- **Root Causes** (${rootCauses.length}):\n`;
        rootCauses.slice(0, 5).forEach(rc => {
          markdown += `  - ${rc}\n`;
        });
        if (rootCauses.length > 5) {
          markdown += `  - ... and ${rootCauses.length - 5} more\n`;
        }
      }

      markdown += `- **Frequency**: ${cohort.frequency} reflections\n`;
      markdown += `- **Total ROI**: $${cohort.total_roi.toLocaleString()}\n`;
      markdown += `- **Affected Components**: ${cohort.affected_components.slice(0, 10).join(', ') || 'N/A'}`;
      if (cohort.affected_components.length > 10) {
        markdown += ` ... and ${cohort.affected_components.length - 10} more`;
      }
      markdown += `\n`;
      markdown += `- **Avg Recency**: ${Math.round(cohort.avg_recency_days)} days\n`;
      markdown += `- **Breadth**: ${cohort.breadth} unique components\n\n`;

      if (cohort.runbook_references && cohort.runbook_references.length > 0) {
        markdown += `**Runbook References**:\n`;
        cohort.runbook_references.forEach(ref => {
          markdown += `- \`${ref}\`\n`;
        });
        markdown += `\n`;
      }

      // Show sample reflection IDs (not all if too many)
      if (cohort.reflections.length <= 10) {
        markdown += `**Reflection IDs**: ${cohort.reflections.join(', ')}\n\n`;
      } else {
        markdown += `**Reflection IDs** (showing 10 of ${cohort.reflections.length}):\n`;
        markdown += `${cohort.reflections.slice(0, 10).join(', ')}\n\n`;
      }

      markdown += `#### Recommended Actions\n\n`;
      markdown += `*To be generated by supabase-fix-planner agent in Phase 2*\n\n`;
      markdown += `---\n\n`;
    });
  }

  markdown += `## Next Steps\n\n`;
  markdown += `1. **Review** this improvement plan\n`;
  markdown += `2. **Approve** recommended cohorts for processing\n`;
  markdown += `3. **Run Phase 2** to:\n`;
  markdown += `   - Invoke supabase-fix-planner for each cohort\n`;
  markdown += `   - Create Asana tasks\n`;
  markdown += `   - Update reflection statuses to 'under_review'\n\n`;
  markdown += `## Phase 2 Command\n\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `node scripts/process-reflections-phase2.js\n`;
  markdown += `\`\`\`\n\n`;

  return markdown;
}

// Execute if run directly
if (require.main === module) {
  executePhase1()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { executePhase1, detectCohorts, calculateCohortScores };
