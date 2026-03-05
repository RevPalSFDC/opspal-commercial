#!/usr/bin/env node

/**
 * SFDC Field Mapping CSV Validator
 *
 * Validates CSV field mappings scraped from HubSpot Salesforce connector
 * Checks field counts, sync rules, required fields, and data quality
 *
 * Usage:
 *   node scripts/lib/validate-sfdc-mappings.js <portal-name>
 *
 * Returns:
 *   Exit 0: All validations passed
 *   Exit 1: Validation failures detected
 */

const fs = require('fs');
const path = require('path');

// Expected field counts (baseline from Rentable portal)
const EXPECTED_COUNTS = {
  contact: { min: 100, max: 200, baseline: 142 },
  company: { min: 300, max: 450, baseline: 366 },
  deal: { min: 300, max: 450, baseline: 352 }
};

// Expected sync rule distribution (percentages)
const EXPECTED_SYNC_RULES = {
  'Two way': { min: 10, max: 20 },
  'Prefer Salesforce unless blank': { min: 75, max: 90 },
  'Always use Salesforce': { min: 0, max: 10 }
};

// Required field categories (minimum set - portals may have additional fields)
const REQUIRED_FIELD_CATEGORIES = {
  contact: {
    identifiers: ['salesforceaccountid'], // Account link is critical
    owners: ['hubspot_owner_id'] // Owner sync is critical
  },
  company: {
    identifiers: [], // Company CSVs may not have salesforceaccountid as first column
    owners: ['hubspot_owner_id']
  },
  deal: {
    identifiers: [], // Deal CSVs vary by portal
    owners: ['hubspot_owner_id']
  }
};

/**
 * Parse CSV file and extract field mappings
 */
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    return { error: 'CSV file is empty or has no data rows' };
  }

  const header = lines[0];
  const dataLines = lines.slice(1);

  // Parse sync rules
  const syncRules = {};
  const fields = [];

  dataLines.forEach(line => {
    // Simple CSV parsing (handles quoted fields)
    const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
    if (!matches || matches.length < 3) return;

    const hubspotField = matches[0].replace(/^,?"?|"?$/g, '').trim();
    const salesforceField = matches[1].replace(/^,?"?|"?$/g, '').trim();
    const syncRule = matches[2].replace(/^,?"?|"?$/g, '').trim();

    if (hubspotField && salesforceField && syncRule) {
      fields.push({
        hubspot: hubspotField,
        salesforce: salesforceField,
        syncRule: syncRule
      });

      syncRules[syncRule] = (syncRules[syncRule] || 0) + 1;
    }
  });

  return {
    header,
    fields,
    syncRules,
    totalFields: fields.length
  };
}

/**
 * Validate field count against expected ranges
 */
function validateFieldCount(objectType, count) {
  const expected = EXPECTED_COUNTS[objectType];
  if (!expected) {
    return { valid: true, message: 'No baseline for object type' };
  }

  const deviation = Math.abs(count - expected.baseline);
  const percentDeviation = (deviation / expected.baseline) * 100;

  if (count < expected.min || count > expected.max) {
    return {
      valid: false,
      message: `Field count ${count} outside expected range [${expected.min}-${expected.max}] (baseline: ${expected.baseline})`
    };
  }

  if (percentDeviation > 20) {
    return {
      valid: false,
      warning: true,
      message: `Field count ${count} deviates ${percentDeviation.toFixed(1)}% from baseline ${expected.baseline}`
    };
  }

  return {
    valid: true,
    message: `Field count ${count} within expected range (baseline: ${expected.baseline})`
  };
}

/**
 * Validate sync rule distribution
 */
function validateSyncRules(syncRules, totalFields) {
  const results = [];
  let hasError = false;

  for (const [rule, count] of Object.entries(syncRules)) {
    const percentage = (count / totalFields) * 100;
    const expected = EXPECTED_SYNC_RULES[rule];

    if (expected) {
      if (percentage < expected.min || percentage > expected.max) {
        results.push({
          rule,
          count,
          percentage: percentage.toFixed(1),
          valid: false,
          message: `${rule}: ${percentage.toFixed(1)}% outside expected range [${expected.min}-${expected.max}%]`
        });
        hasError = true;
      } else {
        results.push({
          rule,
          count,
          percentage: percentage.toFixed(1),
          valid: true,
          message: `${rule}: ${percentage.toFixed(1)}% within expected range`
        });
      }
    } else {
      results.push({
        rule,
        count,
        percentage: percentage.toFixed(1),
        valid: true,
        warning: true,
        message: `${rule}: ${percentage.toFixed(1)}% (no baseline for this rule)`
      });
    }
  }

  return {
    valid: !hasError,
    results
  };
}

/**
 * Validate required fields are present
 */
function validateRequiredFields(objectType, fields) {
  const required = REQUIRED_FIELD_CATEGORIES[objectType];
  if (!required) {
    return { valid: true, message: 'No required fields defined for object type' };
  }

  const hubspotFields = new Set(fields.map(f => f.hubspot.toLowerCase()));
  const missing = [];

  // Check identifiers
  for (const field of required.identifiers || []) {
    if (!hubspotFields.has(field.toLowerCase())) {
      missing.push({ category: 'identifier', field });
    }
  }

  // Check owners
  for (const field of required.owners || []) {
    if (!hubspotFields.has(field.toLowerCase())) {
      missing.push({ category: 'owner', field });
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      message: `Missing ${missing.length} required fields`
    };
  }

  return {
    valid: true,
    message: 'All required fields present'
  };
}

/**
 * Validate CSV structure and format
 */
function validateCSVStructure(parsed) {
  if (parsed.error) {
    return { valid: false, message: parsed.error };
  }

  // Check header
  const expectedHeader = '"HubSpot Field Name","Salesforce Field Name","Sync Rule"';
  if (!parsed.header.includes('HubSpot Field Name') ||
      !parsed.header.includes('Salesforce Field Name') ||
      !parsed.header.includes('Sync Rule')) {
    return {
      valid: false,
      message: 'Invalid CSV header. Expected: "HubSpot Field Name","Salesforce Field Name","Sync Rule"'
    };
  }

  // Check for empty fields
  const emptyFields = parsed.fields.filter(f =>
    !f.hubspot || !f.salesforce || !f.syncRule
  );

  if (emptyFields.length > 0) {
    return {
      valid: false,
      warning: true,
      message: `Found ${emptyFields.length} rows with empty fields`
    };
  }

  return {
    valid: true,
    message: 'CSV structure is valid'
  };
}

/**
 * Main validation function
 */
function validatePortalMappings(portal) {
  const instanceDir = path.join(__dirname, '..', '..', 'instances', portal);

  if (!fs.existsSync(instanceDir)) {
    console.error(`❌ Instance directory not found: ${instanceDir}`);
    return { valid: false, error: 'Instance directory not found' };
  }

  // Find CSV files
  const files = fs.readdirSync(instanceDir);
  const csvFiles = files.filter(f => f.endsWith('_field_mappings.csv'));

  if (csvFiles.length === 0) {
    console.error('❌ No field mapping CSV files found');
    return { valid: false, error: 'No CSV files found' };
  }

  console.log(`📋 Validating SFDC field mappings for portal: ${portal}`);
  console.log(`📁 Instance directory: ${instanceDir}\n`);

  const results = {
    portal,
    timestamp: new Date().toISOString(),
    objects: {},
    summary: {
      totalFields: 0,
      filesValidated: 0,
      allValid: true
    }
  };

  // Validate each CSV file
  for (const csvFile of csvFiles) {
    const objectMatch = csvFile.match(/\d+_([A-Z]+)_field_mappings\.csv/);
    if (!objectMatch) continue;

    const objectType = objectMatch[1].toLowerCase();
    const filePath = path.join(instanceDir, csvFile);

    console.log(`\n🔍 Validating ${objectType.toUpperCase()} mappings (${csvFile})...`);

    const parsed = parseCSV(filePath);

    // Structure validation
    const structureCheck = validateCSVStructure(parsed);
    console.log(structureCheck.valid ? '  ✅' : '  ⚠️ ', structureCheck.message);

    if (parsed.error) {
      results.summary.allValid = false;
      results.objects[objectType] = { valid: false, error: parsed.error };
      continue;
    }

    // Field count validation
    const countCheck = validateFieldCount(objectType, parsed.totalFields);
    console.log(countCheck.valid ? '  ✅' : (countCheck.warning ? '  ⚠️ ' : '  ❌'), countCheck.message);

    // Sync rule validation
    const syncRuleCheck = validateSyncRules(parsed.syncRules, parsed.totalFields);
    console.log(`  Sync Rule Distribution:`);
    for (const result of syncRuleCheck.results) {
      const icon = result.valid ? '✅' : (result.warning ? '⚠️ ' : '❌');
      console.log(`    ${icon} ${result.message}`);
    }

    // Required fields validation
    const requiredCheck = validateRequiredFields(objectType, parsed.fields);
    console.log(requiredCheck.valid ? '  ✅' : '  ❌', requiredCheck.message);
    if (!requiredCheck.valid && requiredCheck.missing) {
      for (const miss of requiredCheck.missing) {
        console.log(`    ❌ Missing ${miss.category}: ${miss.field}`);
      }
    }

    // Store results
    const objectValid = structureCheck.valid &&
                        countCheck.valid &&
                        syncRuleCheck.valid &&
                        requiredCheck.valid;

    results.objects[objectType] = {
      file: csvFile,
      valid: objectValid,
      fieldCount: parsed.totalFields,
      syncRules: parsed.syncRules,
      checks: {
        structure: structureCheck,
        fieldCount: countCheck,
        syncRules: syncRuleCheck,
        requiredFields: requiredCheck
      }
    };

    results.summary.totalFields += parsed.totalFields;
    results.summary.filesValidated++;
    if (!objectValid) {
      results.summary.allValid = false;
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Validation Summary`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Portal: ${portal}`);
  console.log(`Files validated: ${results.summary.filesValidated}`);
  console.log(`Total fields: ${results.summary.totalFields}`);
  console.log(`Overall status: ${results.summary.allValid ? '✅ PASSED' : '❌ FAILED'}`);

  return results;
}

// CLI execution
if (require.main === module) {
  const portal = process.argv[2] || process.env.PORTAL;

  if (!portal) {
    console.error('❌ Error: Portal name required');
    console.log('Usage: node validate-sfdc-mappings.js <portal-name>');
    console.log('   or: PORTAL=<portal-name> node validate-sfdc-mappings.js');
    process.exit(1);
  }

  const results = validatePortalMappings(portal);

  if (!results.valid || !results.summary.allValid) {
    process.exit(1);
  }

  process.exit(0);
}

module.exports = { validatePortalMappings, parseCSV, validateFieldCount, validateSyncRules };
