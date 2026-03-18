#!/usr/bin/env node

/**
 * Create a REAL populated Lucid diagram using proper Standard Import format
 * This creates a ZIP file with document.json and uploads via multipart/form-data
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// Preflight: Lucid Standard Import requires ZIP format — tar.gz is not a valid substitute
try {
  execSync('which zip', { stdio: 'ignore' });
} catch {
  console.error('Error: "zip" binary is required for Lucid Standard Import (.lucid files are ZIP format).');
  console.error('Install: sudo apt-get install zip (Debian/Ubuntu) or brew install zip (macOS)');
  process.exit(1);
}

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env.lucid') });

const LUCID_API_TOKEN = process.env.LUCID_API_TOKEN;
const LUCID_API_BASE_URL = process.env.LUCID_API_BASE_URL || 'https://api.lucid.co';

if (!LUCID_API_TOKEN) {
  console.error('❌ LUCID_API_TOKEN not set in .env.lucid');
  process.exit(1);
}

/**
 * Create a valid Standard Import document.json
 */
function createDocumentJson() {
  return {
    "version": "1",
    "type": "lucidchart",
    "pages": [
      {
        "id": "page1",
        "title": "Salesforce Architecture",
        "shapes": [
          // Presentation Layer Container
          {
            "id": "layer_presentation",
            "type": "swimlaneContainer",
            "boundingBox": {
              "x": 50,
              "y": 50,
              "w": 900,
              "h": 150
            },
            "style": {
              "fill": {
                "color": "#E3F2FD"
              },
              "stroke": {
                "color": "#1976D2",
                "width": 2
              }
            },
            "text": "Presentation Layer"
          },
          // Lightning Web Components
          {
            "id": "lwc",
            "type": "process",
            "boundingBox": {
              "x": 100,
              "y": 100,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#BBDEFB"
              },
              "stroke": {
                "color": "#0D47A1",
                "width": 2
              }
            },
            "text": "Lightning Web\nComponents"
          },
          // Experience Cloud
          {
            "id": "experience",
            "type": "process",
            "boundingBox": {
              "x": 320,
              "y": 100,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#BBDEFB"
              },
              "stroke": {
                "color": "#0D47A1",
                "width": 2
              }
            },
            "text": "Experience Cloud\nPortals"
          },
          // Mobile Apps
          {
            "id": "mobile",
            "type": "process",
            "boundingBox": {
              "x": 540,
              "y": 100,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#BBDEFB"
              },
              "stroke": {
                "color": "#0D47A1",
                "width": 2
              }
            },
            "text": "Salesforce\nMobile App"
          },
          // Business Logic Layer Container
          {
            "id": "layer_business",
            "type": "swimlaneContainer",
            "boundingBox": {
              "x": 50,
              "y": 220,
              "w": 900,
              "h": 150
            },
            "style": {
              "fill": {
                "color": "#FFF3E0"
              },
              "stroke": {
                "color": "#F57C00",
                "width": 2
              }
            },
            "text": "Business Logic Layer"
          },
          // Apex Classes
          {
            "id": "apex",
            "type": "process",
            "boundingBox": {
              "x": 100,
              "y": 270,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#FFE0B2"
              },
              "stroke": {
                "color": "#E65100",
                "width": 2
              }
            },
            "text": "Apex Classes\n& Triggers"
          },
          // Flows
          {
            "id": "flows",
            "type": "process",
            "boundingBox": {
              "x": 320,
              "y": 270,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#FFE0B2"
              },
              "stroke": {
                "color": "#E65100",
                "width": 2
              }
            },
            "text": "Flows &\nProcess Builder"
          },
          // Validation Rules
          {
            "id": "validation",
            "type": "process",
            "boundingBox": {
              "x": 540,
              "y": 270,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#FFE0B2"
              },
              "stroke": {
                "color": "#E65100",
                "width": 2
              }
            },
            "text": "Validation Rules\n& Formulas"
          },
          // Data Layer Container
          {
            "id": "layer_data",
            "type": "swimlaneContainer",
            "boundingBox": {
              "x": 50,
              "y": 390,
              "w": 900,
              "h": 150
            },
            "style": {
              "fill": {
                "color": "#E8F5E9"
              },
              "stroke": {
                "color": "#388E3C",
                "width": 2
              }
            },
            "text": "Data Layer"
          },
          // Standard Objects
          {
            "id": "standard_objects",
            "type": "database",
            "boundingBox": {
              "x": 100,
              "y": 440,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#C8E6C9"
              },
              "stroke": {
                "color": "#1B5E20",
                "width": 2
              }
            },
            "text": "Standard Objects\n(Account, Contact)"
          },
          // Custom Objects
          {
            "id": "custom_objects",
            "type": "database",
            "boundingBox": {
              "x": 320,
              "y": 440,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#C8E6C9"
              },
              "stroke": {
                "color": "#1B5E20",
                "width": 2
              }
            },
            "text": "Custom Objects\n(Invoice__c, etc)"
          },
          // External Objects
          {
            "id": "external_objects",
            "type": "database",
            "boundingBox": {
              "x": 540,
              "y": 440,
              "w": 180,
              "h": 80
            },
            "style": {
              "fill": {
                "color": "#C8E6C9"
              },
              "stroke": {
                "color": "#1B5E20",
                "width": 2
              }
            },
            "text": "External Objects\n(via Connect)"
          }
        ],
        "lines": [
          // Presentation to Business connections
          {
            "id": "line1",
            "endpoint1": {
              "shapeId": "lwc",
              "position": { "x": 0.5, "y": 1 }
            },
            "endpoint2": {
              "shapeId": "apex",
              "position": { "x": 0.5, "y": 0 }
            },
            "style": {
              "stroke": {
                "color": "#666666",
                "width": 2
              },
              "endArrow": "arrow"
            },
            "text": "API Calls"
          },
          {
            "id": "line2",
            "endpoint1": {
              "shapeId": "experience",
              "position": { "x": 0.5, "y": 1 }
            },
            "endpoint2": {
              "shapeId": "flows",
              "position": { "x": 0.5, "y": 0 }
            },
            "style": {
              "stroke": {
                "color": "#666666",
                "width": 2
              },
              "endArrow": "arrow"
            },
            "text": "REST API"
          },
          // Business to Data connections
          {
            "id": "line3",
            "endpoint1": {
              "shapeId": "apex",
              "position": { "x": 0.5, "y": 1 }
            },
            "endpoint2": {
              "shapeId": "standard_objects",
              "position": { "x": 0.5, "y": 0 }
            },
            "style": {
              "stroke": {
                "color": "#666666",
                "width": 2
              },
              "endArrow": "arrow"
            },
            "text": "SOQL/DML"
          },
          {
            "id": "line4",
            "endpoint1": {
              "shapeId": "flows",
              "position": { "x": 0.5, "y": 1 }
            },
            "endpoint2": {
              "shapeId": "custom_objects",
              "position": { "x": 0.5, "y": 0 }
            },
            "style": {
              "stroke": {
                "color": "#666666",
                "width": 2
              },
              "endArrow": "arrow"
            },
            "text": "Record Access"
          },
          {
            "id": "line5",
            "endpoint1": {
              "shapeId": "validation",
              "position": { "x": 0.5, "y": 1 }
            },
            "endpoint2": {
              "shapeId": "external_objects",
              "position": { "x": 0.5, "y": 0 }
            },
            "style": {
              "stroke": {
                "color": "#666666",
                "width": 2
              },
              "endArrow": "arrow"
            },
            "text": "Data Sync"
          }
        ]
      }
    ]
  };
}

async function main() {
  console.log('🚀 Creating REAL Lucid diagram with proper Standard Import');
  console.log('=' .repeat(70));

  try {
    // Step 1: Create document.json
    console.log('\n📝 Creating document.json...');
    const documentJson = createDocumentJson();
    const tempDir = `require('os').tmpdir())}`;
    await fs.mkdir(tempDir, { recursive: true });

    const documentPath = path.join(tempDir, 'document.json');
    await fs.writeFile(documentPath, JSON.stringify(documentJson, null, 2));
    console.log('   ✓ Created document.json with 12 shapes and 5 connectors');

    // Step 2: Create ZIP file
    console.log('\n📦 Creating .lucid ZIP file...');
    const zipPath = path.join(tempDir, 'import.lucid');
    execSync(`cd ${tempDir} && zip -q import.lucid document.json`);
    console.log(`   ✓ Created import.lucid (${(await fs.stat(zipPath)).size} bytes)`);

    // Step 3: Upload via multipart/form-data
    console.log('\n📤 Uploading to Lucid API...');
    const curlCommand = `curl -X POST '${LUCID_API_BASE_URL}/documents' \
      -H 'Authorization: Bearer ${LUCID_API_TOKEN}' \
      -H 'Lucid-Api-Version: 1' \
      -F 'file=@${zipPath};type=x-application/vnd.lucid.standardImport' \
      -F 'product=lucidchart' \
      -F 'title=Salesforce Architecture - REAL SHAPES - ${new Date().toISOString()}' \
      --silent --show-error`;

    const result = execSync(curlCommand, { encoding: 'utf8' });
    const response = JSON.parse(result);

    // Step 4: Display results
    console.log('\n✅ SUCCESS! Created populated document:');
    console.log(`   Document ID: ${response.documentId}`);
    console.log(`   Title: ${response.title}`);
    console.log(`   Edit URL: ${response.editUrl}`);
    console.log(`   View URL: ${response.viewUrl}`);

    console.log('\n📊 Document contains:');
    console.log('   • 3 architectural layers (swimlanes)');
    console.log('   • 9 Salesforce components');
    console.log('   • 5 data flow connectors');
    console.log('   • Full color-coded architecture');

    // Save proof
    const proofPath = path.join(__dirname, '../lucid-populated-proof.json');
    await fs.writeFile(proofPath, JSON.stringify(response, null, 2));
    console.log(`\n📄 Proof saved to: ${proofPath}`);

    console.log('\n🔗 Open this link to see your POPULATED diagram:');
    console.log(`   ${response.editUrl}`);

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stdout) {
      try {
        const errorData = JSON.parse(error.stdout);
        console.error('API Error:', errorData);
      } catch (e) {
        console.error('Raw error:', error.stdout);
      }
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}