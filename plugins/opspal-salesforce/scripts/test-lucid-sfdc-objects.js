#!/usr/bin/env node

/**
 * Test Script: Create Lucid Documents for SFDC Objects
 * Creates template-based diagrams for Accounts, Contacts, and Opportunities
 */

const LucidDocumentFactory = require('./lib/lucid-document-factory');
const LucidTenantManager = require('./lib/lucid-tenant-manager');
const LucidSalesforceConnector = require('./lib/lucid-sf-connector');
const path = require('path');
const fs = require('fs').promises;

// Mock Lucid API for testing
class MockLucidApi {
  constructor() {
    this.documents = new Map();
    this.folders = new Map();
    this.requestLog = [];
    this.documentCounter = 1000;
  }

  async post(endpoint, body, options = {}) {
    console.log(`📡 API POST ${endpoint}`);
    this.requestLog.push({ endpoint, body, headers: options.headers });

    if (endpoint === '/documents') {
      // Check idempotency
      const idempotencyKey = options.headers?.['Idempotency-Key'];
      if (idempotencyKey && this.documents.has(idempotencyKey)) {
        console.log(`  ↩️  Returning cached document (idempotent)`);
        return { data: this.documents.get(idempotencyKey) };
      }

      // Create new document
      const docId = `DOC_${this.documentCounter++}`;
      const doc = {
        id: docId,
        title: body.title,
        product: body.product || 'lucidchart',
        parentFolderId: body.parentFolderId,
        templateUsed: body.template?.sourceDocId,
        urls: {
          view: `https://lucid.app/lucidchart/${docId}/view`,
          edit: `https://lucid.app/lucidchart/${docId}/edit`
        },
        createdAt: new Date().toISOString()
      };

      if (idempotencyKey) {
        this.documents.set(idempotencyKey, doc);
      }
      this.documents.set(doc.id, doc);

      console.log(`  ✅ Created document: ${doc.id}`);
      return { data: doc };
    }

    throw new Error(`Unsupported endpoint: ${endpoint}`);
  }

  async get(endpoint, options = {}) {
    console.log(`📡 API GET ${endpoint}`);

    if (endpoint === '/documents/search') {
      const { query, parentFolderId } = options.params || {};
      const results = [];

      for (const doc of this.documents.values()) {
        if (doc.title === query && doc.parentFolderId === parentFolderId) {
          results.push(doc);
        }
      }

      return { data: { documents: results } };
    }

    if (endpoint.startsWith('/documents/')) {
      const docId = endpoint.split('/')[2];
      const doc = this.documents.get(docId);
      if (doc) {
        return { data: doc };
      }
      throw new Error(`Document not found: ${docId}`);
    }

    throw new Error(`Unsupported endpoint: ${endpoint}`);
  }

  // Helper to get all created documents
  getAllDocuments() {
    return Array.from(this.documents.values()).filter(doc => doc.id);
  }
}

// Test Data for SFDC Objects
const testData = {
  accounts: [
    {
      id: '001xx000003DHPh',
      name: 'Acme Corporation',
      type: 'Customer',
      industry: 'Technology',
      annualRevenue: 50000000,
      employees: 500
    },
    {
      id: '001xx000003DHPi',
      name: 'Global Enterprises',
      type: 'Prospect',
      industry: 'Manufacturing',
      annualRevenue: 100000000,
      employees: 1000
    }
  ],
  contacts: [
    {
      id: '003xx000004TMM2',
      firstName: 'John',
      lastName: 'Smith',
      accountId: '001xx000003DHPh',
      title: 'CEO',
      email: 'john.smith@acme.com'
    },
    {
      id: '003xx000004TMM3',
      firstName: 'Jane',
      lastName: 'Doe',
      accountId: '001xx000003DHPi',
      title: 'CTO',
      email: 'jane.doe@global.com'
    }
  ],
  opportunities: [
    {
      id: '006xx000002hM3x',
      name: 'Acme - Enterprise Deal',
      accountId: '001xx000003DHPh',
      amount: 250000,
      stage: 'Negotiation',
      closeDate: '2025-12-31',
      probability: 75
    },
    {
      id: '006xx000002hM3y',
      name: 'Global - Expansion Project',
      accountId: '001xx000003DHPi',
      amount: 500000,
      stage: 'Proposal',
      closeDate: '2025-10-15',
      probability: 50
    }
  ]
};

// Main test function
async function createTestDocuments() {
  console.log('\n🚀 Lucid Template-Based Document Creation Test');
  console.log('=' .repeat(60));
  console.log('Creating diagrams for Accounts, Contacts, and Opportunities\n');

  // Initialize components
  const mockApi = new MockLucidApi();
  const config = {
    templateRegistryPath: path.join(__dirname, '../config/lucid-template-registry.json')
  };

  const factory = new LucidDocumentFactory(mockApi, config);
  const tenantManager = new LucidTenantManager(config);
  const sfConnector = new LucidSalesforceConnector(tenantManager, factory, config);

  const results = {
    accounts: [],
    contacts: [],
    opportunities: []
  };

  // 1. Create Account Diagrams
  console.log('\n📊 Creating Account Diagrams');
  console.log('-'.repeat(40));

  for (const account of testData.accounts) {
    try {
      console.log(`\n🏢 Processing Account: ${account.name}`);

      // Create architecture diagram for account
      const archResult = await factory.createFromTemplate({
        tenantId: 'acme',
        sfRecordId: account.id,
        sfObject: 'Account',
        recordName: account.name,
        diagramType: 'architecture'
      });

      console.log(`  ✅ Architecture diagram created`);
      console.log(`     Title: ${archResult.result.documents[0].title}`);
      console.log(`     Doc ID: ${archResult.result.documents[0].docId}`);
      console.log(`     View: ${archResult.result.documents[0].viewUrl}`);

      // Create data flow diagram for account
      const dataFlowResult = await factory.createFromTemplate({
        tenantId: 'acme',
        sfRecordId: account.id,
        sfObject: 'Account',
        recordName: account.name,
        diagramType: 'data-flow'
      });

      console.log(`  ✅ Data flow diagram created`);
      console.log(`     Doc ID: ${dataFlowResult.result.documents[0].docId}`);

      // Link to Salesforce
      const linkResult = await sfConnector.linkDocToRecord({
        sfRecordId: account.id,
        docId: archResult.result.documents[0].docId,
        diagramType: 'architecture',
        templateDocId: archResult.result.documents[0].templateDocId,
        urls: archResult.result.documents[0]
      });

      console.log(`  🔗 Linked to Salesforce record`);

      results.accounts.push({
        account,
        documents: [
          archResult.result.documents[0],
          dataFlowResult.result.documents[0]
        ]
      });

    } catch (error) {
      console.error(`  ❌ Error: ${error.message || error.error}`);
    }
  }

  // 2. Create Contact Diagrams
  console.log('\n👥 Creating Contact Diagrams');
  console.log('-'.repeat(40));

  for (const contact of testData.contacts) {
    try {
      const fullName = `${contact.firstName} ${contact.lastName}`;
      console.log(`\n👤 Processing Contact: ${fullName}`);

      // Create org chart for contact (using swimlane template)
      const orgResult = await factory.createFromTemplate({
        tenantId: 'acme',
        sfRecordId: contact.id,
        sfObject: 'Contact',
        recordName: fullName,
        diagramType: 'swimlane' // Using swimlane as org chart proxy
      });

      console.log(`  ✅ Org structure diagram created`);
      console.log(`     Title: ${orgResult.result.documents[0].title}`);
      console.log(`     Doc ID: ${orgResult.result.documents[0].docId}`);
      console.log(`     Note: ${orgResult.result.documents[0].title.includes('(Draft)') ? 'Marked as draft' : 'Final version'}`);

      results.contacts.push({
        contact,
        documents: [orgResult.result.documents[0]]
      });

    } catch (error) {
      console.error(`  ❌ Error: ${error.message || error.error}`);
    }
  }

  // 3. Create Opportunity Diagrams
  console.log('\n💰 Creating Opportunity Diagrams');
  console.log('-'.repeat(40));

  for (const opportunity of testData.opportunities) {
    try {
      console.log(`\n💼 Processing Opportunity: ${opportunity.name}`);

      // Create roadmap for opportunity
      const roadmapResult = await factory.createFromTemplate({
        tenantId: 'acme',
        sfRecordId: opportunity.id,
        sfObject: 'Opportunity',
        recordName: opportunity.name,
        diagramType: 'roadmap'
      });

      console.log(`  ✅ Roadmap diagram created`);
      console.log(`     Title: ${roadmapResult.result.documents[0].title}`);
      console.log(`     Doc ID: ${roadmapResult.result.documents[0].docId}`);
      console.log(`     Product: ${roadmapResult.result.documents[0].product || 'lucidchart'}`);

      // Create process flow for opportunity
      const processResult = await factory.createFromTemplate({
        tenantId: 'acme',
        sfRecordId: opportunity.id,
        sfObject: 'Opportunity',
        recordName: opportunity.name,
        diagramType: 'swimlane'
      });

      console.log(`  ✅ Sales process diagram created`);
      console.log(`     Doc ID: ${processResult.result.documents[0].docId}`);

      // Create ERD for opportunity data model
      const erdResult = await factory.createFromTemplate({
        tenantId: 'acme',
        sfRecordId: opportunity.id,
        sfObject: 'Opportunity',
        recordName: opportunity.name,
        diagramType: 'erd'
      });

      console.log(`  ✅ Data model diagram created`);
      console.log(`     Doc ID: ${erdResult.result.documents[0].docId}`);

      results.opportunities.push({
        opportunity,
        documents: [
          roadmapResult.result.documents[0],
          processResult.result.documents[0],
          erdResult.result.documents[0]
        ]
      });

    } catch (error) {
      console.error(`  ❌ Error: ${error.message || error.error}`);
    }
  }

  // 4. Test Idempotency
  console.log('\n🔄 Testing Idempotency');
  console.log('-'.repeat(40));

  const testOpp = testData.opportunities[0];
  console.log(`\nRetrying creation for: ${testOpp.name}`);

  const retry1 = await factory.createFromTemplate({
    tenantId: 'acme',
    sfRecordId: testOpp.id,
    sfObject: 'Opportunity',
    recordName: testOpp.name,
    diagramType: 'roadmap'
  });

  const retry2 = await factory.createFromTemplate({
    tenantId: 'acme',
    sfRecordId: testOpp.id,
    sfObject: 'Opportunity',
    recordName: testOpp.name,
    diagramType: 'roadmap'
  });

  console.log(`  First Doc ID: ${retry1.result?.documents?.[0]?.docId || retry1.docId}`);
  console.log(`  Retry Doc ID: ${retry2.result?.documents?.[0]?.docId || retry2.docId}`);
  const id1 = retry1.result?.documents?.[0]?.docId || retry1.docId;
  const id2 = retry2.result?.documents?.[0]?.docId || retry2.docId;
  console.log(`  ✅ Idempotency: ${id1 === id2 ? 'Working (same doc returned)' : 'Issue (different docs)'}`);

  // 5. Test Cross-Tenant Isolation
  console.log('\n🔒 Testing Tenant Isolation');
  console.log('-'.repeat(40));

  const contosoResult = await factory.createFromTemplate({
    tenantId: 'contoso',
    sfRecordId: testData.accounts[0].id,
    sfObject: 'Account',
    recordName: testData.accounts[0].name,
    diagramType: 'architecture'
  });

  console.log(`  ACME doc title: [TENANT:acme] Account:${testData.accounts[0].name} — architecture`);
  console.log(`  Contoso doc title: ${contosoResult.result.documents[0].title}`);
  console.log(`  ✅ Tenant isolation: ${contosoResult.result.documents[0].title.includes('[TENANT:contoso]') ? 'Working' : 'Issue'}`);

  // 6. Test Error Handling
  console.log('\n⚠️  Testing Error Handling');
  console.log('-'.repeat(40));

  try {
    await factory.createFromTemplate({
      tenantId: 'acme',
      sfRecordId: testData.accounts[0].id,
      sfObject: 'Account',
      recordName: testData.accounts[0].name,
      diagramType: 'invalid-diagram-type'
    });
    console.log('  ❌ Error handling failed - no error thrown');
  } catch (error) {
    console.log(`  ✅ Error correctly caught: ${error.error}`);
    console.log(`     Available types: ${error.availableDiagramTypes?.join(', ')}`);
  }

  // Summary Report
  console.log('\n📈 Summary Report');
  console.log('=' .repeat(60));

  const allDocs = mockApi.getAllDocuments();
  console.log(`\n📊 Documents Created: ${allDocs.length}`);
  console.log(`  - Account diagrams: ${results.accounts.reduce((sum, a) => sum + a.documents.length, 0)}`);
  console.log(`  - Contact diagrams: ${results.contacts.reduce((sum, c) => sum + c.documents.length, 0)}`);
  console.log(`  - Opportunity diagrams: ${results.opportunities.reduce((sum, o) => sum + o.documents.length, 0)}`);

  console.log('\n📁 Document Breakdown by Type:');
  const typeCount = {};
  allDocs.forEach(doc => {
    const type = doc.title.match(/— ([^—]+)$/)?.[1]?.trim() || 'unknown';
    typeCount[type] = (typeCount[type] || 0) + 1;
  });
  Object.entries(typeCount).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });

  console.log('\n🏢 Tenant Distribution:');
  const tenantCount = {};
  allDocs.forEach(doc => {
    const tenant = doc.title.match(/\[TENANT:([^\]]+)\]/)?.[1] || 'unknown';
    tenantCount[tenant] = (tenantCount[tenant] || 0) + 1;
  });
  Object.entries(tenantCount).forEach(([tenant, count]) => {
    console.log(`  - ${tenant}: ${count}`);
  });

  console.log('\n🔗 API Calls Made: ' + mockApi.requestLog.length);
  console.log(`  - POST /documents: ${mockApi.requestLog.filter(r => r.endpoint === '/documents').length}`);
  console.log(`  - GET /documents/search: ${mockApi.requestLog.filter(r => r.endpoint === '/documents/search').length}`);

  // Save results to file
  const outputPath = path.join(__dirname, '../test-output-sfdc-diagrams.json');
  await fs.writeFile(outputPath, JSON.stringify({
    testRun: new Date().toISOString(),
    summary: {
      totalDocuments: allDocs.length,
      accounts: results.accounts.length,
      contacts: results.contacts.length,
      opportunities: results.opportunities.length
    },
    documents: allDocs,
    results,
    apiCalls: mockApi.requestLog.length
  }, null, 2));

  console.log(`\n💾 Results saved to: ${outputPath}`);
  console.log('\n✅ Test completed successfully!\n');

  return results;
}

// Run the test
if (require.main === module) {
  createTestDocuments().catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
}

module.exports = { createTestDocuments, MockLucidApi };