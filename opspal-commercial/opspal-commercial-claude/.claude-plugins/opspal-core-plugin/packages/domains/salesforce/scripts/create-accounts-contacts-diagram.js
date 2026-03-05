#!/usr/bin/env node

/**
 * Create a Lucid diagram showing Salesforce Accounts and Contacts
 * Demonstrates the relationship between these core objects
 */

const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '../.env.lucid') });

const LUCID_API_TOKEN = process.env.LUCID_API_TOKEN;
const LUCID_API_BASE_URL = process.env.LUCID_API_BASE_URL || 'https://api.lucid.co';

if (!LUCID_API_TOKEN) {
  console.error('❌ LUCID_API_TOKEN not set in .env.lucid');
  process.exit(1);
}

/**
 * Create document.json for Accounts and Contacts
 */
function createAccountsContactsDocument() {
  return {
    version: 1,
    type: "lucidchart",
    pages: [{
      id: "page1",
      title: "Salesforce Accounts & Contacts",
      shapes: [
        // Title
        {
          id: "title",
          type: "rectangle",
          boundingBox: { x: 300, y: 20, w: 400, h: 60 },
          text: "Salesforce Account-Contact Relationship"
        },

        // Account object header
        {
          id: "account_header",
          type: "rectangle",
          boundingBox: { x: 100, y: 120, w: 300, h: 50 },
          text: "ACCOUNT (Parent Object)"
        },

        // Account record 1 - Acme Corp
        {
          id: "account1",
          type: "rectangle",
          boundingBox: { x: 100, y: 180, w: 300, h: 120 },
          text: "Acme Corporation\n━━━━━━━━━━━━━━━\nType: Customer\nIndustry: Technology\nRevenue: $50M\nEmployees: 200"
        },

        // Account record 2 - Global Tech
        {
          id: "account2",
          type: "rectangle",
          boundingBox: { x: 100, y: 320, w: 300, h: 120 },
          text: "Global Tech Inc\n━━━━━━━━━━━━━━━\nType: Prospect\nIndustry: Software\nRevenue: $10M\nEmployees: 50"
        },

        // Account record 3 - Smith Enterprises
        {
          id: "account3",
          type: "rectangle",
          boundingBox: { x: 100, y: 460, w: 300, h: 120 },
          text: "Smith Enterprises\n━━━━━━━━━━━━━━━\nType: Customer\nIndustry: Manufacturing\nRevenue: $100M\nEmployees: 500"
        },

        // Contact object header
        {
          id: "contact_header",
          type: "rectangle",
          boundingBox: { x: 500, y: 120, w: 300, h: 50 },
          text: "CONTACT (Child Object)"
        },

        // Contacts for Acme Corp
        {
          id: "contact1",
          type: "rectangle",
          boundingBox: { x: 500, y: 180, w: 280, h: 80 },
          text: "John Smith\nCEO\njohn@acme.com\n(555) 123-4567"
        },

        {
          id: "contact2",
          type: "rectangle",
          boundingBox: { x: 500, y: 270, w: 280, h: 80 },
          text: "Jane Doe\nCTO\njane@acme.com\n(555) 123-4568"
        },

        // Contacts for Global Tech
        {
          id: "contact3",
          type: "rectangle",
          boundingBox: { x: 500, y: 360, w: 280, h: 80 },
          text: "Bob Johnson\nVP Sales\nbob@globaltech.com\n(555) 234-5678"
        },

        // Contacts for Smith Enterprises
        {
          id: "contact4",
          type: "rectangle",
          boundingBox: { x: 500, y: 450, w: 280, h: 80 },
          text: "Alice Brown\nCFO\nalice@smith.com\n(555) 345-6789"
        },

        {
          id: "contact5",
          type: "rectangle",
          boundingBox: { x: 500, y: 540, w: 280, h: 80 },
          text: "Charlie Wilson\nVP Operations\ncharlie@smith.com\n(555) 345-6790"
        },

        // Relationship indicators
        {
          id: "rel1",
          type: "rectangle",
          boundingBox: { x: 410, y: 200, w: 80, h: 30 },
          text: "1:Many"
        },

        {
          id: "rel2",
          type: "rectangle",
          boundingBox: { x: 410, y: 380, w: 80, h: 30 },
          text: "1:Many"
        },

        {
          id: "rel3",
          type: "rectangle",
          boundingBox: { x: 410, y: 520, w: 80, h: 30 },
          text: "1:Many"
        },

        // Additional context boxes
        {
          id: "account_fields",
          type: "rectangle",
          boundingBox: { x: 100, y: 620, w: 300, h: 150 },
          text: "Account Fields\n━━━━━━━━━━━━\n• Id (Unique Identifier)\n• Name (Company Name)\n• Type (Customer/Prospect)\n• Industry\n• AnnualRevenue\n• NumberOfEmployees\n• BillingAddress\n• ShippingAddress"
        },

        {
          id: "contact_fields",
          type: "rectangle",
          boundingBox: { x: 500, y: 620, w: 300, h: 150 },
          text: "Contact Fields\n━━━━━━━━━━━━\n• Id (Unique Identifier)\n• AccountId (Lookup)\n• FirstName\n• LastName\n• Email\n• Phone\n• Title\n• Department"
        },

        // Relationship explanation
        {
          id: "relationship_explanation",
          type: "rectangle",
          boundingBox: { x: 200, y: 800, w: 500, h: 100 },
          text: "Relationship Type: Master-Detail / Lookup\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n• One Account can have many Contacts\n• Each Contact must be associated with one Account\n• Deleting an Account can cascade delete its Contacts (if Master-Detail)"
        },

        // Statistics box
        {
          id: "stats",
          type: "rectangle",
          boundingBox: { x: 850, y: 180, w: 200, h: 120 },
          text: "Org Statistics\n━━━━━━━━━━\nAccounts: 1,250\nContacts: 5,432\nAvg Contacts/Account: 4.3\nActive Users: 125"
        },

        // Best practices box
        {
          id: "best_practices",
          type: "rectangle",
          boundingBox: { x: 850, y: 320, w: 200, h: 200 },
          text: "Best Practices\n━━━━━━━━━━\n• Always populate\n  AccountId on Contact\n• Use record types for\n  different business\n  segments\n• Implement duplicate\n  rules\n• Set field-level\n  security appropriately"
        },

        // Common operations
        {
          id: "operations",
          type: "rectangle",
          boundingBox: { x: 850, y: 540, w: 200, h: 180 },
          text: "Common Operations\n━━━━━━━━━━━━━\n• Lead conversion\n  creates both\n• Mass import via\n  Data Loader\n• Merge duplicates\n• Territory assignment\n• Campaign association"
        }
      ]
    }]
  };
}

async function main() {
  console.log('🚀 Creating Salesforce Accounts & Contacts Diagram');
  console.log('=' .repeat(70));

  try {
    // Step 1: Create document.json
    console.log('\n📝 Creating document.json...');
    const documentJson = createAccountsContactsDocument();
    const tempDir = `require('os').tmpdir())}`;
    await fs.mkdir(tempDir, { recursive: true });

    const documentPath = path.join(tempDir, 'document.json');
    await fs.writeFile(documentPath, JSON.stringify(documentJson, null, 2));
    console.log(`   ✓ Created document with ${documentJson.pages[0].shapes.length} shapes`);

    // Step 2: Create ZIP file
    console.log('\n📦 Creating .lucid ZIP file...');
    const zipPath = path.join(tempDir, 'import.lucid');
    execSync(`cd ${tempDir} && zip -q import.lucid document.json`);
    const stats = await fs.stat(zipPath);
    console.log(`   ✓ Created import.lucid (${stats.size} bytes)`);

    // Step 3: Upload to Lucid
    console.log('\n📤 Uploading to Lucid API...');
    const curlCommand = `curl -X POST '${LUCID_API_BASE_URL}/documents' \
      -H 'Authorization: Bearer ${LUCID_API_TOKEN}' \
      -H 'Lucid-Api-Version: 1' \
      -F 'file=@${zipPath};type=x-application/vnd.lucid.standardImport' \
      -F 'product=lucidchart' \
      -F 'title=Salesforce Accounts & Contacts - ${new Date().toISOString()}' \
      --silent --show-error`;

    const result = execSync(curlCommand, { encoding: 'utf8' });
    const response = JSON.parse(result);

    // Step 4: Display results
    console.log('\n✅ SUCCESS! Created Accounts & Contacts diagram:');
    console.log(`   Document ID: ${response.documentId}`);
    console.log(`   Title: ${response.title}`);
    console.log(`   Edit URL: ${response.editUrl}`);
    console.log(`   View URL: ${response.viewUrl}`);

    console.log('\n📊 Diagram Contents:');
    console.log('   • 3 Account records (Acme, Global Tech, Smith Enterprises)');
    console.log('   • 5 Contact records linked to accounts');
    console.log('   • Field definitions for both objects');
    console.log('   • Relationship explanation (1:Many)');
    console.log('   • Best practices and common operations');
    console.log('   • Org statistics');

    // Save proof
    const proofPath = path.join(__dirname, '../accounts-contacts-diagram-proof.json');
    await fs.writeFile(proofPath, JSON.stringify(response, null, 2));
    console.log(`\n📄 Proof saved to: ${proofPath}`);

    console.log('\n🔗 Click here to view your diagram:');
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