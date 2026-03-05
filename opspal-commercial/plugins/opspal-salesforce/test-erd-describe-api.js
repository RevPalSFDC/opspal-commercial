#!/usr/bin/env node
/**
 * Quick test of ERD Generator Describe API Enhancement
 *
 * Tests that the Describe API can successfully retrieve field metadata
 * and discover relationships between CPQ objects.
 */

const CPQERDGenerator = require('./scripts/lib/cpq-erd-generator');
const path = require('path');

async function testDescribeAPI() {
  console.log('🧪 Testing ERD Generator - Describe API Enhancement\n');

  const orgAlias = 'gamma-corp';

  try {
    console.log('📋 Configuration:');
    console.log(`   Org: ${orgAlias}`);
    console.log(`   Method: Describe API (sf sobject describe)\n`);

    const generator = new CPQERDGenerator(orgAlias, {
      verbose: true,
      detailLevel: 'high-level'
    });

    // Test 1: Describe a single object
    console.log('🔍 Test 1: Describing SBQQ__Quote__c...');
    const quoteFields = await generator._getObjectFieldsViaDescribe('SBQQ__Quote__c');
    console.log(`   ✅ Retrieved ${quoteFields.length} fields`);

    // Count relationship fields
    const relationshipFields = quoteFields.filter(f =>
      f.DataType === 'Lookup' || f.DataType === 'MasterDetail'
    );
    console.log(`   ✅ Found ${relationshipFields.length} relationship fields`);

    // Show sample relationships
    console.log('\n   Sample relationships:');
    relationshipFields.slice(0, 5).forEach(field => {
      console.log(`      - ${field.QualifiedApiName} (${field.DataType}) → ${field.ReferenceTo}`);
    });

    // Test 2: Discover CPQ objects and map relationships
    console.log('\n🔍 Test 2: Discovering all CPQ objects...');
    const startTime = Date.now();
    const objects = await generator._discoverCPQObjects();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`   ✅ Found ${objects.length} CPQ objects in ${duration}s`);

    // Test 3: Map relationships
    console.log('\n🔍 Test 3: Mapping relationships...');
    const relStartTime = Date.now();
    const relationships = await generator._mapRelationships(objects);
    const relDuration = ((Date.now() - relStartTime) / 1000).toFixed(2);

    console.log(`   ✅ Found ${relationships.length} relationships in ${relDuration}s`);

    // Show sample relationships
    if (relationships.length > 0) {
      console.log('\n   Sample relationships:');
      relationships.slice(0, 10).forEach(rel => {
        const relType = rel.type === 'MasterDetail' ? '==>' : '-->';
        console.log(`      ${rel.from} ${relType} ${rel.to} (${rel.fieldLabel})`);
      });
    }

    // Validation
    console.log('\n📊 Validation:');

    if (relationships.length === 0) {
      console.error('   ❌ FAILED: No relationships discovered (expected 50+)');
      console.error('   This means Describe API is not working correctly');
      process.exit(1);
    }

    if (relationships.length < 20) {
      console.warn(`   ⚠️  WARNING: Only ${relationships.length} relationships found (expected 50+)`);
      console.warn('   May need to adjust object filtering or check org configuration');
    } else {
      console.log(`   ✅ PASS: ${relationships.length} relationships discovered`);
    }

    // Count MasterDetail vs Lookup
    const masterDetailCount = relationships.filter(r => r.type === 'MasterDetail').length;
    const lookupCount = relationships.filter(r => r.type === 'Lookup').length;
    console.log(`   ℹ️  Relationship types: ${masterDetailCount} MasterDetail, ${lookupCount} Lookup`);

    // Success metrics
    console.log('\n✅ Describe API Enhancement - SUCCESSFUL!\n');
    console.log('📈 Metrics:');
    console.log(`   Objects: ${objects.length}`);
    console.log(`   Relationships: ${relationships.length}`);
    console.log(`   Improvement: ${relationships.length} (was 0 with FieldDefinition)`);
    console.log(`   Total Duration: ${(parseFloat(duration) + parseFloat(relDuration)).toFixed(2)}s`);

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testDescribeAPI().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
