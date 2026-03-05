#!/usr/bin/env node

/**
 * Test Mermaid to Lucid JSON Conversion
 *
 * Validates that Mermaid diagrams convert correctly to Lucid Standard Import JSON
 */

const { convertMermaidToLucid } = require('./lib/mermaid-lucid/mermaid-to-lucid-json-converter');
const fs = require('fs').promises;
const path = require('path');

// Test flowchart
const testFlowchart = `
flowchart TB
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[End]
  C --> D
`;

// Test ERD
const testERD = `
erDiagram
  Account {
    string Id PK
    string Name
    string Industry
  }
  Contact {
    string Id PK
    string AccountId FK
    string FirstName
    string LastName
  }
  Account ||--o{ Contact : "has contacts"
`;

// Test sequence
const testSequence = `
sequenceDiagram
  autonumber
  participant User
  participant App
  participant API

  User->>App: Login
  App->>API: Authenticate
  API->>App: Token
  App->>User: Success
`;

// Test state
const testState = `
stateDiagram-v2
  direction LR
  [*] --> New
  New --> InProgress
  InProgress --> Review
  Review --> Done
  Review --> InProgress
  Done --> [*]
`;

async function runTests() {
  console.log('🧪 Testing Mermaid to Lucid JSON Conversion\n');

  const outputDir = path.join(__dirname, '../../../test-output/mermaid-lucid');
  await fs.mkdir(outputDir, { recursive: true });

  const tests = [
    { name: 'Flowchart', code: testFlowchart, type: 'flowchart' },
    { name: 'ERD', code: testERD, type: 'erd' },
    { name: 'Sequence', code: testSequence, type: 'sequence' },
    { name: 'State', code: testState, type: 'state' }
  ];

  for (const test of tests) {
    console.log(`\n📊 Testing ${test.name}...`);

    try {
      const lucidJSON = convertMermaidToLucid(test.code, {
        title: `Test ${test.name}`,
        pageTitle: `${test.name} Diagram`,
        diagramType: test.type
      });

      // Validate structure
      if (!lucidJSON.version) throw new Error('Missing version');
      if (!lucidJSON.pages || lucidJSON.pages.length === 0) throw new Error('Missing pages');
      if (!lucidJSON._metadata) throw new Error('Missing metadata');

      const page = lucidJSON.pages[0];
      if (!page.shapes) throw new Error('Missing shapes');
      if (!page.lines && test.type !== 'erd') throw new Error('Missing lines');

      console.log(`  ✅ Version: ${lucidJSON.version}`);
      console.log(`  ✅ Shapes: ${page.shapes.length}`);
      console.log(`  ✅ Lines: ${page.lines ? page.lines.length : 0}`);
      console.log(`  ✅ Metadata: ${JSON.stringify(lucidJSON._metadata.diagramType)}`);

      // Save to file
      const outputFile = path.join(outputDir, `${test.type}-test.json`);
      await fs.writeFile(outputFile, JSON.stringify(lucidJSON, null, 2));
      console.log(`  💾 Saved to: ${outputFile}`);

      // Show sample shape
      if (page.shapes.length > 0) {
        const sampleShape = page.shapes[0];
        console.log(`  📦 Sample Shape: ${sampleShape.id} (${sampleShape.type})`);
        console.log(`     Position: (${sampleShape.boundingBox.x}, ${sampleShape.boundingBox.y})`);
      }

      console.log(`  ✅ ${test.name} conversion PASSED`);

    } catch (error) {
      console.error(`  ❌ ${test.name} conversion FAILED:`, error.message);
      console.error(error.stack);
    }
  }

  console.log('\n✅ All tests completed!\n');
  console.log(`📁 Output directory: ${outputDir}`);
}

runTests().catch(console.error);
