#!/usr/bin/env node

/**
 * Salesforce Sync Field Mapping Analyzer
 *
 * Analyzes CSV exports from HubSpot Salesforce connector field mappings.
 * Generates statistics, categorizations, and governance recommendations.
 *
 * Usage:
 *   const analyzer = require('./sfdc-sync-analyzer');
 *   const results = analyzer.analyzePortal('delta-corp');
 *   console.log(results.summary);
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

/**
 * Parse a field mapping CSV file
 * @param {string} filePath - Path to CSV file
 * @returns {Array} Parsed field mappings
 */
function parseMappingCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Mapping file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const records = csv.parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  return records;
}

/**
 * Categorize sync rules and count occurrences
 * @param {Array} mappings - Field mappings array
 * @returns {Object} Rule statistics
 */
function analyzeSyncRules(mappings) {
  const rules = {
    'Two way': 0,
    'Prefer Salesforce unless blank': 0,
    'Always use Salesforce': 0,
    'Unknown': 0
  };

  const alwaysUseSFFields = [];

  mappings.forEach(mapping => {
    const rule = mapping['Sync Rule'];
    if (rule in rules) {
      rules[rule]++;
      if (rule === 'Always use Salesforce') {
        alwaysUseSFFields.push({
          hubspot: mapping['HubSpot Field Name'],
          salesforce: mapping['Salesforce Field Name']
        });
      }
    } else {
      rules['Unknown']++;
    }
  });

  const total = mappings.length;
  const percentages = {};
  Object.keys(rules).forEach(rule => {
    percentages[rule] = total > 0 ? ((rules[rule] / total) * 100).toFixed(1) : 0;
  });

  return {
    counts: rules,
    percentages,
    total,
    alwaysUseSFFields
  };
}

/**
 * Identify key integration fields
 * @param {Array} mappings - Field mappings array
 * @returns {Object} Key field categories
 */
function identifyKeyFields(mappings) {
  const categories = {
    identifiers: [],
    owners: [],
    revenue: [],
    health: [],
    automation: []
  };

  const patterns = {
    identifiers: /^(hs_object_id|salesforce.*id|.*_id__c)$/i,
    owners: /owner|sdr|csm|account_executive/i,
    revenue: /mrr|revenue|amount|price|billing/i,
    health: /health|score|risk|churn|nps/i,
    automation: /trigger|workflow|groove|salesloft|cadence/i
  };

  mappings.forEach(mapping => {
    const hsField = mapping['HubSpot Field Name'];
    const sfField = mapping['Salesforce Field Name'];
    const syncRule = mapping['Sync Rule'];

    Object.keys(patterns).forEach(category => {
      if (patterns[category].test(hsField) || patterns[category].test(sfField)) {
        categories[category].push({
          hubspot: hsField,
          salesforce: sfField,
          syncRule
        });
      }
    });
  });

  return categories;
}

/**
 * Analyze a single portal's Salesforce sync configuration
 * @param {string} portalName - Portal name (directory name in instances/)
 * @returns {Object} Complete analysis results
 */
function analyzePortal(portalName) {
  const instanceDir = path.join(__dirname, '../../instances', portalName);

  if (!fs.existsSync(instanceDir)) {
    throw new Error(`Portal instance directory not found: ${instanceDir}`);
  }

  // Find mapping CSV files
  const files = fs.readdirSync(instanceDir);
  const mappingFiles = {
    contact: files.find(f => f.match(/contact.*field.*mapping.*\.csv$/i)),
    company: files.find(f => f.match(/company.*field.*mapping.*\.csv$/i)),
    deal: files.find(f => f.match(/deal.*field.*mapping.*\.csv$/i))
  };

  const results = {
    portal: portalName,
    timestamp: new Date().toISOString(),
    objects: {}
  };

  // Analyze each object type
  Object.keys(mappingFiles).forEach(objectType => {
    if (!mappingFiles[objectType]) {
      results.objects[objectType] = { error: 'Mapping file not found' };
      return;
    }

    const filePath = path.join(instanceDir, mappingFiles[objectType]);
    const mappings = parseMappingCSV(filePath);
    const ruleAnalysis = analyzeSyncRules(mappings);
    const keyFields = identifyKeyFields(mappings);

    results.objects[objectType] = {
      fileName: mappingFiles[objectType],
      fieldCount: mappings.length,
      syncRules: ruleAnalysis,
      keyFields,
      sampleMappings: mappings.slice(0, 5) // First 5 for reference
    };
  });

  // Calculate totals
  results.totals = {
    fieldCount: 0,
    syncRules: {
      counts: { 'Two way': 0, 'Prefer Salesforce unless blank': 0, 'Always use Salesforce': 0, 'Unknown': 0 },
      percentages: {}
    },
    alwaysUseSFFields: []
  };

  Object.values(results.objects).forEach(obj => {
    if (obj.error) return;

    results.totals.fieldCount += obj.fieldCount;
    Object.keys(obj.syncRules.counts).forEach(rule => {
      results.totals.syncRules.counts[rule] += obj.syncRules.counts[rule];
    });
    results.totals.alwaysUseSFFields.push(...obj.syncRules.alwaysUseSFFields);
  });

  // Calculate total percentages
  const total = results.totals.fieldCount;
  Object.keys(results.totals.syncRules.counts).forEach(rule => {
    results.totals.syncRules.percentages[rule] =
      total > 0 ? ((results.totals.syncRules.counts[rule] / total) * 100).toFixed(1) : 0;
  });

  return results;
}

/**
 * Generate executive summary text
 * @param {Object} analysis - Analysis results from analyzePortal()
 * @returns {string} Formatted summary
 */
function generateSummary(analysis) {
  const { totals, objects } = analysis;

  let summary = `# Salesforce Sync Summary - ${analysis.portal}\n\n`;
  summary += `**Total Fields Syncing:** ${totals.fieldCount}\n\n`;

  summary += `## Objects\n`;
  Object.keys(objects).forEach(objType => {
    const obj = objects[objType];
    if (obj.error) {
      summary += `- **${objType}:** ${obj.error}\n`;
    } else {
      summary += `- **${objType}:** ${obj.fieldCount} fields\n`;
    }
  });

  summary += `\n## Sync Rules\n`;
  Object.keys(totals.syncRules.counts).forEach(rule => {
    const count = totals.syncRules.counts[rule];
    const pct = totals.syncRules.percentages[rule];
    summary += `- ${rule}: ${count} (${pct}%)\n`;
  });

  if (totals.alwaysUseSFFields.length > 0) {
    summary += `\n## Critical "Always use Salesforce" Fields (${totals.alwaysUseSFFields.length})\n`;
    totals.alwaysUseSFFields.forEach(field => {
      summary += `- \`${field.hubspot}\` ← \`${field.salesforce}\`\n`;
    });
  }

  return summary;
}

/**
 * Generate detailed analysis markdown
 * @param {Object} analysis - Analysis results from analyzePortal()
 * @returns {string} Formatted detailed analysis
 */
function generateDetailedAnalysis(analysis) {
  const summary = generateSummary(analysis);

  let detailed = summary + '\n\n';

  detailed += `## Key Field Categories\n\n`;

  Object.keys(analysis.objects).forEach(objType => {
    const obj = analysis.objects[objType];
    if (obj.error) return;

    detailed += `### ${objType.charAt(0).toUpperCase() + objType.slice(1)}\n\n`;

    Object.keys(obj.keyFields).forEach(category => {
      const fields = obj.keyFields[category];
      if (fields.length === 0) return;

      detailed += `**${category.charAt(0).toUpperCase() + category.slice(1)} (${fields.length} fields):**\n`;
      fields.slice(0, 10).forEach(field => {
        detailed += `- \`${field.hubspot}\` ↔ \`${field.salesforce}\` (${field.syncRule})\n`;
      });
      if (fields.length > 10) {
        detailed += `- ... and ${fields.length - 10} more\n`;
      }
      detailed += '\n';
    });
  });

  return detailed;
}

/**
 * Save analysis results to files
 * @param {string} portalName - Portal name
 * @param {Object} analysis - Analysis results
 */
function saveAnalysis(portalName, analysis) {
  const instanceDir = path.join(__dirname, '../../instances', portalName);

  // Save JSON
  const jsonPath = path.join(instanceDir, 'sfdc-sync-analysis.json');
  fs.writeFileSync(jsonPath, JSON.stringify(analysis, null, 2));

  // Save summary
  const summaryPath = path.join(instanceDir, 'SYNC_SUMMARY.md');
  const summary = generateSummary(analysis);
  fs.writeFileSync(summaryPath, summary);

  // Save detailed analysis
  const detailedPath = path.join(instanceDir, 'SALESFORCE_SYNC_ANALYSIS.md');
  const detailed = generateDetailedAnalysis(analysis);
  fs.writeFileSync(detailedPath, detailed);

  console.log(`✅ Analysis saved to ${instanceDir}/`);
  console.log(`   - sfdc-sync-analysis.json`);
  console.log(`   - SYNC_SUMMARY.md`);
  console.log(`   - SALESFORCE_SYNC_ANALYSIS.md`);
}

// CLI usage
if (require.main === module) {
  const portalName = process.argv[2];

  if (!portalName) {
    console.error('Usage: node sfdc-sync-analyzer.js <portal-name>');
    console.error('Example: node sfdc-sync-analyzer.js delta-corp');
    process.exit(1);
  }

  try {
    console.log(`📊 Analyzing Salesforce sync for portal: ${portalName}\n`);
    const analysis = analyzePortal(portalName);

    // Print summary
    console.log(generateSummary(analysis));

    // Save files
    saveAnalysis(portalName, analysis);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  analyzePortal,
  parseMappingCSV,
  analyzeSyncRules,
  identifyKeyFields,
  generateSummary,
  generateDetailedAnalysis,
  saveAnalysis
};
