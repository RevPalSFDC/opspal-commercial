#!/usr/bin/env node

const { RealLucidAPI } = require('./lib/lucid-real-creation');

async function createTestDiagram() {
  console.log('🚀 Creating Test Diagram');

  const lucidAPI = new RealLucidAPI();

  try {
    // Create a document
    const result = await lucidAPI.post('/documents', {
      title: '[TENANT:test] TestObject:Test Diagram — Custom',
      product: 'lucidchart',
      template: { sourceDocId: 'default-custom-template' }
    }, {
      headers: { 'Idempotency-Key': 'test-diagram-2025-09-14' }
    });

    console.log('✅ Test Diagram Created Successfully');
    console.log('📝 Document Details:', JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('❌ Error Creating Test Diagram:', error);
    throw error;
  }
}

// Run the test diagram creation
createTestDiagram().catch(console.error);