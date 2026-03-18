#!/usr/bin/env node

/**
 * Runbook Differ
 *
 * Purpose: Intelligent diff between runbook versions with section-aware comparison
 * Usage: node scripts/lib/runbook-differ.js --org <org-alias> [options]
 *
 * Features:
 * - Section-aware diffing (not just line-by-line)
 * - Categorizes changes (additions, deletions, modifications)
 * - Extracts key metrics changes
 * - Summary and detailed views
 * - Compares any two versions or current vs previous
 *
 * Output:
 * - Change summary (added/removed/modified sections)
 * - Detailed section-by-section diff
 * - Statistics (lines changed, sections modified)
 * - Context-aware interpretation
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Error
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Extract sections from markdown runbook
 */
function extractSections(content) {
  const sections = {};
  const lines = content.split('\n');
  let currentSection = null;
  let currentContent = [];

  lines.forEach(line => {
    // Detect section headers (## Section Name)
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      // Start new section
      currentSection = headerMatch[1].trim();
      currentContent = [line];
    } else if (currentSection) {
      currentContent.push(line);
    }
  });

  // Save last section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

/**
 * Extract key metrics from runbook header
 */
function extractMetrics(content) {
  const metrics = {};

  // Extract header metadata
  const versionMatch = content.match(/\*\*Version\*\*:\s*(.+)/);
  const lastUpdatedMatch = content.match(/\*\*Last Updated\*\*:\s*(.+)/);
  const operationsMatch = content.match(/\*\*Generated From\*\*:\s*(\d+)\s+observations/);

  if (versionMatch) metrics.version = versionMatch[1].trim();
  if (lastUpdatedMatch) metrics.lastUpdated = lastUpdatedMatch[1].trim();
  if (operationsMatch) metrics.operations = parseInt(operationsMatch[1], 10);

  // Extract instance details
  const orgTypeMatch = content.match(/- \*\*Org Type\*\*:\s*(.+)/);
  const totalObjectsMatch = content.match(/- \*\*Total Objects\*\*:\s*(\d+)/);
  const activeWorkflowsMatch = content.match(/- \*\*Active Workflows\*\*:\s*(\d+)/);

  if (orgTypeMatch) metrics.orgType = orgTypeMatch[1].trim();
  if (totalObjectsMatch) metrics.totalObjects = parseInt(totalObjectsMatch[1], 10);
  if (activeWorkflowsMatch) metrics.activeWorkflows = parseInt(activeWorkflowsMatch[1], 10);

  return metrics;
}

/**
 * Compare two sections
 */
function compareSections(section1, section2) {
  if (!section1 && !section2) {
    return { type: 'unchanged', changes: [] };
  }

  if (!section1) {
    return { type: 'added', changes: ['Section added'], content: section2 };
  }

  if (!section2) {
    return { type: 'removed', changes: ['Section removed'], content: section1 };
  }

  if (section1 === section2) {
    return { type: 'unchanged', changes: [] };
  }

  // Sections exist but differ - count sub-sections/entries
  const countEntries = (text) => {
    return (text.match(/^###\s+/gm) || []).length;
  };

  const entries1 = countEntries(section1);
  const entries2 = countEntries(section2);

  const changes = [];
  if (entries2 > entries1) {
    changes.push(`+${entries2 - entries1} entries added`);
  } else if (entries1 > entries2) {
    changes.push(`-${entries1 - entries2} entries removed`);
  }

  if (section1.length !== section2.length) {
    const diff = section2.length - section1.length;
    changes.push(`${diff > 0 ? '+' : ''}${diff} characters changed`);
  }

  return {
    type: 'modified',
    changes: changes.length > 0 ? changes : ['Content modified'],
    entriesAdded: Math.max(0, entries2 - entries1),
    entriesRemoved: Math.max(0, entries1 - entries2)
  };
}

/**
 * Generate unified diff for a section
 */
function generateSectionDiff(section1, section2, sectionName) {
  const lines1 = (section1 || '').split('\n');
  const lines2 = (section2 || '').split('\n');

  const diff = [];
  let i = 0, j = 0;

  while (i < lines1.length || j < lines2.length) {
    if (i >= lines1.length) {
      // Remaining lines are additions
      diff.push(`+${lines2[j]}`);
      j++;
    } else if (j >= lines2.length) {
      // Remaining lines are deletions
      diff.push(`-${lines1[i]}`);
      i++;
    } else if (lines1[i] === lines2[j]) {
      // Lines match
      diff.push(` ${lines1[i]}`);
      i++;
      j++;
    } else {
      // Lines differ - show both
      diff.push(`-${lines1[i]}`);
      diff.push(`+${lines2[j]}`);
      i++;
      j++;
    }
  }

  return diff;
}

/**
 * Perform intelligent diff between two runbooks
 */
function diffRunbooks(content1, content2, options = {}) {
  const sections1 = extractSections(content1);
  const sections2 = extractSections(content2);
  const metrics1 = extractMetrics(content1);
  const metrics2 = extractMetrics(content2);

  // Get all unique section names
  const allSections = new Set([
    ...Object.keys(sections1),
    ...Object.keys(sections2)
  ]);

  // Compare each section
  const sectionComparisons = {};
  const summary = {
    added: [],
    removed: [],
    modified: [],
    unchanged: []
  };

  allSections.forEach(sectionName => {
    const comparison = compareSections(sections1[sectionName], sections2[sectionName]);
    sectionComparisons[sectionName] = comparison;

    switch (comparison.type) {
      case 'added':
        summary.added.push(sectionName);
        break;
      case 'removed':
        summary.removed.push(sectionName);
        break;
      case 'modified':
        summary.modified.push({ name: sectionName, changes: comparison.changes });
        break;
      case 'unchanged':
        summary.unchanged.push(sectionName);
        break;
    }
  });

  // Compare metrics
  const metricChanges = [];
  Object.keys(metrics2).forEach(key => {
    if (metrics1[key] !== metrics2[key]) {
      metricChanges.push({
        metric: key,
        from: metrics1[key],
        to: metrics2[key]
      });
    }
  });

  // Calculate statistics
  const stats = {
    sectionsAdded: summary.added.length,
    sectionsRemoved: summary.removed.length,
    sectionsModified: summary.modified.length,
    sectionsUnchanged: summary.unchanged.length,
    metricChanges: metricChanges.length
  };

  return {
    summary,
    sectionComparisons,
    metricChanges,
    stats,
    metrics1,
    metrics2
  };
}

/**
 * Format diff output
 */
function formatDiffOutput(diff, options = {}) {
  const output = [];

  // Header
  output.push('━'.repeat(80));
  output.push('## Changes Summary');
  output.push('━'.repeat(80));
  output.push('');

  // Summary statistics
  if (diff.summary.added.length > 0) {
    output.push(`✅ Additions (${diff.summary.added.length}):`);
    diff.summary.added.forEach(section => {
      output.push(`  - New section: "${section}"`);
    });
    output.push('');
  }

  if (diff.summary.removed.length > 0) {
    output.push(`❌ Deletions (${diff.summary.removed.length}):`);
    diff.summary.removed.forEach(section => {
      output.push(`  - Removed section: "${section}"`);
    });
    output.push('');
  }

  if (diff.summary.modified.length > 0) {
    output.push(`📝 Modifications (${diff.summary.modified.length}):`);
    diff.summary.modified.forEach(mod => {
      output.push(`  - ${mod.name}: ${mod.changes.join(', ')}`);
    });
    output.push('');
  }

  if (diff.metricChanges.length > 0) {
    output.push(`📊 Metric Changes (${diff.metricChanges.length}):`);
    diff.metricChanges.forEach(change => {
      output.push(`  - ${change.metric}: ${change.from} → ${change.to}`);
    });
    output.push('');
  }

  if (diff.stats.sectionsUnchanged > 0 && options.verbose) {
    output.push(`✓ Unchanged sections: ${diff.stats.sectionsUnchanged}`);
    output.push('');
  }

  // No changes
  if (diff.summary.added.length === 0 &&
      diff.summary.removed.length === 0 &&
      diff.summary.modified.length === 0 &&
      diff.metricChanges.length === 0) {
    output.push('✅ No changes detected');
    output.push('');
    output.push('The runbooks are identical.');
    output.push('');
  }

  return output.join('\n');
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    org: null,
    version1: null, // 'previous' or specific version
    version2: null, // 'current' or specific version
    format: 'summary', // summary, detailed
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--org':
        options.org = next;
        i++;
        break;
      case '--from':
      case '--version1':
        options.version1 = next;
        i++;
        break;
      case '--to':
      case '--version2':
        options.version2 = next;
        i++;
        break;
      case '--format':
        options.format = next;
        i++;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage: runbook-differ.js --org <org-alias> [options]');
  console.log('');
  console.log('Required Arguments:');
  console.log('  --org <alias>          Salesforce org alias');
  console.log('');
  console.log('Optional Arguments:');
  console.log('  --from <version>       Compare from version (default: previous)');
  console.log('  --to <version>         Compare to version (default: current)');
  console.log('  --format <type>        Output format: summary (default), detailed');
  console.log('  --verbose              Show unchanged sections');
  console.log('');
  console.log('Examples:');
  console.log('  # Compare current vs previous');
  console.log('  node runbook-differ.js --org delta-sandbox');
  console.log('');
  console.log('  # Compare specific versions');
  console.log('  node runbook-differ.js --org delta-sandbox \\');
  console.log('    --from v1.0.0 --to v1.2.0');
  console.log('');
  console.log('  # Detailed diff');
  console.log('  node runbook-differ.js --org delta-sandbox --format detailed');
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  if (!options.org) {
    console.error('❌ Missing required argument: --org');
    printUsage();
    process.exit(1);
  }

  const pluginRoot = path.resolve(__dirname, '../..');
  const currentRunbookPath = path.join(pluginRoot, 'instances', options.org, 'RUNBOOK.md');
  const historyDir = path.join(pluginRoot, 'instances', options.org, 'runbook-history');

  try {
    // Load version index
    const { loadVersionIndex, getVersionPath } = require('./runbook-versioner.js');
    const index = loadVersionIndex(historyDir);

    if (index.versions.length === 0) {
      console.log('⚠️  No version history found');
      console.log('');
      console.log('Version history is needed for diffing.');
      console.log('Run /generate-runbook to create first version.');
      process.exit(0);
    }

    // Determine versions to compare
    let version1Path, version2Path;
    let version1Name, version2Name;

    if (options.version2 === null || options.version2 === 'current') {
      // Compare with current runbook
      version2Path = currentRunbookPath;
      version2Name = 'current';
    } else {
      version2Path = getVersionPath(options.org, options.version2);
      version2Name = options.version2;
      if (!version2Path) {
        console.error(`❌ Version not found: ${options.version2}`);
        process.exit(1);
      }
    }

    if (options.version1 === null || options.version1 === 'previous') {
      // Get previous version
      const currentIdx = index.versions.findIndex(v => v.version === index.current_version);
      if (currentIdx > 0) {
        const previousVersion = index.versions[currentIdx - 1];
        version1Path = path.join(historyDir, previousVersion.filename);
        version1Name = previousVersion.version;
      } else {
        console.error('❌ No previous version available');
        console.log('   Only one version exists in history');
        process.exit(0);
      }
    } else {
      version1Path = getVersionPath(options.org, options.version1);
      version1Name = options.version1;
      if (!version1Path) {
        console.error(`❌ Version not found: ${options.version1}`);
        process.exit(1);
      }
    }

    // Read runbooks
    const content1 = fs.readFileSync(version1Path, 'utf-8');
    const content2 = fs.readFileSync(version2Path, 'utf-8');

    // Perform diff
    console.log(`📊 Comparing runbooks for: ${options.org}`);
    console.log(`   From: ${version1Name}`);
    console.log(`   To:   ${version2Name}`);
    console.log('');

    const diff = diffRunbooks(content1, content2, options);

    // Output
    console.log(formatDiffOutput(diff, options));

    // Statistics
    console.log('━'.repeat(80));
    console.log('## Statistics');
    console.log('━'.repeat(80));
    console.log('');
    console.log(`   Sections added: ${diff.stats.sectionsAdded}`);
    console.log(`   Sections removed: ${diff.stats.sectionsRemoved}`);
    console.log(`   Sections modified: ${diff.stats.sectionsModified}`);
    console.log(`   Sections unchanged: ${diff.stats.sectionsUnchanged}`);
    console.log(`   Metric changes: ${diff.stats.metricChanges}`);
    console.log('');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.stack) {
      console.error('   Stack:', err.stack);
    }
    process.exit(1);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  extractSections,
  extractMetrics,
  compareSections,
  diffRunbooks,
  formatDiffOutput
};
