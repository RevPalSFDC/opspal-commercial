#!/usr/bin/env node

/**
 * Page Layout Generator
 *
 * Automatically generates Salesforce page layout XML with all custom fields included.
 * Handles different field types appropriately (auto-number = readonly, required fields, etc.)
 *
 * Usage:
 *   node scripts/lib/page-layout-generator.js <org-alias> <object-api-name> [layout-name]
 *
 * Examples:
 *   node scripts/lib/page-layout-generator.js rentable-sandbox Approval_Request__c
 *   node scripts/lib/page-layout-generator.js production Account "Account Layout"
 *
 * Output:
 *   - Complete layout XML file
 *   - Saved to force-app/main/default/layouts/
 *   - Ready for deployment
 *
 * Features:
 *   - Includes all custom fields automatically
 *   - Handles auto-number fields (readonly)
 *   - Handles required fields properly
 *   - Organizes fields into logical sections
 *   - Generates deployment-ready XML
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
 * System fields to exclude from layouts
 */
const SYSTEM_FIELDS = [
  'Id',
  'CreatedById',
  'CreatedDate',
  'LastModifiedById',
  'LastModifiedDate',
  'SystemModstamp',
  'IsDeleted'
];

class PageLayoutGenerator {
  constructor(orgAlias, objectName, layoutName = null) {
    this.orgAlias = orgAlias;
    this.objectName = objectName;
    this.layoutName = layoutName || `${objectName} Layout`;
    this.fields = [];
    this.nameField = null;
  }

  /**
   * Main execution workflow
   */
  async generate() {
    try {
      console.log(`${colors.cyan}=== Page Layout Generator ===${colors.reset}`);
      console.log(`Org: ${this.orgAlias}`);
      console.log(`Object: ${this.objectName}`);
      console.log(`Layout: ${this.layoutName}`);
      console.log('');

      // Step 1: Retrieve object metadata
      console.log(`${colors.blue}Retrieving object metadata...${colors.reset}`);
      await this.retrieveObjectMetadata();

      // Step 2: Filter and categorize fields
      console.log(`${colors.blue}Categorizing fields...${colors.reset}`);
      this.categorizeFields();

      // Step 3: Generate layout XML
      console.log(`${colors.blue}Generating layout XML...${colors.reset}`);
      const xml = this.generateLayoutXML();

      // Step 4: Save to file
      console.log(`${colors.blue}Saving layout file...${colors.reset}`);
      const filePath = this.saveLayoutFile(xml);

      // Step 5: Display results
      this.displayResults(filePath);

      return 0;

    } catch (error) {
      console.error(`${colors.red}Error generating layout: ${error.message}${colors.reset}`);
      return 2;
    }
  }

  /**
   * Retrieve object metadata from org
   */
  async retrieveObjectMetadata() {
    try {
      const cmd = `sf sobject describe --sobject ${this.objectName} --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8' });
      const data = JSON.parse(result);

      if (data.status !== 0) {
        throw new Error(`Failed to describe object: ${data.message}`);
      }

      this.fields = data.result.fields;
      this.nameField = data.result.fields.find(f => f.nameField === true);

      console.log(`${colors.green}✓ Found ${this.fields.length} fields${colors.reset}`);

    } catch (error) {
      throw new Error(`Failed to retrieve object metadata: ${error.message}`);
    }
  }

  /**
   * Categorize fields by type
   */
  categorizeFields() {
    this.informationSection = [];
    this.systemSection = [];

    for (const field of this.fields) {
      const fieldName = field.name;

      // Skip system fields we don't want on layout
      if (SYSTEM_FIELDS.includes(fieldName)) {
        continue;
      }

      // System info fields (CreatedBy, LastModifiedBy)
      if (fieldName === 'CreatedById' || fieldName === 'LastModifiedById') {
        this.systemSection.push(field);
      }
      // All other fields go in main section
      else {
        this.informationSection.push(field);
      }
    }

    console.log(`${colors.green}✓ ${this.informationSection.length} fields in Information section${colors.reset}`);
  }

  /**
   * Generate layout XML
   */
  generateLayoutXML() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Layout xmlns="http://soap.sforce.com/2006/04/metadata">
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <label>Information</label>
        <layoutColumns>
            <layoutItems>
                <behavior>${this.getFieldBehavior(this.nameField)}</behavior>
                <field>${this.nameField.name}</field>
            </layoutItems>
${this.generateFieldItems(this.informationSection.slice(0, Math.ceil(this.informationSection.length / 2)))}
        </layoutColumns>
        <layoutColumns>
${this.generateFieldItems(this.informationSection.slice(Math.ceil(this.informationSection.length / 2)))}
        </layoutColumns>
        <style>TwoColumnsTopToBottom</style>
    </layoutSections>
    <layoutSections>
        <customLabel>false</customLabel>
        <detailHeading>false</detailHeading>
        <editHeading>true</editHeading>
        <layoutColumns/>
        <layoutColumns/>
        <layoutColumns/>
        <style>CustomLinks</style>
    </layoutSections>
    <showEmailCheckbox>false</showEmailCheckbox>
    <showHighlightsPanel>false</showHighlightsPanel>
    <showInteractionLogPanel>false</showInteractionLogPanel>
    <showRunAssignmentRulesCheckbox>false</showRunAssignmentRulesCheckbox>
    <showSubmitAndAttachButton>false</showSubmitAndAttachButton>
</Layout>`;

    return xml;
  }

  /**
   * Generate layoutItems for a list of fields
   */
  generateFieldItems(fields) {
    return fields.map(field => {
      const behavior = this.getFieldBehavior(field);
      return `            <layoutItems>
                <behavior>${behavior}</behavior>
                <field>${field.name}</field>
            </layoutItems>`;
    }).join('\n');
  }

  /**
   * Determine field behavior based on field properties
   */
  getFieldBehavior(field) {
    if (!field) return 'Edit';

    // Auto-number fields are readonly
    if (field.autoNumber || field.calculated) {
      return 'Readonly';
    }

    // Required fields
    if (!field.nillable && field.name !== 'Name') {
      return 'Required';
    }

    // Default to editable
    return 'Edit';
  }

  /**
   * Save layout file to disk
   */
  saveLayoutFile(xml) {
    const layoutsDir = path.join('force-app', 'main', 'default', 'layouts');

    // Create directory if it doesn't exist
    if (!fs.existsSync(layoutsDir)) {
      fs.mkdirSync(layoutsDir, { recursive: true });
    }

    const fileName = `${this.objectName}-${this.layoutName.replace(/\s+/g, '%20')}.layout-meta.xml`;
    const filePath = path.join(layoutsDir, fileName);

    fs.writeFileSync(filePath, xml);

    return filePath;
  }

  /**
   * Display results to user
   */
  displayResults(filePath) {
    console.log('');
    console.log(`${colors.green}=== Layout Generated Successfully ===${colors.reset}`);
    console.log('');
    console.log(`  File: ${filePath}`);
    console.log(`  Layout: ${this.layoutName}`);
    console.log(`  Fields: ${this.informationSection.length + 1} (including Name)`);
    console.log('');

    console.log(`${colors.cyan}=== Next Steps ===${colors.reset}`);
    console.log(`  1. Review the generated layout file`);
    console.log(`  2. Deploy to ${this.orgAlias}:`);
    console.log(`     ${colors.blue}sf project deploy start --metadata Layout:${this.objectName}-${this.layoutName.replace(/\s+/g, '%20')} --target-org ${this.orgAlias}${colors.reset}`);
    console.log(`  3. Verify deployment:`);
    console.log(`     ${colors.blue}node scripts/lib/post-deployment-state-verifier.js ${this.orgAlias} Layout ${this.objectName}-${this.layoutName.replace(/\s+/g, '%20')}${colors.reset}`);
    console.log('');
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
${colors.bold}Page Layout Generator${colors.reset}

Usage: node page-layout-generator.js <org-alias> <object-api-name> [layout-name]

Arguments:
  org-alias       Salesforce org alias (e.g., rentable-sandbox)
  object-api-name API name of the object (e.g., Approval_Request__c)
  layout-name     Layout name (default: "<Object> Layout")

Examples:
  node page-layout-generator.js rentable-sandbox Approval_Request__c
  node page-layout-generator.js production Account "Account Layout"

Features:
  ✓ Includes all custom fields automatically
  ✓ Handles auto-number fields (readonly)
  ✓ Handles required fields properly
  ✓ Organizes fields into logical sections
  ✓ Generates deployment-ready XML
    `);
    process.exit(2);
  }

  const [orgAlias, objectName, layoutName] = args;

  const generator = new PageLayoutGenerator(orgAlias, objectName, layoutName);
  generator.generate().then(exitCode => {
    process.exit(exitCode);
  });
}

module.exports = { PageLayoutGenerator };
