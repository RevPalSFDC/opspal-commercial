#!/usr/bin/env node

/**
 * Cohort Detection Script
 * Analyzes reflections to identify groups with shared root causes
 * Uses fuzzy string matching (Levenshtein distance) for root cause similarity
 */

const fs = require('fs');
const path = require('path');

// Levenshtein distance implementation for string similarity
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity score (0-1)
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - (distance / maxLength);
}

// Normalize text for better matching
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .sort()
    .join(' ');
}

// Calculate Jaccard similarity for token-based matching
function jaccardSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  const tokens1 = new Set(normalizeText(text1).split(' '));
  const tokens2 = new Set(normalizeText(text2).split(' '));

  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

// Extract issues from reflection
function extractIssues(reflection) {
  const issues = [];

  // Check raw_data.issues array (newer format)
  if (reflection.raw_data?.issues && Array.isArray(reflection.raw_data.issues)) {
    reflection.raw_data.issues.forEach(issue => {
      if (issue.taxonomy && issue.root_cause) {
        issues.push({
          reflection_id: reflection.id,
          org: reflection.org,
          created_at: reflection.created_at,
          taxonomy: issue.taxonomy,
          root_cause: issue.root_cause,
          priority: issue.priority || 'P2',
          blast_radius: issue.blast_radius,
          agnostic_fix: issue.agnostic_fix,
          issue_id: issue.id
        });
      }
    });
  }

  // Check issues_identified array (alternative format)
  if (reflection.issues_identified && Array.isArray(reflection.issues_identified)) {
    reflection.issues_identified.forEach(issue => {
      if (issue.taxonomy && issue.root_cause) {
        issues.push({
          reflection_id: reflection.id,
          org: reflection.org,
          created_at: reflection.created_at,
          taxonomy: issue.taxonomy,
          root_cause: issue.root_cause,
          priority: issue.priority || 'P2',
          blast_radius: issue.blast_radius,
          agnostic_fix: issue.agnostic_fix
        });
      }
    });
  }

  return issues;
}

// Group issues by taxonomy
function groupByTaxonomy(issues) {
  const groups = {};

  issues.forEach(issue => {
    if (!groups[issue.taxonomy]) {
      groups[issue.taxonomy] = [];
    }
    groups[issue.taxonomy].push(issue);
  });

  return groups;
}

// Cluster issues by root cause similarity within taxonomy group
function clusterBySimilarity(issues, threshold = 0.7) {
  const clusters = [];
  const processed = new Set();

  issues.forEach((issue, i) => {
    if (processed.has(i)) return;

    const cluster = [issue];
    processed.add(i);

    // Find similar issues
    issues.forEach((otherIssue, j) => {
      if (i !== j && !processed.has(j)) {
        // Use combined similarity (Levenshtein + Jaccard)
        const levSimilarity = calculateSimilarity(issue.root_cause, otherIssue.root_cause);
        const jacSimilarity = jaccardSimilarity(issue.root_cause, otherIssue.root_cause);
        const combinedSimilarity = (levSimilarity * 0.4) + (jacSimilarity * 0.6);

        if (combinedSimilarity >= threshold) {
          cluster.push(otherIssue);
          processed.add(j);
        }
      }
    });

    // Only create cluster if it has 2+ issues
    if (cluster.length >= 2) {
      clusters.push(cluster);
    } else {
      // Reset processed flag for singletons
      processed.delete(i);
    }
  });

  return { clusters, singletonIndices: issues.map((_, i) => i).filter(i => !processed.has(i)) };
}

// Calculate cohort score
function calculateCohortScore(cohort, maxFrequency, maxROI, maxOrgCount) {
  const frequencyWeight = 0.3;
  const roiWeight = 0.3;
  const recencyWeight = 0.2;
  const breadthWeight = 0.2;

  const frequencyScore = maxFrequency > 0 ? cohort.reflection_count / maxFrequency : 0;
  const roiScore = maxROI > 0 ? cohort.aggregate_roi_annual / maxROI : 0;

  // Recency score (more recent = higher score)
  const latestDate = new Date(cohort.latest_occurrence);
  const now = new Date();
  const daysSince = (now - latestDate) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - (daysSince / 30));

  const breadthScore = maxOrgCount > 0 ? cohort.affected_orgs.length / maxOrgCount : 0;

  return (
    frequencyScore * frequencyWeight +
    roiScore * roiWeight +
    recencyScore * recencyWeight +
    breadthScore * breadthWeight
  );
}

// Get priority rank (P0 = 4, P1 = 3, P2 = 2, P3 = 1)
function getPriorityRank(priority) {
  const ranks = { 'P0': 4, 'P1': 3, 'P2': 2, 'P3': 1 };
  return ranks[priority] || 0;
}

// Get highest priority from cluster
function getHighestPriority(cluster) {
  let highest = 'P3';
  let highestRank = 0;

  cluster.forEach(issue => {
    const rank = getPriorityRank(issue.priority);
    if (rank > highestRank) {
      highestRank = rank;
      highest = issue.priority;
    }
  });

  return highest;
}

// Generate cohort from cluster
function generateCohort(cluster, taxonomy) {
  const reflectionIds = [...new Set(cluster.map(i => i.reflection_id))];
  const orgs = [...new Set(cluster.map(i => i.org).filter(Boolean))];

  // Calculate aggregate ROI (use reflection-level ROI if available)
  const aggregateROI = cluster.reduce((sum, issue) => {
    // This is simplified - should look up reflection.roi_annual_value
    return sum;
  }, 0);

  // Get latest occurrence
  const dates = cluster.map(i => new Date(i.created_at));
  const latestDate = new Date(Math.max(...dates));

  // Create root cause summary (use most common or first)
  const rootCauseSummary = cluster[0].root_cause;

  return {
    cohort_id: `cohort-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    taxonomy: taxonomy,
    root_cause_summary: rootCauseSummary,
    reflection_count: reflectionIds.length,
    affected_orgs: orgs,
    aggregate_roi_annual: aggregateROI,
    priority: getHighestPriority(cluster),
    latest_occurrence: latestDate.toISOString(),
    reflections: reflectionIds.map(id => {
      const issue = cluster.find(i => i.reflection_id === id);
      return {
        id: id,
        org: issue.org,
        created_at: issue.created_at,
        issue_title: `${issue.taxonomy}: ${issue.root_cause.substring(0, 80)}...`
      };
    }),
    issues: cluster.map(i => ({
      reflection_id: i.reflection_id,
      issue_id: i.issue_id,
      root_cause: i.root_cause,
      priority: i.priority,
      blast_radius: i.blast_radius
    }))
  };
}

// Main cohort detection function
function detectCohorts(reflections) {
  console.error(`\n🔍 Starting cohort detection on ${reflections.length} reflections...\n`);

  // Extract all issues
  let allIssues = [];
  reflections.forEach(reflection => {
    const issues = extractIssues(reflection);
    allIssues = allIssues.concat(issues);
  });

  console.error(`📊 Extracted ${allIssues.length} issues from reflections\n`);

  // Group by taxonomy
  const taxonomyGroups = groupByTaxonomy(allIssues);

  console.error(`📁 Grouped into ${Object.keys(taxonomyGroups).length} taxonomy categories:\n`);
  Object.keys(taxonomyGroups).forEach(tax => {
    console.error(`   - ${tax}: ${taxonomyGroups[tax].length} issues`);
  });
  console.error('');

  // Cluster each taxonomy group
  const cohorts = [];
  const singletons = [];

  Object.keys(taxonomyGroups).forEach(taxonomy => {
    const issues = taxonomyGroups[taxonomy];

    if (issues.length < 2) {
      // All are singletons
      issues.forEach(issue => {
        singletons.push({
          reflection_id: issue.reflection_id,
          org: issue.org,
          reason: `Only issue with taxonomy '${taxonomy}'`
        });
      });
      return;
    }

    console.error(`🔬 Clustering ${taxonomy} (${issues.length} issues)...`);

    const { clusters, singletonIndices } = clusterBySimilarity(issues, 0.6); // Lower threshold for better grouping

    console.error(`   ✓ Found ${clusters.length} cohorts, ${singletonIndices.length} singletons\n`);

    // Generate cohort objects
    clusters.forEach(cluster => {
      cohorts.push(generateCohort(cluster, taxonomy));
    });

    // Add singletons
    singletonIndices.forEach(idx => {
      const issue = issues[idx];
      singletons.push({
        reflection_id: issue.reflection_id,
        org: issue.org,
        reason: `No similar root cause found in ${taxonomy} taxonomy`
      });
    });
  });

  // Calculate cohort scores
  const maxFrequency = Math.max(...cohorts.map(c => c.reflection_count), 1);
  const maxROI = Math.max(...cohorts.map(c => c.aggregate_roi_annual), 1);
  const maxOrgCount = Math.max(...cohorts.map(c => c.affected_orgs.length), 1);

  cohorts.forEach(cohort => {
    cohort.cohort_score = calculateCohortScore(cohort, maxFrequency, maxROI, maxOrgCount);
  });

  // Sort cohorts by score (descending)
  cohorts.sort((a, b) => b.cohort_score - a.cohort_score);

  return {
    detection_timestamp: new Date().toISOString(),
    total_reflections_analyzed: reflections.length,
    total_issues_extracted: allIssues.length,
    cohorts_detected: cohorts.length,
    cohorts: cohorts,
    singletons: singletons
  };
}

// Main execution
if (require.main === module) {
  const inputFile = process.argv[2] || 'reports/open-reflections-20251013_201652.json';

  console.error(`\n📂 Reading reflections from: ${inputFile}\n`);

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const reflections = data.reflections || data;

  const result = detectCohorts(reflections);

  // Generate output filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
                    new Date().toTimeString().split(' ')[0].replace(/:/g, '');
  const outputFile = `reports/cohorts-${timestamp}.json`;

  // Ensure reports directory exists
  const reportsDir = path.dirname(outputFile);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

  console.error(`\n✅ Cohort detection complete!\n`);
  console.error(`📊 Summary:`);
  console.error(`   - Reflections analyzed: ${result.total_reflections_analyzed}`);
  console.error(`   - Issues extracted: ${result.total_issues_extracted}`);
  console.error(`   - Cohorts detected: ${result.cohorts_detected}`);
  console.error(`   - Singletons: ${result.singletons.length}`);
  console.error(`\n💾 Report saved to: ${outputFile}\n`);

  // Print top cohorts
  if (result.cohorts.length > 0) {
    console.error(`\n🏆 Top Cohorts by Score:\n`);
    result.cohorts.slice(0, 5).forEach((cohort, i) => {
      console.error(`${i + 1}. [${cohort.priority}] ${cohort.taxonomy} (score: ${cohort.cohort_score.toFixed(2)})`);
      console.error(`   Reflections: ${cohort.reflection_count}, Orgs: ${cohort.affected_orgs.join(', ')}`);
      console.error(`   Root Cause: ${cohort.root_cause_summary.substring(0, 100)}...`);
      console.error('');
    });
  }

  // Output JSON to stdout for piping
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { detectCohorts, calculateSimilarity, jaccardSimilarity };
