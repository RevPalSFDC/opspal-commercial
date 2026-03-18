#!/usr/bin/env node
/**
 * HubSpot Workflow v3→v4 Migration Helper
 *
 * Maps legacy v3 workflow IDs to modern v4 flow IDs using the
 * POST /automation/v4/workflow-id-mappings/batch/read endpoint.
 *
 * Use during assessment/migration projects to inventory legacy
 * workflows and build migration plans.
 *
 * @version 1.0.0
 * @created 2026-03-09
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

class WorkflowMigrationHelper {
  /**
   * @param {string} accessToken - HubSpot access token
   * @param {Object} [options]
   * @param {boolean} [options.verbose=false]
   */
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('WorkflowMigrationHelper requires accessToken');
    }
    this.accessToken = accessToken;
    this.verbose = options.verbose || false;
  }

  /**
   * Map legacy v3 workflow IDs to v4 flow IDs.
   *
   * @param {Array<number>} legacyIds - Array of v3 workflow IDs
   * @returns {Promise<Object>} Mapping result { mappings: [{v3Id, v4Id}], unmapped: [...] }
   */
  async mapWorkflowIds(legacyIds) {
    if (!legacyIds || legacyIds.length === 0) {
      return { mappings: [], unmapped: [] };
    }

    const url = `${HUBSPOT_API_BASE}/automation/v4/workflow-id-mappings/batch/read`;

    const payload = {
      inputs: legacyIds.map(id => ({ legacyWorkflowId: String(id) }))
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to map workflow IDs: HTTP ${response.status} - ${body}`);
    }

    const data = await response.json();

    const mappings = [];
    const unmapped = [];

    if (data.results) {
      for (const result of data.results) {
        if (result.flowId) {
          mappings.push({
            v3Id: result.legacyWorkflowId,
            v4Id: result.flowId
          });
        } else {
          unmapped.push(result.legacyWorkflowId);
        }
      }
    }

    if (this.verbose) {
      console.log(`[WorkflowMigration] Mapped ${mappings.length}/${legacyIds.length} workflows (${unmapped.length} unmapped)`);
    }

    return { mappings, unmapped };
  }

  /**
   * Build a migration inventory: list all v4 flows and attempt to map
   * any that may have v3 origins.
   *
   * @returns {Promise<Object>} Inventory with v4 flows and migration status
   */
  async buildMigrationInventory() {
    // GET all v4 flows
    const url = `${HUBSPOT_API_BASE}/automation/v4/flows`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to list flows: HTTP ${response.status} - ${body}`);
    }

    const data = await response.json();
    const flows = data.results || [];

    const inventory = {
      totalFlows: flows.length,
      flows: flows.map(flow => ({
        id: flow.id,
        name: flow.name,
        type: flow.type,
        enabled: flow.enabled,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt
      })),
      generatedAt: new Date().toISOString()
    };

    if (this.verbose) {
      console.log(`[WorkflowMigration] Found ${flows.length} v4 flows`);
    }

    return inventory;
  }
}

module.exports = WorkflowMigrationHelper;

// CLI usage
if (require.main === module) {
  console.log(`
WorkflowMigrationHelper - Map v3 workflow IDs to v4 flow IDs

Endpoint: POST /automation/v4/workflow-id-mappings/batch/read

Usage:
  const helper = new WorkflowMigrationHelper(accessToken);

  // Map specific v3 IDs to v4
  const { mappings, unmapped } = await helper.mapWorkflowIds([12345, 67890]);

  // Build full migration inventory
  const inventory = await helper.buildMigrationInventory();
`);
}
