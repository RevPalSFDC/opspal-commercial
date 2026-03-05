const LucidDocumentFactory = require('./lib/lucid-document-factory');
const axios = require('axios');

const TENANT_ID = 'revpal-test';
const LUCID_API_VERSION = 'v1'; // Simplified version

const lucidApi = axios.create({
  baseURL: process.env.LUCID_API_BASE_URL || 'https://api.lucid.co',
  headers: {
    'Authorization': `Bearer ${process.env.LUCID_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Lucid-Api-Version': LUCID_API_VERSION
  }
});

const documentFactory = new LucidDocumentFactory(lucidApi, {
  tenantId: TENANT_ID
});

async function createTestDiagrams() {
  const accounts = [
    { id: '001D000000ABC123', name: 'Acme Corporation', type: 'Technology' },
    { id: '001D000000ABC124', name: 'Global Innovations Inc', type: 'Manufacturing' }
  ];

  const contacts = [
    { id: '003D000000XYZ456', name: 'Sarah Johnson', account: 'Acme Corporation', title: 'VP Engineering' },
    { id: '003D000000XYZ457', name: 'Michael Chen', account: 'Global Innovations Inc', title: 'Director Operations' }
  ];

  const opportunities = [
    { id: '006D000000OPP789', name: 'Enterprise Platform Upgrade', account: 'Acme Corporation', amount: 250000, expectedCloseDate: '2025-03-31' },
    { id: '006D000000OPP790', name: 'Digital Transformation', account: 'Global Innovations Inc', amount: 500000, expectedCloseDate: '2025-06-30' }
  ];

  const diagramTypes = {
    Account: ['sf-org-architecture', 'data-architecture', 'erd-standard', 'basic-diagram'],
    Contact: ['org-chart', 'security-architecture', 'territory-model', 'basic-diagram'],
    Opportunity: ['sales-process', 'territory-model', 'cpq-architecture', 'basic-diagram']
  };

  const results = [];

  for (const account of accounts) {
    for (const type of diagramTypes.Account) {
      try {
        const result = await documentFactory.createFromTemplate({
          tenantId: TENANT_ID,
          sfRecordId: account.id,
          sfObject: 'Account',
          recordName: account.name,
          diagramType: type
        });
        results.push(result);
      } catch (error) {
        if (error.error === 'TEMPLATE_NOT_FOUND') {
          console.warn(`Fallback to basic-diagram for ${account.name} (${type})`);
          try {
            const result = await documentFactory.createFromTemplate({
              tenantId: TENANT_ID,
              sfRecordId: account.id,
              sfObject: 'Account',
              recordName: account.name,
              diagramType: 'basic-diagram'
            });
            results.push(result);
          } catch (fallbackError) {
            console.error(`Fallback failed for ${account.name}:`, fallbackError);
          }
        } else {
          console.error(`Failed creating Account diagram for ${account.name} (${type}):`, error);
        }
      }
    }
  }

  for (const contact of contacts) {
    for (const type of diagramTypes.Contact) {
      try {
        const result = await documentFactory.createFromTemplate({
          tenantId: TENANT_ID,
          sfRecordId: contact.id,
          sfObject: 'Contact',
          recordName: contact.name,
          diagramType: type
        });
        results.push(result);
      } catch (error) {
        if (error.error === 'TEMPLATE_NOT_FOUND') {
          console.warn(`Fallback to basic-diagram for ${contact.name} (${type})`);
          try {
            const result = await documentFactory.createFromTemplate({
              tenantId: TENANT_ID,
              sfRecordId: contact.id,
              sfObject: 'Contact',
              recordName: contact.name,
              diagramType: 'basic-diagram'
            });
            results.push(result);
          } catch (fallbackError) {
            console.error(`Fallback failed for ${contact.name}:`, fallbackError);
          }
        } else {
          console.error(`Failed creating Contact diagram for ${contact.name} (${type}):`, error);
        }
      }
    }
  }

  for (const opp of opportunities) {
    for (const type of diagramTypes.Opportunity) {
      try {
        const result = await documentFactory.createFromTemplate({
          tenantId: TENANT_ID,
          sfRecordId: opp.id,
          sfObject: 'Opportunity',
          recordName: opp.name,
          diagramType: type
        });
        results.push(result);
      } catch (error) {
        if (error.error === 'TEMPLATE_NOT_FOUND') {
          console.warn(`Fallback to basic-diagram for ${opp.name} (${type})`);
          try {
            const result = await documentFactory.createFromTemplate({
              tenantId: TENANT_ID,
              sfRecordId: opp.id,
              sfObject: 'Opportunity',
              recordName: opp.name,
              diagramType: 'basic-diagram'
            });
            results.push(result);
          } catch (fallbackError) {
            console.error(`Fallback failed for ${opp.name}:`, fallbackError);
          }
        } else {
          console.error(`Failed creating Opportunity diagram for ${opp.name} (${type}):`, error);
        }
      }
    }
  }

  return results;
}

createTestDiagrams()
  .then(results => {
    console.log('Diagram Creation Results:');
    results.forEach(result => {
      console.log('---');
      console.log('Tenant ID:', result.tenantId);
      console.log('SF Record ID:', result.sfRecordId);
      console.log('Diagram Type:', result.result.documents[0]?.diagramType);
      console.log('Diagram URL:', result.result.documents[0]?.viewUrl);
    });
  })
  .catch(error => {
    console.error('Diagram creation failed:', error);
  });