#!/usr/bin/env node

/**
 * Setup Lucid Templates
 * Creates real template documents in Lucidchart and updates the registry
 */

const fs = require('fs').promises;
const path = require('path');

// Template definitions with placeholder content
const TEMPLATE_DEFINITIONS = {
  'architecture': {
    name: 'Salesforce Architecture Template',
    description: 'Standard architecture diagram template with AWS/cloud components',
    content: 'Architecture template with layers: Presentation, Business Logic, Data, Integration',
    product: 'lucidchart'
  },
  'data-flow': {
    name: 'Data Flow Template',
    description: 'Data flow diagram with system boundaries',
    content: 'Data flow template with: Sources, Transformations, Destinations, APIs',
    product: 'lucidchart'
  },
  'swimlane': {
    name: 'Process Swimlane Template',
    description: 'Business process swimlane template',
    content: 'Swimlane template with roles: Customer, Sales, Support, Backend',
    product: 'lucidchart'
  },
  'erd': {
    name: 'Entity Relationship Diagram Template',
    description: 'Database/data model ERD template',
    content: 'ERD template with entities, relationships, and cardinality',
    product: 'lucidchart'
  },
  'roadmap': {
    name: 'Product Roadmap Template',
    description: 'Timeline roadmap for planning',
    content: 'Roadmap template with quarters, milestones, and deliverables',
    product: 'lucidspark'
  }
};

/**
 * Instructions for manual template setup
 */
function printSetupInstructions() {
  console.log('\n📚 LUCID TEMPLATE SETUP INSTRUCTIONS');
  console.log('=' .repeat(70));
  console.log('\nTo use the template-based creation system with real Lucidchart:\n');

  console.log('1️⃣  CREATE TEMPLATE DOCUMENTS IN LUCIDCHART:');
  console.log('   a. Log into Lucidchart (https://lucid.app)');
  console.log('   b. Create a new folder called "Templates"');
  console.log('   c. Create these template documents:\n');

  Object.entries(TEMPLATE_DEFINITIONS).forEach(([type, def]) => {
    console.log(`   📄 ${def.name}`);
    console.log(`      - Type: ${type}`);
    console.log(`      - Product: ${def.product}`);
    console.log(`      - Content: ${def.content}`);
    console.log('');
  });

  console.log('2️⃣  GET THE DOCUMENT IDs:');
  console.log('   a. Open each template document');
  console.log('   b. Look at the URL: https://lucid.app/lucidchart/[DOCUMENT_ID]/edit');
  console.log('   c. Copy the DOCUMENT_ID part\n');

  console.log('3️⃣  UPDATE THE TEMPLATE REGISTRY:');
  console.log('   Run this command with the real IDs:\n');
  console.log('   node scripts/setup-lucid-templates.js update \\');
  console.log('     --architecture [ARCH_DOC_ID] \\');
  console.log('     --data-flow [FLOW_DOC_ID] \\');
  console.log('     --swimlane [SWIM_DOC_ID] \\');
  console.log('     --erd [ERD_DOC_ID] \\');
  console.log('     --roadmap [ROAD_DOC_ID]\n');

  console.log('4️⃣  TEST THE SYSTEM:');
  console.log('   node scripts/test-lucid-with-real-templates.js\n');

  console.log('=' .repeat(70));
  console.log('\n📝 ALTERNATIVE: Use MCP Lucid Tools Directly\n');
  console.log('If you have MCP Lucid tools configured, you can create templates programmatically:');
  console.log('1. Use mcp_lucid("createDocument", {...}) to create each template');
  console.log('2. Save the returned document IDs');
  console.log('3. Update the registry with those IDs\n');
}

/**
 * Update registry with real template IDs
 */
async function updateRegistry(args) {
  const registryPath = path.join(__dirname, '../config/lucid-template-registry.json');

  try {
    // Load current registry
    const registryContent = await fs.readFile(registryPath, 'utf8');
    const registry = JSON.parse(registryContent);

    // Update with real IDs
    const updates = {
      'architecture': args['--architecture'] || args['-a'],
      'data-flow': args['--data-flow'] || args['-d'],
      'swimlane': args['--swimlane'] || args['-s'],
      'erd': args['--erd'] || args['-e'],
      'roadmap': args['--roadmap'] || args['-r']
    };

    let updatedCount = 0;

    // Update ACME tenant templates
    if (registry.tenants.acme && registry.tenants.acme.templates) {
      Object.entries(updates).forEach(([type, id]) => {
        if (id && registry.tenants.acme.templates[type]) {
          console.log(`✅ Updating ${type}: ${id}`);
          registry.tenants.acme.templates[type].templateDocId = id;
          registry.tenants.acme.templates[type].isReal = true;
          updatedCount++;
        }
      });
    }

    if (updatedCount > 0) {
      // Save updated registry
      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
      console.log(`\n✅ Updated ${updatedCount} template IDs in registry`);
      console.log(`   Path: ${registryPath}\n`);
    } else {
      console.log('\n⚠️  No template IDs were provided to update\n');
    }

  } catch (error) {
    console.error('❌ Error updating registry:', error.message);
  }
}

/**
 * Create a test document using real templates
 */
async function testRealTemplate() {
  console.log('\n🧪 TESTING REAL TEMPLATE CREATION');
  console.log('-'.repeat(50));

  console.log('\nTo test with real templates:');
  console.log('1. Ensure templates are created in Lucidchart');
  console.log('2. Registry is updated with real IDs');
  console.log('3. Run: node scripts/lib/lucid-real-creation.js\n');

  // Check if we have real IDs
  const registryPath = path.join(__dirname, '../config/lucid-template-registry.json');
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));

  const templates = registry.tenants.acme.templates;
  const hasRealIds = Object.values(templates).some(t => t.isReal);

  if (hasRealIds) {
    console.log('✅ Found real template IDs in registry');
    console.log('   Ready to create real documents!\n');
  } else {
    console.log('⚠️  No real template IDs found');
    console.log('   Please follow the setup instructions above\n');
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('\n🎨 Lucid Template Setup Tool');
  console.log('=' .repeat(70));

  if (command === 'update') {
    // Parse arguments
    const argMap = {};
    for (let i = 1; i < args.length; i += 2) {
      if (args[i] && args[i + 1]) {
        argMap[args[i]] = args[i + 1];
      }
    }
    await updateRegistry(argMap);
    await testRealTemplate();
  } else if (command === 'test') {
    await testRealTemplate();
  } else {
    printSetupInstructions();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
}

module.exports = { TEMPLATE_DEFINITIONS };