#!/usr/bin/env node

/**
 * Field-Level Security (FLS) Generator
 *
 * Automatically generates fieldPermissions XML for Salesforce profiles and permission sets.
 * Intelligently excludes required fields (nillable=false) which cannot have FLS set.
 *
 * Usage:
 *   node scripts/lib/fls-generator.js <org-alias> <object-api-name> [profile-name]
 *
 * Examples:
 *   node scripts/lib/fls-generator.js delta-sandbox Approval_Request__c Admin
 *   node scripts/lib/fls-generator.js production Account "System Administrator"
 *
 * Output:
 *   - XML snippet for fieldPermissions entries (ready to paste into profile/permission set)
 *   - List of excluded required fields
 *   - Count of fields with FLS generated
 *
 * Features:
 *   - Automatically excludes required fields (prevents deployment errors)
 *   - Excludes system fields (CreatedById, LastModifiedById, etc.)
 *   - Generates both editable and readable permissions
 *   - Provides copy-paste ready XML
 *
 * @author RevPal Agent System
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * System fields to exclude from FLS generation
 */
const SYSTEM_FIELDS = [
  'Id',
  'CreatedById',
  'CreatedDate',
  'LastModifiedById',
  'LastModifiedDate',
  'SystemModstamp',
  'IsDeleted',
  'Name' // Usually auto-number or formula, can't be edited
];

class FLSGenerator {
  constructor(orgAlias, objectName, profileName = 'Admin') {
    this.orgAlias = orgAlias;
    this.objectName = objectName;
    this.profileName = profileName;
    this.fields = [];
    this.requiredFields = [];
    this.systemFields = [];
    this.flsFields = [];
  }

  /**
   * Main execution workflow
   */
  async generate() {
    try {
      console.log(`${colors.cyan}=== FLS Generator ===${colors.reset}`);
      console.log(`Org: ${this.orgAlias}`);
      console.log(`Object: ${this.objectName}`);
      console.log(`Profile: ${this.profileName}`);
      console.log('');

      // Step 1: Retrieve object metadata
      console.log(`${colors.blue}Retrieving object metadata...${colors.reset}`);
      await this.retrieveObjectMetadata();

      // Step 2: Filter fields
      console.log(`${colors.blue}Filtering fields...${colors.reset}`);
      this.filterFields();

      // Step 3: Generate FLS XML
      console.log(`${colors.blue}Generating fieldPermissions XML...${colors.reset}`);
      const xml = this.generateXML();

      // Step 4: Display results
      this.displayResults(xml);

      return 0;

    } catch (error) {
      console.error(`${colors.red}Error generating FLS: ${error.message}${colors.reset}`);
      return 2;
    }
  }

  /**
   * Retrieve object metadata from org
   */
  async retrieveObjectMetadata() {
    try {
      // Use sobject describe to get field metadata
      const cmd = `sf sobject describe --sobject ${this.objectName} --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8' });
      const data = JSON.parse(result);

      if (data.status !== 0) {
        throw new Error(`Failed to describe object: ${data.message}`);
      }

      this.fields = data.result.fields;
      console.log(`${colors.green}✓ Found ${this.fields.length} fields${colors.reset}`);

    } catch (error) {
      throw new Error(`Failed to retrieve object metadata: ${error.message}`);
    }
  }

  /**
   * Filter fields into categories
   */
  filterFields() {
    for (const field of this.fields) {
      const fieldName = field.name;

      // Skip system fields
      if (SYSTEM_FIELDS.includes(fieldName)) {
        this.systemFields.push(fieldName);
        continue;
      }

      // Skip standard fields (no __c suffix)
      if (!fieldName.endsWith('__c') && !fieldName.endsWith('__pc')) {
        this.systemFields.push(fieldName);
        continue;
      }

      // Skip required fields (nillable = false)
      if (field.nillable === false) {
        this.requiredFields.push(fieldName);
        continue;
      }

      // This field can have FLS
      this.flsFields.push({
        name: fieldName,
        type: field.type,
        label: field.label
      });
    }

    console.log(`${colors.green}✓ ${this.flsFields.length} fields eligible for FLS${colors.reset}`);
    console.log(`${colors.yellow}  ${this.requiredFields.length} required fields excluded${colors.reset}`);
    console.log(`${colors.yellow}  ${this.systemFields.length} system fields excluded${colors.reset}`);
  }

  /**
   * Generate fieldPermissions XML
   */
  generateXML() {
    if (this.flsFields.length === 0) {
      return '<!-- No custom fields eligible for FLS -->';
    }

    let xml = '';

    for (const field of this.flsFields) {
      xml += `    <fieldPermissions>\n`;
      xml += `        <editable>true</editable>\n`;
      xml += `        <field>${this.objectName}.${field.name}</field>\n`;
      xml += `        <readable>true</readable>\n`;
      xml += `    </fieldPermissions>\n`;
    }

    return xml;
  }

  /**
   * Display results to user
   */
  displayResults(xml) {
    console.log('');
    console.log(`${colors.cyan}=== Generated fieldPermissions XML ===${colors.reset}`);
    console.log('');
    console.log(xml);
    console.log('');

    if (this.requiredFields.length > 0) {
      console.log(`${colors.yellow}=== Excluded Required Fields (cannot have FLS) ===${colors.reset}`);
      console.log('');
      this.requiredFields.forEach(field => {
        console.log(`  ${field}`);
      });
      console.log('');
      console.log(`${colors.yellow}Note: Required fields are automatically accessible to all users.${colors.reset}`);
      console.log(`${colors.yellow}FLS restrictions do not apply to required fields.${colors.reset}`);
      console.log('');
    }

    console.log(`${colors.green}=== Summary ===${colors.reset}`);
    console.log(`  Total fields: ${this.fields.length}`);
    console.log(`  ${colors.green}FLS generated: ${this.flsFields.length}${colors.reset}`);
    console.log(`  ${colors.yellow}Required fields excluded: ${this.requiredFields.length}${colors.reset}`);
    console.log(`  System fields excluded: ${this.systemFields.length}`);
    console.log('');

    console.log(`${colors.cyan}=== Next Steps ===${colors.reset}`);
    console.log(`  1. Copy the XML above`);
    console.log(`  2. Paste into your ${this.profileName}.profile-meta.xml file`);
    console.log(`  3. Deploy the profile to ${this.orgAlias}`);
    console.log(`  4. Run post-deployment verification:`);
    console.log(`     ${colors.blue}node scripts/lib/post-deployment-state-verifier.js ${this.orgAlias} Profile ${this.profileName}${colors.reset}`);
    console.log('');
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
${colors.bold}Field-Level Security (FLS) Generator${colors.reset}

Usage: node fls-generator.js <org-alias> <object-api-name> [profile-name]

Arguments:
  org-alias       Salesforce org alias (e.g., delta-sandbox)
  object-api-name API name of the object (e.g., Approval_Request__c)
  profile-name    Profile name (default: Admin)

Examples:
  node fls-generator.js delta-sandbox Approval_Request__c
  node fls-generator.js production Account "System Administrator"

Features:
  ✓ Automatically excludes required fields (prevents deployment errors)
  ✓ Excludes system fields
  ✓ Generates editable + readable permissions
  ✓ Provides copy-paste ready XML

Note: Required fields (nillable=false) cannot have FLS set by Salesforce restriction.
      These fields are automatically excluded from generation.
    `);
    process.exit(2);
  }

  const [orgAlias, objectName, profileName] = args;

  const generator = new FLSGenerator(orgAlias, objectName, profileName);
  generator.generate().then(exitCode => {
    process.exit(exitCode);
  });
}

module.exports = { FLSGenerator };
