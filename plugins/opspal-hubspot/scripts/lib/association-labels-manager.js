#!/usr/bin/env node
/**
 * HubSpot Association Labels Manager (v4 Schema API)
 *
 * Manages custom association labels via the v4 associations schema API.
 * Labels allow typed relationships like "Decision Maker", "Billing Contact",
 * "Primary Partner", etc.
 *
 * Endpoints:
 *   GET    /crm/v4/associations/{from}/{to}/labels     - List labels
 *   POST   /crm/v4/associations/{from}/{to}/labels     - Create label
 *   DELETE /crm/v4/associations/{from}/{to}/labels/{id} - Delete label
 *   PUT    /crm/v4/associations/{from}/{to}/batch/create - Create labeled association
 *
 * @version 1.0.0
 * @created 2026-03-09
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

class AssociationLabelsManager {
  /**
   * @param {string} accessToken - HubSpot access token
   * @param {Object} [options]
   * @param {boolean} [options.verbose=false]
   */
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('AssociationLabelsManager requires accessToken');
    }
    this.accessToken = accessToken;
    this.verbose = options.verbose || false;
  }

  /**
   * List all association labels between two object types.
   *
   * @param {string} fromObjectType - e.g. 'contacts'
   * @param {string} toObjectType - e.g. 'companies'
   * @returns {Promise<Array>} Array of label definitions
   */
  async listLabels(fromObjectType, toObjectType) {
    const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`;

    const response = await this._request('GET', url);
    const data = await response.json();

    if (this.verbose) {
      console.log(`[AssociationLabels] Found ${data.results?.length || 0} labels for ${fromObjectType} → ${toObjectType}`);
    }

    return data.results || [];
  }

  /**
   * Create a custom association label.
   *
   * @param {string} fromObjectType
   * @param {string} toObjectType
   * @param {Object} labelConfig
   * @param {string} labelConfig.name - Label name (e.g. "Decision Maker")
   * @param {string} [labelConfig.inverseLabel] - Inverse label name (e.g. "Decision Maker of")
   * @returns {Promise<Object>} Created label with typeId
   */
  async createLabel(fromObjectType, toObjectType, labelConfig) {
    if (!labelConfig?.name) {
      throw new Error('createLabel requires labelConfig.name');
    }

    const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`;

    const payload = {
      label: labelConfig.name
    };

    if (labelConfig.inverseLabel) {
      payload.inverseLabel = labelConfig.inverseLabel;
    }

    const response = await this._request('POST', url, payload);
    const result = await response.json();

    if (this.verbose) {
      console.log(`[AssociationLabels] Created label "${labelConfig.name}" (typeId: ${result.results?.[0]?.typeId})`);
    }

    return result;
  }

  /**
   * Delete an association label.
   *
   * @param {string} fromObjectType
   * @param {string} toObjectType
   * @param {number} associationTypeId - The typeId of the label to delete
   * @returns {Promise<void>}
   */
  async deleteLabel(fromObjectType, toObjectType, associationTypeId) {
    const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromObjectType}/${toObjectType}/labels/${associationTypeId}`;

    await this._request('DELETE', url);

    if (this.verbose) {
      console.log(`[AssociationLabels] Deleted label typeId ${associationTypeId} for ${fromObjectType} → ${toObjectType}`);
    }
  }

  /**
   * Create a labeled association between two records.
   *
   * @param {string} fromObjectType
   * @param {string} fromId
   * @param {string} toObjectType
   * @param {string} toId
   * @param {number} associationTypeId - The label's typeId
   * @param {string} [category='USER_DEFINED'] - 'HUBSPOT_DEFINED' or 'USER_DEFINED'
   * @returns {Promise<Object>}
   */
  async createLabeledAssociation(fromObjectType, fromId, toObjectType, toId, associationTypeId, category = 'USER_DEFINED') {
    const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/create`;

    const payload = {
      inputs: [{
        from: { id: String(fromId) },
        to: { id: String(toId) },
        types: [{
          associationCategory: category,
          associationTypeId: associationTypeId
        }]
      }]
    };

    const response = await this._request('POST', url, payload);
    const result = await response.json();

    if (this.verbose) {
      console.log(`[AssociationLabels] Created labeled association ${fromId} → ${toId} (typeId: ${associationTypeId})`);
    }

    return result;
  }

  /**
   * Create multiple labeled associations in batch.
   *
   * @param {string} fromObjectType
   * @param {string} toObjectType
   * @param {Array<Object>} associations - Array of { fromId, toId, associationTypeId, category }
   * @returns {Promise<Object>}
   */
  async batchCreateLabeledAssociations(fromObjectType, toObjectType, associations) {
    const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/create`;

    const payload = {
      inputs: associations.map(assoc => ({
        from: { id: String(assoc.fromId) },
        to: { id: String(assoc.toId) },
        types: [{
          associationCategory: assoc.category || 'USER_DEFINED',
          associationTypeId: assoc.associationTypeId
        }]
      }))
    };

    const response = await this._request('POST', url, payload);
    const result = await response.json();

    if (this.verbose) {
      console.log(`[AssociationLabels] Batch created ${associations.length} labeled associations`);
    }

    return result;
  }

  /**
   * Internal: Make authenticated request to HubSpot API.
   */
  async _request(method, url, body) {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok && method !== 'DELETE') {
      const errorBody = await response.text();
      throw new Error(`AssociationLabelsManager ${method} ${url}: HTTP ${response.status} - ${errorBody}`);
    }

    return response;
  }
}

module.exports = AssociationLabelsManager;

// CLI usage
if (require.main === module) {
  console.log(`
AssociationLabelsManager - Manage HubSpot v4 Association Labels

Custom labels enable typed relationships:
  - "Decision Maker" (contact → company)
  - "Billing Contact" (contact → company)
  - "Primary Partner" (company → company)

Usage:
  const manager = new AssociationLabelsManager(accessToken);

  // List existing labels
  const labels = await manager.listLabels('contacts', 'companies');

  // Create a custom label
  await manager.createLabel('contacts', 'companies', {
    name: 'Decision Maker',
    inverseLabel: 'Decision Maker of'
  });

  // Create a labeled association
  await manager.createLabeledAssociation(
    'contacts', '123',
    'companies', '456',
    labelTypeId, 'USER_DEFINED'
  );

  // Batch create labeled associations
  await manager.batchCreateLabeledAssociations('contacts', 'companies', [
    { fromId: '123', toId: '456', associationTypeId: labelTypeId },
    { fromId: '789', toId: '456', associationTypeId: labelTypeId }
  ]);
`);
}
