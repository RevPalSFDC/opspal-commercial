#!/usr/bin/env node

/**
 * Org Context Manager
 *
 * Persists and retrieves org-level context across assessments, providing
 * continuity and cross-referencing capabilities between different evaluations.
 *
 * Usage:
 *   node scripts/lib/org-context-manager.js load hivemq
 *   node scripts/lib/org-context-manager.js update hivemq --assessment ./path/to/assessment/
 *   node scripts/lib/org-context-manager.js cross-reference hivemq --latest-assessment ./path/
 *   node scripts/lib/org-context-manager.js generate-summary hivemq
 *
 * Context Structure:
 *   ORG_CONTEXT.json:
 *   {
 *     "org": "hivemq",
 *     "assessments": [...],
 *     "quirks": {...},
 *     "key_metrics": {...},
 *     "recommendations": [...]
 *   }
 */

const fs = require('fs');
const path = require('path');

const CONTEXT_FILE = 'ORG_CONTEXT.json';
const SUMMARY_FILE = 'ORG_SUMMARY.md';

function getInstancePath(orgAlias) {
  return path.join(process.cwd(), 'instances', orgAlias);
}

function getContextPath(orgAlias) {
  return path.join(getInstancePath(orgAlias), CONTEXT_FILE);
}

function loadContext(orgAlias) {
  const contextPath = getContextPath(orgAlias);

  if (!fs.existsSync(contextPath)) {
    console.log(`📂 No existing context found for ${orgAlias}, returning empty context`);
    return {
      org: orgAlias,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      assessments: [],
      quirks: {},
      key_metrics: {},
      recommendations: []
    };
  }

  console.log(`📂 Loading context from ${contextPath}`);
  return JSON.parse(fs.readFileSync(contextPath, 'utf8'));
}

function saveContext(orgAlias, context) {
  const instancePath = getInstancePath(orgAlias);
  const contextPath = getContextPath(orgAlias);

  if (!fs.existsSync(instancePath)) {
    fs.mkdirSync(instancePath, { recursive: true });
  }

  context.last_updated = new Date().toISOString();
  fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
  console.log(`✅ Context saved to ${contextPath}`);
}

function updateWithAssessment(orgAlias, assessmentPath) {
  console.log(`📊 Updating context with assessment from ${assessmentPath}`);

  const context = loadContext(orgAlias);

  // Load assessment data
  const dataPath = path.join(assessmentPath, 'reports', 'COMPREHENSIVE_ASSESSMENT_DATA.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`❌ Assessment data not found at ${dataPath}`);
    process.exit(1);
  }

  const assessmentData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // Add assessment to history
  context.assessments.push({
    type: assessmentData.assessment_type || 'comprehensive',
    date: new Date().toISOString().split('T')[0],
    path: assessmentPath,
    overall_score: assessmentData.overall_score,
    scores: assessmentData.scores,
    key_findings: assessmentData.key_findings || []
  });

  // Update key metrics
  context.key_metrics = {
    ...context.key_metrics,
    last_assessment_score: assessmentData.overall_score,
    assessment_count: context.assessments.length
  };

  saveContext(orgAlias, context);
  console.log(`✅ Context updated with assessment`);
}

function crossReference(orgAlias, latestAssessmentPath) {
  console.log(`🔗 Cross-referencing assessments for ${orgAlias}`);

  const context = loadContext(orgAlias);

  if (context.assessments.length === 0) {
    console.log(`ℹ️  No previous assessments to cross-reference`);
    return;
  }

  // Load latest assessment
  const latestDataPath = path.join(latestAssessmentPath, 'reports', 'COMPREHENSIVE_ASSESSMENT_DATA.json');

  if (!fs.existsSync(latestDataPath)) {
    console.error(`❌ Latest assessment data not found at ${latestDataPath}`);
    process.exit(1);
  }

  const latestData = JSON.parse(fs.readFileSync(latestDataPath, 'utf8'));

  // Identify overlapping areas
  const overlaps = [];

  context.assessments.forEach(prevAssessment => {
    // Compare assessment types
    if (prevAssessment.type !== latestData.assessment_type) {
      // Different assessment types might still have overlapping areas
      const overlap = {
        previous_assessment: prevAssessment.type,
        date: prevAssessment.date,
        overlapping_areas: []
      };

      // Example: CPQ assessment + RevOps assessment overlap in automation, data quality
      if (prevAssessment.type === 'cpq' && latestData.assessment_type === 'comprehensive') {
        overlap.overlapping_areas = [
          'Subscription Management',
          'Automation & Workflows',
          'Data Quality',
          'Product Catalog'
        ];
      }

      if (overlap.overlapping_areas.length > 0) {
        overlaps.push(overlap);
      }
    }
  });

  if (overlaps.length > 0) {
    console.log(`\n🔗 Cross-Reference Results:\n`);
    overlaps.forEach(overlap => {
      console.log(`  Previous Assessment: ${overlap.previous_assessment} (${overlap.date})`);
      console.log(`  Overlapping Areas:`);
      overlap.overlapping_areas.forEach(area => {
        console.log(`    - ${area}`);
      });
      console.log('');
    });
  } else {
    console.log(`ℹ️  No overlapping areas identified between assessments`);
  }

  return overlaps;
}

function generateSummary(orgAlias) {
  console.log(`📄 Generating org summary for ${orgAlias}`);

  const context = loadContext(orgAlias);

  if (context.assessments.length === 0) {
    console.log(`ℹ️  No assessments found for ${orgAlias}`);
    return;
  }

  let md = `# ${orgAlias} - Organization Summary\n\n`;
  md += `**Last Updated:** ${context.last_updated.split('T')[0]}\n`;
  md += `**Total Assessments:** ${context.assessments.length}\n\n`;
  md += `---\n\n`;

  md += `## Assessment History\n\n`;
  md += `| Date | Type | Overall Score | Path |\n`;
  md += `|------|------|---------------|------|\n`;

  context.assessments.forEach(assessment => {
    md += `| ${assessment.date} | ${assessment.type} | ${assessment.overall_score}/100 | ${assessment.path} |\n`;
  });

  md += `\n---\n\n`;

  md += `## Latest Scores by Assessment Type\n\n`;

  const assessmentTypes = [...new Set(context.assessments.map(a => a.type))];

  assessmentTypes.forEach(type => {
    const latestOfType = context.assessments
      .filter(a => a.type === type)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    md += `### ${type.toUpperCase()} Assessment\n\n`;
    md += `**Score:** ${latestOfType.overall_score}/100\n`;
    md += `**Date:** ${latestOfType.date}\n\n`;

    if (latestOfType.scores) {
      md += `**Dimensional Scores:**\n`;
      Object.entries(latestOfType.scores).forEach(([dimension, score]) => {
        md += `- ${dimension}: ${score}\n`;
      });
      md += '\n';
    }
  });

  md += `---\n\n`;

  md += `## Org Quirks\n\n`;

  if (context.quirks && Object.keys(context.quirks).length > 0) {
    md += `**Detected Customizations:**\n`;
    if (context.quirks.label_customizations) {
      md += `- ${context.quirks.label_customizations.length} object label customizations\n`;
    }
    md += `\nSee: \`ORG_QUIRKS.json\` for full details\n\n`;
  } else {
    md += `No org quirks detected or documented.\n\n`;
  }

  md += `---\n\n`;
  md += `**Context File:** \`ORG_CONTEXT.json\`\n`;

  const summaryPath = path.join(getInstancePath(orgAlias), SUMMARY_FILE);
  fs.writeFileSync(summaryPath, md);
  console.log(`✅ Summary saved to ${summaryPath}`);

  return md;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: org-context-manager.js <action> <org-alias> [options]');
    console.error('');
    console.error('Actions:');
    console.error('  load                Load org context (outputs JSON)');
    console.error('  update              Update context with assessment data');
    console.error('  cross-reference     Cross-reference with latest assessment');
    console.error('  generate-summary    Generate ORG_SUMMARY.md');
    console.error('');
    console.error('Examples:');
    console.error('  node org-context-manager.js load hivemq');
    console.error('  node org-context-manager.js update hivemq --assessment ./comprehensive-assessment-2025-10-03/');
    console.error('  node org-context-manager.js cross-reference hivemq --latest-assessment ./path/');
    console.error('  node org-context-manager.js generate-summary hivemq');
    process.exit(1);
  }

  const action = args[0];
  const orgAlias = args[1];

  switch (action) {
    case 'load': {
      const context = loadContext(orgAlias);
      console.log(JSON.stringify(context, null, 2));
      break;
    }

    case 'update': {
      const assessmentIndex = args.indexOf('--assessment');
      if (assessmentIndex === -1 || !args[assessmentIndex + 1]) {
        console.error('❌ --assessment flag required with path to assessment');
        process.exit(1);
      }
      const assessmentPath = args[assessmentIndex + 1];
      updateWithAssessment(orgAlias, assessmentPath);
      break;
    }

    case 'cross-reference': {
      const latestIndex = args.indexOf('--latest-assessment');
      if (latestIndex === -1 || !args[latestIndex + 1]) {
        console.error('❌ --latest-assessment flag required with path');
        process.exit(1);
      }
      const latestPath = args[latestIndex + 1];
      crossReference(orgAlias, latestPath);
      break;
    }

    case 'generate-summary': {
      const summary = generateSummary(orgAlias);
      console.log('\n' + summary);
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadContext,
  saveContext,
  updateWithAssessment,
  crossReference,
  generateSummary
};
