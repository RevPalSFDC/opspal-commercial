#!/usr/bin/env node

/**
 * Lucid Integration Test Suite
 * Tests the complete Salesforce to Lucid diagram creation pipeline
 */

const path = require('path');
const fs = require('fs').promises;

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env.lucid') });

const LucidUploadClient = require('./lib/lucid-upload-client');
const LucidStandardImportGeneratorV2 = require('./lib/lucid-standard-import-generator-v2');
const SalesforceLucidMapper = require('./lib/salesforce-lucid-mapper');

async function runTests() {
  console.log('🧪 Lucid Integration Test Suite');
  console.log('=' .repeat(70));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Test 1: Validate schemas
  console.log('\n📋 Test 1: Validate Schema Library');
  try {
    const schemasPath = path.join(__dirname, '../config/lucid-validated-schemas.json');
    const schemas = JSON.parse(await fs.readFile(schemasPath, 'utf8'));

    if (schemas.schemas && Object.keys(schemas.schemas).length > 0) {
      console.log(`   ✅ Found ${Object.keys(schemas.schemas).length} validated schemas`);
      results.passed++;
    } else {
      throw new Error('No schemas found');
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    results.failed++;
  }

  // Test 2: Generate minimal document
  console.log('\n📋 Test 2: Generate Minimal Document');
  try {
    const generator = new LucidStandardImportGeneratorV2();
    const doc = generator.generateDiagram('minimal', {});

    if (doc.version === 1 && doc.type === 'lucidchart') {
      console.log('   ✅ Generated valid minimal document');
      results.passed++;
    } else {
      throw new Error('Invalid document format');
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    results.failed++;
  }

  // Test 3: Validate document structure
  console.log('\n📋 Test 3: Validate Document Structure');
  try {
    const client = new LucidUploadClient();
    const testDoc = {
      version: 1,
      type: 'lucidchart',
      pages: [{
        id: 'page1',
        title: 'Test',
        shapes: [{
          id: 'shape1',
          type: 'rectangle',
          boundingBox: { x: 0, y: 0, w: 100, h: 50 },
          text: 'Test'
        }]
      }]
    };

    const errors = client.validateDocument(testDoc);
    if (errors.length === 0) {
      console.log('   ✅ Document validation passed');
      results.passed++;
    } else {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    results.failed++;
  }

  // Test 4: Create ZIP file
  console.log('\n📋 Test 4: Create ZIP File');
  try {
    const client = new LucidUploadClient();
    const testDoc = {
      version: 1,
      type: 'lucidchart',
      pages: [{
        id: 'page1',
        shapes: [{
          id: 's1',
          type: 'rectangle',
          boundingBox: { x: 0, y: 0, w: 100, h: 50 },
          text: 'Test'
        }]
      }]
    };

    const zipPath = `require('os').tmpdir())}.lucid`;
    await client.createZipFile(testDoc, zipPath);

    const stats = await fs.stat(zipPath);
    if (stats.size > 0) {
      console.log(`   ✅ Created ZIP file (${stats.size} bytes)`);
      results.passed++;

      // Clean up
      await fs.unlink(zipPath).catch(() => {});
    } else {
      throw new Error('ZIP file is empty');
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    results.failed++;
  }

  // Test 5: Generate architecture diagram
  console.log('\n📋 Test 5: Generate Architecture Diagram');
  try {
    const generator = new LucidStandardImportGeneratorV2();
    const doc = generator.generateArchitectureDiagram({
      objects: {
        apexClasses: 50,
        flows: 20,
        standardObjects: 10,
        customObjects: 25
      }
    });

    if (doc.pages[0].shapes.length > 5) {
      console.log(`   ✅ Generated architecture with ${doc.pages[0].shapes.length} shapes`);
      results.passed++;
    } else {
      throw new Error('Not enough shapes generated');
    }
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    results.failed++;
  }

  // Test 6: Upload to Lucid (if token is available)
  console.log('\n📋 Test 6: Upload to Lucid API');
  if (process.env.LUCID_API_TOKEN) {
    try {
      const client = new LucidUploadClient({ debug: false });
      const testDoc = {
        version: 1,
        type: 'lucidchart',
        pages: [{
          id: 'page1',
          title: 'Integration Test',
          shapes: [{
            id: 'test1',
            type: 'rectangle',
            boundingBox: { x: 100, y: 100, w: 200, h: 100 },
            text: 'Integration Test Success'
          }]
        }]
      };

      const result = await client.createDiagram(
        testDoc,
        `Integration Test - ${new Date().toISOString()}`,
        { force: true }
      );

      if (result.success && result.documentId) {
        console.log(`   ✅ Created document: ${result.documentId}`);
        console.log(`      View at: ${result.editUrl}`);
        results.passed++;
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      results.failed++;
    }
  } else {
    console.log('   ⚠️  Skipped - No API token configured');
  }

  // Test 7: Salesforce data mapper (if org connected)
  console.log('\n📋 Test 7: Salesforce Data Mapper');
  if (process.env.SF_TARGET_ORG) {
    try {
      const mapper = new SalesforceLucidMapper({ debug: false });
      const metadata = await mapper.getOrgMetadata();

      if (metadata && metadata.objects) {
        console.log('   ✅ Retrieved Salesforce metadata');
        console.log(`      Apex Classes: ${metadata.objects.apexClasses || 0}`);
        console.log(`      Flows: ${metadata.objects.flows || 0}`);
        results.passed++;
      } else {
        throw new Error('No metadata retrieved');
      }
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      results.failed++;
    }
  } else {
    console.log('   ⚠️  Skipped - No Salesforce org connected');
  }

  // Summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   📈 Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);

  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! The integration is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }

  return results;
}

// Run tests if executed directly
if (require.main === module) {
  runTests()
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { runTests };