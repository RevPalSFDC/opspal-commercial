#!/usr/bin/env node
/**
 * Remediation Backlog CSV Exporter (v3.31.0)
 *
 * Exports collision data to CSV format for sprint planning:
 * - REMEDIATION_BACKLOG.csv - Sortable/filterable in Excel/Sheets
 * - Direct input to sprint planning
 * - Compatible with Jira/Asana import
 *
 * Part of Phase 2 Enhancement Plan (D2).
 *
 * Usage:
 *   const { exportRemediationBacklog } = require('./remediation-backlog-csv-exporter');
 *
 *   // Export from collision analysis results
 *   const csvPath = exportRemediationBacklog(collisionData, {
 *     outputDir: './reports',
 *     orgAlias: 'production'
 *   });
 *
 * CLI:
 *   node remediation-backlog-csv-exporter.js <collision-json> [output-dir]
 *
 * @module remediation-backlog-csv-exporter
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================================
// CSV COLUMNS
// ============================================================================

const CSV_COLUMNS = [
  { key: 'priority', header: 'Priority', description: 'P0-P3 priority level' },
  { key: 'object', header: 'Object', description: 'Salesforce object name' },
  { key: 'field', header: 'Field', description: 'Field API name' },
  { key: 'collisionCount', header: 'Collision Count', description: 'Number of writers' },
  { key: 'writers', header: 'Writers', description: 'Automation names' },
  { key: 'writerTypes', header: 'Writer Types', description: 'Trigger, Flow, WFR, etc.' },
  { key: 'timing', header: 'Timing', description: 'Before/After/Async' },
  { key: 'riskScore', header: 'Risk Score', description: '0-100 risk rating' },
  { key: 'businessImpact', header: 'Business Impact', description: 'HIGH/MEDIUM/LOW' },
  { key: 'suggestedAction', header: 'Suggested Action', description: 'Recommended fix' },
  { key: 'estimatedHours', header: 'Est. Hours', description: 'Implementation estimate' },
  { key: 'sprint', header: 'Suggested Sprint', description: 'Sprint assignment' },
  { key: 'status', header: 'Status', description: 'Open/In Progress/Done' },
  { key: 'notes', header: 'Notes', description: 'Additional context' }
];

// ============================================================================
// PRIORITY CALCULATION
// ============================================================================

/**
 * Calculate priority based on collision characteristics
 */
function calculatePriority(collision) {
  const collisionCount = collision.collisionCount || collision.writers?.length || 0;
  const hasMultipleTimings = collision.timings && new Set(collision.timings).size > 1;
  const hasAsyncWriter = collision.timings?.includes('ASYNC');
  const riskScore = collision.riskScore || 0;

  if (collisionCount >= 4 || riskScore >= 80) return 'P0';
  if (collisionCount >= 3 || hasMultipleTimings || riskScore >= 60) return 'P1';
  if (collisionCount >= 2 || hasAsyncWriter || riskScore >= 40) return 'P2';
  return 'P3';
}

/**
 * Estimate hours for remediation
 */
function estimateHours(collision) {
  const collisionCount = collision.collisionCount || collision.writers?.length || 0;
  const writerTypes = collision.writerTypes || [];

  // Base estimate per collision count
  let hours = collisionCount * 2;

  // Add complexity for triggers (require Apex changes)
  if (writerTypes.includes('Trigger') || writerTypes.includes('ApexTrigger')) {
    hours += 4;
  }

  // Add for process builders (migration to flow)
  if (writerTypes.includes('ProcessBuilder') || writerTypes.includes('Workflow')) {
    hours += 2;
  }

  return Math.min(hours, 16); // Cap at 16 hours per item
}

/**
 * Suggest action based on collision type
 */
function suggestAction(collision) {
  const writerTypes = collision.writerTypes || [];
  const collisionCount = collision.collisionCount || collision.writers?.length || 0;

  if (collisionCount >= 4) {
    return 'Consolidate to single master automation';
  }

  if (writerTypes.includes('Workflow') && writerTypes.includes('Flow')) {
    return 'Migrate Workflow to Flow, consolidate';
  }

  if (writerTypes.includes('ProcessBuilder')) {
    return 'Migrate Process Builder to Flow';
  }

  if (writerTypes.includes('Trigger') && writerTypes.includes('Flow')) {
    return 'Move Flow logic to Trigger handler';
  }

  if (collisionCount === 2) {
    return 'Review execution order, add guard clause';
  }

  return 'Review and consolidate';
}

/**
 * Assign to suggested sprint
 */
function assignSprint(collision, index, totalCollisions) {
  const priority = calculatePriority(collision);
  const hours = estimateHours(collision);

  // Sprint capacity: ~40 hours per sprint for remediation
  const sprintCapacity = 40;
  let accumulatedHours = 0;
  let sprintNumber = 1;

  // P0 items go in Sprint 1
  if (priority === 'P0') return 'Sprint 1';

  // P1 items go in Sprint 1-2
  if (priority === 'P1') return index < 5 ? 'Sprint 1' : 'Sprint 2';

  // P2 items spread across Sprint 2-3
  if (priority === 'P2') return index < 10 ? 'Sprint 2' : 'Sprint 3';

  // P3 items go in Sprint 3+
  return 'Sprint 3+';
}

// ============================================================================
// CSV GENERATION
// ============================================================================

/**
 * Convert collision data to CSV rows
 */
function collisionsToRows(collisions) {
  return collisions.map((collision, index) => {
    const priority = calculatePriority(collision);
    const hours = estimateHours(collision);
    const action = suggestAction(collision);
    const sprint = assignSprint(collision, index, collisions.length);

    return {
      priority,
      object: collision.object || '',
      field: collision.field || '',
      collisionCount: collision.collisionCount || collision.writers?.length || 0,
      writers: (collision.writers || []).join('; '),
      writerTypes: (collision.writerTypes || []).join('; '),
      timing: (collision.timings || []).join('; '),
      riskScore: collision.riskScore || 0,
      businessImpact: collision.businessImpact || (priority === 'P0' ? 'HIGH' : priority === 'P1' ? 'HIGH' : 'MEDIUM'),
      suggestedAction: action,
      estimatedHours: hours,
      sprint,
      status: 'Open',
      notes: collision.notes || ''
    };
  });
}

/**
 * Escape CSV value
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV content
 */
function generateCSV(rows) {
  // Header row
  const headers = CSV_COLUMNS.map(col => col.header);
  let csv = headers.join(',') + '\n';

  // Data rows
  rows.forEach(row => {
    const values = CSV_COLUMNS.map(col => escapeCSV(row[col.key]));
    csv += values.join(',') + '\n';
  });

  return csv;
}

/**
 * Export remediation backlog to CSV
 * @param {Object} collisionData - Collision analysis results
 * @param {Object} options - Export options
 * @returns {string} Path to generated CSV file
 */
function exportRemediationBacklog(collisionData, options = {}) {
  const outputDir = options.outputDir || process.cwd();
  const orgAlias = options.orgAlias || 'org';
  const timestamp = new Date().toISOString().split('T')[0];

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Extract collisions from various data formats
  let collisions = [];

  if (Array.isArray(collisionData)) {
    collisions = collisionData;
  } else if (collisionData.collisions) {
    collisions = collisionData.collisions;
  } else if (collisionData.fieldCollisions) {
    collisions = collisionData.fieldCollisions;
  } else if (collisionData.results?.collisions) {
    collisions = collisionData.results.collisions;
  }

  if (collisions.length === 0) {
    console.log('No collisions found to export');
    return null;
  }

  // Sort by priority, then risk score
  collisions.sort((a, b) => {
    const aPriority = calculatePriority(a);
    const bPriority = calculatePriority(b);
    if (aPriority !== bPriority) {
      return aPriority.localeCompare(bPriority);
    }
    return (b.riskScore || 0) - (a.riskScore || 0);
  });

  // Convert to rows
  const rows = collisionsToRows(collisions);

  // Generate CSV
  const csv = generateCSV(rows);

  // Write file
  const filename = `REMEDIATION_BACKLOG_${orgAlias}_${timestamp}.csv`;
  const outputPath = path.join(outputDir, filename);

  fs.writeFileSync(outputPath, csv);

  // Print summary
  console.log(`\n=== Remediation Backlog CSV Export ===`);
  console.log(`Output: ${outputPath}`);
  console.log(`Total items: ${rows.length}`);
  console.log(`Priority breakdown:`);

  const priorityCounts = rows.reduce((acc, row) => {
    acc[row.priority] = (acc[row.priority] || 0) + 1;
    return acc;
  }, {});

  Object.entries(priorityCounts).sort().forEach(([priority, count]) => {
    console.log(`  ${priority}: ${count} items`);
  });

  const totalHours = rows.reduce((sum, row) => sum + row.estimatedHours, 0);
  console.log(`Total estimated hours: ${totalHours}`);

  return outputPath;
}

/**
 * Generate summary statistics
 */
function generateSummary(rows) {
  const summary = {
    totalItems: rows.length,
    byPriority: {},
    bySprint: {},
    totalEstimatedHours: 0,
    topObjects: {}
  };

  rows.forEach(row => {
    // By priority
    summary.byPriority[row.priority] = (summary.byPriority[row.priority] || 0) + 1;

    // By sprint
    summary.bySprint[row.sprint] = (summary.bySprint[row.sprint] || 0) + 1;

    // Total hours
    summary.totalEstimatedHours += row.estimatedHours;

    // By object
    if (row.object) {
      summary.topObjects[row.object] = (summary.topObjects[row.object] || 0) + 1;
    }
  });

  return summary;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  exportRemediationBacklog,
  collisionsToRows,
  generateCSV,
  generateSummary,
  calculatePriority,
  estimateHours,
  suggestAction,
  CSV_COLUMNS
};

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Remediation Backlog CSV Exporter

Usage: node remediation-backlog-csv-exporter.js <collision-json> [output-dir]

Arguments:
  collision-json  Path to JSON file with collision analysis results
  output-dir      Output directory (default: current directory)

Example:
  node remediation-backlog-csv-exporter.js ./reports/collision-analysis.json ./exports

Output:
  REMEDIATION_BACKLOG_<org>_<date>.csv

CSV Columns:
${CSV_COLUMNS.map(c => `  - ${c.header}: ${c.description}`).join('\n')}
    `);
    process.exit(0);
  }

  const inputFile = args[0];
  const outputDir = args[1] || process.cwd();

  try {
    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const orgAlias = data.orgAlias || data.org || path.basename(inputFile, '.json');

    const outputPath = exportRemediationBacklog(data, {
      outputDir,
      orgAlias
    });

    if (outputPath) {
      console.log(`\nCSV exported successfully: ${outputPath}`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
