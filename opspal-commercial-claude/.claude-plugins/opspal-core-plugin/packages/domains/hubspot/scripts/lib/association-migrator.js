/**
 * Association Migrator
 * Reusable module for moving HubSpot associations between companies
 */

const https = require('https');

class AssociationMigrator {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.associationTypes = { contacts: 1, deals: 6, tickets: 26 };
  }

  async migrateAll(fromCompanyId, toCompanyId) {
    const results = { contacts: [], deals: [], tickets: [], errors: [] };
    
    for (const [type, typeId] of Object.entries(this.associationTypes)) {
      const associations = await this.getAssociations(fromCompanyId, type);
      for (const assoc of associations) {
        const success = await this.createAssociation(toCompanyId, assoc.toObjectId, type, typeId);
        if (success) {
          results[type].push(assoc.toObjectId);
        } else {
          results.errors.push({ type, objectId: assoc.toObjectId });
        }
        await this.delay(100);
      }
    }
    
    return results;
  }

  async getAssociations(companyId, objectType) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.hubapi.com',
        path: '/crm/v4/objects/companies/' + companyId + '/associations/' + objectType,
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + this.apiKey }
      };
      
      https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data).results || []);
          } else {
            resolve([]);
          }
        });
      }).on('error', () => resolve([])).end();
    });
  }

  async createAssociation(companyId, objectId, objectType, typeId) {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.hubapi.com',
        path: '/crm/v3/objects/companies/' + companyId + '/associations/' + objectType + '/' + objectId + '/' + typeId,
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + this.apiKey }
      };
      
      https.request(options, (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 409);
      }).on('error', () => resolve(false)).end();
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AssociationMigrator;
