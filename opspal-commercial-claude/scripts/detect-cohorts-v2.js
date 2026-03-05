#!/usr/bin/env node

/**
 * Cohort Detection Script v2
 * Enhanced version with better handling of missing root causes
 * Groups by taxonomy when root causes are similar or missing
 *
 * Usage: node scripts/detect-cohorts-v2.js <input-file> [minCohortSize] [similarityThreshold]
 */

const fs = require('fs');
const path = require('path');

// Simple UUID generator
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Fuzzy text similarity using Jaccard index
function calculateSimilarity(text1, text2) {
  if (!text1 || !text2 || text1 === 'Unknown root cause' || text2 === 'Unknown root cause') {
    return 0;
  }

  const normalize = (text) => text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);

  const words1 = normalize(text1);
  const words2 = normalize(text2);

  if (words1.length === 0 || words2.length === 0) {
    return 0;
  }

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

// Calculate cohort score
function calculateCohortScore(cohort, maxFrequency, maxROI, maxOrgCount) {
  const frequencyWeight = 0.35;
  const roiWeight = 0.25;
  const recencyWeight = 0.20;
  const breadthWeight = 0.20;

  const frequencyScore = cohort.reflection_count / maxFrequency;
  const roiScore = maxROI > 0 ? cohort.aggregate_roi_annual / maxROI : 0;

  // Recency score (more recent = higher score)
  const daysSince = (Date.now() - new Date(cohort.latest_occurrence).getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - (daysSince / 30));

  const breadthScore = cohort.affected_orgs.length / maxOrgCount;

  return (
    frequencyScore * frequencyWeight +
    roiScore * roiWeight +
    recencyScore * recencyWeight +
    breadthScore * breadthWeight
  );
}

// Determine cohort priority based on issue priorities
function determineCohortPriority(issues) {
  const priorities = issues.map(i => i.priority).filter(Boolean);

  if (priorities.includes('P0')) return 'P0';
  if (priorities.filter(p => p === 'P1').length >= priorities.length * 0.5) return 'P1';
  if (priorities.includes('P1')) return 'P1';
  if (priorities.includes('P2')) return 'P2';
  return 'P3';
}

// Extract meaningful root cause summary
function extractRootCauseSummary(issues) {
  const rootCauses = issues
    .map(i => i.root_cause)
    .filter(rc => rc && rc !== 'Unknown root cause');

  if (rootCauses.length === 0) {
    return 'No specific root cause identified';
  }

  // Use first valid root cause as representative
  return rootCauses[0];
}

// Main cohort detection logic
function detectCohorts(reflections, minCohortSize = 3, similarityThreshold = 0.5) {
  console.log(`\nAnalyzing ${reflections.length} reflections...`);
  console.log(`Configuration: minCohortSize=${minCohortSize}, similarityThreshold=${similarityThreshold}`);

  // Extract all issues from reflections
  const issuesWithReflection = [];
  reflections.forEach(reflection => {
    if (reflection.issues_identified && reflection.issues_identified.length > 0) {
      reflection.issues_identified.forEach(issue => {
        issuesWithReflection.push({
          ...issue,
          reflection_id: reflection.id,
          reflection_org: reflection.org,
          reflection_created_at: reflection.created_at,
          reflection_roi: reflection.roi_annual_value || 0,
          reflection_duration: reflection.duration_minutes,
          reflection_focus_area: reflection.focus_area
        });
      });
    }
  });

  console.log(`Extracted ${issuesWithReflection.length} issues from reflections`);

  // Normalize taxonomy variations
  const taxonomyNormalization = {
    'schema/parse': 'schema/parse',
    'schema-parse': 'schema/parse',
    'prompt-mismatch': 'prompt-mismatch',
    'prompt/LLM-mismatch': 'prompt-mismatch',
    'prompt/LLM mismatch': 'prompt-mismatch',
    'tool-contract mismatch': 'tool-contract',
    'tool-contract': 'tool-contract',
    'idempotency/state': 'idempotency/state',
    'idempotency-state': 'idempotency/state',
    'external-api drift': 'external-api',
    'external-api': 'external-api',
    'config/env': 'config/env',
    'concurrency/order': 'concurrency/order',
    'data-quality': 'data-quality',
    'auth/permissions': 'auth/permissions',
    'rate-limit': 'rate-limit',
    'unknown': 'unknown'
  };

  // Group by normalized taxonomy (Tier 1)
  const taxonomyGroups = {};
  issuesWithReflection.forEach(issue => {
    const rawTaxonomy = issue.taxonomy || 'unknown';
    const taxonomy = taxonomyNormalization[rawTaxonomy] || rawTaxonomy;
    if (!taxonomyGroups[taxonomy]) {
      taxonomyGroups[taxonomy] = [];
    }
    taxonomyGroups[taxonomy].push(issue);
  });

  console.log(`\nNormalized taxonomy groups: ${Object.keys(taxonomyGroups).length}`);
  Object.entries(taxonomyGroups)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([taxonomy, issues]) => {
      console.log(`  ${taxonomy}: ${issues.length} issues`);
    });

  // Within each taxonomy, cluster by root cause similarity (Tier 2)
  const cohorts = [];
  const processedIssues = new Set();

  Object.entries(taxonomyGroups).forEach(([taxonomy, issues]) => {
    if (issues.length < minCohortSize) {
      console.log(`\nSkipping ${taxonomy} - only ${issues.length} issues (min: ${minCohortSize})`);
      return;
    }

    console.log(`\nProcessing taxonomy: ${taxonomy} (${issues.length} issues)`);

    // For taxonomies with enough issues, create cohort even if root causes vary
    // This groups by issue type (taxonomy) rather than specific root cause
    if (issues.length >= minCohortSize) {
      // Get unique reflections
      const reflectionIds = [...new Set(issues.map(i => i.reflection_id))];

      if (reflectionIds.length >= minCohortSize) {
        const affectedOrgs = [...new Set(issues.map(i => i.reflection_org))];

        // Get latest occurrence
        const dates = issues.map(i => new Date(i.reflection_created_at));
        const latestOccurrence = new Date(Math.max(...dates)).toISOString();

        // Aggregate ROI
        const aggregateROI = issues.reduce((sum, i) => sum + (i.reflection_roi || 0), 0);

        // Determine priority
        const priority = determineCohortPriority(issues);

        // Create root cause summary
        const rootCauseSummary = extractRootCauseSummary(issues);

        cohorts.push({
          cohort_id: uuidv4(),
          taxonomy: taxonomy,
          root_cause_summary: rootCauseSummary,
          reflection_count: reflectionIds.length,
          issue_count: issues.length,
          affected_orgs: affectedOrgs,
          aggregate_roi_annual: aggregateROI,
          priority: priority,
          latest_occurrence: latestOccurrence,
          reflections: reflectionIds,
          sample_issues: issues.slice(0, 5).map(i => ({
            id: i.id,
            reflection_id: i.reflection_id,
            root_cause: i.root_cause,
            agnostic_fix: i.agnostic_fix,
            blast_radius: i.blast_radius,
            priority: i.priority
          }))
        });

        console.log(`  ✓ Created cohort: ${reflectionIds.length} reflections, ${issues.length} issues`);
      }
    }
  });

  // Calculate cohort scores
  const maxFrequency = Math.max(...cohorts.map(c => c.reflection_count), 1);
  const maxROI = Math.max(...cohorts.map(c => c.aggregate_roi_annual), 1);
  const maxOrgCount = Math.max(...cohorts.map(c => c.affected_orgs.length), 1);

  cohorts.forEach(cohort => {
    cohort.cohort_score = calculateCohortScore(cohort, maxFrequency, maxROI, maxOrgCount);
  });

  // Sort by score
  cohorts.sort((a, b) => b.cohort_score - a.cohort_score);

  // Find singletons (reflections not in any cohort)
  const reflectionsInCohorts = new Set();
  cohorts.forEach(cohort => {
    cohort.reflections.forEach(id => reflectionsInCohorts.add(id));
  });

  const singletons = reflections
    .filter(r => !reflectionsInCohorts.has(r.id))
    .map(r => ({
      reflection_id: r.id,
      org: r.org,
      focus_area: r.focus_area,
      total_issues: r.total_issues,
      reason_no_match: r.total_issues === 0 ? 'No issues identified' : 'Taxonomy has too few reflections for cohort'
    }));

  return {
    cohorts,
    singletons,
    stats: {
      total_reflections_analyzed: reflections.length,
      cohorts_detected: cohorts.length,
      reflections_in_cohorts: reflectionsInCohorts.size,
      singleton_reflections: singletons.length
    }
  };
}

// Main execution
if (require.main === module) {
  const inputFile = process.argv[2];
  const minCohortSize = parseInt(process.argv[3]) || 3;
  const similarityThreshold = parseFloat(process.argv[4]) || 0.5;

  if (!inputFile) {
    console.error('Usage: node scripts/detect-cohorts-v2.js <input-file> [minCohortSize] [similarityThreshold]');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`Reading reflections from: ${inputFile}`);
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  const { cohorts, singletons, stats } = detectCohorts(data.reflections, minCohortSize, similarityThreshold);

  // Create output
  const output = {
    detection_timestamp: new Date().toISOString(),
    detection_config: {
      min_cohort_size: minCohortSize,
      similarity_threshold: similarityThreshold
    },
    ...stats,
    cohorts: cohorts.map(c => ({
      cohort_id: c.cohort_id,
      taxonomy: c.taxonomy,
      root_cause_summary: c.root_cause_summary,
      reflection_count: c.reflection_count,
      issue_count: c.issue_count,
      affected_orgs: c.affected_orgs,
      aggregate_roi_annual: c.aggregate_roi_annual,
      priority: c.priority,
      latest_occurrence: c.latest_occurrence,
      cohort_score: parseFloat(c.cohort_score.toFixed(3)),
      reflections: c.reflections,
      sample_issues: c.sample_issues
    })),
    singletons: singletons
  };

  // Write output file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const outputFile = path.join(
    path.dirname(inputFile),
    `cohorts-detected-${timestamp}.json`
  );

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\n✅ Cohort detection complete!`);
  console.log(`📊 Results written to: ${outputFile}`);
  console.log(`\n📈 Summary:`);
  console.log(`   Total reflections: ${stats.total_reflections_analyzed}`);
  console.log(`   Cohorts detected: ${stats.cohorts_detected}`);
  console.log(`   Reflections in cohorts: ${stats.reflections_in_cohorts}`);
  console.log(`   Singleton reflections: ${stats.singleton_reflections}`);
  console.log(`   Coverage: ${((stats.reflections_in_cohorts / stats.total_reflections_analyzed) * 100).toFixed(1)}%`);

  console.log(`\n🏆 Top 10 Cohorts by Score:`);
  cohorts.slice(0, 10).forEach((cohort, i) => {
    console.log(`\n${i + 1}. [${cohort.priority}] ${cohort.taxonomy}`);
    console.log(`   Score: ${cohort.cohort_score.toFixed(3)}`);
    console.log(`   Reflections: ${cohort.reflection_count}, Issues: ${cohort.issue_count}`);
    console.log(`   Orgs: ${cohort.affected_orgs.join(', ')}`);
    console.log(`   ROI: $${cohort.aggregate_roi_annual.toLocaleString()}/year`);
    console.log(`   Root Cause: ${cohort.root_cause_summary.substring(0, 120)}...`);
  });
}

module.exports = { detectCohorts, calculateSimilarity };
