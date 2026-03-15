#!/usr/bin/env node

/**
 * Copyright 2024-2026 RevPal Corp.
 *
 * Process Reflections - Phase 1: Analysis & Plan Generation
 *
 * Fetches reflections with status='new', detects cohorts, generates
 * implementation-ready plan items, and saves a validated improvement plan.
 *
 * Phase 1 does not create downstream tasks or update reflection statuses.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { CohortFixPlanner } = require('./lib/cohort-fix-planner');
const {
  buildImprovementPlanBundle,
  buildTriageItems
} = require('./lib/improvement-plan-builder');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Check .env file in plugins/opspal-core/');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const COHORT_CONFIG = {
  minSize: 2,
  taxonomyWeight: 0.4,
  rootCauseWeight: 0.3,
  componentWeight: 0.2,
  roiWeight: 0.1
};

const PRIORITY_THRESHOLDS = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1
};

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

async function executePhase1() {
  console.log('🔍 Phase 1: Reflection Analysis & Planning\n');

  try {
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

    console.log('🔁 Step 2: Detecting recurring issues...');
    const recurringIssues = detectRecurringIssues(reflections);
    console.log(`   Identified ${recurringIssues.length} recurring issue patterns\n`);

    console.log('🎯 Step 3: Detecting cohorts via pattern matching...');
    const cohorts = detectCohorts(reflections);
    console.log(`   Detected ${cohorts.length} cohorts (min size: ${COHORT_CONFIG.minSize})\n`);

    console.log('📊 Step 4: Calculating cohort scores and priorities...');
    const scoredCohorts = calculateCohortScores(cohorts, reflections)
      .sort((a, b) => b.score - a.score);
    console.log(`   Prioritized ${scoredCohorts.length} cohorts\n`);

    console.log('🧠 Step 5: Generating implementation-ready plan items...');
    const planner = new CohortFixPlanner();
    const planItems = [];

    for (const cohort of scoredCohorts) {
      const cohortReflections = reflections.filter(reflection => cohort.reflections.includes(reflection.id));
      const planItem = await planner.generateImprovementPlanItem({
        ...cohort,
        reflections: cohortReflections,
        total_roi: cohort.total_roi,
        frequency: cohort.frequency
      });
      planItems.push(planItem);
    }
    console.log(`   Generated ${planItems.length} implementation-ready plan items\n`);

    console.log('🧾 Step 6: Building triage follow-up items...');
    const triageItems = buildTriageItems(reflections, planItems);
    console.log(`   Created ${triageItems.length} triage follow-up items\n`);

    console.log('📝 Step 7: Building validated improvement plan...');
    const planBundle = buildImprovementPlanBundle({
      reflections,
      recurringIssues,
      cohorts: scoredCohorts,
      planItems,
      triageItems,
      title: 'Reflection Improvement Plan',
      downstreamTaskSystem: 'asana'
    });

    console.log('💾 Step 8: Saving outputs...');
    const outputDir = path.join(__dirname, '../output/reflection-processing');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const stamp = new Date().toISOString().split('T')[0];
    const planPath = path.join(outputDir, `improvement-plan-${stamp}.md`);
    const jsonPath = path.join(outputDir, `improvement-plan-${stamp}.json`);
    const dataPath = path.join(outputDir, `phase1-data-${stamp}.json`);

    fs.writeFileSync(planPath, planBundle.markdown);
    fs.writeFileSync(jsonPath, JSON.stringify(planBundle.data, null, 2));
    fs.writeFileSync(dataPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      recurringIssues,
      cohorts: scoredCohorts,
      planItems,
      triageItems
    }, null, 2));

    console.log('\n✅ Phase 1 Complete!\n');
    console.log(`📄 Improvement Plan: ${planPath}`);
    console.log(`🧱 Structured Plan: ${jsonPath}`);
    console.log(`📊 Execution Data: ${dataPath}\n`);

    console.log('📈 Summary:');
    console.log(`   Total Reflections: ${reflections.length}`);
    console.log(`   Implementation-Ready Issues: ${planItems.length}`);
    console.log(`   Triage Follow-Ups: ${triageItems.length}`);
    console.log(`   Total ROI: $${planBundle.data.summary.aggregate_roi_annual.toLocaleString()}`);
    console.log(`   Estimated Effort: ${planBundle.data.summary.estimated_effort_hours}h\n`);

    console.log('🔜 Next Steps:');
    console.log('   1. Review the improvement plan');
    console.log('   2. Approve or refine the implementation-ready items');
    console.log('   3. Feed approved plan items into downstream execution tooling\n');

    return {
      success: true,
      reflections: reflections.length,
      cohorts: scoredCohorts.length,
      planItems: planItems.length,
      triageItems: triageItems.length,
      improvementPlanPath: planPath,
      structuredPlanPath: jsonPath,
      executionDataPath: dataPath
    };
  } catch (error) {
    console.error('❌ Phase 1 failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function fetchNewReflections() {
  const { data, error } = await supabase
    .from('reflections')
    .select('*')
    .eq('reflection_status', 'new')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch reflections: ${error.message}`);
  }

  return (data || []).map(reflection => {
    const issues = reflection.data?.issues_identified || reflection.data?.issues || [];
    const taxonomies = [...new Set(issues.map(issue => normalizeTaxonomy(issue.taxonomy)).filter(Boolean))];
    const rootCauses = [...new Set(issues.map(issue => issue.root_cause).filter(Boolean))];

    const affectedComponents = [];
    if (reflection.data?.wiring?.agents) {
      affectedComponents.push(...reflection.data.wiring.agents.map(agent => agent.agent));
    }
    if (reflection.data?.wiring?.scripts) {
      affectedComponents.push(...reflection.data.wiring.scripts.map(script => script.file));
    }

    return {
      ...reflection,
      taxonomy: taxonomies[0] || normalizeTaxonomy(reflection.focus_area) || 'unknown',
      taxonomies,
      root_cause: rootCauses[0] || reflection.focus_area || '',
      root_causes: rootCauses,
      affected_components: [...new Set(affectedComponents.filter(Boolean))],
      issues,
      issue_count: issues.length
    };
  });
}

function detectRecurringIssues(reflections) {
  const issueMap = new Map();

  reflections.forEach(reflection => {
    const issues = reflection.issues || [];

    if (issues.length === 0) {
      const taxonomy = normalizeTaxonomy(reflection.taxonomy);
      const rootCause = reflection.root_cause || 'unclassified failure signature';
      const key = `${taxonomy}::${rootCause}`;

      if (!issueMap.has(key)) {
        issueMap.set(key, {
          taxonomy,
          root_cause: rootCause,
          occurrences: 0,
          reflections: []
        });
      }

      const issue = issueMap.get(key);
      issue.occurrences++;
      if (!issue.reflections.includes(reflection.id)) {
        issue.reflections.push(reflection.id);
      }
      return;
    }

    issues.forEach(issueData => {
      const taxonomy = normalizeTaxonomy(issueData.taxonomy);
      const rootCause = issueData.root_cause || 'unclassified failure signature';
      const key = `${taxonomy}::${rootCause}`;

      if (!issueMap.has(key)) {
        issueMap.set(key, {
          taxonomy,
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
      if (!issue.reflections.includes(reflection.id)) {
        issue.reflections.push(reflection.id);
      }
    });
  });

  return Array.from(issueMap.values())
    .filter(issue => issue.occurrences >= PRIORITY_THRESHOLDS.CRITICAL)
    .sort((a, b) => b.occurrences - a.occurrences);
}

function detectCohorts(reflections) {
  const cohortMap = new Map();

  reflections.forEach(reflection => {
    const issues = reflection.issues || [];
    const orgName = reflection.org || reflection.instance || reflection.client_name;

    if (issues.length === 0) {
      const taxonomy = normalizeTaxonomy(reflection.taxonomy || reflection.focus_area || 'unknown');

      if (!cohortMap.has(taxonomy)) {
        cohortMap.set(taxonomy, {
          id: taxonomy,
          cohort_id: taxonomy,
          taxonomy,
          root_causes: [],
          affected_components: [],
          affected_orgs: [],
          reflections: [],
          issues: []
        });
      }

      const cohort = cohortMap.get(taxonomy);
      if (!cohort.reflections.includes(reflection.id)) {
        cohort.reflections.push(reflection.id);
      }
      if (reflection.root_cause && !cohort.root_causes.includes(reflection.root_cause)) {
        cohort.root_causes.push(reflection.root_cause);
      }
      if (orgName && !cohort.affected_orgs.includes(orgName)) {
        cohort.affected_orgs.push(orgName);
      }
      (reflection.affected_components || []).forEach(component => {
        if (!cohort.affected_components.includes(component)) {
          cohort.affected_components.push(component);
        }
      });
      return;
    }

    issues.forEach(issueData => {
      const taxonomy = normalizeTaxonomy(issueData.taxonomy || 'unknown');

      if (!cohortMap.has(taxonomy)) {
        cohortMap.set(taxonomy, {
          id: taxonomy,
          cohort_id: taxonomy,
          taxonomy,
          root_causes: [],
          affected_components: [],
          affected_orgs: [],
          reflections: [],
          issues: []
        });
      }

      const cohort = cohortMap.get(taxonomy);
      if (!cohort.reflections.includes(reflection.id)) {
        cohort.reflections.push(reflection.id);
      }
      if (issueData.root_cause && !cohort.root_causes.includes(issueData.root_cause)) {
        cohort.root_causes.push(issueData.root_cause);
      }
      if (orgName && !cohort.affected_orgs.includes(orgName)) {
        cohort.affected_orgs.push(orgName);
      }
      cohort.issues.push({
        reflection_id: reflection.id,
        ...issueData
      });
      (reflection.affected_components || []).forEach(component => {
        if (!cohort.affected_components.includes(component)) {
          cohort.affected_components.push(component);
        }
      });
    });
  });

  return Array.from(cohortMap.values())
    .filter(cohort => cohort.reflections.length >= COHORT_CONFIG.minSize);
}

function calculateCohortScores(cohorts, reflections) {
  return cohorts.map(cohort => {
    const cohortReflections = reflections.filter(reflection => cohort.reflections.includes(reflection.id));
    const frequency = cohortReflections.length;
    const totalROI = cohortReflections.reduce((sum, reflection) => sum + (reflection.roi_annual_value || 0), 0);
    const avgRecency = cohortReflections.reduce((sum, reflection) => {
      return sum + (Date.now() - new Date(reflection.created_at).getTime());
    }, 0) / Math.max(frequency, 1);
    const breadth = new Set(cohortReflections.flatMap(reflection => reflection.affected_components || [])).size;

    const score = (
      (frequency * COHORT_CONFIG.taxonomyWeight * 100) +
      (Math.log10(totalROI + 1) * COHORT_CONFIG.roiWeight * 100) +
      (1 / Math.max(avgRecency / (1000 * 60 * 60 * 24), 1) * COHORT_CONFIG.rootCauseWeight * 100) +
      (breadth * COHORT_CONFIG.componentWeight * 100)
    );

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
      root_cause_summary: cohort.root_causes[0] || '',
      runbook_references: getRunbookReferences(cohort.taxonomy)
    };
  });
}

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

module.exports = {
  executePhase1,
  fetchNewReflections,
  detectRecurringIssues,
  detectCohorts,
  calculateCohortScores
};
