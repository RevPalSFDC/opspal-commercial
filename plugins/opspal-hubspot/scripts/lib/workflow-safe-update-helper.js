#!/usr/bin/env node
/**
 * HubSpot Workflow Safe Update Helper
 *
 * Prevents concurrent workflow overwrites by enforcing revisionId-based updates.
 * HubSpot's workflow PUT endpoint uses full-replace semantics — omitted actions
 * are REMOVED. This helper ensures safe read-modify-write cycles.
 *
 * Pattern:
 *   1. GET current flow (captures revisionId)
 *   2. Sanitize response (strip system-managed fields)
 *   3. Apply modifications to the full payload
 *   4. PUT with revisionId included
 *
 * Also provides workflow cloning (GET → sanitize → POST).
 *
 * @version 1.0.0
 * @created 2026-03-09
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * System-managed fields that must be stripped before PUT or clone POST.
 * Including these in a PUT payload causes 400 errors.
 */
const SYSTEM_FIELDS_TO_STRIP = [
  'id',
  'createdAt',
  'updatedAt',
  'dataSources',
  'portalId',
  'insertedAt',
  'updatedBy',
  'createdBy'
];

/**
 * Fields that must be stripped only for clone operations (not updates).
 */
const CLONE_ONLY_STRIP_FIELDS = [
  'revisionId'
];

class WorkflowSafeUpdateHelper {
  /**
   * @param {string} accessToken - HubSpot access token
   * @param {Object} [options]
   * @param {boolean} [options.verbose=false]
   */
  constructor(accessToken, options = {}) {
    if (!accessToken) {
      throw new Error('WorkflowSafeUpdateHelper requires accessToken');
    }
    this.accessToken = accessToken;
    this.verbose = options.verbose || false;
  }

  /**
   * GET a flow and return it with its revisionId for safe updating.
   *
   * @param {string} flowId - The workflow/flow ID
   * @returns {Promise<{flow: Object, revisionId: string}>}
   */
  async getFlowWithRevision(flowId) {
    const url = `${HUBSPOT_API_BASE}/automation/v4/flows/${flowId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to GET flow ${flowId}: HTTP ${response.status} - ${body}`);
    }

    const flow = await response.json();
    const revisionId = flow.revisionId;

    if (!revisionId) {
      throw new Error(`Flow ${flowId} response missing revisionId — cannot safely update`);
    }

    if (this.verbose) {
      console.log(`[WorkflowSafeUpdate] GET flow ${flowId}, revisionId: ${revisionId}`);
    }

    return { flow, revisionId };
  }

  /**
   * Strip system-managed fields from a flow JSON for use in PUT payloads.
   * Preserves revisionId (needed for updates) and type (required field).
   *
   * @param {Object} flowJson - Raw flow from GET response
   * @returns {Object} Sanitized flow suitable for PUT
   */
  sanitizeFlowForUpdate(flowJson) {
    const sanitized = { ...flowJson };

    for (const field of SYSTEM_FIELDS_TO_STRIP) {
      delete sanitized[field];
    }

    // revisionId and type MUST remain for updates
    if (!sanitized.revisionId) {
      throw new Error('sanitizeFlowForUpdate: revisionId is required but missing');
    }
    if (!sanitized.type) {
      throw new Error('sanitizeFlowForUpdate: type is required but missing');
    }

    return sanitized;
  }

  /**
   * Strip all system fields for cloning (including revisionId).
   *
   * @param {Object} flowJson - Raw flow from GET response
   * @param {string} [newName] - Optional new name for the clone
   * @returns {Object} Sanitized flow suitable for POST (clone)
   */
  sanitizeFlowForClone(flowJson, newName) {
    const sanitized = { ...flowJson };

    for (const field of [...SYSTEM_FIELDS_TO_STRIP, ...CLONE_ONLY_STRIP_FIELDS]) {
      delete sanitized[field];
    }

    if (newName) {
      sanitized.name = newName;
    }

    return sanitized;
  }

  /**
   * Build a safe update payload by merging modifications into the existing flow.
   *
   * WARNING: HubSpot uses full-replace semantics. Any actions not included in the
   * PUT payload will be REMOVED. This method merges your changes into the full
   * existing flow to prevent accidental deletion.
   *
   * @param {Object} existingFlow - Full flow from GET (with revisionId)
   * @param {Object} modifications - Partial changes to apply (shallow merge)
   * @returns {Object} Complete PUT payload with revisionId
   */
  buildUpdatePayload(existingFlow, modifications) {
    // Start with sanitized existing flow
    const payload = this.sanitizeFlowForUpdate(existingFlow);

    // Shallow merge modifications
    for (const [key, value] of Object.entries(modifications)) {
      if (SYSTEM_FIELDS_TO_STRIP.includes(key)) {
        if (this.verbose) {
          console.log(`[WorkflowSafeUpdate] Skipping system field in modifications: ${key}`);
        }
        continue;
      }
      payload[key] = value;
    }

    return payload;
  }

  /**
   * Execute a safe update: GET → sanitize → merge → PUT.
   *
   * @param {string} flowId - The workflow/flow ID
   * @param {Object} modifications - Changes to apply
   * @returns {Promise<Object>} Updated flow response
   */
  async safeUpdate(flowId, modifications) {
    // Step 1: GET current flow with revisionId
    const { flow } = await this.getFlowWithRevision(flowId);

    // Step 2: Build safe update payload
    const payload = this.buildUpdatePayload(flow, modifications);

    if (this.verbose) {
      console.log(`[WorkflowSafeUpdate] PUT flow ${flowId} with revisionId: ${payload.revisionId}`);
    }

    // Step 3: PUT with full payload
    const url = `${HUBSPOT_API_BASE}/automation/v4/flows/${flowId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to PUT flow ${flowId}: HTTP ${response.status} - ${body}`);
    }

    const result = await response.json();

    if (this.verbose) {
      console.log(`[WorkflowSafeUpdate] Successfully updated flow ${flowId}, new revisionId: ${result.revisionId}`);
    }

    return result;
  }

  /**
   * Clone a workflow: GET → strip system fields → POST with new name.
   *
   * HubSpot has no native clone endpoint, so this implements the
   * recommended GET→sanitize→POST pattern.
   *
   * @param {string} sourceFlowId - Flow ID to clone
   * @param {string} newName - Name for the cloned workflow
   * @returns {Promise<Object>} Newly created flow
   */
  async cloneFlow(sourceFlowId, newName) {
    if (!newName) {
      throw new Error('cloneFlow requires a newName for the cloned workflow');
    }

    // Step 1: GET source flow
    const { flow } = await this.getFlowWithRevision(sourceFlowId);

    // Step 2: Sanitize for clone (strip all system fields including revisionId)
    const clonePayload = this.sanitizeFlowForClone(flow, newName);

    if (this.verbose) {
      console.log(`[WorkflowSafeUpdate] Cloning flow ${sourceFlowId} as "${newName}"`);
    }

    // Step 3: POST to create new flow
    const url = `${HUBSPOT_API_BASE}/automation/v4/flows`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(clonePayload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to clone flow ${sourceFlowId}: HTTP ${response.status} - ${body}`);
    }

    const result = await response.json();

    if (this.verbose) {
      console.log(`[WorkflowSafeUpdate] Cloned flow ${sourceFlowId} → ${result.id} ("${newName}")`);
    }

    return result;
  }
}

module.exports = WorkflowSafeUpdateHelper;

// CLI usage
if (require.main === module) {
  console.log(`
WorkflowSafeUpdateHelper - Prevent concurrent workflow overwrites

Pattern: GET (capture revisionId) → Sanitize → Modify → PUT (with revisionId)

Usage:
  const helper = new WorkflowSafeUpdateHelper(accessToken);

  // Safe update
  const result = await helper.safeUpdate(flowId, { name: 'New Name' });

  // Clone workflow
  const clone = await helper.cloneFlow(sourceFlowId, 'Cloned Workflow');

  // Manual control
  const { flow, revisionId } = await helper.getFlowWithRevision(flowId);
  const payload = helper.buildUpdatePayload(flow, modifications);

CRITICAL: HubSpot uses full-replace semantics on PUT.
  - Omitted actions are REMOVED
  - Always GET full flow before updating
  - Always include revisionId in PUT payload
  - Always include type field
  - Strip: createdAt, updatedAt, dataSources, portalId, insertedAt
`);
}
