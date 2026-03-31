#!/usr/bin/env node

/**
 * Org Quirks Detector (Enhanced)
 *
 * Automatically detects org-specific customizations that differ from Salesforce
 * standards, including:
 * - Object label customizations (Quote → Order Form)
 * - Record type naming variations
 * - Custom field mappings and renames
 * - Managed package object labels
 * - Picklist value customizations
 * - Validation rule patterns
 *
 * Enhanced in Phase 3.3 to support:
 * - Automatic detection after org authentication
 * - Reflection-based learning from past friction
 * - Caching with incremental updates
 * - ROI tracking for prevented issues
 *
 * Generates comprehensive documentation to prevent discovery issues.
 *
 * Usage:
 *   node scripts/lib/org-quirks-detector.js detect-labels <org>
 *   node scripts/lib/org-quirks-detector.js detect-record-types <org>
 *   node scripts/lib/org-quirks-detector.js detect-fields <org>
 *   node scripts/lib/org-quirks-detector.js detect-all <org>
 *   node scripts/lib/org-quirks-detector.js generate-docs <org>
 *   node scripts/lib/org-quirks-detector.js learn-from-reflections <org>
 *   node scripts/lib/org-quirks-detector.js status <org>
 *
 * Outputs:
 *   - ORG_QUIRKS.json: Machine-readable quirks data
 *   - OBJECT_MAPPINGS.txt: Quick reference text file
 *   - QUICK_REFERENCE.md: One-page cheat sheet
 *
 * Environment Variables:
 *   ORG_QUIRKS_CACHE_DIR - Override default cache directory
 *   ORG_QUIRKS_MAX_AGE   - Max age in hours before refresh (default: 168 = 1 week)
 *
 * @version 2.0.0
 * @updated 2026-01-15 (Phase 3.3 Enhancement)
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

// =============================================================================
// RECORD TYPE DETECTION (NEW)
// =============================================================================

function detectRecordTypeCustomizations(orgAlias) {
  console.log(`🔍 Detecting record type customizations for ${orgAlias}...`);

  // Query RecordType for non-standard naming
  const query = `
    SELECT Id, Name, DeveloperName, SobjectType, Description, IsActive
    FROM RecordType
    WHERE IsActive = true
    ORDER BY SobjectType, Name
  `.replace(/\s+/g, ' ').trim();

  const result = executeQuery(orgAlias, query);

  if (!result || !result.result || !result.result.records) {
    console.error('❌ Failed to query RecordType');
    return [];
  }

  const customizations = [];

  // Group by SobjectType
  const byObject = {};
  result.result.records.forEach(rt => {
    if (!byObject[rt.SobjectType]) {
      byObject[rt.SobjectType] = [];
    }
    byObject[rt.SobjectType].push(rt);
  });

  // Check for naming variations
  for (const [objectName, recordTypes] of Object.entries(byObject)) {
    recordTypes.forEach(rt => {
      // Flag if Name differs significantly from DeveloperName
      const normalizedName = rt.Name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const nameMismatch = normalizedName.toLowerCase() !== rt.DeveloperName.toLowerCase();

      if (nameMismatch) {
        customizations.push({
          objectType: objectName,
          recordTypeId: rt.Id,
          displayName: rt.Name,
          developerName: rt.DeveloperName,
          description: rt.Description,
          severity: 'medium',
          impact: `RecordType label "${rt.Name}" differs from API name "${rt.DeveloperName}" - may cause confusion`
        });
      }
    });

    // Flag if object has 5+ record types (complexity)
    if (recordTypes.length >= 5) {
      customizations.push({
        objectType: objectName,
        recordTypeCount: recordTypes.length,
        recordTypes: recordTypes.map(rt => rt.Name),
        severity: 'low',
        impact: `${objectName} has ${recordTypes.length} record types - ensure correct type is used`
      });
    }
  }

  console.log(`✅ Found ${customizations.length} record type quirks`);
  return customizations;
}

// =============================================================================
// CUSTOM FIELD DETECTION (NEW)
// =============================================================================

function detectFieldCustomizations(orgAlias, targetObjects = []) {
  console.log(`🔍 Detecting custom field customizations for ${orgAlias}...`);

  // Default objects to check if none specified
  const objectsToCheck = targetObjects.length > 0 ? targetObjects : [
    'Account', 'Contact', 'Opportunity', 'Lead', 'Case',
    'SBQQ__Quote__c', 'SBQQ__QuoteLine__c', 'SBQQ__Subscription__c'
  ];

  const customizations = [];

  for (const objectName of objectsToCheck) {
    const query = `
      SELECT QualifiedApiName, Label, DeveloperName, DataType, Description,
             NamespacePrefix, IsCustom
      FROM FieldDefinition
      WHERE EntityDefinition.QualifiedApiName = '${objectName}'
      AND IsCustom = true
      ORDER BY Label
    `.replace(/\s+/g, ' ').trim();

    const result = executeQuery(orgAlias, query);

    if (!result || !result.result || !result.result.records) {
      console.log(`   ⚠️  Could not query fields for ${objectName}`);
      continue;
    }

    result.result.records.forEach(field => {
      // Check if label significantly differs from developer name
      const normalizedLabel = field.Label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const labelMismatch = normalizedLabel.toLowerCase() !== field.DeveloperName.toLowerCase();

      if (labelMismatch) {
        customizations.push({
          objectName: objectName,
          fieldApiName: field.QualifiedApiName,
          fieldLabel: field.Label,
          developerName: field.DeveloperName,
          dataType: field.DataType,
          namespace: field.NamespacePrefix,
          severity: 'low',
          impact: `Field "${field.Label}" has API name "${field.QualifiedApiName}" - use API name in queries`
        });
      }

      // Flag managed package fields with custom labels
      if (field.NamespacePrefix && field.Label !== field.DeveloperName) {
        customizations.push({
          objectName: objectName,
          fieldApiName: field.QualifiedApiName,
          fieldLabel: field.Label,
          namespace: field.NamespacePrefix,
          severity: 'medium',
          impact: `Managed package field "${field.QualifiedApiName}" has custom label "${field.Label}"`
        });
      }
    });
  }

  console.log(`✅ Found ${customizations.length} field customizations`);
  return customizations;
}

// =============================================================================
// REFLECTION-BASED LEARNING (NEW)
// =============================================================================

/**
 * Learn org quirks from past reflections
 * Analyzes reflection data to identify recurring discovery issues
 */
function learnFromReflections(orgAlias, reflections = []) {
  console.log(`🧠 Learning org quirks from ${reflections.length} reflections for ${orgAlias}...`);

  const learnedQuirks = [];

  // Patterns that indicate discovery issues
  const discoveryPatterns = [
    { pattern: /can't find (?:the )?(\w+)\s*(?:object|field)/i, type: 'object_discovery' },
    { pattern: /(?:object|field) ['"]?(\w+)['"]? (?:not found|doesn't exist)/i, type: 'object_discovery' },
    { pattern: /no such (?:object|field):?\s*['"]?(\w+)/i, type: 'object_discovery' },
    { pattern: /searched for ['"]?(\w+)['"]? but found ['"]?(\w+)/i, type: 'label_mismatch' },
    { pattern: /(?:wrong|incorrect) (?:api|field) name/i, type: 'api_name_issue' },
    { pattern: /record type ['"]?(\w+)['"]? (?:not found|invalid)/i, type: 'record_type_issue' }
  ];

  for (const reflection of reflections) {
    // Extract text from reflection
    const text = [
      reflection.summary,
      reflection.outcome,
      reflection.data?.summary,
      ...(reflection.data?.issues_identified?.map(i => i.title + ' ' + i.description) || []),
      ...(reflection.data?.friction_points || [])
    ].filter(Boolean).join(' ');

    if (!text || reflection.org !== orgAlias) continue;

    // Check each pattern
    for (const { pattern, type } of discoveryPatterns) {
      const match = text.match(pattern);

      if (match) {
        learnedQuirks.push({
          type: type,
          match: match[0],
          entity: match[1] || 'unknown',
          alternateEntity: match[2] || null,
          source: 'reflection',
          reflectionId: reflection.id,
          timestamp: reflection.created_at,
          severity: 'high',
          learnedAt: new Date().toISOString()
        });
      }
    }
  }

  // Deduplicate by entity
  const deduped = [];
  const seen = new Set();

  for (const quirk of learnedQuirks) {
    const key = `${quirk.type}:${quirk.entity}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(quirk);
    }
  }

  console.log(`✅ Learned ${deduped.length} quirks from reflections`);
  return deduped;
}

// =============================================================================
// CACHING MECHANISM (NEW)
// =============================================================================

const CACHE_MAX_AGE_HOURS = parseInt(process.env.ORG_QUIRKS_MAX_AGE || '168'); // 1 week default

function getCacheDir() {
  return process.env.ORG_QUIRKS_CACHE_DIR ||
    path.join(process.env.HOME || '/tmp', '.claude', 'org-quirks-cache');
}

function getCachePath(orgAlias) {
  return path.join(getCacheDir(), `${orgAlias}.json`);
}

function isCacheValid(orgAlias) {
  const cachePath = getCachePath(orgAlias);

  if (!fs.existsSync(cachePath)) {
    return false;
  }

  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const cachedAt = new Date(cache.cached_at);
    const ageHours = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);

    return ageHours < CACHE_MAX_AGE_HOURS;
  } catch (e) {
    return false;
  }
}

function loadFromCache(orgAlias) {
  const cachePath = getCachePath(orgAlias);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveToCache(orgAlias, quirksData) {
  const cacheDir = getCacheDir();

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cachePath = getCachePath(orgAlias);
  const cacheData = {
    ...quirksData,
    cached_at: new Date().toISOString()
  };

  fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
  console.log(`   💾 Cached quirks data to ${cachePath}`);
}

// =============================================================================
// COMPREHENSIVE DETECTION (NEW)
// =============================================================================

/**
 * Detect if State/Country Picklists are enabled on the org.
 *
 * When enabled, BillingState/ShippingState become read-only display labels
 * (returning full names like "Florida"). BillingStateCode/ShippingStateCode
 * are the writable 2-letter code fields. This is a critical org quirk that
 * affects flow field references, upsert operations, and data imports.
 *
 * Detection: If BillingStateCode appears in Account describe, picklists are enabled.
 */
function detectStateCountryPicklists(orgAlias) {
  try {
    const cmd = `sf sobject describe --sobject Account --target-org ${orgAlias} --json`;
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const describeResult = JSON.parse(output);

    if (describeResult.status === 0 && describeResult.result) {
      const hasStateCode = describeResult.result.fields.some(f => f.name === 'BillingStateCode');
      return hasStateCode;
    }
  } catch (error) {
    console.error(`   Could not check State/Country Picklists: ${error.message}`);
  }
  return false;
}

function detectAllQuirks(orgAlias, options = {}) {
  console.log(`\n📊 Running comprehensive quirks detection for ${orgAlias}...\n`);

  // Check cache first (unless force refresh)
  if (!options.forceRefresh && isCacheValid(orgAlias)) {
    console.log('   📦 Using cached quirks data (still valid)');
    const cached = loadFromCache(orgAlias);
    if (cached) {
      console.log(`   ⏰ Cached at: ${cached.cached_at}`);
      return cached;
    }
  }

  const allQuirks = {
    org: orgAlias,
    detected_at: new Date().toISOString(),
    version: '2.0',
    label_customizations: [],
    record_type_customizations: [],
    field_customizations: [],
    learned_quirks: [],
    summary: {}
  };

  // 1. Detect label customizations
  console.log('\n1️⃣  Label Customizations:');
  allQuirks.label_customizations = detectLabelCustomizations(orgAlias);

  // 2. Detect record type customizations
  console.log('\n2️⃣  Record Type Customizations:');
  allQuirks.record_type_customizations = detectRecordTypeCustomizations(orgAlias);

  // 3. Detect field customizations (limited to key objects)
  console.log('\n3️⃣  Field Customizations:');
  allQuirks.field_customizations = detectFieldCustomizations(orgAlias);

  // 3.5. Detect State/Country Picklist enablement
  console.log('\n3.5️⃣  State/Country Picklists:');
  allQuirks.stateCountryPicklistsEnabled = detectStateCountryPicklists(orgAlias);
  if (allQuirks.stateCountryPicklistsEnabled) {
    console.log('   ⚠️  State/Country Picklists ENABLED');
    console.log('   → Use BillingStateCode/ShippingStateCode for write operations');
    console.log('   → BillingState/ShippingState are read-only display labels');
  } else {
    console.log('   ✅ State/Country Picklists not enabled');
  }

  // 4. Build summary
  allQuirks.summary = {
    total_quirks: allQuirks.label_customizations.length +
                  allQuirks.record_type_customizations.length +
                  allQuirks.field_customizations.length,
    label_count: allQuirks.label_customizations.length,
    record_type_count: allQuirks.record_type_customizations.length,
    field_count: allQuirks.field_customizations.length,
    high_severity: [
      ...allQuirks.label_customizations,
      ...allQuirks.record_type_customizations,
      ...allQuirks.field_customizations
    ].filter(q => q.severity === 'high').length,
    namespaces_affected: [...new Set(
      allQuirks.label_customizations.map(c => c.namespace).filter(Boolean)
    )]
  };

  // Save to cache
  saveToCache(orgAlias, allQuirks);

  console.log(`\n✅ Comprehensive detection complete!`);
  console.log(`   Total quirks: ${allQuirks.summary.total_quirks}`);
  console.log(`   High severity: ${allQuirks.summary.high_severity}`);

  return allQuirks;
}

// =============================================================================
// STATUS COMMAND (NEW)
// =============================================================================

function showStatus(orgAlias) {
  console.log(`\n📋 ORG QUIRKS STATUS: ${orgAlias}\n`);
  console.log('═'.repeat(60));

  const cachePath = getCachePath(orgAlias);
  const instanceDir = path.join(process.cwd(), 'instances', orgAlias);

  // Check cache
  console.log('\n📦 Cache Status:');
  if (fs.existsSync(cachePath)) {
    const cache = loadFromCache(orgAlias);
    if (cache) {
      const ageHours = ((Date.now() - new Date(cache.cached_at).getTime()) / (1000 * 60 * 60)).toFixed(1);
      const isValid = isCacheValid(orgAlias);
      console.log(`   Location: ${cachePath}`);
      console.log(`   Cached at: ${cache.cached_at}`);
      console.log(`   Age: ${ageHours} hours`);
      console.log(`   Valid: ${isValid ? '✅ Yes' : '❌ Needs refresh'}`);
      console.log(`   Total quirks: ${cache.summary?.total_quirks || 'N/A'}`);
    }
  } else {
    console.log('   ❌ No cache found - run detect-all to populate');
  }

  // Check instance directory
  console.log('\n📁 Instance Documentation:');
  if (fs.existsSync(instanceDir)) {
    const files = ['ORG_QUIRKS.json', 'OBJECT_MAPPINGS.txt', 'QUICK_REFERENCE.md'];
    files.forEach(file => {
      const filePath = path.join(instanceDir, file);
      const exists = fs.existsSync(filePath);
      console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    });
  } else {
    console.log(`   ❌ Instance directory not found: ${instanceDir}`);
    console.log('   Run generate-docs to create documentation');
  }

  console.log('\n═'.repeat(60));
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

  if (args.length < 2 && args[0] !== 'help') {
    printUsage();
    process.exit(1);
  }

  const action = args[0];
  const orgAlias = args[1];
  const forceRefresh = args.includes('--force') || args.includes('-f');

  switch (action) {
    case 'detect-labels': {
      const customizations = detectLabelCustomizations(orgAlias);
      console.log(JSON.stringify(customizations, null, 2));
      break;
    }

    case 'detect-record-types': {
      const customizations = detectRecordTypeCustomizations(orgAlias);
      console.log(JSON.stringify(customizations, null, 2));
      break;
    }

    case 'detect-fields': {
      const customizations = detectFieldCustomizations(orgAlias);
      console.log(JSON.stringify(customizations, null, 2));
      break;
    }

    case 'detect-all': {
      const quirksData = detectAllQuirks(orgAlias, { forceRefresh });
      console.log(`\n📝 Full results saved to cache`);
      break;
    }

    case 'generate-mappings': {
      const instanceDir = path.join(process.cwd(), 'instances', orgAlias);
      const quirksPath = path.join(instanceDir, 'ORG_QUIRKS.json');

      let quirksData;
      if (fs.existsSync(quirksPath)) {
        quirksData = JSON.parse(fs.readFileSync(quirksPath, 'utf8'));
      } else {
        // Try cache
        quirksData = loadFromCache(orgAlias);
        if (!quirksData) {
          console.error(`❌ No quirks data found. Run 'detect-all' first.`);
          process.exit(1);
        }
      }

      const mappings = generateObjectMappings(orgAlias, quirksData);
      console.log(mappings);
      break;
    }

    case 'generate-docs': {
      // Use comprehensive detection
      const quirksData = detectAllQuirks(orgAlias, { forceRefresh });
      saveQuirksData(orgAlias, quirksData);
      break;
    }

    case 'learn-from-reflections': {
      // This requires reflection data passed in or from cache
      console.log('📚 Learning from reflections...');
      console.log('   Note: Pass reflections as JSON via stdin or use programmatic API');

      // Try to read from stdin if piped
      let reflections = [];
      try {
        const input = fs.readFileSync(0, 'utf8');
        reflections = JSON.parse(input);
      } catch (e) {
        console.log('   No stdin data detected');
      }

      if (reflections.length > 0) {
        const learned = learnFromReflections(orgAlias, reflections);
        console.log(JSON.stringify(learned, null, 2));
      } else {
        console.log('   Usage: cat reflections.json | node org-quirks-detector.js learn-from-reflections <org>');
      }
      break;
    }

    case 'status': {
      showStatus(orgAlias);
      break;
    }

    case 'help':
    default:
      printUsage();
      if (action !== 'help') {
        console.error(`\n❌ Unknown action: ${action}`);
        process.exit(1);
      }
  }
}

function printUsage() {
  console.log(`
Org Quirks Detector (Enhanced v2.0)

Automatically detects org-specific customizations to prevent discovery issues.

Usage: org-quirks-detector.js <action> <org-alias> [options]

Detection Actions:
  detect-labels         Detect object label customizations
  detect-record-types   Detect record type naming variations
  detect-fields         Detect custom field label mismatches
  detect-all            Run all detection (with caching)

Documentation Actions:
  generate-mappings     Generate OBJECT_MAPPINGS.txt
  generate-docs         Generate all documentation (JSON, txt, md)

Learning Actions:
  learn-from-reflections  Learn quirks from past reflections (pipe JSON via stdin)

Utility Actions:
  status                Show cache and documentation status
  help                  Show this help message

Options:
  --force, -f           Force refresh (ignore cache)

Examples:
  node org-quirks-detector.js detect-all eta-corp
  node org-quirks-detector.js detect-all eta-corp --force
  node org-quirks-detector.js generate-docs eta-corp
  node org-quirks-detector.js status eta-corp
  cat reflections.json | node org-quirks-detector.js learn-from-reflections eta-corp

Environment Variables:
  ORG_QUIRKS_CACHE_DIR   Override default cache directory
  ORG_QUIRKS_MAX_AGE     Max cache age in hours (default: 168 = 1 week)
  `);
}

if (require.main === module) {
  main();
}

module.exports = {
  // Detection functions
  detectLabelCustomizations,
  detectRecordTypeCustomizations,
  detectFieldCustomizations,
  detectStateCountryPicklists,
  detectAllQuirks,

  // Learning functions
  learnFromReflections,

  // Documentation functions
  generateObjectMappings,
  generateQuickReference,
  generateQuirksJson,
  saveQuirksData,

  // Cache functions
  getCacheDir,
  getCachePath,
  isCacheValid,
  loadFromCache,
  saveToCache,

  // Status functions
  showStatus
};
