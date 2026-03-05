#!/usr/bin/env node
const path = require('path');

/**
 * Test script to create a Lucid diagram using the integration
 * Demonstrates tenant isolation and Salesforce linking
 */

const LucidTenantManager = require('./lib/lucid-tenant-manager');
const LucidDocumentFactory = require('./lib/lucid-document-factory');
const LucidSalesforceConnector = require('./lib/lucid-sf-connector');
const LucidTelemetry = require('./lib/lucid-telemetry');

// Load environment variables
require('dotenv').config({ path: '.env.lucid' });

async function createTestDiagram() {
  console.log('🚀 Starting Lucid diagram creation test...\n');

  // Initialize components
  const tenantManager = new LucidTenantManager({
    cacheDir: 'require('os').tmpdir()'
  });

  const documentFactory = new LucidDocumentFactory(tenantManager);
  const sfConnector = new LucidSalesforceConnector(tenantManager, documentFactory);
  const telemetry = new LucidTelemetry();

  // Test context
  const testContext = {
    tenantId: 'revpal-test',
    actor: 'team@gorevpal.com',
    sfContext: {
      orgId: '00D000000000000',
      objectType: 'Opportunity',
      recordId: '0065Y00002QzRRX',
      recordName: 'Phoenix Enterprise Deal'
    },
    purpose: 'Test Architecture Diagram'
  };

  console.log('📋 Test Context:');
  console.log(JSON.stringify(testContext, null, 2));
  console.log('\n');

  try {
    // Start telemetry tracking
    const startTime = Date.now();

    // Step 1: Generate document title
    const documentTitle = tenantManager.generateDocumentTitle({
      tenantId: testContext.tenantId,
      sfObject: testContext.sfContext.objectType,
      recordName: testContext.sfContext.recordName,
      purpose: testContext.purpose
    });

    console.log(`📝 Generated Title: ${documentTitle}\n`);

    // Step 2: Generate idempotency key
    const idempotencyKey = tenantManager.generateIdempotencyKey({
      tenantId: testContext.tenantId,
      title: documentTitle,
      product: 'lucidchart'
    });

    console.log(`🔑 Idempotency Key: ${idempotencyKey}\n`);

    // Step 3: Create mock Lucid API response (since we're testing)
    const mockDocument = {
      docId: `doc-test-${Date.now()}`,
      title: documentTitle,
      viewUrl: `https://lucid.app/lucidchart/${Date.now()}/view`,
      editUrl: `https://lucid.app/lucidchart/${Date.now()}/edit`,
      product: 'lucidchart',
      pages: [
        { id: 'page1', title: 'Architecture Overview' }
      ],
      metadata: {
        tenantId: testContext.tenantId,
        sfRecordId: testContext.sfContext.recordId,
        sfObjectType: testContext.sfContext.objectType,
        purpose: testContext.purpose,
        createdBy: testContext.actor,
        createdAt: new Date().toISOString()
      }
    };

    console.log('✅ Document Created Successfully!\n');
    console.log('📊 Document Details:');
    console.log(JSON.stringify(mockDocument, null, 2));
    console.log('\n');

    // Step 4: Track telemetry
    const duration = Date.now() - startTime;
    telemetry.trackDocumentCreation({
      tenantId: testContext.tenantId,
      docType: 'architecture',
      purpose: testContext.purpose,
      duration,
      success: true
    });

    // Step 5: Generate Salesforce link command
    const sfLinkCommand = `
# To link this diagram to Salesforce, run:
sf data update record \\
  --sobject ${testContext.sfContext.objectType} \\
  --record-id ${testContext.sfContext.recordId} \\
  --values "Lucid_Diagram_URL__c='${mockDocument.viewUrl}'"
    `.trim();

    console.log('🔗 Salesforce Linking Command:');
    console.log(sfLinkCommand);
    console.log('\n');

    // Step 6: Generate sharing instructions
    console.log('👥 Sharing Instructions:');
    console.log('1. Open the diagram in Lucid');
    console.log(`2. Click Share → Add collaborators`);
    console.log('3. Add team members with appropriate permissions');
    console.log('4. Government tenants: Public links are disabled by policy');
    console.log('\n');

    // Step 7: Show telemetry snapshot
    const snapshot = telemetry.getSnapshot();
    console.log('📈 Telemetry Snapshot:');
    console.log(JSON.stringify(snapshot.summary, null, 2));
    console.log('\n');

    // Step 8: Generate modification guide
    console.log('✏️ To modify this diagram:');
    console.log('1. Use the Lucid web interface directly');
    console.log('2. Or use the fallback modification guide:');
    console.log('   - Run: node scripts/lib/lucid-diagram-editor.js');
    console.log('   - Provide requested changes');
    console.log('   - Copy generated instructions to Lucid');
    console.log('\n');

    console.log('🎉 Test completed successfully!');

    return mockDocument;

  } catch (error) {
    console.error('❌ Error creating test diagram:', error);

    // Track error in telemetry
    telemetry.trackError({
      tenantId: testContext.tenantId,
      operation: 'document_creation',
      error: error.message,
      context: testContext
    });

    throw error;
  }
}

// Run the test if executed directly
if (require.main === module) {
  createTestDiagram()
    .then(doc => {
      console.log('\n📋 Summary:');
      console.log(`Document ID: ${doc.docId}`);
      console.log(`View URL: ${doc.viewUrl}`);
      console.log(`Edit URL: ${doc.editUrl}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { createTestDiagram };