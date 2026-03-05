#!/usr/bin/env node

/**
 * Test Lucid Standard Import with Salesforce Data
 * Creates populated diagrams directly without templates
 */

const LucidImportClient = require('./lib/lucid-import-client');

// Mock Lucid API for testing
class MockLucidAPI {
  async post(endpoint, body, options) {
    console.log(`\n🌐 API: POST ${endpoint}`);

    if (endpoint === '/documents' && body.import) {
      const importData = body.import.data;
      const shapeCount = importData.pages?.[0]?.shapes?.length || 0;
      const lineCount = importData.pages?.[0]?.lines?.length || 0;

      console.log(`   Format: ${body.import.format}`);
      console.log(`   Shapes: ${shapeCount}`);
      console.log(`   Lines: ${lineCount}`);

      return {
        data: {
          id: `DOC_IMPORTED_${Date.now()}`,
          title: body.title,
          urls: {
            view: `https://lucid.app/view/imported`,
            edit: `https://lucid.app/edit/imported`
          }
        }
      };
    }

    throw new Error(`Unsupported endpoint: ${endpoint}`);
  }
}

async function testLucidImport() {
  console.log('🧪 Testing Lucid Standard Import');
  console.log('=' .repeat(70));
  console.log('Creates populated diagrams directly - no templates, no blank docs!\n');

  const lucidAPI = new MockLucidAPI();
  const importClient = new LucidImportClient(lucidAPI);

  // Test 1: Architecture Diagram with real Salesforce org data
  console.log('\n📊 Test 1: Salesforce Architecture Diagram');
  console.log('-'.repeat(50));

  const architectureData = {
    objects: {
      standardObjects: 87,
      customObjects: 42,
      apexClasses: 156,
      flows: 23,
      includes: ['Lightning', 'Experience']
    },
    integrations: ['REST API', 'Bulk API', 'Platform Events'],
    users: 250,
    limits: {
      apiCallsDaily: 1000000,
      storageGB: 50
    }
  };

  const archResult = await importClient.createDiagramFromData({
    tenantId: 'acme-corp',
    sfRecordId: 'ORG001',
    sfObject: 'Organization',
    recordName: 'Production Org',
    diagramType: 'architecture',
    salesforceData: architectureData
  });

  console.log(`\n✅ Result: ${archResult.result.documents[0].docId}`);
  console.log(`   Populated with ${archResult.result.documents[0].shapeCount} shapes`);

  // Test 2: ERD with Salesforce schema
  console.log('\n📊 Test 2: Entity Relationship Diagram');
  console.log('-'.repeat(50));

  const schemaData = {
    objects: [
      {
        name: 'Account',
        fields: [
          { name: 'Id', type: 'ID', required: true },
          { name: 'Name', type: 'Text(255)', required: true },
          { name: 'Type', type: 'Picklist', required: false },
          { name: 'Industry', type: 'Picklist', required: false },
          { name: 'AnnualRevenue', type: 'Currency', required: false }
        ],
        relationships: [
          { relationshipName: 'Contacts', referenceTo: 'Contact', type: 'lookup' },
          { relationshipName: 'Opportunities', referenceTo: 'Opportunity', type: 'lookup' }
        ]
      },
      {
        name: 'Contact',
        fields: [
          { name: 'Id', type: 'ID', required: true },
          { name: 'FirstName', type: 'Text(40)', required: false },
          { name: 'LastName', type: 'Text(80)', required: true },
          { name: 'Email', type: 'Email', required: false },
          { name: 'AccountId', type: 'Lookup(Account)', required: false }
        ],
        relationships: [
          { relationshipName: 'Account', referenceTo: 'Account', type: 'lookup' }
        ]
      },
      {
        name: 'Opportunity',
        fields: [
          { name: 'Id', type: 'ID', required: true },
          { name: 'Name', type: 'Text(120)', required: true },
          { name: 'Amount', type: 'Currency', required: false },
          { name: 'CloseDate', type: 'Date', required: true },
          { name: 'StageName', type: 'Picklist', required: true }
        ],
        relationships: [
          { relationshipName: 'Account', referenceTo: 'Account', type: 'lookup' }
        ]
      }
    ]
  };

  const erdResult = await importClient.createDiagramFromData({
    tenantId: 'acme-corp',
    sfRecordId: 'SCHEMA001',
    sfObject: 'Schema',
    recordName: 'Sales Cloud Model',
    diagramType: 'erd',
    salesforceData: schemaData
  });

  console.log(`\n✅ Result: ${erdResult.result.documents[0].docId}`);
  console.log(`   Entities: ${schemaData.objects.length}`);
  console.log(`   Relationships: ${erdResult.result.documents[0].lineCount}`);

  // Test 3: Process Flow with swimlanes
  console.log('\n📊 Test 3: Lead to Cash Process Flow');
  console.log('-'.repeat(50));

  const processData = {
    actors: ['Customer', 'Sales Rep', 'Sales Manager', 'System'],
    steps: [
      { id: 'start', name: 'Lead Created', actor: 'Customer', type: 'start', next: ['qualify'] },
      { id: 'qualify', name: 'Qualify Lead', actor: 'Sales Rep', type: 'process', next: ['decision'] },
      { id: 'decision', name: 'Qualified?', actor: 'Sales Rep', type: 'decision', next: ['convert', 'reject'] },
      { id: 'convert', name: 'Convert to Opportunity', actor: 'System', type: 'process', next: ['assign'], condition: 'Yes' },
      { id: 'reject', name: 'Mark as Unqualified', actor: 'System', type: 'process', next: ['end'], condition: 'No' },
      { id: 'assign', name: 'Assign to Rep', actor: 'Sales Manager', type: 'process', next: ['work'] },
      { id: 'work', name: 'Work Opportunity', actor: 'Sales Rep', type: 'process', next: ['close'] },
      { id: 'close', name: 'Close Deal', actor: 'Sales Rep', type: 'process', next: ['end'] },
      { id: 'end', name: 'Process Complete', actor: 'System', type: 'end' }
    ]
  };

  const flowResult = await importClient.createDiagramFromData({
    tenantId: 'acme-corp',
    sfRecordId: 'PROCESS001',
    sfObject: 'Process',
    recordName: 'Lead to Cash',
    diagramType: 'process-flow',
    salesforceData: processData
  });

  console.log(`\n✅ Result: ${flowResult.result.documents[0].docId}`);
  console.log(`   Swimlanes: ${processData.actors.length}`);
  console.log(`   Steps: ${processData.steps.length}`);

  // Test 4: Opportunity Pipeline
  console.log('\n📊 Test 4: Sales Pipeline Visualization');
  console.log('-'.repeat(50));

  const pipelineData = {
    stages: [
      { name: 'Prospecting', total: 500000, color: '#90CAF9' },
      { name: 'Qualification', total: 400000, color: '#81C784' },
      { name: 'Needs Analysis', total: 300000, color: '#FFB74D' },
      { name: 'Proposal', total: 200000, color: '#FF8A65' },
      { name: 'Negotiation', total: 150000, color: '#BA68C8' },
      { name: 'Closed Won', total: 100000, color: '#4CAF50' }
    ],
    opportunities: [
      { name: 'Acme Deal', stage: 'Prospecting', amount: 50000, probability: 10 },
      { name: 'Global Inc', stage: 'Qualification', amount: 75000, probability: 25 },
      { name: 'Tech Corp', stage: 'Needs Analysis', amount: 100000, probability: 40 },
      { name: 'Enterprise Co', stage: 'Proposal', amount: 150000, probability: 60 },
      { name: 'Big Customer', stage: 'Negotiation', amount: 200000, probability: 80 }
    ]
  };

  const pipelineResult = await importClient.createDiagramFromData({
    tenantId: 'acme-corp',
    sfRecordId: 'PIPE001',
    sfObject: 'Pipeline',
    recordName: 'Q1 2025 Pipeline',
    diagramType: 'pipeline',
    salesforceData: pipelineData
  });

  console.log(`\n✅ Result: ${pipelineResult.result.documents[0].docId}`);
  console.log(`   Stages: ${pipelineData.stages.length}`);
  console.log(`   Opportunities: ${pipelineData.opportunities.length}`);

  // Test 5: Account Hierarchy
  console.log('\n📊 Test 5: Account Hierarchy Structure');
  console.log('-'.repeat(50));

  const hierarchyData = {
    accounts: [
      { id: 'ACC001', name: 'Global Parent', hierarchyLevel: 0, revenue: 10000000 },
      { id: 'ACC002', name: 'US Division', hierarchyLevel: 1, revenue: 5000000 },
      { id: 'ACC003', name: 'EU Division', hierarchyLevel: 1, revenue: 3000000 },
      { id: 'ACC004', name: 'East Region', hierarchyLevel: 2, revenue: 2000000 },
      { id: 'ACC005', name: 'West Region', hierarchyLevel: 2, revenue: 3000000 },
      { id: 'ACC006', name: 'North Region', hierarchyLevel: 2, revenue: 1500000 }
    ],
    relationships: [
      { parentId: 'ACC001', childId: 'ACC002', type: 'owns' },
      { parentId: 'ACC001', childId: 'ACC003', type: 'owns' },
      { parentId: 'ACC002', childId: 'ACC004', type: 'owns' },
      { parentId: 'ACC002', childId: 'ACC005', type: 'owns' },
      { parentId: 'ACC003', childId: 'ACC006', type: 'owns' }
    ]
  };

  const hierarchyResult = await importClient.createDiagramFromData({
    tenantId: 'acme-corp',
    sfRecordId: 'HIER001',
    sfObject: 'AccountHierarchy',
    recordName: 'Global Structure',
    diagramType: 'hierarchy',
    salesforceData: hierarchyData
  });

  console.log(`\n✅ Result: ${hierarchyResult.result.documents[0].docId}`);
  console.log(`   Accounts: ${hierarchyData.accounts.length}`);
  console.log(`   Relationships: ${hierarchyData.relationships.length}`);

  // Summary
  console.log('\n\n📈 IMPORT TEST SUMMARY');
  console.log('=' .repeat(70));
  console.log('\n✅ Successfully created 5 populated diagrams:');
  console.log('   1. Architecture - org structure with layers');
  console.log('   2. ERD - data model with relationships');
  console.log('   3. Process Flow - swimlanes with steps');
  console.log('   4. Pipeline - sales stages with opportunities');
  console.log('   5. Hierarchy - account structure');
  console.log('\n🎯 Key Benefits:');
  console.log('   • No templates needed');
  console.log('   • No blank documents created');
  console.log('   • Populated directly from Salesforce data');
  console.log('   • Fully structured with shapes and connectors');
  console.log('   • Ready for immediate use');

  console.log('\n💡 Next Steps:');
  console.log('   1. Connect to real Lucid API with Import endpoint');
  console.log('   2. Pull live data from Salesforce org');
  console.log('   3. Create diagrams on-demand from actual data');
  console.log('   4. No manual template setup required!\n');
}

// Run test
testLucidImport().catch(console.error);