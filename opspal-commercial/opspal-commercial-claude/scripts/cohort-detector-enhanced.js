#!/usr/bin/env node

/**
 * Enhanced Cohort Detection Script
 * Uses semantic pattern matching and keyword extraction for better clustering
 */

const fs = require('fs');
const path = require('path');

// Extract key concepts from text using keyword detection
function extractKeywords(text) {
  if (!text) return [];

  const keywords = new Set();
  const normalizedText = text.toLowerCase();

  // Documentation/prompt ambiguity patterns
  if (normalizedText.includes('documentation') ||
      normalizedText.includes('instruction') ||
      normalizedText.includes('ambiguous') ||
      normalizedText.includes('contradictory') ||
      normalizedText.includes('misinterpret') ||
      normalizedText.includes('conflicting information')) {
    keywords.add('documentation-ambiguity');
  }

  // API gotcha patterns
  if (normalizedText.includes('api') && (
      normalizedText.includes('limitation') ||
      normalizedText.includes('architectural limitation') ||
      normalizedText.includes('requires') ||
      normalizedText.includes('permanently') ||
      normalizedText.includes('cannot'))) {
    keywords.add('api-limitation');
  }

  // Validation/schema patterns
  if (normalizedText.includes('validation') ||
      normalizedText.includes('schema') ||
      normalizedText.includes('enum') ||
      normalizedText.includes('constraint')) {
    keywords.add('validation-schema');
  }

  // Agent hallucination patterns
  if (normalizedText.includes('hallucinate') ||
      normalizedText.includes('claimed') && normalizedText.includes('without') ||
      normalizedText.includes('false confidence') ||
      normalizedText.includes('reported') && normalizedText.includes('didn\'t')) {
    keywords.add('agent-hallucination');
  }

  // Configuration patterns
  if (normalizedText.includes('credential') ||
      normalizedText.includes('env') ||
      normalizedText.includes('config') ||
      normalizedText.includes('api key')) {
    keywords.add('configuration');
  }

  // Data quality patterns
  if (normalizedText.includes('field') && (
      normalizedText.includes('normaliz') ||
      normalizedText.includes('mapping') ||
      normalizedText.includes('mismatch'))) {
    keywords.add('data-mapping');
  }

  // Permission/FLS patterns
  if (normalizedText.includes('permission') ||
      normalizedText.includes('fls') ||
      normalizedText.includes('profile')) {
    keywords.add('permissions');
  }

  return Array.from(keywords);
}

// Calculate semantic similarity based on keywords and patterns
function calculateSemanticSimilarity(issue1, issue2) {
  const keywords1 = extractKeywords(issue1.root_cause);
  const keywords2 = extractKeywords(issue2.root_cause);

  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  const intersection = keywords1.filter(k => keywords2.includes(k));
  const union = [...new Set([...keywords1, ...keywords2])];

  return intersection.length / union.length;
}

// Extract issues from reflection
function extractIssues(reflection) {
  const issues = [];

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
          issue_id: issue.id,
          roi_annual: reflection.roi_annual_value || 0
        });
      }
    });
  }

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
          agnostic_fix: issue.agnostic_fix,
          roi_annual: reflection.roi_annual_value || 0
        });
      }
    });
  }

  return issues;
}

// Manual pattern-based cohort detection for known patterns
function detectKnownCohorts(allIssues) {
  const cohorts = [];
  const processed = new Set();

  // Cohort 1: Documentation Ambiguity (prompt-mismatch with conflicting docs)
  const docAmbiguityIssues = allIssues.filter(issue => {
    const keywords = extractKeywords(issue.root_cause);
    return keywords.includes('documentation-ambiguity') && issue.taxonomy === 'prompt-mismatch';
  });

  if (docAmbiguityIssues.length >= 2) {
    docAmbiguityIssues.forEach(i => processed.add(i));
    cohorts.push(createCohort(
      docAmbiguityIssues,
      'prompt-mismatch',
      'Documentation contains contradictory or ambiguous language causing misinterpretation of requirements'
    ));
  }

  // Cohort 2: HubSpot API Limitations (external-api with API constraints)
  const apiLimitationIssues = allIssues.filter(issue => {
    const keywords = extractKeywords(issue.root_cause);
    return keywords.includes('api-limitation') &&
           (issue.taxonomy === 'external-api' || issue.taxonomy === 'tool-contract');
  });

  if (apiLimitationIssues.length >= 2) {
    apiLimitationIssues.forEach(i => processed.add(i));
    cohorts.push(createCohort(
      apiLimitationIssues,
      'external-api',
      'HubSpot API architectural limitations (nested OR filters, permanent deletions, required parameters)'
    ));
  }

  // Cohort 3: Schema Validation Issues (validation before submission)
  const schemaValidationIssues = allIssues.filter(issue => {
    const keywords = extractKeywords(issue.root_cause);
    return keywords.includes('validation-schema') &&
           !processed.has(issue);
  });

  if (schemaValidationIssues.length >= 2) {
    schemaValidationIssues.forEach(i => processed.add(i));
    cohorts.push(createCohort(
      schemaValidationIssues,
      'schema/parse',
      'Missing pre-submission schema validation causing failed API calls with constraint violations'
    ));
  }

  // Cohort 4: Agent Hallucination (claiming success without execution)
  const hallucinationIssues = allIssues.filter(issue => {
    const keywords = extractKeywords(issue.root_cause);
    return keywords.includes('agent-hallucination') &&
           !processed.has(issue);
  });

  if (hallucinationIssues.length >= 1) { // Single P0 hallucination is significant
    hallucinationIssues.forEach(i => processed.add(i));
    cohorts.push(createCohort(
      hallucinationIssues,
      'prompt/LLM mismatch',
      'Sub-agents hallucinate execution results without running actual commands, creating false confidence'
    ));
  }

  // Find remaining singletons
  const singletons = allIssues.filter(issue => !processed.has(issue)).map(issue => ({
    reflection_id: issue.reflection_id,
    org: issue.org,
    taxonomy: issue.taxonomy,
    reason: `No cohort match (unique ${issue.taxonomy} pattern)`
  }));

  return { cohorts, processed, singletons };
}

// Create cohort object
function createCohort(issues, taxonomy, rootCauseSummary) {
  const reflectionIds = [...new Set(issues.map(i => i.reflection_id))];
  const orgs = [...new Set(issues.map(i => i.org).filter(Boolean))];

  // Calculate aggregate ROI
  const aggregateROI = issues.reduce((sum, issue) => sum + (issue.roi_annual || 0), 0);

  // Get latest occurrence
  const dates = issues.map(i => new Date(i.created_at));
  const latestDate = new Date(Math.max(...dates));

  // Get highest priority
  const priorities = issues.map(i => i.priority);
  const priorityRanks = { 'P0': 4, 'P1': 3, 'P2': 2, 'P3': 1 };
  const highestPriority = priorities.reduce((highest, p) => {
    return (priorityRanks[p] || 0) > (priorityRanks[highest] || 0) ? p : highest;
  }, 'P3');

  return {
    cohort_id: `cohort-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    taxonomy: taxonomy,
    root_cause_summary: rootCauseSummary,
    reflection_count: reflectionIds.length,
    affected_orgs: orgs.length > 0 ? orgs : ['unknown'],
    aggregate_roi_annual: aggregateROI,
    priority: highestPriority,
    latest_occurrence: latestDate.toISOString(),
    cohort_score: 0, // Will calculate later
    reflections: reflectionIds.map((id, idx) => {
      const issue = issues.find(i => i.reflection_id === id) || issues[idx];
      return {
        id: id,
        org: issue.org || 'unknown',
        created_at: issue.created_at,
        issue_title: `${issue.taxonomy}: ${issue.root_cause.substring(0, 100)}...`
      };
    }),
    issues: issues.map(i => ({
      reflection_id: i.reflection_id,
      issue_id: i.issue_id,
      root_cause: i.root_cause,
      priority: i.priority,
      blast_radius: i.blast_radius,
      agnostic_fix: i.agnostic_fix
    }))
  };
}

// Calculate cohort scores
function calculateCohortScores(cohorts) {
  if (cohorts.length === 0) return;

  const maxFrequency = Math.max(...cohorts.map(c => c.reflection_count), 1);
  const maxROI = Math.max(...cohorts.map(c => c.aggregate_roi_annual), 1);
  const maxOrgCount = Math.max(...cohorts.map(c => c.affected_orgs.length), 1);

  cohorts.forEach(cohort => {
    const frequencyWeight = 0.3;
    const roiWeight = 0.3;
    const recencyWeight = 0.2;
    const breadthWeight = 0.2;

    const frequencyScore = cohort.reflection_count / maxFrequency;
    const roiScore = maxROI > 0 ? cohort.aggregate_roi_annual / maxROI : 0;

    // Recency score
    const latestDate = new Date(cohort.latest_occurrence);
    const now = new Date();
    const daysSince = (now - latestDate) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - (daysSince / 30));

    const breadthScore = cohort.affected_orgs.length / maxOrgCount;

    cohort.cohort_score = (
      frequencyScore * frequencyWeight +
      roiScore * roiWeight +
      recencyScore * recencyWeight +
      breadthScore * breadthWeight
    );
  });

  // Sort by score descending
  cohorts.sort((a, b) => b.cohort_score - a.cohort_score);
}

// Main detection function
function detectCohorts(reflections) {
  console.error(`\n🔍 Starting enhanced cohort detection on ${reflections.length} reflections...\n`);

  // Extract all issues
  let allIssues = [];
  reflections.forEach(reflection => {
    const issues = extractIssues(reflection);
    allIssues = allIssues.concat(issues);
  });

  console.error(`📊 Extracted ${allIssues.length} issues from reflections\n`);

  // Detect cohorts using pattern matching
  const { cohorts, processed, singletons } = detectKnownCohorts(allIssues);

  console.error(`✓ Found ${cohorts.length} cohorts, ${singletons.length} singletons\n`);

  // Calculate cohort scores
  calculateCohortScores(cohorts);

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
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19).replace('T', '_').replace(/-/g, '');
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
    console.error(`\n🏆 Detected Cohorts:\n`);
    result.cohorts.forEach((cohort, i) => {
      console.error(`${i + 1}. [${cohort.priority}] ${cohort.taxonomy} (score: ${cohort.cohort_score.toFixed(2)})`);
      console.error(`   Reflections: ${cohort.reflection_count}, Orgs: ${cohort.affected_orgs.join(', ')}`);
      console.error(`   ROI: $${cohort.aggregate_roi_annual.toLocaleString()}/year`);
      console.error(`   Root Cause: ${cohort.root_cause_summary}`);
      console.error('');
    });
  }

  // Output JSON to stdout
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { detectCohorts };
