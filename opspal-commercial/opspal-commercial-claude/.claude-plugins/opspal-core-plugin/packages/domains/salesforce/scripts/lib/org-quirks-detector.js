#!/usr/bin/env node

/**
 * Org Quirks Detector
 *
 * Automatically detects org-specific customizations that differ from Salesforce
 * standards, including:
 * - Object label customizations (Quote → Order Form)
 * - Record type naming variations
 * - Custom field mappings
 * - Managed package object labels
 *
 * Generates comprehensive documentation to prevent discovery issues.
 *
 * Usage:
 *   node scripts/lib/org-quirks-detector.js detect-labels hivemq
 *   node scripts/lib/org-quirks-detector.js generate-mappings hivemq
 *   node scripts/lib/org-quirks-detector.js generate-docs hivemq
 *   node scripts/lib/org-quirks-detector.js update hivemq --findings ./reports/
 *
 * Outputs:
 *   - ORG_QUIRKS.json: Machine-readable quirks data
 *   - OBJECT_MAPPINGS.txt: Quick reference text file
 *   - QUICK_REFERENCE.md: One-page cheat sheet
 *   - TROUBLESHOOTING.md: Issue resolution guide (optional)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Standard Salesforce object labels (for comparison)
const STANDARD_LABELS = {
  'SBQQ__Quote__c': 'Quote',
  'SBQQ__QuoteLine__c': 'Quote Line',
  'SBQQ__Subscription__c': 'Subscription',
  'Lead': 'Lead',
  'Contact': 'Contact',
  'Account': 'Account',
  'Opportunity': 'Opportunity',
  'Case': 'Case'
};

function executeQuery(orgAlias, soql) {
  try {
    const result = execSync(
      `sf data query --query "${soql}" --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    return JSON.parse(result);
  } catch (error) {
    console.error(`Query failed: ${error.message}`);
    return null;
  }
}

function detectLabelCustomizations(orgAlias) {
  console.log(`🔍 Detecting object label customizations for ${orgAlias}...`);

  // Query EntityDefinition for managed package objects
  const query = `
    SELECT QualifiedApiName, Label, DeveloperName, NamespacePrefix, IsCustomizable
    FROM EntityDefinition
    WHERE NamespacePrefix != null
    AND IsCustomizable = true
    ORDER BY NamespacePrefix, QualifiedApiName
  `.replace(/\s+/g, ' ').trim();

  const result = executeQuery(orgAlias, query);

  if (!result || !result.result || !result.result.records) {
    console.error('❌ Failed to query EntityDefinition');
    return [];
  }

  const customizations = [];

  result.result.records.forEach(obj => {
    const apiName = obj.QualifiedApiName;
    const actualLabel = obj.Label;
    const standardLabel = STANDARD_LABELS[apiName];

    // Check if label differs from standard
    if (standardLabel && actualLabel !== standardLabel) {
      customizations.push({
        apiName: apiName,
        standardLabel: standardLabel,
        customLabel: actualLabel,
        developerName: obj.DeveloperName,
        namespace: obj.NamespacePrefix,
        severity: 'high', // High severity because affects Object Manager search
        impact: `Users cannot find '${apiName}' by searching '${standardLabel}' in Object Manager`
      });
    }
  });

  console.log(`✅ Found ${customizations.length} label customizations`);
  return customizations;
}

function generateObjectMappings(orgAlias, quirksData) {
  console.log(`📋 Generating OBJECT_MAPPINGS.txt for ${orgAlias}...`);

  const customizations = quirksData.label_customizations || [];

  let output = '';
  output += '='.repeat(80) + '\n';
  output += `${orgAlias.toUpperCase()} SALESFORCE ORG - OBJECT NAME MAPPINGS\n`;
  output += '='.repeat(80) + '\n';
  output += '\n';
  output += `Last Updated: ${new Date().toISOString().split('T')[0]}\n`;
  output += `Org: ${orgAlias}\n`;
  output += '\n';
  output += 'CRITICAL: This org uses custom labels for managed package objects!\n';
  output += '\n';
  output += '='.repeat(80) + '\n';
  output += 'PRIMARY CUSTOMIZATIONS\n';
  output += '='.repeat(80) + '\n';
  output += '\n';
  output += 'Standard Name       Custom Label        API Name\n';
  output += '-'.repeat(80) + '\n';

  customizations.forEach(cust => {
    const std = cust.standardLabel.padEnd(20);
    const custom = cust.customLabel.padEnd(20);
    const api = cust.apiName;
    output += `${std}${custom}${api}\n`;
  });

  output += '\n';
  output += '='.repeat(80) + '\n';
  output += 'HOW TO FIND OBJECTS\n';
  output += '='.repeat(80) + '\n';
  output += '\n';
  output += 'In Object Manager:\n';

  customizations.forEach(cust => {
    output += `  ✓ Search: "${cust.customLabel}" (NOT "${cust.standardLabel}")\n`;
  });

  if (customizations.length > 0) {
    const firstNamespace = customizations[0].namespace;
    output += `  ✓ Search: "${firstNamespace}" (shows all managed package objects)\n`;
  }

  output += '\n';
  output += 'In SOQL Queries:\n';
  output += '  ✓ Use API names (labels don\'t matter in queries)\n';
  customizations.forEach(cust => {
    output += `  ✓ Use: ${cust.apiName}\n`;
  });

  output += '\n';
  output += '='.repeat(80) + '\n';
  output += 'COMMON MISTAKES\n';
  output += '='.repeat(80) + '\n';
  output += '\n';

  customizations.forEach(cust => {
    output += `❌ Searching "${cust.standardLabel}" in Object Manager → Nothing found\n`;
    output += `✅ Search "${cust.customLabel}" instead\n`;
    output += '\n';
  });

  output += '='.repeat(80) + '\n';

  return output;
}

function generateQuickReference(orgAlias, quirksData) {
  console.log(`📄 Generating QUICK_REFERENCE.md for ${orgAlias}...`);

  const customizations = quirksData.label_customizations || [];

  let md = `# ${orgAlias} Salesforce - Quick Reference Card\n\n`;
  md += `**Org:** ${orgAlias}\n\n`;
  md += `---\n\n`;
  md += `## 🎯 #1 Thing to Remember\n\n`;

  if (customizations.length > 0) {
    const first = customizations[0];
    md += `**"${first.standardLabel}" is called "${first.customLabel}" in this org!**\n\n`;
  }

  md += `---\n\n`;
  md += `## 📋 Object Name Translations\n\n`;
  md += `| Looking For? | Search For | API Name |\n`;
  md += `|--------------|------------|----------|\n`;

  customizations.forEach(cust => {
    md += `| **${cust.standardLabel}** | **${cust.customLabel}** | ${cust.apiName} |\n`;
  });

  if (customizations.length > 0) {
    const namespace = customizations[0].namespace;
    md += `| All Managed Objects | ${namespace} | (namespace prefix) |\n`;
  }

  md += `\n---\n\n`;
  md += `## 🔍 Quick Access Patterns\n\n`;
  md += `### Find Objects in Object Manager\n`;
  md += `\`\`\`\n`;
  md += `Setup → Object Manager → Search: "${customizations[0]?.customLabel || 'Custom Label'}"\n`;
  md += `OR\n`;
  md += `Setup → Object Manager → Search: "${customizations[0]?.namespace || 'NAMESPACE'}"\n`;
  md += `\`\`\`\n\n`;

  md += `---\n\n`;
  md += `## 🚨 Troubleshooting Quick Fixes\n\n`;

  customizations.forEach(cust => {
    md += `**Can't find ${cust.standardLabel} object?**\n`;
    md += `→ Search "${cust.customLabel}" not "${cust.standardLabel}"\n\n`;
  });

  md += `---\n\n`;
  md += `**Last Updated:** ${new Date().toISOString().split('T')[0]} | **Keep this handy!** 📌\n`;

  return md;
}

function generateQuirksJson(orgAlias, labelCustomizations) {
  const quirks = {
    org: orgAlias,
    last_updated: new Date().toISOString(),
    version: '1.0',
    label_customizations: labelCustomizations,
    // Note: record_type_customizations and custom_field_mappings are not yet implemented
    // See not_implemented array below for tracking
    not_implemented: [
      {
        feature: 'record_type_customizations',
        description: 'Detection of record type naming variations',
        tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
      },
      {
        feature: 'custom_field_mappings',
        description: 'Custom field mapping detection and documentation',
        tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
      }
    ],
    summary: {
      total_quirks: labelCustomizations.length,
      high_severity: labelCustomizations.filter(c => c.severity === 'high').length,
      namespaces_affected: [...new Set(labelCustomizations.map(c => c.namespace))]
    }
  };

  return quirks;
}

function saveQuirksData(orgAlias, quirksData) {
  const instanceDir = path.join(process.cwd(), 'instances', orgAlias);

  if (!fs.existsSync(instanceDir)) {
    console.warn(`⚠️  Instance directory not found: ${instanceDir}`);
    console.log(`Creating directory: ${instanceDir}`);
    fs.mkdirSync(instanceDir, { recursive: true });
  }

  // Save ORG_QUIRKS.json
  const quirksPath = path.join(instanceDir, 'ORG_QUIRKS.json');
  fs.writeFileSync(quirksPath, JSON.stringify(quirksData, null, 2));
  console.log(`✅ Saved: ${quirksPath}`);

  // Generate and save OBJECT_MAPPINGS.txt
  const mappingsContent = generateObjectMappings(orgAlias, quirksData);
  const mappingsPath = path.join(instanceDir, 'OBJECT_MAPPINGS.txt');
  fs.writeFileSync(mappingsPath, mappingsContent);
  console.log(`✅ Saved: ${mappingsPath}`);

  // Generate and save QUICK_REFERENCE.md
  const quickRefContent = generateQuickReference(orgAlias, quirksData);
  const quickRefPath = path.join(instanceDir, 'QUICK_REFERENCE.md');
  fs.writeFileSync(quickRefPath, quickRefContent);
  console.log(`✅ Saved: ${quickRefPath}`);

  console.log(`\n✅ Org quirks documentation generated for ${orgAlias}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: org-quirks-detector.js <action> <org-alias> [options]');
    console.error('');
    console.error('Actions:');
    console.error('  detect-labels       Detect object label customizations');
    console.error('  generate-mappings   Generate OBJECT_MAPPINGS.txt');
    console.error('  generate-docs       Generate all documentation (JSON, txt, md)');
    console.error('  update              Update quirks with new findings');
    console.error('');
    console.error('Examples:');
    console.error('  node org-quirks-detector.js detect-labels hivemq');
    console.error('  node org-quirks-detector.js generate-docs hivemq');
    process.exit(1);
  }

  const action = args[0];
  const orgAlias = args[1];

  switch (action) {
    case 'detect-labels': {
      const customizations = detectLabelCustomizations(orgAlias);
      console.log(JSON.stringify(customizations, null, 2));
      break;
    }

    case 'generate-mappings': {
      const instanceDir = path.join(process.cwd(), 'instances', orgAlias);
      const quirksPath = path.join(instanceDir, 'ORG_QUIRKS.json');

      let quirksData;
      if (fs.existsSync(quirksPath)) {
        quirksData = JSON.parse(fs.readFileSync(quirksPath, 'utf8'));
      } else {
        console.error(`❌ ORG_QUIRKS.json not found. Run 'detect-labels' first.`);
        process.exit(1);
      }

      const mappings = generateObjectMappings(orgAlias, quirksData);
      console.log(mappings);
      break;
    }

    case 'generate-docs': {
      const customizations = detectLabelCustomizations(orgAlias);
      const quirksData = generateQuirksJson(orgAlias, customizations);
      saveQuirksData(orgAlias, quirksData);
      break;
    }

    case 'update': {
      console.log('Update action not yet implemented');
      // TODO: Implement update logic to merge new findings with existing quirks
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
  detectLabelCustomizations,
  generateObjectMappings,
  generateQuickReference,
  generateQuirksJson
};
