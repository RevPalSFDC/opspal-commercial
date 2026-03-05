#!/usr/bin/env node

/**
 * Create Real Master Templates in Lucidchart
 * This script helps create the actual master templates that will be used for auto-bootstrapping
 */

const fs = require('fs').promises;
const path = require('path');

// Load master template configuration
const MASTER_CONFIG = require('../config/master-templates.json');

/**
 * Generate instructions for creating master templates
 */
async function generateTemplateCreationInstructions() {
  console.log('\n📚 MASTER TEMPLATE CREATION GUIDE');
  console.log('=' .repeat(70));
  console.log('\nFollow these steps to create master templates in Lucidchart:\n');

  console.log('1️⃣  LOG INTO LUCIDCHART');
  console.log('   - Go to: https://lucid.app');
  console.log('   - Sign in with your account\n');

  console.log('2️⃣  CREATE A MASTER TEMPLATES FOLDER');
  console.log('   - Click "New" → "Folder"');
  console.log('   - Name it: "MASTER_TEMPLATES"');
  console.log('   - This will hold all master templates\n');

  console.log('3️⃣  CREATE EACH MASTER TEMPLATE:\n');

  // Generate specific instructions for each template
  Object.entries(MASTER_CONFIG.masterTemplates).forEach(([type, config], index) => {
    console.log(`   ${index + 1}. ${config.name}`);
    console.log(`      Type: ${type}`);
    console.log(`      Product: ${config.product}`);
    console.log(`      ------------------------`);

    if (config.product === 'lucidchart') {
      console.log(`      a) Click "New" → "Lucidchart Document"`);
    } else {
      console.log(`      a) Click "New" → "Lucidspark Board"`);
    }

    console.log(`      b) Name it: "${config.name}"`);
    console.log(`      c) Add these elements:`);

    // Show content structure
    if (config.content) {
      Object.entries(config.content).forEach(([key, items]) => {
        console.log(`         - ${key}: ${Array.isArray(items) ? items.slice(0, 3).join(', ') : items}`);
      });
    }

    console.log(`      d) Save the document`);
    console.log(`      e) Copy the document ID from URL`);
    console.log(`         (https://lucid.app/lucidchart/[DOCUMENT_ID]/edit)\n`);
  });

  console.log('4️⃣  COLLECT THE DOCUMENT IDs');
  console.log('   Create a file with the IDs you collected:\n');

  // Generate template for .env.lucid.templates
  const envTemplate = Object.keys(MASTER_CONFIG.masterTemplates).map(type => {
    const envKey = `LUCID_MASTER_${type.toUpperCase().replace(/-/g, '_')}_ID`;
    return `${envKey}=<paste-${type}-doc-id-here>`;
  }).join('\n');

  console.log('   File: .env.lucid.templates');
  console.log('   ' + '-'.repeat(50));
  console.log(envTemplate.split('\n').map(line => '   ' + line).join('\n'));
  console.log('   ' + '-'.repeat(50) + '\n');

  // Save template file
  const envPath = path.join(__dirname, '../.env.lucid.templates');
  await fs.writeFile(envPath, envTemplate + '\n', 'utf8');
  console.log(`   ✅ Template file created: ${envPath}\n`);

  console.log('5️⃣  UPDATE YOUR ENVIRONMENT');
  console.log('   After filling in the real document IDs:');
  console.log('   ```bash');
  console.log('   source .env.lucid.templates');
  console.log('   ```\n');

  console.log('6️⃣  VERIFY THE SETUP');
  console.log('   Run the verification script:');
  console.log('   ```bash');
  console.log('   node scripts/verify-master-templates.js');
  console.log('   ```\n');

  console.log('=' .repeat(70));
  console.log('\n💡 PRO TIPS:');
  console.log('   • Make templates comprehensive but flexible');
  console.log('   • Include placeholder text that\'s easy to replace');
  console.log('   • Use consistent styling across all templates');
  console.log('   • Add helpful annotations or instructions in templates');
  console.log('   • Consider version numbers in template names\n');
}

/**
 * Create a sample template content generator
 */
async function generateSampleTemplateContent() {
  const samples = {
    'architecture': {
      title: 'Salesforce Architecture Template',
      shapes: [
        { type: 'container', label: 'Presentation Layer', x: 100, y: 100, width: 600, height: 150 },
        { type: 'container', label: 'Business Logic Layer', x: 100, y: 280, width: 600, height: 150 },
        { type: 'container', label: 'Data Layer', x: 100, y: 460, width: 600, height: 150 },
        { type: 'container', label: 'Integration Layer', x: 100, y: 640, width: 600, height: 150 },
        { type: 'box', label: 'Lightning Web Components', x: 120, y: 130 },
        { type: 'box', label: 'Apex Controllers', x: 120, y: 310 },
        { type: 'box', label: 'Custom Objects', x: 120, y: 490 },
        { type: 'box', label: 'REST APIs', x: 120, y: 670 }
      ],
      connectors: [
        { from: 'Lightning Web Components', to: 'Apex Controllers', label: 'Server Calls' },
        { from: 'Apex Controllers', to: 'Custom Objects', label: 'SOQL/DML' },
        { from: 'Custom Objects', to: 'REST APIs', label: 'External Sync' }
      ]
    },
    'data-flow': {
      title: 'Data Flow Template',
      shapes: [
        { type: 'process', label: 'Data Source', x: 100, y: 200 },
        { type: 'process', label: 'ETL Process', x: 300, y: 200 },
        { type: 'process', label: 'Transformation', x: 500, y: 200 },
        { type: 'database', label: 'Data Warehouse', x: 700, y: 200 },
        { type: 'boundary', label: 'Internal Systems', x: 50, y: 100, width: 400, height: 200 },
        { type: 'boundary', label: 'Cloud Services', x: 480, y: 100, width: 400, height: 200 }
      ],
      flows: [
        { from: 'Data Source', to: 'ETL Process', type: 'data' },
        { from: 'ETL Process', to: 'Transformation', type: 'data' },
        { from: 'Transformation', to: 'Data Warehouse', type: 'data' }
      ]
    },
    'erd': {
      title: 'Entity Relationship Diagram',
      entities: [
        { name: 'Account', fields: ['Id', 'Name', 'Type', 'Industry'], x: 100, y: 100 },
        { name: 'Contact', fields: ['Id', 'FirstName', 'LastName', 'Email'], x: 400, y: 100 },
        { name: 'Opportunity', fields: ['Id', 'Name', 'Amount', 'Stage'], x: 250, y: 300 },
        { name: 'Custom_Object__c', fields: ['Id', 'Name', 'Field1__c', 'Field2__c'], x: 550, y: 300 }
      ],
      relationships: [
        { from: 'Account', to: 'Contact', type: 'one-to-many', label: 'Has Contacts' },
        { from: 'Account', to: 'Opportunity', type: 'one-to-many', label: 'Has Opportunities' },
        { from: 'Opportunity', to: 'Custom_Object__c', type: 'many-to-many', label: 'Junction' }
      ]
    }
  };

  const samplesPath = path.join(__dirname, '../config/template-samples.json');
  await fs.writeFile(samplesPath, JSON.stringify(samples, null, 2), 'utf8');
  console.log(`\n📄 Sample template content saved to: ${samplesPath}`);
  console.log('   Use this as a reference when creating templates in Lucidchart\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🎨 Lucid Master Template Creation Assistant');
  console.log('This tool helps you create the master templates needed for auto-bootstrapping\n');

  await generateTemplateCreationInstructions();
  await generateSampleTemplateContent();

  console.log('📋 QUICK CHECKLIST:');
  console.log('   ☐ Create MASTER_TEMPLATES folder in Lucidchart');
  console.log('   ☐ Create all 8 master templates');
  console.log('   ☐ Collect document IDs');
  console.log('   ☐ Update .env.lucid.templates with real IDs');
  console.log('   ☐ Source the environment file');
  console.log('   ☐ Run verification script');
  console.log('   ☐ Test auto-bootstrap with a new tenant\n');

  console.log('Once complete, the system will automatically:');
  console.log('   • Bootstrap tenant templates from masters');
  console.log('   • Create documents from tenant templates');
  console.log('   • Never create blank documents');
  console.log('   • Maintain multi-tenant isolation\n');
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}