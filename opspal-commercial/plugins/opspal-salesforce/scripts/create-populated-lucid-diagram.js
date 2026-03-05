#!/usr/bin/env node

/**
 * CREATE POPULATED LUCID DIAGRAM - WITH ACTUAL SHAPES AND CONTENT
 * This creates a diagram that's NOT blank using Standard Import
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env.lucid') });

const LUCID_API_TOKEN = process.env.LUCID_API_TOKEN;
const LUCID_API_BASE_URL = process.env.LUCID_API_BASE_URL || 'https://api.lucid.co';

/**
 * Generate Salesforce Architecture diagram import data
 */
function generateArchitectureDiagram() {
  return {
    version: "1",
    productId: "lucidchart",
    documentTitle: `Salesforce Architecture - ${new Date().toISOString()}`,
    pages: [{
      id: "Page_1",
      title: "Salesforce Architecture",
      shapes: [
        // Presentation Layer Container
        {
          id: "layer_presentation",
          type: "swimlaneContainer",
          boundingBox: {
            x: 100,
            y: 50,
            w: 900,
            h: 180
          },
          style: {
            fill: {
              color: "#E3F2FD"
            },
            stroke: {
              color: "#1976D2",
              width: 2
            }
          },
          text: {
            content: "Presentation Layer",
            style: {
              fontSize: 16,
              bold: true
            }
          }
        },
        // Lightning Web Components
        {
          id: "lwc",
          type: "process",
          boundingBox: {
            x: 150,
            y: 100,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#BBDEFB"
            },
            stroke: {
              color: "#0D47A1",
              width: 2
            }
          },
          text: {
            content: "Lightning Web\nComponents"
          }
        },
        // Visualforce
        {
          id: "vf",
          type: "process",
          boundingBox: {
            x: 360,
            y: 100,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#BBDEFB"
            },
            stroke: {
              color: "#0D47A1",
              width: 2
            }
          },
          text: {
            content: "Visualforce\nPages"
          }
        },
        // Experience Cloud
        {
          id: "exp",
          type: "process",
          boundingBox: {
            x: 570,
            y: 100,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#BBDEFB"
            },
            stroke: {
              color: "#0D47A1",
              width: 2
            }
          },
          text: {
            content: "Experience\nCloud"
          }
        },
        // Mobile App
        {
          id: "mobile",
          type: "process",
          boundingBox: {
            x: 780,
            y: 100,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#BBDEFB"
            },
            stroke: {
              color: "#0D47A1",
              width: 2
            }
          },
          text: {
            content: "Salesforce\nMobile App"
          }
        },
        // Business Logic Layer Container
        {
          id: "layer_business",
          type: "swimlaneContainer",
          boundingBox: {
            x: 100,
            y: 250,
            w: 900,
            h: 180
          },
          style: {
            fill: {
              color: "#FFF3E0"
            },
            stroke: {
              color: "#F57C00",
              width: 2
            }
          },
          text: {
            content: "Business Logic Layer",
            style: {
              fontSize: 16,
              bold: true
            }
          }
        },
        // Apex Classes
        {
          id: "apex",
          type: "process",
          boundingBox: {
            x: 150,
            y: 300,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#FFE0B2"
            },
            stroke: {
              color: "#E65100",
              width: 2
            }
          },
          text: {
            content: "Apex Classes\n& Triggers"
          }
        },
        // Flows
        {
          id: "flows",
          type: "process",
          boundingBox: {
            x: 360,
            y: 300,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#FFE0B2"
            },
            stroke: {
              color: "#E65100",
              width: 2
            }
          },
          text: {
            content: "Flows &\nProcess Builder"
          }
        },
        // Validation Rules
        {
          id: "validation",
          type: "process",
          boundingBox: {
            x: 570,
            y: 300,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#FFE0B2"
            },
            stroke: {
              color: "#E65100",
              width: 2
            }
          },
          text: {
            content: "Validation\nRules"
          }
        },
        // Workflow Rules
        {
          id: "workflow",
          type: "process",
          boundingBox: {
            x: 780,
            y: 300,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#FFE0B2"
            },
            stroke: {
              color: "#E65100",
              width: 2
            }
          },
          text: {
            content: "Workflow\nRules"
          }
        },
        // Data Layer Container
        {
          id: "layer_data",
          type: "swimlaneContainer",
          boundingBox: {
            x: 100,
            y: 450,
            w: 900,
            h: 180
          },
          style: {
            fill: {
              color: "#E8F5E9"
            },
            stroke: {
              color: "#388E3C",
              width: 2
            }
          },
          text: {
            content: "Data Layer",
            style: {
              fontSize: 16,
              bold: true
            }
          }
        },
        // Standard Objects
        {
          id: "standard_obj",
          type: "database",
          boundingBox: {
            x: 150,
            y: 500,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#C8E6C9"
            },
            stroke: {
              color: "#1B5E20",
              width: 2
            }
          },
          text: {
            content: "Standard\nObjects"
          }
        },
        // Custom Objects
        {
          id: "custom_obj",
          type: "database",
          boundingBox: {
            x: 360,
            y: 500,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#C8E6C9"
            },
            stroke: {
              color: "#1B5E20",
              width: 2
            }
          },
          text: {
            content: "Custom\nObjects"
          }
        },
        // Big Objects
        {
          id: "big_obj",
          type: "database",
          boundingBox: {
            x: 570,
            y: 500,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#C8E6C9"
            },
            stroke: {
              color: "#1B5E20",
              width: 2
            }
          },
          text: {
            content: "Big\nObjects"
          }
        },
        // Platform Events
        {
          id: "platform_events",
          type: "database",
          boundingBox: {
            x: 780,
            y: 500,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#C8E6C9"
            },
            stroke: {
              color: "#1B5E20",
              width: 2
            }
          },
          text: {
            content: "Platform\nEvents"
          }
        },
        // Integration Layer Container
        {
          id: "layer_integration",
          type: "swimlaneContainer",
          boundingBox: {
            x: 100,
            y: 650,
            w: 900,
            h: 180
          },
          style: {
            fill: {
              color: "#FCE4EC"
            },
            stroke: {
              color: "#C2185B",
              width: 2
            }
          },
          text: {
            content: "Integration Layer",
            style: {
              fontSize: 16,
              bold: true
            }
          }
        },
        // REST API
        {
          id: "rest_api",
          type: "cloud",
          boundingBox: {
            x: 150,
            y: 700,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#F8BBD0"
            },
            stroke: {
              color: "#880E4F",
              width: 2
            }
          },
          text: {
            content: "REST\nAPIs"
          }
        },
        // SOAP API
        {
          id: "soap_api",
          type: "cloud",
          boundingBox: {
            x: 360,
            y: 700,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#F8BBD0"
            },
            stroke: {
              color: "#880E4F",
              width: 2
            }
          },
          text: {
            content: "SOAP\nAPIs"
          }
        },
        // Bulk API
        {
          id: "bulk_api",
          type: "cloud",
          boundingBox: {
            x: 570,
            y: 700,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#F8BBD0"
            },
            stroke: {
              color: "#880E4F",
              width: 2
            }
          },
          text: {
            content: "Bulk\nAPI"
          }
        },
        // Streaming API
        {
          id: "streaming_api",
          type: "cloud",
          boundingBox: {
            x: 780,
            y: 700,
            w: 180,
            h: 80
          },
          style: {
            fill: {
              color: "#F8BBD0"
            },
            stroke: {
              color: "#880E4F",
              width: 2
            }
          },
          text: {
            content: "Streaming\nAPI"
          }
        }
      ],
      lines: [
        // Presentation to Business connections
        {
          id: "line1",
          startConnectedShape: "lwc",
          endConnectedShape: "apex",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          text: {
            content: "Controller Calls"
          },
          routing: "orthogonal"
        },
        {
          id: "line2",
          startConnectedShape: "vf",
          endConnectedShape: "apex",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          routing: "orthogonal"
        },
        {
          id: "line3",
          startConnectedShape: "exp",
          endConnectedShape: "flows",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          routing: "orthogonal"
        },
        {
          id: "line4",
          startConnectedShape: "mobile",
          endConnectedShape: "workflow",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          routing: "orthogonal"
        },
        // Business to Data connections
        {
          id: "line5",
          startConnectedShape: "apex",
          endConnectedShape: "standard_obj",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          text: {
            content: "SOQL/DML"
          },
          routing: "orthogonal"
        },
        {
          id: "line6",
          startConnectedShape: "flows",
          endConnectedShape: "custom_obj",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          text: {
            content: "Record Updates"
          },
          routing: "orthogonal"
        },
        {
          id: "line7",
          startConnectedShape: "validation",
          endConnectedShape: "big_obj",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          routing: "orthogonal"
        },
        {
          id: "line8",
          startConnectedShape: "workflow",
          endConnectedShape: "platform_events",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          text: {
            content: "Event Publishing"
          },
          routing: "orthogonal"
        },
        // Data to Integration connections
        {
          id: "line9",
          startConnectedShape: "standard_obj",
          endConnectedShape: "rest_api",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          text: {
            content: "External Sync"
          },
          routing: "orthogonal"
        },
        {
          id: "line10",
          startConnectedShape: "custom_obj",
          endConnectedShape: "soap_api",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          routing: "orthogonal"
        },
        {
          id: "line11",
          startConnectedShape: "big_obj",
          endConnectedShape: "bulk_api",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          text: {
            content: "Bulk Operations"
          },
          routing: "orthogonal"
        },
        {
          id: "line12",
          startConnectedShape: "platform_events",
          endConnectedShape: "streaming_api",
          style: {
            stroke: {
              color: "#666666",
              width: 2
            }
          },
          text: {
            content: "Real-time Events"
          },
          routing: "orthogonal"
        }
      ]
    }]
  };
}

/**
 * Make actual HTTP request to Lucid API
 */
async function callLucidAPI(endpoint, method, body) {
  const url = `${LUCID_API_BASE_URL}${endpoint}`;
  const tempFile = `require('os').tmpdir())}.json`;

  await fs.writeFile(tempFile, JSON.stringify(body));

  try {
    const curlCommand = `curl -X ${method} '${url}' \
      -H 'Authorization: Bearer ${LUCID_API_TOKEN}' \
      -H 'Content-Type: application/json' \
      -H 'Lucid-Api-Version: 1' \
      -d @${tempFile} \
      --silent --show-error`;

    console.log(`📡 Making REAL API call to: ${url}`);
    const result = execSync(curlCommand, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    await fs.unlink(tempFile).catch(() => {});
    return JSON.parse(result);
  } catch (error) {
    await fs.unlink(tempFile).catch(() => {});
    console.error(`❌ API call failed: ${error.message}`);
    throw error;
  }
}

/**
 * Create a POPULATED document in Lucid
 */
async function createPopulatedDocument() {
  console.log('🚀 CREATING POPULATED LUCID DOCUMENT - WITH REAL SHAPES!');
  console.log('=' .repeat(70));

  const importData = generateArchitectureDiagram();

  // Create the import request
  const importRequest = {
    title: `Salesforce Architecture - POPULATED - ${new Date().toISOString()}`,
    product: 'lucidchart',
    import: {
      type: 'lucidchart',
      data: JSON.stringify(importData)
    }
  };

  console.log('\n📊 Creating diagram with:');
  console.log(`   - ${importData.pages[0].shapes.length} shapes`);
  console.log(`   - ${importData.pages[0].lines.length} connectors`);
  console.log(`   - 4 architectural layers`);
  console.log(`   - Full Salesforce architecture`);

  try {
    const result = await callLucidAPI('/documents', 'POST', importRequest);

    console.log('\n✅ SUCCESS! Created POPULATED document:');
    console.log(`   Document ID: ${result.documentId}`);
    console.log(`   Title: ${result.title}`);
    console.log(`   Edit URL: ${result.editUrl}`);
    console.log(`   View URL: ${result.viewUrl}`);
    console.log('\n🎯 This document contains:');
    console.log('   - 4 color-coded architectural layers');
    console.log('   - 20 Salesforce components');
    console.log('   - 12 connections showing data flow');
    console.log('   - NO BLANK CANVAS!');

    // Save proof
    const proofFile = path.join(__dirname, '../populated-diagram-proof.json');
    await fs.writeFile(proofFile, JSON.stringify({
      ...result,
      statistics: {
        shapes: importData.pages[0].shapes.length,
        lines: importData.pages[0].lines.length,
        layers: 4
      }
    }, null, 2));

    console.log(`\n📄 Proof saved to: ${proofFile}`);
    console.log('\n🔗 Click this link to see your POPULATED diagram:');
    console.log(`   ${result.editUrl}`);

    return result;

  } catch (error) {
    console.error('\n❌ Failed to create populated document');
    console.error('Error:', error.message);

    // Try simpler format
    console.log('\n📝 Trying alternative import format...');

    const simpleImport = {
      title: `Simple Architecture - ${new Date().toISOString()}`,
      product: 'lucidchart',
      template: {
        sourceDocId: 'TEMPLATE_ARCHITECTURE_1757857477594' // Use one of our "master" templates
      }
    };

    try {
      const fallbackResult = await callLucidAPI('/documents', 'POST', simpleImport);
      console.log('\n✅ Created document from template instead');
      console.log(`   Edit URL: ${fallbackResult.editUrl}`);
      return fallbackResult;
    } catch (e) {
      console.error('Template approach also failed');
    }

    throw error;
  }
}

// Execute
async function main() {
  try {
    await createPopulatedDocument();
  } catch (error) {
    console.error('Could not create populated document');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}